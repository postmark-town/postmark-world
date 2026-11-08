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

// Until 2026-11-06 the two pins below asserted the NEW TAB: a lone badge click, and a chosen conversation row, called window.open(convoHref(...)).
// POS-779 (Darko 2026-11-06: "A click opens the conversation in the right-side column, not a new tab") made both select the thread, which opens the column.
test("pins: the wash case. Alone, its thread opens; with anything else, it joins the chooser", () => {
  // every wash holding the point, not only the smallest
  assert.match(click, /const washes = \(\(\) => \{ const wp = worldPointForEvent\(e\); return convosAt\(wp\.x, wp\.y\)\.map\(\(h\) => convoChoiceId\(h\.id\)\); \}\)\(\);/);
  // a resident or creature under the point: the wash is one more entry
  assert.match(click, /if \(here\.all\.length \+ washes\.length > 1\) \{ openChooser\(\[\.\.\.here\.all, \.\.\.washes\]\); return; \}/);
  // marks only, or more than one wash: the chooser, with the washes
  assert.match(click, /if \(washes\.length && \(here\.all\.length \|\| washes\.length > 1\)\) \{ openChooser\(\[\.\.\.here\.all, \.\.\.washes\]\); return; \}/);
  // a wash and nothing else: its thread, directly, in the right-hand column and no new tab
  assert.match(click, /if \(hit\) \{ selectMark\(convoChoiceId\(hit\.id\)\); return; \}/);
  assert.ok(click.indexOf("if (washes.length && (here.all.length") < click.indexOf("if (hit) { selectMark(convoChoiceId"), "the chooser is asked before the lone wash opens");
});

test("pins: a conversation row opens its thread in the column beside the map; it reads as a conversation", () => {
  assert.match(SOURCE, /if \(chosen && isConvoChoiceId\(chosen\.dataset\.choose\)\) \{ selectMark\(chosen\.dataset\.choose\); return; \}/);
  assert.match(SOURCE, /<span class="wv-choose-who">a conversation<\/span>/);
  assert.match(SOURCE, /section\("conversations", groups\.conversations\)/);
});
