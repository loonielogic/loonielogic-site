/**
 * cpp-timing.ts: pure math for the CPP timing calculator
 * (/calculators/cpp-timing). No DOM access; the page component and the tests
 * both call these functions.
 *
 * Timing factor (the legislated linear rule), m = months from 65:
 *   before 65: 1 - 0.6% x |m|    after 65: 1 + 0.7% x m    |m| capped at 60
 * Monthly(A)  = estimate at 65 x factor(A)
 * Lifetime(A) = monthly x 12 x (horizon - A)
 *
 * The tool compares start ages; it never picks one. Every constant comes from
 * the figure registry (cpp-2026.json, oas-gis-2026-q3.json) via figures.ts,
 * and the calculator keeps its own figure log so its sources footer lists
 * exactly the keys it reads.
 */

import { figure, type FigureLog } from "./figures";

const CPP = "cpp-2026.json";
const OAS = "oas-gis-2026-q3.json";

/** Registry keys this calculator reads, in first-use order. */
export const cppFigures: FigureLog = new Map();
const fig = <T>(file: string, key: string) => figure<T>(file, key, cppFigures);

/* ------------------------------------------------------------------ */
/* Registry constants                                                  */
/* ------------------------------------------------------------------ */

/** Figures are for 2026; every results figure is labelled with this year. */
export const FIGURE_YEAR = 2026;

type Adjustment = { per_month: number; max_months: number };
const EARLY = fig<Adjustment & { max_reduction: number }>(CPP, "cpp.early_reduction");
const LATE = fig<Adjustment & { max_boost: number }>(CPP, "cpp.late_boost");
/** Maximum monthly pension at 65, January 2026. */
export const MAX_AT_65 = fig<number>(CPP, "cpp.max_benefit_65");
/** Average new monthly pension (July 2026). */
export const AVERAGE_AT_65 = fig<number>(CPP, "cpp.average_new_benefit");
export const PRB_MAX = fig<number>(CPP, "cpp.post_retirement_max");
export const DROPOUT_BASE_YEARS = fig<number>(CPP, "cpp.dropout.base_years");
export const ENHANCED_BEST_YEARS = fig<number>(CPP, "cpp.dropout.enhanced_best_years");
export const CHILD_REARING_PROVISION = fig<boolean>(CPP, "cpp.child_rearing_provision");
export const PRB_STOP_AGE = fig<number>(CPP, "cpp.prb.stop_age");
const NO_BENEFIT_PAST_70 = fig<boolean>(CPP, "cpp.timing.no_benefit_past_70");
export const SURVIVOR_CAP_RULE = fig<string>(CPP, "cpp.survivor.combined_cap_rule");
export const SURVIVOR_MAX_65 = fig<number>(CPP, "cpp.survivor.max_65_plus");
export const OAS_DEFERRAL = fig<Adjustment & { max_boost: number }>(OAS, "oas.deferral.q3_2026");
export const OAS_THRESHOLD = fig<number>(OAS, "oas.recovery_tax.threshold.2026");
export const OAS_RATE = fig<number>(OAS, "oas.recovery_tax.rate");

export const EARLY_PER_MONTH = EARLY.per_month;
export const LATE_PER_MONTH = LATE.per_month;
export const MAX_REDUCTION = EARLY.max_reduction;
export const MAX_BOOST = LATE.max_boost;

export const STANDARD_AGE = 65;
export const EARLIEST_AGE = STANDARD_AGE - EARLY.max_months / 12;
export const LATEST_AGE = STANDARD_AGE + LATE.max_months / 12;
/** The classic three start ages the tool compares. */
export const CLASSIC_AGES = [EARLIEST_AGE, STANDARD_AGE, LATEST_AGE] as const;

if (EARLIEST_AGE !== 60 || LATEST_AGE !== 70) throw new Error("CPP start-age window is no longer 60 to 70");
if (!NO_BENEFIT_PAST_70) throw new Error("cpp.timing.no_benefit_past_70 no longer holds");
if (Math.abs(EARLY.per_month * EARLY.max_months - EARLY.max_reduction) > 1e-9) {
  throw new Error("cpp.early_reduction per-month rate disagrees with its maximum");
}
if (Math.abs(LATE.per_month * LATE.max_months - LATE.max_boost) > 1e-9) {
  throw new Error("cpp.late_boost per-month rate disagrees with its maximum");
}

/** Input bounds (spec section 7). */
export const AGE_MIN = 18;
export const AGE_SPECULATIVE_BELOW = 45;
export const AGE_MAX = LATEST_AGE;
export const HORIZON_MIN = 75;
export const HORIZON_MAX = 100;
export const HORIZON_PRESETS = [80, 85, 90, 95] as const;
export const CHILD_YEARS_MAX = 15;
export const RETURN_MAX = 0.1;
export const RETURN_OPTIMISTIC_ABOVE = 0.08;
export const DEFAULT_RETURN = 0.05;
/** Chart range: lifetime totals from 60 to 100. */
export const CHART_FROM = EARLIEST_AGE;
export const CHART_TO = HORIZON_MAX;

/** Retraite Quebec's own QPP start-age factors have not been checked for this tool. */
export const QPP_FACTORS_STATUS = "needs_reverification" as const;

/* ------------------------------------------------------------------ */
/* Core math                                                           */
/* ------------------------------------------------------------------ */

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Legislated timing factor for a whole start age from 60 to 70. */
export function timingFactor(age: number): number {
  if (!Number.isInteger(age) || age < EARLIEST_AGE || age > LATEST_AGE) {
    throw new Error(`start age must be a whole year from ${EARLIEST_AGE} to ${LATEST_AGE}`);
  }
  const m = (age - STANDARD_AGE) * 12;
  return round6(m < 0 ? 1 - EARLY.per_month * Math.min(-m, EARLY.max_months) : 1 + LATE.per_month * Math.min(m, LATE.max_months));
}

/** Start age -> factor, 60 to 70. */
export const FACTORS: Readonly<Record<number, number>> = Object.fromEntries(
  Array.from({ length: LATEST_AGE - EARLIEST_AGE + 1 }, (_, k) => [EARLIEST_AGE + k, timingFactor(EARLIEST_AGE + k)]),
);

export const monthlyAt = (est65: number, age: number) => est65 * timingFactor(age);
export const annualAt = (est65: number, age: number) => monthlyAt(est65, age) * 12;

/** Nominal total received from the start age up to the horizon age. */
export function lifetimeTo(est65: number, age: number, horizon: number): number {
  return annualAt(est65, age) * Math.max(0, horizon - age);
}

/**
 * Age at which starting later catches up with starting earlier. The estimate
 * cancels out, so the answer is the same for every benefit size:
 * fa(x - a) = fb(x - b)  ->  x = (fb b - fa a) / (fb - fa).
 */
export function breakevenAge(early: number, late: number): number {
  const fa = timingFactor(early);
  const fb = timingFactor(late);
  return (fb * late - fa * early) / (fb - fa);
}

export interface Breakeven {
  early: number;
  late: number;
  /** Exact crossing age. */
  age: number;
  /** Years after the earlier start age. */
  yearsAfterEarly: number;
}

function breakeven(early: number, late: number): Breakeven {
  const age = breakevenAge(early, late);
  return { early, late, age, yearsAfterEarly: age - early };
}

/** The fixed reference points (spec section 3.3): 65 vs 60, 70 vs 65, 70 vs 60. */
export const BREAKEVENS: readonly Breakeven[] = [
  breakeven(EARLIEST_AGE, STANDARD_AGE),
  breakeven(STANDARD_AGE, LATEST_AGE),
  breakeven(EARLIEST_AGE, LATEST_AGE),
];

/** Annual return -> the equivalent monthly rate (the annual figure compounds monthly). */
export const monthlyRate = (annualReturn: number) => Math.pow(1 + annualReturn, 1 / 12) - 1;

/**
 * Future value of investing `payment` at the end of each month for `months`
 * months, compounding monthly at the equivalent of `annualReturn` a year.
 */
export function investedPot(payment: number, annualReturn: number, months: number): number {
  const r = monthlyRate(annualReturn);
  if (r === 0) return payment * months;
  return payment * ((Math.pow(1 + r, months) - 1) / r);
}

/* ------------------------------------------------------------------ */
/* Inputs and validation                                               */
/* ------------------------------------------------------------------ */

export type StillWorking = "yes" | "no" | "unsure";

export interface CppInput {
  currentAge: number | null;
  /** Estimated monthly CPP (or QPP) at 65, in today's dollars. */
  est65: number | null;
  /** Illustrative planning horizon ("plan to age"). */
  horizon: number | null;
  stillWorking: StillWorking;
  childRearingYears: number | null;
  /** Other expected annual retirement income; feeds the OAS flag only. */
  otherIncome: number | null;
  invest: boolean;
  /** Annual return as a fraction (0.05 = 5%). */
  investReturn: number | null;
  quebec: boolean;
  survivor: boolean;
  separation: boolean;
  disability: boolean;
}

export type Field = "currentAge" | "est65" | "horizon" | "childRearingYears" | "otherIncome" | "investReturn";

export interface Validation {
  /** Hard blocks, by field. */
  errors: Partial<Record<Field, string>>;
  /** Soft notes; the tool still runs. */
  warnings: Partial<Record<Field, string>>;
}

export const NO_ESTIMATE_MESSAGE =
  "With no CPP contributions there is no timing decision. The tool needs an estimate above $0.";
export const HORIZON_BLOCK_MESSAGE = `Plan to an age after you start collecting: pick a planning age from ${HORIZON_MIN} to ${HORIZON_MAX}.`;
export const CAPPED_MESSAGE = `Capped at the ${FIGURE_YEAR} maximum; almost nobody gets this.`;
export const SPECULATIVE_MESSAGE = "Estimates this far out are speculative. The tool still runs.";
export const HORIZON_CLAMP_MESSAGE = `Capped at ${HORIZON_MAX}, the end of the chart.`;
export const OPTIMISTIC_MESSAGE = "Above long-run equity averages: the gap-closing math gets optimistic fast.";

const finite = (v: number | null): v is number => v !== null && Number.isFinite(v);

export function defaultInput(): CppInput {
  return {
    currentAge: 58,
    est65: 877,
    horizon: 90,
    stillWorking: "unsure",
    childRearingYears: 0,
    otherIncome: 0,
    invest: false,
    investReturn: DEFAULT_RETURN,
    quebec: false,
    survivor: false,
    separation: false,
    disability: false,
  };
}

export function validate(i: CppInput): Validation {
  const errors: Validation["errors"] = {};
  const warnings: Validation["warnings"] = {};

  const age = i.currentAge;
  if (!finite(age) || !Number.isInteger(age)) {
    errors.currentAge = "Enter an age in whole years.";
  } else if (age > AGE_MAX) {
    errors.currentAge = `CPP stops growing at ${LATEST_AGE}, so past ${LATEST_AGE} there is no start age left to compare.`;
  } else if (age < AGE_MIN) {
    errors.currentAge = `Enter an age from ${AGE_MIN} to ${AGE_MAX}.`;
  } else if (age < AGE_SPECULATIVE_BELOW) {
    warnings.currentAge = SPECULATIVE_MESSAGE;
  }

  const est = i.est65;
  if (!finite(est) || est < 0) errors.est65 = "Enter an estimate of $0 or more.";
  else if (est === 0) errors.est65 = NO_ESTIMATE_MESSAGE;
  else if (est > MAX_AT_65) warnings.est65 = CAPPED_MESSAGE;

  const h = i.horizon;
  if (!finite(h) || !Number.isInteger(h)) errors.horizon = "Enter a planning age in whole years.";
  else if (h <= LATEST_AGE) errors.horizon = HORIZON_BLOCK_MESSAGE;
  else if (h < HORIZON_MIN) errors.horizon = `Pick a planning age from ${HORIZON_MIN} to ${HORIZON_MAX}.`;
  else if (h > HORIZON_MAX) warnings.horizon = HORIZON_CLAMP_MESSAGE;

  const kids = i.childRearingYears;
  if (kids !== null && (!Number.isFinite(kids) || !Number.isInteger(kids) || kids < 0 || kids > CHILD_YEARS_MAX)) {
    errors.childRearingYears = `Enter whole years from 0 to ${CHILD_YEARS_MAX}.`;
  }

  const other = i.otherIncome;
  if (other !== null && (!Number.isFinite(other) || other < 0)) errors.otherIncome = "Enter an amount of $0 or more.";

  if (i.invest) {
    const r = i.investReturn;
    if (!finite(r) || r < 0 || r > RETURN_MAX + 1e-9) errors.investReturn = `Enter a return from 0% to ${RETURN_MAX * 100}%.`;
    else if (r > RETURN_OPTIMISTIC_ABOVE + 1e-9) warnings.investReturn = OPTIMISTIC_MESSAGE;
  }

  return { errors, warnings };
}

export const isValid = (i: CppInput) => Object.keys(validate(i).errors).length === 0;

/* ------------------------------------------------------------------ */
/* The comparison                                                      */
/* ------------------------------------------------------------------ */

export interface Column {
  startAge: number;
  /** True when this column is "start now" (current age 60 or over). */
  startNow: boolean;
  factor: number;
  monthly: number;
  annual: number;
  lifetime: number;
  /** CPP at this start age plus other income, per year. */
  incomeWithOther: number;
  /** Over the OAS recovery-tax threshold. */
  overOasThreshold: boolean;
}

export interface Crossing {
  early: number;
  late: number;
  age: number;
  /** Cumulative total at the crossing (both lines meet here). */
  total: number;
}

export interface InvestResult {
  startAge: number;
  months: number;
  payment: number;
  annualReturn: number;
  monthlyRate: number;
  pot: number;
  /** Monthly gap between starting at 65 and the earlier start. */
  gap: number;
  /** Years the pot covers the gap, ignoring further growth. */
  yearsCovered: number;
}

export interface CppResult {
  input: CppInput;
  est65: number;
  capped: boolean;
  horizon: number;
  horizonClamped: boolean;
  currentAge: number;
  /** Current age is 60 or over: the earliest column means "start now". */
  startNow: boolean;
  columns: Column[];
  /** Start ages sorted by lifetime total to the horizon, largest first. */
  ranking: number[];
  winner: number;
  /** Crossings between the columns' cumulative lines inside 60 to 100. */
  crossings: Crossing[];
  /** Null when the toggle is off or the earliest start is 65 or later. */
  invest: InvestResult | null;
  investUnavailable: boolean;
  otherIncome: number;
  childRearingYears: number;
  anyOverOasThreshold: boolean;
  speculative: boolean;
  showPrb: boolean;
  optimisticReturn: boolean;
}

/** The start ages to compare: the classic three, from the current age on. */
export function startAges(currentAge: number): number[] {
  const now = Math.min(Math.max(currentAge, EARLIEST_AGE), LATEST_AGE);
  return [...new Set([now, ...CLASSIC_AGES.filter((a) => a > now)])];
}

export function compute(i: CppInput): CppResult {
  const rawEst = finite(i.est65) ? i.est65 : 0;
  const est65 = Math.min(Math.max(rawEst, 0), MAX_AT_65);
  const rawHorizon = finite(i.horizon) ? i.horizon : 90;
  const horizon = Math.min(rawHorizon, HORIZON_MAX);
  const currentAge = finite(i.currentAge) ? i.currentAge : 58;
  const otherIncome = finite(i.otherIncome) && i.otherIncome > 0 ? i.otherIncome : 0;
  const childRearingYears = finite(i.childRearingYears) && i.childRearingYears > 0 ? i.childRearingYears : 0;
  const startNow = currentAge >= EARLIEST_AGE;

  const columns: Column[] = startAges(currentAge).map((startAge, k) => {
    const factor = timingFactor(startAge);
    const monthly = est65 * factor;
    const annual = monthly * 12;
    const incomeWithOther = annual + otherIncome;
    return {
      startAge,
      startNow: startNow && k === 0,
      factor,
      monthly,
      annual,
      lifetime: annual * Math.max(0, horizon - startAge),
      incomeWithOther,
      overOasThreshold: incomeWithOther > OAS_THRESHOLD,
    };
  });

  const ranking = [...columns].sort((a, b) => b.lifetime - a.lifetime || a.startAge - b.startAge).map((c) => c.startAge);

  const crossings: Crossing[] = [];
  for (let a = 0; a < columns.length; a++) {
    for (let b = a + 1; b < columns.length; b++) {
      const early = columns[a].startAge;
      const late = columns[b].startAge;
      const age = breakevenAge(early, late);
      if (age >= CHART_FROM && age <= CHART_TO) {
        crossings.push({ early, late, age, total: columns[a].annual * (age - early) });
      }
    }
  }

  const first = columns[0];
  const investUnavailable = i.invest && first.startAge >= STANDARD_AGE;
  let invest: InvestResult | null = null;
  if (i.invest && !investUnavailable) {
    const annualReturn = finite(i.investReturn) ? Math.min(Math.max(i.investReturn, 0), RETURN_MAX) : DEFAULT_RETURN;
    const months = (STANDARD_AGE - first.startAge) * 12;
    const pot = investedPot(first.monthly, annualReturn, months);
    const gap = est65 - first.monthly;
    invest = {
      startAge: first.startAge,
      months,
      payment: first.monthly,
      annualReturn,
      monthlyRate: monthlyRate(annualReturn),
      pot,
      gap,
      yearsCovered: gap > 0 ? pot / gap / 12 : Infinity,
    };
  }

  return {
    input: i,
    est65,
    capped: rawEst > MAX_AT_65,
    horizon,
    horizonClamped: rawHorizon > HORIZON_MAX,
    currentAge,
    startNow,
    columns,
    ranking,
    winner: ranking[0],
    crossings,
    invest,
    investUnavailable,
    otherIncome,
    childRearingYears,
    anyOverOasThreshold: columns.some((c) => c.overOasThreshold),
    speculative: currentAge < AGE_SPECULATIVE_BELOW,
    showPrb: i.stillWorking !== "no",
    optimisticReturn: i.invest && finite(i.investReturn) && i.investReturn > RETURN_OPTIMISTIC_ABOVE + 1e-9,
  };
}

/* ------------------------------------------------------------------ */
/* Chart data                                                          */
/* ------------------------------------------------------------------ */

export interface ChartSeries {
  startAge: number;
  startNow: boolean;
  /** Cumulative nominal total at each whole age from CHART_FROM to CHART_TO. */
  points: { age: number; total: number }[];
}

export function chartSeries(r: CppResult): ChartSeries[] {
  return r.columns.map((c) => ({
    startAge: c.startAge,
    startNow: c.startNow,
    points: Array.from({ length: CHART_TO - CHART_FROM + 1 }, (_, k) => {
      const age = CHART_FROM + k;
      return { age, total: c.annual * Math.max(0, age - c.startAge) };
    }),
  }));
}

export function columnLabel(c: Pick<Column, "startAge" | "startNow">): string {
  return c.startNow ? `Start now (${c.startAge})` : `Start at ${c.startAge}`;
}

/** CSV of the chart lines: one row per age, whole dollars, nominal. */
export function chartCsv(r: CppResult): string {
  const series = chartSeries(r);
  const head = ["Age", ...series.map((s) => `${columnLabel(s)}: cumulative CAD (nominal; ${FIGURE_YEAR} CPP figures)`)];
  const rows = series[0].points.map((p, k) => [String(p.age), ...series.map((s) => String(Math.round(s.points[k].total)))]);
  return [head, ...rows].map((row) => row.map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ */
/* Worked examples (spec section 3.4 and 3.5)                          */
/* ------------------------------------------------------------------ */

export interface WorkedExample {
  label: string;
  est65: number;
  rows: { age: number; monthly: number; annual: number; lifetime: number }[];
}

export const WORKED_HORIZON = 90;

export function workedExample(label: string, est65: number): WorkedExample {
  return {
    label,
    est65,
    rows: CLASSIC_AGES.map((age) => ({
      age,
      monthly: monthlyAt(est65, age),
      annual: annualAt(est65, age),
      lifetime: lifetimeTo(est65, age, WORKED_HORIZON),
    })),
  };
}

export const WORKED_EXAMPLES: readonly WorkedExample[] = [
  workedExample(`${FIGURE_YEAR} maximum`, MAX_AT_65),
  workedExample(`${FIGURE_YEAR} average new pension`, AVERAGE_AT_65),
];

/** Spec 3.5: average CPP taken at 60, every cheque invested at 5% until 65. */
export const WORKED_INVEST = (() => {
  const payment = monthlyAt(AVERAGE_AT_65, EARLIEST_AGE);
  const months = (STANDARD_AGE - EARLIEST_AGE) * 12;
  const pot = investedPot(payment, DEFAULT_RETURN, months);
  const gap = AVERAGE_AT_65 - payment;
  return { payment, months, annualReturn: DEFAULT_RETURN, pot, gap, yearsCovered: pot / gap / 12 };
})();

/* ------------------------------------------------------------------ */
/* Analytics tokens (class tokens only; see src/lib/analytics.ts)      */
/* ------------------------------------------------------------------ */

export const ANALYTICS_CALC = "cpp_timing";

/** calc_result_viewed outcome: which start age adds up to the most by the horizon. */
export function outcomeToken(r: CppResult): string {
  const w = r.columns.find((c) => c.startAge === r.winner)!;
  return w.startNow ? "most_by_horizon_start_now" : `most_by_horizon_${w.startAge}`;
}

/** calc_input_set value tokens (field rolled into the value: 2-prop budget). */
export const inputToken = {
  stillWorking: (v: StillWorking) => `still_working_${v}`,
  toggle: (name: "invest" | "quebec" | "survivor" | "separation" | "disability", on: boolean) => `${name}_${on ? "on" : "off"}`,
};

/** calc_assumption_changed field tokens. */
export const ASSUMPTION_FIELDS = { horizon: "planning_horizon", investReturn: "invest_return" } as const;
