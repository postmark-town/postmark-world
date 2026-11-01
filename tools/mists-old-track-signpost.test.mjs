// mists-old-track-signpost.test.mjs — the old track is findable (WLD-6, Darko 2026-10-26 13:54: "revealing the path
// through the mists more clearly now that it's been discovered").
//
// Revelation only: the kept air (tools/world-engine.mjs § KEPT_AIR) is unchanged and is now exported so the office can
// NAME the track in its Mists refusal. One note mark stands at the track's north end, on the clear side of the wall,
// so `world { find: "old track" }` finds it and the World page names it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { KEPT_AIR, KEPT_AIR_SINCE, mistsAt, mistsHere } from "./world-engine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const marks = loadMarks(join(ROOT, "WORLD", "marks"));
const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD", "skeleton.json"), "utf8"));
const sign = marks.find((m) => m.id === "the-town/the-old-track");

test("the kept air is exported, and is exactly the two boxes it always was (nothing widened)", () => {
  assert.equal(KEPT_AIR_SINCE, 272);
  assert.deepEqual(KEPT_AIR, [
    { minX: 3690, maxX: 3770, minY: -5340, maxY: -3340 },
    { minX: 3690, maxX: 3912, minY: -5586, maxY: -5300 },
  ]);
});

test("the signpost is a the-town note whose slug and words are what `find: \"old track\"` matches", () => {
  assert.ok(sign, "the-town/the-old-track is filed");
  assert.match(String(sign.id), /old-track/);
  assert.match(JSON.stringify(sign), /old track runs south/);
  assert.match(JSON.stringify(sign), /20 m/);
});

test("it stands at the track's north end, on the clear side of the wall, outside the fringe", () => {
  const north = KEPT_AIR[0];
  const { x, y } = sign.at;
  assert.ok(x >= north.minX && x <= north.maxX, `x ${x} is within the track's width`);
  assert.ok(Math.abs(y - north.maxY) <= 50, `y ${y} is at the track's north end (${north.maxY})`);
  const last = skeleton.mists.schedule.at(-1).crossing;
  const m = mistsAt(last, skeleton.mists);
  const h = mistsHere({ x, y }, m);
  assert.equal(h.inWall, false, "never inside the wall");
  assert.ok(h.wallM > m.fringeM, `clear of the ${m.fringeM} m fringe (${h.wallM} m from the wall)`);
});
