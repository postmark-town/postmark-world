// outsider-and-fill.test.mjs — two pieces ruled in Sitting B (WLD-26, 2026-10-19
// 17:48): the outsider view and the per-thing fill flag.
//
// THE OUTSIDER VIEW. "View as an outsider" reads the world as if the reading
// household owned nothing. The owner rule ("a household's own marks are always
// its own to see") is the `keep` a caller hands the world tools' one sight
// function, standpointSight; the office's `lens: "outsider"` hands it none, and
// the page asks the office for that read and lays none of the household's own
// rows over it. (The switch itself is the office's, tested there:
// test/outsider-lens.test.mjs.) One switch on one rule, never a second copy of sight.
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
import { placeholderExtentSVG, lensQuery, mineForSight, foldForSight, lensAnswered, readStillWanted, residentReadKey, OUTSIDER_LENS, OUTSIDER_UNAVAILABLE } from "../spectator/viewer.mjs";
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

test("the page's lens: the read asks for it, lays none of your own rows over it, and draws the town's fold", () => {
  assert.equal(lensQuery(false), "", "off: the read you always asked for, byte for byte");
  assert.equal(lensQuery(true), `&lens=${OUTSIDER_LENS}`);
  const mine = new Map([["mason/draft", { id: "mason/draft" }]]);
  assert.equal(mineForSight(false, mine), mine);
  assert.equal(mineForSight(true, mine).size, 0, "no draft and no mark of yours the read did not tell");
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

test("[pin] under the lens you own and hold nothing: the green own-mark colouring and your hands are off", () => {
  assert.ok(SOURCE.includes("const isOwnMark = (m) => !!m?.id && !state.outsider && state.ownIds.has(m.id);"), "no green own-mark colouring");
  assert.ok(SOURCE.includes("const handle = onResidentPath() && !state.outsider ? state.handle : null;"), "no hands");
  assert.match(SOURCE, /state\.outsider = !state\.outsider;\s+paintOutsiderButton\(\);\s+loadHands\(\{ fresh: true \}\);/, "and the hands are asked again on every switch");
});
