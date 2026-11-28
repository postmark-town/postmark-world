// creature-say-layout.test.mjs — positionCreatureSays reads no rectangle when no creature is speaking (WLD-227).
//
//   node --test tools/creature-say-layout.test.mjs
//
// Wright, 2026-11-21 14:13Z: "`positionCreatureSays` returns early when no creature is speaking, so it skips the layout reads." It runs with every
// camera write (the frame loop calls it through positionPills), and before this it asked the browser for the bubble host's rectangle every time, even
// with nothing to lay out. The profile of WLD-227 named that read; this fix claims only what it does: with no connected, showing bubble, no host, token
// or resident rectangle is read.
//
// THE FUNCTION IS A CLOSURE inside `mountViewer`, so, as tools/walk-leg.test.mjs does, the branch's REAL function text is cut out of
// spectator/viewer.mjs and executed over invented captures. Rectangle readers THROW if touched, so "read nothing" is checked by running, not by
// reading the source. The base function (86f4336a) is carried below as the oracle: it is the old code, and it is what the same inputs do to it.
//
//   1. no active speech (empty, hidden, disconnected, a mix): the new function touches no reader and writes nothing; the OLD function reads the host rect.
//   2. a showing bubble: placed as before: the style writes, the classes and the avoidance input are byte-identical to the old function on the same
//      inputs: the anchor, the order by when each was shown, the resident avoidance, a token that is gone (its bubble hides itself).
//   3. a retained hidden or disconnected entry beside a showing one does not defeat the early return's absence: the showing one is still laid out.
//
// Invented ids and geometry only.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutReactionBubbles } from "../spectator/viewer.mjs";

const SRC = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const OPEN = "  function positionCreatureSays() {\n";
function closureSource() {
  const start = SRC.indexOf(OPEN);
  assert.ok(start >= 0, "viewer.mjs still has the positionCreatureSays closure");
  assert.equal(SRC.indexOf(OPEN, start + 1), -1, "exactly one positionCreatureSays closure");
  const end = SRC.indexOf("\n  }\n", start);
  assert.ok(end > start, "the closure ends where the cut expects");
  return SRC.slice(start, end + 4);
}
const NEW_SRC = closureSource();

// THE ORACLE: the function as base main 86f4336a had it, verbatim (spectator/viewer.mjs, the closure in mountViewer).
const OLD_SRC = String.raw`  function positionCreatureSays() {
    const host = bubbleHost();
    if (!host) return;
    const b = host.getBoundingClientRect();
    const shown = [];
    for (const [id, say] of creatureSays) {
      if (!say.el?.isConnected || !say.el.classList.contains("show")) continue;
      const g = mapCtx?.creatureLayer?.querySelector('.ov-creature[data-creature="' + CSS.escape(id) + '"]');
      const r = g?.getBoundingClientRect();
      if (!r?.width) { say.el.classList.remove("show"); continue; }
      shown.push({ el: say.el, anchor: { x: r.x + r.width / 2 - b.x, y: r.y - b.y }, w: say.el.offsetWidth, h: say.el.offsetHeight, at: say.shownAt ?? 0 });
    }
    const avoid = [...root.querySelectorAll("[data-handle] > .wv-walker-frame")].map((f) => f.getBoundingClientRect())
      .filter((r) => r.width).map((r) => ({ x: r.x - b.x, y: r.y - b.y, w: r.width, h: r.height }));
    for (const { el, x, y, tailX } of layoutReactionBubbles(shown.sort((p, q) => p.at - q.at), avoid, { width: b.width })) {
      el.style.left = Math.round(x) + "px";
      el.style.top = Math.round(y) + "px";
      el.style.setProperty("--tail-x", Math.round(tailX) + "px");
    }
  }`;

const build = (source, caps) => new Function(
  "c", "const { bubbleHost, creatureSays, mapCtx, root, layoutReactionBubbles, CSS } = c;\n" + source + "\nreturn positionCreatureSays;")(caps);

// ── invented captures ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const rect = (x, y, width, height) => ({ x, y, width, height });
/** a bubble element: connected or not, showing or not; records every write the function makes to it */
function bubble({ connected = true, show = true } = {}) {
  const classes = new Set(show ? ["show"] : []);
  const el = { isConnected: connected, offsetWidth: 160, offsetHeight: 34, writes: [], style: {}, classList: { contains: (c) => classes.has(c), remove: (c) => { el.writes.push(`remove ${c}`); classes.delete(c); } } };
  el.style = { set left(v) { el.writes.push(`left ${v}`); }, set top(v) { el.writes.push(`top ${v}`); }, setProperty: (k, v) => el.writes.push(`${k} ${v}`) };
  el.classes = () => [...classes];
  return el;
}
/** the world around the function. `tripwire` makes every rectangle reader throw (and say it was touched); otherwise they answer from the tables. */
function world({ says = [], tokens = {}, walkers = [], host = rect(100, 50, 1000, 600), tripwire = false } = {}) {
  const reads = [];
  const read = (what, r) => ({ getBoundingClientRect: () => { reads.push(what); if (tripwire) throw new Error(`${what} rectangle was read`); return r; } });
  const creatureSays = new Map(says.map(([id, el, shownAt]) => [id, { el, shownAt }]));
  const layoutCalls = [];
  const caps = {
    bubbleHost: () => read("host", host),
    creatureSays,
    mapCtx: { creatureLayer: { querySelector: (sel) => { reads.push("token lookup"); if (tripwire) throw new Error("a token was looked up"); const id = /data-creature="(.*)"\]$/.exec(sel)[1]; return tokens[id] ? read(`token ${id}`, tokens[id]) : null; } } },
    root: { querySelectorAll: () => { reads.push("walker query"); if (tripwire) throw new Error("the walkers were queried"); return walkers.map((r, i) => read(`walker ${i}`, r)); } },
    layoutReactionBubbles: (bubbles, avoid, opts) => { layoutCalls.push({ order: bubbles.map((b) => b.el), avoid, opts }); return layoutReactionBubbles(bubbles, avoid, opts); },
    CSS: { escape: (s) => s },
  };
  return { caps, reads, layoutCalls };
}
const run = (source, w) => build(source, w.caps)();

// ── 1. no active speech ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const NO_SPEECH = {
  "no entry at all": () => [],
  "retained entries that are hidden (connected, not showing)": () => [["creature:wolf-1", bubble({ show: false })], ["creature:raven-2", bubble({ show: false })]],
  "retained entries that are disconnected (still marked showing, gone from the page)": () => [["creature:wolf-1", bubble({ connected: false })], ["creature:raven-2", bubble({ connected: false })]],
  "a mix of hidden, disconnected and an entry with no element": () => [["creature:a", bubble({ show: false })], ["creature:b", bubble({ connected: false })], ["creature:c", { shownAt: 1 }]],
};
for (const [name, makeSays] of Object.entries(NO_SPEECH)) {
  test(`no active speech, ${name}: no rectangle is read and nothing is written (the old function reads the host's)`, () => {
    // tokens and walkers exist, and every reader throws if asked: only a function that does not look can pass
    const make = () => world({ says: makeSays(), tokens: { "creature:wolf-1": rect(300, 200, 40, 40) }, walkers: [rect(400, 300, 20, 20)], tripwire: true });
    const fixed = make();
    assert.doesNotThrow(() => run(NEW_SRC, fixed), "the branch's function does not touch a rectangle reader");
    assert.deepEqual(fixed.reads, [], "no host, token or resident rectangle was read, and no token or walker was looked up");
    assert.deepEqual(fixed.layoutCalls, [], "and nothing was laid out");
    for (const [, say] of fixed.caps.creatureSays) assert.deepEqual(say.el?.writes ?? [], [], "no style or class write on any entry");
    // the same inputs through the OLD function: it asks for the host's rectangle every time, which is the read this removes
    const old = make();
    assert.throws(() => run(OLD_SRC, old), /host rectangle was read/, "the old function reads the host rectangle even with nothing to lay out");
    assert.equal(old.reads[0], "host");
  });
}

// ── 2. a showing bubble is placed as before ───────────────────────────────────────────────────────────────────────────────────────────────────
const SHOWING = () => {
  const a = bubble(), b = bubble(), gone = bubble(), hidden = bubble({ show: false });
  return {
    els: { a, b, gone, hidden },
    says: [["creature:b", b, 2000], ["creature:a", a, 1000], ["creature:gone", gone, 1500], ["creature:hidden", hidden, 500]],
    tokens: { "creature:a": rect(420, 330, 30, 30), "creature:b": rect(428, 332, 30, 30), "creature:gone": rect(0, 0, 0, 0) },
    walkers: [rect(400, 310, 22, 22), rect(0, 0, 0, 0)],
  };
};
const snapshot = (els) => Object.fromEntries(Object.entries(els).map(([k, e]) => [k, { writes: e.writes, classes: e.classes() }]));

test("a showing bubble is positioned exactly as the old function positioned it: anchor, order by when shown, resident avoidance, a vanished token", () => {
  const inputs = SHOWING(), twin = SHOWING();
  const fixed = world({ says: inputs.says, tokens: inputs.tokens, walkers: inputs.walkers });
  const old = world({ says: twin.says, tokens: twin.tokens, walkers: twin.walkers });
  run(NEW_SRC, fixed); run(OLD_SRC, old);
  assert.deepEqual(snapshot(inputs.els), snapshot(twin.els), "every style write and class change is identical to the old function's, entry by entry");
  assert.deepEqual(fixed.layoutCalls[0].avoid, old.layoutCalls[0].avoid, "the avoidance rectangles handed to the layout are identical");
  assert.deepEqual(fixed.layoutCalls[0].opts, old.layoutCalls[0].opts);
  assert.deepEqual(fixed.layoutCalls[0].order.map((el) => el.writes === inputs.els.a.writes ? "a" : "b"), ["a", "b"], "ordered by when each began to show, the earlier first");
  assert.deepEqual(fixed.reads, old.reads, "and it asks for the same rectangles in the same order as before");
  // not vacuous: the bubbles really were placed, the vanished one hid itself, the hidden one was left alone
  assert.ok(inputs.els.a.writes.some((w) => w.startsWith("left ")) && inputs.els.a.writes.some((w) => w.startsWith("--tail-x ")), "bubble a was placed");
  assert.ok(inputs.els.b.writes.some((w) => w.startsWith("top ")), "bubble b was placed");
  assert.deepEqual(inputs.els.gone.writes, ["remove show"], "a bubble whose token is gone hides itself, as before");
  assert.deepEqual(inputs.els.hidden.writes, [], "a retained hidden entry is untouched");
  assert.equal(fixed.reads.filter((r) => r === "host").length, 1, "the host's rectangle is read once");
});

test("a retained hidden or disconnected entry beside a showing one does not stop the showing one being laid out", () => {
  const live = bubble(), hidden = bubble({ show: false }), cut = bubble({ connected: false });
  const w = world({ says: [["creature:hidden", hidden, 1], ["creature:cut", cut, 2], ["creature:live", live, 3]], tokens: { "creature:live": rect(500, 400, 30, 30) } });
  run(NEW_SRC, w);
  assert.ok(live.writes.some((x) => x.startsWith("left ")), "the speaking creature's bubble is placed");
  assert.deepEqual([hidden.writes, cut.writes], [[], []], "the retained entries are not touched");
  assert.equal(w.reads.includes("host"), true);
});

test("the early return sits before every geometry read in the function (the order, from the executed reads)", () => {
  const idx = (s) => NEW_SRC.indexOf(s);
  assert.ok(idx("if (!speaking) return;") > 0 && idx("if (!speaking) return;") < idx("host.getBoundingClientRect()"), "the guard precedes the host's rectangle");
  assert.ok(idx("if (!speaking) return;") < idx("getBoundingClientRect()", idx("const g = ")), "and the tokens' and residents' rectangles");
});
