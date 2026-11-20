// WLD-43: the compact table (median [min–max], n = 3 runs per row) from the per-run results.
import fs from "node:fs";
const DIR = "G:/temp/claude/G--Wright-HQ/80359049-1e77-4fcb-92bb-19363501e34d/scratchpad/wld43/results";
const runs = fs.readdirSync(DIR).filter((f) => /-r\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8")));
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const st = (a, d = 0) => `${q(a, 0.5).toFixed(d)} [${Math.min(...a).toFixed(d)}–${Math.max(...a).toFixed(d)}]`;
const g = {};
for (const o of runs) (g[`${o.case}${o.nogpu ? "-nogpu" : ""} ${o.throttle}x`] ??= []).push(o);
const ph = (o, k) => {
  const [a, b] = o.phases[k], prev = o.metrics[{ load: "start", rollin: "load", idle: "rollin", pan: "idle" }[k]];
  const fr = o.frames.filter((t) => t >= a && t <= b), d = fr.slice(1).map((t, i) => t - fr[i]);
  const lt = o.lt.filter(([s]) => s >= a && s <= b);
  return { busy: 100 * (o.metrics[k].TaskDuration - prev.TaskDuration) * 1000 / (b - a), fps: d.length / ((b - a) / 1000), p50: q(d, 0.5), p95: q(d, 0.95), ltN: lt.length, ltMs: lt.reduce((x, [, y]) => x + y, 0), layouts: o.metrics[k].LayoutCount - prev.LayoutCount };
};
const order = ["c243-rm", "c243", "now-rm", "now", "c243-nogpu", "now-nogpu"];
const rows = Object.entries(g).sort(([a], [b]) => { const [ca, ta] = a.split(" "), [cb, tb] = b.split(" "); return ta.localeCompare(tb) || order.indexOf(ca) - order.indexOf(cb); });
const out = [];
out.push("case | n | map ms | Mists painted ms | settled ms | load long tasks (count, total ms) | idle main-thread busy % | idle frames/s | idle layouts/10 s | pan p50 ms | pan p95 ms | pan long tasks (count, total ms) | pan moves in 10 s | heap after GC MiB");
for (const [k, list] of rows) {
  const P = (f, d) => st(list.map(f), d);
  out.push([k, list.length, P((o) => o.mapAtMs), list[0].mistsPaintAtMs ? P((o) => o.mistsPaintAtMs) : "–", P((o) => o.phases.load[1]),
    `${P((o) => ph(o, "load").ltN)}, ${P((o) => ph(o, "load").ltMs)}`, P((o) => ph(o, "idle").busy), P((o) => ph(o, "idle").fps), P((o) => ph(o, "idle").layouts),
    P((o) => ph(o, "pan").p50, 1), P((o) => ph(o, "pan").p95, 1), `${P((o) => ph(o, "pan").ltN)}, ${P((o) => ph(o, "pan").ltMs)}`, P((o) => o.panMoves), P((o) => o.metrics.afterGC.JSHeapUsedSize / 2 ** 20, 1)].join(" | "));
}
const text = out.join("\n");
fs.writeFileSync(`${DIR}/../table.txt`, text);
console.log(text);
