// creatures.test.mjs — the hidden schedule, its seed and the fold (WLD-56).
//
// Read against the real world: WORLD/skeleton.json's Mists and WORLD/world-state.json's
// marks, so "in the band" and "off the town's ground" are asked of the town as it stands.
// The counts and the band are the law's, read from the creature class marks (D1, D2,
// Darko 2026-10-15 12:09). The law stands at one creature a window from crossing 259,
// bat, raven, wolf in turn (Darko 2026-10-17 13:58). The machinery tests
// run at D2's full strength (FULL), so placement, water and the audit are asked of
// nine spawns a window; the rotation tests run the law as it stands (STANDING).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mistsAt, mistsHere } from "./world-engine.mjs";
import { mistsKeepRects, keptByTheTown } from "./mists-keep.mjs";
import { loadMarks } from "./marks-fold.mjs";
import { pointInPolygon } from "./geometry.mjs";
import {
  creatureLaw, countsFor, CREATURE_DIAL_NAMES, TOWN, TOWN_WATERS, townWaterRings, secretFor, commitmentOf, windowOf, creatureId, isCreatureId, creaturesOn,
  scheduleFor, dueSpawns, auditWindow, creaturesAt, creaturesWritten, dueFades, creaturesSnapshot,
} from "./creatures.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MISTS = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8")).mists;
const MARKS = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8")).marks;
const SHA = "e5bb5aa561d9b134523ce057fdf5e961876963f6";   // the world sha these inputs stand for
const LAW = creatureLaw(loadMarks(join(ROOT, "WORLD", "marks")));
// D2's numbers (Darko 2026-10-15 12:09) with no rotation: the schedule at full strength.
const { rotation: _rotation, ...FULL } = { ...LAW.dials, counts: { bat: 3, raven: 4, wolf: 2 } };
const INPUTS = { mists: MISTS, marks: MARKS, dials: FULL, fromCrossing: 244, world_sha: SHA };
const STANDING = { mists: MISTS, marks: MARKS, dials: LAW.dials, fromCrossing: LAW.fromCrossing, world_sha: SHA };
const MASTER = "a test master key, never the box's";
const t = (ms) => new Date(ms).toISOString();

test("the seed: a secret per crossing, and a commitment that binds it and the world sha without telling either", () => {
  const s270 = secretFor(MASTER, 270), s271 = secretFor(MASTER, 271);
  assert.match(s270, /^[0-9a-f]{64}$/);
  assert.equal(secretFor(MASTER, 270), s270, "the same crossing, the same secret");
  assert.notEqual(s270, s271, "each crossing its own: one reveal never tells the next window");
  assert.notEqual(secretFor("another key", 270), s270, "the master key decides it");
  assert.equal(commitmentOf(s270, SHA), commitmentOf(s270, SHA));
  assert.notEqual(commitmentOf(s270, SHA), s270);
  assert.notEqual(commitmentOf(s270, SHA), commitmentOf(s270, "0".repeat(40)), "the commitment binds the world sha too");
  assert.throws(() => commitmentOf(s270), /no world sha/);
  assert.throws(() => secretFor("", 270), /no master key/);
});

test("the law: the class marks carry the ruled numbers, and the launch is crossing 259", () => {
  assert.deepEqual(LAW.dials.counts, { bat: 1, raven: 1, wolf: 1 }, "one a window (Darko 10-17 13:58)");
  assert.deepEqual(LAW.dials.rotation, ["bat", "raven", "wolf"], "the kinds in turn, a bat first");
  assert.deepEqual([LAW.dials.band_from_m, LAW.dials.band_to_m], [0, 400], "D1: the 400 m fringe on the clear side");
  assert.equal(LAW.dials.span_h, 12, "a creature lasts 12 h from its own spawn");
  assert.equal(LAW.fromCrossing, 259, "the window opening 2026-10-19 12:00Z");
  assert.equal(windowOf(259).startMs, Date.parse("2026-10-19T12:00:00Z"));
  assert.deepEqual(LAW.kinds, ["bat", "raven", "wolf"].map((k) => ({ kind: k, kind_file: `WORLD/kinds/${k}.kind` })));
});

test("the law is read whole or not at all", () => {
  const cls = (over = {}) => ({ kind: "class", by: TOWN, class: "creature", dials: { from_crossing: 270, band_from_m: 0, band_to_m: 400, keep_m: 440, apart_m: 150, span_h: 12 }, ...over });
  const wolf = (over = {}) => ({ kind: "class", by: TOWN, class: "wolf", extends: "creature", dials: { count_per_window: 2 }, kind_file: "WORLD/kinds/wolf.kind", ...over });
  assert.equal(creatureLaw([]), null, "no class, no creatures");
  assert.equal(creatureLaw([cls({ by: "someone" }), wolf()]), null, "only the-town writes the class");
  assert.deepEqual(creatureLaw([cls(), wolf()]), { fromCrossing: 270, dials: { counts: { wolf: 2 }, band_from_m: 0, band_to_m: 400, keep_m: 440, apart_m: 150, span_h: 12 }, kinds: [{ kind: "wolf", kind_file: "WORLD/kinds/wolf.kind" }] });
  for (const k of CREATURE_DIAL_NAMES) {
    const { [k]: _, ...rest } = cls().dials;
    assert.throws(() => creatureLaw([cls({ dials: rest }), wolf()]), new RegExp(`${k} dial`), `a class missing ${k} is refused`);
  }
  assert.throws(() => creatureLaw([cls(), wolf({ dials: { count_per_window: 1.5 } })]), /count_per_window/);
  assert.throws(() => creatureLaw([cls(), wolf({ kind_file: undefined })]), /kind_file/);
  assert.throws(() => scheduleFor(270, secretFor(MASTER, 270), { ...INPUTS, dials: null }), /no dials/, "on, and no dials: refused, never a default");
});

test("the schedule: the law's counts, every one placed in the band, off the town, apart, at a minute in its window", () => {
  for (const N of [250, 270, 282]) {
    const sched = scheduleFor(N, secretFor(MASTER, N), INPUTS);
    const m = mistsAt(N, MISTS), keep = mistsKeepRects(MARKS, MISTS.clearings_m);
    const { startMs, endMs } = windowOf(N);
    const byKind = {};
    for (const s of sched.spawns) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
    assert.deepEqual(sched.unplaced, [], `crossing ${N}: every spawn found a place`);
    assert.deepEqual(byKind, { ...FULL.counts }, `crossing ${N}: the counts`);
    for (const s of sched.spawns) {
      const here = mistsHere(s, m);
      assert.equal(here.inWall, false, `${s.id} stands on the clear side`);
      const c = m.clear, boxWallM = Math.min(s.x - c.minX, c.maxX - s.x, s.y - c.minY, c.maxY - s.y);
      assert.ok(boxWallM >= 0 && boxWallM <= 400, `${s.id} is in the band (${Math.round(boxWallM)} m from the face)`);
      assert.equal(keptByTheTown(keep, s.x, s.y), false, `${s.id} is off the town's ground`);
      assert.ok(m.clearings.every((k) => Math.hypot(s.x - k.x, s.y - k.y) > k.r), `${s.id} is in no clearing`);
      assert.ok(s.at_ms >= startMs && s.at_ms < endMs && s.at_ms % 60000 === 0, `${s.id} spawns at a minute in its window`);
      assert.equal(Date.parse(s.fades_at) - s.at_ms, 12 * 3600 * 1000, `${s.id} lives 12 h`);
      assert.equal(s.id, creatureId(s.kind, N, s.index));
      for (const o of sched.spawns) if (o !== s) assert.ok(Math.hypot(o.x - s.x, o.y - s.y) >= FULL.apart_m, `${s.id} and ${o.id} stand apart`);
    }
    for (let i = 1; i < sched.spawns.length; i += 1) assert.ok(sched.spawns[i - 1].at_ms <= sched.spawns[i].at_ms, "in time order");
  }
});

test("never on the town's water: no spawn of any kind on the sea or the main channel, across the season and many secrets (Darko 10-15 13:17)", () => {
  const rings = townWaterRings(MARKS);
  assert.deepEqual(TOWN_WATERS, ["the-sea", "the-main-channel"]);
  assert.equal(rings.length, 2, "the sea and the main channel, by their drawn polygons");
  assert.equal(townWaterRings(MARKS.map((m) => ({ ...m, by: "someone", household: "someone", id: `someone/${m.id}` }))).length, 0, "only the town's own water marks");
  let checked = 0;
  for (let N = 270; N <= 290; N += 4) {
    for (let k = 0; k < 40; k += 1) {
      const sched = scheduleFor(N, secretFor(`water probe ${k}`, N), INPUTS);
      for (const sp of sched.spawns) {
        assert.ok(!rings.some((r) => pointInPolygon(sp.x, sp.y, r)), `${sp.id} (${sp.x}, ${sp.y}) stands on the town's water`);
        checked += 1;
      }
      assert.deepEqual(sched.unplaced, [], `crossing ${N}: every spawn still finds land`);
    }
  }
  assert.ok(checked >= 2000, `spawns checked: ${checked}`);
});

test("the schedule is the secret's alone: the same inputs give the same window, another secret another", () => {
  const a = scheduleFor(270, secretFor(MASTER, 270), INPUTS), b = scheduleFor(270, secretFor(MASTER, 270), INPUTS);
  assert.deepEqual(a, b);
  const c = scheduleFor(270, secretFor("another key", 270), INPUTS);
  assert.notDeepEqual(c.spawns.map((s) => [s.x, s.y, s.at]), a.spawns.map((s) => [s.x, s.y, s.at]));
  // one more raven moves no wolf or bat: each spawn's draws are named by its own id
  const more = scheduleFor(270, secretFor(MASTER, 270), { ...INPUTS, dials: { ...FULL, counts: { ...FULL.counts, raven: 5 } } });
  const wolves = (s) => s.spawns.filter((x) => x.kind === "wolf" || x.kind === "bat").map((x) => `${x.id}@${x.at}(${x.x},${x.y})`).sort();
  assert.deepEqual(wolves(more), wolves(a));
});

test("the dial and the season: no schedule when the dial is off, before it, or before the Mists", () => {
  const secret = secretFor(MASTER, 270);
  assert.deepEqual(scheduleFor(270, secret, { ...INPUTS, fromCrossing: null }).spawns, [], "null is off");
  assert.deepEqual(scheduleFor(270, secret, { ...INPUTS, fromCrossing: undefined }).spawns, [], "absent is off");
  assert.deepEqual(scheduleFor(270, secret, { ...INPUTS, fromCrossing: false }).spawns, [], "false is off");
  assert.deepEqual(scheduleFor(270, secret, { ...INPUTS, fromCrossing: 271 }).spawns, [], "before the launch crossing");
  assert.equal(scheduleFor(271, secretFor(MASTER, 271), { ...INPUTS, fromCrossing: 271 }).spawns.length, 9, "from it on");
  assert.deepEqual(scheduleFor(240, secretFor(MASTER, 240), { ...INPUTS, fromCrossing: 0 }).spawns, [], "no Mists before 244, no creatures");
});

test("the kinds in turn (Darko 2026-10-17 13:58): one creature a window from 259, a bat first, then raven, wolf and round again", () => {
  assert.deepEqual(scheduleFor(258, secretFor(MASTER, 258), STANDING), { crossing: 258, spawns: [], unplaced: [] }, "nothing before the launch window");
  const turn = { 259: "bat", 260: "raven", 261: "wolf", 262: "bat", 263: "raven", 264: "wolf", 265: "bat" };
  for (const [N, kind] of Object.entries(turn).map(([n, k]) => [Number(n), k])) {
    assert.deepEqual(countsFor(N, LAW.dials, LAW.fromCrossing), { [kind]: 1 }, `crossing ${N}: ${kind}'s turn`);
    for (let k = 0; k < 20; k += 1) {
      const sched = scheduleFor(N, secretFor(`turn ${k}`, N), STANDING);
      assert.deepEqual(sched.unplaced, [], `crossing ${N}: the one creature finds a place`);
      assert.deepEqual(sched.spawns.map((s) => s.id), [creatureId(kind, N, 1)], `crossing ${N}: one ${kind}, no other`);
    }
  }
  // the turn counts from the launch dial, so a later launch still opens on a bat
  assert.deepEqual(countsFor(300, LAW.dials, 300), { bat: 1 });
  assert.deepEqual(countsFor(301, LAW.dials, 300), { raven: 1 });
  // no rotation: every kind at its own count, as before
  assert.deepEqual(countsFor(259, FULL, 259), FULL.counts);
});

test("one a window holds the same ground rules: on land, off the town, never on the water, and its window audits", () => {
  const rings = townWaterRings(MARKS);
  let checked = 0;
  for (let N = 259; N <= 290; N += 1) {
    for (let k = 0; k < 10; k += 1) {
      for (const sp of scheduleFor(N, secretFor(`turn water ${k}`, N), STANDING).spawns) {
        assert.ok(!rings.some((r) => pointInPolygon(sp.x, sp.y, r)), `${sp.id} (${sp.x}, ${sp.y}) stands on the town's water`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 320, "one a window, every window placed");
  const N = 259, secret = secretFor(MASTER, N), sched = scheduleFor(N, secret, STANDING), { endMs } = windowOf(N);
  const acts = [
    { actor: TOWN, action: "seed", object: `window-${N}`, at: t(windowOf(N).startMs), payload: { crossing: N, world_sha: SHA, commitment: commitmentOf(secret, SHA) } },
    ...sched.spawns.map((s) => ({ actor: TOWN, action: "spawn", object: s.id, at: s.at, payload: { kind: s.kind, crossing: N, x: s.x, y: s.y, at: s.at, fades_at: s.fades_at } })),
    { actor: TOWN, action: "reveal", object: `window-${N}`, at: t(endMs), payload: { crossing: N, secret } },
  ];
  assert.deepEqual(auditWindow(N, acts, STANDING), { ok: true, problems: [] }, "the bat's window re-derives from its reveal");
  const asFull = auditWindow(N, acts, { ...STANDING, dials: FULL });
  assert.equal(asFull.ok, false, "read without the rotation, the same log is short eight creatures");
});

test("the rotation dial is read whole: a list of the class's own kinds, or refused", () => {
  const cls = (rotation) => ({ kind: "class", by: TOWN, class: "creature", dials: { from_crossing: 270, rotation, band_from_m: 0, band_to_m: 400, keep_m: 440, apart_m: 150, span_h: 12 } });
  const kind = (k) => ({ kind: "class", by: TOWN, class: k, extends: "creature", dials: { count_per_window: 1 }, kind_file: `WORLD/kinds/${k}.kind` });
  assert.deepEqual(creatureLaw([cls(["bat", "wolf"]), kind("bat"), kind("wolf")]).dials.rotation, ["bat", "wolf"]);
  assert.equal("rotation" in creatureLaw([cls(null), kind("bat")]).dials, false, "null: no rotation");
  for (const bad of [[], ["bat", "owl"], "bat", 3, {}])
    assert.throws(() => creatureLaw([cls(bad), kind("bat"), kind("wolf")]), /rotation dial/, `${JSON.stringify(bad)} is refused`);
});

test("the launch dial fails closed: nothing but a whole crossing number turns it on", () => {
  for (const on of [268, 0, "268", "0"]) assert.equal(creaturesOn(270, on), true, `${JSON.stringify(on)} is on`);
  assert.equal(creaturesOn(270, 271), false, "not before its crossing");
  for (const off of [null, undefined, false, true, "", " ", [], [268], {}, NaN, Infinity, -1, 268.5, "268.5", "x", "0x10", "1e2", " 268"])
    assert.equal(creaturesOn(270, off), false, `${String(JSON.stringify(off))} is off`);
});

test("hidden until each spawn: the tick is told only what is due", () => {
  const sched = scheduleFor(270, secretFor(MASTER, 270), INPUTS);
  const { startMs, endMs } = windowOf(270);
  assert.deepEqual(dueSpawns(sched, startMs - 1), []);
  const mid = sched.spawns[4].at_ms;
  assert.deepEqual(dueSpawns(sched, mid).map((s) => s.id), sched.spawns.filter((s) => s.at_ms <= mid).map((s) => s.id));
  assert.equal(dueSpawns(sched, endMs).length, sched.spawns.length);
});

// The window's log as the tick writes it: every row dated when it is written,
// `lateMs` after the instant it stands for, with the schedule in its payload.
function windowLog(N, { lateMs = 0, tamper = null } = {}) {
  const secret = secretFor(MASTER, N), sched = scheduleFor(N, secret, INPUTS), { startMs, endMs } = windowOf(N);
  const w = (ms) => t(ms + lateMs);
  const acts = [{ at: w(startMs), actor: TOWN, action: "seed", object: null, payload: { crossing: N, world_sha: SHA, commitment: commitmentOf(secret, SHA) } }];
  for (const s of sched.spawns) acts.push({ at: w(s.at_ms), actor: TOWN, action: "spawn", object: s.id,
    payload: { crossing: N, kind: s.kind, at: s.at, x: s.x, y: s.y, fades_at: s.fades_at, moods: { fear: 1, curiosity: 1 }, flags: [] } });
  acts.push({ at: w(endMs), actor: TOWN, action: "reveal", object: null, payload: { crossing: N, secret } });
  if (tamper) tamper(acts);
  return { acts, sched, secret };
}

test("the reveal re-derives the window: the audit passes on the tick's log, late rows included, and names any tampering", () => {
  assert.deepEqual(auditWindow(270, windowLog(270).acts, INPUTS), { ok: true, problems: [] });
  assert.deepEqual(auditWindow(270, windowLog(270, { lateMs: 20000 }).acts, INPUTS), { ok: true, problems: [] }, "a tick 20 s late is not a tampered log");
  const early = auditWindow(270, windowLog(270, { tamper: (a) => { const r = a.find((x) => x.action === "spawn"); r.at = t(Date.parse(r.payload.at) - 1000); } }).acts, INPUTS);
  assert.ok(early.problems.some((p) => /before its minute/.test(p)), early.problems.join("; "));
  const moved = auditWindow(270, windowLog(270, { tamper: (a) => { a.find((x) => x.action === "spawn").payload.x += 1; } }).acts, INPUTS);
  assert.equal(moved.ok, false);
  assert.ok(moved.problems.some((p) => /not in the log/.test(p)) && moved.problems.some((p) => /not the schedule's/.test(p)), moved.problems.join("; "));
  const swapped = auditWindow(270, windowLog(270, { tamper: (a) => { a.at(-1).payload.secret = secretFor(MASTER, 271); } }).acts, INPUTS);
  assert.deepEqual(swapped.problems, ["crossing 270: the revealed secret and the seed's world sha do not hash to the seed's commitment"]);
  const extra = auditWindow(270, windowLog(270, { tamper: (a) => { a.push({ ...a[1], object: creatureId("wolf", 270, 9) }); } }).acts, INPUTS);
  assert.equal(extra.ok, false);
  assert.deepEqual(auditWindow(270, [], INPUTS).problems, ["crossing 270: no seed act", "crossing 270: no reveal act"]);
});

test("the audit counts: one seed, one reveal, each spawn once", () => {
  const first = windowLog(270).acts[1].object;
  const doubled = auditWindow(270, windowLog(270, { tamper: (a) => { a.push({ ...a[1] }); } }).acts, INPUTS);
  assert.deepEqual(doubled.problems, [`crossing 270: ${first} is spawned 2 times (each spawn is written once)`]);
  const twoSeeds = auditWindow(270, windowLog(270, { tamper: (a) => { a.push({ ...a[0], payload: { ...a[0].payload, commitment: "f".repeat(64) } }); } }).acts, INPUTS);
  assert.deepEqual(twoSeeds.problems, ["crossing 270: 2 seed acts (one window, one seed)"]);
  const twoReveals = auditWindow(270, windowLog(270, { tamper: (a) => { a.push({ ...a.at(-1) }); } }).acts, INPUTS);
  assert.deepEqual(twoReveals.problems, ["crossing 270: 2 reveal acts (one window, one reveal)"]);
});

test("the seed pins the window to a world sha, and the audit refuses inputs read at another", () => {
  const other = auditWindow(270, windowLog(270).acts, { ...INPUTS, world_sha: "0".repeat(40) });
  assert.equal(other.ok, false);
  assert.match(other.problems[0], /the seed pins world e5bb5aa5\w+, and these inputs were read at 0{40}: read them at the seed's sha/);
  const unpinned = auditWindow(270, windowLog(270, { tamper: (a) => { delete a[0].payload.world_sha; } }).acts, INPUTS);
  assert.deepEqual(unpinned.problems, ["crossing 270: the seed names no world sha"]);
});

test("the fold: spawned, revised by its own acts, gone by `fled` at once or `faded` at 12 h, written or not", () => {
  const { acts, sched } = windowLog(270, { lateMs: 15000 });
  const [a, b, c] = sched.spawns;
  const later = [
    { at: t(b.at_ms + 60000), actor: b.id, action: "react", object: "act-1", payload: { reaction: "snarl", moods_after: { fear: 2, curiosity: 1 }, flags_after: ["startled"] } },
    { at: t(b.at_ms + 70000), actor: b.id, action: "snarl", object: "act-2", payload: { moods_after: { fear: 0, curiosity: 0 }, flags_after: [] } },   // not a reaction row: folds nothing
    { at: t(c.at_ms + 120000), actor: c.id, action: "react", object: "act-3", payload: { reaction: "flee", moods_after: { fear: 3, curiosity: 1 }, flags_after: [] } },
    { at: t(c.at_ms + 120000), actor: TOWN, action: "withdraw", object: c.id, payload: { reason: "fled" } },
    { at: t(b.at_ms + 90000), actor: "kogane", action: "say", object: null, payload: { text: "hello" } },   // a resident's act is not the creature's
  ];
  const all = [...acts, ...later];
  const at = (ms) => creaturesAt(null, all, ms);
  assert.equal(at(a.at_ms + 14999).has(a.id), false, "not before its row is written");
  assert.deepEqual(at(a.at_ms + 15000).get(a.id), { id: a.id, kind: a.kind, crossing: 270, x: a.x, y: a.y, spawned_at: a.at, fades_at: a.fades_at, moods: { fear: 1, curiosity: 1 }, flags: [] },
    "spawned_at is the scheduled minute, not the write");
  const bLive = at(b.at_ms + 120000).get(b.id);
  assert.deepEqual([bLive.moods, bLive.flags], [{ fear: 2, curiosity: 1 }, ["startled"]], "its own `react` row revises it; any other action of its folds nothing");
  assert.equal(at(c.at_ms + 119999).has(c.id), true);
  assert.equal(at(c.at_ms + 120000).has(c.id), false, "fled: gone at once");
  assert.equal(at(Date.parse(a.fades_at) - 1).has(a.id), true);
  assert.equal(at(Date.parse(a.fades_at)).has(a.id), false, "faded at 12 h, before the tick writes it");
  const due = dueFades(null, all, Date.parse(a.fades_at));
  assert.ok(due.some((f) => f.id === a.id && f.reason === "faded" && f.fades_at === a.fades_at), "the tick is told to write the fade, with the span's end for its payload");
  assert.ok(!due.some((f) => f.id === c.id), "a fled creature never fades");
  const written = [...all, { at: t(Date.parse(a.fades_at) + 25000), actor: TOWN, action: "withdraw", object: a.id, payload: { reason: "faded", fades_at: a.fades_at } }];
  assert.ok(dueFades(null, written, Date.parse(a.fades_at) + 24999).some((f) => f.id === a.id), "due until its row is written");
  assert.ok(!dueFades(null, written, Date.parse(a.fades_at) + 25000).some((f) => f.id === a.id), "a written fade is not due again");
});

test("a reaction row's state: moods only from a plain object, flags sorted on the live read as in the photograph", () => {
  const { acts, sched } = windowLog(270);
  const a = sched.spawns[0], now = a.at_ms + 3600e3;
  const react = (payload, dt) => ({ at: t(a.at_ms + dt), actor: a.id, action: "react", object: `act-${dt}`, payload });
  const live = (rows) => creaturesAt(null, [...acts, ...rows], now).get(a.id);
  assert.deepEqual(live([react({ moods_after: { fear: 2 } }, 60000), react({ moods_after: [3, 3] }, 61000)]).moods, { fear: 2 }, "an array is no state: the last plain one holds");
  assert.deepEqual(live([react({ moods_after: { fear: 2 } }, 60000), react({ moods_after: new Date(0) }, 61000)]).moods, { fear: 2 }, "nor a date");
  assert.deepEqual(live([react({ flags_after: ["startled", "fed"] }, 60000)]).flags, ["fed", "startled"], "sorted on the live read");
  const snap = creaturesSnapshot(271, now, null, [...acts, react({ flags_after: ["startled", "fed"] }, 60000)]);
  assert.deepEqual(snap.creatures.find((c) => c.id === a.id).flags, live([react({ flags_after: ["startled", "fed"] }, 60000)]).flags, "the live read and the photograph agree");
});

test("only the-town or the creature itself withdraws it, and only for a lawful reason", () => {
  const { acts, sched } = windowLog(270);
  const a = sched.spawns[0], now = a.at_ms + 3600e3;
  const rows = (w) => [...acts, { at: t(a.at_ms + 60000), object: a.id, action: "withdraw", ...w }];
  assert.equal(creaturesAt(null, rows({ actor: "some-resident", payload: { reason: "fled" } }), now).has(a.id), true, "a resident's withdraw is not the record's");
  assert.equal(creaturesAt(null, rows({ actor: TOWN, payload: { reason: "because" } }), now).has(a.id), true, "a reason outside DESPAWN_REASONS is not the record's");
  assert.equal(creaturesAt(null, rows({ actor: TOWN, payload: {} }), now).has(a.id), true, "no reason is not a reason");
  assert.equal(creaturesAt(null, rows({ actor: sched.spawns[1].id, payload: { reason: "fled" } }), now).has(a.id), true, "another creature cannot withdraw it");
  assert.equal(creaturesAt(null, rows({ actor: a.id, payload: { reason: "fled" } }), now).has(a.id), false, "it may flee by its own act");
  assert.equal(creaturesAt(null, rows({ actor: TOWN, payload: { reason: "faded" } }), now).has(a.id), false);
});

test("the save photographs the written fold: a fade not yet written stays in it, stays due, and folds once written", () => {
  // the review's probe: a fade 10 s before a save, with the tick not yet run
  const N = 270, { acts, sched } = windowLog(N);
  const first = sched.spawns[0];
  const saveMs = Date.parse(first.fades_at) + 10000;
  const snap = JSON.parse(JSON.stringify(creaturesSnapshot(N + 1, saveMs, null, acts)));
  assert.ok(snap.creatures.some((c) => c.id === first.id), "in the photograph: spawned and not yet withdrawn");
  assert.equal(creaturesAt(snap, [], saveMs).has(first.id), false, "but no read sees it: its span is over");
  assert.ok(dueFades(snap, [], saveMs + 20000).some((f) => f.id === first.id), "and its fade is still due after the save");
  const fade = { at: t(saveMs + 20000), actor: TOWN, action: "withdraw", object: first.id, payload: { reason: "faded", fades_at: first.fades_at } };
  assert.ok(!dueFades(snap, [fade], saveMs + 20000).some((f) => f.id === first.id), "the fade written after the save folds");
  assert.equal(creaturesWritten(snap, [fade], saveMs + 20000).has(first.id), false);
});

test("snapshot parity: a chain of saves plus the rows since folds to the same creatures as the whole log", () => {
  const { acts: a270, sched } = windowLog(270, { lateMs: 12000 });
  const b = sched.spawns[1];
  const revise = { at: t(b.at_ms + 60000), actor: b.id, action: "react", object: "act-1", payload: { reaction: "snarl", moods_after: { fear: 3, curiosity: 0 }, flags_after: [] } };
  const base = [...a270, revise, ...windowLog(271, { lateMs: 12000 }).acts, ...windowLog(272, { lateMs: 12000 }).acts];
  // the tick writes each fade 25 s after it falls
  const fades = [...creaturesWritten(null, base, Infinity).values()]
    .map((c) => ({ at: t(Date.parse(c.fades_at) + 25000), actor: TOWN, action: "withdraw", object: c.id, payload: { reason: "faded", fades_at: c.fades_at } }));
  const all = [...base, ...fades];
  let saved = null;
  for (const N of [271, 272, 273]) {
    const boundary = windowOf(N).startMs;
    const since = (snap) => all.filter((r) => Date.parse(r.at) > (snap ? Date.parse(snap.evaluated_at) : -Infinity));
    const snap = JSON.parse(JSON.stringify(creaturesSnapshot(N, boundary, saved, since(saved))));
    assert.equal(snap.creature_count, snap.creatures.length);
    assert.ok(snap.creatures.every((c) => !("memory" in c)), "no memory is saved");
    assert.deepEqual(snap, JSON.parse(JSON.stringify(creaturesSnapshot(N, boundary, null, all))), `the chained save at ${N} equals the whole-log save`);
    for (const ms of [boundary + 1, boundary + 6 * 3600e3]) {
      assert.deepEqual([...creaturesAt(snap, since(snap), ms).keys()].sort(), [...creaturesAt(null, all, ms).keys()].sort(), `the same creatures at ${t(ms)}`);
    }
    saved = snap;
  }
  assert.ok(saved.creatures.every((c) => c.crossing === 272), "270's and 271's have all faded and been written by 273");
});

test("ids: the creature: prefix keeps them out of the handle namespace", () => {
  assert.equal(creatureId("wolf", 268, 1), "creature:wolf-268-1");
  assert.equal(isCreatureId("creature:wolf-268-1"), true);
  assert.equal(isCreatureId("wolf-268-1"), false);
  assert.equal(isCreatureId(undefined), false);
});
