// candy-grammar.test.mjs — WLD-27: a dropped unit settles; a placed candy is refused.
//
// Wright, 2026-10-13T00:09Z: a dropped unit is `kind: sited`, `class: candy`,
// `label: <slug>`, authored by the dropper; candy stays OFF the whitelist, so a
// resident placing a fresh candy mark is refused. This drives the real gate
// (mark-lint, as the fleet and the PR lane run it) on a fixture tree whose
// candy class carries SYNTHETIC labels, and the shared predicate directly.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, cpSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { candyLabelsOf, candyInstanceDefects, isDroppedCandyUnit } from "./candy-grammar.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL = join(HERE, "..", "WORLD", "marks", "let-there-be-light");
const LINT = join(HERE, "mark-lint.mjs");
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

// SYNTHETIC labels — never the town's real assignments.
const LABELS = [{ label: "test-comets", name: "Test Comets", creator: "sbx-ana" }];

function fixture(unit) {
  const dir = mkdtempSync(join(tmpdir(), "candylint-"));
  dirs.push(dir);
  const root = join(dir, "let-there-be-light");
  mkdirSync(root, { recursive: true });
  copyFileSync(join(REAL, "mark.md"), join(root, "mark.md"));
  cpSync(join(REAL, "logos"), join(root, "logos"), { recursive: true });
  const works = join(root, "the-keeping-works");
  mkdirSync(join(works, "candy"), { recursive: true });
  writeFileSync(join(works, "mark.md"),
    "---\nkind: sited\nby: the-town\ntier: constitution\ndate: 2026-08-11\nat: { x: 400, y: 400 }\nextent: { w: 40, h: 40 }\n---\n\nThe Keeping Works.\n");
  writeFileSync(join(works, "candy", "mark.md"),
    `---\nkind: class\nby: the-town\ntier: constitution\ndate: 2026-10-13\nclass: candy\nversion: 1\ndials: {}\nlabels: ${JSON.stringify(LABELS)}\n---\n\nCandy comes in labels.\n`);
  if (unit) {
    const at = join(root, "a-unit");
    mkdirSync(at, { recursive: true });
    const fm = { kind: "sited", by: "sbx-bo", date: "2026-10-13", at: "{ x: 0, y: 0 }", extent: "{ w: 1, h: 1 }", class: "candy", label: "test-comets", dropped: "act:41", ...unit };
    const lines = Object.entries(fm).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join("\n");
    writeFileSync(join(at, "mark.md"), `---\n${lines}\n---\n\nOne Test Comet, set down here.\n`);
  }
  try { return execFileSync("node", [LINT, "--marks-dir", dir], { encoding: "utf8" }); }
  catch (e) { return String(e.stdout ?? "") + String(e.stderr ?? ""); }
}

test("a dropped unit (sited, candy, a registered label, the drop act named) passes the gate", () => {
  const out = fixture({});
  assert.doesNotMatch(out, /ERROR[^\n]*a-unit/, out.split("\n").filter((l) => /a-unit/.test(l)).join("\n"));
});

test("a resident placing a fresh candy mark (no drop act) is refused by name", () => {
  assert.match(fixture({ dropped: undefined }), /ERROR[^\n]*a-unit[^\n]*town alone makes candy, so a candy mark placed fresh by a resident is refused/);
  assert.match(fixture({ dropped: "act:0" }), /ERROR[^\n]*a-unit[^\n]*dropped: act:<id>/);
  assert.match(fixture({ dropped: "yes" }), /ERROR[^\n]*a-unit[^\n]*dropped: act:<id>/);
});

test("the label is the identity field and must be registered; the mark's kind stays how it stands", () => {
  assert.match(fixture({ label: "not-a-label" }), /label: "not-a-label" is no label the candy class carries \(registered: test-comets\)/);
  assert.match(fixture({ label: undefined }), /a candy mark names its label/);
  assert.match(fixture({ kind: "predicated", at: undefined, extent: undefined, slot: "x", value: "y" }), /a candy mark is a sited unit — kind: sited/);
});

test("the town's own candy mark needs no drop act", () => {
  assert.doesNotMatch(fixture({ by: "the-town", dropped: undefined }), /ERROR[^\n]*a-unit/);
});

test("the shared predicate: dropped unit yes, placed candy no, other classes never", () => {
  const labels = candyLabelsOf([{ class: "candy", labels: LABELS }, { class: "thing", labels: [{ label: "nope" }] }]);
  assert.deepEqual([...labels], ["test-comets"]);
  const unit = { kind: "sited", class: "candy", by: "sbx-bo", label: "test-comets", dropped: "act:41" };
  assert.equal(isDroppedCandyUnit(unit, labels), true);
  assert.deepEqual(candyInstanceDefects(unit, labels), []);
  assert.equal(isDroppedCandyUnit({ ...unit, dropped: undefined }, labels), false);
  assert.equal(isDroppedCandyUnit({ ...unit, label: "nope" }, labels), false);
  assert.equal(isDroppedCandyUnit({ ...unit, class: "thing" }, labels), false);
  assert.equal(isDroppedCandyUnit({ ...unit, by: "the-town" }, labels), false, "a town candy is not a resident's dropped unit");
});
