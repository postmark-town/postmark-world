// lane-to-sweep.test.mjs — WLD-122: ONE BINDING EVERYWHERE, end to end.
//
// Wright, 2026-11-04T17:46:27Z (settled): "The sweep's publish and withdrawal
// use the same binding as the two lane doors… Known but unbound stays drafted…
// A null from the resolver is never a pass… Genuinely unknown or unverifiable
// keeps today's handling." Done when an F2-shape resident's lane PR publishes
// and withdraws through the sweep, Keith's #316 replay runs end to end, the
// known-unbound case stays drafted with its reason, and the null-swap is red.
//
// The road, for real at every step: the registry is postmark-office's export
// as printed (REAL_EXPORT, verbatim; see tools/lane-author.test.mjs § THE REAL
// EXPORT'S SHAPES) → the first knock (lane.yml's own `run:` block) → the PR
// wall (tools/lane-wall.mjs, CLI) → the lane's merge into the sketchbook → the
// crossing (settlementSweep), which publishes AND withdraws.
//
// THE FALSIFIER (the review's scratch null-swap): let the sweep's walls treat
// an unbound sketchbook's null household as "unverifiable" again (the
// `author && branch && different` stand-down) and the KNOWN UNBOUND test goes
// red twice: another household's mark publishes from that sketchbook, and a
// published mark is withdrawn by it.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { settlementSweep } from "./settlement-sweep.mjs";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const REAL_EXPORT = {
  households: { dew: "solo:dew", dune: "solo:dune", fern: "hh:moss-house", keithling: "hh:slate-house", kogane: "hh:slate-house", moss: "hh:moss-house", wren: "solo:wren" },
  logins: {
    dew: "solo:dew", dune: "solo:dune", "inv-dew": "gh:900000401", "inv-dune": "gh:900000401", "inv-fern": "gh:900000202",
    "inv-keith": "hh:slate-house", "inv-kogane": "hh:slate-house", "inv-moss": "hh:moss-house", "inv-wren": "gh:900000301",
    "moss-house": "hh:moss-house", "slate-house": "hh:slate-house", wren: "solo:wren",
  },
  pinned_ids: { 900000101: "hh:slate-house", 900000102: "hh:slate-house", 900000201: "hh:moss-house", 900000202: "hh:moss-house", 900000301: "solo:wren" },
  town_sha: "f".repeat(40),
};
const BEFORE_RENDER = (() => { const { pinned_ids, ...rest } = REAL_EXPORT; return rest; })();

const record = ({ kind = "sited", by, at, extent = { w: 10, h: 10 }, body }) =>
  `---\nkind: ${kind}\nby: ${by}\ndate: 2026-07-28\nat: { x: ${at.x}, y: ${at.y} }\nextent: { w: ${extent.w}, h: ${extent.h} }\n---\n\n${body}\n`;
// Each household's parcel on main; a resident's record sits inside its parcel, as the lane's geometry places it.
const PARCEL = { slate: "slate-parcel", wren: "wren-parcel", moss: "moss-parcel" };
const SPOT = {
  "keith-old": ["slate", 1010], "kogane-hut": ["slate", 1050], "keith-new": ["slate", 1020], "dune-borrowed": ["slate", 1080],
  "keith-early": ["slate", 1100], "from-nowhere": ["slate", 1120], "by-stranger": ["slate", 1140],
  "wren-old": ["wren", 2010], "wren-new": ["wren", 2020], "wren-early": ["wren", 2050],
  "fern-new": ["moss", 3020], "kogane-stray": ["moss", 3050],
};
const markPath = (slug) => slug === "town-well" ? "WORLD/marks/let-there-be-light/town-well/mark.md"
  : `WORLD/marks/let-there-be-light/${PARCEL[SPOT[slug][0]]}/${slug}/mark.md`;
const spot = (slug) => ({ x: SPOT[slug][1], y: SPOT[slug][1] });
// Each body names its own record at length: two near-identical small records added and withdrawn in one
// crossing read to git as a rename, and the sweep's sketchbook rebase then meets a rename/delete conflict
// (a property of the sweep's replay, not of the binding under test here).
const porch = (by, slug, body) => record({ by, at: spot(slug), extent: { w: 4, h: 4 }, body: `${body} — ${`${slug} `.repeat(8)}`.slice(0, 140).trim() });

// What main already carries, published: each resident's old mark, a town-signed record.
const PUBLISHED = { "keith-old": "keithling", "wren-old": "wren", "kogane-hut": "kogane", "town-well": "the-town" };

// ── the first knock, as lane.yml runs it (gh and git stubbed) ────────────────
function bootstrapScript() {
  const lines = readFileSync(join(ROOT, ".github", "workflows", "lane.yml"), "utf8").split("\n");
  const at = lines.findIndex((l) => /- name: "bootstrap: first knock/.test(l));
  const runAt = lines.findIndex((l, i) => i > at && /^\s+run: \|\s*$/.test(l));
  assert.ok(at >= 0 && runAt > at, "source extraction: the bootstrap step's run block");
  const indent = (l) => l.match(/^ */)[0].length;
  const body = [];
  for (let i = runAt + 1; i < lines.length; i++) {
    if (lines[i].trim() && indent(lines[i]) <= indent(lines[runAt])) break;
    body.push(lines[i]);
  }
  const strip = Math.min(...body.filter((l) => l.trim()).map(indent));
  return body.map((l) => l.slice(strip)).join("\n");
}

function knock(t, registry, id, login) {
  const dir = mkdtempSync(join(tmpdir(), "postmark-lane-to-sweep-knock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const d of ["tools", "WORLD", "bin"]) mkdirSync(join(dir, d), { recursive: true });
  cpSync(join(HERE, "lane-author.mjs"), join(dir, "tools", "lane-author.mjs"));
  writeFileSync(join(dir, "WORLD", "households.json"), JSON.stringify(registry));
  const log = join(dir, "calls.log");
  for (const tool of ["gh", "git"]) {
    writeFileSync(join(dir, "bin", tool), `#!/bin/sh\necho "${tool} $*" >> "${log}"\n${tool === "git" ? 'case "$1 $2" in "ls-remote --exit-code") exit 2;; esac\n' : ""}exit 0\n`);
    chmodSync(join(dir, "bin", tool), 0o755);
  }
  writeFileSync(join(dir, "bootstrap.sh"), bootstrapScript());
  const res = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", join(dir, "bootstrap.sh")], {
    cwd: dir, encoding: "utf8",
    env: { PATH: `${join(dir, "bin")}:${dirname(process.execPath)}:/usr/bin:/bin`, AUTHOR_ID: String(id), AUTHOR_LOGIN: login, PR: "7" },
  });
  let calls = "";
  try { calls = readFileSync(log, "utf8"); } catch { /* none */ }
  return { code: res.status, calls };
}

// ── a world: main as published, sketchbooks as the lane merges them, the crossing ──
function world(t, registry) {
  const repo = mkdtempSync(join(tmpdir(), "postmark-lane-to-sweep-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const commit = (msg) => { git("add", "-A"); git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", msg); };
  const put = (path, text) => { mkdirSync(dirname(join(repo, path)), { recursive: true }); writeFileSync(join(repo, path), text); };
  const has = (ref, path) => { try { git("cat-file", "-e", `${ref}:${path}`); return true; } catch { return false; } };

  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs", "lane-wall.mjs", "admin-makers.mjs", "lane-author.mjs"))
    cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({ by: "the-town", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame" }).replace("kind: sited", "kind: sited\ntier: constitution"));
  for (const [by, slug, at] of [["kogane", PARCEL.slate, 1000], ["wren", PARCEL.wren, 2000], ["moss", PARCEL.moss, 3000]])
    put(`WORLD/marks/let-there-be-light/${slug}/mark.md`, record({ kind: "parcel", by, at: { x: at, y: at }, extent: { w: 200, h: 200 }, body: `${by}'s parcel` }));
  const published = {};
  for (const [slug, by] of Object.entries(PUBLISHED)) {
    put(markPath(slug), slug === "town-well" ? record({ by, at: { x: 5000, y: 5000 }, body: "the town's well" }) : porch(by, slug, `${by}'s ${slug}`));
    published[`${by}/${slug}`] = { household: by, path: markPath(slug), class: "home" };
  }
  put("WORLD/settlement-publications.json", JSON.stringify({ version: 1, published }, null, 2) + "\n");
  put("WORLD/households.json", JSON.stringify(registry, null, 2) + "\n");
  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  commit("published main");

  /** A PR into draft/<sketchbook>: `edit` changes the tree; the wall judges it; merged only if it passes (or `force`). */
  const pr = (sketchbook, { id, login, edit, force = false }) => {
    const branch = `draft/${sketchbook}`;
    try { git("rev-parse", "--verify", "-q", branch); } catch { git("branch", branch, "main"); }
    git("switch", "-q", "-C", "pr-head", branch);
    edit({ put, rm: (path) => rmSync(join(repo, dirname(path)), { recursive: true, force: true }) });
    commit(`a PR into ${branch}`);
    let verdict;
    try {
      verdict = { ...JSON.parse(execFileSync(process.execPath, [join(repo, "tools", "lane-wall.mjs"), "--repo", repo, "--base", branch, "--head", "pr-head",
        "--author-id", String(id), "--author-login", login, "--json", "--base-branch", branch], { encoding: "utf8" }).trim()), code: 0 };
    } catch (e) { verdict = { ...JSON.parse(String(e.stdout).trim()), code: e.status }; }
    if (verdict.ok || force) git("branch", "-f", branch, "pr-head");
    git("switch", "-q", "main");
    git("branch", "-D", "pr-head");
    return verdict;
  };

  const sweep = (ids, opts = {}) => {
    const remote = mkdtempSync(join(tmpdir(), "postmark-lane-to-sweep-remote-"));
    t.after(() => rmSync(remote, { recursive: true, force: true }));
    execFileSync("git", ["init", "--bare", "-q", remote]);
    try { git("remote", "remove", "origin"); } catch { /* first sweep */ }
    git("remote", "add", "origin", remote);
    git("push", "-q", "origin", "--all");
    const stakesPath = `${repo}-stakes.json`;
    t.after(() => rmSync(stakesPath, { force: true }));
    writeFileSync(stakesPath, JSON.stringify(ids.map((mark, i) => ({ holder: `s${i}`, mark, n: 5, weight: 10 }))));
    return settlementSweep({ repo, stakesPath, ...opts });
  };
  return { repo, git, has, pr, sweep };
}

const drafted = (report, id) => report.left_drafted.find((row) => row.id === id);

test("THE #316 REPLAY, end to end: the house's second account knocks, passes the wall, and the crossing publishes its mark and withdraws its old one", (t) => {
  const k = knock(t, REAL_EXPORT, 900000102, "inv-keith");
  assert.equal(k.code, 0);
  assert.match(k.calls, /gh pr edit 7 --base draft\/inv-keith/);
  const w = world(t, REAL_EXPORT);
  const add = w.pr("inv-keith", { id: 900000102, login: "inv-keith", edit: ({ put }) => {
    put(markPath("keith-new"), porch("keithling", "keith-new", "keith's new mark"));
  } });
  assert.equal(add.ok, true, JSON.stringify(add));
  const withdraw = w.pr("inv-keith", { id: 900000102, login: "inv-keith", edit: ({ rm }) => rm(markPath("keith-old")) });
  assert.equal(withdraw.ok, true, JSON.stringify(withdraw));
  const report = w.sweep(["keithling/keith-new"]);
  assert.ok(report.published.some((r) => r.id === "keithling/keith-new"), JSON.stringify(report.left_drafted));
  assert.ok(report.withdrawn.some((r) => r.id === "keithling/keith-old"), JSON.stringify(report.left_drafted));
  assert.equal(w.has("main", markPath("keith-new")), true);
  assert.equal(w.has("main", markPath("keith-old")), false);
});

test("F2, end to end: a solo resident and a house resident on an unlisted account publish and withdraw from their own login's sketchbook; another house's mark there stays drafted", (t) => {
  for (const [id, login] of [[900000301, "inv-wren"], [900000202, "inv-fern"]]) assert.equal(knock(t, REAL_EXPORT, id, login).code, 0, login);
  const w = world(t, REAL_EXPORT);
  assert.equal(w.pr("inv-wren", { id: 900000301, login: "inv-wren", edit: ({ put }) => {
    put(markPath("wren-new"), porch("wren", "wren-new", "wren's new mark"));
  } }).ok, true);
  assert.equal(w.pr("inv-wren", { id: 900000301, login: "inv-wren", edit: ({ rm }) => rm(markPath("wren-old")) }).ok, true);
  assert.equal(w.pr("inv-fern", { id: 900000202, login: "inv-fern", edit: ({ put }) => {
    put(markPath("fern-new"), porch("fern", "fern-new", "fern's new mark"));
  } }).ok, true);
  // another household's pen in fern's account's sketchbook: the wall refuses it, and were it merged anyway, the crossing does too
  const foreign = w.pr("inv-fern", { id: 900000101, login: "inv-kogane", force: true, edit: ({ put }) => {
    put(markPath("kogane-stray"), porch("kogane", "kogane-stray", "slate-house's pen"));
  } });
  assert.equal(foreign.ok, false);
  assert.ok(foreign.violations.some((x) => /this sketchbook is not yours/.test(x.defect)));
  const report = w.sweep(["wren/wren-new", "fern/fern-new", "kogane/kogane-stray"]);
  for (const id of ["wren/wren-new", "fern/fern-new"]) assert.ok(report.published.some((r) => r.id === id), `${id} publishes: ${JSON.stringify(report.left_drafted)}`);
  assert.ok(report.withdrawn.some((r) => r.id === "wren/wren-old"), JSON.stringify(report.left_drafted));
  assert.match(drafted(report, "kogane/kogane-stray")?.reason ?? "", /authorship: "kogane" is hh:slate-house's resident; this sketchbook is hh:moss-house's/);
  assert.equal(w.has("main", markPath("kogane-stray")), false);
});

test("KNOWN BUT UNBOUND stays drafted (the null-swap falsifier): an account the export left unbound publishes nothing and withdraws nothing, with its reason, and main is unchanged", (t) => {
  assert.equal(knock(t, REAL_EXPORT, 900000401, "inv-dune").code, 1, "the door refuses the unbound account");
  const w = world(t, REAL_EXPORT);
  w.pr("inv-dune", { id: 900000401, login: "inv-dune", force: true, edit: ({ put, rm }) => {
    put(markPath("dune-borrowed"), porch("keithling", "dune-borrowed", "another household's name"));
    rm(markPath("kogane-hut"));
  } });
  const report = w.sweep(["keithling/dune-borrowed"]);
  for (const id of ["keithling/dune-borrowed", "kogane/kogane-hut"])
    assert.match(drafted(report, id)?.reason ?? "", /known to the registry but pinned to no household/, `${id}: ${JSON.stringify(report.left_drafted)}`);
  assert.equal(report.published.some((r) => r.id === "keithling/dune-borrowed"), false, "no publish through an unbound sketchbook");
  assert.equal(report.withdrawn.some((r) => r.id === "kogane/kogane-hut"), false, "no withdrawal through an unbound sketchbook");
  assert.equal(w.has("main", markPath("kogane-hut")), true);
  assert.equal(w.has("main", markPath("dune-borrowed")), false);
  assert.equal(w.git("ls-tree", "-r", "--name-only", "main", "WORLD/marks").includes("dune-borrowed"), false);
});

test("BEFORE RENDER (no pinned_ids on main): a gh: sketchbook is known but unbound and stays drafted, own marks included; an hh: sketchbook still binds", (t) => {
  assert.equal(knock(t, BEFORE_RENDER, 900000301, "inv-wren").code, 1, "the door refuses everyone before render");
  const w = world(t, BEFORE_RENDER);
  w.pr("inv-wren", { id: 900000301, login: "inv-wren", force: true, edit: ({ put, rm }) => {
    put(markPath("wren-early"), porch("wren", "wren-early", "wren, before render"));
    rm(markPath("wren-old"));
  } });
  w.pr("inv-keith", { id: 900000102, login: "inv-keith", force: true, edit: ({ put }) => {
    put(markPath("keith-early"), porch("keithling", "keith-early", "keith, before render"));
  } });
  const report = w.sweep(["wren/wren-early", "keithling/keith-early"]);
  for (const id of ["wren/wren-early", "wren/wren-old"])
    assert.match(drafted(report, id)?.reason ?? "", /pinned to no household/, `${id}: ${JSON.stringify(report.left_drafted)}`);
  assert.equal(w.has("main", markPath("wren-old")), true, "nothing is withdrawn before render");
  assert.ok(report.published.some((r) => r.id === "keithling/keith-early"), "an hh: sketchbook binds by its house key, render or not");
});

test("PRESERVED: an unknown sketchbook and an unknown author keep today's handling; the town wall and the freshness guard still refuse", (t) => {
  const w = world(t, REAL_EXPORT);
  w.pr("nobody-knows", { id: 900000102, login: "nobody-knows", force: true, edit: ({ put }) => {
    put(markPath("from-nowhere"), porch("keithling", "from-nowhere", "a sketchbook the registry does not name"));
  } });
  w.pr("inv-keith", { id: 900000102, login: "inv-keith", force: true, edit: ({ put, rm }) => {
    put(markPath("by-stranger"), porch("carol", "by-stranger", "an unregistered hand"));
    rm(markPath("town-well"));
  } });
  const report = w.sweep(["keithling/from-nowhere", "carol/by-stranger"]);
  assert.ok(report.published.some((r) => r.id === "keithling/from-nowhere"), "a sketchbook the registry cannot name is left alone (status quo)");
  assert.ok(report.published.some((r) => r.id === "carol/by-stranger"), "an author the registry cannot name is left alone (status quo)");
  assert.match(drafted(report, "the-town/town-well")?.reason ?? "", /the town wall/);
  assert.equal(w.has("main", markPath("town-well")), true);
  // freshness: a VERIFIED claim over a registry the export never wrote (no town_sha) still refuses the crossing
  const { town_sha, ...unstamped } = REAL_EXPORT;
  const u = world(t, unstamped);
  assert.throws(() => u.sweep([], { registryVerification: { verifiedAt: "a".repeat(40) } }), /carries NO town_sha/);
  const s = world(t, REAL_EXPORT);
  assert.doesNotThrow(() => s.sweep([], { registryVerification: { verifiedAt: "a".repeat(40) } }), "and a stamped one proceeds");
});
