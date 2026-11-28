// parcel-captures.test.mjs — the keeper's flag for a parcel that newly takes in an older foreign mark (WLD-224).
// Invented residents and marks; the folded rows are the shape the fold writes (WORLD/world-state.json).
import test from "node:test";
import assert from "node:assert/strict";
import { parcelCaptures } from "./parcel-captures.mjs";

const row = (id, o = {}) => ({ id, kind: "sited", by: id.split("/")[0], household: id.split("/")[0], declared_household: `hh:${id.split("/")[0]}`,
  date: "2026-09-01T10:00:00.000Z", at: { x: 100, y: 100 }, extent: { w: 10, h: 10 }, placementParent: "the-town/the-frame", ...o });
const parcel = (id, o = {}) => row(id, { kind: "parcel", date: "2026-11-18T09:00:00.000Z", extent: { w: 25, h: 25 }, ...o });

// a new parcel of ola's over pip's older cafe (inside it), and bo's older shed beside it (not inside)
const world = (over = {}) => ({
  marks: [
    parcel("ola/the-low-house-parcel"),
    row("pip/the-cafe", { placementParent: "ola/the-low-house-parcel", date: "2026-11-06T08:00:00.000Z" }),
    row("bo/the-shed", { at: { x: 400, y: 400 } }),
    ...(over.marks ?? []),
  ],
  errors: over.errors ?? [],
});
const NEW = ["ola/the-low-house-parcel"];

test("a new parcel that files an older foreign mark under it is flagged: both marks, both households, the overlap", () => {
  const got = parcelCaptures({ state: world(), publishedIds: NEW });
  assert.equal(got.checked, true);
  assert.equal(got.parcels_checked, 1);
  assert.deepEqual(got.events, [{
    parcel: "ola/the-low-house-parcel", parcel_household: "hh:ola", parcel_by: "ola", parcel_laid: "2026-11-18T09:00:00.000Z",
    mark: "pip/the-cafe", mark_household: "hh:pip", mark_by: "pip", mark_laid: "2026-11-06T08:00:00.000Z", mark_tier: null,
    overlap_m2: 100, mark_area_m2: 100,
  }]);
});

test("controls: the same household, a mark that is not older, and a mark the parcel does not take in are not captures", () => {
  const state = world({ marks: [
    row("ola/her-own-bench", { placementParent: "ola/the-low-house-parcel", declared_household: "hh:pip", household: "ola" }),     // her own handle, but the household is pip's: by the credential grain it IS foreign (pip's)
    row("ola/her-own-gate", { placementParent: "ola/the-low-house-parcel", date: "2026-09-02T00:00:00.000Z" }),                         // same household as the parcel
    row("cy/the-newer-stall", { placementParent: "ola/the-low-house-parcel", date: "2026-11-19T00:00:00.000Z" }),                       // laid after the parcel
    row("cy/the-same-hour", { placementParent: "ola/the-low-house-parcel", date: "2026-11-18T09:00:00.000Z" }),                         // the same instant: seniority does not decide
    row("cy/the-undated", { placementParent: "ola/the-low-house-parcel", date: "not a date" }),                                         // unreadable: not asserted
    row("cy/the-bystander", { placementParent: "the-town/the-frame" }),                                                                 // overlaps nothing it files under
  ] });
  const got = parcelCaptures({ state, publishedIds: NEW });
  assert.deepEqual(got.events.map((e) => e.mark), ["ola/her-own-bench", "pip/the-cafe"],
    "only the older foreign marks: the household is the credential household, so a mark under another household is foreign whoever wrote it");
});

test("a parcel not published this crossing, or one the fold refused, is never an event: an unchanged historical pair is not new", () => {
  assert.deepEqual(parcelCaptures({ state: world(), publishedIds: [] }), { checked: true, parcels_checked: 0, events: [] });
  assert.deepEqual(parcelCaptures({ state: world(), publishedIds: ["pip/the-cafe"] }).events, [], "a published mark that is not a parcel is not one");
  const refused = parcelCaptures({ state: world({ errors: [{ mark: "ola/the-low-house-parcel", error: "parcel overlaps x — inadmissible" }] }), publishedIds: NEW });
  assert.deepEqual(refused, { checked: true, parcels_checked: 0, events: [] }, "a refused candidate is not reported as a completed event");
  const gone = parcelCaptures({ state: { marks: world().marks.slice(1), errors: [] }, publishedIds: NEW });
  assert.deepEqual(gone.events, [], "an unpublished parcel (absent from the folded world) is not one either");
});

test("absent is not empty: an unreadable world says so, a read world with nothing taken in says how many parcels it looked at", () => {
  assert.equal(parcelCaptures({ state: null, publishedIds: NEW }).checked, false);
  assert.match(parcelCaptures({ state: {}, publishedIds: NEW }).why, /could not be read/);
  assert.deepEqual(parcelCaptures({ state: { marks: [parcel("ola/the-low-house-parcel")], errors: [] }, publishedIds: NEW }), { checked: true, parcels_checked: 1, events: [] });
});

test("newly means the crossing made the pair: a republished parcel's unchanged pair is not an event, a parcel that newly takes one in still is (WLD-224 F1)", () => {
  const prior = (map) => (id) => map[id] ?? null;
  // the parcel is republished (its words amended): it is in publishedIds, and pip's cafe already filed under it on main
  const same = parcelCaptures({ state: world(), publishedIds: NEW, priorParentOf: prior({ "pip/the-cafe": "ola/the-low-house-parcel" }) });
  assert.deepEqual(same, { checked: true, parcels_checked: 1, events: [] }, "an unchanged older-foreign pair is not a new capture: looked at one parcel, found nothing new");
  // the same republication, but the parcel was moved or resized and now newly takes the cafe in: its prior parent was the frame
  const moved = parcelCaptures({ state: world(), publishedIds: NEW, priorParentOf: prior({ "pip/the-cafe": "the-town/the-frame" }) });
  assert.deepEqual(moved.events.map((e) => e.mark), ["pip/the-cafe"], "a parcel that newly takes an older mark in is flagged, republished or not");
  // a mark that did not stand on main (no prior parent) is a pair this crossing made
  assert.equal(parcelCaptures({ state: world(), publishedIds: NEW, priorParentOf: prior({}) }).events.length, 1);
  // the other pairs are judged one by one: one unchanged, one new
  const two = world({ marks: [row("cy/the-stall", { placementParent: "ola/the-low-house-parcel", date: "2026-10-30T00:00:00.000Z" })] });
  const mixed = parcelCaptures({ state: two, publishedIds: NEW, priorParentOf: prior({ "pip/the-cafe": "ola/the-low-house-parcel" }) });
  assert.deepEqual(mixed.events.map((e) => e.mark), ["cy/the-stall"]);
});

test("it reads, it does not decide: the same rows give the same parents with or without the flag (nothing is written or filtered)", () => {
  const state = world();
  const before = JSON.stringify(state);
  parcelCaptures({ state, publishedIds: NEW });
  assert.equal(JSON.stringify(state), before, "the folded world is untouched");
});
