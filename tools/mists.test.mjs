#!/usr/bin/env node
// mists.test.mjs — the Mists (POS-466): a border band with a place, on a
// crossing schedule. Run: node --test tools/mists.test.mjs
//
// The laws this holds:
//   • before the schedule's first crossing there are no Mists, and every answer
//     is the one the town gave before they existed (proved on the real record);
//   • the wall occludes everything behind it: no ceiling, no height exemption, a
//     signal's light doesn't cut it, and a horizon object behind it is gone too;
//   • when the wall recedes past a thing, the thing is in sight again;
//   • the fringe shortens sight on the map side, and an eye above the fog line
//     is still inside it; a body inside the wall sees arm's reach;
//   • the veil dims the whole land, and orient and the telling say so.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildHeightfield, fieldOfView, lightLevelAt, mistsAt, mistsHere, DIALS } from "./world-engine.mjs";
import { orient, openYourEyes } from "./world-verbs.mjs";
import { assembleWorld } from "./world-build.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const flatAt = (h) => buildHeightfield({ controlPoints: [{ x: 0, y: 0, h }, { x: 10000, y: 0, h }, { x: 0, y: 10000, h }, { x: -10000, y: 0, h }] });
const light = { dawn_pole_m: { x: 5000, y: -5000 }, dark_pole_m: { x: -5000, y: 5000 } };
// no weather, so only the Mists can hide anything here
const CLEAR = { ...DIALS, fog_base: 0, fog_swing: 0 };

// a 2 km map; the Mists arrive at crossing 10 and creep 400 m in on the north by 20
const MISTS = {
  border_m: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
  fringe_m: 300,
  wall_sight_m: 20,
  schedule: [
    { crossing: 10, front_m: 0, density: 0.9, veil: 0.4 },
    { crossing: 20, front_m: { n: 400, e: 0, s: 0, w: 0 }, density: 0.9, veil: 0.6 },
  ],
};
const terrainWith = (mists, far_features = []) => ({ far_features, features: [], elevation: {}, ...(mists ? { mists } : {}) });
const worldOf = (marks, { mists = MISTS, h = 5, far_features = [] } = {}) =>
  ({ marks, terrain: terrainWith(mists, far_features), heightfield: flatAt(h), light, fogCeilingM: 22 });

// THE TALL THING: 100 m high, standing 200 m past the north border
const TOWER = { id: "beyond/tower", kind: "sited", household: "beyond", at: { x: 0, y: -1200 }, extent: { w: 30, h: 30 }, weight: 5, top_m: 100 };
const BEACON = { ...TOWER, id: "beyond/beacon", at: { x: 40, y: -1200 }, signal: true };
const NEAR = { id: "town/well", kind: "sited", household: "town", at: { x: 0, y: -300 }, extent: { w: 4, h: 4 }, weight: 1, top_m: 4 };
const shown = (fov) => fov.carried.map((m) => m.id);

test("mistsAt: nothing before the first crossing; linear between entries; holds after the last", () => {
  assert.equal(mistsAt(9, MISTS), null);
  assert.equal(mistsAt(0, MISTS), null);
  assert.equal(mistsAt(10, undefined), null, "no record, no Mists");
  const mid = mistsAt(15, MISTS);
  assert.deepEqual(mid.front, { n: 200, e: 0, s: 0, w: 0 });
  assert.equal(mid.clear.minY, -800);
  assert.equal(+mid.veil.toFixed(6), 0.5);
  assert.deepEqual(mistsAt(99, MISTS).front, { n: 400, e: 0, s: 0, w: 0 });
  assert.deepEqual(mistsAt(15, MISTS), mistsAt(15, MISTS), "a pure function of the crossing");
});

test("THE TALL THING: a 100 m object 200 m past the border is hidden from inside the map", () => {
  const w = worldOf([TOWER, BEACON, NEAR]);
  const before = fieldOfView({ x: 0, y: 0 }, w, { crossing: 9, dials: CLEAR });
  assert.ok(shown(before).includes("beyond/tower"), "control: before the Mists the tower is seen");
  const fov = fieldOfView({ x: 0, y: 0 }, w, { crossing: 10, dials: CLEAR });
  assert.ok(!shown(fov).includes("beyond/tower"), "100 m tall, and still behind the wall");
  assert.ok(!shown(fov).includes("beyond/beacon"), "a signal's light does not cut the wall");
  assert.ok(shown(fov).includes("town/well"), "the map side of the wall is still seen");
  assert.equal(fov.counts.mistHidden, 2);
});

test("THE TALL THING from a high eye: above the fog line, the wall still hides it", () => {
  const w = worldOf([TOWER], { h: 80 });                       // the whole ground at +80 m, over the 22 m ceiling
  const fov = fieldOfView({ x: 0, y: 0 }, w, { crossing: 10, dials: CLEAR });
  assert.equal(fov.observer.aboveFog, true);
  assert.ok(!shown(fov).includes("beyond/tower"));
});

test("THE TALL THING as a horizon object: a far feature behind the wall is gone", () => {
  const peak = { id: "beyond/peak", far: true, feature: "peak", kind: "sited", at: { x: 0, y: -1200 }, extent: { w: 30, h: 30 } };
  const w = worldOf([peak], { far_features: [{ id: "peak", height_m: 100, label: "a peak" }] });
  assert.equal(fieldOfView({ x: 0, y: 0 }, w, { crossing: 9, dials: CLEAR }).far.length, 1, "control: seen before");
  assert.equal(fieldOfView({ x: 0, y: 0 }, w, { crossing: 10, dials: CLEAR }).far.length, 0);
});

test("THE RECEDE: when the wall pulls back past the tall thing, it is in sight again", () => {
  const recede = { ...MISTS, schedule: [...MISTS.schedule, { crossing: 30, front_m: { n: -300, e: 0, s: 0, w: 0 }, density: 0.9, veil: 0.6 }] };
  const w = worldOf([TOWER], { mists: recede });
  assert.ok(!shown(fieldOfView({ x: 0, y: 0 }, w, { crossing: 20, dials: CLEAR })).includes("beyond/tower"));
  assert.ok(shown(fieldOfView({ x: 0, y: 0 }, w, { crossing: 30, dials: CLEAR })).includes("beyond/tower"),
    "the wall now stands 300 m past the border, behind the tower");
});

test("the wall creeps in: a thing on the map is swallowed when the front passes it", () => {
  const w = worldOf([NEAR]);                                    // the well at y = -300; the north wall reaches -600 by crossing 20
  const shallow = { ...MISTS, schedule: [{ crossing: 10, front_m: 0, density: 0.9, veil: 0 }, { crossing: 20, front_m: { n: 800, e: 0, s: 0, w: 0 }, density: 0.9, veil: 0 }] };
  const ww = worldOf([NEAR], { mists: shallow });
  assert.ok(shown(fieldOfView({ x: 0, y: 0 }, w, { crossing: 20, dials: CLEAR })).includes("town/well"));
  assert.ok(!shown(fieldOfView({ x: 0, y: 0 }, ww, { crossing: 20, dials: CLEAR })).includes("town/well"), "the wall at y = -200 now stands in front of it");
});

test("the fringe shortens sight, and an eye above the fog line is still in it", () => {
  const w = worldOf([], { h: 80 });
  const deep = fieldOfView({ x: 0, y: -950 }, w, { crossing: 10, dials: CLEAR });   // 50 m from the wall
  const free = fieldOfView({ x: 0, y: 0 }, w, { crossing: 10, dials: CLEAR });
  assert.equal(deep.observer.aboveFog, true);
  assert.ok(deep.sightReachM < 2000, `the haze closes the view (got ${deep.sightReachM} m)`);
  assert.equal(free.sightReachM, Math.round(DIALS.fog_sight_ceiling_m * DIALS.above_fog_bonus), "out of the fringe, the weather's reach");
  assert.ok(mistsHere({ x: 0, y: -950 }, mistsAt(10, MISTS)).thickness > 0.7);
});

test("a body inside the wall sees arm's reach and nothing past it", () => {
  const close = { ...NEAR, id: "beyond/stone", at: { x: 0, y: -1210 } };
  const w = worldOf([TOWER, close]);
  const fov = fieldOfView({ x: 0, y: -1225 }, w, { crossing: 10, dials: CLEAR });
  assert.equal(fov.mists.in_wall, true);
  assert.equal(fov.sightReachM, 20);
  assert.deepEqual(shown(fov), ["beyond/stone"], "the stone 15 m off, not the tower 25 m off");
});

test("the veil dims the whole land; orient and the telling say so", () => {
  assert.equal(lightLevelAt(0, 0, light, 0), lightLevelAt(0, 0, light), "no veil, the old answer");
  assert.equal(lightLevelAt(0, 0, light, 0.4), lightLevelAt(0, 0, light) * 0.6);
  const w = worldOf([TOWER]);
  const o9 = orient({ x: 0, y: 0 }, w, { crossing: 9, dials: CLEAR });
  const o10 = orient({ x: 0, y: 0 }, w, { crossing: 10, dials: CLEAR });
  assert.equal("mists" in o9.you, false, "absent, not null, before the Mists");
  assert.equal(o10.you.mists.veil, 0.4);
  assert.ok(o10.you.light.level < o9.you.light.level);
  const told = openYourEyes({ x: 0, y: 0 }, w, { crossing: 10, dials: CLEAR }).tell();
  assert.match(told, /Mist has come in at the edges of the map/);
  assert.match(told, /The sun is veiled/);
  assert.match(told, /1 behind the mist/);
  assert.doesNotMatch(openYourEyes({ x: 0, y: 0 }, w, { crossing: 9, dials: CLEAR }).tell(), /mist|veiled/i);
});

test("A SIGNAL IS VEILED TOO: its light ranks dimmer and carries less far through fog, by (1 − veil)", () => {
  // a beacon in the bright east (never dark), 1,000 m off, through a thick weather fog
  const beacon = { id: "town/beacon", kind: "sited", household: "town", at: { x: 1000, y: 0 }, extent: { w: 4, h: 4 }, weight: 1, top_m: 4, signal: true };
  const big = { ...MISTS, border_m: { minX: -9000, minY: -9000, maxX: 9000, maxY: 9000 }, fringe_m: 0 };
  const w = worldOf([beacon], { mists: big });
  const at = (crossing, dials) => fieldOfView({ x: 0, y: 0 }, w, { crossing, dials }).carried.find((m) => m.id === "town/beacon");
  assert.equal(at(9, CLEAR).dim, 1, "before the Mists a signal is undimmed");
  assert.equal(at(10, CLEAR).dim, 0.6, "veil 0.4 → its light at 0.6");
  assert.equal(at(20, CLEAR).dim, 0.4, "veil 0.6 → 0.4");
  // the fog reach: plain reach 200 m at this fog; ×6 before the veil carries it, ×2.4 under veil 0.6 does not
  const FOG = { ...DIALS, fog_base: 1, fog_swing: 0, fog_sight_floor_m: 200, fog_sight_ceiling_m: 200 };
  assert.ok(at(9, FOG), "×6: 1,200 m of reach, the beacon at 1,000 m is seen");
  assert.equal(at(20, FOG), undefined, "×2.4 under the veil: 480 m, the beacon is lost to the fog");
  assert.equal(at(20, { ...FOG, signal_fog_reach_mult: 1 }), undefined);
});

// THE BEFORE-START IDENTITY, on the real record: the record's own schedule, at
// crossings before its first entry, answers byte for byte what the same world
// answers with no Mists in it at all. (The lane's proof also held this branch
// against origin/main's engine at every crossing 0..243: every answer equal.)
test("before the schedule starts, the real town's answers are byte-identical to a town with no Mists", () => {
  const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
  const worldState = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
  assert.ok(skeleton.mists?.schedule?.length, "the record carries a schedule");
  const first = skeleton.mists.schedule[0].crossing;
  const { mists, ...bare } = skeleton;
  const withM = assembleWorld({ worldState, skeleton });
  const without = assembleWorld({ worldState, skeleton: bare });
  for (const crossing of [0, 100, first - 1]) {
    for (const at of [{ x: 0, y: 0 }, { x: 5000, y: -4000 }]) {
      assert.equal(JSON.stringify(orient(at, withM, { crossing })), JSON.stringify(orient(at, without, { crossing })));
      const a = openYourEyes(at, withM, { crossing }), b = openYourEyes(at, without, { crossing });
      assert.equal(JSON.stringify(a.radial) + a.tell(), JSON.stringify(b.radial) + b.tell(), `crossing ${crossing}`);
    }
  }
  // and the positive control: at the first crossing, the corner's answer moves
  const at = { x: 5000, y: -4000 };
  assert.notEqual(JSON.stringify(orient(at, withM, { crossing: first })), JSON.stringify(orient(at, without, { crossing: first })));
});

// THE PAGE DRAWS IT (spectator/viewer.mjs). The wall is opaque and takes the
// pointer; the fringe fades and lets it through; the veil darkens the land;
// before the Mists, nothing is drawn at all.
test("the page: no Mists, no drawing; the wall is opaque, takes the pointer, and leaves the clear ground open", async () => {
  const { mistsWallSVG, mistsVeilSVG } = await import("../spectator/viewer.mjs");
  const reg = { originPx: { x: 485, y: 760 }, mPerPx: 5 };
  assert.equal(mistsWallSVG(null, reg), "");
  assert.equal(mistsVeilSVG(null, reg), "");
  const m = mistsAt(20, MISTS);
  const svg = mistsWallSVG(m, reg);
  const wall = svg.match(/<path class="wv-mists-wall"[^>]*>/)[0];
  assert.match(wall, /fill-rule="evenodd"/);
  assert.match(wall, /pointer-events="all"/, "nothing behind the wall can be hovered or clicked");
  assert.doesNotMatch(wall, /opacity/, "the wall is fully opaque");
  // the hole is the clear ground: north wall at y = -600 m → 760 - 120 = 640 px
  assert.match(wall, / M 285\.0 640\.0 H 685\.0 V 960\.0 H 285\.0 Z"/);
  assert.equal((svg.match(/class="wv-mists-fringe"[^>]*pointer-events="none"/g) ?? []).length, 4);
  assert.match(mistsVeilSVG(m, reg), /fill-opacity="0\.360"/, "veil 0.6 → a 0.36 wash");
});

test("the page mounts the wall above everything the record draws, and the veil under it", () => {
  const src = readFileSync(join(ROOT, "spectator/viewer.mjs"), "utf8");
  const at = (id) => src.indexOf(`setAttribute("id", "${id}")`);
  assert.ok(at("wv-veil-layer") > at("wv-placed-art-layer") && at("wv-veil-layer") < at("wv-fp-layer"), "the veil sits on the ground and its art, under the record");
  assert.ok(at("wv-mists-layer") > at("wv-walk-layer") && at("wv-mists-layer") > at("wv-overlay"), "the wall sits over the pips and the walkers");
});
