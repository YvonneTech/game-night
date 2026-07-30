import { DurableObject } from "cloudflare:workers";

type Game = "classic" | "passthepen" | "yarnpals" | "undercover";
type Lang = "en" | "zh";
type UCRole = "civ" | "spy";
type GameMode = "pictionary" | "charades" | "mixed";
type RoundMode = "pictionary" | "charades";
type Phase = "lobby" | "choosing" | "playing" | "roundEnd" | "gameEnd" | "teams";

type Player = {
  id: string;
  name: string;
  color: string;
  score: number;
  host: boolean;
  connected: boolean;
  guessed: boolean;
  roundPoints: number;
  guessRank?: number;
};

type Stroke = {
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
};

type Round = {
  number: number;
  total: 1 | 5 | 10 | 15;
  mode: RoundMode;
  performerId: string;
  word: string;
  category?: string;
  options?: string[];
  startedAt: number;
  durationSeconds: number;
  hints: number;
  correctIds: string[];
  ended: boolean;
  // Pass the Pen relay fields
  drawOrder?: string[];
  turnIndex?: number;
  turnStartedAt?: number;
  turnSeconds?: number;
  turnStrokeStart?: number;
  guessWindow?: boolean;
};

type Message = {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  at: number;
  system?: boolean;
  correct?: boolean;
};

type YarnSlot = { id: string; name: string; team: 0 | 1; bot: boolean; color: string };
type YarnState = { startsAt: number; durationSeconds: number; teams: YarnSlot[] };

type UCMember = { id: string; role: UCRole; word: string; alive: boolean };
type UndercoverState = {
  sub: "describe" | "vote" | "reveal";
  round: number;
  spyCount: number;
  members: UCMember[];
  order: string[];
  turnIndex: number;
  descriptions: Array<{ playerId: string; playerName: string; text: string }>;
  votes: Record<string, string>;
  candidates: string[]; // non-empty during a tie runoff: only these are votable, and they can't vote
  eliminated: { id: string; name: string; role: UCRole; word: string } | null;
  result: UCRole | null;
};

type RoomState = {
  code: string;
  phase: Phase;
  players: Player[];
  game: Game;
  lang: Lang;
  mode: GameMode;
  rounds: 1 | 5 | 10 | 15;
  round: Round | null;
  yarn: YarnState | null;
  undercover: UndercoverState | null;
  solved: number;
  messages: Message[];
  strokes: Stroke[];
  emptyAt: number;
  createdAt: number;
  updatedAt: number;
};

type Session = { playerId: string };
type ClientCommand = { type: string; payload?: unknown };
type RelaySlot = { id: string; name: string; color: string };
type RelaySnapshot = {
  order: RelaySlot[];
  currentId: string;
  nextId: string | null;
  turnTimeLeft: number;
  turnSeconds: number;
};
type UCMemberView = { id: string; name: string; alive: boolean; connected: boolean; voted: boolean };
type UCView = {
  sub: "describe" | "vote" | "reveal";
  round: number;
  spyCount: number;
  myRole: UCRole | null;
  myWord: string;
  alive: boolean;
  youSpeak: boolean;
  youVote: boolean;
  hasVoted: boolean;
  currentId: string;
  currentName: string;
  candidates: string[];
  members: UCMemberView[];
  descriptions: Array<{ playerId: string; playerName: string; text: string }>;
  eliminated: { name: string; role: UCRole } | null;
  result: UCRole | null;
  reveal: Array<{ name: string; role: UCRole; word: string }> | null;
};
type Snapshot = Omit<RoomState, "undercover"> & {
  undercover: UCView | null;
  timeLeft: number;
  hiddenWord: string;
  wordLength: number;
  isPerformer: boolean;
  seeWord: boolean;
  youDraw: boolean;
  youGuess: boolean;
  relay: RelaySnapshot | null;
};

const ROUND_SECONDS = 60;
const HINT_COUNT_AT_SECONDS = 20; // reveal the word length after this long
const HINT_CATEGORY_AT_SECONDS = 40; // reveal the category after this long
const TURN_SECONDS = 12;
const FINAL_GUESS_SECONDS = 30;
const MAX_PLAYERS = 6;
const MAX_MESSAGES = 100;
const SCORE_BY_RANK = [100, 80, 60, 40, 20];
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000; // recycle a room 10 min after everyone leaves

type WordBank = { en: Record<string, string[]>; zh: Record<string, string[]> };
type PhraseBank = { en: string[]; zh: string[] };

const PICTIONARY_WORDS: WordBank = {
  en: {
    Animal: ["cat", "dog", "penguin", "butterfly", "snail", "elephant", "panda", "dinosaur", "owl", "shark", "jellyfish"],
    Food: ["apple", "birthday cake", "cupcake", "hamburger", "ice cream", "pumpkin"],
    Nature: ["sun", "moon", "tree", "waterfall", "volcano", "rainbow", "mountain", "tornado", "snowflake", "spider web", "rainstorm", "cactus"],
    Object: ["guitar", "clock", "umbrella", "key", "anchor", "kite", "ladder", "mailbox", "piano", "trophy", "traffic light", "telescope", "snow globe", "treasure map", "skateboard", "suitcase", "camera", "scarecrow"],
    Place: ["house", "igloo", "castle", "beach", "lighthouse", "treehouse", "greenhouse", "windmill", "roller coaster", "carousel", "sandcastle"],
    Vehicle: ["rocket", "submarine", "spaceship", "hot air balloon", "fire truck", "yacht", "bicycle"],
    Fantasy: ["dragon", "ghost", "mermaid", "robot", "unicorn", "wizard hat"],
  },
  zh: {
    动物: ["猫", "狗", "企鹅", "蝴蝶", "蜗牛", "大象", "熊猫", "恐龙", "猫头鹰", "鲨鱼", "水母"],
    食物: ["苹果", "生日蛋糕", "纸杯蛋糕", "汉堡", "冰淇淋", "南瓜"],
    自然: ["太阳", "月亮", "树", "瀑布", "火山", "彩虹", "高山", "龙卷风", "雪花", "蜘蛛网", "暴风雨", "仙人掌"],
    物品: ["吉他", "时钟", "雨伞", "钥匙", "船锚", "风筝", "梯子", "邮箱", "钢琴", "奖杯", "红绿灯", "望远镜", "雪花玻璃球", "藏宝图", "滑板", "行李箱", "照相机", "稻草人"],
    地点: ["房子", "冰屋", "城堡", "沙滩", "灯塔", "树屋", "温室", "风车", "过山车", "旋转木马", "沙堡", "长城"],
    交通: ["火箭", "潜水艇", "飞船", "热气球", "消防车", "游艇", "自行车"],
    奇幻: ["龙", "幽灵", "美人鱼", "机器人", "独角兽", "巫师帽"],
  },
};

const CHARADES_WORDS: WordBank = {
  en: {
    Everyday: ["brushing teeth", "tying shoelaces", "blowing out candles", "sneezing", "putting on makeup", "washing a window", "opening a stuck jar", "baking cookies", "making pizza dough", "taking a selfie", "flipping a pancake"],
    Sports: ["ice skating", "playing basketball", "surfing a wave", "bowling", "playing tennis", "jumping rope", "boxing", "scuba diving", "climbing a mountain"],
    Talent: ["playing air guitar", "doing a magic trick", "juggling fruit", "conducting an orchestra", "dancing ballet", "shooting an arrow", "painting a wall"],
    Outdoors: ["walking a dog", "riding a horse", "flying a kite", "fishing", "building a tent", "chopping wood", "milking a cow", "rowing a boat", "catching a butterfly", "directing traffic", "climbing a ladder", "sneaking past a guard", "walking through a spiderweb", "landing on the moon", "escaping quicksand", "doing yoga", "fixing a robot", "finding a hidden key"],
  },
  zh: {
    日常: ["刷牙", "系鞋带", "吹蜡烛", "打喷嚏", "化妆", "擦窗户", "打开卡住的罐子", "烤饼干", "揉披萨面团", "自拍", "翻煎饼"],
    运动: ["滑冰", "打篮球", "冲浪", "打保龄球", "打网球", "跳绳", "打拳击", "深海潜水", "爬山"],
    才艺: ["弹空气吉他", "变魔术", "杂耍水果", "指挥乐队", "跳芭蕾", "射箭", "刷墙"],
    户外: ["遛狗", "骑马", "放风筝", "钓鱼", "搭帐篷", "劈柴", "挤牛奶", "划船", "抓蝴蝶", "指挥交通", "爬梯子", "溜过警卫", "穿过蜘蛛网", "登上月球", "从流沙里逃脱", "做瑜伽", "修理机器人", "找到隐藏的钥匙"],
  },
};

// Short, drawable scenes for the relay drawing game.
const PASS_THE_PEN_PHRASES: PhraseBank = {
  en: [
    "a cat riding a skateboard", "sunset over the mountains", "a robot eating pizza",
    "an astronaut walking a dog", "a haunted house on a hill", "a dragon breathing fire",
    "a penguin on a surfboard", "a wizard casting a spell", "a shark in a swimming pool",
    "a unicorn under a rainbow", "a pirate ship in a storm", "a snowman on the beach",
    "an octopus playing drums", "a hot air balloon race", "a dinosaur birthday party",
    "a ghost driving a car", "a frog wearing a crown", "a rocket landing on the moon",
    "a bear catching a fish", "an alien playing guitar", "a mermaid in a teacup",
    "a monkey stealing bananas", "an owl reading a book", "a whale wearing sunglasses",
    "a cat astronaut in space", "a dog surfing a wave", "a giraffe on a bicycle",
    "a snowman melting in summer", "a fairy painting a rainbow", "a knight fighting a snail",
    "a panda eating ice cream", "a cactus wearing a hat", "a turtle winning a race",
    "a ninja in a library", "a vampire at the beach", "a duck driving a bus",
    "a robot walking a dinosaur", "a chef juggling tomatoes", "a kangaroo boxing a robot",
    "a lion getting a haircut",
  ],
  zh: [
    "一只猫在滑滑板", "山顶的日落", "机器人在吃披萨", "宇航员在遛狗", "山上的鬼屋",
    "喷火的龙", "冲浪的企鹅", "施法的巫师", "泳池里的鲨鱼", "彩虹下的独角兽",
    "暴风雨中的海盗船", "沙滩上的雪人", "打鼓的章鱼", "热气球比赛", "恐龙的生日派对",
    "开车的幽灵", "戴皇冠的青蛙", "登月的火箭", "抓鱼的熊", "弹吉他的外星人",
    "茶杯里的美人鱼", "偷香蕉的猴子", "看书的猫头鹰", "戴墨镜的鲸鱼", "太空里的猫宇航员",
    "冲浪的狗", "骑自行车的长颈鹿", "夏天融化的雪人", "画彩虹的仙女", "和蜗牛决斗的骑士",
    "吃冰淇淋的熊猫", "戴帽子的仙人掌", "跑赢比赛的乌龟", "图书馆里的忍者", "沙滩上的吸血鬼",
    "开公交车的鸭子", "遛恐龙的机器人", "杂耍番茄的厨师", "和机器人拳击的袋鼠", "理发的狮子",
  ],
};

const YARN_DURATION_SECONDS = 120;
const YARN_COUNTDOWN_MS = 3000;
const YARN_TEAM_SIZE = 3;
const YARN_TEAM_COLORS: [string[], string[]] = [
  ["#FF8FA3", "#FFB3CE", "#FFC2D1"],
  ["#8AC6FF", "#A0D8FF", "#7AB8FF"],
];
const YARN_BOT_NAMES = ["Momo", "Mimi", "Berry", "Bubu", "Nori", "Pud", "Tofu", "Kiki"];

// Undercover: pairs of similar words. One side is the civilians' word, the other the undercover's.
const UNDERCOVER_PAIRS: { en: [string, string][]; zh: [string, string][] } = {
  en: [
    ["cat", "tiger"], ["coffee", "milk tea"], ["apple", "pear"], ["cola", "sprite"],
    ["spider", "crab"], ["dumpling", "bun"], ["sofa", "bed"], ["air conditioner", "fan"],
    ["basketball", "volleyball"], ["doctor", "nurse"], ["police officer", "security guard"],
    ["tomato", "watermelon"], ["cinema", "theater"], ["candle", "light bulb"],
    ["piano", "guitar"], ["bread", "cake"], ["mouse", "hamster"], ["glasses", "sunglasses"],
    ["umbrella", "tent"], ["chocolate", "candy"], ["watch", "alarm clock"], ["plane", "rocket"],
    ["subway", "bus"], ["giraffe", "zebra"], ["hotpot", "barbecue"], ["snowman", "ice sculpture"],
    ["strawberry", "cherry"], ["lion", "leopard"], ["violin", "cello"], ["toothpaste", "face wash"],
  ],
  zh: [
    ["猫", "老虎"], ["咖啡", "奶茶"], ["苹果", "梨"], ["可乐", "雪碧"],
    ["蜘蛛", "螃蟹"], ["饺子", "包子"], ["沙发", "床"], ["空调", "风扇"],
    ["篮球", "排球"], ["医生", "护士"], ["警察", "保安"],
    ["西红柿", "西瓜"], ["电影院", "剧院"], ["蜡烛", "灯泡"],
    ["钢琴", "吉他"], ["面包", "蛋糕"], ["老鼠", "仓鼠"], ["眼镜", "墨镜"],
    ["雨伞", "帐篷"], ["巧克力", "糖果"], ["手表", "闹钟"], ["飞机", "火箭"],
    ["地铁", "公交车"], ["长颈鹿", "斑马"], ["火锅", "烧烤"], ["雪人", "冰雕"],
    ["草莓", "樱桃"], ["狮子", "豹子"], ["小提琴", "大提琴"], ["牙膏", "洗面奶"],
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  return text ? Array.from(text).slice(0, maxLength).join("") : fallback;
}

function asColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#4f7cff";
}

function normalizeGuess(value: string): string {
  // Keep letters (incl. CJK) and digits; drop whitespace and punctuation. Works for EN + 中文.
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function guessesMatch(guess: string, answer: string): boolean {
  return normalizeGuess(guess) === normalizeGuess(answer);
}

function pointsForRank(rank: number): number {
  return SCORE_BY_RANK[rank] ?? 10;
}

function turnSecondsFor(drawers: number): number {
  // Fewer drawers → longer turns; more drawers → shorter turns (~48s of drawing total).
  // 2 drawers → 18s, 3 → 16s, 4 → 12s, 5 → 10s.
  return Math.min(18, Math.max(10, Math.round(48 / Math.max(1, drawers))));
}

function buildHint(word: string, count: number): string {
  let index = 0;
  return Array.from(word)
    .map((char) => {
      if (char === " ") return " ";
      const show = index < count;
      index += 1;
      return show ? char : "_";
    })
    .join("");
}

function normalizeStrokes(value: unknown): Stroke[] | null {
  if (!Array.isArray(value)) return null;
  return value.slice(0, 300).flatMap((item): Stroke[] => {
    if (!isRecord(item) || !Array.isArray(item.points)) return [];
    const color = asColor(item.color);
    const width = typeof item.width === "number" ? Math.min(Math.max(item.width, 1), 30) : 6;
    const points = item.points.slice(0, 800).flatMap((point): Array<{ x: number; y: number }> => {
      if (!isRecord(point) || typeof point.x !== "number" || typeof point.y !== "number") return [];
      return [{ x: point.x, y: point.y }];
    });
    return points.length ? [{ color, width, points }] : [];
  });
}

export class GameRoom extends DurableObject<Env> {
  private sessions = new Map<WebSocket, Session>();
  private hostId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    for (const ws of this.ctx.getWebSockets()) {
      const session = this.readSession(ws);
      if (session) this.sessions.set(ws, session);
    }

    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS state (
          id TEXT PRIMARY KEY,
          body TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return Response.json({ ok: true });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    let command: ClientCommand;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || typeof parsed.type !== "string") return;
      command = { type: parsed.type, payload: parsed.payload };
    } catch {
      this.error(ws, "Invalid message.");
      return;
    }

    switch (command.type) {
      case "join":
        await this.join(ws, command.payload);
        break;
      case "settings":
        await this.settings(ws, command.payload);
        break;
      case "start":
        await this.start(ws);
        break;
      case "choose":
        await this.choose(ws, command.payload);
        break;
      case "draw":
        await this.draw(ws, command.payload);
        break;
      case "guess":
        await this.guess(ws, command.payload);
        break;
      case "pass":
        await this.pass(ws);
        break;
      case "yarnInput":
        this.relayYarnInput(ws, command.payload);
        break;
      case "yarnWorld":
        this.relayYarnWorld(ws, command.payload);
        break;
      case "ucDescribe":
        await this.ucDescribe(ws, command.payload);
        break;
      case "ucVote":
        await this.ucVote(ws, command.payload);
        break;
      case "ucTally":
        await this.ucTally(ws);
        break;
      case "ucProceed":
        await this.ucProceed(ws);
        break;
      case "next":
        await this.next(ws);
        break;
      case "reset":
        await this.reset(ws);
        break;
      case "leave":
        await this.leave(ws);
        break;
      case "kick":
        await this.kick(ws, command.payload);
        break;
      default:
        this.error(ws, "Unknown command.");
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const session = this.session(ws);
    this.sessions.delete(ws);
    if (!session) return;

    const state = this.load();
    const player = state.players.find((item) => item.id === session.playerId);
    if (!player) return;
    player.connected = false;
    this.system(state, `${player.name} disconnected`);

    if (!state.players.some((item) => item.connected)) {
      // Everyone's gone — arm the auto-recycle timer instead of leaving state behind.
      state.emptyAt = Date.now();
      this.save(state);
      await this.ctx.storage.setAlarm(state.emptyAt + EMPTY_ROOM_TTL_MS);
      return;
    }

    this.save(state);
    this.broadcast(state);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
    try {
      ws.close(1011, "socket error");
    } catch {
      // The socket can already be closed.
    }
  }

  async alarm(): Promise<void> {
    const state = this.load();

    // Auto-recycle: if nobody is connected, wipe once the grace period passes.
    if (this.ctx.getWebSockets().length === 0) {
      if (state.emptyAt && Date.now() - state.emptyAt >= EMPTY_ROOM_TTL_MS) {
        this.save(this.empty(state.code));
        await this.ctx.storage.deleteAlarm();
        return;
      }
      const emptyAt = state.emptyAt || Date.now();
      state.emptyAt = emptyAt;
      this.save(state);
      await this.ctx.storage.setAlarm(emptyAt + EMPTY_ROOM_TTL_MS);
      return;
    }

    if (state.game === "yarnpals") {
      // Countdown finished — announce is over, kick off the match.
      if (state.phase === "teams") {
        state.phase = "playing";
        this.save(state);
        await this.ctx.storage.deleteAlarm();
        this.broadcast(state);
      }
      return;
    }

    if (state.phase !== "playing") return;

    if (state.game === "passthepen") {
      const round = state.round;
      if (!round?.turnStartedAt) return;
      if (this.turnTimeLeft(state) <= 0) {
        await this.advanceTurn(state);
      } else {
        await this.schedule(state);
      }
      return;
    }

    if (!state.round?.word) return;

    if (this.timeLeft(state) <= 0) {
      await this.endRound(state);
      return;
    }

    // Re-broadcast so staged hints (length @20s, category @40s) reach the guessers.
    this.save(state);
    this.broadcast(state);
    await this.schedule(state);
  }

  private async join(ws: WebSocket, payload: unknown): Promise<void> {
    if (!isRecord(payload) || !isRecord(payload.player)) return;

    const create = payload.create === true;
    const state = this.load();
    if (!create && state.createdAt === 0) {
      this.error(ws, "Room not found.");
      ws.close(1008, "room not found");
      return;
    }

    const playerId = asText(payload.player.id, crypto.randomUUID(), 80);
    const name = asText(payload.player.name, "Player", 18);
    const color = asColor(payload.player.color);
    const session = { playerId };
    this.sessions.set(ws, session);
    ws.serializeAttachment(session);

    const existing = state.players.find((player) => player.id === playerId);
    if (existing) {
      existing.name = name;
      existing.color = color;
      existing.connected = true;
      this.system(state, `${name} rejoined`);
    } else {
      if (state.phase !== "lobby") {
        this.error(ws, "Game already started.");
        ws.close(1008, "started");
        return;
      }
      if (state.players.length >= MAX_PLAYERS) {
        this.error(ws, "Room is full.");
        ws.close(1008, "full");
        return;
      }
      if (state.createdAt === 0) state.createdAt = Date.now();
      // The creator (first player) picks the room's language.
      if (state.players.length === 0 && (payload.lang === "en" || payload.lang === "zh")) {
        state.lang = payload.lang;
      }
      state.players.push({
        id: playerId,
        name,
        color,
        score: 0,
        host: state.players.length === 0,
        connected: true,
        guessed: false,
        roundPoints: 0,
      });
      this.system(state, `${name} joined`);
    }

    state.emptyAt = 0;
    this.ensureHost(state);
    this.save(state);
    this.broadcast(state);
    if (state.phase === "playing") {
      await this.schedule(state);
    } else if (state.phase === "teams" && state.yarn) {
      await this.ctx.storage.setAlarm(state.yarn.startsAt);
    }
  }

  private async settings(ws: WebSocket, payload: unknown): Promise<void> {
    const state = this.load();
    if (!this.isHost(ws, state) || state.phase !== "lobby" || !isRecord(payload)) return;

    if (
      payload.game === "classic" ||
      payload.game === "passthepen" ||
      payload.game === "yarnpals" ||
      payload.game === "undercover"
    ) {
      state.game = payload.game;
    }
    if (payload.lang === "en" || payload.lang === "zh") {
      state.lang = payload.lang;
    }
    if (payload.mode === "pictionary" || payload.mode === "charades" || payload.mode === "mixed") {
      state.mode = payload.mode;
    }
    if (payload.rounds === 1 || payload.rounds === 5 || payload.rounds === 10 || payload.rounds === 15) {
      state.rounds = payload.rounds;
    }
    this.save(state);
    this.broadcast(state);
  }

  private async start(ws: WebSocket): Promise<void> {
    const state = this.load();
    if (!this.isHost(ws, state)) return;
    const minPlayers = state.game === "undercover" ? 4 : state.game === "passthepen" ? 3 : 2;
    if (state.players.length < minPlayers) {
      this.error(ws, `Need at least ${minPlayers} players.`);
      return;
    }

    state.players = state.players.map((player) => ({
      ...player,
      score: 0,
      guessed: false,
      roundPoints: 0,
      guessRank: undefined,
    }));
    state.messages = [];
    state.solved = 0;

    if (state.game === "yarnpals") {
      await this.startYarn(state);
      return;
    }

    if (state.game === "undercover") {
      this.startUndercover(state);
      return;
    }

    await this.beginRound(state, 1);
  }

  // ---------- Undercover (谁是卧底) ----------
  private shuffleIds(ids: string[]): string[] {
    const a = [...ids];
    for (let i = a.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  private startUndercover(state: RoomState): void {
    const pairs = UNDERCOVER_PAIRS[state.lang];
    const pair = pairs[crypto.getRandomValues(new Uint32Array(1))[0] % pairs.length];
    // Randomize which side of the pair is the civilian word.
    const flip = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0;
    const civWord = flip ? pair[0] : pair[1];
    const spyWord = flip ? pair[1] : pair[0];

    const spyCount = state.players.length >= 6 ? 2 : 1;
    const shuffled = this.shuffleIds(state.players.map((p) => p.id));
    const spies = new Set(shuffled.slice(0, spyCount));
    const members: UCMember[] = state.players.map((p) => ({
      id: p.id,
      role: spies.has(p.id) ? "spy" : "civ",
      word: spies.has(p.id) ? spyWord : civWord,
      alive: true,
    }));

    state.undercover = {
      sub: "describe",
      round: 1,
      spyCount,
      members,
      order: this.shuffleIds(state.players.map((p) => p.id)),
      turnIndex: 0,
      descriptions: [],
      votes: {},
      candidates: [],
      eliminated: null,
      result: null,
    };
    state.phase = "playing";
    state.messages = [];
    this.system(
      state,
      state.lang === "zh"
        ? `本局有 ${spyCount} 个卧底 — 轮流描述你的词!`
        : `${spyCount} undercover${spyCount > 1 ? "s" : ""} this game — take turns describing your word!`,
    );
    this.save(state);
    this.broadcast(state);
  }

  private ucAlive(state: RoomState): UCMember[] {
    return state.undercover?.members.filter((m) => m.alive) ?? [];
  }

  private async ucDescribe(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    const uc = state.undercover;
    if (!session || state.game !== "undercover" || !uc || uc.sub !== "describe") return;
    if (session.playerId !== uc.order[uc.turnIndex]) return;

    const text = isRecord(payload) ? asText(payload.text, "", 120) : "";
    if (text) {
      const player = state.players.find((p) => p.id === session.playerId);
      uc.descriptions.push({ playerId: session.playerId, playerName: player?.name ?? "Player", text });
    }

    // Advance to the next ALIVE speaker; if the lap is done, go to voting.
    let next = uc.turnIndex + 1;
    const aliveIds = new Set(this.ucAlive(state).map((m) => m.id));
    while (next < uc.order.length && !aliveIds.has(uc.order[next])) next += 1;
    if (next >= uc.order.length) {
      uc.sub = "vote";
      uc.votes = {};
      uc.candidates = [];
    } else {
      uc.turnIndex = next;
    }
    this.save(state);
    this.broadcast(state);
  }

  private async ucVote(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    const uc = state.undercover;
    if (!session || !uc || uc.sub !== "vote" || !isRecord(payload)) return;

    const voter = uc.members.find((m) => m.id === session.playerId);
    if (!voter || !voter.alive) return;
    // In a runoff, the tied candidates cannot vote.
    if (uc.candidates.length && uc.candidates.includes(session.playerId)) return;

    const target = asText(payload.targetId, "", 80);
    const targetAlive = uc.members.some((m) => m.id === target && m.alive);
    if (!targetAlive) return;
    if (uc.candidates.length && !uc.candidates.includes(target)) return;

    uc.votes[session.playerId] = target;

    // Auto-tally once every eligible voter has voted.
    const eligible = this.ucEligibleVoters(state);
    if (eligible.every((id) => uc.votes[id])) {
      this.ucResolveVotes(state);
    }
    this.save(state);
    this.broadcast(state);
  }

  private ucEligibleVoters(state: RoomState): string[] {
    const uc = state.undercover;
    if (!uc) return [];
    return this.ucAlive(state)
      .map((m) => m.id)
      .filter((id) => !(uc.candidates.length && uc.candidates.includes(id)));
  }

  private async ucTally(ws: WebSocket): Promise<void> {
    const state = this.load();
    const uc = state.undercover;
    if (!this.isHost(ws, state) || !uc || uc.sub !== "vote") return;
    this.ucResolveVotes(state);
    this.save(state);
    this.broadcast(state);
  }

  private ucResolveVotes(state: RoomState): void {
    const uc = state.undercover;
    if (!uc) return;
    const tally: Record<string, number> = {};
    for (const target of Object.values(uc.votes)) tally[target] = (tally[target] ?? 0) + 1;
    let max = 0;
    for (const n of Object.values(tally)) max = Math.max(max, n);
    const top = Object.keys(tally).filter((id) => tally[id] === max);

    if (max === 0) {
      // Nobody voted — pick randomly among alive as a fallback.
      const alive = this.ucAlive(state).map((m) => m.id);
      top.push(alive[crypto.getRandomValues(new Uint32Array(1))[0] % alive.length]);
    }

    if (top.length > 1) {
      // Tie: run a runoff among the tied players (they lose their vote), unless this was already a runoff.
      if (uc.candidates.length === 0) {
        uc.candidates = top;
        uc.votes = {};
        this.system(
          state,
          state.lang === "zh" ? "平票!在平票者之间重新投票。" : "Tie! Re-vote among the tied players.",
        );
        return;
      }
      // Runoff also tied — eliminate one at random to settle it.
    }

    const outId = top.length === 1 ? top[0] : top[crypto.getRandomValues(new Uint32Array(1))[0] % top.length];
    const member = uc.members.find((m) => m.id === outId);
    if (!member) return;
    member.alive = false;
    const player = state.players.find((p) => p.id === outId);
    uc.eliminated = { id: outId, name: player?.name ?? "Player", role: member.role, word: member.word };
    uc.candidates = [];
    uc.sub = "reveal";

    // Win check.
    const aliveMembers = this.ucAlive(state);
    const spies = aliveMembers.filter((m) => m.role === "spy").length;
    const civs = aliveMembers.length - spies;
    if (spies === 0) uc.result = "civ";
    else if (spies >= civs) uc.result = "spy";
    else uc.result = null;
  }

  private async ucProceed(ws: WebSocket): Promise<void> {
    const state = this.load();
    const uc = state.undercover;
    if (!this.isHost(ws, state) || !uc || uc.sub !== "reveal") return;

    if (uc.result) {
      state.phase = "gameEnd";
      this.save(state);
      this.broadcast(state);
      return;
    }

    // Next round of descriptions among survivors.
    uc.round += 1;
    uc.sub = "describe";
    uc.order = this.shuffleIds(this.ucAlive(state).map((m) => m.id));
    uc.turnIndex = 0;
    uc.descriptions = [];
    uc.votes = {};
    uc.candidates = [];
    uc.eliminated = null;
    this.system(state, state.lang === "zh" ? `第 ${uc.round} 轮描述开始` : `Round ${uc.round}: describe again`);
    this.save(state);
    this.broadcast(state);
  }

  private async startYarn(state: RoomState): Promise<void> {
    // Random teams, always 3v3 — humans split as evenly as possible, bots fill the rest.
    const shuffled = [...state.players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    const half = Math.min(YARN_TEAM_SIZE, Math.ceil(shuffled.length / 2));
    const humansByTeam: Player[][] = [shuffled.slice(0, half), shuffled.slice(half, half + YARN_TEAM_SIZE)];

    const teams: YarnSlot[] = [];
    let botIndex = 0;
    const buildTeam = (team: 0 | 1, humans: Player[]) => {
      for (let slot = 0; slot < YARN_TEAM_SIZE; slot++) {
        const color = YARN_TEAM_COLORS[team][slot];
        const human = humans[slot];
        if (human) {
          teams.push({ id: human.id, name: human.name, team, bot: false, color });
        } else {
          teams.push({
            id: `bot_${team}_${slot}`,
            name: YARN_BOT_NAMES[botIndex % YARN_BOT_NAMES.length],
            team,
            bot: true,
            color,
          });
          botIndex += 1;
        }
      }
    };
    buildTeam(0, humansByTeam[0]);
    buildTeam(1, humansByTeam[1]);

    state.phase = "teams";
    state.round = null;
    state.strokes = [];
    state.yarn = { startsAt: Date.now() + YARN_COUNTDOWN_MS, durationSeconds: YARN_DURATION_SECONDS, teams };
    this.system(state, "Teams drawn — kick off in 3…");
    this.save(state);
    await this.ctx.storage.setAlarm(state.yarn.startsAt);
    this.broadcast(state);
  }

  private async beginRound(state: RoomState, number: number): Promise<void> {
    state.strokes = [];
    state.players = state.players.map((player) => ({
      ...player,
      guessed: false,
      roundPoints: 0,
      guessRank: undefined,
    }));

    if (state.game === "passthepen") {
      state.round = this.makeRelayRound(state, number);
      state.phase = "playing";
      this.system(state, `Round ${number}: ${this.performerName(state)} guesses — everyone draws!`);
      this.save(state);
      await this.schedule(state);
      this.broadcast(state);
      return;
    }

    state.round = this.makeRound(state, number);
    state.phase = "choosing";
    this.system(state, `Round ${number} started`);
    this.save(state);
    await this.ctx.storage.deleteAlarm();
    this.broadcast(state);
  }

  private async choose(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    if (!session || state.phase !== "choosing" || !state.round || !isRecord(payload)) return;
    if (state.round.performerId !== session.playerId) return;

    const word = asText(payload.word, "", 80);
    if (!word || !state.round.options?.includes(word)) return;

    state.phase = "playing";
    state.strokes = [];
    state.round = {
      ...state.round,
      word,
      category: this.categoryOf(state.round.mode, state.lang, word),
      options: undefined,
      startedAt: Date.now(),
      hints: 0,
      correctIds: [],
      ended: false,
    };
    state.players = state.players.map((player) => ({
      ...player,
      guessed: false,
      roundPoints: 0,
      guessRank: undefined,
    }));
    this.system(state, `${this.performerName(state)} is up`);
    this.save(state);
    await this.schedule(state);
    this.broadcast(state);
  }

  private async draw(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    if (!session || state.phase !== "playing" || !isRecord(payload)) return;

    const strokes = normalizeStrokes(payload.strokes);
    if (!strokes) return;

    if (state.game === "passthepen") {
      const round = state.round;
      if (!round?.drawOrder) return;
      const currentId = round.drawOrder[round.turnIndex ?? 0];
      if (session.playerId !== currentId) return;
      // Cumulative board: a drawer may only add to, or undo, their own turn's strokes.
      const keep = round.turnStrokeStart ?? 0;
      if (strokes.length < keep) return;
      state.strokes = strokes;
      this.save(state);
      this.broadcast(state);
      return;
    }

    if (state.round?.mode !== "pictionary") return;
    if (state.round.performerId !== session.playerId) return;
    state.strokes = strokes;
    this.save(state);
    this.broadcast(state);
  }

  private async guess(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    if (!session || state.phase !== "playing" || !state.round?.word || !isRecord(payload)) return;

    const player = state.players.find((item) => item.id === session.playerId);
    if (!player) return;

    const text = asText(payload.text, "", 80);
    if (!text) return;

    const round = state.round;

    if (state.game === "passthepen") {
      // Only the guesser (the round's performer) may guess.
      if (session.playerId !== round.performerId) return;

      if (!guessesMatch(text, round.word)) {
        this.message(state, player, text);
        this.save(state);
        this.broadcast(state);
        return;
      }

      // Pass the Pen is cooperative — no individual scoring, just count team wins.
      player.guessed = true;
      round.correctIds.push(player.id);
      state.solved += 1;

      this.messages(state, {
        id: crypto.randomUUID(),
        playerId: player.id,
        playerName: player.name,
        text: state.lang === "zh" ? "猜对了! 🎉" : "guessed it! 🎉",
        at: Date.now(),
        correct: true,
      });

      await this.endRound(state);
      return;
    }

    if (session.playerId === round.performerId || player.guessed) return;

    if (!guessesMatch(text, round.word)) {
      this.message(state, player, text);
      this.save(state);
      this.broadcast(state);
      return;
    }

    const rank = round.correctIds.length;
    const guesserPoints = pointsForRank(rank);
    const performerPoints = 20;
    player.guessed = true;
    player.guessRank = rank + 1;
    player.roundPoints += guesserPoints;
    player.score += guesserPoints;
    round.correctIds.push(player.id);

    const performer = state.players.find((item) => item.id === round.performerId);
    if (performer) {
      performer.roundPoints += performerPoints;
      performer.score += performerPoints;
    }

    this.messages(state, {
      id: crypto.randomUUID(),
      playerId: player.id,
      playerName: player.name,
      text: `correct +${guesserPoints}`,
      at: Date.now(),
      correct: true,
    });

    const eligible = state.players.filter((item) => item.id !== round.performerId).length;
    if (round.correctIds.length >= eligible) {
      await this.endRound(state);
      return;
    }

    this.save(state);
    this.broadcast(state);
  }

  private async pass(ws: WebSocket): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    if (!session || state.game !== "passthepen" || state.phase !== "playing" || !state.round?.drawOrder) {
      return;
    }
    const currentId = state.round.drawOrder[state.round.turnIndex ?? 0];
    if (session.playerId !== currentId) return;
    await this.advanceTurn(state);
  }

  private async advanceTurn(state: RoomState): Promise<void> {
    const round = state.round;
    if (!round?.drawOrder) return;

    if (round.guessWindow) {
      // The final guessing window elapsed without a correct guess.
      await this.endRound(state);
      return;
    }

    const next = (round.turnIndex ?? 0) + 1;
    if (next >= round.drawOrder.length) {
      // Every drawer has had a turn — open a final guessing window.
      round.turnIndex = round.drawOrder.length;
      round.guessWindow = true;
      round.turnStartedAt = Date.now();
      round.turnSeconds = FINAL_GUESS_SECONDS;
      this.system(state, `Pens down — ${this.performerName(state)} has ${FINAL_GUESS_SECONDS}s to guess!`);
      this.save(state);
      await this.schedule(state);
      this.broadcast(state);
      return;
    }

    round.turnIndex = next;
    round.turnStartedAt = Date.now();
    round.turnStrokeStart = state.strokes.length;
    this.system(state, `${this.playerName(state, round.drawOrder[next])}'s turn to draw`);
    this.save(state);
    await this.schedule(state);
    this.broadcast(state);
  }

  private async next(ws: WebSocket): Promise<void> {
    const state = this.load();
    if (!this.isHost(ws, state) || state.phase !== "roundEnd") return;
    if (!state.round || state.round.number >= state.rounds) {
      await this.finish(state);
      return;
    }
    await this.beginRound(state, state.round.number + 1);
  }

  private async reset(ws: WebSocket): Promise<void> {
    const state = this.load();
    if (!this.isHost(ws, state)) return;
    state.phase = "lobby";
    state.round = null;
    state.yarn = null;
    state.undercover = null;
    state.strokes = [];
    state.messages = [];
    state.players = state.players.map((player) => ({
      ...player,
      score: 0,
      guessed: false,
      roundPoints: 0,
      guessRank: undefined,
    }));
    this.save(state);
    await this.ctx.storage.deleteAlarm();
    this.broadcast(state);
  }

  private async leave(ws: WebSocket): Promise<void> {
    const session = this.session(ws);
    if (!session) return;
    const state = this.load();
    await this.removePlayer(state, session.playerId);
    try {
      ws.close(1000, "left");
    } catch {
      // Socket may already be closing.
    }
  }

  private async kick(ws: WebSocket, payload: unknown): Promise<void> {
    const state = this.load();
    if (!this.isHost(ws, state) || !isRecord(payload)) return;
    const playerId = asText(payload.playerId, "", 80);
    if (!playerId || playerId === this.session(ws)?.playerId) return;
    await this.removePlayer(state, playerId);

    for (const socket of this.ctx.getWebSockets()) {
      if (this.session(socket)?.playerId !== playerId) continue;
      this.send(socket, { type: "kicked", payload: { message: "You were removed from the room." } });
      try {
        socket.close(1008, "removed");
      } catch {
        // Socket may already be closing.
      }
    }
  }

  private async removePlayer(state: RoomState, playerId: string): Promise<void> {
    const player = state.players.find((item) => item.id === playerId);
    if (!player) return;
    const wasPerformer = state.round?.performerId === playerId;
    state.players = state.players.filter((item) => item.id !== playerId);
    this.system(state, `${player.name} left`);
    this.ensureHost(state);

    if (state.players.length === 0) {
      const empty = this.empty(state.code);
      this.save(empty);
      await this.ctx.storage.deleteAlarm();
      return;
    }

    // Pass the Pen: keep the relay queue coherent when a drawer drops out.
    if (state.game === "passthepen" && state.round?.drawOrder?.includes(playerId)) {
      const removedIndex = state.round.drawOrder.indexOf(playerId);
      state.round.drawOrder = state.round.drawOrder.filter((id) => id !== playerId);
      let turnIndex = state.round.turnIndex ?? 0;
      if (removedIndex < turnIndex) turnIndex -= 1;
      state.round.turnIndex = turnIndex;
      if (state.phase === "playing") {
        if (turnIndex >= state.round.drawOrder.length) {
          await this.endRound(state);
          return;
        }
        state.round.turnStartedAt = Date.now();
        state.round.turnStrokeStart = state.strokes.length;
        this.save(state);
        await this.schedule(state);
        this.broadcast(state);
        return;
      }
    }

    // Undercover: drop the leaver and keep the round flowing / end if a side is settled.
    if (state.game === "undercover" && state.undercover && state.phase === "playing") {
      const uc = state.undercover;
      const member = uc.members.find((m) => m.id === playerId);
      if (member) member.alive = false;
      uc.candidates = uc.candidates.filter((id) => id !== playerId);
      delete uc.votes[playerId];

      const aliveMembers = this.ucAlive(state);
      const spies = aliveMembers.filter((m) => m.role === "spy").length;
      const civs = aliveMembers.length - spies;
      if (aliveMembers.length <= 1 || spies === 0 || spies >= civs) {
        uc.result = spies === 0 ? "civ" : "spy";
        uc.sub = "reveal";
        state.phase = "gameEnd";
        this.save(state);
        this.broadcast(state);
        return;
      }
      if (uc.sub === "describe") {
        const aliveIds = new Set(aliveMembers.map((m) => m.id));
        if (!aliveIds.has(uc.order[uc.turnIndex])) {
          let next = uc.turnIndex;
          while (next < uc.order.length && !aliveIds.has(uc.order[next])) next += 1;
          if (next >= uc.order.length) {
            uc.sub = "vote";
            uc.votes = {};
            uc.candidates = [];
          } else {
            uc.turnIndex = next;
          }
        }
      } else if (uc.sub === "vote") {
        const eligible = this.ucEligibleVoters(state);
        if (eligible.length > 0 && eligible.every((id) => uc.votes[id])) {
          this.ucResolveVotes(state);
        }
      }
      this.save(state);
      this.broadcast(state);
      return;
    }

    if (wasPerformer && state.phase === "playing") {
      await this.endRound(state);
      return;
    }

    if (wasPerformer && state.phase === "choosing") {
      state.phase = "lobby";
      state.round = null;
      state.strokes = [];
    }

    this.save(state);
    this.broadcast(state);
  }

  private async endRound(state: RoomState): Promise<void> {
    if (!state.round || state.phase === "roundEnd") return;
    state.phase = "roundEnd";
    state.round.ended = true;
    this.system(state, `Answer: ${state.round.word}`);
    this.save(state);
    await this.ctx.storage.deleteAlarm();
    this.broadcast(state);
  }

  private async finish(state: RoomState): Promise<void> {
    state.phase = "gameEnd";
    const score = Math.max(...state.players.map((player) => player.score));
    const names = state.players.filter((player) => player.score === score).map((player) => player.name);
    this.system(state, `${names.join(" & ")} win`);
    this.save(state);
    await this.ctx.storage.deleteAlarm();
    this.broadcast(state);
  }

  private makeRound(state: RoomState, number: number): Round {
    const mode: RoundMode =
      state.mode === "mixed"
        ? crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0
          ? "pictionary"
          : "charades"
        : state.mode;
    const performer = state.players[(number - 1) % state.players.length];
    return {
      number,
      total: state.rounds,
      mode,
      performerId: performer.id,
      word: "",
      options: this.wordOptions(mode, state.lang),
      startedAt: 0,
      durationSeconds: ROUND_SECONDS,
      hints: 0,
      correctIds: [],
      ended: false,
    };
  }

  private makeRelayRound(state: RoomState, number: number): Round {
    const guesser = state.players[(number - 1) % state.players.length];
    const drawOrder = state.players.filter((player) => player.id !== guesser.id).map((player) => player.id);
    const turnSeconds = turnSecondsFor(drawOrder.length);
    const now = Date.now();
    return {
      number,
      total: state.rounds,
      mode: "pictionary",
      performerId: guesser.id,
      word: this.pickPhrase(state.lang),
      options: undefined,
      startedAt: now,
      durationSeconds: drawOrder.length * turnSeconds + FINAL_GUESS_SECONDS,
      hints: 0,
      correctIds: [],
      ended: false,
      drawOrder,
      turnIndex: 0,
      turnStartedAt: now,
      turnSeconds,
      turnStrokeStart: 0,
      guessWindow: false,
    };
  }

  private wordOptions(mode: RoundMode, lang: Lang): string[] {
    const bank = (mode === "pictionary" ? PICTIONARY_WORDS : CHARADES_WORDS)[lang];
    const words = Object.values(bank).flat();
    const picks: string[] = [];
    const used = new Set<number>();
    while (picks.length < 3 && used.size < words.length) {
      const i = crypto.getRandomValues(new Uint32Array(1))[0] % words.length;
      if (used.has(i)) continue;
      used.add(i);
      picks.push(words[i]);
    }
    return picks;
  }

  private categoryOf(mode: RoundMode, lang: Lang, word: string): string {
    const bank = (mode === "pictionary" ? PICTIONARY_WORDS : CHARADES_WORDS)[lang];
    for (const category of Object.keys(bank)) {
      if (bank[category].includes(word)) return category;
    }
    return "";
  }

  private pickPhrase(lang: Lang): string {
    const pool = PASS_THE_PEN_PHRASES[lang];
    const offset = crypto.getRandomValues(new Uint32Array(1))[0];
    return pool[offset % pool.length];
  }

  private async schedule(state: RoomState): Promise<void> {
    if (state.phase !== "playing") {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    if (state.game === "passthepen") {
      const round = state.round;
      if (!round?.turnStartedAt) {
        await this.ctx.storage.deleteAlarm();
        return;
      }
      await this.ctx.storage.setAlarm(round.turnStartedAt + (round.turnSeconds ?? TURN_SECONDS) * 1000);
      return;
    }

    if (!state.round?.word) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const started = state.round.startedAt;
    const now = Date.now();
    const end = started + state.round.durationSeconds * 1000;
    const countAt = started + HINT_COUNT_AT_SECONDS * 1000;
    const categoryAt = started + HINT_CATEGORY_AT_SECONDS * 1000;
    let next = end;
    if (now < countAt) next = Math.min(next, countAt);
    else if (now < categoryAt) next = Math.min(next, categoryAt);
    await this.ctx.storage.setAlarm(next);
  }

  private broadcast(state: RoomState): void {
    this.hostId = state.players.find((player) => player.host)?.id ?? null;
    for (const ws of this.ctx.getWebSockets()) {
      const session = this.session(ws);
      this.send(ws, { type: "state", payload: this.snapshot(state, session?.playerId) });
    }
  }

  // --- Kitty Cup realtime relay (ephemeral, bypasses storage) ---
  private ensureHostId(): string | null {
    if (!this.hostId) this.hostId = this.load().players.find((player) => player.host)?.id ?? null;
    return this.hostId;
  }

  private socketFor(playerId: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      if (this.session(ws)?.playerId === playerId) return ws;
    }
    return null;
  }

  private relayYarnInput(ws: WebSocket, payload: unknown): void {
    if (!isRecord(payload)) return;
    const sender = this.session(ws)?.playerId;
    const hostId = this.ensureHostId();
    if (!sender || !hostId || sender === hostId) return;
    const host = this.socketFor(hostId);
    if (!host) return;
    this.send(host, {
      type: "yarnInput",
      payload: {
        playerId: sender,
        x: typeof payload.x === "number" ? payload.x : 0,
        y: typeof payload.y === "number" ? payload.y : 0,
        dash: payload.dash === true,
      },
    });
  }

  private relayYarnWorld(ws: WebSocket, payload: unknown): void {
    const sender = this.session(ws)?.playerId;
    if (!sender || sender !== this.ensureHostId() || !isRecord(payload)) return;
    const text = JSON.stringify({ type: "yarnWorld", payload });
    for (const client of this.ctx.getWebSockets()) {
      if (client === ws) continue;
      try {
        client.send(text);
      } catch {
        // ignore closed sockets
      }
    }
  }

  private snapshot(state: RoomState, playerId?: string): Snapshot {
    const round = state.round ? { ...state.round } : null;
    const isPerformer = !!round && round.performerId === playerId;
    let seeWord = false;
    let youDraw = false;
    let youGuess = false;
    let hiddenWord = "";
    let wordLength = 0;
    let relay: RelaySnapshot | null = null;

    if (round) {
      wordLength = round.word.replaceAll(" ", "").length;

      if (state.game === "passthepen") {
        const isGuesser = round.performerId === playerId;
        seeWord = !isGuesser;
        youGuess = isGuesser && state.phase === "playing";
        const order = round.drawOrder ?? [];
        const currentId = order[round.turnIndex ?? 0] ?? "";
        youDraw = state.phase === "playing" && playerId === currentId;

        relay = {
          order: order.map((id) => {
            const member = state.players.find((player) => player.id === id);
            return { id, name: member?.name ?? "?", color: member?.color ?? "#94a3b8" };
          }),
          currentId,
          nextId: order[(round.turnIndex ?? 0) + 1] ?? null,
          turnTimeLeft: this.turnTimeLeft(state),
          turnSeconds: round.turnSeconds ?? TURN_SECONDS,
        };

        // Hide the phrase from the guesser (they see blanks; the drawing is the clue).
        if (!seeWord && state.phase === "playing") {
          hiddenWord = buildHint(round.word, 0);
          round.word = "";
        }
      } else {
        seeWord = isPerformer;
        youGuess = !isPerformer && state.phase === "playing";
        youDraw = isPerformer && state.phase === "playing";
        if (!isPerformer && state.phase === "choosing") round.options = [];
        if (!isPerformer && state.phase === "playing") {
          // Staged hints: length after 20s, category after 40s. No blanks.
          const elapsed = Math.floor((Date.now() - round.startedAt) / 1000);
          if (elapsed < HINT_COUNT_AT_SECONDS) wordLength = 0;
          if (elapsed < HINT_CATEGORY_AT_SECONDS) round.category = undefined;
          hiddenWord = "";
          round.word = "";
          round.options = undefined;
        }
      }
    }

    return {
      ...state,
      round,
      undercover: this.ucView(state, playerId),
      timeLeft: this.timeLeft(state),
      hiddenWord,
      wordLength,
      isPerformer,
      seeWord,
      youDraw,
      youGuess,
      relay,
    };
  }

  private ucView(state: RoomState, playerId?: string): UCView | null {
    const uc = state.undercover;
    if (state.game !== "undercover" || !uc) return null;
    const gameOver = state.phase === "gameEnd";
    const me = uc.members.find((m) => m.id === playerId);
    const eligible = new Set(this.ucEligibleVoters(state));
    const members: UCMemberView[] = uc.members.map((m) => {
      const p = state.players.find((pp) => pp.id === m.id);
      return {
        id: m.id,
        name: p?.name ?? "Player",
        alive: m.alive,
        connected: p?.connected ?? false,
        voted: uc.votes[m.id] !== undefined,
      };
    });
    const currentId = uc.sub === "describe" ? uc.order[uc.turnIndex] ?? "" : "";
    return {
      sub: uc.sub,
      round: uc.round,
      spyCount: uc.spyCount,
      myRole: me ? me.role : null,
      myWord: me ? me.word : "",
      alive: me ? me.alive : false,
      youSpeak: uc.sub === "describe" && currentId === playerId,
      youVote:
        uc.sub === "vote" &&
        !!me &&
        me.alive &&
        !!playerId &&
        eligible.has(playerId) &&
        uc.votes[playerId] === undefined,
      hasVoted: !!playerId && uc.votes[playerId] !== undefined,
      currentId,
      currentName: state.players.find((p) => p.id === currentId)?.name ?? "",
      candidates: uc.candidates,
      members,
      descriptions: uc.descriptions,
      eliminated: uc.eliminated ? { name: uc.eliminated.name, role: uc.eliminated.role } : null,
      result: uc.result,
      reveal: gameOver
        ? uc.members.map((m) => ({
            name: state.players.find((p) => p.id === m.id)?.name ?? "Player",
            role: m.role,
            word: m.word,
          }))
        : null,
    };
  }

  private load(): RoomState {
    const row = this.ctx.storage.sql
      .exec<{ body: string }>("SELECT body FROM state WHERE id = ?", "room")
      .toArray()[0];
    if (!row) {
      const state = this.empty("ROOM");
      this.save(state);
      return state;
    }
    try {
      return JSON.parse(row.body) as RoomState;
    } catch {
      const state = this.empty("ROOM");
      this.save(state);
      return state;
    }
  }

  private save(state: RoomState): void {
    state.updatedAt = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO state (id, body, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
      "room",
      JSON.stringify(state),
      state.updatedAt,
    );
  }

  private empty(code: string): RoomState {
    const now = Date.now();
    return {
      code,
      phase: "lobby",
      players: [],
      game: "classic",
      lang: "en",
      mode: "mixed",
      rounds: 5,
      round: null,
      yarn: null,
      undercover: null,
      solved: 0,
      messages: [],
      strokes: [],
      emptyAt: 0,
      createdAt: 0,
      updatedAt: now,
    };
  }

  private timeLeft(state: RoomState): number {
    if (state.phase !== "playing" || !state.round?.startedAt) return 0;
    const elapsed = Math.floor((Date.now() - state.round.startedAt) / 1000);
    return Math.max(0, state.round.durationSeconds - elapsed);
  }

  private turnTimeLeft(state: RoomState): number {
    const round = state.round;
    if (state.phase !== "playing" || state.game !== "passthepen" || !round?.turnStartedAt) return 0;
    const elapsed = Math.floor((Date.now() - round.turnStartedAt) / 1000);
    return Math.max(0, (round.turnSeconds ?? TURN_SECONDS) - elapsed);
  }

  private ensureHost(state: RoomState): void {
    if (state.players.some((player) => player.host)) return;
    if (state.players[0]) state.players[0].host = true;
  }

  private isHost(ws: WebSocket, state: RoomState): boolean {
    const playerId = this.session(ws)?.playerId;
    const ok = state.players.some((player) => player.id === playerId && player.host);
    if (!ok) this.error(ws, "Host only.");
    return ok;
  }

  private performerName(state: RoomState): string {
    return state.players.find((player) => player.id === state.round?.performerId)?.name ?? "Player";
  }

  private playerName(state: RoomState, playerId: string): string {
    return state.players.find((player) => player.id === playerId)?.name ?? "Player";
  }

  private system(state: RoomState, text: string): void {
    this.messages(state, {
      id: crypto.randomUUID(),
      playerId: "system",
      playerName: "System",
      text,
      at: Date.now(),
      system: true,
    });
  }

  private message(state: RoomState, player: Player, text: string): void {
    this.messages(state, {
      id: crypto.randomUUID(),
      playerId: player.id,
      playerName: player.name,
      text,
      at: Date.now(),
    });
  }

  private messages(state: RoomState, message: Message): void {
    state.messages = [...state.messages, message].slice(-MAX_MESSAGES);
  }

  private session(ws: WebSocket): Session | undefined {
    const current = this.sessions.get(ws);
    if (current) return current;
    const restored = this.readSession(ws);
    if (restored) this.sessions.set(ws, restored);
    return restored;
  }

  private readSession(ws: WebSocket): Session | undefined {
    try {
      const value = ws.deserializeAttachment() as unknown;
      if (isRecord(value) && typeof value.playerId === "string") {
        return { playerId: value.playerId };
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private error(ws: WebSocket, message: string): void {
    this.send(ws, { type: "error", payload: { message } });
  }

  private send(ws: WebSocket, message: unknown): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Ignore closed sockets.
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([A-Z0-9]{3,8})\/ws$/);

    if (match) {
      const room = env.ROOMS.getByName(match[1]);
      return room.fetch(request);
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
