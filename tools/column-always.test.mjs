// column-always.test.mjs — play fix 34 (Darko, playground 2026-10-15 18:25):
// "the full description is always that column for everything". A selected mark
// opens the column with the Telling open as well as in painting-only; with the
// Telling open the click also scrolls the mark's own cell into view. Source pins.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

test("[pin] a mark's column is not gated on the view mode", () => {
  const fn = SOURCE.match(/function markColumnView\(id\) \{[\s\S]*?\n  \}\n/)[0];
  assert.doesNotMatch(fn, /paintingOnly/, "no view-mode gate on the column");
  assert.match(fn, /if \(!id\) return null;/);
});

test("[pin] the column is decided above the bubbles' painting-only gate, so it opens with the Telling open", () => {
  const fn = SOURCE.match(/function renderBubbles\(\) \{[\s\S]*?\n  \}\n/)[0];
  const open = fn.indexOf("if (column) homeColumn.open(column); else homeColumn.close();");
  const gate = fn.indexOf("if (!state.paintingOnly) {");
  assert.ok(open > 0 && gate > 0 && open < gate, "the column opens before the painting-only gate returns");
  assert.match(fn, /markColumnView\(selected\)/, "for every mark, not only parcels and regions");
});

test("[pin] with the Telling open, a click on the map still scrolls the mark's cell into view", () => {
  assert.match(SOURCE, /selectMark\(markId, \{ scrollCell: true \}\);/, "the pip click keeps its scroll");
  assert.match(SOURCE, /if \(scrollCell\) scrollMarkCellIntoView\(id\);/, "and selectMark does the scrolling");
});
