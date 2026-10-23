// law.mjs — WHAT IS LAW, AND WHAT IS A CLASS. The one test (WLD-116, Darko
// 2026-10-23 13:47-13:50).
//
// Classes are LAW NODES, never marks: `postmark-node` -> mark | post | law. A law
// node is a class (`kind: class`) or one of a class's properties (`kind: property`)
// filed in a FOUNDRY, which is a directory under WORLD/law/. The Keeping Works is
// Postmark's book, the first foundry, at the constitution tier. A biome's foundry
// holds `tier: biome` nodes that extend it; Pando Peak is the next. A mark stands
// on the ground; a law node has no where ("law has no where", 2026-08-18).
//
// Before this file the world asked "is this a class?" five different ways, and
// every one of them pinned the Keeping Works (AUDIT § 4.2): the lint roster (a
// walk up to the-town/the-keeping-works), classIndex (`kind: class` + `by: the-town`
// anywhere), the fold's flow (a `class:` under the Works), the icons (`kind: class`)
// and the creatures (`kind: class` + the town). A second foundry could not have
// been read. This file is the one answer; each of those asks it.
//
// PURE and browser-safe on purpose: the viewer reads classes through it, so it
// touches no file. The file reading is tools/law-tree.mjs. A foundry is
// CONFIGURATION: WORLD/law/<foundry>/foundry.json names its tier, the foundry it
// extends, its seat (the landmark mark) and the authors who may declare in it.
// Standing up Pando Peak's foundry is a new directory and a new foundry.json; no
// line here or in the lint changes.
//
// THE RULES (every one is a function below, and law.test.mjs holds each):
//   1. A class is a law node: `kind: class`, in a foundry. The foundry is named on
//      the record (`foundry:`), set by the loader from the directory, never
//      authored in the file. A record with no foundry is read as the Keeping
//      Works' only if the town wrote it (in-memory records older than the law
//      tree: fixtures, a store's snapshot).
//   2. A foundry has one tier, and its class nodes carry it: `constitution` for
//      the Keeping Works, `biome` for a biome's. `biome` is refused in the
//      Keeping Works and on marks for now (the tier ladder is market <
//      sovereignty < biome < constitution; marks use the first two and the
//      town's own constitution, and the biome rung is law's alone).
//   3. A foundry extends one other foundry, or none. The ladder runs label ->
//      biome class -> town class: a biome class may extend a Keeping Works class;
//      the reverse is refused (the town never depends on a biome).
//   4. A class name is one class. The same name declared in two foundries is
//      refused unless one foundry extends the other, and then only as a
//      refinement: the same `extends` (the same rung of the ladder), the nearer
//      foundry's word winning for the readers of its own world. A foundry
//      "extends the town's and never contradicts it" (CORE-3/k).
//   5. Only a foundry's authors declare in it (the town, in v0: /f, "town-written
//      first").

export const KEEPING_WORKS = "the-keeping-works";
export const TOWN = "the-town";
export const LAW_ROOT = "WORLD/law";
export const NODE_FILE = "node.md";
export const FOUNDRY_FILE = "foundry.json";
/** The kinds a law node can be: a class, or a property of one. */
export const LAW_KINDS = Object.freeze(["class", "property"]);
/** The tiers a FOUNDRY can hold its classes at (rule 2). A mark's tiers are marks-fold's own. */
export const FOUNDRY_TIERS = Object.freeze(["constitution", "biome"]);
/** The whole ladder, lowest first: the one shared language for global versus local. */
export const TIER_LADDER = Object.freeze(["draft", "market", "sovereignty", "biome", "constitution"]);
export const tierRankOf = (tier) => TIER_LADDER.indexOf(String(tier));
/** A property's own `tier:` is a different line: whose word decides its value. */
export const PROPERTY_TIERS = Object.freeze(["constitution", "sovereign"]);

/** Is this record's kind a law kind (class or property)? Where it is filed is another question: see isLawNode. */
export const isLawKind = (rec) => LAW_KINDS.includes(rec?.kind);

/**
 * The foundry a record belongs to, or null. A loaded law node names it. A record
 * older than the law tree (a fixture, a store's snapshot) names none, and is read
 * as the Keeping Works' when the town wrote it (or no one is named): that is the one place the old
 * reading survives, so a store folded before the move still folds.
 */
export function foundryOf(rec) {
  if (!isLawKind(rec)) return null;
  if (typeof rec.foundry === "string" && rec.foundry) return rec.foundry;
  // (a record that names no author at all, a fixture's, is read as the town's: nobody else declares law)
  return (rec.by ?? rec.household ?? TOWN) === TOWN ? KEEPING_WORKS : null;
}

/** THE ONE TEST. Is this record a class? A law node of kind class, in a foundry. */
export const isClass = (rec) => rec?.kind === "class" && foundryOf(rec) != null;
/** A property node: a class's property, or a property's own child (its caps and bounds). */
export const isProperty = (rec) => rec?.kind === "property";
/** A class or a property. What the law tree holds. */
export const isLawNode = (rec) => isClass(rec) || isProperty(rec);

/**
 * Split a list of records into the law and the marks. A fold, a lint and a
 * snapshot each take whatever they are handed, and a law node found among marks
 * (a store's snapshot older than the move) is law all the same: the marks come
 * back without it. Order is kept in both halves.
 */
export function splitLaw(records) {
  const marks = [], law = [];
  for (const r of records ?? []) (isLawNode(r) ? law : marks).push(r);
  return { marks, law };
}

/** The union of two law lists by id (first wins), for a caller that holds some of each. */
export function mergeLaw(...lists) {
  const seen = new Set(), out = [];
  for (const list of lists) for (const n of list ?? []) {
    if (n?.id != null && seen.has(n.id)) continue;
    if (n?.id != null) seen.add(n.id);
    out.push(n);
  }
  return out;
}

/** The classes of a list of records, in order. */
export const classesOf = (records) => (records ?? []).filter(isClass);

/** The set of class NAMES a list of records declares: the roster an instance's `kind:` is held to. */
export const classRoster = (records) => new Set(classesOf(records).map((c) => String(c.class)));

// ── FOUNDRIES (configuration) ───────────────────────────────────────────────

/**
 * Read foundry configs into a table. Each config: { foundry, tier, extends, seat,
 * authors }. Returns { table: Map(name -> config), problems: [string] }. Problems
 * are the config's own faults (an unknown tier, an `extends` that names no
 * foundry, a cycle, a second foundry with no root); the table still carries every
 * config it could read so one bad foundry never blinds the rest.
 */
export function foundryTable(configs) {
  const table = new Map();
  const problems = [];
  for (const c of configs ?? []) {
    if (!c || typeof c.foundry !== "string" || !c.foundry) { problems.push("a foundry config names no foundry"); continue; }
    if (table.has(c.foundry)) { problems.push(`foundry ${c.foundry} is configured twice`); continue; }
    table.set(c.foundry, {
      foundry: c.foundry,
      tier: c.tier,
      extends: c.extends ?? null,
      seat: c.seat ?? null,
      authors: Array.isArray(c.authors) && c.authors.length ? c.authors.map(String) : [TOWN],
    });
  }
  for (const f of table.values()) {
    if (!FOUNDRY_TIERS.includes(f.tier)) problems.push(`foundry ${f.foundry}: tier ${JSON.stringify(f.tier)} is none of ${FOUNDRY_TIERS.join(" | ")}`);
    if (f.extends != null && !table.has(f.extends)) problems.push(`foundry ${f.foundry} extends ${JSON.stringify(f.extends)}, which is no foundry here`);
    if (f.extends != null && f.extends === f.foundry) problems.push(`foundry ${f.foundry} extends itself`);
  }
  // exactly one foundry has no parent, and it is the constitution tier; every other chain ends there
  for (const f of table.values()) {
    const chain = foundryChain(table, f.foundry);
    if (chain.cycle) problems.push(`foundry ${f.foundry}: the extends chain closes on itself (${chain.names.join(" -> ")})`);
    else {
      const top = table.get(chain.names.at(-1));
      if (top && top.tier !== "constitution") problems.push(`foundry ${f.foundry}: its chain ends at ${top.foundry}, which is tier ${top.tier}, not constitution — every foundry extends the town's book`);
      if (f.tier === "constitution" && f.extends != null) problems.push(`foundry ${f.foundry} is constitution tier and so extends nothing (it is the book the others extend)`);
      if (f.tier === "biome" && f.extends == null) problems.push(`foundry ${f.foundry} is biome tier and extends nothing — a biome extends the town's book`);
    }
  }
  return { table, problems };
}

/** A foundry's chain, nearest first: [foundry, the one it extends, ...]. `cycle: true` when it closes. */
export function foundryChain(table, name) {
  const names = [];
  const seen = new Set();
  for (let n = name; n != null && table.has(n); n = table.get(n).extends) {
    if (seen.has(n)) return { names, cycle: true };
    seen.add(n);
    names.push(n);
  }
  return { names, cycle: false };
}

/** Does foundry `a` extend foundry `b`, directly or through others? */
export const foundryExtends = (table, a, b) => a !== b && foundryChain(table, a).names.includes(b);
/** Are two foundries one in the other's chain, either way? */
export const foundriesRelated = (table, a, b) => foundryExtends(table, a, b) || foundryExtends(table, b, a);

// ── THE LAW, CHECKED ────────────────────────────────────────────────────────

/**
 * Hold a list of law nodes to the foundry rules (2, 3, 4, 5 above). Returns
 * [{ id, rule, msg }]; empty is lawful. `table` is foundryTable's. Nodes of an
 * unknown foundry are one finding each. PURE: it reads the records it is handed.
 */
export function lawProblems(nodes, table) {
  const out = [];
  const say = (n, rule, msg) => out.push({ id: n.id, rule, msg });
  const classes = [];
  for (const n of nodes ?? []) {
    if (n?._error || !isLawNode(n)) continue;
    const name = foundryOf(n);
    const f = table.get(name);
    if (!f) { say(n, "foundry", `${n.id} stands in foundry ${JSON.stringify(name)}, which has no ${FOUNDRY_FILE} — a foundry is a directory under ${LAW_ROOT}/ with its config`); continue; }
    const author = n.by ?? n.household;
    if (!f.authors.includes(String(author))) say(n, "authors", `${n.id} is by ${author}, but ${f.foundry} is written by ${f.authors.join(", ")} only (v0: the town's constitutional process, WLD-116/f)`);
    if (n.kind === "class") {
      classes.push(n);
      if (n.tier !== f.tier) {
        const hint = n.tier === "biome" ? ` — biome is refused in ${f.foundry}: a foundry's classes carry its own tier` : "";
        say(n, "tier", `${n.id} carries tier: ${n.tier}, but ${f.foundry} holds ${f.tier}-tier classes${hint}`);
      }
    }
  }
  // names: one name, one class
  const byName = new Map();
  for (const c of classes) {
    const k = String(c.class);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(c);
  }
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    const foundries = list.map((c) => foundryOf(c));
    // two declarations in ONE foundry are the lint's duplicate-name finding, not this rule's
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], fa = foundryOf(a), fb = foundryOf(b);
      if (fa === fb) continue;
      if (!foundriesRelated(table, fa, fb)) { say(b, "name", `the name ${JSON.stringify(name)} is declared in ${fa} (${a.id}) and in ${fb} (${b.id}), and neither foundry extends the other — kind: ${name} must name one class`); continue; }
      // related: a refinement keeps the rung of the ladder
      const [near, far] = foundryExtends(table, fa, fb) ? [a, b] : [b, a];
      if (String(near.extends ?? "") !== String(far.extends ?? ""))
        say(near, "name", `${near.id} (${foundryOf(near)}) redeclares ${JSON.stringify(name)} with extends ${JSON.stringify(near.extends ?? null)}, but ${far.id} (${foundryOf(far)}) has it at ${JSON.stringify(far.extends ?? null)} — a foundry extends the town's and never contradicts it (CORE-3/k)`);
    }
  }
  // extends: the ladder runs down the chain, never up. A class extends a class of
  // its own foundry or of an ancestor foundry; one declared only in a foundry that
  // extends it (or in an unrelated one) is refused. A parent named nowhere is the
  // lint's finding: it knows the whole roster.
  for (const c of classes) {
    if (c.extends == null || c.extends === "") continue;
    const declared = byName.get(String(c.extends)) ?? [];
    if (!declared.length) continue;
    const reach = foundryChain(table, foundryOf(c)).names;
    if (declared.some((d) => reach.includes(foundryOf(d)))) continue;
    const where = foundryOf(declared[0]);
    say(c, "extends", `${c.id} (${foundryOf(c)}) extends ${JSON.stringify(c.extends)}, declared in ${where} — a class extends its own foundry's classes or an ancestor foundry's, never a foundry that extends it (the town never depends on a biome)`);
  }
  return out;
}

/**
 * The classes in the order a class index reads them: the nearest-to-the-town
 * foundry first, so a name's first declaration is the town's, except where a
 * nearer (more extending) foundry refines it (rule 4), whose word then wins for
 * readers of the whole law. Within a foundry, the order given. A name declared
 * once is unaffected.
 */
export function inReadingOrder(nodes, table) {
  const depth = (n) => foundryChain(table, foundryOf(n)).names.length;
  const refined = new Set();
  const byName = new Map();
  for (const n of nodes ?? []) if (isClass(n)) { const k = String(n.class); byName.set(k, [...(byName.get(k) ?? []), n]); }
  for (const [, list] of byName) if (list.length > 1) { const win = [...list].sort((a, b) => depth(b) - depth(a))[0]; refined.add(win.id); }
  // a refining node goes first so classIndex's first-wins picks it; all others keep their order
  return [...(nodes ?? [])].sort((a, b) => (refined.has(b.id) ? 1 : 0) - (refined.has(a.id) ? 1 : 0));
}

/** The extend chain across foundries, nearest first, as class names: label -> biome class -> town class. */
export function ladderOf(nodes, name, { cap = 64 } = {}) {
  const byName = new Map();
  for (const n of nodes ?? []) if (isClass(n) && !byName.has(String(n.class))) byName.set(String(n.class), n);
  const out = [];
  const seen = new Set();
  for (let c = byName.get(String(name)); c && !seen.has(c.id) && out.length < cap; c = c.extends ? byName.get(String(c.extends)) : null) {
    seen.add(c.id);
    out.push({ class: String(c.class), id: c.id, foundry: foundryOf(c), tier: c.tier });
  }
  return out;
}
