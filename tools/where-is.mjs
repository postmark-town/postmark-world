// where-is.mjs — ONE answer to "where is this resident", for every surface.
//
// Before this module there were four independent implementations of that
// question — the office's orient, the office's read_home, the office's walkers
// list, and the viewer's own client-side guess — and every position bug the town
// has had was two of them disagreeing:
//
//   · 2026-08-04 · read_home said vermillion was unplaced while the fold plainly
//     held his parcel, because read_home joined a one-time seeding snapshot and
//     orient joined the living fold. The viewer needs read_home's answer to set
//     an origin, so he could not walk anywhere at all.
//   · #1044 · the same shape on wren-winter.
//
// The cure is the one this codebase already uses everywhere else: the law lives
// in the engine and every surface imports it (see world.mjs's "THE LAW IS NOT
// HERE" and the office's thin-over-the-clone rule). Position simply never got
// that treatment. It has it now.
//
// TWO questions, deliberately distinct — conflating them is its own bug:
//   homeOf(handle)  — where do you LIVE. Per resident (POS-368): the home you
//                     declared, else your own parcel, else your household's
//                     first. Many residents share one parcel by default.
//   whereIs(handle) — where ARE you. Your walk if you have one, else your home,
//                     else the town's porch (see THE PORCH below).
//
// Pure: no fs, no git, no engine import — the caller supplies the folded world
// and the parsed ledger, exactly as walk.mjs takes a record and a clock. That is
// what lets the office, the spectator, and any clone all recompute the same
// answer without a second copy of the reasoning.

import { currentDeparture, positionAt, fractionalCrossing } from "./walk.mjs";

// The honest nowhere. A resident the record cannot place is NOT PLACED, and
// every caller must be able to tell that from a coordinate. The grid origin is
// the Origin, a real place; returning it for "unknown" is how a viewer
// ends up telling a dragon he is standing in the Town Centre.
export const NOWHERE = Object.freeze({
  x: null, y: null, placed: false, source: null, mark_id: null,
});

// THE PORCH. Ruled 2026-08-18 (Keemin): a resident with no walk and no ground
// stands at the quay — the town's porch — rather than nowhere at all.
//
// This does NOT retire the rule above; it is the reason that rule was written,
// served better. What the old comment forbids is a place SMUGGLED IN as an
// answer, and it is right to forbid it: the dragon read the Town Centre because
// nothing in the answer said "we are guessing". So the porch arrives DECLARED —
// `source: "quay"` and the quay's own mark id — and any caller that cared about
// the distinction can still make it, on a field rather than by inference.
//
// The alternative it replaces was not honesty, it was silence: the plural answer
// simply dropped everyone it could not place, so a third of the roll was absent
// from the town's own map with nothing anywhere saying so. A labelled default is
// legible; an omission is not.
//
// The coordinate is READ FROM THE RECORD, never held here. A world whose fold
// has no quay has no porch, and answers NOWHERE — refuse or disclose an absent
// input, never quietly substitute for it.
export const QUAY_MARK_ID = "the-town/the-quay";

export function porchOf(world) {
  const quay = (world?.marks ?? []).find((m) => m.id === QUAY_MARK_ID);
  if (!quay || !Number.isFinite(quay.at?.x) || !Number.isFinite(quay.at?.y)) return { ...NOWHERE };
  return { x: quay.at.x, y: quay.at.y, placed: true, source: "quay", mark_id: quay.id };
}

// A handle's household key, at the grain the town DECLARES.
//
// Ruled 2026-08-18: ground resolves at HOUSEHOLD grain. The vocabulary is the
// one the fold already consumes — the registry projection from the town's own
// resolver (tools/households-project.mjs), published back out as
// `world.households`. Asking it here rather than deriving a second answer is the
// whole point: a second resolver is how the four position implementations this
// module replaced came to disagree in the first place.
//
// A handle the registry does not know falls back to what it always did — the
// household its own marks carry, else the handle. Registry lag must never
// unplace anyone; it may only leave them ungrouped (households-project's law).
export function householdOf(handle, world) {
  const declared = world?.households?.[handle];
  if (declared) return declared;
  const own = (world?.marks ?? []).find((m) => m.by === handle && m.household);
  return own?.household ?? handle;
}

// The key a published parcel row answers to. Resolved the same way the READER
// is, through the same map, so the two sides of the comparison cannot be at
// different grains — which is the failure a second copy of the key on the row
// itself would have made possible.
const parcelKey = (parcel, world) => householdOf(parcel?.household, world);

// EVERY parcel the resident's household holds, the handle's own first.
//
// Plural because a household may hold several (the claim cap is 3, and the
// Reeves' four stand by exception) — and because the reading defect this fixes
// was exactly the assumption that a resident's ground is a resident's own.
//
// THE READING LAW IS NOT THE CLAIMING LAW. A resident holds at most one parcel
// and a household at most three (the-town/one-per-resident, the-town/claim-cap,
// Darko 2026-10-04). This changes who can READ ground, never who may hold it.
export function parcelsFor(handle, world) {
  if (!handle) return [];
  const parcels = world?.parcels ?? [];
  const key = householdOf(handle, world);
  const own = parcels.filter((p) => p.household === handle);
  const family = parcels.filter((p) => p.household !== handle && parcelKey(p, world) === key);
  return [...own, ...family];
}

// The one parcel a single-parcel caller means. Kept because most callers hold
// exactly one and should not have to know that plural is possible.
export function parcelFor(handle, world) {
  return parcelsFor(handle, world)[0] ?? null;
}

// ── HOMES ARE PER RESIDENT (Darko, 2026-10-04; Linear POS-368) ─────────────────
//
// The law: the-town/homes-per-resident and the-town/declared-home.
//
//   "The default for a resident should just be the household's parcel being
//    their home. A parcel shared by five housemates can be home to all five.
//    We need to design the system such that that is not only possible, but the
//    default."
//
// So a home belongs to a RESIDENT, never to a parcel, and nothing here picks a
// dwelling for anyone ("a guess with a good score is still a guess; the parcel
// is a fact"). In order:
//
//   1. DECLARED. The resident's own newest valid `slot: home` predicate — `by:`
//      the resident, filed under one of their household's parcels. Its `value`
//      is their own handle ("this parcel is my home") or the id of a sited mark
//      of theirs standing on that parcel ("this house is my home"). It belongs
//      to the resident, so five housemates may each declare on one parcel.
//   2. OWN. The resident's own parcel.
//   3. HOUSEHOLD. The household's first parcel in claim order (`world.parcels`
//      is the fold's claim order), said out loud as `via: "household"`.
//
// Prior estate under one-per-resident (`prior_estate: true` on the fold's
// parcel row — Sol's Driftlight House) is never anyone's home, by default or by
// declaration. A declaration that says nothing valid is skipped, and the answer
// names it (`declaration_refused`) rather than hiding it.
export const HOME_SLOT = "home";

const isPriorEstate = (parcel) => parcel?.prior_estate === true;

// A sited mark stands on a parcel when its centre is inside the parcel's square
// — the same point-in-rect the enter door asks, at the parcel's own extent.
function standsOn(mark, parcel) {
  const x = Number(mark?.at?.x), y = Number(mark?.at?.y);
  const px = Number(parcel?.at?.x), py = Number(parcel?.at?.y);
  const w = Number(parcel?.extent?.w ?? 25), h = Number(parcel?.extent?.h ?? 25);
  if (![x, y, px, py, w, h].every(Number.isFinite)) return false;
  return Math.abs(x - px) <= w / 2 && Math.abs(y - py) <= h / 2;
}

/** A resident's own home declarations, newest first (ties on id). */
export function homeDeclarationsOf(handle, world) {
  if (!handle) return [];
  return (world?.marks ?? [])
    .filter((m) => m?.kind === "predicated" && m.slot === HOME_SLOT && m.by === handle)
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")) || String(a.id).localeCompare(String(b.id)));
}

/** What one `slot: home` predicate declares — `{ parcel, mark }` — or why it
 *  declares nothing (`{ refused }`). Pure; reads only the published fold. */
export function readHomeDeclaration(pred, world) {
  const parcel = (world?.parcels ?? []).find((p) => p.id === pred?.parent) ?? null;
  if (!parcel) return { refused: "it stands on no parcel" };
  if (isPriorEstate(parcel)) return { refused: "that parcel is prior estate, never a home" };
  if (householdOf(parcel.household, world) !== householdOf(pred.by, world))
    return { refused: "that parcel is outside the resident's household (the-town/declared-home)" };
  const value = String(pred.value ?? "").trim();
  if (value === pred.by) return { parcel, mark: null };
  const mark = (world?.marks ?? []).find((m) => m.id === value) ?? null;
  if (!mark || mark.by !== pred.by || mark.kind !== "sited")
    return { refused: `its value names neither ${pred.by} nor a sited mark of ${pred.by}'s` };
  if (!standsOn(mark, parcel)) return { refused: `${mark.id} does not stand on ${parcel.id}` };
  return { parcel, mark };
}

// WHERE DO YOU LIVE. Deterministic, and it SAYS WHICH: `via` is "declared",
// "own" or "household"; `parcel_id` is always the ground; `home_mark` is the
// declared house, when the declaration names one. The point is the house's
// centre when a house is declared, else the parcel's centre (CALLS.md C2).
export function homeOf(handle, world) {
  const parcels = parcelsFor(handle, world);
  let declared = null;
  let refused = null;
  for (const pred of homeDeclarationsOf(handle, world)) {
    const read = readHomeDeclaration(pred, world);
    if (read.refused) { refused ??= { id: pred.id, why: read.refused }; continue; }
    declared = { ...read, id: pred.id };
    break;
  }
  const placedAt = (p) => Number.isFinite(p?.at?.x) && Number.isFinite(p?.at?.y);
  const parcel = declared?.parcel ?? parcels.find((p) => !isPriorEstate(p) && placedAt(p)) ?? null;
  const at = declared?.mark?.at ?? parcel?.at;
  if (!parcel || !Number.isFinite(at?.x) || !Number.isFinite(at?.y)) {
    return refused ? { ...NOWHERE, declaration_refused: refused } : { ...NOWHERE };
  }
  return {
    x: at.x, y: at.y, placed: true, source: "parcel",
    mark_id: declared?.mark?.id ?? parcel.id, parcel,
    parcel_id: parcel.id,
    home_mark: declared?.mark?.id ?? null,
    declaration: declared?.id ?? null,
    ...(refused && !declared ? { declaration_refused: refused } : {}),
    household: householdOf(handle, world),
    via: declared ? "declared" : parcel.household === handle ? "own" : "household",
    household_parcels: parcels.map((p) => p.id),
  };
}

// EVERY RESIDENT WHOSE HOME A PARCEL IS — many to one, by design. The roster is
// everyone the record can name: the registry's residents, every parcel's holder,
// and every resident who has declared. Computed once per world (the map asks it
// of every parcel on screen) and kept beside the world object.
const HOMES_OF_WORLD = new WeakMap();
export function homesByParcel(world) {
  if (world && typeof world === "object" && HOMES_OF_WORLD.has(world)) return HOMES_OF_WORLD.get(world);
  const roster = new Set([
    ...Object.keys(world?.households ?? {}),
    ...(world?.parcels ?? []).map((p) => p.household),
    ...(world?.marks ?? []).filter((m) => m?.kind === "predicated" && m.slot === HOME_SLOT).map((m) => m.by),
  ].filter(Boolean));
  const out = new Map();
  for (const handle of [...roster].sort()) {
    const home = homeOf(handle, world);
    if (!home.placed) continue;
    if (!out.has(home.parcel_id)) out.set(home.parcel_id, []);
    out.get(home.parcel_id).push({ handle, via: home.via, home_mark: home.home_mark, declaration: home.declaration });
  }
  // the holder first when it is home to them, then everyone else by handle
  for (const [parcelId, list] of out) {
    const holder = (world?.parcels ?? []).find((p) => p.id === parcelId)?.household;
    list.sort((a, b) => (b.handle === holder) - (a.handle === holder) || a.handle.localeCompare(b.handle));
  }
  if (world && typeof world === "object") HOMES_OF_WORLD.set(world, out);
  return out;
}

/** The residents whose home this parcel is, holder first. */
export function homesOnParcel(parcelId, world) {
  return homesByParcel(world).get(parcelId) ?? [];
}

// WHERE ARE YOU. A declared walk wins — it is the resident's own most recent
// statement about themselves — then the ground you live on, then the porch.
// `departures` is walk.mjs's parsed ledger; pass [] when a surface only cares
// about ground.
//
// THREE TIERS, one derivation, and each says which it is. Before this there were
// two tiers and a silence; the silence was the bug (see THE PORCH).
export function whereIs(handle, { world = null, departures = [], at = fractionalCrossing() } = {}) {
  const departure = currentDeparture(departures ?? [], handle);
  if (departure) {
    const p = positionAt(departure, at);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      return {
        x: p.x, y: p.y, placed: true, source: "walk",
        mark_id: departure.targetMarkId ?? null,
        position: p, departure,
      };
    }
  }
  const home = homeOf(handle, world);
  if (home.placed) return home;
  return porchOf(world);
}

// EVERY placed resident, in ONE list, in one vocabulary.
//
// There are not three kinds of resident. For a while the town published two
// lists and painted three colours — walking (pink), arrived (green), standing
// (grey) — and that was a category error worth naming, because "arrived" and
// "standing" are THE SAME STATE. Both are a person at rest at a place. What
// differed was only PROVENANCE: whether we learned the position from a walk
// record or from their parcel. We were rendering how-we-know as if it were
// what-they-are, so a resident who had never walked looked like a different
// species from one who had.
//
// So: one list, and exactly two states — `moving` or still. Provenance survives
// as `source` ("walk" | "parcel" | "quay") because it is honest and belongs in a
// tooltip; it just never decides what someone looks like.
//
// `source` IS THE HONESTY, so it must never be broader than what it claims. A
// resident standing on the porch because the record has nothing else to say
// about them reads `quay`, not `walk` — a placement is not an act its subject
// performed, and calling it one misattributes the act to them.
//
// `handles` is who to consider. Callers pass the roster they know (parcel
// households plus anyone with a walk record); this owns the shape, so the office
// door and the local spectator cannot drift apart the way they just did.
export function publicResidents(handles, { world = null, departures = [], at = fractionalCrossing() } = {}) {
  const seen = new Set();
  const out = [];
  for (const handle of handles ?? []) {
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    const here = whereIs(handle, { world, departures, at });
    if (!here.placed) continue;
    const p = here.position ?? null;
    const moving = Boolean(p && p.arrived === false);
    out.push({
      handle,
      x: here.x, y: here.y,
      source: here.source,          // how we know — never how it renders
      moving,
      toward: moving ? (here.departure?.toward ?? null) : null,
      remaining_m: moving ? p.remainingM : 0,
      eta_crossings: moving ? p.etaCrossings : 0,
      mark_id: here.mark_id ?? null,
    });
  }
  return out;
}

// One sentence naming where an answer came from, so no surface has to invent
// wording that might describe the camera in the grammar of a body.
export function sourceLabel(where, handle = "this resident") {
  if (!where?.placed) return `${handle} has no ground on the map yet`;
  if (where.source === "walk") {
    return where.position && where.position.arrived === false
      ? `the road — a walk in progress (${Math.round(where.position.remainingM)} m to go)`
      : "where the walk arrived";
  }
  // The porch says out loud that it is a default, because a reader who cannot
  // tell a default from a choice is the reader NOWHERE was written to protect.
  if (where.source === "quay") return `the quay — the town's porch, where the record places anyone it cannot yet place elsewhere`;
  if (where.via === "household") return `their household's ground (${where.mark_id})`;
  if (where.via === "declared") return `the home they declared (${where.mark_id})`;
  return `their ground (${where.mark_id})`;
}
