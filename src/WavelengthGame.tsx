import { Fragment, useEffect, useState } from "react";

export type WVCardView = {
  playerId: string;
  name: string;
  clue: string;
  value: number;
};

export type WVView = {
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

type Props = {
  view: WVView;
  isHost: boolean;
  lang: "en" | "zh";
  send: (type: string, payload?: unknown) => void;
};

const REVEAL_STEP_MS = 900;

export default function WavelengthGame({ view, isHost, lang, send }: Props) {
  const zh = lang === "zh";
  const [clue, setClue] = useState("");
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    setClue("");
  }, [view.round]);

  useEffect(() => {
    if (view.sub !== "reveal") {
      setRevealedCount(0);
      return;
    }

    const update = () => {
      const elapsed = Math.max(0, Date.now() - view.revealStartedAt);
      setRevealedCount(Math.min(view.placed.length, Math.floor(elapsed / REVEAL_STEP_MS) + 1));
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [view.sub, view.revealStartedAt, view.placed.length]);

  const playCard = () => {
    const clean = clue.trim();
    if (clean) send("wvReady", { clue: clean });
  };

  const revealComplete = view.sub === "reveal" && revealedCount >= view.placed.length;
  const perfectlyOrdered =
    revealComplete && view.placed.every((card, index) => index === 0 || view.placed[index - 1].value < card.value);

  return (
    <main className="center wv-main">
      <section className="result-panel wv-panel">
        <div className="wv-top">
          <span className="uc-round">{lang === "zh" ? `第 ${view.round} 轮` : `Round ${view.round}`}</span>
          <span className="uc-round">
            {view.sub === "reveal"
              ? zh
                ? "从左到右揭晓"
                : "Revealing left to right"
              : zh
                ? `${view.placed.length}/${view.participantCount} 已出牌`
                : `${view.placed.length}/${view.participantCount} cards played`}
          </span>
        </div>

        <div className="wv-spectrum-head" aria-label={`${view.left} to ${view.right}`}>
          <strong>{view.left}</strong>
          <span>0 ————————— 100</span>
          <strong>{view.right}</strong>
        </div>

        {!view.isSpectator && view.sub === "play" && (
          <div className="wv-secret">
            <span>{zh ? "你的秘密数字" : "Your secret number"}</span>
            <strong>{view.myValue}</strong>
            <small>
              {zh
                ? `想一个介于「${view.left}」和「${view.right}」之间的提示，不要说出数字。`
                : `Think of a clue between “${view.left}” and “${view.right}” without saying the number.`}
            </small>
          </div>
        )}

        {view.sub === "play" && view.canPlay && (
          <div className="wv-compose">
            <input
              value={clue}
              onChange={(event) => setClue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") playCard();
              }}
              maxLength={80}
              placeholder={zh ? "输入符合你数字的提示…" : "Type a clue that fits your number…"}
              autoFocus
            />
            <button className="primary" disabled={!clue.trim()} onClick={playCard}>
              {zh ? "公开提示" : "Reveal clue"}
            </button>
          </div>
        )}

        {view.sub === "play" && view.active && (
          <div className={`wv-active-card${view.isActive ? " mine" : ""}`}>
            <span>{view.active.name}</span>
            <strong>{view.active.clue}</strong>
            <small>
              {view.isActive
                ? zh
                  ? "把你的牌放到合适的位置"
                  : "Place your card where it belongs"
                : zh
                  ? "正在选择位置…"
                  : "is choosing a position…"}
            </small>
          </div>
        )}

        <div className="wv-line-scroll">
          <div className={`wv-card-line${view.placed.length === 0 ? " empty" : ""}`}>
            {view.placed.map((card, index) => {
              const visible = view.sub === "reveal" && index < revealedCount;
              const previousVisible = view.sub === "reveal" && index > 0 && index - 1 < revealedCount;
              const orderBreak = visible && previousVisible && view.placed[index - 1].value > card.value;
              return (
                <Fragment key={card.playerId}>
                  {view.isActive && (
                    <button
                      className="wv-place-slot"
                      onClick={() => send("wvPlace", { position: index })}
                      aria-label={zh ? `放在第 ${index + 1} 位` : `Place in position ${index + 1}`}
                    >
                      <span>＋</span>
                      {zh ? "放这里" : "Place"}
                    </button>
                  )}
                  <article className={`wv-order-card${visible ? " revealed" : ""}${orderBreak ? " order-break" : ""}`}>
                    {orderBreak && <span className="wv-break-mark">↙</span>}
                    <span className="wv-card-name">{card.name}</span>
                    <strong>{card.clue}</strong>
                    {view.sub === "reveal" && (
                      <span className="wv-card-number" aria-hidden={!visible}>
                        {visible ? card.value : "?"}
                      </span>
                    )}
                  </article>
                </Fragment>
              );
            })}
            {view.isActive && (
              <button
                className="wv-place-slot"
                onClick={() => send("wvPlace", { position: view.placed.length })}
                aria-label={zh ? `放在第 ${view.placed.length + 1} 位` : `Place in position ${view.placed.length + 1}`}
              >
                <span>＋</span>
                {zh ? "放这里" : "Place"}
              </button>
            )}
            {!view.isActive && view.placed.length === 0 && (
              <p className="wv-empty-line">{zh ? "第一张牌会放在这里" : "The first card will go here"}</p>
            )}
          </div>
        </div>

        {view.sub === "play" && !view.active && view.hasPlayed && (
          <p className="uc-status">{zh ? "你的牌已锁定，看看谁准备好接着出牌。" : "Your card is locked. Who's ready to play next?"}</p>
        )}
        {view.sub === "play" && !view.active && view.isSpectator && (
          <p className="uc-status">{zh ? "本轮观战，下轮即可加入。" : "You're watching this round and can join the next one."}</p>
        )}

        {view.sub === "reveal" && (
          <div className="wv-reveal-status" aria-live="polite">
            {!revealComplete ? (
              <p>{zh ? "翻牌中…" : "Revealing…"}</p>
            ) : (
              <p className={perfectlyOrdered ? "perfect" : "mixed"}>
                {perfectlyOrdered
                  ? zh
                    ? "完全有序！大家真的心有灵序 ✨"
                    : "Perfect order — truly in sync! ✨"
                  : zh
                    ? "原来大家心里的刻度不太一样 😄"
                    : "Looks like everyone's scale was a little different 😄"}
              </p>
            )}
          </div>
        )}

        {view.sub === "reveal" && revealComplete &&
          (isHost ? (
            <button className="primary" onClick={() => send("wvNext")}>
              {zh ? "再来一轮" : "Another round"}
            </button>
          ) : (
            <p className="muted">{zh ? "等待房主…" : "Waiting for host…"}</p>
          ))}
      </section>
    </main>
  );
}
