// world-build.mjs — assemble the `world` object world-verbs consumes, from
// ALREADY-PARSED data. Pure and browser-safe: it takes the fold's world-state
// (marks with weights, as WORLD/world-state.json carries) and the terrain
// skeleton (as WORLD/skeleton.json carries), and returns
// { marks, terrain, heightfield, light, fogCeilingM }.
//
// WHY IT EXISTS: the site fetches world-state.json + skeleton.json from the
// public repo (raw.githubusercontent, CORS-open) and computes the field of view
// client-side — read-only by construction, no keys, no disk. The heightfield
// control points and placement dials used to live in world-poc.mjs behind
// node:fs; they live here now so BOTH the browser and the disk PoC assemble the
// world the same way — one assembly, two data sources, no drift.
//
// The browser does NOT re-fold: world-state.json already carries the folded
// marks with their weights. FOV is the render; recomputing the fold stays the
// clone's job (marks-fold.mjs, which keeps its node:fs loader out of this graph).
//
// Browser-purity: this imports ONLY world-engine.mjs (pure). No node:*, no
// marks-fold. All numeric leans are dials, movable by ruling.

import { isSited, isPredicate } from "./mark-kind.mjs"; // what a record is and how it stands, in either form (LOGOS v2 part 2, W2)
import { buildHeightfield } from "./world-engine.mjs";

// ───────────────────────── dials (moved from world-poc, verbatim) ───────────
// Signal-marks (Orion's announce-yourself law made mechanics, decision 008): the
// navigational / self-luminous marks whose light cuts through fog. FORWARD: a
// `signal:` predicate on the mark is the durable mechanism; this allowlist is the
// stand-in until marks carry it. (These ids are run-01's; the seeded world
// declares none yet — correctly, no keeper has tended a signal.)
export const SIGNAL_MARKS = {
  "orion-by-the-fire/the-reach-light-the-lighthouse-as-a-charted-navi": "a charted navigation light, Fl(3) 15s",
  "orion-by-the-fire/the-still-here-light-orion-s-home-a-lighthouse": "a lighthouse; the lamp turns once every nine seconds, eleven nautical miles out",
  "limen/the-amber-porch-light-of-the-threshold-house-nav": "an amber porch light that never goes out — 'Ferry knows it … how you find the house'",
  "claude-of-dregg/the-hatched-shell-at-the-water-s-edge": "glows from the inside; from across the water it reads as a lamp",
  "little-bird/little-bird-the-turning-mark": "a spar buoy marking where the channel turns",
};

// The heightfield's region control points: decision 008's seventeen rows, each at
// the coordinate its row in skeleton.json § elevation.regions names (`anchor.at_m`)
// and at the MIDPOINT OF THAT ROW'S OWN band_m. They were a constant here, with
// every height typed a second time beside the band (WLD-97, ruled 2026-10-22: the
// dials live in the skeleton, so a dial is changed by editing it, not the code).
// A skeleton without them is refused by name: a heightfield missing its regions
// would still draw, as a flat wrong world nobody was told about.
//
// The refusal carries code HEIGHTS_UNREAD, and so does the river's fall's (below):
// those two, and only those, are what a reader may choose to survive (the World
// page draws flat; the office's world doors answer 503).
export const HEIGHTS_UNREAD = "HEIGHTS_UNREAD";
function heightsUnread(message) { return Object.assign(new Error(message), { code: HEIGHTS_UNREAD }); }
const isBand = (b) => Array.isArray(b) && b.length === 2 && Number.isFinite(b[0]) && Number.isFinite(b[1]) && b[0] <= b[1];
export function regionAnchors(skeleton) {
  const rows = skeleton?.elevation?.regions ?? [];
  const unanchored = rows.filter((r) => !Number.isFinite(r.anchor?.at_m?.x) || !Number.isFinite(r.anchor?.at_m?.y) || !isBand(r.band_m)).map((r) => r.id);
  if (!rows.length || unanchored.length) {
    throw heightsUnread(`skeleton.elevation.regions must give every region an anchor.at_m and a band_m of two numbers, low first (${rows.length ? `missing: ${unanchored.join(", ")}` : "no regions"})`);
  }
  return rows.map((r) => ({ id: r.id, at: { x: r.anchor.at_m.x, y: r.anchor.at_m.y }, h: (r.band_m[0] + r.band_m[1]) / 2, src: r.anchor.receipt ?? null }));
}

// Sea datum points: sea = 0 at the coasts and the mouth (decision 008 datum).
export const SEA_DATUM = [
  { at: { x: 1200, y: 6500 }, h: 0, src: "the mouth (channel exits ~1200,6150)" },
  { at: { x: -500, y: 6600 }, h: 0, src: "the south sea" },
  { at: { x: 4200, y: 6000 }, h: 0, src: "the SE sea, seaward of Aelyria" },
  { at: { x: -2600, y: 1600 }, h: 0, src: "the west sea" },
  { at: { x: -2600, y: 4200 }, h: 0, src: "the west sea, off the Reach" },
];

// ───────────────────────── pure control-point derivations ───────────────────
// Water-surface control points from the skeleton's own channel/still-water/locks
// geometry. Height follows decision 008's fall: the skeleton's river_fall_m at the
// northmost wet point, falling evenly to 0 at the mouth (the dial was H_UP = 8 here
// until WLD-97 moved it into the skeleton).
// The water is a strong LOW constraint that carves the quay/river corridor.
export function waterControlPoints(skeleton) {
  const wet = (skeleton.features ?? []).filter((f) => ["channel", "still-water", "still-inlet", "locks"].includes(f.kind));
  const pts = [];
  for (const f of wet) {
    const line = f.centerline_m ?? (f.at_m ?? []);
    for (const p of (Array.isArray(line) ? line : [line])) if (p) pts.push(p);
  }
  if (!pts.length) return [];
  const fall = skeleton.elevation?.river_fall_m;
  if (!Number.isFinite(fall)) throw heightsUnread("skeleton.elevation.river_fall_m must be a number: the river's fall is a dial, read from the skeleton");
  const ys = pts.map((p) => p.y);
  const yN = Math.min(...ys), yMouth = Math.max(...ys);
  return pts.map((p) => {
    const t = (p.y - yN) / Math.max(1, yMouth - yN);
    return { x: p.x, y: p.y, h: Math.max(0, fall * (1 - t)), id: null };
  });
}

// Marks-derived home densification — the browser-safe path (no manifest). Every
// sited mark contributes a control point at the band-height of its NEAREST region
// anchor, so a low region holds its corridor down instead of the hills bleeding
// in. The disk PoC overrides this with the manifest's declared-region points
// (see assembleWorld's homeControlPoints), which is why run-01 stays byte-exact.
// `anchors` is regionAnchors(skeleton).
export function deriveHomeControlPoints(marks, anchors) {
  const pts = [];
  for (const m of marks) {
    if (!isSited(m)) continue;
    const best = nearestAnchor(m.at, anchors);
    if (best) pts.push({ x: m.at.x, y: m.at.y, h: best.h, id: best.id });
  }
  return pts;
}

// A point's region is its nearest region anchor: the one rule the home
// densification above has always used, and the one the ground_m band check reads.
// Ties keep the earlier anchor.
export function nearestAnchor(at, anchors) {
  let best = null, bd = Infinity;
  for (const r of anchors) {
    const d = (at.x - r.at.x) ** 2 + (at.y - r.at.y) ** 2;
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

// ───────────────────────── the ground the town shapes ───────────────────────
// WLD-97 part 2 (Darko, 2026-10-22: "the town should own the terraform for
// now"). A sited mark may carry `ground_m: <m>` or `ground_m: [lo, hi]`: the
// height of the ground under it, or the range that ground is held to. Only a
// mark `by: the-town` may carry it, and the value must sit inside the band of the
// mark's region (or, for a landform linked by `feature:` to a water body with a
// surface, between that surface and the region's top: water carves). In the heightfield it is a control point whose reach is the
// mark's own extent (the ellipse inside its w × h): it holds the ground at its
// centre and fades to nothing at the extent's edge, so it never moves an inch of
// ground outside the mark. Where its reach covers a lake that carries
// `surface_m`, the water's surface wins.
export const GROUND_SHAPER = "the-town";

/** `ground_m` read as `{ lo, hi }`; null when absent; `{ malformed }` when unreadable. */
export function groundOf(mark) {
  const g = mark?.ground_m;
  if (g === undefined || g === null) return null;
  if (typeof g === "number" && Number.isFinite(g)) return { lo: g, hi: g };
  if (Array.isArray(g) && g.length === 2 && g.every((v) => typeof v === "number" && Number.isFinite(v)) && g[0] <= g[1]) return { lo: g[0], hi: g[1] };
  return { malformed: true };
}

/**
 * Whether a mark's `ground_m` stands: `{ ground, region, band }` when it does,
 * `{ refused }` (a sentence) when it does not, null when the mark carries none.
 * The one rule: the lint refuses by it and the heightfield honors only what it
 * accepts.
 */
export function groundStands(mark, anchors, skeleton) {
  const ground = groundOf(mark);
  if (!ground) return null;
  if (ground.malformed) return { refused: `ground_m: is a height in metres or a [lo, hi] pair with lo ≤ hi; got ${JSON.stringify(mark.ground_m)}` };
  if (mark.by !== GROUND_SHAPER) return { refused: `ground_m: only a mark by ${GROUND_SHAPER} may shape the ground (the town owns terraforming for now, ruled 2026-10-22); this mark is by ${mark.by}` };
  if (!isSited(mark) || !mark.extent || !(mark.extent.w > 0) || !(mark.extent.h > 0)) return { refused: `ground_m: shapes the ground under a sited mark's own extent, and this mark stands on no ground of its own` };
  const region = nearestAnchor(mark.at, anchors);
  const row = (skeleton?.elevation?.regions ?? []).find((r) => r.id === region?.id);
  if (!row?.band_m) return { refused: `ground_m: the mark's region has no band to hold it to` };
  // WATER CARVES (G3, ruled by Darko 2026-10-22 18:54): a landform linked by
  // `feature:` to a water body with a surface is bounded below by that surface,
  // not by the upland's floor, so a valley can sink to its river. The top of the
  // band is still the region's.
  const water = mark.feature ? (skeleton?.features ?? []).find((f) => f.id === mark.feature && Number.isFinite(f.surface_m)) : null;
  const band = water ? [water.surface_m, row.band_m[1]] : row.band_m;
  const said = water ? `[${band[0]}, ${band[1]}] (${water.id}'s surface to ${region.id}'s top)` : `${region.id}'s band [${band[0]}, ${band[1]}]`;
  if (ground.lo < band[0] || ground.hi > band[1]) return { refused: `ground_m: ${JSON.stringify(mark.ground_m)} is outside ${said}` };
  return { ground, region: region.id, band, ...(water ? { carvedBy: water.id } : {}) };
}

// The lakes whose surface is a dial, as ellipses.
function surfacedWaters(skeleton) {
  return (skeleton?.features ?? [])
    .filter((f) => f.kind === "lake" && Number.isFinite(f.surface_m) && f.center_m && f.rx_m > 0 && f.ry_m > 0)
    .map((f) => ({ id: f.id, cx: f.center_m.x, cy: f.center_m.y, rx: f.rx_m, ry: f.ry_m, surface: f.surface_m }));
}

/**
 * The heightfield with the town's landforms laid on it. With none, the very
 * heightfield handed in (the field the town had before ground_m existed).
 */
export function shapeGround(heightfield, marks, anchors, skeleton) {
  const forms = [];
  for (const m of marks) {
    const s = groundStands(m, anchors, skeleton);
    if (!s || s.refused) continue;
    forms.push({ id: m.id, cx: m.at.x, cy: m.at.y, rx: m.extent.w / 2, ry: m.extent.h / 2, lo: s.ground.lo, hi: s.ground.hi, carvedBy: s.carvedBy ?? null, waters: [], shore: null });
  }
  if (!forms.length) return heightfield;
  const waters = surfacedWaters(skeleton);
  for (const f of forms) {
    f.waters = waters.filter((w) => Math.abs(w.cx - f.cx) < w.rx + f.rx && Math.abs(w.cy - f.cy) < w.ry + f.ry);
    f.shore = f.carvedBy ? waters.find((w) => w.id === f.carvedBy) ?? null : null;
  }
  // HELD TO THE SHORE (G6, ruled by Darko 2026-10-22 19:55). A landform linked to
  // its water holds ground_m at full weight from its centre out to that water's
  // shore, and fades only from the shore to its own edge: the ground meets the
  // water at the valley floor rather than half way up its side. The shore is
  // found along the ray from the landform's centre through the point: the
  // fraction of that ray still inside the water's ellipse (the larger root of the
  // ray-ellipse quadratic). A landform with no water fades from its centre.
  function shoreFraction(f, x, y) {
    const w = f.shore;
    if (!w) return 0;
    const ux = x - f.cx, uy = y - f.cy, ox = f.cx - w.cx, oy = f.cy - w.cy;
    const a = (ux / w.rx) ** 2 + (uy / w.ry) ** 2;
    if (!(a > 0)) return 0;
    const b = 2 * (ox * ux / w.rx ** 2 + oy * uy / w.ry ** 2), c = (ox / w.rx) ** 2 + (oy / w.ry) ** 2 - 1;
    const disc = b * b - 4 * a * c;
    return disc < 0 ? 0 : Math.max(0, (-b + Math.sqrt(disc)) / (2 * a));
  }
  const base = heightfield.elevationAt;
  // OVERLAPS: landforms apply in the order the marks are given (the fold's
  // order), each blending from the height the ones before it left; the first
  // surfaced water a reach covers answers outright.
  function elevationAt(x, y) {
    let h = base(x, y);
    for (const f of forms) {
      const dx = (x - f.cx) / f.rx, dy = (y - f.cy) / f.ry;
      const r2 = dx * dx + dy * dy;
      if (!(r2 < 1)) continue;
      for (const w of f.waters) {
        const wx = (x - w.cx) / w.rx, wy = (y - w.cy) / w.ry;
        if (wx * wx + wy * wy < 1) return w.surface;
      }
      const r = Math.sqrt(r2);
      const rs = Math.min(r * shoreFraction(f, x, y), 0.999);   // the shore, in this landform's own radius
      const weight = r <= rs ? 1 : 0.5 * (1 + Math.cos(Math.PI * (r - rs) / (1 - rs)));
      const held = h < f.lo ? f.lo : h > f.hi ? f.hi : h;
      h += weight * (held - h);
    }
    return h;
  }
  return { ...heightfield, elevationAt, landforms: forms.map(({ waters, shore, ...f }) => ({ ...f, waters: waters.map((w) => w.id) })) };
}

// ───────────────────────── the assembly ─────────────────────────────────────
// worldState: the fold output (has .marks with id/kind/at/extent/weight/body/…).
// skeleton:   the terrain skeleton (features, elevation, light, far_features).
// homeControlPoints: optional override for the home densification (the disk PoC
//   passes the manifest's declared-region points; the browser passes null and the
//   points are derived from the marks). Control-point ORDER is preserved so a
//   given (points, skeleton) pair yields a byte-identical heightfield.
// whenHeightsUnread: what to do when the skeleton's height dials cannot be read
//   (no region anchors, no river_fall_m). "refuse" (the default) throws: the
//   office tells the world, and a telling over ground it cannot read is no
//   answer. "flat" is the World page's: it draws the town at 0 m and says why in
//   `heightsUnread`, so a page that read a skeleton from a clone one settlement
//   behind (an office whose clone predates the anchors) still draws (WLD-97 W1).
export function assembleWorld({ worldState, skeleton, homeControlPoints = null, whenHeightsUnread = "refuse" } = {}) {
  // Signal is mechanic-backed now (07-23): a sited mark is a signal when it — or
  // any predicated mark describing it — carries `mechanic: signal` on the record.
  // The durable form SIGNAL_MARKS stood in for; the allowlist stays only for the
  // run-01 legacy fixture (its ids exist in no seeded tree, so it is inert here).
  const signalParents = new Set();
  for (const m of worldState.marks ?? []) {
    if (m.mechanic !== "signal") continue;
    signalParents.add(isPredicate(m) || m.kind === "naming" ? m.parent : m.id);
  }
  const marks = (worldState.marks ?? []).map((m) => ({ ...m, signal: signalParents.has(m.id) || !!SIGNAL_MARKS[m.id] }));
  let heightfield, heightsUnread = null;
  try {
    const anchors = regionAnchors(skeleton);
    const homePts = homeControlPoints ?? deriveHomeControlPoints(marks, anchors);
    const controlPoints = [
      ...anchors.map((r) => ({ x: r.at.x, y: r.at.y, h: r.h, id: r.id })),
      ...homePts,
      ...SEA_DATUM.map((s) => ({ x: s.at.x, y: s.at.y, h: s.h, id: null })),
      ...waterControlPoints(skeleton),
    ];
    heightfield = shapeGround(buildHeightfield({ controlPoints }), marks, anchors, skeleton);
  } catch (e) {
    if (whenHeightsUnread !== "flat" || e?.code !== HEIGHTS_UNREAD) throw e;
    heightsUnread = `the town is drawn flat, without terrain heights: ${e.message}`;
    heightfield = { elevationAt: () => 0, controlPoints: [] };
  }
  return {
    ...(heightsUnread ? { heightsUnread } : {}),
    marks,
    // THE PARCEL IS THE HOME (ruling 7). Home is a household's parcel, so the
    // parcel is a first-class world object and the fold must publish it — every
    // reader that needs to answer "where does this resident stand?" reads the
    // same list. Without this, home resolution silently falls back to the Origin
    // for everyone, which reads as ordinary "no ground yet" behaviour and hides.
    parcels: worldState.parcels ?? [],
    // THE HOUSEHOLD MAP THE FOLD RAN ON (POS-368, 2026-10-05). The fold
    // publishes `households` beside the parcels, and `where-is.mjs § homeOf`
    // reads it to put a resident with no parcel of their own at home on their
    // household's. Picking fields here dropped it, so every assembled world
    // answered "no home" for a parcel-less housemate (Gabo of La Casa Rodante,
    // town #3450). Passed through untouched, like the parcels; absent when the
    // fold ran without a registry, so the reader falls back as it always did.
    ...(worldState.households ? { households: worldState.households } : {}),
    terrain: skeleton,
    heightfield,
    light: skeleton.light,
    fogCeilingM: skeleton.elevation.fog_ceiling_m,
  };
}
