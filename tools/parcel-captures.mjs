// parcel-captures.mjs — A PARCEL THAT NEWLY TAKES IN AN OLDER FOREIGN MARK, said to the Worldkeeper (WLD-224).
//
// Darko, 2026-11-20 15:48 EST: "isn't it just admit normally? and it gets flagged to the worldkeeper for coordination."
// Wright's reading (20:51Z): no change to the fold's admission or to containment. A new parcel laid over an older mark from
// another household is admitted, and the older mark files under it by geometry, as it always has. What is new is a FLAG: the
// crossing's report names both marks, both households and the overlap, so the keeper coordinates with both households (the
// La Ventanita mediation as the routine, not by chance). No refusal, no consent duty, no kept parent.
//
// THIS READS, AND DECIDES NOTHING. It takes the world the fold just wrote (WORLD/world-state.json's rows) and the ids this
// crossing published, and asks the question the fold already answered: which standing marks now file under a parcel this
// crossing published (`placementParent`, the one containment answer)? A capture is such a mark when
//   - it is from another household (the credential household, `declared_household`, the grain the fold's own laws read, never the
//     `by:` handle, and never who holds the mark or who wrote its words: ownership is the household the record names);
//   - and it is OLDER, by the first-laid instant (claim-instant.mjs: `claimed_at`, else `date`), strictly, both instants readable.
//     An amend does not make an elder mark young (Darko, 2026-10-07), so this is the first claim and not the latest date.
// consent.mjs's `cameAfter` is not used: its seniority excludes parcels (a parcel's interior is its holder's), and this question
// is asked of the parcel, not of a word on its ground.
//
// NEWLY: only a parcel published in THIS crossing, and standing in the folded world (a refused or unpublished candidate is not in
// it, so it is never reported as an event that completed), AND only a pair the crossing made. A parcel an ordinary amend republishes
// (its words, a picture) is "published" too, so publication alone is not new: `priorParentOf` is main's folded parent before this
// crossing (the sweep's `mainFolded`), and a mark that already filed under this parcel then is an unchanged pair, never an event.
// A parcel that is moved or resized and newly takes in an older mark IS still flagged. Nothing here is a census of the town and
// nothing backfills a closed case.
//
// ABSENT IS NOT EMPTY. `{ checked: false, why }` when the folded world could not be read; `{ checked: true, parcels_checked, events: [] }`
// when it was read and nothing was taken in, with how many new parcels it looked at.
import { claimInstant } from "./claim-instant.mjs";
import { marksOverlapArea, rect } from "./geometry.mjs";

const householdOf = (row) => row?.declared_household ?? row?.household ?? null;
const area = (row) => { const r = rect(row); return r.w * r.h; };
const round = (n) => Math.round(n * 100) / 100;

/**
 * @param {{ state: object|null, publishedIds: Iterable<string>, priorParentOf?: (id: string) => string|null }} input
 *   state: the parsed WORLD/world-state.json the fold just wrote; publishedIds: the ids this crossing published;
 *   priorParentOf: where a mark filed before this crossing (main's folded placementParent), null when it did not stand.
 * @returns {{ checked: boolean, why?: string, parcels_checked?: number, events?: object[] }}
 */
export function parcelCaptures({ state, publishedIds, priorParentOf = () => null }) {
  if (!state || !Array.isArray(state.marks)) return { checked: false, why: "the folded world could not be read, so nobody looked for a parcel taking in an older mark" };
  const refused = new Set((state.errors ?? []).map((e) => e?.mark).filter(Boolean));
  const fresh = new Set(publishedIds ?? []);
  const parcels = state.marks.filter((m) => m?.kind === "parcel" && fresh.has(m.id) && !refused.has(m.id));
  const events = [];
  for (const parcel of parcels) {
    const laid = Date.parse(String(claimInstant(parcel) ?? ""));
    for (const mark of state.marks) {
      if (mark.id === parcel.id || mark.placementParent !== parcel.id) continue;     // what files under it, by the fold's own containment
      if (priorParentOf(mark.id) === parcel.id) continue;                             // it filed under this parcel before this crossing: an unchanged pair
      const hh = householdOf(mark), parcelHh = householdOf(parcel);
      if (hh == null || parcelHh == null || hh === parcelHh) continue;                // another household's, by the credential grain
      const older = Date.parse(String(claimInstant(mark) ?? ""));
      if (!(Number.isFinite(older) && Number.isFinite(laid) && older < laid)) continue; // strictly older, both instants readable
      const overlap = marksOverlapArea(parcel, mark);
      events.push({
        parcel: parcel.id, parcel_household: parcelHh, parcel_by: parcel.by ?? null, parcel_laid: claimInstant(parcel) ?? null,
        mark: mark.id, mark_household: hh, mark_by: mark.by ?? null, mark_laid: claimInstant(mark) ?? null, mark_tier: mark.tier ?? null,
        overlap_m2: round(overlap), mark_area_m2: round(area(mark)),
      });
    }
  }
  events.sort((a, b) => a.parcel.localeCompare(b.parcel) || a.mark.localeCompare(b.mark));
  return { checked: true, parcels_checked: parcels.length, events };
}
