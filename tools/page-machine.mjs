// page-machine.mjs — the machine a page test runs on is SET, never measured,
// and its reads are awaited, never raced (WLD-71, the S112 + WLD-60 class).
//
//   import { machinePage, machineContext, readsSettled } from "./page-machine.mjs";
//   const page = await machinePage(browser, { viewport: { width: 1500, height: 950 } });
//
// THE MACHINE. The World page decides lite mode on its own (viewer.mjs § LITE):
// few cores, little memory, or a first bake slower than 3 ms per 1,000 px. A test
// that leaves that to the host gets a different page on a 4-core CI runner, on a
// busy box and on an idle one; WLD-60 blocked a settlement that way. A context
// from here is a known able machine: 16 cores, 8 GB, and a clock held still
// within one task (holdClockWithinATask, below), so the bake reads instant while
// time still moves between tasks for timers, frames and crossings. A test whose
// subject IS the machine says so: `machine: { cores: 4, … }`, or `clock: "slow"`
// for a slow first bake (tools/lite-mode.test.mjs: SLOW_CLOCK_K, below), or
// `clock: "real"` for the real one. A test that
// wants a mode rather than a machine passes `?lite=0` / `?lite=1` on its URL.
//
// THE HOSTILE HOST, ON PURPOSE. WORLD_PAGE_CPU_THROTTLE=<rate> throttles every
// page a context from here opens (Chromium's CPU throttle, the slow-machine
// test's own instrument), so the swept tests can be run as a loaded keeper box
// would run them and required green:
//
//   WORLD_PAGE_CPU_THROTTLE=4 node --test tools/room-feather.test.mjs
//
// A context given its own `throttle` keeps it (a case that names its machine keeps
// that machine, whatever the run's rate).
//
// THE READS. readsSettled(page) waits until every fetch the page has made has
// answered and every body it read has been read, twice across a task: the boot's
// late arrivals (the ledger, the faces) and what they draw have happened. It is
// the wait to use instead of a sleep that "lets the boot land".

import { appendFileSync } from "node:fs";

export const ABLE_MACHINE = Object.freeze({ cores: 16, memory: 8 });
export const THROTTLE_ENV = "WORLD_PAGE_CPU_THROTTLE";
export const MACHINE_LOG_ENV = "WORLD_PAGE_MACHINE_LOG";

// suite.yml refuses a run whose TAP holds this phrase (a viewer suite that
// skipped for want of the browser guarded nothing), so every page test's skip says it
export const NO_PLAYWRIGHT = "NO PLAYWRIGHT";

/** The rate a run asked for: 0 (none) or a rate of at least 1. Anything else is
 *  a mistyped run, refused rather than run unthrottled under a throttled name. */
export function cpuThrottle(env = process.env) {
  const raw = env[THROTTLE_ENV];
  if (raw === undefined || raw === "" || raw === "0") return 0;
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 1 || rate > 20) throw new Error(`${THROTTLE_ENV}=${JSON.stringify(raw)}: a CPU throttle rate is a number from 1 to 20`);
  return rate;
}

// THE MACHINE'S SPEED IS SET, NOT MEASURED (WLD-60; first written in
// tools/lite-mode.test.mjs). The bake times its first layer with performance.now()
// and calls the machine slow past 3 ms per 1,000 px. Here the page's clock holds
// still within one task and moves on between tasks: the bake's slices are
// synchronous, so its reading is exactly 0, the machine infinitely fast, while
// time still passes between frames and timers. Runs IN THE PAGE.
export const holdClockWithinATask = () => {
  const realNow = performance.now.bind(performance);
  let held = null;
  performance.now = () => {
    if (held === null) { held = realNow(); queueMicrotask(() => { held = null; }); }
    return held;
  };
};

// THE SLOW MACHINE, SET THE SAME WAY (WLD-170). The held clock is the infinitely fast
// machine; this is the slow one, and it is just as little the host's: a first bake
// that takes `ms` of real work within a task reads `ms * k`, whatever the host's
// speed, so "slower than 3 ms per 1,000 px" is a fact about k and the work, not a
// race the host wins or loses (a CPU throttle of 6 still measured the host: a fast
// runner was not slow enough, and a loaded one was too slow to finish).
//
// Within a task the clock runs k times fast; between tasks it runs at the real rate
// (a machine that is k times slower at WORK still waits out a timer in real time,
// so timers, frames and crossings keep their real spacing). At the task's end the
// stretch it added is carried forward, so the clock never steps back and never
// jumps at a task boundary: monotonic, and a reading across tasks is the real
// elapsed time plus every task's extra. Runs IN THE PAGE; `k` arrives as the
// init script's argument.
export const SLOW_CLOCK_K = 10;
export const slowClockWithinATask = (k) => {
  const realNow = performance.now.bind(performance);
  let extra = 0, taskStart = null;
  performance.now = () => {
    const real = realNow();
    if (taskStart === null) {
      taskStart = real;
      queueMicrotask(() => { extra += (k - 1) * (realNow() - taskStart); taskStart = null; });
    }
    return real + extra + (k - 1) * (real - taskStart);
  };
};

// the cores and memory the page reads off navigator. Runs IN THE PAGE.
const setMachine = ({ cores, memory }) => {
  Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => cores, configurable: true });
  Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => memory, configurable: true });
};

// every fetch in flight, and every body being read, counted. Runs IN THE PAGE.
const trackReads = () => {
  const reads = { started: 0, open: 0 };
  Object.defineProperty(window, "__pmPageReads", { value: reads });
  const realFetch = window.fetch.bind(window);
  const settle = () => { reads.open -= 1; };
  window.fetch = (...args) => {
    reads.started += 1; reads.open += 1;
    return realFetch(...args).then((r) => { settle(); return r; }, (e) => { settle(); throw e; });
  };
  for (const name of ["json", "text", "arrayBuffer", "blob"]) {
    const real = Response.prototype[name];
    Response.prototype[name] = function (...args) {
      reads.open += 1;
      return real.apply(this, args).then((v) => { settle(); return v; }, (e) => { settle(); throw e; });
    };
  }
};

/** A test file's code without its comment lines, for the census (page-machine.test,
 *  page-throttle-sweep.test). By LINE, on purpose: a `/*` inside a line comment
 *  ("tools/*.test.mjs") would open a block to a regex and swallow code. A line is
 *  comment when it starts `//`, `/*` or `*`; a code line loses a ` // …` tail. */
export const stripComments = (src) => src.split("\n")
  .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
  .map((line) => line.replace(/\s\/\/\s.*$/, ""))
  .join("\n");

/** A browser context on a SET machine. `clock`: "held" (the default), "slow" (SLOW_CLOCK_K) or "real";
 *  `machine`: the cores and memory navigator reports; `throttle`: a CPU rate for
 *  every page it opens (default: the run's WORLD_PAGE_CPU_THROTTLE). Every other
 *  option is Playwright's own newContext option (viewport, reducedMotion, …). */
export async function machineContext(browser, { clock = "held", machine = ABLE_MACHINE, throttle = cpuThrottle(), ...options } = {}) {
  if (clock !== "held" && clock !== "slow" && clock !== "real") throw new Error(`clock: "held", "slow" or "real", not ${JSON.stringify(clock)}`);
  if (!(Number.isFinite(machine?.cores) && Number.isFinite(machine?.memory))) throw new Error("machine: { cores, memory }, both numbers");
  const ctx = await browser.newContext(options);
  if (clock === "held") await ctx.addInitScript(holdClockWithinATask);
  if (clock === "slow") await ctx.addInitScript(slowClockWithinATask, SLOW_CLOCK_K);
  await ctx.addInitScript(setMachine, { cores: machine.cores, memory: machine.memory });
  await ctx.addInitScript(trackReads);
  // the throttle is put on each page as it is opened, before anything loads in it
  const open = ctx.newPage.bind(ctx);
  ctx.newPage = async () => {
    const page = await open();
    if (throttle > 1) await (await ctx.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
    // the sweep's receipt (tools/page-throttle-sweep.test.mjs): one line per real
    // page opened, with the machine it was opened on
    if (process.env[MACHINE_LOG_ENV]) appendFileSync(process.env[MACHINE_LOG_ENV], JSON.stringify({ clock, cores: machine.cores, memory: machine.memory, throttle }) + "\n");
    return page;
  };
  Object.defineProperty(ctx, "machine", { value: Object.freeze({ clock, cores: machine.cores, memory: machine.memory, throttle }) });
  return ctx;
}

/** One page in a context of its own, as browser.newPage() gives one: closing the
 *  page closes its context. Options as machineContext. */
export async function machinePage(browser, options = {}) {
  const ctx = await machineContext(browser, options);
  const page = await ctx.newPage();
  page.once("close", () => { ctx.close().catch(() => {}); });
  return page;
}

/** One check of readsSettled, IN THE PAGE (exported so its rule is read directly).
 *  `s` is this call's own state: quiet means nothing open AND no read started
 *  since the last check, so a read that began and finished between two checks
 *  (a fast one) starts the count again rather than slipping through. */
export function settleCheck(r, s) {
  if (!r.started || r.open) { s.quiet = 0; s.started = r.started; return false; }
  if (r.started !== s.started) { s.quiet = 1; s.started = r.started; return false; }
  s.quiet += 1;
  return s.quiet >= 2;
}

let settleCalls = 0;
/** Wait until the page has no fetch in flight and no body being read, and has
 *  started none, across two checks a task apart, after at least one read: what
 *  the reads landed has been drawn. A page that polls (walkers every 15 s) is
 *  caught between polls. Each call counts its own quiet from nothing, so a second
 *  call never rides the first one's (until 7650bf09 one shared counter carried
 *  over: two calls in a row took [2, 1] checks). It says the READS are done, not
 *  what they drew: wait for the page's own marker of the phase as well. */
export async function readsSettled(page, { timeout = 90_000 } = {}) {
  const key = JSON.stringify(`call-${++settleCalls}`);
  // one expression carrying settleCheck's own source (Playwright evaluates it, so
  // the page's CSP is not asked), so the rule exists once
  await page.waitForFunction(`(() => {
    const r = window.__pmPageReads;
    if (!r) throw new Error("readsSettled needs a page from machineContext/machinePage");
    const calls = (window.__pmSettle ??= {});
    const s = (calls[${key}] ??= { quiet: 0, started: -1 });
    return (${settleCheck})(r, s);
  })()`, null, { timeout, polling: 50 });
}

/** Hold the answer to `url` (a Playwright route pattern) until release(): the
 *  fetch-order instrument. `answer(route)` serves it when released (default: the
 *  real answer). `asked` resolves once the page has asked. */
export async function gate(target, url, answer = (route) => route.continue()) {
  let release, asked;
  const opened = new Promise((r) => { release = r; });
  const wasAsked = new Promise((r) => { asked = r; });
  await target.route(url, async (route) => { asked(); await opened; await answer(route); });
  return { release: () => release(), asked: wasAsked };
}
