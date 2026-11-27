// thresholds.test.mjs — the crossing acts, their grammar, and the occupancy
// they derive. DEMO SLICE (step 5, jetto/enter-exit-demo).
//
// Every test here is a probe that could fail: each one names a fact that can
// only be true if the thing shipped. The ones that matter most are the two the
// wind-down ruled and could have been got wrong quietly — walk never implying
// entry, and an entity child's opposed being a REFUSAL rather than a standing
// edge with a null effect.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ENTER_EXIT_RE, DEFAULT_ENTRY_WORD, adjudicate, answerOf, containsEdges,
  demandsWord, entityChild, entryLawOf, formatEnterExit, isEntity, isMark,
  occupancyAt, occupantsOf, parseEnterExitLedger, stampAt, termsAt, withinOf,
} from "./enter-exit.mjs";
import { enterExitPlan, enter, enterPrompt, enteredScope, exit, exitPrompt, withinChain, shelterOf, sightFrameOf } from "./world-verbs.mjs";
import { walk } from "./world-verbs.mjs";

// ── a tiny world: a ship at the quay, a wheelhouse inside her, open ground ──
const SHIP = {
  id: "the-town/the-post-office", kind: "sited", by: "the-town", tier: "constitution",
  at: { x: 160, y: -20 }, extent: { w: 9, h: 26 },
  body: "The town's own mail boat, moored at Ferry's crossing.",
  entry: { word: "welcomed", edge: "aboard", consequence: "aboard when she sails" },
};
const WHEELHOUSE = {
  id: "the-town/the-wheelhouse", kind: "sited", by: "the-town", tier: "constitution",
  at: { x: 160, y: -21 }, extent: { w: 4, h: 2 },
  body: "The postmaster's wheelhouse, charts and a brass clock.",
  entry: { word: "opposed", consequence: "the wheelhouse is the postmaster's own" },
};
const HOLD = {
  id: "the-town/the-mail-hold", kind: "sited", by: "the-town",
  at: { x: 160, y: -16 }, extent: { w: 6, h: 7 },
  body: "The hold where the sacks ride dry.",
};
const QUAY = {
  id: "the-town/the-quay-reach", kind: "sited", by: "the-town", tier: "constitution",
  at: { x: 150, y: -20 }, extent: { w: 200, h: 200 }, body: "The quay reach.",
};
const world = { marks: [QUAY, SHIP, WHEELHOUSE, HOLD], terrain: { features: [] }, heightfield: { elevationAt: () => 0, controlPoints: [] } };

const ASHORE = { x: 40, y: -20, name: "adam" };
const ONDECK = { x: 160, y: -12, name: "adam" };  // her deck: inside the ship, inside no cabin
const INHOLD = { x: 160, y: -16, name: "adam" };  // standing on the hold's floor — geometrically

// ── the grammar ─────────────────────────────────────────────────────────────

test("a passage round-trips through its own grammar", () => {
  const line = formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 133.5421, word: "welcomed", iso: "2026-08-18T04:00:00.000Z" });
  assert.equal(line, "- 2026-08-18T04:00:00.000Z · adam · enters the-town/the-post-office · ferry 133.5421 · word welcomed");
  const { acts, unrecognized } = parseEnterExitLedger(line);
  assert.equal(unrecognized.length, 0);
  assert.deepEqual(acts[0], { iso: "2026-08-18T04:00:00.000Z", handle: "adam", act: "enters", mark: SHIP.id, at: 133.5421, word: "welcomed", line });
});

// POS-699 (2026-10-19): the writer floored the stamp it was handed a second time,
// and in floats stampAt is not idempotent ((k/1e4)·1e4 can land just under k), so
// about 9% of rows carried a ferry 0.0001 crossing early. The row holds the floor
// it was handed, at every instant of a day: 300 instants, 4,321 ms apart.
test("ONE FLOOR — a row's ferry is the stampAt it was handed, at every instant (POS-699)", () => {
  const EPOCH = Date.UTC(2026, 5, 12), HALF_DAY = 12 * 3600 * 1000;
  const start = Date.UTC(2026, 9, 19, 12);
  const wrong = [];
  for (let i = 0; i < 300; i++) {
    const at = stampAt((start + i * 4321 + 7 - EPOCH) / HALF_DAY);
    const line = formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at, word: "welcomed", iso: "2026-10-19T12:00:00.000Z" });
    const got = parseEnterExitLedger(line).acts[0].at;
    if (got !== at) wrong.push(`${at} written as ${got}`);
  }
  assert.deepEqual(wrong, [], `${wrong.length} of 300 rows carry a ferry other than the floor they were handed`);
});

test("an exit carries no word — nullifying your own side needs nobody's answer", () => {
  const line = formatEnterExit({ handle: "adam", act: "exits", mark: SHIP.id, at: 133.6, iso: "2026-08-18T05:00:00.000Z" });
  assert.match(line, /exits the-town\/the-post-office · ferry 133\.6000$/);
  assert.equal(parseEnterExitLedger(line).acts[0].word, null);
});

// ── THE FERRY FIELD ─────────────────────────────────────────────────────────
//
// The number on the row is the FERRY's fractional crossing — the town clock's
// own unit — and it used to be written `at <n>`, one separator away from prose
// about walking through a door. Two meanings of one word in one line.
//
// The writer says `ferry` from 2026-08-26. The reader takes BOTH, forever: the
// record holds 155 rows written in the old grammar and a record is not
// editable. A grammar change that orphaned them would be a rename storm paid
// for by the past.

test("THE FERRY FIELD — the writer names the ferry's number, never `at`", () => {
  const line = formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 151.5, word: "neutral", iso: "2026-08-26T22:00:00.000Z" });
  assert.match(line, / · ferry 151\.5000 · /);
  assert.equal(/ · at \d/.test(line), false, "the ferry's number must not be introduced by the word the door beside it uses");
});

test("THE FERRY FIELD — a row from the frozen era still parses, verbatim", () => {
  // Copied byte for byte off WORLD/enter-exit-ledger-frozen.md — the last
  // passage written before the single log took the pen.
  const historic = "- 2026-08-24T19:39:13.114Z · sable · enters fabel-of-garrison/the-riverside-arcade · at 147.6377 · word neutral";
  const { acts, unrecognized } = parseEnterExitLedger(historic);
  assert.equal(unrecognized.length, 0, "the frozen era must not become unreadable to its own reader");
  assert.deepEqual(acts[0], {
    iso: "2026-08-24T19:39:13.114Z", handle: "sable", act: "enters",
    mark: "fabel-of-garrison/the-riverside-arcade", at: 147.6377, word: "neutral", line: historic,
  });
});

test("THE FERRY FIELD — both eras fold into one occupancy, in order", () => {
  const both = [
    "- 2026-08-24T19:39:13.114Z · sable · enters fabel-of-garrison/the-riverside-arcade · at 147.6377 · word neutral",
    "- 2026-08-26T22:00:00.000Z · sable · exits fabel-of-garrison/the-riverside-arcade · ferry 151.5000",
  ].join(String.fromCharCode(10));
  const { acts, unrecognized } = parseEnterExitLedger(both);
  assert.equal(unrecognized.length, 0);
  assert.equal(occupancyAt(acts, 148).get("sable")?.length, 1, "inside, on the old grammar's row");
  assert.equal(occupancyAt(acts, 152).get("sable"), undefined, "and out again, on the new one's");
});

test("THE FERRY FIELD — the probe can fail: a row with no ferry number at all", () => {
  // THE CAN-FAIL FLIP for the two above. A reader that accepts both spellings
  // must still refuse a row that carries neither, or "both eras parse" would be
  // "everything parses" and would assert nothing.
  const { acts, unrecognized } = parseEnterExitLedger("- 2026-08-26T22:00:00.000Z · sable · enters x/y · 151.5000");
  assert.equal(acts.length, 0);
  assert.equal(unrecognized.length, 1);
  assert.equal(ENTER_EXIT_RE.test("- x · a · enters m · crossing 1"), false,
    "`crossing` is the ferry's clock and is not a field of this grammar");
});

test("a malformed row is unrecognized, never silently read as something else", () => {
  const { acts, unrecognized } = parseEnterExitLedger("- 2026-08-18 · adam · boards the-town/the-post-office");
  assert.equal(acts.length, 0);
  assert.equal(unrecognized.length, 1);
  assert.equal(ENTER_EXIT_RE.test("- x · adam · enters m · at 1 · word shouted"), false);
});

// ── the entry law: three keys, and silence means neutral ────────────────────

test("a silent mark answers neutral — the town's standing law, derived not stored", () => {
  assert.equal(entryLawOf(HOLD), null);
  assert.equal(answerOf(HOLD), DEFAULT_ENTRY_WORD);
  assert.equal(answerOf(HOLD), "neutral");
  assert.equal(demandsWord(HOLD), false);
  assert.equal(termsAt(HOLD), null);
});

test("a declared counter-edge is what demands the walker's explicit word", () => {
  assert.equal(demandsWord(SHIP), true);       // entry.edge: aboard
  assert.equal(demandsWord(WHEELHOUSE), false); // opposed, but no edge to accept
  assert.equal(termsAt(SHIP).consequence, "aboard when she sails");
  assert.match(termsAt(SHIP).reading_law, /text you are READING/);
});

// ── the handshake: one edge, two words ──────────────────────────────────────

test("terms unaccepted stops at the threshold and records nothing", () => {
  const verdict = adjudicate(SHIP, { accepted: false });
  assert.equal(verdict.effect, "terms");
  assert.equal(verdict.word, "welcomed");
  assert.match(verdict.because, /aboard edge back at you/);
});

test("terms accepted lands the crossing", () => {
  assert.equal(adjudicate(SHIP, { accepted: true }).effect, "entered");
});

test("an entity child opposed is REFUSED at the threshold — not a standing edge", () => {
  const verdict = adjudicate(WHEELHOUSE, { accepted: true });
  assert.equal(verdict.effect, "refused");
  assert.equal(verdict.word, "opposed");
  assert.match(verdict.because, /left standing at the door/);
});

// ── the derivation ──────────────────────────────────────────────────────────

const ROWS = (lines) => parseEnterExitLedger(lines.join("\n")).acts;

test("occupancy is a pure function of the acts and the clock", () => {
  const acts = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
    formatEnterExit({ handle: "adam", act: "enters", mark: HOLD.id, at: 11, word: "neutral" }),
  ]);
  assert.deepEqual([...occupancyAt(acts, 9).keys()], []);          // before the crossing
  assert.deepEqual(occupancyAt(acts, 10).get("adam"), [SHIP.id]);
  assert.deepEqual(occupancyAt(acts, 11).get("adam"), [SHIP.id, HOLD.id]);
  assert.equal(withinOf(occupancyAt(acts, 11), "adam"), HOLD.id);
});

test("exit truncates the chain — leaving the ship leaves her hold", () => {
  const acts = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
    formatEnterExit({ handle: "adam", act: "enters", mark: HOLD.id, at: 11, word: "neutral" }),
    formatEnterExit({ handle: "adam", act: "exits", mark: SHIP.id, at: 12 }),
  ]);
  assert.equal(occupancyAt(acts, 12).has("adam"), false);
  // and exiting the hold alone leaves you aboard
  const partial = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
    formatEnterExit({ handle: "adam", act: "enters", mark: HOLD.id, at: 11, word: "neutral" }),
    formatEnterExit({ handle: "adam", act: "exits", mark: HOLD.id, at: 12 }),
  ]);
  assert.deepEqual(occupancyAt(partial, 12).get("adam"), [SHIP.id]);
});

test("a refused crossing is in the record and mints no occupancy", () => {
  const acts = ROWS([formatEnterExit({ handle: "adam", act: "enters", mark: WHEELHOUSE.id, at: 10, word: "opposed" })]);
  assert.equal(acts.length, 1, "the act happened — being turned away is a fact about the town");
  assert.equal(occupancyAt(acts, 10).has("adam"), false, "and it put nobody inside anything");
});

test("occupants are the manifest: aboard a cabin is aboard the ship too", () => {
  const acts = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
    formatEnterExit({ handle: "adam", act: "enters", mark: HOLD.id, at: 11, word: "neutral" }),
    formatEnterExit({ handle: "bee", act: "enters", mark: SHIP.id, at: 11, word: "welcomed" }),
  ]);
  const occ = occupantsOf(occupancyAt(acts, 12));
  assert.deepEqual(occ.get(SHIP.id), ["adam", "bee"]);
  assert.deepEqual(occ.get(HOLD.id), ["adam"]);
});

test("the derived edges are literal `contains` with entity children (R14)", () => {
  const acts = ROWS([formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" })]);
  const edges = containsEdges(occupancyAt(acts, 10));
  assert.deepEqual(edges, [{ class: "contains", parent: SHIP.id, child: "adam", childKind: "entity" }]);
});

// ── the hoisted guard ───────────────────────────────────────────────────────

test("isMark refuses an entity child and keeps every mark", () => {
  const child = entityChild("adam", SHIP.id);
  assert.equal(isEntity(child), true);
  assert.equal(isMark(child), false);
  assert.equal(isMark(SHIP), true);
  assert.equal(child.at, null, "an entity child has no position of its own");
  assert.equal(child.extent, null, "and no area — which is the whole reason the guard exists");
});

// ── R15: the two axes, decoupled ────────────────────────────────────────────

test("walking onto a mark's ground does NOT put you within it", () => {
  const leg = walk(ASHORE, "E", 120, world);
  const acts = [];
  const occupancy = occupancyAt(acts);
  assert.equal(occupancy.has("adam"), false, "a walk is not a crossing");
  // and the state is a real one: geometrically inside, legally outside
  const prompt = enterPrompt(ONDECK, world, { occupancy, handle: "adam" });
  assert.equal(prompt.mark, SHIP.id, "the QoL prompt is what makes the decoupling visible rather than a trap");
  assert.ok(leg.newState.x > ASHORE.x);
});

test("the exit prompt fires when you walk off the ground of a mark you are within", () => {
  const acts = ROWS([formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" })]);
  const occupancy = occupancyAt(acts, 10);
  assert.equal(exitPrompt(ONDECK, world, { occupancy, handle: "adam" }), null);
  assert.equal(exitPrompt(ASHORE, world, { occupancy, handle: "adam" }).mark, SHIP.id);
});

// ── deep entry: a chain of crossings, each adjudicated ──────────────────────

test("enter from the shore bundles the walk and crosses each link in turn", () => {
  const plan = enterExitPlan(ASHORE, HOLD.id, world, { handle: "adam" });
  assert.deepEqual(plan.chain, [QUAY.id, SHIP.id, HOLD.id], "outermost first — the ancestry is the chain");
  assert.deepEqual(plan.walk, { to: { x: HOLD.at.x, y: HOLD.at.y }, mark: HOLD.id },
    "the walk half needs no consent, so it can never be the refused half");
});

test("a failed link strands you at THAT threshold, with everything before it standing", () => {
  const answer = enter(ASHORE, WHEELHOUSE.id, world, { handle: "adam", at: 20, accepted: true });
  assert.deepEqual(answer.entered, [QUAY.id, SHIP.id], "the links before the refusal landed");
  assert.equal(answer.stranded, WHEELHOUSE.id, "and you are left at the wheelhouse door — aboard, not ashore");
  assert.equal(answer.refused.word, "opposed");
  assert.equal(answer.rows.length, 3, "all three acts are in the record, including the refused one");
  const occupancy = occupancyAt(parseEnterExitLedger(answer.rows.join("\n")).acts, 20);
  assert.deepEqual(occupancy.get("adam"), [QUAY.id, SHIP.id], "the derivation reads the opposed word and mints nothing for it");
});

test("naming a deeper target cannot bypass an effect-bearing link", () => {
  // terms unaccepted on the ship: the hold is not reachable through her
  const answer = enter(ASHORE, HOLD.id, world, { handle: "adam", at: 20, accepted: false });
  assert.equal(answer.awaiting.mark, SHIP.id, "the boarding link asks first");
  assert.equal(answer.entered.includes(HOLD.id), false);
  assert.equal(answer.rows.some((r) => r.includes(HOLD.id)), false, "and nothing about the hold reached the record");
});

test("links already held drop out of the plan", () => {
  const acts = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: QUAY.id, at: 10, word: "neutral" }),
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
  ]);
  const occupancy = occupancyAt(acts, 10);
  const plan = enterExitPlan(INHOLD, HOLD.id, world, { occupancy, handle: "adam" });
  assert.deepEqual(plan.links, [HOLD.id], "a walker aboard asks only for the door he is standing at");
  assert.equal(plan.walk, null, "and standing on its floor already, he needs no walk to reach it");
});

// ── exit ────────────────────────────────────────────────────────────────────

test("exit answers with the scope it restores to", () => {
  const acts = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: QUAY.id, at: 10, word: "neutral" }),
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
  ]);
  const answer = exit(SHIP.id, world, { occupancy: occupancyAt(acts, 10), handle: "adam", at: 11 });
  assert.deepEqual(answer.within, [QUAY.id]);
  assert.equal(answer.into, QUAY.id, "the enclosing scope the view restores to");
});

test("exiting somewhere you are not within refuses with a reason", () => {
  const answer = exit(SHIP.id, world, { occupancy: new Map(), handle: "adam", at: 11 });
  assert.match(answer.error, /nothing to step out of/);
});

// ── the scoped read: the mark becomes the place ─────────────────────────────

test("the entered scope renders the mark's read, its children, and its occupants", () => {
  const acts = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
    formatEnterExit({ handle: "bee", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
  ]);
  const scope = enteredScope(SHIP.id, world, { occupancy: occupancyAt(acts, 10) });
  assert.match(scope.chrome, /^You are in: The town's own mail boat/);
  assert.equal(scope.read, SHIP.body);
  assert.deepEqual(scope.occupants, ["adam", "bee"]);
  assert.deepEqual(scope.children.filter((c) => c.kind === "entity").map((c) => c.id), ["adam", "bee"],
    "fellow occupants render for free — the manifest IS children");
  assert.ok(scope.children.some((c) => c.id === WHEELHOUSE.id), "and the mark children are there too");
  assert.equal(scope.marks.every(isMark), true, "the area-reading list is guarded");
  assert.equal(scope.enclosing.id, QUAY.id, "and exit restores to what encloses this");
});

test("the legal chain and the geometric one are allowed to disagree", () => {
  const acts = ROWS([formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" })]);
  const legal = withinChain(world, { occupancy: occupancyAt(acts, 10), handle: "adam" });
  assert.deepEqual(legal.map((w) => w.id), [SHIP.id], "he crossed one threshold");
  // his body, meanwhile, is ashore: he walked off after boarding (v0 does not stop him)
  assert.equal(exitPrompt(ASHORE, world, { occupancy: occupancyAt(acts, 10), handle: "adam" }).mark, SHIP.id);
});

// ── WLD-197 (#296 security review F1): the landform's refusal is the landform's alone ──
//
// Main lets a spark (WLD-173: a place, not ground) be entered, and an entered spark
// shelters and frames sight. Integrating the landform class onto main must leave that
// exactly so: only a landform is refused at the door, and only a landform shelters
// nothing and frames nothing (WLD-97, ruled 2026-10-22: it only shapes the ground).
test("WLD-197 · a spark is entered, sheltered in and framed by as on main; a landform alone is refused, shelters nothing and frames nothing", () => {
  const SPARK = { id: "adam/the-lamp-song", kind: "spark", by: "adam", at: { x: 120, y: -40 }, extent: { w: 6, h: 6 },
    body: "We sang until the lamps came on.", recounting: "It rained.", experienced_at: "2026-11-14T20:03:00Z" };
  const LANDFORM = { id: "the-town/the-inlet-slope", kind: "landform", by: "the-town", at: { x: 200, y: 40 }, extent: { w: 10, h: 10 },
    ground_m: 4, body: "The slope down to the inlet." };
  const w = { ...world, marks: [...world.marks, SPARK, LANDFORM] };
  const atSpark = { x: 120, y: -40, name: "adam" }, atSlope = { x: 200, y: 40, name: "adam" };

  const spark = enterExitPlan(ASHORE, SPARK.id, w, { handle: "adam" });
  assert.equal(spark.error, undefined, `entering a spark is allowed, as on main: ${spark.error}`);
  assert.equal(spark.chain.at(-1), SPARK.id);
  assert.ok(shelterOf(w, [SPARK.id], atSpark), "an entered spark shelters, as on main");
  assert.ok(sightFrameOf(w, [SPARK.id], atSpark), "and frames sight, as on main");

  const slope = enterExitPlan(ASHORE, LANDFORM.id, w, { handle: "adam" });
  assert.equal(slope.refused, "landform", "a landform is no place to go in");
  assert.equal(shelterOf(w, [LANDFORM.id], atSlope), null, "naming a landform shelters nothing");
  assert.equal(sightFrameOf(w, [LANDFORM.id], atSlope), null, "and frames no sight");

  // CONTROL: an ordinary sited mark is entered as ever
  assert.equal(enterExitPlan(ASHORE, HOLD.id, w, { handle: "adam" }).error, undefined);
});

// ── WLD-212: a thing has no inside (the-town/the-not-ground) ────────────────
//
// INVENTED fixture, no live enter call. The bag is named for the real one the report was about
// (little-bird/a-paper-bag-of-crumbs) but is a planted record here: a thing, placed on the quay, with no door.

const CLASS = (name, ext) => ({ id: `the-town/${name}`, kind: "class", by: "the-town", tier: "constitution", class: name, ...(ext ? { extends: ext } : {}), body: `the ${name} class` });
const BAG = { id: "little-bird/a-paper-bag-of-crumbs", kind: "thing", by: "little-bird", tier: "market", at: { x: 100, y: -10 }, extent: { w: 0.5, h: 0.5 }, body: "A paper bag of crumbs." };
const BOWL = { id: "little-bird/a-candy-bowl", kind: "halloween-candy-bowl", by: "little-bird", tier: "market", at: { x: 110, y: -10 }, extent: { w: 0.5, h: 0.5 }, body: "A subclass thing." };
// NARROWED 2026-11-25 (WLD-253, CORE-129 layer 1): a thing may not carry a door. into is a door's alone, and thing's entry is the locked
// none (the-town/thing-entry), so a thing that writes one is refused by name; a bag of holding is a town subclass for layer 2. The same way
// in, written on a door of the town's, passes.
const SATCHEL = { id: "little-bird/a-bag-of-holding", kind: "thing", by: "the-town", tier: "market", at: { x: 120, y: -10 }, extent: { w: 0.5, h: 0.5 }, body: "A thing that carries a door.",
  entry: { word: "welcomed", into: [HOLD.id] } };
const SATCHEL_DOOR = { id: "the-town/a-door-of-holding", kind: "door", by: "the-town", tier: "market", at: { x: 120, y: -10 }, extent: { w: 0.5, h: 0.5 }, body: "A door.",
  entry: { word: "welcomed" }, into: [HOLD.id] };
// thing redeclares entry as the locked none (the override rule's first use): the WLD-212 refusal reads it off the class
const THING_ENTRY = { id: "the-town/thing-entry", kind: "property", by: "the-town", tier: "constitution", name: "entry", default: "none", parent: "the-town/thing" };
const thingWorld = {
  ...world,
  marks: [...world.marks, CLASS("postmark-node"), CLASS("mark", "postmark-node"), CLASS("sited", "mark"), CLASS("thing", "sited"), CLASS("halloween-candy-bowl", "thing"), THING_ENTRY, BAG, BOWL, SATCHEL, SATCHEL_DOOR],
};
const BESIDE = { x: 100, y: -10, name: "adam" };

test("WLD-212 · a thing with no door is refused by name before any row: the bag", () => {
  const a = enter(BESIDE, BAG.id, thingWorld, { handle: "adam", at: 20, accepted: true });
  assert.equal(a.refused, "thing");
  assert.equal(a.target, BAG.id);
  assert.match(a.error, /little-bird\/a-paper-bag-of-crumbs/, "it names the target");
  assert.match(a.error, /a thing has no inside/);
  assert.equal(a.rows, undefined, "no row generated");
  assert.equal(a.entered, undefined, "nothing entered");
});

test("WLD-212 · the same refusal for a thing SUBCLASS (read through the class chain, not a spelling of `kind`)", () => {
  const a = enter(BESIDE, BOWL.id, thingWorld, { handle: "adam", at: 20, accepted: true });
  assert.equal(a.refused, "thing");
  assert.match(a.error, /a thing has no inside/);
  assert.equal(a.rows, undefined);
  // CONTROL: with no class nodes in hand the subclass cannot be known to be a thing, so this guard is the chain's, not a string's
  const bare = { ...world, marks: [...world.marks, BOWL] };
  assert.notEqual(enter(BESIDE, BOWL.id, bare, { handle: "adam", at: 20, accepted: true }).refused, "thing");
});

test("WLD-212 · controls: ground still enters; a thing that carries a door is refused by name (WLD-253), and the same way in on a door passes", () => {
  const ground = enter(ASHORE, SHIP.id, thingWorld, { handle: "adam", at: 20, accepted: true });
  assert.notEqual(ground.refused, "thing");
  assert.ok(ground.rows.length > 0 && ground.entered.includes(SHIP.id), "ground entry writes its rows as before");
  const carried = enter(BESIDE, SATCHEL.id, thingWorld, { handle: "adam", at: 20, accepted: true });
  assert.equal(carried.refused, "door-law");
  assert.match(carried.error, /^little-bird\/a-bag-of-holding writes entry\.into, and it is a thing, not a door — /);
  assert.equal(carried.rows, undefined, "nothing recorded");
  const door = enter(BESIDE, SATCHEL_DOOR.id, thingWorld, { handle: "adam", at: 20, accepted: true });
  assert.ok(!door.error, `no refusal: ${door.error}`);
  assert.ok(door.rows.length > 0, "and it writes its rows");
  const hidden = enter(BESIDE, "no/such-thing", thingWorld, { handle: "adam", at: 20, accepted: true });
  assert.equal(hidden.error, "no mark 'no/such-thing' to enter", "an unknown target keeps its answer");
});
