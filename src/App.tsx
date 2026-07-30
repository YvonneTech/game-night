import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import YarnPalsGame, { YarnSlot } from "./YarnPalsGame";

type Game = "classic" | "passthepen" | "yarnpals";
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
  createdAt: number;
  updatedAt: number;
};

type ServerMessage =
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

const GAME_LABELS: Record<"en" | "zh", Record<Game, string>> = {
  en: { classic: "Draw & Act", passthepen: "Pass the Pen", yarnpals: "Kitty Cup" },
  zh: { classic: "画画 & 表演", passthepen: "接力画", yarnpals: "猫咪杯" },
};

const MODE_LABELS: Record<"en" | "zh", Record<GameMode, string>> = {
  en: { pictionary: "pictionary", charades: "charades", mixed: "mixed" },
  zh: { pictionary: "你画我猜", charades: "你比我猜", mixed: "混合" },
};

const GAME_INFO: Record<"en" | "zh", Record<Game, { blurb: string; scoring: string }>> = {
  en: {
    classic: {
      blurb: "Take turns: one player draws or acts a secret word while everyone else races to guess it in chat.",
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
  },
  zh: {
    classic: {
      blurb: "轮流出题:一人画画或表演一个秘密词,其他人在聊天里抢答。",
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
  },
};

function playerId(): string {
  const existing = sessionStorage.getItem("fresh_game_player_id");
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem("fresh_game_player_id", next);
  return next;
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

function parseMessage(value: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(value) as ServerMessage;
    return parsed.type === "state" || parsed.type === "error" || parsed.type === "kicked" ? parsed : null;
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
  const [id] = useState(playerId);
  const [name, setName] = useState(() => localStorage.getItem("fresh_game_name") ?? "");
  const [color, setColor] = useState(() => localStorage.getItem("fresh_game_color") ?? COLORS[0]);
  const [lang, setLang] = useState<"en" | "zh">(() => (localStorage.getItem("fresh_game_lang") === "zh" ? "zh" : "en"));
  const [joinCode, setJoinCode] = useState(() => {
    try {
      return (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase().slice(0, 8);
    } catch {
      return "";
    }
  });
  const [room, setRoom] = useState("");
  const [phase, setPhase] = useState<Phase>("landing");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "closed">("idle");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [guess, setGuess] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [turnLeft, setTurnLeft] = useState(0);
  const [teamCountdown, setTeamCountdown] = useState(3);
  const wsRef = useRef<WebSocket | null>(null);
  const closingRef = useRef(false);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const noticeIdRef = useRef(0);
  const yarnNetRef = useRef<((msg: { type: "yarnWorld" | "yarnInput"; payload: any }) => void) | null>(null);

  const players = snapshot?.players ?? [];
  const me = players.find((player) => player.id === id);
  const host = !!me?.host;
  const hostOnlySettings = "Only the host can change the game settings.";
  const game = snapshot?.game ?? "classic";
  const round = snapshot?.round ?? null;
  const performer = players.find((player) => player.id === round?.performerId);
  const canGuess = phase === "playing" && !!snapshot?.youGuess && !me?.guessed;
  const minPlayers = game === "passthepen" ? 3 : 2;
  const hasJoinCode = joinCode.trim().length > 0;
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

  const connect = useCallback(
    (code: string, create: boolean) => {
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

      localStorage.setItem("fresh_game_name", cleanName);
      localStorage.setItem("fresh_game_color", color);
      localStorage.setItem("fresh_game_lang", lang);
      closingRef.current = true;
      wsRef.current?.close();
      closingRef.current = false;

      const socket = new WebSocket(`${socketBase()}/room/${cleanCode}/ws`);
      wsRef.current = socket;
      setStatus("connecting");
      clearNotice();
      setRoom(cleanCode);
      setPhase("lobby");
      setSnapshot(null);

      socket.addEventListener("open", () => {
        setStatus("connected");
        socket.send(
          JSON.stringify({
            type: "join",
            payload: { create, lang, player: { id, name: cleanName, color } },
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
        if (message.type === "error") {
          showNotice(message.payload.message);
          return;
        }
        if (message.type === "kicked") {
          closingRef.current = true;
          socket.close();
          if (wsRef.current === socket) wsRef.current = null;
          showNotice(message.payload.message);
          setSnapshot(null);
          setRoom("");
          setPhase("landing");
          setStatus("idle");
          return;
        }
        setSnapshot(message.payload);
        setPhase(message.payload.phase);
        setTimeLeft(message.payload.timeLeft);
      });

      socket.addEventListener("close", () => {
        if (wsRef.current !== socket) return;
        wsRef.current = null;
        setStatus(closingRef.current ? "idle" : "closed");
      });

      socket.addEventListener("error", () => {
        showNotice("Could not connect to the room server");
      });
    },
    [clearNotice, color, id, lang, name, showNotice],
  );

  useEffect(() => {
    return () => {
      closingRef.current = true;
      wsRef.current?.close();
    };
  }, []);

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
  }, [snapshot?.messages.length]);

  useEffect(() => {
    if (!notice?.autoDismissMs) return;
    const id = notice.id;
    const timer = window.setTimeout(() => {
      setNotice((current) => (current?.id === id ? null : current));
    }, notice.autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function createRoom() {
    connect(roomCode(), true);
  }

  function joinRoom() {
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
    if (room) connect(room, false);
  }

  function leaveRoom() {
    closingRef.current = true;
    send("leave");
    wsRef.current?.close();
    wsRef.current = null;
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
          <img className="brand-mark" src="/favicon.svg" alt="Game Night" width={40} height={40} />
          <div>
            <strong>Game Night</strong>
            <span>Party games for 2-6 friends</span>
          </div>
        </div>
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
            <button className="secondary small" onClick={leaveRoom}>
              Leave
            </button>
          </div>
        )}
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
            <p className="entry-sub">Pick a name and color, then start a room or join a friend&apos;s with their code.</p>

            <label>
              Your name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createRoom();
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

            <div className="field">
              <span className="field-label">Game language</span>
              <div className="chips">
                <button className={lang === "en" ? "chip active" : "chip"} onClick={() => setLang("en")}>
                  English
                </button>
                <button className={lang === "zh" ? "chip active" : "chip"} onClick={() => setLang("zh")}>
                  中文
                </button>
              </div>
            </div>

            <button
              className={`block create-btn ${hasJoinCode ? "secondary is-dimmed" : "primary"}`}
              onClick={createRoom}
            >
              Create a room
            </button>

            <div className="or-divider">
              <span>or</span>
            </div>

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
                <p className="muted">Rejoin room {room} with the same name to pick up where you left off.</p>
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
              {(["classic", "passthepen", "yarnpals"] as const).map((option) => (
                <button
                  key={option}
                  className={snapshot.game === option ? "chip active" : "chip"}
                  disabled={!host}
                  title={!host ? hostOnlySettings : undefined}
                  onClick={() => changeSettings({ game: option })}
                >
                  {GAME_LABELS[snapshot.lang][option]}
                </button>
              ))}
            </SettingGroup>
            <div className="game-info">
              <p>{GAME_INFO[snapshot.lang][snapshot.game].blurb}</p>
              <p className="game-info-scoring">
                <span>{snapshot.lang === "zh" ? "计分：" : "Scoring:"}</span>
                {GAME_INFO[snapshot.lang][snapshot.game].scoring}
              </p>
            </div>
            {snapshot.game === "classic" && (
              <SettingGroup title="Mode">
                {(["pictionary", "charades", "mixed"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={snapshot.mode === mode ? "chip active" : "chip"}
                    disabled={!host}
                    title={!host ? hostOnlySettings : undefined}
                    onClick={() => changeSettings({ mode })}
                  >
                    {MODE_LABELS[snapshot.lang][mode]}
                  </button>
                ))}
              </SettingGroup>
            )}
            {game !== "yarnpals" && (
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
            <button className="primary block create-btn" disabled={!host || players.length < minPlayers} onClick={() => send("start")}>
              Start
            </button>
            {host && players.length < minPlayers && (
              <p className="settings-note start-note">Need at least {minPlayers} players to start {GAME_LABELS[snapshot.lang][game]}.</p>
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
            onQuit={() => send("reset")}
          />
        </main>
      )}

      {phase === "choosing" && snapshot && round && (
        <main className="center">
          <section className="result-panel">
            <p className="eyebrow">
              Round {round.number}/{snapshot.rounds} · {MODE_LABELS[snapshot.lang][round.mode]}
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
        <main className="play">
          <aside className="side">
            <h2>Players</h2>
            <PlayerList players={players} myId={id} compact />
          </aside>

          <section className="stage">
            <div className="round-bar">
              <span>
                Round {round.number}/{snapshot.rounds} · {MODE_LABELS[snapshot.lang][round.mode]}
              </span>
              <div className="round-bar-right">
                <strong>{formatTime(timeLeft)}</strong>
                {host && (
                  <button
                    className="exit-x"
                    onClick={() => send("reset")}
                    title="End game (back to lobby)"
                    aria-label="End game"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div className="prompt-bar">
              {snapshot.isPerformer ? (
                <strong>{round.word}</strong>
              ) : (
                <form
                  className="prompt-guess"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitGuess();
                  }}
                >
                  {snapshot.wordLength > 0 ? (
                    <>
                      <span className="prompt-letters">
                        {snapshot.wordLength} {snapshot.lang === "zh" ? "字" : "letters"}
                      </span>
                      {round.category && (
                        <span className="prompt-cat">
                          {snapshot.lang === "zh" ? `类别：${round.category}` : `Category: ${round.category}`}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="prompt-hintwait">
                      {round.mode === "pictionary"
                        ? snapshot.lang === "zh"
                          ? "👀 看画面猜!"
                          : "👀 Guess from the drawing!"
                        : snapshot.lang === "zh"
                          ? "👀 看 TA 表演,猜猜看!"
                          : "👀 Watch them act and guess!"}
                    </span>
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

      {phase === "playing" && snapshot && round && game === "passthepen" && (
        <main className="play">
          <aside className="side">
            <h2>Players</h2>
            <PlayerList players={players} myId={id} compact />
          </aside>

          <section className="stage">
            <div className="round-bar">
              <span>
                Round {round.number}/{snapshot.rounds} · {GAME_LABELS[snapshot.lang].passthepen}
              </span>
              <div className="round-bar-right">
                <strong className={turnLeft <= 3 ? "turn-timer low" : "turn-timer"}>{turnLeft}s</strong>
                {host && (
                  <button
                    className="exit-x"
                    onClick={() => send("reset")}
                    title="End game (back to lobby)"
                    aria-label="End game"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <RelayStrip relay={snapshot.relay} turnIndex={round.turnIndex ?? 0} turnLeft={turnLeft} myId={id} />

            <div className="prompt-bar">
              {snapshot.seeWord ? (
                <>
                  <span className="prompt-label">Draw:</span>
                  <strong>{round.word}</strong>
                </>
              ) : (
                <form
                  className="prompt-guess"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitGuess();
                  }}
                >
                  <span className="prompt-label">Guess:</span>
                  <input
                    className="prompt-guess-input"
                    value={guess}
                    disabled={!canGuess}
                    onChange={(event) => setGuess(event.target.value)}
                    placeholder={`Type your guess · ${snapshot.wordLength} ${snapshot.lang === "zh" ? "字" : "letters"}`}
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

            <DrawingBoard
              disabled={!snapshot.youDraw}
              relay
              minStrokes={round.turnStrokeStart ?? 0}
              onPass={() => send("pass")}
              strokes={snapshot.strokes}
              onChange={(strokes) => send("draw", { strokes })}
            />
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

      {phase === "gameEnd" && snapshot && game !== "passthepen" && (
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
              {player.guessed ? `rank ${player.guessRank}` : player.connected ? "connected" : "offline"} · {player.score}
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
  const [width, setWidth] = useState(6);

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
    if (pointsRef.current.length) renderStroke({ color, width, points: pointsRef.current });
  }, [color, strokes, width]);

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
    if (disabled) return;
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
    if (points.length) onChange([...strokes, { color, width, points }]);
  }

  const canUndo = !disabled && strokes.length > minStrokes;

  return (
    <div className="board">
      <div className="tools">
        <div>
          {["#15191f", "#e0576f", "#4f7cff", "#18a67d", "#f4c542"].map((item) => (
            <button
              key={item}
              className={item === color ? "tool-color active" : "tool-color"}
              style={{ background: item }}
              disabled={disabled}
              onClick={() => setColor(item)}
            />
          ))}
        </div>
        <div>
          {[4, 8, 14].map((item) => (
            <button
              key={item}
              className={item === width ? "tool-size active" : "tool-size"}
              disabled={disabled}
              onClick={() => setWidth(item)}
            >
              {item}
            </button>
          ))}
          <button className="secondary small" disabled={!canUndo} onClick={() => onChange(strokes.slice(0, -1))}>
            Undo
          </button>
          {!relay && (
            <button className="secondary small" disabled={disabled || !strokes.length} onClick={() => onChange([])}>
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
