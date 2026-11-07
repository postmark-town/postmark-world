// migrate-logos-v2-w2.mjs — LOGOS v2 part 2, lane W2: the instance kind migration, by one script.
// Usage: node tools/migrate-logos-v2-w2.mjs [<world-tree-root>] [--dry]   (default: this repo)
//
// LOGOS/classes.md § The LOGOS ladder (ruled 2026-10-16 16:02): "The `class:`
// field folds into `kind`: a class node's name is its own slug, so `kind: candy`
// names `the-town/candy`." So every file mark that writes `class: X` beside a
// standing word (`kind: sited`, `kind: post`, …) writes `kind: X` instead, and
// its `class:` line goes. A class node keeps `kind: class` and its own `class:`
// name: it IS the class, it is not an instance of one. Nothing else in a record
// changes, and no directory moves (the freeze).
//
// Instances of post classes are left as they are (below). Run once on the W1
// tree it produces this branch's WORLD/marks; re-run on its own output it
// changes nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");
const { loadMarks } = await import(pathToFileURL(join(ROOT, "tools/marks-fold.mjs")).href);
const marks = loadMarks(join(ROOT, "WORLD/marks"));
const { classIndex, classChain } = await import(pathToFileURL(join(ROOT, "tools/class-properties.mjs")).href);
const idx = classIndex(marks.filter((m) => !m._error));
// Instances of a post class (idea, bounty, funding-quest) keep the form they
// have: posts live in the office's post machine, and a later lane moves those
// records there (settled 2026-10-17, WLD-73 G7). Migrating their kind here would
// be writing a post's shape into a record that is leaving.
const isPostClass = (name) => classChain(idx, name).some((c) => String(c.class) === "post");

const keyOf = (line) => (line.match(/^([A-Za-z_][\w-]*):/) || [])[1];
const tally = {};
let edited = 0;
for (const m of marks) {
  if (m._error || m.kind === "class" || m.kind === "property" || m.class === undefined) continue;
  if (isPostClass(String(m.class))) { tally[`kept: ${m.kind} + class: ${m.class} (a post class)`] = (tally[`kept: ${m.kind} + class: ${m.class} (a post class)`] ?? 0) + 1; continue; }
  const f = join(m._dir, "mark.md");
  const text = readFileSync(f, "utf8");
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)$/);
  if (!fm) throw new Error(`${f}: no frontmatter`);
  const lines = fm[1].split(/\r?\n/);
  const ki = lines.findIndex((l) => keyOf(l) === "kind");
  const ci = lines.findIndex((l) => keyOf(l) === "class");
  if (ki < 0 || ci < 0) throw new Error(`${f}: kind or class line missing`);
  const klass = String(m.class);
  const was = m.kind;
  lines[ki] = `kind: ${klass}`;
  lines.splice(ci, 1);
  const after = `---\n${lines.join("\n")}\n---${fm[2]}`;
  if (after === text) continue;
  if (!DRY) writeFileSync(f, after);
  edited++;
  tally[`${was} + class: ${klass} -> kind: ${klass}`] = (tally[`${was} + class: ${klass} -> kind: ${klass}`] ?? 0) + 1;
}
console.log(JSON.stringify(tally, null, 1));
console.log(`edited ${edited} record(s)${DRY ? " (dry run)" : ""}`);
