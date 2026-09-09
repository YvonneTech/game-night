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
  inspirationIndex: number | null;
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

// Inspiration gives players building blocks, never a ready-made answer.
const INSPIRATION: Record<"en" | "zh", { characters: string[]; settings: string[]; twists: string[] }> = {
  en: {
    characters: [
      "a sleepy dragon", "a clumsy astronaut", "a detective penguin", "a nervous vampire",
      "a superhero cat", "a forgetful wizard", "a musical shark", "an ambitious snail",
      "a tiny dinosaur", "a dramatic ghost", "a robot grandparent", "a polite monster",
      "a mermaid", "an octopus", "a bear", "a pigeon", "a frog", "a cactus",
    ],
    settings: [
      "at a wedding", "in a supermarket", "on the moon", "during a talent show",
      "on a first date", "at the airport", "in a haunted library", "during a cooking contest",
      "at school", "on a pirate ship", "inside a video game", "at a birthday party",
      "on a roller coaster", "in a tiny kitchen", "at the beach", "during a snowstorm",
      "in a museum", "on live television",
    ],
    twists: [
      "while hiding a secret", "with one hand tied", "but everything is upside down", "during a power outage",
      "while being chased", "without making a sound", "with a ridiculous disguise", "while running late",
      "but nobody believes them", "with an unexpected sidekick", "while pretending to be famous", "in zero gravity",
      "with the wrong instructions", "during a surprise party", "while carrying something enormous", "but time is running backward",
      "with a tiny umbrella", "while everyone else is asleep",
    ],
  },
  zh: {
    characters: [
      "一条困倦的龙", "一个笨手笨脚的宇航员", "一只侦探企鹅", "一个紧张的吸血鬼",
      "一只超级英雄猫", "一个健忘的巫师", "一条会唱歌的鲨鱼", "一只野心勃勃的蜗牛",
      "一只迷你恐龙", "一个戏很多的幽灵", "一个机器人爷爷", "一只礼貌的怪兽",
      "一条美人鱼", "一只章鱼", "一头熊", "一只鸽子", "一只青蛙", "一棵仙人掌",
    ],
    settings: [
      "在婚礼上", "在超市里", "在月球上", "在才艺比赛中",
      "第一次约会时", "在机场", "在闹鬼的图书馆", "在厨艺大赛中",
      "在学校里", "在海盗船上", "在电子游戏里", "在生日派对上",
      "在过山车上", "在迷你厨房里", "在海边", "在暴风雪中",
      "在博物馆里", "在电视直播中",
    ],
    twists: [
      "同时藏着一个秘密", "一只手被绑住了", "但所有东西都颠倒了", "突然停电了",
      "同时正被追赶", "还不能发出声音", "穿着离谱的伪装", "眼看就要迟到了",
      "但没有人相信", "身边多了个意外搭档", "还要假装自己是明星", "却处于失重状态",
      "拿到了一份错误说明书", "正好遇上惊喜派对", "还扛着一个巨大的东西", "但时间正在倒流",
      "只带着一把迷你雨伞", "而其他人都睡着了",
    ],
  },
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
          <SeedWriter
            zh={zh}
            inspirationIndex={view.inspirationIndex}
            onInspire={() => send("tpInspire")}
            onSubmit={(text) => send("tpText", { text })}
          />
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
      </section>
    </main>
  );
}

function SeedWriter({
  zh,
  inspirationIndex,
  onInspire,
  onSubmit,
}: {
  zh: boolean;
  inspirationIndex: number | null;
  onInspire: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const ideas = INSPIRATION[zh ? "zh" : "en"];
  const inspiration = inspirationIndex === null
    ? null
    : {
        character: ideas.characters[inspirationIndex % ideas.characters.length],
        setting: ideas.settings[Math.floor(inspirationIndex / ideas.characters.length) % ideas.settings.length],
        twist: ideas.twists[
          Math.floor(inspirationIndex / (ideas.characters.length * ideas.settings.length)) % ideas.twists.length
        ],
      };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className="uc-status">{zh ? "写一句好玩的话 — 下一个人要把它画出来!" : "Write a fun sentence — the next person has to draw it!"}</p>
      <p className="tp-writing-tip">
        {zh ? "小提示：一个角色 + 一个动作 + 一个意外细节，越具体越好画。" : "Tip: one character + one action + one surprising detail is easiest to draw."}
      </p>
      {inspiration && (
        <div className="tp-inspiration" aria-live="polite">
          <span>{zh ? "试试把这三个灵感组合起来" : "Try combining these three prompts"}</span>
          <strong>{inspiration.character} · {inspiration.setting} · {inspiration.twist}</strong>
          <small>{zh ? "动作和完整故事仍由你来决定。" : "You still choose the action and complete story."}</small>
        </div>
      )}
      <textarea
        className="tp-input"
        value={text}
        maxLength={200}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        placeholder={zh ? "谁在什么地方做什么?" : "Who is doing what, and where?"}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <button type="button" className="secondary small" onClick={onInspire}>
          {inspiration ? (zh ? "🎲 换一组灵感" : "🎲 New inspiration") : (zh ? "💡 需要灵感?" : "💡 Need inspiration?")}
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
            {chain?.ownerName}
            {chain?.ownerId === myId ? (zh ? "（你）" : " (you)") : ""} · {ci + 1}/{chains.length}
          </span>
        </div>

        <p className="uc-status">
          {zh
            ? "看看这条线索是从哪一步开始跑偏的！"
            : "Spot where this chain went off the rails!"}
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
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const activeColor = tool === "eraser" ? "#ffffff" : color;
  const activeWidth = tool === "eraser" ? 18 : 6;

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
    if (pointsRef.current.length) renderStroke({ color: activeColor, width: activeWidth, points: pointsRef.current });
  }, [activeColor, activeWidth, strokes]);

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
    if (tool === "eraser" && strokes.length === 0) return;
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
    if (points.length) setStrokes((prev) => [...prev, { color: activeColor, width: activeWidth, points }]);
  }

  return (
    <div className="board" style={{ border: "3px solid var(--strong)", borderRadius: 8, overflow: "hidden" }}>
      <div className="tools">
        <div>
          {["#15191f", "#e0576f", "#4f7cff", "#18a67d", "#f4c542"].map((item) => (
            <button
              key={item}
              className={tool === "pen" && item === color ? "tool-color active" : "tool-color"}
              style={{ background: item }}
              onClick={() => {
                setColor(item);
                setTool("pen");
              }}
            />
          ))}
          <button
            className={tool === "eraser" ? "tool-color eraser-tool active" : "tool-color eraser-tool"}
            disabled={!strokes.length}
            onClick={() => setTool("eraser")}
            aria-label={zh ? "橡皮" : "Eraser"}
            title={zh ? "橡皮" : "Eraser"}
          >
            🧽
          </button>
        </div>
        <div>
          <button className="secondary small" disabled={!strokes.length} onClick={() => setStrokes((p) => p.slice(0, -1))}>
            {zh ? "撤销" : "Undo"}
          </button>
          <button
            className="secondary small"
            disabled={!strokes.length}
            onClick={() => {
              setStrokes([]);
              setTool("pen");
            }}
          >
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
