// canon-review.test.mjs — WLD-159: a PR touching canon waits for a founder's review at its head.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonVerdict, isCanon } from "./canon-review.mjs";

const HEAD = "2d98c3be".padEnd(40, "0");
const OLD = "1111aaaa".padEnd(40, "0");
const RESIDENT_CLASS = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-node/entity/resident/mark.md";
const SKETCH = "WORLD/marks/let-there-be-light/the-harbor-reach/the-long-run-harbor/some-household/a-lantern/mark.md";
const review = (login, state, commit_id = HEAD, at = "2026-11-05T10:00:00Z") => ({ user: { login }, state, commit_id, submitted_at: at });

test("what counts as canon: the postmark-node class tree and the gate's own files", () => {
  assert.equal(isCanon(RESIDENT_CLASS), true);
  assert.equal(isCanon("WORLD/marks/x/postmark-node/predicate/appearance/mark.md"), true);
  assert.equal(isCanon(".github/workflows/lane.yml"), true);
  assert.equal(isCanon(".github/workflows/canon-review.yml"), true);
  assert.equal(isCanon("tools/canon-review.mjs"), true);
  assert.equal(isCanon(SKETCH), false);
  assert.equal(isCanon("NOTES/keeminlee.md"), false);
  assert.equal(isCanon("tools/marks-fold.mjs"), false);
});

test("World#366's shape: a class grant with no founder review is held, and the reason names the file", () => {
  const v = canonVerdict([RESIDENT_CLASS], [review("bevel-starforge[bot]", "APPROVED"), review("wright-starforge", "APPROVED")], HEAD);
  assert.equal(v.ok, false);
  assert.match(v.why, /touches canon \(WORLD\/marks\/.*entity\/resident\/mark\.md\)/);
  assert.match(v.why, /founder's review at its head 2d98c3be/);
});

test("a founder's approval at the head lets it pass", () => {
  assert.equal(canonVerdict([RESIDENT_CLASS], [review("keeminlee", "APPROVED")], HEAD).ok, true);
  assert.equal(canonVerdict([RESIDENT_CLASS], [review("KeeminLee", "APPROVED")], HEAD).ok, true);
});

test("an approval of an older head doesn't count, and says so", () => {
  const v = canonVerdict([RESIDENT_CLASS], [review("keeminlee", "APPROVED", OLD)], HEAD);
  assert.equal(v.ok, false);
  assert.match(v.why, /approval is of 1111aaaa, an older head/);
});

test("only the founder's latest decision counts; a comment doesn't replace it", () => {
  const files = [RESIDENT_CLASS];
  assert.equal(canonVerdict(files, [review("keeminlee", "APPROVED", HEAD, "2026-11-05T10:00:00Z"), review("keeminlee", "CHANGES_REQUESTED", HEAD, "2026-11-05T11:00:00Z")], HEAD).ok, false);
  assert.equal(canonVerdict(files, [review("keeminlee", "CHANGES_REQUESTED", HEAD, "2026-11-05T10:00:00Z"), review("keeminlee", "APPROVED", HEAD, "2026-11-05T11:00:00Z")], HEAD).ok, true);
  assert.equal(canonVerdict(files, [review("keeminlee", "APPROVED", HEAD, "2026-11-05T10:00:00Z"), review("keeminlee", "COMMENTED", HEAD, "2026-11-05T11:00:00Z")], HEAD).ok, true);
  assert.equal(canonVerdict(files, [review("keeminlee", "APPROVED", HEAD, "2026-11-05T10:00:00Z"), review("keeminlee", "DISMISSED", HEAD, "2026-11-05T11:00:00Z")], HEAD).ok, false);
});

test("a PR with no canon passes at once (residents' sketches, tools, notes)", () => {
  assert.equal(canonVerdict([SKETCH, "NOTES/keeminlee.md"], [], HEAD).ok, true);
  assert.equal(canonVerdict(["tools/marks-fold.mjs"], [], HEAD).ok, true);
});

test("weakening the gate needs the same review", () => {
  assert.equal(canonVerdict([".github/workflows/lane.yml"], [review("wright-starforge", "APPROVED")], HEAD).ok, false);
  assert.equal(canonVerdict(["tools/canon-review.mjs"], [review("keeminlee", "APPROVED")], HEAD).ok, true);
});
