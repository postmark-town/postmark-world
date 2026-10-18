// read-middle.test.mjs — WLD-29: the viewer's stride comes from the page's own
// dial table first — GET /world/dials (the pointer model: no default read
// carries one) — and the index's record is only the fallback.
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
  // LOGOS v2 part 2: a class node with no `dials:` and its pace as a property node
  const W2 = [{ id: STRIDE_CLASS_ID, kind: "class", by: "the-town", class: "resident" },
    { id: "the-town/resident-pace-km-per-crossing", kind: "property", by: "the-town", tier: "constitution", name: "pace_km_per_crossing", default: 60, parent: STRIDE_CLASS_ID }];
  assert.deepEqual(strideFrom({ dials: null, marks: W2 }), { pace: 60, source: "record" }, "the record arm reads the class property");
});

test("THE UNKNOWN STAYS HONEST ON THE DESK: no stride → the legacy 15 and its note; a digest stride → no note", () => {
  const leg = (paceKm) => walkLegParts(previewWalkLeg({ from: { x: 0, y: 0 }, toward: { x: 0, y: 7700 }, paceKm, at: 0 }));
  assert.match(leg(departPaceKm([], null)).paceNote, /legacy 15 km stride/);
  assert.equal(leg(departPaceKm([], { [STRIDE_CLASS_ID]: { pace_km_per_crossing: 77 } })).paceNote, "");
});

test("[pin] EVERY LIVE PREVIEW ASKS THE SAME ANSWER: the three call sites pass the /world/dials table", () => {
  const all = SOURCE.split("departPaceKm(").length - 1;
  const live = SOURCE.split("departPaceKm(byId, currentReadDials())").length - 1;
  assert.equal(live, 3, "the three preview call sites pass the /world/dials table");
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

test("[pin] NOTHING ELSE IN THE VIEWER READS A RECORD'S DIALS: every `.dials` read in the code is dialOf's own, its answer, the /world/dials answer itself, or the page's own state", () => {
  // EVERY property read of `.dials`, whatever precedes it (an identifier, a
  // call, an optional chain) — a first cut matched only `<identifier>.dials`
  // and a flip adding `byId.get(id)?.dials` sailed past it.
  const code = SOURCE.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  const reads = [...code.matchAll(/(\S{0,48})\??\.dials\b/g)].map((m) => m[0]).filter((r) => !/\bstate\.dials$/.test(r));
  // the four reads allowed, as the code spells them (the fragment up to the nearest space)
  const ALLOWED = [
    "isDialsObject(rec.dials",       // dialOf: is the index's record's dials an object
    "rec.dials",                     // dialOf: …then that record's dials (only when the digest does not name it)
    "paceOf(got.dials",              // strideFrom: dialOf's own answer
    "dialsHeld.answer?.dials",       // currentReadDials: the /world/dials answer itself (never a read's)
  ];
  assert.deepEqual(reads.sort(), [...ALLOWED].sort(), `a record's dials read outside dialOf, or an allowed read gone: ${JSON.stringify(reads)}`);
});

test("[pin] THE STRIDE'S SOURCE IS ITS OWN DOOR: currentReadDials answers the office's GET /world/dials table, keyed by the office asked — never a read's records or a digest on a read", () => {
  const body = SOURCE.match(/^  function currentReadDials\(\) \{[\s\S]*?^  \}/m)?.[0] ?? "";
  assert.ok(body, "source extraction: currentReadDials");
  assert.match(body, /dialsHeld\?\.key === officeBase\(\)/);
  assert.doesNotMatch(body, /readCache|heldReads|residentStandpointKey|records/);
  assert.match(SOURCE, /fetch\(officeUrl\("\/world\/dials"\)/, "the page asks its own door for dials");
  assert.doesNotMatch(SOURCE, /\/world\/eyes\?x=0&y=0/, "the old activity-via-eyes request is gone");
});
