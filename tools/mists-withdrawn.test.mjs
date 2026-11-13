#!/usr/bin/env node
// mists-withdrawn.test.mjs — the Mists are withdrawn (WLD-147). Run: node --test tools/mists-withdrawn.test.mjs
//
// LAW (Darko, 2026-11-02 17:06 EST, in chat, RULED on WLD-147): "full removal for mists".
// His ask, 16:59 EST: "now that the mists are kind of lingering, we do need to pare back on the ground that they
// cover. I actually have half an inkling to just remove the mists entirely as they were intended to just be a
// seasonal thing." Written into WORLD/ENGINE.md § The Mists; superseded there: WLD-142's "keep the mist as is".
//
// What this holds:
//   1. FROM THE TARGET CROSSING ON THERE ARE NO MISTS AT ALL: mistsAt answers null, and every telling the real
//      town gives (orient, open-your-eyes, the air line, the walk, the page) is the one it gives with no Mists in
//      its record, byte for byte.
//   2. NO PAST CROSSING IS RE-TOLD: for every crossing before the target, the Mists and every telling are exactly
//      what they were at S147 (29c21dfe1), the last settlement before the withdrawal was written.
//   3. THE TARGET IS ONE DIAL (tools/mists-record.mjs MISTS_WITHDRAWN_FROM), and the record is right for every
//      target the dial may take, so it can be moved at merge time.
//   4. AN OLDER ENGINE, which does not know `withdrawn_from`, reads the same record as no wall on the map.
//
// CAN-FAIL FLIPS (each reds a named test here): drop the `withdrawn_from` line in mistsAt (1 and 3 red); drop the hold
// keyframe at the last standing crossing (2 reds, and the "a record without the hold" control shows why it is there);
// make mistsAt ignore the density's own span (2 reds, same control); pull the final front back by less than the
// fringe (4 reds).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mistsAt, mistsHere, mistsRoad, DIALS } from "./world-engine.mjs";
import { orient, openYourEyes, airLine, SEASON_LADDER, MIST_AT_THE_EDGES, VEIL_LINE } from "./world-verbs.mjs";
import { assembleWorld } from "./world-build.mjs";
import { loadMarks } from "./marks-fold.mjs";
import { creatureLaw, scheduleFor, secretFor } from "./creatures.mjs";
import { MISTS_WITHDRAWN_FROM, MISTS_TOLD_THROUGH, mistsRecordFor } from "./mists-record.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = MISTS_WITHDRAWN_FROM;

// THE RECORD AS IT STOOD AT S147 (world 29c21dfe1; build.json `crossing: 287`, 2026-11-02 21:57Z): the last
// settlement before the withdrawal was written. Only the fields the engine reads (the receipts say why each value is
// what it is, and the engine never reads them). `git show 29c21dfe1:WORLD/skeleton.json` is the source. This is a
// premise asserted in code: every crossing before the target must still be told from exactly this.
const S147 = {
  border_m: { minX: -4600, minY: -4600, maxX: 5850, maxY: 9700 },
  clearings_m: [
    { id: "pando", x: -95110, y: -95995, r_m: 10700 },
    { id: "the-far-southwest", x: -14000, y: 14000, r_m: 4250 },
    { id: "the-starforge-spire", x: 3850, y: -5500, r_m: 821, from_crossing: 282 },
    { id: "the-way-to-the-spire-1", x: 3850, y: -4263, r_m: 935, from_crossing: 282 },
  ],
  fringe_m: 400,
  wall_sight_m: 20,
  density: { from: 0.55, to: 0.95, power: 2 },
  schedule: [
    { crossing: 244, front_m: 0, veil: 0.1 },
    { crossing: 272, front_m: 390, veil: 0.3 },
    { crossing: 282, front_m: 760, veil: 0.5 },
  ],
};

const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
const worldState = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
const sameMists = (a, b, c, why) => assert.deepEqual(mistsAt(c, a), mistsAt(c, b), why);

test("the dial is one number, and the committed record is what it makes: a hold, a withdrawal keyframe, a null crossing, a density span", () => {
  assert.equal(skeleton.mists.withdrawn_from, T, "the record names the crossing the Mists are withdrawn from");
  assert.deepEqual(skeleton.mists.schedule.map((k) => k.crossing), [244, 272, 282, T - 1, T], "the old keyframes, a hold at the last standing crossing, and the withdrawal");
  const hold = skeleton.mists.schedule.at(-2), gone = skeleton.mists.schedule.at(-1);
  assert.deepEqual({ front_m: hold.front_m, veil: hold.veil }, { front_m: 760, veil: 0.5 }, "the wall is held at its fullest until the last crossing before the withdrawal");
  assert.ok(gone.front_m < -skeleton.mists.fringe_m, "the final keyframe pulls the front back past the border by more than the fringe");
  assert.equal(gone.veil, 0, "with no veil");
  assert.deepEqual(skeleton.mists.density, { ...skeleton.mists.density, from_crossing: 244, to_crossing: 282 }, "the density keeps its own span, 244 to 282");
  assert.ok(T > MISTS_TOLD_THROUGH, `a withdrawal at ${T} leaves crossing ${MISTS_TOLD_THROUGH}, the last told with Mists when this was written, as it was`);
  assert.match(skeleton.mists._ruling, new RegExp(`from crossing ${T} there are no Mists at all`), "the record's own ruling text names the dial's crossing");
  assert.match(skeleton.mists._ruling, /full removal for mists/, "and carries Darko's word");
  assert.deepEqual(skeleton.mists, JSON.parse(JSON.stringify(mistsRecordFor(T))), "the committed skeleton is exactly what the dial makes");
});

test("the engine-read half of the committed record is S147's for the whole standing season (nothing but the withdrawal was added)", () => {
  const strip = ({ id, x, y, r_m, from_crossing }) => ({ id, x, y, r_m, ...(from_crossing === undefined ? {} : { from_crossing }) });
  const m = skeleton.mists;
  assert.deepEqual({ minX: m.border_m.minX, minY: m.border_m.minY, maxX: m.border_m.maxX, maxY: m.border_m.maxY }, S147.border_m);
  assert.deepEqual(m.clearings_m.map(strip), S147.clearings_m, "the clearings are unchanged");
  assert.equal(m.fringe_m, S147.fringe_m);
  assert.equal(m.wall_sight_m, S147.wall_sight_m);
  assert.deepEqual({ from: m.density.from, to: m.density.to, power: m.density.power }, S147.density);
  assert.deepEqual(m.schedule.slice(0, 3), S147.schedule, "and so are the three keyframes that were there");
});

// ── 1. THE WITHDRAWAL ───────────────────────────────────────────────────────────────────────────────
test("LAW 'full removal for mists': mistsAt answers null from the target crossing, however far on, and not a crossing before it", () => {
  assert.ok(mistsAt(T - 1, skeleton.mists), `control: the Mists stand at ${T - 1}`);
  assert.equal(mistsAt(T - 1, skeleton.mists).front.n, 760, "at the wall's fullest");
  for (const c of [T, T + 1, T + 2, T + 40, 400, 10000]) assert.equal(mistsAt(c, skeleton.mists), null, `LAW 'full removal for mists': no Mists at crossing ${c}`);
  assert.equal(mistsAt(T + 0.9, skeleton.mists), null, "a fractional window of the target crossing is the target crossing");
  assert.ok(mistsAt(T - 0.1, skeleton.mists), "and one just before it is the last crossing's");
});

// The doors read a world assembled from the record: the same real town three ways.
const worldThen = assembleWorld({ worldState, skeleton: { ...skeleton, mists: S147 } });
const worldNow = assembleWorld({ worldState, skeleton });
const worldNone = assembleWorld({ worldState, skeleton: (({ mists, ...bare }) => bare)(skeleton) });
const at = (id) => worldState.marks.find((m) => m.id === id).at;
// where the old wall stood at its fullest (north y -3840, east x 5090, 400 m fringe), and the town's own ground
const STANDPOINTS = {
  origin: { x: 0, y: 0 },
  quay: at("the-town/the-quay"),
  landing: at("the-town/the-pando-landing"),
  eastFringe: { x: 4900, y: 0 },
  eastWall: { x: 5400, y: 0 },
  northFringe: { x: 0, y: -3700 },
  spire: { x: 3850, y: -5500 },
};
// A telling in two parts, because they cost very differently, and by where you stand. THE STANDPOINT'S OWN WORDS (orient:
// the `mists` block, the fog line, the veil, the season's line) take a millisecond outside any mark (LIGHT) and about 130 ms
// inside the town's (HEAVY), so LIGHT is read at every crossing and HEAVY at the crossings the season turned on.
// THE FIELD OF VIEW (what the wall hides, the fringe's reach, the page's sentences) takes a third of a second a read, so it
// is read at a fixed sample, chosen where the old wall stood. (A fixed sample, as mists.test.mjs does since WLD-101.)
const LIGHT = ["eastFringe", "eastWall", "northFringe"], HEAVY = ["origin", "quay", "landing", "spire"];
const SEASON_TURNS = [0, 243, 244, 257, 258, 271, 272, 282, 284, T - 1];   // before the season, each rung's edge, the hold's end
const wordsTold = (w, p, c) => { const o = orient(p, w, { crossing: c }); return JSON.stringify(o) + "|" + String(airLine(o.you, c)); };
const viewTold = (w, p, c) => { const e = openYourEyes(p, w, { crossing: c }); return JSON.stringify(e.radial) + "|" + e.tell() + "|" + JSON.stringify(e.fov); };
const LADDER_WORDS = [MIST_AT_THE_EDGES, VEIL_LINE, ...SEASON_LADDER.flatMap((r) => [r.mist, r.veil, ...r.lines].filter(Boolean))];
const FOV_SAMPLE_AFTER = { origin: [T, T + 40], eastFringe: [T, T + 40], eastWall: [T, T + 40] };
const FOV_SAMPLE_BEFORE = { origin: [272, T - 1], eastFringe: [272, T - 1], northFringe: [283, T - 1], spire: [T - 1] };

test("LAW 'full removal for mists': from the target crossing the standpoint's own words are a town's with no Mists in its record (every crossing outside the marks, the sampled ones inside)", () => {
  let read = 0;
  const check = (name, c) => {
    const now = wordsTold(worldNow, STANDPOINTS[name], c);
    assert.equal(now, wordsTold(worldNone, STANDPOINTS[name], c), `${name} at ${c}: LAW 'full removal for mists' - told as a town with no Mists`);
    for (const w of LADDER_WORDS) assert.ok(!now.includes(w), `${name} at ${c}: nothing of the season is said ("${w.slice(0, 40)}...")`);
    read += 1;
  };
  for (const name of LIGHT) for (const c of range(T, T + 60)) check(name, c);
  for (const name of HEAVY) for (const c of [T, T + 1, T + 37]) check(name, c);
  assert.equal(read, LIGHT.length * 61 + HEAVY.length * 3);
  // the controls: the equality above is not vacuous. A crossing earlier the same standpoints are told the Mists, and the
  // S147 record would still tell them at the target crossing.
  for (const name of Object.keys(STANDPOINTS)) {
    const p = STANDPOINTS[name];
    assert.notEqual(wordsTold(worldNow, p, T - 1), wordsTold(worldNone, p, T - 1), `control: ${name} is told the Mists at ${T - 1}`);
    assert.notEqual(wordsTold(worldThen, p, T), wordsTold(worldNone, p, T), `control: the S147 record would still tell ${name} the Mists at ${T}`);
  }
  assert.equal(mistsHere(STANDPOINTS.eastWall, mistsAt(T - 1, skeleton.mists)).inWall, true, `control: the east wall stood over (5400, 0) at ${T - 1}`);
});

test("LAW 'full removal for mists': from the target crossing the field of view is a town's with no Mists in its record: nothing hidden by a wall, no fringe, no season said", () => {
  for (const [name, cs] of Object.entries(FOV_SAMPLE_AFTER))
    for (const c of cs) {
      const now = viewTold(worldNow, STANDPOINTS[name], c);
      assert.equal(now, viewTold(worldNone, STANDPOINTS[name], c), `${name} at ${c}: LAW 'full removal for mists' - seen as a town with no Mists sees`);
      for (const w of LADDER_WORDS) assert.ok(!now.includes(w), `${name} at ${c}: nothing of the season is said ("${w.slice(0, 40)}...")`);
    }
  // the controls: where the wall stood the view differs with the Mists in the record, a crossing earlier and at the target under S147
  for (const name of ["eastFringe", "eastWall"]) {
    assert.notEqual(viewTold(worldNow, STANDPOINTS[name], T - 1), viewTold(worldNone, STANDPOINTS[name], T - 1), `control: ${name} sees the Mists at ${T - 1}`);
    assert.notEqual(viewTold(worldThen, STANDPOINTS[name], T), viewTold(worldNone, STANDPOINTS[name], T), `control: the S147 record would still show ${name} the Mists at ${T}`);
  }
});

test("LAW 'full removal for mists': no slowed walk and no wall to refuse a road from the target crossing; the same roads are slowed and refused the crossing before", () => {
  const legs = [
    ["into the east fringe", STANDPOINTS.origin, STANDPOINTS.eastFringe],
    ["into the east wall", STANDPOINTS.origin, STANDPOINTS.eastWall],
    ["along the north fringe", { x: -800, y: -3700 }, { x: 800, y: -3700 }],
    ["out of the wall", STANDPOINTS.eastWall, STANDPOINTS.origin],
  ];
  const last = T - 1;
  for (const [name, a, b] of legs) {
    const live = mistsRoad(a, b, last, skeleton.mists);
    assert.ok(live && (live.factor < 1 || live.refused || live.walk_out), `control: "${name}" is read by the Mists at ${last} (${JSON.stringify(live)})`);
    for (const c of [T, T + 1, T + 40]) assert.equal(mistsRoad(a, b, c, skeleton.mists), null, `"${name}" at ${c}: LAW 'full removal for mists' - no road is read`);
  }
});

test("the page draws nothing from the target crossing: no wall, no veil, no fringe (and draws all three the crossing before)", async () => {
  const { mistsWallSVG, mistsVeilSVG } = await import("../spectator/viewer.mjs");
  const reg = { originPx: { x: 485, y: 760 }, mPerPx: 5 };
  const last = mistsAt(T - 1, skeleton.mists), gone = mistsAt(T, skeleton.mists);
  assert.match(mistsWallSVG(last, reg), /class="wv-mists-wall"/, "control: the wall is drawn at the last standing crossing");
  assert.match(mistsVeilSVG(last, reg), /wv-mists-veil/, "control: and the veil");
  assert.equal(mistsWallSVG(gone, reg), "", "no wall from the target crossing");
  assert.equal(mistsVeilSVG(gone, reg), "", "no veil from the target crossing");
});

test("no creature has a fringe to come out of: the scheduler spawns nothing from the target crossing, even with the launch dial of the season (259) written back", () => {
  const law = creatureLaw(loadMarks(join(ROOT, "WORLD", "marks")));
  const asLaw = { mists: skeleton.mists, marks: worldState.marks, dials: law.dials, fromCrossing: 259, world_sha: "e5bb5aa561d9b134523ce057fdf5e961876963f6" };
  const tries = (c) => ["a", "b", "c", "d"].map((k) => scheduleFor(c, secretFor(`withdrawn ${k}`, c), asLaw)).map((s) => s.spawns.length + s.unplaced.length);
  assert.ok(tries(T - 1).some((n) => n > 0), `control: with the season's dial the scheduler still spawns at ${T - 1}`);
  for (const c of [T, T + 1, T + 12]) assert.deepEqual(tries(c), [0, 0, 0, 0], `crossing ${c}: nothing spawns, because there is no wall and no fringe`);
});

// ── 2. NO PAST CROSSING IS RE-TOLD ──────────────────────────────────────────────────────────────────
test("LAW 'no past crossing re-told': every crossing before the target is told the Mists exactly as at S147, state for state", () => {
  for (const c of range(0, T - 1)) sameMists(skeleton.mists, S147, c, `crossing ${c} is told as it was at S147`);
  assert.ok(mistsAt(MISTS_TOLD_THROUGH, S147).front.n === 760 && mistsAt(MISTS_TOLD_THROUGH, S147).density === 0.95, "control: the last told crossing carries the wall and the full density");
});

test("LAW 'no past crossing re-told': the standpoint's own words before the target are byte-identical to the S147 record's (every crossing outside the marks, the season's turns inside)", () => {
  let compared = 0;
  const check = (name, c) => { assert.equal(wordsTold(worldNow, STANDPOINTS[name], c), wordsTold(worldThen, STANDPOINTS[name], c), `${name} at ${c}: told as at S147`); compared += 1; };
  for (const name of LIGHT) for (const c of range(0, T - 1)) check(name, c);
  for (const name of HEAVY) for (const c of SEASON_TURNS) check(name, c);
  assert.equal(compared, LIGHT.length * T + HEAVY.length * SEASON_TURNS.length);
  // and the walk: the slowed and refused roads of the standing season are the S147 record's, factor for factor, at every crossing
  const legs = [[STANDPOINTS.origin, STANDPOINTS.eastFringe], [STANDPOINTS.origin, STANDPOINTS.eastWall], [{ x: -800, y: -3700 }, { x: 800, y: -3700 }], [STANDPOINTS.eastWall, STANDPOINTS.origin]];
  for (const [a, b] of legs) for (const c of range(0, T - 1)) assert.deepEqual(mistsRoad(a, b, c, skeleton.mists), mistsRoad(a, b, c, S147), `leg ${a.x},${a.y} -> ${b.x},${b.y} at ${c}`);
});

test("LAW 'no past crossing re-told': the field of view at the crossings the season turned on, where the old wall stood, is byte-identical to the S147 record's", () => {
  let compared = 0;
  for (const [name, cs] of Object.entries(FOV_SAMPLE_BEFORE))
    for (const c of cs) {
      assert.equal(viewTold(worldNow, STANDPOINTS[name], c), viewTold(worldThen, STANDPOINTS[name], c), `${name} at ${c}: seen as at S147`);
      compared += 1;
    }
  assert.equal(compared, 7);
});

test("CONTROLS: the hold and the density span are what keep the past whole (a record without either re-tells crossings that were told)", () => {
  const full = mistsRecordFor(T);
  // (a) a withdrawal keyframe with no hold: the wall would already be moving between the last keyframe (282) and the target
  const noHold = { ...full, schedule: full.schedule.filter((k) => k.crossing !== T - 1) };
  const moved = range(283, T - 1).filter((c) => JSON.stringify(mistsAt(c, noHold)) !== JSON.stringify(mistsAt(c, S147)));
  assert.deepEqual(moved, range(283, T - 1), "without the hold every crossing from 283 on is told a different wall");
  // (b) the density easing over the whole schedule: the keyframes the withdrawal adds stretch it
  const noSpan = { ...full, density: { from: full.density.from, to: full.density.to, power: full.density.power } };
  const stretched = range(245, T - 1).filter((c) => mistsAt(c, noSpan).density !== mistsAt(c, S147).density);
  assert.ok(stretched.length > 30, `without its own span the density of ${stretched.length} told crossings moves (from ${stretched[0]})`);
  // and the full record moves none of them
  assert.deepEqual(range(245, T - 1).filter((c) => mistsAt(c, full).density !== mistsAt(c, S147).density), []);
});

// ── 3. THE DIAL ─────────────────────────────────────────────────────────────────────────────────────
test("the record is right for every target the dial may take: the past whole, the future null, the final keyframe consistent", () => {
  for (const target of [MISTS_TOLD_THROUGH + 1, 289, 290, 295, 301, 400]) {
    const r = mistsRecordFor(target);
    assert.equal(r.withdrawn_from, target);
    assert.deepEqual(r.schedule.map((k) => k.crossing), [244, 272, 282, target - 1, target], `schedule for ${target}`);
    for (const c of range(0, target - 1)) sameMists(r, S147, c, `target ${target}: crossing ${c} is as it was at S147`);
    for (const c of [target, target + 1, target + 100]) assert.equal(mistsAt(c, r), null, `target ${target}: no Mists at ${c}`);
    assert.match(r._ruling, new RegExp(`from crossing ${target} there are no Mists at all`));
  }
  assert.throws(() => mistsRecordFor(MISTS_TOLD_THROUGH), /re-tell crossing 287/, "a target at the last told crossing would re-tell it");
  assert.throws(() => mistsRecordFor(282), /re-tell/, "and any earlier one");
  assert.throws(() => mistsRecordFor(289.5), /whole number/);
  assert.throws(() => mistsRecordFor("289"), /whole number/);
});

// ── 4. AN OLDER ENGINE ──────────────────────────────────────────────────────────────────────────────
// Engines pinned before this change (a stale package pin, a clone left on an old ref) do not know `withdrawn_from` or the
// density's span. Read the same record without those two, as they would: it must still be no wall and no fringe on the map.
const older = (({ withdrawn_from, ...rest }) => ({ ...rest, density: { from: rest.density.from, to: rest.density.to, power: rest.density.power } }))(skeleton.mists);
const theTowns = (m) => m.by === "the-town" || m.household === "the-town" || String(m.id ?? "").startsWith("the-town/");
const isFrame = (m) => Math.max(m.extent?.w ?? 0, m.extent?.h ?? 0) >= DIALS.world_scale_extent_m;
const RUNS_INTO_THE_MIST = new Set(["the-town/the-sea", "the-town/the-main-channel"]);
const corners = (p) => { const hw = (p.extent?.w ?? 0) / 2, hh = (p.extent?.h ?? 0) / 2; return [{ x: p.at.x - hw, y: p.at.y - hh }, { x: p.at.x + hw, y: p.at.y - hh }, { x: p.at.x + hw, y: p.at.y + hh }, { x: p.at.x - hw, y: p.at.y + hh }]; };

test("AN OLDER ENGINE reads no wall and no fringe anywhere on the map from the target crossing, and the veil is gone", () => {
  const b = skeleton.mists.border_m, f = skeleton.mists.fringe_m;
  // sample the whole map: the border's rectangle, corners, edges and a grid inside it
  const pts = [];
  for (let i = 0; i <= 20; i += 1) for (let j = 0; j <= 20; j += 1) pts.push({ x: b.minX + ((b.maxX - b.minX) * i) / 20, y: b.minY + ((b.maxY - b.minY) * j) / 20 });
  for (const c of [T, T + 1, T + 100]) {
    const m = mistsAt(c, older);
    assert.ok(m, "an older engine answers a state (it has no way to answer null)");
    assert.equal(m.veil, 0, `no veil at ${c}`);
    assert.ok(Object.values(m.front).every((v) => v <= -f), `the front stands past the border by more than the fringe at ${c} (${JSON.stringify(m.front)})`);
    for (const p of pts) {
      const h = mistsHere(p, m);
      assert.ok(!h.inWall && h.thickness === 0, `(${p.x}, ${p.y}) is clear of the wall and the fringe at ${c}`);
    }
    // the town's own ground (its water runs off the map's edge, as always)
    for (const mk of worldState.marks.filter((x) => x.at && theTowns(x) && !isFrame(x) && !RUNS_INTO_THE_MIST.has(x.id)))
      assert.ok(!corners(mk).some((q) => mistsHere(q, m).inWall), `the town's ${mk.id} is not behind the wall at ${c}`);
  }
  // the control: the same points are in the wall and the fringe the crossing before (the east wall stands at x 5090)
  const last = mistsAt(T - 1, older);
  assert.ok(pts.some((p) => mistsHere(p, last).inWall), "control: some of the map is behind the wall at the last standing crossing");
  assert.ok(pts.some((p) => { const h = mistsHere(p, last); return !h.inWall && h.thickness > 0; }), "and some of it in the fringe");
});

test("the older engine's only difference on the past is the density, and it does not touch where anything stands", () => {
  // the density's span is what an engine that predates `to_crossing` cannot read; front, veil, the clear box and the clearings are the schedule's
  let densityMoved = 0;
  for (const c of range(0, T - 1)) {
    const a = mistsAt(c, older), s = mistsAt(c, S147);
    if (!a || !s) { assert.equal(a, s, `both null at ${c}`); continue; }
    const { density: da, ...ra } = a, { density: ds, ...rs } = s;
    assert.deepEqual(ra, rs, `an older engine puts the wall, the clearings and the veil where S147 had them at ${c}`);
    if (da !== ds) densityMoved += 1;
  }
  // said, not hidden: an engine this old that retells a past crossing gets a different fringe thickness, nowhere else
  assert.ok(densityMoved > 0, "control: the density span is real (an engine without it does stretch the easing)");
});

// ── THE LAW, as text (a pin: it reads the files as text, so it runs on the pull request, not at the crossing) ──
test("[pin] the law says it: ENGINE.md carries the withdrawal and marks the old text superseded; classes.md marks 'keep the mist as is' superseded; both keep the old words", () => {
  const engine = readFileSync(join(ROOT, "WORLD/ENGINE.md"), "utf8"), classes = readFileSync(join(ROOT, "LOGOS/classes.md"), "utf8");
  assert.match(engine, /WLD-147/);
  assert.match(engine, /full removal for mists/, "Darko's word is in the law, quoted");
  assert.match(engine, /withdrawn_from/, "and the law names the dial the record carries");
  assert.match(engine, /Superseded by this \(2026-11-02, WLD-147\)/, "the old text is marked superseded, dated");
  assert.match(engine, /Before the schedule's first\s+crossing it answers null/, "and the old text is still there (never deleted)");
  assert.match(classes, /The Mists themselves are the skeleton's and stay as they are \(the last/, "classes.md keeps the WLD-142 words");
  assert.match(classes, /SUPERSEDED 2026-11-02 \(WLD-147;[^]*?full removal for mists/, "and marks them superseded, with his word");
});
