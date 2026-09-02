import { useEffect, useState } from "react";

export type PLView = {
  sub: "answer" | "vote" | "score";
  round: number;
  totalRounds: number;
  prompt: string;
  hasSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
  answerDeadline: number;
  isSpectator: boolean;
  answers: Array<{ text: string; isMine: boolean; author: string | null; votes: number | null }> | null;
  myVote: number | null;
  hasVoted: boolean;
  votedCount: number;
  eligibleCount: number;
  voteDeadline: number;
  revealed: boolean;
  scores: Array<{ name: string; score: number }> | null;
};

type Props = {
  view: PLView;
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

export default function PunchlineGame({ view, isHost, lang, send }: Props) {
  const zh = lang === "zh";
  if (view.sub === "vote") return <PunchVote view={view} isHost={isHost} zh={zh} send={send} />;
  if (view.sub === "score") return <PunchScore view={view} isHost={isHost} zh={zh} send={send} />;
  return <PunchAnswer view={view} isHost={isHost} zh={zh} send={send} />;
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
      <span className="uc-badge">🎤 {zh ? "神回复" : "Punchline"}</span>
      {right}
      {isHost && (
        <button className="exit-x" onClick={() => send("reset")} title={zh ? "结束本局" : "End game"}>
          ✕
        </button>
      )}
    </div>
  );
}

function roundLabel(view: PLView, zh: boolean) {
  return zh ? `第 ${view.round + 1}/${view.totalRounds} 题` : `Prompt ${view.round + 1}/${view.totalRounds}`;
}

// ---- answer the shared prompt ----
function PunchAnswer({ view, isHost, zh, send }: { view: PLView; isHost: boolean; zh: boolean; send: Props["send"] }) {
  const seconds = useCountdown(view.answerDeadline);
  const [text, setText] = useState("");
  const timer = (
    <span className="uc-round">
      {roundLabel(view, zh)} · ⏱ {seconds}s
    </span>
  );
  const waiting = (
    <p className="relay-status">
      {zh
        ? `已提交 ${view.submittedCount}/${view.totalPlayers} · 等待其他人…`
        : `In: ${view.submittedCount}/${view.totalPlayers} · waiting for others…`}
    </p>
  );

  const skipBtn = isHost ? (
    <button className="secondary small" onClick={() => send("plSkip")}>
      {zh ? "都好了?开始投票 →" : "Everyone in? Start voting →"}
    </button>
  ) : null;

  if (view.isSpectator) {
    return (
      <main className="center">
        <section className="result-panel uc-panel">
          <Header zh={zh} isHost={isHost} right={timer} send={send} />
          <p className="muted">
            {zh ? "本局已开始 — 你在旁观,下一局加入吧。" : "This game is in progress — you'll join the next one."}
          </p>
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
          <p className="sb-prompt">{view.prompt}</p>
          <p className="uc-status">✓ {zh ? "已提交!等大家写完就开始投票。" : "Submitted! Voting starts when everyone's in."}</p>
          {waiting}
          {skipBtn}
        </section>
      </main>
    );
  }

  const submit = () => {
    if (text.trim()) send("plAnswer", { text: text.trim() });
  };

  return (
    <main className="center" style={{ maxWidth: 620 }}>
      <section className="result-panel uc-panel">
        <Header zh={zh} isHost={isHost} right={timer} send={send} />
        <p className="uc-status">{zh ? "给出你最好笑的回答:" : "Give the funniest answer you can:"}</p>
        <p className="sb-prompt">{view.prompt}</p>
        <input
          className="tp-input"
          value={text}
          maxLength={120}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={zh ? "你的神回复…" : "Your punchline…"}
        />
        <button className="primary" disabled={!text.trim()} onClick={submit} style={{ marginTop: 4 }}>
          {zh ? "提交" : "Submit"}
        </button>
        {skipBtn}
      </section>
    </main>
  );
}

// ---- vote on all answers (can't vote your own) ----
function PunchVote({ view, isHost, zh, send }: { view: PLView; isHost: boolean; zh: boolean; send: Props["send"] }) {
  const seconds = useCountdown(view.voteDeadline);
  const answers = view.answers ?? [];
  const resolved = view.revealed;
  const timer = (
    <span className="uc-round">
      {roundLabel(view, zh)}
      {view.voteDeadline ? ` · ⏱ ${seconds}s` : ""}
    </span>
  );

  const maxVotes = resolved ? Math.max(0, ...answers.map((a) => a.votes ?? 0)) : -1;

  let status: string;
  if (resolved) status = zh ? "结果揭晓!" : "The votes are in!";
  else if (view.hasVoted) status = zh ? "已投票 · 等待其他人…" : "Voted · waiting for others…";
  else status = zh ? "选出最好笑的回答(不能投自己):" : "Pick the funniest answer (not your own):";

  return (
    <main className="center" style={{ maxWidth: 680 }}>
      <section className="result-panel" style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 14 }}>
        <Header zh={zh} isHost={isHost} right={timer} send={send} />
        <p className="sb-prompt" style={{ textAlign: "center" }}>
          {view.prompt}
        </p>
        <p className="uc-status" style={{ textAlign: "center" }}>
          {status}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {answers.map((ans, i) => {
            const isWinner = resolved && (ans.votes ?? 0) === maxVotes && maxVotes > 0;
            const mine = view.myVote === i;
            const canPick = !resolved && !ans.isMine && !view.hasVoted;
            return (
              <div
                key={i}
                className="tp-reveal-item"
                style={isWinner ? { outline: "3px solid var(--strong)", borderRadius: 8 } : undefined}
              >
                <p className="tp-bubble" style={{ fontSize: "1.15rem", marginBottom: resolved || ans.isMine ? 6 : 0 }}>
                  {ans.text}
                </p>
                {ans.isMine && !resolved && (
                  <span className="tp-step-tag">{zh ? "这是你的回答" : "Your answer"}</span>
                )}
                {resolved && (
                  <span className="tp-step-tag">
                    {isWinner ? "🏆 " : ""}
                    {ans.author}
                    {ans.isMine ? (zh ? " (你)" : " (you)") : ""}
                    {` · ${ans.votes} ${zh ? "票" : ans.votes === 1 ? "vote" : "votes"}`}
                  </span>
                )}
                {canPick && (
                  <button
                    className={mine ? "primary small" : "secondary small"}
                    onClick={() => send("plVote", { choice: i })}
                    style={{ marginTop: 6 }}
                  >
                    {zh ? "选这条 😂" : "Pick this 😂"}
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
          <button className="secondary small" onClick={() => send("plSkip")}>
            {resolved
              ? view.round + 1 >= view.totalRounds
                ? zh
                  ? "看总分 →"
                  : "See scores →"
                : zh
                  ? "下一题 →"
                  : "Next prompt →"
              : zh
                ? "都投好了?出结果 →"
                : "Everyone in? Reveal →"}
          </button>
        )}
      </section>
    </main>
  );
}

// ---- final scoreboard ----
function PunchScore({ view, isHost, zh, send }: { view: PLView; isHost: boolean; zh: boolean; send: Props["send"] }) {
  const scores = view.scores ?? [];
  return (
    <main className="center" style={{ maxWidth: 520 }}>
      <section className="result-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Header zh={zh} isHost={isHost} right={<span className="uc-round">{zh ? "总分" : "Scores"}</span>} send={send} />
        <p className="uc-status">{zh ? "本局最强神回复 🏆" : "Best comebacks of the night 🏆"}</p>
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
