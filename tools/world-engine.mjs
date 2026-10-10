#!/usr/bin/env node
// world-engine.mjs — THE semantic-world library for Postmark.
//
// One library, four capabilities the spine verbs wrap thinly:
//   1. heightfield   — naive elevation over the seventeen ruled region bands
//   2. spatial query — index marks + terrain by position; ray-march the ground
//   3. FOV           — line-of-sight over the heightfield, honoring fog / light
//   4. radial serializer — visible marks as quantized bearings + named bands,
//                          ranked by angular size modulated by stamps (LOD)
//
// This is a PURE library: it consumes already-loaded, already-folded, already-
// lint-validated marks. It reads no marks from disk and defines no containment —
// the ONE loader and ONE `contains` live in marks-fold.mjs (shared with
// mark-lint.mjs, the 07-22 nesting gate). A second reader/geometry here would
// reintroduce the exact drift that design closes.
//
// What you "see" IS the marks tree (the paradigm, epic § The semantic world).
// Render cost is capped by a CONTEXT BUDGET, never proportional to world size:
// the FOV ranks every candidate but the telling carries only the top-budget,
// with the rest collapsed into an aggregate tail.
//
// LAWS THIS OBEYS (Wright's brief, decision 008, MARKS.md):
//   • Elevation derives from residents' words + the rulings, NEVER drawn pixels.
//     The bands are decision 008's; the region anchors are extracted from placed
//     homes + terrain features by the loader, not painted.
//   • Every numeric lean is a DIAL — in DIALS below or in the skeleton/config,
//     movable by ruling, never silently. (See WORLD/ENGINE.md for the table.)
//   • Deterministic and replayable from any clone: no wall-clock, no unseeded
//     randomness. Fog weather seeds from the crossing number (fogModel).
//   • Geometry is the authority; a declared edge that contradicts coordinates is
//     refused upstream by mark-lint.mjs ("you cannot lie with an edge"), which
//     shares the fold's one `contains`. The engine consumes validated marks.
//
// TWO LESSONS CARRIED (Jetto, budding-friendship build, 2026-07-22):
//   • Retroactive-replay hazard: a lean living in a code CONSTANT re-decides
//     history the day the constant changes. So the leans that could change a
//     past crossing's telling (fog model, band thresholds) are DIALS read from
//     config, and fog is a pure function of the crossing number — replay of
//     crossing N is byte-identical by construction, not by a guard.
//   • Law-line supersession: the light axis and Evermoon's west-move are
//     "provisional on caelum's word." A superseding ruling must RESTATE what it
//     carries forward (the anchors), the way a new rules-version restates the
//     meep set — it may not silently drop a pole. The engine reads light/terrain
//     as dated config so a supersession is a dated event, not a quiet flip.
//
// Pure library: no I/O here except reading is done by callers. Import `fold`
// from marks-fold.mjs (the canon computation) upstream; this consumes its output.

// ───────────────────────── DIALS (movable by ruling, never silently) ─────────
export const DIALS = {
  // radial serializer
  bearing_points: 16,               // compass quantization (16-point rose)
  // Named observer-relative distance bands (metres, first match wins). These are
  // COINED, not the town's — checked placements.json `band_vocabulary` first
  // (quayside/lower-slope/…/the-coast/outskirts): that is a POSITION axis (rings
  // from the centre), orthogonal to distance-from-the-observer, so it does not
  // map to radial bands. Words chosen to read as reach, never as terrain.
  distance_bands: [
    { max: 8,      name: "underfoot" },
    { max: 40,     name: "close by" },
    { max: 150,    name: "a stone's throw" },
    { max: 600,    name: "across the way" },
    { max: 2500,   name: "a fair way off" },
    { max: 8000,   name: "far off" },
    { max: Infinity, name: "on the horizon" },
  ],
  // LOD (level of detail) — the scaling law
  context_budget: 12,               // max marks carried in one telling
  world_scale_extent_m: 50000,      // a mark this big is the FRAME (the world-root) — its body is the establishing line, never a list item
  cluster_beyond_m: 600,            // past this, a household's marks collapse to its most-prominent (LOD tree-descent)
  max_sight_m: 20000,               // candidate cull radius (bounds compute; ~town diameter)
  weight_lod_k: 0.6,                // how much a mark's stamps lift its visibility
  angular_floor: 1e-5,              // below this angular size a mark is a speck
  // eye + line of sight
  eye_height_m: 1.7,                // observer eye above the ground they stand on
  los_step_m: 25,                   // heightfield sampling step along a sight ray
  los_clearance_m: 0.5,             // ground must clear the sight line by this to occlude
  // fog (status-effect surface, decision 008) — thickness seeds from the crossing
  fog_base: 0.45,                   // mean fog thickness across crossings [0..1]
  fog_swing: 0.45,                  // +/- deterministic swing per crossing
  fog_sight_floor_m: 120,           // thickest-fog sight radius at ground level
  fog_sight_ceiling_m: 20000,       // clear-air sight radius
  above_fog_bonus: 1.6,             // sightline multiplier when the eye is above the ceiling
  signal_fog_reach_mult: 6.0,       // a signal-mark cuts this many times further through fog
  // darkness (the light axis) — the far dark end dims what is not self-lit
  dark_dim_floor: 0.15,             // a non-luminous mark at the dark pole keeps this much visibility
  // heightfield
  idw_power: 2,                     // inverse-distance weighting exponent (naive, gentle)
  idw_k: 8,                         // k-nearest control points that contribute (localizes; hills don't bleed)
  // marks have height — a sited thing is not a flat ground decal; its top can
  // clear a gentle swell. A mark may declare top_m; else this modest default.
  default_mark_top_m: 4,
};

// ───────────────────────── 1. HEIGHTFIELD (naive, band-honoring) ────────────
// controlPoints: [{ x, y, h, id? }] — region band-midpoints + sea datum points,
// built by the loader from decision 008 + extracted anchors. IDW keeps open
// ground gentle and neutral (no drama sculpted between anchors).
export function buildHeightfield({ controlPoints, power = DIALS.idw_power, k = DIALS.idw_k }) {
  if (!controlPoints?.length) throw new Error("heightfield needs control points");
  const cps = controlPoints.map((c) => ({ x: c.x, y: c.y, h: c.h, id: c.id ?? null }));
  const K = Math.min(k, cps.length);
  // THE K NEAREST, WITHOUT SORTING THE WORLD TO FIND THEM.
  //
  // This function is the floor of the whole engine: line-of-sight samples it
  // along every ray, so opening one pair of eyes calls it tens of thousands of
  // times. It used to answer by building an object for EVERY control point,
  // sorting all of them, and keeping the first eight — O(n log n) work and n
  // allocations to select a constant 8. Profiling put 91% of openYourEyes in
  // here, and it was quietly superlinear in the size of the town, because the
  // control points are extracted from the marks: a town with 5× the marks has
  // 8× the control points, so every sample got dearer at the same time as there
  // were more samples to take. 743 marks → 1.3 s; 3,830 marks → 4.5 MINUTES.
  //
  // A fixed-size insertion beat is the whole fix. K is 8, so the inner shuffle
  // is a handful of moves and never grows; the scratch is hoisted out of the
  // call because allocating it per sample was a large share of the cost on its
  // own (the profiler's GC line). Answers are BIT-IDENTICAL to the sort — same
  // points, same order, same summation — and a test pins that against the
  // original implementation rather than against a remembered number.
  //
  // Ties keep the earlier control point, which is what the stable sort did: an
  // equal distance is decided by the index, so a latecomer never displaces the
  // point that was already holding the seat.
  const bestD2 = new Float64Array(K);
  const bestH = new Float64Array(K);
  const bestI = new Int32Array(K);
  let n = 0;
  // one candidate into the beat, ordered by (distance, index) — the index only
  // ever decides a tie, which the full scan below never meets out of order
  function offer(i, x, y) {
    const c = cps[i];
    const dx = x - c.x, dy = y - c.y;
    const d2 = dx * dx + dy * dy;
    if (n === K && !(d2 < bestD2[K - 1] || (d2 === bestD2[K - 1] && i < bestI[K - 1]))) return;   // cannot beat the worst held
    let j = n < K ? n : K - 1;
    while (j > 0 && (d2 < bestD2[j - 1] || (d2 === bestD2[j - 1] && i < bestI[j - 1]))) {
      bestD2[j] = bestD2[j - 1]; bestH[j] = bestH[j - 1]; bestI[j] = bestI[j - 1]; j -= 1;
    }
    bestD2[j] = d2; bestH[j] = c.h; bestI[j] = i;
    if (n < K) n += 1;
  }
  function weigh() {
    if (bestD2[0] === 0) return bestH[0];       // exactly on a control point
    let wsum = 0, hsum = 0;
    for (let i = 0; i < n; i += 1) { const w = 1 / Math.pow(bestD2[i], power / 2); wsum += w; hsum += w * bestH[i]; }
    return hsum / wsum;
  }
  function scanAll(x, y) {
    n = 0;
    for (let i = 0; i < cps.length; i += 1) offer(i, x, y);
    return weigh();
  }
  // ── A GRID OVER THE POINTS, SO A SAMPLE ASKS ITS NEIGHBOURS FIRST (POS-228) ──
  //
  // The beat above still visits every control point for every sample, and the
  // telling takes tens of thousands of samples; part 1's profile of the live
  // page put elevationAt at 9–14% of the main thread. So the points are
  // bucketed into square cells, and a sample walks rings of cells outward from
  // its own until the K it holds are CLOSER than anything a further ring could
  // contain — then stops. A sample far from every cell (the outliers sit 96 km
  // out) runs out of rings and takes the full scan, which is the old answer.
  //
  // THE ANSWER MUST NOT MOVE BY A BIT, and the reason it cannot is the stop
  // rule. A point left unvisited is at least the ring's edge away, and the
  // search only stops when the K-th distance held is strictly inside that edge
  // (with a margin for the edge's own rounding) — so every point that could sit
  // in the K, or tie with its last seat, was visited. Visiting order is by cell
  // rather than by index, so ties are broken on the INDEX explicitly: the same
  // (distance, index) order the stable sort kept, and the same order the full
  // scan's strict comparisons keep. heightfield-selection.test.mjs holds both
  // paths against the original sort.
  const grid = cps.length > GRID_MIN_POINTS && cps.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y))
    ? buildGrid(cps, K) : null;
  function elevationAt(x, y) {
    if (!grid || !Number.isFinite(x) || !Number.isFinite(y)) return scanAll(x, y);
    const { size, cells, maxRing } = grid;
    const cx = Math.floor(x / size), cy = Math.floor(y / size);
    n = 0;
    for (let r = 0; r <= maxRing; r += 1) {
      for (let gx = cx - r; gx <= cx + r; gx += 1) {
        const edgeX = gx === cx - r || gx === cx + r;
        for (let gy = cy - r; gy <= cy + r; gy += (edgeX || r === 0) ? 1 : 2 * r) {
          const cell = cells.get(gx * GRID_KEY_SPAN + gy);
          if (cell) for (let m = 0; m < cell.length; m += 1) offer(cell[m], x, y);
        }
      }
      if (n < K) continue;
      // the nearest a point outside the rings walked so far can be, less a
      // hair for the rounding in the division that filed each point in a cell
      const edge = Math.min(x - (cx - r) * size, (cx + r + 1) * size - x, y - (cy - r) * size, (cy + r + 1) * size - y) - size * 1e-9;
      if (edge > 0 && bestD2[K - 1] < edge * edge) return weigh();
    }
    return scanAll(x, y);
  }
  return { elevationAt, controlPoints: cps };
}

const GRID_MIN_POINTS = 64;       // below this the full scan is already cheap
const GRID_KEY_SPAN = 1 << 21;    // cell (gx, gy) → one number key; a collision only merges two cells, never loses one
// The cell is sized off the middle half of the points (the interquartile box
// in x and in y), so the 96 km outliers cannot stretch it, to hold about K/4 of
// them — measured on the town's 627 points over twenty tellings, ~350 m cells
// ran 2.1–2.3× faster than the full scan, where 700 m and 240 m cells were
// slower. The rings stop once walking them would visit more cells than half the
// points: past that, the full scan is the cheaper way to the same answer.
function buildGrid(cps, K) {
  const iqr = (vals) => { const s = [...vals].sort((a, b) => a - b); return s[Math.floor(s.length * 0.75)] - s[Math.floor(s.length * 0.25)]; };
  const area = Math.max(1, iqr(cps.map((c) => c.x)) * iqr(cps.map((c) => c.y)));
  const size = Math.max(1, Math.sqrt((area * K) / cps.length));
  const maxRing = Math.max(2, Math.floor((Math.sqrt(cps.length / 2) - 1) / 2));
  const cells = new Map();
  for (let i = 0; i < cps.length; i += 1) {
    const key = Math.floor(cps[i].x / size) * GRID_KEY_SPAN + Math.floor(cps[i].y / size);
    let cell = cells.get(key);
    if (!cell) cells.set(key, (cell = []));
    cell.push(i);
  }
  return { size, cells, maxRing };
}

// ───────────────────────── radial helpers ──────────────────────────────────
// grid: x east, y south. Compass: N = -y, E = +x, S = +y, W = -x.
const ROSE16 = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
export function bearingDeg(dx, dy) {
  const deg = Math.atan2(dx, -dy) * 180 / Math.PI; // 0=N, 90=E
  return (deg + 360) % 360;
}
export function quantizeBearing(deg, points = DIALS.bearing_points) {
  const step = 360 / points;
  const idx = Math.round(deg / step) % points;
  if (points === 16) return ROSE16[idx];
  return `${Math.round(idx * step)}°`;
}
export function distanceBand(m, bands = DIALS.distance_bands) {
  for (const b of bands) if (m <= b.max) return b.name;
  return bands[bands.length - 1].name;
}

// ───────────────────────── the light axis ──────────────────────────────────
// lightLevel: 1 at the dawn pole, 0 at the dark pole, linear along the axis,
// clamped. Provisional on caelum's word (decision 008) — the poles are dated
// config the loader passes in, not constants here.
//
// THE VEIL (POS-466). `veil` [0..1] is the share of the daylight the Mists take
// away this crossing (mistsAt(...).veil). It scales the whole axis, so the
// gradient keeps its shape and the whole land dims together. Absent or 0, the
// answer is the unveiled one, bit for bit.
export function lightLevelAt(x, y, light, veil = 0) {
  const ax = light.dark_pole_m.x - light.dawn_pole_m.x;
  const ay = light.dark_pole_m.y - light.dawn_pole_m.y;
  const len2 = ax * ax + ay * ay || 1;
  const t = ((x - light.dawn_pole_m.x) * ax + (y - light.dawn_pole_m.y) * ay) / len2;
  const level = Math.max(0, Math.min(1, 1 - t)); // 1 at dawn end, 0 at dark end
  return veil > 0 ? level * (1 - Math.min(1, veil)) : level;
}

// ───────────────────────── fog (deterministic per crossing) ─────────────────
// A pure hash of the crossing number → thickness [0..1]. No wall-clock, no
// unseeded randomness: crossing N always yields the same weather, so any clone
// replays the same telling. (Retroactive-replay guard, by construction.)
export function fogModel(crossing, dials = DIALS) {
  let h = (Math.imul((crossing | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  const u = h / 0xffffffff;                       // deterministic [0,1)
  const thickness = Math.max(0, Math.min(1, dials.fog_base + (u - 0.5) * 2 * dials.fog_swing));
  return { crossing: crossing | 0, thickness };
}

// ───────────────────────── the Mists (a border band, on a schedule) ─────────
// The weather above has no place: one thickness for the whole town. The Mists
// are the other kind of fog, the kind with a place. They stand at the map's
// border as a WALL, and on a schedule keyed to the crossing number the wall
// creeps in from the edges, or pulls back past them.
//
// The record is `skeleton.mists` (it reaches every reader as `world.terrain`;
// tools/world-terrain-gen.mjs emits it, so a regenerate keeps it):
//
//   border_m   { minX, minY, maxX, maxY }  where the wall stands at front 0,
//              pinned as dated config. It is never derived from what the record
//              happens to draw today, because a border that moved with the
//              record would re-tell past crossings.
//   clearings_m  [{ id, x, y, r_m }]  clear ground the wall never takes: a
//              household's land standing far past the border keeps a circle of
//              open air round it (ruled 2026-10-09: no parcel is covered but the
//              one ruled under). Clearings do not creep.
//   fringe_m   the translucent haze on the clear side of the wall
//   wall_sight_m  how far a body standing INSIDE the wall can see
//   schedule   [{ crossing, front_m, veil }, …] in crossing order. front_m is
//              how far the wall stands in from the border: a number for every
//              side, or { n, e, s, w }. Positive means the wall has crept onto
//              the map; negative means it has pulled back past the edge. veil
//              [0..1] is the share of all light the Mists take (lightLevelAt).
//              Between two entries both move linearly; after the last they hold.
//   density    { from, to, power }  the fringe's thickness where it meets the
//              wall, eased from the schedule's first crossing to its last:
//              from + (to − from) · u^power, u the share of the span gone. A
//              power above 1 thickens slowly at first and faster as the last
//              crossing nears.
//
// BEFORE THE SCHEDULE'S FIRST CROSSING THERE ARE NO MISTS: mistsAt answers null,
// and every reader then answers exactly as it did before the Mists existed. Like
// the weather, it is a pure function of the crossing number, so replay holds.
//
// THE WALL OCCLUDES EVERYTHING BEHIND IT. It has no ceiling and no height
// exemption, and a signal's light does not cut it: no sight line that passes
// through the wall reaches its target, however tall the thing standing there.
// The clear ground is the box inside the wall plus the clearings, each of them
// convex, so a sight line is clear exactly when the pieces of it inside those
// shapes cover the whole of it. Within the box alone that is the old rule: a
// target is hidden exactly when it stands behind the wall. Once the wall
// recedes past a target, it is in sight again.
const SIDES = ["n", "e", "s", "w"];
const lerpN = (a, b, t) => a + (b - a) * t;
function sidesOf(front) {
  if (front && typeof front === "object") return Object.fromEntries(SIDES.map((s) => [s, Number(front[s]) || 0]));
  const v = Number(front) || 0;
  return { n: v, e: v, s: v, w: v };
}
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function mistsAt(crossing, mists) {
  const sched = Array.isArray(mists?.schedule) ? mists.schedule : [];
  const b = mists?.border_m;
  if (!sched.length || !b || ![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) return null;
  const c = crossing | 0;
  if (c < sched[0].crossing) return null;                    // before the dial: no Mists at all
  let i = 0;
  while (i + 1 < sched.length && sched[i + 1].crossing <= c) i += 1;
  const a = sched[i], z = sched[i + 1] ?? a;
  const t = z === a ? 0 : (c - a.crossing) / (z.crossing - a.crossing);
  const fa = sidesOf(a.front_m), fz = sidesOf(z.front_m);
  const front = Object.fromEntries(SIDES.map((s) => [s, lerpN(fa[s], fz[s], t)]));
  // the density's own eased curve over the whole schedule
  const first = sched[0].crossing, last = sched[sched.length - 1].crossing;
  const u = last > first ? Math.max(0, Math.min(1, (c - first) / (last - first))) : 1;
  const d = mists.density ?? {};
  const power = Number(d.power) > 0 ? Number(d.power) : 1;
  const density = clamp01(lerpN(Number(d.from) || 0, Number(d.to ?? d.from) || 0, Math.pow(u, power)));
  const clearings = (Array.isArray(mists.clearings_m) ? mists.clearings_m : [])
    .filter((k) => [k?.x, k?.y, k?.r_m].every(Number.isFinite) && k.r_m > 0)
    .map((k) => ({ id: k.id ?? null, x: k.x, y: k.y, r: k.r_m }));
  return {
    crossing: c,
    front,
    // the clear ground: north is -y, east +x, south +y, west -x
    clear: { minX: b.minX + front.w, maxX: b.maxX - front.e, minY: b.minY + front.n, maxY: b.maxY - front.s },
    clearings,
    density,
    veil: clamp01(lerpN(Number(a.veil) || 0, Number(z.veil) || 0, t)),
    fringeM: Math.max(0, Number(mists.fringe_m) || 0),
    wallSightM: Math.max(0, Number(mists.wall_sight_m) || 0),
  };
}

/** Where a point stands in the Mists: `inWall` (behind the wall), the distance
 *  to the wall (`wallM`, 0 inside it), and the fringe's thickness there (0 out
 *  of the fringe, rising to the band's density at the wall). */
export function mistsHere(p, m) {
  const { clear } = m;
  let wallM = -Infinity;
  if (p.x >= clear.minX && p.x <= clear.maxX && p.y >= clear.minY && p.y <= clear.maxY)
    wallM = Math.min(p.x - clear.minX, clear.maxX - p.x, p.y - clear.minY, clear.maxY - p.y);
  for (const k of m.clearings ?? []) {
    const inside = k.r - Math.hypot(p.x - k.x, p.y - k.y);
    if (inside >= 0 && inside > wallM) wallM = inside;
  }
  if (wallM < 0) return { inWall: true, wallM: 0, thickness: 1 };
  const thickness = m.fringeM > 0 && wallM < m.fringeM ? m.density * (1 - wallM / m.fringeM) : 0;
  return { inWall: false, wallM, thickness };
}

// the stretch [t0, t1] of the segment a→b (t in 0..1) that lies inside a box,
// or inside a circle; null when it never enters
function segInBox(a, b, r) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.minX], [dx, r.maxX - a.x], [-dy, a.y - r.minY], [dy, r.maxY - a.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [t0, t1];
}
function segInCircle(a, b, k) {
  const dx = b.x - a.x, dy = b.y - a.y, fx = a.x - k.x, fy = a.y - k.y;
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - k.r * k.r;
  if (A === 0) return C <= 0 ? [0, 1] : null;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - s) / (2 * A)), t1 = Math.min(1, (-B + s) / (2 * A));
  return t0 <= t1 ? [t0, t1] : null;
}

/** Is `target` hidden by the wall from `from`? From clear ground, exactly when
 *  some stretch of the sight line runs through the wall. From inside the wall,
 *  everything past arm's reach (wall_sight_m) is hidden. */
export function mistsHide(from, target, m) {
  if (mistsHere(from, m).inWall) return Math.hypot(target.x - from.x, target.y - from.y) > m.wallSightM;
  const spans = [segInBox(from, target, m.clear), ...(m.clearings ?? []).map((k) => segInCircle(from, target, k))]
    .filter(Boolean).sort((p, q) => p[0] - q[0]);
  let reached = 0;
  for (const [t0, t1] of spans) {
    if (t0 > reached + 1e-9) break;                         // a gap: the line runs through the wall
    if (t1 > reached) reached = t1;
  }
  return reached < 1 - 1e-9;
}

// ───────────────────────── the Mists slow the walk (POS-468) ─────────────────
// Darko, 2026-10-09: "the further they make it into the mist, the slower they
// get until they essentially hit zero". So the stride through the fringe falls
// with DEPTH, to nothing at the wall's face, and no road goes into the wall at
// all: there is no creeping in by short legs.
//
// THE CURVE. At a point in the fringe, s = 1 − wallM / fringe_m is how deep it
// stands (0 at the fringe's outer edge, 1 at the wall's face), and d is the
// day's density. The stride there is scaled by
//
//     mistsStride(s, d) = (1 − s)^(2d)
//
// It is 1 at the outer edge and 0 at the face on every crossing, and it falls
// with depth and with density: the thicker the day's mist, the earlier in the
// fringe it bites. Out of the fringe it is 1, and before the Mists there is no
// fringe at all.
//
// THE LEG. A walk is one straight leg at an even pace (calls 1 and 2, ruled):
// the mist is read once, when the walk is declared, and the leg's time through
// it is spread over the whole leg, so its ETA is exact and its position stays
// a pure function of the line and the clock. The factor is length ÷ ∫ ds / stride,
// stamped on the leg as part of its pace.
export function mistsStride(s, d) {
  if (!(s > 0)) return 1;
  if (s >= 1) return 0;
  return Math.pow(1 - s, 2 * Math.max(0, d));
}

// A leg could otherwise be slowed to nothing at all; this is the floor the factor
// is stamped at (a leg ten thousand times slower than the open road), so a
// stamped pace is always a number a reader can divide by.
export const MISTS_STRIDE_FLOOR = 1e-4;

/** The Mists on one leg, read once at its declaration: `null` when there are no
 *  Mists this crossing; otherwise `{ refused }` for a road that ends in the wall
 *  or crosses it (with the point where it meets the wall), or `{ factor, deepest }`
 *  — the leg's even stride as a share of the open road's, and how deep into the
 *  fringe it goes (0 untouched, toward 1 at the wall's face). */
export function mistsRoad(from, toward, crossing, mists) {
  const m = mistsAt(crossing, mists);
  if (!m) return null;
  const L = Math.hypot(toward.x - from.x, toward.y - from.y);
  const at = (t) => ({ x: from.x + (toward.x - from.x) * t, y: from.y + (toward.y - from.y) * t });
  const wallAt = (p) => { const h = mistsHere(p, m); return h.inWall ? 0 : h.wallM; };
  // the road may not start, pass or end in the wall, nor on its face
  if (wallAt(from) <= 0 || wallAt(toward) <= 0 || (L > 0 && mistsHide(from, toward, m))) {
    let t = 0;
    if (wallAt(from) > 0) { const n = Math.max(1, Math.ceil(L)); for (let i = 1; i <= n; i += 1) { t = i / n; if (wallAt(at(t)) <= 0) break; } }
    const p = at(t);
    return { refused: { x: Math.round(p.x), y: Math.round(p.y) }, factor: 0, deepest: 1 };
  }
  if (L === 0) return { factor: 1, deepest: 0 };
  // ∫ ds / stride, stepping finer as the road nears the wall
  const f = m.fringeM;
  let time = 0, deepest = 0, t = 0;
  while (t < 1) {
    const w = wallAt(at(t));
    const h = Math.min(10, Math.max(0.05, w / 4)) / L;            // metres → share of the leg
    const dt = Math.min(h, 1 - t);
    const mid = at(t + dt / 2);
    const wm = wallAt(mid);
    const s = f > 0 && wm < f ? 1 - wm / f : 0;
    if (s > deepest) deepest = s;
    time += (dt * L) / Math.max(mistsStride(s, m.density), 1e-12);
    t += dt;
  }
  // a road the fringe never touched is the open road, exactly
  if (deepest === 0) return { factor: 1, deepest: 0 };
  const factor = Math.max(MISTS_STRIDE_FLOOR, Math.min(1, L / time));
  return { factor, deepest };
}

// ───────────────────────── status effects at a point ───────────────────────
export function statusAt({ x, y, groundH, eyeH, heightfield, light, fog, fogCeilingM, veil = 0 }) {
  const eyeElev = groundH + eyeH;
  const inFog = groundH < fogCeilingM && fog.thickness > 0.02;
  const aboveFog = eyeElev >= fogCeilingM;
  const lightLevel = lightLevelAt(x, y, light, veil);
  const inDarkness = lightLevel < 0.25;
  return { eyeElev, inFog, aboveFog, lightLevel, inDarkness };
}

// ───────────────────────── 3. LINE OF SIGHT over the ground ─────────────────
// Samples the heightfield along the ray; the target is occluded if the ground
// between rises above the straight eye→target sight line. Flat-earth (curvature
// negligible at town scale). Returns clearance in metres (>0 clear, <0 blocked).
export function lineOfSight({ from, to, heightfield, eyeH = DIALS.eye_height_m, targetTopM = 0, step = DIALS.los_step_m, clearanceM = DIALS.los_clearance_m }) {
  const gx0 = heightfield.elevationAt(from.x, from.y);
  const gx1 = heightfield.elevationAt(to.x, to.y);
  const eye = gx0 + eyeH;
  const tgt = gx1 + targetTopM;
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < step) return { visible: true, clearance: Infinity, dist };
  let minClear = Infinity, occludeAt = null;
  const n = Math.ceil(dist / step);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const sx = from.x + dx * t, sy = from.y + dy * t;
    const sightLine = eye + (tgt - eye) * t;     // straight line eye→target top
    const ground = heightfield.elevationAt(sx, sy);
    const clear = sightLine - ground;            // +ve: ground is below the line
    if (clear < minClear) { minClear = clear; occludeAt = { x: Math.round(sx), y: Math.round(sy), ground: +ground.toFixed(1) }; }
  }
  const visible = minClear >= clearanceM;
  return { visible, clearance: +minClear.toFixed(1), occludeAt: visible ? null : occludeAt, dist };
}

// ───────────────────────── LOD score ───────────────────────────────────────
// angular size (extent / distance) modulated by stamps; fog + darkness dim it
// unless the mark is a signal (a navigational light cuts through). The economy
// and the renderer read the SAME signal (mark.weight) — "the rendered ledger of
// accumulated preference," operational.
export function lodScore({ extentM, distM, weight = 0, dials = DIALS, dimming = 1 }) {
  const angular = Math.max(dials.angular_floor, extentM / Math.max(distM, 1));
  const stamp = 1 + dials.weight_lod_k * Math.log1p(Math.max(0, weight));
  return angular * stamp * dimming;
}

// ───────────────────────── 2+4. FIELD OF VIEW + radial serialize ────────────
// observer: { x, y, name? }
// world:    { marks, terrain, heightfield, light, fogCeilingM } — marks are the
//           FOLDED marks (id, kind, at, extent, weight, body, signal?, household).
// opts:     { crossing, budget }
// Returns a structured telling: the observer's state, the ranked visible marks
// grouped by bearing→band, far-features on the horizon, and the aggregate tail.
export function fieldOfView(observer, world, { crossing = 0, budget = DIALS.context_budget, dials = DIALS } = {}) {
  const { marks, terrain, heightfield, light, fogCeilingM } = world;
  const fog = fogModel(crossing, dials);
  // the Mists (POS-466): null before the schedule's first crossing, and then
  // nothing below changes by a byte
  const mists = mistsAt(crossing, terrain?.mists);
  const veil = mists ? mists.veil : 0;
  const groundH = heightfield.elevationAt(observer.x, observer.y);
  const self = statusAt({ x: observer.x, y: observer.y, groundH, eyeH: dials.eye_height_m, heightfield, light, fog, fogCeilingM, veil });

  // the observer's own fog-limited sight radius this crossing
  // fog closes the view with a curve, so even moderate fog bites (a low-lying
  // layer you look THROUGH); above the ceiling the sightlines run long.
  const fogT = self.inFog ? fog.thickness : 0;
  const clearReach = self.aboveFog
    ? dials.fog_sight_ceiling_m * dials.above_fog_bonus
    : dials.fog_sight_floor_m + (dials.fog_sight_ceiling_m - dials.fog_sight_floor_m) * Math.pow(1 - fogT, 3);
  // The Mists' fringe closes the view the way the weather does (the same curve),
  // but it has no ceiling: an eye above the fog line is still standing in it.
  // Inside the wall, a body sees arm's reach. The wall itself is not a reach:
  // it is a hard cut, applied per target below.
  const mistSelf = mists ? mistsHere(observer, mists) : null;
  const mistReach = !mistSelf ? Infinity
    : mistSelf.inWall ? mists.wallSightM
    : mistSelf.thickness > 0 ? dials.fog_sight_floor_m + (dials.fog_sight_ceiling_m - dials.fog_sight_floor_m) * Math.pow(1 - mistSelf.thickness, 3)
    : Infinity;
  // A SIGNAL'S LIGHT IS VEILED TOO (Darko, 2026-10-09: "the Mists dim every
  // light in the land, daylight and residents' signals alike"). A signal keeps
  // its own light at the dark end, as ever, but the light a reader is told it
  // shows (`dim`) is scaled by (1 − veil).
  //
  // THE VEIL DARKENS WHAT IS TOLD, NEVER WHAT IS REACHED. The office builds a
  // standpoint's law reach from this telling (the carried and far marks), so if
  // the veil re-ranked marks it would move law reach across the whole town, and
  // the ruling is that only what stands behind the wall is lost. So the ranking,
  // the budget and every visibility test read the UNVEILED light, as they did
  // before the Mists; only the reported `dim` and the observer's own light carry
  // the veil. The wall is the one thing in the Mists that takes a mark out of
  // reach.
  const signalLight = veil > 0 ? 1 - Math.min(1, veil) : 1;
  const signalMult = dials.signal_fog_reach_mult;

  const seen = [];
  for (const mk of marks) {
    if (!mk.at) continue;                                   // predicated/naming have no site of their own
    // A PARCEL RENDERS IN THE WORLD LIKE ANY OTHER MARK (the home-images
    // ruling, Keemin 2026-08-21: "make sure parcels render in the World like
    // any other mark. We removed them but that makes no sense if they get the
    // home image"). This lane used to skip `kind: parcel` as "a land-claim
    // boundary is not scenery you see" — true of an empty 25×25 survey square,
    // and false the moment that square carries a household's own home art. The
    // gold plan (Starstory PULSE/gold-plans/postmark-home-images) retires the
    // exclusion rather than gating it on `image:`, because a kind-gated hole in
    // the DEFAULT mark lane is the thing that made the art invisible in the
    // first place: parcels are marks, and the telling tells marks.
    if (mk.far) continue;                                   // a far:true mark is a horizon object (told below), never ground scenery
    if (markExtent(mk) >= dials.world_scale_extent_m) continue; // the world-root is the frame — establishing line, not a list item
    const dx = mk.at.x - observer.x, dy = mk.at.y - observer.y;
    const distM = Math.hypot(dx, dy);
    if (distM > dials.max_sight_m) continue;                // compute cull (bounds cost)
    if (distM < 1e-6) continue;                             // standing on it — orient() covers "here"
    // angular size uses the mark's true SILHOUETTE span (its visible width from
    // here) when it carries a fine shape; a plain rect falls back to max(w,h) —
    // byte-identical for every current record (none carry a points: ring).
    const extentM = markSilhouetteSpan(mk, dx, dy) ?? markExtent(mk);
    const targetH = heightfield.elevationAt(mk.at.x, mk.at.y);
    const isSignal = !!mk.signal;

    // fog reach: signal marks cut much further through fog
    const reach = isSignal ? clearReach * signalMult : clearReach;
    // the Mists: the fringe's reach (a signal cuts it as it cuts the weather),
    // and the wall, which nothing cuts
    const mistHidden = !!mists && (mistsHide(observer, mk.at, mists)
      || distM > (isSignal && !mistSelf.inWall ? mistReach * signalMult : mistReach));
    const fogHidden = distM > reach || mistHidden;

    // darkness dimming: a non-signal, non-luminous mark at the dark end is dim
    // the unveiled light ranks (it is the light there was before the Mists, bit
    // for bit); the veiled light is what the reader is told
    const rawLight = lightLevelAt(mk.at.x, mk.at.y, light);
    const rankDimming = rawLight < 0.25 && !isSignal ? lerp(1, dials.dark_dim_floor, (0.25 - rawLight) / 0.25) : 1;
    const tgtLight = veil > 0 ? lightLevelAt(mk.at.x, mk.at.y, light, veil) : rawLight;
    const dark = tgtLight < 0.25 && !isSignal;
    const dimming = veil > 0 ? (dark ? lerp(1, dials.dark_dim_floor, (0.25 - tgtLight) / 0.25) : isSignal ? signalLight : 1) : rankDimming;

    // terrain occlusion (the FOV over the heightfield) — every lean honored from
    // `dials` so a dev-pane override changes the sightline too, not just the ranking
    const los = lineOfSight({ from: observer, to: mk.at, heightfield, eyeH: dials.eye_height_m, targetTopM: markTop(mk, dials), step: dials.los_step_m, clearanceM: dials.los_clearance_m });

    const score = lodScore({ extentM, distM, weight: mk.weight, dials, dimming: rankDimming });
    const visible = !fogHidden && (los.visible || isSignal); // a signal's light is seen even where its footing is occluded
    seen.push({
      id: mk.id, kind: mk.kind, household: mk.household, body: mk.body,
      at: mk.at, distM: Math.round(distM), extentM, weight: mk.weight ?? 0, signal: isSignal,
      bearing: quantizeBearing(bearingDeg(dx, dy), dials.bearing_points),
      band: distanceBand(distM, dials.distance_bands),
      elevM: +targetH.toFixed(1), aboveFogTarget: targetH >= fogCeilingM,
      occluded: !los.visible, occludeAt: los.occludeAt, dim: +dimming.toFixed(2), score,
      visible,
      ...(mists ? { mistHidden } : {}),
    });
  }

  // far-features on the horizon (Pando): a horizon object, not heightfield ground.
  // Rendered FROM the far:true MARKS — every claim in the UI is a mark-cell, so the
  // card's identity is the mark's id (the-town/pando-peak). Its height, label and
  // receipt come from the skeleton feature its `feature:` link names; its BEARING
  // and DISTANCE are measured from the observer to the mark's own `at`, like every
  // other mark's. The skeleton's `bearing`/`distance_m` were surveyed from the
  // Origin, so reading them as "from you" told a resident at Pando's foot that the
  // peak was 135 km away (Kogane, 2026-09-21; POS-222). Keemin ruled 2026-10-02 that
  // this ends decision 008's "the skeleton is the measurement" split for distance
  // and bearing. Seen on any clear sightline (decision 008): above fog always, or
  // when this crossing's fog is thin enough.
  const farSeen = [];
  const clearHorizon = self.aboveFog || fog.thickness < 0.5;
  const farFeatureById = new Map((terrain?.far_features ?? []).map((f) => [f.id, f]));
  for (const mk of marks) {
    if (!mk.far || !mk.at) continue;
    const ff = farFeatureById.get(mk.feature) ?? farFeatureById.get(String(mk.id).split("/").pop());
    const dx = mk.at.x - observer.x, dy = mk.at.y - observer.y;
    farSeen.push({
      id: mk.id, kind: "far-feature", far: true,
      bearing: quantizeBearing(bearingDeg(dx, dy), dials.bearing_points),
      band: "on the horizon",
      distM: Math.round(Math.hypot(dx, dy)),
      heightM: ff?.height_m ?? markTop(mk, dials),
      label: ff?.label ?? null, body: mk.body ?? ff?.receipt,
      // a horizon object behind the wall is hidden however tall it stands
      visible: clearHorizon && !(mists && mistsHide(observer, mk.at, mists)),
    });
  }

  // rank by LOD, then COLLAPSE THE TREE AT DISTANCE: beyond a proximity band a
  // household's cluster shows only its most-prominent mark (its home/beacon), the
  // rest folded into a clusteredCount you `investigate` to open. This is the LOD
  // law — top-level marks at distance, descend with proximity or attention.
  const ranked = seen.filter((s) => s.visible).sort((a, b) => b.score - a.score);
  const repByHh = new Map();
  const collapsed = [];
  for (const s of ranked) {
    const far = s.distM > dials.cluster_beyond_m;
    if (far && s.household && !s.signal) {
      const rep = repByHh.get(s.household);
      if (rep) { rep.clusteredCount = (rep.clusteredCount ?? 0) + 1; continue; }
      repByHh.set(s.household, s);
    }
    collapsed.push(s);
  }
  const carried = collapsed.slice(0, budget);
  const tail = collapsed.slice(budget);
  const tailByBearing = {};
  for (const t of tail) tailByBearing[t.bearing] = (tailByBearing[t.bearing] ?? 0) + 1;

  return {
    observer: {
      ...observer, groundElevM: +groundH.toFixed(1), eyeElevM: +self.eyeElev.toFixed(1),
      lightLevel: +self.lightLevel.toFixed(2), inFog: self.inFog, aboveFog: self.aboveFog, inDarkness: self.inDarkness,
    },
    crossing: fog.crossing, fog: { thickness: +fog.thickness.toFixed(2) }, sightReachM: Math.round(Math.min(clearReach, mistReach)),
    ...(mists ? { mists: mistsBlock(mists, mistSelf) } : {}),
    carried, far: farSeen.filter((f) => f.visible),
    aggregate: { hidden_by_budget: tail.length, by_bearing: tailByBearing },
    counts: {
      candidates: seen.length, visible: ranked.length, shown: carried.length, clustered: collapsed.length - carried.length,
      occluded: seen.filter((s) => s.occluded && !s.signal).length,
      // the mist keeps its own count, so a mark is never told as lost to both
      fogHidden: seen.filter((s) => !s.visible && !s.occluded && !s.mistHidden).length,
      ...(mists ? { mistHidden: seen.filter((s) => s.mistHidden).length } : {}),
    },
  };
}

// radialSerialize — group a fieldOfView result into bearing → band → marks, the
// shape a telling reads from. Pure restructure of fieldOfView output.
// the Mists as a reader is told them, at one standpoint: where the wall stands,
// how thick the fringe is here, and the veil on the daylight
export function mistsBlock(m, here) {
  const r = (v) => Math.round(v);
  return {
    crossing: m.crossing,
    in_wall: here.inWall,
    wall_m: r(here.wallM),
    thickness: +here.thickness.toFixed(2),
    density: +m.density.toFixed(2),
    veil: +m.veil.toFixed(2),
    front_m: { n: r(m.front.n), e: r(m.front.e), s: r(m.front.s), w: r(m.front.w) },
  };
}

export function radialSerialize(fov) {
  const byBearing = {};
  for (const m of fov.carried) {
    (byBearing[m.bearing] ??= {});
    (byBearing[m.bearing][m.band] ??= []).push(m);
  }
  for (const f of fov.far) {
    (byBearing[f.bearing] ??= {});
    (byBearing[f.bearing]["on the horizon"] ??= []).push(f);
  }
  return { observer: fov.observer, crossing: fov.crossing, fog: fov.fog, sightReachM: fov.sightReachM, ...(fov.mists ? { mists: fov.mists } : {}), byBearing, aggregate: fov.aggregate, counts: fov.counts };
}

// ───────────────────────── geometry is NOT redefined here ───────────────────
// "You cannot lie with an edge" is enforced upstream by `tools/mark-lint.mjs`,
// which shares ONE `contains` and ONE loader with `tools/marks-fold.mjs` (the
// 07-22 nesting ruling). The engine consumes already-validated, already-folded
// marks — it must never grow a second definition of containment or a second
// mark reader, or the fold's edges and the engine's would be free to drift.
// Callers that need containment import `contains`/`rect` from geometry.mjs.

// ───────────────────────── small pure helpers ──────────────────────────────
function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function markExtent(mk) {
  if (mk.extent?.w || mk.extent?.h) return Math.max(mk.extent.w ?? 1, mk.extent.h ?? 1);
  return DEFAULT_EXTENT[mk.kind] ?? 2;
}
// Vertical prominence: declared, else a modest default for a thing standing on
// the ground.
//
// THE SECOND HALF OF THE PARCEL EXCLUSION (home-images ruling, 2026-08-21).
// This read `mk.kind === "sited"`, and while fieldOfView skipped parcels
// outright that gate cost nothing. It is not free now, and it is not a
// different rule: a target with zero prominence has its sightline aimed at its
// own dirt, so the last sample before it always grazes — `clear` comes out at
// (eyeH / n), which SHRINKS with distance. A flat mark is therefore reported
// occluded by the ground it sits on, and more so the further off it is, which
// is the artifact backwards. Retiring the `continue` alone left 2 of 58 real
// parcels tellable; the rest were "occluded" by nothing.
//
// So a parcel gets the same modest default a house gets. That is not a claim
// that a land-claim is a building — it is the claim that there is something
// standing there to see, which is true by construction: a parcel is seeded
// around a placed home, and the viewer has always drawn its footprint at that
// spot. Terrain still occludes it exactly as it occludes anything else.
function markTop(mk, dials = DIALS) {
  if (mk.top_m != null) return mk.top_m;
  return (mk.kind === "sited" || mk.kind === "parcel") ? dials.default_mark_top_m : 0;
}
// The mark's SILHOUETTE span — its visible width from the observer — when it
// carries a fine shape (a `points:` ring). Projects every ring vertex onto the
// axis perpendicular to the view bearing; the span (max−min) is what the eye
// actually subtends, replacing extent-as-width. Null for a plain rect, so the
// caller keeps analytic max(w,h) — byte-identical for every current record. The
// engine reads only the mark's own points (no geometry import, no disk).
function markSilhouetteSpan(mk, dx, dy) {
  const ring = Array.isArray(mk.points) && mk.points.length >= 3 ? mk.points : null;
  if (!ring) return null;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;                  // unit vector perpendicular to the bearing
  let min = Infinity, max = -Infinity;
  for (const p of ring) {
    const vx = Array.isArray(p) ? p[0] : p.x, vy = Array.isArray(p) ? p[1] : p.y;
    const proj = vx * px + vy * py;
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }
  return max - min;
}
const DEFAULT_EXTENT = { sited: 4, parcel: 25 };
