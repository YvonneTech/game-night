import { useEffect, useState } from "react";

export type WVView = {
  sub: "clue" | "guess" | "reveal";
  round: number;
  total: number;
  left: string;
  right: string;
  psychicName: string;
  isPsychic: boolean;
  target: number; // -1 when hidden
  clue: string;
  myGuess: number; // -1 when none
  youClue: boolean;
  youGuess: boolean;
  submittedCount: number;
  guessers: number;
  results: Array<{ name: string; guess: number; points: number }> | null;
  psychicPoints: number;
};

type Props = {
  view: WVView;
  isHost: boolean;
  lang: "en" | "zh";
  send: (type: string, payload?: unknown) => void;
};

export default function WavelengthGame({ view, isHost, lang, send }: Props) {
  const zh = lang === "zh";
  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState(50);

  // Reset the local slider/clue when a new round or phase begins.
  useEffect(() => {
    setGuess(view.myGuess >= 0 ? view.myGuess : 50);
    setClue("");
  }, [view.round, view.sub, view.myGuess]);

  const submitClue = () => {
    if (clue.trim()) send("wvClue", { clue: clue.trim() });
  };
  const submitGuess = () => send("wvGuess", { value: guess });

  return (
    <main className="center">
      <section className="result-panel wv-panel">
        <div className="wv-top">
          <span className="uc-round">{zh ? `第 ${view.round}/${view.total} 轮` : `Round ${view.round}/${view.total}`}</span>
          <span className="uc-round">{view.psychicName}{zh ? " 出线索" : " gives the clue"}</span>
        </div>

        <div className="wv-bar-wrap">
          <span className="wv-end">{view.left}</span>
          <div className="wv-bar">
            {view.target >= 0 && (
              <>
                <div className="wv-target" style={{ left: `${view.target - 5}%`, width: "10%" }} />
                <div className="wv-target-line" style={{ left: `${view.target}%` }} />
              </>
            )}
            {view.results?.map((r, i) => (
              <div key={i} className="wv-pin" style={{ left: `${r.guess}%` }} title={`${r.name}: +${r.points}`}>
                <span className="wv-pin-dot" />
                <span className="wv-pin-name">{r.name}</span>
              </div>
            ))}
            {view.youGuess && (
              <div className="wv-pin you" style={{ left: `${guess}%` }}>
                <span className="wv-pin-dot" />
              </div>
            )}
          </div>
          <span className="wv-end">{view.right}</span>
        </div>

        {view.sub === "clue" &&
          (view.youClue ? (
            <>
              <p className="uc-status">
                {zh ? "只有你看得到目标 🎯 — 给一个线索,把大家引到目标处" : "Only you can see the target 🎯 — give a clue to steer everyone there"}
              </p>
              <div className="uc-describe-row">
                <input
                  value={clue}
                  onChange={(e) => setClue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitClue();
                  }}
                  maxLength={60}
                  placeholder={zh ? "输入线索词…" : "Type your clue…"}
                />
                <button className="primary" onClick={submitClue}>
                  {zh ? "给线索 →" : "Give clue →"}
                </button>
              </div>
            </>
          ) : (
            <p className="uc-status">{view.psychicName}{zh ? " 正在想线索…" : " is thinking of a clue…"}</p>
          ))}

        {view.sub === "guess" && (
          <>
            <p className="wv-clue">
              {zh ? "线索:" : "Clue: "}
              <strong>{view.clue}</strong>
            </p>
            {view.youGuess ? (
              <>
                <input
                  className="wv-slider"
                  type="range"
                  min={0}
                  max={100}
                  value={guess}
                  onChange={(e) => setGuess(Number(e.target.value))}
                />
                <button className="primary" onClick={submitGuess}>
                  {zh ? "确定" : "Lock in"}
                </button>
              </>
            ) : view.isPsychic ? (
              <p className="uc-status">
                {zh ? `等待大家猜 (${view.submittedCount}/${view.guessers})` : `Waiting for guesses (${view.submittedCount}/${view.guessers})`}
              </p>
            ) : view.myGuess >= 0 ? (
              <p className="uc-status">
                {zh ? `已提交,等待其他人 (${view.submittedCount}/${view.guessers})` : `Locked in — waiting (${view.submittedCount}/${view.guessers})`}
              </p>
            ) : (
              <p className="uc-status">{zh ? "等待中…" : "Waiting…"}</p>
            )}
            {isHost && view.submittedCount > 0 && view.submittedCount < view.guessers && (
              <button className="secondary small" onClick={() => send("wvReveal")}>
                {zh ? "立即揭晓" : "Reveal now"}
              </button>
            )}
          </>
        )}

        {view.sub === "reveal" && (
          <>
            <p className="wv-clue">
              {zh ? "线索:" : "Clue: "}
              <strong>{view.clue}</strong>
            </p>
            <div className="wv-results">
              {view.results
                ?.slice()
                .sort((a, b) => b.points - a.points)
                .map((r, i) => (
                  <div key={i} className="wv-result-row">
                    <strong>{r.name}</strong>
                    <em className={`wv-pts p${r.points}`}>+{r.points}</em>
                  </div>
                ))}
              <div className="wv-result-row psychic">
                <strong>
                  {view.psychicName} {zh ? "(线索人)" : "(clue)"}
                </strong>
                <em className="wv-pts">+{view.psychicPoints}</em>
              </div>
            </div>
            {isHost ? (
              <button className="primary" onClick={() => send("wvNext")}>
                {view.round >= view.total ? (zh ? "查看排行榜" : "See results") : zh ? "下一轮" : "Next round"}
              </button>
            ) : (
              <p className="muted">{zh ? "等待房主…" : "Waiting for host…"}</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
