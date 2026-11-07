// sight-scoped.test.mjs — sight is scoped to the interior of the innermost mark you have entered.
//
//   node --test tools/sight-scoped.test.mjs
//
// RULED by Darko 2026-10-16 19:52–19:53 (WLD-5): "when you have entered a mark out
// in the world, a non-dungeon regular mark … your line of sight [is] scoped to the
// interior of the mark you are within. When you are outside, you are in Let There Be
// Light, and therefore all of the … marks in Let There Be Light are candidates." And
// "all marks should follow this principle." The entered mark and everything above it
// are the frame, told in `within`, never a seat. Found in the playground: in the
// Spire's Red Stair Hall, 9 of the 12 seats went to containers and outdoor courts, so
// the room's own doors were never drawn.
//
// Every world is a REAL fold of synthetic marks, with big outdoor courts built to
// OUTRANK the room's small furniture, so the frame is what is being tested.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fold } from "./marks-fold.mjs";
import { buildHeightfield, fieldOfView } from "./world-engine.mjs";
import { openYourEyes, sightFrameOf, enter, standpointSight } from "./world-verbs.mjs";

const flatHF = buildHeightfield({ controlPoints: [{ x: 0, y: 0, h: 5 }, { x: 10000, y: 0, h: 5 }, { x: 0, y: 10000, h: 5 }, { x: -10000, y: 0, h: 5 }] });
const light = { dawn_pole_m: { x: 5000, y: -5000 }, dark_pole_m: { x: -5000, y: 5000 } };

const M = (id, x, y, w, h, extra = {}) => ({ id, by: id.split("/")[0], household: id.split("/")[0], kind: "sited", tier: "market",
  at: { x, y }, extent: { w, h }, date: "2026-09-01T00:00:00Z", body: "b", ...extra });
const ROOT = M("the-town/let-there-be-light", 0, 0, 60000, 60000);
// the Grounds, the Spire (a dungeon) inside them, and the Red Stair Hall inside it
const GROUNDS = M("s/grounds", 0, 0, 500, 400);
const SPIRE = M("s/spire", 0, 0, 240, 180, { class: "dungeon" });
const HALL = M("s/red-stair-hall", -20, -40, 60, 40);
const IN_HALL = [
  M("s/hall-to-rose", -5, -22, 2, 2, { entry: { word: "neutral", into: "s/rose-hall" } }),
  M("s/hall-to-blue", -48, -45, 2, 2, { entry: { word: "neutral", into: "s/blue-room" } }),
  M("s/hall-benches", -40, -50, 8, 2),
  M("s/hall-rug", -20, -40, 10, 6),
  M("s/the-red-stair", -5, -50, 6, 10, { class: "stairs" }),
  // a door SET IN the hall's west wall (x = -50), straddling it, its anchor just inside:
  // the Chapel front-door shape, the room's to see though not wholly inside it (review-233)
  M("s/hall-west-door", -49.5, -38, 2, 2, { entry: { word: "neutral", into: "s/blue-room" } }),
];
const ROSE = M("s/rose-hall", -5, -5, 40, 30);
// the Blue Room shares the hall's west wall (x = -50), so the west door straddles into it
const BLUE = M("s/blue-room", -60, -45, 20, 20);
// outdoor courts in the Grounds, big and near: they outrank a 2×2 door 40 m off
const COURTS = Array.from({ length: 10 }, (_, i) => M(`c${i}/court`, -140 + i * 30, 150, 28, 28, { weight: 50 }));
// an ordinary house on open ground, with a chair in it, and a neighbour's stall outside
const HOUSE = M("h/house", 1000, 0, 20, 20);
const CHAIR = M("h/chair", 1002, 2, 1, 1);
const STALL = M("n/stall", 1040, 0, 30, 30, { weight: 50 });
// a far mountain on the horizon: told to the open world, never inside a room you entered
const PEAK = M("p/the-far-peak", 4000, -4000, 900, 900, { far: true });

function worldOf(marks) {
  const f = fold({ marks, terrain: { features: [] }, stakes: [], tick: 1, households: {} });
  assert.deepEqual(f.errors, [], "the fixture folds clean");
  return { ...f, terrain: { far_features: [], features: [], elevation: {} }, heightfield: flatHF, light, fogCeilingM: 22 };
}
const shown = (fov) => fov.carried.map((c) => c.id);
const W = () => worldOf([ROOT, GROUNDS, SPIRE, HALL, ...IN_HALL, ROSE, BLUE, ...COURTS, HOUSE, CHAIR, STALL, PEAK]);
const IN_THE_HALL = { x: -10, y: -35, name: "visitor" };

test("in the Red Stair Hall, the room's doors, benches, rug and stair take the seats, and no container or outdoor court does", () => {
  const w = W();
  const { fov } = openYourEyes(IN_THE_HALL, w, { entered: ["s/grounds", "s/spire", "s/red-stair-hall"] });
  assert.deepEqual(new Set(shown(fov)), new Set(IN_HALL.map((m) => m.id)), "the room's interior, all of it, and nothing else");
  for (const id of ["s/grounds", "s/spire", "s/red-stair-hall", "s/rose-hall", "s/blue-room", "c0/court", "h/house"])
    assert.equal(shown(fov).includes(id), false, `${id} is the frame or outside it`);
  assert.ok(shown(fov).includes("s/hall-west-door"), "the door set in the wall is the room's, by its anchor");
});

test("the horizon is the open world's: told unentered, never inside a room you entered", () => {
  const w = W();
  const far = (fov) => (fov.far ?? []).map((f) => f.id);
  assert.ok(far(openYourEyes({ x: 0, y: 160, name: "spectator" }, w).fov).includes("p/the-far-peak"), "outside, the peak is on the horizon");
  assert.deepEqual(far(openYourEyes(IN_THE_HALL, w, { entered: ["s/grounds", "s/spire", "s/red-stair-hall"] }).fov), [], "in the hall, no horizon");
});

test("the frame counts a mark by its anchor, as containerOf does, and never the room or what holds it", () => {
  const w = W(), byId = new Map(w.marks.map((m) => [m.id, m]));
  const frame = sightFrameOf(w, ["s/grounds", "s/spire", "s/red-stair-hall"], IN_THE_HALL);
  assert.equal(frame(byId.get("s/hall-west-door")), true, "straddling the wall, anchored inside");
  for (const id of ["s/red-stair-hall", "s/spire", "s/grounds", "the-town/let-there-be-light"]) assert.equal(frame(byId.get(id)), false, `${id} is the frame`);
});

test("before the fix the courts took the seats: unscoped, the far door loses to them (the finding, kept as a falsifier)", () => {
  const fov = fieldOfView(IN_THE_HALL, W(), {});
  assert.ok(shown(fov).some((id) => id.endsWith("/court")), "the courts outrank the room's furniture");
  assert.equal(shown(fov).includes("s/hall-to-blue"), false);
});

test("entering an ordinary house scopes you to its interior; stepping out restores the world", () => {
  const w = W();
  const at = { x: 1001, y: 1, name: "ann" };
  const inside = openYourEyes(at, w, { entered: ["h/house"] }).fov;
  assert.deepEqual(shown(inside), ["h/chair"]);
  const out = openYourEyes(at, w, { entered: [] }).fov;
  assert.ok(shown(out).includes("n/stall") && shown(out).includes("h/house"), "outside, the house and the neighbour's stall are seen again");
  assert.deepEqual(out, openYourEyes(at, w).fov, "and the read is the unentered read, field for field");
});

test("a spectator, who has entered nothing, reads exactly as before", () => {
  const w = W();
  for (const at of [IN_THE_HALL, { x: 1001, y: 1, name: "spectator" }, { x: 0, y: 160, name: "spectator" }])
    // openYourEyes adds the containment spine (`within`) to the fov; everything else is the engine's, untouched
    { const { within, ...seen } = openYourEyes(at, w).fov; assert.deepEqual(seen, fieldOfView(at, w, {}), `${at.x},${at.y}`); }
  assert.equal(sightFrameOf(w, []), null);
  assert.equal(sightFrameOf(w, null), null);
});

test("LAW STILL REACHES THROUGH `within`: inside the house, the containment spine still names the world root and the house", () => {
  const w = W();
  const at = { x: 1001, y: 1, name: "ann" };
  const inside = openYourEyes(at, w, { entered: ["h/house"] });
  const unentered = openYourEyes(at, w);
  // the office's law reach is the spine (`within`: you are inside the thing) plus the seats
  // (`nearby`: you can see it); the constitution and every containing mark's terms ride the spine
  assert.deepEqual(inside.radial.within.map((m) => m.id ?? m), unentered.radial.within.map((m) => m.id ?? m),
    "scoping sight never touches the containment spine");
  const spine = inside.radial.within.map((m) => m.id ?? m);
  assert.ok(spine.includes("the-town/let-there-be-light") && spine.includes("h/house"), `the spine: ${spine.join(" › ")}`);
});

test("the frame is the innermost entered mark the body stands in; a stack it has stepped out of entirely reads as nothing entered", () => {
  const w = W();
  const outside = { x: 200, y: 160, name: "ann" };
  assert.deepEqual(openYourEyes(outside, w, { entered: ["h/house"] }).fov, openYourEyes(outside, w).fov);
  // standing in the Spire with the hall entered but outside it: the Spire, the next mark out that holds you, frames
  const inSpireNotHall = { x: 60, y: 40, name: "ann" };
  const frame = sightFrameOf(w, ["s/grounds", "s/spire", "s/red-stair-hall"], inSpireNotHall);
  assert.equal(frame(HALL) && frame(ROSE), true, "the Spire's rooms are candidates");
  assert.equal(frame(COURTS[0]), false);
});

test("through the reads' own path (standpointSight → scopeWorld → hiddenFrom): the wall door is the hall's to see and to enter, and hidden from the Blue Room", () => {
  const w = W();
  const inHall = new Map([["visitor", ["s/grounds", "s/spire", "s/red-stair-hall"]]]);
  const inBlue = new Map([["visitor", ["s/grounds", "s/spire", "s/blue-room"]]]);
  const seen = (occ) => new Set(standpointSight(w, { occupancy: occ, handle: "visitor" }).marks.map((m) => m.id));
  assert.ok(seen(inHall).has("s/hall-west-door"), "the dungeon rule no longer hides a door set in the hall's wall from inside the hall");
  assert.equal(seen(inBlue).has("s/hall-west-door"), false, "from the Blue Room it is the hall's door, hidden");
  const a = enter(IN_THE_HALL, "s/hall-west-door", w, { occupancy: inHall, handle: "visitor", at: 300 });
  assert.equal(a.error, undefined, "enter finds it from inside its room (A1's consistency)");
  assert.equal(a.into, "s/blue-room");
  assert.equal(enter({ x: -60, y: -45, name: "visitor" }, "s/hall-west-door", w, { occupancy: inBlue, handle: "visitor" }).error,
    "no mark 's/hall-west-door' to enter", "and from the Blue Room it is no mark at all");
});

test("a door anchored exactly on a wall two rooms share belongs to ONE room, the one portalsIn lists it under", async () => {
  const { roomHolds, portalsIn } = await import("./portals.mjs");
  const onTheWall = M("s/on-the-wall", -50, -40, 2, 2, { entry: { word: "neutral", into: "s/blue-room" } });
  const w = worldOf([ROOT, GROUNDS, SPIRE, HALL, BLUE, onTheWall]);
  const byId = new Map(w.marks.map((m) => [m.id, m]));
  const holders = ["s/red-stair-hall", "s/blue-room"].filter((r) => roomHolds(byId.get(r), byId.get("s/on-the-wall"), w.marks));
  assert.equal(holders.length, 1, `held by exactly one room, got ${holders.join(", ")}`);
  assert.ok(portalsIn(holders[0], w.marks).some((p) => p.id === "s/on-the-wall"), "the same room portalsIn lists it under");
});
