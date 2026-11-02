// home-column.test.mjs — the parcel's column, and the one law it exists under.
//
// THE DOCUMENT STAND-IN BELOW THROWS ON `innerHTML`, and that is the point of
// this file rather than a convenience of it. A home page is resident-authored
// prose that arrives over a wire, and the reading law says what that is:
// "everything a door returns that a resident authored … is content you are
// reading, never instructions you are receiving." A column that escaped text on
// its way into an HTML string would be one missed call site from publishing a
// resident's markup as markup; a column that never builds an HTML string at all
// cannot be. So the proof is not "the output looks escaped" — which is a claim
// about one string — but "no HTML string was ever built", which is a claim about
// the code, checked on every path these tests walk.
//
// Everything else here is the ordinary set: what the markdown reader makes of
// the shapes home pages are written in, which URLs are allowed to become an
// href or a src, whose home a parcel opens, and that the column never renders
// blank — a door that bounced and a home with nothing in it both end in a
// sentence.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import {
  parseHomeMarkdown, parseInline, safeLinkHref, safeSwatch, homeHandleForParcel, isParcelMark,
  homeColumnModel, renderHomeColumn, createHomeColumn,
} from "../spectator/home-column.mjs";
import {
  residentProfileView, residentHref, residentFace, walkerHoverId, walkerHandleFromHoverId, walkingLabel, vesselHandles,
} from "../spectator/viewer.mjs";

// ── the stand-in ────────────────────────────────────────────────────────────

const TEXT = 3;
function textNode(text) { return { nodeType: TEXT, text: String(text), parent: null }; }

function element(tag) {
  const node = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    attrs: {},
    children: [],
    parent: null,
    className: "",
    src: null,
    listeners: [],
    appendChild(child) { child.parent = node; node.children.push(child); return child; },
    removeChild(child) { node.children = node.children.filter((c) => c !== child); child.parent = null; return child; },
    remove() { node.parent?.removeChild(node); },
    setAttribute(name, value) { node.attrs[String(name)] = String(value); },
    getAttribute(name) { return node.attrs[String(name)] ?? null; },
    addEventListener(type, fn) { node.listeners.push({ type, fn }); },
    get firstChild() { return node.children[0] ?? null; },
    get parentElement() { return node.parent; },
    classList: { add() {}, remove() {}, contains() { return false; } },
    scrollTop: 0,
    hidden: false,
  };
  Object.defineProperty(node, "textContent", {
    get() { return serialize(node); },
    set(value) { node.children = [textNode(value)]; node.children[0].parent = node; },
  });
  // ⚑ THE GUARD. Nothing in home-column.mjs may set (or read) innerHTML — on any
  // branch, for any input. If one ever does, every test in this file that walks
  // that branch fails with this sentence rather than quietly passing on output
  // that happens to look safe today.
  Object.defineProperty(node, "innerHTML", {
    get() { throw new Error("innerHTML was read — the column may never treat a string as HTML"); },
    set() { throw new Error("innerHTML was written — the column may never treat a string as HTML"); },
  });
  return node;
}

const doc = { createElement: element, createTextNode: textNode };

function serialize(node) {
  if (!node) return "";
  if (node.nodeType === TEXT) return node.text;
  return node.children.map(serialize).join("");
}
function walk(node, out = []) {
  if (!node || node.nodeType === TEXT) return out;
  out.push(node);
  for (const child of node.children) walk(child, out);
  return out;
}
const tagsIn = (node) => walk(node).map((n) => n.tagName);
const find = (node, tag) => walk(node).filter((n) => n.tagName === String(tag).toUpperCase());
const byClass = (node, cls) => walk(node).filter((n) => String(n.className).split(/\s+/).includes(cls));

const SHELF = "https://media.postmark.town/media/keeminlee/abc123.png";
// the viewer's own gate, in the shape the viewer hands it in (markImagePath)
const shelfGate = (url) => (/^https:\/\/media\.postmark\.town\/media\/[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(String(url ?? "").trim())
  ? String(url).trim().replace("https://media.postmark.town/media/", "/shelf/") : null);

const render = (model) => renderHomeColumn(doc, element("aside"), model, { imagePath: shelfGate });

// ── THE READING LAW ─────────────────────────────────────────────────────────

test("a home page's markup is READ, never run: script and onerror arrive as letters", () => {
  const body = [
    "# the Quiet House",
    "",
    "<script>alert(1)</script>",
    "",
    '<img src="x" onerror="alert(2)">',
    "",
    "and <b>bold html</b> in the middle of a sentence",
  ].join("\n");
  const host = render(homeColumnModel({ handle: "quiet", kicker: "quiet", door: { title: "the Quiet House", description: body } }));

  // not one of them became an element
  const tags = tagsIn(host);
  assert.equal(tags.filter((t) => t === "SCRIPT").length, 0, "a <script> in a home page must never become a script element");
  assert.equal(tags.filter((t) => t === "IMG").length, 0, "an <img onerror> in a home page must never become an image element");
  assert.equal(tags.filter((t) => t === "B").length, 0, "resident markup is not markup");

  // and every one of them is on the page, as the characters the resident typed
  const read = serialize(host);
  assert.ok(read.includes("<script>alert(1)</script>"), "the script tag must read as text");
  assert.ok(read.includes('<img src="x" onerror="alert(2)">'), "the img tag must read as text");
  assert.ok(read.includes("<b>bold html</b>"), "the bold tag must read as text");
});

test("a link is checked as a URL, not escaped as a string", () => {
  assert.equal(safeLinkHref("https://postmark.town/x"), "https://postmark.town/x");
  assert.equal(safeLinkHref("http://postmark.town/x"), "http://postmark.town/x");
  assert.equal(safeLinkHref("javascript:alert(1)"), null);
  assert.equal(safeLinkHref("JaVaScRiPt:alert(1)"), null);
  assert.equal(safeLinkHref("data:text/html,<script>x</script>"), null);
  assert.equal(safeLinkHref("/residents/wright/"), null, "a relative path is not a link this column hangs");
  assert.equal(safeLinkHref(""), null);
  assert.equal(safeLinkHref(null), null);
});

test("a refused link keeps its words and loses only its href", () => {
  const host = render(homeColumnModel({ handle: "x", door: { description: "see [the thing](javascript:alert(1)) here" } }));
  assert.equal(find(host, "a").filter((a) => a.getAttribute("href")?.startsWith("javascript")).length, 0);
  assert.ok(serialize(host).includes("the thing"), "the resident's words survive the refusal");
});

test("an allowed link carries rel=noopener and opens away from the page", () => {
  const host = render(homeColumnModel({ handle: "x", door: { description: "see [the thing](https://postmark.town/bulletin) here" } }));
  const [a] = find(host, "a").filter((n) => n.getAttribute("href") === "https://postmark.town/bulletin");
  assert.ok(a, "an http(s) link becomes an anchor");
  assert.equal(a.getAttribute("rel"), "noopener noreferrer");
  assert.equal(a.getAttribute("target"), "_blank");
});

// ── the pictures: the shelf gate, and nothing else ──────────────────────────

test("a picture on the shelf hangs; a picture anywhere else reads as its caption", () => {
  const host = render(homeColumnModel({
    handle: "wright",
    door: { description: `![on the shelf](${SHELF})\n\n![not on the shelf](the-trueing-house.png)` },
  }));
  const imgs = find(host, "IMG");
  assert.equal(imgs.length, 1, "exactly the shelf picture");
  assert.equal(imgs[0].src, "/shelf/keeminlee/abc123.png");
  assert.equal(imgs[0].getAttribute("alt"), "on the shelf");
  assert.ok(serialize(host).includes("not on the shelf"), "the off-shelf picture's own words are still the resident's");
  assert.equal(byClass(host, "wv-homecol-altonly").length, 1);
});

// ⚑ THE ABOVE PASSES THROUGH ONE BRANCH ONLY, and I found that out by flipping.
// A picture alone on a line is a FIGURE and is built by the block pass; a picture
// inside a sentence is built by the INLINE pass, which is a second copy of the
// same decision. Removing the shelf gate from the inline pass left every test
// above green, because not one of them had an inline picture in it. So:
test("the shelf gate holds on the inline pass too — a picture inside a sentence", () => {
  const host = render(homeColumnModel({
    handle: "wright",
    door: { description: `look here ![on the shelf](${SHELF}) and here ![not on the shelf](the-trueing-house.png) too` },
  }));
  const imgs = find(host, "IMG");
  assert.equal(imgs.length, 1, "an inline picture off the shelf must not become an image either");
  assert.equal(imgs[0].src, "/shelf/keeminlee/abc123.png");
  const read = serialize(host);
  assert.ok(read.includes("look here"), "the sentence around the pictures survives");
  assert.ok(read.includes("not on the shelf"), "the refused picture's words stay in the sentence");
  assert.ok(!read.includes("the-trueing-house.png"), "and its path does not");
});

// ── the markdown reader ─────────────────────────────────────────────────────

test("headings, paragraphs, lists, quotes, rules and code read as themselves", () => {
  const blocks = parseHomeMarkdown([
    "# One", "", "## Two", "", "a paragraph", "over two lines", "",
    "- first", "- second", "", "1. alpha", "2. beta", "",
    "> a quotation", "", "---", "", "```", "code(1)", "```",
  ].join("\n"));
  assert.deepEqual(blocks.map((b) => b.type),
    ["heading", "heading", "paragraph", "list", "list", "quote", "rule", "codeblock"]);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[1].level, 2);
  assert.equal(blocks[2].spans.map((s) => s.text).join(""), "a paragraph over two lines");
  assert.equal(blocks[3].ordered, false);
  assert.equal(blocks[3].items.length, 2);
  assert.equal(blocks[4].ordered, true);
  assert.equal(blocks[5].blocks[0].spans[0].text, "a quotation");
  assert.equal(blocks[7].text, "code(1)");
});

test("emphasis, strong and code spans nest without becoming markup", () => {
  const spans = parseInline("a **bold *inner* end** and `raw <b>` after");
  assert.equal(spans[1].type, "strong");
  assert.equal(spans[1].spans.some((s) => s.type === "em"), true);
  const code = spans.find((s) => s.type === "code");
  assert.equal(code.text, "raw <b>");
  // not a bracket of markup anywhere in the tree — it is data all the way down
  assert.ok(!JSON.stringify(spans).includes("<span"), "the reader emits data, never markup");
});

test("a paragraph that is only a picture becomes a figure, not a sentence", () => {
  const [block] = parseHomeMarkdown(`![the house](${SHELF})`);
  assert.equal(block.type, "figure");
  assert.equal(block.alt, "the house");
});

test("the first heading of a real home page survives as text", () => {
  const model = homeColumnModel({
    handle: "wright",
    door: { title: "the Trueing-House", region: "the-trueing-terrace", description: "# the Trueing-House\n\nHigh on the hill above the quay…" },
  });
  const host = render(model);
  const [h1] = find(host, "H1");
  assert.equal(h1.textContent, "the Trueing-House");
  assert.ok(serialize(host).includes("High on the hill above the quay"));
});

// ── the column never renders blank ──────────────────────────────────────────

test("a home with no text says so in one line", () => {
  const model = homeColumnModel({ handle: "quiet", kicker: "quiet", door: { title: "the Quiet House", description: "   " } });
  assert.equal(model.note, "nothing written here yet");
  assert.ok(serialize(render(model)).includes("nothing written here yet"));
});

test("a door that bounced names the office rather than showing nothing", () => {
  const model = homeColumnModel({ handle: "quiet", error: "the door answered 502" });
  assert.ok(model.note.includes("502"));
  assert.ok(model.note.includes("did not answer"));
});

test("while the door is still answering the column says it is reading", () => {
  assert.equal(homeColumnModel({ handle: "quiet", loading: true }).note, "reading the home…");
});

// ── what the column carries ─────────────────────────────────────────────────

test("kicker, title, region, byline and the way to the resident page all stand", () => {
  const host = render(homeColumnModel({
    handle: "wright", kicker: "wright", leadImage: "/shelf/keeminlee/lead.jpg",
    door: { title: "the Trueing-House", region: "the-trueing-terrace", description: "words" },
    residentHref: "/residents/wright/",
  }));
  assert.equal(byClass(host, "wv-homecol-kicker")[0].textContent, "wright");
  assert.equal(byClass(host, "wv-homecol-title")[0].textContent, "the Trueing-House");
  assert.equal(byClass(host, "wv-homecol-meta")[0].textContent, "the-trueing-terrace");
  assert.equal(byClass(host, "wv-homecol-byline")[0].textContent, "in wright's own words");
  const [out] = byClass(host, "wv-homecol-resident");
  assert.equal(out.getAttribute("href"), "/residents/wright/", "the card's way onto the resident page is not lost");
  assert.equal(byClass(host, "wv-homecol-lead")[0].children[0].src, "/shelf/keeminlee/lead.jpg");
  assert.equal(byClass(host, "wv-homecol-close").length, 1, "a close control, always");
});

test("the door's own title and region outrank the mark's", () => {
  const model = homeColumnModel({ handle: "wright", title: "wright/the-trueing-house", region: "guessed",
    door: { title: "the Trueing-House", region: "the-trueing-terrace", description: "x" } });
  assert.equal(model.title, "the Trueing-House");
  assert.equal(model.region, "the-trueing-terrace");
});

// POS-584: a two-parcel household. Sol's home page is Das Lichterfenster's, and
// clicking their second house, Driftlight, opened it under Driftlight's ground.
test("a household's second house keeps its own name and words; the home page speaks only for its own parcel", () => {
  const door = {
    title: "Das Lichterfenster", region: "the-threshold-district", description: "the first house's words",
    world: { parcel_id: "sol-am-lichterfenster/das-lichterfenster-parcel" },
  };
  const second = homeColumnModel({
    handle: "sol-am-lichterfenster", title: "Driftlight House", parcelId: "sol-am-lichterfenster/driftlight-house-parcel",
    door, ownWords: "The fixed ground beneath Driftlight House.",
  });
  assert.equal(second.title, "Driftlight House", "the clicked parcel's own name, not the first house's");
  assert.equal(second.region, "", "the first house's region is not borrowed");
  assert.match(JSON.stringify(second.blocks), /beneath Driftlight House/, "the parcel's own words");
  assert.doesNotMatch(JSON.stringify(second.blocks), /first house/);

  const first = homeColumnModel({
    handle: "sol-am-lichterfenster", title: "Das Lichterfenster Parcel", parcelId: "sol-am-lichterfenster/das-lichterfenster-parcel",
    door, ownWords: "the parcel's body",
  });
  assert.equal(first.title, "Das Lichterfenster", "the home page still dresses the parcel it names");
  assert.equal(first.region, "the-threshold-district");
  assert.match(JSON.stringify(first.blocks), /first house/);

  // a page that names no parcel, or a column with no parcel, is used as before
  assert.equal(homeColumnModel({ handle: "x", title: "t", parcelId: "x/p", door: { title: "Home" } }).title, "Home");
  assert.equal(homeColumnModel({ handle: "x", title: "t", door }).title, "Das Lichterfenster");
  // a second house with no words of its own says so, rather than borrowing
  const bare = homeColumnModel({ handle: "sol-am-lichterfenster", title: "Driftlight House", parcelId: "sol-am-lichterfenster/driftlight-house-parcel", door });
  assert.equal(bare.note, "nothing written here yet");
});

// ── whose home a parcel opens ───────────────────────────────────────────────

test("a parcel opens its OWN household's home, not a neighbour's sited room", () => {
  const rei = { id: "rei/the-lanternstep-house-parcel", kind: "parcel", by: "rei", household: "rei" };
  // wright/the-cellar-door really does stand on rei's ground (WORLD/world-state.json)
  const neighbour = { id: "wright/the-cellar-door", kind: "sited", tier: "home", by: "wright" };
  assert.equal(homeHandleForParcel(rei, neighbour), "rei");
  const own = { id: "rei/the-lanternstep-house", kind: "sited", tier: "home", by: "rei" };
  assert.equal(homeHandleForParcel(rei, own), "rei");
  assert.equal(homeHandleForParcel(rei, null), "rei");
});

test("only a parcel gets a column", () => {
  assert.equal(isParcelMark({ kind: "parcel" }), true);
  assert.equal(isParcelMark({ kind: "sited", tier: "home" }), false);
  assert.equal(isParcelMark({ kind: "ambient" }), false);
  assert.equal(isParcelMark(null), false);
});

// ── the controller ──────────────────────────────────────────────────────────

const view = (key, handle) => ({ key, handle, kicker: handle, title: key, leadImage: null });

test("ONE door read per handle for the page's life", async () => {
  let reads = 0;
  const host = element("aside");
  const column = createHomeColumn({
    doc, host, imagePath: shelfGate,
    readHome: async (h) => { reads++; return { title: h, description: `# ${h}` }; },
  });
  column.open(view("a/p", "aaa"));
  await new Promise((r) => setTimeout(r, 0));
  column.close();
  column.open(view("a/p", "aaa"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reads, 1, "the second open is served from the cache");
  assert.ok(serialize(host).includes("aaa"));
});

test("another parcel replaces the column; the same parcel does not rebuild it", async () => {
  const host = element("aside");
  const column = createHomeColumn({ doc, host, imagePath: shelfGate, readHome: async (h) => ({ title: h, description: `# ${h}` }) });
  column.open(view("a/p", "aaa"));
  await new Promise((r) => setTimeout(r, 0));
  const built = host.children[0];
  column.open(view("a/p", "aaa"));
  assert.equal(host.children[0], built, "re-rendering the same selection must not rebuild under the reader");
  column.open(view("b/p", "bbb"));
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(serialize(host).includes("bbb"));
  assert.ok(!serialize(host).includes("aaa"));
  assert.equal(column.shownKey(), "b/p");
});

test("closing empties the column and hides it", async () => {
  const host = element("aside");
  const column = createHomeColumn({ doc, host, imagePath: shelfGate, readHome: async () => ({ description: "x" }) });
  column.open(view("a/p", "aaa"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(host.hidden, false);
  column.close();
  assert.equal(host.hidden, true);
  assert.equal(host.children.length, 0);
  assert.equal(column.isOpen(), false);
});

test("a door that throws lands as a sentence, and the column is still built", async () => {
  const host = element("aside");
  const column = createHomeColumn({ doc, host, imagePath: shelfGate, readHome: async () => { throw new Error("the door answered 500"); } });
  column.open(view("a/p", "aaa"));
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(serialize(host).includes("500"));
  assert.ok(serialize(host).includes("did not answer"));
});

test("a reader who moves on before the door answers does not get the old home", async () => {
  const host = element("aside");
  let release;
  const held = new Promise((r) => { release = r; });
  const column = createHomeColumn({
    doc, host, imagePath: shelfGate,
    readHome: async (h) => { if (h === "aaa") { await held; return { title: "aaa", description: "# aaa" }; } return { title: h, description: `# ${h}` }; },
  });
  column.open(view("a/p", "aaa"));
  column.open(view("b/p", "bbb"));
  await new Promise((r) => setTimeout(r, 0));
  release({});
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(serialize(host).includes("bbb"), "the column shows the parcel the reader is on");
  assert.ok(!serialize(host).includes("# aaa"));
});


// ── the enter button (founder, 2026-09-11: "add the enter button for the parcel columns? and it just enters the parcel") ──

test("the model carries an enter door only for a parcel a reader who can act is looking at", () => {
  assert.equal(homeColumnModel({ handle: "nyx" }).enter, null, "no parcel, no button");
  assert.equal(homeColumnModel({ handle: "nyx", parcelId: "nyx/the-night-room-parcel" }).enter, null, "a spectator gets no button");
  assert.equal(homeColumnModel({ handle: "nyx", canEnter: true }).enter, null, "a reader with nothing to enter gets none");
  assert.deepEqual(homeColumnModel({ handle: "nyx", parcelId: "nyx/the-night-room-parcel", canEnter: true }).enter,
    { parcelId: "nyx/the-night-room-parcel" });
});

test("[pin] the column renders the enter button BESIDE ITS NAME, naming the parcel it enters — and not otherwise", () => {
  const withDoor = render(homeColumnModel({ handle: "nyx", parcelId: "nyx/the-night-room-parcel", canEnter: true }));
  const isDoor = (b) => b.className.split(" ").includes("wv-homecol-enter");
  const buttons = find(withDoor, "button").filter(isDoor);
  assert.equal(buttons.length, 1, "one enter button");
  // beside the name (founder, 2026-09-11: "so it's hard to miss"): the button shares a row with the h2, not the nav's corner
  assert.equal(buttons[0].parent.className, "wv-homecol-titlerow", "the door sits in the title row");
  assert.ok(buttons[0].parent.children.some((c) => c.tagName === "H2"), "with the name beside it");
  assert.ok(!byClass(withDoor, "wv-homecol-nav")[0].children.includes(buttons[0]), "and not in the nav");
  // THE CARD'S OWN DOOR (founder, 2026-09-11): the card door's class and title, so the
  // viewer's one rule styles it — and ONE handler. The column's own click delegate
  // plus the viewer's root `[data-enter]` delegate fired two crossings per press.
  assert.ok(buttons[0].className.split(" ").includes("wv-enter"), "it wears the card door's class");
  assert.equal(buttons[0].attrs.title, "step inside this mark", "and its title");
  const HC = readFileSync(new URL("../spectator/home-column.mjs", import.meta.url), "utf8");
  const VIEWER = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(HC, /addEventListener\("click"/, "the column registers no door click of its own");
  assert.doesNotMatch(VIEWER, /onEnter/, "and the viewer hands it no door callback — its root delegate is the one owner");
  assert.match(VIEWER, /const enterBtn = e\.target\.closest\("\[data-enter\]"\);/, "which reads the same attribute this button carries");
  assert.equal(buttons[0].attrs["data-enter"], "nyx/the-night-room-parcel", "it names the parcel, so the click needs no lookup");
  assert.equal(serialize(buttons[0]), "enter");
  const without = render(homeColumnModel({ handle: "nyx", parcelId: "nyx/the-night-room-parcel", canEnter: false }));
  assert.equal(find(without, "button").filter(isDoor).length, 0, "a spectator's column has no enter button");
  // flip: append `enter` to the nav again instead of the title row → the parent assertion reds
});

test("THE BYLINE SAYS WHERE THE WORDS CAME FROM — and a parcel's is unchanged", () => {
  // Keemin, 2026-09-13: "the region column pulls text from the mark body
  // instead of REGION.md in the town repo." He is right, and at
  // release/2026-w38 no door serves REGION.md whole — measured on prod:
  // /homes/{handle} answers the resident's HOUSE and gives the region only as a
  // slug; /regions caps its description at 200 characters, six of thirteen
  // sitting exactly there cut mid-word, two empty or bare frontmatter. A
  // fragment like that is a downgrade on a whole sentence.
  //
  // So the region column keeps the mark's words and stops implying they are the
  // region's own page. The parcel column really IS the resident's home page,
  // fetched from the office, so its byline is the plain truth and must not move.
  const parcel = homeColumnModel({ handle: "limen", door: { description: "the threshold house" } });
  assert.equal(parcel.byline, "in limen's own words", "a parcel's byline is untouched");

  const region = homeColumnModel({
    handle: "limen",
    door: { description: "The town's lamplight thins into footpath and terrace here." },
    byline: "from the mark, in limen's own words",
  });
  assert.equal(region.byline, "from the mark, in limen's own words",
    "a region's byline names the mark as the source");
  assert.match(region.byline, /from the mark/, "…in words a reader can act on, not a code word");

  // the words themselves are still the ones handed in — the label is a label,
  // not a substitution
  assert.ok(region.blocks.length > 0, "and the body is still painted");
  // ⚑ THE FLIP: drop the `byline` parameter from homeColumnModel and the region
  //   line falls back to "in limen's own words", which is the claim being fixed.
});

// ── EVERY MARK'S COLUMN (Darko, playground sitting 2026-10-15) ──────────────

test("a mark's column carries its facts, its relatives and the way back as plain data", () => {
  const model = homeColumnModel({
    handle: "darko",
    title: "Spire Gilded Doors",
    door: { description: "The Gilded Doors, the way into the Starforge Spire." },
    enterId: "darko/spire-gilded-doors", canEnter: true,
    facts: [{ label: "backing", value: "✦ 3" }, { label: "empty", value: "  " }, null],
    relations: [
      { label: "leads into", items: [{ id: "darko/spire-gilded-vestibule", name: "Spire Gilded Vestibule" }] },
      { label: "holds", items: [] },
      { label: "sits inside", items: [{ id: "darko/spire-forecourt" }], more: true },
    ],
    back: { id: "darko/the-starforge-spire", name: "The Starforge Spire" },
  });
  assert.deepEqual(model.enter, { parcelId: "darko/spire-gilded-doors" }, "a mark's door rides the parcel's one key");
  assert.deepEqual(model.facts, [{ label: "backing", value: "✦ 3", detail: null }], "a fact with no value is not said (and one with no description has none: row 70)");
  assert.deepEqual(model.relations.map((r) => r.label), ["leads into", "sits inside"], "an empty relation is not said");
  assert.equal(model.relations[1].items[0].name, "darko/spire-forecourt", "a relative with no name reads as its id");
  assert.equal(model.relations[1].more, true);
  assert.deepEqual(model.back, { id: "darko/the-starforge-spire", name: "The Starforge Spire" });
  // a parcel's model is unchanged by any of it
  const parcel = homeColumnModel({ handle: "nyx", parcelId: "nyx/the-night-room-parcel", canEnter: true });
  assert.deepEqual([parcel.facts, parcel.relations, parcel.back], [[], [], null]);
});

test("a mark's relatives are buttons the viewer's root delegate reads, built without a string of markup", () => {
  const host = render(homeColumnModel({
    handle: "darko",
    facts: [{ label: "class", value: "<img src=x onerror=alert(1)>" }],
    relations: [{ label: "holds", items: [{ id: "darko/a", name: "<b>A</b>" }] }],
    back: { id: "darko/b", name: "B" },
  }));
  const go = find(host, "button").filter((b) => b.attrs["data-homecol-go"]);
  assert.equal(go.length, 1);
  assert.equal(go[0].attrs["data-homecol-go"], "darko/a");
  assert.equal(serialize(go[0]), "<b>A</b>", "a resident's name arrives as letters");
  assert.equal(serialize(find(host, "dd")[0]), "<img src=x onerror=alert(1)>", "and so does a fact");
  const back = find(host, "button").filter((b) => b.attrs["data-homecol-back"]);
  assert.equal(back.length, 1, "the way back is in the nav");
  assert.ok(byClass(host, "wv-homecol-nav")[0].children.includes(back[0]));
  assert.equal(serialize(back[0]), "◂ B");
  const VIEWER = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  assert.match(VIEWER, /closest\("\[data-homecol-go\]"\)/, "the viewer's root delegate reads the relative's attribute");
  assert.match(VIEWER, /closest\("\.wv-bubble-back, \[data-homecol-back\]"\)/, "and the way back's");
});

test("a column spells out each icon's meaning beside it, and a key can only ever be a class name", () => {
  const model = homeColumnModel({
    handle: "darko",
    icons: [
      { key: "door", label: "door", meaning: "A door: entering it takes you somewhere else." },
      { key: "staked", label: "staked", meaning: "Staked: ✦ 3 behind it.", count: 3 },
      { key: "x\" onclick=\"y", label: "bad", meaning: "never" },
    ],
  });
  assert.deepEqual(model.icons.map((i) => i.key), ["door", "staked"], "a key that is not [a-z-] is dropped, not cleaned");
  const host = render(model);
  const rows = byClass(host, "wv-homecol-icon");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].attrs.title, "A door: entering it takes you somewhere else.", "the hover says it too");
  assert.equal(byClass(rows[0], "wv-ic")[0].className, "wv-ic ic-door", "the glyph is the page's masked span");
  assert.equal(serialize(rows[1]), "Staked: ✦ 3 behind it.");
  assert.deepEqual(homeColumnModel({ handle: "nyx" }).icons, [], "no icons handed in, none drawn");
});

// ── SHOW, DON'T LIST (play fix 41, Darko 20:14) ────────────────────────────

test("a mark's backing, size, moods and company are shapes: the ✦ and a number, its outline, bars, tokens", () => {
  const model = homeColumnModel({
    handle: "darko",
    stamps: 12,
    footprint: { w: 152.5, h: 280, ring: [[0, 0], [152.5, 0], [152.5, 280], [0, 280]] },
    bars: [{ label: "fear", value: 1, max: 3 }, { label: "bad", value: 1, max: 0 }],
    tokens: [
      { kind: "resident", id: "walker:visitor", name: "visitor", monogram: "V", color: "#88aaff" },
      { kind: "creature", id: "creature:wolf-251-play1", name: "a grey wolf", silhouette: "url(\"data:image/svg+xml,x\")" },
      { kind: "resident", id: "", name: "nobody" },
    ],
  });
  assert.equal(model.stamps, 12);
  assert.deepEqual(model.bars, [{ label: "fear", value: 1, max: 3 }], "a bar with no scale is not drawn");
  assert.deepEqual(model.tokens.map((t) => [t.kind, t.id]), [["resident", "walker:visitor"], ["creature", "creature:wolf-251-play1"]]);
  // a document that can build SVG draws the footprint; the stand-in grows the one call it needs
  const svgDoc = { ...doc, createElementNS: (_ns, tag) => element(tag) };
  const host = renderHomeColumn(svgDoc, element("aside"), model, { imagePath: shelfGate });
  const stamps = byClass(host, "wv-homecol-stamps")[0];
  assert.equal(serialize(stamps), "✦12", "the stamp and its number, nothing else");
  assert.equal(find(host, "polygon").length, 1, "the mark's own outline");
  assert.equal(serialize(byClass(host, "wv-extent-t")[0]), "152.5×280 m", "its size on it");
  assert.equal(byClass(host, "wv-homecol-bar-cell").filter((c) => c.className.includes("is-on")).length, 1, "one of three, lit");
  const toks = byClass(host, "wv-tok");
  assert.deepEqual(toks.map((t) => t.attrs["data-choose"]), ["walker:visitor", "creature:wolf-251-play1"], "a press opens it");
  assert.equal(toks[1].className, "wv-tok is-creature");
  assert.equal(byClass(toks[0], "wv-tok-leg").length, 2, "a resident: two stubby legs");
  assert.equal(byClass(toks[1], "wv-tok-leg").length, 0, "a creature: a diamond with no legs (WLD-82)");
  // without SVG the outline is left out, never drawn as a string
  const plain = render(model);
  assert.equal(find(plain, "polygon").length, 0);
});

// ── A RESIDENT'S PRONOUNS, BESIDE THE NAME (WLD-83, Darko 2026-10-20 08:44) ──

test("a resident's pronouns sit in the title row beside the name, as text; absent when unwritten", () => {
  const host = render(homeColumnModel({ handle: "sb-ash", title: "Ash", pronouns: "  they/<b>them</b>  " }));
  const [row] = byClass(host, "wv-homecol-titlerow");
  const [p] = byClass(row, "wv-homecol-pronouns");
  assert.ok(p, "the pronouns are in the title row");
  assert.equal(p.textContent, "they/<b>them</b>", "their words as letters, trimmed, never markup");
  assert.deepEqual(row.children.map((c) => c.className), ["wv-homecol-title", "wv-homecol-pronouns"], "right after the name");
  const none = render(homeColumnModel({ handle: "sb-dov", title: "Dov" }));
  assert.equal(byClass(none, "wv-homecol-pronouns").length, 0, "nothing written, nothing shown");
  assert.equal(homeColumnModel({ handle: "x", pronouns: "   " }).pronouns, null, "blank is not a word");
});

// ── THE WAY TO A RESIDENT'S PAGE (WLD-145; WLD-125 for the rest of the columns) ──
//
// Darko, 2026-11-01 19:18: "where (if at all) have we filed fixing the world page so resident
// columns link back to the resident page? like by clicking their name? we somehow lost that
// functionality." The column has always drawn "the resident page →" for a view that does not
// turn it off. A mark's view and a creature's turn it off (their handle is an author, or the
// town). The resident's own view was cut from a mark's and kept the switch (b06a478c8), so the
// one column whose handle IS the resident drew no link.

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

/** A closure function's own text from viewer.mjs, two-space indented (as outsider-and-fill.test.mjs lifts loadResidentRead). */
function bodyOf(name) {
  const text = SOURCE.match(new RegExp(`^  function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}`, "m"))?.[0];
  assert.ok(text, `source extraction: ${name}`);
  return text;
}

/**
 * The fold, as far as a boat is concerned: a timetable mark names her vessel by mark id, and the walkers
 * door publishes her under the bare handle (the same shape as viewer-axes.test.mjs). Synthetic.
 */
const FOLD = [
  { id: "the-town/the-wheelhouse", mechanic: "timetable", timetable: { vessel: "the-town/the-post-office", stops: [] } },
  { id: "the-town/the-post-office" },
];

/**
 * The view the page builds for a resident's column: residentColumnView's own body, run against
 * stand-ins for the page's state that nothing asserted here reads. The card is synthetic.
 */
function residentViewFor(card, handle = "rig-ash") {
  const context = vm.createContext({
    residentProfileView, residentHref, walkerHandleFromHoverId, walkingLabel, vesselHandles,
    residentHoldLines: () => null, handsLines: () => null,
    walkState: { walkers: [{ handle, standing: true }] }, hands: { for: null, holdings: null },
    faceOf: (h) => residentFace(h, { name: h === "rig-ash" ? "Rig Ash" : h, household: "rig-house" }),
    walkerPlace: () => "in the Town Centre", residentCloseLook: () => null, residentCard: () => card,
    worldEpoch: 1, state: { handle: "someone-else" }, onResidentPath: () => false, allMarks: () => FOLD,
    holdingFacts: () => [], closeLooks: new Map(), asWho: () => "", markIdentity: (m) => m.id, byId: new Map(),
  });
  vm.runInContext(bodyOf("residentColumnView"), context);
  const made = context.residentColumnView(walkerHoverId(handle));
  assert.ok(made, "the page builds a column for a resident who is on the map");
  return made;
}

test("a view turns the way to the resident page off with `residentLink: false`, and only then", () => {
  const host = element("aside");
  const column = createHomeColumn({ doc, host, imagePath: shelfGate, residentHref: (h) => `/residents/${h}/` });
  column.open({ ...view("a/p", "aaa"), door: { description: "words" } });
  assert.equal(byClass(host, "wv-homecol-resident")[0]?.getAttribute("href"), "/residents/aaa/", "a view that says nothing gets the way to its handle's page");
  column.open({ ...view("b/p", "bbb"), door: { description: "words" }, residentLink: false });
  assert.equal(byClass(host, "wv-homecol-resident").length, 0, "a view that turns it off gets none");
  // ⚑ THE FLIP: paint `residentHref: null` for every view (drop the call in createHomeColumn) → the first line reds;
  //   ignore view.residentLink → the second reds
});

test("A RESIDENT'S COLUMN LINKS TO THEIR PAGE: the view the page builds does not turn it off, and the real column draws it", () => {
  const v = residentViewFor({ profile: { bio: "A figure by the lamp." } });
  assert.notEqual(v.residentLink, false, "the resident's view leaves the way to their page on");
  const host = element("aside");
  createHomeColumn({ doc, host, imagePath: shelfGate, residentHref }).open(v);
  const [out] = byClass(host, "wv-homecol-resident");
  assert.equal(out?.getAttribute("href"), "/residents/rig-ash/", "the link is the page's own resident route for this handle");
  assert.equal(serialize(out), "the resident page →");
  // ⚑ THE FLIP: put `residentLink: false` back on a resident's view in residentColumnView (the branch that is not a boat's) → this reds at the notEqual
});

test("[pin] a mark's column and a creature's column still turn the resident link off: their handle is an author or the town, not a resident", () => {
  // text pins, because those two builders are closures far too wide to run here; the behaviour they
  // switch is the controller's, tested above. WLD-125 decides, link by link, which of them gain one.
  assert.match(bodyOf("markColumnView"), /residentLink: false,/, "a mark's handle is the household that made it");
  assert.match(bodyOf("creatureColumnView"), /residentLink: false,/, "a creature's handle is the town's");
  // ⚑ THE FLIP: delete either line → its assertion reds, and not the other
});

// ── THE COLOUR ITSELF (WLD-145, Darko 2026-11-01 19:18: "we also don't just SHOW the favorite color") ──

test("safeSwatch: a hex colour and nothing else, lowercased; a resident's word never reaches a style", () => {
  assert.equal(safeSwatch("#E6AC52"), "#e6ac52");
  assert.equal(safeSwatch("  #c90 "), "#c90");
  // a string that only ENDS in a valid hex is the leading anchor's to refuse: without the `^` each of these comes
  // back whole and would be written into a `style` (Truey's review of this PR, F2)
  const endsInHex = ["red;#fff", "x#fff", "url(x)#e6ac52", "red;background:url(https://evil.example/x);#fff"];
  for (const bad of ["red", "#abcd", "#abcde", "#12345g", "#1234567", "e6ac52", "rgb(1,2,3)", "url(x)", "#fff;background:url(javascript:1)", '#fff" onclick="x', ...endsInHex, "", null, undefined, 7])
    assert.equal(safeSwatch(bad), null, `refused: ${String(bad)}`);
});

test("a fact carries a swatch only when it is a colour; every other fact keeps its exact shape", () => {
  const model = homeColumnModel({ handle: "x", facts: [
    { label: "colour", value: "the running lamp · #E6AC52", swatch: "#E6AC52" },
    { label: "colour", value: "ember", swatch: "red; background:url(x)" },
    { label: "class", value: "room" },
  ] });
  assert.deepEqual(model.facts, [
    { label: "colour", value: "the running lamp · #E6AC52", detail: null, swatch: "#e6ac52" },
    { label: "colour", value: "ember", detail: null },
    { label: "class", value: "room", detail: null },
  ], "a valid swatch is kept lowercased; an invalid one, and a fact without one, have no swatch key at all");
});

test("THE COLOUR ITSELF: the line draws a chip before its words, the chip is a hex and nothing else, and the words are unchanged", () => {
  const host = render(homeColumnModel({ handle: "x", facts: [
    { label: "colour", value: "the running lamp · #e6ac52", swatch: "#e6ac52" },
    { label: "runs on", value: "Claude or Codex" },
  ] }));
  const [ddColour, ddRuns] = find(host, "dd");
  const [chip] = byClass(ddColour, "wv-homecol-swatch");
  assert.ok(chip, "the colour line has a chip");
  assert.equal(chip.getAttribute("style"), "background:#e6ac52", "painted with the one value");
  assert.equal(chip.getAttribute("aria-hidden"), "true", "the name and the hex are the words; the chip is only the look");
  assert.equal(ddColour.children[0], chip, "before the words");
  assert.equal(serialize(ddColour), "the running lamp · #e6ac52", "and the words are as they were");
  assert.equal(byClass(ddRuns, "wv-homecol-swatch").length, 0, "no other line has one");
  assert.equal(serialize(ddRuns), "Claude or Codex");
  // the sink checks as well as the model: a model built by hand with a hostile swatch draws none
  const hostile = renderHomeColumn(doc, element("aside"),
    { ...homeColumnModel({ handle: "x" }), facts: [{ label: "colour", value: "ember", detail: null, swatch: "red;background:url(x)" }] }, { imagePath: shelfGate });
  assert.equal(byClass(hostile, "wv-homecol-swatch").length, 0, "a swatch that is not a hex colour never becomes a style");
  assert.equal(serialize(find(hostile, "dd")[0]), "ember");
  // ⚑ THE FLIPS: drop the chip branch in renderHomeColumn → the first assertions red; let safeSwatch pass anything → the hostile line reds
});

test("THE COLOUR REACHES THE SCREEN: a resident's card, through the page's own resident view and the real column, draws the colour they chose and never the map's", () => {
  const draw = (card) => {
    const host = element("aside");
    createHomeColumn({ doc, host, imagePath: shelfGate, residentHref }).open(residentViewFor(card));
    return host;
  };
  const chosen = draw({ profile: { color: "#E6AC52", color_name: "the running lamp" } });
  assert.equal(byClass(chosen, "wv-homecol-swatch")[0]?.getAttribute("style"), "background:#e6ac52", "the colour they chose");
  assert.match(serialize(byClass(chosen, "wv-homecol-facts")[0]), /the running lamp · #e6ac52/, "beside its name and hex");
  // the page hands the column a face in the town's gold for a resident with no colour of their own;
  // none of that gold may arrive as a swatch
  assert.equal(byClass(draw({ profile: { bio: "A figure." } }), "wv-homecol-swatch").length, 0, "chose nothing, nothing drawn");
  assert.equal(byClass(draw({ profile: { color_name: "ember" } }), "wv-homecol-swatch").length, 0, "a name alone is words only");
  // ⚑ THE FLIP: drop `...(color ? { swatch: color } : {})` from residentProfileView → the first line reds
});

// ── THE BIO (WLD-145 c; Darko 2026-11-01 19:18: "the bio gets cut off") ─────
//
// Measured 2026-11-01 on the live roll (335 cards, 135 bios): every bio reaches the column's body
// whole through this code. The office refuses a bio over 400 characters (edit.mjs PROFILE_CAPS,
// a 422, never a clip) and its card keeps profile.bio as written, so a bio that reads cut was
// stored cut. This pin keeps the World half honest: nothing here shortens it, or adds an ellipsis.

test("THE BIO IS NEVER CUT HERE: one at the office's 400-character cap, ending mid-word as a writer left it, reaches the column whole", () => {
  const bio = "lanterns ".repeat(45).slice(0, 400);
  assert.equal(bio.length, 400);
  assert.ok(bio.endsWith("lant"), "the fixture ends mid-word");
  const draw = (card) => {
    const host = element("aside");
    createHomeColumn({ doc, host, imagePath: shelfGate, residentHref }).open(residentViewFor(card));
    return byClass(host, "wv-homecol-body")[0];
  };
  assert.equal(serialize(draw({ profile: { bio } })), bio, "every character, nothing added and nothing taken");
  assert.equal(residentProfileView({ profile: { bio: `  ${bio}  ` } }).bio, bio, "only the edges are trimmed");
  // two paragraphs keep both, in order
  const two = draw({ profile: { bio: "First, a few words.\n\nSecond, a few more." } });
  assert.deepEqual(two.children.map(serialize), ["First, a few words.", "Second, a few more."]);
  // ⚑ THE FLIP: `text(profile.bio)?.slice(0, 200)` in residentProfileView → the first assertion reds
});

// ── THE NAME IS THE LINK (WLD-145: "like by clicking their name?"; a resident's column only) ──

test("the name in the header links to the resident's page only when a view says its title is a person", () => {
  const person = homeColumnModel({ handle: "x", title: "Rig Ash", residentHref: "/residents/x/", titleLink: true });
  assert.equal(person.titleLink, true);
  assert.equal(homeColumnModel({ handle: "x", residentHref: "/residents/x/" }).titleLink, false, "a view that does not ask keeps its title as words");
  assert.equal(homeColumnModel({ handle: "x", titleLink: true }).titleLink, false, "no page to go to, no link");
  const [h2] = byClass(render(person), "wv-homecol-title");
  const [a] = find(h2, "a");
  assert.equal(a?.getAttribute("href"), "/residents/x/");
  assert.equal(a?.getAttribute("rel"), "noopener");
  assert.equal(serialize(h2), "Rig Ash", "the name itself is unchanged");
  const home = byClass(render(homeColumnModel({ handle: "x", title: "the Trueing-House", residentHref: "/residents/x/" })), "wv-homecol-title")[0];
  assert.equal(find(home, "a").length, 0, "a home's title is not a link");
  // ⚑ THE FLIPS: drop the model's `titleLink` → the first line reds; drop the renderer's branch → the href line reds
});

test("A RESIDENT'S NAME IS THEIR LINK: through the page's own resident view and the real column; a mark's and a creature's views do not ask for it", () => {
  const v = residentViewFor({ profile: { bio: "A figure." } });
  assert.equal(v.titleLink, true, "the page's resident view asks for it");
  const host = element("aside");
  createHomeColumn({ doc, host, imagePath: shelfGate, residentHref }).open(v);
  const [a] = find(byClass(host, "wv-homecol-title")[0], "a");
  assert.equal(a?.getAttribute("href"), "/residents/rig-ash/", "the name goes to the page's own resident route for this handle");
  assert.equal(serialize(a), "Rig Ash");
  assert.equal(byClass(host, "wv-homecol-resident").length, 1, "and the line at the foot is still there");
  assert.doesNotMatch(bodyOf("markColumnView"), /titleLink/, "WLD-125 decides, link by link, whether a mark's title is one");
  assert.doesNotMatch(bodyOf("creatureColumnView"), /titleLink/);
  // ⚑ THE FLIPS: drop `titleLink: true` from residentColumnView's flags → the first line reds; drop `titleLink: !!view.titleLink,` from the controller's paint → the href line reds
});

// ── A BOAT IS NOT A RESIDENT (Truey's review of this PR, F1) ────────────────
//
// A boat is a walker row the page keeps as a click target ("a boat too", viewer.mjs § walkerCandidatesAt), so a
// click on her reaches residentColumnView. Her handle is a vessel mark's bare id, not a household's: there is no
// resident page for it, so only a resident's column links.

test("A BOAT'S COLUMN HAS NO RESIDENT LINK, neither the name nor the foot line; a resident's, from the same fold, has both", () => {
  assert.equal(vesselHandles(FOLD).has("the-post-office"), true, "the fixture's boat is the fold's vessel");
  assert.equal(vesselHandles(FOLD).has("rig-ash"), false, "and the resident is not");
  const draw = (handle, card) => {
    const v = residentViewFor(card, handle);
    const host = element("aside");
    createHomeColumn({ doc, host, imagePath: shelfGate, residentHref }).open(v);
    return { v, host };
  };
  const boat = draw("the-post-office", null);   // the office has no resident card for a boat
  assert.equal(boat.v.residentLink, false, "the boat's view switches the link off");
  assert.notEqual(boat.v.titleLink, true, "and does not ask for the name link");
  assert.equal(byClass(boat.host, "wv-homecol-resident").length, 0, "no \"the resident page →\" for a boat");
  assert.equal(find(byClass(boat.host, "wv-homecol-title")[0], "a").length, 0, "and her name is not a link");
  assert.equal(serialize(byClass(boat.host, "wv-homecol-title")[0]), "the-post-office", "her column is still drawn, with her name");
  // the control: the same fold and the same stand-ins, a resident
  const person = draw("rig-ash", { profile: { bio: "A figure." } });
  assert.equal(byClass(person.host, "wv-homecol-resident").length, 1, "a resident, from the same fold, still has the foot line");
  assert.equal(find(byClass(person.host, "wv-homecol-title")[0], "a").length, 1, "and the name link");
  // ⚑ THE FLIPS: drop the vessel guard in residentColumnView → the boat's assertions red; make every walker a boat → the control reds;
  //   leave the name link's flag on a boat (the model gates it on the href, so it draws nothing) → only the notEqual reds
});

// ── THE PAGE HANDS THE COLUMN ITS residentHref (Truey's review of this PR, F3) ──

test("the page hands the column the real residentHref: the page's own createHomeColumn call, lifted and run, carries it", () => {
  // Every test above builds its own column, so none could see whether the page does. The call is lifted and run
  // rather than matched as text, so a commented-out line cannot satisfy it; its other arguments are stand-ins.
  const call = SOURCE.match(/^  const homeColumn = createHomeColumn\(\{[\s\S]*?^  \}\);/m)?.[0];
  assert.ok(call, "source extraction: the page's createHomeColumn call");
  let handed = null;
  const context = vm.createContext({
    createHomeColumn: (options) => { handed = options; return {}; },
    document: {}, $: () => null, root: {}, readHomePage: () => null, markImagePath: () => null, residentHref,
  });
  vm.runInContext(call, context);
  assert.ok(handed, "the call ran and reached the column");
  assert.equal(handed.residentHref, residentHref, "the column is handed the page's own residentHref, so every column's link is built by the one handle rule");
  // ⚑ THE FLIPS: drop `residentHref,` from the call → undefined, this reds; hand it any other function → not the page's own, this reds
});
