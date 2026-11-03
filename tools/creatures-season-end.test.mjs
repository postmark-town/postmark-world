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
// SUPERSEDED IN PART 2026-11-02 (WLD-147; Darko, 17:06 EST, in chat: "full removal for mists"): "the Mists stay"
// no longer holds. They stand as they were through the last crossing before the record's `withdrawn_from` and are
// gone from it (tools/mists-withdrawn.test.mjs). The creature half of this file is unchanged.
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

// UNTIL 2026-11-02 (WLD-142 -> WLD-147) this test asserted the other half of Darko's 10-31 word, "keep the mist as is":
// that the last keyframe was crossing 282 and the Mists held it at every later crossing (285, 300, 400). Darko ruled
// "full removal for mists" (2026-11-02 17:06 EST, WLD-147): the Mists stand at that keyframe through the last crossing
// before `withdrawn_from` and are gone from it. The creature law still does not move them, and it still does not need them
// to be off: this file's dial is null either way.
test("the Mists held the last standing keyframe until the withdrawal (WLD-142, then WLD-147), and the creature law does not move them", () => {
  const W = MISTS.withdrawn_from;
  assert.ok(Number.isInteger(W) && W > FIRST_AFTER, "the record names the crossing the Mists are withdrawn from, after Halloween's end");
  const standing = MISTS.schedule.filter((k) => k.crossing < W);
  assert.equal(standing.at(-1).crossing, W - 1, "the last standing keyframe is the hold the withdrawal writes");
  assert.deepEqual(standing.at(-2), { crossing: 282, front_m: 760, veil: 0.5 }, "and the keyframe before it is crossing 282, where the Mists were kept");
  const telling = (N) => { const { crossing: _c, ...rest } = mistsAt(N, MISTS); return JSON.stringify(rest); };
  const held = telling(282);
  for (const N of [FIRST_AFTER, W - 1]) assert.equal(telling(N), held, `crossing ${N}: the Mists still stand as they did at 282`);
  assert.equal(mistsAt(W, MISTS), null, `crossing ${W}: withdrawn`);
  assert.ok(MISTS.border_m && MISTS.clearings_m.length > 0, "the wall's border and the clearings are still the skeleton's");
});

// UNTIL WLD-135 this asserted the season's five named declarations (bat, raven, two wolves, Jetto): each with its own
// from_crossing, none returning past the 06:00Z 11-01 cutoff, three returning weekly. All five are retired, so the law
// declares no named creature at all; a later declaration must edit this test, deliberately.
test("the season's named candied creatures are retired: the creature law declares none, and none returns", () => {
  assert.deepEqual(LAW.named.map((d) => d.id).sort(), [], "no named declaration remains: the season's five are retired");
  assert.deepEqual(LAW.named.filter((d) => d.return_until != null).map((d) => d.id), [], "and none returns: the three that came back each week are retired with the rest");
});
