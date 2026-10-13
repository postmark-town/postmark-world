// activity-lifecycle.test.mjs — WLD-29 first review, R2 + R3: the viewer's
// read/digest state is one office's, actor's and crossing's, fixed when the
// request is made; and a stopped viewer neither asks nor publishes.
//
// SOURCE-BODY PROOF, said as such: the viewer's own closure bodies (extracted
// from spectator/viewer.mjs, executed in a VM with synthetic collaborators).
// NOT a mounted browser. The first three tests are Bevel's first-review
// probes, kept with credit; the rest are this lane's controls around them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { residentReadKey } from "../spectator/viewer.mjs";

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
function fixture() {
  let resolve;
  const response = new Promise((r) => { resolve = r; });
  const requests = [];
  const context = vm.createContext({
    residentReadKey, requests,
    fetch: async (url) => { requests.push(url); return response; },
    syncHouseLights: () => {}, authHeaders: () => ({}),
    residentById: () => new Map(), loadTownHouses: () => {}, withTownHouses: () => {},
    buildHomeSet: () => new Set(), allMarks: () => [],
  });
  vm.runInContext(`
    let office = "https://office-a.invalid";
    const officeBase = () => office;
    const officeUrl = (path) => office + path;
    const state = { handle: "rig-actor", crossing: 500 };
    const readCache = new Map(), readPending = new Map();
    let heldReads = readCache, readError = null, activityHeld = null, activityPending = null, stopped = false, byId, homeSet;
    const mineSet = { marks: [] };
    const walkState = { walkers: [{ handle: "rig-actor", self: false }] };
    const onResidentPath = () => true;
    ${arrow("activityKeyFor")}
    ${arrow("activityKey")}
    ${body("takeActivity")}
    ${body("residentStandpointKey")}
    ${body("currentReadDials")}
    ${body("loadResidentRead")}
    ${body("refreshActivity")}
    globalThis.probe = {
      switchActor: (h) => { state.handle = h; },
      stop: () => { stopped = true; },
      refresh: () => refreshActivity(),
      start: () => loadResidentRead(null, state.handle),
      switchOffice: () => { office = "https://office-b.invalid"; },
      activity: () => activityHeld,
      dials: () => currentReadDials(),
    };
  `, context);
  const read = {
    dials: { "the-town/resident": { pace_km_per_crossing: 77 } },
    activity: { clock: 500, households: { "hh:from-office-a": 500 } },
  };
  return { probe: context.probe, requests, read,
    finish: () => resolve({ ok: true, json: async () => read }) };
}

test("Bevel: a late office-A resident response cannot be relabelled as office-B activity", async () => {
  const f = fixture();
  const pending = f.probe.start();
  assert.match(f.requests[0], /^https:\/\/office-a\.invalid/);
  f.probe.switchOffice();
  f.finish();
  await pending;
  assert.equal(f.probe.activity(), null,
    `response provenance crossed offices: ${JSON.stringify(f.probe.activity())}`);
});

test("Bevel: cached office-A dials are not current office-B dials without a B read", async () => {
  const f = fixture();
  const pending = f.probe.start();
  f.finish();
  await pending;
  assert.equal(f.probe.dials(), f.read.dials, "control: A's own digest was held");
  f.probe.switchOffice();
  assert.equal(f.probe.dials(), null, "B has not supplied or vouched for any dials");
});

test("Bevel: stop clears the new activity interval as well as the existing two", () => {
  const match = source.match(/    stop: \(\) => \{([\s\S]*?)\n    \},/);
  assert.ok(match, "source extraction: returned stop method");
  const active = new Set(["clock", "walkers", "activity"]);
  const context = vm.createContext({
    clock: "clock", walkState: { timer: "walkers" }, activityTimer: "activity",
    clearInterval: (id) => active.delete(id),
    document: { removeEventListener() {} }, window: { removeEventListener() {} },
    onViewerKeydown() {}, onViewerResize() {}, onStoodOut() {}, bubbleResize: null,
  });
  vm.runInContext(`(() => { ${match[1]} })()`, context);
  assert.equal(active.size, 0, `intervals left after actual stop body: ${[...active].join(",")}`);
});


// ── this lane's controls around the probes ───────────────────────────────────

test("SAME OFFICE, SAME ACTOR: the answer is taken (the control the cross-office refusal is measured against)", async () => {
  const f = fixture();
  const pending = f.probe.start();
  f.finish();
  await pending;
  assert.deepEqual(f.probe.activity()?.activity, f.read.activity, "A's answer, held as A's");
  assert.match(f.probe.activity()?.key, /^https:\/\/office-a\.invalid\|rig-actor\|500$/);
});

test("A LATE ANSWER FOR ANOTHER ACTOR is not taken as the new actor's", async () => {
  const f = fixture();
  const pending = f.probe.start();
  f.probe.switchActor("someone-else");
  f.finish();
  await pending;
  assert.equal(f.probe.activity(), null);
});

test("A STOPPED VIEWER asks nothing and publishes nothing: refresh sends no request; a reply landing after stop is dropped", async () => {
  const f = fixture();
  const pending = f.probe.start();
  f.probe.stop();
  f.finish();
  await pending;
  assert.equal(f.probe.activity(), null, "the late reply did not publish into the stopped mount");
  const before = f.requests.length;
  assert.equal(f.probe.refresh(), null);
  assert.equal(f.requests.length, before, "no request after stop");
});

test("REMOUNT: each mount's stop clears its own three intervals, and two mounts' stops leave none behind", () => {
  const match = source.match(/    stop: \(\) => \{([\s\S]*?)\n    \},/);
  assert.ok(match, "source extraction: returned stop method");
  const active = new Set();
  const mount = (n) => {
    const ids = { clock: `clock-${n}`, walk: `walkers-${n}`, act: `activity-${n}` };
    for (const id of Object.values(ids)) active.add(id);
    return vm.createContext({
      clock: ids.clock, walkState: { timer: ids.walk }, activityTimer: ids.act,
      clearInterval: (id) => active.delete(id),
      document: { removeEventListener() {} }, window: { removeEventListener() {} },
      onViewerKeydown() {}, onViewerResize() {}, onStoodOut() {}, bubbleResize: null,
    });
  };
  const one = mount(1), two = mount(2);
  vm.runInContext(`(() => { ${match[1]} })()`, one);
  assert.deepEqual([...active].sort(), ["activity-2", "clock-2", "walkers-2"], "stopping the first mount leaves only the second's");
  vm.runInContext(`(() => { ${match[1]} })()`, two);
  assert.equal(active.size, 0, `left after both stops: ${[...active].join(",")}`);
  assert.equal(one.stopped, true, "stop marks its own mount stopped");
});
