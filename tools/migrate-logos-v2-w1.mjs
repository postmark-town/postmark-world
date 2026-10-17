// migrate-logos-v2-w1.mjs — LOGOS v2 part 2, lane W1: the class tree's data change, by one script.
// Usage: node tools/migrate-logos-v2-w1.mjs [<world-tree-root>] [--dry]   (default: this repo)
// Run once on world main 71b4dac7 it produces this branch's WORLD/marks byte for byte;
// re-run on its own output it changes nothing. The rulings each step carries out are
// cited beside it (LOGOS/classes.md; the candy sitting, 2026-10-16).
// Writes only mark.md files inside the tree (edits in place, new property/class nodes).
// Never deletes or moves a directory (the freeze: an existing mark directory never moves).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");
const { loadMarks } = await import(pathToFileURL(join(ROOT, "tools/marks-fold.mjs")).href);
const marks = loadMarks(join(ROOT, "WORLD/marks"));
const byId = new Map(marks.map((m) => [m.id, m]));
const TOWN = "the-town";
const DATE = "2026-10-17";
const SRC = "LOGOS/classes.md";
const log = [];
const note = (s) => log.push(s);

const cls = (name) => {
  const c = marks.find((m) => m.kind === "class" && m.by === TOWN && String(m.class) === name);
  if (!c) throw new Error(`no class ${name}`);
  return c;
};
const fileOf = (m) => join(m._dir, "mark.md");

// ---- frontmatter editing on raw text (order and spelling of untouched lines kept) ----
function splitFm(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)$/);
  if (!m) throw new Error("no frontmatter");
  return { lines: m[1].split(/\r?\n/), rest: m[2] };
}
const joinFm = ({ lines, rest }) => `---\n${lines.join("\n")}\n---${rest}`;
const keyOf = (line) => (line.match(/^([A-Za-z_][\w-]*):/) || [])[1];
function edit(m, fn, why) {
  const f = fileOf(m);
  const before = readFileSync(f, "utf8");
  const fm = splitFm(before);
  fn(fm.lines);
  const after = joinFm(fm);
  if (after === before) return;
  if (!DRY) writeFileSync(f, after);
  note(`EDIT ${m.id}: ${why}`);
}
const setLine = (lines, key, value, afterKey = null) => {
  const i = lines.findIndex((l) => keyOf(l) === key);
  const line = `${key}: ${value}`;
  if (i >= 0) { lines[i] = line; return; }
  const j = afterKey ? lines.findIndex((l) => keyOf(l) === afterKey) : -1;
  if (j >= 0) lines.splice(j + 1, 0, line); else lines.push(line);
};
const dropLine = (lines, key) => { const i = lines.findIndex((l) => keyOf(l) === key); if (i >= 0) lines.splice(i, 1); return i >= 0; };

// ---- new nodes ----
const created = [];
function writeNode(dir, fm, body) {
  const f = join(dir, "mark.md");
  const text = `---\n${Object.entries(fm).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n${body}\n`;
  if (existsSync(f)) {
    // re-runnable: a node this script already wrote is left as it is
    const was = readFileSync(f, "utf8");
    if (was === text) return dir;
    // a node this script wrote on an earlier run (dated today, the town's) is rewritten
    if (!/^date: 2026-10-17$/m.test(was) || !/^by: the-town$/m.test(was)) throw new Error(`exists with other content: ${f}`);
  }
  if (!DRY) { mkdirSync(dir, { recursive: true }); writeFileSync(f, text); }
  created.push(dir);
  note(`NEW ${dir.replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/")}`);
  return dir;
}
const slugOf = (s) => String(s).replace(/_/g, "-").toLowerCase();
// THE LAYOUT (Windows MAX_PATH, 2026-10-17): every new property node files FLAT in
// its class's directory, slug `<class>-<path>`, so its id is unique by
// construction. A child property (capacity under holder, max under capacity)
// names its parent property in its own `of:` field instead of nesting a folder
// under it. Returns the node's id, which is what a child's `of:` names.
function property(classDir, slug, { name, tier, dflt, body, of }) {
  writeNode(join(classDir, slug), { kind: "property", by: TOWN, tier, date: DATE, name, of, default: dflt === undefined ? undefined : String(dflt) }, body);
  return `${TOWN}/${slug}`;
}
function classNode(parentDir, name, { ext, body, extra = {} }) {
  return writeNode(join(parentDir, name), { kind: "class", by: TOWN, tier: "constitution", date: DATE, class: name, version: 1, extends: ext, implements: "[]", ...extra }, body);
}

// =====================================================================================
// 1. THE 93 CLASS PREDICATES BECOME PROPERTIES (in place: kind, slot → name, value → default)
// =====================================================================================
// the class side: a predicate standing under a class, or under one of those (its
// own clauses, e.g. the-town/sunset-slot's scope), all the way down
const classSide = (m, hops = 0) => {
  const up = m.parent ? byId.get(m.parent) : null;
  if (!up || hops > 16) return false;
  if (up.kind === "class") return true;
  return (up.kind === "predicated" || up.kind === "property") && classSide(up, hops + 1);
};
const classPreds = marks.filter((m) => m.kind === "predicated" && classSide(m));
// Two of them take one more line (settled 2026-10-17, WLD-73 F3 and the freeze):
//   - the-town/one-per-resident's slot was `holder`, the same name as the new
//     holder true/false; no property name may clash (G9), so it is `owner`;
//   - the-town/character-cap is `body`'s constitution child (12:52), and the
//     freeze will not move its directory under body's, so it names its parent
//     property in its own `of:` field, the way every new child does.
const RENAMED = { "the-town/one-per-resident": "owner" };
const OF = { "the-town/character-cap": "the-town/mark-body" };
for (const p of classPreds) {
  edit(p, (lines) => {
    setLine(lines, "kind", "property");
    const si = lines.findIndex((l) => keyOf(l) === "slot");
    lines[si] = RENAMED[p.id] ? `name: ${RENAMED[p.id]}` : lines[si].replace(/^slot:/, "name:");
    const vi = lines.findIndex((l) => keyOf(l) === "value");
    lines[vi] = lines[vi].replace(/^value:/, "default:");
    if (OF[p.id]) lines.splice(vi, 0, `of: ${OF[p.id]}`);
  }, `class predicate → property (slot → name, value → default)${RENAMED[p.id] ? `, renamed ${RENAMED[p.id]}` : ""}${OF[p.id] ? `, of ${OF[p.id]}` : ""}`);
}
note(`class predicates converted: ${classPreds.length}`);

// =====================================================================================
// 2. EVERY DIAL BECOMES A PROPERTY NODE (locked: tier constitution, default = the dial)
// =====================================================================================
// Ruled exceptions: thing's make_daily_cap is removed (15:50); thing's carry_cap is the
// resident's holder capacity 24 (16:03–16:05), written in § 3 below.
const DROPPED = { "the-town/thing": new Set(["make_daily_cap", "carry_cap"]) };
// The instance dials are the maker's word, so tier sovereign (settled 2026-10-17,
// WLD-73 F2; 18:44 item 7, "a property's tier says whose word decides its value on
// each instance"): the arena's turn timeout ("each encounter may set its own") and
// the adversary's five `unsealed` numbers.
const SOVEREIGN_DIALS = {
  "the-town/arena": new Set(["turn_timeout_s"]),
  "the-town/adversary": new Set(["hp", "hits_for", "to_hit_die", "damage_die", "initiative_bonus"]),
};
const B = {
  "the-town/cast": { to_hit_die: "Cast rolls this die to hit.", damage_die: "Cast rolls this die for damage.", beats_ac: "Cast hits when its roll beats this armour.", ends_turn: "Whether casting ends your turn on the wheel." },
  "the-town/strike": { to_hit_die: "Strike rolls this die to hit.", damage_die: "Strike rolls this die for damage.", beats_ac: "Strike hits when its roll beats this armour.", ends_turn: "Whether striking ends your turn on the wheel." },
  "the-town/guard": { halves_next_hit: "Whether guarding halves the next hit you take.", ends_turn: "Whether guarding ends your turn on the wheel." },
  "the-town/lift": { restores_to: "The health a lift raises a downed guest back to.", ends_turn: "Whether lifting ends your turn on the wheel." },
  "the-town/loot": { ends_turn: "Whether looting ends your turn on the wheel." },
  "the-town/fog": { seed: "What each day's fog is brewed from: the crossing's own number, so every clone gets the same weather." },
  "the-town/sound": { radius_m: "How far a voice carries, in metres.", hearing_ttl_min: "Minutes a voice is heard after it is spoken.", flood_cap: "The most voices one hearing returns.", thread_close_min: "Minutes of silence that close a conversation." },
  "the-town/berth": { sunset_crossings: "Crossings a berth stands before it sunsets." },
  "the-town/creature": { from_crossing: "The crossing creatures start from; null is off, and nothing spawns until the town says so.", span_h: "Hours a creature lasts from its own spawn.", band_from_m: "Where the band creatures spawn in starts, in metres from the Mists' edge on the clear side.", band_to_m: "Where that band ends, in metres from the Mists' edge.", keep_m: "How far from a kept place a creature keeps away, in metres.", apart_m: "How far apart two creatures of one window stand, in metres." },
  "the-town/bat": { count_per_window: "How many bats one window brings." },
  "the-town/raven": { count_per_window: "How many ravens one window brings." },
  "the-town/wolf": { count_per_window: "How many wolves one window brings." },
  "the-town/household": { birth_tier: "The standing a household is born with.", residents_per_address: "How many residents one address holds." },
  "the-town/human": { pace_km_per_crossing: "A human's stride is the resident's: this names the class whose stride it reads." },
  "the-town/resident": { pace_km_per_crossing: "The resident's stride, in kilometres per crossing: the stride every departure is read against." },
  "the-town/adversary": { hp: "An adversary's health: unsealed, so the encounter that stands it fills it.", hits_for: "What an adversary hits for: unsealed, filled by its encounter.", to_hit_die: "The die an adversary rolls to hit: unsealed, filled by its encounter.", damage_die: "The die an adversary rolls for damage: unsealed, filled by its encounter.", initiative_bonus: "An adversary's initiative bonus: unsealed, filled by its encounter." },
  "the-town/bounty": { ask_max_chars: "The most characters a bounty's ask may carry.", beta: "Whether bounties are still in beta." },
  "the-town/idea": { beta: "Whether ideas are still in beta." },
  "the-town/parcel": { extent_m: "A parcel's side, in metres." },
  "the-town/portal-ground": { beat_seconds: "Seconds between a portal ground's beats." },
  "the-town/arena": { turn_timeout_s: "Seconds a turn waits before the wheel moves on.", initiative_die: "The die initiative is rolled on.", guest_hp: "The health a guest enters the fight with.", lift_to: "The health a lift restores a downed guest to.", round_boundary_joins: "Whether a joiner waits for the round's boundary to take a slot." },
  "the-town/thing": { take_requires_welcome: "Whether taking a thing needs the welcome of the ground it stands on." },
  "the-town/note": { body_max_chars: "The most characters one note may carry." },
  "the-town/a-grant-may-name-a-relation": { scope: "Where a relation-named grant reaches: its own ground." },
  "the-town/downed-not-dead": { scope: "Where downed-not-dead holds: the portal only." },
  "the-town/the-turn-wheel": { gates: "The verbs the wheel gates while a fight is live." },
  "the-town/the-witnessed-roll": { entropy: "What a witnessed roll is drawn from." },
  "the-town/what-you-carry-grants-to-you": { custody: "Whose pen may hang a grant on an object." },
};
const LINTS = ["the-classed-mark", "the-conforming-instance", "the-consulted-doctrine", "the-live-handler", "the-owned-constants", "the-reaching-mechanic", "the-readable-inputs", "the-unmoved-past"];
for (const l of LINTS) B[`the-town/${l}`] = { lint: "The world-lint this question runs as at every hydration." };

const dialed = marks.filter((m) => m.kind === "class" && m.by === TOWN && m.dials && typeof m.dials === "object");
let dialCount = 0, dialProps = 0;
for (const c of dialed) {
  for (const [k, v] of Object.entries(c.dials)) {
    dialCount++;
    if (DROPPED[c.id]?.has(k)) { note(`DROP dial ${c.id}.${k} (ruled)`); continue; }
    const body = B[c.id]?.[k];
    if (!body) throw new Error(`no body for ${c.id}.${k}`);
    property(c._dir, `${c.slug}-${slugOf(k)}`, { name: k, tier: SOVEREIGN_DIALS[c.id]?.has(k) ? "sovereign" : "constitution", dflt: v === null ? "null" : v, body });
    dialProps++;
  }
}
// every class node loses its `dials:` line (an empty {} included)
for (const c of marks.filter((m) => m.kind === "class" && m.by === TOWN)) {
  edit(c, (lines) => { dropLine(lines, "dials"); }, "dials: line removed (its dials are property nodes now)");
}
note(`dials: ${dialCount} on ${dialed.length} classes → ${dialProps} property nodes (${dialCount - dialProps} dropped by ruling)`);

// =====================================================================================
// 3. THE NEW CLASS NODES AND THE RULED PROPERTIES
// =====================================================================================
const NODE = cls("postmark-node"), MARK = cls("mark"), PRED = cls("predicate"), THING = cls("thing"), RESIDENT = cls("resident");

// sited (13:56), with at and extent (16:02 item 8)
const SITED = classNode(MARK._dir, "sited", { ext: "mark", body: "A sited mark stands somewhere: it has a place and an extent, and the ground it stands in answers for it. A mark is sited or a predicate, never both." });
property(SITED, "sited-at", { name: "at", tier: "sovereign", body: "Where a sited mark stands: the maker places it." });
property(SITED, "sited-extent", { name: "extent", tier: "sovereign", body: "How much ground a sited mark covers: the maker gives it." });
// a predicate's own fields: a parent (its directory), a slot and a value (15:27);
// the slot is the claimant's own words, so both are the maker's
property(PRED._dir, "predicate-slot", { name: "slot", tier: "sovereign", body: "What a predicate claims about the mark it stands under: the claimant names it, in their own words." });
property(PRED._dir, "predicate-value", { name: "value", tier: "sovereign", body: "What a predicate says the slot is: the claimant's value, contestable by anyone's rival claim." });
// naming, a subclass of predicate (16:02)
classNode(PRED._dir, "naming", { ext: "predicate", body: "A naming is a predicate whose claim is a name." });
// post, a sibling of mark under postmark-node (15:12), with a sovereign about: (16:02 item 3)
const POST = classNode(NODE._dir, "post", { ext: "postmark-node", body: "A post is an ask the town reads, not a claim on the world: an idea or a bounty is a post, and stands nowhere as a mark." });
property(POST, "post-about", { name: "about", tier: "sovereign", body: "The mark a post is about, when it is about one: the maker names it." });
// body, a sovereign property of mark (12:48, 16:02)
property(MARK._dir, "mark-body", { name: "body", tier: "sovereign", body: "What a mark says, in its maker's words. Every mark subclass inherits it; its cap is the-town/character-cap. Class and property nodes take their body from the meta-class, uncapped." });

// holder, capacity, open (16:03–16:05)
const RH = property(RESIDENT._dir, "resident-holder", { name: "holder", tier: "constitution", dflt: true, body: "A resident is a holder: what they carry is held by them." });
property(RESIDENT._dir, "resident-capacity", { of: RH, name: "capacity", tier: "constitution", dflt: 24, body: "The most a resident carries at once. A carried holder counts one, whatever it holds." });
const TH = property(THING._dir, "thing-holder", { name: "holder", tier: "sovereign", dflt: false, body: "Whether a thing holds other things: the maker says so, and a thing holds nothing unless they do." });
const TC = property(THING._dir, "thing-capacity", { of: TH, name: "capacity", tier: "sovereign", dflt: 30, body: "How many marks a holding thing can hold: the maker sets it, within its bounds." });
property(THING._dir, "thing-capacity-min", { of: TC, name: "min", tier: "constitution", dflt: 1, body: "The least a holding thing's capacity may be." });
property(THING._dir, "thing-capacity-max", { of: TC, name: "max", tier: "constitution", dflt: 120, body: "The most a holding thing's capacity may be. A town subclass may set its own bound." });
property(THING._dir, "thing-open", { of: TH, name: "open", tier: "sovereign", dflt: true, body: "Whether other households may give into and take from a holding thing. When it is false, another household's give or take is refused at the door." });
property(THING._dir, "thing-portable", { name: "portable", tier: "sovereign", dflt: true, body: "Whether a thing can be taken and carried. Only a portable thing shows take." });

// makers (18:44, 19:39): a constitution true/false, inherited down extends
const MAKERS = [
  [NODE, false, "Who may make an instance: no one but the town, unless a class below says otherwise."],
  [MARK, null], // inherits
  [THING, true, "A resident may make a thing."],
  [cls("note"), true, "A resident may make a note."],
  ["post", true, "A resident may make a post."],
  [PRED, true, "A resident may make a predicate (Darko, 2026-10-16 15:14: \"Yes, residents may.\")."],
  ["sited", true, "A resident may make a plain sited mark, as the always-shown leave-mark says."],
  [cls("parcel"), false, "Only the town makes a parcel: sovereign ground confers standing (the-town/nothing-you-control-mints)."],
  [cls("portal-ground"), false, "Only the town makes a portal ground: passage machinery (the-town/nothing-you-control-mints)."],
  [cls("vehicle"), false, "Only the town makes a vehicle: the Post Office timetable (the-town/nothing-you-control-mints)."],
  [cls("adversary"), false, "Only the town makes an adversary: the town's encounter (the-town/nothing-you-control-mints)."],
  [cls("dungeon"), false, "Only the town makes a dungeon: passage machinery (the-town/nothing-you-control-mints)."],
  [cls("home-mark"), false, "Only the town makes a home mark: the home act makes it, never leave-mark (the-town/nothing-you-control-mints)."],
  [cls("stairs"), false, "Only the town makes stairs: passage machinery (the-town/nothing-you-control-mints)."],
  // settled 2026-10-17 01:0x (WLD-73): money and stakes stay the town's, under
  // 18:44 item 2 ("Identities, households, parcels, stakes, money, crossings …
  // stay town-only"); a home stays false from the root (the home act makes it)
  [cls("funding-quest"), false, "Only the town makes a funding quest: it is money (the-town/nothing-you-control-mints)."],
  // G13, settled 2026-10-17 (WLD-73): the town charters and the Post Office
  // timetable stand at a place, so their classes go under sited; both are the
  // town's alone (a town is a standing, a timetable is the boat others board)
  [cls("town"), false, "Only the town makes a town: it confers standing (the-town/nothing-you-control-mints)."],
  [cls("timetable"), false, "Only the town makes a timetable: the schedule others board (the-town/nothing-you-control-mints)."],
  [cls("stakeable"), false, "Only the town makes a stakeable predicate: it publishes a staking menu (the-town/nothing-you-control-mints)."],
];
const dirOfName = { post: POST, sited: SITED };
for (const [c, v, body] of MAKERS) {
  if (v === null) continue;
  const dir = typeof c === "string" ? dirOfName[c] : c._dir;
  const slug = typeof c === "string" ? c : c.slug;
  property(dir, `${slug}-makers`, { name: "makers", tier: "constitution", dflt: v, body });
}

// the tree's extends edges (13:56, 15:12, 15:43, 19:39; G1 for thing/parcel/portal-ground
// and note, settled 2026-10-17: note carries at and extent, the promotion test;
// G13 for town and timetable, settled the same night: their instances stand at a place)
const REPARENT = { town: "sited", timetable: "sited", note: "sited", thing: "sited", parcel: "sited", "portal-ground": "sited", adversary: "sited", dungeon: "sited", "home-mark": "sited", stairs: "sited", predicate: "mark", idea: "post", bounty: "post" };
for (const [name, ext] of Object.entries(REPARENT)) {
  const c = cls(name);
  edit(c, (lines) => setLine(lines, "extends", ext, "version"), `extends: ${c.extends ?? "(none)"} → ${ext}`);
}

// consumable → candy (G2), the Halloween Candy Bowl and Bag (18:44 item 3)
const CONS = classNode(THING._dir, "consumable", { ext: "thing", body: "A consumable is a thing that is used up: consuming it ends it." });
classNode(CONS, "candy", { ext: "consumable", body: "Candy is a consumable to eat. Each kind of candy is a subclass of candy, made by the town; residents may make candy of any kind." });
const BOWL = classNode(THING._dir, "halloween-candy-bowl", {
  ext: "thing",
  extra: { actions: JSON.stringify([{ action: "refill", who: "maker", from: "reach", effect: "leave-mark { kind, count, to: this bowl }", residue: "the-town/leave-mark" }]) },
  body: "A Halloween Candy Bowl is a thing that holds, set out for others to take from. Its maker may refill it: shorthand for leave-mark into the bowl.",
});
property(BOWL, "halloween-candy-bowl-holder", { name: "holder", tier: "constitution", dflt: true, body: "A candy bowl always holds." });
const BAG = classNode(THING._dir, "halloween-candy-bag", { ext: "thing", body: "A Halloween Candy Bag is a thing that holds, for carrying what you gather. Carried, it counts one toward your 24, with its contents inside." });
const BH = property(BAG, "halloween-candy-bag-holder", { name: "holder", tier: "constitution", dflt: true, body: "A candy bag always holds." });
const BC = property(BAG, "halloween-candy-bag-capacity", { of: BH, name: "capacity", tier: "sovereign", dflt: 200, body: "How much a candy bag holds: 200, above a thing's 120." });
property(BAG, "halloween-candy-bag-capacity-min", { of: BC, name: "min", tier: "constitution", dflt: 1, body: "The least a candy bag's capacity may be." });
property(BAG, "halloween-candy-bag-capacity-max", { of: BC, name: "max", tier: "constitution", dflt: 200, body: "The most a candy bag's capacity may be: the bag's own bound, above a thing's 120." });

// THE 58 IDEAS AND 3 BOUNTIES ARE NOT REWRITTEN (settled 2026-10-17 00:1x, WLD-73 G7):
// posts live in the office's post machine, one record, and a later lane imports
// them there with about:. The class tree above still has post, with idea and
// bounty beneath it; their instances stay the marks they are.

console.log(log.join("\n"));
console.log(`\ncreated ${created.length} nodes`);
