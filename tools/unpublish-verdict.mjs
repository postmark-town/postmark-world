// unpublish-verdict.mjs — THE SWEEP'S UNPUBLISH RULE, ONE DEFINITION (postmark#3757).
//
// Two readers ask "will the next settlement take this mark out of the world?":
// the sweep, which does it (settlement-sweep.mjs § unpublish), and the office's
// stakes warning, which tells a household beforehand (office
// src/doorstep-stakes.mjs, the doorstep's `stakes` and needs-you). They used
// to hold two copies of the rule, and the copies parted. The sweep asks three
// things of a registry row:
//
//   · its class is "commons";
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
// file and nothing moved the row. What the sweep does with one is the founder's
// call on WLD-51, and it is ONE dial, `STALE_ROWS`, read nowhere else:
//
//   "skip"      today's rule, kept as the default until the ruling: the row is
//               not a candidate. A stale commons row at zero escrow is never
//               swept, and the warning says so by not warning.
//   "rederive"  find the mark where it stands now and judge it by its CURRENT
//               standing (the fold's derived tier, mark-standing.mjs), so the
//               stored path and class decide nothing: a home mark is never
//               swept, and a market mark at zero escrow is swept from its
//               current filing.
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
// notice. The other half, a row stored home whose mark now walks commons, is
// untouched here: it is WLD-51's, with the stale rows.
//
// PURE. The caller hands in what it measured; this file reads no git, no store
// and no clock. An input the caller could not measure is `null`, and `null` is
// never "no": the verdict is then `unpublish: null` with the reason, because "I
// could not tell" and "it is safe" are different sentences to a household.

export const STALE_ROWS = "skip";

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
 * @param entry       the registry row: `{ household, path, class }`.
 * @param escrow      open stamps behind the mark at the crossing; `null` = unread.
 * @param pathOnMain  is `entry.path` on main? A boolean, `null` (unread), or a
 *                    function returning one: asked only when the answer turns
 *                    on it, so the sweep pays its git read where it always did.
 * @param standing    the mark's derived tier on main now (`home` | `market` |
 *                    `constitution` …), `null` when it does not stand, or a
 *                    function returning one. Asked of every commons row at zero
 *                    escrow (the safety half); left undefined, it is UNREAD and
 *                    the verdict is null: a mark is never taken on a walk not run.
 * @param currentPath where the mark is filed now, or a function returning it.
 *                    Read only under "rederive", for a stale row it sweeps.
 * @param staleRows   the dial; callers pass it only in tests.
 * @returns `{ unpublish: true | false | null, why, path? }`. `path` is the file
 *          the sweep removes, present when `unpublish` is true.
 */
export function unpublishVerdict(entry, { escrow = null, pathOnMain = null, standing, currentPath, staleRows = STALE_ROWS } = {}) {
  if (entry?.class !== "commons") return { unpublish: false, why: "not-commons" };
  if (escrow === null || escrow === undefined) return { unpublish: null, why: "escrow-unread" };
  if (Number(escrow) > 0) return { unpublish: false, why: "backed" };
  // the safety half: the standing walked now outranks the class stored once
  const tier = ask(standing);
  if (tier === undefined) return { unpublish: null, why: "standing-unread" };
  if (tier !== null && rowClassOf(tier) !== "commons") return { unpublish: false, why: "walks-not-commons" };
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
