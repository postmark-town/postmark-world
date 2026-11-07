// click-in-extent-still-walks.test.mjs — play fix 38 (Darko, playground
// 2026-10-15 19:55): a click inside a mark's ground selects that mark (its
// column opens) AND arms the walk to the EXACT point clicked, as ruled at 18:03.
// Fix 22 let the walk slip; this holds both halves.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapClickPlan, pointWalkDestination, smallestContainingMark } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
// the Spire's Forecourt inside its Grounds, as the playground's record has them
const grounds = { id: "darko/starforge-spire-grounds", kind: "sited", at: { x: 3850, y: -5500 }, extent: { w: 500, h: 400 } };
const forecourt = { id: "darko/spire-forecourt", kind: "sited", at: { x: 3700.5, y: -5500 }, extent: { w: 152.5, h: 280 } };
const marks = [grounds, forecourt];

test("WALK ARMED, a click inside a mark: the walk goes to the click point exactly, and the mark is selected", () => {
  const click = { x: 3651, y: -5413 };   // well inside the Forecourt, far from its centre
  const ground = smallestContainingMark(click, marks);
  assert.equal(ground, "darko/spire-forecourt", "the innermost mark under the click");
  const plan = mapClickPlan({ point: click, ground, acting: true, arming: "walk" });
  assert.equal(plan.select, "darko/spire-forecourt", "its column opens");
  assert.deepEqual(plan.walkTo, click, "and the walk is armed to the click point");
  // the destination the page arms from that point is the point, named by the mark it is in
  const destination = pointWalkDestination(plan.walkTo, marks);
  assert.deepEqual({ x: destination.x, y: destination.y }, click, "never the mark's centre");
  assert.notDeepEqual({ x: destination.x, y: destination.y }, forecourt.at);
  assert.equal(destination.inside, "darko/spire-forecourt");
});

test("not armed, the same click does the same: select and walk to the point", () => {
  const click = { x: 3990.4, y: -5600.6 };
  const plan = mapClickPlan({ point: click, ground: smallestContainingMark(click, marks), acting: true, arming: null });
  assert.equal(plan.select, "darko/starforge-spire-grounds");
  assert.deepEqual(plan.walkTo, { x: 3990, y: -5601 }, "rounded to the metre the walk door takes, nothing more");
});

test("a spectator only selects; a half-begun stake keeps its own question; a hung picture is the mark's ground", () => {
  const click = { x: 3651, y: -5413 };
  assert.deepEqual(mapClickPlan({ point: click, ground: "darko/spire-forecourt", acting: false }), { select: "darko/spire-forecourt", walkTo: null });
  assert.deepEqual(mapClickPlan({ point: click, ground: "darko/spire-forecourt", acting: true, arming: "stake" }), { select: null, walkTo: click },
    "the stake still waits for its mark; the walk is not swallowed");
  assert.equal(mapClickPlan({ point: click, ground: null, area: "the-town/the-headland", acting: true }).select, "the-town/the-headland",
    "outside any smaller ground, the hung picture's own mark");
  assert.equal(mapClickPlan({ point: click, ground: "darko/spire-forecourt", area: "the-town/the-headland", acting: true }).select, "darko/spire-forecourt",
    "the innermost ground wins over the picture around it");
  assert.deepEqual(mapClickPlan({ point: { x: "?" } }), { select: null, walkTo: null });
});

test("[pin] the page: the plan drives the click; the column's ✕ and its relatives leave the walk standing; the point stays in sight", () => {
  assert.match(SOURCE, /const plan = mapClickPlan\(\{\s*point, acting: canAct\(\), arming: state\.arming, area: areaHit,/);
  assert.match(SOURCE, /if \(plan\.walkTo\) \{ chooseWalkPoint\(plan\.walkTo\.x, plan\.walkTo\.y\); keepDestinationClear\(\); \}/);
  assert.match(SOURCE, /const areaHit = markId && canAct\(\) && candidates\.find\(\(c\) => c\.id === markId\)\?\.area \? markId : null;/, "a hung picture is ground, not a pip");
  assert.match(SOURCE, /if \(e\.target\.closest\("\.wv-homecol-close"\)\) \{ bubbleTrail = \[\]; markInteraction\.select\(null\); return; \}/, "closing the column keeps the walk");
  assert.doesNotMatch(SOURCE, /\.wv-bubble-close, \.wv-homecol-close"\)\) \{ clearSelectionAndDestination/, "it no longer clears the destination");
  assert.match(SOURCE, /selectMark\(id, \{ trail: bubbleTrailStep\(bubbleTrail, "follow", id\), keepWalk: true \}\)/, "a relative read in the column does not re-aim the walk");
  assert.match(SOURCE, /if \(canAct\(\) && !keepWalk\) \{/);
  assert.match(SOURCE, /function keepDestinationClear\(\) \{/, "the armed point is panned clear of the column");
});

test("[pin] a refused walk is said where it can be seen, and a road into the wall is not 'already there'", () => {
  const fn = SOURCE.match(/function showWalkRefusal\(message\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(fn, /walkNote\(answer\);/, "the desk is hidden (fix 20); the note says it, in red");
  assert.match(SOURCE, /const wall = departure\?\.leg\?\.mistRefused;/);
  assert.match(SOURCE, /the mist is too thick to walk into — this road runs into the wall of the Mists at/, "the office's own words (world.mjs § mistsRefusal)");
});
