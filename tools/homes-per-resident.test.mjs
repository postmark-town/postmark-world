// homes-per-resident.test.mjs — THE FALSIFIER FOR HOMES PER RESIDENT (Darko, 2026-10-04; POS-368).
//
//   "The default for a resident should just be the household's parcel being
//    their home. A parcel shared by five housemates can be home to all five.
//    We need to design the system such that that is not only possible, but the
//    default."
//
// The law: the-town/homes-per-resident and the-town/declared-home. The
// resolver: tools/where-is.mjs § homeOf (declared, else own parcel, else the
// household's first in claim order). Every world here is a REAL fold of
// fixture marks, so claim order, prior estate and the household grain come
// from the fold, never from a hand-built list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, admitDelta, admissionBase, HOME_OUTSIDE_HOUSEHOLD_REFUSAL } from "./marks-fold.mjs";
import { homeOf, homesOnParcel, readHomeDeclaration } from "./where-is.mjs";
import { homesOfParcel, householdHomeAt } from "../spectator/viewer.mjs";
import { homeColumnModel } from "../spectator/home-column.mjs";
import { readFileSync } from "node:fs";
import { assembleWorld } from "./world-build.mjs";
import { buildWorld } from "./world-poc.mjs";

const P = (id, by, x, date) => ({
  id, by, household: by, kind: "parcel", tier: "market",
  at: { x, y: 0 }, extent: { w: 25, h: 25 }, date, body: "b",
});
const HOUSE = (id, by, x, y, date = "2026-09-01T00:00:00Z") => ({
  id, by, household: by, kind: "sited", tier: "market", at: { x, y }, extent: { w: 6, h: 6 }, date, body: "b",
});
const HOME = (id, by, parent, value, date) => ({
  id, by, household: by, kind: "predicated", tier: "market", parent, slot: "home", value, date, body: "b",
});
const world = (marks, households) => fold({ marks, terrain: { features: [] }, stakes: [], tick: 1, households });

const FIVE = ["ash", "birch", "cedar", "damson", "elm"];
const ROOST = Object.fromEntries(FIVE.map((h) => [h, "the-roost"]));
const ROOST_PARCEL = P("ash/the-roost-parcel", "ash", 0, "2026-08-01T00:00:00Z");

test("D1 · a household of five with one parcel: all five read it as home, and the card shows five", () => {
  const w = world([ROOST_PARCEL], ROOST);
  for (const h of FIVE) {
    const home = homeOf(h, w);
    assert.equal(home.parcel_id, ROOST_PARCEL.id, `${h} is at home on the roost`);
    assert.equal(home.via, h === "ash" ? "own" : "household");
    assert.deepEqual([home.x, home.y], [0, 0], "the parcel's centre");
  }
  const on = homesOnParcel(ROOST_PARCEL.id, w);
  assert.deepEqual(on.map((r) => r.handle), FIVE, "five residents, the holder first");
  // the map reads the same answer, and the column carries all five
  assert.equal(homesOfParcel(ROOST_PARCEL.id, w).length, 5);
  const model = homeColumnModel({ handle: "ash", residents: on.map((r) => ({ handle: r.handle, via: r.via, picture: null })) });
  assert.deepEqual(model.residents.map((r) => r.handle), FIVE, "the column's homes strip shows five");
});

test("D2 · one declares a house of theirs on the parcel, and only that one's home moves", () => {
  const before = world([ROOST_PARCEL], ROOST);
  const door = HOUSE("cedar/the-red-door", "cedar", 8, -5);
  const word = HOME("cedar/home", "cedar", ROOST_PARCEL.id, "cedar/the-red-door", "2026-10-04T12:00:00Z");
  const after = world([ROOST_PARCEL, door, word], ROOST);
  assert.deepEqual(after.errors, [], "the declaration folds clean");
  const cedar = homeOf("cedar", after);
  assert.equal(cedar.via, "declared");
  assert.equal(cedar.home_mark, "cedar/the-red-door");
  assert.equal(cedar.parcel_id, ROOST_PARCEL.id, "still the roost's ground");
  assert.deepEqual([cedar.x, cedar.y], [8, -5], "cedar's home moved to the house cedar declared");
  for (const h of FIVE.filter((x) => x !== "cedar")) {
    const a = homeOf(h, after), b = homeOf(h, before);
    assert.deepEqual([a.x, a.y, a.via, a.home_mark], [b.x, b.y, b.via, b.home_mark], `${h}'s home did not move`);
  }
  assert.equal(homesOnParcel(ROOST_PARCEL.id, after).length, 5, "still home to all five");
  // the viewer's map card follows: cedar's entry names the house, nobody else's does
  const homes = homesOfParcel(ROOST_PARCEL.id, after);
  assert.deepEqual(homes.filter((h) => h.home_mark).map((h) => [h.handle, h.home_mark.id]), [["cedar", "cedar/the-red-door"]]);
});

test("D3 · a sixth, parcel-less resident in a household of two parcels gets the first in claim order, via household", () => {
  const households = { gale: "two-roofs", hazel: "two-roofs", fern: "two-roofs" };
  // hazel's parcel is FIRST in the filesystem's order but SECOND by claim date
  const hazels = P("hazel/the-later-parcel", "hazel", 400, "2026-08-20T00:00:00Z");
  const gales = P("gale/the-earlier-parcel", "gale", 0, "2026-08-02T00:00:00Z");
  const w = world([hazels, gales], households);
  const fern = homeOf("fern", w);
  assert.equal(fern.parcel_id, "gale/the-earlier-parcel", "the household's first in claim order");
  assert.equal(fern.via, "household");
  assert.equal(homeOf("hazel", w).parcel_id, "hazel/the-later-parcel", "a holder's home is their own parcel");
  assert.equal(householdHomeAt("fern", { parcels: w.parcels, marks: w.marks, households: w.households }).markId,
    "gale/the-earlier-parcel", "and the viewer's own reader says the same");
});

test("D4 · housemates' home words stand side by side: no rivalry, and the newest valid word wins", () => {
  const ashHouse = HOUSE("ash/the-first-house", "ash", -6, 6);
  const birchHouse = HOUSE("birch/the-loft", "birch", 6, 6);
  const marks = [ROOST_PARCEL, ashHouse, birchHouse,
    HOME("ash/home", "ash", ROOST_PARCEL.id, "ash/the-first-house", "2026-10-01T00:00:00Z"),
    HOME("birch/home", "birch", ROOST_PARCEL.id, "birch/the-loft", "2026-10-02T00:00:00Z"),
    // birch's newer word says the parcel itself, by birch's own handle
    HOME("birch/home-again", "birch", ROOST_PARCEL.id, "birch", "2026-10-03T00:00:00Z")];
  // each word carries a stamp, so two words in ONE slot would be a weighed rivalry
  const stakes = ["ash/home", "birch/home", "birch/home-again"].map((mark) => ({ mark, n: 1, holder: mark.split("/")[0], tick: 0 }));
  const w = fold({ marks, terrain: { features: [] }, stakes, tick: 1, households: ROOST });
  assert.deepEqual(w.errors, []);
  assert.deepEqual(w.rivalries.filter((r) => String(r.slot).endsWith("::home")), [], "no slot is shared: one resident's home is not a rival claim on another's");
  assert.ok(w.rivalries.every((r) => !String(r.slot).includes("::home::") || String(r.slot).endsWith("::home::birch")), "only birch's own two words meet, in birch's own slot (newest wins, below)");
  assert.equal(w.determined[`${ROOST_PARCEL.id}::home::ash`], "ash/the-first-house", "each resident's word is determined in a slot of its own");
  assert.equal(homeOf("ash", w).home_mark, "ash/the-first-house");
  assert.equal(homeOf("birch", w).via, "declared");
  assert.equal(homeOf("birch", w).home_mark, null, "birch's newest word names the parcel, not the loft");
});

test("D5 · a home declared on another household's parcel is refused by the fold (both copies), and never read as home", () => {
  const households = { ...ROOST, stranger: "elsewhere" };
  const word = HOME("stranger/home", "stranger", ROOST_PARCEL.id, "stranger", "2026-10-04T00:00:00Z");
  const whole = world([ROOST_PARCEL, word], households);
  assert.deepEqual(whole.errors, [{ mark: "stranger/home", error: HOME_OUTSIDE_HOUSEHOLD_REFUSAL }]);
  assert.match(HOME_OUTSIDE_HOUSEHOLD_REFUSAL, /the-town\/declared-home/, "the refusal names the law");
  const viaDelta = admitDelta([{ ...word }], admissionBase(world([ROOST_PARCEL], households), { households }));
  assert.deepEqual(viaDelta.errors, [{ mark: "stranger/home", error: HOME_OUTSIDE_HOUSEHOLD_REFUSAL }]);
  // CONTROL: a housemate's word on the same parcel is admitted
  const ok = admitDelta([{ ...HOME("elm/home", "elm", ROOST_PARCEL.id, "elm", "2026-10-04T00:00:00Z") }],
    admissionBase(world([ROOST_PARCEL], households), { households }));
  assert.deepEqual(ok.errors, []);
  // and the resolver, handed such a word anyway, skips it and says why
  const read = readHomeDeclaration(word, world([ROOST_PARCEL], households));
  assert.match(read.refused, /outside the resident's household/);
});

test("D6 · prior estate is never anyone's home: the fold marks it, and a declaration on it is refused by the resolver", () => {
  const households = { "sol-am-lichterfenster": "herzfunke-husband" };
  const das = P("sol-am-lichterfenster/das-lichterfenster-parcel", "sol-am-lichterfenster", 0, "2026-09-02T00:00:00Z");
  const drift = P("sol-am-lichterfenster/driftlight-house-parcel", "sol-am-lichterfenster", 500, "2026-10-01T00:00:00Z");
  const word = HOME("sol-am-lichterfenster/home", "sol-am-lichterfenster", drift.id, "sol-am-lichterfenster", "2026-10-04T00:00:00Z");
  const w = world([das, drift, word], households);
  assert.deepEqual(w.errors, [], "Driftlight stands");
  assert.equal(w.parcels.find((p) => p.id === drift.id).prior_estate, true);
  const home = homeOf("sol-am-lichterfenster", w);
  assert.equal(home.parcel_id, das.id, "the home is Das Lichterfenster, never Driftlight");
  assert.equal(home.declaration_refused.id, "sol-am-lichterfenster/home");
  assert.match(home.declaration_refused.why, /prior estate/);
});

// D7 · THE READERS GET THE MAP (2026-10-05, town #3450). The worlds above are
// fold outputs, which carry `households`; no live reader hands homeOf a fold.
// The office and the Spectator hand it assembleWorld's world, and the PoC hands
// it buildWorld's, and both arrived without the map, so Gabo of La Casa Rodante
// (no parcel; Migue holds the household's) read "no home". Gabo's case, as each
// reader builds it.
const SKELETON = JSON.parse(readFileSync(new URL("../WORLD/skeleton.json", import.meta.url), "utf8"));
const RODANTE = { gabo: "hh:la-casa-rodante", "migue-flint": "hh:la-casa-rodante" };
const RODANTE_PARCEL = { ...P("migue-flint/la-casa-rodante", "migue-flint", -450, "2026-09-20T00:00:00Z"), at: { x: -450, y: 5480 } };

test("D7 · a parcel-less housemate is at home on the household's parcel through assembleWorld (the office's and the Spectator's world)", () => {
  const published = world([RODANTE_PARCEL], RODANTE);
  const w = assembleWorld({ worldState: published, skeleton: SKELETON });
  assert.deepEqual(w.households, RODANTE, "the fold's household map rides through the assembly, as the parcels do");
  const home = homeOf("gabo", w);
  assert.equal(home.placed, true, "Gabo is placed, not left at the Origin");
  assert.equal(home.parcel_id, RODANTE_PARCEL.id);
  assert.equal(home.via, "household");
  assert.deepEqual(homesOnParcel(RODANTE_PARCEL.id, w).map((h) => [h.handle, h.via]),
    [["migue-flint", "own"], ["gabo", "household"]], "the card names both residents, holder first");
});

test("D8 · buildWorld (the disk path) carries the published registry, WORLD/households.json", () => {
  const registry = JSON.parse(readFileSync(new URL("../WORLD/households.json", import.meta.url), "utf8")).households;
  const w = buildWorld({ crossing: 20 });
  assert.deepEqual(w.households, registry, "the readers' map is the registry the crossing folds with");
});
