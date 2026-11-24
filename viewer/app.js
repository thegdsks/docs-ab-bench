// Results viewer: reads raw run JSON files in the browser and derives every number from them.

/**
 * @typedef {{subject:string, arm:"baseline"|"context7", n:number, model:string, pass:boolean,
 *   mode:"oneshot"|"agentic", steps:number, context7Calls?:number,
 *   tokens:{input:number, output:number, total:number}, durationMs:number, startedAt:string}} Run
 * @typedef {{k:number, n:number, mean:number, min:number, max:number}} Stat
 */

const ARMS = /** @type {const} */ (["baseline", "context7"]);
const SVG_NS = "http://www.w3.org/2000/svg";

/** @type {{runs: Run[], batch: string, sample: boolean, mode: string}} */
const state = { runs: [], batch: "", sample: false, mode: "oneshot" };
/** @type {Map<string, Run[]>} */
let batches = new Map();

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {string} tag
 * @param {string} cls
 * @param {Record<string,string>} [attrs]
 * @param {(Node|string)[]} [kids]
 */
function h(tag, cls, attrs = {}, kids = []) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

/**
 * @param {string} tag
 * @param {Record<string,string|number>} attrs
 * @param {(Node|string)[]} [kids]
 */
function s(tag, attrs, kids = []) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
}

/** @param {unknown} r @returns {r is Run} */
function isRun(r) {
  if (!r || typeof r !== "object") return false;
  const o = /** @type {Record<string, any>} */ (r);
  return (
    typeof o.subject === "string" &&
    (o.arm === "baseline" || o.arm === "context7") &&
    (o.mode === "oneshot" || o.mode === "agentic") &&
    typeof o.pass === "boolean" &&
    typeof o.durationMs === "number" &&
    !!o.tokens && typeof o.tokens.total === "number"
  );
}

/** @param {number[]} xs @param {number} k @param {number} n @returns {Stat} */
function stat(xs, k = 0, n = xs.length) {
  const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  return { k, n, mean, min: xs.length ? Math.min(...xs) : 0, max: xs.length ? Math.max(...xs) : 0 };
}

/** Wilson 95% interval, honest about small n. @returns {[number, number]} */
function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const m = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - m), Math.min(1, c + m)];
}

/** @param {Run[]} runs */
function summarize(runs) {
  const passes = runs.filter((r) => r.pass).length;
  return {
    pass: stat(runs.map((r) => (r.pass ? 1 : 0)), passes, runs.length),
    tokens: stat(runs.map((r) => r.tokens.total)),
    time: stat(runs.map((r) => r.durationMs / 1000)),
    calls: stat(runs.map((r) => r.context7Calls ?? 0)),
  };
}

/** @param {Run[]} runs @param {"baseline"|"context7"} arm */
const armOf = (runs, arm) => summarize(runs.filter((r) => r.arm === arm));

const pct = (/** @type {number} */ x) => `${Math.round(x * 100)}%`;
const num = (/** @type {number} */ x) => Math.round(x).toLocaleString("en-US");
const secs = (/** @type {number} */ x) => `${x.toFixed(1)}s`;
const sign = (/** @type {number} */ x) => (x > 0 ? "+" : "");
const rate = (/** @type {Stat} */ p) => (p.n ? `${p.k}/${p.n}` : "no runs");

/** @param {number} a @param {number} b */
function relDelta(a, b) {
  return a ? `${sign(b - a)}${Math.round(((b - a) / a) * 100)}%` : "n/a";
}

/** @param {Stat} b @param {Stat} c */
function ppDelta(b, c) {
  if (!b.n || !c.n) return "n/a";
  const d = Math.round((c.k / c.n - b.k / b.n) * 100);
  return `${sign(d)}${d} pp`;
}

/** Cell tone: better is emerald, worse is rose, flat is muted. Lower is better unless told. */
function tone(/** @type {number} */ d, lowerBetter = true) {
  if (d === 0 || Number.isNaN(d)) return "text-neutral-600 dark:text-neutral-400";
  const good = lowerBetter ? d < 0 : d > 0;
  return good ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300";
}

function render() {
  const runs = state.runs.filter((r) => r.mode === state.mode);
  renderMode();
  $("sample-note").hidden = !state.sample;
  const all = state.runs.length;
  $("batch-meta").textContent = `${state.batch || "batch"} / ${all} runs / ${new Set(state.runs.map((r) => r.model)).size} model(s)`;

  const nB = runs.filter((r) => r.arm === "baseline").length;
  const nC = runs.filter((r) => r.arm === "context7").length;
  const small = Math.min(nB, nC) < 10;
  $("mode-hint").textContent =
    (state.mode === "oneshot"
      ? "Oneshot: file tools only, check runs once at the end. This is the first-try metric."
      : "Agentic: shell allowed, up to the step limit.") +
    ` ${nB} baseline and ${nC} context7 runs.` +
    (small ? " Small samples: read ranges, not point estimates." : "");

  renderHeadline(runs);
  renderTable(runs);
  renderCharts(runs);
}

function renderMode() {
  const box = $("mode-toggle");
  box.replaceChildren();
  for (const m of ["oneshot", "agentic"]) {
    const count = state.runs.filter((r) => r.mode === m).length;
    const on = state.mode === m;
    const b = h(
      "button",
      "rounded px-4 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 " +
        (on
          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
          : "text-neutral-700 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"),
      { type: "button", "aria-pressed": String(on) },
      [`${m} `, h("span", "font-mono text-xs tabular-nums opacity-80", {}, [`(${count})`])],
    );
    b.addEventListener("click", () => {
      state.mode = m;
      render();
    });
    box.append(b);
  }
}

/** @param {Run[]} runs */
function renderHeadline(runs) {
  const b = armOf(runs, "baseline"), c = armOf(runs, "context7");
  const card = (/** @type {string} */ label, /** @type {string} */ vb, /** @type {string} */ vc,
    /** @type {string} */ subB, /** @type {string} */ subC, /** @type {string} */ delta, /** @type {string} */ dTone) =>
    h("div", "rounded-lg border border-neutral-300 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900", {}, [
      h("p", "text-xs font-medium uppercase tracking-wider text-neutral-600 dark:text-neutral-400", {}, [label]),
      h("div", "mt-4 grid grid-cols-2 gap-3", {}, [
        h("div", "", {}, [
          h("p", "text-3xl font-semibold tabular-nums tracking-tight text-neutral-700 dark:text-neutral-300", {}, [vb]),
          h("p", "mt-1 text-xs text-neutral-600 dark:text-neutral-400", {}, ["baseline"]),
          h("p", "font-mono text-xs tabular-nums text-neutral-600 dark:text-neutral-400", {}, [subB]),
        ]),
        h("div", "", {}, [
          h("p", "text-3xl font-semibold tabular-nums tracking-tight text-emerald-800 dark:text-emerald-300", {}, [vc]),
          h("p", "mt-1 text-xs text-neutral-600 dark:text-neutral-400", {}, ["context7"]),
          h("p", "font-mono text-xs tabular-nums text-neutral-600 dark:text-neutral-400", {}, [subC]),
        ]),
      ]),
      h("p", `mt-4 border-t border-neutral-200 pt-3 text-sm font-medium tabular-nums dark:border-neutral-800 ${dTone}`, {}, [delta]),
    ]);

  const ci = (/** @type {Stat} */ p) => {
    const [lo, hi] = wilson(p.k, p.n);
    return `${p.k}/${p.n}, 95% CI ${pct(lo)} to ${pct(hi)}`;
  };
  const pd = b.pass.n && c.pass.n ? c.pass.k / c.pass.n - b.pass.k / b.pass.n : 0;
  const td = c.tokens.mean - b.tokens.mean;
  const dd = c.time.mean - b.time.mean;

  const row = $("headline");
  row.replaceChildren(
    card("Pass rate", b.pass.n ? pct(b.pass.k / b.pass.n) : "n/a", c.pass.n ? pct(c.pass.k / c.pass.n) : "n/a",
      `n=${b.pass.n} (${rate(b.pass)})`, `n=${c.pass.n} (${rate(c.pass)})`, `${ppDelta(b.pass, c.pass)}`, tone(pd, false)),
    card("Tokens per run", num(b.tokens.mean), num(c.tokens.mean),
      `n=${b.tokens.n}, ${num(b.tokens.min)} to ${num(b.tokens.max)}`, `n=${c.tokens.n}, ${num(c.tokens.min)} to ${num(c.tokens.max)}`,
      `${relDelta(b.tokens.mean, c.tokens.mean)} total tokens`, tone(td)),
    card("Time per run", secs(b.time.mean), secs(c.time.mean),
      `n=${b.time.n}, ${secs(b.time.min)} to ${secs(b.time.max)}`, `n=${c.time.n}, ${secs(c.time.min)} to ${secs(c.time.max)}`,
      `${relDelta(b.time.mean, c.time.mean)} wall time`, tone(dd)),
    card("Context7 calls", String(Math.round(b.calls.mean * b.calls.n)), String(Math.round(c.calls.mean * c.calls.n)),
      `n=${b.calls.n} runs`, `n=${c.calls.n} runs, ${c.calls.mean.toFixed(1)} per run`,
      `${c.calls.min} to ${c.calls.max} per context7 run`, "text-neutral-600 dark:text-neutral-400"),
  );
}

/** @param {Run[]} runs */
function bySubject(runs) {
  return [...new Set(runs.map((r) => r.subject))].sort().map((name) => {
    const rs = runs.filter((r) => r.subject === name);
    return { name, b: armOf(rs, "baseline"), c: armOf(rs, "context7") };
  });
}

/** @param {Run[]} runs */
function renderTable(runs) {
  const rows = bySubject(runs);
  const th = (/** @type {string} */ t, cls = "text-right") =>
    h("th", `px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-neutral-600 dark:text-neutral-400 ${cls}`, { scope: "col" }, [t]);
  const td = (/** @type {string} */ t, cls = "") => h("td", `px-3 py-2.5 text-right text-sm tabular-nums ${cls}`, {}, [t]);
  const group = (/** @type {string} */ t, span = 3) =>
    h("th", "border-l border-neutral-300 px-3 pb-1 pt-3 text-left text-xs font-semibold text-neutral-800 dark:border-neutral-700 dark:text-neutral-200", { colspan: String(span), scope: "colgroup" }, [t]);

  const head = h("thead", "bg-neutral-100 dark:bg-neutral-900", {}, [
    h("tr", "", {}, [
      h("th", "px-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-600 dark:text-neutral-400", { rowspan: "2", scope: "col" }, ["Subject"]),
      group("Pass (passed/runs)"), group("Tokens per run"), group("Seconds per run"), group("Context7 calls", 1),
    ]),
    h("tr", "border-b border-neutral-300 dark:border-neutral-700", {}, [
      th("base"), th("c7"), th("delta"), th("base"), th("c7"), th("delta"), th("base"), th("c7"), th("delta"), th("per run"),
    ]),
  ]);

  const body = h("tbody", "divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-950", {}, rows.map(({ name, b, c }) => {
    const pd = b.pass.n && c.pass.n ? c.pass.k / c.pass.n - b.pass.k / b.pass.n : 0;
    return h("tr", "hover:bg-neutral-50 dark:hover:bg-neutral-900", {}, [
      h("th", "px-3 py-2.5 text-left font-mono text-sm font-normal", { scope: "row" }, [name]),
      td(rate(b.pass), "border-l border-neutral-200 dark:border-neutral-800"), td(rate(c.pass)),
      td(ppDelta(b.pass, c.pass), `font-medium ${tone(pd, false)}`),
      td(num(b.tokens.mean), "border-l border-neutral-200 dark:border-neutral-800"), td(num(c.tokens.mean)),
      td(relDelta(b.tokens.mean, c.tokens.mean), `font-medium ${tone(c.tokens.mean - b.tokens.mean)}`),
      td(secs(b.time.mean), "border-l border-neutral-200 dark:border-neutral-800"), td(secs(c.time.mean)),
      td(relDelta(b.time.mean, c.time.mean), `font-medium ${tone(c.time.mean - b.time.mean)}`),
      td(c.calls.mean.toFixed(1), "border-l border-neutral-200 dark:border-neutral-800"),
    ]);
  }));

  const t = h("table", "w-full border-collapse", {}, [
    h("caption", "sr-only", {}, ["Per-subject results, baseline and context7 side by side"]), head, body,
  ]);
  $("table").replaceChildren(t);
}

/**
 * @param {string} title @param {string} yLabel @param {string} desc
 * @param {{name:string, b:Stat, c:Stat}[]} rows
 * @param {(st: Stat) => number} val @param {(st: Stat) => string} label @param {(v:number)=>string} tick
 * @param {number} [fixedMax]
 */
function chart(title, yLabel, desc, rows, val, label, tick, fixedMax) {
  const W = 560, H = 300, L = 56, R = 12, T = 22, B = 66;
  const iw = W - L - R, ih = H - T - B;
  const hi = Math.max(...rows.flatMap((r) => [r.b.max, r.c.max]), 1e-9);
  const max = fixedMax ?? niceMax(hi);
  const y = (/** @type {number} */ v) => T + ih - (v / max) * ih;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "w-full h-auto", role: "img", "aria-label": `${title}. ${desc}` });

  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    svg.append(
      s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "stroke-neutral-200 dark:stroke-neutral-800" }),
      s("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end", class: "fill-neutral-600 text-[11px] dark:fill-neutral-400" }, [tick(v)]),
    );
  }
  svg.append(
    s("line", { x1: L, x2: L, y1: T, y2: T + ih, class: "stroke-neutral-400 dark:stroke-neutral-600" }),
    s("line", { x1: L, x2: W - R, y1: T + ih, y2: T + ih, class: "stroke-neutral-400 dark:stroke-neutral-600" }),
    s("text", { x: 12, y: T + ih / 2, transform: `rotate(-90 12 ${T + ih / 2})`, "text-anchor": "middle", class: "fill-neutral-700 text-[11px] font-medium dark:fill-neutral-300" }, [yLabel]),
    s("text", { x: L + iw / 2, y: H - 6, "text-anchor": "middle", class: "fill-neutral-700 text-[11px] font-medium dark:fill-neutral-300" }, ["Subject"]),
  );

  const band = iw / rows.length, bw = Math.min(30, band / 2 - 6);
  rows.forEach((r, i) => {
    const cx = L + band * i + band / 2;
    [[r.b, -bw / 2 - 2, "fill-neutral-500 dark:fill-neutral-400"], [r.c, bw / 2 + 2, "fill-emerald-700 dark:fill-emerald-400"]].forEach(([st, dx, cls]) => {
      const sx = /** @type {Stat} */ (st), x = cx + /** @type {number} */ (dx) - bw / 2;
      const v = val(sx), top = y(v);
      svg.append(s("rect", { x, y: top, width: bw, height: Math.max(0, T + ih - top), rx: 2, class: /** @type {string} */ (cls) }));
      if (fixedMax === undefined && sx.n > 1) {
        const wx = x + bw / 2;
        svg.append(s("line", { x1: wx, x2: wx, y1: y(sx.min), y2: y(sx.max), class: "stroke-neutral-900 dark:stroke-neutral-100" }),
          s("line", { x1: wx - 3, x2: wx + 3, y1: y(sx.max), y2: y(sx.max), class: "stroke-neutral-900 dark:stroke-neutral-100" }),
          s("line", { x1: wx - 3, x2: wx + 3, y1: y(sx.min), y2: y(sx.min), class: "stroke-neutral-900 dark:stroke-neutral-100" }));
      }
      const lab = fixedMax === undefined ? label(sx) : `${sx.k}/${sx.n}`;
      const ly = fixedMax === undefined && sx.n > 1 ? Math.min(y(sx.max), top) - 6 : top - 6;
      svg.append(s("text", { x: x + bw / 2, y: Math.max(ly, 12), "text-anchor": "middle", class: "fill-neutral-800 text-[10px] dark:fill-neutral-200" }, [lab]));
    });
    const words = r.name.split("-");
    const mid = Math.ceil(words.length / 2);
    [words.slice(0, mid).join("-"), words.slice(mid).join("-")].forEach((ln, li) => {
      if (ln) svg.append(s("text", { x: cx, y: T + ih + 16 + li * 13, "text-anchor": "middle", class: "fill-neutral-700 text-[10px] dark:fill-neutral-300" }, [ln]));
    });
  });

  return h("figure", "rounded-lg border border-neutral-300 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900", {}, [
    h("figcaption", "mb-2 flex items-baseline justify-between", {}, [
      h("span", "text-sm font-semibold", {}, [title]),
      h("span", "text-xs text-neutral-600 dark:text-neutral-400", {}, [desc]),
    ]),
    svg,
  ]);
}

/** @param {number} v */
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 8 ? 8 : 10) * p;
}

/** @param {Run[]} runs */
function renderCharts(runs) {
  const subj = bySubject(runs);
  const pick = (/** @type {Stat} */ st) => st.mean;
  /** @param {"pass"|"tokens"|"time"|"calls"} m */
  const rows = (m) => subj.map((r) => ({ name: r.name, b: r.b[m], c: r.c[m] }));
  $("charts").replaceChildren(
    chart("Pass rate", "Pass rate", "label is passed/runs", rows("pass"), (st) => (st.n ? st.k / st.n : 0), (st) => `${st.k}/${st.n}`, (v) => pct(v), 1),
    chart("Tokens per run", "Total tokens", "mean, whiskers min to max", rows("tokens"), pick, (st) => num(st.mean), (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))),
    chart("Time per run", "Seconds", "mean, whiskers min to max", rows("time"), pick, (st) => `${Math.round(st.mean)}s`, (v) => `${Math.round(v)}s`),
    chart("Context7 calls per run", "Calls", "mean, whiskers min to max", rows("calls"), pick, (st) => st.mean.toFixed(1), (v) => v.toFixed(v < 4 ? 1 : 0)),
  );
}

/** @param {{run: Run, batch: string}[]} items @param {boolean} sample @param {number} skipped */
function ingest(items, sample, skipped) {
  const status = $("status");
  if (!items.length) {
    status.textContent = `No valid run files found${skipped ? ` (${skipped} skipped)` : ""}.`;
    return;
  }
  batches = new Map();
  for (const { run, batch } of items) batches.set(batch, [...(batches.get(batch) ?? []), run]);
  const names = [...batches.keys()].sort();
  const sel = /** @type {HTMLSelectElement} */ ($("batch-select"));
  sel.replaceChildren(...names.map((n) => h("option", "", { value: n }, [n])));
  $("batch-wrap").hidden = names.length < 2;
  setBatch(names[names.length - 1], sample);
  sel.value = state.batch;
  status.textContent = `Loaded ${items.length} runs from ${names.length} batch folder(s)${skipped ? `, skipped ${skipped} non-run file(s)` : ""}.`;
  const res = $("results");
  res.hidden = false;
}

/** @param {string} name @param {boolean} sample */
function setBatch(name, sample) {
  state.batch = name;
  state.runs = batches.get(name) ?? [];
  state.sample = sample || state.runs.some((r) => r.model.startsWith("sample"));
  const modes = new Set(state.runs.map((r) => r.mode));
  if (!modes.has(/** @type {"oneshot"|"agentic"} */ (state.mode))) state.mode = [...modes][0] ?? "oneshot";
  render();
}

/** @param {{file: File, path: string}[]} files @param {boolean} sample */
async function loadFiles(files, sample = false) {
  const items = [];
  let skipped = 0;
  for (const { file, path } of files) {
    if (!file.name.endsWith(".json")) { skipped++; continue; }
    try {
      const data = JSON.parse(await file.text());
      if (!isRun(data)) { skipped++; continue; }
      const parts = path.split("/").filter(Boolean);
      items.push({ run: data, batch: parts.length > 1 ? parts[parts.length - 2] : "batch" });
    } catch {
      skipped++;
    }
  }
  ingest(items, sample, skipped);
}

async function loadSample() {
  const base = new URL("fixtures/sample/", location.href);
  const status = $("status");
  try {
    const man = await (await fetch(new URL("manifest.json", base))).json();
    const runs = await Promise.all(/** @type {string[]} */ (man.files).map(async (f) => (await fetch(new URL(f, base))).json()));
    const items = runs.filter(isRun).map((run) => ({ run, batch: "sample" }));
    ingest(items, true, runs.length - items.length);
  } catch (err) {
    const why = err instanceof Error ? err.message : "unknown error";
    status.textContent = `Could not load the sample (${why}). Serve this folder over HTTP, for example python3 -m http.server.`;
  }
}

/** @param {FileSystemEntry} entry @returns {Promise<{file: File, path: string}[]>} */
async function walk(entry) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => /** @type {FileSystemFileEntry} */ (entry).file(res, rej));
    return [{ file: /** @type {File} */ (file), path: entry.fullPath }];
  }
  const reader = /** @type {FileSystemDirectoryEntry} */ (entry).createReader();
  /** @type {FileSystemEntry[]} */
  const all = [];
  for (;;) {
    const chunk = await new Promise((res, rej) => reader.readEntries(res, rej));
    if (!/** @type {FileSystemEntry[]} */ (chunk).length) break;
    all.push(.../** @type {FileSystemEntry[]} */ (chunk));
  }
  return (await Promise.all(all.map(walk))).flat();
}

function wire() {
  const picker = /** @type {HTMLInputElement} */ ($("picker"));
  picker.addEventListener("change", () => {
    loadFiles([...(picker.files ?? [])].map((file) => ({ file, path: file.webkitRelativePath || file.name })));
  });
  $("load-sample").addEventListener("click", loadSample);
  $("batch-select").addEventListener("change", (e) => setBatch(/** @type {HTMLSelectElement} */ (e.target).value, false));

  const drop = $("drop");
  for (const t of ["dragenter", "dragover"]) {
    drop.addEventListener(t, (e) => { e.preventDefault(); drop.dataset.over = "true"; });
  }
  for (const t of ["dragleave", "drop"]) {
    drop.addEventListener(t, () => { drop.dataset.over = "false"; });
  }
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    const entries = [...(e.dataTransfer?.items ?? [])].map((i) => i.webkitGetAsEntry()).filter((x) => !!x);
    const files = (await Promise.all(entries.map((en) => walk(/** @type {FileSystemEntry} */ (en))))).flat();
    loadFiles(files);
  });
  if (new URLSearchParams(location.search).has("sample")) loadSample();
}

wire();
