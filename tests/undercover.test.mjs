// Regression test: Undercover players must not learn their own role (spy vs
// civilian) from the server. Each player only sees their own word; roles are
// published solely in the game-end `reveal` list.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadGameRoom } from "./load-worker.mjs";

const { room } = loadGameRoom();

function makeState(sub, phase = "playing") {
  const ids = ["a", "b", "c", "d"];
  return {
    game: "undercover",
    phase,
    lang: "en",
    players: ids.map((id) => ({ id, name: id.toUpperCase(), connected: true })),
    undercover: {
      sub,
      round: 1,
      spyCount: 1,
      members: ids.map((id) => ({
        id,
        role: id === "d" ? "spy" : "civ",
        word: id === "d" ? "tea" : "coffee",
        alive: true,
      })),
      order: [...ids],
      turnIndex: 0,
      descriptions: [],
      votes: {},
      candidates: [],
      eliminated: sub === "reveal" ? { id: "a", name: "A", role: "civ", word: "coffee" } : null,
      result: null,
    },
  };
}

describe("ucView role redaction", () => {
  for (const sub of ["describe", "vote", "reveal"]) {
    it(`sends no role information to anyone during ${sub}`, () => {
      const state = makeState(sub);
      const spyView = room.ucView(state, "d");
      const civView = room.ucView(state, "a");

      assert.equal("myRole" in spyView, false);
      assert.equal(spyView.reveal, null);
      assert.equal(spyView.myWord, "tea");
      assert.equal(civView.myWord, "coffee");

      // Nothing on the wire may mention a role while the game is live.
      for (const view of [spyView, civView]) {
        const wire = JSON.stringify(view);
        assert.doesNotMatch(wire, /"(spy|civ)"/);
      }

      // Apart from their own word, the spy's view is indistinguishable from a civilian's.
      const { myWord: _s, youSpeak: _ss, youVote: _sv, ...spyRest } = spyView;
      const { myWord: _c, youSpeak: _cs, youVote: _cv, ...civRest } = civView;
      assert.deepEqual(spyRest, civRest);
    });
  }

  it("publishes every role in the reveal list at game end", () => {
    const state = makeState("reveal", "gameEnd");
    state.undercover.result = "civ";
    const view = room.ucView(state, "d");
    assert.deepEqual(
      view.reveal.map((r) => [r.name, r.role]),
      [["A", "civ"], ["B", "civ"], ["C", "civ"], ["D", "spy"]],
    );
  });
});
