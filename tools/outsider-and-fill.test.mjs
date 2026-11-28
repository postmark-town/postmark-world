// outsider-and-fill.test.mjs — two pieces ruled in Sitting B (WLD-26, 2026-10-19
// 17:48): the outsider view and the per-thing fill flag.
//
// THE OUTSIDER VIEW. "View as an outsider" reads the world as if the reading
// household owned nothing. The owner rule ("a household's own marks are always
// its own to see") is the `keep` a caller hands the world tools' one sight
// function, standpointSight; the office's `lens: "outsider"` hands it none, and
// the page asks the office for that read and lays over it only the household's
// own rows that the same sight of the town's record still holds (postmark#4479):
// a published mark stays, a draft and a mark inside a closed place go. (The
// switch itself is the office's, tested there: test/outsider-lens.test.mjs.)
// One switch on one rule, never a second copy of sight.
//
// THE FILL FLAG. A picture-less thing draws a tinted block; `fill: false` (the
// thing class's sovereign property, default true) draws its outline alone, so a
// floor's art beneath it shows through. The lint holds it to true or false.
// Run: node --test tools/outsider-and-fill.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { placeholderExtentSVG, lensQuery, mineForSight, seenIdsOf, foldForSight, lensAnswered, readStillWanted, residentReadKey, residentById, fillFromTown, fillOwnFromTown, townHouseMarks, OUTSIDER_LENS, OUTSIDER_UNAVAILABLE, OUTSIDER_RECORD_UNREAD } from "../spectator/viewer.mjs";
import { standpointSight } from "./world-verbs.mjs";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SOURCE = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");

// ── the fill flag ────────────────────────────────────────────────────────────
const geometry = { kind: "sited", at: { x: 0, y: 0 }, extent: { w: 4, h: 4 } };
const px = (p) => p;
const thing = (extra = {}) => placeholderExtentSVG({ ...geometry, id: "maker/a-crate", class: "thing", ...extra }, px);

test("fill absent: a picture-less thing draws as it always has, the tinted block", () => {
  assert.match(thing(), /class="wv-ph-extent is-thing"/);
  assert.match(thing({ fill: true }), /class="wv-ph-extent is-thing"/, "true is the default, said aloud");
  assert.match(thing({ fill: "true" }), /class="wv-ph-extent is-thing"/, "as the record grammar writes it");
});

test("fill: false draws the thing's outline alone, as ground is drawn", () => {
  // ⚑ THE FLIP: drop `&& propertyValue(mark.fill) !== false` in placeholderExtentSVG → these red
  assert.match(thing({ fill: false }), /class="wv-ph-extent"/);
  assert.doesNotMatch(thing({ fill: false }), /is-thing/);
  assert.doesNotMatch(thing({ fill: "false" }), /is-thing/, "the word false, as a record writes it");
  const place = placeholderExtentSVG({ ...geometry, id: "maker/a-crate" }, px);
  assert.equal(thing({ fill: false }), place, "the very markup a place of the same id gets");
});

// the lint, over a copy of the real tree with one thing of our own laid in it
const SCRATCH = [];
after(() => { for (const d of SCRATCH) rmSync(d, { recursive: true, force: true }); });
function treeWith(fillLine) {
  const repo = mkdtempSync(join(tmpdir(), "fill-")); SCRATCH.push(repo);
  mkdirSync(join(repo, "WORLD"), { recursive: true });
  cpSync(join(ROOT, "LOGOS"), join(repo, "LOGOS"), { recursive: true });
  copyFileSync(join(ROOT, "WRITES.md"), join(repo, "WRITES.md"));
  for (const f of ["skeleton.json", "filing-freeze.json", "households.json"]) copyFileSync(join(ROOT, "WORLD", f), join(repo, "WORLD", f));
  cpSync(join(ROOT, "WORLD", "marks"), join(repo, "WORLD", "marks"), { recursive: true });
  const dir = join(repo, "WORLD", "marks", "fill-probe", "the-crate");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "mark.md"), `---\nkind: thing\nby: fill-probe\ndate: 2026-10-22\nat: { x: 90000, y: 90000 }\nextent: { w: 1, h: 1 }\n${fillLine}---\n\nA crate.\n`);
  return repo;
}
const lint = (repo) => {
  try { return execFileSync("node", [join(HERE, "mark-lint.mjs"), "--repo", repo], { encoding: "utf8" }); }
  catch (e) { return String(e.stdout ?? "") + String(e.stderr ?? ""); }
};
const fillErrors = (out) => out.split("\n").filter((l) => /fill-probe\/the-crate/.test(l) && /fill: is true or false/.test(l));

test("the lint: fill is true or false; anything else is refused by name", () => {
  // ⚑ THE FLIP: drop the 5d rule in mark-lint.mjs → the refusal is gone and this reds
  const bad = lint(treeWith("fill: no\n"));
  assert.equal(fillErrors(bad).length, 1, "one refusal, for the crate");
  assert.match(fillErrors(bad)[0], /^\[ERROR\]/, "an error, not an advisory");
  assert.match(fillErrors(bad)[0], /got "no"/);
  assert.equal(fillErrors(lint(treeWith("fill: false\n"))).length, 0, "false is lawful");
  assert.equal(fillErrors(lint(treeWith(""))).length, 0, "absent is lawful: the default");
});

test("the thing class declares fill: sovereign, default true", () => {
  const node = readFileSync(join(ROOT, "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-node/mark/thing/thing-fill/mark.md"), "utf8");
  assert.match(node, /^kind: property$/m);
  assert.match(node, /^tier: sovereign$/m);
  assert.match(node, /^name: fill$/m);
  assert.match(node, /^default: true$/m, "today's draw is the default (the ruling)");
});

// ── the outsider view ────────────────────────────────────────────────────────

// postmark#4479's four cases, on one household's rows: a draft (never on the
// record), a published path far from the standpoint, a closed place of theirs,
// and a published mark standing inside it. The record holds all but the draft.
const PATH = { id: "mason/raised-path", kind: "sited", at: { x: 900, y: 900 }, extent: { w: 4, h: 40 } };
const VAULT = { id: "mason/the-vault", kind: "sited", class: "dungeon", at: { x: 100, y: 100 }, extent: { w: 20, h: 20 } };
const COIN = { id: "mason/a-coin", kind: "sited", at: { x: 100, y: 100 }, extent: { w: 1, h: 1 } };
const DRAFT = { id: "mason/draft", kind: "sited", at: { x: 5, y: 5 }, extent: { w: 1, h: 1 } };
const ownRows = () => new Map([DRAFT, PATH, VAULT, COIN].map((m) => [m.id, m]));
const RECORD = { marks: [PATH, VAULT, COIN, { id: "stranger/a-bench", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 1, h: 1 } }] };

test("the page's lens: the read asks for it, lays only the rows a stranger sees over it, and draws the town's fold", () => {
  assert.equal(lensQuery(false), "", "off: the read you always asked for, byte for byte");
  assert.equal(lensQuery(true), `&lens=${OUTSIDER_LENS}`);
  const mine = ownRows();
  assert.equal(mineForSight(false, mine), mine, "lens off: every row, the same map");
  assert.equal(mineForSight(false, mine, new Set()), mine, "lens off: `seen` changes nothing");
  // the sight the page takes of the record: standpointSight, no keep, nothing entered
  const sight = standpointSight(RECORD, { occupancy: new Map(), handle: "mason" });
  assert.ok(!sight.marks.some((m) => m.id === COIN.id), "fixture: the closed place hides what stands inside it");
  const seen = seenIdsOf(sight);
  // ⚑ THE FLIP: return `new Map()` under the lens again (today's mineForSight) → the path is dropped and this reds
  assert.deepEqual([...mineForSight(true, mine, seen).keys()].sort(), [VAULT.id, PATH.id].sort(),
    "under the lens: the published path and the closed place's own mark stay; the draft and the mark inside it go");
  assert.equal(mineForSight(true, mine).size, 0, "no record in hand: none of your rows, as before (fail closed)");
  assert.equal(mineForSight(true, mine, null).size, 0);
  assert.equal(seenIdsOf(null), null);
  assert.equal(seenIdsOf({}), null);
  assert.equal(foldForSight({ trueWorld: "town", myWorld: "yours" }, false), "yours");
  assert.equal(foldForSight({ trueWorld: "town", myWorld: "yours" }, true), "town");
  assert.equal(foldForSight({ trueWorld: "town", myWorld: null }, false), "town");
});

test("[pin] the toggle: off at every load, offered only to someone with a household, and every resident read carries the lens", () => {
  // ⚑ THE FLIP: drop `${lensQuery(state.outsider)}` from loadResidentRead's url → the first line reds
  assert.match(SOURCE, /\+ `&crossing=\$\{state\.crossing\}&telling=true\$\{lensQuery\(askedLens\)\}`\);/, "the resident read, under the lens it was asked with");
  assert.match(SOURCE, /&handle=\$\{encodeURIComponent\(who\)\}\$\{lensQuery\(state\.outsider\)\}/, "the close look");
  assert.match(SOURCE, /outsider: false,\s+\/\/ the outsider lens \(WLD-26\): off at every load/);
  assert.match(SOURCE, /<button type="button" class="ctl wv-outsider-toggle" aria-pressed="false" hidden aria-label="view as an outsider"/);
  assert.match(SOURCE, /const offered = canAct\(\) && !!state\.handle;/);
  assert.match(SOURCE, /data\.worldState = foldForSight\(data, state\.outsider\);/);
  assert.doesNotMatch(SOURCE, /residentById\(\w+( \?\? \{\})?, mineSet\.marks\)/, "every resident index asks mineForSight");
});

// ── the resident read under the lens, driven (WLD-110 F1, F2) ───────────────
// loadResidentRead's own body, run in a context whose fetch we answer by hand,
// as lights-lifecycle.test.mjs drives it.
function bodyOf(name) {
  const text = SOURCE.match(new RegExp(`^  function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}`, "m"))?.[0];
  assert.ok(text, `source extraction: ${name}`);
  return text;
}
function readHarness() {
  const requests = [], indexed = [], unavailable = [];
  const context = vm.createContext({
    residentReadKey, lensQuery, mineForSight, lensAnswered, readStillWanted, OUTSIDER_LENS, requests, indexed, unavailable,
    fetch: (url) => new Promise((resolve) => { requests.push({ url, answer: (j) => resolve({ ok: true, json: async () => j }) }); }),
    authHeaders: () => ({}), residentById: (read) => { indexed.push(read); return new Map(); },
    loadTownHouses: () => {}, loadHands: () => {}, withTownHouses: () => {}, buildHomeSet: () => new Set(), allMarks: () => [],
    outsiderUnavailable: () => unavailable.push(1),
  });
  vm.runInContext(`
    const officeBase = () => "https://office-a.invalid";
    const officeUrl = (path) => officeBase() + path;
    const state = { handle: "rig-actor", crossing: 500, outsider: false };
    const walkState = { walkers: [{ handle: "rig-actor" }] };
    const readCache = new Map(), readPending = new Map();
    let readError = null, byId, homeSet;
    const mineSet = { marks: new Map() };
    ${bodyOf("residentStandpointKey")}
    ${bodyOf("loadResidentRead")}
    globalThis.probe = { state, readCache, read: () => loadResidentRead(null, state.handle) };
  `, context);
  return { probe: context.probe, requests, indexed, unavailable };
}

test("F1: an outsider read that lands after the lens was turned off draws nothing (the guard pins the lens)", async () => {
  const h = readHarness();
  h.probe.state.outsider = true;
  const pending = h.probe.read();
  assert.match(h.requests[0].url, /&lens=outsider$/, "asked under the lens");
  h.probe.state.outsider = false;   // the reader turned it off before the answer came
  h.requests[0].answer({ handle: "rig-actor", lens: OUTSIDER_LENS, records: {} });
  await pending;
  // ⚑ THE FLIP: drop `lens` from readStillWanted's check (or askedLens from the guard) → the stale read is indexed and this reds
  assert.equal(h.indexed.length, 0, "the lens read is not drawn into the owner's page");
  assert.equal(readStillWanted({ handle: "a", office: "o", lens: true }, { handle: "a", office: "o", lens: false }), false);
  assert.equal(readStillWanted({ handle: "a", office: "o", lens: false }, { handle: "a", office: "o", lens: false }), true);
});

test("F2: an office that ignores the lens is never believed: the toggle goes off and says why", async () => {
  const h = readHarness();
  h.probe.state.outsider = true;
  const pending = h.probe.read();
  h.requests[0].answer({ handle: "rig-actor", records: {} });   // an office without the lens: the owner's own sight, unmarked
  const read = await pending;
  // ⚑ THE FLIP: drop the lensAnswered check in loadResidentRead → the owner's sight is drawn under the lens and this reds
  assert.equal(read, null);
  assert.equal(h.unavailable.length, 1, "the toggle is turned off, with its reason");
  assert.equal(h.indexed.length, 0, "and nothing is drawn as the outsider's");
  assert.equal(h.probe.readCache.size, 0, "nor kept as the lens's answer");
  assert.equal(lensAnswered(true, { lens: OUTSIDER_LENS }), true);
  assert.equal(lensAnswered(false, {}), true, "no lens asked, nothing to check");
  assert.equal(OUTSIDER_UNAVAILABLE, "the office can't show the outsider view yet");
  assert.ok(SOURCE.includes("if (!lensAnswered(askedLens, read)) { outsiderUnavailable(); return null; }"));
});

// ── postmark#4479: the record decides which of your rows the lens keeps, driven ─
test("[pin] every own-row overlay hands mineForSight the record's ids", () => {
  const calls = SOURCE.match(/mineForSight\([^()]*\)/g) ?? [];
  assert.ok(calls.length >= 7, `the six overlays and the re-lay ask mineForSight (found ${calls.length})`);
  // ⚑ THE FLIP: drop `, townSeen` from any call → `seen` is undefined there, that overlay keeps nothing under the lens, and this reds
  for (const c of calls) assert.match(c, /, townSeen\)$/, `${c} passes the record's ids`);
  assert.ok(SOURCE.includes("townSeen = seenIdsOf(townWorld);"), "the ids come from the page's own sight of the record");
});

function townHarness({ outsider = true } = {}) {
  const requests = [], notes = [], drawn = [], asked = [];
  const context = vm.createContext({
    residentReadKey, mineForSight, seenIdsOf, residentById, fillFromTown, fillOwnFromTown, townHouseMarks, standpointSight,
    OUTSIDER_LENS, OUTSIDER_RECORD_UNREAD, requests, notes, drawn, asked,
    fetchWorldState: () => new Promise((resolve, reject) => { requests.push({ answer: (json) => resolve({ json }), fail: (e) => reject(e) }); }),
    recordSources: (path) => [{ url: `https://record.invalid${path}` }],
    buildHomeSet: () => new Set(), drawOverlay: () => drawn.push(1),
    walkNote: (el) => notes.push(el.textContent),
    document: { createElement: () => ({ textContent: "", classList: { add() {} } }) },
    console: { warn() {} },
  });
  vm.runInContext(`
    const officeBase = () => "https://office-a.invalid";
    const state = { handle: "mason", crossing: 500, outsider: ${outsider} };
    const walkState = { walkers: [{ handle: "mason" }] };
    const onResidentPath = () => true;
    const sightOf = (w) => standpointSight(w, { occupancy: new Map(), handle: state.handle });
    const readCache = new Map();
    let byId = new Map(), homeSet = new Set(), lastRadial = { at: 1 };
    let townHouses = null, townWorld = null, townChain = null, townSeen = null, townHousesPending = null;
    const mineSet = { marks: new Map() };
    const allMarks = () => [...byId.values()];
    ${bodyOf("residentStandpointKey")}
    ${bodyOf("loadTownHouses")}
    ${bodyOf("withTownHouses")}
    ${bodyOf("relayOwnRows")}
    ${bodyOf("lensRecordUnread")}
    globalThis.probe = {
      state, readCache, mineSet, key: () => residentStandpointKey(null, state.handle),
      load: () => loadTownHouses(), byId: () => byId, seen: () => townSeen,
      lay: (read) => { byId = residentById(read, mineForSight(state.outsider, mineSet.marks, townSeen)); },
    };
  `, context);
  return { probe: context.probe, requests, notes, drawn };
}

test("4479 driven: turn the lens on, answer the town's record, and the published mark stays while the draft goes", async () => {
  const h = townHarness({ outsider: true });
  const lensRead = { handle: "mason", lens: OUTSIDER_LENS, records: {} };   // the read told none of mason's marks: they are far off
  h.probe.readCache.set(h.probe.key(), lensRead);
  for (const [id, m] of ownRows()) h.probe.mineSet.marks.set(id, m);
  h.probe.lay(lensRead);                       // the lens read lands first, as loadResidentRead draws it
  assert.equal(h.probe.byId().size, 0, "before the record: none of your rows (fail closed)");
  const pending = h.probe.load();
  assert.equal(h.requests.length, 1, "the page's one fetch of the town's record");
  h.requests[0].answer(RECORD);
  await pending;
  // ⚑ THE FLIP: drop `if (state.outsider) relayOwnRows()` from loadTownHouses (or the ids from townSeen) → the path never comes back and this reds
  assert.ok(h.probe.byId().has(PATH.id), "the published path is on the map again, as a stranger sees it");
  assert.ok(h.probe.byId().has(VAULT.id), "the closed place's own mark stays");
  assert.ok(!h.probe.byId().has(DRAFT.id), "the draft is gone");
  assert.ok(!h.probe.byId().has(COIN.id), "what stands inside the closed place is gone");
  assert.equal(h.drawn.length, 1, "and the map is drawn again");
  assert.equal(h.notes.length, 0, "nothing to say when the record was read");
});

test("4479 driven: with the lens off, the record changes nothing: every row of yours, draft included", async () => {
  const h = townHarness({ outsider: false });
  const read = { handle: "mason", records: {} };
  h.probe.readCache.set(h.probe.key(), read);
  for (const [id, m] of ownRows()) h.probe.mineSet.marks.set(id, m);
  h.probe.lay(read);
  const pending = h.probe.load();
  h.requests[0].answer(RECORD);
  await pending;
  assert.deepEqual([...h.probe.byId().keys()].sort(), [...ownRows().keys()].sort());
});

test("4479 driven: when the town's record cannot be read, the lens keeps none of your rows and says so on the map's side", async () => {
  const h = townHarness({ outsider: true });
  const lensRead = { handle: "mason", lens: OUTSIDER_LENS, records: {} };
  h.probe.readCache.set(h.probe.key(), lensRead);
  for (const [id, m] of ownRows()) h.probe.mineSet.marks.set(id, m);
  h.probe.lay(lensRead);
  const pending = h.probe.load();
  h.requests[0].fail(new Error("the record answered 503"));
  await pending;
  assert.equal(h.probe.seen(), null);
  assert.equal(h.probe.byId().size, 0, "none of your rows, never all of them");
  // the line goes where the lens's other refusal goes: walkNote, the note on the map's side
  assert.deepEqual(h.notes, [OUTSIDER_RECORD_UNREAD + "."]);
  assert.equal(OUTSIDER_RECORD_UNREAD, "the outsider view couldn't read the town's record, so it shows none of your own marks");
});

test("4479 driven: turning the lens on before the record is in hand asks for it", () => {
  const asked = [];
  const context = vm.createContext({ mineForSight, residentById, residentReadKey, OUTSIDER_LENS, asked });
  vm.runInContext(`
    const state = { handle: "mason", outsider: false };
    const walkState = { walkers: [{ handle: "mason" }] };
    const officeBase = () => "https://office-a.invalid";
    const readCache = new Map();
    let byId = new Map(), homeSet = new Set(), townSeen = null;
    const mineSet = { marks: new Map() };
    const onResidentPath = () => true, paintOutsiderButton = () => {}, loadHands = () => {}, applyWorldLayer = () => {};
    const withTownHouses = () => {}, buildHomeSet = () => new Set(), allMarks = () => [], renderCurrent = () => {};
    const loadResidentRead = () => Promise.resolve(null), loadTownHouses = () => asked.push(1);
    ${bodyOf("residentStandpointKey")}
    ${bodyOf("toggleOutsider")}
    // a lens read already cached (the cache key carries the lens): the lens was on before, and the record never came
    state.outsider = true;
    readCache.set(residentStandpointKey(null, state.handle), { handle: "mason", lens: OUTSIDER_LENS, records: {} });
    state.outsider = false;
    globalThis.probe = { toggle: () => toggleOutsider(), setSeen: (s) => { townSeen = s; } };
  `, context);
  context.probe.toggle();
  // ⚑ THE FLIP: drop `if (state.outsider && !townSeen) loadTownHouses();` from toggleOutsider → this reds
  assert.equal(asked.length, 1, "lens on, no record yet: the record is asked for");
  context.probe.toggle();
  assert.equal(asked.length, 1, "lens off: nothing asked");
  context.probe.setSeen(new Set());
  context.probe.toggle();
  assert.equal(asked.length, 1, "lens on with the record in hand: nothing asked");
});

test("[pin] under the lens you own and hold nothing: the green own-mark colouring and your hands are off", () => {
  assert.ok(SOURCE.includes("const isOwnMark = (m) => !!m?.id && !state.outsider && state.ownIds.has(m.id);"), "no green own-mark colouring");
  assert.ok(SOURCE.includes("const handle = onResidentPath() && !state.outsider ? state.handle : null;"), "no hands");
  assert.match(SOURCE, /state\.outsider = !state\.outsider;\s+paintOutsiderButton\(\);\s+loadHands\(\{ fresh: true \}\);/, "and the hands are asked again on every switch");
});
