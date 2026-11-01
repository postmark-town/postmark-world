import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// lane-wall answers ONE question — is every change in this diff the PR
// author's to make? — so each case below is one way the answer can be no,
// plus the one way it is yes.

const record = ({ kind = "sited", by, tier, at, extent, body }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), "date: 2026-08-05"];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};

// THE REGISTRY, in the shape the store-rendered export prints it (postmark-office
// tools/world-households-export.mjs): households keyed hh:<house>, logins
// binding each house's sketchbook name, and pinned_ids (WLD-122) binding each
// numeric GitHub account to its one household. alice is account 1, mallory 3.
const REGISTRY = (extra = {}) => ({
  households: { alice: "hh:house-a", mallory: "hh:house-m" },
  logins: { "house-a": "hh:house-a", "house-m": "hh:house-m" },
  pinned_ids: { 1: "hh:house-a", 3: "hh:house-m" },
  ...extra,
});

function fixture(t, registry = REGISTRY()) {
  const repo = mkdtempSync(join(tmpdir(), "postmark-lane-wall-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  const put = (path, text) => {
    const full = join(repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  };
  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("lane-wall.mjs", "admin-makers.mjs", "lane-author.mjs"))
    cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame",
  }));
  // alice's parcel exists on main — geometry will file marks at 110,110 under it
  put("WORLD/marks/let-there-be-light/alice-parcel/mark.md", record({
    kind: "parcel", by: "alice", at: { x: 100, y: 100 }, extent: { w: 100, h: 100 }, body: "alice's ground",
  }));
  put("WORLD/households.json", JSON.stringify(registry, null, 2) + "\n");
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "main");
  git("switch", "-q", "-c", "pr-head");
  const wall = (authorId, authorLogin, baseBranch = null) => {
    try {
      const out = execFileSync(process.execPath, [
        join(repo, "tools", "lane-wall.mjs"),
        "--repo", repo, "--base", "main", "--head", "pr-head",
        "--author-id", String(authorId), "--author-login", authorLogin, "--json",
        ...(baseBranch ? ["--base-branch", baseBranch] : []),
      ], { encoding: "utf8" });
      return { ...JSON.parse(out.trim()), code: 0 };
    } catch (e) {
      return { ...JSON.parse(String(e.stdout).trim()), code: e.status };
    }
  };
  const commit = (msg) => {
    git("add", "-A");
    git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", msg);
  };
  return { repo, git, put, wall, commit };
}

test("lane-wall: the author's own well-placed mark and note pass", (t) => {
  const { put, wall, commit } = fixture(t);
  put("WORLD/marks/let-there-be-light/alice-parcel/porch/mark.md", record({
    by: "alice", at: { x: 110, y: 110 }, extent: { w: 4, h: 4 }, body: "a porch on her own ground",
  }));
  put("NOTES/alice.md", "Remember the blue door.\n");
  commit("alice adds a porch and a note");
  const verdict = wall(1, "alicehub");
  assert.equal(verdict.ok, true, JSON.stringify(verdict.violations ?? []));
  assert.equal(verdict.code, 0);
});

test("lane-wall: a borrowed pen is refused, and the hint names your real handles", (t) => {
  const { put, wall, commit } = fixture(t);
  put("WORLD/marks/let-there-be-light/alice-parcel/forged/mark.md", record({
    by: "alice", at: { x: 120, y: 120 }, extent: { w: 4, h: 4 }, body: "mallory writing as alice",
  }));
  commit("mallory forges");
  const verdict = wall(3, "malloryhub");
  assert.equal(verdict.ok, false);
  assert.match(verdict.violations[0].defect, /not one of your residents/);
  assert.match(verdict.violations[0].hint, /mallory/, "the hint teaches the author their own registered handles");
});

test("lane-wall: paths outside the lane are refused (tools, canon, the registry itself)", (t) => {
  const { put, wall, commit } = fixture(t);
  put("WORLD/households.json", JSON.stringify({ households: { mallory: "hh:house-a" }, pinned_ids: { 3: "hh:house-a" } }) + "\n");
  put("tools/innocent.mjs", "// nothing to see\n");
  commit("mallory reaches past the lane");
  const verdict = wall(3, "malloryhub");
  assert.equal(verdict.ok, false);
  assert.equal(verdict.violations.length, 2, "both paths refused");
  for (const v of verdict.violations) assert.match(v.defect, /mark records and your own notes only/);
});

test("lane-wall: a misplaced mark is refused and the hint prints the correct path", (t) => {
  const { put, wall, commit } = fixture(t);
  // geometrically inside alice-parcel, but filed at the marks root
  put("WORLD/marks/let-there-be-light/misfiled/mark.md", record({
    by: "alice", at: { x: 130, y: 130 }, extent: { w: 4, h: 4 }, body: "right ground, wrong sketchbook",
  }));
  commit("alice misfiles");
  const verdict = wall(1, "alicehub");
  assert.equal(verdict.ok, false);
  assert.match(verdict.violations[0].defect, /geometry files this mark under alice\/alice-parcel/);
  assert.match(verdict.violations[0].hint, /alice-parcel\/misfiled\/mark\.md/, "the gate teaches the exact path");
  assert.match(verdict.violations[0].hint, /place-mark/, "and names the tool that answers first");
});

test("lane-wall: the sketchbook itself must be the author's — binding rides the logins map", (t) => {
  const { put, wall, commit } = fixture(t);
  put("WORLD/marks/let-there-be-light/alice-parcel/gate/mark.md", record({
    by: "alice", at: { x: 140, y: 140 }, extent: { w: 4, h: 4 }, body: "a gate on her own ground",
  }));
  commit("alice adds a gate");
  assert.equal(wall(1, "alicehub", "draft/house-a").ok, true, "your own sketchbook passes");
  const foreign = wall(1, "alicehub", "draft/house-m");
  assert.equal(foreign.ok, false);
  assert.match(foreign.violations[0].defect, /not yours/);
  const toMain = wall(1, "alicehub", "main");
  assert.equal(toMain.ok, false);
  assert.match(toMain.violations[0].hint, /settlement's pen/);
  const unbound = wall(1, "alicehub", "draft/nowhere");
  assert.equal(unbound.ok, false);
  assert.match(unbound.violations[0].defect, /not in the registry/);
});

test("lane-wall: an unregistered author is refused with the registry-lag hint, and a foreign note is refused", (t) => {
  const { put, wall, commit } = fixture(t);
  put("NOTES/alice.md", "not mallory's note to leave\n");
  commit("mallory writes in alice's notebook");
  const carol = wall(99, "carolhub");
  assert.equal(carol.ok, false);
  // WLD-122: an author no pin binds is refused first, by name, and owns nothing after
  assert.match(carol.violations[0].defect, /GitHub account 99 is not pinned to any household/);
  assert.match(carol.violations[0].hint, /numeric id, pinned in the town's registry/);
  assert.ok(carol.violations.some((v) => /"alice" is not one of your residents/.test(v.defect) && /no handles are registered/.test(v.hint)),
    "and the foreign note is still refused, with the registry-lag hint");
});

test("lane-wall: a change is judged as the record stood — rewriting another household's mark under your own name is refused", (t) => {
  const { put, wall, commit, git } = fixture(t);
  const porchPath = "WORLD/marks/let-there-be-light/alice-parcel/porch/mark.md";
  const porch = (by, body) => record({ by, at: { x: 110, y: 110 }, extent: { w: 4, h: 4 }, body });
  // alice's porch is on main before either PR branches
  git("switch", "-q", "main");
  put(porchPath, porch("alice", "a porch on her own ground"));
  commit("alice's porch");

  git("switch", "-q", "-C", "pr-head", "main");
  put(porchPath, porch("mallory", "mallory's words under alice's path"));
  commit("mallory rewrites alice's porch as her own");
  const taken = wall(3, "malloryhub");
  assert.equal(taken.ok, false, "the record was alice's before the change");
  assert.match(taken.violations[0].defect, /"alice" is not yours to change/);

  // the control shot: alice changing her own porch's words passes
  git("switch", "-q", "-C", "pr-head", "main");
  put(porchPath, porch("alice", "a porch with a blue door"));
  commit("alice rewords her porch");
  const own = wall(1, "alicehub");
  assert.equal(own.ok, true, JSON.stringify(own.violations ?? []));
});

// ── 5, the makers law (WLD-21; Darko 2026-10-18, G3 and G4 ruled 21:23) ──────
// A slice of the class tree, as the Keeping Works files it (the class node, its
// `makers` property filed under it): a thing anyone may make, the three passage
// classes, and vehicle, which extends portal-ground and is still the town's.
const node = (lines, body) => `${["---", ...lines, "---"].join("\n")}\n\n${body}\n`;
const classNode = (name, ext) => node(["kind: class", "by: the-town", "tier: constitution", "date: 2026-10-18", `class: ${name}`, ...(ext ? [`extends: ${ext}`] : [])], `The ${name} class.`);
const makersNode = (v) => node(["kind: property", "by: the-town", "tier: constitution", "date: 2026-10-18", "name: makers", `default: ${v}`], "Who makes one.");
const WORKS = "WORLD/marks/let-there-be-light/the-keeping-works";
function withLaw({ put, commit, git }, admins) {
  git("switch", "-q", "main");
  put(`${WORKS}/postmark-node/mark.md`, classNode("postmark-node"));
  put(`${WORKS}/postmark-node/postmark-node-makers/mark.md`, makersNode(false));
  put(`${WORKS}/postmark-node/sited/mark.md`, classNode("sited", "postmark-node"));
  put(`${WORKS}/postmark-node/sited/sited-makers/mark.md`, makersNode(true));
  put(`${WORKS}/postmark-node/sited/thing/mark.md`, classNode("thing", "sited"));
  for (const k of ["dungeon", "stairs", "portal-ground"]) {
    put(`${WORKS}/postmark-node/sited/${k}/mark.md`, classNode(k, "sited"));
    put(`${WORKS}/postmark-node/sited/${k}/${k}-makers/mark.md`, makersNode(false));
  }
  put(`${WORKS}/postmark-node/sited/portal-ground/vehicle/mark.md`, classNode("vehicle", "portal-ground"));
  put("WORLD/households.json", JSON.stringify(REGISTRY(admins ? { admins } : {}), null, 2) + "\n");
  commit("the class law, and the registry's admins");
  git("switch", "-q", "-C", "pr-head", "main");
}
const classed = (kind, { by, text }, at = { x: 110, y: 110 }) =>
  node([`kind: ${kind}`, `by: ${by}`, "date: 2026-10-18", `at: { x: ${at.x}, y: ${at.y} }`, "extent: { w: 4, h: 4 }"], text);
const UNDER = "WORLD/marks/let-there-be-light/alice-parcel";

test("lane-wall makers: an admin household makes a dungeon and a stair; a thing is anyone's", (t) => {
  const f = fixture(t);
  withLaw(f, ["hh:house-a"]);
  f.put(`${UNDER}/the-deep/mark.md`, classed("dungeon", { by: "alice", text: "rooms behind a door" }));
  f.put(`${UNDER}/the-flight/mark.md`, classed("stairs", { by: "alice", text: "a way up" }, { x: 120, y: 120 }));
  f.put(`${UNDER}/a-lamp/mark.md`, classed("thing", { by: "alice", text: "a lamp" }, { x: 130, y: 130 }));
  f.commit("alice, an admin household, makes passages");
  const v = f.wall(1, "alicehub");
  assert.equal(v.ok, true, JSON.stringify(v.violations ?? []));
});

test("lane-wall makers: a non-admin household is refused a dungeon, naming makers", (t) => {
  const f = fixture(t);
  withLaw(f, ["hh:house-a"]);
  f.put(`${UNDER}/mallorys-deep/mark.md`, classed("dungeon", { by: "mallory", text: "a dungeon of her own" }));
  f.commit("mallory makes a dungeon");
  const v = f.wall(3, "malloryhub");
  assert.equal(v.ok, false);
  assert.equal(v.violations.length, 1);
  assert.match(v.violations[0].defect, /"dungeon" answers makers: false/);
});

test("lane-wall makers: admin is the three classes exactly, so a vehicle (it extends portal-ground) is refused an admin household", (t) => {
  const f = fixture(t);
  withLaw(f, ["hh:house-a"]);
  f.put(`${UNDER}/a-cart/mark.md`, classed("vehicle", { by: "alice", text: "a cart on a timetable" }));
  f.commit("alice makes a vehicle");
  const v = f.wall(1, "alicehub");
  assert.equal(v.ok, false);
  assert.match(v.violations[0].defect, /"vehicle" answers makers: false/);
});

test("lane-wall makers: after a revocation what was made stands, and only what the diff adds or changes is judged", (t) => {
  const f = fixture(t);
  withLaw(f, ["hh:house-a"]);
  // alice's dungeon stood on main while her household was admin
  f.git("switch", "-q", "main");
  f.put(`${UNDER}/the-deep/mark.md`, classed("dungeon", { by: "alice", text: "rooms behind a door" }));
  f.put("WORLD/households.json", JSON.stringify(REGISTRY(), null, 2) + "\n");
  f.commit("the dungeon stands; then the role is revoked (no admins printed)");
  f.git("switch", "-q", "-C", "pr-head", "main");
  f.put(`${UNDER}/a-lamp/mark.md`, classed("thing", { by: "alice", text: "a lamp" }, { x: 130, y: 130 }));
  f.commit("alice adds a lamp beside it");
  const untouched = f.wall(1, "alicehub");
  assert.equal(untouched.ok, true, `a standing dungeon the diff does not touch is never judged: ${JSON.stringify(untouched.violations ?? [])}`);

  f.git("switch", "-q", "-C", "pr-head", "main");
  f.put(`${UNDER}/the-deep/mark.md`, classed("dungeon", { by: "alice", text: "rooms behind a new door" }));
  f.commit("alice rewords her dungeon");
  const changed = f.wall(1, "alicehub");
  assert.equal(changed.ok, false, "a change is a making, judged as the role stands now");
  assert.match(changed.violations[0].defect, /"dungeon" answers makers: false/);
});

// ── THE AUTHOR, BOUND BY PINNED NUMERIC ID (WLD-122, Darko "Bind pinned ids") ─
// The wall binds the author through lane-author.mjs: pinned_ids[<numeric id>]
// is the ONE household the author acts for; the login is never identity, and
// an author no pin binds owns nothing. Each case runs the real tools/lane-wall.mjs.
const porchAt = (by, xy, body) => record({ by, at: xy, extent: { w: 4, h: 4 }, body });
const IN_A = "WORLD/marks/let-there-be-light/alice-parcel";

test("pinned: the author's numeric id binds their house; a RENAMED login changes nothing", (t) => {
  const { put, wall, commit } = fixture(t);
  put(`${IN_A}/bench/mark.md`, porchAt("alice", { x: 110, y: 110 }, "a bench on her own ground"));
  commit("alice adds a bench");
  assert.equal(wall(1, "alicehub").ok, true);
  assert.equal(wall(1, "alice-renamed-2026").ok, true, "the same account under a new login is the same household");
  assert.equal(wall(1, "ALICEHUB").ok, true, "case changes nothing either");
});

test("IMPERSONATION: an unpinned account whose login equals a declared house's name, or a solo resident's sketchbook alias, owns nothing — in the house's own sketchbook too", (t) => {
  const reg = REGISTRY({
    households: { alice: "hh:house-a", mallory: "hh:house-m", wren: "solo:wren" },
    logins: { "house-a": "hh:house-a", "house-m": "hh:house-m", wren: "solo:wren" },
  });
  const { put, wall, commit } = fixture(t, reg);
  put(`${IN_A}/forged/mark.md`, porchAt("alice", { x: 120, y: 120 }, "not alice"));
  put("NOTES/wren.md", "not wren's note\n");
  commit("an imposter writes as alice and as wren");
  for (const [login, branch] of [["house-a", "draft/house-a"], ["wren", "draft/wren"], ["house-a", null]]) {
    const v = wall(9, login, branch);
    assert.equal(v.ok, false, `${login} → ${branch}: ${JSON.stringify(v)}`);
    assert.match(v.violations[0].defect, /GitHub account 9 is not pinned to any household/);
    assert.ok(v.violations.some((x) => /is not one of your residents/.test(x.defect)), "the marks and notes are refused too");
  }
});

test("IMPERSONATION, the legacy key: a `login:`-keyed household is not bound by a GitHub login of that name", (t) => {
  const reg = REGISTRY({
    households: { alice: "hh:house-a", mallory: "hh:house-m", lena: "login:lena" },
    logins: { "house-a": "hh:house-a", "house-m": "hh:house-m", lena: "login:lena" },
  });
  const { put, wall, commit } = fixture(t, reg);
  put("NOTES/lena.md", "words in lena's notebook\n");
  commit("an account named lena writes lena's note");
  const v = wall(9, "lena", "draft/lena");
  assert.equal(v.ok, false, JSON.stringify(v));
  assert.ok(v.violations.some((x) => /"lena" is not one of your residents/.test(x.defect)));
});

test("ONE HOUSE, TWO HANDLES: one account authors for both of its house's residents; another house stays barred", (t) => {
  const reg = REGISTRY({ households: { alice: "hh:house-a", "alice-too": "hh:house-a", mallory: "hh:house-m" } });
  const { put, wall, commit } = fixture(t, reg);
  put(`${IN_A}/bench/mark.md`, porchAt("alice", { x: 110, y: 110 }, "alice's bench"));
  put(`${IN_A}/lamp/mark.md`, porchAt("alice-too", { x: 130, y: 130 }, "her housemate's lamp"));
  commit("two residents of one house");
  const own = wall(1, "alicehub", "draft/house-a");
  assert.equal(own.ok, true, JSON.stringify(own.violations ?? []));
  assert.deepEqual(own.handles, ["alice", "alice-too"]);
  const other = wall(3, "malloryhub", "draft/house-m");
  assert.equal(other.ok, false);
  assert.ok(other.violations.every((x) => /is not one of your residents/.test(x.defect)));
});

test("THE SKETCHBOOK ALIAS answers only for the id-bound house: own alias passes, another house's and an unpinned author's are refused", (t) => {
  const { put, wall, commit } = fixture(t);
  put(`${IN_A}/gate/mark.md`, porchAt("alice", { x: 140, y: 140 }, "alice's gate"));
  commit("alice adds a gate");
  assert.equal(wall(1, "alicehub", "draft/house-a").ok, true);
  const mallory = wall(3, "house-a", "draft/house-a");
  assert.equal(mallory.ok, false, "a pinned author of another house, with a login named like this sketchbook");
  assert.match(mallory.violations[0].defect, /this sketchbook is not yours/);
  const unpinned = wall(9, "house-a", "draft/house-a");
  assert.equal(unpinned.ok, false);
  assert.ok(unpinned.violations.some((x) => /this sketchbook is not yours/.test(x.defect)));
});

test("THE BASE'S REGISTRY, NEVER THE HEAD'S: a head that pins the imposter is refused for the path, and the binding still reads the base", (t) => {
  const { put, wall, commit } = fixture(t);
  put("WORLD/households.json", JSON.stringify(REGISTRY({ pinned_ids: { 1: "hh:house-a", 3: "hh:house-m", 9: "hh:house-a" } })) + "\n");
  put(`${IN_A}/forged/mark.md`, porchAt("alice", { x: 120, y: 120 }, "not alice"));
  commit("the imposter pins themselves in the head and writes as alice");
  const v = wall(9, "imposter");
  assert.equal(v.ok, false);
  assert.match(v.violations[0].defect, /GitHub account 9 is not pinned/, "the binding was read from the base");
  assert.ok(v.violations.some((x) => /mark records and your own notes only/.test(x.defect)), "and the registry edit is refused as a path");
});

test("FAILS CLOSED: no pinned_ids (an older registry), an empty map, or an entry that is not a household — nobody is bound, and no null compares equal", (t) => {
  for (const [why, reg, pattern] of [
    ["no pinned_ids", { households: { alice: "hh:house-a" }, logins: { "house-a": "hh:house-a" } }, /carries no pinned_ids/],
    ["empty map", REGISTRY({ pinned_ids: {} }), /not pinned to any household/],
    ["null entry against null households", { households: { alice: null }, logins: { "house-a": null }, pinned_ids: { 1: null } }, /not a household key/],
    ["empty entry", REGISTRY({ pinned_ids: { 1: "" } }), /not a household key/],
  ]) {
    const { put, wall, commit } = fixture(t, reg);
    put(`${IN_A}/bench/mark.md`, porchAt("alice", { x: 110, y: 110 }, "alice's bench"));
    commit("alice adds a bench");
    const v = wall(1, "alicehub", "draft/house-a");
    assert.equal(v.ok, false, `${why}: ${JSON.stringify(v)}`);
    assert.match(v.violations[0].defect, pattern, why);
    assert.ok(v.violations.some((x) => /is not one of your residents/.test(x.defect)), `${why}: alice's own mark is not hers without a binding`);
  }
});
