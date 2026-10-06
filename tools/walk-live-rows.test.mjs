// walk-live-rows.test.mjs — a walk in progress reads as one (2026-10-06).
//
// THE INSTANCE. Ana confirmed Solace's 4,488 m walk home to the Far-Bank Porch.
// The office took it: /world/walkers had him moving, 3,483 m to go. The World
// page, signed in, labelled him "solace-aurelian — undefined m to go, ETA" and
// left his dot where he set out, so she could not tell a walk from a failure.
// Two causes on the resident path: `present` rows carry no distance or ETA, and
// the reader's own body came from the read's standpoint (where the read was
// taken), marked standing. The fix folds /world/walkers' MOVING rows into the
// rows already shown, and the label says "on the way" when it has no distance.

import { test } from "node:test";
import assert from "node:assert/strict";
import { walkingLabel, withLiveWalkers, placeLabel } from "../spectator/viewer.mjs";

test("W1 · the label never prints undefined: no distance reads 'on the way'", () => {
  assert.equal(walkingLabel(undefined, undefined), "on the way");
  assert.equal(walkingLabel(null, 0.5), "on the way");
  assert.equal(walkingLabel(NaN), "on the way");
  assert.doesNotMatch(walkingLabel(undefined), /undefined/);
});

test("W2 · with a distance it says the distance, and the ETA only when there is one", () => {
  assert.match(walkingLabel(3483, 0.06), /^3,483 m to go, ETA ≈ 0 h \d\d m$/);
  assert.equal(walkingLabel(1200.4), "1,200 m to go");
});

test("W3 · placeLabel of a moving place with no distance does not throw", () => {
  assert.equal(placeLabel({ moving: true }), "on the way");
});

test("W4 · a moving neighbour takes the live distance, ETA and position", () => {
  const rows = [{ handle: "solace-aurelian", x: -2100, y: -2600, standing: false, moving: true }];
  const live = [{ handle: "solace-aurelian", x: -2013.3, y: -2436.4, moving: true, remaining_m: 3483, eta_crossings: 0.06, toward: { x: -725, y: 800 } }];
  const [r] = withLiveWalkers(rows, live);
  assert.deepEqual([r.x, r.y, r.remaining_m, r.eta_crossings], [-2013.3, -2436.4, 3483, 0.06]);
  assert.deepEqual(r.toward, { x: -725, y: 800 });
});

test("W5 · the reader's own body moves with the walk, and is no longer 'standing'", () => {
  const rows = [{ handle: "solace-aurelian", x: -2961, y: -3600, standing: true, moving: false, self: true }];
  const live = [{ handle: "solace-aurelian", x: -2013.3, y: -2436.4, moving: true, remaining_m: 3483, eta_crossings: 0.06 }];
  const [r] = withLiveWalkers(rows, live, { selfHandle: "solace-aurelian" });
  assert.equal(r.moving, true);
  assert.equal(r.standing, false);
  assert.deepEqual([r.x, r.y], [-2013.3, -2436.4]);
  assert.equal(r.self, true);
});

test("W6 · the live layer adds nobody, and leaves standing neighbours alone", () => {
  const rows = [{ handle: "b", x: 9, y: 9, standing: true, moving: false }];
  const live = [{ handle: "b", x: 50, y: 50, moving: false }, { handle: "stranger", x: 0, y: 0, moving: true, remaining_m: 10 }];
  const out = withLiveWalkers(rows, live);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], rows[0]);
});

test("W7 · an arrived reader is drawn where the walk ended", () => {
  const rows = [{ handle: "me", x: 0, y: 0, standing: true, moving: false, self: true }];
  const live = [{ handle: "me", x: -725, y: 800, moving: false, remaining_m: 0 }];
  const [r] = withLiveWalkers(rows, live, { selfHandle: "me" });
  assert.deepEqual([r.x, r.y, r.moving], [-725, 800, false]);
});
