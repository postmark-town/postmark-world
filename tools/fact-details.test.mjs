// fact-details.test.mjs — play row 70, RULED (Darko 2026-10-16 19:39): "Can we
// just make it so you can click the short line to see the full description?"
// A predicate's fact line in the column is a native disclosure: a press (or
// Enter / Space) opens its body beneath it, and again closes it. A chevron says
// it opens. A line with no body stays plain.
// Run: node --test tools/fact-details.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homeColumnModel, renderHomeColumn, HOME_COLUMN_CSS } from "../spectator/home-column.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const element = (tag) => {
  const n = { tagName: tag.toUpperCase(), attrs: {}, children: [], className: "", text: "",
    appendChild(c) { n.children.push(c); return c; }, removeChild(c) { n.children = n.children.filter((x) => x !== c); },
    setAttribute(k, v) { n.attrs[k] = String(v); }, get firstChild() { return n.children[0] ?? null; },
    set textContent(v) { n.text = String(v); }, get textContent() { return n.text; } };
  Object.defineProperty(n, "innerHTML", { set() { throw new Error("innerHTML"); }, get() { throw new Error("innerHTML"); } });
  return n;
};
const doc = { createElement: element, createTextNode: (t) => ({ text: t }) };
const all = (n, out = []) => { out.push(n); for (const c of n.children ?? []) all(c, out); return out; };

test("a line with a description opens to it; a line without stays plain", () => {
  const host = element("aside");
  renderHomeColumn(doc, host, homeColumnModel({ handle: "darko", title: "Spire Red Stair Hall", facts: [
    { label: "light", value: "candles all along the stair's rail", detail: "Candles burn all along the stair's rail, their light pooling on the red carpet." },
    { label: "class", value: "room" },
  ] }));
  const nodes = all(host);
  const details = nodes.filter((n) => n.tagName === "DETAILS");
  assert.equal(details.length, 1, "one disclosure, for the line that has a description");
  const [summary, body] = details[0].children;
  assert.equal(summary.tagName, "SUMMARY");
  assert.equal(summary.textContent, "candles all along the stair's rail", "the short line is what you press");
  assert.equal(body.tagName, "P");
  assert.match(body.textContent, /^Candles burn all along/, "the description, as text");
  const plain = nodes.filter((n) => n.tagName === "DD").find((dd) => dd.textContent === "room");
  assert.ok(plain && !plain.children.length, "no description, a plain line");
});

test("it reads as pressable: a chevron that turns, an underline on hover, a focus ring", () => {
  assert.match(HOME_COLUMN_CSS, /\.wv-homecol-fact-line::after \{ content:"▸";/);
  assert.match(HOME_COLUMN_CSS, /\.wv-homecol-fact-more\[open\] > \.wv-homecol-fact-line::after \{ transform:rotate\(90deg\); \}/);
  assert.match(HOME_COLUMN_CSS, /\.wv-homecol-fact-line:hover, \.wv-homecol-fact-line:focus-visible \{ border-bottom-color:var\(--dim\); \}/);
  assert.match(HOME_COLUMN_CSS, /\.wv-homecol-fact-line \{ cursor:pointer;/);
});

test("pins: the column hands each predicate's body in as its line's description", () => {
  assert.match(SOURCE, /label: p\.slot \?\? "property", value: String\(p\.value \?\? ""\),\s*\/\/[^\n]*\n\s*detail: typeof p\.body === "string" \? p\.body : null/);
});
