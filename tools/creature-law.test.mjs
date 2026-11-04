// creature-law.test.mjs — the creature class and its three kinds, as the law stands (WLD-56).
//
// The class marks and kind files hold Darko's words and numbers (D1, D2, D4, D6,
// 2026-10-15 12:09); the numbers' own test is creatures.test.mjs § the law.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks, parseRecord } from "./marks-fold.mjs";
import { readKind, AFFORDED_VERBS } from "./creature-kind.mjs";
import { DESPAWN_REASONS, CREATURE_LAW_DIR, AFFORDED_FROM, creatureLaw } from "./creatures.mjs";
import { propertyOf } from "./class-properties.mjs";

// a class's dials are its property nodes now (LOGOS v2 part 2)
const dial = (c, name) => propertyOf(marks, c, name)?.value;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const marks = loadMarks(join(ROOT, "WORLD", "marks"));
const byClass = (c) => marks.find((m) => m.kind === "class" && m.by === "the-town" && String(m.class) === c);
const KINDS = ["wolf", "raven", "bat"];

test("the creature class: a living node, live canon, its ways to leave (ended only for a named one, WLD-25), and off by default", () => {
  const c = byClass("creature");
  assert.ok(c, "the-town/creature stands in the works");
  assert.equal(c.id, "the-town/creature");
  assert.equal(c.extends, "entity", "a creature is an entity: it lives");
  assert.equal(c.canon, "live");
  assert.deepEqual(c.despawn, [...DESPAWN_REASONS]);
  assert.deepEqual(c.actions.map((a) => a.action), ["watch", "approach", "shoo"],
    "every creature's afforded actions (POS-672, ruled 2026-10-16 18:06): added to the ring, never replacing it");
  // until 2026-11-01 this asserted 259, the window opening 2026-10-19 12:00Z (Darko 2026-10-17 13:58); WLD-142 (Darko 2026-10-31 23:01 EDT) turned it off
  assert.equal(dial("creature", "from_crossing"), null, "off after Halloween: \"remove all like the Halloween creatures\" (Darko 2026-10-31 23:01)");
  // THE RAMP (Darko 2026-10-19 20:05, WLD-84): rotation null, every kind every window at its own count
  assert.equal(dial("creature", "rotation"), null, "the ramp: no rotation, every kind every window (Darko 2026-10-19 20:05)");
  assert.deepEqual(Object.fromEntries(KINDS.map((k) => [k, dial(k, "count_per_window")])), { wolf: 1, raven: 3, bat: 2 },
    "the ramp's counts: 2 bats, 3 ravens, 1 wolf a window (Darko 2026-10-19 20:05)");
  assert.equal(dial("creature", "span_h"), 12, "a creature lasts 12 h (ruled), the span's one home");
});

test("the three kinds: each a class extending creature, whose kind file is its law and names it", () => {
  for (const k of KINDS) {
    const m = byClass(k);
    assert.ok(m, `the-town/${k} stands in the works`);
    assert.equal(m.extends, "creature");
    assert.ok(Number.isInteger(dial(k, "count_per_window")) && dial(k, "count_per_window") > 0, `${k} has a count per window`);
    assert.equal(m.kind_file, `WORLD/kinds/${k}.kind`);
    assert.ok(existsSync(join(ROOT, m.kind_file)), `${m.kind_file} is there`);
    const kind = readKind(join(ROOT, m.kind_file));
    assert.equal(kind.kind, k, "the kind file names its class");
    assert.ok(kind.reactions.some((r) => r.effects.some((e) => e.do === "flee")), `${k} can flee`);
    assert.ok(kind.reactions.some((r) => r.src.trim() === "true"), `${k} always has something to do`);
  }
});

test("the law's directory: the class and its kinds all stand under CREATURE_LAW_DIR, so a reader at a ref lists one place", () => {
  // as the office's tick reads it at a ref: every mark.md under the directory, each through parseRecord
  const files = readdirSync(join(ROOT, CREATURE_LAW_DIR), { recursive: true }).map(String).filter((p) => /(^|[\\/])mark\.md$/.test(p));
  const under = files.map((p) => parseRecord(readFileSync(join(ROOT, CREATURE_LAW_DIR, p), "utf8"), p));
  assert.deepEqual(creatureLaw(under), creatureLaw(marks), "the directory alone reads the same law as the whole world");
  assert.deepEqual(under.filter((m) => m.kind === "class").map((m) => String(m.class)).sort(), ["bat", "candied-bat", "candied-jetto", "candied-raven", "candied-wolf", "creature", "raven", "wolf"]);
});

test("the afforded actions (POS-672): the shared three, each kind's own, and every reaction keyed on one is the kind's", () => {
  const law = creatureLaw(marks);
  const verbs = (k) => law.afforded[k].map((a) => a.action);
  assert.deepEqual(verbs("wolf"), ["watch", "approach", "shoo", "call", "offer"]);
  assert.deepEqual(verbs("raven"), ["watch", "approach", "shoo", "call", "offer"]);
  assert.deepEqual(verbs("bat"), ["watch", "approach", "shoo", "whisper"]);
  for (const k of KINDS) {
    for (const a of law.afforded[k]) {
      assert.ok(AFFORDED_FROM.includes(a.from), `${k} ${a.action} is taken from sight or the ring`);
      assert.equal(a.who, "anyone", "any resident with feet (C5)");
      assert.match(a.effect, /its reaction is your reply$/, "the reply IS the reaction (call 7)");
    }
    assert.equal(law.afforded[k].find((a) => a.action === "watch").from_class, "the-town/creature");
    // a kind file may key a reaction only on a ring verb or an afforded action its classes declare
    const kind = readKind(join(ROOT, byClass(k).kind_file));
    for (const r of kind.reactions)
      for (const v of String(r.src).matchAll(/act\.verb\s*==\s*"([^"]+)"|"([^"]+)"\s*==\s*act\.verb/g)) {
        const verb = v[1] ?? v[2];
        if (AFFORDED_VERBS.includes(verb)) assert.ok(verbs(k).includes(verb), `${k}'s ${r.name} keys on ${verb}, which is not a ${k}'s`);
      }
    assert.ok(typeof kind.tastes === "string" && kind.tastes.trim(), `${k} says what it likes (call 8)`);
  }
});

test("the afforded actions are read whole: an unknown verb, a bad `from`, a missing field or a shared verb redeclared throws", () => {
  const withActions = (cls, actions) => marks.map((m) => (m.kind === "class" && m.by === "the-town" && String(m.class) === cls ? { ...m, actions } : m));
  const ok = { action: "call", who: "anyone", from: "sight", effect: "e", residue: "the-town/wolf" };
  assert.throws(() => creatureLaw(withActions("wolf", [{ ...ok, action: "strike" }])), /is not one of watch, approach, shoo, call, offer, whisper/);
  assert.throws(() => creatureLaw(withActions("wolf", [{ ...ok, from: "anywhere" }])), /taken from "anywhere", not sight or ring/);
  assert.throws(() => creatureLaw(withActions("wolf", [{ ...ok, effect: "" }])), /names no effect/);
  assert.throws(() => creatureLaw(withActions("wolf", [ok, ok])), /declared twice/);
  assert.throws(() => creatureLaw(withActions("wolf", [{ ...ok, action: "watch" }])), /wolf declares watch, which every creature already has/);
  assert.deepEqual(creatureLaw(withActions("creature", [])).afforded.bat.map((a) => a.action), ["whisper"], "no shared actions: each kind has only its own");
});

test("every afforded action a kind takes has reactions of its own in the kind file (Darko's lines, 2026-10-20 22:35)", () => {
  const law = creatureLaw(marks);
  for (const k of KINDS) {
    const kind = readKind(join(ROOT, byClass(k).kind_file));
    for (const { action } of law.afforded[k])
      assert.ok(kind.reactions.some((r) => new RegExp(`act\.verb == "${action}"`).test(r.src)), `${k} answers ${action} in its own way`);
  }
  const raven = readKind(join(ROOT, byClass("raven").kind_file));
  assert.ok(raven.reactions.some((r) => r.says.includes("{heard}")), "the raven's mimicry (WLD-56 18:13)");
  for (const k of ["wolf", "raven"]) {
    const kind = readKind(join(ROOT, byClass(k).kind_file));
    assert.ok(kind.reactions.filter((r) => /act\.verb == "offer"/.test(r.src)).every((r) => r.says.includes("{offered}")), `${k}'s offer lines name what was offered`);
  }
});
