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
    let best = null, bd = Infinity;
    for (const r of anchors) {
      const d = (m.at.x - r.at.x) ** 2 + (m.at.y - r.at.y) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    if (best) pts.push({ x: m.at.x, y: m.at.y, h: best.h, id: best.id });
  }
  return pts;
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
    heightfield = buildHeightfield({ controlPoints });
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
