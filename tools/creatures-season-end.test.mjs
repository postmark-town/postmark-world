// creatures-season-end.test.mjs - the Halloween creatures stop after Halloween; the Mists stay (WLD-142).
//
// LAW (Darko, 2026-10-31 23:01 EDT, in chat, WLD-142): "keep the mist as is, but we should
// probably remove all like the Halloween creatures and the decorations."
//
// The Mists creatures gather and never fade (WLD-96); their windows ran from the creature
// class's `from_crossing` dial with no end. The class's own text says the season's end is
// Darko's word and null is off (W6). This is that word: the dial is null, so no window
// seeded from the first blessing that carries it spawns anything, while the Mists' wall,
// fringe and clearings are the skeleton's and are not touched. The named candied creatures
// carry their own `from_crossing` and `return_until`, so none of them depends on the dial.
//
// CAN-FAIL FLIPS: write the dial back to 259 (the law and the windows cases red); drop a
// named creature's own from_crossing (the named case reds); let a named return_until run
// past 2026-11-01T06:00Z (the named case reds). The control case holds the scheduler live.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { mistsAt } from "./world-engine.mjs";
import { creatureLaw, creaturesOn, scheduleFor, secretFor } from "./creatures.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MISTS = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8")).mists;
const MARKS = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8")).marks;
const LAW = creatureLaw(loadMarks(join(ROOT, "WORLD", "marks")));
const SHA = "e5bb5aa561d9b134523ce057fdf5e961876963f6";
const AS_LAW = { mists: MISTS, marks: MARKS, dials: LAW.dials, fromCrossing: LAW.fromCrossing, world_sha: SHA };
// crossing 285 opens 2026-11-01T12:00Z, the first window seeded after Halloween's 06:00Z end
const FIRST_AFTER = 285;

test("the creature class's launch dial is null: off, as the class says (WLD-142)", () => {
  assert.equal(LAW.fromCrossing, null, "LAW 2026-10-31 23:01: remove the Halloween creatures; null is off (W6)");
  assert.equal(creaturesOn(FIRST_AFTER, LAW.fromCrossing), false);
});

test("a crossing after Halloween spawns no creature, and the same inputs with the old dial still do (the control)", () => {
  const strongest = [];
  for (let N = FIRST_AFTER; N <= FIRST_AFTER + 40; N += 1) {
    for (const key of ["a", "b", "c"]) {
      const s = scheduleFor(N, secretFor(`season end ${key}`, N), AS_LAW);
      strongest.push(s.spawns.length + s.unplaced.length);
    }
  }
  assert.equal(strongest.length, 41 * 3);
  assert.deepEqual(strongest.filter((n) => n !== 0), [], "LAW: no window after Halloween spawns or even tries to place a creature");
  const live = scheduleFor(FIRST_AFTER, secretFor("season end a", FIRST_AFTER), { ...AS_LAW, fromCrossing: 259 });
  assert.ok(live.spawns.length > 0, "control: with the old launch dial the same scheduler spawns, so the zero above is the dial's");
});

test("the Mists stay as they are: past the last keyframe they hold it, and the creature law does not move them (WLD-142)", () => {
  const last = MISTS.schedule[MISTS.schedule.length - 1].crossing;
  assert.equal(last, 282, "the last keyframe is crossing 282 (the Mists stay there)");
  const telling = (N) => { const { crossing: _c, ...rest } = mistsAt(N, MISTS); return JSON.stringify(rest); };
  const held = telling(last);
  for (const N of [FIRST_AFTER, 300, 400]) assert.equal(telling(N), held, `crossing ${N}: the Mists stand at the last keyframe`);
  assert.ok(MISTS.border_m && MISTS.clearings_m.length > 0, "the wall's border and the clearings are still the skeleton's");
});

test("the named candied creatures stand on their own: each has its own crossing, and nothing returns past the 06:00Z cutoff", () => {
  const CUTOFF = Date.parse("2026-11-01T06:00:00Z");
  const named = LAW.named.map((d) => d.id).sort();
  // until WLD-135 this asserted the season's five declarations (bat, raven, two wolves, Jetto); they are retired
  assert.deepEqual(named, [], "no named declaration remains: the season's five are retired");
  for (const d of LAW.named) {
    assert.ok(Number.isInteger(d.from_crossing), `${d.id} names its own from_crossing, so the class's off dial neither moves nor needs it`);
    assert.ok(d.return_until == null || Date.parse(d.return_until) <= CUTOFF,
      `${d.id}: a returning declaration ends no later than 2026-11-01T06:00Z (strictly-before settlements only); the rest are written once and never return`);
  }
  const returning = LAW.named.filter((d) => d.return_until != null).map((d) => d.id).sort();
  assert.deepEqual(returning, [], "none returns: the three that came back each week are retired with the rest");
});
