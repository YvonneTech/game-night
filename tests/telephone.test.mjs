// Regression test: Telephone keeps every drawing in the room's single SQLite
// row (~2 MB limit). Coordinates are rounded and each drawing is capped so a
// full 6-player game can never outgrow that row.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadGameRoom } from "./load-worker.mjs";

const { GameRoom } = loadGameRoom();
const MAX_POINTS = 4000;
const SQLITE_ROW_LIMIT = 2 * 1024 * 1024;

// A room whose storage is an in-memory state object, plus sockets that record errors.
function makeRoom(state) {
  const room = new GameRoom({ getWebSockets: () => [] }, {});
  room.load = () => state;
  room.save = () => {};
  room.broadcast = () => {};
  room.schedule = async () => {};
  return room;
}

function socket(playerId) {
  const errors = [];
  return {
    errors,
    deserializeAttachment: () => ({ playerId }),
    send: (raw) => {
      const message = JSON.parse(raw);
      if (message.type === "error") errors.push(message.payload.message);
    },
  };
}

function makeState(playerCount) {
  const ids = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  return {
    game: "telephone",
    phase: "lobby",
    lang: "en",
    players: ids.map((id) => ({ id, name: id.toUpperCase(), connected: true })),
    telephone: null,
    messages: [],
    strokes: [],
  };
}

// Full-precision coordinates, like the client sends, split into 800-point strokes.
function drawing(points) {
  const strokes = [];
  for (let left = points; left > 0; left -= 800) {
    const count = Math.min(800, left);
    strokes.push({
      color: "#15191f",
      width: 6,
      points: Array.from({ length: count }, () => ({ x: 0.1 + Math.random() * 0.8, y: 0.1 + Math.random() * 0.8 })),
    });
  }
  return strokes;
}

function entries(state) {
  return state.telephone.chains.flatMap((chain) => chain.entries);
}

describe("telephone drawing size", () => {
  it("rounds submitted coordinates to 3 decimals", async () => {
    const state = makeState(3);
    const room = makeRoom(state);
    room.startTelephone(state);
    for (const id of ["p0", "p1", "p2"]) await room.tpSubmit(socket(id), "text", { text: `sentence ${id}` });

    await room.tpSubmit(socket("p0"), "draw", {
      strokes: [{ color: "#15191f", width: 6, points: [{ x: 0.123456789, y: 0.987654321 }, { x: 0.5, y: 0.25 }] }],
    });
    const drawn = entries(state).find((entry) => entry.kind === "draw");
    assert.deepEqual(drawn.strokes[0].points, [{ x: 0.123, y: 0.988 }, { x: 0.5, y: 0.25 }]);
  });

  it("rejects a drawing over the point cap with an error and keeps the step open", async () => {
    const state = makeState(3);
    const room = makeRoom(state);
    room.startTelephone(state);
    for (const id of ["p0", "p1", "p2"]) await room.tpSubmit(socket(id), "text", { text: `sentence ${id}` });

    const ws = socket("p0");
    await room.tpSubmit(ws, "draw", { strokes: drawing(MAX_POINTS + 1) });
    assert.equal(ws.errors.length, 1);
    assert.match(ws.errors[0], /too detailed/);
    assert.equal(state.telephone.submitted.p0, undefined);

    // The player can undo a bit and resubmit within the same step.
    await room.tpSubmit(ws, "draw", { strokes: drawing(MAX_POINTS) });
    assert.equal(ws.errors.length, 1);
    assert.equal(state.telephone.submitted.p0, true);
  });

  it("uses the Chinese error message in zh rooms", async () => {
    const state = makeState(3);
    state.lang = "zh";
    const room = makeRoom(state);
    room.startTelephone(state);
    for (const id of ["p0", "p1", "p2"]) await room.tpSubmit(socket(id), "text", { text: `句子 ${id}` });

    const ws = socket("p1");
    await room.tpSubmit(ws, "draw", { strokes: drawing(MAX_POINTS + 1) });
    assert.match(ws.errors[0], /画得太细了/);
  });

  it("keeps a worst-case 6-player game under the SQLite row limit", async () => {
    const state = makeState(6);
    const room = makeRoom(state);
    room.startTelephone(state);

    while (state.telephone.sub !== "reveal") {
      const kind = state.telephone.step % 2 === 0 ? "text" : "draw";
      for (const player of state.players) {
        const payload = kind === "text" ? { text: "x".repeat(200) } : { strokes: drawing(MAX_POINTS) };
        await room.tpSubmit(socket(player.id), kind, payload);
      }
    }

    const drawings = entries(state).filter((entry) => entry.kind === "draw" && !entry.auto);
    assert.equal(drawings.length, 18);
    const bytes = Buffer.byteLength(JSON.stringify(state));
    assert.ok(bytes < SQLITE_ROW_LIMIT, `room state is ${(bytes / 1e6).toFixed(2)} MB`);
  });
});
