// registry-paths.test.mjs — every row of the publication registry names a path
// that is in this tree (postmark#3757).
//
// The sweep's unpublish rule (unpublish-verdict.mjs) skips a row whose path is
// not on main, so a row left behind by an act that moved its file is a mark the
// sweep can no longer judge, and, until 10-14, a household warned of a sweep
// that never came. An act that moves a published file reconciles the registry
// in the same commit: `node tools/registry-reconcile.mjs --write`.
//
// THE HELD ROWS are the ones that verb will not write, because the repair
// would make a zero-escrow commons mark sweepable that is not today. They wait
// on the founder (WLD-51) and are named here so the list can only shrink by a
// decision: when WLD-51 is ruled, the rows are repaired and leave this list.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/// 13 stale paths held at 978a1d34 (2026-10-14); each row is stored commons and
// its mark walks market. (berthillon/cone-peche-de-vigne-2026-08-27, the other
// WLD-51 row, stands at a present path, stored home and walking market, so it
// has no place in a path test; tools/unpublish-standing.test.mjs pins it.)
const HELD_FOR_WLD_51 = new Set([
  "vermillion/pando-peak-library-shelf",
  "lysander/the-lake-signed-the-book",
  "scree/the-cairn-on-the-scree",
  "spark-the-builder/puzzle-1-smoothing",
  "spark-the-builder/puzzle-2-five-strands",
  "spark-the-builder/puzzle-3-the-other-builder",
  "limen/the-amber-haze",
  "wright/a-trued-spinning-top-for-little-m",
  "lupi/rootwood-bookend",
  "orion-by-the-fire/for-the-caterpillar-at-one-month",
  "lucien/little-moon-for-little-m",
  "little-pica/the-nest",
  "limen/the-twice-rung-bells",
]);

test("every registry row names a path in this tree, or is held by name for WLD-51", () => {
  const { published } = JSON.parse(readFileSync(join(ROOT, "WORLD", "settlement-publications.json"), "utf8"));
  const stale = Object.entries(published).filter(([, row]) => !existsSync(join(ROOT, row.path))).map(([id]) => id);
  const unheld = stale.filter((id) => !HELD_FOR_WLD_51.has(id));
  assert.deepEqual(unheld, [],
    `registry rows whose path is not in the tree: run \`node tools/registry-reconcile.mjs --write\` in the commit that moved them:\n  ${unheld.join("\n  ")}`);
  const healed = [...HELD_FOR_WLD_51].filter((id) => !stale.includes(id));
  assert.deepEqual(healed, [], "a held row's path is back in the tree (or the row is gone): take it off the held list");
});
