import { useCallback, useEffect, useRef, useState } from "react";

type Stroke = {
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
};

export type FAView = {
  sub: "draw" | "vote" | "reveal";
  word: string;
  category: string;
  isFake: boolean;
  fakeCount: number;
  order: string[];
  laps: number;
  turnIndex: number;
  totalTurns: number;
  currentId: string;
  currentName: string;
  turnTimeLeft: number;
  turnSeconds: number;
  turnStrokeStart: number;
  youDraw: boolean;
  youVote: boolean;
  hasVoted: boolean;
  candidates: string[];
  members: Array<{ id: string; name: string; connected: boolean; voted: boolean }>;
  eliminated: { name: string } | null;
  result: "civ" | "spy" | null;
  reveal: Array<{ name: string; role: "civ" | "spy"; word: string }> | null;
};

type Props = {
  view: FAView;
  myId: string;
  strokes: Stroke[];
  isHost: boolean;
  lang: "en" | "zh";
  send: (type: string, payload?: unknown) => void;
};

export default function FakeArtistGame({ view, myId, strokes, isHost, lang, send }: Props) {
  const zh = lang === "zh";
  const [turnLeft, setTurnLeft] = useState(view.turnTimeLeft);

  useEffect(() => {
    setTurnLeft(view.turnTimeLeft);
    if (view.sub !== "draw") return;
    const timer = window.setInterval(() => {
      setTurnLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [view.sub, view.turnIndex, view.turnTimeLeft]);

  // Update local countdown smoothly using server snapshot drift
  useEffect(() => {
    setTurnLeft(view.turnTimeLeft);
  }, [view.turnTimeLeft]);

  if (view.sub === "vote") {
    return (
      <main className="center">
        <section className="result-panel uc-panel">
          <div className="uc-top">
            <span className="uc-badge">
              🎨 {zh ? `假画家 · ${view.fakeCount} 个` : `Fake Artist · ${view.fakeCount} fake${view.fakeCount > 1 ? "s" : ""}`}
            </span>
            <span className="uc-round">{zh ? "投票" : "Vote"}</span>
            {isHost && (
              <button className="exit-x" onClick={() => send("reset")} title={zh ? "结束本局" : "End game"}>
                ✕
              </button>
            )}
          </div>

          <div className="uc-word">
            <span>{zh ? "本轮关键词" : "Secret word"}</span>
            <strong style={{ filter: view.isFake ? "blur(4px)" : undefined }}>
              {view.isFake ? (zh ? "你是假画家!" : "You are FAKE!") : view.word}
            </strong>
            <small style={{ color: "var(--muted)", fontWeight: 700 }}>{zh ? `类别：${view.category}` : `Category: ${view.category}`}</small>
            {view.isFake && <small style={{ color: "var(--rose)", fontWeight: 800 }}>{zh ? "类别可见，词隐藏 — 装得像一点!" : "You see category only — blend in!"}</small>}
          </div>

          <p className="uc-status">
            {view.candidates.length
              ? zh
                ? "平票!在候选人里重新投票"
                : "Tie! Re-vote among the tied players"
              : zh
                ? "投票选出你认为的假画家"
                : "Vote who you think is the fake artist"}
          </p>
          <div className="uc-vote-grid">
            {view.members
              .filter((m) => m.id !== myId)
              .map((m) => {
                const votable = view.youVote && (view.candidates.length === 0 || view.candidates.includes(m.id));
                return (
                  <button
                    key={m.id}
                    className="uc-vote-btn"
                    disabled={!votable}
                    onClick={() => send("faVote", { targetId: m.id })}
                  >
                    <span>{m.name}</span>
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
                  : zh
                    ? "等待投票…"
                    : "Waiting…"}
            </p>
          )}
          {isHost && (
            <button className="secondary small" onClick={() => send("faTally")}>
              {zh ? "立即计票" : "Tally now"}
            </button>
          )}
        </section>
      </main>
    );
  }

  if (view.sub === "reveal") {
    return (
      <main className="center">
        <section className="result-panel uc-panel">
          <div className="uc-top">
            <span className="uc-badge">🎨 {zh ? "结果" : "Reveal"}</span>
            <span className="uc-round">{view.eliminated ? `${view.eliminated.name} ${zh ? "出局" : "out"}` : ""}</span>
            {isHost && (
              <button className="exit-x" onClick={() => send("reset")} title={zh ? "结束本局" : "End game"}>
                ✕
              </button>
            )}
          </div>
          <div className="uc-reveal">
            <h2>
              {view.eliminated?.name} {zh ? "被投出" : "was voted out"}
            </h2>
            <p>
              {view.result === "civ"
                ? zh
                  ? "真画家们抓到了假画家! 🎉"
                  : "Real painters caught the fake! 🎉"
                : zh
                  ? "假画家躲过一劫! 🕵️"
                  : "Fake artist survived! 🕵️"}
            </p>
            <p className="muted">{zh ? "词是" : "Word was"}: <strong>{view.word}</strong> · {zh ? "类别" : "Category"}: {view.category}</p>
          </div>
          {isHost ? (
            <button className="primary" onClick={() => send("faProceed")}>
              {zh ? "查看结果" : "See result"}
            </button>
          ) : (
            <p className="muted">{zh ? "等待房主…" : "Waiting for host…"}</p>
          )}
        </section>
      </main>
    );
  }

  // draw
  const progress = `${view.turnIndex + 1} / ${view.totalTurns}`;
  const roundInfo = zh ? `第 ${Math.floor(view.turnIndex / view.order.length) + 1} 轮 · ${progress}` : `Lap ${Math.floor(view.turnIndex / view.order.length) + 1} · ${progress}`;

  return (
    <main className="center" style={{ maxWidth: 860 }}>
      <section className="result-panel" style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="uc-top">
          <span className="uc-badge">
            🎨 {zh ? `假画家 · 类别「${view.category}」` : `Fake Artist · "${view.category}"`}
          </span>
          <span className="uc-round">
            {roundInfo} · <span className={turnLeft <= 5 ? "turn-timer low" : "turn-timer"}>{turnLeft}s</span>
          </span>
          {isHost && (
            <button className="exit-x" onClick={() => send("reset")} title={zh ? "结束本局" : "End game"}>
              ✕
            </button>
          )}
        </div>

        <div className="uc-word">
          <span>{zh ? (view.isFake ? "你的身份" : "你的词") : view.isFake ? "Your role" : "Your word"}</span>
          {view.isFake ? (
            <>
              <strong style={{ color: "var(--rose)" }}>{zh ? "你是假画家!" : "You are the FAKE ARTIST!"}</strong>
              <small style={{ color: "var(--muted)", fontWeight: 700 }}>
                {zh ? `只知道类别「${view.category}」· 看大家画什么,别露馅` : `Category is "${view.category}" only — watch and blend in`}
              </small>
            </>
          ) : (
            <>
              <strong>{view.word}</strong>
              <small style={{ color: "var(--muted)", fontWeight: 700 }}>{zh ? `类别：${view.category}` : `Category: ${view.category}`}</small>
            </>
          )}
        </div>

        <div className="relay-strip" style={{ marginBottom: 0 }}>
          {view.order.map((id, idx) => {
            const totalOrder = view.order;
            const isCurrent = id === view.currentId;
            const turnPos = view.turnIndex % totalOrder.length;
            // Determine if this player's turn is done in current lap or previous laps
            const lapsDone = Math.floor(view.turnIndex / totalOrder.length);
            const isPastLap = lapsDone > 0;
            const idxDone = idx < turnPos || (lapsDone === 1 && view.turnIndex >= totalOrder.length);
            // For display: done if this slot's index < current turnPos in final lap handling
            const m = view.members.find((mm) => mm.id === id);
            const name = m?.name ?? id.slice(0, 4);
            const classes = ["relay-slot"];
            if (isCurrent) classes.push("current");
            if (isPastLap || idxDone) classes.push("done");
            return (
              <div key={id} className={classes.join(" ")}>
                <span className="relay-index">{idx + 1}</span>
                <span className="relay-name">
                  {name}
                  {id === myId ? (zh ? " (你)" : " (you)") : ""}
                  {view.isFake && view.fakeCount === 1 && false ? "" : ""}
                </span>
                {isCurrent && <span className="relay-count">{turnLeft}s</span>}
                {isCurrent && <span className="relay-tag">{zh ? "正在画" : "drawing"}</span>}
              </div>
            );
          })}
          <span className="relay-tag" style={{ marginLeft: "auto" }}>{zh ? `共${view.order.length * view.laps}轮，每人${FA_LAPS}次` : `${view.order.length * view.laps} turns · ${FA_LAPS} strokes each`}</span>
        </div>

        <p className="relay-status">
          {view.youDraw
            ? zh
              ? "✏️ 轮到你 — 画一笔后点“完成”!"
              : "✏️ Your turn — draw one stroke then Done!"
            : zh
              ? `👀 ${view.currentName} 正在画…`
              : `👀 ${view.currentName} is drawing…`}
        </p>

        <FADrawingBoard
          disabled={!view.youDraw}
          strokes={strokes}
          minStrokes={view.turnStrokeStart}
          onChange={(next) => send("draw", { strokes: next })}
          onPass={() => send("faPass")}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <small className="muted">
            {zh
              ? `真画家有词,假画家只有类别 · 观察笔画,别被发现!`
              : `Real artists see the word, fake sees only category — spot the fakes in voting!`}
          </small>
        </div>
      </section>
    </main>
  );
}

const FA_LAPS = 2;

function FADrawingBoard({
  disabled,
  strokes,
  onChange,
  minStrokes = 0,
  onPass,
}: {
  disabled: boolean;
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
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
      const cssWidth = Math.max(320, parent?.clientWidth ?? 760);
      canvas.width = cssWidth;
      canvas.height = window.innerWidth <= 680 ? 300 : 400;
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
    <div className="board" style={{ border: "3px solid var(--strong)", borderRadius: 8, overflow: "hidden" }}>
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
          <button className="primary small pass-btn" disabled={disabled} onClick={() => onPass?.()}>
            Done, pass →
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
    </div>
  );
}
