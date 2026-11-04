// portals.mjs — portals and the `dungeon` class: the one home of their geometry.
//
// Ruled by Darko with Wright, 2026-10-13 (WLD-5, the doors sitting, concluded
// 20:03 EDT), and built on the entry law that already existed:
//
//   A PORTAL is a mark whose entry law carries `into` (a mark, or a list to pick
//   from) and optionally `lands_at` (enter-exit.mjs § entryLawOf). Entering it
//   enters `into`, and you stand at `lands_at`. A two-way passage is two portals
//   pointing at each other, each with its own word.
//
//   A DUNGEON is a sited-mark class. Its rules reach every mark it geometrically
//   contains, as a parcel's sovereignty does; the children are not marked
//   themselves. Inside one, `exit` is not offered: you leave through a portal
//   whose `into` is outside, and such a portal can never be opposed. From
//   outside, a resident who has not ENTERED it (the enter ledger, never where he
//   stands) reads it as the dungeon mark alone. Inside, he reads the room he
//   entered and what it holds, not its neighbours.
//
// The verbs (world-verbs.mjs) and the gate (mark-lint.mjs) both read this file,
// so what a portal does and what the lint holds it to are one definition. Pure:
// no fs, no engine import, browser-safe like geometry.mjs.

import { isSited, instanceClassOf, heldBy } from "./mark-kind.mjs"; // what a record is and how it stands, in either form (LOGOS v2 part 2, W2)
import { marksContain, overlapArea, pointInPolygon, pointInRect, polygonBBox, polygonOf, rect, rectCorners } from "./geometry.mjs";
import { entryLawOf, REQUIRES_AT_SETTLEMENT, requiresHoldersIn } from "./enter-exit.mjs";
import { nameInSentence } from "./mark-name.mjs";

export const DUNGEON_CLASS = "dungeon";
/** How far a `lands_at` anchor may stand from its `into` shape before the lint refuses it. */
export const LANDING_REACH_M = 5;

/** The ONE point-in-mark test: a `points:` ring wins over the at/extent box. */
export function pointInMark(pos, mark) {
  const ring = polygonOf(mark);
  return ring
    ? pointInPolygon(Number(pos?.x), Number(pos?.y), ring)
    : pointInRect(Number(pos?.x), Number(pos?.y), rect(mark));
}

/** A dungeon is an INSTANCE: a sited mark with an extent carrying the class.
 *  The class's own declaration (kind: class) is never a dungeon. */
export const isDungeon = (m) =>
  instanceClassOf(m) === DUNGEON_CLASS && isSited(m) && !!m.extent;

const area = (m) => (m?.extent?.w ?? 0) * (m?.extent?.h ?? 0);

/** Whether `m` stands inside `outer`, by geometry: a mark with an extent by the
 *  world's own containment (marksContain), a point mark by its anchor. */
export function markInside(outer, m) {
  if (!outer?.at || !outer.extent || !m?.at || m === outer || m.id === outer.id) return false;
  // THE BOX FIRST (review-233, the office holds constant load): a mark whose box
  // does not meet the outer's box has no point inside it, so it is refused before
  // marksContain rasterizes it. Exact, not a heuristic: entering the 15 × 13 km
  // Pando Plains asked the raster of every mark in town.
  if (!boxesMeet(boxOf(outer), boxOf(m))) return false;
  return m.extent ? marksContain(outer, m) : pointInMark(m.at, outer);
}

/** A mark's own box: its ring's, when it carries one, else its at/extent rect. */
const boxOf = (m) => {
  const ring = polygonOf(m);
  if (ring) { const b = polygonBBox(ring); return { x0: b.minx, x1: b.maxx, y0: b.miny, y1: b.maxy }; }
  const r = rect(m);
  return { x0: r.x - r.w / 2, x1: r.x + r.w / 2, y0: r.y - r.h / 2, y1: r.y + r.h / 2 };
};
const boxesMeet = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

/** The room a mark stands in: the smallest sited mark with an extent, larger
 *  than it, whose shape holds its anchor. Measured at the anchor on purpose — a
 *  portal set in a wall straddles it, and still belongs to the room its anchor is in. */
export function containerOf(m, marks) {
  if (!m?.at) return null;
  let best = null;
  for (const c of marks) {
    if (c === m || c.id === m.id || !isSited(c) || !c.extent) continue;
    if (m.extent && !(area(c) > area(m))) continue;
    if (!pointInMark(m.at, c)) continue;
    if (!best || area(c) < area(best)) best = c;
  }
  return best;
}

/** WHETHER A ROOM HOLDS A MARK, the one test for "what this room has in it"
 *  (review-233): wholly inside it, or anchored in it as its container, the way
 *  containerOf finds a mark's room. So a door set IN the room's wall (straddling
 *  it, the Chapel front-door shape) is the room's, and a door anchored exactly on a
 *  wall two rooms share is the one room's that portalsIn lists it under. The room
 *  itself, and any mark that contains it, never are. Read by hiddenFrom (what a
 *  dungeon hides) and world-verbs § sightFrameOf (what sight may tell). */
export function roomHolds(room, mk, marks) {
  if (!room?.at || !room.extent || !mk || mk.id === room.id) return false;
  if (insideKept(room, mk)) return true;
  // the anchor branch: a door set in the wall. Only a mark whose anchor stands in the
  // room and which is not wholly inside it gets here, so this is a handful per room
  if (!mk.at || !boxesMeet(boxOf(room), boxOf(mk)) || !pointInMark(mk.at, room) || (mk.extent && marksContain(mk, room))) return false;
  return containerOf(mk, marks)?.id === room.id;
}

// ── A CREATURE'S RING STOPS AT ITS ROOM'S WALLS (WLD-25, 2026-10-21) ───────────
//
// A ring has no line of sight (WLD-56), so without this a creature in one room of
// a dungeon would hear and answer acts in the room next door. Indoors, a ring is
// the creature's ring_m AND the room it stands in; outdoors (the Mists' fringe)
// there is no room and the ring is the plain circle it always was. The office's
// ring (who a creature hears, and where an action "from the ring" may be taken)
// and the page's drawn ring both read these two, so they cannot differ.

/** The room a creature at `point` hears inside, or null outdoors: the smallest
 *  sited mark with an extent whose shape holds the point, when a dungeon governs
 *  it (or it is one). A thing or a door is never a room: a creature on a table or
 *  in a doorway hears the room around it. */
export function ringRoomOf(point, marks) {
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
  let best = null;
  for (const c of marks ?? []) {
    if (!isSited(c) || !c.extent || c.entry || instanceClassOf(c) === "thing") continue;
    if (best && !(area(c) < area(best))) continue;
    if (pointInMark(point, c)) best = c;
  }
  return best && dungeonsOf(best, marks).length ? best : null;
}

/** The outline a ring stops at, as [{x, y}] in metres: the room's ring when it
 *  carries one, else its at/extent box. Null for no room. */
export function ringRoomOutline(room) {
  if (!room?.at) return null;
  return polygonOf(room) ?? rectCorners(rect(room));
}

/** Whether `point` is inside a creature's ring: within `ringM` of `centre`, and
 *  inside `room` when it stands in one (ringRoomOf). */
export function inCreatureRing(point, centre, ringM, room = null) {
  const dx = Number(point?.x) - Number(centre?.x), dy = Number(point?.y) - Number(centre?.y);
  if (!(Math.hypot(dx, dy) <= Number(ringM))) return false;
  return room ? pointInMark(point, room) : true;
}

// MARKINSIDE, KEPT PER (room, mark) OBJECT (review-233): the answer is a fact about
// those two marks alone, and the office's reads hand the eyes a FRESH marks list each
// time (scopeWorld filters the fold) built of the SAME mark objects, so a cache keyed
// on the objects, not the list, is paid once per fold: a giant ring's raster with it.
const INSIDE = new WeakMap();
function insideKept(room, mk) {
  let byMark = INSIDE.get(room);
  if (!byMark) INSIDE.set(room, (byMark = new WeakMap()));
  let v = byMark.get(mk);
  if (v === undefined) { v = markInside(room, mk); byMark.set(mk, v); }
  return v;
}

// ── the dungeon index ────────────────────────────────────────────────────────
//
// Which dungeons each mark stands inside, outermost first. Built once per marks
// array (a world is read many times between folds); a world with no dungeon
// pays one filter and nothing else.
const INDEX = new WeakMap();
export function dungeonIndex(marks) {
  const list = Array.isArray(marks) ? marks : [];
  const hit = INDEX.get(list);
  if (hit) return hit;
  const dungeons = list.filter(isDungeon).sort((a, b) => area(b) - area(a)); // outermost first
  const of = new Map();
  if (dungeons.length) {
    for (const m of list) {
      if (!m.at) continue;
      const ds = dungeons.filter((d) => markInside(d, m)).map((d) => d.id);
      if (ds.length) of.set(m.id, ds);
    }
    // a predicate or a naming rides its parent's mark: hidden with it, inside with it
    for (const m of list) {
      if (m.at || !m.parent || of.has(m.id)) continue;
      const ds = of.get(m.parent);
      if (ds) of.set(m.id, ds);
    }
  }
  const idx = { dungeons: dungeons.map((d) => d.id), of };
  INDEX.set(list, idx);
  return idx;
}

/** The dungeons a mark is governed by, outermost first: those containing it,
 *  then itself when it is one. */
export function dungeonsOf(m, marks) {
  const idx = dungeonIndex(marks);
  const ds = [...(idx.of.get(m?.id) ?? [])];
  if (isDungeon(m)) ds.push(m.id);
  return ds;
}

/** Whether the walker holding this occupancy stack stands inside a dungeon. */
export function heldDungeon(held, marks) {
  const idx = dungeonIndex(marks);
  if (!idx.dungeons.length) return null;
  for (const id of held ?? []) {
    if (idx.dungeons.includes(id)) return id;
    const ds = idx.of.get(id);
    if (ds?.length) return ds[0];
  }
  return null;
}

/** THE WALK INSIDE A DUNGEON IS FENCED TO THE ROOM YOU ENTERED (Darko, 2026-10-13
 *  20:31, G4). The fence: the innermost mark you hold that the dungeon governs,
 *  or null when you are inside no dungeon. A step whose destination leaves it is
 *  refused by the office's walk verb; the way to another room is a portal. */
export function walkFence(held, marks) {
  const d = heldDungeon(held, marks);
  if (!d) return null;
  const byId = new Map(marks.map((m) => [m.id, m]));
  for (let i = (held ?? []).length - 1; i >= 0; i--) {
    const m = byId.get(held[i]);
    if (m && dungeonsOf(m, marks).includes(d)) return m;
  }
  return byId.get(d) ?? null;
}

// ── opacity: what a walker cannot see ────────────────────────────────────────
//
// From outside, a dungeon is its own mark and nothing it contains, at any depth.
// Inside (the dungeon is in his stack), he sees the marks he holds and whatever
// the innermost of them inside that dungeon contains — the room, not its
// neighbours. Keyed off the stack alone: standing on a room's coordinates from
// outside reveals nothing, and so walking needs no rule of its own here.
export function hiddenFrom(marks, held = []) {
  const idx = dungeonIndex(marks);
  const hidden = new Set();
  if (!idx.dungeons.length) return hidden;
  const heldSet = new Set(held);
  const byId = new Map(marks.map((m) => [m.id, m]));
  const innerOf = new Map(); // dungeon id → the innermost held mark governed by it
  for (const id of held) {
    for (const d of dungeonsOf(byId.get(id) ?? { id }, marks)) innerOf.set(d, id);
  }
  for (const [id, ds] of idx.of) {
    const m = byId.get(id);
    if (!m?.at || heldSet.has(id)) continue;
    if (ds.some((d) => !heldSet.has(d))) { hidden.add(id); continue; }
    const inner = byId.get(innerOf.get(ds[ds.length - 1]));
    if (!inner || !roomHolds(inner, m, marks)) hidden.add(id);
  }
  // a predicate or a naming has no place of its own: it is hidden exactly when
  // the mark it describes is (chains of them included)
  for (let grew = true; grew;) {
    grew = false;
    for (const m of marks) {
      if (m.at || !m.parent || hidden.has(m.id) || !hidden.has(m.parent)) continue;
      hidden.add(m.id); grew = true;
    }
  }
  return hidden;
}

/** The world as this walker may read it. The same object back when nothing is
 *  hidden, so every world without a dungeon is read exactly as before. `keep`
 *  (optional) spares marks a caller must always show — a household's own. */
export function scopeWorld(world, { held = [], keep = null } = {}) {
  const marks = world?.marks ?? [];
  const hidden = hiddenFrom(marks, held);
  if (keep) for (const m of marks) if (hidden.has(m.id) && keep(m)) hidden.delete(m.id);
  if (!hidden.size) return world;
  return { ...world, marks: marks.filter((m) => !hidden.has(m.id)) };
}

/**
 * WHAT THIS STANDPOINT SEES INSIDE A DUNGEON, BY THE ENTER LEDGER.
 *
 * The ONE implementation (Darko, 2026-10-13 20:31, on WLD-5): the office's
 * reads and the spectator viewer's World page both call this, and neither keeps
 * a second copy. `occupancy` is the enter ledger folded at the clock
 * (enter-exit.mjs § occupancyAt); `handle` is whose standpoint it is, and no
 * handle (the spectator, a keyless read) has entered nothing, so every dungeon
 * reads as its own mark alone.
 */
export function standpointSight(world, { occupancy = null, handle = null, keep = null } = {}) {
  const held = handle && occupancy ? [...(occupancy.get(handle) ?? [])] : [];
  return scopeWorld(world, { held, keep });
}

// ── the landing ──────────────────────────────────────────────────────────────

/** The distance from a point to a mark's shape; 0 inside it. */
export function distanceToMark(pt, mark) {
  if (pointInMark(pt, mark)) return 0;
  const ring = polygonOf(mark);
  if (ring) {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const q = nearestOnSegment(pt, ring[i], ring[(i + 1) % ring.length]);
      best = Math.min(best, Math.hypot(q.x - pt.x, q.y - pt.y));
    }
    return best;
  }
  const r = rect(mark);
  const dx = Math.max(Math.abs(pt.x - r.x) - r.w / 2, 0), dy = Math.max(Math.abs(pt.y - r.y) - r.h / 2, 0);
  return Math.hypot(dx, dy);
}

const vx = (p) => Number(Array.isArray(p) ? p[0] : p?.x);
const vy = (p) => Number(Array.isArray(p) ? p[1] : p?.y);
function nearestOnSegment(p, a, b) {
  const ax = vx(a), ay = vy(a), bx = vx(b), by = vy(b);
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2)) : 0;
  return { x: ax + t * dx, y: ay + t * dy };
}
const round2 = (n) => Math.round(n * 100) / 100;

/** How far past a door's own edge a landing stands, into the room: 1.5 m (row 68 (a), Darko 2026-10-16 19:15). */
export const LANDING_STEP_M = 1.5;
/** And how near a wall a landing may ever stand. */
export const LANDING_INSET_M = 1;

/** The nearest point of a mark's boundary to `pt`, the unit normal pointing
 *  INTO the mark there, the distance, and whether `pt` is inside. */
export function boundaryNearest(pt, mark) {
  const p = { x: Number(pt.x), y: Number(pt.y) };
  const inside = pointInMark(p, mark);
  const ring = polygonOf(mark);
  if (ring) {
    let best = null;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const q = nearestOnSegment(p, a, b);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (!best || d < best.d) best = { q, d, a, b };
    }
    const dx = vx(best.b) - vx(best.a), dy = vy(best.b) - vy(best.a), l = Math.hypot(dx, dy) || 1;
    let n = { x: -dy / l, y: dx / l };
    // which way is in is asked at the stretch's MIDDLE, never at a corner, where
    // the nudge can fall on the neighbouring wall
    const mid = { x: (vx(best.a) + vx(best.b)) / 2, y: (vy(best.a) + vy(best.b)) / 2 };
    if (!pointInMark({ x: mid.x + n.x * 0.01, y: mid.y + n.y * 0.01 }, mark)) n = { x: -n.x, y: -n.y };
    return { q: best.q, n: { x: n.x + 0, y: n.y + 0 }, d: best.d, inside }; // + 0: never a -0 normal
  }
  const r = rect(mark), x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, y0 = r.y - r.h / 2, y1 = r.y + r.h / 2;
  const cx = Math.max(x0, Math.min(x1, p.x)), cy = Math.max(y0, Math.min(y1, p.y));
  const edges = [
    { q: { x: x0, y: cy }, n: { x: 1, y: 0 }, e: inside ? p.x - x0 : x0 - p.x },
    { q: { x: x1, y: cy }, n: { x: -1, y: 0 }, e: inside ? x1 - p.x : p.x - x1 },
    { q: { x: cx, y: y0 }, n: { x: 0, y: 1 }, e: inside ? p.y - y0 : y0 - p.y },
    { q: { x: cx, y: y1 }, n: { x: 0, y: -1 }, e: inside ? y1 - p.y : p.y - y1 },
  ];
  // inside: the nearest wall; outside: the wall the point stands furthest beyond
  const pick = inside ? edges.reduce((a, b) => (b.e < a.e ? b : a)) : edges.reduce((a, b) => (b.e > a.e ? b : a));
  return { q: pick.q, n: pick.n, d: Math.hypot(pick.q.x - p.x, pick.q.y - p.y), inside };
}

/** A point held at least `inset` metres inside a mark: a point already that far
 *  in stays exactly where it is; otherwise it moves in off the nearest wall. A
 *  point mark has one place to stand. */
export function insetInto(pt, mark, inset = LANDING_INSET_M) {
  const p = { x: Number(pt.x), y: Number(pt.y) };
  if (!mark?.extent) return { x: mark.at.x, y: mark.at.y, moved: p.x !== mark.at.x || p.y !== mark.at.y };
  if (!polygonOf(mark)) {
    const r = rect(mark), ix = Math.min(inset, r.w / 2), iy = Math.min(inset, r.h / 2);
    const x = Math.max(r.x - r.w / 2 + ix, Math.min(r.x + r.w / 2 - ix, p.x));
    const y = Math.max(r.y - r.h / 2 + iy, Math.min(r.y + r.h / 2 - iy, p.y));
    return { x: round2(x), y: round2(y), moved: round2(x) !== round2(p.x) || round2(y) !== round2(p.y) };
  }
  const b = boundaryNearest(p, mark);
  if (b.inside && b.d >= inset) return { x: round2(p.x), y: round2(p.y), moved: false };
  // off the nearest wall by the inset, then by half of it (a narrow neck), then
  // the ring's centroid, then a point nudged in off the nearest stretches of wall
  // (interiorNear): always a point STRICTLY inside, never one on the wall, which
  // pointInMark counts as inside (review-231: a corner, an L-shaped room)
  const tries = [
    { x: b.q.x + b.n.x * inset, y: b.q.y + b.n.y * inset },
    { x: b.q.x + b.n.x * inset / 2, y: b.q.y + b.n.y * inset / 2 },
    ringCentroid(polygonOf(mark)),
  ];
  for (const t of tries) if (t && strictlyInside(t, mark)) return { x: round2(t.x), y: round2(t.y), moved: true };
  const deep = interiorNear(mark, b.q, inset);
  return deep ? { x: round2(deep.x), y: round2(deep.y), moved: true } : { x: round2(b.q.x), y: round2(b.q.y), moved: true };
}

/** Inside a mark and off its wall: pointInMark counts the boundary as inside, and a
 *  landing must never stand on it. */
export const strictlyInside = (t, mark) => pointInMark(t, mark) && boundaryNearest(t, mark).d > 0.01;

/** The area centroid of a ring (null for a degenerate one). */
function ringCentroid(ring) {
  if (!ring) return null;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length], k = p.x * q.y - q.x * p.y;
    a += k; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k;
  }
  return Math.abs(a) < 1e-9 ? null : { x: cx / (3 * a), y: cy / (3 * a) };
}

/** A point just inside a ring, found off the stretches of wall nearest `near`:
 *  each stretch's middle, nudged inward by shrinking steps. Any ring with an
 *  inside has such a point; a degenerate ring (no area) answers null. */
function interiorNear(mark, near, inset) {
  const ring = polygonOf(mark);
  if (!ring) return null;
  const stretches = ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length] }))
    .map((st) => ({ ...st, d: Math.hypot(nearestOnSegment(near, st.a, st.b).x - near.x, nearestOnSegment(near, st.a, st.b).y - near.y) }))
    .sort((p, q) => p.d - q.d);
  for (const { a, b } of stretches) {
    const dx = vx(b) - vx(a), dy = vy(b) - vy(a), l = Math.hypot(dx, dy);
    if (!l) continue;
    const mid = { x: (vx(a) + vx(b)) / 2, y: (vy(a) + vy(b)) / 2 }, n = { x: -dy / l, y: dx / l };
    for (const step of [inset / 2, inset / 4, 0.05, 0.01])
      for (const sign of [1, -1]) {
        const t = { x: mid.x + sign * n.x * step, y: mid.y + sign * n.y * step };
        if (strictlyInside(t, mark)) return t;
      }
  }
  return null;
}

/** A STEP IN FROM THE DOOR (row 68 (a)): from where the door stands, along the
 *  inward normal of the room's nearest wall, past the door's own edge by a step,
 *  then held a metre off every wall. So a landing never stands on a wall, nor on
 *  the door's own square that straddles or touches it. */
export function stepInFrom(door, room) {
  const b = boundaryNearest(door.at, room);
  const half = door.extent ? Math.abs(b.n.x) * (door.extent.w ?? 0) / 2 + Math.abs(b.n.y) * (door.extent.h ?? 0) / 2 : 0;
  const from = b.inside ? door.at : b.q;
  const reach = b.inside ? half + LANDING_STEP_M : Math.max(0, half - b.d) + LANDING_STEP_M;
  const at = insetInto({ x: from.x + b.n.x * reach, y: from.y + b.n.y * reach }, room);
  return { x: at.x, y: at.y, clamped: at.moved };
}

/**
 * Where a walker passing through this portal stands, or why he cannot.
 *
 *   { ok: true, x, y, lands_mark, clamped, by }
 *   { ok: false, field: "lands_at", value, because }
 *
 * `room` is the mark the passage enters (passageTargetOf), `portal` the mark
 * passed. THE LANDING (row 68 (a), Darko 2026-10-16 19:15), first match wins:
 *   1. "room": the room's own declared landing, its `entry.lands_at` (a place
 *      that names no `into` may still say where its entrants land);
 *   2. "point" / "mark": a portal `lands_at` that points INSIDE the room, taken
 *      as written: a point in it, or a mark in it that is not itself a door;
 *   3. "door": a step in from the door, LANDING_STEP_M (1.5 m) past its own
 *      edge. The door is the portal's `lands_at` when that names a door (the
 *      paired door on the far side), else the way picked when it is not the room
 *      itself (WLD-63's door list), else the portal passed when it stands at the
 *      room (within LANDING_REACH_M). A `lands_at` that points outside the room
 *      falls through to here;
 *   4. "anchor": with no door at all (a portal far from where it leads), the
 *      room's own anchor.
 * Every landing is held at least LANDING_INSET_M inside the room. A `lands_at`
 * that names no mark is the door bug (WLD-18): the answer quotes the field
 * exactly as written, and that quote is the clue.
 */
export function landingOf(law, intoMark, byId, { room = intoMark, portal = null } = {}) {
  const resolve = (raw, whose) => {
    if (typeof raw === "string") {
      const m = byId.get(raw) ?? null;
      if (!m) return { error: { ok: false, field: "lands_at", value: raw, because: `${whose}lands_at: ${JSON.stringify(raw)} names no mark, so this portal leads nowhere` } };
      if (!m.at) return { error: { ok: false, field: "lands_at", value: raw, because: `${whose}lands_at: ${JSON.stringify(raw)} names a mark with no place in the world, so there is nowhere to stand` } };
      return { mark: m };
    }
    if (raw && typeof raw === "object" && Number.isFinite(Number(raw.x)) && Number.isFinite(Number(raw.y)))
      return { point: { x: Number(raw.x), y: Number(raw.y) } };
    return { error: { ok: false, field: "lands_at", value: raw, because: `${whose}lands_at: ${JSON.stringify(raw)} is neither a mark id nor { x, y }` } };
  };
  const done = (at, by, mark = null) => ({ ok: true, x: at.x, y: at.y, lands_mark: mark, clamped: !!(at.clamped ?? at.moved), by });
  const here = room ?? intoMark;
  // 1. the room's own word
  const own = room && room.id !== portal?.id ? entryLawOf(room) : null;
  if (own && !own.into && own.lands_at !== undefined) {
    const r = resolve(own.lands_at, `${room.id}'s `);
    if (r.error) return r.error;
    return r.point ? done(insetInto(r.point, room), "room") : done(insetInto(r.mark.at, room), "room", r.mark.id);
  }
  // 2–3. the portal's
  const raw = law?.lands_at;
  let door = null, named = null;
  if (raw !== undefined && raw !== null) {
    const r = resolve(raw, "");
    if (r.error) return r.error;
    // 2. a landing written INSIDE the room is taken as written: a point in it, or
    // a mark in it that is not itself a door (a rug, a dais). Anything else falls
    // through to the step in from the door (review-231)
    if (r.point && here?.extent && pointInMark(r.point, here)) return done(insetInto(r.point, here), "point");
    if (r.mark && !entryLawOf(r.mark)?.into && here?.extent && (markInside(here, r.mark) || pointInMark(r.mark.at, here)))
      return done(insetInto(r.mark.at, here), "mark", r.mark.id);
    // 3. a door named as the landing (the paired door on the far side) is stepped in from
    if (r.mark && entryLawOf(r.mark)?.into) { door = r.mark; named = r.mark.id; }
  }
  if (!door && intoMark?.at && room && intoMark.id !== room.id) {
    door = intoMark;
  } else if (!door && portal?.at && room?.extent && distanceToMark(portal.at, room) <= LANDING_REACH_M) {
    door = portal;
  }
  if (door) return done(here?.extent ? stepInFrom(door, here) : insetInto(door.at, here), "door", named);
  // 4. no door: the room's anchor
  return done(insetInto(here.at, here), "anchor");
}

/** The mark a passage through `into` actually enters: `into` itself when it
 *  has an extent; for a point mark, the room its anchor stands in. */
export function enterTargetOf(intoMark, marks) {
  return intoMark?.extent ? intoMark : containerOf(intoMark, marks);
}

/** A PLACE'S OWN DOOR IS A THRESHOLD, NEVER A ROOM (WLD-63, Darko 2026-10-13
 *  23:54: "from ANYWHERE in the Chapel's extent, you can enter, and pick your
 *  into, and end up at its position within the Chapel"). When the way picked
 *  through `portal` is itself a portal standing inside it (the Chapel's front
 *  door, set in its wall), the passage enters the room that door stands in and
 *  sets you down at the door; nobody is put inside a doorway. Every other way
 *  is `enterTargetOf`, unchanged. */
export function passageTargetOf(portal, intoMark, marks) {
  const law = intoMark && intoMark.id !== portal?.id ? entryLawOf(intoMark) : null;
  if (law?.into?.length && !law.into.includes(intoMark.id) && markInside(portal, intoMark))
    return containerOf(intoMark, marks);
  return enterTargetOf(intoMark, marks);
}

/** The portals a walker standing in this room may take next — one step at a
 *  time, no route-finding. The room each portal belongs to is its container. */
export function portalsIn(roomId, marks) {
  const out = [];
  for (const m of marks) {
    const law = entryLawOf(m);
    if (!law?.into || !m.at) continue;
    if (containerOf(m, marks)?.id !== roomId) continue;
    out.push({ id: m.id, into: law.into, word: law.word, at: m.at });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** The ways INTO a dungeon: portals standing outside it whose passage puts
 *  you inside it. What a refused direct enter hands back instead of the deed. */
export function portalsInto(dungeonId, marks) {
  const idx = dungeonIndex(marks);
  const inD = (id) => id === dungeonId || (idx.of.get(id) ?? []).includes(dungeonId);
  const byId = new Map(marks.map((m) => [m.id, m]));
  const out = [];
  for (const m of marks) {
    const law = entryLawOf(m);
    if (!law?.into || !m.at || inD(m.id)) continue;
    if (!law.into.some((id) => { const t = byId.get(id); const n = t ? passageTargetOf(m, t, marks)?.id ?? id : null; return n && inD(n); })) continue;
    out.push({ id: m.id, into: law.into, word: law.word, at: m.at });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** WHERE A WHOLE-DUNGEON EXIT SETS YOU DOWN (Darko, 2026-10-13 21:13): outside,
 *  at the portal you entered the dungeon through, `enteredVia` (the enter row's
 *  `via`, which only the office's journal holds). The Post Office's deposit rule,
 *  restated: "you exit to the stop you were at when you boarded". With no `via`
 *  on record (an entry from before portals), the nearest way in to `state`, and
 *  the answer says it was chosen (`chosen: true`). Null when the dungeon has no
 *  way in at all. */
export function dungeonLanding(dungeonId, marks, { enteredVia = null, state = null } = {}) {
  const ways = portalsInto(dungeonId, marks);
  const named = enteredVia ? ways.find((p) => p.id === enteredVia) : null;
  if (named) return { x: named.at.x, y: named.at.y, via: named.id, chosen: false };
  if (!ways.length) return null;
  const sx = Number(state?.x), sy = Number(state?.y);
  const near = Number.isFinite(sx) && Number.isFinite(sy)
    ? [...ways].sort((a, b) => Math.hypot(a.at.x - sx, a.at.y - sy) - Math.hypot(b.at.x - sx, b.at.y - sy))[0]
    : ways[0];
  return { x: near.at.x, y: near.at.y, via: near.id, chosen: true };
}

// ── THE EXIT LOCK (WLD-5, Darko, Sitting B 2026-10-18 20:22/20:27; words 2026-10-19 09:21) ──
//
// Leaving a dungeon by the `exit` verb locks that resident out of it until the
// next settlement (06:00/18:00Z, the nominal clock: a late settlement does not
// extend it, and there is no minimum). Leaving through a portal's inside face
// spends nothing, and moving between rooms never counts. It is the dungeon
// class's law, counted per dungeon (any portal, or entering from its outline)
// and per resident. The office holds the record (the exit act's `locked_until`)
// and hands a passage the locks in force as `lockedOut`: { <dungeon id>:
// { until, left_at } }. What the lock does and what it says are here.

const pad2 = (n) => String(n).padStart(2, "0");
/** An instant as the town says settlement times: "18:00Z". Null when unreadable. */
export function hhmmZ(iso) {
  const d = new Date(iso ?? NaN);
  return Number.isNaN(d.getTime()) ? null : `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`;
}

/** The exit's accept step (A-G1, ruled 09:21): "Leave the Spire from here? You
 *  can't come back in until the next settlement (18:00Z). Walking out through a
 *  door doesn't count. You'll be set down outside, at the Gilded Doors." */
export function exitLockWords({ dungeon, until = null, setDownAt = null, determined = {} }) {
  const when = hhmmZ(until);
  return `Leave ${nameInSentence(dungeon, determined)} from here? You can't come back in until the next settlement${when ? ` (${when})` : ""}.`
    + " Walking out through a door doesn't count."
    + (setDownAt ? ` You'll be set down outside, at ${nameInSentence(setDownAt, determined)}.` : "");
}

/** The time said again once you have left (Wright, W2): "You can't come back into
 *  the Spire until the next settlement (18:00Z)." */
export function lockStandsWords({ dungeon, until, determined = {} }) {
  return `You can't come back into ${nameInSentence(dungeon, determined)} until the next settlement (${hhmmZ(until) ?? until}).`;
}

/** A refused re-entry (A-G2, ruled 09:21): "You left the Spire by exit at
 *  17:12Z, so you can't come back in until the next settlement (18:00Z).
 *  Nothing was recorded." */
export function lockedOutWords({ dungeon, until, left_at = null, determined = {} }) {
  const left = hhmmZ(left_at);
  return `You left ${nameInSentence(dungeon, determined)} by exit${left ? ` at ${left}` : ""}, so you can't come back in`
    + ` until the next settlement (${hhmmZ(until) ?? until}). Nothing was recorded.`;
}

/** Whether a passage through `portal` would enter a dungeon the walker is locked
 *  out of. The ways asked are the one picked, or every way `into` names: a list
 *  with an open way still answers with its choices, and the pick is asked again.
 *  Null when the passage is free; otherwise the lock that holds, with its words.
 *  A dungeon already held is never asked (moving between rooms never counts). */
export function lockedPassage(portal, { pick = null, marks = [], held = [], lockedOut = null, determined = {} } = {}) {
  if (!lockedOut || !Object.keys(lockedOut).length) return null;
  const ways = entryLawOf(portal)?.into ?? [];
  const asked = pick && ways.includes(pick) ? [pick] : ways;
  if (!asked.length) return null;
  const byId = new Map(marks.map((m) => [m.id, m]));
  const locks = asked.map((way) => {
    const t = byId.get(way);
    const target = t ? passageTargetOf(portal, t, marks) ?? t : null;
    const d = target ? dungeonsOf(target, marks).find((id) => lockedOut[id] && !held.includes(id)) : null;
    return d ? { dungeon: d, ...lockedOut[d] } : null;
  });
  if (locks.some((l) => !l)) return null;
  const lock = locks[0];
  return { ...lock, words: lockedOutWords({ ...lock, determined }) };
}

// ── A DOOR THAT OPENS WHEN IT HOLDS WHAT IT ASKS FOR (WLD-5 B) ───────────────
//
// A portal whose entry carries `requires: { holds: [ids], in, says }` passes no
// one until its holder (`in`, or the portal itself) holds every mark `holds`
// names; then it passes for everyone. What a holder holds is the record's, and
// the office hands it in as `holdings` ({ holder id: [the ids it holds] }). A
// holder the passage was told nothing about holds nothing, and a condition that
// cannot be read refuses: the door stays shut, never open. Nothing is written.
//
// `in` may be a list (each mark counts when any one of the holders holds it),
// and `at: "settlement"` reads the world as the last settlement printed it
// instead of the record: a mark counts when its printed `held_by` names one of
// the holders (enter-exit.mjs § requires). Such a door needs nothing from the
// office, so a new door works unchanged through an office that predates it.

/** The one holder a portal's `requires` asks the office about, or null when it
 *  asks nothing. The older, single-holder read: a door that names a list or
 *  reads the settlement answers null here, so an office that knows only this
 *  hands it nothing, and a live list door stays shut there (never open). An
 *  office that knows `requiresHoldersOf` asks that instead. */
export function requiresHolderOf(portal) {
  const req = entryLawOf(portal)?.requires;
  if (!req) return null;
  if (Array.isArray(req.in) || req.at === REQUIRES_AT_SETTLEMENT) return null;
  return req.in ?? portal?.id ?? null;
}

/** Every holder whose live holdings a portal's `requires` asks the office for:
 *  `in` as a list, or the one holder. Empty for a door that reads the settlement
 *  (it asks the record nothing); null when it asks nothing at all. */
export function requiresHoldersOf(portal) {
  const req = entryLawOf(portal)?.requires;
  if (!req) return null;
  if (req.malformed || req.at === REQUIRES_AT_SETTLEMENT) return [];
  return requiresHoldersIn(req, portal);
}

/** "a", "a and b", "a, b and c". */
const andList = (xs) => xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** The refusal's words. `says` is the door's own line, `{held}` and `{asks}` in
 *  it read as the counts; with no line of its own, the town's plain one. `holder`
 *  may be a list; `at` is the door's `at` (a settlement count says so, and says
 *  when what is put in now will count). */
export function requiresWords({ portal, holder, held, asks, says = null, at = null, shown = true, determined = {} }) {
  const holders = Array.isArray(holder) ? holder : [holder];
  const settled = at === REQUIRES_AT_SETTLEMENT;
  // NOT SHOWN: the line and the count, naming nothing it asks for and no holder
  if (shown === false && !says)
    return `${nameInSentence(portal, determined).replace(/^./, (c) => c.toUpperCase())} stays shut until what it asks for is in place, ${settled
      ? `and at the last settlement ${held} of ${asks} were; what is put in now counts from the next settlement`
      : `and ${held} of ${asks} are`}. Nothing was recorded.`;
  const self = holders.length === 1 && holders[0] === portal;
  const many = holders.length > 1;
  const who = self ? "it" : andList(holders.map((h) => nameInSentence(h, determined)));
  const count = at === REQUIRES_AT_SETTLEMENT
    ? `and at the last settlement ${many ? "they" : "it"} held ${held}; what is put in now counts from the next settlement`
    : `and ${many ? "they hold" : "it holds"} ${held}`;
  const line = says
    ? String(says).replace(/{held}/g, String(held)).replace(/{asks}/g, String(asks))
    : `${nameInSentence(portal, determined).replace(/^./, (c) => c.toUpperCase())} opens only when ${who} ${many ? "hold" : "holds"} the ${asks} ${asks === 1 ? "thing" : "things"} it asks for, ${count}.`;
  return `${line.trim()} Nothing was recorded.`;
}

/** Null when `portal` asks nothing, or its holders hold all it asks for;
 *  otherwise `{ words, requires: { in, holds, held, missing } }` (and `at`, when
 *  the door writes it). `in` is as the door wrote it: one id, or the list.
 *  `marks` is the world the passage stands on, which a settlement door reads. */
export function unmetRequires(portal, { holdings = null, marks = [], determined = {} } = {}) {
  const req = entryLawOf(portal)?.requires;
  if (!req) return null;
  const holder = Array.isArray(req.in) ? req.in : req.in ?? portal.id;
  if (req.malformed) return { words: `${portal.id}'s entry asks for something it does not say plainly (${req.malformed}), so it stays shut. Nothing was recorded.`, requires: { in: holder, malformed: req.malformed } };
  const holders = new Set(requiresHoldersIn(req, portal));
  let inside;
  if (req.at === REQUIRES_AT_SETTLEMENT) {
    // as printed: a mark the world does not carry, or carries placed, is held by no one
    const printed = new Map((marks ?? []).map((m) => [m?.id, heldBy(m)]));
    inside = new Set(req.holds.filter((id) => holders.has(printed.get(id))));
  } else {
    inside = new Set([...holders].flatMap((h) => (holdings && Array.isArray(holdings[h]) ? holdings[h] : [])).map(String));
  }
  const held = req.holds.filter((id) => inside.has(id));
  if (held.length === req.holds.length) return null;
  return {
    words: requiresWords({ portal: portal.id, holder, held: held.length, asks: req.holds.length, says: req.says, at: req.at ?? null, shown: req.shown !== false, determined }),
    // NOT SHOWN: the counts alone, no id of what it asks for or where it looks
    requires: req.shown === false
      ? { shown: false, held: held.length, asks: req.holds.length, ...(req.at ? { at: req.at } : {}) }
      : { in: Array.isArray(holder) ? [...holder] : holder, holds: [...req.holds], held, missing: req.holds.filter((id) => !inside.has(id)),
        ...(req.at ? { at: req.at } : {}) },
  };
}

// ── the lint (mark-lint.mjs § portals reads this) ────────────────────────────
//
// The rules, each with a name an exception can cite:
//
//   into-names-a-mark      every id in `into` is a mark in the world
//   lands-at-names-a-mark  a string `lands_at` is a mark (with a place)
//   lands-at-reaches-into  the landing anchor stands within LANDING_REACH_M of
//                          every `into` shape it may land in
//   exit-never-opposed     a portal out of a dungeon never answers `opposed`:
//                          locked from the outside, never from the inside
//   path-to-an-exit        from every room of a dungeon, a path of portals that
//                          are not opposed reaches an exit. ADVISORY since
//                          Darko's 21:13 change: a whole-dungeon exit is always
//                          offered, so a room without a portal out strands
//                          nobody; the finding comes back with sev "WARN"
//   landing-inside         a passage into a ring room sets you down inside its
//                          ring (row 68 (a); a rectangle always holds one)
//   requires-names-marks   a portal's `requires` is readable, and every id in
//                          `holds` and its `in` names a mark (WLD-5 B)
//   requires-in-a-holder   the mark `requires` asks writes `holder: true`
//   exit-carries-no-requires a portal out of a dungeon asks nothing: like an
//                          exit's word, a condition locks from the outside only
//   rooms-do-not-overlap   inside a dungeon, two of the rooms the dungeon DECLARES
//                          (its `rooms` list) never overlap (Darko, 2026-10-13
//                          20:31: siblings only; a room's contents sit inside
//                          it, and floors tile rather than stack). Nothing else
//                          is judged: Darko, 2026-11-01 07:58: "Yeah rooms only";
//                          07:59, two messages: "i'm thinking maybe just have the
//                          dungeon represented by some kind of class in code that
//                          has a list of dungeon rooms which the no overlap thing
//                          checks" and "Everything should be allowed to overlap
//                          like normal". A dungeon with no
//                          `rooms` list checks nothing; no room is inferred from
//                          geometry.
//   rooms-name-marks       every id in a dungeon's `rooms` names a sited mark with
//                          an extent that stands inside that dungeon (a typo in the
//                          list would otherwise switch the overlap rule off)
//
// NO EXCEPTIONS. Not coded, not named: a finding that is wrong is fixed in the rule.
// The named-exception door (WORLD/portal-lint-exceptions.json, applyPortalExceptions)
// is retired. Darko, 2026-11-01 07:58: "if we're hardcoding enumerated exceptions as
// slugs that's no good".
export const PORTAL_RULES = Object.freeze([
  "into-names-a-mark", "lands-at-names-a-mark", "lands-at-reaches-into", "exit-never-opposed", "path-to-an-exit",
  "rooms-do-not-overlap", "rooms-name-marks", "landing-inside", "requires-names-marks", "requires-in-a-holder", "exit-carries-no-requires",
]);

/** The rooms a dungeon declares: `rooms`, a list of mark ids on the dungeon.
 *  Returns { ids, bad } where `bad` says why the value is unreadable (a dungeon
 *  that writes no `rooms` has ids [] and no complaint: it checks nothing). */
export function declaredRoomIds(dungeon) {
  const raw = dungeon?.rooms;
  if (raw === undefined || raw === null) return { ids: [], bad: null };
  if (!Array.isArray(raw) || !raw.every((x) => typeof x === "string" && x !== ""))
    return { ids: [], bad: "rooms is a list of mark ids, e.g. rooms: [\"household/slug\", ...]" };
  return { ids: [...new Set(raw)], bad: null };
}

/** A mark's parent, by true containment: the smallest sited mark with an
 *  extent, larger than it, that wholly holds it. Two rooms that overlap are
 *  therefore siblings, never parent and child, which is what lets the overlap
 *  rule see them. */
function parentOf(m, marks) {
  let best = null;
  for (const c of marks) {
    if (c === m || c.id === m.id || !isSited(c) || !c.extent || !(area(c) > area(m))) continue;
    if (!markInside(c, m)) continue;
    if (!best || area(c) < area(best)) best = c;
  }
  return best;
}

/** Whether two marks share any ground. Two rooms that only share a wall do
 *  not: rectangles are asked analytically (touching edges overlap by zero), and
 *  a ring is sampled on a metre grid, where the ring test is half-open, so a
 *  point on a shared edge falls in one room, never both. */
export function roomsOverlap(a, b) {
  const ra = rect(a), rb = rect(b);
  if (overlapArea(ra, rb) <= 0) return false;
  if (!polygonOf(a) && !polygonOf(b)) return true;
  const x0 = Math.max(ra.x - ra.w / 2, rb.x - rb.w / 2), x1 = Math.min(ra.x + ra.w / 2, rb.x + rb.w / 2);
  const y0 = Math.max(ra.y - ra.h / 2, rb.y - rb.h / 2), y1 = Math.min(ra.y + ra.h / 2, rb.y + rb.h / 2);
  const step = Math.max(1, Math.sqrt(((x1 - x0) * (y1 - y0)) / 200000));
  for (let x = x0 + step / 2; x < x1; x += step)
    for (let y = y0 + step / 2; y < y1; y += step) {
      const pt = { x, y };
      if (pointInMark(pt, a) && pointInMark(pt, b)) return true;
    }
  return false;
}

export function portalFindings(marks) {
  const list = (marks ?? []).filter((m) => m && !m._error);
  const byId = new Map(list.map((m) => [m.id, m]));
  const found = [];
  const say = (mark, rule, msg, sev = "ERROR") => found.push({ mark, rule, msg, sev });

  // node of a passage target: the room actually entered
  const nodeOf = (id, via) => {
    const t = byId.get(id);
    return t ? passageTargetOf(via, t, list)?.id ?? null : null;
  };

  const portals = [];
  for (const m of list) {
    const law = entryLawOf(m);
    if (!law?.into) continue;
    portals.push({ m, law });
    if (!law.into.length) say(m.id, "into-names-a-mark", `entry.into names no mark at all — a portal leads somewhere, or it is not a portal`);
    for (const id of law.into) if (!byId.has(id)) say(m.id, "into-names-a-mark", `entry.into: ${JSON.stringify(id)} names no mark`);
    const raw = law.lands_at;
    if (raw !== undefined) {
      let anchor = null;
      if (typeof raw === "string") {
        const t = byId.get(raw);
        if (!t || !t.at) say(m.id, "lands-at-names-a-mark", `entry.lands_at: ${JSON.stringify(raw)} names no mark${t ? " with a place in the world" : ""} — the portal would leave everyone standing at it`);
        else anchor = t.at;
      } else if (raw && typeof raw === "object" && Number.isFinite(Number(raw.x)) && Number.isFinite(Number(raw.y))) {
        anchor = { x: Number(raw.x), y: Number(raw.y) };
      } else {
        say(m.id, "lands-at-names-a-mark", `entry.lands_at: ${JSON.stringify(raw)} is neither a mark id nor { x, y }`);
      }
      if (anchor) for (const id of law.into) {
        const into = byId.get(id);
        if (!into?.at) continue;
        const d = into.extent ? distanceToMark(anchor, into) : Math.hypot(anchor.x - into.at.x, anchor.y - into.at.y);
        if (d > LANDING_REACH_M)
          say(m.id, "lands-at-reaches-into", `entry.lands_at stands ${Math.round(d)} m from ${id} — a landing is set down inside its into, and one more than ${LANDING_REACH_M} m away is a portal drawn in the wrong place`);
      }
    }
    // A DOOR THAT ASKS (WLD-5 B): what it asks for and where it looks are marks,
    // and where it looks is a holder
    if (law.requires) {
      const req = law.requires;
      if (req.malformed) say(m.id, "requires-names-marks", `entry.requires: ${req.malformed}`);
      else {
        for (const id of req.holds) if (!byId.has(id)) say(m.id, "requires-names-marks", `entry.requires.holds: ${JSON.stringify(id)} names no mark — the door would ask for something that does not exist`);
        for (const holderId of requiresHoldersIn(req, m)) {
          const holder = byId.get(holderId);
          if (!holder) say(m.id, "requires-names-marks", `entry.requires.in: ${JSON.stringify(holderId)} names no mark`);
          else if (holder.holder !== true && String(holder.holder) !== "true")
            say(m.id, "requires-in-a-holder", `${holderId} is asked to hold what this door requires, but it does not write holder: true — nothing can ever be put in it`);
        }
      }
    }
    // THE LANDING STANDS INSIDE THE ROOM IT ENTERS (row 68 (a), review-231). A
    // rectangle always holds one; a ring drawn too thin or degenerate may hold
    // none, and the passage would set you down on its wall
    for (const id of law.into) {
      const into = byId.get(id);
      if (!into?.at) continue;
      const room = passageTargetOf(m, into, list) ?? into;
      if (!polygonOf(room)) continue;
      const l = landingOf(law, into, byId, { room, portal: m });
      if (l.ok && !strictlyInside(l, room))
        say(m.id, "landing-inside", `passing into ${id} would set you down at (${l.x}, ${l.y}), on or outside the ring of ${room.id} — a landing stands inside the room it enters`);
    }
  }

  // the dungeons: exits, and a way out of every room
  const idx = dungeonIndex(list);
  for (const d of idx.dungeons) {
    const inD = (id) => id === d || (idx.of.get(id) ?? []).includes(d);
    const inner = portals.filter(({ m }) => inD(m.id));
    const isExit = (m, law) => law.into.some((id) => byId.has(id) && !inD(nodeOf(id, m) ?? id));
    for (const { m, law } of inner) {
      if (isExit(m, law) && law.word === "opposed")
        say(m.id, "exit-never-opposed", `this portal leads out of ${d} and answers "opposed" — an exit is locked from the outside, never from the inside. No jails`);
      if (isExit(m, law) && law.requires)
        say(m.id, "exit-carries-no-requires", `this portal leads out of ${d} and asks for something before it passes — an exit is locked from the outside, never from the inside. No jails`);
    }

    // rooms: every place inside the dungeon a passage can put you, and every
    // room a portal inside it stands in. An OPPOSED portal into itself (a stair whose
    // floor does not exist yet: the stairs class's default) puts nobody anywhere, so
    // it makes no room; a welcomed or neutral one is a place you stand in.
    const rooms = new Set();
    for (const { m, law } of portals) for (const id of law.into) { if (id === m.id && law.word === "opposed") continue; const n = nodeOf(id, m); if (n && inD(n)) rooms.add(n); }
    for (const { m } of inner) { const c = containerOf(m, list)?.id; if (c && inD(c)) rooms.add(c); }
    const out = new Map([...rooms].map((r) => [r, { exit: false, to: new Set() }]));
    for (const { m, law } of inner) {
      if (law.word === "opposed" || law.requires) continue;   // a door that asks may be shut: it is no unlocked way
      const from = containerOf(m, list)?.id;
      if (!out.has(from)) continue;
      for (const id of law.into) {
        if (!byId.has(id)) continue;
        const n = nodeOf(id, m) ?? id;
        if (inD(n)) out.get(from).to.add(n); else out.get(from).exit = true;
      }
    }
    // reverse reachability from the rooms that hold an unlockable exit
    const reaches = new Set([...out].filter(([, v]) => v.exit).map(([r]) => r));
    for (let grew = true; grew;) {
      grew = false;
      for (const [r, v] of out) if (!reaches.has(r) && [...v.to].some((t) => reaches.has(t))) { reaches.add(r); grew = true; }
    }
    for (const r of [...rooms].sort())
      if (!reaches.has(r))
        say(r, "path-to-an-exit", `no path of unlocked portals leads from ${r} out of ${d} — every room of a dungeon should have a way out that cannot be locked (advisory: exit is always offered)`, "WARN");

    // THE ROOMS OF A DUNGEON NEVER OVERLAP, AND THEY ARE THE ROOMS IT DECLARES.
    // The dungeon writes `rooms`, a list of mark ids; only those are judged, and
    // only against each other. Nothing is inferred from geometry or from what a
    // mark carries: a rug, a dish, a stair or a door overlaps what it likes
    // (Darko, 2026-11-01 07:58 and 07:59, quoted at PORTAL_RULES). No list, no
    // check. A room's parent is the smallest declared room that wholly holds it,
    // else the dungeon, so a room declared inside another is its child.
    const declared = declaredRoomIds(byId.get(d));
    if (declared.bad) say(d, "rooms-name-marks", `${d}: ${declared.bad}`);
    const roomMarks = [];
    for (const id of declared.ids) {
      const r = byId.get(id);
      if (!r) say(d, "rooms-name-marks", `rooms: ${JSON.stringify(id)} names no mark`);
      else if (id === d || !inD(id)) say(d, "rooms-name-marks", `rooms: ${id} does not stand inside ${d}`);
      else if (!isSited(r) || !r.extent) say(d, "rooms-name-marks", `rooms: ${id} has no extent — a room is a place on the ground`);
      else roomMarks.push(r);
    }
    const groups = new Map();
    for (const m of roomMarks) {
      const parent = parentOf(m, roomMarks)?.id ?? d;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(m);
    }
    for (const [parent, sibs] of groups) {
      sibs.sort((a, b) => a.id.localeCompare(b.id));
      for (let i = 0; i < sibs.length; i++)
        for (let j = i + 1; j < sibs.length; j++)
          if (roomsOverlap(sibs[i], sibs[j]))
            say(sibs[i].id, "rooms-do-not-overlap", `${sibs[i].id} overlaps ${sibs[j].id}, and both stand directly in ${parent} inside ${d} — the rooms of a dungeon tile, they never stack`);
    }
  }
  return found;
}
