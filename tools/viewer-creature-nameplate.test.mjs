// viewer-creature-nameplate.test.mjs — the 2D viewer exports its creature nameplate
// and its creature CSS, and the page still renders and emits what it always did
// (WLD-144, W3; WLD-105: "Where the World exports a thing, import it").
//
// The 3D view kept a copy of 2D's `creatureNameplateHTML` (a closure inside
// `mountViewer`) and of the creature token CSS (a slice of the `STYLE` string).
// `spectator/viewer.mjs` now exports `creatureNameplateHTML(c)` at the top level,
// taking the creature row, and `CREATURE_CSS`, which `STYLE` interpolates at the
// slice's original place. These tests hold that nothing 2D shows moved:
//
//   A. HELPER. `creatureNameplateHTML(row)` equals, byte for byte, the old
//      closure run on the same rows. The old closure's text is carried below as
//      the oracle (copied from base 82e23532) and evaluated; the rows are
//      invented. A missing row is "", the identity is escaped, the icon and name
//      markup are the old markup.
//   B. THE CONTRACT. The old function escaped the lookup KEY into
//      `data-nameplate`; the new one escapes `c.id`. They are the same string
//      because the one writer of the map sets `liveCreatures.set(c.id, c)`
//      (`loadLiveCreatures`, base viewer.mjs line 14687) from rows that
//      `liveCreaturesFrom` builds with `id: String(c.id)`. Pinned as a text pin
//      (the writer lives inside `mountViewer`, which a test cannot drive) plus a
//      behavioural reader beside it.
//   C. THE WIRING. The one call site passes `liveCreatures.get(id)`; the closure
//      is gone from `mountViewer`.
//   D. EMITTED BYTES. The STYLE text 2D emits, obtained through the real emission
//      path (`mountViewer` under a stub DOM that captures `styleTag.textContent`
//      and aborts the mount), has the sha256 pinned from base main by a separate
//      route (below). `CREATURE_CSS` appears once, between its neighbours.
//   E. Importing the viewer in node touches no browser global.
//
// No resident data and no fixture is read here: the rows are invented, the only
// file read is spectator/viewer.mjs itself.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mountViewer, creatureNameplateHTML, creatureIcon, liveCreaturesFrom, CREATURE_CSS } from "../spectator/viewer.mjs";
import { iconsHTML, MARK_ICON_CSS } from "../spectator/mark-icons.mjs";
import { HOME_COLUMN_CSS } from "../spectator/home-column.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const count = (hay, needle) => hay.split(needle).length - 1;

// ── A. THE HELPER ─────────────────────────────────────────────────────────────

// THE ORACLE: base main's (82e23532) `esc` (spectator/viewer.mjs line 66) and
// `creatureNameplateHTML` closure (lines 14735-14741), verbatim. The closure read
// `liveCreatures` (a Map) from `mountViewer`'s scope; here it is given one.
const OLD_ESC = String.raw`const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");`;
const OLD_CLOSURE = String.raw`  function creatureNameplateHTML(id) {
    const c = liveCreatures.get(id);
    if (!c) return "";
    return '<div class="wv-nameplate" data-nameplate="' + esc(id) + '">'
      + '<span class="wv-np-what">' + iconsHTML([creatureIcon()]) + '</span>'
      + '<span class="wv-np-name">' + esc(c.name) + '</span></div>';
  }`;
// the oracle needs the map the closure reads: build one closure per map
const oldFor = (liveCreatures) => new Function("iconsHTML", "creatureIcon", "liveCreatures",
  OLD_ESC + "\n" + OLD_CLOSURE + "\nreturn creatureNameplateHTML;")(iconsHTML, creatureIcon, liveCreatures);

// invented rows (liveCreaturesFrom's shape: { id, kind, name, x, y, fades_in })
const ROWS = [
  { id: "creature:fox-9-test", kind: "fox", name: "Ember", x: 1, y: 2, fades_in: null },
  { id: "creature:moth-1-test", kind: "moth", name: "a moth of <b>\"some\"</b> & more", x: 0, y: 0, fades_in: null },
  { id: "creature:odd\"><img src=x onerror=alert(1)>-1", kind: "bat", name: "Odd", x: 3, y: 4, fades_in: null },
  { id: "creature:amp&lt;-2", kind: "owl", name: "A & B", x: 5, y: 6, fades_in: null },
  { id: "creature:nameless-3-test", kind: "wolf", name: undefined, x: 7, y: 8, fades_in: null },
  { id: "creature:numbered-4-test", kind: "crow", name: 42, x: 9, y: 10, fades_in: null },
  { id: "creature:empty-5-test", kind: "frog", name: "", x: 11, y: 12, fades_in: null, ring_m: 30 },
];

test("helper: equals the old closure, byte for byte, on invented rows", () => {
  const map = new Map(ROWS.map((r) => [r.id, r]));
  const old = oldFor(map);
  for (const r of ROWS) {
    const was = old(r.id);
    assert.ok(was.length > 0, "control: the oracle drew a plate for " + r.id);
    assert.equal(creatureNameplateHTML(map.get(r.id)), was, "same plate for " + r.id);
  }
});

test("helper: the markup is the old markup (frame, icon, name)", () => {
  const html = creatureNameplateHTML(ROWS[0]);
  assert.equal(
    html,
    '<div class="wv-nameplate" data-nameplate="creature:fox-9-test"><span class="wv-np-what">'
      + iconsHTML([creatureIcon()])
      + '</span><span class="wv-np-name">Ember</span></div>',
  );
  assert.match(html, /<span class="wv-np-what"><span class="wv-icw"[^>]*><span class="wv-ic ic-creature"/, "the creature icon sits in the what-slot");
  assert.ok(html.includes('title="A creature'), "and says what it is");
});

test("helper: a missing row is empty output, exactly as before", () => {
  const old = oldFor(new Map());
  for (const v of [undefined, null]) assert.equal(creatureNameplateHTML(v), "", String(v));
  assert.equal(old("creature:not-there"), "", "control: the old closure answered \"\" for a missing key");
  assert.equal(creatureNameplateHTML(new Map().get("creature:not-there")), old("creature:not-there"));
});

test("helper: the identity and the name are escaped", () => {
  const evil = creatureNameplateHTML(ROWS[2]);
  assert.ok(evil.includes('data-nameplate="creature:odd&quot;&gt;&lt;img src=x onerror=alert(1)&gt;-1"'), "the identity cannot close its attribute or open a tag");
  assert.equal(/<img/.test(evil), false, "no tag came out of the identity");
  const moth = creatureNameplateHTML(ROWS[1]);
  assert.ok(moth.includes("a moth of &lt;b&gt;&quot;some&quot;&lt;/b&gt; &amp; more"), "the name is escaped");
  assert.equal(/<b>/.test(moth), false, "no tag came out of the name");
  // escaped once, not twice: an id that already reads like an entity keeps its ampersand escaped
  assert.ok(creatureNameplateHTML(ROWS[3]).includes('data-nameplate="creature:amp&amp;lt;-2"'));
  // a name that is not a string, or absent, comes out as the old function had it
  assert.ok(creatureNameplateHTML(ROWS[4]).endsWith('<span class="wv-np-name"></span></div>'), "no name: empty, never \"undefined\"");
  assert.ok(creatureNameplateHTML(ROWS[5]).endsWith('<span class="wv-np-name">42</span></div>'));
});

// ── B. THE CONTRACT: the map's key is the row's id ───────────────────────────

test("contract: the plate's data-nameplate is the row's id, which is the map key the old function escaped", () => {
  // Behavioural reader: rows come out of `liveCreaturesFrom` with `id: String(c.id)`,
  // and the plate carries exactly that id.
  const rows = liveCreaturesFrom({ found: { creatures: [
    { id: "creature:fox-9-test", kind: "fox", name: "Ember", at: { x: 1, y: 2 } },
    { id: "creature:moth-1-test", kind: "moth", name: "Moth", x: 3, y: 4 },
  ] } });
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(typeof r.id, "string");
    // the writer keys by the row's id; so the old lookup key and c.id are one string
    const map = new Map(); map.set(r.id, r);
    assert.equal(creatureNameplateHTML(r), oldFor(map)(r.id), "key === c.id: the old plate and the new one agree");
    assert.ok(creatureNameplateHTML(r).includes(`data-nameplate="${r.id}"`));
  }
});

test("contract (text pin): the one writer of the live-creatures map keys it by the row's id", () => {
  // `mountViewer` holds `const liveCreatures = new Map()` and writes it only in
  // `loadLiveCreatures` (base line 14687): `for (const c of rows) liveCreatures.set(c.id, c);`.
  // A text pin is the weakest instrument, and this is the only one that sees inside mountViewer.
  // (comments stripped first: the helper's own doc names this writer, and a pin must not read its own prose)
  const CODE = SOURCE.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");
  assert.ok(SOURCE.includes("liveCreatures.set(c.id, c)`"), "control: the prose naming the writer is in the source...");
  assert.equal(count(CODE, "liveCreatures.set("), 1, "...and out of the code: one writer");
  assert.equal(count(CODE, "for (const c of rows) liveCreatures.set(c.id, c);"), 1, "and it keys by the row's own id");
  assert.equal(count(CODE, "liveCreatures = "), 1, "the map is bound once, never replaced by another...");
  assert.equal(count(CODE, "const liveCreatures = new Map();"), 1, "...and that is the map");
});

// ── C. THE WIRING ─────────────────────────────────────────────────────────────

test("wiring: the closure is gone, and the one call site passes the looked-up row", () => {
  assert.equal(count(SOURCE, "function creatureNameplateHTML("), 1, "one definition");
  assert.ok(SOURCE.includes("export function creatureNameplateHTML(c) {"), "and it is the top-level export taking the row");
  assert.equal(count(SOURCE, "creatureNameplateHTML("), 2, "the definition and the one call site");
  assert.equal(count(SOURCE, "creature ? creatureNameplateHTML(liveCreatures.get(id)) : markNameplateHTML(id)"), 1, "the call site passes liveCreatures.get(id)");
  // the old closure sat inside mountViewer, indented two spaces
  assert.equal(SOURCE.includes("  function creatureNameplateHTML("), false, "no closure left inside mountViewer");
});

// ── D. THE EMITTED BYTES ──────────────────────────────────────────────────────
//
// THE PINNED DIGEST. A changed CSS byte, a changed comment or whitespace, or a
// moved or doubled interpolation of CREATURE_CSS changes the digest and fails. An
// INTENDED change to STYLE must update the pin knowingly: recompute it the way the
// provenance below says, and say why in the PR.
//
// PROVENANCE. sha256 of the masked STYLE that main's `spectator/viewer.mjs`
// emitted at base commit 82e2353250d4946e538225353ade9afd36a9dd21 (viewer.mjs blob
// sha256 c905811c…), 106507 bytes (UTF-8), measured by two routes that are not this
// test's code, run before the hoist: (1) the base file's own `mountViewer` run from
// a scratch file beside symlinks to the real spectator/ and tools/, under a stub DOM
// capturing `styleTag.textContent` at `appendChild`; (2) the `const STYLE = \`...\``
// literal cut out of the base text and evaluated with the real HOME_COLUMN_CSS and
// MARK_ICON_CSS. Both gave the digest below. (Unmasked: 123904 bytes.) The same
// digest is World #348's pin for its own (also byte-neutral) change to STYLE; the
// two PRs pin one fact and will rebase over each other without a clash.
//
// Masking. STYLE also interpolates HOME_COLUMN_CSS (spectator/home-column.mjs) and
// MARK_ICON_CSS (spectator/mark-icons.mjs): other modules, other lanes. Each is
// replaced at its place by a fixed token before hashing, so a moved, dropped or
// doubled interpolation of either still fails, but their own CSS is theirs to change.
//
// RE-PINNED IN THE WLD-144 BATCH (PR #356), because main moved. Main 3cc1d218 (POS-823, the outsider-lens note)
// added the `.wv-lens-note` rules to STYLE, 628 bytes, so the digest above no longer describes main. The pin below is
// sha256 of the masked STYLE that main's OWN `spectator/viewer.mjs` emits at 3cc1d218b0adc250ba423b139ff7d97a920294e9,
// 107135 bytes, by the same first route as above (the file written beside symlinks to the real spectator/ and
// tools/, its own `mountViewer` under a stub DOM). The same script run on the base 82e23532 reproduced the old
// digest, and run on the batch head gave this digest too: the batch emits main's STYLE byte for byte.
//
// RE-PINNED IN POS-779 (World #306, the conversation badge), an INTENDED change to STYLE: the branch adds the badge's CSS
// (a two-line comment and five `.wv-convo-disc` / `.wv-convo-badge` rules, 7 lines, 433 bytes, nothing removed or changed)
// between the existing rules. The pin below is sha256 of the masked STYLE that `spectator/viewer.mjs` at c78042ec8d915e970f7e70f6edf830543c6ebdab
// (blob bb9a2e3d14390161f7ae378cb29d6f1d3a9a0c30) emits, 107568 bytes, by the same first route as above (the commit's file written beside
// symlinks to the real spectator/ and tools/, its own `mountViewer` under a stub DOM, the two foreign interpolations masked, hashed):
// not this test's code, and not computed from the code under test at run time. The same route on main 8a2c13d834d6a7d1475367ff6346ff936b90d3df
// reproduced the 107135-byte digest 94d56a4157be8427e46c0a1854ae319b1aea22cfea64978538491f2b410361a7, and a line diff of the two masked
// texts is exactly those 7 added lines. CREATURE_CSS and its neighbours are untouched.
//
// RE-PINNED IN POS-779 (World #306, review W1), an INTENDED change to STYLE: the dead rule `.wv-convo.is-aboard` (the class sits on the badge
// wrapper, so it matched nothing) becomes `.wv-convo-badge.is-aboard .wv-convo`, with a one-line comment: 143 bytes added, nothing else moved.
// The pin below is sha256 of the masked STYLE that `spectator/viewer.mjs` at 690822c0df87822eaccbe3963e11100df9b6e3cb (blob
// c442c0bf9f500ddbf37423c8e36780875d6ecad3) emits, 107711 bytes, by the same one-off route (the commit's file written beside symlinks to the
// real spectator/ and tools/, its own `mountViewer` under a stub DOM, the two foreign interpolations masked, hashed), not this test's code.
// The same script reproduced both digests above on their commits: 94d56a41… (107135 bytes) on main 8a2c13d8 and d50d860c… (107568 bytes)
// on c78042ec.
const PINNED_MASKED_STYLE_SHA256 = "ed771ead2b455be7c4544f78986fc77b4fa9082add90e93128cce45159bd05e1";
const PINNED_MASKED_STYLE_BYTES = 107711;

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
const STYLE = emittedStyle();
const MASKED = mask(STYLE);
const pinOk = (s) => sha256(s) === PINNED_MASKED_STYLE_SHA256 && Buffer.byteLength(s, "utf8") === PINNED_MASKED_STYLE_BYTES;

test("emitted bytes: the STYLE 2D emits is byte-for-byte main's (pinned digest)", () => {
  assert.equal(Buffer.byteLength(MASKED, "utf8"), PINNED_MASKED_STYLE_BYTES, "same length as main's");
  assert.equal(sha256(MASKED), PINNED_MASKED_STYLE_SHA256, "same bytes as main's");
});

test("emitted bytes: the pin can fail (a changed byte, a changed comment, a moved interpolation)", () => {
  assert.equal(pinOk(MASKED), true, "control: the real text passes");
  assert.equal(pinOk(MASKED.replace("fill:#4a2326;", "fill:#4a2327;")), false, "a changed CSS byte in the slice is caught");
  assert.equal(pinOk(MASKED.replace("red means a creature (play fix 43)", "red means a creature")), false, "a changed comment is caught");
  assert.equal(pinOk(MASKED.replace(".ov-creature-ring { fill:none;", ".ov-creature-ring  { fill:none;")), false, "a changed space is caught");
  // the slice moved: lift it out and set it one rule later
  const moved = MASKED.replace(CREATURE_CSS + "\n", "").replace(".wv-creature-note.show { opacity:1; }\n", ".wv-creature-note.show { opacity:1; }\n" + CREATURE_CSS + "\n");
  assert.notEqual(moved, MASKED, "control: the move changed the text");
  assert.equal(pinOk(moved), false, "a moved interpolation is caught");
  // doubled
  assert.equal(pinOk(MASKED.replace(CREATURE_CSS, CREATURE_CSS + "\n" + CREATURE_CSS)), false, "a doubled interpolation is caught");
  // the foreign interpolations too
  const swapped = MASKED.split(HOME_TOKEN).join("\u0001H").split(ICON_TOKEN).join(HOME_TOKEN).split("\u0001H").join(ICON_TOKEN);
  assert.equal(pinOk(swapped), false, "swapping HOME_COLUMN_CSS and MARK_ICON_CSS is caught");
});

test("CREATURE_CSS: one contiguous slice, appearing once in the emitted STYLE, between its neighbours", () => {
  assert.equal(typeof CREATURE_CSS, "string");
  assert.equal(count(STYLE, CREATURE_CSS), 1, "appears exactly once");
  assert.ok(
    STYLE.includes(".wv-walk-note.refusal { border-color:#b5524a; color:#f0b0a8; }\n" + CREATURE_CSS + "\n.wv-choose-row.is-convo {"),
    "after the walk note's refusal rule, before the chooser's convo row",
  );
  const lines = CREATURE_CSS.split("\n");
  assert.equal(lines.length, 12, "twelve lines: its heading comment through the nameplate accent");
  assert.ok(lines[0].startsWith("/* THE LIVE CREATURES (play fix 35)"), "its heading comment travels with it");
  assert.ok(lines[11].startsWith(".wv-bubble.is-nameplate.is-creature { --wv-mark-accent:#d8706a; }"), "and it ends at the nameplate accent");
  assert.equal(CREATURE_CSS.endsWith("\n"), false, "no trailing newline: STYLE supplies the line break");
  assert.deepEqual(
    lines.filter((l) => /^[.]/.test(l)).map((l) => l.slice(0, l.indexOf(" {"))),
    [".ov-creature-hit", ".ov-creature-art", ".ov-creature-disc", ".ov-creature-aware", ".ov-creature-ring", ".wv-hl-creature", ".wv-bubble.is-nameplate.is-creature"],
  );
  // dependencies: none. It is plain CSS with no interpolation of its own
  assert.equal(/\$\{|`/.test(CREATURE_CSS), false);
});

// ── E. IMPORT PURITY ──────────────────────────────────────────────────────────

test("import purity: spectator/viewer.mjs imports in node with no DOM and touches no browser global", () => {
  // A fresh process, with every browser global booby-trapped: reading one at
  // import time (even through `typeof`) records it. The helper and the slice
  // must come out of the import with nothing read from a page.
  const VIEWER_URL = new URL("../spectator/viewer.mjs", import.meta.url).href;
  const probe = `
    const trap = ["window", "document", "navigator", "localStorage", "sessionStorage", "location",
      "requestAnimationFrame", "HTMLElement", "customElements", "history", "screen"];
    const touched = [];
    for (const k of trap) Object.defineProperty(globalThis, k, { configurable: true, get() { touched.push(k); return undefined; } });
    const m = await import(${JSON.stringify(VIEWER_URL)});
    const plate = m.creatureNameplateHTML({ id: "creature:probe-1", name: "Probe" });
    process.stdout.write(JSON.stringify({ touched, kinds: [typeof m.CREATURE_CSS, typeof m.creatureNameplateHTML, typeof m.mountViewer], plate: plate.slice(0, 42), empty: m.creatureNameplateHTML(undefined) }));
  `;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", probe], { encoding: "utf8", timeout: 60_000 });
  assert.deepEqual(JSON.parse(out), {
    touched: [],
    kinds: ["string", "function", "function"],
    plate: '<div class="wv-nameplate" data-nameplate="',
    empty: "",
  });
});
