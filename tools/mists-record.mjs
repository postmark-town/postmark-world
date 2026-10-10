// mists-record.mjs — the Mists' one home in code (POS-466; tools/world-engine.mjs mistsAt).
//
// tools/world-terrain-gen.mjs writes this block into WORLD/skeleton.json, and
// tools/mists.test.mjs holds the committed skeleton to it, so a regenerate can
// never drop or drift it. Pinned here, never derived from the atlas or the
// record, so a regenerate writes the same wall and no past crossing is re-told.
// Every value is a dial, movable by ruling, never silently.
export const MISTS = {
  _ruling: "POS-466, ruled by Darko 2026-10-09 (LOGOS/classes.md § The emission lines): a border band with a place. The wall stands at the border and creeps in on a crossing schedule; it occludes everything behind it, with no ceiling; its fringe shortens sight on the clear side; its veil dims every light. No household's parcel is covered, but the one ruled under. Before the schedule's first crossing there are no Mists and every telling is the one it always was.",
  border_m: { minX: -4600, minY: -4600, maxX: 5850, maxY: 9700, receipt: "on 2026-10-09: every parcel on the map (x -3302.5..4050, y -3312.5..8412.5) with the 400 m fringe, 100 m more and the 780 m creep outside it, and every household's mark (east to x 4940) with 100 m and the creep outside it, so at no keyframe does the wall reach a household's mark or the fringe a parcel" },
  clearings_m: [
    { id: "pando", x: -95110, y: -95995, r_m: 10700, receipt: "Pando Peak keeps its own air (Darko, 2026-10-09 22:00): the smallest circle that holds every mark on its ground, the parcel, the peak and the Post Office's stop with them (r 10192.3 on 2026-10-09), widened by the 400 m fringe and 100 m more. The ride is its one link with the map" },
    { id: "the-far-southwest", x: -14000, y: 14000, r_m: 4250, receipt: "a household's parcel and its wetland, 15 km past the border: the smallest circle that holds the wetland (6000 x 4500 m, the parcel inside it) is 3750 m, widened by the 400 m fringe and 100 m more, so no part of either is in the wall or the fringe" },
  ],
  fringe_m: 400,
  wall_sight_m: 20,
  density: { from: 0.55, to: 0.95, power: 2, receipt: "thickens slowly at first and faster as the last crossing nears" },
  schedule: [
    { crossing: 244, front_m: 0, veil: 0.1 },
    { crossing: 272, front_m: 390, veil: 0.3 },
    { crossing: 282, front_m: 780, veil: 0.5 },
  ],
};
