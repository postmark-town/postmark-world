// source-no-nul.test.mjs — no tracked .mjs source carries a raw NUL byte.
//
// A raw 0x00 in source makes git treat the whole file as binary, so its diffs
// vanish from review. Runtime NUL delimiters (compound keys, a HOLE sentinel)
// are written as the printable escape backslash-zero, which is the same string
// to the runtime. POS-529.
//
// The scan reads WORKING-TREE BYTES of every tracked .mjs (git ls-files -z, so
// names with spaces survive), never the index. Generated resident data
// (src/data/postmark) is excluded from enumeration and never read.
//
//   node --test tools/source-no-nul.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXCLUDED = "src/data/postmark";

// Scan `root`'s tracked .mjs files. Throws on any enumeration or read error;
// never returns an empty enumeration as a pass.
function scanTrackedMjs(root) {
  const out = execFileSync(
    "git",
    ["-C", root, "ls-files", "-z", "--", "*.mjs", `:(exclude)${EXCLUDED}`],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  const paths = out.toString("utf8").split("\0").filter(Boolean)
    .filter((p) => p !== EXCLUDED && !p.startsWith(EXCLUDED + "/"));
  if (paths.length === 0) throw new Error(`git ls-files listed no tracked .mjs under ${root}`);
  const offenders = [];
  let occurrences = 0;
  for (const p of paths) {
    const bytes = readFileSync(join(root, p)); // a read error throws
    let at = bytes.indexOf(0);
    if (at < 0) continue;
    const lines = [];
    for (; at >= 0; at = bytes.indexOf(0, at + 1)) {
      occurrences++;
      lines.push(bytes.subarray(0, at).toString("latin1").split("\n").length);
    }
    offenders.push({ path: p, lines });
  }
  return { files: paths.length, occurrences, offenders };
}

const describeOffenders = (offenders) =>
  offenders.map((o) => `${o.path} (line ${o.lines.join(", ")})`).join("\n  ");

test("[pin] no tracked .mjs source carries a raw NUL byte — write backslash-zero instead", () => {
  const r = scanTrackedMjs(ROOT);
  assert.ok(r.files > 0, "enumerated no tracked .mjs files");
  assert.equal(
    r.offenders.length, 0,
    `${r.occurrences} raw NUL byte(s) in ${r.offenders.length} of ${r.files} tracked .mjs file(s):\n  ` +
      describeOffenders(r.offenders)
  );
});

// The scanner itself, on a throwaway repo: it must reject, accept, cope and exclude.
function withFixtureRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), "source-no-nul-"));
  try {
    const git = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "pipe" });
    git("init", "-q");
    return fn(dir, git);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("[pin] the scanner rejects a tracked raw-NUL .mjs, accepts the printable escape, handles spaces", () => {
  withFixtureRepo((dir, git) => {
    mkdirSync(join(dir, "a dir"));
    writeFileSync(join(dir, "a dir", "has nul.mjs"), Buffer.from("const k = `a\0b`;\n// \0\n"));
    writeFileSync(join(dir, "clean.mjs"), "const k = `a\\0${b}`;\n");
    git("add", ".");
    const r = scanTrackedMjs(dir);
    assert.equal(r.files, 2);
    assert.equal(r.occurrences, 2);
    assert.deepEqual(r.offenders, [{ path: "a dir/has nul.mjs", lines: [1, 2] }]);
  });
});

test("[pin] the scanner ignores untracked files and the excluded resident-data tree, and fails on an empty enumeration", () => {
  withFixtureRepo((dir, git) => {
    mkdirSync(join(dir, "src", "data", "postmark"), { recursive: true });
    writeFileSync(join(dir, "src", "data", "postmark", "x.mjs"), Buffer.from("\0"));
    writeFileSync(join(dir, "untracked.mjs"), Buffer.from("\0"));
    writeFileSync(join(dir, "ok.mjs"), "export {};\n");
    git("add", "src", "ok.mjs");
    const r = scanTrackedMjs(dir);
    assert.deepEqual(r, { files: 1, occurrences: 0, offenders: [] });
  });
  withFixtureRepo((dir) => {
    assert.throws(() => scanTrackedMjs(dir), /no tracked \.mjs/);
  });
});
