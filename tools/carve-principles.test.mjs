#!/usr/bin/env node
// carve-principles.test.mjs — what the disabled region carve said that still
// holds, asked of the law that replaced it (WLD-101, 2026-10-21).
//
// The carve's own tests are retired (the note beside CARVE-DISABLED-2026-08-22
// in marks-fold.mjs). Ground is now settled by the senior at contact, who may
// oppose by density, and a mark is returned whole (LOGOS conflict-matrix
// § Roles from seniority, RULED 2026-10-04). Three of the carve's principles
// carry over to that law and are asserted here on its ruled path: every senior
// below is dated before the mark it opposes. The third, that a sovereign mark
// and a constitution mark never enter, is live since WLD-102 (2026-10-21).
// The fourth, "there is no class law", is consent.test.mjs's ("NO CLASS LAW").
//
// Run: node --test tools/carve-principles.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { fold } from "./marks-fold.mjs";

const terrain = { features: [] };
const sited = (id, by, x, y, w, h, extra = {}) => ({
  id: `${by}/${id}`, slug: id, by, household: by, kind: "sited", tier: "market",
  at: { x, y }, extent: { w, h }, date: "2026-08-10", body: id, ...extra,
});
const stake = (holder, mark, n) => ({ holder, mark, n, weight: n, tick: 0 });
const standing = (state, id) => state.marks.some((m) => m.id === id);
const SENIOR = "2026-08-01";

test("one household's own nesting is NOT a contest: a backed senior's opposed word on its own household's mark moves nothing", () => {
  const opposed = fold({
    marks: [sited("estate", "v", 0, 0, 1000, 1000, { date: SENIOR, consent: { "v/shed": "opposed" } }), sited("shed", "v", 0, 0, 10, 10)],
    terrain, tick: 1, stakes: [stake("s", "v/estate", 100)],
  });
  assert.equal(standing(opposed, "v/shed"), true, "one household's marks do not rival each other");
  assert.deepEqual(opposed.returned, []);
  // the control: the same word from another household is a veto, earned
  const foreign = fold({
    marks: [sited("estate", "a", 0, 0, 1000, 1000, { date: SENIOR, consent: { "v/shed": "opposed" } }), sited("shed", "v", 0, 0, 10, 10)],
    terrain, tick: 1, stakes: [stake("s", "a/estate", 100)],
  });
  assert.equal(standing(foreign, "v/shed"), false, "a backed senior of another household turns the shed away");
});

test("an overlap nobody has backed is not a contest: an unstaked senior's opposed word is only a word", () => {
  const state = fold({
    marks: [sited("one", "a", 0, 0, 100, 100, { date: SENIOR, consent: { "b/two": "opposed" } }), sited("two", "b", 50, 50, 100, 100)],
    terrain, tick: 1, stakes: [],
  });
  assert.equal(standing(state, "b/two"), true, "no stamps anywhere, so nothing to compare");
  assert.deepEqual(state.returned, []);
});

test("an overlap is not a contest without a word: two backed households overlapping each keep their mark", () => {
  // The carve compared every overlap by density. Under seniority nothing is
  // compared until the senior speaks: two rectangles touching is not a dispute.
  const state = fold({
    marks: [sited("district", "a", 0, 0, 2000, 2000, { date: SENIOR }), sited("bench", "b", 0, 0, 10, 10)],
    terrain, tick: 1, stakes: [stake("s", "a/district", 500), stake("t", "b/bench", 1)],
  });
  for (const id of ["a/district", "b/bench"]) assert.equal(standing(state, id), true, `${id} stands`);
  assert.deepEqual(state.returned, []);
});

test("a sovereign mark and a constitution mark never enter: a backed senior's market opposition returns neither (WLD-102)", () => {
  // The fourth principle, live since Darko's rulings of 2026-10-21 (LOGOS
  // conflict-matrix § Two grounds the market never reaches). A sovereign mark
  // here is one laid inside its own household's parcel after the parcel; one
  // that stood there before the parcel keeps the seniors it had.
  const parcel = { id: "v/lot", slug: "lot", by: "v", household: "v", kind: "parcel", tier: "market", at: { x: 0, y: 0 }, extent: { w: 25, h: 25 }, date: "2026-08-05", body: "lot" };
  const state = fold({
    marks: [
      sited("estate", "a", 0, 0, 1000, 1000, { date: SENIOR, consent: { "the-town/well": "opposed", "v/house": "opposed" } }),
      sited("well", "the-town", 300, 300, 20, 20, { tier: "constitution" }),
      parcel,
      sited("house", "v", 0, 0, 10, 10),
    ],
    terrain, tick: 1, stakes: [stake("s", "a/estate", 100)],
  });
  assert.equal(state.marks.find((m) => m.id === "v/house")?.sovereign, true, "the house is sovereign: inside its own household's parcel");
  for (const id of ["the-town/well", "v/house"]) assert.equal(standing(state, id), true, `${id} stands`);
  assert.deepEqual(state.returned, []);
});
