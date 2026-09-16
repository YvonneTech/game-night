import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import YarnPalsGame, { YarnSlot } from "./YarnPalsGame";
import UndercoverGame, { UCView } from "./UndercoverGame";
import WavelengthGame, { WVView } from "./WavelengthGame";
import FakeArtistGame, { FAView } from "./FakeArtistGame";
import TelephoneGame, { TPView } from "./TelephoneGame";
import PunchlineGame, { PLView } from "./PunchlineGame";
import BalderdashGame, { BDView } from "./BalderdashGame";

type Game = "classic" | "passthepen" | "yarnpals" | "undercover" | "wavelength" | "fakeartist" | "telephone" | "punchline" | "balderdash" | "emoji";

function isEmojiOnly(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  const noSpace = s.replace(/\s+/g, "");
  if (!noSpace) return false;
  let graphemes: string[];
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" } as any);
    graphemes = Array.from((seg as any).segment(noSpace), (x: any) => x.segment);
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

function formatEmojiDisplay(clue: string): string {
  const trimmed = clue.trim();
  if (!trimmed) return trimmed;
  let graphemes: string[];
  try {
    const seg = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" } as any);
    graphemes = Array.from((seg as any).segment(trimmed), (x: any) => x.segment);
  } catch {
    graphemes = Array.from(trimmed);
  }
  const filtered = graphemes.filter((g) => g.trim() !== "");
  return filtered.join(" ");
}

const EMOJI_SUGGESTIONS: Record<string, string> = {
  // EN movies
  "Titanic": "🚢🧊💔",
  "Jaws": "🦈🏊😱",
  "Frozen": "❄️👭⛄",
  "Avatar": "💙👽🌳",
  "Inception": "💭🌀💭",
  "The Lion King": "🦁👑🌅",
  "Harry Potter": "🧙⚡🦉",
  "Star Wars": "⭐⚔️🚀",
  "Jurassic Park": "🦕🏞️😱",
  "The Godfather": "🤵🔫🍝",
  "Forrest Gump": "🏃🍫🍤",
  "Spider-Man": "🕷️🧑🏙️",
  "The Avengers": "🦸🌍💥",
  "Toy Story": "🧸🚀🤠",
  "Finding Nemo": "🐠🔍🌊",
  "The Matrix": "💊🔴🔵",
  "Gladiator": "⚔️🏟️👑",
  "Pirates of the Caribbean": "🏴‍☠️🦜💰",
  "King Kong": "🦍🏙️✈️",
  "Godzilla": "🦖🏙️🔥",
  "Batman": "🦇🚗🌃",
  "Superman": "🦸🔵🔴",
  "Iron Man": "🤖❤️⚡",
  "Black Panther": "🐆👑🌍",
  "Wonder Woman": "👸⚔️✨",
  "The Dark Knight": "🌃🦇🃏",
  "Coco": "🎸💀🌼",
  "Up": "🎈🏠🌈",
  "Wall-E": "🤖🌱🚀",
  "Shrek": "🟢👹🧅",
  "Kung Fu Panda": "🐼🥋🍜",
  "Despicable Me": "🌙💛👨‍🔬",
  "Minions": "💛👓🍌",
  "The Little Mermaid": "🧜‍♀️🌊🔱",
  "Beauty and the Beast": "🌹👹👸",
  "Aladdin": "🪔🤴🐒",
  "Mulan": "👩⚔️🐉",
  "Cinderella": "👠🎃🕛",
  "Snow White": "🍎👸⛏️",
  "Sleeping Beauty": "😴🌹💋",
  "Pinocchio": "🤥👃🐋",
  "Dumbo": "🐘👂🎪",
  // ZH 成语
  "守株待兔": "🌳🪵🐇",
  "掩耳盗铃": "🙈👂🔔",
  "亡羊补牢": "🐑🏃🛠️",
  "井底之蛙": "🕳️🐸👀",
  "对牛弹琴": "🐮🎵😑",
  "指鹿为马": "🦌👉🐴",
  "刻舟求剑": "⛵🔪🌊",
  "卧薪尝胆": "😖🌾💪",
  "破釜沉舟": "🍲💥🚢",
  "四面楚歌": "🎵🎵😰",
  "草木皆兵": "🌿🌳😱",
  "打草惊蛇": "🌾👋🐍",
  "画饼充饥": "🖌️🥞😋",
  "望梅止渴": "👀🍑💧",
  "杯弓蛇影": "🍵🏹🐍",
  "狐假虎威": "🦊🐯😤",
  "拔苗助长": "🌱⬆️🙌",
  "滥竽充数": "🎶🤥👥",
  "叶公好龙": "🐉😍😱",
  "自相矛盾": "🛡️⚔️🤔",
  "坐井观天": "🕳️👀🌤️",
  "胸有成竹": "💪🎋✅",
  "一箭双雕": "🏹🦅🦅",
  "一石二鸟": "🪨🐦🐦",
  "九牛一毛": "🐮🐮✂️",
  "百发百中": "🎯💯",
  "千钧一发": "⚖️😱💥",
  "万马奔腾": "🐎🐎💨",
  "龙马精神": "🐉🐎✨",
  "虎虎生威": "🐯💪✨",
  "鸡飞狗跳": "🐔🐕💨",
  "狗急跳墙": "🐕🧱😱",
  "兔死狐悲": "🐇💀🦊😢",
  "狐朋狗友": "🦊🐕👯",
  "狼吞虎咽": "🐺🍖😋",
  "龙飞凤舞": "🐉💃✨",
  "凤毛麟角": "🪶✨🦄",
  "鹤立鸡群": "🦩🐔🐔",
  "一目了然": "👀✅",
  "三心二意": "3️⃣💗2️⃣💭",
  "五颜六色": "🎨🌈",
  "七上八下": "7️⃣⬆️8️⃣⬇️",
  "八仙过海": "👴🌊⛵",
  "九死一生": "9️⃣💀1️⃣✨",
  "十全十美": "🔟💯",
  "东山再起": "⛰️⬆️💪",
  "南辕北辙": "🧭🔄😵",
  "左顾右盼": "👀⬅️👀➡️",
  "马到成功": "🐎✅🎉",
  "鸡犬不宁": "🐔🐕😡",
  "龙争虎斗": "🐉⚔️🐯",
  "火眼金睛": "🔥👀✨",
  "风雨同舟": "🌧️⛵🤝",
  "花好月圆": "🌸🌕⭕",
  "一帆风顺": "⛵💨✅",
  "一鸣惊人": "🐦🔊😲",
  "三顾茅庐": "3️⃣🏠🙏",
  "张牙舞爪": "😬🐾😤",
  "眉开眼笑": "😄👀😁",
  "手舞足蹈": "💃🕺🎉",
  "心花怒放": "💖🌸💥",
  "杯水车薪": "🥤🔥🚒",
  "水到渠成": "💧➡️✅",
  "纸上谈兵": "📄⚔️🗣️",
  "对症下药": "💊🎯✅",
  "虎视眈眈": "🐯👀😠",
  "龙潭虎穴": "🐉🐯🕳️",
  "羊入虎口": "🐑🐯😱",
  "鸡鸣狗盗": "🐔🔊🕵️",
  "月黑风高": "🌙⬛💨",
  "星星之火": "⭐🔥",
  "日新月异": "☀️🔄🌙",
  "四面八方": "🧭🧭🧭",
  "五光十色": "✨🌈✨",
  "鹤发童颜": "👴👶✨",
  "落井下石": "🕳️🪨⬇️",
  "瓜熟蒂落": "🍈✅⬇️",
  "闻鸡起舞": "🐔🔊💃",
  "鸡毛蒜皮": "🐔🪶🧄",
  "狗仗人势": "🐕😤👤",
  "狼心狗肺": "🐺💔🐕",
  "蛇蝎心肠": "🐍🦂🖤",
  "马不停蹄": "🐎💨🏃",
  "一丝不苟": "🧵🔍✅",
  "一诺千金": "🤝💰💯",
  "三令五申": "3️⃣📢5️⃣📢",
  "前赴后继": "🏃➡️🏃",
  "怒发冲冠": "😡💢👑",
  "水火不容": "💧🔥❌",
  "雷厉风行": "⚡💨🏃",
  "电光火石": "⚡✨🪨",
  "一见钟情": "👀❤️⚡",
  "两全其美": "2️⃣✅🌸",
  "三阳开泰": "3️⃣☀️🐑",
  "四季平安": "🌸☀️🍂❄️",
  "五福临门": "5️⃣🍀🚪",
  "六六大顺": "6️⃣6️⃣✅",
  "七星高照": "7️⃣⭐✨",
  "八方来财": "8️⃣💰⬅️",
  "九牛二虎": "9️⃣🐮2️⃣🐯",
  "十拿九稳": "🔟✋9️⃣✅",
  "一马当先": "1️⃣🐎⬆️",
  "一触即发": "1️⃣👆💥",
  "一落千丈": "1️⃣⬇️📏",
  "一针见血": "💉🩸✅",
  "二话不说": "2️⃣🤐",
  "三生有幸": "3️⃣🍀😊",
  "四海一家": "4️⃣🌊👪",
  "五彩缤纷": "5️⃣🎨✨",
  "八面玲珑": "8️⃣😊✨",
  "十万火急": "🔟🔥🚨",
  "东张西望": "👀⬅️➡️",
  "春暖花开": "🌸☀️🌷",
  "秋高气爽": "🍂☀️😌",
  "风和日丽": "🌬️☀️😊",
  "雨过天晴": "🌧️➡️☀️",
  "鸟语花香": "🐦🎵🌸",
  "花前月下": "🌸🌙💑",
  "柳暗花明": "🌳🌸✨",
  "虎口余生": "🐯😮‍💨✌️",
  "狗尾续貂": "🐕➡️🦡",
  "鼠目寸光": "🐭👀📏",
  "牛刀小试": "🐮🔪😏",
  "羊肠小道": "🐑➿🛤️",
  "马首是瞻": "🐎👀⬆️",
  "龙凤呈祥": "🐉🐦🎉",
  "鹏程万里": "🦅🛤️✨",
  "鱼跃龙门": "🐟⬆️🚪",
  "眉飞色舞": "🤨💃✨",
  "喜笑颜开": "😄😁🎉",
  "泪流满面": "😭💧😢",
  "心直口快": "❤️🗣️⚡",
  "大材小用": "🪵🔨😅",
  "小题大做": "🔍⬆️😱",
  "半途而废": "🛤️🚫🏁",
  "一曝十寒": "☀️1️⃣❄️🔟",
  "四通八达": "4️⃣🛣️✅",
  "五脏六腑": "5️⃣🫀🫁",
  "七嘴八舌": "7️⃣👄🗣️",
  "十指连心": "🔟👆❤️",
  "东倒西歪": "⬅️🤪➡️",
  "南腔北调": "🗣️🎵🔄",
  "左思右想": "🧠⬅️➡️",
  "前所未有": "⬆️🆕😲",
  "春风得意": "🌬️😊🎉",
  "夏虫语冰": "🐛❄️🤔",
  "秋收冬藏": "🍂🌾❄️",
  "冬日暖阳": "❄️☀️😊",
  "风吹草动": "🌬️🌱👀",
  "雨后春笋": "🌧️🎋⬆️",
};
type GameMode = "pictionary" | "charades" | "mixed";
type RoundMode = "pictionary" | "charades";
type Phase = "landing" | "lobby" | "choosing" | "playing" | "roundEnd" | "gameEnd" | "teams";
type YarnState = { startsAt: number; durationSeconds: number; teams: YarnSlot[] };

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

type RelaySlot = { id: string; name: string; color: string };
type RelaySnapshot = {
  order: RelaySlot[];
  currentId: string;
  nextId: string | null;
  turnTimeLeft: number;
  turnSeconds: number;
};

type Snapshot = {
  code: string;
  phase: Exclude<Phase, "landing">;
  players: Player[];
  game: Game;
  lang: "en" | "zh";
  mode: GameMode;
  rounds: 1 | 5 | 10 | 15;
  round: Round | null;
  yarn: YarnState | null;
  undercover: UCView | null;
  wavelength: WVView | null;
  fakeartist: FAView | null;
  telephone: TPView | null;
  punchline: PLView | null;
  balderdash: BDView | null;
  solved: number;
  messages: Message[];
  strokes: Stroke[];
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
  createdAt: number;
  updatedAt: number;
};

type ServerMessage =
  | { type: "session"; payload: { playerId: string; reconnectToken: string } }
  | { type: "state"; payload: Snapshot }
  | { type: "error"; payload: { message: string } }
  | { type: "kicked"; payload: { message: string } };

type Notice = {
  id: number;
  text: string;
  tone: "default" | "success";
  autoDismissMs?: number;
};

const COLORS = ["#4f7cff", "#e0576f", "#18a67d", "#f4c542", "#8b6be8", "#ef7d33"];
const ROOM_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const AUTO_RECONNECT_MS = 60_000;

type RoomSession = { playerId: string; reconnectToken: string };

const GAME_LABELS: Record<"en" | "zh", Record<Game, string>> = {
  en: {
    classic: "Pictionary",
    passthepen: "Pass the Pen",
    yarnpals: "Kitty Cup",
    undercover: "Undercover",
    wavelength: "In Sync",
    fakeartist: "Sketchy",
    telephone: "Telephone",
    punchline: "Punchline",
    balderdash: "Balderdash",
    emoji: "Emoji Movie",
  },
  zh: {
    classic: "你画我猜",
    passthepen: "接力画",
    yarnpals: "猫咪杯",
    undercover: "谁是卧底",
    wavelength: "心有灵序",
    fakeartist: "滥竽充画",
    telephone: "传声画筒",
    punchline: "神回复",
    balderdash: "胡说八道",
    emoji: "表情猜成语",
  },
};

const MODE_LABELS: Record<"en" | "zh", Record<GameMode, string>> = {
  en: { pictionary: "Pictionary", charades: "Charades", mixed: "Mixed" },
  zh: { pictionary: "你画我猜", charades: "你演我猜", mixed: "混合" },
};

const LOBBY_GAME_CHOICES = [
  { key: "pictionary", game: "classic", mode: "pictionary" },
  { key: "telephone", game: "telephone" },
  { key: "passthepen", game: "passthepen" },
  { key: "fakeartist", game: "fakeartist" },
  { key: "charades", game: "classic", mode: "charades" },
  { key: "undercover", game: "undercover" },
  { key: "wavelength", game: "wavelength" },
  { key: "balderdash", game: "balderdash" },
  { key: "emoji", game: "emoji" },
] as const;

const GAME_INFO: Record<"en" | "zh", Record<Game, { blurb: string; scoring: string }>> = {
  en: {
    classic: {
      blurb: "One player draws a secret word while everyone else races to guess it in chat.",
      scoring: "Guessers earn 100 / 80 / 60 / 40 / 20 by order; the performer earns +20 for each correct guess.",
    },
    passthepen: {
      blurb: "One guesser, everyone else relay-draws the secret (~10-18s each), then a final 30s to guess. Needs 3+ players.",
      scoring: "Guess it and the whole team scores — faster is worth more.",
    },
    yarnpals: {
      blurb: "Chaotic 3v3 cat soccer — random teams, everyone drives a cat, knock the yarn ball into the other goal.",
      scoring: "Most goals in 2 minutes wins.",
    },
    undercover: {
      blurb:
        "Everyone gets a secret word — the undercover(s) get a similar but different one. Each round describe your word, then vote out who you think is the spy. Needs 4+ players.",
      scoring: "Civilians win by voting out every undercover; the undercover wins by surviving to the end.",
    },
    wavelength: {
      blurb:
        "Everyone gets a secret number from 0–100 and writes a clue for the same spectrum. Reveal and place your card whenever you're ready, then flip every number from left to right. Needs 3+ players.",
      scoring: "No points — see whether your clues landed in the right order.",
    },
    fakeartist: {
      blurb:
        "Everyone co-draws on one canvas — one fake artist only sees the category, not the word. Spot the fake by their weird strokes! Needs 3+ players.",
      scoring: "Vote out the fake to win — real painters get +100 if they catch the fake, fake gets +100 if they fool everyone.",
    },
    telephone: {
      blurb:
        "Everyone writes a secret sentence, then chains rotate: draw what you got, caption the drawing you got, and repeat. At the end, replay every chain to see how far it drifted. Needs 3+ players.",
      scoring: "Just for laughs — no points.",
    },
    punchline: {
      blurb:
        "Each round everyone answers the same silly prompt, then all the answers show up anonymously and everyone votes for their favorite — you just can't vote for your own. 3 prompts, needs 3+ players.",
      scoring: "Every vote your answer gets is worth 100 points — most points after all rounds wins.",
    },
    balderdash: {
      blurb:
        "Obscure word, fake definitions. Everyone invents a believable definition, then votes for the REAL one. Fool others + find the truth. 3 words, needs 3+ players.",
      scoring: "+100 for spotting the real definition, +50 for each player you fool.",
    },
    emoji: {
      blurb:
        "One player gets a secret movie and must describe it with emojis only. Everyone else races to guess it in chat.",
      scoring: "Guessers earn 100 / 80 / 60 / 40 / 20 by order; the performer earns +20 for each correct guess.",
    },
  },
  zh: {
    classic: {
      blurb: "一人画出秘密词，其他人在聊天里抢答。",
      scoring: "猜对按先后得 100 / 80 / 60 / 40 / 20 分;出题人每被猜对一次 +20。",
    },
    passthepen: {
      blurb: "一人猜,其余人接力画同一个秘密(每人约 10–18 秒),最后再给猜的人 30 秒。需 3 人以上。",
      scoring: "猜中时全队一起得分——越快分越高。",
    },
    yarnpals: {
      blurb: "混乱的 3v3 猫咪足球——随机分队,每人操控一只猫,把毛线球顶进对方球门。",
      scoring: "2 分钟内进球多者获胜。",
    },
    undercover: {
      blurb: "每人拿到一个秘密词,卧底拿到的是相近但不同的词。每轮描述自己的词,再投票选出你认为的卧底。需 4 人以上。",
      scoring: "把所有卧底都投出局=平民赢;卧底撑到最后=卧底赢。",
    },
    wavelength: {
      blurb: "每人抽取一个 0–100 的秘密数字，并围绕同一组刻度写提示。准备好就公开提示并把牌插入队列，最后从左到右翻开数字。需 3 人以上。",
      scoring: "不计分，只看大家能不能排成正确顺序。",
    },
    fakeartist: {
      blurb: "所有人在同一画布接力画画 — 假画家只知道类别，看不到词。靠画风找出卧底！需 3 人以上。",
      scoring: "投出假画家则真画家每人 +100；没投中则假画家 +100。",
    },
    telephone: {
      blurb: "每人先偷偷写一句话,然后开始接龙:把收到的句子画出来,再给收到的画配上文字,轮流传下去。最后一起回放,看每条接龙是怎么越传越离谱的。需 3 人以上。",
      scoring: "不计分,图一乐。",
    },
    punchline: {
      blurb: "每一轮所有人回答同一个搞笑题目,然后所有回答匿名亮出,大家投票选出最好笑的一条 —— 只是不能投自己。共 3 题,需 3 人以上。",
      scoring: "你的回答每得一票 = 100 分,全部结束后总分最高者获胜。",
    },
    balderdash: {
      blurb: "生僻词+瞎编。每人给同一个生僻词编一个假解释,然后投票找出真正的解释。骗到人得分,找对真相也得分。共3词,需3人以上。",
      scoring: "找出真解释+100,你的假解释每骗到1人+50。",
    },
    emoji: {
      blurb: "一人抽到秘密成语，只能用表情符号来描述，其他人在聊天里抢答。",
      scoring: "猜对按先后得 100 / 80 / 60 / 40 / 20 分；出题人每被猜对一次 +20。",
    },
  },
};

const CHARADES_INFO: Record<"en" | "zh", { blurb: string; scoring: string }> = {
  en: {
    blurb: "One player acts out a secret word without speaking while everyone else races to guess it in chat.",
    scoring: "Guessers earn 100 / 80 / 60 / 40 / 20 by order; the performer earns +20 for each correct guess.",
  },
  zh: {
    blurb: "一人不能说话，只能用动作表演秘密词，其他人在聊天里抢答。",
    scoring: "猜对按先后得 100 / 80 / 60 / 40 / 20 分；表演者每被猜对一次 +20。",
  },
};

function roomSessionKey(code: string): string {
  return `game-night:session:${code}`;
}

function readRoomSession(code: string): RoomSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(roomSessionKey(code)) ?? "null") as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "playerId" in parsed &&
      "reconnectToken" in parsed &&
      typeof parsed.playerId === "string" &&
      typeof parsed.reconnectToken === "string" &&
      /^[0-9a-f]{64}$/.test(parsed.reconnectToken)
    ) {
      return { playerId: parsed.playerId, reconnectToken: parsed.reconnectToken };
    }
  } catch {
    // Storage can be unavailable or contain stale data.
  }
  return null;
}

function saveRoomSession(code: string, session: RoomSession): void {
  try {
    localStorage.setItem(roomSessionKey(code), JSON.stringify(session));
  } catch {
    // The current tab can still play even if persistent storage is unavailable.
  }
}

function clearRoomSession(code: string): void {
  try {
    localStorage.removeItem(roomSessionKey(code));
  } catch {
    // Ignore unavailable storage.
  }
}

function setRoomInUrl(code: string): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  window.history.replaceState(null, "", url);
}

function roomFromUrl(): string {
  try {
    return (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase().slice(0, 8);
  } catch {
    return "";
  }
}

function roomCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CHARS[byte % ROOM_CHARS.length]).join("");
}

function socketBase(): string {
  const { hostname, host, port, protocol } = window.location;
  if (hostname === "localhost" && (port === "5173" || port === "5174")) {
    return "ws://localhost:8787";
  }
  return `${protocol === "https:" ? "wss:" : "ws:"}//${host}`;
}

function apiBase(): string {
  return socketBase().replace(/^ws/, "http");
}

function parseMessage(value: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(value) as ServerMessage;
    return parsed.type === "session" || parsed.type === "state" || parsed.type === "error" || parsed.type === "kicked" ? parsed : null;
  } catch {
    return null;
  }
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function displayName(player?: Player): string {
  return player?.name ?? "Player";
}

function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0].toUpperCase() : "?";
}

function messageClass(message: Message): string {
  if (message.system && /^Round \d+/i.test(message.text)) return "message system round-change";
  if (message.system) return "message system";
  if (message.correct) return "message correct";
  return "message";
}

export default function App() {
  const [id, setId] = useState("");
  const [name, setName] = useState(() => localStorage.getItem("fresh_game_name") ?? "");
  const [color, setColor] = useState(() => localStorage.getItem("fresh_game_color") ?? COLORS[0]);
  const [lang, setLang] = useState<"en" | "zh">(() => (localStorage.getItem("fresh_game_lang") === "zh" ? "zh" : "en"));
  const [inviteEntryCode, setInviteEntryCode] = useState(roomFromUrl);
  const [joinCode, setJoinCode] = useState(inviteEntryCode);
  const [invitePreview, setInvitePreview] = useState<
    { status: "loading" | "ready" | "unavailable"; hostName: string }
  >({ status: inviteEntryCode ? "loading" : "unavailable", hostName: "" });
  const [room, setRoom] = useState("");
  const [phase, setPhase] = useState<Phase>("landing");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "closed">("idle");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [guess, setGuess] = useState("");
  const [emojiInput, setEmojiInput] = useState("");
  const [mobileGuessesOpen, setMobileGuessesOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [turnLeft, setTurnLeft] = useState(0);
  const [teamCountdown, setTeamCountdown] = useState(3);
  const wsRef = useRef<WebSocket | null>(null);
  const closingRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectStartedAtRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const connectRef = useRef<((code: string, create: boolean, preserveState?: boolean) => void) | null>(null);
  const roomSessionsRef = useRef<Record<string, RoomSession>>({});
  const autoJoinStartedRef = useRef(false);
  const wasDisconnectedRef = useRef(false);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const mobileChatRef = useRef<HTMLDivElement | null>(null);
  const noticeIdRef = useRef(0);
  const yarnNetRef = useRef<((msg: { type: "yarnWorld" | "yarnInput"; payload: any }) => void) | null>(null);

  const players = snapshot?.players ?? [];
  const me = players.find((player) => player.id === id);
  const host = !!me?.host;
  const uiLang = snapshot?.lang ?? lang;
  const zh = uiLang === "zh";
  const hostOnlySettings = "Only the host can change the game settings.";
  const game = snapshot?.game ?? "classic";
  const round = snapshot?.round ?? null;
  const classicMode = snapshot?.mode === "charades" ? "charades" : "pictionary";
  const selectedGameLabel = game === "classic" ? MODE_LABELS[uiLang][classicMode] : GAME_LABELS[uiLang][game];
  const selectedGameInfo =
    game === "classic" && classicMode === "charades" ? CHARADES_INFO[uiLang] : GAME_INFO[uiLang][game];
  const performer = players.find((player) => player.id === round?.performerId);
  const canGuess = phase === "playing" && !!snapshot?.youGuess && !me?.guessed;
  const minPlayers =
    game === "undercover"
      ? 4
      : game === "passthepen" ||
          game === "wavelength" ||
          game === "fakeartist" ||
          game === "telephone" ||
          game === "punchline" ||
          game === "balderdash"
        ? 3
        : 2;
  const hasJoinCode = joinCode.trim().length > 0;
  const openedFromInviteLink = inviteEntryCode.length > 0;
  const canChooseLanguage =
    (phase === "landing" && !openedFromInviteLink) || (phase === "lobby" && host && status === "connected");
  const sorted = useMemo(
    () => [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    [players],
  );

  const showNotice = useCallback((text: string, tone: Notice["tone"] = "default", autoDismissMs?: number) => {
    noticeIdRef.current += 1;
    setNotice({ id: noticeIdRef.current, text, tone, autoDismissMs });
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const send = useCallback((type: string, payload?: unknown): boolean => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      showNotice("Connection is not ready");
      return false;
    }
    socket.send(JSON.stringify({ type, payload }));
    return true;
  }, [showNotice]);

  const changeSettings = useCallback(
    (patch: Partial<{ game: Game; lang: "en" | "zh"; mode: GameMode; rounds: 1 | 5 | 10 | 15 }>) => {
      if (!snapshot) return;
      send("settings", {
        game: snapshot.game,
        lang: snapshot.lang,
        mode: snapshot.mode,
        rounds: snapshot.rounds,
        ...patch,
      });
    },
    [send, snapshot],
  );

  function changeLanguage(nextLang: "en" | "zh") {
    setLang(nextLang);
    try {
      localStorage.setItem("fresh_game_lang", nextLang);
    } catch {
      // The language still changes for this tab when persistent storage is unavailable.
    }
    if (phase === "lobby" && snapshot && host) changeSettings({ lang: nextLang });
  }

  const connect = useCallback(
    (code: string, create: boolean, preserveState = false) => {
      const cleanName = name.trim();
      const cleanCode = code.trim().toUpperCase();
      if (!cleanName) {
        showNotice("Enter your name");
        return;
      }
      if (!/^[A-Z0-9]{3,8}$/.test(cleanCode)) {
        showNotice("Enter a room code");
        return;
      }

      try {
        localStorage.setItem("fresh_game_name", cleanName);
        localStorage.setItem("fresh_game_color", color);
        localStorage.setItem("fresh_game_lang", lang);
      } catch {
        // Playing still works for this tab; only cross-tab recovery is unavailable.
      }

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const savedSession = create ? null : (roomSessionsRef.current[cleanCode] ?? readRoomSession(cleanCode));
      setId(savedSession?.playerId ?? "");
      closingRef.current = true;
      const previousSocket = wsRef.current;
      wsRef.current = null;
      previousSocket?.close();
      closingRef.current = false;

      const socket = new WebSocket(`${socketBase()}/room/${cleanCode}/ws`);
      let joined = false;
      wsRef.current = socket;
      setStatus("connecting");
      if (!preserveState) clearNotice();
      setRoom(cleanCode);
      setRoomInUrl(cleanCode);
      if (!preserveState) {
        setPhase("lobby");
        setSnapshot(null);
      }

      socket.addEventListener("open", () => {
        socket.send(
          JSON.stringify({
            type: "join",
            payload: {
              create,
              lang,
              reconnectToken: savedSession?.reconnectToken,
              player: { id: savedSession?.playerId ?? "", name: cleanName, color },
            },
          }),
        );
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        if (event.data.indexOf("yarn") !== -1) {
          try {
            const raw = JSON.parse(event.data);
            if (raw && (raw.type === "yarnWorld" || raw.type === "yarnInput")) {
              yarnNetRef.current?.(raw);
              return;
            }
          } catch {
            return;
          }
        }
        const message = parseMessage(event.data);
        if (!message) return;
        if (message.type === "session") {
          joined = true;
          const nextSession = {
            playerId: message.payload.playerId,
            reconnectToken: message.payload.reconnectToken,
          };
          roomSessionsRef.current[cleanCode] = nextSession;
          saveRoomSession(cleanCode, nextSession);
          setId(nextSession.playerId);
          setStatus("connected");
          reconnectStartedAtRef.current = 0;
          reconnectAttemptRef.current = 0;
          if (wasDisconnectedRef.current) {
            wasDisconnectedRef.current = false;
            showNotice("Reconnected — you're back in the game", "success", 3500);
          }
          return;
        }
        if (message.type === "error") {
          if (message.payload.message === "Room not found." || message.payload.message === "Your reconnect session has expired.") {
            clearRoomSession(cleanCode);
            delete roomSessionsRef.current[cleanCode];
            setId("");
          }
          showNotice(message.payload.message);
          if (!joined) {
            closingRef.current = true;
            if (wsRef.current === socket) wsRef.current = null;
            socket.close();
            setSnapshot(null);
            setRoom("");
            setPhase("landing");
            setStatus("idle");
          }
          return;
        }
        if (message.type === "kicked") {
          closingRef.current = true;
          if (wsRef.current === socket) wsRef.current = null;
          socket.close();
          clearRoomSession(cleanCode);
          delete roomSessionsRef.current[cleanCode];
          setRoomInUrl("");
          setInviteEntryCode("");
          setJoinCode("");
          setId("");
          showNotice(message.payload.message);
          setSnapshot(null);
          setRoom("");
          setPhase("landing");
          setStatus("idle");
          return;
        }
        setStatus("connected");
        reconnectStartedAtRef.current = 0;
        reconnectAttemptRef.current = 0;
        setSnapshot(message.payload);
        setPhase(message.payload.phase);
        setTimeLeft(message.payload.timeLeft);
      });

      socket.addEventListener("close", (event) => {
        if (wsRef.current !== socket) return;
        wsRef.current = null;
        if (closingRef.current) {
          setStatus("idle");
          return;
        }

        setStatus("closed");
        if (event.code === 1000 || event.code === 1008 || event.code === 4000) {
          if (event.code === 4000) showNotice("This player reconnected in another tab.");
          return;
        }

        wasDisconnectedRef.current = true;
        if (!reconnectStartedAtRef.current) reconnectStartedAtRef.current = Date.now();
        if (Date.now() - reconnectStartedAtRef.current >= AUTO_RECONNECT_MS) {
          showNotice("Automatic reconnect timed out — tap Reconnect to try again.");
          return;
        }

        const delay = Math.min(10_000, 1000 * 2 ** reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        setStatus("connecting");
        showNotice("Connection lost — reconnecting…");
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          connectRef.current?.(cleanCode, false, true);
        }, delay);
      });

      socket.addEventListener("error", () => {
        // The close event owns retry behavior and user-facing status.
      });
    },
    [clearNotice, color, lang, name, showNotice],
  );

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!inviteEntryCode) return;

    const controller = new AbortController();
    setInvitePreview({ status: "loading", hostName: "" });
    void fetch(`${apiBase()}/room/${encodeURIComponent(inviteEntryCode)}/preview`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Room unavailable");
        const preview = (await response.json()) as unknown;
        if (!preview || typeof preview !== "object" || !("hostName" in preview) || typeof preview.hostName !== "string") {
          throw new Error("Invalid room preview");
        }
        setInvitePreview({ status: "ready", hostName: preview.hostName });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setInvitePreview({ status: "unavailable", hostName: "" });
      });

    return () => controller.abort();
  }, [inviteEntryCode]);

  useEffect(() => {
    return () => {
      closingRef.current = true;
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      autoJoinStartedRef.current = false;
      const socket = wsRef.current;
      wsRef.current = null;
      socket?.close();
    };
  }, []);

  useEffect(() => {
    if (autoJoinStartedRef.current || !joinCode || !name.trim() || !readRoomSession(joinCode)) return;
    autoJoinStartedRef.current = true;
    connect(joinCode, false);
  }, [connect, joinCode, name]);

  useEffect(() => {
    if (phase !== "playing" || !round?.startedAt) {
      setTimeLeft(snapshot?.timeLeft ?? 0);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - round.startedAt) / 1000);
      setTimeLeft(Math.max(0, round.durationSeconds - elapsed));
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [phase, round?.startedAt, round?.durationSeconds, snapshot?.timeLeft]);

  useEffect(() => {
    if (game !== "passthepen" || phase !== "playing" || !round?.turnStartedAt) {
      setTurnLeft(snapshot?.relay?.turnTimeLeft ?? 0);
      return;
    }
    const secs = round.turnSeconds ?? 10;
    const start = round.turnStartedAt;
    const tick = () => setTurnLeft(Math.max(0, secs - Math.floor((Date.now() - start) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [game, phase, round?.turnStartedAt, round?.turnSeconds, snapshot?.relay?.turnTimeLeft]);

  useEffect(() => {
    if (phase !== "teams" || !snapshot?.yarn) return;
    const startsAt = snapshot.yarn.startsAt;
    const tick = () => setTeamCountdown(Math.max(0, Math.ceil((startsAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [phase, snapshot?.yarn?.startsAt]);

  useEffect(() => {
    const chat = chatRef.current;
    if (chat) chat.scrollTop = chat.scrollHeight;
    const mobileChat = mobileChatRef.current;
    if (mobileChat) mobileChat.scrollTop = mobileChat.scrollHeight;
  }, [mobileGuessesOpen, snapshot?.messages.length]);

  useEffect(() => {
    setMobileGuessesOpen(false);
    setGuess("");
    setEmojiInput("");
  }, [game, phase, round?.number]);

  useEffect(() => {
    if (!mobileGuessesOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileGuessesOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileGuessesOpen]);

  useEffect(() => {
    if (!notice?.autoDismissMs) return;
    const id = notice.id;
    const timer = window.setTimeout(() => {
      setNotice((current) => (current?.id === id ? null : current));
    }, notice.autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function createRoom() {
    reconnectStartedAtRef.current = 0;
    reconnectAttemptRef.current = 0;
    connect(roomCode(), true);
  }

  function joinRoom() {
    reconnectStartedAtRef.current = 0;
    reconnectAttemptRef.current = 0;
    connect(joinCode, false);
  }

  function copyInviteLink() {
    if (!room) return;
    const link = `${window.location.origin}/?room=${room}`;
    void navigator.clipboard
      ?.writeText(link)
      .then(() => showNotice("Invite link copied — share it so friends jump straight in", "success", 5000))
      .catch(() => showNotice(link));
  }

  function reconnect() {
    if (!room) return;
    reconnectStartedAtRef.current = Date.now();
    reconnectAttemptRef.current = 0;
    wasDisconnectedRef.current = true;
    connect(room, false, true);
  }

  function leaveRoom() {
    closingRef.current = true;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    send("leave");
    const socket = wsRef.current;
    wsRef.current = null;
    socket?.close();
    if (room) clearRoomSession(room);
    if (room) delete roomSessionsRef.current[room];
    setRoomInUrl("");
    setInviteEntryCode("");
    setJoinCode("");
    setId("");
    setSnapshot(null);
    setRoom("");
    setPhase("landing");
    setStatus("idle");
  }

  function submitGuess() {
    const text = guess.trim();
    if (!text) return;
    if (send("guess", { text })) setGuess("");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/logo-gn.svg" alt="Game Night" width={40} height={40} />
          <div>
            <strong>Game Night</strong>
            <span>Party games for 2-6 friends</span>
          </div>
        </div>
        <div className="topbar-actions">
          {canChooseLanguage && (
            <button
              className="secondary small language-toggle"
              aria-label={zh ? "Switch to English" : "切换为中文"}
              aria-pressed={zh}
              onClick={() => changeLanguage(zh ? "en" : "zh")}
            >
              <span className={zh ? "active" : ""}>中</span>
              <span aria-hidden="true">/</span>
              <span className={zh ? "" : "active"}>EN</span>
            </button>
          )}
          {room && (
            <div className="room-strip">
              <span className={`status ${status}`}>{status}</span>
              <div className="room-code-compact" aria-label={`Room code ${room}`}>
                <span>Room code</span>
                <strong>{room}</strong>
              </div>
              {status === "closed" && (
                <button className="primary small" onClick={reconnect}>
                  Reconnect
                </button>
              )}
              <button className="secondary small" onClick={copyInviteLink}>
                Invite
              </button>
              {host && phase !== "lobby" ? (
                <button className="secondary small" onClick={() => send("reset")} title="Ends the game for everyone">
                  ← Back to Lobby
                </button>
              ) : (
                <button className="secondary small" onClick={leaveRoom}>
                  Leave
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {notice && (
        <div className={`notice ${notice.tone}`}>
          <span>{notice.text}</span>
          <button onClick={clearNotice}>Dismiss</button>
        </div>
      )}

      {phase === "landing" && (
        <main className="entry">
          <section className="entry-panel">
            <h1>Game Night</h1>
            <p className="entry-sub">
              {openedFromInviteLink
                ? "You've been invited. Pick a name and color, then join the room."
                : "Pick a name and color, then start a room or join a friend's with their code."}
            </p>

            <label>
              Your name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") (hasJoinCode ? joinRoom : createRoom)();
                }}
                maxLength={18}
                placeholder="e.g. Alex"
              />
            </label>

            <div className="field">
              <span className="field-label">Your color</span>
              <div className="swatches">
                {COLORS.map((item) => (
                  <button
                    key={item}
                    className={item === color ? "selected" : ""}
                    style={{ background: item }}
                    aria-label={item}
                    onClick={() => setColor(item)}
                  />
                ))}
              </div>
            </div>

            <div className="you-preview">
              <span className="you-dot" style={{ background: color }}>{initial(name)}</span>
              <span>{name.trim() || "That's you"}</span>
            </div>

            {!openedFromInviteLink && (
              <>
                <button
                  className={`block create-btn ${hasJoinCode ? "secondary is-dimmed" : "primary"}`}
                  onClick={createRoom}
                >
                  Create a room
                </button>

                <div className="or-divider">
                  <span>or</span>
                </div>
              </>
            )}

            {openedFromInviteLink ? (
              <button className="primary block" onClick={joinRoom} disabled={invitePreview.status !== "ready"}>
                {invitePreview.status === "loading"
                  ? "Checking room…"
                  : invitePreview.status === "ready"
                    ? `Join ${invitePreview.hostName}'s room`
                    : "Room unavailable"}
              </button>
            ) : (
              <div className="join-box">
                <span className="field-label">Join with a code</span>
                <div className="join-line">
                  <input
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") joinRoom();
                    }}
                    maxLength={8}
                    placeholder="ABCDE"
                  />
                  <button className={hasJoinCode ? "primary" : "secondary is-dimmed"} onClick={joinRoom}>
                    Join
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      )}

      {phase !== "landing" && !snapshot && (
        <main className="center">
          <section className="result-panel">
            {status === "closed" ? (
              <>
                <p className="eyebrow">Disconnected</p>
                <h1>Connection lost</h1>
                <p className="muted">Rejoin room {room} to pick up where you left off.</p>
                <div className="gate-actions">
                  <button className="primary" onClick={reconnect}>
                    Reconnect
                  </button>
                  <button className="secondary" onClick={leaveRoom}>
                    Back to home
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow">Room {room}</p>
                <h1>Connecting…</h1>
                <div className="loader">•••</div>
              </>
            )}
          </section>
        </main>
      )}

      {phase === "lobby" && snapshot && (
        <main className="lobby">
          <section>
            <div className="section-head">
              <h1>Lobby</h1>
              <span>{players.length}/6</span>
            </div>
            <PlayerList players={players} myId={id} host={host} onKick={(playerId) => send("kick", { playerId })} />
          </section>

          <section className="settings">
            {!host && <p className="settings-note">{hostOnlySettings}</p>}
            <SettingGroup title="Game">
              {LOBBY_GAME_CHOICES.map((option) => {
                const optionMode = "mode" in option ? option.mode : undefined;
                const selected =
                  snapshot.game === option.game &&
                  (option.game !== "classic" || snapshot.mode === optionMode || (snapshot.mode === "mixed" && optionMode === "pictionary"));
                return (
                  <button
                    key={option.key}
                    className={selected ? "chip active" : "chip"}
                    disabled={!host}
                    title={!host ? hostOnlySettings : undefined}
                    onClick={() => changeSettings({ game: option.game, ...(optionMode ? { mode: optionMode } : {}) })}
                  >
                    {optionMode ? MODE_LABELS[snapshot.lang][optionMode] : GAME_LABELS[snapshot.lang][option.game]}
                  </button>
                );
              })}
            </SettingGroup>
            <div className="game-info">
              <p>{selectedGameInfo.blurb}</p>
              <p className="game-info-scoring">
                <span>{snapshot.lang === "zh" ? "计分：" : "Scoring:"}</span>
                {selectedGameInfo.scoring}
              </p>
            </div>
            {game !== "yarnpals" &&
              game !== "undercover" &&
              game !== "wavelength" &&
              game !== "fakeartist" &&
              game !== "telephone" &&
              game !== "punchline" &&
              game !== "balderdash" && (
              <SettingGroup title="Rounds">
                {([1, 5, 10, 15] as const).map((rounds) => (
                  <button
                    key={rounds}
                    className={snapshot.rounds === rounds ? "chip active" : "chip"}
                    disabled={!host}
                    title={!host ? hostOnlySettings : undefined}
                    onClick={() => changeSettings({ rounds })}
                  >
                    {rounds}
                  </button>
                ))}
              </SettingGroup>
            )}
            <button className="primary block" disabled={!host || players.length < minPlayers} onClick={() => send("start")}>
              Start
            </button>
            {host && players.length < minPlayers && (
              <p className="settings-note start-note">Need at least {minPlayers} players to start {selectedGameLabel}.</p>
            )}
          </section>
        </main>
      )}

      {phase === "teams" && snapshot?.yarn && (
        <main className="center">
          <section className="result-panel wide">
            <p className="eyebrow">
              {GAME_LABELS[snapshot.lang].yarnpals} · {snapshot.lang === "zh" ? "分队完成" : "teams drawn"}
            </p>
            <h1 className="yarn-count">{teamCountdown > 0 ? teamCountdown : "GO!"}</h1>
            <div className="teams-vs">
              <div className="team-col pink">
                <h3>🩷 Pink</h3>
                {snapshot.yarn.teams
                  .filter((slot) => slot.team === 0)
                  .map((slot) => (
                    <div key={slot.id} className={`team-chip ${slot.id === id ? "me" : ""}`}>
                      {slot.name}
                      {slot.bot ? " · bot" : slot.id === id ? " · you" : ""}
                    </div>
                  ))}
              </div>
              <div className="vs-mark">VS</div>
              <div className="team-col blue">
                <h3>🩵 Blue</h3>
                {snapshot.yarn.teams
                  .filter((slot) => slot.team === 1)
                  .map((slot) => (
                    <div key={slot.id} className={`team-chip ${slot.id === id ? "me" : ""}`}>
                      {slot.name}
                      {slot.bot ? " · bot" : slot.id === id ? " · you" : ""}
                    </div>
                  ))}
              </div>
            </div>
          </section>
        </main>
      )}

      {phase === "playing" && snapshot?.yarn && game === "yarnpals" && (
        <main className="yarn-main">
          <YarnPalsGame
            teams={snapshot.yarn.teams}
            myId={id}
            durationSeconds={snapshot.yarn.durationSeconds}
            isHost={host}
            send={send}
            netRef={yarnNetRef}
            onPlayAgain={() => send("start")}
            onExit={() => send("reset")}
          />
        </main>
      )}

      {phase === "playing" && snapshot?.undercover && game === "undercover" && (
        <UndercoverGame view={snapshot.undercover} myId={id} isHost={host} lang={snapshot.lang} send={send} />
      )}

      {phase === "playing" && snapshot?.wavelength && game === "wavelength" && (
        <WavelengthGame view={snapshot.wavelength} isHost={host} lang={snapshot.lang} send={send} />
      )}

      {phase === "playing" && snapshot?.fakeartist && game === "fakeartist" && (
        <FakeArtistGame view={snapshot.fakeartist} myId={id} strokes={snapshot.strokes} isHost={host} lang={snapshot.lang} send={send} />
      )}

      {phase === "playing" && snapshot?.telephone && game === "telephone" && (
        <TelephoneGame view={snapshot.telephone} myId={id} isHost={host} lang={snapshot.lang} send={send} />
      )}

      {phase === "playing" && snapshot?.punchline && game === "punchline" && (
        <PunchlineGame view={snapshot.punchline} myId={id} isHost={host} lang={snapshot.lang} send={send} />
      )}

      {phase === "playing" && snapshot?.balderdash && game === "balderdash" && (
        <BalderdashGame view={snapshot.balderdash} myId={id} isHost={host} lang={snapshot.lang} send={send} />
      )}

      {phase === "choosing" && snapshot && round && (
        <main className="center">
          <section className="result-panel">
            <p className="eyebrow">
              Round {round.number}/{snapshot.rounds} ·{" "}
              {snapshot.game === "emoji"
                ? GAME_LABELS[snapshot.lang].emoji
                : MODE_LABELS[snapshot.lang][round.mode]}
            </p>
            {snapshot.isPerformer ? (
              <>
                <h1>Choose prompt</h1>
                <div className="word-options">
                  {round.options?.map((word) => (
                    <button key={word} onClick={() => send("choose", { word })}>
                      {word}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h1>{displayName(performer)} is choosing</h1>
                <div className="loader">•••</div>
              </>
            )}
          </section>
        </main>
      )}

      {phase === "playing" && snapshot && round && game === "classic" && (
        <main className="play classic-play">
          <section className="stage">
            <div className="round-bar">
              <span>
                Round {round.number}/{snapshot.rounds} · {MODE_LABELS[snapshot.lang][round.mode]}
              </span>
              <div className="round-bar-right">
                <span className="round-guessed">
                  {players.filter((player) => player.id !== round.performerId && player.guessed).length}/
                  {Math.max(0, players.length - 1)} guessed
                </span>
                <strong>{formatTime(timeLeft)}</strong>
              </div>
            </div>
            <div className="prompt-bar">
              {snapshot.isPerformer ? (
                <strong>{round.word}</strong>
              ) : (
                <>
                  <form
                    className="prompt-guess"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitGuess();
                    }}
                  >
                  {snapshot.wordLength > 0 && (
                    <div className="guess-hints">
                      <span className="prompt-letters">
                        {snapshot.wordLength} {snapshot.lang === "zh" ? "字" : "letters"}
                      </span>
                      {round.category && (
                        <span className="prompt-cat">
                          {snapshot.lang === "zh" ? `类别：${round.category}` : `Category: ${round.category}`}
                        </span>
                      )}
                    </div>
                  )}
                  <input
                    className="prompt-guess-input"
                    value={guess}
                    disabled={!canGuess}
                    onChange={(event) => setGuess(event.target.value)}
                    placeholder={me?.guessed ? "You guessed it!" : "Type your guess"}
                  />
                  <button type="submit" className="primary small" disabled={!canGuess}>
                    Send
                  </button>
                  </form>
                </>
              )}
            </div>

            <div className={`mobile-guess-dock${snapshot.isPerformer ? " performer" : ""}`}>
              <button className="mobile-guesses-button" onClick={() => setMobileGuessesOpen(true)}>
                View all ↑
              </button>
              {me?.guessed && (
                <div className="mobile-correct-banner" role="status">
                  {snapshot.lang === "zh" ? "🎉 猜对了！" : "🎉 You got it!"}
                </div>
              )}
              {!!snapshot.messages.length && (
                <div className="mobile-guess-preview" aria-live="polite">
                  {snapshot.messages.slice(-4).map((message) => (
                    <div key={message.id} className={messageClass(message)}>
                      {!message.system && <strong>{message.playerName}: </strong>}
                      {message.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {round.mode === "pictionary" ? (
              <DrawingBoard
                disabled={!snapshot.isPerformer}
                strokes={snapshot.strokes}
                onChange={(strokes) => send("draw", { strokes })}
              />
            ) : (
              <div className="charades-stage">
                {snapshot.isPerformer ? (
                  <div className="charades-card">
                    <span className="charades-hint">{snapshot.lang === "zh" ? "表演这个" : "Act this out"}</span>
                    <span className="charades-word">{round.word}</span>
                  </div>
                ) : (
                  <div className="charades-card">
                    <span className="charades-emoji">🎭</span>
                    <span className="charades-word">
                      {snapshot.lang === "zh"
                        ? `猜猜 ${displayName(performer)} 在演什么?`
                        : `Guess what ${displayName(performer)} is acting!`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {mobileGuessesOpen && (
              <div className="mobile-guesses-backdrop" onClick={() => setMobileGuessesOpen(false)}>
                <section
                  className="mobile-guesses-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Guesses"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mobile-guesses-head">
                    <span className="mobile-guesses-title">
                      <strong>Guesses</strong>
                      <span>{snapshot.messages.length}</span>
                    </span>
                    <button className="mobile-guesses-close" onClick={() => setMobileGuessesOpen(false)}>
                      Close ↓
                    </button>
                  </div>
                  <div className="mobile-guesses-list" ref={mobileChatRef}>
                    {snapshot.messages.length ? (
                      snapshot.messages.map((message) => (
                        <div key={message.id} className={messageClass(message)}>
                          {!message.system && <strong>{message.playerName}: </strong>}
                          {message.text}
                        </div>
                      ))
                    ) : (
                      <p className="muted">No guesses yet</p>
                    )}
                  </div>
                </section>
              </div>
            )}
          </section>

          <aside className="chat">
            <div className="chat-head">
              <h2>Guesses</h2>
              <span>{snapshot.messages.length}</span>
            </div>
            <div className="chat-list" ref={chatRef}>
              {snapshot.messages.map((message) => (
                <div key={message.id} className={messageClass(message)}>
                  {!message.system && <strong>{message.playerName}: </strong>}
                  {message.text}
                </div>
              ))}
            </div>
          </aside>
        </main>
      )}

      {phase === "playing" && snapshot && round && game === "emoji" && (
        <main className="play classic-play emoji-play">
          <section className="stage">
            <div className="round-bar">
              <span>
                Round {round.number}/{snapshot.rounds} · {GAME_LABELS[snapshot.lang].emoji}
              </span>
              <div className="round-bar-right">
                <span className="round-guessed">
                  {players.filter((p) => p.id !== round.performerId && p.guessed).length}/
                  {Math.max(0, players.length - 1)} guessed
                </span>
                <strong>{formatTime(timeLeft)}</strong>
              </div>
            </div>

            {snapshot.needsClue ? (
              <div className="prompt-bar" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {snapshot.lang === "zh" ? "你的成语：" : "Your movie:"} {round.word}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {snapshot.lang === "zh"
                      ? "只能用表情符号描述，不能打字。比如：画蛇添足 → 🐍➕🦶"
                      : "Describe with emojis only, no text. e.g. Titanic → 🚢🧊💔"}
                  </div>
                  {EMOJI_SUGGESTIONS[round.word] && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "6px 8px",
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                        fontSize: 13,
                      }}
                    >
                      <span className="muted" style={{ fontSize: 12 }}>
                        {snapshot.lang === "zh" ? "💡 可能用到的表情：" : "💡 Emojis you may need:"}
                      </span>
                      {(() => {
                        try {
                          const seg = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" });
                          return Array.from(seg.segment(EMOJI_SUGGESTIONS[round.word]), (x: any) => x.segment) as string[];
                        } catch {
                          return Array.from(EMOJI_SUGGESTIONS[round.word]);
                        }
                      })().map((g: string, i: number) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setEmojiInput((prev) => prev + g)}
                          style={{
                            fontSize: 18,
                            padding: "2px 6px",
                            background: "white",
                            border: "1px solid #fde68a",
                            borderRadius: 6,
                            cursor: "pointer",
                            lineHeight: 1.2,
                          }}
                        >
                          {g}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="secondary small"
                        onClick={() => setEmojiInput(EMOJI_SUGGESTIONS[round.word])}
                        style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 12 }}
                      >
                        {snapshot.lang === "zh" ? "全用" : "Use all"}
                      </button>
                    </div>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!isEmojiOnly(emojiInput)) return;
                    send("emSubmit", { clue: emojiInput.trim() });
                    setEmojiInput("");
                  }}
                  style={{ display: "flex", gap: 8 }}
                >
                  <input
                    className="prompt-guess-input"
                    value={emojiInput}
                    onChange={(e) => setEmojiInput(e.target.value)}
                    placeholder=""
                    style={{ flex: 1 }}
                  />
                  <button
                    type="submit"
                    className="primary small"
                    disabled={!isEmojiOnly(emojiInput)}
                  >
                    {snapshot.lang === "zh" ? "发布" : "Post"}
                  </button>
                </form>
                {emojiInput && !isEmojiOnly(emojiInput) && (
                  <div style={{ color: "#e0576f", fontSize: 13 }}>
                    {snapshot.lang === "zh" ? "只能输入表情符号" : "Emojis only"}
                  </div>
                )}

                <div className="muted" style={{ fontSize: 12 }}>
                  {snapshot.lang === "zh"
                    ? "点表情快速添加 · Mac: Ctrl+Cmd+空格 / Win: Win+."
                    : "Tap to add · Mac: Ctrl+Cmd+Space / Win: Win+."}
                </div>
              </div>
            ) : (
              <>
                <div
                  className="prompt-bar"
                  style={{ justifyContent: "center", padding: "28px 12px", textAlign: "center" }}
                >
                  {snapshot.emojiClue ? (
                    <span style={{ fontSize: 88, lineHeight: 1.2, border: "none", background: "transparent", padding: 0, textTransform: "none" }}>{formatEmojiDisplay(snapshot.emojiClue)}</span>
                  ) : (
                    <span className="muted" style={{ fontSize: 16 }}>
                      {snapshot.lang === "zh" ? "等待出题人发布表情…" : "Waiting for emoji clue…"}
                    </span>
                  )}
                </div>
                {!snapshot.isPerformer && snapshot.emojiClue && (
                  <div className="prompt-bar">
                    <form
                      className="prompt-guess"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const v = guess.trim();
                        if (!v) return;
                        send("guess", { text: v });
                        setGuess("");
                      }}
                    >
                      {snapshot.wordLength > 0 && (
                        <div className="guess-hints">
                          <span className="prompt-letters">
                            {snapshot.wordLength} {snapshot.lang === "zh" ? "字" : "letters"}
                          </span>
                        </div>
                      )}
                      <input
                        className="prompt-guess-input"
                        value={guess}
                        disabled={!snapshot.youGuess || me?.guessed}
                        onChange={(e) => setGuess(e.target.value)}
                        placeholder={
                          me?.guessed
                            ? snapshot.lang === "zh"
                              ? "你猜对了！"
                              : "You got it!"
                            : snapshot.lang === "zh"
                              ? "输入成语猜"
                              : "Guess the movie"
                        }
                      />
                      <button
                        type="submit"
                        className="primary small"
                        disabled={!snapshot.youGuess || me?.guessed || !guess.trim()}
                      >
                        Send
                      </button>
                    </form>
                  </div>
                )}
                {snapshot.isPerformer && snapshot.emojiClue && (
                  <div className="prompt-bar">
                    <strong>{round.word}</strong>
                    <span className="muted" style={{ marginLeft: 12, fontSize: 13 }}>
                      {snapshot.lang === "zh" ? "已发布，等待大家猜" : "Posted, waiting for guesses"}
                    </span>
                  </div>
                )}
              </>
            )}

            <div className={`mobile-guess-dock${snapshot.isPerformer ? " performer" : ""}`}>
              <button className="mobile-guesses-button" onClick={() => setMobileGuessesOpen(true)}>
                View all ↑
              </button>
              {!!snapshot.messages.length && (
                <div className="mobile-guess-preview" aria-live="polite">
                  {snapshot.messages.slice(-4).map((m) => (
                    <div key={m.id} className={messageClass(m)}>
                      {!m.system && <strong>{m.playerName}: </strong>}
                      {m.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {mobileGuessesOpen && (
              <div className="mobile-guesses-backdrop" onClick={() => setMobileGuessesOpen(false)}>
                <section
                  className="mobile-guesses-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Guesses"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mobile-guesses-head">
                    <span className="mobile-guesses-title">
                      <strong>Guesses</strong>
                      <span>{snapshot.messages.length}</span>
                    </span>
                    <button className="mobile-guesses-close" onClick={() => setMobileGuessesOpen(false)}>
                      Close ↓
                    </button>
                  </div>
                  <div className="mobile-guesses-list" ref={mobileChatRef}>
                    {snapshot.messages.length ? (
                      snapshot.messages.map((message) => (
                        <div key={message.id} className={messageClass(message)}>
                          {!message.system && <strong>{message.playerName}: </strong>}
                          {message.text}
                        </div>
                      ))
                    ) : (
                      <p className="muted">No guesses yet</p>
                    )}
                  </div>
                </section>
              </div>
            )}
          </section>
          <aside className="chat">
            <div className="chat-head">
              <h2>Guesses</h2>
              <span>{snapshot.messages.length}</span>
            </div>
            <div className="chat-list" ref={chatRef}>
              {snapshot.messages.map((m) => (
                <div key={m.id} className={messageClass(m)}>
                  {!m.system && <strong>{m.playerName}: </strong>}
                  {m.text}
                </div>
              ))}
            </div>
          </aside>
        </main>
      )}

      {phase === "playing" && snapshot && round && game === "passthepen" && (
        <main className="play relay-play">
          <section className="stage">
            <div className="round-bar">
              <span>
                Round {round.number}/{snapshot.rounds} · {GAME_LABELS[snapshot.lang].passthepen}
              </span>
              <div className="round-bar-right">
                <strong className={turnLeft <= 3 ? "turn-timer low" : "turn-timer"}>{turnLeft}s</strong>
              </div>
            </div>

            <RelayStrip relay={snapshot.relay} turnIndex={round.turnIndex ?? 0} turnLeft={turnLeft} myId={id} />

            <div className="prompt-bar">
              {snapshot.seeWord ? (
                <strong>{round.word}</strong>
              ) : (
                <form
                  className="prompt-guess"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitGuess();
                  }}
                >
                  {snapshot.wordLength > 0 && (
                    <div className="guess-hints">
                      <span className="prompt-letters">
                        {snapshot.wordLength} {snapshot.lang === "zh" ? "字" : "letters"}
                      </span>
                    </div>
                  )}
                  <input
                    className="prompt-guess-input"
                    value={guess}
                    disabled={!canGuess}
                    onChange={(event) => setGuess(event.target.value)}
                    placeholder={me?.guessed ? "You guessed it!" : "Type your guess"}
                  />
                  <button type="submit" className="primary small" disabled={!canGuess}>
                    Send
                  </button>
                </form>
              )}
            </div>

            <p className="relay-status">
              {snapshot.youDraw
                ? "✏️ Your turn — draw, then pass!"
                : snapshot.youGuess
                  ? round.guessWindow
                    ? "⏰ Pens down — last chance, type your guess!"
                    : "👀 Watch the drawing and type your guess"
                  : round.guessWindow
                    ? `⏰ Pens down — ${displayName(performer)} is guessing!`
                : `Waiting for ${displayName(players.find((p) => p.id === snapshot.relay?.currentId))} to draw`}
            </p>

            <div className={`mobile-guess-dock${snapshot.youDraw ? " performer" : ""}`}>
              <button className="mobile-guesses-button" onClick={() => setMobileGuessesOpen(true)}>
                View all ↑
              </button>
              {me?.guessed && (
                <div className="mobile-correct-banner" role="status">
                  {snapshot.lang === "zh" ? "🎉 猜对了！" : "🎉 You got it!"}
                </div>
              )}
              {!!snapshot.messages.length && (
                <div className="mobile-guess-preview" aria-live="polite">
                  {snapshot.messages.slice(-4).map((message) => (
                    <div key={message.id} className={messageClass(message)}>
                      {!message.system && <strong>{message.playerName}: </strong>}
                      {message.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DrawingBoard
              disabled={!snapshot.youDraw}
              relay
              minStrokes={round.turnStrokeStart ?? 0}
              onPass={() => send("pass")}
              strokes={snapshot.strokes}
              onChange={(strokes) => send("draw", { strokes })}
            />

            {mobileGuessesOpen && (
              <div className="mobile-guesses-backdrop" onClick={() => setMobileGuessesOpen(false)}>
                <section
                  className="mobile-guesses-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Guesses"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mobile-guesses-head">
                    <span className="mobile-guesses-title">
                      <strong>Guesses</strong>
                      <span>{snapshot.messages.length}</span>
                    </span>
                    <button className="mobile-guesses-close" onClick={() => setMobileGuessesOpen(false)}>
                      Close ↓
                    </button>
                  </div>
                  <div className="mobile-guesses-list" ref={mobileChatRef}>
                    {snapshot.messages.length ? (
                      snapshot.messages.map((message) => (
                        <div key={message.id} className={messageClass(message)}>
                          {!message.system && <strong>{message.playerName}: </strong>}
                          {message.text}
                        </div>
                      ))
                    ) : (
                      <p className="muted">No guesses yet</p>
                    )}
                  </div>
                </section>
              </div>
            )}
          </section>

          <aside className="chat">
            <div className="chat-head">
              <h2>Guesses</h2>
              <span>{snapshot.messages.length}</span>
            </div>
            <div className="chat-list" ref={chatRef}>
              {snapshot.messages.map((message) => (
                <div key={message.id} className={messageClass(message)}>
                  {!message.system && <strong>{message.playerName}: </strong>}
                  {message.text}
                </div>
              ))}
            </div>
          </aside>
        </main>
      )}

      {phase === "roundEnd" && snapshot && round && (
        <main className="center">
          <section className="result-panel">
            <p className="eyebrow">Round {round.number} complete</p>
            {game === "emoji" && snapshot.emojiClue && (
              <div style={{ fontSize: 64, lineHeight: 1.2, margin: "12px 0" }}>
                {formatEmojiDisplay(snapshot.emojiClue)}
              </div>
            )}
            <h1>{round.word}</h1>
            {game === "passthepen" ? (
              <div className="coop-result">
                <p className="coop-verdict">
                  {round.correctIds.length > 0
                    ? snapshot.lang === "zh"
                      ? "✓ 猜对了!"
                      : "✓ Guessed it!"
                    : snapshot.lang === "zh"
                      ? "✗ 没猜出来"
                      : "✗ Not this time"}
                </p>
                <p className="muted">
                  {snapshot.lang === "zh"
                    ? `已猜中 ${snapshot.solved}/${snapshot.rounds} 轮`
                    : `Solved ${snapshot.solved}/${snapshot.rounds} so far`}
                </p>
              </div>
            ) : (
              <ScoreRows players={players} myId={id} />
            )}
            {host ? (
              <button className="primary" onClick={() => send("next")}>
                {round.number >= snapshot.rounds ? "Results" : "Next round"}
              </button>
            ) : (
              <p className="muted">Waiting for host</p>
            )}
          </section>
        </main>
      )}

      {phase === "gameEnd" && snapshot && game === "passthepen" && (
        <main className="center">
          <section className="result-panel wide">
            <p className="eyebrow">{snapshot.lang === "zh" ? "团队战绩" : "Team result"}</p>
            <h1>
              {snapshot.solved} / {snapshot.rounds} 🎉
            </h1>
            <p className="muted">{snapshot.lang === "zh" ? "轮猜中" : "rounds guessed"}</p>
            {host && (
              <button className="primary" onClick={() => send("reset")}>
                Play again
              </button>
            )}
          </section>
        </main>
      )}

      {phase === "gameEnd" && snapshot && game === "undercover" && (
        <main className="center">
          <section className="result-panel wide">
            <p className="eyebrow">{snapshot.lang === "zh" ? "游戏结束" : "Game over"}</p>
            <h1>
              {snapshot.undercover?.result === "civ"
                ? snapshot.lang === "zh"
                  ? "平民获胜 🎉"
                  : "Civilians win 🎉"
                : snapshot.lang === "zh"
                  ? "卧底获胜 🕵️"
                  : "Undercover wins 🕵️"}
            </h1>
            <div className="uc-reveal-list">
              {snapshot.undercover?.reveal?.map((r, i) => (
                <div key={i} className={`uc-reveal-row ${r.role === "spy" ? "spy" : ""}`}>
                  <strong>{r.name}</strong>
                  <span>
                    {r.role === "spy"
                      ? snapshot.lang === "zh"
                        ? "卧底"
                        : "Undercover"
                      : snapshot.lang === "zh"
                        ? "平民"
                        : "Civilian"}
                  </span>
                  <em>{r.word}</em>
                </div>
              ))}
            </div>
            {host && (
              <button className="primary" onClick={() => send("reset")}>
                {snapshot.lang === "zh" ? "再来一局" : "Play again"}
              </button>
            )}
          </section>
        </main>
      )}

      {phase === "gameEnd" && snapshot && game === "fakeartist" && (
        <main className="center">
          <section className="result-panel wide">
            <p className="eyebrow">{snapshot.lang === "zh" ? "游戏结束" : "Game over"}</p>
            <h1>
              {snapshot.fakeartist?.result === "civ"
                ? snapshot.lang === "zh"
                  ? "真画家获胜 🎉"
                  : "Painters win 🎉"
                : snapshot.lang === "zh"
                  ? "假画家获胜 🕵️"
                  : "Fake artist wins 🕵️"}
            </h1>
            <div className="uc-reveal-list">
              {snapshot.fakeartist?.reveal?.map((r, i) => (
                <div key={i} className={`uc-reveal-row ${r.role === "spy" ? "spy" : ""}`}>
                  <strong>{r.name}</strong>
                  <span>
                    {r.role === "spy"
                      ? snapshot.lang === "zh"
                        ? "假画家"
                        : "Fake"
                      : snapshot.lang === "zh"
                        ? "真画家"
                        : "Painter"}
                  </span>
                  <em>{r.word}</em>
                </div>
              ))}
            </div>
            {host && (
              <button className="primary" onClick={() => send("reset")}>
                {snapshot.lang === "zh" ? "再来一局" : "Play again"}
              </button>
            )}
          </section>
        </main>
      )}

      {phase === "gameEnd" && snapshot && game === "wavelength" && (
        <main className="center">
          <section className="result-panel wide">
            <p className="eyebrow">{snapshot.lang === "zh" ? "心有灵序" : "In Sync"}</p>
            <h1>{snapshot.lang === "zh" ? "本局已结束" : "Game ended"}</h1>
            <p className="muted">
              {snapshot.lang === "zh" ? "回到大厅，等大家重新加入吧。" : "Head back to the lobby and gather everyone again."}
            </p>
            {host && (
              <button className="primary" onClick={() => send("reset")}>
                {snapshot.lang === "zh" ? "回到大厅" : "Back to lobby"}
              </button>
            )}
          </section>
        </main>
      )}

      {phase === "gameEnd" && snapshot && game !== "passthepen" && game !== "undercover" && game !== "fakeartist" && game !== "wavelength" && (
        <main className="center">
          <section className="result-panel wide">
            <p className="eyebrow">Winner</p>
            <h1>{sorted.filter((player) => player.score === sorted[0]?.score).map((player) => player.name).join(" & ")}</h1>
            <div className="podium">
              {sorted.slice(0, 3).map((player, index) => (
                <div key={player.id} className={`podium-place place-${index + 1}`}>
                  <span style={{ background: player.color }}>{initial(player.name)}</span>
                  <strong>{player.name}</strong>
                  <em>{player.score}</em>
                </div>
              ))}
            </div>
            {sorted.length > 3 && (
              <div className="final-standings">
                {sorted.slice(3).map((player, index) => (
                  <div key={player.id} className={player.id === id ? "standing self" : "standing"}>
                    <span>#{index + 4}</span>
                    <strong>{player.name}</strong>
                    <em>{player.score}</em>
                  </div>
                ))}
              </div>
            )}
            {host && (
              <button className="primary" onClick={() => send("reset")}>
                Play again
              </button>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="setting-group">
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}

function RelayStrip({
  relay,
  turnIndex,
  turnLeft,
  myId,
}: {
  relay: RelaySnapshot | null;
  turnIndex: number;
  turnLeft: number;
  myId: string;
}) {
  if (!relay) return null;
  return (
    <div className="relay-strip">
      {relay.order.map((slot, index) => {
        const isCurrent = slot.id === relay.currentId;
        const isNext = slot.id === relay.nextId;
        const done = index < turnIndex;
        const classes = ["relay-slot"];
        if (isCurrent) classes.push("current");
        if (isNext) classes.push("next");
        if (done) classes.push("done");
        return (
          <div key={slot.id} className={classes.join(" ")}>
            <span className="relay-index">{index + 1}</span>
            <span className="relay-avatar" style={{ background: slot.color }} />
            <span className="relay-name">
              {slot.name}
              {slot.id === myId ? " (you)" : ""}
            </span>
            {isCurrent && <span className="relay-count">{turnLeft}s</span>}
            {isNext && <span className="relay-tag">next</span>}
            {done && <span className="relay-tag done-tag">✓</span>}
          </div>
        );
      })}
    </div>
  );
}

function PlayerList({
  players,
  myId,
  host,
  compact,
  onKick,
}: {
  players: Player[];
  myId: string;
  host?: boolean;
  compact?: boolean;
  onKick?: (playerId: string) => void;
}) {
  return (
    <div className={compact ? "players compact" : "players"}>
      {players.map((player) => (
        <div key={player.id} className={`player ${player.id === myId ? "self" : ""}`}>
          <span className="avatar" style={{ background: player.color }}>{initial(player.name)}</span>
          <div>
            <strong>
              {player.name}
              {player.host ? " · host" : ""}
            </strong>
            <small>
              {player.guessed ? `rank ${player.guessRank}` : player.connected ? "connected" : "reconnecting"} · {player.score}
            </small>
          </div>
          {host && player.id !== myId && onKick && (
            <button className="secondary small" onClick={() => onKick(player.id)}>
              Remove
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ScoreRows({ players, myId }: { players: Player[]; myId: string }) {
  return (
    <div className="scores">
      {players.map((player) => (
        <div key={player.id} className={player.id === myId ? "score self" : "score"}>
          <span>{player.name}</span>
          <strong>+{player.roundPoints}</strong>
        </div>
      ))}
    </div>
  );
}

function DrawingBoard({
  disabled,
  strokes,
  onChange,
  relay,
  minStrokes = 0,
  onPass,
}: {
  disabled: boolean;
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
  relay?: boolean;
  minStrokes?: number;
  onPass?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const drawingRef = useRef(false);
  const [color, setColor] = useState("#15191f");
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const activeColor = tool === "eraser" ? "#ffffff" : color;
  const activeWidth = tool === "eraser" ? 18 : 6;

  useEffect(() => {
    if (disabled) setTool("pen");
  }, [disabled]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderStroke = (stroke: Stroke) => {
      if (!stroke.points.length) return;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const [first, ...rest] = stroke.points;
      ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
      for (const point of rest) ctx.lineTo(point.x * canvas.width, point.y * canvas.height);
      if (rest.length === 0) {
        ctx.arc(first.x * canvas.width, first.y * canvas.height, stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.stroke();
      }
    };

    strokes.forEach(renderStroke);
    if (pointsRef.current.length) renderStroke({ color: activeColor, width: activeWidth, points: pointsRef.current });
  }, [activeColor, activeWidth, strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      const cssWidth = Math.max(320, parent?.clientWidth ?? 800);
      canvas.width = cssWidth;
      canvas.height = window.innerWidth <= 680 ? 300 : 430;
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [draw]);

  useEffect(() => draw(), [draw]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || (tool === "eraser" && strokes.length === 0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    pointsRef.current = [point(event)];
    draw();
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !drawingRef.current) return;
    pointsRef.current = [...pointsRef.current, point(event)];
    draw();
  }

  function end() {
    if (disabled || !drawingRef.current) return;
    drawingRef.current = false;
    const points = pointsRef.current;
    pointsRef.current = [];
    if (points.length) onChange([...strokes, { color: activeColor, width: activeWidth, points }]);
  }

  const canUndo = !disabled && strokes.length > minStrokes;

  return (
    <div className={disabled ? "board is-disabled" : "board"}>
      <div className="tools">
        <div>
          {["#15191f", "#e0576f", "#4f7cff", "#18a67d", "#f4c542"].map((item) => (
            <button
              key={item}
              className={tool === "pen" && item === color ? "tool-color active" : "tool-color"}
              style={{ background: item }}
              disabled={disabled}
              onClick={() => {
                setColor(item);
                setTool("pen");
              }}
            />
          ))}
          <button
            className={tool === "eraser" ? "tool-color eraser-tool active" : "tool-color eraser-tool"}
            disabled={disabled || !strokes.length}
            onClick={() => setTool("eraser")}
            aria-label="Eraser"
            title="Eraser"
          >
            🧽
          </button>
        </div>
        <div>
          <button className="secondary small" disabled={!canUndo} onClick={() => onChange(strokes.slice(0, -1))}>
            Undo
          </button>
          {!relay && (
            <button
              className="secondary small"
              disabled={disabled || !strokes.length}
              onClick={() => {
                onChange([]);
                setTool("pen");
              }}
            >
              Clear
            </button>
          )}
          {relay && (
            <button className="primary small pass-btn" disabled={disabled} onClick={() => onPass?.()}>
              Done, pass →
            </button>
          )}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
    </div>
  );
}
