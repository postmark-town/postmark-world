// page-follows-crossings.test.mjs — play fix 57 (encounter run, row 55's
// check): an open page didn't follow visitor's enter into the Forecourt (the
// room chip kept the Grounds). The page re-read the crossings only after its
// own acts, a stood-out event or a reload, so an agent's crossing never reached
// it. Now each 30 s tick of a visible tab re-reads them; when they moved, fix
// 03 drops the stale reads and the page renders again.
// Run: node --test tools/page-follows-crossings.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crossingsSignature } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const enter = { at: "2026-10-16T01:40:00Z", handle: "visitor", act: "enters", mark: "darko/spire-forecourt" };

test("the signature moves when a crossing lands, and holds when nothing did", () => {
  const before = [{ at: "2026-10-16T00:32:00Z", handle: "visitor", act: "enters", mark: "darko/starforge-spire-grounds" }];
  assert.equal(crossingsSignature(before), crossingsSignature([...before]));
  assert.notEqual(crossingsSignature([...before, enter]), crossingsSignature(before));
  assert.equal(crossingsSignature([]), "0|");
  assert.equal(crossingsSignature(null), "0|");
});

test("pins: a visible tab re-reads the crossings every tick, and renders only when they moved", () => {
  const clock = SOURCE.slice(SOURCE.indexOf("const clock = setInterval"), SOURCE.indexOf("}, 30000);", SOURCE.indexOf("const clock = setInterval")));
  assert.match(clock, /if \(enterExitEpoch > 0 && !\(typeof document !== "undefined" && document\.hidden\)\) \{/);
  assert.match(clock, /const before = crossingsSignature\(enterExitLedger\.acts\);\s*loadEnterExitLedger\(\)\.then\(\(\) => \{ if \(crossingsSignature\(enterExitLedger\.acts\) !== before\) renderCurrent\(\); \}\)/);
  // fix 03 is what makes the render honest: the landing drops the reads the step made stale
  assert.match(SOURCE, /for \(const k of readsAcrossThresholds\(kept, \(h\) => stacksBefore\.get\(h\), enterStackOf\)\) readCache\.delete\(k\);/);
});
