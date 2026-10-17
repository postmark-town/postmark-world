// unpublish-verdict.mjs — THE SWEEP'S UNPUBLISH RULE, ONE DEFINITION (postmark#3757).
//
// Two readers ask "will the next settlement take this mark out of the world?":
// the sweep, which does it (settlement-sweep.mjs § unpublish), and the office's
// stakes warning, which tells a household beforehand (office
// src/doorstep-stakes.mjs, the doorstep's `stakes` and needs-you). They used
// to hold two copies of the rule, and the copies parted. The sweep asks three
// things of a registry row:
//
//   · its class is "commons" (since G2, "home" too, and the walk decides: below);
//   · no open stamps stand behind it at the crossing;
//   · its registered path is on main.
//
// The office's copy asked only the first two. kinofire's fireplace and firepit
// (postmark#3757) were re-filed under spin-ghar-manor by hand on 10-04 (world
// #140) and their registry rows kept the old root paths, so the sweep skipped
// them every crossing while the doorstep told Kino, at every read, that "the
// next settlement sweeps it first". Both readers now import this file: the
// sweep in-process, the office through the engine it materialises at the
// blessed ref. A rule changed here changes both.
//
// ── THE STALE ROW, AND THE ONE DIAL (WLD-51) ───────────────────────────────
//
// A row whose registered path is not on main is STALE: something moved the
// file and nothing moved the row. What the sweep does with one is ONE dial,
// `STALE_ROWS`, read nowhere else:
//
//   "skip"      the rule before ruling 2: the row is not a candidate. A stale
//               commons row at zero escrow was never swept, and the warning
//               said so by not warning. Thirteen market marks sat out of the
//               sweep's reach under it (WLD-51's gap read § 3).
//   "rederive"  find the mark where it stands now and judge it by its CURRENT
//               standing (the fold's derived tier, mark-standing.mjs), so the
//               stored path and class decide nothing: a home mark is never
//               swept, and a market mark at zero escrow is swept from its
//               current filing.
//
// RULED (Darko, WLD-51, 2026-10-14 14:51 EDT): "The 13 unreachable commons
// marks: just take them. The sweep reaches them like any other ✦0 commons
// mark." The 13 rows were repointed (registry-reconcile.mjs, which no longer
// holds any row back), and the dial is "rederive" as the belt: a file moved by
// a direct push to main passes no review test, and its row is still judged
// where the mark stands now.
//
// ── THE SAFETY HALF OF THE RE-DERIVE (Darko, 2026-10-14) ──────────────────
//
// A row's `class` is written ONCE, when the sweep admits the mark, and the
// loop used to trust it forever. Standing is not fixed: a parcel founded or
// grown around a mark, or a mark moved onto its household's ground, makes it
// home later, and the stored "commons" never heard. On 10-14 eleven home marks
// stood under commons rows at their own paths (keith/the-garage,
// alex-rowan/the-threadbound-house, nine more), seven of them at exactly ✦1:
// one unstake, and the next sweep would have unpublished a home. So the
// mark's standing is WALKED NOW, by the caller, with the one standing rule
// (mark-standing.mjs, the fold's tier), for every commons row at zero escrow:
// a mark that walks home or constitution is never unpublished, whatever its
// row says. This half only ever KEEPS a mark, so it needs no ruling and no
// notice.
//
// ── STANDING DECIDES IN BOTH DIRECTIONS (Darko, WLD-51 G2, 2026-10-15 12:59) ─
//
// The other half: a row stored "home" whose mark now walks market is taken at
// ✦0 like any other market mark. "A mark first filed as home that now stands on
// market ground is takeable at ✦0." On 10-15 one row is that case, the cone
// (berthillon/cone-peche-de-vigne-2026-08-27, ✦4). The stored class no longer
// decides anything a household can see: a commons row and a home row are both
// candidates, and the walk decides. Only in the safe direction does a row's
// class still matter: a home row whose mark does not stand at all is kept (a
// mark is taken on a walk that reached market ground, never on an absence),
// and the town's own row (class "constitution", the-town/berth) is never a
// candidate.
//
// PURE. The caller hands in what it measured; this file reads no git, no store
// and no clock. An input the caller could not measure is `null`, and `null` is
// never "no": the verdict is then `unpublish: null` with the reason, because "I
// could not tell" and "it is safe" are different sentences to a household.

export const STALE_ROWS = "rederive";

/** The registry rows the sweep asks the walk of: commons and home (G2). The sweep's loop and this verdict read the one list. */
export const CANDIDATE_CLASSES = Object.freeze(["commons", "home"]);
export const isCandidateRow = (entry) => CANDIDATE_CLASSES.includes(entry?.class);

/** The registry's spelling of the verdict: the fold's `market` is the registry's `commons` (settlement-sweep.mjs § publish). */
export const rowClassOf = (cls) => (cls === "market" ? "commons" : cls);

/**
 * The rule in words, for any reader that quotes it: Darko's own sentence
 * (WLD-51, 2026-10-14 14:31 EDT), verbatim. It is the plain version on
 * purpose. Two conditions the verdict below still asks are left out of the
 * words, and stay in the code: the registered path must be on main, and only
 * a mark the registry holds is ever a candidate. The words explain; the
 * function decides.
 */
export const UNPUBLISH_RULE =
  "At each settlement, a commons mark with no stamps behind it leaves the world. A mark standing on your household's ground or the town's never does, whatever it was first filed as.";

const ask = (x) => (typeof x === "function" ? x() : x);

/**
 * Will the sweep take this registry row out of the world?
 *
 * @param entry       the registry row: `{ household, path, class }`. A commons
 *                    or home row is a candidate; the walk decides (G2).
 * @param escrow      open stamps behind the mark at the crossing; `null` = unread.
 * @param pathOnMain  is `entry.path` on main? A boolean, `null` (unread), or a
 *                    function returning one: asked only when the answer turns
 *                    on it, so the sweep pays its git read where it always did.
 * @param standing    the mark's derived tier on main now (`home` | `market` |
 *                    `constitution` …), `null` when it does not stand, or a
 *                    function returning one. Asked of every candidate row at
 *                    zero escrow; left undefined, it is UNREAD and the verdict
 *                    is null: a mark is never taken on a walk not run.
 * @param currentPath where the mark is filed now, or a function returning it.
 *                    Read only under "rederive", for a stale row it sweeps.
 * @param staleRows   the dial; callers pass it only in tests.
 * @returns `{ unpublish: true | false | null, why, path? }`. `path` is the file
 *          the sweep removes, present when `unpublish` is true.
 */
export function unpublishVerdict(entry, { escrow = null, pathOnMain = null, standing, currentPath, staleRows = STALE_ROWS } = {}) {
  if (!isCandidateRow(entry)) return { unpublish: false, why: "not-a-candidate" };
  if (escrow === null || escrow === undefined) return { unpublish: null, why: "escrow-unread" };
  if (Number(escrow) > 0) return { unpublish: false, why: "backed" };
  // the standing walked now outranks the class stored once, in both directions
  const tier = ask(standing);
  if (tier === undefined) return { unpublish: null, why: "standing-unread" };
  if (tier !== null && rowClassOf(tier) !== "commons") return { unpublish: false, why: "walks-not-commons" };
  // a home row is taken only on a walk that reached market ground (G2)
  if (tier === null && entry.class === "home") return { unpublish: false, why: "not-standing" };
  const onMain = ask(pathOnMain);
  if (onMain === null || onMain === undefined) return { unpublish: null, why: "path-unread" };
  if (onMain) return { unpublish: true, why: "commons-unbacked", path: entry.path };

  // ── the stale row ──
  if (staleRows === "skip") return { unpublish: false, why: "stale-path" };
  if (staleRows !== "rederive") throw new Error(`unpublish-verdict: unknown STALE_ROWS "${staleRows}"`);
  if (tier === null) return { unpublish: false, why: "not-standing" };
  const at = ask(currentPath);
  if (!at) return { unpublish: null, why: "filing-unread" };
  return { unpublish: true, why: "rederived-commons-unbacked", path: at };
}
