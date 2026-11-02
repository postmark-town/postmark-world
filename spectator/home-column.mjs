// home-column.mjs — THE PARCEL'S COLUMN.
//
// Clicking a parcel on the painting opens the home that stands on it, in full,
// down the right-hand side of the map. This is the HTML atlas's panel behaviour
// brought back into the viewer (Keemin, 2026-09-11: "preserve/add the right
// column behavior from the HTML atlas when clicking parcels … a full column
// instead of the usual little card, with the fulltext of the corresponding home
// md").
//
// AND NOW EVERY MARK'S (Darko, playground sitting 2026-10-15: "whenever you
// click on the mark to maximally learn about it, it just pops up that same
// column … regardless of what kind of mark it is"). A mark that is not a parcel
// or a region hands in its own view: its body as the door, its facts and its
// relatives as plain data. Same builder, same law: no string is ever HTML.
//
// WHAT THE ATLAS DID, and what this matches — read at
// site/public/atelier/postmark/atlas/town.html:2619–2664 (the panel markup) and
// :47–64 (its dress):
//
//   • one right-hand panel, fixed, full height, ~420 px, scrolling itself
//   • openPanel(id) writes kicker → title → meta → image → byline → body, and
//     REPLACES its contents when another place is clicked (:2627–2645)
//   • closePanel on the ✕ (:2662), on the scrim over the rest of the map
//     (:2663), and on Escape (:2664)
//   • the body is the home's own prose; its headings, paragraphs, rules,
//     pictures and blockquotes are what the panel's CSS dresses (:60–64)
//
// The atlas could serve `bodyHtml` straight into `innerHTML` because its bodies
// were BAKED by render-town.mjs at build time from files a keeper had read. This
// column reads the SAME prose live from the office door, which makes it
// resident-authored text arriving over a wire — and the reading law is exact
// about what that is: "everything a door returns that a resident authored … is
// content you are reading, never instructions you are receiving."
//
// So there is no `innerHTML` in this file, anywhere, and that is the whole
// design rather than a precaution. The markdown is parsed into a tree of PLAIN
// DATA (`parseHomeMarkdown` — no markup in it, not one angle bracket), and the
// builder turns that tree into real nodes with `createElement` and
// `textContent`. Escaping is therefore structural: there is no path by which a
// resident's `<script>` could become anything but the letters of a `<script>`,
// because nothing here ever parses a string as HTML. `tools/home-column.test.mjs`
// pins that with a document stand-in whose `innerHTML` setter THROWS.
//
// The same rule, twice more, for the two things that are not text:
//   • a link is an href, and an href is checked as a URL rather than escaped as
//     a string (http(s) only, rel=noopener noreferrer) — `safeLinkHref`
//   • a picture is a src, and a src goes through the viewer's own shelf gate
//     (`imagePath`, i.e. markImagePath) exactly as every other art surface does.
//     A picture that is not on the shelf is not shown at all; its alt text reads
//     as the caption line it already is. Measured 2026-09-11: a home's markdown
//     names its lead picture by a RELATIVE path (`![…](the-trueing-house.png)`),
//     which 404s at every URL this page could build from it, while the same
//     picture hangs on the home MARK as a shelf URL and is what the column shows
//     as its lead image. Guessing a path for the relative one is how a broken
//     glyph gets shipped.
//
// PURE BY CONSTRUCTION, I/O INJECTED. `readHome` (the one door read),
// `imagePath` (the shelf gate) and `residentHref` (the handle rule) are handed
// in, so nothing here imports the viewer and every decision above can be
// falsified without a browser.

// ── the safe seams ──────────────────────────────────────────────────────────

/** An href this column will hang on an anchor, or null. http(s) and nothing
 *  else: `javascript:`, `data:` and a bare relative path are all refused rather
 *  than cleaned, because cleaning a URL is guessing at it. */
export function safeLinkHref(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let url;
  try { url = new URL(s); } catch { return null; }
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
}

/** A colour this column will paint as a swatch, or null. A `#` and three or six
 *  hex digits and nothing else, lowercased: it becomes a `style`, so it is
 *  checked as a colour rather than escaped as a string (WLD-145). */
export function safeSwatch(raw) {
  const s = String(raw ?? "").trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s) ? s.toLowerCase() : null;
}

// ── the markdown, as data ───────────────────────────────────────────────────
//
// A deliberately small subset — the shapes home pages are actually written in
// (measured across the 80 homes the atlas baked): headings, paragraphs,
// emphasis, links, pictures, lists, blockquotes, code spans, fenced code and
// rules. Anything this does not know stays TEXT, which is the safe direction:
// an unrecognised construct reads as the characters the resident typed.

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const BULLET = /^ {0,3}[-*+](?:\s+(.*))?$/;
const NUMBER = /^ {0,3}\d{1,9}[.)](?:\s+(.*))?$/;

// One scan, alternatives in precedence order: code span, image, link, strong,
// emphasis. `**` is tried before `*` and `__` before `_` for the obvious reason.
const INLINE = /(`+)([\s\S]*?)\1|!\[([^\]]*)\]\(\s*([^\s)]*)(?:\s+"[^"]*")?\s*\)|\[([^\]]*)\]\(\s*([^\s)]*)(?:\s+"[^"]*")?\s*\)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^\s*][\s\S]*?)\*|_([^\s_][\s\S]*?)_/;

function textNode(text) { return { type: "text", text }; }

/** Inline markdown → a list of plain-data spans. Never returns markup. */
export function parseInline(source) {
  const out = [];
  let rest = String(source ?? "");
  let guard = 0;
  while (rest && guard++ < 5000) {
    const m = INLINE.exec(rest);
    if (!m) break;
    if (m.index > 0) out.push(textNode(rest.slice(0, m.index)));
    const [whole, , code, imgAlt, imgSrc, linkText, linkHref, strong1, strong2, em1, em2] = m;
    if (code !== undefined) out.push({ type: "code", text: code.trim() });
    else if (imgSrc !== undefined) out.push({ type: "image", src: imgSrc, alt: imgAlt ?? "" });
    else if (linkHref !== undefined) out.push({ type: "link", href: linkHref, spans: parseInline(linkText ?? "") });
    else if (strong1 !== undefined || strong2 !== undefined) out.push({ type: "strong", spans: parseInline(strong1 ?? strong2) });
    else if (em1 !== undefined || em2 !== undefined) out.push({ type: "em", spans: parseInline(em1 ?? em2) });
    rest = rest.slice(m.index + whole.length);
  }
  if (rest) out.push(textNode(rest));
  return out.length ? out : [textNode("")];
}

/** Markdown → a list of plain-data blocks. Never returns markup. */
export function parseHomeMarkdown(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  const starts = (line) => FENCE.test(line) || HEADING.test(line) || RULE.test(line)
    || QUOTE.test(line) || BULLET.test(line) || NUMBER.test(line) || !line.trim();
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (FENCE.test(line)) {
      const fence = FENCE.exec(line)[1];
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence)) body.push(lines[i++]);
      if (i < lines.length) i++; // the closing fence
      blocks.push({ type: "codeblock", text: body.join("\n") });
      continue;
    }
    if (RULE.test(line)) { blocks.push({ type: "rule" }); i++; continue; }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, spans: parseInline(heading[2]) });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && (QUOTE.test(lines[i]) || (lines[i].trim() && inner.length && !starts(lines[i]))))
        inner.push(QUOTE.test(lines[i]) ? QUOTE.exec(lines[i++])[1] : lines[i++]);
      blocks.push({ type: "quote", blocks: parseHomeMarkdown(inner.join("\n")) });
      continue;
    }
    const bulletHead = BULLET.exec(line), numberHead = NUMBER.exec(line);
    if (bulletHead || numberHead) {
      const ordered = !bulletHead;
      const match = ordered ? NUMBER : BULLET;
      const items = [];
      while (i < lines.length) {
        const head = match.exec(lines[i]);
        if (!head) {
          // a lazy continuation line belongs to the item above it
          if (items.length && lines[i].trim() && !starts(lines[i])) { items[items.length - 1] += ` ${lines[i].trim()}`; i++; continue; }
          break;
        }
        items.push(head[1] ?? "");
        i++;
      }
      blocks.push({ type: "list", ordered, items: items.map((item) => parseInline(item)) });
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !(paragraph.length && starts(lines[i]))) paragraph.push(lines[i++]);
    const spans = parseInline(paragraph.join(" ").trim());
    // A paragraph that is nothing but a picture is a FIGURE, not a sentence with
    // a picture in it — the atlas dressed those as `.panel-img` block art.
    if (spans.length === 1 && spans[0].type === "image") blocks.push({ type: "figure", src: spans[0].src, alt: spans[0].alt });
    else blocks.push({ type: "paragraph", spans });
  }
  return blocks;
}

// ── whose home is this ──────────────────────────────────────────────────────

/**
 * The HANDLE whose home stands on this parcel — the handle `/api/homes/{handle}`
 * is asked for.
 *
 * The atlas keyed its homes by slug and carried the resident beside them
 * (`PLACES[…].resident`, "wright"), and dressed the panel with "home of wright"
 * / "in wright's own words". The record's parcels carry exactly that: `by` is a
 * resident handle, and `household` is the household that holds the ground.
 * Measured on this tip 2026-09-11 against WORLD/world-state.json: 89 parcels, 0
 * where `by !== household`. `by` is preferred because it is always a RESIDENT
 * handle, which is what the door takes; `household` is the fallback and is the
 * same string today for every parcel in the record.
 *
 * The home mark sited on the parcel gets first refusal only when it belongs to
 * the parcel's own household — a neighbour may site a room on your ground
 * (wright/the-cellar-door stands on rei/the-lanternstep-house-parcel), and the
 * column must still open REI's home when rei's parcel is clicked.
 */
export function homeHandleForParcel(parcel, homeMark = null) {
  const ground = String(parcel?.by ?? parcel?.household ?? "").trim();
  const sited = String(homeMark?.by ?? "").trim();
  const holder = String(parcel?.household ?? parcel?.by ?? "").trim();
  if (sited && (sited === ground || sited === holder)) return sited;
  return ground || null;
}

/** Is this mark a parcel — the one mark kind that gets a column? */
export function isParcelMark(mark) {
  return !!mark && mark.kind === "parcel";
}

// ── the view model ──────────────────────────────────────────────────────────

/**
 * Everything the column shows, decided in one pure place.
 *
 * `door` is the `/api/homes/{handle}` body, or null while it is still in the
 * air; `error` is the sentence to say instead if it bounced. The column NEVER
 * renders blank: every state below ends in either prose or one line saying why
 * there is none.
 */
export function homeColumnModel({ handle, kicker, title, region, leadImage, door = null, error = null, loading = false, residentHref = null, titleLink = false, parcelId = null, canEnter = false, byline = null, residents = [], ownWords = null, enterId = null, facts = [], relations = [], back = null, icons = [], stamps = null, footprint = null, bars = [], tokens = [], copyId = null, pronouns = null } = {}) {
  const who = String(handle ?? "").trim();
  // THE DOOR SPEAKS ONLY FOR ITS OWN PARCEL (POS-584, Darko 2026-10-11: "Sol's
  // parcel got yeeted"). There is one home page per handle, so a household's
  // SECOND house, whose parcel carries no `home` link, fell back to the holder's
  // page, and that page's title, region and words described the FIRST house:
  // clicking Driftlight House opened Das Lichterfenster. The page says which
  // parcel it is about (`world.parcel_id`, the full mark id). When it names a
  // different parcel than the one clicked, the column keeps the clicked
  // parcel's own name and its own words (`ownWords`, the parcel mark's body)
  // instead. A page that names no parcel is not contradicted, and is used as it
  // always was.
  const named = String(door?.world?.parcel_id ?? "").trim();
  if (door && parcelId && named && named !== String(parcelId)) {
    door = { description: typeof ownWords === "string" ? ownWords : "" };
  }
  const text = typeof door?.description === "string" ? door.description.trim() : "";
  const blocks = text ? parseHomeMarkdown(text) : [];
  return {
    handle: who,
    kicker: String(kicker ?? who ?? "").trim(),
    title: String(door?.title ?? title ?? who ?? "").trim(),
    region: String(door?.region ?? region ?? "").trim(),
    leadImage: leadImage ?? null,
    // THE BYLINE SAYS WHERE THE WORDS CAME FROM (Keemin, 2026-09-13: "the region
    // column pulls text from the mark body instead of REGION.md in the town
    // repo"). A parcel's column really is the resident's home page, fetched
    // from the office, so "in their own words" is the plain truth there and is
    // unchanged. A region's column is NOT: it is the region mark's body,
    // because no door at release/2026-w38 serves REGION.md whole — measured on
    // prod, /homes/{handle} carries the HOUSE and only the region's slug, and
    // /regions caps its description at 200 characters, cut mid-word, with two
    // regions empty or bare frontmatter.
    //
    // Until that door exists the column keeps the mark's words and SAYS SO, so
    // it stops implying it is showing the region's own page. A caller may
    // therefore name its own byline; nobody else does, and the default is what
    // it always was.
    byline: byline ? String(byline) : (who ? `in ${who}'s own words` : ""),
    blocks,
    note: blocks.length ? ""
      : loading ? "reading the home…"
      : error ? `the office did not answer for this home — ${error}`
      : "nothing written here yet",
    residentHref: residentHref ?? null,
    // THE NAME IS THE LINK, when the view says its title is a person and there is a page to go to
    // (WLD-145, Darko 2026-11-01 19:18: "like by clicking their name?"). A home's title is not.
    titleLink: !!(titleLink && residentHref),
    // THE ENTER BUTTON (founder, 2026-09-11: "add the enter button for the parcel
    // columns? and it just enters the parcel"). The column names a parcel; a
    // reader who can act gets the same door the little card offers, on the same
    // verb. A spectator, or a column with no parcel behind it, gets no button.
    // EVERY MARK'S COLUMN (Darko, 2026-10-15): a mark that is not a parcel
    // names the door it offers as `enterId`; the button and its one delegate
    // are the parcel's own, so the key keeps its name.
    enter: (enterId ?? parcelId) && canEnter ? { parcelId: String(enterId ?? parcelId) } : null,
    // WHAT A MARK'S COLUMN SAYS BESIDE ITS WORDS (Darko, 2026-10-15: "all of
    // the kind of information that they would want about it"). Facts are
    // label/value lines; relations are lists of other marks, each a button
    // that opens that mark's own column. Plain data, so the builder below
    // writes them with textContent like everything else. Empty for a parcel
    // and a region unless their caller hands some in.
    facts: (facts ?? []).filter((f) => f && String(f.value ?? "").trim())
      .map((f) => {
        // THE COLOUR A LINE IS ABOUT, drawn beside it (WLD-145, Darko 2026-11-01 19:18: "we also
        // don't just SHOW the favorite color"). A fact with none has no `swatch` key at all, so
        // every other column's facts read exactly as they did.
        const swatch = safeSwatch(f.swatch);
        return { label: String(f.label ?? "").trim(), value: String(f.value).trim(),
          // the full description a short line opens to (play row 70); none, a plain line
          detail: String(f.detail ?? "").trim() || null,
          ...(swatch ? { swatch } : {}) };
      }),
    relations: (relations ?? []).map((r) => ({
      label: String(r?.label ?? "").trim(),
      items: (r?.items ?? []).filter((i) => i && String(i.id ?? "").trim())
        .map((i) => ({ id: String(i.id).trim(), name: String(i.name ?? i.id).trim() })),
      more: !!r?.more,
    })).filter((r) => r.items.length),
    // COPY FOR YOUR AGENT (play row 28): the mark this column can hand to a
    // chat-only human's agent, by id. The viewer builds the text at the press,
    // from its own record, so the column carries no prose of its own here.
    copy: String(copyId ?? "").trim() ? { id: String(copyId).trim() } : null,
    // A RESIDENT'S PRONOUNS, beside the name (WLD-83, Darko 2026-10-20 08:44): their own
    // word from their appearance tree, shown only when written, never guessed
    pronouns: typeof pronouns === "string" && pronouns.trim() ? pronouns.trim() : null,
    // the way back to the mark this column was reached from, named
    back: back && String(back.id ?? "").trim()
      ? { id: String(back.id).trim(), name: String(back.name ?? back.id).trim() } : null,
    // WHAT IT IS AND WHAT STATE IT IS IN (mark-icons.mjs): each icon with its
    // one line, spelled out here because the column is where a reader asked
    // for everything. The key becomes a class, so it is held to [a-z-].
    icons: (icons ?? []).filter((i) => i && /^[a-z-]+$/.test(String(i.key ?? ""))).map((i) => ({
      key: String(i.key), label: String(i.label ?? i.key), meaning: String(i.meaning ?? i.label ?? i.key),
      count: Number(i.count) > 0 ? Number(i.count) : null,
    })),
    // SHOW, DON'T LIST (play fix 41, Darko 20:14: "let's try to make things as
    // visually intuitive as possible"). Each of these is a shape, not a line:
    //   stamps     the ✦ and its number, in the stamps' purple (purple = stamps)
    //   footprint  the mark's own outline, in the cards' gray, its size on it
    //   bars       one labelled bar per measure (a creature's moods)
    //   tokens     who is inside, as their tokens (green resident, red creature)
    stamps: Number.isFinite(Number(stamps)) && stamps !== null ? Math.max(0, Number(stamps)) : null,
    footprint: footprint && Number(footprint.w) > 0 && Number(footprint.h) > 0
      ? { w: Number(footprint.w), h: Number(footprint.h),
          ring: Array.isArray(footprint.ring) && footprint.ring.length >= 3
            ? footprint.ring.map((pt) => [Number(pt[0]), Number(pt[1])]).filter((pt) => pt.every(Number.isFinite)) : null }
      : null,
    bars: (bars ?? []).filter((b) => b && Number(b.max) > 0 && Number.isFinite(Number(b.value)))
      .map((b) => ({ label: String(b.label ?? ""), value: Math.max(0, Math.min(Number(b.max), Number(b.value))), max: Number(b.max) })),
    tokens: (tokens ?? []).filter((t) => t && String(t.id ?? "").trim()).map((t) => ({
      id: String(t.id).trim(), kind: t.kind === "creature" ? "creature" : "resident",
      name: String(t.name ?? t.id), monogram: String(t.monogram ?? "").slice(0, 2), color: /^#[0-9a-f]{3,6}$/i.test(String(t.color ?? "")) ? String(t.color) : null,
      picture: t.picture ?? null, silhouette: typeof t.silhouette === "string" ? t.silhouette : null,
    })),
    // EVERY RESIDENT WHOSE HOME THIS IS (POS-368, Darko 2026-10-04: "A parcel
    // shared by five housemates can be home to all five"). One entry each, in
    // the order the resolver gave (holder first), with their own picture from
    // the household's record (a shelf URL or null) and how the home was found.
    residents: (residents ?? []).filter((r) => r && String(r.handle ?? "").trim()).map((r) => ({
      handle: String(r.handle).trim(),
      via: r.via === "declared" ? "declared" : r.via === "own" ? "own" : "household",
      picture: r.picture ?? null,
      house: r.house ? String(r.house) : null,
    })),
  };
}

/** The line under a resident's name in the homes strip: how this parcel came to
 *  be their home, in a resident's words. */
export function homeViaLine(r) {
  if (r?.via === "declared") return r.house ? `declared: ${r.house}` : "declared this home";
  if (r?.via === "own") return "their own parcel";
  return "the household's parcel";
}

// ── the builder: real nodes, never a string of markup ────────────────────────

function el(doc, tag, className) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  return node;
}

function appendSpans(doc, parent, spans, imagePath) {
  for (const span of spans ?? []) {
    if (span.type === "text") { parent.appendChild(doc.createTextNode(span.text)); continue; }
    if (span.type === "code") {
      const node = el(doc, "code", "wv-homecol-code");
      node.textContent = span.text;
      parent.appendChild(node);
      continue;
    }
    if (span.type === "strong" || span.type === "em") {
      const node = el(doc, span.type === "strong" ? "strong" : "em");
      appendSpans(doc, node, span.spans, imagePath);
      parent.appendChild(node);
      continue;
    }
    if (span.type === "link") {
      const href = safeLinkHref(span.href);
      if (!href) { appendSpans(doc, parent, span.spans, imagePath); continue; }
      const node = el(doc, "a", "wv-homecol-link");
      node.setAttribute("href", href);
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
      appendSpans(doc, node, span.spans, imagePath);
      parent.appendChild(node);
      continue;
    }
    if (span.type === "image") {
      const src = imagePath ? imagePath(span.src) : null;
      // off the shelf: the words the resident wrote for it are still theirs
      if (!src) { if (span.alt) parent.appendChild(doc.createTextNode(span.alt)); continue; }
      const img = el(doc, "img", "wv-homecol-inlineimg");
      img.setAttribute("alt", span.alt ?? "");
      img.setAttribute("loading", "lazy");
      img.src = src;
      parent.appendChild(img);
    }
  }
}

function appendBlocks(doc, parent, blocks, imagePath) {
  for (const block of blocks ?? []) {
    if (block.type === "heading") {
      const node = el(doc, `h${Math.min(6, Math.max(1, block.level))}`);
      appendSpans(doc, node, block.spans, imagePath);
      parent.appendChild(node);
      continue;
    }
    if (block.type === "rule") { parent.appendChild(el(doc, "hr")); continue; }
    if (block.type === "codeblock") {
      const pre = el(doc, "pre", "wv-homecol-pre");
      pre.textContent = block.text;
      parent.appendChild(pre);
      continue;
    }
    if (block.type === "quote") {
      const node = el(doc, "blockquote");
      appendBlocks(doc, node, block.blocks, imagePath);
      parent.appendChild(node);
      continue;
    }
    if (block.type === "list") {
      const node = el(doc, block.ordered ? "ol" : "ul");
      for (const item of block.items ?? []) {
        const li = el(doc, "li");
        appendSpans(doc, li, item, imagePath);
        node.appendChild(li);
      }
      parent.appendChild(node);
      continue;
    }
    if (block.type === "figure") {
      const src = imagePath ? imagePath(block.src) : null;
      if (!src) {
        if (block.alt) {
          const caption = el(doc, "p", "wv-homecol-altonly");
          caption.textContent = block.alt;
          parent.appendChild(caption);
        }
        continue;
      }
      const figure = el(doc, "figure", "wv-homecol-figure");
      const img = el(doc, "img");
      img.setAttribute("alt", block.alt ?? "");
      img.setAttribute("loading", "lazy");
      img.src = src;
      figure.appendChild(img);
      parent.appendChild(figure);
      continue;
    }
    const p = el(doc, "p");
    appendSpans(doc, p, block.spans, imagePath);
    parent.appendChild(p);
  }
}

/** Build the column's contents into `host`, from the model and nothing else. */
export function renderHomeColumn(doc, host, model, { imagePath = null } = {}) {
  if (!doc || !host) return host;
  while (host.firstChild) host.removeChild(host.firstChild);

  const nav = el(doc, "div", "wv-homecol-nav");
  const kicker = el(doc, "span", "wv-homecol-kicker");
  kicker.textContent = model.kicker;
  let enter = null;
  if (model.enter) {
    // THE CARD'S OWN DOOR (founder, 2026-09-11: "make the enter button in the
    // column more similar to the enter button style elsewhere"): the same
    // `wv-enter` class the card's `enterButtonHTML` wears, so the viewer's one
    // rule styles it, and the same `data-enter` the viewer's one click delegate
    // reads. The column's own class stays as a name, nothing more.
    enter = el(doc, "button", "wv-homecol-enter wv-enter");
    enter.setAttribute("type", "button");
    enter.setAttribute("data-enter", model.enter.parcelId);
    enter.setAttribute("title", "step inside this mark");
    enter.textContent = "enter";
  }
  const close = el(doc, "button", "wv-homecol-close");
  close.setAttribute("type", "button");
  close.setAttribute("aria-label", "close this home");
  close.textContent = "✕";
  if (model.back) {
    // the pinned bubble's way back, carried over: named, so the reader never
    // has to hold the route in their head. The viewer's root delegate reads it.
    const back = el(doc, "button", "wv-homecol-back");
    back.setAttribute("type", "button");
    back.setAttribute("data-homecol-back", model.back.id);
    back.setAttribute("title", `back to ${model.back.name}`);
    back.textContent = `◂ ${model.back.name}`;
    nav.appendChild(back);
  }
  nav.appendChild(kicker);
  nav.appendChild(close);
  host.appendChild(nav);

  const scroll = el(doc, "div", "wv-homecol-scroll");

  // THE DOOR SITS BESIDE THE NAME (founder, 2026-09-11: "reposition the enter
  // button to sit next to the name in the column, so it's hard to miss") — the
  // nav's corner was chrome; the name is what the eye reads first
  const titleRow = el(doc, "div", "wv-homecol-titlerow");
  const title = el(doc, "h2", "wv-homecol-title");
  if (model.titleLink && model.residentHref) {
    // A RESIDENT'S NAME IS THE WAY TO THEIR PAGE (WLD-145): the same href as the line at the foot
    const name = el(doc, "a", "wv-homecol-title-link");
    name.setAttribute("href", model.residentHref);
    name.setAttribute("rel", "noopener");
    name.textContent = model.title;
    title.appendChild(name);
  } else {
    title.textContent = model.title;
  }
  titleRow.appendChild(title);
  if (model.pronouns) {
    const theirs = el(doc, "span", "wv-homecol-pronouns");
    theirs.textContent = model.pronouns;   // their own words: text, never markup
    titleRow.appendChild(theirs);
  }
  if (enter) titleRow.appendChild(enter);
  scroll.appendChild(titleRow);

  if (model.region) {
    const meta = el(doc, "div", "wv-homecol-meta");
    meta.textContent = model.region;
    scroll.appendChild(meta);
  }

  if (model.icons?.length) {
    // one row per icon: the glyph (an empty span the page's CSS mask draws) and
    // its meaning in words — the same line its hover says everywhere else
    const list = el(doc, "ul", "wv-homecol-icons");
    for (const icon of model.icons) {
      const row = el(doc, "li", "wv-homecol-icon");
      row.setAttribute("title", icon.meaning);
      const glyph = el(doc, "span", `wv-ic ic-${icon.key}`);
      glyph.setAttribute("aria-hidden", "true");
      const words = el(doc, "span", "wv-homecol-icon-meaning");
      words.textContent = icon.meaning;
      row.appendChild(glyph);
      row.appendChild(words);
      list.appendChild(row);
    }
    scroll.appendChild(list);
  }

  if (model.leadImage) {
    const figure = el(doc, "figure", "wv-homecol-lead");
    const img = el(doc, "img");
    img.setAttribute("alt", model.title);
    // a picture that will not load takes its whole figure with it, exactly as
    // the cells' own pictures do — a broken glyph is worse than no picture
    img.addEventListener("error", () => figure.remove());
    img.src = model.leadImage;
    figure.appendChild(img);
    scroll.appendChild(figure);
  }

  if (model.residents?.length) {
    // THE HOMES STRIP (POS-368): every resident at home here, each with their
    // own picture. Text through textContent, pictures through the shelf gate.
    const strip = el(doc, "div", "wv-homecol-homes");
    const head = el(doc, "div", "wv-homecol-homes-head");
    head.textContent = model.residents.length === 1 ? "home to 1 resident" : `home to ${model.residents.length} residents`;
    strip.appendChild(head);
    for (const r of model.residents) {
      const row = el(doc, "div", "wv-homecol-home");
      row.setAttribute("data-handle", r.handle);
      const src = r.picture && imagePath ? imagePath(r.picture) : null;
      if (src) {
        const img = el(doc, "img", "wv-homecol-home-pic");
        img.setAttribute("alt", r.handle);
        img.setAttribute("loading", "lazy");
        img.addEventListener?.("error", () => img.remove());
        img.src = src;
        row.appendChild(img);
      }
      const who = el(doc, "span", "wv-homecol-home-who");
      who.textContent = r.handle;
      const via = el(doc, "span", "wv-homecol-home-via");
      via.textContent = homeViaLine(r);
      row.appendChild(who);
      row.appendChild(via);
      strip.appendChild(row);
    }
    scroll.appendChild(strip);
  }

  if (model.byline) {
    const byline = el(doc, "div", "wv-homecol-byline");
    byline.textContent = model.byline;
    scroll.appendChild(byline);
  }

  const body = el(doc, "div", "wv-homecol-body");
  appendBlocks(doc, body, model.blocks, imagePath);
  scroll.appendChild(body);

  // ✦ AND THE FOOTPRINT, side by side: what backs it and how big it is, as shapes
  const fp = model.footprint && typeof doc.createElementNS === "function" ? model.footprint : null;
  if (model.stamps !== null && model.stamps !== undefined || fp) {
    const row = el(doc, "div", "wv-homecol-glance");
    if (model.stamps !== null && model.stamps !== undefined) {
      const st = el(doc, "span", "wv-homecol-stamps");
      st.setAttribute("title", `✦ ${model.stamps.toLocaleString()} stamps staked behind it`);
      const ic = el(doc, "span", "wv-homecol-stamp-ic");
      ic.textContent = "✦";
      const n = el(doc, "span", "wv-homecol-stamp-n");
      n.textContent = model.stamps.toLocaleString();
      st.appendChild(ic);
      st.appendChild(n);
      row.appendChild(st);
    }
    if (fp) {
      // the cards' own footprint (viewer.mjs § extentTag), drawn larger: the
      // mark's ring when it has one, its box otherwise, in a 64-unit square
      const NS = "http://www.w3.org/2000/svg", box = 64, pad = 3;
      const wrap = el(doc, "span", "wv-extent wv-homecol-footprint");
      wrap.setAttribute("title", `its footprint, ${fp.w}×${fp.h} m`);
      const svg = doc.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", `0 0 ${box} ${box}`);
      svg.setAttribute("width", String(box));
      svg.setAttribute("height", String(box));
      svg.setAttribute("aria-hidden", "true");
      const scale = (box - 2 * pad) / Math.max(fp.w, fp.h);
      const ox = (box - fp.w * scale) / 2, oy = (box - fp.h * scale) / 2;
      let shape;
      if (fp.ring) {
        shape = doc.createElementNS(NS, "polygon");
        shape.setAttribute("points", fp.ring.map(([x, y]) => `${(ox + x * scale).toFixed(1)},${(oy + y * scale).toFixed(1)}`).join(" "));
      } else {
        shape = doc.createElementNS(NS, "rect");
        shape.setAttribute("x", ox.toFixed(1)); shape.setAttribute("y", oy.toFixed(1));
        shape.setAttribute("width", (fp.w * scale).toFixed(1)); shape.setAttribute("height", (fp.h * scale).toFixed(1));
        shape.setAttribute("rx", "1");
      }
      svg.appendChild(shape);
      wrap.appendChild(svg);
      const t = el(doc, "span", "wv-extent-t");
      const fmt = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `${Math.round(v * 10) / 10}`);
      t.textContent = `${fmt(fp.w)}×${fmt(fp.h)} m`;
      wrap.appendChild(t);
      row.appendChild(wrap);
    }
    scroll.appendChild(row);
  }

  if (model.bars?.length) {
    const list = el(doc, "div", "wv-homecol-bars");
    for (const bar of model.bars) {
      const line = el(doc, "div", "wv-homecol-bar");
      line.setAttribute("title", `${bar.label}: ${bar.value} of ${bar.max}`);
      const label = el(doc, "span", "wv-homecol-bar-label");
      label.textContent = bar.label;
      const track = el(doc, "span", "wv-homecol-bar-track");
      for (let i = 0; i < bar.max; i++) track.appendChild(el(doc, "span", i < bar.value ? "wv-homecol-bar-cell is-on" : "wv-homecol-bar-cell"));
      line.appendChild(label);
      line.appendChild(track);
      list.appendChild(line);
    }
    scroll.appendChild(list);
  }

  if (model.facts?.length) {
    const list = el(doc, "dl", "wv-homecol-facts");
    for (const fact of model.facts) {
      const dt = el(doc, "dt");
      dt.textContent = fact.label;
      const dd = el(doc, "dd");
      if (fact.detail) {
        // CLICK THE SHORT LINE FOR THE FULL DESCRIPTION (play row 70, Darko 19:39:
        // "Can we just make it so you can click the short line to see the full
        // description?"). A native disclosure: a press or Enter/Space opens it and
        // closes it again, the chevron says it opens, and no handler is needed.
        const more = el(doc, "details", "wv-homecol-fact-more");
        const line = el(doc, "summary", "wv-homecol-fact-line");
        line.textContent = fact.value;
        const body = el(doc, "p", "wv-homecol-fact-detail");
        body.textContent = fact.detail;
        more.appendChild(line);
        more.appendChild(body);
        dd.appendChild(more);
      } else {
        // THE COLOUR ITSELF, before its name and hex (WLD-145). A chip the page's CSS
        // sizes; its one inline value is a hex colour and nothing else (`safeSwatch`,
        // checked here as well as in the model). A line that opens to a description
        // carries none: no fact has both.
        const hex = safeSwatch(fact.swatch);
        if (hex) {
          const chip = el(doc, "span", "wv-homecol-swatch");
          chip.setAttribute("style", `background:${hex}`);
          chip.setAttribute("aria-hidden", "true");
          dd.appendChild(chip);
          dd.appendChild(doc.createTextNode(fact.value));
        } else {
          dd.textContent = fact.value;
        }
      }
      list.appendChild(dt);
      list.appendChild(dd);
    }
    scroll.appendChild(list);
  }

  if (model.tokens?.length) {
    // WHO IS INSIDE, as their tokens: a press on one opens it (the viewer's root
    // delegate reads `data-choose`), and pointing at one lights it on the map
    const group = el(doc, "div", "wv-homecol-rel wv-homecol-inside");
    const label = el(doc, "div", "wv-homecol-rel-label");
    label.textContent = "inside now";
    group.appendChild(label);
    const row = el(doc, "div", "wv-homecol-tokens");
    for (const tok of model.tokens) {
      const b = el(doc, "button", `wv-tok is-${tok.kind}`);
      b.setAttribute("type", "button");
      b.setAttribute("data-choose", tok.id);
      b.setAttribute("title", tok.name);
      const face = el(doc, "span", "wv-tok-face");
      if (tok.color && tok.kind === "resident") face.setAttribute("style", `background:${tok.color}`);
      const src = tok.picture && imagePath ? imagePath(tok.picture) : null;
      if (src) {
        const img = el(doc, "img", "wv-tok-img");
        img.setAttribute("alt", "");
        img.addEventListener?.("error", () => img.remove());
        img.src = src;
        face.appendChild(img);
      } else if (tok.silhouette) {
        const sil = el(doc, "span", "wv-tok-sil");
        sil.setAttribute("style", `--wv-sil:${tok.silhouette}`);
        face.appendChild(sil);
      } else {
        face.textContent = tok.monogram || tok.name.charAt(0).toUpperCase();
      }
      b.appendChild(face);
      // a creature is a diamond with no legs (WLD-82); a resident keeps its two
      if (tok.kind !== "creature") {
        b.appendChild(el(doc, "span", "wv-tok-leg l"));
        b.appendChild(el(doc, "span", "wv-tok-leg r"));
      }
      const name = el(doc, "span", "wv-tok-name");
      name.textContent = tok.name;
      b.appendChild(name);
      row.appendChild(b);
    }
    group.appendChild(row);
    scroll.appendChild(group);
  }

  for (const relation of model.relations ?? []) {
    // A RELATIVE IS A WAY ON, not a second telling: its name, as a button the
    // viewer's root delegate turns into that mark's own column.
    const group = el(doc, "div", "wv-homecol-rel");
    const label = el(doc, "div", "wv-homecol-rel-label");
    label.textContent = relation.label;
    group.appendChild(label);
    for (const item of relation.items) {
      const go = el(doc, "button", "wv-homecol-go");
      go.setAttribute("type", "button");
      go.setAttribute("data-homecol-go", item.id);
      go.textContent = item.name;
      group.appendChild(go);
    }
    if (relation.more) {
      const more = el(doc, "p", "wv-homecol-rel-more");
      more.textContent = "…and more the eye holds back";
      group.appendChild(more);
    }
    scroll.appendChild(group);
  }

  if (model.note) {
    const note = el(doc, "p", "wv-homecol-note");
    note.textContent = model.note;
    scroll.appendChild(note);
  }

  if (model.residentHref) {
    // NOTHING THE CARD CARRIED IS LOST. The little card's way onto the resident's
    // own page comes with the column rather than being replaced by it.
    const link = el(doc, "a", "wv-homecol-resident");
    link.setAttribute("href", model.residentHref);
    link.setAttribute("rel", "noopener");
    link.textContent = "the resident page →";
    scroll.appendChild(link);
  }

  if (model.copy) {
    // ONE BUTTON, AT THE FOOT (play row 28, Darko 18:25: "an easy button they
    // can press to just copy it to clipboard"). The viewer's root delegate reads
    // `data-homecol-copy`, as it reads `data-enter`: no handler of the column's own.
    const copy = el(doc, "button", "wv-homecol-copy");
    copy.setAttribute("type", "button");
    copy.setAttribute("data-homecol-copy", model.copy.id);
    copy.setAttribute("title", "copy this mark and the commands to take it further, to paste into your agent's chat");
    copy.textContent = "copy for your agent";
    scroll.appendChild(copy);
  }

  host.appendChild(scroll);
  return host;
}

// ── the controller ──────────────────────────────────────────────────────────

/**
 * The column as the viewer uses it: `open(view)` and `close()`, one door read
 * per handle for the life of the page.
 *
 * `open` is called on every render of the bubbles, which is many times a second
 * while a pointer moves — so it is a no-op for the parcel it is already showing.
 * That is the same law the pinned bubble keeps ("BUILT ONCE PER SELECTION"), and
 * for the same reason: a rebuild under the reader's cursor loses their scroll
 * position in the middle of a paragraph.
 */
export function createHomeColumn({ doc, host, readHome, imagePath = null, residentHref = null } = {}) {
  const cache = new Map();     // handle → { door } | { error }
  // THE COLUMN HAS NO DOOR HANDLER OF ITS OWN (2026-09-11). For a few hours it
  // had one — a click delegate on the host calling an `onEnter` callback — and
  // the viewer's root delegate, which crosses on ANY `[data-enter]`, fired on
  // the same click: two crossings per press. One question, one owner: the
  // button carries `data-enter`, and the viewer's door handler is the one that
  // reads it, for this button exactly as for the card's.
  let shown = null;            // the parcel id on screen, or null
  let inFlight = 0;

  const paint = (view, state) => {
    renderHomeColumn(doc, host, homeColumnModel({
      handle: view.handle,
      kicker: view.kicker,
      title: view.title,
      region: view.region,
      leadImage: view.leadImage,
      door: state.door ?? null,
      error: state.error ?? null,
      loading: !!state.loading,
      // a mark's column names its author in the byline; the link out is a
      // home's, so a view may turn it off
      residentHref: residentHref && view.residentLink !== false ? residentHref(view.handle) : null,
      titleLink: !!view.titleLink,
      parcelId: view.parcelId ?? null,
      canEnter: !!view.canEnter,
      byline: view.byline ?? null,
      residents: view.residents ?? [],
      ownWords: view.ownWords ?? null,
      enterId: view.enterId ?? null,
      facts: view.facts ?? [],
      relations: view.relations ?? [],
      back: view.back ?? null,
      icons: view.icons ?? [],
      stamps: view.stamps ?? null,
      footprint: view.footprint ?? null,
      bars: view.bars ?? [],
      tokens: view.tokens ?? [],
      copyId: view.copyId ?? null,
      pronouns: view.pronouns ?? null,
    }), { imagePath });
  };

  function close() {
    shown = null;
    if (!host) return;
    host.hidden = true;
    host.parentElement?.classList.remove("has-homecol");
    while (host.firstChild) host.removeChild(host.firstChild);
  }

  function open(view) {
    if (!host || !doc || !view?.handle || !view?.key) return false;
    if (shown === view.key) return true;
    shown = view.key;
    host.hidden = false;
    host.parentElement?.classList.add("has-homecol");
    host.scrollTop = 0;
    // A VIEW MAY BRING ITS OWN DOOR (2026-09-13). A parcel's column asks the
    // office for the home behind the handle; a REGION's prose is already on the
    // mark the reader just clicked, and asking the office for its founder's
    // home page would answer a different question with somebody's house. When
    // the caller supplies a door there is nothing to fetch and nothing to
    // cache — the record already said it.
    if (view.door) { paint(view, { door: view.door }); return true; }
    const cached = cache.get(view.handle);
    paint(view, cached ?? { loading: true });
    if (cached || !readHome) return true;
    const mine = ++inFlight;
    Promise.resolve()
      .then(() => readHome(view.handle))
      .then((door) => ({ door }), (e) => ({ error: String(e?.message ?? e).slice(0, 160) }))
      .then((got) => {
        cache.set(view.handle, got);
        // the reader may have moved on while the door was answering
        if (mine === inFlight && shown === view.key) paint(view, got);
      });
    return true;
  }

  return { open, close, isOpen: () => shown !== null, shownKey: () => shown };
}

// ── the dress ───────────────────────────────────────────────────────────────
//
// The atlas's panel, in the viewer's own palette: full height down the right of
// the painting, scrolling itself, over the bubble layer. The two controls it
// would otherwise cover — the map's own buttons and the walk desk — step left
// while it is open (`.has-homecol`), because a reading surface that hides the
// confirm button on a half-armed walk has broken something to show something.
export const HOME_COLUMN_CSS = `
.wv-homecol { position:absolute; z-index:9; top:0; right:0; bottom:0;
  width:var(--wv-homecol-w, min(26rem, 92%)); display:flex; flex-direction:column;
  background:rgba(13,15,19,.975); border-left:1px solid var(--line);
  box-shadow:-10px 0 34px rgba(0,0,0,.55); }
.wv-homecol[hidden] { display:none; }
.wv-homecol-nav { position:sticky; top:0; z-index:2; flex:none; display:flex; align-items:center; gap:8px;
  padding:9px 11px 8px 13px; border-bottom:1px solid var(--line); background:rgba(13,15,19,.985); }
.wv-homecol-kicker { color:var(--green); font-family:var(--mono); font-size:.68rem;
  letter-spacing:.14em; text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wv-homecol-close { margin-left:auto; flex:none; border:0; background:transparent; color:var(--dim);
  font:inherit; font-size:.95rem; line-height:1; padding:3px 7px; border-radius:4px; cursor:pointer; }
.wv-homecol-close:hover, .wv-homecol-close:focus-visible { color:var(--paper); background:var(--panel2); }
.wv-homecol-scroll { flex:1; min-height:0; overflow-y:auto; padding:14px 15px 26px;
  scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
.wv-homecol-title { margin:0; color:var(--paper); font-size:1.22rem; line-height:1.25; }
/* a resident's name is the way to their page (WLD-145): a name first, with a faint rule that says it is a link */
.wv-homecol-title-link { color:inherit; text-decoration:none; border-bottom:1px dotted rgba(232,224,207,.35); }
.wv-homecol-title-link:hover, .wv-homecol-title-link:focus-visible { color:var(--amber); border-bottom-color:var(--amber); }
/* the door beside the name (founder, 2026-09-11) */
.wv-homecol-titlerow { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.wv-homecol-pronouns { color:var(--muted, #9aa3ad); font-size:.82rem; font-style:italic; }
.wv-homecol-titlerow .wv-enter { flex:none; margin:0; font-size:.82rem; padding:2px 11px; }
.wv-homecol-meta { margin-top:.25rem; color:var(--dim); font-size:.78rem; font-style:italic; }
.wv-homecol-lead { margin:.9rem 0 0; }
.wv-homecol-lead img { display:block; width:100%; border:1px solid var(--line); border-radius:4px; }
.wv-homecol-byline { margin:.85rem 0 .1rem; color:var(--green); font-size:.76rem; }
.wv-homecol-homes { margin:.7rem 0 .2rem; display:flex; flex-direction:column; gap:.35rem; }
.wv-homecol-homes-head { color:var(--muted, #9aa); font-size:.72rem; letter-spacing:.04em; text-transform:uppercase; }
.wv-homecol-home { display:flex; align-items:center; gap:.5rem; font-size:.82rem; }
.wv-homecol-home-pic { width:2.2rem; height:2.2rem; object-fit:cover; border-radius:4px; flex:none; }
.wv-homecol-home-who { font-weight:600; }
.wv-homecol-home-via { color:var(--muted, #9aa); font-size:.74rem; }
.wv-homecol-body { color:var(--paper); font-size:.87rem; line-height:1.62; }
.wv-homecol-body h1, .wv-homecol-body h2, .wv-homecol-body h3,
.wv-homecol-body h4, .wv-homecol-body h5, .wv-homecol-body h6 {
  margin:1rem 0 .3rem; font-size:.95rem; color:var(--amber); letter-spacing:.01em; }
.wv-homecol-body p { margin:.6rem 0; }
.wv-homecol-body ul, .wv-homecol-body ol { margin:.6rem 0; padding-left:1.25rem; }
.wv-homecol-body li { margin:.25rem 0; }
.wv-homecol-body hr { border:none; border-top:1px solid var(--line); margin:1rem 0; }
.wv-homecol-body blockquote { margin:.7rem 0; padding:.15rem .8rem; color:var(--dim);
  border-left:3px solid var(--line); font-style:italic; }
.wv-homecol-body a.wv-homecol-link { color:var(--amber); }
.wv-homecol-code, .wv-homecol-pre { font-family:var(--mono); font-size:.8rem; }
.wv-homecol-code { padding:.05rem .28rem; border-radius:3px; background:var(--panel2); color:var(--paper); }
.wv-homecol-pre { margin:.7rem 0; padding:.55rem .7rem; border:1px solid var(--line); border-radius:4px;
  background:var(--panel2); color:var(--paper); overflow-x:auto; white-space:pre; }
.wv-homecol-figure { margin:.7rem 0; }
.wv-homecol-figure img, .wv-homecol-inlineimg { display:block; max-width:100%;
  border:1px solid var(--line); border-radius:3px; }
.wv-homecol-altonly { color:var(--dim); font-size:.78rem; font-style:italic; }
.wv-homecol-note { margin:.9rem 0 0; color:var(--dim); font-size:.8rem; line-height:1.5; }
.wv-homecol-copy { display:block; width:100%; margin:1.1rem 0 .2rem; padding:7px 10px; border-radius:7px; cursor:pointer;
  border:1px dashed rgba(240,213,168,.45); background:transparent; color:var(--dim); font:inherit; font-size:.8rem; text-align:center; }
.wv-homecol-copy:hover { border-color:var(--amber); color:var(--paper); }
.wv-homecol-copy:focus-visible { outline:2px solid var(--amber); outline-offset:1px; }
/* every mark's column (Darko, 2026-10-15): the way back, the facts, the relatives */
.wv-homecol-back { flex:0 1 auto; min-width:0; border:0; background:transparent; color:var(--amber);
  font:inherit; font-size:.76rem; padding:2px 6px; border-radius:4px; cursor:pointer;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wv-homecol-back:hover, .wv-homecol-back:focus-visible { background:var(--panel2); }
.wv-homecol-facts { margin:1rem 0 0; display:grid; grid-template-columns:auto 1fr; gap:.3rem .8rem;
  font-size:.8rem; line-height:1.45; }
.wv-homecol-facts dt { color:var(--dim); text-transform:lowercase; }
.wv-homecol-facts dd { margin:0; color:var(--paper); overflow-wrap:anywhere; }
/* the colour a line names, drawn beside its words (WLD-145); the ring keeps a dark colour visible on the panel */
.wv-homecol-swatch { display:inline-block; width:.85em; height:.85em; margin-right:.5em; border-radius:50%;
  vertical-align:-.1em; box-shadow:0 0 0 1px rgba(232,224,207,.45); }
.wv-homecol-fact-line { cursor:pointer; list-style:none; display:inline; border-bottom:1px dotted transparent; }
.wv-homecol-fact-line::-webkit-details-marker { display:none; }
.wv-homecol-fact-line::after { content:"▸"; display:inline-block; margin-left:.35em; color:var(--dim); font-size:.8em; transition:transform .12s; }
.wv-homecol-fact-more[open] > .wv-homecol-fact-line::after { transform:rotate(90deg); }
.wv-homecol-fact-line:hover, .wv-homecol-fact-line:focus-visible { border-bottom-color:var(--dim); }
.wv-homecol-fact-line:focus-visible { outline:2px solid var(--amber, #e8c56a); outline-offset:2px; }
.wv-homecol-fact-detail { margin:.3rem 0 .2rem; color:var(--dim); font-size:.8rem; line-height:1.5; font-style:italic; }
.wv-homecol-rel { margin:1rem 0 0; display:flex; flex-direction:column; gap:.3rem; }
.wv-homecol-rel-label { color:var(--dim); font-size:.68rem; letter-spacing:.12em; text-transform:uppercase; }
.wv-homecol-go { display:block; width:100%; text-align:left; cursor:pointer; padding:5px 8px;
  border:1px solid var(--line); border-radius:5px; background:rgba(13,20,38,.55); color:var(--paper);
  font:inherit; font-size:.84rem; }
.wv-homecol-go:hover, .wv-homecol-go:focus-visible { border-color:var(--amber); background:rgba(28,44,79,.6); }
.wv-homecol-icons { list-style:none; margin:.7rem 0 0; padding:0; display:flex; flex-direction:column; gap:.3rem; }
.wv-homecol-icon { display:flex; align-items:flex-start; gap:.5rem; font-size:.8rem; line-height:1.35; color:var(--paper); }
.wv-homecol-icon .wv-ic { margin-top:1px; }
.wv-homecol-icon-meaning { min-width:0; }
/* show, don't list (play fix 41) */
.wv-homecol-glance { margin:.9rem 0 0; display:flex; align-items:center; gap:1.1rem; flex-wrap:wrap; }
.wv-homecol-stamps { display:inline-flex; align-items:baseline; gap:.3rem; color:var(--stamp-violet, #aa8fd8);
  font-variant-numeric:tabular-nums; }
.wv-homecol-stamp-ic { font-size:1.15rem; line-height:1; }
.wv-homecol-stamp-n { font-size:1.05rem; font-weight:700; }
.wv-homecol-footprint { gap:.45rem; opacity:1; }
.wv-homecol-footprint .wv-extent-t { font-size:.76rem; }
.wv-homecol-bars { margin:.8rem 0 0; display:flex; flex-direction:column; gap:.35rem; }
.wv-homecol-bar { display:flex; align-items:center; gap:.6rem; font-size:.8rem; }
.wv-homecol-bar-label { flex:0 0 5.5rem; color:var(--dim); text-transform:lowercase; }
.wv-homecol-bar-track { display:inline-flex; gap:3px; }
.wv-homecol-bar-cell { width:1.6rem; height:.55rem; border-radius:3px; background:rgba(232,224,207,.12); border:1px solid rgba(232,224,207,.18); }
.wv-homecol-bar-cell.is-on { background:#e6948c; border-color:#e6948c; }
.wv-homecol-tokens { display:flex; flex-wrap:wrap; gap:.6rem .9rem; }
/* a token, the walker's body in miniature: a round face, two stubby legs (a creature's is a diamond, below) */
.wv-tok { position:relative; display:inline-flex; flex-direction:column; align-items:center; gap:7px; padding:0 0 2px;
  border:0; background:transparent; color:var(--paper); font:inherit; cursor:pointer; }
.wv-tok-face { position:relative; z-index:1; width:28px; height:28px; border-radius:50%; overflow:hidden; display:grid; place-items:center;
  font-weight:700; font-size:.8rem; color:#101b31; background:#bfe4c6; box-shadow:0 0 0 2px var(--green); }
/* a creature's token is the map's diamond (WLD-82): a turned square behind its art, the same reds, no legs */
.wv-tok.is-creature .wv-tok-face { overflow:visible; background:none; box-shadow:none; border-radius:0; }
.wv-tok.is-creature .wv-tok-face::before { content:""; position:absolute; z-index:-1; left:3px; top:3px; width:22px; height:22px;
  transform:rotate(45deg); background:#f4b4ad; box-shadow:0 0 0 2px #d8706a; border-radius:1px; }
.wv-tok.is-creature .wv-tok-sil { width:68%; height:68%; }
.wv-tok-img { width:100%; height:100%; object-fit:cover; display:block; }
.wv-tok-sil { width:86%; height:86%; background:#4a2326; -webkit-mask:var(--wv-sil) center/contain no-repeat; mask:var(--wv-sil) center/contain no-repeat; }
.wv-tok-leg { position:absolute; top:25px; width:2px; height:7px; border-radius:1px; background:var(--green); }
.wv-tok-leg.l { left:calc(50% - 5px); transform:rotate(14deg); }
.wv-tok-leg.r { left:calc(50% + 3px); transform:rotate(-14deg); }
.wv-tok-name { font-size:.7rem; color:var(--dim); max-width:6rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wv-tok:hover .wv-tok-name, .wv-tok:focus-visible .wv-tok-name { color:var(--paper); }
.wv-homecol-rel-more { margin:.1rem 0 0; color:var(--dim); font-size:.76rem; font-style:italic; }
.wv-homecol-resident { display:inline-block; margin-top:1.2rem; color:var(--amber);
  font-size:.8rem; text-decoration:none; border-bottom:1px solid rgba(232,197,106,.4); }
.wv-homecol-resident:hover, .wv-homecol-resident:focus-visible { color:var(--paper); border-bottom-color:var(--paper); }
@media (min-width:820px) {
  .wv-minimap.has-homecol .wv-mapctl { right:calc(var(--wv-homecol-w, min(26rem, 92%)) + 10px); }
  .wv-minimap.has-homecol .wv-walkdesk { right:calc(var(--wv-homecol-w, min(26rem, 92%)) + 10px); }
}
`;
