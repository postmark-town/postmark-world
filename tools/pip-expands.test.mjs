// pip-expands.test.mjs — play fix 37 (Darko, playground 2026-10-15 19:29 and
// 19:39): the pip itself opens sideways into its pill — icon, name, badges —
// anchored where it stands, in the same frame as the highlight; the selected
// mark wears the same pill, held open and ringed; no mark is lit by a swollen
// dot. Source pins: the page is a browser's to drive (the headless shots are in
// Starstory docs/2026-10-15/world-ui/after37-*.png).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const fn = (name) => SOURCE.match(new RegExp(String.raw`function ${name}\([^)]*\) \{[\s\S]*?\n  \}\n`))?.[0] ?? "";

test("[pin] a mark with a visible pip opens a pill instead of a nameplate; a parcel or a pictured mark keeps its nameplate", () => {
  const vis = fn("visiblePip");
  assert.match(vis, /ov-pip-home/, "a parcel's pip is under its card, so it has no pill");
  assert.match(vis, /ov-pip-pictured/, "nor a mark wearing its picture");
  assert.match(SOURCE, /&& !visiblePip\(hoveredId\) \? hoveredId : null;/, "the floating nameplate stands down for a pip that opens");
});

test("[pin] the pill is the pip opened: its cap is the pip (the icon only where the pip wears one), then the name, then the badges", () => {
  const html = fn("markPillHTML");
  assert.ok(html.indexOf("wv-pill-cap") < html.indexOf("wv-pill-name") && html.indexOf("wv-pill-name") < html.indexOf("wv-pill-badges"));
  assert.match(html, /what && near \?/, "the cap's icon only at street zoom, as the pip's");
  const pos = fn("positionPill");
  assert.match(pos, /r\.x \+ r\.width \/ 2 - b\.x - h \/ 2/, "its cap's centre on the pip's centre: anchored where the pip stands");
  assert.match(SOURCE, /\.wv-pill \{[^}]*max-width:var\(--h\);[^}]*transition:max-width \.16s ease-out;/, "folded, it is exactly the pip; it opens sideways");
  assert.match(SOURCE, /\.wv-pill\.is-open \{ max-width:/);
});

test("[pin] no timer: the pill opens with the highlight, and the glance's delay is gone", () => {
  const rg = fn("raiseGlance");
  assert.match(rg, /paintGlance\(el, id\);/, "the glance is painted in the same call that raises it");
  assert.doesNotMatch(rg, /setTimeout/, "no timer between the hover and the plate");
  assert.doesNotMatch(SOURCE, /GLANCE_DELAY_MS/, "the delay constant is gone, not held at 0");
  const rb = fn("renderBubbles");
  assert.ok(rb.indexOf("renderPills();") > 0 && rb.indexOf("renderPills();") < rb.indexOf("if (!state.paintingOnly) {"),
    "decided in the same pass as the column and the highlight, in both view modes");
});

test("[pin] one family of states: selected wears the same pill, ringed; selected-and-hovered is that one pill", () => {
  const rp = fn("renderPills");
  assert.match(rp, /const sel = onPane\(selectedId\) && visiblePip\(selectedId\) \? selectedId : null;/);
  assert.match(rp, /if \(!hov \|\| hov === sel \|\| !visiblePip\(hov\)\) hov = null;/, "a hovered selected mark is its selected pill, not a second one");
  assert.match(SOURCE, /\.wv-pill\.is-selected \{ box-shadow:/, "the selected ring");
  assert.doesNotMatch(SOURCE, /class="wv-hl-dot \$\{t\}"/, "never the old swollen dot");
});

test("[pin] the map keeps the pointer: an open pill is its mark's box for the hover and the press; only its icons take the pointer", () => {
  assert.match(SOURCE, /pillAt\(event\.clientX, event\.clientY\)   \/\/ an open pill is its mark's own box/);
  assert.match(SOURCE, /const pillHit = pillAt\(e\.clientX, e\.clientY\);\s*if \(pillHit\) \{ selectMark\(pillHit, \{ scrollCell: true \}\); return; \}/);
  assert.match(SOURCE, /\.wv-pill \{[^}]*pointer-events:none;/, "a drag that starts on a pill still pans");
  assert.match(SOURCE, /\.wv-pill \.wv-icw \{ pointer-events:auto; cursor:help; \}/, "its icons say what they mean");
});
