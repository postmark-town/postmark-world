// creature-kind.mjs — read a creature's kind file, and answer what it allows (WLD-56).
//
// A KIND FILE IS A CREATURE'S LAW (Sitting E, 2026-10-14 §§ 6–7): what it is, its
// moods, the reactions it may answer an act with (each gated by a `when`), and the
// line each one leaves in the world. CODE owns what is possible: the ring, the
// menu of reactions whose `when` holds, and what each reaction changes. JEV only
// ever chooses among the allowed reactions and scores the moods (the office half,
// POS-637), so no text a resident writes can make a creature do what its kind file
// does not allow.
//
// Ported from the Spire's first take (postmark-world-spire, spire/encounter/kind.mjs,
// Wright 2026-10-13) as the world's own code. The law/rule/want idea came from
// Ember's DelveTalk, which is AGPL-3.0: ideas only, never its code or syntax.
//
// THE MISTS' CREATURES ARE SMART DECORATIONS (Darko, 21:31). So a kind file here has
// no laws, rules or wants (nothing is refused, chained or asked for without verbs),
// and a reaction may change only the creature itself: its moods and its flags, or
// send it back into the Mists (`flee`). An effect on the actor (nerve, harm), a
// take, or a telegraphed spring is the dungeon's and is refused at parse. So is a
// condition on a verb outside the ring's list and the afforded actions.
//
// A CREATURE'S AFFORDED ACTIONS (POS-672; ruled 2026-10-16 17:47 and 18:06, LOGOS
// classes.md § A creature's afforded actions): a resident may aim one at a
// creature, and the creature's reaction is the act's reply. They are ADDITIONS to
// the ring (Darko 17:47): the ambient trigger stands. The creature class and each
// kind class declare which are theirs (their marks' `actions`); a kind file keys
// reactions on them through `act.verb`, exactly as on a ring verb. Code still
// decides what is possible and Jev only chooses among it.
//
// THE FORMAT (one line each unless said; `#` starts a comment):
//
//   kind: wolf                     the slug; ids and the spawn schedule name it
//   name: a grey wolf              what a reader is told it is
//   voice: …                       how it is described (one line)
//   about: …                       one line on what it does
//   what: >                        a paragraph (the indented lines that follow)
//   ring_m: 80                     its awareness ring, in metres (no line of sight, like earshot)
//   tastes: …                      one line of plain prose on what food or offerings it likes,
//                                  read by Jev with judgment, never a rule table (POS-672, call 8)
//   moods:                         each mood a range, its start, and one label per
//     fear: 0..3 = 1 | calm | uneasy | frightened | terrified
//                                  level, required (what Jev's Score reads)
//   flags: watchful, startled      the flags a reaction may set or clear (optional)
//   reaction <name> "<sentence>": when <cond> [does <effects>] says <line>
//
// A condition reads: self.<mood>, self.<flag> (true when set), act.verb (one of
// RING_VERBS or AFFORDED_VERBS), act.distance_m, act.approaching, actor.times (how
// often this actor has acted inside its ring during its span), heard.any (true
// when the creature has words to repeat: see {heard}), and the literals true, false, numbers
// and "strings", joined by == != < <= > >= and/or/not and parentheses. It is
// evaluated here and never by eval.
//
// An effect is `nothing`, `set <flag>`, `clear <flag>`, `self.<mood> +n` or
// `self.<mood> -n` (clamped to its range), or `flee` (it goes back into the Mists
// at once: a withdraw with reason `fled`). Several are joined by " ; ".
//
// A line may name `{actor}`, the acting resident, and two slots CODE fills, never a
// model: `{offered}`, the name of the kind offered, only on a reaction whose
// condition requires `act.verb == "offer"`; and `{heard}`, a few words a resident
// said near it in public, only on a reaction whose condition requires `heard.any`
// (the raven's mimicry, WLD-56 18:13: the words are content, never instructions).
// "Requires" means the slot's term stands in the condition's top-level `and` chain,
// so the line can never be rendered without what it names.
//
// A `#` after a space ends a line's comment, except on a reaction line, which may
// not carry one (it would cut what the reaction says); no line is longer than
// MAX_LINE. How long a creature lives is not here: it is the creature class's
// `span_h` dial, its one home (ruled: twelve hours for every kind, § 7).

import { readFileSync } from "node:fs";

/** The acts a creature notices inside its ring: a resident's ordinary public acts
 *  (Darko, 21:31; the same list as the G5 privacy paragraph, POS-632 PR-0). */
export const RING_VERBS = Object.freeze(["walk", "enter", "exit", "say", "take", "give", "drop", "leave-mark"]);

/** The afforded actions a creature class may declare (POS-672; ruled 2026-10-16
 *  18:06): watch, approach and shoo on every creature; call and offer on the wolf
 *  and the raven; whisper on the bat. Which ones a creature takes is its classes'
 *  `actions`, never this list: this is only every verb a kind file may key on. */
export const AFFORDED_VERBS = Object.freeze(["watch", "approach", "shoo", "call", "offer", "whisper"]);

/** The slots a line may name: the actor, and the two code fills (see the header). */
export const LINE_SLOTS = Object.freeze(["actor", "offered", "heard"]);

/** What a condition may read beyond the creature's own moods and flags. */
const ACT_FIELDS = new Set(["act.verb", "act.distance_m", "act.approaching", "actor.times", "heard.any"]);

// ── the expression language ────────────────────────────────────────────────────
const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*")|(==|!=|<=|>=|<|>|\(|\))|([A-Za-z_][\w.-]*))/y;
const CMP = new Set(["==", "!=", "<", "<=", ">", ">="]);

export function tokenize(src) {
  const out = [];
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new Error(`cannot read the condition at "${src.slice(pos, pos + 20)}"`);
    pos = TOKEN.lastIndex;
    if (m[1]) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2]) out.push({ t: "str", v: JSON.parse(m[2]) });
    else if (m[3]) out.push({ t: "op", v: m[3] });
    else if (["and", "or", "not"].includes(m[4])) out.push({ t: "op", v: m[4] });
    else if (m[4] === "true" || m[4] === "false") out.push({ t: "bool", v: m[4] === "true" });
    else out.push({ t: "id", v: m[4] });
  }
  return out;
}

// or := and ("or" and)* ; and := not ("and" not)* ; not := "not" not | cmp ;
// cmp := atom (op atom)? ; atom := literal | id | "(" or ")"
export function parseCondition(src) {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const take = (v) => {
    const k = toks[i];
    if (!k || (v && k.v !== v)) throw new Error(`expected ${v ?? "a term"} in "${src}"`);
    i += 1;
    return k;
  };
  const orExpr = () => { let l = andExpr(); while (peek()?.v === "or") { take("or"); l = { op: "or", l, r: andExpr() }; } return l; };
  const andExpr = () => { let l = notExpr(); while (peek()?.v === "and") { take("and"); l = { op: "and", l, r: notExpr() }; } return l; };
  const notExpr = () => (peek()?.v === "not" ? (take("not"), { op: "not", x: notExpr() }) : cmp());
  const cmp = () => {
    const l = atom();
    const k = peek();
    if (k?.t === "op" && CMP.has(k.v)) { take(); return { op: k.v, l, r: atom() }; }
    return l;
  };
  const atom = () => {
    const k = take();
    if (k.v === "(" && k.t === "op") { const e = orExpr(); take(")"); return e; }
    if (k.t === "num" || k.t === "str" || k.t === "bool") return { lit: k.v };
    if (k.t === "id") return { id: k.v };
    throw new Error(`unexpected "${k.v}" in "${src}"`);
  };
  if (!toks.length) throw new Error("an empty condition");
  const tree = orExpr();
  if (i !== toks.length) throw new Error(`leftover "${toks[i].v}" in "${src}"`);
  return tree;
}

// own properties only: a flag named `constructor` or `toString` is unset until it is set
const lookup = (scope, path) => path.split(".").reduce((o, k) => (o == null || !Object.hasOwn(o, k) ? undefined : o[k]), scope);

export function evaluate(tree, scope) {
  if ("lit" in tree) return tree.lit;
  if ("id" in tree) return lookup(scope, tree.id);
  switch (tree.op) {
    case "or": return !!evaluate(tree.l, scope) || !!evaluate(tree.r, scope);
    case "and": return !!evaluate(tree.l, scope) && !!evaluate(tree.r, scope);
    case "not": return !evaluate(tree.x, scope);
    case "==": return evaluate(tree.l, scope) === evaluate(tree.r, scope);
    case "!=": return evaluate(tree.l, scope) !== evaluate(tree.r, scope);
    case "<": return evaluate(tree.l, scope) < evaluate(tree.r, scope);
    case "<=": return evaluate(tree.l, scope) <= evaluate(tree.r, scope);
    case ">": return evaluate(tree.l, scope) > evaluate(tree.r, scope);
    case ">=": return evaluate(tree.l, scope) >= evaluate(tree.r, scope);
  }
  throw new Error(`unknown operator ${tree.op}`);
}

export const holds = (tree, scope) => !!evaluate(tree, scope);

/** What a condition REQUIRES: the bare ids and the act.verb literals standing in
 *  its top-level `and` chain, so whenever it holds, each of them holds too. */
function requiredOf(tree, out = { ids: new Set(), verbs: new Set() }) {
  if (tree.op === "and") { requiredOf(tree.l, out); requiredOf(tree.r, out); }
  else if ("id" in tree) out.ids.add(tree.id);
  else if (tree.op === "==") {
    const verbSide = [tree.l, tree.r].find((s) => s.id === "act.verb"), other = verbSide === tree.l ? tree.r : tree.l;
    if (verbSide && "lit" in other) out.verbs.add(other.lit);
  }
  return out;
}

/** Every identifier a condition reads, and every string it compares act.verb with. */
function readsOf(tree, out = { ids: [], verbs: [] }) {
  if ("id" in tree) out.ids.push(tree.id);
  else if (tree.op === "not") readsOf(tree.x, out);
  else if (tree.l) {
    readsOf(tree.l, out);
    readsOf(tree.r, out);
    if (CMP.has(tree.op)) {
      const verbSide = [tree.l, tree.r].find((s) => s.id === "act.verb"), other = verbSide === tree.l ? tree.r : tree.l;
      if (verbSide && "lit" in other) out.verbs.push(other.lit);
    }
  }
  return out;
}

// ── effects ─────────────────────────────────────────────────────────────────────
// What a Mists creature may never do to anyone but itself (Darko 21:31: no combat,
// no nerve, no harm outside the Spire; no holds or taming for w44).
const REFUSED_EFFECT = [
  [/^actor\./, "a Mists creature changes nothing about the resident: no nerve, no harm (combat is the dungeon's)"],
  [/^take\b/, "a Mists creature takes nothing (no holds for w44)"],
  [/^telegraph\b/, "a Mists creature telegraphs no spring (combat is the dungeon's)"],
];

export function parseEffects(src, { moods, flags }) {
  return src.split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
    for (const [re, why] of REFUSED_EFFECT) if (re.test(s)) throw new Error(`the effect "${s}" is refused: ${why}`);
    let m;
    if (s === "nothing") return { do: "nothing" };
    if (s === "flee") return { do: "flee" };
    if ((m = /^(set|clear)\s+([\w-]+)$/.exec(s))) {
      if (!flags.includes(m[2])) throw new Error(`the effect "${s}" names a flag the kind does not declare (flags: ${flags.join(", ") || "none"})`);
      return { do: m[1], flag: m[2] };
    }
    if ((m = /^self\.(\w+)\s+([+-]\d+)$/.exec(s))) {
      if (!Object.hasOwn(moods, m[1])) throw new Error(`the effect "${s}" names a mood the kind does not have (moods: ${Object.keys(moods).join(", ")})`);
      return { do: "add", mood: m[1], by: Number(m[2]) };
    }
    throw new Error(`cannot read the effect "${s}"`);
  });
}

// ── the kind file ───────────────────────────────────────────────────────────────
const MOOD = /^([a-z][\w-]*):\s*(-?\d+)\.\.(-?\d+)\s*=\s*(-?\d+)\s*(?:\|(.*))?$/;
const REACTION = /^reaction\s+([a-z][\w-]*)\s+"([^"]*)":\s*when\s+(.*?)(?:\s+does\s+(.*?))?\s+says\s+(.*)$/;
const SINGLE = new Set(["kind", "name", "voice", "about", "ring_m", "flags", "tastes"]);
/** The longest line a kind file may hold (the reaction pattern is not linear in a
 *  hostile line's length; kind files are reviewed law, and this closes it anyway). */
export const MAX_LINE = 2000;

/** Parse a kind file's text. Throws, naming the line, on anything it cannot read or
 *  that the Mists' law refuses. */
export function parseKind(text, { source = "kind file" } = {}) {
  const kind = { moods: {}, flags: [], reactions: [] };
  const pending = [];   // reactions are checked once every mood and flag is known
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  let block = null;
  const fail = (n, why) => { throw new Error(`${source} line ${n + 1}: ${why}`); };
  for (let n = 0; n < lines.length; n += 1) {
    const raw = lines[n];
    if (raw.length > MAX_LINE) fail(n, `a line is at most ${MAX_LINE} characters (this one is ${raw.length})`);
    if (/^\s*(#|$)/.test(raw)) continue;
    // a reaction line may not carry a comment: " #" would silently cut what it says
    if (/^reaction\b/.test(raw) && /\s#/.test(raw)) fail(n, `a reaction line may not carry " #": it would cut what the reaction says (put the comment on its own line)`);
    const line = raw.replace(/\s+#.*$/, "");
    if (/^\s/.test(raw)) {
      if (block === "what") { kind.what = kind.what ? `${kind.what} ${line.trim()}` : line.trim(); continue; }
      if (block === "moods") {
        const m = MOOD.exec(line.trim());
        if (!m) fail(n, `a mood is "name: lo..hi = start | label | label …", one label per level`);
        const [, name, lo, hi, start, labels] = m;
        const mood = { lo: Number(lo), hi: Number(hi), start: Number(start) };
        if (!(mood.lo < mood.hi) || mood.start < mood.lo || mood.start > mood.hi) fail(n, `the mood ${name} needs lo < hi and its start inside them`);
        // the labels are what Jev's Score reads, one per level, so a mood without them cannot be judged
        mood.levels = (labels ?? "").split("|").map((s) => s.trim());
        if (mood.levels.length !== mood.hi - mood.lo + 1 || mood.levels.some((s) => !s)) fail(n, `the mood ${name} needs one label per level (${mood.hi - mood.lo + 1}): Jev's Score reads them`);
        if (Object.hasOwn(kind.moods, name)) fail(n, `the mood ${name} is declared twice`);
        kind.moods[name] = mood;
        continue;
      }
      fail(n, `an indented line belongs to a block (what: > or moods:)`);
    }
    block = null;
    let m;
    if ((m = REACTION.exec(line))) { pending.push({ n, m }); continue; }
    if (/^reaction\b/.test(line)) fail(n, `a reaction is: reaction <name> "<sentence>": when <cond> [does <effects>] says <line>`);
    if (/^what:\s*>\s*$/.test(line)) { block = "what"; continue; }
    if (/^moods:\s*$/.test(line)) { block = "moods"; continue; }
    if ((m = /^([a-z_]+):\s*(.*)$/.exec(line)) && SINGLE.has(m[1])) {
      if (kind[m[1]] !== undefined && m[1] !== "flags") fail(n, `${m[1]} is given twice`);
      if (m[1] === "flags") kind.flags = m[2].split(",").map((s) => s.trim()).filter(Boolean);
      else kind[m[1]] = m[2].trim();
      continue;
    }
    if (/^(law|rule|want)\b/.test(line)) fail(n, `a Mists creature has no ${line.split(/\s/)[0]}s: nothing is refused, chained or asked for without verbs`);
    fail(n, `cannot read "${raw.trim()}"`);
  }

  if (!/^[a-z][a-z0-9-]*$/.test(kind.kind ?? "")) throw new Error(`${source}: kind: must be a lowercase slug (got ${JSON.stringify(kind.kind)})`);
  if (!kind.name) throw new Error(`${source}: name: is required`);
  const ring = Number(kind.ring_m);
  if (!(Number.isFinite(ring) && ring > 0)) throw new Error(`${source}: ring_m: must be a number above 0 (got ${JSON.stringify(kind.ring_m)})`);
  kind.ring_m = ring;
  if (!Object.keys(kind.moods).length) throw new Error(`${source}: a kind needs at least one mood`);
  for (const f of kind.flags) if (!/^[a-z][\w-]*$/.test(f) || Object.hasOwn(kind.moods, f)) throw new Error(`${source}: the flag "${f}" must be a slug and not a mood's name`);

  const known = new Set([...ACT_FIELDS, ...Object.keys(kind.moods).map((k) => `self.${k}`), ...kind.flags.map((f) => `self.${f}`)]);
  for (const { n, m } of pending) {
    const [, name, sentence, cond, does, says] = m;
    if (kind.reactions.some((r) => r.name === name)) fail(n, `the reaction ${name} is given twice`);
    let when;
    try { when = parseCondition(cond); } catch (e) { fail(n, e.message); }
    const reads = readsOf(when);
    for (const id of reads.ids) if (!known.has(id)) fail(n, `the condition reads "${id}", which a creature cannot know (it reads ${[...known].join(", ")})`);
    for (const v of reads.verbs) if (!RING_VERBS.includes(v) && !AFFORDED_VERBS.includes(v))
      fail(n, `act.verb is never "${v}": a creature notices only ${RING_VERBS.join(", ")}, and is aimed at only by ${AFFORDED_VERBS.join(", ")}`);
    let effects;
    try { effects = parseEffects(does ?? "nothing", kind); } catch (e) { fail(n, e.message); }
    const line = says.trim();
    if (!line) fail(n, `a reaction says something`);
    const names = [...line.matchAll(/\{([^}]*)\}/g)].map((x) => x[1]);
    for (const x of names) if (!LINE_SLOTS.includes(x)) fail(n, `a line may name {actor}, {offered} or {heard} and nothing else (got {${x}})`);
    const needs = requiredOf(when);
    if (names.includes("offered") && !needs.verbs.has("offer")) fail(n, `a line naming {offered} needs a condition that requires act.verb == "offer" (in its top-level and)`);
    if (names.includes("heard") && !needs.ids.has("heard.any")) fail(n, `a line naming {heard} needs a condition that requires heard.any (in its top-level and)`);
    kind.reactions.push({ name, sentence, when, src: cond, effects, says: line });
  }
  if (!kind.reactions.length) throw new Error(`${source}: a kind needs at least one reaction`);
  return kind;
}

export function readKind(path) {
  return parseKind(readFileSync(path, "utf8"), { source: path });
}

// ── what the kind allows ────────────────────────────────────────────────────────
/** A new creature's state: every mood at its start, no flag set. */
export function startState(kind) {
  return { moods: Object.fromEntries(Object.entries(kind.moods).map(([k, m]) => [k, m.start])), flags: [] };
}

/** The scope a condition is read against. `state` is { moods, flags }, `act`
 *  { verb, distance_m, approaching, heard? } (heard: the words the creature could
 *  repeat, or none), `actor` { times }. */
export function scopeOf(state, act = {}, actor = {}) {
  const self = { ...state.moods };
  for (const f of state.flags ?? []) self[f] = true;
  return {
    self,
    act: { verb: act.verb, distance_m: act.distance_m, approaching: !!act.approaching },
    actor: { times: Number(actor.times) || 0 },
    heard: { any: wordsOf(act.heard) !== "" },
  };
}

/** The menu: every reaction whose `when` holds right now, in the kind file's order. */
export function allowedReactions(kind, scope) {
  return kind.reactions.filter((r) => holds(r.when, scope));
}

/** Apply a reaction's effects to a state, without touching the original. Moods are
 *  clamped to their range. `fled` is true when it went back into the Mists. */
export function applyEffects(kind, state, effects) {
  const next = { moods: { ...state.moods }, flags: [...(state.flags ?? [])] };
  let fled = false;
  for (const e of effects) {
    if (e.do === "flee") fled = true;
    else if (e.do === "set" && !next.flags.includes(e.flag)) next.flags.push(e.flag);
    else if (e.do === "clear") next.flags = next.flags.filter((f) => f !== e.flag);
    else if (e.do === "add") {
      if (!Object.hasOwn(kind.moods, e.mood) || !Object.hasOwn(next.moods, e.mood)) throw new Error(`this kind has no mood ${e.mood}`);
      const m = kind.moods[e.mood];
      next.moods[e.mood] = Math.max(m.lo, Math.min(m.hi, next.moods[e.mood] + e.by));
    }
  }
  next.flags.sort();
  return { state: next, fled };
}

const wordsOf = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** The line a reaction leaves: its template, with the acting resident named, and
 *  the offered kind's name and the heard words where the line names them. One pass,
 *  by a function: "$&" in a name, or "{heard}" in what was said, is only text. */
export function voiceLine(reaction, { actor, offered = null, heard = null } = {}) {
  const fill = { actor: String(actor), offered: wordsOf(offered) || "offering", heard: wordsOf(heard) || "…" };
  return reaction.says.replace(/\{(actor|offered|heard)\}/g, (_, slot) => fill[slot]);
}
