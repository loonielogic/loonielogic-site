/**
 * tfsa-room-checker-render.ts: turns a CheckResult into the results HTML.
 * Used at build time (the page shows the spec's worked example with JS off)
 * and in the browser once the questions are answered. Only numbers and fixed
 * copy are rendered; no user-typed text reaches the markup.
 *
 * Copy rules: education, not advice (never "you should"); no em dashes; the
 * estimate is never presented as CRA's number; the My Account staleness note
 * and the disclaimer appear on every results screen.
 */

import {
  ABSURD_AMOUNT,
  ANNUAL_LIMIT,
  CURRENT_YEAR,
  EXCESS_TAX_RATE,
  RC243_DEADLINE,
  RESTORE_YEAR,
  annualLimit,
  excessTax,
  tfsaFigures,
  type CheckResult,
} from "./tfsa-room-checker";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const $ = (n: number) => (Number.isFinite(n) ? money.format(Math.round(n)) : "n/a");
export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

/** "2027-06-30" -> "June 30, 2027" (no Date parsing, so no time-zone drift). */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export const RESTORE_DATE = `January 1, ${RESTORE_YEAR}`;
export const MY_ACCOUNT_URL =
  "https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-individuals/account-individuals.html";
export const STALENESS_NOTE =
  "CRA's number can be months behind: banks file by end of February, and your own records are the real-time truth. This tool is only as accurate as your lifetime totals.";
export const DISCLAIMER = `An estimate from your own records, not financial advice or CRA's figure. Limits change annually; figures are ${CURRENT_YEAR}.`;

export interface RenderOptions {
  /** Where the "fixing an over-contribution" links point. */
  fixGuideHref: string;
  /** Display date for "as of". */
  asOf: string;
  /** Build-time onboarding: label the output as the spec's worked example. */
  example?: boolean;
}

/** Inline source label for a registry figure, e.g. "CRA, verified 2026-09-29". */
export function sourceTag(key: string): string {
  const f = tfsaFigures.get(key);
  if (!f) throw new Error(`figure "${key}" was not read by the checker`);
  const who = f.source.includes("canada.ca") ? "CRA" : new URL(f.source).hostname;
  return `<a class="trc-src" href="${f.source}" rel="noopener">${who}, verified ${f.verified_date}</a>`;
}

const flag = (text: string) => `<span class="trc-flag">${text}</span>`;

function row(label: string, value: string, cls = ""): string {
  return `<tr${cls ? ` class="${cls}"` : ""}><th scope="row">${label}</th><td>${value}</td></tr>`;
}

const yearList = (years: number[]) =>
  years.length <= 2 ? years.join(" and ") : `${years.slice(0, -1).join(", ")} and ${years[years.length - 1]}`;

function exampleIntro(): string {
  return `<div class="trc-example"><p><strong>Worked example.</strong> Josie turned 18 in 2020, so her room starts in 2020. She has deposited $30,000 in total, withdrew $5,000 in 2025, and withdrew $2,000 in June ${CURRENT_YEAR}. Room now = $45,500 &minus; $30,000 + $5,000 = $20,500. The $2,000 she took out in ${CURRENT_YEAR} comes back on ${RESTORE_DATE}. If she deposits that $2,000 back now, it counts as a new contribution against her $20,500.</p><p>Answer the questions to see your own numbers.</p></div>`;
}

function headline(r: CheckResult, o: RenderOptions): string {
  const guess = r.input.bestGuess ? ` ${flag("best guess")}` : "";
  const asOf = `<p class="trc-kicker">Estimate as of ${o.asOf}${guess}</p>`;
  const sub = `<p class="trc-sub">An estimate from your answers, not CRA's figure.</p>`;
  if (!r.eligible) {
    return `<div class="trc-headline"><p class="trc-lead">You're not eligible yet: room starts the year you turn 18.</p></div>`;
  }
  if (r.outcome === "over_contributed") {
    return `<div class="trc-headline trc-headline-over">${asOf}
<p class="trc-lead">Your answers point to an over-contribution of about <strong>${$(r.excess)}</strong>.</p>
<div class="trc-stats">
<div class="trc-stat"><span class="trc-stat-label">Over the limit by</span><strong>${$(r.excess)}</strong></div>
<div class="trc-stat"><span class="trc-stat-label">Tax while it stays in</span><strong>${$(r.excessTaxMonthly)} a month</strong></div>
</div>${sub}</div>`;
  }
  const lead =
    r.outcome === "no_room"
      ? `Your answers put your room at <strong>${$(0)}</strong> right now. A deposit before ${RESTORE_DATE} would be an over-contribution.`
      : `About <strong>${$(r.roomNow)}</strong> can go in during ${CURRENT_YEAR} without going over, based on your answers.`;
  return `<div class="trc-headline">${asOf}
<p class="trc-lead">${lead}</p>
<div class="trc-stats">
<div class="trc-stat"><span class="trc-stat-label">Room now</span><strong>${$(r.roomNow)}</strong></div>
<div class="trc-stat"><span class="trc-stat-label">Room returning ${RESTORE_DATE}</span><strong>+${$(r.returningJan1)}</strong></div>
</div>${sub}</div>`;
}

function recontributionWarning(r: CheckResult, o: RenderOptions): string {
  if (!r.recontributionWarning) return "";
  const w = $(r.returningJan1);
  return `<div class="trc-alert" role="alert"><p><strong>Withdrawn ${w} this year? That ${w} is not room yet. It comes back ${RESTORE_DATE}. Depositing it now may be an over-contribution.</strong></p>
<p><a href="${o.fixGuideHref}">How over-contributions get fixed</a></p></div>`;
}

function breakdown(r: CheckResult): string {
  const i = r.input;
  const rows: string[] = [];
  rows.push(row(`Cumulative room, ${r.startYear} to ${CURRENT_YEAR} ${sourceTag("tfsa.bands.history")}`, $(r.cumulative)));
  if (r.nonResidentDeduction > 0) {
    rows.push(row(`Full years as a non-resident (${yearList(r.nonResidentYears)})`, `&minus;${$(r.nonResidentDeduction)}`));
  }
  rows.push(row("Lifetime contributions (your entry)", `&minus;${$(r.contributions)}`));
  rows.push(row(`Withdrawals up to December 31, ${CURRENT_YEAR - 1} (your entry)`, `+${$(r.priorWithdrawals)}`));
  if (r.roomNow < 0) rows.push(row("Over the limit by", $(r.excess), "trc-total trc-warn"));
  else rows.push(row("Estimated room now", $(r.roomNow), "trc-total"));

  const why =
    r.startReason === "age"
      ? `Room starts in ${r.startYear}, the year you turn${r.startYear < CURRENT_YEAR ? "ed" : ""} 18.`
      : r.startReason === "residency"
        ? `Room starts in ${r.startYear}, the year you became a Canadian tax resident ${sourceTag("tfsa.eligibility")}.`
        : `Room starts in ${r.startYear}, the year TFSAs began.`;
  const excluded = new Set(r.nonResidentYears);
  const years: string[] = [];
  for (let y = r.startYear; y <= CURRENT_YEAR; y++) {
    years.push(`<tr><th scope="row">${y}</th><td>${excluded.has(y) ? `<s>${$(annualLimit(y))}</s> not counted` : $(annualLimit(y))}</td></tr>`);
  }
  const guess = i.bestGuess
    ? `<p class="trc-note">${flag("best guess")} These totals are your estimates. CRA My Account has the official record of your deposits and withdrawals, though it can be months behind.</p>`
    : "";
  return `<table class="trc-table"><tbody>${rows.join("")}</tbody></table>
<p class="trc-note">${why} Each year adds that year's limit, even if the birthday or move came late in the year. Market growth and losses never change room; only deposits and withdrawals do.</p>${guess}
<details class="trc-years"><summary>Year-by-year limits</summary><table class="trc-table"><tbody>${years.join("")}</tbody></table></details>`;
}

function januaryReset(r: CheckResult): string {
  const rows: string[] = [];
  let note: string;
  if (r.returningJan1 > 0) {
    rows.push(row(`Withdrawn so far in ${CURRENT_YEAR} (your entry)`, $(r.returningJan1)));
    rows.push(row(`Comes back as room on ${RESTORE_DATE} ${sourceTag("tfsa.withdrawal_restore")}`, `+${$(r.returningJan1)}`, "trc-total"));
    const against = r.roomNow > 0 ? ` against the ${$(r.roomNow)} estimated above` : "";
    note = `Until then it is not room. Putting it back in during ${CURRENT_YEAR} counts as a new contribution${against}. The full amount withdrawn comes back, including any growth.`;
  } else {
    note = `Nothing withdrawn in ${CURRENT_YEAR} so far, so no withdrawn room comes back on ${RESTORE_DATE}. A withdrawal made later in ${CURRENT_YEAR} also comes back on that date, not before ${sourceTag("tfsa.withdrawal_restore")}.`;
  }
  if (r.planned > 0) {
    rows.push(row("Deposit you're considering (your entry)", $(r.planned)));
    if (r.plannedExcess > 0) {
      rows.push(row("Would go over estimated room by", $(r.plannedExcess), "trc-warn"));
      rows.push(row(`Tax on that excess ${sourceTag("tfsa.excess_tax")}`, `${$(excessTax(r.plannedExcess, 1))} a month`, "trc-warn"));
    } else {
      rows.push(row("Compared with estimated room now", "fits within it"));
    }
  }
  const table = rows.length ? `<table class="trc-table"><tbody>${rows.join("")}</tbody></table>` : "";
  return `${table}<p class="trc-note">${note}</p>
<p class="trc-note">The ${RESTORE_YEAR} annual limit is also added on ${RESTORE_DATE}. It has not been announced yet, so it is not included here.</p>`;
}

function overContribution(r: CheckResult, o: RenderOptions): string {
  const rows = [
    row("Excess (your estimate)", $(r.excess)),
    row(`Tax per month at ${pct(EXCESS_TAX_RATE)} ${sourceTag("tfsa.excess_tax")}`, $(r.excessTaxMonthly)),
    row("If it stays in 3 months", $(excessTax(r.excess, 3))),
    row("If it stays in 6 months", $(excessTax(r.excess, 6))),
  ];
  return `<table class="trc-table"><tbody>${rows.join("")}</tbody></table>
<p class="trc-note">The tax is ${pct(EXCESS_TAX_RATE)} of the highest excess in each month, for every month any excess stays in. Even one day over in a month counts as the whole month. Withdrawing the excess stops the monthly tax from that point.</p>
<p class="trc-note">The tax is reported on Form RC243 with Schedule A (RC243-SCH-A), due by ${longDate(RC243_DEADLINE)} for ${CURRENT_YEAR} excess amounts ${sourceTag("tfsa.rc243_deadline")}. It is still due if the excess was withdrawn right away. When the excess came from a reasonable error and was removed promptly, CRA can waive or cancel the tax on a written request.</p>
<p class="trc-note"><a href="${o.fixGuideHref}">How over-contributions get fixed, step by step</a></p>`;
}

function flags(r: CheckResult): string {
  const items: string[] = [];
  if (r.turned18ThisYear) {
    items.push(`You turn 18 in ${CURRENT_YEAR}, so only the ${CURRENT_YEAR} limit of ${$(ANNUAL_LIMIT)} counts. The room covers the whole year, but CRA requires you to be 18 to open a TFSA and contribute, so with a late-year birthday (December, say) a deposit has to wait until the birthday.`);
  }
  if (r.arrivedThisYear) {
    items.push(`You became a Canadian tax resident in ${CURRENT_YEAR}, so only the ${CURRENT_YEAR} limit of ${$(ANNUAL_LIMIT)} counts. Opening a TFSA also takes a valid SIN ${sourceTag("tfsa.eligibility")}.`);
  }
  if (r.nonResidentYears.length > 0) {
    items.push(`No room builds for a year you were a non-resident for the whole year, so ${r.nonResidentYears.length === 1 ? "that year's limit was" : "those years' limits were"} taken out (${$(r.nonResidentDeduction)}). Deposits made while a non-resident are also taxed at ${pct(EXCESS_TAX_RATE)} a month ${flag("secondary source, re-verify")}.`);
  }
  if (r.allYearsNonResident) {
    items.push(`Every year since ${r.startYear} is marked non-resident, so this estimate has no room at all.`);
  }
  if (r.input.bestGuess) {
    items.push(`Best guess mode: your lifetime totals are estimates, so the result is too. CRA My Account shows the official totals (with a delay).`);
  }
  const i = r.input;
  if ([i.lifetimeContributions, i.priorWithdrawals, i.thisYearWithdrawals, i.plannedDeposit].some((v) => (v ?? 0) > ABSURD_AMOUNT)) {
    items.push("One of your amounts is over $10 million. Double-check that figure.");
  }
  return items.length ? `<ul class="trc-list">${items.map((t) => `<li>${t}</li>`).join("")}</ul>` : "";
}

function checkAgainstCra(o: RenderOptions): string {
  return `<p class="trc-stale"><strong>${STALENESS_NOTE}</strong> ${sourceTag("tfsa.my_account_lag")}</p>
<ul class="trc-links">
<li><a href="${MY_ACCOUNT_URL}" rel="noopener">CRA My Account</a>: your official room figure. This tool never asks for your CRA login.</li>
<li><a href="/learn/tfsa">TFSA basics</a>: how room, limits, and withdrawals work.</li>
<li><a href="${o.fixGuideHref}">Fixing an over-contribution</a>: what to do if you went over.</li>
</ul>`;
}

const card = (id: string, title: string, body: string, cls = "") =>
  body ? `<section class="trc-card${cls ? ` ${cls}` : ""}" aria-labelledby="${id}"><h3 id="${id}">${title}</h3>${body}</section>` : "";

export function renderResults(r: CheckResult, o: RenderOptions): string {
  const intro = o.example ? exampleIntro() : "";
  const cra = card("trc-h-cra", "Check it against CRA", checkAgainstCra(o));
  const disclaimer = `<p class="trc-disclaimer">${DISCLAIMER}</p>`;
  if (!r.eligible) return `${intro}${headline(r, o)}${cra}${disclaimer}`;
  return `${intro}${headline(r, o)}${recontributionWarning(r, o)}
${r.outcome === "over_contributed" ? card("trc-h-fix", "Fixing an over-contribution", overContribution(r, o), "trc-card-warn") : ""}
${card("trc-h-reset", `The January 1 reset`, januaryReset(r))}
${card("trc-h-math", "How the estimate adds up", breakdown(r))}
${card("trc-h-flags", "Things that changed the result", flags(r))}
${cra}${disclaimer}`;
}
