// Unknown-game healing: rooms persisted under a removed game id fall back
// to a fresh lobby instead of broadcasting a game the client cannot render.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadGameRoom } from "./load-worker.mjs";

const { room } = loadGameRoom();

function makeState(game) {
  return {
    game,
    phase: "playing",
    round: { number: 1 },
    salmonrush: { order: [], piles: {}, tops: {} },
  };
}

describe("healRoomState", () => {
  it("resets a removed game to a fresh lobby and drops its state", () => {
    const state = makeState("salmonrush");
    room.healRoomState(state);
    assert.equal(state.game, "classic");
    assert.equal(state.phase, "lobby");
    assert.equal(state.round, null);
    assert.ok(!("salmonrush" in state));
  });

  it("leaves known games untouched", () => {
    for (const game of ["classic", "telephone", "loveletter", "slipup"]) {
      const state = makeState(game);
      room.healRoomState(state);
      assert.equal(state.game, game);
      assert.equal(state.phase, "playing");
    }
  });
});
