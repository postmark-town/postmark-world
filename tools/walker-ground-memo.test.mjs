// walker-ground-memo.test.mjs — THE WALKER PASS ASKS THE GROUND ONCE, AND THE CLOCK ONCE (WLD-243, Wright 2026-11-24 03:50Z).
//
// ── THE INSTANCE ───────────────────────────────────────────────────────────
// A signed-out Town Centre pan at 4x CPU held the page for seconds (WLD-226's S187 audit; WLD-243's own trace on Site 32a68fd3 / World S189). The pan's own
// code was 0.14 % of it. The cost was the walker redraw, which re-places every STANDING drawn body on every frame a walker moves: 37 % of the pan
// window in `smallestContainingMark`'s scan of the whole ground, 11 % in `occupancyClock` evaluated once per body.
//
// ── WHAT THIS FILE PROVES ──────────────────────────────────────────────────
//  (1) the ground's answers are kept across draws of the SAME ground even though every draw builds fresh arrays, objects and a fresh index, and the
//      resident path hands a fresh `[...byId.values()]`: a memo keyed on those would miss every frame.
//  (2) every change to the ground re-answers the same point: a world load or reload that changes it, a resident read that replaces a record, an added
//      mark, a mark moved/resized/re-shaped IN PLACE, a thing class learned, a reordered ground, the room the index stands aside for. A memo keyed on an
//      epoch or on identity would be stale on the in-place edits; this one is derived from the ground, so it cannot miss a seam.
//  (3) the memo is bounded, and its answers equal the unmemoised function's for every point asked.
//  (4) only the ground is remembered: on a memo hit, the entered state, the walk's target and the resolved name are still read live.
//  (5) walkerPlace reads the clock ONCE per draw (the draw carries it), not once per body, and drawWalkers hands it down.
// Flips: in groundMemoFor, return `prev` whenever `prev.room === room` (an identity/epoch memo) and (2) reds on the in-place edits; return a fresh memo
// every call and (1) reds; in smallestContainingMark, drop the `answers.has(key)` read and (1)'s no-scan probe reds; in walkerPlace, `draw?.at ??` →
// `occupancyClock()` and (5) reds.
//
//   node --test tools/walker-ground-memo.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

import {
  smallestContainingMark, containmentIndex, groundMemoFor, GROUND_MEMO_CAP, bodyPlace, placeLabel, WORLD_ROOT_ID,
} from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

// a record shaped like the town's: a root, a parcel, a house on it, a bench on that, a carried thing at the same point
const record = () => [
  { id: WORLD_ROOT_ID, kind: "sited", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 } },
  { id: "town/the-parcel", kind: "parcel", at: { x: 100, y: 100 }, extent: { w: 40, h: 40 } },
  { id: "town/the-house", kind: "sited", at: { x: 100, y: 100 }, extent: { w: 12, h: 12 } },
  { id: "town/the-bench", kind: "sited", at: { x: 100, y: 100 }, extent: { w: 2, h: 2 } },
  { id: "town/the-top", kind: "sited", class: "thing", at: { x: 100, y: 100 }, extent: { w: 1, h: 1 } },
  { id: "town/p-1", kind: "predicated", parent: "town/the-house", at: { x: 100, y: 100 }, extent: { w: 3, h: 3 } },
];
const BENCH = { x: 100, y: 100 }, HOUSE = { x: 105, y: 100 }, PARCEL = { x: 115, y: 100 }, OPEN = { x: 500, y: 500 };
const POINTS = [BENCH, HOUSE, PARCEL, OPEN, { x: 99.5, y: 100.5 }, { x: 106, y: 106 }, { x: 119.9, y: 80.1 }];

/** one draw, the way drawWalkers makes it: a fresh record array, a fresh index, the memo carried from the draw before (or none) */
function draw(marks, prev = null, opts = {}) {
  const index = containmentIndex(marks, opts);
  const memo = groundMemoFor(prev, index);
  index.groundMemo = memo;
  return { index, memo, ask: (p) => smallestContainingMark(p, marks, { index, insideRoomId: opts.insideRoomId ?? null }) };
}
const plain = (marks, p, opts = {}) => smallestContainingMark(p, marks, opts);

test("the memo answers exactly what the unmemoised function answers, for every point, first ask and second", () => {
  const marks = record();
  const d = draw(marks);
  for (const p of POINTS) assert.equal(d.ask(p), plain(marks, p), `first ask at ${p.x},${p.y}`);
  const misses = d.memo.misses;
  for (const p of POINTS) assert.equal(d.ask(p), plain(marks, p), `remembered ask at ${p.x},${p.y}`);
  assert.equal(d.memo.misses, misses, "the second asks scanned nothing");
  assert.equal(d.memo.hits, POINTS.length);
  assert.deepEqual([d.ask(BENCH), d.ask(HOUSE), d.ask(PARCEL), d.ask(OPEN)], ["town/the-bench", "town/the-house", "town/the-parcel", null]);
});

test("(1) fresh draws of the same ground reuse the memo: new arrays, new objects, a new index, the resident path's fresh array", () => {
  const first = draw(structuredClone(record()));
  for (const p of POINTS) first.ask(p);
  const misses = first.memo.misses;
  // the spectator path: a freshly built record of the same content
  const second = draw(structuredClone(record()), first.memo);
  assert.equal(second.memo, first.memo, "the same memo, not a rebuilt one");
  assert.equal(second.memo.version, 1);
  // the resident path: `[...byId.values()]`, a fresh array over a Map's values, objects cloned by a read
  const byId = new Map(structuredClone(record()).map((m) => [m.id, m]));
  const third = draw([...byId.values()], second.memo);
  assert.equal(third.memo, first.memo);
  for (const p of POINTS) assert.equal(third.ask(p), plain(record(), p));
  assert.equal(first.memo.misses, misses, "no point was scanned again across three draws");
  // the probe: a memo hit does not look at the ground at all (it would answer 'null' for every point if it did, the ground being emptied)
  const probe = draw(structuredClone(record()), first.memo);
  probe.index.ground = [];
  assert.equal(probe.ask(BENCH), "town/the-bench", "answered from the memo, no scan");
});

test("(2) every change to the ground re-answers the same point", () => {
  const first = draw(record());
  assert.equal(first.ask(HOUSE), "town/the-house");
  assert.equal(first.ask(BENCH), "town/the-bench");

  // world load / reload that changes the ground: the house is gone from the new fold
  const reloaded = draw(record().filter((m) => m.id !== "town/the-house"), first.memo);
  assert.notEqual(reloaded.memo, first.memo);
  assert.equal(reloaded.memo.version, 2);
  assert.equal(reloaded.ask(HOUSE), "town/the-parcel", "the house point now answers the parcel");

  // a world reload of identical content is NOT a change: nothing is re-answered, nothing is stale
  const same = draw(record(), reloaded.memo);
  assert.equal(same.memo.version, 3, "the ground came back: a new memo, because the ground differed from the reload before it");
  const again = draw(record(), same.memo);
  assert.equal(again.memo, same.memo);

  // a resident read replaces a record with an edited copy (fillFromTown / residentById make `{...have, ...}` copies)
  const read = record().map((m) => (m.id === "town/the-bench" ? { ...m, extent: { w: 0.5, h: 0.5 } } : m));
  const afterRead = draw(read, again.memo);
  assert.notEqual(afterRead.memo, again.memo);
  assert.equal(afterRead.ask({ x: 100.6, y: 100 }), "town/the-house", "outside the shrunk bench the point is the house's now");
  assert.equal(afterRead.ask(BENCH), "town/the-bench");

  // addMark: a new stall on the house point
  const added = draw([...record(), { id: "town/new-stall", kind: "sited", at: { x: 105, y: 100 }, extent: { w: 3, h: 3 } }], again.memo);
  assert.notEqual(added.memo, again.memo);
  assert.equal(added.ask(HOUSE), "town/new-stall");

  // the same record edited IN PLACE: the bench moved, the house resized — the very objects the last draw held
  const marks = record();
  const held = draw(marks);
  assert.equal(held.ask(BENCH), "town/the-bench");
  marks.find((m) => m.id === "town/the-bench").at.x = 300;
  const moved = draw(marks, held.memo);
  assert.notEqual(moved.memo, held.memo, "an in-place move is a new ground");
  assert.equal(moved.ask(BENCH), "town/the-house");
  assert.equal(moved.ask({ x: 100.9, y: 100 }), "town/the-house");
  Object.assign(marks.find((m) => m.id === "town/the-house").extent, { w: 1, h: 1 });
  const shrunk = draw(marks, moved.memo);
  assert.notEqual(shrunk.memo, moved.memo);
  assert.equal(shrunk.ask({ x: 100.9, y: 100 }), "town/the-parcel", "the house shrank in place: the same point is the parcel's now");

  // a ring re-shaped in place, and the same ring in a fresh copy
  const ringed = record();
  ringed.find((m) => m.id === "town/the-house").points = [[94, 94], [106, 94], [106, 106], [94, 106]];
  const r1 = draw(ringed);
  assert.equal(r1.ask({ x: 95, y: 105 }), "town/the-house");
  assert.equal(draw(structuredClone(ringed), r1.memo).memo, r1.memo, "the same ring in fresh arrays is the same ground");
  ringed.find((m) => m.id === "town/the-house").points[3] = [104, 99.5];
  const r2 = draw(ringed, r1.memo);
  assert.notEqual(r2.memo, r1.memo);
  assert.equal(r2.ask({ x: 95, y: 105 }), "town/the-parcel", "the ring's corner moved off the point");

  // a thing class learned: the bench kind becomes a thing, so it is not ground
  const kinds = record().map((m) => (m.id === "town/the-bench" ? { ...m, class: "bench-kind" } : m));
  const before = draw(kinds);
  assert.equal(before.ask(BENCH), "town/the-bench");
  const learned = draw(kinds, before.memo, { thingClasses: new Set(["bench-kind"]) });
  assert.notEqual(learned.memo, before.memo);
  assert.equal(learned.ask(BENCH), "town/the-house");

  // the same ids with another (area, id) order is another ground
  const reshaped = record().map((m) => (m.id === "town/the-house" ? { ...m, extent: { w: 1, h: 1 } } : m));
  const order = draw(reshaped, held.memo);
  assert.notEqual(order.memo, held.memo);
  assert.equal(order.ask(BENCH), "town/the-house", "the 1x1 house now sorts before the 2x2 bench");
});

test("(2) the room the index stands aside for is part of the version", () => {
  const marks = record();
  const open = draw(marks);
  assert.equal(open.ask(HOUSE), "town/the-house");
  const inRoom = draw(marks, open.memo, { insideRoomId: "town/the-house" });
  assert.notEqual(inRoom.memo, open.memo);
  assert.equal(inRoom.memo.room, "town/the-house");
  assert.equal(inRoom.ask(HOUSE), plain(marks, HOUSE, { insideRoomId: "town/the-house" }), "the room and what encloses it stand aside");
  assert.notEqual(inRoom.ask(HOUSE), "town/the-house");
  // and the memo is only used for the room it was made for: an index for another room has no memo attached and scans
  const other = containmentIndex(marks, { insideRoomId: null });
  other.groundMemo = inRoom.memo;
  assert.equal(smallestContainingMark(HOUSE, marks, { index: other }), "town/the-house", "a memo for another room is ignored");
});

test("(3) the memo is bounded and never answers wrongly when it starts over", () => {
  const marks = record();
  const d = draw(marks);
  for (let i = 0; i < GROUND_MEMO_CAP + 25; i++) {
    const p = { x: 80 + (i % 90) * 0.5 + i * 1e-6, y: 80 + Math.floor(i / 90) * 0.4 };
    assert.equal(d.ask(p), plain(marks, p));
    assert.ok(d.memo.answers.size <= GROUND_MEMO_CAP, "never above the cap");
  }
  assert.ok(d.memo.answers.size < GROUND_MEMO_CAP + 25, "it did start over");
});

test("(4) only the ground is remembered: occupancy, the walk's target and the resolved name are read live on a hit", () => {
  const marks = record();
  const named = { "town/the-house": "The House", "town/the-parcel": "The Parcel", "town/the-bench": "The Bench" };
  const determined = (names) => Object.fromEntries(Object.entries(names).map(([id, name]) => [`${id}::name`, name]));
  const d = draw(marks);
  const walker = { handle: "pat", x: HOUSE.x, y: HOUSE.y, moving: false, mark_id: null };
  const place = (w, acts, at, index = d.index) => bodyPlace(w, { marks, acts, at, index });
  const first = place(walker, [], 5);
  assert.equal(first.inside, "town/the-house");
  assert.equal(first.entered, null);
  const hitsBefore = d.memo.hits;

  // occupancy: an enter act the clock has now passed
  const acts = [{ handle: "pat", act: "enters", mark: "town/the-parcel", at: 6, word: "neutral" }];
  assert.equal(place(walker, acts, 5.5).entered, null, "before the act");
  assert.equal(place(walker, acts, 6.5).entered, "town/the-parcel", "after it: live, though the ground answer was a hit");
  // the target and arrival: the same point, a different walk
  const bound = place({ ...walker, mark_id: "town/the-bench" }, [], 5);
  assert.deepEqual([bound.inside, bound.boundFor, bound.arrived], ["town/the-house", "town/the-bench", false]);
  const there = place({ ...walker, mark_id: "town/the-house" }, [], 5);
  assert.equal(there.arrived, true);
  assert.ok(d.memo.hits >= hitsBefore + 4, "all of those were ground hits");
  // the name: the label reads the determined names at call time
  assert.equal(placeLabel(first, marks, determined(named), { index: d.index }), "on The House's ground");
  assert.equal(placeLabel(first, marks, determined({ ...named, "town/the-house": "The Renamed House" }), { index: d.index }), "on The Renamed House's ground");
  assert.equal(placeLabel(place(walker, acts, 6.5), marks, determined(named), { index: d.index }), "in The Parcel");
  assert.equal(placeLabel(bound, marks, determined(named), { index: d.index }), "on The House's ground, at the door of The Bench");
});

// ── the clock: once per draw ─────────────────────────────────────────────────────────────────────────────────

/** a closure function's own text from viewer.mjs, two-space indented (home-column.test.mjs's lift) */
const lift = (re, what) => { const t = SOURCE.match(re)?.[0]; assert.ok(t, `source extraction: ${what}`); return t; };

test("(5) walkerPlace reads the clock once per draw, not once per body; without a draw it reads it per call, as before", () => {
  const text = lift(/^  const walkerPlace = \(w, draw = null\) => \{[\s\S]*?^  \};/m, "walkerPlace");
  let clock = 0;
  const seen = [];
  const run = vm.runInNewContext(`(${text.replace(/^  const walkerPlace = /, "").replace(/;\s*$/, "")})`, {
    allMarks: () => [], containmentIndex: () => ({ byMarkId: new Map() }), learnedThingClasses: () => new Set(),
    bodyPlace: (w, o) => { seen.push(o.at); return { w, o }; }, placeLabel: () => "label", enterExitLedger: { acts: [] },
    data: { worldState: { determined: {} } }, occupancyClock: () => (clock += 1),
  });
  const drawCtx = { marks: [], index: { byMarkId: new Map() }, at: 7.25 };
  for (let i = 0; i < 40; i++) run({ handle: `h${i}` }, drawCtx);
  assert.equal(clock, 0, "40 bodies, one draw: the clock was not asked per body");
  assert.deepEqual([...new Set(seen)], [7.25], "every body is placed at the draw's one instant");
  seen.length = 0;
  run({ handle: "hover" });
  run({ handle: "bubble" });
  assert.equal(clock, 2, "a single-body caller (the hover, the bubble) with no draw still reads the clock itself");
  const zero = vm.runInNewContext(`(${text.replace(/^  const walkerPlace = /, "").replace(/;\s*$/, "")})`, {
    allMarks: () => [], containmentIndex: () => ({ byMarkId: new Map() }), learnedThingClasses: () => new Set(), bodyPlace: (w, o) => o.at, placeLabel: (o) => o,
    enterExitLedger: { acts: [] }, data: {}, occupancyClock: () => 99,
  });
  assert.equal(zero({ handle: "x" }, { marks: [], index: {}, at: 0 }), 0, "a draw instant of 0 (a time-travelled clock) is an instant, not a missing one");
});

test("(5) drawWalkers evaluates the clock once, carries it on the draw, and attaches the ground memo to the draw's index", () => {
  const text = lift(/^  function drawWalkers\((?:live = null)?\) \{[\s\S]*?^  \}/m, "drawWalkers");
  assert.equal((text.match(/occupancyClock\(\)/g) ?? []).length, 1, "one clock read in the whole pass");
  assert.match(text, /const draw = \{ marks, index: containmentIndex\(marks, \{ thingClasses: learnedThingClasses\(marks\) \}\), at: occupancyClock\(\) \};/);
  assert.match(text, /walkGroundMemo = groundMemoFor\(walkGroundMemo, draw\.index\);\s*draw\.index\.groundMemo = walkGroundMemo;/);
  assert.match(text, /standpointOccupancy\(\{ acts: enterExitLedger\.acts, at: draw\.at \}\)/, "the roof's manifest reads the same instant");
  assert.equal((text.match(/walkerPlace\(w, draw\)/g) ?? []).length, 1, "the standing bodies are placed through the draw");
  // the memo is only reachable through that index: a single-body caller builds its own and has none
  assert.equal((SOURCE.match(/\.groundMemo = /g) ?? []).length, 1);
});
