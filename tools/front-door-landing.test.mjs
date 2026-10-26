// front-door-landing.test.mjs — the Starforge Spire's front door enters and lands.
//
// The Gilded Doors' outside face and the Spire's own entry both name the vestibule as
// their `into`; each lands at the doors' inside face. A landing that names no mark
// strands whoever walks the door (the bug post lupi/the-starforge-spire-s-front-door-
// lands-nowhere-lands-at-is-a, postmark#4202). These read the REAL marks, not a fixture.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { entryLawOf } from "./enter-exit.mjs";
import { landingOf } from "./portals.mjs";
import { enter } from "./world-verbs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const marks = loadMarks(join(ROOT, "WORLD", "marks"));
const byId = new Map(marks.map((m) => [m.id, m]));
const FRONT = ["wright/spire-gilded-doors", "wright/the-starforge-spire"];
const VESTIBULE = "wright/spire-gilded-vestibule";
const INSIDE = "wright/spire-gilded-doors-inside";

test("each way in names the vestibule and lands at the doors' inside face, a mark that exists", () => {
  for (const id of FRONT) {
    const law = entryLawOf(byId.get(id));
    assert.deepEqual(law.into, [VESTIBULE], id);
    assert.equal(law.lands_at, INSIDE, id);
    assert.ok(byId.has(law.lands_at), `${id} lands at a real mark`);
  }
});

test("the landing resolves: landingOf accepts it, inside the vestibule", () => {
  for (const id of FRONT) {
    const l = landingOf(entryLawOf(byId.get(id)), byId.get(VESTIBULE), byId);
    assert.equal(l.ok, true, `${id}: ${l.because ?? ""}`);
  }
});

test("entering by the front door walks in and sets you down in the vestibule", () => {
  const door = byId.get("wright/spire-gilded-doors");
  const a = enter({ x: door.at.x, y: door.at.y, name: "ann" }, door.id, { marks }, { occupancy: new Map(), handle: "ann", at: 300 });
  assert.equal(a.error, undefined, a.error);
  assert.ok(!a.refused, "the entry is not refused");
  assert.equal(a.landing.mark, INSIDE);
  assert.ok(a.entered.includes(VESTIBULE), `entered ${a.entered}`);
});
