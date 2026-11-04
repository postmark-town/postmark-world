// logos-lifetimes.test.mjs — WLD-39: standing / living / fleeting are LIFETIMES,
// not kinds (Darko, Sitting A, 2026-10-12; scope ruled by Wright
// 2026-10-13T08:57:47.829Z). The doctrine lives at LOGOS/lifetimes.md; the old
// path LOGOS/kinds.md stays as a pointer in LOGOS/_archived/ (WLD-116), so
// historical mentions resolve. A mark's `kind` still means only how it stands.
//
// Reads only the LOGOS documents, WORLD/marks/SCHEMA.md and tools/mark-lint.mjs —
// never a mark record, a daily or a receipt. The records that cite the old path
// are the lint's to check both ways (mark-lint.test.mjs § the channel is clean).

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

// The LIVE documents and code that cite the lifetime doctrine (the owner's
// allowed set). Historical dailies, receipts and record bodies are not here,
// by ruling: they may keep the old name, and the redirect resolves it.
const LIVE = [
  "LOGOS/INDEX.md", "LOGOS/STATUS.md",
  "LOGOS/conflict-matrix.md", "WRITE-REGISTRY.md", "tools/mark-lint.mjs",
];
// HISTORICAL, kept whole (STATUS: "historical"; Wright, AUTHORITY
// 2026-10-13T13:18:53.839Z): the 2026-08-09 working record and reconciliation
// are not live doctrine, so they keep the old path as written — their quoted
// `source:` history must agree with marks that still name kinds.md.
const HISTORICAL = ["LOGOS/_archived/DRAFT-REPORT.md", "LOGOS/_archived/RECONCILIATION.md"];
const OLD = /(?<![\w/.-])(?:LOGOS\/)?kinds\.md/g;
const RENDERED_IDS = ["the-town/the-standing-question", "the-town/the-fading", "the-town/the-human-lane"];
const renderedLine = (text) => {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => /^Rendered in the world\b/.test(l));
  if (i < 0) return null;
  let span = lines[i];
  for (let j = i + 1; !/\.\s*$/.test(span) && j < lines.length && lines[j].trim() !== ""; j++) span += " " + lines[j];
  return span;
};

test("the doctrine is at LOGOS/lifetimes.md, titled for lifetimes — no canonical 'The kinds' heading", () => {
  const doc = read("LOGOS/lifetimes.md");
  const title = doc.split("\n")[0];
  assert.match(title, /^# Lifetimes\b/);
  assert.doesNotMatch(title, /kinds/i);
  assert.match(doc, /standing, living and fleeting are \*\*lifetimes\*\*, not kinds/i);
  assert.match(doc, /^## The node$/m, "the doctrine itself moved with it");
});

test("the old path is a pointer, not a second doctrine: it resolves to lifetimes.md and keeps only the rendering its records still cite", () => {
  const stub = read("LOGOS/_archived/kinds.md");
  const links = [...stub.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length && links.every((l) => l === "../lifetimes.md" || l === "INDEX.md"), `links: ${links}`);
  assert.ok(existsSync(join(ROOT, "LOGOS", "lifetimes.md")));
  assert.ok(stub.split("\n").length < 20, "a short pointer");
  assert.doesNotMatch(stub, /^## /m, "no doctrine sections");
  // the three marks that render the doctrine still cite this path (their records
  // are not rewritten), and the lint holds source and Rendered line to each other
  const here = renderedLine(stub);
  assert.ok(here, "the Rendered line stays with the path its marks cite");
  assert.deepEqual([...here.matchAll(/`([^`]+)`/g)].map((m) => m[1]), RENDERED_IDS);
  assert.equal(renderedLine(read("LOGOS/lifetimes.md")), null,
    "lifetimes.md declares no rendering of its own: the marks cite the archived kinds.md, and the lint would hold a second declaration to marks that do not cite it back");
});

test("no LIVE document or code links the old path; every reference names lifetimes.md", () => {
  // STATUS's one row ABOUT the seasonal pointer names it by its file name; that
  // row, and only that row, is set aside — every other line is held to the rule
  const POINTER_ROW = /^\| `_archived\/kinds\.md` \| \*\*archived pointer\*\* \|.*$/m;
  for (const rel of LIVE) {
    const text = rel === "LOGOS/STATUS.md" ? read(rel).replace(POINTER_ROW, "") : read(rel);
    const hits = text.match(OLD) ?? [];
    assert.deepEqual(hits, [], `${rel} still names the old path`);
    assert.match(read(rel), /lifetimes\.md/, `${rel} names the new one`);
  }
});

test("the metamodel parses, and every prose pointer names a file that exists", () => {
  const graph = JSON.parse(read("LOGOS/_archived/graph/metamodel.json"));
  const prose = [];
  (function walk(v) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "prose" && typeof x === "string") prose.push(x); else walk(x); } })(graph);
  assert.ok(prose.includes("LOGOS/lifetimes.md"));
  for (const p of prose) assert.ok(existsSync(join(ROOT, p.split("#")[0])), `prose → ${p}`);
});

test("the relative links into and out of the new document resolve", () => {
  for (const rel of ["LOGOS/lifetimes.md", "LOGOS/_archived/kinds.md", "LOGOS/INDEX.md", "LOGOS/conflict-matrix.md", "WORLD/marks/SCHEMA.md"]) {
    for (const [, target] of read(rel).matchAll(/\]\(([^)#:]+\.md)(?:#[^)]*)?\)/g))
      assert.ok(existsSync(join(ROOT, dirname(rel), target)), `${rel} → ${target}`);
  }
});

// ⚠ SUPERSEDED 2026-10-17 (LOGOS v2 part 2, the data change WLD-73 part 2 owed):
// these two pinned the lint's five kinds and lifetimes.md's sentence about them
// ("the field and its five values are what they were"). lifetimes.md already
// marks that sentence SUPERSEDED (2026-10-16) and names the records, the lint and
// SCHEMA.md as keeping the old filing "until the owed data change". This is it:
// `property` joins, so what is pinned now is that the record's own
// explanation (SCHEMA.md) and the lint agree, kind for kind.
test("the record's own explanation of `kind` names every value the lint accepts — class and property included", () => {
  const kinds = JSON.parse(read("tools/mark-lint.mjs").match(/^const KINDS = new Set\((\[[^\n]+\])\);$/m)[1]);
  assert.deepEqual(kinds, ["sited", "predicate", "predicated", "naming", "parcel", "class", "property"]);
  // only the enumeration sentence of SCHEMA.md, never its superseded quotation
  const explanation = read("WORLD/marks/SCHEMA.md").match(/The field `kind` describes how a record stands[\s\S]*?\(WLD-39\)/)?.[0];
  assert.ok(explanation, "SCHEMA.md explains the kind field");
  for (const kind of kinds) assert.match(explanation, new RegExp(`\\b${kind}\\b`), `the explanation omits ${kind}`);
});

test("`kind` is still how a record stands, and lifetimes are still another word: SCHEMA says so, and the table row is untouched", () => {
  const schema = read("WORLD/marks/SCHEMA.md");
  assert.match(schema, /The field `kind` describes how a record stands — sited, predicate, parcel,\nnaming, `class` or `property` \(note ⁷; a claim's was `predicated` until G10\) — and nothing else: standing, living and fleeting\nare lifetimes/);
  assert.match(schema, /^\| `kind` \| required \| required \| required \| required \|$/m, "the frontmatter table row is untouched");
  const lint = read("tools/mark-lint.mjs");
  assert.match(lint, /cite\("the-town\/the-kinds"\)/, "historical mark ids keep their names");
});

test("THE TWO HISTORIES ARE KEPT WHOLE: STATUS labels them historical, the live census does not claim them, and they still name the old path as written", () => {
  const status = read("LOGOS/STATUS.md");
  for (const rel of HISTORICAL) {
    const name = rel.split("/").pop();
    assert.match(status, new RegExp(`^\\| \`${name.replace(".", "\\.")}\` \\| \\*\\*historical\\*\\*`, "m"), `${name} is labelled historical`);
    assert.ok(!LIVE.includes(rel), `${rel} is not a live file`);
    assert.ok((read(rel).match(OLD) ?? []).length > 0, `${rel} keeps its own words, the old path among them`);
  }
  assert.match(status, /^\| `_archived\/kinds\.md` \| \*\*archived pointer\*\* \|/m, "the pointer is named as a pointer, not doctrine and not history");
});

test("INDEX'S BARE CITATIONS name real LOGOS documents, never the seasonal pointer: `*(kinds)*` was a citation a filename search could not see", () => {
  const index = read("LOGOS/INDEX.md");
  const cites = [...index.matchAll(/\*\(([^)]*)\)\*/g)].map((m) => m[1]);
  assert.ok(cites.length >= 10, `only ${cites.length} citations found — the form changed and this check would be vacuous`);
  const NOT_A_DOCUMENT = new Set(["this document's preamble"]);
  const stems = cites.flatMap((c) => c.split(";")[0].split("·")).map((t) => t.replace(/§.*$/, "").trim()).filter((t) => t && !NOT_A_DOCUMENT.has(t));
  for (const stem of stems) assert.ok(existsSync(join(ROOT, "LOGOS", `${stem}.md`)), `INDEX cites *(${stem})*, and LOGOS/${stem}.md does not exist`);
  assert.ok(!stems.includes("kinds"), "INDEX cites the seasonal pointer as if it were doctrine: cite *(lifetimes)*");
  assert.ok(stems.includes("lifetimes"), "the lifetime doctrine is cited where the node law is stated");
});
