/**
 * house-affordability-render.ts: turns an Affordability result into the
 * results HTML for the house affordability calculator. Used at build time
 * (the page shows the default household with JS off) and in the browser on
 * every input change. Only numbers and fixed copy are rendered.
 *
 * Copy rules: an estimate, never a pre-approval (the lender decides); the
 * qualifying payment and the real payment are always shown apart; no em
 * dashes; never "you should".
 */

import { $, NOT_VERIFIED, alerts, card, facts, pct, row, table, type Alert } from "./calc-kit";
import { INSURED_CAP, MQR_FLOOR } from "./down-payment-planner";
import { GDS, LENDER_INTERNAL, TDS, type Affordability, type Limit } from "./house-affordability";

export const RULES_DATE = "2026-09-27";
export const DISCLAIMER = `An estimate, not a pre-approval: your lender decides. Rules used are dated ${RULES_DATE}: GDS ${pct(GDS, 0)} and TDS ${pct(TDS, 0)} insured ceilings, the stress test, the ${$(INSURED_CAP)} insured price cap and 30-year insured amortization for first-time buyers and new builds.`;

const LIMIT_NAME: Record<Limit, string> = {
  gds: `Housing costs (GDS ${pct(GDS, 0)})`,
  tds: `Housing plus debts (TDS ${pct(TDS, 0)})`,
  down: "Cash for down payment and closing",
};

const LIMIT_REASON: Record<Limit, string> = {
  gds: `housing costs at the qualifying rate would pass ${pct(GDS, 0)} of your gross income`,
  tds: `housing costs plus your other debt payments would pass ${pct(TDS, 0)} of your gross income`,
  down: "your cash would not cover the minimum down payment plus closing costs",
};

function headline(a: Affordability): string {
  const s = a.at;
  if (a.maxPrice <= 0) {
    return `<div class="ck-headline ck-tone-warn"><p class="ck-kicker">Your maximum purchase price</p><p class="ck-big">Not yet</p><p class="ck-lead">At these numbers, no price passes all three limits. The tightest is ${LIMIT_NAME[a.binding].toLowerCase()}. Try more cash, less debt, or a co-borrower's income.</p></div>`;
  }
  return `<div class="ck-headline"><p class="ck-kicker">Your maximum purchase price</p>
<p class="ck-big">${$(a.maxPrice)}</p>
<p class="ck-lead">Above this price, ${LIMIT_REASON[a.binding]}. With ${$(s.down)} down (${pct(s.downPct, 1)}), the mortgage would be ${$(s.mortgage)}${s.insured ? " including the CMHC premium" : ""}.</p>
<p class="ck-verdict"><span class="ck-verdict-dot" aria-hidden="true"></span>Lenders test you at ${pct(s.qualifyingRate)}: ${$(s.qualifyingPayment)} a month. At your ${pct(a.input.contractRate)} rate you would actually pay ${$(s.actualPayment)}.</p></div>`;
}

function limitsCard(a: Affordability): string {
  const items: [string, string, boolean][] = (["gds", "tds", "down"] as Limit[]).map((k) => [
    `${LIMIT_NAME[k]}${a.binding === k ? " (the limit)" : ""}`,
    a.limits[k] >= 20_000_000 ? "Over $20 million" : $(a.limits[k]),
    a.binding === k,
  ]);
  const savings = a.savingsLimited
    ? `<p><strong>Your limiting factor is savings, not income.</strong> Your income could carry up to ${$(Math.min(a.limits.gds, a.limits.tds))}, but the cash runs out first.</p>`
    : "";
  return card("The three limits", `${facts(items)}${savings}<p class="ck-note">The lowest of the three is your maximum. Each is worked out separately, so you can see how far the others are.</p>`);
}

function paymentsCard(a: Affordability): string {
  const s = a.at;
  const floor = a.onFloor
    ? `<p class="ck-note">Your rate plus 2 points is below the ${pct(MQR_FLOOR)} floor, so you qualify at ${pct(MQR_FLOOR)}, not ${pct(a.input.contractRate + 0.02)}.</p>`
    : "";
  return card(
    "The qualifying rate is not the paying rate",
    `<div class="ck-duo">
<div><p class="ck-duo-label">Qualifying payment at ${pct(s.qualifyingRate)}</p><p class="ck-duo-value">${$(s.qualifyingPayment)}</p><p class="ck-duo-foot">What GDS and TDS are tested on: the higher of your rate plus 2 points and ${pct(MQR_FLOOR)}.</p></div>
<div class="ck-win"><p class="ck-duo-label">Your real payment at ${pct(a.input.contractRate)}</p><p class="ck-duo-value">${$(s.actualPayment)}</p><p class="ck-duo-foot">${$(s.qualifyingPayment - s.actualPayment)} a month less than the test payment. ${a.input.amortYears} years, Canadian semi-annual compounding.</p></div>
</div>${floor}`,
  );
}

function breakdownCard(a: Affordability): string {
  const s = a.at;
  const r = a.input;
  const monthly = r.income / 12;
  const rows = [
    row("Gross income per month", $(monthly)),
    row(`Mortgage payment at ${pct(s.qualifyingRate)}`, $(s.qualifyingPayment), "ck-sub"),
    row("Property tax", $(s.propertyTaxMonthly), "ck-sub"),
    row("Heating", $(s.heating), "ck-sub"),
    ...(s.condoCounted > 0 ? [row("Condo fees (half counts)", $(s.condoCounted), "ck-sub")] : []),
    row(`Housing costs: GDS ${pct(s.gdsRatio, 1)} (cap ${pct(GDS, 0)})`, $(s.housing), "ck-hl"),
    row("Other debt payments", $(r.debt), "ck-sub"),
    row(`Housing plus debts: TDS ${pct(s.tdsRatio, 1)} (cap ${pct(TDS, 0)})`, $(s.housing + r.debt), "ck-hl"),
  ];
  const tt = s.transferTaxManual
    ? row("Land transfer tax", `not calculated for this province`, "ck-sub")
    : row(`Land transfer tax${s.transferTaxRebate > 0 ? ` after ${$(s.transferTaxRebate)} first-time rebate` : ""}${s.torontoUnverified ? ` ${NOT_VERIFIED}` : ""}`, $(s.transferTaxNet), "ck-sub");
  const money = [
    row("Purchase price", $(s.price)),
    row(`Down payment (${pct(s.downPct, 1)} of the price)`, $(s.down), "ck-sub"),
    row(`Minimum down payment at this price (${pct(s.price > 0 ? s.minDown / s.price : 0, 1)})`, $(s.minDown), "ck-sub"),
    ...(s.insured ? [row(`CMHC premium (${pct(s.premiumRate)} of the loan, added to the mortgage)`, $(s.premium), "ck-sub")] : []),
    row("Mortgage", $(s.mortgage), "ck-hl"),
    tt,
    ...(s.pstOnPremium > 0 ? [row("Sales tax on the CMHC premium (cash)", $(s.pstOnPremium), "ck-sub")] : []),
    row("Legal and other fees", $(r.legal), "ck-sub"),
    row("Cash needed: down payment plus closing", $(s.down + s.closing), "ck-total"),
  ];
  return card(
    "The breakdown at your maximum",
    `${table(rows, "Each month")}${table(money, "At closing")}<p class="ck-note">The minimum down payment is 5% of the first $500,000 and 10% of the rest up to ${$(INSURED_CAP)}. At this price that is ${pct(s.price > 0 ? s.minDown / s.price : 0, 1)} overall, not 5%.</p>`,
  );
}

function amortCard(a: Affordability): string {
  const c = a.amortCompare;
  if (!c) return "";
  const head = `<thead><tr><th scope="col"></th><th scope="col" class="ck-num">25 years</th><th scope="col" class="ck-num">30 years</th></tr></thead>`;
  const rows = [
    `<tr><th scope="row">Real monthly payment at this price</th><td>${$(c.years25.payment)}</td><td>${$(c.years30.payment)}</td></tr>`,
    `<tr><th scope="row">Total interest over the full term</th><td>${$(c.years25.totalInterest)}</td><td>${$(c.years30.totalInterest)}</td></tr>`,
    `<tr><th scope="row">Maximum purchase price</th><td>${$(c.years25.maxPrice)}</td><td>${$(c.years30.maxPrice)}</td></tr>`,
  ];
  return card(
    "25 or 30 years?",
    `${table(rows, "Same rate, same cash", head)}<p class="ck-note">Thirty years lowers the payment and can raise the price you qualify for, but adds 0.20% to the insurance premium and costs more interest overall. Shown at today's rate held for the whole amortization, which real mortgages renew every few years.</p>`,
  );
}

function notes(a: Affordability): string {
  const list: Alert[] = [];
  const s = a.at;
  if (a.aboveCap) {
    list.push({ tone: "warn", html: `<strong>Above ${$(INSURED_CAP)}, mortgage insurance is not available</strong> and the minimum down payment jumps to 20% of the whole price ($300,000 at $1,500,001). Lender-set ratios apply; 39%/44% is shown only as a reference.` });
  } else if (a.nearCap) {
    list.push({ tone: "warn", html: `<strong>You are close to the ${$(INSURED_CAP)} cliff.</strong> One dollar over and the minimum down payment jumps from $125,000 to 20% of the whole price.` });
  }
  if (!s.insured && !a.aboveCap && s.price > 0) {
    list.push({ tone: "info", html: "<strong>20% or more down: no CMHC insurance.</strong> The stress test still applies, but the ratios are set by your lender. This tool uses 39%/44% as a reference." });
  }
  if (a.debtCost > 0) {
    list.push({ tone: "info", html: `<strong>Your other debts cost about ${$(a.debtCost)} of house.</strong> That is how much higher your income-based maximum would be with no debt payments.` });
  }
  if (a.input.condoFees > 0) {
    list.push({ tone: "info", html: "<strong>Condo fees:</strong> lenders count half of them in GDS and TDS, because the fees partly cover heat and upkeep you would otherwise pay. The other half still comes out of your budget." });
  }
  if (s.transferTaxManual) {
    list.push({ tone: "info", html: "<strong>Land transfer tax is only calculated for Ontario (and Toronto) and British Columbia.</strong> Add your province's transfer tax or registration fees to legal and other fees." });
  }
  if (s.torontoUnverified) {
    list.push({ tone: "info", html: `<strong>Toronto municipal land transfer tax</strong> uses the tiers in our down payment planner: ${NOT_VERIFIED} against toronto.ca.` });
  }
  list.push({ tone: "info", html: `<strong>Many lenders run tighter limits,</strong> around ${pct(LENDER_INTERNAL.gds, 0)} GDS and ${pct(LENDER_INTERNAL.tds, 0)} TDS. ${pct(GDS, 0)}/${pct(TDS, 0)} is the insured ceiling, not a target, and a pre-approval is the only real number.` });
  list.push({ tone: "info", html: "<strong>Property tax and heating are rough defaults.</strong> Property tax is charged on assessed value at your city's rate; replace both with real figures for the home you are looking at." });
  return card("Notes on your numbers", alerts(list));
}

export function renderResults(a: Affordability): string {
  const links = `<ul class="ck-links">
<li><a href="/calculators/down-payment-planner">Plan the down payment</a></li>
<li><a href="/calculators/rent-vs-buy">Rent or buy at this price?</a></li>
</ul>`;
  return `${headline(a)}${limitsCard(a)}${a.maxPrice > 0 ? paymentsCard(a) + breakdownCard(a) + amortCard(a) : ""}${notes(a)}${links}<p class="ck-disclaimer">${DISCLAIMER}</p>`;
}
