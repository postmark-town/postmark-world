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
import { buildHeightfield, fieldOfView, lightLevelAt, mistsAt, mistsHere, mistsHide, DIALS } from "./world-engine.mjs";
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
  density: { from: 0.9, to: 0.9 },
  schedule: [
    { crossing: 10, front_m: 0, veil: 0.4 },
    { crossing: 20, front_m: { n: 400, e: 0, s: 0, w: 0 }, veil: 0.6 },
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
  assert.equal(fov.counts.fogHidden, 0, "behind the mist is its own count, never also lost to fog");
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
  const recede = { ...MISTS, schedule: [...MISTS.schedule, { crossing: 30, front_m: { n: -300, e: 0, s: 0, w: 0 }, veil: 0.6 }] };
  const w = worldOf([TOWER], { mists: recede });
  assert.ok(!shown(fieldOfView({ x: 0, y: 0 }, w, { crossing: 20, dials: CLEAR })).includes("beyond/tower"));
  assert.ok(shown(fieldOfView({ x: 0, y: 0 }, w, { crossing: 30, dials: CLEAR })).includes("beyond/tower"),
    "the wall now stands 300 m past the border, behind the tower");
});

test("the wall creeps in: a thing on the map is swallowed when the front passes it", () => {
  const w = worldOf([NEAR]);                                    // the well at y = -300; the north wall reaches -600 by crossing 20
  const shallow = { ...MISTS, schedule: [{ crossing: 10, front_m: 0, veil: 0 }, { crossing: 20, front_m: { n: 800, e: 0, s: 0, w: 0 }, veil: 0 }] };
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

test("A SIGNAL IS VEILED TOO: the light it is told to show is scaled by (1 − veil), and what it reaches is not", () => {
  // a beacon in the bright east (never dark), 1,000 m off, through a thick weather fog
  const beacon = { id: "town/beacon", kind: "sited", household: "town", at: { x: 1000, y: 0 }, extent: { w: 4, h: 4 }, weight: 1, top_m: 4, signal: true };
  const big = { ...MISTS, border_m: { minX: -9000, minY: -9000, maxX: 9000, maxY: 9000 }, fringe_m: 0 };
  const w = worldOf([beacon], { mists: big });
  const at = (crossing, dials) => fieldOfView({ x: 0, y: 0 }, w, { crossing, dials }).carried.find((m) => m.id === "town/beacon");
  assert.equal(at(9, CLEAR).dim, 1, "before the Mists a signal is undimmed");
  assert.equal(at(10, CLEAR).dim, 0.6, "veil 0.4 → its light at 0.6");
  assert.equal(at(20, CLEAR).dim, 0.4, "veil 0.6 → 0.4");
  // the fog reach: plain reach 200 m at this fog; the signal's ×6 carries 1,200 m, veil or no veil
  const FOG = { ...DIALS, fog_base: 1, fog_swing: 0, fog_sight_floor_m: 200, fog_sight_ceiling_m: 200 };
  assert.ok(at(9, FOG), "×6: 1,200 m of reach, the beacon at 1,000 m is seen");
  assert.ok(at(20, FOG), "under the veil it still carries: the veil darkens what is told, never what is reached");
  assert.equal(at(20, FOG).score, at(9, FOG).score, "and it ranks as it did");
  assert.equal(at(20, { ...FOG, signal_fog_reach_mult: 1 }), undefined, "control: without the signal's reach the fog takes it");
});

// ── THE RECORD'S OWN MISTS (skeleton.mists, ruled 2026-10-09) ──────────────
// The real record, assembled once for the tests below that read it.
let realCache = null;
function real() {
  if (realCache) return realCache;
  const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
  const worldState = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
  const { mists, ...bare } = skeleton;
  realCache = { skeleton, worldState, withM: assembleWorld({ worldState, skeleton }), without: assembleWorld({ worldState, skeleton: bare }) };
  return realCache;
}
const RULED_UNDER = "vermillion/the-pando-peak-parcel";      // the one parcel ruled to lie behind the wall
const KEYFRAMES = () => real().skeleton.mists.schedule.map((e) => e.crossing);
const corners = (p) => {
  const hw = (p.extent?.w ?? 0) / 2, hh = (p.extent?.h ?? 0) / 2;
  return [{ x: p.at.x - hw, y: p.at.y - hh }, { x: p.at.x + hw, y: p.at.y - hh }, { x: p.at.x + hw, y: p.at.y + hh }, { x: p.at.x - hw, y: p.at.y + hh }];
};

test("NO PARCEL IS COVERED: every parcel on the record but the one ruled under stands clear of the wall AND its fringe, at every crossing", () => {
  const { skeleton, worldState } = real();
  const parcels = worldState.marks.filter((m) => m.kind === "parcel" && m.at);
  assert.ok(parcels.length > 100, "the record's parcels are all here");
  const first = KEYFRAMES()[0], last = KEYFRAMES().at(-1);
  for (let c = first; c <= last + 10; c += 1) {
    const m = mistsAt(c, skeleton.mists);
    for (const p of parcels) {
      if (p.id === RULED_UNDER) continue;
      for (const q of corners(p)) {
        const here = mistsHere(q, m);
        assert.equal(here.inWall, false, `${p.id} is behind the wall at crossing ${c}`);
        assert.equal(here.thickness, 0, `${p.id} is in the fringe at crossing ${c}`);
      }
    }
    assert.equal(mistsHere(parcels.find((p) => p.id === RULED_UNDER).at, m).inWall, true, "the one ruled under is behind the wall");
  }
});

test("NO HOUSEHOLD'S MARK IS BEHIND THE WALL but on Pando Peak's ground: every corner of every other placed mark stands clear, at every crossing", () => {
  const { skeleton, worldState } = real();
  const pando = worldState.marks.find((m) => m.id === RULED_UNDER).at;
  const onPando = (m) => Math.hypot(m.at.x - pando.x, m.at.y - pando.y) < 10000;   // its own ground, 135 km out
  // the world-root is the frame, never a mark in view (the engine skips it the same way)
  const frame = (m) => Math.max(m.extent?.w ?? 0, m.extent?.h ?? 0) >= DIALS.world_scale_extent_m;
  // households' marks: the town's own water runs off the map's edge into the mist, as a river would
  const marks = worldState.marks.filter((m) => m.at && !m.far && !frame(m) && !onPando(m) && !String(m.id).startsWith("the-town/") && Math.abs(m.at.x) < 50000 && Math.abs(m.at.y) < 50000);
  assert.ok(marks.length > 600);
  for (const c of [...KEYFRAMES(), KEYFRAMES().at(-1) + 10]) {
    const m = mistsAt(c, skeleton.mists);
    for (const mk of marks)
      for (const q of corners({ at: mk.at, extent: mk.extent ?? { w: 0, h: 0 } }))
        assert.equal(mistsHere(q, m).inWall, false, `${mk.id} is behind the wall at crossing ${c}`);
  }
});

test("THE PARCEL NEAREST EACH SIDE stays fully sighted at every keyframe: its reach is the weather's, and it loses only what stands behind the wall", () => {
  const { skeleton, worldState, withM, without } = real();
  const b = skeleton.mists.border_m;
  const parcels = worldState.marks.filter((m) => m.kind === "parcel" && m.at && m.id !== RULED_UNDER && Math.abs(m.at.x) < 6000 && Math.abs(m.at.y) < 10000);
  const nearest = {
    n: parcels.reduce((a, p) => (p.at.y < a.at.y ? p : a)), s: parcels.reduce((a, p) => (p.at.y > a.at.y ? p : a)),
    e: parcels.reduce((a, p) => (p.at.x > a.at.x ? p : a)), w: parcels.reduce((a, p) => (p.at.x < a.at.x ? p : a)),
  };
  assert.ok(nearest.n.at.y - b.minY > 1000 && b.maxX - nearest.e.at.x > 1000, "the border stands well out");
  for (const crossing of KEYFRAMES()) {
    for (const [side, p] of Object.entries(nearest)) {
      // every visible mark, uncollapsed and unbudgeted, so a change of household representative under the veil is not read as a loss
      const all = { ...DIALS, cluster_beyond_m: 1e9 };
      const a = fieldOfView(p.at, withM, { crossing, budget: 1e6, dials: all }), z = fieldOfView(p.at, without, { crossing, budget: 1e6, dials: all });
      assert.equal(a.mists.thickness, 0, `${side}: ${p.id} stands out of the fringe at ${crossing}`);
      assert.equal(a.sightReachM, z.sightReachM, `${side}: ${p.id}'s reach is the weather's at ${crossing}`);
      const m = mistsAt(crossing, skeleton.mists);
      const seen = new Set(a.carried.map((s) => s.id));
      for (const s of z.carried)
        if (!seen.has(s.id)) assert.ok(mistsHide(p.at, s.at, m), `${side}: ${p.id} lost ${s.id} at ${crossing}, which is not behind the wall`);
    }
  }
});

// LAW REACH IS THE TELLING'S CARRIED AND FAR MARKS (the office builds a
// standpoint's reach from exactly these: world2-serve's `nearby`, the apex's
// worldEyes), at the default budget. The Mists may take out of it only what the
// wall hides: from every parcel's own standpoint, the reach with the Mists is the
// reach the same crossing gives with no Mists and those hidden marks removed. The
// veil must not re-rank it. (A sample of parcels here; the lane measured all of
// them through the office's apexLawAt.)
test("LAW REACH: from a parcel, the Mists change what is reached only by what the wall hides, never by the veil", () => {
  const { skeleton, worldState, withM, without } = real();
  const parcels = worldState.marks.filter((m) => m.kind === "parcel" && m.at && m.id !== RULED_UNDER && Math.abs(m.at.x) < 50000)
    .sort((p, q) => (p.id < q.id ? -1 : 1));
  const sample = parcels.filter((_, i) => i % 8 === 0);
  assert.ok(sample.length >= 12);
  const reachOf = (fov) => [...fov.carried.map((s) => s.id), ...fov.far.map((f) => f.id)].sort();
  for (const crossing of [KEYFRAMES()[0], KEYFRAMES().at(-1)]) {
    const m = mistsAt(crossing, skeleton.mists);
    for (const p of sample) {
      const hidden = new Set(without.marks.filter((mk) => mk.at && mistsHide(p.at, mk.at, m)).map((mk) => mk.id));
      const bare = { ...without, marks: without.marks.filter((mk) => !hidden.has(mk.id)) };
      assert.deepEqual(reachOf(fieldOfView(p.at, withM, { crossing })), reachOf(fieldOfView(p.at, bare, { crossing })),
        `${p.id}'s reach at ${crossing}`);
    }
  }
});

test("A TALL THING past the north wall: 100 m high, behind the wall at every keyframe, from the town and from the parcel nearest it", () => {
  const { skeleton, worldState } = real();
  const tall = { id: "beyond/tall-thing", kind: "sited", household: "beyond", at: { x: -1500, y: -5200 }, extent: { w: 60, h: 60 }, weight: 50, top_m: 100 };
  const w = assembleWorld({ worldState: { ...worldState, marks: [...worldState.marks, tall] }, skeleton });
  const nearest = worldState.marks.filter((m) => m.kind === "parcel" && m.at && Math.abs(m.at.x) < 6000 && Math.abs(m.at.y) < 10000)
    .reduce((a, p) => (Math.hypot(p.at.x - tall.at.x, p.at.y - tall.at.y) < Math.hypot(a.at.x - tall.at.x, a.at.y - tall.at.y) ? p : a));
  for (const crossing of [...KEYFRAMES(), 300]) {
    const m = mistsAt(crossing, skeleton.mists);
    assert.equal(mistsHere(tall.at, m).inWall, true, `behind the wall at ${crossing}`);
    for (const from of [{ x: 0, y: 0 }, { x: 575, y: -2600 }, nearest.at]) {
      const fov = fieldOfView(from, w, { crossing, budget: 1000 });
      assert.ok(!fov.carried.some((s) => s.id === "beyond/tall-thing"), `seen from (${from.x}, ${from.y}) at ${crossing}`);
    }
  }
});

test("THE CLEARING: land far past the border keeps open air round it, and no line of sight runs through the wall to it", () => {
  const { skeleton } = real();
  const m = mistsAt(KEYFRAMES().at(-1), skeleton.mists);
  const k = m.clearings[0];
  assert.ok(k, "the record carries a clearing");
  assert.equal(mistsHere({ x: k.x, y: k.y }, m).inWall, false);
  assert.equal(mistsHere({ x: k.x, y: k.y }, m).thickness, 0);
  assert.equal(mistsHide({ x: k.x, y: k.y }, { x: k.x + 100, y: k.y }, m), false, "its own ground is in sight");
  assert.equal(mistsHide({ x: k.x, y: k.y }, { x: k.x + k.r + 50, y: k.y }, m), true, "past the clearing is the wall");
  assert.equal(mistsHide({ x: 0, y: 0 }, { x: k.x, y: k.y }, m), true, "from the town, the line runs through the wall");
  assert.equal(mistsHide({ x: 0, y: 0 }, { x: 100, y: 100 }, m), false, "the box's own sight is unchanged");
});

test("THE THICKENING: the density eases in, from its first value to its last, gaining more every crossing", () => {
  const { skeleton } = real();
  const ks = KEYFRAMES(), d = skeleton.mists.density;
  const at = (c) => mistsAt(c, skeleton.mists).density;
  assert.equal(+at(ks[0]).toFixed(6), d.from);
  assert.equal(+at(ks.at(-1)).toFixed(6), d.to);
  let lastStep = 0;
  for (let c = ks[0] + 1; c <= ks.at(-1); c += 1) {
    const step = at(c) - at(c - 1);
    assert.ok(step > lastStep, `crossing ${c} gains more than the one before (${step} vs ${lastStep})`);
    lastStep = step;
  }
  assert.equal(at(ks.at(-1) + 20), at(ks.at(-1)), "and holds after");
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

test("the page cuts each clearing out of the wall, so the land past the border it keeps open is drawn open", async () => {
  const { mistsWallSVG } = await import("../spectator/viewer.mjs");
  const m = mistsAt(KEYFRAMES()[0], real().skeleton.mists);
  const k = m.clearings[0];
  const svg = mistsWallSVG(m, { originPx: { x: 485, y: 760 }, mPerPx: 5 });
  const cx = 485 + k.x / 5, cy = 760 + k.y / 5, r = k.r / 5;
  assert.ok(svg.includes(` M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} a ${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0`), "the hole");
  assert.match(svg, /<circle class="wv-mists-fringe" data-src="mists:clearing-[^"]+" pointer-events="none"/, "its fringe ring");
});

// THE GENERATOR KEEPS THE BLOCK. tools/world-terrain-gen.mjs writes the whole
// skeleton, and the Mists' one home in code is tools/mists-record.mjs, which it
// writes in. The committed block is held to that home on every run; the full
// regenerate-then-diff needs the atlas the generator extracts from, which lives in
// the town's repo, so it runs wherever POSTMARK_ATLAS names one and says why it
// skipped otherwise.
test("the committed skeleton's mists block is the generator's own", async () => {
  const { MISTS } = await import("./mists-record.mjs");
  assert.deepEqual(real().skeleton.mists, JSON.parse(JSON.stringify(MISTS)));
});

test("a regenerate writes the committed skeleton, key for key (needs POSTMARK_ATLAS)", { skip: !process.env.POSTMARK_ATLAS && "POSTMARK_ATLAS is not set: the atlas the generator extracts from lives in the town's repo" }, async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "skeleton-regen-"));
  try {
    const out = join(dir, "skeleton.json");
    execFileSync(process.execPath, [join(ROOT, "tools/world-terrain-gen.mjs"), "--atlas", process.env.POSTMARK_ATLAS], { env: { ...process.env, SKELETON_OUT: out }, stdio: "pipe" });
    assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), real().skeleton);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
