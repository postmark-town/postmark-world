// lane-author.test.mjs — WLD-122: the PR lane binds its author by PINNED
// NUMERIC ID ("Bind pinned ids", Darko 2026-10-27), and the first knock runs
// that binding for real.
//
// Two halves. The helper itself (bindAuthor, sketchbookRefusal), pure. Then
// THE ACTUAL WORKFLOW STEP: the bootstrap's `run:` block is read out of
// .github/workflows/lane.yml as it stands and executed in a temporary checkout
// (this repo's tools/lane-author.mjs, a synthetic WORLD/households.json) with
// `gh` and `git` stubbed to record what they are asked. So the test exercises
// the binding CI invokes, not a function CI never calls. The authorship wall's
// half is tools/lane-wall.test.mjs.
//
// THE FLIPS: put the legacy `gh:<id>`/`login:<login>` comparison back in the
// workflow and the login-impersonation cases go red; make bindAuthor fall back
// to `logins` and the alias cases go red.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { bindAuthor, sketchbookRefusal } from "./lane-author.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const REGISTRY = {
  households: { alice: "hh:house-a", "alice-too": "hh:house-a", mallory: "hh:house-m", wren: "solo:wren", lena: "login:lena" },
  logins: { "house-a": "hh:house-a", "house-m": "hh:house-m", wren: "solo:wren", lena: "login:lena", alicehub: "hh:house-a" },
  pinned_ids: { 1: "hh:house-a", 3: "hh:house-m", 5: "solo:wren" },
};

// ── the helper ───────────────────────────────────────────────────────────────

test("bindAuthor: a pinned numeric id is its one household; nothing else is", () => {
  assert.deepEqual(bindAuthor(REGISTRY, 1), { house: "hh:house-a", reason: null });
  assert.deepEqual(bindAuthor(REGISTRY, "5"), { house: "solo:wren", reason: null });
  for (const id of [9, "house-a", "wren", "lena", "alicehub", "", null, undefined, "1 ", "-1", "0", "01", "1.0", "1e3"]) {
    const r = bindAuthor(REGISTRY, id);
    if (id === "1 ") { assert.equal(r.house, "hh:house-a", "surrounding space is trimmed"); continue; }
    assert.equal(r.house, null, `id ${JSON.stringify(id)} binds nothing`);
    assert.ok(r.reason);
  }
});

test("bindAuthor fails closed on a registry that cannot answer", () => {
  assert.match(bindAuthor(null, 1).reason, /could not be read/);
  assert.match(bindAuthor({ households: REGISTRY.households, logins: REGISTRY.logins }, 1).reason, /carries no pinned_ids/);
  assert.match(bindAuthor({ pinned_ids: [] }, 1).reason, /carries no pinned_ids/);
  assert.match(bindAuthor({ pinned_ids: { 1: null } }, 1).reason, /not a household key/);
  assert.match(bindAuthor({ pinned_ids: { 1: "" } }, 1).reason, /not a household key/);
  assert.match(bindAuthor({ pinned_ids: { 1: { key: "hh:x" } } }, 1).reason, /not a household key/);
  assert.match(bindAuthor({ pinned_ids: { toString: "hh:x" } }, "toString").reason, /not a numeric account id/);
});

test("sketchbookRefusal: a login names a sketchbook the author may knock on only if it is theirs or nobody's", () => {
  assert.equal(sketchbookRefusal(REGISTRY, "house-a", "hh:house-a"), null, "own house alias");
  assert.equal(sketchbookRefusal(REGISTRY, "AliceHub", "hh:house-a"), null, "own login, any case");
  assert.equal(sketchbookRefusal(REGISTRY, "alice-new-name", "hh:house-a"), null, "a name nobody holds yet");
  assert.match(sketchbookRefusal(REGISTRY, "house-a", "hh:house-m"), /bound to another household/);
  assert.match(sketchbookRefusal(REGISTRY, "wren", "hh:house-m"), /bound to another household/, "a solo alias is wren's");
});

// ── THE ACTUAL WORKFLOW STEP ─────────────────────────────────────────────────

/** The bootstrap step's `run:` script, as lane.yml has it. */
function bootstrapScript() {
  const lines = readFileSync(join(ROOT, ".github", "workflows", "lane.yml"), "utf8").split("\n");
  const at = lines.findIndex((l) => /- name: "bootstrap: first knock/.test(l));
  assert.ok(at >= 0, "source extraction: the bootstrap step");
  const runAt = lines.findIndex((l, i) => i > at && /^\s+run: \|\s*$/.test(l));
  assert.ok(runAt > at, "source extraction: its run block");
  const indent = (l) => l.match(/^ */)[0].length;
  const own = indent(lines[runAt]);
  const body = [];
  for (let i = runAt + 1; i < lines.length; i++) {
    if (lines[i].trim() && indent(lines[i]) <= own) break;
    body.push(lines[i]);
  }
  const strip = Math.min(...body.filter((l) => l.trim()).map(indent));
  return body.map((l) => l.slice(strip)).join("\n");
}

function knock(t, { id, login, registry = REGISTRY, branchExists = false }) {
  const dir = mkdtempSync(join(tmpdir(), "postmark-first-knock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "tools"), { recursive: true });
  mkdirSync(join(dir, "WORLD"), { recursive: true });
  mkdirSync(join(dir, "bin"), { recursive: true });
  cpSync(join(HERE, "lane-author.mjs"), join(dir, "tools", "lane-author.mjs"));
  if (registry !== null) writeFileSync(join(dir, "WORLD", "households.json"), JSON.stringify(registry));   // null: no file at all
  const log = join(dir, "calls.log");
  for (const tool of ["gh", "git"]) {
    const exitFor = tool === "git" ? `case "$1 $2" in "ls-remote --exit-code") exit ${branchExists ? 0 : 2};; esac\n` : "";
    writeFileSync(join(dir, "bin", tool), `#!/bin/sh\necho "${tool} $*" >> "${log}"\n${exitFor}exit 0\n`);
    chmodSync(join(dir, "bin", tool), 0o755);
  }
  const script = join(dir, "bootstrap.sh");
  writeFileSync(script, bootstrapScript());
  const res = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", script], {
    cwd: dir, encoding: "utf8",
    env: { PATH: `${join(dir, "bin")}:${dirname(process.execPath)}:/usr/bin:/bin`, AUTHOR_ID: String(id), AUTHOR_LOGIN: login, PR: "7" },
  });
  return { code: res.status, out: res.stdout + res.stderr, calls: existsSync(log) ? readFileSync(log, "utf8") : "" };
}

test("THE FIRST KNOCK, as lane.yml runs it: the step calls the shared helper — the legacy inline comparison is gone", () => {
  const script = bootstrapScript();
  assert.match(script, /node tools\/lane-author\.mjs --registry WORLD\/households\.json --author-id "\$AUTHOR_ID"/);
  assert.doesNotMatch(script, /gh:\$\{|login:\$\{|Object\.values\(r\.households/, "no gh:/login: key comparison left in the step");
});

test("THE FIRST KNOCK: a pinned author's sketchbook is made under their login and the PR retargeted; a renamed login still binds", (t) => {
  const own = knock(t, { id: 1, login: "alicehub" });
  assert.equal(own.code, 0, own.out);
  assert.match(own.calls, /git push origin origin\/main:refs\/heads\/draft\/alicehub/);
  assert.match(own.calls, /gh pr edit 7 --base draft\/alicehub/);
  const renamed = knock(t, { id: 1, login: "alice-new-name" });
  assert.equal(renamed.code, 0, renamed.out);
  assert.match(renamed.calls, /gh pr edit 7 --base draft\/alice-new-name/, "the login only names the sketchbook");
  const existing = knock(t, { id: 1, login: "house-a", branchExists: true });
  assert.equal(existing.code, 0, existing.out);
  assert.doesNotMatch(existing.calls, /git push/, "an existing sketchbook is only retargeted");
  assert.match(existing.calls, /gh pr edit 7 --base draft\/house-a/);
});

test("THE FIRST KNOCK refuses impersonation: an unpinned account named like a declared house, a solo alias or a `login:` house makes no ground", (t) => {
  for (const login of ["house-a", "wren", "lena", "alicehub"]) {
    const r = knock(t, { id: 9, login });
    assert.equal(r.code, 1, `${login}: ${r.out}`);
    assert.match(r.calls, /gh pr comment 7 --body refused: your GitHub account is not pinned/);
    assert.doesNotMatch(r.calls, /git push|gh pr edit/, `${login}: no sketchbook made, nothing retargeted`);
  }
});

test("THE FIRST KNOCK refuses a pinned author whose login names ANOTHER household's sketchbook", (t) => {
  const r = knock(t, { id: 3, login: "house-a" });
  assert.equal(r.code, 1, r.out);
  assert.match(r.calls, /bound to another household/);
  assert.doesNotMatch(r.calls, /git push|gh pr edit/);
});

test("THE FIRST KNOCK fails closed on a registry without pinned_ids — even for a real resident — and on a missing registry", (t) => {
  const legacy = knock(t, { id: 1, login: "alicehub", registry: { households: REGISTRY.households, logins: REGISTRY.logins } });
  assert.equal(legacy.code, 1, legacy.out);
  assert.match(legacy.calls, /carries no pinned_ids/);
  assert.doesNotMatch(legacy.calls, /git push|gh pr edit/);
  const none = knock(t, { id: 1, login: "alicehub", registry: null });
  assert.equal(none.code, 1, none.out);
  assert.match(none.calls, /could not be read/);
});
