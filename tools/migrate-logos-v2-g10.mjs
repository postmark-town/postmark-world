// migrate-logos-v2-g10.mjs — LOGOS v2 part 2, W2's G10: a claim's kind names its class.
// Usage: node tools/migrate-logos-v2-g10.mjs [<world-tree-root>] [--dry]   (default: this repo)
//
// Settled 2026-10-17 (WLD-73 G10): `kind: predicated` becomes `kind: predicate`.
// `predicated` was how a mark stood; the class is `the-town/predicate`, and since
// the kind migration a record's kind names its class (LOGOS/classes.md § The
// LOGOS ladder). `slot` and `value` stay: a claim's name is the claimant's words.
// A naming keeps `kind: naming` (its own class). The instances of a post class
// (the 3 predicated ideas) keep their old form until the post lane (G7). Nothing
// else in a record changes, and no directory moves (the freeze).
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");
const { loadMarks } = await import(pathToFileURL(join(ROOT, "tools/marks-fold.mjs")).href);
const { classIndex, classChain } = await import(pathToFileURL(join(ROOT, "tools/class-properties.mjs")).href);
const marks = loadMarks(join(ROOT, "WORLD/marks"));
const idx = classIndex(marks.filter((m) => !m._error));
const isPostClass = (name) => classChain(idx, name).some((c) => String(c.class) === "post");

let edited = 0, kept = 0;
for (const m of marks) {
  if (m._error || m.kind !== "predicated") continue;
  if (m.class !== undefined && isPostClass(String(m.class))) { kept++; continue; }
  const f = join(m._dir, "mark.md");
  const text = readFileSync(f, "utf8");
  const after = text.replace(/^(---\r?\n(?:[^\n]*\n)*?)kind: predicated(\r?\n)/, "$1kind: predicate$2");
  if (after === text) throw new Error(`${f}: no kind: predicated line`);
  if (!DRY) writeFileSync(f, after);
  edited++;
}
console.log(`edited ${edited} record(s), kept ${kept} post-class record(s)${DRY ? " (dry run)" : ""}`);
