// chooser-every-clickable.test.mjs — play row 55's addendum (Darko 2026-10-16
// 17:37): "The chooser just needs to cover any clickable. So whether it be a
// mark, a resident, or a creature. If it's … there under the cursor when you
// click it, then it should be included in the chooser. Simple as that." One
// rule: for a click point, the chooser's entries are every clickable the map's
// own hit test reaches there, and nothing else; one alone opens directly.
// Run: node --test tools/chooser-every-clickable.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clickablesAtPoint, contestedMarksAtPoint, chooserLeadLine, walkerHoverId, MARK_SNAP_RADIUS_PX } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const at = { x: 500, y: 400 };
const R = MARK_SNAP_RADIUS_PX;
const under = (id, dx = 0, dy = 0) => ({ id, x: at.x + dx, y: at.y + dy });

test("entries = every clickable under the point, of every kind, and nothing else", () => {
  const people = [under(walkerHoverId("darko"), -6), under(walkerHoverId("rei"), 4), under("creature:wolf-253-play1"), under("creature:raven-253-play1"), under("creature:bat-253-play1"),
    under(walkerHoverId("far-away"), R + 40), under("creature:wolf-252-play2", 0, R + 30)];
  const marks = [under("darko/spire-forecourt", 3, 3), { id: "darko/starforge-spire-grounds", x: 0, y: 0, box: { left: 0, right: 1000, top: 0, bottom: 800 }, contains: () => true }, under("the-town/elsewhere", R + 50)];
  const { people: who, marks: what, all } = clickablesAtPoint(at, { people, marks });
  assert.deepEqual([...who].sort(), [walkerHoverId("darko"), walkerHoverId("rei"), "creature:bat-253-play1", "creature:raven-253-play1", "creature:wolf-253-play1"].sort());
  assert.deepEqual([...what].sort(), ["darko/spire-forecourt", "darko/starforge-spire-grounds"].sort(), "a pip under the point and a shape that holds it");
  assert.equal(all.length, 7);
  for (const out of [walkerHoverId("far-away"), "creature:wolf-252-play2", "the-town/elsewhere"]) assert.ok(!all.includes(out), out + " is not under the point");
  // it is the single click's own test, by construction
  assert.deepEqual(all, [...contestedMarksAtPoint(at, people), ...contestedMarksAtPoint(at, marks)]);
});

test("a resident pile: every resident under the point, however many", () => {
  const pile = Array.from({ length: 70 }, (_, i) => under(walkerHoverId(`r${i}`), (i % 7) - 3, (i % 5) - 2));
  assert.equal(clickablesAtPoint(at, { people: pile }).all.length, 70);
  assert.equal(chooserLeadLine(pile.map((p) => p.id)), "70 residents are standing here — which one?");
});

test("the lead line counts what is there in plain words", () => {
  assert.equal(chooserLeadLine([walkerHoverId("a"), walkerHoverId("b"), "creature:wolf-1", "x/mark"]), "2 residents, 1 creature and 1 mark are here — which one?");
});

test("pins: both click branches ask the one rule; one entry opens directly", () => {
  assert.match(SOURCE, /const here = clickablesAtPoint\(\{ x: e\.clientX, y: e\.clientY \},\s*\{ people: \[\.\.\.screenWalkerCandidates\(\), \.\.\.screenCreatureCandidates\(\)\], marks: screenMarkCandidates\(\) \}\);/);
  // CHANGED by the 18:06 wash follow-up: the washes under the point are entries too
  assert.match(SOURCE, /if \(here\.all\.length \+ washes\.length > 1\) \{ openChooser\(\[\.\.\.here\.all, \.\.\.washes\]\); return; \}\s*selectMark\(peopleHere\[0\]\);/);
  assert.match(SOURCE, /const contested = clickablesAtPoint\(\{ x: e\.clientX, y: e\.clientY \}, \{ marks: candidates \}\)\.all;\s*if \(contested\.length > 1\) \{ openChooser\(contested\); return; \}/);
});
