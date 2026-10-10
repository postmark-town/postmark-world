#!/usr/bin/env node
// mists-walk.test.mjs — the Mists slow the walk (POS-468). Run: node --test tools/mists-walk.test.mjs
//
// The laws this holds:
//   • the stride falls with depth into the fringe, to nothing at the wall's face,
//     at every crossing; the thicker the day's mist, the earlier it bites;
//   • no road ends in the wall, crosses it, or starts in it: there is no creeping
//     in by short legs;
//   • the mist is read once at the declare and stamped on the leg as its stride,
//     so a road through the fringe takes longer as the mist thickens, a road that
//     keeps clear of it is untouched, and before the Mists nothing changes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mistsAt, mistsRoad, mistsStride, MISTS_STRIDE_FLOOR, MISTS_WALL_STRIDE } from "./world-engine.mjs";
import { formatDeparture, parseWalkLedger, positionAt } from "./walk.mjs";
import { previewWalkLeg } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKELETON = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
const MISTS = SKELETON.mists;
const FIRST = MISTS.schedule[0].crossing, LAST = MISTS.schedule.at(-1).crossing;
const PACE = 60;

// a road north from the town toward the north wall; the wall's face at a crossing
const faceN = (c) => mistsAt(c, MISTS).clear.minY;
const fringeTop = (c) => faceN(c) + MISTS.fringe_m;     // where the fringe begins, coming from the town
const FROM = { x: 0, y: -2000 };
const roadTo = (y) => ({ x: 0, y });

test("THE CURVE: 1 at the fringe's outer edge, 0 at the wall's face, at every density; falling with depth and with density", () => {
  for (const d of [0, 0.3, 0.55, 0.767, 0.95, 1]) {
    assert.equal(mistsStride(0, d), 1);
    assert.equal(mistsStride(1, d), 0);
    let last = 1;
    for (let s = 0.05; s < 1; s += 0.05) {
      const v = mistsStride(s, d);
      assert.ok(v <= last, `deeper is never faster (d ${d}, s ${s.toFixed(2)})`);
      last = v;
    }
  }
  for (let s = 0.05; s < 1; s += 0.05)
    for (const [a, b] of [[0.55, 0.767], [0.767, 0.95]])
      assert.ok(mistsStride(s, b) < mistsStride(s, a), `thicker bites earlier (s ${s.toFixed(2)}, ${a} → ${b})`);
});

test("BEFORE THE MISTS no road is read at all, and the leg and its line are what they always were", () => {
  assert.equal(mistsRoad(FROM, roadTo(-4590), FIRST - 1, MISTS), null);
  const line = formatDeparture({ handle: "a", from: FROM, toward: roadTo(-3000), at: FIRST - 1, iso: "2026-10-11T00:00:00.000Z", pace: PACE });
  assert.equal(line, "- 2026-10-11T00:00:00.000Z · a · from 0,-2000 · toward 0,-3000 · at 243.0000 · pace 60", "a whole-number pace prints as it did");
  const at = FIRST - 1 + 0.5;
  assert.deepEqual(previewWalkLeg({ from: FROM, toward: roadTo(-4590), skeleton: SKELETON, paceKm: PACE, at }),
    previewWalkLeg({ from: FROM, toward: roadTo(-4590), skeleton: { ...SKELETON, mists: undefined }, paceKm: PACE, at }));
});

test("A ROAD THAT KEEPS CLEAR of the fringe is untouched by the Mists", () => {
  for (const c of [FIRST, LAST]) {
    const end = roadTo(fringeTop(c) + 5);                          // stops 5 m short of the fringe
    assert.deepEqual(mistsRoad(FROM, end, c, MISTS), { factor: 1, deepest: 0 });
  }
});

test("A ROAD INTO THE FRINGE is slower the deeper it goes, and the same road is slower at the last crossing than at the first", () => {
  const c = FIRST;
  const shallow = mistsRoad(FROM, roadTo(fringeTop(c) - 100), c, MISTS).factor;
  const deep = mistsRoad(FROM, roadTo(fringeTop(c) - 350), c, MISTS).factor;
  assert.ok(deep < shallow && shallow < 1, `deeper is slower (${deep} < ${shallow} < 1)`);
  // one road that stays in the fringe on both days: end 50 m short of the LAST crossing's face
  const end = roadTo(faceN(LAST) + 50);
  const early = mistsRoad(FROM, end, FIRST, MISTS), late = mistsRoad(FROM, end, LAST, MISTS);
  assert.ok(!early.refused && !late.refused);
  assert.ok(late.factor < early.factor, `the walk takes longer at ${LAST} than at ${FIRST} (${late.factor} < ${early.factor})`);
  // and the stamped stride is what the leg walks at: its ETA is longer by exactly the factor
  const at = LAST + 0.1;
  const open = positionAt({ from: FROM, toward: end, at, pace: PACE }, at);
  const slowed = positionAt({ from: FROM, toward: end, at, pace: PACE * late.factor }, at);
  assert.ok(Math.abs(slowed.etaCrossings - open.etaCrossings / late.factor) <= 0.02 + 0.01 * slowed.etaCrossings);
});

test("NEAR THE FACE the stride goes to (almost) nothing: a road across the fringe to a metre from the wall crawls", () => {
  const r = mistsRoad(roadTo(fringeTop(LAST)), roadTo(faceN(LAST) + 1), LAST, MISTS);
  assert.ok(!r.refused);
  assert.ok(r.factor < 0.01, `a metre from the face the leg crawls (factor ${r.factor})`);
  assert.ok(r.factor >= MISTS_STRIDE_FLOOR, "and never to a pace nobody can divide by");
});

test("NO ROAD INTO THE WALL: one that ends in it, ends on its face, crosses it, or starts in it and goes deeper is refused, naming where it meets the wall", () => {
  for (const c of [FIRST, LAST]) {
    const into = mistsRoad(FROM, roadTo(faceN(c) - 100), c, MISTS);
    assert.ok(into.refused, `ends in the wall at ${c}`);
    assert.equal(into.refused.y, Math.round(faceN(c)), "it names the face it meets");
    assert.ok(mistsRoad(FROM, roadTo(faceN(c)), c, MISTS).refused, `ends on the face at ${c}`);
    const k = mistsAt(c, MISTS).clearings[0];
    assert.ok(mistsRoad(FROM, { x: k.x, y: k.y }, c, MISTS).refused, `crosses the wall to a clearing at ${c}`);
    assert.ok(mistsRoad(roadTo(faceN(c) - 100), roadTo(faceN(c) - 400), c, MISTS).refused, `starts in the wall and goes deeper at ${c}`);
  }
});

test("THE STAMPED STRIDE survives the line: a slow pace is printed to four places and read back, never rounded to the legacy constant", () => {
  const slow = PACE * MISTS_STRIDE_FLOOR;                          // 0.006 km a crossing
  const line = formatDeparture({ handle: "a", from: FROM, toward: roadTo(-3000), at: LAST, iso: "2026-10-31T00:00:00.000Z", pace: slow });
  assert.match(line, / · pace 0\.006$/);
  const [d] = parseWalkLedger(line).departures;
  assert.equal(d.pace, 0.006);
  const p = positionAt(d, LAST + 1);
  assert.ok(p.travelledM <= 7, `it crawls at its own stride (${p.travelledM} m in a crossing), not the legacy 15 km`);
});

test("THE PAGE'S PREVIEW reads the same road: slowed in the fringe, and no walk at all into the wall", () => {
  const at = LAST + 0.5;
  const end = roadTo(faceN(LAST) + 50);
  const leg = previewWalkLeg({ from: FROM, toward: end, skeleton: SKELETON, paceKm: PACE, at });
  const road = mistsRoad(FROM, end, LAST, MISTS);
  assert.equal(leg.paceKm, PACE * road.factor);
  assert.deepEqual(leg.mist, { factor: road.factor, deepest: road.deepest });
  const wall = previewWalkLeg({ from: FROM, toward: roadTo(faceN(LAST) - 100), skeleton: SKELETON, paceKm: PACE, at });
  assert.ok(wall.mistRefused);
  assert.equal(wall.distanceM, 0);
});

test("A STOP is never refused: standing still goes nowhere, even where the wall has come", () => {
  for (const c of [FIRST, LAST]) {
    const inWall = roadTo(faceN(c) - 100);
    assert.deepEqual(mistsRoad(inWall, inWall, c, MISTS), { factor: 1, deepest: 0 });
  }
});

test("NOT A WAY ACROSS: from Pando's clearing, a road to the Origin and a road to the far south-west clearing are both refused at the wall; a road inside Pando walks", () => {
  const byId = (id) => mistsAt(LAST, MISTS).clearings.find((k) => k.id === id);
  const pando = byId("pando"), sw = byId("the-far-southwest");
  assert.ok(pando && sw, "both clearings stand on the record");
  for (const c of [FIRST, LAST]) {
    const here = { x: pando.x, y: pando.y };
    assert.ok(mistsRoad(here, { x: 0, y: 0 }, c, MISTS).refused, `Pando → the Origin at ${c}`);
    assert.ok(mistsRoad(here, { x: sw.x, y: sw.y }, c, MISTS).refused, `Pando → the far south-west clearing at ${c}`);
    assert.ok(mistsRoad({ x: sw.x, y: sw.y }, here, c, MISTS).refused, `and back, at ${c}`);
    const inside = mistsRoad(here, { x: pando.x + 1000, y: pando.y }, c, MISTS);
    assert.deepEqual(inside, { factor: 1, deepest: 0 }, `a road inside Pando, clear of its fringe, walks open at ${c}`);
  }
});

test("A ROAD ALONG THE FACE for kilometres crawls the whole way, at the floor", () => {
  const y = faceN(LAST) + 0.3;
  const r = mistsRoad({ x: -3000, y }, { x: 4000, y }, LAST, MISTS);
  assert.ok(!r.refused && r.factor <= 0.001);
});

test("THE WALK OUT: a walker the wall has overtaken may walk straight out, slowly; any road from inside that goes deeper, runs along, or ends in the wall is refused", () => {
  const caught = { x: 0, y: -4700 };                                   // 100 m behind the north face at the first crossing
  assert.equal(faceN(FIRST), -4600, "the face this test stands behind");
  const out = mistsRoad(caught, { x: 0, y: 0 }, FIRST, MISTS);
  assert.ok(!out.refused && out.walk_out, "toward the Origin: allowed");
  assert.ok(out.factor < 1, `and slow (factor ${out.factor})`);
  const deeper = mistsRoad(caught, { x: 0, y: -5000 }, FIRST, MISTS);
  assert.deepEqual(deeper.refused, { x: 0, y: -4700 }, "toward (0, −5000): refused where it stands");
  assert.ok(mistsRoad(caught, { x: 300, y: -4700 }, FIRST, MISTS).refused, "along the wall: refused (it ends in the wall)");
  assert.ok(mistsRoad(caught, { x: 0, y: -4650 }, FIRST, MISTS).refused, "a step that stays in the wall: refused");
  const k = mistsAt(FIRST, MISTS).clearings.find((c) => c.id === "pando");
  assert.ok(mistsRoad(caught, { x: k.x, y: k.y }, FIRST, MISTS).refused, "off through the wall toward Pando: refused (it goes deeper first)");
  // inside the wall the stride is MISTS_WALL_STRIDE; out of the fringe it is the open road: a 100 m wall plus the 400 m fringe
  const short = mistsRoad(caught, { x: 0, y: -4100 }, FIRST, MISTS);   // 100 m of wall, 400 m of fringe, 100 m clear
  assert.ok(short.factor > MISTS_WALL_STRIDE * 0.9 && short.factor < 0.6, `a short walk out is mostly wall and fringe (factor ${short.factor})`);
  // the wall's own stride, exactly: 200 m more of wall costs 200 / MISTS_WALL_STRIDE metres of open road
  const end = { x: 0, y: -4100 };
  const time = (from) => { const r = mistsRoad(from, end, FIRST, MISTS); return Math.hypot(end.x - from.x, end.y - from.y) / r.factor; };
  const extra = time({ x: 0, y: -4900 }) - time(caught);
  assert.ok(Math.abs(extra - 200 / MISTS_WALL_STRIDE) < 0.02 * (200 / MISTS_WALL_STRIDE), `200 m of wall walks as ${extra.toFixed(1)} m of open road (expected ${(200 / MISTS_WALL_STRIDE).toFixed(1)})`);
});
