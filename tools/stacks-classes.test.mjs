// stacks-classes.test.mjs — WLD-27: the classes a counted holding stands on.
//
// What the w43 build specification plants in the Keeping Works, read back
// from the live tree by the same loader the fold uses: consumable extends
// thing, candy extends consumable, chest extends thing with its own dials, and
// holds is a postmark-edge carrying `canon: live`. A candy KIND is a label on
// a count, so no kind may appear as a class of its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MARKS_DIR = join(HERE, "..", "WORLD", "marks");
const live = loadMarks(MARKS_DIR);
const inTheWorks = (m) => String(m._dir ?? "").split("\\").join("/").includes("/the-keeping-works/");
const declared = (name) => live.filter((m) => m.kind === "class" && m.class === name && m.by === "the-town" && inTheWorks(m));
const one = (name) => {
  const found = declared(name);
  assert.equal(found.length, 1, `the Keeping Works declares ${name} exactly once (found ${found.length})`);
  return found[0];
};
const dialsOf = (m) => (typeof m.dials === "string" ? JSON.parse(m.dials) : (m.dials ?? {}));

test("consumable extends thing; candy extends consumable; chest extends thing", () => {
  assert.equal(one("consumable").extends, "thing");
  assert.equal(one("candy").extends, "consumable");
  assert.equal(one("chest").extends, "thing");
  for (const name of ["consumable", "candy", "chest"]) assert.equal(one(name).tier, "constitution");
});

test("a chest declares capacity 30 in 1..120, the first stock, portable and an open welcome", () => {
  const d = dialsOf(one("chest"));
  assert.deepEqual(
    { capacity: d.capacity, min: d.capacity_min, max: d.capacity_max, first: d.first_stock, portable: d.portable, welcome: d.welcome },
    { capacity: 30, min: 1, max: 120, first: 30, portable: true, welcome: "open" });
});

test("the thing class still declares carry_cap 24 — the cap the counted holding reads, never copies", () => {
  assert.equal(dialsOf(one("thing")).carry_cap, 24);
});

test("holds is a postmark-edge labelled canon: live, holder a resident or a chest, object the label", () => {
  const h = one("holds");
  assert.equal(h.extends, "postmark-edge");
  assert.equal(h.canon, "live");
  assert.equal(h.object, "label", "the candy identity is its label, never the mark kind (Wright, 2026-10-13T00:09Z)");
  const subject = typeof h.subject === "string" && h.subject.startsWith("[") ? JSON.parse(h.subject) : h.subject;
  assert.deepEqual(subject, ["resident", "chest"]);
});

test("the candy class carries its labels as a list of {label, name, creator}; no label is a class node", () => {
  const labels = one("candy").labels;
  assert.ok(Array.isArray(labels), "candy.labels is the one source, read both ways (creator -> label, label -> creator)");
  for (const l of labels) assert.deepEqual(Object.keys(l).sort(), ["creator", "label", "name"]);
  for (const kind of ["pocket-comets", "glowdrops", "pocket-comet", "glowdrop"])
    assert.equal(declared(kind).length, 0, `${kind} must not be a class in the Keeping Works`);
});

test("the instantiation account and the whitelist carry chest, and not candy", () => {
  const src = readFileSync(join(HERE, "board-grammar.test.mjs"), "utf8");
  const line = src.split("\n").find((l) => l.startsWith("const RESIDENT_INSTANTIABLE"));
  assert.match(line, /"chest"/);
  assert.doesNotMatch(line, /"candy"|"consumable"/);
  const logos = readFileSync(join(HERE, "..", "LOGOS", "classes.md"), "utf8");
  assert.match(logos, /and a chest\nyou set out \(`chest`/);
  assert.match(logos, /Rendered in the world as `the-town\/consumable`, `the-town\/candy`, `the-town\/chest`,\nand the counted edge as `the-town\/holds`\./);
});
