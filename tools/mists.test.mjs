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
import { orient, openYourEyes, airLine, seasonLine, seasonRung, SEASON_LADDER } from "./world-verbs.mjs";
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
// THE MISTS MAY COVER A HOUSEHOLD'S MARKS (Darko, 2026-10-12, WLD-38): as the
// wall creeps in it takes whatever stands in its way, for the season, and the
// household is told on its doorstep. So no check below asks where a household
// happened to place a mark: each holds the Mists' own law, and the ground the
// town sizes itself (its own marks, and what each clearing was sized to hold).
// The checks are functions of a record, so MAY COVER runs the same ones on the
// record with a household's mark straddling the wall.
const recordOf = (skeleton, worldState) => {
  const { mists, ...bare } = skeleton;
  return { skeleton, worldState, withM: assembleWorld({ worldState, skeleton }), without: assembleWorld({ worldState, skeleton: bare }) };
};
// The real record, assembled once for the tests below that read it.
let realCache = null;
function real() {
  if (realCache) return realCache;
  const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
  const worldState = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
  realCache = recordOf(skeleton, worldState);
  return realCache;
}
// Pando Peak keeps its own air: its parcel stands in a clearing of its own
const PANDO = "vermillion/the-pando-peak-parcel";
// What each clearing was sized to hold, by its receipt (tools/mists-record.mjs).
// The households' ground here is still a household's: if it grows or moves past
// the rim it may be covered, and that is told (t.diagnostic), never failed.
const SIZED_FOR = {
  pando: ["vermillion/pando-plains", PANDO, "the-town/pando-peak", "the-town/the-pando-landing"],
  "the-far-southwest": ["sol-am-lichterfenster/vesperfen-wetland", "sol-am-lichterfenster/driftlight-house-parcel"],
};
// the town's own marks the clearings hold, which they must keep clear
const TOWN_IN_A_CLEARING = ["the-town/pando-peak", "the-town/the-pando-landing"];
const keyframesOf = (skeleton) => skeleton.mists.schedule.map((e) => e.crossing);
const KEYFRAMES = () => keyframesOf(real().skeleton);
const corners = (p) => {
  const hw = (p.extent?.w ?? 0) / 2, hh = (p.extent?.h ?? 0) / 2;
  return [{ x: p.at.x - hw, y: p.at.y - hh }, { x: p.at.x + hw, y: p.at.y - hh }, { x: p.at.x + hw, y: p.at.y + hh }, { x: p.at.x - hw, y: p.at.y + hh }];
};
// the world-root is the frame, never a mark in view (the engine skips it the same way)
const isFrame = (m) => Math.max(m.extent?.w ?? 0, m.extent?.h ?? 0) >= DIALS.world_scale_extent_m;
// the town's own water runs off the map's edge into the mist, as a river
// would (ruled 2026-10-09): these two, by id, and nothing else of the town's
const RUNS_INTO_THE_MIST = new Set(["the-town/the-sea", "the-town/the-main-channel"]);
const theTowns = (m) => m.by === "the-town" || m.household === "the-town" || String(m.id ?? "").startsWith("the-town/");
const behindTheWall = (mk, m) => corners(mk).some((q) => mistsHere(q, m).inWall);
const outOfTheFringe = (mk, m) => corners(mk).every((q) => { const h = mistsHere(q, m); return !h.inWall && h.thickness === 0; });

// THE CLEARINGS HOLD, at every crossing of the season: what the town owns is
// asserted (each clearing's geometry as committed, never creeping, and the
// town's own marks in a clearing clear of the wall and its fringe); the
// households' ground each receipt names is only told about, as returned notes.
function clearingsHold({ skeleton, worldState }) {
  const ks = keyframesOf(skeleton), byId = new Map(worldState.marks.map((m) => [m.id, m]));
  const committed = skeleton.mists.clearings_m.map((k) => ({ id: k.id, x: k.x, y: k.y, r: k.r_m }));
  for (const id of Object.keys(SIZED_FOR)) assert.ok(committed.some((k) => k.id === id), `the record carries the ${id} clearing`);
  const town = TOWN_IN_A_CLEARING.map((id) => byId.get(id));
  for (const [i, mk] of town.entries()) assert.ok(mk?.at && theTowns(mk), `the town's ${TOWN_IN_A_CLEARING[i]} is on the record`);
  const notes = new Map();   // one note per household mark: the first crossing it is told at
  const note = (mid, text) => { if (!notes.has(mid)) notes.set(mid, text); };
  for (let c = ks[0]; c <= ks.at(-1) + 10; c += 1) {
    const m = mistsAt(c, skeleton.mists);
    assert.deepEqual(m.clearings.map(({ id, x, y, r }) => ({ id, x, y, r })), committed, `the clearings stand as committed at crossing ${c}`);
    for (const mk of town) {
      assert.ok(m.clearings.some((k) => Math.hypot(mk.at.x - k.x, mk.at.y - k.y) <= k.r), `the town's ${mk.id} stands in a clearing`);
      assert.ok(outOfTheFringe(mk, m), `the town's ${mk.id} is in the wall or a clearing's fringe at crossing ${c}`);
    }
    for (const [id, held] of Object.entries(SIZED_FOR)) {
      const k = m.clearings.find((x) => x.id === id);
      for (const mid of held) {
        const mk = byId.get(mid);
        if (!mk || theTowns(mk)) continue;
        if (!mk.at) { note(mid, `${mid} (sized for in the ${id} clearing) is not placed on the record`); continue; }
        if (Math.hypot(mk.at.x - k.x, mk.at.y - k.y) > k.r) note(mid, `${mid} no longer stands in the ${id} clearing`);
        else if (!outOfTheFringe(mk, m)) note(mid, `${mid} reaches the wall or the ${id} clearing's fringe from crossing ${c}`);
      }
    }
  }
  return [...notes.values()];
}

// THE TOWN'S OWN MARKS stand clear of the wall, but its water, at every
// keyframe and after. A household's marks may be covered: they are returned,
// keyframe by keyframe, never failed.
function townClear({ skeleton, worldState }) {
  const ks = keyframesOf(skeleton);
  const town = worldState.marks.filter((m) => m.at && theTowns(m) && !isFrame(m) && !RUNS_INTO_THE_MIST.has(m.id));
  // (90 until 2026-10-23, when WLD-116 retired the 42 machinery buildings, which stood in the town's quarter and were sited marks)
  assert.ok(town.length > 40, `the town's own marks are all here (${town.length})`);
  const covered = {};
  for (const c of [...ks, ks.at(-1) + 10]) {
    const m = mistsAt(c, skeleton.mists);
    for (const mk of town) assert.equal(behindTheWall(mk, m), false, `the town's ${mk.id} is behind the wall at crossing ${c}`);
    covered[c] = worldState.marks.filter((mk) => mk.at && !theTowns(mk) && !isFrame(mk) && behindTheWall(mk, m)).map((mk) => mk.id);
  }
  return covered;
}

// THE PARCEL NEAREST EACH SIDE, of those standing out of the wall and its
// fringe at every keyframe (a covered or fogged parcel's sight is the fringe's
// own law, held above): its reach is the weather's, and it loses only what
// stands behind the wall.
function nearestSighted({ skeleton, worldState, withM, without }) {
  const ks = keyframesOf(skeleton);
  const parcels = worldState.marks.filter((m) => m.kind === "parcel" && m.at && Math.abs(m.at.x) < 6000 && Math.abs(m.at.y) < 10000
    && ks.every((c) => outOfTheFringe(m, mistsAt(c, skeleton.mists))));
  assert.ok(parcels.length > 50, `the map's sighted parcels are here (${parcels.length})`);
  const nearest = {
    n: parcels.reduce((a, p) => (p.at.y < a.at.y ? p : a)), s: parcels.reduce((a, p) => (p.at.y > a.at.y ? p : a)),
    e: parcels.reduce((a, p) => (p.at.x > a.at.x ? p : a)), w: parcels.reduce((a, p) => (p.at.x < a.at.x ? p : a)),
  };
  for (const crossing of ks) {
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
  return nearest;
}

// LAW REACH IS THE TELLING'S CARRIED AND FAR MARKS (the office builds a
// standpoint's reach from exactly these: world2-serve's `nearby`, the apex's
// worldEyes), at the default budget. The Mists may take out of it only what the
// wall hides: from a parcel's own standpoint, the reach with the Mists is the
// reach the same crossing gives with no Mists and those hidden marks removed. The
// veil must not re-rank it. Every parcel whose standpoint stands out of the wall
// and its fringe (inside them, sight is the fringe's own law, held above),
// Pando's with them, at the first keyframe and the last.
function lawReach({ skeleton, worldState, withM, without }, { pick = (ps) => ps } = {}) {
  const ks = keyframesOf(skeleton);
  const parcels = pick(worldState.marks.filter((m) => m.kind === "parcel" && m.at)
    .sort((p, q) => (p.id < q.id ? -1 : 1)));
  const reachOf = (fov) => [...fov.carried.map((s) => s.id), ...fov.far.map((f) => f.id)].sort();
  let checked = 0;
  const fogged = [];
  for (const crossing of [ks[0], ks.at(-1)]) {
    const m = mistsAt(crossing, skeleton.mists);
    for (const p of parcels) {
      const here = mistsHere(p.at, m);
      if (here.inWall || here.thickness > 0) { fogged.push(`${p.id}@${crossing}`); continue; }
      const hidden = new Set(without.marks.filter((mk) => mk.at && mistsHide(p.at, mk.at, m)).map((mk) => mk.id));
      const bare = { ...without, marks: without.marks.filter((mk) => !hidden.has(mk.id)) };
      assert.deepEqual(reachOf(fieldOfView(p.at, withM, { crossing })), reachOf(fieldOfView(p.at, bare, { crossing })),
        `${p.id}'s reach at ${crossing}`);
      checked += 1;
    }
  }
  return { checked, fogged };
}

// A FIXED SAMPLE (WLD-101, 2026-10-21). These reads cost a field of view per
// standpoint per crossing, and run in order inside this file, so reading every
// parcel and every crossing made this the suite's slowest file. Each check
// below keeps its assertions and reads a fixed sample instead: the same sample
// every run, so a red one reproduces.
//
// mulberry32: a seeded, deterministic pick of n of the items
const seededPick = (items, n, seed = 101) => {
  let a = seed >>> 0;
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out.slice(0, n);
};
const clearAt = (p, m) => { const h = mistsHere(p.at, m); return !h.inWall && h.thickness === 0; };
// LAW REACH's parcels: the one nearest each side of the map (closest to the
// wall; on the map, as THE PARCEL NEAREST EACH SIDE reads it) and Pando's (in a
// clearing past it), plus 20 by the seeded pick, of those whose standpoint
// stands clear at both keyframes it reads.
const lawSample = ({ skeleton }, n = 20) => (parcels) => {
  const ks = keyframesOf(skeleton);
  const clear = parcels.filter((p) => [ks[0], ks.at(-1)].every((c) => clearAt(p, mistsAt(c, skeleton.mists))));
  const onTheMap = clear.filter((p) => Math.abs(p.at.x) < 6000 && Math.abs(p.at.y) < 10000);
  const side = (better) => onTheMap.reduce((a, p) => (better(p, a) ? p : a));
  const head = [...new Set([
    side((p, a) => p.at.y < a.at.y), side((p, a) => p.at.y > a.at.y), side((p, a) => p.at.x > a.at.x), side((p, a) => p.at.x < a.at.x),
    ...clear.filter((p) => p.id === PANDO),
  ])];
  return [...head, ...seededPick(clear.filter((p) => !head.includes(p)), n)];
};
// The season's crossings: its keyframes (the Mists' schedule and the ladder's
// rungs) and the last crossing read, with one crossing between each pair.
const seasonCrossings = (skeleton, last = 300) => {
  const keys = [...new Set([...keyframesOf(skeleton), ...SEASON_LADDER.map((r) => r.from), last])].sort((a, b) => a - b);
  return keys.flatMap((c, i) => (i && c - keys[i - 1] > 1 ? [Math.floor((keys[i - 1] + c) / 2), c] : [c]));
};

test("THE CLEARINGS HOLD: each stands as committed, and the town's marks in one stay clear of the wall AND its fringe, at every crossing; the households' ground they were sized for is told about, never failed", (t) => {
  const notes = clearingsHold(real());
  t.diagnostic(notes.length ? notes.join("; ") : "the ground each clearing was sized for stands clear, Pando's parcel in its own");
  assert.ok(real().worldState.marks.filter((m) => m.kind === "parcel" && m.at).length > 100, "the record's parcels are all here");
});

test("THE TOWN'S OWN MARKS stand clear of the wall, but its water, at every crossing; a household's marks may be covered (WLD-38), and are counted, never failed", (t) => {
  const covered = townClear(real());
  for (const [c, ids] of Object.entries(covered)) t.diagnostic(`crossing ${c}: ${ids.length} household mark(s) the wall reaches${ids.length ? `: ${ids.join(", ")}` : ""}`);
});

test("THE PARCEL NEAREST EACH SIDE, of those clear all season, stays fully sighted at every keyframe: its reach is the weather's, and it loses only what stands behind the wall", () => {
  nearestSighted(real());
});

test("LAW REACH: from a parcel, the Mists change what is reached only by what the wall hides, never by the veil", () => {
  assert.ok(real().worldState.marks.filter((m) => m.kind === "parcel" && m.at).length >= 117);
  const sample = lawSample(real())(real().worldState.marks.filter((m) => m.kind === "parcel" && m.at));
  assert.ok(sample.length >= 24 && sample.some((p) => p.id === PANDO), `the sample: each side, Pando's, and 20 more (${sample.map((p) => p.id).join(", ")})`);
  const { checked, fogged } = lawReach(real(), { pick: lawSample(real()) });
  assert.deepEqual(fogged, [], "every sampled standpoint stands clear");
  assert.equal(checked, sample.length * 2, `every sampled parcel, at both keyframes (${checked})`);
});

// MAY COVER (WLD-38): a household's placement never holds a settlement. On
// 10-12 bee/bee-pink-burrow (S105) touched the fringe at the last keyframe, and
// keith/dandelion-sprawl was filed with a box (centre 4650, -730; 1700 x 1540 m)
// that the east wall reaches from crossing 272. Here that box, a parcel in the
// fringe, a parcel behind the wall and a mark on a clearing's rim are added to
// the record, Pando's plains are grown past their clearing's rim and Pando's
// parcel is moved out of it, and every check above passes with them on it.
test("MAY COVER: a household's mark straddling the wall, a parcel in its fringe, one behind it, one on a clearing's rim, and the ground a clearing was sized for grown or moved past its rim hold nothing; every check above passes with them on the record", (t) => {
  const { skeleton, worldState } = real();
  const ks = keyframesOf(skeleton), last = mistsAt(ks.at(-1), skeleton.mists), e = last.clear.maxX;
  const k = last.clearings.find((x) => x.id === "pando");
  const home = { kind: "sited", household: "a-household", by: "a-household", tier: "home", stamps: 1, weight: 1, body: "" };
  const extra = [
    { ...home, id: "a-household/the-sprawl", at: { x: 4650, y: -730 }, extent: { w: 1700, h: 1540 } },
    { ...home, id: "a-household/a-parcel-in-the-fringe", kind: "parcel", at: { x: e - 150, y: 0 }, extent: { w: 25, h: 25 } },
    { ...home, id: "a-household/a-parcel-behind-the-wall", kind: "parcel", at: { x: e + 150, y: 300 }, extent: { w: 25, h: 25 } },
    { ...home, id: "a-household/on-the-rim", at: { x: k.x + k.r, y: k.y }, extent: { w: 200, h: 200 } },
  ];
  // not vacuous: the wall and its fringe do reach every one of them at the last keyframe
  assert.ok(behindTheWall(extra[0], last), "the Sprawl's box straddles the wall");
  assert.ok(behindTheWall(extra[0], mistsAt(272, skeleton.mists)), "and from crossing 272");
  assert.ok(mistsHere(extra[1].at, last).thickness > 0 && !mistsHere(extra[1].at, last).inWall, "a parcel in the fringe");
  assert.ok(mistsHere(extra[2].at, last).inWall, "a parcel behind the wall");
  assert.ok(behindTheWall(extra[3], last), "a mark on the Pando clearing's rim");
  // the households' ground a clearing was sized for, grown and moved past its rim
  const grown = (mk) => (mk.id === "vermillion/pando-plains" ? { ...mk, extent: { w: mk.extent.w * 1.6, h: mk.extent.h * 1.6 } }
    : mk.id === PANDO ? { ...mk, at: { x: k.x + k.r + 500, y: k.y } } : mk);
  const rec = recordOf(skeleton, { ...worldState, marks: [...worldState.marks.map(grown), ...extra] });
  const notes = clearingsHold(rec);
  t.diagnostic(`the clearings: ${notes.join("; ")}`);
  assert.ok(notes.some((n) => n.startsWith("vermillion/pando-plains reaches the wall")), "the grown plains are told, not failed");
  assert.ok(notes.some((n) => n.startsWith(`${PANDO} no longer stands in the pando clearing`)), "the moved parcel is told, not failed");
  const covered = townClear(rec);
  for (const id of ["a-household/the-sprawl", "a-household/a-parcel-behind-the-wall", "a-household/on-the-rim"])
    assert.ok(covered[ks.at(-1)].includes(id), `${id} is counted covered at ${ks.at(-1)}`);
  const nearest = nearestSighted(rec);
  assert.ok(!extra.some((x) => Object.values(nearest).includes(x)), "the nearest sighted parcel is never one the Mists reach");
  // law reach from the added parcels and the real parcel nearest each added mark (the whole record is the test above)
  const added = new Set(extra.map((x) => x.id));
  const pick = (ps) => [...new Set([
    ...ps.filter((p) => added.has(p.id)),
    ...extra.map((x) => ps.filter((p) => !added.has(p.id)).reduce((a, p) => (Math.hypot(p.at.x - x.at.x, p.at.y - x.at.y) < Math.hypot(a.at.x - x.at.x, a.at.y - x.at.y) ? p : a))),
  ])];
  const { checked, fogged } = lawReach(rec, { pick });
  t.diagnostic(`law reach: ${checked} standpoints checked; out of it, in the wall or the fringe: ${fogged.join(", ")}`);
  assert.ok(checked > 0, "the parcels round them were read");
  assert.ok(fogged.includes(`a-household/a-parcel-in-the-fringe@${ks.at(-1)}`) && fogged.includes(`a-household/a-parcel-behind-the-wall@${ks.at(-1)}`));
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
      // the season's lines (POS-551) say nothing before it starts
      assert.equal(JSON.stringify(a.fov), JSON.stringify(b.fov), `fov at crossing ${crossing}`);
      assert.equal("farLost" in a.fov, false);
      assert.equal(airLine(orient(at, withM, { crossing }).you, crossing), null, `no air at crossing ${crossing}`);
      assert.doesNotMatch(a.tell(), /guttering|only grey|this evening|this morning|a bell/);
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

// ── THE SEASON'S LINES (POS-551) ─────────────────────────────────────────────
// Every one is keyed on the Mists (so on the record's schedule) or on the
// crossing number, and none is said before the schedule's first crossing.
const BELL = "Somewhere past the north edge, a bell you have never heard rings once.";
// The ladder's words, pinned as they were given.
const LADDER = [
  [244, "Mist has come in at the edges of the map; nothing past it can be seen.", "The sun is veiled: the whole land is darker than its hour.",
    ["The gulls have stopped flying north.", "The fog at the edges does not move with the wind.", "A raven sits on the post office roof and watches the quay."]],
  [258, "The mist has crept in from the edges, and it is thicker than yesterday.", "The sun is veiled, and the day never quite arrives.",
    ["Far past the edge, wolves are calling to each other.", "More ravens on the post office roof. None of them make a sound.", "Bats come out over the water earlier than they should."]],
  [272, "The mist presses at the edges of the map, and nobody who goes near it wants to go nearer.", "The sun has not properly risen in days.",
    [BELL, "The candles in the windows lean north, though there is no draught.", "A wolf howls close enough that the ferry's bell answers it."]],
  [282, "The mist is at its thickest, and it is listening.", "There is no day now, only a paler dark.",
    ["The bell past the north edge rings twice now, and the mist does not carry it back.", "The ravens have all gone quiet at once.", "Wolves circle somewhere in the grey; you can hear them breathing between howls."]],
  [284, "The mist is at its thickest, and it is listening.", "Night has come to stay.",
    ["Every lantern in town leans a little north, as if the dark there were drawing breath.", "Bats pour out of the mist in one long ribbon and do not scatter.", "Every dog in Postmark is facing the same way."]],
];
const DAYLIGHT = /dark end of the world|dawn-light is full on you|The light is going/;

test("the ladder: five rungs from 244, 258, 272, 282 and 284, in the words given; the last keeps the edge sentence before it", () => {
  assert.deepEqual(SEASON_LADDER.map((r) => [r.from, r.mist, r.veil, r.lines]), LADDER);
});

test("the rung is the crossing's: none before 244 or with no Mists, each rung from its own crossing to the next's", () => {
  assert.equal(seasonRung(null, 300), null, "no Mists, no rung");
  assert.equal(seasonRung({ crossing: 243 }), null, "Mists on a schedule that starts early still have no rung before 244");
  const from = (c) => seasonRung({ crossing: c })?.from ?? null;
  assert.deepEqual([243, 244, 257, 258, 271, 272, 281, 282, 283, 284, 400].map(from), [null, 244, 244, 258, 258, 272, 272, 282, 282, 284, 284]);
});

test("the season line: the crossing picks it (crossing % 3); inside the wall or in a clearing past the box, no north edge is told, at any crossing", () => {
  assert.equal(seasonLine(null, 300), null, "no Mists, no line");
  for (let c = 244; c <= 300; c += 1) {
    const rung = LADDER.filter(([f]) => c >= f).at(-1);
    assert.equal(seasonLine({ crossing: c, in_wall: false }), rung[3][c % 3], `crossing ${c}`);
    const walled = seasonLine({ crossing: c, in_wall: true });
    assert.doesNotMatch(walled, /north edge/, `inside the wall at ${c}`);
    const kept = rung[3].filter((l) => !/north edge/.test(l));
    assert.equal(walled, kept[c % kept.length]);
    assert.equal(seasonLine({ crossing: c, in_wall: false, clearing: "pando" }), walled, `in a clearing at ${c}`);
  }
  // on the record: the bell rings in the telling at the Origin (273 = 0 mod 3), never at the Pando landing,
  // which is held by its place, whether the wall covers it or a clearing keeps it
  const { withM, worldState } = real();
  assert.ok(openYourEyes({ x: 0, y: 0 }, withM, { crossing: 273 }).tell().includes(BELL));
  const landing = worldState.marks.find((m) => m.id === "the-town/the-pando-landing").at;
  const season = seasonCrossings(real().skeleton);
  assert.deepEqual(new Set(season.map((c) => c % 3)), new Set([0, 1, 2]), `the season's crossings pick every line (${season.join(", ")})`);
  for (const c of season) {
    const o = orient(landing, withM, { crossing: c });
    assert.doesNotMatch(openYourEyes(landing, withM, { crossing: c }).tell(), /north edge/, `the landing's telling at ${c}`);
    assert.doesNotMatch(airLine(o.you, c), /north edge/, `the landing's air at ${c}`);
  }
});

test("the edge and veil sentences escalate in the telling, rung by rung; under the Mists the veil speaks for the light", () => {
  const { withM, worldState } = real();
  const quay = worldState.marks.find((m) => m.id === "the-town/the-quay").at;
  for (const [from, mist, veil] of LADDER) {
    const told = openYourEyes(quay, withM, { crossing: from }).tell();
    assert.ok(told.includes(mist), `the edge at ${from}`);
    assert.ok(told.includes(veil), `the veil at ${from}`);
    assert.doesNotMatch(told, DAYLIGHT, `no daylight sentence at ${from}`);
  }
  // the daylight sentence is the old one before the Mists: the control
  assert.match(openYourEyes({ x: -1900, y: 2150 }, withM, { crossing: 243 }).tell(), /dark end of the world/);
});

test("THE DARK END, UNDER THE VEIL: no daylight sentence is told at the quay or the Pando landing at the season's keyframes or between them", () => {
  const { withM, worldState } = real();
  const spots = ["the-town/the-quay", "the-town/the-pando-landing"].map((id) => worldState.marks.find((m) => m.id === id).at);
  const season = seasonCrossings(real().skeleton);
  assert.deepEqual(new Set(season.map((c) => c % 2)), new Set([0, 1]), `the season's crossings read evening and morning (${season.join(", ")})`);
  for (const at of spots)
    for (const c of season) {
      assert.doesNotMatch(openYourEyes(at, withM, { crossing: c }).tell(), DAYLIGHT, `telling at (${at.x}, ${at.y}), ${c}`);
      assert.doesNotMatch(airLine(orient(at, withM, { crossing: c }).you, c), DAYLIGHT, `air at (${at.x}, ${at.y}), ${c}`);
    }
});

test("a standpoint in a clearing past the town's clear box carries the clearing's id; inside the box, in the wall, or before the Mists, no such key", () => {
  const far = { ...MISTS, clearings_m: [{ id: "far-hill", x: 0, y: -5000, r_m: 600 }] };
  const w = worldOf([NEAR], { mists: far });
  const at = (p, c = 10) => orient(p, w, { crossing: c, dials: CLEAR }).you.mists;
  assert.equal(at({ x: 0, y: -5000 }).clearing, "far-hill");
  assert.equal(at({ x: 0, y: -5000 }).in_wall, false);
  assert.equal(openYourEyes({ x: 0, y: -5000 }, w, { crossing: 10, dials: CLEAR }).fov.mists.clearing, "far-hill", "the eyes carry it too");
  assert.equal("clearing" in at({ x: 0, y: 0 }), false, "the town's own ground");
  assert.equal("clearing" in at({ x: 0, y: -3000 }), false, "in the wall");
  assert.equal(orient({ x: 0, y: -5000 }, w, { crossing: 9, dials: CLEAR }).you.mists, undefined, "before the Mists, no block at all");
  // past the box, held clear: the north edge is never told there
  for (let c = 272; c <= 290; c += 1) assert.doesNotMatch(airLine(orient({ x: 0, y: -5000 }, w, { crossing: c, dials: CLEAR }).you, c), /north edge/);
});

// A line that names an hour is false at the other crossing of the day, since
// a line is picked by crossing % n, never by the hour.
test("no season sentence names an hour of the day: every rung's edge, veil and lines hold at either crossing", () => {
  const HOUR = /\b(tonight|noon|midday|midnight|this (morning|evening|afternoon)|at (dawn|dusk))\b/i;
  for (const r of SEASON_LADDER)
    for (const t of [r.mist, r.veil, ...r.lines]) assert.doesNotMatch(t, HOUR, `rung ${r.from}: "${t}"`);
});

test("the crossing's own hour: in a season the fog is in this evening (even) or this morning (odd), never tonight; before it, the old word", () => {
  const FOG = { ...DIALS, fog_base: 1, fog_swing: 0 };
  const w = worldOf([NEAR]);
  const told = (c) => openYourEyes({ x: 0, y: 0 }, w, { crossing: c, dials: FOG }).tell();
  assert.match(told(9), /Fog is in tonight \(crossing 9,/, "before the Mists, unchanged");
  assert.match(told(10), /Fog is in this evening \(crossing 10,/);
  assert.match(told(11), /Fog is in this morning \(crossing 11,/);
  assert.doesNotMatch(told(11), /tonight/);
});

test("guttering: under a veil a light that carries is told guttering; with no veil, as it was", () => {
  const big = { ...MISTS, border_m: { minX: -9000, minY: -9000, maxX: 9000, maxY: 9000 }, fringe_m: 0 };
  const lamp = { id: "town/lamp", kind: "sited", household: "town", at: { x: 300, y: 0 }, extent: { w: 4, h: 4 }, weight: 1, top_m: 4, signal: true };
  const w = worldOf([lamp], { mists: big });
  const told = (c) => openYourEyes({ x: 0, y: 0 }, w, { crossing: c, dials: CLEAR }).tell();
  assert.match(told(9), /\(its light carries\)/);
  assert.doesNotMatch(told(9), /guttering/);
  assert.match(told(10), /\(its light carries, guttering\)/);
  const unveiled = { ...big, schedule: [{ crossing: 10, front_m: 0, veil: 0 }] };
  assert.doesNotMatch(openYourEyes({ x: 0, y: 0 }, worldOf([lamp], { mists: unveiled }), { crossing: 10, dials: CLEAR }).tell(), /guttering/, "no veil, no guttering");
});

test("the missing horizon: a far feature the wall takes is told where it stood, kept out of reach; one the fog takes is not told", () => {
  const peak = { id: "beyond/peak", far: true, feature: "peak", kind: "sited", at: { x: 0, y: -1200 }, extent: { w: 30, h: 30 } };
  const w = worldOf([peak], { far_features: [{ id: "peak", height_m: 100, label: "a peak" }] });
  const e = openYourEyes({ x: 0, y: 0 }, w, { crossing: 10, dials: CLEAR });
  assert.equal(e.fov.far.length, 0, "never in the reach");
  assert.deepEqual(e.fov.farLost.map((f) => f.id), ["beyond/peak"]);
  assert.match(e.tell(), /On the horizon:\n  · N, where a peak stood: only grey/);
  assert.doesNotMatch(openYourEyes({ x: 0, y: 0 }, w, { crossing: 9, dials: CLEAR }).tell(), /only grey/, "before the Mists it is simply seen");
  const FOG = { ...DIALS, fog_base: 1, fog_swing: 0 };
  assert.deepEqual(openYourEyes({ x: 0, y: 0 }, w, { crossing: 10, dials: FOG }).fov.farLost, [], "the weather hid it anyway: no line");
  // on the record: Pando Peak, from the Origin, at the first keyframe
  const told = openYourEyes({ x: 0, y: 0 }, real().withM, { crossing: KEYFRAMES()[0] }).tell();
  assert.match(told, /  · NW, where Pando Peak stood: only grey/);
});

test("POS-393 · the missing horizon names a resident's far mark, never its body: lost behind the wall with no skeleton label, it is 'a mark by <author> [id]'; the town's own keeps its name", () => {
  const body = "Zed's beacon tower, whitewashed and very tall.";
  const zed = { id: "zed/beacon", by: "zed", far: true, kind: "sited", at: { x: 0, y: -1200 }, extent: { w: 30, h: 30 }, body };
  const town = { id: "the-town/old-mill", by: "the-town", far: true, kind: "sited", at: { x: 1200, y: 0 }, extent: { w: 30, h: 30 }, body: "The old mill, its sails long still." };
  const e = openYourEyes({ x: 0, y: 0 }, worldOf([zed, town]), { crossing: 10, dials: CLEAR });
  assert.deepEqual(e.fov.farLost.map((f) => f.id).sort(), ["the-town/old-mill", "zed/beacon"], "both are lost behind the wall (the fixture reaches the line)");
  const told = e.tell();
  assert.match(told, /  · N, where a mark by zed \[zed\/beacon\] stood: only grey/);
  assert.ok(!told.includes(body) && !told.includes("Zed's beacon"), `the resident's words are in the town's telling:\n${told}`);
  assert.match(told, /  · E, where The old mill stood: only grey/, "the town's own far mark is told by its own name");
});

test("the air, in one line: absent with no Mists; the weather by the crossing's hour, the rung's edge, its veil, and its line", () => {
  const w = worldOf([NEAR]);
  assert.equal(airLine(orient({ x: 0, y: 0 }, w, { crossing: 9, dials: CLEAR }).you, 9), null);
  const at10 = airLine(orient({ x: 0, y: 0 }, w, { crossing: 10, dials: CLEAR }).you, 10);
  assert.equal(at10, "The air is clear this evening. Mist has come in at the edges of the map; nothing past it can be seen. The sun is veiled: the whole land is darker than its hour.",
    "before 244 there is no rung: the first words, and no line");
  const deep = airLine(orient({ x: 0, y: -1225 }, w, { crossing: 11, dials: CLEAR }).you, 11);
  assert.match(deep, /^You stand inside the mist/);
  const { withM } = real();
  assert.ok(airLine(orient({ x: 0, y: 0 }, withM, { crossing: 273 }).you, 273).endsWith(BELL));
  const at284 = airLine(orient({ x: 0, y: 0 }, withM, { crossing: 284 }).you, 284);
  assert.ok(at284.includes("Night has come to stay.") && at284.endsWith("Every dog in Postmark is facing the same way."));
  assert.match(airLine(orient({ x: 0, y: 0 }, withM, { crossing: 245 }).you, 245), /this morning|above the fog/);
});
