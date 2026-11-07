// where-from.test.mjs — play row 72: room columns read "6,684 m · northeast"
// for a room ~150 m from darko; the distance was measured from the camera's
// resting point, not from the resident. A resident's distances are from their
// own body (as their read's are), a spectator's from the camera, and the line
// says which.
// Run: node --test tools/where-from.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { whereLine } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

test("the line says from whom", () => {
  assert.equal(whereLine({ distance: 151.6, bearing: "SE", who: "you" }), "152 m · southeast of you");
  assert.equal(whereLine({ distance: 6719, bearing: "NE", who: "the camera" }), "6,719 m · northeast of the camera");
  assert.equal(whereLine({ distance: 12000, bearing: "N", far: true, who: "you" }), "~12 km · north of you");
  assert.equal(whereLine({ distance: 0, bearing: null, who: "you" }), "you are inside");
  assert.equal(whereLine({ distance: 0, bearing: null, who: "the camera" }), "the camera is inside");
});

test("pins: a resident measures from their own body, a spectator from the camera", () => {
  assert.match(SOURCE, /function whereFrom\(\) \{\s*if \(canAct\(\) && state\.handle\) \{\s*const o = actorOrigin\(\);/);
  assert.match(SOURCE, /return \{ at: \{ x: Number\(state\.cam\.x\), y: Number\(state\.cam\.y\) \}, who: "the camera" \};/);
  const where = SOURCE.slice(SOURCE.indexOf("  function radialWhere(m) {"), SOURCE.indexOf("  function extentTag(m) {"));
  assert.doesNotMatch(where, /state\.cam/, "radialWhere itself never reads the camera");
});
