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

// The fog's colour, ONE variable: the palette sitting sets it. A neutral cold
// grey until then. The face takes it; depth and the veil darken it toward
// near-black at the core.
export const MISTS_TINT = "#6a6f78";

// How the paint is shaped. Metres, so it holds at any zoom.
export const MISTS_PAINT = {
  reachM: [380, 900],    // how far the banks reach inward, at the first and the deepest veil
  cornerM: 600,          // the clear ground's corners, rounded into banks
  depthM: 1600,          // from the face to the core's full darkness
  softM: 50,             // a bank's own soft edge, inside the clear ground only
  pxM: 36,               // metres per baked pixel (the fog is soft; this keeps a phone's bake small)
  clearingPx: 320,       // a clearing's bake is at most this many pixels across (they are far off)
  clearingLayers: 2,     // and takes the back two layers only
  keepM: 320,            // the town's margin: past the widest drift (200 m), so a drifting bank never reaches a mark
  keepSoftM: 120,        // the margin's soft edge
  townMaxM: 2600,        // past this a mark is open country, not the town
  keepHaze: 0.06,        // the most any one layer may lay over the town (three of them: under 0.2)
  layers: [              // back to front: the back layer is the opaque one
    { seed: 11, scaleM: 2600, wispM: 700, reach: 1.0, alpha: 1.0, driftM: 90, driftS: 71 },
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
export function mistsFbm(x, y, seed, octaves = 3) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) { sum += amp * vnoise(x * f, y * f, seed + i * 101); norm += amp; amp *= 0.5; f *= 2.03; }
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
  const dTrue = mistsTrueDistance(m, x, y), dPaint = Math.max(paintDistance(m, x, y), dTrue);
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
    out.push({ minX: mk.at.x - w - g, maxX: mk.at.x + w + g, minY: mk.at.y - h - g, maxY: mk.at.y + h + g });
  }
  return out;
}
/** How kept-clear a point is, 0..1: 1 within a mark's margin less the soft
 *  band, 0 outside every rectangle. Pure (the tests' instrument); the bake uses
 *  a raster of the same rule. */
export function mistsKeepAt(rects) {
  const soft = MISTS_PAINT.keepSoftM;
  return (x, y) => {
    let k = 0;
    for (const r of rects) {
      if (x < r.minX || x > r.maxX || y < r.minY || y > r.maxY) continue;
      const inset = Math.min(x - r.minX, r.maxX - x, y - r.minY, r.maxY - y);
      k = Math.max(k, Math.min(1, inset / soft));
      if (k >= 1) return 1;
    }
    return k;
  };
}
/** The keep-out as a raster over a bake box (one cell per baked pixel). */
export function mistsKeepRaster(rects, box, pxM) {
  const w = Math.max(1, Math.ceil((box.maxX - box.minX) / pxM)), h = Math.max(1, Math.ceil((box.maxY - box.minY) / pxM));
  const grid = new Float32Array(w * h), soft = MISTS_PAINT.keepSoftM;
  for (const r of rects) {
    if (r.maxX < box.minX || r.minX > box.maxX || r.maxY < box.minY || r.minY > box.maxY) continue;
    const i0 = Math.max(0, Math.floor((r.minX - box.minX) / pxM)), i1 = Math.min(w - 1, Math.ceil((r.maxX - box.minX) / pxM));
    const j0 = Math.max(0, Math.floor((r.minY - box.minY) / pxM)), j1 = Math.min(h - 1, Math.ceil((r.maxY - box.minY) / pxM));
    for (let j = j0; j <= j1; j++) {
      const y = box.minY + (j + 0.5) * pxM;
      for (let i = i0; i <= i1; i++) {
        const x = box.minX + (i + 0.5) * pxM;
        // a whole cell counts as kept when any of it is: measure from the cell's far corner
        const inset = Math.min(x + pxM / 2 - r.minX, r.maxX - (x - pxM / 2), y + pxM / 2 - r.minY, r.maxY - (y - pxM / 2));
        if (inset <= 0) continue;
        const k = Math.min(1, inset / soft), o = j * w + i;
        if (k > grid[o]) grid[o] = k;
      }
    }
  }
  return { w, h, at: (i, j) => grid[j * w + i] };
}

// ── colour ──────────────────────────────────────────────────────────────────
function rgbOf(hex) { return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); }
/** The fog's colour at a depth for this veil: the tint at the face, toward
 *  near-black at the core, all of it dimmed by the veil. */
export function mistsColourAt(m, depth, tint = MISTS_TINT) {
  const [r, g, b] = rgbOf(tint), veil = m?.veil ?? 0;
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
export function mistsBaker(m, layer, box, { tint = MISTS_TINT, pxM = MISTS_PAINT.pxM, canvas = null, keepRects = null } = {}) {
  const w = Math.max(1, Math.ceil((box.maxX - box.minX) / pxM)), h = Math.max(1, Math.ceil((box.maxY - box.minY) / pxM));
  const cv = canvas ?? (typeof OffscreenCanvas === "function" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h }));
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), px = img.data;
  const far = mistsReachM(m) * MISTS_PAINT.layers[layer].reach + (m.fringeM || 0) + MISTS_PAINT.softM;
  const core = mistsColourAt(m, 1, tint), coreA = Math.round((layer === 0 ? 1 : MISTS_PAINT.layers[layer].alpha) * 255);
  const kr = keepRects?.length ? mistsKeepRaster(keepRects, box, pxM) : null;
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
          const { alpha, depth } = mistsRenderAt(m, x, y, layer, kv > 0 ? () => kv : null);
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
      if (clearOfTown(x, y, lead.sizeM * 0.8)) out.push({ ...lead, x: Math.round(x), y: Math.round(y), sizeM: Math.round(lead.sizeM * 0.8), phase: +r().toFixed(3) });
    }
  }
  return out;
}
// the silhouettes, drawn for this (no clip-art), in a 100-wide box with the
// feet (or the body's centre, for a flier) at the origin
const CREATURE_PATHS = {
  wolf: "M-42 -22c6-6 14-8 24-7l28-1c4-6 8-10 12-11l2-7 3 6 3-4 1 7c5 2 9 5 13 7l-2 3c-4 1-8 2-12 3-2 4-4 7-6 9l2 17h-4l-3-15c-9 1-19 1-27 0l-4 15h-4l-1-15c-5-1-11-3-15-4-4 3-8 7-14 9 4-4 6-8 4-12z",
  crowperch: "M-27 -6l13.5-6.5c1.6-6 7.4-10.4 15-10.6 2-4 6.2-6.2 10.4-5.6 2.2.3 4 1.4 5.2 2.8l9.4 1.9-9.4 1.7c-.2 4.4-2.6 8.6-6.6 11.3-4.4 3-10.8 3.8-16.4 2.6L-25 -4.5zM-1 -8.7l-1.2 5M3.4 -9.1l.6 5.4",
  crowlift: "M-32 -2c8-6 16-8 24-4 3-4 7-5 10-4 2-2 6-3 9-1l6-1-5 4c3 1 6 1 12-1-6 6-14 9-22 8-6 3-16 3-24 1-4-1-7-2-10-2z",
  bat: "M0 -6c1.2-2.6 2.4-3.6 3.6-3.8-.5 1.4-.4 2.6.6 3.4C7.6-10 14-12.6 21-12c-2.2 1.4-3.2 3.2-3.2 5.4 3.4-.7 7.6-.1 10.2 2.2-3.6.3-6.6 1.8-8.6 4.2-4.6-1.6-9.6-1.2-13.4 1.8C3.6 3.4 1.4 6.2 0 10c-1.4-3.8-3.6-6.6-6-8.4-3.8-3-8.8-3.4-13.4-1.8-2-2.4-5-3.9-8.6-4.2 2.6-2.3 6.8-2.9 10.2-2.2 0-2.2-1-4-3.2-5.4 7-.6 13.4 2 16.8 5.6 1-.8 1.1-2 .6-3.4 1.2.2 2.4 1.2 3.6 3.8z",
};
/** One creature as SVG, in the painting's frame. `ink` is the silhouette's
 *  colour (the fog's core); `eye` the light its eyes catch. */
export function mistsCreatureSVG(cr, { originPx, mPerPx, ink, eye = "#e9a54a" }) {
  const n = (v) => v.toFixed(1), s = cr.sizeM / 100 / mPerPx;
  const x = originPx.x + cr.x / mPerPx, y = originPx.y + cr.y / mPerPx;
  const path = cr.kind === "wolf" ? CREATURE_PATHS.wolf : cr.kind === "bat" ? CREATURE_PATHS.bat : cr.pose === "lift" ? CREATURE_PATHS.crowlift : CREATURE_PATHS.crowperch;
  const legs = cr.kind === "crow" && cr.pose === "perch" ? ` stroke="${ink}" stroke-width="1.4"` : "";
  const eyes = cr.eyes ? `<g class="wv-mc-eyes" style="animation-delay:-${n(cr.phase * 9)}s"><circle cx="17" cy="-25.5" r="1.5" fill="${eye}"/><circle cx="17" cy="-25.5" r="4" fill="${eye}" opacity="0.25"/></g>` : "";
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${cr.flip ? "-" : ""}${s.toFixed(4)} ${s.toFixed(4)})">`
    + `<g class="wv-mc wv-mc-${cr.kind}${cr.pose ? " wv-mc-" + cr.pose : ""}" style="animation-delay:-${n(cr.phase * 12)}s">`
    + `<path d="${path}" fill="${ink}"${legs}/>${eyes}</g></g>`;
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
