/**
 * goal-planner.ts: pure math for the Goal Planner (/calculators/goal-planner).
 * No DOM access; the page component, the results renderer and the tests all
 * call these functions.
 *
 * Phase 1 of goal tracking: set a goal, see the path. There are no accounts
 * and nothing is saved. The shapes are split so tracking can layer on later:
 *   - Goal        what the user wants (name, target, deadline) plus where
 *                 they start (savings today, monthly saving).
 *   - GoalPlan    everything derived from a Goal at one moment in time.
 *   - A later "check-in" can rebuild a GoalPlan from a Goal whose
 *     currentSavings and yearsLeft have moved on; nothing here assumes the
 *     plan is only ever made once.
 *
 * Growth uses the same model as the Wealth Over Time calculator
 * (compound-growth.ts futureValue): a nominal yearly rate compounded
 * monthly, savings today invested at month 0, the monthly amount added at
 * the end of each month. No fees, taxes or inflation.
 */

import { futureValue } from "./compound-growth";

/* ------------------------------------------------------------------ */
/* Limits and defaults                                                 */
/* ------------------------------------------------------------------ */

export const YEARS_MIN = 1;
export const YEARS_MAX = 40;
/** The solver searches 0% to this. Above it, the goal counts as out of reach. */
export const SOLVER_MAX_RATE = 0.3;
/** Solver precision on the yearly rate (0.00001 = 0.001 percentage points). */
const SOLVER_TOLERANCE = 1e-5;
/** Verdict band edges, as decimals. */
export const STEADY_MAX = 0.04;
export const MARKET_MAX = 0.08;
/** Presets for "your own expected return" in the inverse view. */
export const EXPECTED_PRESETS = [0, 0.03, 0.05, 0.07] as const;
export const DEFAULT_EXPECTED = 0.05;
export const EXPECTED_MAX = 0.3;
export const AMOUNT_MAX = 100_000_000;
export const NAME_MAX = 60;
/** Milestones are projected at most this far out. */
export const PROJECTION_MAX_MONTHS = 100 * 12;
export const MILESTONES = [0.25, 0.5, 0.75, 1] as const;

export interface Goal {
  /** Free text, e.g. "First home down payment". Display only. */
  name: string;
  target: number | null;
  /** Whole years until the target date. */
  years: number | null;
  currentSavings: number | null;
  monthlyContribution: number | null;
}

/** A Goal with blanks filled in (blank amounts count as $0). */
export interface ResolvedGoal {
  name: string;
  target: number;
  years: number;
  currentSavings: number;
  monthlyContribution: number;
}

export const DEFAULT_GOAL: Readonly<Goal> = {
  name: "First home down payment",
  target: 30_000,
  years: 5,
  currentSavings: 2_000,
  monthlyContribution: 400,
};

/* ------------------------------------------------------------------ */
/* Required return                                                     */
/* ------------------------------------------------------------------ */

export type RequiredReturn =
  /** Savings today already cover the target. */
  | { kind: "already_there" }
  /** Saving alone (0% growth) reaches the target in time. */
  | { kind: "no_growth_needed"; rate: 0 }
  /** A rate between 0% and SOLVER_MAX_RATE hits the target exactly. */
  | { kind: "solved"; rate: number }
  /** Even SOLVER_MAX_RATE a year falls short. */
  | { kind: "out_of_reach"; shortfallAtMax: number };

/**
 * The yearly return (compounded monthly) at which savings today plus the
 * monthly amount grow to exactly `target` in `years`. Bisection on the
 * future-value equation: FV rises with the rate whenever the inputs are
 * $0 or more, so the root is unique when it exists.
 */
export function requiredReturn(target: number, years: number, current: number, monthly: number): RequiredReturn {
  if (current >= target) return { kind: "already_there" };
  const months = years * 12;
  if (futureValue(current, monthly, 0, months) >= target) return { kind: "no_growth_needed", rate: 0 };
  const atMax = futureValue(current, monthly, SOLVER_MAX_RATE, months);
  if (atMax < target) return { kind: "out_of_reach", shortfallAtMax: target - atMax };
  let lo = 0;
  let hi = SOLVER_MAX_RATE;
  for (let k = 0; k < 200 && hi - lo > SOLVER_TOLERANCE / 10; k++) {
    const mid = (lo + hi) / 2;
    if (futureValue(current, monthly, mid, months) < target) lo = mid;
    else hi = mid;
  }
  return { kind: "solved", rate: (lo + hi) / 2 };
}

export type VerdictBand = "steady" | "market" | "above";

export const VERDICT_COPY: Record<VerdictBand, string> = {
  steady: "Steady path: your savings alone nearly get you there.",
  market: "Needs market-like growth: investing could bridge the gap.",
  above: "Above historical averages: consider saving more each month or giving it more time.",
};

/** <= 4%: steady; above 4% to 8%: market; above 8% (or out of reach): above. */
export function verdictBand(r: RequiredReturn): VerdictBand {
  if (r.kind === "already_there" || r.kind === "no_growth_needed") return "steady";
  if (r.kind === "out_of_reach") return "above";
  if (r.rate <= STEADY_MAX) return "steady";
  if (r.rate <= MARKET_MAX) return "market";
  return "above";
}

/* ------------------------------------------------------------------ */
/* Inverse view: monthly saving needed at a chosen return              */
/* ------------------------------------------------------------------ */

/**
 * Monthly amount needed to reach `target` in `years` if money earns
 * `annualRate` (compounded monthly). $0 when savings today grow to the
 * target on their own.
 */
export function requiredMonthly(target: number, years: number, current: number, annualRate: number): number {
  const n = years * 12;
  const fromCurrent = futureValue(current, 0, annualRate, n);
  const gap = target - fromCurrent;
  if (gap <= 0) return 0;
  // futureValue(0, 1, rate, n) is the value of $1 a month: the annuity factor.
  return gap / futureValue(0, 1, annualRate, n);
}

/* ------------------------------------------------------------------ */
/* Milestones                                                          */
/* ------------------------------------------------------------------ */

export interface MonthStamp {
  year: number;
  /** 1 to 12. */
  month: number;
}

export function addMonths(start: MonthStamp, n: number): MonthStamp {
  const idx = start.year * 12 + (start.month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export interface Milestone {
  /** 0.25, 0.5, 0.75 or 1. */
  share: number;
  amount: number;
  /** Months from now until the balance first reaches `amount`; null if not within PROJECTION_MAX_MONTHS. */
  months: number | null;
  /** Calendar month it lands in; null when months is null. */
  date: MonthStamp | null;
  /** True when it lands on or before the target date. */
  onTime: boolean;
  /** True when savings today already cover it. */
  reached: boolean;
}

/**
 * When the balance first reaches each milestone, at the user's own monthly
 * amount and chosen return. Month-by-month, the same order as futureValue:
 * growth first, then the deposit.
 */
export function milestones(goal: ResolvedGoal, annualRate: number, start: MonthStamp): Milestone[] {
  const targetMonths = goal.years * 12;
  const amounts = MILESTONES.map((s) => s * goal.target);
  const hit: (number | null)[] = amounts.map((a) => (goal.currentSavings >= a ? 0 : null));
  const i = annualRate / 12;
  let balance = goal.currentSavings;
  for (let m = 1; m <= PROJECTION_MAX_MONTHS && hit.some((h) => h === null); m++) {
    balance = balance * (1 + i) + goal.monthlyContribution;
    for (let k = 0; k < amounts.length; k++) if (hit[k] === null && balance >= amounts[k] - 1e-6) hit[k] = m;
  }
  return MILESTONES.map((share, k) => {
    const months = hit[k];
    return {
      share,
      amount: amounts[k],
      months,
      date: months === null ? null : addMonths(start, months),
      onTime: months !== null && months <= targetMonths,
      reached: months === 0,
    };
  });
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

export interface GoalPlan {
  goal: ResolvedGoal;
  /** Calendar month the target date falls in. */
  targetDate: MonthStamp;
  /** What savings alone (0% growth) add up to by the target date. */
  savedByDeadline: number;
  required: RequiredReturn;
  band: VerdictBand;
  /** The user's own expected return for the inverse view and milestones. */
  expectedReturn: number;
  /** Monthly amount needed at expectedReturn. */
  monthlyNeeded: number;
  /** Projected balance at the target date at expectedReturn and the user's monthly amount. */
  projectedAtDeadline: number;
  milestones: Milestone[];
}

export function plan(g: Goal, expectedReturn: number, start: MonthStamp): GoalPlan {
  const goal: ResolvedGoal = {
    name: g.name.trim().slice(0, NAME_MAX) || "Your goal",
    target: g.target ?? 0,
    years: g.years ?? DEFAULT_GOAL.years!,
    currentSavings: g.currentSavings ?? 0,
    monthlyContribution: g.monthlyContribution ?? 0,
  };
  const months = goal.years * 12;
  const required = requiredReturn(goal.target, goal.years, goal.currentSavings, goal.monthlyContribution);
  return {
    goal,
    targetDate: addMonths(start, months),
    savedByDeadline: futureValue(goal.currentSavings, goal.monthlyContribution, 0, months),
    required,
    band: verdictBand(required),
    expectedReturn,
    monthlyNeeded: requiredMonthly(goal.target, goal.years, goal.currentSavings, expectedReturn),
    projectedAtDeadline: futureValue(goal.currentSavings, goal.monthlyContribution, expectedReturn, months),
    milestones: milestones(goal, expectedReturn, start),
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type Field = "name" | "target" | "years" | "currentSavings" | "monthlyContribution" | "expectedReturn";

export function validate(g: Goal, expectedReturn: number | null): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (g.name.trim().length > NAME_MAX) errors.name = `Keep the goal name to ${NAME_MAX} characters or fewer.`;
  const t = g.target;
  if (t === null || !Number.isFinite(t) || t <= 0) errors.target = "Enter a target amount above $0.";
  else if (t > AMOUNT_MAX) errors.target = "That target is over $100 million. Try a smaller number.";
  const y = g.years;
  if (y === null || !Number.isInteger(y) || y < YEARS_MIN || y > YEARS_MAX) {
    errors.years = `Pick a whole number of years from ${YEARS_MIN} to ${YEARS_MAX}.`;
  }
  const money: [Field, number | null, string][] = [
    ["currentSavings", g.currentSavings, "savings amount"],
    ["monthlyContribution", g.monthlyContribution, "monthly amount"],
  ];
  for (const [field, v, label] of money) {
    if (v === null) continue; // blank counts as $0
    if (!Number.isFinite(v) || v < 0) errors[field] = `Enter a ${label} of $0 or more.`;
    else if (v > AMOUNT_MAX) errors[field] = `That ${label} is over $100 million. Try a smaller number.`;
  }
  const r = expectedReturn;
  if (r === null || !Number.isFinite(r) || r < 0 || r > EXPECTED_MAX) {
    errors.expectedReturn = `Enter a yearly return from 0% to ${EXPECTED_MAX * 100}%.`;
  }
  return errors;
}
