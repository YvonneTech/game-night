// Regression test: the fake artist must not receive the secret word until the
// reveal. The client only hides it visually, so the server must blank it.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadGameRoom } from "./load-worker.mjs";

const { room } = loadGameRoom();

function makeState(sub, phase = "playing") {
  return {
    game: "fakeartist",
    phase,
    lang: "en",
    players: [
      { id: "real", name: "Real", connected: true },
      { id: "fake", name: "Fake", connected: true },
    ],
    fakeartist: {
      sub,
      word: "dragon",
      category: "Fantasy",
      fakeIds: ["fake"],
      order: ["real", "fake"],
      laps: 2,
      turnIndex: 0,
      turnStartedAt: Date.now(),
      turnSeconds: 20,
      turnStrokeStart: 0,
      votes: {},
      candidates: [],
      eliminated: null,
      result: null,
    },
  };
}

describe("faView word redaction", () => {
  it("hides the word from the fake during draw, shows it to real painters", () => {
    const state = makeState("draw");
    const fakeView = room.faView(state, "fake");
    const realView = room.faView(state, "real");
    assert.equal(fakeView.isFake, true);
    assert.equal(fakeView.word, "");
    assert.equal(fakeView.category, "Fantasy");
    assert.equal(realView.isFake, false);
    assert.equal(realView.word, "dragon");
  });

  it("hides the word from the fake during voting", () => {
    const state = makeState("vote");
    assert.equal(room.faView(state, "fake").word, "");
    assert.equal(room.faView(state, "real").word, "dragon");
  });

  it("reveals the word to everyone once votes are tallied", () => {
    const state = makeState("reveal");
    assert.equal(room.faView(state, "fake").word, "dragon");
    assert.equal(room.faView(state, "real").word, "dragon");
  });

  it("still publishes roles at game end", () => {
    const state = makeState("reveal", "gameEnd");
    const view = room.faView(state, "fake");
    assert.ok(view.reveal);
    assert.deepEqual(
      view.reveal.map((r) => r.role).sort(),
      ["civ", "spy"],
    );
  });

  it("shows the word to the fake when the game ends early mid-round", () => {
    const state = makeState("draw", "gameEnd");
    assert.equal(room.faView(state, "fake").word, "dragon");
  });
});

function makeLiveState(sub, ids = ["a", "b", "c", "d"], fakeIds = ["d"]) {
  return {
    code: "TEST",
    phase: "playing",
    players: ids.map((id, i) => ({
      id,
      name: id.toUpperCase(),
      color: "#000000",
      score: 0,
      host: i === 0,
      connected: true,
      guessed: false,
      roundPoints: 0,
    })),
    game: "fakeartist",
    lang: "en",
    mode: "pictionary",
    rounds: 5,
    round: null,
    yarn: null,
    undercover: null,
    wavelength: null,
    fakeartist: {
      sub,
      word: "dragon",
      category: "Fantasy",
      fakeIds: [...fakeIds],
      order: [...ids],
      laps: 2,
      turnIndex: 0,
      turnStartedAt: Date.now(),
      turnSeconds: 20,
      turnStrokeStart: 0,
      votes: {},
      candidates: [],
      eliminated: null,
      result: null,
    },
    telephone: null,
    punchline: null,
    balderdash: null,
    slipup: null,
    solved: 0,
    messages: [],
    strokes: [],
    emptyAt: 0,
    telephoneInspirationCursor: 0,
    telephoneInspirationOffset: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("fakeartist removePlayer", () => {
  it("ends the round when the last fake leaves mid-draw (no compromised replacement)", async () => {
    const state = makeLiveState("draw");
    await room.removePlayer(state, "d");
    assert.equal(state.phase, "gameEnd");
    assert.equal(state.fakeartist.result, "civ");
    assert.deepEqual(state.fakeartist.fakeIds, []);
  });

  it("ends the round when the last fake leaves mid-vote", async () => {
    const state = makeLiveState("vote");
    await room.removePlayer(state, "d");
    assert.equal(state.phase, "gameEnd");
    assert.equal(state.fakeartist.result, "civ");
    assert.deepEqual(state.fakeartist.fakeIds, []);
  });

  it("leaves a decided round alone when the fake departs after tally", async () => {
    const state = makeLiveState("reveal");
    state.fakeartist.result = "spy";
    state.fakeartist.eliminated = { id: "a", name: "A", role: "civ", word: "dragon" };
    await room.removePlayer(state, "d");
    assert.equal(state.phase, "playing");
    assert.equal(state.fakeartist.result, "spy");
    assert.deepEqual(state.fakeartist.fakeIds, []);
  });

  it("keeps playing when a real painter leaves", async () => {
    const state = makeLiveState("draw");
    await room.removePlayer(state, "b");
    assert.equal(state.phase, "playing");
    assert.deepEqual(state.fakeartist.fakeIds, ["d"]);
    assert.deepEqual(state.fakeartist.order, ["a", "c", "d"]);
  });

  it("still ends when fewer than three players remain", async () => {
    const state = makeLiveState("draw", ["a", "b", "c"], ["c"]);
    await room.removePlayer(state, "b");
    assert.equal(state.phase, "gameEnd");
    assert.equal(state.fakeartist.result, "civ");
  });
});
