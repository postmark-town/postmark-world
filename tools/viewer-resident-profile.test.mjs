// viewer-resident-profile.test.mjs — the World page's resident column is the
// whole profile (WLD-83; Darko 2026-10-19 17:50: "This should really be where we
// have everything"): what they look like, their bio, colour and runtime, and the
// one picture, read live from the office beside where they are and what they carry.

import test from "node:test";
import assert from "node:assert/strict";
import { residentProfileView, DEFAULT_FACE_COLOR } from "../spectator/viewer.mjs";

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
    // until WLD-145 this line had no `swatch`: the colour was only words, and the column drew nothing
    { label: "colour", value: "the running lamp · #e6ac52", swatch: "#e6ac52" },
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

// ── THE COLOUR ITSELF (WLD-145, Darko 2026-11-01 19:18: "we also don't just SHOW the favorite color") ──

const colourFact = (v) => v.facts.find((f) => f.label === "colour");

test("THE SWATCH IS THE COLOUR THEY CHOSE: lowercased, three or six digits, and the words beside it do not change", () => {
  assert.equal(colourFact(residentProfileView({ profile: { color: "#E6AC52", color_name: "the running lamp" } })).swatch, "#e6ac52");
  assert.equal(colourFact(residentProfileView({ profile: { color: "c90" } })).swatch, "#c90", "a hex with no # is still the colour they chose");
  assert.equal(colourFact(residentProfileView({ profile: { color: "#E6AC52" } })).value, "#e6ac52", "the hex alone when there is no name");
});

test("A NAME ALONE HAS NO SWATCH, and a colour that is not a colour says nothing but its name", () => {
  const named = colourFact(residentProfileView({ profile: { color_name: "ember" } }));
  assert.equal(named.value, "ember");
  assert.equal("swatch" in named, false, "no key at all, not a null and not the default");
  for (const raw of ["not-a-colour", "red", "#abcd", "#abcde", "#12345g", "rgb(1,2,3)", "#fff;background:url(x)"]) {
    const line = colourFact(residentProfileView({ profile: { color: raw, color_name: "ember" } }));
    assert.equal(line.value, "ember", `only the name is said for: ${raw}`);
    assert.equal("swatch" in line, false, `not drawn: ${raw}`);
  }
});

test("NEVER THE MAP'S DEFAULT: a resident who chose nothing has no colour line and no swatch, whatever face the map gives them", () => {
  // the map draws a resident with no colour of their own in the town's gold (safeHexColor's
  // fallback); that gold must never be read as theirs
  const face = { avatar: null, color: DEFAULT_FACE_COLOR };
  const v = residentProfileView({ profile: { bio: "A figure." } }, null, face);
  assert.equal(colourFact(v), undefined, "no colour line");
  assert.equal(v.facts.some((f) => "swatch" in f), false, "and no swatch on any line");
  assert.equal(JSON.stringify(v).includes(DEFAULT_FACE_COLOR), false, "and the town's gold is nowhere in what the column is told");
  // ⚑ THE FLIP: `swatch: color ?? face?.color` in the colour line (or a swatch for a name alone) → these go red
});
