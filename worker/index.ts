import { DurableObject } from "cloudflare:workers";

type Game = "classic" | "passthepen" | "yarnpals";
type Lang = "en" | "zh";
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
type Snapshot = RoomState & {
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
const HINT_INTERVAL_SECONDS = 15;
const TURN_SECONDS = 12;
const FINAL_GUESS_SECONDS = 30;
const MAX_PLAYERS = 6;
const MAX_MESSAGES = 100;
const SCORE_BY_RANK = [100, 80, 60, 40, 20];
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000; // recycle a room 10 min after everyone leaves

type WordBank = { en: string[]; zh: string[] };

const PICTIONARY_WORDS: WordBank = {
  en: [
    "rocket", "lighthouse", "roller coaster", "birthday cake", "submarine", "rainstorm",
    "treasure map", "skateboard", "campfire", "greenhouse", "snow globe", "telescope",
    "waterfall", "dragon", "spaceship", "windmill", "jellyfish", "treehouse", "volcano",
    "suitcase", "sandcastle", "robot", "carousel", "hot air balloon", "cat", "dog", "sun",
    "moon", "house", "tree", "apple", "guitar", "clock", "umbrella", "penguin", "cactus",
    "igloo", "ghost", "castle", "butterfly", "snail", "elephant", "panda", "dinosaur",
    "rainbow", "beach", "mountain", "key", "cupcake", "anchor", "mermaid", "unicorn",
    "tornado", "scarecrow", "fire truck", "hamburger", "ice cream", "kite", "ladder",
    "mailbox", "owl", "piano", "pumpkin", "shark", "snowflake", "spider web",
    "traffic light", "trophy", "wizard hat", "yacht", "bicycle", "camera", "cactus pot",
  ],
  zh: [
    "火箭", "灯塔", "过山车", "生日蛋糕", "潜水艇", "暴风雨", "藏宝图", "滑板", "篝火", "温室",
    "雪花玻璃球", "望远镜", "瀑布", "龙", "飞船", "风车", "水母", "树屋", "火山", "行李箱",
    "沙堡", "机器人", "旋转木马", "热气球", "猫", "狗", "太阳", "月亮", "房子", "树",
    "苹果", "吉他", "时钟", "雨伞", "企鹅", "仙人掌", "冰屋", "幽灵", "城堡", "蝴蝶",
    "蜗牛", "大象", "熊猫", "恐龙", "彩虹", "沙滩", "高山", "钥匙", "纸杯蛋糕", "船锚",
    "美人鱼", "独角兽", "龙卷风", "稻草人", "消防车", "汉堡", "冰淇淋", "风筝", "梯子", "邮箱",
    "猫头鹰", "钢琴", "南瓜", "鲨鱼", "雪花", "蜘蛛网", "红绿灯", "奖杯", "巫师帽", "游艇",
    "自行车", "照相机", "长城",
  ],
};

const CHARADES_WORDS: WordBank = {
  en: [
    "opening a stuck jar", "walking through a spiderweb", "landing on the moon", "ice skating",
    "finding a hidden key", "making pizza dough", "riding a horse", "taking a selfie",
    "escaping quicksand", "directing traffic", "playing air guitar", "washing a window",
    "climbing a mountain", "sneaking past a guard", "doing a magic trick", "juggling fruit",
    "building a tent", "surfing a wave", "catching a butterfly", "fixing a robot",
    "brushing teeth", "walking a dog", "doing yoga", "blowing out candles", "tying shoelaces",
    "flying a kite", "fishing", "sneezing", "playing basketball", "baking cookies",
    "chopping wood", "milking a cow", "conducting an orchestra", "scuba diving", "jumping rope",
    "bowling", "playing tennis", "flipping a pancake", "painting a wall", "rowing a boat",
    "shooting an arrow", "putting on makeup", "dancing ballet", "climbing a ladder", "boxing",
  ],
  zh: [
    "打开卡住的罐子", "穿过蜘蛛网", "登上月球", "滑冰", "找到隐藏的钥匙", "揉披萨面团",
    "骑马", "自拍", "从流沙里逃脱", "指挥交通", "弹空气吉他", "擦窗户", "爬山", "溜过警卫",
    "变魔术", "杂耍水果", "搭帐篷", "冲浪", "抓蝴蝶", "修理机器人", "刷牙", "遛狗", "做瑜伽",
    "吹蜡烛", "系鞋带", "放风筝", "钓鱼", "打喷嚏", "打篮球", "烤饼干", "劈柴", "挤牛奶",
    "指挥乐队", "深海潜水", "跳绳", "打保龄球", "打网球", "翻煎饼", "刷墙", "划船", "射箭",
    "化妆", "跳芭蕾", "爬梯子", "打拳击",
  ],
};

// Short, drawable scenes for the relay drawing game.
const PASS_THE_PEN_PHRASES: WordBank = {
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

    const timeLeft = this.timeLeft(state);
    const elapsed = Math.floor((Date.now() - state.round.startedAt) / 1000);
    const hints = Math.min(
      Math.floor(elapsed / HINT_INTERVAL_SECONDS),
      state.round.word.replaceAll(" ", "").length,
    );

    if (hints > state.round.hints) state.round.hints = hints;
    if (timeLeft <= 0) {
      await this.endRound(state);
      return;
    }

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

    if (payload.game === "classic" || payload.game === "passthepen" || payload.game === "yarnpals") {
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
    const minPlayers = state.game === "passthepen" ? 3 : 2;
    if (state.players.length < minPlayers) {
      this.error(
        ws,
        state.game === "passthepen"
          ? "Pass the Pen needs at least three players."
          : "Need at least two players.",
      );
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

    if (state.game === "yarnpals") {
      await this.startYarn(state);
      return;
    }

    await this.beginRound(state, 1);
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

      const drawers = round.drawOrder ?? [];
      const turnsLeft = Math.max(0, drawers.length - (round.turnIndex ?? 0));
      const speedBonus = turnsLeft * 10;
      const guesserPoints = 50 + speedBonus;
      const drawerPoints = 30 + Math.floor(speedBonus / 2);

      player.guessed = true;
      player.roundPoints += guesserPoints;
      player.score += guesserPoints;
      round.correctIds.push(player.id);

      for (const id of drawers) {
        const drawer = state.players.find((item) => item.id === id);
        if (drawer) {
          drawer.roundPoints += drawerPoints;
          drawer.score += drawerPoints;
        }
      }

      this.messages(state, {
        id: crypto.randomUUID(),
        playerId: player.id,
        playerName: player.name,
        text: `guessed it! +${guesserPoints} (drawers +${drawerPoints})`,
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
    const pool = (mode === "pictionary" ? PICTIONARY_WORDS : CHARADES_WORDS)[lang];
    const picks: string[] = [];
    const used = new Set<number>();
    while (picks.length < 3 && used.size < pool.length) {
      const i = crypto.getRandomValues(new Uint32Array(1))[0] % pool.length;
      if (used.has(i)) continue;
      used.add(i);
      picks.push(pool[i]);
    }
    return picks;
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
    const end = started + state.round.durationSeconds * 1000;
    const hint = started + (state.round.hints + 1) * HINT_INTERVAL_SECONDS * 1000;
    await this.ctx.storage.setAlarm(Math.min(end, hint));
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
          hiddenWord = buildHint(round.word, round.hints);
          round.word = "";
          round.options = undefined;
        }
      }
    }

    return {
      ...state,
      round,
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
