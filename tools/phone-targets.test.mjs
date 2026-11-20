// phone-targets.test.mjs — CORE-54 (Darko 2026-11-20 picks: "1. Buttons cover titles", "4. Small targets"; Wright 13:50:53Z).
//
//   node --test tools/phone-targets.test.mjs
//
// Two things, both at a phone's width and for a finger:
//   · TARGETS: a touch press reaches farther than a cursor (22 px, a 44 px target; a pip is ~6 px and its cursor reach is 18). The ranking and the
//     chooser are the SAME, only the reach grows; a crowded press still lists everything it reaches.
//   · CLEARANCE: the column's sticky nav is at least as tall as the host's floating chrome (--wv-chrome-bottom, set by the Site), so the title begins
//     below the Postmark and Time-travel buttons. No host value, no reserve: a standalone viewer and the desktop layout are unchanged.
// The real browser demonstration (a touch press near an old target edge, the crowded case, and the 390 px pictures) lives in the PR report; these are the
// direct pins the viewer's pure parts and source can hold.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clickablesAtPoint, contestedMarksAtPoint, MARK_SNAP_RADIUS_PX, MARK_SNAP_RADIUS_TOUCH_PX, CONVO_HIT_TOUCH_PX, snapRadiusFor } from "../spectator/viewer.mjs";
import { HOME_COLUMN_CSS } from "../spectator/home-column.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const at = { x: 200, y: 300 };
const pip = (id, dx, dy = 0) => ({ id, x: at.x + dx, y: at.y + dy });

test("the reach is the pointer's own: a finger 22 px (a 44 px target), a pen the same, a cursor stays 18", () => {
  assert.equal(MARK_SNAP_RADIUS_PX, 18, "the cursor's reach did not move");
  assert.equal(MARK_SNAP_RADIUS_TOUCH_PX, 22);
  assert.equal(CONVO_HIT_TOUCH_PX, 22);
  assert.equal(snapRadiusFor("touch"), 22);
  assert.equal(snapRadiusFor("pen"), 22);
  assert.equal(snapRadiusFor("mouse"), 18);
  assert.equal(snapRadiusFor(undefined), 18, "an unknown pointer is a cursor (today's behaviour)");
});

test("a press near an OLD edge: 20 px from a pip misses with a cursor and lands with a finger; 24 px still misses both", () => {
  const marks = [pip("the-town/main-channel", 20)];
  assert.deepEqual(clickablesAtPoint(at, { marks }, snapRadiusFor("mouse")).all, [], "20 px is outside the cursor's 18");
  assert.deepEqual(clickablesAtPoint(at, { marks }, snapRadiusFor("touch")).all, ["the-town/main-channel"], "and inside the finger's 22");
  assert.deepEqual(clickablesAtPoint(at, { marks: [pip("far", 24)] }, snapRadiusFor("touch")).all, [], "the reach has an edge: 24 px is not 'near'");
  // the default (no radius) is the cursor's, so every existing caller is unchanged
  assert.deepEqual(clickablesAtPoint(at, { marks }).all, []);
});

test("the CROWDED case still goes to the one chooser: a finger lists every pip it reaches, nearest first, and the ranking is the single click's own", () => {
  const marks = [pip("a/centre", 2, 1), pip("b/edge-of-old", 17), pip("c/only-new-reach", 21), pip("d/outside", 40)];
  const touch = clickablesAtPoint(at, { marks }, snapRadiusFor("touch")).all;
  const mouse = clickablesAtPoint(at, { marks }, snapRadiusFor("mouse")).all;
  assert.deepEqual(touch, ["a/centre", "b/edge-of-old", "c/only-new-reach"], "three under the finger, nearest first, none outside");
  assert.deepEqual(mouse, ["a/centre", "b/edge-of-old"], "two under the cursor");
  assert.ok(touch.length > 1, "more than one: the caller opens the chooser, it does not guess");
  assert.deepEqual(touch, contestedMarksAtPoint(at, marks, 22), "the chooser's list IS the snap's ranking at that reach");
  // one alone still opens directly
  assert.deepEqual(clickablesAtPoint(at, { marks: [pip("solo", 21)] }, 22).all, ["solo"]);
});

test("the click path asks that rule, for a touch's reach: the pins on the pointer-up branch and the drawn-disc reach for the conversation badge", () => {
  assert.match(SOURCE, /const reach = snapRadiusFor\(e\.pointerType\);/);
  assert.match(SOURCE, /clickablesAtPoint\(\{ x: e\.clientX, y: e\.clientY \}, \{ marks: candidates \}, reach\)\.all/);
  // the badge: resolved on screen from the drawn disc, a finger 22 px / a cursor 13 px; a reader who can act keeps the ground beside it as ground
  assert.match(SOURCE, /const convoDiscsAt = \(x, y, pointerType\) => \{/);
  assert.match(SOURCE, /const reach = canAct\(\) \? \(touch \? 16 : 0\) : \(touch \? CONVO_HIT_TOUCH_PX : CONVO_HIT_MIN_PX\);/);
  assert.match(SOURCE, /const hit = convoClickAt\(wp\.x, wp\.y\) \?\? convoDiscsAt\(e\.clientX, e\.clientY, e\.pointerType\)\[0\] \?\? null;/);
});

test("CLEARANCE: the phone column's nav is at least the host's chrome tall (--wv-chrome-bottom), with NO value no reserve; the close and the 'all conversations' link are thumb-sized", () => {
  assert.match(HOME_COLUMN_CSS, /@media \(max-width:720px\) \{\s*\.wv-homecol-nav \{ min-height:var\(--wv-chrome-bottom, 0px\); box-sizing:border-box; align-items:flex-start; \}\s*\.wv-homecol-kicker \{ margin-top:14px; \}/);
  // the kicker (a conversation's "A CONVERSATION · LIVE") rides the top row beside the close: the built capture showed a bottom-aligned kicker under the host's Time-travel pill
  assert.doesNotMatch(HOME_COLUMN_CSS.replace(/\/\*[\s\S]*?\*\//g, ""), /wv-homecol-nav \{[^}]*align-items:flex-end/);
  assert.match(HOME_COLUMN_CSS, /@media \(max-width:720px\), \(pointer:coarse\) \{\s*\.wv-homecol-close \{ min-width:44px; min-height:44px; \}/);
  assert.match(HOME_COLUMN_CSS, /\.wv-homecol-all \{ display:inline-block; padding:12px 6px; \}/);
  // desktop: the nav rule lives only inside the phone media query (nothing outside it names --wv-chrome-bottom)
  const outside = HOME_COLUMN_CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media \(max-width:720px\) \{[\s\S]*?\n\}\n/, "");
  assert.doesNotMatch(outside, /--wv-chrome-bottom/, "the reserve is a phone rule only");
});

test("TARGETS in the viewer's own stylesheet: the round map controls reach ~44 px tall, the tour's three buttons are 44 px, each step dot sits in a 20 x 44 target, the mark bubble's close is 44 px", () => {
  assert.match(SOURCE, /@media \(max-width:720px\), \(pointer:coarse\) \{\s*\.wv-mapctl \.ctl \{ position:relative; \}\s*\.wv-mapctl \.ctl::after \{ content:""; position:absolute; inset:-5px -3px; border-radius:999px; \}/);
  assert.match(SOURCE, /\.wv-tour-acts button \{ min-height:44px; \}/);
  assert.match(SOURCE, /\.wv-tour-dot \{ position:relative; width:20px; height:44px; border-radius:0; background:transparent; transform:none; \}/);
  assert.match(SOURCE, /\.wv-bubble-close \{ min-width:44px; min-height:44px; \}/);
  // the tour's words, steps and flow are WLD-220's: this change did not touch them
  assert.match(SOURCE, /const TOUR_SLIDES = \[/);
});

test("CORE-54 FIT (lead 20:01Z): the tour foot fits the 390 px card: tighter button padding and gaps, still 44 px targets, and the foot wraps rather than clip a control", () => {
  // the published c300/0dae frame showed 'next' past the card: 8 dots x 20 px = 160 px + 12 gap + skip 56 + back 58 + next 58 + gaps = 364 > the 332 px inside the 370 px phone card
  assert.match(SOURCE, /\.wv-tour-card \{ width:calc\(100vw - 20px\); padding:16px 17px 13px; \}/);
  assert.match(SOURCE, /\.wv-tour-foot \{ flex-wrap:wrap; \}\s*\.wv-tour-acts \{ gap:4px; margin-left:auto; \}/);
  assert.match(SOURCE, /\.wv-tour-acts \.wv-tour-skip \{ padding-left:6px; padding-right:6px; margin-right:0; \}/);
  assert.match(SOURCE, /\.wv-tour-acts \.wv-tour-back, \.wv-tour-acts \.wv-tour-next \{ padding-left:8px; padding-right:8px; \}/);
  // the budget at 390 (mono .68rem is ~6.5 px a letter + .06em spacing, ~29 px a four-letter word): skip max(44, 29+12), back/next 29+16+2 = 47 each, two 4 px gaps, beside 12 px and the 160 px of dots
  const word = 29, skip = Math.max(44, word + 12), btn = word + 16 + 2, acts = skip + btn + btn + 4 + 4, inner = (390 - 20) - 3 - 1 - 2 * 17;   // the phone card is calc(100vw - 20px) wide with 17 px side padding and a 3 px + 1 px border (the rule at .wv-tour-card width:calc(100vw - 20px))
  assert.ok(btn >= 44, "back and next stay at least a thumb wide");
  assert.ok(160 + 12 + acts <= inner, `one row fits: ${160 + 12 + acts} <= ${inner}`);
  // the targets this fit must not lose: dots 20 x 44, every button 44 tall
  assert.match(SOURCE, /\.wv-tour-dot \{ position:relative; width:20px; height:44px;/);
  assert.match(SOURCE, /\.wv-tour-acts button \{ min-height:44px; \}/);
  // the words, steps and flow are still WLD-220's
  assert.match(SOURCE, /const TOUR_SLIDES = \[/);
});

test("CORE-54 (Wright 16:57Z): a crowded press on a phone opens the EXISTING chooser in the column: phone only, first in the chain, the same rows and ids, a row a thumb tall", () => {
  assert.match(SOURCE, /function chooserColumnView\(id\) \{\s*const ids = id \? chooserIdsFrom\(id\) : null;\s*if \(!ids \|\| !onPhone\(\)\) return null;/);
  assert.match(SOURCE, /chooser: \{ fill: \(host\) => \{ host\.innerHTML = chooserHTML\(id\); \} \}/, "the viewer's own chooser markup, unchanged");
  assert.match(SOURCE, /const column = chooserColumnView\(selected\) \?\? convoColumnView\(selected\) \?\? parcelColumnView\(selected\)/, "asked first; every other view is asked exactly as before");
  assert.match(readFileSync(new URL("../spectator/home-column.mjs", import.meta.url), "utf8"), /chooser: view\.chooser \?\? null,/, "the column passes the slot on");
  // the click is the one delegate's, unchanged: a row's data-choose selects that mark/conversation
  assert.match(SOURCE, /if \(chosen && isConvoChoiceId\(chosen\.dataset\.choose\)\) \{ selectMark\(chosen\.dataset\.choose\); return; \}\s*if \(chosen\) \{ selectMark\(chosen\.dataset\.choose, \{ scrollCell: true \}\); return; \}/);
  assert.match(SOURCE, /@media \(max-width:720px\), \(pointer:coarse\) \{ \.wv-choose-row \{ min-height:44px; \} \}/);
  // the chooser's content is not redesigned: the bubble path still builds it from the same function
  assert.match(SOURCE, /el\.innerHTML = html;\s*el\.hidden = false;\s*return;/);
});

test("CORE-54: the chooser does not choose for itself: a click counts as a ROW press only if its pointer press began on that row (the touch's own click lands on the row that appeared under the finger)", () => {
  // found in the built capture: pointerup opened the chooser column, then the same touch's click hit its first row and opened that mark
  assert.match(SOURCE, /let chooseDownOn = null;\s*root\.addEventListener\("pointerdown", \(e\) => \{ chooseDownOn = e\.target\.closest\?\.\("\[data-choose\]"\) \?\? null; \}, true\);/);
  assert.match(SOURCE, /const chosen = e\.target\.closest\("\[data-choose\]"\);\s*if \(chosen && e\.detail !== 0 && chooseDownOn !== chosen\) return;/);
  // the guard sits BEFORE both selection branches, and a keyboard activation (detail 0, no pointer) is still a press
  const at = SOURCE.indexOf("if (chosen && e.detail !== 0 && chooseDownOn !== chosen) return;");
  assert.ok(at > 0 && at < SOURCE.indexOf("if (chosen && isConvoChoiceId(chosen.dataset.choose))"), "the guard comes first");
});
