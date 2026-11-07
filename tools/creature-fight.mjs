// creature-fight.mjs — a creature whose fight runs in set pieces: its fight file,
// read whole.
//
// A FINISHABLE KIND MAY FIGHT IN SET PIECES (WLD-25, ruled 2026-10-22). Such a
// kind names its fight file with `fight: <file>.json` (beside its kind file in
// WORLD/kinds/) and keeps `resolve:` and `strike:` as its hit points. Its fight
// shows two bars, HIT POINTS (worn by strike) and SANITY (raised by the peaceful
// acts of each set piece), and runs its set pieces in the file's order, one at a
// time. The set piece reached persists across windows; both bars reset at each
// settlement. The office runs the fight; this file only reads it.
//
// THE SET PIECES (SET_PIECES, each at most once, in any order but `unbreakable` last):
//
//   feint       Each of its reactions may carry one feint (`throws`: what it hurls, in
//               words), aimed at one resident in its ring by `aims_at`. The target's next act in its ring answers
//               it: a dodge, a walk or an exit FLINCHES (the target loses
//               `flinch_nerve`); a strike answers nothing, and it stays open (ruled
//               WLD-25/m); any other act HOLDS (sanity + `held`, or the act's own
//               number in `held_by`); no act within `answer_min` minutes LAPSES.
//               It ends when hit points fall to `ends.hit_points_at` of the most,
//               or sanity reaches `ends.sanity_at` of the most, or `ends.after_h`
//               hours into a window, whichever comes first.
//   disguise    On entering it, the creature says `surrender` to everyone in its
//               ring. While it holds, the office shows no bars and describes the
//               creature by this piece's `looks`. The first strike or investigate
//               on it from inside its ring breaks it for everyone: the creature
//               says `admits` to the one who broke it, and the next piece begins.
//               It has no clock.
//   unbreakable Hit points cannot be worn (a strike does nothing, and still costs
//               its nerve). Sanity is 0 when it begins and at each settlement.
//               `persuade` is its peaceful act: once per household per settlement,
//               scored from `persuade.low` to `persuade.high` (Jev reads it against
//               `persuade.story`; code clamps the score), costing the persuader
//               `persuade.nerve`. If sanity is full when a settlement runs, the
//               creature's ending fires there, and nothing else ends it.
//
// THE FIGHT FILE (JSON):
//
//   sanity_max   the most sanity (a whole number)
//   pieces       [{ piece, looks, ...that piece's own fields above }]
//   restores     the class its ending turns back on (its key, as the law keys it), or absent
//
// Every line the creature itself says (its cackle when someone flinches, its
// answer to a strike or a persuade) is a reaction in its kind file, keyed on the
// `fight.*` fields (creature-kind.mjs § FIGHT_FIELDS). Only the lines said outside
// a reaction (`surrender`, `admits`) and what a feint throws live here.

/** The set pieces a fight may run. */
export const SET_PIECES = Object.freeze(["feint", "disguise", "unbreakable"]);
/** The acts that flinch from a feint aimed at you; any other act holds. */
export const FLINCH_VERBS = Object.freeze(["dodge", "walk", "exit"]);
/** Whom a feint may be aimed at (the press's own words; creature-kind.mjs § PRESS_ON). */
export const FEINT_AIMS = Object.freeze(["loudest", "longest", "alone", "actor"]);
/** The longest line a fight file may hold. */
export const LINE_MAX = 400;

const str = (v) => typeof v === "string" && v.trim() !== "";

/**
 * Parse a fight file's text. Throws, naming the field, on anything it cannot
 * read: the fight is read whole or not at all.
 */
export function parseFight(text, { source = "fight file" } = {}) {
  let j;
  try { j = JSON.parse(String(text)); } catch (e) { throw new Error(`${source}: not JSON (${e.message})`); }
  const fail = (where, why) => { throw new Error(`${source}: ${where}: ${why}`); };
  const whole = (where, v, lo, hi = Infinity) => {
    if (!(Number.isInteger(v) && v >= lo && v <= hi)) fail(where, `is a whole number from ${lo}${hi < Infinity ? ` to ${hi}` : " up"} (got ${JSON.stringify(v)})`);
    return v;
  };
  const share = (where, v) => {
    if (!(typeof v === "number" && v > 0 && v < 1)) fail(where, `is a share between 0 and 1 (got ${JSON.stringify(v)})`);
    return v;
  };
  const line = (where, v) => {
    if (!str(v)) fail(where, "says something");
    if (v.length > LINE_MAX) fail(where, `is at most ${LINE_MAX} characters`);
    if (/\{[^}]*\}/.test(v)) fail(where, "names no slot: it is said as written");
    return v.trim();
  };
  const sanity_max = whole("sanity_max", j?.sanity_max, 1);
  if (!Array.isArray(j?.pieces) || !j.pieces.length) fail("pieces", "lists at least one set piece");
  const seen = new Set();
  const pieces = j.pieces.map((p, i) => {
    const at = `pieces[${i}]`;
    if (!SET_PIECES.includes(p?.piece)) fail(at, `is one of ${SET_PIECES.join(", ")} (got ${JSON.stringify(p?.piece)})`);
    if (seen.has(p.piece)) fail(at, `${p.piece} is given twice`);
    seen.add(p.piece);
    if (p.piece === "unbreakable" && i !== j.pieces.length - 1) fail(at, "unbreakable is the last set piece: nothing comes after it");
    const out = { piece: p.piece, looks: line(`${at}.looks`, p.looks) };
    if (p.piece === "feint") {
      const e = p.ends ?? {};
      out.throws = line(`${at}.throws`, p.throws);
      if (!FEINT_AIMS.includes(p.aims_at)) fail(`${at}.aims_at`, `is one of ${FEINT_AIMS.join(", ")}`);
      out.aims_at = p.aims_at;
      out.flinch_nerve = whole(`${at}.flinch_nerve`, p.flinch_nerve, 1, 10);
      out.held = whole(`${at}.held`, p.held, 1, sanity_max);
      out.held_by = {};
      for (const [verb, n] of Object.entries(p.held_by ?? {})) {
        if (FLINCH_VERBS.includes(verb)) fail(`${at}.held_by.${verb}`, `${verb} flinches; it never holds`);
        out.held_by[verb] = whole(`${at}.held_by.${verb}`, n, 1, sanity_max);
      }
      out.answer_min = whole(`${at}.answer_min`, p.answer_min, 1, 24 * 60);
      out.ends = { hit_points_at: share(`${at}.ends.hit_points_at`, e.hit_points_at), sanity_at: share(`${at}.ends.sanity_at`, e.sanity_at),
        after_h: whole(`${at}.ends.after_h`, e.after_h, 1, 12) };
    }
    if (p.piece === "disguise") {
      out.surrender = line(`${at}.surrender`, p.surrender);
      out.admits = line(`${at}.admits`, p.admits);
    }
    if (p.piece === "unbreakable") {
      const q = p.persuade ?? {};
      const low = whole(`${at}.persuade.low`, q.low, 1, sanity_max);
      const high = whole(`${at}.persuade.high`, q.high, low, sanity_max);
      if (!Array.isArray(q.story) || !q.story.length) fail(`${at}.persuade.story`, "lists the lines a persuade may speak to");
      out.persuade = { low, high, nerve: whole(`${at}.persuade.nerve`, q.nerve, 1, 10), story: q.story.map((s, k) => line(`${at}.persuade.story[${k}]`, s)) };
    }
    return out;
  });
  if (j.restores != null && !(typeof j.restores === "string" && /^[a-z][a-z0-9-]*$/.test(j.restores))) fail("restores", `is a class's slug (got ${JSON.stringify(j.restores)})`);
  return { sanity_max, pieces, order: pieces.map((p) => p.piece), ...(j.restores != null ? { restores: j.restores } : {}) };
}
