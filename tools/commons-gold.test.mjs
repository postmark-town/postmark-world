// commons-gold.test.mjs — play row 66 (Darko 2026-10-16 18:55 and 19:06):
// "the yellow should be more of a postmark gold (for commons marks)"; "base
// gold, and then the season's color should override it during the season, as
// they already currently do on the prod site." Every rule that colours a
// commons (market) mark reads the site's own token, --pm-gold, with its base
// value as the viewer's default; the season sets it on .wv the way the World
// page's frame already sets --amber.
// Run: node --test tools/commons-gold.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

test("the viewer declares the site's tokens by their names, at the site's base values", () => {
  assert.match(SOURCE, /--pm-gold:#e8c48b; --pm-gold-bright:#f6dcae;/);
});

test("every commons rule reads --pm-gold, never the viewer's amber or a season colour", () => {
  for (const sel of ["\\.wv-hl-box\\.t-market", "\\.wv-hl-dot\\.t-market", "\\.wv-root-mark\\.t-market", "\\.wv-hl-label\\.t-market", "\\.wv-bubble\\.t-market", "\\.wv-bubble-back\\.t-market", "\\.wv-edge-indicator\\.t-market "]) {
    const m = SOURCE.match(new RegExp(sel + "[^{]*\{([^}]*)\}"));
    assert.ok(m, sel);
    assert.match(m[1], /var\(--pm-gold\)/, sel + " reads the gold");
    assert.doesNotMatch(m[1], /--amber|232,197,106|#f39a3d/, sel + " no amber, no season");
  }
  assert.match(SOURCE, /\.ov-pip \{ fill:var\(--pm-gold\);/, "the commons pip (the pip's default) is gold");
  assert.match(SOURCE, /\.wv-pill \{[^}]*--wv-mark-accent:var\(--pm-gold\);/, "and its pill");
  assert.match(SOURCE, /\.wv-fp\.t-market \{ stroke:color-mix\(in srgb, var\(--pm-gold\) 78%, #000\); \}/);
  assert.doesNotMatch(SOURCE, /t-market[^{]*\{[^}]*(--amber|232,197,106)/, "no commons rule left on the old yellow");
  assert.doesNotMatch(SOURCE, /#f39a3d/, "the viewer never hard-codes a season colour");
});
