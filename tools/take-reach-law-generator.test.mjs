// take-reach-law-generator.test.mjs — a take reaches as far as a give, and the-reach node says so (WLD-79).
//
// LAW (Darko, 2026-10-19 18:49 EDT, WLD-79): "(b), 60 m, one rule for give and take", "until proven it's an issue".
// The door admits a take from a thing's extent or from within earshot (earshot_m, 60 m); the law text said extent only.
// LOGOS/classes.md § The reach of a hold now says what the door does, and the generated `the-town/the-reach` node
// (kind property, under the attach class) carries the same words.
//
// The node is not hand-edited: tools/migrate-logos-v2-w1.mjs writes its default and body, the way WLD-131's span_h node
// is written. The road is run for real: an invented tree holding the-reach as it stood before the script first ran (a
// predicate, with the old extent-only words), the real script over it, and the node it writes compared byte for byte
// with the committed one. The old words are the control: the same road must have changed them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "tools/migrate-logos-v2-w1.mjs");
const NODE_DIR = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-node";
const REACH = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-edge/attach/the-reach/mark.md";
const REACH_IN_INVENTED = `${NODE_DIR}/attach/the-reach/mark.md`;

// the classes the script looks up by name, each a bare class mark under the invented tree
const NAMED = ["mark", "predicate", "thing", "resident", "note", "parcel", "portal-ground", "vehicle", "adversary", "dungeon",
  "home-mark", "stairs", "funding-quest", "town", "timetable", "stakeable", "idea", "bounty"];
const classMark = (name, extra = "") => `---\nkind: class\nby: the-town\ntier: constitution\ndate: 2026-10-15\nclass: ${name}\nversion: 1\nextends: postmark-node\n${extra}---\n\nAn invented ${name}.\n`;
// the-reach as it was filed before the script first ran: a predicate, the extent-only words (git: a395a5bd9^)
const OLD_REACH = "---\nkind: predicated\nby: the-town\ntier: constitution\ndate: 2026-09-07\nslot: reach\nvalue: within the thing's extent to take; where you stood to set down; within earshot to give\nsource: LOGOS/classes.md\n---\n\nA take stands within the thing's extent as an entry stands at its threshold; a set-down stands where you stood; a give is a take at arm's length.\n";

function inventedTree() {
  const root = mkdtempSync(join(tmpdir(), "take-reach-gen-"));
  symlinkSync(join(ROOT, "tools"), join(root, "tools"));
  const put = (dir, text) => { mkdirSync(join(root, dir), { recursive: true }); writeFileSync(join(root, dir, "mark.md"), text); };
  put(NODE_DIR, classMark("postmark-node").replace("extends: postmark-node\n", ""));
  for (const n of NAMED) put(`${NODE_DIR}/${n === "mark" ? "mark" : `mark/${n}`}`, classMark(n));
  put(`${NODE_DIR}/attach`, classMark("attach"));
  put(`${NODE_DIR}/attach/the-reach`, OLD_REACH);
  return root;
}
const run = (root) => execFileSync(process.execPath, [SCRIPT, root], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

test("the script writes the-reach node, byte for byte the committed one: a take reaches earshot, as a give does", () => {
  const root = inventedTree();
  assert.match(readFileSync(join(root, REACH_IN_INVENTED), "utf8"), /value: within the thing's extent to take;/, "control: the invented node starts extent-only");
  run(root);
  const written = readFileSync(join(root, REACH_IN_INVENTED), "utf8");
  assert.equal(written, readFileSync(join(ROOT, REACH), "utf8"), "the committed node is the script's output, not a hand edit");
  assert.match(written, /^kind: property$/m);
  assert.match(written, /^name: reach$/m);
  assert.match(written, /^default: within the thing's extent or within earshot \(earshot_m, 60 m\) to take; where you stood to set down; within earshot \(earshot_m, 60 m\) to give$/m,
    "take and give carry one number");
  assert.doesNotMatch(written, /as an entry stands at its threshold|extent to take;/, "neither the old threshold comparison nor the extent-only take survives");
  assert.match(written, /\n\nA take stands within the thing's extent or within earshot of it \(earshot_m, 60 m\), the same reach a give has;/);
});

test("the script is re-runnable: a second run over its own output changes nothing", () => {
  const root = inventedTree();
  run(root);
  const once = readFileSync(join(root, REACH_IN_INVENTED), "utf8");
  const second = run(root);
  assert.equal(readFileSync(join(root, REACH_IN_INVENTED), "utf8"), once);
  assert.doesNotMatch(second, /EDIT the-town\/the-reach/, "the second run reports no edit to the-reach");
});

test("a tree with no the-reach is skipped by name in the log, and the real tree is never skipped", () => {
  const root = inventedTree();
  // an invented tree without the node: overwrite it with a different mark id (no deletion)
  writeFileSync(join(root, REACH_IN_INVENTED), OLD_REACH.replace("by: the-town", "by: someone-else"));
  assert.match(run(root), /SKIP the-town\/the-reach: no such node/);
  const real = execFileSync(process.execPath, [SCRIPT, ROOT, "--dry"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.doesNotMatch(real, /SKIP the-town\/the-reach/, "the committed tree holds the node");
  assert.doesNotMatch(real, /EDIT the-town\/the-reach/, "and the node is already the script's output");
});

// A text pin, the weakest instrument, labelled so: LOGOS/classes.md is prose, and no code reads it. It sees that the
// take bullet and the give bullet carry the one number and that the old extent-only sentence is gone.
test("LAW (text pin) LOGOS/classes.md § The reach of a hold: a take reaches earshot_m (60 m), the same as a give", () => {
  const text = readFileSync(join(ROOT, "LOGOS/classes.md"), "utf8").replace(/\r?\n\s*/g, " ");
  const at = text.indexOf("**The reach of a hold");
  assert.ok(at > 0, "the section is found");
  const section = text.slice(at, text.indexOf("- **The receipt's vocabulary is the card's.**", at));
  assert.ok(section.length > 800, "the slice is the section, not nothing");
  assert.match(section, /\*\*A take reaches as far as a give\.\*\* To take a thing you stand within its extent or within `earshot_m` of its point \(60 m\), the same measure a give uses;/);
  assert.match(section, /a take from farther is refused, and the refusal names the distance, the direction and the walk that closes it/);
  assert.match(section, /A give is a take at arm's length\.\*\* Giver and receiver stand within reach of each other \(`earshot_m` of the say edge, 60 m,/);
  assert.match(section, /"\(b\), 60 m, one rule for give and take"/, "the ruling is quoted");
  assert.doesNotMatch(section, /A take is a threshold act|a take from outside that extent is refused/, "the extent-only sentences are gone");
});
