// viewer-display-filter.test.mjs — the viewer's display selection: whose / parcels / size / sort-by-type (CORE-127).
//
// Little Bird, 2026-11-19 11:40–11:43 EST: "a filter layer for displays on the world map … My marks / My drafts / Parcels only / All marks above/under x size
// (you can type in the x) / Sort marks by type. You can choose multiple filters." So a legal huge mark cannot visually decide what a viewer sees. Darko,
// 2026-11-20 08:47 EST: non-matches are HIDDEN ("Hide them"); facilities and biomes "left out for now". Wright 13:50:52Z: hidden "from the map and the list both"
// (and, by the one predicate, from the pick: an invisible non-match must not take a click or a hover a smaller match is under).
//
// ── THE CLAIMS ─────────────────────────────────────────────────────────────
//   1. the pure part: size is the LONGER SIDE in metres of the mark's own extent (camera-independent), under/above are exclusive, a mark with no extent is a
//      point (0 m); whose is OR (my marks, my drafts), the groups AND; nothing chosen hides nothing; chips, removal and all-clear
//   2. the panel's markup: every chosen choice is pressed, my marks / my drafts need a signed-in household, the size field carries its number, the strip and its
//      "N of M shown" exist only while something is hidden
//   3. THE SHIPPED CONSUMERS, in the real viewer (the repo's spectator server, headless Chromium, an INVENTED world and resident, a stub office): with the huge
//      non-match on the page, the map's pips and the Telling list hold it AND the point it covers answers a hover with its name; with the selection chosen
//      through the real panel (several choices at once) the map and the list hold only the matches and the same point answers nothing; removing one chip and
//      all-clear restore exactly those displays; zooming changes nothing about the set; sort-by-type reorders the list and moves no pip; Escape closes the panel
//   4. a spectator (no household) cannot choose my marks / my drafts
//
// ── THE CAN-FAIL FLIPS ─────────────────────────────────────────────────────
//   overlayMarks / displayRadial stop asking shownByDisplay (the draw-set and the radial)     → claim 3's pip and list equalities red
//   `toldHere` stops filtering by shownByDisplay                                                → claim 3's hover-answers-nothing red
//   the town-houses loop stops asking shownByDisplay                                            → the other household's parcel pips stay: claim 3 red
//   markLongerSideM reads the shorter side or the area                                          → claim 1 red
//   clearDisplay forgets the "new" chip, or removal restores the wrong choice                   → claim 3's restore equalities red
//
// Invented world, residents and answers only: no production read, act, key or operator.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyDisplaySelection, parseSizeM, markLongerSideM, displaySelectionHides, markInDisplaySelection, displaySelectionChips, clearDisplayChoice,
  displayControlsHTML, sortByDisplayType, townRegionMarks,
  DISPLAY_LAYERS, DISPLAY_MARK_KINDS, toggleDisplayLayer, layerIsOff, displaySelectionActive, presentKindsMemo,
} from "../spectator/viewer.mjs";
import { MARK_ICONS } from "../spectator/mark-icons.mjs";
import { machinePage, NO_PLAYWRIGHT } from "./page-machine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── 1. the pure part ────────────────────────────────────────────────────────
const M = (id, kind, w, h) => ({ id, kind, extent: w === undefined ? undefined : { w, h } });
// `whatOf` here is the viewer's own `markWhat`, shrunk to the two kinds these invented marks are: a parcel wears `home`, a sited mark `place`
const deps = (mine = [], drafts = []) => ({ isMine: (m) => mine.includes(m.id), isDraft: (m) => drafts.includes(m.id), whatOf: (m) => (m.kind === "parcel" ? "home" : "place") });

test("size is the LONGER SIDE in metres of the mark's own extent; under and above are exclusive; a mark with no extent is a point", () => {
  assert.equal(markLongerSideM(M("a", "sited", 30, 90)), 90, "longer side, whichever it is");
  assert.equal(markLongerSideM(M("a", "sited", 90, 30)), 90);
  assert.equal(markLongerSideM(M("a", "sited")), 0, "no extent: a point");
  assert.equal(markLongerSideM({ id: "x", extent: { w: "wide", h: 7 } }), 7, "a non-number side is not a size");
  const under = { ...emptyDisplaySelection(), sizeMode: "under", sizeM: 80 };
  assert.equal(markInDisplaySelection(M("a", "sited", 79.9, 1), under), true);
  assert.equal(markInDisplaySelection(M("a", "sited", 80, 1), under), false, "under is exclusive of the number");
  assert.equal(markInDisplaySelection(M("p", "sited"), under), true, "a point is under any number");
  const above = { ...under, sizeMode: "above" };
  assert.equal(markInDisplaySelection(M("a", "sited", 80, 1), above), false, "above is exclusive of the number");
  assert.equal(markInDisplaySelection(M("a", "sited", 80.1, 1), above), true);
  assert.equal(markInDisplaySelection(M("p", "sited"), above), false, "a point is never above");
  assert.equal(parseSizeM("80"), 80); assert.equal(parseSizeM(" 1,200.5 "), 1200.5);
  for (const bad of ["", "abc", "-5", "1e3", "8 0", null, undefined]) assert.equal(parseSizeM(bad), null, String(bad));
});

test("whose is OR, the groups are AND, and nothing chosen hides nothing", () => {
  const marks = [M("mine-parcel", "parcel", 30, 30), M("mine-thing", "sited", 5, 5), M("other-parcel", "parcel", 30, 30), M("draft-thing", "sited", 5, 5), M("big-mine", "sited", 900, 700)];
  const d = deps(["mine-parcel", "mine-thing", "big-mine", "draft-thing"], ["draft-thing"]);
  const pick = (sel) => marks.filter((m) => markInDisplaySelection(m, sel, d)).map((m) => m.id);
  const base = emptyDisplaySelection();
  assert.equal(displaySelectionHides(base), false);
  assert.deepEqual(pick(base), marks.map((m) => m.id), "nothing chosen: every mark");
  assert.deepEqual(pick({ ...base, mine: true }), ["mine-parcel", "mine-thing", "draft-thing", "big-mine"], "my marks (the existing just-mine set)");
  assert.deepEqual(pick({ ...base, drafts: true }), ["draft-thing"], "my drafts");
  assert.deepEqual(pick({ ...base, mine: true, drafts: true }), ["mine-parcel", "mine-thing", "draft-thing", "big-mine"], "OR within whose");
  assert.deepEqual(pick({ ...base, off: ["place"] }), ["mine-parcel", "other-parcel"], "the places switched off leave the parcels (the `home` kind stays on)");
  assert.deepEqual(pick({ ...base, mine: true, off: ["place"] }), ["mine-parcel"], "AND across groups");
  assert.deepEqual(pick({ ...base, mine: true, off: ["place"], sizeMode: "under", sizeM: 20 }), [], "all three");
  assert.deepEqual(pick({ ...base, off: ["home"] }), ["mine-thing", "draft-thing", "big-mine"], "the parcels switched off");
  assert.deepEqual(pick({ ...base, off: ["home", "place"] }), [], "every kind off");
  assert.deepEqual(pick({ ...base, off: ["door"] }), marks.map((m) => m.id), "a switch for a kind none of these marks wears hides none of them");
  assert.deepEqual(pick({ ...base, mine: true, sizeMode: "under", sizeM: 80 }), ["mine-parcel", "mine-thing", "draft-thing"], "the big mine mark is a non-match of a size choice");
  assert.equal(displaySelectionHides({ ...base, sortByType: true }), false, "sorting alone hides nothing");
});

test("chips, removal and all-clear", () => {
  const sel = { ...emptyDisplaySelection(), mine: true, drafts: true, off: ["home", "residents"], sizeMode: "above", sizeM: 12, sortByType: true };
  assert.deepEqual(displaySelectionChips(sel).map((c) => c.label), ["my drafts", "my marks", "no residents", "no parcels", "above 12 m"], "a switched-off layer is a chip, in the panel's order");
  assert.deepEqual(displaySelectionChips(sel, { bubblesOn: false }).map((c) => c.label), ["my drafts", "my marks", "no residents", "no speech bubbles", "no parcels", "above 12 m"]);
  assert.equal(clearDisplayChoice(sel, "size").sizeM, null);
  assert.equal(clearDisplayChoice(sel, "mine").mine, false);
  assert.equal(clearDisplayChoice(sel, "mine").drafts, true, "one removal restores one choice");
  assert.deepEqual(clearDisplayChoice(sel, "off:home").off, ["residents"], "removing a layer chip turns that one layer back on");
  assert.deepEqual(clearDisplayChoice(sel, "nonsense").off, ["home", "residents"], "an unknown key changes nothing");
  assert.deepEqual(clearDisplayChoice({ ...sel }, "sort").sortByType, false);
  assert.deepEqual(sortByDisplayType([M("b", "thing"), M("a2", "sited"), M("a1", "sited"), M("c", "parcel")]).map((m) => m.id), ["c", "a1", "a2", "b"], "kind, then id: parcel < sited < thing");
});

// ── 2. the panel's markup ───────────────────────────────────────────────────
test("the panel: chosen choices are pressed, a household is needed for my marks / drafts, the strip exists only while something is hidden", () => {
  const off = displayControlsHTML({ sel: emptyDisplaySelection(), signedIn: false });
  assert.match(off.panel, /data-dsel="mine"[^>]*aria-pressed="false" disabled/);
  assert.match(off.panel, /data-dsel="drafts"[^>]*aria-pressed="false" disabled/);
  assert.doesNotMatch(off.panel, /data-dsel="parcels"/, "the old text chip is gone: a parcel is the `home` icon switch now");
  assert.match(off.panel, /data-dsel-layer="home"[^>]*aria-pressed="true"/, "every layer is ON by default: today's view");
  assert.equal(off.strip, "", "nothing hidden: no strip");
  assert.match(off.panel, /nothing is hidden/);
  assert.match(off.opener, /aria-expanded="false"/);
  const sel = { ...emptyDisplaySelection(), mine: true, off: ["place"], sizeMode: "under", sizeM: 80 };
  const on = displayControlsHTML({ sel, signedIn: true, open: true, counts: { shown: 2, total: 24 } });
  assert.match(on.panel, /data-dsel="mine"[^>]*aria-pressed="true"/);
  assert.match(on.panel, /data-dsel-layer="place"[^>]*aria-pressed="false"/, "a layer switched off reads as off");
  assert.match(on.panel, /data-dsel-layer="home"[^>]*aria-pressed="true"/);
  assert.match(on.panel, /data-dsel-mode="under"[^>]*aria-pressed="true"/);
  assert.match(on.panel, /value="80"/);
  assert.match(on.strip, /2 of 24 shown/);
  for (const key of ["mine", "off:place", "size"]) assert.match(on.strip, new RegExp(`data-dsel-remove="${key}"`));
  assert.match(on.strip, /data-dsel-clear/);
  assert.match(on.opener, /aria-expanded="true"/);
  assert.match(on.opener, /aria-label="3 chosen"/);
  assert.doesNotMatch(on.panel, /facilit|biome/i, "facilities and biomes are left out for now (Darko, 2026-11-20)");
});

// ── 2b. the icon switches (CORE-147) ────────────────────────────────────────
test("the layers are the icons the map draws: every switch's glyph is a real MARK_ICONS key, a mark kind IS a `markWhat` kind, and nothing is invented", () => {
  assert.deepEqual(DISPLAY_LAYERS.map((l) => l.key), ["residents", "conversation", "home", "place", "thing", "door", "dungeon", "stairs", "vehicle", "creature"]);
  for (const l of DISPLAY_LAYERS) assert.ok(MARK_ICONS[l.icon], `${l.key}: ${l.icon} is an icon the map has`);
  assert.equal(DISPLAY_LAYERS.find((l) => l.key === "residents").icon, "inside", "a resident is the round frame on two stubby legs");
  assert.equal(DISPLAY_LAYERS.find((l) => l.key === "conversation").icon, "conversation", "a speech bubble is the conversation badge's glyph");
  for (const k of DISPLAY_MARK_KINDS) { assert.equal(MARK_ICONS[k].kind, "what", `${k} is a what-icon (what a mark IS)`); assert.equal(k, DISPLAY_LAYERS.find((l) => l.key === k).icon, "the switch wears its own kind's glyph"); }
  assert.deepEqual([...DISPLAY_MARK_KINDS].sort(), ["creature", "door", "dungeon", "home", "place", "stairs", "thing", "vehicle"], "the closed set of what-icons the map draws, less the speech bubble, which is its own switch");
  assert.doesNotMatch(JSON.stringify(DISPLAY_LAYERS), /facilit|biome|terrain|grid|mist/i, "content only (Wright, 2026-11-21): no ground, grid, mists or feedback switch");
});

test("a switch flips one layer, and only a known one; the residents and the speech bubbles hide no MARK; all-on is today's display", () => {
  const base = emptyDisplaySelection();
  assert.deepEqual(base.off, [], "nothing off: today's display");
  const a = toggleDisplayLayer(base, "home");
  assert.deepEqual(a.off, ["home"]); assert.deepEqual(base.off, [], "pure: the old selection is untouched");
  assert.deepEqual(toggleDisplayLayer(a, "home").off, [], "a second click turns it back on");
  assert.deepEqual(toggleDisplayLayer(a, "residents").off, ["home", "residents"]);
  assert.deepEqual(toggleDisplayLayer(a, "nonsense").off, ["home"], "an unknown key changes nothing");
  assert.deepEqual(toggleDisplayLayer(a, "conversation").off, ["home"], "the speech bubbles are the page's own remembered layer, not part of the selection");
  const residentsOnly = toggleDisplayLayer(base, "residents");
  assert.equal(displaySelectionHides(residentsOnly), false, "switching the residents off hides no mark (the list is untouched)");
  assert.equal(displaySelectionActive(residentsOnly), true, "but the page shows less than today's: the strip and clear-all are there");
  assert.equal(displaySelectionActive(base), false); assert.equal(displaySelectionActive(base, { bubblesOn: false }), true, "the speech bubbles off is less than today's too");
  assert.equal(displaySelectionHides(a), true, "a mark kind off hides marks");
  assert.equal(layerIsOff(a, "home"), true); assert.equal(layerIsOff(a, "place"), false);
  assert.equal(layerIsOff(base, "conversation", { bubblesOn: false }), true); assert.equal(layerIsOff(base, "conversation"), false);
  // a mark that wears no icon (a class declaration) has no switch and is never hidden by one
  assert.equal(markInDisplaySelection({ id: "c" }, toggleDisplayLayer(base, "place"), { whatOf: () => null }), true);
});

test("the icon panel: each switch is its glyph + a label + 'on'/'off' + aria-pressed; kinds are offered only for what the world holds; the residents and the speech bubbles always", () => {
  const html = displayControlsHTML({ sel: emptyDisplaySelection(), signedIn: true, present: ["home", "place"] });
  assert.match(html.panel, /<span class="wv-ic ic-inside"[^>]*><\/span><span class="wv-dlayer-l">residents<\/span><span class="wv-dlayer-s">on<\/span>/, "the resident token, the word, the state");
  assert.match(html.panel, /data-dsel-layer="conversation"[^>]*>.*?ic-conversation.*?speech bubbles/s);
  assert.match(html.panel, /data-dsel-layer="home"[\s\S]*?ic-home[\s\S]*?parcels/);
  assert.doesNotMatch(html.panel, /data-dsel-layer="(door|dungeon|stairs|vehicle|creature|thing)"/, "no switch for a kind the world does not hold");
  const kept = displayControlsHTML({ sel: { ...emptyDisplaySelection(), off: ["door"] }, present: [] });
  assert.match(kept.panel, /data-dsel-layer="door"[^>]*aria-pressed="false"/, "a kind that is switched off stays offered, so it can be switched back on");
  const off = displayControlsHTML({ sel: { ...emptyDisplaySelection(), off: ["residents"] }, bubblesOn: false, present: ["home"] });
  assert.match(off.panel, /data-dsel-layer="residents"[^>]*aria-pressed="false"[\s\S]*?wv-dlayer-s">off</);
  assert.match(off.panel, /data-dsel-layer="conversation"[^>]*aria-pressed="false"/, "the speech bubbles read the page's own layer state");
  assert.match(off.strip, /no residents/); assert.match(off.strip, /no speech bubbles/); assert.match(off.strip, /data-dsel-remove="bubbles"/); assert.match(off.strip, /data-dsel-remove="off:residents"/);
  assert.match(off.opener, /aria-label="2 chosen"/);
  assert.equal(displayControlsHTML({ sel: emptyDisplaySelection() }).strip, "", "everything on: no strip");
});

// the runtime wiring is source-checked by name (the browser test below drives it): one predicate, the 💬 button gone, nothing duplicated
test("source: the speech bubbles are ONE control in the Filters panel (the 💬 button is gone), the residents and creatures switches gate their draw AND their hit scan", () => {
  const src = readFileSync(join(ROOT, "spectator/viewer.mjs"), "utf8");
  assert.doesNotMatch(src, /class="ctl wv-map-convo"/, "no second control for the speech bubbles");
  assert.doesNotMatch(src, /closest\("\.wv-map-convo"\)/, "and no handler for it");
  assert.match(src, /data-dsel-layer="\$\{layer\.key\}"/, "the icon switch markup");
  assert.match(src, /const dlayer = e\.target\.closest\("\[data-dsel-layer\]"\);\s*if \(dlayer\) \{ toggleLayer\(dlayer\.dataset\.dselLayer\); return; \}/, "its one click route");
  assert.match(src, /function setBubbles\(on\)[\s\S]*?mapCtx\.toggleConvo\(\)/, "the speech bubbles move through the layer's own toggle (layer, washes, polling, remembered choice)");
  assert.match(src, /const inView = sceneWalkerSet\(\{[^\n]*\n\s*if \(residentsOff\(\)\) inView\.length = 0;/, "the residents' draw");
  assert.match(src, /const paths = residentsOff\(\) \? "" : walkPathsSVG\(\);/, "and their walking lines");
  assert.match(src, /function screenWalkerCandidates\(\) \{\s*if \(residentsOff\(\)\) return \[\];/, "and their hit scan");
  assert.match(src, /if \(!liveCreatures\.size \|\| creaturesOff\(\)\) return "";/, "the creatures' draw (the hit scan reads these glyphs)");
  assert.match(src, /whatOf: whatOfMark/, "the mark kinds ask the one predicate with markWhat");
  assert.match(src, /import \{[^}]*\bmarkWhat\b[^}]*\} from "\.\/mark-icons\.mjs"/);
  // the kinds list follows what thingClasses() follows: the page's learned thing kinds, with the epoch and the count unchanged
  assert.match(src, /presentKindsOnce\(\{ epoch: worldEpoch, count: marks\.length, live, things \}/, "the memo's stamp carries the learned thing kinds");
  assert.match(src, /things = thingKinds\.size;/, "read from the same ledger thingClasses() reads");
});

test("the present-kinds memo is kept while its inputs hold, and a thing kind learned LATE (epoch and mark count unchanged) makes it recompute", () => {
  let computes = 0, answer = ["place"];                       // a mark first read as a place...
  const once = presentKindsMemo();
  const ask = (s) => once(s, () => { computes += 1; return [...answer]; });
  assert.deepEqual(ask({ epoch: 3, count: 24, live: 0, things: 0 }), ["place"]);
  assert.deepEqual(ask({ epoch: 3, count: 24, live: 0, things: 0 }), ["place"]);
  assert.equal(computes, 1, "nothing moved: the kept answer is returned, not recomputed");
  answer = ["thing"];                                         // ...becomes a thing when a close look teaches the kind (same epoch, same count)
  assert.deepEqual(ask({ epoch: 3, count: 24, live: 0, things: 0 }), ["place"], "still the kept answer while the learned-kinds count has not moved");
  assert.deepEqual(ask({ epoch: 3, count: 24, live: 0, things: 1 }), ["thing"], "a learned thing kind (epoch and mark count unchanged) recomputes: the things switch is offered, the places one is not");
  assert.equal(computes, 2);
  assert.deepEqual(ask({ epoch: 3, count: 24, live: 1, things: 1 }), ["thing"]);
  assert.equal(computes, 3, "a creature going live recomputes too");
  assert.deepEqual(ask({ epoch: 4, count: 24, live: 1, things: 1 }), ["thing"]);
  assert.equal(computes, 4, "so does a new record epoch");
  // an answer drawn before any mark had arrived is never kept
  const early = presentKindsMemo(); let n = 0;
  early({ epoch: 1, count: 0, live: 0, things: 0 }, () => { n += 1; return []; });
  early({ epoch: 1, count: 0, live: 0, things: 0 }, () => { n += 1; return []; });
  assert.equal(n, 2, "an empty-world answer is not kept");
});

// ── 3. the shipped consumers, in the real viewer ────────────────────────────
const SKIP = `${NO_PLAYWRIGHT}: playwright is absent, so the viewer's display selection goes unguarded: run npm ci here (playwright is this package's devDependency)`;
let chromium = null, browser = null, rig = null, office = null;
const CLEANUP = [];
// Reaped in reverse and AWAITED: the browser is closed (its Chromium tree gone) and the spectator child has exited before the file ends.
after(async () => { for (const stop of CLEANUP.splice(0).reverse()) { try { await stop(); } catch { /* gone */ } } });
const freePort = () => new Promise((ok, no) => { const p = createServer(); p.on("error", no); p.listen(0, "127.0.0.1", () => { const { port } = p.address(); p.close(() => ok(port)); }); });

const ACTOR = "rig-actor", HOUSE = "rig-house";
const SERVED = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const mk = (id, kind, by, household, x, y, w, h, extra = {}) => ({ id, kind, by, tier: kind === "parcel" ? "home" : "market", household, declared_household: `hh:${household}`, date: "2026-11-20T00:00:00.000Z", at: { x: x * 0.5, y: y * 0.5 }, extent: { w, h }, sovereign: false, stamps: 0, weight: 0, body: "INVENTED fixture mark (CORE-127).", ...extra });
const FIXTURE = [
  mk("invented/the-huge-hall", "sited", "invented", "other-house", 0, 0, 1500, 1100, { body: "INVENTED: a huge legal mark of another household, covering everything smaller." }),
  mk("rig-house/the-big-orchard", "sited", ACTOR, HOUSE, 150, -40, 900, 700),
  mk("rig-house/home-parcel", "parcel", ACTOR, HOUSE, -180, -80, 40, 40),
  mk("rig-house/second-parcel", "parcel", ACTOR, HOUSE, 90, -120, 60, 60),
  mk("rig-house/lantern", "sited", ACTOR, HOUSE, -90, 70, 6, 6),
  mk("other-house/parcel-a", "parcel", "other", "other-house", -260, 110, 50, 50),
  mk("other-house/parcel-b", "parcel", "other", "other-house", 170, 150, 70, 70),
  mk("other-house/bench", "sited", "other", "other-house", 40, 40, 5, 5),
  mk("other-house/fountain", "sited", "other", "other-house", -40, -30, 14, 14),
];
const DRAFT = { id: "rig-house/draft-gazebo", status: "added", kind: "sited", at: { x: 15, y: 65 }, extent: { w: 20, h: 20 }, body: "INVENTED unpublished draft of the acting household.", date: "2026-11-20T00:00:00.000Z" };
const MATCHES = ["rig-house/home-parcel", "rig-house/second-parcel"];                    // my marks + parcels + under 80 m
const ALL_IDS = [...FIXTURE.map((m) => m.id), DRAFT.id];
const world = { ...SERVED, marks: [SERVED.marks.find((m) => m.id === "the-town/let-there-be-light"), ...townRegionMarks(SERVED.marks), ...FIXTURE].filter(Boolean), parcels: [], portfolios: {} };
const DRAFT_MARK = { ...mk(DRAFT.id, "sited", ACTOR, HOUSE, 30, 130, 20, 20, { body: DRAFT.body }), at: DRAFT.at, draft: true };
const RECORDS = Object.fromEntries([...world.marks, DRAFT_MARK].map((m) => [m.id, m]));
const bearingOf = (x, y) => (Math.abs(x) >= Math.abs(y) ? (x >= 0 ? "E" : "W") : (y >= 0 ? "S" : "N"));
const NEARBY = [...FIXTURE, DRAFT_MARK].map((m) => ({ id: m.id, kind: m.kind, tier: m.tier, at: m.at, distance_m: Math.round(Math.hypot(m.at.x, m.at.y)), bearing: bearingOf(m.at.x, m.at.y) }));

async function bootOffice() {
  const port = await freePort();
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, accept, *"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (b, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/ops/whoami") return send({ principal: false, household: HOUSE, handles: [ACTOR], households: { [ACTOR]: { slug: HOUSE } } });
    if (url.pathname === "/world/my-marks") return send({ drafts: [DRAFT], docket: [], published: FIXTURE.filter((m) => m.household === HOUSE).map((m) => ({ id: m.id, at: m.at, extent: m.extent, kind: m.kind })), backed: [], counts: { drafts: 1, docket: 0, published: 4, backed: 0 }, complete: true });
    if (url.pathname === "/world/state") return send(world);
    if (url.pathname === "/world/enter-exit-ledger") return send({ ledger: "# invented\n" });
    if (url.pathname === "/world/apex") return send({ handle: ACTOR, standpoint: { x: 0, y: 0, name: "the rig's standpoint", stance: "embodied" }, within: [], nearby: NEARBY, records: RECORDS, telling: "The rig's air is clear.", actions: [{ action: "walk" }], present: { residents: [] } });
    if (url.pathname === "/world/present") return send({ at: 190, residents: [] });
    if (url.pathname === "/world/walkers") return send({ at: 190, walkers: [], standing: [{ handle: ACTOR, x: 0, y: 0, standing: true }] });
    res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((ok) => srv.listen(port, "127.0.0.1", ok));
  CLEANUP.push(() => new Promise((done) => { srv.close(() => done()); srv.closeAllConnections?.(); }));
  return { port };
}
async function bootRig() {
  const atlasPort = await freePort();
  const atlas = createHttp((req, res) => { if (req.url.startsWith("/atlas/")) { res.writeHead(200, { "content-type": "text/html" }); return res.end('<!doctype html><html><body><svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 2400"><rect width="1500" height="2400" fill="#101418"/></svg></body></html>'); } res.writeHead(404); res.end(""); });
  await new Promise((ok) => atlas.listen(atlasPort, "127.0.0.1", ok));
  CLEANUP.push(() => new Promise((done) => { atlas.close(() => done()); atlas.closeAllConnections?.(); }));
  const dir = mkdtempSync(join(tmpdir(), "core127-world-"));
  CLEANUP.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "world-state.json"), JSON.stringify(world));
  for (const f of ["skeleton.json", "enter-exit-ledger.md", "walk-ledger.md", "enter-exit-ledger-frozen.md"]) { try { cpSync(join(ROOT, "WORLD", f), join(dir, f)); } catch { /* optional */ } }
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], { cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:" + atlasPort, SHELF_ORIGIN: "http://127.0.0.1:" + atlasPort, WORLD_DIR: dir }, stdio: ["ignore", "pipe", "pipe"] });
  CLEANUP.push(() => new Promise((done) => {
    if (proc.exitCode !== null || proc.signalCode) return done();
    const hard = setTimeout(() => proc.kill("SIGKILL"), 5_000);
    proc.once("exit", () => { clearTimeout(hard); done(); });
    proc.kill();
  }));
  await new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes("localhost:" + port)) { clearTimeout(t); ok(); } });
    proc.on("exit", (c) => { clearTimeout(t); no(new Error("the rig exited " + c)); });
  });
  return { port };
}
before(async () => {
  try { chromium = (await import("playwright")).chromium; } catch { chromium = null; }
  if (!chromium) return;
  [rig, office] = await Promise.all([bootRig(), bootOffice()]);
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

async function openPage({ signedIn = true, viewport = { width: 1280, height: 900 } } = {}) {
  const page = await machinePage(browser, { viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  await page.route("**/world-engine/residents-meta.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated: "2026-11-20T00:00:00Z", residents: { [ACTOR]: { name: "Rig Actor (invented)", color: "#d65f3f", household: "Rig House" } } }) }));
  await page.addInitScript(({ base, signedIn: s }) => {
    try {
      localStorage.setItem("pm.office.base", base);
      if (s) { localStorage.setItem("pm_key", "rig-key-not-a-secret"); localStorage.setItem("pm.world.act_as", "rig-actor"); }
      for (const who of ["rig-actor", "rig-house"]) localStorage.setItem("pm_world_tour_seen:" + who, "1");
    } catch { /* storage refused */ }
  }, { base: "http://127.0.0.1:" + office.port, signedIn });
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-mapctl", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => document.querySelectorAll("svg circle.ov-pip, svg g.ov-home").length > 0, null, { timeout: 60_000 });
  return { page, errors };
}
const SEL = {
  pips: `svg [data-id]`,
};
const marksOnMap = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll("svg circle.ov-pip, svg g.ov-home")].map((e) => (e.closest("[data-id]") ?? e).getAttribute("data-id")).filter(Boolean))].sort());
const marksInList = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll(".wv-telling .wv-card[data-id], .wv-telling [data-mark-id]")].map((e) => e.getAttribute("data-id") || e.getAttribute("data-mark-id")).filter(Boolean))].sort());
const click = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel);
const settle = (page) => page.waitForTimeout(900);
/** Bring the invented scene into view with the map's own controls: follow the acting resident, zoom about them with the wheel, then drag the middle of the
 *  invented marks to the middle of the painting. (Camera moves only: which marks are drawn is the thing under test.) */
async function frameScene(page, { x0 = 0, width = 1280, height = 900, notches = 4 } = {}) {
  const cx = x0 + (width - x0) / 2, cy = height / 2;
  const actor = () => page.evaluate(() => { const l = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /Rig Actor \(invented\)/.test(e.textContent || "")); if (!l) return null; const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top - 14 }; });
  await click(page, ".wv-map-follow"); await page.waitForTimeout(3000);
  for (let i = 0; i < notches; i++) { const a = (await actor()) ?? { x: cx, y: cy }; await page.mouse.move(Math.max(x0 + 20, Math.min(width - 20, a.x)), Math.max(60, Math.min(height - 20, a.y + 8))); await page.mouse.wheel(0, -300); await page.waitForTimeout(300); }
  await page.waitForTimeout(2000);
  const c = await page.evaluate(() => { const p = [...document.querySelectorAll("svg circle.ov-pip")].filter((e) => /^(rig-house|other-house)\//.test((e.closest("[data-id]") ?? e).getAttribute("data-id") || "")).map((e) => e.getBoundingClientRect()); if (!p.length) return null; return { x: p.reduce((s, r) => s + r.left + r.width / 2, 0) / p.length, y: p.reduce((s, r) => s + r.top + r.height / 2, 0) / p.length }; });
  if (c) { const sx = x0 + 260, sy = 160; await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + (cx - c.x) / 2, sy + (cy - c.y) / 2, { steps: 6 }); await page.mouse.move(sx + (cx - c.x), sy + (cy - c.y), { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(2000); }
}

test("THE SHIPPED CONSUMERS: the huge non-match is drawn, listed and answers a hover; chosen through the real panel it is none of those, and the restores are exact", { skip: undefined }, async (t) => {
  if (!chromium) return t.skip(SKIP);
  const { page, errors } = await openPage();
  try {
    await click(page, ".wv-telling-toggle"); await page.waitForTimeout(1200);       // the Telling list beside the map
    await frameScene(page, { x0: 740 });
    const everything = ALL_IDS;
    // the world as it is: every mark of the fixture is told (list) and the parcels, pips and the huge mark's pip are drawn
    const before = { map: await marksOnMap(page), list: await marksInList(page) };
    assert.ok(before.list.includes("invented/the-huge-hall"), "the huge mark is in the list");
    assert.ok(before.map.includes("invented/the-huge-hall"), "…and on the map (its pip)");
    for (const id of ["other-house/parcel-a", "other-house/parcel-b", ...MATCHES]) assert.ok(before.map.includes(id), `${id} is on the map`);
    for (const id of everything) assert.ok(before.list.includes(id), `${id} is in the list`);

    // a point the huge mark covers and no smaller mark does: pointing there names the huge mark (the containing-mark pick)
    const point = await page.evaluate(() => {
      const box = document.querySelector("svg circle.ov-pip").ownerSVGElement; const r = box.getBoundingClientRect();
      const taken = (x, y) => document.elementsFromPoint(x, y).some((e) => { const id = (e.closest?.("[data-id]") ?? e).getAttribute?.("data-id"); return id && id !== "invented/the-huge-hall" && !/^the-town\//.test(id); });
      for (let y = r.top + 120; y < r.bottom - 60; y += 40) for (let x = r.left + 40; x < r.right - 40; x += 40) if (!taken(x, y)) return { x, y };
      const probe = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).map((e) => `${e.tagName}.${(e.getAttribute("class") || "").split(" ")[0]}#${(e.closest("[data-id]") ?? e).getAttribute("data-id") || ""}`);
      return { none: true, probe, box: [r.left, r.top, r.width, r.height] };
    });
    assert.ok(point && !point.none, `an empty point on the map (${JSON.stringify(point)})`);
    // POINTING: with the Telling open (not painting-only) a hover is the lit outline of the mark the pick returns (`.wv-hl-box.is-hover`); the huge mark's
    // outline is far larger than any other mark's here, so its width says whose it is. The pick's answer at `point` is counted and measured.
    const hover = async () => {
      await page.mouse.move(point.x - 3, point.y - 3); await page.mouse.move(point.x, point.y); await page.waitForTimeout(600);
      return page.evaluate(() => { const b = [...document.querySelectorAll(".wv-hl-box.is-hover")]; return { count: b.length, widest: Math.round(Math.max(0, ...b.map((e) => e.getBoundingClientRect().width))) }; });
    };
    const nameplate = async () => { const h = await hover(); return h.count > 0 ? `lit outline ${h.widest}px` : ""; };
    const first = await hover();
    assert.ok(first.count >= 1 && first.widest > 1500, `unfiltered, the huge mark answers the point it covers (${JSON.stringify(first)})`);

    // choose, through the real controls: the places switched off (so the parcels are what is left to see) + my marks + under 80 m
    await click(page, ".wv-filters-open"); await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.querySelector(".wv-filters-open").getAttribute("aria-expanded")), "true");
    await click(page, '[data-dsel-layer="place"]'); await page.waitForTimeout(300);
    await click(page, '[data-dsel="mine"]'); await page.waitForTimeout(300);
    await page.fill("[data-dsel-size]", "80"); await settle(page);
    const chosen = { map: await marksOnMap(page), list: await marksInList(page) };
    assert.deepEqual(chosen.map, MATCHES, "the map holds only the matches");
    assert.deepEqual(chosen.list, MATCHES, "the list holds only the matches");
    assert.equal(await nameplate(), "", "the hidden huge mark no longer takes the point it covers: nothing is lit there");
    assert.match(await page.evaluate(() => document.querySelector(".wv-dstrip")?.innerText ?? ""), /2 of \d+ shown/);

    // size is the mark's own extent: a zoom changes nothing about WHICH marks are drawn
    await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, -300); await settle(page);
    const zoomed = await marksOnMap(page);
    assert.ok(zoomed.every((id) => MATCHES.includes(id)), "after a zoom, still only matches");
    await page.mouse.wheel(0, 300); await settle(page);

    // removing one chip restores exactly that choice. With the places off, the fixture's places (the huge hall, the orchard, the lantern, the bench, the
    // fountain, the draft) are gone and its parcels stay; a mark that wears no icon (the town's own ground marks) has no switch, so it is not hidden BY the
    // places switch: the checks are by the fixture's own ids, never by an exact list of everything the world holds.
    const PLACES = FIXTURE.filter((m) => m.kind !== "parcel").map((m) => m.id).concat(DRAFT.id);
    const PARCELS = ["other-house/parcel-a", "other-house/parcel-b", ...MATCHES];
    await click(page, '[data-dsel-remove="mine"]'); await settle(page);
    const parcelsOnly = await marksInList(page);
    for (const id of PARCELS) assert.ok(parcelsOnly.includes(id), `my marks removed: ${id} (a parcel under 80 m) is listed`);
    for (const id of PLACES) assert.ok(!parcelsOnly.includes(id), `${id} (a place) stays hidden while the places switch is off`);
    await click(page, '[data-dsel-remove="size"]'); await settle(page);
    const placesOffOnly = await marksInList(page);
    for (const id of PARCELS) assert.ok(placesOffOnly.includes(id), `size removed: ${id} is listed`);
    for (const id of PLACES) assert.ok(!placesOffOnly.includes(id), `${id} is still hidden: only the size chip was removed`);
    await click(page, '[data-dsel-remove="off:place"]'); await settle(page);
    const placesBack = await marksInList(page);
    for (const id of ALL_IDS) assert.ok(placesBack.includes(id), `the places switched back on: ${id} is listed again`);
    // all-clear: today's display, exactly
    await click(page, "[data-dsel-clear]"); await settle(page);
    assert.deepEqual({ map: await marksOnMap(page), list: await marksInList(page) }, before, "all-clear restores today's unfiltered display");
    assert.equal(await page.evaluate(() => !!document.querySelector(".wv-dstrip")), false, "and the strip is gone");
    assert.match(await nameplate(), /lit outline/, "and the huge mark answers its point again");

    // sort-by-type: the list is reordered and grouped by kind; no pip moves or goes
    const pipsBefore = await marksOnMap(page);
    await click(page, '[data-dsel="sort"]'); await settle(page);
    const groups = await page.evaluate(() => [...document.querySelectorAll(".wv-telling [data-type-group]")].map((g) => g.getAttribute("data-type-group")));
    assert.deepEqual(groups, [...groups].sort(), "kinds in order");
    assert.ok(groups.includes("parcel") && groups.includes("sited"));
    assert.deepEqual(await marksOnMap(page), pipsBefore, "the map did not move");
    assert.deepEqual(await marksInList(page), before.list, "nothing was hidden by sorting");

    // keyboard: Escape closes the panel and puts focus back on the opener
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.querySelector(".wv-dpanel").hidden), true);
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("wv-filters-open")), true, "focus is back on the opener");
    assert.deepEqual(errors, [], "no page errors");
  } finally { await page.close(); }
});

test("a spectator (no household) cannot choose my marks or my drafts; the other choices work", async (t) => {
  if (!chromium) return t.skip(SKIP);
  const { page } = await openPage({ signedIn: false });
  try {
    await click(page, ".wv-filters-open"); await page.waitForTimeout(300);
    const chips = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-dsel]")].map((b) => [b.dataset.dsel, b.disabled])));
    assert.equal(chips.mine, true); assert.equal(chips.drafts, true);
    assert.equal(chips.parcels, undefined, "the old text chip is gone"); assert.equal(chips.sort, false); assert.equal(chips.new, false);
    // the icon switches are open to a spectator too
    const layers = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-dsel-layer]")].map((b) => [b.dataset.dselLayer, [b.disabled, b.getAttribute("aria-pressed")]])));
    for (const k of ["residents", "conversation", "home", "place"]) assert.deepEqual(layers[k], [false, "true"], `${k} is offered, enabled and on`);
    assert.equal(layers.door, undefined, "no switch for a kind this world does not hold");
  } finally { await page.close(); }
});

test("CORE-147: THE ICON SWITCHES in the real viewer: the residents and the speech bubbles are switches in the Filters panel (the 💬 button is gone), each hides its draw and its hit target, and all-clear restores today's view", async (t) => {
  if (!chromium) return t.skip(SKIP);
  const { page, errors } = await openPage();
  try {
    await frameScene(page, { x0: 0 });
    assert.equal(await page.evaluate(() => !!document.querySelector(".wv-map-convo")), false, "no second control for the speech bubbles");
    const state = () => page.evaluate(() => ({
      bodies: document.querySelectorAll("#wv-walk-layer [data-walker]").length,
      standpoint: !!document.querySelector(".ov-standpoint"),
      convoShown: document.getElementById("wv-convo-layer")?.style.display !== "none",
      pressed: Object.fromEntries([...document.querySelectorAll("[data-dsel-layer]")].map((b) => [b.dataset.dselLayer, b.getAttribute("aria-pressed")])),
      stored: (() => { try { return localStorage.getItem(Object.keys(localStorage).find((k) => /convo/i.test(k)) ?? "") } catch { return null; } })(),
      strip: document.querySelector(".wv-dstrip")?.innerText.replace(/\s+/g, " ") ?? "",
    }));
    await click(page, ".wv-filters-open"); await page.waitForTimeout(300);   // the kinds the world holds are read when the panel is opened
    const today = await state();
    assert.ok(today.bodies > 0, "the acting resident's body is on the map");
    assert.equal(today.convoShown, true, "the speech bubbles are on by default: today's view");
    assert.deepEqual([today.pressed.residents, today.pressed.conversation, today.pressed.home, today.pressed.place], ["true", "true", "true", "true"]);
    assert.equal(today.strip, "", "nothing is hidden: no strip");

    // the residents off: no body, no walking line, no chevron; the viewer's own standpoint marker (selection feedback) stays; the marks and the list are untouched
    const marksBefore = await marksOnMap(page);
    await click(page, '[data-dsel-layer="residents"]'); await settle(page);
    const noRes = await state();
    assert.equal(noRes.bodies, 0, "no resident is drawn");
    assert.equal(noRes.standpoint, true, "the acting resident's standpoint marker is selection feedback and stays");
    assert.equal(noRes.pressed.residents, "false");
    assert.match(noRes.strip, /no residents/);
    assert.deepEqual(await marksOnMap(page), marksBefore, "switching the residents off hides no mark");
    // …and nothing hidden answers a point: the resident's old spot names no resident
    const spot = await page.evaluate(() => { const e = document.querySelector(".ov-standpoint"); const r = e?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
    if (spot) { await page.mouse.move(spot.x - 4, spot.y - 4); await page.mouse.move(spot.x, spot.y); await page.waitForTimeout(500); }
    assert.equal(await page.evaluate(() => document.querySelectorAll(".wv-bubble.is-hover.is-walker, .wv-bubble-walker").length), 0, "a hidden resident takes no hover");

    // the speech bubbles off: the layer is hidden, the choice is the remembered one, the chip says so
    await click(page, '[data-dsel-layer="conversation"]'); await settle(page);
    const noBub = await state();
    assert.equal(noBub.convoShown, false, "the speech-bubble layer is hidden");
    assert.equal(noBub.pressed.conversation, "false");
    assert.match(noBub.strip, /no speech bubbles/);
    // a chip's ✕ turns that one layer back on
    await click(page, '[data-dsel-remove="bubbles"]'); await settle(page);
    const bubBack = await state();
    assert.equal(bubBack.convoShown, true); assert.equal(bubBack.pressed.conversation, "true"); assert.ok(!/speech bubbles/.test(bubBack.strip));
    assert.equal(bubBack.pressed.residents, "false", "…and only that one");

    // a mark kind off through its icon: its marks leave the map and the list; all-clear puts every layer back
    await click(page, '[data-dsel-layer="place"]'); await settle(page);
    assert.equal((await marksOnMap(page)).includes("rig-house/lantern"), false, "a place (the lantern) is gone with the places switch off");
    assert.equal((await marksOnMap(page)).includes("rig-house/home-parcel"), true, "…and a parcel stays: its own switch is on");
    await click(page, '[data-dsel-layer="conversation"]'); await settle(page);
    await click(page, "[data-dsel-clear]"); await settle(page);
    const cleared = await state();
    assert.equal(cleared.bodies, today.bodies, "the residents are back as they were");
    assert.equal(cleared.convoShown, true, "the speech bubbles are back (all-clear is today's view)");
    assert.deepEqual([cleared.pressed.residents, cleared.pressed.conversation, cleared.pressed.home, cleared.pressed.place], ["true", "true", "true", "true"]);
    assert.equal(cleared.strip, "");
    assert.deepEqual(await marksOnMap(page), marksBefore, "and every mark");
    assert.deepEqual(errors, [], "no page errors");
  } finally { await page.close(); }
});
