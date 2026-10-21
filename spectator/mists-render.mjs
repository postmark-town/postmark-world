// mists-render.mjs — the Mists as the page paints them (POS-553): banks and
// wisps of a cold fog, never white and never a rectangle, over the engine's
// wall. Browser-pure except bakeMistsLayer and the bell, which need a canvas
// and an AudioContext; everything a test asks about is pure.
//
// THE FACE IS CENTRED ON THE WALL (WLD-81, RULED by Darko 2026-10-19 18:53:
// "it looks spectacular, I don't want to change that"). The render is POS-553's,
// its banks, tongues, corners and colour unchanged, with one thing taken out:
// the flat creep-in. The noise used to move the visible face only INWARD (by the
// banks' reach·(0.3 + 0.7·v) and a tongue of 0..tongueM), so on average the fog
// stood ~0.65·reach + tongueM/2 onto ground the engine keeps clear: the bat at
// 259, 94 m clear, was deep in it. Now that mean (mistsCreepM) is added back, so
// the same noise wanders both ways about the engine's true face: some bumps a
// little onto the clear side, some back into the Mist. In a pocket that stands
// back (past the true face, short of the ragged face) the paint is what the
// noise's own falloff paints there, nothing more; the viewer's opaque vector wall
// follows the ragged face (mistsOpaqueFromM), and its pointer is still taken from
// the true face, so nothing past the real wall can be clicked.
//
// SUPERSEDED (WLD-81): "the paint may cover MORE than the physics, never less"
// (POS-553, 10-10), and "the sheet's edge is a face" (the POS-553 review), which
// painted all the clear ground past the painting solid, a 2 km flat creep at 259.
// `mistsRenderAt` is the rule as a function; tools/mists-render.test.mjs holds it.
//
// THE FRINGE is the engine's own band: haze over `fringe_m` (400 m) on the
// clear side of the true face, thinning toward the clear land, at the band's
// density, so the page and the walk's slowdown agree.

import { MISTS_KEEP } from "../tools/mists-keep.mjs";
import { mistsHere } from "../tools/world-engine.mjs";

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
  depthJagM: [-220, 620], // how far the darkness wanders from the face's own line (lighter, darker): its own noise, so the foot is never a ruled band
  coreFadeM: [950, 1150],  // the front layers are gone this far behind the wall (± coreJagM of noise): inside every box, past every drift
  coreJagM: 550,
  tongueM: 480,          // how far the short tongues reach in, at any veil: a noise that never saturates, so no stretch of the face runs straight (Darko 10-11)
  tongueScaleM: 380,     // and their size
  softM: 50,             // a bank's own soft edge, inside the clear ground only
  pxM: 56,               // metres per baked pixel, upscaled smooth (the fog is soft; this keeps a phone's bake small)
  clearingPx: 320,       // a clearing's bake is at most this many pixels across (they are far off)
  clearingLayers: 2,     // and takes the back two layers only
  keepM: MISTS_KEEP.keepM,       // the town's margin (tools/mists-keep.mjs, one definition)
  keepSoftM: 200,        // the margin's soft edge
  keepNoiseM: 420,       // the margin grows by up to this much, by noise, so its edge is ragged (never less than keepM)
  townMaxM: MISTS_KEEP.townMaxM, // past this a mark is open country, not the town (tools/mists-keep.mjs)
  faceRampM: 80,         // the least band over which the wall's face rises inside the town's margin
  faceJagM: 700,         // and how far beyond that it may reach, by noise, where the marks leave room
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

/** THE CREEP (WLD-81): the mean of the face's inward reach for a layer, the
 *  banks' reach·(0.3 + 0.7·E[v]) at E[v] = 0.5 and the tongue's tongueM/2, which
 *  is added back so the face's noise is centred on the true face. */
export function mistsCreepM(m, layer = 0) {
  return mistsReachM(m) * MISTS_PAINT.layers[layer].reach * 0.65 + MISTS_PAINT.tongueM / 2;
}
/** How far back past the true face a layer's face can stand at most: its noise's
 *  inward floor (reach·0.3), less the creep. */
export function mistsBackM(m, layer = 0) {
  return mistsCreepM(m, layer) - mistsReachM(m) * MISTS_PAINT.layers[layer].reach * 0.3;
}
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
  const dPaint = Math.max(paintDistance(m, x, y), dTrue);
  // the visible face: POS-553's noise, centred on the true face (WLD-81)
  // (two scales, the long banks and their tongues, stretched apart so the reach is uneven)
  const v = smooth(0.25, 0.75, 0.65 * mistsFbm(x / L.scaleM, y / L.scaleM, L.seed) + 0.35 * mistsFbm(x * 4 / L.scaleM, y * 4 / L.scaleM, L.seed + 3));
  // and short tongues that never saturate: the banks' term goes flat where its
  // noise runs past either end, and a flat term over a straight face (the
  // sheet's edge, the clear ground's side) was a ruled line (Darko 10-11)
  const ts = MISTS_PAINT.tongueScaleM, tn = 0.72 * mistsFbm(x / ts, y / ts, L.seed + 5, 3) + 0.28 * mistsFbm(x * 2.6 / ts, y * 2.6 / ts, L.seed + 6, 2);
  const tongue = MISTS_PAINT.tongueM * Math.max(0, Math.min(1, 0.5 + 1.8 * (tn - 0.5)));
  const edge = -reach * (0.3 + 0.7 * v) - tongue + mistsCreepM(m, layer);   // the creep taken back out
  const e = dPaint - edge;   // ≥ 0 past the ragged face, which wanders both ways about the true face
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
  // from haze to wall in a straight line: a ragged bank stands out from the face
  // into the room the marks leave (the nearest mark to any face, 130 m, keeps
  // faceClearM of it). Its reach is a share of the room at the face, the point's
  // own room plus its way back to the face, so it is not pinned to the room's
  // line; two scales and no saturation, so it never runs straight (Darko 10-11).
  let eDepth = e;
  if (layer === 0 && k > 0) {
    const room = (keep.dist ? keep.dist(x, y) : 0) - MISTS_PAINT.faceClearM;   // how far the nearest mark stands, less its clearance
    const span = room + Math.max(0, -dTrue);   // the room at the face, about: never less than the point's own
    const jag = 0.6 * mistsFbm(x / 900, y / 900, 151, 3) + 0.4 * mistsFbm(x / 260, y / 260, 157, 2);
    // fog here only where it is short of the bank's reach, and the reach is never
    // more than the span, so a point with no room of its own (room < 0) stays clear
    const width = Math.min(span, MISTS_PAINT.faceRampM + Math.min(span - MISTS_PAINT.faceRampM, MISTS_PAINT.faceJagM) * Math.max(0, Math.min(1, (jag - 0.15) / 0.7)));
    if (width > 20) alpha = Math.max(alpha, smooth(-width, -width + MISTS_PAINT.faceRampM * 0.75, dTrue));
    // the fog here is lit from this face, not from the far one the margin hid
    eDepth = e + (Math.min(e, dTrue + Math.max(0, width)) - e) * k;
  }
  // THE CORE CARRIES NO WEATHER: deep behind the wall the front layers are the
  // core's own colour over the core, which adds nothing but a level of rounding
  // where a canvas's premultiplied alpha meets the vector wall, and that level
  // outlined every bake's box (and the town's margin) as a faint rectangle at
  // 284. So they fade out over a ragged line well inside the bake's box (past
  // their drift too), and the box's edge is the back layer's core alone, the
  // wall's exact colour.
  // (the line wanders ±coreJagM at two scales: a fade that follows the wall's
  // distance alone is the wall's rectangle again, a level lighter)
  if (layer > 0) {
    const n = Math.max(0, Math.min(1, 0.5 + 1.8 * (0.6 * mistsFbm(x / 900, y / 900, L.seed + 13, 3) + 0.4 * mistsFbm(x / 280, y / 280, L.seed + 17, 2) - 0.5)));
    alpha *= 1 - smooth(MISTS_PAINT.coreFadeM[0], MISTS_PAINT.coreFadeM[1], dTrue + MISTS_PAINT.coreJagM * (2 * n - 1));
  }
  // depth, broken by the same banks (lighter tongues, darker gaps) and by its own
  // noise, so the darkness does not follow the face in a ruled band
  const [jl, jd] = MISTS_PAINT.depthJagM;
  const s = smooth(0, MISTS_PAINT.depthM, eDepth + jl + (jd - jl) * mistsFbm(x / 800, y / 800, L.seed + 9, 3));
  const depth = Math.max(0, Math.min(1, s + (v - 0.5) * 0.35 * (1 - s)));
  return { alpha, depth };
}

// THE SHEET'S EDGE IS NOT A FACE (WLD-81): past the painting the ground is open
// country (the feather, mistsSheetFeatherAt, below), never fog.

/** Where the back layer turns opaque along a ray from a point on the true face
 *  (`at`, metres) out into the wall (`dir`, a unit vector): the least distance
 *  past which the paint is opaque, so the viewer's vector wall can follow the
 *  ragged face. 0 where the face stands on the clear side. Pure. */
export function mistsOpaqueFromM(m, at, dir, { stepM = 10 } = {}) {
  const most = mistsBackM(m, 0) + MISTS_PAINT.softM;
  let last = 0;
  for (let d = 0; d <= most; d += stepM) {
    if (mistsRenderAt(m, at.x + dir.x * d, at.y + dir.y * d, 0).alpha < 1) last = d + stepM;
  }
  return Math.min(last, most);
}

/** One baked pixel's paint, exactly as the bake decides it: nothing deep in the
 *  clear ground, the core past the core's depth (which stands back with the
 *  face's own wander, WLD-81), and mistsRenderAt between. `far` is mistsBakeFar(m, layer).
 *  Pure; the tests run this rule. */
export function mistsBakeAt(m, layer, x, y, keep = null, far = mistsBakeFar(m, layer)) {
  const dT = mistsTrueDistance(m, x, y);
  if (dT < -far) return { alpha: 0, depth: 0 };
  if (dT >= mistsCoreM(m)) return { alpha: layer === 0 ? 1 : 0, depth: 1 };   // the core: the back layer alone (coreFadeM)
  return mistsRenderAt(m, x, y, layer, keep);
}
/** How far behind the true face the paint is the core whatever its noise: the
 *  darkness's own depth past the furthest any layer's face stands back. */
export function mistsCoreM(m) {
  return MISTS_PAINT.depthM - MISTS_PAINT.depthJagM[0] + Math.max(0, ...MISTS_PAINT.layers.map((_, li) => mistsBackM(m, li)));
}
/** How far into the clear ground a layer's paint can reach (the bake's skip). */
export function mistsBakeFar(m, layer) {
  return mistsReachM(m) * MISTS_PAINT.layers[layer].reach + MISTS_PAINT.tongueM + (m.fringeM || 0) + MISTS_PAINT.softM;
}

// ── the town's keep-out ─────────────────────────────────────────────────────
// The rule itself (which ground is the town's) lives in tools/mists-keep.mjs, one
// definition shared with the creatures' spawn (WLD-56); the paint re-exports it and
// adds only the margin's soft edge and its ragged noise, below.
export { mistsOpenCountry, mistsKeepRects } from "../tools/mists-keep.mjs";
/** How kept-clear a point is, 0..1: 1 within a mark's margin less the soft
 *  band, 0 outside every rectangle. Pure (the tests' instrument); the bake uses
 *  a raster of the same rule. */
// two scales stretched apart (as the banks' edge is), so the margin's edge wanders well clear of a straight line;
// stretched only so far that it seldom saturates (a saturated wobble is a flat margin: a ruled edge, Darko 10-11)
const keepWobble = (x, y) => MISTS_PAINT.keepNoiseM * Math.max(0, Math.min(1, 0.5 + 2.4 * (0.45 * mistsFbm(x / 650, y / 650, 71, 3) + 0.55 * mistsFbm(x / 190, y / 190, 73, 2) - 0.5)));
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
  // past the core's depth (which stands back with the face's wander) and the widest drift
  const pad = mistsCoreM(m) + MISTS_PAINT.layers.reduce((a, L) => Math.max(a, L.driftM), 0) * 2;
  if (k) return { minX: k.x - k.r - pad, minY: k.y - k.r - pad, maxX: k.x + k.r + pad, maxY: k.y + k.r + pad };
  return { minX: m.clear.minX - pad, minY: m.clear.minY - pad, maxX: m.clear.maxX + pad, maxY: m.clear.maxY + pad };
}
/** What a crossing bakes: the main band in every layer at MISTS_PAINT.pxM,
 *  each clearing in the back layers at a resolution capped by clearingPx. A
 *  clearing's bake leaves to the main one whatever the main box holds (`skip`):
 *  its box is wide enough now (WLD-81) to reach into the main band, and two bakes
 *  of one place at two resolutions would seam. */
export function mistsBakePlan(m) {
  const main = mistsBakeBox(m), plan = MISTS_PAINT.layers.map((_, li) => ({ li, box: main, pxM: MISTS_PAINT.pxM }));
  for (const k of m.clearings ?? []) {
    const box = mistsBakeBox(m, k), pxM = Math.max(MISTS_PAINT.pxM, (box.maxX - box.minX) / MISTS_PAINT.clearingPx);
    for (let li = 0; li < MISTS_PAINT.clearingLayers; li++) plan.push({ li, box, pxM, skip: main });
  }
  return plan;
}
/** A bake of one layer over `box`, a band of rows at a time, so a page can
 *  spread it across frames: `next(rows)` paints the next rows and answers true
 *  while rows remain; `canvas` holds the result once done. */
export function mistsBaker(m, layer, box, { tint = MISTS_TINT, pxM = MISTS_PAINT.pxM, canvas = null, keepRects = null, keepRaster = null, skip = null } = {}) {
  const w = Math.max(1, Math.ceil((box.maxX - box.minX) / pxM)), h = Math.max(1, Math.ceil((box.maxY - box.minY) / pxM));
  const cv = canvas ?? (typeof OffscreenCanvas === "function" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h }));
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), px = img.data;
  const far = mistsBakeFar(m, layer);
  const kr = keepRaster ?? (keepRects?.length ? mistsKeepRaster(keepRects, box, pxM) : null);
  let j = 0;
  return {
    canvas: cv, width: w, height: h,
    next(rows = h) {
      for (const end = Math.min(h, j + rows); j < end; j++) {
        const y = box.minY + (j + 0.5) * pxM;
        for (let i = 0; i < w; i++) {
          const x = box.minX + (i + 0.5) * pxM, o = (j * w + i) * 4;
          if (skip && x >= skip.minX && x <= skip.maxX && y >= skip.minY && y <= skip.maxY) { px[o + 3] = 0; continue; }
          const kv = kr ? kr.at(i, j) : 0;
          const { alpha, depth } = mistsBakeAt(m, layer, x, y, kv > 0 ? Object.assign(() => kv, { dist: () => kr.dist(i, j) }) : null, far);
          if (!(alpha > 0)) { px[o + 3] = 0; continue; }
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
// Wolves half-seen in the fog, some with their eyes catching the light; ravens
// perched and lifting off; bats in ones and threes. Sparse at the Mists' first
// crossing, populated by 284. Seeded by the crossing, so a crossing always shows
// the same ones and nothing jitters. Never inside the town's keep-out, and never
// deep in the core, where a silhouette can't be seen.
//
// THE MISTS' OWN, NOT THE TOWN'S CREATURES (WLD-56 D5, Darko 2026-10-15 12:09).
// The live creatures (tools/creatures.mjs) come out into the fringe, on the clear
// side, where a resident can reach them and the read knows them. These painted
// ones stay wholly behind the wall's true face, so a silhouette is never mistaken
// for a creature that answers, and they are ravens, as the live kind is.
// WHOLLY means the DRAWN BOX, not the point it is drawn from (review of #219,
// F1): a wolf is drawn 92% up from its feet and half its size to either side, so
// its depth is measured from the edge of its box nearest the face. Each face has
// its own reach toward the clear side (north: the box below the feet; south: the
// box above them; east and west: half the width), and `depthM` is the gap
// between that edge and the face.
export const MISTS_CREATURES = {
  full: 284,
  wolves: [2, 9], ravens: [3, 16], bats: [2, 10],         // at the first crossing and from `full`
  sizeM: { wolf: 620, raven: 320, bat: 230 },
  // how far behind the wall's true face each silhouette's nearest edge stands, metres (> 0: wholly in the wall)
  depthM: { wolf: [40, 380], ravenPerch: [30, 300], ravenLift: [60, 420], bat: [50, 360] },
};
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Where the creatures stand at this crossing (metres, the engine's frame):
 *  [{ kind: "wolf"|"raven"|"bat", x, y, sizeM, flip, pose, eyes, phase }]. Pure. */
export function mistsCreatures(m, { first = 244, keep = null } = {}) {
  if (!m?.clear) return [];
  const C = MISTS_CREATURES, t = Math.max(0, Math.min(1, (m.crossing - first) / (C.full - first)));
  const count = ([a, b]) => Math.round(a + (b - a) * t);
  const r = seeded(Math.imul((m.crossing | 0) + 1, 2654435761));
  const c = m.clear;
  const sides = [
    { len: c.maxX - c.minX, at: (s, d) => ({ x: c.minX + s, y: c.minY - d }) },   // north: the wall is y < minY
    { len: c.maxX - c.minX, at: (s, d) => ({ x: c.minX + s, y: c.maxY + d }) },   // south
    { len: c.maxY - c.minY, at: (s, d) => ({ x: c.minX - d, y: c.minY + s }) },   // west
    { len: c.maxY - c.minY, at: (s, d) => ({ x: c.maxX + d, y: c.minY + s }) },   // east
  ];
  const total = sides.reduce((a, sd) => a + sd.len, 0);
  // how far a drawn box reaches from its point toward each face (north, south, west, east)
  const towardFace = (b) => [b.maxY, -b.minY, b.maxX, -b.minX];
  // a point whose drawn box's nearest edge stands `dIn..dOut` behind the face, anywhere round the band
  const onBand = (kind, pose, size, dIn, dOut) => {
    let u = r() * total, i = 0;
    for (; i < sides.length - 1; i++) { if (u <= sides[i].len) break; u -= sides[i].len; }
    const reach = towardFace(mistsCreatureBox({ kind, pose, x: 0, y: 0, sizeM: size }))[i];
    return sides[i].at(u, reach + dIn + (dOut - dIn) * r());
  };
  const out = [];
  const clearOfTown = (x, y, size) => !keep || [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].every(([a, b]) => keep(x + a * size, y + b * size) === 0);
  const apart = (x, y, size) => out.every((o) => Math.hypot(o.x - x, o.y - y) > (o.sizeM + size) * 0.75);
  const place = (kind, pose, dIn, dOut, extra) => {
    for (let tries = 0; tries < 60; tries++) {
      // judged where it is drawn (whole metres), so a margin's edge never falls between the two
      const size = Math.round(C.sizeM[kind] * (0.8 + 0.4 * r()));
      const p = onBand(kind, pose, size, dIn, dOut), x = Math.round(p.x), y = Math.round(p.y);
      if (!mistsCreatureBehindWall(m, { kind, pose, x, y, sizeM: size }) || !clearOfTown(x, y, size) || !apart(x, y, size)) continue;
      const cr = { kind, x, y, sizeM: size, flip: r() < 0.5, phase: +r().toFixed(3), pose, ...extra() };
      out.push(cr);
      return cr;
    }
    return null;
  };
  for (let i = 0, n = count(C.wolves); i < n; i++) place("wolf", "stand", ...C.depthM.wolf, () => ({ eyes: r() < 0.35 + 0.45 * t }));
  for (let i = 0, n = count(C.ravens); i < n; i++) {
    const flying = r() < 0.4;
    place("raven", flying ? "lift" : "perch", ...(flying ? C.depthM.ravenLift : C.depthM.ravenPerch), () => ({ eyes: false }));
  }
  for (let i = 0, n = count(C.bats); i < n; i++) {
    const lead = place("bat", "flit", ...C.depthM.bat, () => ({ eyes: false }));
    if (!lead || r() >= 0.45) continue;
    // a three: two more close by, if they too stand wholly behind the wall and clear of the town
    for (const [dx, dy] of [[1.6, -0.7], [-1.3, 0.9]]) {
      const x = Math.round(lead.x + dx * lead.sizeM), y = Math.round(lead.y + dy * lead.sizeM), size = Math.round(lead.sizeM * 0.8);
      const follower = { ...lead, x, y, sizeM: size };
      if (mistsCreatureBehindWall(m, follower) && mistsTrueDistance(m, x, y) <= C.depthM.bat[1] + size && clearOfTown(x, y, size))
        out.push({ ...follower, phase: +r().toFixed(3) });
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
  ravenperch: { d: "M8 80 L25 59 C30 52 36 49 42 44 C47 40 48 31 53 25 C58 18 68 17 75 22 L79 27 L94 32 L94 35 L78 36 C79 43 75 48 74 53 L78 55 L73 57 L75 60 L69 60 C65 66 60 70 53 73 L54 83 L63 86 L62 89 L49 88 L48 76 L41 77 L39 86 L45 89 L43 92 L34 88 L35 77 L13 87 Z", at: [-50, -89] },
  ravenlift: { d: "M6 78 L29 58 C28 43 21 29 17 20 Q18 16 22 20 L29 29 L27 13 Q28 9 32 13 L41 26 L40 8 Q42 5 45 10 L55 28 L55 13 Q58 10 60 16 L63 44 C66 40 73 40 77 44 L81 48 L96 52 L96 55 L81 57 C75 66 68 69 57 69 L51 79 L55 82 L53 85 L45 80 L48 71 L41 74 L34 88 L29 87 L34 76 L12 85 Z", at: [-50, -50] },
  bat: { d: "M50 39 L44 28 L41 44 C32 37 24 24 7 18 C12 31 11 44 3 57 C17 52 24 56 25 65 C35 60 41 65 43 73 L50 83 L57 73 C59 65 65 60 75 65 C76 56 83 52 97 57 C89 44 88 31 93 18 C76 24 68 37 59 44 L56 28 Z", at: [-50, -50] },
};
const creaturePath = (cr) => (cr.kind === "wolf" ? CREATURE_PATHS.wolf : cr.kind === "bat" ? CREATURE_PATHS.bat
  : cr.pose === "lift" ? CREATURE_PATHS.ravenlift : CREATURE_PATHS.ravenperch);
/** A kind's silhouette, the Mists' own art, for the page's LIVE creatures (play
 *  fix 35): its path in the 100-unit box. A kind the art does not draw (anything but a
 *  wolf or a bat) takes the perching raven's. Pure. */
export function creatureSilhouette(kind) {
  return { d: creaturePath({ kind: String(kind ?? ""), pose: null }).d };
}
/** The box a creature's silhouette is drawn in (metres, the engine's frame): its
 *  path's 100-unit box at its size, from its point. A flip mirrors it about the
 *  point, and every path is centred across (`at[0]` is -50), so the box holds. */
export function mistsCreatureBox(cr) {
  const P = creaturePath(cr), k = cr.sizeM / 100;
  return { minX: cr.x + P.at[0] * k, maxX: cr.x + (P.at[0] + 100) * k, minY: cr.y + P.at[1] * k, maxY: cr.y + (P.at[1] + 100) * k };
}
/** Does the whole drawn box stand behind the wall's true face: off the clear box, and off every clearing? */
export function mistsCreatureBehindWall(m, cr) {
  const b = mistsCreatureBox(cr), c = m.clear;
  if (!(b.maxX < c.minX || b.minX > c.maxX || b.maxY < c.minY || b.minY > c.maxY)) return false;
  return (m.clearings ?? []).every((k) => Math.hypot(Math.max(b.minX - k.x, 0, k.x - b.maxX), Math.max(b.minY - k.y, 0, k.y - b.maxY)) > k.r);
}
/** One creature as SVG, in the painting's frame. `ink` is the silhouette's
 *  colour (the fog's core); `eye` the light its eyes catch. */
export function mistsCreatureSVG(cr, { originPx, mPerPx, ink, eye = MISTS_EYE }) {
  const n = (v) => v.toFixed(1), s = cr.sizeM / 100 / mPerPx;
  const x = originPx.x + cr.x / mPerPx, y = originPx.y + cr.y / mPerPx;
  const P = creaturePath(cr);
  // a wolf's eye catches the light on the head, just behind the muzzle's root
  const eyes = cr.eyes ? `<g class="wv-mc-eyes" style="animation-delay:-${n(cr.phase * 9)}s"><circle cx="64" cy="25" r="1.6" fill="${eye}"/><circle cx="64" cy="25" r="4.5" fill="${eye}" opacity="0.3"/></g>` : "";
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${cr.flip ? "-" : ""}${s.toFixed(4)} ${s.toFixed(4)})">`
    + `<g class="wv-mc wv-mc-${cr.kind}${cr.pose ? " wv-mc-" + cr.pose : ""}" style="animation-delay:-${n(cr.phase * 12)}s">`
    + `<g transform="translate(${P.at[0]} ${P.at[1]})"><path d="${P.d}" fill="${ink}"/>${eyes}</g></g></g>`;
}
/** The same creature as HTML for the Mists' stage (WLD-43), where a moving part
 *  is an HTML box and so rides the compositor: the same place, scale and flip,
 *  the same path, the same motion about the same point (the feet, or a flier's
 *  middle), and the eyes as a box of their own so their blink is composited too.
 *  Painting units: the stage's camera scales them. */
export function mistsCreatureHTML(cr, { originPx, mPerPx, ink, eye = MISTS_EYE }) {
  const n = (v) => v.toFixed(1), s = cr.sizeM / 100 / mPerPx;
  const x = originPx.x + cr.x / mPerPx, y = originPx.y + cr.y / mPerPx;
  const P = creaturePath(cr);
  const box = `style="left:${P.at[0]}px;top:${P.at[1]}px" width="100" height="100" viewBox="0 0 100 100" aria-hidden="true"`;
  const eyes = cr.eyes ? `<div class="wv-mc-eyes" style="animation-delay:-${n(cr.phase * 9)}s"><svg class="wv-mc-art" ${box}><circle cx="64" cy="25" r="1.6" fill="${eye}"/><circle cx="64" cy="25" r="4.5" fill="${eye}" opacity="0.3"/></svg></div>` : "";
  return `<div class="wv-mc-at" style="transform:translate(${n(x)}px,${n(y)}px) scale(${cr.flip ? "-" : ""}${s.toFixed(4)},${s.toFixed(4)})">`
    + `<div class="wv-mc wv-mc-${cr.kind}${cr.pose ? " wv-mc-" + cr.pose : ""}" style="animation-delay:-${n(cr.phase * 12)}s">`
    + `<svg class="wv-mc-art" ${box}><path d="${P.d}" fill="${ink}"/></svg>${eyes}</div></div>`;
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
export const MISTS_SHEET = { featherM: 560, wobbleM: 420, pxM: 60 };   // the feather is soft: a coarse bake, upscaled smooth (fine enough for its shortest wobble)
/** How much of the open country covers the sheet at a point, 0..1. Pure. */
export function mistsSheetFeatherAt(frame, x, y) {
  // three scales, the shortest unsaturated, so its line never runs straight over the sea (Darko 10-11)
  const wob = 0.45 * mistsFbm(x / 1600, y / 1600, 97, 3) + 0.35 * mistsFbm(x / 480, y / 480, 131, 2) + 0.2 * mistsFbm(x / 170, y / 170, 137, 2);
  // the wobble only ever moves the feather inward, so it is whole at the sheet's
  // own edge everywhere (a feather thin there showed the edge as a ruled seam)
  const d = sdBox(x, y, frame) + MISTS_SHEET.wobbleM * (1 + Math.max(-1, Math.min(1, (wob - 0.5) * 3.2)));
  return smooth(-MISTS_SHEET.featherM, 0, d);
}
/** The feather baked over the sheet's border, in the open country's colour. */
/** `invert`: the same feather as a mask, white where the sheet shows (alpha
 *  1 - feather), for the sheet-sized washes drawn over the record's ground. */
export function bakeSheetFeather(frame, colour, { canvas = null, pxM = MISTS_SHEET.pxM, invert = false } = {}) {
  const pad = MISTS_SHEET.wobbleM + 2 * pxM;
  const box = { minX: frame.minX - pad, minY: frame.minY - pad, maxX: frame.maxX + pad, maxY: frame.maxY + pad };
  const w = Math.ceil((box.maxX - box.minX) / pxM), h = Math.ceil((box.maxY - box.minY) / pxM);
  const cv = canvas ?? Object.assign(document.createElement("canvas"), { width: w, height: h });
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), px = img.data, [r, g, b] = rgbOf(colour);
  const inner = MISTS_SHEET.featherM + 2 * MISTS_SHEET.wobbleM + pxM;
  for (let j = 0; j < h; j++) {
    const y = box.minY + (j + 0.5) * pxM;
    for (let i = 0; i < w; i++) {
      const x = box.minX + (i + 0.5) * pxM, o = (j * w + i) * 4;
      const f = sdBox(x, y, frame) < -inner ? 0 : mistsSheetFeatherAt(frame, x, y);   // deep inside the sheet: nothing
      if (invert) { px[o] = px[o + 1] = px[o + 2] = 255; px[o + 3] = Math.round(255 * (1 - f)); continue; }
      if (!f) continue;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = Math.round(255 * f);
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: cv, box, w: w * pxM, h: h * pxM };
}

// ── a room in the Mists: the fog around it, never over it (play fix 31) ─────
// Darko, playground 2026-10-15 18:37: "we can have the mist only touch like the
// exterior parts of the interior view … we can still have that mist effect
// around, but the actual area itself is visible." A mounted room's scene is the
// room's own extent plus its breathing room (roomGround's pad). When the room
// stands in the Mists at this crossing, the breathing room fogs over in the
// Mists' own colour, ragged by the Mists' own noise, and the extent itself stays
// clear to its edge: the soft edge lies wholly OUTSIDE the extent.
export const MISTS_ROOM = { softFrac: 0.55, wobbleFrac: 0.18, scaleFrac: 0.3, clearAlpha: 0.38, wallAlpha: 0.9 };

/** Whether a room stands in the Mists at this crossing, and how thickly: the
 *  engine's own `mistsHere` at the room's centre and corners, the thickest
 *  answer winning (behind the wall reads as 1). Null when it stands clear, or
 *  when there are no Mists. `r` is { minX, minY, maxX, maxY } in metres. Pure. */
export function roomInMists(m, r) {
  if (!m?.clear || !r || ![r.minX, r.minY, r.maxX, r.maxY].every(Number.isFinite)) return null;
  const cx = (r.minX + r.maxX) / 2, cy = (r.minY + r.maxY) / 2;
  let thickness = 0, inWall = false;
  for (const pt of [{ x: cx, y: cy }, { x: r.minX, y: r.minY }, { x: r.maxX, y: r.minY }, { x: r.minX, y: r.maxY }, { x: r.maxX, y: r.maxY }]) {
    const h = mistsHere(pt, m);
    if (h.inWall) { inWall = true; thickness = 1; }
    else thickness = Math.max(thickness, h.thickness);
  }
  return inWall || thickness > 0 ? { inWall, thickness } : null;
}

/** How much fog covers a point of a room's scene, 0..1: exactly 0 anywhere on
 *  the room's own box `r`, rising over the breathing room `padM` wide around
 *  it to full at its outer reach. The Mists' fbm moves the rise outward only,
 *  so the fog never reaches into the room. Pure. */
export function mistsRoomSurroundAt(r, x, y, padM) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX), dy = Math.max(r.minY - y, 0, y - r.maxY);
  const d = Math.hypot(dx, dy);
  if (!(d > 0) || !(padM > 0)) return 0;
  const sc = Math.max(1, padM * MISTS_ROOM.scaleFrac);
  const start = padM * MISTS_ROOM.wobbleFrac * mistsFbm(x / sc, y / sc, 211, 3);
  return smooth(start, start + padM * MISTS_ROOM.softFrac, d);
}

/** The surround baked over the scene's box (the room's box plus `padM` each
 *  side), in the fog's colour darkening outward, at the fog's own thickness:
 *  the fringe's haze is thinner than the wall. Browser only (a canvas). */
export function bakeRoomSurround(m, r, padM, fog, { canvas = null, px = 220 } = {}) {
  const box = { minX: r.minX - padM, minY: r.minY - padM, maxX: r.maxX + padM, maxY: r.maxY + padM };
  const pxM = Math.max(box.maxX - box.minX, box.maxY - box.minY) / px;
  const w = Math.max(1, Math.ceil((box.maxX - box.minX) / pxM)), h = Math.max(1, Math.ceil((box.maxY - box.minY) / pxM));
  const cv = canvas ?? Object.assign(document.createElement("canvas"), { width: w, height: h });
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), data = img.data;
  const alpha = fog?.inWall ? MISTS_ROOM.wallAlpha
    : MISTS_ROOM.clearAlpha + (MISTS_ROOM.wallAlpha - MISTS_ROOM.clearAlpha) * Math.max(0, Math.min(1, fog?.thickness ?? 0));
  for (let j = 0; j < h; j++) {
    const y = box.minY + (j + 0.5) * pxM;
    for (let i = 0; i < w; i++) {
      const x = box.minX + (i + 0.5) * pxM, f = mistsRoomSurroundAt(r, x, y, padM);
      if (!f) continue;
      const [cr, cg, cb] = mistsColourAt(m, 0.35 * f), o = (j * w + i) * 4;
      data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = Math.round(255 * alpha * f);
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: cv, box };
}
