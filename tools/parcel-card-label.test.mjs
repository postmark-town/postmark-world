// parcel-card-label.test.mjs — A CARD NAMES THE GROUND IT IS DRAWN ON.
//
// Keemin, 2026-09-20: "let's just use the parcel's name, and strip the word
// 'parcel'."
//
// The card was labelled with the DWELLING's name from 2026-09-11, found by
// `homeMarkOfParcel` — the first home-tier sited mark on the parcel, preferring
// one with a picture. On rei's ground that is the Garden Notebook Tin, 0.4 ×
// 0.3 m and pictured, so the card read "The Garden Notebook Tin" while the
// house beside it was the Lanternstep House at 12 × 12. The fix is not a better
// picker: the ground has a name of its own, so nothing is picked and nothing
// can be picked wrong.
//
// The trailing "parcel" is filing, not naming — 80 of the town's 92 parcels
// carry it in their slug and 12 do not — and the ID IS UNTOUCHED.
//
// RED against main, which exports no `parcelCardLabel` at all. Imported
// dynamically so that absence fails an assertion rather than crashing the
// module load: a test file that cannot be parsed reports the same exit code as
// a test that failed, and only one of those proves anything.

import test from "node:test";
import assert from "node:assert/strict";

const viewerModule = () => import("../spectator/viewer.mjs");

async function label() {
  const mod = await viewerModule();
  assert.equal(typeof mod.parcelCardLabel, "function",
    "spectator/viewer.mjs must export parcelCardLabel");
  return mod.parcelCardLabel;
}

// The two grounds the founder named, spelled as the fold spells them.
const REI = { id: "rei/the-lanternstep-house-parcel", kind: "parcel", household: "rei", at: { x: 1088, y: -794.5 } };
const KEEPERS = { id: "current-the-reader/the-keepers-flat", kind: "parcel", household: "current-the-reader", at: { x: -350, y: 4955 } };
const ANTOINE = { id: "berthillon/chez-antoine", kind: "parcel", household: "berthillon", at: { x: 0, y: 0 } };

test("rei's card names her ground, not the smallest pictured thing on it", async () => {
  const parcelCardLabel = await label();
  assert.equal(parcelCardLabel(REI), "The Lanternstep House");
});

test("a parcel whose name never said 'parcel' is left alone", async () => {
  const parcelCardLabel = await label();
  assert.equal(parcelCardLabel(KEEPERS), "The Keepers Flat");
  assert.equal(parcelCardLabel(ANTOINE), "Chez Antoine");
});

test("the word goes from a DETERMINED name too, not only from a slug", async () => {
  const parcelCardLabel = await label();
  // A resident who wins the name may write it with the word in; the rule is
  // about the word, not about where the name came from.
  assert.equal(parcelCardLabel(REI, { "rei/the-lanternstep-house-parcel::name": "The Lanternstep House parcel" }),
    "The Lanternstep House");
  assert.equal(parcelCardLabel(REI, { "rei/the-lanternstep-house-parcel::name": "The Lanternstep House Parcel" }),
    "The Lanternstep House");
});

test("the word goes only from the END — a parcel with it in the middle keeps it", async () => {
  const parcelCardLabel = await label();
  assert.equal(parcelCardLabel({ id: "x/parcel-house-parcel" }), "Parcel House");
});

test("a name that is nothing BUT the word keeps its name rather than going blank", async () => {
  const parcelCardLabel = await label();
  assert.equal(parcelCardLabel({ id: "x/parcel" }), "Parcel",
    "stripping to an empty string would label the card with nothing at all");
});

test("CONTROL — the label really is derived, and a different ground gives a different answer", async () => {
  const parcelCardLabel = await label();
  assert.notEqual(parcelCardLabel(REI), parcelCardLabel(KEEPERS));
});

test("[pin] the ID is untouched — this is a display name and nothing routes by it", async () => {
  const parcelCardLabel = await label();
  // The card carries `data-id` and every click, link and lookup uses it. If the
  // label ever became the id's value, a renamed parcel would break its own card.
  assert.equal(REI.id, "rei/the-lanternstep-house-parcel");
  assert.notEqual(parcelCardLabel(REI), REI.id);
});

test("[pin] the card's label call is the parcel's, not the dwelling's", async () => {
  // A source guard: the behaviour lives in a browser this test does not have,
  // and the old line (`label: home ? markName(home).name : ...`) is exactly the
  // shape that would come back on a careless merge. Comments stripped first.
  const { readFileSync } = await import("node:fs");
  const code = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /label: parcelCardLabel\(parcel, data\?\.worldState\?\.determined \?\? \{\}\)/,
    "the overlay card labels itself from the parcel");
  assert.ok(!/label: home \? markName\(home\)\.name/.test(code),
    "and not from the dwelling homeMarkOfParcel picked");
  // AND THE COLUMN THE CARD OPENS SAYS THE SAME THING. A card and its column
  // are two views of one ground; left alone, the column kept reading
  // `markIdentity(home ?? mark)` and rei's card would have said "The
  // Lanternstep House" while her column said "The Garden Notebook Tin".
  assert.match(code, /title: parcelCardLabel\(mark, data\?\.worldState\?\.determined \?\? \{\}\)/,
    "the home column's title is the ground's name too");
  assert.ok(!/title: markIdentity\(home \?\? mark\)/.test(code),
    "and not the dwelling's, which is the same defect one surface over");
});

test("homeMarkOfParcel stays — the label was not its only reader", async () => {
  const mod = await viewerModule();
  assert.equal(typeof mod.homeMarkOfParcel, "function");
  // It still answers for the card's PICTURE, the home column and the town page.
  const { readFileSync } = await import("node:fs");
  const code = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8")
    .replace(/^\s*\/\/.*$/gm, "");
  const calls = code.match(/homeMarkOfParcel\(/g) ?? [];
  assert.ok(calls.length >= 4, `homeMarkOfParcel should still be called; found ${calls.length}`);
});
