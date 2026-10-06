// consent.mjs — the three-word `m`. ECONOMY.md §9.2's parent-consent coupling,
// collapsed from an integer on [-1,1] to the only three positions the town
// actually needs, and written as WORDS because a resident writes a word:
//
//     opposed  ·  (absent)  ·  welcomed
//
// A mark's frontmatter carries a `consent:` map from mark id to word:
//
//     consent: {"rei/the-white-flower-at-wrights-door": "welcomed"}
//
// A word is only ever spoken by whoever owns the ground or the parent — the
// parcel holder about what stands on their parcel, a mark's author about what
// stands inside their mark. Nobody may consent on another household's behalf.
//
// ── THE DEFAULT TABLE (what happens when nobody says anything) ────────────────
//
//   same credential household     +1  STRUCTURAL, automatic, never written down.
//                                     Ownership composes: an estate's own wing is
//                                     part of the estate. Recording a word here
//                                     would be a household asking itself for
//                                     permission. (GRAIN: credential household,
//                                     not resident handle — one person's several
//                                     handles are one household, so their marks
//                                     compose across handles.)
//
//   (there is no class law)           A region takes NOTHING by virtue of being a
//                                     region. The founder's ruling: regions are
//                                     ordinary marketplace marks, so a container
//                                     wanting the weight of what stands in it must
//                                     be BACKED like anything else, or be welcomed
//                                     in by the marks themselves. An earlier draft
//                                     gave the town's containers an automatic +1
//                                     from everything sited within; it is gone,
//                                     and nothing replaces it.
//
//   cross-household, no word       0  The mark exists on its own stamps. No
//                                     coupling either way: it lends its author's
//                                     weight to nobody, and nobody's weight props
//                                     it up. This is the resting state, and it is
//                                     why a resident's district does not silently
//                                     harvest a neighbour's beloved bench.
//
// ── THE TWO WORDS ────────────────────────────────────────────────────────────
//
//   welcomed   +1 fan-up across a cross-household edge, plus `kept: true` carried
//              onto the mark for renderers. Deliberately NOT symmetric: there is
//              no +1 fan-DOWN here. Whether a strong parent may lend density
//              downward is exactly ECONOMY.md §9.2's open concern 2 (the free
//              kingmaker) and is UNRULED — so this module does not build it.
//
//   opposed    the veto, and it has two very different strengths:
//
//              ON PARCEL GROUND it is ABSOLUTE. The domain is geometric
//              INTERSECTION with the parcel — ANY overlap, never the containment
//              tree. A neighbour's district that merely straddles the fence
//              answers the same law as a mark sitting wholly inside it, because
//              from the parcel holder's side those are the same intrusion. A
//              tree-keyed rule would let a claim dodge the whole law by being
//              slightly too big to be a child.
//
//              ON COMMONS TREE EDGES it is EARNED (§9.2's own arithmetic):
//                  child_eff = child_own − parent_density
//              and the child is returned only if that falls to zero or below. A
//              strongly-backed parent can veto a weak child; an unstaked parent's
//              veto moves nothing at all. Influence is proportional to backing,
//              so a veto has to be earned rather than merely asserted.
//
// ── RETURNED, NOT DROPPED ────────────────────────────────────────────────────
//
// A vetoed mark is RETURNED: it leaves the fold into a first-class `returned[]`
// output beside `errors[]`, naming the mark, the ground or parent it was returned
// from, and its state. Its subtree goes with it and every member is disclosed by
// name. There is no silent drop anywhere in this file — a resident whose mark
// stops appearing is owed the sentence saying why.
//
// ── THE ESCROW GUARD ─────────────────────────────────────────────────────────
//
// Escrow implies existence is already law (MARKS.md; the fold's retirement gate):
// "a mark is not retired until it hits 0 stamps." So a veto landing on a mark that
// carries open stakes — its own or anywhere in its subtree — records as
// `state: "pending-escrow"` and the mark STANDS until the stakes unwind. This is
// no new law, only the sequencing the existing one already implies.
//
// ── THE TOWN'S WORD (POS-361; Darko's rulings R7, R10, R15, 2026-10-04) ──────
//
// The town holds a third seat beside the parcel holder and the commons parent,
// and it speaks the residents' own words (Darko, 2026-10-06: one taxonomy): `neutral · opposed`
// declared, with silence as the awaiting state; its `welcomed` is adoption and is reserved,
// with neutral as absence (R15). Its words arrive as `townWords`, a map from
// mark id to word, fed by the settlement (it is a law act in the log, never
// a frontmatter map, so no mark carries it).
//
//   opposed    ALWAYS PREVAILS. R10: "implemented as infinite effective backing
//              for the town's marks in the veto comparison only (never in
//              fan-up, standing or any other use of density), so the existing
//              return path carries it." With infinite backing, the comparison
//              cannot fail, so a town opposition is a return with no arithmetic.
//              It takes the subtree and the escrow guard below, unchanged:
//              an opposed mark with open stakes stands until they unwind.
//
//   neutral    CONFERS NOTHING here (a DECLARED neutral). It clears the "awaiting the town" label
//              (a read's concern, not the fold's) and is not welcome: welcome
//              stays reserved for adoption (LOGOS the-response-function § the
//              town's declared word). So it does not keep, fan up, or lift a
//              holder's veto. Two holders, two words, one rule (R10): the
//              holder's opposition on their own parcel stands whatever the town
//              declared neutral.

export const CONSENT_FIELD = "consent";
export const CONSENT_WORDS = new Set(["opposed", "welcomed"]);
export const TOWN_WORDS = new Set(["neutral", "opposed"]);
/** The ground and the grantor a town return names. */
export const TOWN = "the-town";
// The consent map as authored, or null. Shared with the lint so both read a
// resident's word the same way.
export function consentMap(mk) {
  const raw = mk?.[CONSENT_FIELD];
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw;
}

const areaOf = (r) => Math.max((r?.w ?? 1) * (r?.h ?? 1), 1e-9);
const overlapsRect = (a, b) => {
  const dx = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
  const dy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
  return dx > 0 && dy > 0;
};

/**
 * resolveConsent({ byId, credOf, parcels, ownStamps, parentOf, rectOf })
 *
 *   byId      Map(id -> mark record)
 *   credOf    (handle) -> credential household key
 *   parcels   [{ id, household, _r }]  — the admitted parcels, as the fold builds them
 *   ownStamps Map(id -> own escrow on that mark)
 *   parentOf  Map(childId -> parentId)  — the computed containment edges
 *   rectOf    (mark) -> {x,y,w,h}
 *   townWords Map(id -> "neutral" | "opposed") or a plain object; optional —
 *             the town's standing word per mark (see § THE TOWN'S WORD)
 *
 * → { allow(parentId, childId), reason(parentId, childId), returned, kept, dropped, errors }
 */
export function resolveConsent({ byId, credOf, parcels, ownStamps, parentOf, rectOf, townWords = null }) {
  const errors = [];
  const kept = new Set();
  const words = new Map();      // `${grantorId} ${targetId}` -> word
  const wordKey = (g, t) => `${g} ${t}`;
  const own = (id) => ownStamps.get(id) ?? 0;
  const credOfMark = (mk) => credOf(mk?.household);

  // ---- read every authored word, once ----
  for (const mk of byId.values()) {
    const map = consentMap(mk);
    if (!map) continue;
    for (const [target, word] of Object.entries(map)) {
      if (!CONSENT_WORDS.has(word)) {
        errors.push({ mark: mk.id, error: `consent: "${target}" → ${JSON.stringify(word)} is not a word this world knows (${[...CONSENT_WORDS].join(" | ")}; absent is the third position and is written by saying nothing)` });
        continue;
      }
      words.set(wordKey(mk.id, target), word);
    }
  }

  // ---- the parcel domain: geometric intersection, owner's word absolute ----
  // Built here rather than at the edges because a parcel's authority does not run
  // along the tree at all: it runs over ground.
  const parcelVeto = new Map();     // targetId -> { parcel, grantor }
  for (const p of parcels) {
    const mk = byId.get(p.id);
    const map = consentMap(mk);
    if (!map) continue;
    const ownerCred = credOf(p.household);
    for (const [target, word] of Object.entries(map)) {
      if (!CONSENT_WORDS.has(word)) continue;               // already reported above
      const t = byId.get(target);
      if (!t) continue;                                     // the lint warns; the fold does not invent a mark
      if (credOfMark(t) === ownerCred) continue;            // a household does not consent to itself
      const tr = rectOf(t);
      if (!t.at || !overlapsRect(p._r, tr)) continue;       // a word with no ground under it
      if (word === "welcomed") { kept.add(target); continue; }
      parcelVeto.set(target, { parcel: p.id, grantor: p.household });
    }
  }

  // ---- the commons tree edge ----
  const edgeVeto = new Map();       // childId -> { parent, grantor, child_own, parent_density, child_eff }
  for (const [child, parent] of parentOf) {
    const word = words.get(wordKey(parent, child));
    if (!word) continue;
    const c = byId.get(child), p = byId.get(parent);
    if (!c || !p) continue;
    if (credOfMark(c) === credOfMark(p)) continue;          // structural +1 already; a word here is ignored (the lint warns)
    if (word === "welcomed") { kept.add(child); continue; }

    // §9.2's arithmetic, in densities, which is the unit §9.2 argues in
    // throughout ("a mark defends each cell it covers at effective-stamps/area").
    // The parent's strength is its OWN stamps, never its fan-up total: fan-up
    // would include the very child being vetoed, and the ruling is explicit that
    // an UNSTAKED parent's veto moves nothing.
    //
    // A predicated child has no extent of its own — it is its parent continued —
    // so it spreads over the parent's area, and the comparison reduces to the
    // plain one: does the child carry more stamps than the parent does.
    const parentArea = areaOf(rectOf(p));
    const childArea = c.at ? areaOf(rectOf(c)) : parentArea;
    const childOwn = own(child) / childArea;
    const parentDensity = own(parent) / parentArea;
    const childEff = childOwn - parentDensity;
    // `an unstaked parent's veto moves nothing` is its own clause, not a
    // consequence of the arithmetic: with nobody backing either side the
    // subtraction lands on exactly 0, and `≤ 0` would return the child on the
    // strength of a parent who has staked nothing at all. The veto has to be
    // EARNED, so an unbacked parent's word is simply a word.
    if (parentDensity > 0 && childEff <= 0)
      edgeVeto.set(child, { parent, grantor: p.household, child_own: childOwn, parent_density: parentDensity, child_eff: childEff });
  }

  // ---- the town's word: infinite backing, in the veto comparison only ----
  // A town opposition replaces any other veto on the same mark, because it
  // prevails: the return names the town, not a parcel or a parent.
  const townVeto = new Set();
  const townEntries = townWords instanceof Map ? [...townWords] : Object.entries(townWords ?? {});
  for (const [target, word] of townEntries) {
    if (!TOWN_WORDS.has(word)) {
      errors.push({ mark: target, error: `the town's word on "${target}" → ${JSON.stringify(word)} is not a word the town speaks (${[...TOWN_WORDS].join(" | ")}; silence is awaiting, and the town's welcomed is adoption, reserved)` });
      continue;
    }
    if (word !== "opposed" || !byId.has(target)) continue;  // a declared neutral confers nothing; the fold does not invent a mark
    townVeto.add(target);
    parcelVeto.delete(target);
    edgeVeto.delete(target);
  }

  // ---- returns, with the subtree and the escrow guard ----
  const children = new Map();
  for (const [c, p] of parentOf) { if (!children.has(p)) children.set(p, []); children.get(p).push(c); }
  const subtreeOf = (id) => {
    const out = [];
    const walk = (n, seen) => { for (const c of children.get(n) ?? []) if (!seen.has(c)) { seen.add(c); out.push(c); walk(c, seen); } };
    walk(id, new Set([id]));
    return out;
  };

  const returned = [];
  const dropped = new Set();
  const vetoed = [
    ...[...townVeto].map((id) => ({ id, kind: "town", ground: TOWN, grantor: TOWN, detail: null })),
    ...[...parcelVeto].map(([id, v]) => ({ id, kind: "parcel", ground: v.parcel, grantor: v.grantor, detail: null })),
    ...[...edgeVeto].map(([id, v]) => ({ id, kind: "commons", ground: v.parent, grantor: v.grantor,
      detail: { child_own: v.child_own, parent_density: v.parent_density, child_eff: v.child_eff } })),
  ].sort((a, b) => (a.id < b.id ? -1 : 1));

  for (const v of vetoed) {
    if (dropped.has(v.id)) continue;                        // already leaving with an ancestor
    const subtree = subtreeOf(v.id);
    const staked = [v.id, ...subtree].filter((id) => own(id) > 0);
    const entry = {
      mark: v.id,
      by: byId.get(v.id)?.household ?? null,
      returned_from: v.ground,
      authority: v.kind === "town" ? "the town (absolute)" : v.kind === "parcel" ? "parcel (absolute)" : "commons edge (earned)",
      grantor: v.grantor,
      subtree,
      state: staked.length ? "pending-escrow" : "returned",
      ...(v.detail ? { veto: v.detail } : {}),
      ...(staked.length ? { open_escrow_on: staked } : {}),
    };
    returned.push(entry);
    if (!staked.length) { dropped.add(v.id); for (const s of subtree) dropped.add(s); }
  }

  // ---- the edge table the fan-up asks ----
  const reason = (parentId, childId) => {
    const p = byId.get(parentId), c = byId.get(childId);
    if (!p || !c) return "none";
    if (credOfMark(p) === credOfMark(c)) return "structural";
    const w = words.get(wordKey(parentId, childId));
    if (w === "welcomed") return "welcomed";
    if (w === "opposed") return "opposed";
    return "neutral";
  };
  const allow = (parentId, childId) => {
    const r = reason(parentId, childId);
    return r === "structural" || r === "welcomed";
  };

  return { allow, reason, returned, kept, dropped, errors };
}
