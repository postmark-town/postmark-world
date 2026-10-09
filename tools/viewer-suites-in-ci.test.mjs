// viewer-suites-in-ci.test.mjs — the browser is CI's, declared, and never the
// box's (POS-372, ruled 09-14).
//
// The viewer suites drive the World page in headless Chromium. They used to
// find playwright through a hard-coded path into one operator's checkout, so CI
// and the box skipped all of them and a viewer red could reach main unseen.
// These [pin]s hold the three halves of the fix as text: no file reaches into a
// checkout for playwright, playwright is a pinned devDependency (never a runtime
// one, which would put a browser on the box through the site's install), and
// the suite workflow installs it and refuses a run where a viewer suite skipped
// for want of it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

function sources(dir) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory() && entry.name !== "node_modules") out.push(...sources(rel));
    else if (/\.(mjs|js)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test("[pin] no file finds playwright through somebody's checkout", () => {
  const reaching = [...sources("tools"), ...sources("spectator")]
    .filter((rel) => rel !== "tools/viewer-suites-in-ci.test.mjs")
    .filter((rel) => /file:\/\/\/[^"'`]*node_modules\/playwright/.test(read(rel)));
  assert.deepEqual(reaching, [], "playwright resolves from this package's own devDependency, nowhere else");
});

test("[pin] playwright is a pinned devDependency and never a runtime one", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies?.playwright, undefined, "a runtime dependency would reach the box through the site's install");
  assert.match(pkg.devDependencies?.playwright ?? "", /^\d+\.\d+\.\d+$/, "an exact version, so the lockfile and the browser build agree");
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(lock.packages["node_modules/playwright"]?.version, pkg.devDependencies.playwright);
  assert.equal(lock.packages["node_modules/playwright"]?.dev, true);
});

test("[pin] the suite installs the browser and fails a run where a viewer suite skipped for want of it", () => {
  const yaml = read(".github/workflows/suite.yml");
  assert.match(yaml, /npm ci\b/);
  assert.match(yaml, /npx playwright install --with-deps chromium/);
  assert.match(yaml, /playwright is absent\|NO PLAYWRIGHT/, "the skip guard names both of the viewer suites' skip phrasings");
  // and the rehearsal stays install-free: it runs the tree's sweep, never a browser
  assert.doesNotMatch(read(".github/workflows/crossing-rehearsal.yml").split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n"), /npm (ci|install)/);
});
