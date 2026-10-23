#!/usr/bin/env node
// mark-lint.mjs — the pre-flight gate for WORLD/marks/ (MARKS.md § Leaving a mark;
// 07-22 nesting ruling). Reads the nested marks the same way the fold does
// (shared loadMarks + the shared `contains`), then holds every record to the
// on-disk schema (WORLD/marks/SCHEMA.md). Deterministic, read-only — it reports,
// it never edits.
//
//   node tools/mark-lint.mjs                 # lint WORLD/marks against the terrain tier
//   node tools/mark-lint.mjs --marks-dir d --terrain t.json
//
// A gate, not a nudge: it exits non-zero on any ERROR (the seeding fleet and the
// hand-authored PR path both pre-flight against it, so a malformed mark fails
// with the exact fix before it ever lands). WARNs are advisory and never fail it.
//
// THE FREEZE (founder-ruled 2026-08-25; LOGOS/state-and-time.md § "The freeze —
// filing is static, and the tree is a fossil"):
//
//   "Filing is frozen as of 2026-08-25. A mark's directory is its historical
//    filing: it carries no claim, and it never moves again."
//
// The directory-matches-containment law is REPEALED, and this gate's old
// dir-equals-placementParent check died with it — "the tree's paths make no
// assertion, so nothing about them can become false." In its place stand the two
// gates the law names (§6, below): *an existing mark directory that moves is
// refused*, and *a new mark files at its id*. Containment is no longer asked of
// the tree at all; it is derived at the fold and emitted as WORLD/containment.json.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadMarks, polygonOf, ringMatchesClaim, isValidMarkDate, rect, overlapArea,
  standingRank, fileToWorld, declaredCoords, COORDS_RELATIVE, WORLD_ROOT_SLUG,
  containmentParents, lossyValues, lossyMessage,
} from "./marks-fold.mjs";
import { markStanding } from "./mark-standing.mjs";
import { consentMap, CONSENT_WORDS, CONSENT_FIELD, townOwnedMark, cameAfter, inContact, seniorAtContact, parcelInteriorOf } from "./consent.mjs";
import { crossHouseholdRiders, householdResolver } from "./household-frames.mjs";
import { portalFindings, applyPortalExceptions, PORTAL_RULES } from "./portals.mjs";
import { classIndex, classChain, ownProperties, propertiesOf, propertyAt, propertyNames, propertyValue } from "./class-properties.mjs";
import { instanceClassOf, isSited, isPredicate, HELD_BY, heldBy, OWNED_BY, ownedBy } from "./mark-kind.mjs";
import { regionAnchors, groundStands } from "./world-build.mjs"; // WLD-97: the ground_m rule the heightfield honors

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
// --repo <dir>: the repository a `source:` path is resolved against (§9). Defaults
// to this tool's own repo, which is what every caller wants: the lane runs MAIN's
// tools, so the documents a rendering is checked against are main's too.
const REPO = resolve(opt("--repo", ROOT));
const MARKS_DIR = opt("--marks-dir", join(REPO, "WORLD/marks"));
const TERRAIN_PATH = opt("--terrain", join(REPO, "WORLD/skeleton.json"));
// --scope <subtree>: the fleet writes sibling dirs concurrently, so a full-tree
// lint mid-fleet would trip on another agent's half-written dir. Scoped mode
// still LOADS the whole tree (ancestor edges resolve; the-town leaf collisions
// across siblings are still caught) but REPORTS/gates only on marks under the
// scope. e.g. --scope WORLD/marks/let-there-be-light/<region-slug>
const SCOPE = opt("--scope", null);
const scopeRel = SCOPE ? resolve(SCOPE).replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/") : null;
// --freeze <file>: the frozen filing manifest (§6). Defaults to this repo's own
// WORLD/filing-freeze.json, and ONLY when the tree being linted is this repo's
// own — a fixture tree is a synthetic world that never lived through the freeze,
// and holding one to this repo's fossil would refuse every fixture mark for
// standing somewhere the fossil never named. A fixture that means to exercise the
// freeze plants its own manifest and passes it here.
const OWN_TREE = resolve(MARKS_DIR) === resolve(join(REPO, "WORLD/marks"));
const FREEZE_PATH = opt("--freeze", OWN_TREE ? join(REPO, "WORLD/filing-freeze.json") : null);
// --json: the whole finding list as one machine-readable record, so a caller
// (the settlement sweep) can read the verdict instead of scraping the prose.
// Same findings, same exit code; only the rendering differs.
const JSON_OUT = args.includes("--json");

// `property` joins with LOGOS v2 part 2 (ruled 2026-10-16): a class's property
// is a node of its own (§ Property and predicate). The instances' `kind:` still
// names how a mark stands until the kind migration (W2) folds `class:` into it.
// (Posts are not world records: they live in the office's post machine, and
// the 61 idea and bounty marks move there in a later lane; settled WLD-73 G7.)
// `predicate` joins with W2's G10 (settled 2026-10-17): a claim's kind names its
// class, `predicate`; `predicated` is the standing word it replaces, still read.
const KINDS = new Set(["sited", "predicate", "predicated", "naming", "parcel", "class", "property"]);
// A repo-relative mark path longer than this is refused: a Windows checkout
// without core.longpaths cannot create it (MAX_PATH 260, less a clone's own
// root). The fossil's longest on 2026-10-17 is 171.
const MARK_PATH_MAX = 180;
const TIERS = new Set(["constitution", "sovereignty", "market", "draft"]); // v2 protection tiers + draft (gray, 2026-08-09)
// A property's `tier:` is a different line: whose word decides its value on each
// instance (18:44 item 7) — the town's, locked, or the maker's.
const PROPERTY_TIERS = new Set(["constitution", "sovereign"]);
// The property naming grammar (the meta-class's rails): town-defined and
// identifier-safe, lowercase words joined by `_` or `-`. Names keep the spelling
// their readers already use (a dial's key, a predicate's slot).
const PROPERTY_NAME_RE = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/;
const TOWN = "the-town"; // the town-tier author; only it may claim constitution
// The world root, kept as a name rather than as a check: the freeze repealed the
// containment question this gate used to ask of the tree (§6), so nothing here
// reads placementParent any more. The fold answers containment now.
const BODY_MAX = 150; // chars (07-22 ruling)
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const findings = [];
const at = (rec) => (rec._dir ? rec._dir.replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/") : rec.id ?? "?");
const err = (rec, msg) => findings.push({ sev: "ERROR", file: at(rec), msg });
const warn = (rec, msg) => findings.push({ sev: "WARN", file: at(rec), msg });
// THE THIRD SEVERITY IS GONE. `REHOME` named work for the MACHINERY rather than
// for the writer — a directory edge that had stopped naming its tightest
// geometric container, which the settlement sweep re-pointed on the author's
// behalf. The freeze repealed the law that made such an edge wrong ("the tree's
// paths make no assertion, so nothing about them can become false") and deleted
// the mover ("The re-home pass is DELETED from the settlement save"), so there is
// no repair left for this gate to ask for. Two exit codes now: 0 and 1.

// terrain ids the tier exposes for `parent: terrain:<id>` attachment
const terrain = existsSync(TERRAIN_PATH) ? JSON.parse(readFileSync(TERRAIN_PATH, "utf8")) : { features: [], far_features: [] };
const TERRAIN_IDS = new Set([...(terrain.features ?? []), ...(terrain.far_features ?? [])].map((f) => f.id));
// the mechanics roster a mark's `mechanic:` may point at (07-23 field)
const REGISTRY = terrain.physics_registry ?? {};

const num = (v) => typeof v === "number" && Number.isFinite(v);
const hasGeom = (rec) => rec.at && num(rec.at.x) && num(rec.at.y) && rec.extent && num(rec.extent.w) && num(rec.extent.h);

const marks = loadMarks(MARKS_DIR);

// The class roster: a class NAME is lawful exactly when the town's own
// constitution-tier TYPE mark declares it FROM THE KEEPING WORKS. The position
// clause is the law's own sentence (LOGOS/classes.md § Instantiation:
// declarations stand "constitution-tier, standing in the Keeping Works") and
// it is what tells a DECLARATION from an INSTANCE that happens to be
// town-authored — the three harbor charters carry `class: town` and declare
// nothing; before this clause they read as three extra declarations of a
// class the works already declares (Keemin's ruling, 2026-08-17 night: make
// IS-the-class vs INSTANCE-of-the-class explicit). Ancestry, never direct
// parent: `household/human` nests under a class mark and is still of the
// works. This still reads the class VALUE, never the slug. A record naming a
// class outside the roster is a lie about the world's vocabulary, same shape
// as a mechanic outside the registry.
const _byIdForWorks = new Map(marks.map((m) => [m.id, m]));
const standsInTheWorks = (rec) => {
  let cur = rec, hops = 0;
  while (cur && hops++ < 64) {
    if (cur.id === "the-town/the-keeping-works") return true;
    cur = cur._parentMarkId ? _byIdForWorks.get(cur._parentMarkId) : null;
  }
  return false;
};
const isClassDeclaration = (m) =>
  m.by === "the-town" && m.tier === "constitution" && m.class !== undefined && standsInTheWorks(m);
const CLASS_ROSTER = new Set(marks.filter(isClassDeclaration).map((m) => String(m.class)));

// THE KIND NAMES THE CLASS (LOGOS v2 part 2, W2; ruled 2026-10-16 16:02: "The
// `class:` field folds into `kind`"). A record's kind is either one of the
// standing words the field carried until then (both forms are read, always: a
// door or a fixture may still write `kind: sited` + `class: thing`), or a class
// the works declare. How such a record stands is read off its class's chain:
// under predicate a predicate (naming a naming), under parcel a parcel, under
// sited sited. A class under none of them has no standing instance (G13,
// settled 2026-10-17: the lint never reads a record as sited from its place).
// Only a chain that reaches the root can answer; a fixture's partial tree, which
// cannot, is read as the sited mark its old form would have said. A post
// class's instances keep the old form: posts live in the office's post machine,
// and a later lane moves them there (settled 2026-10-17, WLD-73 G7), so a
// `kind:` naming a post class is refused.
const CLASS_IDX = classIndex(marks.filter((m) => !m._error));
const chainOf = (name) => classChain(CLASS_IDX, String(name)).map((c) => String(c.class));
const isPostClass = (name) => name !== undefined && chainOf(name).includes("post");
const standingOfRecord = (rec) => {
  // a landform answers by its class before the standing words, so the old spelling
  // (kind: sited + class: landform), or a class under landform, is a landform (#296 review)
  const lk = instanceClassOf(rec);
  if (lk != null && (lk === "landform" || (CLASS_ROSTER.has(lk) && chainOf(lk).includes("landform")))) return "landform";
  if (KINDS.has(rec.kind)) return rec.kind === "predicate" ? "predicated" : rec.kind; // one standing, two spellings
  if (rec.kind == null || !CLASS_ROSTER.has(String(rec.kind)) || isPostClass(rec.kind)) return null;
  const chain = chainOf(rec.kind);
  if (chain.includes("naming")) return "naming";
  if (chain.includes("predicate")) return "predicated";
  if (chain.includes("parcel")) return "parcel";
  if (chain.includes("sited") || !chain.includes("postmark-node")) return "sited";
  return null;
};

// the gate quotes the law (rung 1, 2026-08-02): a refusal cites the clause of
// the-town/logos it enforces — id + body verbatim, so the bounce hands the
// writer an investigable handle and the exact law, never a paraphrase. The
// clauses live in the very tree this gate lints; if a cited clause is missing
// the gate still refuses, and says its own lookup failed (the law never blocks
// on its own absence).
const LAW = new Map(marks.map((m) => [m.id, String(m.body ?? "").trim().replace(/\s+/g, " ")]));
const cite = (clauseId) => {
  const body = LAW.get(clauseId);
  return body
    ? ` — the law: ${clauseId} (a clause of the-town/logos): "${body}"`
    : ` — the law: ${clauseId} (clause not found in the record; the gate's law lookup failed)`;
};
const byId = new Map();
// The standing walk needs the WHOLE tree, and `byId` above is filled as the
// record loop validates — so a rule inside that loop would ask about a chain
// only half indexed. This map is complete before the first check runs, and is
// the only one any standing question is asked against. (Duplicate ids are the
// loop's own error to report; first wins here, as in the loader.)
const standingIndex = new Map();
for (const m of marks) if (!standingIndex.has(m.id)) standingIndex.set(m.id, m);
const rankOf = (m) => standingRank(m, standingIndex);
const standingOf = (m) => markStanding(m, standingIndex);
// THE CONTAINMENT ANSWER, for the two clauses below that ask what stands inside
// what. Both used to read `_parentMarkId` — the directory — on the premise §6
// used to enforce. The freeze repealed it ("containment lives only in the
// derived fold"), so a directory answer here would be historical filing standing
// in for geography, and both clauses would go quietly wrong for the first mark
// filed at its id. Same function the fold and WORLD/containment.json use.
const { parent: containedBy } = containmentParents(marks);

const slugsByHousehold = new Map();
const childCount = new Map();
for (const m of marks) {
  if (m._parentMarkId) childCount.set(m._parentMarkId, (childCount.get(m._parentMarkId) ?? 0) + 1);
}

for (const rec of marks) {
  // 0. unreadable frontmatter — nothing else can be trusted
  if (rec._error) { err(rec, `unreadable mark.md: ${rec._error}`); continue; }

  // 1. identity: valid kind, authorship (by), path-safe slug unique per author, tier, date
  // the kind names the class (W2), or is a standing word the field carried until then
  const standing = standingOfRecord(rec);
  const klass = instanceClassOf(rec);
  if (standing == null && isPostClass(rec.kind))
    err(rec, `kind: ${rec.kind} names a post class, and a post-class record keeps its old form (kind: sited or predicated, with class: ${rec.kind}) until the post lane moves it to the office's post machine (settled 2026-10-17, WLD-73 G7)`);
  else if (standing == null && CLASS_ROSTER.has(String(rec.kind)))
    err(rec, `kind: ${rec.kind} names a class whose instances do not stand in the record: ${rec.kind} is under none of sited, predicate, naming or parcel (its chain: ${chainOf(rec.kind).join(" → ")}) (G13, settled 2026-10-17)`);
  else if (standing == null) { err(rec, `kind must be one of ${[...KINDS].join(" | ")}, or name a class the works declare (got ${JSON.stringify(rec.kind)})${cite("the-town/the-kinds")}`); }
  // the old form still reads, and is told what it is now: class: folds into kind
  // (a post class's instances excepted, above)
  // A LANDFORM IS WRITTEN ONLY AS kind: landform (WLD-97, #296 review): the office's
  // store record drops `class:`, so an old-spelling landform would read there as
  // the sited mark it names in `kind:`, and the world and the office would disagree
  // about it. The old spelling is refused, not folded, so it can never land.
  const landformClass = rec.class !== undefined && rec.kind !== "class" && rec.kind !== "property"
    && (String(rec.class) === "landform" || (CLASS_ROSTER.has(String(rec.class)) && chainOf(rec.class).includes("landform")));
  if (landformClass)
    err(rec, `class: ${rec.class} is a landform, and a landform is written kind: ${rec.class}, never with a class: line: write kind: ${rec.class} and drop the class: line (the office reads the old spelling as ${rec.kind}; WLD-97)`);
  else if (rec.class !== undefined && rec.kind !== "class" && rec.kind !== "property" && !isPostClass(rec.class))
    warn(rec, `class: ${rec.class} folds into kind: write kind: ${rec.class} and drop the class: line (ruled 2026-10-16: "The \`class:\` field folds into \`kind\`")`);
  if (rec.by == null) err(rec, `by: <author> is required — in the spatial tree (v2) authorship is frontmatter, not the path${cite("the-town/the-own-hand")}`);
  if (!SLUG_RE.test(rec.slug)) err(rec, `slug "${rec.slug}" must be lowercase-hyphenated (it is the directory name and the leaf of the id)`);
  if (rec._dir) {
    // repo-relative, as a clone lays it out: WORLD/marks/<path from the marks root>
    const rel = `WORLD/marks/${resolve(rec._dir).replace(/\\/g, "/").slice(resolve(MARKS_DIR).replace(/\\/g, "/").length + 1)}/mark.md`;
    if (rel.length > MARK_PATH_MAX)
      err(rec, `the mark path ${rel} is ${rel.length} characters; the most is ${MARK_PATH_MAX}, or a Windows checkout cannot create it — file it shallower (a child property files beside its parent and names it in of:)`);
  }
  if (byId.has(rec.id)) err(rec, `duplicate id "${rec.id}" — a leaf slug must be unique per author (by)${cite("the-town/the-own-hand")}`);
  byId.set(rec.id, rec);
  // tier: valid, and constitution belongs to the town alone. On a property node
  // the line says whose word decides the value (constitution | sovereign).
  const isProperty = rec.kind === "property";
  if (isProperty) {
    if (!PROPERTY_TIERS.has(rec.tier)) err(rec, `a property's tier is whose word decides its value: ${[...PROPERTY_TIERS].join(" | ")} (got ${JSON.stringify(rec.tier)})`);
  } else if (!TIERS.has(rec.tier)) err(rec, `tier must be one of ${[...TIERS].join(" | ")} (got ${JSON.stringify(rec.tier)})`);
  if (rec.tier === "constitution" && rec.by !== TOWN) err(rec, `tier: constitution is the town's — only by: ${TOWN} may claim it (a market mark cannot bind without stamps)${cite("the-town/the-tiers")}`);
  // B's rule, made structural (residue stripped 2026-08-13): standing is the
  // one walk's verdict, so an AUTHORED tier: is residue the moment it lands —
  // refused at the gate now. The loader's default hides authorship, so this
  // reads the file: the walk's one exception stays writable (the town's own
  // constitution), and `draft` stays (branch-state, not standing — the one
  // field standingRank still reads).
  if (rec._dir) {
    let raw = null;
    try { raw = readFileSync(join(rec._dir, "mark.md"), "utf8"); } catch { /* unreadable file already erred above */ }
    const rawTier = raw == null ? null : ((raw.match(/^---\r?\n[\s\S]*?\r?\n---/) || [""])[0].match(/^tier:\s*(\S+)/m) || [])[1] ?? null;
    if (rawTier && rawTier !== "draft" && !(rec.by === TOWN && rawTier === "constitution") && !(rec.by === TOWN && isProperty))
      err(rec, `tier: is not a field — standing is derived by the one walk, never asserted (drop the line; the ground decides)${cite("the-town/the-tiers")}`);
    // 1.5 a value the parser would silently lose (WLD-41): the record above was
    // read already diminished, so this reads the file. A snapshot's records
    // carry no file, so the rule speaks where a tree is linted (the PR lane).
    if (raw != null) for (const l of lossyValues(raw)) err(rec, lossyMessage(l));
  }
  if (!rec.date || !isValidMarkDate(rec.date)) warn(rec, `date should be YYYY-MM-DD or a full ISO 8601 datetime (got ${JSON.stringify(rec.date)})`);

  // 2. stray legacy fields the tree no longer owns (authorship is `by:` now)
  if (rec._stray?.household != null)
    warn(rec, `legacy household "${rec._stray.household}" — authorship is the by: field now (drop household)`);
  if (rec._stray?.mark != null && rec._stray.mark !== rec.slug)
    warn(rec, `frontmatter mark "${rec._stray.mark}" disagrees with the directory "${rec.slug}" (the directory is the slug — drop the field)`);
  if (rec.stamps !== undefined) warn(rec, `stamps are ledger-derived, never stored in the record — drop the field`);

  // 2.5 image: the media-shelf pointer (2026-08-15). A mark may carry ONE
  // image, and only from the town's own shelf — the byte-validated upload
  // door is the sole mint, so the allowlist here is the abuse wall the door
  // relies on holding at the record layer too (a hand-committed mark meets
  // the same law as a door-written one).
  if (rec.image !== undefined &&
      !(typeof rec.image === "string" && /^https:\/\/media\.postmark\.town\/[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(rec.image.trim())))
    err(rec, `image: must be one https://media.postmark.town/… URL from the upload door (got ${JSON.stringify(String(rec.image).slice(0, 80))})`);

  // 3. body: present, present-tense, and short (the ruling's 150-char cap)
  const bodyLen = [...String(rec.body ?? "").trim()].length;
  if (bodyLen === 0) warn(rec, `empty body — a mark is an observation; give it one line`);
  // Class and property nodes take their body from the meta-class, uncapped; the
  // cap is on residents' marks (LOGOS v2 part 2, ruled 2026-10-16 18:44 item 1).
  else if (bodyLen > BODY_MAX && rec.kind !== "class" && rec.kind !== "property") err(rec, `body is ${bodyLen} chars; the cap is ${BODY_MAX} (MARKS.md 07-22 ruling)${cite("the-town/the-one-claim")}`);

  // 3b. provenance: office/fleet pre-marks translate a resident's OWN words, so
  // they must cite the source and quote it (MARKS.md membrane; fleet contract).
  const isPre = rec.pre === true || rec.pre === "true";
  if (isPre) {
    const df = rec.derived_from == null ? "" : String(rec.derived_from).trim();
    if (!df) err(rec, `pre: true marks must carry derived_from: <source path> — "<verbatim quote>"`);
    else if (!/[/.]/.test(df) || !/["“”]|—/.test(df)) warn(rec, `derived_from should name a source path AND a verbatim quote (got: ${df.slice(0, 60)})`);
  } else if (rec.derived_from !== undefined) {
    warn(rec, `derived_from is set but pre is not true — set pre: true or drop derived_from`);
  }

  // 3c. mechanic: diegesis may point at machinery, but only machinery that exists
  // and is honored (the physics registry is the roster; a mark pointing at absent
  // or refused machinery is a lie about the world's workings).
  if (rec.mechanic !== undefined) {
    const entry = REGISTRY[rec.mechanic];
    if (!entry) err(rec, `mechanic: "${rec.mechanic}" is not in the physics registry (skeleton.json physics_registry) — a mark may only point at machinery that exists`);
    else if (!entry.honored) err(rec, `mechanic: "${rec.mechanic}" is registered but NOT honored (${entry.receipt}) — diegesis cannot point at refused machinery`);
  }
  // (the `timetable:` a `mechanic: timetable` mark must carry is checked in §8,
  // below — every id inside it must resolve against the whole tree.)

  // 3d. the bounty grammar (the board's notices — founder-ruled 2026-08-11).
  // A notice is class: bounty + one ask ≤150 + a whole-number reward ≥1 +
  // open/done; the board's reader (site src/lib/board.mjs) drops-and-counts a
  // malformed notice rather than rendering it, so this gate owes the writer
  // the exact field. Scoped to notice-shaped records: the class TYPE mark in
  // the Keeping Works carries class: bounty with none of ask/reward/status,
  // and is a definition, not a notice.
  if (rec.class !== undefined && !CLASS_ROSTER.has(String(rec.class)))
    err(rec, `class: ${JSON.stringify(rec.class)} names no class the law knows (the roster: ${[...CLASS_ROSTER].sort().join(", ")})`);
  // Scope by WHAT THE MARK IS, never by whether it bothered to carry the
  // fields (review W-1: a bare `class: bounty` on the board slipped the gate
  // entirely, because the gate looked for the very fields it exists to
  // require). A bounty TOKEN is any class:bounty mark that is not the class
  // DEFINITION — and the definition is known by where it stands (the Keeping
  // Works), exactly how the board reader knows a notice (the board).
  // the ONE definition gate, shared with the roster above (ancestry-walked:
  // a definition nested under a class mark — household/human — is still of
  // the works); the old direct-parent test was this rule's per-bounty prototype
  const isClassDefinition = isClassDeclaration(rec);
  if (klass === "bounty" && !isClassDefinition) {
    // ON THE BOARD means standing on the board's GROUND, not filed in its
    // directory (re-keyed 2026-08-25). A notice filed at its id — which is where
    // every notice written after the freeze goes — has no directory parent at
    // all, and under the old test every one of them read as "off the board" and
    // was told it could never render, while sitting squarely on it.
    if (containedBy.get(rec.id) !== "the-town/the-bounty-board")
      warn(rec, `class: bounty off the board — the board reads only notices standing on the-town/the-bounty-board; this mark can never render there`);
    if (standing !== "sited") err(rec, `a bounty notice is a sited mark (got kind: ${JSON.stringify(rec.kind)})`);
    const askLen = [...String(rec.ask ?? "").trim()].length;
    if (askLen === 0) err(rec, `a bounty notice needs ask: — one claim, ≤${BODY_MAX} chars`);
    else if (askLen > BODY_MAX) err(rec, `ask is ${askLen} chars; the cap is ${BODY_MAX}${cite("the-town/the-one-claim")}`);
    if (String(rec.ask ?? "").includes("#"))
      err(rec, `ask carries '#' — the record grammar reads # as a comment; this ask has already been truncated or will be misread`);
    const rwd = Number(rec.reward);
    if (rec.reward === undefined || typeof rec.reward === "boolean" || !Number.isInteger(rwd) || rwd < 1)
      err(rec, `reward: must be a whole number of stamps ≥ 1 (got ${JSON.stringify(rec.reward)})`);
    const st = rec.status === undefined ? "open" : String(rec.status).trim();
    if (st !== "open" && st !== "done") err(rec, `status: is open or done (got ${JSON.stringify(rec.status)})`);
    if (rec.threshold !== undefined && rec.by !== TOWN)
      err(rec, `threshold: is the town's bar — a resident notice carries reward, never threshold`);
  } else if (klass === undefined && (rec.ask !== undefined || rec.reward !== undefined || rec.status !== undefined)) {
    warn(rec, `ask/reward/status without class: bounty — the board cannot read this as a notice`);
  }

  // THE IDEA GRAMMAR (the Think Tank, founder-ruled 2026-08-30): an idea is a
  // mark whose BODY is the claim — no ask, no reward, no status; the stage
  // lives in the blueprint repo, one writer per fact. (This sentence read "a
  // SITED mark" until 2026-09-01; the anchor law is the paragraph below, and
  // leaving the old word here would have been a false premise standing over
  // the code that repealed it.)
  //
  // WHERE IT STANDS IS NOT WHAT IT IS (founder-ruled 2026-09-01, on Alta's idea
  // planted in the Garrison): "class: idea" says what a mark is; the Think Tank
  // is where the class is READ, not a container that makes it so. An idea may
  // stand anywhere — standing in the Garrison is an idea OF the Garrison — and
  // the Tank gathers every instance by class. The off-Tank warning that stood
  // here ("this mark can never render there") was retired with that ruling: it
  // was the one advisory that, through the suite's CLEAN word, held Alta's
  // mark out of two settlements. The readers that filtered by placement (the
  // office's tank read, the site's ideas()) follow by the same ruling.
  //
  // IDEAS CAN BE PREDICATES (founder-ruled 2026-09-01, four words, the law of
  // this gate): an idea may stand SITED anywhere — an idea of the ground it
  // stands in — or PREDICATED under any mark — an idea of that mark. Both are
  // the same class; only the anchor differs. A predicated idea carries no
  // geometry, takes its locus from its parent whole (the continuation law), and
  // is held to every predicate check §4 already runs — slot and value required,
  // no at/extent, its subtree predicates all the way down, and it may never
  // outrank what it predicates. Nothing here duplicates those; this block owns
  // only what makes an idea an idea. The body is still the claim in both kinds
  // (§3's ≤150 cap is kind-agnostic; the empty-body WARN is raised to an ERROR
  // here because for an idea the body is not description, it is the thing).
  // Every other kind is still refused, and the refusal now quotes the ruling.
  if (klass === "idea" && !isClassDeclaration(rec)) {
    if (standing !== "sited" && standing !== "predicated")
      err(rec, `an idea is a sited or a predicated mark — "Ideas can be predicates." (founder-ruled 2026-09-01); sited stands in the ground it is an idea of, predicated stands under the mark it is an idea of (got kind: ${JSON.stringify(rec.kind)})`);
    if ([...String(rec.body ?? "").trim()].length === 0)
      err(rec, `an idea needs its thought — the BODY is the claim${cite("the-town/the-one-claim")}`);
  }

  // 4. kind-specific shape
  // 4a. A HELD THING IS PUBLISHED BUT UNPLACED (POS-688, Darko 2026-10-18 20:58):
  // the settlement prints `held_by: <its holder>` and no `at`/`extent`, so a held
  // record carries the holder instead of a place, never both, and only a thing is
  // ever held (a parcel or a building is ground, and ground is not carried).
  // WHAT THE RECORD CAN HOLD (S123, 2026-10-21): a thing, or a sited mark that
  // declares no class at all. The take door has always taken an untyped sited
  // mark (it refuses only `portable: false`), and the hold record holds them:
  // berthillon's cones since 08-31, a cup, a pot, a coin. Each prints held like
  // any thing. A record that names a class is held only when that class is a
  // thing; a parcel never is.
  const carriable = (r) => {
    const k = instanceClassOf(r);
    return k ? chainOf(k).includes("thing") : standing === "sited";
  };
  const holderOf = heldBy(rec);
  if (rec[HELD_BY] !== undefined && holderOf == null)
    err(rec, `${HELD_BY}: names the holder (a resident's handle, or a holder thing's id); got ${JSON.stringify(rec[HELD_BY])}`);
  if (holderOf != null) {
    const klass = instanceClassOf(rec);
    if (!carriable(rec))
      err(rec, `${HELD_BY}: only a thing is held — a held thing rides its holder, and this record is ${klass ? `a ${klass}` : `kind: ${JSON.stringify(rec.kind)}`}, not a thing`);
    if (rec.at !== undefined || rec.extent !== undefined || rec.points !== undefined)
      err(rec, `a held thing carries no at/extent — it is published but unplaced, and shows as ${holderOf}'s contents until it is set down (POS-688)`);
  }
  // 4b. ITS OWNER, when not its maker (POS-688, Darko 2026-10-19): a resident's
  // handle, never the maker's own (the maker owns it unprinted), and only a thing.
  const ownerOf = ownedBy(rec);
  if (rec[OWNED_BY] !== undefined && (ownerOf == null || ownerOf.includes("/")))
    err(rec, `${OWNED_BY}: names the owner, a resident's handle; got ${JSON.stringify(rec[OWNED_BY])}`);
  if (ownerOf != null && !ownerOf.includes("/")) {
    const klass = instanceClassOf(rec);
    if (!carriable(rec))
      err(rec, `${OWNED_BY}: only a thing is owned apart from its maker, and this record is ${klass ? `a ${klass}` : `kind: ${JSON.stringify(rec.kind)}`}, not a thing`);
    if (ownerOf === rec.by)
      err(rec, `${OWNED_BY}: ${ownerOf} made it, and a maker's own thing prints no owner (POS-688)`);
  }
  if (standing === "sited" || standing === "parcel") {
    if (standing === "sited" && holderOf == null && !hasGeom(rec)) err(rec, `sited marks need at {x,y} and extent {w,h} in grid meters${cite("the-town/the-kinds")}`);
    if (standing === "parcel" && rec.at == null) err(rec, `parcel marks need at {x,y} (extent defaults to 25x25)${cite("the-town/the-kinds")}`);
    if (rec.slot !== undefined || rec.value !== undefined) err(rec, `${rec.kind} marks carry no slot/value (those are for predicated/naming)`);
    if (rec._explicitParent) err(rec, `${rec.kind} marks never declare a parent — containment is computed from geometry, not authored`);
    // 4b. claim-honesty for a points: ring (SCHEMA v2): the ring must be a real
    // shape, and its bounding box must equal the mark's at/extent claim. This gate
    // exists before the first record that carries a ring, so the coarse claim can
    // never lie about the fine shape the FOV silhouette / containment will honor.
    if (rec.points !== undefined) {
      if (!polygonOf(rec)) err(rec, `points: must be a ring of ≥3 vertices ([[x,y],…] or "x1,y1 x2,y2 …")`);
      else if (!ringMatchesClaim(rec)) err(rec, `the points: ring's bounding box must equal the mark's at/extent claim — the claim IS the ring's bbox (SCHEMA v2)`);
    }
  } else if (standing === "landform") {
    // A LANDFORM (WLD-97, ruled 2026-10-22 21:03–21:04) carries its own place and
    // outline like a sited mark, and its ground_m (5e holds the rest of its law).
    if (!hasGeom(rec)) err(rec, `a landform needs at {x,y} and extent {w,h} in grid meters: the ground it shapes`);
    if (rec.ground_m === undefined) err(rec, `a landform carries ground_m: the height it holds its ground at, or a [lo, hi] range`);
    if (rec.slot !== undefined || rec.value !== undefined) err(rec, `a landform carries no slot/value`);
    if (rec._explicitParent) err(rec, `a landform never declares a parent: it nests in nothing`);
    if (rec.points !== undefined) {
      if (!polygonOf(rec)) err(rec, `points: must be a ring of ≥3 vertices ([[x,y],…] or "x1,y1 x2,y2 …")`);
      else if (!ringMatchesClaim(rec)) err(rec, `the points: ring's bounding box must equal the landform's at/extent claim`);
    }
  } else if (standing === "predicated" || standing === "naming") {
    if (rec.at !== undefined || rec.extent !== undefined) err(rec, `${rec.kind} marks carry no at/extent — they take their locus from their parent${cite("the-town/the-continuation")}`);
    if (standing === "predicated" && (rec.slot === undefined || rec.value === undefined)) err(rec, `predicated marks need slot and value${cite("the-town/the-kinds")}`);
    if (standing === "naming" && rec.value === undefined) err(rec, `naming marks need value (the name); slot is implicitly "name"`);
    if (standing === "naming" && rec.slot !== undefined && rec.slot !== "name") warn(rec, `naming marks use slot "name" (or omit it); got "${rec.slot}"`);
    // parent source: nested (implicit) XOR explicit terrain — exactly one
    const nested = rec._parentMarkId != null;
    const explicit = rec._explicitParent != null;
    if (nested && explicit) err(rec, `nested marks must not also declare a parent — the enclosing directory is the parent`);
    else if (!nested && !explicit) err(rec, `a top-level ${rec.kind} mark must declare parent: terrain:<id>, or be nested under the mark it describes`);
    if (explicit) {
      if (!/^terrain:/.test(String(rec._explicitParent))) err(rec, `an authored parent may only be a terrain feature (terrain:<id>); to attach to a mark, nest under its directory`);
      else {
        const tid = String(rec._explicitParent).slice("terrain:".length);
        if (!TERRAIN_IDS.has(tid)) err(rec, `parent terrain:${tid} names no terrain feature (WORLD/skeleton.json)`);
      }
    }
  } else if (rec.kind === "class") {
    // THE DE-SITING (2026-08-18): law has no where. A class-node carries no
    // geometry — a rule's extent is its jurisdiction, which is enumerable,
    // never measurable. It stands in a registry by ancestry, not coordinates.
    if (rec.at !== undefined || rec.extent !== undefined) err(rec, `class marks carry no at/extent — a rule's extent is its jurisdiction, not geometry`);
    if (rec.slot !== undefined || rec.value !== undefined) err(rec, `class marks carry no slot/value (those are for predicated/naming)`);
    if (rec.class === undefined) err(rec, `a class mark declares its class: — kind: class with no class: names nothing`);
    if (rec._explicitParent) err(rec, `class marks never declare a parent — their registry standing is the enclosing directory`);
  } else if (rec.kind === "property") {
    // A PROPERTY IS THE CLASS SIDE (LOGOS/classes.md § Property and predicate,
    // ruled 2026-10-16): a node under the class it belongs to, with four fixed
    // fields, name, tier, default and body. It is class space: the town's, with
    // no where, and no slot/value (those are an instance predicate's).
    if (rec.by !== TOWN) err(rec, `a property is class space — only by: ${TOWN} declares one (a resident's claim about a mark is a predicate)`);
    if (rec.name === undefined) err(rec, `a property needs name: — the field an instance fills`);
    else if (!PROPERTY_NAME_RE.test(String(rec.name))) err(rec, `property name ${JSON.stringify(rec.name)} breaks the naming grammar: lowercase words joined by _ or - (the meta-class's rails)`);
    if (rec.at !== undefined || rec.extent !== undefined) err(rec, `property marks carry no at/extent — a property is class space, not ground`);
    if (rec.slot !== undefined || rec.value !== undefined) err(rec, `property marks carry name/default, never slot/value (those are an instance predicate's)`);
    if (rec.class !== undefined) err(rec, `a property names no class: — it stands under the class it belongs to`);
    if (rec._explicitParent) err(rec, `property marks never declare a parent — the class (or property) they stand under is the enclosing directory`);
    else if (!rec._parentMarkId) err(rec, `a property stands under the class (or the property) it belongs to — this one stands under nothing`);
    // A CHILD PROPERTY NAMES ITS PARENT PROPERTY IN `of:` (the layout, 2026-10-17:
    // children file flat in their class's directory, so no mark path grows
    // past Windows' limit). The parent it names is a property of the same
    // class: filed in the same directory, or the property it is filed under.
    if (rec.of !== undefined) {
      const up = standingIndex.get(String(rec.of));
      if (!up || up.kind !== "property")
        err(rec, `of: ${JSON.stringify(rec.of)} names no property — a child property's of: names the property it bounds`);
      else if (up._parentMarkId !== rec._parentMarkId && up.id !== rec._parentMarkId)
        err(rec, `of: ${up.id} is another class's property — a child property bounds a property of its own class (${rec._parentMarkId})`);
    }
  }

}

// 5. the edge: children must fit their container — sited/parcel marks contain
// anything; a predicated mark's children must all be predicated/naming (the
// continuation law, 2026-08-02: a predicate is its parent continued, so its
// subtree stays predicates all the way down); naming marks carry none.
{
  const kindById = new Map(marks.map((m) => [m.id, m.kind]));
  for (const rec of marks) {
    if (rec._error || !rec._parentMarkId) continue;
    const pk = kindById.get(rec._parentMarkId);
    if (pk === "naming") err(rec, `a naming mark cannot contain child marks (move this out)${cite("the-town/the-continuation")}`);
    else if ((pk === "predicated" || pk === "predicate") && !isPredicate(rec) && rec.kind !== "naming")
      err(rec, `a ${rec.kind} mark cannot nest under a predicate — a predicate's children must be predicates (the continuation law); geometry needs a geometric parent${cite("the-town/the-continuation")}`);
    else if (pk === "class" && rec.kind !== "class" && rec.kind !== "property" && !isPredicate(rec) && rec.kind !== "naming")
      err(rec, `a ${rec.kind} mark cannot nest under a class-node — class-space holds classes and their properties; geometry needs a geometric parent`);
    else if (pk === "property" && rec.kind !== "property")
      err(rec, `a ${rec.kind} mark cannot nest under a property — a property's children are its child properties (its caps and bounds)`);
    else if (rec.kind === "property" && pk !== "class" && pk !== "property")
      err(rec, `a property stands under the class (or the property) it belongs to — this one stands under a ${pk ?? "nothing"}`);
    // A predicate that outranks its parent is the one shape the tier binding
    // REFUSES rather than repairs. Everywhere else an outranking child simply
    // stops being framed by its parent and stands on its own world numbers —
    // but a predicate HAS no numbers of its own to stand on. It is its parent
    // continued, so a predicate claiming authority over what it predicates is
    // asking to describe a thing while being immune to it, and there is no
    // re-pointing that makes that true.
    const parent = byId.get(rec._parentMarkId);
    if ((isPredicate(rec) || rec.kind === "naming") && parent && rankOf(rec) > rankOf(parent))
      err(rec, `${standingOf(rec)} standing over a parent standing as ${standingOf(parent)} (${parent.id}) — a predicate cannot outrank what it predicates: it is its parent continued${cite("the-town/the-continuation")}`);
  }
}

// 5b. THE PROPERTY RAILS AND THE CLASS NAMES (LOGOS v2 part 2; LOGOS/classes.md
// § The meta-class: "admissible param bounds …, slot naming grammar, collision
// rules, and the locks"). Asked of the class space as a whole, so after every
// record has had its own shape checked above.
//   - no two kinds share a name: a class's name is its own slug (`kind: candy`
//     names the-town/candy, ruled 16:02), so no two class nodes may declare one
//     name, and a class node's `class:` is its slug;
//   - no two properties of one node share a name;
//   - a default stands within its own child bounds (`min` ≤ default ≤ `max`),
//     and the bounds are in order;
//   - the locks: a subclass that redeclares a constitution property its
//     ancestor declares (shadowing it) must be the town's own, since a
//     constitution value is the town's word (18:44 item 7).
{
  const classNodes = marks.filter((m) => !m._error && isClassDeclaration(m));
  const byName = new Map();
  for (const c of classNodes) {
    const name = String(c.class);
    if (name !== c.slug) err(c, `class: ${JSON.stringify(name)} is not its own slug "${c.slug}" — a class's name is its slug, so kind: ${name} would name the-town/${name} (ruled 2026-10-16)`);
    if (byName.has(name)) err(c, `two kinds share the name "${name}": ${byName.get(name).id} declares it too — kind: ${name} must name one class`);
    else byName.set(name, c);
  }
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  for (const node of marks.filter((m) => !m._error && (isClassDeclaration(m) || m.kind === "property"))) {
    const seen = new Map();
    for (const p of ownProperties(CLASS_IDX, node.id)) {
      if (seen.has(p.name)) err(p, `two properties of ${node.id} share the name "${p.name}" (${seen.get(p.name).id} and this one) — a node's properties are named once`);
      else seen.set(p.name, p);
    }
  }
  // G9, as amended 2026-10-17 (WLD-73 B2): no property name may equal a class
  // name, or `kind: X` and a field `X:` would say two things. It binds NEW
  // names: these eight stood before the rule, and the office reads their names
  // verbatim (household-stamps.mjs), so they keep them by id.
  const NAME_CLASH_GRANDFATHERED = new Set([
    "the-town/mark-stakeable-slot", "the-town/bounty-stakeable-slot", "the-town/ballot-stakeable-slot",
    "the-town/pot-stakeable-slot", "the-town/position-slot", "the-town/honestly-nowhere",
    "the-town/exposure-slot", "the-town/co-sign-guard",
  ]);
  for (const p of marks.filter((m) => !m._error && m.kind === "property"))
    if (CLASS_ROSTER.has(String(p.name)) && !NAME_CLASH_GRANDFATHERED.has(p.id))
      err(p, `property name "${p.name}" is a class's name — kind: ${p.name} and a field ${p.name}: would say two things (G9); name it otherwise`);

  // BY PATH (WLD-73 S1, S2): a property's place in its class is its path
  // (holder → capacity → max), the way propertyAt reads it, so the bounds and
  // the locks are asked by path down the class chain, never by bare name.
  const ownTree = (c) => {   // [path, node] for every property the class declares itself, any depth
    const out = [];
    const walk = (id, path, hops) => {
      if (hops > 16) return;
      for (const p of ownProperties(CLASS_IDX, id)) { out.push([[...path, String(p.name)], p]); walk(p.id, [...path, String(p.name)], hops + 1); }
    };
    walk(c.id, [], 0);
    return out;
  };
  const ownAt = (c, path) => ownTree(c).find(([p]) => p.join("/") === path.join("/"))?.[1] ?? null;
  const inheritedAt = (c, path) => (c.extends ? propertyAt(CLASS_IDX, String(c.extends), path) : null);
  const effectiveAt = (c, path) => {
    const own = ownAt(c, path);
    return own ? { node: own, value: propertyValue(own.default), tier: own.tier, from: String(c.class) } : inheritedAt(c, path);
  };
  for (const c of marks.filter((m) => !m._error && m.kind === "class")) {
    const tree = ownTree(c);
    // the bounds: wherever the class sets a value or a bound, its effective
    // default stands within its effective bounds, its own or inherited
    const paths = new Map();
    for (const [path] of tree) {
      const base = ["min", "max"].includes(path.at(-1)) ? path.slice(0, -1) : path;
      if (base.length) paths.set(base.join("/"), base);
    }
    for (const base of paths.values()) {
      const at = effectiveAt(c, base), lo = effectiveAt(c, [...base, "min"]), hi = effectiveAt(c, [...base, "max"]);
      const d = num(at?.value), l = num(lo?.value), h = num(hi?.value);
      const where = (b) => (b && b.from !== String(c.class) ? ` (${b.from}'s)` : "");
      const node = ownAt(c, base) ?? ownAt(c, [...base, "max"]) ?? ownAt(c, [...base, "min"]);
      const name = base.join(" → ");
      if (l != null && h != null && l > h) err(node, `${name}'s bounds are out of order in ${c.id}: min ${l}${where(lo)} > max ${h}${where(hi)}`);
      if (d != null && l != null && d < l) err(node, `${name}'s default ${d} is below its min ${l}${where(lo)} in ${c.id}`);
      if (d != null && h != null && d > h) err(node, `${name}'s default ${d} is above its max ${h}${where(hi)} in ${c.id}`);
    }
    // the locks (settled 2026-10-17, WLD-73 G6), the town's class and a
    // household's alike: a town subclass may shadow a constitution value, since
    // constitution is the town's word; a household's subclass, only a sovereign one
    for (const [path, p] of tree) {
      const up = inheritedAt(c, path);
      if (up && up.tier === "constitution" && c.by !== TOWN)
        err(p, `${c.id} redeclares ${up.from}'s ${path.join(" → ")}, a constitution property — a constitution value is the town's word, and only the town's own subclass may set it`);
    }
  }
}

// 5b'. A PLACE IS SITED'S, OR A POST'S (G13, settled 2026-10-17, WLD-73). `at`
// and `extent` are properties of sited (16:02 item 8), so an instance that
// stands at a place is an instance of a class under sited, or of a class under
// post (an idea may stand anywhere, founder-ruled 2026-09-01), or a landform (its
// own at and extent, WLD-97, 2026-10-22). A place on any
// other class's instance is refused: the lint never reads a record as sited
// from its place alone. Asked only of a class whose chain reaches the root, so
// a fixture's partial tree, which cannot answer, is left alone.
{
  // both forms (W2): the old form's class:, or the kind that names it now
  const placed = marks.filter((m) => !m._error && m.at !== undefined && m.kind !== "class" && m.kind !== "property" && !isPredicate(m) && m.kind !== "naming");
  for (const rec of placed) {
    const klass = String(instanceClassOf(rec) ?? rec.kind);
    const chain = classChain(CLASS_IDX, klass).map((c) => String(c.class));
    if (!chain.includes("postmark-node")) continue;
    // a landform carries its own place and outline as its own properties (WLD-97,
    // ruled 2026-10-22 21:04): placed, and never sited
    if (!chain.includes("sited") && !chain.includes("post") && !chain.includes("landform"))
      err(rec, `a ${klass} stands at a place, but ${klass} is not under sited (its chain: ${chain.join(" → ")}) — at and extent are sited's properties; a place is lawful only on an instance of a class under sited, under post, or a landform (G13, settled 2026-10-17; WLD-97)`);
  }
}

// 5c. A FLAT FIELD MUST BE A DECLARED PROPERTY (ruled 2026-10-16 12:42,
// confirmed: "the field namespace stays closed"). WARN first, as briefed, while
// the fields the record already carries are declared: an instance's flat field
// is checked against its class's properties, up `extends`, beside the record's
// own reserved fields (16:02: id, by, date, household, declared_household,
// parent, placementParent, stamps, weight, sovereign) and the record grammar's
// own lines (kind, class, tier, body). One warning per class and field, with a
// count, so the inventory reads as an inventory.
{
  // `held_by` is the record grammar's, like placementParent: where a held thing is instead of a place (POS-688)
  const RESERVED = new Set(["id", "by", "date", "household", "declared_household", "parent", "placementParent", "stamps", "weight", "sovereign", "kind", "class", "tier", "body", "slug", HELD_BY, OWNED_BY]);
  // how a mark stands names its class until W2 folds `class:` into `kind:`
  const STANDING_CLASS = { sited: "sited", parcel: "parcel", predicated: "predicate", naming: "naming" };
  const STANDING_FIELDS = { sited: ["at", "extent"], parcel: ["at", "extent"], predicated: ["slot", "value"], naming: ["slot", "value"] };
  const undeclared = new Map(); // `${class}\u0000${field}` -> { first, count }
  for (const rec of marks) {
    if (rec._error || rec.kind === "class" || rec.kind === "property") continue;
    const stands = standingOfRecord(rec);
    const klass = instanceClassOf(rec) ?? STANDING_CLASS[stands];
    // a class the tree does not declare has no properties to check against (a
    // fixture world without the works): the question has no answer, so no word
    if (!klass || !classChain(CLASS_IDX, klass).length) continue;
    const declared = propertyNames(CLASS_IDX, klass);
    // while `kind:` still names how a mark stands, the fields that standing
    // requires (§4 above) are the record grammar's, whichever class it names
    const standing = STANDING_FIELDS[stands] ?? [];
    for (const k of Object.keys(rec)) {
      if (k.startsWith("_") || RESERVED.has(k) || declared.has(k) || standing.includes(k)) continue;
      const key = `${klass}\u0000${k}`;
      const u = undeclared.get(key);
      if (u) u.count++; else undeclared.set(key, { first: rec, count: 1 });
    }
  }
  for (const [key, { first, count }] of undeclared) {
    const [klass, field] = key.split("\u0000");
    warn(first, `flat field ${field}: is no declared property of ${klass} (${count} mark(s) of ${klass} carry it; this is the first) — a flat field on an instance must be a declared property (ruled 2026-10-16); declare it, or say it as a predicate`);
  }
}

// 5d. THE FILL FLAG IS A TRUE/FALSE (WLD-26, ruled 2026-10-19 17:48): `fill` is
// the-town/thing's sovereign property, default true, read by the World page (a
// picture-less thing's ground is tinted, or with `fill: false` drawn as its
// outline alone). The record grammar keeps a true/false as the word, so the word
// is read the way every property's value is (class-properties.mjs § propertyValue).
for (const rec of marks) {
  if (rec._error || rec.fill === undefined || rec.kind === "class" || rec.kind === "property") continue;
  if (typeof propertyValue(rec.fill) !== "boolean")
    err(rec, `fill: is true or false — whether the World page tints this thing's ground when it has no picture (false: its outline alone); got ${JSON.stringify(rec.fill)}`);
}

// 5e. THE GROUND THE TOWN SHAPES (WLD-97 part 2, ruled 2026-10-22): `ground_m`
// is the town's alone for now, and sits inside the band of the mark's region.
// The rule is world-build.mjs § groundStands, the same one the heightfield
// honors, so a refused ground_m is one the heightfield would never lay.
{
  let anchors = null;
  try { anchors = regionAnchors(terrain); } catch { /* reported below, once */ }
  for (const rec of marks) {
    if (rec._error || rec.ground_m === undefined) continue;
    if (!anchors) { err(rec, `ground_m: the skeleton's region anchors cannot be read (${TERRAIN_PATH}), so no band can hold this ground`); continue; }
    const s = groundStands(rec, anchors, terrain, CLASS_IDX);
    if (s?.refused) err(rec, s.refused);
  }
}

// THE FRAME LAW, written out here rather than imported from the loader.
// §6b needs a second opinion on what the loader already did — and a check that
// asks the loader whether it agrees with itself proves nothing. This walks
// ALREADY-COMPOSED centres, which is a genuinely different computation from the
// loader's (that one resolves centres recursively and memoizes, with cycle and
// duplicate-id guards threaded through), so the two can disagree. See
// marks-fold.mjs § the tier binding.
//
// The freeze does NOT touch this. A frozen directory still frames the numbers
// written inside it — that is arithmetic about a file, not a claim about the
// world — and the fossil is exactly what keeps it stable: nothing moves, so no
// mark's frame is ever re-derived out from under its digits again.
const ROOT_MARK = marks.find((m) => m.slug === WORLD_ROOT_SLUG);
const WORLD_CENTRE = ROOT_MARK?.at ? { x: ROOT_MARK.at.x, y: ROOT_MARK.at.y } : { x: 0, y: 0 };
// The centre `rec`'s file numbers would be written against if it were filed
// directly inside `start` — the nearest positioned ancestor from `start` up
// (start itself included) whose tier ranks at or above rec's own.
const frameOriginFrom = (rec, start) => {
  const continued = isPredicate(rec) || rec.kind === "naming";
  const rank = rankOf(rec);
  const seen = new Set([rec.id]);
  for (let p = start; p && !seen.has(p.id); p = p._parentMarkId ? byId.get(p._parentMarkId) : null) {
    seen.add(p.id);
    if (p.at && (continued || rankOf(p) >= rank)) return { x: p.at.x, y: p.at.y };
  }
  return WORLD_CENTRE;
};
const parentOf = (rec) => (rec._parentMarkId ? byId.get(rec._parentMarkId) : null);

// 6. THE FREEZE — the two gates that replaced the nesting edge.
//
// What stood here until 2026-08-25 was the tightest-container check: the
// directory edge had to name the smallest mark that geometrically contained the
// record, and a drifted edge was either a refusal or a re-home. The founder
// repealed it (LOGOS/state-and-time.md § "The freeze — filing is static, and the
// tree is a fossil"):
//
//   "The directory-matches-containment law is REPEALED — the tree's paths make
//    no assertion, so nothing about them can become false. The lint's old
//    dir-equals-placementParent check dies with it; in its place stand two gates
//    that enforce the freeze itself: *an existing mark directory that moves is
//    refused*, and *a new mark files at its id*."
//
// Every receipt of friction the old check produced — the publish+re-home wedge,
// stranded sketchbooks, stale outsider lists, twenty-seven dead registry paths —
// came from one property: paths that moved under readers. These two gates take
// that property away rather than policing its consequences. Nothing here asks
// where a mark STANDS; that question is the fold's, answered at every settlement
// in WORLD/containment.json.
//
// THE MANIFEST IS THE FOSSIL'S BOUNDARY. WORLD/filing-freeze.json was minted
// once, on the freeze date, mapping every mark then alive to the path it was
// filed at. It is never regenerated: a rebuild would re-bless whatever the tree
// happened to say that day, which is the one thing the freeze exists to prevent.
// An id IN the manifest is a fossil and answers gate A; an id NOT in it was born
// after the freeze and answers gate B, needing no row, because its path is
// derivable from its id.
{
  const MARKS_POSIX = resolve(MARKS_DIR).replace(/\\/g, "/");
  const filedAt = (rec) => "WORLD/marks/" + resolve(rec._dir).replace(/\\/g, "/").slice(MARKS_POSIX.length + 1);

  let frozen = null;
  if (FREEZE_PATH && existsSync(FREEZE_PATH)) {
    const parsed = JSON.parse(readFileSync(FREEZE_PATH, "utf8"));
    frozen = parsed?.marks && typeof parsed.marks === "object" ? parsed.marks : {};
  }

  if (!frozen) {
    // A tree with no manifest declares no freeze, and the gates below have
    // nothing to hold it to. There are two ways to arrive here and they are not
    // the same fact:
    //
    //   a tree that is not this repository's — a fixture, a borrowed checkout —
    //   was never in the freeze's jurisdiction, and saying so on every run would
    //   be noise about a world that does not exist.
    //
    //   THIS repository's own tree with its manifest gone is the loud one. It is
    //   the single condition under which the freeze silently stops being
    //   enforced, so it is said out loud: a reader of a passing report is owed
    //   the reason the gates did not run.
    if (FREEZE_PATH)
      findings.push({
        sev: "WARN",
        file: "WORLD/filing-freeze.json",
        msg: `no frozen filing manifest at ${String(FREEZE_PATH).replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/")} — the freeze gates did not run. "Filing is frozen as of 2026-08-25": a tree that carries no boundary is not held to one`,
      });
  } else for (const rec of marks) {
    if (rec._error || !rec._dir) continue;
    if (rec.by == null) continue;           // an id of the shape "?/slug" is §1's error, not this gate's
    const here = filedAt(rec);
    const was = frozen[rec.id];

    if (was !== undefined) {
      // ── GATE A: an existing mark directory that moves is refused ──────────
      // A mark absent from the tree is NOT this gate's business: the manifest
      // names where a mark WAS filed, and a withdrawal removes a seat rather
      // than moving one. Only a record standing somewhere else answers here.
      if (here !== was)
        err(rec, `this mark is filed at ${here}, but the frozen filing names ${was} — "A mark's directory is its historical filing: it carries no claim, and it never moves again." An existing mark directory that moves is refused (the freeze, 2026-08-25); put the directory back${cite("the-town/the-frozen-filing")}`);
      continue;
    }

    // ── GATE B: a new mark files at its id ─────────────────────────────────
    // "New marks are filed by identity — WORLD/marks/<household>/<slug>/."
    // The id IS <household>/<slug>, so the path is the id and nothing has to be
    // looked up to know it. This is the layout that arrives organically, mark by
    // mark, with no rename storm ever.
    //
    // ── WHOSE FILING THIS BINDS, AND WHY IT IS NOT EVERY MARK ───────────────
    //
    // Only the kinds whose directory was ever a CONTAINMENT claim: sited and
    // parcel. Those are the marks the freeze is about — "the tree's paths make
    // no assertion", so their filing is released from geometry and pinned to
    // identity instead.
    //
    // A predicated / naming / class mark is a different edge entirely. It is its
    // parent CONTINUED (the continuation law, the-town/the-continuation): it
    // carries no at/extent, has no footprint to be contained by anything, and
    // takes its subject from the mark it is nested inside. That nesting is
    // AUTHORSHIP — "this describes that" — not a claim about ground, so the
    // freeze does not repeal it and §4 still requires it: a top-level predicate
    // must name a terrain feature or be nested under what it describes.
    //
    // Binding those kinds to their id path would mean no predicate, name, or
    // class instance could ever attach to a MARK again — only to terrain — which
    // would take the world's whole descriptive layer out with the containment
    // reading it was never part of. Verified rather than assumed: a naming mark
    // filed at `WORLD/marks/<by>/<slug>/` bounces on §4 as "a top-level naming
    // mark must declare parent: terrain:<id>", so the two rules cannot both bind
    // it. ⚠ THIS IS THE GATE'S READING of a sentence the freeze states without
    // this qualification, and it is flagged for the founder rather than buried.
    const stands = standingOfRecord(rec);
    if (stands !== "sited" && stands !== "parcel") continue;
    //
    // ── ADVISORY, PENDING THE FOUNDER'S SEQUENCING WORD (2026-08-25) ────────
    //
    // This clause is `warn` rather than `err`, and that is the only difference
    // between this form and the refusing one. The reason is not doubt about the
    // law — it is that the office write door still files every sited draft at
    // `WORLD/marks/let-there-be-light/<slug>/` (leave-exec.mjs, `parentDir =
    // ROOT_DIR`), so 33 in-flight drafts across 10 sketchbooks sit at fossil
    // paths through no author's fault. Refusing them is the rename storm the
    // ruling forbids — "Zero migration, by design… No rename storm, ever" —
    // only paid by residents instead of by the town.
    //
    // TO FLIP IT: `warn(` → `err(` here, and the two assertions in
    // tools/filing-freeze.test.mjs that name this severity. Nothing else.
    //
    // ── THE GRACE COHORT, for whoever performs the flip ────────────────────
    //
    // The flip must not refuse work that was lawful when it was written. The
    // mechanism is an APPEND to WORLD/filing-freeze.json, and it is the one
    // lawful exception to "never regenerated" — a regeneration re-blesses
    // whatever the tree says today, while an append records a decision about a
    // named, closed set:
    //
    //   1. Take the drafts that crossed at fossil paths between the freeze and
    //      the flip — an exact list, computable from the settlement journal, not
    //      a filter over the tree.
    //   2. Append each as `"<id>": "<path>"` with a sibling entry under a
    //      `grace_crossing` object carrying the flip date and the crossing that
    //      admitted it, so a reader can tell a fossil from a grandfathered row
    //      and can date the decision.
    //   3. They then answer GATE A — they never move again — which is the right
    //      law for them: they are filings that happened, exactly like the
    //      fossil, and the only thing separating them is which side of a clock
    //      they landed on.
    //
    // What must NOT happen is widening gate B, or regenerating the manifest to
    // absorb them. Both would make the boundary a function of the current tree
    // again, which is the property the freeze exists to remove.
    const want = `WORLD/marks/${rec.by}/${rec.slug}`;
    if (here !== want)
      warn(rec, `this mark was born after the freeze and is filed at ${here} — "New marks are filed by identity — WORLD/marks/<household>/<slug>/". A new mark files at its id: ${want}. ADVISORY while the office door still writes at the fossil root; it refuses once the door is fixed and the in-flight drafts have drained${cite("the-town/the-frozen-filing")}`);
  }
}


// 6b. the loader and the law agree — a check on the MACHINERY, not on any
// resident. Everything above trusts `loadMarks` to have composed each mark's
// world position correctly; this is the one place that trust is tested. Same
// walk §6 uses, run over the directory chain each record actually has.
if (declaredCoords(marks) === COORDS_RELATIVE) {
  for (const rec of marks) {
    if (rec._error || !rec._fileAt || rec === ROOT_MARK) continue; // the root IS the frame
    const o = frameOriginFrom(rec, parentOf(rec));
    const composed = fileToWorld(rec._fileAt, o);
    if (composed.x !== rec.at.x || composed.y !== rec.at.y)
      err(rec, `the loader placed this mark at ${rec.at.x},${rec.at.y}, but the frame law composes ${rec._fileAt.x},${rec._fileAt.y} on origin ${o.x},${o.y} to ${composed.x},${composed.y} — the two disagree. This is a MACHINERY BUG in tools/marks-fold.mjs, not a defect in this record; do not edit the mark to silence it`);
  }
}

// 6c. NOTHING RIDES ANOTHER HOUSEHOLD'S MARK (POS-441, ruled by Darko
// 2026-10-07: "That should just always be the default rule"). LOGOS/edit-law.md
// § Amend: "Your own household's marks inside it move with it, in the same act,
// keeping their place relative to it; another household's marks never move:
// they keep their place, and their containment follows geometry." A nested
// file's numbers are an offset from its frame, so a mark filed inside another
// household's mark rides it — and that is the one thing the ruling forbids. The
// question is household-frames.mjs's, the same one the remedy asks.
//
// JURISDICTION, as gate A's: this repository's own tree is held to the registry
// it carries (WORLD/households.json, re-derived from the town each settlement);
// a fixture tree is held only when it brings a registry with --households, because
// a synthetic world's handles were never anyone's household. This repository's
// own tree WITHOUT its registry is the loud case, as a missing manifest is: it is
// the one condition under which the gate silently stops, so it is said.
//
// A WARNING, NEVER A REFUSAL (Wright, 2026-10-07, under R5: "Silence publishes,
// everywhere; governance takes away … a refusal cannot hold anyone's marks").
// The sweep runs this lint every crossing and the registry is re-derived every
// settlement, so a household that SPLITS turns a same-household frame into
// another household's under a standing tree — and an error here would refuse the
// whole town's crossing for a fact no resident changed. The red Darko's Q5 means
// ("by hand, on the red, for now") is the standing test,
// tools/household-frames.test.mjs, in the World suite that CI and the keeper
// read, beside this warning line in the crossing's receipt. The operator round
// reads them and runs the remedy, one command that moves nothing:
// `node tools/unnest-households.mjs` re-files each named mark at its id with its
// world place kept exactly.
{
  const HH_GATE = args.includes("--households") ? opt("--households") : (OWN_TREE ? join(REPO, "WORLD/households.json") : null);
  if (HH_GATE && !existsSync(HH_GATE))
    findings.push({ sev: "WARN", file: "WORLD/households.json", msg: `no household registry at ${String(HH_GATE).replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/")} — the household gate did not run. Without the registry nobody's household is known, and a tree that cannot say whose a mark is is not held to "another household's marks never move"` });
  else if (HH_GATE) {
    for (const r of crossHouseholdRiders(marks, householdResolver(HH_GATE)))
      warn(r.rec, `this mark rides ${r.frame} (${r.frameHousehold}), another household's mark: it is filed inside it, so its numbers are an offset from that mark's centre and moving that mark would move it. Another household's marks never move — "they keep their place, and their containment follows geometry" (LOGOS/edit-law.md § Amend, ruled 2026-10-07). Re-file it at its id with its place kept: node tools/unnest-households.mjs`);
  }
}

// 7. the one-file law (2026-08-02): the only .md inside the record is a mark's
// own mark.md. Two exceptions, both at the top level and both about the grammar
// rather than about the world: SCHEMA.md, which is the record's own shape, and
// README.md, which is the fossil's label — the tree has been historical filing
// since 2026-08-25 and a browser standing in it is owed that sentence where they
// are standing. Anything else must be a full mark in its own directory.
const TOP_LEVEL_MD = new Set(["SCHEMA.md", "README.md"]);
{
  const walk = (dir, depth) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, depth + 1);
      else if (/\.md$/i.test(name) && name !== "mark.md" && !(depth === 0 && TOP_LEVEL_MD.has(name)))
        findings.push({ sev: "ERROR", file: p.replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/"), msg: `stray .md — the only .md in a mark directory is mark.md; everything else must be its own mark (the one-file law)${cite("the-town/the-one-file")}` });
    }
  };
  walk(MARKS_DIR, 0);
}

// 8. timetable: the schedule a `mechanic: timetable` mark carries (2026-08-07 —
// the Post Office as a scheduled service). Checked here rather than in the main
// loop because every id inside it must resolve against the WHOLE tree: stops and
// the vessel are named BY MARK ID and their coordinates are never duplicated
// into the schedule, so the ids are the only thing holding the service together.
//
// Strict by construction. A schedule that names a mark which is not there, or a
// time that does not parse, is not a small mistake — it is a service that
// silently never sails, and the residents standing on the quay are the ones who
// find out.
{
  const DEPART_RE = /^([01]\d|2[0-3]):([0-5]\d)Z$/; // UTC times-of-day, on the crossing clock
  const siteable = (m) => m && isSited(m) && hasGeom(m);
  for (const rec of marks) {
    if (rec._error) continue;
    const declared = rec.timetable !== undefined;
    const claims = rec.mechanic === "timetable";
    if (claims && !declared) {
      err(rec, `mechanic: timetable but no timetable: field — the mechanic is the pointer, the field is the schedule; a service needs both`);
      continue;
    }
    if (!declared) continue;
    if (!claims) {
      err(rec, `timetable: is set but mechanic: is ${JSON.stringify(rec.mechanic)} — a schedule no registered machinery runs (add mechanic: timetable)`);
      continue;
    }
    const tt = rec.timetable;
    if (tt === null || typeof tt !== "object" || Array.isArray(tt)) {
      err(rec, `timetable: must be a structured record on one line — {"vessel": "<mark id>", "pace": <km/crossing>, "stops": [{"mark": "<mark id>", "departs": ["06:00Z"]}, …]} (got ${JSON.stringify(tt)})`);
      continue;
    }

    const vessel = byId.get(tt.vessel);
    if (!vessel) err(rec, `timetable vessel: "${tt.vessel}" names no mark — the vessel is a mark, by id`);
    else if (!siteable(vessel)) err(rec, `timetable vessel: ${tt.vessel} must be a sited mark with at/extent — her footprint IS the boarding zone`);

    if (!Array.isArray(tt.stops) || tt.stops.length < 2) {
      err(rec, `timetable stops: must list at least two stop marks (got ${JSON.stringify(tt.stops)}) — one stop is not a line`);
    } else {
      const seen = new Set();
      tt.stops.forEach((s, i) => {
        const ref = s?.mark;
        const stop = byId.get(ref);
        if (!stop) return err(rec, `timetable stop ${i}: "${ref}" names no mark — stops are marks, and their coordinates are the marks' own`);
        if (!siteable(stop)) err(rec, `timetable stop ${i}: ${ref} is not sited — a stop with no at/extent has nowhere to berth`);
        if (seen.has(ref)) err(rec, `timetable stops: ${ref} appears twice — a line visits each stop once per round`);
        seen.add(ref);
        const departs = s?.departs;
        if (!Array.isArray(departs) || departs.length === 0)
          err(rec, `timetable stop ${ref}: departs must list at least one time — a stop no one leaves is not a stop`);
        else for (const t of departs)
          if (!DEPART_RE.test(String(t))) err(rec, `timetable stop ${ref}: "${t}" is not a departure time — HH:MMZ, UTC (the crossing clock's own)`);
      });
    }

    if (!(typeof tt.pace === "number" && Number.isFinite(tt.pace) && tt.pace > 0))
      err(rec, `timetable pace: must be a positive number of km per crossing (got ${JSON.stringify(tt.pace)}) — at any other pace she never arrives`);
  }
}

// 8b. consent: the three-word `m` (tools/consent.mjs; ECONOMY.md §9.2).
//
// A word is only worth anything if the person saying it owns the ground it is
// about. These lints are all one idea in four shapes: you may speak for your own
// parcel and for the inside of your own mark, about somebody ELSE's mark, using a
// word this world knows, about ground that is actually there.
//
// Checked here rather than in the main loop for the same reason as the timetable:
// every id inside a consent map must resolve against the WHOLE tree, and a
// parcel's authority is geometric, so it needs every mark's rect to answer.
{
  // --households <file>: the handle → household map the gate resolves "your own
  // household" against. Defaults to WORLD/households.json, which today is keyed by
  // CREDENTIAL ID and is stale — the right grain is the town's DECLARED household
  // slug, projected by tools/households-project.mjs. Until that projection has a
  // refresh channel and becomes canon, the flag is how a caller points this gate at
  // the correct grain, exactly as the fold's own --households already does.
  const HOUSEHOLDS_PATH = opt("--households", join(REPO, "WORLD/households.json"));
  const households = existsSync(HOUSEHOLDS_PATH)
    ? (JSON.parse(readFileSync(HOUSEHOLDS_PATH, "utf8")).households ?? {}) : {};
  const credOf = (handle) => households[handle] ?? `solo:${handle}`;
  // every parcel on file: the lint does not run the fold's admission, so a word
  // that only an inadmissible parcel would shield is still told as shielded
  const parcelIds = new Set(marks.filter((m) => !m._error && m.kind === "parcel").map((m) => m.id));

  for (const rec of marks) {
    if (rec._error) continue;

    const map = rec[CONSENT_FIELD];
    if (map === undefined) continue;
    if (!consentMap(rec)) {
      err(rec, `${CONSENT_FIELD}: must be a map from mark id to word on one line — {"<household>/<slug>": "welcomed"} (got ${JSON.stringify(map)})`);
      continue;
    }
    // who may speak at all: a parcel holder (about ground) or a mark's author
    // about what touches it (consent.mjs § seniorAtContact). Asked of the
    // ground, never the containment tree (LOGOS conflict-matrix § Roles from
    // seniority, RULED 2026-10-04, POS-369): a word on a mark that touches
    // nothing of yours speaks for ground that is not yours, and is refused; a
    // word on a mark that was there before yours is a newcomer's, and is named
    // and ignored, as a parcel's word on an older mark is. Where the first-laid
    // order proves nothing, the containment edge answers, as it always did (held
    // for POS-572, consent.mjs § IN THE MARKET).
    const isParcel = rec.kind === "parcel";

    for (const [target, word] of Object.entries(map)) {
      if (!CONSENT_WORDS.has(word)) {
        err(rec, `${CONSENT_FIELD}: "${target}" → ${JSON.stringify(word)} is not a word this world knows — ${[...CONSENT_WORDS].map((w) => `"${w}"`).join(" or ")}. The third position is silence: say nothing and the mark simply stands on its own stamps`);
        continue;
      }
      const t = byId.get(target);
      if (!t) {
        warn(rec, `${CONSENT_FIELD}: "${target}" names no mark in the tree — a word about a mark that never landed. Harmless, and it does nothing`);
        continue;
      }
      // A WELCOME is still read along the containment edge (held for
      // POS-572), so it keeps the old test: what stands inside your own mark.
      const container = containedBy.get(t.id) ?? null;
      const opposes = word === "opposed";
      const parcelIgnored = `${CONSENT_FIELD}: "${target}" is a parcel — ignored. A parcel answers its holder and the town, never the market`;
      // An opposition on a parcel is told that first: whether it touches yours
      // or not, the market's word does not reach a parcel.
      if (!isParcel && opposes && t.kind === "parcel") {
        warn(rec, parcelIgnored);
        continue;
      }
      if (!isParcel && opposes && !inContact(rec, t) && container !== rec.id) {
        err(rec, `${CONSENT_FIELD}: "${target}" does not touch this mark and this is not a parcel — you may speak for your own parcel's ground, or for a mark that overlaps your own, and for nothing else${cite("the-town/the-own-hand")}`);
        continue;
      }
      if (!isParcel && !opposes && container !== rec.id) {
        err(rec, `${CONSENT_FIELD}: "${target}" is not inside this mark and this is not a parcel — you may speak for your own parcel's ground, or for what stands inside your own mark, and for nothing else${cite("the-town/the-own-hand")}`);
        continue;
      }
      if (credOf(t.household) === credOf(rec.household)) {
        warn(rec, `${CONSENT_FIELD}: "${target}" is your own household's mark — ignored. Ownership already composes; a household never has to ask itself for permission`);
        continue;
      }
      if (!isParcel && t.kind === "parcel") {
        warn(rec, parcelIgnored);
        continue;
      }
      // the two grounds the market never reaches (consent.mjs § IN THE MARKET,
      // WLD-102): the town's own marks, and a standing parcel's interior
      if (!isParcel && opposes && townOwnedMark(t)) {
        warn(rec, `${CONSENT_FIELD}: "${target}" is the town's own mark — ignored. The market never reaches the town's own marks; the town alone is sovereign over them`);
        continue;
      }
      const interior = !isParcel && opposes ? parcelInteriorOf(t, { byId, placementOf: containedBy, parcelIds }) : null;
      if (interior) {
        warn(rec, `${CONSENT_FIELD}: "${target}" stands inside the parcel ${interior}, laid after it — ignored. Once a parcel stands, what is laid inside it answers only to its holder`);
        continue;
      }
      if (!isParcel && opposes && !seniorAtContact(rec, t, { container })) {
        warn(rec, `${CONSENT_FIELD}: "${target}" was not laid after this mark — ignored. The senior at contact holds the word: the holders of the older mark speak on a newcomer, never the reverse`);
        continue;
      }
      // a word needs ground under it: a parcel's authority runs over whatever
      // OVERLAPS it (a neighbour straddling the fence answers the same law as one
      // sitting wholly inside), so "no overlap at all" is the only empty case.
      // a parcel's reach (consent.mjs § opposed): the town's own marks never,
      // and otherwise only what came after the parcel.
      if (isParcel && townOwnedMark(t)) {
        warn(rec, `${CONSENT_FIELD}: "${target}" is the town's own mark — ignored. The town alone is sovereign over your parcel; a holder's word reaches what is laid on their ground, never the town's`);
        continue;
      }
      if (isParcel && !cameAfter(t, rec)) {
        warn(rec, `${CONSENT_FIELD}: "${target}" did not come after this parcel — ignored. A parcel speaks only on marks laid after it; the holders of an older mark speak on newcomers, never the reverse`);
        continue;
      }
      if (isParcel) {
        const pr = rect(rec); pr.w = pr.w || 25; pr.h = pr.h || 25;
        if (!t.at || overlapArea(pr, rect(t)) <= 0)
          warn(rec, `${CONSENT_FIELD}: "${target}" does not touch this parcel — a word without ground under it. It does nothing`);
      }
    }
  }
}

// 9. the two-way channel: a rendering and the word it renders name each other.
//
// A charter article carries `source:` — "this clause renders that document."
// Until now the field parsed and nothing read it, so the fidelity promise (a
// rendering may be incomplete, never untrue) had no machinery under it at all.
// Two lints give it one:
//
//   L-source-1  every `source:` names a file that is actually there.
//   L-source-2  the channel runs BOTH WAYS. The clause names the document, and
//               the document names the clause back — by mark id, on its own
//               "Rendered in the world as `<id>`" line. One-way is how drift
//               starts: the document gets rewritten by someone who has no way
//               of knowing a clause downstairs is quoting it.
//
// A document with nothing in the world yet says so in the same grammar —
// "Rendered in the world: not yet" — and both directions leave it alone.
//
// What is NOT here: whether the clause still SAYS what the source says. That one
// wants a reader, not a parser. These two are what make it reviewable by one —
// they guarantee the pair is findable, mutual, and named.
{
  const FIDELITY = "the-town/the-fidelity";
  // a Rendered line: the phrase at the start of a line, running to the end of its
  // sentence (docs wrap). Mid-sentence mentions — a report QUOTING the grammar —
  // are prose about the channel, not a declaration in it.
  const RENDERED = /^Rendered in the world\b/;
  const ID_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const docs = new Map();
  const readDoc = (rel) => {
    if (docs.has(rel)) return docs.get(rel);
    let text = null;
    try { text = readFileSync(join(REPO, rel), "utf8"); } catch { /* missing/unreadable — L-source-1 says so */ }
    let out;
    if (text == null) out = { missing: true };
    else {
      const lines = text.split(/\r?\n/);
      const spans = [];
      for (let i = 0; i < lines.length; i++) {
        if (!RENDERED.test(lines[i])) continue;
        let span = lines[i], j = i + 1;
        while (!/\.\s*$/.test(span) && j < lines.length && lines[j].trim() !== "") span += " " + lines[j++];
        spans.push(span);
      }
      const ids = new Set();
      let notYet = false;
      for (const s of spans) {
        if (/\bnot yet\b/i.test(s)) { notYet = true; continue; }
        for (const m of s.matchAll(/`([^`]+)`/g)) if (ID_SHAPE.test(m[1])) ids.add(m[1]);
      }
      out = { missing: false, declared: spans.length > 0, notYet, ids };
    }
    docs.set(rel, out);
    return out;
  };

  // ── clause → document ──
  const cited = new Set();
  for (const rec of marks) {
    if (rec._error || rec.source === undefined) continue;
    const rel = String(rec.source).trim().replace(/\\/g, "/");
    if (!rel || /^([a-z]:)?\//i.test(rel) || rel.split("/").includes("..") || rel.includes("\0")) {
      err(rec, `source: ${JSON.stringify(rec.source)} must be a path inside this repository, written from its root (e.g. LOGOS/lifetimes.md) — a word that stands outside the repo is a word nobody here can check${cite(FIDELITY)}`);
      continue;
    }
    const doc = readDoc(rel);
    if (doc.missing) {
      err(rec, `source: ${rel} names no readable file — a rendering points at the document it renders, and that document has to be there${cite(FIDELITY)}`);
      continue;
    }
    cited.add(rel);
    if (!doc.declared)
      err(rec, `source: ${rel} never names this rendering — add a line "Rendered in the world as \`${rec.id}\`." to ${rel}, so the word knows it is being rendered and cannot be rewritten out from under this clause${cite(FIDELITY)}`);
    else if (doc.notYet)
      err(rec, `source: ${rel} says "Rendered in the world: not yet" — either this clause is early or that line is stale; one of the two must move${cite(FIDELITY)}`);
    else if (!doc.ids.has(rec.id))
      err(rec, `source: ${rel} renders ${[...doc.ids].map((i) => `"${i}"`).join(", ") || "(no id)"} — not "${rec.id}"; name this clause on the document's Rendered line, or point the clause at the document that does render it${cite(FIDELITY)}`);
  }

  // ── document → clause ──
  //
  // Only when the tree being linted IS this repository's own. The lane judges a
  // COMPOSED sketchbook with main's tools: main's documents, a tree that may be a
  // crossing behind them. A clause that has not reached the sketchbook yet is not
  // a lying document, and no resident should ever be bounced for one.
  const ownTree = !SCOPE && resolve(MARKS_DIR) === resolve(join(REPO, "WORLD/marks"));
  if (ownTree) {
    const logosDir = join(REPO, "LOGOS");
    const logos = existsSync(logosDir) ? readdirSync(logosDir).filter((n) => /\.md$/i.test(n)).map((n) => `LOGOS/${n}`) : [];
    for (const rel of [...new Set([...logos, ...cited])].sort()) {
      const doc = readDoc(rel);
      if (doc.missing || !doc.declared || doc.notYet) continue;
      for (const id of doc.ids) {
        const mark = byId.get(id);
        const docErr = (msg) => findings.push({ sev: "ERROR", file: rel, msg });
        if (!mark)
          docErr(`Rendered line names "${id}", which is no mark in the tree — either the clause never landed, or it landed under another id; a document may not claim a rendering that is not there${cite(FIDELITY)}`);
        else if (String(mark.source ?? "").trim().replace(/\\/g, "/") !== rel)
          docErr(`Rendered line names "${id}", but that mark's source: is ${mark.source === undefined ? "absent" : JSON.stringify(mark.source)} — the channel runs both ways or it is not a channel${cite(FIDELITY)}`);
      }
    }
  }
}

// 10. PORTALS AND DUNGEONS (WLD-5, ruled by Darko with Wright 2026-10-13). The
// rules are portals.mjs § the lint, one definition beside the passage's: every
// `into` names a mark; every string `lands_at` names a mark; every landing
// stands within LANDING_REACH_M of its `into`; an exit out of a dungeon is never
// opposed; every room of a dungeon has a path of unlocked portals out (ADVISORY
// since Darko's 21:13 change: a whole-dungeon exit is always offered); no two
// marks with the same parent inside a dungeon overlap (Darko, 20:31: siblings only).
//
// AN ERROR, AND IT REFUSES THE CROSSING. The settlement's harm gate runs this
// lint as its first check (tools/harm-gate.mjs § 1), and Darko ruled the rules
// airtight ("no exceptions in the rule"): a portal that strands whoever takes it
// is harm to residents. The one way through is NAMED, never coded: an entry in
// WORLD/portal-lint-exceptions.json ({ mark, rule, by, why }), appended by
// whoever answers for it. An excepted finding prints as a warning that names
// the exception, so every receipt shows the portal was let through and by whom,
// and an exception that excuses nothing is said too.
//
// JURISDICTION, as the freeze's: this repository's own tree reads its own file;
// a fixture tree reads one only when it passes --portal-exceptions.
{
  const PORTAL_EXC_REL = "WORLD/portal-lint-exceptions.json";
  const excPath = opt("--portal-exceptions", OWN_TREE ? join(REPO, PORTAL_EXC_REL) : null);
  const excFile = (msg) => findings.push({ sev: "ERROR", file: PORTAL_EXC_REL, msg });
  let exceptions = [];
  // A MISSING list is an empty one: the strict direction, since absence can only
  // let fewer portals through, never more. An unreadable one is an error.
  if (excPath && existsSync(excPath)) {
    let parsed = null;
    try { parsed = JSON.parse(readFileSync(excPath, "utf8")); }
    catch (e) { excFile(`could not be read as JSON (${String(e?.message ?? e).slice(0, 120)}) — the exception list is part of the gate, and a gate that cannot read its own list does not guess`); }
    if (parsed) {
      if (!Array.isArray(parsed.exceptions)) excFile("carries no `exceptions` array");
      else for (const e of parsed.exceptions) {
        if (!e || typeof e.mark !== "string" || !PORTAL_RULES.includes(e.rule) || !e.by || !e.why)
          excFile(`an entry must name { mark, rule, by, why } with rule one of ${PORTAL_RULES.join(", ")} — got ${JSON.stringify(e)}`);
        else exceptions.push(e);
      }
    }
  }
  const { findings: portal, stale } = applyPortalExceptions(portalFindings(marks), exceptions);
  for (const f of portal) {
    const rec = standingIndex.get(f.mark) ?? { id: f.mark };
    if (f.excepted) warn(rec, `[${f.rule}] EXCEPTED by ${PORTAL_EXC_REL} (${f.excepted.by}: ${f.excepted.why}) — ${f.msg}`);
    else if (f.sev === "WARN") warn(rec, `[${f.rule}] ${f.msg}`);
    else err(rec, `[${f.rule}] ${f.msg}`);
  }
  for (const e of stale)
    findings.push({ sev: "WARN", file: PORTAL_EXC_REL, msg: `the exception for ${e.mark} (${e.rule}) matches no finding — it excuses nothing; remove it` });
}

// ---- the creature law, read whole as the tick reads it (POS-672) ----
// creatureLaw (tools/creatures.mjs) reads the creature class and its kinds
// whole or not at all, their afforded actions included: a malformed `actions`
// there throws, and a law that throws spawns nothing at that blessing. So the
// lint runs the same reader, and anything it would throw on is an ERROR here,
// on the creature class's mark, before a settlement can carry it.
{
  const creatureClass = marks.find((m) => m?.kind === "class" && m.by === TOWN && String(m.class) === "creature");
  if (creatureClass) {
    const { creatureLaw } = await import("./creatures.mjs");
    let law = null;
    try { law = creatureLaw(marks); }
    catch (e) { err(creatureClass, `the creature law cannot be read whole, so the creatures' tick would spawn nothing: ${e.message}`); }
    // A NAMED CREATURE THAT WAITS ON A DOOR (`after_door`, 2026-10-22): the door is a mark whose
    // `requires` counts at a settlement, so the creature and the door open at the same settlement.
    // A door that reads the live record, or none, would keep the creature in for good.
    const { afterDoorRefusal } = await import("./creatures.mjs");
    for (const d of law?.named ?? []) {
      const why = afterDoorRefusal(d, marks);
      if (why) err(creatureClass, `the named creature ${d.id}: ${why}`);
    }
  }
}

// ---- report (lint.mjs idiom: sort, print, exit non-zero only on ERROR) ----
// scoped mode: the whole tree was loaded (edges + cross-author leaf uniqueness
// still checked), but only findings under the scope are reported/gated.
const reported = scopeRel ? findings.filter((f) => f.file.startsWith(scopeRel)) : findings;
const scopedMarks = scopeRel ? marks.filter((m) => at(m).startsWith(scopeRel)).length : marks.length;
const order = { ERROR: 0, WARN: 1 };
reported.sort((a, b) => (order[a.sev] - order[b.sev]) || a.file.localeCompare(b.file));
const errors = reported.filter((f) => f.sev === "ERROR");
const warns = reported.filter((f) => f.sev === "WARN");

// TWO EXIT CODES. There used to be three — 3 meant REPAIR NEEDED, a re-home the
// settlement sweep could perform on the author's behalf. The freeze deleted the
// mover ("The re-home pass is DELETED from the settlement save. The settlement
// writes a mark once; nothing moves it after."), so there is no repair for a
// caller to run and no third answer to give.
//   0  nothing to answer for.
//   1  REFUSED — at least one error. A person has to decide something.
const code = errors.length ? 1 : 0;

if (JSON_OUT) {
  console.log(JSON.stringify({
    marks: scopedMarks,
    scope: scopeRel,
    errors: errors.length,
    warnings: warns.length,
    findings: reported,
    exit: code,
  }, null, 2));
  process.exit(code);
}

console.log(`Linted ${scopedMarks} mark(s)${scopeRel ? ` under ${scopeRel}` : ` under ${MARKS_DIR.replace(/\\/g, "/").replace(/^.*\/(WORLD\/marks)$/, "$1")}`}.\n`);
// THE VERDICT WORD FOLLOWS THE EXIT CODE, NOT THE FINDINGS LIST (founder-directed
// 2026-09-01, the S53 morning). The header above says "WARNs are advisory and
// never fail it", and the exit code agrees — but this line used to print CLEAN
// only on ZERO findings, warnings included, and two suite tests assert the word
// CLEAN over the live tree. So one advisory anywhere (a draft filed at the
// fossil root by the office door; an idea standing off the Tank) turned the
// whole suite red, the settlement isolate blamed the mark that drew it and held
// it back crossing after crossing, and the shadow said WOULD-REFUSE every run.
// An advisory that can refuse a settlement is not advisory. Now: no errors =
// CLEAN, with the advisories listed beneath it so nobody stops reading them.
for (const f of reported) console.log(`[${f.sev}] ${f.file}: ${f.msg}`);
if (!errors.length) {
  console.log(`${reported.length ? "\n" : ""}CLEAN — every mark is well-formed and every filing stands where the freeze left it.${warns.length ? ` (${warns.length} advisory warning(s) above — read them; they never refuse.)` : ""}`);
} else {
  console.log(`\n${errors.length} error(s), ${warns.length} warning(s).`);
}
process.exit(code);
