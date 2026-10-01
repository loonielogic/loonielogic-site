/**
 * rent-vs-buy.ts: pure math for the rent vs buy calculator
 * (/calculators/rent-vs-buy). No DOM access; the page component, the
 * results renderer and the tests all call these functions.
 *
 * Net-wealth method, monthly steps (spec section 3):
 *   Buy path at year Y   = home value - selling costs - mortgage balance
 *   Rent path at year Y  = upfront cash invested (down payment + closing +
 *                          moving) + each month's (owning cost - rent),
 *                          all growing at the investment return
 * Owning cost each month = mortgage payment + property tax + insurance +
 * maintenance + condo fees. Property tax and maintenance grow with the home's
 * value; insurance and condo fees grow with rent (a general cost-growth
 * proxy). The mortgage uses Canadian semi-annual compounding and includes
 * the CMHC premium under 20% down. Breakeven is the first year the buy path
 * is ahead. With the spec's defaults this reproduces its verdicts: Toronto
 * never breaks even, Calgary breaks even in year 5, and the Toronto bull
 * case (5% appreciation, 4% returns) in year 4.
 */

import { figure, type FigureLog } from "./figures";
import { cmhcPremiumRate, minimumDownPayment, mortgagePayment, qualifyingRate } from "./down-payment-planner";

/** Registry keys this calculator reads directly, in first-use order. */
export const rvbFigures: FigureLog = new Map();
const fig = <T>(file: string, key: string) => figure<T>(file, key, rvbFigures);

const ASSUMPTIONS = fig<{ home_appreciation: number; maintenance_annual: number; renter_invest_return: number; selling_commission: number }>(
  "rent-housing-2026.json",
  "rent_vs_buy.assumptions",
);
export const ON_GUIDELINE = fig<number>("rent-housing-2026.json", "rent.on_guideline.2026");
export const BC_GUIDELINE = fig<number>("rent-housing-2026.json", "rent.bc_guideline.2026");
export const TORONTO_TAX = fig<number>("rent-housing-2026.json", "property_tax.toronto.2026");
export const CALGARY_TAX = fig<number>("rent-housing-2026.json", "property_tax.calgary.2026");
export const EDMONTON_TAX = fig<number>("rent-housing-2026.json", "property_tax.edmonton.2026");
export const INSURANCE_DEFAULT = fig<number>("closing-costs-2026.json", "budget.home_insurance_monthly");
export const RATE_SNAPSHOT = fig<{ best_5yr_fixed: number; best_5yr_variable: number }>("mortgage-2026.json", "mortgage.rates_snapshot.2026_09");
fig("mortgage-2026.json", "mortgage.compounding_rule");
fig("mortgage-2026.json", "osfi.mqr.2026");
fig("mortgage-2026.json", "cmhc.premiums.2026");
fig("mortgage-2026.json", "down_payment.tiers.2026");
fig("mortgage-2026.json", "closing_costs.range");

export const DEFAULT_APPRECIATION = ASSUMPTIONS.home_appreciation;
export const DEFAULT_RETURN = ASSUMPTIONS.renter_invest_return;
export const DEFAULT_MAINTENANCE = ASSUMPTIONS.maintenance_annual;
export const DEFAULT_COMMISSION = ASSUMPTIONS.selling_commission;
/** Spec 6: condos cover the exterior, so maintenance runs lower. */
export const CONDO_MAINTENANCE = 0.005;
/** Spec section 5 worked examples (illustrative rate from the research's discount-brokerage range). */
export const DEFAULT_RATE = 0.0409;
export const DEFAULT_CLOSING = 0.02;
/** Research: selling legal ~$2,000, moving ~$2,000 (each way). */
export const DEFAULT_LEGAL = 2_000;
export const DEFAULT_MOVING = 2_000;
export const HORIZON_MIN = 1;
export const HORIZON_MAX = 30;
/** Spec 4: price-to-rent bands and the monthly-stretch trigger. */
export const PTR_BUY_BELOW = 15;
export const PTR_RENT_ABOVE = 20;
export const PTR_SANITY_BELOW = 8;
export const STRETCH_MULTIPLE = 1.4;
export const TDS_CHECK = 0.44;
/** Spec 4.3: the sensitivity grid. */
export const GRID_APPRECIATION = [0.01, 0.03, 0.05] as const;
export const GRID_RETURN = [0.03, 0.05, 0.07] as const;

export interface RvbInput {
  rent: number | null;
  rentGrowth: number | null;
  price: number | null;
  /** Down payment as a share of the price. */
  downPct: number | null;
  condo: boolean;
  condoFees: number | null;
  rate: number | null;
  amortYears: 25 | 30;
  taxRate: number | null;
  insurance: number | null;
  maintenance: number | null;
  appreciation: number | null;
  investReturn: number | null;
  /** Buying closing costs as a share of the price. */
  closingPct: number | null;
  commission: number | null;
  moving: number | null;
  /** Years in the home: the planned tenure (also the comparison horizon). */
  years: number | null;
  /** Optional household income for the stress-test check. */
  income: number | null;
  /** Ontario unit first occupied after November 15, 2018 (guideline-exempt). */
  guidelineExempt: boolean;
}

/** Spec 5 Toronto base case. */
export const DEFAULT_INPUT: Readonly<RvbInput> = {
  rent: 2_600,
  rentGrowth: ON_GUIDELINE,
  price: 800_000,
  downPct: 0.1,
  condo: false,
  condoFees: 0,
  rate: DEFAULT_RATE,
  amortYears: 25,
  taxRate: TORONTO_TAX,
  insurance: INSURANCE_DEFAULT,
  maintenance: DEFAULT_MAINTENANCE,
  appreciation: DEFAULT_APPRECIATION,
  investReturn: DEFAULT_RETURN,
  closingPct: DEFAULT_CLOSING,
  commission: DEFAULT_COMMISSION,
  moving: DEFAULT_MOVING,
  years: 10,
  income: null,
  guidelineExempt: false,
};

export interface Resolved {
  rent: number;
  rentGrowth: number;
  price: number;
  downPct: number;
  condo: boolean;
  condoFees: number;
  rate: number;
  amortYears: 25 | 30;
  taxRate: number;
  insurance: number;
  maintenance: number;
  appreciation: number;
  investReturn: number;
  closingPct: number;
  commission: number;
  moving: number;
  years: number;
  income: number | null;
  guidelineExempt: boolean;
}

export function resolve(i: RvbInput): Resolved {
  const d = DEFAULT_INPUT;
  const v = (x: number | null, fb: number) => (x === null || !Number.isFinite(x) ? fb : x);
  return {
    rent: v(i.rent, d.rent!),
    rentGrowth: v(i.rentGrowth, d.rentGrowth!),
    price: v(i.price, d.price!),
    downPct: v(i.downPct, d.downPct!),
    condo: i.condo,
    condoFees: i.condo ? Math.max(0, v(i.condoFees, 0)) : 0,
    rate: v(i.rate, d.rate!),
    amortYears: i.amortYears,
    taxRate: v(i.taxRate, d.taxRate!),
    insurance: Math.max(0, v(i.insurance, d.insurance!)),
    maintenance: v(i.maintenance, i.condo ? CONDO_MAINTENANCE : d.maintenance!),
    appreciation: v(i.appreciation, d.appreciation!),
    investReturn: v(i.investReturn, d.investReturn!),
    closingPct: v(i.closingPct, d.closingPct!),
    commission: v(i.commission, d.commission!),
    moving: Math.max(0, v(i.moving, d.moving!)),
    years: Math.round(v(i.years, d.years!)),
    income: i.income === null || !Number.isFinite(i.income) || i.income <= 0 ? null : i.income,
    guidelineExempt: i.guidelineExempt,
  };
}

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

export interface YearRow {
  year: number;
  buy: number;
  rent: number;
  homeValue: number;
  balance: number;
}

export interface Simulation {
  down: number;
  premiumRate: number;
  premium: number;
  mortgage: number;
  payment: number;
  closing: number;
  upfront: number;
  /** Month-1 owning cost (payment + tax + insurance + maintenance + condo). */
  ownMonth1: number;
  rows: YearRow[];
  /** First year (1 to 30) the buy path is ahead; null = never within 30 years. */
  breakeven: number | null;
}

/** Monthly rate from an effective yearly rate. */
const monthly = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;

export function simulate(r: Resolved, horizon = HORIZON_MAX): Simulation {
  const down = r.price * r.downPct;
  const premiumRate = cmhcPremiumRate(r.price, down, r.amortYears === 30);
  const loan = r.price - down;
  const premium = loan * premiumRate;
  const mortgage = loan + premium;
  const payment = mortgagePayment(mortgage, r.rate, r.amortYears);
  const mRate = Math.pow(1 + r.rate / 2, 2 / 12) - 1;
  const closing = r.price * r.closingPct;
  const upfront = down + closing + r.moving;
  const inv = monthly(r.investReturn);

  let balance = mortgage;
  let renter = upfront;
  let ownMonth1 = 0;
  let breakeven: number | null = null;
  const rows: YearRow[] = [];
  for (let t = 1; t <= horizon * 12; t++) {
    const e = (t - 1) / 12;
    const value = r.price * Math.pow(1 + r.appreciation, e);
    const rentNow = r.rent * Math.pow(1 + r.rentGrowth, e);
    const costGrowth = Math.pow(1 + r.rentGrowth, e);
    const pay = balance > 0 ? Math.min(payment, balance * (1 + mRate)) : 0;
    balance = Math.max(0, balance * (1 + mRate) - pay);
    const own = pay + (value * r.taxRate) / 12 + r.insurance * costGrowth + (value * r.maintenance) / 12 + r.condoFees * costGrowth;
    if (t === 1) ownMonth1 = own;
    renter = renter * (1 + inv) + (own - rentNow);
    if (t % 12 === 0) {
      const year = t / 12;
      const homeValue = r.price * Math.pow(1 + r.appreciation, year);
      const buy = homeValue * (1 - r.commission) - DEFAULT_LEGAL - r.moving - balance;
      rows.push({ year, buy, rent: renter, homeValue, balance });
      if (breakeven === null && buy >= renter) breakeven = year;
    }
  }
  return { down, premiumRate, premium, mortgage, payment, closing, upfront, ownMonth1, rows, breakeven };
}

/* ------------------------------------------------------------------ */
/* The comparison                                                      */
/* ------------------------------------------------------------------ */

export type Verdict = "buy" | "rent";

export interface GridCell {
  appreciation: number;
  investReturn: number;
  verdict: Verdict;
  breakeven: number | null;
  base: boolean;
}

export type PtrBand = "buy" | "tossup" | "rent";

export interface RvbResult {
  input: Resolved;
  sim: Simulation;
  verdict: Verdict;
  /** Buy minus rent at the planned tenure. */
  gapAtTenure: number;
  at: YearRow;
  priceToRent: number;
  ptrBand: PtrBand;
  ptrSanity: boolean;
  grid: GridCell[];
  rentCells: number;
  /** Stress-test payment (spec: shows the qualification burden). */
  stressPayment: number;
  /** Stress-test payment above 44% of monthly income (when income is given). */
  mayNotQualify: boolean;
  stretch: boolean;
  /** Round-trip transaction costs: buying closing + selling commission + legal + moving twice. */
  roundTrip: number;
  /** The down payment is below the tiered minimum. */
  belowMinimumDown: boolean;
  minimumDown: number;
}

export function compare(i: RvbInput): RvbResult {
  const r = resolve(i);
  const sim = simulate(r);
  const at = sim.rows[Math.min(r.years, HORIZON_MAX) - 1];
  const verdict: Verdict = sim.breakeven !== null && sim.breakeven <= r.years ? "buy" : "rent";
  const priceToRent = r.rent > 0 ? r.price / (12 * r.rent) : Infinity;
  const ptrBand: PtrBand = priceToRent < PTR_BUY_BELOW ? "buy" : priceToRent > PTR_RENT_ABOVE ? "rent" : "tossup";
  const grid: GridCell[] = [];
  for (const appreciation of GRID_APPRECIATION) {
    for (const investReturn of GRID_RETURN) {
      const s = simulate({ ...r, appreciation, investReturn }, Math.max(r.years, 1));
      const be = s.breakeven;
      grid.push({
        appreciation,
        investReturn,
        breakeven: be,
        verdict: be !== null && be <= r.years ? "buy" : "rent",
        base: Math.abs(appreciation - r.appreciation) < 1e-9 && Math.abs(investReturn - r.investReturn) < 1e-9,
      });
    }
  }
  const stressPayment = mortgagePayment(sim.mortgage, qualifyingRate(r.rate), r.amortYears);
  const minimumDown = minimumDownPayment(r.price);
  return {
    input: r,
    sim,
    verdict,
    gapAtTenure: at.buy - at.rent,
    at,
    priceToRent,
    ptrBand,
    ptrSanity: priceToRent < PTR_SANITY_BELOW,
    grid,
    rentCells: grid.filter((c) => c.verdict === "rent").length,
    stressPayment,
    mayNotQualify: r.income !== null && stressPayment > (TDS_CHECK * r.income) / 12,
    stretch: sim.ownMonth1 > STRETCH_MULTIPLE * r.rent,
    roundTrip: sim.closing + r.price * r.commission + DEFAULT_LEGAL + 2 * r.moving,
    belowMinimumDown: sim.down + 0.5 < minimumDown,
    minimumDown,
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type Field =
  | "rent" | "rentGrowth" | "price" | "downPct" | "condoFees" | "rate" | "taxRate" | "insurance" | "maintenance"
  | "appreciation" | "investReturn" | "closingPct" | "commission" | "moving" | "years" | "income";

export function validate(i: RvbInput): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  const inRange = (v: number | null, lo: number, hi: number) => v !== null && Number.isFinite(v) && v >= lo && v <= hi;
  if (!inRange(i.rent, 1, 100_000)) e.rent = "Enter your monthly rent, above $0.";
  if (!inRange(i.price, 10_000, 50_000_000)) e.price = "Enter a home price of at least $10,000.";
  if (!inRange(i.rentGrowth, 0, 0.1)) e.rentGrowth = "Enter rent growth from 0% to 10% a year.";
  if (!inRange(i.appreciation, -0.05, 0.1)) e.appreciation = "Enter home price growth from -5% to 10% a year.";
  if (!inRange(i.investReturn, 0, 0.1)) e.investReturn = "Enter an investment return from 0% to 10% a year.";
  if (!inRange(i.downPct, 0.05, 1)) e.downPct = "Enter a down payment from 5% to 100% of the price.";
  else if (i.price !== null && Number.isFinite(i.price) && i.price * i.downPct! + 0.5 < minimumDownPayment(i.price)) {
    e.downPct = `At this price the minimum down payment is ${Math.ceil((minimumDownPayment(i.price) / i.price) * 1000) / 10}%.`;
  }
  if (!inRange(i.rate, 0, 0.2)) e.rate = "Enter a mortgage rate from 0% to 20%.";
  if (!inRange(i.taxRate, 0, 0.05)) e.taxRate = "Enter a property tax rate from 0% to 5%.";
  if (!inRange(i.maintenance, 0, 0.05)) e.maintenance = "Enter maintenance from 0% to 5% of the home's value.";
  if (!inRange(i.closingPct, 0, 0.1)) e.closingPct = "Enter closing costs from 0% to 10% of the price.";
  if (!inRange(i.commission, 0, 0.1)) e.commission = "Enter a selling commission from 0% to 10%.";
  if (i.years === null || !Number.isInteger(i.years) || i.years < HORIZON_MIN || i.years > HORIZON_MAX) {
    e.years = `Pick a whole number of years from ${HORIZON_MIN} to ${HORIZON_MAX}.`;
  }
  for (const f of ["condoFees", "insurance", "moving", "income"] as const) {
    const v = i[f];
    if (v !== null && (!Number.isFinite(v) || v < 0)) e[f] = "Enter $0 or more.";
  }
  return e;
}
