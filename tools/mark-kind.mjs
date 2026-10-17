// mark-kind.mjs — WHAT A RECORD IS, AND HOW IT STANDS, IN EITHER FORM (LOGOS v2 part 2, W2).
//
// LOGOS/classes.md § The LOGOS ladder (ruled 2026-10-16 16:02): "`kind` is a
// flat field naming the node's own class … The `class:` field folds into
// `kind`: a class node's name is its own slug, so `kind: candy` names
// `the-town/candy`." A thing that wrote `kind: sited` + `class: thing` writes
// `kind: thing` now.
//
// Both forms are read, always: the old form is every store folded before the
// migration, every record a door wrote before its own readers moved, and every
// fixture. One home for the two questions every reader asks, so no reader
// spells either form out for itself:
//
//   instanceClassOf(m)  the class an instance names — its `class:` in the old
//                       form, its `kind:` in the new; undefined for a plain
//                       sited mark, a parcel, a predicate or a naming written
//                       with their standing word, and for class and property
//                       nodes (they ARE class space; their name is `class:`).
//   isSited(m)          it stands on the ground as a sited mark: it carries a
//                       place, and it is none of the kinds that never do. The
//                       lint holds every non-ground kind to no `at` (a
//                       predicate takes its parent's locus, a class or a
//                       property has no where, a post stands nowhere), so the
//                       place is the answer and no class tree is needed to ask.
//   isGround(m)         sited, or a parcel with its place: what can contain.
//
//   standingOf(m, idx)  how the record stands, asked of its CLASS CHAIN (G12,
//   isSitedIn(m, idx)   settled 2026-10-17: "the fold is the record"). The fold
//   isGroundIn(m, idx)  asks these, with the class index of the marks it folds
//                       (kindIndexOf), so its geometry follows the lineage even
//                       where a place and a chain disagree. isSited and isGround
//                       stay the place-proxy for readers with no class index
//                       (the viewer, the verbs over a store slice); they agree
//                       with the chain wherever the lint holds (G13).
//
// Browser-pure: the viewer and the store readers ask through it too.

import { classIndex, classChain } from "./class-properties.mjs";

/** The standing words `kind:` wrote before it named the class, and the node kinds. */
export const STANDING_WORDS = Object.freeze(new Set(["sited", "predicated", "predicate", "naming", "parcel", "class", "property", "post"]));

const NEVER_GROUND = new Set(["predicated", "predicate", "naming", "class", "property", "parcel"]);

export function instanceClassOf(m) {
  if (!m || m.kind === "class" || m.kind === "property") return undefined;
  if (m.class !== undefined) return String(m.class);
  return m.kind != null && !STANDING_WORDS.has(String(m.kind)) ? String(m.kind) : undefined;
}

export const isSited = (m) => !!m && !!m.at && !NEVER_GROUND.has(String(m.kind));

export const isGround = (m) => !!m && !!m.at && (m.kind === "parcel" || isSited(m));

/** A claim standing under a mark, in either spelling: `kind: predicate` names the
 *  class (G10, settled 2026-10-17); `kind: predicated` is the standing word it
 *  replaced, which every store folded before it, and every door that writes it
 *  until its readers move, still carries. A naming is a predicate too, as the
 *  class tree says (naming extends predicate) and the site's helper reads it.
 *  It is asked of the record's kind, so a class or property node (kind: class,
 *  kind: property), the predicate class's own declaration included, never is. */
const PREDICATE_KINDS = new Set(["predicated", "predicate", "naming"]);
export const isPredicate = (m) => PREDICATE_KINDS.has(m?.kind);

// ── the chain's answer (G12) ─────────────────────────────────────────────────

const INDEXES = new WeakMap();
/** The class index of a set of marks (an array, cached; a Map's values, fresh). */
export function kindIndexOf(marks) {
  if (Array.isArray(marks)) {
    if (!INDEXES.has(marks)) INDEXES.set(marks, classIndex(marks));
    return INDEXES.get(marks);
  }
  return classIndex(marks instanceof Map ? [...marks.values()] : [...(marks ?? [])]);
}

/**
 * How a record stands: "sited", "parcel", "predicate", "naming", "post",
 * "class", "property", or null (an instance of a class under none of them).
 *   - A standing word still answers for itself (`kind: sited`, `kind: parcel`,
 *     and a post class's instances, which keep their old form until the post
 *     lane: WLD-73 G7).
 *   - A kind that names a class is answered by that class's chain, when the
 *     chain reaches the root. Only a chain that cannot answer (no class nodes
 *     in hand, or a fixture's partial tree) falls back to the record's place.
 */
export function standingOf(m, idx) {
  if (!m) return null;
  const kind = m.kind == null ? null : String(m.kind);
  if (kind === "class" || kind === "property") return kind;
  if (kind === "naming") return "naming";
  if (kind === "predicated" || kind === "predicate") return "predicate";
  if (kind == null) return null;
  if (STANDING_WORDS.has(kind)) return kind;
  const chain = idx ? classChain(idx, kind).map((c) => String(c.class)) : [];
  if (!chain.includes("postmark-node")) return m.at ? "sited" : null;
  for (const s of ["post", "naming", "predicate", "parcel", "sited"]) if (chain.includes(s)) return s;
  return null;
}

export const isSitedIn = (m, idx) => !!m?.at && standingOf(m, idx) === "sited";
export const isGroundIn = (m, idx) => {
  if (!m?.at) return false;
  const s = standingOf(m, idx);
  return s === "sited" || s === "parcel";
};
