// viewer-column-views.test.mjs — the column's view builders both pages share (WLD-105 A14): columnHoldingFacts, markColumnParts,
// parcelColumnFields, regionColumnFields, creatureColumnFields and residentColumnParts, hoisted out of `mountViewer`'s closures.
//
// Each is held against the code it replaced: the closure's own lines (viewer.mjs at main dd3f9f3b) are written out below as the
// control, and the two must answer the same, on invented inputs, for every branch the closures had. The page's own closures are
// exercised through the real source in home-column.test.mjs (their bodies run against stand-ins, the shared builders real).
// Invented records only.
import assert from "node:assert/strict";
import test from "node:test";

import {
  columnHoldingFacts, markColumnParts, parcelColumnFields, regionColumnFields, creatureColumnFields, residentColumnParts,
  kickerOf, parcelCardLabel, parcelLeadImage, housePicture, markImagePath, creatureColumnFacts, creatureIcon,
} from "../spectator/viewer.mjs";
import { holdingParts, isThingId } from "../spectator/holdings.mjs";
import { homeHandleForParcel } from "../spectator/home-column.mjs";
import { instanceClassOf, ownedBy } from "../tools/mark-kind.mjs";
import { polygonBBox, polygonOf } from "../tools/geometry.mjs";

const nameOf = (m) => m.name ?? String(m.id).split("/").pop();

// ── the controls: the closures' bodies as they were ─────────────────────────
const oldHoldingFacts = (lines, label = "contents", nameOfId = (x) => x) => {
  const parts = holdingParts(lines, { nameOf: nameOfId });
  if (!parts) return [];
  return [{ label, value: parts.head }, parts.items.length ? { label: "by kind", value: parts.items.join(", ") } : null, parts.open ? { label: "open", value: parts.open } : null].filter(Boolean);
};
function oldMarkView(mark, { reading, law, holding, holder, icons, byId, ownedWord, ambient, holderEntry }) {
  const d = reading;
  const nameOfRel = (relative) => nameOf(byId.get(relative?.id) ?? relative);
  const rel = (list) => (list ?? []).filter((r) => r?.id).map((r) => ({ id: r.id, name: nameOfRel(r) }));
  const e = mark.extent;
  const what = icons.find((i) => i.kind === "what")?.key;
  const classSaid = !!what && what !== "place";
  const facts = [
    instanceClassOf(mark) && !classSaid ? { label: "class", value: String(instanceClassOf(mark)) } : null,
    ...((d?.predicates ?? []).map((p) => ({ label: p.slot ?? "property", value: String(p.value ?? ""), detail: typeof p.body === "string" ? p.body : null }))),
    law?.consequence ? { label: "at the door", value: law.consequence } : null,
    ownedBy(mark) ? { label: "owned by", value: ownedWord(ownedBy(mark)) } : null,
    ...oldHoldingFacts(holding, "contents", (x) => nameOf(byId.get(x) ?? { id: x })),
  ].filter(Boolean);
  const ring = polygonOf(mark), bb = ring ? polygonBBox(ring) : null;
  const footprint = e && e.w > 0 && e.h > 0 && !ambient ? { w: e.w, h: e.h, ring: bb ? ring.map((pt) => [pt.x - bb.minx, pt.y - bb.miny]) : null } : null;
  const relations = [
    { label: "held by", items: holder ? [isThingId(holder) ? { id: holder, name: nameOf(byId.get(holder) ?? { id: holder }) } : holderEntry(holder)] : [] },
    { label: "leads into", items: (law?.into ?? []).map((into) => ({ id: into, name: nameOf(byId.get(into) ?? { id: into }) })) },
    { label: "sits inside", items: rel(d?.parents) },
    { label: "holds", items: rel(d?.children), more: (d?.more?.children ?? 0) > 0 },
  ];
  return { facts, relations, footprint };
}

// ── columnHoldingFacts ──────────────────────────────────────────────────────
test("columnHoldingFacts: the holder's contents, kinds and open room, and nothing for a holder with no holding", () => {
  const lines = { count: 2, capacity: 5, open: 3, kinds: [{ shows: "lamp", count: 2 }], things: ["a/lamp"], names: new Map() };
  for (const label of [undefined, "carrying"]) {
    assert.deepEqual(columnHoldingFacts(lines, label, (x) => `<${x}>`), oldHoldingFacts(lines, label, (x) => `<${x}>`));
  }
  assert.deepEqual(columnHoldingFacts(null), []);
  assert.deepEqual(columnHoldingFacts(null), oldHoldingFacts(null));
  assert.ok(columnHoldingFacts(lines, "carrying", nameOf).some((f) => f.label === "carrying"), "premise: it says something");
});

// ── markColumnParts ─────────────────────────────────────────────────────────
const byId = new Map([
  ["inv/bag", { id: "inv/bag", name: "A Bag" }], ["inv/room", { id: "inv/room", name: "The Room" }], ["inv/door-to", { id: "inv/door-to", name: "Beyond" }],
  ["inv/kid", { id: "inv/kid", name: "A Kid" }],
]);
const holderEntry = (h) => ({ id: `walker:${h}`, name: `Who ${h}` });
const base = { byId, nameOf, holderEntry, ownedWord: (o) => (o === "me" ? "you" : o), ambient: false };
const MARKS = [
  { id: "inv/lamp", kind: "sited", at: { x: 1, y: 2 }, extent: { w: 4, h: 6 } },
  { id: "inv/ringed", kind: "sited", at: { x: 1, y: 2 }, extent: { w: 4, h: 6 }, points: [[0, 0], [4, 0], [4, 6], [0, 6]], owned_by: "me" },
  { id: "inv/flat", kind: "sited", at: { x: 1, y: 2 }, extent: { w: 0, h: 6 }, owned_by: "someone" },
  { id: "inv/classed", kind: "thing", class: "thing", at: { x: 1, y: 2 }, extent: { w: 2, h: 2 } },
];
const CASES = [
  {},
  { reading: { predicates: [{ slot: "color", value: "red", body: "a long red" }, { value: 3 }], parents: [{ id: "inv/room" }, {}, { id: "inv/unknown" }], children: [{ id: "inv/kid" }], more: { children: 2 } } },
  { law: { consequence: "it asks a toll", into: ["inv/door-to", "inv/nowhere"] } },
  { holding: { count: 1, capacity: 4, open: 3, kinds: [{ shows: "coin", count: 1 }], things: [] }, holder: "inv/bag" },
  { holder: "somebody" },
  { icons: [{ kind: "what", key: "lamp" }] }, { icons: [{ kind: "what", key: "place" }] },
  { ambient: true },
];
test("markColumnParts: the facts, the relations and the footprint the closure built inline, for every branch", () => {
  let n = 0;
  for (const mark of MARKS) for (const c of CASES) {
    const args = { reading: null, law: null, holding: null, holder: null, icons: [], ...base, ...c };
    assert.deepEqual(markColumnParts(mark, args), oldMarkView(mark, args), `${mark.id} ${JSON.stringify(Object.keys(c))}`);
    n++;
  }
  assert.equal(n, MARKS.length * CASES.length);
  // the pieces actually said something, so equality is not two empty answers
  const rich = markColumnParts(MARKS[1], { ...base, reading: CASES[1].reading, law: CASES[2].law, holding: CASES[3].holding, holder: "inv/bag", icons: [] });
  assert.ok(rich.facts.some((f) => f.label === "owned by" && f.value === "you"), "an own mark reads 'you'");
  assert.ok(rich.facts.some((f) => f.label === "color" && f.detail === "a long red"));
  assert.deepEqual(rich.relations.map((r) => r.label), ["held by", "leads into", "sits inside", "holds"]);
  assert.deepEqual(rich.relations[2].items.map((i) => i.id), ["inv/room", "inv/unknown"], "a relative with no id is dropped");
  assert.equal(rich.relations[3].more, true);
  assert.ok(rich.footprint?.ring, "a mark with a ring carries it, from its own corner");
  assert.equal(markColumnParts(MARKS[0], { ...base, ambient: true }).footprint, null, "an ambient mark has no footprint (2D's rule)");
  assert.equal(markColumnParts(MARKS[2], base).footprint, null, "a zero-width extent has none");
  assert.deepEqual(markColumnParts(MARKS[0], { ...base, holder: "somebody" }).relations[0].items, [holderEntry("somebody")], "a resident holder is the page's own link");
});

// ── parcelColumnFields ──────────────────────────────────────────────────────
test("parcelColumnFields: the fields the 2D closure and the 3D builder each wrote, and null with no handle", () => {
  const parcel = { id: "inv/the-garden-parcel", kind: "parcel", by: "inv-owner", household: "inv-house", at: { x: 0, y: 0 }, extent: { w: 25, h: 25 }, body: "A garden.", image: null };
  const home = { id: "inv/the-garden", kind: "sited", by: "inv-owner", at: { x: 0, y: 0 }, extent: { w: 5, h: 5 }, image: "https://media.postmark.town/media/x/abc.jpg" };
  const faceOf = (h) => ({ home: h === "inv-owner" ? { image: "https://media.postmark.town/media/x/face.jpg" } : null, name: h });
  const identityOf = (m) => `<<${m.id}>>`;
  const homes = [{ handle: "inv-owner", via: "holder", home_mark: home }, { handle: "inv-guest", via: "guest", home_mark: null }];
  const oldView = (homes) => {
    const h0 = homes[0]?.home_mark ?? null, handle = homes[0]?.handle ?? homeHandleForParcel(parcel, null);
    if (!handle) return null;
    return {
      handle, kicker: kickerOf(parcel, handle), title: parcelCardLabel(parcel, {}),
      leadImage: parcelLeadImage(parcel, h0, homes.length ? faceOf(handle).home : null), ownWords: parcel.body ?? null,
      residents: homes.map((h) => ({ handle: h.handle, via: h.via, picture: housePicture(faceOf(h.handle).home, h.home_mark), house: h.home_mark ? identityOf(h.home_mark) : null })),
    };
  };
  const got = parcelColumnFields(parcel, { homes, determined: {}, faceOf, identityOf });
  assert.deepEqual(got, oldView(homes));
  assert.equal(got.handle, "inv-owner"); assert.equal(got.residents.length, 2); assert.equal(got.residents[0].house, "<<inv/the-garden>>"); assert.equal(got.residents[1].house, null);
  assert.deepEqual(parcelColumnFields(parcel, { homes: [], determined: {}, faceOf, identityOf }), oldView([]), "no homes: the handle the parcel itself tells, else null");
});

// ── regionColumnFields ──────────────────────────────────────────────────────
test("regionColumnFields: the door's page when it answers and says something, the mark's words otherwise; null without a founder", () => {
  const mark = { id: "inv-founder/the-headland", kind: "sited", by: "inv-founder", household: "inv-founder", name: "The Headland", body: "  A headland. " };
  const oldView = (m, got) => {
    const handle = String(m.by ?? m.household ?? "").trim(); if (!handle) return null;
    const slug = String(m.id ?? "").split("/")[1] ?? "", body = typeof m.body === "string" ? m.body.trim() : "";
    const page = got && !got.failed && String(got.description ?? "").trim() ? got : null;
    const founder = String(page?.founder || handle).trim(), doorName = String(page?.name ?? "").trim();
    return { page, handle, kicker: "Region", title: doorName && doorName !== slug ? doorName : nameOf(m), region: `held by ${founder}`, leadImage: markImagePath(m),
      door: { description: page ? page.description : body }, byline: page ? `in ${founder}'s own words` : `from the mark, in ${handle}'s own words` };
  };
  const answers = [undefined, { failed: true }, { pending: true }, { description: "   " }, { description: "The page.", name: "the-headland", founder: "" },
    { description: "The page.", name: "The Headland, Proper", founder: "inv-other" }, { description: "The page.", name: "", founder: "inv-other" }];
  for (const got of answers) assert.deepEqual(regionColumnFields(mark, { got, nameOf }), oldView(mark, got), JSON.stringify(got));
  assert.equal(regionColumnFields(mark, { got: answers[5], nameOf }).title, "The Headland, Proper");
  assert.equal(regionColumnFields(mark, { got: answers[4], nameOf }).title, "The Headland", "a door name that is only the slug loses to the map's own name");
  assert.equal(regionColumnFields(mark, { got: answers[2], nameOf }).byline, "from the mark, in inv-founder's own words", "pending is not an answer");
  assert.equal(regionColumnFields({ ...mark, by: "", household: "" }, { got: undefined, nameOf }), null);
});

// ── creatureColumnFields ────────────────────────────────────────────────────
test("creatureColumnFields: what it is, its kind, its doings, moods and lately, as the closure built them", () => {
  const row = { id: "creature:raven-1-1", kind: "raven", name: "a raven", x: 1, y: 2 };
  const oldView = (id, c, read) => {
    const { facts, lately, bars } = creatureColumnFacts(c, read?.inv ?? null);
    const name = String(c?.name ?? read?.inv?.name ?? id);
    return { handle: "the-town", residentLink: false, kicker: "a creature", title: name.charAt(0).toUpperCase() + name.slice(1), leadImage: null,
      door: { description: read?.inv?.what_it_is ?? (read?.at ? "" : "reading the creature…") }, facts: [...facts, ...lately], bars, icons: [creatureIcon()] };
  };
  const reads = [null, { at: 5, inv: null }, { at: 5, inv: { name: "an inv name", what_it_is: "a black bird", kind: "raven" } }, { at: 0, inv: { name: "only the read's name" } }];
  for (const read of reads) for (const c of [row, null]) {
    if (!c && !read?.inv) continue; // the page returns no view for these
    assert.deepEqual(creatureColumnFields(row.id, c, read), oldView(row.id, c, read), `${c ? "live" : "gone"} ${JSON.stringify(read)}`);
  }
  assert.equal(creatureColumnFields(row.id, row, null).title, "A raven");
  assert.equal(creatureColumnFields(row.id, row, null).door.description, "reading the creature…");
  assert.equal(creatureColumnFields(row.id, row, reads[2]).door.description, "a black bird");
});

// ── residentColumnParts ─────────────────────────────────────────────────────
test("residentColumnParts: what they carry (or the placeholder while their hands are read) and the whole things as relations", () => {
  const lines = { count: 2, capacity: 9, open: 7, kinds: [{ shows: "coin", count: 2 }], things: ["inv/bag", "inv/kid"], names: new Map([["inv/bag", "Their Bag"]]) };
  const nameOfId = (x) => nameOf(byId.get(x) ?? { id: x });
  const oldView = (lines, looked) => ({
    carrying: lines ? oldHoldingFacts({ ...lines, things: [] }, "carrying", nameOfId) : looked ? [] : [{ label: "carrying", value: "reading their hands…" }],
    relations: (lines?.things ?? []).length ? [{ label: "whole things", items: lines.things.map((t) => ({ id: t, name: lines.names?.get(t) ?? nameOfId(t) })) }] : [],
  });
  for (const [l, looked] of [[lines, false], [lines, true], [null, false], [null, true], [{ ...lines, things: [] }, false]]) {
    assert.deepEqual(residentColumnParts(l, { looked, nameOf: nameOfId }), oldView(l, looked), `${l ? "lines" : "none"} looked=${looked}`);
  }
  const got = residentColumnParts(lines, { looked: false, nameOf: nameOfId });
  assert.deepEqual(got.relations[0].items, [{ id: "inv/bag", name: "Their Bag" }, { id: "inv/kid", name: "A Kid" }], "the line's own name for a thing, else the page's");
  assert.deepEqual(residentColumnParts(null, { looked: false, nameOf: nameOfId }).carrying, [{ label: "carrying", value: "reading their hands…" }]);
  assert.deepEqual(residentColumnParts(lines, { nameOf: nameOfId, thingEntry: (id) => ({ id: `r:${id}`, name: id }) }).relations[0].items[0], { id: "r:inv/bag", name: "inv/bag" }, "a page may link a thing its own way");
});
