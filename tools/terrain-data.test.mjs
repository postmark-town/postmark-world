// terrain-data.test.mjs: elevation moved from code into WORLD/skeleton.json
// (WLD-97 part 1). The region anchors, the river's fall and the lakes' surfaces
// are dials in the skeleton now; tools/world-build.mjs reads them.
//
// The move must not move the land. So this file carries the code as it stood
// before the move (REGION_ANCHORS and H_UP = 8, verbatim from world main
// 676eefe7) and asserts the assembled heightfield agrees with it bit for bit on
// a fixed grid over the whole town.
//
// One difference is deliberate and pinned on its own: three of the old anchors
// were not the midpoint of their band (37, 8 and 17 against 37.5, 8.5 and
// 17.5), and an anchor's height is now derived from its band, never typed
// twice. The grid test compares against the old constants with those three trued
// to their midpoints; the next test pins that they are the only three, and by
// exactly half a metre.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildHeightfield } from "./world-engine.mjs";
import { assembleWorld, regionAnchors, waterControlPoints, SEA_DATUM } from "./world-build.mjs";
import { isSited } from "./mark-kind.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKELETON = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
const WORLD_STATE = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const fresh = () => JSON.parse(JSON.stringify(SKELETON));

// ── THE CODE BEFORE THE MOVE, kept verbatim as the oracle ───────────────────
const OLD_REGION_ANCHORS = [
  { id: "the-town-centre",                  at: { x: 0, y: 0 },      h: 5 },
  { id: "the-lanternseed-gardens",          at: { x: 1075, y: -800 }, h: 15 },
  { id: "the-trueing-terrace",              at: { x: 888, y: -2320 }, h: 37 },
  { id: "north-rim",                        at: { x: 700, y: -3600 }, h: 60 },
  { id: "the-high-ground",                  at: { x: 2544, y: 175 },  h: 35 },
  { id: "the-threshold-district",           at: { x: 1358, y: 1821 }, h: 2.5 },
  { id: "the-still-reach-and-blackwater",   at: { x: 1900, y: 3900 }, h: 3 },
  { id: "the-long-run",                     at: { x: 1513, y: 4888 }, h: 2.5 },
  { id: "the-east-low-hills",               at: { x: 2800, y: 900 },  h: 20 },
  { id: "the-east-window-district",         at: { x: 3125, y: 1675 }, h: 8 },
  { id: "evermoon",                         at: { x: -1900, y: 2150 }, h: 17 },
  { id: "the-protected-grove",              at: { x: -1375, y: -2550 }, h: 40 },
  { id: "the-lochan",                       at: { x: 2575, y: -1160 }, h: 25 },
  { id: "the-reach",                        at: { x: -1725, y: 4840 }, h: 15 },
  { id: "the-headland",                     at: { x: -2300, y: 4200 }, h: 15 },
  { id: "the-doubled-coast",                at: { x: -258, y: 5033 }, h: 4 },
  { id: "aelyria",                          at: { x: 4075, y: 5050 }, h: 7.5 },
];
const OLD_H_UP = 8;
function oldWaterControlPoints(skeleton) {
  const wet = (skeleton.features ?? []).filter((f) => ["channel", "still-water", "still-inlet", "locks"].includes(f.kind));
  const pts = [];
  for (const f of wet) {
    const line = f.centerline_m ?? (f.at_m ?? []);
    for (const p of (Array.isArray(line) ? line : [line])) if (p) pts.push(p);
  }
  if (!pts.length) return [];
  const ys = pts.map((p) => p.y);
  const yN = Math.min(...ys), yMouth = Math.max(...ys);
  return pts.map((p) => {
    const t = (p.y - yN) / Math.max(1, yMouth - yN);
    return { x: p.x, y: p.y, h: Math.max(0, OLD_H_UP * (1 - t)), id: null };
  });
}
function oldHeightfield(anchors, worldState, skeleton) {
  const homes = [];
  for (const m of worldState.marks ?? []) {
    if (!isSited(m)) continue;
    let best = null, bd = Infinity;
    for (const r of anchors) {
      const d = (m.at.x - r.at.x) ** 2 + (m.at.y - r.at.y) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    if (best) homes.push({ x: m.at.x, y: m.at.y, h: best.h, id: best.id });
  }
  return buildHeightfield({ controlPoints: [
    ...anchors.map((r) => ({ x: r.at.x, y: r.at.y, h: r.h, id: r.id })),
    ...homes,
    ...SEA_DATUM.map((s) => ({ x: s.at.x, y: s.at.y, h: s.h, id: null })),
    ...oldWaterControlPoints(skeleton),
  ] }).elevationAt;
}

// The three anchors that were half a metre under their band's midpoint.
const TRUED = { "the-trueing-terrace": 37.5, "the-east-window-district": 8.5, "evermoon": 17.5 };
const OLD_TRUED = OLD_REGION_ANCHORS.map((r) => (r.id in TRUED ? { ...r, h: TRUED[r.id] } : r));

function sameOnTheGrid(a, b) {
  let checked = 0;
  for (let x = -2600; x <= 4200; x += 100) {
    for (let y = -3600; y <= 6600; y += 100) {
      const u = a(x, y), v = b(x, y);
      if (!Object.is(u, v)) return { at: `${x},${y}`, now: u, before: v, checked };
      checked += 1;
    }
  }
  return { checked };
}

test("THE MOVE MOVES NO LAND: the heightfield is bit-identical to the code before it, on a fixed grid over the town", () => {
  const now = assembleWorld({ worldState: WORLD_STATE, skeleton: SKELETON }).heightfield.elevationAt;
  const r = sameOnTheGrid(now, oldHeightfield(OLD_TRUED, WORLD_STATE, SKELETON));
  assert.equal(r.at, undefined, `elevation differs at ${r.at}: ${r.now} now, ${r.before} before`);
  assert.ok(r.checked > 7000, `checked ${r.checked} points`);
});

test("the anchors are the old ones: same order, same coordinates, and heights from the band, half a metre up at exactly three", () => {
  const now = regionAnchors(SKELETON);
  assert.equal(now.length, OLD_REGION_ANCHORS.length);
  const moved = {};
  now.forEach((a, i) => {
    const old = OLD_REGION_ANCHORS[i];
    assert.deepEqual(a.at, old.at, `${a.id} stands where it stood`);
    const row = SKELETON.elevation.regions[i];
    assert.equal(a.id, row.id);
    assert.equal(a.h, (row.band_m[0] + row.band_m[1]) / 2, `${a.id} is its band's midpoint`);
    if (a.h !== old.h) moved[a.id] = a.h - old.h;
  });
  assert.deepEqual(moved, { "the-trueing-terrace": 0.5, "the-east-window-district": 0.5, "evermoon": 0.5 });
});

test("the river's fall is read from the skeleton: the dial moves the water, and the same dial reproduces the old code", () => {
  assert.equal(SKELETON.elevation.river_fall_m, OLD_H_UP);
  assert.deepEqual(waterControlPoints(SKELETON), oldWaterControlPoints(SKELETON));
  const sk = fresh();
  sk.elevation.river_fall_m = 12;
  const head = waterControlPoints(sk).reduce((a, p) => (p.h > a.h ? p : a));
  assert.equal(head.h, 12, "the head of the water stands at the dial");
});

test("a skeleton that leaves out a dial is refused by name, never drawn flat", () => {
  const noAnchor = fresh();
  delete noAnchor.elevation.regions[11].anchor;
  assert.throws(() => assembleWorld({ worldState: WORLD_STATE, skeleton: noAnchor }), /missing: the-protected-grove/);
  const noFall = fresh();
  delete noFall.elevation.river_fall_m;
  assert.throws(() => assembleWorld({ worldState: WORLD_STATE, skeleton: noFall }), /river_fall_m/);
});

test("the lakes carry their surface as data", () => {
  const lakes = SKELETON.features.filter((f) => f.kind === "lake");
  assert.deepEqual(Object.fromEntries(lakes.map((l) => [l.id, l.surface_m])), { "the-lochan": 25, "the-garrison-lake": 7 });
  for (const l of lakes) assert.ok(l.surface_receipt, `${l.id} says why`);
});
