// candle-boundary.test.mjs — the 4× page sweep runs in CI and `npm test`, never in
// the settlement candle (WLD-71; Wright's independent review 2026-10-30 11:38).
//
//   node --test tools/candle-boundary.test.mjs
//
// Two halves, each driven for real and never read as text:
//   1. THE RUNNER. A byte copy of tools/run-candle-suites.mjs, run as the crossing
//      runs it, over a private suite that records its own environment: the child it
//      starts carries WORLD_CANDLE_RUN=1 even when the caller inherited CI=true and
//      npm_lifecycle_event=test, and its [pin] test is still withheld.
//   2. THE SWEEP. tools/page-throttle-sweep.test.mjs, run as its own process behind a
//      preload that (a) answers `import("playwright")` with a recording fake and (b)
//      records and refuses every child_process spawn. With the candle's flag it
//      imports no browser, launches none and starts no child, and its 22 throttled
//      tests skip as a CANDLE EXCLUSION. Without the flag, under the same inherited CI
//      and npm names, it does probe and does dispatch all 22: the ordinary run keeps
//      the sweep. The fakes stand where a browser and 22 children would, so nothing
//      heavy runs here.
// Every nested run drops NODE_TEST_CONTEXT and must report nonzero TAP counts, so a
// run that quietly tested nothing cannot pass as an exclusion.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CANDLE_ENV } from "./run-candle-suites.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SWEEP = join(ROOT, "tools", "page-throttle-sweep.test.mjs");

/** a caller's environment as CI or npm would hand it on: never the candle's flag
 *  unless asked, never the parent runner's channel */
function callerEnv(extra = {}) {
  const env = { ...process.env, CI: "true", GITHUB_ACTIONS: "true", npm_lifecycle_event: "test", ...extra };
  delete env.NODE_TEST_CONTEXT;
  if (!("candle" in extra)) delete env[CANDLE_ENV];
  delete env.candle;
  return env;
}
const count = (out, k) => Number(out.match(new RegExp(`^(?:#|ℹ) ${k} (\\d+)$`, "m"))?.[1] ?? NaN);

test("THE RUNNER: the crossing's child carries the candle's flag, over an inherited CI and npm, and its pin is still withheld", () => {
  const dir = mkdtempSync(join(tmpdir(), "wld71-candle-runner-"));
  mkdirSync(join(dir, "tools"));
  copyFileSync(join(ROOT, "tools", "run-candle-suites.mjs"), join(dir, "tools", "run-candle-suites.mjs"));
  const out = join(dir, "env.json");
  writeFileSync(join(dir, "tools", "probe.test.mjs"), [
    'import { test } from "node:test";',
    'import { writeFileSync } from "node:fs";',
    'test("[pin] a source pin, which the candle withholds", () => { throw new Error("a pin ran in the candle"); });',
    `test("the child's environment", () => { writeFileSync(${JSON.stringify(out)}, JSON.stringify({ candle: process.env.${CANDLE_ENV} ?? null, ci: process.env.CI ?? null, life: process.env.npm_lifecycle_event ?? null })); });`,
    "",
  ].join("\n"));
  const run = spawnSync(process.execPath, [join(dir, "tools", "run-candle-suites.mjs")], { cwd: dir, env: callerEnv(), encoding: "utf8" });
  const said = run.stdout + run.stderr;
  assert.equal(run.status, 0, `the runner exited ${run.status}: ${said.slice(-600)}`);
  assert.match(said, /candle: 1 suites, 2 test titles; 1 withheld as source pins/, "the runner measured its private suite");
  assert.equal(count(said, "pass"), 1, "one test ran in the child (nonzero: the run was not empty)");
  // --test-skip-pattern leaves a withheld test out of the run altogether (measured:
  // "# tests 1", "# skipped 0"); the pin throws if it runs, so no failure is the proof
  assert.equal(count(said, "tests"), 1, "the pin was withheld: one test in the run, not two");
  assert.equal(count(said, "fail"), 0, "the pin, which throws if run, did not run");
  assert.ok(existsSync(out), "the probe test ran in the runner's child");
  assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), { candle: "1", ci: "true", life: "test" },
    "the child carries the candle's flag, beside the CI and npm names it inherited");
  // the control: the same suite under node --test directly carries no flag of its own
  const direct = spawnSync(process.execPath, ["--test", join(dir, "tools", "probe.test.mjs")], { cwd: dir, env: callerEnv(), encoding: "utf8" });
  assert.equal(count(direct.stdout + direct.stderr, "pass"), 1);
  assert.equal(JSON.parse(readFileSync(out, "utf8")).candle, null, "outside the runner, CI=true and npm_lifecycle_event=test set no flag");
});

/** the sweep, run as its own process behind the recording preload; what it imported,
 *  launched and spawned, and its TAP */
function sweepUnderFakes(flag) {
  const dir = mkdtempSync(join(tmpdir(), "wld71-candle-sweep-"));
  const log = join(dir, "seen.jsonl");
  writeFileSync(join(dir, "fake-playwright.mjs"), [
    'import { appendFileSync } from "node:fs";',
    `const seen = (what) => appendFileSync(${JSON.stringify(log)}, JSON.stringify(what) + "\\n");`,
    'seen({ import: "playwright" });',
    'export const chromium = { launch: async () => { seen({ launch: "chromium" }); return { close: async () => {} }; } };',
    "",
  ].join("\n"));
  writeFileSync(join(dir, "hooks.mjs"), [
    `const FAKE = ${JSON.stringify(pathToFileURL(join(dir, "fake-playwright.mjs")).href)};`,
    'export async function resolve(specifier, context, next) { return specifier === "playwright" ? { url: FAKE, shortCircuit: true } : next(specifier, context); }',
    "",
  ].join("\n"));
  writeFileSync(join(dir, "preload.mjs"), [
    'import { register, syncBuiltinESMExports } from "node:module";',
    'import { appendFileSync } from "node:fs";',
    'import cp from "node:child_process";',
    `register(${JSON.stringify(pathToFileURL(join(dir, "hooks.mjs")).href)});`,
    `const seen = (what) => appendFileSync(${JSON.stringify(log)}, JSON.stringify(what) + "\\n");`,
    'for (const name of ["spawn", "spawnSync", "fork", "exec", "execFile"]) cp[name] = (...args) => { seen({ dispatch: name, file: args[1]?.at?.(-1) ?? null }); throw new Error("dispatch intercepted by candle-boundary.test"); };',
    "syncBuiltinESMExports();",
    "",
  ].join("\n"));
  // run the file as ITSELF (node <file>, not node --test <file>): node:test runs in
  // this one process, so the preload sees every import and spawn it makes
  const run = spawnSync(process.execPath, ["--import", pathToFileURL(join(dir, "preload.mjs")).href, "--test-reporter=tap", SWEEP],
    { cwd: ROOT, env: callerEnv(flag ? { candle: true, [CANDLE_ENV]: "1" } : {}), encoding: "utf8" });
  const tap = run.stdout + run.stderr;
  const seen = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const swept = [...tap.matchAll(/^(not ok|ok) \d+ - AT \d+× CPU: (\S+) .*$/gm)].map((m) => ({ ok: m[1] === "ok", file: m[2], line: m[0] }));
  return { tap, seen, swept, tests: count(tap, "tests"), pass: count(tap, "pass"), skipped: count(tap, "skipped") };
}

test("THE SWEEP IN THE CANDLE: with the flag, over an inherited CI and npm, it imports no browser, launches none, starts no child, and says why", () => {
  const r = sweepUnderFakes(true);
  // nonzero, and the module's own: 23 tests counted and all 22 throttled ones reported by
  // name, so this is an exclusion and not an empty run
  assert.ok(r.tests >= 23, `the sweep module ran (tests ${r.tests})`);
  assert.equal(r.swept.length, 22, "all 22 throttled tests reported");
  assert.deepEqual(r.swept.filter((s) => !(s.ok && /# SKIP CANDLE EXCLUSION/.test(s.line))).map((s) => s.line), [],
    "each one skipped as the candle's exclusion, by name");
  assert.equal(r.tap.match(/# SKIP.*(?:playwright is absent|NO PLAYWRIGHT)/g)?.length ?? 0, 0, "no skip claims a missing browser");
  assert.deepEqual(r.seen, [], "no playwright import, no launch, no child process");
});

test("THE SWEEP OUTSIDE THE CANDLE: without the flag, the same inherited CI and npm names leave it on — it probes, and dispatches all 22", () => {
  const r = sweepUnderFakes(false);
  assert.ok(r.tests >= 23, `the sweep module ran (tests ${r.tests})`);
  assert.equal(r.swept.length, 22, "all 22 throttled tests reported");
  assert.equal(r.tap.match(/# SKIP CANDLE EXCLUSION/g)?.length ?? 0, 0, "nothing is excluded as the candle");
  assert.deepEqual(r.seen.slice(0, 2), [{ import: "playwright" }, { launch: "chromium" }], "the browser was asked for");
  const dispatched = r.seen.filter((s) => s.dispatch).map((s) => s.file);
  assert.equal(dispatched.length, 22, `one child per throttled test was started (intercepted here): ${dispatched.length}`);
  assert.deepEqual([...new Set(dispatched)].sort(), [...new Set(r.swept.map((s) => s.file))].sort(), "and each for its own file");
});
