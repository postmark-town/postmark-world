// registry-paths.test.mjs — every row of the publication registry names a path
// that is in this tree (postmark#3757).
//
// A row left behind by an act that moved its file names a path that is not on
// main. Until WLD-51's ruling 2 the sweep skipped such a row, so its mark was
// one the sweep could no longer judge, and, until 10-14, a household was warned
// of a sweep that never came. The sweep now finds a stale row's mark where it
// stands (unpublish-verdict.mjs § STALE_ROWS, "rederive"), but the office's
// stakes warning asks the registered path, so the registry still tells the
// truth: an act that moves a published file reconciles the registry in the
// same commit, `node tools/registry-reconcile.mjs --write`.
//
// NO ROW IS HELD. The 13 rows that waited here on the founder were repointed on
// 2026-10-15, after Darko ruled them on 10-14 14:51: "just take them".

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("every registry row names a path in this tree", () => {
  const { published } = JSON.parse(readFileSync(join(ROOT, "WORLD", "settlement-publications.json"), "utf8"));
  const stale = Object.entries(published).filter(([, row]) => !existsSync(join(ROOT, row.path))).map(([id]) => id);
  assert.deepEqual(stale, [],
    `registry rows whose path is not in the tree: run \`node tools/registry-reconcile.mjs --write\` in the commit that moved them:\n  ${stale.join("\n  ")}`);
});
