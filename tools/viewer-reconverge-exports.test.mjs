// viewer-reconverge-exports.test.mjs — what the World now exports so the 3D view stops copying it (WLD-105: A2, A19, A20),
// and that the 2D page still says exactly what it did.
//
//   1. Each CSS slice (PIP_CSS, PIP_BADGE_CSS, WV_BUBBLE_CSS, WV_NAMEPLATE_CSS, WV_SEARCH_PILL_CSS, WV_SEARCH_CSS) appears in
//      the STYLE `mountViewer` really emits exactly once. The STYLE's bytes as a whole are pinned by viewer-shell-css.test.mjs
//      (this PR does not re-pin it: the slices are cut from STYLE in place and interpolated back, so the digest holds).
//   2. markNameplateMarkup, searchResultsHTML and walkerRoster answer, on invented inputs, exactly what the code they
//      replaced answered inline (the old expressions are written out below as the control).
//   3. sizeSearchInput measures the way the closure did: it leaves a field in use alone, resets then measures the
//      placeholder, and writes the width only when the text overflows the floor.
//
// Invented data only. No resident or record is read.
import assert from "node:assert/strict";
import test from "node:test";

import { styleRules, SEARCH_PILL_HTML, markTierOf, markIconsOf, markSearchIndex, peopleSearchIndex, createSearchPill, searchSlashWanted, searchTheTown, deslugMarkId, effectiveWeight } from "../spectator/viewer.mjs";
import { markStanding } from "./mark-standing.mjs";
import { instanceClassOf } from "./mark-kind.mjs";
import { markIcons } from "../spectator/mark-icons.mjs";
import { mountViewer, markNameplateMarkup, searchResultsHTML, sizeSearchInput, PIP_CSS, PIP_BADGE_CSS, WV_BUBBLE_CSS, WV_NAMEPLATE_CSS, WV_SEARCH_PILL_CSS, WV_SEARCH_CSS } from "../spectator/viewer.mjs";
import { walkerRoster } from "./where-is.mjs";
import { iconsHTML } from "../spectator/mark-icons.mjs";

function emittedStyle() {
  const STOP = new Error("style captured");
  let captured = null;
  const had = Object.getOwnPropertyDescriptor(globalThis, "document");
  globalThis.document = { createElement: (tag) => ({ tag, textContent: "" }) };
  const host = { classList: { add() {} }, appendChild(el) { if (el.tag === "style") { captured = el.textContent; throw STOP; } } };
  try { mountViewer(host); } catch (e) { if (e !== STOP) throw e; } finally {
    if (had) Object.defineProperty(globalThis, "document", had); else delete globalThis.document;
  }
  assert.equal(typeof captured, "string");
  return captured;
}
const STYLE = emittedStyle();
const count = (hay, needle) => hay.split(needle).length - 1;

test("slices: each export is in the emitted STYLE exactly once, and non-empty", () => {
  for (const [name, css] of Object.entries({ PIP_CSS, PIP_BADGE_CSS, WV_BUBBLE_CSS, WV_NAMEPLATE_CSS, WV_SEARCH_PILL_CSS, WV_SEARCH_CSS })) {
    assert.ok(css.length > 40, `${name} is not empty`);
    assert.equal(count(STYLE, css), 1, `${name} appears exactly once in what 2D emits`);
  }
  // the control: a slice that drifted from STYLE by one byte is not found
  assert.equal(count(STYLE, PIP_CSS.replace("opacity:.65", "opacity:.66")), 0, "control: a changed byte is not in STYLE");
});

test("slices: what each one carries (the rules 3D drew a copy of)", () => {
  assert.match(PIP_CSS, /\.ov-pip \{ fill:var\(--pm-gold\); opacity:\.65; \}/);
  assert.match(PIP_CSS, /\.ov-pip\.t-constitution \{ fill:var\(--blue\); \}/);
  assert.match(PIP_CSS, /\.ov-pip-door \{ fill:var\(--night\); opacity:\.8; \}/);
  assert.match(PIP_BADGE_CSS, /^\.ov-badge-bg \{/);
  assert.match(WV_BUBBLE_CSS, /^\.wv-bubble \{ position:absolute;/);
  assert.match(WV_BUBBLE_CSS, /\.wv-bubble\.t-market \{ --wv-mark-accent:var\(--pm-gold\); \}$/);
  assert.match(WV_NAMEPLATE_CSS, /\.wv-np-dot\.is-draft \{ background:var\(--draft\); \}$/);
  assert.match(WV_SEARCH_CSS, /^\.wv-search-input \{/);
  assert.match(WV_SEARCH_CSS, /\.wv-search-none \{[^}]*\}$/);
  assert.match(WV_SEARCH_PILL_CSS, /^\.wv-search \{/);
});

// ── A20: the nameplate's markup ─────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// the closure's own body before it was hoisted (viewer.mjs § markNameplateHTML at main dd3f9f3b), as the control
const inlineNameplate = (full, identity, icons, classes) => {
  const what = icons[0]?.kind === "what" ? icons[0] : null;
  const states = what ? icons.slice(1) : icons;
  return `<div class="wv-nameplate" data-nameplate="${esc(full.id)}">`
    + (what ? `<span class="wv-np-what">${iconsHTML([what])}</span>` : `<span class="wv-np-dot ${classes}" aria-hidden="true"></span>`)
    + `<span class="wv-np-name${identity.determined ? " is-determined" : ""}">${esc(identity.name || full.id)}</span>`
    + (states.length ? `<span class="wv-np-icons">${iconsHTML(states)}</span>` : "")
    + `</div>`;
};
const icon = (kind, key) => ({ kind, key, glyph: "x", label: key, words: key });

test("markNameplateMarkup: the same markup the closure built inline, for every shape of plate", () => {
  const m = { id: "invented/a-lamp" };
  const cases = [
    { identity: { name: "A Lamp", determined: false }, icons: [], classes: "t-market" },                                   // plain dot
    { identity: { name: "A Lamp", determined: true }, icons: [], classes: "t-home" },                                      // determined name
    { identity: { name: "", determined: false }, icons: [], classes: "t-constitution is-draft" },                           // falls back to the id
    { identity: { name: "A <Lamp> & \"co\"", determined: false }, icons: [], classes: "t-market" },                         // escaped
    { identity: { name: "A Lamp", determined: false }, icons: [icon("what", "thing")], classes: "t-market" },              // what, no states
    { identity: { name: "A Lamp", determined: false }, icons: [icon("what", "thing"), icon("state", "draft")], classes: "t-market" }, // what + state
    { identity: { name: "A Lamp", determined: false }, icons: [icon("state", "draft")], classes: "t-market" },              // states only: the dot stays
  ];
  for (const c of cases) {
    assert.equal(markNameplateMarkup(m, c), inlineNameplate(m, c.identity, c.icons, c.classes), JSON.stringify(c.identity) + JSON.stringify(c.icons.map((i) => i.kind)));
  }
  const withWhat = markNameplateMarkup(m, cases[5]);
  assert.ok(withWhat.includes('class="wv-np-what"') && withWhat.includes('class="wv-np-icons"') && !withWhat.includes("wv-np-dot"));
  assert.ok(markNameplateMarkup(m, cases[2]).includes(">invented/a-lamp<"), "an unnamed mark reads as its id");
});

// ── A19: the result rows ────────────────────────────────────────────────────
const inlineResults = (rows, note) => rows.length
  ? rows.map((r) => `<li><button type="button" class="wv-search-hit"`
      + ` data-kind="${esc(r.kind)}" data-hit="${esc(r.kind === "person" ? r.handle : r.id)}">`
      + `${esc(r.label)}<span class="sub">${esc(r.kind === "person" ? `resident · ${r.sub}` : r.sub)}</span>`
      + `</button></li>`).join("")
  : `<li class="wv-search-none">${esc(note)}</li>`;

test("searchResultsHTML: the rows 2D's renderSearchResults wrote, and the empty note", () => {
  const rows = [
    { kind: "mark", id: "invented/the-lamp", label: "The Lamp", sub: "a house" },
    { kind: "person", handle: "invented-h", label: "Hana <H>", sub: "the Lanterns" },
  ];
  assert.equal(searchResultsHTML(rows, "Nothing by that name."), inlineResults(rows, "Nothing by that name."));
  assert.equal(searchResultsHTML([], "Nothing by that name. & more"), inlineResults([], "Nothing by that name. & more"));
  const out = searchResultsHTML(rows, "n");
  assert.ok(out.includes('data-hit="invented-h"') && out.includes('data-hit="invented/the-lamp"') && out.includes("resident · the Lanterns"));
  assert.ok(out.includes("Hana &lt;H&gt;"), "labels are escaped");
});

test("sizeSearchInput: leaves a field in use alone; otherwise resets, measures the placeholder, and widens only on overflow", () => {
  const had = { gcs: globalThis.getComputedStyle, doc: Object.getOwnPropertyDescriptor(globalThis, "document") };
  try {
    const field = (over) => {
      const f = { placeholder: "find a house or resident", value: "", style: { width: "132px" }, scrollWidth: 200, clientWidth: 150,
        getBoundingClientRect: () => ({ width: 150 }), ...over };
      return f;
    };
    globalThis.document = { activeElement: null };
    globalThis.getComputedStyle = () => ({ borderLeftWidth: "1px", borderRightWidth: "1px" });
    assert.equal(sizeSearchInput(null), 0, "no field");
    assert.equal(sizeSearchInput(field({ placeholder: "" })), 0, "no placeholder");
    assert.equal(sizeSearchInput(field({ value: "ha" })), 0, "somebody has typed: not touched");
    const busy = field(); globalThis.document = { activeElement: busy };
    assert.equal(sizeSearchInput(busy), 0, "focused: not touched");
    assert.equal(busy.style.width, "132px", "and its width is left as it was");
    globalThis.document = { activeElement: null };
    const over = field();
    // 200 text px over a 150 box: width = ceil(200 + 2 border + 3 headroom), written inline
    assert.equal(sizeSearchInput(over), 205);
    assert.equal(over.style.width, "205px");
    assert.equal(over.value, "", "the borrowed value is put back");
    const fits = field({ scrollWidth: 140 });
    assert.equal(sizeSearchInput(fits), 150, "the CSS floor already holds it: its own width is answered");
    assert.equal(fits.style.width, "", "and the inline width stays cleared");
  } finally {
    if (had.gcs === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = had.gcs;
    if (had.doc) Object.defineProperty(globalThis, "document", had.doc); else delete globalThis.document;
  }
});

// ── A19 and A20, completed: the pill's markup and behaviour, the lists, the tier and the icons ──────────────────────────
test("SEARCH_PILL_HTML is the markup 2D's MARKUP carried, byte for byte, and MARKUP interpolates it once where it stood", async () => {
  const { createHash } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  // sha256 of the block as `spectator/viewer.mjs` at main dd3f9f3b held it inside MARKUP (the first line without MARKUP's indent),
  // cut out by a one-off script that was not this test's code: 1036 bytes
  assert.equal(createHash("sha256").update(SEARCH_PILL_HTML).digest("hex"), "50991a9c7d9012c70bd1e0daaea88d6604c8f57efa0e4ba3fd740ac8042e110d");
  assert.equal(Buffer.byteLength(SEARCH_PILL_HTML), 1036);
  assert.ok(SEARCH_PILL_HTML.startsWith('<div class="wv-search" role="search">') && SEARCH_PILL_HTML.endsWith("          </div>"));
  const src = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  assert.equal(src.split("\n          ${SEARCH_PILL_HTML}\n          <!-- THE FIVE CIRCLES WRAP AS ONE THING").length - 1, 1, "once, with the indent and neighbours it had");
  assert.equal(src.split('<div class="wv-search" role="search">').length - 1, 1, "and the markup is written nowhere else");
});

test("markTierOf and markIconsOf answer what the closures answered", () => {
  const byId = new Map([["inv/in-parcel", { id: "inv/in-parcel", kind: "sited", by: "a" }], ["inv/loose", { id: "inv/loose", kind: "sited", by: "b" }]]);
  const homes = new Set(["inv/in-parcel"]);
  const oldTier = (m) => (homes.has(m.id) ? "home" : markStanding(byId.get(m.id) ?? m, byId));
  for (const m of [{ id: "inv/in-parcel" }, { id: "inv/loose" }, { id: "inv/unknown", by: "c", kind: "sited" }]) assert.equal(markTierOf(m, { homes, byId }), oldTier(m), m.id);
  assert.equal(markTierOf({ id: "inv/in-parcel" }, { homes, byId }), "home");
  const mk = { id: "inv/x", kind: "thing", class: "thing", at: { x: 1, y: 1 }, extent: { w: 2, h: 2 }, weight: 12 };
  const ctx = { creatureClasses: new Set(["creature"]), thingClasses: new Set(["thing"]) };
  const oldIcons = (m, extra = {}) => markIcons(m, { cls: String(instanceClassOf(m) ?? "").trim().toLowerCase(), ...ctx, yours: false, weight: effectiveWeight(m), inside: 2, ...extra });
  assert.deepEqual(markIconsOf(mk, { ...ctx, yours: false, inside: 2 }), oldIcons(mk));
  assert.deepEqual(markIconsOf(mk, { ...ctx, yours: false, inside: 2, ownStake: 3 }), oldIcons(mk, { ownStake: 3 }));
  assert.deepEqual(markIconsOf(mk, { cls: "thing", ...ctx, yours: false, inside: 2 }), oldIcons(mk), "a page that holds the class passes it");
  assert.ok(markIconsOf(mk, ctx).length > 0, "premise: it says something");
});

test("the search lists, the pill's behaviour and the slash rule are what the closures did", () => {
  const marks = [{ id: "inv/the-lamp", at: { x: 1, y: 2 } }, { id: "inv/no-place" }, { at: { x: 1, y: 1 } }, { id: "inv/nan", at: { x: NaN, y: 0 } }];
  const nameOf = (m) => ({ name: m.id === "inv/the-lamp" ? "The Lamp" : "" });
  const oldMarks = marks.map((m) => ({ id: m?.id, name: nameOf(m).name || deslugMarkId(m?.id ?? ""), placed: !!(m?.at && Number.isFinite(m.at.x)) })).filter((m) => m.id);
  assert.deepEqual(markSearchIndex(marks, nameOf), oldMarks);
  assert.deepEqual(oldMarks.map((m) => [m.name, m.placed]), [["The Lamp", true], ["no place", false], ["nan", false]].map(([n, p], i) => [i === 0 ? n : oldMarks[i].name, p]));
  const faceOf = (h) => ({ name: `N-${h}` });
  const walkers = [{ handle: "b", x: 3, y: 4 }, { handle: "c", x: NaN, y: 1 }, { x: 1, y: 1 }, null, { handle: "d", x: 5, y: 6 }];
  const oldPeople = (() => { const out = new Map(); for (const handle of new Map([["a", 1], ["b", 1]]).keys()) out.set(handle, { handle, name: faceOf(handle).name, at: null });
    for (const w of walkers ?? []) { if (!w?.handle || !Number.isFinite(w.x) || !Number.isFinite(w.y)) continue; out.set(w.handle, { handle: w.handle, name: faceOf(w.handle).name, at: { x: w.x, y: w.y } }); } return [...out.values()]; })();
  assert.deepEqual(peopleSearchIndex({ handles: new Map([["a", 1], ["b", 1]]).keys(), walkers, faceOf }), oldPeople);
  assert.deepEqual(oldPeople.map((p) => [p.handle, p.at]), [["a", null], ["b", { x: 3, y: 4 }], ["d", { x: 5, y: 6 }]], "the live entry wins and carries the position");

  const input = { value: "", focused: 0, selected: 0, blurred: 0, focus() { this.focused++; }, select() { this.selected++; }, blur() { this.blurred++; } };
  const box = { hidden: true, innerHTML: "x" };
  const pill = createSearchPill({ input, box, searchMarks: () => oldMarks, searchPeople: () => oldPeople, emptyNote: () => "none, said plainly" });
  pill.render();
  assert.deepEqual([box.hidden, box.innerHTML], [true, ""], "an empty field puts the list away");
  input.value = "  lamp ";
  const expectRows = searchTheTown({ query: input.value, marks: oldMarks, people: oldPeople, limit: 8 });
  assert.deepEqual(pill.rows(), expectRows);
  pill.render();
  assert.equal(box.hidden, false); assert.equal(box.innerHTML, searchResultsHTML(expectRows, "none, said plainly"));
  input.value = "zzzz"; pill.render();
  assert.equal(box.innerHTML, searchResultsHTML([], "none, said plainly"));
  pill.clear({ blur: true });
  assert.deepEqual([input.value, box.hidden, input.blurred], ["", true, 1], "cleared, put away, blurred");
  pill.clear(); assert.equal(input.blurred, 1, "an empty field is left alone");
  assert.equal(pill.focus(), true); assert.deepEqual([input.focused, input.selected], [1, 1]);
  assert.equal(createSearchPill({ input: null, box: null, searchMarks: () => [], searchPeople: () => [] }).focus(), false, "no field, no focus");

  const oldSlash = (e, el) => e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !(!!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
  for (const e of [{ key: "/" }, { key: "/", ctrlKey: true }, { key: "/", metaKey: true }, { key: "/", altKey: true }, { key: "a" }]) {
    for (const el of [null, { tagName: "DIV" }, { tagName: "INPUT" }, { tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "DIV", isContentEditable: true }]) assert.equal(searchSlashWanted(e, el), oldSlash(e, el), JSON.stringify([e, el]));
  }
});

test("styleRules: the page's own top-level rules whose selector the test accepts, verbatim, with @media left out", () => {
  const frame = styleRules((s) => s === ".ov-home-frame");
  assert.equal(frame, ".ov-home-frame { fill:none; stroke:#3a3428; stroke-width:1.6; stroke-linejoin:round; }");
  const homes = styleRules((s) => /\.ov-home/.test(s));
  for (const want of [".ov-home { pointer-events:none; }", ".ov-home-blank { fill:#0d1426; }", ".ov-home.lit .ov-home-frame {", ".ov-home-envelope {"]) assert.ok(homes.includes(want), want);
  // every rule it returns is in STYLE, and its selector passed the test
  const STYLE_NOC = STYLE.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const rule of homes.split("\n")) assert.ok(STYLE_NOC.includes(rule.slice(0, rule.indexOf("{") + 1)), rule.slice(0, 40));
  // a rule that exists only inside an @media block is not a top-level rule: the tour title's wide one is, the phone one is not (WLD-220 rebuild sizes)
  const title = styleRules((s) => s === ".wv-tour-title");
  assert.match(title, /font-size:clamp\(1\.7rem,5\.2vw,2\.5rem\)/);
  assert.doesNotMatch(title, /font-size:clamp\(1\.55rem/, "nothing from inside @media");
  assert.equal(styleRules(() => false), "");
  assert.ok(!styleRules(() => true).split("\n").some((l) => l.startsWith("@")), "no at-rule comes back");
  // control: a selector no rule has answers nothing, so an empty answer is possible
  assert.equal(styleRules((s) => s === ".no-such-rule-anywhere"), "");
});

test("walker-roster.mjs is a single file with no imports (a node server that reads the engine over HTTP can take it whole), and where-is re-exports the same function", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./walker-roster.mjs", import.meta.url), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /\bimport\b/, "no import, static or dynamic");
  const alone = await import("./walker-roster.mjs");
  assert.equal(alone.walkerRoster, walkerRoster, "one function");
});

// ── A2: the roster ──────────────────────────────────────────────────────────
test("walkerRoster: walkers first, then parcel households, empties dropped; the same list spectator/server.mjs built inline", () => {
  const inline = (departures, worldState) => [
    ...departures.map((d) => d.handle),
    ...((worldState?.parcels ?? []).map((pc) => pc.household)),
  ].filter(Boolean);
  const deps = [{ handle: "a" }, { handle: "b" }, { handle: "a" }, { handle: "" }];
  const world = { parcels: [{ household: "c" }, { household: "a" }, { household: null }, {}] };
  assert.deepEqual(walkerRoster(deps, world), ["a", "b", "a", "c", "a"]);
  assert.deepEqual(walkerRoster(deps, world), inline(deps, world));
  assert.deepEqual(walkerRoster(deps, null), inline(deps, null), "a ledger-only answer");
  assert.deepEqual(walkerRoster(undefined, { parcels: [{ household: "z" }] }), ["z"]);
  assert.deepEqual(walkerRoster([], {}), []);
});
