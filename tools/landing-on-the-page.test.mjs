// landing-on-the-page.test.mjs — WLD-63 rows 68 (b) and 72, the World page.
//
//   node --test tools/landing-on-the-page.test.mjs
//
// Found 2026-10-16 in the playground, as a stranger in the Starforge Spire:
//   · passing a door, the page drew the room from the enter-exit ledger and the
//     body from the walkers read, two polls 15 and 30 s apart, so for up to 30 s
//     the body stood OUTSIDE the room on screen (Darko: "there was a moment where
//     I was like actually outside of the room");
//   · "step outside" inside a dungeon did nothing at all: the office answers the
//     first exit with a confirmation (WLD-5, 21:13) and the page never showed it.
// The page now draws the landing in the same render as the room (from the enter
// answer's `landed`, or a fresh `landed` on the walkers read), and shows the
// office's own words with go and stay before leaving a dungeon.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeLanded, freshLanding, exitConfirmSheetHTML } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const fnBody = (name) => { const i = SOURCE.indexOf(`async function ${name}(`); return SOURCE.slice(i, SOURCE.indexOf("\n  }\n", i)); };

test("placeLanded sets the reader down at the landing, standing, and leaves everyone else where they are", () => {
  const rows = [{ handle: "visitor", x: 3817.5, y: -5529.5, moving: true, remaining_m: 3 }, { handle: "darko", x: 1, y: 2 }];
  const out = placeLanded(rows, "visitor", { x: 3817.5, y: -5523.5, mark: "darko/spire-rose-hall-to-red-stair-hall", recorded: true });
  assert.deepEqual(out[0], { handle: "visitor", x: 3817.5, y: -5523.5, moving: false, standing: true, remaining_m: 0 });
  assert.deepEqual(out[1], rows[1]);
  assert.deepEqual(placeLanded([], "visitor", { x: 1, y: 2 }), [{ handle: "visitor", x: 1, y: 2, moving: false, standing: true, remaining_m: 0 }],
    "a reader not yet in the list is added at the landing");
  assert.equal(placeLanded(rows, "visitor", { x: "?" }), rows, "no point, no change");
  assert.equal(placeLanded(rows, null, { x: 1, y: 2 }), rows, "no reader, no change");
});

test("freshLanding answers a landing this page has not drawn yet, once", () => {
  const bodies = [{ handle: "visitor", landed: { via: "d/door", why: "passage", iso: "2026-10-16T23:07:51.945Z" } }, { handle: "darko" }];
  assert.equal(freshLanding(bodies, "visitor", null), "2026-10-16T23:07:51.945Z");
  assert.equal(freshLanding(bodies, "visitor", "2026-10-16T23:07:51.945Z"), null, "already drawn");
  assert.equal(freshLanding(bodies, "darko", null), null, "no landing on the record");
  assert.equal(freshLanding(null, "visitor", null), null);
});

test("leaving a dungeon asks first: the office's own words, go and stay; nothing else is a confirmation", () => {
  // the office's words since WLD-5 A (Darko 2026-10-19 09:21): `because` is his sentence, `how` is for agents
  const ask = { awaiting: { effect: "confirm",
    because: "Leave the Starforge Spire from here? You can't come back in until the next settlement (18:00Z). Walking out through a door doesn't count. You'll be set down outside, at Spire Gilded Doors.",
    how: "exiting darko/spire-red-stair-hall leaves the whole of darko/the-starforge-spire. Call again with confirm: true to go; nothing was recorded." },
    dungeon: "darko/the-starforge-spire", target: "darko/spire-red-stair-hall" };
  const html = exitConfirmSheetHTML(ask, "darko/spire-red-stair-hall");
  // the head is the dungeon's name (the words below it ask the question), and the agent's `how` is not printed
  assert.match(html, /<div class="wv-cross-head">The Starforge Spire<\/div>/);
  assert.match(html, /Leave the Starforge Spire from here\? You can.{1,6}t come back in until the next settlement \(18:00Z\)\./);
  assert.doesNotMatch(html, /confirm: true/);
  assert.match(exitConfirmSheetHTML(ask, "x", { nameOf: () => "the Spire" }), /<div class="wv-cross-head">the Spire<\/div>/);
  assert.match(html, /data-exit-confirm="darko\/spire-red-stair-hall">go</);
  assert.match(html, /class="ctl wv-exit-stay">stay</);
  assert.equal(exitConfirmSheetHTML({ within: [] }, "x"), null, "a done exit is not asking");
  assert.equal(exitConfirmSheetHTML({ awaiting: { effect: "terms" } }, "x"), null, "terms are the door's, not the exit's");
  assert.doesNotMatch(exitConfirmSheetHTML({ ...ask, awaiting: { effect: "confirm", because: "<img src=x>" } }, "x"), /<img/, "the office's words are escaped");
});

test("the wiring: the passage, the exit and the walkers poll each draw the landing in the render that changes the room", () => {
  const cross = fnBody("crossInto");
  assert.match(cross, /if \(answer\.landed\?\.recorded\) \{ walkState\.walkers = placeLanded\(walkState\.walkers, state\.handle, answer\.landed\);/);
  assert.ok(cross.indexOf("placeLanded(") < cross.indexOf("await loadEnterExitLedger();"), "the body is set down before the room is read and drawn");
  const out = fnBody("stepOutside");
  assert.match(out, /apexAct\("exit", \{ mark: markId, \.\.\.\(confirm \? \{ confirm: true \} : \{\}\) \}\)/, "go sends the word");
  assert.ok(out.includes("exitConfirmSheetHTML(answer, markId, { nameOf: (id) => markName(byId.get(id) ?? { id }).name })"), "the head is named by the page's own namer");
  assert.ok(out.indexOf("exitConfirmSheetHTML(answer, markId") < out.indexOf("await loadEnterExitLedger();"), "a confirmation is shown, and nothing re-read, before the word");
  assert.match(out, /if \(answer\.set_down\?\.recorded\) \{ walkState\.walkers = placeLanded\(/);
  assert.match(SOURCE, /const exitGo = e\.target\.closest\("\[data-exit-confirm\]"\);\n    if \(exitGo\) \{ e\.stopPropagation\(\); stepOutside\(exitGo\.dataset\.exitConfirm, exitGo, \{ confirm: true \}\); return; \}/);
  const poll = fnBody("pollWalkers");
  const fresh = poll.indexOf("freshLanding(bodies, state.handle"), ledger = poll.indexOf("await loadEnterExitLedger(); }"), take = poll.indexOf("takeWalkers(withTownBodies(rows, bodies));");
  assert.ok(fresh > 0 && fresh < ledger && ledger < take, "a fresh landing reads the room BEFORE the bodies are drawn");
  assert.match(poll, /if \(landedIso\) renderCurrent\(\);/);
});
