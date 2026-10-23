// parcel-room.test.mjs — PARCELS FROM 11-01 (Darko, 2026-10-22; Linear POS-762).
//
//   node --test tools/parcel-room.test.mjs
//
// A household settled by 2026-11-01 04:00Z keeps the claim cap of three. One
// settled later holds one parcel, plus one for each it bought, never past three.
// The office hands the facts in (`houseFacts`, per household key), and a
// household with none keeps three, so the law is dark until the office speaks.
// Both of the fold's cap sites (the whole fold and admitDelta) say the same
// thing, and the sentence names the room, the cutoff and the price.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fold, admitDelta, admissionBase, parcelRoomOf, parcelCapRefusal, nextParcelPrice,
  PARCEL_CLAIM_CAP, PARCEL_SETTLED_BY, PARCEL_SETTLED_BY_DAY, PARCEL_PRICE_STAMPS, NEW_HOUSEHOLD_PARCELS,
  CLAIM_CAP_LAW, ONE_PER_RESIDENT_LAW,
} from "./marks-fold.mjs";

/** A parcel at a distinct x, so nothing overlaps and only a limit can refuse. */
const P = (id, by, x, date) => ({
  id, by, household: by, kind: "parcel", tier: "market",
  at: { x, y: 0 }, extent: { w: 25, h: 25 }, date, body: "b",
});
const NOV = (d) => `2026-11-${String(d).padStart(2, "0")}T12:00:00Z`;
// three residents of one house, so one per resident never refuses before the room does
const households = { ash: "hh:the-rowan", birch: "hh:the-rowan", cedar: "hh:the-rowan" };
const three = [P("ash/one", "ash", 0, NOV(2)), P("birch/two", "birch", 500, NOV(3)), P("cedar/three", "cedar", 1000, NOV(4))];
const foldWith = (marks, houseFacts) => fold({ marks: marks.map((m) => ({ ...m })), terrain: { features: [] }, stakes: [], tick: 1, households, houseFacts });

test("the law's numbers: declared on or before 10-31 in town time, one parcel, 50 stamps per parcel held", () => {
  assert.equal(PARCEL_SETTLED_BY, "2026-11-01T04:00:00Z");
  assert.equal(PARCEL_SETTLED_BY_DAY, "2026-10-31");
  // the day is the town's own date of the instant just before the cutoff
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.parse(PARCEL_SETTLED_BY) - 1));
  assert.equal(day, PARCEL_SETTLED_BY_DAY, "the last day that keeps three is the US-Eastern day the cutoff ends");
  assert.equal(NEW_HOUSEHOLD_PARCELS, 1);
  assert.equal(PARCEL_PRICE_STAMPS, 50);
  assert.deepEqual([nextParcelPrice(1), nextParcelPrice(2)], [50, 100], "the second costs 50, the third 100");
});

test("parcelRoomOf: three by the cutoff or with no facts; after it, one plus what was bought, never past three", () => {
  assert.equal(parcelRoomOf(undefined), PARCEL_CLAIM_CAP, "no facts: the cap");
  assert.equal(parcelRoomOf({}), PARCEL_CLAIM_CAP, "no since: the cap");
  assert.equal(parcelRoomOf({ since: "2026-08-07" }), 3);
  assert.equal(parcelRoomOf({ since: "2026-10-31" }), 3, "settled on 10-31 (US Eastern) keeps three");
  assert.equal(parcelRoomOf({ since: "2026-11-01" }), 1, "settled on 11-01 holds one");
  assert.equal(parcelRoomOf({ since: "2026-11-01", bought: 1 }), 2);
  assert.equal(parcelRoomOf({ since: "2026-11-01", bought: 2 }), 3);
  assert.equal(parcelRoomOf({ since: "2026-11-01", bought: 5 }), 3, "buying never passes the cap");
  assert.equal(parcelRoomOf({ since: "2026-11-01", bought: -1 }), 1, "a nonsense count buys nothing");
  assert.equal(parcelRoomOf({ since: "someday", bought: 0 }), 3, "an unreadable day keeps the cap: the law only ever lowers it on a fact");
});

test("a household with no facts folds exactly as before: three stand", () => {
  assert.deepEqual(foldWith(three, null).errors, []);
  assert.deepEqual(foldWith(three, { "hh:other": { since: "2026-11-02" } }).errors, [], "facts for another house change nothing here");
});

test("settled by the cutoff: three stand, whatever the house bought", () => {
  assert.deepEqual(foldWith(three, { "hh:the-rowan": { since: "2026-10-31", bought: 0 } }).errors, []);
});

test("settled after it: the first claim stands and the rest are capped in claim order, with the November sentence", () => {
  const state = foldWith([...three].reverse(), { "hh:the-rowan": { since: "2026-11-01", bought: 0 } });
  assert.deepEqual(state.errors.map((e) => e.mark), ["birch/two", "cedar/three"], "the earliest claim stands, whatever order the marks arrive in");
  assert.equal(state.errors[0].error, parcelCapRefusal(1, 1));
  assert.equal(state.errors[1].error, parcelCapRefusal(1, 1));
  assert.deepEqual(state.parcels.map((p) => p.id), ["ash/one"]);
});

test("each parcel bought is one more room; two bought is the cap", () => {
  const one = foldWith(three, { "hh:the-rowan": { since: "2026-11-01", bought: 1 } });
  assert.deepEqual(one.errors.map((e) => [e.mark, e.error]), [["cedar/three", parcelCapRefusal(2, 2)]]);
  assert.deepEqual(foldWith(three, { "hh:the-rowan": { since: "2026-11-01", bought: 2 } }).errors, []);
});

test("one per resident still holds for a house that bought room", () => {
  const second = P("ash/again", "ash", 1500, NOV(5));
  const state = foldWith([three[0], second], { "hh:the-rowan": { since: "2026-11-01", bought: 2 } });
  assert.equal(state.errors.length, 1);
  assert.match(state.errors[0].error, new RegExp(ONE_PER_RESIDENT_LAW), "the resident's second parcel is refused by one per resident, not by the room");
});

test("admitDelta says what the whole fold says", () => {
  const facts = { "hh:the-rowan": { since: "2026-11-01", bought: 0 } };
  const standing = foldWith([three[0]], facts);
  const base = admissionBase(standing, { households, houseFacts: facts });
  assert.equal(base.roomOf("hh:the-rowan"), 1);
  const delta = admitDelta([{ ...three[1] }], base);
  assert.deepEqual(delta.errors, [{ mark: "birch/two", error: parcelCapRefusal(1, 1) }]);
  // without facts, the delta admits it, as before
  assert.deepEqual(admitDelta([{ ...three[1] }], admissionBase(standing, { households })).errors, []);
  // a base built by an older caller (no roomOf) keeps the cap of three
  const { roomOf, ...older } = base;
  assert.deepEqual(admitDelta([{ ...three[1] }], older).errors, []);
});

test("the sentence: it starts the way the settlement cites the cap, and names the room, the cutoff and the price", () => {
  const s = parcelCapRefusal(1, 1);
  assert.ok(s.startsWith("parcel claim capped"), "the settlement cites the-town/claim-cap by these words");
  assert.ok(!s.includes(ONE_PER_RESIDENT_LAW), "and it must not read as the one-per-resident limit");
  assert.ok(s.includes(CLAIM_CAP_LAW));
  assert.match(s, /holds 1 parcel and has room for 1/);
  assert.ok(s.includes(PARCEL_SETTLED_BY) && s.includes("whose declaration is dated after 2026-10-31 (town time"), "the cutoff, plainly: the declaration day, never the day ashore");
  assert.match(s, /costs 50 stamps for every parcel it already holds \(its next: 50 stamps\)/, "the price, plainly");
  assert.match(s, /paid to the town and never returned, up to 3, one per resident/);
  assert.match(parcelCapRefusal(2, 2), /holds 2 parcels and has room for 2.*its next: 100 stamps/);
  // at the cap, the 07-30 sentence is unchanged
  assert.equal(parcelCapRefusal(3, 3),
    "parcel claim capped — this credential household already holds 3 (cap 3 per household, ruled 2026-07-30; prior estate stands, new claims wait on the founder's word)");
});
