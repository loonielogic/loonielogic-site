/**
 * cpp-timing-render.ts: turns a CppResult into the results HTML (comparison
 * card, breakeven strip, cumulative chart, flippers panel, rules cards,
 * worked examples, next steps). Used at build time (the page shows the
 * default comparison with JS off) and in the browser on every input change.
 * Only numbers and fixed copy are rendered; no user-typed text reaches the
 * markup.
 *
 * Copy rules: education, not advice (no advice phrasing); the tool never
 * recommends a start age, it compares them in both directions; no em dashes;
 * the estimate is never presented as the user's official CPP figure; every
 * results figure carries its as-of date.
 */

import {
  AVERAGE_AT_65,
  BREAKEVENS,
  CHART_FROM,
  CHART_TO,
  CHILD_REARING_PROVISION,
  DROPOUT_BASE_YEARS,
  EARLIEST_AGE,
  EARLY_PER_MONTH,
  ENHANCED_BEST_YEARS,
  FIGURE_YEAR,
  LATEST_AGE,
  LATE_PER_MONTH,
  MAX_AT_65,
  MAX_BOOST,
  MAX_REDUCTION,
  OAS_DEFERRAL,
  OAS_RATE,
  OAS_THRESHOLD,
  PRB_MAX,
  PRB_STOP_AGE,
  STANDARD_AGE,
  SURVIVOR_CAP_RULE,
  SURVIVOR_MAX_65,
  WORKED_EXAMPLES,
  WORKED_HORIZON,
  WORKED_INVEST,
  chartCsv,
  chartSeries,
  columnLabel,
  cppFigures,
  timingFactor,
  type Column,
  type CppResult,
  type WorkedExample,
} from "./cpp-timing";

const whole = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const $ = (n: number) => (Number.isFinite(n) ? whole.format(Math.round(n)) : "n/a");
export const $c = (n: number) => (Number.isFinite(n) ? cents.format(Math.round(n * 100) / 100) : "n/a");
export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;
const f2 = (n: number) => n.toFixed(2);
const f1 = (n: number) => n.toFixed(1);
const fx = (n: number) => String(Math.round(n * 1000) / 1000);

/** The as-of line every results panel carries (spec section 7). */
export const AS_OF = `CPP figures: ${FIGURE_YEAR}; max at 65: Jan ${FIGURE_YEAR} ${$c(MAX_AT_65)}`;

export const MSCA_URL = "https://www.canada.ca/en/employment-social-development/services/my-account.html";
export const CRIC_URL = "https://www.canada.ca/en/services/benefits/publicpensions/cpp/retirement-income-calculator.html";
export const SURVIVOR_URL = "https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-survivor-pension.html";
export const CPP_OVERVIEW_URL = "https://www.canada.ca/en/services/benefits/publicpensions/cpp.html";
export const RETRAITE_QUEBEC_URL = "https://www.retraitequebec.gouv.qc.ca/en/";

export const ACCURACY_BANNER = `This is an estimate, not your CPP figure. Your real number lives in My Service Canada Account (Statement of Contributions). All amounts are gross, nominal estimates using ${FIGURE_YEAR} figures.`;
export const DISCLAIMER = `A comparison of start ages from your own estimate, not financial advice and not your official CPP figure. Figures are ${FIGURE_YEAR} and change each year.`;

export interface RenderOptions {
  /** Explainer for "Learn: CPP + OAS basics"; null until the page is built. */
  basicsHref: string | null;
  /** Income tax estimator; null until the tool is built. */
  taxToolHref: string | null;
}

/** Inline source chip for a registry figure, e.g. "canada.ca, verified 2026-09-30". */
export function sourceTag(key: string): string {
  const f = cppFigures.get(key);
  if (!f) throw new Error(`figure "${key}" was not read by the calculator`);
  const host = new URL(f.source).hostname;
  const who = host.endsWith("canada.ca") ? "canada.ca" : host === "publications.gc.ca" ? "Service Canada" : host;
  return `<a class="cpt-src" href="${f.source}" rel="noopener">${who}, verified ${f.verified_date}</a>`;
}

const flag = (text: string) => `<span class="cpt-flag">${text}</span>`;
const match = `<span class="cpt-match">matches your answers</span>`;
const asOf = (extra = "") => `<p class="cpt-asof">${AS_OF}${extra}</p>`;

function row(label: string, value: string, cls = ""): string {
  return `<tr${cls ? ` class="${cls}"` : ""}><th scope="row">${label}</th><td>${value}</td></tr>`;
}

const card = (id: string, title: string, body: string, cls = "") =>
  body ? `<section class="cpt-card${cls ? ` ${cls}` : ""}" aria-labelledby="${id}"><h2 id="${id}">${title}</h2>${body}</section>` : "";

/** Series colour slot follows the start age, never the rank. */
export const seriesSlot = (startAge: number) => (startAge === LATEST_AGE ? 3 : startAge === STANDARD_AGE ? 2 : 1);

/* ------------------------------------------------------------------ */
/* Headline: the three-column comparison                               */
/* ------------------------------------------------------------------ */

function statColumn(c: Column, r: CppResult): string {
  const top = c.startAge === r.winner && r.columns.length > 1;
  const pctLabel = c.factor === 1 ? "no adjustment" : c.factor < 1 ? `${pct(1 - c.factor, 1)} less` : `${pct(c.factor - 1, 1)} more`;
  return `<div class="cpt-col cpt-s${seriesSlot(c.startAge)}${top ? " is-top" : ""}">
<p class="cpt-col-head"><span class="cpt-swatch" aria-hidden="true"></span>${columnLabel(c)}${top ? ` <span class="cpt-top">most by ${r.horizon}</span>` : ""}</p>
<p class="cpt-col-factor">x ${fx(c.factor)} (${pctLabel})</p>
<dl>
<div><dt>Monthly</dt><dd>${$c(c.monthly)}</dd></div>
<div><dt>Annual</dt><dd>${$c(c.annual)}</dd></div>
<div class="cpt-life"><dt>Total to age ${r.horizon}</dt><dd>${$(c.lifetime)}</dd></div>
</dl></div>`;
}

function headline(r: CppResult): string {
  const kicker = `<p class="cpt-kicker">${AS_OF}</p>`;
  const est = `${$c(r.est65)}${r.capped ? ` ${flag("capped at the maximum")}` : ""}`;
  let lead: string;
  if (r.columns.length === 1) {
    lead = `At ${LATEST_AGE} the pension has its full ${pct(MAX_BOOST)} boost and waiting longer adds nothing, so there is no later start age to compare ${sourceTag("cpp.timing.no_benefit_past_70")}.`;
  } else {
    const w = r.columns.find((c) => c.startAge === r.winner)!;
    const who = w.startNow ? `starting now (at ${w.startAge})` : `starting at ${w.startAge}`;
    lead = `To age ${r.horizon}, ${who} adds up to the most on an estimate of ${$c(r.est65)} a month at 65: <strong>${$(w.lifetime)}</strong> before tax.`;
  }
  const notes: string[] = [];
  if (r.capped) notes.push(`Your estimate was capped at the ${FIGURE_YEAR} maximum of ${$c(MAX_AT_65)}; almost nobody gets this.`);
  if (r.horizonClamped) notes.push(`Planning age capped at ${CHART_TO}.`);
  if (r.speculative) notes.push("Estimates this far out are speculative. The comparison still works the same way.");
  const sub = `<p class="cpt-sub">Estimate at 65: ${est}. Planning age ${r.horizon} is an illustrative planning horizon, not a prediction. Change it and the order can flip. Amounts are gross (CPP is taxable) and nominal.</p>`;
  const extra = notes.length ? `<p class="cpt-sub cpt-sub-note">${notes.join(" ")}</p>` : "";
  return `<div class="cpt-headline">${kicker}
<p class="cpt-lead">${lead}</p>
<div class="cpt-cols cpt-cols-${r.columns.length}">${r.columns.map((c) => statColumn(c, r)).join("")}</div>
${sub}${extra}</div>`;
}

/* ------------------------------------------------------------------ */
/* Breakeven strip + derivation                                        */
/* ------------------------------------------------------------------ */

export function breakevenSentences(): string[] {
  return BREAKEVENS.map((b) => `${b.late} beats ${b.early} if you live past about ${Math.round(b.age)} (exact ${f1(b.age)}).`);
}

function derivation(): string {
  const [a, b, c] = BREAKEVENS;
  const fa = timingFactor(EARLIEST_AGE);
  const fc = timingFactor(LATEST_AGE);
  const lines = [
    `Let t be years after ${EARLIEST_AGE}, and count each start age's payments as a share of the age-65 amount: ${fx(fa)} a year from t = 0 for ${EARLIEST_AGE}, 1 from t = 5 for ${STANDARD_AGE}, ${fx(fc)} from t = 10 for ${LATEST_AGE}.`,
    `${a.late} vs ${a.early}: ${fx(fa)}t = t &minus; 5, so ${fx(1 - fa)}t = 5 and t = ${f2(a.yearsAfterEarly)} years after ${a.early}: age ${f1(a.age)}.`,
    `${b.late} vs ${b.early}: t &minus; 5 = ${fx(fc)}(t &minus; 10), so ${fx(fc - 1)}t = ${fx(fc * 10 - 5)} and t = ${f2(b.age - EARLIEST_AGE)} years after ${EARLIEST_AGE}: age ${f1(b.age)}.`,
    `${c.late} vs ${c.early}: ${fx(fa)}t = ${fx(fc)}(t &minus; 10), so ${fx(fc - fa)}t = ${fx(fc * 10)} and t = ${f2(c.yearsAfterEarly)} years after ${c.early}: age ${f1(c.age)}.`,
    `The estimate cancels out of every equation, so these ages are the same for every benefit size.`,
  ];
  return `<details class="cpt-derive"><summary>How we computed this</summary><ol>${lines.map((l) => `<li>${l}</li>`).join("")}</ol></details>`;
}

function breakevenStrip(): string {
  const [a, b, c] = breakevenSentences();
  return `${asOf()}<ul class="cpt-strip"><li><strong>${a}</strong></li><li><strong>${b}</strong></li><li>${c}</li></ul>
<p class="cpt-note">Fixed reference points: nominal, before tax. In-pay indexation raises the cheque by the same percentage whichever age you start, so comparing nominal amounts is directionally fair. The timing factors are ${pct(EARLY_PER_MONTH, 1)} less for each month before ${STANDARD_AGE} (up to ${pct(MAX_REDUCTION)}) ${sourceTag("cpp.early_reduction")} and ${pct(LATE_PER_MONTH, 1)} more for each month after (up to ${pct(MAX_BOOST)}) ${sourceTag("cpp.late_boost")}.</p>
${derivation()}`;
}

/* ------------------------------------------------------------------ */
/* Cumulative chart (inline SVG) + CSV                                 */
/* ------------------------------------------------------------------ */

const W = 640;
const H = 300;
const M = { l: 58, r: 104, t: 18, b: 38 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * p >= v) return s * p;
  return 10 * p;
}

const shortMoney = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);

export function renderChart(r: CppResult): string {
  const series = chartSeries(r);
  const top = niceMax(Math.max(...series.map((s) => s.points[s.points.length - 1].total)));
  const x = (age: number) => M.l + ((age - CHART_FROM) / (CHART_TO - CHART_FROM)) * (W - M.l - M.r);
  const y = (v: number) => H - M.b - (v / top) * (H - M.t - M.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * top);

  const grid = ticks
    .map((v) => `<line class="cpt-grid" x1="${M.l}" x2="${W - M.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="cpt-axis" x="${M.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${shortMoney(v)}</text>`)
    .join("");
  const xTicks = [60, 65, 70, 75, 80, 85, 90, 95, 100]
    .map((a) => `<text class="cpt-axis" x="${x(a).toFixed(1)}" y="${H - M.b + 18}" text-anchor="middle">${a}</text>`)
    .join("");
  const horizon = `<line class="cpt-horizon" x1="${x(r.horizon).toFixed(1)}" x2="${x(r.horizon).toFixed(1)}" y1="${M.t}" y2="${H - M.b}"/><text class="cpt-axis cpt-horizon-label" x="${(x(r.horizon) - 4).toFixed(1)}" y="${M.t + 10}" text-anchor="end">plan to ${r.horizon}</text>`;

  const lines = series
    .map((s) => {
      const d = s.points.map((p, k) => `${k ? "L" : "M"}${x(p.age).toFixed(1)} ${y(p.total).toFixed(1)}`).join(" ");
      return `<path class="cpt-line cpt-s${seriesSlot(s.startAge)}" d="${d}"/>`;
    })
    .join("");

  // Direct labels at the right end, nudged apart so they never overlap.
  const ends = series
    .map((s) => ({ s, y: y(s.points[s.points.length - 1].total) }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 15);
  const labels = ends
    .map((e) => `<text class="cpt-end" x="${W - M.r + 8}" y="${(e.y + 4).toFixed(1)}"><tspan class="cpt-end-key cpt-s${seriesSlot(e.s.startAge)}">&#9632;</tspan> ${columnLabel(e.s)}</text>`)
    .join("");

  const marks = r.crossings
    .map((c) => `<g class="cpt-cross"><circle cx="${x(c.age).toFixed(1)}" cy="${y(c.total).toFixed(1)}" r="4.5"/><text class="cpt-axis cpt-cross-label" x="${x(c.age).toFixed(1)}" y="${(y(c.total) - 10).toFixed(1)}" text-anchor="middle">${f1(c.age)}</text></g>`)
    .join("");

  const data = JSON.stringify({
    from: CHART_FROM,
    to: CHART_TO,
    series: series.map((s) => ({ label: columnLabel(s), slot: seriesSlot(s.startAge), totals: s.points.map((p) => Math.round(p.total)) })),
    box: { l: M.l, r: M.r, t: M.t, b: M.b, w: W, h: H },
  });

  const crossText = r.crossings.length
    ? `Circles mark where the lines cross: ${r.crossings.map((c) => `${c.late} catches ${c.early} at ${f1(c.age)}`).join("; ")}.`
    : "The lines do not cross between 60 and 100.";
  const desc = `Cumulative CPP received from age ${CHART_FROM} to ${CHART_TO} for ${series.map((s) => columnLabel(s).toLowerCase()).join(", ")}. ${crossText}`;

  const legend = `<ul class="cpt-legend">${series.map((s) => `<li class="cpt-s${seriesSlot(s.startAge)}"><span class="cpt-key" aria-hidden="true"></span>${columnLabel(s)}</li>`).join("")}<li class="cpt-legend-cross"><span class="cpt-key-dot" aria-hidden="true"></span>Breakeven crossing</li></ul>`;

  const svg = `<div class="cpt-chart-wrap" data-chart='${data.replace(/'/g, "&#39;")}'><svg class="cpt-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="cpt-chart-title cpt-chart-desc"><title id="cpt-chart-title">Lifetime CPP totals by start age</title><desc id="cpt-chart-desc">${desc}</desc>${grid}${xTicks}<text class="cpt-axis" x="${((M.l + W - M.r) / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">Age</text>${horizon}${lines}${marks}${labels}</svg><div class="cpt-tip" hidden></div></div>`;

  const every5 = series[0].points.filter((p) => p.age % 5 === 0).map((p) => p.age);
  const table = `<details class="cpt-table-view"><summary>Table view (every 5 years)</summary><div class="cpt-scroll"><table class="cpt-table cpt-table-grid"><thead><tr><th scope="col">Age</th>${series.map((s) => `<th scope="col">${columnLabel(s)}</th>`).join("")}</tr></thead><tbody>${every5
    .map((age) => `<tr><th scope="row">${age}</th>${series.map((s) => `<td>${$(s.points[age - CHART_FROM].total)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div></details>`;

  const csv = `<a class="cpt-csv" download="cpp-timing-lifetime-totals-${FIGURE_YEAR}.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent(chartCsv(r))}">Download the chart data (CSV)</a>`;

  return `${asOf()}${legend}${svg}<p class="cpt-note">${crossText} Totals are nominal and before tax, from your estimate.</p>${table}<p class="cpt-note">${csv}</p>`;
}

/* ------------------------------------------------------------------ */
/* Flippers panel: honest in both directions                           */
/* ------------------------------------------------------------------ */

function flippers(r: CppResult): string {
  const i = r.input;
  const item = (text: string, on = false) => `<li${on ? ' class="is-match"' : ""}>${text}${on ? ` ${match}` : ""}</li>`;
  const earlyHead = r.startNow ? "Taking it now can win when" : `Taking it at ${EARLIEST_AGE} can win when`;
  const early = [
    item("You need the money now."),
    item("Health or family history points to a shorter retirement."),
    item("You will invest every cheque (the invest-the-difference toggle shows that math).", i.invest),
    item(`A bigger CPP later would push your income over the ${$(OAS_THRESHOLD)} OAS recovery threshold.`, r.anyOverOasThreshold),
    item("The survivor-benefit cap would waste part of a deferred boost.", i.survivor),
  ];
  const late = [
    item("Longevity runs in the family."),
    item(`You keep working between 60 and ${PRB_STOP_AGE}: post-retirement benefits stack on top.`, i.stillWorking === "yes"),
    item(`You have bridge income: drawing an RRSP from 60 to ${LATEST_AGE} while CPP waits is the classic tax-smoothing play.`),
    item("You want the largest inflation-indexed cheque for life."),
  ];
  return `<p class="cpt-note cpt-flip-intro">The tool does not pick an age. These are the personal factors that flip the answer, in both directions.</p>
<div class="cpt-flip"><div class="cpt-flip-side"><h3>${earlyHead}</h3><ul>${early.join("")}</ul></div>
<div class="cpt-flip-side"><h3>Waiting to ${LATEST_AGE} can win when</h3><ul>${late.join("")}</ul></div></div>`;
}

/* ------------------------------------------------------------------ */
/* Canadian rules layer: edge-case cards                               */
/* ------------------------------------------------------------------ */

const edge = (label: string, body: string, highlight = false) =>
  `<details class="cpt-edge${highlight ? " is-flagged" : ""}" open role="note" aria-label="${label}"><summary>${label}</summary><div class="cpt-edge-body">${body}</div></details>`;

function rules(r: CppResult): string {
  const i = r.input;
  const cards: string[] = [];

  const estimate = [
    `<p>The estimate at 65 is the number everything else rests on. The tool times it; it does not build it from your earnings. Drop-out provisions help: up to ${DROPOUT_BASE_YEARS} years of lowest earnings are left out of the base component ${sourceTag("cpp.dropout.base_years")}, and the enhanced component uses your best ${ENHANCED_BEST_YEARS} years ${sourceTag("cpp.dropout.enhanced_best_years")}. Gaps in your work history hurt less than a straight average suggests.</p>`,
  ];
  if (r.childRearingYears > 0 && CHILD_REARING_PROVISION) {
    estimate.push(`<p><strong>Child-rearing years entered (${r.childRearingYears}).</strong> The months you earned little while raising kids under 7 may be excluded, so your actual benefit could be higher than this tool's straight math ${sourceTag("cpp.child_rearing_provision")}. The tool does not adjust for it. Check your MSCA estimate.</p>`);
  }
  estimate.push(
    `<p${i.disability ? ' class="cpt-emph"' : ""}>${i.disability ? "<strong>CPP disability history.</strong> " : ""}Months on CPP disability are excluded from the base component and credited at 70% of prior average earnings in the enhanced component. The tool does not compute this; your <a href="${MSCA_URL}" rel="noopener">My Service Canada Account</a> estimate includes it.</p>`,
  );
  cards.push(edge("Your estimate", estimate.join(""), r.childRearingYears > 0 || i.disability));

  if (r.showPrb) {
    cards.push(edge(
      "Working while collecting",
      `<p>Working while collecting is not wasted. While you receive CPP and are under ${PRB_STOP_AGE}, contributions on work income are mandatory, and each year of them adds a post-retirement benefit of up to ${$c(PRB_MAX)} a month (${FIGURE_YEAR}) ${sourceTag("cpp.post_retirement_max")}. From 65 you can elect to stop contributing (form CPT30); at ${PRB_STOP_AGE} contributions stop ${sourceTag("cpp.prb.stop_age")}. The tool does not add these benefits to the totals above.</p>`,
      i.stillWorking === "yes",
    ));
  }

  const over = r.columns.filter((c) => c.overOasThreshold);
  const oasLines: string[] = [];
  if (over.length) {
    const which = over.map((c) => `${columnLabel(c).toLowerCase()} (${$(c.incomeWithOther)} a year with your other income)`).join(" and ");
    oasLines.push(`<p><strong>Flag: ${which} ${over.length === 1 ? "is" : "are"} over the ${$(OAS_THRESHOLD)} threshold.</strong> At this income the ${pct(OAS_RATE)} OAS recovery tax starts biting (${FIGURE_YEAR} income-year threshold) ${sourceTag("oas.recovery_tax.threshold.2026")}. A bigger CPP at ${LATEST_AGE} can push you into it. The tool does not compute the recovery-tax dollars.</p>`);
  } else if (r.otherIncome > 0) {
    oasLines.push(`<p>With your other income, every start age stays under the ${$(OAS_THRESHOLD)} OAS recovery-tax threshold (${FIGURE_YEAR} income year) ${sourceTag("oas.recovery_tax.threshold.2026")}.</p>`);
  } else {
    oasLines.push(`<p>Enter other expected retirement income to check it against the ${$(OAS_THRESHOLD)} OAS recovery-tax threshold (${FIGURE_YEAR} income year) ${sourceTag("oas.recovery_tax.threshold.2026")}.</p>`);
  }
  oasLines.push(`<p>OAS is a separate decision with its own deferral: ${pct(OAS_DEFERRAL.per_month, 1)} more for each month after 65, up to ${pct(OAS_DEFERRAL.max_boost)} at 70 ${sourceTag("oas.deferral.q3_2026")}. The tool does not compute OAS amounts.</p>`);
  cards.push(edge("OAS clawback", oasLines.join(""), over.length > 0));

  if (i.survivor) {
    cards.push(edge(
      "Survivor pension",
      `<p>If you are eligible for both a CPP retirement pension and a CPP survivor's pension, the combined amount is ${SURVIVOR_CAP_RULE} ${sourceTag("cpp.survivor.combined_cap_rule")}: a maximum survivor's pension cannot be drawn on top of a maximum retirement pension. The survivor's maximum alone at 65+ is ${$c(SURVIVOR_MAX_65)} a month (Jan ${FIGURE_YEAR}) ${sourceTag("cpp.survivor.max_65_plus")}. If a survivor pension will fill much of the cap, deferring your own CPP to ${LATEST_AGE} can buy less than the ${pct(MAX_BOOST)} suggests. The tool does not compute survivor dollars: see <a href="${SURVIVOR_URL}" rel="noopener">the CPP survivor's pension on canada.ca</a>.</p>`,
      true,
    ));
  }

  if (i.quebec) {
    cards.push(edge(
      "Quebec (QPP)",
      `<p>The factors shown are the CPP-legislated ones. Retraite Qu&eacute;bec sets its own QPP start-age adjustments, and the current QPP factors have not been verified for this tool ${flag("needs re-verification")}. Check your QPP estimate and the current rules with <a href="${RETRAITE_QUEBEC_URL}" rel="noopener">Retraite Qu&eacute;bec</a>.</p>`,
      true,
    ));
  }

  if (i.separation) {
    cards.push(edge(
      "Separation or divorce",
      `<p>CPP credits earned during a marriage or common-law relationship can be split after a separation or divorce, and spouses can share pensions while both collect. Either can change your estimate. The tool does not compute credit splitting or pension sharing.</p>`,
      true,
    ));
  }

  return `${asOf()}<div class="cpt-edges">${cards.join("")}</div>`;
}

/* ------------------------------------------------------------------ */
/* Invest the difference                                               */
/* ------------------------------------------------------------------ */

function investCard(r: CppResult): string {
  if (r.investUnavailable) {
    return `<p class="cpt-note">Invest the difference compares taking CPP before ${STANDARD_AGE} with waiting until ${STANDARD_AGE}. At your age the earliest start is ${STANDARD_AGE} or later, so there is nothing to invest before ${STANDARD_AGE}.</p>`;
  }
  const v = r.invest;
  if (!v) return "";
  const who = v.startAge === EARLIEST_AGE ? `at ${EARLIEST_AGE}` : `now (at ${v.startAge})`;
  const rows = [
    row(`Cheque taking it ${who} (your estimate)`, `${$c(v.payment)}/mo`),
    row(`Invested at the end of each month for ${v.months} months at ${pct(v.annualReturn, 1)} a year (${pct(v.monthlyRate, 3)} a month, compounding)`, ""),
    row(`Pot at ${STANDARD_AGE}`, $(v.pot), "cpt-total"),
    row(`Monthly gap versus starting at ${STANDARD_AGE}`, `${$c(v.gap)}/mo`),
    row("Pot covers that gap for about", Number.isFinite(v.yearsCovered) ? `${f1(v.yearsCovered)} years` : "n/a"),
  ];
  const warn = r.optimisticReturn ? `<p class="cpt-warn-line">Above long-run equity averages: the gap-closing math gets optimistic fast.</p>` : "";
  return `${asOf()}<p class="cpt-note">${flag("illustrative")} What if every early cheque is invested until ${STANDARD_AGE}? The pot then pays the difference until it runs out, ignoring further growth. This does not account for tax on the invested cheques.</p>
<table class="cpt-table"><tbody>${rows.join("")}</tbody></table>${warn}`;
}

/* ------------------------------------------------------------------ */
/* Worked examples (Python-verified 2026-09-30)                        */
/* ------------------------------------------------------------------ */

const leader = (label: string, value: string, result = false) =>
  `<li${result ? ' class="cpt-we-result"' : ""}><span>${label}</span><span class="cpt-dots" aria-hidden="true"></span><span>${value}</span></li>`;

function workedBlock(w: WorkedExample): string {
  const lines = w.rows.map((x) => leader(`Start at ${x.age}`, `${$c(x.monthly)}/mo &middot; ${$c(x.annual)}/yr`)).join("");
  const totals = w.rows.map((x) => leader(`Total to ${WORKED_HORIZON}, start at ${x.age}`, $(x.lifetime), x.age === LATEST_AGE)).join("");
  return `<div class="cpt-we" role="note" aria-label="Worked example"><p class="cpt-we-label">Worked example &middot; verified 2026-09-30 &middot; Python</p>
<p class="cpt-we-persona">${w.label}: ${$c(w.est65)} a month at 65 (Jan ${FIGURE_YEAR} figures; nominal).</p>
<ul class="cpt-we-lines">${lines}${totals}</ul></div>`;
}

function workedInvest(): string {
  const v = WORKED_INVEST;
  return `<div class="cpt-we" role="note" aria-label="Worked example"><p class="cpt-we-label">Worked example &middot; verified 2026-09-30 &middot; Python ${flag("illustrative")}</p>
<p class="cpt-we-persona">The ${FIGURE_YEAR} average (${$c(AVERAGE_AT_65)} at 65), taken at ${EARLIEST_AGE} and every cheque invested at ${pct(v.annualReturn)} a year until ${STANDARD_AGE}.</p>
<ul class="cpt-we-lines">${leader(`Cheque at ${EARLIEST_AGE}`, `${$c(v.payment)}/mo`)}${leader(`${v.months} monthly deposits, compounding monthly`, `${pct(v.annualReturn)} a year`)}${leader(`Gap versus starting at ${STANDARD_AGE}`, `${$c(v.gap)}/mo`)}${leader(`Pot at ${STANDARD_AGE}`, $(v.pot), true)}${leader("Covers the gap for about", `${Math.round(v.yearsCovered)} years, ignoring further growth`)}</ul>
<p class="cpt-we-foot">Illustrative; does not account for tax on the invested cheques.</p></div>`;
}

function workedExamples(): string {
  return `<p class="cpt-note">The same math on two reference amounts, so the numbers above can be checked by hand.</p>${WORKED_EXAMPLES.map(workedBlock).join("")}${workedInvest()}`;
}

/* ------------------------------------------------------------------ */
/* Next steps (no affiliate links)                                     */
/* ------------------------------------------------------------------ */

function nextSteps(o: RenderOptions): string {
  const basics = o.basicsHref
    ? `<li><a href="${o.basicsHref}">Learn: CPP + OAS basics</a>: how both pensions work and fit together.</li>`
    : `<li>Learn: CPP + OAS basics. Until our guide is published, <a href="${CPP_OVERVIEW_URL}" rel="noopener">the CPP overview on canada.ca</a> covers the rules.</li>`;
  const tax = o.taxToolHref
    ? `<li><a href="${o.taxToolHref}">After-tax view</a>: CPP is taxed at your marginal rate; the income tax estimator shows the after-tax picture.</li>`
    : `<li>After-tax view: CPP is taxed at your marginal rate.</li>`;
  return `<ul class="cpt-links">
<li><strong>Check your real estimate:</strong> <a href="${MSCA_URL}" rel="noopener">My Service Canada Account</a> (Statement of Contributions) has your own figure, and the <a href="${CRIC_URL}" rel="noopener">Canadian Retirement Income Calculator</a> is the official next step.</li>
${basics}
${tax}
</ul>`;
}

/* ------------------------------------------------------------------ */
/* Whole results screen                                                */
/* ------------------------------------------------------------------ */

export function renderResults(r: CppResult, o: RenderOptions): string {
  const disclaimer = `<p class="cpt-disclaimer">${DISCLAIMER}</p>`;
  return `${headline(r)}
${card("cpt-h-breakeven", "When waiting pays off", breakevenStrip())}
${card("cpt-h-chart", "Lifetime totals, age 60 to 100", renderChart(r))}
${card("cpt-h-flip", "What flips the answer", flippers(r))}
${r.input.invest ? card("cpt-h-invest", "Take it early and invest every cheque", investCard(r)) : ""}
${card("cpt-h-rules", "Canadian rules that change the picture", rules(r))}
${card("cpt-h-worked", "Worked examples", workedExamples())}
${card("cpt-h-next", "Next steps", nextSteps(o))}
${disclaimer}`;
}

/** Shown in place of the comparison while an input blocks the math. */
export function renderBlocked(messages: string[], o: RenderOptions): string {
  const disclaimer = `<p class="cpt-disclaimer">${DISCLAIMER}</p>`;
  return `<div class="cpt-headline cpt-headline-blocked" role="status"><p class="cpt-kicker">${AS_OF}</p>
<p class="cpt-lead">${messages[0]}</p>${messages.slice(1).map((m) => `<p class="cpt-sub">${m}</p>`).join("")}</div>
${card("cpt-h-breakeven", "When waiting pays off", breakevenStrip())}
${card("cpt-h-worked", "Worked examples", workedExamples())}
${card("cpt-h-next", "Next steps", nextSteps(o))}
${disclaimer}`;
}
