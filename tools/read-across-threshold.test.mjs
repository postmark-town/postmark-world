// read-across-threshold.test.mjs — play row 3 (WLD-62): a tab open across a
// dungeon's exit went on drawing its four rooms; a fresh load drew none. The
// resident's read is the office's, taken with their enter stack, and the page
// kept it by handle and crossing only, so a step out within the crossing
// reused the read from inside. Now, when the crossings land, each kept read
// whose reader's stack moved is dropped and the next render asks again.
// Measured in a browser (read only, the exit routed into the page's ledger):
// before, no read across the exit; after, one fresh read.
// Run: node --test tools/read-across-threshold.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readsAcrossThresholds, residentReadKey } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const D = "the-town/dungeon";

test("a step out drops the reader's kept read; nobody else's", () => {
  const keys = [residentReadKey({ handle: "visitor", crossing: 252 }), residentReadKey({ handle: "darko", crossing: 252 })];
  const before = (h) => (h === "visitor" ? [D] : ["darko/starforge-spire-grounds"]);
  const now = (h) => (h === "visitor" ? [] : ["darko/starforge-spire-grounds"]);
  assert.deepEqual(readsAcrossThresholds(keys, before, now), ["visitor|embodied|252"]);
});

test("a step in drops it too; an unmoved stack keeps every read", () => {
  const keys = [residentReadKey({ handle: "visitor", crossing: 252 })];
  assert.deepEqual(readsAcrossThresholds(keys, () => [], () => [D]), keys);
  assert.deepEqual(readsAcrossThresholds(keys, () => [D], () => [D]), []);
  assert.deepEqual(readsAcrossThresholds(keys, () => undefined, () => []), [], "no stack and an empty stack are the same place");
  assert.deepEqual(readsAcrossThresholds([], () => [], () => [D]), []);
});

test("pins: the ledger's landing drops the reads its crossings made stale, never on the first landing", () => {
  const i = SOURCE.indexOf("async function loadEnterExitLedger()");
  const body = SOURCE.slice(i, SOURCE.indexOf("\n  }\n", i));
  assert.match(body, /const kept = enterExitEpoch > 0 \? \[\.\.\.readCache\.keys\(\)\] : \[\];/);
  assert.match(body, /const stacksBefore = new Map\(kept\.map\([\s\S]*?enterStackOf\(h\)\]\)\);\s*enterExitLedger = \{/, "the stacks are read before the new acts land");
  assert.match(body, /for \(const k of readsAcrossThresholds\(kept, \(h\) => stacksBefore\.get\(h\), enterStackOf\)\) readCache\.delete\(k\);/);
});
