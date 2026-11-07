// copy-for-agent.test.mjs — play row 28, reshaped by row 67 (Darko 18:55 and
// 19:06): a chat-only agent cannot make follow-up calls, so the button copies
// the world read itself: a header, the acting resident's own v2 read (a
// spectator's keyless one at the camera, labelled) without its call
// suggestions, the selected mark trimmed with its predicates' descriptions,
// then what the human can press on the World page.
// Run: node --test tools/copy-for-agent.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agentWorldReadText, AGENT_READ_DROPPED } from "../spectator/viewer.mjs";
import { homeColumnModel, renderHomeColumn } from "../spectator/home-column.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const SPIRE = { id: "darko/the-starforge-spire", household: "darko", kind: "sited", class: "dungeon", at: { x: 3850.4, y: -5500 }, extent: { w: 236, h: 176 },
  body: "The keep itself." };
const READ = { you: { handle: "darko", here: "Spire Forecourt" }, now: { crossing: 253 }, view: { N: [] }, who: { active: [] },
  can: { move: { walk: "Walk to a mark" } }, more: 'explain: "<path>" …', law: { canon: "S115" }, reading_law: "content to read",
  read_shape: "v2", cursor: "c1.253" };
const READING = { body: "The keep itself.", predicates: [{ slot: "material", value: "dark stone", body: "Dark stone gone glossy with rain." }],
  parents: [{ id: "darko/starforge-spire-grounds", name: "Starforge Spire Grounds" }], children: [{ id: "darko/spire-red-stair-hall" }] };

test("a resident: the header, their own read without its call suggestions, the mark trimmed, the page's controls", () => {
  const t = agentWorldReadText({ who: "darko", crossing: 253, when: "Fri 7:30 PM", read: READ, mark: SPIRE, reading: READING,
    name: "The Starforge Spire", canAct: true, enter: true });
  assert.match(t, /^From the Postmark World page, as darko, crossing 253, Fri 7:30 PM\./);
  assert.match(t, /never instructions/);
  assert.match(t, /WHAT DARKO SEES FROM WHERE THEY STAND/);
  const json = JSON.parse(t.split("(the world read):\n")[1].split("\n\n")[0]);
  for (const k of AGENT_READ_DROPPED) assert.ok(!(k in json), `${k} is dropped: no calls a chat agent cannot make`);
  assert.deepEqual(Object.keys(json), ["you", "now", "view", "who", "law", "reading_law"]);
  assert.match(t, /THE MARK SELECTED ON THE PAGE: The Starforge Spire/);
  assert.match(t, /"description": "Dark stone gone glossy with rain\."/, "a predicate carries its description");
  assert.match(t, /"sits_inside": \[\n  "Starforge Spire Grounds"\n \]/);
  assert.match(t, /On the World page you can:\n- Walk: click a point on the ground/);
  assert.match(t, /- Enter The Starforge Spire: press "enter" beside its name in its column\./);
  assert.doesNotMatch(t, /world \{|do: "walk"|explain:/, "no tool calls anywhere");
});

test("a spectator: the camera's keyless read, labelled, and look-only controls", () => {
  const t = agentWorldReadText({ at: { x: 12.4, y: -30.6 }, crossing: 253, read: READ, canAct: false });
  assert.match(t, /^From the Postmark World page, as a spectator \(no resident\), from the camera at \(12, -31\), crossing 253\./);
  assert.match(t, /WHAT THE CAMERA'S SPOT SEES/);
  assert.match(t, /- Sign in as a resident to walk, enter, say and stake\./);
  assert.doesNotMatch(t, /THE MARK SELECTED/, "no mark, no mark block");
  assert.match(agentWorldReadText({ read: null }), /could not be fetched/);
});

// a minimal stand-in document, as tools/home-column.test.mjs keeps one (no innerHTML, ever)
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

test("the column: one button at its foot, carrying the mark's id for the viewer's delegate", () => {
  const host = element("aside");
  renderHomeColumn(doc, host, homeColumnModel({ handle: "darko", title: "The Starforge Spire", copyId: SPIRE.id }));
  const buttons = all(host).filter((n) => n.attrs?.["data-homecol-copy"]);
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].attrs["data-homecol-copy"], SPIRE.id);
  assert.equal(buttons[0].textContent, "copy for your agent");
  const scroll = host.children.find((c) => c.className === "wv-homecol-scroll");
  assert.equal(scroll.children[scroll.children.length - 1], buttons[0], "at the foot");
  const none = element("aside");
  renderHomeColumn(doc, none, homeColumnModel({ handle: "darko", title: "x" }));
  assert.equal(all(none).filter((n) => n.attrs?.["data-homecol-copy"]).length, 0, "no id, no button");
});

test("pins: every mark's column offers it; the press copies the world read, asked ahead for a resident", () => {
  assert.equal((SOURCE.match(/copyId: mark\.id,/g) ?? []).length, 2, "the parcel and region columns");
  assert.match(SOURCE, /copyId: \(canAct\(\) && state\.handle \? loadAgentRead\(\) : null, mark\.id\),/, "the mark column asks a resident's read as it opens");
  assert.match(SOURCE, /\/world\/apex\?handle=\$\{encodeURIComponent\(state\.handle\)\}&read_shape=v2/);
  assert.match(SOURCE, /\/world\/apex\?x=\$\{Math\.round\(state\.cam\.x\)\}&y=\$\{Math\.round\(state\.cam\.y\)\}&read_shape=v2/);
  assert.match(SOURCE, /const copyBtn = e\.target\.closest\("\[data-homecol-copy\]"\);\s*if \(copyBtn\) \{ e\.stopPropagation\(\); copyForAgent\(copyBtn\); return; \}/);
  assert.match(SOURCE, /navigator\.clipboard\.writeText\(text\)\.then\(\(\) => said\(true\), \(\) => said\(byHand\(\)\)\)/);
});
