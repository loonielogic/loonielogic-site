/**
 * tfsa-room-checker.ts: pure math for the TFSA Over-Contribution Risk Checker
 * (/calculators/tfsa-room-checker). No DOM access; the page component and the
 * tests both call these functions.
 *
 * Room now = cumulative room at Jan 1 of this year
 *          - lifetime contributions
 *          + withdrawals made in earlier calendar years.
 * Withdrawals made this year are tracked separately: they return on Jan 1 of
 * next year and are never part of "room now".
 *
 * Every constant comes from the figure registry (tfsa-2026.json) via
 * figures.ts. The checker keeps its own figure log so its sources footer
 * lists exactly the keys it reads.
 */

import { figure, type FigureLog } from "./figures";

const FILE = "tfsa-2026.json";

/** Registry keys this checker reads, in first-use order. */
export const tfsaFigures: FigureLog = new Map();
const fig = <T>(key: string) => figure<T>(FILE, key, tfsaFigures);

/* ------------------------------------------------------------------ */
/* Registry constants                                                  */
/* ------------------------------------------------------------------ */

/** Figures are for the 2026 tax year; "this year" is always 2026 here. */
export const CURRENT_YEAR = 2026;
export const RESTORE_YEAR = CURRENT_YEAR + 1;
/** TFSAs started in 2009; no room exists for earlier years. */
export const FIRST_TFSA_YEAR = 2009;

export const ANNUAL_LIMIT = fig<number>("tfsa.annual_limit.2026");
const BANDS = fig<Record<string, number>>("tfsa.bands.history");
export const CUMULATIVE_MAX = fig<number>("tfsa.cumulative_max.2026");
export const ELIGIBILITY = fig<{ min_age: number; requires_sin: boolean; resident: boolean }>("tfsa.eligibility");
export const MIN_AGE = ELIGIBILITY.min_age;
export const WITHDRAWAL_RESTORE = fig<string>("tfsa.withdrawal_restore");
export const EXCESS_TAX_RATE = fig<{ rate_per_month: number; basis: string }>("tfsa.excess_tax").rate_per_month;
/** ISO date, e.g. "2027-06-30". */
export const RC243_DEADLINE = fig<string>("tfsa.rc243_deadline");
export const MY_ACCOUNT_LAG = fig<string>("tfsa.my_account_lag");
export const FORMAL_TRANSFER = fig<string>("tfsa.formal_transfer");

/** Lifetime totals above this get a "double-check that" warning, not a block. */
export const ABSURD_AMOUNT = 10_000_000;

/** Year -> annual limit, expanded from the registry bands ("2009_2012": 5000). */
export const ANNUAL_LIMITS: Readonly<Record<number, number>> = (() => {
  const out: Record<number, number> = {};
  for (const [band, limit] of Object.entries(BANDS)) {
    const parts = band.split("_").map(Number);
    const from = parts[0];
    const to = parts[parts.length - 1];
    for (let y = from; y <= to; y++) out[y] = limit;
  }
  for (let y = FIRST_TFSA_YEAR; y <= CURRENT_YEAR; y++) {
    if (!(y in out)) throw new Error(`tfsa.bands.history has no limit for ${y}`);
  }
  if (out[CURRENT_YEAR] !== ANNUAL_LIMIT) {
    throw new Error(`tfsa.bands.history ${CURRENT_YEAR} limit disagrees with tfsa.annual_limit.2026`);
  }
  return out;
})();

export function annualLimit(year: number): number {
  return ANNUAL_LIMITS[year] ?? 0;
}

/** Sum of annual limits from startYear through CURRENT_YEAR (0 if start is later). */
export function cumulativeRoom(startYear: number): number {
  let total = 0;
  for (let y = Math.max(startYear, FIRST_TFSA_YEAR); y <= CURRENT_YEAR; y++) total += annualLimit(y);
  return total;
}

if (cumulativeRoom(FIRST_TFSA_YEAR) !== CUMULATIVE_MAX) {
  throw new Error("tfsa.bands.history does not sum to tfsa.cumulative_max.2026");
}

/** Room starts the later of: the year you turn 18, the year you became resident, 2009. */
export function eligibilityStart(birthYear: number, residencyYear: number | null): number {
  return Math.max(birthYear + MIN_AGE, residencyYear ?? 0, FIRST_TFSA_YEAR);
}

/** 1% a month on the highest excess in the month. */
export function excessTaxPerMonth(excess: number): number {
  return Math.max(0, excess) * EXCESS_TAX_RATE;
}

/** Tax for an excess left in for `months` calendar months (any part month counts). */
export function excessTax(excess: number, months: number): number {
  return excessTaxPerMonth(excess) * Math.max(0, Math.ceil(months));
}

/* ------------------------------------------------------------------ */
/* Inputs and validation                                               */
/* ------------------------------------------------------------------ */

export interface CheckerInput {
  birthYear: number | null;
  residentLater: boolean;
  residencyYear: number | null;
  /** Full calendar years of non-residency (checkboxes). */
  nonResidentYears: number[];
  /** Every dollar ever deposited, all institutions, gross. */
  lifetimeContributions: number | null;
  /** Withdrawals up to Dec 31 of last year. */
  priorWithdrawals: number | null;
  /** Withdrawals so far this year. */
  thisYearWithdrawals: number | null;
  /** Optional: a deposit being considered this year. */
  plannedDeposit: number | null;
  /** "Not sure" mode: totals are the user's best guess. */
  bestGuess: boolean;
}

export type Field = "birthYear" | "residencyYear" | "nonResidentYears" | "lifetimeContributions"
  | "priorWithdrawals" | "thisYearWithdrawals" | "plannedDeposit";

export interface Validation {
  /** Hard blocks, by field. */
  errors: Partial<Record<Field, string>>;
  /** Soft "double-check that" notes, by field. */
  warnings: Partial<Record<Field, string>>;
}

export const NOT_ELIGIBLE_MESSAGE = "You're not eligible yet: room starts the year you turn 18.";

const isAmount = (v: number | null): v is number => v !== null && Number.isFinite(v);

export function validate(i: CheckerInput): Validation {
  const errors: Validation["errors"] = {};
  const warnings: Validation["warnings"] = {};
  if (i.birthYear === null || !Number.isInteger(i.birthYear) || i.birthYear < 1900 || i.birthYear > CURRENT_YEAR) {
    errors.birthYear = `Enter a birth year between 1900 and ${CURRENT_YEAR}.`;
  } else if (i.birthYear + MIN_AGE > CURRENT_YEAR) {
    errors.birthYear = NOT_ELIGIBLE_MESSAGE;
  }
  if (i.residentLater) {
    const r = i.residencyYear;
    if (r === null || !Number.isInteger(r) || r < 1900 || r > CURRENT_YEAR) {
      errors.residencyYear = `Enter the year you became a Canadian tax resident (${CURRENT_YEAR} or earlier).`;
    }
  }
  const money: [Field, number | null, boolean][] = [
    ["lifetimeContributions", i.lifetimeContributions, true],
    ["priorWithdrawals", i.priorWithdrawals, true],
    ["thisYearWithdrawals", i.thisYearWithdrawals, true],
    ["plannedDeposit", i.plannedDeposit, false],
  ];
  for (const [field, v, required] of money) {
    if (v === null) {
      if (required) errors[field] = "Enter an amount in dollars (0 if none).";
    } else if (!Number.isFinite(v) || v < 0) {
      errors[field] = "Enter an amount of $0 or more.";
    } else if (v > ABSURD_AMOUNT) {
      warnings[field] = "That's over $10 million. Double-check that figure.";
    }
  }
  return { errors, warnings };
}

/* ------------------------------------------------------------------ */
/* The check                                                           */
/* ------------------------------------------------------------------ */

export type Outcome = "not_eligible" | "room_available" | "no_room" | "over_contributed";

export interface CheckResult {
  input: CheckerInput;
  eligible: boolean;
  startYear: number;
  /** Year the person turns 18. */
  turned18Year: number;
  /** Which rule set the start year. */
  startReason: "age" | "residency" | "tfsa_launch";
  cumulative: number;
  /** Non-resident years inside [startYear, CURRENT_YEAR], sorted. */
  nonResidentYears: number[];
  nonResidentDeduction: number;
  cumulativeAfterNonResidency: number;
  contributions: number;
  priorWithdrawals: number;
  /** Signed: negative means over-contributed. */
  roomNow: number;
  excess: number;
  excessTaxMonthly: number;
  /** This-year withdrawals: the "comes back Jan 1" figure. */
  returningJan1: number;
  planned: number;
  /** Section 5.1: same-year recontribution warning. */
  recontributionWarning: boolean;
  /** How far a planned deposit would go past room now (0 if it fits). */
  plannedExcess: number;
  newThisYear: boolean;
  turned18ThisYear: boolean;
  arrivedThisYear: boolean;
  allYearsNonResident: boolean;
  outcome: Outcome;
}

const amt = (v: number | null) => (isAmount(v) && v > 0 ? v : 0);

export function check(i: CheckerInput): CheckResult {
  const birthYear = i.birthYear ?? CURRENT_YEAR;
  const residencyYear = i.residentLater ? i.residencyYear : null;
  const turned18Year = birthYear + MIN_AGE;
  const startYear = eligibilityStart(birthYear, residencyYear);
  const eligible = turned18Year <= CURRENT_YEAR && startYear <= CURRENT_YEAR;
  const startReason: CheckResult["startReason"] =
    startYear === turned18Year && turned18Year >= (residencyYear ?? 0)
      ? "age"
      : residencyYear !== null && startYear === residencyYear
        ? "residency"
        : "tfsa_launch";

  const cumulative = eligible ? cumulativeRoom(startYear) : 0;
  const nonResidentYears = eligible
    ? [...new Set(i.nonResidentYears)].filter((y) => y >= startYear && y <= CURRENT_YEAR).sort((a, b) => a - b)
    : [];
  const nonResidentDeduction = nonResidentYears.reduce((s, y) => s + annualLimit(y), 0);
  const cumulativeAfterNonResidency = cumulative - nonResidentDeduction;

  const contributions = amt(i.lifetimeContributions);
  const priorWithdrawals = amt(i.priorWithdrawals);
  const returningJan1 = amt(i.thisYearWithdrawals);
  const planned = amt(i.plannedDeposit);

  const roomNow = cumulativeAfterNonResidency - contributions + priorWithdrawals;
  const excess = Math.max(0, -roomNow);
  const recontributionWarning =
    eligible && returningJan1 > 0 && planned > 0 && planned >= roomNow - returningJan1;
  const plannedExcess = eligible && planned > 0 ? Math.max(0, planned - Math.max(0, roomNow)) : 0;

  const outcome: Outcome = !eligible
    ? "not_eligible"
    : roomNow < 0
      ? "over_contributed"
      : roomNow === 0
        ? "no_room"
        : "room_available";

  return {
    input: i,
    eligible,
    startYear,
    turned18Year,
    startReason,
    cumulative,
    nonResidentYears,
    nonResidentDeduction,
    cumulativeAfterNonResidency,
    contributions,
    priorWithdrawals,
    roomNow,
    excess,
    excessTaxMonthly: excessTaxPerMonth(excess),
    returningJan1,
    planned,
    recontributionWarning,
    plannedExcess,
    newThisYear: eligible && startYear === CURRENT_YEAR,
    turned18ThisYear: eligible && turned18Year === CURRENT_YEAR,
    arrivedThisYear: eligible && residencyYear === CURRENT_YEAR,
    allYearsNonResident: eligible && nonResidentYears.length === CURRENT_YEAR - startYear + 1,
    outcome,
  };
}

/** Spec section 2.4 worked example: Josie, eligible since 2020. */
export function josieExample(): CheckerInput {
  return {
    birthYear: 2002,
    residentLater: false,
    residencyYear: null,
    nonResidentYears: [],
    lifetimeContributions: 30_000,
    priorWithdrawals: 5_000,
    thisYearWithdrawals: 2_000,
    plannedDeposit: null,
    bestGuess: false,
  };
}
