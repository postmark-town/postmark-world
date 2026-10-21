// creature-ramp.test.mjs — the Mists ramp toward Halloween (WLD-96; Darko
// 2026-10-21 09:21: "slowly ramped up the number of creatures spawning per
// settlement as we approach halloween, maybe to 20 total creatures max").
//
// A kind's count_per_window may be a schedule keyed by crossing; window N reads
// its count at N, so a window already passed never re-decides. The ramp: 6 today,
// then 8, 9, 11, 12, 14, 15, 17, 18, 19 and 20 by EDT day from 10-22 (each day's
// first window, 12:00Z), held at 20 from 10-31. Ravens the most, then bats, then
// wolves (at most 4); never more than 20 in a window.
//
// THE CAN-FAIL FLIPS (each reds a case below): read a schedule's first step for
// every crossing; let a schedule's crossings fall back; raise any step so a
// window passes 20.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { TOWN, countAt, countsFor, creatureLaw, scheduleFor, secretFor, windowOf } from "./creatures.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const marks = loadMarks(join(ROOT, "WORLD", "marks"));
const LAW = creatureLaw(marks);
const total = (N) => Object.values(countsFor(N, LAW.dials, LAW.fromCrossing)).reduce((a, b) => a + b, 0);

test("the ramp by EDT day: 6 until 10-22, then 8 · 9 · 11 · 12 · 14 · 15 · 17 · 18 · 19 · 20, held at 20", () => {
  assert.equal(new Date(windowOf(265).startMs).toISOString(), "2026-10-22T12:00:00.000Z", "10-22's first window after its first settlement");
  for (let N = 259; N <= 264; N += 1) assert.equal(total(N), 6, `crossing ${N}: as before the ramp`);
  const days = [8, 9, 11, 12, 14, 15, 17, 18, 19, 20];
  days.forEach((n, k) => {
    assert.equal(total(265 + 2 * k), n, `10-${22 + k} (crossing ${265 + 2 * k})`);
    assert.equal(total(266 + 2 * k), n, `10-${22 + k}'s second window (crossing ${266 + 2 * k})`);
  });
  for (let N = 283; N <= 340; N += 1) assert.equal(total(N), 20, `crossing ${N}: held at 20`);
});

test("every window: never more than 20, ravens the most, then bats, then wolves, and at most 4 wolves", () => {
  for (let N = 259; N <= 340; N += 1) {
    const c = countsFor(N, LAW.dials, LAW.fromCrossing);
    assert.ok(total(N) <= 20, `crossing ${N}: ${total(N)} is past 20`);
    assert.ok(c.raven > c.bat && c.bat > c.wolf, `crossing ${N}: ravens ${c.raven} > bats ${c.bat} > wolves ${c.wolf}`);
    assert.ok(c.wolf <= 4, `crossing ${N}: ${c.wolf} wolves`);
  }
});

test("a schedule is read at its own crossing; a plain number still works; a bad schedule is refused whole", () => {
  const s = [{ from_crossing: 10, count: 2 }, { from_crossing: 20, count: 5 }];
  assert.deepEqual([9, 10, 19, 20, 99].map((N) => countAt(s, N)), [0, 2, 2, 5, 5], "none before its first step");
  assert.equal(countAt(3, 999), 3);
  const withCount = (kind, v) => marks.map((m) => (m.kind === "property" && m.name === "count_per_window" && String(m.parent).endsWith(`/${kind}`) ? { ...m, default: v } : m));
  assert.equal(creatureLaw(withCount("wolf", 2)).dials.counts.wolf, 2, "a plain number");
  assert.deepEqual(creatureLaw(withCount("wolf", JSON.stringify(s))).dials.counts.wolf, s, "its JSON text");
  assert.throws(() => creatureLaw(withCount("wolf", [{ from_crossing: 20, count: 1 }, { from_crossing: 10, count: 2 }])), /its crossings rise/);
  assert.throws(() => creatureLaw(withCount("wolf", [{ from_crossing: 1, count: 1.5 }])), /both whole numbers/);
  assert.throws(() => creatureLaw(withCount("wolf", [])), /not a whole number or a schedule/);
  assert.throws(() => creatureLaw(withCount("wolf", "lots")), /not a whole number or a schedule/);
  assert.equal(TOWN, "the-town");
});

test("apart_m still fits 20 a window in the band: every spawn placed, none closer than apart_m", () => {
  const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD", "skeleton.json"), "utf8"));
  const standing = JSON.parse(readFileSync(join(ROOT, "WORLD", "world-state.json"), "utf8")).marks;
  const inputs = { mists: skeleton.mists, marks: standing, dials: LAW.dials, fromCrossing: LAW.fromCrossing };
  for (const N of [283, 290, 300]) for (let k = 0; k < 4; k += 1) {
    const s = scheduleFor(N, secretFor(`ramp ${k}`, N), inputs);
    assert.deepEqual(s.unplaced, [], `crossing ${N}: all 20 find a place`);
    assert.equal(s.spawns.length, 20);
    for (let i = 0; i < s.spawns.length; i += 1) for (let j = i + 1; j < s.spawns.length; j += 1)
      assert.ok(Math.hypot(s.spawns[i].x - s.spawns[j].x, s.spawns[i].y - s.spawns[j].y) >= LAW.dials.apart_m, `crossing ${N}: two spawns closer than apart_m`);
  }
});
