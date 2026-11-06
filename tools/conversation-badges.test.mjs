// conversation-badges.test.mjs — POS-779/b (Darko 2026-10-24): the World page draws
// ONE BADGE PER THREAD, with the conversation icon of the mark-icons family, in
// the map's gray-white, and the 💬 layer is ON by default. Source pins, in the way
// chooser-washes.test.mjs and creature-ring.test.mjs pin the viewer's closure.
// Run: node --test tools/conversation-badges.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARK_ICONS } from "../spectator/mark-icons.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const ruleOf = (sel) => { const at = SOURCE.indexOf(`
${sel} {`); return at < 0 ? "" : SOURCE.slice(at, SOURCE.indexOf("}", at)); };

test("the bubbles layer defaults ON, and its button says so", () => {
  assert.match(SOURCE, /let convoVisible = true;/);
  assert.match(SOURCE, /convoLayer\.style\.display = convoVisible \? "" : "none";/);
  assert.match(SOURCE, /convoHoverLayer\.style\.display = convoVisible \? "" : "none";/);
  assert.match(SOURCE, /<button class="ctl wv-map-convo on"/, "the lit button matches the lit layer");
  assert.match(SOURCE, /if \(convoVisible\) Promise\.resolve\(\)\.then\(\(\) => loadConversations\(\)\)\.then\(drawConversations\)/, "it loads with the map, not on a first click");
});

test("one badge per thread, at the thread's own point, wearing the conversation glyph", () => {
  const draw = SOURCE.slice(SOURCE.indexOf("function drawConversations()"), SOURCE.indexOf("// ── WHERE YOUR OWN PEOPLE ARE GOING"));
  assert.match(draw, /iconSVG\(\{ key: "conversation" \}/, "the family's own glyph");
  assert.match(draw, /px\(t\.at\.x, t\.at\.y\)/, "where the conversation is now, not a box over the ground it crossed");
  assert.doesNotMatch(draw, /<ellipse/, "the wash is gone");
  assert.equal((draw.match(/class="ov-s"/g) ?? []).length, 1, "one counter-scaled badge per thread");
  assert.match(draw, /for \(const t of convoState\.live\) paint\(t, true\)/);
  assert.match(SOURCE, /convoLayer\?\.style\.setProperty\("--wv-mk", overlayScale\(k\)\)/, "sized by the camera like a creature");
});

test("the glyph is in the family, and gray-white", () => {
  assert.ok(MARK_ICONS.conversation);
  assert.match(ruleOf(".wv-convo-disc"), /fill:#cfd6dd;/);
});

test("the hit reach is a badge's, in metres, at the current zoom — nearest first", () => {
  assert.match(SOURCE, /const convoHitM = \(\) => \{/);
  assert.match(SOURCE, /\.sort\(\(a, b\) => a\.d - b\.d\)\.map\(\(o\) => o\.h\)/);
});
