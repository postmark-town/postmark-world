// page-throttle-sweep.test.mjs — the swept page tests, run on a loaded machine
// and required green (WLD-71's falsifier: "run the swept tests under a CPU
// throttle (the slow-machine test already does this) and require them green").
//
//   node --test tools/page-throttle-sweep.test.mjs
//
// Each page test below runs in a child of its own (node --test <file>), one after
// another, with WORLD_PAGE_CPU_THROTTLE=4: every page its contexts open is
// throttled 4× by Chromium (page-machine.mjs). A test that waited on a sleep, or
// let the page measure the host, is what a 4× box turns red. The receipt is the
// helper's own: one line per real page opened, with its machine, so a file that
// "passed" without opening a page, or a page that escaped the throttle, is a red
// here. The slow-machine case keeps its own rate (6×, real clock) by name.
//
// The list is explicit and is held to the census (every tools/*.test.mjs that
// launches chromium, page-machine.test.mjs aside: its page half measures the
// throttle itself). This file runs no page of its own (it launches a browser once,
// to know whether the sweep can run) and never itself.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MACHINE_LOG_ENV, NO_PLAYWRIGHT, THROTTLE_ENV, stripComments } from "./page-machine.mjs";
import { CANDLE_ENV } from "./run-candle-suites.mjs";

// NOT IN THE CANDLE (WLD-71; Wright's review 2026-10-30 11:38). The settlement
// crossing's gate (tools/run-candle-suites.mjs) sets WORLD_CANDLE_RUN=1 on its child,
// and a crossing must not wait on 22 browsers at 4× CPU. There, this file probes no
// browser and starts no child: its 22 throttled tests skip, saying why. CI and
// `npm test` run them all. ONLY that name decides: an inherited CI=true,
// GITHUB_ACTIONS or npm_lifecycle_event neither excludes the sweep nor brings it back.
// (Not a [pin]: a pin is a source-text test, #2790; this is behaviour.)
const IN_CANDLE = process.env[CANDLE_ENV] === "1";
const CANDLE_EXCLUSION = `CANDLE EXCLUSION (${CANDLE_ENV}=1): the throttled page sweep runs in CI and npm test, not in the settlement crossing — nothing rendered here`;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = "tools/page-throttle-sweep.test.mjs";
const RATE = 4;
// the 22 page tests at WLD-71
const SWEPT = [
  "tools/act-as-town-bodies.test.mjs", "tools/backdrop-without-text.test.mjs", "tools/dungeon-page.test.mjs",
  "tools/first-paint-boot-shape.test.mjs", "tools/lately-more-on-the-page.test.mjs", "tools/lately-on-the-resident-path.test.mjs",
  "tools/lately-reads-the-store.test.mjs", "tools/lite-mode.test.mjs", "tools/mine-stands-out.test.mjs", "tools/mists-stage.test.mjs",
  "tools/part2-on-the-page.test.mjs", "tools/pinned-house-card.test.mjs", "tools/placed-art.test.mjs",
  "tools/region-column-reads-the-door.test.mjs", "tools/resident-middle-on-the-page.test.mjs", "tools/room-feather.test.mjs",
  "tools/search-the-town.test.mjs", "tools/standpoint-dot-culled.test.mjs", "tools/thumbnails-follow-the-drawn-size.test.mjs",
  "tools/town-ground-page.test.mjs", "tools/walk-enter-terms-page.test.mjs", "tools/walk-layer-once.test.mjs",
];
// the one deliberate exception, by name: lite-mode's slow machine is measured at its own rate
const OWN_RATE = { "tools/lite-mode.test.mjs": { clock: "real", throttle: 6 } };

const launches = (rel) => /\bchromium\s*\.\s*launch\s*\(/.test(stripComments(readFileSync(join(ROOT, rel), "utf8")));

test("the sweep's list is the census: every page test, none twice, not this file", () => {
  const census = readdirSync(join(ROOT, "tools")).filter((f) => f.endsWith(".test.mjs")).map((f) => `tools/${f}`)
    .filter((rel) => rel !== "tools/page-machine.test.mjs" && rel !== SELF && launches(rel)).sort();
  assert.equal(new Set(SWEPT).size, SWEPT.length, "no file twice");
  assert.ok(!SWEPT.includes(SELF), "the sweep never runs itself (its one launch is the probe below)");
  assert.deepEqual([...SWEPT].sort(), census, "a page test not in the sweep is not proved on a loaded machine");
});

let chromium = null;
before(async () => {
  if (IN_CANDLE) return;   // the candle: no playwright import, no probe launch
  try { chromium = (await import("playwright")).chromium; const b = await chromium.launch(); await b.close(); } catch { chromium = null; }
});

/** one page test in a child, throttled; its TAP and the machine receipt */
function runThrottled(rel) {
  const log = join(mkdtempSync(join(tmpdir(), "wld71-sweep-")), "machine.jsonl");
  // NODE_TEST_CONTEXT is the parent runner's: a child that inherits it reports to
  // the parent's channel instead of running as a run of its own, and exits 0
  // having passed nothing (measured on CI at f39d1ee7: all 22 "passed nothing")
  const env = { ...process.env, [THROTTLE_ENV]: String(RATE), [MACHINE_LOG_ENV]: log };
  delete env.NODE_TEST_CONTEXT;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", "--test-reporter=tap", rel], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (b) => { out += b; });
    child.stderr.on("data", (b) => { out += b; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 25 * 60_000);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      const count = (k) => Number(out.match(new RegExp(`^# ${k} (\\d+)$`, "m"))?.[1] ?? NaN);
      const pages = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
      resolve({
        code, signal, pass: count("pass"), fail: count("fail"), skipped: count("skipped"), pages,
        failing: [...out.matchAll(/^\s*not ok \d+ - (.*)$/gm)].map((m) => m[1]),
        // a TAP error is often a block (`error: |-` and the message on the lines
        // below), and the message is the evidence: an assertion, or a timeout
        errors: [...out.matchAll(/^([ \t]+)error: (?:\|-\n((?:\1[ \t]+.*\n|[ \t]*\n)+)|(.*)$)/gm)]
          .map((m) => (m[3] ?? m[2] ?? "").replace(/\s+/g, " ").trim().slice(0, 300)).slice(0, 6),
        browserSkips: [...out.matchAll(/# SKIP.*(playwright is absent|NO PLAYWRIGHT).*$/gm)].map((m) => m[0].slice(0, 160)),
        skips: [...out.matchAll(/# SKIP(.*)$/gm)].map((m) => m[1].trim().slice(0, 120)),
      });
    });
  });
}

for (const rel of SWEPT) {
  test(`AT ${RATE}× CPU: ${rel} is green, on real pages, every one throttled`, { timeout: 26 * 60_000 }, async (t) => {
    if (IN_CANDLE) return t.skip(CANDLE_EXCLUSION);
    if (!chromium) return t.skip(`${NO_PLAYWRIGHT} — the ${RATE}× sweep of ${rel} went UNGUARDED`);
    const r = await runThrottled(rel);
    const own = OWN_RATE[rel];
    const atRate = r.pages.filter((p) => p.throttle === RATE && p.clock === "held").length;
    const atOwn = own ? r.pages.filter((p) => p.throttle === own.throttle && p.clock === own.clock).length : 0;
    t.diagnostic(`${rel}: pass ${r.pass} · fail ${r.fail} · skipped ${r.skipped} · pages ${r.pages.length} (${atRate} at ${RATE}× held clock`
      + (own ? `, ${atOwn} at its own ${own.throttle}× ${own.clock} clock` : "") + `) · exit ${r.code ?? r.signal}`
      + (r.skips.length ? ` · skips: ${r.skips.join(" | ")}` : ""));
    assert.deepEqual(r.failing, [], `red at ${RATE}× CPU: ${r.failing.join(" | ")} — ${r.errors.join(" | ")}`);
    assert.deepEqual(r.browserSkips, [], "a page test skipped for want of the browser, so nothing was proved");
    assert.equal(r.code, 0, `the child exited ${r.code ?? r.signal}`);
    assert.ok(r.pass > 0, "the child passed nothing");
    assert.ok(r.pages.length > 0, "the file opened no page through the helper, so the throttle reached nothing");
    assert.equal(atRate + atOwn, r.pages.length, `every page at ${RATE}× on the held clock${own ? `, or at the file's own rate` : ""}: ${JSON.stringify(r.pages)}`);
    if (own) assert.ok(atOwn > 0, `${rel}'s own-rate case ran (${own.throttle}×, ${own.clock} clock)`);
  });
}
