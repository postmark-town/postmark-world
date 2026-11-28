// viewer-shell-css.test.mjs — the 2D viewer's shell CSS is exported in three
// slices, and the page still emits the same bytes it always did (WLD-144, W2;
// WLD-105: "Where the World exports a thing, import it").
//
// The 3D view kept a copy of three slices of 2D's `STYLE` string: the `.wv` root
// rule, the `.wv-extent*` rules and the `.wv-enter` rules, and its copy drifted.
// `spectator/viewer.mjs` now exports each slice (WV_ROOT_CSS, WV_EXTENT_CSS,
// WV_ENTER_CSS) and `STYLE` interpolates it at the slice's original place. These
// tests hold that nothing 2D emits moved:
//
//   1. The STYLE text 2D actually emits is obtained through the real emission
//      path: `mountViewer` assigns `styleTag.textContent = STYLE` and appends the
//      tag to its host; a minimal DOM stub captures that text at the append and
//      aborts the mount there. (Nothing is reconstructed from the source.)
//   2. Its sha256 is compared with a digest pinned from main's emitted STYLE,
//      computed at the base commit by a separate route (below).
//   3. Each constant appears in the emitted STYLE exactly once, between the
//      neighbours it sat between.
//   4. Importing the viewer in node touches no browser global.
//
// No resident data is read here.
//
// THE PINNED DIGEST. A changed CSS byte, a changed comment or whitespace, or a
// reordered interpolation changes the digest and fails test 2. A future,
// INTENDED change to STYLE must update the pin knowingly: recompute it the way
// the provenance below says and say why in the PR.
//
// One thing is masked before hashing. STYLE also interpolates HOME_COLUMN_CSS
// (spectator/home-column.mjs) and MARK_ICON_CSS (spectator/mark-icons.mjs).
// Those belong to other modules and other lanes; hashing their bytes would make
// this test red for an edit to them. Each is replaced, at its place, by a fixed
// token before hashing, so a moved, dropped or doubled interpolation of either
// still fails, but their own CSS is theirs to change.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { mountViewer, WV_ROOT_CSS, WV_EXTENT_CSS, WV_ENTER_CSS } from "../spectator/viewer.mjs";
import { HOME_COLUMN_CSS } from "../spectator/home-column.mjs";
import { MARK_ICON_CSS } from "../spectator/mark-icons.mjs";

// PROVENANCE. sha256 of the masked STYLE that main's `spectator/viewer.mjs`
// emitted at base commit 82e2353250d4946e538225353ade9afd36a9dd21 (viewer.mjs
// blob sha256 c905811c…), 106507 bytes (UTF-8). Computed by a one-off script
// that was not this test's code: it wrote `git show 82e23532:spectator/viewer.mjs`
// to a scratch file beside symlinks to the real spectator/ and tools/, ran that
// file's own `mountViewer` under a stub DOM that captured `styleTag.textContent`
// at `appendChild`, masked the two foreign interpolations as below, and hashed.
// A second route agreed byte for byte: cutting the `const STYLE = \`...\`` literal
// out of that file's text and evaluating it with the real HOME_COLUMN_CSS and
// MARK_ICON_CSS. (Unmasked, the same text was 123904 bytes with sha256
// 1a92f751f9ab748dca13dc6c3effaaf00902e4446636d76f62a45edea85880e3; it is not
// asserted, because it moves with the other two modules' CSS.)
//
// RE-PINNED IN THE WLD-144 BATCH (PR #356), because main moved. Main 3cc1d218 (POS-823, the outsider-lens note)
// added the `.wv-lens-note` rules to STYLE, 628 bytes, so the digest above no longer describes main. The pin below is
// sha256 of the masked STYLE that main's OWN `spectator/viewer.mjs` emits at 3cc1d218b0adc250ba423b139ff7d97a920294e9,
// 107135 bytes, measured by the same one-off route as above (the file written beside symlinks
// to the real spectator/ and tools/, its own `mountViewer` under a stub DOM). The same script run on the base
// 82e23532 reproduced the old digest, and run on the batch head gave this digest too: the batch emits main's STYLE
// byte for byte.
//
// RE-PINNED IN POS-779 (World #306, the conversation badge), an INTENDED change to STYLE: the branch adds the badge's CSS
// (a two-line comment and five `.wv-convo-disc` / `.wv-convo-badge` rules, 7 lines, 433 bytes, nothing removed or changed)
// between the existing rules. The pin below is sha256 of the masked STYLE that `spectator/viewer.mjs` at c78042ec8d915e970f7e70f6edf830543c6ebdab
// (blob bb9a2e3d14390161f7ae378cb29d6f1d3a9a0c30) emits, 107568 bytes, measured by the same one-off route as above (the commit's
// `viewer.mjs` written to a scratch file beside symlinks to the real spectator/ and tools/, its own `mountViewer` under a stub DOM,
// the two foreign interpolations masked, hashed): not this test's code, and not computed from the code under test at run time.
// That route, run on main 8a2c13d834d6a7d1475367ff6346ff936b90d3df and on 3cc1d218 above, reproduced the 107135-byte digest
// 94d56a4157be8427e46c0a1854ae319b1aea22cfea64978538491f2b410361a7; a line diff of the two masked texts is exactly those 7 added lines.
//
// RE-PINNED IN POS-779 (World #306, review W1), an INTENDED change to STYLE: the dead rule `.wv-convo.is-aboard` (the class sits on the badge
// wrapper, so it matched nothing) becomes `.wv-convo-badge.is-aboard .wv-convo`, with a one-line comment: 143 bytes added, nothing else moved.
// The pin below is sha256 of the masked STYLE that `spectator/viewer.mjs` at 690822c0df87822eaccbe3963e11100df9b6e3cb (blob
// c442c0bf9f500ddbf37423c8e36780875d6ecad3) emits, 107711 bytes, by the same one-off route (the commit's file written beside symlinks to the
// real spectator/ and tools/, its own `mountViewer` under a stub DOM, the two foreign interpolations masked, hashed), not this test's code.
// The same script reproduced both digests above on their commits: 94d56a41… (107135 bytes) on main 8a2c13d8 and d50d860c… (107568 bytes)
// on c78042ec.
//
// RE-PINNED FOR POS-945 ("In town by mail", the list beside the map), knowingly, over this main (the pin above): STYLE gains the
// `.wv-bymail*` rules, a one-line comment and six rules over 7 lines, 8 added lines in all, 819 bytes (107711 -> 108530), nothing removed or
// changed. The pin below is sha256 of the masked STYLE that `spectator/viewer.mjs` of the POS-945 branch merged with main emits, by the same
// one-off route (the file written beside symlinks to the real spectator/ and tools/, its own `mountViewer` under a stub DOM, the two foreign
// interpolations masked, hashed), not this test's code and not computed from the code under test at run time. That route reproduced the three
// digests it is checked against: 94d56a41… (107135 bytes) on the POS-945 merge-base, ed771ead… (107711 bytes, the pin above) on this main,
// and 37ddf8f8… (107954 bytes, the pin the reviewed head 6f4c906a carried) on that head. A line diff of the masked texts, main to the merge,
// is exactly the 8 `.wv-bymail*` lines and none removed, the same 8 lines the reviewed head added over its own base.
// RE-PINNED IN CORE-127 (World viewer filters, PR #417), an INTENDED change to STYLE: the display-filter opener, its desktop popover and
// its 390 px sheet (`.wv-filters-open`, `.wv-dpanel`, `.wv-dstrip`, `.wv-dfilter-host`) add 4075 bytes of CSS and nothing else moved (a line
// diff of the masked texts, main 6928feab to the head, is added lines only).
// CORE-54's account, as main carries it (Darko 2026-11-20, "4. Small targets"), knowingly, an INTENDED change to STYLE over the pin above: the phone/touch hit-area
// rules (the round map controls and root mark, the tour's three buttons and step dots, the mark bubble's close) and the touch-reach constants' CSS
// neighbours: 1877 bytes added (108530 -> 110407), nothing removed or changed; then the chooser row's 44 px reach (`.wv-choose-row`, one media rule,
// 190 bytes, 110407 -> 110597) when the crowded press's choices joined the phone column (Wright 16:57Z). The digest below was measured by this test's own masked-emission route
// on the CORE-54 branch (the same route the earlier pins' last paragraph names), not by an independent script, and is checked by the test below that the pin
// can fail; the base digest 31265315… (108530 bytes) is what main emitted before the branch.
// RE-PINNED AGAIN FOR CORE-54, knowingly, after merging main 50fbbaf7: the chooser row's media rule MOVED (same bytes, 110597 still) from between CREATURE_CSS
// and `.wv-choose-row.is-convo` to after `.wv-choose-row.is-creature`, because viewer-creature-nameplate pins CREATURE_CSS's neighbours. Only that one line's
// position changed (e6974c7c… -> faa58492…); no rule was added or removed.
// RE-PINNED A THIRD TIME FOR CORE-54 (lead fix, 2026-11-20 20:01Z): the 390 px tour foot FIT. The published 0dae4132/c300 tour frame showed "next" spilling past the card (the 8 step dots at
// 20 px plus skip/back/next at 192 px did not fit the ~160 px beside them). One media block gains 6 lines / 571 bytes (110597 -> 111168), nothing removed or changed: the foot may wrap, the
// actions sit 4 px apart and right-aligned, skip's padding 6 px and back/next 8 px a side (each still at least 44 px wide and 44 px tall). Measured by this test's own masked-emission route.
// RE-PINNED FOR WLD-220 (Wright 2026-11-21 06:17: the tour's last step links /docs/), knowingly, AFTER merging main 01e29a17 (which carries CORE-54's pin above): the WLD-220 branch's ONE added rule,
// `.wv-tour-body a` (the card's blue, underline offset, and a comment), 196 bytes, on top of main's STYLE (111168 -> 111364), nothing removed or moved. Measured by this test's own masked-emission
// route on the merged WLD-220 branch (the same route the pins above name). Alone on its old base the rule was 108530 -> 108726 (955f7eb3...); main has since moved to CORE-54's 111168.
// RE-PINNED FOR THE WLD-220 VISUAL REBUILD (Darko 2026-11-21 18:14/18:15 EST: use the actual visuals; the join flow's theme; fewer, larger words), knowingly, an INTENDED change to STYLE over the pin
// above: the tour's own rules only, every one under `.wv-tour` / `.tv-*` (the join-flow headline, soft text, paper picture panel and progress dots, the picture classes, the control row), +2779 bytes
// (111364 -> 114143), nothing outside the tour touched. Measured by this test's own masked-emission route on the WLD-220 branch (the same route the pins above name).
// RE-PINNED FOR THE WLD-220 FIX (containment of tall cards, the Look around picture): +1410 bytes (114143 -> 115553), again only .wv-tour / .tv-* rules (the card as a bounded
// flex column, its scrolling area, the short-screen reflow, the pointer mark). Whole account over the prior tour's 111364 (main's 111168 plus the earlier 196-byte docs rule): +4189 (2779 + 1410).
// RE-PINNED FOR THE WLD-220 NARROW-SHORT FIX: +134 bytes (115553 -> 115687): the side-by-side reflow's media query gains `and (min-width:640px)` and its comment now names the narrow
// short phone (a 360 x 560 phone keeps one column); nothing else in STYLE moves. Whole account over the prior tour's 111364: +4323. The earlier "+2634" figure here and
// "113998" in tools/viewer-creature-nameplate.test.mjs were stale intermediate measurements (111364 -> 113998 is +2634; the pin that landed was 114143, +2779).
// RE-PINNED FOR THE WLD-220 REAL-PAGE CORRECTION (Darko 2026-11-21 22:01 EST: "the tour needs to take assets directly from the actual world page"): the tour no longer draws pictures, so
// every `.wv-tour-visual` / `.tv-*` rule (the paper panel, the labels, the controls row, the pointer) and the short-screen two-column reflow are REMOVED, and the short-screen block
// is a plain tightening at every width: -2411 bytes (115687 -> 113276). Whole account over the prior tour's 111364: +1912 (the join-flow theme, the bounded scrolling card and the
// compact short-screen block, less the removed picture rules). Only .wv-tour rules move; measured by this test's own masked-emission route.
// RE-PINNED FOR CORE-54 / WLD-220's TOUR ICONS (Darko 2026-11-22 00:31: the card shows the map's own house and resident), knowingly, an INTENDED change to STYLE: the card's icon rows (.tour-line, .tour-slot,
// .tour-ic, all under .wv-tour-body and a comment), +442 bytes (113276 -> 113718), nothing else moved. Measured by this test's own masked-emission route.
// MAIN'S OWN ACCOUNT, kept (CORE-127, refreshed at main 1054c91d): main's pin was d8d98631… at 111168 bytes; CORE-127's STYLE adds 4075 bytes of added lines on top (the merge was line-clean in STYLE),
// so main's count is 111168 + 4075 = 115243 (digest 9966505163…).
// RE-PINNED FOR THE MERGE OF main f4e12a54 (CORE-127 and WLD-211 over this branch): the tour's own net change over main's old 111168 is +2550 bytes (113718 - 111168), all under .wv-tour / .wv-tour-body;
// main's CORE-127 STYLE adds 4075 on top of 111168 (115243). The merge is line-clean in STYLE, so the expected count is 115243 + 2550 = 117793.
// RE-PINNED IN CORE-147 (the icon dropdown, Darko 2026-11-21; accepted pin 6aaf9552), an INTENDED change to STYLE over main's 117793 (digest 932bbdbe…): the icon switches' CSS (`.wv-dlayers`, `.wv-dlayer*`,
// the phone sheet's three columns) adds 1276 bytes of added lines (the 💬 button was markup, not STYLE): 117793 + 1276 = 119069 expected (the merge of main b4e1fa53 is line-clean in STYLE). The digest below is
// the one this test's own masked-emission route printed for the merged tree (run through run-heavy on b4e1fa53 + this branch; full output /var/tmp/core-147-integrate/measure.out); not copied from either side.
const PINNED_MASKED_STYLE_SHA256 = "fad76d8d99c9c33ceb8af4197ef4b308064346d6b565473d2d26bc62e3d584ad";
const PINNED_MASKED_STYLE_BYTES = 119069;

const HOME_TOKEN = "\u0000HOME_COLUMN_CSS\u0000";
const ICON_TOKEN = "\u0000MARK_ICON_CSS\u0000";

// What mountViewer writes into its <style> tag, via the real path.
function emittedStyle() {
  const STOP = new Error("style captured");
  let captured = null;
  const had = Object.getOwnPropertyDescriptor(globalThis, "document");
  globalThis.document = { createElement: (tag) => ({ tag, textContent: "" }) };
  const host = {
    classList: { add() {} },
    appendChild(el) {
      if (el.tag === "style") { captured = el.textContent; throw STOP; }
    },
  };
  try {
    mountViewer(host);
  } catch (e) {
    if (e !== STOP) throw e;
  } finally {
    if (had) Object.defineProperty(globalThis, "document", had); else delete globalThis.document;
  }
  assert.equal(typeof captured, "string", "mountViewer wrote a <style> text");
  return captured;
}

function mask(style) {
  let s = style;
  for (const [css, token] of [[HOME_COLUMN_CSS, HOME_TOKEN], [MARK_ICON_CSS, ICON_TOKEN]]) {
    const parts = s.split(css);
    assert.equal(parts.length, 2, `${token.slice(1, -1)} is interpolated exactly once`);
    s = parts.join(token);
  }
  return s;
}

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const count = (hay, needle) => hay.split(needle).length - 1;

const STYLE = emittedStyle();
const MASKED = mask(STYLE);

test("emitted bytes: the STYLE 2D emits is byte-for-byte main's (pinned digest)", () => {
  assert.equal(Buffer.byteLength(MASKED, "utf8"), PINNED_MASKED_STYLE_BYTES, "same length as main's");
  assert.equal(sha256(MASKED), PINNED_MASKED_STYLE_SHA256, "same bytes as main's");
});

test("emitted bytes: the pin can fail (a changed byte, a reordered interpolation)", () => {
  const ok = (s) => sha256(s) === PINNED_MASKED_STYLE_SHA256 && Buffer.byteLength(s, "utf8") === PINNED_MASKED_STYLE_BYTES;
  assert.equal(ok(MASKED), true, "control: the real text passes");
  // one CSS byte
  assert.equal(ok(MASKED.replace("opacity:.8; }", "opacity:.9; }")), false, "a changed CSS byte is caught");
  assert.equal(ok(MASKED.replace("--amber:#e8c56a", "--amber:#e8c56b")), false, "a changed default is caught");
  // a comment, whitespace
  assert.equal(ok(MASKED.replace("/* the door, on the card it belongs to */", "/* the door */")), false, "a changed comment is caught");
  assert.equal(ok(MASKED.replace(".wv-enter:hover {", ".wv-enter:hover  {")), false, "a changed space is caught");
  // a reordered interpolation: swap the extent and enter slices at their places
  const swapped = MASKED.split(WV_EXTENT_CSS).join("\u0001E").split(WV_ENTER_CSS).join(WV_EXTENT_CSS).split("\u0001E").join(WV_ENTER_CSS);
  assert.notEqual(swapped, MASKED, "control: the swap changed the text");
  assert.equal(ok(swapped), false, "a reordered interpolation is caught");
  // the foreign interpolations too
  const home = MASKED.split(HOME_TOKEN).join("\u0001H").split(ICON_TOKEN).join(HOME_TOKEN).split("\u0001H").join(ICON_TOKEN);
  assert.equal(ok(home), false, "swapping HOME_COLUMN_CSS and MARK_ICON_CSS is caught");
});

test("slices: each constant appears in the emitted STYLE once, between its neighbours", () => {
  for (const [name, css] of [["WV_ROOT_CSS", WV_ROOT_CSS], ["WV_EXTENT_CSS", WV_EXTENT_CSS], ["WV_ENTER_CSS", WV_ENTER_CSS]]) {
    assert.equal(typeof css, "string", `${name} is a string`);
    assert.equal(count(STYLE, css), 1, `${name} appears exactly once`);
  }
  // the root rule is the very first thing STYLE says, and ends where the next rule starts
  assert.ok(STYLE.startsWith("\n" + WV_ROOT_CSS + "\n.wv * { box-sizing:border-box; }\n"), "root first, then `.wv *`");
  // the extent rules sit after `.wv-chip.dim` and before `.wv-cluster`
  assert.ok(STYLE.includes(".wv-chip.dim { opacity:.6; }\n" + WV_EXTENT_CSS + "\n.wv-cluster {"), "extent between chip.dim and cluster");
  // the door sits after the plaque's company rules and before the cross sheet
  assert.ok(
    STYLE.includes(".wv-int-plaque > .wv-int-company:first-child { margin-top:0; }\n" + WV_ENTER_CSS + "\n.wv-cross-sheet.is-far .wv-walk-enter {"),
    "enter between the plaque and the cross sheet",
  );
  const at = (css) => STYLE.indexOf(css);
  assert.ok(at(WV_ROOT_CSS) < at(WV_EXTENT_CSS) && at(WV_EXTENT_CSS) < at(WV_ENTER_CSS), "root, then extent, then enter");
});

test("slices: what each one holds", () => {
  // root: the one `.wv { … }` rule, comments and all
  assert.ok(WV_ROOT_CSS.startsWith(".wv { --night:#14171d;") && WV_ROOT_CSS.endsWith("min-height:100vh; }"));
  assert.equal(count(WV_ROOT_CSS, "\n.wv "), 0, "a single rule: nothing else selected on .wv");
  assert.ok(WV_ROOT_CSS.includes("/* ember — \"this is you\""), "its comments travel with it");
  assert.ok(WV_ROOT_CSS.includes("/* COMMONS MARKS WEAR POSTMARK GOLD"), "the gold comment travels with it");
  // extent: four rules
  assert.deepEqual(
    WV_EXTENT_CSS.split("\n").map((l) => l.slice(0, l.indexOf(" {"))),
    [".wv-extent", ".wv-extent svg", ".wv-extent svg rect, .wv-extent svg polygon", ".wv-extent-t"],
  );
  // enter: the comment line, the door, its hover, its disabled state
  assert.deepEqual(
    WV_ENTER_CSS.split("\n").filter((l) => !l.startsWith("  ")).map((l) => (l.startsWith("/*") ? l : l.slice(0, l.indexOf(" {")))),
    ["/* the door, on the card it belongs to */", ".wv-enter", ".wv-enter:hover", ".wv-enter[disabled]"],
  );
});

test("defaults: amber and gold stay as the defaults, on .wv; nothing seasonal is baked in", () => {
  // the defaults, exactly as main has them
  for (const decl of ["--amber:#e8c56a;", "--amber-dark:#b8964a;", "--pm-gold:#e8c48b;", "--pm-gold-bright:#f6dcae;", "--you:#e0654a;"]) {
    assert.equal(count(WV_ROOT_CSS, decl), 1, `${decl} is a default on .wv`);
  }
  // a host's season frame overrides these on the actual .wv: so no other rule in
  // the shell redefines them, and none of the three slices reaches for :root,
  // the calendar, or a media query
  for (const prop of ["--amber:", "--amber-dark:", "--pm-gold:", "--pm-gold-bright:"]) {
    assert.equal(count(STYLE, prop), 1, `${prop} is defined once in the whole emitted STYLE (the .wv default)`);
  }
  assert.equal(count(STYLE, ":root"), 0, "no :root promotion anywhere in the emitted STYLE");
  for (const css of [WV_ROOT_CSS, WV_EXTENT_CSS, WV_ENTER_CSS]) {
    assert.equal(/:root|@media|\bDate\b|\bnew Date|getMonth/.test(css), false, "no :root, media query or calendar logic");
  }
  // the extent and enter slices define no custom property of their own: they
  // read the root's, so the host's override reaches them
  for (const css of [WV_EXTENT_CSS, WV_ENTER_CSS]) assert.equal(/(^|[\s;{])--[\w-]+\s*:/.test(css), false, "reads the root's variables, defines none");
  assert.ok(WV_ENTER_CSS.includes("border:1px solid var(--amber-dark)") && WV_ENTER_CSS.includes("color:var(--amber)"));
});

test("import purity: spectator/viewer.mjs imports in node with no DOM and touches no browser global", () => {
  // A fresh process, with every browser global booby-trapped: reading one at
  // import time (even through `typeof`) records it. The three slices must come
  // out as plain strings with nothing read from a page.
  const VIEWER_URL = new URL("../spectator/viewer.mjs", import.meta.url).href;
  const probe = `
    const trap = ["window", "document", "navigator", "localStorage", "sessionStorage", "location",
      "requestAnimationFrame", "HTMLElement", "customElements", "history", "screen"];
    const touched = [];
    for (const k of trap) Object.defineProperty(globalThis, k, { configurable: true, get() { touched.push(k); return undefined; } });
    const m = await import(${JSON.stringify(VIEWER_URL)});
    process.stdout.write(JSON.stringify({ touched, kinds: [typeof m.WV_ROOT_CSS, typeof m.WV_EXTENT_CSS, typeof m.WV_ENTER_CSS, typeof m.mountViewer] }));
  `;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", probe], { encoding: "utf8", timeout: 60_000 });
  assert.deepEqual(JSON.parse(out), { touched: [], kinds: ["string", "string", "string", "function"] });
});
