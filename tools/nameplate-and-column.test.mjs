// nameplate-and-column.test.mjs — the playground sitting's three levels, as the
// page wires them (Darko, 2026-10-15): the hover's dot steps aside for the
// nameplate, a click inside a mark's ground selects that ground, and the mounted
// room's plate opens the room's column. Source pins: the page itself is a
// browser's to drive, and these say only that the lines were written.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

test("[pin] a hovered mark is its outline and a faint fill in its own colour, with no dot; a selected one is lit as before", () => {
  const fn = SOURCE.match(/function renderMarkHighlight\(\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(fn, /renderOneMarkHighlight\(selectedId\)/, "the selection's highlight is unchanged");
  assert.match(fn, /renderOneMarkHighlight\(glance, \{ hover: true \}\)/, "the hover's is asked for as a hover");
  // CHANGED by play fix 37 (Darko 19:29, 19:39): the pip under an open pill
  // steps aside, and no mark is ever lit by a swollen dot, hovered or selected
  assert.match(fn, /syncHiddenPips\(pillPipIds\(\)\);/, "the pips the pills stand over step aside");
  assert.doesNotMatch(SOURCE, /class="wv-hl-dot \$\{t\}"/, "no swollen dot on a mark, hovered or selected");
  assert.match(SOURCE, /\.wv-hl-box\.is-hover\.t-market \{ fill:color-mix\(in srgb, var\(--pm-gold\) 13%, transparent\); \}/, "a faint fill in the mark's own colour");
  assert.match(SOURCE, /\.ov-s\.is-hovering > \.ov-pip, \.ov-s\.is-hovering > \.ov-pip-door, \.ov-s\.is-hovering > \.ov-ic-in \{ opacity:0; \}/,
    "the pip is hidden, not removed — and the icon drawn into it (fix 13) goes with it");
  assert.match(SOURCE, /<span class="wv-np-dot \$\{markClasses\(full\)\}" aria-hidden="true"><\/span>/, "the plate wears the dot beside the name");
});

test("[pin] a click on open ground inside a mark selects that ground and still walks to the exact spot", () => {
  const at = SOURCE.indexOf("…AND THE GROUND YOU CLICKED IS SELECTED");
  assert.ok(at > 0);
  const block = SOURCE.slice(at, at + 2200);
  assert.match(block, /smallestContainingMark\(worldPoint, toldHere\(\), \{ insideRoomId: sceneRoomId \}\)/, "the hover's own containment rule picks the ground");
  // CHANGED by play fix 38: both halves now ride one pure rule (mapClickPlan),
  // tested in click-in-extent-still-walks.test.mjs
  assert.match(block, /markInteraction\.select\(plan\.select\);\s*if \(plan\.walkTo\) \{ chooseWalkPoint\(plan\.walkTo\.x, plan\.walkTo\.y\);/,
    "selected directly (never selectMark's walk to a mark's centre), then the walk to the clicked point");
  // the precedence before it is untouched: faces first, then the contested chooser, then a pip
  const up = SOURCE.slice(SOURCE.indexOf('svg.addEventListener("pointerup"'), at);
  assert.ok(up.indexOf("peopleHere") < up.indexOf("openChooser(contested)") && up.indexOf("openChooser(contested)") < up.indexOf("selectMark(markId"),
    "a face, then the chooser, then a pip, then the ground");
});

test("[pin] every mark's column, including the room you are in", () => {
  // play fix 35 put the live creatures' column in the chain, before the marks'
  assert.match(SOURCE, /const column = parcelColumnView\(selected\) \?\? regionColumnView\(selected\) \?\? (creatureColumnView\(selected\) \?\? )?(residentColumnView\(selected\) \?\? )?markColumnView\(selected\);/);
  const fn = SOURCE.match(/function markColumnView\(id\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(fn, /region: id === sceneRoomId \? "you are inside" : where\.detail,/, "the mounted room's plate opens its column, which says where you are");
  // CHANGED by play fix 34 (Darko 18:25): the column opens in both view modes
  assert.match(fn, /if \(!id\) return null;/, "every selected mark has a column, Telling open or not");
});
