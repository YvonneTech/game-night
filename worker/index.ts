import { DurableObject } from "cloudflare:workers";

type Game = "classic" | "passthepen" | "yarnpals" | "undercover" | "wavelength" | "fakeartist" | "telephone" | "punchline" | "balderdash" | "emoji";
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
  resumeTokenHash: string;
  disconnectedAt?: number;
};

type PublicPlayer = Omit<Player, "resumeTokenHash" | "disconnectedAt">;

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
  // Emoji game: performer describes word with emojis only
  emojiClue?: string;
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
  descriptions: Array<{ playerId: string; playerName: string; text: string; passed?: boolean }>;
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
  wavelength: WVState | null;
  fakeartist: FAState | null;
  telephone: TPState | null;
  punchline: PLState | null;
  balderdash: BDState | null;
  solved: number;
  messages: Message[];
  strokes: Stroke[];
  emptyAt: number;
  telephoneInspirationCursor: number;
  telephoneInspirationOffset: number;
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
  descriptions: Array<{ playerId: string; playerName: string; text: string; passed?: boolean }>;
  eliminated: { name: string } | null;
  result: UCRole | null;
  reveal: Array<{ name: string; role: UCRole; word: string }> | null;
};

type WVCard = { playerId: string; clue: string };
type WVState = {
  sub: "play" | "reveal";
  round: number;
  left: string;
  right: string;
  scaleDeck: number[];
  participants: string[];
  values: Record<string, number>;
  placed: WVCard[];
  active: WVCard | null;
  revealStartedAt: number;
};
type WVCardView = WVCard & { name: string; value: number };
type WVView = {
  sub: "play" | "reveal";
  round: number;
  left: string;
  right: string;
  myValue: number;
  isSpectator: boolean;
  hasPlayed: boolean;
  canPlay: boolean;
  isActive: boolean;
  active: WVCardView | null;
  placed: WVCardView[];
  participantCount: number;
  revealStartedAt: number;
};

type FAState = {
  sub: "draw" | "vote" | "reveal";
  word: string;
  category: string;
  fakeIds: string[];
  order: string[];
  laps: number;
  turnIndex: number;
  turnStartedAt: number;
  turnSeconds: number;
  turnStrokeStart: number;
  votes: Record<string, string>;
  candidates: string[];
  eliminated: { id: string; name: string; role: UCRole; word: string } | null;
  result: UCRole | null;
};

type FAMemberView = { id: string; name: string; connected: boolean; voted: boolean };
type FAView = {
  sub: "draw" | "vote" | "reveal";
  word: string;
  category: string;
  isFake: boolean;
  fakeCount: number;
  order: string[];
  laps: number;
  turnIndex: number;
  totalTurns: number;
  currentId: string;
  currentName: string;
  turnTimeLeft: number;
  turnSeconds: number;
  turnStrokeStart: number;
  youDraw: boolean;
  youVote: boolean;
  hasVoted: boolean;
  candidates: string[];
  members: FAMemberView[];
  eliminated: { name: string } | null;
  result: UCRole | null;
  reveal: Array<{ name: string; role: UCRole; word: string }> | null;
};
// Telephone (传声画筒): each player owns one chain that everyone contributes to in
// turn, alternating write → draw → write. Every entry is kept so the whole drift is
// replayable at the end.
type TPKind = "text" | "draw";
type TPEntry = {
  kind: TPKind;
  authorId: string;
  authorName: string;
  text: string; // used when kind === "text"
  strokes: Stroke[]; // used when kind === "draw"
  auto?: boolean; // filled in for a skipped / disconnected player
};
type TPChain = { ownerId: string; ownerName: string; entries: TPEntry[] };
type TPState = {
  sub: "write" | "play" | "reveal";
  step: number; // 0 = seed sentence; each chain ends with `totalSteps` entries
  totalSteps: number; // = number of players at kickoff
  order: string[]; // fixed roster; chain i is owned by order[i]
  chains: TPChain[];
  submitted: Record<string, boolean>; // who has submitted for the current step
  inspirationByPlayer: Record<string, number>;
  revealChain: number; // host-driven walkthrough position
  revealEntry: number;
};

// What one viewer sees. During play they only get their own prompt (the entry they
// must respond to); the full chains are shared only once everyone reaches the reveal.
type TPView = {
  sub: "write" | "play" | "reveal";
  step: number;
  totalSteps: number;
  kind: TPKind; // what I must produce this step
  prompt: { kind: TPKind; text: string; strokes: Stroke[] } | null;
  hasSubmitted: boolean;
  isSpectator: boolean;
  submittedCount: number;
  totalPlayers: number;
  inspirationIndex: number | null;
  reveal: TPChain[] | null;
  revealChain: number;
  revealEntry: number;
};

// Keep in sync with the three 18-item inspiration lists in TelephoneGame.tsx.
const TP_INSPIRATION_COUNT = 18 * 18 * 18;
const TP_INSPIRATION_STEP = 1871; // Coprime with 5,832, so every index appears exactly once.

// Punchline (神回复): everyone fills in funny prompts, then the room votes head-to-head
// on the funniest answer to each prompt. Each prompt is answered by two players who go
// up against each other; everyone else votes. The funniest answers score the most.
type PLState = {
  sub: "answer" | "vote" | "score";
  order: string[]; // fixed roster
  prompts: string[]; // one shared prompt per round
  round: number; // current round index (0-based)
  totalRounds: number;
  answers: Record<string, string>; // playerId -> answer for the current round
  submitted: Record<string, boolean>; // player turned in this round's answer
  answerDeadline: number; // epoch ms
  answerOrder: string[]; // display order of answers this round (playerIds), shuffled so position doesn't leak identity
  votes: Record<string, number>; // voterId -> index into answerOrder
  voteDeadline: number; // epoch ms (voting window, then a short reveal window)
  revealed: boolean; // this round's authors + counts are shown
};

// What one viewer sees. Everyone answers the same prompt; during voting all answers are
// shown blind (authors hidden until the round is revealed), and you can't vote for your own.
type PLView = {
  sub: "answer" | "vote" | "score";
  round: number;
  totalRounds: number;
  prompt: string;
  hasSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
  answerDeadline: number;
  isSpectator: boolean;
  answers: Array<{
    text: string;
    isMine: boolean; // my own answer — I can't vote for it
    author: string | null; // revealed only once the round resolves
    votes: number | null; // revealed only once the round resolves
  }> | null;
  myVote: number | null; // index into answers
  hasVoted: boolean;
  votedCount: number;
  eligibleCount: number;
  voteDeadline: number;
  revealed: boolean;
  scores: Array<{ name: string; score: number }> | null;
};

// Balderdash (胡说八道): everyone invents a fake definition for an obscure word.
// Then all fakes + the real definition are shown shuffled; everyone votes for
// which they think is REAL. Points for guessing right + fooling others.
type BDState = {
  sub: "define" | "vote" | "score";
  order: string[]; // fixed roster
  words: Array<{ word: string; definition: string }>; // one per round
  round: number;
  totalRounds: number;
  definitions: Record<string, string>; // playerId -> fake definition
  submitted: Record<string, boolean>;
  defineDeadline: number;
  displayOrder: string[]; // shuffled: playerIds + "__REAL__" sentinel
  votes: Record<string, number>; // voterId -> index into displayOrder
  voteDeadline: number;
  revealed: boolean;
  hintLevel: number; // 0 = no hint, 1 = small hint, 2 = bigger hint (host-triggered, define phase only)
};

type BDView = {
  sub: "define" | "vote" | "score";
  round: number;
  totalRounds: number;
  word: string;
  hasSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
  defineDeadline: number;
  isSpectator: boolean;
  hint: string | null; // revealed hint text during define phase, null if none
  hintLevel: number;
  options: Array<{
    text: string;
    isMine: boolean;
    author: string | null;
    votes: number | null;
    isReal: boolean | null; // revealed only
  }> | null;
  myVote: number | null;
  hasVoted: boolean;
  votedCount: number;
  eligibleCount: number;
  voteDeadline: number;
  revealed: boolean;
  guessedReal: boolean | null; // revealed only, did I find the truth?
  scores: Array<{ name: string; score: number }> | null;
};

type Snapshot = Omit<
  RoomState,
  | "players"
  | "undercover"
  | "wavelength"
  | "fakeartist"
  | "telephone"
  | "punchline"
  | "balderdash"
  | "telephoneInspirationCursor"
  | "telephoneInspirationOffset"
> & {
  players: PublicPlayer[];
  undercover: UCView | null;
  wavelength: WVView | null;
  fakeartist: FAView | null;
  telephone: TPView | null;
  punchline: PLView | null;
  balderdash: BDView | null;
  timeLeft: number;
  hiddenWord: string;
  wordLength: number;
  isPerformer: boolean;
  seeWord: boolean;
  youDraw: boolean;
  youGuess: boolean;
  relay: RelaySnapshot | null;
  emojiClue: string | null;
  needsClue: boolean;
};

const ROUND_SECONDS = 60;
const HINT_COUNT_AT_SECONDS = 20; // reveal the word length after this long
const HINT_CATEGORY_AT_SECONDS = 40; // reveal the category after this long
const TURN_SECONDS = 12;
const PL_ANSWER_SECONDS = 60; // time to answer the round's prompt
const PL_VOTE_SECONDS = 25; // voting window per round
const PL_REVEAL_SECONDS = 7; // how long the results are shown before advancing
const PL_ROUNDS = 3; // number of prompts per game
const BD_DEFINE_SECONDS = 60;
const BD_VOTE_SECONDS = 30;
const BD_REVEAL_SECONDS = 8;
const BD_ROUNDS = 3;

function isEmojiOnly(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  const noSpace = s.replace(/\s+/g, "");
  if (!noSpace) return false;
  let graphemes: string[];
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    graphemes = Array.from(seg.segment(noSpace), (x) => x.segment);
  } catch {
    graphemes = Array.from(noSpace);
  }
  if (graphemes.length === 0 || graphemes.length > 30) return false;
  const keycapRe = /^[0-9#*]\uFE0F?\u20E3$/;
  for (const g of graphemes) {
    if (keycapRe.test(g)) continue;
    const hasPict = /\p{Extended_Pictographic}/u.test(g);
    const hasEmojiVS = /\uFE0F/.test(g) && /\p{Emoji}/u.test(g);
    if (!hasPict && !hasEmojiVS) return false;
    if (/[\p{L}\p{N}]/u.test(g)) return false;
  }
  return true;
}

// Emoji game: EN = movies, ZH = 成语. Keep lists modest for v1.
const EMOJI_WORDS: Record<Lang, string[]> = {
  en: [
    "Titanic", "Jaws", "Frozen", "Avatar", "Inception", "The Lion King", "Harry Potter",
    "Star Wars", "Jurassic Park", "The Godfather", "Forrest Gump", "Spider-Man",
    "The Avengers", "Toy Story", "Finding Nemo", "The Matrix", "Gladiator",
    "Pirates of the Caribbean", "King Kong", "Godzilla", "Batman", "Superman",
    "Iron Man", "Black Panther", "Wonder Woman", "The Dark Knight", "Coco",
    "Up", "Wall-E", "Shrek", "Kung Fu Panda", "Despicable Me", "Minions",
    "The Little Mermaid", "Beauty and the Beast", "Aladdin", "Mulan", "Cinderella",
    "Snow White", "Sleeping Beauty", "Pinocchio", "Dumbo",
  ],
  zh: [
    "守株待兔", "掩耳盗铃", "亡羊补牢", "井底之蛙", "对牛弹琴",
    "指鹿为马", "刻舟求剑", "卧薪尝胆", "破釜沉舟", "四面楚歌", "草木皆兵",
    "打草惊蛇", "画饼充饥", "望梅止渴", "杯弓蛇影", "狐假虎威",
    "拔苗助长", "滥竽充数", "叶公好龙", "自相矛盾", "坐井观天",
    "胸有成竹", "一箭双雕", "一石二鸟", "九牛一毛", "百发百中", "千钧一发",
    "万马奔腾", "龙马精神", "虎虎生威", "鸡飞狗跳", "狗急跳墙", "兔死狐悲",
    "狐朋狗友", "狼吞虎咽", "龙飞凤舞", "凤毛麟角", "鹤立鸡群",
    "一目了然", "三心二意", "五颜六色", "七上八下", "八仙过海", "九死一生", "十全十美",
    "东山再起", "南辕北辙", "左顾右盼", "马到成功", "鸡犬不宁", "龙争虎斗",
    "火眼金睛", "风雨同舟", "花好月圆", "一帆风顺", "一鸣惊人", "三顾茅庐",
    "张牙舞爪", "眉开眼笑", "手舞足蹈", "心花怒放", "杯水车薪", "水到渠成",
    "纸上谈兵", "对症下药", "虎视眈眈", "龙潭虎穴", "羊入虎口", "鸡鸣狗盗",
    "月黑风高", "星星之火", "日新月异", "四面八方", "五光十色", "鹤发童颜",
    "落井下石", "瓜熟蒂落", "闻鸡起舞", "鸡毛蒜皮", "狗仗人势", "狼心狗肺",
    "蛇蝎心肠", "马不停蹄", "一丝不苟", "一诺千金", "三令五申", "前赴后继",
    "怒发冲冠", "水火不容", "雷厉风行", "电光火石", "一见钟情", "两全其美",
    "三阳开泰", "四季平安", "五福临门", "六六大顺", "七星高照", "八方来财",
    "九牛二虎", "十拿九稳",
    "一马当先", "一触即发", "一落千丈", "一针见血", "二话不说",
    "三生有幸", "四海一家", "五彩缤纷", "八面玲珑", "十万火急",
    "东张西望", "春暖花开", "秋高气爽", "风和日丽", "雨过天晴",
    "鸟语花香", "花前月下", "柳暗花明", "虎口余生", "狗尾续貂",
    "鼠目寸光", "牛刀小试", "羊肠小道", "马首是瞻", "龙凤呈祥",
    "鹏程万里", "鱼跃龙门", "眉飞色舞", "喜笑颜开", "泪流满面",
    "心直口快", "大材小用", "小题大做", "半途而废", "一曝十寒",
    "四通八达", "五脏六腑", "七嘴八舌", "十指连心", "东倒西歪",
    "南腔北调", "左思右想", "前所未有", "春风得意", "夏虫语冰",
    "秋收冬藏", "冬日暖阳", "风吹草动", "雨后春笋",
  ],
};

// Punchline prompts — open, silly fill-in-the-blanks. Everyone answers the same one each
// round, so they're deliberately broad enough for lots of different funny answers.
const PL_PROMPTS: Record<Lang, string[]> = {
  en: [
    "The worst possible name for a pet goldfish",
    "A terrible thing to say to your boss on your first day",
    "The real reason the dinosaurs went extinct",
    "A rejected flavor of ice cream",
    "The worst superpower to have",
    "Something you should never say on a first date",
    "A bad name for a boat",
    "The secret ingredient in grandma's cooking",
    "What aliens would find most confusing about humans",
    "A terrible slogan for a hospital",
    "The worst thing to find in your hotel room",
    "A weird reason to be late for work",
    "The most useless thing to bring to a deserted island",
    "What your cat is really thinking right now",
    "A bad name for a rock band",
    "The worst gift for a five-year-old",
    "A rejected Olympic sport",
    "Something you don't want to hear from your dentist",
    "The real reason the wifi is down",
    "A terrible theme for a wedding",
    "The worst topping to put on a pizza",
    "A bad excuse for missing the meeting",
    "The most embarrassing thing to shout in a quiet library",
    "A terrible name for a new perfume",
    "What you'd do with an extra pair of arms",
    "The worst advice to give a new parent",
    "A rejected ride at a theme park",
    "Something a ghost would post online",
    "The worst way to start a speech",
    "A terrible new feature for a phone",
    "A rejected superhero catchphrase",
    "The worst thing to say during a job interview",
    "A terrible name for a cruise ship",
    "What your phone is secretly judging you for",
    "The real reason your houseplants keep dying",
    "A bad theme for a children's birthday party",
    "The worst possible last words",
    "Something you'd regret teaching a parrot to say",
    "A rejected pizza chain slogan",
    "The most useless magic spell",
    "What dogs are really barking about",
    "A terrible name for a nightclub",
    "The worst thing to whisper during a wedding",
    "A rejected reality TV show",
    "The real reason the elevator is so slow",
    "Something you should never put in the microwave",
    "A bad name for a cologne",
    "The worst way to quit your job",
    "What the Wi-Fi router dreams about",
    "A terrible mascot for a bank",
    "The most awkward thing to bring to a potluck",
    "A rejected flavor of toothpaste",
    "The worst thing to find in your soup",
    "Something a robot would lie about",
    "A bad name for a racehorse",
    "The real reason you're always tired",
    "The worst superhero sidekick",
    "A terrible thing to name your Wi-Fi network",
    "What your smart speaker overhears the most",
    "A rejected cereal mascot",
    "The worst gift to regift",
    "Something you should never say to a police officer",
    "A bad name for a hair salon",
    "The most useless item in a survival kit",
    "The worst thing to say at a funeral",
    "A rejected national holiday",
    "What penguins gossip about",
    "A terrible name for a burger joint",
    "The real reason the meeting ran long",
    "Something no one should ever deep-fry",
    "A bad slogan for a dating app",
    "The worst thing to keep in your fridge",
    "A rejected Disney movie title",
    "What your car would say if it could talk",
    "The worst tattoo to get on your face",
    "A terrible name for a yoga studio",
    "The most embarrassing ringtone to go off in public",
    "What aliens would steal from Earth first",
    "A bad name for a spaceship",
    "The worst way to end a text message",
    "A rejected emoji",
    "The worst thing to be famous for",
    "A bad name for a coffee shop",
    "What your fridge does when you're asleep",
    "The real reason the cake is gone",
    "A terrible superhero costume",
    "Something you should never say to your barber",
    "The worst holiday gift from your in-laws",
    "A rejected amusement park mascot",
    "The most useless app on your phone",
    "What cats do when no one's home",
    "A bad name for a gym",
    "The worst thing to say to a bride",
    "A rejected candy flavor",
    "The real reason the printer never works",
    "Something you'd find in a wizard's junk drawer",
    "The worst pet to bring to work",
    "A terrible name for a law firm",
    "What your neighbors think you do all day",
    "The worst way to answer the phone",
    "A rejected motivational poster slogan",
    "The most embarrassing thing to keep in your wallet",
    "A bad name for a pizza topping",
    "What ghosts complain about",
    "The worst thing to build out of LEGO",
    "A terrible new Olympic mascot",
    "Something you should never bring on a plane",
    "The real reason the vending machine ate your money",
    "A bad name for a heavy metal band",
    "The worst souvenir to bring home",
    "What your dog thinks your job is",
    "A rejected ice cream truck jingle",
    "The worst thing to say to a doctor",
    "A terrible name for a spa",
    "What robots do on their day off",
    "The most useless kitchen gadget",
    "A bad slogan for an airline",
    "The worst thing to microwave at the office",
    "A rejected zoo attraction",
    "The strangest thing to collect",
  ],
  zh: [
    "给金鱼起的最烂的名字",
    "上班第一天最不该对老板说的话",
    "恐龙灭绝的真正原因",
    "一款被否决的冰淇淋口味",
    "最没用的超能力",
    "第一次约会绝对不能说的话",
    "给船起的烂名字",
    "奶奶做菜的秘密配料",
    "外星人最搞不懂人类的一点",
    "医院最不该用的宣传标语",
    "在酒店房间里最不想看到的东西",
    "迟到的奇葩理由",
    "带去荒岛最没用的东西",
    "你家猫此刻其实在想什么",
    "给乐队起的烂名字",
    "送给五岁小孩最糟糕的礼物",
    "一个被否决的奥运项目",
    "最不想从牙医嘴里听到的话",
    "网断了的真正原因",
    "最糟糕的婚礼主题",
    "披萨上最难吃的配料",
    "翘会最烂的借口",
    "在安静的图书馆里大喊出来最尴尬的一句话",
    "给新香水起的烂名字",
    "如果多出一双手你会用来干嘛",
    "给新手爸妈最烂的建议",
    "一个被否决的游乐园项目",
    "鬼会发什么朋友圈",
    "演讲最糟糕的开场白",
    "手机最烂的新功能",
    "一句被否决的超级英雄口头禅",
    "面试时最不该说的话",
    "给游轮起的烂名字",
    "你的手机在偷偷嫌弃你什么",
    "你养的植物老是死掉的真正原因",
    "儿童生日派对最糟糕的主题",
    "最烂的遗言",
    "教鹦鹉说了会后悔的一句话",
    "一句被否决的披萨店广告语",
    "最没用的魔法咒语",
    "狗其实在叫什么",
    "给夜店起的烂名字",
    "婚礼上最不该悄悄说的话",
    "一个被否决的真人秀节目",
    "电梯这么慢的真正原因",
    "绝对不能放进微波炉的东西",
    "给男士香水起的烂名字",
    "最烂的辞职方式",
    "路由器会做什么梦",
    "银行最烂的吉祥物",
    "带去聚餐最尴尬的一道菜",
    "一款被否决的牙膏口味",
    "在汤里最不想发现的东西",
    "机器人会撒谎说的一件事",
    "给赛马起的烂名字",
    "你总是很累的真正原因",
    "最烂的超级英雄搭档",
    "给自家 Wi-Fi 起的烂名字",
    "你的智能音箱最常偷听到什么",
    "一个被否决的麦片吉祥物",
    "最适合再转送出去的礼物",
    "绝对不该对警察说的话",
    "给理发店起的烂名字",
    "求生包里最没用的东西",
    "葬礼上最不该说的话",
    "一个被否决的法定节日",
    "企鹅之间会八卦什么",
    "给汉堡店起的烂名字",
    "会议超时的真正原因",
    "绝对不该拿去油炸的东西",
    "交友软件最烂的广告语",
    "冰箱里最不该放的东西",
    "一个被否决的迪士尼电影片名",
    "如果你的车会说话它会说什么",
    "最不该纹在脸上的纹身",
    "给瑜伽馆起的烂名字",
    "在公共场合突然响起最尴尬的手机铃声",
    "外星人会最先从地球偷走什么",
    "给宇宙飞船起的烂名字",
    "最烂的短信结尾方式",
    "一个被否决的表情符号",
    "最不想因为什么而出名",
    "给咖啡店起的烂名字",
    "你睡着后冰箱在干什么",
    "蛋糕不见了的真正原因",
    "最烂的超级英雄服装",
    "绝对不该对理发师说的话",
    "公婆送的最糟糕的节日礼物",
    "一个被否决的游乐园吉祥物",
    "你手机上最没用的 App",
    "家里没人时猫在干什么",
    "给健身房起的烂名字",
    "对新娘最不该说的话",
    "一款被否决的糖果口味",
    "打印机永远坏掉的真正原因",
    "巫师杂物抽屉里会有什么",
    "最不该带去上班的宠物",
    "给律师事务所起的烂名字",
    "邻居以为你整天在干什么",
    "最烂的接电话方式",
    "一句被否决的励志海报标语",
    "钱包里放着最尴尬的东西",
    "给披萨配料起的烂名字",
    "鬼会抱怨什么",
    "最不该用乐高拼出来的东西",
    "一个糟糕的新奥运吉祥物",
    "绝对不该带上飞机的东西",
    "自动售货机吞了你钱的真正原因",
    "给重金属乐队起的烂名字",
    "最烂的旅行纪念品",
    "你的狗以为你的工作是什么",
    "一段被否决的冰淇淋车音乐",
    "对医生最不该说的话",
    "给水疗馆起的烂名字",
    "机器人放假会干什么",
    "最没用的厨房小工具",
    "航空公司最烂的广告语",
    "在公司微波炉里最不该热的东西",
    "一个被否决的动物园景点",
    "最奇怪的收藏爱好",
  ],
};
// Balderdash words — obscure but real, with short true definitions.
// Expanded bank: 120 EN + 120 ZH.
const BD_WORDS: Record<Lang, Array<{ word: string; definition: string }>> = {
  en: [
    { word: "Bumfuzzle", definition: "To confuse or perplex" },
    { word: "Snollygoster", definition: "A clever, unscrupulous person" },
    { word: "Wamble", definition: "A stomach rumble" },
    { word: "Jentacular", definition: "Pertaining to breakfast" },
    { word: "Quockerwodger", definition: "A puppet politician" },
    { word: "Apricity", definition: "The warmth of the sun in winter" },
    { word: "Pandiculation", definition: "Stretching when you wake up" },
    { word: "Agelast", definition: "A person who never laughs" },
    { word: "Gongoozler", definition: "Someone who stares at canal boats" },
    { word: "Nudiustertian", definition: "Relating to the day before yesterday" },
    { word: "Ultracrepidarian", definition: "Someone who gives opinions beyond their knowledge" },
    { word: "Limerence", definition: "An intense, obsessive infatuation" },
    { word: "Kummerspeck", definition: "Weight gained from emotional eating" },
    { word: "Mamihlapinatapai", definition: "A look shared expecting the other to act" },
    { word: "Xertz", definition: "To gulp down quickly and greedily" },
    { word: "Zugzwang", definition: "A chess position where any move worsens you" },
    { word: "Petrichor", definition: "The smell of earth after rain" },
    { word: "Doodle sack", definition: "An old word for bagpipes" },
    { word: "Winklepicker", definition: "A shoe with a long pointed toe" },
    { word: "Borborygmus", definition: "A rumbling stomach noise" },
    { word: "Jouska", definition: "A hypothetical conversation you replay in your head" },
    { word: "Philtrum", definition: "The groove between nose and upper lip" },
    { word: "Erinaceous", definition: "Resembling a hedgehog" },
    { word: "Abibliophobia", definition: "Fear of running out of reading material" },
    { word: "Accismus", definition: "Pretending to be disinterested" },
    { word: "Aglet", definition: "The plastic tip of a shoelace" },
    { word: "Bibliosmia", definition: "The smell of old books" },
    { word: "Bloviate", definition: "To talk pompously and at length" },
    { word: "Cacography", definition: "Bad handwriting" },
    { word: "Cattywampus", definition: "Crooked, askew" },
    { word: "Chrysalism", definition: "Calm feeling indoors during a storm" },
    { word: "Clinomania", definition: "Excessive desire to stay in bed" },
    { word: "Coddiwomple", definition: "To travel toward a vague destination" },
    { word: "Collywobbles", definition: "Butterflies in the stomach" },
    { word: "Crapulence", definition: "Sickness from overeating or drinking" },
    { word: "Crepuscular", definition: "Active at dawn and dusk" },
    { word: "Defenestration", definition: "Throwing something out a window" },
    { word: "Desiderium", definition: "Longing for something lost" },
    { word: "Diaphanous", definition: "Light, delicate and translucent" },
    { word: "Elflock", definition: "Tangled hair, as if by elves" },
    { word: "Exiguous", definition: "Extremely small and meager" },
    { word: "Finifugal", definition: "Hating endings" },
    { word: "Floccinaucinihilipilification", definition: "The act of deeming something worthless" },
    { word: "Formication", definition: "Sensation of ants crawling on skin" },
    { word: "Fudgel", definition: "Pretending to work while doing nothing" },
    { word: "Funambulist", definition: "A tightrope walker" },
    { word: "Gardyloo", definition: "Warning shout before throwing waste from a window" },
    { word: "Glabella", definition: "The space between your eyebrows" },
    { word: "Griffonage", definition: "Careless handwriting" },
    { word: "Groke", definition: "To stare at people eating, hoping to be invited" },
    { word: "Halcyon", definition: "Denoting a happy golden time" },
    { word: "Hiraeth", definition: "Homesickness for a place that no longer exists" },
    { word: "Hobbledehoy", definition: "An awkward young man" },
    { word: "Impignorate", definition: "To pawn or mortgage something" },
    { word: "Inaniloquent", definition: "Talking foolishly" },
    { word: "Inchoate", definition: "Just begun, not fully formed" },
    { word: "Ineffable", definition: "Too great to describe in words" },
    { word: "Kalopsia", definition: "Seeing things as more beautiful than they are" },
    { word: "Kakistocracy", definition: "Government by the worst people" },
    { word: "Lagniappe", definition: "A small free gift" },
    { word: "Lalochezia", definition: "Relief felt from swearing" },
    { word: "Lucubration", definition: "Studying late into the night" },
    { word: "Meldrop", definition: "A drop of mucus at the tip of the nose" },
    { word: "Mellifluous", definition: "Sweet-sounding" },
    { word: "Merkin", definition: "A pubic wig" },
    { word: "Mumpsimus", definition: "Clinging to a wrong belief" },
    { word: "Nefelibata", definition: "One who lives in the clouds" },
    { word: "Nurdle", definition: "A tiny plastic pellet" },
    { word: "Obelus", definition: "The division sign ÷" },
    { word: "Octothorpe", definition: "The # symbol" },
    { word: "Omphalos", definition: "Navel, center of the world" },
    { word: "Oxter", definition: "Armpit (Scots word)" },
    { word: "Panglossian", definition: "Excessively optimistic" },
    { word: "Paresthesia", definition: "Pins-and-needles tingling" },
    { word: "Pauciloquent", definition: "Using few words" },
    { word: "Pluviophile", definition: "A lover of rain" },
    { word: "Pogonotrophy", definition: "The growing of a beard" },
    { word: "Psithurism", definition: "The sound of wind in trees" },
    { word: "Redamancy", definition: "Love returned in full" },
    { word: "Sempiternal", definition: "Eternal and unchanging" },
    { word: "Skedaddle", definition: "To run away quickly" },
    { word: "Slumgullion", definition: "A cheap meat stew" },
    { word: "Snickersnee", definition: "A knife fight" },
    { word: "Stelliferous", definition: "Full of stars" },
    { word: "Succedaneum", definition: "A substitute" },
    { word: "Syzygy", definition: "Alignment of three celestial bodies" },
    { word: "Tatterdemalion", definition: "A person in ragged clothes" },
    { word: "Tintinnabulation", definition: "The ringing of bells" },
    { word: "Tittle", definition: "The dot over i and j" },
    { word: "Tmesis", definition: "Splitting a word with another word inside" },
    { word: "Vellichor", definition: "Nostalgia felt in old bookshops" },
    { word: "Yex", definition: "To hiccup or burp" },
    { word: "Zephyr", definition: "A gentle breeze" },
    { word: "Zyzzyva", definition: "A tropical weevil, last word in the dictionary" },
    { word: "Dactylonomy", definition: "Counting on your fingers" },
    { word: "Dendrochronology", definition: "Dating events by tree rings" },
    { word: "Soprosyne", definition: "A healthy, balanced mind" },
    { word: "Ulotrichous", definition: "Having woolly hair" },
    { word: "Vermilion", definition: "A bright red pigment" },
    { word: "Spaghettification", definition: "Stretching by a black hole's gravity" },
    { word: "Lubber", definition: "A clumsy seaman" },
    { word: "Runcible", definition: "A three-pronged fork (nonsense word)" },
    { word: "Comeuppance", definition: "A deserved punishment" },
    { word: "Bumbershoot", definition: "An umbrella" },
    { word: "Bibble", definition: "To drink noisily" },
    { word: "Flummox", definition: "To confuse" },
    { word: "Mooncalf", definition: "A fool" },
    { word: "Pettifogger", definition: "A petty, unscrupulous lawyer" },
    { word: "Pratfall", definition: "A humiliating failure" },
    { word: "Swivet", definition: "A nervous sweat" },
    { word: "Smicker", definition: "An amorous glance" },
    { word: "Mollycoddle", definition: "To pamper excessively" },
    { word: "Callipygian", definition: "Having shapely buttocks" },
    { word: "Ephemeral", definition: "Lasting a very short time" },
    { word: "Finial", definition: "An ornament at the top of a spire" },
    { word: "Inglenook", definition: "A cozy corner by a fireplace" },
    { word: "Junto", definition: "A secret political group" },
    { word: "Kex", definition: "A dry, hollow plant stem" },
    { word: "Lache", definition: "A slothful person" },
  ],
  zh: [
    { word: "耄耋", definition: "八九十岁的年纪" },
    { word: "饕餮", definition: "贪吃的人，或传说中的凶兽" },
    { word: "龃龉", definition: "意见不合，发生争执" },
    { word: "踟蹰", definition: "犹豫不决，徘徊不前" },
    { word: "魍魉", definition: "山川中的精怪" },
    { word: "旖旎", definition: "柔美、婀娜多姿的样子" },
    { word: "鳏寡", definition: "老而无妻无夫的人" },
    { word: "叕", definition: "双又叠加，意为又、再" },
    { word: "焱", definition: "火焰旺盛的样子" },
    { word: "犄角", definition: "角落，或兽角" },
    { word: "彳亍", definition: "慢慢走，徘徊" },
    { word: "魑魅", definition: "传说中的山林鬼怪" },
    { word: "耆老", definition: "年高德重的人" },
    { word: "捯饬", definition: "打扮、收拾" },
    { word: "咂摸", definition: "仔细品味、琢磨" },
    { word: "熨帖", definition: "心里舒坦、妥帖" },
    { word: "齉", definition: "鼻子不通气" },
    { word: "曱甴", definition: "蟑螂（粤语说法）" },
    { word: "猢狲", definition: "猴子，泛指猴类" },
    { word: "蹀躞", definition: "小步行走的样子" },
    { word: "耽搁", definition: "拖延、停留" },
    { word: "邂逅", definition: "不期而遇" },
    { word: "缱绻", definition: "情意深厚，难分难舍" },
    { word: "霁月", definition: "雨后明朗的月亮" },
    { word: "鹣鲽", definition: "比翼鸟，比喻恩爱夫妻" },
    { word: "豆蔻", definition: "十三四岁的少女" },
    { word: "及笄", definition: "女子十五岁成年礼" },
    { word: "弱冠", definition: "男子二十岁成年" },
    { word: "而立", definition: "三十岁" },
    { word: "不惑", definition: "四十岁" },
    { word: "知天命", definition: "五十岁" },
    { word: "花甲", definition: "六十岁" },
    { word: "古稀", definition: "七十岁" },
    { word: "喜寿", definition: "七十七岁" },
    { word: "伞寿", definition: "八十岁" },
    { word: "米寿", definition: "八十八岁" },
    { word: "卒寿", definition: "九十岁" },
    { word: "白寿", definition: "九十九岁" },
    { word: "茶寿", definition: "一百零八岁" },
    { word: "獬豸", definition: "能辨曲直的传说神兽" },
    { word: "貔貅", definition: "招财辟邪的神兽" },
    { word: "赑屃", definition: "驮石碑的龟形龙子" },
    { word: "螭吻", definition: "殿脊上的龙头大兽" },
    { word: "蒲牢", definition: "爱鸣叫的龙子，钟上兽纽" },
    { word: "狴犴", definition: "好诉讼的龙子，牢门装饰" },
    { word: "睚眦", definition: "好杀斗的龙子，刀环装饰" },
    { word: "嘲风", definition: "好冒险的龙子，殿角小兽" },
    { word: "椒图", definition: "好闭守的龙子，门上铺首" },
    { word: "虺", definition: "小蛇" },
    { word: "蚺", definition: "大蟒蛇" },
    { word: "蜃", definition: "大蛤蜊，吐气成海市蜃楼" },
    { word: "埙", definition: "陶土吹奏乐器" },
    { word: "笙", definition: "多管竹制簧乐器" },
    { word: "篪", definition: "竹制管乐器" },
    { word: "鼙鼓", definition: "军中战鼓" },
    { word: "刁斗", definition: "军用铜锅，兼做报警器" },
    { word: "斥候", definition: "侦察兵" },
    { word: "烽燧", definition: "烽火台" },
    { word: "阡陌", definition: "田间小路" },
    { word: "菽粟", definition: "豆和谷，泛指粮食" },
    { word: "黍稷", definition: "黄米和小米，泛指庄稼" },
    { word: "醴", definition: "甜酒" },
    { word: "觥筹", definition: "酒杯和筹码，指宴饮" },
    { word: "脍炙", definition: "切细的肉和烤肉，比喻人人赞美" },
    { word: "鳜鱼", definition: "淡水名贵鱼，桂鱼" },
    { word: "雩", definition: "求雨的祭祀" },
    { word: "禳", definition: "祈福消灾的仪式" },
    { word: "傩", definition: "驱疫逐鬼的仪式" },
    { word: "筮", definition: "用蓍草占卜" },
    { word: "籀文", definition: "大篆，古代文字" },
    { word: "冢", definition: "坟墓" },
    { word: "陵寝", definition: "帝王的墓地" },
    { word: "明器", definition: "陪葬用的器物" },
    { word: "俑", definition: "陪葬的陶木人像" },
    { word: "顿首", definition: "磕头，最重的敬礼" },
    { word: "稽首", definition: "跪拜到地的大礼" },
    { word: "叉手", definition: "古代拱手礼" },
    { word: "袂", definition: "袖子" },
    { word: "衿", definition: "衣领" },
    { word: "笄", definition: "古代簪子" },
    { word: "钏", definition: "手镯" },
    { word: "步摇", definition: "戴在头上会晃动的饰物" },
    { word: "花钿", definition: "贴在额头的花饰" },
    { word: "傅粉", definition: "涂抹白粉化妆" },
    { word: "箕踞", definition: "张开腿坐，形容不拘礼节" },
    { word: "斋戒", definition: "祭祀前沐浴禁食" },
    { word: "盥洗", definition: "洗手洗脸" },
    { word: "栉沐", definition: "梳头洗头" },
    { word: "蟾宫", definition: "月宫" },
    { word: "桂魄", definition: "月亮的别称" },
    { word: "衾枕", definition: "被褥枕头，借指夫妻" },
    { word: "纶巾", definition: "古代文人头巾" },
    { word: "鹤氅", definition: "用鹤羽做的大衣" },
    { word: "缁衣", definition: "黑色僧衣" },
    { word: "磬", definition: "古代石制乐器" },
    { word: "醪", definition: "浊酒" },
    { word: "飨", definition: "用酒食招待客人" },
    { word: "混沌", definition: "传说中的凶兽之一" },
    { word: "穷奇", definition: "传说中的凶兽" },
    { word: "梼杌", definition: "传说中的凶兽" },
    { word: "衙署", definition: "官府衙门" },
    { word: "俸禄", definition: "官员的薪水" },
    { word: "金文", definition: "青铜器上的铭文" },
    { word: "隶书", definition: "汉代通行的书体" },
    { word: "楷书", definition: "端正的正书" },
    { word: "草书", definition: "潦草快速的书体" },
    { word: "窀穸", definition: "墓穴" },
    { word: "翁仲", definition: "墓前石人像" },
    { word: "万福", definition: "古代女子行礼祝福语" },
    { word: "佩", definition: "系在腰间的玉饰" },
    { word: "璎珞", definition: "颈部珠宝饰物" },
    { word: "黛", definition: "画眉的青黑色颜料" },
    { word: "点绛", definition: "点口红" },
    { word: "唱喏", definition: "宋代的揖礼" },
    { word: "长揖", definition: "深深作揖" },
    { word: "巾栉", definition: "毛巾和梳子，泛指服侍" },
    { word: "木鱼", definition: "佛教敲击法器" },
    { word: "饔飧", definition: "早晚饭，泛指饮食" },
    { word: "觋", definition: "男巫" },
    { word: "祓", definition: "除灾求福的仪式" },
  ],
};
const FINAL_GUESS_SECONDS = 30;
const FA_TURN_SECONDS = 10;
const FA_LAPS = 2;
const MAX_PLAYERS = 6;
const MAX_MESSAGES = 100;
const SCORE_BY_RANK = [100, 80, 60, 40, 20];
const HOST_TRANSFER_GRACE_MS = 60 * 1000;
const PLAYER_RECONNECT_GRACE_MS = 2 * 60 * 1000;
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000; // recycle a room 10 min after everyone leaves

type WordBank = { en: Record<string, string[]>; zh: Record<string, string[]> };
type PhraseBank = { en: string[]; zh: string[] };

const PICTIONARY_WORDS: WordBank = {
  en: {
    Animal: ["cat", "dog", "penguin", "butterfly", "snail", "elephant", "panda", "dinosaur", "owl", "shark", "jellyfish", "rabbit", "frog", "bee", "fox", "whale", "crocodile", "dolphin", "peacock"],
    Food: ["apple", "birthday cake", "cupcake", "hamburger", "ice cream", "pumpkin", "banana", "donut", "sushi", "noodles", "egg", "corn", "lollipop", "pineapple"],
    Nature: ["sun", "moon", "tree", "waterfall", "volcano", "rainbow", "mountain", "tornado", "snowflake", "spider web", "rainstorm", "cactus", "cloud", "star", "island", "cave", "forest", "river", "lightning"],
    Object: ["guitar", "clock", "umbrella", "key", "anchor", "kite", "ladder", "mailbox", "piano", "trophy", "traffic light", "telescope", "snow globe", "treasure map", "skateboard", "suitcase", "camera", "scarecrow", "scissors", "hammer", "balloon", "backpack", "toothbrush", "headphones", "candle"],
    Place: ["house", "igloo", "castle", "beach", "lighthouse", "treehouse", "greenhouse", "windmill", "roller coaster", "carousel", "sandcastle", "bridge", "aquarium", "stadium", "farm", "hospital", "school"],
    Vehicle: ["rocket", "submarine", "spaceship", "hot air balloon", "fire truck", "yacht", "bicycle", "train", "helicopter", "tractor", "scooter", "canoe", "ambulance"],
    Fantasy: ["dragon", "ghost", "mermaid", "robot", "unicorn", "wizard hat", "witch", "fairy", "zombie", "alien", "genie", "phoenix"],
  },
  zh: {
    动物: ["猫", "狗", "企鹅", "蝴蝶", "蜗牛", "大象", "熊猫", "恐龙", "猫头鹰", "鲨鱼", "水母", "兔子", "青蛙", "蜜蜂", "狐狸", "鲸鱼", "鳄鱼", "海豚", "孔雀"],
    食物: ["苹果", "生日蛋糕", "纸杯蛋糕", "汉堡", "冰淇淋", "南瓜", "香蕉", "甜甜圈", "寿司", "面条", "鸡蛋", "玉米", "棒棒糖", "菠萝"],
    自然: ["太阳", "月亮", "树", "瀑布", "火山", "彩虹", "高山", "龙卷风", "雪花", "蜘蛛网", "暴风雨", "仙人掌", "云", "星星", "岛屿", "山洞", "森林", "河流", "闪电"],
    物品: ["吉他", "时钟", "雨伞", "钥匙", "船锚", "风筝", "梯子", "邮箱", "钢琴", "奖杯", "红绿灯", "望远镜", "雪花玻璃球", "藏宝图", "滑板", "行李箱", "照相机", "稻草人", "剪刀", "锤子", "气球", "背包", "牙刷", "耳机", "蜡烛"],
    地点: ["房子", "冰屋", "城堡", "沙滩", "灯塔", "树屋", "温室", "风车", "过山车", "旋转木马", "沙堡", "长城", "桥", "水族馆", "体育场", "农场", "医院", "学校"],
    交通: ["火箭", "潜水艇", "飞船", "热气球", "消防车", "游艇", "自行车", "火车", "直升机", "拖拉机", "滑板车", "独木舟", "救护车"],
    奇幻: ["龙", "幽灵", "美人鱼", "机器人", "独角兽", "巫师帽", "女巫", "仙女", "僵尸", "外星人", "神灯精灵", "凤凰"],
  },
};

const CHARADES_WORDS: WordBank = {
  en: {
    Everyday: ["brushing teeth", "tying shoelaces", "blowing out candles", "sneezing", "putting on makeup", "washing a window", "opening a stuck jar", "baking cookies", "making pizza dough", "taking a selfie", "flipping a pancake", "combing hair", "vacuuming", "ironing a shirt", "peeling a banana", "stirring soup"],
    Sports: ["ice skating", "playing basketball", "surfing a wave", "bowling", "playing tennis", "jumping rope", "boxing", "scuba diving", "climbing a mountain", "swimming", "skiing", "doing push-ups", "kicking a soccer ball", "lifting weights"],
    Talent: ["playing air guitar", "doing a magic trick", "juggling fruit", "conducting an orchestra", "dancing ballet", "shooting an arrow", "painting a wall", "playing the drums", "doing a cartwheel", "spinning a basketball"],
    Outdoors: ["walking a dog", "riding a horse", "flying a kite", "fishing", "building a tent", "chopping wood", "milking a cow", "rowing a boat", "catching a butterfly", "directing traffic", "climbing a ladder", "sneaking past a guard", "walking through a spiderweb", "landing on the moon", "escaping quicksand", "doing yoga", "fixing a robot", "finding a hidden key", "planting a tree", "raking leaves", "paddling a kayak", "hailing a taxi"],
  },
  zh: {
    日常: ["刷牙", "系鞋带", "吹蜡烛", "打喷嚏", "化妆", "擦窗户", "打开卡住的罐子", "烤饼干", "揉披萨面团", "自拍", "翻煎饼", "梳头", "吸尘", "熨衬衫", "剥香蕉", "搅汤"],
    运动: ["滑冰", "打篮球", "冲浪", "打保龄球", "打网球", "跳绳", "打拳击", "深海潜水", "爬山", "游泳", "滑雪", "做俯卧撑", "踢足球", "举重"],
    才艺: ["弹空气吉他", "变魔术", "杂耍水果", "指挥乐队", "跳芭蕾", "射箭", "刷墙", "打鼓", "侧手翻", "转篮球"],
    户外: ["遛狗", "骑马", "放风筝", "钓鱼", "搭帐篷", "劈柴", "挤牛奶", "划船", "抓蝴蝶", "指挥交通", "爬梯子", "溜过警卫", "穿过蜘蛛网", "登上月球", "从流沙里逃脱", "做瑜伽", "修理机器人", "找到隐藏的钥匙", "种树", "耙树叶", "划皮划艇", "打车"],
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
    "a lion getting a haircut", "a cat playing chess", "a dog delivering mail",
    "a robot watering plants", "an elephant on a trampoline", "a penguin baking a cake",
    "a shark reading a map", "a wizard riding a scooter", "a dinosaur painting a fence",
    "a snowman surfing", "a fox flying a kite", "a bear playing basketball",
    "a mermaid combing her hair",
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
    "下棋的猫", "送信的狗", "给植物浇水的机器人", "在蹦床上的大象", "烤蛋糕的企鹅",
    "看地图的鲨鱼", "骑滑板车的巫师", "刷栅栏的恐龙", "冲浪的雪人", "放风筝的狐狸",
    "打篮球的熊", "梳头的美人鱼",
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
    ["pancake", "waffle"], ["orange", "tangerine"], ["frog", "toad"], ["hat", "helmet"],
    ["scarf", "tie"], ["duck", "goose"], ["magician", "clown"], ["library", "bookstore"],
    ["cookie", "biscuit"], ["ukulele", "guitar"], ["bee", "wasp"], ["kite", "balloon"],
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
    ["煎饼", "华夫饼"], ["橙子", "橘子"], ["青蛙", "蟾蜍"], ["帽子", "头盔"],
    ["围巾", "领带"], ["鸭子", "鹅"], ["魔术师", "小丑"], ["图书馆", "书店"],
    ["曲奇", "饼干"], ["尤克里里", "吉他"], ["蜜蜂", "黄蜂"], ["风筝", "气球"],
  ],
};

// In Sync (心有灵序): spectrum end-concepts [left, right].
const IN_SYNC_SCALES: Array<{ en: [string, string]; zh: [string, string] }> = [
  { en: ["ice-cold", "lava-hot"], zh: ["冰块一样冷", "岩浆一样热"] },
  { en: ["library quiet", "stadium loud"], zh: ["图书馆般安静", "体育场般吵"] },
  { en: ["snail pace", "rocket speed"], zh: ["蜗牛速度", "火箭速度"] },
  { en: ["featherlight", "impossible to lift"], zh: ["轻如羽毛", "根本搬不动"] },
  { en: ["cloud-soft", "rock-hard"], zh: ["云朵般软", "石头般硬"] },
  { en: ["candle-dim", "blindingly bright"], zh: ["烛光微亮", "亮到睁不开眼"] },
  { en: ["bone-dry", "soaking wet"], zh: ["干得冒烟", "湿透了"] },
  { en: ["tiny", "blocks the skyline"], zh: ["小不点", "遮住天际线"] },
  { en: ["five seconds", "a whole lifetime"], zh: ["五秒钟", "一辈子"] },
  { en: ["effortless", "nearly impossible"], zh: ["毫不费力", "几乎不可能"] },
  { en: ["instantly obvious", "brain-melting"], zh: ["一眼就懂", "烧脑到冒烟"] },
  { en: ["perfectly calm", "total chaos"], zh: ["风平浪静", "彻底失控"] },
  { en: ["mildly fun", "unforgettable"], zh: ["有一点好玩", "一辈子忘不了"] },
  { en: ["tiny letdown", "soul-crushing"], zh: ["小小失望", "心态彻底崩了"] },
  { en: ["mildly annoying", "villain origin story"], zh: ["有点烦", "黑化起点"] },
  { en: ["minor inconvenience", "day ruined"], zh: ["一点不方便", "一整天毁了"] },
  { en: ["tiny mistake", "changes history"], zh: ["小失误", "改变历史"] },
  { en: ["slightly awkward", "move to a new country"], zh: ["略微尴尬", "想换个国家生活"] },
  { en: ["a little blush", "delete all socials"], zh: ["脸红一下", "连夜注销账号"] },
  { en: ["white lie", "friendship-ending lie"], zh: ["善意小谎", "友尽级谎言"] },
  { en: ["harmless prank", "never speak again"], zh: ["无伤大雅", "从此绝交"] },
  { en: ["barely know them", "knows every secret"], zh: ["点头之交", "知道所有秘密"] },
  { en: ["tiny crush", "planning the wedding"], zh: ["一点心动", "婚礼都想好了"] },
  { en: ["just friendly", "wildly flirty"], zh: ["纯友好", "疯狂暧昧"] },
  { en: ["small favor", "owe you for life"], zh: ["举手之劳", "欠你一辈子"] },
  { en: ["casual hobby", "whole personality"], zh: ["随便玩玩", "整个人设都是它"] },
  { en: ["small talk", "entire life story"], zh: ["随口寒暄", "人生故事全说了"] },
  { en: ["quiet hangout", "legendary party"], zh: ["安静小聚", "传说级派对"] },
  { en: ["completely sober", "dancing on tables"], zh: ["完全清醒", "站桌上跳舞"] },
  { en: ["pajamas", "red carpet"], zh: ["睡衣出门", "红毯造型"] },
  { en: ["bedhead", "runway hair"], zh: ["刚睡醒的头发", "秀场发型"] },
  { en: ["light snack", "royal feast"], zh: ["垫垫肚子", "皇室盛宴"] },
  { en: ["a little hungry", "could eat the table"], zh: ["有一点饿", "桌子都能吃了"] },
  { en: ["instant noodles", "Michelin-worthy"], zh: ["泡面水平", "米其林水平"] },
  { en: ["weak coffee", "see through time"], zh: ["咖啡味的水", "喝完看穿时间"] },
  { en: ["pleasantly cool", "instant brain freeze"], zh: ["清凉刚好", "瞬间脑冻"] },
  { en: ["no spice", "breathing fire"], zh: ["完全不辣", "辣到喷火"] },
  { en: ["normal portion", "food challenge"], zh: ["正常饭量", "大胃王挑战"] },
  { en: ["safe topping", "culinary crime"], zh: ["稳妥配料", "美食犯罪"] },
  { en: ["bite-sized", "unhinge your jaw"], zh: ["一口一个", "得把下巴卸掉"] },
  { en: ["one episode", "binge until sunrise"], zh: ["只看一集", "追到天亮"] },
  { en: ["background tune", "stuck in your head"], zh: ["背景音乐", "脑内循环"] },
  { en: ["forgettable movie", "instant classic"], zh: ["看完就忘", "当场封神"] },
  { en: ["background extra", "main-character energy"], zh: ["路人甲", "主角光环"] },
  { en: ["tutorial enemy", "final boss"], zh: ["新手村小怪", "终极 Boss"] },
  { en: ["slightly spooky", "lights on all night"], zh: ["有点阴森", "整夜不敢关灯"] },
  { en: ["cozy cabin", "definitely haunted"], zh: ["温馨小屋", "绝对闹鬼"] },
  { en: ["safe to pet", "run for your life"], zh: ["放心摸", "赶紧逃命"] },
  { en: ["tiny bug", "burn the house down"], zh: ["小虫一只", "房子不要了"] },
  { en: ["light drizzle", "biblical flood"], zh: ["毛毛雨", "末日洪水"] },
  { en: ["gentle breeze", "furniture flying"], zh: ["微风拂面", "家具起飞"] },
  { en: ["small puddle", "ocean crossing"], zh: ["小水坑", "横渡大洋"] },
  { en: ["short stroll", "epic quest"], zh: ["散个小步", "史诗远征"] },
  { en: ["speed bump", "Mount Everest"], zh: ["小土坡", "珠穆朗玛峰"] },
  { en: ["quick errand", "all-day mission"], zh: ["顺路办一下", "一整天任务"] },
  { en: ["relaxing vacation", "survival show"], zh: ["躺平度假", "荒野求生"] },
  { en: ["warm-up", "Olympic final"], zh: ["热热身", "奥运决赛"] },
  { en: ["friendly match", "lifelong rivalry"], zh: ["友谊赛", "宿敌之战"] },
  { en: ["easy level", "rage-quit level"], zh: ["闭眼都能过", "气到摔手柄"] },
  { en: ["casual fan", "walking encyclopedia"], zh: ["随便看看", "行走的百科全书"] },
  { en: ["ignore it", "drop everything"], zh: ["不用管", "立刻放下一切"] },
  { en: ["battery is fine", "find a charger now"], zh: ["电量很安心", "马上找充电器"] },
  { en: ["one snapshot", "full photoshoot"], zh: ["随手一拍", "完整写真"] },
  { en: ["waits patiently", "losing their mind"], zh: ["耐心等待", "等到发疯"] },
  { en: ["basically on time", "the event is over"], zh: ["基本准时", "活动都结束了"] },
  { en: ["reasonable alarm", "criminally early"], zh: ["正常闹钟", "早得犯法"] },
  { en: ["pleasant weather", "cancel all plans"], zh: ["适合出门", "取消全部计划"] },
  { en: ["pocket change", "financial disaster"], zh: ["零花钱", "财务灾难"] },
  { en: ["simple gift", "story for years"], zh: ["普通礼物", "能讲好多年"] },
  { en: ["small glitch", "system meltdown"], zh: ["小故障", "系统全面崩溃"] },
  { en: ["nobody believes it", "airtight excuse"], zh: ["没人会信", "无懈可击"] },
  { en: ["one sentence", "needs a conspiracy wall"], zh: ["一句话说清", "得画满一面墙"] },
  { en: ["ordinary coincidence", "full conspiracy"], zh: ["普通巧合", "惊天阴谋"] },
  { en: ["old-fashioned", "from the future"], zh: ["很复古", "来自未来"] },
  { en: ["local secret", "world-famous"], zh: ["本地人才知道", "全世界都知道"] },
  { en: ["quick doodle", "museum masterpiece"], zh: ["随手涂鸦", "博物馆名作"] },
  { en: ["perfectly ordinary", "pure magic"], zh: ["平平无奇", "简直有魔法"] },
  { en: ["barely funny", "can't breathe laughing"], zh: ["有一点好笑", "笑到不能呼吸"] },
  { en: ["mild surprise", "life-changing twist"], zh: ["小惊喜", "人生大反转"] },
  { en: ["very cautious", "famous last words"], zh: ["谨慎得很", "经典遗言"] },
  { en: ["a little dramatic", "soap-opera finale"], zh: ["有点戏多", "八点档大结局"] },
  { en: ["just enough", "wildly excessive"], zh: ["刚刚好", "夸张过头"] },
  { en: ["quiet wallflower", "owns the room"], zh: ["安静小透明", "全场焦点"] },
  { en: ["easy choice", "existential crisis"], zh: ["秒选", "选择困难到怀疑人生"] },
  { en: ["maybe send a text", "call right now"], zh: ["发个消息就行", "现在立刻打电话"] },
  { en: ["easy to share", "guard with your life"], zh: ["随便分享", "拼命护住"] },
  { en: ["nobody notices", "the room goes silent"], zh: ["没人注意", "全场突然安静"] },
  { en: ["maybe someday", "bucket-list must"], zh: ["有机会再说", "此生必做"] },
  { en: ["looks cheap", "absurdly luxurious"], zh: ["一眼廉价", "奢华得离谱"] },
  { en: ["deeply niche", "everyone knows it"], zh: ["极其小众", "人尽皆知"] },
  { en: ["criminally underrated", "wildly overrated"], zh: ["被严重低估", "被吹上天"] },
  { en: ["bare minimum", "years of effort"], zh: ["最低限度", "多年心血"] },
  { en: ["harmless rumor", "headline news"], zh: ["无伤传闻", "头条新闻"] },
  { en: ["tiny secret", "state secret"], zh: ["小秘密", "国家机密"] },
  { en: ["low commitment", "no turning back"], zh: ["随时退出", "没有回头路"] },
  { en: ["fine roommate habit", "move out tonight"], zh: ["室友小习惯", "今晚就搬走"] },
  { en: ["okay first date", "tell the grandchildren"], zh: ["还行的约会", "讲给孙辈听"] },
  { en: ["lazy Sunday", "need a vacation after"], zh: ["懒散周日", "结束后还要休假"] },
  { en: ["tiny celebration", "national holiday"], zh: ["小小庆祝", "全国放假庆祝"] },
  { en: ["background smell", "evacuate the building"], zh: ["淡淡气味", "整栋楼撤离"] },
  { en: ["slightly sticky", "industrial glue"], zh: ["有点黏", "工业强力胶"] },
  { en: ["clean enough", "hazmat suit needed"], zh: ["还算干净", "得穿防化服"] },
  { en: ["polite applause", "standing ovation"], zh: ["礼貌鼓掌", "全场起立欢呼"] },
  { en: ["barely competitive", "friendship test"], zh: ["佛系参与", "友谊大考验"] },
  { en: ["common pet", "mythical creature"], zh: ["常见宠物", "神话生物"] },
  { en: ["easy to draw", "impossible to draw"], zh: ["很好画", "根本画不出来"] },
  { en: ["child's play", "experts only"], zh: ["小菜一碟", "专家限定"] },
  { en: ["quick fix", "rebuild everything"], zh: ["随手修好", "全部推倒重来"] },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function tokenHashesMatch(actual: string, expected: string): boolean {
  const decode = (value: string): Uint8Array => {
    if (!/^[0-9a-f]{64}$/.test(value)) return new Uint8Array(32);
    return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
  };
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean;
  };
  return subtle.timingSafeEqual(decode(actual), decode(expected));
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
  }

  private ensureSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS state (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
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

  async preview(): Promise<{ hostName: string } | null> {
    const stateTable = this.ctx.storage.sql
      .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'state' LIMIT 1")
      .toArray()[0];
    if (!stateTable) return null;

    const row = this.ctx.storage.sql
      .exec<{ body: string }>("SELECT body FROM state WHERE id = ?", "room")
      .toArray()[0];
    if (!row) return null;

    try {
      const state = JSON.parse(row.body) as unknown;
      if (!isRecord(state) || typeof state.createdAt !== "number" || state.createdAt === 0 || !Array.isArray(state.players)) {
        return null;
      }
      const host = state.players.find(
        (player): player is Record<string, unknown> => isRecord(player) && player.host === true,
      );
      return host && typeof host.name === "string" ? { hostName: asText(host.name, "Host", 18) } : null;
    } catch {
      return null;
    }
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

    if (command.type !== "join" && !this.session(ws)) {
      this.error(ws, "Join the room first.");
      return;
    }
    if (command.type === "join" && this.session(ws)) {
      this.error(ws, "Already joined.");
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
      case "wvReady":
        await this.wvReady(ws, command.payload);
        break;
      case "wvPlace":
        await this.wvPlace(ws, command.payload);
        break;
      case "wvNext":
        await this.wvNext(ws);
        break;
      case "faPass":
        await this.faPass(ws);
        break;
      case "faVote":
        await this.faVote(ws, command.payload);
        break;
      case "faTally":
        await this.faTally(ws);
        break;
      case "faProceed":
        await this.faProceed(ws);
        break;
      case "tpText":
        await this.tpSubmit(ws, "text", command.payload);
        break;
      case "tpDraw":
        await this.tpSubmit(ws, "draw", command.payload);
        break;
      case "tpInspire":
        this.tpInspire(ws);
        break;
      case "tpReveal":
        await this.tpReveal(ws, command.payload);
        break;
      case "plAnswer":
        await this.plAnswer(ws, command.payload);
        break;
      case "plVote":
        await this.plVote(ws, command.payload);
        break;
      case "bdDefine":
        await this.bdDefine(ws, command.payload);
        break;
      case "bdVote":
        await this.bdVote(ws, command.payload);
        break;
      case "bdSkip":
        await this.bdSkip(ws);
        break;
      case "bdHint":
        await this.bdHint(ws);
        break;
      case "emSubmit":
        await this.emSubmit(ws, command.payload);
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
    await this.disconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.disconnect(ws);
    try {
      ws.close(1011, "socket error");
    } catch {
      // The socket can already be closed.
    }
  }

  async alarm(): Promise<void> {
    const state = this.load();
    const now = Date.now();

    // Keep the entire room available for reconnection while everybody is away.
    if (this.ctx.getWebSockets().length === 0) {
      if (state.emptyAt && now - state.emptyAt >= EMPTY_ROOM_TTL_MS) {
        await this.purgeRoom();
        return;
      }
      const emptyAt = state.emptyAt || now;
      state.emptyAt = emptyAt;
      this.save(state);
      await this.schedule(state);
      return;
    }

    if (state.emptyAt) {
      state.emptyAt = 0;
      this.save(state);
    }

    const disconnectedHost = state.players.find(
      (player) => player.host && !player.connected && player.disconnectedAt,
    );
    if (
      disconnectedHost?.disconnectedAt &&
      now - disconnectedHost.disconnectedAt >= HOST_TRANSFER_GRACE_MS
    ) {
      disconnectedHost.host = false;
      this.ensureHost(state);
      const nextHost = state.players.find((player) => player.host);
      if (nextHost) this.system(state, `${nextHost.name} is now the host`);
      this.save(state);
      await this.schedule(state);
      this.broadcast(state);
      return;
    }

    const expiredPlayer = state.players.find(
      (player) => !player.connected && player.disconnectedAt && now - player.disconnectedAt >= PLAYER_RECONNECT_GRACE_MS,
    );
    if (expiredPlayer) {
      await this.removePlayer(state, expiredPlayer.id, "did not reconnect");
      return;
    }

    if (state.game === "yarnpals") {
      // Countdown finished — announce is over, kick off the match.
      if (state.phase === "teams") {
        state.phase = "playing";
        this.save(state);
        await this.schedule(state);
        this.broadcast(state);
      } else {
        await this.schedule(state);
      }
      return;
    }

    if (state.phase !== "playing") {
      await this.schedule(state);
      return;
    }

    if (state.game === "passthepen") {
      const round = state.round;
      if (!round?.turnStartedAt) {
        await this.schedule(state);
        return;
      }
      if (this.turnTimeLeft(state) <= 0) {
        await this.advanceTurn(state);
      } else {
        await this.schedule(state);
      }
      return;
    }

    if (state.game === "fakeartist") {
      const fa = state.fakeartist;
      if (!fa || fa.sub !== "draw") {
        await this.schedule(state);
        return;
      }
      if (this.faTurnTimeLeft(state) <= 0) {
        await this.faAdvanceTurn(state);
      } else {
        await this.schedule(state);
      }
      return;
    }

    if (state.game === "punchline") {
      const pl = state.punchline;
      if (!pl) {
        await this.schedule(state);
        return;
      }
      if (pl.sub === "answer") {
        if (this.plTimeLeft(state) <= 0) {
          this.plStartVoting(state);
          this.save(state);
          await this.schedule(state);
          this.broadcast(state);
        } else {
          await this.schedule(state);
        }
        return;
      }
      if (pl.sub === "vote") {
        if (this.plTimeLeft(state) <= 0) {
          if (pl.revealed) this.plAdvanceRound(state);
          else this.plResolveRound(state);
          this.save(state);
          await this.schedule(state);
          this.broadcast(state);
        } else {
          await this.schedule(state);
        }
        return;
      }
      await this.schedule(state);
      return;
    }

    if (state.game === "balderdash") {
      const bd = state.balderdash;
      if (!bd) {
        await this.schedule(state);
        return;
      }
      if (bd.sub === "define") {
        if (this.bdTimeLeft(state) <= 0) {
          this.bdStartVoting(state);
          this.save(state);
          await this.schedule(state);
          this.broadcast(state);
        } else {
          await this.schedule(state);
        }
        return;
      }
      if (bd.sub === "vote") {
        if (this.bdTimeLeft(state) <= 0) {
          if (bd.revealed) this.bdAdvanceRound(state);
          else this.bdResolveRound(state);
          this.save(state);
          await this.schedule(state);
          this.broadcast(state);
        } else {
          await this.schedule(state);
        }
        return;
      }
      await this.schedule(state);
      return;
    }

    if (!state.round?.word) {
      await this.schedule(state);
      return;
    }

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
      await this.purgeRoom();
      return;
    }

    if (create && state.createdAt !== 0) {
      this.error(ws, "Room code is already in use. Please try again.");
      ws.close(1008, "room exists");
      return;
    }

    const name = asText(payload.player.name, "Player", 18);
    const color = asColor(payload.player.color);
    const suppliedToken = typeof payload.reconnectToken === "string" ? payload.reconnectToken.trim().toLowerCase() : "";
    const suppliedHash = /^[0-9a-f]{64}$/.test(suppliedToken) ? await hashToken(suppliedToken) : "";
    let existing = suppliedHash
      ? state.players.find(
          (player) => !!player.resumeTokenHash && tokenHashesMatch(suppliedHash, player.resumeTokenHash),
        )
      : undefined;
    let reconnectToken = suppliedToken;

    // One-release migration path for rooms created by the old client, which only
    // knew a tab-scoped player ID and had no reconnect token.
    if (!existing && !suppliedToken) {
      const legacyId = asText(payload.player.id, "", 80);
      existing = state.players.find((player) => player.id === legacyId && !player.resumeTokenHash);
    }

    let playerId = existing?.id ?? "";
    if (!existing) {
      if (state.phase !== "lobby") {
        this.error(ws, suppliedToken ? "Your reconnect session has expired." : "Game already started.");
        ws.close(1008, "started");
        return;
      }
      if (state.players.length >= MAX_PLAYERS) {
        this.error(ws, "Room is full.");
        ws.close(1008, "full");
        return;
      }
      playerId = crypto.randomUUID();
      reconnectToken = randomToken();
    } else if (!reconnectToken) {
      reconnectToken = randomToken();
    }

    const session = { playerId };
    this.replacePlayerSocket(playerId, ws);
    this.sessions.set(ws, session);
    ws.serializeAttachment(session);

    if (existing) {
      existing.name = name;
      existing.color = color;
      existing.connected = true;
      existing.resumeTokenHash = await hashToken(reconnectToken);
      delete existing.disconnectedAt;
      this.system(state, `${name} rejoined`);
    } else {
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
        resumeTokenHash: await hashToken(reconnectToken),
      });
      this.system(state, `${name} joined`);
    }

    state.emptyAt = 0;
    this.ensureHost(state);
    this.save(state);
    this.send(ws, { type: "session", payload: { playerId, reconnectToken } });
    this.broadcast(state);
    await this.schedule(state);
  }

  private async settings(ws: WebSocket, payload: unknown): Promise<void> {
    const state = this.load();
    if (!this.isHost(ws, state) || state.phase !== "lobby" || !isRecord(payload)) return;

    if (
      payload.game === "classic" ||
      payload.game === "passthepen" ||
      payload.game === "yarnpals" ||
      payload.game === "undercover" ||
      payload.game === "wavelength" ||
      payload.game === "fakeartist" ||
      payload.game === "telephone" ||
      payload.game === "punchline" ||
      payload.game === "balderdash" ||
      payload.game === "emoji"
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
    const minPlayers =
      state.game === "undercover"
        ? 4
        : state.game === "passthepen" ||
            state.game === "wavelength" ||
            state.game === "fakeartist" ||
            state.game === "telephone" ||
            state.game === "punchline" ||
            state.game === "balderdash"
          ? 3
          : 2;
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

    if (state.game === "wavelength") {
      this.startWavelength(state);
      return;
    }

    if (state.game === "fakeartist") {
      await this.startFakeArtist(state);
      return;
    }

    if (state.game === "telephone") {
      this.startTelephone(state);
      return;
    }

    if (state.game === "punchline") {
      await this.startPunchline(state);
      return;
    }

    if (state.game === "balderdash") {
      await this.startBalderdash(state);
      return;
    }

    await this.beginRound(state, 1);
  }

  // ---------- In Sync (心有灵序) ----------
  private startWavelength(state: RoomState): void {
    state.wavelength = {
      sub: "play",
      round: 0,
      left: "",
      right: "",
      scaleDeck: [],
      participants: [],
      values: {},
      placed: [],
      active: null,
      revealStartedAt: 0,
    };
    state.phase = "playing";
    state.messages = [];
    this.wvSetupRound(state, 1);
    this.save(state);
    this.broadcast(state);
  }

  private wvSetupRound(state: RoomState, round: number): void {
    const wv = state.wavelength;
    if (!wv) return;
    if (wv.scaleDeck.length === 0) {
      wv.scaleDeck = this.shuffleIds(IN_SYNC_SCALES.map((_, index) => String(index))).map(Number);
    }
    const scale = IN_SYNC_SCALES[wv.scaleDeck.shift() ?? 0];
    const pair = scale[state.lang];
    const participants = state.players.filter((player) => player.connected).map((player) => player.id);
    const available = Array.from({ length: 101 }, (_, value) => value);
    const values: Record<string, number> = {};
    for (const id of participants) {
      const index = crypto.getRandomValues(new Uint32Array(1))[0] % available.length;
      values[id] = available.splice(index, 1)[0];
    }
    wv.round = round;
    wv.left = pair[0];
    wv.right = pair[1];
    wv.participants = participants;
    wv.values = values;
    wv.placed = [];
    wv.active = null;
    wv.revealStartedAt = 0;
    wv.sub = "play";
    this.system(
      state,
      state.lang === "zh" ? `第 ${round} 轮：准备好就出牌` : `Round ${round}: play when you're ready`,
    );
  }

  private async wvReady(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    const wv = state.wavelength;
    if (!session || state.game !== "wavelength" || !wv || wv.sub !== "play" || !isRecord(payload)) return;
    if (wv.active || !wv.participants.includes(session.playerId)) return;
    if (wv.placed.some((card) => card.playerId === session.playerId)) return;
    const clue = asText(payload.clue, "", 80);
    if (!clue) return;
    wv.active = { playerId: session.playerId, clue };
    this.save(state);
    this.broadcast(state);
  }

  private async wvPlace(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    const wv = state.wavelength;
    if (!session || state.game !== "wavelength" || !wv || wv.sub !== "play" || !isRecord(payload)) return;
    if (!wv.active || wv.active.playerId !== session.playerId) return;
    const requested = typeof payload.position === "number" ? Math.round(payload.position) : -1;
    if (requested < 0 || requested > wv.placed.length) return;
    wv.placed.splice(requested, 0, wv.active);
    wv.active = null;
    if (wv.placed.length >= wv.participants.length) {
      wv.sub = "reveal";
      wv.revealStartedAt = Date.now();
    }
    this.save(state);
    this.broadcast(state);
  }

  private async wvNext(ws: WebSocket): Promise<void> {
    const state = this.load();
    const wv = state.wavelength;
    if (!this.isHost(ws, state) || !wv || wv.sub !== "reveal") return;
    this.wvSetupRound(state, wv.round + 1);
    this.save(state);
    this.broadcast(state);
  }

  private wvView(state: RoomState, playerId?: string): WVView | null {
    const wv = state.wavelength;
    if (state.game !== "wavelength" || !wv) return null;
    const revealed = wv.sub === "reveal" || state.phase === "gameEnd";
    const isSpectator = !playerId || !wv.participants.includes(playerId);
    const hasPlayed = !!playerId && wv.placed.some((card) => card.playerId === playerId);
    const cardView = (card: WVCard): WVCardView => ({
      ...card,
      name: this.playerName(state, card.playerId),
      value: revealed ? (wv.values[card.playerId] ?? -1) : -1,
    });
    return {
      sub: wv.sub,
      round: wv.round,
      left: wv.left,
      right: wv.right,
      myValue: playerId && wv.values[playerId] !== undefined ? wv.values[playerId] : -1,
      isSpectator,
      hasPlayed,
      canPlay: wv.sub === "play" && !isSpectator && !hasPlayed && !wv.active,
      isActive: !!playerId && wv.active?.playerId === playerId,
      active: wv.active ? cardView(wv.active) : null,
      placed: wv.placed.map(cardView),
      participantCount: wv.participants.length,
      revealStartedAt: wv.revealStartedAt,
    };
  }

  // ---------- Fake Artist (滥竽充画) ----------
  private async startFakeArtist(state: RoomState): Promise<void> {
    // Pick a drawable word from PICTIONARY_WORDS so it's visually guessable.
    const bank = PICTIONARY_WORDS[state.lang];
    const categories = Object.keys(bank);
    const cat = categories[crypto.getRandomValues(new Uint32Array(1))[0] % categories.length];
    const words = bank[cat];
    const word = words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
    const fakeCount = state.players.length >= 6 ? 2 : 1;
    const shuffled = this.shuffleIds(state.players.map((p) => p.id));
    const fakeIds = shuffled.slice(0, fakeCount);
    const order = this.shuffleIds(state.players.map((p) => p.id));

    state.fakeartist = {
      sub: "draw",
      word,
      category: cat,
      fakeIds,
      order,
      laps: FA_LAPS,
      turnIndex: 0,
      turnStartedAt: Date.now(),
      turnSeconds: FA_TURN_SECONDS,
      turnStrokeStart: 0,
      votes: {},
      candidates: [],
      eliminated: null,
      result: null,
    };
    state.phase = "playing";
    state.strokes = [];
    state.messages = [];
    this.system(
      state,
      state.lang === "zh"
        ? `假画家已选定 — 类别「${cat}」· 每人${FA_LAPS}次，共${order.length * FA_LAPS}轮，然后投票！`
        : `Fake artist chosen — category "${cat}" · ${order.length * FA_LAPS} turns (${FA_LAPS} laps), then vote!`,
    );
    this.save(state);
    await this.schedule(state);
    this.broadcast(state);
  }

  private faTurnTimeLeft(state: RoomState): number {
    const fa = state.fakeartist;
    if (state.phase !== "playing" || state.game !== "fakeartist" || !fa || fa.sub !== "draw") return 0;
    const elapsed = Math.floor((Date.now() - fa.turnStartedAt) / 1000);
    return Math.max(0, fa.turnSeconds - elapsed);
  }

  private async faAdvanceTurn(state: RoomState): Promise<void> {
    const fa = state.fakeartist;
    if (!fa || fa.sub !== "draw") return;
    const total = fa.order.length * fa.laps;
    const next = fa.turnIndex + 1;
    if (next >= total) {
      fa.sub = "vote";
      fa.votes = {};
      fa.candidates = [];
      this.system(state, state.lang === "zh" ? "作画结束 — 投票选出假画家!" : "Drawing done — vote for the fake artist!");
      this.save(state);
      await this.schedule(state);
      this.broadcast(state);
      return;
    }
    fa.turnIndex = next;
    fa.turnStartedAt = Date.now();
    fa.turnStrokeStart = state.strokes.length;
    const nextId = fa.order[next % fa.order.length];
    this.system(state, `${this.playerName(state, nextId)}'s turn to draw`);
    this.save(state);
    await this.schedule(state);
    this.broadcast(state);
  }

  private async faPass(ws: WebSocket): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    const fa = state.fakeartist;
    if (!session || state.game !== "fakeartist" || !fa || fa.sub !== "draw") return;
    const currentId = fa.order[fa.turnIndex % fa.order.length];
    if (session.playerId !== currentId) return;
    await this.faAdvanceTurn(state);
  }

  private faEligibleVoters(state: RoomState): string[] {
    const fa = state.fakeartist;
    if (!fa) return [];
    const alive = state.players.map((p) => p.id);
    return alive.filter((id) => !(fa.candidates.length && fa.candidates.includes(id)));
  }

  private async faVote(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    const fa = state.fakeartist;
    if (!session || !fa || fa.sub !== "vote" || !isRecord(payload)) return;
    if (!state.players.some((p) => p.id === session.playerId)) return;
    if (fa.candidates.length && fa.candidates.includes(session.playerId)) return;
    const target = asText(payload.targetId, "", 80);
    if (!state.players.some((p) => p.id === target)) return;
    if (fa.candidates.length && !fa.candidates.includes(target)) return;
    // Must vote for someone else
    if (target === session.playerId) return;
    fa.votes[session.playerId] = target;
    const eligible = this.faEligibleVoters(state);
    if (eligible.every((id) => fa.votes[id] !== undefined)) {
      this.faResolveVotes(state);
    }
    this.save(state);
    this.broadcast(state);
  }

  private async faTally(ws: WebSocket): Promise<void> {
    const state = this.load();
    const fa = state.fakeartist;
    if (!this.isHost(ws, state) || !fa || fa.sub !== "vote") return;
    this.faResolveVotes(state);
    this.save(state);
    this.broadcast(state);
  }

  private faResolveVotes(state: RoomState): void {
    const fa = state.fakeartist;
    if (!fa) return;
    const tally: Record<string, number> = {};
    for (const target of Object.values(fa.votes)) tally[target] = (tally[target] ?? 0) + 1;
    let max = 0;
    for (const n of Object.values(tally)) max = Math.max(max, n);
    const top = Object.keys(tally).filter((id) => tally[id] === max);
    if (max === 0) {
      const alive = state.players.map((p) => p.id);
      top.push(alive[crypto.getRandomValues(new Uint32Array(1))[0] % alive.length]);
    }
    if (top.length > 1) {
      if (fa.candidates.length === 0) {
        fa.candidates = top;
        fa.votes = {};
        this.system(state, state.lang === "zh" ? "平票!在平票者之间重新投票。" : "Tie! Re-vote among the tied players.");
        return;
      }
    }
    const outId = top.length === 1 ? top[0] : top[crypto.getRandomValues(new Uint32Array(1))[0] % top.length];
    const isFake = fa.fakeIds.includes(outId);
    const player = state.players.find((p) => p.id === outId);
    const word = fa.word;
    // For display, role is spy=fake, civ=real painter
    fa.eliminated = { id: outId, name: player?.name ?? "Player", role: isFake ? "spy" : "civ", word };
    // Scoring / result
    if (isFake) {
      fa.result = "civ";
      // Civs win: reward all non-fakes, penalize nothing
      for (const p of state.players) {
        if (!fa.fakeIds.includes(p.id)) p.score += 100;
        else p.score += 0;
      }
    } else {
      fa.result = "spy";
      for (const p of state.players) {
        if (fa.fakeIds.includes(p.id)) p.score += 100;
      }
    }
    fa.candidates = [];
    fa.sub = "reveal";
  }

  private async faProceed(ws: WebSocket): Promise<void> {
    const state = this.load();
    const fa = state.fakeartist;
    if (!this.isHost(ws, state) || !fa || fa.sub !== "reveal") return;
    state.phase = "gameEnd";
    this.save(state);
    await this.schedule(state);
    this.broadcast(state);
  }

  private faView(state: RoomState, playerId?: string): FAView | null {
    const fa = state.fakeartist;
    if (state.game !== "fakeartist" || !fa) return null;
    const gameOver = state.phase === "gameEnd";
    const isFake = !!playerId && fa.fakeIds.includes(playerId);
    const totalTurns = fa.order.length * fa.laps;
    const currentId = fa.sub === "draw" ? fa.order[fa.turnIndex % fa.order.length] : "";
    const eligible = new Set(this.faEligibleVoters(state));
    const members: FAMemberView[] = state.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      voted: fa.votes[p.id] !== undefined,
    }));
    return {
      sub: fa.sub,
      word: fa.word,
      category: fa.category,
      isFake,
      fakeCount: fa.fakeIds.length,
      order: fa.order,
      laps: fa.laps,
      turnIndex: fa.turnIndex,
      totalTurns,
      currentId,
      currentName: state.players.find((p) => p.id === currentId)?.name ?? "",
      turnTimeLeft: this.faTurnTimeLeft(state),
      turnSeconds: fa.turnSeconds,
      turnStrokeStart: fa.turnStrokeStart,
      youDraw: fa.sub === "draw" && currentId === playerId,
      youVote: fa.sub === "vote" && !!playerId && eligible.has(playerId) && fa.votes[playerId] === undefined,
      hasVoted: !!playerId && fa.votes[playerId] !== undefined,
      candidates: fa.candidates,
      members,
      eliminated: fa.eliminated ? { name: fa.eliminated.name } : null,
      result: fa.result,
      reveal: gameOver
        ? state.players.map((p) => ({
            name: p.name,
            role: fa.fakeIds.includes(p.id) ? "spy" : "civ",
            word: fa.fakeIds.includes(p.id) ? (state.lang === "zh" ? "假画家" : "FAKE") : fa.word,
          }))
        : null,
    };
  }

  // ---------- Telephone (传声画筒) ----------
  private tpKindFor(step: number): TPKind {
    // Seed sentence (step 0) is text; then alternate draw / caption.
    return step % 2 === 0 ? "text" : "draw";
  }

  // At `step`, the player at order[j] works on the chain owned by order[(j - step) % n].
  private tpChainIndexFor(order: string[], playerId: string, step: number): number {
    const j = order.indexOf(playerId);
    if (j < 0) return -1;
    const n = order.length;
    return (((j - step) % n) + n) % n;
  }

  private startTelephone(state: RoomState): void {
    const order = this.shuffleIds(state.players.map((p) => p.id));
    state.telephone = {
      sub: "write",
      step: 0,
      totalSteps: order.length,
      order,
      chains: order.map((id) => ({
        ownerId: id,
        ownerName: this.playerName(state, id),
        entries: [],
      })),
      submitted: {},
      inspirationByPlayer: {},
      revealChain: 0,
      revealEntry: 0,
    };
    state.phase = "playing";
    state.messages = [];
    this.system(
      state,
      state.lang === "zh"
        ? `传声画筒开始 — 先各自写一句话,之后接力画、接力猜,共 ${order.length} 步!`
        : `Telephone started — everyone writes a sentence, then relay draw & guess for ${order.length} steps!`,
    );
    this.save(state);
    this.broadcast(state);
  }

  private tpConnectedPlayers(state: RoomState): string[] {
    const tp = state.telephone;
    if (!tp) return [];
    const connected = new Set(state.players.filter((p) => p.connected).map((p) => p.id));
    return tp.order.filter((id) => connected.has(id));
  }

  private async tpSubmit(ws: WebSocket, kind: TPKind, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    const tp = state.telephone;
    if (!session || state.game !== "telephone" || !tp) return;
    if (tp.sub !== "write" && tp.sub !== "play") return;
    if (kind !== this.tpKindFor(tp.step)) return; // wrong action for this step
    if (tp.submitted[session.playerId]) return; // already in
    const chainIndex = this.tpChainIndexFor(tp.order, session.playerId, tp.step);
    if (chainIndex < 0) return; // not part of this game
    const chain = tp.chains[chainIndex];
    if (!chain || chain.entries.length !== tp.step) return; // out of sync — ignore

    const name = this.playerName(state, session.playerId);
    let entry: TPEntry;
    if (kind === "text") {
      const text = isRecord(payload) ? asText(payload.text, "", 200) : "";
      if (!text) return; // must write something
      entry = { kind: "text", authorId: session.playerId, authorName: name, text, strokes: [] };
    } else {
      const strokes = isRecord(payload) ? normalizeStrokes(payload.strokes) : null;
      if (!strokes || strokes.length === 0) return; // must draw something
      entry = { kind: "draw", authorId: session.playerId, authorName: name, text: "", strokes };
    }
    chain.entries.push(entry);
    tp.submitted[session.playerId] = true;

    // Advance once every connected player has submitted this step.
    const waiting = this.tpConnectedPlayers(state).filter((id) => !tp.submitted[id]);
    if (waiting.length === 0) {
      this.tpAdvance(state);
    }
    this.save(state);
    this.broadcast(state);
  }

  private tpInspire(ws: WebSocket): void {
    const session = this.session(ws);
    const state = this.load();
    const tp = state.telephone;
    if (!session || state.game !== "telephone" || !tp || tp.step !== 0 || tp.sub !== "write") return;
    if (!tp.order.includes(session.playerId) || tp.submitted[session.playerId]) return;

    const cursor = state.telephoneInspirationCursor ?? 0;
    if (cursor >= TP_INSPIRATION_COUNT) {
      this.error(ws, "No more unique inspirations are available.");
      return;
    }

    let offset = state.telephoneInspirationOffset;
    if (!Number.isInteger(offset) || offset < 0 || offset >= TP_INSPIRATION_COUNT) {
      offset = crypto.getRandomValues(new Uint32Array(1))[0] % TP_INSPIRATION_COUNT;
      state.telephoneInspirationOffset = offset;
    }
    const inspirationIndex = (offset + cursor * TP_INSPIRATION_STEP) % TP_INSPIRATION_COUNT;
    state.telephoneInspirationCursor = cursor + 1;
    tp.inspirationByPlayer = { ...(tp.inspirationByPlayer ?? {}), [session.playerId]: inspirationIndex };
    this.save(state);
    this.broadcast(state);
  }

  private tpAdvance(state: RoomState): void {
    const tp = state.telephone;
    if (!tp) return;
    const kind = this.tpKindFor(tp.step);

    // Fill in a placeholder for anyone who didn't submit, so every chain stays the same length.
    for (const id of tp.order) {
      if (tp.submitted[id]) continue;
      const chainIndex = this.tpChainIndexFor(tp.order, id, tp.step);
      const chain = tp.chains[chainIndex];
      if (!chain || chain.entries.length !== tp.step) continue;
      const name = this.playerName(state, id);
      chain.entries.push(
        kind === "text"
          ? { kind: "text", authorId: id, authorName: name, text: state.lang === "zh" ? "(跳过)" : "(skipped)", strokes: [], auto: true }
          : { kind: "draw", authorId: id, authorName: name, text: "", strokes: [], auto: true },
      );
    }

    tp.step += 1;
    tp.submitted = {};

    if (tp.step >= tp.totalSteps) {
      tp.sub = "reveal";
      tp.revealChain = 0;
      tp.revealEntry = 0;
      this.system(state, state.lang === "zh" ? "全部完成 — 一起看看每条线索是怎么跑偏的!" : "All done — let's trace how each chain drifted!");
      return;
    }

    tp.sub = "play";
    const nextKind = this.tpKindFor(tp.step);
    this.system(
      state,
      state.lang === "zh"
        ? `第 ${tp.step + 1} 步:${nextKind === "draw" ? "把你收到的句子画出来" : "写出你看到的画是什么"}!`
        : `Step ${tp.step + 1}: ${nextKind === "draw" ? "draw the sentence you received" : "write what the drawing shows"}!`,
    );
  }

  private async tpReveal(ws: WebSocket, payload: unknown): Promise<void> {
    const state = this.load();
    const tp = state.telephone;
    if (!this.isHost(ws, state) || !tp || tp.sub !== "reveal" || !isRecord(payload)) return;
    const chain = typeof payload.chain === "number" ? Math.floor(payload.chain) : tp.revealChain;
    const entry = typeof payload.entry === "number" ? Math.floor(payload.entry) : tp.revealEntry;
    tp.revealChain = Math.max(0, Math.min(tp.chains.length - 1, chain));
    tp.revealEntry = Math.max(0, Math.min(tp.totalSteps - 1, entry));
    this.save(state);
    this.broadcast(state);
  }

  private tpView(state: RoomState, playerId?: string): TPView | null {
    const tp = state.telephone;
    if (state.game !== "telephone" || !tp) return null;
    const kind = this.tpKindFor(tp.step);
    const revealing = tp.sub === "reveal";
    const chainIndex = playerId ? this.tpChainIndexFor(tp.order, playerId, tp.step) : -1;
    const isSpectator = !playerId || tp.order.indexOf(playerId) < 0;

    let prompt: TPView["prompt"] = null;
    if (!revealing && tp.step > 0 && chainIndex >= 0) {
      const prev = tp.chains[chainIndex]?.entries[tp.step - 1];
      if (prev) prompt = { kind: prev.kind, text: prev.text, strokes: prev.strokes };
    }

    const connected = this.tpConnectedPlayers(state);
    return {
      sub: tp.sub,
      step: tp.step,
      totalSteps: tp.totalSteps,
      kind,
      prompt,
      hasSubmitted: !!playerId && !!tp.submitted[playerId],
      isSpectator,
      submittedCount: connected.filter((id) => tp.submitted[id]).length,
      totalPlayers: connected.length,
      inspirationIndex:
        !revealing && tp.step === 0 && playerId ? (tp.inspirationByPlayer?.[playerId] ?? null) : null,
      reveal: revealing ? tp.chains : null,
      revealChain: tp.revealChain,
      revealEntry: tp.revealEntry,
    };
  }

  // ---------- Punchline (神回复) ----------
  private plConnectedPlayers(state: RoomState): string[] {
    const pl = state.punchline;
    if (!pl) return [];
    const connected = new Set(state.players.filter((p) => p.connected).map((p) => p.id));
    return pl.order.filter((id) => connected.has(id));
  }

  private async startPunchline(state: RoomState): Promise<void> {
    const order = this.shuffleIds(state.players.map((p) => p.id));
    const bank = PL_PROMPTS[state.lang];
    const rounds = Math.min(PL_ROUNDS, bank.length);
    const prompts = this.shuffleIds(bank.map((_, i) => String(i)))
      .slice(0, rounds)
      .map((s) => bank[Number(s)]);
    state.punchline = {
      sub: "answer",
      order,
      prompts,
      round: 0,
      totalRounds: prompts.length,
      answers: {},
      submitted: {},
      answerDeadline: Date.now() + PL_ANSWER_SECONDS * 1000,
      answerOrder: [],
      votes: {},
      voteDeadline: 0,
      revealed: false,
    };
    state.phase = "playing";
    state.messages = [];
    this.system(
      state,
      state.lang === "zh"
        ? "神回复开始 — 大家回答同一个题目,越好笑越好!"
        : "Punchline started — everyone answers the same prompt, the funnier the better!",
    );
    this.save(state);
    this.broadcast(state);
    await this.schedule(state);
  }

  private async plAnswer(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    const pl = state.punchline;
    if (!session || state.game !== "punchline" || !pl || pl.sub !== "answer") return;
    if (pl.order.indexOf(session.playerId) < 0) return; // spectators can't play
    if (pl.submitted[session.playerId]) return;
    const text = isRecord(payload) ? asText(payload.text, "", 120) : "";
    if (!text) return;
    pl.answers[session.playerId] = text;
    pl.submitted[session.playerId] = true;

    const waiting = this.plConnectedPlayers(state).filter((id) => !pl.submitted[id]);
    if (waiting.length === 0) this.plStartVoting(state);
    this.save(state);
    this.broadcast(state);
    await this.schedule(state);
  }

  private plStartVoting(state: RoomState): void {
    const pl = state.punchline;
    if (!pl) return;
    // Fill placeholders for anyone who didn't answer, so every player has an entry.
    for (const id of pl.order) {
      if (!pl.answers[id]) pl.answers[id] = state.lang === "zh" ? "(没作答)" : "(no answer)";
    }
    // Shuffle display order so an answer's position doesn't reveal its author.
    pl.answerOrder = this.shuffleIds(pl.order);
    pl.sub = "vote";
    pl.votes = {};
    pl.revealed = false;
    pl.voteDeadline = Date.now() + PL_VOTE_SECONDS * 1000;
    this.system(state, state.lang === "zh" ? "投票开始 — 选出最好笑的回答(不能投自己)!" : "Voting time — pick the funniest (not your own)!");
  }

  // Everyone connected votes each round; the one exception handled at vote time is that
  // you can't vote for your own answer.
  private plEligibleVoters(state: RoomState): string[] {
    return this.plConnectedPlayers(state);
  }

  private async plVote(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    const pl = state.punchline;
    if (!session || state.game !== "punchline" || !pl || pl.sub !== "vote" || pl.revealed) return;
    if (pl.order.indexOf(session.playerId) < 0) return;
    const choice = isRecord(payload) && typeof payload.choice === "number" ? Math.floor(payload.choice) : -1;
    if (choice < 0 || choice >= pl.answerOrder.length) return;
    if (pl.answerOrder[choice] === session.playerId) return; // can't vote for yourself
    pl.votes[session.playerId] = choice;

    const eligible = this.plEligibleVoters(state);
    if (eligible.length > 0 && eligible.every((id) => pl.votes[id] !== undefined)) {
      this.plResolveRound(state);
    }
    this.save(state);
    this.broadcast(state);
    await this.schedule(state);
  }

  private plResolveRound(state: RoomState): void {
    const pl = state.punchline;
    if (!pl || pl.revealed) return;
    const counts = new Array<number>(pl.answerOrder.length).fill(0);
    for (const choice of Object.values(pl.votes)) {
      if (choice >= 0 && choice < counts.length) counts[choice] += 1;
    }
    // Each vote is worth 100 points to that answer's author.
    pl.answerOrder.forEach((authorId, i) => this.plAward(state, authorId, counts[i] * 100));
    pl.revealed = true;
    // Hold on the reveal briefly so everyone sees who wrote what and who won.
    pl.voteDeadline = Date.now() + PL_REVEAL_SECONDS * 1000;
    let best = -1;
    let bestId = "";
    let tie = false;
    counts.forEach((c, i) => {
      if (c > best) {
        best = c;
        bestId = pl.answerOrder[i];
        tie = false;
      } else if (c === best) {
        tie = true;
      }
    });
    if (best > 0 && !tie) {
      const name = this.playerName(state, bestId);
      this.system(state, state.lang === "zh" ? `${name} 拿下这一轮!` : `${name} wins this round!`);
    }
  }

  private plAdvanceRound(state: RoomState): void {
    const pl = state.punchline;
    if (!pl) return;
    pl.round += 1;
    if (pl.round >= pl.totalRounds) {
      pl.sub = "score";
      pl.voteDeadline = 0;
      this.system(state, state.lang === "zh" ? "全部揭晓 — 看看谁的回答最神!" : "That's a wrap — see who had the best comebacks!");
      return;
    }
    pl.sub = "answer";
    pl.answers = {};
    pl.submitted = {};
    pl.votes = {};
    pl.answerOrder = [];
    pl.revealed = false;
    pl.answerDeadline = Date.now() + PL_ANSWER_SECONDS * 1000;
    this.system(
      state,
      state.lang === "zh" ? `第 ${pl.round + 1} 题 — 大家开始作答!` : `Prompt ${pl.round + 1} — everyone answer!`,
    );
  }

  private plAward(state: RoomState, playerId: string, points: number): void {
    if (points <= 0) return;
    const player = state.players.find((p) => p.id === playerId);
    if (player) {
      player.score += points;
      player.roundPoints = (player.roundPoints ?? 0) + points;
    }
  }

  private plTimeLeft(state: RoomState): number {
    const pl = state.punchline;
    if (state.phase !== "playing" || state.game !== "punchline" || !pl) return 0;
    const deadline = pl.sub === "answer" ? pl.answerDeadline : pl.sub === "vote" ? pl.voteDeadline : 0;
    if (!deadline) return 0;
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  }

  private plView(state: RoomState, playerId?: string): PLView | null {
    const pl = state.punchline;
    if (state.game !== "punchline" || !pl) return null;
    const isSpectator = !playerId || pl.order.indexOf(playerId) < 0;
    const connected = this.plConnectedPlayers(state);

    let answers: PLView["answers"] = null;
    if (pl.sub === "vote") {
      const counts = new Array<number>(pl.answerOrder.length).fill(0);
      if (pl.revealed) {
        for (const choice of Object.values(pl.votes)) {
          if (choice >= 0 && choice < counts.length) counts[choice] += 1;
        }
      }
      answers = pl.answerOrder.map((authorId, i) => ({
        text: pl.answers[authorId] ?? "",
        isMine: authorId === playerId,
        author: pl.revealed ? this.playerName(state, authorId) : null,
        votes: pl.revealed ? counts[i] : null,
      }));
    }

    let scores: PLView["scores"] = null;
    if (pl.sub === "score") {
      scores = [...state.players].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, score: p.score }));
    }

    return {
      sub: pl.sub,
      round: pl.round,
      totalRounds: pl.totalRounds,
      prompt: pl.prompts[pl.round] ?? "",
      hasSubmitted: !!playerId && !!pl.submitted[playerId],
      submittedCount: connected.filter((id) => pl.submitted[id]).length,
      totalPlayers: connected.length,
      answerDeadline: pl.answerDeadline,
      isSpectator,
      answers,
      myVote: playerId && pl.votes[playerId] !== undefined ? pl.votes[playerId] : null,
      hasVoted: !!playerId && pl.votes[playerId] !== undefined,
      votedCount: Object.keys(pl.votes).length,
      eligibleCount: this.plEligibleVoters(state).length,
      voteDeadline: pl.voteDeadline,
      revealed: pl.revealed,
      scores,
    };
  }

  // ---------- Balderdash (胡说八道) ----------
  private bdConnectedPlayers(state: RoomState): string[] {
    const bd = state.balderdash;
    if (!bd) return [];
    const connected = new Set(state.players.filter((p) => p.connected).map((p) => p.id));
    return bd.order.filter((id) => connected.has(id));
  }

  private async startBalderdash(state: RoomState): Promise<void> {
    const order = this.shuffleIds(state.players.map((p) => p.id));
    const bank = BD_WORDS[state.lang];
    const rounds = Math.min(BD_ROUNDS, bank.length);
    const idx = this.shuffleIds(bank.map((_, i) => String(i))).slice(0, rounds);
    const words = idx.map((s) => bank[Number(s)]);
    state.balderdash = {
      sub: "define",
      order,
      words,
      round: 0,
      totalRounds: words.length,
      definitions: {},
      submitted: {},
      defineDeadline: Date.now() + BD_DEFINE_SECONDS * 1000,
      displayOrder: [],
      votes: {},
      voteDeadline: 0,
      revealed: false,
      hintLevel: 0,
    };
    state.phase = "playing";
    state.messages = [];
    this.system(
      state,
      state.lang === "zh"
        ? "胡说八道开始 — 给生僻词编一个靠谱的假解释，骗过所有人！"
        : "Balderdash started — invent a believable fake definition!",
    );
    this.save(state);
    this.broadcast(state);
    await this.schedule(state);
  }

  private async bdDefine(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    const bd = state.balderdash;
    if (!session || state.game !== "balderdash" || !bd || bd.sub !== "define") return;
    if (bd.order.indexOf(session.playerId) < 0) return;
    if (bd.submitted[session.playerId]) return;
    const text = isRecord(payload) ? asText(payload.text, "", 140) : "";
    if (!text) return;
    bd.definitions[session.playerId] = text;
    bd.submitted[session.playerId] = true;
    const waiting = this.bdConnectedPlayers(state).filter((id) => !bd.submitted[id]);
    if (waiting.length === 0) this.bdStartVoting(state);
    this.save(state);
    this.broadcast(state);
    await this.schedule(state);
  }

  private async bdSkip(ws: WebSocket): Promise<void> {
    const state = this.load();
    const bd = state.balderdash;
    if (!this.isHost(ws, state) || !bd) return;
    if (bd.sub === "define") this.bdStartVoting(state);
    else if (bd.sub === "vote") {
      if (bd.revealed) this.bdAdvanceRound(state);
      else this.bdResolveRound(state);
    } else return;
    this.save(state);
    this.broadcast(state);
    await this.schedule(state);
  }

  private async bdHint(ws: WebSocket): Promise<void> {
    const state = this.load();
    const bd = state.balderdash;
    if (!this.isHost(ws, state) || !bd) return;
    if (state.game !== "balderdash" || bd.sub !== "define") return;
    if (bd.hintLevel >= 2) return;
    bd.hintLevel += 1;
    this.system(
      state,
      state.lang === "zh"
        ? bd.hintLevel === 1
          ? "房主给了个小提示 💡"
          : "房主又给了个大提示 💡💡"
        : bd.hintLevel === 1
          ? "Host revealed a hint 💡"
          : "Host revealed a bigger hint 💡💡",
    );
    this.save(state);
    this.broadcast(state);
  }

  private bdHintText(state: RoomState): string | null {
    const bd = state.balderdash;
    if (!bd || bd.hintLevel <= 0 || bd.sub !== "define") return null;
    const def = bd.words[bd.round]?.definition ?? "";
    if (!def) return null;
    const chars = Array.from(def);
    // Level 1 = ~35%, Level 2 = ~65%, at least 1 char, always with ellipsis if truncated
    const ratio = bd.hintLevel === 1 ? 0.35 : 0.65;
    const n = Math.max(1, Math.ceil(chars.length * ratio));
    if (n >= chars.length) return def;
    return chars.slice(0, n).join("") + "…";
  }

  private bdStartVoting(state: RoomState): void {
    const bd = state.balderdash;
    if (!bd) return;
    for (const id of bd.order) {
      if (!bd.definitions[id]) bd.definitions[id] = state.lang === "zh" ? "(没作答)" : "(no definition)";
    }
    bd.displayOrder = this.shuffleIds([...bd.order, "__REAL__"]);
    bd.sub = "vote";
    bd.votes = {};
    bd.revealed = false;
    bd.voteDeadline = Date.now() + BD_VOTE_SECONDS * 1000;
    this.system(state, state.lang === "zh" ? "投票开始 — 找出真正的解释！" : "Vote for the REAL definition!");
  }

  private bdEligibleVoters(state: RoomState): string[] {
    return this.bdConnectedPlayers(state);
  }

  private async bdVote(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    const bd = state.balderdash;
    if (!session || state.game !== "balderdash" || !bd || bd.sub !== "vote" || bd.revealed) return;
    if (bd.order.indexOf(session.playerId) < 0) return;
    const choice = isRecord(payload) && typeof payload.choice === "number" ? Math.floor(payload.choice) : -1;
    if (choice < 0 || choice >= bd.displayOrder.length) return;
    // You CAN vote for your own here? No — classic: you know yours is fake, voting for it is wasted.
    // Allow it but it gives no points; simpler: block self-vote to force engagement.
    if (bd.displayOrder[choice] === session.playerId) return;
    bd.votes[session.playerId] = choice;
    const eligible = this.bdEligibleVoters(state);
    if (eligible.length > 0 && eligible.every((id) => bd.votes[id] !== undefined)) this.bdResolveRound(state);
    this.save(state);
    this.broadcast(state);
    await this.schedule(state);
  }

  private bdResolveRound(state: RoomState): void {
    const bd = state.balderdash;
    if (!bd || bd.revealed) return;
    const counts = new Array<number>(bd.displayOrder.length).fill(0);
    for (const choice of Object.values(bd.votes)) {
      if (choice >= 0 && choice < counts.length) counts[choice] += 1;
    }
    const realIdx = bd.displayOrder.indexOf("__REAL__");
    // Scoring: +100 for finding the truth, +50 per vote your fake received
    bd.displayOrder.forEach((entry, i) => {
      if (entry === "__REAL__") return;
      const fooled = counts[i];
      if (fooled > 0) this.bdAward(state, entry, fooled * 50);
    });
    for (const [voterId, choice] of Object.entries(bd.votes)) {
      if (choice === realIdx) this.bdAward(state, voterId, 100);
    }
    bd.revealed = true;
    bd.voteDeadline = Date.now() + BD_REVEAL_SECONDS * 1000;
    const bestFakeVotes = Math.max(0, ...counts.filter((_, i) => i !== realIdx));
    if (bestFakeVotes > 0) {
      const idx = counts.findIndex((c, i) => i !== realIdx && c === bestFakeVotes);
      const fid = bd.displayOrder[idx];
      if (fid && fid !== "__REAL__") {
        const name = this.playerName(state, fid);
        this.system(state, state.lang === "zh" ? `${name} 的瞎编骗了 ${bestFakeVotes} 个人！` : `${name} fooled ${bestFakeVotes}!`);
      }
    }
  }

  private bdAdvanceRound(state: RoomState): void {
    const bd = state.balderdash;
    if (!bd) return;
    bd.round += 1;
    if (bd.round >= bd.totalRounds) {
      bd.sub = "score";
      bd.voteDeadline = 0;
      this.system(state, state.lang === "zh" ? "全部揭晓 — 看看谁最会胡说八道！" : "That's a wrap — best bluffer wins!");
      return;
    }
    bd.sub = "define";
    bd.definitions = {};
    bd.submitted = {};
    bd.votes = {};
    bd.displayOrder = [];
    bd.revealed = false;
    bd.hintLevel = 0;
    bd.defineDeadline = Date.now() + BD_DEFINE_SECONDS * 1000;
    this.system(state, state.lang === "zh" ? `第 ${bd.round + 1} 词 — 开始编！` : `Word ${bd.round + 1} — bluff!`);
  }

  private bdAward(state: RoomState, playerId: string, points: number): void {
    if (points <= 0) return;
    const p = state.players.find((x) => x.id === playerId);
    if (p) {
      p.score += points;
      p.roundPoints = (p.roundPoints ?? 0) + points;
    }
  }

  private bdTimeLeft(state: RoomState): number {
    const bd = state.balderdash;
    if (state.phase !== "playing" || state.game !== "balderdash" || !bd) return 0;
    const dl = bd.sub === "define" ? bd.defineDeadline : bd.sub === "vote" ? bd.voteDeadline : 0;
    if (!dl) return 0;
    return Math.max(0, Math.ceil((dl - Date.now()) / 1000));
  }

  private bdView(state: RoomState, playerId?: string): BDView | null {
    const bd = state.balderdash;
    if (state.game !== "balderdash" || !bd) return null;
    const isSpectator = !playerId || bd.order.indexOf(playerId) < 0;
    const connected = this.bdConnectedPlayers(state);
    let options: BDView["options"] = null;
    if (bd.sub === "vote") {
      const counts = new Array<number>(bd.displayOrder.length).fill(0);
      if (bd.revealed) {
        for (const c of Object.values(bd.votes)) if (c >= 0 && c < counts.length) counts[c] += 1;
      }
      const cur = bd.words[bd.round];
      options = bd.displayOrder.map((entry, i) => {
        const isRealEntry = entry === "__REAL__";
        return {
          text: isRealEntry ? (cur?.definition ?? "") : (bd.definitions[entry] ?? ""),
          isMine: entry === playerId,
          author: bd.revealed ? (isRealEntry ? (state.lang === "zh" ? "真·解释" : "TRUE") : this.playerName(state, entry)) : null,
          votes: bd.revealed ? counts[i] : null,
          isReal: bd.revealed ? isRealEntry : null,
        };
      });
    }
    let scores: BDView["scores"] = null;
    if (bd.sub === "score") {
      scores = [...state.players].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, score: p.score }));
    }
    let guessedReal: boolean | null = null;
    if (bd.revealed && playerId) {
      const myChoice = bd.votes[playerId];
      if (myChoice !== undefined) guessedReal = bd.displayOrder[myChoice] === "__REAL__";
    }
    return {
      sub: bd.sub,
      round: bd.round,
      totalRounds: bd.totalRounds,
      word: bd.words[bd.round]?.word ?? "",
      hasSubmitted: !!playerId && !!bd.submitted[playerId],
      submittedCount: connected.filter((id) => bd.submitted[id]).length,
      totalPlayers: connected.length,
      defineDeadline: bd.defineDeadline,
      isSpectator,
      hint: this.bdHintText(state),
      hintLevel: bd.hintLevel ?? 0,
      options,
      myVote: playerId && bd.votes[playerId] !== undefined ? bd.votes[playerId] : null,
      hasVoted: !!playerId && bd.votes[playerId] !== undefined,
      votedCount: Object.keys(bd.votes).length,
      eligibleCount: this.bdEligibleVoters(state).length,
      voteDeadline: bd.voteDeadline,
      revealed: bd.revealed,
      guessedReal,
      scores,
    };
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
    const speaker = state.players.find((p) => p.id === session.playerId)?.name ?? "Player";
    if (text) {
      uc.descriptions.push({ playerId: session.playerId, playerName: speaker, text });
    } else {
      uc.descriptions.push({ playerId: session.playerId, playerName: speaker, text: "", passed: true });
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
    await this.schedule(state);
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
    await this.schedule(state);
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
    const isEmoji = state.game === "emoji";
    state.round = {
      ...state.round,
      word,
      category: isEmoji ? undefined : this.categoryOf(state.round.mode, state.lang, word),
      options: undefined,
      startedAt: Date.now(),
      hints: 0,
      correctIds: [],
      ended: false,
      emojiClue: isEmoji ? undefined : state.round.emojiClue,
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

  private async emSubmit(ws: WebSocket, payload: unknown): Promise<void> {
    const session = this.session(ws);
    const state = this.load();
    if (!session || state.game !== "emoji" || state.phase !== "playing" || !state.round?.word) return;
    if (state.round.performerId !== session.playerId) return;
    if (state.round.emojiClue) return;
    if (!isRecord(payload)) return;
    const clue = asText(payload.clue, "", 80);
    if (!isEmojiOnly(clue)) {
      this.error(ws, state.lang === "zh" ? "只能输入表情符号" : "Emojis only");
      return;
    }
    state.round.emojiClue = clue;
    state.round.startedAt = Date.now();
    state.round.hints = 0;
    this.system(state, state.lang === "zh" ? "表情已发布 — 开始猜!" : "Emoji clue posted — start guessing!");
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

    if (state.game === "fakeartist") {
      const fa = state.fakeartist;
      if (!fa || fa.sub !== "draw") return;
      const currentId = fa.order[fa.turnIndex % fa.order.length];
      if (session.playerId !== currentId) return;
      const keep = fa.turnStrokeStart;
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
    if (state.game === "emoji" && !state.round.emojiClue) return;

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
    if (state.game === "punchline") {
      state.game = "classic";
      state.mode = "pictionary";
    }
    state.round = null;
    state.yarn = null;
    state.undercover = null;
    state.wavelength = null;
    state.fakeartist = null;
    state.telephone = null;
    state.punchline = null;
    state.balderdash = null;
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
    await this.schedule(state);
    this.broadcast(state);
  }

  private async leave(ws: WebSocket): Promise<void> {
    const session = this.session(ws);
    if (!session) return;
    this.sessions.delete(ws);
    ws.serializeAttachment(null);
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

  private async removePlayer(state: RoomState, playerId: string, reason = "left"): Promise<void> {
    const player = state.players.find((item) => item.id === playerId);
    if (!player) return;
    const wasPerformer = state.round?.performerId === playerId;
    const wasHost = player.host;
    state.players = state.players.filter((item) => item.id !== playerId);
    this.system(state, `${player.name} ${reason}`);
    this.ensureHost(state);
    if (wasHost) {
      const nextHost = state.players.find((item) => item.host);
      if (nextHost) this.system(state, `${nextHost.name} is now the host`);
    }

    if (state.players.length === 0) {
      await this.purgeRoom();
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
        await this.schedule(state);
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
      await this.schedule(state);
      this.broadcast(state);
      return;
    }

    // Wavelength: keep the round moving if a player drops out.
    if (state.game === "wavelength" && state.wavelength && state.phase === "playing") {
      const wv = state.wavelength;
      wv.participants = wv.participants.filter((id) => id !== playerId);
      delete wv.values[playerId];
      wv.placed = wv.placed.filter((card) => card.playerId !== playerId);
      if (wv.active?.playerId === playerId) wv.active = null;
      if (state.players.length < 2) {
        state.phase = "gameEnd";
        this.save(state);
        await this.schedule(state);
        this.broadcast(state);
        return;
      }
      if (wv.sub === "play" && wv.participants.length > 0 && wv.placed.length >= wv.participants.length) {
        wv.sub = "reveal";
        wv.revealStartedAt = Date.now();
      }
      this.save(state);
      await this.schedule(state);
      this.broadcast(state);
      return;
    }

    // Fake Artist: keep drawing/voting coherent when a player leaves
    if (state.game === "fakeartist" && state.fakeartist && state.phase === "playing") {
      const fa = state.fakeartist;
      fa.fakeIds = fa.fakeIds.filter((id) => id !== playerId);
      // Ensure at least one fake remains; promote a random civ if needed
      if (fa.fakeIds.length === 0 && state.players.length >= 3) {
        const remaining = state.players.map((p) => p.id);
        fa.fakeIds = [remaining[crypto.getRandomValues(new Uint32Array(1))[0] % remaining.length]];
      }
      fa.order = fa.order.filter((id) => id !== playerId);
      fa.candidates = fa.candidates.filter((id) => id !== playerId);
      delete fa.votes[playerId];
      // Remove votes for the leaving player as target
      for (const voter of Object.keys(fa.votes)) {
        if (fa.votes[voter] === playerId) delete fa.votes[voter];
      }
      if (state.players.length < 3) {
        state.phase = "gameEnd";
        fa.result = "civ";
        this.save(state);
        await this.schedule(state);
        this.broadcast(state);
        return;
      }
      if (fa.sub === "draw") {
        const total = fa.order.length * fa.laps;
        if (fa.turnIndex >= total) {
          fa.sub = "vote";
          fa.votes = {};
          fa.candidates = [];
          this.system(state, state.lang === "zh" ? "作画结束 — 投票选出假画家!" : "Drawing done — vote for the fake artist!");
        } else {
          // Fix turnIndex if current drawer left or order shrunk
          const currentId = fa.order[fa.turnIndex % fa.order.length];
          if (!currentId || currentId === playerId) {
            fa.turnStartedAt = Date.now();
            fa.turnStrokeStart = state.strokes.length;
          }
        }
        this.save(state);
        await this.schedule(state);
        this.broadcast(state);
        return;
      }
      if (fa.sub === "vote") {
        const eligible = this.faEligibleVoters(state);
        if (eligible.length > 0 && eligible.every((id) => fa.votes[id] !== undefined)) {
          this.faResolveVotes(state);
        }
        this.save(state);
        await this.schedule(state);
        this.broadcast(state);
        return;
      }
      this.save(state);
      await this.schedule(state);
      this.broadcast(state);
      return;
    }

    // Telephone: the roster is locked at kickoff, so keep the leaver's slot (their
    // future turns become auto-filled placeholders) and just unblock the current step.
    if (state.game === "telephone" && state.telephone && state.phase === "playing") {
      const tp = state.telephone;
      delete tp.submitted[playerId];
      const connected = this.tpConnectedPlayers(state);
      if (connected.length < 2) {
        // Not enough people to keep passing — jump straight to the reveal.
        if (tp.sub !== "reveal") {
          tp.sub = "reveal";
          tp.revealChain = 0;
          tp.revealEntry = 0;
        }
      } else if ((tp.sub === "write" || tp.sub === "play") && connected.every((id) => tp.submitted[id])) {
        this.tpAdvance(state);
      }
      this.save(state);
      await this.schedule(state);
      this.broadcast(state);
      return;
    }

    // Punchline: roster is locked; keep the leaver's slot (their answers auto-fill)
    // and just unblock whatever answer or vote is in progress.
    if (state.game === "punchline" && state.punchline && state.phase === "playing") {
      const pl = state.punchline;
      delete pl.submitted[playerId];
      delete pl.votes[playerId];
      const connected = this.plConnectedPlayers(state);
      if (pl.sub === "answer" && connected.length > 0 && connected.every((id) => pl.submitted[id])) {
        this.plStartVoting(state);
      } else if (pl.sub === "vote" && !pl.revealed) {
        const eligible = this.plEligibleVoters(state);
        if (eligible.length > 0 && eligible.every((id) => pl.votes[id] !== undefined)) {
          this.plResolveRound(state);
        }
      }
      this.save(state);
      await this.schedule(state);
      this.broadcast(state);
      return;
    }

    // Balderdash: same locked-roster handling as Punchline
    if (state.game === "balderdash" && state.balderdash && state.phase === "playing") {
      const bd = state.balderdash;
      delete bd.submitted[playerId];
      delete bd.votes[playerId];
      const connected = this.bdConnectedPlayers(state);
      if (bd.sub === "define" && connected.length > 0 && connected.every((id) => bd.submitted[id])) {
        this.bdStartVoting(state);
      } else if (bd.sub === "vote" && !bd.revealed) {
        const eligible = this.bdEligibleVoters(state);
        if (eligible.length > 0 && eligible.every((id) => bd.votes[id] !== undefined)) {
          this.bdResolveRound(state);
        }
      }
      this.save(state);
      await this.schedule(state);
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
    await this.schedule(state);
    this.broadcast(state);
  }

  private async endRound(state: RoomState): Promise<void> {
    if (!state.round || state.phase === "roundEnd") return;
    state.phase = "roundEnd";
    state.round.ended = true;
    this.system(state, `Answer: ${state.round.word}`);
    this.save(state);
    await this.schedule(state);
    this.broadcast(state);
  }

  private async finish(state: RoomState): Promise<void> {
    state.phase = "gameEnd";
    const score = Math.max(...state.players.map((player) => player.score));
    const names = state.players.filter((player) => player.score === score).map((player) => player.name);
    this.system(state, `${names.join(" & ")} win`);
    this.save(state);
    await this.schedule(state);
    this.broadcast(state);
  }

  private makeRound(state: RoomState, number: number): Round {
    const mode: RoundMode =
      state.game === "emoji"
        ? "pictionary"
        : state.mode === "mixed"
          ? crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0
            ? "pictionary"
            : "charades"
          : state.mode;
    const performer = state.players[(number - 1) % state.players.length];
    const options = state.game === "emoji" ? this.emojiWordOptions(state.lang) : this.wordOptions(mode, state.lang);
    return {
      number,
      total: state.rounds,
      mode,
      performerId: performer.id,
      word: "",
      options,
      startedAt: 0,
      durationSeconds: ROUND_SECONDS,
      hints: 0,
      correctIds: [],
      ended: false,
      emojiClue: undefined,
    };
  }

  private emojiWordOptions(lang: Lang): string[] {
    const pool = EMOJI_WORDS[lang];
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
    const deadlines: number[] = [];

    if (state.emptyAt) {
      deadlines.push(state.emptyAt + EMPTY_ROOM_TTL_MS);
    } else {
      for (const player of state.players) {
        if (!player.connected && player.disconnectedAt) {
          deadlines.push(player.disconnectedAt + PLAYER_RECONNECT_GRACE_MS);
          if (player.host) deadlines.push(player.disconnectedAt + HOST_TRANSFER_GRACE_MS);
        }
      }

      const gameDeadline = this.gameDeadline(state);
      if (gameDeadline !== null) deadlines.push(gameDeadline);
    }

    if (deadlines.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...deadlines)));
  }

  private gameDeadline(state: RoomState): number | null {
    if (state.phase === "teams" && state.game === "yarnpals" && state.yarn) {
      return state.yarn.startsAt;
    }
    if (state.phase !== "playing") return null;

    if (state.game === "passthepen") {
      const round = state.round;
      return round?.turnStartedAt
        ? round.turnStartedAt + (round.turnSeconds ?? TURN_SECONDS) * 1000
        : null;
    }

    if (state.game === "fakeartist") {
      const fa = state.fakeartist;
      return fa?.sub === "draw" ? fa.turnStartedAt + fa.turnSeconds * 1000 : null;
    }

    if (state.game === "punchline") {
      const pl = state.punchline;
      if (pl?.sub === "answer") return pl.answerDeadline;
      if (pl?.sub === "vote" && pl.voteDeadline) return pl.voteDeadline;
      return null;
    }

    if (state.game === "balderdash") {
      const bd = state.balderdash;
      if (bd?.sub === "define") return bd.defineDeadline;
      if (bd?.sub === "vote" && bd.voteDeadline) return bd.voteDeadline;
      return null;
    }

    if (!state.round?.word) return null;
    const started = state.round.startedAt;
    const now = Date.now();
    const end = started + state.round.durationSeconds * 1000;
    const countAt = started + HINT_COUNT_AT_SECONDS * 1000;
    const categoryAt = started + HINT_CATEGORY_AT_SECONDS * 1000;
    if (now < countAt) return Math.min(end, countAt);
    if (now < categoryAt) return Math.min(end, categoryAt);
    return end;
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
    const players: PublicPlayer[] = state.players.map(({ resumeTokenHash: _token, disconnectedAt: _disconnected, ...player }) => player);
    const {
      players: _players,
      telephoneInspirationCursor: _telephoneInspirationCursor,
      telephoneInspirationOffset: _telephoneInspirationOffset,
      ...publicState
    } = state;
    const isPerformer = !!round && round.performerId === playerId;
    let seeWord = false;
    let youDraw = false;
    let youGuess = false;
    let hiddenWord = "";
    let wordLength = 0;
    let relay: RelaySnapshot | null = null;
    let emojiClue: string | null = null;
    let needsClue = false;

    if (round) {
      wordLength = round.word.replaceAll(" ", "").length;

      if (state.game === "emoji") {
        const clue = round.emojiClue ?? null;
        emojiClue = clue;
        needsClue = isPerformer && !clue && state.phase === "playing";
        seeWord = isPerformer;
        youDraw = false;
        youGuess = !isPerformer && !!clue && state.phase === "playing";
        if (!isPerformer && state.phase === "choosing") round.options = [];
        if (!isPerformer && state.phase === "playing") {
          hiddenWord = "";
          round.word = "";
          round.options = undefined;
          // keep emojiClue visible
        }
        // performer sees word, others see emojiClue
      } else if (state.game === "passthepen") {
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

    // Fake artist doesn't use Round but we provide dummy for UI consistency
    // Ensure strokes remain visible for all during FA
    return {
      ...publicState,
      players,
      round,
      undercover: this.ucView(state, playerId),
      wavelength: this.wvView(state, playerId),
      fakeartist: this.faView(state, playerId),
      telephone: this.tpView(state, playerId),
      punchline: this.plView(state, playerId),
      balderdash: this.bdView(state, playerId),
      timeLeft: this.timeLeft(state),
      hiddenWord,
      wordLength,
      isPerformer,
      seeWord,
      youDraw,
      youGuess,
      relay,
      emojiClue,
      needsClue,
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
      eliminated: uc.eliminated ? { name: uc.eliminated.name } : null,
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
    this.ensureSchema();
    const row = this.ctx.storage.sql
      .exec<{ body: string }>("SELECT body FROM state WHERE id = ?", "room")
      .toArray()[0];
    if (!row) {
      const state = this.empty("ROOM");
      this.save(state);
      return state;
    }
    try {
      const parsed = JSON.parse(row.body) as RoomState;
      // Migration: older rooms lack fakeartist / telephone
      if ((parsed as unknown as Record<string, unknown>).fakeartist === undefined) {
        parsed.fakeartist = null;
      }
      if ((parsed as unknown as Record<string, unknown>).telephone === undefined) {
        parsed.telephone = null;
      }
      if ((parsed as unknown as Record<string, unknown>).punchline === undefined) {
        parsed.punchline = null;
      }
      if ((parsed as unknown as Record<string, unknown>).balderdash === undefined) {
        parsed.balderdash = null;
      }
      if (parsed.phase === "lobby" && parsed.game === "classic" && parsed.mode === "mixed") {
        parsed.mode = "pictionary";
      }
      if (parsed.phase === "lobby" && parsed.game === "punchline") {
        parsed.game = "classic";
        parsed.mode = "pictionary";
        parsed.punchline = null;
      }
      // The original Wavelength state used one clue-giver and shared slider
      // guesses. Return an in-progress legacy room to the lobby rather than
      // exposing that stale shape through the new In Sync view.
      if (
        parsed.game === "wavelength" &&
        parsed.wavelength &&
        !Array.isArray((parsed.wavelength as unknown as Record<string, unknown>).participants)
      ) {
        parsed.phase = "lobby";
        parsed.wavelength = null;
      }
      if (parsed.wavelength && !Array.isArray(parsed.wavelength.scaleDeck)) {
        parsed.wavelength.scaleDeck = [];
      }
      parsed.players = parsed.players.map((player) => ({
        ...player,
        resumeTokenHash: typeof player.resumeTokenHash === "string" ? player.resumeTokenHash : "",
      }));
      return parsed;
    } catch {
      const state = this.empty("ROOM");
      this.save(state);
      return state;
    }
  }

  private save(state: RoomState): void {
    this.ensureSchema();
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
      mode: "pictionary",
      rounds: 5,
      round: null,
      yarn: null,
      undercover: null,
      wavelength: null,
      fakeartist: null,
      telephone: null,
      punchline: null,
      balderdash: null,
      solved: 0,
      messages: [],
      strokes: [],
      emptyAt: 0,
      telephoneInspirationCursor: 0,
      telephoneInspirationOffset: crypto.getRandomValues(new Uint32Array(1))[0] % TP_INSPIRATION_COUNT,
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
    const nextHost = state.players.find((player) => player.connected) ?? state.players[0];
    if (nextHost) nextHost.host = true;
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

  private replacePlayerSocket(playerId: string, replacement: WebSocket): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === replacement || this.session(socket)?.playerId !== playerId) continue;
      this.sessions.delete(socket);
      socket.serializeAttachment(null);
      try {
        socket.close(4000, "reconnected elsewhere");
      } catch {
        // The old socket may already be closed.
      }
    }
  }

  private async disconnect(ws: WebSocket): Promise<void> {
    const session = this.session(ws);
    this.sessions.delete(ws);
    ws.serializeAttachment(null);
    if (!session || this.socketFor(session.playerId)) return;

    const state = this.load();
    const player = state.players.find((item) => item.id === session.playerId);
    if (!player || !player.connected) return;

    player.connected = false;
    player.disconnectedAt = Date.now();
    this.system(state, `${player.name} disconnected`);

    if (!state.players.some((item) => item.connected)) {
      state.emptyAt = Date.now();
    }

    this.save(state);
    await this.schedule(state);
    this.broadcast(state);
  }

  private async purgeRoom(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
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
    const previewMatch = url.pathname.match(/^\/room\/([A-Z0-9]{3,8})\/preview$/);

    if (match) {
      const room = env.ROOMS.getByName(match[1]);
      return room.fetch(request);
    }

    if (previewMatch) {
      if (request.method !== "GET") {
        return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET" } });
      }
      const room = env.ROOMS.getByName(previewMatch[1]);
      const preview = await room.preview();
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      };
      return preview
        ? Response.json(preview, { headers })
        : Response.json({ error: "Room not found." }, { status: 404, headers });
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
