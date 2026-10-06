// Love Letter lite: hidden-hand redaction plus card-power resolution and the
// first-to-3-tokens game end. Exercises llApplyPlay/llView directly with
// hand-built state, mirroring tests/undercover.test.mjs.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadGameRoom } from "./load-worker.mjs";

const { room } = loadGameRoom();

const IDS = ["a", "b", "c"];

function makeState(overrides = {}) {
  return {
    game: "loveletter",
    phase: "playing",
    lang: "en",
    players: IDS.map((id) => ({ id, name: id.toUpperCase(), connected: true })),
    messages: [],
    loveletter: {
      sub: "play",
      round: 1,
      order: [...IDS],
      turnIndex: 0,
      deck: ["guard", "priest", "baron"],
      hands: { a: "priest", b: "princess", c: "baron" },
      drawn: "guard",
      alive: { a: true, b: true, c: true },
      discards: { a: [], b: [], c: [] },
      tokens: { a: 0, b: 0, c: 0 },
      peeks: {},
      winnerId: null,
      tied: false,
      ...overrides,
    },
  };
}

describe("llView hidden-hand redaction", () => {
  it("never leaks other hands or the deck on the wire", () => {
    const state = makeState();
    for (const id of IDS) {
      const view = room.llView(state, id);
      const wire = JSON.stringify(view);
      assert.doesNotMatch(wire, /"hands"/);
      assert.doesNotMatch(wire, /"deck":\[/);
    }
    const current = room.llView(state, "a");
    assert.equal(current.hand, "priest");
    assert.equal(current.drawn, "guard");
    assert.equal(current.deckCount, 3);
    assert.equal(current.youPlay, true);
    const waiting = room.llView(state, "b");
    assert.equal(waiting.hand, "princess");
    assert.equal(waiting.drawn, null);
    assert.equal(waiting.youPlay, false);
  });

  it("reveals surviving hands only at round end", () => {
    const state = makeState();
    assert.equal(room.llView(state, "a").reveal, null);
    state.loveletter.sub = "reveal";
    const reveal = room.llView(state, "b").reveal;
    assert.equal(reveal.length, 3);
    assert.deepEqual(
      reveal.map((r) => r.card).sort(),
      ["baron", "priest", "princess"].sort(),
    );
    assert.ok(reveal.every((r) => typeof r.name === "string" && typeof r.card === "string"));
  });
});

describe("llApplyPlay card powers", () => {
  it("guard hit eliminates the target and advances the turn", () => {
    const state = makeState(); // a holds priest+guard, b holds princess
    assert.equal(room.llApplyPlay(state, "a", "guard", "b", "princess"), true);
    const ll = state.loveletter;
    assert.equal(ll.alive.b, false);
    assert.ok(ll.discards.b.includes("princess"));
    assert.deepEqual(ll.discards.a, ["guard"]);
    assert.equal(ll.sub, "play");
    assert.equal(ll.order[ll.turnIndex], "c");
    assert.equal(ll.drawn, null); // c must click Draw first
  });

  it("guard miss leaves everyone alive", () => {
    const state = makeState();
    assert.equal(room.llApplyPlay(state, "a", "guard", "b", "baron"), true);
    assert.deepEqual(state.loveletter.alive, { a: true, b: true, c: true });
    assert.equal(state.loveletter.order[state.loveletter.turnIndex], "b");
  });

  it("rejects guard guesses of guard and out-of-turn plays", () => {
    const state = makeState();
    assert.equal(room.llApplyPlay(state, "a", "guard", "b", "guard"), false);
    assert.equal(room.llApplyPlay(state, "b", "guard", "a", "priest"), false);
    assert.equal(room.llApplyPlay(state, "a", "princess", "", ""), false); // a holds no princess
    assert.equal(state.loveletter.turnIndex, 0);
  });

  it("baron eliminates the lower hand, ties survive", () => {
    const state = makeState({ hands: { a: "baron", b: "priest", c: "guard" }, drawn: "guard" });
    // a plays baron, keeps guard(1) vs b priest(2): a loses.
    assert.equal(room.llApplyPlay(state, "a", "baron", "b", ""), true);
    assert.equal(state.loveletter.alive.a, false);
    assert.equal(state.loveletter.alive.b, true);
    assert.equal(state.loveletter.order[state.loveletter.turnIndex], "b");
  });

  it("baron tie eliminates no one", () => {
    const state = makeState({ hands: { a: "baron", b: "guard", c: "priest" }, drawn: "guard" });
    assert.equal(room.llApplyPlay(state, "a", "baron", "b", ""), true);
    assert.deepEqual(state.loveletter.alive, { a: true, b: true, c: true });
  });

  it("priest records a private peek", () => {
    const state = makeState({ hands: { a: "priest", b: "princess", c: "baron" }, drawn: "guard" });
    assert.equal(room.llApplyPlay(state, "a", "priest", "b", ""), true);
    assert.deepEqual(state.loveletter.peeks.a, { targetId: "b", targetName: "B", card: "princess" });
    assert.equal(room.llView(state, "a").peek.card, "princess");
    assert.equal(room.llView(state, "c").peek, null);
  });

  it("prince on a princess holder eliminates them", () => {
    const state = makeState({ hands: { a: "guard", b: "princess", c: "baron" }, drawn: "prince" });
    assert.equal(room.llApplyPlay(state, "a", "prince", "b", ""), true);
    assert.equal(state.loveletter.alive.b, false);
    assert.ok(state.loveletter.discards.b.includes("princess"));
  });

  it("prince otherwise forces a redraw", () => {
    const state = makeState({ hands: { a: "guard", b: "baron", c: "priest" }, drawn: "prince" });
    assert.equal(room.llApplyPlay(state, "a", "prince", "b", ""), true);
    assert.equal(state.loveletter.alive.b, true);
    assert.ok(state.loveletter.discards.b.includes("baron"));
    assert.notEqual(state.loveletter.hands.b, undefined);
  });

  it("playing the princess eliminates yourself", () => {
    const state = makeState({ hands: { a: "princess", b: "baron", c: "priest" }, drawn: "guard" });
    assert.equal(room.llApplyPlay(state, "a", "princess", "", ""), true);
    assert.equal(state.loveletter.alive.a, false);
    assert.equal(state.loveletter.order[state.loveletter.turnIndex], "b");
  });
});

describe("llDealFor draw click", () => {
  it("deals a second card only to the current player, once", () => {
    const state = makeState({ drawn: null, deck: ["baron", "guard"] });
    assert.equal(room.llDealFor(state, "a"), true);
    assert.equal(state.loveletter.drawn, "guard");
    assert.deepEqual(state.loveletter.deck, ["baron"]);
    assert.equal(room.llDealFor(state, "a"), false); // already drawn
    assert.equal(room.llDealFor(state, "b"), false); // not b's turn
  });

  it("rejects plays before drawing", () => {
    const state = makeState({ drawn: null });
    assert.equal(room.llApplyPlay(state, "a", "priest", "b", ""), false);
    assert.equal(state.loveletter.turnIndex, 0);
  });

  it("empty deck on draw ends the round by showdown", () => {
    const state = makeState({ hands: { a: "baron", b: "priest", c: "guard" }, drawn: null, deck: [] });
    assert.equal(room.llDealFor(state, "a"), true);
    assert.equal(state.loveletter.sub, "reveal");
    assert.equal(state.loveletter.winnerId, "a");
    assert.equal(state.loveletter.tokens.a, 1);
  });
});

describe("round log scoping", () => {
  it("stamps each round so clients can clear the log per round", () => {
    const state = makeState();
    const before = Date.now();
    room.llSetupRound(state);
    assert.equal(state.loveletter.round, 2);
    assert.ok(state.loveletter.roundStartedAt >= before);
    assert.equal(room.llView(state, "a").roundStartedAt, state.loveletter.roundStartedAt);
  });
});

describe("round and game end", () => {
  it("last player standing takes the round token", () => {
    const state = {
      game: "loveletter",
      phase: "playing",
      lang: "en",
      players: [
        { id: "a", name: "A", connected: true },
        { id: "b", name: "B", connected: true },
      ],
      messages: [],
      loveletter: {
        sub: "play",
        round: 1,
        order: ["a", "b"],
        turnIndex: 0,
        deck: ["guard", "baron"],
        hands: { a: "guard", b: "priest" },
        drawn: "baron",
        alive: { a: true, b: true },
        discards: { a: [], b: [] },
        tokens: { a: 0, b: 0 },
        peeks: {},
        winnerId: null,
        tied: false,
      },
    };
    assert.equal(room.llApplyPlay(state, "a", "guard", "b", "priest"), true);
    assert.equal(state.loveletter.sub, "reveal");
    assert.equal(state.loveletter.winnerId, "a");
    assert.equal(state.loveletter.tokens.a, 1);
  });

  it("third token ends the game with a score board", () => {
    const state = makeState({
      alive: { a: true, b: false, c: false },
      hands: { a: "baron" },
      drawn: null,
      tokens: { a: 2, b: 1, c: 0 },
    });
    assert.equal(room.llCheckRoundEnd(state), true);
    assert.equal(state.loveletter.sub, "score");
    assert.equal(state.loveletter.winnerId, "a");
    const view = room.llView(state, "a");
    assert.deepEqual(
      view.scores.map((s) => [s.name, s.tokens]),
      [["A", 3], ["B", 1], ["C", 0]],
    );
  });

  it("empty deck goes to highest-hand showdown, ties award nothing", () => {
    const high = makeState({ hands: { a: "baron", b: "priest", c: "guard" }, deck: [], drawn: null });
    room.llEndRoundByShowdown(high);
    assert.equal(high.loveletter.sub, "reveal");
    assert.equal(high.loveletter.winnerId, "a");
    assert.equal(high.loveletter.tokens.a, 1);

    const tied = makeState({ hands: { a: "baron", b: "baron", c: "guard" }, deck: [], drawn: null });
    room.llEndRoundByShowdown(tied);
    assert.equal(tied.loveletter.sub, "reveal");
    assert.equal(tied.loveletter.tied, true);
    assert.deepEqual(tied.loveletter.tokens, { a: 0, b: 0, c: 0 });
  });
});
