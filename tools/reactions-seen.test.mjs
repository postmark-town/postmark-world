// reactions-seen.test.mjs — play row 54 (encounter run, 21:1x): a creature's
// reaction to an AGENT's act showed nowhere on the page but the creature's
// column, two clicks deep, in UTC. Now each walkers poll reads the creatures on
// screen (the column's own keyless investigate), and a reaction newer than the
// last one shown is said at the creature's token, whoever made the act. The
// column's times are the reader's own clock.
// Run: node --test tools/reactions-seen.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newReactions, localWhen } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const now = Date.parse("2026-10-16T01:20:00Z");
const rows = [   // newest first, as the office answers
  { at: "2026-10-16T01:19:40Z", line: "The raven hops a little nearer to visitor." },
  { at: "2026-10-16T01:19:30Z", line: "A raven cocks its head." },
  { at: "2026-10-16T00:40:00Z", line: "an old one" },
];

test("the first look shows only the last minute, never an hour of history", () => {
  const { lines, newestMs } = newReactions(rows, null, { nowMs: now });
  assert.deepEqual(lines, ["A raven cocks its head.", "The raven hops a little nearer to visitor."], "oldest first");
  assert.equal(newestMs, Date.parse(rows[0].at));
  assert.deepEqual(newReactions([rows[2]], null, { nowMs: now }).lines, []);
});

test("after that, exactly what landed since the last shown, and nothing twice", () => {
  const seen = Date.parse(rows[1].at);
  assert.deepEqual(newReactions(rows, seen, { nowMs: now }).lines, ["The raven hops a little nearer to visitor."]);
  const again = newReactions(rows, Date.parse(rows[0].at), { nowMs: now });
  assert.deepEqual(again.lines, []);
  assert.equal(again.newestMs, Date.parse(rows[0].at));
  assert.deepEqual(newReactions([], 5, { nowMs: now }), { lines: [], newestMs: 5 });
  assert.deepEqual(newReactions([{ at: "2026-10-16T01:19:59Z" }], null, { nowMs: now }).lines, [], "a row with no line says nothing");
});

test("the reader's clock, not UTC", () => {
  assert.equal(localWhen("2026-10-15T23:06:00Z", { timeZone: "America/New_York" }), "Oct 15, 7:06 PM");
  assert.equal(localWhen("nonsense"), "");
});

test("pins: every poll reads the creatures on screen and says what is new at the token", () => {
  assert.match(SOURCE, /walkState\.timer = setInterval\(\(\) => \{ pollWalkers\(\); pollCreatureReactions\(\); \}, 15000\);/);
  assert.match(SOURCE, /function pollCreatureReactions\(\) \{[\s\S]*?for \(const id of onScreenCreatures\(\)\)[\s\S]*?\/world\/apex\?investigate=[\s\S]*?newReactions\(inv\.reactions\?\.rows \?\? \[\], reactionSeen\.get\(id\) \?\? null\)[\s\S]*?creatureSay\(id, lines\[lines\.length - 1\]\)/);
  assert.match(SOURCE, /const CREATURE_SAY_MAX = 6/);
  assert.match(SOURCE, /if \(typeof document !== "undefined" && document\.hidden\) return;/, "a hidden tab asks nothing");
  assert.match(SOURCE, /function positionPills\(\) \{\s*positionCreatureSays\(\);/);
  assert.match(SOURCE, /say\.el\.textContent = line;/, "a creature's line is text, never markup");
});
