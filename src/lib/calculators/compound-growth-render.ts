/**
 * compound-growth-render.ts: turns a GrowthResult into the results HTML for
 * the Wealth Over Time calculator. Used at build time (the page shows the
 * default example with JS off) and in the browser on every input change.
 * Only numbers and fixed copy are rendered; no user-typed text reaches the
 * markup.
 *
 * Copy rules: the return is the user's assumption, the projection
 * illustrates compounding and is never a prediction or promise; no em
 * dashes; never "you should"; plain words for people new to investing.
 */

import { DELAY_YEARS, type GrowthResult, type YearPoint } from "./compound-growth";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

export const $ = (n: number) => (Number.isFinite(n) ? money.format(Math.round(n)) : "n/a");
/** 0.07 -> "7%", 0.065 -> "6.5%". */
export const pct = (n: number) => `${Number((n * 100).toFixed(2))}%`;

export const RETURN_NOTE =
  "7% is roughly the long-run historical average for diversified stocks after inflation. History is not a promise.";

export const DISCLAIMER =
  "An illustration of how compounding works, not a prediction. Real returns go up and down, some years are negative, and no investment is certain to earn the rate you pick. Fees and taxes are left out.";

const yrs = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;

/* ------------------------------------------------------------------ */
/* Chart (inline SVG, no library)                                      */
/* ------------------------------------------------------------------ */

const W = 640;
const H = 300;
const M = { l: 60, r: 16, t: 16, b: 40 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * p >= v) return s * p;
  return 10 * p;
}

const shortMoney = (n: number) =>
  n >= 1_000_000 ? `$${Number((n / 1_000_000).toFixed(1))}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;

function yearTicks(years: number): number[] {
  const step = years <= 10 ? 1 : years <= 20 ? 2 : years <= 30 ? 5 : 10;
  const out: number[] = [];
  for (let y = 0; y <= years; y += step) out.push(y);
  if (out[out.length - 1] !== years) out.push(years);
  // Drop a tick that would crowd the final one.
  if (out.length > 2 && years - out[out.length - 2] < step / 2) out.splice(out.length - 2, 1);
  return out;
}

export function renderChart(r: GrowthResult): string {
  const years = r.now.years;
  const top = niceMax(Math.max(r.now.futureValue, 1));
  const x = (y: number) => M.l + (years === 0 ? 0 : (y / years) * (W - M.l - M.r));
  const yv = (v: number) => H - M.b - (v / top) * (H - M.t - M.b);
  const base = yv(0).toFixed(1);

  const area = (pts: YearPoint[], key: "balance" | "contributed", offset = 0) =>
    `M${x(pts[0].year + offset).toFixed(1)} ${base} ` +
    pts.map((p) => `L${x(p.year + offset).toFixed(1)} ${yv(p[key]).toFixed(1)}`).join(" ") +
    ` L${x(pts[pts.length - 1].year + offset).toFixed(1)} ${base} Z`;
  const line = (pts: YearPoint[], key: "balance" | "contributed", offset = 0) =>
    pts.map((p, k) => `${k ? "L" : "M"}${x(p.year + offset).toFixed(1)} ${yv(p[key]).toFixed(1)}`).join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * top);
  const grid = ticks
    .map((v) => `<line class="cg-grid" x1="${M.l}" x2="${W - M.r}" y1="${yv(v).toFixed(1)}" y2="${yv(v).toFixed(1)}"/><text class="cg-axis" x="${M.l - 8}" y="${(yv(v) + 4).toFixed(1)}" text-anchor="end">${shortMoney(v)}</text>`)
    .join("");
  const xTicks = yearTicks(years)
    .map((y) => `<text class="cg-axis" x="${x(y).toFixed(1)}" y="${H - M.b + 18}" text-anchor="middle">${y}</text>`)
    .join("");
  const xLabel = `<text class="cg-axis" x="${((M.l + W - M.r) / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">Years from today</text>`;

  // The late starter begins DELAY_YEARS in and ends on the same final year.
  const offset = years - r.laterYears;
  const later = r.laterYears > 0
    ? `<path class="cg-later" d="${line(r.later.series, "balance", offset)}"/><line class="cg-start" x1="${x(offset).toFixed(1)}" x2="${x(offset).toFixed(1)}" y1="${M.t}" y2="${base}"/><text class="cg-axis cg-start-label" x="${(x(offset) + 4).toFixed(1)}" y="${M.t + 10}">Late start</text>`
    : "";

  const desc = `Balance each year for ${yrs(years)}: ${$(r.now.futureValue)} at the end, of which ${$(r.now.contributed)} is money put in and ${$(r.now.growth)} is growth.${r.laterYears > 0 ? ` A dashed line shows the same plan started ${DELAY_YEARS} years later, ending at ${$(r.later.futureValue)}.` : ""}`;

  const legend = `<ul class="cg-legend"><li class="cg-l-growth"><span class="cg-key" aria-hidden="true"></span>Growth</li><li class="cg-l-paid"><span class="cg-key" aria-hidden="true"></span>Money you put in</li>${r.laterYears > 0 ? `<li class="cg-l-later"><span class="cg-key" aria-hidden="true"></span>Starting ${DELAY_YEARS} years later</li>` : ""}</ul>`;

  return `${legend}<svg class="cg-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="cg-chart-title cg-chart-desc"><title id="cg-chart-title">Your balance year by year</title><desc id="cg-chart-desc">${desc}</desc>${grid}<path class="cg-area-total" d="${area(r.now.series, "balance")}"/><path class="cg-area-paid" d="${area(r.now.series, "contributed")}"/><path class="cg-line-total" d="${line(r.now.series, "balance")}"/>${later}${xTicks}${xLabel}</svg>`;
}

function renderTable(r: GrowthResult): string {
  const step = r.now.years <= 10 ? 1 : 5;
  const rows = r.now.series.filter((p) => p.year > 0 && (p.year % step === 0 || p.year === r.now.years));
  return `<details class="cg-table-view"><summary>Year-by-year table</summary><div class="cg-scroll"><table class="cg-table"><thead><tr><th scope="col">Year</th><th scope="col">Put in</th><th scope="col">Growth</th><th scope="col">Balance</th></tr></thead><tbody>${rows
    .map((p) => `<tr><th scope="row">${p.year}</th><td>${$(p.contributed)}</td><td>${$(p.growth)}</td><td>${$(p.balance)}</td></tr>`)
    .join("")}</tbody></table></div></details>`;
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

function renderSplit(r: GrowthResult): string {
  const { now } = r;
  const paidShare = now.futureValue > 0 ? Math.max(0, Math.min(1, now.contributed / now.futureValue)) : 1;
  const growthPct = Math.round((1 - paidShare) * 100);
  const sentence = now.growth > 0
    ? `Growth makes up about ${growthPct}% of the final balance. That is money your money earned, not money you saved.`
    : "At 0% there is no growth: the balance is exactly what you put in.";
  return `<section class="cg-card"><h3>Where the money comes from</h3>
<div class="cg-bar" role="img" aria-label="${$(now.contributed)} put in, ${$(now.growth)} growth"><span class="cg-bar-paid" style="width:${(paidShare * 100).toFixed(1)}%"></span><span class="cg-bar-growth" style="width:${((1 - paidShare) * 100).toFixed(1)}%"></span></div>
<dl class="cg-split"><div><dt><span class="cg-dot cg-dot-paid" aria-hidden="true"></span>Money you put in</dt><dd>${$(now.contributed)}</dd></div><div><dt><span class="cg-dot cg-dot-growth" aria-hidden="true"></span>Growth earned</dt><dd>${$(now.growth)}</dd></div></dl>
<p class="cg-note">${sentence}</p></section>`;
}

function renderCompare(r: GrowthResult): string {
  const { now, later, laterYears } = r;
  const n = now.years;
  const laterBody = laterYears > 0
    ? `<p class="cg-col-big">${$(later.futureValue)}</p><p class="cg-col-sub">${yrs(laterYears)} of growth. ${$(later.contributed)} put in.</p>`
    : `<p class="cg-col-big">${$(later.futureValue)}</p><p class="cg-col-sub">With only ${yrs(n)} on the clock, waiting ${DELAY_YEARS} years leaves no time to grow at all.</p>`;
  const gap = r.costOfWaiting;
  const story = laterYears > 0 && r.extraContributed > 0
    ? `Starting now means putting in ${$(r.extraContributed)} more of your own money, and ending up with ${$(gap)} more. Those first ${DELAY_YEARS} years do the most work, because their growth has the longest time to grow again.`
    : gap > 0
      ? `Waiting ${DELAY_YEARS} years leaves ${$(gap)} on the table in this example. Time is the part of compounding nobody can buy back.`
      : "With $0 going in, both columns stay at $0. Add a starting amount or a monthly amount to see the gap.";
  return `<section class="cg-card cg-compare-card"><h3>Start now vs start ${DELAY_YEARS} years later</h3>
<p class="cg-note cg-compare-lead">Same amounts, same return. The only difference is when the clock starts.</p>
<div class="cg-compare"><div class="cg-col cg-col-now"><p class="cg-col-label">Start today</p><p class="cg-col-big">${$(now.futureValue)}</p><p class="cg-col-sub">${yrs(n)} of growth. ${$(now.contributed)} put in.</p></div><div class="cg-col cg-col-later"><p class="cg-col-label">Start in ${DELAY_YEARS} years</p>${laterBody}</div></div>
<p class="cg-gap"><span>The cost of waiting</span> <strong>${$(gap)}</strong></p>
<p class="cg-note">${story}</p></section>`;
}

export function renderResults(r: GrowthResult): string {
  const { now, input } = r;
  const headline = `<div class="cg-headline"><p class="cg-kicker">After ${yrs(now.years)} at ${pct(input.annualReturn)} a year</p>
<p class="cg-big">${$(now.futureValue)}</p>
<p class="cg-lead">${input.startingAmount > 0 ? `${$(input.startingAmount)} today` : "Nothing today"}${input.monthlyContribution > 0 ? ` plus ${$(input.monthlyContribution)} a month` : ""} could grow to about this much, if your money earned ${pct(input.annualReturn)} every year. This illustrates compounding; it is not a forecast.</p></div>`;
  const chart = `<section class="cg-card"><h3>Year by year</h3>${renderChart(r)}${renderTable(r)}</section>`;
  return `${headline}${renderCompare(r)}${renderSplit(r)}${chart}<p class="cg-disclaimer">${DISCLAIMER}</p>`;
}
