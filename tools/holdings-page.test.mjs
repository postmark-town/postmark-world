// holdings-page.test.mjs — LOGOS v2 part 2 on the World page (POS-678): the
// pure half of spectator/holdings.mjs, against the office's own answer shapes.
//
// The shapes are the office train's (train/2026-w43 @ dd226dbd):
//   - the close look at a mark: world-kinds.mjs § investigateMark, merged into
//     the apex's `focus` as { holder: { capacity, open }, holds: { holder,
//     count, class, shows, kinds } }, with kinds sharpened (kind-holding.mjs §
//     blurOf, sharp: true);
//   - a resident's close look: world-apex.mjs § investigateOn, `holds` (whole
//     things as mark ROWS { id, name, body }: world-investigate-entity.mjs,
//     pinned by the office's test/world-investigate-entity.test.mjs) and
//     `holds_by_kind`;
//   - your hands: world-hold.mjs § world_holdings, `holding: [{ thing }]` and `kinds`;
//   - the ground within reach: world-hold.mjs § groundRow, `holder` on a held thing;
//   - the say card: voices.mjs § conversations (`earshot_m`, `fade_minutes`,
//     `hearable_since`), and the say class's dials.
//
// ── THE CAN-FAIL FLIPS ─────────────────────────────────────────────────────
//   holderLines ignoring `kinds`                 → 1 reds
//   holderLines dropping holder.capacity/open    → 1 and 2 red
//   heldWords reading a holder thing as hands     → 4 reds
//   the viewer drawing a held thing at its holder → 5 reds (POS-688: never drawn)
//   handsLines counting holding.length            → 3b reds
//   a close look's holds read as bare ids         → 3 and 6b red (review-241 H3)
//   holderLines re-counting past a `whole` list    → 10 reds ("9 whole things" beside the office's 17)
//   holdingParts ignoring the hands read's `shows`  → 11 reds
//   sayCardNote with the old "five minutes"      → 7 reds
//   isThingKind reading only cls === "thing"     → 8 reds

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  holderLines, residentHoldLines, handsLines, holdingParts,
  heldWords,
  sayCardNote, isThingKind,
} from "../spectator/holdings.mjs";

// the second bowl, as sb-cleo's close look gave it (PART2-MCP-QA.md K2), with a bag in it
const BOWL_FOCUS = {
  id: "sb-ash/a-halloween-bowl", body: "A second pumpkin bowl.",
  holder: { capacity: 30, open: true },
  holds: { holder: "sb-ash/a-halloween-bowl", count: 5, class: "thing", shows: "5 things",
    kinds: [{ kind: "candy", count: 4, shows: "4 candies" }] },
  can: ["take", "give"],
  class_pointer: 'kind: halloween-candy-bowl · a thing · a sited — explain: "halloween-candy-bowl"',
};

test("1. a holder's card: the blurred headline, its sharpened kinds, its whole things and its room", () => {
  const lines = holderLines(BOWL_FOCUS);
  assert.deepEqual(lines.kinds, [{ kind: "candy", count: 4, shows: "4 candies" }]);
  assert.equal(lines.whole, 1, "the bag is the one the kinds do not cover");
  assert.equal(lines.capacity, 30);
  assert.equal(lines.open, true);
  const parts = holdingParts(lines);
  assert.equal(parts.head, "5 things · 5 of 30", "the office's blur, then its room");
  assert.deepEqual(parts.items, ["4 candies", "1 whole thing"]);
  assert.match(parts.open, /^open: other households may give into it and take from it$/);
});

test("2. a closed holder says so; an empty one says nothing is in it; a mark that holds nothing has no block", () => {
  const closed = holderLines({ holder: { capacity: 5, open: false }, holds: { holder: "sb-cleo/a-locked-satchel", count: 2, class: "candy", shows: "2 candies", kinds: [{ kind: "candy", count: 2, shows: "2 candies" }] } });
  assert.equal(holdingParts(closed).open, "closed: only its maker's household may give into it or take from it");
  assert.equal(holdingParts(closed).head, "2 candies · 2 of 5");
  const empty = holderLines({ holder: { capacity: 10, open: true }, holds: { holder: "sb-ash/a-small-pouch", count: 0, class: null, shows: "empty" } });
  assert.equal(holdingParts(empty).head, "nothing · 0 of 10");
  assert.deepEqual(holdingParts(empty).items, []);
  assert.equal(holderLines({ id: "the-town/a-tree", body: "a tree" }), null, "no holds, no holding block");
  assert.equal(holderLines({ error: "bounce" }), null);
  assert.equal(holdingParts(null), null);
});

test("3. a resident's hands: their whole things by name and their kinds; your own hands from world_holdings", () => {
  // the office's shape: each held thing a mark row, named as the record names it
  const inv = residentHoldLines({ handle: "sb-ash", holds: [{ id: "sb-ash/a-candy-bag", name: "A Candy Bag", body: "A bag for candy." }],
    holds_by_kind: { holder: "sb-ash", count: 1, class: "candy", shows: "1 candy", kinds: [{ kind: "candy", count: 1, shows: "1 candy" }] } });
  assert.equal(inv.count, 2);
  assert.deepEqual(inv.things, ["sb-ash/a-candy-bag"], "the row's id, never [object Object]");
  assert.deepEqual(holdingParts(inv).items, ["1 candy", "A Candy Bag"], "the office's name for it");
  assert.deepEqual(residentHoldLines({ handle: "sb-ash", holds: ["sb-ash/a-candy-bag"] }).things, ["sb-ash/a-candy-bag"], "a bare id still reads");
  assert.equal(residentHoldLines({ handle: "sb-ash", holds: { unavailable: "what they carry could not be read this time" } }), null,
    "an unreadable holding is no list, and no claim that they carry nothing");
  assert.equal(holdingParts(inv).head, "2 things", "kinds and whole things together are things");
  const mine = handsLines({ handle: "sb-cleo", count: 0, holding: [], kinds: { holder: "sb-cleo", count: 2, class: "candy", shows: "2 candies", kinds: [{ kind: "candy", count: 2, shows: "2 candies" }] } });
  assert.equal(holdingParts(mine).head, "2 candies", "the office's blur when kinds are the whole holding");
  assert.equal(holdingParts(handsLines({ holding: [], kinds: { count: 0, class: null, shows: "empty" } })).head, "nothing");
  assert.equal(handsLines({ error: "bounce", defect: "these are YOUR hands" }), null);
  assert.equal(residentHoldLines({ handle: "x" }), null, "a read that carried neither says nothing");
});

test("3b. your hands count what the door counted, not the page it sent (20 a page, 24 to carry)", () => {
  const page = Array.from({ length: 20 }, (_, i) => ({ thing: `sb-ash/thing-${i}` }));
  const lines = handsLines({ handle: "sb-ash", count: 23, shown: 20, limit: 20, offset: 0, complete: false, next_offset: 20, holding: page,
    kinds: { holder: "sb-ash", count: 1, class: "candy", shows: "1 candy", kinds: [{ kind: "candy", count: 1, shows: "1 candy" }] } });
  assert.equal(lines.count, 24, "23 whole things and 1 candy");
  assert.equal(lines.whole, 3, "the three the page did not list");
  assert.equal(holdingParts(lines).head, "24 things");
  assert.match(holdingParts(lines).items.at(-1), /^3 whole things$/);
});

// POS-688 (Darko 2026-10-18 20:58): a held thing is published but unplaced. The
// record says who holds it (`held_by`), the page draws it nowhere, and says whose
// hands it is in. The freshest-read-wins derivation these tests used to pin is gone:
// it was a second owner of "where is this thing".
test("4. whose hands, from the record's held_by: yours, a resident's, inside a holder thing, or nobody's", () => {
  const nameOf = (id) => ({ "sb-ash/a-halloween-bowl": "A Halloween Bowl" })[id] ?? id;
  assert.equal(heldWords("sb-ash", { self: "sb-ash", nameOf }), "in your hands");
  assert.equal(heldWords("sb-cleo", { self: "sb-ash", nameOf }), "in sb-cleo's hands");
  assert.equal(heldWords("sb-ash/a-halloween-bowl", { self: "sb-ash", nameOf }), "inside A Halloween Bowl");
  assert.equal(heldWords(null, { self: "sb-ash" }), null, "placed: nobody's hands");
  assert.equal(heldWords("", { self: "sb-ash" }), null);
});

test("5. THE PAGE DRAWS NO HELD THING: the viewer filters on the record's held_by, and keeps no derivation of its own", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  assert.ok(src.includes("return out.filter((m) => !heldBy(byId.get(m.id) ?? m));"), "a held thing is never drawn");
  for (const gone of ["carriersFrom", "carriedAt", "carriedWords", "carriedPlace", "carriers()", "residentList", "handsList"])
    assert.equal(src.includes(gone), false, `the page's own derivation is deleted: ${gone}`);
});

test("7. the say card's numbers are the office's: 60 m, drawn 15 minutes, heard until the settlement", () => {
  const conversations = { now: "2026-10-18T03:00:00Z", earshot_m: 60, fade_minutes: 15, hearable_since: "2026-10-17T22:00:00Z", close_minutes: 30, live: [], closed: [] };
  const note = sayCardNote({ conversations });
  assert.equal(note, "a voice carries 60 metres and stays drawn on the map for 15 minutes. everyone in earshot can hear it until the next settlement, nobody else does, and the town keeps its conversations browsable.");
  assert.doesNotMatch(note, /five minutes/);
  assert.match(sayCardNote({ dials: { earshot_m: 45, fade_min: { value: 20 } }, conversations }), /carries 45 metres .* for 20 minutes/,
    "the say card's own dials win where the palette carries them");
  assert.equal(sayCardNote({}), "a voice carries as far as earshot. everyone in earshot hears it, nobody else does, and the town keeps its conversations browsable.",
    "no read, no number");
});

test("8. a kind of thing is a thing, by the class chain or the office's class pointer", () => {
  assert.equal(isThingKind("thing"), true);
  assert.equal(isThingKind("halloween-candy-bowl", { pointer: BOWL_FOCUS.class_pointer }), true);
  assert.equal(isThingKind("halloween-candy-bowl", { chain: ["halloween-candy-bowl", "thing", "sited", "postmark-node"] }), true);
  assert.equal(isThingKind("portal-ground", { pointer: 'kind: portal-ground · a sited — explain: "portal-ground"' }), false);
  assert.equal(isThingKind("halloween-candy-bowl"), false, "with no lineage in hand, nothing is guessed");
});

test("9. ONLY A YES IS KEPT: a close look whose pointer names no thing never blocks the chain's answer (review-243 F2)", async () => {
  const { thingKindLedger } = await import("../spectator/holdings.mjs");
  const kinds = thingKindLedger();
  // the old-form Candy Bag's look, pointed at "sited", with no holder: not an answer
  kinds.fromLook("halloween-candy-bag", { class_pointer: 'kind: sited · a mark — explain: "sited"' });
  assert.equal(kinds.shouldAsk("halloween-candy-bag"), true, "the class chain is still asked");
  kinds.asking("halloween-candy-bag");
  assert.equal(kinds.shouldAsk("halloween-candy-bag"), false, "once");
  // explain: "halloween-candy-bag", as the office answers it
  kinds.fromChain("halloween-candy-bag", ["thing", "sited", "mark", "postmark-node"]);
  assert.deepEqual(kinds.things(), ["halloween-candy-bag"], "the chain decides: a thing");
  // a yes from a look stands, and a later chain cannot undo it
  const other = thingKindLedger();
  other.fromLook("a-satchel", { holder: { capacity: 5, open: false } });
  other.fromChain("a-satchel", ["sited", "mark"]);
  assert.deepEqual(other.things(), ["a-satchel"], "a holder is a thing's");
  // a chain that names no thing is the one "no" kept
  const plain = thingKindLedger();
  plain.fromChain("portal-ground", ["sited", "mark"]);
  assert.deepEqual(plain.things(), []);
  assert.equal(plain.shouldAsk("thing"), false, "thing itself is never asked");
});

test("10. counts confer up: the column reads the office's 17 and its whole things, never a count of its own (office hotfix w43.1)", () => {
  // the bowl's close look once the hotfix is live: 8 candies and a bag of 8, counted as the room counts them
  const lines = holderLines({ holder: { capacity: 30, open: true },
    holds: { holder: "sb-ash/a-halloween-bowl", count: 17, class: "thing", shows: "8 candies and A Candy Bag holding 8",
      kinds: [{ kind: "candy", count: 8, shows: "8 candies" }],
      whole: [{ thing: "sb-ash/a-candy-bag", name: "A Candy Bag", holds: 8, counts: 9 }],
      counting: "8 candies, A Candy Bag as 1 and the 8 it holds: 17 counted, as the room counts it (a holder counts 1 and everything it holds)" } });
  const parts = holdingParts(lines);
  assert.equal(parts.head, "8 candies and A Candy Bag holding 8 · 17 of 30", "the office's count and words");
  assert.deepEqual(parts.items, ["8 candies", "A Candy Bag holding 8"], "never \"9 whole things\" (17 less the 8 the kinds name)");
  // before the hotfix (no `whole` list) the read stands as it did: 9, and 1 whole thing
  const before = holdingParts(holderLines({ holder: { capacity: 30, open: true },
    holds: { holder: "sb-ash/a-halloween-bowl", count: 9, class: "thing", shows: "9 things", kinds: [{ kind: "candy", count: 8, shows: "8 candies" }] } }));
  assert.equal(before.head, "9 things · 9 of 30");
  assert.deepEqual(before.items, ["8 candies", "1 whole thing"]);
});

test("11. your hands in the office's own words: \"7 of 24 slots · 21 things in all\", printed verbatim (office #623 fix D)", () => {
  const hands = { slots: { used: 7, of: 24 }, in_all: 21, shows: "7 of 24 slots · 21 things in all" };
  const holding = [{ thing: "sb-ash/a-candy-bag" }, { thing: "sb-ash/a-lantern" }];
  const kinds = { holder: "sb-ash", count: 5, class: "candy", shows: "5 candies", kinds: [{ kind: "candy", count: 5, shows: "5 candies" }] };
  const read = handsLines({ handle: "sb-ash", count: 2, complete: true, holding, kinds: { ...kinds, hands }, hands });
  assert.equal(holdingParts(read).head, "7 of 24 slots · 21 things in all", "the office's sentence, whole");
  assert.deepEqual(holdingParts(read).items, ["5 candies", "sb-ash/a-candy-bag", "sb-ash/a-lantern"], "the kinds and whole things beside it, as before");
  // carried on kinds alone (a resident's close look rides it in holds_by_kind)
  const looked = residentHoldLines({ handle: "sb-ash", holds: holding.map((h) => ({ id: h.thing, name: h.thing, body: "" })), holds_by_kind: { ...kinds, hands } });
  assert.equal(holdingParts(looked).head, "7 of 24 slots · 21 things in all");
  // without it, today's line stands: the page counts nothing new
  const before = handsLines({ handle: "sb-ash", count: 2, complete: true, holding, kinds });
  assert.equal(holdingParts(before).head, "7 things");
  assert.equal(holdingParts(handsLines({ handle: "sb-ash", count: 0, holding: [], kinds: { count: 0, shows: "empty", hands: { shows: "  " } } })).head, "nothing",
    "a blank sentence is no sentence");
});
