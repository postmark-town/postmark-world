// landing.test.mjs — where a passage sets you down (row 68 (a), WLD-63).
//
//   node --test tools/landing.test.mjs
//
// Darko 2026-10-16 19:15 ("recs for A1 B and a"): each door lands you at a point
// fully inside the destination room, a step in from the door, never on the door's
// own square that touches or straddles the wall; a room that declares its own
// landing wins. First match wins: the room's own `entry.lands_at`, a portal
// `lands_at` written as a point, a step in from the door, and with no door at all
// (a portal far from where it leads) the room's anchor. Every landing stands at
// least LANDING_INSET_M inside its room.

import { test } from "node:test";
import assert from "node:assert/strict";

import { entryLawOf } from "./enter-exit.mjs";
import { landingOf, stepInFrom, insetInto, boundaryNearest, pointInMark, strictlyInside, portalFindings, LANDING_STEP_M, LANDING_INSET_M } from "./portals.mjs";
import { enter } from "./world-verbs.mjs";

// two rooms sharing a wall at y = 0: the hall north of it, the chamber south
const HALL = { id: "t/hall", kind: "sited", by: "t", at: { x: 0, y: -20 }, extent: { w: 40, h: 40 }, body: "The hall." };
const CHAMBER = { id: "t/chamber", kind: "sited", by: "t", at: { x: 0, y: 15 }, extent: { w: 30, h: 30 }, body: "The chamber." };
const door = (id, at, entry, extent = { w: 2, h: 2 }) => ({ id, kind: "sited", by: "t", at, extent, body: id, entry });
const byIdOf = (marks) => new Map(marks.map((m) => [m.id, m]));
// the shortest distance from a point inside a rect room to any of its walls
const wallGap = (p, r) => Math.min(p.x - (r.at.x - r.extent.w / 2), r.at.x + r.extent.w / 2 - p.x, p.y - (r.at.y - r.extent.h / 2), r.at.y + r.extent.h / 2 - p.y);

test("a paired door 2 m in from the wall: the landing is a step past the door's own edge, off its square", () => {
  const hallSide = door("t/hall-to-chamber", { x: 5, y: -2 }, { word: "neutral", into: "t/chamber", lands_at: "t/chamber-to-hall" });
  const chamberSide = door("t/chamber-to-hall", { x: 5, y: 2 }, { word: "neutral", into: "t/hall", lands_at: "t/hall-to-chamber" });
  const byId = byIdOf([HALL, CHAMBER, hallSide, chamberSide]);
  const l = landingOf(entryLawOf(hallSide), CHAMBER, byId, { room: CHAMBER, portal: hallSide });
  assert.deepEqual({ x: l.x, y: l.y, by: l.by, mark: l.lands_mark }, { x: 5, y: 2 + 1 + LANDING_STEP_M, by: "door", mark: "t/chamber-to-hall" });
  assert.ok(pointInMark(l, CHAMBER), "inside the room it enters");
  assert.ok(!pointInMark(l, chamberSide), "never on the door's own square");
  assert.ok(wallGap(l, CHAMBER) >= LANDING_INSET_M);
});

test("a door that straddles the wall: the landing steps past the half of it inside the room", () => {
  const straddle = door("t/arch", { x: -5, y: 0 }, { word: "neutral", into: "t/chamber" });
  const via = door("t/arch-north", { x: -5, y: -1.5 }, { word: "neutral", into: "t/chamber", lands_at: "t/arch" });
  const byId = byIdOf([HALL, CHAMBER, straddle, via]);
  const l = landingOf(entryLawOf(via), CHAMBER, byId, { room: CHAMBER, portal: via });
  assert.deepEqual({ x: l.x, y: l.y }, { x: -5, y: 1 + LANDING_STEP_M }, "the arch reaches 1 m into the chamber; a step past it");
  assert.ok(!pointInMark(l, straddle) && pointInMark(l, CHAMBER));
});

test("the room's own declared landing wins over the door's", () => {
  const throne = { ...CHAMBER, entry: { lands_at: { x: 0, y: 25 } } };
  const hallSide = door("t/hall-to-chamber", { x: 5, y: -2 }, { word: "neutral", into: "t/chamber", lands_at: "t/chamber-to-hall" });
  const chamberSide = door("t/chamber-to-hall", { x: 5, y: 2 }, { word: "neutral", into: "t/hall" });
  const byId = byIdOf([HALL, throne, hallSide, chamberSide]);
  const l = landingOf(entryLawOf(hallSide), throne, byId, { room: throne, portal: hallSide });
  assert.deepEqual({ x: l.x, y: l.y, by: l.by }, { x: 0, y: 25, by: "room" });
  // a room's landing naming a mark that is not there refuses by its own field
  const broken = { ...CHAMBER, entry: { lands_at: "t/nowhere" } };
  const b = landingOf(entryLawOf(hallSide), broken, byIdOf([HALL, broken, hallSide]), { room: broken, portal: hallSide });
  assert.equal(b.ok, false);
  assert.match(b.because, /^t\/chamber's lands_at: "t\/nowhere" names no mark/);
});

test("a portal lands_at written as a point is taken as written, and held a metre off the wall", () => {
  const p = door("t/p", { x: 0, y: -2 }, { word: "neutral", into: "t/chamber", lands_at: { x: 3, y: 20 } });
  const l = landingOf(entryLawOf(p), CHAMBER, byIdOf([CHAMBER, p]), { room: CHAMBER, portal: p });
  assert.deepEqual({ x: l.x, y: l.y, by: l.by, clamped: l.clamped }, { x: 3, y: 20, by: "point", clamped: false });
  const tight = door("t/q", { x: 0, y: -2 }, { word: "neutral", into: "t/chamber", lands_at: { x: 14.8, y: 29.9 } });
  const t = landingOf(entryLawOf(tight), CHAMBER, byIdOf([CHAMBER, tight]), { room: CHAMBER, portal: tight });
  assert.deepEqual({ x: t.x, y: t.y, clamped: t.clamped }, { x: 14, y: 29, clamped: true });
});

test("a portal far from where it leads, with no lands_at, sets you down at the room's anchor (a teleport)", () => {
  const wharf = door("t/wharf-portal", { x: 500, y: 500 }, { word: "neutral", into: "t/chamber" });
  const l = landingOf(entryLawOf(wharf), CHAMBER, byIdOf([CHAMBER, wharf]), { room: CHAMBER, portal: wharf });
  assert.deepEqual({ x: l.x, y: l.y, by: l.by }, { x: 0, y: 15, by: "anchor" });
});

test("a portal standing at the room, with no lands_at, is itself the door you step in from", () => {
  const p = door("t/gate", { x: 0, y: -1 }, { word: "neutral", into: "t/chamber" });
  const l = landingOf(entryLawOf(p), CHAMBER, byIdOf([CHAMBER, p]), { room: CHAMBER, portal: p });
  assert.deepEqual({ x: l.x, y: l.y, by: l.by }, { x: 0, y: LANDING_STEP_M, by: "door" }, "the gate's south edge is the wall itself; a step past it");
});

test("a ring room: the step goes along the inward normal of the nearest stretch of wall", () => {
  const ring = { id: "t/ring", kind: "sited", by: "t", at: { x: 10, y: 10 }, extent: { w: 20, h: 20 },
    points: [[0, 0], [20, 0], [20, 20], [0, 20]] };
  const d = door("t/ring-door", { x: 10, y: 1 }, { word: "neutral", into: "t/hall" });
  const b = boundaryNearest(d.at, ring);
  assert.deepEqual({ n: b.n, inside: b.inside }, { n: { x: 0, y: 1 }, inside: true });
  assert.deepEqual(stepInFrom(d, ring), { x: 10, y: 1 + 1 + LANDING_STEP_M, clamped: false });
  assert.deepEqual(insetInto({ x: 0.2, y: 10 }, ring), { x: 1, y: 10, moved: true });
});

test("through the engine: room to room, the passage's landing is a step in, and the answer says so", () => {
  const hallSide = door("t/hall-to-chamber", { x: 5, y: -2 }, { word: "neutral", into: "t/chamber", lands_at: "t/chamber-to-hall" });
  const chamberSide = door("t/chamber-to-hall", { x: 5, y: 2 }, { word: "neutral", into: "t/hall", lands_at: "t/hall-to-chamber" });
  const world = { marks: [HALL, CHAMBER, hallSide, chamberSide] };
  const a = enter({ x: 5, y: -2, name: "ann" }, "t/hall-to-chamber", world, { occupancy: new Map([["ann", ["t/hall"]]]), handle: "ann", at: 300 });
  assert.deepEqual(a.within, ["t/chamber"]);
  assert.deepEqual(a.landing, { x: 5, y: 4.5, mark: "t/chamber-to-hall", clamped: false });
  assert.deepEqual(portalFindings(world.marks).filter((f) => f.sev === "ERROR"), []);
});

// ── review-231's probes ──────────────────────────────────────────────────────

test("a lands_at that points INSIDE the room is taken as written: a point in it, or a mark in it that is not a door (the rug)", () => {
  const rug = { id: "t/rug", kind: "sited", by: "t", at: { x: -6, y: 12 }, extent: { w: 4, h: 3 }, body: "A rug." };
  const p = door("t/to-rug", { x: 0, y: -2 }, { word: "neutral", into: "t/chamber", lands_at: "t/rug" });
  const l = landingOf(entryLawOf(p), CHAMBER, byIdOf([CHAMBER, rug, p]), { room: CHAMBER, portal: p });
  assert.deepEqual({ x: l.x, y: l.y, by: l.by, mark: l.lands_mark }, { x: -6, y: 12, by: "mark", mark: "t/rug" }, "on the rug, not a step in from it");
});

test("a lands_at that points OUTSIDE the room falls through to the step in from the door, never a far wall", () => {
  const p = door("t/gate", { x: 0, y: -1 }, { word: "neutral", into: "t/chamber", lands_at: { x: 400, y: 400 } });
  const l = landingOf(entryLawOf(p), CHAMBER, byIdOf([CHAMBER, p]), { room: CHAMBER, portal: p });
  assert.deepEqual({ x: l.x, y: l.y, by: l.by }, { x: 0, y: LANDING_STEP_M, by: "door" }, "a step in from the gate, not clamped to the room's far corner");
  const far = { id: "t/far-thing", kind: "sited", by: "t", at: { x: 300, y: 300 }, extent: { w: 2, h: 2 }, body: "Far off." };
  const q = door("t/gate2", { x: 0, y: -1 }, { word: "neutral", into: "t/chamber", lands_at: "t/far-thing" });
  assert.equal(landingOf(entryLawOf(q), CHAMBER, byIdOf([CHAMBER, far, q]), { room: CHAMBER, portal: q }).by, "door");
});

test("an L-shaped ring room whose wall is nearest everywhere still sets you down strictly inside it, never on the wall", () => {
  // a 0.6 m-wide L: a metre in from its wall is outside it, so the landing falls back to a true interior point
  const L = { id: "t/ell", kind: "sited", by: "t", at: { x: 5, y: 5 }, extent: { w: 10, h: 10 },
    points: [[0, 0], [10, 0], [10, 0.6], [0.6, 0.6], [0.6, 10], [0, 10]] };
  for (const pt of [{ x: 20, y: 20 }, { x: 0.05, y: 5 }, { x: 5, y: 5 }]) {
    const at = insetInto(pt, L);
    assert.ok(pointInMark(at, L), `(${pt.x}, ${pt.y}) → (${at.x}, ${at.y}) is inside the L`);
  }
});

test("the landing-inside lint fires for a ring room that holds no interior point, and only for ring rooms", () => {
  const flat = { id: "t/flat", kind: "sited", by: "t", at: { x: 5, y: 0 }, extent: { w: 10, h: 1 }, points: [[0, 0], [5, 0], [10, 0]] };
  const p = door("t/to-flat", { x: 5, y: -2 }, { word: "neutral", into: "t/flat" });
  const found = portalFindings([flat, p]).filter((f) => f.rule === "landing-inside");
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /on or outside the ring of t\/flat/);
  assert.deepEqual(portalFindings([HALL, CHAMBER, door("t/x", { x: 5, y: -2 }, { word: "neutral", into: "t/chamber" })]).filter((f) => f.rule === "landing-inside"), [],
    "a rectangle always holds a landing");
});

// ── review-231's re-review: the corner (pointInMark counts the wall as inside) ──

test("a landing off a corner never stands on the wall: a 10×10 ring room whose own lands_at is outside it falls through to its centroid", () => {
  const ring = { id: "t/ring-room", kind: "sited", by: "t", at: { x: 5, y: 5 }, extent: { w: 10, h: 10 },
    points: [[0, 0], [10, 0], [10, 10], [0, 10]], entry: { lands_at: { x: -3, y: -3 } } };
  const p = door("t/to-ring", { x: 5, y: -2 }, { word: "neutral", into: "t/ring-room" });
  const l = landingOf(entryLawOf(p), ring, byIdOf([ring, p]), { room: ring, portal: p });
  assert.deepEqual({ x: l.x, y: l.y, by: l.by }, { x: 5, y: 5, by: "room" }, "not (0, 1), which is on the wall");
  assert.ok(strictlyInside(l, ring));
});

test("an L-shaped ring room with an anchor far outside lands strictly inside, never on its inner corner", () => {
  const L = { id: "t/ell2", kind: "sited", by: "t", at: { x: 5, y: 5 }, extent: { w: 10, h: 10 },
    points: [[0, 0], [10, 0], [10, 3.5], [2.5, 3.5], [2.5, 10], [0, 10]] };
  for (const pt of [{ x: -50, y: -50 }, { x: 2.5, y: 3.5 }, { x: 50, y: 50 }]) {
    const at = insetInto(pt, L);
    assert.ok(strictlyInside(at, L), `(${pt.x}, ${pt.y}) → (${at.x}, ${at.y}) is off the wall`);
  }
  assert.equal(strictlyInside({ x: 2.5, y: 3.5 }, L), false, "the inner corner itself is on the wall");
  assert.equal(pointInMark({ x: 0, y: 1 }, L), true, "and pointInMark counts a point on a wall as inside, which is why strictness is asked");
  assert.equal(strictlyInside({ x: 0, y: 1 }, L), false);
});

test("the landing-inside lint reads a landing on the wall as outside it (a ring with no inside fires it)", () => {
  const sliver = { id: "t/sliver", kind: "sited", by: "t", at: { x: 5, y: 0 }, extent: { w: 10, h: 1 }, points: [[0, 0], [10, 0], [10, 0], [0, 0]] };
  const p = door("t/to-sliver", { x: 5, y: -2 }, { word: "neutral", into: "t/sliver" });
  const found = portalFindings([sliver, p]).filter((f) => f.rule === "landing-inside");
  assert.equal(found.length, 1, "a landing that can only stand on the ring's line is refused by name");
});
