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
import { readKind } from "./creature-kind.mjs";
import { DESPAWN_REASONS, CREATURE_LAW_DIR, creatureLaw } from "./creatures.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const marks = loadMarks(join(ROOT, "WORLD", "marks"));
const byClass = (c) => marks.find((m) => m.kind === "class" && m.by === "the-town" && String(m.class) === c);
const KINDS = ["wolf", "raven", "bat"];

test("the creature class: a living node, live canon, two ways to leave, and off by default", () => {
  const c = byClass("creature");
  assert.ok(c, "the-town/creature stands in the works");
  assert.equal(c.id, "the-town/creature");
  assert.equal(c.extends, "entity", "a creature is an entity: it lives");
  assert.equal(c.canon, "live");
  assert.deepEqual(c.despawn, [...DESPAWN_REASONS]);
  assert.deepEqual(c.actions, [], "no verbs of its own");
  assert.equal(c.dials.from_crossing, 259, "the launch: the window opening 2026-10-19 12:00Z (Darko 2026-10-17 13:58)");
  assert.equal(c.dials.rotation, "bat raven wolf", "one a window, the kinds in turn, a bat first");
  assert.equal(c.dials.span_h, 12, "a creature lasts 12 h (ruled), the span's one home");
});

test("the three kinds: each a class extending creature, whose kind file is its law and names it", () => {
  for (const k of KINDS) {
    const m = byClass(k);
    assert.ok(m, `the-town/${k} stands in the works`);
    assert.equal(m.extends, "creature");
    assert.ok(Number.isInteger(m.dials.count_per_window) && m.dials.count_per_window > 0, `${k} has a count per window`);
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
  assert.deepEqual(under.filter((m) => m.kind === "class").map((m) => String(m.class)).sort(), ["bat", "creature", "raven", "wolf"]);
});
