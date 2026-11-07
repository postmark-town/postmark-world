// walk-shelter.test.mjs — play fix 45 (Darko, playground 2026-10-15 20:36): a
// resident who has entered the Spire's Grounds clicked inside them and the page
// refused the walk ("the mist is too thick") that the office would have taken.
// The page's walk preview asked the engine's mistsRoad with no shelter. It now
// hands it the walker's own shelter: the engine's shelterOf over their enter
// stack, exactly as the office's walk door does. Nothing of our own decides it.
// Run: node --test tools/walk-shelter.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveWalkPreview, previewWalkLeg } from "../spectator/viewer.mjs";
import { mistsAt, mistsHere } from "./world-engine.mjs";
import { shelterOf } from "./world-verbs.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
// the engine's own shelter fixture (mists-shelter.test.mjs): a 2 km map, the Mists in by crossing 10
const MISTS = {
  border_m: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
  fringe_m: 300, wall_sight_m: 20, density: { from: 0.9, to: 0.9 },
  schedule: [{ crossing: 10, front_m: 0, veil: 0.4 }],
};
const skeleton = { mists: MISTS };
// THE GROUNDS: out past the north border, in the wall
const GROUNDS = { id: "beyond/grounds", kind: "sited", household: "beyond", at: { x: 0, y: -1150 }, extent: { w: 300, h: 300 } };
const FROM = { x: 0, y: -1100 };     // standing inside the Grounds, in the wall
const CLICK = { x: 60, y: -1220 };   // another point inside the Grounds, also in the wall
const sheltered = () => shelterOf({ marks: [GROUNDS] }, [GROUNDS.id]);

test("the setting: both ends stand in the wall of the Mists", () => {
  const m = mistsAt(10, MISTS);
  assert.equal(mistsHere(FROM, m).inWall, true);
  assert.equal(mistsHere(CLICK, m).inWall, true);
});

test("ENTERED: a walk inside the Grounds is a real departure, with a distance and no refusal", () => {
  const leg = previewWalkLeg({ from: FROM, toward: CLICK, skeleton, at: 10, shelter: sheltered() });
  assert.equal(leg.mistRefused ?? null, null);
  assert.ok(leg.distanceM > 0);
  const preview = deriveWalkPreview({ from: FROM, destination: CLICK, skeleton, shelter: sheltered() });
  assert.ok(preview, "the chip arms");
  assert.equal(preview.mistRefused ?? null, null);
});

test("NOT ENTERED: the same walk is refused at the wall, as it always was", () => {
  const leg = previewWalkLeg({ from: FROM, toward: CLICK, skeleton, at: 10 });
  assert.ok(leg.mistRefused, "the Mists refuse it");
  assert.deepEqual(previewWalkLeg({ from: FROM, toward: CLICK, skeleton, at: 10, shelter: null }), leg, "null shelter is the old road, field for field");
});

test("shelter is the engine's: an entered mark that is not under the road shelters nothing", () => {
  const elsewhere = shelterOf({ marks: [{ ...GROUNDS, id: "beyond/cairn", at: { x: 600, y: -1150 }, extent: { w: 4, h: 4 } }] }, ["beyond/cairn"]);
  assert.ok(previewWalkLeg({ from: FROM, toward: CLICK, skeleton, at: 10, shelter: elsewhere }).mistRefused);
});

test("pins: the page builds the walker's shelter from their own enter stack through the engine's shelterOf", () => {
  assert.match(SOURCE, /import \{[^}]*\bshelterOf\b[^}]*\} from "\.\.\/tools\/world-verbs\.mjs";/);
  assert.match(SOURCE, /mistsRoad\(from, toward, at, skeleton\.mists, \{ shelter \}\)/);
  assert.match(SOURCE, /function enterStackOf\(handle\) \{[\s\S]*?standpointOccupancy\(\{ acts: enterExitLedger\.acts, at: occupancyClock\(\), handle \}\)\.entered/);
  assert.match(SOURCE, /function actorEnterStack\(\) \{[\s\S]*?return enterStackOf\(state\.handle\);/);
  assert.match(SOURCE, /function actorShelter\(\) \{[\s\S]*?return shelterOf\(\{ marks \}, entered, actorOrigin\(\)\);/);
  // both of the page's walk previews (the armed chip and the hover chip) carry it
  assert.equal((SOURCE.match(/shelter: actorShelter\(\),/g) ?? []).length, 2);
  assert.doesNotMatch(SOURCE, /function (?:shelterFor|pointSheltered|roadShelter)\b/, "no shelter semantics of the page's own");
});
