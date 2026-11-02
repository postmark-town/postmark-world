// outsider-says-why.test.mjs — POS-823 (Darko, 2026-10-30 16:29 EDT, approving Wright's recommendation): "when the
// World's outsider view changes nothing for a household, say why."
//
// THE PAGE'S HALF. The office decides (postmark-office, the other PR): `world { lens: "outsider" }` carries `lens_note`
// when the lens left the household's view as it was and nothing of theirs is in a closed place. This page shows that
// line, as the office sent it, at the head of the Telling while the lens is on. It computes nothing and keeps no copy
// of the rule or of the wording: one rule in one place, the way the lens itself is one switch on one function
// (outsider-and-fill.test.mjs). With an office that sends no line the page shows nothing and breaks nothing, so the
// two halves land in either order.
//
// LAW §The portal and the dungeon (LOGOS/classes.md): "A dungeon is opaque from outside. A resident who has not
// entered it reads it as the dungeon mark alone, with nothing it contains at any depth." Only a closed place hides
// what is inside it, so the lens moves a household's view only when a mark of its own stands in one; the office, which
// holds the whole world, is the one that can say so.
//
// Driven, not pinned: loadResidentRead's own body, then renderCurrent's, run in a context whose fetch we answer by
// hand, as outsider-and-fill.test.mjs drives loadResidentRead. The only [pin] says the markup holds the element.
// Run: node --test tools/outsider-says-why.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as viewer from "../spectator/viewer.mjs";

const { lensQuery, mineForSight, lensAnswered, readStillWanted, residentReadKey, OUTSIDER_LENS } = viewer;

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "..", "spectator", "viewer.mjs"), "utf8");

// the line the office sends today (typed here on purpose; the page must show whatever string it is handed)
const LINE = "Nothing here changes: nothing of yours is in a closed place, and a place that isn't closed is open to everyone.";

// ── the pure half: which string the page may show ───────────────────────────
test("lensNoteOf: the office's line while the read is a lens read, and nothing otherwise", () => {
  // ⚑ THE FLIP: drop the `read.lens === OUTSIDER_LENS` condition in lensNoteOf → the stray-note case below reds
  assert.equal(viewer.lensNoteOf({ lens: OUTSIDER_LENS, lens_note: LINE }), LINE);
  assert.equal(viewer.lensNoteOf({ lens: OUTSIDER_LENS, lens_note: `  ${LINE}\n` }), LINE, "as sent, trimmed");
  assert.equal(viewer.lensNoteOf({ lens: OUTSIDER_LENS, lens_note: "A different sentence." }), "A different sentence.", "the page keeps no wording of its own");
  assert.equal(viewer.lensNoteOf({ lens: OUTSIDER_LENS }), "", "an office that sends none (it predates the line, or the lens moved something)");
  assert.equal(viewer.lensNoteOf({ lens_note: LINE }), "", "a stray note on an own-sight read is never shown");
  assert.equal(viewer.lensNoteOf({ lens: OUTSIDER_LENS, lens_note: 7 }), "", "not a string");
  assert.equal(viewer.lensNoteOf({ lens: OUTSIDER_LENS, lens_note: "   " }), "", "blank");
  assert.equal(viewer.lensNoteOf(null), "");
  assert.equal(viewer.lensNoteOf(undefined), "");
});

// ── the page, driven ─────────────────────────────────────────────────────────
function bodyOf(name) {
  const text = SOURCE.match(new RegExp(`^  function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}`, "m"))?.[0];
  assert.ok(text, `source extraction: ${name}`);
  return text;
}

function pageHarness() {
  const requests = [], rendered = [];
  const note = { textContent: "", hidden: true };   // the element the painter finds at .wv-lens-note
  const context = vm.createContext({
    residentReadKey, lensQuery, mineForSight, lensAnswered, readStillWanted, OUTSIDER_LENS, lensNoteOf: viewer.lensNoteOf,
    requests, rendered, note,
    fetch: (url) => new Promise((resolve) => { requests.push({ url, answer: (j) => resolve({ ok: true, json: async () => j }) }); }),
    authHeaders: () => ({}), residentById: () => new Map(),
    loadTownHouses: () => {}, loadHands: () => {}, withTownHouses: () => {}, buildHomeSet: () => new Set(), allMarks: () => [],
    outsiderUnavailable: () => {},
    root: { querySelector: (selector) => (selector === ".wv-lens-note" ? note : null) },
    // everything else renderCurrent calls: it is the paint spine, so each is a counted no-op here
    paintOutsiderButton: () => rendered.push("button"), renderStandpointReadouts: () => {}, renderTelling: () => rendered.push("telling"),
    renderModeControls: () => {}, renderSpectatorCoordinate: () => {}, renderEnterExitPanel: () => {}, syncScene: () => {},
    standpointKey: () => "k", loadMinimap: () => {},
  });
  vm.runInContext(`
    const officeBase = () => "https://office-a.invalid";
    const officeUrl = (path) => officeBase() + path;
    const state = { handle: "rig-actor", crossing: 500, outsider: false, view: "telling" };
    const walkState = { walkers: [{ handle: "rig-actor" }] };
    const readCache = new Map(), readPending = new Map();
    let readError = null, byId, homeSet, mapCtx = {};
    const mineSet = { marks: new Map() };
    const onResidentPath = () => !!state.handle;
    ${bodyOf("residentStandpointKey")}
    ${bodyOf("loadResidentRead")}
    ${bodyOf("paintLensNote")}
    ${bodyOf("renderCurrent")}
    globalThis.probe = { state, readCache, read: () => loadResidentRead(null, state.handle), render: () => renderCurrent() };
  `, context);
  return { probe: context.probe, requests, rendered, note };
}

const ownRead = (extra = {}) => ({ handle: "rig-actor", records: {}, ...extra });
const lensRead = (extra = {}) => ({ handle: "rig-actor", lens: OUTSIDER_LENS, records: {}, ...extra });

test("PRIMARY · the lens read lands carrying the office's line: the head of the Telling shows it", async () => {
  const h = pageHarness();
  h.probe.state.outsider = true;
  const pending = h.probe.read();
  h.requests[0].answer(lensRead({ lens_note: LINE }));
  await pending;
  h.probe.render();
  // ⚑ THE FLIP: drop `paintLensNote();` from renderCurrent → the read is cached and nothing ever shows it; this reds
  assert.equal(h.note.textContent, LINE, "the line, as the office sent it");
  assert.equal(h.note.hidden, false);
  assert.ok(h.rendered.includes("telling"), "control: renderCurrent really ran its spine");
});

test("an office that sends no line (it predates it, or the lens moved something): nothing shows, nothing breaks, and the lens read is still drawn", async () => {
  const h = pageHarness();
  h.probe.state.outsider = true;
  const pending = h.probe.read();
  h.requests[0].answer(lensRead());
  const read = await pending;
  assert.equal(read.lens, OUTSIDER_LENS, "control: the lens read itself was taken");
  h.probe.render();
  assert.equal(h.note.textContent, "");
  assert.equal(h.note.hidden, true);
});

test("lens off: the line goes, even with the lens read still cached and carrying it", async () => {
  const h = pageHarness();
  h.probe.state.outsider = true;
  const pending = h.probe.read();
  h.requests[0].answer(lensRead({ lens_note: LINE }));
  await pending;
  h.probe.render();
  assert.equal(h.note.hidden, false, "control: it was showing");
  h.probe.state.outsider = false;
  h.probe.render();
  // ⚑ THE FLIP: drop the `state.outsider &&` guard in paintLensNote → it keeps showing over the owner's own sight; this reds
  assert.equal(h.note.hidden, true);
  assert.equal(h.note.textContent, "");
});

test("a note riding an own-sight read is never shown: the line belongs to the lens read alone", async () => {
  const h = pageHarness();
  const pending = h.probe.read();   // lens off: the owner's own sight
  h.requests[0].answer(ownRead({ lens_note: LINE }));
  await pending;
  h.probe.render();
  assert.equal(h.note.hidden, true);
  assert.equal(h.note.textContent, "");
});

test("the line follows the read for this crossing: a new crossing shows nothing until its own lens read lands", async () => {
  const h = pageHarness();
  h.probe.state.outsider = true;
  const first = h.probe.read();
  h.requests[0].answer(lensRead({ lens_note: LINE }));
  await first;
  h.probe.render();
  assert.equal(h.note.hidden, false, "control: showing at crossing 500");
  h.probe.state.crossing = 501;
  h.probe.render();
  // ⚑ THE FLIP: read the cache under a key without the crossing → the old crossing's line stays up; this reds
  assert.equal(h.note.hidden, true, "no lens read for crossing 501 yet");
  const second = h.probe.read();
  h.requests[1].answer(lensRead({ lens_note: "The line for 501." }));
  await second;
  h.probe.render();
  assert.equal(h.note.textContent, "The line for 501.");
});

test("the line is text, and the painter touches only its own element", () => {
  const body = bodyOf("paintLensNote");
  assert.doesNotMatch(body, /innerHTML|insertAdjacentHTML/, "the office's words go in as text, never as markup");
  assert.match(body, /\.wv-lens-note/);
});

test("[pin] the Telling's head holds the element the painter finds, hidden at load, announced politely", () => {
  const selector = bodyOf("paintLensNote").match(/querySelector\("(\.wv-lens-note)"\)/)?.[1];
  assert.equal(selector, ".wv-lens-note", "the painter's selector");
  const head = SOURCE.match(/<div class="wv-viewhead">[\s\S]*?<\/div>/)?.[0];
  assert.ok(head, "the Telling's head");
  assert.match(head, /<p class="wv-lens-note wv-quiet" role="status" hidden><\/p>/, "in the head, hidden until the office has a line");
  assert.match(SOURCE, /^\.wv-lens-note \{/m, "and it has a style");
});
