import test from "node:test";
import assert from "node:assert/strict";
import { markStanding } from "./mark-standing.mjs";

// build a byId map from plain mark objects (the folded shape: by, kind, parent, sovereign, tier)
const world = (...marks) => new Map(marks.map((m) => [m.id, m]));

const PARCEL = { id: "wright/the-trueing-house-parcel", kind: "parcel", by: "wright" };
const HOUSE = { id: "wright/the-trueing-house", kind: "sited", by: "wright", sovereign: true, parent: PARCEL.id };

test("holder's own mark inside their parcel is home", () => {
  const mine = { id: "wright/the-bench", kind: "sited", by: "wright", parent: PARCEL.id };
  assert.equal(markStanding(mine, world(PARCEL, HOUSE, mine)), "home");
});

test("holder's predicated mark on their own sovereign structure is home", () => {
  const timber = { id: "wright/exposed-timber", kind: "predicated", by: "wright", parent: HOUSE.id, slot: "material" };
  assert.equal(markStanding(timber, world(PARCEL, HOUSE, timber)), "home");
});

test("a guest's mark inside another household's parcel is market, not home", () => {
  const flower = { id: "rei/a-flower", kind: "sited", by: "rei", parent: PARCEL.id };
  assert.equal(markStanding(flower, world(PARCEL, HOUSE, flower)), "market");
});

test("a guest's predicated mark on another's sovereign structure is market", () => {
  const ribbon = { id: "rei/a-ribbon", kind: "predicated", by: "rei", parent: HOUSE.id, slot: "door-color" };
  assert.equal(markStanding(ribbon, world(PARCEL, HOUSE, ribbon)), "market");
});

test("the parcel itself is its holder's home", () => {
  assert.equal(markStanding(PARCEL, world(PARCEL)), "home");
});

test("a mark with no parcel or sovereign ancestor stays market", () => {
  const region = { id: "limen/the-threshold-district", kind: "sited", by: "limen" };
  const room = { id: "limen/hearth-room", kind: "sited", by: "limen", parent: region.id };
  assert.equal(markStanding(room, world(region, room)), "market");
});

test("constitution tier holds when no ground governs", () => {
  const root = { id: "the-town/let-there-be-light", kind: "sited", by: "the-town", tier: "constitution" };
  assert.equal(markStanding(root, world(root)), "constitution");
});

// ── THE CONSTITUTION IS THE TOWN'S OWN MARKS (POS-702; Darko, 2026-10-19 09:59) ─
//
// "By definition, the constitutional marks are the ones that are belonging to
// the town." 58 town marks carried no `tier:` line (44 LOGOS predicates, 10
// sited pieces of the quay's furniture, 3 things, a note) and walked their
// ground to `market`. THE CAN-FAIL FLIP: in markStanding, put back
//     if ((mark.by ?? mark.household) === TOWN && mark.tier === "constitution") return "constitution";
// in place of `if (townOwned(mark)) return "constitution";` and the first two red.

test("FALSIFIER, POS-702: the-town/orient (a town predicate with no tier: line) stands at the constitution", () => {
  const orient = { id: "the-town/orient", kind: "predicate", by: "the-town", parent: "the-town/the-verbs-library" };
  assert.equal(markStanding(orient, world(orient)), "constitution");
});

test("the town's furniture and things stand at the constitution too, on a resident's ground or none", () => {
  const deck = { id: "the-town/the-deck", kind: "sited", by: "the-town" };
  const slice = { id: "the-town/a-slice-to-take-home", kind: "thing", by: "the-town", parent: PARCEL.id };
  assert.equal(markStanding(deck, world(deck)), "constitution");
  assert.equal(markStanding(slice, world(PARCEL, slice)), "constitution", "the town's own, even standing on wright's parcel");
});

test("a resident's `tier: constitution` still states nothing: the constitution is the town's hand, not a line", () => {
  const claim = { id: "wright/my-law", kind: "predicate", by: "wright", tier: "constitution" };
  assert.equal(markStanding(claim, world(claim)), "market");
});
