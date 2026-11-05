// logos-span-h-generator.test.mjs — the span_h node is generated from LOGOS's own script, and says it is unused (WLD-131).
//
// The creature class's span_h node is written by tools/migrate-logos-v2-w1.mjs (LOGOS v2 part 2), which turns a class's
// `dials:` line into property nodes with the bodies it carries. Creatures do not fade (WLD-96, ruled 2026-10-21), so
// that body now says the node is unused, and that it stands until the town retires it by its own act (a PR cannot:
// the harm gate holds a law node's loss to a sweep act, WLD-158). The old body, "Hours a creature lasts from its own
// spawn", would still teach the fade.
//
// The road is run for real: an invented minimal tree (a class with a span_h dial, as the tree was before the script
// first ran), the real script over it, and the node it writes compared byte for byte with the committed one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "tools/migrate-logos-v2-w1.mjs");
const NODE_DIR = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-node";
const SPAN_NODE = `${NODE_DIR}/entity/creature/creature-span-h/mark.md`;

// the classes the script looks up by name, each a bare class mark under the invented tree
const NAMED = ["mark", "predicate", "thing", "resident", "note", "parcel", "portal-ground", "vehicle", "adversary", "dungeon",
  "home-mark", "stairs", "funding-quest", "town", "timetable", "stakeable", "idea", "bounty"];
const classMark = (name, extra = "") => `---\nkind: class\nby: the-town\ntier: constitution\ndate: 2026-10-15\nclass: ${name}\nversion: 1\nextends: postmark-node\n${extra}---\n\nAn invented ${name}.\n`;

function inventedTree() {
  const root = mkdtempSync(join(tmpdir(), "span-h-gen-"));
  symlinkSync(join(ROOT, "tools"), join(root, "tools"));
  const put = (dir, text) => { mkdirSync(join(root, dir), { recursive: true }); writeFileSync(join(root, dir, "mark.md"), text); };
  put(NODE_DIR, classMark("postmark-node").replace("extends: postmark-node\n", ""));
  for (const n of NAMED) put(`${NODE_DIR}/${n === "mark" ? "mark" : `mark/${n}`}`, classMark(n));
  put(`${NODE_DIR}/entity`, classMark("entity"));
  put(`${NODE_DIR}/entity/creature`, classMark("creature", "dials: {\"span_h\":12}\n").replace("extends: postmark-node", "extends: entity"));
  return root;
}

const generate = () => {
  const root = inventedTree();
  execFileSync(process.execPath, [SCRIPT, root], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return readFileSync(join(root, SPAN_NODE), "utf8");
};

test("the script writes the span_h node, byte for byte the committed one, and it says it is unused", () => {
  const written = generate();
  assert.equal(written, readFileSync(join(ROOT, SPAN_NODE), "utf8"), "the committed node is the script's output, not a hand edit");
  assert.match(written, /^name: span_h$/m);
  assert.match(written, /^default: 12$/m, "its id, tier and default are as they were");
  assert.match(written, /Not used: creatures don't fade \(WLD-96, ruled 2026-10-21\)\. This node stands until the town retires it by its own act\.\n$/);
  assert.doesNotMatch(written, /Hours a creature lasts|lasts from its own spawn|replay/i, "neither the old twelve-hour meaning nor a false replay reason");
});

test("the generator's tree is invented, not residents'", () => {
  const root = inventedTree();
  const files = [];
  (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (f === "tools") continue; statSync(p).isDirectory() ? walk(p) : files.push(p); } })(join(root, "WORLD"));
  assert.ok(files.length >= 18 && files.every((f) => /An invented /.test(readFileSync(f, "utf8"))));
});
