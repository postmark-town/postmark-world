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
  assert.ok(SOURCE.includes("let convoVisible = convoStored() ?? true;"), "on unless the reader chose off");
  assert.match(SOURCE, /convoLayer\.style\.display = convoVisible \? "" : "none";/);
  assert.match(SOURCE, /convoHoverLayer\.style\.display = convoVisible \? "" : "none";/);
  assert.ok(SOURCE.includes("classList.toggle(\"on\", convoVisible)"), "the lit button matches the layer");
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

test("review: a reader who can act opens a thread only from its own disc; the ground beside it still walks (POS-779)", () => {
  assert.match(SOURCE, /const convoClickAt = \(wx, wy\) => \(canAct\(\) \? convosAt\(wx, wy, \{ disc: true \}\)\[0\] \?\? null : convoAt\(wx, wy\)\);/);
  assert.match(SOURCE, /const hit = convoClickAt\(wp\.x, wp\.y\); \/\/ visibility-gated/);
  assert.match(SOURCE, /const hit = wp \? convoClickAt\(wp\.x, wp\.y\) : null;/, "the hand cursor promises what the click does");
  assert.doesNotMatch(SOURCE, /Toggled off \(the default\)/, "the stale comment is gone");
});

test("review: the reader's own choice persists per viewer, in try/catch, and the lit button follows the layer", () => {
  assert.match(SOURCE, /let convoVisible = convoStored\(\) \?\? true;/);
  assert.match(SOURCE, /const convoStored = \(\) => \{ try \{ const v = globalThis\.localStorage\?\.getItem\(CONVO_KEY\)/);
  assert.match(SOURCE, /try \{ globalThis\.localStorage\?\.setItem\(CONVO_KEY, on \? "on" : "off"\); \} catch/);
  assert.match(SOURCE, /convoStore\(on\);/);
  assert.match(SOURCE, /classList\.toggle\("on", convoVisible\)/);
});

// ── POS-779 whole-carrier review W1: a thread on the deck keeps its dashed ring ──
// The ring is the badge's circle (`wv-convo`, plus `is-live`); `is-aboard` is on the badge WRAPPER (`wv-convo-badge`). A rule written for
// `.wv-convo.is-aboard` matches nothing in that markup. The paired check below runs the viewer's own stylesheet text through a small
// cascade (class selectors and descendant combinators, specificity, then source order, which is all these rules use) for the four
// badges a map can hold, built the way the badge's markup builds them.
function cascadeDash(circleClasses, wrapperClasses) {
  const css = SOURCE.slice(SOURCE.indexOf(".wv-faint-ring, .wv-convo {"), SOURCE.indexOf("@keyframes wv-convo-breathe"));
  const rules = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const dash = /stroke-dasharray:\s*([^;]+);?/.exec(m[2]);
    if (!dash) continue;
    for (const sel of m[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",")) rules.push({ sel: sel.trim(), dash: dash[1].trim() });
  }
  const has = (classes, token) => token.split(".").filter(Boolean).every((c) => classes.includes(c));
  let best = null;
  rules.forEach((r, order) => {
    const tokens = r.sel.split(/\s+/);
    const last = tokens.pop();
    if (!has(circleClasses, last)) return;
    // each earlier token must match the wrapper (the only ancestor the markup gives the ring), in order
    if (tokens.length > 1 || (tokens.length === 1 && !has(wrapperClasses, tokens[0]))) return;
    const spec = r.sel.split(/[\s.]+/).filter(Boolean).length;
    if (!best || spec > best.spec || (spec === best.spec && order > best.order)) best = { spec, order, dash: r.dash };
  });
  return best?.dash ?? null;
}

test("W1 · the badge markup puts is-aboard on the wrapper and is-live on the ring (the shape the stylesheet must serve)", () => {
  assert.match(SOURCE, /class="wv-convo-badge\$\{live \? " is-live" : " is-cooling"\}\$\{t\.aboard \? " is-aboard" : ""\}"/);
  assert.match(SOURCE, /<circle r="\$\{CONVO_BADGE_R\}" class="wv-convo\$\{live \? " is-live" : ""\}"\/>/);
});

test("W1 · deck ON: a thread on the deck is dashed whether it is live or cooling; deck OFF: live is solid and cooling is the dotted day line", () => {
  const ring = (live) => ["wv-convo", ...(live ? ["is-live"] : [])];
  const badge = (live, aboard) => ["wv-convo-badge", live ? "is-live" : "is-cooling", ...(aboard ? ["is-aboard"] : [])];
  assert.equal(cascadeDash(ring(true), badge(true, true)), "6 5", "deck, live");
  assert.equal(cascadeDash(ring(false), badge(false, true)), "6 5", "deck, cooling");
  assert.equal(cascadeDash(ring(true), badge(true, false)), "none", "ground, live: solid, breathing");
  assert.equal(cascadeDash(ring(false), badge(false, false)), "3 4", "ground, cooling: the shared dotted line");
});

test("W1 · the retired selector is gone: no rule names `.wv-convo.is-aboard`", () => {
  assert.doesNotMatch(SOURCE, /\.wv-convo\.is-aboard/);
});
