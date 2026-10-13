// read-middle.test.mjs — WLD-29: the viewer's stride comes from the resident
// read's dials digest first; the record is only the compatibility fallback.
// Pure: no browser, no office. The rendered proof is
// tools/resident-middle-on-the-page.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { strideFrom, departPaceKm, dialOf, STRIDE_CLASS_ID, previewWalkLeg, walkLegParts } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const rec = (pace) => ({ id: STRIDE_CLASS_ID, dials: { pace_km_per_crossing: pace } });

test("THE DIGEST WINS: a valid stride in the read's dials beats a conflicting record", () => {
  assert.deepEqual(strideFrom({ dials: { [STRIDE_CLASS_ID]: { pace_km_per_crossing: 77 } }, marks: [rec(5)] }), { pace: 77, source: "digest" });
  assert.equal(departPaceKm([rec(5)], { [STRIDE_CLASS_ID]: { pace_km_per_crossing: 77 } }), 77);
});

test("MALFORMED IN THE DIGEST is an honest unknown — never patched from a record the read did not vouch for", () => {
  for (const bad of [{}, { pace_km_per_crossing: 0 }, { pace_km_per_crossing: -3 }, { pace_km_per_crossing: "fast" }, null, []]) {
    assert.deepEqual(strideFrom({ dials: { [STRIDE_CLASS_ID]: bad }, marks: [rec(60)] }), { pace: null, source: "malformed" }, JSON.stringify(bad));
  }
});

test("NO DIGEST ENTRY: the record answers (the spectator's fold, an older office); neither: missing", () => {
  assert.deepEqual(strideFrom({ dials: null, marks: [rec(60)] }), { pace: 60, source: "record" });
  assert.deepEqual(strideFrom({ dials: { "some/other": { glow: 1 } }, marks: [rec(60)] }), { pace: 60, source: "record" });
  assert.deepEqual(strideFrom({ dials: null, marks: [rec("x")] }), { pace: null, source: "malformed" });
  assert.deepEqual(strideFrom({ dials: null, marks: [] }), { pace: null, source: "missing" });
  assert.deepEqual(strideFrom({}), { pace: null, source: "missing" });
});

test("THE UNKNOWN STAYS HONEST ON THE DESK: no stride → the legacy 15 and its note; a digest stride → no note", () => {
  const leg = (paceKm) => walkLegParts(previewWalkLeg({ from: { x: 0, y: 0 }, toward: { x: 0, y: 7700 }, paceKm, at: 0 }));
  assert.match(leg(departPaceKm([], null)).paceNote, /legacy 15 km stride/);
  assert.equal(leg(departPaceKm([], { [STRIDE_CLASS_ID]: { pace_km_per_crossing: 77 } })).paceNote, "");
});

test("[pin] EVERY LIVE PREVIEW ASKS THE SAME ANSWER: the three call sites pass the read's dials", () => {
  const all = SOURCE.split("departPaceKm(").length - 1;
  const live = SOURCE.split("departPaceKm(byId, currentReadDials())").length - 1;
  assert.equal(live, 3, "the three preview call sites pass the read's dials");
  assert.equal(all, 4, "and there is no fourth caller (the fourth is the definition)");
});

// ── THE GUARD, AT THE SOURCE: one accessor for every record dial ─────────────

test("A SECOND CONSUMER, SYNTHETIC: dialOf answers any mark's dials digest-first — the stride is not special-cased", () => {
  const LAMP = "rig/the-lantern-of-a-second-consumer";
  const poisoned = [{ id: LAMP, dials: { glow: 999, POISON: true } }];
  assert.deepEqual(dialOf({ dials: { [LAMP]: { glow: 3 } }, marks: poisoned }, LAMP), { dials: { glow: 3 }, source: "digest" }, "the digest wins over the index's record");
  assert.deepEqual(dialOf({ dials: { [LAMP]: [1, 2] }, marks: poisoned }, LAMP), { dials: null, source: "digest" }, "a malformed digest entry is not patched from the record");
  assert.deepEqual(dialOf({ dials: {}, marks: poisoned }, LAMP), { dials: { glow: 999, POISON: true }, source: "record" }, "no digest entry: the record, said as such");
  assert.deepEqual(dialOf({ dials: null, marks: [] }, LAMP), { dials: null, source: "missing" });
});

test("[pin] NOTHING ELSE IN THE VIEWER READS A RECORD'S DIALS: every `<x>.dials` read is dialOf's own record or its result, or the page's own state", () => {
  const code = SOURCE.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  const readers = [...code.matchAll(/\b([A-Za-z_$][\w$]*)\??\.dials\b/g)].map((m) => m[1]);
  const offenders = readers.filter((x) => !["state", "rec", "got"].includes(x));
  assert.deepEqual(offenders, [], `a record's dials read outside dialOf: ${offenders.join(", ")}`);
  assert.equal(code.split("rec.dials").length - 1, 2, "rec.dials is read in dialOf alone (its test and its value)");
  assert.equal(code.split("got.dials").length - 1, 1, "got.dials is dialOf's answer, read once by strideFrom");
});
