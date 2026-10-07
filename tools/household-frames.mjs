// household-frames.mjs — NOTHING RIDES ANOTHER HOUSEHOLD'S MARK.
// POS-441 · postmark#2458 · ruled by Darko 2026-10-07:
//
//   moving a mark carries the marks inside it that belong to the same household;
//   another household's marks never move — they keep their place, and their
//   containment follows geometry. "That should just always be the default rule."
//
// In this tree a mark RIDES whatever frame its numbers are written against
// (marks-fold.mjs § the frame): a nested file's `at` is an offset from its
// frame's centre, so moving the frame moves it. That is the riding the ruling
// keeps for a household's own marks and takes away from everyone else's. This
// module is the one question both of its enforcers ask — the lint's gate
// (mark-lint.mjs § 6c) and the un-nesting verb (unnest-households.mjs) — so the
// gate and the remedy cannot disagree about what "another household's" means.
//
// THE HOUSEHOLD is the registry's (WORLD/households.json, re-derived from the
// town at every settlement): a handle maps to its house key, and a handle the
// registry does not name is a household of one, `solo:<handle>`, exactly as the
// fold and the consent gate resolve it. The town is such a household: it has no
// registry row, so `the-town` is `solo:the-town`, and a resident's mark riding a
// town district rides another household's mark.
//
// Only POSITIONED records ride. A predicate has no ground of its own — it is its
// parent continued (the-town/the-continuation) — so it follows its parent
// wherever it goes and is never the subject of this question. The world root is
// the frame itself and never "another household's mark".

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { WORLD_ROOT_SLUG } from "./marks-fold.mjs";

/** handle → household key, read from a registry file; `solo:<handle>` for anyone it does not name. */
export function householdResolver(registryPath) {
  const households = registryPath && existsSync(registryPath)
    ? (JSON.parse(readFileSync(registryPath, "utf8")).households ?? {}) : {};
  return (handle) => households[handle] ?? `solo:${handle}`;
}

/** The repo's own registry, as the lint and the fold read it. */
export const repoHouseholds = (repo) => householdResolver(join(repo, "WORLD", "households.json"));

/**
 * Every positioned record whose binding frame belongs to ANOTHER household.
 * `marks` are loader records (they carry `_frameId`, set by `loadMarks`).
 * Returns rows `{ id, by, household, frame, frameBy, frameHousehold, rec }`.
 */
export function crossHouseholdRiders(marks, credOf) {
  const byId = new Map();
  for (const m of marks) if (!m._error && m.id != null && !byId.has(m.id)) byId.set(m.id, m);
  const out = [];
  for (const rec of byId.values()) {
    if (!rec._fileAt || !rec._frameId) continue;                 // no position, or framed by the world
    const frame = byId.get(rec._frameId);
    if (!frame || frame.slug === WORLD_ROOT_SLUG) continue;       // the root is the frame, not a household's mark
    const household = credOf(rec.by), frameHousehold = credOf(frame.by);
    if (household === frameHousehold) continue;                   // your own household's frame: you ride it, by the ruling
    out.push({ id: rec.id, by: rec.by, household, frame: frame.id, frameBy: frame.by, frameHousehold, rec });
  }
  return out;
}
