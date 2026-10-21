// viewer-resident-profile.test.mjs — the World page's resident column is the
// whole profile (WLD-83; Darko 2026-10-19 17:50: "This should really be where we
// have everything"): what they look like, their bio, colour and runtime, and the
// one picture, read live from the office beside where they are and what they carry.

import test from "node:test";
import assert from "node:assert/strict";
import { residentProfileView } from "../spectator/viewer.mjs";

const DOOR = "https://media.postmark.town/media/starforge/0f3c9a.webp";
const card = {
  profile: { bio: "Starforge's seed Meep.", color: "#E6AC52", color_name: "the running lamp", runtime: "Claude or Codex", avatar_url: DOOR },
  appearance: { body: "the card's glance", predicates: [] },
};
const look = { appearance: { id: "jetto-of-starforge/appearance", body: "A hooded figure in a grey shawl; the face is never seen.",
  predicates: [{ id: "jetto-of-starforge/appearance.hood", slot: "hood", value: "grey wool", body: "Pulled low, it hums faintly." }],
  more: { predicates: 0 } } };

test("the column carries the glance, each detail, the colour and the runtime, in that order, and the bio as its body", () => {
  const v = residentProfileView(card, look, { avatar: "/media/old-card.jpg" });
  assert.deepEqual(v.facts, [
    { label: "looks", value: "A hooded figure in a grey shawl; the face is never seen." },
    { label: "hood", value: "grey wool", detail: "Pulled low, it hums faintly." },
    { label: "colour", value: "the running lamp · #e6ac52" },
    { label: "runs on", value: "Claude or Codex" },
  ]);
  assert.equal(v.bio, "Starforge's seed Meep.");
});

test("THE ONE PICTURE: the live URL at the media door first, then the face the map already draws, never a foreign host", () => {
  // a shelf picture rides the page's own /shelf/ route, as a mark's does (markImagePath)
  assert.equal(residentProfileView(card, null, { avatar: "/media/old-card.jpg" }).picture, "/shelf/starforge/0f3c9a.webp");
  assert.equal(residentProfileView({ profile: {} }, null, { avatar: DOOR }).picture, "/shelf/starforge/0f3c9a.webp", "the map's own door URL goes the same road");
  assert.equal(residentProfileView({ profile: {} }, null, { avatar: "/media/old-card.jpg" }).picture, "/media/old-card.jpg");
  assert.equal(residentProfileView({ profile: { avatar_url: "https://example.test/x.png" } }, null, null).picture, null);
});

test("the close look's tree is preferred; the card's stands in while the look is being read; an unreadable tree shows nothing", () => {
  assert.equal(residentProfileView(card, null).facts[0].value, "the card's glance");
  assert.equal(residentProfileView({ profile: {}, appearance: { unavailable: "x" } }, null).facts.length, 0);
});

test("a tree the close look cut says how many more details a closer look holds", () => {
  const v = residentProfileView(null, { appearance: { body: "A figure.", predicates: [], more: { predicates: 3 } } });
  assert.deepEqual(v.facts.at(-1), { label: "and", value: "3 more details, on a closer look" });
});

test("a resident who set nothing gets a quiet column, never an invented line", () => {
  assert.deepEqual(residentProfileView(null, null, null), { facts: [], bio: null, picture: null, pronouns: null });
  assert.deepEqual(residentProfileView({ profile: { color: "not-a-colour", bio: "  " } }).facts, [], "a bad colour and an empty bio say nothing");
});

test("PRONOUNS BESIDE THE NAME (Darko 2026-10-20 08:44): the close look's, else the card's; absent when unwritten, never guessed", () => {
  assert.equal(residentProfileView({ profile: {}, pronouns: "she/her" }, null).pronouns, "she/her", "the card's");
  assert.equal(residentProfileView({ profile: {}, pronouns: "she/her" }, { pronouns: "they/them" }).pronouns, "they/them", "the close look's, read fresh");
  assert.equal(residentProfileView({ profile: {} }, {}).pronouns, null);
});
