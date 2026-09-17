import { useEffect, useRef, useState } from "react";

export type SUTaboo = { text: string; kind: "word" | "action" };
export type SUOpponentView = {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  taboo: SUTaboo;
  strikes: number;
};
export type SUView = {
  sub: "play" | "reveal";
  endsAt: number;
  durationSeconds: number;
  timeLeft: number;
  myStrikes: number;
  myCatches: number;
  isSpectator: boolean;
  opponents: SUOpponentView[] | null;
  scores: Array<{ id: string; name: string; color: string; taboo: SUTaboo; strikes: number; catches: number }> | null;
  myTaboo: SUTaboo | null;
  recap: Array<{ culprit: string; catcher: string; text: string; kind: "word" | "action" }> | null;
};

type Props = {
  view: SUView;
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

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function kindLabel(kind: "word" | "action", zh: boolean): string {
  if (kind === "word") return zh ? "禁词" : "WORD";
  return zh ? "禁做" : "ACTION";
}

export default function SlipUpGame({ view, isHost, lang, send }: Props) {
  const zh = lang === "zh";
  if (view.sub === "reveal") return <SUReveal view={view} isHost={isHost} zh={zh} send={send} />;
  return <SUPlay view={view} isHost={isHost} zh={zh} send={send} />;
}

function Header({ zh, right }: { zh: boolean; right?: React.ReactNode }) {
  return (
    <div className="uc-top">
      <span className="uc-badge">🤐 {zh ? "说漏嘴" : "Slip Up"}</span>
      {right}
    </div>
  );
}

function SUPlay({ view, isHost, zh, send }: { view: SUView; isHost: boolean; zh: boolean; send: Props["send"] }) {
  const seconds = useCountdown(view.endsAt);
  const opponents = view.opponents ?? [];
  const [cooldown, setCooldown] = useState<Record<string, number>>({});

  // Flash a banner whenever MY slip count ticks up (someone caught me).
  const prevStrikes = useRef(view.myStrikes);
  const [slipFlash, setSlipFlash] = useState(false);
  useEffect(() => {
    if (view.myStrikes > prevStrikes.current) {
      setSlipFlash(true);
      const t = setTimeout(() => setSlipFlash(false), 2200);
      prevStrikes.current = view.myStrikes;
      return () => clearTimeout(t);
    }
    prevStrikes.current = view.myStrikes;
  }, [view.myStrikes]);

  const catchPlayer = (id: string) => {
    if (view.isSpectator) return;
    const now = Date.now();
    if ((cooldown[id] ?? 0) > now) return;
    setCooldown((c) => ({ ...c, [id]: now + 1600 }));
    send("suCatch", { targetId: id });
  };

  const timer = (
    <span className="uc-round">
      ⏱ {fmt(seconds)} · {zh ? "你被抓" : "your slips"}: {view.myStrikes}
    </span>
  );

  return (
    <main className="center" style={{ maxWidth: 680 }}>
      <section className="result-panel" style={{ display: "flex", flexDirection: "column", gap: 14, position: "relative" }}>
        <Header zh={zh} right={timer} />
        {slipFlash && (
          <div
            style={{
              position: "sticky",
              top: 8,
              zIndex: 5,
              alignSelf: "center",
              padding: "10px 18px",
              borderRadius: 999,
              background: "var(--strong, #e14b4b)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 18,
              boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
              animation: "suSlipPop 0.25s ease-out",
            }}
          >
            😳 {zh ? "你被抓住了！+1" : "You got caught! +1"}
          </div>
        )}
        <p className="uc-status" style={{ textAlign: "center" }}>
          {view.isSpectator
            ? zh
              ? "本局已开始 — 你在旁观，下一局加入吧。"
              : "In progress — you're watching, join next round."
            : zh
              ? "你自己的禁忌牌是隐藏的！别说漏嘴 / 别做出来。下面是其他人的牌 —— 想办法套他们，一说漏就点「抓到！」"
              : "Your own taboo is hidden! Don't say or do it. Below is everyone else's — bait them, then tap Caught! the instant they slip."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {opponents.map((opp) => {
            const onCd = (cooldown[opp.id] ?? 0) > Date.now();
            return (
              <div
                key={opp.id}
                className="tp-reveal-item"
                style={{ display: "flex", alignItems: "center", gap: 12, borderLeft: `5px solid ${opp.color}` }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <strong style={{ color: opp.color }}>{opp.name}</strong>
                    <span className="tp-step-tag">{kindLabel(opp.taboo.kind, zh)}</span>
                    {opp.strikes > 0 && (
                      <span className="tp-step-tag">
                        {zh ? "被抓" : "slips"} ×{opp.strikes}
                      </span>
                    )}
                  </div>
                  <p className="sb-prompt" style={{ fontSize: 24, margin: 0, textAlign: "left" }}>
                    {opp.taboo.kind === "action" ? "🙅 " : "🚫 "}
                    {opp.taboo.text}
                  </p>
                </div>
                <button className="primary small" disabled={onCd || view.isSpectator} onClick={() => catchPlayer(opp.id)}>
                  {zh ? "抓到！" : "Caught!"}
                </button>
              </div>
            );
          })}
          {opponents.length === 0 && (
            <p className="relay-status">{zh ? "等待其他玩家…" : "Waiting for other players…"}</p>
          )}
        </div>

        {isHost && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="secondary small" onClick={() => send("suAddTime")}>
              {zh ? "+60 秒 ⏱" : "+60s ⏱"}
            </button>
            <button className="secondary small" onClick={() => send("suEnd")}>
              {zh ? "结束本局 →" : "End round →"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function SUReveal({ view, isHost, zh, send }: { view: SUView; isHost: boolean; zh: boolean; send: Props["send"] }) {
  const scores = view.scores ?? [];
  const recap = view.recap ?? [];
  const fewest = scores.length ? scores[0].strikes : 0;
  const winners = scores.filter((s) => s.strikes === fewest).map((s) => s.name);

  return (
    <main className="center" style={{ maxWidth: 620 }}>
      <section className="result-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Header zh={zh} right={<span className="uc-round">{zh ? "揭晓" : "Reveal"}</span>} />

        <p className="uc-status" style={{ textAlign: "center" }}>
          🏆 {zh ? "嘴最严的是" : "Tightest lips"}: <strong>{winners.join(" & ")}</strong>
          {` · ${fewest} ${zh ? "次被抓" : fewest === 1 ? "slip" : "slips"}`}
        </p>

        {view.myTaboo && (
          <p className="sb-prompt" style={{ textAlign: "center", fontSize: 18 }}>
            {zh ? "你的禁忌牌是：" : "Your taboo was: "}
            <strong>{view.myTaboo.text}</strong>
            <span className="tp-step-tag" style={{ marginLeft: 8 }}>
              {kindLabel(view.myTaboo.kind, zh)}
            </span>
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {scores.map((s, i) => (
            <div
              key={s.id}
              className="tp-reveal-item"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                borderLeft: `5px solid ${s.color}`,
                ...(i === 0 ? { outline: "3px solid var(--strong)", borderRadius: 8 } : {}),
              }}
            >
              <span className="tp-step-tag" style={i < 3 ? { fontSize: 20 } : undefined}>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ color: s.color }}>{s.name}</strong>
                <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
                  {s.taboo.text}
                </span>
              </div>
              <span className="tp-step-tag">
                {zh ? "被抓" : "slips"} {s.strikes} · {zh ? "抓人" : "catches"} {s.catches}
              </span>
            </div>
          ))}
        </div>

        {recap.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p className="uc-status">{zh ? "精彩回放" : "Slip-up recap"}</p>
            {recap.slice(0, 12).map((r, i) => (
              <p key={i} className="tp-bubble" style={{ fontSize: 14, margin: 0 }}>
                <strong>{r.catcher}</strong>
                {zh ? " 抓到 " : " caught "}
                <strong>{r.culprit}</strong>
                {zh ? " — " : " on "}
                {r.text}
              </p>
            ))}
          </div>
        )}

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
