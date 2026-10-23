// held-unplaced.test.mjs — POS-688 (Darko, 2026-10-18 20:58): a held thing is
// PUBLISHED BUT UNPLACED. The settlement prints it with `held_by: <holder>` and
// no `at`/`extent`; a drop prints a fresh `at`. This file holds the world's half:
// the lint reads the printout, the fold carries it, the sweep lets a hand-off land
// and never unpublishes a held thing, and the harm gate reads it as no harm.
//
// ── THE CAN-FAIL FLIPS ─────────────────────────────────────────────────────
//   the lint's sited rule asked of a held thing   → 1 reds (needs at/extent)
//   the lint missing the at+held_by refusal       → 2 reds
//   the lint missing the thing-only rule          → 3 reds
//   the thing-only rule asked of an untyped sited mark → 3b reds (S123)
//   the fold dropping held_by                     → 4 reds
//   unpublishVerdict ignoring `held`              → 5 reds
//   holdOnlyChange counting the body              → 6 reds
//   positionedInside listing an unplaced child    → 7 reds

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { HELD_BY, heldBy, isHeld, holdOnlyChange, OWNED_BY, ownedBy } from "./mark-kind.mjs";
import { standingHouseholdOf } from "./mark-standing.mjs";
import { unpublishVerdict } from "./unpublish-verdict.mjs";
import { judge } from "./harm-gate.mjs";
import { positionedInside } from "./settlement-sweep.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_SRC = join(HERE, "..");
const LINT = join(HERE, "mark-lint.mjs");
const FOLD = join(HERE, "marks-fold.mjs");
const SCRATCH = [];
const scratch = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); SCRATCH.push(d); return d; };
after(() => { for (const d of SCRATCH) rmSync(d, { recursive: true, force: true }); });

const CONE = "berthillon/cone-melon-de-charente-2026-08-25";
const CONE_FILE = join("WORLD", "marks", "berthillon", "cone-melon-de-charente-2026-08-25", "mark.md");

/** The real tree, whole (the lint's own fidelity fixture, mark-lint.test.mjs § fidelityRepo). */
function realTree() {
  const repo = scratch("held-");
  mkdirSync(join(repo, "WORLD"), { recursive: true });
  cpSync(join(REPO_SRC, "LOGOS"), join(repo, "LOGOS"), { recursive: true });
  copyFileSync(join(REPO_SRC, "WRITES.md"), join(repo, "WRITES.md"));
  for (const f of ["skeleton.json", "filing-freeze.json", "households.json"]) copyFileSync(join(REPO_SRC, "WORLD", f), join(repo, "WORLD", f));
  cpSync(join(REPO_SRC, "WORLD", "marks"), join(repo, "WORLD", "marks"), { recursive: true });
  cpSync(join(REPO_SRC, "WORLD", "law"), join(repo, "WORLD", "law"), { recursive: true }); // the classes are law nodes (WLD-116)
  cpSync(join(REPO_SRC, "WORLD", "_archived"), join(repo, "WORLD", "_archived"), { recursive: true }); // the declaring act of what retired (the lint knows a retired id)
  return repo;
}
const lint = (repo) => {
  try { return execFileSync("node", [LINT, "--repo", repo], { encoding: "utf8" }); }
  catch (e) { return String(e.stdout ?? "") + String(e.stderr ?? ""); }
};
/** The cone as the settlement prints it in someone's hands: the place lines out, the holder in. */
function holdCone(repo, holder = "sb-ash", { keep = [] } = {}) {
  const p = join(repo, CONE_FILE);
  let t = readFileSync(p, "utf8");
  // The cone is a LIVE record (Berthillon moves it when he likes; 10-23 18:00Z it moved to 227,100), so the fixture asserts only that it
  // is placed, never where: this suite is about holding, and a resident's move must never turn it red.
  assert.match(t, /^at: \{[^}]*\}$/m, "the fixture is the cone, placed on Berthillon's wall");
  if (!keep.includes("at")) t = t.replace(/^at: .*\r?\n/m, "");
  if (!keep.includes("extent")) t = t.replace(/^extent: .*\r?\n/m, "");
  t = t.replace(/^---\r?\n\r?\n/m, `${HELD_BY}: ${holder}\n---\n\n`);
  writeFileSync(p, t);
  return t;
}
const errorsOf = (out) => out.split(/\r?\n/).filter((l) => l.startsWith("[ERROR]"));

test("0. one name: the field is held_by, never holder (holder: true is a thing's own can-hold property)", () => {
  assert.equal(HELD_BY, "held_by");
  assert.equal(heldBy({ [HELD_BY]: " sb-ash " }), "sb-ash");
  assert.equal(isHeld({ holder: true }), false, "a chest that can hold is not held");
  assert.equal(isHeld({ [HELD_BY]: "" }), false);
});

test("1. the printout of a held thing lints CLEAN: held_by and no at/extent (the cone in sb-ash's hands)", () => {
  const repo = realTree();
  const printed = holdCone(repo);
  assert.doesNotMatch(printed, /^at:|^extent:/m);
  const out = lint(repo);
  assert.deepEqual(errorsOf(out), [], out.slice(-600));
  assert.match(out, /CLEAN/);
  assert.doesNotMatch(out, /flat field held_by/, "held_by is the record grammar's, not an undeclared property");
});

test("2. a held thing that still names a place is refused: held, it carries no at/extent", () => {
  const repo = realTree();
  holdCone(repo, "sb-ash", { keep: ["at", "extent"] });
  const errs = errorsOf(lint(repo));
  assert.equal(errs.length, 1, errs.join("\n"));
  assert.match(errs[0], /cone-melon-de-charente-2026-08-25: a held thing carries no at\/extent/);
});

/** A record given a class that is not a thing (an idea), so the thing-only rule has something to refuse. */
const asIdea = (t) => t.replace(/^kind: sited\r?$/m, "kind: sited\nclass: idea");
test("3. only a thing is held: held_by on a mark whose class is not a thing is refused", () => {
  const repo = realTree();
  const p = join(repo, "WORLD", "marks", "berthillon", "le-mur-des-cornets", "mark.md");
  writeFileSync(p, asIdea(readFileSync(p, "utf8")).replace(/^at: .*\r?\n/m, "").replace(/^extent: .*\r?\n/m, "").replace(/^---\r?\n\r?\n/m, `${HELD_BY}: sb-ash\n---\n\n`));
  const errs = errorsOf(lint(repo));
  assert.ok(errs.some((e) => /le-mur-des-cornets: held_by: only a thing is held — .*a idea, not a thing/.test(e)), errs.join("\n"));
});

test("3c. a sited mark whose class is ground (a vehicle, which extends portal-ground) still refuses held_by: ground is not carried", () => {
  const repo = realTree();
  const p = join(repo, "WORLD", "marks", "berthillon", "le-mur-des-cornets", "mark.md");
  writeFileSync(p, readFileSync(p, "utf8").replace(/^kind: sited\r?$/m, "kind: sited\nclass: vehicle").replace(/^at: .*\r?\n/m, "").replace(/^extent: .*\r?\n/m, "").replace(/^---\r?\n\r?\n/m, `${HELD_BY}: sb-ash\n---\n\n`));
  const errs = errorsOf(lint(repo));
  assert.ok(errs.some((e) => /le-mur-des-cornets: held_by: only a thing is held — .*a vehicle, not a thing/.test(e)), errs.join("\n"));
});

// S123 (2026-10-21): the take door takes an untyped sited mark (it refuses only portable: false), and the hold
// record has held them since 08-31 (berthillon's cones, a cup, a coin). Their printout is what the record holds.
const LEGACY = join("WORLD", "marks", "berthillon", "cone-blue-moon-2026-08-30", "mark.md");
test("3b. an untyped sited mark the record holds prints held (and owned) and lints CLEAN; a parcel never does (S123)", () => {
  const repo = realTree();
  const p = join(repo, LEGACY);
  const was = readFileSync(p, "utf8");
  assert.match(was, /^kind: sited\r?$/m, "the fixture is a legacy cone: kind sited, no class");
  assert.doesNotMatch(was, /^class:/m);
  writeFileSync(p, was.replace(/^at: .*\r?\n/m, "").replace(/^extent: .*\r?\n/m, "").replace(/^---\r?\n\r?\n/m, `${HELD_BY}: little-bird\n${OWNED_BY}: sb-ash\n---\n\n`));
  const out = lint(repo);
  assert.deepEqual(errorsOf(out), [], out.slice(-600));
  const parcels = realTree();
  const parcel = execFileSync("git", ["-C", REPO_SRC, "grep", "-l", "^kind: parcel", "--", "WORLD/marks"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean)[0];
  const q = join(parcels, parcel);
  writeFileSync(q, readFileSync(q, "utf8").replace(/^---\r?\n\r?\n/m, `${HELD_BY}: sb-ash\n---\n\n`));
  assert.ok(errorsOf(lint(parcels)).some((e) => /held_by: only a thing is held/.test(e)), "ground is not carried");
});

test("4. the fold carries the holder and no place, and every other mark folds byte for byte as before", () => {
  const repo = realTree();
  const fold = (dir) => JSON.parse(execFileSync("node", [FOLD, "--marks-dir", dir, "--no-write", "--json", "--allow-stampless"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }));
  const before = fold(join(repo, "WORLD", "marks"));
  holdCone(repo);
  const held = fold(join(repo, "WORLD", "marks"));
  const cone = held.marks.find((m) => m.id === CONE);
  assert.equal(cone[HELD_BY], "sb-ash");
  assert.equal(cone.at, undefined);
  assert.equal(cone.extent, undefined);
  const was = new Map(before.marks.map((m) => [m.id, JSON.stringify(m)]));
  const moved = held.marks.filter((m) => m.id !== CONE && was.get(m.id) !== JSON.stringify(m)).map((m) => m.id);
  assert.deepEqual(moved, [], "nothing else in the world moved");
});

test("5. a held thing is never an unpublish candidate while held (D4, as recommended)", () => {
  const entry = { class: "commons", path: CONE_FILE };
  const base = { escrow: 0, pathOnMain: true, standing: "market" };
  assert.equal(unpublishVerdict(entry, base).unpublish, true, "placed on the commons at ✦0, the rule sweeps it");
  assert.deepEqual(unpublishVerdict(entry, { ...base, held: true }), { unpublish: false, why: "held" });
  assert.deepEqual(unpublishVerdict(entry, { ...base, held: () => true }), { unpublish: false, why: "held" });
  assert.equal(unpublishVerdict(entry, { ...base, held: () => false }).unpublish, true);
});

test("6. a hand-off is a hold-only change: into hands, out of hands, hand to hand; nothing else is", () => {
  const placed = { kind: "thing", by: "berthillon", date: "2026-08-26", at: { x: 221, y: 95.5 }, extent: { w: 1, h: 1 }, body: "A cone." };
  const { at, extent, ...rest } = placed;
  const inHands = { ...rest, [HELD_BY]: "sb-ash" };
  assert.equal(holdOnlyChange(placed, inHands), true, "taken");
  assert.equal(holdOnlyChange(inHands, { ...rest, at: { x: 1, y: 2 }, extent }), true, "set down");
  assert.equal(holdOnlyChange(inHands, { ...rest, [HELD_BY]: "sb-cleo" }), true, "given");
  assert.equal(holdOnlyChange(placed, { ...placed, at: { x: 1, y: 2 } }), false, "a move on the ground is the author's amend, not a hand-off");
  assert.equal(holdOnlyChange(placed, { ...inHands, body: "A cone, eaten." }), false, "new words are new work");
  assert.equal(holdOnlyChange(inHands, inHands), false, "no hand moved");
  assert.equal(holdOnlyChange(null, inHands), false, "a new mark is a publication");
});

test("7. a thing that frames marks filed inside it is found (its hand-off waits, by name)", () => {
  const repo = scratch("framed-");
  const g = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" });
  g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
  const put = (rel, text) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
  put("WORLD/marks/sable/a-box/mark.md", "---\nkind: thing\nby: sable\ndate: 2026-10-01\nat: { x: 1, y: 1 }\nextent: { w: 1, h: 1 }\n---\n\nA box.\n");
  put("WORLD/marks/sable/a-box/a-boat/mark.md", "---\nkind: thing\nby: sable\ndate: 2026-10-01\nat: { x: 0, y: 0 }\nextent: { w: 0.2, h: 0.1 }\n---\n\nA paper boat.\n");
  put("WORLD/marks/sable/a-box/its-log/mark.md", "---\nkind: predicate\nby: sable\ndate: 2026-10-01\nslot: log\nvalue: kept\n---\n\nA log.\n");
  g("add", "-A"); g("commit", "-qm", "fixture");
  assert.deepEqual(positionedInside(repo, "HEAD", "WORLD/marks/sable/a-box/mark.md"), ["sable/a-boat"], "the boat writes its place against the box; the predicate has none");
  assert.deepEqual(positionedInside(repo, "HEAD", "WORLD/marks/sable/a-box/a-boat/mark.md"), []);
});

test("8. the harm gate reads a hand-off as no harm: a held thing has no place to have moved, and it still stands", () => {
  const was = new Map([[CONE, { id: CONE, at: { x: 221, y: 95.5 } }]]);
  const now = new Map([[CONE, { id: CONE, [HELD_BY]: "sb-ash" }]]);
  const verdict = judge({ before: was, after: now, sweep: { published: [{ id: CONE }] }, state: { marks: [] } });
  assert.equal(verdict.checks.find((c) => c.name === "moved").ok, true);
  assert.equal(verdict.checks.find((c) => c.name === "lost").ok, true);
  const back = judge({ before: now, after: new Map([[CONE, { id: CONE, at: { x: 10, y: 20 } }]]), sweep: { published: [{ id: CONE }] }, state: { marks: [] } });
  assert.equal(back.ok, true, "a drop prints a fresh at: no harm either");
});

// ── MAKER AND OWNER (POS-688; Darko 2026-10-19 16:39–16:45, D-O1 and D-O2 at 17:14) ──
/** The cone, printed owned by someone other than its maker. */
function ownCone(repo, owner = "sb-ash") {
  const p = join(repo, CONE_FILE);
  const t = readFileSync(p, "utf8").replace(/^---\r?\n\r?\n/m, `${OWNED_BY}: ${owner}\n---\n\n`);
  writeFileSync(p, t);
  return t;
}

test("9. D-O1: a thing owned apart from its maker prints owned_by and lints CLEAN; the maker's own name there, a mark id, or a building is refused", () => {
  assert.equal(OWNED_BY, "owned_by");
  assert.equal(ownedBy({ [OWNED_BY]: " sb-ash " }), "sb-ash");
  const clean = realTree();
  ownCone(clean);
  const out = lint(clean);
  assert.deepEqual(errorsOf(out), [], out.slice(-600));
  assert.doesNotMatch(out, /flat field owned_by/, "owned_by is the record grammar's");
  const self = realTree();
  ownCone(self, "berthillon");
  assert.ok(errorsOf(lint(self)).some((e) => /owned_by: berthillon made it, and a maker's own thing prints no owner/.test(e)));
  const id = realTree();
  ownCone(id, "sb-ash/a-bowl");
  assert.ok(errorsOf(lint(id)).some((e) => /owned_by: names the owner, a resident's handle/.test(e)));
  const wall = realTree();
  const p = join(wall, "WORLD", "marks", "berthillon", "le-mur-des-cornets", "mark.md");
  writeFileSync(p, asIdea(readFileSync(p, "utf8")).replace(/^---\r?\n\r?\n/m, `${OWNED_BY}: sb-ash\n---\n\n`));
  assert.ok(errorsOf(lint(wall)).some((e) => /le-mur-des-cornets: owned_by: only a thing is owned apart from its maker/.test(e)));
});

test("10. D-O2: the fold carries the owner and judges the thing in the OWNER's household; the standing walk reads the owner", () => {
  const repo = realTree();
  const fold = (dir) => JSON.parse(execFileSync("node", [FOLD, "--marks-dir", dir, "--no-write", "--json", "--allow-stampless"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }));
  const before = fold(join(repo, "WORLD", "marks")).marks.find((m) => m.id === CONE);
  ownCone(repo);
  const after = fold(join(repo, "WORLD", "marks")).marks.find((m) => m.id === CONE);
  assert.equal(after[OWNED_BY], "sb-ash");
  assert.equal(after.by, "berthillon", "the maker is fixed");
  assert.notEqual(after.declared_household, before.declared_household, "its household is its owner's now");
  assert.equal(standingHouseholdOf({ by: "berthillon", household: "berthillon", [OWNED_BY]: "sb-ash" }), "sb-ash", "unfolded, the walk reads the owner too");
  assert.equal(standingHouseholdOf({ by: "berthillon", household: "berthillon" }), "berthillon");
});

test("11. a change of owner alone is a hold-only change, on the ground or in hands; new words with it are not", () => {
  const placed = { kind: "thing", by: "berthillon", date: "2026-08-26", at: { x: 221, y: 95.5 }, extent: { w: 1, h: 1 }, body: "A cone." };
  assert.equal(holdOnlyChange(placed, { ...placed, [OWNED_BY]: "sb-ash" }), true, "welcomed where it lies");
  const { at, extent, ...rest } = placed;
  assert.equal(holdOnlyChange({ ...rest, [HELD_BY]: "sb-ash" }, { ...rest, [HELD_BY]: "sb-ash", [OWNED_BY]: "sb-ash" }), true, "welcomed in hand");
  assert.equal(holdOnlyChange(placed, { ...placed, [OWNED_BY]: "sb-ash", body: "Mine now." }), false);
});
