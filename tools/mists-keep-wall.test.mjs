// mists-keep-wall.test.mjs — a mark standing wholly behind the wall keeps no
// clear ground around itself (tools/mists-keep.mjs § standsInTheWall).
//
// The keep-out exists so the fog never covers the town. A mark that stands
// wholly in the wall is not the town's ground, and keeping 440 m clear around
// it would paint a hole in the wall where the fog stands (and let the Mists'
// creatures be kept off ground that is all fog). Given the Mists at the
// crossing, such a mark is left out; without them, the rule reads as before.

import { test } from "node:test";
import assert from "node:assert/strict";

import { mistsAt } from "./world-engine.mjs";
import { mistsKeepRects, standsInTheWall, keptByTheTown } from "./mists-keep.mjs";

const MISTS = {
  border_m: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
  schedule: [{ crossing: 10, front_m: 0, veil: 0 }, { crossing: 20, front_m: 200, veil: 0.2 }],
  fringe_m: 100, wall_sight_m: 20,
  clearings_m: [{ id: "far", x: 3000, y: 0, r_m: 300 }],
};
const sited = (id, x, y, w = 10, h = 10, by = "a-house") => ({ id, kind: "sited", by, at: { x, y }, extent: { w, h } });
const TOWN = sited("a-house/home", 0, 0, 40, 40);
const FAR = sited("a-house/far-out", 0, -2500, 400, 300);          // past the border: wholly in the wall
const FACE = sited("a-house/on-the-face", 0, -1000, 40, 40);       // straddles the border at crossing 10
const ISLE = sited("a-house/in-the-clearing", 3000, 0, 20, 20);    // in a clearing, beyond the border

test("the box test: past the border is in the wall; touching the clear ground or a clearing is not", () => {
  const m = mistsAt(10, MISTS);
  const box = (mk) => ({ minX: mk.at.x - mk.extent.w / 2, maxX: mk.at.x + mk.extent.w / 2, minY: mk.at.y - mk.extent.h / 2, maxY: mk.at.y + mk.extent.h / 2 });
  assert.equal(standsInTheWall(box(FAR), m), true);
  assert.equal(standsInTheWall(box(TOWN), m), false);
  assert.equal(standsInTheWall(box(FACE), m), false, "half on the clear ground");
  assert.equal(standsInTheWall(box(ISLE), m), false, "in a clearing");
  assert.equal(standsInTheWall(box(FAR), null), false, "no Mists, nothing stands in a wall");
});

test("KEEPS NOTHING: a mark wholly in the wall is left out of the keep; every other mark is kept exactly as before", () => {
  const marks = [TOWN, FAR, FACE, ISLE];
  const m = mistsAt(10, MISTS);
  const before = mistsKeepRects(marks, MISTS.clearings_m);
  const after = mistsKeepRects(marks, MISTS.clearings_m, undefined, { m });
  assert.equal(before.length, 4);
  assert.deepEqual(after, before.filter((r) => !(r.cx0 === -200 && r.cy0 === -2650)), "only the far mark's rectangle goes");
  assert.equal(keptByTheTown(before, 0, -2500), true, "before: the fog would be cleared over the far mark");
  assert.equal(keptByTheTown(after, 0, -2500), false, "after: the wall stands over it");
  assert.equal(keptByTheTown(after, 0, 0), true, "the town is kept");
});

test("THE FRONT MOVES: a mark the wall overtakes keeps nothing from then on", () => {
  const near = sited("a-house/near-the-edge", 0, -900, 20, 20);   // clear at 10, behind the wall by 20 (front 200 m)
  assert.equal(mistsKeepRects([near], [], undefined, { m: mistsAt(10, MISTS) }).length, 1);
  assert.equal(mistsKeepRects([near], [], undefined, { m: mistsAt(20, MISTS) }).length, 0);
});

