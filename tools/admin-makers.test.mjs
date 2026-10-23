// admin-makers.test.mjs — an admin household may make the three passage classes,
// exactly, and nothing else that makers keeps the town's (WLD-21; Darko
// 2026-10-18 19:38–19:52, G1–G6 ruled 21:23).   node --test tools/admin-makers.test.mjs
//
// The class law is the LIVE tree's own Keeping Works, never a copy: a makers
// value that moves under these tests moves them. The registry is a fixture,
// shaped as WORLD/households.json prints it (households: handle → household
// key; admins: household keys).

import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLiveLaw } from "./law-tree.mjs";
import { propertyOf, classChain } from "./class-properties.mjs";
import { ADMIN_CLASSES, isAdminClass, adminsOf, householdOf, mayMake, makersRefusal } from "./admin-makers.mjs";

const law = loadLiveLaw(); // the classes are law nodes (WLD-116): the live law tree

const registry = {
  households: { wright: "hh:starforge", rei: "hh:starforge", ana: "hh:ana-solace" },
  admins: ["hh:starforge"],
};
const may = (klass, by, reg = registry) => mayMake({ klass, by, marks: law, registry: reg });

test("the law this rests on: each of the three answers makers: false, so admin is their only road for a resident", () => {
  assert.deepEqual([...ADMIN_CLASSES], ["dungeon", "stairs", "portal-ground"]);
  for (const k of ADMIN_CLASSES) assert.equal(propertyOf(law, k, "makers")?.value, false, `${k} answers makers: false`);
});

test("an admin household makes a dungeon and a stair (and a portal ground): admitted, by admin, for every resident of the house", () => {
  for (const by of ["wright", "rei"])
    for (const k of ADMIN_CLASSES) {
      const v = may(k, by);
      assert.equal(v.may, true, `${by} (hh:starforge) may make a ${k}`);
      assert.equal(v.via, "admin");
      assert.equal(v.household, "hh:starforge");
    }
});

test("a non-admin household is refused the same three, and the refusal names makers and the admin road", () => {
  for (const k of ADMIN_CLASSES) {
    const v = may(k, "ana");
    assert.equal(v.may, false, `ana (hh:ana-solace) may not make a ${k}`);
    assert.equal(v.via, null);
    assert.match(makersRefusal(k), /makers: false/);
    assert.match(makersRefusal(k), /admin household/);
  }
});

test("admin reaches the three classes EXACTLY: never parcel, never what extends portal-ground (arena, vehicle), never the rest makers keeps", () => {
  // G2's reason, pinned: arena and vehicle really do extend portal-ground, so a
  // rule that rode `extends` would reach them
  for (const sub of ["arena", "vehicle"])
    assert.ok(classChain(law, sub).some((c) => c.class === "portal-ground"), `${sub} extends portal-ground`);
  for (const k of ["parcel", "arena", "vehicle", "adversary", "home-mark", "funding-quest", "stakeable", "home", "resident", "household", "mark", "postmark-node"]) {
    assert.equal(isAdminClass(k), false, `${k} is not an admin class`);
    assert.equal(may(k, "wright").may, false, `admin does not make a ${k}`);
    assert.doesNotMatch(makersRefusal(k), /admin household/, `the ${k} refusal does not offer an admin road`);
  }
});

test("makers still answers first: a thing is any resident's, admin or not", () => {
  assert.deepEqual([may("thing", "wright").via, may("thing", "ana").via], ["makers", "makers"]);
});

test("a resident's own GitHub account is no household: an owner's handle the registry does not hold stands alone, and is not admin", () => {
  // wright-starforge owns the org, but no house lists it, so the office's
  // refresh never prints it; here it is a handle with no household
  assert.equal(householdOf(registry, "wright-starforge"), "solo:wright-starforge");
  assert.equal(may("dungeon", "wright-starforge").may, false);
});

test("no `admins` in the printout means no admin household (the strict direction)", () => {
  const bare = { households: registry.households };
  assert.equal(adminsOf(bare).size, 0);
  assert.equal(adminsOf({ admins: "hh:starforge" }).size, 0, "a malformed admins is none, never a string match");
  assert.equal(may("dungeon", "wright", bare).may, false);
});
