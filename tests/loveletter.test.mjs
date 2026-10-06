// Love Letter (Second Edition rules): hidden-hand redaction, card-power
// resolution, scaled token targets, and round setup. Exercises
// llApplyPlay/llView directly with hand-built state, mirroring
// tests/undercover.test.mjs.
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
      target: 4, // 3 players on the Second Edition table
      lastWinner: null,
      order: [...IDS],
      turnIndex: 0,
      deck: ["guard", "priest", "baron"],
      hands: { a: "priest", b: "princess", c: "baron" },
      drawn: "guard",
      alive: { a: true, b: true, c: true },
      discards: { a: [], b: [], c: [] },
      tokens: { a: 0, b: 0, c: 0 },
      peeks: {},
      protected: {},
      pending: null,
      burned: [],
      burnedUp: [],
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

describe("second edition setup", () => {
  it("builds the 21-card deck with official burns and scaled targets", () => {
    const state = makeState();
    room.llSetupRound(state);
    const ll = state.loveletter;
    assert.equal(ll.burned.length, 1);
    assert.deepEqual(ll.burnedUp, []);
    assert.equal(ll.deck.length, 21 - 1 - 3);
    assert.equal(ll.target, 4);
    assert.equal(ll.turnIndex, 0);
    const full = [...ll.deck, ...Object.values(ll.hands), ...ll.burned, ...ll.burnedUp].sort();
    assert.deepEqual(full, [
      "baron", "baron", "chancellor", "chancellor", "countess", "guard", "guard", "guard",
      "guard", "guard", "guard", "handmaid", "handmaid", "king", "priest", "priest",
      "prince", "prince", "princess", "spy", "spy",
    ]);
  });

  it("burns four with two players and targets six tokens", () => {
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
        round: 0,
        target: 6,
        lastWinner: null,
        order: ["a", "b"],
        turnIndex: 0,
        deck: [],
        hands: {},
        drawn: null,
        alive: {},
        discards: {},
        tokens: { a: 0, b: 0 },
        peeks: {},
        protected: {},
        pending: null,
        burned: [],
        burnedUp: [],
        winnerId: null,
        tied: false,
      },
    };
    room.llSetupRound(state);
    const ll = state.loveletter;
    assert.equal(ll.burned.length, 1);
    assert.equal(ll.burnedUp.length, 3);
    assert.equal(ll.deck.length, 21 - 1 - 3 - 2);
  });

  it("never leaks the face-down burn on the wire", () => {
    const state = makeState({ burned: ["princess"], sub: "reveal" });
    assert.doesNotMatch(JSON.stringify(room.llView(state, "a")), /"burned":/);
  });

  it("lets the round winner start the next round", () => {
    const state = makeState({ lastWinner: "c" });
    room.llSetupRound(state);
    assert.equal(state.loveletter.turnIndex, 2);
  });
});

describe("second edition powers", () => {
  it("handmaid shields until the next turn, then lapses", () => {
    const state = makeState({ hands: { a: "handmaid", b: "priest", c: "guard" }, drawn: "guard" });
    assert.equal(room.llApplyPlay(state, "a", "handmaid", "", ""), true);
    assert.equal(state.loveletter.protected.a, true);
    state.loveletter.drawn = "guard"; // b drew; turn already advanced to b
    assert.equal(room.llApplyPlay(state, "b", "guard", "a", "priest"), false);
    state.loveletter.drawn = "prince";
    assert.equal(room.llApplyPlay(state, "b", "prince", "a", ""), false);
    state.loveletter.turnIndex = 0;
    room.llBeginTurn(state);
    assert.equal(state.loveletter.protected.a, false);
  });

  it("king swaps the two hands", () => {
    const state = makeState({ hands: { a: "king", b: "priest", c: "guard" }, drawn: "guard" });
    assert.equal(room.llApplyPlay(state, "a", "king", "b", ""), true);
    assert.equal(state.loveletter.hands.a, "priest");
    assert.equal(state.loveletter.hands.b, "guard");
    assert.equal(state.loveletter.order[state.loveletter.turnIndex], "b");
  });

  it("countess must be played while holding king or prince", () => {
    const state = makeState({ hands: { a: "countess", b: "priest", c: "guard" }, drawn: "king" });
    assert.equal(room.llApplyPlay(state, "a", "king", "b", ""), false);
    assert.equal(room.llApplyPlay(state, "a", "countess", "", ""), true);
    assert.equal(state.loveletter.alive.a, true);
  });

  it("chancellor keeps one of three and stacks the rest chosen-order up", () => {
    const setup = () => makeState({
      hands: { a: "chancellor", b: "priest", c: "guard" },
      drawn: "guard",
      deck: ["baron", "priest", "king"],
    });
    const state = setup();
    assert.equal(room.llApplyPlay(state, "a", "chancellor", "", ""), true);
    assert.deepEqual(state.loveletter.pending, { pid: "a", choices: ["guard", "king", "priest"] });
    assert.equal(room.llResolveChancellor(state, "a", { keepIndex: 0, firstIndex: 2 }), true);
    assert.equal(state.loveletter.hands.a, "guard");
    assert.deepEqual(state.loveletter.deck, ["king", "baron", "priest"]);
    assert.equal(state.loveletter.pending, null);
    assert.equal(state.loveletter.order[state.loveletter.turnIndex], "b");
  });

  it("chancellor rejects bad choices and strangers", () => {
    const state = makeState({
      hands: { a: "chancellor", b: "priest", c: "guard" },
      drawn: "guard",
      deck: ["baron", "priest", "king"],
    });
    assert.equal(room.llApplyPlay(state, "a", "chancellor", "", ""), true);
    assert.equal(room.llResolveChancellor(state, "a", { keepIndex: 1, firstIndex: 1 }), false);
    assert.equal(room.llResolveChancellor(state, "b", { keepIndex: 0, firstIndex: 2 }), false);
    assert.notEqual(state.loveletter.pending, null);
  });

  it("lone spy at round end earns a bonus token", () => {
    const state = makeState({ discards: { a: ["spy"], b: ["guard"], c: ["priest"] } });
    room.llSpyBonus(state);
    assert.deepEqual(state.loveletter.tokens, { a: 1, b: 0, c: 0 });
    const tied = makeState({ discards: { a: ["spy"], b: ["spy"], c: [] } });
    room.llSpyBonus(tied);
    assert.deepEqual(tied.loveletter.tokens, { a: 0, b: 0, c: 0 });
  });

  it("guard can name the new high cards, never guard", () => {
    const state = makeState({ hands: { a: "guard", b: "king", c: "priest" }, drawn: "guard" });
    assert.equal(room.llApplyPlay(state, "a", "guard", "b", "king"), true);
    assert.equal(state.loveletter.alive.b, false);
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
        target: 6, // 2 players on the Second Edition table
        lastWinner: null,
        order: ["a", "b"],
        turnIndex: 0,
        deck: ["guard", "baron"],
        hands: { a: "guard", b: "priest" },
        drawn: "baron",
        alive: { a: true, b: true },
        discards: { a: [], b: [] },
        tokens: { a: 0, b: 0 },
        peeks: {},
        protected: {},
        pending: null,
        burned: [],
        burnedUp: [],
        winnerId: null,
        tied: false,
      },
    };
    assert.equal(room.llApplyPlay(state, "a", "guard", "b", "priest"), true);
    assert.equal(state.loveletter.sub, "reveal");
    assert.equal(state.loveletter.winnerId, "a");
    assert.equal(state.loveletter.tokens.a, 1);
  });

  it("reaching the scaled target ends the game with a score board", () => {
    const state = makeState({
      alive: { a: true, b: false, c: false },
      hands: { a: "baron" },
      drawn: null,
      tokens: { a: 3, b: 1, c: 0 },
    });
    assert.equal(room.llCheckRoundEnd(state), true);
    assert.equal(state.loveletter.sub, "score"); // 3 players -> target 4
    assert.equal(state.loveletter.winnerId, "a");
    const view = room.llView(state, "a");
    assert.deepEqual(
      view.scores.map((s) => [s.name, s.tokens]),
      [["A", 4], ["B", 1], ["C", 0]],
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
