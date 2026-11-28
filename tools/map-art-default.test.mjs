// map-art-default.test.mjs: a mark's card shows its picture by default.
//
// Darko, 2026-11-18, on little-bird's bug post: a clicked mark's card shows its
// picture without ?mark-art=on, and ?mark-art=off turns it off (WLD-202). The
// card only: whether a picture hangs on the ground is the placed_art_min_m dial.
// Before that, the default below was off:
//
// Founder, 2026-08-21: "just by default, let's NOT load these images in for
// let-there-be-light for now." A DEFAULT, not an amputation — the machinery
// stays and one switch turns it back on.
//
// The claim is about what the page ASKS FOR, so it is asserted on the fetch
// surface — the markup that would carry a URL — and never on pixels.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { markArtOnMap, MARK_ART_PARAM, markImageURL, markImagePath, roomGround, sceneArtSVG, placeholderExtentSVG } from "../spectator/viewer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "..", "spectator", "viewer.mjs"), "utf8");

test("THE DEFAULT IS ON (Darko, 2026-11-18), and the switch turns it off: both directions", () => {
  assert.equal(markArtOnMap(""), true, "no query string at all: on");
  assert.equal(markArtOnMap("?crossing=141"), true, "an unrelated query: on");
  assert.equal(markArtOnMap(null), true, "and nothing at all is on");
  assert.equal(markArtOnMap(`?${MARK_ART_PARAM}=off`), false, "the switch: off");
  assert.equal(markArtOnMap(`?a=1&${MARK_ART_PARAM}=off&b=2`), false, "the switch, among others");
  // a switch that answers no to anything is not a switch
  assert.equal(markArtOnMap(`?${MARK_ART_PARAM}=on`), true, "the old spelling still reads as on");
  assert.equal(markArtOnMap(`?${MARK_ART_PARAM}=`), true);
  assert.equal(markArtOnMap(`?${MARK_ART_PARAM}=false`), true, "one spelling, so the default cannot be turned off by accident");
});

test("[pin] THE GATE IS IN THE MARKUP: no figure is emitted, so no picture is ever asked for", () => {
  // hydrateMarkImages mounts from `.wv-mark-image[data-image-for]` figures. A
  // gate in the hydrate would still have emitted the figure and left the next
  // caller free to mount it; gating the cell means the URL never reaches the
  // document at all.
  assert.match(SOURCE, /cardArt && markImageURL\(full\) \? `<figure class="wv-mark-image"/,
    "the cell's figure is gated on the map-art switch");
  assert.match(SOURCE, /const cardArt = markArtOnMap\(\);/,
    "and the gate is read per cell, from the one place that answers the question");
});

test("[pin] INTERIORS STILL PAINT THEIR ART — the room's ground and the things standing in it are untouched", () => {
  const SHELF = "https://media.postmark.town/media/keeminlee/70c2f03d0bcdd54ca117e8fa3c9d9dcf7ee7bc176f58cec0116b281b4f188de6.jpg";
  const room = { id: "wright/the-trueing-house", kind: "sited", by: "wright", at: { x: 0, y: 0 }, extent: { w: 12, h: 12 }, image: SHELF };

  // the entered room's ground — the founder's own acceptance shape
  const ground = roomGround(room, { image: markImagePath(room) });
  assert.match(ground.svgText, /<image href="\/shelf\//, "the room ground still paints the household's art");

  // and the art hung on what stands inside it
  const px = (p) => ({ x: p.x, y: p.y });
  assert.match(sceneArtSVG(room, px), /<image href="\/shelf\//, "scene art still hangs");
  assert.equal(placeholderExtentSVG(room, px), "", "and an art-bearing mark still yields to its art rather than a placeholder");

  // neither of those two surfaces consults the map switch — they are reached
  // only from a mounted ROOM, so "the map loads none" is which surface asks,
  // not a state test at render time
  assert.match(SOURCE, /placeholderExtents: true,\s*\/\//, "the scene art is gated by the room's own scene flag");
  assert.doesNotMatch(SOURCE, /markArtOnMap\(\)[\s\S]{0,80}roomGround/, "the room ground does not consult the map switch");
});

test("THE LIVE RECORD: with the default on, the map's cells would have asked for real shelf URLs — so the gate is load-bearing", () => {
  // A gate over an empty record proves nothing. The record really does carry
  // art now (63 marks as of the 08-21 fold). Since 2026-11-18 every one of
  // those is a picture its card asks for by default.
  const marks = loadMarks(join(HERE, "..", "WORLD/marks")).filter((m) => !m._error);
  const withArt = marks.filter((m) => markImageURL(m));
  assert.ok(withArt.length >= 40, `expected the record to carry real art; found ${withArt.length}`);
  for (const m of withArt.slice(0, 5)) assert.match(markImageURL(m), /^https:\/\/media\.postmark\.town\/media\//);
});
