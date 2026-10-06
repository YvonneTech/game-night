import { useEffect, useRef, useState } from "react";

export type LLCard = "guard" | "priest" | "baron" | "prince" | "princess";

export type LLMemberView = {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  connected: boolean;
  tokens: number;
};

export type LLView = {
  sub: "play" | "reveal" | "score";
  round: number;
  roundStartedAt: number;
  targetTokens: number;
  currentId: string;
  currentName: string;
  youPlay: boolean;
  hand: LLCard | null;
  drawn: LLCard | null;
  members: LLMemberView[];
  discards: Record<string, LLCard[]>;
  tokens: Record<string, number>;
  deckCount: number;
  peek: { targetName: string; card: LLCard } | null;
  winnerId: string | null;
  winnerName: string | null;
  tied: boolean;
  reveal: Array<{ id: string; name: string; card: LLCard }> | null;
  scores: Array<{ name: string; tokens: number }> | null;
  isSpectator: boolean;
};

export type LLFeedMsg = {
  id: string;
  playerName: string;
  text: string;
  system?: boolean;
  at: number;
};

type Props = {
  view: LLView;
  myId: string;
  isHost: boolean;
  lang: "en" | "zh";
  send: (type: string, payload?: unknown) => void;
  messages?: LLFeedMsg[];
};

type Lang = "en" | "zh";

const CARD_NAMES: Record<Lang, Record<LLCard, string>> = {
  en: { guard: "Guard", priest: "Priest", baron: "Baron", prince: "Prince", princess: "Princess" },
  zh: { guard: "守卫", priest: "祭司", baron: "男爵", prince: "王子", princess: "公主" },
};

// Higher rank wins Barons and round showdowns. Mirrors LL_RANKS in worker/index.ts.
const CARD_RANKS: Record<LLCard, number> = { guard: 1, priest: 2, baron: 3, prince: 4, princess: 5 };

// Copies of each card in the 20-card deck. Keep in sync with LL_DECK in worker/index.ts.
const CARD_COUNTS: Record<LLCard, number> = { guard: 8, priest: 4, baron: 4, prince: 3, princess: 1 };

const CARD_POWER: Record<Lang, Record<LLCard, string>> = {
  en: {
    guard: "Guess a hand — a hit knocks them out",
    priest: "Peek at one player's hand",
    baron: "Compare hands — lower is out",
    prince: "Someone discards and redraws",
    princess: "Lose if you play or discard it",
  },
  zh: {
    guard: "猜一人的底牌，猜中即淘汰",
    priest: "偷看一位玩家的底牌",
    baron: "和一人比大小，小者出局",
    prince: "指定一人弃牌并重抽",
    princess: "打出或被弃即出局",
  },
};

const GUESS_CHOICES: LLCard[] = ["priest", "baron", "prince", "princess"];

export default function LoveLetterGame({ view, myId, isHost, lang, send, messages = [] }: Props) {
  const zh = lang === "zh";
  if (view.sub === "reveal") return <LLReveal view={view} isHost={isHost} zh={zh} send={send} />;
  if (view.sub === "score") return <LLScore view={view} isHost={isHost} zh={zh} send={send} />;
  return <LLPlay view={view} myId={myId} isHost={isHost} zh={zh} send={send} messages={messages} />;
}

function Header({ zh, right }: { zh: boolean; right?: React.ReactNode }) {
  return (
    <div className="uc-top">
      <span className="uc-badge">💌 {zh ? "情书" : "Love Letter"}</span>
      {right}
    </div>
  );
}

function SeatTable({ view, lang }: { view: LLView; lang: Lang }) {
  const zh = lang === "zh";
  return (
    <div className="ll-table">
      {view.members.map((m) => {
        const played = view.discards[m.id] ?? [];
        const last = played[played.length - 1];
        const isCurrent = m.id === view.currentId && view.sub === "play";
        const cls = `ll-seat${isCurrent ? " current" : ""}${m.alive ? "" : " out"}`;
        return (
          <div key={m.id} className={cls}>
            <div className="ll-seat-top">
              <span className="ll-dot" style={{ background: m.color }} />
              <span>{m.name}</span>
              <span className="ll-tokens">{m.tokens}/{view.targetTokens}</span>
            </div>
            <div className="ll-seat-sub">
              {!m.alive ? (
                zh ? "出局" : "Out"
              ) : isCurrent ? (
                zh ? "出牌中…" : "Playing…"
              ) : last ? (
                <span key={`${m.id}-${played.length}`} className="ll-last-pop">
                  {CARD_NAMES[lang][last]}
                </span>
              ) : (
                "—"
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionBanner({ feed }: { feed: LLFeedMsg[] }) {
  const last = feed[feed.length - 1];
  if (!last) return null;
  return (
    <p className="ll-action">
      <span key={last.id} className="ll-action-pop">
        {last.text}
      </span>
    </p>
  );
}

function LLHelp({ lang, targetTokens }: { lang: Lang; targetTokens: number }) {
  const zh = lang === "zh";
  const order: LLCard[] = ["guard", "priest", "baron", "prince", "princess"];
  const total = order.reduce((n, c) => n + CARD_COUNTS[c], 0);
  return (
    <details className="ll-help">
      <summary>{zh ? "玩法说明" : "How to play"}</summary>
      <p>
        {zh
          ? `赢下一轮得 1 个信物，先拿 ${targetTokens} 个信物者赢得整局。你的回合：先抽一张牌，再打出两张手牌之一。`
          : `Win a round to earn a token — first to ${targetTokens} wins. On your turn: draw a card, then play one of your two.`}
      </p>
      <p className="muted">
        {zh ? "点数大获胜，×N 是张数。" : "Higher rank wins. ×N = copies in deck."}
      </p>
      <div className="ll-help-rows">
        {order.map((c) => (
          <div key={c} className="ll-help-row">
            <span>
              <strong>{CARD_NAMES[lang][c]}</strong>{" "}
              <span className="tp-step-tag">{zh ? `点数 ${CARD_RANKS[c]}` : `Rank ${CARD_RANKS[c]}`}</span>{" "}
              <span className="tp-step-tag">×{CARD_COUNTS[c]}</span>
            </span>
            <span className="muted">{CARD_POWER[lang][c]}</span>
          </div>
        ))}
      </div>
      <p className="muted">{zh ? `共 ${total} 张牌` : `${total} cards total`}</p>
    </details>
  );
}

function TurnLog({ feed }: { feed: LLFeedMsg[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [feed.length]);
  if (feed.length === 0) return null;
  return (
    <div className="chat-list ll-chat" ref={ref}>
      {feed.map((m) => (
        <div
          key={m.id}
          className={/^Round \d+/i.test(m.text) ? "message system round-change" : "message system"}
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}

function CardButton({
  card,
  lang,
  selected,
  disabled,
  onPick,
}: {
  card: LLCard;
  lang: Lang;
  selected: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  const rankLabel = lang === "zh" ? `点数 ${CARD_RANKS[card]}` : `Rank ${CARD_RANKS[card]}`;
  return (
    <button
      className={selected ? "primary small" : "secondary small"}
      disabled={disabled}
      onClick={onPick}
      title={`${CARD_NAMES[lang][card]} · ${rankLabel} · ×${CARD_COUNTS[card]} — ${CARD_POWER[lang][card]}`}
      style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 14px" }}
    >
      <strong style={{ fontSize: 16 }}>{CARD_NAMES[lang][card]}</strong>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{CARD_POWER[lang][card]}</span>
    </button>
  );
}

function LLPlay({
  view,
  myId,
  isHost,
  zh,
  send,
  messages,
}: {
  view: LLView;
  myId: string;
  isHost: boolean;
  zh: boolean;
  send: Props["send"];
  messages: LLFeedMsg[];
}) {
  const lang: Lang = zh ? "zh" : "en";
  const feed = messages.filter((m) => m.system && m.at >= view.roundStartedAt);
  const [playIndex, setPlayIndex] = useState<number | null>(null);
  const [target, setTarget] = useState("");
  const [guess, setGuess] = useState<LLCard | null>(null);
  useEffect(() => {
    setPlayIndex(null);
    setTarget("");
    setGuess(null);
  }, [view.currentId, view.round, view.drawn]);

  const me = view.members.find((m) => m.id === myId);
  const held: LLCard[] = [];
  if (view.hand) held.push(view.hand);
  if (view.drawn) held.push(view.drawn);
  const canDraw = view.youPlay && view.drawn === null;
  const canPlay = view.youPlay && view.drawn !== null;
  // Track the pick by position, not value, so a pair highlights only the tapped card.
  const play = playIndex !== null ? (held[playIndex] ?? null) : null;
  const needsTarget = play === "guard" || play === "priest" || play === "baron" || play === "prince";
  const selfAllowed = play === "prince";
  const targets = view.members.filter((m) => m.alive && (selfAllowed || m.id !== myId));
  const canConfirm =
    canPlay && play !== null && (!needsTarget || target !== "") && (play !== "guard" || guess !== null);

  const confirm = () => {
    if (!canConfirm || !play) return;
    send("llPlay", { play, targetId: target, guess: guess ?? "" });
    setPlayIndex(null);
    setTarget("");
    setGuess(null);
  };

  const timer = (
    <span className="uc-round">
      {zh ? `第 ${view.round} 轮` : `Round ${view.round}`} · {zh ? `牌堆 ${view.deckCount}` : `${view.deckCount} left`}
    </span>
  );

  return (
    <main className="center" style={{ maxWidth: 620 }}>
      <section className="result-panel uc-panel">
        <Header zh={zh} right={timer} />
        <SeatTable view={view} lang={lang} />
        <ActionBanner feed={feed} />
        {me && !me.alive && (
          <p className="uc-status">{zh ? "你本轮已出局 — 旁观中。" : "You're out this round — spectating."}</p>
        )}
        {view.youPlay ? (
          <p className="uc-status">
            {view.drawn
              ? zh
                ? "轮到你 — 打出一张牌："
                : "Your turn — play one card:"
              : zh
                ? "轮到你 — 先抽一张牌："
                : "Your turn — draw a card first:"}
          </p>
        ) : (
          <p className="uc-status">
            {view.currentName
              ? zh
                ? `轮到 ${view.currentName} 出牌…`
                : `${view.currentName} is thinking…`
              : zh
                ? "等待中…"
                : "Waiting…"}
          </p>
        )}
        {view.peek && (
          <p className="sb-prompt" style={{ fontSize: 15, textAlign: "center" }}>
            👀 {view.peek.targetName}: {CARD_NAMES[lang][view.peek.card]} · {CARD_RANKS[view.peek.card]}
          </p>
        )}
        {(canPlay ? held.length > 0 : view.hand !== null) && (
          <>
            <p className="uc-status">{zh ? "你的手牌：" : "Your hand:"}</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {(canPlay ? held : view.hand ? [view.hand] : []).map((card, i) => {
                const isDrawn = canPlay && i === 1;
                const btn = (
                  <CardButton
                    key={`${card}-${i}`}
                    card={card}
                    lang={lang}
                    selected={canPlay && playIndex === i}
                    disabled={!canPlay}
                    onPick={() => {
                      if (!canPlay) return;
                      setPlayIndex(i);
                      setTarget("");
                      setGuess(null);
                    }}
                  />
                );
                return isDrawn ? (
                  <span key={`drawn-${view.round}-${view.currentId}`} className="ll-last-pop">
                    {btn}
                  </span>
                ) : (
                  btn
                );
              })}
            </div>
            {canDraw && (
              <button className="primary" onClick={() => send("llDraw")} style={{ marginTop: 4 }}>
                {zh ? "抽一张牌" : "Draw a card"}
              </button>
            )}
            {canPlay && needsTarget && (
              <>
                <p className="uc-status">{zh ? "选择目标：" : "Choose a target:"}</p>
                <div className="uc-vote-grid">
                  {targets.map((m) => (
                    <button
                      key={m.id}
                      className={target === m.id ? "primary small" : "secondary small"}
                      onClick={() => setTarget(m.id)}
                    >
                      {m.name}
                      {m.id === myId ? (zh ? " (你)" : " (you)") : ""}
                    </button>
                  ))}
                </div>
              </>
            )}
            {canPlay && play === "guard" && (
              <>
                <p className="uc-status">{zh ? "猜他/她的底牌是：" : "Guess their hand is:"}</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  {GUESS_CHOICES.map((c) => (
                    <button
                      key={c}
                      className={guess === c ? "primary small" : "secondary small"}
                      onClick={() => setGuess(c)}
                    >
                      {CARD_NAMES[lang][c]}
                    </button>
                  ))}
                </div>
              </>
            )}
            {canPlay && (
              <button className="primary" disabled={!canConfirm} onClick={confirm} style={{ marginTop: 4 }}>
                {zh ? "打出！" : "Play!"}
              </button>
            )}
          </>
        )}
        <TurnLog feed={feed} />
        <LLHelp lang={lang} targetTokens={view.targetTokens} />
      </section>
    </main>
  );
}

function LLReveal({
  view,
  isHost,
  zh,
  send,
}: {
  view: LLView;
  isHost: boolean;
  zh: boolean;
  send: Props["send"];
}) {
  const lang: Lang = zh ? "zh" : "en";
  const reveal = view.reveal ?? [];
  return (
    <main className="center" style={{ maxWidth: 560 }}>
      <section className="result-panel uc-panel">
        <Header zh={zh} right={<span className="uc-round">{zh ? `第 ${view.round} 轮` : `Round ${view.round}`}</span>} />
        <SeatTable view={view} lang={lang} />
        <h1 style={{ textAlign: "center" }}>
          {view.tied
            ? zh
              ? "平局 — 本轮无信物"
              : "Tied — no token this round"
            : view.winnerName
              ? zh
                ? `${view.winnerName} 拿下本轮！`
                : `${view.winnerName} takes the round!`
              : ""}
        </h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reveal.map((r) => (
            <div key={r.id} className="tp-reveal-item" style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="tp-step-tag">{r.name}</span>
              <strong>
                {CARD_NAMES[lang][r.card]} · {CARD_RANKS[r.card]}
              </strong>
            </div>
          ))}
        </div>
        {isHost ? (
          <button className="primary" onClick={() => send("llNext")}>
            {zh ? "下一轮 →" : "Next round →"}
          </button>
        ) : (
          <p className="muted">{zh ? "等待房主开下一轮…" : "Waiting for host…"}</p>
        )}
      </section>
    </main>
  );
}

function LLScore({
  view,
  isHost,
  zh,
  send,
}: {
  view: LLView;
  isHost: boolean;
  zh: boolean;
  send: Props["send"];
}) {
  const scores = view.scores ?? [];
  const champion = scores[0];
  return (
    <main className="center" style={{ maxWidth: 520 }}>
      <section className="result-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Header zh={zh} right={<span className="uc-round">{zh ? "总分" : "Scores"}</span>} />
        <p className="uc-status">
          {champion
            ? zh
              ? `${champion.name} 赢得情书！💌`
              : `${champion.name} wins Love Letter! 💌`
            : ""}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {scores.map((s, i) => (
            <div
              key={i}
              className="tp-reveal-item"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                ...(i === 0 ? { outline: "3px solid var(--strong)", borderRadius: 8 } : {}),
              }}
            >
              <span className="tp-step-tag">
                {i === 0 ? "🏆 " : `${i + 1}. `}
                {s.name}
              </span>
              <strong>
                {s.tokens}/{view.targetTokens}
              </strong>
            </div>
          ))}
        </div>
        {isHost && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="secondary small" onClick={() => send("start")}>
              {zh ? "再来一局" : "Play again"}
            </button>
            <button className="primary small" onClick={() => send("reset")}>
              {zh ? "回到大厅" : "Lobby"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
