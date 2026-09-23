// dwelling — "which mark is this parcel's dwelling", answered ONCE, for every
// reader of the record (POS-200, 2026-09-23).
//
// The rule is the record's own and it is arithmetic. It was written for the
// home-image backfill (tools/home-image-backfill.mjs, the 2026-08-21 ruling:
// "ADDRESS = parcel mark, HOME = home mark… the image rides the DWELLING, never
// the parcel") and it lived there alone. The viewer kept a SECOND answer —
// `homeMarkOfParcel`: any home-tier sited mark on the parcel, preferring one
// that carries a picture, first found wins — and on rei's ground that second
// answer was the Garden Notebook Tin (0.4 × 0.3 m, pictured) beside the
// Lanternstep House (12 × 12 m, pictured, standing at the parcel's centre). The
// card's title was moved off the guess on 09-20; the picture stayed on it, so
// the Lanternstep House's column wore the tin's photograph. Two rules for one
// question is how a name and a picture come to disagree. This file is the one.
//
// It lives beside the tool rather than inside it because the tool imports
// node:fs and the viewer runs in a browser: tools/*.mjs is the directory the
// viewer already imports its engine from, one flat file per concern, and the
// site stages whatever the viewer imports. Browser-pure; no imports.
//
// ── TWO READERS, TWO SPELLINGS OF ONE RECORD ────────────────────────────────
//
// The tool reads LOADER marks (tools/marks-fold.mjs `loadMarks`): each carries
// `_parentMarkId` (its directory parent) and `slug` (its directory leaf). The
// viewer reads the PUBLISHED fold (WORLD/world-state.json, or the office's
// /world/state): neither field is there. What is there is `placementParent`,
// which since 2026-08-25 is the fold's CONTAINMENT answer, not the directory
// edge (marks-fold.mjs, "IT CARRIES THE GROUND'S ANSWER NOW, NOT THE TREE'S").
// `asDwellingRecord` below is the one place a published row is spelled the
// tool's way: `placementParent` stands in for `_parentMarkId`, and the id's
// leaf for `slug` (an id IS `by/slug` — marks-fold.mjs sets it so).
//
// The two edges are not the same edge under two names, and the difference was
// measured rather than assumed (crossing 207, 93 parcels): the loader-native
// answer and the published-row answer agree on 88 and differ on 5 —
// berthillon/chez-antoine, errant/the-misfiled-annex-parcel,
// kogane/the-well-house-parcel, solan/casa-sol, nfh/the-amber-porch — and in
// every one of the 5 the directory edge REFUSES (the house is filed outside
// the parcel it stands in) while containment finds the house standing in its
// parcel. They never name two different houses. The tool keeps its own edge —
// its manifest must not move — and the viewer uses the only edge its record
// carries, which is also the one the fold now calls true.

/** A mark that can be a dwelling: sited, placed, and near enough to be drawn. */
export const isDwellingCandidate = (m) => m.kind === "sited" && m.at && !m.far;

/** The indexes the rule reads, built once over a list of marks. */
export function dwellingContext(marks = []) {
  const list = [...(marks ?? [])].filter(Boolean);
  const byId = new Map(list.map((m) => [m.id, m]));
  const sitedByHandle = new Map();
  for (const m of list) {
    if (!isDwellingCandidate(m) || !m.by) continue;
    if (!sitedByHandle.has(m.by)) sitedByHandle.set(m.by, []);
    sitedByHandle.get(m.by).push(m);
  }
  return { marks: list, byId, sitedByHandle };
}

// ── the join ────────────────────────────────────────────────────────────────
//
// "Which mark is this household's dwelling" is answered by the RECORD, in four
// layers, strongest evidence first. Every layer is arithmetic; none is a
// judgment; and where two of them can both answer they are checked against each
// other rather than silently ordered (see the falsifier that asserts they never
// disagree on the live record — 25 of 25 today).
//
//   1. THE PREDICATE. parcel-seed-gen.mjs (retired 2026-09-20 with the seeding
//      manifest it read) nested a `slot: home` predicate under
//      each parcel naming the house it grounds. That is the record saying which
//      mark this is, in words, and it wins when it is there. It is there for 26
//      of 58 parcels — the seeder gained it partway through — which is why the
//      layers below exist at all.
//   2. TREE CHILD AND CENTRE TOGETHER. The seeder centres a parcel on its home
//      (`at: home.at`), and the re-homing follow-up moved house dirs INSIDE
//      their parcels. So a sited mark that is both a direct child of the parcel
//      and sits at its exact centre is two independent facts agreeing, and it
//      is what resolves every household whose ground is crowded (rei has 24
//      sited marks and two at the parcel's centre; this picks the house, not
//      the pocket lantern inside it).
//   3. THE SOLE TREE CHILD, where a parcel has exactly one sited child of its
//      holder's.
//   4. THE SOLE MARK AT THE CENTRE, where the tree says nothing.
//
// The seeder's own warning is the one this inherits: "picking one is a
// judgment, not arithmetic." Two candidates and no agreeing evidence is a
// refusal, reported with both names.
export function homeMarkFor(parcel, { marks, byId, sitedByHandle }) {
  const own = sitedByHandle.get(parcel.by) ?? [];
  const at = (m) => m.at.x === parcel.at.x && m.at.y === parcel.at.y;

  const pred = marks.find((m) => m._parentMarkId === parcel.id && m.kind === "predicated" && m.slot === "home");
  if (pred?.value != null && String(pred.value).trim()) {
    const value = String(pred.value).trim();
    const byIdHit = byId.get(`${parcel.by}/${value}`);
    if (byIdHit && isDwellingCandidate(byIdHit)) return { mark: byIdHit, how: "the parcel's slot: home predicate" };
    // the seeder's documented drift: a manifest home_id and a directory leaf can
    // disagree (east-facing-window's home mark is the-cathedral-at-east-window)
    const bySlug = own.filter((m) => m.slug === value);
    if (bySlug.length === 1) return { mark: bySlug[0], how: "the predicate's value, matched by slug" };
  }

  const children = own.filter((m) => m._parentMarkId === parcel.id);
  const both = children.filter(at);
  if (both.length === 1) return { mark: both[0], how: "the parcel's own child, standing at its centre" };
  if (children.length === 1) return { mark: children[0], how: "the parcel's only sited child" };
  const centred = own.filter(at);
  if (centred.length === 1) return { mark: centred[0], how: "the only mark at the parcel's centre" };

  const why = children.length || centred.length
    ? `${children.length} sited child(ren) of the parcel and ${centred.length} at its centre — no single mark both, and picking one is a judgment`
    : "the parcel holds no sited mark of this household's — the dwelling was never planted";
  return { mark: null, how: null, why, candidates: [...new Set([...children, ...centred].map((m) => m.id))].sort() };
}

/** A PUBLISHED fold row, spelled the way the rule reads a loader mark — the one
 *  boundary between the two (see the header). A copy; the row is untouched. */
export function asDwellingRecord(row) {
  const id = String(row?.id ?? "");
  return {
    ...row,
    by: row?.by ?? row?.household,
    _parentMarkId: row?.placementParent ?? null,
    slug: id.slice(id.lastIndexOf("/") + 1),
  };
}

/** Every parcel's dwelling on a published fold: parcel id → the ROW the caller
 *  handed in (never the adapted copy), or null where the record cannot single
 *  one out — no dwelling, or the rule's refusal. A parcel with no place has no
 *  centre and answers null. Pure. */
export function dwellingsByParcel(rows = []) {
  const src = [...(rows ?? [])].filter((r) => r && r.id);
  const adapted = src.map(asDwellingRecord);
  const rowOf = new Map(adapted.map((a, i) => [a, src[i]]));
  const ctx = dwellingContext(adapted);
  const out = new Map();
  for (const p of adapted) {
    if (p.kind !== "parcel") continue;
    if (!p.at || !Number.isFinite(p.at.x) || !Number.isFinite(p.at.y)) { out.set(p.id, null); continue; }
    const found = homeMarkFor(p, ctx);
    out.set(p.id, found.mark ? rowOf.get(found.mark) : null);
  }
  return out;
}
