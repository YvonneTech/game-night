import { useState } from "react";

export type UCView = {
  sub: "describe" | "vote" | "reveal";
  round: number;
  spyCount: number;
  myRole: "civ" | "spy" | null;
  myWord: string;
  alive: boolean;
  youSpeak: boolean;
  youVote: boolean;
  hasVoted: boolean;
  currentId: string;
  currentName: string;
  candidates: string[];
  members: Array<{ id: string; name: string; alive: boolean; connected: boolean; voted: boolean }>;
  descriptions: Array<{ playerId: string; playerName: string; text: string; passed?: boolean }>;
  eliminated: { name: string } | null;
  result: "civ" | "spy" | null;
  reveal: Array<{ name: string; role: "civ" | "spy"; word: string }> | null;
};

type Props = {
  view: UCView;
  myId: string;
  isHost: boolean;
  lang: "en" | "zh";
  send: (type: string, payload?: unknown) => void;
};

export default function UndercoverGame({ view, myId, isHost, lang, send }: Props) {
  const [desc, setDesc] = useState("");
  const zh = lang === "zh";
  const submitDescribe = () => {
    send("ucDescribe", { text: desc.trim() });
    setDesc("");
  };

  return (
    <main className="center">
      <section className="result-panel uc-panel">
        <div className="uc-top">
          <span className="uc-badge">
            🕵️ {zh ? `${view.spyCount} 个卧底` : `${view.spyCount} undercover${view.spyCount > 1 ? "s" : ""}`}
          </span>
          <span className="uc-round">{zh ? `第 ${view.round} 轮` : `Round ${view.round}`}</span>
          {isHost && (
            <button
              className="exit-x"
              onClick={() => send("reset")}
              title={zh ? "结束本局(回大厅)" : "End game (back to lobby)"}
              aria-label="End game"
            >
              ✕
            </button>
          )}
        </div>

        <div className="uc-word">
          <span>{zh ? "你的词" : "Your word"}</span>
          <strong>{view.myWord || "—"}</strong>
        </div>

        {view.sub === "describe" && (
          <>
            <p className="uc-status">
              {view.youSpeak
                ? zh
                  ? "轮到你 — 说一句话形容你的词(可打字,也可以直接口述)"
                  : "Your turn — describe your word (type it or just say it aloud)"
                : zh
                  ? `轮到 ${view.currentName} 描述…`
                  : `${view.currentName} is describing…`}
            </p>
            <div className="uc-log">
              {view.descriptions.length === 0 ? (
                <p className="muted">{zh ? "还没有人描述" : "No clues yet"}</p>
              ) : (
                view.descriptions.map((d, i) =>
                  d.passed ? (
                    <div key={i} className="uc-desc uc-pass">
                      <em>
                        {d.playerName} {zh ? "说完了" : "finished"}
                      </em>
                    </div>
                  ) : (
                    <div key={i} className="uc-desc">
                      <strong>{d.playerName}:</strong> {d.text}
                    </div>
                  ),
                )
              )}
            </div>
            {view.youSpeak && (
              <div className="uc-describe-row">
                <input
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitDescribe();
                  }}
                  maxLength={120}
                  placeholder={zh ? "打一句描述(可留空)" : "Type a clue (optional)"}
                />
                <button className="primary" onClick={submitDescribe}>
                  {zh ? "说完了 →" : "Done →"}
                </button>
              </div>
            )}
          </>
        )}

        {view.sub === "vote" && (
          <>
            <p className="uc-status">
              {view.candidates.length
                ? zh
                  ? "平票!在候选人里重新投票"
                  : "Tie! Re-vote among the tied players"
                : zh
                  ? "投票选出你认为的卧底"
                  : "Vote out who you think is the undercover"}
            </p>
            <div className="uc-vote-grid">
              {view.members
                .filter((m) => m.alive && m.id !== myId)
                .map((m) => {
                  const votable =
                    view.youVote && (view.candidates.length === 0 || view.candidates.includes(m.id));
                  return (
                    <button
                      key={m.id}
                      className="uc-vote-btn"
                      disabled={!votable}
                      onClick={() => send("ucVote", { targetId: m.id })}
                    >
                      <span>
                        {m.name}
                        {m.id === myId ? (zh ? "(你)" : " (you)") : ""}
                      </span>
                      {m.voted && <span className="uc-voted">✓</span>}
                    </button>
                  );
                })}
            </div>
            {!view.youVote && (
              <p className="muted">
                {view.hasVoted
                  ? zh
                    ? "已投票,等待其他人…"
                    : "Voted — waiting for others…"
                  : view.candidates.includes(myId)
                    ? zh
                      ? "你在平票名单里,本轮不能投票"
                      : "You're tied — no vote this round"
                    : !view.alive
                      ? zh
                        ? "你已出局,旁观中"
                        : "You're out — spectating"
                      : zh
                        ? "等待投票…"
                        : "Waiting…"}
              </p>
            )}
            {isHost && (
              <button className="secondary small" onClick={() => send("ucTally")}>
                {zh ? "立即计票" : "Tally now"}
              </button>
            )}
          </>
        )}

        {view.sub === "reveal" && (
          <>
            {view.eliminated && (
              <div className="uc-reveal">
                <h2>
                  {view.eliminated.name} {zh ? "出局" : "is out"}
                </h2>
                <p>
                  {view.result
                    ? zh
                      ? "本局结束!"
                      : "The game is over!"
                    : zh
                      ? "游戏继续!"
                      : "The game continues!"}
                </p>
                <p className="muted">
                  {zh ? "(身份和词等结束才揭晓)" : "(identities & words revealed at the end)"}
                </p>
              </div>
            )}
            {isHost ? (
              <button className="primary" onClick={() => send("ucProceed")}>
                {view.result ? (zh ? "查看结果" : "See result") : zh ? "下一轮" : "Next round"}
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
