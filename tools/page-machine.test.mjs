// page-machine.test.mjs — the page tests' machine is set, by the helper they all
// use (WLD-71).
//
//   node --test tools/page-machine.test.mjs
//   WORLD_PAGE_CPU_THROTTLE=4 node --test tools/<a page test>.test.mjs   (the sweep)
//
// Three halves. The clock and the run's throttle switch are read directly. The
// WIRING is a census of tools/*.test.mjs: every file that drives a browser opens
// its pages through page-machine.mjs (a page opened any other way takes the host's
// cores and the host's speed, which is the WLD-60 block), and every one of them
// skips in the words suite.yml refuses (a viewer suite that skipped for want of
// the browser guarded nothing). The PAGE half opens real contexts and reads the
// machine, the held clock and the throttle off them. When Playwright is absent
// that half skips, and says so.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { ABLE_MACHINE, NO_PLAYWRIGHT, THROTTLE_ENV, cpuThrottle, holdClockWithinATask, machineContext, machinePage, readsSettled, settleCheck, gate } from "./page-machine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

test("the held clock: still within one task, moving between tasks", async () => {
  let t = 1000;
  const sandbox = { performance: { now: () => (t += 7) }, queueMicrotask };
  runInNewContext(`(${holdClockWithinATask})()`, sandbox);
  const a = sandbox.performance.now(), b = sandbox.performance.now();
  assert.equal(a, b, "two reads in one task are one instant: a synchronous bake slice reads 0 ms");
  await new Promise((r) => setTimeout(r, 0));
  const c = sandbox.performance.now();
  assert.ok(c > a, `the next task reads a later instant (${a} → ${c}): timers and frames still advance`);
});

test("the run's throttle: none by default, a named rate, and a mistyped one refused", () => {
  assert.equal(cpuThrottle({}), 0);
  assert.equal(cpuThrottle({ [THROTTLE_ENV]: "" }), 0);
  assert.equal(cpuThrottle({ [THROTTLE_ENV]: "0" }), 0);
  assert.equal(cpuThrottle({ [THROTTLE_ENV]: "4" }), 4);
  assert.equal(cpuThrottle({ [THROTTLE_ENV]: "2.5" }), 2.5);
  for (const bad of ["fast", "-2", "0.5", "50"]) assert.throws(() => cpuThrottle({ [THROTTLE_ENV]: bad }), /a number from 1 to 20/, bad);
});

test("settleCheck: quiet is nothing open and nothing new started, twice; a fast read between checks starts the count again", () => {
  const s = { quiet: 0, started: -1 };
  assert.equal(settleCheck({ started: 0, open: 0 }, s), false, "no read yet is not settled");
  assert.equal(settleCheck({ started: 2, open: 1 }, s), false, "a read open");
  assert.equal(settleCheck({ started: 2, open: 0 }, s), false, "the first quiet check");
  assert.equal(settleCheck({ started: 3, open: 0 }, s), false, "a read started AND finished since the last check: not quiet yet");
  assert.equal(settleCheck({ started: 3, open: 0 }, s), true, "two quiet checks with nothing new between");
});

// Bevel's measurement at 7650bf09: two readsSettled calls in a row took [2, 1]
// checks, the second riding the first's quiet count (one window.__pmQuiet, never
// reset). A page stub that runs the expression readsSettled hands Playwright.
test("readsSettled: each call counts its own quiet from nothing (a second call never rides the first's)", async () => {
  const sandbox = { window: { __pmPageReads: { started: 1, open: 0 } } };
  const checks = [];
  const page = {
    waitForFunction: async (expr) => {
      assert.equal(typeof expr, "string", "an expression, so the page's CSP is not asked to eval");
      let n = 0;
      while (!runInNewContext(expr, sandbox)) { n++; if (n > 50) throw new Error("never settled"); }
      checks.push(n + 1);
    },
  };
  await readsSettled(page);
  await readsSettled(page);
  assert.deepEqual(checks, [2, 2], "two fresh calls, two checks each");
  sandbox.window.__pmPageReads.started += 1;   // a read began and ended before the third call
  await readsSettled(page);
  assert.deepEqual(checks, [2, 2, 2]);
});

// ── the wiring: every browser test opens its pages through the helper ────────
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const OWN_PHRASES = /playwright is absent|NO PLAYWRIGHT/;   // suite.yml's own grep, case and all
/** what the census says about one test file's source: null when it drives no
 *  browser (a browser test launches chromium; most find playwright through a
 *  PLAYWRIGHT_PATHS loop, so the launch is the mark, not the import) */
function wiringOf(src) {
  const code = stripComments(src);
  if (!/\bchromium\s*\.\s*launch\s*\(/.test(code)) return null;
  const wrong = [];
  if (/\bbrowser\s*\.\s*new(Page|Context)\s*\(/.test(code)) wrong.push("opens a page or context with browser.newPage/newContext, so it takes the host's machine");
  if (!/from\s+["']\.\/page-machine\.mjs["']/.test(code)) wrong.push("does not import ./page-machine.mjs");
  if (!OWN_PHRASES.test(src)) wrong.push("skips without the words suite.yml refuses (playwright is absent | NO PLAYWRIGHT)");
  return wrong;
}

test("the census sees what it is for: a bare page, a missing import and a quiet skip are each caught, the helper's way is not", () => {
  // the shapes are assembled, so this file's own source is not one of them
  const bare = (verb, gap = "") => ["browser", gap, ".new", verb, "({})"].join("");
  const launch = ["chromium", ".launch()"].join("");
  const good = `browser = await ${launch};\nimport { machinePage } from "./page-machine.mjs";\nconst page = await machinePage(browser, {});\nt.skip("NO PLAYWRIGHT — x");\n`;
  assert.deepEqual(wiringOf(good), []);
  assert.equal(wiringOf("const x = 1;"), null, "a file that launches no browser is not counted");
  assert.match(wiringOf(good.replace("machinePage(browser, {})", bare("Page"))).join(), /browser\.newPage/);
  assert.match(wiringOf(good.replace("machinePage(browser, {})", bare("Context", " "))).join(), /browser\.newPage/);
  assert.match(wiringOf(good.replace('import { machinePage } from "./page-machine.mjs";\n', "")).join(), /does not import/);
  assert.match(wiringOf(good.replace("NO PLAYWRIGHT", "Playwright is not installed")).join(), /skips without/);
  assert.deepEqual(wiringOf(good + `// ${bare("Page")} in a comment is prose\n`), [], "a comment is not code");
  assert.equal(wiringOf(`// ${launch} in a comment launches nothing\n`), null);
});

test("EVERY browser test in tools/ opens its pages on a set machine, and skips in suite.yml's words", () => {
  const files = readdirSync(join(ROOT, "tools")).filter((f) => f.endsWith(".test.mjs")).map((f) => `tools/${f}`);
  const census = Object.fromEntries(files.map((rel) => [rel, wiringOf(read(rel))]).filter(([, w]) => w !== null));
  // the floor: the census is counting the suites it is about (22 page tests and
  // this file at WLD-71)
  assert.ok(Object.keys(census).length >= 23, `browser tests found: ${Object.keys(census).length}`);
  for (const named of ["tools/lite-mode.test.mjs", "tools/room-feather.test.mjs", "tools/lately-reads-the-store.test.mjs", "tools/walk-layer-once.test.mjs"])
    assert.ok(named in census, `${named} is in the census`);
  const wrong = Object.fromEntries(Object.entries(census).filter(([, w]) => w.length));
  assert.deepEqual(wrong, {}, "a browser test opened a page the host decides, or skips where CI cannot see it");
  // and the phrase the helper names is suite.yml's
  assert.match(read(".github/workflows/suite.yml"), new RegExp(NO_PLAYWRIGHT));
});

// ── the page: real contexts carry the machine, the clock and the throttle ────
async function loadChromium() { try { return (await import("playwright")).chromium; } catch { return null; } }
let chromium = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  try { browser = await chromium.launch(); } catch { chromium = null; }
});
after(async () => { await browser?.close(); });
const SKIP = "NO PLAYWRIGHT — the page half of the set machine went UNGUARDED";

// a fixed piece of work, timed by Date (never held), in the page
const busy = (page) => page.evaluate(() => { const t0 = Date.now(); let x = 0; for (let i = 0; i < 3e7; i++) x = (x + i * 7) % 1000003; return { ms: Date.now() - t0, x }; });

test("THE PAGE: a context from the helper is the able machine, its clock held within a task, its reads counted", async (t) => {
  if (!chromium) return t.skip(SKIP);
  const page = await machinePage(browser, { throttle: 1 });
  await page.setContent("<p>machine</p>");
  const r = await page.evaluate(async () => {
    const a = performance.now(), b = performance.now();
    await new Promise((res) => setTimeout(res, 20));
    return { cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory, same: a === b, later: performance.now() > a };
  });
  assert.deepEqual(r, { cores: ABLE_MACHINE.cores, memory: ABLE_MACHINE.memory, same: true, later: true });
  await page.close();

  const real = await machinePage(browser, { clock: "real", machine: { cores: 4, memory: 4 }, throttle: 1 });
  await real.setContent("<p>machine</p>");
  const s = await real.evaluate(() => { const a = performance.now(); let x = 0; for (let i = 0; i < 2e6; i++) x += i; return { cores: navigator.hardwareConcurrency, moved: performance.now() > a, x }; });
  assert.equal(s.cores, 4, "a test whose subject is the machine names it");
  assert.equal(s.moved, true, "clock: real is the real clock, inside a task too");
  await real.close();
});

test("THE PAGE: the run's throttle reaches every page a context opens; a context's own rate outranks it", async (t) => {
  if (!chromium) return t.skip(SKIP);
  const plain = await machinePage(browser, { throttle: 1 });
  await busy(plain); const base = (await busy(plain)).ms;
  await plain.close();
  const was = process.env[THROTTLE_ENV];
  process.env[THROTTLE_ENV] = "6";
  let fromRun;
  try { fromRun = await machineContext(browser); } finally { if (was === undefined) delete process.env[THROTTLE_ENV]; else process.env[THROTTLE_ENV] = was; }
  assert.equal(fromRun.machine.throttle, 6, "the context took the run's rate");
  const slowed = await fromRun.newPage();
  await busy(slowed); const slow = (await busy(slowed)).ms;
  await fromRun.close();
  t.diagnostic(`unthrottled ${base} ms · ${THROTTLE_ENV}=6 ${slow} ms`);
  assert.ok(slow > base * 2.5, `the same work under the run's 6× throttle took ${slow} ms against ${base} ms: the page was not throttled`);
});

test("THE PAGE: readsSettled waits for a read the page is still making; gate holds one until released", async (t) => {
  if (!chromium) return t.skip(SKIP);
  const page = await machinePage(browser, { throttle: 1 });
  await page.route("http://rig.invalid/", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>rig</p>" }));
  const held = await gate(page, "http://rig.invalid/late.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"late":true}' }));
  await page.goto("http://rig.invalid/");
  await page.evaluate(() => { window.__got = null; fetch("/late.json").then((r) => r.json()).then((j) => { window.__got = j; }); });
  await held.asked;
  let settled = false;
  const waiting = readsSettled(page, { timeout: 20_000 }).then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(settled, false, "a read held at the gate keeps the page unsettled");
  held.release();
  await waiting;
  assert.deepEqual(await page.evaluate(() => window.__got), { late: true }, "settled means the body was read and what it fed ran");
  await page.close();
});
