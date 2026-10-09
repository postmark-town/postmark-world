// rehearsal-baseline.test.mjs — the sketchbooks main itself refuses are set
// aside, and nothing else is (POS-371). The loop is driven with a stand-in
// sweep; the refs and the charging run against a real scratch repository.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  chargedWith, cloneAtBase, parseRefusal, setAside, setAsideLoop, sketchbooks,
} from "./rehearsal-baseline.mjs";

const refusalLine = (fields) => `SETTLEMENT-SWEEP-REFUSAL ${JSON.stringify(fields)}`;

test("the sweep's refusal line is read, the last one, and a missing one is null", () => {
  const stderr = ["settlement sweep refused: x", refusalLine({ cause: "first", phase: "lint" }), refusalLine({ cause: "x", phase: "rebase", branch: "draft/a" })].join("\n");
  assert.deepEqual(parseRefusal(stderr), { cause: "x", phase: "rebase", branch: "draft/a" });
  assert.equal(parseRefusal("settlement sweep refused: no sentinel"), null);
});

// A stand-in for main's sweep: it refuses on the first listed sketchbook still carried.
const mainRefusing = (refusers) => {
  const seen = [];
  const run = (aside) => {
    seen.push([...aside]);
    const next = refusers.find((b) => !aside.includes(b));
    return next ? { ok: false, refusal: { cause: `${next} did not rebase cleanly`, phase: "rebase", branch: next } } : { ok: true };
  };
  return { run, seen };
};
const byBranch = (refusal) => (refusal?.branch ? [refusal.branch] : []);

test("each sketchbook main refuses on is set aside, then main is asked again until it sweeps", () => {
  const { run, seen } = mainRefusing(["draft/angelus-novus", "draft/b"]);
  const r = setAsideLoop({ run, charge: byBranch });
  assert.equal(r.ok, true);
  assert.deepEqual(r.aside.map((row) => row.branch), ["draft/angelus-novus", "draft/b"]);
  assert.equal(r.runs, 3);
  assert.deepEqual(seen, [[], ["draft/angelus-novus"], ["draft/angelus-novus", "draft/b"]]);
  assert.equal(r.aside[0].phase, "rebase");
});

test("main sweeping clean sets nothing aside", () => {
  const r = setAsideLoop({ run: () => ({ ok: true }), charge: byBranch });
  assert.deepEqual(r, { ok: true, aside: [], runs: 1 });
});

test("FALSIFIER: a refusal no sketchbook can be charged with is main's own, and is never set aside", () => {
  const r = setAsideLoop({
    run: () => ({ ok: false, refusal: { cause: "the crossing does not lint clean: 1 error(s)", phase: "lint", errors: [] } }),
    charge: () => [],
  });
  assert.equal(r.ok, false);
  assert.equal(r.main_refuses, true);
  assert.match(r.cause, /does not lint clean/);
  assert.deepEqual(r.aside, []);
});

test("FALSIFIER: a sketchbook already set aside and charged again is main's own refusal, not a loop", () => {
  let calls = 0;
  const r = setAsideLoop({
    run: () => { calls += 1; return { ok: false, refusal: { cause: "x", phase: "rebase", branch: "draft/a" } }; },
    charge: byBranch,
  });
  assert.equal(r.ok, false);
  assert.equal(r.main_refuses, true);
  assert.equal(calls, 2);
});

test("FALSIFIER: more sketchbooks refusing than the cap is a red that wants a person", () => {
  const { run } = mainRefusing(["draft/a", "draft/b", "draft/c"]);
  const r = setAsideLoop({ run, charge: byBranch, max: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.too_many, true);
  assert.equal(r.aside.length, 3);
});

// ── a real repository: main plus three sketchbooks, as the job's checkout holds them ──
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "postmark-rehearsal-baseline-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origin");
  const repo = join(root, "checkout");
  mkdirSync(origin);
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  const put = (cwd, path, text) => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), text); };
  git(origin, "init", "-q", "-b", "main");
  put(origin, "WORLD/marks/neth/warm-stone/mark.md", "---\nby: neth\n---\nthe stone\n");
  put(origin, "WORLD/marks/scree/the-cairn/mark.md", "---\nby: scree\n---\nthe cairn\n");
  git(origin, "add", "-A"); git(origin, "commit", "-q", "-m", "main");
  const base = git(origin, "rev-parse", "HEAD").trim();
  const draft = (name, path, text) => {
    git(origin, "switch", "-q", "-c", `draft/${name}`, base);
    put(origin, path, text);
    git(origin, "add", "-A"); git(origin, "commit", "-q", "-m", `draft ${name}`);
  };
  draft("dup", "WORLD/marks/let-there-be-light/warm-stone/mark.md", "---\nby: neth\n---\na second stone\n");
  draft("amends", "WORLD/marks/scree/the-cairn/mark.md", "---\nby: scree\n---\nthe cairn, amended\n");
  draft("elsewhere", "WORLD/marks/kin/a-pot/mark.md", "---\nby: kin\n---\na pot\n");
  git(origin, "switch", "-q", "main");
  // The job's checkout: the drafts as remote-tracking refs, exactly as its fetch step leaves them.
  execFileSync("git", ["clone", "-q", origin, repo], { stdio: "ignore" });
  git(repo, "fetch", "-q", "--no-tags", "origin", "+refs/heads/draft/*:refs/remotes/origin/draft/*");
  return { repo, base, root, git };
}

test("the clone at the base carries every sketchbook but the set-aside, and stands at the base", (t) => {
  const { repo, base, root, git } = fixture(t);
  const clone = cloneAtBase(repo, join(root, "scratch", "main-at-base"), base, ["draft/amends"]);
  assert.deepEqual(sketchbooks(clone), ["draft/dup", "draft/elsewhere"]);
  assert.equal(git(clone, "rev-parse", "main").trim(), base);
  assert.deepEqual(sketchbooks(repo), ["draft/amends", "draft/dup", "draft/elsewhere"], "the checkout is untouched by the clone");
});

test("a rebase refusal is charged to the sketchbook it names", (t) => {
  const { repo, base } = fixture(t);
  assert.deepEqual(chargedWith({ phase: "rebase", branch: "draft/amends", cause: "x" }, repo, base), ["draft/amends"]);
});

test("a lint error is charged to the sketchbook whose own diff touches its mark, and a duplicate id to the one that added that leaf", (t) => {
  const { repo, base } = fixture(t);
  assert.deepEqual(chargedWith({ phase: "lint", errors: [{ file: "WORLD/marks/scree/the-cairn", msg: "bad" }] }, repo, base), ["draft/amends"]);
  // The duplicate's error can land on main's own copy; the sketchbook that added the leaf is still the one charged.
  assert.deepEqual(chargedWith({ phase: "lint", errors: [{ file: "WORLD/marks/neth/warm-stone", msg: 'duplicate id "neth/warm-stone" — a leaf slug must be unique per author (by)' }] }, repo, base), ["draft/dup"]);
});

test("FALSIFIER: a lint error no sketchbook touched is charged to none of them", (t) => {
  const { repo, base } = fixture(t);
  assert.deepEqual(chargedWith({ phase: "lint", errors: [{ file: "WORLD/marks/zz/nobody", msg: "bad" }] }, repo, base), []);
  assert.deepEqual(chargedWith({ phase: "clean-check", cause: "dirty" }, repo, base), []);
  assert.deepEqual(chargedWith(null, repo, base), []);
});

test("setting aside deletes only the named sketchbooks' local refs", (t) => {
  const { repo } = fixture(t);
  setAside(repo, [{ branch: "draft/amends" }]);
  assert.deepEqual(sketchbooks(repo), ["draft/dup", "draft/elsewhere"]);
});
