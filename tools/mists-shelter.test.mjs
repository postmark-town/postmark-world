// mists-shelter.test.mjs — AN ENTERED MARK IS SHELTER (Darko 2026-10-15). Within a mark a walker has entered (on
// their enter stack), the Mists neither slow the walk nor stop it, and nothing inside the mark is cut from their
// reads. It follows entering, never standing: without the stack every answer is the old one.
// Run: node --test tools/mists-shelter.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHeightfield, fieldOfView, mistsAt, mistsHere, mistsRoad, DIALS } from "./world-engine.mjs";
import { airLine, openYourEyes, orient, shelterOf } from "./world-verbs.mjs";

const flatAt = (h) => buildHeightfield({ controlPoints: [{ x: 0, y: 0, h }, { x: 10000, y: 0, h }, { x: 0, y: 10000, h }, { x: -10000, y: 0, h }] });
const light = { dawn_pole_m: { x: 5000, y: -5000 }, dark_pole_m: { x: -5000, y: 5000 } };
const CLEAR = { ...DIALS, fog_base: 0, fog_swing: 0 };
// a 2 km map; the Mists arrive at crossing 10
const MISTS = {
  border_m: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
  fringe_m: 300, wall_sight_m: 20, density: { from: 0.9, to: 0.9 },
  schedule: [{ crossing: 10, front_m: 0, veil: 0.4 }],
};
const terrainWith = (mists) => ({ mists, far_features: [] });
const worldOf = (marks) => ({ marks, terrain: terrainWith(MISTS), heightfield: flatAt(5), light, fogCeilingM: 22 });

// THE GROUNDS: a sited mark out past the north border, in the wall, with a tower inside it
const GROUNDS = { id: "beyond/grounds", kind: "sited", household: "beyond", at: { x: 0, y: -1150 }, extent: { w: 300, h: 300 }, weight: 3, top_m: 2 };
const TOWER = { id: "beyond/tower", kind: "sited", household: "beyond", at: { x: 60, y: -1220 }, extent: { w: 10, h: 10 }, weight: 5, top_m: 30 };
const OUTSIDE = { id: "beyond/cairn", kind: "sited", household: "beyond", at: { x: 400, y: -1150 }, extent: { w: 4, h: 4 }, weight: 1, top_m: 3 };
const STAND = { x: 0, y: -1100 };   // inside the Grounds, in the wall, 130 m from the tower
const shown = (fov) => fov.carried.map((m) => m.id);
const marks = [GROUNDS, TOWER, OUTSIDE];

test("the ground is the wall, and the tower is past arm's reach: without shelter it is hidden", () => {
  const m = mistsAt(10, MISTS);
  assert.equal(mistsHere(STAND, m).inWall, true);
  assert.ok(Math.hypot(TOWER.at.x - STAND.x, TOWER.at.y - STAND.y) > m.wallSightM);
  assert.ok(!shown(fieldOfView(STAND, worldOf(marks), { crossing: 10, dials: CLEAR })).includes("beyond/tower"));
});

test("entered, the Grounds hold no mist for your reads: the tower inside is seen", () => {
  const { fov } = openYourEyes(STAND, worldOf(marks), { crossing: 10, dials: CLEAR, entered: ["beyond/grounds"] });
  assert.ok(shown(fov).includes("beyond/tower"));
});

test("shelter is the entered mark only: a mark outside it is still behind the wall", () => {
  const { fov } = openYourEyes(STAND, worldOf(marks), { crossing: 10, dials: CLEAR, entered: ["beyond/grounds"] });
  assert.ok(!shown(fov).includes("beyond/cairn"));
});

test("it follows entering, never standing: no stack, the old answer, field for field", () => {
  const w = worldOf(marks);
  for (const entered of [null, [], ["not/a-mark"]]) {
    assert.deepEqual(openYourEyes(STAND, w, { crossing: 10, dials: CLEAR, entered }).fov, openYourEyes(STAND, w, { crossing: 10, dials: CLEAR }).fov);
  }
});

test("entered, a walk inside the Grounds is the open road; the same walk unentered is refused", () => {
  const w = worldOf(marks);
  const a = { x: -50, y: -1100 }, b = { x: 60, y: -1250 };
  assert.ok(mistsRoad(a, b, 10, MISTS).refused, "unentered: the wall stops it");
  const r = mistsRoad(a, b, 10, MISTS, { shelter: shelterOf(w, ["beyond/grounds"]) });
  assert.equal(r.refused, undefined);
  assert.deepEqual([r.factor, r.deepest], [1, 0]);
});

test("entered, a walk that leaves the Grounds into the wall is still refused", () => {
  const r = mistsRoad({ x: 0, y: -1100 }, { x: 400, y: -1100 }, 10, MISTS, { shelter: shelterOf(worldOf(marks), ["beyond/grounds"]) });
  assert.ok(r.refused);
});

test("no shelter, no change: every road reads exactly as before", () => {
  const roads = [[{ x: 0, y: 0 }, { x: 0, y: -900 }], [{ x: 0, y: -900 }, { x: 0, y: -1100 }], [{ x: 200, y: 600 }, { x: -300, y: 900 }]];
  for (const [a, b] of roads) {
    assert.deepEqual(mistsRoad(a, b, 10, MISTS, { shelter: null }), mistsRoad(a, b, 10, MISTS));
    assert.deepEqual(mistsRoad(a, b, 10, MISTS, { shelter: shelterOf(worldOf(marks), []) }), mistsRoad(a, b, 10, MISTS));
  }
});

test("the air line says so: entered, the wall is around you but hides nothing; unentered, arm's reach as ever", () => {
  const w = worldOf(marks);
  const inside = orient(STAND, w, { crossing: 10, dials: CLEAR, entered: ["beyond/grounds"] });
  const bare = orient(STAND, w, { crossing: 10, dials: CLEAR });
  assert.equal(inside.you.sheltered, true);
  assert.match(airLine(inside.you, 10), /hides nothing from you/);
  assert.equal("sheltered" in bare.you, false);
  assert.match(airLine(bare.you, 10), /nothing past arm's reach/);
  assert.deepEqual(orient(STAND, w, { crossing: 10, dials: CLEAR, entered: ["beyond/cairn"] }), bare, "an entered mark you are not standing in shelters nothing here");
});

// review-shelter #1/#2 (2026-10-15): shelter is the entered mark you STAND in, and the telling says so
test("entered but standing outside the mark: nothing it holds is uncovered, field for field", () => {
  const w = worldOf(marks);
  const outside = { x: 0, y: -980 };   // short of the border, outside the Grounds
  assert.deepEqual(openYourEyes(outside, w, { crossing: 10, dials: CLEAR, entered: ["beyond/grounds"] }).fov,
    openYourEyes(outside, w, { crossing: 10, dials: CLEAR }).fov);
  // standing in the Grounds with only the cairn entered: the cairn, 400 m off in the wall, stays hidden
  const { fov } = openYourEyes(STAND, w, { crossing: 10, dials: CLEAR, entered: ["beyond/cairn"] });
  assert.ok(!shown(fov).includes("beyond/cairn"));
  assert.ok(!shown(fov).includes("beyond/tower"));
  assert.equal(shelterOf(w, ["beyond/grounds"], outside), null, "the standpoint's own test: no entered mark holds it");
});

test("walking IN from outside is the Mists as ever, entered or not: shelter is only for a road that starts inside", () => {
  const sh = shelterOf(worldOf(marks), ["beyond/grounds"]);
  for (const [a, b] of [[{ x: 0, y: -950 }, { x: 0, y: -1010 }], [{ x: 0, y: -900 }, { x: 0, y: -1100 }], [{ x: 200, y: -700 }, { x: 0, y: -1150 }]]) {
    assert.deepEqual(mistsRoad(a, b, 10, MISTS, { shelter: sh }), mistsRoad(a, b, 10, MISTS), `${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  }
});

test("the eyes' telling: sheltered in the wall, the ruled line, never 'nothing past it'; unentered, as ever", () => {
  const w = worldOf(marks);
  const inside = openYourEyes(STAND, w, { crossing: 10, dials: CLEAR, entered: ["beyond/grounds"] });
  assert.equal(inside.fov.mists.sheltered, true);
  assert.match(inside.tell(), /You stand inside the mist, but within the mark you have entered it hides nothing from you\./);
  assert.doesNotMatch(inside.tell(), /nothing past it/);
  const bare = openYourEyes(STAND, w, { crossing: 10, dials: CLEAR });
  assert.equal("sheltered" in bare.fov.mists, false);
  assert.match(bare.tell(), /You can see about \d+ m, and nothing past it\./);
});

test("the fringe, sheltered: the telling and the air line say the haze hides nothing within the mark", () => {
  const ROOM = { id: "near/room", kind: "sited", at: { x: 0, y: -850 }, extent: { w: 60, h: 60 } };
  const w = worldOf([...marks, ROOM]);
  const p = { x: 0, y: -850 };   // 150 m in from the border: the fringe
  const eyes = openYourEyes(p, w, { crossing: 10, dials: CLEAR, entered: ["near/room"] });
  assert.equal(eyes.fov.mists.in_wall, false);
  assert.ok(eyes.fov.mists.thickness > 0);
  assert.match(eyes.tell(), /its haze is on you, but within the mark you have entered it hides nothing from you\./);
  assert.match(airLine(orient(p, w, { crossing: 10, dials: CLEAR, entered: ["near/room"] }).you, 10), /hides nothing from you/);
  assert.match(openYourEyes(p, w, { crossing: 10, dials: CLEAR }).tell(), /nothing past the mist can be seen/);
});
