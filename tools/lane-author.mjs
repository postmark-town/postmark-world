#!/usr/bin/env node
// lane-author.mjs — WHO a pull request's author is, for the PR lane (WLD-122).
//
// "Bind pinned ids" (Darko, AUTHORITY 2026-10-27T17:33:26.677Z). The lane's two
// doors — the first knock in .github/workflows/lane.yml and the authorship wall
// in tools/lane-wall.mjs — bind the author HERE and nowhere else, by the one
// fact GitHub hands them that a person cannot choose: the account's NUMERIC id
// (`github.event.pull_request.user.id`), looked up in WORLD/households.json's
// `pinned_ids` (numeric id → household key, rendered by postmark-office
// tools/world-households-export.mjs from the store's pins).
//
// WHAT IS NOT IDENTITY. A GitHub login can be renamed or registered by anyone,
// and the registry's `logins` map is not an identity table: it also binds every
// sketchbook name — a house's own slug, a solo resident's handle — to its
// household, so a GitHub account named like a house would have read as that
// house. Before this, both doors accepted `gh:<id>` or `login:<login>` keys
// against `households` values; the store-rendered registry keys households
// `hh:<slug>` / `solo:<handle>`, so neither matched a declared house and a
// `login:` key would have bound whoever held that login. A login may still NAME
// the sketchbook a first knock opens; it never proves who knocked.
//
// FAILS CLOSED. A registry with no `pinned_ids` (one rendered before the export
// carried it), an author id that is not a positive whole number, an id the map
// does not hold, or a map entry that is not a household key: each is a refusal
// with its reason, never a fallback to `logins`, `households`, the login, a
// house name, admin status or anything the pull request carries. The registry
// read is the trusted side's (main), never the head's.
//
//   node tools/lane-author.mjs --registry WORLD/households.json --author-id <id> [--author-login <login>]
//
// prints the author's household key and exits 0, or names the refusal on
// stderr and exits 1. With --author-login it also refuses when that login's
// sketchbook name is already bound to ANOTHER household (the first knock would
// otherwise open or retarget into someone else's sketchbook).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ID = /^[1-9][0-9]*$/;
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * `{ house }` when `authorId` is pinned to exactly one household in `registry`
 * (the parsed WORLD/households.json), else `{ house: null, reason }`.
 */
export function bindAuthor(registry, authorId) {
  if (!isPlainObject(registry))
    return { house: null, reason: "the registry (WORLD/households.json) could not be read, so no author can be bound" };
  const pinned = registry.pinned_ids;
  if (!isPlainObject(pinned))
    return { house: null, reason: "this registry carries no pinned_ids (it predates WLD-122's export), so the lane binds no author until the crossing re-renders it" };
  const id = String(authorId ?? "").trim();
  if (!ID.test(id))
    return { house: null, reason: `the author's GitHub id "${id}" is not a numeric account id` };
  if (!Object.prototype.hasOwnProperty.call(pinned, id))
    return { house: null, reason: `GitHub account ${id} is not pinned to any household` };
  const house = pinned[id];
  if (typeof house !== "string" || !/^[a-z]+:./.test(house))
    return { house: null, reason: `GitHub account ${id}'s pinned household is not a household key` };
  return { house, reason: null };
}

/**
 * The sketchbook a login names, judged against the bound house: `null` when the
 * author may knock there (the name is theirs, or nobody's yet), else the reason.
 */
export function sketchbookRefusal(registry, login, house) {
  const name = String(login ?? "").toLowerCase();
  const logins = isPlainObject(registry?.logins) ? registry.logins : {};
  if (!Object.prototype.hasOwnProperty.call(logins, name)) return null;
  return logins[name] === house ? null
    : `the sketchbook draft/${name} is bound to another household, not to the one your account is pinned to`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  let registry = null;
  try { registry = JSON.parse(readFileSync(opt("--registry") ?? "WORLD/households.json", "utf8")); } catch { registry = null; }
  const bound = bindAuthor(registry, opt("--author-id"));
  if (!bound.house) { console.error(`lane-author: ${bound.reason}`); process.exit(1); }
  const login = opt("--author-login");
  const elsewhere = login ? sketchbookRefusal(registry, login, bound.house) : null;
  if (elsewhere) { console.error(`lane-author: ${elsewhere}`); process.exit(1); }
  console.log(bound.house);
}
