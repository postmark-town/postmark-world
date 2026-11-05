// walks-from-office.test.mjs — `walksFromOffice` is a top-level export of the
// 2D viewer, so the 3D view imports it instead of keeping a copy (WLD-144;
// WLD-105: "Where the World exports a thing, import it").
//
// It was a closure inside `mountViewer` that captured nothing: a pure
// `body -> { departures, unrecognized }` parser of the office's `walks[]`. The
// hoist moved it, unchanged, to the top of spectator/viewer.mjs; `mountViewer`
// still calls it by the same name. These tests pin its contract with invented
// handles, mark ids and coordinates only — no resident data is read here — and
// pin that importing the viewer in node (no DOM) is still free of side effects.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { walksFromOffice } from "../spectator/viewer.mjs";

const VIEWER_URL = new URL("../spectator/viewer.mjs", import.meta.url).href;

const row = (over = {}) => ({
  iso: "2099-01-02T03:04:05.000Z",
  handle: "test-walker",
  from: { x: 1, y: 2 },
  toward: { x: 30, y: 40 },
  at: { x: 5, y: 6 },
  within: "test-town/test-extent",
  to: "test-town/test-mark",
  pace: "brisk",
  line: "off to the test mark",
  ...over,
});

test("mapping: within -> targetExtent, to -> targetMarkId, the rest name-for-name", () => {
  const { departures, unrecognized } = walksFromOffice({ walks: [row()] });
  assert.deepEqual(unrecognized, []);
  assert.deepEqual(departures, [{
    iso: "2099-01-02T03:04:05.000Z",
    handle: "test-walker",
    from: { x: 1, y: 2 },
    toward: { x: 30, y: 40 },
    at: { x: 5, y: 6 },
    targetExtent: "test-town/test-extent",
    targetMarkId: "test-town/test-mark",
    pace: "brisk",
    line: "off to the test mark",
  }]);
  // the store's column names do not leak through under their own names
  assert.equal("within" in departures[0], false);
  assert.equal("to" in departures[0], false);
});

test("mapping: iso and handle are stringified; from, toward and at are passed through by reference", () => {
  const from = { x: 7, y: 8 }, toward = { x: 9, y: 10 }, at = { x: 11, y: 12 };
  const { departures } = walksFromOffice({ walks: [row({ iso: 4102542245000, handle: 12345, from, toward, at })] });
  assert.equal(departures[0].iso, "4102542245000");
  assert.equal(departures[0].handle, "12345");
  assert.equal(departures[0].from, from);
  assert.equal(departures[0].toward, toward);
  assert.equal(departures[0].at, at);
});

test("defaults: a missing within / to / pace / line becomes null, and a missing at stays undefined", () => {
  const bare = row();
  delete bare.within; delete bare.to; delete bare.pace; delete bare.line; delete bare.at;
  const { departures, unrecognized } = walksFromOffice({ walks: [bare] });
  assert.deepEqual(unrecognized, []);
  assert.equal(departures.length, 1);
  assert.equal(departures[0].targetExtent, null);
  assert.equal(departures[0].targetMarkId, null);
  assert.equal(departures[0].pace, null);
  assert.equal(departures[0].line, null);
  assert.equal(departures[0].at, undefined);
  // an explicit null reads the same as a missing field
  const nulled = walksFromOffice({ walks: [row({ within: null, to: null, pace: null, line: null })] }).departures[0];
  assert.deepEqual([nulled.targetExtent, nulled.targetMarkId, nulled.pace, nulled.line], [null, null, null, null]);
});

for (const missing of ["iso", "handle", "from", "toward"]) {
  test(`rejection: a row without ${missing} is collected as unrecognized, and the good rows beside it are kept`, () => {
    const bad = row({ handle: "test-bad" });
    delete bad[missing];
    const before = row({ handle: "test-before" });
    const after = row({ handle: "test-after" });
    const { departures, unrecognized } = walksFromOffice({ walks: [before, bad, after] });
    assert.deepEqual(departures.map((d) => d.handle), ["test-before", "test-after"]);
    assert.equal(unrecognized.length, 1);
    assert.equal(unrecognized[0], bad);   // collected as it came, not dropped and not rewritten
  });
}

test("rejection: empty-valued required fields and non-object rows are collected too", () => {
  const rows = [row({ iso: "" }), row({ handle: "" }), row({ from: null }), row({ toward: 0 }), null, undefined, row({ handle: "test-kept" })];
  const { departures, unrecognized } = walksFromOffice({ walks: rows });
  assert.deepEqual(departures.map((d) => d.handle), ["test-kept"]);
  assert.equal(unrecognized.length, 6);
});

test("empty input: undefined, {}, a non-array walks and an empty list all give empty arrays", () => {
  for (const body of [undefined, null, {}, { walks: "nope" }, { walks: {} }, { walks: [] }]) {
    assert.deepEqual(walksFromOffice(body), { departures: [], unrecognized: [] }, JSON.stringify(body) ?? "undefined");
  }
});

test("each call returns fresh arrays (nothing is shared between calls)", () => {
  const a = walksFromOffice({ walks: [row()] });
  const b = walksFromOffice({ walks: [row()] });
  assert.notEqual(a.departures, b.departures);
  assert.notEqual(a.unrecognized, b.unrecognized);
});

test("import purity: spectator/viewer.mjs imports in node with no DOM and touches no browser global", () => {
  // A fresh process, with every browser global booby-trapped: reading one at
  // import time (even through `typeof`) records it. The import must also print
  // nothing and leave no timer or handle holding the process open.
  const probe = `
    const trap = ["window", "document", "navigator", "localStorage", "sessionStorage", "location",
      "requestAnimationFrame", "HTMLElement", "customElements", "history", "screen"];
    const touched = [];
    for (const k of trap) Object.defineProperty(globalThis, k, { configurable: true, get() { touched.push(k); return undefined; } });
    const m = await import(${JSON.stringify(VIEWER_URL)});
    process.stdout.write(JSON.stringify({ touched, walksFromOffice: typeof m.walksFromOffice, mountViewer: typeof m.mountViewer }));
  `;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", probe], { encoding: "utf8", timeout: 60_000 });
  assert.deepEqual(JSON.parse(out), { touched: [], walksFromOffice: "function", mountViewer: "function" });
});
