// spark.test.mjs — WLD-173: the spark, a mark that remembers a moment.
//
// The rulings (CORE-70; Darko 2026-11-13 and 11-14, recorded by Wright):
//   call 5   "a Spark should minimally just require like a time and a place and a recounting"
//   call 9   "keep the 150 as being like a fundamental part of marks … the headline"
//   09:37    "'at' chosen by the creator with an extent locked at 60 radius (base earshot) if there was none";
//            "It isn't sited, so sited marks in its extent don't contest it"
//   11:1x    "Keep the parcel holder's word"
//   10:46    "I think we can just use the circles as the spine for parents for now? maybe let sparks declare
//            their parent if they want to as a field"
//
// The real tree is copied whole (the lint's own fidelity fixture, as held-unplaced.test.mjs does), sparks
// are filed into it at their ids, and the real lint and fold run over it. Contest runs through the fold
// in-process on invented marks (consent.test.mjs's shape).
//
// ── THE CAN-FAIL FLIPS, run against this branch ─────────────────────────────
// (recorded in the PR body, with the test each one reds)

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { fold, loadMarks, placementParent } from "./marks-fold.mjs";
import { classIndex, classChain, propertyAt, propertyNames, propertyOf } from "./class-properties.mjs";
import { isSited, isGround, isSitedIn, isGroundIn, standingOf, kindIndexOf } from "./mark-kind.mjs";
import { contains, rect } from "./geometry.mjs";
import { SPARK_CLASS, SPARK_FIELDS, SPARK_REQUIRED, isSparkIn, sparkRadiusM, sparksOn, sparksBelow, sparkChildren, ownLinkOf, roomsPlace, roomsOf } from "./spark.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_SRC = join(HERE, "..");
const LINT = join(HERE, "mark-lint.mjs");
const FOLD = join(HERE, "marks-fold.mjs");
const SCRATCH = [];
const scratch = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); SCRATCH.push(d); return d; };
after(() => { for (const d of SCRATCH) rmSync(d, { recursive: true, force: true }); });

/** The real tree, whole. */
function realTree() {
  const repo = scratch("spark-");
  mkdirSync(join(repo, "WORLD"), { recursive: true });
  cpSync(join(REPO_SRC, "LOGOS"), join(repo, "LOGOS"), { recursive: true });
  copyFileSync(join(REPO_SRC, "WRITES.md"), join(repo, "WRITES.md"));
  for (const f of ["skeleton.json", "filing-freeze.json", "households.json", "ENGINE.md"]) copyFileSync(join(REPO_SRC, "WORLD", f), join(repo, "WORLD", f));
  cpSync(join(REPO_SRC, "WORLD", "marks"), join(repo, "WORLD", "marks"), { recursive: true });
  return repo;
}
/** File a record at its id, `WORLD/marks/<by>/<slug>/mark.md`, from a frontmatter object and a body. */
function file(repo, by, slug, fields, body) {
  const dir = join(repo, "WORLD", "marks", by, slug);
  mkdirSync(dir, { recursive: true });
  const line = (v) => (typeof v === "object" ? JSON.stringify(v) : String(v));
  const fm = Object.entries({ by, ...fields }).map(([k, v]) => `${k}: ${line(v)}`).join("\n");
  writeFileSync(join(dir, "mark.md"), `---\n${fm}\n---\n\n${body}\n`);
  return `${by}/${slug}`;
}
const lint = (repo) => {
  try { return execFileSync("node", [LINT, "--repo", repo], { encoding: "utf8", maxBuffer: 64 << 20 }); }
  catch (e) { return String(e.stdout ?? "") + String(e.stderr ?? ""); }
};
const foldCli = (repo) => JSON.parse(execFileSync("node", [FOLD, "--marks-dir", join(repo, "WORLD", "marks"), "--no-write", "--json", "--allow-stampless"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 << 20 }));
/** The tree's own records, as the loader reads them. */
const treeMarks = () => { const l = loadMarks(join(REPO_SRC, "WORLD", "marks")); return Array.isArray(l) ? l : l.marks; };
const errorsFor = (out, by, slug) => out.split(/\r?\n/).filter((l) => l.startsWith("[ERROR]") && l.includes(`WORLD/marks/${by}/${slug}:`));

// A whole spark, every part (the 120 × 120 room is its own; this one keeps a conversation's room)
const WHOLE = {
  kind: "spark", date: "2026-11-14T21:00:00Z", at: "{x: 4000, y: 4100}", extent: "{w: 36, h: 22}",
  recounting: "We sang the ferry song until the lamps came on, and Liv kept the time on a pan.",
  experienced_at: "2026-11-14T20:03:00Z", experienced_until: "2026-11-14T20:41:00Z",
  rooms: ["room-cave-interior-s170"], circle: 50102, circle_path: [50101, 50102], event: "event-little-picas-opening",
  picture: "https://media.postmark.town/sbx-pica/lamps.png", image_prompt: "a cave hall lit by lanterns, singers in a ring",
  acts: [50102, 50103, 50107], present: ["hh:sbx-pica", "hh:sbx-liv"], parent_spark: "sbx-liv/the-opening",
};

// ── the class ─────────────────────────────────────────────────────────────────

test("WLD-173 · the class: spark extends mark in the Keeping Works, declares every part, residents make it, and its circle is a 60 m radius", () => {
  const idx = classIndex(treeMarks());
  assert.deepEqual(classChain(idx, SPARK_CLASS).map((c) => String(c.class)), ["spark", "mark", "postmark-node"], "call 9: a subclass of mark");
  const names = propertyNames(idx, SPARK_CLASS);
  for (const f of [...SPARK_FIELDS, "at", "extent", "body"]) assert.ok(names.has(f), `the class declares ${f}`);
  assert.deepEqual([...SPARK_REQUIRED], ["recounting", "experienced_at"], `call 5: "a time and a place and a recounting" (the place is at/extent)`);
  assert.equal(propertyOf(idx, SPARK_CLASS, "makers")?.value, true, "a resident may make a spark");
  assert.equal(propertyAt(idx, SPARK_CLASS, ["body", "character-cap"])?.value, "150 characters", `call 9: "keep the 150 as being like a fundamental part of marks", inherited`);
  assert.equal(sparkRadiusM(idx), 60, `09:37: "an extent locked at 60 radius (base earshot)"`);
  assert.equal(propertyOf(idx, SPARK_CLASS, "place_radius_m")?.tier, "constitution", "a locked value is the town's default, not the maker's");
});

test("WLD-173 · a place does not make a spark sited or ground: not by the place proxy, and not by its class chain", () => {
  const spark = { kind: "spark", at: { x: 0, y: 0 }, extent: { w: 120, h: 120 } };
  const sitedMark = { kind: "sited", at: { x: 0, y: 0 }, extent: { w: 120, h: 120 } };
  assert.equal(isSited(spark), false, "an at alone never makes a spark sited");
  assert.equal(isGround(spark), false);
  assert.equal(standingOf(spark), SPARK_CLASS, "it answers for itself, with or without an index");
  const idx = kindIndexOf(treeMarks());
  assert.equal(isSitedIn(spark, idx), false);
  assert.equal(isGroundIn(spark, idx), false);
  assert.equal(isSited(sitedMark), true, "control: a sited mark with the same place is sited");
});

// ── the real tree, through the real lint and fold ─────────────────────────────

test("WLD-173 · a whole spark lints clean and round-trips through the fold, every part in its type", () => {
  const repo = realTree();
  const before = foldCli(repo);
  const id = file(repo, "sbx-pica", "the-lamp-song", WHOLE, "The lamps came on while we sang.");
  const standalone = file(repo, "sbx-pica", "a-quiet-bench", {
    kind: "spark", date: "2026-11-14T21:00:00Z", at: "{x: 5000, y: 5200}", extent: "{w: 120, h: 120}",
    recounting: "Sat on the bench and watched the ferry go.", experienced_at: "2026-11-14T18:00:00Z",
  }, "The ferry went by the bench.");
  const out = lint(repo);
  assert.deepEqual(errorsFor(out, "sbx-pica", "the-lamp-song"), [], `the whole spark lints clean:\n${out.slice(-1200)}`);
  assert.deepEqual(errorsFor(out, "sbx-pica", "a-quiet-bench"), [], "a standalone spark in the locked circle lints clean");
  assert.match(out, /CLEAN/, "and the tree stays clean");

  const after = foldCli(repo);
  const got = after.marks.find((m) => m.id === id);
  assert.ok(got, "the fold publishes the spark");
  assert.equal(got.kind, "spark");
  assert.equal(got.body, "The lamps came on while we sang.", "the body is its headline");
  assert.deepEqual(got.at, { x: 4000, y: 4100 });
  assert.deepEqual(got.extent, { w: 36, h: 22 });
  for (const f of SPARK_FIELDS) assert.deepStrictEqual(got[f], WHOLE[f], `${f} round-trips in its type`);
  assert.equal(got.parent, undefined, "its own link is never the predicate edge");

  // every other mark folds byte for byte as before (other mark kinds keep their behaviour)
  const was = new Map(before.marks.map((m) => [m.id, JSON.stringify(m)]));
  const moved = after.marks.filter((m) => was.has(m.id) && was.get(m.id) !== JSON.stringify(m)).map((m) => m.id);
  assert.deepEqual(moved, [], "nothing else in the world moved");
  assert.deepEqual(after.marks.filter((m) => !was.has(m.id)).map((m) => m.id).sort(), [standalone, id].sort());

  // an event's spark for one of its rooms (04:11Z: "each room gets its own spark") round-trips with its one room id
  // and the room's place, halves kept
  const event = foldCli(repo).marks.find((m) => m.id === "sbx-pica/the-opening");
  assert.equal(event, undefined, "control: not filed yet");
  const place = roomsPlace([{ x0: 4000, y0: 4100, x1: 4041, y1: 4121 }]);
  assert.deepEqual(place, { at: { x: 4020.5, y: 4110.5 }, extent: { w: 41, h: 21 } }, "the room's bounds: centre and sides");
  file(repo, "sbx-pica", "the-opening", { kind: "spark", date: "2026-11-14T22:00:00Z", at: place.at, extent: place.extent,
    recounting: "The cave opened and the hall filled.", experienced_at: "2026-11-14T19:00:00Z", experienced_until: "2026-11-14T22:00:00Z",
    rooms: ["room-cave-hall"], event: "event-little-picas-opening" }, "Little Pica's opening.");
  assert.deepEqual(errorsFor(lint(repo), "sbx-pica", "the-opening"), [], "an event's spark of one room lints clean");
  const opening = foldCli(repo).marks.find((m) => m.id === "sbx-pica/the-opening");
  assert.deepStrictEqual(opening.rooms, ["room-cave-hall"], "its one room id is kept, in its list");
  assert.equal(opening.room, undefined, "and no second spelling beside it");
  assert.deepStrictEqual({ at: opening.at, extent: opening.extent }, place, "and the room's place, exactly");

  // the spine reads off the published records: the sub-spark under the lamp song's circle
  const sub = { ...got, id: "sbx-liv/the-pan", circle: 50107, circle_path: [50101, 50102, 50107], parent_spark: undefined };
  assert.deepEqual(sparkChildren(got, [got, sub]).map((s) => s.id), ["sbx-liv/the-pan"]);
});

test("WLD-173 · the lint refuses a spark missing a required part, over the headline cap, anchored, or out of shape — each by name", () => {
  const repo = realTree();
  const base = { kind: "spark", date: "2026-11-14T21:00:00Z", at: "{x: 6000, y: 6000}", extent: "{w: 120, h: 120}",
    recounting: "It rained.", experienced_at: "2026-11-14T18:00:00Z" };
  const without = (k) => Object.fromEntries(Object.entries(base).filter(([key]) => key !== k));
  const cases = [
    ["no-recounting", without("recounting"), "x", /needs recounting/],
    ["no-time", without("experienced_at"), "x", /needs experienced_at/],
    ["no-place", Object.fromEntries(Object.entries(base).filter(([k]) => k !== "at" && k !== "extent")), "x", /needs at \{x,y\} and extent/],
    ["long-headline", base, "x".repeat(151), /body is 151 chars; the cap is 150/],
    ["anchored", { ...base, parent: "terrain:the-inlet" }, "x", /a spark is never anchored/],
    ["wrong-circle", { ...base, extent: "{w: 60, h: 60}" }, "x", /stands in the locked circle: extent \{w: 120, h: 120\}/],
    ["circle-no-path", { ...base, rooms: ["r1"], circle: 7 }, "x", /circle: 7 needs circle_path/],
    ["path-wrong-end", { ...base, rooms: ["r1"], circle: 7, circle_path: [3, 5] }, "x", /circle_path: ends at 5, not at circle: 7/],
    ["circle-no-room", { ...base, circle: 7, circle_path: [7] }, "x", /circle: 7 needs rooms: \[<its one source room>\]/],
    // one room per spark (04:11Z: "each room gets its own spark"): a list of several, here in the locked circle where it
    // would otherwise lint as a standalone spark, is refused by name, never combined or cut to its first
    ["two-rooms", { ...base, rooms: ["r1", "r2"] }, "x", /rooms: names 2 rooms; a spark binds one room at most — each room gets its own spark/],
    ["circle-two-rooms", { ...base, rooms: ["r1", "r2"], circle: 7, circle_path: [7] }, "x", /circle: 7 needs rooms: \[<its one source room>\]/],
    ["rooms-text", { ...base, rooms: "r1" }, "x", /rooms: is a JSON array of room ids/],
    ["rooms-number", { ...base, rooms: [1033] }, "x", /rooms: is a JSON array of room ids/],
    ["empty-rooms-small", { ...base, rooms: [], extent: "{w: 60, h: 60}" }, "x", /stands in the locked circle: extent \{w: 120, h: 120\}/],
    // the unpublished singular field has no alias: refused by name, not read as no room in the locked circle
    ["old-room", { ...base, room: "r1" }, "x", /room: is not a spark field — a spark's room is rooms: \[<room id>\]/],
    ["until-before", { ...base, experienced_until: "2026-11-14T17:00:00Z" }, "x", /is before experienced_at/],
    ["bad-link", { ...base, parent_spark: "not an id" }, "x", /parent_spark: names one spark by id/],
    ["slot", { ...base, slot: "name", value: "x" }, "x", /carries no slot\/value/],
    // review 391 F1: a place is four finite numbers as written; rect() would default or garble anything else
    ["no-y", { ...base, rooms: ["r1"], at: "{x: 6000}" }, "x", /at: \{x, y\} are two finite numbers/],
    ["null-sides", { ...base, rooms: ["r1"], extent: { w: null, h: null } }, "x", /extent: \{w, h\} are two finite numbers/],
    ["quoted-at", { ...base, rooms: ["r1"], at: { x: "6000", y: "6000" } }, "x", /at: \{x, y\} are two finite numbers/],
    // review 391 F2: the old form would stand sited, ground the spark is not
    ["old-form", { ...Object.fromEntries(Object.entries(base).filter(([k]) => k !== "kind")), kind: "sited", class: "spark" }, "x", /class: spark is a spark, and a spark is written kind: spark/],
  ];
  for (const [slug, fields, body] of cases) file(repo, "sbx-ana", slug, fields, body);
  const ok = file(repo, "sbx-ana", "control", base, "It rained on the quay.");
  // the zero control (review 391 F1): a one-speaker room's point, 0 × 0 in finite numbers, is a lawful place
  file(repo, "sbx-ana", "point-room", { ...base, rooms: ["r1"], extent: "{w: 0, h: 0}" }, "We spoke at the post.");
  // the one-room controls: an event's spark keeps its one room with the place it was written with (the lint holds
  // no room's bounds, so it judges none; that is roomsPlace's, below), a line room keeps its half and zero side,
  // and an empty list is no room, in the locked circle
  file(repo, "sbx-ana", "event-room", { ...base, rooms: ["r1"], event: "ev-1", extent: "{w: 41, h: 21}" }, "The whole opening.");
  file(repo, "sbx-ana", "line-room", { ...base, rooms: ["r1"], extent: "{w: 12.5, h: 0}" }, "We spoke along the wall.");
  file(repo, "sbx-ana", "empty-rooms", { ...base, rooms: [] }, "It rained on the quay, alone.");
  const out = lint(repo);
  assert.deepEqual(errorsFor(out, "sbx-ana", "control"), [], "control: the same spark, whole, is clean");
  assert.deepEqual(errorsFor(out, "sbx-ana", "point-room"), [], "control: a point room (0 × 0) is clean");
  assert.deepEqual(errorsFor(out, "sbx-ana", "empty-rooms"), [], "control: an empty room list in the locked circle is clean");
  assert.deepEqual(errorsFor(out, "sbx-ana", "event-room"), [], "control: an event's spark keeps its one room");
  assert.deepEqual(errorsFor(out, "sbx-ana", "line-room"), [], "control: a line room keeps its half and its zero side");
  for (const [slug, , , words] of cases) {
    const errs = errorsFor(out, "sbx-ana", slug);
    assert.ok(errs.some((l) => words.test(l)), `${slug}: refused by name (${words}); got:\n${errs.join("\n") || "(no error)"}`);
  }
  assert.ok(ok);
});

// ── who contests a spark (the fold, in-process) ───────────────────────────────

const terrain = { features: [] };
const sited = (slug, by, x, y, w, h, extra = {}) => ({ id: `${by}/${slug}`, slug, by, household: by, kind: "sited", at: { x, y }, extent: { w, h }, date: "2026-11-10", body: slug, ...extra });
const parcel = (slug, by, x, y, extra = {}) => ({ id: `${by}/${slug}`, slug, by, household: by, kind: "parcel", at: { x, y }, extent: { w: 25, h: 25 }, date: "2026-11-01", body: slug, ...extra });
const spark = (slug, by, x, y, w, h, extra = {}) => ({ id: `${by}/${slug}`, slug, by, household: by, kind: "spark", at: { x, y }, extent: { w, h }, date: "2026-11-12", body: slug,
  recounting: "it happened", experienced_at: "2026-11-12T20:00:00Z", ...extra });
const stake = (holder, mark, n) => ({ holder, mark, n, weight: n, tick: 0 });
const stands = (state, id) => state.marks.some((m) => m.id === id);
const SENIOR = "2026-11-01";

test("WLD-173 · sited marks and the market do not contest a spark: a backed senior's opposition leaves it standing, and the same word still returns an ordinary mark", () => {
  const word = { "b/moment": "opposed", "b/shed": "opposed" };
  const estate = sited("estate", "a", 0, 0, 1000, 1000, { consent: word, date: SENIOR });
  const moment = spark("moment", "b", 0, 0, 100, 100);
  const shed = sited("shed", "b", 300, 300, 100, 100);
  const state = fold({ marks: [estate, moment, shed], terrain, tick: 1, stakes: [stake("s", "a/estate", 100)] });
  assert.equal(stands(state, "b/shed"), false, "control: a backed senior's word returns an ordinary newcomer");
  assert.equal(stands(state, "b/moment"), true, `09:37: "sited marks in its extent don't contest it"`);
  assert.ok(!state.returned.some((r) => r.mark === "b/moment"), "and it was never vetoed");
  assert.ok(state.returned.some((r) => r.mark === "b/shed"), "control: the shed's veto is in the same returned list");
});

test("WLD-173 · a spark contests no one: its own opposition never returns a sited mark, where a senior's would", () => {
  const word = { "b/stall": "opposed" };
  const stall = sited("stall", "b", 0, 0, 50, 50, { date: "2026-11-13" });
  const asSpark = spark("vigil", "a", 0, 0, 120, 120, { consent: word, date: SENIOR });
  const asSited = sited("vigil", "a", 0, 0, 120, 120, { consent: word, date: SENIOR });
  const stakes = [stake("s", "a/vigil", 100)];
  assert.equal(stands(fold({ marks: [asSited, stall], terrain, tick: 1, stakes }), "b/stall"), false, "control: the same senior word from a sited mark returns the stall");
  assert.equal(stands(fold({ marks: [asSpark, stall], terrain, tick: 1, stakes }), "b/stall"), true, "and from a spark it reaches no one");
});

test("WLD-173 · one answer for one record: the old form `kind: sited` + `class: spark` is not a spark to the market while ground to everything else (review 391 F2)", () => {
  const canonical = spark("moment", "b", 0, 0, 120, 120);
  const oldForm = { ...canonical, kind: "sited", class: "spark" };
  // the classifiers agree on each
  assert.equal(isSparkIn(canonical), true);
  assert.equal(isGroundIn(canonical, null), false);
  assert.equal(isSparkIn(oldForm), false, "the old form stands sited, so it is no spark to the market either");
  assert.equal(standingOf(oldForm), "sited");
  assert.equal(isSited(oldForm), true);
  // through the fold: a backed senior's opposition reaches the old form (it is ground), never the canonical spark
  const word = { "b/moment": "opposed" };
  const estate = sited("estate", "a", 0, 0, 1000, 1000, { consent: word, date: SENIOR });
  const stakes = [stake("s", "a/estate", 100)];
  assert.equal(stands(fold({ marks: [estate, canonical], terrain, tick: 1, stakes }), "b/moment"), true, "the canonical spark is out of the market");
  assert.equal(stands(fold({ marks: [estate, oldForm], terrain, tick: 1, stakes }), "b/moment"), false, "the old form is not: no market exemption for a record that stands as ground");
  // and only ground contains: another household's stool sits in the old form's ground, never in a spark's
  const stool = sited("stool", "c", 0, 0, 5, 5);
  assert.equal(placementParent(stool, [canonical, stool]), null, "a canonical spark contains nothing");
  assert.equal(placementParent(stool, [oldForm, stool]), "b/moment", "the old form is ground, consistently (and the lint refuses the spelling)");
});

test(`WLD-173 · "Keep the parcel holder's word": opposed returns a spark on their ground, welcomed keeps it, silence lets it stand`, () => {
  const moment = spark("moment", "b", 0, 0, 10, 10);
  const opposed = fold({ marks: [parcel("home", "holder", 0, 0, { consent: { "b/moment": "opposed" } }), moment], terrain, tick: 1, stakes: [] });
  assert.equal(stands(opposed, "b/moment"), false, "the holder's opposed word returns it, as any mark laid on their ground");
  assert.equal(opposed.returned.find((r) => r.mark === "b/moment")?.authority, "parcel (absolute)", "by the parcel's absolute word");
  const welcomed = fold({ marks: [parcel("home", "holder", 0, 0, { consent: { "b/moment": "welcomed" } }), moment], terrain, tick: 1, stakes: [] });
  assert.equal(welcomed.marks.find((m) => m.id === "b/moment")?.kept, true, "welcomed keeps it");
  const silent = fold({ marks: [parcel("home", "holder", 0, 0), moment], terrain, tick: 1, stakes: [] });
  assert.equal(stands(silent, "b/moment"), true, "neutral, the resting state, lets it stand");
});

test("WLD-173 · the town keeps its word over a spark", () => {
  const moment = spark("moment", "b", 0, 0, 10, 10);
  const state = fold({ marks: [moment], terrain, tick: 1, stakes: [], townWords: { "b/moment": "opposed" } });
  assert.equal(stands(state, "b/moment"), false, "the town's opposed word returns a spark like any mark");
  const control = fold({ marks: [moment], terrain, tick: 1, stakes: [] });
  assert.equal(stands(control, "b/moment"), true, "control: without it the spark stands");
});

test("WLD-173 · a spark with no area (a one-speaker room's point) answers the parcel it stands in, and not one it stands outside", () => {
  const holder = (consent) => parcel("home", "holder", 0, 0, { consent });
  const inside = spark("dot", "b", 5, 5, 0, 0);
  const outside = spark("dot", "b", 40, 40, 0, 0);
  const opposed = { "b/dot": "opposed" };
  assert.equal(stands(fold({ marks: [holder(opposed), inside], terrain, tick: 1, stakes: [] }), "b/dot"), false, "a point inside the parcel is on the holder's ground");
  assert.equal(stands(fold({ marks: [holder(opposed), outside], terrain, tick: 1, stakes: [] }), "b/dot"), true, "negative control: a point outside it is not");
  const line = spark("dot", "b", 0, 5, 30, 0);
  assert.equal(stands(fold({ marks: [holder(opposed), line], terrain, tick: 1, stakes: [] }), "b/dot"), false, "a line crossing the parcel is on its ground too");
});

test("WLD-173 · a spark stands in the ground it is in, by where its points lie, and contains nothing", () => {
  const home = parcel("home", "holder", 0, 0);
  const shed = sited("shed", "other", 1000, 1000, 50, 50);
  const outsideDot = spark("dot", "b", 500, 500, 0, 0);
  assert.equal(contains(rect(shed), rect(outsideDot)), true, "the area test alone would hold a point anywhere (0 ≥ 0)");
  assert.equal(placementParent(outsideDot, [home, shed, outsideDot]), null, "but a point outside every ground has no container");
  assert.equal(placementParent(spark("dot", "b", 5, 5, 0, 0), [home, shed]), "holder/home", "a point inside the parcel stands in it");
  assert.equal(placementParent(spark("wide", "b", 0, 0, 20, 20), [home, shed]), "holder/home", "an area spark inside it too, by the ordinary test");
  const big = spark("hall", "b", 0, 0, 900, 900);
  assert.notEqual(placementParent(sited("cup", "c", 0, 0, 5, 5), [big, home]), "b/hall", "a spark is never anyone's container");
});

test("WLD-173 · a spark's standing and money rules are a mark's: home inside its own household's parcel, market on the commons", () => {
  const own = fold({ marks: [parcel("home", "b", 0, 0), spark("moment", "b", 0, 0, 10, 10)], terrain, tick: 1, stakes: [] });
  assert.equal(own.marks.find((m) => m.id === "b/moment")?.tier, "home", "inside its own parcel");
  assert.equal(own.marks.find((m) => m.id === "b/moment")?.placementParent, "b/home");
  const commons = fold({ marks: [parcel("home", "b", 0, 0), spark("moment", "b", 500, 500, 10, 10)], terrain, tick: 1, stakes: [] });
  assert.equal(commons.marks.find((m) => m.id === "b/moment")?.tier, "market", "on the commons");
});

test("WLD-173 · its place is frozen: the ground around it moving never moves or resizes a spark", () => {
  const moment = spark("moment", "b", 0, 0, 36, 22);
  const before = fold({ marks: [parcel("home", "b", 0, 0), moment], terrain, tick: 1, stakes: [] }).marks.find((m) => m.id === "b/moment");
  const moved = parcel("home", "b", 10, 10, { extent: { w: 200, h: 200 } });
  const after = fold({ marks: [moved, moment], terrain, tick: 1, stakes: [] }).marks.find((m) => m.id === "b/moment");
  assert.deepEqual(after.at, before.at);
  assert.deepEqual(after.extent, before.extent);
  assert.deepEqual(after.at, { x: 0, y: 0 }, "it keeps the place it was made with");
});

// ── one room's place (04:11Z: "each room gets its own spark") ─────────────────────

test("WLD-173 · roomsPlace: one room's bounds give the centre and sides, halves and zero sides kept, and no place from a missing, guessed or second room", () => {
  assert.deepEqual(roomsPlace([{ x0: 0, y0: 0, x1: 3, y1: 1 }]), { at: { x: 1.5, y: 0.5 }, extent: { w: 3, h: 1 } }, "its midpoint and differences, halves kept");
  assert.deepEqual(roomsPlace([{ x0: 5, y0: 7, x1: 5, y1: 7 }]), { at: { x: 5, y: 7 }, extent: { w: 0, h: 0 } }, "a one-speaker room is a point: zero sides, no padding");
  assert.deepEqual(roomsPlace([{ x0: -2, y0: 4, x1: 3, y1: 4 }]), { at: { x: 0.5, y: 4 }, extent: { w: 5, h: 0 } }, "a line keeps its zero side");
  assert.equal(roomsPlace([]), null, "no room is the locked circle's case, not a place");
  for (const none of [undefined, null, [null], [{}]]) assert.equal(roomsPlace(none), null, `an unavailable room (${JSON.stringify(none)}) is no place`);
  assert.equal(roomsPlace([{ x0: 0, y0: 0, x1: 1 }]), null, "a missing bound is no place");
  assert.equal(roomsPlace([{ x0: "0", y0: 0, x1: 1, y1: 1 }]), null, "a quoted bound is no place");
  assert.equal(roomsPlace([{ x0: 5, y0: 0, x1: 1, y1: 1 }]), null, "inverted bounds are no place");
  assert.equal(roomsPlace([{ x0: 0, y0: 0, x1: 1, y1: 1 }, { x0: 5, y0: 0, x1: 6, y1: 1 }]), null, "two rooms are two sparks: never combined, never the first alone");
  assert.equal(roomsPlace({ x0: 0, y0: 0, x1: 1, y1: 1 }), null, "the bounds come as the record keeps rooms, a list of one");
  assert.deepEqual(roomsOf({ rooms: ["r1"] }), ["r1"]);
  assert.deepEqual(roomsOf({ room: "r1" }), [], "the singular spelling is no room");
});

// ── ordinary backing (04:2xZ: other backing keeps a spark after its host unstakes) ──

test("WLD-173 · a spark is backed as any mark: after its maker withdraws, another household's stake is what it holds, the same as an ordinary mark", () => {
  const moment = spark("moment", "b", 0, 0, 120, 120);
  const shed = sited("shed", "b", 500, 500, 100, 100);
  const backed = (id) => [stake("b", id, 1), stake("b", id, -1), stake("c", id, 1)];
  const state = fold({ marks: [moment, shed], terrain, tick: 1, stakes: [...backed("b/moment"), ...backed("b/shed")] });
  const of = (id) => state.marks.find((m) => m.id === id);
  assert.equal(stands(state, "b/moment"), true, "the spark stands");
  assert.equal(of("b/moment").stamps, 1, "the maker's withdrawal leaves the other household's stamp");
  assert.equal(of("b/moment").stamps, of("b/shed").stamps, "control: exactly what an ordinary mark holds");
  assert.ok(!(state.errors ?? []).some((e) => e.mark === "b/moment" || e.stake?.mark === "b/moment"), "and no fold error for the spark");
});

// ── the circle spine (10:46) ──────────────────────────────────────────────────

test("WLD-173 · the circle tree: X and Y on A both show Z on reply circle B, nothing is orphaned, and parent_spark changes only its own link", () => {
  const A = 101, B = 102, C = 103;
  const D = 201, U = 301;
  const X = { id: "a/x", rooms: ["r1"], circle: A, circle_path: [A] };
  const Y = { id: "b/y", rooms: ["r1"], circle: A, circle_path: [A] };
  const Z = { id: "c/z", rooms: ["r1"], circle: B, circle_path: [A, B] };
  const W = { id: "d/w", rooms: ["r1"], circle: C, circle_path: [A, B, C] };
  const V = { id: "f/v", rooms: ["r2"], circle: D, circle_path: [D] };
  const O = { id: "g/other", rooms: ["r3"], circle: U, circle_path: [U] };
  // each room gets its own spark (04:11Z), each tied to the event: r1's spark over r1's circles, never r2's or r3's
  const E = { id: "e/event", rooms: ["r1"], event: "ev-1" };
  // the same event's spark for r2: its own room's circles only, and nothing of r1's
  const E2 = { id: "h/event2", rooms: ["r2"], event: "ev-1" };
  // a refused record naming two rooms gathers nothing: never an aggregate root
  const EE = { id: "i/both", rooms: ["r1", "r2"], event: "ev-1" };
  const all = [X, Y, Z, W, V, O, E, E2];
  const ids = (xs) => xs.map((s) => s.id).sort();
  assert.deepEqual(ids(sparksOn(all, A)), ["a/x", "b/y"], "many sparks per circle");
  assert.deepEqual(ids(sparkChildren(X, all)), ["c/z", "d/w"], "X shows Z");
  assert.deepEqual(ids(sparkChildren(Y, all)), ["c/z", "d/w"], "and Y shows Z too: nobody chose one of them");
  assert.deepEqual(ids(sparkChildren(Z, all)), ["d/w"]);
  assert.deepEqual(ids(sparkChildren(E, all)), ["a/x", "b/y", "c/z", "d/w"], "the event's spark stands over every circle spark of its room");
  assert.ok(!sparkChildren(E, all).includes(V) && !sparkChildren(E, all).includes(O), "and over none from another room");
  assert.deepEqual(ids(sparkChildren(E2, all)), ["f/v"], "room r2's root collects r2's circles only, though it names the same event");
  assert.deepEqual(sparkChildren(EE, all), [], "a two-room record is no root of either room");
  // no lost child: every circle spark is under every circle on its path
  for (const s of [X, Y, Z, W]) for (const c of s.circle_path.slice(0, -1)) assert.ok(sparksBelow(all, c).includes(s), `${s.id} is under ${c}`);

  // the maker's own link: Z names X. The tree does not move; only Z's own link says X.
  const Zl = { ...Z, parent_spark: "a/x" };
  const linked = [X, Y, Zl, W, V, O, E];
  assert.equal(ownLinkOf(Zl), "a/x");
  assert.equal(ownLinkOf(Z), null);
  assert.deepEqual(ids(sparkChildren(Y, linked)), ids(sparkChildren(Y, all)), "Y still shows Z: the own link is not the tree");
  assert.deepEqual(ids(sparkChildren(X, linked)), ids(sparkChildren(X, all)));
});
