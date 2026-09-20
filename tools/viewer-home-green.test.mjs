// viewer-home-green.test.mjs — GREEN IS THE FOLD'S WORD, AND NOBODY ELSE'S.
//
// The rule (postmark#3025, 2026-09-20). `seeding/manifest.json` was a July build
// intermediate — 88 households read off the atlas painting at 5 m/px, "Build
// intermediate, not world canon" by its own first line. The viewer fetched it
// and greened the household's named house and every same-household mark that
// house's footprint contained, whatever the record said about the ground they
// stood on. `current-the-reader/the-snug-harbour` stands on spar's doubled
// coast; the fold says MARKET; the page drew green and wrote `home`.
//
// So the manifest is deleted and the two halves of that are asserted here:
//
//   THE DEMAND — the viewer asks for no `/seeding/` record any more. This is
//   read off the viewer's own SOURCE TEXT rather than a list someone keeps,
//   because that is the channel the site's release gate uses too: it scans the
//   pinned viewer for same-origin record literals and stages exactly what it
//   finds, and fails the build for a demand the package cannot answer. A
//   quoted `/seeding/manifest.json` in this file is therefore not a leftover,
//   it is a broken release. (site `tools/lib/world-staging.mjs`.)
//
//   THE COLOUR — `buildHomeSet` is the fold's sovereigns and nothing else, and
//   `markStanding` decides the rest. Together those are `tierOf`.
//
// Both halves are RED against main: main's viewer carries the quoted literal
// and a `buildHomeSet` that takes the manifest. The flip proof in the lane's
// paperwork restores main's viewer into this tree and shows them fail.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { markStanding } from "./mark-standing.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VIEWER = readFileSync(join(ROOT, "spectator/viewer.mjs"), "utf8");

// `buildHomeSet` is imported DYNAMICALLY, and that is load-bearing rather than
// stylistic. A static `import { buildHomeSet } from "../spectator/viewer.mjs"`
// makes this whole file fail to PARSE against any viewer that does not export
// it — which is every viewer before this change. The flip proof then "went red"
// without running a single assertion: a module-load crash wearing a falsifier's
// clothes. Imported this way, each test below runs and fails on its own terms
// against main's viewer, which is the only kind of red that proves anything.
const viewerModule = () => import("../spectator/viewer.mjs");

// ---------------------------------------------------------------------------
// THE DEMAND
// ---------------------------------------------------------------------------

// The site gate's own shape: a quoted, absolute, same-origin path under a
// record root. Quote-anchored on purpose — prose about a path is not a demand
// for it, and neither is a template literal naming another host.
const RECORD_LITERAL = /["'](\/(?:WORLD|seeding)\/[A-Za-z0-9._\-/]+)["']/g;

// Comments stripped the way the gate strips them, so the long explanations in
// this repo's headers cannot be mistaken for demands. One alternation, in
// source order: `//` and `/*` are peers, not stages (site world-staging.mjs).
function withoutComments(src) {
  return src.replace(/(?<!:)\/\/[^\n]*|\/\*[\s\S]*?\*\//g, " ");
}

const demands = [...new Set([...withoutComments(VIEWER).matchAll(RECORD_LITERAL)].map((m) => m[1]))].sort();

test("the viewer demands no seeding record: green is not fetched any more", () => {
  const seeding = demands.filter((d) => d.startsWith("/seeding/"));
  assert.deepEqual(seeding, [],
    `the viewer still asks for ${seeding.join(", ")} — the release gate stages what the viewer demands, and the package no longer carries it`);
});

test("CONTROL — the demand scan can see the demands that are really there", () => {
  // If this goes empty the scan above is asserting nothing. The viewer reads
  // the skeleton and the fold from this origin and must keep doing so.
  assert.ok(demands.length >= 2, `the scan found ${demands.length} record demands; it should see the skeleton and the world-state at least — ${demands.join(", ")}`);
  assert.ok(demands.includes("/WORLD/skeleton.json"), `the skeleton demand is missing from ${demands.join(", ")}`);
});

// ---------------------------------------------------------------------------
// THE COLOUR
// ---------------------------------------------------------------------------

// A household with a parcel and a house standing ON it — the fold marks that
// house sovereign — and a second declared house of the same household standing
// somewhere else entirely, on another household's ground. The manifest named
// both as homes. Only one of them is one.
const spar = { id: "spar/the-doubled-coast", by: "spar", kind: "parcel", at: { x: 0, y: 5000 }, extent: { w: 2000, h: 2000 } };
const ownParcel = { id: "reader/reader-parcel", by: "reader", kind: "parcel", at: { x: 0, y: 0 }, extent: { w: 100, h: 100 } };
const onOwnGround = { id: "reader/the-house", by: "reader", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 20, h: 20 }, sovereign: true, _containedBy: ownParcel.id };
const offOwnGround = { id: "reader/the-snug-harbour", by: "reader", kind: "sited", at: { x: 0, y: 5000 }, extent: { w: 30, h: 22 }, _containedBy: spar.id };
const insideTheHarbour = { id: "reader/the-taproom", by: "reader", kind: "sited", at: { x: 0, y: 5000 }, extent: { w: 5, h: 5 }, _containedBy: offOwnGround.id };

const MARKS = [spar, ownParcel, onOwnGround, offOwnGround, insideTheHarbour];
const byId = new Map(MARKS.map((m) => [m.id, m]));

// The colour rule must be ASKABLE. It was an inner function of the mount
// closure for as long as it read `data.manifest`, and a rule nothing can put a
// question to is how a July painting outranked the record for two months.
async function homeGreen() {
  const mod = await viewerModule();
  assert.equal(typeof mod.buildHomeSet, "function",
    "spectator/viewer.mjs must export buildHomeSet — the colour rule is not askable otherwise");
  return mod.buildHomeSet;
}

// tierOf, as spectator/viewer.mjs composes it.
const tierWith = (buildHomeSet) => {
  const homeSet = buildHomeSet(MARKS);
  return (m) => (homeSet.has(m.id) ? "home" : markStanding(byId.get(m.id) ?? m, byId));
};

test("a declared house standing off its household's parcel is MARKET, not home", async () => {
  const tierOf = tierWith(await homeGreen());
  assert.equal(tierOf(offOwnGround), "market");
  assert.equal(tierOf(insideTheHarbour), "market", "and so is everything it contains — the badge travelled to them too");
});

test("a house standing ON its household's parcel is still HOME — nothing green was lost", async () => {
  const tierOf = tierWith(await homeGreen());
  assert.equal(tierOf(onOwnGround), "home");
});

test("buildHomeSet is the fold's sovereigns and nothing else", async () => {
  const buildHomeSet = await homeGreen();
  assert.deepEqual([...buildHomeSet(MARKS)].sort(), ["reader/the-house"]);
  assert.equal(buildHomeSet(MARKS.map(({ sovereign, ...rest }) => rest)).size, 0,
    "with no mark folded sovereign the set is empty — there is no second source of green");
});

test("CONTROL — the standing walk is what is answering, and it can say home", () => {
  // Without this, "market" everywhere would pass the two assertions above for
  // the wrong reason: a walk that answers market unconditionally.
  assert.equal(markStanding(onOwnGround, byId), "home");
  assert.equal(markStanding(offOwnGround, byId), "market");
});
