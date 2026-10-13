// candy-grammar.mjs — the ONE reading of a candy instance (WLD-27).
//
// Wright, 2026-10-13T00:09Z: town alone makes candy, and candy stays OFF the
// resident-instantiable whitelist. A resident's candy mark exists only as a
// HELD UNIT SET DOWN: the hold door's drop files it, authored by the dropper,
// `kind: sited`, `class: candy`, `label: <a label the candy class carries>`,
// and it names the drop act that set it down — `dropped: act:<id>`.
//
// mark-lint's gate and board-grammar's live-tree check both ask here, so the
// two cannot disagree about what a dropped unit looks like. What this can
// prove is the SHAPE; that the drop act exists is the office's record, and the
// office's placement door is what refuses a fresh candy mark.

/** `labels: [{label, name, creator}]` on the candy class declaration(s). */
export function candyLabelsOf(declarations) {
  return new Set([...(declarations ?? [])].filter((m) => m?.class === "candy")
    .flatMap((m) => (Array.isArray(m.labels) ? m.labels : []))
    .map((l) => (l && typeof l.label === "string" ? l.label : null)).filter(Boolean));
}

export const DROP_ACT_REF = /^act:[1-9][0-9]*$/;

/** Every way this candy instance falls short, as sentences; [] when lawful. */
export function candyInstanceDefects(rec, labels) {
  const out = [];
  if (rec?.kind !== "sited") out.push(`a candy mark is a sited unit — kind: sited (got ${JSON.stringify(rec?.kind)}); its label is \`label:\`, never its kind`);
  const label = typeof rec?.label === "string" ? rec.label : null;
  if (!label) out.push("a candy mark names its label — label: <one of the candy class's labels>");
  else if (!labels.has(label)) out.push(`label: ${JSON.stringify(label)} is no label the candy class carries (registered: ${[...labels].sort().join(", ") || "none yet"})`);
  if (rec?.by !== "the-town" && !DROP_ACT_REF.test(String(rec?.dropped ?? "")))
    out.push("a resident's candy mark is a held unit set down, and names the drop act that set it down — dropped: act:<id>; town alone makes candy, so a candy mark placed fresh by a resident is refused");
  return out;
}

/** A resident-authored candy mark that is a dropped unit, by shape. */
export const isDroppedCandyUnit = (rec, labels) =>
  rec?.class === "candy" && rec?.by !== "the-town" && candyInstanceDefects(rec, labels).length === 0;
