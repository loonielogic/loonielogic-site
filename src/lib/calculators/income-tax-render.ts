/**
 * income-tax-render.ts: turns a TaxResult (annual mode) or PaychequeResult
 * (paycheque mode) into the results HTML for the income tax calculator.
 * Used at build time (the page shows the default example with JS off) and
 * in the browser on every input change. Only numbers and fixed copy are
 * rendered; no user-typed text reaches the markup.
 *
 * Copy rules: an estimate for education, not tax advice; no em dashes;
 * never "you should"; anything the research has not verified carries the
 * "Not yet verified" label.
 */

import { $, $c, NOT_VERIFIED, alerts, card, longDate, nextSteps, pct, row, table, workedExample, type Alert } from "./calc-kit";
import { figure, type FigureLog } from "./figures";
import {
  DEFAULT_INPUT,
  estimate,
  type TaxInput,
  BPA_PHASE_FROM,
  BPA_PHASE_TO,
  CANADA_EMPLOYMENT_AMOUNT,
  FEDERAL_BPA_BASE,
  FEDERAL_BPA_MAX,
  FHSA_ANNUAL,
  INCOME_WHAT_IF,
  OAS_THRESHOLD,
  PAY_LABEL,
  QC_ABATEMENT,
  RRSP_CAP,
  RRSP_WHAT_IF,
  TAX_YEAR,
  provinceName,
  type PaychequeResult,
  type TaxResult,
  type TaxWarning,
} from "./income-tax";

export const PDOC_URL = "https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses/payroll-deductions-online-calculator.html";
export const DISCLAIMER = `An estimate for education only, based on published ${TAX_YEAR} rates. Not tax advice. Check your numbers with CRA's Payroll Deductions Online Calculator or an accountant.`;

function warningCopy(w: TaxWarning, r: TaxResult): Alert {
  switch (w) {
    case "rrsp_over_cap":
      return { tone: "warn", html: `<strong>RRSP amount is above this year's dollar limit of ${$(RRSP_CAP)}.</strong> Your own limit is on your latest Notice of Assessment, and it can be higher if you carried room forward. Check it before relying on this deduction.` };
    case "fhsa_over_annual":
      return { tone: "warn", html: `<strong>FHSA amount is above the ${$(FHSA_ANNUAL)} annual limit.</strong> Check your FHSA room before relying on this deduction; contributions above your room are not deductible.` };
    case "dividends_gains":
      return { tone: "info", html: `<strong>Dividends and capital gains are taxed at ordinary rates here.</strong> The estimate does not yet model the dividend gross-up and credit or the capital gains inclusion rate, so tax on that income is likely overstated.` };
    case "under_18":
      return { tone: "info", html: `<strong>Under 18: no CPP or QPP.</strong> Contributions start the month after you turn 18, so none are deducted here.` };
    case "quebec":
      return { tone: "info", html: `<strong>Quebec residents file two returns.</strong> Federal tax is reduced by the ${pct(QC_ABATEMENT, 1)} Quebec abatement, and QPP, Quebec EI rates and QPIP replace CPP and EI. Your Quebec taxable income can differ slightly from the federal figure used here.` };
    case "bpa_phase_down":
      return { tone: "info", html: `<strong>Your federal basic personal amount is phasing down</strong> (from ${$(FEDERAL_BPA_MAX)} at ${$(BPA_PHASE_FROM)} to ${$(FEDERAL_BPA_BASE)} at ${$(BPA_PHASE_TO)}). This tool uses a straight line between those points. ${NOT_VERIFIED} against CRA's TD1 worksheet.` };
    case "self_employed":
      return { tone: "info", html: `<strong>Self-employed income:</strong> you pay both halves of ${r.core.payroll.pensionLabel} on it (${$(r.core.payroll.selfEmployedPension)} here), no EI, and nobody withholds tax for you. You may need to pay tax by quarterly instalments. The deduction for the employer half of your contributions is not yet included, so tax runs a little high.` };
    case "oas_recovery":
      return { tone: "info", html: `<strong>Age 65+: OAS recovery tax.</strong> On net income above ${$(OAS_THRESHOLD)}, 15% of the excess is clawed back from Old Age Security. At this income that is up to ${$(r.oasRecovery)}, limited to the OAS you receive. It is not included in the totals above.` };
    case "ontario_health_premium":
      return { tone: "info", html: `<strong>Ontario Health Premium above $25,000 not yet included.</strong> The premium's first tier (6% of income over $20,000 to $25,000) is in the totals; the higher tiers are not yet in this tool, so Ontario tax runs a little low at this income.` };
  }
}

function bar(r: TaxResult): string {
  const c = r.core;
  const gross = c.gross;
  if (gross <= 0) return "";
  const p = c.payroll;
  const parts: [string, number, string][] = [
    ["Federal tax", c.tax.federal.net, "ck-c1"],
    ["Provincial tax", c.tax.provincial.net, "ck-c2"],
    [p.pensionLabel === "QPP" ? "QPP and QPP2" : "CPP and CPP2", p.pension + p.pension2, "ck-c3"],
    [i18nEi(r), p.ei + p.qpip, "ck-c4"],
    ["Take-home", c.takeHome, "ck-c5"],
  ];
  const share = (v: number) => Math.max(0, v) / gross;
  const segs = parts.map(([, v, cls]) => `<span class="${cls}" style="width:${(share(v) * 100).toFixed(2)}%"></span>`).join("");
  const legend = parts
    .map(([label, v, cls]) => `<li><span class="ck-swatch ${cls}" aria-hidden="true"></span>${label} <b>${$(v)} (${pct(share(v), 1)})</b></li>`)
    .join("");
  return card(
    "Where each dollar goes",
    `<div class="ck-bar" role="img" aria-label="Share of gross income: ${parts.map(([l, v]) => `${l} ${pct(share(v), 1)}`).join(", ")}">${segs}</div><ul class="ck-legend">${legend}</ul>`,
  );
}

const i18nEi = (r: TaxResult) => (r.input.province === "QC" ? "EI and QPIP" : "EI");

function lineByLine(r: TaxResult): string {
  const i = r.input;
  const c = r.core;
  const f = c.tax.federal;
  const p = c.tax.provincial;
  const pay = c.payroll;
  const prov = provinceName(i.province);
  const rows: string[] = [];
  if (i.employment > 0) rows.push(row("Employment income", $(i.employment)));
  if (i.selfEmployment > 0) rows.push(row("Self-employment income (net)", $(i.selfEmployment)));
  if (i.otherIncome > 0) rows.push(row("Other income", $(i.otherIncome)));
  rows.push(row("Total income", $(c.gross), "ck-total"));
  if (i.rrsp > 0) rows.push(row("RRSP deduction", `&minus;${$(i.rrsp)}`, "ck-sub"));
  if (i.fhsa > 0) rows.push(row("FHSA deduction", `&minus;${$(i.fhsa)}`, "ck-sub"));
  if (i.dues > 0) rows.push(row("Union or professional dues", `&minus;${$(i.dues)}`, "ck-sub"));
  rows.push(row("Taxable income", $(c.taxable), "ck-total"));
  rows.push(row("Federal tax on the brackets", $(f.basic)));
  rows.push(row(`Less basic personal amount credit (${$(f.bpa)} &times; 14%)`, `&minus;${$(Math.min(f.basic, f.credit))}`, "ck-sub"));
  if (f.cppCredit > 0) rows.push(row(`Less ${pay.pensionLabel} contributions credit (14% of ${$(pay.creditEligiblePension)})`, `&minus;${$(f.cppCredit)}`, "ck-sub"));
  if (f.eiCredit > 0) rows.push(row(`Less EI premiums credit (14% of ${$(pay.ei)})`, `&minus;${$(f.eiCredit)}`, "ck-sub"));
  if (f.employmentCredit > 0) {
    const employmentBase = Math.min(CANADA_EMPLOYMENT_AMOUNT, i.employment);
    rows.push(row(`Less Canada employment amount credit (${$(employmentBase)} &times; 14%)`, `&minus;${$(f.employmentCredit)}`, "ck-sub"));
  }
  if (f.abatement > 0) rows.push(row(`Less Quebec abatement (${pct(QC_ABATEMENT, 1)})`, `&minus;${$(f.abatement)}`, "ck-sub"));
  rows.push(row("Federal tax", $(f.net), "ck-hl"));
  rows.push(row(`${prov} tax on the brackets`, $(p.basic)));
  rows.push(row(`Less basic personal amount credit (${$(p.bpa)})`, `&minus;${$(Math.min(p.basic, p.credit))}`, "ck-sub"));
  if (p.surtax > 0) rows.push(row("Ontario surtax", $(p.surtax), "ck-sub"));
  if (p.taxReduction > 0) rows.push(row("Less Ontario tax reduction", `&minus;${$(p.taxReduction)}`, "ck-sub"));
  if (p.lift > 0) rows.push(row("Less Ontario LIFT credit", `&minus;${$(p.lift)}`, "ck-sub"));
  if (p.ohp > 0) rows.push(row("Ontario Health Premium", $(p.ohp), "ck-sub"));
  rows.push(row(`${prov} tax`, $(p.net), "ck-hl"));
  rows.push(row("Total income tax", $(c.tax.total), "ck-total"));
  if (pay.pension > 0 || i.employment + i.selfEmployment > 0) rows.push(row(`${pay.pensionLabel} contributions`, $c(pay.pension)));
  if (pay.pension2 > 0) rows.push(row(`${pay.pensionLabel}2 contributions`, $c(pay.pension2)));
  if (i.employment > 0) rows.push(row(i.province === "QC" ? "EI premiums (Quebec rate)" : "EI premiums", $c(pay.ei)));
  if (pay.qpip > 0) rows.push(row("QPIP premiums", $c(pay.qpip)));
  rows.push(row("Take-home pay", $(c.takeHome), "ck-total"));
  return card(
    "From gross to take-home, line by line",
    `${table(rows, `${TAX_YEAR} tax year, ${prov}`)}<p class="ck-note">Laid out the way a tax return reads: income, deductions, taxable income, tax, then payroll contributions. Federal credits now included: CPP or QPP contributions, EI premiums, and the Canada employment amount, each at the 14% lowest federal rate. In Ontario the tax reduction, the LIFT credit, and the health premium up to $25,000 of taxable income are included; the health premium above $25,000 is not yet modelled. LIFT uses gross income minus union or professional dues as its net-income figure and assumes no spouse income.</p>`,
  );
}

function marginal(r: TaxResult): string {
  const m = r.marginalRate;
  const body = `<p class="ck-inverse">Your next dollar of taxable income is taxed at <strong class="ck-big-inline">${pct(m)}</strong> (federal plus ${provinceName(r.input.province)}).</p>
<p>Your average rate is much lower: <strong>${pct(r.averageRate)}</strong> of your total income goes to income tax. With ${r.core.payroll.pensionLabel} and EI included, ${pct(r.effectiveRate)} of your income is deducted.</p>
<p>On your next $1,000 of income, you would keep about <strong>${$(r.keepPer1000)}</strong> after tax and payroll contributions.</p>
<h3 class="ck-h4">What if</h3>
<ul>
<li><strong>Put ${$(RRSP_WHAT_IF)} more in an RRSP:</strong> your income tax drops by about ${$(r.rrspWhatIf)}, if you have the room.</li>
<li><strong>Earn ${$(INCOME_WHAT_IF)} more:</strong> about ${$(r.incomeWhatIf)} of it reaches your bank account.</li>
</ul>`;
  return card("Your marginal and average rates", body);
}

function provinces(r: TaxResult): string {
  const rows = [...r.provinces]
    .sort((a, b) => b.takeHome - a.takeHome)
    .map((p) =>
      `<tr${p.province === r.input.province ? ` class="ck-hl"` : ""}><th scope="row">${provinceName(p.province)}${p.province === r.input.province ? " (you)" : ""}</th><td>${$(p.incomeTax)}</td><td>${$(p.takeHome)}</td></tr>`,
    );
  const head = `<thead><tr><th scope="col">Province or territory</th><th scope="col" class="ck-num">Income tax</th><th scope="col" class="ck-num">Take-home</th></tr></thead>`;
  return card(
    "Same income, other provinces",
    `${table(rows, "Same income and deductions, sorted by take-home", head)}<p class="ck-note">A curiosity, not a reason to move: housing and other costs matter far more. Quebec rows include the abatement and Quebec payroll rates; the Ontario row includes the health premium only up to $25,000 of taxable income.</p>`,
  );
}

function linksRow(): string {
  return `<ul class="ck-links">
<li><a href="/calculators/rrsp-room">Lower it with an RRSP: check your room</a></li>
<li><a href="/calculators/tfsa-vs-rrsp">TFSA or RRSP for your next dollar?</a></li>
<li><a href="/compare/tfsa-vs-rrsp">TFSA vs RRSP, explained</a></li>
</ul>`;
}

export function renderAnnual(r: TaxResult): string {
  const c = r.core;
  const prov = provinceName(r.input.province);
  const headline = `<div class="ck-headline"><p class="ck-kicker">Estimated take-home pay, ${TAX_YEAR}</p>
<p class="ck-big">${$(c.takeHome)} <small>a year</small></p>
<p class="ck-lead">On ${$(c.gross)} of income in ${prov}: ${$(c.tax.total)} of income tax and ${$(c.payroll.total)} of ${c.payroll.pensionLabel}${c.payroll.ei > 0 ? ", EI" : ""}${c.payroll.qpip > 0 ? " and QPIP" : ""} contributions. That is about ${$(c.takeHome / 12)} a month.</p>
<p class="ck-verdict"><span class="ck-verdict-dot" aria-hidden="true"></span>Marginal rate ${pct(r.marginalRate)} · average income tax rate ${pct(r.averageRate)}</p></div>`;
  const notes = alerts(r.warnings.map((w) => warningCopy(w, r)));
  return `${headline}${bar(r)}${lineByLine(r)}${marginal(r)}${notes ? card("Notes on your estimate", notes) : ""}${provinces(r)}${linksRow()}<p class="ck-disclaimer">${DISCLAIMER}</p>`;
}

/* ------------------------------------------------------------------ */
/* Paycheque mode                                                      */
/* ------------------------------------------------------------------ */

export function renderPaycheque(p: PaychequeResult, annual: TaxResult): string {
  if (p.gross <= 0) {
    return `<div class="ck-headline"><p class="ck-kicker">Paycheque mode</p><p class="ck-lead">Paycheque mode works from employment income. Enter a salary in step 2 to see what lands in your account each pay.</p></div>${annual.input.selfEmployment > 0 ? `<p class="ck-note">Self-employed income has no paycheque withholding. Switch to the annual view to see the tax to set aside.</p>` : ""}<p class="ck-disclaimer">${DISCLAIMER}</p>`;
  }
  const f = p.first;
  const L = p.pensionLabel;
  const headline = `<div class="ck-headline"><p class="ck-kicker">Estimated net pay, paid ${PAY_LABEL[p.frequency]}</p>
<p class="ck-big">${$c(f.net)} <small>a pay</small></p>
<p class="ck-lead">From ${$c(p.gross)} of gross pay, ${p.periods} pays a year, on your first pay of the year. Net pay can rise later in the year once ${L} and EI reach their yearly maximums.</p></div>`;

  const rows = [
    row("Gross pay", $c(f.gross), "ck-total"),
    row(`${L} contributions`, `&minus;${$c(f.pension)}`, "ck-sub"),
    ...(f.pension2 > 0 ? [row(`${L}2 contributions`, `&minus;${$c(f.pension2)}`, "ck-sub")] : []),
    row("EI premiums", `&minus;${$c(f.ei)}`, "ck-sub"),
    ...(f.qpip > 0 ? [row("QPIP premiums", `&minus;${$c(f.qpip)}`, "ck-sub")] : []),
    row("Federal tax withheld", `&minus;${$c(f.federal)}`, "ck-sub"),
    row("Provincial tax withheld", `&minus;${$c(f.provincial)}`, "ck-sub"),
    row("Net pay", $c(f.net), "ck-total"),
  ];
  const stub = card("Your pay stub, first pay of the year", `${table(rows)}<p class="ck-note">Tax withheld uses your TD1 claims (federal ${$(p.td1Federal)}, provincial ${$(p.td1Provincial)}) as credits.</p>`);

  const stops: string[] = [];
  if (p.pension2StartsAt !== null) stops.push(`<li><strong>${L}2 starts on pay ${p.pension2StartsAt}</strong>, once your earnings this year pass the first ${L} ceiling.</li>`);
  if (p.pensionMaxedAt !== null) stops.push(`<li><strong>${L} stops after pay ${p.pensionMaxedAt}</strong>: you have hit the yearly maximum.</li>`);
  if (p.eiMaxedAt !== null) stops.push(`<li><strong>EI stops after pay ${p.eiMaxedAt}</strong>: you have hit the yearly maximum.</li>`);
  if (p.qpipMaxedAt !== null) stops.push(`<li><strong>QPIP stops after pay ${p.qpipMaxedAt}</strong>.</li>`);
  const timeline = card(
    "How your pay changes through the year",
    stops.length
      ? `<ul>${stops.join("")}</ul><p>Your last pay of the year: about <strong>${$c(p.last.net)}</strong>.</p>`
      : `<p>At this salary, ${L} and EI never reach their yearly maximums, so your net pay stays about the same all year.</p>`,
  );

  const diff = p.yearWithheld - annual.core.tax.total;
  const balance = Math.abs(diff) < 50
    ? "That lines up closely with the annual estimate."
    : diff > 0
      ? `That is about ${$(diff)} more than the annual estimate, which would come back as a refund when you file.`
      : `That is about ${$(-diff)} less than the annual estimate, which you may owe when you file.`;
  const year = card(
    "Over the whole year",
    `<p>Net pay adds up to about <strong>${$(p.yearNet)}</strong> over ${p.periods} pays, with ${$(p.yearWithheld)} of income tax withheld.</p><p>The annual estimate for the same salary is ${$(annual.core.tax.total)} of income tax. ${balance} Withholding and the year-end bill rarely match exactly.</p>`,
  );

  return `${headline}${stub}${timeline}${year}<p class="ck-note">Assumes steady pay all year, no other income, and contributions starting in January. Employers follow CRA's payroll formulas; check against CRA's <a href="${PDOC_URL}" rel="noopener">Payroll Deductions Online Calculator</a>.${p.pensionLabel === "QPP" ? " In Quebec, Revenu Québec's source-deduction formulas set provincial withholding." : ""}</p><p class="ck-disclaimer">${DISCLAIMER}</p>`;
}

/* ------------------------------------------------------------------ */
/* Below the tool: field help, next steps, worked example              */
/* ------------------------------------------------------------------ */

/** Registry figures the next steps cite (kept apart from taxFigures, which other pages share). */
export const itxNextFigures: FigureLog = new Map();
const DL = "tax-deadlines-2026.json";
const FILING_DEADLINE = figure<string>(DL, "t1.filing.individuals.2027", itxNextFigures);
const SELF_EMPLOYED_DEADLINE = figure<string>(DL, "t1.filing.self_employed.2027", itxNextFigures);
const LATE_PENALTY = figure<{ base: number; per_full_month_late: number; max_months: number }>(DL, "filing.late_penalty", itxNextFigures);
const RRSP_DEADLINE = figure<string>(DL, "rrsp.deadline.2026_tax_year", itxNextFigures);
const RECORDS_RULE = figure<string>("home-office-2026.json", "home_office.employee.records_six_years", itxNextFigures);
const RECORD_YEARS = Number(/(\d+) years/.exec(RECORDS_RULE)![1]);

/** One line per form field: why the tool needs it (140 characters max). */
export const HELP = {
  mode: "The whole-year view shows your tax bill; the paycheque view shows what lands in your account each pay.",
  province: "Your province decides which tax brackets and credits apply.",
  age: "Age decides whether CPP applies (18 and over) and whether the OAS recovery tax can apply (65 and over).",
  employment: "Wages pay CPP and EI and earn the Canada employment amount credit, so they are kept apart from other income.",
  selfEmployment: "Self-employed income pays both halves of CPP and no EI, so it is taxed differently from wages.",
  otherIncome: "Other income adds to taxable income but pays no CPP or EI.",
  otherHasDividendsOrGains: "Dividends and capital gains get special tax treatment this version does not model, so the tool flags them.",
  rrsp: "RRSP contributions come off taxable income, which lowers tax at your marginal rate.",
  fhsa: "FHSA contributions come off taxable income the same way RRSP contributions do.",
  dues: "Dues are deductible, and in Ontario they also lower the income used for the LIFT credit.",
  payFrequency: "The number of pays a year splits the yearly tax and payroll into per-cheque amounts.",
  td1Federal: "Your federal TD1 claim sets how much federal tax your employer withholds from each pay.",
  td1Provincial: "Your provincial TD1 claim sets how much provincial tax is withheld from each pay.",
} as const;

export function renderNextSteps(): string {
  return nextSteps("itx-h-next", [
    `<strong>File your ${TAX_YEAR} return by ${longDate(FILING_DEADLINE)}.</strong> Any balance owing is due that day too. Self-employed filers have until ${longDate(SELF_EMPLOYED_DEADLINE)} to file, but payment is still due ${longDate(FILING_DEADLINE)}.`,
    `<strong>If you owe, pay on time.</strong> CRA My Payment takes online debit payments. Filing late with a balance owing adds a ${pct(LATE_PENALTY.base)} penalty plus ${pct(LATE_PENALTY.per_full_month_late)} for each full month late, up to ${LATE_PENALTY.max_months} months, and interest runs on unpaid tax.`,
    `<strong>Lower this number with an RRSP deduction.</strong> Contributions made by ${longDate(RRSP_DEADLINE)} can be deducted on your ${TAX_YEAR} return. Check how much room you have with the <a href="/calculators/rrsp-room">RRSP room calculator</a>.`,
    `<strong>Keep your slips and receipts for ${RECORD_YEARS} years</strong> from the end of the tax year. CRA can ask to see them, and you do not send them with the return.`,
  ]);
}

/** The worked example's inputs: one Ontario salary, nothing else. */
export const EXAMPLE_INPUT: Readonly<TaxInput> = { ...DEFAULT_INPUT, province: "ON", employment: 82_000, age: 35 };

export function renderExample(): string {
  const r = estimate(EXAMPLE_INPUT);
  const c = r.core;
  return workedExample(
    "itx-h-example",
    `A 35-year-old in ${provinceName(EXAMPLE_INPUT.province)} earns <strong>${$(EXAMPLE_INPUT.employment!)}</strong> in employment income in ${TAX_YEAR}, with no other income and no RRSP, FHSA or dues deductions. Run through this calculator, that gives:`,
    [
      ["Income tax (federal and provincial)", $(c.tax.total)],
      [`${c.payroll.pensionLabel} and EI`, $(c.payroll.total)],
      ["Take-home pay", `${$(c.takeHome)} (${$(c.takeHome / 12)} a month)`],
      ["Average income tax rate", pct(r.averageRate)],
      ["Marginal rate on the next dollar", pct(r.marginalRate)],
      [`Tax saved by ${$(RRSP_WHAT_IF)} more RRSP`, $(r.rrspWhatIf)],
    ],
    "Computed by the same engine as the calculator above when this page was built. Change the inputs above to run your own numbers.",
  );
}
