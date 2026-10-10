// mists-render.mjs — the Mists as the page paints them (POS-553): banks and
// wisps of a cold fog, never white and never a rectangle, over the engine's
// wall. Browser-pure except bakeMistsLayer and the bell, which need a canvas
// and an AudioContext; everything a test asks about is pure.
//
// THE ONE HARD RULE: the paint may cover MORE than the physics, never less.
// The engine's wall (mistsAt's clear ground and clearings) stays drawn as the
// viewer's opaque vector path; this layer goes over it. Its own back layer is
// also opaque at every point the engine puts behind the wall, because its
// distance field only ever grows: the clear rectangle is rounded INSIDE its
// corners (a rounded box sits inside the box, so its distance is never less),
// and the noise only moves the visible face INWARD from the true face (the
// edge offset is never positive). `mistsRenderAt` is that rule as a function;
// tools/mists-render.test.mjs holds it at 244, 272 and 282.
//
// THE FRINGE is the engine's own band: haze over `fringe_m` (400 m) on the
// clear side of the true face, thinning toward the clear land, at the band's
// density, so the page and the walk's slowdown agree.

// The fog's colour, ONE variable: the skin's variant 2 (Darko 2026-10-10 10:56),
// its plum-grey between the base and the quiet. The face takes it; depth and the
// veil darken it toward near-black at the core.
export const MISTS_TINT = "#796a71";
// the light a wolf's eyes catch: the skin's candle orange (variant 2)
export const MISTS_EYE = "#f39a3d";

// How the paint is shaped. Metres, so it holds at any zoom.
export const MISTS_PAINT = {
  reachM: [380, 900],    // how far the banks reach inward, at the first and the deepest veil
  cornerM: 600,          // the clear ground's corners, rounded into banks
  depthM: 1600,          // from the face to the core's full darkness
  softM: 50,             // a bank's own soft edge, inside the clear ground only
  pxM: 56,               // metres per baked pixel, upscaled smooth (the fog is soft; this keeps a phone's bake small)
  clearingPx: 320,       // a clearing's bake is at most this many pixels across (they are far off)
  clearingLayers: 2,     // and takes the back two layers only
  keepM: 440,            // the town's margin: past its soft edge plus the widest drift (200 m along, 90 across), so a drifting bank never reaches a mark
  keepSoftM: 200,        // the margin's soft edge
  keepNoiseM: 420,       // the margin grows by up to this much, by noise, so its edge is ragged (never less than keepM)
  frameInsetM: 260,      // how far over the painted sheet's own edge the fog reaches before its noise
  townMaxM: 2600,        // past this a mark is open country, not the town
  faceRampM: 80,         // the least band over which the wall's face rises inside the town's margin
  faceClearM: 70,        // and no part of that band comes nearer a mark than this
  keepHaze: 0.06,        // the most any one layer may lay over the town (three of them: under 0.2)
  layers: [              // back to front: the back layer is the opaque one
    { seed: 11, scaleM: 2600, wispM: 700, reach: 1.0, alpha: 1.0, driftM: 0, driftS: 71 },   // the opaque layer holds still; the weather drifts over it
    { seed: 23, scaleM: 1700, wispM: 480, reach: 0.75, alpha: 0.55, driftM: 140, driftS: 53 },
    { seed: 37, scaleM: 1100, wispM: 320, reach: 1.6, alpha: 0.32, driftM: 200, driftS: 37 },
  ],
};

// ── noise: hashed value noise and its fbm, deterministic and pure ───────────
function hash(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
/** fractal value noise in [0, 1). */
// each octave turned by ~37°, so value noise's grid never lines up into steps
const ROT_C = Math.cos(0.65), ROT_S = Math.sin(0.65);
export function mistsFbm(x, y, seed, octaves = 3) {
  let sum = 0, amp = 0.5, norm = 0, px = x, py = y;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(px, py, seed + i * 101); norm += amp; amp *= 0.5;
    const nx = (px * ROT_C - py * ROT_S) * 2.03, ny = (px * ROT_S + py * ROT_C) * 2.03; px = nx + 17.3; py = ny - 9.1;
  }
  return sum / norm;
}

// ── distance fields, metres, positive in the wall ───────────────────────────
function sdBox(px, py, c) {
  const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2, hx = (c.maxX - c.minX) / 2, hy = (c.maxY - c.minY) / 2;
  const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}
function sdRoundBox(px, py, c, r) {
  const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2;
  const hx = (c.maxX - c.minX) / 2, hy = (c.maxY - c.minY) / 2, rr = Math.max(0, Math.min(r, hx, hy));
  const qx = Math.abs(px - cx) - hx + rr, qy = Math.abs(py - cy) - hy + rr;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
}
/** The engine's wall as a distance: > 0 behind the wall, < 0 in clear ground. */
export function mistsTrueDistance(m, x, y) {
  let d = sdBox(x, y, m.clear);
  for (const k of m.clearings ?? []) d = Math.min(d, Math.hypot(x - k.x, y - k.y) - k.r);
  return d;
}
// the painted field: never less than the true one
function paintDistance(m, x, y) {
  let d = sdRoundBox(x, y, m.clear, MISTS_PAINT.cornerM);
  for (const k of m.clearings ?? []) d = Math.min(d, Math.hypot(x - k.x, y - k.y) - k.r);
  return d;
}
const smooth = (e0, e1, v) => { const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** The reach of the banks for this crossing's veil (0.10 → 0.50). */
export function mistsReachM(m) {
  const [a, b] = MISTS_PAINT.reachM, u = Math.max(0, Math.min(1, ((m?.veil ?? 0) - 0.1) / 0.4));
  return a + (b - a) * u;
}

/**
 * The paint at a point (metres, the engine's frame) for one layer, at rest:
 * `alpha` 0..1 (1 is opaque fog) and `depth` 0..1 (0 at the visible face, 1 at
 * the core). Pure. The rule: for the back layer, alpha is 1 wherever
 * mistsTrueDistance > 0.
 */
export function mistsRenderAt(m, x, y, layer = 0, keep = null) {
  const L = MISTS_PAINT.layers[layer], reach = mistsReachM(m) * L.reach;
  const dTrue = mistsTrueDistance(m, x, y);
  // the sheet's edge is a face too: past it the fog may stand, and it reaches in
  // over the edge by frameInsetM, so the sheet's straight sides never show
  const dFrame = m.frame ? sdBox(x, y, m.frame) + MISTS_PAINT.frameInsetM : -Infinity;
  const dPaint = Math.max(paintDistance(m, x, y), dTrue, dFrame);
  // the visible face, pushed inward by the noise and never outward (offset ≤ 0)
  // (two scales, the long banks and their tongues, stretched apart so the reach is uneven)
  const v = smooth(0.32, 0.68, 0.65 * mistsFbm(x / L.scaleM, y / L.scaleM, L.seed) + 0.35 * mistsFbm(x * 4 / L.scaleM, y * 4 / L.scaleM, L.seed + 3));
  const edge = -reach * (0.3 + 0.7 * v);
  const e = dPaint - edge;   // ≥ reach·0.3 > softM wherever dTrue > 0
  // depth, broken by the same banks: lighter tongues, darker gaps
  const depth = Math.max(0, Math.min(1, smooth(0, MISTS_PAINT.depthM, e) + (v - 0.5) * 0.35 * (1 - smooth(0, MISTS_PAINT.depthM, e))));
  let bank = smooth(-MISTS_PAINT.softM, 0, e) * (layer === 0 ? 1 : L.alpha);
  if (layer === 0 && e >= 0) bank = 1;
  // the engine's fringe: haze over fringe_m on the clear side of the true face
  const f = m.fringeM > 0 ? Math.max(0, 1 + dTrue / m.fringeM) : 0;
  const wisp = 0.55 + 0.45 * mistsFbm(x / L.wispM, y / L.wispM, L.seed + 7, 2);
  const haze = Math.min(1, dTrue >= 0 ? 1 : f) * Math.min(1, m.density ?? 0) * wisp * L.alpha * 0.8;
  let alpha = Math.max(bank, haze);
  // THE TOWN IS KEPT CLEAR (Darko 10-10): over a mark and its margin the paint
  // thins to a light haze, never more. The back layer keeps the physics: where
  // the engine puts the point behind the wall it stays opaque. The front layers
  // are only weather, and thin over the town's margin even past the face, so
  // their drift never carries the wall's paint onto a mark.
  const k = keep ? keep(x, y) : 0;
  if (k > 0 && (layer > 0 || !(dTrue > 0))) alpha = Math.min(alpha, alpha + (MISTS_PAINT.keepHaze - alpha) * k);
  // where the town's margin meets the wall's face, the back layer does not step
  // from haze to wall in a straight line: it rises over a ragged band, starting
  // 80-128 m out from the face (the nearest mark to any face, 130 m, keeps more)
  if (layer === 0 && k > 0) {
    const room = (keep.dist ? keep.dist(x, y) : 0) - MISTS_PAINT.faceClearM;   // how far the nearest mark stands, less its clearance
    const width = Math.min(MISTS_PAINT.faceRampM + 600 * smooth(0.35, 0.65, mistsFbm(x / 900, y / 900, 151, 3)), room);
    if (width > 20) alpha = Math.max(alpha, smooth(-width, 0, dTrue));
  }
  if (layer === 0 && dTrue > 0) alpha = 1;
  return { alpha, depth };
}

// ── the town's keep-out ─────────────────────────────────────────────────────
/** The keep-out rectangles, metres: every sited mark's own extent (parcels,
 *  houses, lit marks, districts), grown by MISTS_PAINT.keepM. The world's frame
 *  and its open country are not the town: a mark wider than townMaxM on either
 *  side (the root, the sea, the main channel, the far plains) keeps nothing. */
export function mistsKeepRects(marks) {
  const g = MISTS_PAINT.keepM, out = [];
  for (const mk of marks ?? []) {
    if (!mk?.at || !Number.isFinite(mk.at.x) || !Number.isFinite(mk.at.y)) continue;
    if (Math.max(Number(mk.extent?.w) || 0, Number(mk.extent?.h) || 0) > MISTS_PAINT.townMaxM) continue;
    const w = Math.max(0, Number(mk.extent?.w) || 0) / 2, h = Math.max(0, Number(mk.extent?.h) || 0) / 2;
    // the mark's own extent (core) and its reach (core grown by the margin)
    out.push({ cx0: mk.at.x - w, cx1: mk.at.x + w, cy0: mk.at.y - h, cy1: mk.at.y + h,
      minX: mk.at.x - w - g, maxX: mk.at.x + w + g, minY: mk.at.y - h - g, maxY: mk.at.y + h + g });
  }
  return out;
}
/** How kept-clear a point is, 0..1: 1 within a mark's margin less the soft
 *  band, 0 outside every rectangle. Pure (the tests' instrument); the bake uses
 *  a raster of the same rule. */
// two scales stretched apart (as the banks' edge is), so the margin's edge wanders well clear of a straight line
const keepWobble = (x, y) => MISTS_PAINT.keepNoiseM * smooth(0.4, 0.6, 0.6 * mistsFbm(x / 650, y / 650, 71, 3) + 0.4 * mistsFbm(x / 210, y / 210, 73, 2));
const KEEP_CELL = 1000;
export function mistsKeepAt(rects) {
  const soft = MISTS_PAINT.keepSoftM, pad = MISTS_PAINT.keepNoiseM;
  // bucket the rectangles (each with its ragged pad) by 1 km cell
  const cells = new Map(), cellOf = (v) => Math.floor(v / KEEP_CELL);
  for (const r of rects)
    for (let cx = cellOf(r.minX - pad); cx <= cellOf(r.maxX + pad); cx++)
      for (let cy = cellOf(r.minY - pad); cy <= cellOf(r.maxY + pad); cy++) {
        const k = cx + "," + cy; let list = cells.get(k); if (!list) cells.set(k, (list = [])); list.push(r);
      }
  const keep = (x, y) => {
    let k = 0, g = null;
    for (const r of cells.get(cellOf(x) + "," + cellOf(y)) ?? []) {
      if (x < r.minX - pad || x > r.maxX + pad || y < r.minY - pad || y > r.maxY + pad) continue;
      if (g === null) g = MISTS_PAINT.keepM + keepWobble(x, y);
      // how far outside the mark's own extent (0 inside it): the margin is round at the corners
      const d = Math.hypot(Math.max(r.cx0 - x, 0, x - r.cx1), Math.max(r.cy0 - y, 0, y - r.cy1));
      k = Math.max(k, Math.max(0, Math.min(1, (g - d) / soft)));
      if (k >= 1) return 1;
    }
    return k;
  };
  // how far the nearest mark's own extent is (Infinity past every margin)
  keep.dist = (x, y) => {
    let best = Infinity;
    for (const r of cells.get(cellOf(x) + "," + cellOf(y)) ?? [])
      best = Math.min(best, Math.hypot(Math.max(r.cx0 - x, 0, x - r.cx1), Math.max(r.cy0 - y, 0, y - r.cy1)));
    return best;
  };
  return keep;
}
/** The keep-out raster built a slice of rectangles at a time: `next(n)` adds the
 *  next n and answers true while some remain; `raster` is the result. */
export function mistsKeepRasterBuilder(rects, box, pxM) {
  const all = mistsKeepRaster([], box, pxM), list = rects.slice();
  let i = 0;
  return { raster: all, next(n = list.length) { for (const end = Math.min(list.length, i + n); i < end; i++) all.add(list[i]); return i < list.length; } };
}
/** The keep-out as a raster over a bake box (one cell per baked pixel). */
export function mistsKeepRaster(rects, box, pxM) {
  const w = Math.max(1, Math.ceil((box.maxX - box.minX) / pxM)), h = Math.max(1, Math.ceil((box.maxY - box.minY) / pxM));
  const grid = new Float32Array(w * h), near = new Float32Array(w * h).fill(Infinity), soft = MISTS_PAINT.keepSoftM, pad = MISTS_PAINT.keepNoiseM;
  const wob = new Map();
  const gAt = (i, j, x, y) => { const o = j * w + i; let v = wob.get(o); if (v === undefined) { v = MISTS_PAINT.keepM + keepWobble(x, y); wob.set(o, v); } return v; };
  const add = (r) => {
    if (r.maxX + pad < box.minX || r.minX - pad > box.maxX || r.maxY + pad < box.minY || r.minY - pad > box.maxY) return;
    const i0 = Math.max(0, Math.floor((r.minX - pad - box.minX) / pxM) - 1), i1 = Math.min(w - 1, Math.ceil((r.maxX + pad - box.minX) / pxM) + 1);
    const j0 = Math.max(0, Math.floor((r.minY - pad - box.minY) / pxM) - 1), j1 = Math.min(h - 1, Math.ceil((r.maxY + pad - box.minY) / pxM) + 1);
    for (let j = j0; j <= j1; j++) {
      const y = box.minY + (j + 0.5) * pxM;
      for (let i = i0; i <= i1; i++) {
        const x = box.minX + (i + 0.5) * pxM;
        // from the cell's centre, less most of a cell, so the raster is never less
        // kept than the pure rule anywhere in the cell, and still ramps smoothly
        const d = Math.hypot(Math.max(r.cx0 - x, 0, x - r.cx1), Math.max(r.cy0 - y, 0, y - r.cy1)) - pxM * 0.75;
        const k = Math.max(0, Math.min(1, (gAt(i, j, x, y) - d) / soft)), o = j * w + i;
        if (k > grid[o]) grid[o] = k;
        if (d < near[o]) near[o] = Math.max(0, d);
      }
    }
  };
  for (const r of rects) add(r);
  return { w, h, add, at: (i, j) => grid[j * w + i], dist: (i, j) => near[j * w + i] };
}

// ── colour ──────────────────────────────────────────────────────────────────
function rgbOf(hex) { return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); }
/** The fog's colour at a depth for this veil: the tint at the face, toward
 *  near-black at the core, all of it dimmed by the veil. */
const rgbCache = new Map();
export function mistsColourAt(m, depth, tint = MISTS_TINT) {
  let c = rgbCache.get(tint); if (!c) rgbCache.set(tint, (c = rgbOf(tint)));
  const [r, g, b] = c, veil = m?.veil ?? 0;
  const dark = Math.min(0.92, 0.12 * veil / 0.5 + depth * (0.55 + 0.3 * veil / 0.5));
  return [r, g, b].map((v) => Math.round(v * (1 - dark)));
}
/** The core's colour (the vector wall's fill), the paint's deepest. */
export function mistsCoreHex(m, tint = MISTS_TINT) {
  return "#" + mistsColourAt(m, 1, tint).map((v) => v.toString(16).padStart(2, "0")).join("");
}

// ── the bake (browser): one canvas per layer per crossing ───────────────────
/** The box a layer bakes over, metres: the clear ground plus the depth beyond. */
export function mistsBakeBox(m, k = null) {
  const pad = MISTS_PAINT.depthM + MISTS_PAINT.layers.reduce((a, L) => Math.max(a, L.driftM), 0) * 2;
  if (k) return { minX: k.x - k.r - pad, minY: k.y - k.r - pad, maxX: k.x + k.r + pad, maxY: k.y + k.r + pad };
  return { minX: m.clear.minX - pad, minY: m.clear.minY - pad, maxX: m.clear.maxX + pad, maxY: m.clear.maxY + pad };
}
/** What a crossing bakes: the main band in every layer at MISTS_PAINT.pxM,
 *  each clearing in the back layers at a resolution capped by clearingPx. */
export function mistsBakePlan(m) {
  const main = mistsBakeBox(m), plan = MISTS_PAINT.layers.map((_, li) => ({ li, box: main, pxM: MISTS_PAINT.pxM }));
  for (const k of m.clearings ?? []) {
    const box = mistsBakeBox(m, k), pxM = Math.max(MISTS_PAINT.pxM, (box.maxX - box.minX) / MISTS_PAINT.clearingPx);
    for (let li = 0; li < MISTS_PAINT.clearingLayers; li++) plan.push({ li, box, pxM });
  }
  return plan;
}
/** Paint one layer into a canvas over `box` (metres). Returns the canvas. */
/** A bake of one layer over `box`, a band of rows at a time, so a page can
 *  spread it across frames: `next(rows)` paints the next rows and answers true
 *  while rows remain; `canvas` holds the result once done. */
export function mistsBaker(m, layer, box, { tint = MISTS_TINT, pxM = MISTS_PAINT.pxM, canvas = null, keepRects = null, keepRaster = null } = {}) {
  const w = Math.max(1, Math.ceil((box.maxX - box.minX) / pxM)), h = Math.max(1, Math.ceil((box.maxY - box.minY) / pxM));
  const cv = canvas ?? (typeof OffscreenCanvas === "function" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h }));
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), px = img.data;
  const far = mistsReachM(m) * MISTS_PAINT.layers[layer].reach + (m.fringeM || 0) + MISTS_PAINT.softM;
  const core = mistsColourAt(m, 1, tint), coreA = Math.round((layer === 0 ? 1 : MISTS_PAINT.layers[layer].alpha) * 255);
  const kr = keepRaster ?? (keepRects?.length ? mistsKeepRaster(keepRects, box, pxM) : null);
  let j = 0;
  return {
    canvas: cv, width: w, height: h,
    next(rows = h) {
      for (const end = Math.min(h, j + rows); j < end; j++) {
        const y = box.minY + (j + 0.5) * pxM;
        for (let i = 0; i < w; i++) {
          const x = box.minX + (i + 0.5) * pxM, o = (j * w + i) * 4;
          // deep in the clear ground nothing is painted; skip the noise there
          const dT = mistsTrueDistance(m, x, y);
          if (dT < -far) { px[o + 3] = 0; continue; }
          // past the core's depth it is the core, whatever the noise says
          if (dT >= MISTS_PAINT.depthM) { px[o] = core[0]; px[o + 1] = core[1]; px[o + 2] = core[2]; px[o + 3] = coreA; continue; }
          const kv = kr ? kr.at(i, j) : 0;
          const { alpha, depth } = mistsRenderAt(m, x, y, layer, kv > 0 ? Object.assign(() => kv, { dist: () => kr.dist(i, j) }) : null);
          const [r, g, b] = mistsColourAt(m, depth, tint);
          px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = Math.round(alpha * 255);
        }
      }
      if (j >= h) { ctx.putImageData(img, 0, 0); return false; }
      return true;
    },
  };
}
// ── the creatures in the mist (Darko 2026-10-10 09:45) ──────────────────────
// Wolves half-seen at the banks' edge, some with their eyes catching the light;
// crows perched at the edge and lifting off; bats in ones and threes. Sparse at
// the Mists' first crossing, populated by 284. Seeded by the crossing, so a
// crossing always shows the same ones and nothing jitters. Never inside the
// town's keep-out, and never deep in the core, where a silhouette can't be seen.
export const MISTS_CREATURES = {
  full: 284,
  wolves: [2, 9], crows: [3, 16], bats: [2, 10],          // at the first crossing and from `full`
  sizeM: { wolf: 620, crow: 320, bat: 230 },
};
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Where the creatures stand at this crossing (metres, the engine's frame):
 *  [{ kind: "wolf"|"crow"|"bat", x, y, sizeM, flip, pose, eyes, phase }]. Pure. */
export function mistsCreatures(m, { first = 244, keep = null } = {}) {
  if (!m?.clear) return [];
  const C = MISTS_CREATURES, t = Math.max(0, Math.min(1, (m.crossing - first) / (C.full - first)));
  const count = ([a, b]) => Math.round(a + (b - a) * t);
  const r = seeded(Math.imul((m.crossing | 0) + 1, 2654435761));
  const reach = mistsReachM(m), c = m.clear;
  const sides = [
    { len: c.maxX - c.minX, at: (s, d) => ({ x: c.minX + s, y: c.minY - d }) },   // north: the wall is y < minY
    { len: c.maxX - c.minX, at: (s, d) => ({ x: c.minX + s, y: c.maxY + d }) },   // south
    { len: c.maxY - c.minY, at: (s, d) => ({ x: c.minX - d, y: c.minY + s }) },   // west
    { len: c.maxY - c.minY, at: (s, d) => ({ x: c.maxX + d, y: c.minY + s }) },   // east
  ];
  const total = sides.reduce((a, sd) => a + sd.len, 0);
  // a point at true-face distance d (positive into the wall), anywhere round the band
  const onBand = (dIn, dOut) => {
    let u = r() * total, sd = sides[0];
    for (const x of sides) { if (u <= x.len) { sd = x; break; } u -= x.len; }
    return sd.at(u, dIn + (dOut - dIn) * r());
  };
  const out = [];
  const clearOfTown = (x, y, size) => !keep || [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].every(([a, b]) => keep(x + a * size, y + b * size) === 0);
  const apart = (x, y, size) => out.every((o) => Math.hypot(o.x - x, o.y - y) > (o.sizeM + size) * 0.75);
  const place = (kind, dIn, dOut, extra) => {
    for (let tries = 0; tries < 60; tries++) {
      const p = onBand(dIn, dOut), size = C.sizeM[kind] * (0.8 + 0.4 * r());
      if (!clearOfTown(p.x, p.y, size) || !apart(p.x, p.y, size)) continue;
      const cr = { kind, x: Math.round(p.x), y: Math.round(p.y), sizeM: Math.round(size), flip: r() < 0.5, phase: +r().toFixed(3), ...extra() };
      out.push(cr);
      return cr;
    }
    return null;
  };
  for (let i = 0, n = count(C.wolves); i < n; i++) place("wolf", -reach * 0.35, 140, () => ({ pose: "stand", eyes: r() < 0.35 + 0.45 * t }));
  for (let i = 0, n = count(C.crows); i < n; i++) {
    const flying = r() < 0.4;
    place("crow", flying ? -reach * 0.9 : -reach * 0.45, flying ? -reach * 0.15 : 80, () => ({ pose: flying ? "lift" : "perch", eyes: false }));
  }
  for (let i = 0, n = count(C.bats); i < n; i++) {
    const lead = place("bat", -reach * 0.8, 220, () => ({ pose: "flit", eyes: false }));
    if (!lead || r() >= 0.45) continue;
    // a three: two more close by, if they too stand clear of the town
    for (const [dx, dy] of [[1.6, -0.7], [-1.3, 0.9]]) {
      const x = lead.x + dx * lead.sizeM, y = lead.y + dy * lead.sizeM;
      const dd = mistsTrueDistance(m, x, y);
      if (dd >= -reach * 0.8 && dd <= 220 && clearOfTown(x, y, lead.sizeM * 0.8)) out.push({ ...lead, x: Math.round(x), y: Math.round(y), sizeM: Math.round(lead.sizeM * 0.8), phase: +r().toFixed(3) });
    }
  }
  return out;
}
// the silhouettes, drawn for this (no clip-art), in a 100-wide box with the
// feet (or the body's centre, for a flier) at the origin
// Rei's originals (2026-10-10; motifs-rei/README.md: original vector drawings,
// no external source or licence), as drawn: one path each in a 100-unit box,
// and the offset that puts the feet (or a flier's middle) at the creature's
// point. The site's motifs are the same four shapes.
const CREATURE_PATHS = {
  wolf: { d: "M8 91 C12 83 22 79 32 81 C28 72 30 61 38 53 C44 47 47 38 47 31 L43 18 L54 24 L58 17 L63 20 L74 8 L82 7 L84 12 L73 21 L81 17 L82 22 L69 33 C66 38 67 43 70 48 L66 46 L70 57 L65 54 L65 83 L70 88 L70 92 L57 92 L55 62 C51 66 48 72 48 77 C49 82 51 86 55 88 L54 92 L35 92 C25 96 14 96 8 91 Z", at: [-50, -92] },
  crowperch: { d: "M8 80 L25 59 C30 52 36 49 42 44 C47 40 48 31 53 25 C58 18 68 17 75 22 L79 27 L94 32 L94 35 L78 36 C79 43 75 48 74 53 L78 55 L73 57 L75 60 L69 60 C65 66 60 70 53 73 L54 83 L63 86 L62 89 L49 88 L48 76 L41 77 L39 86 L45 89 L43 92 L34 88 L35 77 L13 87 Z", at: [-50, -89] },
  crowlift: { d: "M6 78 L29 58 C28 43 21 29 17 20 Q18 16 22 20 L29 29 L27 13 Q28 9 32 13 L41 26 L40 8 Q42 5 45 10 L55 28 L55 13 Q58 10 60 16 L63 44 C66 40 73 40 77 44 L81 48 L96 52 L96 55 L81 57 C75 66 68 69 57 69 L51 79 L55 82 L53 85 L45 80 L48 71 L41 74 L34 88 L29 87 L34 76 L12 85 Z", at: [-50, -50] },
  bat: { d: "M50 39 L44 28 L41 44 C32 37 24 24 7 18 C12 31 11 44 3 57 C17 52 24 56 25 65 C35 60 41 65 43 73 L50 83 L57 73 C59 65 65 60 75 65 C76 56 83 52 97 57 C89 44 88 31 93 18 C76 24 68 37 59 44 L56 28 Z", at: [-50, -50] },
};
/** One creature as SVG, in the painting's frame. `ink` is the silhouette's
 *  colour (the fog's core); `eye` the light its eyes catch. */
export function mistsCreatureSVG(cr, { originPx, mPerPx, ink, eye = MISTS_EYE }) {
  const n = (v) => v.toFixed(1), s = cr.sizeM / 100 / mPerPx;
  const x = originPx.x + cr.x / mPerPx, y = originPx.y + cr.y / mPerPx;
  const P = cr.kind === "wolf" ? CREATURE_PATHS.wolf : cr.kind === "bat" ? CREATURE_PATHS.bat : cr.pose === "lift" ? CREATURE_PATHS.crowlift : CREATURE_PATHS.crowperch;
  // a wolf's eye catches the light on the head, just behind the muzzle's root
  const eyes = cr.eyes ? `<g class="wv-mc-eyes" style="animation-delay:-${n(cr.phase * 9)}s"><circle cx="64" cy="25" r="1.6" fill="${eye}"/><circle cx="64" cy="25" r="4.5" fill="${eye}" opacity="0.3"/></g>` : "";
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${cr.flip ? "-" : ""}${s.toFixed(4)} ${s.toFixed(4)})">`
    + `<g class="wv-mc wv-mc-${cr.kind}${cr.pose ? " wv-mc-" + cr.pose : ""}" style="animation-delay:-${n(cr.phase * 12)}s">`
    + `<g transform="translate(${P.at[0]} ${P.at[1]})"><path d="${P.d}" fill="${ink}"/>${eyes}</g></g></g>`;
}

/** Paint one layer into a canvas over `box` (metres), all at once. */
export function bakeMistsLayer(m, layer, box, opts = {}) {
  const b = mistsBaker(m, layer, box, opts);
  b.next();
  return b.canvas;
}

// ── the bell (browser): a low struck bell, synthesised ──────────────────────
// A bell's partials at the classic ratios to its prime (hum an octave below,
// a minor-third tierce, quint, nominal, and the inharmonic uppers), each with
// its own level and decay; the hum is a slow pair a fraction of a hertz apart,
// so it beats. No file and no licence: the sound is these numbers.
export const BELL_PARTIALS = [
  { ratio: 0.5, level: 0.55, decayS: 8.0, beatHz: 0.45 },   // hum
  { ratio: 1.0, level: 0.5, decayS: 6.5 },                  // prime
  { ratio: 1.183, level: 0.34, decayS: 5.2 },               // tierce (a minor third)
  { ratio: 1.506, level: 0.2, decayS: 3.8 },                // quint
  { ratio: 2.0, level: 0.26, decayS: 3.2 },                 // nominal
  { ratio: 2.514, level: 0.12, decayS: 2.3 },
  { ratio: 2.662, level: 0.1, decayS: 2.0 },
  { ratio: 3.011, level: 0.08, decayS: 1.6 },
  { ratio: 4.166, level: 0.05, decayS: 1.1 },
];
/** What the bell does at this crossing's veil: null with no Mists; from 244
 *  one strike on C3 (hum 65.4 Hz); from the deepest veil (282 on) two strikes,
 *  a semitone lower, as the agents' line has it ringing twice. */
export function bellFor(m) {
  if (!m) return null;
  const deep = (m.veil ?? 0) >= 0.5;
  return { prime: deep ? 123.47 : 130.81, strikes: deep ? 2 : 1, gapS: 2.8, gain: 0.2 };
}
/** Schedule one strike on an (Offline)AudioContext. Returns its length in s. */
export function strikeBell(ctx, dest, when, { prime, gain }) {
  const out = ctx.createGain(); out.gain.value = gain; out.connect(dest);
  let longest = 0;
  for (const p of BELL_PARTIALS) {
    const freqs = p.beatHz ? [prime * p.ratio - p.beatHz / 2, prime * p.ratio + p.beatHz / 2] : [prime * p.ratio];
    for (const f of freqs) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(p.level / freqs.length, when + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, when + p.decayS);
      o.connect(g); g.connect(out); o.start(when); o.stop(when + p.decayS + 0.05);
      longest = Math.max(longest, p.decayS);
    }
  }
  // the strike itself: a short, dark knock of noise
  const n = Math.round(ctx.sampleRate * 0.05), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (hash(i, 3, 5) * 2 - 1) * (1 - i / n) ** 3;
  const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), kg = ctx.createGain();
  src.buffer = buf; lp.type = "lowpass"; lp.frequency.value = 900; kg.gain.value = 0.18;
  src.connect(lp); lp.connect(kg); kg.connect(out); src.start(when);
  return longest;
}
/** Ring the bell for this crossing: one or two strikes. Returns the total s. */
export function ringBell(ctx, dest, when, bell) {
  let end = 0;
  for (let s = 0; s < bell.strikes; s++) {
    const t = when + s * bell.gapS;
    end = Math.max(end, t - when + strikeBell(ctx, dest, t, { prime: bell.prime, gain: bell.gain * (s ? 0.8 : 1) }));
  }
  return end;
}

// ── the sheet's edge, feathered (POS-553 review) ────────────────────────────
// The painted sheet is a rectangle, and where the fog thins over the town's
// margin its straight sides would show. So its edge is feathered into the open
// country's own colour: a ragged band under the record (the marks stay on top),
// opaque at the sheet's edge and gone sheetFeatherM inside it. It lies on the
// sheet's ground, under the regions and their art, so nothing a resident made
// is cut by it.
export const MISTS_SHEET = { featherM: 560, wobbleM: 420, pxM: 90 };   // the feather is soft: a coarse bake, upscaled smooth
/** How much of the open country covers the sheet at a point, 0..1. Pure. */
export function mistsSheetFeatherAt(frame, x, y) {
  const wob = 0.65 * mistsFbm(x / 2200, y / 2200, 97, 3) + 0.35 * mistsFbm(x / 600, y / 600, 131, 2);
  const d = sdBox(x, y, frame) + MISTS_SHEET.wobbleM * (wob - 0.5) * 2.4;
  return smooth(-MISTS_SHEET.featherM, 0, d);
}
/** The feather baked over the sheet's border, in the open country's colour. */
export function bakeSheetFeather(frame, colour, { canvas = null, pxM = MISTS_SHEET.pxM } = {}) {
  const pad = MISTS_SHEET.wobbleM + 2 * pxM;
  const box = { minX: frame.minX - pad, minY: frame.minY - pad, maxX: frame.maxX + pad, maxY: frame.maxY + pad };
  const w = Math.ceil((box.maxX - box.minX) / pxM), h = Math.ceil((box.maxY - box.minY) / pxM);
  const cv = canvas ?? Object.assign(document.createElement("canvas"), { width: w, height: h });
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), px = img.data, [r, g, b] = rgbOf(colour);
  const inner = MISTS_SHEET.featherM + MISTS_SHEET.wobbleM + pxM;
  for (let j = 0; j < h; j++) {
    const y = box.minY + (j + 0.5) * pxM;
    for (let i = 0; i < w; i++) {
      const x = box.minX + (i + 0.5) * pxM, o = (j * w + i) * 4;
      if (sdBox(x, y, frame) < -inner) continue;   // deep inside the sheet: nothing
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = Math.round(255 * mistsSheetFeatherAt(frame, x, y));
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: cv, box, w: w * pxM, h: h * pxM };
}
