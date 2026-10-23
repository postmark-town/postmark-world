// appearance-starter-set.test.mjs — an entity's default predicate slots
// (WLD-83; Darko 2026-10-20 09:36–09:55: "appearance to be one of the default
// predicates without needing a subclass that are attributed to entities").
//
// There is no appearance class. The `entity` class declares, as its own
// sovereign properties nested by path (the way a holder's capacity carries its
// `max`), `appearance` (the glance, the root) and under it form, wears, sign,
// voice and manner. Every entity class inherits them. Pronouns are not here:
// they are a profile field.

import test from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { loadRecords } from "./law-tree.mjs"; // the classes are law nodes (WLD-116): the marks and the law, together
import { classIndex, ownProperties, propertiesOf } from "./class-properties.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const marks = loadRecords(join(ROOT, "WORLD", "marks"));
const idx = classIndex(marks);
const FIVE = ["form", "manner", "sign", "voice", "wears"];

test("entity declares appearance, the maker's, with its meaning, and the five sit under it", () => {
  const root = ownProperties(idx, "the-town/entity").find((p) => p.name === "appearance");
  assert.ok(root, "entity declares appearance");
  assert.equal(root.tier, "sovereign");
  assert.match(String(root.body), /glance/);
  const under = ownProperties(idx, root.id);
  assert.deepEqual(under.map((p) => p.name).sort(), FIVE);
  for (const p of under) {
    assert.equal(p.tier, "sovereign", `${p.name} is the maker's`);
    const line = String(p.body ?? "").trim();
    assert.ok(line.length > 0 && !line.includes("\n"), `${p.name} carries its meaning on one line`);
  }
});

test("every entity class inherits them: resident, creature (and a kind), human and meep", () => {
  for (const k of ["resident", "creature", "bat", "human", "meep"]) {
    const p = propertiesOf(idx, k).get("appearance");
    assert.equal(p?.from, "entity", `${k} inherits appearance from entity`);
    assert.deepEqual(ownProperties(idx, p.node.id).map((x) => x.name).sort(), FIVE);
  }
  assert.equal(propertiesOf(idx, "thing").has("appearance"), false, "a mark has no appearance slot: its own predicates say how it looks");
});

test("no pronouns slot, and no class named appearance (so G9 needs no exception)", () => {
  const all = marks.filter((m) => m.kind === "property");
  assert.equal(all.some((p) => p.name === "pronouns"), false, "pronouns are a profile field");
  assert.equal(marks.some((m) => m.kind === "class" && m.class === "appearance"), false);
});
