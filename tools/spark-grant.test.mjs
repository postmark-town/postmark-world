// spark-grant.test.mjs — the resident class grants `spark`, and the act's meaning is the spark class's own (POS-1222).
//
// LOGOS § Class-nodes (ruled 2026-08-15): "Registration answers what an action *is*; the **grant** — who may declare it — is an
// `actions:` entry on the **actor's** class", and "A grant names its residue and the door quotes the residue's own mark". So the
// verb that makes a spark is granted where every resident's standing capabilities live (the resident class, ambient), and its
// residue is the class of the node it creates, `the-town/spark`, whose body is what a resident reads at the act. Nothing here
// copies that body: the test reads it from the class mark, so a change to the spark's definition changes the blurb with it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseRecord } from "./marks-fold.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const WORKS = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works";
const RESIDENT = `${WORKS}/postmark-node/entity/resident/mark.md`;
const SPARK = `${WORKS}/postmark-node/mark/spark/mark.md`;
const read = (rel) => readFileSync(join(here, "..", rel), "utf8");
const actionsOf = (rel) => {
  const line = read(rel).split("\n").find((l) => l.startsWith("actions:"));
  assert.ok(line, `${rel} carries an actions: line`);
  return JSON.parse(line.slice("actions:".length).trim());
};

test('LOGOS § The spark, "One act makes it": the resident class grants spark, its residue the spark class', () => {
  const sparks = actionsOf(RESIDENT).filter((a) => a.action === "spark");
  assert.equal(sparks.length, 1, "the resident class grants spark exactly once");
  assert.deepEqual(sparks[0], { action: "spark", residue: "the-town/spark" },
    'LOGOS: "the resident class grants `spark`, and its residue is this class" — no for: (an absent for: is the resident), no copied blurb, no fields kept beside the grant');
  // the control: the grant sits beside leave-mark, which keeps making sparks as before ("leave-mark keeps making sparks as before")
  assert.ok(actionsOf(RESIDENT).some((a) => a.action === "leave-mark" && a.residue === "the-town/leave-mark"), "leave-mark's own grant is unchanged");
});

test("the residue resolves: the town's constitutional spark class, whose body is the blurb a resident reads", () => {
  const rec = parseRecord(read(SPARK), SPARK);
  // the office's residue gate (world-apex.mjs § RESIDUE_QUERY): by the-town, tier constitution, with a class name
  assert.equal(rec.kind, "class");
  assert.equal(rec.by, "the-town");
  assert.equal(rec.tier, "constitution");
  assert.equal(rec.class, "spark", "the residue the-town/spark names this class mark");
  const body = read(SPARK).split(/^---$/m).slice(2).join("---").trim();
  assert.ok(body.length > 0, "the class has a body to quote");
  assert.ok([...body].length <= 150, `a class blurb is held to the class grammar's 150 (got ${[...body].length})`);
});

test("only the resident class grants spark: no other class mark in the Keeping Works mints the verb", () => {
  // the verb travels with what a resident IS (ambient); a ground or a thing granting it too would be a second door to the same act
  const out = [];
  const walk = (rel) => {
    const text = read(rel);
    const line = text.split("\n").find((l) => l.startsWith("actions:"));
    if (line && JSON.parse(line.slice("actions:".length).trim()).some((a) => a.action === "spark")) out.push(rel);
  };
  const visit = (relDir) => {
    for (const name of readdirSync(join(here, "..", relDir))) {
      const rel = `${relDir}/${name}`;
      if (statSync(join(here, "..", rel)).isDirectory()) visit(rel);
      else if (name === "mark.md") walk(rel);
    }
  };
  visit(WORKS);
  assert.deepEqual(out, [RESIDENT]);
});
