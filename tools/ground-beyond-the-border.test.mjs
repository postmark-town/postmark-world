// ground-beyond-the-border.test.mjs — declared ground past the atlas's edge, and
// the one promise it makes: it never moves the atlas.
//
// The fixture is the record itself (WORLD/world-state.json + WORLD/skeleton.json).
// "Today" is the same skeleton with its grounds taken out, so every comparison is
// the world with and without ground beyond the border, on the same marks.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleWorld, atlasBoxOf, deriveHomeControlPoints, groundReach, groundsBeyondTheBorder, withGroundBeyondTheBorder } from "./world-build.mjs";
import { townGround } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const worldState = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const SKELETON = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
const TODAY = { ...SKELETON, features: SKELETON.features.filter((f) => f.kind !== "ground") };
const ATLAS = atlasBoxOf(SKELETON);
const CRAG = SKELETON.features.find((f) => f.id === "the-north-crag");

const withGround = assembleWorld({ worldState, skeleton: SKELETON }).heightfield;
const today = assembleWorld({ worldState, skeleton: TODAY }).heightfield;
const inAtlas = (x, y) => x >= ATLAS.x0 && x <= ATLAS.x1 && y >= ATLAS.y0 && y <= ATLAS.y1;
const box = (g) => ({ x0: Math.min(...g.ring_m.map((p) => p.x)), x1: Math.max(...g.ring_m.map((p) => p.x)), y0: Math.min(...g.ring_m.map((p) => p.y)), y1: Math.max(...g.ring_m.map((p) => p.y)) });

test("the skeleton states the atlas box and carries the north crag beyond it", () => {
  assert.deepEqual(ATLAS, { x0: -2425, x1: 5075, y0: -3800, y1: 8200 }, "the drawn map's frame at 5 m a pixel, origin (485, 760)");
  assert.ok(CRAG, "the north crag is the first ground");
  assert.equal(CRAG.kind, "ground");
  const r = groundReach(CRAG);
  assert.ok(r.y1 < ATLAS.y0, `its foot (to y ${r.y1}) stays north of the border (y ${ATLAS.y0})`);
});

test("ZERO change at every existing sited mark", () => {
  let n = 0;
  for (const m of worldState.marks) {
    if (m.kind !== "sited" || !Number.isFinite(m.at?.x)) continue;
    n++;
    assert.equal(withGround.elevationAt(m.at.x, m.at.y), today.elevationAt(m.at.x, m.at.y), `${m.id} moved`);
  }
  assert.ok(n > 500, `${n} sited marks checked`);
});

test("ZERO change anywhere on the atlas (a 50 m lattice over the whole drawn map)", () => {
  let n = 0;
  for (let x = ATLAS.x0; x <= ATLAS.x1; x += 50) for (let y = ATLAS.y0; y <= ATLAS.y1; y += 50) {
    n++;
    const a = withGround.elevationAt(x, y), b = today.elevationAt(x, y);
    if (a !== b) assert.fail(`the atlas moved at {${x}, ${y}}: ${b} → ${a}`);
  }
  assert.ok(n > 30000);
});

test("no seam: the ground just past the border meets the atlas's edge", () => {
  for (let x = ATLAS.x0; x <= ATLAS.x1; x += 10) {
    const jump = Math.abs(withGround.elevationAt(x, ATLAS.y0 - 0.01) - withGround.elevationAt(x, ATLAS.y0));
    assert.ok(jump < 0.01, `a ${jump.toFixed(3)} m step across the north border at x ${x}`);
  }
});

test("open country beyond the border, away from any ground, is today's", () => {
  const b = box(CRAG);
  for (let x = ATLAS.x0 - 2000; x <= ATLAS.x1 + 2000; x += 100) for (let y = ATLAS.y0 - 3000; y < ATLAS.y0; y += 100) {
    if (x > b.x0 - 400 && x < b.x1 + 400 && y > b.y0 - 400 && y < b.y1 + 400) continue;
    const d = Math.abs(withGround.elevationAt(x, y) - today.elevationAt(x, y));
    assert.ok(d < 0.01, `open country moved ${d.toFixed(3)} m at {${x}, ${y}}`);
  }
});

test("the crag: flat at its top, a cliff at its edge, the old ground at its foot", () => {
  const b = box(CRAG), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  for (const [x, y] of [[cx, cy], [b.x0 + 30, b.y0 + 30], [b.x1 - 30, b.y1 - 30], [cx, b.y1 - 10]])
    assert.ok(Math.abs(withGround.elevationAt(x, y) - CRAG.top_m) < 1.5, `top at {${x}, ${y}} is ${withGround.elevationAt(x, y)}`);
  const foot = CRAG.foot_gap_m + 60 + 10;
  for (const [x, y] of [[cx, b.y1 + foot], [b.x0 - foot, cy], [b.x1 + foot, cy], [cx, b.y0 - foot]])
    assert.ok(Math.abs(withGround.elevationAt(x, y) - today.elevationAt(x, y)) < 0.5, `foot at {${x}, ${y}} is off today's ground`);
  const fall = withGround.elevationAt(cx, b.y1) - withGround.elevationAt(cx, b.y1 + CRAG.foot_gap_m);
  assert.ok(fall > 80, `the south face falls ${fall.toFixed(0)} m in ${CRAG.foot_gap_m} m`);
});

test("a mark standing on the ground is not a control point (it cannot pull the atlas)", () => {
  const b = box(CRAG);
  const on = { kind: "sited", at: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } };
  const off = { kind: "sited", at: { x: 0, y: 0 } };
  assert.equal(deriveHomeControlPoints([on, off], { grounds: [CRAG] }).length, 1);
  const marks = [...worldState.marks, on];
  const a = assembleWorld({ worldState: { ...worldState, marks }, skeleton: SKELETON }).heightfield;
  for (let x = 2000; x <= 3500; x += 50) assert.equal(a.elevationAt(x, ATLAS.y0 + 25), today.elevationAt(x, ATLAS.y0 + 25), `x ${x}`);
});

test("a ground that reaches the atlas is refused, and grounds need the border declared", () => {
  const touching = { ...CRAG, id: "too-near", ring_m: CRAG.ring_m.map((p) => ({ x: p.x, y: p.y + 500 })) };
  assert.throws(() => groundsBeyondTheBorder({ ...SKELETON, features: [...TODAY.features, touching] }), /reaches the atlas/);
  const noBox = { ...SKELETON, _grid: { ...SKELETON._grid, atlas_box_m: undefined } };
  assert.throws(() => groundsBeyondTheBorder(noBox), /needs the border/);
});

// A ground at the closest lawful distance: its outer foot ring 1 m past the
// border. Here the rings alone cannot hold the atlas, so this is where the atlas
// box's own branch and the border's zero points each have to do their job (the
// north crag, 137 m out, is held by its rings alone; measured 2026-10-09).
test("a ground at the closest lawful distance: the atlas and the border still hold", () => {
  const r = CRAG.foot_gap_m + 60 + 1;
  const near = { ...CRAG, id: "near-test-ground", ring_m: [
    { x: 1000, y: ATLAS.y0 - r - 300 }, { x: 1400, y: ATLAS.y0 - r - 300 },
    { x: 1400, y: ATLAS.y0 - r }, { x: 1000, y: ATLAS.y0 - r },
  ] };
  const sk = { ...SKELETON, features: [...TODAY.features, near] };
  const hf = assembleWorld({ worldState, skeleton: sk }).heightfield;
  for (let x = 800; x <= 1600; x += 10) {
    for (const y of [ATLAS.y0, ATLAS.y0 + 5, ATLAS.y0 + 50, ATLAS.y0 + 200])
      assert.equal(hf.elevationAt(x, y), today.elevationAt(x, y), `the atlas moved at {${x}, ${y}}`);
    const jump = Math.abs(hf.elevationAt(x, ATLAS.y0 - 0.01) - hf.elevationAt(x, ATLAS.y0));
    assert.ok(jump < 0.05, `a ${jump.toFixed(3)} m step across the border at x ${x}`);
  }
  assert.ok(Math.abs(hf.elevationAt(1200, ATLAS.y0 - r - 150) - CRAG.top_m) < 1.5, "and the near ground still stands at its top");
});

// The promise BY CONSTRUCTION, not by geometry: inside the atlas box the answer
// is the base field's whatever the grounds say. Pinned directly, because with
// every lawful ground the foot rings already hold the atlas on their own (the two
// cases above stay green without this branch; measured 2026-10-09).
test("inside the atlas box the answer is the base field's, whatever the grounds say", () => {
  const base = { controlPoints: [], elevationAt: () => 10 };
  const g = { id: "pin", kind: "ground", ring_m: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }], top_m: 200, foot_gap_m: 40 };
  const hf = withGroundBeyondTheBorder(base, [g], { x0: 100, x1: 300, y0: 100, y1: 300 }); // a box drawn over the ground's top
  assert.equal(hf.elevationAt(200, 200), 10, "inside the box: the base, not the ground");
  assert.ok(Math.abs(hf.elevationAt(50, 50) - 200) < 1, "outside it: the ground");
});

test("with no ground the heightfield is today's own object, untouched", () => {
  const w = assembleWorld({ worldState, skeleton: TODAY }).heightfield;
  assert.equal(typeof w.elevationAt, "function");
  assert.equal(w.grounds, undefined, "no ground wrapper when there is no ground");
});

test("the drawn sheet does not grow to take in ground beyond the border", () => {
  const reg = { originPx: { x: 485, y: 760 }, mPerPx: 5 };
  const a = townGround(worldState.marks, SKELETON, reg).svgText.match(/viewBox="([^"]+)"/)?.[1];
  const b = townGround(worldState.marks, TODAY, reg).svgText.match(/viewBox="([^"]+)"/)?.[1];
  assert.ok(a, "the sheet has a viewBox");
  assert.equal(a, b);
});
