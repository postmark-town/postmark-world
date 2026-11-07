// column-show-dont-list.test.mjs — play fix 41 (Darko, playground 2026-10-15
// 20:14): the column says with shapes what it can. Source pins for the page's
// side; the builder's shapes are tested in home-column.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const markColumn = SOURCE.match(/function markColumnView\(id\) \{[\s\S]*?\n  \}\n/)[0];

test("[pin] a mark's column hands in its ✦, its outline and who is inside as tokens, not as lines", () => {
  assert.match(markColumn, /stamps: weight, footprint, tokens,/);
  assert.doesNotMatch(markColumn, /label: "backing"/, "no backing line");
  assert.doesNotMatch(markColumn, /label: "size"/, "no size line");
  assert.doesNotMatch(markColumn, /label: "inside now"/, "no list of names");
  assert.match(markColumn, /const ring = polygonOf\(mark\), bb = ring \? polygonBBox\(ring\) : null;/, "its own ring, when it has one");
  assert.match(markColumn, /kind: "resident", id: walkerHoverId\(h\)/, "residents as their walker tokens");
  assert.match(markColumn, /kind: "creature", id: c\.id/, "creatures standing in it as theirs");
});

test("[pin] pointing at a relative or a token in the column lights it on the map", () => {
  assert.match(SOURCE, /const t = e\.target\.closest\?\.\("\[data-homecol-go\], \[data-choose\]"\);\s*const id = idOf\(t\);\s*if \(id && markInteraction\.getState\(\)\.hoveredId !== id\) hoverMark\(id, true\);/);
  assert.match(SOURCE, /if \(t && !t\.contains\(e\.relatedTarget\)\) hoverMark\(null\);/);
});
