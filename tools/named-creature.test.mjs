// named-creature.test.mjs — a season's named creature: declared once, finished,
// ended at the settlement (WLD-25; tools/creature-kind.mjs, tools/creatures.mjs;
// WORLD/ENGINE.md § The season's named creatures).
//
// Ruled by Darko 2026-10-20 22:47 and 22:56: it stays until it is finished, by
// either road; the settlement after the first finish ends it, for the whole town.
// The office writes the rows (its creature tick, its reactions, its settlement
// tick); this is the world's half: the grammar, the declaration and the folds.
//
// THE CAN-FAIL FLIPS (each reds a case below): let a Mists kind carry `finish`;
// let a finishable kind flee; let the creature itself write `ended`; drop the
// `stays` arm from creaturesAt or dueFades; let a declaration through with no place.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ENDING_SLOTS, applyEffects, parseKind, startState } from "./creature-kind.mjs";
import { DESPAWN_REASONS, ENDED, TOWN, creatureLaw, creaturesAt, creaturesSnapshot, dueFades } from "./creatures.mjs";
import { loadMarks } from "./marks-fold.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KIND = `kind: test-beast
name: a test beast
ring_m: 50
finishable: true
ending: {finisher} calms it; {names} were there; {carried} is theirs.
moods:
  fear: 0..3 = 1 | calm | uneasy | frightened | terrified
reaction watch "it watches": when true says It watches {actor}.
reaction yield "it yields": when act.verb == "say" does finish ; self.fear -1 says It yields to {actor}.
`;

test("a finishable kind: finish parses, applies as finished, changes nothing else; an ending names only its slots", () => {
  const k = parseKind(KIND);
  assert.equal(k.finishable, true);
  assert.equal(k.ending, "{finisher} calms it; {names} were there; {carried} is theirs.");
  assert.deepEqual([...ENDING_SLOTS], ["finisher", "names", "carried"]);
  const yieldR = k.reactions.find((r) => r.name === "yield");
  assert.deepEqual(yieldR.effects, [{ do: "finish" }, { do: "add", mood: "fear", by: -1 }]);
  const r = applyEffects(k, startState(k), yieldR.effects);
  assert.equal(r.finished, true);
  assert.equal(r.fled, false);
  assert.deepEqual(r.state.moods, { fear: 0 });
  assert.equal(applyEffects(k, startState(k), k.reactions[0].effects).finished, false);
});

test("a Mists kind cannot be finished, a finishable kind never flees, and an ending belongs to a finishable kind", () => {
  assert.throws(() => parseKind(KIND.replace("finishable: true\n", "").replace(/^ending:.*\n/m, "")), /only a finishable kind can be finished/);
  assert.throws(() => parseKind(KIND.replace("does finish ;", "does flee ;")), /a finishable kind never flees/);
  assert.throws(() => parseKind(KIND.replace("finishable: true\n", "")), /ending: belongs to a finishable kind/);
  assert.throws(() => parseKind(KIND.replace("{carried}", "{actor}")), /an ending may name \{finisher\}, \{names\} or \{carried\}/);
  assert.throws(() => parseKind(KIND.replace("finishable: true", "finishable: yes")), /finishable: is true or absent/);
  assert.equal(parseKind(KIND.replace("finishable: true\n", "").replace(/^ending:.*\n/m, "").replace("does finish ; ", "does ")).finishable, false);
});

// ── the declaration ─────────────────────────────────────────────────────────

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const marks = loadMarks(join(ROOT, "WORLD", "marks"));
const withNamed = (cls, named) => marks.map((m) => (m.kind === "class" && m.by === TOWN && String(m.class) === cls ? { ...m, named } : m));

test("a named creature that returns (WLD-124): return_until is an ISO instant in UTC, carried as written; the season marks three entries", () => {
  const ok = { slug: "den", at: { x: 1, y: 2 } };
  const U = "2026-11-01T06:00:00Z";
  assert.equal(creatureLaw(withNamed("wolf", [{ ...ok, return_until: U }])).named.find((d) => d.kind === "wolf").return_until, U);
  assert.equal("return_until" in creatureLaw(withNamed("wolf", [ok])).named.find((d) => d.kind === "wolf"), false, "absent when not written");
  for (const bad of ["2026-11-01", "2026-11-01T02:00:00-04:00", "tomorrow", 7, "2026-13-45T06:00:00Z"])
    assert.throws(() => creatureLaw(withNamed("wolf", [{ ...ok, return_until: bad }])), /return_until is .*not an ISO instant in UTC/, String(bad));
  // until WLD-135 this asserted the season's three returning entries (bat, raven, the second wolf); they are retired
  assert.deepEqual(creatureLaw(marks).named.filter((d) => d.return_until).map((d) => [d.id, d.return_until]), [],
    "no declared entry returns: the season's three are retired");
});

test("a kind class's named creatures are read whole: one id each, a place, what it carries and its crossing", () => {
  const law = creatureLaw(withNamed("wolf", [{ slug: "den", at: { x: 10, y: -20 }, carries: "the-town/a-thing", from_crossing: 300 }]));
  assert.deepEqual(law.named.filter((d) => d.kind === "wolf"), [{ id: "creature:wolf-den", kind: "wolf", x: 10, y: -20, carries: "the-town/a-thing", from_crossing: 300, declared: "the-town/wolf#den" }]);
  // until WLD-135 this asserted the season's five declarations (bat, raven, two wolves, Jetto) and the second wolf's `after`; all five are retired
  assert.deepEqual(creatureLaw(marks).named.map((d) => [d.id, d.carries, d.from_crossing]), [],
    "the law declares no named creature: the season's five are retired");
  assert.deepEqual(creatureLaw(withNamed("wolf", JSON.stringify([{ slug: "den", at: { x: 1, y: 2 } }]))).named.filter((d) => d.kind === "wolf").map((d) => d.id), ["creature:wolf-den"], "a JSON string is read as its list");
});

test("a bad declaration throws, so the law is read whole or not at all", () => {
  const ok = { slug: "den", at: { x: 1, y: 2 } };
  assert.throws(() => creatureLaw(withNamed("wolf", [{ ...ok, slug: "Den!" }])), /needs a lowercase slug/);
  assert.throws(() => creatureLaw(withNamed("wolf", [{ ...ok, at: null }])), /has no place/);
  assert.throws(() => creatureLaw(withNamed("wolf", [{ ...ok, carries: "a-thing" }])), /not a mark's id/);
  assert.throws(() => creatureLaw(withNamed("wolf", [{ ...ok, from_crossing: "soon" }])), /not a whole crossing/);
  // after (a creature that tempts): the named creatures that must all have ended first
  assert.deepEqual(creatureLaw(withNamed("wolf", [{ ...ok, after: ["creature:wolf-first", "creature:wolf-second"] }])).named.find((d) => d.kind === "wolf").after, ["creature:wolf-first", "creature:wolf-second"]);
  assert.throws(() => creatureLaw(withNamed("wolf", [{ ...ok, after: [] }])), /not a list of named creatures' ids/);
  assert.throws(() => creatureLaw(withNamed("wolf", [{ ...ok, after: ["not-a-creature"] }])), /not a list of named creatures' ids/);
  assert.throws(() => creatureLaw(withNamed("wolf", [ok, ok])), /declared twice/);
  assert.throws(() => creatureLaw(withNamed("wolf", { slug: "den" })), /are not a list/);
});

// ── the folds ───────────────────────────────────────────────────────────────

const T0 = Date.parse("2026-10-26T06:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const ID = "creature:wolf-den";
const spawn = { at: iso(T0), actor: TOWN, action: "spawn", object: ID,
  payload: { kind: "wolf", crossing: 300, x: 10, y: -20, at: iso(T0), stays: true, carries: "the-town/a-thing", moods: { fear: 1 }, flags: [] } };

test("a creature that stays never fades: it lives a month on, no fade is due, and the photograph carries it as it is", () => {
  const month = T0 + 30 * 24 * 3600e3;
  const c = creaturesAt(null, [spawn], month).get(ID);
  assert.ok(c, "still here a month on");
  assert.equal(c.stays, true);
  assert.equal(c.fades_at, null);
  assert.equal(c.carries, "the-town/a-thing");
  assert.deepEqual(dueFades(null, [spawn], month), []);
  const snap = creaturesSnapshot(360, month, null, [spawn]);
  const row = snap.creatures.find((x) => x.id === ID);
  assert.equal(row.stays, true);
  assert.equal(row.carries, "the-town/a-thing");
  assert.ok(creaturesAt(snap, [], month + 3600e3).has(ID), "carried forward from the photograph");
});

test("ended is a reason only the-town writes: the creature itself cannot end", () => {
  assert.ok(DESPAWN_REASONS.includes(ENDED));
  const at = T0 + 3600e3;
  const end = (actor) => ({ at: iso(at), actor, action: "withdraw", object: ID, payload: { reason: ENDED } });
  assert.equal(creaturesAt(null, [spawn, end(ID)], at + 1).has(ID), true, "its own withdraw, ended, is not the record's");
  assert.equal(creaturesAt(null, [spawn, end("some-resident")], at + 1).has(ID), true);
  assert.equal(creaturesAt(null, [spawn, end(TOWN)], at + 1).has(ID), false, "the town's ending is");
});
