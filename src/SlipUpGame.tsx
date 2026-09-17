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
  const [showRecap, setShowRecap] = useState(false);
  const fewest = scores.length ? scores[0].strikes : 0;
  const winners = scores.filter((s) => s.strikes === fewest).map((s) => s.name);

  const top = scores.slice(0, 3);
  const rest = scores.slice(3);
  // Visual order on the podium: 2nd, 1st, 3rd. Gold tallest.
  const podium = [
    { s: top[1], place: 2, medal: "🥈", h: 70 },
    { s: top[0], place: 1, medal: "🥇", h: 98 },
    { s: top[2], place: 3, medal: "🥉", h: 50 },
  ].filter((p) => p.s);

  return (
    <main className="center" style={{ maxWidth: 560 }}>
      <section className="result-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Header zh={zh} right={<span className="uc-round">{zh ? "揭晓" : "Reveal"}</span>} />

        <p className="uc-status" style={{ textAlign: "center", margin: 0 }}>
          🏆 <strong>{winners.join(" & ")}</strong>
          {` · ${fewest} ${zh ? "次被抓" : fewest === 1 ? "slip" : "slips"}`}
        </p>

        {/* Podium for the top 3 */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 8 }}>
          {podium.map(({ s, place, medal, h }) => (
            <div
              key={s.id}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 108, minWidth: 0 }}
            >
              <span style={{ fontSize: place === 1 ? 36 : 28, lineHeight: 1 }}>{medal}</span>
              <strong
                style={{
                  color: s.color,
                  fontSize: place === 1 ? 16 : 14,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.name}
              </strong>
              <span
                className="muted"
                style={{
                  fontSize: 11,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.taboo.text}
              </span>
              <span className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                😳 {s.strikes} · 🎯 {s.catches}
              </span>
              <div
                style={{
                  width: "100%",
                  height: h,
                  marginTop: 2,
                  borderRadius: "8px 8px 0 0",
                  background: `linear-gradient(${s.color}, ${s.color})`,
                  opacity: 0.92,
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  paddingTop: 6,
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: place === 1 ? 22 : 18,
                  textShadow: "0 1px 3px rgba(0,0,0,0.4)",
                  boxShadow: place === 1 ? "0 0 0 2px var(--strong) inset" : "none",
                }}
              >
                {place}
              </div>
            </div>
          ))}
        </div>

        {rest.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rest.map((s, i) => (
              <div
                key={s.id}
                className="tp-reveal-item"
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderLeft: `4px solid ${s.color}`,
                }}
              >
                <span style={{ fontSize: 14, width: 28, textAlign: "center", flexShrink: 0 }}>{i + 4}.</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong
                    style={{
                      color: s.color,
                      fontSize: 16,
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.name}
                  </strong>
                  <span className="muted" style={{ fontSize: 12 }}>{s.taboo.text}</span>
                </div>
                <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap", flexShrink: 0 }}>
                  😳 {s.strikes} · 🎯 {s.catches}
                </span>
              </div>
            ))}
          </div>
        )}

        {recap.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <button
              className="secondary small"
              onClick={() => setShowRecap((v) => !v)}
              style={{ alignSelf: "flex-start" }}
            >
              {showRecap
                ? zh
                  ? "隐藏精彩回放 ▲"
                  : "Hide recap ▲"
                : zh
                  ? `精彩回放 (${recap.length}) ▼`
                  : `Slip-up recap (${recap.length}) ▼`}
            </button>
            {showRecap && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 240, overflowY: "auto" }}>
                {recap.map((r, i) => (
                  <p key={i} className="tp-bubble" style={{ fontSize: 13, margin: 0 }}>
                    <strong>{r.catcher}</strong>
                    {zh ? " 抓到 " : " caught "}
                    <strong>{r.culprit}</strong>
                    {zh ? " — " : " on "}
                    {r.text}
                  </p>
                ))}
              </div>
            )}
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
