/**
 * down-payment-planner.ts: pure math for the First Home Savings Planner
 * (/calculators/down-payment-planner). No DOM access; the page component and
 * the tests both call these functions.
 *
 * Spec: the private planner calculator spec, with the
 * 2026-09-30 audit addenda applied (timeline formula includes interest on
 * existing savings; itemized closing costs; 4.50% illustrative contract rate).
 * Every constant comes from the figure registry via figures.ts. Where the
 * registry stores a rule as text (Toronto MLTT, BC PTT, OSFI stress test,
 * down payment tiers), the numbers are transcribed below and the tests pin
 * them to the registry's worked examples so drift fails the build.
 */

import { figure } from "./figures";

/* ------------------------------------------------------------------ */
/* Registry constants                                                  */
/* ------------------------------------------------------------------ */

export const FHSA_ANNUAL = figure<number>("fhsa-hbp-2026.json", "fhsa.annual_limit");
export const FHSA_LIFETIME = figure<number>("fhsa-hbp-2026.json", "fhsa.lifetime_limit");
export const FHSA_CARRY_MAX = figure<{ carry_forward_max: number }>(
  "fhsa-hbp-2026.json",
  "fhsa.carry_forward",
).carry_forward_max;
/** FHSA accounts first opened April 1, 2023; no room exists for earlier years. */
export const FHSA_FIRST_YEAR = 2023;

export const HBP_LIMIT = figure<number>("fhsa-hbp-2026.json", "hbp.limit.2026");
export const HBP_REPAY_YEARS = figure<{ years: number }>("fhsa-hbp-2026.json", "hbp.repayment_period").years;
/** Standard rule: repayments start the 2nd calendar year after withdrawal.
 * The legislated 5-year grace applied only to 2022-2025 withdrawals (Budget 2024);
 * this planner models future (2026+) withdrawals, so the standard rule always applies. */
export const HBP_STANDARD_OFFSET = figure<{ standard_first_repayment_year_offset: number }>(
  "closing-costs-2026.json",
  "hbp.repayment_start_offset",
).standard_first_repayment_year_offset;
/** hbp.rules: 90-day RRSP holding rule. */
export const HBP_HOLDING_DAYS = 90;

export const HOME_BUYERS_AMOUNT_VALUE = figure<number>("fthb-incentives-2026.json", "hbtc.amount_2026");
export const FHSA_REFUND_RANGE = figure<{ min: number; max: number; min_rate: number; max_rate: number }>(
  "closing-costs-2026.json",
  "fhsa.refund_range_on",
);

export const TFSA_ANNUAL = figure<number>("tfsa-2026.json", "tfsa.annual_limit.2026");

/** mortgage.insured_cap: insured mortgages only up to this price; above it, 20% of the whole price. */
export const INSURED_CAP = figure<number>("fthb-incentives-2026.json", "mortgage.insured_cap");
// down_payment.tiers.2026 (text table): 5% of the first $500,000, 10% above, 20% above the cap.
figure("mortgage-2026.json", "down_payment.tiers.2026");
const DP_TIER1_UPTO = 500_000;
const DP_TIER1_RATE = 0.05;
const DP_TIER2_RATE = 0.1;
export const CONVENTIONAL_DOWN = 0.2;

const CMHC = figure<{
  ltv_80_or_less: number;
  ltv_80_01_to_85: number;
  ltv_85_01_to_90: number;
  ltv_90_01_to_95: number;
  pst_on_premium: Record<string, number>;
  thirty_yr_surcharge: number;
}>("mortgage-2026.json", "cmhc.premiums.2026");

// osfi.mqr.2026 (text): qualify at max(contract rate + 2 points, 5.25%).
figure("mortgage-2026.json", "osfi.mqr.2026");
export const MQR_BUFFER = 0.02;
export const MQR_FLOOR = 0.0525;

interface Tier {
  up_to: number | null;
  rate: number;
}

const ON_LTT = figure<{ first_time_rebate_max: number; tiers: Tier[] }>("mortgage-2026.json", "on.ltt.2026");
export const ON_LTT_REBATE = figure<number>("ltt-2026.json", "ltt_on.fthb_rebate_max");

// ltt_toronto.mltt_brackets_to_3m + ltt_toronto.luxury_tiers (text, ltt-2026.json,
// researched 2026-09-29). Addendum item 8: do NOT use toronto.mltt.2026 from
// mortgage-2026.json (older, conflicting tiers). NOT yet verified on toronto.ca.
figure("ltt-2026.json", "ltt_toronto.mltt_brackets_to_3m");
figure("ltt-2026.json", "ltt_toronto.luxury_tiers");
const TORONTO_MLTT: Tier[] = [
  { up_to: 55_000, rate: 0.005 },
  { up_to: 250_000, rate: 0.01 },
  { up_to: 400_000, rate: 0.015 },
  { up_to: 2_000_000, rate: 0.02 },
  { up_to: 3_000_000, rate: 0.025 },
  { up_to: 4_000_000, rate: 0.044 },
  { up_to: 5_000_000, rate: 0.0545 },
  { up_to: 10_000_000, rate: 0.065 },
  { up_to: 20_000_000, rate: 0.0755 },
  { up_to: null, rate: 0.086 },
];
export const TORONTO_REBATE = figure<number>("ltt-2026.json", "ltt_toronto.fthb_rebate_max");

// ptt_bc.general_brackets (text): 1% / 2% / 3%, plus 2% on the residential portion over $3M.
figure("ltt-2026.json", "ptt_bc.general_brackets");
const BC_PTT: Tier[] = [
  { up_to: 200_000, rate: 0.01 },
  { up_to: 2_000_000, rate: 0.02 },
  { up_to: null, rate: 0.03 },
];
const BC_SURCHARGE_ABOVE = 3_000_000;
const BC_SURCHARGE_RATE = 0.02;
const BC_FTHB = figure<{ exemption_applies_to_first: number; full_exemption_to: number; partial_to: number }>(
  "fthb-incentives-2026.json",
  "bc_fthb.thresholds",
);
export const BC_FTHB_CAP = figure<number>("ltt-2026.json", "ptt_bc.fthb_exemption_cap");

export const DEFAULT_FEES = figure<number>("closing-costs-2026.json", "closing.legal_and_other_fees");
export const DEFAULT_BUFFER = figure<number>("closing-costs-2026.json", "closing.cash_buffer");
export const DEFAULT_SAVINGS_RATE = figure<number>("closing-costs-2026.json", "savings.default_rate");
export const EQ_RATES = figure<{ base_personal_account: number; promo_with_2000_monthly_pay: number }>(
  "bank-promos.json",
  "eq.account_rates.2026_09",
);
export const DEFAULT_CONTRACT_RATE = figure<number>("closing-costs-2026.json", "mortgage.illustrative_contract_rate");
export const SNAPSHOT_RATE = figure<number>("closing-costs-2026.json", "mortgage.rate_snapshot_best_5yr_fixed");
export const CLOSING_RULE_OF_THUMB = figure<number>("mortgage-2026.json", "closing_costs.range");

const RENT_VS_BUY = figure<{ maintenance_annual: number }>("rent-housing-2026.json", "rent_vs_buy.assumptions");
export const MAINTENANCE_ANNUAL = RENT_VS_BUY.maintenance_annual;
export const DEFAULT_INSURANCE_MONTHLY = figure<number>("closing-costs-2026.json", "budget.home_insurance_monthly");
export const PROPERTY_TAX_PRESETS = {
  toronto: figure<number>("rent-housing-2026.json", "property_tax.toronto.2026"),
  calgary: figure<number>("rent-housing-2026.json", "property_tax.calgary.2026"),
  edmonton: figure<number>("rent-housing-2026.json", "property_tax.edmonton.2026"),
};

/* ------------------------------------------------------------------ */
/* Down payment, insurance, transfer tax                               */
/* ------------------------------------------------------------------ */

export function minimumDownPayment(price: number): number {
  if (price <= 0) return 0;
  if (price > INSURED_CAP) return price * CONVENTIONAL_DOWN;
  if (price <= DP_TIER1_UPTO) return price * DP_TIER1_RATE;
  return DP_TIER1_UPTO * DP_TIER1_RATE + (price - DP_TIER1_UPTO) * DP_TIER2_RATE;
}

/** CMHC premium rate on the loan; 0 when 20%+ down or the price is above the insured cap. */
export function cmhcPremiumRate(price: number, downPayment: number, thirtyYear = false): number {
  if (price <= 0 || price > INSURED_CAP) return 0;
  // Epsilon keeps an exact 20% down from reading as 80.0000001% LTV.
  const ltv = (price - downPayment) / price - 1e-9;
  let rate: number;
  if (ltv <= 0.8) return CMHC.ltv_80_or_less;
  else if (ltv <= 0.85) rate = CMHC.ltv_80_01_to_85;
  else if (ltv <= 0.9) rate = CMHC.ltv_85_01_to_90;
  else rate = CMHC.ltv_90_01_to_95;
  return rate + (thirtyYear ? CMHC.thirty_yr_surcharge : 0);
}

export type Province = "ON" | "BC" | "AB" | "MB" | "SK" | "QC" | "other";

export function pstOnPremiumRate(province: Province): number {
  return CMHC.pst_on_premium[province] ?? 0;
}

export function tieredTax(price: number, tiers: Tier[]): number {
  let tax = 0;
  let lower = 0;
  for (const t of tiers) {
    const upper = t.up_to ?? Infinity;
    if (price > lower) tax += (Math.min(price, upper) - lower) * t.rate;
    lower = upper;
  }
  return tax;
}

export function ontarioLtt(price: number): number {
  return tieredTax(price, ON_LTT.tiers);
}

export function torontoMltt(price: number): number {
  return tieredTax(price, TORONTO_MLTT);
}

export function bcPtt(price: number): number {
  return tieredTax(price, BC_PTT) + Math.max(0, price - BC_SURCHARGE_ABOVE) * BC_SURCHARGE_RATE;
}

/** BC first-time buyer exemption: full to $835k, proportional to $860k, zero at or above. */
export function bcFthbExemption(price: number): number {
  const full = Math.min(bcPtt(price), BC_FTHB_CAP);
  if (price <= BC_FTHB.full_exemption_to) return full;
  if (price >= BC_FTHB.partial_to) return 0;
  return (BC_FTHB_CAP * (BC_FTHB.partial_to - price)) / (BC_FTHB.partial_to - BC_FTHB.full_exemption_to);
}

export interface TransferTax {
  provincial: number;
  municipal: number;
  rebate: number;
  net: number;
  /** Toronto MLTT math is not yet verified against toronto.ca. */
  torontoUnverified: boolean;
  /** Province without built-in transfer tax math: the user-entered amount is used. */
  manual: boolean;
}

export function transferTax(opts: {
  price: number;
  province: Province;
  toronto?: boolean;
  firstTimeBuyer: boolean;
  manualAmount?: number;
}): TransferTax {
  const { price, province, firstTimeBuyer } = opts;
  if (province === "ON") {
    const provincial = ontarioLtt(price);
    const municipal = opts.toronto ? torontoMltt(price) : 0;
    const rebate = firstTimeBuyer
      ? Math.min(provincial, ON_LTT_REBATE) + (opts.toronto ? Math.min(municipal, TORONTO_REBATE) : 0)
      : 0;
    return {
      provincial,
      municipal,
      rebate,
      net: provincial + municipal - rebate,
      torontoUnverified: Boolean(opts.toronto),
      manual: false,
    };
  }
  if (province === "BC") {
    const provincial = bcPtt(price);
    const rebate = firstTimeBuyer ? bcFthbExemption(price) : 0;
    return { provincial, municipal: 0, rebate, net: provincial - rebate, torontoUnverified: false, manual: false };
  }
  const manual = Math.max(0, opts.manualAmount ?? 0);
  return { provincial: manual, municipal: 0, rebate: 0, net: manual, torontoUnverified: false, manual: true };
}

/* ------------------------------------------------------------------ */
/* Cash stack                                                          */
/* ------------------------------------------------------------------ */

export type DownChoice = "minimum" | "twenty";

export interface CashStackInput {
  price: number;
  downChoice: DownChoice;
  province: Province;
  toronto?: boolean;
  firstTimeBuyer: boolean;
  manualTransferTax?: number;
  fees: number;
  buffer: number;
  thirtyYear?: boolean;
}

export interface CashStack {
  downPayment: number;
  downPct: number;
  insured: boolean;
  premiumRate: number;
  premium: number;
  pstOnPremium: number;
  transferTax: TransferTax;
  fees: number;
  buffer: number;
  closingTotal: number;
  cashTarget: number;
  mortgagePrincipal: number;
  aboveInsuredCap: boolean;
}

export function cashStack(i: CashStackInput): CashStack {
  const minDown = minimumDownPayment(i.price);
  const downPayment = i.downChoice === "twenty" ? Math.max(minDown, i.price * CONVENTIONAL_DOWN) : minDown;
  const premiumRate = cmhcPremiumRate(i.price, downPayment, i.thirtyYear);
  const loan = i.price - downPayment;
  const premium = loan * premiumRate;
  // PST on the premium is due in cash at closing; the premium itself is added to the mortgage.
  const pstOnPremium = premium * pstOnPremiumRate(i.province);
  const tt = transferTax({
    price: i.price,
    province: i.province,
    toronto: i.toronto,
    firstTimeBuyer: i.firstTimeBuyer,
    manualAmount: i.manualTransferTax,
  });
  const closingTotal = tt.net + pstOnPremium + i.fees + i.buffer;
  return {
    downPayment,
    downPct: i.price > 0 ? downPayment / i.price : 0,
    insured: premiumRate > 0,
    premiumRate,
    premium,
    pstOnPremium,
    transferTax: tt,
    fees: i.fees,
    buffer: i.buffer,
    closingTotal,
    cashTarget: downPayment + closingTotal,
    mortgagePrincipal: loan + premium,
    aboveInsuredCap: i.price > INSURED_CAP,
  };
}

/* ------------------------------------------------------------------ */
/* Savings math                                                        */
/* ------------------------------------------------------------------ */

/** Monthly rate from a nominal annual savings rate compounded monthly. */
export function monthlyRate(annual: number): number {
  return annual / 12;
}

/** Balance after n months: existing savings S grow, deposit d lands at each month end. */
export function futureValue(S: number, d: number, months: number, annual: number): number {
  const r = monthlyRate(annual);
  if (r === 0) return S + d * months;
  const g = Math.pow(1 + r, months);
  return S * g + (d * (g - 1)) / r;
}

/**
 * Months until savings reach target T (fractional).
 * n = ln((T + d/r) / (S + d/r)) / ln(1 + r). Includes interest on existing
 * savings S (addendum item 3; the spec's section 2.2 version omitted it).
 */
export function monthsToTarget(T: number, S: number, d: number, annual: number): number {
  if (S >= T) return 0;
  const r = monthlyRate(annual);
  if (r === 0) return d > 0 ? (T - S) / d : Infinity;
  const k = d / r;
  if (S + k <= 0) return Infinity;
  return Math.log((T + k) / (S + k)) / Math.log(1 + r);
}

/** Monthly deposit needed to reach T in n months (target-date mode). */
export function requiredMonthly(T: number, S: number, months: number, annual: number): number {
  if (months <= 0) return T > S ? Infinity : 0;
  const r = monthlyRate(annual);
  if (r === 0) return Math.max(0, (T - S) / months);
  const g = Math.pow(1 + r, months);
  return Math.max(0, ((T - S * g) * r) / (g - 1));
}

/* ------------------------------------------------------------------ */
/* Mortgage payment and stress test                                    */
/* ------------------------------------------------------------------ */

/** Canadian convention: nominal rate compounded semi-annually (mortgage.compounding_rule). */
export function mortgagePayment(principal: number, annualRate: number, years: number): number {
  const n = years * 12;
  if (principal <= 0) return 0;
  const m = Math.pow(1 + annualRate / 2, 2 / 12) - 1;
  if (m === 0) return principal / n;
  return (principal * m) / (1 - Math.pow(1 + m, -n));
}

export function qualifyingRate(contract: number): number {
  return Math.max(contract + MQR_BUFFER, MQR_FLOOR);
}

/* ------------------------------------------------------------------ */
/* FHSA room and HBP                                                   */
/* ------------------------------------------------------------------ */

/**
 * FHSA participation room available in `year`. Room exists only from the year
 * the account is opened (no back-dating); each year adds $8,000; unused room
 * carries forward up to $8,000; lifetime cap $40,000. Past contributions are
 * given per year; missing years count as zero.
 */
export function fhsaRoom(opts: {
  openYear: number | null;
  year: number;
  contributionsByYear?: Record<number, number>;
}): number {
  const { openYear, year } = opts;
  if (openYear === null || year < openYear) return 0;
  const start = Math.max(openYear, FHSA_FIRST_YEAR);
  const c = opts.contributionsByYear ?? {};
  let carry = 0;
  let lifetimeUsed = 0;
  for (let y = start; y < year; y++) {
    const room = FHSA_ANNUAL + carry;
    const used = c[y] ?? 0;
    lifetimeUsed += used;
    carry = Math.min(Math.max(room - used, 0), FHSA_CARRY_MAX);
  }
  const usedThisYear = c[year] ?? 0;
  const annualRoom = FHSA_ANNUAL + carry - usedThisYear;
  return Math.max(0, Math.min(annualRoom, FHSA_LIFETIME - lifetimeUsed - usedThisYear));
}

/**
 * Spread a lifetime contribution total over past years, earliest first, as
 * the planner's stated assumption when only a total is known.
 */
export function assumedContributionHistory(openYear: number, currentYear: number, total: number) {
  const out: Record<number, number> = {};
  let left = Math.max(0, total);
  for (let y = Math.max(openYear, FHSA_FIRST_YEAR); y <= currentYear && left > 0; y++) {
    const room = fhsaRoom({ openYear, year: y, contributionsByYear: out });
    const put = Math.min(room, left);
    out[y] = put;
    left -= put;
  }
  return out;
}

/** HBP withdrawal allowed: RRSP money held 90+ days, capped at $60,000 per person. */
export function hbpWithdrawable(opts: { rrspBalance: number; recentContributions: number; people: 1 | 2 }): number {
  const eligible = Math.max(0, opts.rrspBalance - Math.max(0, opts.recentContributions));
  return Math.min(eligible, HBP_LIMIT * opts.people);
}

export interface RepaymentYear {
  year: number;
  amount: number;
}

export function hbpRepaymentSchedule(withdrawn: number, withdrawalYear: number, offset: number): RepaymentYear[] {
  if (withdrawn <= 0) return [];
  const amount = withdrawn / HBP_REPAY_YEARS;
  return Array.from({ length: HBP_REPAY_YEARS }, (_, i) => ({ year: withdrawalYear + offset + i, amount }));
}

/* ------------------------------------------------------------------ */
/* Month-by-month simulation and source breakdown                      */
/* ------------------------------------------------------------------ */

export interface Balances {
  fhsa: number;
  rrsp: number;
  tfsa: number;
  taxable: number;
}

export interface SimulationInput {
  start: Balances;
  monthly: number;
  annualRate: number;
  months: number;
  startYear: number;
  /** 0-11, the calendar month of the first deposit. */
  startMonth: number;
  people: 1 | 2;
  /** null = no FHSA yet; the planner assumes it opens in startYear if `openFhsaNow`. */
  fhsaOpenYear: number | null;
  fhsaContributedTotal: number;
  tfsaRoomNow: number;
}

export interface SimulationResult {
  end: Balances;
  contributed: Balances;
}

/**
 * Deposits go to the FHSA while it has room, then to the TFSA while it has
 * room, then to a taxable account. RRSP money is not added to; it only grows
 * (the HBP draws on RRSP savings already held). All buckets earn the same
 * rate, and deposits land at month end, so the total matches futureValue().
 */
export function simulate(i: SimulationInput): SimulationResult {
  const r = monthlyRate(i.annualRate);
  const b = { ...i.start };
  const contributed: Balances = { fhsa: 0, rrsp: 0, tfsa: 0, taxable: 0 };
  const history =
    i.fhsaOpenYear === null
      ? {}
      : assumedContributionHistory(i.fhsaOpenYear, i.startYear, i.fhsaContributedTotal / i.people);
  let year = i.startYear;
  let month = i.startMonth;
  let fhsaRoomLeft = i.fhsaOpenYear === null ? 0 : fhsaRoom({ openYear: i.fhsaOpenYear, year, contributionsByYear: history }) * i.people;
  let tfsaRoomLeft = Math.max(0, i.tfsaRoomNow);
  const fhsaThisYear: Record<number, number> = { ...history };

  for (let m = 0; m < i.months; m++) {
    b.fhsa *= 1 + r;
    b.rrsp *= 1 + r;
    b.tfsa *= 1 + r;
    b.taxable *= 1 + r;
    let left = i.monthly;
    const toFhsa = Math.min(left, fhsaRoomLeft);
    b.fhsa += toFhsa;
    contributed.fhsa += toFhsa;
    fhsaRoomLeft -= toFhsa;
    fhsaThisYear[year] = (fhsaThisYear[year] ?? 0) + toFhsa / i.people;
    left -= toFhsa;
    const toTfsa = Math.min(left, tfsaRoomLeft);
    b.tfsa += toTfsa;
    contributed.tfsa += toTfsa;
    tfsaRoomLeft -= toTfsa;
    left -= toTfsa;
    b.taxable += left;
    contributed.taxable += left;

    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
      fhsaRoomLeft =
        i.fhsaOpenYear === null ? 0 : fhsaRoom({ openYear: i.fhsaOpenYear, year, contributionsByYear: fhsaThisYear }) * i.people;
      // Assumes the TFSA limit stays at the 2026 amount (future indexation unknown).
      tfsaRoomLeft += TFSA_ANNUAL * i.people;
    }
  }
  return { end: b, contributed };
}

export interface SourceLine {
  source: "fhsa" | "hbp" | "tfsa" | "taxable" | "gift";
  amount: number;
}

/**
 * Cover the cash target in the planner's sequencing order:
 * FHSA first, then HBP, then TFSA, then taxable, then gifts.
 */
export function sourceBreakdown(opts: {
  cashTarget: number;
  balances: Balances;
  hbpAvailable: number;
  gift: number;
}): { lines: SourceLine[]; shortfall: number; leftOver: number } {
  let need = opts.cashTarget;
  const lines: SourceLine[] = [];
  const order: [SourceLine["source"], number][] = [
    ["fhsa", opts.balances.fhsa],
    ["hbp", opts.hbpAvailable],
    ["tfsa", opts.balances.tfsa],
    ["taxable", opts.balances.taxable],
    ["gift", opts.gift],
  ];
  let available = 0;
  for (const [source, have] of order) {
    const take = Math.max(0, Math.min(need, have));
    available += Math.max(0, have);
    lines.push({ source, amount: take });
    need -= take;
  }
  return { lines, shortfall: Math.max(0, need), leftOver: Math.max(0, available - opts.cashTarget) };
}

/* ------------------------------------------------------------------ */
/* Full plan                                                           */
/* ------------------------------------------------------------------ */

export type Mode = "timeline" | "target";

export interface PlannerInput {
  mode: Mode;
  price: number;
  downChoice: DownChoice;
  province: Province;
  toronto: boolean;
  firstTimeBuyer: boolean;
  manualTransferTax: number;
  fees: number;
  buffer: number;
  couple: boolean;
  fhsaBalance: number;
  /** null when no FHSA is open yet; the planner then assumes one opens this year. */
  fhsaOpenYear: number | null;
  fhsaContributedTotal: number;
  rrspBalance: number;
  rrspRecent: number;
  useHbp: boolean;
  tfsaBalance: number;
  tfsaRoom: number;
  taxableBalance: number;
  gift: number;
  monthly: number;
  targetMonths: number;
  savingsRate: number;
  contractRate: number;
  amortYears: 25 | 30;
  rent: number;
  propertyTaxRate: number;
  insuranceMonthly: number;
  condoFees: number;
  startYear: number;
  startMonth: number;
}

export interface Scenario {
  stack: CashStack;
  /** Money from the user's own savings (cash target minus the gift). */
  ownTarget: number;
  savingsNow: number;
  months: number;
  monthsWhole: number;
  monthly: number;
  purchaseYear: number;
  purchaseMonth: number;
  sources: ReturnType<typeof sourceBreakdown>;
  hbpUsed: number;
  payment: number;
  qualifyingPayment: number;
  snapshotPayment: number;
  snapshotQualifyingPayment: number;
  interestOverAmortization: number;
}

export function hbpAvailableNow(i: PlannerInput): number {
  if (!i.useHbp) return 0;
  return hbpWithdrawable({ rrspBalance: i.rrspBalance, recentContributions: i.rrspRecent, people: i.couple ? 2 : 1 });
}

export function scenario(i: PlannerInput, downChoice: DownChoice): Scenario {
  const people = i.couple ? 2 : 1;
  const stack = cashStack({
    price: i.price,
    downChoice,
    province: i.province,
    toronto: i.toronto,
    firstTimeBuyer: i.firstTimeBuyer,
    manualTransferTax: i.manualTransferTax,
    fees: i.fees,
    buffer: i.buffer,
    thirtyYear: i.amortYears === 30,
  });
  const hbpNow = hbpAvailableNow(i);
  // Only the HBP-eligible part of the RRSP counts toward the down payment.
  const savingsNow = i.fhsaBalance + hbpNow + i.tfsaBalance + i.taxableBalance;
  const ownTarget = Math.max(0, stack.cashTarget - i.gift);

  let months: number;
  let monthly: number;
  if (i.mode === "timeline") {
    monthly = i.monthly;
    months = monthsToTarget(ownTarget, savingsNow, monthly, i.savingsRate);
  } else {
    months = i.targetMonths;
    monthly = requiredMonthly(ownTarget, savingsNow, months, i.savingsRate);
  }
  const monthsWhole = Number.isFinite(months) ? Math.ceil(months - 1e-9) : Infinity;

  const simMonths = Number.isFinite(monthsWhole) ? monthsWhole : 0;
  const sim = simulate({
    start: { fhsa: i.fhsaBalance, rrsp: hbpNow, tfsa: i.tfsaBalance, taxable: i.taxableBalance },
    monthly: Number.isFinite(monthly) ? monthly : 0,
    annualRate: i.savingsRate,
    months: simMonths,
    startYear: i.startYear,
    startMonth: i.startMonth,
    people,
    fhsaOpenYear: i.fhsaOpenYear ?? i.startYear,
    fhsaContributedTotal: i.fhsaOpenYear === null ? 0 : i.fhsaContributedTotal,
    tfsaRoomNow: i.tfsaRoom,
  });
  const hbpCap = i.useHbp ? HBP_LIMIT * people : 0;
  const hbpAvail = Math.min(sim.end.rrsp, hbpCap);
  const sources = sourceBreakdown({
    cashTarget: stack.cashTarget,
    balances: sim.end,
    hbpAvailable: hbpAvail,
    gift: i.gift,
  });
  const hbpUsed = sources.lines.find((l) => l.source === "hbp")?.amount ?? 0;

  const totalMonths = i.startMonth + simMonths;
  const purchaseYear = i.startYear + Math.floor(totalMonths / 12);
  const purchaseMonth = totalMonths % 12;

  const payment = mortgagePayment(stack.mortgagePrincipal, i.contractRate, i.amortYears);
  return {
    stack,
    ownTarget,
    savingsNow,
    months,
    monthsWhole,
    monthly,
    purchaseYear,
    purchaseMonth,
    sources,
    hbpUsed,
    payment,
    qualifyingPayment: mortgagePayment(stack.mortgagePrincipal, qualifyingRate(i.contractRate), i.amortYears),
    snapshotPayment: mortgagePayment(stack.mortgagePrincipal, SNAPSHOT_RATE, i.amortYears),
    snapshotQualifyingPayment: mortgagePayment(stack.mortgagePrincipal, qualifyingRate(SNAPSHOT_RATE), i.amortYears),
    interestOverAmortization: payment * i.amortYears * 12 - stack.mortgagePrincipal,
  };
}

export interface BudgetShock {
  mortgage: number;
  propertyTax: number;
  maintenance: number;
  insurance: number;
  condoFees: number;
  hbpRepaymentMonthly: number;
  total: number;
  totalWithHbp: number;
  vsRent: number;
  standardSchedule: RepaymentYear[];
}

export function budgetShock(i: PlannerInput, s: Scenario): BudgetShock {
  const propertyTax = (i.price * i.propertyTaxRate) / 12;
  const maintenance = (i.price * MAINTENANCE_ANNUAL) / 12;
  const hbpRepaymentMonthly = s.hbpUsed / HBP_REPAY_YEARS / 12;
  const total = s.payment + propertyTax + maintenance + i.insuranceMonthly + i.condoFees;
  return {
    mortgage: s.payment,
    propertyTax,
    maintenance,
    insurance: i.insuranceMonthly,
    condoFees: i.condoFees,
    hbpRepaymentMonthly,
    total,
    totalWithHbp: total + hbpRepaymentMonthly,
    vsRent: total - i.rent,
    standardSchedule: hbpRepaymentSchedule(s.hbpUsed, s.purchaseYear, HBP_STANDARD_OFFSET),
  };
}

export interface Plan {
  input: PlannerInput;
  chosen: Scenario;
  minimum: Scenario;
  twenty: Scenario;
  budget: BudgetShock;
}

export function plan(i: PlannerInput): Plan {
  const minimum = scenario(i, "minimum");
  const twenty = scenario(i, "twenty");
  const chosen = i.downChoice === "twenty" ? twenty : minimum;
  return { input: i, chosen, minimum, twenty, budget: budgetShock(i, chosen) };
}

/** Planner defaults: the spec's Example A inputs with registry-sourced assumptions. */
export function defaultInput(now = new Date()): PlannerInput {
  return {
    mode: "timeline",
    price: 600_000,
    downChoice: "minimum",
    province: "ON",
    toronto: false,
    firstTimeBuyer: true,
    manualTransferTax: 0,
    fees: DEFAULT_FEES,
    buffer: DEFAULT_BUFFER,
    couple: false,
    fhsaBalance: 0,
    fhsaOpenYear: null,
    fhsaContributedTotal: 0,
    rrspBalance: 0,
    rrspRecent: 0,
    useHbp: true,
    tfsaBalance: 10_000,
    tfsaRoom: TFSA_ANNUAL,
    taxableBalance: 0,
    gift: 0,
    monthly: 1_500,
    targetMonths: 36,
    savingsRate: DEFAULT_SAVINGS_RATE,
    contractRate: DEFAULT_CONTRACT_RATE,
    amortYears: 25,
    rent: 0,
    propertyTaxRate: PROPERTY_TAX_PRESETS.toronto,
    insuranceMonthly: DEFAULT_INSURANCE_MONTHLY,
    condoFees: 0,
    startYear: now.getFullYear(),
    startMonth: now.getMonth(),
  };
}
