// garrison-valley.test.mjs: Garrison Lake's valley, the first ground_m (WLD-97
// part 3, held for Darko's look). The tree as it folds (WORLD/marks, through
// world-poc's buildWorld, the disk path) carries the-town/the-garrison-valley, and
// the heightfield the town reads lays it: the lake flat at its surface, the ground
// meeting the water at the valley floor, the old 33 m waterfall gone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorld } from "./world-poc.mjs";
import { regionAnchors, groundStands } from "./world-build.mjs";

const world = buildWorld({});
const h = world.heightfield.elevationAt;
const LAKE = world.terrain.features.find((f) => f.id === "the-garrison-lake");

test("the fold publishes the valley, and the rule stands it: water carves, so 8 holds at [7, 50]", () => {
  const v = world.marks.find((m) => m.id === "the-town/the-garrison-valley");
  assert.ok(v, "the valley is in the folded world");
  assert.equal(v.ground_m, 8);
  assert.equal(v.feature, "the-garrison-lake");
  assert.deepEqual(v.extent, { w: 920, h: 800 });
  assert.deepEqual(groundStands(v, regionAnchors(world.terrain), world.terrain),
    { ground: { lo: 8, hi: 8 }, region: "the-protected-grove", band: [7, 50], carvedBy: "the-garrison-lake" });
  assert.deepEqual(world.heightfield.landforms.map((l) => l.id), ["the-town/the-garrison-valley"], "the one landform the town has laid");
});

test("THE LAKE IS FLAT AT ITS SURFACE, and the ground meets it at the valley floor", () => {
  assert.equal(LAKE.surface_m, 7);
  for (const [x, y] of [[-1400, -2775], [-1400, -2600], [-1200, -2775], [-1600, -2775]]) assert.equal(h(x, y), 7, `${x},${y} is water`);
  // 25 m past the north, south, east and west shores
  for (const [x, y] of [[-1400, -2550], [-1400, -3000], [-1145, -2775], [-1655, -2775]]) {
    const g = h(x, y);
    assert.ok(g >= 8 && g < 12, `25 m past the shore at ${x},${y}: ${g}`);
  }
});

test("THE WATERFALL IS GONE: the river's own points through the valley and the lake stand within a metre and a half", () => {
  // Before the valley, the lake's centre read 40 m (the grove's anchor height,
  // through the lake mark's own home point) against the river's 7.1 m point: a
  // 33 m waterfall at the lake's edge. The heightfield holds the river at its
  // centreline's waypoints (between them the land interpolates, a separate and
  // older matter), so the waterfall is read at those points and the lake.
  const line = world.terrain.features.find((f) => f.id === "the-main-channel").centerline_m;
  const inValley = (p) => ((p.x + 1400) / 460) ** 2 + ((p.y + 2775) / 400) ** 2 < 1;
  const pts = [...line.filter(inValley), LAKE.center_m];
  assert.ok(pts.length >= 3, `${pts.length} river points in the valley`);
  const zs = pts.map((p) => h(p.x, p.y));
  assert.ok(Math.max(...zs) - Math.min(...zs) <= 1.5, `the river through the valley spans ${Math.min(...zs).toFixed(2)}..${Math.max(...zs).toFixed(2)} m`);
});
