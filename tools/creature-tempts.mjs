// creature-tempts.mjs — a creature that tempts: its menu, and the lint every
// temptation passes before it is ever said.
//
// A FINISHABLE KIND MAY TEMPT (an encounter's last shape; Darko's delegation,
// 2026-10-21, as settled by Wright). Such a kind names a menu file with
// `tempts: <file>` (beside its kind file in WORLD/kinds/), the resident who may
// speak for it with `who: <handle>`, and the size of its fight with
// `fight_size: N`. It has no resolve and no ease: it keeps two tallies over one
// settlement window, DAMAGE (force) and PERSUASION (answering it plainly), and
// the larger picks its ending (ties go to persuasion). The office keeps the
// tallies; this file only reads the menu and judges its words.
//
// THE MENU (JSON, one file per kind):
//
//   who          the resident who may speak for it (the same as the kind's `who:`)
//   slots        { <slot>: what it names }: the slots a temptation's text may name (MENU_SLOTS only)
//   phases       { <phase>: { aims_at, span_m?, seen_through: [cues] } }, in the order they come
//   whispers     [{ id, phase, text, tempts: { act, to?, target?, what?, gist? }, aims_at, seen_through, why, slots }]
//   canonical_public_lines   { quotes: [the true lines a plain answer may correct it with] }
//   lines        { plain|obeys|strikes|helps: [{ line, phase? }] }: what it says back, chosen by Jev
//   endings      { damage: { name, text }, persuasion: { name, text } }
//
// A TEMPTATION ASKS ONLY FOR AN ACT INSIDE THE TOWN (the guardrail, settled):
// walk, leave its ring, give or stake (to it: answered, nothing moves), say, or
// strike (it, never a resident). Never steady or shield: a temptation that asked
// for a kind act would punish a resident who did it out of kindness.
//
// WHISPER-LINT (the guardrail's machinery, settled): every temptation, from the
// menu or said live, is refused unless it passes. It refuses addresses (urls,
// domains, email), digits shaped like a number to dial, code (fences, backticks,
// shell or path shapes), the words of a harness or a vendor, any "this is <someone>
// speaking", and anything over WHISPER_MAX characters. A menu with one failing
// temptation is refused whole: the office then has no menu, and the creature
// never tempts (fail closed). A second check, Jev's, is the office's.

/** The acts a temptation may ask for: never steady, never shield. */
export const TEMPT_ACTS = Object.freeze(["walk", "leave", "give", "stake", "say", "strike"]);
/** Whom a temptation may be aimed at: the press's menu, and the one longest in its ring. */
export const TEMPT_AIMS = Object.freeze(["actor", "striker", "shielder", "loudest", "alone", "longest"]);
/** The slots a temptation's text may name, each filled by code from the ring (a human: their town name, mention only). */
export const MENU_SLOTS = Object.freeze(["name", "house", "mate", "ally", "other_house", "human"]);
/** Where a say it asks for may be aimed. */
export const SAY_TO = Object.freeze(["{ally}", "{mate}", "the ring"]);
/** The longest temptation. */
export const WHISPER_MAX = 280;
/** The roads its ending may take, and the order a tie is broken in (persuasion first: settled). */
export const ROADS = Object.freeze(["persuasion", "damage"]);

// ── whisper-lint ────────────────────────────────────────────────────────────────

/** The words a temptation never says (a harness's, a vendor's, a secret's), whole words, any case. */
export const REFUSED_WORDS = Object.freeze(["key", "keys", "token", "tokens", "password", "passwords", "passcode", "credential", "credentials",
  "secret", "secrets", "login", "logins", "api", "prompt", "prompts", "system", "instruction", "instructions", "model", "models",
  "claude", "anthropic", "openai", "chatgpt", "gpt"]);

const LINT = [
  [/\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|io|ai|dev|app|gg|xyz|co|me|info|biz|us|uk)\b/i, "an address (a url or a domain)"],
  [/[^\s@]+@[^\s@]+\.[^\s@]+/, "an email address"],
  [/(?:\+?\d[\d\s().-]{6,}\d)/, "digits shaped like a number to dial"],
  [/```|`/, "code (a fence or a backtick)"],
  [/(^|\s)(\/[\w.-]+){2,}|[a-z]:\\|~\/|\.\/|\$\(|&&|\|\||(^|\s)\$\s|\bsudo\b|\bcurl\b|\bnpm\b|\bgit\b/i, "a shell command or a path"],
  [/<\/?[a-z][\w-]*>|^\s*[{[]\s*["{[]|"\w+"\s*:/i, "the shape of a tool's input or output"], // a slot ({ally}) is not JSON
  [/\bthis is [\w.-]+(?: [\w.-]+)? speaking\b|\bspeaking as\b|\bon behalf of\b/i, "a claim to be someone speaking"],
  [/\bignore (all |any |the )?(previous|prior|above)\b|\bdisregard\b/i, "an attempt to unsay what its reader was told"],
];

/**
 * Does `text` pass whisper-lint? { ok, why: [reasons] }. `keyNames` are the
 * in-world names a key may be said by (a creature's key, by its name), which
 * are the only way the word "key" may stand; `voices` are the names that must
 * never be claimed (residents' handles, humans' town names).
 */
export function lintWhisper(text, { keyNames = [], voices = [] } = {}) {
  const why = [];
  const t = String(text ?? "");
  if (!t.trim()) why.push("it says nothing");
  if (t.length > WHISPER_MAX) why.push(`it is ${t.length} characters (at most ${WHISPER_MAX})`);
  for (const [re, what] of LINT) if (re.test(t)) why.push(`it holds ${what}`);
  // "key" may stand only inside one of the in-world names given for a key
  let masked = t;
  for (const k of keyNames) if (k) masked = masked.split(k).join(" ");
  for (const w of masked.toLowerCase().split(/[^a-z0-9'-]+/).filter(Boolean))
    if (REFUSED_WORDS.includes(w)) { why.push(`it says "${w}"`); break; }
  for (const v of voices) {
    if (!v) continue;
    const esc = String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b(I am|I'm|it'?s|this is|from|signed,?)\\s+${esc}\\b`, "i").test(t)) { why.push(`it claims to be ${v}`); break; }
  }
  return { ok: why.length === 0, why };
}

// ── the menu ────────────────────────────────────────────────────────────────────

const str = (v) => typeof v === "string" && v.trim() !== "";
const slotsIn = (text) => [...String(text).matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);

/**
 * Parse a tempting kind's menu (its JSON text). Throws, naming the entry, on
 * anything it cannot read, and on any temptation whisper-lint refuses: the menu
 * is read whole or not at all. `who` is the kind's own `who:`, which the menu
 * must agree with.
 */
export function parseMenu(text, { source = "menu", who = null, keyNames = [], voices = [] } = {}) {
  let j;
  try { j = JSON.parse(String(text)); } catch (e) { throw new Error(`${source}: not JSON (${e.message})`); }
  const fail = (where, why) => { throw new Error(`${source}: ${where}: ${why}`); };
  if (!str(j?.who)) fail("who", "names the resident who may speak for it");
  if (who != null && j.who !== who) fail("who", `is ${j.who}, but the kind's who: is ${who}`);
  const phases = Object.entries(j.phases ?? {});
  if (!phases.length) fail("phases", "names at least one phase");
  const phaseOf = {};
  for (const [name, p] of phases) {
    if (!/^[a-z][\w-]*$/.test(name)) fail(`phases.${name}`, "a phase is a slug");
    if (!TEMPT_AIMS.includes(p?.aims_at)) fail(`phases.${name}.aims_at`, `is one of ${TEMPT_AIMS.join(", ")}`);
    if (p.span_m != null && !(Number.isInteger(p.span_m) && p.span_m > 0)) fail(`phases.${name}.span_m`, "is a whole number of minutes");
    phaseOf[name] = { aims_at: p.aims_at, ...(p.span_m ? { span_m: p.span_m } : {}), seen_through: (p.seen_through ?? []).map(String) };
  }
  const ids = new Set();
  const whispers = (j.whispers ?? []).map((w, i) => {
    const at = `whispers[${i}]${w?.id ? ` (${w.id})` : ""}`;
    if (!str(w?.id) || ids.has(w.id)) fail(at, "needs an id of its own");
    ids.add(w.id);
    if (!phaseOf[w.phase]) fail(at, `its phase "${w.phase}" is not one of ${Object.keys(phaseOf).join(", ")}`);
    if (!str(w.text)) fail(at, "says nothing");
    for (const s of slotsIn(w.text)) if (!MENU_SLOTS.includes(s)) fail(at, `names {${s}}, and a temptation may name only ${MENU_SLOTS.map((x) => `{${x}}`).join(", ")}`);
    const lint = lintWhisper(w.text, { keyNames, voices });
    if (!lint.ok) fail(at, `whisper-lint refuses it: ${lint.why.join("; ")}`);
    const t = { ...(w.tempts ?? {}) };
    if (!TEMPT_ACTS.includes(t.act)) fail(at, `tempts "${t.act}": a temptation asks only for ${TEMPT_ACTS.join(", ")} (never steady or shield)`);
    if ((t.act === "give" || t.act === "stake") && t.to !== j.who) fail(at, `a ${t.act} it asks for is to it (${j.who}): answered, nothing moves`);
    if (t.act === "strike" && t.target !== j.who) fail(at, `a strike it asks for is at it (${j.who}), never at a resident`);
    if (t.act === "say" && t.to == null) t.to = "the ring"; // a say named to no one is said to the ring
    if (t.act === "say" && (!SAY_TO.includes(t.to) || !str(t.gist))) fail(at, `a say it asks for is to ${SAY_TO.join(", ")}, with its gist`);
    if (t.act === "walk" && !str(t.to)) fail(at, "a walk it asks for names where");
    if (w.aims_at != null && !TEMPT_AIMS.includes(w.aims_at)) fail(at, `aims_at is one of ${TEMPT_AIMS.join(", ")}`);
    return { id: w.id, phase: w.phase, text: w.text, tempts: { ...t }, aims_at: w.aims_at ?? phaseOf[w.phase].aims_at,
      seen_through: (w.seen_through ?? phaseOf[w.phase].seen_through).map(String), slots: slotsIn(w.text) };
  });
  for (const name of Object.keys(phaseOf)) if (!whispers.some((w) => w.phase === name)) fail(`phases.${name}`, "has no temptation");
  const lines = {};
  for (const [k, list] of Object.entries(j.lines ?? {})) {
    if (!Array.isArray(list)) fail(`lines.${k}`, "is a list");
    lines[k] = list.map((l, i) => {
      if (!str(l?.line)) fail(`lines.${k}[${i}]`, "says nothing");
      for (const s of slotsIn(l.line)) if (!MENU_SLOTS.includes(s)) fail(`lines.${k}[${i}]`, `names {${s}}`);
      return { line: l.line, ...(l.phase ? { phase: l.phase } : {}) };
    });
  }
  const endings = {};
  for (const road of ROADS) {
    const e = j.endings?.[road];
    if (!str(e?.text)) fail(`endings.${road}`, "says how it ends");
    endings[road] = { name: str(e.name) ? e.name : road, text: e.text };
  }
  const quotes = (j.canonical_public_lines?.quotes ?? []).map(String).filter(Boolean);
  return { who: j.who, phases: phaseOf, phaseOrder: Object.keys(phaseOf), whispers, lines, endings, quotes };
}

/** A temptation's text with its slots filled by code (every value plain text: "$&" in a name is a name). */
export function fillWhisper(text, fill = {}) {
  return String(text).replace(/\{([a-z_]+)\}/g, (all, slot) => (MENU_SLOTS.includes(slot) && fill[slot] != null ? String(fill[slot]) : all));
}
