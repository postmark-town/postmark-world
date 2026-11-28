// unpublish-unregistered.test.mjs — WLD-252: the sweep considers a mark the registry never held.
//
// RULED (Darko, 2026-11-25 08:53 EST; Wright's queue 14:33Z: "the sweep considers an unregistered mark only when it currently walks market/commons,
// is unheld and has zero current escrow. Home and town ground, held things, backed commons and unread inputs stay out."). The sweep's own exported
// pieces are driven here (settlement-sweep.mjs § unregisteredCandidates and § unpublishPass, which settlementSweep itself calls), over a small git
// repo, so the filing index, the path reads and the content are real; then one whole crossing shows the take end to end.
//
// FALSIFIER: an exempt (held, home, the town's), backed or unread mark taken; a registry row invented for a mark that had none; the registered rows
// judged any differently than before. Every id is INVENTED, named for the shapes of the real case (Jetto's sweet and its held siblings, Sol's tower).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { settlementSweep, unregisteredCandidates, unpublishPass } from "./settlement-sweep.mjs";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const record = ({ kind = "sited", by, tier, at = { x: 10, y: 10 }, extent = { w: 2, h: 2 }, body = "a mark", extra = [] }) =>
  `${["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), "date: 2026-11-20", `at: { x: ${at.x}, y: ${at.y} }`, `extent: { w: ${extent.w}, h: ${extent.h} }`, ...extra].join("\n")}\n---\n\n${body}\n`;

/** a git repo holding `files` on main, for the filing index and the reads the pass makes */
function filingRepo(t, files) {
  const repo = mkdtempSync(join(tmpdir(), "wld252-pass-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(repo, path)), { recursive: true }); writeFileSync(join(repo, path), text); }
  git("init", "-q", "-b", "main"); git("add", "-A"); git("-c", "user.name=f", "-c", "user.email=f@test.invalid", "commit", "-q", "-m", "main");
  return repo;
}

const P = (id) => `WORLD/marks/${id}/mark.md`;
const SWEET = "jetto/a-sweet-that-was-just-here", HELD = "jetto/a-sweet-in-two-places", TOWER = "sol/the-watchtower", HOME = "jetto/the-standing-lamp",
  BERTH = "the-town/the-berth", NOHOUSE = "drifter/a-loose-pebble", TWICE = "hal/the-twice-filed", ROWED = "hal/the-rowed-firepit", STALE = "hal/the-moved-bench",
  STORED = "hal/the-filed-as-home", NOWHOME = "hal/the-filed-as-market", PUBLISHING = "hal/the-new-cairn", LEAVING = "hal/the-withdrawn-sign";
const FOLDED = [
  { id: SWEET, by: "jetto", household: "jetto", tier: "market" },
  { id: HELD, by: "jetto", household: "jetto", tier: "market", held_by: "limen" },
  { id: TOWER, by: "sol", household: "sol", tier: "market" },
  { id: HOME, by: "jetto", household: "jetto", tier: "home" },
  { id: BERTH, by: "the-town", household: "the-town", tier: "constitution" },
  { id: NOHOUSE, by: "drifter", household: "drifter", tier: "market" },
  { id: TWICE, by: "hal", household: "hal", tier: "market" },
  { id: ROWED, by: "hal", household: "hal", tier: "market" },
  { id: STALE, by: "hal", household: "hal", tier: "market" },
  { id: STORED, by: "hal", household: "hal", tier: "market" },   // its file says `tier: home`; the fold walks it market now
  { id: NOWHOME, by: "hal", household: "hal", tier: "home" },    // its file says `tier: market`; the fold walks it home now
  { id: PUBLISHING, by: "hal", household: "hal", tier: "market" },
  { id: LEAVING, by: "hal", household: "hal", tier: "market" },
];
const FILES = {
  [P(SWEET)]: record({ by: "jetto", body: "a sweet that was just here" }),
  [P(HELD)]: record({ kind: "thing", by: "jetto", body: "held by limen" }),
  [P(TOWER)]: record({ by: "sol" }),
  [P(HOME)]: record({ by: "jetto" }),
  [P(BERTH)]: record({ by: "the-town", tier: "constitution" }),
  [P(NOHOUSE)]: record({ by: "drifter" }),
  "WORLD/marks/hal/the-twice-filed/mark.md": record({ by: "hal" }),
  "WORLD/marks/hal/a-frame/the-twice-filed/mark.md": record({ by: "hal" }),   // the same leaf filed twice by its author: ambiguous
  [P(ROWED)]: record({ by: "hal" }),
  "WORLD/marks/hal/a-yard/the-moved-bench/mark.md": record({ by: "hal" }),     // its row still names the old path
  [P(STORED)]: record({ by: "hal", tier: "home" }),
  [P(NOWHOME)]: record({ by: "hal", tier: "market" }),
  [P(PUBLISHING)]: record({ by: "hal" }),
  [P(LEAVING)]: record({ by: "hal" }),
};
const REGISTRY = { published: {
  [ROWED]: { household: "HalLogin", path: P(ROWED), class: "commons" },
  [STALE]: { household: "HalLogin", path: P(STALE), class: "commons" },
} };
const HOUSEHOLDS = { jetto: "hh:starforge", sol: "hh:the-garrison", hal: "hh:hals-house" };   // drifter is bound to no house
const ESCROW = new Map([[TOWER, 1]]);   // Sol's tower, backed (the founder's stake)

function pass(t, { escrow = ESCROW, households = HOUSEHOLDS, result = null, touched = new Set([PUBLISHING]), gone = new Set([LEAVING]) } = {}) {
  const repo = filingRepo(t, FILES);
  const mainFolded = new Map(FOLDED.map((m) => [m.id, m]));
  const unregisteredJudged = unregisteredCandidates({ registry: REGISTRY, mainFolded, escrow, gone, touched });
  const taken = unpublishPass({ repo, mainBranch: "main", registry: REGISTRY, escrow, mainFolded, result: result ?? { byId: mainFolded, viewed: new Set() }, gone, unregisteredJudged, households });
  return { unregisteredJudged, taken: taken.map(({ content, ...row }) => row), contentOf: new Map(taken.map((row) => [row.id, row.content])) };
}

test("WLD-252 · who is asked: unregistered, ✦0, not the town's, not held, not publishing or leaving this crossing — and never a registry row twice", (t) => {
  const { unregisteredJudged } = pass(t);
  assert.deepEqual(unregisteredJudged.sort(), [HOME, NOHOUSE, NOWHOME, STORED, SWEET, TWICE].sort());
  for (const [id, why] of [[HELD, "held"], [TOWER, "backed"], [BERTH, "the town's"], [ROWED, "has a row"], [STALE, "has a row"], [PUBLISHING, "publishing now"], [LEAVING, "withdrawn now"]])
    assert.ok(!unregisteredJudged.includes(id), `${id} is not asked (${why})`);
});

test("WLD-252 · what is taken: the unheld commons mark at ✦0, from its current filing, returned to its house — and the registered rows exactly as before", (t) => {
  const { taken, contentOf } = pass(t);
  assert.deepEqual(taken, [
    { household: "HalLogin", id: ROWED, path: P(ROWED), class: "commons", walked: "commons", escrow: 0 },
    { household: "HalLogin", id: STALE, path: "WORLD/marks/hal/a-yard/the-moved-bench/mark.md", class: "commons", walked: "commons", escrow: 0 },
    { household: "starforge", id: SWEET, path: P(SWEET), class: "unregistered", walked: "commons", escrow: 0 },
    { household: "hals-house", id: STORED, path: P(STORED), class: "unregistered", walked: "commons", escrow: 0 },
  ]);
  assert.match(contentOf.get(SWEET), /a sweet that was just here/, "the content a kept frame would be written back from is the file's");
  const ids = taken.map((r) => r.id);
  for (const id of [HELD, TOWER, HOME, BERTH, NOWHOME]) assert.ok(!ids.includes(id), `${id} stays`);
  assert.ok(!ids.includes(NOHOUSE), "an author the registry binds to no house: unread, nothing taken");
  assert.ok(!ids.includes(TWICE), "two filings for one id: the filing is unread, nothing taken");
  assert.ok(ids.includes(STORED) && !ids.includes(NOWHOME), "the standing walked NOW decides, not the tier the file stored");
});

test("WLD-252 · a crossing whose result could not be read, or did not walk the mark, takes no unregistered mark", (t) => {
  const unread = pass(t, { result: { byId: null, viewed: new Set() } });
  assert.deepEqual(unread.taken.filter((r) => r.class === "unregistered"), [], "no result: standing unread, nothing taken");
  const notViewed = pass(t, { result: { byId: new Map(), viewed: new Set() } });
  assert.deepEqual(notViewed.taken.filter((r) => r.class === "unregistered"), [], "a result that did not ask the mark again: unread");
  const noHouses = pass(t, { households: {} });
  assert.deepEqual(noHouses.taken.filter((r) => r.class === "unregistered"), [], "no house binding read: nothing unregistered taken");
  assert.equal(noHouses.taken.length, 2, "and the registered rows are judged as ever");
});

// ── the whole crossing ─────────────────────────────────────────────────────
function crossingRepo(t) {
  const repo = mkdtempSync(join(tmpdir(), "wld252-crossing-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (path, text) => { const full = join(repo, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, text); return path; };
  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs")) cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/households.json", JSON.stringify({ households: { hal: "hh:hals-house", limen: "hh:the-terraces" }, logins: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({ by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, extra: ["coords: relative"], body: "the frame" }));
  put("WORLD/marks/let-there-be-light/the-quay/mark.md", record({ by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 100, h: 100 }, body: "the town's quay" }));
  const stone = put("WORLD/marks/hal/the-stone/mark.md", record({ by: "hal", at: { x: 900, y: 900 }, extent: { w: 1, h: 1 }, body: "hal's stone on open ground" }));
  const kept = put("WORLD/marks/limen/the-lantern/mark.md", record({ by: "limen", at: { x: 950, y: 900 }, extent: { w: 1, h: 1 }, body: "limen's lantern, staked" }));
  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A"); git("-c", "user.name=f", "-c", "user.email=f@test.invalid", "commit", "-q", "-m", "published main");
  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  const sweep = (stakes) => { writeFileSync(stakesPath, JSON.stringify(stakes)); return settlementSweep({ repo, stakesPath }); };
  return { repo, git, stone, kept, sweep };
}

test("WLD-252 · a whole crossing: the unregistered ✦0 commons mark leaves to its house's drafts, the staked one stays, and no registry row is invented", (t) => {
  const c = crossingRepo(t);
  const out = c.sweep([{ holder: "limen", mark: "limen/the-lantern", n: 1, weight: 1 }]);
  assert.deepEqual(out.unpublished.map((r) => [r.id, r.class, r.household, r.path]), [["hal/the-stone", "unregistered", "hals-house", c.stone]]);
  assert.equal(existsSync(join(c.repo, c.stone)), false, "the file left main");
  assert.equal(existsSync(join(c.repo, c.kept)), true, "the staked lantern stands");
  assert.match(c.git("show", `draft/hals-house:${c.stone}`), /hal's stone on open ground/, "returned to its household's drafts, nothing deleted");
  const registry = JSON.parse(readFileSync(join(c.repo, "WORLD", "settlement-publications.json"), "utf8")).published ?? {};
  assert.equal(Object.prototype.hasOwnProperty.call(registry, "hal/the-stone"), false, "no row was invented for it");
});
