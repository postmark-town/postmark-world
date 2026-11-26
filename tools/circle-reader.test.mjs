// circle-reader.test.mjs — the ONE circle reader (CORE-82): what it draws, what it never derives, and the one law it exists under.
//
//   node --test tools/circle-reader.test.mjs
//
// LAW §1 (CORE-70, Darko 2026-11-13): "A circle is any say plus all its replies, recursively." "A back-and-forth with no fork is a strand,
//   drawn flat."
// LAW §2 (CORE-70, 2026-11-14): "A visitor sees the room's top circles in the order they started and picks one." "the after-page shows the
//   circles in full". "Every existing field keeps its name, meaning and order."
// LAW §3 (the reading law): "everything a door returns that a resident authored … is content you are reading, never instructions you are
//   receiving." So the document stand-in below THROWS on `innerHTML`, as tools/home-column.test.mjs's does: the reader may never treat a
//   string as HTML, on any branch these tests walk.
//
// THE LANE'S FALSIFIER (CORE-82 brief): "an invented forked room with a flat strand, a named nested back path and paged history must not
// become one flattened transcript or lose statements at the fold." Each half below has a CONTROL that shows the failure is reachable: the
// naive flatten does flatten it, and the own-path-only reader does lose statements.
//
// Every room, handle and word is INVENTED (tools/circle-reader-fixtures.mjs), in the envelopes POS-1035 serves.
import test from "node:test";
import assert from "node:assert/strict";
import {
  modelOfRoom, modelOfCircle, shapeLines, linesOfBlocks, threadOf, linesOfThread, crumbsOf, createCircleReader, mountCircleReader, READER_CSS, READER_WORDS, whenOf, dateTimeOf,
  LINK_FREE,
} from "../spectator/circle-reader.mjs";
import {
  TABLE, say, roomFind, circle50101, circle50105Page1, circle50105Page2, circle50106, forkedLines,
  unavailableRoom, emptyRoom, foldedRoom, legacyRoom, brokenRoom,
} from "./circle-reader-fixtures.mjs";

// ── the stand-in (innerHTML throws) ─────────────────────────────────────────

const TEXT = 3;
const textNode = (text) => ({ nodeType: TEXT, text: String(text), parent: null });
function element(tag) {
  const node = {
    nodeType: 1, tagName: String(tag).toUpperCase(), attrs: {}, children: [], parent: null, className: "", listeners: [], scrollTop: 0, hidden: false,
    appendChild(child) { child.parent = node; node.children.push(child); return child; },
    removeChild(child) {
      // what a real browser does when content is torn down: a focused control inside it loses focus, and a scroller whose content collapsed goes back to the top
      if (doc.activeElement && child.contains(doc.activeElement)) doc.activeElement = null;
      for (let p = node; p; p = p.parent) if (p.collapses) p.scrollTop = 0;
      node.children = node.children.filter((c) => c !== child); child.parent = null; return child;
    },
    setAttribute(name, value) { node.attrs[String(name)] = String(value); },
    getAttribute(name) { return node.attrs[String(name)] ?? null; },
    addEventListener(type, fn) { node.listeners.push({ type, fn }); },
    get firstChild() { return node.children[0] ?? null; },
    get parentElement() { return node.parent; },
    get parentNode() { return node.parent; },
    contains(other) { for (let n = other; n; n = n.parent) if (n === node) return true; return false; },
    focus(options) { doc.activeElement = node; doc.lastFocusOptions = options; },   // the options are recorded (WLD-248: an identity is refocused without scrolling)
    // just enough of a selector for the column's live update: ".cls" and ".cls tag"
    querySelectorAll(sel) {
      const [a, b] = String(sel).trim().split(/\s+/);
      const cls = (n, c) => String(n.className).split(/\s+/).includes(c.replace(/^\./, ""));
      const out = [];
      walk(node, (n) => { if (n !== node && (b ? n.tagName === b.toUpperCase() && n.parent && ancestorHas(n.parent, a, cls) : cls(n, a))) out.push(n); });
      return out;
    },
    querySelector(sel) { return node.querySelectorAll(sel)[0] ?? null; },
    click() { for (const l of node.listeners.filter((x) => x.type === "click")) l.fn({ target: node }); },
  };
  Object.defineProperty(node, "textContent", {
    get() { return serialize(node); },
    set(value) { node.children = [textNode(value)]; node.children[0].parent = node; },
  });
  Object.defineProperty(node, "innerHTML", {
    get() { throw new Error("innerHTML was read — the reader may never treat a string as HTML"); },
    set() { throw new Error("innerHTML was written — the reader may never treat a string as HTML"); },
  });
  return node;
}
const ancestorHas = (n, selClass, cls) => { for (let p = n; p; p = p.parent) if (p.nodeType === 1 && cls(p, selClass)) return true; return false; };
const doc = { createElement: element, createTextNode: textNode, activeElement: null };
function serialize(node) { return !node ? "" : node.nodeType === TEXT ? node.text : node.children.map(serialize).join(""); }
const walk = (node, fn) => { if (node.nodeType === 1) { fn(node); node.children.forEach((c) => walk(c, fn)); } };
const find = (node, pred) => { const out = []; walk(node, (n) => { if (pred(n)) out.push(n); }); return out; };
const byAttr = (node, name, value) => find(node, (n) => n.attrs[name] !== undefined && (value === undefined || n.attrs[name] === String(value)));
const text = (node) => serialize(node).replace(/\s+/g, " ").trim();
const tick = () => new Promise((ok) => setImmediate(ok));
// WLD-178: every reply thread starts folded behind "View N replies"; a test that wants the whole transcript presses each one it finds (a press redraws in place)
const openAll = (root) => { for (let i = 0; i < 200; i++) { const v = byAttr(root, "data-thread-view")[0]; if (!v) return; v.click(); } throw new Error("openAll never finished"); };
const openAllAsync = async (root) => { for (let i = 0; i < 200; i++) { const v = byAttr(root, "data-thread-view")[0]; if (!v) { await tick(); if (!byAttr(root, "data-thread-view")[0]) return; continue; } v.click(); await tick(); } throw new Error("openAllAsync never finished"); };
const WORDS_OF = (root) => text(root);

/** a reader on a fresh host, with a stub office whose answers a test can change and whose every call is recorded */
function harness({ room = roomFind(), circles = {}, canReply = false, onReply = null, onState = null, hrefForCircle = null } = {}) {
  const host = element("div");
  const scroller = element("div");
  scroller.collapses = true;           // the stand-in's scroller forgets its position when its content is torn down, as a browser's does
  scroller.appendChild(host);
  const calls = [];
  const answers = { room, circles: { ...circles } };
  const source = {
    async room(id) { calls.push(["room", id]); const a = typeof answers.room === "function" ? answers.room() : answers.room; if (a instanceof Error) throw a; return a; },
    async circle(id, after) {
      calls.push(["circle", id, after]);
      const a = answers.circles[`${id}|${after ?? ""}`];
      if (a === undefined) return { error: "bounce", defect: `no circle ${id}` };
      if (a instanceof Error) throw a;
      return typeof a === "function" ? a() : a;
    },
  };
  const reader = createCircleReader({ doc, host, source, roomId: "t20260514-pica", canReply, onReply, onState, hrefForCircle, scroller });
  return { host, scroller, reader, calls, answers, root: reader.root };
}
const idsOf = (blocks) => linesOfBlocks(blocks).map((l) => l.id);

// ── shapeLines: strands flat, forks nested, nothing lost ────────────────────

test("shapeLines: a back-and-forth with no fork is ONE flat strand, however deep `depth` says it is", () => {
  const chain = [say(1, "a", 1, "one", undefined, 1, { depth: 0 }), say(2, "b", 2, "two", 1, 1, { depth: 1 }), say(3, "a", 3, "three", 2, 1, { depth: 2 }), say(4, "b", 4, "four", 3, 1, { depth: 3 })];
  const blocks = shapeLines(chain);
  assert.equal(blocks.length, 1, "one block");
  assert.equal(blocks[0].type, "strand");
  assert.deepEqual(blocks[0].lines.map((l) => l.id), [1, 2, 3, 4]);
});

test("shapeLines: a fork ends the strand and its branches follow, each a strand of its own; every line lands once, in served order", () => {
  const blocks = shapeLines(circle50101().find.circle_read.lines);
  assert.deepEqual(blocks.map((b) => b.type), ["strand", "fork"], "the opener is a strand of one, then its fork");
  assert.deepEqual(blocks[0].lines.map((l) => l.id), [50101]);
  const branches = blocks[1].children;
  assert.deepEqual(branches.map((b) => b.type), ["strand", "strand", "strand"], "three replies to the opener: three branches");
  assert.deepEqual(branches.map((b) => b.lines.map((l) => l.id)), [[50102, 50103, 50104], [50105, 50106, 50110, 50111], [50112, 50113]], "each branch is flat");
  assert.deepEqual(idsOf(blocks), circle50101().find.circle_read.lines.map((l) => l.id), "no line dropped, duplicated or reordered");
});

test("shapeLines: a fork INSIDE a strand nests one fork in another and still places every line once", () => {
  const lines = forkedLines();
  const blocks = shapeLines(lines);
  assert.deepEqual(blocks.map((b) => b.type), ["strand", "fork"]);
  assert.deepEqual(blocks[0].lines.map((l) => l.id), [60001], "the opener forks at once: bo's chain and ed");
  const [bo, ed] = blocks[1].children;
  assert.deepEqual(bo.lines.map((l) => l.id), [60002], "60002 has two replies, so its strand ends there");
  const inner = blocks[1].children[1 - 1];     // bo's strand
  assert.ok(inner, "bo's branch exists");
  assert.deepEqual(blocks[1].children.map((c) => c.type), ["strand", "fork", "strand"], "bo's strand, bo's own fork, then ed's strand");
  const innerFork = blocks[1].children[1];
  assert.deepEqual(innerFork.children.map((c) => c.lines.map((l) => l.id)), [[60003, 60005, 60006], [60004]]);
  assert.deepEqual(blocks[1].children[2].lines.map((l) => l.id), [60007]);
  assert.deepEqual([...idsOf(blocks)].sort(), lines.map((l) => l.id).sort(), "every statement placed exactly once");
  assert.equal(new Set(idsOf(blocks)).size, lines.length);
});

test("shapeLines: a reply whose parent is not in the read is LOOSE, marked, never re-parented; a reply to a context line is not loose", () => {
  const lines = [say(5, "a", 1, "orphan", 4, 1), say(6, "b", 2, "reply to the orphan", 5, 1), say(8, "c", 3, "answers the context", 7, 1)];
  const blocks = shapeLines(lines, { known: [7] });
  assert.equal(blocks[0].loose, true, "its parent 4 is nowhere in this read");
  assert.deepEqual(blocks[0].lines.map((l) => l.id), [5, 6], "the reply that follows it stays with it");
  assert.equal(blocks[1].loose, undefined, "7 is context, so 8 is not loose");
  assert.deepEqual(blocks.map((b) => b.lines?.[0].id), [5, 8]);
});

test("shapeLines: served data that loops (a malformed reply_to) loses nothing and does not hang; lines with no id are one plain timeline", () => {
  const loop = [say(1, "a", 1, "x", 2, 1), say(2, "b", 2, "y", 1, 1)];
  assert.deepEqual([...idsOf(shapeLines(loop))].sort(), [1, 2], "both placed");
  const plain = shapeLines([{ handle: "rei", said: "old words" }, { handle: "claran", said: "older still" }]);
  assert.deepEqual(plain.map((b) => b.type), ["plain"], "old talk is a timeline, never circles");
  assert.equal(plain[0].lines.length, 2);
});

// ── THE LANE'S FALSIFIER, with its controls ─────────────────────────────────

test("LANE FALSIFIER · a forked room with a flat strand, a named nested back path and paged history is not one flattened transcript and loses no statement at the fold", async () => {
  // CONTROL 1: the naive reader — every served line in one list — DOES flatten the fork: it has no structure to show a fork with.
  const served = circle50101().find.circle_read.lines;
  const naive = served.map((l) => ({ type: "strand", lines: [l] }));
  assert.ok(!naive.some((b) => b.type === "fork"), "control: the naive flatten has no fork in it");
  // CONTROL 2: an own-path-only reader (a fold that keeps one branch) DOES lose statements at the fold.
  const ownOnly = served.filter((l) => [50101, 50105, 50106, 50110, 50111].includes(l.id));
  assert.ok(ownOnly.length < served.length, "control: keeping one branch drops statements");

  // THE READER, on the real code path: the room, then the circle whole, with every thread opened (the reader starts folded: WLD-178).
  const h = harness({ circles: { "50101|": circle50101() } });
  await h.reader.showRoom(); await tick();
  byAttr(h.root, "data-circle-open", 50101)[0].click(); await tick();
  assert.equal(h.root.getAttribute("data-state"), "circle");
  assert.equal(byAttr(h.root, "data-say").length, 1, "the circle opens on its first statement: every reply starts folded");
  openAll(h.root);
  const drawn = byAttr(h.root, "data-say").map((n) => Number(n.attrs["data-say"]));
  assert.deepEqual([...drawn].sort(), served.map((l) => l.id).sort(), "NO statement lost at the fold: every served say is reachable on screen, once");
  assert.equal(byAttr(h.root, "data-strand").length + byAttr(h.root, "data-fork").length, 0, "and nothing is drawn as a strand or a fork any more");
  // ancestry is kept: each reply sits inside the thread of the statement it answers
  const under = (id) => byAttr(byAttr(h.root, "data-say", id)[0], "data-say").map((n) => Number(n.attrs["data-say"])).filter((x) => x !== id);
  assert.deepEqual(under(50102).sort(), [50103, 50104], "50102's replies are under it");
  assert.deepEqual(under(50105).sort(), [50106, 50110, 50111], "a deeper reply stays under the chain it answers");

  // PAGED HISTORY on a NESTED circle: page 1, then the served `next`, a named back path through the ancestors, nothing re-fetched by guess.
  const p = harness({ circles: { "50105|": circle50105Page1(), "50105|50106": circle50105Page2(), "50106|": circle50106() } });
  await p.reader.showCircle(50105); await tick();
  openAll(p.root);
  assert.deepEqual(byAttr(p.root, "data-say").map((n) => Number(n.attrs["data-say"])), [50105, 50106], "page one");
  assert.ok(byAttr(p.root, "data-notice", "paged").length, "it says there is more");
  byAttr(p.root, "data-next")[0].click(); await tick();
  openAll(p.root);
  assert.deepEqual(p.calls.filter((c) => c[0] === "circle"), [["circle", 50105, undefined], ["circle", 50105, 50106]], "the continuation is the served `next`, and nothing else");
  assert.deepEqual(byAttr(p.root, "data-say").map((n) => Number(n.attrs["data-say"])).sort(), [50105, 50106, 50110, 50111], "page two appended, nothing lost");
  assert.equal(byAttr(p.root, "data-next").length, 0, "no next on the last page");
  assert.equal(byAttr(p.root, "data-notice", "complete").length, 0, "a whole thread says nothing about being whole (WLD-178: no completeness badge)");
  const n = harness({ circles: { "50106|": circle50106() } });
  await n.reader.showCircle(50106); await tick();
  const crumbs = byAttr(n.root, "data-crumbs")[0];
  assert.match(text(crumbs), /Back to the room.*Cave Interior.*pica's statement.*claran's statement.*amia's statement/, "a NAMED back path, root first, through the nested conversation");
  assert.equal(byAttr(crumbs, "data-crumb").length, 3);
  assert.equal(byAttr(crumbs, "aria-current").length, 1, "the circle you are in is the current crumb");
  assert.equal(byAttr(crumbs, "data-crumb").filter((c) => c.tagName === "BUTTON").length, 2, "the two ancestors are buttons that go there");
});

// ── the room (spectator) ────────────────────────────────────────────────────

test("room view: the room's top statements come in the order served (start order), each with its reply count; there is no invented 'yours', ranking or topic", async () => {
  const h = harness();
  await h.reader.showRoom();
  assert.equal(h.root.getAttribute("data-state"), "room");
  const stubs = byAttr(h.root, "data-circle-stub");
  assert.deepEqual(stubs.map((b) => Number(b.attrs["data-circle"])), [50101, 50107, 50114], "served order, not re-ranked");
  assert.match(text(stubs[0]), /pica .*Welcome, everyone! Sorbet's on the counter…/);
  assert.match(text(stubs[0]), /View 9 replies/, "the count is the stub's served says, less the statement itself");
  assert.match(text(stubs[1]), /View 2 replies/);
  assert.doesNotMatch(text(stubs[2]), /repl/, "a statement nobody answered has no reply control at all");
  assert.equal(byAttr(stubs[2], "data-thread").length, 0);
  assert.doesNotMatch(text(h.root), /your circle|yours/i, "a visitor has none");
  assert.ok(find(h.root, (n) => n.tagName === "BUTTON").every((b) => b.attrs.type === "button"));
  // opening a statement's replies reads that conversation by the stub's OWN served `read`, once, and keeps it
  h.answers.circles["50107|"] = { find: { ...circle50101().find, circle: 50107, circle_read: { ...circle50101().find.circle_read, circle: 50107, path: [50107], lines: TABLE.slice(6, 9).map((l) => ({ ...l, depth: 0 })), says: 3, people: 2 } } };
  byAttr(stubs[1], "data-thread-view")[0].click(); await tick();
  assert.deepEqual(h.calls.at(-1), ["circle", 50107, undefined]);
  assert.equal(h.reader.getState().view, "room", "the room stays: replies open inside it");
  assert.deepEqual(byAttr(byAttr(h.root, "data-circle", "50107")[0], "data-say").map((n) => Number(n.attrs["data-say"])).filter((x) => x !== 50107), [50108], "the reply is drawn under its statement");
});

test("back to the room: the Back button returns to the room view and the statements", async () => {
  const h = harness({ circles: { "50101|": circle50101() } });
  await h.reader.showRoom();
  byAttr(h.root, "data-circle-open", 50101)[0].click(); await tick();
  assert.equal(h.reader.getState().view, "circle");
  byAttr(h.root, "data-back")[0].click(); await tick();
  assert.equal(h.root.getAttribute("data-state"), "room");
  assert.equal(byAttr(h.root, "data-circle-stub").length, 3);
});

test("context lines in a conversation are labelled as context, drawn apart from its own lines, and carry no Reply", async () => {
  const h = harness({ circles: { "50105|": circle50105Page1() }, canReply: true });
  await h.reader.showCircle(50105);
  const ctx = byAttr(h.root, "data-context")[0];
  assert.ok(ctx, "context is drawn");
  assert.match(text(ctx), /Earlier in this conversation/);
  assert.equal(byAttr(ctx, "data-reply").length, 0, "you do not reply to the context block from here");
  assert.ok(!byAttr(byAttr(h.root, "data-thread-list")[0], "data-say", 50101).length, "the context say is not among the conversation's own statements");
});

// ── WLD-178: the comment thread ─────────────────────────────────────────────

test("threadOf: replies sit under the statement they answer, in served order, with a total per statement; a loop or a missing parent loses nothing", () => {
  const t = threadOf(circle50101().find.circle_read.lines);
  assert.equal(t.roots.length, 1);
  const top = t.roots[0];
  assert.equal(top.line.id, 50101);
  assert.deepEqual(top.replies.map((r) => r.line.id), [50102, 50105, 50112], "the three replies, in served order");
  assert.deepEqual(top.replies.map((r) => r.total), [2, 3, 1], "each counts everything under it, however deep");
  assert.equal(top.total, 9);
  assert.deepEqual(linesOfThread(t.roots).map((l) => l.id).sort(), circle50101().find.circle_read.lines.map((l) => l.id).sort(), "every served line is in exactly one node");
  // a reply whose parent is not in the read is loose and never re-parented; one to a context line is not
  assert.equal(threadOf([say(8, "a", 1, "x", 7, 7)]).roots[0].loose, true);
  assert.equal(threadOf([say(8, "a", 1, "x", 7, 7)], { known: [7] }).roots[0].loose, undefined);
  // a loop in served data neither hangs nor drops
  const loop = threadOf([say(1, "a", 1, "x", 2, 1), say(2, "b", 2, "y", 1, 1)]);
  assert.deepEqual(linesOfThread(loop.roots).map((l) => l.id).sort(), [1, 2]);
  // lines with no id are a timeline, never a thread
  const old = threadOf([{ handle: "rei", said: "old words" }]);
  assert.deepEqual([old.roots.length, old.plain.length], [0, 1]);
});

const openCircle = async (opts = {}) => {
  const h = harness({ circles: { "50101|": circle50101() }, ...opts });
  await h.reader.showCircle(50101); await tick();
  return h;
};
const threadOfSay = (root, id) => byAttr(byAttr(root, "data-say", id)[0], "data-thread")[0];

test("WLD-178 · replies START FOLDED behind 'View N replies'; opening one opens only that statement's replies, deeper ones stay folded until opened", async () => {
  const h = await openCircle();
  assert.deepEqual(byAttr(h.root, "data-say").map((n) => Number(n.attrs["data-say"])), [50101], "only the top statement on screen");
  const first = byAttr(h.root, "data-thread-view")[0];
  assert.equal(text(first), "View 9 replies", "the count is what was served: nine statements sit under the opener");
  assert.equal(first.attrs["aria-expanded"], "false");
  first.click();
  assert.deepEqual(byAttr(h.root, "data-say").map((n) => Number(n.attrs["data-say"])), [50101, 50102, 50105, 50112], "its three replies, and no deeper");
  assert.equal(text(byAttr(byAttr(h.root, "data-say", 50102)[0], "data-thread-view")[0]), "View 2 replies", "each reply with replies has its own folded count");
  assert.equal(text(byAttr(byAttr(h.root, "data-say", 50105)[0], "data-thread-view")[0]), "View 3 replies");
  assert.equal(byAttr(byAttr(h.root, "data-say", 50112)[0], "data-thread-view").length, 1);
  byAttr(byAttr(h.root, "data-say", 50105)[0], "data-thread-view")[0].click();
  assert.deepEqual(byAttr(h.root, "data-say").map((n) => Number(n.attrs["data-say"])), [50101, 50102, 50105, 50106, 50112], "only that branch opened one level");
  assert.equal(byAttr(h.root, "data-say", 50110).length, 0, "the next level is still folded");
});

test("WLD-178 · every statement with replies has a circle AND a line on its thread; either folds and opens the same whole subtree; the circle is the line's midpoint control", async () => {
  const h = await openCircle();
  const thread = () => threadOfSay(h.root, 50101);
  // folded: the line, the circle and the 'View' text are all named controls on the same thread, all folded
  assert.equal(thread().attrs["data-open"], "false");
  for (const sel of ["data-thread-line", "data-thread-dot", "data-thread-view"]) {
    const c = byAttr(thread(), sel)[0];
    assert.ok(c, sel + " is there");
    assert.equal(c.tagName, "BUTTON", "a real button: keyboard activation (Enter, Space) is the browser's");
    assert.equal(c.attrs["aria-expanded"], "false");
    assert.equal(c.attrs["aria-label"], "View 9 replies", "named");
    assert.ok(c.attrs["aria-controls"], "and it says what it controls");
  }
  byAttr(thread(), "data-thread-dot")[0].click();                              // the CIRCLE opens it
  assert.equal(thread().attrs["data-open"], "true");
  assert.equal(byAttr(h.root, "data-say").length, 4);
  assert.equal(thread().children.filter((c) => c.attrs["data-thread-view"] !== undefined).length, 0, "the 'View' text is gone once open");
  assert.equal(byAttr(thread(), "data-thread-dot")[0].attrs["aria-label"], "Hide 9 replies");
  // the circle is a CHILD OF THE THREAD (so it centres on the thread's own height), never of the first statement
  const dot = byAttr(thread(), "data-thread-dot")[0];
  assert.equal(dot.parent, thread(), "the circle sits on the thread, whose height is the whole subtree's");
  assert.equal(byAttr(byAttr(h.root, "data-say", 50101)[0], "data-thread-dot")[0], dot, "one circle for this statement");
  byAttr(thread(), "data-thread-line")[0].click();                             // the LINE folds the same subtree
  assert.equal(thread().attrs["data-open"], "false");
  assert.deepEqual(byAttr(h.root, "data-say").map((n) => Number(n.attrs["data-say"])), [50101]);
  byAttr(thread(), "data-thread-line")[0].click();                             // and opens it again
  assert.equal(byAttr(h.root, "data-say").length, 4);
  // a statement with no replies has no circle, no line, no 'View'
  assert.equal(byAttr(byAttr(h.root, "data-say", 50112)[0], "data-thread-dot").length, 1, "50112 has one reply, so it has one");
  openAll(h.root);
  assert.equal(byAttr(byAttr(h.root, "data-say", 50104)[0], "data-thread").length, 0, "a leaf has none");
});

test("WLD-178 · the circle is at the thread's VERTICAL MIDPOINT: the stylesheet centres it at 50% of the thread, the line is split around it, and it is not tied to the first statement", () => {
  assert.match(READER_CSS, /\.cr-thread > \.cr-dot \{[^}]*\btop: 50%;[^}]*translate\(-50%, -50%\)/, "centred on the thread's own height");
  assert.match(READER_CSS, /\.cr-thread \{[^}]*position: relative/, "the thread is the circle's positioning box");
  assert.match(READER_CSS, /calc\(50% - \.75em\)[^;]*calc\(50% \+ \.75em\)/, "the line leaves the circle its room");
  assert.doesNotMatch(READER_CSS, /\.cr-dot \{[^}]*\btop: (0|auto|\.\d+em)\b/, "never pinned beside the first statement");
});

test("WLD-178 · nothing of the machinery is drawn as text: no id, act number, 'strand', 'branch', 'circle', fork, complete or folded badge in the room, a conversation or an opened thread", async () => {
  const c107 = { find: { ...circle50101().find, circle: 50107, circle_read: { ...circle50101().find.circle_read, circle: 50107, path: [50107], lines: TABLE.slice(6, 9).map((l) => ({ ...l, depth: 0 })), says: 3, people: 2 } } };
  const h = harness({ circles: { "50101|": circle50101(), "50107|": c107, "50105|": circle50105Page1(), "50106|": circle50106() } });
  await h.reader.showRoom(); await tick();
  const seen = [text(h.root)];
  await openAllAsync(h.root);
  seen.push(text(h.root));
  const n = harness({ circles: { "50106|": circle50106() }, canReply: true });
  await n.reader.showCircle(50106); await tick();
  openAll(n.root);
  seen.push(text(n.root));
  const p = harness({ circles: { "50105|": circle50105Page1() }, hrefForCircle: (c) => `/conversations/#circle-${c}` });
  await p.reader.showCircle(50105); await tick();
  seen.push(text(p.root));
  for (const t of seen) {
    assert.doesNotMatch(t, /(?<![\d:-])5\d{4}(?![\d:Z-])/, "no say or circle id is on screen: " + (t.match(/.{0,30}(?<![\d:-])5\d{4}(?![\d:Z-]).{0,30}/)?.[0] ?? ""));
    assert.doesNotMatch(t, /strand|branch|fork|\bcircle\b|circles|depth|reply_to|say \d/i, "no jargon: " + t.slice(0, 120));
    assert.doesNotMatch(t, /whole circle|folded|complete|unavailable/i, "and no state badge");
  }
  // internal ids stay FUNCTIONAL: they ride as data-*, never as words
  assert.ok(byAttr(h.root, "data-say", 50101).length, "data-say still carries the id");
});

test("WLD-178 · a failed or partial read is still SAID, in plain words, with the served statements kept: hiding the machinery never turns a failure into silence", async () => {
  // the opener's replies cannot be read: the statement stays, the words say so, Try again reads again
  let up = false;
  const h = harness({ circles: { "50101|": () => { if (!up) throw new Error("503"); return circle50101(); } } });
  await h.reader.showRoom(); await tick();
  byAttr(byAttr(h.root, "data-circle", 50101)[0], "data-thread-view")[0].click(); await tick(); await tick();
  assert.match(text(byAttr(h.root, "data-circle", 50101)[0]), /Welcome, everyone!/, "the served statement stays");
  assert.match(text(byAttr(h.root, "data-circle", 50101)[0]), /These replies couldn't be loaded/, "and the words say so");
  assert.equal(byAttr(h.root, "data-notice", "unavailable").length, 1);
  up = true;
  byAttr(h.root, "data-retry-replies")[0].click(); await tick(); await tick();
  assert.equal(byAttr(h.root, "data-notice", "unavailable").length, 0);
  assert.deepEqual(byAttr(byAttr(h.root, "data-circle", 50101)[0], "data-say").map((n) => Number(n.attrs["data-say"])).slice(0, 4), [50101, 50102, 50105, 50112], "the retry opened them");
  // an unavailable history with lines: they stay, the thread says older replies could not load, and it never invents an ending
  const partial = harness({ circles: { "50101|": circle50101({ history: "unavailable" }) } });
  await partial.reader.showCircle(50101); await tick();
  openAll(partial.root);
  assert.equal(byAttr(partial.root, "data-say").length, 10);
  assert.match(text(partial.root), /Some older replies couldn't be loaded, so this may not be everything/);
});

test("WLD-178 · ROOM view: an opened top statement over an unavailable, folded or incomplete read says so; an empty unavailable read is a failure with Try again, never silence", async () => {
  const open = async (answer) => {
    const h = harness({ circles: { "50101|": answer } });
    await h.reader.showRoom(); await tick();
    byAttr(byAttr(h.root, "data-circle", 50101)[0], "data-thread-view")[0].click(); await tick(); await tick();
    return { h, stub: byAttr(h.root, "data-circle", 50101)[0] };
  };
  // control: a complete read draws no notice
  let r = await open(circle50101());
  assert.equal(byAttr(r.stub, "data-notice").length, 0, "a complete read says nothing");
  // unavailable WITH lines: they stay and the thread says older replies could not load
  r = await open(circle50101({ history: "unavailable" }));
  assert.ok(byAttr(r.stub, "data-say").length > 1, "served replies stay");
  assert.match(text(r.stub), /Some older replies couldn't be loaded, so this may not be everything/);
  // unavailable with NO lines: not an empty thread; the failure sentence and Try again
  const none = circle50101({ history: "unavailable" }); none.find.circle_read.lines = [];
  r = await open(none);
  assert.match(text(r.stub), /These replies couldn't be loaded/);
  assert.equal(byAttr(r.stub, "data-retry-replies").length, 1, "and it can be tried again");
  // folded history: the plain folded sentence
  r = await open(circle50101({ history: "folded" }));
  assert.equal(byAttr(r.stub, "data-notice", "folded").length, 1);
  assert.match(text(r.stub), /isn't shown here/);
  // an incomplete read with nothing further to page: it may not be everything
  const few = circle50101(); few.find.circle_read.lines = few.find.circle_read.lines.slice(0, 4); few.find.circle_read.complete = false;
  r = await open(few);
  assert.match(text(r.stub), /may not be everything/);
  assert.doesNotMatch(text(r.stub), /unavailable|folded|complete|strand|branch/i, "plain words only");
});

test("WLD-178 · ROOM view Show more: a refused or unavailable-empty continuation keeps the served replies AND the exact cursor, says so, and the same page can be tried again; recovery loses and doubles nothing", async () => {
  const page1 = () => { const a = circle50101(); a.find.circle_read.lines = a.find.circle_read.lines.slice(0, 5); a.find.circle_read.complete = false; a.find.circle_read.next = { circle: 50101, after: 50105 }; return a; };
  const page2 = () => { const a = circle50101(); a.find.circle_read.lines = a.find.circle_read.lines.slice(5); a.find.circle_read.next = null; return a; };
  const emptyUnavailable = (complete) => () => { const a = circle50101({ history: "unavailable" }); a.find.circle_read.lines = []; a.find.circle_read.next = null; a.find.circle_read.complete = complete; return a; };
  for (const [name, bad] of [["refused", () => ({ error: "boom" })], ["unavailable empty", emptyUnavailable(false)], ["unavailable empty complete:true", emptyUnavailable(true)]]) {
    let second = bad;
    const h = harness({ circles: { "50101|": page1, "50101|50105": () => second() } });
    await h.reader.showRoom(); await tick();
    const stub = () => byAttr(h.root, "data-circle", 50101)[0];
    byAttr(stub(), "data-thread-view")[0].click(); await tick(); await tick();
    const before = byAttr(stub(), "data-say").map((n) => n.attrs["data-say"]);
    assert.ok(before.length > 1 && byAttr(stub(), "data-next").length === 1, `${name}: first page and its More`);
    byAttr(stub(), "data-next")[0].click(); await tick(); await tick();
    assert.deepEqual(byAttr(stub(), "data-say").map((n) => n.attrs["data-say"]), before, `${name}: the served replies stay visible`);
    assert.match(text(stub()), /Some older replies couldn't be loaded/, `${name}: said plainly`);
    assert.equal(byAttr(stub(), "data-next").length, 1, `${name}: the cursor survives, so the same page can be tried again`);
    const asked = h.calls.filter((c) => c[0] === "circle").map((c) => `${c[1]}|${c[2] ?? ""}`);
    assert.equal(asked.filter((x) => x === "50101|").length, 1, `${name}: page 1 was not read again`);
    second = page2;
    byAttr(stub(), "data-next")[0].click(); await tick(); await tick();
    const after = byAttr(stub(), "data-say").map((n) => n.attrs["data-say"]);
    assert.equal(new Set(after).size, after.length, `${name}: no duplicates on recovery`);
    assert.ok(after.length > before.length && before.every((x) => after.includes(x)), `${name}: nothing lost, the rest arrived`);
    assert.equal(byAttr(stub(), "data-next").length, 0);
    assert.doesNotMatch(text(stub()), /couldn't be loaded/, `${name}: the sentence goes once it loads`);
  }
});

test("WLD-178 · the thread line and circle are drawn in the reader's own foreground, never the host's faint --cr-rule/--line (the World column's border colour)", async () => {
  const strokes = READER_CSS.split("\n").filter((l) => /\.cr-thread > \.cr-(line::before|dot) \{|currentColor 0, currentColor/.test(l)).join("\n");
  assert.ok(strokes.includes("currentColor"), "the stroke follows the text colour");
  assert.doesNotMatch(strokes, /--cr-rule|--line/, "not the host's border colour");
  assert.match(READER_CSS, /\.cr-line::before \{[^}]*opacity: \.[5-9]/, "line is not dimmed below .5");
  assert.match(READER_CSS, /\.cr-dot \{[^}]*opacity: \.[7-9]/, "circle is not dimmed below .7");
  const col = (await import("node:fs")).readFileSync(new URL("../spectator/home-column.mjs", import.meta.url), "utf8");
  assert.match(col, /\.wv-homecol-reader \{[^}]*color:var\(--paper\)/, "the column's text colour is the foreground the stroke follows");
});

test("WLD-178 · opened threads, scroll and focus survive a refresh; new says are offered, never pulled in, and stale answers stay discarded", async () => {
  const c = circle50101();
  const h = harness({ circles: { "50101|": c }, canReply: true });
  await h.reader.showRoom(); await tick();
  byAttr(byAttr(h.root, "data-circle", 50101)[0], "data-thread-view")[0].click(); await tick(); await tick();
  byAttr(byAttr(h.root, "data-say", 50105)[0], "data-thread-view")[0].click();       // a deeper branch, opened too
  const opened = byAttr(h.root, "data-say").map((n) => Number(n.attrs["data-say"]));
  assert.ok(opened.includes(50106));
  h.scroller.scrollTop = 310;
  const dot = byAttr(threadOfSay(h.root, 50105), "data-thread-dot")[0];
  dot.focus();
  assert.equal(doc.activeElement.attrs["data-key"], "dot-t-50105");
  await h.reader.refresh(); await tick(); await tick();
  assert.deepEqual(byAttr(h.root, "data-say").map((n) => Number(n.attrs["data-say"])), opened, "every branch the visitor opened is still open");
  assert.equal(h.scroller.scrollTop, 310, "scroll kept");
  assert.equal(doc.activeElement?.attrs["data-key"], "dot-t-50105", "focus kept on the same control");
  // a new reply arrives in the office: offered, not drawn
  const later = JSON.parse(JSON.stringify(c));
  later.find.circle_read.lines.push({ ...say(50115, "seth", 15, "One more thing!", 50113, 50101), depth: 3 });
  h.answers.circles["50101|"] = later;
  await h.reader.refresh(); await tick(); await tick();
  assert.equal(byAttr(h.root, "data-say", 50115).length, 0, "the new reply is not drawn unasked");
  assert.match(text(byAttr(h.root, "data-new")[0]), /^1 new — show$/);
  assert.equal(h.scroller.scrollTop, 310, "no unsolicited jump");
  byAttr(h.root, "data-new")[0].click();
  assert.equal(byAttr(h.root, "data-say", 50115).length, 0, "it sits under 50113, which is still folded: opened state is the visitor's, not the office's");
  assert.deepEqual(byAttr(h.root, "data-say").map((n) => Number(n.attrs["data-say"])), opened, "and the open branches are as they were");
  // a late inline read after Back is dropped
  const g = gate();
  const late = harness({ circles: { "50107|": () => g.wait.then(() => ({ find: { ...circle50101().find, circle: 50107, circle_read: { ...circle50101().find.circle_read, circle: 50107, path: [50107], lines: TABLE.slice(6, 9).map((l) => ({ ...l, depth: 0 })) } } })) } });
  await late.reader.showRoom(); await tick();
  byAttr(byAttr(late.root, "data-circle", 50107)[0], "data-thread-view")[0].click();
  late.reader.showCircle(50101).catch(() => {});                                     // the visitor goes elsewhere while it is in flight
  await tick();
  g.release(); await tick(); await tick();
  assert.equal(late.reader.getState().view, "circle", "the late room answer was not drawn over the circle");
});

// ── three different sentences: unavailable, empty, folded ───────────────────

test("an unavailable history, a read that failed, a known-empty room and a folded one are four different sentences, and unavailable is never drawn as empty", async () => {
  const sentences = {};
  for (const [name, answer] of Object.entries({ unavailableHistory: unavailableRoom(), empty: emptyRoom(), folded: foldedRoom(), failed: new Error("the office did not answer") })) {
    const h = harness({ room: answer });
    await h.reader.showRoom(); await tick();
    sentences[name] = { state: h.root.getAttribute("data-state"), kinds: byAttr(h.root, "data-notice").map((n) => n.attrs["data-notice"]), retry: byAttr(h.root, "data-retry").length, text: text(h.root) };
  }
  assert.deepEqual(sentences.unavailableHistory.kinds, ["unavailable"]); assert.equal(sentences.unavailableHistory.state, "unavailable"); assert.equal(sentences.unavailableHistory.retry, 1);
  assert.deepEqual(sentences.failed.kinds, ["unavailable"]); assert.equal(sentences.failed.state, "unavailable"); assert.equal(sentences.failed.retry, 1);
  assert.deepEqual(sentences.empty.kinds, ["none"]); assert.equal(sentences.empty.retry, 0); assert.equal(sentences.empty.state, "room");
  assert.ok(sentences.folded.kinds.includes("folded")); assert.equal(sentences.folded.state, "room");
  assert.match(sentences.empty.text, /Nobody has spoken here yet/);
  assert.doesNotMatch(sentences.unavailableHistory.text, /Nobody has spoken here yet/, "unavailable is not 'nobody spoke'");
  assert.match(sentences.unavailableHistory.text, /couldn't read this/);
  assert.match(sentences.folded.text, /More conversations in this room:.*Another conversation.*Another conversation/, "the served continuations are offered as buttons, not guessed, and without their ids");
  assert.doesNotMatch(sentences.folded.text, /50120|50121/, "an id is never words");
});

test("Try again after an unavailable read reads again; a 422 refusal from the office is shown with its own defect", async () => {
  let up = false;
  const h = harness({ room: () => { if (!up) throw new Error("503"); return roomFind(); } });
  await h.reader.showRoom();
  assert.equal(h.root.getAttribute("data-state"), "unavailable");
  up = true;
  byAttr(h.root, "data-retry")[0].click(); await tick(); await tick();
  assert.equal(h.root.getAttribute("data-state"), "room", "the retry recovered");
  // a refused circle read: the office's own words are on screen
  h.answers.circles["99999|"] = { error: "bounce", code: 422, defect: "say 99999 is not in circle 50101" };
  await h.reader.showCircle(99999); await tick();
  assert.equal(h.root.getAttribute("data-state"), "unavailable");
  assert.match(text(h.root), /say 99999 is not in circle 50101/, "the refusal, verbatim");
});

test("old talk (no ids) is a plain timeline: no statements with threads, no circle pretended", async () => {
  const h = harness({ room: legacyRoom() });
  await h.reader.showRoom();
  assert.equal(byAttr(h.root, "data-circle-stub").length, 0);
  assert.equal(byAttr(h.root, "data-thread").length, 0, "a timeline has no thread controls");
  assert.equal(byAttr(h.root, "data-timeline").length, 1, "one plain list");
  assert.equal(byAttr(h.root, "data-say-plain").length, 2);
  assert.equal(byAttr(h.root, "data-say").length, 0, "no say carries an id it was not given");
  assert.match(text(h.root), /Claran, hello.*hi rei/);
});

test("a reply whose parent the read does not hold is named, with the producer's own note, not drawn as a circle of its own", async () => {
  const h = harness({ room: brokenRoom() });
  await h.reader.showRoom();
  const broken = byAttr(h.root, "data-notice", "broken");
  assert.equal(broken.length, 1);
  assert.match(text(broken[0]), /A reply to a statement that isn't shown: claran\..*this say replies to one this read does not hold/);
  assert.doesNotMatch(text(broken[0]), /50110/, "its id is not words");
  assert.equal(byAttr(h.root, "data-circle-stub").length, 3, "and it did not mint a stub");
});

// ── content is text ─────────────────────────────────────────────────────────

test("what residents said is TEXT: markup in a say, a handle and a stub makes no element, and innerHTML is never touched", async () => {
  const HOSTILE = `<img src=x onerror="window.__pwned=1"> <b>bold?</b> [click](javascript:alert(1))`;
  const room = roomFind();
  room.find.circles.elsewhere[0].opener = HOSTILE;
  room.find.circles.elsewhere[0].handle = `<i>pica</i>`;
  const circle = circle50101();
  circle.find.circle_read.lines[1] = { ...circle.find.circle_read.lines[1], said: HOSTILE, handle: "<script>x</script>" };
  const h = harness({ room, circles: { "50101|": circle }, canReply: true });
  await h.reader.showRoom();
  assert.match(text(byAttr(h.root, "data-circle-stub")[0]), /<i>pica<\/i> .*<img src=x/, "the stub's words, literally");
  byAttr(h.root, "data-circle-open", 50101)[0].click(); await tick();
  openAll(h.root);
  assert.ok(text(h.root).includes(HOSTILE), "the say, literally");
  assert.equal(find(h.root, (n) => ["IMG", "B", "I", "SCRIPT", "A"].includes(n.tagName)).filter((n) => n.tagName !== "A").length, 0, "no element was made from a resident's words");
  assert.equal(find(h.root, (n) => n.tagName === "A").length, 0, "and no link either");
});

// ── reply ───────────────────────────────────────────────────────────────────

test("Reply: with canReply each line that has an id carries one, and pressing it hands the host the target; without canReply there is none", async () => {
  const got = [];
  const h = harness({ circles: { "50101|": circle50101() }, canReply: true, onReply: (t) => got.push(t) });
  await h.reader.showCircle(50101); await tick();
  assert.equal(byAttr(h.root, "data-reply").length, 1, "folded: the one statement on screen carries one");
  openAll(h.root);
  const buttons = byAttr(h.root, "data-reply");
  assert.equal(buttons.length, 10, "one per say");
  byAttr(h.root, "data-reply", 50106)[0].click();
  assert.deepEqual(got, [{ id: 50106, handle: "amia", said: "Iris did, I think.", at_ms: TABLE[5].at_ms, circle: 50101 }]);
  const quiet = harness({ circles: { "50101|": circle50101() }, canReply: false });
  await quiet.reader.showCircle(50101); await tick();
  assert.equal(byAttr(quiet.root, "data-reply").length, 0);
  // legacy lines have no id, so no reply button even where replying is on
  const old = harness({ room: legacyRoom(), canReply: true });
  await old.reader.showRoom();
  assert.equal(byAttr(old.root, "data-reply").length, 0, "a say with no id cannot be replied to");
});

// ── refresh: keep the reader where they were ────────────────────────────────

test("refresh keeps the scroll position and the focused control, and new says are OFFERED ('N new — show'), never pulled in", async () => {
  const c = circle50101();
  const h = harness({ circles: { "50101|": c }, canReply: true });
  await h.reader.showCircle(50101); await tick();
  openAll(h.root);
  h.scroller.scrollTop = 240;
  const reply = byAttr(h.root, "data-reply", 50104)[0];
  reply.focus();
  assert.equal(doc.activeElement, reply);
  // the same data again: nothing moves
  await h.reader.refresh(); await tick();
  assert.equal(h.scroller.scrollTop, 240, "scroll position kept");
  assert.equal(doc.activeElement?.attrs["data-key"], "reply-50104", "focus kept on the same control, by its key");
  assert.equal(byAttr(h.root, "data-new").length, 0, "nothing new, nothing offered");
  // a new say arrives in the office
  const later = JSON.parse(JSON.stringify(c));
  later.find.circle_read.lines.push({ ...say(50115, "seth", 15, "One more thing!", 50113, 50101), depth: 3 });
  later.find.circle_read.says = 11;
  h.answers.circles["50101|"] = later;
  const before = byAttr(h.root, "data-say").length;
  await h.reader.refresh(); await tick();
  assert.equal(byAttr(h.root, "data-say").length, before, "the new say is NOT drawn unasked");
  assert.equal(h.scroller.scrollTop, 240, "no unsolicited jump");
  assert.equal(doc.activeElement?.attrs["data-key"], "reply-50104", "focus did not move");
  const offer = byAttr(h.root, "data-new")[0];
  assert.ok(offer, "the reader offers it");
  assert.match(text(offer), /^1 new — show$/);
  offer.click();
  openAll(h.root);                                   // the new reply sits under a statement the visitor had not opened
  assert.equal(byAttr(h.root, "data-say").length, before + 1, "asked for, it is drawn");
  assert.ok(byAttr(h.root, "data-say", 50115).length);
  assert.equal(h.scroller.scrollTop, 240, "and still the reader's place");
  assert.equal(byAttr(h.root, "data-new").length, 0);
});

test("refresh of a room: a failed background read leaves the last good view standing; a new top circle is offered, not inserted", async () => {
  const h = harness();
  await h.reader.showRoom();
  h.answers.room = () => { throw new Error("offline"); };
  await h.reader.refresh(); await tick();
  assert.equal(h.root.getAttribute("data-state"), "room", "the last good view stands");
  assert.equal(byAttr(h.root, "data-circle-stub").length, 3);
  const grown = roomFind();
  grown.find.circles.elsewhere.push({ circle: 50120, handle: "ada", opener: "A new circle", says: 1, people: 1, started: grown.find.room.latest, latest: grown.find.room.latest, read: { circle: 50120 } });
  h.answers.room = grown;
  await h.reader.refresh(); await tick();
  assert.equal(byAttr(h.root, "data-circle-stub").length, 3, "not inserted unasked");
  byAttr(h.root, "data-new")[0].click();
  assert.equal(byAttr(h.root, "data-circle-stub").length, 4);
});

// ── a signed-in default, rendered by the same module ────────────────────────

test("a signed-in default (own path, folded stubs, elsewhere, paged own path) renders with the served disclosure and continuation, in the served order", async () => {
  const lines = circle50101().find.circle_read.lines.slice(0, 5);
  const find = { room: roomFind().find.room, history: "complete", source: "record", circles: {
    room: { says: 14, people: 7, top_circles: 3 }, yours: 50101, lines,
    folded: [{ circle: 50112, handle: "amia", opener: "Pica, how long did the counter take?", says: 2, people: 2, started: lines[0].at, latest: lines[0].at, read: { circle: 50112 }, under: 2 }],
    elsewhere: roomFind().find.circles.elsewhere.slice(1),
    own_path: { paged: true, says: 16, shown: 5, next: { circle: 50101, after: 50105 } },
    counts: { lines: 5 }, budget: { bytes: 8192, used: 3355 },
  } };
  const h = harness({ room: { find } });
  await h.reader.showRoom();
  assert.match(text(h.root), /Yours/);
  assert.doesNotMatch(text(h.root), /your circle/i);
  assert.ok(byAttr(h.root, "data-notice", "paged").length);
  assert.match(text(byAttr(h.root, "data-notice", "paged")[0]), /5 lines of 16 shown/);
  assert.match(text(h.root), /More of yours/, "the folded side conversation is offered, in plain words");
  byAttr(h.root, "data-next")[0].click(); await tick();
  assert.deepEqual(h.calls.at(-1), ["circle", 50101, 50105], "the served own_path.next, nothing computed");
  assert.equal(byAttr(h.root, "data-circle-stub").length, 0, "the circle view replaced the room");
});

// ── pure models, words and the dress ────────────────────────────────────────

test("modelOfRoom / modelOfCircle read the served keys and invent none; an unavailable history is not 'empty'", () => {
  const room = modelOfRoom(roomFind());
  assert.deepEqual(room.stubs.map((s) => s.circle), [50101, 50107, 50114]);
  assert.equal(room.empty, false); assert.equal(room.unavailable, false); assert.equal(room.yours, null);
  assert.equal(modelOfRoom(emptyRoom()).empty, true);
  const gone = modelOfRoom(unavailableRoom());
  assert.equal(gone.unavailable, true); assert.equal(gone.empty, false);
  assert.equal(modelOfRoom({ find: { circles: { elsewhere: [] } } }).empty, false, "no history said: not claimed empty");
  const circle = modelOfCircle(circle50106());
  assert.deepEqual(circle.path, [50101, 50105, 50106]);
  assert.deepEqual(circle.crumbs.map((c) => c.label), ["pica's statement", "claran's statement", "amia's statement"]);
  assert.deepEqual(crumbsOf([1, 2], new Map([["1", "x"]])).map((c) => [c.label, c.id]), [["x's statement", 1], ["an earlier statement", 2]], "an id it cannot name is 'an earlier statement': the id is data, never words");
  assert.equal(modelOfCircle({ find: { circle: 9, history: "unavailable", circle_read: {} } }).unavailable, true);
  assert.deepEqual(modelOfCircle(circle50105Page1()).next, { circle: 50105, after: 50106 });
});

test("the words and the dress: times print as UTC, every colour in the CSS inherits or follows the text, and the stylesheet carries no innerHTML-shaped trap", () => {
  assert.equal(whenOf("2026-11-14T20:01:00.000Z"), "20:01Z");
  assert.equal(dateTimeOf("2026-11-14T20:01:00.000Z"), "2026-11-14 20:01Z");
  assert.equal(whenOf("not a time"), "");
  assert.ok(READER_WORDS.unavailable.includes("not the same as nothing"));
  assert.doesNotMatch(READER_CSS, /#[0-9a-fA-F]{3,8}\b|rgb\(/, "no literal colour: the host decides the ground and the reader reads on it");
  assert.match(READER_CSS, /\[data-circle-reader\]/);
  // every anchor the reader draws (the circle's permalink, a spark link) wears the host's foreground, never the browser's default link blue,
  // and keeps its underline as the link affordance (the permalink was dark blue on the World column's dark ground)
  assert.match(READER_CSS, /\[data-circle-reader\] a \{ color: inherit; text-decoration: underline; \}/, "any anchor inside the reader inherits the host's colour and stays underlined");
  assert.match(READER_CSS, /\[data-circle-reader\] a:focus-visible \{/, "and shows keyboard focus");
});

test("the circle permalink is an anchor INSIDE the reader's root, so the reader's link rule is the one that dresses it", async () => {
  const h = harness({ circles: { "50101|": circle50101() }, hrefForCircle: (c) => `/conversations/#circle-${c}` });
  await h.reader.showCircle(50101); await tick();
  const anchors = find(h.root, (n) => n.tagName === "A");
  assert.ok(anchors.length >= 1, "the permalink is drawn");
  for (const a of anchors) assert.equal(h.root.contains(a) && h.root.getAttribute("data-circle-reader") !== null, true, "inside [data-circle-reader]");
});

test("mountCircleReader adds its stylesheet once per document and reads the room", async () => {
  const d = { ...doc, head: element("head"), getElementById(id) { return find(this.head, (n) => n.attrs.id === id)[0] ?? null; }, createElement: element };
  const mk = () => ({ host: element("div"), source: { async room() { return roomFind(); }, async circle() { return circle50101(); } }, doc: d });
  const a = mountCircleReader(mk()); await tick();
  mountCircleReader(mk()); await tick();
  assert.equal(find(d.head, (n) => n.attrs.id === "circle-reader-css").length, 1);
  assert.equal(a.root.getAttribute("data-state"), "room");
});

// ── an office that does not serve circles yet, and the column that hosts the reader ──────────────────

test("an office that answers a room read with an answer that is NOT circles and NOT its plain list is 'could not read', never 'nobody spoke'; a circle read in the old list shape is still unavailable", async () => {
  for (const [name, answer] of Object.entries({ "no circles and no list": { hello: 1, earshot_m: 60 }, "an array": [], "an error": { error: "bounce", defect: "no such room" }, "nothing": null })) {
    const h = harness({ room: answer });
    await h.reader.showRoom(); await tick();
    assert.equal(h.root.getAttribute("data-state"), "unavailable", name);
    assert.deepEqual(byAttr(h.root, "data-notice").map((n) => n.attrs["data-notice"]), ["unavailable"], `${name}: said, with the reader's own notice`);
  }
  const odd = harness({ room: { hello: 1 } });
  await odd.reader.showRoom(); await tick();
  assert.match(text(odd.root), /did not answer with the circles of this room/, "a shape that is neither circles nor the plain list keeps its honest sentence");
  const c = harness({ circles: { "1|": { live: [] } } });
  await c.reader.showCircle(1); await tick();
  assert.equal(c.root.getAttribute("data-state"), "unavailable", "and the same for a circle read");
});

// ── WLD-216 · the plain list a pre-POS-1035 office answers `?room=` with is no failure ──────────────────────────────────────────────────────
// Prod 2026-11-19 (Darko): "a lot of conversations where it just says we couldn't read this … the office did not answer with the circles of this room". The w47 Office
// ignores `?room=` and SUCCEEDS with its plain conversations list. The recorded KEY SHAPE of that answer (anonymous prod, keys only, no values kept) is below with INVENTED
// values; the selected conversation's transcript is the host's, so the reader says "plain" and draws nothing, and the column keeps its plain timeline.
const W47_ROOT_KEYS = ["pinned", "now", "earshot_m", "fade_minutes", "hearable_since", "close_minutes", "close_minutes_deprecated", "settlement_since", "place_note", "voices_note", "live", "closed", "earlier", "record"];
const W47_THREAD_KEYS = ["id", "live", "place", "at", "aboard", "extent", "started", "latest", "participants", "voice_count", "voices"];
const W47_VOICE_KEYS = ["handle", "standing", "said", "at", "at_ms", "x", "y"];
const w47Voice = (handle, said, ms) => ({ handle, standing: "resident", said, at: "2026-11-19T21:0" + (ms % 10) + ":00.000Z", at_ms: 1795122000000 + ms * 60000, x: 10, y: 20 });
const w47Thread = (id, place, voices) => ({ id, live: true, place, at: { x: 10, y: 20 }, aboard: null, extent: null, started: "2026-11-19T21:00:00.000Z", latest: "2026-11-19T21:09:00.000Z", participants: [...new Set(voices.map((v) => v.handle))], voice_count: voices.length, voices });
const SELECTED_SAID = ["Welcome, the kettle is on (INVENTED)", "Is the tea the green one? (INVENTED)"];
const OTHER_SAID = "A different room entirely (INVENTED)";
const w47Feed = () => ({
  pinned: [], now: 1, earshot_m: 60, fade_minutes: 30, hearable_since: "2026-11-19T00:00:00.000Z", close_minutes: 30, close_minutes_deprecated: 30, settlement_since: "2026-11-19T06:00:00.000Z",
  place_note: "invented", voices_note: "invented",
  live: [w47Thread("t-selected", "the Rig Cafe (INVENTED)", [w47Voice("rig-ash", SELECTED_SAID[0], 1), w47Voice("rig-bay", SELECTED_SAID[1], 2)]), w47Thread("t-other", "Elsewhere (INVENTED)", [w47Voice("rig-cob", OTHER_SAID, 3)])],
  closed: [], earlier: [], record: {},
});

test("WLD-216 · the fixture really has the recorded w47 key shape (root, thread, voice), with invented values only", () => {
  const f = w47Feed();
  assert.deepEqual(Object.keys(f), W47_ROOT_KEYS);
  assert.deepEqual(Object.keys(f.live[0]), W47_THREAD_KEYS);
  assert.deepEqual(Object.keys(f.live[0].voices[0]), W47_VOICE_KEYS);
  assert.ok(JSON.stringify(f).includes("INVENTED"));
});

test("WLD-216 · the old office's plain list on a room read: the reader says 'plain', draws no error and no notice, and keeps no stale model; a circle read in that shape is still unavailable", async () => {
  const states = [];
  const host = element("div"); const sc = element("div"); sc.appendChild(host);
  const reader = createCircleReader({ doc, host, source: { async room() { return w47Feed(); }, async circle() { return w47Feed(); } }, roomId: "t-selected", scroller: sc, hostHoldsPlain: true, onState: (s, d) => states.push([s, d?.reason ?? null]) });
  await reader.showRoom(); await tick();
  assert.deepEqual(states.at(-1), ["unavailable", "plain"], "told to the host as plain, not as a failed read");
  assert.equal(reader.root.getAttribute("data-state"), "unavailable");
  assert.equal(byAttr(reader.root, "data-notice").length, 0, "no 'could not read' notice");
  assert.equal(byAttr(reader.root, "data-retry").length, 0, "no Try-again for something that did not fail");
  assert.doesNotMatch(text(reader.root), /could not|couldn't|did not answer/i);
  assert.equal(reader.root.children.length, 0, "the reader draws nothing of its own");
  // a circle read answered in the old shape is not the same thing: there is no plain timeline of a circle
  const c = harness({ circles: { "1|": w47Feed() } });
  await c.reader.showCircle(1); await tick();
  assert.equal(c.root.getAttribute("data-state"), "unavailable");
  assert.equal(byAttr(c.root, "data-notice").length, 1, "a circle read in the old shape is still said as unavailable");
});

test("WLD-216 · a BARE caller (no host option), and one with only onState, still gets the honest 'could not read' notice with Try again on the old office's plain list: never a blank", async () => {
  for (const [name, extra] of Object.entries({ "bare": {}, "onState only": { onState: () => {} }, "hostHoldsPlain false": { hostHoldsPlain: false } })) {
    const host = element("div"); const sc = element("div"); sc.appendChild(host);
    const reader = createCircleReader({ doc, host, source: { async room() { return w47Feed(); }, async circle() { return w47Feed(); } }, roomId: "t-selected", scroller: sc, ...extra });
    await reader.showRoom(); await tick();
    assert.equal(reader.root.getAttribute("data-state"), "unavailable", name);
    assert.deepEqual(byAttr(reader.root, "data-notice").map((n) => n.attrs["data-notice"]), ["unavailable"], `${name}: the reader says so itself`);
    assert.equal(byAttr(reader.root, "data-retry").length, 1, `${name}: and offers Try again`);
    assert.match(text(reader.root), /did not answer with the circles of this room/, name);
  }
});

test("WLD-216 · a column that holds NO transcript does not stand the reader down: the honest error and Try again stay", async () => {
  const { homeColumnModel, renderHomeColumn } = await import("../spectator/home-column.mjs");
  const host = element("div");
  renderHomeColumn(doc, host, homeColumnModel({ handle: "the-town", kicker: "k", title: "t", door: { blocks: [] }, reader: { roomId: "t-selected", source: { async room() { return w47Feed(); }, async circle() { return w47Feed(); } } } }));
  await tick(); await tick();
  assert.equal(byAttr(host, "data-notice", "unavailable").length, 1, "with nothing to show instead, the reader's own error stands");
  assert.equal(byAttr(host, "data-retry").length, 1);
});

test("WLD-216 · the open conversation takes NEWLY held words under the same key (liveUpdate): the old words are replaced, nothing doubles, another room's words never arrive, the reader node and the key stay", async () => {
  const { createHomeColumn } = await import("../spectator/home-column.mjs");
  const para = (handle, said) => ({ type: "paragraph", spans: [{ type: "strong", spans: [{ type: "text", text: handle }] }, { type: "text", text: `: ${said}` }] });
  const view = (voices) => ({ handle: "the-town", residentLink: false, key: "convo:t-selected|circles", kicker: "a conversation · live", title: "the Rig Cafe (INVENTED)", region: `${voices.length} statements · 2 speakers`,
    byline: "in this settlement", facts: [], door: { blocks: voices.map(([h, s]) => para(h, s)) }, footerLink: { href: "/conversations/#t-selected", text: "all conversations →" },
    reader: { roomId: "t-selected", source: { async room() { return w47Feed(); }, async circle() { return w47Feed(); } } } });
  const host = element("aside");
  const column = createHomeColumn({ doc, host });
  const first = [["rig-ash", SELECTED_SAID[0]], ["rig-bay", SELECTED_SAID[1]]];
  column.open(view(first)); await tick(); await tick();
  const body = () => find(host, (n) => n.className === "wv-homecol-body")[0];
  const readerNode = host.__circleReader;
  assert.equal(body().hidden, false); for (const [, s] of first) assert.ok(text(body()).includes(s));
  // the poll brings a new statement in this same conversation: the column is handed its fresh view under the SAME key
  const later = [...first, ["rig-ash", "A brand new statement arrives. (INVENTED)"]];
  column.open(view(later)); await tick();
  assert.ok(text(body()).includes("A brand new statement arrives. (INVENTED)"), "the newly held words reach the open transcript");
  assert.equal((text(body()).match(/kettle is on/g) ?? []).length, 1, "and the earlier words are not doubled");
  assert.equal(host.__circleReader, readerNode, "the reader is the same one: nothing was rebuilt");
  assert.equal(column.shownKey(), "convo:t-selected|circles");
  assert.equal(body().hidden, false); assert.equal(find(host, (n) => n.className === "wv-homecol-flatnote")[0].hidden, true, "still no 'could not be read' sentence");
  assert.equal(text(host).includes(OTHER_SAID), false, "another room's words never arrive");
  // an unchanged view touches nothing
  const before = body().children.slice();
  column.open(view(later)); await tick();
  assert.deepEqual(body().children, before, "an unchanged redraw rewrites nothing");
  // and the words can change again, including a statement that left
  column.open(view(later.slice(1))); await tick();
  assert.equal(text(body()).includes("kettle is on"), false, "a statement no longer held is gone");
  assert.ok(text(body()).includes("A brand new statement arrives."));
});

test("WLD-216 · the viewer hands the open conversation's column its fresh view after each conversations read (the poll and after a say), by the selected thread's id", async () => {
  const SRC = (await import("node:fs")).readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  assert.match(SRC, /function refreshConvoColumn\(\) \{\s*const column = convoColumnView\(markInteraction\.getState\(\)\.selectedId\);\s*if \(column\) homeColumn\.open\(column\);\s*\}/);
  assert.match(SRC, /loadConversations\(\)\.then\(drawConversations\)\.then\(\(\) => \{ refreshConvoColumn\(\); homeColumn\.refreshReader\?\.\(\); \}\)/, "the 60 s poll");
  assert.match(SRC, /loadConversations\(\)\.then\(drawConversations\)\.then\(\(\) => refreshConvoColumn\(\)\)/, "and the re-read after a say");
});

test("WLD-216 · the column keeps the selected conversation's plain transcript on the old office's answer, with no 'could not be read' sentence; refresh keeps it; another room's words never appear", async () => {
  const { homeColumnModel, renderHomeColumn } = await import("../spectator/home-column.mjs");
  const selected = w47Feed().live[0];
  const blocks = selected.voices.map((v) => ({ type: "paragraph", spans: [{ type: "text", text: `${v.handle}: ${v.said}` }] }));
  let asked = 0;
  const source = { async room() { asked += 1; return w47Feed(); }, async circle() { return w47Feed(); } };
  const host = element("div");
  renderHomeColumn(doc, host, homeColumnModel({ handle: "the-town", kicker: "a conversation · live", title: "the Rig Cafe (INVENTED)", door: { blocks }, footerLink: { href: "/conversations/#t-selected", text: "all conversations →" }, reader: { roomId: "t-selected", source } }));
  await tick(); await tick();
  const body = find(host, (n) => n.className === "wv-homecol-body")[0];
  const note = find(host, (n) => n.className === "wv-homecol-flatnote")[0];
  assert.equal(body.hidden, false, "the plain transcript the map holds is shown");
  assert.equal(note.hidden, true, "and no 'circles could not be read' sentence is over it");
  for (const said of SELECTED_SAID) assert.ok(text(body).includes(said), `the selected conversation's words: ${said}`);
  assert.equal(text(host).includes(OTHER_SAID), false, "another room's words never appear");
  assert.equal(byAttr(host, "data-notice").length, 0, "the reader's own error presentation is gone");
  assert.equal(find(host, (n) => n.className === "wv-homecol-all").length, 1, "the all-conversations footer is kept");
  assert.equal(asked, 1);
  // a refresh keeps it working (and reads again, the way it always did)
  await host.__circleReader.refresh({ quiet: true }); await tick();
  assert.equal(body.hidden, false); assert.equal(note.hidden, true);
  assert.ok(asked >= 2, "the refresh asked the office again");
  assert.equal(byAttr(host, "data-notice").length, 0);
  // a REAL failure still gets the honest sentence (and the transcript stands in under it)
  const down = element("div");
  renderHomeColumn(doc, down, homeColumnModel({ handle: "the-town", kicker: "k", title: "t", door: { blocks }, reader: { roomId: "t-selected", source: { async room() { throw new Error("503"); }, async circle() { throw new Error("503"); } } } }));
  await tick(); await tick();
  assert.equal(find(down, (n) => n.className === "wv-homecol-flatnote")[0].hidden, false, "a failed read keeps its sentence");
  assert.equal(byAttr(down, "data-notice", "unavailable").length, 1);
  // and a real circles envelope is still the circles view, unchanged
  const good = element("div");
  renderHomeColumn(doc, good, homeColumnModel({ handle: "the-town", kicker: "k", title: "t", door: { blocks }, reader: { roomId: "t1", source: { async room() { return roomFind(); }, async circle() { return circle50101(); } } } }));
  await tick(); await tick();
  assert.equal(byAttr(good, "data-circle-stub").length, 3);
  assert.equal(find(good, (n) => n.className === "wv-homecol-body")[0].hidden, true);
});

test("the column's reader slot: the reader mounts where the flat words stood; the flat words show only when the reader could not read, and say so", async () => {
  const { homeColumnModel, renderHomeColumn } = await import("../spectator/home-column.mjs");
  const flat = [{ type: "paragraph", spans: [{ type: "text", text: "rig-ash: the old flat words" }] }];
  const view = (source) => homeColumnModel({ handle: "the-town", kicker: "a conversation · live", title: "Cave Interior", door: { blocks: flat }, footerLink: { href: "/conversations/#t1", text: "all conversations →" },
    reader: { roomId: "t1", source, canReply: true, onReply: () => {} } });
  const host = element("div");
  const good = { async room() { return roomFind(); }, async circle() { return circle50101(); } };
  renderHomeColumn(doc, host, view(good));
  await tick(); await tick();
  const body = find(host, (n) => n.className === "wv-homecol-body")[0];
  assert.equal(body.hidden, true, "the flat words wait behind the reader");
  assert.equal(byAttr(host, "data-circle-stub").length, 3, "the reader drew the room's circles in the column");
  assert.equal(find(host, (n) => n.className === "wv-homecol-all").length, 1, "the footer link to the conversations page is kept");
  assert.ok(host.__circleReader, "the column keeps the reader so it can refresh it in place");
  // an office that cannot answer: the reader says so and the flat words stand in, with their own sentence
  const down = element("div");
  renderHomeColumn(doc, down, view({ async room() { throw new Error("503"); }, async circle() { throw new Error("503"); } }));
  await tick(); await tick();
  assert.equal(find(down, (n) => n.className === "wv-homecol-body")[0].hidden, false, "the words the map holds are shown");
  assert.equal(find(down, (n) => n.className === "wv-homecol-flatnote")[0].hidden, false);
  assert.match(text(find(down, (n) => n.className === "wv-homecol-flatnote")[0]), /circles could not be read/);
  assert.equal(byAttr(down, "data-notice", "unavailable").length, 1, "and the reader's own notice says it could not read");
  // a column with no reader is today's column
  const plain = element("div");
  renderHomeColumn(doc, plain, homeColumnModel({ handle: "the-town", kicker: "k", title: "t", door: { blocks: flat } }));
  assert.equal(find(plain, (n) => n.className === "wv-homecol-body")[0].hidden, false);
  assert.equal(plain.__circleReader, null);
});

test("the SAY sheet: the receipt's own words ride back as served (linked by name), and reply_to is additive and chosen by the reader's Reply", async () => {
  const { worldSayAnswer } = await import("../spectator/viewer.mjs");
  const base = { spoke: true, listeners: ["a"], voices: [], where: { place: "Cave Interior" } };
  const plainAnswer = worldSayAnswer(base);
  assert.equal(plainAnswer.kind, "success"); assert.deepEqual(plainAnswer.notes, [], "no note when the office served none");
  const named = worldSayAnswer({ ...base, said: { id: 50115, reply_to: 50110, linked: "name", note: "linked to claran's say at 20:10 by name; press Reply to choose another" } });
  assert.deepEqual(named.notes, ["linked to claran's say at 20:10 by name; press Reply to choose another"], "exactly the sentence the office served");
  assert.equal(named.said.linked, "name");
  const noId = worldSayAnswer({ ...base, said: { id_note: "this office is not keeping say ids" } });
  assert.deepEqual(noId.notes, ["this office is not keeping say ids"]);
  assert.equal(worldSayAnswer({ ...base, said: { id: 1 } }).notes.length, 0, "an id alone says nothing the browser should add");
  // THE WIRING, as a TEXT PIN (the weakest instrument, labelled so: the sheet lives inside mountViewer): the act is sent with reply_to only when a
  // target is chosen, the target comes from the reader's Reply, and the browser never mentions how a link was resolved.
  const SRC = (await import("node:fs")).readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  assert.match(SRC, /apexAct\("say", \{ text, \.\.\.\(sayReplyTo \? \{ reply_to: sayReplyTo\.id \} : \{\}\) \}\)/, "reply_to rides additively");
  assert.match(SRC, /onReply: \(target\) => setReplyTarget\(target\)/, "the reader's Reply sets the target");
  assert.match(SRC, /replying to \$\{sayReplyTo\.handle\}/);
  assert.match(SRC, /wv-say-reply-clear/);
  assert.equal(/linked by name|handle_time/.test(SRC.slice(SRC.indexOf("function setReplyTarget"), SRC.indexOf("function syncSayBox"))), false, "no link provenance is derived in the browser's say path");
});

// ── CORE-82 FIX (lead review of 71e36f70): late answers, honest unavailable history, permalink focus, live canReply ──────────────────

const gate = () => { let release; const wait = new Promise((ok) => { release = ok; }); return { wait, release }; };

test("a slow background refresh that answers AFTER the visitor opened a circle does not redraw the room over it", async () => {
  const h = harness({ circles: { "50101|": circle50101() } });
  await h.reader.showRoom(); await tick();
  const g = gate();
  h.answers.room = () => g.wait.then(() => roomFind());
  const polling = h.reader.refresh();                               // the poll is in flight …
  byAttr(h.root, "data-circle-open", 50101)[0].click(); await tick();   // … and the visitor opens a conversation
  assert.equal(h.reader.getState().view, "circle");
  g.release(); await polling; await tick();
  assert.equal(h.reader.getState().view, "circle", "the state still says circle");
  assert.equal(byAttr(h.root, "data-crumbs").length, 1, "the circle's named back path is still drawn");
  assert.equal(byAttr(h.root, "data-circle-stub").length, 0, "the room's stubs were not drawn over it");
  assert.equal(h.root.getAttribute("data-state"), "circle");
});

test("a slow circle refresh that answers AFTER Back does not redraw the circle over the room", async () => {
  const h = harness({ circles: { "50101|": circle50101() } });
  await h.reader.showCircle(50101); await tick();
  const g = gate();
  h.answers.circles["50101|"] = () => g.wait.then(() => circle50101());
  const polling = h.reader.refresh();
  byAttr(h.root, "data-back")[0].click(); await tick();
  assert.equal(h.reader.getState().view, "room");
  g.release(); await polling; await tick();
  assert.equal(h.reader.getState().view, "room");
  assert.equal(byAttr(h.root, "data-crumbs").length, 0, "no circle crumbs over the room");
  assert.equal(byAttr(h.root, "data-circle-stub").length, 3, "the room's stubs stand");
});

test("a 'show more' page that answers after the visitor went elsewhere, or after destroy, is dropped", async () => {
  const p1 = circle50105Page1(), next = p1.find.circle_read.next;
  const mk = () => {
    const h = harness({ circles: { "50105|": circle50105Page1(), "50101|": circle50101() } });
    const g = gate();
    h.answers.circles[`${next.circle}|${next.after}`] = () => g.wait.then(() => circle50105Page2());
    return { h, g };
  };
  {
    const { h, g } = mk();
    await h.reader.showCircle(50105); await tick();
    byAttr(h.root, "data-next")[0].click(); await tick();            // more() in flight
    await h.reader.showRoom(); await tick();                         // the visitor goes back to the room
    g.release(); await tick(); await tick();
    assert.equal(h.reader.getState().view, "room");
    assert.equal(byAttr(h.root, "data-say", 50110).length + byAttr(h.root, "data-say", 50111).length, 0, "the second page was not drawn over the room");
    assert.equal(byAttr(h.root, "data-crumbs").length, 0);
  }
  {
    const { h, g } = mk();
    await h.reader.showCircle(50105); await tick();
    byAttr(h.root, "data-next")[0].click(); await tick();
    h.reader.destroy();
    g.release(); await tick(); await tick();
    assert.equal(h.root.children.length, 0, "a destroyed reader draws nothing when a late answer lands");
  }
});

test("an unavailable history with lines keeps the lines and says so: it is never 'the whole circle'; no lines at all is not a blank", async () => {
  const partial = circle50101({ history: "unavailable" });            // complete:true and history:unavailable together, with ten lines
  const h = harness({ circles: { "50101|": partial } });
  await h.reader.showCircle(50101); await tick();
  openAll(h.root);
  assert.equal(byAttr(h.root, "data-say").length, 10, "every served line is still reachable on screen");
  const kinds = byAttr(h.root, "data-notice").map((n) => n.attrs["data-notice"]);
  assert.ok(kinds.includes("unavailable"), "the unavailable history is said aloud");
  assert.equal(kinds.includes("complete"), false, "and the circle is not called complete");
  assert.doesNotMatch(text(h.root), /whole circle\.$|That is the whole circle/);
  const empty = circle50101(); empty.find.circle_read.lines = []; empty.find.circle_read.says = 0;
  const e = harness({ circles: { "50101|": empty } });
  await e.reader.showCircle(50101); await tick();
  const ek = byAttr(e.root, "data-notice").map((n) => n.attrs["data-notice"]);
  assert.ok(ek.includes("unavailable"), "a read with no statements is not an answer-shaped blank");
  assert.equal(ek.includes("complete"), false, "and it is not called complete");
});

test("a circles-shaped room answer with no history flag and nothing to show is 'could not say', not a blank card", async () => {
  const r = roomFind(); delete r.find.history;
  r.find.circles = { room: { says: 0, people: 0, top_circles: 0 }, yours: null, lines: [], folded: [], elsewhere: [], counts: {} };
  const h = harness({ room: r });
  await h.reader.showRoom(); await tick();
  assert.equal(h.root.getAttribute("data-state"), "unavailable");
  assert.deepEqual(byAttr(h.root, "data-notice").map((n) => n.attrs["data-notice"]), ["unavailable"]);
  assert.equal(byAttr(h.root, "data-retry").length, 1);
  assert.doesNotMatch(text(h.root), /Nobody has spoken here yet/, "and it does not claim the room was silent");
});

test("the circle's permalink keeps keyboard focus through a quiet refresh", async () => {
  const h = harness({ circles: { "50101|": circle50101() }, hrefForCircle: (c) => `/conversations/#circle-${c}` });
  await h.reader.showCircle(50101); await tick();
  const link = byAttr(h.root, "data-key", "permalink")[0];
  assert.ok(link, "the permalink is a keyed control");
  assert.equal(link.attrs.href, "/conversations/#circle-50101");
  link.focus();
  await h.reader.refresh(); await tick();
  assert.equal(doc.activeElement?.attrs["data-key"], "permalink", "focus came back to the link after the redraw");
});

test("the host can switch Reply on or off while the reader is open: the view is redrawn in place, not re-read or reset to the room", async () => {
  const targets = [];
  const h = harness({ circles: { "50101|": circle50101() }, canReply: false });
  await h.reader.showCircle(50101); await tick();
  assert.equal(byAttr(h.root, "data-reply").length, 0);
  openAll(h.root);
  const reads = h.calls.length;
  h.scroller.scrollTop = 120;
  h.reader.setCanReply(true, (t) => targets.push(t.id));
  assert.equal(h.reader.getState().view, "circle", "still in the same circle");
  assert.equal(h.calls.length, reads, "nothing was asked of the office");
  assert.equal(byAttr(h.root, "data-reply").length, 10, "each served say now carries Reply");
  assert.equal(h.scroller.scrollTop, 120, "scroll kept");
  byAttr(h.root, "data-reply", 50104)[0].click();
  assert.deepEqual(targets, [50104], "the new handler is the one called");
  h.reader.setCanReply(false);
  assert.equal(byAttr(h.root, "data-reply").length, 0, "signed out: the buttons go");
  assert.equal(h.reader.getState().view, "circle");
});

test("the column keeps ONE reader for a conversation, yet live metadata and canReply reach it: words are rewritten in place, the reader is not rebuilt or re-read", async () => {
  const { createHomeColumn } = await import("../spectator/home-column.mjs");
  const calls = [];
  const source = { async room() { calls.push("room"); return roomFind(); }, async circle() { calls.push("circle"); return circle50101(); } };
  const host = element("div");
  const col = createHomeColumn({ doc, host });
  const view = (over = {}, readerOver = {}) => ({ handle: "the-town", residentLink: false, key: "convo:t1|circles", kicker: "a conversation · live", title: "Cave Interior", region: "14 statements · 7 speakers",
    door: { blocks: [] }, byline: "in this settlement", facts: [{ label: "now", value: "live: a conversation lasts the settlement" }, { label: "latest", value: "2026-11-14 20:14Z" }],
    reader: { roomId: "t1", source, canReply: false, ...readerOver }, ...over });
  col.open(view()); await tick(); await tick();
  const reader = host.__circleReader;
  assert.ok(reader);
  byAttr(host, "data-circle-open", 50101)[0].click(); await tick(); await tick();
  openAll(host);
  assert.equal(reader.getState().view, "circle");
  assert.equal(byAttr(host, "data-reply").length, 0);
  const reads = calls.length;
  const targets = [];
  // the same key again, with what the office says now: gone quiet, new counts, and the visitor is now signed in
  col.open(view({ kicker: "a conversation · gone quiet", region: "20 statements · 8 speakers", byline: "in an earlier settlement",
    facts: [{ label: "now", value: "gone quiet: an earlier settlement's" }, { label: "latest", value: "2026-11-14 20:40Z" }] }, { canReply: true, onReply: (t) => targets.push(t.id) }));
  assert.equal(host.__circleReader, reader, "the same reader: nothing was rebuilt");
  assert.equal(reader.getState().view, "circle", "still in the circle the visitor opened");
  assert.equal(calls.length, reads, "nothing was re-read for it");
  assert.equal(text(find(host, (n) => n.className === "wv-homecol-kicker")[0]), "a conversation · gone quiet");
  assert.equal(text(find(host, (n) => n.className === "wv-homecol-meta")[0]), "20 statements · 8 speakers");
  assert.equal(text(find(host, (n) => n.className === "wv-homecol-byline")[0]), "in an earlier settlement");
  const dds = find(host, (n) => n.tagName === "DD").map(text);
  assert.deepEqual(dds, ["gone quiet: an earlier settlement's", "2026-11-14 20:40Z"], "the facts follow the office");
  assert.equal(byAttr(host, "data-reply").length, 10, "canReply reached the open reader");
  byAttr(host, "data-reply", 50104)[0].click();
  assert.deepEqual(targets, [50104], "and so did the new reply handler");
});

test("the World's reader is reading-only on a phone: the column hands the reader canReply only for an acting visitor who is NOT on the phone layout (SOURCE PIN; the behaviour is the reader's own canReply, tested above)", async () => {
  const SRC = (await import("node:fs")).readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  const view = SRC.slice(SRC.indexOf("function convoColumnView"), SRC.indexOf("// What a plain click or hover on the map means for a thread"));
  assert.match(view, /canReply: canAct\(\) && !onPhone\(\)/, "no Reply on the phone World page; the host option, not a stylesheet hide");
  assert.equal(/display\s*:\s*none[^}]*cr-reply|cr-reply[^}]*display\s*:\s*none/.test(READER_CSS), false, "and the shared reader's CSS does not hide Reply (the conversations page keeps it)");
  assert.match(view, /\/conversations\/#circle-/, "the circle's link to the conversations page stays");
  // the reader itself: with canReply false there is no Reply button, the permalink still is drawn
  const h = harness({ circles: { "50101|": circle50101() }, canReply: false, hrefForCircle: (c) => `/conversations/#circle-${c}` });
  await h.reader.showCircle(50101); await tick();
  assert.equal(byAttr(h.root, "data-reply").length, 0, "zero Reply controls");
  assert.equal(byAttr(h.root, "data-key", "permalink").length, 1, "the link to the conversations page remains");
});

test("the SAY sheet: a sheet that is opened plainly starts with no reply target; only an explicit Reply sets one (SOURCE PIN, the weakest instrument: the sheet lives inside mountViewer)", async () => {
  const SRC = (await import("node:fs")).readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  const open = SRC.slice(SRC.indexOf("function openSayBox()"), SRC.indexOf("function syncSayBox"));
  assert.match(open, /sayReplyTo = null;[^\n]*\n\s*const sheet = document\.createElement\("div"\)/, "a fresh sheet clears the previous target before it is built");
  const set = SRC.slice(SRC.indexOf("function setReplyTarget"), SRC.indexOf("function openSayBox()"));
  assert.ok(set.indexOf("openSayBox()") < set.indexOf("sayReplyTo = {"), "an explicit Reply opens the sheet FIRST and sets its target after, so the chosen target survives the open");
});

// ── WLD-213 · the optional host-provided speaker face ───────────────────────
//
// The host owns what a face IS; the reader only places the fresh decorative node the host's `faceForSpeaker(handle)` returns, inline before the name, on every
// line it draws (a room's openers, a conversation's full lines at every depth, its context lines, old talk), and knows no avatar source, household, photo, URL or
// office field. Absent, null or unusable, the DOM is exactly what it was. FALSIFIER: one path lacks a face, a repeated handle steals an earlier node, a name or time
// disappears, a bare caller changes, or drawing fetches a picture or an identity.
const faceHook = (calls = []) => (handle) => { calls.push(handle); const n = element("span"); n.className = "rig-face"; n.setAttribute("data-face", handle); return n; };
/** the shape of a tree as a string (tags, classes, attributes, text): two draws are the same draw when their shapes are */
const shapeOf = (n) => (n.nodeType === TEXT ? JSON.stringify(n.text) : `<${n.tagName}.${n.className}${Object.entries(n.attrs).sort().map(([k, v]) => ` ${k}=${v.replace(/\bcr\d+-/g, "crN-")}`).join("")}>${n.children.map(shapeOf).join("")}</>`);   // a reader's own instance counter in its ids is not a difference
const faceHost = (opts, { room = roomFind } = {}) => {
  const host = element("div"); const scroller = element("div"); scroller.appendChild(host);
  const calls = [];
  const source = { async room(id) { calls.push(["room", id]); return room(); }, async circle(id, after) { calls.push(["circle", id, after]); return id === 50101 ? circle50101() : id === 50105 ? circle50105Page1() : { error: "bounce" }; } };
  const reader = createCircleReader({ doc, host, source, roomId: "t20260514-pica", scroller, ...opts });
  return { host, reader, root: reader.root, calls };
};
const facesOf = (root) => byAttr(root, "data-face");
const headOf = (li) => li.children.find((c) => c.className === "cr-head-line");

test("WLD-213 · room openers: each opener carries its speaker's face inline BEFORE the name, with the name, time, text and controls intact", async () => {
  const calls = [];
  const h = faceHost({ faceForSpeaker: faceHook(calls) });
  await h.reader.showRoom();
  const stubs = byAttr(h.root, "data-circle-stub");
  assert.equal(stubs.length, 3);
  for (const st of stubs) {
    const head = headOf(st);
    assert.deepEqual(head.children.map((c) => c.className), ["rig-face", "cr-who", "cr-time"], "face, name, time: inline in the one head line");
    assert.equal(head.children[0].attrs["data-face"], text(head.children[1]), "the face is the speaker's own");
    assert.equal(head.children[0].attrs["aria-hidden"], "true", "decorative: the name beside it is the label");
  }
  assert.deepEqual([...calls].sort(), stubs.map((s) => text(headOf(s).children[1])).sort(), "asked once per opener, by handle, and for nothing else");
  assert.match(text(stubs[0]), /pica .*Welcome, everyone!/);
  assert.ok(byAttr(stubs[0], "data-circle-open").length === 1 && byAttr(stubs[0], "data-thread").length === 1, "the Open control and the reply thread are untouched");
});

test("WLD-213 · a conversation's full lines at every depth, its context lines and a repeated speaker: every line has a face of its own, none is shared or moved", async () => {
  const h = faceHost({ faceForSpeaker: faceHook(), canReply: true });
  await h.reader.showCircle(50101);
  openAll(h.root);
  const lines = byAttr(h.root, "data-say");
  assert.equal(lines.length, 10, "all ten statements, once opened");
  const faces = lines.map((li) => headOf(li).children.filter((c) => c.className === "rig-face"));
  assert.ok(faces.every((f) => f.length === 1), "exactly one face on every line, openers and the deepest replies alike");
  const nodes = faces.map((f) => f[0]);
  assert.equal(new Set(nodes).size, nodes.length, "a repeated handle never steals an earlier line's node");
  const who = lines.map((li) => text(headOf(li).children[1]));
  assert.ok(new Set(who).size < who.length, "the fixture does repeat speakers (pica speaks more than once)");
  assert.deepEqual(nodes.map((n) => n.attrs["data-face"]), who, "each face is its own line's speaker's");
  assert.equal(byAttr(h.root, "data-reply").length, 10, "Reply controls are still on every line");
  // the context block (an ancestor shown for orientation) carries faces too
  const c = faceHost({ faceForSpeaker: faceHook() });
  await c.reader.showCircle(50105);
  const ctx = byAttr(byAttr(c.root, "data-context")[0], "data-context-say");
  assert.ok(ctx.length >= 1 && ctx.every((li) => headOf(li).children[0].className === "rig-face" && headOf(li).children[0].attrs["data-face"] === text(headOf(li).children[1])), "context lines have faces");
});

test("WLD-213 · old talk (no ids) is a plain timeline and its lines carry faces too", async () => {
  const h = faceHost({ faceForSpeaker: faceHook() }, { room: legacyRoom });
  await h.reader.showRoom();
  const plain = byAttr(h.root, "data-say-plain");
  assert.equal(plain.length, 2);
  for (const li of plain) assert.deepEqual(headOf(li).children.map((c) => c.className).slice(0, 2), ["rig-face", "cr-who"]);
  assert.match(text(h.root), /Claran, hello.*hi rei/, "the words are intact");
});

test("WLD-213 · absent, null, or unusable output is exactly today's DOM: no empty box, no gutter, no change for a bare caller", async () => {
  const bare = faceHost({});
  await bare.reader.showCircle(50101); openAll(bare.root);
  const bareShape = shapeOf(bare.root);
  const variants = { "a hook that returns null": () => null, "undefined": () => undefined, "a string": () => "<img src=x onerror=alert(1)>", "an object that is not a node": () => ({ nodeType: 3 }), "a hook that throws": () => { throw new Error("no face for you"); } };
  for (const [name, hook] of Object.entries(variants)) {
    const h = faceHost({ faceForSpeaker: hook });
    await h.reader.showCircle(50101); openAll(h.root);
    assert.equal(shapeOf(h.root), bareShape, `${name}: the same DOM as a bare call`);
  }
  // an option that is not a function is ignored, never called
  const odd = faceHost({ faceForSpeaker: "pica" });
  await odd.reader.showCircle(50101); openAll(odd.root);
  assert.equal(shapeOf(odd.root), bareShape, "a non-function option is no option");
  // the room view too
  const b2 = faceHost({}); await b2.reader.showRoom();
  const n2 = faceHost({ faceForSpeaker: () => null }); await n2.reader.showRoom();
  assert.equal(shapeOf(n2.root), shapeOf(b2.root));
});

test("WLD-213 · a node that is already placed is NOT moved off its line: the same node returned twice is placed once, the second line has none", async () => {
  const shared = element("span"); shared.setAttribute("data-face", "shared");
  const h = faceHost({ faceForSpeaker: () => shared });
  await h.reader.showRoom();
  const placed = facesOf(h.root);
  assert.equal(placed.length, 1, "one placement; the other openers were not given the same node");
  assert.equal(shared.parent, headOf(byAttr(h.root, "data-circle-stub")[0]), "and it stayed on the first line");
});

test("WLD-213 · drawing with a hook reads nothing more and asks nobody who a speaker is: the office calls are exactly a bare caller's", async () => {
  const bare = faceHost({}); await bare.reader.showRoom(); byAttr(bare.root, "data-circle-open", 50101)[0].click(); await tick(); openAll(bare.root);
  const withHook = faceHost({ faceForSpeaker: faceHook([]) }); await withHook.reader.showRoom(); byAttr(withHook.root, "data-circle-open", 50101)[0].click(); await tick(); openAll(withHook.root);
  assert.deepEqual(withHook.calls, bare.calls, "the same reads, in the same order: no picture, identity or avatar read of the reader's own");
});

test("WLD-213 · folds and the redraw keep the faces: opening a thread redraws in place and every line, new ones included, still has its own face", async () => {
  const h = faceHost({ faceForSpeaker: faceHook() });
  await h.reader.showCircle(50101);
  assert.equal(facesOf(h.root).length, 1, "folded: only the opener is on screen, with its face");
  byAttr(h.root, "data-thread-view")[0].click();
  const open = byAttr(h.root, "data-thread", "t-50101")[0];
  assert.equal(open.attrs["data-open"], "true", "the thread opened (the fold state kept by the reader)");
  const lines = byAttr(h.root, "data-say");
  assert.ok(lines.length > 1 && lines.every((li) => headOf(li).children[0].className === "rig-face"), "the newly shown replies have their faces");
  assert.match(text(h.root), /Welcome, everyone!/, "text intact");
});

test("WLD-213 · the column hands its reader the host's hook only when it has one: with it the column's reader draws faces, without it the column is today's", async () => {
  const { homeColumnModel, renderHomeColumn } = await import("../spectator/home-column.mjs");
  const flat = [{ type: "paragraph", spans: [{ type: "text", text: "rig-ash: the old flat words" }] }];
  const view = (extra) => homeColumnModel({ handle: "the-town", kicker: "k", title: "Cave Interior", door: { blocks: flat }, reader: { roomId: "t1", source: { async room() { return roomFind(); }, async circle() { return circle50101(); } }, ...extra } });
  const withFace = element("div"); renderHomeColumn(doc, withFace, view({ faceForSpeaker: faceHook([]) })); await tick(); await tick();
  assert.equal(facesOf(withFace).length, 3, "the column's reader placed a face on each opener");
  const without = element("div"); renderHomeColumn(doc, without, view({})); await tick(); await tick();
  assert.equal(facesOf(without).length, 0, "no hook, no faces");
  const none = element("div"); renderHomeColumn(doc, none, view({ faceForSpeaker: null })); await tick(); await tick();
  assert.equal(shapeOf(none), shapeOf(without), "an explicit null is the same as nothing");
  // WLD-215 flips the old pin: the World page's conversation view now hands the page's own face source (faceOf), and nothing else supplies one
  const SRC = (await import("node:fs")).readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  const cv = SRC.slice(SRC.indexOf("function convoColumnView"), SRC.indexOf("// What a plain click or hover on the map means for a thread"));
  assert.match(cv, /faceForSpeaker: \(h\) => \{ const f = faceOf\(h\); return speakerFaceEl\(document,/, "the conversation view hands the page's occupant face source, no new fetch");
  assert.match(cv, /hostOwnsHeader: true/, "and says the column owns the one header");
  assert.doesNotMatch(cv, /facts:|label: "now"|in this settlement/, "no bottom fields table, no now row, no repeated byline");
  assert.match(cv, /byline: false,/, "and the column's default byline (in <handle>'s own words) is switched off, not left to show");
});

test("WLD-215 · hostOwnsHeader: the room view omits only its own .cr-head; without the option every caller keeps it, and the circle view is untouched", async () => {
  const withOpt = faceHost({ hostOwnsHeader: true }); await withOpt.reader.showRoom();
  assert.equal(find(withOpt.root, (n) => n.className === "cr-head").length, 0, "the duplicate header is gone");
  assert.equal(byAttr(withOpt.root, "data-circle-stub").length, 3, "the lines are all there");
  for (const opts of [{}, { hostOwnsHeader: false }, { hostOwnsHeader: "yes" }]) {
    const bare = faceHost(opts); await bare.reader.showRoom();
    assert.equal(find(bare.root, (n) => n.className === "cr-head").length, 1, "a bare caller keeps today's header");
  }
  await withOpt.reader.showCircle(50101);
  assert.equal(find(withOpt.root, (n) => n.className === "cr-head").length, 1, "the circle view keeps its own title and counts");
  assert.equal(byAttr(withOpt.root, "data-key", "circle-title").length, 1);
});

test("WLD-215 · the column's one header: speakers as face + name, the live mark's tooltip, no facts table; legacy lines wear faces; a bad hook or a repeated speaker loses nothing", async () => {
  const { homeColumnModel, renderHomeColumn } = await import("../spectator/home-column.mjs");
  const blocks = ["rig-ash", "rig-ash", "rig-bo"].map((h, i) => ({ type: "paragraph", speaker: h, spans: [{ type: "strong", spans: [{ type: "text", text: h }] }, { type: "text", text: `: line ${i}` }] }));
  const mk = (faceForSpeaker) => homeColumnModel({ handle: "the-town", byline: false, kicker: "a conversation · live", kickerTitle: "live: lasts the settlement", title: "Cave Interior", region: "3 statements · 2 speakers · began 2026-11-14 20:00Z · latest 2026-11-14 20:14Z",
    speakers: [{ handle: "rig-ash", name: "rig-ash" }, { handle: "rig-bo", name: "rig-bo" }], door: { blocks }, reader: { roomId: "t1", hostOwnsHeader: true, faceForSpeaker, source: { async room() { return { error: "down" }; }, async circle() { return { error: "down" }; } } } });
  const host = element("div"); renderHomeColumn(doc, host, mk(faceHook([]))); await tick(); await tick();
  const row = find(host, (n) => n.className === "wv-homecol-speakers")[0];
  assert.deepEqual(row.children.map((s) => [s.attrs["data-speaker"], s.children[0].attrs["data-face"], text(s.children[1])]), [["rig-ash", "rig-ash", "rig-ash"], ["rig-bo", "rig-bo", "rig-bo"]], "face then name, per speaker");
  assert.equal(find(host, (n) => n.className === "wv-homecol-kicker")[0].attrs.title, "live: lasts the settlement");
  assert.equal(find(host, (n) => n.className === "wv-homecol-meta").length, 1, "the metadata is said once");
  assert.equal(find(host, (n) => n.tagName === "DL" || n.className === "wv-homecol-facts").length, 0, "no bottom fields table");
  assert.equal(find(host, (n) => n.className === "wv-homecol-byline").length, 0, "no repeated byline");
  const ps = find(host, (n) => n.tagName === "P" && n.children[0]?.attrs?.["data-face"]);
  assert.equal(ps.length, 3, "every legacy line wears a face");
  assert.notEqual(ps[0].children[0], ps[1].children[0], "a repeated speaker gets its own node");
  assert.match(text(ps[1]), /rig-ash: line 1/, "the words are intact");
  for (const bad of [() => { throw new Error("x"); }, () => "str", () => null]) {
    const h2 = element("div"); renderHomeColumn(doc, h2, mk(bad)); await tick(); await tick();
    assert.match(text(h2), /line 0.*line 1.*line 2/, "a hook that fails loses no words");
  }
  const bare = element("div"); renderHomeColumn(doc, bare, homeColumnModel({ handle: "the-town", kicker: "k", title: "T", door: { blocks } })); await tick();
  assert.equal(facesOf(bare).length, 0, "a column with no hook is today's");
  assert.equal(find(bare, (n) => n.className === "wv-homecol-speakers").length, 0);
});

test("WLD-215 · same-key fresh speech and late metadata: the speakers and the legacy lines follow in place, in this conversation only, without rebuilding the reader", async () => {
  const { createHomeColumn } = await import("../spectator/home-column.mjs");
  const host = element("div"); const col = createHomeColumn({ doc, host });
  const source = { async room() { return { error: "down" }; }, async circle() { return { error: "down" }; } };
  const line = (h, t) => ({ type: "paragraph", speaker: h, spans: [{ type: "text", text: `${h}: ${t}` }] });
  const view = (speakers, blocks, region) => ({ handle: "the-town", key: "convo:t1|circles", kicker: "k", title: "T", region, speakers, door: { blocks }, reader: { roomId: "t1", source, faceForSpeaker: faceHook([]), hostOwnsHeader: true } });
  col.open(view([], [line("rig-ash", "one")], "1 statement · 0 speakers")); await tick(); await tick();
  const reader = host.__circleReader;
  assert.equal(find(host, (n) => n.className === "wv-homecol-speakers").length, 1, "the row exists even before anyone is listed");
  col.open(view([{ handle: "rig-ash", name: "rig-ash" }, { handle: "rig-bo", name: "rig-bo" }], [line("rig-ash", "one"), line("rig-bo", "two")], "2 statements · 2 speakers"));
  assert.equal(host.__circleReader, reader, "same reader");
  assert.equal(facesOf(host).length, 4, "two header faces + two line faces after the new speech");
  assert.match(text(host), /rig-bo: two/);
  assert.equal(text(find(host, (n) => n.className === "wv-homecol-meta")[0]), "2 statements · 2 speakers");
  const before = find(host, (n) => n.className === "wv-homecol-speakers")[0].children[0];
  col.open(view([{ handle: "rig-ash", name: "rig-ash" }, { handle: "rig-bo", name: "rig-bo" }], [line("rig-ash", "one"), line("rig-bo", "two")], "2 statements · 2 speakers"));
  assert.equal(find(host, (n) => n.className === "wv-homecol-speakers")[0].children[0], before, "an unchanged redraw touches nothing");
});

// ── WLD-248 · the optional host-owned WHOLE speaker identity ────────────────
//
// The host (the Site's one shared identity form, CORE-178) hands back ONE fresh node holding a speaker's face AND name; the reader and the column put it where
// the face and the name went, once, and keep the time, the words, Reply, Open and the thread controls. The host owns how a human and a resident look; World
// knows neither. FALSIFIER: a duplicated or lost name, a node moved off an earlier line, an accessible name made aria-hidden, a human drawn as a resident,
// a bare / default / face-only host that changes, or a refusal (null, string, placed, reused, hidden, empty, throw) that is not exactly the old path.
const HUMANS = new Set(["pica", "rig-bo"]);   // the HOST's knowledge, invented: who it draws as a human; the reader is never told
const identityNode = (handle) => {
  const kind = HUMANS.has(handle) ? "human" : "resident";
  const n = element("span"); n.className = `rig-id rig-${kind}`; n.setAttribute("data-identity", handle); n.setAttribute("data-kind", kind);
  const face = element("span"); face.className = "rig-id-face"; face.setAttribute("aria-hidden", "true"); n.appendChild(face);   // the host's own face, inside its own node
  const name = element("span"); name.className = "rig-id-name"; name.textContent = handle; n.appendChild(name);
  return n;
};
const identityHook = (calls = [], made = []) => (handle) => { calls.push(handle); const n = identityNode(handle); made.push({ node: n, shape: shapeOf(n) }); return n; };
const idsOf248 = (root) => find(root, (n) => String(n.className).split(" ").includes("rig-id"));
const whoOfReply = (li) => byAttr(li, "data-reply")[0]?.attrs["aria-label"].replace(/^Reply to /, "");

test("WLD-248 · reader: a valid whole identity takes the place of face AND name on every line drawn (openers, full lines at every depth, context, old talk), once, with time, words and controls intact", async () => {
  const idCalls = [], faceCalls = [];
  const h = faceHost({ identityForSpeaker: identityHook(idCalls), faceForSpeaker: faceHook(faceCalls) });
  await h.reader.showRoom();
  const stubs = byAttr(h.root, "data-circle-stub");
  assert.equal(stubs.length, 3);
  for (const st of stubs) {
    const head = headOf(st);
    assert.deepEqual(head.children.map((c) => c.className.split(" ")[0]), ["rig-id", "cr-time"], "identity, then time: no face of the reader's, no name of its own");
    const who = head.children[0].attrs["data-identity"];
    assert.equal(text(head).split(who).length - 1, 1, "the name is said exactly once on the line's head");
    assert.equal(head.children[0].attrs["aria-hidden"], undefined, "the whole identity is the accessible name: never aria-hidden");
  }
  const bare = faceHost({}); await bare.reader.showRoom();
  for (const attrName of ["data-circle-open", "data-thread", "data-circle-stub"]) assert.equal(byAttr(h.root, attrName).length, byAttr(bare.root, attrName).length, `${attrName}: the controls are a bare host's`);
  assert.equal(faceCalls.length, 0, "with a valid identity the face hook is not asked: no extra face");
  assert.match(text(stubs[0]), /pica .*Welcome, everyone!/, "time and words follow the identity");

  const c = faceHost({ identityForSpeaker: identityHook(), faceForSpeaker: faceHook(), canReply: true });
  await c.reader.showCircle(50101); openAll(c.root);
  const lines = byAttr(c.root, "data-say");
  assert.equal(lines.length, 10);
  const nodes = lines.map((li) => headOf(li).children[0]);
  assert.ok(nodes.every((n) => n.className.startsWith("rig-id")), "every full line, at every depth");
  assert.deepEqual(nodes.map((n) => n.attrs["data-identity"]), lines.map(whoOfReply), "each line's identity is its own speaker's");
  assert.equal(new Set(nodes).size, nodes.length, "a repeated handle gets a node of its own");
  assert.ok(new Set(nodes.map((n) => n.attrs["data-identity"])).size < nodes.length, "the fixture does repeat speakers");
  assert.equal(find(c.root, (n) => n.className === "cr-who").length, 0, "no second name anywhere");
  assert.equal(byAttr(c.root, "data-reply").length, 10, "Reply on every line");

  const ctx = faceHost({ identityForSpeaker: identityHook() });
  await ctx.reader.showCircle(50105);
  const ctxLines = byAttr(byAttr(ctx.root, "data-context")[0], "data-context-say");
  assert.ok(ctxLines.length >= 1 && ctxLines.every((li) => headOf(li).children[0].className.startsWith("rig-id")), "context lines");

  const old = faceHost({ identityForSpeaker: identityHook() }, { room: legacyRoom });
  await old.reader.showRoom();
  const plain = byAttr(old.root, "data-say-plain");
  assert.equal(plain.length, 2);
  for (const li of plain) assert.deepEqual(headOf(li).children.map((x) => x.className.split(" ")[0]), ["rig-id", "cr-time"], "old talk too");
  assert.match(text(old.root), /rei.*Claran, hello.*claran.*hi rei/, "the words are intact");
});

test("WLD-248 · reader: every refused result is exactly the old path, with a face host and with a bare one", async () => {
  const placed = () => (h) => { const p = element("div"); const n = identityNode(h); p.appendChild(n); return n; };
  const hidden = () => (h) => { const n = identityNode(h); n.setAttribute("aria-hidden", "true"); return n; };
  const empty = () => () => element("span");
  const variants = { null: () => () => null, undefined: () => () => undefined, "a string": () => () => "<b>pica</b>", "not a node": () => () => ({ nodeType: 3, textContent: "pica" }),
    "a throw": () => () => { throw new Error("no identity"); }, "an already placed node": placed, "an aria-hidden node": hidden, "a node with no name": empty, "a non-function option": () => "pica" };
  const draw = async (opts) => { const h = faceHost(opts); await h.reader.showCircle(50101); openAll(h.root); const r = faceHost(opts); await r.reader.showRoom(); return shapeOf(h.root) + shapeOf(r.root); };
  const faceOnly = await draw({ faceForSpeaker: faceHook() });
  const bare = await draw({});
  for (const [name, make] of Object.entries(variants)) {
    assert.equal(await draw({ faceForSpeaker: faceHook(), identityForSpeaker: make() }), faceOnly, `${name}: the face host's DOM, exactly`);
    assert.equal(await draw({ identityForSpeaker: make() }), bare, `${name}: a bare host's DOM, exactly`);
  }
});

test("WLD-248 · reader: a reused node is never moved — a caching host's repeat falls back to face + name, and a redraw never re-places an earlier node", async () => {
  const cache = new Map(), first = new Map();
  const caching = (h) => { if (!cache.has(h)) cache.set(h, identityNode(h)); return cache.get(h); };
  const h = faceHost({ identityForSpeaker: caching, faceForSpeaker: faceHook(), canReply: true });
  await h.reader.showCircle(50101);
  for (const n of idsOf248(h.root)) first.set(n, n.parent);
  assert.equal(first.size, 1, "folded: the opener took its node");
  openAll(h.root);   // every press redraws: the cached nodes come back and must be refused
  for (const [n, parent] of first) assert.equal(n.parent, parent, "the node stayed where it was first placed: never moved");
  const lines = byAttr(h.root, "data-say");
  for (const li of lines) {
    const head = headOf(li);
    const names = head.children.filter((x) => x.className === "cr-who" || x.className.startsWith("rig-id"));
    assert.equal(names.length, 1, "one name on every line: none lost, none doubled");
    if (names[0].className === "cr-who") assert.equal(head.children[0].className, "rig-face", "the fallback is the old face + name");
  }
  assert.equal(idsOf248(h.root).length, 0, "after the redraw no cached node is on screen");
  // a host that takes its node back (detaches it) and hands it out again: unparented, but placed before, so it would be MOVED off the earlier line
  const kept = new Map();
  const takesBack = (hd) => { const n = kept.get(hd) ?? identityNode(hd); kept.set(hd, n); n.parent?.removeChild(n); return n; };
  const t = faceHost({ identityForSpeaker: takesBack, faceForSpeaker: faceHook() });
  await t.reader.showRoom();
  const before = idsOf248(t.root);
  assert.equal(before.length, 3, "three openers, three distinct speakers, three nodes");
  const homes = before.map((n) => n.parent);
  await t.reader.showRoom();
  assert.equal(idsOf248(t.root).length, 0, "the second draw refuses every node it was handed before");
  assert.equal(byAttr(t.root, "data-circle-stub").every((li) => headOf(li).children.some((x) => x.className === "cr-who")), true, "and names each opener the old way");
  assert.deepEqual(before.map((n) => n.parent === null || homes.includes(n.parent)), before.map(() => true), "a node is only ever where it was first placed (or taken back by its host), never on a new line");
});

test("WLD-248 · human and resident: the host's own node is placed exactly as it was made — a human stays human, a resident stays a resident", async () => {
  const made = [];
  const h = faceHost({ identityForSpeaker: identityHook([], made) });
  await h.reader.showCircle(50101); openAll(h.root);
  const onScreen = idsOf248(h.root);
  assert.ok(onScreen.some((n) => n.attrs["data-kind"] === "human") && onScreen.some((n) => n.attrs["data-kind"] === "resident"), "the fixture has both");
  for (const n of onScreen) {
    const m = made.find((x) => x.node === n);
    assert.ok(m, "every identity on screen is one the host made");
    assert.equal(shapeOf(n), m.shape, "unchanged by the reader: no class, attribute, aria-hidden or child added or taken");
    assert.equal(n.attrs["data-kind"], HUMANS.has(n.attrs["data-identity"]) ? "human" : "resident");
  }
});

test("WLD-248 · bare, default and face-only hosts are unchanged, and the hook reads nothing", async () => {
  for (const base of [{}, { faceForSpeaker: faceHook() }]) {
    const a = faceHost(base); await a.reader.showCircle(50101); openAll(a.root);
    const b = faceHost({ ...base, identityForSpeaker: null }); await b.reader.showCircle(50101); openAll(b.root);
    assert.equal(shapeOf(b.root), shapeOf(a.root), "identityForSpeaker: null is no option");
  }
  const bare = faceHost({}); await bare.reader.showRoom(); byAttr(bare.root, "data-circle-open", 50101)[0].click(); await tick(); openAll(bare.root);
  const withId = faceHost({ identityForSpeaker: identityHook() }); await withId.reader.showRoom(); byAttr(withId.root, "data-circle-open", 50101)[0].click(); await tick(); openAll(withId.root);
  assert.deepEqual(withId.calls, bare.calls, "the same office reads, in the same order: no identity or profile read of the reader's own");
});

// the column: its header's speakers, its plain transcript (the page's own shape: the name in a leading strong span), and the reader it hosts
const COLUMN_BLOCKS = () => [
  ...["rig-ash", "rig-ash", "rig-bo"].map((h, i) => ({ type: "paragraph", speaker: h, spans: [{ type: "strong", spans: [{ type: "text", text: h }] }, { type: "text", text: ` (2026-11-14 20:0${i}Z): line ${i}` }] })),
  { type: "paragraph", speaker: "rig-bo", spans: [{ type: "text", text: "rig-bo: a line shaped otherwise" }] },
];
const columnModel = async (reader, blocks = COLUMN_BLOCKS()) => {
  const { homeColumnModel } = await import("../spectator/home-column.mjs");
  return homeColumnModel({ handle: "the-town", byline: false, kicker: "a conversation", title: "Cave Interior", speakers: [{ handle: "rig-ash", name: "rig-ash" }, { handle: "rig-bo", name: "rig-bo" }],
    door: { blocks }, reader: { roomId: "t1", hostOwnsHeader: true, source: { async room() { return { error: "down" }; }, async circle() { return { error: "down" }; } }, ...reader } });
};

test("WLD-248 · column: the speakers row and the plain transcript take the identity once, a line shaped otherwise keeps the old path, and the column's reader gets it too", async () => {
  const { renderHomeColumn, homeColumnModel } = await import("../spectator/home-column.mjs");
  const faceCalls = [];
  const host = element("div"); renderHomeColumn(doc, host, await columnModel({ identityForSpeaker: identityHook(), faceForSpeaker: faceHook(faceCalls) })); await tick(); await tick();
  const row = find(host, (n) => n.className === "wv-homecol-speakers")[0];
  assert.deepEqual(row.children.map((s) => [s.attrs["data-speaker"], s.children.length, s.children[0].className, text(s)]),
    [["rig-ash", 1, "rig-id rig-resident", "rig-ash"], ["rig-bo", 1, "rig-id rig-human", "rig-bo"]], "one node per speaker, holding face and name: no extra face, no second name");
  const ps = find(host, (n) => n.tagName === "P" && String(n.children[0]?.className ?? "").startsWith("rig-id"));
  assert.equal(ps.length, 3, "the three page-shaped lines wear the identity");
  assert.deepEqual(ps.map(text), ["rig-ash (2026-11-14 20:00Z): line 0", "rig-ash (2026-11-14 20:01Z): line 1", "rig-bo (2026-11-14 20:02Z): line 2"], "the name once, then time and words");
  assert.ok(ps.every((p) => !find(p, (n) => n.tagName === "STRONG").length && !byAttr(p, "data-face").length), "the leading name and the face are not drawn as well");
  assert.notEqual(ps[0].children[0], ps[1].children[0], "a repeated speaker gets its own node");
  const other = find(host, (n) => n.tagName === "P" && /shaped otherwise/.test(text(n)))[0];
  assert.equal(other.children[0].attrs["data-face"], "rig-bo", "a line not in the page's shape keeps the old face + name path");
  assert.equal(text(other), "rig-bo: a line shaped otherwise");
  assert.deepEqual(faceCalls, ["rig-bo"], "the face hook was asked only for that line");
  // the reader the column hosts takes the identity on its own lines
  const working = homeColumnModel({ handle: "the-town", kicker: "k", title: "T", door: { blocks: [] }, reader: { roomId: "t1", identityForSpeaker: identityHook(), source: { async room() { return roomFind(); }, async circle() { return circle50101(); } } } });
  const h2 = element("div"); renderHomeColumn(doc, h2, working); await tick(); await tick();
  assert.equal(idsOf248(h2).length, 3, "the column's reader placed an identity on each opener");
  assert.equal(find(h2, (n) => n.className === "cr-who").length, 0);
});

test("WLD-248 · column: each refused result is exactly the face host's column, and a host with neither hook is today's", async () => {
  const { renderHomeColumn } = await import("../spectator/home-column.mjs");
  const draw = async (reader) => { const host = element("div"); renderHomeColumn(doc, host, await columnModel(reader)); await tick(); await tick(); return shapeOf(host); };
  const faceOnly = await draw({ faceForSpeaker: faceHook() });
  const bare = await draw({});
  for (const bad of [() => null, () => "<b>x</b>", () => { throw new Error("x"); }, (h) => { const n = identityNode(h); n.setAttribute("aria-hidden", "true"); return n; }, () => element("span"),
    (h) => { const p = element("div"); const n = identityNode(h); p.appendChild(n); return n; }]) {
    assert.equal(await draw({ faceForSpeaker: faceHook(), identityForSpeaker: bad }), faceOnly, "a refused identity is the face host's column");
    assert.equal(await draw({ identityForSpeaker: bad }), bare, "and with no face hook, the bare column");
  }
  assert.equal(await draw({ identityForSpeaker: null }), bare, "an explicit null is no option");
});

test("WLD-248 · column live update: same-key fresh speech redraws the speakers and the plain lines with fresh identities, without rebuilding the reader", async () => {
  const { createHomeColumn } = await import("../spectator/home-column.mjs");
  const host = element("div"); const col = createHomeColumn({ doc, host });
  const source = { async room() { return { error: "down" }; }, async circle() { return { error: "down" }; } };
  const line = (h, t) => ({ type: "paragraph", speaker: h, spans: [{ type: "strong", spans: [{ type: "text", text: h }] }, { type: "text", text: `: ${t}` }] });
  const view = (speakers, blocks) => ({ handle: "the-town", key: "convo:t1|circles", kicker: "k", title: "T", region: "r", speakers, door: { blocks }, reader: { roomId: "t1", source, identityForSpeaker: identityHook(), faceForSpeaker: faceHook(), hostOwnsHeader: true } });
  col.open(view([{ handle: "rig-ash", name: "rig-ash" }], [line("rig-ash", "one")])); await tick(); await tick();
  const reader = host.__circleReader;
  const firstIds = idsOf248(host);
  assert.equal(firstIds.length, 2, "one in the row, one on the line");
  col.open(view([{ handle: "rig-ash", name: "rig-ash" }, { handle: "rig-bo", name: "rig-bo" }], [line("rig-ash", "one"), line("rig-bo", "two")]));
  assert.equal(host.__circleReader, reader, "same reader");
  const ids = idsOf248(host);
  assert.equal(ids.length, 4, "two in the row, two on the lines");
  assert.equal(facesOf(host).length, 0, "no extra face");
  assert.ok(ids.every((n) => !firstIds.includes(n)), "fresh nodes: nothing carried over from the earlier draw");
  assert.match(text(host), /rig-ash: one.*rig-bo: two/);
});

test("WLD-248 · a leading strong that is not exactly the speaker's name is never replaced: other text, or two inner spans, keeps the old face + words", async () => {
  const { renderHomeColumn } = await import("../spectator/home-column.mjs");
  const blocks = [
    { type: "paragraph", speaker: "rig-ash", spans: [{ type: "strong", spans: [{ type: "text", text: "Note" }] }, { type: "text", text: ": the bell rang" }] },
    { type: "paragraph", speaker: "rig-ash", spans: [{ type: "strong", spans: [{ type: "text", text: "rig-ash" }, { type: "em", spans: [{ type: "text", text: " (host)" }] }] }, { type: "text", text: ": hello" }] },
  ];
  const draw = async (reader) => { const host = element("div"); renderHomeColumn(doc, host, await columnModel(reader, blocks)); await tick(); await tick(); return host; };
  const withId = await draw({ identityForSpeaker: identityHook(), faceForSpeaker: faceHook() });
  const faceOnly = await draw({ faceForSpeaker: faceHook() });
  const ps = (h) => find(h, (n) => n.tagName === "P" && /bell rang|hello/.test(text(n)));
  assert.deepEqual(ps(withId).map(text), ["Note: the bell rang", "rig-ash (host): hello"], "no authored text is lost to the identity");
  assert.ok(ps(withId).every((p) => p.children[0].attrs["data-face"] === "rig-ash" && !String(p.children[0].className).startsWith("rig-id")), "both keep the old face path");
  assert.equal(ps(withId).map(shapeOf).join(""), ps(faceOnly).map(shapeOf).join(""), "exactly the face host's lines");
});

// FOCUS (the FIX at 9a1098c5): a link inside a host identity keeps keyboard focus through the reader's redraws and the column's same-key rebuilds, on the SAME
// line's fresh node (repeated speakers included), with no key of World's on the host's node. The five probes failed at 9a1098c5; the two controls passed there.
const linkIdentity = (handle) => {
  const n = element("span"); n.className = "rig-id"; n.setAttribute("data-identity", handle);
  const face = element("span"); face.className = "rig-id-face"; face.setAttribute("aria-hidden", "true"); n.appendChild(face);
  const a = element("a"); a.className = "rig-id-link"; a.setAttribute("href", `/residents/${handle}`);
  const name = element("span"); name.className = "rig-id-name"; name.textContent = handle; a.appendChild(name);   // the name nested inside the link
  n.appendChild(a);
  return n;
};
const linksIn = (n) => find(n, (x) => x.className === "rig-id-link");
const lineOf = (n) => { for (let p = n; p; p = p.parent) if (p.attrs?.["data-say"] !== undefined || p.attrs?.["data-say-plain"] !== undefined) return p; return null; };
const assertRefocused = (root, old, line, why) => {
  const a = doc.activeElement;
  assert.ok(a && a.className === "rig-id-link", `${why}: focus is on an identity link (got ${a ? a.className || a.tagName : "nothing"})`);
  assert.notEqual(a, old, `${why}: a FRESH link, not the old node`);
  assert.ok(root.contains(a), `${why}: connected, inside the reader as drawn now`);
  assert.equal(lineOf(a)?.attrs["data-say"], line, `${why}: on the same line, not another occurrence of the handle`);
  assert.ok(!a.attrs["data-key"] && !Object.keys(a.parent.attrs).some((k) => k === "data-key"), `${why}: nothing of World's was stamped on the host's node`);
  assert.deepEqual(doc.lastFocusOptions, { preventScroll: true }, `${why}: refocused without scrolling`);
};

test("WLD-248 · FOCUS CONTROL · room view: a keyed control (Open) keeps focus through a quiet refresh with a link-identity host", async () => {
  const h = faceHost({ identityForSpeaker: linkIdentity });
  await h.reader.showRoom();
  const open = byAttr(h.root, "data-circle-open", 50101)[0]; open.focus();
  doc.lastFocusOptions = "unset";
  await h.reader.refresh({ quiet: true });
  assert.equal(doc.activeElement?.attrs["data-circle-open"], "50101");
  assert.ok(h.root.contains(doc.activeElement));
  assert.equal(doc.lastFocusOptions, undefined, "the old keyed restore is untouched: a plain focus(), as before");
});

test("WLD-248 · FOCUS · the fallback: when the fresh identity is shaped differently, focus goes to its first focusable element, still without scrolling", async () => {
  let draws = 0;
  const reshaping = (handle) => {
    const n = linkIdentity(handle);
    if (++draws > 3) { const wrap = element("span"); wrap.className = "rig-id-wrap"; const a = n.children[1]; n.removeChild(a); wrap.appendChild(a); n.appendChild(wrap); }   // later draws nest the link one deeper
    return n;
  };
  const h = faceHost({ identityForSpeaker: reshaping });
  await h.reader.showRoom();
  const stub = byAttr(h.root, "data-circle-stub")[2]; const old = linksIn(stub)[0]; old.focus();
  await h.reader.refresh({ quiet: true });
  const a = doc.activeElement;
  assert.ok(find(a.parent, (x) => x === a).length && a.parent.className === "rig-id-wrap", "the old path no longer reaches the link: the fallback found it");
  assertRefocused(h.root, old, stub.attrs["data-say"], "fallback");
});

test("WLD-248 · FOCUS PROBE · room view: focus on an opener's identity link survives a quiet refresh", async () => {
  const h = faceHost({ identityForSpeaker: linkIdentity });
  await h.reader.showRoom();
  const stub = byAttr(h.root, "data-circle-stub")[1]; const old = linksIn(stub)[0]; old.focus();
  assert.equal(doc.activeElement, old, "the identity link has focus");
  await h.reader.refresh({ quiet: true });
  assert.notEqual(linksIn(byAttr(h.root, "data-circle-stub")[1])[0], old, "the refresh placed a fresh identity");
  assertRefocused(h.root, old, stub.attrs["data-say"], "room refresh");
});

test("WLD-248 · FOCUS PROBE · circle view: focus on a REPEATED speaker's later line returns to that line's fresh link after a refresh", async () => {
  const h = faceHost({ identityForSpeaker: linkIdentity });
  await h.reader.showCircle(50101); openAll(h.root);
  const picas = byAttr(h.root, "data-say").filter((li) => linksIn(li)[0]?.parent.attrs["data-identity"] === "pica");
  assert.ok(picas.length >= 2, "pica speaks more than once");
  const target = picas[picas.length - 1]; const old = linksIn(target)[0]; old.focus();
  await h.reader.refresh({ quiet: true });
  assertRefocused(h.root, old, target.attrs["data-say"], "circle refresh, a repeated speaker");
});

test("WLD-248 · FOCUS PROBE · setCanReply's redraw keeps focus on the same line's fresh identity link", async () => {
  const h = faceHost({ identityForSpeaker: linkIdentity });
  await h.reader.showCircle(50101); openAll(h.root);
  const target = byAttr(h.root, "data-say")[3]; const old = linksIn(target)[0]; old.focus();
  h.reader.setCanReply(true, () => {});
  assert.equal(byAttr(h.root, "data-reply").length, 10, "the redraw happened (Reply on every line)");
  assertRefocused(h.root, old, target.attrs["data-say"], "setCanReply");
});

const liveColumn = async () => {
  const { createHomeColumn } = await import("../spectator/home-column.mjs");
  const host = element("div"); const col = createHomeColumn({ doc, host });
  const source = { async room() { return { error: "down" }; }, async circle() { return { error: "down" }; } };
  const line = (h, t) => ({ type: "paragraph", speaker: h, spans: [{ type: "strong", spans: [{ type: "text", text: h }] }, { type: "text", text: `: ${t}` }] });
  const view = (speakers, blocks) => ({ handle: "the-town", key: "convo:t1|circles", kicker: "k", title: "T", region: "r", speakers, door: { blocks }, reader: { roomId: "t1", source, identityForSpeaker: linkIdentity, hostOwnsHeader: true } });
  return { host, col, line, view };
};
const rowLinks = (host) => linksIn(find(host, (n) => n.className === "wv-homecol-speakers")[0]);

test("WLD-248 · FOCUS CONTROL · column: an unchanged same-key redraw leaves the row's identity link focused (nothing is rebuilt)", async () => {
  const { host, col, line, view } = await liveColumn();
  const v = () => view([{ handle: "rig-ash", name: "rig-ash" }], [line("rig-ash", "one")]);
  col.open(v()); await tick(); await tick();
  const old = rowLinks(host)[0]; old.focus();
  col.open(v());
  assert.equal(doc.activeElement, old, "the same node, still focused");
});

test("WLD-248 · FOCUS PROBE · column: a new speaker arrives; focus stays on the same speaker's FRESH row link", async () => {
  const { host, col, line, view } = await liveColumn();
  col.open(view([{ handle: "rig-ash", name: "rig-ash" }], [line("rig-ash", "one")])); await tick(); await tick();
  const old = rowLinks(host)[0]; old.focus();
  col.open(view([{ handle: "rig-ash", name: "rig-ash" }, { handle: "rig-bo", name: "rig-bo" }], [line("rig-ash", "one")]));
  const a = doc.activeElement;
  assert.equal(rowLinks(host).length, 2, "the row was rebuilt with the new speaker");
  assert.ok(a && a !== old && rowLinks(host).includes(a), "a fresh, connected row link has focus");
  assert.equal(a.parent.attrs["data-identity"], "rig-ash", "the same speaker's, not the newcomer's");
  assert.deepEqual(doc.lastFocusOptions, { preventScroll: true }, "without scrolling the column");
});

test("WLD-248 · FOCUS PROBE · column: new speech arrives; focus stays on the same plain line's FRESH link, not the speaker's first line", async () => {
  const { host, col, line, view } = await liveColumn();
  const sp = [{ handle: "rig-ash", name: "rig-ash" }];
  col.open(view(sp, [line("rig-ash", "one"), line("rig-ash", "two")])); await tick(); await tick();
  const body = find(host, (n) => n.className === "wv-homecol-body")[0];
  const second = find(body, (n) => n.tagName === "P" && /two/.test(text(n)))[0];
  const old = linksIn(second)[0]; old.focus();
  col.open(view(sp, [line("rig-ash", "one"), line("rig-ash", "two"), line("rig-ash", "three")]));
  const a = doc.activeElement;
  assert.ok(a && a !== old && body.contains(a), "a fresh, connected link has focus");
  let p = a; while (p && p.tagName !== "P") p = p.parent;
  assert.equal(text(p), "rig-ash: two", "the same line (the second of the repeated speaker's), not the first");
  assert.deepEqual(doc.lastFocusOptions, { preventScroll: true }, "without scrolling the column");
});

test("WLD-248 · FOCUS · a late picture (the page's `look` changes, the words do not): the line still redraws, and focus stays on the same line's fresh link", async () => {
  const { host, col, view } = await liveColumn();
  // the World page's own shape (viewer.mjs § convoColumnView): `look` = the speaker's picture once it is known, else their colour
  const line = (h, t, look) => ({ type: "paragraph", speaker: h, look, spans: [{ type: "strong", spans: [{ type: "text", text: h }] }, { type: "text", text: `: ${t}` }] });
  const sp = [{ handle: "rig-ash", name: "rig-ash" }];
  col.open(view(sp, [line("rig-ash", "one", "#c0ffee"), line("rig-ash", "two", "#c0ffee")])); await tick(); await tick();
  const body = find(host, (n) => n.className === "wv-homecol-body")[0];
  const second = find(body, (n) => n.tagName === "P" && /two/.test(text(n)))[0];
  const old = linksIn(second)[0]; old.focus();
  col.open(view(sp, [line("rig-ash", "one", "/shelf/rig-ash.png"), line("rig-ash", "two", "/shelf/rig-ash.png")]));
  assert.ok(!body.contains(old), "the line was redrawn (the picture is part of the redraw signature, as before)");
  const a = doc.activeElement;
  assert.ok(a && a !== old && body.contains(a) && a.className === "rig-id-link", "a fresh, connected identity link has focus");
  let p = a; while (p && p.tagName !== "P") p = p.parent;
  assert.equal(text(p), "rig-ash: two", "the same line (the repeated speaker's second), not the first");
  assert.deepEqual(doc.lastFocusOptions, { preventScroll: true }, "without scrolling the column");
});

// ── WLD-249 · the REAL shell's entry: setViewerIdentityForSpeaker(appEl, provider|null) ──────────────────────────────────────────────
//
// The verbatim shell calls `mountViewer(app)` with one argument, so the host sets its identity provider per app element through the viewer module's
// public setter, before the mount or after it; the mounted viewer reads it through one stable function at every draw and, on every setter call,
// relabels its open conversation in place (column speakers row, plain lines, the reader's bylines). FALSIFIER: the shell cannot reach the provider; arrival
// order changes the result; an open label stays stale (even when only the provider's data changed); another viewer picks the provider up; a relabel
// remounts, re-reads, or loses scroll, focus, threads or selection; null does not return the default exactly.
//
// mountViewer needs a whole browser page (tools/room-fit.test.mjs says why there is no DOM to mount it here), so its WLD-249 wiring is pinned in its source,
// and the path past it is driven for real: the viewer's own adapter functions, the real column and reader, and a conversation view in convoColumnView's shape.
const VIEWER_SRC = async () => (await import("node:fs")).readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

test("WLD-249 · the shell's path: the viewer module exports the setter, the one-argument shell boot is untouched, and mountViewer wires the provider through to the conversation and its relabel", async () => {
  const viewer = await import("../spectator/viewer.mjs");
  const adapter = await import("../spectator/viewer-identity.mjs");
  assert.equal(viewer.setViewerIdentityForSpeaker, adapter.setViewerIdentityForSpeaker, "the shell's own module exports the one entry");
  const shell = (await import("node:fs")).readFileSync(new URL("../spectator/index.html", import.meta.url), "utf8");
  assert.match(shell, /mountViewer\(document\.getElementById\("app"\)\);/, "the verbatim one-argument boot is unchanged");
  const SRC = await VIEWER_SRC();
  const mount = SRC.slice(SRC.indexOf("export function mountViewer(appEl)"), SRC.indexOf("const shadowHost = appEl;"));
  assert.match(mount, /const identityForSpeaker = viewerIdentityFor\(appEl\);/, "the viewer takes ITS element's stable provider function at mount");
  const cv = SRC.slice(SRC.indexOf("function convoColumnView"), SRC.indexOf("// What a plain click or hover on the map means for a thread"));
  assert.match(cv, /faceForSpeaker: \(h\) => \{[^\n]*\n\s*identityForSpeaker \},/, "the conversation's reader option carries it, beside the page's own face");
  assert.match(SRC, /const offViewerIdentity = onViewerIdentity\(appEl, \(\) => \{ if \(!stopped\) homeColumn\.refreshIdentities\(\); \}\);/, "a setter call relabels the open column, and only that");
  const stop = SRC.slice(SRC.indexOf("    stop: () => {"), SRC.indexOf("try { window.__pmViewer = handle; }"));
  assert.match(stop, /offViewerIdentity\(\);/, "a stopped viewer unsubscribes");
  assert.throws(() => viewer.setViewerIdentityForSpeaker(null, () => null), /host element/, "no element, no entry");
});

/** what mountViewer does with WLD-249, on the real column (its two lines, pinned above), and convoColumnView's view of a conversation */
const mountLike = async (app, { working = true } = {}) => {
  const { viewerIdentityFor, onViewerIdentity } = await import("../spectator/viewer-identity.mjs");
  const { createHomeColumn } = await import("../spectator/home-column.mjs");
  const identityForSpeaker = viewerIdentityFor(app);
  const host = element("div"); host.collapses = true; const col = createHomeColumn({ doc, host });
  let stopped = false;
  const off = onViewerIdentity(app, () => { if (!stopped) col.refreshIdentities(); });
  const calls = [];
  const source = working
    ? { async room(id) { calls.push(["room", id]); return roomFind(); }, async circle(id, after) { calls.push(["circle", id, after]); return id === 50101 ? circle50101() : { error: "bounce" }; } }
    : { async room(id) { calls.push(["room", id]); return { error: "down" }; }, async circle(id) { calls.push(["circle", id]); return { error: "down" }; } };
  const line = (h, t) => ({ type: "paragraph", speaker: h, look: "#c0ffee", spans: [{ type: "strong", spans: [{ type: "text", text: h }] }, { type: "text", text: ` (2026-11-14 20:0${t}Z): line ${t}` }] });
  const view = () => ({ key: "convo:t1|circles", handle: "the-town", residentLink: false, kicker: "a conversation · live", title: "Cave Interior", region: "3 statements · 2 speakers", byline: false,
    speakers: [{ handle: "pica", name: "pica", look: "#c0ffee" }, { handle: "seth", name: "seth", look: "#c0ffee" }],
    door: { blocks: [line("pica", 1), line("seth", 2), line("pica", 3)] },
    reader: { roomId: "t1", source, canReply: false, hostOwnsHeader: true, faceForSpeaker: faceHook(), identityForSpeaker } });
  return { host, col, calls, view, open: async () => { col.open(view()); await tick(); await tick(); }, stop: () => { stopped = true; off(); } };
};
const labelsOf = (host) => {
  const row = find(host, (n) => n.className === "wv-homecol-speakers")[0];
  const reader = find(host, (n) => n.className === "wv-homecol-reader")[0];
  const body = find(host, (n) => n.className === "wv-homecol-body")[0];
  return { row: idsOf248(row).length, reader: idsOf248(reader).length, plain: idsOf248(body).length, faces: facesOf(host).length };
};

test("WLD-249 · both arrival orders: a provider set BEFORE the mount and one set AFTER it (the column already open) end in the same labels", async () => {
  const { setViewerIdentityForSpeaker } = await import("../spectator/viewer.mjs");
  const before = element("div");
  setViewerIdentityForSpeaker(before, identityNode);
  const a = await mountLike(before); await a.open();
  assert.deepEqual(labelsOf(a.host), { row: 2, reader: 3, plain: 3, faces: 0 }, "provider first: every label is the host's identity, no extra face");

  const after = element("div");
  const b = await mountLike(after); await b.open();
  assert.deepEqual(labelsOf(b.host), { row: 0, reader: 0, plain: 0, faces: 2 + 3 + 3 }, "no provider yet: the page's own faces and names, as ever");
  const reader = b.host.__circleReader, callsBefore = b.calls.length;
  setViewerIdentityForSpeaker(after, identityNode);
  assert.deepEqual(labelsOf(b.host), { row: 2, reader: 3, plain: 3, faces: 0 }, "provider second: the open labels were relabelled in place");
  assert.equal(b.host.__circleReader, reader, "the same reader: no remount");
  assert.equal(b.calls.length, callsBefore, "and no read of the office");
  assert.equal(shapeOf(b.host), shapeOf(a.host), "the arrival order makes no difference to what is drawn");
});

test("WLD-249 · the same function again: its data changed, and every open label takes the CURRENT data in fresh nodes", async () => {
  const { setViewerIdentityForSpeaker } = await import("../spectator/viewer.mjs");
  const names = { pica: "Pica", seth: "Seth" };
  const provider = (h) => { const n = identityNode(h); n.children[1].textContent = names[h] ?? h; return n; };
  const app = element("div"); setViewerIdentityForSpeaker(app, provider);
  const v = await mountLike(app); await v.open();
  const current = (n) => text(n) === (names[n.attrs["data-identity"]] ?? n.attrs["data-identity"]);
  const old = idsOf248(v.host);
  assert.ok(old.length === 8 && old.every(current), "drawn with the first data");
  assert.ok(old.some((n) => text(n) === "Pica"), "the fixture shows pica");
  names.pica = "Pica of the Cave"; names.seth = "Seth (away)";
  setViewerIdentityForSpeaker(app, provider);   // the same function: only its data moved
  const now = idsOf248(v.host);
  assert.equal(now.length, 8);
  assert.ok(now.every((n) => !old.includes(n)), "fresh nodes everywhere");
  assert.ok(now.every(current), "every label shows the CURRENT data");
  assert.ok(!now.some((n) => text(n) === "Pica" || text(n) === "Seth"), "no label still shows an old name");
});

test("WLD-249 · state survives a relabel: the reader's scroll and open thread, the column's scroll, and a focused identity link on a repeated speaker's later line", async () => {
  const { setViewerIdentityForSpeaker } = await import("../spectator/viewer.mjs");
  const app = element("div"); setViewerIdentityForSpeaker(app, linkIdentity);
  const v = await mountLike(app); await v.open();
  const mount = find(v.host, (n) => n.className === "wv-homecol-reader")[0]; mount.collapses = true;
  byAttr(v.host, "data-circle-open", 50101)[0].click(); await tick(); await tick();
  openAll(v.host);
  const openThreads = byAttr(v.host, "data-thread").filter((t) => t.attrs["data-open"] === "true").map((t) => t.attrs["data-thread"]);
  assert.ok(openThreads.length >= 2, "threads opened by the visitor");
  const picas = byAttr(v.host, "data-say").filter((li) => linksIn(li)[0]?.parent.attrs["data-identity"] === "pica");
  assert.ok(picas.length >= 2, "pica speaks more than once on screen");
  const target = picas[picas.length - 1]; const old = linksIn(target)[0]; old.focus();
  const colScroll = find(v.host, (n) => n.className === "wv-homecol-scroll")[0]; colScroll.collapses = true;   // the column's own scroller forgets on teardown, as a browser's may
  mount.scrollTop = 140; colScroll.scrollTop = 60;
  const callsBefore = v.calls.length;
  setViewerIdentityForSpeaker(app, linkIdentity);
  assert.equal(mount.scrollTop, 140, "the reader's scroll is put back");
  assert.equal(colScroll.scrollTop, 60, "the column's scroll is put back");
  assert.deepEqual(byAttr(v.host, "data-thread").filter((t) => t.attrs["data-open"] === "true").map((t) => t.attrs["data-thread"]), openThreads, "the open threads stay open");
  assert.equal(v.host.__circleReader.getState().view, "circle", "the reader is still on the conversation it was showing");
  assertRefocused(v.host, old, target.attrs["data-say"], "relabel");
  assert.equal(v.calls.length, callsBefore, "nothing was read");
});

test("WLD-249 · null (and a non-function) returns the default EXACTLY; two viewers never share a provider; a stopped viewer is told nothing", async () => {
  const { setViewerIdentityForSpeaker } = await import("../spectator/viewer.mjs");
  const plain = element("div"); const ref = await mountLike(plain); await ref.open();
  const app = element("div"); setViewerIdentityForSpeaker(app, identityNode);
  const v = await mountLike(app); await v.open();
  setViewerIdentityForSpeaker(app, null);
  assert.equal(shapeOf(v.host), shapeOf(ref.host), "null: the never-provided viewer's DOM, exactly");
  setViewerIdentityForSpeaker(app, identityNode); setViewerIdentityForSpeaker(app, "not a function");
  assert.equal(shapeOf(v.host), shapeOf(ref.host), "a non-function is null");

  const a = element("div"), b = element("div");
  const va = await mountLike(a), vb = await mountLike(b); await va.open(); await vb.open();
  const bNodes = find(vb.host, () => true);
  setViewerIdentityForSpeaker(a, identityNode);
  assert.equal(labelsOf(va.host).row, 2, "viewer A took its provider");
  assert.deepEqual(labelsOf(vb.host), { row: 0, reader: 0, plain: 0, faces: 8 }, "viewer B did not");
  assert.deepEqual(find(vb.host, () => true), bNodes, "and B was not even redrawn");

  const s = element("div"); const vs = await mountLike(s); await vs.open();
  vs.stop();
  setViewerIdentityForSpeaker(s, identityNode);
  assert.equal(labelsOf(vs.host).row, 0, "a stopped viewer is not relabelled");
});

test("WLD-249 · the plain fallback a failed read shows is relabelled too, and a column showing no conversation has nothing to relabel", async () => {
  const { setViewerIdentityForSpeaker } = await import("../spectator/viewer.mjs");
  const app = element("div");
  const v = await mountLike(app, { working: false }); await v.open();
  const body = find(v.host, (n) => n.className === "wv-homecol-body")[0];
  assert.equal(body.hidden, false, "the reader could not read the room: the plain lines are what is shown");
  setViewerIdentityForSpeaker(app, identityNode);
  assert.deepEqual(text(body).match(/line \d/g), ["line 1", "line 2", "line 3"], "no words lost");
  assert.equal(idsOf248(body).length, 3, "every shown plain line wears the identity now");
  v.col.close();
  assert.equal(v.col.refreshIdentities(), false, "closed: nothing to do");
});

// ── WLD-256: the circle's generated title and its named breadcrumbs (CORE-178, Darko: "Current name and face") ──────────────────────────────────
//
// The opened circle's title and every NAMED crumb ("pica's statement") put the host's whole identity where the handle stood, then the reader's own words
// "'s statement". An ancestor crumb is the reader's own button (it opens that circle): the hook is asked for a link-free node (LINK_FREE, its second
// argument) and anything interactive that comes back is refused, so the crumb keeps its own words. Every other slot asks with the handle alone, as ever.
// FALSIFIER: a renamed resident right in a byline but raw/old in the title or a crumb; a node moved off another slot; a human drawn as a resident; an ancestor
// that opens the resident instead of its circle (a link inside the button); default/null/invalid/throw/reused changing the DOM; authored words, ids, actions,
// focus, scroll or reader state changing; a redraw that reads anything.
const NAMES256 = { amia: "Amia", claran: "Claran", pica: "Pica" };   // the HOST's current names, invented; World never sees this map
/** a Site-like host: the shared form linked to the person's page, or link-free when asked (resident-mention § mentionNode's `link: false`), current names */
const siteLike = (calls = []) => function identityForSpeaker(...args) {
  calls.push(args);
  const [handle, ctx] = args;
  const n = ctx?.link === false ? identityNode(handle) : linkIdentity(handle);
  find(n, (x) => x.className === "rig-id-name")[0].textContent = NAMES256[handle] ?? handle;
  return n;
};
const crumbsNav = (root) => byAttr(root, "data-crumbs")[0];
const titleOf = (root) => byAttr(root, "data-key", "circle-title")[0];
const interactiveIn = (n) => find(n, (x) => x !== n && (["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(x.tagName) || x.attrs.tabindex !== undefined));
const nested = (id) => harness256({ circles: { "50106|": circle50106() } }, id);
function harness256({ circles }, identityForSpeaker) {
  const host = element("div"); const scroller = element("div"); scroller.collapses = true; scroller.appendChild(host);
  const calls = [];
  const source = { async room(id) { calls.push(["room", id]); return roomFind(); }, async circle(id, after) { calls.push(["circle", id, after]); const a = circles[`${id}|${after ?? ""}`]; return a ?? { error: "bounce" }; } };
  const reader = createCircleReader({ doc, host, source, roomId: "t20260514-pica", scroller, identityForSpeaker });
  return { host, scroller, reader, root: reader.root, calls };
}

test("WLD-256 · the circle title and every named crumb wear the host's identity with its current name; ancestors ask link-free and stay the circle's own buttons", async () => {
  const calls = [];
  const h = nested(siteLike(calls));
  await h.reader.showCircle(50106); await tick();
  const nav = crumbsNav(h.root), title = titleOf(h.root);
  assert.equal(text(title), "Amia's statement", "the title: the host's current name, then the reader's own words");
  assert.equal(title.tagName, "H3"); assert.equal(title.attrs.tabindex, "-1");
  assert.match(text(nav), /^Back to the room›Cave Interior›Pica's statement›Claran's statement›Amia's statement$/, "the back path: room and Back as ever, every named crumb current");
  assert.ok(!/amia's|claran's|pica's/.test(text(nav) + text(title)), "no raw handle is left in a generated label");

  const crumbs = byAttr(nav, "data-crumb");
  assert.deepEqual(crumbs.map((c) => [c.tagName, c.attrs["data-crumb"], c.attrs["data-key"] ?? null, c.attrs["aria-current"] ?? null]),
    [["BUTTON", "50101", "crumb-50101", null], ["BUTTON", "50105", "crumb-50105", null], ["SPAN", "50106", null, "page"]], "the same crumbs, keys and current page");
  for (const b of crumbs.slice(0, 2)) {
    assert.equal(idsOf248(b).length, 1, "one identity in each ancestor");
    assert.deepEqual(interactiveIn(b), [], "nothing interactive inside World's button: no link to a resident");
    assert.equal(b.attrs.type, "button");
  }
  assert.equal(linksIn(crumbs[2]).length, 1, "the current crumb (not a control) takes the host's form as made, link and all");
  assert.equal(linksIn(title).length, 1, "and so does the title");

  // who was asked, and how: the ancestors with LINK_FREE, the title and the current crumb with the handle alone, as every byline is
  const generated = calls.filter((a) => ["pica", "claran", "amia"].includes(a[0]) && (a.length === 2 || a[0] === "amia"));
  assert.ok(calls.some((a) => a[0] === "pica" && a.length === 2 && a[1] === LINK_FREE) && calls.some((a) => a[0] === "claran" && a.length === 2 && a[1] === LINK_FREE), "each ancestor was asked link-free");
  assert.ok(Object.isFrozen(LINK_FREE) && LINK_FREE.link === false && Object.keys(LINK_FREE).length === 1, "the context is exactly { link: false }");
  assert.ok(calls.filter((a) => a.length === 2).every((a) => a[1] === LINK_FREE && ["pica", "claran"].includes(a[0])), "only ancestors get a second argument");
  assert.ok(generated.length >= 4, "title and current crumb asked too");

  // fresh nodes in every slot: the title's and the current crumb's amia are two nodes, and no byline's node was moved
  const all = idsOf248(h.root);
  assert.equal(new Set(all).size, all.length, "every placed identity is its own node");
  const amias = all.filter((n) => n.attrs["data-identity"] === "amia");
  assert.ok(amias.length >= 2 && nav.contains(amias.find((n) => nav.contains(n))) && title.contains(amias.find((n) => title.contains(n))), "amia in the crumb and the title, separately");

  // an ancestor still opens its circle, never the resident
  const before = h.calls.length;
  byAttr(nav, "data-crumb", 50105)[0].click(); await tick();
  assert.deepEqual(h.calls.slice(before)[0], ["circle", 50105, undefined], "Claran's crumb opens circle 50105");
});

test("WLD-256 · a human stays human, and an unnamed crumb is the reader's own words with no hook call", async () => {
  const calls = [];
  const h = nested(identityHook(calls));
  await h.reader.showCircle(50106); await tick();
  const pica = byAttr(crumbsNav(h.root), "data-crumb", 50101)[0];
  assert.equal(idsOf248(pica)[0].attrs["data-kind"], "human", "the host's human node, placed as made");
  assert.equal(idsOf248(byAttr(crumbsNav(h.root), "data-crumb", 50105)[0])[0].attrs["data-kind"], "resident");

  const bare = createCircleReader({ doc, host: element("div"), source: { async circle() { return { find: { ...circle50106().find, circle_read: { ...circle50106().find.circle_read, context: [] } } }; } }, identityForSpeaker: identityHook(calls) });
  calls.length = 0;
  await bare.showCircle(50106); await tick();
  const nav = crumbsNav(bare.root);
  assert.deepEqual(byAttr(nav, "data-crumb").slice(0, 2).map((b) => text(b)), ["an earlier statement", "an earlier statement"], "an unnamed ancestor keeps its words");
  assert.deepEqual(byAttr(nav, "data-crumb").slice(0, 2).map((b) => idsOf248(b).length), [0, 0]);
  assert.ok(!calls.some((a) => a.length === 2), "and nobody is asked for it");
});

test("WLD-256 · a host that ignores the context (or answers anything interactive) leaves each ancestor its own words: never a link inside the button", async () => {
  const bareH = nested(null); await bareH.reader.showCircle(50106); await tick();
  const bareCrumbs = byAttr(crumbsNav(bareH.root), "data-crumb").slice(0, 2).map(shapeOf);
  const variants = {
    "one-argument linking host": (h) => linkIdentity(h),
    "a nested button": (h) => { const n = identityNode(h); n.appendChild(element("button")); return n; },
    "a tab stop": (h) => { const n = identityNode(h); n.children[1].setAttribute("tabindex", "0"); return n; },
    "a link role": (h) => { const n = identityNode(h); n.setAttribute("role", "link"); return n; },
    "the root itself a link": (h) => { const a = element("a"); a.setAttribute("href", `/residents/${h}`); a.textContent = h; return a; },
  };
  for (const [why, make] of Object.entries(variants)) {
    const h = nested(make); await h.reader.showCircle(50106); await tick();
    const crumbs = byAttr(crumbsNav(h.root), "data-crumb");
    assert.deepEqual(crumbs.slice(0, 2).map(shapeOf), bareCrumbs, `${why}: the ancestors are exactly the bare host's`);
    assert.deepEqual(crumbs.slice(0, 2).flatMap(interactiveIn), [], `${why}: nothing interactive inside a button`);
  }
  const plain = nested(linkIdentity); await plain.reader.showCircle(50106); await tick();
  assert.equal(linksIn(titleOf(plain.root)).length, 1, "the title still takes a linking host's node");
  assert.equal(linksIn(byAttr(crumbsNav(plain.root), "data-crumb", 50106)[0]).length, 1, "and so does the current crumb");
});

test("WLD-256 · default, null and every refused result draw the title and crumbs exactly as before", async () => {
  const draw = async (identityForSpeaker) => { const h = nested(identityForSpeaker); await h.reader.showCircle(50106); await tick(); openAll(h.root); return shapeOf(h.root); };
  const bare = await draw(undefined);
  assert.match(bare, /pica's statement.*claran's statement.*amia's statement/s, "the bare host's crumbs are the handles, as ever");
  const once = identityNode("x");
  const refusals = {
    null: null, "not a function": "pica",
    "returns null": () => null, "returns a string": (h) => h, throws: () => { throw new Error("no"); },
    "aria-hidden": (h) => { const n = identityNode(h); n.setAttribute("aria-hidden", "true"); return n; },
    empty: () => element("span"),
    "already placed": (h) => { const p = element("div"); const n = identityNode(h); p.appendChild(n); return n; },
    reused: () => once,
  };
  for (const [why, hook] of Object.entries(refusals)) {
    if (why === "reused") { await draw(() => once); }   // the first placement uses it up; every later answer is a reuse
    assert.equal(await draw(hook), bare, `${why}: exactly the old path`);
  }
});

test("WLD-256 · redraw keeps focus (an identity link in the title, an ancestor button), scroll and the circle, reads nothing, and picks up the host's current data", async () => {
  const h = nested(siteLike());
  await h.reader.showCircle(50106); await tick(); openAll(h.root);
  const callsBefore = h.calls.length;
  const link = linksIn(titleOf(h.root))[0]; link.focus();
  h.scroller.scrollTop = 90;
  NAMES256.amia = "Amia (renamed)";
  try {
    h.reader.redraw();
    const fresh = doc.activeElement;
    assert.ok(fresh && fresh.className === "rig-id-link" && fresh !== link && titleOf(h.root).contains(fresh), "focus is on the title's FRESH identity link");
    assert.deepEqual(doc.lastFocusOptions, { preventScroll: true });
    assert.equal(h.scroller.scrollTop, 90, "scroll put back");
    assert.equal(text(titleOf(h.root)), "Amia (renamed)'s statement", "the title shows the current name");
    assert.equal(text(byAttr(crumbsNav(h.root), "data-crumb", 50106)[0]), "Amia (renamed)'s statement", "and so does the current crumb");
    byAttr(crumbsNav(h.root), "data-crumb", 50105)[0].focus();
    h.reader.redraw();
    assert.equal(doc.activeElement?.attrs["data-key"], "crumb-50105", "an ancestor button keeps focus by its own key");
    assert.ok(h.root.contains(doc.activeElement));
    assert.equal(h.reader.getState().view, "circle"); assert.equal(h.reader.getState().circleId, 50106);
    assert.equal(h.calls.length, callsBefore, "nothing was read");
  } finally { NAMES256.amia = "Amia"; }
});

test("WLD-256 · the shell's provider reaches the title and crumbs: both arrival orders, the same function, null, and the context passed through only when sent", async () => {
  const { setViewerIdentityForSpeaker } = await import("../spectator/viewer.mjs");
  const { viewerIdentityFor } = await import("../spectator/viewer-identity.mjs");
  // the stable wrapper: one argument stays one; the ancestor's context is passed as sent
  const seen = [];
  const app0 = element("div"); setViewerIdentityForSpeaker(app0, function (...a) { seen.push(a); return null; });
  const wrap = viewerIdentityFor(app0);
  wrap("pica"); wrap("claran", LINK_FREE);
  assert.deepEqual(seen.map((a) => a.length), [1, 2]); assert.equal(seen[1][1], LINK_FREE);

  // the real column and reader, opened on circle 50101 (title + current crumb), then the provider set, changed and cleared through the public setter
  const names = { pica: "Pica" };
  const provider = (hdl) => { const n = identityNode(hdl); n.children[1].textContent = names[hdl] ?? hdl; return n; };
  const titleText = (host) => text(byAttr(host, "data-key", "circle-title")[0]);
  const openCircle = async (v) => { await v.open(); byAttr(v.host, "data-circle-open", 50101)[0].click(); await tick(); await tick(); };
  const plainApp = element("div"); const ref = await mountLike(plainApp); await openCircle(ref);
  assert.equal(titleText(ref.host), "pica's statement", "no provider: the generated title as ever");

  const first = element("div"); setViewerIdentityForSpeaker(first, provider);
  const a = await mountLike(first); await openCircle(a);
  const later = element("div"); const b = await mountLike(later); await openCircle(b);
  const reads = b.calls.length;
  setViewerIdentityForSpeaker(later, provider);
  for (const v of [a, b]) {
    assert.equal(titleText(v.host), "Pica's statement", "the title wears the identity in either order");
    assert.equal(text(byAttr(crumbsNav(v.host), "data-crumb", 50101)[0]), "Pica's statement", "and the current crumb");
  }
  assert.equal(shapeOf(b.host), shapeOf(a.host), "the arrival order makes no difference");
  assert.equal(b.calls.length, reads, "the relabel read nothing");
  names.pica = "Pica of the Cave";
  setViewerIdentityForSpeaker(later, provider);
  assert.equal(titleText(b.host), "Pica of the Cave's statement", "the same function again: the current name");
  setViewerIdentityForSpeaker(later, null);
  assert.equal(shapeOf(b.host), shapeOf(ref.host), "null: exactly the never-provided viewer's");
});
