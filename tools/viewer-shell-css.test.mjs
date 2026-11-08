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
// RE-PINNED FOR POS-945 ("In town by mail", the list beside the map), knowingly: STYLE gains the `.wv-bymail*` rules, 819 bytes
// (107135 -> 107954), and nothing else moved. The pin is sha256 of the masked STYLE this file's own mount emits at the POS-945 head.
const PINNED_MASKED_STYLE_SHA256 = "37ddf8f8ef8c850058d84437666e948b2e4a67bd852e2e50a13a44f264eae621";
const PINNED_MASKED_STYLE_BYTES = 107954;

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
