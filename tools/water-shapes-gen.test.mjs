// water-shapes-gen.test.mjs: the generator finds a water body's OWN record.
//
// tools/water-shapes-gen.mjs writes each water body's ring onto the one record
// that claims its feature (recordPathFor). WLD-97 part 3 put a second record on
// Garrison Lake's feature: the-town/the-garrison-valley, a landform carrying
// ground_m that links the survey without claiming it (world-build.mjs
// § claimsFeature). The generator must still find the lake's own mark, and a
// body line that merely says `feature: x` claims nothing.
//
// Run dry (no --write) on the real tree: it reads, prints, and writes nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRecord } from "./marks-fold.mjs";
import { claimsFeature } from "./world-build.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const VALLEY = join(ROOT, "WORLD/marks/the-town/the-garrison-valley/mark.md");

test("claimsFeature: a feature link claims, unless the record shapes ground beside it", () => {
  assert.equal(claimsFeature({ feature: "a-lake" }), true);
  assert.equal(claimsFeature({ feature: "a-lake", ground_m: 8 }), false);
  assert.equal(claimsFeature({ feature: "a-lake", ground_m: [6, 10] }), false);
  assert.equal(claimsFeature({}), false);
});

test("TWO RECORDS, ONE FEATURE: with the valley beside it, Garrison Lake's ring still goes to the lake's own mark", () => {
  const valley = parseRecord(readFileSync(VALLEY, "utf8"), VALLEY);
  assert.equal(valley.feature, "the-garrison-lake", "fixture: the valley links the lake's survey");
  assert.equal(valley.ground_m, 8);
  const out = execFileSync(process.execPath, [join(HERE, "water-shapes-gen.mjs")], { encoding: "utf8", cwd: ROOT });
  const block = out.split(/\r?\n\r?\n/).find((b) => /the-garrison-lake \(lake\)/.test(b));
  assert.ok(block, "the generator reports the lake");
  assert.match(block, /record\s+: WORLD\/marks\/let-there-be-light\/the-protected-grove\/the-garrison-lake\/mark\.md/);
  assert.doesNotMatch(out, /expected exactly one record/, "no water body is left without its record");
});
