/**
 * house-affordability.ts: pure math for the house affordability calculator
 * (/calculators/house-affordability). No DOM access; the page component, the
 * results renderer and the tests all call these functions.
 *
 * The maximum price is the tightest of three limits (spec section 2):
 *   GDS  monthly housing <= 39% of gross monthly income
 *   TDS  monthly housing + other debt <= 44% of gross monthly income
 *   Down the down payment you can make is at least the tiered minimum
 * where monthly housing = mortgage payment at the QUALIFYING rate
 * (max(contract + 2 points, 5.25%)) on the loan plus the capitalized CMHC
 * premium, plus property tax / 12, heating, and half of any condo fees.
 * Cash covers closing costs first (land transfer tax after first-time
 * rebates, PST on the premium, legal); the rest is the down payment.
 *
 * Payment math, down payment tiers, CMHC premiums and transfer tax are the
 * down payment planner's (same figure registry keys), so the two tools agree.
 */

import { figure, type FigureLog } from "./figures";
import {
  INSURED_CAP,
  MQR_FLOOR,
  cmhcPremiumRate,
  minimumDownPayment,
  mortgagePayment,
  pstOnPremiumRate,
  qualifyingRate,
  transferTax,
  type Province,
} from "./down-payment-planner";

/** Registry keys this calculator reads directly, in first-use order. */
export const affordFigures: FigureLog = new Map();
const fig = <T>(file: string, key: string) => figure<T>(file, key, affordFigures);

export const GDS = fig<number>("mortgage-2026.json", "housing.gds");
export const TDS = fig<number>("mortgage-2026.json", "housing.tds");
// Rules this tool applies through the down payment planner's helpers:
fig("mortgage-2026.json", "osfi.mqr.2026");
fig("mortgage-2026.json", "down_payment.tiers.2026");
fig("mortgage-2026.json", "cmhc.premiums.2026");
fig("mortgage-2026.json", "amortization.rules.2026");
fig("mortgage-2026.json", "mortgage.compounding_rule");
fig("fthb-incentives-2026.json", "mortgage.insured_cap");
fig("mortgage-2026.json", "on.ltt.2026");
fig("ltt-2026.json", "ltt_on.fthb_rebate_max");
fig("ltt-2026.json", "ltt_toronto.mltt_brackets_to_3m");
fig("ltt-2026.json", "ltt_toronto.fthb_rebate_max");
fig("ltt-2026.json", "ptt_bc.general_brackets");
fig("fthb-incentives-2026.json", "bc_fthb.thresholds");
export const DEFAULT_CONTRACT_RATE = fig<number>("closing-costs-2026.json", "mortgage.illustrative_contract_rate");

/** Spec section 1 defaults. */
export const DEFAULT_TAX_RATE = 0.01;
export const DEFAULT_HEATING = 100;
/** Spec 2.8: lawyer and other fees, about $2,000 (editable). */
export const DEFAULT_LEGAL = 2_000;
/** Spec 2.4 lender conventions for balances without a known payment. */
export const UNSECURED_RATE = 0.03;
export const SECURED_RATE = 0.0065;
export const CONDO_SHARE = 0.5;
export const PRICE_SEARCH_MAX = 20_000_000;
/** Spec 4 #9: many lenders use tighter internal ratios (context copy only). */
export const LENDER_INTERNAL = { gds: 0.32, tds: 0.4 };

export interface AffordInput {
  income: number | null;
  contractRate: number | null;
  /** Monthly payments on car loans, student loans, etc. */
  debtPayments: number | null;
  /** Balance-only revolving debt: counted at 3% (unsecured) and 0.65% (secured). */
  unsecuredBalance: number | null;
  securedBalance: number | null;
  /** Property tax as a share of price a year. */
  taxRate: number | null;
  heating: number | null;
  condoFees: number | null;
  /** Cash available for the down payment and closing costs together. */
  cash: number | null;
  firstTimeBuyer: boolean;
  newBuild: boolean;
  /** 30-year amortization when eligible; otherwise 25. */
  wantThirty: boolean;
  province: Province;
  toronto: boolean;
  legal: number | null;
}

/** Spec section 3 worked example household. */
export const DEFAULT_INPUT: Readonly<AffordInput> = {
  income: 140_000,
  contractRate: DEFAULT_CONTRACT_RATE,
  debtPayments: 0,
  unsecuredBalance: 0,
  securedBalance: 0,
  taxRate: DEFAULT_TAX_RATE,
  heating: DEFAULT_HEATING,
  condoFees: 0,
  cash: 50_000,
  firstTimeBuyer: true,
  newBuild: false,
  wantThirty: false,
  province: "ON",
  toronto: false,
  legal: DEFAULT_LEGAL,
};

export interface Resolved {
  income: number;
  contractRate: number;
  debt: number;
  taxRate: number;
  heating: number;
  condoFees: number;
  cash: number;
  firstTimeBuyer: boolean;
  newBuild: boolean;
  thirtyEligible: boolean;
  amortYears: 25 | 30;
  province: Province;
  toronto: boolean;
  legal: number;
}

const z = (v: number | null) => (v === null || !Number.isFinite(v) ? 0 : Math.max(0, v));

/** Monthly debt for TDS: payments plus the lender conventions on balances. */
export function monthlyDebt(i: Pick<AffordInput, "debtPayments" | "unsecuredBalance" | "securedBalance">): number {
  return z(i.debtPayments) + z(i.unsecuredBalance) * UNSECURED_RATE + z(i.securedBalance) * SECURED_RATE;
}

export function resolve(i: AffordInput): Resolved {
  const thirtyEligible = i.firstTimeBuyer || i.newBuild;
  return {
    income: z(i.income),
    contractRate: i.contractRate ?? DEFAULT_CONTRACT_RATE,
    debt: monthlyDebt(i),
    taxRate: i.taxRate ?? DEFAULT_TAX_RATE,
    heating: i.heating ?? DEFAULT_HEATING,
    condoFees: z(i.condoFees),
    cash: z(i.cash),
    firstTimeBuyer: i.firstTimeBuyer,
    newBuild: i.newBuild,
    thirtyEligible,
    amortYears: thirtyEligible && i.wantThirty ? 30 : 25,
    province: i.province,
    toronto: i.province === "ON" && i.toronto,
    legal: i.legal ?? DEFAULT_LEGAL,
  };
}

/* ------------------------------------------------------------------ */
/* One price, fully costed                                             */
/* ------------------------------------------------------------------ */

export interface PriceScenario {
  price: number;
  minDown: number;
  closingBeforePst: number;
  transferTaxNet: number;
  transferTaxRebate: number;
  torontoUnverified: boolean;
  transferTaxManual: boolean;
  /** Cash left for the down payment after closing costs. */
  down: number;
  downPct: number;
  insured: boolean;
  premiumRate: number;
  premium: number;
  pstOnPremium: number;
  closing: number;
  loan: number;
  /** Loan plus capitalized premium. */
  mortgage: number;
  qualifyingRate: number;
  qualifyingPayment: number;
  actualPayment: number;
  propertyTaxMonthly: number;
  heating: number;
  condoCounted: number;
  /** Monthly housing at the qualifying rate (the GDS numerator). */
  housing: number;
  gdsRatio: number;
  tdsRatio: number;
  downOk: boolean;
}

/**
 * Cost one price: closing costs come out of the cash first, the rest is the
 * down payment (never more than the price). The PST on the CMHC premium
 * depends on the down payment, so it is settled with a short fixed-point
 * loop (it converges in two or three passes).
 */
export function scenario(r: Resolved, price: number): PriceScenario {
  const tt = transferTax({ price, province: r.province, toronto: r.toronto, firstTimeBuyer: r.firstTimeBuyer });
  const closingBeforePst = tt.net + r.legal;
  const thirty = r.amortYears === 30;
  let pst = 0;
  let down = 0;
  let premiumRate = 0;
  for (let k = 0; k < 6; k++) {
    down = Math.min(price, Math.max(0, r.cash - closingBeforePst - pst));
    premiumRate = cmhcPremiumRate(price, down, thirty);
    const nextPst = (price - down) * premiumRate * pstOnPremiumRate(r.province);
    if (Math.abs(nextPst - pst) < 0.01) { pst = nextPst; break; }
    pst = nextPst;
  }
  down = Math.min(price, Math.max(0, r.cash - closingBeforePst - pst));
  const loan = price - down;
  const premium = loan * premiumRate;
  const mortgage = loan + premium;
  const qRate = qualifyingRate(r.contractRate);
  const qualifyingPayment = mortgagePayment(mortgage, qRate, r.amortYears);
  const actualPayment = mortgagePayment(mortgage, r.contractRate, r.amortYears);
  const propertyTaxMonthly = (price * r.taxRate) / 12;
  const condoCounted = r.condoFees * CONDO_SHARE;
  const housing = qualifyingPayment + propertyTaxMonthly + r.heating + condoCounted;
  const monthlyIncome = r.income / 12;
  const minDown = minimumDownPayment(price);
  return {
    price,
    minDown,
    closingBeforePst,
    transferTaxNet: tt.net,
    transferTaxRebate: tt.rebate,
    torontoUnverified: tt.torontoUnverified,
    transferTaxManual: tt.manual,
    down,
    downPct: price > 0 ? down / price : 0,
    insured: premiumRate > 0,
    premiumRate,
    premium,
    pstOnPremium: pst,
    closing: closingBeforePst + pst,
    loan,
    mortgage,
    qualifyingRate: qRate,
    qualifyingPayment,
    actualPayment,
    propertyTaxMonthly,
    heating: r.heating,
    condoCounted,
    housing,
    gdsRatio: monthlyIncome > 0 ? housing / monthlyIncome : Infinity,
    tdsRatio: monthlyIncome > 0 ? (housing + r.debt) / monthlyIncome : Infinity,
    downOk: down + 0.005 >= minDown,
  };
}

/* ------------------------------------------------------------------ */
/* The three limits                                                    */
/* ------------------------------------------------------------------ */

/** Largest price in [0, PRICE_SEARCH_MAX] where `ok` holds (ok is monotone: true then false). */
function maxPrice(ok: (price: number) => boolean): number {
  if (!ok(1)) return 0;
  let lo = 1;
  let hi = PRICE_SEARCH_MAX;
  if (ok(hi)) return hi;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export type Limit = "gds" | "tds" | "down";

export interface Affordability {
  input: Resolved;
  limits: Record<Limit, number>;
  binding: Limit;
  maxPrice: number;
  at: PriceScenario;
  /** 25 vs 30 years at the same price, when 30 is available. */
  amortCompare: AmortCompare | null;
  /** How much lower the income-based maximum is because of other debt. */
  debtCost: number;
  /** The qualifying rate sits on the 5.25% floor. */
  onFloor: boolean;
  /** Within $100,000 below the insured cap, or above it. */
  nearCap: boolean;
  aboveCap: boolean;
  /** Cash is the limit: income could carry more. */
  savingsLimited: boolean;
}

export interface AmortCompare {
  years25: { payment: number; totalInterest: number; maxPrice: number };
  years30: { payment: number; totalInterest: number; maxPrice: number };
}

function limitsFor(r: Resolved): Record<Limit, number> {
  const monthly = r.income / 12;
  return {
    gds: maxPrice((p) => scenario(r, p).housing <= GDS * monthly + 1e-9),
    tds: maxPrice((p) => scenario(r, p).housing + r.debt <= TDS * monthly + 1e-9),
    down: maxPrice((p) => scenario(r, p).downOk),
  };
}

const totalInterest = (mortgage: number, rate: number, years: number) => mortgagePayment(mortgage, rate, years) * years * 12 - mortgage;

export function afford(i: AffordInput): Affordability {
  const r = resolve(i);
  const limits = limitsFor(r);
  const binding = (Object.keys(limits) as Limit[]).reduce((a, b) => (limits[b] < limits[a] ? b : a), "gds" as Limit);
  const price = limits[binding];
  const at = scenario(r, price);

  let amortCompare: AmortCompare | null = null;
  if (r.thirtyEligible) {
    const r25: Resolved = { ...r, amortYears: 25 };
    const r30: Resolved = { ...r, amortYears: 30 };
    const s25 = scenario(r25, price);
    const s30 = scenario(r30, price);
    const l25 = limitsFor(r25);
    const l30 = limitsFor(r30);
    amortCompare = {
      years25: { payment: s25.actualPayment, totalInterest: totalInterest(s25.mortgage, r.contractRate, 25), maxPrice: Math.min(l25.gds, l25.tds, l25.down) },
      years30: { payment: s30.actualPayment, totalInterest: totalInterest(s30.mortgage, r.contractRate, 30), maxPrice: Math.min(l30.gds, l30.tds, l30.down) },
    };
  }

  // What the debt costs in house: the income-based maximum with and without it.
  const incomeMax = Math.min(limits.gds, limits.tds);
  const noDebtMax = r.debt > 0 ? Math.min(limits.gds, limitsFor({ ...r, debt: 0 }).tds) : incomeMax;
  return {
    input: r,
    limits,
    binding,
    maxPrice: price,
    at,
    amortCompare,
    debtCost: Math.max(0, noDebtMax - incomeMax),
    onFloor: r.contractRate + 0.02 < MQR_FLOOR,
    nearCap: price > INSURED_CAP - 100_000 && price <= INSURED_CAP,
    aboveCap: price > INSURED_CAP,
    savingsLimited: binding === "down" && Math.min(limits.gds, limits.tds) > limits.down,
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type Field = "income" | "contractRate" | "debtPayments" | "unsecuredBalance" | "securedBalance" | "taxRate" | "heating" | "condoFees" | "cash" | "legal";

export function validate(i: AffordInput): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (i.income === null || !Number.isFinite(i.income) || i.income <= 0) e.income = "Enter your household's gross yearly income, above $0.";
  const rate = i.contractRate;
  if (rate === null || !Number.isFinite(rate) || rate < 0 || rate > 0.2) e.contractRate = "Enter a mortgage rate from 0% to 20%.";
  const tr = i.taxRate;
  if (tr === null || !Number.isFinite(tr) || tr < 0 || tr > 0.05) e.taxRate = "Enter a property tax rate from 0% to 5% of the price.";
  const money: Field[] = ["debtPayments", "unsecuredBalance", "securedBalance", "heating", "condoFees", "cash", "legal"];
  for (const f of money) {
    const v = i[f as keyof AffordInput] as number | null;
    if (v === null) continue;
    if (!Number.isFinite(v) || v < 0) e[f] = "Enter $0 or more.";
  }
  return e;
}
