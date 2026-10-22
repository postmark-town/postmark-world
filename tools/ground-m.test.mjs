// ground-m.test.mjs: the ground the town shapes (WLD-97 part 2, ruled
// 2026-10-22: "the town should own the terraform for now").
//
// A sited mark by the-town may carry `ground_m: <m>` or `ground_m: [lo, hi]`.
// The lint refuses it on any other mark and outside the band of the mark's
// region; the heightfield lays it as a control point whose reach is the mark's
// own extent, and a lake's `surface_m` wins inside the water. With none written,
// the world is the world it was.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleWorld, regionAnchors, groundOf, groundStands, shapeGround } from "./world-build.mjs";
import { buildHeightfield } from "./world-engine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SKELETON = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
const WORLD_STATE = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const ANCHORS = regionAnchors(SKELETON);
const SCRATCH = [];
after(() => { for (const d of SCRATCH) rmSync(d, { recursive: true, force: true }); });

// A town mark over open ground in the-high-ground (band [30, 40]), well away from
// any lake: its anchor stands at 2544,175.
const KNOLL = { id: "the-town/a-test-knoll", kind: "sited", by: "the-town", at: { x: 2544, y: 175 }, extent: { w: 400, h: 200 }, ground_m: 31 };
const withMarks = (...extra) => ({ ...WORLD_STATE, marks: [...WORLD_STATE.marks, ...extra] });
const heightsOf = (marks) => assembleWorld({ worldState: withMarks(...marks), skeleton: SKELETON }).heightfield.elevationAt;
// The same marks with no ground_m written: a sited mark is a home control point
// whether or not it shapes the ground, so "before" carries the mark too.
const bare = ({ ground_m, ...m }) => m;
const BEFORE = heightsOf([bare(KNOLL)]);

test("ground_m reads as a height or a [lo, hi] range, and anything else is malformed", () => {
  assert.equal(groundOf({}), null);
  assert.deepEqual(groundOf({ ground_m: 8 }), { lo: 8, hi: 8 });
  assert.deepEqual(groundOf({ ground_m: [6, 10] }), { lo: 6, hi: 10 });
  for (const bad of ["8", [10, 6], [1, 2, 3], [1, "2"], NaN]) assert.deepEqual(groundOf({ ground_m: bad }), { malformed: true }, JSON.stringify(bad));
});

test("the rule refuses a band violation, a mark not by the-town, and a mark with no ground of its own", () => {
  assert.deepEqual(groundStands(KNOLL, ANCHORS, SKELETON), { ground: { lo: 31, hi: 31 }, region: "the-high-ground", band: [30, 40] });
  assert.match(groundStands({ ...KNOLL, ground_m: 29 }, ANCHORS, SKELETON).refused, /outside the-high-ground's band \[30, 40\]/);
  assert.match(groundStands({ ...KNOLL, ground_m: [35, 41] }, ANCHORS, SKELETON).refused, /outside the-high-ground's band/);
  assert.match(groundStands({ ...KNOLL, by: "sage-reeves" }, ANCHORS, SKELETON).refused, /only a mark by the-town may shape the ground/);
  assert.match(groundStands({ ...KNOLL, kind: "predicate", at: undefined, extent: undefined }, ANCHORS, SKELETON).refused, /stands on no ground of its own/);
  assert.equal(groundStands({ ...KNOLL, ground_m: undefined }, ANCHORS, SKELETON), null);
});

test("ABSENT CHANGES NOTHING: with no ground_m anywhere the heightfield is the one buildHeightfield made", () => {
  const hf = buildHeightfield({ controlPoints: [{ x: 0, y: 0, h: 5 }] });
  assert.equal(shapeGround(hf, WORLD_STATE.marks, ANCHORS, SKELETON), hf);
  assert.equal(WORLD_STATE.marks.some((m) => m.ground_m !== undefined), false, "the published world carries none yet");
});

test("THE REACH STAYS INSIDE THE EXTENT: the centre is held at ground_m, and nothing outside the ellipse moves", () => {
  const now = heightsOf([KNOLL]);
  assert.notEqual(BEFORE(2544, 175), 31, "the fixture must move something");
  assert.equal(now(2544, 175), 31, "the centre stands at ground_m");
  let outside = 0, inside = 0;
  for (let x = 2544 - 400; x <= 2544 + 400; x += 10) {
    for (let y = 175 - 200; y <= 175 + 200; y += 10) {
      const dx = (x - 2544) / 200, dy = (y - 175) / 100;
      if (dx * dx + dy * dy >= 1) { assert.equal(Object.is(now(x, y), BEFORE(x, y)), true, `${x},${y} is outside the extent and moved`); outside += 1; }
      else inside += 1;
    }
  }
  assert.ok(outside > 1000 && inside > 500, `${outside} outside, ${inside} inside`);
  // and it fades: half way out, the ground is between the two
  const half = now(2644, 175), was = BEFORE(2644, 175);
  assert.ok((half - 31) * (half - was) < 0, `half way out reads ${half}, between ${was} and 31`);
});

test("a range holds the ground inside it: ground already inside is left alone, ground outside is brought to the edge", () => {
  const h0 = BEFORE(2544, 175);
  assert.equal(heightsOf([{ ...KNOLL, ground_m: [30, 40] }])(2544, 175), h0, `${h0} is inside [30, 40]`);
  assert.equal(heightsOf([{ ...KNOLL, ground_m: [30, 31] }])(2544, 175), Math.min(31, Math.max(30, h0)));
});

test("the heightfield honors only what the rule accepts: a resident's ground_m and an out-of-band one lay nothing", () => {
  for (const m of [{ ...KNOLL, by: "sage-reeves" }, { ...KNOLL, ground_m: 50 }]) {
    const now = heightsOf([m]);
    assert.equal(now(2544, 175), BEFORE(2544, 175), JSON.stringify({ by: m.by, ground_m: m.ground_m }));
  }
});

test("THE WATER WINS INSIDE THE WATER: a town mark over the lochan holds its shore, and the lake reads its surface_m", () => {
  const lochan = SKELETON.features.find((f) => f.id === "the-lochan");
  assert.equal(lochan.surface_m, 25);
  const basin = { id: "the-town/a-test-basin", kind: "sited", by: "the-town", at: { x: 2575, y: -1160 }, extent: { w: 1000, h: 800 }, ground_m: 22 };
  const now = heightsOf([basin]);
  const unshaped = heightsOf([bare(basin)]);
  assert.equal(now(2575, -1160), 25, "the lake's centre is its surface, not the ground_m under it");
  assert.equal(now(2575 + 290, -1160), 25, "inside the lake, near its east shore");
  const shore = now(2575 + 320, -1160), was = unshaped(2575 + 320, -1160);
  assert.notEqual(shore, 25, "just outside the water it is ground again");
  assert.notEqual(shore, was, "and the basin's reach moved it");
  // a lake with no town ground_m over it is left as it was (the water is read only where ground is shaped)
  assert.equal(heightsOf([KNOLL])(2575, -1160), BEFORE(2575, -1160));
});

// ── the lint and the fold, end to end on a copy of the real tree ─────────────
function realTree() {
  const repo = mkdtempSync(join(tmpdir(), "ground-m-"));
  SCRATCH.push(repo);
  mkdirSync(join(repo, "WORLD"), { recursive: true });
  cpSync(join(ROOT, "LOGOS"), join(repo, "LOGOS"), { recursive: true });
  copyFileSync(join(ROOT, "WRITES.md"), join(repo, "WRITES.md"));
  for (const f of ["skeleton.json", "filing-freeze.json", "households.json"]) copyFileSync(join(ROOT, "WORLD", f), join(repo, "WORLD", f));
  cpSync(join(ROOT, "WORLD", "marks"), join(repo, "WORLD", "marks"), { recursive: true });
  return repo;
}
function addGround(repo, rel, value) {
  const p = join(repo, "WORLD", "marks", ...rel.split("/"), "mark.md");
  const t = readFileSync(p, "utf8");
  assert.match(t, /^---\r?\n/, rel);
  writeFileSync(p, t.replace(/\r?\n---\r?\n/, `\nground_m: ${value}\n---\n`));
}

test("THE LINT, end to end: in band on a town mark stands; out of band, and on a resident's mark, are refused by name", () => {
  const repo = realTree();
  addGround(repo, "let-there-be-light/the-lochan", "25");                           // the-town, the-lochan [22, 28]
  addGround(repo, "let-there-be-light/the-protected-grove/the-garrison-lake", "60"); // the-town, the-protected-grove [30, 50]
  addGround(repo, "let-there-be-light/the-protected-grove", "40");                  // sol-of-garrison's own mark
  let out;
  try { out = execFileSync("node", [join(HERE, "mark-lint.mjs"), "--repo", repo], { encoding: "utf8" }); }
  catch (e) { out = String(e.stdout ?? "") + String(e.stderr ?? ""); }
  const errors = out.split(/\r?\n/).filter((l) => l.startsWith("[ERROR]"));
  assert.equal(errors.filter((l) => /ground_m/.test(l)).length, 2, errors.join("\n"));
  assert.ok(errors.some((l) => /the-garrison-lake/.test(l) && /outside the-protected-grove's band \[30, 50\]/.test(l)), errors.join("\n"));
  assert.ok(errors.some((l) => /the-protected-grove:/.test(l) && /only a mark by the-town/.test(l)), errors.join("\n"));
  assert.equal(errors.some((l) => /the-lochan/.test(l)), false, "the lochan's 25 stands");

  // and the fold publishes it, so the heightfield the town reads can lay it
  const fold = JSON.parse(execFileSync("node", [join(HERE, "marks-fold.mjs"), "--marks-dir", join(repo, "WORLD", "marks"), "--no-write", "--json", "--allow-stampless"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }));
  const lochan = (fold.marks ?? []).find((m) => m.id === "the-town/the-lochan");
  assert.equal(lochan?.ground_m, 25);
});
