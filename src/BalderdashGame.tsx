import { useEffect, useState } from "react";

export type BDView = {
  sub: "define" | "vote" | "score";
  round: number;
  totalRounds: number;
  word: string;
  hasSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
  defineDeadline: number;
  isSpectator: boolean;
  hint: string | null;
  hintLevel: number;
  options: Array<{
    text: string;
    isMine: boolean;
    author: string | null;
    votes: number | null;
    isReal: boolean | null;
  }> | null;
  myVote: number | null;
  hasVoted: boolean;
  votedCount: number;
  eligibleCount: number;
  voteDeadline: number;
  revealed: boolean;
  guessedReal: boolean | null;
  scores: Array<{ name: string; score: number }> | null;
};

type Props = {
  view: BDView;
  myId: string;
  isHost: boolean;
  lang: "en" | "zh";
  send: (type: string, payload?: unknown) => void;
};

function useCountdown(deadline: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export default function BalderdashGame({ view, isHost, lang, send }: Props) {
  const zh = lang === "zh";
  if (view.sub === "vote") return <BDVote view={view} isHost={isHost} zh={zh} send={send} />;
  if (view.sub === "score") return <BDScore view={view} isHost={isHost} zh={zh} send={send} />;
  return <BDDefine view={view} isHost={isHost} zh={zh} send={send} />;
}

function Header({
  zh,
  isHost,
  right,
  send,
}: {
  zh: boolean;
  isHost: boolean;
  right?: React.ReactNode;
  send: Props["send"];
}) {
  return (
    <div className="uc-top">
      <span className="uc-badge">📖 {zh ? "胡说八道" : "Balderdash"}</span>
      {right}
    </div>
  );
}

function roundLabel(view: BDView, zh: boolean) {
  return zh ? `第 ${view.round + 1}/${view.totalRounds} 词` : `Word ${view.round + 1}/${view.totalRounds}`;
}

function BDDefine({ view, isHost, zh, send }: { view: BDView; isHost: boolean; zh: boolean; send: Props["send"] }) {
  const seconds = useCountdown(view.defineDeadline);
  const [text, setText] = useState("");
  const timer = (
    <span className="uc-round">
      {roundLabel(view, zh)} · ⏱ {seconds}s
    </span>
  );
  const waiting = (
    <p className="relay-status">
      {zh ? `已提交 ${view.submittedCount}/${view.totalPlayers} · 等待其他人…` : `In: ${view.submittedCount}/${view.totalPlayers} · waiting…`}
    </p>
  );
  const skipBtn = isHost ? (
    <button className="secondary small" onClick={() => send("bdSkip")}>
      {zh ? "都好了?开始投票 →" : "Everyone in? Vote →"}
    </button>
  ) : null;

  const hintBox = view.hint ? (
    <p className="sb-prompt" style={{ fontSize: 16, borderColor: "#f4c542", background: "#fff8e1", textAlign: "center" }}>
      💡 {zh ? "提示" : "Hint"}: {view.hint}
    </p>
  ) : null;

  const hintBtn = isHost && view.hintLevel < 2 ? (
    <button className="secondary small" onClick={() => send("bdHint")} style={{ borderStyle: "dashed" }}>
      {view.hintLevel === 0
        ? zh ? "太难了?给个提示 💡" : "Too hard? Give a hint 💡"
        : zh ? "还不够?再多给点 💡💡" : "Still hard? More hint 💡💡"}
    </button>
  ) : null;

  if (view.isSpectator) {
    return (
      <main className="center">
        <section className="result-panel uc-panel">
          <Header zh={zh} isHost={isHost} right={timer} send={send} />
          <p className="muted">{zh ? "本局已开始 — 你在旁观,下一局加入吧。" : "In progress — you'll join next."}</p>
          {hintBox}
          {waiting}
        </section>
      </main>
    );
  }

  if (view.hasSubmitted) {
    return (
      <main className="center">
        <section className="result-panel uc-panel">
          <Header zh={zh} isHost={isHost} right={timer} send={send} />
          <p className="sb-prompt" style={{ fontSize: 28 }}>{view.word}</p>
          {hintBox}
          <p className="uc-status">✓ {zh ? "已提交!等大家编完就开始投票。" : "Submitted! Voting soon."}</p>
          {waiting}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {hintBtn}
            {skipBtn}
          </div>
        </section>
      </main>
    );
  }

  const submit = () => {
    if (text.trim()) send("bdDefine", { text: text.trim() });
  };

  return (
    <main className="center" style={{ maxWidth: 620 }}>
      <section className="result-panel uc-panel">
        <Header zh={zh} isHost={isHost} right={timer} send={send} />
        <p className="uc-status">{zh ? "给这个词编一个靠谱的假解释，骗过所有人:" : "Invent a believable fake definition:"}</p>
        <p className="sb-prompt" style={{ fontSize: 32, textAlign: "center" }}>{view.word}</p>
        {hintBox}
        <input
          className="tp-input"
          value={text}
          maxLength={140}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder={zh ? "比如:一种南极特产的企鹅叫声…" : "e.g. A type of dance from the 1800s…"}
        />
        <button className="primary" disabled={!text.trim()} onClick={submit} style={{ marginTop: 4 }}>
          {zh ? "提交假解释" : "Submit bluff"}
        </button>
        <p className="muted" style={{ fontSize: 13 }}>
          {zh ? "提示:越像真的越好。猜中真解释 +100, 每骗到1人 +50。" : "Tip: sound real. +100 for finding truth, +50 per fool."}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {hintBtn}
          {skipBtn}
        </div>
      </section>
    </main>
  );
}

function BDVote({ view, isHost, zh, send }: { view: BDView; isHost: boolean; zh: boolean; send: Props["send"] }) {
  const seconds = useCountdown(view.voteDeadline);
  const options = view.options ?? [];
  const resolved = view.revealed;
  const timer = (
    <span className="uc-round">
      {roundLabel(view, zh)}{view.voteDeadline ? ` · ⏱ ${seconds}s` : ""}
    </span>
  );

  let status: string;
  if (resolved) {
    if (view.guessedReal) status = zh ? "🎯 你找到了真相!+100" : "🎯 You found the truth! +100";
    else if (view.guessedReal === false) status = zh ? "😅 被骗了!看看真相是哪个" : "😅 Bluffed! Here's the truth";
    else status = zh ? "结果揭晓!" : "Revealed!";
  }
  else if (view.hasVoted) status = zh ? "已投票 · 等待其他人…" : "Voted · waiting…";
  else status = zh ? "哪个才是真的? (不能投自己编的)" : "Which is the REAL definition? (not your own)";

  return (
    <main className="center" style={{ maxWidth: 680 }}>
      <section className="result-panel" style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 14 }}>
        <Header zh={zh} isHost={isHost} right={timer} send={send} />
        <p className="sb-prompt" style={{ textAlign: "center", fontSize: 28 }}>{view.word}</p>
        <p className="uc-status" style={{ textAlign: "center" }}>{status}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {options.map((opt, i) => {
            const canPick = !resolved && !opt.isMine && !view.hasVoted;
            const isTrue = resolved && opt.isReal;
            return (
              <div
                key={i}
                className="tp-reveal-item"
                style={isTrue ? { outline: "3px solid var(--strong)", borderRadius: 8, background: "var(--panel-2)" } : undefined}
              >
                <p className="tp-bubble" style={{ fontSize: "1.1rem", marginBottom: resolved || opt.isMine ? 6 : 0 }}>
                  {opt.text}
                </p>
                {opt.isMine && !resolved && (
                  <span className="tp-step-tag">{zh ? "你编的" : "Your bluff"}</span>
                )}
                {resolved && (
                  <span className="tp-step-tag">
                    {opt.isReal ? (zh ? "✅ 真·解释" : "✅ TRUE") : `${opt.author}${opt.isMine ? (zh ? " (你)" : " (you)") : ""}`}
                    {` · ${opt.votes} ${zh ? "票" : opt.votes === 1 ? "vote" : "votes"}`}
                  </span>
                )}
                {canPick && (
                  <button
                    className="secondary small"
                    onClick={() => send("bdVote", { choice: i })}
                    style={{ marginTop: 6 }}
                  >
                    {zh ? "这个是真的!" : "This is real!"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {!resolved && (
          <p className="relay-status">
            {zh ? `已投票 ${view.votedCount}/${view.eligibleCount}` : `Voted: ${view.votedCount}/${view.eligibleCount}`}
          </p>
        )}
        {isHost && (
          <button className="secondary small" onClick={() => send("bdSkip")}>
            {resolved
              ? view.round + 1 >= view.totalRounds
                ? zh ? "看总分 →" : "See scores →"
                : zh ? "下一个词 →" : "Next word →"
              : zh ? "都投好了?揭晓 →" : "Reveal →"}
          </button>
        )}
      </section>
    </main>
  );
}

function BDScore({ view, isHost, zh, send }: { view: BDView; isHost: boolean; zh: boolean; send: Props["send"] }) {
  const scores = view.scores ?? [];
  return (
    <main className="center" style={{ maxWidth: 520 }}>
      <section className="result-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Header zh={zh} isHost={isHost} right={<span className="uc-round">{zh ? "总分" : "Scores"}</span>} send={send} />
        <p className="uc-status">{zh ? "本局最佳编剧 🏆" : "Best bluffer 🏆"}</p>
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
              <strong>{s.score}</strong>
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
