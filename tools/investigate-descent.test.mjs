// investigate-descent.test.mjs — the close look's progressive descent (WLD-83
// P10; Darko 2026-10-19 19:42: "a close look reads to some depth with a cap on
// the total number of bodies, then you descend by calling investigate again on
// the branches and leaves you want").
//
// Before this, `depth` only filled `reinvoke`: a look opened one level whatever
// was asked, and a predicate's own predicates were reachable only by
// investigating that predicate. These pin what `depth` now reads, the one cap,
// the ids to call again, and that depth 1 is the answer it always was.

import test from "node:test";
import assert from "node:assert/strict";
import { investigate, descend } from "./world-verbs.mjs";

const mark = (id, extra) => ({ id, household: "kino", by: "kino", weight: 0, stamps: 0, ...extra });
const manor = mark("kino/manor", { kind: "sited", at: { x: 100, y: 100 }, extent: { w: 20, h: 20 }, body: "the manor" });
const lamp = mark("kino/lamp", { kind: "sited", at: { x: 101, y: 101 }, extent: { w: 1, h: 1 }, body: "a lamp" });
const door = mark("kino/door", { kind: "predicate", parent: "kino/manor", slot: "front-door", value: "oak", body: "an oak door" });
const hinge = mark("kino/hinge", { kind: "predicate", parent: "kino/door", slot: "hinge", value: "brass", body: "a brass hinge" });
const rust = mark("kino/rust", { kind: "predicate", parent: "kino/hinge", slot: "rust", value: "green", body: "green with age" });
const flame = mark("kino/flame", { kind: "predicate", parent: "kino/lamp", slot: "flame", value: "low", body: "it burns low" });
const world = { marks: [manor, lamp, door, hinge, rust, flame] };

test("depth 1 is the answer it always was: no `beneath`, no `descend`, `more` has its two counts", () => {
  const r = investigate(manor.id, world);
  assert.equal("beneath" in r, false);
  assert.equal("descend" in r, false);
  assert.deepEqual(Object.keys(r.more), ["predicates", "children"]);
  assert.deepEqual(r.predicates.map((p) => p.id), ["kino/door"]);
  assert.deepEqual(r.children.map((c) => c.id), ["kino/lamp"]);
  assert.deepEqual(r.reinvoke, []);
});

test("depth 2 reads the next level under what the look shows: a predicate's predicate and a child's predicate", () => {
  const r = investigate(manor.id, world, { depth: 2 });
  assert.deepEqual(r.beneath.map((b) => [b.id, b.under, b.depth]), [
    ["kino/hinge", "kino/door", 2],
    ["kino/flame", "kino/lamp", 2],
  ]);
  assert.equal(r.beneath[0].body, "a brass hinge", "a predicate's body is whole, as `predicates` gives it");
  assert.deepEqual(r.descend, ["kino/hinge"], "the hinge has its own claim, unread: call again there");
  assert.equal(r.more.beneath, 0);
  assert.deepEqual(r.reinvoke, ["kino/lamp"], "reinvoke keeps its old meaning (children and alongside)");
});

test("depth 3 reaches the leaf, and nothing is left to call again", () => {
  const r = investigate(manor.id, world, { depth: 3 });
  assert.deepEqual(r.beneath.map((b) => [b.id, b.depth]), [["kino/hinge", 2], ["kino/flame", 2], ["kino/rust", 3]]);
  assert.deepEqual(r.descend, []);
});

test("ONE CAP ON THE BODIES the descent adds: the near level fills first, and every cut parent is named to call again", () => {
  const many = Array.from({ length: 8 }, (_, i) => mark(`kino/scratch-${i}`, { kind: "predicate", parent: "kino/door", slot: `scratch-${i}`, value: "x", body: `scratch ${i}` }));
  const w = { marks: [...world.marks, ...many] };
  const r = investigate(manor.id, w, { depth: 5, budget: 4 });
  assert.equal(r.beneath.length, 4, "four bodies, whatever the depth asked");
  assert.ok(r.beneath.every((b) => b.depth === 2), "level 2 fills before level 3 is read");
  assert.equal(r.more.beneath, 6, "hinge + 8 scratches + flame = 10 at level 2; 4 shown, 6 cut");
  assert.deepEqual(r.descend.sort(), ["kino/door", "kino/hinge", "kino/lamp"].sort());
});

test("descend over any tree: the office's entity tree uses the same function", () => {
  const tree = { root: ["a", "b"], a: ["a1"], b: [], a1: ["a2"], a2: [] };
  const childrenOf = (id) => (tree[id] ?? []).map((kid) => ({ id: kid, body: kid }));
  assert.deepEqual(descend(["root"], childrenOf, { depth: 1 }), { rows: [], cut: 0, descend: ["root"] }, "depth 1 reads nothing below, and says where to go");
  const two = descend(["root"], childrenOf, { depth: 3, budget: 12 });
  assert.deepEqual(two.rows.map((r) => [r.id, r.under, r.depth]), [["a", "root", 2], ["b", "root", 2], ["a1", "a", 3]]);
  assert.deepEqual(two.descend, ["a1"]);
});
