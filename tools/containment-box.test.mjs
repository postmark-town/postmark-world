// containment-box.test.mjs — marksContain's box precheck (POS-1219) answers exactly what the per-cell count answers.
//
// THE RULE (POS-1219, 2026-11-24): "a bounding-box precheck before point-in-polygon (cheap, provably identical answers)". Prod's office spent 43% of its
// main thread's busy time in marksContain's per-cell ring test (tools/geometry.mjs § THE BOX PRECHECK says why and proves each verdict).
//
//   1. boxVerdict IS SOUND: on seeded random star-shaped rings and rects, a box it calls "in" has every sampled point inside by pointInPolygon /
//      pointInRect, and a box it calls "out" has none (corners, centre, edge midpoints and random points, flush and near-edge boxes included);
//   2. marksContain EQUALS ITS EXHAUSTIVE COUNT (`exhaustive: true`, the per-cell path as it was) on a concave ring past the rasterize cap and on a rect
//      outer, for inners wholly inside, wholly outside, in the ring's notch (inside its box, outside its shape), straddling with the centre inside,
//      straddling with it outside, flush with a rect's edge, ringed and rect inners, sub-cell marks, at frac 0, 0.5, 0.99 and 1;
//   3. THE VERDICT FIRES where it should: "in" for a box well inside, "out" far away and in the notch, null for a box an edge passes through.
// The whole World's record is compared old source against new in the PR (every unrasterizable ring against every mark, every rect against every
// irregular mark); this file keeps the shapes that can tell the two apart.
//
// FLIPS (restore with `git checkout HEAD -- tools/geometry.mjs`):
//   · boxVerdict: drop the edge loop (answer by the centre alone)            → 2 reds (straddling, centre inside) and 1 reds
//   · marksContain: answer "out" as plain false                               → 2 reds (frac 0)
//   · boxVerdict: the rect "in" test with > for >=                            → 3 reds (the flush box)
//   · boxVerdict: the ring "out" test without BOX_EPS on the x sides          → not reddened by any shape here (it guards a rounding case; said so)
//   node --test tools/containment-box.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { marksContain, boxVerdict, pointInPolygon, pointInRect, coverage, COVERAGE_CELL_M } from "./geometry.mjs";

// mulberry32: reds reproduce
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ringMark = (id, pts) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { id, kind: "sited", at: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, extent: { w: x1 - x0, h: y1 - y0 }, points: pts };
};
const rectMark = (id, x, y, w, h) => ({ id, kind: "sited", at: { x, y }, extent: { w, h } });

// ── 1 · boxVerdict is sound ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("1 · boxVerdict: every box it calls in or out is in or out at every sampled point (seeded star rings and rects)", () => {
  const r = rng(1219);
  let verdicts = { in: 0, out: 0, null: 0 };
  for (let n = 0; n < 300; n++) {
    const cx = (r() - 0.5) * 20000, cy = (r() - 0.5) * 20000, k = 3 + Math.floor(r() * 30);
    const ring = Array.from({ length: k }, (_, i) => { const a = (2 * Math.PI * i) / k, rad = 200 + r() * 3000; return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) }; });
    const outer = r() < 0.75 ? ringMark(`r${n}`, ring) : rectMark(`q${n}`, cx, cy, 300 + r() * 5000, 300 + r() * 5000);
    for (let b = 0; b < 25; b++) {
      const w = r() * 1500, h = r() * 1500, bx = cx + (r() - 0.5) * 9000, by = cy + (r() - 0.5) * 9000;
      const box = { x0: bx - w / 2, x1: bx + w / 2, y0: by - h / 2, y1: by + h / 2 };
      const v = boxVerdict(outer, box);
      verdicts[String(v)]++;
      if (v == null) continue;
      const pts = [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1], [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2],
        [box.x0, (box.y0 + box.y1) / 2], [box.x1, (box.y0 + box.y1) / 2], [(box.x0 + box.x1) / 2, box.y0], [(box.x0 + box.x1) / 2, box.y1]];
      for (let s = 0; s < 40; s++) pts.push([box.x0 + r() * (box.x1 - box.x0), box.y0 + r() * (box.y1 - box.y0)]);
      for (const [x, y] of pts) {
        const inside = outer.points ? pointInPolygon(x, y, outer.points) : pointInRect(x, y, { x: outer.at.x, y: outer.at.y, w: outer.extent.w, h: outer.extent.h });
        // LAW (POS-1219): "provably identical answers"
        assert.equal(inside, v === "in", `outer ${outer.id}, box ${JSON.stringify(box)}: boxVerdict said ${v}, the point (${x}, ${y}) is ${inside ? "inside" : "outside"}`);
      }
    }
  }
  assert.ok(verdicts.in > 50 && verdicts.out > 50 && verdicts.null > 50, `control: every verdict was exercised: ${JSON.stringify(verdicts)}`);
});

// ── 2 · marksContain equals its exhaustive count ────────────────────────────────────────────────────────────────────────────────────────────────────
// A U, 8 km on a side: past the rasterize cap (MAX_COVERAGE_CELLS, 1M cells at 5 m), so it takes the ring branch the precheck changes.
const U = ringMark("test/the-u", [{ x: 0, y: 0 }, { x: 8000, y: 0 }, { x: 8000, y: 8000 }, { x: 5500, y: 8000 }, { x: 5500, y: 3000 }, { x: 2500, y: 3000 }, { x: 2500, y: 8000 }, { x: 0, y: 8000 }]);
const FRAME = rectMark("test/the-frame", 4000, 4000, 8000, 8000);
const INNERS = {
  "inside the left arm": rectMark("i1", 1200, 6000, 400, 400),
  "inside the base": rectMark("i2", 4000, 1500, 600, 300),
  "far outside": rectMark("i3", 20000, 20000, 300, 300),
  "in the notch (inside the box, outside the shape)": rectMark("i4", 4000, 6000, 800, 800),
  "straddling, centre inside": rectMark("i5", 2400, 6000, 300, 300),
  "straddling, centre outside": rectMark("i6", 2600, 6000, 300, 300),
  "flush with the frame's edge": rectMark("i7", 200, 4000, 400, 400),
  "a ring inside the base": ringMark("i8", [{ x: 3000, y: 500 }, { x: 5000, y: 600 }, { x: 4500, y: 2000 }, { x: 3200, y: 1800 }]),
  "a ring in the notch": ringMark("i9", [{ x: 3000, y: 4000 }, { x: 5000, y: 4100 }, { x: 4500, y: 7000 }, { x: 3200, y: 6800 }]),
  "a ring across the notch's edge": ringMark("i10", [{ x: 2000, y: 5000 }, { x: 3000, y: 5050 }, { x: 2900, y: 6500 }, { x: 2100, y: 6400 }]),
  "sub-cell, inside": rectMark("i11", 1000, 1000, 1, 1),
  "sub-cell, in the notch": rectMark("i12", 4000, 5000, 1, 1),
};

test("2 · control: the U is past the rasterize cap, so marksContain takes the ring branch", () => {
  assert.equal(coverage(U), null, "the U rasterizes to null (too many cells)");
  assert.ok(COVERAGE_CELL_M === 5);
});

for (const [outerName, outer] of [["the U (a ring past the cap)", U], ["the frame (a rect)", FRAME]]) {
  for (const [name, inner] of Object.entries(INNERS)) {
    test(`2 · ${outerName} ∋ ${name}: the answer is the exhaustive count's at every frac`, () => {
      for (const frac of [0, 0.5, 0.99, 1]) {
        const want = marksContain(outer, inner, { frac, exhaustive: true });
        // LAW (POS-1219): "provably identical answers"
        assert.equal(marksContain(outer, inner, { frac }), want, `frac ${frac}: the box precheck answered differently from counting every cell`);
      }
    });
  }
}

test("2 · the shapes tell inside from outside (controls: the exhaustive answers themselves)", () => {
  assert.equal(marksContain(U, INNERS["inside the left arm"], { exhaustive: true }), true);
  assert.equal(marksContain(U, INNERS["in the notch (inside the box, outside the shape)"], { exhaustive: true }), false);
  assert.equal(marksContain(U, INNERS["straddling, centre inside"], { exhaustive: true }), false, "a third of it is in the notch");
  assert.equal(marksContain(U, INNERS["far outside"], { frac: 0, exhaustive: true }), true, "frac 0 holds anything: 0 >= 0");
  assert.equal(marksContain(FRAME, INNERS["a ring inside the base"], { exhaustive: true }), true);
});

// ── 3 · the verdict fires ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("3 · boxVerdict fires: in well inside, out far away and in the notch, null where an edge passes through; a flush rect box is in", () => {
  const box = (m) => ({ x0: m.at.x - m.extent.w / 2, x1: m.at.x + m.extent.w / 2, y0: m.at.y - m.extent.h / 2, y1: m.at.y + m.extent.h / 2 });
  assert.equal(boxVerdict(U, box(INNERS["inside the left arm"])), "in");
  assert.equal(boxVerdict(U, box(INNERS["far outside"])), "out");
  assert.equal(boxVerdict(U, box(INNERS["in the notch (inside the box, outside the shape)"])), "out");
  assert.equal(boxVerdict(U, box(INNERS["straddling, centre inside"])), null);
  assert.equal(boxVerdict(FRAME, box(INNERS["flush with the frame's edge"])), "in", "a box flush with a rect's edge is inside it (pointInRect is inclusive)");
  assert.equal(boxVerdict(FRAME, box(INNERS["far outside"])), "out");
  assert.equal(boxVerdict(FRAME, { x0: 7900, x1: 8100, y0: 100, y1: 200 }), null, "a box over the frame's edge");
});
