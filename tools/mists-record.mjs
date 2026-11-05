// mists-record.mjs — the Mists' one home in code (POS-466; tools/world-engine.mjs mistsAt).
//
// tools/world-terrain-gen.mjs writes this block into WORLD/skeleton.json, and
// tools/mists.test.mjs holds the committed skeleton to it, so a regenerate can
// never drop or drift it. Pinned here, never derived from the atlas or the
// record, so a regenerate writes the same wall and no past crossing is re-told.
// Every value is a dial, movable by ruling, never silently.
//
// ── THE WITHDRAWAL (WLD-147) ────────────────────────────────────────────────
// Darko, 2026-11-02 17:06 EST, in chat, RULED: "full removal for mists". From
// MISTS_WITHDRAWN_FROM on there are no Mists at all (mistsAt answers null).
//
// MISTS_WITHDRAWN_FROM IS THE ONE DIAL. Everything below that names the target
// crossing (the schedule's last two keyframes, `withdrawn_from`, the `_ruling`
// text) is derived from it by mistsRecordFor, and tools/mists-withdrawn.test.mjs
// proves the record for every target from 288 on. To move it: change the number
// here, then refresh the skeleton's `mists` block from MISTS (the PR that
// introduced it prints the one-line command). Pick the first crossing that has
// NOT opened by the time the new record reaches the readers: they take it with
// the next settlement tag (the sweep at 06:00Z or 18:00Z, then about an hour),
// and crossing N opens at 2026-06-12T00:00Z + N x 12 h.
export const MISTS_WITHDRAWN_FROM = 289;

// The last crossing the Mists had been told through when the withdrawal was
// written (S147's, build.json `crossing: 287`, 2026-11-02 21:57Z). A floor, not a
// clock: a target at or below it would re-tell a crossing that was told with Mists.
export const MISTS_TOLD_THROUGH = 287;

// The season's last STANDING keyframe: the wall at its fullest, and where the
// density finishes thickening. The withdrawal never moves either.
const SEASON_FULL_AT = 282;
const FRINGE_M = 400;
// The final keyframe pulls the front back PAST the border by more than the
// fringe (the fringe plus the 100 m the clearings are sized with), with no veil,
// so an engine that does not know `withdrawn_from` still reads no wall and no
// fringe anywhere on the map (the town's nearest mark stands 350 m inside the
// border; the town's own ground is all inside it).
const WITHDRAWN_FRONT_M = -(FRINGE_M + 100);

/** The Mists' record for a withdrawal at `withdrawnFrom`: the crossing from which there are none. */
export function mistsRecordFor(withdrawnFrom) {
  if (!Number.isInteger(withdrawnFrom)) throw new Error(`mistsRecordFor: the withdrawal crossing must be a whole number (got ${withdrawnFrom})`);
  if (withdrawnFrom <= MISTS_TOLD_THROUGH)
    throw new Error(`mistsRecordFor: withdrawing from crossing ${withdrawnFrom} would re-tell crossing ${MISTS_TOLD_THROUGH}, which was told with the Mists`);
  return {
    _ruling: "WORLD/ENGINE.md § The Mists (seasonal; POS-466, POS-468): a border band with a place. The wall stands at the border and creeps in on a crossing schedule; it occludes everything behind it, with no ceiling; its fringe shortens sight on the clear side; its veil dims every light. As it creeps in it may cover a household's marks, for the season (WLD-38, ruled 2026-10-12), and the household is to be told so on its doorstep; the clearings keep the ground the town sized them for; a clearing with a from_crossing keeps its ground only from that crossing on (WLD-134, Darko 2026-10-30). Before the schedule's first crossing there are no Mists and every telling is the one it always was. An entered mark is shelter: within it the Mists neither slow the walk nor hide what it holds (Darko 2026-10-15)."
      + ` WITHDRAWN (WLD-147; Darko, 2026-11-02 17:06 EST, in chat, RULED: "full removal for mists"; his ask at 16:59 EST: "now that the mists are kind of lingering, we do need to pare back on the ground that they cover. I actually have half an inkling to just remove the mists entirely as they were intended to just be a seasonal thing."): from crossing ${withdrawnFrom} there are no Mists at all. mistsAt answers null, so there is no wall, no fringe, no veil, no slowed walk and no season line, and every telling is the one it would be with no Mists in the record. Every crossing before it is told exactly as it was: the last standing keyframe (crossing ${SEASON_FULL_AT}, front 760 m, veil 0.5) is held through crossing ${withdrawnFrom - 1}, and the density keeps its own span. The keyframe at crossing ${withdrawnFrom} pulls the front back past the border with no veil, so an older engine that does not know withdrawn_from also reads no wall on the map. SUPERSEDED 2026-11-02 (WLD-147): "keep the mist as is" (WLD-142, Darko 2026-10-31 23:01 EDT), and this record's last keyframe holding for every crossing after it.`,
    border_m: { minX: -4600, minY: -4600, maxX: 5850, maxY: 9700, receipt: `on 2026-10-09: every parcel on the map (x -3302.5..4050, y -3312.5..8412.5) with the 400 m fringe, 100 m more and the 780 m creep outside it, and every household's mark (east to x 4940) with 100 m and the creep outside it, so at no keyframe does the wall reach a household's mark or the fringe a parcel; the last keyframe moved to 760 m on 2026-10-12 (S105) when bee/bee-pink-burrow was placed at x 4667, east of this sizing. SUPERSEDED 2026-10-12 (WLD-38): the Mists may cover a household's marks, so this sizing is no longer a promise that none is reached. Since WLD-147 (2026-11-02) that 760 m keyframe is the last STANDING one; the Mists are withdrawn from crossing ${withdrawnFrom}` },
    clearings_m: [
      { id: "pando", x: -95110, y: -95995, r_m: 10700, receipt: "Pando Peak keeps its own air: the smallest circle that holds every mark on its ground, the parcel, the peak and the Post Office's stop with them (r 10192.3 on 2026-10-09), widened by the 400 m fringe and 100 m more. The ride is its one link with the map" },
      { id: "the-far-southwest", x: -14000, y: 14000, r_m: 4250, receipt: "a household's parcel and its wetland, 15 km past the border: the smallest circle that holds the wetland (6000 x 4500 m, the parcel inside it) is 3750 m, widened by the 400 m fringe and 100 m more, so no part of either is in the wall or the fringe" },
      { id: "the-starforge-spire", x: 3850, y: -5500, r_m: 821, from_crossing: 282, receipt: "the Starforge Spire's grounds (wright/starforge-spire-grounds, 500 x 400 m at 3850, -5500), past the north border: the smallest circle that holds them is 320.2 m, widened by the 400 m fringe and 100 m more, so no part of them is in the wall or the fringe. Parted for Halloween (Darko, 2026-10-30)." },
      { id: "the-way-to-the-spire-1", x: 3850, y: -4263, r_m: 935, from_crossing: 282, receipt: "the way from the town's clear ground to the Starforge Spire's clearing, straight north along x 3850 since no road mark runs there: the smallest circle that holds a 200 m band from the clear ground's edge at the last keyframe (y -3840) to the Spire clearing's rim (y -4685.1) is 434.7 m, widened by the 400 m fringe and 100 m more, so no part of the band is in the wall or the fringe. Parted for Halloween (Darko, 2026-10-30)." },
    ],
    fringe_m: FRINGE_M,
    wall_sight_m: 20,
    // The density thickens over ITS OWN span, 244 to 282 (WLD-147). It used to ease over the whole
    // schedule, first keyframe to last; the withdrawal appends keyframes, and an easing that followed
    // the last one would stretch and so re-tell every crossing already told.
    density: { from: 0.55, to: 0.95, power: 2, from_crossing: 244, to_crossing: SEASON_FULL_AT, receipt: "thickens slowly at first and faster as the last crossing nears" },
    schedule: [
      { crossing: 244, front_m: 0, veil: 0.1 },
      { crossing: 272, front_m: 390, veil: 0.3 },
      // 780 → 760 (S105, 2026-10-12): a parcel placed after the border was sized (bee/bee-pink-burrow, x 4667)
      // touched the fringe at this keyframe only; 760 keeps every parcel clear by about 10 m. No past crossing is re-told.
      { crossing: SEASON_FULL_AT, front_m: 760, veil: 0.5 },
      // WLD-147: the wall HOLDS at the last standing keyframe through the last crossing before the withdrawal, so the
      // interpolation toward the withdrawal never moves a crossing already told.
      { crossing: withdrawnFrom - 1, front_m: 760, veil: 0.5 },
      // WLD-147: the withdrawal. The front is pulled back past the border by more than the fringe, with no veil.
      { crossing: withdrawnFrom, front_m: WITHDRAWN_FRONT_M, veil: 0 },
    ],
    // WLD-147: from this crossing mistsAt answers null: no Mists at all, whatever the schedule says after it.
    withdrawn_from: withdrawnFrom,
  };
}

export const MISTS = mistsRecordFor(MISTS_WITHDRAWN_FROM);
