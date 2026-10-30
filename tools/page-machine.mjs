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
// subject IS the machine says so: `machine: { cores: 4, … }`, or `clock: "real"`
// with a `throttle` for a slow first bake (tools/lite-mode.test.mjs). A test that
// wants a mode rather than a machine passes `?lite=0` / `?lite=1` on its URL.
//
// THE HOSTILE HOST, ON PURPOSE. WORLD_PAGE_CPU_THROTTLE=<rate> throttles every
// page a context from here opens (Chromium's CPU throttle, the slow-machine
// test's own instrument), so the swept tests can be run as a loaded keeper box
// would run them and required green:
//
//   WORLD_PAGE_CPU_THROTTLE=4 node --test tools/room-feather.test.mjs
//
// A context given its own `throttle` keeps it (the slow-machine case is measured
// at the rate it names, whatever the run's).
//
// THE READS. readsSettled(page) waits until every fetch the page has made has
// answered and every body it read has been read, twice across a task: the boot's
// late arrivals (the ledger, the faces) and what they draw have happened. It is
// the wait to use instead of a sleep that "lets the boot land".

export const ABLE_MACHINE = Object.freeze({ cores: 16, memory: 8 });
export const THROTTLE_ENV = "WORLD_PAGE_CPU_THROTTLE";

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

/** A browser context on a SET machine. `clock`: "held" (the default) or "real";
 *  `machine`: the cores and memory navigator reports; `throttle`: a CPU rate for
 *  every page it opens (default: the run's WORLD_PAGE_CPU_THROTTLE). Every other
 *  option is Playwright's own newContext option (viewport, reducedMotion, …). */
export async function machineContext(browser, { clock = "held", machine = ABLE_MACHINE, throttle = cpuThrottle(), ...options } = {}) {
  if (clock !== "held" && clock !== "real") throw new Error(`clock: "held" or "real", not ${JSON.stringify(clock)}`);
  if (!(Number.isFinite(machine?.cores) && Number.isFinite(machine?.memory))) throw new Error("machine: { cores, memory }, both numbers");
  const ctx = await browser.newContext(options);
  if (clock === "held") await ctx.addInitScript(holdClockWithinATask);
  await ctx.addInitScript(setMachine, { cores: machine.cores, memory: machine.memory });
  await ctx.addInitScript(trackReads);
  // the throttle is put on each page as it is opened, before anything loads in it
  const open = ctx.newPage.bind(ctx);
  ctx.newPage = async () => {
    const page = await open();
    if (throttle > 1) await (await ctx.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
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

/** Wait until the page has no fetch in flight and no body being read, at two
 *  checks a task apart, after at least one read: what the reads landed has been
 *  drawn. A page that polls (walkers every 15 s) is caught between polls. */
export async function readsSettled(page, { timeout = 90_000 } = {}) {
  await page.waitForFunction(() => {
    const r = window.__pmPageReads;
    if (!r) throw new Error("readsSettled needs a page from machineContext/machinePage");
    if (!r.started || r.open) { window.__pmQuiet = 0; return false; }
    window.__pmQuiet = (window.__pmQuiet ?? 0) + 1;
    return window.__pmQuiet >= 2;
  }, null, { timeout, polling: 50 });
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
