// class-dials.mjs — a class's dials read straight off its FILES (LOGOS v2 part 2).
//
// "Every dial is a property, and a locked value is its default" (ruled
// 2026-10-16): what a class node once wrote inline as `dials: {…}` stands now as
// `kind: property` nodes in the directories under it. The suites that read the
// record's files rather than the store (the record is the law; a store is a
// projection of it) read a class's dials through this, so each keeps reading
// the file and not a copy.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseRecord } from "./marks-fold.mjs";
import { propertyValue } from "./class-properties.mjs";

/** The property nodes standing directly under a class (or property) file, as records. */
export function propertyFilesUnder(markFile) {
  const dir = dirname(markFile);
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    // a property is a law node (WLD-116): node.md in the law tree; mark.md is the old filing
    const f = [join(dir, e.name, "node.md"), join(dir, e.name, "mark.md")].find((p) => existsSync(p));
    if (!f) continue;
    const rec = parseRecord(readFileSync(f, "utf8"), f);
    if (rec.kind === "property") out.push({ ...rec, slug: e.name, file: f });
  }
  return out;
}

/** `{ name: value }` for the properties directly under a class file: its dials
 *  (a child property, which names its parent in `of:`, is its parent's, not the class's). */
export function dialsOf(markFile) {
  const out = {};
  for (const p of propertyFilesUnder(markFile)) if (p.of === undefined) out[p.name] = propertyValue(p.default);
  return out;
}
