// mists-keep.mjs — the town's keep-out, ONE definition (WLD-56).
//
// The painted Mists keep clear of the town (spectator/mists-render.mjs, POS-553),
// and the creatures that come out of the Mists spawn only on open country, never
// on the town (WLD-56). Both ask the same question — which ground is the town's —
// so the rule lives here, in tools/, where the office reads the engine at the
// blessed ref (it never materializes spectator/). The paint imports it from here
// and adds only what is paint: the margin's soft edge and its ragged noise.
//
// THE RULE: every sited mark with a place is kept, at its own extent grown by
// `keepM` on every side, except the world's open country: a mark of the town's own
// (by or household `the-town`) wider than `townMaxM` on either side — the root, the
// sea, the main channel. A household's mark is never open country, whatever its
// size, and a town mark standing in a clearing is kept like any other.
//
// A MARK STANDING IN THE WALL KEEPS NOTHING. The keep-out exists so the fog
// never covers the town; a mark that stands wholly behind the wall at this
// crossing (no part of it on the clear ground or in a clearing) is not the
// town's ground, and clearing the paint around it would draw a hole in the wall
// where the fog stands. So, given the Mists at the crossing (`m`, the engine's
// mistsAt), such a mark is left out. The fronts stop short of every household's
// parcel, so no parcel is ever left out; without `m` the rule reads as before.

export const MISTS_KEEP = {
  keepM: 440,       // the town's margin: past the paint's soft edge plus the widest drift (200 m along, 90 across), so a drifting bank never reaches a mark
  townMaxM: 2600,   // past this a mark is open country, not the town
};

/** The world's open country, which the fog may stand over: a mark of the
 *  town's own (by or household `the-town`) wider than townMaxM on either side.
 *  A household's mark is never open country, whatever its size. */
export function mistsOpenCountry(mk) {
  const town = mk?.by === "the-town" || mk?.household === "the-town" || String(mk?.id ?? "").startsWith("the-town/");   // the id too: a path that drops by/household must not keep the root and thin the fog everywhere
  return town && Math.max(Number(mk?.extent?.w) || 0, Number(mk?.extent?.h) || 0) > MISTS_KEEP.townMaxM;
}

/** The keep-out rectangles, metres: every sited mark's own extent (parcels,
 *  houses, lit marks, districts) as `cx0..cx1, cy0..cy1`, and its reach, grown by
 *  `keepM`, as `minX..maxX, minY..maxY`. Open country keeps nothing unless it
 *  stands in one of `clearings` (the mists block's, or the skeleton's clearings_m). */
export function mistsKeepRects(marks, clearings = [], keepM = MISTS_KEEP.keepM, { m = null } = {}) {
  const g = keepM, out = [];
  const inClearing = (p) => (clearings ?? []).some((k) => Math.hypot(p.x - k.x, p.y - k.y) < (k.r ?? k.r_m));
  for (const mk of marks ?? []) {
    if (!mk?.at || !Number.isFinite(mk.at.x) || !Number.isFinite(mk.at.y)) continue;
    // only the town's own open country goes unkept (the frame, the sea, the main
    // channel): every household's mark is kept clear at any size (#186 review: a
    // household's 3.2 km shore went under the fog), and a mark in a clearing too
    if (mistsOpenCountry(mk) && !inClearing(mk.at)) continue;
    const w = Math.max(0, Number(mk.extent?.w) || 0) / 2, h = Math.max(0, Number(mk.extent?.h) || 0) / 2;
    if (m && standsInTheWall({ minX: mk.at.x - w, maxX: mk.at.x + w, minY: mk.at.y - h, maxY: mk.at.y + h }, m)) continue;
    // the mark's own extent (core) and its reach (core grown by the margin)
    out.push({ cx0: mk.at.x - w, cx1: mk.at.x + w, cy0: mk.at.y - h, cy1: mk.at.y + h,
      minX: mk.at.x - w - g, maxX: mk.at.x + w + g, minY: mk.at.y - h - g, maxY: mk.at.y + h + g });
  }
  return out;
}

/** Whether a box stands wholly behind the wall of `m` (the engine's mistsAt): it
 *  meets neither the clear ground nor any clearing. The same geometry as the
 *  engine's mistsHere, asked of a box instead of a point. */
export function standsInTheWall(box, m) {
  const c = m?.clear;
  if (!c) return false;
  if (box.minX <= c.maxX && box.maxX >= c.minX && box.minY <= c.maxY && box.maxY >= c.minY) return false;
  for (const k of m.clearings ?? []) {
    const r = Number(k.r ?? k.r_m);
    const dx = Math.max(box.minX - k.x, 0, k.x - box.maxX), dy = Math.max(box.minY - k.y, 0, k.y - box.maxY);
    if (Math.hypot(dx, dy) <= r) return false;
  }
  return true;
}

/** Is (x, y) the town's: inside any keep rectangle's reach? The crisp rule, with
 *  no paint noise — what the creatures' spawn reads. */
export function keptByTheTown(rects, x, y) {
  for (const r of rects) if (x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY) return true;
  return false;
}
