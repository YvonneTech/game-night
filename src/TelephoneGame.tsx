import { useCallback, useEffect, useRef, useState } from "react";

type Stroke = {
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
};

type TPKind = "text" | "draw";
type TPEntry = {
  kind: TPKind;
  authorId: string;
  authorName: string;
  text: string;
  strokes: Stroke[];
  auto?: boolean;
};
type TPChain = { ownerId: string; ownerName: string; entries: TPEntry[] };

export type TPView = {
  sub: "write" | "play" | "reveal";
  step: number;
  totalSteps: number;
  kind: TPKind;
  prompt: { kind: TPKind; text: string; strokes: Stroke[] } | null;
  hasSubmitted: boolean;
  isSpectator: boolean;
  submittedCount: number;
  totalPlayers: number;
  reveal: TPChain[] | null;
  revealChain: number;
  revealEntry: number;
};

type Props = {
  view: TPView;
  myId: string;
  isHost: boolean;
  lang: "en" | "zh";
  send: (type: string, payload?: unknown) => void;
};

// A few playful seeds so nobody stares at a blank box.
const SEED_IDEAS: Record<"en" | "zh", string[]> = {
  en: [
    "a cat president signing a law",
    "grandma winning a skateboard contest",
    "a robot afraid of the rain",
    "two penguins arguing over pizza",
    "a dragon who only eats salad",
    "an astronaut who forgot the moon",
    "a shark trying to blow out birthday candles",
    "a wizard stuck in a revolving door",
    "a snail late for its own wedding",
    "a T-rex struggling to floss its teeth",
    "a ghost who's scared of the dark",
    "a cloud that only rains on Mondays",
    "a pigeon running for mayor",
    "a vampire ordering a smoothie at 3am",
    "a knight fighting a rude vending machine",
    "grandpa teaching a robot to knit",
    "a frog writing a five-star restaurant review",
    "a mermaid who never learned to swim",
    "an octopus juggling its own shoes",
    "a bear quietly filing its taxes",
    "a traffic cone that dreams of being a wizard hat",
    "a whale trying to fit into a bathtub",
    "a spider knitting a tiny sweater",
    "a sloth winning the 100m sprint",
    "a penguin sunbathing in the desert",
    "a cactus that just wants a hug",
  ],
  zh: [
    "一只当上总统的猫在签字",
    "奶奶赢了滑板比赛",
    "一个怕下雨的机器人",
    "两只企鹅为披萨吵架",
    "一条只吃沙拉的龙",
    "一个忘了月亮的宇航员",
    "一条想吹生日蜡烛的鲨鱼",
    "卡在旋转门里的巫师",
    "赶不上自己婚礼的蜗牛",
    "一只在认真剔牙的霸王龙",
    "一个怕黑的幽灵",
    "只在星期一下雨的一朵云",
    "在竞选市长的鸽子",
    "凌晨三点点奶昔的吸血鬼",
    "和自动售货机吵架的骑士",
    "在教机器人织毛衣的爷爷",
    "给餐厅写五星好评的青蛙",
    "不会游泳的美人鱼",
    "给自己的鞋子玩杂耍的章鱼",
    "在默默报税的熊",
    "梦想成为巫师帽的路障",
    "想挤进浴缸的鲸鱼",
    "在织小毛衣的蜘蛛",
    "跑赢一百米的树懒",
    "在沙漠里晒日光浴的企鹅",
    "只想要一个拥抱的仙人掌",
  ],
};

export default function TelephoneGame({ view, myId, isHost, lang, send }: Props) {
  const zh = lang === "zh";

  if (view.sub === "reveal") {
    return <TelephoneReveal view={view} myId={myId} isHost={isHost} zh={zh} send={send} />;
  }

  // ---- write / play ----
  const stepLabel = zh ? `第 ${view.step + 1} / ${view.totalSteps} 步` : `Step ${view.step + 1} / ${view.totalSteps}`;
  const waiting = (
    <p className="relay-status">
      {zh
        ? `已提交 ${view.submittedCount}/${view.totalPlayers} · 等待其他人…`
        : `In: ${view.submittedCount}/${view.totalPlayers} · waiting for others…`}
    </p>
  );

  const header = (
    <div className="uc-top">
      <span className="uc-badge">📞 {zh ? "传声画筒" : "Telephone"}</span>
      <span className="uc-round">{stepLabel}</span>
      {isHost && (
        <button className="exit-x" onClick={() => send("reset")} title={zh ? "结束本局" : "End game"}>
          ✕
        </button>
      )}
    </div>
  );

  if (view.isSpectator) {
    return (
      <main className="center">
        <section className="result-panel uc-panel">
          {header}
          <p className="muted">{zh ? "本局已开始 — 你在旁观,下一局加入吧。" : "This round is in progress — you'll join the next one."}</p>
          {waiting}
        </section>
      </main>
    );
  }

  if (view.hasSubmitted) {
    return (
      <main className="center">
        <section className="result-panel uc-panel">
          {header}
          <p className="uc-status">✓ {zh ? "已提交!" : "Submitted!"}</p>
          {waiting}
          {isHost && (
            <button className="secondary small" onClick={() => send("tpSkip")}>
              {zh ? "都好了?进入下一步 →" : "Everyone in? Next step →"}
            </button>
          )}
        </section>
      </main>
    );
  }

  // Seed sentence (step 0).
  if (view.kind === "text" && view.step === 0) {
    return (
      <main className="center">
        <section className="result-panel uc-panel">
          {header}
          <SeedWriter zh={zh} onSubmit={(text) => send("tpText", { text })} />
          {isHost && (
            <button className="secondary small" onClick={() => send("tpSkip")}>
              {zh ? "都写好了?下一步 →" : "Everyone in? Next step →"}
            </button>
          )}
        </section>
      </main>
    );
  }

  // Caption a drawing (draw → text).
  if (view.kind === "text") {
    return (
      <main className="center" style={{ maxWidth: 720 }}>
        <section className="result-panel uc-panel">
          {header}
          <p className="uc-status">{zh ? "这幅画在画什么?写下来!" : "What is this a drawing of? Write it down!"}</p>
          {view.prompt && <StrokeCanvas strokes={view.prompt.strokes} height={320} />}
          <CaptionWriter zh={zh} onSubmit={(text) => send("tpText", { text })} />
          {isHost && (
            <button className="secondary small" onClick={() => send("tpSkip")}>
              {zh ? "都好了?下一步 →" : "Everyone in? Next step →"}
            </button>
          )}
        </section>
      </main>
    );
  }

  // Draw a sentence (text → draw).
  return (
    <main className="center" style={{ maxWidth: 860 }}>
      <section className="result-panel" style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 12 }}>
        {header}
        <div className="uc-word">
          <span>{zh ? "把这句话画出来" : "Draw this sentence"}</span>
          <strong>{view.prompt?.text}</strong>
        </div>
        <TPDrawingBoard
          key={view.step}
          zh={zh}
          onSubmit={(strokes) => send("tpDraw", { strokes })}
        />
        {isHost && (
          <button className="secondary small" onClick={() => send("tpSkip")}>
            {zh ? "都画好了?下一步 →" : "Everyone in? Next step →"}
          </button>
        )}
      </section>
    </main>
  );
}

function SeedWriter({ zh, onSubmit }: { zh: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const ideas = SEED_IDEAS[zh ? "zh" : "en"];
  const surprise = () => setText(ideas[Math.floor(Math.random() * ideas.length)]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className="uc-status">{zh ? "写一句好玩的话 — 下一个人要把它画出来!" : "Write a fun sentence — the next person has to draw it!"}</p>
      <textarea
        className="tp-input"
        value={text}
        maxLength={200}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        placeholder={zh ? "例如:一只当上总统的猫…" : "e.g. a cat who became president…"}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <button className="secondary small" onClick={surprise}>
          {zh ? "🎲 来点灵感" : "🎲 Surprise me"}
        </button>
        <button className="primary" disabled={!text.trim()} onClick={() => onSubmit(text.trim())}>
          {zh ? "提交" : "Submit"}
        </button>
      </div>
    </div>
  );
}

function CaptionWriter({ zh, onSubmit }: { zh: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      style={{ display: "flex", gap: 8, marginTop: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(text.trim());
      }}
    >
      <input
        className="tp-input"
        style={{ flex: 1 }}
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
        placeholder={zh ? "我觉得这是…" : "I think this is…"}
      />
      <button type="submit" className="primary" disabled={!text.trim()}>
        {zh ? "提交" : "Submit"}
      </button>
    </form>
  );
}

function TelephoneReveal({
  view,
  myId,
  isHost,
  zh,
  send,
}: {
  view: TPView;
  myId: string;
  isHost: boolean;
  zh: boolean;
  send: (type: string, payload?: unknown) => void;
}) {
  const chains = view.reveal ?? [];
  const ci = Math.max(0, Math.min(chains.length - 1, view.revealChain));
  const chain = chains[ci];
  const shown = view.revealEntry; // reveal entries 0..shown
  const atChainEnd = shown >= view.totalSteps - 1;
  const atFirst = ci === 0 && shown === 0;

  const goto = (chainIndex: number, entry: number) => send("tpReveal", { chain: chainIndex, entry });
  const next = () => {
    if (!atChainEnd) goto(ci, shown + 1);
    else if (ci < chains.length - 1) goto(ci + 1, 0);
  };
  const prev = () => {
    if (shown > 0) goto(ci, shown - 1);
    else if (ci > 0) goto(ci - 1, view.totalSteps - 1);
  };
  const atVeryEnd = ci === chains.length - 1 && atChainEnd;

  return (
    <main className="center" style={{ maxWidth: 760 }}>
      <section className="result-panel" style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="uc-top">
          <span className="uc-badge">📞 {zh ? "结果回放" : "Reveal"}</span>
          <span className="uc-round">
            {zh ? "线索" : "Story"} {ci + 1}/{chains.length}
          </span>
          {isHost && (
            <button className="exit-x" onClick={() => send("reset")} title={zh ? "结束本局" : "End game"}>
              ✕
            </button>
          )}
        </div>

        <div className="tp-chain-tabs">
          {chains.map((c, i) => (
            <button
              key={c.ownerId}
              className={i === ci ? "chip active" : "chip"}
              disabled={!isHost}
              onClick={() => goto(i, 0)}
            >
              {c.ownerName}
              {c.ownerId === myId ? (zh ? " (你)" : " (you)") : ""}
            </button>
          ))}
        </div>

        <p className="uc-status">
          {zh
            ? `${chain?.ownerName} 的线索 — 看看它是从哪一步开始跑偏的!`
            : `${chain?.ownerName}'s chain — spot where it went off the rails!`}
        </p>

        <div className="tp-reveal-list">
          {chain?.entries.slice(0, shown + 1).map((entry, idx) => (
            <div key={idx} className="tp-reveal-item">
              <span className="tp-step-tag">
                {idx === 0 ? (zh ? "开头" : "Seed") : `${zh ? "第" : "#"}${idx + 1}`} · {entry.authorName}
                {entry.auto ? (zh ? " · 跳过" : " · skipped") : ""}
              </span>
              {entry.kind === "text" ? (
                <p className={`tp-bubble ${entry.auto ? "auto" : ""}`}>{entry.text}</p>
              ) : entry.strokes.length ? (
                <StrokeCanvas strokes={entry.strokes} height={300} />
              ) : (
                <p className="tp-bubble auto">{zh ? "(没画)" : "(no drawing)"}</p>
              )}
            </div>
          ))}
        </div>

        {isHost ? (
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
            <button className="secondary small" disabled={atFirst} onClick={prev}>
              {zh ? "← 上一步" : "← Back"}
            </button>
            {atVeryEnd ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="secondary small" onClick={() => send("start")}>
                  {zh ? "再来一局" : "Play again"}
                </button>
                <button className="primary small" onClick={() => send("reset")}>
                  {zh ? "回到大厅" : "Lobby"}
                </button>
              </div>
            ) : (
              <button className="primary" onClick={next}>
                {atChainEnd ? (zh ? "下一条线索 →" : "Next story →") : zh ? "揭示下一步 →" : "Reveal next →"}
              </button>
            )}
          </div>
        ) : (
          <p className="muted">{zh ? "房主带着大家看回放…" : "Host is walking everyone through it…"}</p>
        )}
      </section>
    </main>
  );
}

// Read-only playback of a set of normalized strokes.
function StrokeCanvas({ strokes, height }: { strokes: Stroke[]; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
      if (!stroke.points.length) continue;
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
    }
  }, [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      canvas.width = Math.max(280, parent?.clientWidth ?? 600);
      canvas.height = window.innerWidth <= 680 ? Math.round(height * 0.8) : height;
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
  }, [draw, height]);

  useEffect(() => draw(), [draw]);

  return (
    <div className="tp-canvas-wrap">
      <canvas ref={canvasRef} />
    </div>
  );
}

// Local drawing board that keeps strokes client-side until the player submits.
function TPDrawingBoard({ zh, onSubmit }: { zh: boolean; onSubmit: (strokes: Stroke[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const drawingRef = useRef(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
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
      canvas.width = Math.max(320, parent?.clientWidth ?? 760);
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
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }
  function startStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    pointsRef.current = [point(event)];
    draw();
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    pointsRef.current = [...pointsRef.current, point(event)];
    draw();
  }
  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const points = pointsRef.current;
    pointsRef.current = [];
    if (points.length) setStrokes((prev) => [...prev, { color, width, points }]);
  }

  return (
    <div className="board" style={{ border: "3px solid var(--strong)", borderRadius: 8, overflow: "hidden" }}>
      <div className="tools">
        <div>
          {["#15191f", "#e0576f", "#4f7cff", "#18a67d", "#f4c542"].map((item) => (
            <button
              key={item}
              className={item === color ? "tool-color active" : "tool-color"}
              style={{ background: item }}
              onClick={() => setColor(item)}
            />
          ))}
        </div>
        <div>
          {[4, 8, 14].map((item) => (
            <button
              key={item}
              className={item === width ? "tool-size active" : "tool-size"}
              onClick={() => setWidth(item)}
            >
              {item}
            </button>
          ))}
          <button className="secondary small" disabled={!strokes.length} onClick={() => setStrokes((p) => p.slice(0, -1))}>
            {zh ? "撤销" : "Undo"}
          </button>
          <button className="secondary small" disabled={!strokes.length} onClick={() => setStrokes([])}>
            {zh ? "清空" : "Clear"}
          </button>
          <button className="primary small pass-btn" disabled={!strokes.length} onClick={() => onSubmit(strokes)}>
            {zh ? "提交 →" : "Submit →"}
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} onPointerDown={startStroke} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
    </div>
  );
}
