// eyes-enter-stack.test.mjs — play fix 42, the (b) half (Darko, playground
// 2026-10-15 20:14; the column's (a) half is his call, PORT-TO-PROD row 42).
// The eyes the page opens itself take the reader's enter stack, as the
// office's do (world #226, office #585), so the page never draws a narrower
// world than the office answers for the same reader. One enter-stack source
// serves the eyes and the walk's shelter (fix 45), and the shelter passes where
// the walker stands, as the engine's own eyes do (world 1eef5d65).
// Run: node --test tools/eyes-enter-stack.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openYourEyes } from "./world-verbs.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

test("pins: one enter stack, read by the page's own eyes and by the walk's shelter", () => {
  assert.match(SOURCE, /function enterStackOf\(handle\) \{[\s\S]*?standpointOccupancy\(\{ acts: enterExitLedger\.acts, at: occupancyClock\(\), handle \}\)\.entered/);
  assert.match(SOURCE, /function eyesAt\(standpoint, name, key\) \{\s*const entered = enterStackOf\(key\);/);
  assert.match(SOURCE, /openYourEyes\(\{ x: standpoint\.x, y: standpoint\.y, name \}, world, \{[^}]*\bentered \}\)/);
  assert.match(SOURCE, /const e = eyesAt\(standpoint, name, key\);/);
  assert.match(SOURCE, /entered: entered\.join\("\\n"\) \};/, "the eyes' memo is keyed on the stack too");
  assert.match(SOURCE, /function actorEnterStack\(\) \{[\s\S]*?return enterStackOf\(state\.handle\);/);
  assert.match(SOURCE, /return shelterOf\(\{ marks \}, entered, actorOrigin\(\)\);/);
});

test("the engine's eyes take `entered` under that name (the page passes what the engine reads)", () => {
  assert.match(openYourEyes.toString(), /entered = null/);
});
