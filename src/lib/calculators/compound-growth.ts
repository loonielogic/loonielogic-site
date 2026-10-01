/**
 * compound-growth.ts: pure math for the Wealth Over Time calculator
 * (/calculators/compound-growth). No DOM access; the page component, the
 * results renderer and the tests all call these functions.
 *
 * Model (kept deliberately simple so the page can explain it in one line):
 *   - The expected annual return is an assumption the user controls. It is
 *     a nominal yearly rate, compounded monthly: each month the balance
 *     grows by rate / 12.
 *   - The starting amount is invested at month 0.
 *   - The monthly contribution goes in at the end of each month, after that
 *     month's growth.
 *   - No fees, no taxes, no inflation adjustment, and the same return every
 *     month. Real markets go up and down; this illustrates compounding only.
 *
 * Closed form, with i = rate / 12 and n = months:
 *   FV = P(1 + i)^n + C((1 + i)^n - 1) / i      (and P + Cn when i = 0)
 *
 * The goal planner (goal-planner.ts) reuses futureValue() so both tools
 * always agree on the same math.
 */

/* ------------------------------------------------------------------ */
/* Limits and defaults                                                 */
/* ------------------------------------------------------------------ */

export const YEARS_MIN = 1;
export const YEARS_MAX = 50;
/** How much later the comparison scenario starts. */
export const DELAY_YEARS = 10;
/** Return presets shown as buttons, as decimals. */
export const RETURN_PRESETS = [0.05, 0.07, 0.09] as const;
export const DEFAULT_RETURN = 0.07;
export const RETURN_MIN = 0;
export const RETURN_MAX = 0.3;
/** Amounts above this get a hard "too large" block (keeps the chart sane). */
export const AMOUNT_MAX = 100_000_000;

export interface GrowthInput {
  /** Lump sum invested today ($). */
  startingAmount: number | null;
  /** Added at the end of every month ($). */
  monthlyContribution: number | null;
  /** Whole years, YEARS_MIN to YEARS_MAX. */
  years: number | null;
  /** Expected annual return as a decimal (0.07 = 7%). An assumption, not a forecast. */
  annualReturn: number | null;
}

export const DEFAULT_INPUT: Readonly<GrowthInput> = {
  startingAmount: 1_000,
  monthlyContribution: 200,
  years: 30,
  annualReturn: DEFAULT_RETURN,
};

/* ------------------------------------------------------------------ */
/* Core math                                                           */
/* ------------------------------------------------------------------ */

/**
 * Balance after `months` months: `principal` invested now, `monthly` added at
 * the end of each month, `annualRate` compounded monthly.
 */
export function futureValue(principal: number, monthly: number, annualRate: number, months: number): number {
  const n = Math.max(0, months);
  const i = annualRate / 12;
  if (i === 0) return principal + monthly * n;
  const g = Math.pow(1 + i, n);
  return principal * g + (monthly * (g - 1)) / i;
}

/** Money the user put in themselves over `months` months. */
export function contributed(principal: number, monthly: number, months: number): number {
  return principal + monthly * Math.max(0, months);
}

export interface YearPoint {
  /** 0 = today. */
  year: number;
  balance: number;
  contributed: number;
  growth: number;
}

/** One point per year, from year 0 (today) to `years`. */
export function yearlySeries(principal: number, monthly: number, annualRate: number, years: number): YearPoint[] {
  const out: YearPoint[] = [];
  for (let y = 0; y <= years; y++) {
    const balance = futureValue(principal, monthly, annualRate, y * 12);
    const paid = contributed(principal, monthly, y * 12);
    out.push({ year: y, balance, contributed: paid, growth: balance - paid });
  }
  return out;
}

export interface Projection {
  years: number;
  futureValue: number;
  contributed: number;
  growth: number;
  /** Share of the final balance that came from growth (0 to 1). */
  growthShare: number;
  series: YearPoint[];
}

export function project(principal: number, monthly: number, annualRate: number, years: number): Projection {
  const fv = futureValue(principal, monthly, annualRate, years * 12);
  const paid = contributed(principal, monthly, years * 12);
  const growth = fv - paid;
  return {
    years,
    futureValue: fv,
    contributed: paid,
    growth,
    growthShare: fv > 0 ? growth / fv : 0,
    series: yearlySeries(principal, monthly, annualRate, years),
  };
}

/* ------------------------------------------------------------------ */
/* Start now vs start later                                            */
/* ------------------------------------------------------------------ */

export interface GrowthResult {
  input: { startingAmount: number; monthlyContribution: number; years: number; annualReturn: number };
  now: Projection;
  /** Same inputs, DELAY_YEARS fewer years (never below 0). */
  later: Projection;
  /** Years the late starter gets: max(0, years - DELAY_YEARS). */
  laterYears: number;
  /** now.futureValue - later.futureValue. */
  costOfWaiting: number;
  /** Extra put in by the early starter: now.contributed - later.contributed. */
  extraContributed: number;
}

export function calculate(i: GrowthInput): GrowthResult {
  const p = i.startingAmount ?? 0;
  const c = i.monthlyContribution ?? 0;
  const years = i.years ?? DEFAULT_INPUT.years!;
  const r = i.annualReturn ?? DEFAULT_RETURN;
  const laterYears = Math.max(0, years - DELAY_YEARS);
  const now = project(p, c, r, years);
  const later = project(p, c, r, laterYears);
  return {
    input: { startingAmount: p, monthlyContribution: c, years, annualReturn: r },
    now,
    later,
    laterYears,
    costOfWaiting: now.futureValue - later.futureValue,
    extraContributed: now.contributed - later.contributed,
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type Field = "startingAmount" | "monthlyContribution" | "years" | "annualReturn";

export function validate(i: GrowthInput): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  const money: [Field, number | null, string][] = [
    ["startingAmount", i.startingAmount, "starting amount"],
    ["monthlyContribution", i.monthlyContribution, "monthly amount"],
  ];
  for (const [field, v, label] of money) {
    if (v === null) continue; // blank counts as $0
    if (!Number.isFinite(v) || v < 0) errors[field] = `Enter a ${label} of $0 or more.`;
    else if (v > AMOUNT_MAX) errors[field] = `That ${label} is over $100 million. Try a smaller number.`;
  }
  const y = i.years;
  if (y === null || !Number.isInteger(y) || y < YEARS_MIN || y > YEARS_MAX) {
    errors.years = `Pick a whole number of years from ${YEARS_MIN} to ${YEARS_MAX}.`;
  }
  const r = i.annualReturn;
  if (r === null || !Number.isFinite(r) || r < RETURN_MIN || r > RETURN_MAX) {
    errors.annualReturn = `Enter a yearly return from ${RETURN_MIN * 100}% to ${RETURN_MAX * 100}%.`;
  }
  return errors;
}
