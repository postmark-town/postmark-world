// mark-name.mjs — what a mark is called, read one way by the page and the verbs.
//
// A mark's name is the one its naming marks determined (the fold's `determined`,
// keyed `<id>::name`), else its slug read as words. The World page labels with it
// (spectator/viewer.mjs re-exports both functions), and the verbs say it in a
// sentence (WLD-5's exit lock: "Leave the Starforge Spire from here?"), so a mark
// is never called one thing on the map and another in the answer. Pure, browser-safe.

export function deslugMarkId(id) {
  const slug = String(id ?? "").split("/").filter(Boolean).pop() ?? "";
  const words = slug.split("-").filter(Boolean);
  const readable = [];
  for (const word of words) {
    if (word.toLowerCase() === "s" && readable.length) {
      readable[readable.length - 1] += "'s";
      continue;
    }
    readable.push(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }
  return readable.join(" ");
}

export function resolveMarkName(mark, determined = {}) {
  const key = `${mark?.id ?? ""}::name`;
  const won = determined instanceof Map ? determined.get(key) : determined?.[key];
  const name = String(won ?? "").trim();
  return name
    ? { name, determined: true }
    : { name: deslugMarkId(mark?.id), determined: false };
}

/** The name as it reads inside a sentence: a determined name exactly as it was
 *  given, and a name read off the slug with its leading "The" lowered ("you left
 *  the Starforge Spire"), since the capital is only the slug's. */
export function nameInSentence(markId, determined = {}) {
  const { name, determined: given } = resolveMarkName({ id: markId }, determined ?? {});
  return given ? name : name.replace(/^The /, "the ");
}
