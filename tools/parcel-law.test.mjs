// parcel-law.test.mjs — THE CODE IS TIED TO THE LAW (Darko, 2026-10-04; Linear POS-368).
//
// Before 10-04 the claim cap of three lived only as `PARCEL_CLAIM_CAP` in
// marks-fold.mjs, the only written law said "Claiming is untouched — still one
// parcel to a handle" (the-town/household-scope, 08-18), and the per-resident
// refusal's sentence said "household already holds a parcel". Darko ruled the
// whole of it on 10-04: "One parcel per resident, three per household. Yes."
//
// A ruling is not done until its law mark says it, and the code is tied to the
// law by a test. This is the test. Every assertion below reads the Keeping
// Works' own marks from WORLD/marks (the tree the fold reads), never a copy of
// what they say, so re-wording the law or the code alone turns it red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadMarks, fold, admitDelta, admissionBase,
  PARCEL_CLAIM_CAP, CLAIM_CAP_LAW, ONE_PER_RESIDENT_LAW, ONE_PER_RESIDENT_REFUSAL,
  ONE_PER_RESIDENT_PRIOR_ESTATE, ONE_PARCEL_PER_HANDLE_EXCEPTIONS,
} from "./marks-fold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKS = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
const byId = new Map(MARKS.map((m) => [m.id, m]));
const law = (id) => {
  const m = byId.get(id);
  assert.ok(m, `the law mark ${id} stands in WORLD/marks`);
  assert.equal(m.by, "the-town", `${id} is the town's`);
  assert.equal(m.tier, "constitution", `${id} is constitution tier`);
  assert.equal(m.kind, "predicated", `${id} is a predicate`);
  assert.equal(m.parent, "the-town/parcel", `${id} describes the parcel class`);
  return m;
};
const NUMBER_WORD = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five" };

const P = (id, by, x, date) => ({
  id, by, household: by, kind: "parcel", tier: "market",
  at: { x, y: 0 }, extent: { w: 25, h: 25 }, date, body: "b",
});

test("the claim cap in code IS the claim-cap law mark's value", () => {
  const cap = law(CLAIM_CAP_LAW);
  assert.equal(cap.slot, "claim-cap");
  assert.equal(Number(cap.value), PARCEL_CLAIM_CAP,
    "PARCEL_CLAIM_CAP must equal the-town/claim-cap's value — change one and the other must follow");
  assert.match(String(cap.date), /^2026-10-04/, "dated the day Darko restated it");
});

test("the per-resident refusal names the one-per-resident law, and says the cap the law says", () => {
  const one = law(ONE_PER_RESIDENT_LAW);
  assert.equal(one.slot, "holder");
  assert.match(String(one.value), /exactly one resident; a resident holds at most one parcel/);
  assert.ok(ONE_PER_RESIDENT_REFUSAL.includes(ONE_PER_RESIDENT_LAW), "the sentence names the law it enforces");
  assert.ok(ONE_PER_RESIDENT_REFUSAL.startsWith(
    "this resident already holds a parcel; a household may hold up to three, one per resident"),
    "Darko's sentence, word for word");
  const word = NUMBER_WORD[Number(law(CLAIM_CAP_LAW).value)];
  assert.ok(ONE_PER_RESIDENT_REFUSAL.includes(`up to ${word},`),
    "the number in the sentence is the claim-cap law's number");
});

test("both copies of the check refuse a resident's second parcel with that sentence; a housemate's first stands", () => {
  const households = { "an-owl": "the-roost", "a-wren": "the-roost" };
  const first = P("an-owl/first-parcel", "an-owl", 0, "2026-07-01T00:00:00Z");
  const second = P("an-owl/second-parcel", "an-owl", 500, "2026-07-02T00:00:00Z");
  const state = fold({ marks: [first, second], terrain: { features: [] }, stakes: [], tick: 1, households });
  assert.deepEqual(state.errors, [{ mark: "an-owl/second-parcel", error: ONE_PER_RESIDENT_REFUSAL }]);
  const viaDelta = admitDelta([{ ...second }], admissionBase({ marks: [{ ...first }] }, { households }));
  assert.deepEqual(viaDelta.errors, [{ mark: "an-owl/second-parcel", error: ONE_PER_RESIDENT_REFUSAL }]);
  const housemate = P("a-wren/her-parcel", "a-wren", 900, "2026-07-03T00:00:00Z");
  const both = fold({ marks: [first, housemate], terrain: { features: [] }, stakes: [], tick: 1, households });
  assert.deepEqual(both.errors, [], "one resident, one parcel — two residents of one household hold one each");
});

test("household-scope no longer says one parcel to a handle; it says three to a household, one to a resident", () => {
  const scope = law("the-town/household-scope");
  assert.doesNotMatch(scope.body, /one parcel to a handle/);
  assert.match(scope.body, /Three to a household, one to a resident/);
  assert.match(String(scope.date), /^2026-10-04/);
});

test("the homes law marks stand (homes per resident; the resident's own declaration)", () => {
  assert.match(String(law("the-town/homes-per-resident").value), /per resident/);
  assert.match(String(law("the-town/declared-home").value), /resident's own slot home predicate/);
});

test("Sol's Driftlight stands as PRIOR ESTATE, never a home, and is the only one", () => {
  assert.equal(ONE_PARCEL_PER_HANDLE_EXCEPTIONS, ONE_PER_RESIDENT_PRIOR_ESTATE, "the old name is the same map");
  assert.deepEqual([...ONE_PER_RESIDENT_PRIOR_ESTATE.keys()], ["sol-am-lichterfenster/driftlight-house-parcel"]);
  assert.match(ONE_PER_RESIDENT_PRIOR_ESTATE.get("sol-am-lichterfenster/driftlight-house-parcel"),
    /^PRIOR ESTATE, never a home \(Darko, 2026-10-04/);
});
