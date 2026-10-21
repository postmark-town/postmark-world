// walk-from-record.test.mjs — play row 69, RULED (Darko 2026-10-16 19:03–19:04):
// "polling for your location is dumb when you literally declare the exact
// trajectory of your walk … we can keep the 15 second for like finding new
// walks and stuff, but … for your own walks, it should just be literally the
// like from what you declared." A body on a walk the page holds the record of
// is drawn where the world's own positionAt puts it, every frame while it
// moves; the reader's own walk from the moment its act answers; a stop the
// poll reports is an event.
// Run: node --test tools/walk-from-record.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { liveWalkerAt, onRecordedWalk, walkerCandidatesAt, walkerHoverId } from "../spectator/viewer.mjs";
import { positionAt, fractionalCrossing } from "./walk.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
// a 20 m walk inside the Spire at 60 km a crossing (5 km/h): about 14 s
const t0 = Date.parse("2026-10-16T23:10:00Z");
const at0 = fractionalCrossing(t0);
const record = { handle: "visitor", from: { x: 3817.5, y: -5529.5 }, toward: { x: 3817.5, y: -5549.5 }, at: at0, pace: 60, targetExtent: null };
const sec = (n) => fractionalCrossing(t0 + n * 1000);
const before = { handle: "visitor", x: 3817.5, y: -5529.5, moving: false, toward: null };   // the last poll, before the walk

test("your own walk is drawn from what it declared, the moment it answers, at positionAt's place", () => {
  for (const n of [0, 1, 3.5, 7, 10]) {
    const w = liveWalkerAt(before, { record, declaredMs: t0, polledMs: t0 - 5000, nowCrossing: sec(n) });
    const p = positionAt(record, sec(n));
    assert.deepEqual([w.x, w.y], [p.x, p.y], `at ${n} s`);
    assert.equal(w.moving, !p.arrived);
  }
  // it moves continuously: no 15 s jump, every second a little further
  const ys = [0, 1, 2, 3, 4, 5].map((n) => liveWalkerAt(before, { record, declaredMs: t0, polledMs: t0 - 5000, nowCrossing: sec(n) }).y);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] < ys[i - 1] && ys[i - 1] - ys[i] < 2, "about 1.4 m a second, never a jump");
  const done = liveWalkerAt(before, { record, declaredMs: t0, polledMs: t0 - 5000, nowCrossing: sec(30) });
  assert.equal(done.moving, false);
  assert.ok(Math.abs(done.y - record.toward.y) < 1e-9, "and it arrives where the record says");
});

test("everyone else between polls: the record the poll's walk is on, at positionAt's place", () => {
  const polled = { handle: "visitor", ...positionAt(record, sec(4)), moving: true, toward: record.toward };
  const w = liveWalkerAt(polled, { record, declaredMs: t0, polledMs: t0 + 4000, nowCrossing: sec(9) });
  assert.deepEqual([w.x, w.y], [positionAt(record, sec(9)).x, positionAt(record, sec(9)).y]);
  // a row with no toward (the earshot read's) is on this walk when the record put it where the poll saw it
  const bare = { handle: "visitor", x: polled.x, y: polled.y, moving: true };
  assert.ok(onRecordedWalk(bare, record, sec(4)));
  assert.ok(!onRecordedWalk({ ...bare, y: polled.y + 40 }, record, sec(4)), "40 m off is another walk");
});

test("a stop the poll reports is an event: the poll's place wins; an unknown walk stays where the poll saw it", () => {
  const stopped = { handle: "visitor", x: 3817.5, y: -5535, moving: false, toward: null };   // entered a door mid-walk
  assert.deepEqual(liveWalkerAt(stopped, { record, declaredMs: t0, polledMs: t0 + 6000, nowCrossing: sec(9) }), stopped);
  const other = { handle: "visitor", x: 3900, y: -5400, moving: true, toward: { x: 4000, y: -5400 } };
  assert.deepEqual(liveWalkerAt(other, { record, declaredMs: t0, polledMs: t0 + 6000, nowCrossing: sec(9) }), other);
  assert.equal(liveWalkerAt(other, {}), other, "no record, the poll's word");
});

test("pins: drawn from the record each frame while something moves, never in a hidden tab, never re-implemented", () => {
  assert.match(SOURCE, /import \{[^}]*\bpositionAt\b[^}]*\} from "\.\.\/tools\/walk\.mjs";/);
  assert.match(SOURCE, /const inView = sceneWalkerSet\(\{ walkers: \(walkState\.walkers \?\? \[\]\)\.map\(liveBody\),/);
  assert.match(SOURCE, /function animateWalks\(\) \{\s*if \(walkFrame \|\| \(typeof document !== "undefined" && document\.hidden\)\) return;/);
  assert.match(SOURCE, /if \(!moving\(\)\.length\) return;/, "nothing runs while all are still");
  assert.match(SOURCE, /walkFrame = requestAnimationFrame\(tick\);/);
  // your own walk: the record from the act's answer, drawn before the poll is even asked
  assert.match(SOURCE, /ownWalkDeclared\(handle, response\.body\);\s*await pollWalkers\(\);/);
  assert.match(SOURCE, /ownWalkDeclared\(state\.handle, answer\);/);
  // a landing is an event drawn in that frame
  assert.match(SOURCE, /if \(answer\.landed\) ownStopAt\(state\.handle, answer\.landed\);/);
  // the walk records come from the walk ledger the page already reads, and a new walk asks once
  assert.match(SOURCE, /recordsFromDepartures\(departures\);/);
  assert.match(SOURCE, /\/world2\/walks\?since=/);
});

// ── fix 69's reload (Darko 19:18): "Reloading during a walk breaks everything
// until you could reach your destination." ──────────────────────────────────
test("a page loaded mid-walk draws your own walker at positionAt(record, now) from its first render", () => {
  // the page loaded 7 s into the walk: the first rows are the read's, which still say "standing at the start"
  const stale = { handle: "visitor", x: record.from.x, y: record.from.y, moving: false, toward: null };
  for (const n of [7, 8, 10]) {
    const w = liveWalkerAt(stale, { record, declaredMs: t0, polledMs: t0 + 7000, nowCrossing: sec(n), own: true });
    const p = positionAt(record, sec(n));
    assert.deepEqual([w.x, w.y], [p.x, p.y], `at ${n} s, not frozen at the start`);
    assert.equal(w.moving, true);
  }
  // at rest, the poll is the truth again; a crossing after the walk began stops it
  assert.deepEqual(liveWalkerAt(stale, { record, declaredMs: t0, polledMs: t0 + 40000, nowCrossing: sec(40), own: true }), stale);
  const entered = { handle: "visitor", x: 3817.5, y: -5536, moving: false };
  assert.deepEqual(liveWalkerAt(entered, { record, declaredMs: t0, polledMs: t0 + 9000, nowCrossing: sec(9), own: true, crossedMs: t0 + 5000 }), entered);
});

test("pins: the one hour-floored walks read, asked first and awaited by the first poll; never a millisecond since", () => {
  assert.match(SOURCE, /const walkWindowSince = \(\) => new Date\(Math\.floor\(\(Date\.now\(\) - walkWindowDays \* 86_400_000\) \/ 3_600_000\) \* 3_600_000\)\.toISOString\(\);/);
  assert.match(SOURCE, /const walkLedgerOnce = \(\) => \(walkLedgerFirst \?\?= loadWalkLedger\(\)\);/);
  assert.match(SOURCE, /\(async \(\) => \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*walkLedgerOnce\(\);/, "asked as the page boots");
  assert.match(SOURCE, /Promise\.resolve\(walkLedgerOnce\(\)\)\.catch\(\(\) => \{\}\)\s*\.then\(\(\) => pollWalkers\(\)\)/, "the first poll waits for it");
  assert.match(SOURCE, /Promise\.allSettled\(\[walkLedgerOnce\(\), settlements, loadStakeEvents\(\)\]\)/, "Lately shares it");
  const ask = SOURCE.slice(SOURCE.indexOf("function askNewWalkRecords(rows) {"), SOURCE.indexOf("let walkFrame = 0"));
  assert.match(ask, /loadWalkLedger\(\)/);
  assert.doesNotMatch(ask, /fetch\(|toISOString/, "no read of its own, no millisecond since");
  assert.doesNotMatch(SOURCE, /\/world2\/walks\?since=\$\{encodeURIComponent\(since\)\}`\), \{ credentials/, "the old per-walk read is gone");
});

test("arriving lands where the record says, even while the last poll still saw it walking", () => {
  const midway = { handle: "visitor", ...positionAt(record, sec(6)), moving: true };   // polled at 6 s, the walk ends at ~14 s
  const w = liveWalkerAt(midway, { record, declaredMs: t0, polledMs: t0 + 6000, nowCrossing: sec(20), own: true });
  assert.equal(w.moving, false);
  assert.ok(Math.abs(w.y - record.toward.y) < 1e-9, "at the walk's end, not snapped back to the poll's mid-walk point");
});

// ── fix 85 (Darko 19:55, a real walk-there-and-enter the Spire as darko): "It is not
// moving on the next frame. It stayed completely still. and then jumped to the edge." ──
test("a walk to a big mark is drawn from the record's rim point, never inside the mark's extent", () => {
  // the office's record for that walk: toward the Spire's rim, no `within`
  const toSpire = { handle: "darko", from: { x: 3748, y: -5512 }, toward: { x: 3775, y: -5512 }, at: at0, pace: 60, targetExtent: null };
  assert.equal(positionAt(toSpire, sec(5)).arrived, false, "the record's own way: walking");
  assert.ok(positionAt(toSpire, sec(5)).x > 3748 + 5);
  // the old page laid the Spire's whole extent (236 × 176) around that rim point: the walker started inside it
  const invented = { ...toSpire, targetExtent: { w: 236, h: 176 } };
  assert.equal(positionAt(invented, sec(5)).arrived, true, "arrived at once: the stand-still Darko saw");
  assert.equal(positionAt(invented, sec(5)).x, 3748);
});

test("pins: your own walk's record takes only the answer's extent; a queued entry is followed from the arrival", () => {
  assert.match(SOURCE, /targetExtent: body\.within && Number\(body\.within\.w\) > 0 \? \{ w: Number\(body\.within\.w\), h: Number\(body\.within\.h\) \} : null,/);
  assert.doesNotMatch(SOURCE, /targetExtent: target\?\.extent \?/, "never the mark's extent");
  assert.match(SOURCE, /if \(body\.entry\?\.queued_for_arrival\) followArrival\(body\.arrives_at, body\.entry\?\.eta\);/);
  assert.match(SOURCE, /function followArrival\(arrivesAt, etaCrossing\) \{[\s\S]*?loadEnterExitLedger\(\)\.then\(\(\) => \{\s*if \(crossingsSignature\(enterExitLedger\.acts\) !== before\) \{ renderCurrent\(\); return; \}/);
});

// WLD-94 (Darko 2026-10-20 21:52): the face walked on along its dashed path, and
// its hover disc and click target stayed at the poll's older point.
test("the hit target stands where the body is drawn: a body mid-walk is a candidate at its live place, not the poll's", () => {
  const polled = { handle: "visitor", ...positionAt(record, sec(2)), moving: true, toward: record.toward };
  const bodyOf = (w) => liveWalkerAt(w, { record, declaredMs: t0, polledMs: t0 + 2000, nowCrossing: sec(9) });
  const drawn = bodyOf(polled);
  assert.ok(Math.abs(drawn.y - polled.y) > 5, "the fixture: the drawn body is metres from the poll's row");
  const toScreen = (w) => ({ x: (w.x - 3800) * 10, y: (w.y + 5500) * 10 });
  const [c] = walkerCandidatesAt([polled], { bodyOf, toScreen });
  assert.equal(c.id, walkerHoverId("visitor"));
  assert.deepEqual([c.x, c.y], [toScreen(drawn).x, toScreen(drawn).y], "at the drawn place");
  // a row with no place, or no handle, is no candidate; a boat (no hit disc) still is
  assert.deepEqual(walkerCandidatesAt([{ handle: "x", x: NaN, y: 0 }, { x: 1, y: 1 }], { toScreen }), []);
  assert.equal(walkerCandidatesAt([{ handle: "the-ferry", x: 3810, y: -5510 }], { toScreen }).length, 1);
});

test("pins: the snap, the click and the hover disc place each body through liveBody, and the disc follows it", () => {
  assert.match(SOURCE, /function screenWalkerCandidates\(\) \{[\s\S]*?return walkerCandidatesAt\(walkState\.walkers, \{ bodyOf: liveBody, toScreen:/);
  assert.match(SOURCE, /function renderWalkerHighlight\(handle\) \{[\s\S]*?const w = row \? liveBody\(row\) : null;/);
  assert.match(SOURCE, /function writeWalkLayer\(markup, drawnWalkers\) \{[\s\S]*?if \(walkerHandleFromHoverId\(lit\.selectedId\) \|\| walkerHandleFromHoverId\(lit\.hoveredId\)\) renderMarkHighlight\(\);/);
});
