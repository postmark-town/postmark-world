// lane-retired.test.mjs — WLD-161: the git PR write lane stays retired.
//
// LAW (WLD-161, Darko): "Retire it". Wright's scope: "The office is the only
// write path. One world PR archives `.github/workflows/lane.yml` and
// `tools/lane-wall.mjs` to `_archived/`, and WRITES, the world README and
// blueprints MARKS/INDEX say so."
//
// What keeps it retired, each red on its own:
//   1. lane.yml is not in the active workflow directory, and no active workflow
//      carries the lane's machinery under another name.
//   2. tools/lane-wall.mjs is not at its live path. This one is load-bearing past
//      main: every draft/* sketchbook branch still carries its own lane.yml, and
//      pull_request_target runs the BASE branch's copy. Each copy checks out
//      `main` and runs `node tools/lane-wall.mjs` from there before its
//      auto-merge, so with no wall on main the wall step exits non-zero and the
//      merge step (no always()) never runs. Restore the wall and those copies
//      can merge again.
//   3. Both artifacts stay inspectable under _archived/, outside discovery.
//   4. The current writing docs name the office as the only write path and
//      teach none of the retired lane's steps.
//
// THE FLIPS: copy _archived/.github/workflows/lane.yml back into
// .github/workflows/ (1 reds); copy _archived/tools/lane-wall.mjs back into
// tools/ (2 reds); put origin/main's pre-WLD-161 WRITES.md back (4 reds).

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");
const ARCHIVED_LANE = join(ROOT, "_archived", ".github", "workflows", "lane.yml");
const ARCHIVED_WALL = join(ROOT, "_archived", "tools", "lane-wall.mjs");

// Assembled, so this file is never its own hit.
const LANE_SIGNATURES = [
  ["the wall", new RegExp(["lane", "wall"].join("-"))],
  ["the auto-merge", new RegExp(["gh pr", "merge"].join(" "))],
  ["the retarget", new RegExp(["gh pr", "edit"].join(" ") + "[^\\n]*--base")],
  ["the bootstrap push", new RegExp(["refs/heads/", "\\$\\{BRANCH\\}"].join(""))],
];
const laneMachinery = (text) => LANE_SIGNATURES.filter(([, re]) => re.test(text)).map(([name]) => name);

function workflowFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return workflowFiles(full);
    return /\.ya?ml$/i.test(name) ? [full] : [];
  });
}

test("[pin] the retired lane.yml is not in the active workflow directory", () => {
  assert.equal(existsSync(join(WORKFLOWS, "lane.yml")), false,
    'LAW (WLD-161): "Retire it" — .github/workflows/lane.yml is back, so a PR into main can bootstrap and retarget again');
});

test("[pin] no active workflow carries the lane's machinery under another name", () => {
  const active = workflowFiles(WORKFLOWS);
  assert.ok(active.length >= 1, "control: the active workflows were found");
  const carriers = active
    .map((f) => [relative(ROOT, f), laneMachinery(readFileSync(f, "utf8"))])
    .filter(([, hits]) => hits.length);
  assert.deepEqual(carriers, [], 'LAW (WLD-161): "The office is the only write path" — an active workflow carries the retired lane');
});

test("[pin] control: the signatures catch the archived lane, all four", () => {
  assert.deepEqual(laneMachinery(readFileSync(ARCHIVED_LANE, "utf8")), LANE_SIGNATURES.map(([name]) => name));
});

test("the wall is not at its live path, so a sketchbook branch's leftover lane.yml fails closed", () => {
  assert.equal(existsSync(join(ROOT, "tools", "lane-wall.mjs")), false,
    "tools/lane-wall.mjs is back on main: every draft/* branch's own lane.yml runs main's wall before its auto-merge, so they can merge again");
  // What a leftover copy's wall step runs, from its `main` checkout: node exits non-zero before judging anything.
  const r = spawnSync(process.execPath, ["tools/lane-wall.mjs", "--author-id", "1", "--author-login", "x", "--base", "origin/main", "--head", "HEAD"],
    { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(r.status, 0, "the wall step must exit non-zero");
  assert.match(r.stderr, /Cannot find module|ERR_MODULE_NOT_FOUND/, "and for want of the wall, not for some other reason");
});

test("[pin] a leftover lane.yml reads the wall from main and merges only after it (the archived copy as the measured shape)", () => {
  const lines = readFileSync(ARCHIVED_LANE, "utf8").split("\n");
  const checkout = lines.findIndex((l) => /^\s+ref: main\s*$/.test(l));
  const wall = lines.findIndex((l) => /^\s+node tools\/lane-wall\.mjs/.test(l));
  const mergeStep = lines.findIndex((l) => /- name: green merges on its own/.test(l));
  assert.ok(checkout >= 0 && wall > checkout, "the tools come from the main checkout, and the wall runs from it");
  assert.ok(mergeStep > wall, "the merge step comes after the wall step");
  const mergeIf = lines.slice(mergeStep, mergeStep + 3).join("\n");
  assert.doesNotMatch(mergeIf, /always\(\)|failure\(\)|continue-on-error/, "the merge step never runs past a failed wall");
});

test("[pin] the retired pieces stay inspectable under _archived/, outside workflow discovery", () => {
  for (const f of [ARCHIVED_LANE, ARCHIVED_WALL]) assert.ok(existsSync(f), `${relative(ROOT, f)} is kept for reading`);
  assert.ok(relative(WORKFLOWS, ARCHIVED_LANE).startsWith(".."), "the archive is not under .github/workflows/");
});

// The retired lane's teaching, as WRITES.md taught it until WLD-161. Assembled.
const TEACHING = [
  ["two doors", new RegExp(["two", "doors"].join(" "), "i")],
  ["this repo, by pull request", new RegExp(["This repo,", "by pull request"].join(" "), "i")],
  ["open a PR against a sketchbook", new RegExp(["open (a|the)", "PR against"].join(" "), "i")],
  ["green merges on its own", new RegExp(["Green merges", "on its own"].join(" "), "i")],
  ["the gate makes your sketchbook", new RegExp(["the gate creates", "your sketchbook"].join(" "), "i")],
  ["pre-flight with the live wall", new RegExp(["node tools", "lane-wall"].join("/"))],
];
const teaches = (text) => TEACHING.filter(([, re]) => re.test(text)).map(([name]) => name);
const CURRENT_DOCS = ["WRITES.md", "README.md", "READS.md", "WRITE-REGISTRY.md", "WORLD/FURNISHING.md", "WORLD/TEMPLATE-mark.md"];

test("[pin] control: the teaching detector catches each step of the retired lane's own words", () => {
  const old = [
    "The World took writes through **two doors, one law**:",
    "- **This repo, by pull request** — the lane this file teaches.",
    "5. **Open a PR against `draft/<your-github-login>`** — your household's",
    "6. **Green merges on its own.** No human gate on your own sketchbook — the law",
    "`main`: the gate creates your sketchbook and retargets the PR for you.",
    "   node tools/lane-wall.mjs --author-id <your-gh-id> --author-login <you> --base origin/main --head HEAD",
  ].join("\n");
  assert.deepEqual(teaches(old), TEACHING.map(([name]) => name));
});

test("[pin] the current writing docs teach none of the retired lane's steps", () => {
  const found = CURRENT_DOCS.map((rel) => [rel, teaches(readFileSync(join(ROOT, rel), "utf8"))]).filter(([, hits]) => hits.length);
  assert.deepEqual(found, [], 'LAW (WLD-161): "The office is the only write path" — a current doc still teaches the retired lane');
});

test("[pin] WRITES.md and the README name the office as the only write path, and the archive as not to be run", () => {
  const writes = readFileSync(join(ROOT, "WRITES.md"), "utf8");
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.match(writes, /The office is the only write path/, 'LAW (WLD-161): "The office is the only write path"');
  assert.match(readme, /the\s+office is the only write path/i, 'LAW (WLD-161): "The office is the only write path"');
  for (const doc of [writes, readme]) {
    assert.match(doc, /_archived\/\.github\/workflows\/lane\.yml/);
    assert.match(doc, /_archived\/tools\/lane-wall\.mjs/);
  }
  assert.match(writes, /must never be run/);
});
