// room-art-remount.test.mjs — play row 80 (Darko 2026-10-16 19:45): "Entering
// the Starforge spire from outside brought me to a blank interior until I
// reloaded the page … it had all of the marks, just not the actual background
// image." Found: an owner's first record of the room is their portfolio row
// (/world/my-marks), which carries no picture; the read taken inside brings the
// full record, but the same room was never remounted, so its ground stayed
// baked without the picture until a reload. The scene now remembers what it
// was drawn from and remounts when the room's record says otherwise.
// Run: node --test tools/room-art-remount.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roomGroundSignature } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
// the Vestibule, as darko's portfolio row has it (measured), and as the read inside has it
const portfolio = { id: "darko/spire-gilded-vestibule", kind: "sited", at: { x: 3786.25, y: -5508 }, extent: { w: 22.5, h: 24 } };
const full = { ...portfolio, image: "https://media.postmark.town/media/spire-local/gilded-vestibule.jpg" };

test("the picture arriving changes what the room is drawn from; the same record does not", () => {
  assert.notEqual(roomGroundSignature(portfolio), roomGroundSignature(full));
  assert.equal(roomGroundSignature(full), roomGroundSignature({ ...full }));
  assert.notEqual(roomGroundSignature(full), roomGroundSignature({ ...full, extent: { w: 30, h: 24 } }), "a new shape too");
  assert.equal(roomGroundSignature(null), "");
});

test("pins: a mounted room is remounted when its record now differs, and only then", () => {
  assert.match(SOURCE, /sceneRoomSig = roomGroundSignature\(room\);/, "the mount remembers what it baked");
  assert.match(SOURCE, /if \(\(room\?\.id \?\? null\) === sceneRoomId && \(!room \|\| roomGroundSignature\(room\) === sceneRoomSig\)\) return;\s*if \(room\) mountRoomScene\(boxEl, room\);/);
});
