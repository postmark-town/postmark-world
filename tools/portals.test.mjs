// portals.test.mjs — WLD-5: portals (`into`, `lands_at`) and the dungeon class.
//
// The world here is the ruled instance in miniature (Darko 2026-10-13 21:29, on
// WLD-21): the Starforge Spire Grounds are OPEN, and the Spire inside them is
// the dungeon. Entering the Spire passes the Gilded Doors' outside face into the
// vestibule; the doors' inside face is the exit and lands at the Approach, in the
// open Grounds just outside the Spire's west wall. Each test names a fact that
// is true only if the ruling shipped, and the heist's broken landing (WLD-18) is
// the fixture the lint and the passage are both held to.
//
// Exit inside a dungeon follows Darko's 21:13 change (superseding 19:54): it IS
// offered, with a confirmation, and it leaves the WHOLE dungeon, setting you
// down outside at the portal you entered by.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, cpSync, rmSync } from "node:fs";
import { copyLiveLaw } from "./law-fixture.mjs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { entryLawOf, termsAt, occupancyAt, parseEnterExitLedger } from "./enter-exit.mjs";
import {
  insetInto, landingOf, hiddenFrom, scopeWorld, portalFindings, applyPortalExceptions, portalsIn, portalsInto,
  dungeonsOf, heldDungeon, standpointSight, walkFence, dungeonLanding, pointInMark, LANDING_REACH_M,
} from "./portals.mjs";
import { enter, exit, enterPrompt, exitPrompt, containmentChain, investigate } from "./world-verbs.mjs";

const HEIST = "spire/the-gilded-doo-YOULL-NEVER-CATCH-ME";
const SPIRE = "spire/the-spire";

function world({ heist = false } = {}) {
  const marks = [
    { id: "spire/grounds", kind: "sited", by: "spire",
      at: { x: 1000, y: 1000 }, extent: { w: 500, h: 400 }, body: "The Starforge Spire Grounds, open to all." },
    { id: SPIRE, kind: "sited", by: "spire", class: "dungeon",
      at: { x: 1000, y: 1000 }, extent: { w: 300, h: 300 }, body: "The Starforge Spire." },
    { id: "spire/vestibule", kind: "sited", by: "spire", at: { x: 880, y: 1000 }, extent: { w: 50, h: 50 }, body: "The vestibule." },
    { id: "spire/hall", kind: "sited", by: "spire", at: { x: 1030, y: 1000 }, extent: { w: 200, h: 200 }, body: "The great hall." },
    { id: "spire/chapel", kind: "sited", by: "spire", at: { x: 1090, y: 1125 }, extent: { w: 30, h: 30 }, body: "The chapel." },
    { id: "spire/candle", kind: "sited", by: "spire", at: { x: 1030, y: 1010 }, extent: { w: 1, h: 1 }, body: "A candle in the hall." },
    { id: "spire/the-approach", kind: "sited", by: "spire", at: { x: 820, y: 1000 }, extent: { w: 30, h: 30 }, body: "The approach." },
    { id: "spire/doors-outside", kind: "sited", by: "spire", at: { x: 845, y: 1000 }, extent: { w: 4, h: 2 },
      body: "The Gilded Doors.",
      entry: { word: "neutral", into: "spire/vestibule", lands_at: heist ? HEIST : "spire/doors-inside" } },
    { id: "spire/doors-inside", kind: "sited", by: "spire", at: { x: 860, y: 1000 }, extent: { w: 4, h: 2 },
      body: "The Gilded Doors, from inside.", entry: { word: "neutral", into: "spire/the-approach" } },
    { id: "spire/hall-door", kind: "sited", by: "spire", at: { x: 900, y: 1000 }, extent: { w: 2, h: 2 },
      body: "A door to the hall.", entry: { word: "neutral", into: "spire/hall", lands_at: "spire/hall-back" } },
    { id: "spire/hall-back", kind: "sited", by: "spire", at: { x: 935, y: 1000 }, extent: { w: 2, h: 2 },
      body: "The hall's door back.", entry: { word: "neutral", into: "spire/vestibule", lands_at: "spire/hall-door" } },
    { id: "spire/chapel-arch", kind: "sited", by: "spire", at: { x: 1090, y: 1095 }, extent: { w: 2, h: 2 },
      body: "An arch to the chapel.", entry: { word: "neutral", into: ["spire/chapel", "spire/vestibule"] } },
    { id: "spire/chapel-back", kind: "sited", by: "spire", at: { x: 1090, y: 1115 }, extent: { w: 2, h: 2 },
      body: "Back to the hall.", entry: { word: "neutral", into: "spire/hall", lands_at: "spire/chapel-arch" } },
    { id: "town/green", kind: "sited", by: "town", at: { x: 0, y: 0 }, extent: { w: 100, h: 100 }, body: "A green, far off." },
  ];
  return { marks };
}
const occ = (stack) => new Map(stack ? [["ann", stack]] : []);
const AT = (x, y) => ({ x, y, name: "ann" });
const byIdOf = (w) => new Map(w.marks.map((m) => [m.id, m]));

// ── the law's keys ───────────────────────────────────────────────────────────

test("the portal keys ride the entry law exactly as written, capitals and all", () => {
  const law = entryLawOf({ id: "x", entry: { word: "neutral", into: "a/b", lands_at: HEIST } });
  assert.deepEqual(law.into, ["a/b"]);
  assert.equal(law.lands_at, HEIST, "the shouting survives: nothing trims or lowercases the field");
  assert.deepEqual(entryLawOf({ id: "x", entry: { word: "neutral", into: ["a/b", "c/d"] } }).into, ["a/b", "c/d"]);
});

test("a law without the portal keys reads byte for byte as before", () => {
  const plain = { id: "x", body: "b", entry: { word: "welcomed", edge: "aboard", consequence: "c" } };
  assert.deepEqual(entryLawOf(plain), { word: "welcomed", edge: "aboard", consequence: "c", from: "x" });
  assert.equal("into" in termsAt(plain), false);
});

// ── the landing ──────────────────────────────────────────────────────────────

// the 10-13 clamp (clampInto) is gone with row 68 (a): every landing is held a metre inside by insetInto
test("INSET: a point outside its room, or within a metre of a wall, is held a metre inside; one already in stays put", () => {
  const room = { at: { x: 0, y: 0 }, extent: { w: 10, h: 10 } };
  assert.deepEqual(insetInto({ x: 20, y: 2 }, room), { x: 4, y: 2, moved: true });
  assert.deepEqual(insetInto({ x: -3, y: -30 }, room), { x: -3, y: -4, moved: true });
  assert.deepEqual(insetInto({ x: 1, y: 1 }, room), { x: 1, y: 1, moved: false }, "a point already inside stays put");
});

test("INSET into a ring lands strictly inside it", () => {
  const ring = { at: { x: 5, y: 5 }, extent: { w: 10, h: 10 }, points: [[0, 0], [10, 0], [10, 10], [0, 10]] };
  const at = insetInto({ x: 15, y: 5 }, ring);
  assert.equal(at.moved, true);
  assert.ok(Math.abs(at.x - 9) < 1e-9 && Math.abs(at.y - 5) < 1e-9, `1 m inside the east edge, got ${at.x},${at.y}`);
});

test("THE DOOR BUG: a lands_at naming no mark is refused by quoting the field", () => {
  const w = world({ heist: true });
  const byId = byIdOf(w);
  const l = landingOf(entryLawOf(byId.get("spire/doors-outside")), byId.get("spire/vestibule"), byId);
  assert.equal(l.ok, false);
  assert.equal(l.field, "lands_at");
  assert.ok(l.because.includes(`"${HEIST}"`), l.because);
});

// ── the passage ──────────────────────────────────────────────────────────────

test("into the Spire: one portal enters the dungeon and the vestibule (never the open Grounds above it), and lands a step in from the inside face", () => {
  const a = enter(AT(845, 1000), "spire/doors-outside", world(), { occupancy: occ([]), handle: "ann", at: 300 });
  assert.equal(a.error, undefined);
  assert.deepEqual(a.entered, [SPIRE, "spire/vestibule"]);
  assert.equal(a.rows.length, 2);
  assert.match(a.rows[0], / · ann · enters spire\/the-spire · ferry 300\.0000 · word neutral$/);
  // row 68 (a): a step in from the door, never on its square: the 4×2 inside face at x 860 is 5 m in from the
  // vestibule west wall, so its far edge is 862 and a 1.5 m step past it is 863.5
  assert.deepEqual(a.landing, { x: 863.5, y: 1000, mark: "spire/doors-inside", clamped: false });
  assert.deepEqual(a.portals.map((p) => p.id), ["spire/doors-inside", "spire/hall-door"]);
  const acts = parseEnterExitLedger(a.rows.join("\n")).acts;
  assert.deepEqual(occupancyAt(acts).get("ann"), [SPIRE, "spire/vestibule"], "the rows derive the stack the answer claims");
});

test("room to room: the room left is exited, the room behind the portal entered", () => {
  const a = enter(AT(900, 1000), "spire/hall-door", world(), { occupancy: occ([SPIRE, "spire/vestibule"]), handle: "ann", at: 301 });
  assert.deepEqual(a.exited, ["spire/vestibule"]);
  assert.deepEqual(a.entered, ["spire/hall"]);
  assert.deepEqual(a.within, [SPIRE, "spire/hall"]);
  assert.match(a.rows[0], /exits spire\/vestibule/);
  assert.match(a.rows[1], /enters spire\/hall/);
  assert.equal(a.landing.mark, "spire/hall-back");
});

test("THE WAY OUT: the inside face exits the dungeon and lands in the open Grounds outside it", () => {
  const w = world();
  const a = enter(AT(860, 1000), "spire/doors-inside", w, { occupancy: occ([SPIRE, "spire/vestibule"]), handle: "ann", at: 302 });
  assert.deepEqual(a.exited, [SPIRE, "spire/vestibule"], "leaving the dungeon leaves every room in it");
  assert.deepEqual(a.entered, ["spire/the-approach"]);
  assert.deepEqual([a.landing.x, a.landing.y], [820, 1000]);
  const byId = byIdOf(w);
  assert.ok(!pointInMark(a.landing, byId.get(SPIRE)) && pointInMark(a.landing, byId.get("spire/grounds")), "outside the Spire, inside the open Grounds");
});

test("the door bug at the portal: refused, the field quoted, standing at it, nothing recorded", () => {
  const a = enter(AT(845, 1000), "spire/doors-outside", world({ heist: true }), { occupancy: occ([]), handle: "ann" });
  assert.deepEqual(a.rows, []);
  assert.deepEqual(a.entered, []);
  assert.equal(a.stranded, "spire/doors-outside");
  assert.equal(a.broken.field, "lands_at");
  assert.equal(a.broken.value, HEIST);
  assert.match(a.broken.because, /names no mark, so this portal leads nowhere\. You are standing at spire\/doors-outside, and nothing was recorded\.$/);
});

test("a list of ways is picked from, and nothing is recorded until the walker picks", () => {
  const w = world();
  const held = occ([SPIRE, "spire/hall"]);
  const asked = enter(AT(1090, 1095), "spire/chapel-arch", w, { occupancy: held, handle: "ann" });
  assert.deepEqual(asked.rows, []);
  assert.deepEqual(asked.choose.map((c) => c.id), ["spire/chapel", "spire/vestibule"]);
  const picked = enter(AT(1090, 1095), "spire/chapel-arch", w, { occupancy: held, handle: "ann", into: "spire/chapel" });
  assert.deepEqual(picked.entered, ["spire/chapel"]);
  assert.deepEqual([picked.landing.x, picked.landing.y], [1090, 1125], "no lands_at: into's own anchor");
  const wrong = enter(AT(1090, 1095), "spire/chapel-arch", w, { occupancy: held, handle: "ann", into: "town/green" });
  assert.match(wrong.error, /is not one of spire\/chapel-arch's ways/);
});

test("only the portal's own word is asked: opposed refuses and is recorded; terms wait", () => {
  const w = world();
  const doors = w.marks.find((m) => m.id === "spire/doors-outside");
  doors.entry = { ...doors.entry, word: "opposed" };
  const r = enter(AT(845, 1000), "spire/doors-outside", w, { occupancy: occ([]), handle: "ann" });
  assert.equal(r.refused.effect, "refused");
  assert.match(r.rows[0], /enters spire\/doors-outside · ferry 0\.0000 · word opposed$/);
  doors.entry = { word: "neutral", edge: "within", consequence: "mind the step", into: "spire/vestibule" };
  const t = enter(AT(845, 1000), "spire/doors-outside", w, { occupancy: occ([]), handle: "ann" });
  assert.equal(t.awaiting.effect, "terms");
  assert.deepEqual(t.rows, []);
});

// ── the dungeon's rules ──────────────────────────────────────────────────────

test("a dungeon that names no into of its own is entered by its portals (WLD-63: one that does is passed through it, dungeon-into.test.mjs)", () => {
  const a = enter(AT(1000, 1000), SPIRE, world(), { occupancy: occ([]), handle: "ann" });
  assert.equal(a.refused, "dungeon");
  assert.deepEqual(a.portals.map((p) => p.id), ["spire/doors-outside"]);
  assert.deepEqual(portalsInto(SPIRE, world().marks).map((p) => p.id), ["spire/doors-outside"]);
});

test("a mark the dungeon hides is no mark at all to whoever has not entered", () => {
  const a = enter(AT(1090, 1125), "spire/chapel", world(), { occupancy: occ([]), handle: "ann" });
  assert.equal(a.error, "no mark 'spire/chapel' to enter");
});

test("inside a dungeon, the only enter is a portal", () => {
  const w = world();
  const held = occ([SPIRE, "spire/vestibule"]);
  // the hall is a neighbour, so from the vestibule it is hidden: no mark at all
  assert.equal(enter(AT(1030, 1000), "spire/hall", w, { occupancy: held, handle: "ann" }).error, "no mark 'spire/hall' to enter");
  // and a mark he CAN see, inside the room he is in, is still entered by no plain threshold
  const e = enter(AT(1030, 1010), "spire/candle", w, { occupancy: occ([SPIRE, "spire/hall"]), handle: "ann" });
  assert.equal(e.refused, "dungeon");
  assert.match(e.error, /the only way to enter anything is a portal\. The portals where you stand: spire\/chapel-arch, spire\/hall-back$/);
  assert.equal(enterPrompt(AT(1030, 1000), w, { occupancy: held, handle: "ann" }), null);
  assert.equal(heldDungeon([SPIRE, "spire/vestibule"], w.marks), SPIRE);
});

// THE EXIT, AS DARKO CHANGED IT AT 21:13. Until then this block asserted the
// refusal ("a dungeon offers no exit"); it now asserts the confirm step and the
// whole-dungeon exit, flipped rather than deleted, so the old promise is
// visibly the thing that changed.
test("EXIT IS OFFERED, WITH A CONFIRMATION: the first call writes nothing and says it leaves the whole dungeon, and where you will stand", () => {
  const w = world();
  const x = exit("spire/vestibule", w, { occupancy: occ([SPIRE, "spire/vestibule"]), handle: "ann", enteredVia: "spire/doors-outside" });
  assert.equal(x.error, undefined);
  assert.deepEqual(x.rows, []);
  assert.equal(x.awaiting.effect, "confirm");
  assert.equal(x.dungeon, SPIRE);
  assert.deepEqual(x.left, [SPIRE, "spire/vestibule"]);
  assert.deepEqual(x.landing, { x: 845, y: 1000, via: "spire/doors-outside", chosen: false });
  // WLD-5 A (Darko 2026-10-19 09:21): the accept step is his sentence, which the
  // World page prints; the instruction to confirm moved to `how`, for agents.
  // Until then `because` read "exiting spire/vestibule leaves the whole of
  // spire/the-spire, a dungeon, and sets you down outside, at spire/doors-outside
  // (845, 1000). Call again with confirm: true to go; nothing was recorded."
  assert.equal(x.awaiting.because, "Leave the Spire from here? You can't come back in until the next settlement."
    + " Walking out through a door doesn't count. You'll be set down outside, at Doors Outside.");
  assert.equal(x.awaiting.how, "exiting spire/vestibule leaves the whole of spire/the-spire. Call again with confirm: true to go; nothing was recorded.");
});

test("CONFIRMED, EXIT LEAVES THE WHOLE DUNGEON from any room in it, and sets you down at the portal you entered by", () => {
  const w = world();
  const x = exit("spire/hall", w, { occupancy: occ([SPIRE, "spire/hall"]), handle: "ann", at: 303, confirm: true, enteredVia: "spire/doors-outside" });
  assert.equal(x.rows.length, 1);
  assert.match(x.rows[0], / · ann · exits spire\/the-spire · ferry 303\.0000$/, "one row, on the dungeon: everything inside it truncates");
  assert.deepEqual(x.within, []);
  assert.deepEqual(x.left, [SPIRE, "spire/hall"]);
  assert.deepEqual([x.landing.x, x.landing.y], [845, 1000]);
  assert.ok(!pointInMark(x.landing, byIdOf(w).get(SPIRE)), "set down outside the dungeon");
  const acts = parseEnterExitLedger([
    `- 2026-10-13T20:00:00.000Z · ann · enters ${SPIRE} · ferry 300.0000 · word neutral`,
    `- 2026-10-13T20:00:00.000Z · ann · enters spire/hall · ferry 301.0000 · word neutral`, ...x.rows].join("\n")).acts;
  assert.equal(occupancyAt(acts).get("ann"), undefined, "the ledger agrees: within nothing");
});

test("exiting a mark that holds the dungeon leaves it too, and no entry on record means the nearest way in", () => {
  const w = world();
  const x = exit("spire/grounds", w, { occupancy: occ(["spire/grounds", SPIRE, "spire/vestibule"]), handle: "ann", confirm: true, state: AT(880, 1000) });
  assert.match(x.rows[0], /exits spire\/grounds/, "the outermost of the two is the one exited");
  assert.deepEqual(x.within, []);
  assert.deepEqual(x.landing, { x: 845, y: 1000, via: "spire/doors-outside", chosen: true });
  assert.deepEqual(dungeonLanding(SPIRE, w.marks, { enteredVia: "spire/hall-door" }).via, "spire/doors-outside",
    "a `via` that is not a way into the dungeon is never where anyone is set down");
});

test("outside a dungeon, exit is what it always was: no confirmation, one row", () => {
  const x = exit("spire/the-approach", world(), { occupancy: occ(["spire/the-approach"]), handle: "ann" });
  assert.equal(x.awaiting, undefined);
  assert.equal(x.rows.length, 1);
  assert.equal(x.landing, undefined);
});

test("the exit prompt is offered inside a dungeon too: exit is no longer withheld there", () => {
  const p = exitPrompt(AT(600, 600), world(), { occupancy: occ([SPIRE, "spire/vestibule"]), handle: "ann" });
  assert.equal(p.mark, "spire/vestibule");
});

test("standing on a room's ground from outside offers only the open Grounds, and reveals nothing inside the Spire", () => {
  const w = world();
  assert.equal(enterPrompt(AT(1090, 1125), w, { occupancy: occ([]), handle: "ann" }).mark, "spire/grounds",
    "the Spire has no portal law of its own and the chapel is hidden; the open Grounds are an ordinary mark");
  const seen = scopeWorld(w, { held: [] });
  assert.deepEqual(containmentChain(AT(1090, 1125), seen.marks).map((c) => c.id), ["spire/grounds", SPIRE]);
  assert.match(investigate("spire/chapel", seen).error, /no mark or terrain feature/);
});

test("OPAQUE FROM OUTSIDE: the dungeon reads as its own mark, nothing inside at any depth; the open Grounds hide nothing", () => {
  const hidden = hiddenFrom(world().marks, []);
  for (const id of ["spire/vestibule", "spire/hall", "spire/chapel", "spire/candle", "spire/doors-inside", "spire/hall-door", "spire/chapel-arch"])
    assert.ok(hidden.has(id), `${id} is hidden`);
  for (const id of ["spire/grounds", SPIRE, "spire/doors-outside", "spire/the-approach", "town/green"])
    assert.ok(!hidden.has(id), `${id} is seen`);
});

test("INSIDE: you read the room you entered and what it holds, not its neighbours", () => {
  const hidden = hiddenFrom(world().marks, [SPIRE, "spire/hall"]);
  for (const id of ["spire/candle", "spire/chapel-arch", "spire/hall-back"]) assert.ok(!hidden.has(id), `${id} is in the hall`);
  for (const id of ["spire/vestibule", "spire/chapel", "spire/hall-door"]) assert.ok(hidden.has(id), `${id} is a neighbour`);
});

test("a world without a dungeon is read exactly as before: the same object back", () => {
  const w = { marks: world().marks.filter((m) => m.class !== "dungeon") };
  assert.equal(scopeWorld(w, { held: [] }), w);
  assert.deepEqual(dungeonsOf(w.marks[0], w.marks), []);
});

test("a caller may keep marks a dungeon would hide (a household's own)", () => {
  const seen = scopeWorld(world(), { held: [], keep: (m) => m.by === "spire" });
  assert.ok(seen.marks.some((m) => m.id === "spire/chapel"));
});

// ── the lint ─────────────────────────────────────────────────────────────────

test("the ruled instance is clean", () => {
  assert.deepEqual(portalFindings(world().marks), []);
});

test("the heist reds the lint by name, and a named exception lets exactly it through", () => {
  const found = portalFindings(world({ heist: true }).marks);
  assert.deepEqual(found.map((f) => [f.mark, f.rule, f.sev]), [["spire/doors-outside", "lands-at-names-a-mark", "ERROR"]]);
  const exc = [{ mark: "spire/doors-outside", rule: "lands-at-names-a-mark", by: "jetto", why: "the heist" },
               { mark: "spire/hall-door", rule: "exit-never-opposed", by: "nobody", why: "stale" }];
  const { findings, stale } = applyPortalExceptions(found, exc);
  assert.deepEqual(findings[0].excepted, { by: "jetto", why: "the heist" });
  assert.deepEqual(stale.map((e) => e.mark), ["spire/hall-door"]);
});

test("a landing more than the reach from its into is red", () => {
  const w = world();
  w.marks.find((m) => m.id === "spire/hall-door").entry.lands_at = { x: 935 + LANDING_REACH_M + 200, y: 1000 };
  assert.deepEqual(portalFindings(w.marks).map((f) => f.rule), ["lands-at-reaches-into"]);
});

test("an exit is never opposed (an error); with the only exit locked, no room has a way out (now an advisory, 21:13)", () => {
  const w = world();
  w.marks.find((m) => m.id === "spire/doors-inside").entry.word = "opposed";
  const rules = portalFindings(w.marks).map((f) => `${f.sev} ${f.rule} ${f.mark}`).sort();
  assert.deepEqual(rules, [
    "ERROR exit-never-opposed spire/doors-inside",
    "WARN path-to-an-exit spire/chapel", "WARN path-to-an-exit spire/hall", "WARN path-to-an-exit spire/vestibule",
  ]);
});

test("a room whose only portal out is locked has no path out, though the rest do (an advisory)", () => {
  const w = world();
  w.marks.find((m) => m.id === "spire/chapel-back").entry.word = "opposed";
  assert.deepEqual(portalFindings(w.marks).map((f) => `${f.sev} ${f.rule} ${f.mark}`), ["WARN path-to-an-exit spire/chapel"]);
});

test("G9 · siblings never overlap: two marks with one parent inside a dungeon", () => {
  const w = world();
  w.marks.push({ id: "spire/pantry", kind: "sited", by: "spire", at: { x: 1135, y: 950 }, extent: { w: 30, h: 30 }, body: "A pantry, half in the hall." });
  assert.deepEqual(portalFindings(w.marks).map((f) => `${f.sev} ${f.rule} ${f.mark}`), ["ERROR rooms-do-not-overlap spire/hall"]);
  assert.match(portalFindings(w.marks)[0].msg, /spire\/hall overlaps spire\/pantry, and both stand directly in spire\/the-spire inside spire\/the-spire/);
});

test("G9 · a room's contents are its children, never its overlapping siblings; the open Grounds are not held to it", () => {
  // the candle stands inside the hall: same dungeon, different parent
  const w = world();
  // and two overlapping courtyards in the OPEN Grounds are nobody's business here
  w.marks.push({ id: "spire/k1", kind: "sited", by: "spire", at: { x: 790, y: 850 }, extent: { w: 40, h: 40 }, body: "K1" },
               { id: "spire/k2", kind: "sited", by: "spire", at: { x: 800, y: 860 }, extent: { w: 40, h: 40 }, body: "K2" });
  assert.deepEqual(portalFindings(w.marks), []);
});

test("G9 · two rooms drawn as rings that share a wall do not overlap; pushed into each other, they do", () => {
  const ring = (id, x0) => ({ id, kind: "sited", by: "spire", at: { x: x0 + 10, y: 862 }, extent: { w: 20, h: 20 },
    points: [[x0, 852], [x0 + 20, 852], [x0 + 20, 872], [x0, 872]], body: id });
  const w = world();
  w.marks.push(ring("spire/east-cell", 940), ring("spire/west-cell", 960));
  assert.deepEqual(portalFindings(w.marks), [], "a shared wall is not shared ground");
  w.marks[w.marks.length - 1] = ring("spire/west-cell", 957);
  assert.deepEqual(portalFindings(w.marks).map((f) => f.rule), ["rooms-do-not-overlap"]);
});

test("G9 · two triangles splitting one square share only their diagonal, and that is no overlap", () => {
  // the boxes coincide, so only the ring test can answer, and the metre grid
  // lands squarely on the shared diagonal
  const tri = (id, pts) => ({ id, kind: "sited", by: "spire", at: { x: 1010, y: 862 }, extent: { w: 20, h: 20 }, points: pts, body: id });
  const w = world();
  w.marks.push(tri("spire/north-half", [[1000, 852], [1020, 852], [1000, 872]]),
               tri("spire/south-half", [[1020, 852], [1020, 872], [1000, 872]]));
  assert.deepEqual(portalFindings(w.marks), []);
});

test("standpointSight: the one function, keyed off the enter ledger; no handle has entered nothing", () => {
  const w = world();
  const occupancy = new Map([["ann", [SPIRE, "spire/hall"]]]);
  const ann = standpointSight(w, { occupancy, handle: "ann" });
  assert.ok(ann.marks.some((m) => m.id === "spire/candle"));
  assert.ok(!ann.marks.some((m) => m.id === "spire/chapel"));
  const nobody = standpointSight(w, { occupancy, handle: null });
  assert.ok(!nobody.marks.some((m) => m.id === "spire/candle"), "the spectator reads the dungeon alone");
  assert.equal(standpointSight({ marks: [] }, { occupancy }).marks.length, 0);
});

test("G4 · the walk inside a dungeon is fenced to the room entered; outside one, the open Grounds included, there is no fence", () => {
  const w = world();
  assert.equal(walkFence([SPIRE, "spire/hall"], w.marks).id, "spire/hall");
  assert.equal(walkFence([SPIRE, "spire/vestibule"], w.marks).id, "spire/vestibule");
  assert.equal(walkFence([SPIRE], w.marks).id, SPIRE, "in the dungeon but no room: the dungeon itself");
  assert.equal(walkFence(["spire/grounds"], w.marks), null);
  assert.equal(walkFence(["spire/the-approach"], w.marks), null);
  assert.equal(walkFence([], w.marks), null);
});

test("an into naming no mark is red", () => {
  const w = world();
  w.marks.find((m) => m.id === "spire/hall-back").entry.into = "spire/nowhere";
  assert.ok(portalFindings(w.marks).some((f) => f.rule === "into-names-a-mark" && f.mark === "spire/hall-back"));
});

// ── the gate itself, as the settlement runs it ───────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const LINT = join(HERE, "mark-lint.mjs");
const REAL = join(HERE, "..", "WORLD", "marks", "let-there-be-light");
const SCRATCH = [];
after(() => { for (const d of SCRATCH) rmSync(d, { recursive: true, force: true }); });

function gateTree({ heist, mutate = null }) {
  const dir = mkdtempSync(join(tmpdir(), "portal-lint-")); SCRATCH.push(dir);
  const root = join(dir, "let-there-be-light");
  mkdirSync(root, { recursive: true });
  copyFileSync(join(REAL, "mark.md"), join(root, "mark.md"));
  cpSync(join(REAL, "logos"), join(root, "logos"), { recursive: true });
  // the dungeon class must be in the roster, so the law's chain to it comes too: the classes are law nodes (WLD-116)
  for (const rel of ["the-town-centre", "the-town-centre/the-keeping-works"]) {
    mkdirSync(join(root, rel), { recursive: true });
    copyFileSync(join(REAL, rel, "mark.md"), join(root, rel, "mark.md"));
  }
  copyLiveLaw(dir, ["postmark-node", "postmark-node/mark", "postmark-node/mark/sited", "postmark-node/mark/dungeon"]);
  const w = world({ heist });
  if (mutate) mutate(w);
  for (const m of w.marks) {
    if (m.by !== "spire") continue;
    const d = join(root, m.id.split("/")[1]);
    mkdirSync(d, { recursive: true });
    const lines = ["---", "kind: sited", "by: testerhh", "date: 2026-10-13",
      `at: { x: ${m.at.x}, y: ${m.at.y} }`, `extent: { w: ${m.extent.w}, h: ${m.extent.h} }`];
    if (m.class) lines.push(`class: ${m.class}`);
    // a fixture mark's id is <by>/<dir>, so the ids the laws name move with `by`
    const rid = (s) => s.replace(/^spire\//, "testerhh/");
    if (m.entry) lines.push(`entry: ${JSON.stringify({
      ...m.entry,
      into: Array.isArray(m.entry.into) ? m.entry.into.map(rid) : rid(m.entry.into),
      ...(typeof m.entry.lands_at === "string" ? { lands_at: rid(m.entry.lands_at) } : {}),
    })}`);
    lines.push("---", "", m.body, "");
    writeFileSync(join(d, "mark.md"), lines.join("\n"));
  }
  return dir;
}
function gate(dir, extra = []) {
  try { return { code: 0, out: execFileSync("node", [LINT, "--marks-dir", dir, ...extra], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout ?? "") + String(e.stderr ?? "") }; }
}

test("THE GATE: the ruled instance lints clean, the heist refuses, and its named exception lets it through, said aloud", () => {
  const clean = gate(gateTree({ heist: false }));
  assert.equal(clean.code, 0, clean.out);

  const dir = gateTree({ heist: true });
  const red = gate(dir);
  assert.equal(red.code, 1, red.out);
  assert.match(red.out, /\[ERROR\] [^\n]*doors-outside: \[lands-at-names-a-mark\] entry\.lands_at: "testerhh\/the-gilded-doo-YOULL-NEVER-CATCH-ME" names no mark/);

  const exc = join(dir, "exceptions.json");
  writeFileSync(exc, JSON.stringify({ exceptions: [{ mark: "testerhh/doors-outside", rule: "lands-at-names-a-mark", by: "jetto", why: "the heist (WLD-18)" }] }));
  const let_through = gate(dir, ["--portal-exceptions", exc]);
  assert.equal(let_through.code, 0, let_through.out);
  assert.match(let_through.out, /\[WARN\] [^\n]*doors-outside: \[lands-at-names-a-mark\] EXCEPTED by WORLD\/portal-lint-exceptions\.json \(jetto: the heist \(WLD-18\)\)/);
});

test("THE GATE: a room with no path out is an ADVISORY now (21:13): the lint says so and the crossing is not refused", () => {
  const dir = gateTree({ heist: false, mutate: (w) => { w.marks.find((m) => m.id === "spire/chapel-back").entry.word = "opposed"; } });
  const r = gate(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\[WARN\] [^\n]*chapel: \[path-to-an-exit\] no path of unlocked portals leads from testerhh\/chapel/);
});
