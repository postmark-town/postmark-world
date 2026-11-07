// chooser-washes.test.mjs — row 63's follow-up (Darko 2026-10-16 18:06, call
// A): a talk-lens wash is one more clickable under the 17:37 rule. With the 💬
// lens up, a click whose point holds a wash and nothing else opens its thread
// directly, as today; with a mark, resident or creature there too, the wash is
// one more chooser entry, "a conversation". (Call 9: identical rows, two "a
// bat", stay as they are for v1.)
// Run: node --test tools/chooser-washes.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { convoChoiceId, isConvoChoiceId, chooserLeadLine, groupChooserIds, walkerHoverId } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const click = SOURCE.slice(SOURCE.indexOf("      const here = clickablesAtPoint({ x: e.clientX, y: e.clientY },"), SOURCE.indexOf("      // THE CONTESTED CLICK."));

test("a wash is entered by its thread's id, and is never a mark", () => {
  const id = convoChoiceId("t-123");
  assert.equal(id, "convo:t-123");
  assert.ok(isConvoChoiceId(id));
  assert.ok(!isConvoChoiceId("convo:") && !isConvoChoiceId("darko/a-mark"));
  assert.deepEqual(groupChooserIds([walkerHoverId("darko"), "darko/a-mark", id], { isWalker: (x) => x.startsWith("walker:") }),
    { residents: [walkerHoverId("darko")], creatures: [], parcels: [], others: ["darko/a-mark"], conversations: [id] });
});

test("the lead line counts conversations in plain words", () => {
  assert.equal(chooserLeadLine(["darko/a-mark", convoChoiceId("t1")]), "1 mark and 1 conversation are here — which one?");
  assert.equal(chooserLeadLine([walkerHoverId("darko"), "creature:bat-1", convoChoiceId("t1")]), "1 resident, 1 creature and 1 conversation are here — which one?");
  assert.equal(chooserLeadLine([convoChoiceId("t1"), convoChoiceId("t2")]), "2 conversations are here — which one?");
});

test("pins: the wash case. Alone, its thread opens; with anything else, it joins the chooser", () => {
  // every wash holding the point, not only the smallest
  assert.match(click, /const washes = \(\(\) => \{ const wp = worldPointForEvent\(e\); return convosAt\(wp\.x, wp\.y\)\.map\(\(h\) => convoChoiceId\(h\.id\)\); \}\)\(\);/);
  // a resident or creature under the point: the wash is one more entry
  assert.match(click, /if \(here\.all\.length \+ washes\.length > 1\) \{ openChooser\(\[\.\.\.here\.all, \.\.\.washes\]\); return; \}/);
  // marks only, or more than one wash: the chooser, with the washes
  assert.match(click, /if \(washes\.length && \(here\.all\.length \|\| washes\.length > 1\)\) \{ openChooser\(\[\.\.\.here\.all, \.\.\.washes\]\); return; \}/);
  // a wash and nothing else: its thread, directly, as today
  assert.match(click, /if \(hit\) \{ window\.open\(convoHref\(hit\.id\), "_blank", "noopener"\); return; \}/);
  assert.ok(click.indexOf("if (washes.length && (here.all.length") < click.indexOf("if (hit) { window.open("), "the chooser is asked before the lone wash opens");
});

test("pins: a conversation row opens its thread beside the map; it reads as a conversation", () => {
  assert.match(SOURCE, /if \(chosen && isConvoChoiceId\(chosen\.dataset\.choose\)\) \{ window\.open\(convoHref\(chosen\.dataset\.choose\.slice\(CONVO_CHOICE_PREFIX\.length\)\), "_blank", "noopener"\); return; \}/);
  assert.match(SOURCE, /<span class="wv-choose-who">a conversation<\/span>/);
  assert.match(SOURCE, /section\("conversations", groups\.conversations\)/);
});
