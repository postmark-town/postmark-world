// tier-frames.test.mjs — § the tier binding (marks-fold.mjs; SCHEMA.md
// § Containment is not authority). Founder-ruled 2026-08-11 evening:
//
//   A PARENT BINDS A CHILD ONLY IF ITS TIER RANKS AT OR ABOVE THE CHILD'S.
//
// A bound child is framed by its parent and rides when the parent moves. An
// outranking child is framed by the WORLD and nothing its parent does can move
// it. A predicate can never outrank what it predicates, and that one is refused.
//
// ── amended by THE FREEZE (the founder, 2026-08-25) ──────────────────────────
// The binding rule is untouched — a directory still FRAMES the numbers written
// inside it, which is arithmetic about a file. What went is the other half: the
// directory no longer CLAIMS containment, so a drifted edge is not a finding and
// there is no repair. "The directory-matches-containment law is REPEALED — the
// tree's paths make no assertion, so nothing about them can become false."
// Several tests below are the inverse of what they used to assert, and say so
// where they stand.
//
// ── amended by the one-walk tier truth (Keemin, 2026-08-12) ──────────────────
// The binding rule above is untouched. What changed is WHERE A RANK COMES FROM:
// the `tier:` line on a record is no longer read as authority, because standing
// is derived by the one walk (tools/mark-standing.mjs) and a resident does not
// declare it. So the ladder the frame sees has the town's constitution above,
// everything standing on resident ground at market, and draft below — and
// "green in yellow", the quadrant a resident could once reach by writing
// `tier: sovereignty` on their house, no longer exists. A house on its own
// parcel BINDS to it, which is what owning your ground means.
//
// Three quadrants, two refusals, and a falsifier. The quadrants say what the
// rule means; the falsifier says no crossing moves a mark nobody touched.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMarks, placementParent, tierRank, standingRank, TIER_RANK, COORDS_FIELD, COORDS_RELATIVE } from "./marks-fold.mjs";
import { markStanding, standingHouseholdOf } from "./mark-standing.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const LINT = join(HERE, "mark-lint.mjs");

// ── fixtures ─────────────────────────────────────────────────────────────────
// Same shape as coords-frame.test.mjs: a spec is { path, fm }, the path IS the
// nesting. Positions are written in the v3 relative frame, which is what makes
// the quadrants readable — a bound child's numbers are small and local, an
// outranking child's are the world's.
function treeOf(records) {
  const dir = mkdtempSync(join(tmpdir(), "tier-frames-"));
  for (const { path, fm } of records) {
    const d = join(dir, ...path.split("/"));
    mkdirSync(d, { recursive: true });
    const lines = Object.entries(fm).map(([k, v]) => {
      if (k === "at") return `at: { x: ${v.x}, y: ${v.y} }`;
      if (k === "extent") return `extent: { w: ${v.w}, h: ${v.h} }`;
      return `${k}: ${v}`;
    });
    writeFileSync(join(d, "mark.md"), `---\n${lines.join("\n")}\n---\n\nA record in a fixture.\n`);
  }
  return dir;
}
const withTree = (records, fn) => { const d = treeOf(records); try { return fn(d); } finally { rmSync(d, { recursive: true, force: true }); } };
const R = "let-there-be-light";
const THE_ROOT = { path: R, fm: {
  kind: "sited", by: "the-town", tier: "constitution", date: "2026-08-11",
  at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, [COORDS_FIELD]: COORDS_RELATIVE,
} };
const mark = (tier, at, extent, extra = {}) => {
  const m = { kind: "sited", by: "t", tier, date: "2026-08-11", at, extent, ...extra };
  // B applied on disk (2026-08-13): a fixture writes a tier: line only where the
  // tree lawfully carries one — the town's own constitution. `tier` stays the
  // helper's SEMANTIC input (which quadrant the test means); for everyone else
  // the walk derives it, which is the very law these tests exercise.
  if (!(m.by === "the-town" && m.tier === "constitution")) delete m.tier;
  return m;
};
const by = (dir) => Object.fromEntries(loadMarks(dir).map((m) => [m.id, m]));

function runLint(marksDir, freeze = null) {
  const r = spawnSync(process.execPath,
    [LINT, "--marks-dir", marksDir, ...(freeze ? ["--freeze", freeze] : []), "--json"],
    { encoding: "utf8" });
  return { code: r.status, ...JSON.parse(r.stdout) };
}

// ── the ranks themselves ─────────────────────────────────────────────────────
test("the ranks are the law's order, and a record with no tier is market", () => {
  assert.deepEqual(TIER_RANK, { constitution: 3, sovereignty: 2, market: 1, draft: 0 });
  assert.equal(tierRank({ tier: "constitution" }) > tierRank({ tier: "sovereignty" }), true);
  assert.equal(tierRank({ tier: "sovereignty" }) > tierRank({ tier: "market" }), true);
  assert.equal(tierRank({ tier: "market" }) > tierRank({ tier: "draft" }), true);
  assert.equal(tierRank({}), TIER_RANK.market, "a missing tier is market");
  assert.equal(tierRank({ tier: "nonsense" }), TIER_RANK.market, "and so is one nobody can read");
  assert.equal(tierRank(undefined), TIER_RANK.market);
});

// ── THE ONE-WALK TRUTH: what the frame actually asks (Keemin, 2026-08-12) ────
test("a resident's tier: line is INERT — the frame asks the walk, not the record", () => {
  const town = { by: "the-town", tier: "constitution", kind: "sited" };
  assert.equal(standingRank(town, new Map()), TIER_RANK.constitution, "the town's own law still ranks above everything");

  // Every one of these is a resident writing a rank on their own record. Under
  // the old reading two of them worked. Now none of them says anything.
  for (const claimed of ["constitution", "sovereignty", "market", undefined, "nonsense"]) {
    const rec = { by: "alden", kind: "sited", ...(claimed === undefined ? {} : { tier: claimed }) };
    assert.equal(standingRank(rec, new Map()), TIER_RANK.market,
      `a resident writing tier: ${JSON.stringify(claimed)} ranks at market like everyone else`);
  }
  // …including the shape the lint already refuses. The walk does not depend on
  // the lint having run to be true about who may speak the law.
  assert.equal(markStanding({ by: "alden", tier: "constitution", kind: "sited" }, new Map()), "market");
  assert.equal(markStanding({ by: "the-town", tier: "constitution", kind: "sited" }, new Map()), "constitution");

  // draft is the one field still read, and it is not a standing: it says which
  // BRANCH a record is on, which no walk over the world's ground can know.
  assert.equal(standingRank({ by: "alden", tier: "draft", kind: "sited" }, new Map()), TIER_RANK.draft);

  // The law layer is answered BEFORE the ancestor walk. A reach of the town's
  // river filed inside a resident's parcel is not a guest on their fence.
  const parcel = { id: "alden/p", by: "alden", kind: "parcel" };
  const reach = { id: "the-town/the-reach", by: "the-town", tier: "constitution", kind: "predicated", parent: "alden/p" };
  const idx = new Map([[parcel.id, parcel]]);
  assert.equal(markStanding(reach, idx), "constitution", "the town's law stands on its own ground wherever it is filed");
  assert.equal(standingRank(reach, idx), TIER_RANK.constitution);
});

// ── CONFERRED SOVEREIGNTY (Keemin's ruling, 2026-08-12 evening) ──────────────
// Standing on sovereign ground is a derivable trait. Three cases, all decided in
// groundVerdict inside the ONE walk, so the fold, lint, sweep and viewer cannot
// disagree about who is at home.
test("case 1 — SAME HOUSEHOLD composes: an estate's own wing is part of the estate", () => {
  // Same handle: the plain case, unchanged since 07-28.
  withTree([
    THE_ROOT,
    { path: `${R}/the-parcel`, fm: { ...mark("market", { x: 200, y: 200 }, { w: 25, h: 25 }), kind: "parcel" } },
    { path: `${R}/the-parcel/the-shed`, fm: mark("market", { x: 2, y: 2 }, { w: 4, h: 4 }) },
  ], (dir) => {
    const m = by(dir);
    const idx = new Map(Object.entries(m));
    assert.equal(markStanding(m["t/the-shed"], idx), "home", "the shed stands on its author's own ground");
    assert.equal(markStanding(m["t/the-parcel"], idx), "home");
  });

  // ACROSS HANDLES OF ONE HOUSEHOLD — the grain the ruling names. Two of one
  // person's residents are one household, so their marks compose and neither
  // asks the other's permission. Only the resolved household differs here.
  const parcel = { id: "beta/the-parcel", kind: "parcel", by: "beta", household: "beta", _cred: "cadaeic.space" };
  const wing   = { id: "alpha/the-wing", kind: "sited", by: "alpha", household: "alpha", _cred: "cadaeic.space",
                   _parentMarkId: "beta/the-parcel" };
  const idx = new Map([[parcel.id, parcel]]);
  assert.equal(markStanding(wing, idx), "home", "alpha and beta are one household; the wing is the estate's own");
  assert.equal(standingHouseholdOf(wing), "cadaeic.space", "the grain is the resolved household, not the handle");

  // …and a stranger with the same SHAPE is not at home, which is what makes the
  // assertion above about the grain rather than about the nesting.
  const guest = { ...wing, id: "zed/the-wing", by: "zed", household: "zed", _cred: "solo:zed" };
  assert.equal(markStanding(guest, idx), "market");

  // the published store's own field name resolves too (the viewer's copy)
  assert.equal(standingHouseholdOf({ declared_household: "the-rookery", household: "corvid" }), "the-rookery");
  // and a handle nobody has resolved falls back to itself, never to null
  assert.equal(standingHouseholdOf({ by: "newcomer" }), "newcomer");
});

test("case 2 — WELCOMED confers: the holder's word makes a cross-household guest at home", () => {
  const PARCEL = (consent) => ({
    path: `${R}/the-parcel`,
    fm: { ...mark("market", { x: 200, y: 200 }, { w: 25, h: 25 }), kind: "parcel", by: "holder",
      ...(consent ? { consent: JSON.stringify(consent) } : {}) },
  });
  const ROSE = { path: `${R}/the-parcel/the-rose`, fm: mark("market", { x: 2, y: 2 }, { w: 1, h: 1 }, { by: "guest" }) };

  withTree([THE_ROOT, PARCEL({ "guest/the-rose": "welcomed" }), ROSE], (dir) => {
    const m = by(dir);
    assert.equal(markStanding(m["guest/the-rose"], new Map(Object.entries(m))), "home",
      "welcomed by the ground-holder, the rose stands as home under the holder's name");
  });

  // case 3 — ABSENT is the resting state: a guest at the doorstep is a guest.
  withTree([THE_ROOT, PARCEL(null), ROSE], (dir) => {
    const m = by(dir);
    assert.equal(markStanding(m["guest/the-rose"], new Map(Object.entries(m))), "market",
      "no word spoken, no conferral — the flower at the doorstep is uncoupled");
  });

  // opposed is the RETURN law (consent.mjs) and confers nothing here
  withTree([THE_ROOT, PARCEL({ "guest/the-rose": "opposed" }), ROSE], (dir) => {
    const m = by(dir);
    assert.equal(markStanding(m["guest/the-rose"], new Map(Object.entries(m))), "market");
  });

  // A word names ONE mark. The holder welcoming the rose has not welcomed
  // everything the guest ever files on their ground.
  withTree([
    THE_ROOT,
    PARCEL({ "guest/the-rose": "welcomed" }),
    ROSE,
    { path: `${R}/the-parcel/the-barrow`, fm: mark("market", { x: -2, y: -2 }, { w: 1, h: 1 }, { by: "guest" }) },
  ], (dir) => {
    const m = by(dir);
    const idx = new Map(Object.entries(m));
    assert.equal(markStanding(m["guest/the-rose"], idx), "home");
    assert.equal(markStanding(m["guest/the-barrow"], idx), "market", "one word, one mark");
  });
});

test("conferral changes STANDING and never RANK — so it cannot move the world", () => {
  // The structural guarantee behind the falsifier, asserted directly rather
  // than merely observed: on resident ground home and market are the same rank,
  // so no verdict this walk can reach — conferred or refused, whatever grain
  // the caller resolved — is able to re-frame anything.
  const parcel = { id: "h/p", kind: "parcel", by: "holder", household: "holder", consent: { "g/rose": "welcomed" } };
  const idx = new Map([[parcel.id, parcel]]);
  const rose = { id: "g/rose", kind: "sited", by: "guest", household: "guest", _parentMarkId: "h/p" };
  const barrow = { ...rose, id: "g/barrow" };
  assert.equal(markStanding(rose, idx), "home");
  assert.equal(markStanding(barrow, idx), "market");
  assert.equal(standingRank(rose, idx), standingRank(barrow, idx), "different standing, identical rank");
  assert.equal(standingRank(rose, idx), TIER_RANK.market);
});

// ── QUADRANT 1: blue in yellow — a constitution mark inside a market claim ───
test("blue-in-yellow ANCHORS: the meadow cannot drag the river", () => {
  // A resident's meadow filed around one reach of the town's own river. The
  // reach outranks it, so the reach's numbers are the world's.
  const MEADOW = { path: `${R}/the-meadow`, fm: mark("market", { x: 1000, y: 1000 }, { w: 400, h: 400 }) };
  const REACH = { path: `${R}/the-meadow/the-reach`, fm: mark("constitution", { x: 1000, y: 1000 }, { w: 100, h: 20 }, { by: "the-town" }) };
  withTree([THE_ROOT, MEADOW, REACH], (dir) => {
    const m = by(dir);
    assert.deepEqual(m["the-town/the-reach"]._origin, { x: 0, y: 0 }, "framed by the world, not by the meadow");
    assert.deepEqual(m["the-town/the-reach"].at, { x: 1000, y: 1000 }, "so its file numbers ARE its world numbers");
    assert.deepEqual(m["t/the-meadow"]._origin, { x: 0, y: 0 }, "…while the meadow itself stands on open ground");
  });

  // THE POINT OF THE WHOLE LAW: move the meadow, and the reach does not follow.
  const MOVED = { ...MEADOW, fm: { ...MEADOW.fm, at: { x: 9000, y: 9000 } } };
  withTree([THE_ROOT, MOVED, REACH], (dir) => {
    const m = by(dir);
    assert.deepEqual(m["t/the-meadow"].at, { x: 9000, y: 9000 }, "the meadow went where its author put it");
    assert.deepEqual(m["the-town/the-reach"].at, { x: 1000, y: 1000 }, "and the river stayed exactly where it was");
  });

  // …and the edge that used to "lie" now says NOTHING. The meadow no longer
  // contains the reach, and until 2026-08-25 that was a finding — a re-home the
  // save performed on the author's behalf. The freeze repealed the claim the
  // finding rested on (LOGOS/state-and-time.md § The freeze):
  //
  //   "The directory-matches-containment law is REPEALED — the tree's paths make
  //    no assertion, so nothing about them can become false."
  //
  // Both trees below are the same tree to the gate. The reach's POSITION is what
  // this test was ever really protecting, and it is asserted above, unchanged.
  withTree([THE_ROOT, MOVED, REACH], (dir) => {
    const out = runLint(dir);
    assert.equal(out.errors, 0, "nobody is refused for it");
    assert.equal(out.code, 0, "and nothing is asked for either — a path makes no assertion to be wrong about");
    assert.equal(out.findings.length, 0, "the gate has no opinion at all about where this is filed");
  });

  // While the meadow still contains it, the same filing reads exactly the same
  // — which is the content of "static": the verdict does not depend on geometry
  // that moves around a mark while its author sleeps.
  withTree([THE_ROOT, MEADOW, REACH], (dir) => {
    const out = runLint(dir);
    assert.equal(out.code, 0, "clean, as before");
    assert.equal(out.findings.length, 0);
  });
});

// ── QUADRANT 2: yellow in yellow — resident ground inside resident ground ────
// This used to be read as "market inside sovereignty binds because sovereignty
// outranks". Under the one-walk truth the house's `tier: sovereignty` line says
// nothing at all — both stand at market, and EQUAL RANKS BIND. Same answer, and
// now for the reason that survives a resident writing anything they like.
test("yellow-in-yellow is BOUND: it rides its parent, and since the freeze an edge cannot lie", () => {
  const HOUSE = { path: `${R}/the-house`, fm: mark("sovereignty", { x: 500, y: 500 }, { w: 100, h: 100 }) };
  const LAMP = { path: `${R}/the-house/the-lamp`, fm: mark("market", { x: 10, y: -5 }, { w: 2, h: 2 }) };
  withTree([THE_ROOT, HOUSE, LAMP], (dir) => {
    const m = by(dir);
    assert.deepEqual(m["t/the-lamp"]._origin, { x: 500, y: 500 }, "both stand at market on resident ground, and equal ranks bind");
    assert.deepEqual(m["t/the-lamp"].at, { x: 510, y: 495 }, "and the lamp's numbers are an offset from it");
  });
  withTree([THE_ROOT, { ...HOUSE, fm: { ...HOUSE.fm, at: { x: 800, y: 800 } } }, LAMP], (dir) => {
    assert.deepEqual(by(dir)["t/the-lamp"].at, { x: 810, y: 795 }, "the lamp rode with the house, on the record, with no sweep");
  });

  // A bound child whose numbers put it far outside its container used to be a
  // refusal: the edge asserted containment and the geometry contradicted it, and
  // the machinery was not allowed to pick a side. Since the freeze the edge
  // asserts nothing, so there is no contradiction to refuse — "A mark's
  // directory is its historical filing: it carries no claim, and it never moves
  // again."
  //
  // WHAT SURVIVES IS THE ARITHMETIC, and it is the half that was always real: the
  // lamp is still framed on the house, so its file numbers still compose against
  // the house's centre. Filing frames; it does not claim.
  withTree([
    THE_ROOT,
    HOUSE,
    { path: `${R}/the-house/the-lamp`, fm: mark("market", { x: 9000, y: 9000 }, { w: 2, h: 2 }) },
  ], (dir) => {
    const out = runLint(dir);
    assert.equal(out.code, 0, "not refused — a path makes no assertion that geometry can contradict");
    assert.equal(out.findings.length, 0, "and nothing is reported about the filing at all");
    const m = by(dir);
    assert.deepEqual(m["t/the-lamp"]._origin, { x: 500, y: 500 }, "still framed on the house it is filed in");
    assert.deepEqual(m["t/the-lamp"].at, { x: 9500, y: 9500 }, "so the digits still compose against that centre");
  });
});

// ── the parked mark, after the freeze ────────────────────────────────────────
// the-town/the-parked said the save re-homed a root-parked mark "by geometry,
// numbers re-framed, so the mark does not move." The freeze deleted the mover
// (LOGOS/state-and-time.md § The freeze):
//
//   "The re-home pass is DELETED from the settlement save. The settlement writes
//    a mark once; nothing moves it after."
//
// So a parked mark stays parked. It stands on the house's ground and is filed
// beside it, and those two facts simply stop being the same question: the ground
// is answered by the fold (WORLD/containment.json), the filing by the tree, and
// neither is asked to agree with the other.
test("a ROOT-PARKED mark on someone's ground stays where it was parked — the door parks, and nothing files it afterwards", () => {
  const HOUSE = { path: `${R}/the-house`, fm: mark("sovereignty", { x: 500, y: 500 }, { w: 100, h: 100 }) };
  const CUP = { path: `${R}/the-cup`, fm: mark("market", { x: 510, y: 495 }, { w: 1, h: 1 }) };
  withTree([THE_ROOT, HOUSE, CUP], (dir) => {
    const out = runLint(dir);
    assert.equal(out.code, 0, "clean — nothing is refused and nothing is asked for");
    assert.equal(out.findings.length, 0, "no repair is offered, because there is no mover left to perform one");
    // the ground still says exactly what it always said; only the paper stopped
    // being obliged to say it too
    const m = by(dir);
    assert.equal(placementParent(m["t/the-cup"], Object.values(m)), "t/the-house",
      "the cup stands on the house's ground — which is the fold's answer now, not the tree's");
    assert.equal(m["t/the-cup"]._parentMarkId, "the-town/let-there-be-light",
      "…and it is still filed where the door parked it");
  });
});

// ── QUADRANT 3: blue in blue — equal ranks bind ──────────────────────────────
test("blue-in-blue is BOUND: the wheelhouse rides the Post Office, and the Centre's three children bind", () => {
  // The live tree, not a fixture: equal tiers bind, so the whole constitution
  // spine still composes down the directory chain exactly as it did before the
  // rule. If `>=` were ever weakened to `>`, every one of these would anchor at
  // the world origin and the town would come apart at the quay.
  const m = by(join(ROOT, "WORLD/marks"));
  const rides = (child, parent) => {
    assert.equal(m[child].tier, "constitution", `${child} is constitution`);
    assert.equal(m[parent].tier, "constitution", `${parent} is constitution`);
    assert.equal(m[child]._parentMarkId, parent, `${child} is filed in ${parent}`);
    assert.deepEqual(m[child]._origin, { x: m[parent].at.x, y: m[parent].at.y }, `${child} is framed on ${parent}`);
  };
  rides("the-town/the-wheelhouse", "the-town/the-post-office");
  rides("the-town/the-post-office", "the-town/the-quay-reach");
  rides("the-town/the-quay-reach", "the-town/the-town-centre");
  rides("the-town/the-town-centre", "the-town/let-there-be-light");
  // the three the Centre's own raise settles — blue-in-blue rather than outranking
  for (const child of ["the-town/the-bounty-board", "the-town/the-keeping-works", "the-town/the-quay-reach"])
    rides(child, "the-town/the-town-centre");
  // and the wheelhouse genuinely composes through four frames to one place
  // RE-PINNED 2026-08-22 (the region polygon ruling — Keemin, founder: "use
  // polygons to represent the regions so they fit based on the atlas"). The Town
  // Centre's claim was restated as its ring's bounding box and its centre moved
  // -75,-75 -> -12,-25; the wheelhouse rides that move through four frames, which
  // is this test's whole point rather than a break in it. Its FILE numbers are
  // untouched below — the boat is still written where it stands — so if the chain
  // ever came apart the composed value would stop tracking the Centre and this
  // pin would break for the reason it exists.
  // RE-PINNED AGAIN 2026-08-24 (the pure-trace pivot): the bends came out, the
  // Centre's claim is now its unbent wash's bbox, and its centre moved
  // -12,-25 -> -58.5,-17.5. The wheelhouse rides that move through four frames,
  // which is this test's point rather than a break in it — the FILE numbers
  // below are untouched, so a chain that came apart would stop tracking the
  // Centre and this pin would break for the reason it exists.
  assert.deepEqual(m["the-town/the-wheelhouse"].at, { x: -9, y: 34.5 });
  assert.deepEqual(m["the-town/the-wheelhouse"]._fileAt, { x: 0, y: -1 }, "written where it stands, on the boat");
});

// ── the fox-hearth pattern, INVERTED by the one-walk truth ───────────────────
// Three residents wrote `tier: sovereignty` on their houses, and under the old
// reading that made each house outrank the parcel it stands on: its own fence
// could not frame it, so it anchored to the world. That was the mis-binding the
// 08-12 ruling names. A house on its own ground binds to it now, and rides when
// the ground moves — which is the whole content of "your own parcel is yours".
test("a home on its own parcel BINDS to it: the fence frames the house and carries it", () => {
  const m = by(join(ROOT, "WORLD/marks"));
  for (const [home, parcel] of [
    ["alden/the-fox-hearth", "alden/the-fox-hearth-parcel"],
    ["ellery/the-level", "ellery/the-level-parcel"],
    ["corwin/the-margin", "corwin/the-margin-parcel"],
  ]) {
    assert.equal(m[home]._parentMarkId, parcel);
    assert.equal(standingRank(m[home], new Map()), standingRank(m[parcel], new Map()),
      `${home} and its fence stand at the same rank whatever either record says`);
    assert.deepEqual(m[home]._origin, { x: m[parcel].at.x, y: m[parcel].at.y }, `${home} is framed on its own parcel`);
    assert.deepEqual(m[home]._fileAt, { x: 0, y: 0 }, "…and its numbers say where it sits on that ground: the middle");
    assert.deepEqual(m[home].at, m[parcel].at, "which composes to exactly where it always stood");
  }
  // A parcel relocation is "replace, not add" (the fold's own rule), so the
  // interesting case is the fixture: move the fence, and the house comes along.
  const PARCEL = { path: `${R}/the-parcel`, fm: { ...mark("market", { x: 200, y: 200 }, { w: 25, h: 25 }), kind: "parcel" } };
  const HOME = { path: `${R}/the-parcel/the-hearth`, fm: mark("sovereignty", { x: 0, y: 0 }, { w: 4, h: 4 }) };
  withTree([THE_ROOT, PARCEL, HOME], (dir) => {
    assert.deepEqual(by(dir)["t/the-hearth"].at, { x: 200, y: 200 });
  });
  withTree([THE_ROOT, { ...PARCEL, fm: { ...PARCEL.fm, at: { x: 7000, y: 7000 } } }, HOME], (dir) => {
    assert.deepEqual(by(dir)["t/the-hearth"].at, { x: 7000, y: 7000 },
      "the fence moved and the hearth moved with it — and the `tier: sovereignty` on its record bought it nothing");
  });
});

test("a TOP-LEVEL mark a new claim grows around is left alone — nobody's paper moves when somebody else builds", () => {
  // The likeliest case there is, and the one that generated most of the friction
  // the freeze was called to end: the town's reach stands on open ground, filed
  // under the root because nothing contained it. A resident then files a meadow
  // around it. Nothing about the reach has changed — its author did nothing, was
  // not consulted, and was asleep — and yet the gate used to have an opinion
  // about its directory, and the save used to act on that opinion.
  //
  // The founder's ruling ends the whole class (LOGOS/state-and-time.md § The
  // freeze): "A mark's directory is its historical filing: it carries no claim,
  // and it never moves again." A neighbour's lawful claim can no longer produce
  // any finding at all against a mark that did not move.
  const REACH = { path: `${R}/the-reach`, fm: mark("constitution", { x: 1000, y: 1000 }, { w: 100, h: 20 }, { by: "the-town" }) };
  const MEADOW = { path: `${R}/the-meadow`, fm: mark("market", { x: 1000, y: 1000 }, { w: 400, h: 400 }) };
  withTree([THE_ROOT, REACH], (dir) => {
    assert.equal(runLint(dir).code, 0, "on open ground with nothing around it, clean");
  });
  withTree([THE_ROOT, REACH, MEADOW], (dir) => {
    const out = runLint(dir);
    assert.equal(out.errors, 0, "the resident's meadow is lawful and nobody is bounced for it");
    assert.equal(out.code, 0, "…and the reach's author is not asked for anything either");
    assert.equal(out.findings.length, 0, "the meadow arriving is not an event in the reach's life");
    assert.deepEqual(by(dir)["the-town/the-reach"]._origin, { x: 0, y: 0 }, "and the reach is framed by the world, before and after");
  });
  // The second arm is the same fact for a mark the new container WOULD bind.
  // This one used to refuse outright ("the numbers genuinely change meaning, and
  // somebody has to say so"), then became a re-home under the-town/the-parked.
  // It is now neither: nothing moves it, so nothing has to decide anything.
  withTree([
    THE_ROOT,
    { path: `${R}/the-cottage`, fm: mark("market", { x: 1000, y: 1000 }, { w: 20, h: 20 }) },
    { path: `${R}/the-district`, fm: mark("constitution", { x: 1000, y: 1000 }, { w: 400, h: 400 }, { by: "the-town" }) },
  ], (dir) => {
    const out = runLint(dir);
    assert.equal(out.code, 0, "not refused, and not repaired — the settlement writes a mark once; nothing moves it after");
    assert.equal(out.findings.length, 0);
    assert.deepEqual(by(dir)["t/the-cottage"].at, { x: 1000, y: 1000 },
      "and the cottage's world position is exactly what its author wrote — no re-framing ever happens to it");
  });
});

// ── the one refusal ──────────────────────────────────────────────────────────
test("a predicate cannot outrank what it predicates — refused, and it is the gate's only word about a nesting now", () => {
  withTree([
    THE_ROOT,
    { path: `${R}/the-yard`, fm: mark("market", { x: 300, y: 300 }, { w: 50, h: 50 }) },
    { path: `${R}/the-yard/the-law`, fm: {
      kind: "predicated", by: "the-town", tier: "constitution", date: "2026-08-11", slot: "mood", value: "quiet",
    } },
  ], (dir) => {
    const out = runLint(dir);
    assert.equal(out.code, 1, "refused");
    const found = out.findings.find((f) => /a predicate cannot outrank what it predicates/.test(f.msg));
    assert.ok(found, `the refusal names itself:\n${out.findings.map((f) => f.msg).join("\n")}`);
    assert.equal(found.sev, "ERROR");
    assert.match(found.msg, /it is its parent continued/);
  });
  // an equal-tier predicate is fine — it is the OUTRANKING that is impossible
  withTree([
    THE_ROOT,
    { path: `${R}/the-yard`, fm: mark("market", { x: 300, y: 300 }, { w: 50, h: 50 }) },
    { path: `${R}/the-yard/the-mood`, fm: {
      kind: "predicated", by: "t", date: "2026-08-11", slot: "mood", value: "quiet",
    } },
  ], (dir) => {
    assert.equal(runLint(dir).code, 0);
  });
});

test("a predicate is still walked past by a positioned mark beneath it, whatever tier it wears", () => {
  // The continuation exemption is about the frame, not about the lint: the
  // loader must not refuse to place a mark just because a predicate stands in
  // its chain. (The lint separately forbids this nesting; the loader still owes
  // an answer when it meets one.)
  withTree([
    THE_ROOT,
    { path: `${R}/the-house`, fm: mark("constitution", { x: 400, y: 400 }, { w: 60, h: 60 }, { by: "the-town" }) },
    { path: `${R}/the-house/the-law`, fm: { kind: "predicated", by: "the-town", tier: "constitution", date: "2026-08-11", slot: "mood", value: "quiet" } },
    { path: `${R}/the-house/the-law/the-lamp`, fm: mark("market", { x: 3, y: 4 }, { w: 1, h: 1 }) },
  ], (dir) => {
    const m = by(dir);
    assert.deepEqual(m["the-town/the-law"]._origin, { x: 400, y: 400 }, "the predicate carries its parent's centre");
    assert.deepEqual(m["t/the-lamp"]._origin, { x: 400, y: 400 }, "and the lamp is framed on the house past it");
    assert.deepEqual(m["t/the-lamp"].at, { x: 403, y: 404 });
  });
});

test("the walk keeps climbing past a parent that does not bind, to the first ancestor that does", () => {
  // Two resident layers between the town's own reach and the constitution root:
  // neither binds it, so it lands on the world and not on the nearer of the two.
  // The outranking child has to be the TOWN's now — a resident cannot reach this
  // shape by writing a word on their record, which is the point of the ruling.
  withTree([
    THE_ROOT,
    { path: `${R}/outer`, fm: mark("market", { x: 100, y: 100 }, { w: 400, h: 400 }) },
    { path: `${R}/outer/inner`, fm: mark("market", { x: 120, y: 120 }, { w: 200, h: 200 }) },
    { path: `${R}/outer/inner/the-reach`, fm: mark("constitution", { x: 150, y: 150 }, { w: 10, h: 10 }, { by: "the-town" }) },
  ], (dir) => {
    assert.deepEqual(by(dir)["the-town/the-reach"]._origin, { x: 0, y: 0 });
    assert.deepEqual(by(dir)["the-town/the-reach"].at, { x: 150, y: 150 });
  });
  // …and the same two layers do bind a RESIDENT's mark, however it is labelled:
  // it rides the nearest one, because on resident ground every rank is equal.
  withTree([
    THE_ROOT,
    { path: `${R}/outer`, fm: mark("market", { x: 100, y: 100 }, { w: 400, h: 400 }) },
    { path: `${R}/outer/inner`, fm: mark("market", { x: 120, y: 120 }, { w: 200, h: 200 }) },
    { path: `${R}/outer/inner/the-home`, fm: mark("sovereignty", { x: 30, y: 30 }, { w: 10, h: 10 }) },
  ], (dir) => {
    assert.deepEqual(by(dir)["t/the-home"]._origin, { x: 220, y: 220 }, "framed on `inner`, the nearest layer");
    assert.deepEqual(by(dir)["t/the-home"].at, { x: 250, y: 250 });
  });
  // and a binding ancestor ABOVE a non-binding one is found and used
  withTree([
    THE_ROOT,
    { path: `${R}/the-district`, fm: mark("constitution", { x: 100, y: 100 }, { w: 400, h: 400 }, { by: "the-town" }) },
    { path: `${R}/the-district/the-yard`, fm: mark("market", { x: 20, y: 20 }, { w: 200, h: 200 }) },
    { path: `${R}/the-district/the-yard/the-cairn`, fm: mark("constitution", { x: 5, y: 5 }, { w: 4, h: 4 }, { by: "the-town" }) },
  ], (dir) => {
    const m = by(dir);
    assert.deepEqual(m["t/the-yard"].at, { x: 120, y: 120 }, "the yard is bound by the district");
    assert.deepEqual(m["the-town/the-cairn"]._origin, { x: 100, y: 100 }, "the cairn skipped the yard and took the district");
    assert.deepEqual(m["the-town/the-cairn"].at, { x: 105, y: 105 }, "…which is NOT the yard's 125,125");
  });
});

// ── THE FALSIFIER: one crossing at a time (WLD-101, 2026-10-21) ─────────────
//
// Everything above says what the rule MEANS. This says the frame law moves
// nothing nobody touched, over the real world, and it is allowed to answer "it
// moved the world".
//
// Two real programs over two real trees, the discipline of
// tools/coords-equivalence.mjs: the tree BEFORE the newest crossing, loaded by
// its own tools/marks-fold.mjs (extracted read-only at that commit), against
// this tree loaded with these tools. Neither side is a transcription.
//
// The invariant, and the whole of it: a mark whose own file is the same on both
// sides, and whose frame chain holds no file that changed, composes to the same
// position, on the same frame, standing on the same ground. A mark whose file
// changed was changed by an act (a move by its author, a take, a withdrawal, a
// re-file, a crossing's publication), and that act's own gates judge it, so no
// list here has to know the act exists. A mark whose FRAME changed rides that
// act, and on an unchanged frame it must move by exactly the frame's delta.
//
// It used to compare today's tree with the 2026-08-11 one, the commit before the
// tier binding, and it carried six hand lists of every mark that had lawfully
// changed since. Each new lawful verb turned a crossing red until it had its own
// clause. The merge it gated landed in August; this is the invariant it kept,
// asked of one crossing (snapshot per settlement, compute only the delta). Its
// neighbours still guard the frame law over the whole tree:
// reparent-keep-world (frames leave and return, nothing else moves),
// geometry-parity (the store and the loader agree), position-law, and mark-lint
// gate A.

// One side of a crossing: its loaded records, each record's own file as
// written, and that side's answer to "whose ground is this standing on".
const sideOf = (marks, placement) => ({
  marks,
  text: (m) => readFileSync(join(m._dir, "mark.md"), "utf8").replace(/\r\n/g, "\n"),
  ground: (m) => placement(m, marks),
});

// The comparison, over two sides. Returns what moved that nobody moved.
function crossingFindings(before, after) {
  const A = new Map(before.marks.map((m) => [m.id, m]));
  const B = new Map(after.marks.map((m) => [m.id, m]));
  const changed = new Set();
  for (const id of new Set([...A.keys(), ...B.keys()]))
    if (!A.has(id) || !B.has(id) || before.text(A.get(id)) !== after.text(B.get(id))) changed.add(id);
  // the marks a record's numbers are written against, nearest first (`_frameId`)
  const chainOf = (map, id) => {
    const out = [], seen = new Set([id]);
    for (let f = map.get(id)?._frameId; f && !seen.has(f); f = map.get(f)?._frameId) { out.push(f); seen.add(f); }
    return out;
  };
  const rides = (id) => [...chainOf(A, id), ...chainOf(B, id)].some((f) => changed.has(f));
  const touched = (id) => id != null && (changed.has(id) || rides(id));
  const at = (m) => (m.at ? `${m.at.x},${m.at.y}` : "no position");
  const shape = (m) => JSON.stringify({ extent: m.extent ?? null, points: m.points ?? null });

  const findings = [];
  let untouched = 0, riders = 0;
  for (const [id, a] of A) {
    if (changed.has(id)) continue;
    const b = B.get(id);
    if (rides(id)) {
      riders++;
      if (a._frameId === b._frameId && a.at && b.at && a._origin && b._origin) {
        const dx = b.at.x - a.at.x, dy = b.at.y - a.at.y;
        const fx = b._origin.x - a._origin.x, fy = b._origin.y - a._origin.y;
        if (dx !== fx || dy !== fy) findings.push(`${id}: rode ${a._frameId} but moved ${dx},${dy}, not the frame's ${fx},${fy}`);
      }
      continue;
    }
    untouched++;
    if (at(a) !== at(b)) findings.push(`${id}: moved ${at(a)} -> ${at(b)}`);
    else if (shape(a) !== shape(b)) findings.push(`${id}: its extent or ring changed`);
    if ((a._frameId ?? null) !== (b._frameId ?? null)) findings.push(`${id}: re-framed ${a._frameId ?? "the world"} -> ${b._frameId ?? "the world"}`);
    if (!a.at || !b.at) continue;
    // a ground that changed, appeared or left is that act's to judge
    const ga = before.ground(a), gb = after.ground(b);
    if (ga !== gb && !touched(ga) && !touched(gb)) findings.push(`${id}: ground ${ga ?? "the root"} -> ${gb ?? "the root"}`);
  }
  return { findings, changed: changed.size, untouched, riders };
}

// The two halves of the check on fixtures, so each run shows it can fail.
const crossingTrees = (before, after, fn) => {
  const a = treeOf(before), b = treeOf(after);
  try { return fn(loadMarks(a), loadMarks(b)); }
  finally { rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }); }
};
const HOUSE = { path: `${R}/the-house`, fm: mark("market", { x: 200, y: 200 }, { w: 40, h: 40 }) };
const CHAIR = { path: `${R}/the-house/the-chair`, fm: mark("market", { x: 2, y: 2 }, { w: 2, h: 2 }) };
const STONE = { path: `${R}/the-stone`, fm: mark("market", { x: 500, y: 500 }, { w: 2, h: 2 }, { by: "u" }) };
const LAMP = { path: `${R}/the-lamp`, fm: mark("market", { x: 600, y: 600 }, { w: 2, h: 2 }) };
const CUP = { path: `${R}/the-cup`, fm: mark("market", { x: 700, y: 700 }, { w: 1, h: 1 }) };
const BEFORE = [THE_ROOT, HOUSE, CHAIR, STONE, LAMP, CUP];

test("the falsifier CAN fail: a mark nobody touched that moves, re-frames or changes ground is a finding", () => {
  crossingTrees(BEFORE, BEFORE, (A, B) => {
    const clean = crossingFindings(sideOf(A, placementParent), sideOf(B, placementParent));
    assert.deepEqual(clean.findings, [], "the same tree on both sides moves nothing");
    assert.equal(clean.changed, 0);

    // the after side composes an untouched mark somewhere else, its file the same
    const stone = B.find((m) => m.id === "u/the-stone");
    stone.at = { x: stone.at.x + 1, y: stone.at.y };
    const moved = crossingFindings(sideOf(A, placementParent), sideOf(B, placementParent));
    assert.equal(moved.findings.length, 1);
    assert.match(moved.findings[0], /^u\/the-stone: moved /);
    stone.at = { x: stone.at.x - 1, y: stone.at.y };

    // …or frames it on another mark
    const frame = stone._frameId;
    stone._frameId = "t/the-house";
    assert.deepEqual(crossingFindings(sideOf(A, placementParent), sideOf(B, placementParent)).findings,
      [`u/the-stone: re-framed ${frame} -> t/the-house`]);
    stone._frameId = frame;

    // …or answers that it stands on other ground, though nothing near it changed
    const elsewhere = (m, ms) => (m.id === "u/the-stone" ? "t/the-house" : placementParent(m, ms));
    assert.deepEqual(crossingFindings(sideOf(A, placementParent), sideOf(B, elsewhere)).findings,
      ["u/the-stone: ground the root -> t/the-house"]);
  });
});

test("the falsifier passes a mark whose own file changed: a move by its author, a take, and what rides or stands on them", () => {
  const RUG = { path: `${R}/the-rug`, fm: mark("market", { x: 500, y: 500 }, { w: 10, h: 10 }, { by: "v", date: "2026-10-21" }) };
  const after = [
    THE_ROOT,
    // the author moves the house, and the chair (same household, its file untouched) rides it
    { ...HOUSE, fm: { ...HOUSE.fm, at: { x: 260, y: 230 }, date: "2026-10-21" } },
    CHAIR,
    STONE,
    // the author moves the lamp
    { ...LAMP, fm: { ...LAMP.fm, at: { x: 640, y: 600 }, date: "2026-10-21" } },
    // a resident takes the cup: it rides its holder and has no position of its own
    { ...CUP, fm: (({ at, extent, ...rest }) => ({ ...rest, held_by: "u", date: "2026-10-21" }))(CUP.fm) },
    // a new mark is published over the stone, so the stone's ground is new
    RUG,
  ];
  crossingTrees(BEFORE, after, (A, B) => {
    const r = crossingFindings(sideOf(A, placementParent), sideOf(B, placementParent));
    assert.deepEqual(r.findings, []);
    assert.equal(r.changed, 4, "the house, the lamp, the cup and the rug");
    assert.equal(r.riders, 1, "the chair rode the house");
    const chairA = A.find((m) => m.id === "t/the-chair"), chairB = B.find((m) => m.id === "t/the-chair");
    assert.deepEqual([chairB.at.x - chairA.at.x, chairB.at.y - chairA.at.y], [60, 30], "by exactly the house's move");
    assert.equal(placementParent(B.find((m) => m.id === "u/the-stone"), B), "v/the-rug", "the stone stands on the new rug, which judged itself");

    // a rider that does not move by its frame's delta is still a finding
    chairB.at = { x: chairB.at.x + 1, y: chairB.at.y };
    assert.match(crossingFindings(sideOf(A, placementParent), sideOf(B, placementParent)).findings.join("\n"),
      /t\/the-chair: rode t\/the-house but moved 61,30, not the frame's 60,30/);
  });
});

test("THE FALSIFIER: across the newest crossing, every mark nobody touched composes to exactly where it stood, on the same ground", async (t) => {
  const git = (...a) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8" }).trim();
  // The newest crossing is the newest sweep commit. On the box the suite runs
  // over the sweep's working tree before it commits (the before side is then
  // the parent of the previous crossing, and this crossing is in the working
  // tree) and again after (HEAD is the crossing). Either way the delta read is
  // bounded and holds the crossing.
  const crossing = git("log", "-1", "--format=%H", "--grep=^settlement: sweep", "HEAD");
  assert.ok(crossing, "the newest crossing must be findable; without it there is no before side");
  const refSha = git("rev-parse", `${crossing}^`);
  const scratch = mkdtempSync(join(tmpdir(), "tier-falsifier-"));
  try {
    execFileSync("git", ["-C", ROOT, "archive", "-o", join(scratch, "ref.tar"), refSha, "WORLD/marks", "tools"]);
    execFileSync("tar", ["-xf", "ref.tar"], { cwd: scratch });
    const old = await import(pathToFileURL(join(scratch, "tools/marks-fold.mjs")).href);
    const A = old.loadMarks(join(scratch, "WORLD/marks")).filter((m) => !m._error);
    const B = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
    assert.ok(A.length >= 600 && B.length >= 600, `the real tree, not a fixture (${A.length} before, ${B.length} after)`);

    const r = crossingFindings(sideOf(A, old.placementParent), sideOf(B, placementParent));
    t.diagnostic(`before ${refSha.slice(0, 8)} (the crossing ${crossing.slice(0, 8)}'s parent): ${r.changed} changed, ${r.riders} rode a change, ${r.untouched} untouched`);
    assert.ok(r.untouched > 300, `enough untouched records to be worth checking (${r.untouched})`);
    assert.deepEqual(r.findings, [], `${r.findings.length} mark(s) nobody touched moved, re-framed or changed ground`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("the live tree lints clean, under the freeze, with no loader/law disagreement", () => {
  // --freeze is passed explicitly because --marks-dir points the gate at a tree
  // rather than at a repo, and the freeze manifest is a fact about THIS repo.
  // Passing it is the point: the live tree is held to its own fossil boundary
  // here, not merely to the schema.
  const out = runLint(join(ROOT, "WORLD/marks"), join(ROOT, "WORLD/filing-freeze.json"));
  assert.equal(out.errors, 0, JSON.stringify(out.findings.filter((f) => f.sev === "ERROR"), null, 2));
  assert.equal(out.code, 0);
  assert.ok(out.marks >= 600, `the real tree (${out.marks} marks)`);
});
