// walking-pace.test.mjs — ONE WALKING PACE (POS-223).
//
// Kogane, 2026-09-21: "The world mark carries a predicate `the-town/the-walking-
// pace` reading *15 km per crossing*. The resident class dial quoted back to me
// at every door says **60** … anyone reading the world's own furniture to plan a
// walk gets an answer four times wrong."
//
// Keemin ruled 2026-10-01: "please update the 15 to 60." The stride was ruled
// 15 → 60 by 008b (2026-08-16) and the number lives on the resident class's
// dial (`the-town/resident`, dials.pace_km_per_crossing). This holds every other
// place the world states a walking pace to that one number, so the furniture
// and the door's dial can never disagree again:
//   - every predicate whose slot is a pace (a number, or a pointer to the dial);
//   - the skeleton's walk_speed_m_per_crossing, which world-root-gen extracts
//     the-walking-pace from and which walk() reads first.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { walk } from "./world-verbs.mjs";
import { propertyOf } from "./class-properties.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const marks = loadMarks(join(ROOT, "WORLD/marks"));
const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
const byId = new Map(marks.map((m) => [m.id, m]));

// the dial is a property of the resident class now (LOGOS v2 part 2)
const DIAL = Number(propertyOf(marks, "resident", "pace_km_per_crossing")?.value);

/** A pace predicate's number: "<n> km per crossing", or a pointer to a class mark's dial. */
function paceOf(m) {
  const v = String(m.value ?? m.default ?? "").trim();
  const n = /^(\d+(?:\.\d+)?)\s*km per crossing$/.exec(v);
  if (n) return Number(n[1]);
  const target = byId.get(v);
  if (target) return Number(propertyOf(marks, String(target.class), "pace_km_per_crossing")?.value);
  return NaN;
}

test("the resident class carries the dial (the one place the number lives)", () => {
  assert.ok(Number.isFinite(DIAL) && DIAL > 0, `the-town/resident has no pace_km_per_crossing dial: ${DIAL}`);
});

test("every pace predicate in the world says the resident dial's number", () => {
  // a class's pace is a property now, an instance's a predicate: both state a pace
  const paces = marks.filter((m) => (m.kind === "predicated" || m.kind === "predicate" || m.kind === "property") && /^pace\b/.test(String(m.slot ?? m.name ?? "")));
  assert.ok(paces.some((m) => m.id === "the-town/the-walking-pace"), "the-town/the-walking-pace is not in the tree");
  for (const m of paces) assert.equal(paceOf(m), DIAL, `${m.id} (slot ${m.slot ?? m.name}) reads "${m.value ?? m.default}", the resident dial says ${DIAL}`);
});

test("the skeleton's walk speed, which the-walking-pace is generated from, is the dial", () => {
  assert.equal(skeleton.elevation.walk_speed_m_per_crossing, DIAL * 1000);
});

test("walk() spends crossings at the dial, with the skeleton in the world", () => {
  const world = { marks, terrain: skeleton };
  const r = walk({ x: 0, y: 0 }, "N", DIAL * 1000, world);
  assert.equal(r.crossings, 1, `a walk of one dial's length spent ${r.crossings} crossings`);
});

// The viewer's tour says the pace in words, on the walking slide, and the README
// says to fix the slide when a law here changes. It still said "fifteen" after
// the dial went to 60. The viewer is imported inside the test, so the tests
// above never load it.
const PACE_WORDS = { fifteen: 15, thirty: 30, forty: 40, sixty: 60 };

// WLD-220 cut the walking slide: the first-visit tour is three short steps and carries no pace at all, so there is nothing in it to go stale. What is left to
// guard is the same rule, kept true in both directions: whatever the tour DOES say about a pace must be the dial's (the next author who puts a pace back in a
// slide fails here, not after it has said "fifteen" for a month), and today it says none.
test("the tour quotes no pace that is not the resident dial's (the first-visit deck quotes none)", async () => {
  const { TOUR_SLIDES } = await import("../spectator/viewer.mjs");
  const quoted = [];
  for (const slide of TOUR_SLIDES) {
    for (const key of ["body", "phoneBody"]) {
      const said = /(\w+) kilometres a crossing/.exec(slide[key] ?? "");
      if (!said) continue;
      quoted.push(`${slide.id}.${key}: ${said[0]}`);
      assert.equal(PACE_WORDS[said[1]] ?? Number(said[1]), DIAL,
        `the ${slide.id} slide says "${said[0]}", the resident dial says ${DIAL}`);
    }
  }
  assert.ok(!TOUR_SLIDES.some((s) => s.id === "walking"), "the walking slide is cut from the first-visit deck");
  assert.deepEqual(quoted, [], "the first-visit deck states no pace");
});
