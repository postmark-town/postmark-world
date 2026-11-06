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

import { bindAuthor, sketchbookHouse, sketchbookRefusal } from "./lane-author.mjs";

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

test("sketchbookRefusal names the TRUE cause: another household's sketchbook is 'bound to another household'; a known but unbound one is 'not pinned to any one household'", () => {
  const other = sketchbookRefusal(REAL_EXPORT, "inv-fern", "hh:slate-house");
  assert.match(other, /draft\/inv-fern is bound to another household/);
  const unbound = sketchbookRefusal(REAL_EXPORT, "inv-dune", "hh:slate-house");
  assert.match(unbound, /draft\/inv-dune is known to the registry but is not pinned to any one household/);
  assert.doesNotMatch(unbound, /another household/, "no household owns it, so none is named");
  // the decision is unchanged: both still refuse, the author's own and a nobody's still do not
  assert.equal(sketchbookRefusal(REAL_EXPORT, "inv-fern", "hh:moss-house"), null, "the author's own account sketchbook");
  assert.equal(sketchbookRefusal(REAL_EXPORT, "nobody-yet", "hh:slate-house"), null, "an unknown name is nobody's");
  assert.ok(sketchbookRefusal({ logins: REAL_EXPORT.logins }, "inv-wren", "solo:wren"), "no pinned_ids: an account sketchbook binds nobody, so it is refused, as before");
  assert.match(sketchbookRefusal({ logins: REAL_EXPORT.logins }, "inv-wren", "solo:wren"), /not pinned to any one household/);
});

// ── THE ACTUAL WORKFLOW STEP ─────────────────────────────────────────────────

/** The bootstrap step's `run:` script, as lane.yml has it. The lane is retired
 *  (WLD-161): lane.yml sits at _archived/.github/workflows/, bytes unchanged,
 *  outside workflow discovery, and these cases still read it there. */
function bootstrapScript() {
  const lines = readFileSync(join(ROOT, "_archived", ".github", "workflows", "lane.yml"), "utf8").split("\n");
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
    // genuinely unpinned stays refused, with the lane's neutral outer prefix and the helper's own cause inside it
    assert.match(r.calls, /gh pr comment 7 --body refused: the PR lane could not admit this change \(lane-author: GitHub account 9 is not pinned to any household\)/, login);
    assert.doesNotMatch(r.calls, /your GitHub account is not pinned to a household the lane can bind/, `${login}: the old outer prefix is gone`);
    assert.doesNotMatch(r.calls, /git push|gh pr edit/, `${login}: no sketchbook made, nothing retargeted`);
  }
});

test("THE FIRST KNOCK refuses a pinned author whose login names ANOTHER household's sketchbook", (t) => {
  const r = knock(t, { id: 3, login: "house-a" });
  assert.equal(r.code, 1, r.out);
  assert.match(r.calls, /gh pr comment 7 --body refused: the PR lane could not admit this change \(lane-author: the sketchbook draft\/house-a is bound to another household/);
  assert.doesNotMatch(r.calls, /GitHub account \d+ is not pinned|your GitHub account is not pinned/, "a PINNED author is not called unpinned, by the outer prefix or the inner cause");
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

// ── THE REAL EXPORT'S SHAPES (WLD-122; office#796 review F2) ─────────────────
//
// REAL_EXPORT is what postmark-office tools/world-households-export.mjs printed
// (office#796, households/logins/pinned_ids copied verbatim) over an invented
// store: slate-house lists two accounts (kogane's, the declarer's, and
// keithling's: Keith's world#316 shape), moss-house lists only moss's account
// while fern is pinned on another, wren is solo, and one account is pinned
// behind two solo residents (dune, dew), so the export bound it to nothing and
// named it. A pinned login no house lists stays `gh:<id>` in `logins`; the
// hand-built REGISTRY above never had that shape, which is why it hid F2.
const REAL_EXPORT = {
  households: { dew: "solo:dew", dune: "solo:dune", fern: "hh:moss-house", keithling: "hh:slate-house", kogane: "hh:slate-house", moss: "hh:moss-house", wren: "solo:wren" },
  logins: {
    dew: "solo:dew", dune: "solo:dune", "inv-dew": "gh:900000401", "inv-dune": "gh:900000401", "inv-fern": "gh:900000202",
    "inv-keith": "hh:slate-house", "inv-kogane": "hh:slate-house", "inv-moss": "hh:moss-house", "inv-wren": "gh:900000301",
    "moss-house": "hh:moss-house", "slate-house": "hh:slate-house", wren: "solo:wren",
  },
  pinned_ids: { 900000101: "hh:slate-house", 900000102: "hh:slate-house", 900000201: "hh:moss-house", 900000202: "hh:moss-house", 900000301: "solo:wren" },
};

test("sketchbookHouse: a `gh:<id>` sketchbook is that account's pinned household; an unbound account's is nobody's; an unknown name is unknown", () => {
  assert.deepEqual(sketchbookHouse(REAL_EXPORT, "inv-wren"), { known: true, house: "solo:wren" });
  assert.deepEqual(sketchbookHouse(REAL_EXPORT, "INV-FERN"), { known: true, house: "hh:moss-house" });
  assert.deepEqual(sketchbookHouse(REAL_EXPORT, "inv-keith"), { known: true, house: "hh:slate-house" });
  assert.deepEqual(sketchbookHouse(REAL_EXPORT, "inv-dune"), { known: true, house: null }, "an account the export left unbound binds no house");
  assert.deepEqual(sketchbookHouse(REAL_EXPORT, "nobody-yet"), { known: false, house: null });
  assert.deepEqual(sketchbookHouse({ logins: REAL_EXPORT.logins }, "inv-wren"), { known: true, house: null }, "no pinned_ids, no account binding");
});

test("THE #316 REPLAY, first knock: a two-account house's second account is admitted under its own login; the legacy key rule bound no one", (t) => {
  // world main's old knock compared `households` values with gh:<id> / login:<login>; the export keys houses hh:<slug>
  const legacy = Object.values(REAL_EXPORT.households);
  assert.equal(legacy.includes("gh:900000102") || legacy.includes("login:inv-keith"), false, "the old rule refused #316's shape");
  const keith = knock(t, { id: 900000102, login: "inv-keith", registry: REAL_EXPORT });
  assert.equal(keith.code, 0, keith.out);
  assert.match(keith.calls, /git push origin origin\/main:refs\/heads\/draft\/inv-keith/);
  assert.match(keith.calls, /gh pr edit 7 --base draft\/inv-keith/);
  // the controls, each refused with no ground made
  for (const [why, id, login, said] of [
    ["an unregistered account", 900000999, "inv-stranger", /not pinned to any household/],
    ["an unpinned account named like another household's sketchbook", 900000998, "moss-house", /not pinned to any household/],
    ["an ambiguous account (two solo residents; the export bound it to nothing)", 900000401, "inv-dune", /not pinned to any household/],
    ["a pinned author whose login names another household's account sketchbook", 900000101, "inv-fern", /bound to another household/],
    // T1 (delta review): a pinned author whose login names a KNOWN but unbound account's sketchbook
    ["a pinned author whose login names an unbound account's sketchbook", 900000101, "inv-dune", /the sketchbook draft\/inv-dune is known to the registry but is not pinned to any one household/],
  ]) {
    const r = knock(t, { id, login, registry: REAL_EXPORT });
    assert.equal(r.code, 1, `${why}: ${r.out}`);
    assert.match(r.calls, said, why);
    // the outer prefix is the lane's neutral one for EVERY refusal; it never claims the account is unpinned
    assert.match(r.calls, /gh pr comment 7 --body refused: the PR lane could not admit this change \(/, `${why}: neutral outer prefix`);
    assert.doesNotMatch(r.calls, /your GitHub account is not pinned to a household the lane can bind/, `${why}: the old outer prefix is gone`);
    if (id === 900000101) {
      // K1 (review): a PINNED author refused over a sketchbook is told the true cause of THAT sketchbook, never "unpinned"
      assert.doesNotMatch(r.calls, /GitHub account \d+ is not pinned/, `${why}: the author is pinned`);
      assert.equal(/another household/.test(r.calls), login === "inv-fern", `${why}: "another household" only where the sketchbook really is another household's`);
    }
    assert.doesNotMatch(r.calls, /git push|gh pr edit/, `${why}: no sketchbook made, nothing retargeted`);
  }
});

test("F2, first knock: a solo resident and a house resident on an unlisted account knock on their own login's sketchbook", (t) => {
  for (const [who, id, login] of [["wren (solo)", 900000301, "inv-wren"], ["fern (moss-house, unlisted account)", 900000202, "inv-fern"]]) {
    const r = knock(t, { id, login, registry: REAL_EXPORT, branchExists: true });
    assert.equal(r.code, 0, `${who}: ${r.out}`);
    assert.match(r.calls, new RegExp(`gh pr edit 7 --base draft/${login}`), who);
  }
});
