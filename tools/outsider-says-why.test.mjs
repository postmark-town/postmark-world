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

// the line the office sends today (typed here on purpose; the page must show whatever string it is handed).
// Until 2026-11-02 this typed "Nothing here changes: nothing of yours is in a closed place, ..."; the settled line speaks of what
// strangers see of your PUBLISHED marks, which is true on this page too, where the lens also drops a household's drafts.
const LINE = "Strangers see your published marks just as you do: none of them is in a closed place.";

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

// a one-line `const name = ...;` at the closure's level (the page's one resize handler is written so)
function constOf(name) {
  const text = SOURCE.match(new RegExp(`^  const ${name} = [^\\n]*$`, "m"))?.[0];
  assert.ok(text, `source extraction: ${name}`);
  return text;
}

// a fake DOM host that moves an element the way append and prepend do: out of its old parent, into the new one
function fakeHost(name) {
  const host = { name, children: [] };
  const take = (el) => { if (el.parentElement) el.parentElement.children = el.parentElement.children.filter((c) => c !== el); el.parentElement = host; };
  host.append = (el) => { take(el); host.children.push(el); };
  host.prepend = (el) => { take(el); host.children.unshift(el); };
  return host;
}

function pageHarness() {
  const requests = [], rendered = [];
  const head = fakeHost("the Telling's head"), mapSide = fakeHost("the map side");
  // BOTH HOSTS START WITH A CHILD, so where the note is put among them is a real check: an empty fake host cannot tell
  // prepend from append (the re-review's note). The Telling's head holds its sub line first; the map side holds the painting.
  const sub = { name: "the Telling's sub line", parentElement: null }, minimap = { name: "the painting", parentElement: null };
  head.append(sub);
  mapSide.append(minimap);
  const note = { textContent: "", hidden: true, parentElement: null };   // the element the painter finds at .wv-lens-note
  head.append(note);                                                     // where the markup puts it: after the sub line
  const phone = { on: false };                                           // under 720 px, which the page asks matchMedia
  const resized = [];
  const hosts = { ".wv-lens-note": note, ".wv-viewhead": head, ".wv-map .wv-sticky": mapSide };
  const context = vm.createContext({
    residentReadKey, lensQuery, mineForSight, lensAnswered, readStillWanted, OUTSIDER_LENS, lensNoteOf: viewer.lensNoteOf,
    requests, rendered, note, phone, resized,
    fetch: (url) => new Promise((resolve) => { requests.push({ url, answer: (j) => resolve({ ok: true, json: async () => j }) }); }),
    authHeaders: () => ({}), residentById: () => new Map(),
    loadTownHouses: () => {}, loadHands: () => {}, withTownHouses: () => {}, buildHomeSet: () => new Set(), allMarks: () => [],
    outsiderUnavailable: () => {},
    root: { classList: { toggle: () => {} }, querySelector: (selector) => hosts[selector] ?? null },
    // everything else renderCurrent calls: it is the paint spine, so each is a counted no-op here
    paintOutsiderButton: () => rendered.push("button"), renderStandpointReadouts: () => {}, renderTelling: () => rendered.push("telling"),
    renderModeControls: () => {}, renderSpectatorCoordinate: () => {}, renderEnterExitPanel: () => {}, syncScene: () => {},
    standpointKey: () => "k", loadMinimap: () => {},
    // and what applyPaintingOnly and the resize handler call
    renderBubbles: () => {}, positionBubbles: () => resized.push("bubbles"), placeTour: () => {}, drawOverlay: () => {},
    sizeSearchField: () => {}, seatRoomCard: () => {},
    setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0,
  });
  vm.runInContext(`
    const $ = (r, s) => r.querySelector(s);
    const officeBase = () => "https://office-a.invalid";
    const officeUrl = (path) => officeBase() + path;
    const state = { handle: "rig-actor", crossing: 500, outsider: false, view: "telling", paintingOnly: false };
    const walkState = { walkers: [{ handle: "rig-actor" }] };
    const readCache = new Map(), readPending = new Map();
    let readError = null, byId, homeSet, mapCtx = {}, lastRadial = null, settleTimer = null;
    const mineSet = { marks: new Map() };
    const onPhone = () => phone.on;
    ${bodyOf("residentStandpointKey")}
    ${bodyOf("loadResidentRead")}
    ${bodyOf("tellingShows")}
    ${bodyOf("paintLensNote")}
    ${bodyOf("renderCurrent")}
    ${bodyOf("applyPaintingOnly")}
    ${constOf("onViewerResize")}
    globalThis.probe = { state, readCache, read: () => loadResidentRead(null, state.handle), render: () => renderCurrent(),
      fold: () => applyPaintingOnly(), resize: () => onViewerResize() };
  `, context);
  return { probe: context.probe, requests, rendered, resized, note, head, mapSide, sub, minimap, phone };
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
  // ⚑ THE FLIP: drop the `#outsider` suffix from residentStandpointKey → the lens read and your own sight share a slot, the line stays up over the owner's own view; this reds
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
  assert.match(SOURCE, /^\.wv-map \.wv-lens-note \{/m, "and a style for the map side, where it goes when the Telling cannot be seen");
});

// ── the toggle is on the map, so the line goes where the toggle is when the Telling cannot be seen ────────────
// (POS-823, the review of 5e869ee8, finding A.) Under 720 px `.wv-view` is display:none, and a folded Telling is
// visibility:hidden, so a line in the Telling's head is never read on a phone or with the Telling folded. The page
// puts it at the map side then, the host reRender's toast already uses for the folded case. Still display-only:
// the string is the office's, and the page only decides where it can be read.
async function lensOnWithLine(h, line = LINE) {
  h.probe.state.outsider = true;
  const pending = h.probe.read();
  h.requests[0].answer(lensRead({ lens_note: line }));
  await pending;
}

test("a phone has no Telling (under 720 px .wv-view is display:none): the line is drawn at the map side, where the toggle is", async () => {
  const h = pageHarness();
  assert.deepEqual(h.head.children, [h.sub, h.note], "control: the markup puts it in the Telling's head, after the sub line");
  assert.deepEqual(h.mapSide.children, [h.minimap], "control: the map side holds the painting and nothing else");
  h.phone.on = true;
  await lensOnWithLine(h);
  h.probe.render();
  // ⚑ THE FLIP: tellingShows ignores the phone → the line stays in the head, which a phone never shows; this reds
  assert.equal(h.note.parentElement, h.mapSide, "out of the Telling's head, into the map's side");
  assert.equal(h.note.textContent, LINE);
  assert.equal(h.note.hidden, false);
  // ⚑ THE FLIP: host.prepend(el) → host.append(el) for the map side → the line lands under the painting; this reds (the host is not empty)
  assert.deepEqual(h.mapSide.children, [h.note, h.minimap], "at the TOP of the map side, above the painting, as the toast is");
  assert.deepEqual(h.head.children, [h.sub], "and no copy is left in the hidden head");
});

test("the Telling folded away (.wv-view is visibility:hidden): the line is drawn at the map side too", async () => {
  const h = pageHarness();
  h.probe.state.paintingOnly = true;
  await lensOnWithLine(h);
  h.probe.render();
  // ⚑ THE FLIP: tellingShows ignores the fold → the line stays in the folded Telling; this reds
  assert.equal(h.note.parentElement, h.mapSide);
  assert.equal(h.note.hidden, false);
  assert.equal(h.note.textContent, LINE);
});

test("a wide page with the Telling showing keeps the line in the Telling's head, and takes it back when the phone grows wide", async () => {
  const h = pageHarness();
  await lensOnWithLine(h);
  h.probe.render();
  assert.equal(h.note.parentElement, h.head, "wide, unfolded: the head");
  assert.deepEqual(h.head.children, [h.sub, h.note], "after the sub line, as the markup has it");
  assert.deepEqual(h.mapSide.children, [h.minimap], "control: nothing of the line is at the map side");
  h.phone.on = true;
  h.probe.render();
  assert.equal(h.note.parentElement, h.mapSide, "control: it went to the map side");
  h.phone.on = false;
  h.probe.render();
  // ⚑ THE FLIP: paintLensNote never moves the element back → it stays at the map side over a Telling that shows; this reds
  assert.equal(h.note.parentElement, h.head, "wide again: back in the head");
  assert.deepEqual(h.mapSide.children, [h.minimap]);
  // ⚑ THE FLIP: host.append(el) → host.prepend(el) for the head → the line lands above the sub line; this reds (the host is not empty)
  assert.deepEqual(h.head.children, [h.sub, h.note], "and after the sub line again, not before it");
  assert.equal(h.note.textContent, LINE);
});

test("folding the Telling repaints the line at once, without waiting for another render", async () => {
  const h = pageHarness();
  await lensOnWithLine(h);
  h.probe.render();
  assert.equal(h.note.parentElement, h.head, "control: showing in the head");
  h.probe.state.paintingOnly = true;   // the toggle's own click does this, then calls applyPaintingOnly
  h.probe.fold();
  // ⚑ THE FLIP: drop `paintLensNote();` from applyPaintingOnly → the line is stranded in the folded Telling until some render; this reds
  assert.equal(h.note.parentElement, h.mapSide);
  assert.equal(h.note.hidden, false);
});

test("a resize across the phone breakpoint repaints the line (the page's one resize handler)", async () => {
  const h = pageHarness();
  await lensOnWithLine(h);
  h.probe.render();
  assert.equal(h.note.parentElement, h.head, "control: showing in the head");
  h.phone.on = true;                   // the phone is turned upright: the Telling goes, the map stays
  h.probe.resize();
  // ⚑ THE FLIP: drop `paintLensNote();` from onViewerResize → the line is stranded in a Telling that is gone; this reds
  assert.equal(h.note.parentElement, h.mapSide);
  assert.equal(h.note.hidden, false);
  assert.ok(h.resized.includes("bubbles"), "control: the handler's own work still ran");
});

test("with no line the map side holds nothing to read, on a phone too", async () => {
  const h = pageHarness();
  h.phone.on = true;
  h.probe.state.outsider = true;
  const pending = h.probe.read();
  h.requests[0].answer(lensRead());    // an office that sends none
  await pending;
  h.probe.render();
  assert.equal(h.note.hidden, true);
  assert.equal(h.note.textContent, "");
});
