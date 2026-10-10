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
export function mistsRenderAt(m, x, y, layer = 0) {
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
  return { alpha: Math.max(bank, haze), depth };
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
export function mistsBaker(m, layer, box, { tint = MISTS_TINT, pxM = MISTS_PAINT.pxM, canvas = null } = {}) {
  const w = Math.max(1, Math.ceil((box.maxX - box.minX) / pxM)), h = Math.max(1, Math.ceil((box.maxY - box.minY) / pxM));
  const cv = canvas ?? (typeof OffscreenCanvas === "function" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h }));
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), px = img.data;
  const far = mistsReachM(m) * MISTS_PAINT.layers[layer].reach + (m.fringeM || 0) + MISTS_PAINT.softM;
  const core = mistsColourAt(m, 1, tint), coreA = Math.round((layer === 0 ? 1 : MISTS_PAINT.layers[layer].alpha) * 255);
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
          const { alpha, depth } = mistsRenderAt(m, x, y, layer);
          const [r, g, b] = mistsColourAt(m, depth, tint);
          px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = Math.round(alpha * 255);
        }
      }
      if (j >= h) { ctx.putImageData(img, 0, 0); return false; }
      return true;
    },
  };
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
