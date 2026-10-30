// room-mists-surround.test.mjs — play fix 31 (Darko, playground 2026-10-15
// 18:37): a room view inside the Mists shows the fog around its edges, never
// over the room. The coverage is pure and asked here; the page's wiring is pinned.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roomInMists, mistsRoomSurroundAt, MISTS_ROOM } from "../spectator/mists-render.mjs";
import { mistsAt } from "../tools/world-engine.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const m = { clear: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 }, clearings: [], fringeM: 400, density: 0.6 };
const box = (x, y, w, h) => ({ minX: x - w / 2, minY: y - h / 2, maxX: x + w / 2, maxY: y + h / 2 });

test("a room is in the Mists when the engine says so at its centre or a corner; clear ground is not", () => {
  assert.equal(roomInMists(m, box(0, 0, 100, 100)), null, "deep in the clear ground: no fog");
  assert.deepEqual(roomInMists(m, box(0, -1500, 100, 100)), { inWall: true, thickness: 1 }, "behind the wall");
  const fringe = roomInMists(m, box(0, -850, 40, 40));
  assert.ok(fringe && !fringe.inWall && fringe.thickness > 0 && fringe.thickness < 1, "in the fringe: a haze");
  assert.equal(roomInMists(null, box(0, 0, 10, 10)), null, "no Mists, no fog");
});

test("the room's own box stays fully clear; the fog rises over the breathing room to full at its reach", () => {
  const r = box(50, -20, 120, 80), pad = 30;
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
    const x = r.minX + (r.maxX - r.minX) * i / 20, y = r.minY + (r.maxY - r.minY) * j / 20;
    assert.equal(mistsRoomSurroundAt(r, x, y, pad), 0, `clear at ${x},${y}`);
  }
  // the soft edge lies outside: just past the wall it is thin, at the reach it is whole
  assert.ok(mistsRoomSurroundAt(r, r.maxX + 0.5, -20, pad) < 0.05, "thin just outside the wall");
  const far = pad * (MISTS_ROOM.wobbleFrac + MISTS_ROOM.softFrac) + 0.01;
  for (const [x, y] of [[r.maxX + far, -20], [r.minX - far, 0], [50, r.minY - far], [50, r.maxY + far]])
    assert.ok(mistsRoomSurroundAt(r, x, y, pad) > 0.999, `whole at the breathing room's reach (${x},${y})`);
  assert.equal(mistsRoomSurroundAt(r, r.maxX + 10, 0, 0), 0, "no breathing room, nothing to fog");
});

test("the real record: the Spire's Grounds stand behind the wall at 244 and 272 and clear from 282, when the Mists part over them (WLD-134); the Town Centre is never in the Mists", () => {
  const sk = JSON.parse(readFileSync(new URL("../WORLD/skeleton.json", import.meta.url), "utf8"));
  if (!sk.mists) return;   // a playground with the Mists off has nothing to ask
  const grounds = box(3850, -5500, 500, 400);   // darko/starforge-spire-grounds, the playground's Spire
  const centre = box(-54, -79, 2092, 2092);
  for (const c of [244, 272, 282]) {
    const at = mistsAt(c, sk.mists);
    if (c < 282) assert.ok(roomInMists(at, grounds)?.inWall, `the Grounds behind the wall at ${c}`);
    else assert.equal(roomInMists(at, grounds), null, `the Grounds clear at ${c}`);
    assert.equal(roomInMists(at, centre), null, `the Town Centre at ${c}`);
  }
});

test("[pin] indoors the page draws the surround, on the veil layer, and only for a room in the Mists", () => {
  assert.match(SOURCE, /if \(sceneRoomId\) \{ drawRoomMists\(\); return; \}/, "the room scene asks its own question");
  const fn = SOURCE.match(/function drawRoomMists\(\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(fn, /const fog = m && r \? roomInMists\(m, r\) : null;/);
  assert.match(fn, /paintMists\(null\);/, "no wall, paint, feather or bell indoors, as before");
  assert.match(fn, /if \(!fog\) \{ mapCtx\.veilLayer\.innerHTML = ""; return; \}/, "a room clear of the Mists is drawn as before");
  assert.match(fn, /bakeRoomSurround\(m, r, Math\.max\(box\.w, box\.h\) \* ROOM_GROUND_PAD, fog\)/, "over roomGround's own breathing room");
  assert.match(fn, /mapCtx\.veilLayer\.innerHTML = `<image class="wv-room-mists"/, "under the record, over the ground");
});
