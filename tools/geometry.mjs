// geometry.mjs — the ONE definition of a mark's rect and of containment.
//
// Pure and browser-safe (zero imports, no node:*). Extracted from marks-fold.mjs
// so both the fold (Node, disk) and the verbs (browser bundle) import the same
// `contains` — the one-contains invariant that keeps the fold's computed edges
// and the lint's "you cannot lie with an edge" from ever disagreeing, now
// expressed one level down where a browser bundle can reach it. marks-fold.mjs
// re-exports these so mark-lint.mjs's existing import path is unchanged.
//
// Rects are centered on `at`, sized by `extent`.
export const rect = (mk) => ({ x: mk.at?.x ?? 0, y: mk.at?.y ?? 0, w: mk.extent?.w ?? 1, h: mk.extent?.h ?? 1 });
export function overlapArea(a, b) {
  const dx = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
  const dy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
  return dx > 0 && dy > 0 ? dx * dy : 0;
}
export const contains = (outer, inner) => overlapArea(outer, inner) >= 0.99 * inner.w * inner.h;

// ─────────────────────────────────────────────────────────────────────────────
// COVERAGE — a mark's true footprint as a set of grid cells (Keemin's ruling,
// 2026-07-23: compute a mark's extent as the set of grid coordinates it
// encompasses, allow polygon-style definition for irregular things like the
// river). This is ADDITIVE: the three primitives above are untouched and remain
// the analytic rect path, so rect-vs-rect stays byte-identical for the whole
// current record. `marksContain`/`marksOverlapArea` below use coverage cell-sets
// ONLY when a party is irregular (carries a polygon ring or a resolved feature
// polyline); otherwise they delegate to the analytic `contains`/`overlapArea`.
//
// Grid resolution for coverage is a DIAL. The 1 m grid stays the coordinate
// canon (at/extent are 1 m); coverage COARSENS to keep set sizes tractable
// (town ≈ 7.5×10.5 km). Movable by ruling, never silently.
export const COVERAGE_CELL_M = 5;
// A rasterization is refused past this many cells — coverage is for irregular /
// small marks, never map-scale rects (those stay analytic). marksContain falls
// back to the analytic bbox rather than materialize an intractable set.
const MAX_COVERAGE_CELLS = 1_000_000;

const cellKey = (cx, cy) => cx + "," + cy;
const cellIndex = (v, cell) => Math.floor(v / cell);
const cellCenter = (i, cell) => (i + 0.5) * cell;
const lerp = (a, b, t) => a + (b - a) * t;

// the polygon ring of a mark, if it carries one (SVG-points style: a closed ring
// of grid-meter vertices, `[{x,y}…]` or `[[x,y]…]`). ≥3 vertices to be a shape.
export function polygonOf(mark) {
  const pts = mark?.points;
  if (!Array.isArray(pts) || pts.length < 3) return null;
  return pts.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y }));
}
// A resolved feature swath: { line: [{x,y,w_m?}…], width? } — the caller (fold)
// follows a mark's `feature:` link into the skeleton and passes the polyline here
// (geometry.mjs stays pure: it never reads the skeleton itself).
const hasFeatureLine = (feature) => !!(feature && Array.isArray(feature.line) && feature.line.length >= 2);

// Is this mark expressed IRREGULARLY (a real shape), vs a plain at/extent rect?
export function isIrregular(mark, feature = null) {
  return !!(polygonOf(mark) || hasFeatureLine(feature));
}

// The bounding box of a points ring (accepts [{x,y}…] or [[x,y]…]).
export function polygonBBox(ring) {
  if (!Array.isArray(ring) || !ring.length) return null;
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const p of ring) {
    const x = Array.isArray(p) ? p[0] : p.x, y = Array.isArray(p) ? p[1] : p.y;
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  return { minx, maxx, miny, maxy };
}

// Claim-honesty (SCHEMA v2: the ring's bbox IS the mark's declared at/extent).
// True when there is no ring (nothing to check) or its bbox matches at/extent
// within `tol`. The lint enforces this so the coarse claim never lies about the
// fine shape — the gate exists BEFORE the first record that carries a ring.
export function ringMatchesClaim(mark, tol = 0.5) {
  const ring = polygonOf(mark);
  if (!ring) return true;
  const bb = polygonBBox(ring), r = rect(mark);
  return Math.abs(bb.minx - (r.x - r.w / 2)) <= tol && Math.abs(bb.maxx - (r.x + r.w / 2)) <= tol
    && Math.abs(bb.miny - (r.y - r.h / 2)) <= tol && Math.abs(bb.maxy - (r.y + r.h / 2)) <= tol;
}

// coverage(mark, {cell, feature}) → Set<cellKey>. Rasterizer by outward
// expression: polygon ring · feature polyline+width · rect box. Returns null if
// the rasterization would exceed MAX_COVERAGE_CELLS (caller falls back analytic).
export function coverage(mark, { cell = COVERAGE_CELL_M, feature = null } = {}) {
  if (feature === null) {
    const cached = coverageCache.get(mark)?.get(cell);
    if (cached !== undefined) return cached;
  }
  const set = coverageUncached(mark, cell, feature);
  if (feature === null) {
    let per = coverageCache.get(mark);
    if (!per) coverageCache.set(mark, (per = new Map()));
    per.set(cell, set);
  }
  return set;
}
// Memoized on the RECORD OBJECT, because rasterizing is the expensive half and
// `placementParent` asks the same question of the same few big marks for every
// mark in the tree. Before the regions took their true shape the only irregular
// outers were the water, and re-rasterizing them cost little; twelve ringed
// regions of ~100k cells each turned one fold into seventy seconds.
//
// The cache is keyed by object identity and holds while the record does, so it
// is correct exactly as long as a loaded mark's geometry is read-only after
// loading — which is the tree's own contract (`loadMarks` composes `at` and
// `points` into world coordinates once, and every consumer reads from there). A
// caller that means to change a shape builds a new record; that new object gets
// its own entry. Feature-backed coverage is not cached: the feature is a second
// argument the key would have to carry, and the swaths are few.
const coverageCache = new WeakMap();
function coverageUncached(mark, cell, feature) {
  const poly = polygonOf(mark);
  if (poly) return rasterizePolygon(poly, cell);
  if (hasFeatureLine(feature)) return rasterizePolyline(feature.line, feature.width, cell);
  return rasterizeRect(rect(mark), cell);
}

function rasterizeRect(r, cell) {
  const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, y0 = r.y - r.h / 2, y1 = r.y + r.h / 2;
  const cx0 = cellIndex(x0, cell), cx1 = cellIndex(x1, cell), cy0 = cellIndex(y0, cell), cy1 = cellIndex(y1, cell);
  if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > MAX_COVERAGE_CELLS) return null;
  const set = new Set();
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
    const px = cellCenter(cx, cell), py = cellCenter(cy, cell);
    if (px >= x0 && px <= x1 && py >= y0 && py <= y1) set.add(cellKey(cx, cy));
  }
  return set;
}

function rasterizePolygon(ring, cell) {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const p of ring) { if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y; }
  const cx0 = cellIndex(minx, cell), cx1 = cellIndex(maxx, cell), cy0 = cellIndex(miny, cell), cy1 = cellIndex(maxy, cell);
  if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > MAX_COVERAGE_CELLS) return null;
  const set = new Set();
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++)
    if (pointInPolygon(cellCenter(cx, cell), cellCenter(cy, cell), ring)) set.add(cellKey(cx, cy));
  return set;
}

// A polyline+width swath. Width may be per-vertex (`w_m`, as the channel
// centerline carries) or a scalar `width`; the half-width interpolates along each
// segment. Iterated PER SEGMENT (local bbox), never the whole map bbox, so a long
// thin river stays tractable.
function rasterizePolyline(line, width, cell) {
  const set = new Set();
  const half = (i) => (line[i]?.w_m ?? line[i]?.w ?? width ?? cell) / 2;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1], hw = Math.max(half(i), half(i + 1));
    const cx0 = cellIndex(Math.min(a.x, b.x) - hw, cell), cx1 = cellIndex(Math.max(a.x, b.x) + hw, cell);
    const cy0 = cellIndex(Math.min(a.y, b.y) - hw, cell), cy1 = cellIndex(Math.max(a.y, b.y) + hw, cell);
    if (set.size + (cx1 - cx0 + 1) * (cy1 - cy0 + 1) > MAX_COVERAGE_CELLS) return null;
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
      const px = cellCenter(cx, cell), py = cellCenter(cy, cell);
      const { d, t } = distToSegment(px, py, a.x, a.y, b.x, b.y);
      if (d <= lerp(half(i), half(i + 1), t)) set.add(cellKey(cx, cy));
    }
  }
  return set;
}

// Exported for the water shape generator, which validates a generated ring against
// the water oracle point by point. One ray-cast in the repo, not two.
export function pointInPolygon(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, yi = ring[i].y, xj = ring[j].x, yj = ring[j].y;
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}
export function pointInRect(px, py, r) { return px >= r.x - r.w / 2 && px <= r.x + r.w / 2 && py >= r.y - r.h / 2 && py <= r.y + r.h / 2; }

export const rectCorners = (r) => [
  { x: r.x - r.w / 2, y: r.y - r.h / 2 }, { x: r.x + r.w / 2, y: r.y - r.h / 2 },
  { x: r.x + r.w / 2, y: r.y + r.h / 2 }, { x: r.x - r.w / 2, y: r.y + r.h / 2 },
];
// rectInsideRing — is a whole rect inside a polygon ring, EXACTLY and at every
// scale: all four corners inside, and no edge of the ring crossing the rect.
// Corners alone would pass a rect whose middle bows out through a concave
// stretch of boundary; the crossing test closes that. This is the ring-drawing
// side of the same question `marksContain` answers by coverage cells, and it is
// strictly stronger — every cell centre of a rect lies inside that rect — so a
// mark this holds is a mark `marksContain` holds too, including the sub-cell
// marks coverage cannot rasterize.
export function rectInsideRing(ring, r) {
  const cs = rectCorners(r);
  for (const c of cs) if (!pointInPolygon(c.x, c.y, ring)) return false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    for (let j = 0; j < 4; j++) if (segmentsCross(a, b, cs[j], cs[(j + 1) % 4])) return false;
  }
  return true;
}
// A RECT WITH NO AREA — a point, or a line — is held by `contains` anywhere,
// since 0 >= 0.99 × 0, and it overlaps nothing by area. A spark frozen from a
// one-speaker room keeps such a box as its room's bounds, with no padding
// (WLD-173, the Office's 16:26Z wire answer). For it, ask where its points lie,
// with the point and ring primitives above, instead of by area.
export const hasNoArea = (r) => !(r.w > 0 && r.h > 0);
/** Is every point of `r` (a rect, possibly with no area) inside `outer`: its ring when it has one, else its box, edges included? */
export function pointsInside(outer, r) {
  const ring = polygonOf(outer);
  if (ring) return rectInsideRing(ring, r);
  const o = rect(outer);
  return rectCorners(r).every((c) => pointInRect(c.x, c.y, o));
}

// Do two rings share any ground at all? EXACT, and deliberately not an area:
// two simple polygons are disjoint exactly when no edge of one crosses an edge
// of the other AND neither holds a vertex of the other. An area test would need
// a clipper and would answer "0.4 m2" where the honest answer is "they touch";
// the disjoint law wants a yes or a no, so it gets one.
//
// ONE HOME, because two readers need the same answer: region-rings-gen.mjs
// enforces this and region-rings.test.mjs asserts it, and a generator grading
// itself against its own private notion of "disjoint" would prove nothing.
export function ringsDisjoint(A, B) {
  for (let i = 0; i < A.length; i++) {
    const a1 = A[i], a2 = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      if (segmentsCross(a1, a2, B[j], B[(j + 1) % B.length])) return false;
    }
  }
  // No crossings: either they are apart, or one is wholly inside the other —
  // which one vertex apiece settles.
  if (pointInPolygon(A[0].x, A[0].y, B)) return false;
  if (pointInPolygon(B[0].x, B[0].y, A)) return false;
  return true;
}

export function segmentsCross(p1, p2, p3, p4) {
  const s = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = s(p3, p4, p1), d2 = s(p3, p4, p2), d3 = s(p1, p2, p3), d4 = s(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// ── THE BOX PRECHECK (POS-1219) ─────────────────────────────────────────────
//
// Prod's main thread spent 43% of its busy time in marksContain's per-cell ring
// test (the office's 60 s CPU profile, 2026-11-24 17:51Z): every look at a point
// inside Pando Plains (a 28-vertex ring of ~8.2M cells, past the rasterize cap)
// asked whether the region it stands in is inside the plains, and answered by
// parsing and ray-casting every one of that region's cells; and every chain's last
// step asked the same of the town's frame, cell by cell, against a rect. Each
// such cell's answer was already settled by a box: the cells all lie in a box, and
// a box wholly inside the outer (or wholly outside it) settles every cell at once.
//
// EXACT, NOT APPROXIMATE. Each verdict below is only given where the per-cell
// test would give the same answer for every cell, so marksContain answers what it
// answered before, byte for byte (tools/containment-box.test.mjs holds it, against
// `exhaustive: true`, the old per-cell path, kept for that comparison):
//   · where a cell centre can lie: inside its rect, exactly as rasterizeRect admits
//     it; or inside its ring's bounding box, give or take BOX_EPS (pointInPolygon
//     is true only between an edge's ends in y, exactly, and left of the edge's
//     computed crossing in x, which rounds by far less than BOX_EPS);
//   · a point strictly above or below a ring's box crosses no edge, so it is
//     outside; one more than BOX_EPS left of it crosses every edge spanning its y,
//     an even number, so it is outside; one more than BOX_EPS right of it crosses
//     none, so it is outside;
//   · a box that no ring edge comes within BOX_EPS of lies wholly on one side of
//     the ring, and every point in it is far enough from every edge that the
//     ray-cast's rounding cannot change its answer, so every point answers as the
//     box's centre answers.
const BOX_EPS = 1e-6; // metres: far above the ray-cast's rounding at town scale (~1e-11 m), far below a 5 m cell
/** The box every coverage cell centre of `mark` lies in, or null when there is none to be had (a feature swath). */
function centresBox(mark, feature) {
  const ring = polygonOf(mark);
  if (ring) { const b = polygonBBox(ring); return { x0: b.minx - BOX_EPS, x1: b.maxx + BOX_EPS, y0: b.miny - BOX_EPS, y1: b.maxy + BOX_EPS }; }
  if (hasFeatureLine(feature)) return null;
  const r = rect(mark);
  return { x0: r.x - r.w / 2, x1: r.x + r.w / 2, y0: r.y - r.h / 2, y1: r.y + r.h / 2 };
}
/** Does segment a–b come within the (closed) box at all? Liang–Barsky clipping, so a vertex inside it counts too. */
function segmentMeetsBox(a, b, box) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - box.x0], [dx, box.x1 - a.x], [-dy, a.y - box.y0], [dy, box.y1 - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
/**
 * Every point of `box` against `outer`: "in" (inside the outer, every one), "out" (outside it, every one), or null (the box straddles it, or the outer
 * is answered by its coverage set: count cell by cell). `outer` is a mark, with its ring when it has one; a feature swath answers null.
 */
export function boxVerdict(outer, box, { outerFeature = null } = {}) {
  if (!box) return null;
  const ring = polygonOf(outer);
  if (ring) {
    const bb = polygonBBox(ring);
    if (box.x1 < bb.minx - BOX_EPS || box.x0 > bb.maxx + BOX_EPS || box.y1 < bb.miny || box.y0 > bb.maxy) return "out";
    const near = { x0: box.x0 - BOX_EPS, x1: box.x1 + BOX_EPS, y0: box.y0 - BOX_EPS, y1: box.y1 + BOX_EPS };
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if (segmentMeetsBox(ring[j], ring[i], near)) return null;
    return pointInPolygon((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, ring) ? "in" : "out";
  }
  if (hasFeatureLine(outerFeature)) return null;
  const r = rect(outer);
  const L = r.x - r.w / 2, R = r.x + r.w / 2, B = r.y - r.h / 2, T = r.y + r.h / 2; // pointInRect's own expressions
  if (box.x0 >= L && box.x1 <= R && box.y0 >= B && box.y1 <= T) return "in";
  if (box.x1 < L || box.x0 > R || box.y1 < B || box.y0 > T) return "out";
  return null;
}

// marksContain(outer, inner) — containment that HONORS TRUE SHAPE. Regular vs
// regular delegates to the analytic `contains` (byte-identical). Otherwise it is
// a cell-set op: ≥`frac` of the inner's coverage cells fall inside the outer
// (outer rect tested analytically per cell; outer irregular tested by membership
// in its coverage set). Falls back to analytic bbox if a coverage set would be
// intractable — never blocks, never lies more coarsely than the old bbox rule.
// `exhaustive: true` skips the box precheck (POS-1219) and counts every cell, as
// before it: the comparison the precheck is held to, never a caller's need.
export function marksContain(outer, inner, { cell = COVERAGE_CELL_M, outerFeature = null, innerFeature = null, frac = 0.99, exhaustive = false } = {}) {
  const oIrr = isIrregular(outer, outerFeature), iIrr = isIrregular(inner, innerFeature);
  if (!oIrr && !iIrr) return contains(rect(outer), rect(inner));
  const innerCells = coverage(inner, { cell, feature: innerFeature });
  if (!innerCells) return contains(rect(outer), rect(inner)); // inner too big to rasterize → analytic
  let inOuter;
  let boxed = false; // POS-1219: the outer is one the box precheck may settle (a ring past the rasterize cap, or a rect)
  if (oIrr) {
    const outerCells = coverage(outer, { cell, feature: outerFeature });
    if (outerCells) inOuter = (k) => outerCells.has(k);
    else {
      // Too big to RASTERIZE is not too big to ANSWER. Falling back to the outer's
      // bounding rect here silently discards the true shape of exactly the marks
      // that most need it: the main channel's ring spans 3873 x 10425 m, which is
      // ~1.6M cells at 5 m, so every containment question about the river was
      // answered by its rectangle — the very thing giving the water true shape is
      // meant to end. A ring is exact, so test cell centres against it directly.
      const ring = polygonOf(outer);
      if (!ring) return contains(rect(outer), rect(inner)); // a feature-line outer, no ring: unchanged
      const bb = polygonBBox(ring);
      inOuter = (k) => {
        const [cx, cy] = k.split(",").map(Number);
        const px = cellCenter(cx, cell), py = cellCenter(cy, cell);
        // POS-1219: a centre strictly outside the ring's box (by BOX_EPS in x) is outside the ring, with no ray-cast (§ THE BOX PRECHECK)
        if (!exhaustive && (px < bb.minx - BOX_EPS || px > bb.maxx + BOX_EPS || py < bb.miny || py > bb.maxy)) return false;
        return pointInPolygon(px, py, ring);
      };
      boxed = true;
    }
  } else {
    const ro = rect(outer);
    inOuter = (k) => { const [cx, cy] = k.split(",").map(Number); return pointInRect(cellCenter(cx, cell), cellCenter(cy, cell), ro); };
    boxed = true;
  }
  // A mark SMALLER THAN A CELL can own no cell centre at all — a 1 m bowl at the
  // foot of the quay steps rasterizes to the empty set — and an empty set is not
  // "outside", it is unrasterized. Answering `false` there made containment
  // depend on where the coverage grid's phase happened to fall, which is not a
  // fact about the world: the moment the Town Centre took its true shape, every
  // bowl, pot, bench and flag standing squarely in the middle of it was declared
  // to stand nowhere at all. So the mark is tested as the points it actually
  // occupies — its centre and its four corners, all of which must lie inside.
  if (innerCells.size === 0) {
    const ri = rect(inner);
    const pts = [
      [ri.x, ri.y],
      [ri.x - ri.w / 2, ri.y - ri.h / 2], [ri.x + ri.w / 2, ri.y - ri.h / 2],
      [ri.x + ri.w / 2, ri.y + ri.h / 2], [ri.x - ri.w / 2, ri.y + ri.h / 2],
    ];
    const ring = oIrr ? polygonOf(outer) : null;
    if (ring) return pts.every(([x, y]) => pointInPolygon(x, y, ring));
    if (oIrr) return pts.every(([x, y]) => inOuter(cellKey(cellIndex(x, cell), cellIndex(y, cell))));
    const ro = rect(outer);
    return pts.every(([x, y]) => pointInRect(x, y, ro));
  }
  // Bail as soon as the answer is settled. The analytic path above costs a ray-cast
  // per cell, and placementParent asks this of every candidate parent for every
  // mark, so a non-contained inner must fail fast rather than ray-cast 120k cells.
  const allowedMisses = Math.floor(innerCells.size * (1 - frac));
  // POS-1219: the box every cell centre lies in, settled against the outer in one step when it can be (§ THE BOX PRECHECK). "in": every cell is
  // covered, which the count below answers as size/size >= frac; "out": none is, which it answers false once the misses pass allowedMisses, else 0 >= frac.
  if (boxed && !exhaustive) {
    const verdict = boxVerdict(outer, centresBox(inner, innerFeature), { outerFeature });
    if (verdict === "in") return 1 >= frac;
    if (verdict === "out") return innerCells.size > allowedMisses ? false : 0 >= frac;
  }
  let covered = 0, missed = 0;
  for (const k of innerCells) {
    if (inOuter(k)) covered++;
    else if (++missed > allowedMisses) return false;
  }
  return covered / innerCells.size >= frac;
}

// marksOverlapArea(a, b) — overlap area honoring true shape. Regular vs regular
// delegates to the analytic `overlapArea` (byte-identical); otherwise it is the
// count of shared coverage cells × cell². Falls back to analytic if intractable.
export function marksOverlapArea(a, b, { cell = COVERAGE_CELL_M, aFeature = null, bFeature = null } = {}) {
  const aIrr = isIrregular(a, aFeature), bIrr = isIrregular(b, bFeature);
  if (!aIrr && !bIrr) return overlapArea(rect(a), rect(b));
  const ca = coverage(a, { cell, feature: aFeature }), cb = coverage(b, { cell, feature: bFeature });
  if (!ca || !cb) return overlapArea(rect(a), rect(b));
  const [small, big] = ca.size <= cb.size ? [ca, cb] : [cb, ca];
  let shared = 0;
  for (const k of small) if (big.has(k)) shared++;
  return shared * cell * cell;
}
