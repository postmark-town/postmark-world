// door-requires.test.mjs — WLD-5 B: a door that opens when it holds what it
// asks for (ruled 2026-10-18 21:23 and 2026-10-19 17:48). A portal's entry
// carries `requires: { holds: [ids], in, says }`; the passage refuses, writing
// nothing, until the holder holds every mark named, and then passes everyone.
// What a holder holds is the office's record, handed in as `holdings`.

import { test } from "node:test";
import assert from "node:assert/strict";

import { enter } from "./world-verbs.mjs";
import { requiresOf, entryLawOf } from "./enter-exit.mjs";
import { portalFindings, unmetRequires, requiresHolderOf, requiresHoldersOf, requiresWords } from "./portals.mjs";

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

// ── `in` AS A LIST, AND `at: "settlement"` (Wright 2026-10-22, G1 and G2) ────

const KEEPERS = ["tower/keeper-a", "tower/keeper-b", "tower/keeper-c"];
const keeper = (id, i) => ({ id, kind: "thing", by: "tower", holder: true, capacity: 1, accepts: [ASKS[i]], keeps: true,
  at: { x: 960 + i * 5, y: 1000 }, extent: { w: 1, h: 1 }, body: "A keeper." });
const keepers = () => KEEPERS.map(keeper);
const listDoor = (extra = {}) => world({ requires: { holds: ASKS, in: KEEPERS, ...extra }, extra: keepers() });
const portalOf = (w) => w.marks.find((m) => m.id === DOOR);
/** The world as a settlement printed it: each [token, holder] pair carries `held_by`, and no place. */
const printed = (w, pairs) => {
  const by = new Map(pairs);
  return { marks: w.marks.map((m) => by.has(m.id) ? { ...m, held_by: by.get(m.id) } : m) };
};

test("G1 THE GRAMMAR: `in` may be a list, and `at` is \"settlement\" or absent", () => {
  assert.deepEqual(requiresOf({ holds: ASKS, in: KEEPERS }), { holds: ASKS, in: KEEPERS, says: null });
  assert.deepEqual(requiresOf({ holds: ASKS, in: KEEPERS, at: "settlement" }), { holds: ASKS, in: KEEPERS, says: null, at: "settlement" });
  assert.match(requiresOf({ holds: ASKS, in: [] }).malformed, /in is a mark id, or a list of them/);
  assert.match(requiresOf({ holds: ASKS, in: ["tower/keeper-a", 3] }).malformed, /in is a mark id, or a list of them/);
  assert.match(requiresOf({ holds: ASKS, at: "dawn" }).malformed, /at is "settlement" or absent/);
  assert.equal("at" in requiresOf({ holds: ASKS }), false, "absent when not written");
});

test("G1 LIVE: a list door counts each mark held by any one of its holders, and only those", () => {
  const w = listDoor();
  assert.deepEqual(requiresHoldersOf(portalOf(w)), KEEPERS, "the office asks for every holder named");
  assert.equal(requiresHolderOf(portalOf(w)), null, "an office that knows one holder is told nothing, and the door stays shut there");
  const two = pass(w, { [KEEPERS[0]]: [ASKS[0]], [KEEPERS[1]]: [ASKS[1]], [DOOR]: [ASKS[2]] });
  assert.equal(two.refused, "requires", "the door's own holdings are not its holders'");
  assert.deepEqual(two.requires, { in: KEEPERS, holds: ASKS, held: [ASKS[0], ASKS[1]], missing: [ASKS[2]] });
  assert.equal(two.error, "Inner Door opens only when Keeper A, Keeper B and Keeper C hold the 3 things it asks for, and they hold 2. Nothing was recorded.");
  assert.equal(pass(w, { [KEEPERS[0]]: [ASKS[0]], [KEEPERS[1]]: [ASKS[1]], [KEEPERS[2]]: [ASKS[2]] }).refused, null, "all three: open");
});

test("G2 AT A SETTLEMENT: the door reads the printed `held_by`, never the live record", () => {
  const w = listDoor({ at: "settlement" });
  const door = portalOf(w);
  assert.deepEqual(requiresHoldersOf(door), [], "it asks the office for nothing");
  assert.equal(requiresHolderOf(door), null);
  const all = Object.fromEntries(KEEPERS.map((k, i) => [k, [ASKS[i]]]));
  // all three are in the keepers' hands now, but the last settlement printed two: shut until the next
  const before = pass(printed(w, [[ASKS[0], KEEPERS[0]], [ASKS[1], KEEPERS[1]]]), all);
  assert.equal(before.refused, "requires", "the live record never opens it");
  assert.deepEqual(before.requires, { in: KEEPERS, holds: ASKS, held: [ASKS[0], ASKS[1]], missing: [ASKS[2]], at: "settlement" });
  assert.equal(before.error, "Inner Door opens only when Keeper A, Keeper B and Keeper C hold the 3 things it asks for, and at the last settlement they held 2; what is put in now counts from the next settlement. Nothing was recorded.");
  // the next settlement prints the third: open, with no live record at all
  const after = pass(printed(w, KEEPERS.map((k, i) => [ASKS[i], k])), null);
  assert.equal(after.refused, null, "three printed: open");
  assert.equal(after.into, "tower/inner-room");
});

test("G2 FAIL CLOSED: printed in someone's hand, in another holder, or not printed at all, a mark counts for nothing", () => {
  const w = listDoor({ at: "settlement" });
  const r = pass(printed(w, [[ASKS[0], KEEPERS[0]], [ASKS[1], "ann"], [ASKS[2], "tower/box"]]), null);
  assert.deepEqual(r.requires.held, [ASKS[0]]);
  const gone = { marks: printed(w, [[ASKS[0], KEEPERS[0]], [ASKS[1], KEEPERS[1]]]).marks.filter((m) => m.id !== ASKS[2]) };
  assert.deepEqual(pass(gone, null).requires.missing, [ASKS[2]], "a mark the world does not carry is held by no one");
  const one = world({ requires: { holds: ["tower/token-a"], at: "settlement" } });
  assert.equal(pass(printed(one, [["tower/token-a", DOOR]]), null).refused, null, "one holder, the door itself, reads the same way");
  assert.match(pass(one, null).error, /and at the last settlement it held 0; what is put in now counts from the next settlement\./);
});

test("G1 LINT: every holder a list names is a mark that holds", () => {
  const rules = (w) => portalFindings(w.marks).filter((f) => f.rule.startsWith("requires")).map((f) => `${f.mark} ${f.rule}`);
  assert.deepEqual(rules(listDoor()), [], "a well-formed list door is clean");
  assert.deepEqual(rules(listDoor({ at: "settlement" })), []);
  assert.deepEqual(rules(world({ requires: { holds: ASKS, in: [...KEEPERS, "tower/nowhere"] }, extra: keepers() })), [`${DOOR} requires-names-marks`]);
  const notHolder = world({ requires: { holds: ASKS, in: KEEPERS }, extra: keepers().map((k, i) => i === 1 ? { ...k, holder: false } : k) });
  assert.deepEqual(rules(notHolder), [`${DOOR} requires-in-a-holder`]);
});

// ── `shown: false` (Wright 2026-10-22, from Darko's § 4: the hint is the door's own body) ──

test("NOT SHOWN: the refusal is the door's line and the count, and no id of what it asks for or where it looks, anywhere", () => {
  const w = listDoor({ at: "settlement", shown: false, says: "The doors hold fast. At the last settlement, {held} of {asks} were in place." });
  assert.deepEqual(requiresOf({ holds: ASKS, shown: false }), { holds: ASKS, in: null, says: null, shown: false });
  assert.equal("shown" in requiresOf({ holds: ASKS, shown: true }), false, "shown is the default, absent when not hidden");
  assert.match(requiresOf({ holds: ASKS, shown: "maybe" }).malformed, /shown is true or false/);
  const r = pass(printed(w, [[ASKS[0], KEEPERS[0]], [ASKS[1], KEEPERS[1]]]), null);
  assert.equal(r.refused, "requires");
  assert.equal(r.error, "The doors hold fast. At the last settlement, 2 of 3 were in place. Nothing was recorded.");
  assert.deepEqual(r.requires, { shown: false, held: 2, asks: 3, at: "settlement" });
  const said = JSON.stringify(r);
  for (const id of [...ASKS, ...KEEPERS]) assert.ok(!said.includes(id), `${id} appears nowhere in the refusal`);
  // with no line of its own, the town's plain words name nothing either
  const plain = pass(printed(listDoor({ at: "settlement", shown: false }), []), null);
  assert.equal(plain.error, "Inner Door stays shut until what it asks for is in place, and at the last settlement 0 of 3 were; what is put in now counts from the next settlement. Nothing was recorded.");
  for (const id of [...ASKS, ...KEEPERS]) assert.ok(!JSON.stringify(plain).includes(id));
  // the condition is the door's law, readable there, and three printed still opens it
  assert.deepEqual(entryLawOf(portalOf(w)).requires.holds, ASKS);
  assert.equal(pass(printed(w, KEEPERS.map((k, i) => [ASKS[i], k])), null).refused, null);
  // every other door keeps today's answer
  assert.deepEqual(pass(printed(listDoor({ at: "settlement" }), []), null).requires.holds, ASKS);
});
