// door-requires.test.mjs — WLD-5 B: a door that opens when it holds what it
// asks for (ruled 2026-10-18 21:23 and 2026-10-19 17:48). A portal's entry
// carries `requires: { holds: [ids], in, says }`; the passage refuses, writing
// nothing, until the holder holds every mark named, and then passes everyone.
// What a holder holds is the office's record, handed in as `holdings`.

import { test } from "node:test";
import assert from "node:assert/strict";

import { enter } from "./world-verbs.mjs";
import { requiresOf, entryLawOf } from "./enter-exit.mjs";
import { portalFindings, unmetRequires, requiresHolderOf, requiresWords } from "./portals.mjs";

const KEEP = "tower/the-keep";
const DOOR = "tower/inner-door";
const ASKS = ["tower/token-a", "tower/token-b", "tower/token-c"];

function world({ requires = { holds: ASKS, says: "Three marks hold the door. {held} of {asks} are in place." }, holder = true, extra = [] } = {}) {
  const marks = [
    { id: KEEP, kind: "sited", by: "tower", class: "dungeon", at: { x: 1000, y: 1000 }, extent: { w: 300, h: 300 },
      body: "The keep.", entry: { into: "tower/hall", lands_at: "tower/front-inside" } },
    { id: "tower/hall", kind: "sited", by: "tower", at: { x: 950, y: 1000 }, extent: { w: 100, h: 100 }, body: "The hall." },
    { id: "tower/inner-room", kind: "sited", by: "tower", at: { x: 1060, y: 1000 }, extent: { w: 20, h: 20 }, body: "The inner room." },
    { id: "tower/front-inside", kind: "sited", by: "tower", at: { x: 905, y: 1000 }, extent: { w: 2, h: 2 },
      body: "The way out.", entry: { word: "neutral", into: "tower/yard" } },
    { id: "tower/yard", kind: "sited", by: "tower", at: { x: 700, y: 1000 }, extent: { w: 100, h: 100 }, body: "The yard." },
    { id: DOOR, kind: "thing", by: "tower", at: { x: 999, y: 1000 }, extent: { w: 2, h: 2 }, ...(holder ? { holder: true, capacity: 3 } : {}),
      body: "A door.", entry: { word: "neutral", into: "tower/inner-room", ...(requires ? { requires } : {}) } },
    { id: "tower/inner-way-out", kind: "sited", by: "tower", at: { x: 1052, y: 1000 }, extent: { w: 2, h: 2 },
      body: "Back to the hall.", entry: { word: "neutral", into: "tower/hall" } },
    ...ASKS.map((id) => ({ id, kind: "thing", by: "the-town", body: "A token." })),
    ...extra,
  ];
  return { marks };
}
const HERE = { x: 999, y: 1000, name: "ann" };
const inHall = () => new Map([["ann", [KEEP, "tower/hall"]]]);
const pass = (w, holdings) => enter(HERE, DOOR, w, { occupancy: inHall(), handle: "ann", at: 270, iso: "2026-10-21T12:00:00.000Z", holdings });

test("the grammar: requires is carried as written, and a malformed one says why", () => {
  assert.deepEqual(entryLawOf({ id: DOOR, entry: { into: "x", requires: { holds: ASKS, says: "s" } } }).requires, { holds: ASKS, in: null, says: "s" });
  assert.deepEqual(requiresOf({ holds: "tower/token-a", in: "tower/box" }), { holds: ["tower/token-a"], in: "tower/box", says: null });
  assert.match(requiresOf([]).malformed, /holds/);
  assert.match(requiresOf({ holds: [] }).malformed, /at least one/);
  assert.match(requiresOf({ holds: [3] }).malformed, /mark ids/);
  assert.match(requiresOf({ holds: ASKS, in: 7 }).malformed, /in is a mark id/);
  assert.equal(entryLawOf({ id: DOOR, entry: { into: "x" } }).requires, undefined, "absent when not written");
});

test("SHUT: a door holding fewer than it asks refuses, names the count, and writes nothing", () => {
  const r = pass(world(), { [DOOR]: ["tower/token-b", "tower/token-a"] });
  assert.equal(r.refused, "requires");
  assert.equal(r.error, "Three marks hold the door. 2 of 3 are in place. Nothing was recorded.");
  assert.deepEqual(r.requires, { in: DOOR, holds: ASKS, held: ["tower/token-a", "tower/token-b"], missing: ["tower/token-c"] });
  assert.equal(r.rows, undefined, "no ledger rows");
});

test("SHUT, FAIL CLOSED: a passage told nothing of the holder holds nothing", () => {
  assert.equal(pass(world(), null).refused, "requires");
  assert.equal(pass(world(), {}).requires.held.length, 0);
  assert.equal(pass(world(), { [DOOR]: ["tower/something-else"] }).refused, "requires", "only what it asks for counts");
});

test("OPEN: once it holds all it asks for, it passes, and for everyone", () => {
  const all = { [DOOR]: [...ASKS, "tower/something-else"] };
  const r = pass(world(), all);
  assert.equal(r.refused, null);
  assert.equal(r.into, "tower/inner-room");
  assert.ok(r.rows.length > 0, "the passage is written");
  const bob = enter({ x: 999, y: 1000, name: "bob" }, DOOR, world(), { occupancy: new Map([["bob", [KEEP, "tower/hall"]]]), handle: "bob", at: 270, iso: "2026-10-21T12:00:00.000Z", holdings: all });
  assert.equal(bob.refused, null, "the same door, the same holdings: open for the next walker too");
});

test("the holder may be another mark (`in`), and the plain words stand when the door says none", () => {
  const box = { id: "tower/box", kind: "thing", by: "tower", holder: true, at: { x: 990, y: 1000 }, extent: { w: 1, h: 1 }, body: "A box." };
  const w = world({ requires: { holds: ["tower/token-a"], in: "tower/box" }, extra: [box] });
  assert.equal(requiresHolderOf(w.marks.find((m) => m.id === DOOR)), "tower/box");
  const shut = pass(w, { [DOOR]: ["tower/token-a"] });
  assert.equal(shut.refused, "requires", "the door's own holdings are not the box's");
  assert.match(shut.error, /^Inner Door opens only when Box holds the 1 thing it asks for, and it holds 0\. Nothing was recorded\.$/);
  assert.equal(pass(w, { "tower/box": ["tower/token-a"] }).refused, null);
  assert.equal(requiresHolderOf({ id: "a", entry: { into: "b" } }), null, "a door that asks nothing");
});

test("a malformed requires keeps the door shut, saying why", () => {
  const r = pass(world({ requires: { holds: [] } }), { [DOOR]: ASKS });
  assert.equal(r.refused, "requires");
  assert.match(r.error, /does not say plainly .*stays shut/);
});

test("words: {held} and {asks} read as the counts; the plain line otherwise", () => {
  assert.equal(requiresWords({ portal: DOOR, holder: DOOR, held: 1, asks: 3, says: "{held}/{asks}" }), "1/3 Nothing was recorded.");
  assert.equal(requiresWords({ portal: DOOR, holder: DOOR, held: 0, asks: 2 }), "Inner Door opens only when it holds the 2 things it asks for, and it holds 0. Nothing was recorded.");
  assert.equal(unmetRequires({ id: "a", entry: { into: "b" } }, {}), null);
});

test("LINT: what it asks for and where it looks are marks, the holder holds, and an exit asks nothing", () => {
  const rules = (w) => portalFindings(w.marks).filter((f) => f.rule.startsWith("requires") || f.rule === "exit-carries-no-requires").map((f) => `${f.mark} ${f.rule}`);
  assert.deepEqual(rules(world()), [], "a well-formed door is clean");
  assert.deepEqual(rules(world({ requires: { holds: [...ASKS, "tower/nothing"] } })), [`${DOOR} requires-names-marks`]);
  assert.deepEqual(rules(world({ requires: { holds: ASKS, in: "tower/nowhere" } })), [`${DOOR} requires-names-marks`]);
  assert.deepEqual(rules(world({ requires: { holds: "" } })), [`${DOOR} requires-names-marks`]);
  assert.deepEqual(rules(world({ holder: false })), [`${DOOR} requires-in-a-holder`]);
  const out = world({ extra: [] });
  out.marks.find((m) => m.id === "tower/front-inside").entry.requires = { holds: ["tower/token-a"], in: DOOR };
  assert.deepEqual(rules(out), ["tower/front-inside exit-carries-no-requires"]);
});

test("LINT: a door that asks is no unlocked way when the lint looks for a path out", () => {
  // the inner room's only way out is back through a door that asks; it is advised, never refused
  const w = world();
  w.marks.find((m) => m.id === "tower/inner-way-out").entry.requires = { holds: ["tower/token-a"], in: DOOR };
  const f = portalFindings(w.marks).filter((x) => x.rule === "path-to-an-exit").map((x) => `${x.mark} ${x.sev}`);
  assert.deepEqual(f, ["tower/inner-room WARN"]);
});
