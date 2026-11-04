// lights-lifecycle.test.mjs — WLD-29, the pointer model: the page's two sources
// (GET /world/lights, GET /world/dials) are each one office's answer — and, for
// the lights, one crossing's — fixed when the request is made; a stopped viewer
// neither asks nor publishes; and the resident read no longer feeds either.
//
// SOURCE-BODY PROOF, said as such: the viewer's own closure bodies (extracted
// from spectator/viewer.mjs, executed in a VM with synthetic collaborators).
// NOT a mounted browser — the rendered proof is
// tools/resident-middle-on-the-page.test.mjs. The cross-office, stop and
// remount probes descend from Bevel's first-review probes (R2, R3), credited.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { residentReadKey, lightsRequest, lensQuery, mineForSight, lensAnswered, readStillWanted, OUTSIDER_LENS } from "../spectator/viewer.mjs";

const source = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
function body(name) {
  const text = source.match(new RegExp(`^  function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}`, "m"))?.[0];
  assert.ok(text, `source extraction: ${name}`);
  return text;
}
function arrow(name) {
  const text = source.match(new RegExp(`^  const ${name} = .+$`, "m"))?.[0];
  assert.ok(text, `source extraction: ${name}`);
  return text;
}
/** Each fetch answers when the test says so, in any order. */
function fixture() {
  const requests = [];
  const context = vm.createContext({
    residentReadKey, lightsRequest, requests, lensQuery, mineForSight, lensAnswered, readStillWanted, OUTSIDER_LENS,
    fetch: (url) => new Promise((resolve) => { requests.push({ url, answer: (j) => resolve({ ok: true, json: async () => j }) }); }),
    syncs: 0, renders: 0, authHeaders: () => ({}),
    residentById: () => new Map(), loadTownHouses: () => {}, withTownHouses: () => {},
    buildHomeSet: () => new Set(), allMarks: () => [],
  });
  vm.runInContext(`
    var syncHouseLights = () => { globalThis.syncs += 1; };
    var renderWalkDestination = () => { globalThis.renders += 1; };
    let office = "https://office-a.invalid";
    const officeBase = () => office;
    const officeUrl = (path) => office + path;
    const state = { handle: "rig-actor", crossing: 500, crossingOverride: false, arming: null };
    const walkState = { destination: { x: 1, y: 1 } };
    const readCache = new Map(), readPending = new Map();
    let readError = null, lightsHeld = null, lightsPending = null, dialsHeld = null, dialsPending = null, stopped = false, byId, homeSet;
    const mineSet = { marks: [] };
    ${arrow("lightsAsk")}
    ${body("takeLights")}
    ${body("refreshLights")}
    ${body("currentLights")}
    ${body("lightsRetryDue")}
    ${body("takeDials")}
    ${body("refreshDials")}
    ${body("currentReadDials")}
    ${body("dialsRetryDue")}
    ${body("residentStandpointKey")}
    ${body("loadResidentRead")}
    globalThis.probe = {
      state, stop: () => { stopped = true; },
      switchOffice: () => { office = "https://office-b.invalid"; },
      lights: () => currentLights(), held: () => lightsHeld, refreshLights: () => refreshLights(), retryDue: () => lightsRetryDue(),
      dials: () => currentReadDials(), dialsHeld: () => dialsHeld, refreshDials: () => refreshDials(), dialsRetryDue: () => dialsRetryDue(),
      read: () => loadResidentRead(null, state.handle),
    };
  `, context);
  return { probe: context.probe, requests, ctx: context };
}
const LIGHTS = { crossing: 500, window: 1, lit: ["hh:a"] };
const DIALS = { settlement: "S9", sha: "a".repeat(40), dials: { "the-town/resident": { pace_km_per_crossing: 77 } } };
const tick = () => new Promise((r) => setImmediate(r));

test("LIVE: the page asks the BARE lights door at its office; the answer is held under that ask and drawn", async () => {
  const f = fixture();
  assert.equal(f.probe.lights(), null, "nothing held yet: unknown, and a request goes out");
  assert.deepEqual(f.requests.map((r) => r.url), ["https://office-a.invalid/world/lights"]);
  f.requests[0].answer(LIGHTS); await tick(); await tick();
  assert.deepEqual(f.probe.lights(), LIGHTS);
  assert.equal(f.ctx.syncs, 1, "the cards standing are trued");
  assert.equal(f.requests.length, 1, "held: no second request");
});

test("A PINNED CROSSING asks that crossing; a late answer for another crossing is not shown for this one", async () => {
  const f = fixture();
  f.probe.state.crossingOverride = true; f.probe.state.crossing = 3;
  f.probe.lights();
  assert.equal(f.requests[0].url, "https://office-a.invalid/world/lights?crossing=3");
  f.probe.state.crossing = 4;                      // the dial moved before the answer came
  f.requests[0].answer({ crossing: 3, window: 1, lit: null, historical: true, note: "n" }); await tick(); await tick();
  assert.equal(f.probe.held(), null, "the crossing-3 answer was not taken for crossing 4");
});

test("Bevel R2, for lights: a late office-A answer is never office-B's lights", async () => {
  const f = fixture();
  f.probe.lights();
  f.probe.switchOffice();
  f.requests[0].answer(LIGHTS); await tick(); await tick();
  assert.equal(f.probe.held(), null, `provenance crossed offices: ${JSON.stringify(f.probe.held())}`);
  assert.equal(f.probe.lights(), null);
  assert.equal(f.requests.at(-1).url, "https://office-b.invalid/world/lights", "B is asked for its own");
});

test("Bevel R2, for dials: office A's table is not office B's stride; B asks its own, and a late A reply after the switch is dropped", async () => {
  const f = fixture();
  assert.equal(f.probe.dials(), null);
  assert.equal(f.requests[0].url, "https://office-a.invalid/world/dials");
  f.requests[0].answer(DIALS); await tick(); await tick();
  assert.deepEqual(f.probe.dials(), DIALS.dials, "control: A's own table, held as A's");
  assert.equal(f.ctx.renders, 1, "an open desk re-prices its leg when the table lands");
  f.probe.switchOffice();
  assert.equal(f.probe.dials(), null, "B has not answered");
  assert.equal(f.requests.at(-1).url, "https://office-b.invalid/world/dials");
  const g = fixture();
  g.probe.dials(); g.probe.switchOffice();
  g.requests[0].answer(DIALS); await tick(); await tick();
  assert.equal(g.probe.dialsHeld(), null, "a late office-A table is not taken after the switch");
});

test("A STOPPED VIEWER asks nothing and publishes nothing: refreshes send no request; replies landing after stop are dropped", async () => {
  const f = fixture();
  f.probe.lights(); f.probe.dials();
  f.probe.stop();
  f.requests[0].answer(LIGHTS); f.requests[1].answer(DIALS); await tick(); await tick();
  assert.equal(f.probe.held(), null, "the late lights did not publish into the stopped mount");
  assert.equal(f.probe.dialsHeld(), null, "nor the late dials");
  const before = f.requests.length;
  assert.equal(f.probe.refreshLights(), null);
  assert.equal(f.probe.refreshDials(), null);
  assert.equal(f.requests.length, before, "no request after stop");
});

test("THE RESIDENT READ FEEDS NEITHER: a read carrying `dials` or `activity` (an older office) lights nothing and prices nothing", async () => {
  const f = fixture();
  const pending = f.probe.read();
  const req = f.requests.find((r) => /\/world\/apex/.test(r.url) || !/\/world\/(lights|dials)/.test(r.url));
  assert.ok(req, `the read was asked: ${JSON.stringify(f.requests.map((r) => r.url))}`);
  req.answer({ handle: "rig-actor", records: {}, dials: { "the-town/resident": { pace_km_per_crossing: 5 } }, activity: { clock: 500, households: { "hh:a": 500 } } });
  await pending;
  assert.equal(f.probe.held(), null, "the read's activity is not the lights");
  assert.equal(f.probe.dialsHeld(), null, "the read's dials are not the table");
  assert.doesNotMatch(body("loadResidentRead"), /takeLights|takeDials|takeActivity|\.activity\b/, "no read path into either source");
});

const STOP = source.match(/    stop: \(\) => \{([\s\S]*?)\n    \},/);
const stopContext = (ids, active) => vm.createContext({
  clock: ids.clock, walkState: { timer: ids.walk }, lightsTimer: ids.lights,
  clearInterval: (id) => active.delete(id),
  document: { removeEventListener() {} }, window: { removeEventListener() {} },
  onViewerKeydown() {}, onViewerResize() {}, onStoodOut() {}, bubbleResize: null,
});

test("Bevel R3: stop clears the lights interval as well as the existing two", () => {
  assert.ok(STOP, "source extraction: returned stop method");
  const active = new Set(["clock", "walkers", "lights"]);
  vm.runInContext(`(() => { ${STOP[1]} })()`, stopContext({ clock: "clock", walk: "walkers", lights: "lights" }, active));
  assert.equal(active.size, 0, `intervals left after actual stop body: ${[...active].join(",")}`);
});

test("REMOUNT: each mount's stop clears its own three intervals, and two mounts' stops leave none behind", () => {
  const active = new Set();
  const mount = (n) => {
    const ids = { clock: `clock-${n}`, walk: `walkers-${n}`, lights: `lights-${n}` };
    for (const id of Object.values(ids)) active.add(id);
    return stopContext(ids, active);
  };
  const one = mount(1), two = mount(2);
  vm.runInContext(`(() => { ${STOP[1]} })()`, one);
  assert.deepEqual([...active].sort(), ["clock-2", "lights-2", "walkers-2"], "stopping the first mount leaves only the second's");
  vm.runInContext(`(() => { ${STOP[1]} })()`, two);
  assert.equal(active.size, 0, `left after both stops: ${[...active].join(",")}`);
  assert.equal(one.stopped, true, "stop marks its own mount stopped");
});

test("AN UNKNOWN ANSWER IS ASKED AGAIN ON THE NEXT TICK (review-wld29): a slow or unread store (`lit: null`) or a failed fetch is due a retry; a known or historical answer is not; the 30 s clock asks it", async () => {
  const f = fixture();
  f.probe.lights();
  assert.equal(f.probe.retryDue(), false, "nothing held yet: the first ask is already out, not a retry");
  f.requests[0].answer({ crossing: 500, window: 1, lit: null, unavailable: "household activity did not answer within 1.5 s" }); await tick(); await tick();
  assert.equal(f.probe.retryDue(), true, "a slow store's answer is unknown, and due again");
  f.probe.refreshLights();
  assert.equal(f.requests.length, 2, "the retry asks the same door");
  f.requests[1].answer(LIGHTS); await tick(); await tick();
  assert.deepEqual(f.probe.lights(), LIGHTS);
  assert.equal(f.probe.retryDue(), false, "a known answer waits for the beat");
  f.probe.refreshLights();
  f.requests[2].answer({ crossing: 500, window: 1, lit: null, historical: true, note: "activity isn't kept per crossing" }); await tick(); await tick();
  assert.equal(f.probe.retryDue(), false, "historical is known: it says so, and is not asked again");
  f.probe.refreshLights();
  f.requests[3].answer({ error: "the world door tripped" }); await tick(); await tick();
  assert.equal(f.probe.held().lights, null);
  assert.equal(f.probe.retryDue(), true, "a failed answer is unknown, and due again");
  // the clock's 30 s tick is where the retry is asked
  const clock = source.match(/const clock = setInterval\(async \(\) => \{[\s\S]*?\}, 30000\);/)?.[0] ?? "";
  assert.match(clock, /if \(lightsRetryDue\(\)\) refreshLights\(\);/, "the 30 s clock re-asks an unknown light");
});

test("A FAILED DIAL TABLE IS ASKED AGAIN ON THE NEXT TICK (review-wld29): a GET /world/dials that failed or answered an error is due a retry, and the answer that lands prices the desk; an answered table is kept; the 30 s clock asks it", async () => {
  const f = fixture();
  assert.equal(f.probe.dials(), null, "nothing held: the first ask goes out");
  assert.equal(f.probe.dialsRetryDue(), false, "the first ask is not a retry");
  const first = f.requests.find((r) => r.url.endsWith("/world/dials"));
  first.answer({ error: "the world door tripped" }); await tick(); await tick();
  assert.equal(f.probe.dialsHeld().answer, null);
  assert.equal(f.probe.dialsRetryDue(), true, "a failed table is unknown, and due again");
  f.probe.refreshDials();
  const again = f.requests.filter((r) => r.url.endsWith("/world/dials"));
  assert.equal(again.length, 2, "the retry asks the same door");
  again[1].answer(DIALS); await tick(); await tick();
  assert.equal(f.probe.dials()["the-town/resident"].pace_km_per_crossing, 77, "the desk's stride, once it lands");
  assert.equal(f.probe.dialsRetryDue(), false, "an answered table is kept for the mount");
  f.probe.switchOffice();
  assert.equal(f.probe.dialsRetryDue(), false, "another office's held answer is never a retry here; that office asks its own");
  const clock = source.match(/const clock = setInterval\(async \(\) => \{[\s\S]*?\}, 30000\);/)?.[0] ?? "";
  assert.match(clock, /if \(dialsRetryDue\(\)\) refreshDials\(\);/, "the 30 s clock re-asks a failed table");
});
