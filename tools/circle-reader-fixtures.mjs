// circle-reader-fixtures.mjs — INVENTED speech in the producer's envelopes, for tools/circle-reader.test.mjs.
//
// The room is CORE-70's worked example (Wright's pasted materials on CORE-82; "Cave Interior", the handles are made up), laid in the
// shapes POS-1035 serves (/var/tmp/POS-1035-envelopes.md; the producer's own examples are
// /home/seat/rigs/starforge/briefs/POS-1035-circle-fixtures-paged.json). Nothing here is a resident's speech, and nothing derives a
// field the producer does not serve: `depth` is carried as data and never read by the reader; `circle` is the top id.

const T0 = Date.UTC(2026, 10, 14, 20, 0, 0);
const iso = (min, sec = 0) => new Date(T0 + min * 60_000 + sec * 1000).toISOString();

export const say = (id, handle, min, said, reply_to, circle, extra = {}) => ({
  handle, standing: "resident", said, at: iso(min), at_ms: T0 + min * 60_000, x: 0, y: 0, id,
  ...(reply_to !== undefined ? { reply_to } : {}), circle, ...extra,
});

// 14 says, 7 speakers, 3 top circles (the sitting's corrected counts)
export const TABLE = [
  say(50101, "pica", 1, "Welcome, everyone! Sorbet's on the counter…", undefined, 50101),
  say(50102, "seth", 3, "Is the lemon one sour?", 50101, 50101),
  say(50103, "pica", 3, "Very. That's the point.", 50102, 50101),
  say(50104, "seth", 4, "Then I'm in.", 50103, 50101),
  say(50105, "claran", 5, "Who painted the sign outside?", 50101, 50101),
  say(50106, "amia", 6, "Iris did, I think.", 50105, 50101),
  say(50107, "noe", 7, "Anyone heading to the harbour after this?", undefined, 50107),
  say(50108, "liv", 8, "Yes, the stew boat leaves at 22:00.", 50107, 50107),
  say(50109, "noe", 8, "Save me a seat.", 50108, 50107),
  say(50110, "claran", 10, "The moth with the paper glove?", 50106, 50101),
  say(50111, "vesper", 11, "…the Borrowed-Hand Moth.", 50110, 50101),
  say(50112, "amia", 12, "Pica, how long did the counter take?", 50101, 50101),
  say(50113, "pica", 12, "Three settlements and one argument…", 50112, 50101),
  say(50114, "liv", 14, "Lovely place.", undefined, 50114),
];
const lineWithDepth = (l, depth) => ({ ...l, depth });

const ROOM = { id: "t20260514-pica", live: true, place: "Cave Interior", at: { x: 0, y: 0 }, aboard: false, extent: null, started: iso(1), latest: iso(14), participants: ["pica", "seth", "claran", "amia", "noe", "liv", "vesper"], voice_count: 14 };
const stub = (circle, handle, opener, says, people, started, latest) => ({ circle, handle, opener, says, people, started, latest, read: { circle } });

/** `GET ?room=` as a spectator gets it: no "your circle", the top circles as stubs in the order they started */
export const roomFind = (over = {}) => ({
  now: iso(15), earshot_m: 60, settlement_since: iso(0),
  find: {
    room: ROOM, history: "complete", source: "record",
    circles: {
      room: { says: 14, people: 7, top_circles: 3 }, yours: null, lines: [], folded: [],
      elsewhere: [
        stub(50101, "pica", "Welcome, everyone! Sorbet's on the counter…", 10, 5, iso(1), iso(12, 6)),
        stub(50107, "noe", "Anyone heading to the harbour after this?", 3, 2, iso(7), iso(8, 6)),
        stub(50114, "liv", "Lovely place.", 1, 1, iso(14), iso(14)),
      ],
      counts: { lines: 0, folded_branches: 0, folded_says: 0, elsewhere: 3 }, budget: { bytes: 8192, used: 1022 },
    },
    ...over,
  },
});

/** circle 50101 whole: one opener, then THREE replies (a fork); each reply chain is a strand */
export const circle50101 = (over = {}) => ({
  now: iso(15),
  find: {
    circle: 50101, history: "complete", source: "record", room: ROOM,
    circle_read: {
      circle: 50101, path: [50101], says: 10, people: 5,
      lines: [
        lineWithDepth(TABLE[0], 0), lineWithDepth(TABLE[1], 1), lineWithDepth(TABLE[2], 2), lineWithDepth(TABLE[3], 3),
        lineWithDepth(TABLE[4], 1), lineWithDepth(TABLE[5], 2), lineWithDepth(TABLE[9], 3), lineWithDepth(TABLE[10], 4),
        lineWithDepth(TABLE[11], 1), lineWithDepth(TABLE[12], 2),
      ],
      next: null, complete: true, budget: { bytes: 8192, used: 3000 },
    },
    sparks: null, sparks_note: "no sparks are read for this circle",
    ...over,
  },
});

/** circle 50105 in TWO pages (a paged history): page 1 stops after 50106, the producer's `next` names the rest */
export const circle50105Page1 = () => ({
  find: {
    circle: 50105, history: "complete", source: "record", room: ROOM,
    circle_read: {
      circle: 50105, path: [50101, 50105], says: 4, people: 3,
      context: [{ ...TABLE[0], context: true }],
      lines: [lineWithDepth(TABLE[4], 0), lineWithDepth(TABLE[5], 1)],
      next: { circle: 50105, after: 50106 }, complete: false, budget: { bytes: 8192, used: 1500 },
    },
    sparks: { on: [], below: [] },
  },
});
export const circle50105Page2 = () => ({
  find: {
    circle: 50105, after: 50106, history: "complete", source: "record", room: ROOM,
    circle_read: {
      circle: 50105, path: [50101, 50105], says: 4, people: 3,
      lines: [lineWithDepth(TABLE[9], 2), lineWithDepth(TABLE[10], 3)],
      next: null, complete: true, budget: { bytes: 8192, used: 900 },
    },
    sparks: { on: [], below: [] },
  },
});

/** a NESTED circle read: path three deep, the ancestors on the first page as context so the back path can be named */
export const circle50106 = () => ({
  find: {
    circle: 50106, history: "complete", source: "record", room: ROOM,
    circle_read: {
      circle: 50106, path: [50101, 50105, 50106], says: 3, people: 3,
      context: [{ ...TABLE[0], context: true }, { ...TABLE[4], reply_to: 50101, context: true }],
      lines: [lineWithDepth(TABLE[5], 0), lineWithDepth(TABLE[9], 1), lineWithDepth(TABLE[10], 2)],
      next: null, complete: true, budget: { bytes: 8192, used: 900 },
    },
    sparks: null,
  },
});

/** a room that forks INSIDE a strand: 50106 gets two replies, so the strand ends there and two branches follow */
export const forkedLines = () => [
  say(60001, "ada", 1, "Shall we plan the picnic?", undefined, 60001),
  say(60002, "bo", 2, "Yes, Saturday.", 60001, 60001),
  say(60003, "cy", 3, "I'll bring bread.", 60002, 60001),
  say(60004, "di", 4, "And I the cheese.", 60002, 60001),
  say(60005, "cy", 5, "Rye or white?", 60003, 60001),
  say(60006, "ada", 6, "Rye.", 60005, 60001),
  say(60007, "ed", 7, "Count me in too.", 60001, 60001),
];

export const unavailableRoom = () => ({ find: { room: ROOM, history: "unavailable", source: "memory", note: "not in this office's memory of the town's talk", circles: { room: { says: 0, people: 0, top_circles: 0 }, yours: null, lines: [], folded: [], elsewhere: [], counts: {} } } });
export const emptyRoom = () => ({ find: { room: { ...ROOM, voice_count: 0 }, history: "complete", source: "record", circles: { room: { says: 0, people: 0, top_circles: 0 }, yours: null, lines: [], folded: [], elsewhere: [], counts: {} } } });
export const foldedRoom = () => { const r = roomFind(); r.find.history = "folded"; r.find.circles.more_circles = [50120, 50121]; return r; };
export const legacyRoom = () => ({ find: { room: ROOM, history: "complete", source: "memory", circles: { room: { says: 2, people: 2, top_circles: 0 }, yours: null, lines: [], folded: [], elsewhere: [], timeline: [
  { handle: "rei", standing: "resident", said: "Claran, hello", at: iso(1), at_ms: T0 + 60_000, x: 0, y: 0 },
  { handle: "claran", standing: "resident", said: "hi rei", at: iso(2), at_ms: T0 + 120_000, x: 1, y: 0 },
], counts: { timeline: 2 } } } });
export const brokenRoom = () => { const r = roomFind(); r.find.history = "unavailable"; r.find.circles.broken = [{ id: 50110, reply_to: 50106, handle: "claran", at: iso(10), note: "this say replies to one this read does not hold; read it with say { circle: <its id> }" }]; r.find.history = "folded"; return r; };
