// POS-200 — the parcel column's lead picture is the RECORD's dwelling's picture.
//
// Keemin, 2026-09-23: "latnernstep house shows the art for the garden tin. we
// did a fix for the name, but the image still seems to pull from the wrong
// mark". The column's lead was `(home && markImagePath(home)) ??
// markImagePath(parcel)` with `home` from `homeMarkOfParcel`, which took any
// home-tier sited mark on the parcel and preferred a pictured one, first found
// wins. These four falsifiers state the rule the row asked for — the
// dwelling's own image, else the parcel's own, else none; never a child's by
// image-preference — and each one is RED against origin/main's helper
// (3eed7ea6), run once with this file copied into that tree (the PR body
// quotes the four red lines).
//
// The lead is computed here exactly as the column computes it, from the two
// functions both the old viewer and the new one export, so the same file runs
// against either. Fixtures are the PUBLISHED fold's shape (placementParent,
// tier, by) — what the viewer actually holds — never a loader mark.
import { test } from "node:test";
import assert from "node:assert/strict";
import { homeMarkOfParcel, markImagePath } from "../spectator/viewer.mjs";

const lead = (parcel, marks) => {
  const home = homeMarkOfParcel(parcel.id, marks);
  return (home && markImagePath(home)) ?? markImagePath(parcel) ?? null;
};
const shelf = (name) => `https://media.postmark.town/media/rei/${name}.webp`;
const path = (name) => markImagePath({ image: shelf(name) });

// rei's ground as the live fold carries it (crossing 207): the parcel with no
// picture, the Lanternstep House at its exact centre, the garden tin 12 m off
// it — and the tin listed FIRST, as the fold lists it.
const PARCEL = { id: "rei/the-house-parcel", kind: "parcel", by: "rei", tier: "home", at: { x: 1088, y: -794.5 }, extent: { w: 25, h: 25 } };
const HOUSE = { id: "rei/the-house", kind: "sited", by: "rei", tier: "home", placementParent: PARCEL.id, at: { x: 1088, y: -794.5 }, extent: { w: 12, h: 12 }, image: shelf("A") };
const TIN = { id: "rei/the-tin", kind: "sited", by: "rei", tier: "home", placementParent: PARCEL.id, at: { x: 1089.8, y: -806.7 }, extent: { w: 0.4, h: 0.3 }, image: shelf("B") };

test("(a) rei's shape: the house at the centre with picture A, a pictured tin elsewhere with B → the lead is A", () => {
  assert.equal(lead(PARCEL, [PARCEL, TIN, HOUSE]), path("A"));
});

test("(b) the house carries no picture → the parcel's own picture if it has one, else none — NEVER the tin's", () => {
  const bareHouse = { ...HOUSE, image: undefined };
  assert.equal(lead({ ...PARCEL, image: shelf("P") }, [{ ...PARCEL, image: shelf("P") }, TIN, bareHouse]), path("P"), "the parcel's own");
  assert.equal(lead(PARCEL, [PARCEL, TIN, bareHouse]), null, "and none where the parcel has none");
});

test("(c) the parcel's slot: home predicate names the dwelling, and it wins over the centre", () => {
  const SHED = { id: "rei/the-shed", kind: "sited", by: "rei", tier: "home", placementParent: PARCEL.id, at: { x: 1094, y: -790 }, extent: { w: 4, h: 4 }, image: shelf("S") };
  const PRED = { id: "rei/home", kind: "predicated", by: "rei", parent: PARCEL.id, placementParent: PARCEL.id, slot: "home", value: "the-shed" };
  assert.equal(lead(PARCEL, [PARCEL, HOUSE, SHED, PRED]), path("S"));
});

test("(d) two children, neither at the centre, no predicate → no dwelling, and no picture: the record's refusal, not a guess", () => {
  const off = { ...HOUSE, at: { x: 1080, y: -790 } };
  assert.equal(lead(PARCEL, [PARCEL, off, TIN]), null);
});
