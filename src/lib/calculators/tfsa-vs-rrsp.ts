/**
 * tfsa-vs-rrsp.ts: pure math for the TFSA vs RRSP decision tool
 * (/calculators/tfsa-vs-rrsp). No DOM access; the page component, the
 * results renderer and the tests all call these functions.
 *
 * The decision rule (calculator spec section 2):
 *   M_now  = marginal rate today (income tax engine, province of residence)
 *   M_then = marginal rate on retirement income, plus the 15% OAS recovery
 *            tax when retirement income is above the threshold
 *   RRSP after tax = C x growth x (1 - M_then)
 *   TFSA after tax = C x (1 - M_now) x growth
 * Equal rates give identical results; within 3 points it is a tie and the
 * TFSA wins on flexibility. The six quiz questions (quiz spec) run first,
 * in the order that keeps the edge cases consistent with the spec: match,
 * first home, money needed early, then the rate comparison.
 *
 * The spec's v1 limited full provincial tables to ON, BC and AB; this build
 * reuses the income tax calculator's verified tables for all 13.
 */

import { figure, type FigureLog } from "./figures";
import {
  FEDERAL_BRACKETS,
  OAS_RATE,
  OAS_THRESHOLD,
  marginalRate,
  type Prov,
} from "./income-tax";

/** Registry keys this tool reads directly, in first-use order. */
export const decisionFigures: FigureLog = new Map();
const fig = <T>(file: string, key: string) => figure<T>(file, key, decisionFigures);

export const TFSA_ANNUAL = fig<number>("tfsa-2026.json", "tfsa.annual_limit.2026");
export const TFSA_CUMULATIVE = fig<number>("tfsa-2026.json", "tfsa.cumulative_max.2026");
export const RRSP_CAP = fig<number>("rrsp-2026.json", "rrsp.cap.2026");
export const RRSP_DEADLINE = fig<string>("rrsp-2026.json", "rrsp.deadline.2026");
export const RRSP_BUFFER = fig<number>("rrsp-2026.json", "rrsp.excess_buffer");
export const RRSP_WITHHOLDING = fig<{ up_to_5000: number; from_5001_to_15000: number; above_15000: number }>(
  "rrsp-2026.json",
  "rrsp.withholding",
);
export const HBP_LIMIT = fig<number>("fhsa-hbp-2026.json", "hbp.limit.2026");
export const HBP_REPAY_YEARS = fig<{ years: number }>("fhsa-hbp-2026.json", "hbp.repayment_period").years;
export const FHSA_ANNUAL = fig<number>("fhsa-hbp-2026.json", "fhsa.annual_limit");
export const FHSA_LIFETIME = fig<number>("fhsa-hbp-2026.json", "fhsa.lifetime_limit");
// OAS recovery threshold and rate come through the income tax module (same registry keys).
fig("oas-gis-2026-q3.json", "oas.recovery_tax.threshold.2026");
fig("oas-gis-2026-q3.json", "oas.recovery_tax.rate");

/** Spec 2: within this many points the accounts tie and the TFSA wins on flexibility. */
export const TIE_BAND = 0.03;
/** Spec 3, "estimate for me": retirement income as a share of today's (60 to 70%; midpoint). */
export const REPLACEMENT_RATIO = 0.65;
/** Spec 5.3: the lowest federal band is where an RRSP deduction is worth least. */
export const LOWEST_BAND_TOP = FEDERAL_BRACKETS[0].upper!;
/** Spec 5.10: the RRSP closes after the year you turn 71. */
export const RRSP_LAST_AGE = 71;
export const TFSA_MIN_AGE = 18;
export const PLAUSIBLE_INCOME = 5_000_000;
export const HORIZON_MAX = 50;
export const DEFAULT_RETURN = 0.05;
export const RETURN_MAX = 0.15;

export interface DecisionInput {
  province: Prov;
  income: number | null;
  /** null with estimateRetirement = use REPLACEMENT_RATIO. */
  retirementIncome: number | null;
  estimateRetirement: boolean;
  amount: number | null;
  years: number | null;
  age: number | null;
  /** Quiz Q1. */
  employerMatch: boolean;
  /** Quiz Q2. */
  homeSoon: boolean;
  /** Quiz Q5 (asked third here). */
  mayNeedEarly: boolean;
  /** Spec 5.7. */
  expectGis: boolean;
  /** Spec 5.8. */
  spouseEarnsLess: boolean;
  /** Spec 5.12. */
  selfEmployed: boolean;
  /** Spec 5.13. */
  leavingCanada: boolean;
  /** Blank = assume enough room. */
  tfsaRoom: number | null;
  rrspRoom: number | null;
  expectedReturn: number | null;
}

export const DEFAULT_INPUT: Readonly<DecisionInput> = {
  province: "ON",
  income: 95_000,
  retirementIncome: 55_000,
  estimateRetirement: false,
  amount: 5_000,
  years: 30,
  age: 35,
  employerMatch: false,
  homeSoon: false,
  mayNeedEarly: false,
  expectGis: false,
  spouseEarnsLess: false,
  selfEmployed: false,
  leavingCanada: false,
  tfsaRoom: null,
  rrspRoom: null,
  expectedReturn: DEFAULT_RETURN,
};

/* ------------------------------------------------------------------ */
/* Rates and values                                                    */
/* ------------------------------------------------------------------ */

export interface Rates {
  now: number;
  /** Income tax only, before the OAS recovery tax. */
  thenTax: number;
  /** The OAS recovery tax added at withdrawal (0 or OAS_RATE). */
  oas: number;
  then: number;
}

export function rates(income: number, retirementIncome: number, prov: Prov): Rates {
  const now = marginalRate(income, prov);
  const thenTax = marginalRate(retirementIncome, prov);
  const oas = retirementIncome > OAS_THRESHOLD ? OAS_RATE : 0;
  return { now, thenTax, oas, then: thenTax + oas };
}

export interface Values {
  growth: number;
  rrsp: number;
  tfsa: number;
  /** RRSP minus TFSA: positive means the RRSP leaves more. */
  difference: number;
}

/** After-tax value of the same pre-tax dollars in each account at the horizon. */
export function values(amount: number, years: number, annualReturn: number, r: Rates): Values {
  const growth = Math.pow(1 + annualReturn, years);
  const rrsp = amount * growth * (1 - r.then);
  const tfsa = amount * (1 - r.now) * growth;
  return { growth, rrsp, tfsa, difference: rrsp - tfsa };
}

/* ------------------------------------------------------------------ */
/* The decision                                                        */
/* ------------------------------------------------------------------ */

export type Account = "tfsa" | "rrsp";

export type Reason =
  | "rrsp_closed"
  | "need_early"
  | "gis"
  | "low_bracket"
  | "peak_earning"
  | "higher_later"
  | "oas"
  | "tie";

export type QuizId = "match" | "home" | "early" | "peak" | "later" | "oas";

export interface QuizAnswer {
  id: QuizId;
  question: string;
  answer: "yes" | "no";
  /** Where the answer came from. */
  from: "you" | "numbers";
  /** True for the question that settled the verdict. */
  decided: boolean;
}

export type Flag =
  | "match_first"
  | "home_fhsa"
  | "spousal"
  | "self_employed"
  | "leaving_canada"
  | "last_rrsp_year"
  | "under_18"
  | "over_combined_room"
  | "over_tfsa_room"
  | "over_rrsp_room"
  | "implausible_income"
  | "estimated_retirement";

export interface Flip {
  /** The retirement income at which the rate comparison changes answer. */
  retirementIncome: number;
  to: "rrsp" | "tfsa" | "tie";
}

export interface Decision {
  input: ResolvedInput;
  account: Account;
  reason: Reason;
  /** Spec 5.1: capture the match in the RRSP first, then this account. */
  matchFirst: boolean;
  /** Spec 5.2: first home within ~15 years: the FHSA comes first. */
  homeFirst: boolean;
  /** Spec 5.9: the recommended account has no room. */
  noRoom: boolean;
  rates: Rates;
  values: Values;
  /** What the rate comparison alone says. */
  mathAccount: "rrsp" | "tfsa" | "tie";
  quiz: QuizAnswer[];
  flips: Flip[];
  flags: Flag[];
}

export interface ResolvedInput extends Omit<DecisionInput, "income" | "retirementIncome" | "amount" | "years" | "age" | "expectedReturn"> {
  income: number;
  retirementIncome: number;
  amount: number;
  years: number;
  age: number;
  expectedReturn: number;
}

export function resolve(i: DecisionInput): ResolvedInput {
  const income = Math.max(0, i.income ?? 0);
  const retirementIncome = i.estimateRetirement || i.retirementIncome === null
    ? Math.round(income * REPLACEMENT_RATIO)
    : Math.max(0, i.retirementIncome);
  return {
    ...i,
    income,
    retirementIncome,
    amount: Math.max(0, i.amount ?? 0),
    years: i.years ?? 0,
    age: i.age ?? DEFAULT_INPUT.age!,
    expectedReturn: i.expectedReturn ?? DEFAULT_RETURN,
  };
}

/** The rate comparison alone: more than 3 points apart decides it, else a tie. */
export function mathVerdict(r: Rates): "rrsp" | "tfsa" | "tie" {
  if (r.now - r.then > TIE_BAND + 1e-9) return "rrsp";
  if (r.then - r.now > TIE_BAND + 1e-9) return "tfsa";
  return "tie";
}

export const QUIZ_TEXT: Record<QuizId, string> = {
  match: "Does your employer match RRSP contributions?",
  home: "Is this money for a first home within ~15 years?",
  early: "Might you need this money before retirement?",
  peak: "Is your income today in your peak-earning years?",
  later: "Is your income likely to be higher in retirement than today?",
  oas: "Will your retirement income exceed ~$95,000?",
};

/**
 * Where the rate comparison flips as retirement income changes: the nearest
 * change below and above the user's figure, scanning $0 to $400,000 in
 * $1,000 steps.
 */
export function flips(income: number, retirementIncome: number, prov: Prov): Flip[] {
  const now = mathVerdict(rates(income, retirementIncome, prov));
  const out: Flip[] = [];
  const STEP = 1_000;
  const start = Math.round(retirementIncome / STEP) * STEP;
  for (let x = start - STEP; x >= 0; x -= STEP) {
    const v = mathVerdict(rates(income, x, prov));
    if (v !== now) { out.push({ retirementIncome: x, to: v }); break; }
  }
  for (let x = start + STEP; x <= 400_000; x += STEP) {
    const v = mathVerdict(rates(income, x, prov));
    if (v !== now) { out.push({ retirementIncome: x, to: v }); break; }
  }
  return out;
}

export function decide(i: DecisionInput): Decision {
  const r = resolve(i);
  const rt = rates(r.income, r.retirementIncome, r.province);
  const v = values(r.amount, r.years, r.expectedReturn, rt);
  const math = mathVerdict(rt);
  const flags: Flag[] = [];

  const answers: Record<QuizId, boolean> = {
    match: r.employerMatch,
    home: r.homeSoon,
    early: r.mayNeedEarly || r.years === 0,
    peak: math === "rrsp",
    later: math === "tfsa" || r.income <= LOWEST_BAND_TOP,
    oas: r.retirementIncome > OAS_THRESHOLD,
  };

  let account: Account;
  let reason: Reason;
  let decidedBy: QuizId | null;
  if (r.age > RRSP_LAST_AGE) {
    account = "tfsa"; reason = "rrsp_closed"; decidedBy = null;
  } else if (answers.early) {
    account = "tfsa"; reason = "need_early"; decidedBy = "early";
  } else if (r.expectGis) {
    account = "tfsa"; reason = "gis"; decidedBy = null;
  } else if (r.income <= LOWEST_BAND_TOP) {
    account = "tfsa"; reason = "low_bracket"; decidedBy = "later";
  } else if (math === "rrsp") {
    account = "rrsp"; reason = "peak_earning"; decidedBy = "peak";
  } else if (math === "tfsa") {
    account = "tfsa"; reason = rt.oas > 0 && rt.then - rt.oas - rt.now <= TIE_BAND ? "oas" : "higher_later";
    decidedBy = reason === "oas" ? "oas" : "later";
  } else {
    account = "tfsa"; reason = "tie"; decidedBy = null;
  }

  const matchFirst = r.employerMatch && r.age <= RRSP_LAST_AGE;
  const homeFirst = r.homeSoon;
  if (matchFirst) flags.push("match_first");
  if (homeFirst) flags.push("home_fhsa");
  if (account === "rrsp" && r.spouseEarnsLess) flags.push("spousal");
  if (r.selfEmployed) flags.push("self_employed");
  if (r.leavingCanada) flags.push("leaving_canada");
  if (r.age === RRSP_LAST_AGE) flags.push("last_rrsp_year");
  if (r.age < TFSA_MIN_AGE) flags.push("under_18");
  if (r.amount > TFSA_ANNUAL + RRSP_CAP) flags.push("over_combined_room");
  if (r.tfsaRoom !== null && r.tfsaRoom > 0 && account === "tfsa" && r.amount > r.tfsaRoom) flags.push("over_tfsa_room");
  if (r.rrspRoom !== null && r.rrspRoom > 0 && account === "rrsp" && r.amount > r.rrspRoom) flags.push("over_rrsp_room");
  if (r.income > PLAUSIBLE_INCOME || r.retirementIncome > PLAUSIBLE_INCOME) flags.push("implausible_income");
  if (r.estimateRetirement || i.retirementIncome === null) flags.push("estimated_retirement");

  const room = account === "tfsa" ? r.tfsaRoom : r.rrspRoom;
  const noRoom = room !== null && room <= 0;

  // Quiz trail in the order asked; the deciding question is the first that applied.
  const order: QuizId[] = ["match", "home", "early", "peak", "later", "oas"];
  const quiz: QuizAnswer[] = order.map((id) => ({
    id,
    question: QUIZ_TEXT[id],
    answer: answers[id] ? "yes" : "no",
    from: id === "match" || id === "home" ? "you" : id === "early" ? (r.years === 0 && !r.mayNeedEarly ? "numbers" : "you") : "numbers",
    decided: id === decidedBy,
  }));

  return {
    input: r,
    account,
    reason,
    matchFirst,
    homeFirst,
    noRoom,
    rates: rt,
    values: v,
    mathAccount: math,
    quiz,
    flips: flips(r.income, r.retirementIncome, r.province),
    flags,
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type Field = "income" | "retirementIncome" | "amount" | "years" | "age" | "tfsaRoom" | "rrspRoom" | "expectedReturn";

export function validate(i: DecisionInput): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  const nonNeg = (v: number | null) => v !== null && Number.isFinite(v) && v >= 0;
  if (!nonNeg(i.income)) e.income = "Enter your income this year, $0 or more.";
  if (!i.estimateRetirement && i.retirementIncome !== null && !nonNeg(i.retirementIncome)) {
    e.retirementIncome = "Enter a retirement income of $0 or more, or tick \"estimate it for me\".";
  }
  if (i.amount === null || !Number.isFinite(i.amount) || i.amount <= 0) e.amount = "Enter an amount above $0 to compare.";
  const y = i.years;
  if (y === null || !Number.isInteger(y) || y < 0 || y > HORIZON_MAX) e.years = `Pick a whole number of years from 0 to ${HORIZON_MAX}.`;
  const a = i.age;
  if (a === null || !Number.isInteger(a) || a < 0 || a > 120) e.age = "Enter an age from 0 to 120.";
  for (const [field, v] of [["tfsaRoom", i.tfsaRoom], ["rrspRoom", i.rrspRoom]] as const) {
    if (v !== null && !nonNeg(v)) e[field] = "Enter room of $0 or more, or leave it blank.";
  }
  const r = i.expectedReturn;
  if (r === null || !Number.isFinite(r) || r < 0 || r > RETURN_MAX) e.expectedReturn = `Enter a yearly return from 0% to ${RETURN_MAX * 100}%.`;
  return e;
}
