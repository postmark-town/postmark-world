// declared-parent.test.mjs — investigate's `parents` carries a mark's DECLARED
// parent when geometry finds none (WLD-50; postmark#3772, kinofire's seq 15539).
//
// `predicates` (downward) read `m.parent`; `parents` (upward) read geometry
// alone, and a predicated, naming or class mark has no `at`. So Spin Ghar Manor
// listed the weasel door among its predicates while the door's own `parents`
// was empty. These pin the one relation in both directions.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { investigate } from "./world-verbs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const house = { id: "kino/manor", kind: "sited", household: "kino", by: "kino", at: { x: 100, y: 100 }, extent: { w: 20, h: 20 }, body: "the manor" };
const door = { id: "kino/weasel-door", kind: "predicated", household: "kino", by: "kino", parent: "kino/manor", slot: "front-door", value: "weasel", body: "a door" };
const name = { id: "kino/call-it-the-manor", kind: "naming", household: "kino", by: "kino", parent: "kino/manor", value: "the Manor", body: "its name" };
const law = { id: "the-town/a-law", kind: "class", household: "the-town", by: "the-town", parent: "the-town/the-code", body: "a class mark" };
const code = { id: "the-town/the-code", kind: "class", household: "the-town", by: "the-town", body: "the enclosing law" };
const lamp = { id: "kino/lamp", kind: "sited", household: "kino", by: "kino", at: { x: 101, y: 101 }, extent: { w: 1, h: 1 }, body: "a lamp" };
const onTerrain = { id: "kino/the-river-is-called", kind: "naming", household: "kino", by: "kino", parent: "terrain:the-river", value: "the Slow River", body: "a name for the river" };
const orphan = { id: "kino/a-detail-of-nothing", kind: "predicated", household: "kino", by: "kino", parent: "kino/gone", slot: "x", value: "y", body: "its parent left" };
const world = { marks: [house, door, name, law, code, lamp, onTerrain, orphan], terrain: { features: [{ id: "the-river" }] } };
const up = (id, w = world) => investigate(id, w, { budget: 40 }).parents.map((p) => p.id);

test("the weasel door's shape: a predicated mark's declared parent stands in `parents`", () => {
  assert.deepEqual(up(door.id), ["kino/manor"]);
  const [p] = investigate(door.id, world, { budget: 40 }).parents;
  assert.deepEqual(Object.keys(p), ["id", "kind", "household", "at", "weight", "stamps", "body"], "the same row shape a geometric parent has");
  assert.equal(p.kind, "sited");
});

test("a naming mark shows its declared parent the same way: `predicates` lists naming children too", () => {
  assert.deepEqual(up(name.id), ["kino/manor"]);
});

test("a geometric child is unchanged: its parent is still its container, never a declared field", () => {
  assert.deepEqual(up(lamp.id), ["kino/manor"]);
  const stray = { ...lamp, id: "kino/stray-lamp", parent: "the-town/the-code" };  // a sited mark carries no authored parent; if one leaked in, geometry still wins
  assert.deepEqual(up(stray.id, { ...world, marks: [...world.marks, stray] }), ["kino/manor"]);
});

test("not invented: a terrain parent, a mark that is gone, and a class mark's declared parent", () => {
  assert.deepEqual(up(onTerrain.id), []);
  assert.deepEqual(up(orphan.id), []);
  assert.deepEqual(up(code.id), [], "a class mark with no parent sits inside nothing");
  assert.deepEqual(up(law.id), [], "a class mark's declared parent is not read: `predicates` never lists a class mark, and the class tree is WLD-40's");
  assert.ok(!investigate(code.id, world, { budget: 40 }).predicates.some((p) => p.id === law.id), "the inverse it would break: the code does not list the law");
});

test("ONE RELATION, BOTH DIRECTIONS: every mark a parent lists among its predicates names that parent in its own `parents`", () => {
  for (const p of world.marks) {
    for (const child of investigate(p.id, world, { budget: 40 }).predicates)
      assert.deepEqual(up(child.id), [p.id], `${child.id} under ${p.id}`);
  }
});

test("the world's own record: kinofire/lafayettes-weasel-door sits inside kinofire/spin-ghar-manor, and the inverse law holds town-wide", (t) => {
  const { marks } = JSON.parse(readFileSync(join(ROOT, "WORLD", "world-state.json"), "utf8"));
  const live = { marks };
  if (!marks.some((m) => m.id === "kinofire/lafayettes-weasel-door")) { t.diagnostic("the weasel door no longer stands; re-measure"); }
  else assert.deepEqual(up("kinofire/lafayettes-weasel-door", live), ["kinofire/spin-ghar-manor"]);
  let checked = 0;
  for (const p of marks) {
    if (!marks.some((m) => m.parent === p.id && (m.kind === "predicated" || m.kind === "naming"))) continue;
    for (const child of investigate(p.id, live, { budget: 1000 }).predicates) {
      assert.deepEqual(up(child.id, live), [p.id], `${child.id} under ${p.id}`);
      checked += 1;
    }
  }
  assert.ok(checked > 100, `the law was asked of the town's predicates (${checked})`);
});
