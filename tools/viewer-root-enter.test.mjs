// viewer-root-enter.test.mjs — entering the town root keeps the town (CORE-118, town#4773).
//
// Darko, reporting as the Architect: "Everyone already stands within 'let there be light' (the town itself), yet an enter on it is accepted. Afterwards the
// World page shows its interior, which should just be the town, but the background and much else are gone." Expected: "entering the mark you're already
// within is refused, or does nothing."
//
// The world-root is the main world's own scene ("always-entered", spectator/SCENES.md § The model; the viewer's WORLD_ROOT_ID note: being inside it is being
// outdoors). The law's fold (tools/enter-exit.mjs occupancyAt, unchanged here) takes an `enters` of any mark with an inside, so a ledger CAN hold the root; read
// as an interior it mounted the root as a slate room, and the town's ground, painting and people went with it. This pins the page's two halves of the repair:
//   1. the PAGE'S occupancy (viewerOccupancyAt, which standpointOccupancy folds through) never draws the root as a room, by its canonical id, while an ordinary
//      mark, a nested room and the law's own fold are untouched;
//   2. the door: enterAffordance never offers the root, and the press handlers send no act for it.
// The real-renderer before/after (a local invented fixture, headless Chromium over spectator/server.mjs) is in the lane's pictures; this is its pin.
//
// CAN-FAIL FLIPS: delete the WORLD_ROOT_ID filter in viewerOccupancyAt -> claims 1-3 red; delete the root clause in enterAffordance -> claim 4 red;
// delete the `markId === WORLD_ROOT_ID` returns in crossInto / walkThereAndEnter -> claim 5 red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { occupancyAt, parseEnterExitLedger } from "./enter-exit.mjs";
import { WORLD_ROOT_ID, SPECTATOR_ACTOR, viewerOccupancyAt, standpointOccupancy, enterAffordance } from "../spectator/viewer.mjs";

const ME = "rig-actor";                 // an INVENTED resident
const HOUSE = "rig/the-invented-house"; // an ordinary mark with an inside
const ledger = (...rows) => parseEnterExitLedger("# fixture\n\n" + rows.map((r, i) => `- 2026-11-17T22:4${i}:00.000Z · ${r} · at ${190 + i}.0000 · word neutral`).join("\n") + "\n").acts;
const ROOT_MARK = { id: WORLD_ROOT_ID, kind: "sited", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 } };
const HOUSE_MARK = { id: HOUSE, kind: "sited", at: { x: 10, y: -4 }, extent: { w: 12, h: 9 } };
const GRANTED = [{ action: "enter", grant: "yours" }];

test("1. a ledger that holds only an enter of the root draws no room: the actor has entered nothing the page shows (the town stays)", () => {
  const acts = ledger(`${ME} · enters ${WORLD_ROOT_ID}`);
  assert.deepEqual([...occupancyAt(acts).get(ME)], [WORLD_ROOT_ID], "the law's own fold still holds the entry (the record is not edited)");
  assert.equal(viewerOccupancyAt(acts).has(ME), false, "the page's occupancy does not");
  const stand = standpointOccupancy({ acts, handle: ME });
  assert.equal(stand.insideOf, null, "no interior to compose: the town scene stays mounted");
  assert.deepEqual(stand.entered, []);
  assert.equal(stand.manifest.has(WORLD_ROOT_ID), false, "and the root holds no occupants as a room (nobody is hidden from the town for being 'inside' it)");
});

test("2. the root then a real room: the actor is inside the room, and only it (exiting it lands back in the town, not the root's slate room)", () => {
  const acts = ledger(`${ME} · enters ${WORLD_ROOT_ID}`, `${ME} · enters ${HOUSE}`);
  const stand = standpointOccupancy({ acts, handle: ME });
  assert.equal(stand.insideOf, HOUSE);
  assert.deepEqual(stand.entered, [HOUSE]);
  const out = ledger(`${ME} · enters ${WORLD_ROOT_ID}`, `${ME} · enters ${HOUSE}`, `${ME} · exits ${HOUSE}`);
  assert.equal(standpointOccupancy({ acts: out, handle: ME }).insideOf, null, "exiting the house leaves the actor in the town");
});

test("3. ordinary rooms are unchanged: the page's fold IS the law's for any ledger without the root, and a spectator still has no body to carry across", () => {
  const acts = ledger(`${ME} · enters ${HOUSE}`, `wren · enters ${HOUSE}`, `wren · exits ${HOUSE}`);
  assert.deepEqual([...viewerOccupancyAt(acts)].map(([h, s]) => [h, [...s]]), [...occupancyAt(acts)].map(([h, s]) => [h, [...s]]));
  const stand = standpointOccupancy({ acts, handle: ME });
  assert.equal(stand.insideOf, HOUSE);
  assert.deepEqual(stand.alongside, []);
  assert.equal(standpointOccupancy({ acts, handle: SPECTATOR_ACTOR }).insideOf, null);
  assert.equal(standpointOccupancy({ acts: ledger(`${ME} · enters ${WORLD_ROOT_ID}`), handle: SPECTATOR_ACTOR }).insideOf, null);
});

test("the root is identified by its canonical id, not by a name: a mark merely called 'Let There Be Light' is an ordinary room", () => {
  const lookalike = "rig/let-there-be-light";
  assert.notEqual(lookalike, WORLD_ROOT_ID);
  assert.equal(standpointOccupancy({ acts: ledger(`${ME} · enters ${lookalike}`), handle: ME }).insideOf, lookalike);
});

test("4. the door: the root is never offered (it is already the ground you stand in); an ordinary mark still is, and the old refusals stand", () => {
  const root = enterAffordance({ mark: ROOT_MARK, palette: GRANTED, actingAs: ME, insideOf: null });
  assert.equal(root.show, false);
  assert.match(root.why, /already within the town/);
  const house = enterAffordance({ mark: HOUSE_MARK, palette: GRANTED, actingAs: ME, insideOf: null });
  assert.equal(house.show, true);
  assert.equal(enterAffordance({ mark: HOUSE_MARK, palette: GRANTED, actingAs: ME, insideOf: HOUSE }).show, false, "already inside a room: still a no-op");
  assert.equal(enterAffordance({ mark: HOUSE_MARK, palette: [], actingAs: ME }).show, false, "no grant, no door");
  assert.equal(enterAffordance({ mark: HOUSE_MARK, palette: GRANTED, actingAs: SPECTATOR_ACTOR }).show, false, "a spectator has no body");
});

test("5. the press handlers send no act for the root (a stale card or a hand-made button cannot enter it either)", () => {
  const src = readFileSync(fileURLToPath(new URL("../spectator/viewer.mjs", import.meta.url)), "utf8");
  const body = (name) => { const at = src.indexOf(`async function ${name}(`); assert.ok(at > 0, `${name} exists`); return src.slice(at, at + 3500); };
  assert.match(body("crossInto"), /if \(markId === WORLD_ROOT_ID\) return;[^\n]*\n[\s\S]*apexAct\("enter"/, "crossInto returns before it asks the office");
  assert.match(body("walkThereAndEnter"), /^[^\n]*\n\s*if \(markId === WORLD_ROOT_ID\) return;/, "walkThereAndEnter returns first");
});
