// canon-review.mjs — a pull request that touches canon waits for a founder's review (WLD-159, 2026-11-05).
//
// Canon is the postmark-node class tree (class, entity and predicate marks: WORLD/marks/**/postmark-node/**). A class
// mark is law shape, so a change to it merges only after a founder has approved it, at the head that will merge
// (SHIPPING § 1: law shape carries Darko's look). lane.yml sends canon to ordinary review instead of the resident lane;
// this check is the gate that replaces the lane's refusal, so canon never becomes easier to touch than the lane was.
// The gate's own files (this script, its workflow and lane.yml) count as canon too, so weakening the gate needs the
// same review.
//
//   GH_TOKEN=… REPO=postmark-town/postmark-world PR=<n> HEAD_SHA=<sha> node tools/canon-review.mjs
//
// Exit 0: no canon in the PR, or a founder approved it at HEAD_SHA. Exit 1: canon without that approval (the message
// names the files and what's needed). It reads the PR's files and reviews through the API and runs nothing from the PR.
// After the founder approves, re-run the check (pull_request_target doesn't fire on a review).
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const FOUNDERS = ["keeminlee"];
export const CANON = /^WORLD\/marks\/.+\/postmark-node\//;
export const GATE_FILES = new Set([".github/workflows/canon-review.yml", ".github/workflows/lane.yml", "tools/canon-review.mjs"]);

export const isCanon = (path) => CANON.test(path) || GATE_FILES.has(path);

/** The verdict, pure: files are the PR's changed paths; reviews are GitHub's review objects (user.login, state,
 *  commit_id, submitted_at). Only a founder's latest review counts, and only when it approves the head. */
export function canonVerdict(files, reviews, headSha, founders = FOUNDERS) {
  const canon = files.filter(isCanon);
  if (!canon.length) return { ok: true, why: "no canon in this PR" };
  const latest = new Map();
  for (const r of [...reviews].sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)))) {
    const who = String(r.user?.login ?? "").toLowerCase();
    if (!founders.includes(who) || r.state === "COMMENTED" || r.state === "PENDING") continue;
    latest.set(who, r); // a later APPROVED, CHANGES_REQUESTED or DISMISSED replaces an earlier one
  }
  const approvedAtHead = [...latest.values()].find((r) => r.state === "APPROVED" && r.commit_id === headSha);
  if (approvedAtHead) return { ok: true, why: `canon approved by ${approvedAtHead.user.login} at ${headSha.slice(0, 8)}` };
  const stale = [...latest.values()].find((r) => r.state === "APPROVED");
  return {
    ok: false,
    why: `this PR touches canon (${canon.slice(0, 5).join(", ")}${canon.length > 5 ? `, +${canon.length - 5}` : ""}), which merges only after a founder's review at its head ${headSha.slice(0, 8)}` +
      (stale ? ` (${stale.user.login}'s approval is of ${String(stale.commit_id).slice(0, 8)}, an older head)` : "") +
      `; once approved, re-run this check`,
  };
}

const gh = (path) => JSON.parse(execFileSync("gh", ["api", "--paginate", "--slurp", path], { encoding: "utf8" })).flat();

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { REPO, PR, HEAD_SHA } = process.env;
  if (!REPO || !/^\d+$/.test(PR ?? "") || !/^[0-9a-f]{40}$/.test(HEAD_SHA ?? "")) { console.error("canon-review: REPO, PR and HEAD_SHA are required"); process.exit(2); }
  const files = gh(`repos/${REPO}/pulls/${PR}/files?per_page=100`).map((f) => f.filename);
  const reviews = gh(`repos/${REPO}/pulls/${PR}/reviews?per_page=100`);
  const v = canonVerdict(files, reviews, HEAD_SHA);
  console.log(`canon-review: ${v.ok ? "ok" : "held"}: ${v.why}`);
  process.exit(v.ok ? 0 : 1);
}
