/**
 * rrsp-room.ts: pure math for the RRSP contribution room calculator
 * (/calculators/rrsp-room). No DOM access; the page component, the results
 * renderer and the tests all call these functions.
 *
 * Two modes (RRSP room tracker spec):
 *   A "I have my CRA number": start from the deduction limit on your latest
 *     Notice of Assessment.
 *   B "Rebuild my limit": limit = A + B + R - C, where
 *       A = unused deduction room carried forward
 *       B = lesser of 18% of last year's earned income and the dollar
 *           limit, minus last year's pension adjustment
 *       R = pension adjustment reversal (PAR), C = net past service PA (PSPA)
 * Then, in both modes (the checkbook math, spec 2.2):
 *   room now = deduction limit - unused contributions already reported
 *              - contributions made since the statement
 * A first-60-days contribution counts against the year it is claimed for,
 * never both (spec 5.3). The tool never presents its number as CRA's.
 */

import { figure, type FigureLog } from "./figures";

/** Registry keys this calculator reads, in first-use order. */
export const rrspFigures: FigureLog = new Map();
const fig = <T>(file: string, key: string) => figure<T>(file, key, rrspFigures);
const RRSP = "rrsp-2026.json";

export const TAX_YEAR = 2026;
export const NEXT_YEAR = TAX_YEAR + 1;
export const DOLLAR_LIMIT = fig<number>(RRSP, "rrsp.cap.2026");
export const RATE = fig<number>(RRSP, "rrsp.rate");
export const BUFFER = fig<number>(RRSP, "rrsp.excess_buffer");
export const DEADLINE = fig<string>(RRSP, "rrsp.deadline.2026");
export const AGE_71_RULE = fig<string>(RRSP, "rrsp.age71");
/**
 * The 2027 dollar limit appears in the registry from seasonal research but
 * still needs CRA confirmation, so every use of it is labelled
 * "Not yet verified" (the spec: never pre-invent next year's limit).
 */
const CAP_HISTORY = fig<Record<string, number>>(RRSP, "rrsp.cap.history");
export const NEXT_DOLLAR_LIMIT_UNVERIFIED = CAP_HISTORY[String(NEXT_YEAR)] ?? null;

/** Earned income at which 18% reaches the dollar limit ($187,833). */
export const CAP_BINDS_AT = DOLLAR_LIMIT / RATE;
/** Spec 4: beyond the buffer, 1% a month on the excess. */
export const EXCESS_TAX_PER_MONTH = 0.01;
/** Spec 5.6: the $2,000 buffer does not apply under 18. */
export const BUFFER_MIN_AGE = 18;
/** Spec 5.9 / 7: age 71 or older routes out of the room math. */
export const CLOSED_AGE = 71;
/** Spec 7: "double-check that" thresholds (warnings, not blocks). */
export const ABSURD_EARNED = 50_000_000;
export const ABSURD_ROOM = 5_000_000;

export type Mode = "noa" | "rebuild";
export type ClaimYear = "this" | "next";

export interface RoomInput {
  mode: Mode;
  age: number | null;
  /** Spec 5.8: non-resident: earned income abroad creates no new room. */
  nonResident: boolean;
  /** Mode A: RRSP deduction limit from the NOA / Deduction Limit Statement. */
  deductionLimit: number | null;
  /** Mode B pieces. */
  unusedRoom: number | null;
  earnedIncome: number | null;
  pensionAdjustment: number | null;
  par: number | null;
  pspa: number | null;
  /** Both modes. */
  unusedContributions: number | null;
  /** Contributions since the statement, March to December of this year (incl. group and spousal). */
  contribSince: number | null;
  /** Contributions in the first 60 days of next year (January 1 to the deadline). */
  contribFirst60: number | null;
  first60ClaimYear: ClaimYear;
  /** Contributions without a date: counted against this year, with a nudge. */
  contribUndated: number | null;
  /** RRSP withdrawals this year (annotated only: the room is gone). */
  withdrawals: number | null;
  /** This year's earned income, for next year's new-room forecast (optional). */
  earnedThisYear: number | null;
  /** The user is guessing some figures (labelled on every result). */
  bestGuess: boolean;
}

/** Spec 2.4 worked example, Mode A: Nadia. */
export const NADIA: Readonly<RoomInput> = {
  mode: "noa",
  age: 32,
  nonResident: false,
  deductionLimit: 22_200,
  unusedRoom: 10_000,
  earnedIncome: 90_000,
  pensionAdjustment: 4_000,
  par: 0,
  pspa: 0,
  unusedContributions: 2_000,
  contribSince: 3_500,
  contribFirst60: 0,
  first60ClaimYear: "this",
  contribUndated: 0,
  withdrawals: 0,
  earnedThisYear: null,
  bestGuess: false,
};

/* ------------------------------------------------------------------ */
/* Mode B: the deduction-limit formula                                 */
/* ------------------------------------------------------------------ */

export interface LimitBreakdown {
  a: number;
  /** 18% of earned income. */
  eighteen: number;
  /** min(18%, dollar limit). */
  newRoomBeforePa: number;
  capBinds: boolean;
  pa: number;
  b: number;
  r: number;
  c: number;
  /** A + B + R - C before the zero floor. */
  raw: number;
  limit: number;
  /** The floor at zero kicked in (its rounding/flooring is not yet confirmed). */
  floored: boolean;
}

export function deductionLimit(p: {
  unusedRoom: number;
  earnedIncome: number;
  pensionAdjustment: number;
  par: number;
  pspa: number;
}): LimitBreakdown {
  const eighteen = RATE * p.earnedIncome;
  const newRoomBeforePa = Math.min(eighteen, DOLLAR_LIMIT);
  const b = newRoomBeforePa - p.pensionAdjustment;
  const raw = p.unusedRoom + b + p.par - p.pspa;
  return {
    a: p.unusedRoom,
    eighteen,
    newRoomBeforePa,
    capBinds: eighteen > DOLLAR_LIMIT,
    pa: p.pensionAdjustment,
    b,
    r: p.par,
    c: p.pspa,
    raw,
    limit: Math.max(0, raw),
    floored: raw < 0,
  };
}

/* ------------------------------------------------------------------ */
/* Room now                                                            */
/* ------------------------------------------------------------------ */

export const excessTaxPerMonth = (excess: number, age: number) =>
  Math.max(0, excess - (age < BUFFER_MIN_AGE ? 0 : BUFFER)) * EXCESS_TAX_PER_MONTH;

export type Outcome = "closed" | "room" | "full" | "over";

export type RoomFlag =
  | "cap_binds"
  | "pa_over_limit"
  | "non_resident"
  | "under_18"
  | "withdrawals"
  | "undated"
  | "first60_next_year"
  | "absurd"
  | "floored_unverified"
  | "best_guess";

export interface RoomResult {
  input: ResolvedRoomInput;
  outcome: Outcome;
  limit: number;
  breakdown: LimitBreakdown | null;
  /** Contributions counted against this year's limit (since + first-60 if claimed for this year + undated). */
  countedThisYear: number;
  /** First-60-days contributions set aside for next year's room. */
  countedNextYear: number;
  roomNow: number;
  /** Positive when over: how far past the limit. */
  excess: number;
  bufferApplies: boolean;
  /** Excess beyond the buffer, taxed at 1% a month. */
  taxableExcess: number;
  monthlyTax: number;
  /** Optional forecast of next year's new room before any pension adjustment. */
  nextYearNewRoom: number | null;
  flags: RoomFlag[];
}

export interface ResolvedRoomInput extends Omit<RoomInput, "age" | "deductionLimit" | "unusedRoom" | "earnedIncome" | "pensionAdjustment" | "par" | "pspa" | "unusedContributions" | "contribSince" | "contribFirst60" | "contribUndated" | "withdrawals"> {
  age: number;
  deductionLimit: number;
  unusedRoom: number;
  earnedIncome: number;
  pensionAdjustment: number;
  par: number;
  pspa: number;
  unusedContributions: number;
  contribSince: number;
  contribFirst60: number;
  contribUndated: number;
  withdrawals: number;
}

const z = (v: number | null) => (v === null || !Number.isFinite(v) ? 0 : Math.max(0, v));

export function resolve(i: RoomInput): ResolvedRoomInput {
  return {
    ...i,
    age: i.age ?? NADIA.age!,
    deductionLimit: z(i.deductionLimit),
    unusedRoom: z(i.unusedRoom),
    earnedIncome: z(i.earnedIncome),
    pensionAdjustment: z(i.pensionAdjustment),
    par: z(i.par),
    pspa: z(i.pspa),
    unusedContributions: z(i.unusedContributions),
    contribSince: z(i.contribSince),
    contribFirst60: z(i.contribFirst60),
    contribUndated: z(i.contribUndated),
    withdrawals: z(i.withdrawals),
  };
}

export function check(i: RoomInput): RoomResult {
  const r = resolve(i);
  const flags: RoomFlag[] = [];
  if (r.bestGuess) flags.push("best_guess");

  let breakdown: LimitBreakdown | null = null;
  let limit: number;
  if (r.mode === "rebuild") {
    // Spec 5.8: earned income while non-resident creates no new room.
    const earned = r.nonResident ? 0 : r.earnedIncome;
    breakdown = deductionLimit({ unusedRoom: r.unusedRoom, earnedIncome: earned, pensionAdjustment: r.pensionAdjustment, par: r.par, pspa: r.pspa });
    limit = breakdown.limit;
    if (breakdown.capBinds) flags.push("cap_binds");
    if (breakdown.floored) flags.push("floored_unverified");
    if (r.pensionAdjustment > DOLLAR_LIMIT) flags.push("pa_over_limit");
    if (r.earnedIncome > ABSURD_EARNED || r.unusedRoom > ABSURD_ROOM) flags.push("absurd");
  } else {
    limit = r.deductionLimit;
    if (limit > ABSURD_ROOM) flags.push("absurd");
  }
  if (r.nonResident) flags.push("non_resident");
  if (r.age < BUFFER_MIN_AGE) flags.push("under_18");
  if (r.withdrawals > 0) flags.push("withdrawals");
  if (r.contribUndated > 0) flags.push("undated");
  const first60ThisYear = r.first60ClaimYear === "this" ? r.contribFirst60 : 0;
  const countedNextYear = r.contribFirst60 - first60ThisYear;
  if (countedNextYear > 0) flags.push("first60_next_year");

  const countedThisYear = r.contribSince + first60ThisYear + r.contribUndated;
  const roomNow = limit - r.unusedContributions - countedThisYear;
  const excess = Math.max(0, -roomNow);
  const bufferApplies = r.age >= BUFFER_MIN_AGE;
  const taxableExcess = Math.max(0, excess - (bufferApplies ? BUFFER : 0));

  const nextYearNewRoom =
    i.earnedThisYear === null || !Number.isFinite(i.earnedThisYear) || r.nonResident
      ? null
      : Math.min(RATE * Math.max(0, i.earnedThisYear), NEXT_DOLLAR_LIMIT_UNVERIFIED ?? Infinity);

  const outcome: Outcome = r.age >= CLOSED_AGE ? "closed" : roomNow > 0.5 ? "room" : roomNow >= -0.5 ? "full" : "over";
  return {
    input: r,
    outcome,
    limit,
    breakdown,
    countedThisYear,
    countedNextYear,
    roomNow,
    excess,
    bufferApplies,
    taxableExcess,
    monthlyTax: taxableExcess * EXCESS_TAX_PER_MONTH,
    nextYearNewRoom,
    flags,
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type Field =
  | "age"
  | "deductionLimit"
  | "unusedRoom"
  | "earnedIncome"
  | "pensionAdjustment"
  | "par"
  | "pspa"
  | "unusedContributions"
  | "contribSince"
  | "contribFirst60"
  | "contribUndated"
  | "withdrawals"
  | "earnedThisYear";

export function validate(i: RoomInput): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  const a = i.age;
  if (a === null || !Number.isInteger(a) || a < 0 || a > 120) e.age = "Enter an age from 0 to 120.";
  if (i.mode === "noa" && i.deductionLimit === null) e.deductionLimit = "Enter the RRSP deduction limit from your Notice of Assessment.";
  const money: Field[] = [
    "deductionLimit", "unusedRoom", "earnedIncome", "pensionAdjustment", "par", "pspa",
    "unusedContributions", "contribSince", "contribFirst60", "contribUndated", "withdrawals", "earnedThisYear",
  ];
  for (const f of money) {
    const v = i[f as keyof RoomInput] as number | null;
    if (v === null) continue; // blank counts as $0
    if (!Number.isFinite(v) || v < 0) e[f] = "Enter $0 or more, or leave it blank.";
  }
  return e;
}
