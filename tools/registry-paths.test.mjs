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
// on the founder (WLD-51). The verb's own plan names them (its `held` set), so
// this test asks the plan rather than keeping a second list by hand (WLD-101,
// 2026-10-21). A held row that heals (its path is back in the tree, or the row
// is gone) is simply no longer stale, and never turns a crossing red.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reconcilePlan, reconcileRepo } from "./registry-reconcile.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The stale rows the reconcile verb would NOT hold: each one is a row an act
// left behind, and the verb (or a person, for an unresolved row) owes it.
function unheldStale(published, plan, pathExists) {
  const held = new Set(plan.held.map((r) => r.id));
  const owed = new Map([...plan.repairs, ...plan.removed, ...plan.unresolved].map((r) => [r.id, r.why]));
  return Object.entries(published)
    .filter(([id, row]) => !pathExists(row.path) && !held.has(id))
    .map(([id]) => `${id}${owed.has(id) ? ` (${owed.get(id)})` : ""}`);
}

test("every registry row names a path in this tree, or is held by the reconcile verb for WLD-51", () => {
  const { published } = JSON.parse(readFileSync(join(ROOT, "WORLD", "settlement-publications.json"), "utf8"));
  const { plan } = reconcileRepo(ROOT);
  const unheld = unheldStale(published, plan, (path) => existsSync(join(ROOT, path)));
  assert.deepEqual(unheld, [],
    `registry rows whose path is not in the tree: run \`node tools/registry-reconcile.mjs --write\` in the commit that moved them:\n  ${unheld.join("\n  ")}`);
});

test("the check CAN fail: a stale row the verb would not hold is red; a held row and a healed row are not", () => {
  const published = {
    "a/held": { path: "WORLD/marks/gone/held/mark.md", class: "commons" },       // stored commons, walks commons: held
    "b/owed": { path: "WORLD/marks/gone/owed/mark.md", class: "home" },          // stored home: safe to repoint, so owed
    "c/healed": { path: "WORLD/marks/here/healed/mark.md", class: "commons" },   // its path is back: not stale
  };
  const filingOf = (id) => `WORLD/marks/${id}/mark.md`;
  const tierOf = () => "market";
  const pathExists = (path) => path.startsWith("WORLD/marks/here/");
  const plan = reconcilePlan(published, { filingOf, tierOf, pathExists });
  assert.deepEqual(plan.held.map((r) => r.id), ["a/held"]);
  assert.deepEqual(unheldStale(published, plan, pathExists), ["b/owed (path)"]);
  // the same tree once the owed row is repointed: green, with the held row still stale and the healed one never asked
  const repaired = { ...published, "b/owed": { ...published["b/owed"], path: "WORLD/marks/here/owed/mark.md" } };
  assert.deepEqual(unheldStale(repaired, reconcilePlan(repaired, { filingOf, tierOf, pathExists }), pathExists), []);
});
