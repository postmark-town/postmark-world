// spark.mjs — A SPARK: A MARK THAT REMEMBERS A MOMENT (WLD-173).
//
// The rulings, CORE-70 (Darko, 2026-11-13 and 11-14, recorded by Wright):
//
//   call 5   "a Spark should minimally just require like a time and a place and
//            a recounting. And then could optionally have a conversation, an
//            event, you know, actions, picture, prompt for the generated image,
//            like the residents that attended"
//   call 9   "we can keep the 150 as being like a fundamental part of marks … the
//            headline … a specific property of the Spark subclass of Mark … in
//            addition to all of the core parts that all marks have"
//   call 22  (place, replacing 12 and 17) a spark is neither sited nor anchored;
//            its at and extent are its root conversation's room, frozen when it
//            is made, or a maker-chosen at with "an extent locked at 60 radius
//            (base earshot)" (09:37). "It isn't sited, so sited marks in its
//            extent don't contest it."
//   11:1x    on the parcel: "Keep the parcel holder's word". The holder's word
//            and the town's still reach a spark; only the contest with other
//            sited marks and the market goes away (consent.mjs § IN THE MARKET).
//   call 23  a spark ties to a circle, a sub-spark to a reply subtree, the event's
//            spark to the whole room; anyone may spark a circle, many per circle.
//   04:11Z   on which room (Wright 11-15, recording Darko): "each room gets its own
//            spark by default", at most 20 per event in the code's natural order.
//            So a spark binds at most ONE room: `rooms` stays the strict JSON list,
//            holding one room id or none (absent: the standalone circle). A circle's
//            spark names its one source room; an event's sparks are one per room,
//            each tied to the event (the Office's producer fans them out). There is
//            no room set, ranking or combined footprint here: a list of two rooms
//            is refused, never cut to its first. `roomsPlace` below turns the one
//            room's bounds into the spark's place.
//   10:46    "I think we can just use the circles as the spine for parents for
//            now? maybe let sparks declare their parent if they want to as a
//            field". The tree is the circles; a spark's own link is its own.
//
// So the class is `the-town/spark`, extending mark (the Keeping Works): the body
// is the headline (the-town/character-cap, inherited), and its parts are flat
// properties. This module is the class's grammar: its field names, what the lint
// asks of an instance, and the circle spine read off published records. It is
// browser-pure on purpose (no fs), so a reader of the store can ask it too.
//
// ── WHAT THE RECORD GRAMMAR CAN CARRY ───────────────────────────────────────
//
// A flat field is one frontmatter line (marks-fold.mjs § parseRecord). Free text
// there is one line, loses everything after a '#', is read as JSON when it opens
// with '{' or '[', and as a number when it is all digits. Lists ride the grammar's
// existing strict-JSON lane, as `points` and `timetable` do (Bevel, 2026-11-14
// 15:58Z: no new property-value type). The writer keeps text inside those limits;
// this lint refuses what survives parsing in the wrong shape.
//
// ── THE OWN LINK IS NOT `parent:` ───────────────────────────────────────────
//
// `parent:` is the record grammar's predicate edge: the standing walk climbs it
// (mark-standing.mjs § standingWalk) and the loader reads it as an authored
// parent. A spark that wrote it would be anchored, which the ruling forbids. The
// maker's own `parent` is stored as `parent_spark`, mapped by the Office (Bevel,
// 15:58Z). It names a spark and does nothing else.

import { propertyOf } from "./class-properties.mjs";
import { SPARK_CLASS, isSparkIn } from "./mark-kind.mjs";

export { SPARK_CLASS, isSparkIn };

/** Every spark property, in the record's order. The fold carries each (marks-fold.mjs § the published record). */
export const SPARK_FIELDS = Object.freeze([
  "recounting", "experienced_at", "experienced_until", "rooms", "circle", "circle_path",
  "event", "picture", "image_prompt", "acts", "present", "parent_spark",
]);

/** What every spark must carry beyond its place (call 5: a time, a place and a recounting). */
export const SPARK_REQUIRED = Object.freeze(["recounting", "experienced_at"]);

/** The maker's own link (Darko 10:46), stored apart from the predicate edge. */
export const SPARK_LINK = "parent_spark";

/** The property that locks a standalone spark's radius (Darko 09:37: "60 radius (base earshot)"). */
export const SPARK_RADIUS_PROPERTY = "place_radius_m";

/** A standalone spark's radius as the class declares it, or null when the class cannot be read. */
export function sparkRadiusM(marksOrIndex) {
  const r = Number(propertyOf(marksOrIndex, SPARK_CLASS, SPARK_RADIUS_PROPERTY)?.value);
  return Number.isFinite(r) && r > 0 ? r : null;
}

const isText = (v) => (typeof v === "string" && v.trim() !== "") || (typeof v === "number" && Number.isFinite(v));
const isActNumber = (v) => Number.isSafeInteger(v) && v > 0;
const MARK_ID_RE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;

/** A list field as parsed: the grammar's strict JSON array, or null when it is none. */
export const listOf = (v) => (Array.isArray(v) ? v : null);

/**
 * What is wrong with one spark record, as sentences, for the lint (`[]` is clean).
 * `radiusM` is the class's locked radius; `isDate` is the record grammar's own
 * date rule (marks-fold.mjs § isValidMarkDate), handed in so there is one.
 */
export function sparkProblems(rec, { radiusM = null, isDate } = {}) {
  const out = [];
  const say = (s) => out.push(s);
  // the required parts (call 5)
  if (!isText(rec.recounting)) say(`a spark needs recounting: — what happened, in the maker's words (call 5: "a time and a place and a recounting")`);
  if (rec.experienced_at === undefined) say(`a spark needs experienced_at: — when it happened (an event's doors-open, or its circle's first say), not the filing date`);
  else if (!isDate(rec.experienced_at)) say(`experienced_at: is YYYY-MM-DD or a full ISO 8601 datetime (got ${JSON.stringify(rec.experienced_at)})`);
  if (rec.experienced_until !== undefined) {
    if (!isDate(rec.experienced_until)) say(`experienced_until: is YYYY-MM-DD or a full ISO 8601 datetime (got ${JSON.stringify(rec.experienced_until)})`);
    else if (isDate(rec.experienced_at) && Date.parse(rec.experienced_until) < Date.parse(rec.experienced_at))
      say(`experienced_until: ${rec.experienced_until} is before experienced_at: ${rec.experienced_at}`);
  }
  // the place is required (call 5) and is the mark's own at and extent
  // The place is numbers as written, never coerced: the engine's rect() fills a missing or null value
  // with a default (x ?? 0, w ?? 1) and does string arithmetic on text, so a place that is not four
  // finite numbers would be published somewhere it never was (review 391 F1).
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (!rec.at || !rec.extent) say(`a spark needs at {x,y} and extent {w,h} — its place: its room's, frozen when made, or its maker's at with the locked circle`);
  else if (!num(rec.at.x) || !num(rec.at.y)) say(`at: {x, y} are two finite numbers, as written (got ${JSON.stringify(rec.at)})`);
  // a one-speaker room's bounds may keep a zero side (a point or a line), and are kept as they are; never a negative one
  else if (!num(rec.extent.w) || !num(rec.extent.h) || rec.extent.w < 0 || rec.extent.h < 0)
    say(`extent: {w, h} are two finite numbers, 0 or more, as written (got ${JSON.stringify(rec.extent)})`);
  // the circle tie (call 23) and its spine
  const path = listOf(rec.circle_path);
  if (rec.circle !== undefined && !isActNumber(rec.circle)) say(`circle: is a say's act number (got ${JSON.stringify(rec.circle)})`);
  if (rec.circle_path !== undefined && (!path || !path.length || !path.every(isActNumber)))
    say(`circle_path: is a JSON array of act numbers, the top circle first (got ${JSON.stringify(rec.circle_path)})`);
  if (rec.circle !== undefined && rec.circle_path === undefined) say(`circle: ${rec.circle} needs circle_path: — the circle's ancestry, top circle first, ending at ${rec.circle}`);
  if (rec.circle === undefined && rec.circle_path !== undefined) say(`circle_path: names a spine but no circle: — the path ends at the spark's own circle`);
  if (path?.length && isActNumber(rec.circle) && path.at(-1) !== rec.circle) say(`circle_path: ends at ${JSON.stringify(path.at(-1))}, not at circle: ${rec.circle}`);
  if (path?.length && new Set(path).size !== path.length) say(`circle_path: names a circle twice — a spine has no loop`);
  // the room (04:11Z, "each room gets its own spark"): a JSON array holding at most one room id
  // The unpublished singular `room:` has no alias: refused, never read as no room (which the locked circle would take).
  if (rec.room !== undefined) say(`room: is not a spark field — a spark's room is rooms: [<room id>], one line of JSON (got room: ${JSON.stringify(rec.room)})`);
  const rooms = listOf(rec.rooms);
  if (rec.rooms !== undefined && (!rooms || !rooms.every((r) => typeof r === "string" && r.trim() !== "")))
    say(`rooms: is a JSON array of room ids (got ${JSON.stringify(rec.rooms)})`);
  // several rooms are several sparks, one each (04:11Z): refused, never combined or cut to the first
  else if (rooms && rooms.length > 1)
    say(`rooms: names ${rooms.length} rooms; a spark binds one room at most — each room gets its own spark (got ${JSON.stringify(rec.rooms)})`);
  // a circle is spoken in one room, its source
  if (rec.circle !== undefined && rooms?.length !== 1)
    say(`circle: ${rec.circle} needs rooms: [<its one source room>] — a circle is spoken in one room (got ${JSON.stringify(rec.rooms)})`);
  // the optional parts, each in its own shape
  for (const k of ["event", "picture", "image_prompt"])
    if (rec[k] !== undefined && !isText(rec[k])) say(`${k}: is text (got ${JSON.stringify(rec[k])})`);
  if (rec.acts !== undefined && !(listOf(rec.acts)?.every(isActNumber))) say(`acts: is a JSON array of act numbers (got ${JSON.stringify(rec.acts)})`);
  // who was there: the households with a public act at the place in its window (call 4), as the Office spells a household
  if (rec.present !== undefined && !(listOf(rec.present)?.every((h) => typeof h === "string" && h.trim() !== "")))
    say(`present: is a JSON array of household identifiers (got ${JSON.stringify(rec.present)})`);
  if (rec[SPARK_LINK] !== undefined) {
    const link = String(rec[SPARK_LINK]);
    if (!MARK_ID_RE.test(link)) say(`${SPARK_LINK}: names one spark by id, <by>/<slug> (got ${JSON.stringify(rec[SPARK_LINK])})`);
    else if (link === rec.id) say(`${SPARK_LINK}: names this spark itself`);
  }
  // a standalone spark's place is its maker's at and the locked circle (09:37)
  // none, or an empty list, is no room: an empty list is not a way out of the locked circle
  if (!(rooms?.length) && rec.extent && radiusM != null && (rec.extent.w !== 2 * radiusM || rec.extent.h !== 2 * radiusM))
    say(`a spark with no room stands in the locked circle: extent {w: ${2 * radiusM}, h: ${2 * radiusM}} about its at (a ${radiusM} m radius, the earshot; got ${JSON.stringify(rec.extent)})`);
  return out;
}

// ── THE CIRCLE SPINE (Darko 10:46) ───────────────────────────────────────────
//
// The tree is the circles, never a chosen ancestor spark. A spark stands on the
// circle it ties to and under every circle on its path. With X and Y on circle A
// and Z on reply circle B (`circle_path: [A, B]`), A's sparks are X and Y and the
// sparks below A are Z, so X and Y both show Z, and nothing is orphaned. Its own
// `parent_spark` is read apart (`ownLinkOf`) and never moves it in this tree.

/** The circle ancestry a spark ties to, top first, or null. */
export const circlePathOf = (s) => {
  const p = listOf(s?.circle_path);
  return p && p.length ? p : null;
};

/** The sparks tied to circle `circle` itself. */
export const sparksOn = (sparks, circle) => (sparks ?? []).filter((s) => circlePathOf(s)?.at(-1) === circle);

/** The sparks on circles strictly below circle `circle`, at any depth: what a spark on `circle` shows under it. */
export const sparksBelow = (sparks, circle) => (sparks ?? []).filter((s) => {
  const p = circlePathOf(s);
  return !!p && p.indexOf(circle) >= 0 && p.indexOf(circle) < p.length - 1;
});

/**
 * A spark's place from its one room's bounds, given as the list the record keeps: `[bounds]`
 * (one room per spark, 04:11Z). The bounds are absolute, `{x0, y0, x1, y1}` (the office's room
 * source, voices.threadOf), never the room's display point: `at` is their midpoint and `extent`
 * their differences. Halves and zero sides are kept as they fall (a one-speaker room is a
 * point), and nothing is padded. Returns null for anything but exactly one room's finite,
 * uninverted bounds: no room is the locked circle's case, an unavailable or guessed bound is no
 * place (never "no conversation"), and several rooms are several sparks, never combined or
 * cut to the first.
 */
export function roomsPlace(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 1) return null;
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  const { x0, y0, x1, y1 } = bounds[0] ?? {};
  if (!(num(x0) && num(y0) && num(x1) && num(y1) && x1 >= x0 && y1 >= y0)) return null;
  return { at: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, extent: { w: x1 - x0, h: y1 - y0 } };
}

/** A spark's rooms, as written (one id at most on a lawful spark), or []. */
export const roomsOf = (s) => listOf(s?.rooms) ?? [];

/** The sparks below one spark: those on circles under its own circle, or for a spark with no circle (the event's), every circle spark in its one room, and none from another room. */
export function sparkChildren(spark, sparks) {
  const own = circlePathOf(spark);
  if (own) return sparksBelow(sparks, own.at(-1)).filter((s) => s !== spark && s.id !== spark.id);
  const mine = roomsOf(spark);
  // one room's root only: a record naming several rooms (refused by the lint) gathers nothing, never an aggregate
  if (mine.length !== 1) return [];
  return (sparks ?? []).filter((s) => s !== spark && s.id !== spark.id && circlePathOf(s) && roomsOf(s).length === 1 && roomsOf(s)[0] === mine[0]);
}

/** A spark's own link, the maker's choice, or null. It names; it does not place. */
export const ownLinkOf = (s) => (s?.[SPARK_LINK] == null ? null : String(s[SPARK_LINK]));
