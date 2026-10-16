// stairs.test.mjs — WLD-21: the stairs class (Darko, 2026-10-15 13:31).
//
// A generic class for interiors with more than one floor. A stair that writes no
// entry law is a portal by its class: into itself, opposed, and its refusal is the
// class's line, word for word. A stair that writes its own entry law is an
// ordinary portal. The fixture is a two-floor house that is a dungeon, so the
// portal-only rule inside a dungeon is what a stair has to pass.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, cpSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { entryLawOf, isPortal, adjudicate, termsAt, occupancyAt, parseEnterExitLedger, STAIRS_CLASS, STAIRS_LINE } from "./enter-exit.mjs";
import { portalsIn, portalFindings } from "./portals.mjs";
import { enter } from "./world-verbs.mjs";
import { enterSheetHTML } from "../spectator/viewer.mjs";

const LINE = "Moving to higher/lower floors has not been implemented yet. Coming Soon!";

function world({ upstairs = null } = {}) {
  const marks = [
    { id: "home/house", kind: "sited", by: "home", class: "dungeon",
      at: { x: 500, y: 500 }, extent: { w: 100, h: 100 }, body: "A tall house." },
    { id: "home/hall", kind: "sited", by: "home", at: { x: 480, y: 500 }, extent: { w: 40, h: 40 }, body: "The hall." },
    { id: "home/landing", kind: "sited", by: "home", at: { x: 530, y: 500 }, extent: { w: 20, h: 20 }, body: "A landing." },
    { id: "home/front-door", kind: "sited", by: "home", at: { x: 445, y: 500 }, extent: { w: 2, h: 2 },
      body: "The front door.", entry: { word: "neutral", into: "home/hall" } },
    { id: "home/front-door-inside", kind: "sited", by: "home", at: { x: 462, y: 500 }, extent: { w: 2, h: 2 },
      body: "The way out.", entry: { word: "neutral", into: "home/porch" } },
    { id: "home/porch", kind: "sited", by: "home", at: { x: 420, y: 500 }, extent: { w: 20, h: 20 }, body: "The porch." },
    { id: "home/the-stair", kind: "sited", by: "home", class: STAIRS_CLASS,
      at: { x: 490, y: 490 }, extent: { w: 6, h: 10 }, body: "A stair, up.",
      ...(upstairs ? { entry: { word: "neutral", into: "home/landing" } } : {}) },
  ];
  return { marks };
}
const occ = (stack) => new Map([["ann", stack]]);
const AT = (x, y) => ({ x, y, name: "ann" });

// ── the class's law ──────────────────────────────────────────────────────────

test("the class's line is Darko's, word for word", () => {
  assert.equal(STAIRS_CLASS, "stairs");
  assert.equal(STAIRS_LINE, LINE);
});

test("a stair that writes no entry law reads the class's: into itself, opposed, the line as its consequence", () => {
  const stair = world().marks.find((m) => m.id === "home/the-stair");
  assert.deepEqual(entryLawOf(stair), { word: "opposed", edge: null, consequence: LINE, from: "home/the-stair", into: ["home/the-stair"] });
  assert.equal(isPortal(stair), true, "a stair is a portal by its class");
  assert.deepEqual(termsAt(stair).into, ["home/the-stair"]);
});

test("only an instance is a stair: no class, or the class's own declaration, reads no law", () => {
  assert.equal(entryLawOf({ id: "home/x", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 1, h: 1 } }), null);
  assert.equal(entryLawOf({ id: "the-town/stairs", kind: "class", class: STAIRS_CLASS }), null, "the declaration is law, not a door");
  assert.equal(isPortal({ id: "home/x", kind: "sited", class: "dungeon" }), false);
});

test("a stair's refusal IS the line; every other opposed mark keeps the town's standing sentence", () => {
  const stair = world().marks.find((m) => m.id === "home/the-stair");
  const v = adjudicate(stair);
  assert.equal(v.effect, "refused");
  assert.equal(v.because, LINE, "because is what every reader prints");
  assert.equal(v.terms.consequence, LINE);
  const door = adjudicate({ id: "home/shut", entry: { word: "opposed", consequence: "It will not open." } });
  assert.match(door.because, /^home\/shut opposes entry — an entity child opposed is a refusal at the threshold/);
});

test("a stair that writes its own entry law is an ordinary portal, and nothing of the default carries over", () => {
  const stair = world({ upstairs: true }).marks.find((m) => m.id === "home/the-stair");
  assert.deepEqual(entryLawOf(stair), { word: "neutral", edge: null, consequence: null, from: "home/the-stair", into: ["home/landing"] });
  assert.equal(adjudicate(stair).effect, "entered");
});

// ── the passage, inside a dungeon ────────────────────────────────────────────

test("inside a dungeon a stair is one of the room's portals, is entered as one, and answers the line, and you stay in the room", () => {
  const w = world();
  const held = occ(["home/house", "home/hall"]);
  assert.deepEqual(portalsIn("home/hall", w.marks).map((p) => p.id), ["home/front-door-inside", "home/the-stair"]);
  const a = enter(AT(490, 490), "home/the-stair", w, { occupancy: held, handle: "ann", at: 300 });
  assert.equal(a.error, undefined, a.error);
  assert.equal(a.refused?.because, LINE);
  assert.deepEqual(a.entered, []);
  // the refusal is in the record (being turned away is a fact about the town) and moves nobody
  assert.deepEqual(a.rows.map((r) => r.replace(/^- \S+ /, "")), ["· ann · enters home/the-stair · ferry 300.0000 · word opposed"]);
  const stack = occupancyAt(parseEnterExitLedger(a.rows.join("\n")).acts, Infinity, occ(["home/house", "home/hall"])).get("ann");
  assert.ok(!stack?.includes("home/the-stair"), `a refused stair is never held: ${JSON.stringify(stack)}`);
});

test("the World page's refusal sheet says the line", () => {
  const verdict = adjudicate(world().marks.find((m) => m.id === "home/the-stair"));
  assert.match(enterSheetHTML({ entered: [], refused: verdict }, "home/the-stair"),
    /refused at the door[\s\S]*Moving to higher\/lower floors has not been implemented yet\. Coming Soon!/);
});

test("once a stair writes its way up, the passage climbs it", () => {
  const w = world({ upstairs: true });
  const a = enter(AT(490, 490), "home/the-stair", w, { occupancy: occ(["home/house", "home/hall"]), handle: "ann", at: 301 });
  assert.equal(a.error, undefined, a.error);
  assert.deepEqual(a.entered, ["home/landing"]);
});

test("the portal lint holds a stair with no entry law clean", () => {
  assert.deepEqual(portalFindings(world().marks), []);
});

// ── review-223: the default is the default, and nothing wider ───────────────

test("a stair that writes its own OPPOSED entry is read by it alone: the standing sentence, never the class's line", () => {
  const STANDING = /^home\/the-stair opposes entry — an entity child opposed is a refusal at the threshold/;
  const own = (entry) => ({ ...world().marks.find((m) => m.id === "home/the-stair"), entry });
  const locked = adjudicate(own({ word: "opposed", into: "home/landing" }));
  assert.equal(locked.effect, "refused");
  assert.match(locked.because, STANDING, "a floor that exists but is locked never says 'Coming Soon!'");
  assert.match(adjudicate(own({ word: "opposed", into: "home/landing", consequence: "Rotten." })).because, STANDING,
    "its own consequence rides the terms, as any opposed mark's does");
});

test("the lint: a WELCOMED portal into itself is a place you stand in, so a room built that way with no way out still warns", () => {
  const w = world();
  w.marks.push({ id: "home/closet", kind: "sited", by: "home", at: { x: 520, y: 520 }, extent: { w: 6, h: 6 },
    body: "A closet.", entry: { word: "welcomed", into: "home/closet" } });
  const f = portalFindings(w.marks);
  assert.ok(f.some((x) => x.mark === "home/closet" && x.rule === "path-to-an-exit"), JSON.stringify(f));
  assert.ok(!f.some((x) => x.mark === "home/the-stair"), "the default stair (opposed, into itself) is still no room");
});

test("the lint: a stair is a box inside a room, not a door in a wall, so it still counts for rooms-do-not-overlap", () => {
  const w = world();
  // a 12 × 8 m stair straddling the hall's east wall, so the hall does not hold
  // it and it stands in the house beside the hall, over the hall's floor
  w.marks.push({ id: "home/wide-stair", kind: "sited", by: "home", class: STAIRS_CLASS,
    at: { x: 498, y: 500 }, extent: { w: 12, h: 8 }, body: "A wide stair." });
  const f = portalFindings(w.marks).filter((x) => x.rule === "rooms-do-not-overlap");
  assert.ok(f.length > 0, "the overlap is named");
  assert.ok(f.every((x) => x.sev === "ERROR"), JSON.stringify(f));
});

// ── the gate, as the settlement runs it: the class is lawful because the works declare it ──

const HERE = dirname(fileURLToPath(import.meta.url));
const LINT = join(HERE, "mark-lint.mjs");
const REAL = join(HERE, "..", "WORLD", "marks", "let-there-be-light");
const WORKS = ["the-town-centre", "the-town-centre/the-keeping-works", "the-town-centre/the-keeping-works/postmark-node",
  "the-town-centre/the-keeping-works/postmark-node/mark", "the-town-centre/the-keeping-works/postmark-node/mark/dungeon"];
const STAIRS_NODE = "the-town-centre/the-keeping-works/postmark-node/mark/stairs";
const SCRATCH = [];
after(() => { for (const d of SCRATCH) rmSync(d, { recursive: true, force: true }); });

function gateTree({ declared }) {
  const dir = mkdtempSync(join(tmpdir(), "stairs-lint-")); SCRATCH.push(dir);
  const root = join(dir, "let-there-be-light");
  mkdirSync(root, { recursive: true });
  copyFileSync(join(REAL, "mark.md"), join(root, "mark.md"));
  cpSync(join(REAL, "logos"), join(root, "logos"), { recursive: true });
  for (const rel of [...WORKS, ...(declared ? [STAIRS_NODE] : [])]) {
    mkdirSync(join(root, rel), { recursive: true });
    copyFileSync(join(REAL, rel, "mark.md"), join(root, rel, "mark.md"));
  }
  const rid = (s) => s.replace(/^home\//, "testerhh/");
  for (const m of world().marks) {
    const d = join(root, m.id.split("/")[1]);
    mkdirSync(d, { recursive: true });
    const lines = ["---", "kind: sited", "by: testerhh", "date: 2026-10-15",
      `at: { x: ${m.at.x}, y: ${m.at.y} }`, `extent: { w: ${m.extent.w}, h: ${m.extent.h} }`];
    if (m.class) lines.push(`class: ${m.class}`);
    if (m.entry) lines.push(`entry: ${JSON.stringify({ ...m.entry, into: rid(m.entry.into) })}`);
    lines.push("---", "", m.body, "");
    writeFileSync(join(d, "mark.md"), lines.join("\n"));
  }
  return dir;
}
function gate(dir) {
  try { return { code: 0, out: execFileSync(process.execPath, [LINT, "--marks-dir", dir], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout ?? "") + String(e.stderr ?? "") }; }
}

test("THE GATE: a house with a stair that writes no entry law lints clean once the works declare the class", () => {
  const r = gate(gateTree({ declared: true }));
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /the-stair/, "no finding of any kind names the stair");
});

test("THE GATE: without the declaration, `class: stairs` names no class the law knows", () => {
  const r = gate(gateTree({ declared: false }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /the-stair[^\n]*class: "stairs" names no class the law knows/);
});
