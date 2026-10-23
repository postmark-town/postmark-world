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
import { pathToFileURL } from "node:url";
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
const KNOLL = { id: "the-town/a-test-knoll", kind: "landform", by: "the-town", at: { x: 2544, y: 175 }, extent: { w: 400, h: 200 }, ground_m: 31 };
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

test("the rule refuses a band violation, a mark not by the-town, a landform with no ground of its own, and ground_m on anything but a landform", () => {
  assert.deepEqual(groundStands(KNOLL, ANCHORS, SKELETON), { ground: { lo: 31, hi: 31 }, region: "the-high-ground", band: [30, 40] });
  assert.match(groundStands({ ...KNOLL, ground_m: 29 }, ANCHORS, SKELETON).refused, /outside the-high-ground's band \[30, 40\]/);
  assert.match(groundStands({ ...KNOLL, ground_m: [35, 41] }, ANCHORS, SKELETON).refused, /outside the-high-ground's band/);
  assert.match(groundStands({ ...KNOLL, by: "sage-reeves" }, ANCHORS, SKELETON).refused, /stays with the town and never passes to a household/);
  assert.match(groundStands({ ...KNOLL, at: undefined, extent: undefined }, ANCHORS, SKELETON).refused, /gives none/);
  // ONLY A LANDFORM SHAPES GROUND (21:03): ground_m on a sited mark, a thing, a predicate is refused
  for (const kind of ["sited", "thing", "predicate"])
    assert.ok(groundStands({ ...KNOLL, kind }, ANCHORS, SKELETON).refused.includes(`is a landform's own property (the-town/landform); this mark is kind: ${kind}`), kind);
  // the old form (kind: sited + class: landform) names the class too
  assert.equal(groundStands({ ...KNOLL, kind: "sited", class: "landform" }, ANCHORS, SKELETON).refused, undefined);
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
  const basin = { id: "the-town/a-test-basin", kind: "landform", by: "the-town", at: { x: 2575, y: -1160 }, extent: { w: 1000, h: 800 }, ground_m: 22 };
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
// a landform record, filed by id as the freeze requires
function addLandform(repo, slug, { by = "the-town", at, extent, ground_m, feature = null }) {
  const dir = join(repo, "WORLD", "marks", by, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "mark.md"), ["---", "kind: landform", `by: ${by}`, ...(by === "the-town" ? ["tier: constitution"] : []), "date: 2026-10-22",
    `at: { x: ${at.x}, y: ${at.y} }`, `extent: { w: ${extent.w}, h: ${extent.h} }`, ...(feature ? [`feature: ${feature}`] : []), `ground_m: ${ground_m}`,
    "---", "", "A test landform.", ""].join("\n"));
  return `${by}/${slug}`;
}

test("THE LINT, end to end: a town landform in band stands; out of band, a resident's, and ground_m on a sited mark are refused by name", () => {
  const repo = realTree();
  const basin = addLandform(repo, "a-lochan-basin", { at: { x: 2575, y: -1160 }, extent: { w: 500, h: 380 }, ground_m: 25 });                       // the-lochan [22, 28]
  const steep = addLandform(repo, "a-steep-valley", { at: { x: -1400, y: -2775 }, extent: { w: 920, h: 800 }, feature: "the-garrison-lake", ground_m: 60 }); // carved [7, 50]
  const theirs = addLandform(repo, "my-own-hollow", { by: "sol-of-garrison", at: { x: -1380, y: -2618 }, extent: { w: 300, h: 300 }, ground_m: 40 });
  addGround(repo, "let-there-be-light/the-lochan", "25");                                                                           // a sited town mark
  let out;
  try { out = execFileSync("node", [join(HERE, "mark-lint.mjs"), "--repo", repo], { encoding: "utf8" }); }
  catch (e) { out = String(e.stdout ?? "") + String(e.stderr ?? ""); }
  const errors = out.split(/\r?\n/).filter((l) => l.startsWith("[ERROR]"));
  const about = (slug) => errors.filter((l) => l.includes(slug + ":") && /ground_m/.test(l)).join(" ");
  assert.deepEqual(errors.filter((l) => l.includes("a-lochan-basin:")), [], "the town's basin is a clean record, ground_m and all");
  assert.ok(about("a-steep-valley").includes("outside [7, 50] (the-garrison-lake's surface to the-protected-grove's top)"), errors.join("\n"));
  assert.ok(about("my-own-hollow").includes("stays with the town and never passes to a household"), errors.join("\n"));
  assert.ok(about("let-there-be-light/the-lochan").includes("is a landform's own property (the-town/landform); this mark is kind: sited"), errors.join("\n"));

  // SHAPES GROUND ONLY (/l, 21:02–21:04): a landform is never a container, and nests in nothing
  const map = JSON.parse(execFileSync("node", ["-e", `import("${pathToFileURL(join(HERE, "marks-fold.mjs")).href}").then(({ loadMarks, containmentMap }) => process.stdout.write(JSON.stringify(containmentMap(loadMarks(process.argv[1])))))`, join(repo, "WORLD", "marks")], { encoding: "utf8", maxBuffer: 64 << 20 }));
  const ids = [basin, steep, theirs];
  const inChains = map.marks.filter((r) => r.chain.some((c) => ids.includes(c)));
  assert.deepEqual(inChains.map((r) => r.id), [], "no mark nests in a landform");
  for (const id of ids) assert.deepEqual(map.marks.find((r) => r.id === id)?.chain, ["the-town/let-there-be-light"], `${id} nests in nothing but the root`);

  // and the fold publishes ground_m, so the heightfield the town reads can lay it
  const fold = JSON.parse(execFileSync("node", [join(HERE, "marks-fold.mjs"), "--marks-dir", join(repo, "WORLD", "marks"), "--no-write", "--json", "--allow-stampless"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }));
  const b = (fold.marks ?? []).find((m) => m.id === basin);
  assert.equal(b?.ground_m, 25);
  assert.equal(b?.kind, "landform");
});

test("WATER CARVES: a landform linked to a water body is held between that water's surface and its region's top", () => {
  // Garrison Lake sits in the-protected-grove, band [30, 50]; its water stands at 7.
  const valley = { id: "the-town/a-test-valley", kind: "landform", by: "the-town", at: { x: -1400, y: -2775 }, extent: { w: 920, h: 800 }, feature: "the-garrison-lake", ground_m: 8 };
  assert.deepEqual(groundStands(valley, ANCHORS, SKELETON), { ground: { lo: 8, hi: 8 }, region: "the-protected-grove", band: [7, 50], carvedBy: "the-garrison-lake" });
  assert.match(groundStands({ ...valley, ground_m: 6 }, ANCHORS, SKELETON).refused, /outside \[7, 50\] \(the-garrison-lake's surface to the-protected-grove's top\)/);
  assert.match(groundStands({ ...valley, ground_m: 51 }, ANCHORS, SKELETON).refused, /outside \[7, 50\]/);
  // without the link, the upland's own band holds it
  const { feature, ...unlinked } = valley;
  assert.match(groundStands(unlinked, ANCHORS, SKELETON).refused, /outside the-protected-grove's band \[30, 50\]/);
  // a link to a feature with no surface carves nothing
  assert.match(groundStands({ ...valley, feature: "the-main-channel" }, ANCHORS, SKELETON).refused, /outside the-protected-grove's band \[30, 50\]/);
});

test("HELD TO THE SHORE: a landform linked to its water meets it at the valley floor, and fades only from the shore to its edge", () => {
  // Garrison Lake: centre -1400,-2775, radii 230 × 200, surface 7. A valley twice
  // its size, linked to it, ground_m 8 (the shape part 3 lays).
  const valley = { id: "the-town/a-test-valley", kind: "landform", by: "the-town", at: { x: -1400, y: -2775 }, extent: { w: 920, h: 800 }, feature: "the-garrison-lake", ground_m: 8 };
  const now = heightsOf([valley]);
  const unshaped = heightsOf([bare(valley)]);
  assert.equal(now(-1400, -2775), 7, "the water is flat at its surface");
  // 25 m past the north and south shores: the valley floor, not half way up its side
  // (faded from the centre instead, these read 27.12 m: a 20 m step at the water)
  for (const y of [-2550, -3000]) {
    const h = now(-1400, y);
    assert.ok(h >= 8 && h < 10, `25 m past the shore at y ${y}: ${h}`);
  }
  assert.ok(now(-1400, -2574) - 8 < 0.01, "a metre past the shore the ground stands at ground_m");
  // and it still fades to nothing at the valley's own edge
  for (const [x, y] of [[-1400, -3176], [-1400, -2374], [-1861, -2775], [-939, -2775]]) assert.equal(Object.is(now(x, y), unshaped(x, y)), true, `${x},${y} is outside the valley`);
  // a landform with no water still fades from its centre
  const r = 0.5, half = heightsOf([KNOLL])(2544 + 200 * r, 175), was = BEFORE(2544 + 200 * r, 175);
  assert.ok(Math.abs(half - (was + 0.5 * (31 - was))) < 1e-9, "half way out, a dry landform is half held");
});

test("STAYS IN ITS REGION (/j, ruled 2026-10-22 20:44): a landform whose outline leaves its region is refused, naming where it leaves to", () => {
  // the knoll at the high ground's anchor, stretched south until two corners stand nearer the east low hills
  const tall = { ...KNOLL, extent: { w: 400, h: 1000 } };
  const r = groundStands(tall, ANCHORS, SKELETON);
  assert.match(r.refused, /a landform stays in its region/);
  assert.match(r.refused, /leaves the-high-ground at 2744,675 \(into the-east-low-hills\)/);
  // a points ring is the outline when there is one: the same claim drawn inside the region stands
  const ring = { ...tall, points: [[2400, -300], [2700, -300], [2700, 300], [2400, 300]] };
  assert.equal(groundStands(ring, ANCHORS, SKELETON).refused, undefined);
  // and the heightfield lays none of a refused one
  assert.equal(heightsOf([tall])(2544, 175), heightsOf([bare(tall)])(2544, 175));
});

test("STAYS WITH THE TOWN (/k, ruled 2026-10-22 20:44): a landform passed to a household is refused, the pass named", () => {
  // the pass as DEC-16 makes it: the same record, `by:` moved to the household, the tier line dropped
  const town = { ...KNOLL, tier: "constitution" };
  assert.equal(groundStands(town, ANCHORS, SKELETON).refused, undefined, "the town's own landform stands");
  const { tier, ...passed } = { ...town, by: "sage-reeves", id: "sage-reeves/a-test-knoll" };
  assert.match(groundStands(passed, ANCHORS, SKELETON).refused,
    /a mark that shapes the ground stays with the town and never passes to a household .* this mark is by sage-reeves/);
});

test("A LANDFORM IS ITS OWN CLASS: mark's child beside sited, never sited, never ground, the town's alone to make", async () => {
  const kind = await import("./mark-kind.mjs");
  const { loadMarks } = await import("./marks-fold.mjs");
  const { mayMake } = await import("./admin-makers.mjs");
  const { classChain } = await import("./class-properties.mjs");
  const marks = loadMarks(join(ROOT, "WORLD/marks"));
  const idx = kind.kindIndexOf(marks);
  assert.deepEqual(classChain(idx, "landform").map((c) => String(c.class)), ["landform", "mark", "postmark-node"], "landform extends mark, a sibling of sited");
  for (const lf of [KNOLL, { ...KNOLL, kind: "sited", class: "landform" }]) {
    assert.equal(kind.isLandform(lf), true);
    assert.equal(kind.isSited(lf), false, "the place-proxy readers pass it by");
    assert.equal(kind.isGround(lf), false);
  }
  assert.equal(kind.standingOf(KNOLL, idx), "landform");
  assert.equal(kind.standingOf(KNOLL, null), "landform", "even with no class tree in hand");
  assert.equal(kind.isSitedIn(KNOLL, idx), false, "the chain readers (the fold's containment) pass it by");
  assert.equal(kind.isGroundIn(KNOLL, idx), false);
  // only the town makes one: the class answers makers: false, so the lane wall refuses a resident's
  assert.equal(mayMake({ klass: "landform", by: "sage-reeves", marks, registry: {} }).may, false);
  // and a landform lays no home point: the densification reads sited marks only
  const { deriveHomeControlPoints } = await import("./world-build.mjs");
  assert.deepEqual(deriveHomeControlPoints([KNOLL], ANCHORS), []);
});
