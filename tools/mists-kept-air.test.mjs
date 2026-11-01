// mists-kept-air.test.mjs — the old track north (WLD-6, Darko 2026-10-15 18:14–18:25): a hard-coded set of
// boxes where, from crossing 272, the Mists' walk slowdown and the wall stop are negated. Only the feet: the mist
// still stands there, sight inside it is still 20 m, and nothing is drawn or told differently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mistsAt, mistsHere, mistsHide, mistsRoad } from "./world-engine.mjs";
import { containmentChain } from "./world-verbs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const skeleton = JSON.parse(readFileSync(join(here, "..", "WORLD", "skeleton.json"), "utf8"));
const mists = skeleton.mists ?? skeleton.terrain?.mists;
const SPIRE = { x: 3850, y: -5500 };

test("from 272 the old track walks like a road, all the way from clear ground to the Spire", () => {
  const legs = [
    [{ x: 3730, y: -3340 }, { x: 3730, y: -4210 }],   // clear ground into the fringe and up to the wall's face
    [{ x: 3730, y: -4210 }, { x: 3730, y: -4800 }],   // through the face, into the wall
    [{ x: 3730, y: -4800 }, { x: 3730, y: -5340 }],   // deep in the wall
    [{ x: 3730, y: -5340 }, SPIRE],                    // the bend to the Spire
    [{ x: 3730, y: -3340 }, { x: 3730, y: -5340 }],    // the whole straight in one leg
  ];
  for (const [a, b] of legs) {
    const r = mistsRoad(a, b, 272, mists);
    assert.equal(r.refused, undefined, `${JSON.stringify(a)} → ${JSON.stringify(b)} refused`);
    assert.deepEqual([r.factor, r.deepest], [1, 0], `${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  }
});

test("before 272 the track is the Mists like anywhere else: the wall stops it", () => {
  const r = mistsRoad({ x: 3730, y: -4000 }, { x: 3730, y: -4800 }, 271, mists);
  assert.ok(r.refused, "a road into the wall before 272 must be refused");
});

test("off the track the wall still stops you, from 272 on too", () => {
  for (const [a, b] of [
    [{ x: 3730, y: -4800 }, { x: 3900, y: -4800 }],   // stepping off the track sideways, deep in the wall
    [{ x: 3500, y: -4100 }, { x: 3500, y: -4800 }],   // a parallel road 230 m west
    [{ x: 3730, y: -4800 }, { x: 3730, y: -4700 }].map((p) => ({ ...p, x: p.x + 200 })),
    [{ x: 3730, y: -3340 }, SPIRE],                    // a straight diagonal: it leaves the track inside the wall
  ]) assert.ok(mistsRoad(a, b, 280, mists).refused, `${JSON.stringify(a)} → ${JSON.stringify(b)} should be refused`);
});

test("the fringe beside the track still slows you; on the track it does not", () => {
  const off = mistsRoad({ x: 3400, y: -3700 }, { x: 3400, y: -4100 }, 272, mists);
  const on = mistsRoad({ x: 3730, y: -3700 }, { x: 3730, y: -4100 }, 272, mists);
  assert.ok(off.factor < 1, `off the track the fringe slows: ${off.factor}`);
  assert.equal(on.factor, 1);
});

test("the mist itself is unchanged on the track: it is the wall, and you see 20 m in it", () => {
  const m = mistsAt(272, mists);
  const p = { x: 3730, y: -4800 };
  assert.equal(mistsHere(p, m).inWall, true);
  assert.equal(mistsHide(p, { x: 3730, y: -4815 }, m), false, "15 m along the track: seen");
  assert.equal(mistsHide(p, { x: 3730, y: -4950 }, m), true, "150 m along the track: hidden");
  assert.equal(mistsHide({ x: 3730, y: -3900 }, SPIRE, m), true, "the Spire from clear ground: hidden");
});

test("standing within the Grounds reads the Grounds, though its anchor is past 20 m in the wall (WLD-6 c)", () => {
  const grounds = { id: "stand-in-grounds", kind: "sited", by: "x", tier: 1, body: "", at: SPIRE, extent: { w: 200, h: 200 } };
  const standing = { x: 3790, y: -5440 };   // 85 m from the anchor, inside its extent, in the wall
  assert.ok(Math.hypot(standing.x - SPIRE.x, standing.y - SPIRE.y) > mistsAt(272, mists).wallSightM);
  assert.deepEqual(containmentChain(standing, [grounds]).map((w) => w.id), ["stand-in-grounds"]);
  assert.equal(mistsRoad({ x: 3730, y: -5340 }, standing, 272, mists).refused, undefined, "and the track walks there");
});

test("box 2 covers the way to the servants' door (WLD-6/b): the road there is a road from 272, the Mists as ever before", () => {
  const door = { x: 3902, y: -5575.5 };
  const atBend = { x: 3730, y: -5340 };
  assert.equal(mistsRoad(atBend, door, 272, mists).refused, undefined, "from the bend to the door, from 272");
  assert.notEqual(mistsRoad(atBend, door, 271, mists).refused, undefined, "before 272 the wall still stops it");
});
