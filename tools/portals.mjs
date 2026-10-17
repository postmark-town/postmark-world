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

import { marksContain, overlapArea, pointInPolygon, pointInRect, polygonOf, rect } from "./geometry.mjs";
import { entryLawOf, isStairs } from "./enter-exit.mjs";

export const DUNGEON_CLASS = "dungeon";
/** How far inside `into` a clamped landing is nudged (Wright, 2026-10-13 20:14). */
export const LANDING_NUDGE_M = 1;
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
  String(m?.class ?? "") === DUNGEON_CLASS && m?.kind === "sited" && !!m.at && !!m.extent;

const area = (m) => (m?.extent?.w ?? 0) * (m?.extent?.h ?? 0);

/** Whether `m` stands inside `outer`, by geometry: a mark with an extent by the
 *  world's own containment (marksContain), a point mark by its anchor. */
export function markInside(outer, m) {
  if (!outer?.at || !outer.extent || !m?.at || m === outer || m.id === outer.id) return false;
  return m.extent ? marksContain(outer, m) : pointInMark(m.at, outer);
}

/** The room a mark stands in: the smallest sited mark with an extent, larger
 *  than it, whose shape holds its anchor. Measured at the anchor on purpose — a
 *  portal set in a wall straddles it, and still belongs to the room its anchor is in. */
export function containerOf(m, marks) {
  if (!m?.at) return null;
  let best = null;
  for (const c of marks) {
    if (c === m || c.id === m.id || c.kind !== "sited" || !c.at || !c.extent) continue;
    if (m.extent && !(area(c) > area(m))) continue;
    if (!pointInMark(m.at, c)) continue;
    if (!best || area(c) < area(best)) best = c;
  }
  return best;
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
    if (!inner || !markInside(inner, m)) hidden.add(id);
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

/** CLAMPING (Wright 20:14, agreed by Darko): a point outside the mark moves to
 *  the nearest point of it, nudged about a metre inward. A point already inside
 *  stays exactly where it is; a point mark has one place to stand. */
export function clampInto(pt, mark, nudge = LANDING_NUDGE_M) {
  const p = { x: Number(pt.x), y: Number(pt.y) };
  if (!mark?.extent) return { x: mark.at.x, y: mark.at.y, clamped: p.x !== mark.at.x || p.y !== mark.at.y };
  if (pointInMark(p, mark)) return { ...p, clamped: false };
  const ring = polygonOf(mark);
  if (!ring) {
    const r = rect(mark);
    const nx = Math.min(nudge, r.w / 2), ny = Math.min(nudge, r.h / 2);
    const x = Math.max(r.x - r.w / 2 + nx, Math.min(r.x + r.w / 2 - nx, p.x));
    const y = Math.max(r.y - r.h / 2 + ny, Math.min(r.y + r.h / 2 - ny, p.y));
    return { x: round2(x), y: round2(y), clamped: true };
  }
  let edge = null, bd = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const q = nearestOnSegment(p, ring[i], ring[(i + 1) % ring.length]);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) { bd = d; edge = q; }
  }
  // inward is the way we were already going; on a concave stretch that can
  // leave the ring again, so the second try heads for the anchor instead
  const step = (from, dx, dy) => {
    const l = Math.hypot(dx, dy);
    return l ? { x: from.x + (dx / l) * nudge, y: from.y + (dy / l) * nudge } : null;
  };
  const onward = step(edge, edge.x - p.x, edge.y - p.y);
  const toAnchor = step(edge, mark.at.x - edge.x, mark.at.y - edge.y);
  for (const c of [onward, toAnchor, mark.at]) {
    if (c && pointInMark(c, mark)) return { x: round2(c.x), y: round2(c.y), clamped: true };
  }
  return { x: round2(edge.x), y: round2(edge.y), clamped: true };
}

/**
 * Where a walker passing through this portal stands, or why he cannot.
 *
 *   { ok: true, x, y, lands_mark, clamped }
 *   { ok: false, field: "lands_at", value, because }
 *
 * A `lands_at` that names no mark is the door bug (WLD-18): the answer quotes
 * the field exactly as written, and that quote is the clue.
 */
export function landingOf(law, intoMark, byId) {
  const raw = law?.lands_at;
  let anchor = null, landsMark = null;
  if (raw === undefined || raw === null) {
    anchor = intoMark.at;
  } else if (typeof raw === "string") {
    landsMark = byId.get(raw) ?? null;
    if (!landsMark)
      return { ok: false, field: "lands_at", value: raw,
               because: `lands_at: ${JSON.stringify(raw)} names no mark, so this portal leads nowhere` };
    if (!landsMark.at)
      return { ok: false, field: "lands_at", value: raw,
               because: `lands_at: ${JSON.stringify(raw)} names a mark with no place in the world, so there is nowhere to stand` };
    anchor = landsMark.at;
  } else if (typeof raw === "object" && Number.isFinite(Number(raw.x)) && Number.isFinite(Number(raw.y))) {
    anchor = { x: Number(raw.x), y: Number(raw.y) };
  } else {
    return { ok: false, field: "lands_at", value: raw,
             because: `lands_at: ${JSON.stringify(raw)} is neither a mark id nor { x, y }` };
  }
  const at = clampInto(anchor, intoMark);
  return { ok: true, x: at.x, y: at.y, lands_mark: landsMark?.id ?? null, clamped: at.clamped };
}

/** The mark a passage through `into` actually enters: `into` itself when it
 *  has an extent; for a point mark, the room its anchor stands in. */
export function enterTargetOf(intoMark, marks) {
  return intoMark?.extent ? intoMark : containerOf(intoMark, marks);
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
    if (!law.into.some((id) => { const t = byId.get(id); const n = t ? enterTargetOf(t, marks)?.id ?? id : null; return n && inD(n); })) continue;
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
//   rooms-do-not-overlap   inside a dungeon, two marks with the same parent
//                          never overlap (Darko, 2026-10-13 20:31: siblings
//                          only; a room's contents sit inside it, and floors
//                          tile rather than stack)
//
// NO EXCEPTIONS LIVE HERE. A named one lives in WORLD/portal-lint-exceptions.json,
// appended by whoever must answer for it, and mark-lint prints every exception it
// honoured so the record shows the portal was let through, and by whom.
export const PORTAL_RULES = Object.freeze([
  "into-names-a-mark", "lands-at-names-a-mark", "lands-at-reaches-into", "exit-never-opposed", "path-to-an-exit",
  "rooms-do-not-overlap",
]);

/** A mark's parent, by true containment: the smallest sited mark with an
 *  extent, larger than it, that wholly holds it. Two rooms that overlap are
 *  therefore siblings, never parent and child, which is what lets the overlap
 *  rule see them. */
function parentOf(m, marks) {
  let best = null;
  for (const c of marks) {
    if (c === m || c.id === m.id || c.kind !== "sited" || !c.at || !c.extent || !(area(c) > area(m))) continue;
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
  const nodeOf = (id) => {
    const t = byId.get(id);
    return t ? enterTargetOf(t, list)?.id ?? null : null;
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
          say(m.id, "lands-at-reaches-into", `entry.lands_at stands ${Math.round(d)} m from ${id} — a landing is clamped into its into, and one more than ${LANDING_REACH_M} m away is a portal drawn in the wrong place`);
      }
    }
  }

  // the dungeons: exits, and a way out of every room
  const idx = dungeonIndex(list);
  for (const d of idx.dungeons) {
    const inD = (id) => id === d || (idx.of.get(id) ?? []).includes(d);
    const inner = portals.filter(({ m }) => inD(m.id));
    const isExit = (law) => law.into.some((id) => byId.has(id) && !inD(nodeOf(id) ?? id));
    for (const { m, law } of inner)
      if (isExit(law) && law.word === "opposed")
        say(m.id, "exit-never-opposed", `this portal leads out of ${d} and answers "opposed" — an exit is locked from the outside, never from the inside. No jails`);

    // rooms: every place inside the dungeon a passage can put you, and every
    // room a portal inside it stands in. An OPPOSED portal into itself (a stair whose
    // floor does not exist yet: the stairs class's default) puts nobody anywhere, so
    // it makes no room; a welcomed or neutral one is a place you stand in.
    const rooms = new Set();
    for (const { m, law } of portals) for (const id of law.into) { if (id === m.id && law.word === "opposed") continue; const n = nodeOf(id); if (n && inD(n)) rooms.add(n); }
    for (const { m } of inner) { const c = containerOf(m, list)?.id; if (c && inD(c)) rooms.add(c); }
    const out = new Map([...rooms].map((r) => [r, { exit: false, to: new Set() }]));
    for (const { m, law } of inner) {
      if (law.word === "opposed") continue;
      const from = containerOf(m, list)?.id;
      if (!out.has(from)) continue;
      for (const id of law.into) {
        if (!byId.has(id)) continue;
        const n = nodeOf(id) ?? id;
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

    // siblings never overlap. Portals are left out: a portal is set in a wall
    // and straddles it by design. A stair is not (it is a box inside a room), so
    // a stair stays in, portal or not.
    const groups = new Map();
    for (const m of list) {
      if (m.kind !== "sited" || !m.at || !m.extent || m.id === d || !inD(m.id) || (entryLawOf(m)?.into && !isStairs(m))) continue;
      const parent = parentOf(m, list)?.id ?? null;
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

/** Applies a named exception list to the findings: an excepted finding comes
 *  back as `excepted` (with who and why), an exception that matched nothing as
 *  `stale`. The rule itself never changes. */
export function applyPortalExceptions(findings, exceptions = []) {
  const used = new Set();
  const out = findings.map((f) => {
    const i = exceptions.findIndex((e) => e && e.mark === f.mark && e.rule === f.rule);
    if (i < 0) return f;
    used.add(i);
    return { ...f, excepted: { by: exceptions[i].by ?? null, why: exceptions[i].why ?? null } };
  });
  const stale = exceptions.map((e, i) => ({ e, i })).filter(({ i }) => !used.has(i)).map(({ e }) => e);
  return { findings: out, stale };
}
