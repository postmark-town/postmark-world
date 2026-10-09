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

// The heightfield's region control points — decision 008's seventeen rows at a
// representative grid coordinate carrying its band-midpoint height. Coordinate is
// EXTRACTED where possible (a placed home / a terrain feature), DERIVED only where
// no home or feature names the spot. Height is the band midpoint — never a pixel.
export const REGION_ANCHORS = [
  { id: "the-town-centre",                  at: { x: 0, y: 0 },      h: 5,    src: "terrain: origin, the Origin {0,0} (+5, ruled)" },
  { id: "the-lanternseed-gardens",          at: { x: 1075, y: -800 }, h: 15,  src: "home: rei" },
  { id: "the-trueing-terrace",              at: { x: 888, y: -2320 }, h: 37,  src: "home: wright, ethan-thorne (centroid)" },
  { id: "north-rim",                        at: { x: 700, y: -3600 }, h: 60,  src: "derived: N of the trueing terrace toward the map's north edge" },
  { id: "the-high-ground",                  at: { x: 2544, y: 175 },  h: 35,  src: "home: the reeves household (centroid)" },
  { id: "the-threshold-district",           at: { x: 1358, y: 1821 }, h: 2.5, src: "home: limen, hal, liv, noe (centroid)" },
  { id: "the-still-reach-and-blackwater",   at: { x: 1900, y: 3900 }, h: 3,   src: "terrain: the-still-reach centreline" },
  { id: "the-long-run",                     at: { x: 1513, y: 4888 }, h: 2.5, src: "home: carta, jetto-of-starforge (centroid); the locks" },
  { id: "the-east-low-hills",               at: { x: 2800, y: 900 },  h: 20,  src: "derived: the East Window District's western wall" },
  { id: "the-east-window-district",         at: { x: 3125, y: 1675 }, h: 8,   src: "home: east-facing-window" },
  { id: "evermoon",                         at: { x: -1900, y: 2150 }, h: 17, src: "home: caelum (== the dark pole; Evermoon moved WEST 07-22)" },
  { id: "the-protected-grove",              at: { x: -1375, y: -2550 }, h: 40, src: "home: sol-of-garrison; the garrison lake" },
  { id: "the-lochan",                       at: { x: 2575, y: -1160 }, h: 25, src: "terrain: the-lochan closed basin" },
  { id: "the-reach",                        at: { x: -1725, y: 4840 }, h: 15, src: "home: orion-by-the-fire" },
  { id: "the-headland",                     at: { x: -2300, y: 4200 }, h: 15, src: "derived: raised promontory seaward of the Reach" },
  { id: "the-doubled-coast",                at: { x: -258, y: 5033 }, h: 4,   src: "home: claude-of-dregg, gael-renton, spar (centroid)" },
  { id: "aelyria",                          at: { x: 4075, y: 5050 }, h: 7.5, src: "home: aion-solare; the aelyria cliffs" },
];

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
// geometry. Height follows decision 008's fall (~+8 m upstream → 0 at the mouth).
// The water is a strong LOW constraint that carves the quay/river corridor.
export function waterControlPoints(skeleton) {
  const wet = (skeleton.features ?? []).filter((f) => ["channel", "still-water", "still-inlet", "locks"].includes(f.kind));
  const pts = [];
  for (const f of wet) {
    const line = f.centerline_m ?? (f.at_m ?? []);
    for (const p of (Array.isArray(line) ? line : [line])) if (p) pts.push(p);
  }
  if (!pts.length) return [];
  const ys = pts.map((p) => p.y);
  const yN = Math.min(...ys), yMouth = Math.max(...ys);
  const H_UP = 8; // dial: upstream water surface
  return pts.map((p) => {
    const t = (p.y - yN) / Math.max(1, yMouth - yN);
    return { x: p.x, y: p.y, h: Math.max(0, H_UP * (1 - t)), id: null };
  });
}

// Marks-derived home densification — the browser-safe path (no manifest). Every
// sited mark contributes a control point at the band-height of its NEAREST region
// anchor, so a low region holds its corridor down instead of the hills bleeding
// in. The disk PoC overrides this with the manifest's declared-region points
// (see assembleWorld's homeControlPoints), which is why run-01 stays byte-exact.
//
// A mark standing on GROUND BEYOND THE BORDER is not a control point (below):
// the ground declares the height there, and a mark out there homed at its
// nearest anchor would drag the atlas's own ground toward that anchor's band.
export function deriveHomeControlPoints(marks, { grounds = [] } = {}) {
  const pts = [];
  for (const m of marks) {
    if (m.kind !== "sited" || !m.at) continue;
    if (grounds.some((g) => onGround(m.at, g))) continue;
    let best = null, bd = Infinity;
    for (const r of REGION_ANCHORS) {
      const d = (m.at.x - r.at.x) ** 2 + (m.at.y - r.at.y) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    if (best) pts.push({ x: m.at.x, y: m.at.y, h: best.h, id: best.id });
  }
  return pts;
}

// ───────────────────────── GROUND BEYOND THE BORDER ─────────────────────────
//
// The atlas is the town's drawn ground, and its height is decision 008's: the
// residents' words and the survey's bands, interpolated, never drawn. Past the
// atlas's edge the heightfield has always answered too (it extrapolates the
// nearest anchors, with no edge), but nothing could GIVE that land a shape:
// a crag, a basin, the ground the biomes will stand on, or anything the Mists
// will one day pull back from. A ground is that shape, declared in the skeleton:
//
//   features[]: { id, kind: "ground", ring_m: [{x,y}…], top_m, foot_gap_m?, receipt }
//
// THE ONE PROMISE: ground beyond the border never moves the atlas. So it is not
// mixed into the one field (measured 2026-10-09: added as ordinary control
// points, a ground 140 m past the north edge moved atlas ground 275 m inside
// it by 58.9 m, because the north is sparse and its points crept into the k
// nearest). It is an OFFSET, added only outside the atlas box:
//
//   elevationAt(x, y) = base(x, y)                   inside the atlas box (today's field)
//                     = base(x, y) + offset(x, y)    beyond the border
//
// where `offset` is the same IDW over each ground's top lattice at
// (top_m − base) and two rings at 0 around its foot (foot_gap_m and
// foot_gap_m + GROUND_SKIRT_M out from its box). So the top stands at top_m,
// and past the outer ring every point's nearest offset points are zeros: the
// foot meets the ground that was already there, open country is untouched, and
// the border meets the atlas with no seam (measured; a seam of zero points along
// the border was tried and changed nothing, so it is not here). The atlas box’s
// own branch makes the promise true by construction rather than by geometry. A ground must lie wholly
// beyond the border, foot rings included; one that reaches the atlas is a
// defect and is refused here, as it is in world-terrain-gen.mjs.
export const GROUND_LATTICE_M = 20;     // the top's sampling step
export const GROUND_FOOT_DEG = 3;       // the foot rings' angular step
export const GROUND_SKIRT_M = 60;       // the second foot ring, this far past the first
export const GROUND_FOOT_GAP_M = 40;    // default foot gap: the cliff's steepness dial

/** The atlas box the skeleton declares (`_grid.atlas_box_m`), or null. */
export function atlasBoxOf(skeleton) {
  const b = skeleton?._grid?.atlas_box_m;
  return b && [b.x0, b.x1, b.y0, b.y1].every(Number.isFinite) ? b : null;
}
const inBox = (p, b) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
const boxOfRing = (ring) => ({
  x0: Math.min(...ring.map((p) => p.x)), x1: Math.max(...ring.map((p) => p.x)),
  y0: Math.min(...ring.map((p) => p.y)), y1: Math.max(...ring.map((p) => p.y)),
});

/** Is the point on this ground (inside its ring, or on its edge)? */
export function onGround(p, ground) {
  const ring = ground.ring_m;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (((a.y > p.y) !== (b.y > p.y)) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  if (inside) return true;
  // its own edge counts as on it (the even-odd test is undecided there)
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    if (Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) <= 1e-6) return true;
  }
  return false;
}

/** The outermost box a ground's foot reaches (its ring's box, grown by both foot rings). */
export function groundReach(ground) {
  const b = boxOfRing(ground.ring_m), r = (ground.foot_gap_m ?? GROUND_FOOT_GAP_M) + GROUND_SKIRT_M;
  return { x0: b.x0 - r, x1: b.x1 + r, y0: b.y0 - r, y1: b.y1 + r };
}

/** The skeleton's grounds, each checked to lie wholly beyond the border. Throws on a defect. */
export function groundsBeyondTheBorder(skeleton) {
  const grounds = (skeleton?.features ?? []).filter((f) => f.kind === "ground");
  if (!grounds.length) return [];
  const atlas = atlasBoxOf(skeleton);
  if (!atlas) throw new Error("a ground beyond the border needs the border: the skeleton declares no _grid.atlas_box_m");
  for (const g of grounds) {
    if (!Array.isArray(g.ring_m) || g.ring_m.length < 3 || !Number.isFinite(g.top_m))
      throw new Error(`ground ${g.id}: needs ring_m (3+ points) and top_m`);
    const r = groundReach(g);
    const apart = r.x1 < atlas.x0 || r.x0 > atlas.x1 || r.y1 < atlas.y0 || r.y0 > atlas.y1;
    if (!apart) throw new Error(`ground ${g.id} reaches the atlas (its foot spans x ${r.x0}..${r.x1}, y ${r.y0}..${r.y1}); ground beyond the border must lie wholly beyond it`);
  }
  return grounds;
}

/** The offset field's points: each ground's top lattice and its two foot rings at 0. */
export function groundOffsetPoints(grounds, baseAt) {
  const pts = [];
  for (const g of grounds) {
    const b = boxOfRing(g.ring_m);
    for (let x = b.x0; x <= b.x1 + 1e-9; x += GROUND_LATTICE_M)
      for (let y = b.y0; y <= b.y1 + 1e-9; y += GROUND_LATTICE_M)
        if (onGround({ x, y }, g)) pts.push({ x, y, h: g.top_m - baseAt(x, y) });
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const gap = g.foot_gap_m ?? GROUND_FOOT_GAP_M;
    for (const out of [gap, gap + GROUND_SKIRT_M]) {
      const hw = (b.x1 - b.x0) / 2 + out, hh = (b.y1 - b.y0) / 2 + out;
      for (let a = 0; a < 360; a += GROUND_FOOT_DEG) {
        const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
        const k = 1 / Math.max(Math.abs(c) / hw, Math.abs(s) / hh);
        pts.push({ x: cx + k * c, y: cy + k * s, h: 0 });
      }
    }
  }
  return pts;
}

/** Today's heightfield inside the atlas; today's plus the grounds' offset beyond it. */
export function withGroundBeyondTheBorder(base, grounds, atlas) {
  const offset = buildHeightfield({ controlPoints: groundOffsetPoints(grounds, base.elevationAt) });
  return {
    // controlPoints stay the base's: the region ids world-verbs reads are the atlas's own
    controlPoints: base.controlPoints,
    grounds: grounds.map((g) => g.id),
    elevationAt(x, y) {
      const h = base.elevationAt(x, y);
      return inBox({ x, y }, atlas) ? h : h + offset.elevationAt(x, y);
    },
  };
}

// ───────────────────────── the assembly ─────────────────────────────────────
// worldState: the fold output (has .marks with id/kind/at/extent/weight/body/…).
// skeleton:   the terrain skeleton (features, elevation, light, far_features).
// homeControlPoints: optional override for the home densification (the disk PoC
//   passes the manifest's declared-region points; the browser passes null and the
//   points are derived from the marks). Control-point ORDER is preserved so a
//   given (points, skeleton) pair yields a byte-identical heightfield.
export function assembleWorld({ worldState, skeleton, homeControlPoints = null } = {}) {
  // Signal is mechanic-backed now (07-23): a sited mark is a signal when it — or
  // any predicated mark describing it — carries `mechanic: signal` on the record.
  // The durable form SIGNAL_MARKS stood in for; the allowlist stays only for the
  // run-01 legacy fixture (its ids exist in no seeded tree, so it is inert here).
  const signalParents = new Set();
  for (const m of worldState.marks ?? []) {
    if (m.mechanic !== "signal") continue;
    signalParents.add(m.kind === "predicated" || m.kind === "naming" ? m.parent : m.id);
  }
  const marks = (worldState.marks ?? []).map((m) => ({ ...m, signal: signalParents.has(m.id) || !!SIGNAL_MARKS[m.id] }));
  const grounds = groundsBeyondTheBorder(skeleton);
  const homePts = homeControlPoints ?? deriveHomeControlPoints(marks, { grounds });
  const controlPoints = [
    ...REGION_ANCHORS.map((r) => ({ x: r.at.x, y: r.at.y, h: r.h, id: r.id })),
    ...homePts,
    ...SEA_DATUM.map((s) => ({ x: s.at.x, y: s.at.y, h: s.h, id: null })),
    ...waterControlPoints(skeleton),
  ];
  const base = buildHeightfield({ controlPoints });
  // With no ground beyond the border this IS today's heightfield, the same object.
  const heightfield = grounds.length ? withGroundBeyondTheBorder(base, grounds, atlasBoxOf(skeleton)) : base;
  return {
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
