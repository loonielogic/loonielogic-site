/**
 * down-payment-planner-render.ts: turns a Plan into the results HTML. Used at
 * build time (so the page shows a worked default with JS off) and in the
 * browser on every input change. Only numbers and fixed copy are rendered;
 * no user-typed text reaches the markup.
 *
 * Copy rules: education, not advice (never "you should"); no em dashes.
 */

import { nextSteps, workedExample } from "./calc-kit";
import {
  CLOSING_RULE_OF_THUMB,
  FHSA_ANNUAL,
  FHSA_LIFETIME,
  FHSA_REFUND_RANGE,
  HBP_HOLDING_DAYS,
  HBP_LIMIT,
  HBP_REPAY_YEARS,
  HOME_BUYERS_AMOUNT_VALUE,
  INSURED_CAP,
  MAINTENANCE_ANNUAL,
  defaultInput,
  plan,
  qualifyingRate,
  SNAPSHOT_RATE,
  TFSA_ANNUAL,
  type Plan,
  type PlannerInput,
  type Scenario,
} from "./down-payment-planner";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const $ = (n: number) => (Number.isFinite(n) ? money.format(Math.round(n)) : "n/a");
export const pct = (n: number, digits = 2) => `${(n * 100).toFixed(digits)}%`;
const monthYear = (y: number, m: number) => `${MONTHS[m]} ${y}`;
const months = (n: number) => (n === 1 ? "1 month" : `${n} months`);

const SOURCE_LABELS: Record<string, string> = {
  fhsa: "FHSA (tax-free qualifying withdrawal)",
  hbp: "RRSP via the Home Buyers' Plan (repaid over 15 years)",
  tfsa: "TFSA",
  taxable: "Taxable savings",
  gift: "Gift",
};

function row(label: string, value: string, cls = ""): string {
  return `<tr${cls ? ` class="${cls}"` : ""}><th scope="row">${label}</th><td>${value}</td></tr>`;
}

function headline(p: Plan): string {
  const s = p.chosen;
  const i = p.input;
  if (s.months === 0) {
    return `<p class="dpp-headline">Your current savings already cover the ${$(s.stack.cashTarget)} cash target.</p>`;
  }
  if (i.mode === "timeline") {
    if (!Number.isFinite(s.months)) {
      return `<p class="dpp-headline">At ${$(i.monthly)} a month this plan does not reach the ${$(s.ownTarget)} it needs from savings. Try a higher monthly amount or a different price.</p>`;
    }
    return `<p class="dpp-headline">Saving ${$(i.monthly)} a month, this plan reaches ${$(s.ownTarget)} in about <strong>${months(s.monthsWhole)}</strong> (around ${monthYear(s.purchaseYear, s.purchaseMonth)}).</p>`;
  }
  return `<p class="dpp-headline">To reach ${$(s.ownTarget)} in ${months(i.targetMonths)} (by ${monthYear(s.purchaseYear, s.purchaseMonth)}), this plan needs about <strong>${$(s.monthly)} a month</strong>.</p>`;
}

function stackTable(p: Plan): string {
  const s = p.chosen.stack;
  const tt = s.transferTax;
  const i = p.input;
  const rows: string[] = [];
  rows.push(row(`Down payment (${pct(s.downPct, 1)} of ${$(i.price)})`, $(s.downPayment)));
  if (tt.manual) {
    rows.push(row("Transfer tax or registration fees (your entry)", $(tt.net)));
  } else {
    const provLabel = i.province === "BC" ? "BC property transfer tax" : "Ontario land transfer tax";
    rows.push(row(provLabel, $(tt.provincial)));
    if (tt.municipal > 0) {
      rows.push(row(`Toronto municipal land transfer tax <span class="dpp-flag">not yet verified against toronto.ca</span>`, $(tt.municipal)));
    }
    if (tt.rebate > 0) rows.push(row("First-time buyer rebate or exemption", `&minus;${$(tt.rebate)}`));
  }
  if (s.pstOnPremium > 0) {
    rows.push(row(`Provincial sales tax on the CMHC premium (paid in cash)`, $(s.pstOnPremium)));
  }
  rows.push(row(`Legal, title, inspection and other fees <span class="dpp-flag">assumption</span>`, $(s.fees)));
  if (s.buffer > 0) rows.push(row(`Extra cushion <span class="dpp-flag">assumption</span>`, $(s.buffer)));
  rows.push(row("Total cash needed at closing", $(s.cashTarget), "dpp-total"));

  const notes: string[] = [];
  if (s.insured) {
    notes.push(
      `The CMHC insurance premium (${pct(s.premiumRate)} of the loan, ${$(s.premium)}) is added to the mortgage, not paid in cash. Only the sales tax on it is due at closing.`,
    );
  }
  if (s.aboveInsuredCap) {
    notes.push(`Above ${$(INSURED_CAP)}, mortgage insurance is not available and the minimum down payment is 20% of the whole price.`);
  }
  notes.push(
    `Rule-of-thumb check: closing costs of ${pct(CLOSING_RULE_OF_THUMB, 1)} of the price would be ${$(i.price * CLOSING_RULE_OF_THUMB)}. The itemized total above excludes the down payment: ${$(s.closingTotal)}.`,
  );
  return `<table class="dpp-table"><tbody>${rows.join("")}</tbody></table>${notes.map((n) => `<p class="dpp-note">${n}</p>`).join("")}`;
}

function sourcesTable(p: Plan): string {
  const s = p.chosen;
  const rows = s.sources.lines
    .filter((l) => l.amount > 0)
    .map((l) => row(SOURCE_LABELS[l.source], $(l.amount)));
  if (rows.length === 0) rows.push(row("Nothing drawn yet", $(0)));
  if (s.sources.shortfall > 0.5) rows.push(row("Still short", $(s.sources.shortfall), "dpp-warn"));
  else if (s.sources.leftOver > 0.5) rows.push(row("Left over after closing", $(s.sources.leftOver)));
  const people = p.input.couple ? "each partner's" : "the";
  return `<table class="dpp-table"><tbody>${rows.join("")}</tbody></table>
<p class="dpp-note">Order shown: FHSA first, then the Home Buyers' Plan, then TFSA, then taxable savings, then gifts. New monthly savings are placed in ${people} FHSA until its yearly room is used, then the TFSA, then a taxable account. This is one way to sequence the accounts, shown so you can compare; it is not a recommendation.</p>
<p class="dpp-note">FHSA contributions are also tax-deductible. For an $8,000 deduction in Ontario, the refund is roughly ${$(FHSA_REFUND_RANGE.min)} to ${$(FHSA_REFUND_RANGE.max)} depending on income (${pct(FHSA_REFUND_RANGE.min_rate)} to ${pct(FHSA_REFUND_RANGE.max_rate)} combined marginal rates). The planner does not add refunds to your savings. First-time buyers can also claim the Home Buyers' Amount, worth about ${$(HOME_BUYERS_AMOUNT_VALUE)} of federal tax relief in 2026.</p>`;
}

function tradeoffCard(p: Plan): string {
  const a = p.minimum;
  const b = p.twenty;
  if (p.input.price > INSURED_CAP) {
    return `<p class="dpp-note">At this price 20% is already the minimum down payment, so there is no insured option to compare.</p>`;
  }
  const timing = (s: Scenario) =>
    p.input.mode === "timeline"
      ? Number.isFinite(s.months)
        ? months(s.monthsWhole)
        : "not reached"
      : `${$(s.monthly)}/mo`;
  const header = `<tr><th scope="col"></th><th scope="col">Minimum down</th><th scope="col">20% down</th></tr>`;
  const r = (label: string, x: string, y: string) => `<tr><th scope="row">${label}</th><td>${x}</td><td>${y}</td></tr>`;
  const rows = [
    r("Down payment", $(a.stack.downPayment), $(b.stack.downPayment)),
    r("Cash needed at closing", $(a.stack.cashTarget), $(b.stack.cashTarget)),
    r(p.input.mode === "timeline" ? "Time to save it" : "Monthly saving needed", timing(a), timing(b)),
    r("CMHC premium added to mortgage", $(a.stack.premium), $(b.stack.premium)),
    r("Mortgage amount", $(a.stack.mortgagePrincipal), $(b.stack.mortgagePrincipal)),
    r(`Payment at ${pct(p.input.contractRate)}`, $(a.payment), $(b.payment)),
    r(`Qualifying payment (stress test ${pct(qualifyingRate(p.input.contractRate))})`, $(a.qualifyingPayment), $(b.qualifyingPayment)),
    r(`Payment at ${pct(SNAPSHOT_RATE)} snapshot rate`, $(a.snapshotPayment), $(b.snapshotPayment)),
    r(`Interest over ${p.input.amortYears} years if the rate never changed`, $(a.interestOverAmortization), $(b.interestOverAmortization)),
  ];
  let summary = "";
  if (p.input.mode === "timeline" && Number.isFinite(a.months) && Number.isFinite(b.months)) {
    summary = `20% down takes about ${months(b.monthsWhole - a.monthsWhole)} longer to save in this plan, avoids a ${$(a.stack.premium)} insurance premium, and lowers the payment by about ${$(a.payment - b.payment)} a month.`;
  } else if (p.input.mode === "target") {
    summary = `Reaching 20% down on the same date takes about ${$(b.monthly - a.monthly)} more a month, avoids a ${$(a.stack.premium)} insurance premium, and lowers the payment by about ${$(a.payment - b.payment)} a month.`;
  }
  return `<div class="dpp-scroll"><table class="dpp-table dpp-compare"><thead>${header}</thead><tbody>${rows.join("")}</tbody></table></div>
${summary ? `<p class="dpp-note">${summary} Rent paid, home-price changes, and rate changes during the extra time are not included.</p>` : ""}`;
}

function budgetPanel(p: Plan): string {
  const b = p.budget;
  const i = p.input;
  const rows = [
    row(`Mortgage payment at ${pct(i.contractRate)}`, $(b.mortgage)),
    row(`Property tax (${pct(i.propertyTaxRate, 3)} a year)`, $(b.propertyTax)),
    row(`Maintenance (1% of price a year) <span class="dpp-flag">assumption</span>`, $(b.maintenance)),
    row(`Home insurance <span class="dpp-flag">assumption</span>`, $(b.insurance)),
  ];
  if (b.condoFees > 0) rows.push(row("Condo fees", $(b.condoFees)));
  rows.push(row("Monthly cost of owning", $(b.total), "dpp-total"));
  if (i.rent > 0) {
    rows.push(row(`Compared with rent of ${$(i.rent)}`, `${b.vsRent >= 0 ? "+" : "&minus;"}${$(Math.abs(b.vsRent))} a month`));
  }
  let hbp = "";
  if (b.standardSchedule.length > 0) {
    const std = b.standardSchedule[0];
    hbp = `<h3>Home Buyers' Plan repayments</h3>
<p class="dpp-note">Repaying the ${$(p.chosen.hbpUsed)} withdrawn takes ${$(std.amount)} a year (about ${$(b.hbpRepaymentMonthly)} a month) for ${HBP_REPAY_YEARS} years. Missed amounts are added to taxable income.</p>
<table class="dpp-table"><tbody>
${row("Standard rule: first repayment year", `${std.year} to ${b.standardSchedule[b.standardSchedule.length - 1].year}`)}
${row("Monthly cost of owning plus HBP repayment", $(b.totalWithHbp), "dpp-total")}
</tbody></table>
<p class="dpp-note">The temporary 5-year repayment grace applied only to withdrawals made in 2022 to 2025. This plan covers a future purchase, so it uses the standard schedule.</p>`;
  }
  return `<table class="dpp-table"><tbody>${rows.join("")}</tbody></table>
<p class="dpp-note">Utilities and moving costs are not included. The money you were setting aside for the down payment (${$(p.chosen.monthly)} a month in this plan) is freed up after closing.</p>${hbp}`;
}

export function renderResults(p: Plan): string {
  return `${headline(p)}
<section class="dpp-card" aria-labelledby="dpp-h-stack"><h2 id="dpp-h-stack">Your cash stack</h2>${stackTable(p)}</section>
<section class="dpp-card" aria-labelledby="dpp-h-sources"><h2 id="dpp-h-sources">Where the money comes from</h2>${sourcesTable(p)}</section>
<section class="dpp-card" aria-labelledby="dpp-h-tradeoff"><h2 id="dpp-h-tradeoff">The 20%-down tradeoff</h2>${tradeoffCard(p)}</section>
<section class="dpp-card" aria-labelledby="dpp-h-budget"><h2 id="dpp-h-budget">After you buy: the budget shock</h2>${budgetPanel(p)}</section>`;
}

/* ------------------------------------------------------------------ */
/* Below the tool: field help, next steps, worked example              */
/* ------------------------------------------------------------------ */

/** One line per form field: why the tool needs it (140 characters max). */
export const HELP = {
  mode: "Ask when the savings will be ready, or how much to save each month to buy by a set date.",
  price: "The price sets the minimum down payment, the land transfer tax and the mortgage.",
  province: "Province sets land transfer tax and whether sales tax is charged on mortgage insurance.",
  toronto: "Toronto charges its own land transfer tax on top of Ontario's.",
  manualTransferTax: "Only Ontario and BC transfer tax is calculated here, so other provinces need their own figure.",
  firstTimeBuyer: "First-time buyers get land transfer tax rebates or exemptions that lower the cash needed.",
  downChoice: "Minimum down needs less cash but adds a CMHC premium; 20% down avoids it.",
  couple: "Two first-time buyers each get FHSA and Home Buyers' Plan limits, which doubles both.",
  fhsaOpenYear: "FHSA room starts the year the account opens, so this sets how much unused room has built up.",
  fhsaBalance: "Your FHSA balance counts toward the down payment and comes out tax-free for a first home.",
  fhsaContributedTotal: `Past contributions use up the ${$(FHSA_LIFETIME)} lifetime FHSA limit.`,
  rrspBalance: `RRSP savings can go to the down payment through the Home Buyers' Plan, up to ${$(HBP_LIMIT)} each.`,
  rrspRecent: `Contributions made in the ${HBP_HOLDING_DAYS} days before buying cannot come out under the Home Buyers' Plan.`,
  useHbp: `The Home Buyers' Plan is a loan from your RRSP, repaid over ${HBP_REPAY_YEARS} years, so including it is your call.`,
  tfsaBalance: "TFSA savings can be withdrawn tax-free for the down payment.",
  tfsaRoom: "New savings fill the TFSA only up to the room you have.",
  taxableBalance: "Savings outside registered accounts count toward the cash you need.",
  gift: "A gift at closing lowers how much has to come from your own savings.",
  monthly: "Monthly savings set how long it takes to reach the cash target.",
  targetDate: "A target month sets how much has to be saved each month to get there.",
  savingsRate: "Interest on savings shortens the timeline; the same rate applies to every account.",
  contractRate: "The mortgage rate sets the monthly payment in the budget after you buy.",
  amortYears: "A longer amortization lowers the payment but costs more interest over time.",
  fees: "Legal, title and inspection fees are paid in cash at closing, on top of the down payment.",
  buffer: "An extra cushion adds to the cash target for costs nobody can price in advance.",
  rent: "Your rent today is compared with the monthly cost of owning.",
  propertyTaxRate: "Property tax is part of the monthly cost of owning.",
  insuranceMonthly: "Home insurance is part of the monthly cost of owning.",
  condoFees: "Condo fees are part of the monthly cost of owning.",
} as const;

export function renderNextSteps(): string {
  return nextSteps("dpp-h-next", [
    `<strong>Open the FHSA early.</strong> Room starts building only once the account is open: ${$(FHSA_ANNUAL)} a year, up to ${$(FHSA_LIFETIME)} in total. New TFSA room is ${$(TFSA_ANNUAL)} a year in 2026.`,
    `<strong>Get a lender pre-approval</strong> before shopping, and check the price against your income with the <a href="/calculators/house-affordability">house affordability calculator</a>. Savings alone do not show what a lender will approve.`,
    `<strong>Ask for a rate hold</strong> with the pre-approval, then rerun this plan at the held rate so the budget after buying is realistic.`,
    `<strong>Keep a closing-cost buffer.</strong> Closing costs run about ${pct(CLOSING_RULE_OF_THUMB, 1)} of the price as a rule of thumb, on top of the down payment. If the Home Buyers' Plan is part of the plan, RRSP money has to sit in the account ${HBP_HOLDING_DAYS} days before it can come out.`,
  ]);
}

/** The worked example's inputs: a $500,000 Ontario home, $10,000 saved, $1,200 a month from October 2026. */
export const EXAMPLE_INPUT: Readonly<PlannerInput> = {
  ...defaultInput(new Date(2026, 9, 1)),
  price: 500_000,
  tfsaBalance: 10_000,
  monthly: 1_200,
};

export function renderExample(): string {
  const p = plan({ ...EXAMPLE_INPUT });
  const s = p.chosen;
  const i = p.input;
  return workedExample(
    "dpp-h-example",
    `A first-time buyer in Ontario wants a <strong>${$(i.price)}</strong> home with the minimum down payment. They have ${$(i.tfsaBalance)} in a TFSA, no FHSA yet, and save ${$(i.monthly)} a month at ${pct(i.savingsRate)} from October 2026, with a ${pct(i.contractRate)} mortgage rate over ${i.amortYears} years. Run through this planner, that gives:`,
    [
      [`Down payment (${pct(s.stack.downPct, 1)})`, $(s.stack.downPayment)],
      ["Total cash needed at closing", $(s.stack.cashTarget)],
      ["Time to save it", Number.isFinite(s.months) ? months(s.monthsWhole) : "Not reached"],
      ["CMHC premium added to the mortgage", $(s.stack.premium)],
      ["Mortgage payment", `${$(s.payment)} a month`],
      ["Monthly cost of owning", `${$(p.budget.total)} a month`],
    ],
    `Computed by the same engine as the planner above when this page was built. The monthly cost of owning adds property tax, insurance and maintenance at ${pct(MAINTENANCE_ANNUAL, 0)} of the price a year to the mortgage payment.`,
  );
}
