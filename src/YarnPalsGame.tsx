import { MutableRefObject, useEffect, useRef, useState } from "react";

export type YarnSlot = { id: string; name: string; team: 0 | 1; bot: boolean; color: string };

type World = {
  cats: Array<{ x: number; y: number; stun: number; wobble: number }>;
  ball: { x: number; y: number; rot: number };
  a: number;
  b: number;
  t: number;
  over: boolean;
};

type NetMsg =
  | { type: "yarnWorld"; payload: World }
  | { type: "yarnInput"; payload: { playerId: string; x: number; y: number; dash: boolean } };

type Props = {
  teams: YarnSlot[];
  myId: string;
  durationSeconds: number;
  isHost: boolean;
  send: (type: string, payload?: unknown) => void;
  netRef: MutableRefObject<((msg: NetMsg) => void) | null>;
  onPlayAgain: () => void;
  onExit: () => void;
  onQuit: () => void;
};

type Cat = {
  id: string;
  bot: boolean;
  team: 0 | 1;
  color: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  stun: number;
  wobble: number;
  dashCd: number;
};

type RenderCat = { x: number; y: number; color: string; name: string; mine: boolean; stun: boolean; wobble: number };

export default function YarnPalsGame({
  teams,
  myId,
  durationSeconds,
  isHost,
  send,
  netRef,
  onPlayAgain,
  onExit,
  onQuit,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scoreARef = useRef<HTMLSpanElement | null>(null);
  const scoreBRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<HTMLSpanElement | null>(null);
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const joyStickRef = useRef<HTMLDivElement | null>(null);
  const dashRef = useRef<() => void>(() => {});
  const [result, setResult] = useState<{ a: number; b: number } | null>(null);

  const myTeam = teams.find((slot) => slot.id === myId)?.team;
  const pinkNames = teams.filter((slot) => slot.team === 0).map((slot) => slot.name).join(", ");
  const blueNames = teams.filter((slot) => slot.team === 1).map((slot) => slot.name).join(", ");

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvas?.parentElement;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const DPR = window.devicePixelRatio || 1;
    let W = wrap.clientWidth;
    let H = wrap.clientHeight;
    const applySize = () => {
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    applySize();

    const CAT_R = 22;
    const BALL_R = 26;
    const goalW = () => Math.min(240, W * 0.44);
    const maxTether = () => Math.max(120, Math.min(W, H) * 0.34);

    // Shared local input
    const keys: Record<string, boolean> = {};
    const joy = { x: 0, y: 0, active: false };
    let dashQueued = false;
    let alive = true;
    let raf = 0;
    const ink = "#2a2320";

    const readInput = () => {
      let ix = joy.x;
      let iy = joy.y;
      if (keys["w"] || keys["arrowup"]) iy -= 1;
      if (keys["s"] || keys["arrowdown"]) iy += 1;
      if (keys["a"] || keys["arrowleft"]) ix -= 1;
      if (keys["d"] || keys["arrowright"]) ix += 1;
      const mag = Math.hypot(ix, iy);
      if (mag > 1) {
        ix /= mag;
        iy /= mag;
      }
      return { x: ix, y: iy, mag };
    };

    // ---------- drawing (shared) ----------
    const drawGoal = (isTop: boolean) => {
      const left = W / 2 - goalW() / 2;
      const h = Math.min(70, H * 0.12);
      ctx.fillStyle = isTop ? "#FFD6E7" : "#C8E8FF";
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.rect(left, isTop ? 0 : H - h, goalW(), h);
      ctx.fill();
      ctx.stroke();
    };

    const drawTether = (a: RenderCat, b: RenderCat, color: string) => {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.strokeStyle = d > maxTether() ? "#FF3B5C" : color;
      ctx.lineWidth = d > maxTether() ? 6 : 5;
      ctx.lineCap = "round";
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - Math.min(40, d * 0.2);
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const drawScene = (rcats: RenderCat[], ball: { x: number; y: number; rot: number } | null) => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#FFF6E5";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(0,0,0,.05)";
      ctx.lineWidth = 2;
      for (let y = 0; y < H; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      drawGoal(true);
      drawGoal(false);

      if (rcats.length >= 6) {
        drawTether(rcats[0], rcats[1], "#FF8FA3");
        drawTether(rcats[1], rcats[2], "#FF8FA3");
        drawTether(rcats[3], rcats[4], "#8AC6FF");
        drawTether(rcats[4], rcats[5], "#8AC6FF");
      }

      if (ball) {
        ctx.save();
        ctx.translate(ball.x, ball.y);
        ctx.rotate(ball.rot);
        ctx.fillStyle = "#FFF0A8";
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#E8C87A";
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, BALL_R - 6 - i * 7, i * 0.5, i * 0.5 + 4.5);
          ctx.stroke();
        }
        ctx.restore();
      }

      for (const c of rcats) {
        ctx.save();
        ctx.translate(c.x, c.y);
        if (c.stun) ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
        const squish = Math.sin(c.wobble * 0.5) * 0.1;
        ctx.scale(1 + squish, 1 - squish);

        ctx.fillStyle = "rgba(0,0,0,.12)";
        ctx.beginPath();
        ctx.ellipse(0, CAT_R * 0.85, CAT_R * 0.9, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        if (c.mine) {
          ctx.strokeStyle = "rgba(255,214,89,.95)";
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(0, 0, CAT_R + 6, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.lineJoin = "round";
        const ear = (s: number) => {
          ctx.fillStyle = c.color;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(s * 6, -CAT_R * 0.65);
          ctx.lineTo(s * 17, -CAT_R * 1.28);
          ctx.lineTo(s * 20, -CAT_R * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        };
        ear(-1);
        ear(1);

        ctx.fillStyle = c.color;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, CAT_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (c.stun) {
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.4;
          ctx.lineCap = "round";
          const xeye = (ex: number) => {
            ctx.beginPath();
            ctx.moveTo(ex - 3, -5);
            ctx.lineTo(ex + 3, 0);
            ctx.moveTo(ex + 3, -5);
            ctx.lineTo(ex - 3, 0);
            ctx.stroke();
          };
          xeye(-6);
          xeye(6);
        } else {
          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.arc(-6, -2, 2.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(6, -2, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.strokeStyle = ink;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-4, 4);
        ctx.quadraticCurveTo(0, 8.5, 4, 4);
        ctx.stroke();

        ctx.restore();

        ctx.fillStyle = ink;
        ctx.font = c.mine ? "800 13px Fredoka, sans-serif" : "700 12px Fredoka, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(c.mine ? `${c.name} (you)` : c.name, c.x, c.y + CAT_R + 16);
      }
    };

    const updateHud = (a: number, b: number, t: number) => {
      if (scoreARef.current) scoreARef.current.textContent = String(a);
      if (scoreBRef.current) scoreBRef.current.textContent = String(b);
      if (timerRef.current) {
        const s = Math.max(0, Math.floor(t));
        timerRef.current.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      }
    };

    // ---------- controls ----------
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (k === " ") dashQueued = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    dashRef.current = () => {
      dashQueued = true;
    };

    const base = joyBaseRef.current;
    const stick = joyStickRef.current;
    const setJoy = (cx: number, cy: number) => {
      if (!base) return;
      const r = base.getBoundingClientRect();
      let dx = cx - (r.left + r.width / 2);
      let dy = cy - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      const max = 38;
      if (d > max) {
        dx *= max / d;
        dy *= max / d;
      }
      joy.x = dx / max;
      joy.y = dy / max;
      joy.active = true;
      if (stick) stick.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const endJoy = () => {
      joy.x = 0;
      joy.y = 0;
      joy.active = false;
      if (stick) stick.style.transform = "translate(0,0)";
    };
    const onDown = (e: PointerEvent) => {
      base?.setPointerCapture(e.pointerId);
      setJoy(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (joy.active) setJoy(e.clientX, e.clientY);
    };
    base?.addEventListener("pointerdown", onDown);
    base?.addEventListener("pointermove", onMove);
    base?.addEventListener("pointerup", endJoy);
    base?.addEventListener("pointercancel", endJoy);
    const onResize = () => applySize();
    window.addEventListener("resize", onResize);

    // ============================================================
    if (isHost) {
      const startX = [0.35, 0.55, 0.72, 0.65, 0.45, 0.28];
      const cats: Cat[] = teams.map((slot, index) => {
        const isPink = slot.team === 0;
        return {
          id: slot.id,
          bot: slot.bot,
          team: slot.team,
          color: slot.color,
          name: slot.name,
          x: W * startX[index],
          y: H * (isPink ? 0.74 : 0.26),
          vx: 0,
          vy: 0,
          stun: 0,
          wobble: 0,
          dashCd: 0,
        };
      });
      const myIdx = cats.findIndex((c) => c.id === myId);
      const remote: Record<string, { x: number; y: number; dash: boolean; at: number }> = {};

      let ball = { x: W / 2, y: H / 2, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, rot: 0 };
      let scoreA = 0;
      let scoreB = 0;
      let timeLeft = durationSeconds;
      let over = false;
      let last = performance.now();
      let lastSent = 0;
      let nowMs = 0;

      const resetBall = () => {
        const margin = BALL_R * 2.2;
        ball.x = margin + Math.random() * (W - margin * 2);
        ball.y = H * 0.34 + Math.random() * (H * 0.32);
        ball.vx = (Math.random() - 0.5) * 6;
        ball.vy = (Math.random() - 0.5) * 6;
      };

      const dashCat = (c: Cat, dx: number, dy: number) => {
        if (c.dashCd > 0 || c.stun > 0) return;
        c.dashCd = 18;
        let mag = Math.hypot(dx, dy);
        if (mag < 0.2) {
          dx = c.vx;
          dy = c.vy;
          mag = Math.hypot(dx, dy) || 1;
        }
        dx /= mag;
        dy /= mag;
        c.vx += dx * 14;
        c.vy += dy * 14;
        const buddy = cats.find((o) => o !== c && o.team === c.team && Math.hypot(o.x - c.x, o.y - c.y) < 150);
        if (buddy) {
          buddy.vx += dx * 7;
          buddy.vy += dy * 7;
        }
      };

      const applyTether = (a: Cat, b: Cat) => {
        const maxD = maxTether() * 1.4;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d;
        const ny = dy / d;
        if (d > maxD) {
          const pull = (d - maxD) * 0.02 * 18;
          a.vx += nx * pull;
          a.vy += ny * pull;
          b.vx -= nx * pull;
          b.vy -= ny * pull;
          if (d > maxD * 1.5 && a.stun <= 0 && b.stun <= 0) {
            a.stun = 30;
            b.stun = 30;
          }
        }
      };

      netRef.current = (msg) => {
        if (msg.type !== "yarnInput") return;
        remote[msg.payload.playerId] = {
          x: msg.payload.x,
          y: msg.payload.y,
          dash: msg.payload.dash,
          at: nowMs,
        };
      };

      const step = (dt: number) => {
        for (const c of cats) if (c.dashCd > 0) c.dashCd -= dt;

        for (let i = 0; i < cats.length; i++) {
          const c = cats[i];
          if (c.stun > 0) {
            c.stun -= dt;
            continue;
          }
          let controlled = false;
          let ix = 0;
          let iy = 0;
          if (i === myIdx) {
            const input = readInput();
            ix = input.x;
            iy = input.y;
            controlled = true;
            if (dashQueued) {
              dashCat(c, ix, iy);
              dashQueued = false;
            }
          } else if (!c.bot) {
            const ri = remote[c.id];
            if (ri && nowMs - ri.at < 1000) {
              ix = ri.x;
              iy = ri.y;
              controlled = true;
              if (ri.dash) {
                dashCat(c, ix, iy);
                ri.dash = false;
              }
            }
          }

          if (controlled) {
            c.vx += ix * 2.2 * dt;
            c.vy += iy * 2.2 * dt;
            c.wobble += Math.hypot(ix, iy) * 0.4;
          } else {
            // AI: get behind the ball, aim at own goal
            const goalY = c.team === 0 ? 0 : H;
            let tgx = W / 2 - ball.x;
            let tgy = goalY - ball.y;
            const glen = Math.hypot(tgx, tgy) || 1;
            tgx /= glen;
            tgy /= glen;
            const bx = ball.x - tgx * (CAT_R + BALL_R + 12) + (Math.random() - 0.5) * 24;
            const by = ball.y - tgy * (CAT_R + BALL_R + 12) + (Math.random() - 0.5) * 24;
            const dx = bx - c.x;
            const dy = by - c.y;
            const d = Math.hypot(dx, dy) || 1;
            const speed = 0.9 + Math.random() * 0.4;
            if (d > 8) {
              c.vx += (dx / d) * speed * 0.35 * dt;
              c.vy += (dy / d) * speed * 0.35 * dt;
            }
            if (Math.hypot(ball.x - c.x, ball.y - c.y) < 120) {
              c.vx += tgx * 0.25 * dt;
              c.vy += tgy * 0.25 * dt;
            }
            c.wobble += 0.15 * dt;
          }
        }

        for (const c of cats) {
          c.vx *= 0.89;
          c.vy *= 0.89;
          const sp = Math.hypot(c.vx, c.vy);
          if (sp > 8) {
            c.vx *= 8 / sp;
            c.vy *= 8 / sp;
          }
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          if (c.x < CAT_R) {
            c.x = CAT_R;
            c.vx *= -0.5;
          }
          if (c.x > W - CAT_R) {
            c.x = W - CAT_R;
            c.vx *= -0.5;
          }
          if (c.y < CAT_R + 16) {
            c.y = CAT_R + 16;
            c.vy *= -0.5;
          }
          if (c.y > H - CAT_R) {
            c.y = H - CAT_R;
            c.vy *= -0.5;
          }
        }

        ball.vx *= 0.97;
        ball.vy *= 0.97;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        ball.rot += Math.hypot(ball.vx, ball.vy) * 0.05;
        const gL = W / 2 - goalW() / 2;
        const gR = W / 2 + goalW() / 2;
        const topWall = BALL_R + 24;
        const bottomWall = H - BALL_R - 8;
        if (ball.x < BALL_R) {
          ball.x = BALL_R;
          ball.vx = Math.abs(ball.vx) * 0.7;
        }
        if (ball.x > W - BALL_R) {
          ball.x = W - BALL_R;
          ball.vx = -Math.abs(ball.vx) * 0.7;
        }
        if (ball.y < topWall && !(ball.x > gL && ball.x < gR)) {
          ball.y = topWall;
          ball.vy = Math.abs(ball.vy) * 0.7;
        }
        if (ball.y > bottomWall && !(ball.x > gL && ball.x < gR)) {
          ball.y = bottomWall;
          ball.vy = -Math.abs(ball.vy) * 0.7;
        }
        if (ball.y < -BALL_R * 2 || ball.y > H + BALL_R * 2 || ball.x < -BALL_R * 2 || ball.x > W + BALL_R * 2) {
          resetBall();
        }

        for (let i = 0; i < cats.length; i++) {
          for (let j = i + 1; j < cats.length; j++) {
            const a = cats[i];
            const b = cats[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d < CAT_R * 2) {
              const overlap = (CAT_R * 2 - d) / 2;
              const nx = dx / d;
              const ny = dy / d;
              a.x -= nx * overlap;
              a.y -= ny * overlap;
              b.x += nx * overlap;
              b.y += ny * overlap;
              a.vx -= nx * 1.2;
              a.vy -= ny * 1.2;
              b.vx += nx * 1.2;
              b.vy += ny * 1.2;
            }
          }
        }

        for (const c of cats) {
          const dx = ball.x - c.x;
          const dy = ball.y - c.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < CAT_R + BALL_R) {
            const nx = dx / d;
            const ny = dy / d;
            const overlap = CAT_R + BALL_R - d;
            ball.x += nx * overlap * 0.5;
            ball.y += ny * overlap * 0.5;
            c.x -= nx * overlap * 0.3;
            c.y -= ny * overlap * 0.3;
            let pow = 1.8;
            const near = cats.filter((o) => o.team === c.team && Math.hypot(ball.x - o.x, ball.y - o.y) < 90).length;
            if (near >= 2) pow *= 2.4;
            ball.vx += nx * pow;
            ball.vy += ny * pow;
            c.vx -= nx * 0.6;
            c.vy -= ny * 0.6;
          }
        }

        applyTether(cats[0], cats[1]);
        applyTether(cats[1], cats[2]);
        applyTether(cats[3], cats[4]);
        applyTether(cats[4], cats[5]);

        if (ball.y < BALL_R + 24 && ball.x > gL && ball.x < gR) {
          scoreA += 1;
          resetBall();
        }
        if (ball.y > H - BALL_R - 8 && ball.x > gL && ball.x < gR) {
          scoreB += 1;
          resetBall();
        }

        timeLeft -= dt / 60;
      };

      const broadcast = () => {
        const world: World = {
          cats: cats.map((c) => ({ x: c.x / W, y: c.y / H, stun: c.stun > 0 ? 1 : 0, wobble: c.wobble })),
          ball: { x: ball.x / W, y: ball.y / H, rot: ball.rot },
          a: scoreA,
          b: scoreB,
          t: Math.max(0, timeLeft),
          over,
        };
        send("yarnWorld", world);
      };

      const loop = (now: number) => {
        if (!alive) return;
        nowMs = now;
        const dt = Math.min((now - last) / 16.666, 2);
        last = now;
        step(dt);
        const rcats: RenderCat[] = cats.map((c) => ({
          x: c.x,
          y: c.y,
          color: c.color,
          name: c.name,
          mine: c.id === myId,
          stun: c.stun > 0,
          wobble: c.wobble,
        }));
        drawScene(rcats, ball);
        updateHud(scoreA, scoreB, timeLeft);
        if (now - lastSent > 33) {
          lastSent = now;
          broadcast();
        }
        if (timeLeft <= 0) {
          over = true;
          broadcast();
          setResult({ a: scoreA, b: scoreB });
          return;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else {
      // ---------- client: interpolate host's world, send input ----------
      let target: World | null = null;
      let disp: { cats: Array<{ x: number; y: number; wobble: number }>; ball: { x: number; y: number; rot: number } } | null = null;
      let ended = false;
      let lastInput = 0;
      // Ease toward the latest snapshot each frame; snap on big jumps (goal resets).
      const smooth = (d: number, t: number) => (Math.abs(t - d) > 0.25 ? t : d + (t - d) * 0.3);

      netRef.current = (msg) => {
        if (msg.type !== "yarnWorld") return;
        target = msg.payload;
        if (!disp) {
          disp = {
            cats: target.cats.map((c) => ({ x: c.x, y: c.y, wobble: c.wobble })),
            ball: { x: target.ball.x, y: target.ball.y, rot: target.ball.rot },
          };
        }
        if (target.over && !ended) {
          ended = true;
          setResult({ a: target.a, b: target.b });
        }
      };

      const loop = (now: number) => {
        if (!alive) return;
        if (target && disp) {
          const w = target;
          for (let i = 0; i < w.cats.length; i++) {
            const tc = w.cats[i];
            let d = disp.cats[i];
            if (!d) {
              d = { x: tc.x, y: tc.y, wobble: tc.wobble };
              disp.cats[i] = d;
            }
            d.x = smooth(d.x, tc.x);
            d.y = smooth(d.y, tc.y);
            d.wobble += (tc.wobble - d.wobble) * 0.3;
          }
          disp.ball.x = smooth(disp.ball.x, w.ball.x);
          disp.ball.y = smooth(disp.ball.y, w.ball.y);
          disp.ball.rot += (w.ball.rot - disp.ball.rot) * 0.3;
          const rcats: RenderCat[] = teams.map((slot, i) => {
            const dc = disp!.cats[i] ?? { x: 0.5, y: 0.5, wobble: 0 };
            const tc = w.cats[i];
            return {
              x: dc.x * W,
              y: dc.y * H,
              color: slot.color,
              name: slot.name,
              mine: slot.id === myId,
              stun: tc ? tc.stun > 0 : false,
              wobble: dc.wobble,
            };
          });
          drawScene(rcats, { x: disp.ball.x * W, y: disp.ball.y * H, rot: disp.ball.rot });
          updateHud(w.a, w.b, w.t);
        } else {
          drawScene([], null);
        }
        if (!ended && now - lastInput > 45) {
          lastInput = now;
          const input = readInput();
          send("yarnInput", { x: input.x, y: input.y, dash: dashQueued });
          dashQueued = false;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      netRef.current = null;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      base?.removeEventListener("pointerdown", onDown);
      base?.removeEventListener("pointermove", onMove);
      base?.removeEventListener("pointerup", endJoy);
      base?.removeEventListener("pointercancel", endJoy);
    };
  }, [teams, myId, durationSeconds, isHost, send, netRef]);

  const winner =
    result && (result.a === result.b ? "Draw!" : result.a > result.b ? "Pink wins!" : "Blue wins!");

  return (
    <div className="yarn">
      <div className="yarn-hud">
        <div className="yarn-side pink">
          <span className="yarn-dot" style={{ background: "#FF8FA3" }} />
          <span ref={scoreARef} className="yarn-score">
            0
          </span>
        </div>
        <div className="yarn-center">
          <span ref={timerRef} className="yarn-clock">
            02:00
          </span>
          {isHost && (
            <button
              className="yarn-quit"
              onClick={onQuit}
              aria-label="End match and return to lobby"
              title="End match (back to lobby)"
            >
              ✕
            </button>
          )}
        </div>
        <div className="yarn-side blue">
          <span ref={scoreBRef} className="yarn-score">
            0
          </span>
          <span className="yarn-dot" style={{ background: "#8AC6FF" }} />
        </div>
      </div>

      <p className="yarn-hint">
        {myTeam === undefined
          ? "Spectating"
          : `You're on ${myTeam === 0 ? "Pink" : "Blue"} — push the ball into the ${
              myTeam === 0 ? "TOP" : "BOTTOM"
            } goal. Drag the pad / WASD to move, tap DASH / Space to burst.`}
      </p>

      <div className="yarn-stage">
        <canvas ref={canvasRef} className="yarn-canvas" />
        {result && (
          <div className="yarn-over">
            <h1>{winner}</h1>
            <p>
              Pink {result.a} – {result.b} Blue
            </p>
            {isHost ? (
              <div className="yarn-over-actions">
                <button className="primary" onClick={onPlayAgain}>
                  Play again
                </button>
                <button className="secondary" onClick={onExit}>
                  Back to lobby
                </button>
              </div>
            ) : (
              <p className="muted">Waiting for the host…</p>
            )}
          </div>
        )}
      </div>

      <div className="yarn-controls">
        <div ref={joyBaseRef} className="yarn-joy">
          <div ref={joyStickRef} className="yarn-stick" />
        </div>
        <div className="yarn-teams-mini">
          <span className="pink">🩷 {pinkNames}</span>
          <span className="blue">🩵 {blueNames}</span>
        </div>
        <button
          className="yarn-dash"
          onPointerDown={(event) => {
            event.preventDefault();
            dashRef.current();
          }}
        >
          💨
        </button>
      </div>
    </div>
  );
}
