// walker-live-once.test.mjs — THE WALKERS ARE EVALUATED ONCE A FRAME, AND THE LEDGER READ ONCE (WLD-243, Wright 2026-11-24 05:03Z).
//
// ── THE INSTANCE ───────────────────────────────────────────────────────────
// With the placement cost gone (#435), the Town Centre's page was still ~99.7 % busy at idle (WLD-243's matched 4x pair): the animation tick asked "who is
// moving?" by running liveWalkerAt over EVERY walker (~400 rows), the draw it triggered ran liveWalkerAt over every walker again for the same frame, and each
// evaluation scanned the whole crossing ledger (Date.parse per act) for that one handle: `liveBody` was 35-43 % of the idle and pan windows.
//
// ── WHAT THIS FILE PROVES ──────────────────────────────────────────────────
//  (1) `latestCrossingMsByHandle` is one pass and answers, for every handle, what `crossedMsOf` answered by scanning (0 for a handle with no crossing, an act
//      with no readable time counted as 0, an unordered ledger).
//  (2) `liveWalkerRows` is `liveWalkerAt` over every row: arrival with no poll in between, a crossing that stops a walk, the reader's own walk, a row with no
//      record staying the very same object, a ledger that was replaced, a clock that moved. Nothing is kept between calls.
//  (3) THE TICK-TO-DRAW HANDOFF, executed from the page's own source: one evaluation of the walkers per frame, one ledger pass per frame, the draw is handed
//      THAT answer; an arrival with no poll ends the loop with the resting redraw; a crossing and a replaced ledger are seen on the next frame; a hidden tab
//      does nothing; the half-pixel redraw decision is unchanged (no redraw, no draw, still no second evaluation).
//  (4) a standalone redraw (no animation frame) takes its own answer with one ledger pass; the draw works on a COPY (sceneWalkerSet returns its input and the
//      residents' switch empties the list); single-body readers still ask `liveBody`.
// Flips: in the tick, `drawWalkers(live)` → `drawWalkers()` and (3) reds on the shared answer; `const now = movingOf(live)` → `movingOf(liveWalkers())` and
// (3) reds on the count; in latestCrossingMsByHandle, keep the FIRST act instead of the newest and (1) reds.
//
//   node --test tools/walker-live-once.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

import { liveWalkerAt, liveWalkerRows, latestCrossingMsByHandle, crossingsMemoFor, sceneWalkerSet } from "../spectator/viewer.mjs";
import { positionAt, fractionalCrossing } from "./walk.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

// a 20 m walk at 60 km a crossing: about 14 s (walk-from-record.test.mjs's fixture)
const t0 = Date.parse("2026-10-16T23:10:00Z");
const sec = (n) => fractionalCrossing(t0 + n * 1000);
const at0 = fractionalCrossing(t0);
const record = (handle) => ({ handle, from: { x: 3817.5, y: -5529.5 }, toward: { x: 3817.5, y: -5549.5 }, at: at0, pace: 60, targetExtent: null });
const still = (handle) => ({ handle, x: 3817.5, y: -5529.5, moving: false, toward: null });   // the last poll, before the walk
const iso = (ms) => new Date(ms).toISOString();

// ── (1) the crossings, one pass ────────────────────────────────────────────────────────────────────────────

/** the scan the page used (crossedMsOf), kept here as the reference */
const crossedMsScan = (acts, handle) => { let t = 0; for (const a of acts ?? []) if (a.handle === handle) t = Math.max(t, Date.parse(a.iso) || 0); return t; };

test("(1) the newest crossing of every handle, from one pass, equals the scan for each handle", () => {
  const acts = [
    { handle: "ann", iso: iso(t0 + 5000), act: "enters" },
    { handle: "bob", iso: iso(t0 + 9000), act: "enters" },
    { handle: "ann", iso: iso(t0 + 1000), act: "exits" },      // older, after the newer one in the ledger: unordered
    { handle: "cy", iso: "not a time", act: "enters" },        // no readable time: counted as 0
    { handle: "ann", iso: iso(t0 + 7000), act: "enters" },
    { iso: iso(t0 + 99_000) },                                  // no handle: nobody's
    null,
  ];
  const map = latestCrossingMsByHandle(acts);
  for (const h of ["ann", "bob", "cy", "dee"]) assert.equal(map.get(h) ?? 0, crossedMsScan(acts.filter(Boolean), h), `handle ${h}`);
  assert.equal(map.get("ann"), t0 + 7000, "the newest, not the first or the last in the list");
  assert.equal(map.has("dee"), false);
  assert.deepEqual([...latestCrossingMsByHandle(undefined)], []);
  assert.deepEqual([...latestCrossingMsByHandle([])], []);
});

test("(1) it reads the ledger once: a Proxy over the acts sees one iteration however many handles ask", () => {
  let iterations = 0;
  const acts = new Proxy([{ handle: "a", iso: iso(t0) }, { handle: "b", iso: iso(t0 + 1) }], { get(t, k, r) { if (k === Symbol.iterator) iterations += 1; return Reflect.get(t, k, r); } });
  const map = latestCrossingMsByHandle(acts);
  for (const h of ["a", "b", "c", "d"]) map.get(h);
  assert.equal(iterations, 1);
});

// ── (2) liveWalkerRows is liveWalkerAt over every row ────────────────────────────────────────────────────

const ctxAt = (n, extra = {}) => ({
  records: new Map([["visitor", { record: record("visitor"), declaredMs: t0 }]]), polledMs: t0 - 5000, nowCrossing: sec(n), polledCrossing: sec(-5),
  ownHandle: null, crossedBy: new Map(), ...extra,
});
const same = (a, b) => assert.deepEqual(a, b);

test("(2) every row through liveWalkerAt: arrival with no poll, a crossing that stops the walk, the reader's own walk, a row with no record", () => {
  const rows = [still("visitor"), { handle: "stranger", x: 1, y: 2, moving: false }];
  // the walk, frame by frame with the poll never asked again: it moves, then it arrives and stands
  const ys = [0, 2, 4, 8, 12].map((n) => liveWalkerRows(rows, ctxAt(n))[0]);
  for (const [i, n] of [0, 2, 4, 8, 12].entries()) {
    const want = liveWalkerAt(rows[0], { record: record("visitor"), declaredMs: t0, polledMs: t0 - 5000, nowCrossing: sec(n), polledCrossing: sec(-5), own: false, crossedMs: 0 });
    same(ys[i], want);
  }
  assert.ok(ys[1].y < ys[0].y && ys[3].y < ys[2].y, "it moves between frames, no poll");
  const done = liveWalkerRows(rows, ctxAt(30))[0];
  assert.deepEqual([done.moving, done.arrived, done.standing], [false, true, true], "arrival without a poll");
  assert.ok(Math.abs(done.y - record("visitor").toward.y) < 1e-9);
  // a row with no record is the poll's word, the very object
  assert.equal(liveWalkerRows(rows, ctxAt(4))[1], rows[1]);
  // a crossing after the walk was declared stops it: the poll's place, whatever the clock says
  const stopped = liveWalkerRows(rows, ctxAt(4, { crossedBy: latestCrossingMsByHandle([{ handle: "visitor", iso: iso(t0 + 2500) }]) }))[0];
  assert.equal(stopped, rows[0]);
  // a crossing BEFORE the declaration does not
  const older = liveWalkerRows(rows, ctxAt(4, { crossedBy: latestCrossingMsByHandle([{ handle: "visitor", iso: iso(t0 - 2500) }]) }))[0];
  assert.equal(older.moving, true);
  // the reader's own walk: drawn from what it declared, even on a row the poll says is moving
  const own = liveWalkerRows([{ ...still("visitor"), moving: true }], ctxAt(4, { ownHandle: "visitor" }))[0];
  const ownWant = positionAt(record("visitor"), sec(4));
  assert.deepEqual([own.x, own.y], [ownWant.x, ownWant.y]);
  // somebody else's handle is not the reader's own
  assert.equal(liveWalkerRows(rows, ctxAt(4, { ownHandle: "someone-else" }))[0].moving, true);
});

test("(2) nothing is kept between calls: a replaced ledger and a moved clock are read fresh", () => {
  const rows = [still("visitor")];
  const first = liveWalkerRows(rows, ctxAt(4));
  const replaced = liveWalkerRows(rows, ctxAt(4, { crossedBy: latestCrossingMsByHandle([{ handle: "visitor", iso: iso(t0 + 3000) }]) }));
  const restored = liveWalkerRows(rows, ctxAt(4));
  assert.equal(first[0].moving, true);
  assert.equal(replaced[0], rows[0]);
  same(restored[0], first[0]);
  assert.notEqual(liveWalkerRows(rows, ctxAt(5))[0].y, first[0].y);
});

// ── (3) the tick-to-draw handoff, from the page's own source ──────────────────────────────────────────────

const lift = (re, what) => { const t = SOURCE.match(re)?.[0]; assert.ok(t, `source extraction: ${what}`); return t; };
const LIVE_WALKERS = lift(/^  const liveWalkers = \(\) => liveWalkerRows\([\s\S]*?^  \}\);/m, "liveWalkers");
const ANIMATE = lift(/^  function animateWalks\(\) \{[\s\S]*?^  \}/m, "animateWalks");

/** the page's tick loop, run from its own text against stand-ins for the page's state; `frames` runs the queued rAF callbacks one frame at a time */
function rig({ walkers, acts = [], records, own = null, hidden = false, mPerPx = 1 }) {
  const rig = { clockMs: t0, draws: [], walkerCalls: 0, rowsEvaluated: 0, ledgerPasses: 0, queue: [], hidden };
  rig.ledger = { acts };
  const ctx = vm.createContext({
    liveWalkerRows: (rows, c) => { rig.walkerCalls += 1; rig.rowsEvaluated += rows.length; return liveWalkerRows(rows, c); },
    // a "ledger pass" is a read of the ledger's acts: the memo makes one only for a ledger it has not seen (WLD-247)
    crossingsMemoFor: (prev, a) => { const m = crossingsMemoFor(prev, a); if (m !== prev) rig.ledgerPasses += 1; return m; },
    walkState: { walkers }, walkRecords: records, get enterExitLedger() { return rig.ledger; },
    fractionalCrossing: (ms) => fractionalCrossing(ms === undefined ? rig.clockMs : ms),
    state: { handle: own }, canAct: () => !!own, mapCtx: { mPerPx },
    drawWalkers: (live) => rig.draws.push(live),
    requestAnimationFrame: (fn) => { rig.queue.push(fn); return rig.queue.length; },
    get document() { return { hidden: rig.hidden }; },
  });
  vm.runInContext(`let walksPolledMs = ${t0 - 5000}; let walkFrame = 0, walkFrameKey = ""; let crossingsMemo = null;\n${LIVE_WALKERS}\n${ANIMATE}\nglobalThis.__animate = animateWalks;`, ctx);
  rig.start = () => ctx.__animate();
  rig.frame = (ms) => { if (ms !== undefined) rig.clockMs = ms; const fn = rig.queue.shift(); fn?.(); };
  rig.reset = () => { rig.walkerCalls = 0; rig.rowsEvaluated = 0; rig.ledgerPasses = 0; };
  return rig;
}
const town = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? still("visitor") : { handle: `walker-${i}`, x: i, y: i, moving: false }));

test("(3) one evaluation of the walkers per frame, no ledger re-read while the ledger stands, and the draw is handed that very answer", () => {
  const acts = Array.from({ length: 50 }, (_, i) => ({ handle: `walker-${i % 7}`, iso: iso(t0 - 100_000 + i) }));
  const r = rig({ walkers: town(40), acts, records: new Map([["visitor", { record: record("visitor"), declaredMs: t0 }]]) });
  r.start();
  assert.equal(r.queue.length, 1, "something moves, so the loop starts");
  r.reset();
  r.frame(t0 + 1000);
  assert.equal(r.walkerCalls, 1, "the whole town evaluated once for the frame");
  assert.equal(r.rowsEvaluated, 40);
  assert.equal(r.ledgerPasses, 0, "the ledger is the one the loop started with: not read again (WLD-247; it was one pass per frame before)");
  assert.equal(r.draws.length, 1, "the body moved a pixel: one draw");
  assert.equal(r.draws[0].length, 40, "the draw gets the full live set, not just the moving bodies");
  assert.equal(r.draws[0][0].moving, true);
  assert.ok(r.draws[0][0].y < still("visitor").y, "...where its walk puts it now");
  assert.equal(r.queue.length, 1, "and the loop goes on");
  // a frame in which nothing has moved half a pixel draws nothing, and still evaluates once
  r.reset();
  r.frame(t0 + 1000);
  assert.deepEqual([r.walkerCalls, r.ledgerPasses, r.draws.length], [1, 0, 1], "same pose: no redraw, still one evaluation of the walkers");
});

test("(3) arrival without a poll: the loop ends with the resting redraw of that frame's answer, and stops", () => {
  const r = rig({ walkers: town(5), records: new Map([["visitor", { record: record("visitor"), declaredMs: t0 }]]) });
  r.start();
  r.frame(t0 + 4000);
  r.frame(t0 + 9000);
  const before = r.draws.length;
  r.reset();
  r.frame(t0 + 30_000);                       // past the arrival, and nobody asked the poll
  assert.equal(r.draws.length, before + 1, "the last frame sets them down: one more draw");
  const last = r.draws.at(-1);
  assert.deepEqual([last[0].moving, last[0].standing], [false, true]);
  assert.equal(r.queue.length, 0, "and the loop has stopped");
  assert.deepEqual([r.walkerCalls, r.ledgerPasses], [1, 0]);
});

test("(3) a crossing that stops the walk, and a replaced ledger, are seen on the next frame", () => {
  const records = new Map([["visitor", { record: record("visitor"), declaredMs: t0 }]]);
  const r = rig({ walkers: town(5), records });
  r.start();
  r.frame(t0 + 4000);
  assert.equal(r.queue.length, 1);
  // the ledger lands with a crossing after the declaration: the walk is stopped, so the next frame is the resting redraw
  r.ledger = { acts: [{ handle: "visitor", iso: iso(t0 + 4500) }] };
  const before = r.draws.length;
  r.frame(t0 + 5000);
  assert.equal(r.draws.length, before + 1);
  assert.equal(r.draws.at(-1)[0].moving, false, "the poll's still place, not the record's");
  assert.equal(r.queue.length, 0);
  // and a ledger replaced by one that does not hold the crossing lets a restarted loop move the body again
  r.ledger = { acts: [] };
  r.start();
  assert.equal(r.queue.length, 1, "the walk is live again (nothing was kept from the frame that stopped it)");
});

test("(3) a hidden tab does nothing, and a loop with nothing moving never starts", () => {
  const hidden = rig({ walkers: town(5), records: new Map([["visitor", { record: record("visitor"), declaredMs: t0 }]]), hidden: true });
  hidden.start();
  assert.deepEqual([hidden.queue.length, hidden.walkerCalls], [0, 0]);
  const idle = rig({ walkers: town(5), records: new Map() });
  idle.start();
  assert.deepEqual([idle.queue.length, idle.draws.length], [0, 0]);
  assert.equal(idle.walkerCalls, 1, "one evaluation to find that nothing moves");
});

// ── (4) the draw, the standalone redraw, the single-body readers ──────────────────────────────────────────

test("(4) a standalone redraw takes its own answer with one ledger pass; the draw works on a copy; single-body readers keep liveBody", () => {
  // the standalone path: no frame, so liveWalkers() itself
  const r = rig({ walkers: town(30), acts: [{ handle: "walker-3", iso: iso(t0) }], records: new Map([["visitor", { record: record("visitor"), declaredMs: t0 }]]) });
  const ctx2 = vm.createContext({
    liveWalkerRows: (rows, c) => { r.walkerCalls += 1; return liveWalkerRows(rows, c); }, crossingsMemoFor: (prev, a) => { const m = crossingsMemoFor(prev, a); if (m !== prev) r.ledgerPasses += 1; return m; },
    walkState: { walkers: town(30) }, walkRecords: new Map([["visitor", { record: record("visitor"), declaredMs: t0 }]]), enterExitLedger: { acts: [{ handle: "walker-3", iso: iso(t0) }] },
    fractionalCrossing: (ms) => fractionalCrossing(ms === undefined ? t0 + 3000 : ms), state: { handle: null }, canAct: () => false,
  });
  vm.runInContext(`let walksPolledMs = ${t0 - 5000}; let crossingsMemo = null;\n${LIVE_WALKERS}\nglobalThis.__live = liveWalkers;`, ctx2);
  r.reset();
  const live = ctx2.__live();
  assert.deepEqual([r.walkerCalls, r.ledgerPasses, live.length], [1, 1, 30]);
  assert.equal(live[0].moving, true);
  // the draw copies the tick's answer: sceneWalkerSet hands its input back outdoors, and the residents' switch empties the list it is given
  const input = [{ handle: "x" }];
  assert.equal(sceneWalkerSet({ walkers: input, roomId: null }), input, "outdoors the list is the very array passed");
  const draw = lift(/^  function drawWalkers\(live = null\) \{[\s\S]*?^  \}/m, "drawWalkers");
  assert.match(draw, /const inView = sceneWalkerSet\(\{ walkers: live \? \[\.\.\.live\] : liveWalkers\(\),/);
  assert.equal((draw.match(/liveBody|liveWalkers\(\)/g) ?? []).length, 1, "the draw evaluates the walkers in one place, and only when it was not handed the frame's answer");
  // single-body readers keep liveBody and its own scan
  assert.match(SOURCE, /const crossedMsOf = \(handle\) => \{/);
  assert.match(SOURCE, /const liveBody = \(w\) => \{/);
  assert.match(SOURCE, /walkerCandidatesAt\(walkState\.walkers, \{ bodyOf: liveBody,/);
  // the tick hands the draw its answer, and the draw is called with it in both places
  assert.equal((ANIMATE.match(/drawWalkers\(live\)/g) ?? []).length, 2, "the resting redraw and the half-pixel redraw both get the frame's answer");
  assert.equal((ANIMATE.match(/liveWalkers\(\)/g) ?? []).length, 2, "one evaluation to start the loop, one per frame in the tick");
  assert.equal((SOURCE.match(/drawWalkers\(\)/g) ?? []).length >= 10, true, "the standalone redraws (poll, ledger, switches) are untouched");
});

// ── WLD-247: the ledger's crossings are parsed once per ledger, not once per frame ───────────────────────────────────────────────────────────
// The idle trace on #437's viewer (Town Centre, 4x CPU, 8.2 s untouched): `latestCrossingMsByHandle` 1.5 s = 19 % of the window, a pass over the ~10,400 acts on every
// animation frame. The ledger is replaced whole when it lands and an act's time never changes, so the answer for the same array at the same length is the same
// answer. Everything else the frame computes (every row, the clock, the walks) is still evaluated every frame.

test("(5) crossingsMemoFor: the same ledger is read once; another array, even of the same length, and a longer one are read again", () => {
  let iterations = 0;
  const acts = new Proxy([{ handle: "a", iso: iso(t0) }, { handle: "b", iso: iso(t0 + 1000) }], { get(t, k, r) { if (k === Symbol.iterator) iterations += 1; return Reflect.get(t, k, r); } });
  let memo = crossingsMemoFor(null, acts);
  const first = memo;
  for (let frame = 0; frame < 60; frame++) memo = crossingsMemoFor(memo, acts);
  assert.equal(memo, first, "sixty frames, one memo");
  assert.equal(iterations, 1, "the ledger was iterated once");
  assert.deepEqual([...memo.map], [["a", t0], ["b", t0 + 1000]]);
  // a ledger replaced by another array of the SAME length (the landing of a newer read) is read again, and answers differently
  const replaced = [{ handle: "a", iso: iso(t0 + 9000) }, { handle: "b", iso: iso(t0 + 1000) }];
  const next = crossingsMemoFor(memo, replaced);
  assert.notEqual(next, memo);
  assert.equal(next.map.get("a"), t0 + 9000);
  // the same array grown in place is read again too
  const grow = [{ handle: "a", iso: iso(t0) }];
  const g1 = crossingsMemoFor(null, grow);
  grow.push({ handle: "a", iso: iso(t0 + 4000) });
  const g2 = crossingsMemoFor(g1, grow);
  assert.notEqual(g2, g1);
  assert.equal(g2.map.get("a"), t0 + 4000);
  // no ledger at all
  assert.equal(crossingsMemoFor(null, undefined).map.size, 0);
  assert.equal(crossingsMemoFor(crossingsMemoFor(null, undefined), undefined).n, 0);
  // its answer is exactly the one-pass answer
  const fixture = [{ handle: "x", iso: iso(t0 + 5) }, { handle: "y", iso: "no time" }, { handle: "x", iso: iso(t0 + 2) }];
  assert.deepEqual([...crossingsMemoFor(null, fixture).map], [...latestCrossingMsByHandle(fixture)]);
});

test("(5) in the running loop: an unchanged ledger is read once over many frames; a crossing that lands (a replaced ledger, or an act added in place) still stops the walk on the next frame", () => {
  const records = new Map([["visitor", { record: record("visitor"), declaredMs: t0 }]]);
  const acts = [{ handle: "walker-3", iso: iso(t0 - 60_000) }];
  const r = rig({ walkers: town(8), acts, records });
  r.start();
  r.reset();
  for (let n = 1; n <= 12; n++) r.frame(t0 + n * 400);   // 4.8 s of frames; the body moves, the half-pixel test redraws
  assert.equal(r.ledgerPasses, 0, "twelve frames on the ledger the loop started with: the ledger was not read again");
  assert.ok(r.walkerCalls === 12 && r.draws.length >= 5, "while every frame still evaluated every walker and drew the moving body");
  assert.equal(r.queue.length, 1);
  // an act added IN PLACE after the walk was declared: the next frame sees it and stops the walk
  acts.push({ handle: "visitor", iso: iso(t0 + 4900) });
  r.reset();
  const before = r.draws.length;
  r.frame(t0 + 5200);
  assert.equal(r.ledgerPasses, 1, "the grown ledger was read again, once");
  assert.equal(r.draws.length, before + 1, "and the walk's stop is the resting redraw");
  assert.equal(r.draws.at(-1)[0].moving, false);
  assert.equal(r.queue.length, 0);
  // a ledger replaced by another array: the new crossings are read once, and the walk is live again
  r.ledger = { acts: [{ handle: "walker-3", iso: iso(t0 - 60_000) }] };
  r.start();
  r.reset();
  r.frame(t0 + 6000);
  r.frame(t0 + 6400);
  assert.equal(r.ledgerPasses, 0, "(the start already read it) and the frames after it do not read it again");
  assert.equal(r.draws.at(-1)[0].moving, true);
});

test("(5) the page asks the memo, not the ledger, once a frame; the single-body reader keeps its own scan", () => {
  assert.match(LIVE_WALKERS, /crossedBy: \(crossingsMemo = crossingsMemoFor\(crossingsMemo, enterExitLedger\.acts\)\)\.map,/);
  assert.doesNotMatch(LIVE_WALKERS, /latestCrossingMsByHandle\(/, "the per-frame answer no longer scans the ledger itself");
  assert.match(SOURCE, /let crossingsMemo = null;\n  const liveWalkers = /);
  assert.match(SOURCE, /const crossedMsOf = \(handle\) => \{/, "liveBody keeps its per-handle scan");
});
