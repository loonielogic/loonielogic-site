/**
 * income-tax.ts: pure math for the Canadian Income Tax Calculator
 * (/calculators/income-tax-calculator). No DOM access; the page component,
 * the results renderer and the tests all call these functions. The TFSA vs
 * RRSP tool reuses incomeTax() for its marginal rates.
 *
 * Spec v1 (income-tax-estimator spec, figures verified 2026-09-27):
 *   taxable  = all income - RRSP - FHSA - union/professional dues
 *   federal  = 5-band walk - federal BPA x 14% (BPA phases down from
 *              $181,440 to $258,482); Quebec: x (1 - 16.5% abatement)
 *   province = band walk - provincial BPA x the province's lowest rate;
 *              Ontario adds its surtax as its own line
 *   payroll  = CPP + CPP2 + EI outside Quebec; QPP + QPP2 + EI (QC rate) +
 *              QPIP in Quebec; self-employed pay both CPP halves and no EI
 * Credits other than the basic personal amount (CPP/EI, Canada employment,
 * age, pension) are not in v1, so the estimate runs a little high. Every
 * constant comes from the figure registry via figures.ts, and the tool keeps
 * its own figure log so its sources footer lists exactly the keys it reads.
 */

import { figure, type FigureLog } from "./figures";

/** Registry keys this calculator reads, in first-use order. */
export const taxFigures: FigureLog = new Map();
const fig = <T>(file: string, key: string) => figure<T>(file, key, taxFigures);

export const TAX_YEAR = 2026;

/* ------------------------------------------------------------------ */
/* Registry constants                                                  */
/* ------------------------------------------------------------------ */

export interface Bracket {
  rate: number;
  /** Upper threshold of the band; null = no limit. */
  upper: number | null;
}

export type Prov = "AB" | "BC" | "MB" | "NB" | "NL" | "NS" | "NT" | "NU" | "ON" | "PE" | "QC" | "SK" | "YT";

export const PROVINCES: readonly { code: Prov; name: string }[] = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];
export const provinceName = (p: Prov) => PROVINCES.find((x) => x.code === p)!.name;
export const isProv = (s: string): s is Prov => PROVINCES.some((x) => x.code === s);

export const FEDERAL_BRACKETS = fig<Bracket[]>("federal-brackets-2026.json", "federal.brackets.2026");
export const FEDERAL_BPA_MAX = fig<number>("basic-personal-amounts-2026.json", "bpa.federal.max.2026");
export const FEDERAL_BPA_BASE = fig<number>("basic-personal-amounts-2026.json", "bpa.federal.base.2026");
/** The BPA phase-down runs between the top of the 26% band and the top of the 29% band. */
export const BPA_PHASE_FROM = FEDERAL_BRACKETS[2].upper!;
export const BPA_PHASE_TO = FEDERAL_BRACKETS[3].upper!;
/** Federal non-refundable credits are worth the lowest federal rate. */
export const FEDERAL_CREDIT_RATE = FEDERAL_BRACKETS[0].rate;

export const PROVINCIAL_BRACKETS = fig<Record<Prov, Bracket[]>>("provincial-brackets-2026.json", "provincial.brackets.2026");
export const PROVINCIAL_BPA = fig<Record<Prov, number>>("basic-personal-amounts-2026.json", "bpa.provincial.2026");
export const QC_ABATEMENT = fig<number>("provincial-brackets-2026.json", "qc.federal_abatement");
export const ON_SURTAX = fig<{ tier1_above: number; tier1_rate: number; tier2_above: number; tier2_rate: number }>(
  "provincial-brackets-2026.json",
  "on.surtax.2026",
);

export const CPP_YMPE = fig<number>("cpp-2026.json", "cpp.ympe.2026");
export const CPP_YBE = fig<number>("cpp-2026.json", "cpp.ybe.2026");
export const CPP_RATE = fig<number>("cpp-2026.json", "cpp.employee_rate.2026");
export const CPP_MAX = fig<number>("cpp-2026.json", "cpp.employee_max.2026");
export const CPP_SELF_MAX = fig<number>("cpp-2026.json", "cpp.self_max.2026");
export const CPP_YAMPE = fig<number>("cpp-2026.json", "cpp.yampe.2026");
export const CPP2_RATE = fig<number>("cpp-2026.json", "cpp.cpp2_rate.2026");
export const CPP2_MAX = fig<number>("cpp-2026.json", "cpp.cpp2_employee_max.2026");
export const CPP2_SELF_MAX = fig<number>("cpp-2026.json", "cpp.cpp2_self_max.2026");

export const QPP_MPE = fig<number>("qpp-2026.json", "qpp.mpe.2026");
export const QPP_RATE = fig<number>("qpp-2026.json", "qpp.employee_rate.2026");
export const QPP_MAX = fig<number>("qpp-2026.json", "qpp.employee_max.2026");
export const QPP2_RATE = fig<number>("qpp-2026.json", "qpp.qpp2_rate.2026");
export const QPP2_MAX = fig<number>("qpp-2026.json", "qpp.qpp2_employee_max.2026");

export const EI_MIE = fig<number>("ei-qpip-2026.json", "ei.mie.2026");
export const EI_RATE = fig<number>("ei-qpip-2026.json", "ei.employee_rate.2026");
export const EI_MAX = fig<number>("ei-qpip-2026.json", "ei.employee_max.2026");
export const EI_QC_RATE = fig<number>("ei-qpip-2026.json", "ei.qc_employee_rate.2026");
export const EI_QC_MAX = fig<number>("ei-qpip-2026.json", "ei.qc_employee_max.2026");
export const QPIP_MIE = fig<number>("ei-qpip-2026.json", "qp.mie.2026");
export const QPIP_RATE = fig<number>("ei-qpip-2026.json", "qp.employee_rate.2026");
export const QPIP_MAX = fig<number>("ei-qpip-2026.json", "qp.employee_max.2026");

export const OAS_THRESHOLD = fig<number>("oas-gis-2026-q3.json", "oas.recovery_tax.threshold.2026");
export const OAS_RATE = fig<number>("oas-gis-2026-q3.json", "oas.recovery_tax.rate");
export const RRSP_CAP = fig<number>("rrsp-2026.json", "rrsp.cap.2026");
export const FHSA_ANNUAL = fig<number>("fhsa-hbp-2026.json", "fhsa.annual_limit");

/** The CPP/QPP basic exemption applies once a year; the QPP uses the same $3,500 (research file). */
export const QPP_YBE = CPP_YBE;
/** QPP2 runs on the same $74,600 to $85,000 band as CPP2 (research file). */
export const QPP_YAMPE = CPP_YAMPE;

/* ------------------------------------------------------------------ */
/* Limits and defaults                                                 */
/* ------------------------------------------------------------------ */

export const AMOUNT_MAX = 50_000_000;
export const AGE_MIN = 0;
export const AGE_MAX = 120;
/** No CPP/QPP contributions under 18 (spec section 4, edge cases). */
export const CPP_MIN_AGE = 18;
/** Age amount and the OAS recovery note start at 65. */
export const SENIOR_AGE = 65;

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export const PAY_PERIODS: Record<PayFrequency, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
export const PAY_LABEL: Record<PayFrequency, string> = {
  weekly: "weekly",
  biweekly: "every two weeks",
  semimonthly: "twice a month",
  monthly: "monthly",
};

export interface TaxInput {
  province: Prov;
  employment: number | null;
  selfEmployment: number | null;
  otherIncome: number | null;
  /** Other income includes dividends or capital gains (taxed at ordinary rates in v1). */
  otherHasDividendsOrGains: boolean;
  rrsp: number | null;
  fhsa: number | null;
  dues: number | null;
  age: number | null;
  payFrequency: PayFrequency;
  /** TD1 claim amounts for paycheque mode; null = the basic personal amount. */
  td1Federal: number | null;
  td1Provincial: number | null;
}

export const DEFAULT_INPUT: Readonly<TaxInput> = {
  province: "ON",
  employment: 75_000,
  selfEmployment: 0,
  otherIncome: 0,
  otherHasDividendsOrGains: false,
  rrsp: 0,
  fhsa: 0,
  dues: 0,
  age: 25,
  payFrequency: "biweekly",
  td1Federal: null,
  td1Provincial: null,
};

/* ------------------------------------------------------------------ */
/* Income tax                                                          */
/* ------------------------------------------------------------------ */

/** Tax from walking the bands: each slice of income at its own rate. */
export function bracketTax(income: number, brackets: Bracket[]): number {
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upper ?? Infinity;
    if (income > lower) tax += (Math.min(income, upper) - lower) * b.rate;
    lower = upper;
  }
  return tax;
}

/**
 * Federal basic personal amount for a given net income: the full amount up
 * to $181,440, the base amount from $258,482, and a straight line between.
 * The straight line is the spec's v1 method; it is not yet checked against
 * CRA's TD1 worksheet (flagged on the page).
 */
export function federalBpa(netIncome: number): number {
  if (netIncome <= BPA_PHASE_FROM) return FEDERAL_BPA_MAX;
  if (netIncome >= BPA_PHASE_TO) return FEDERAL_BPA_BASE;
  const share = (netIncome - BPA_PHASE_FROM) / (BPA_PHASE_TO - BPA_PHASE_FROM);
  return FEDERAL_BPA_MAX - share * (FEDERAL_BPA_MAX - FEDERAL_BPA_BASE);
}

export const inBpaPhaseDown = (netIncome: number) => netIncome > BPA_PHASE_FROM && netIncome < BPA_PHASE_TO;

export interface FederalTax {
  basic: number;
  bpa: number;
  credit: number;
  /** Quebec abatement (0 elsewhere). */
  abatement: number;
  net: number;
}

/** `claim` overrides the BPA (paycheque mode uses the TD1 claim amount). */
export function federalTax(taxable: number, prov: Prov, claim?: number): FederalTax {
  const basic = bracketTax(taxable, FEDERAL_BRACKETS);
  const bpa = claim ?? federalBpa(taxable);
  const credit = bpa * FEDERAL_CREDIT_RATE;
  const afterCredits = Math.max(0, basic - credit);
  const abatement = prov === "QC" ? afterCredits * QC_ABATEMENT : 0;
  return { basic, bpa, credit, abatement, net: afterCredits - abatement };
}

/**
 * Ontario surtax on basic provincial tax (after credits): 20% of the tax
 * above $5,818, and the rest of the 56% total on the tax above $7,446.
 */
export function ontarioSurtax(basicOntarioTax: number): number {
  const s = ON_SURTAX;
  return (
    s.tier1_rate * Math.max(0, basicOntarioTax - s.tier1_above) +
    (s.tier2_rate - s.tier1_rate) * Math.max(0, basicOntarioTax - s.tier2_above)
  );
}

export interface ProvincialTax {
  basic: number;
  bpa: number;
  credit: number;
  surtax: number;
  net: number;
}

export function provincialTax(taxable: number, prov: Prov, claim?: number): ProvincialTax {
  const brackets = PROVINCIAL_BRACKETS[prov];
  const basic = bracketTax(taxable, brackets);
  const bpa = claim ?? PROVINCIAL_BPA[prov];
  const credit = bpa * brackets[0].rate;
  const afterCredits = Math.max(0, basic - credit);
  const surtax = prov === "ON" ? ontarioSurtax(afterCredits) : 0;
  return { basic, bpa, credit, surtax, net: afterCredits + surtax };
}

export interface IncomeTax {
  federal: FederalTax;
  provincial: ProvincialTax;
  total: number;
}

export function incomeTax(taxable: number, prov: Prov): IncomeTax {
  const federal = federalTax(taxable, prov);
  const provincial = provincialTax(taxable, prov);
  return { federal, provincial, total: federal.net + provincial.net };
}

/**
 * Combined federal + provincial rate on the next dollar of taxable income
 * (measured over the next $100 so cents do not distort it).
 */
export function marginalRate(taxable: number, prov: Prov): number {
  const step = 100;
  return (incomeTax(taxable + step, prov).total - incomeTax(taxable, prov).total) / step;
}

/* ------------------------------------------------------------------ */
/* Payroll: CPP/QPP, CPP2/QPP2, EI, QPIP                               */
/* ------------------------------------------------------------------ */

export interface Payroll {
  /** "CPP" or "QPP". */
  pensionLabel: "CPP" | "QPP";
  pension: number;
  pension2: number;
  ei: number;
  qpip: number;
  total: number;
  /** Self-employed share of pension contributions (both halves). */
  selfEmployedPension: number;
}

const clampBand = (v: number, lo: number, hi: number) => Math.max(0, Math.min(v, hi) - lo);

/**
 * Employee contributions on employment income; self-employment income pays
 * both halves on whatever pensionable room employment did not use, and no
 * EI. QPIP for self-employed workers is not modelled in v1.
 */
export function payroll(employment: number, selfEmployment: number, prov: Prov, age: number): Payroll {
  const qc = prov === "QC";
  const ympe = qc ? QPP_MPE : CPP_YMPE;
  const ybe = qc ? QPP_YBE : CPP_YBE;
  const rate = qc ? QPP_RATE : CPP_RATE;
  const yampe = qc ? QPP_YAMPE : CPP_YAMPE;
  const rate2 = qc ? QPP2_RATE : CPP2_RATE;
  const pensionLabel = qc ? "QPP" : "CPP";

  let pension = 0;
  let pension2 = 0;
  let selfEmployedPension = 0;
  if (age >= CPP_MIN_AGE) {
    const all = employment + selfEmployment;
    const empBase = clampBand(employment, ybe, ympe);
    const allBase = clampBand(all, ybe, ympe);
    const empTop = clampBand(employment, ympe, yampe);
    const allTop = clampBand(all, ympe, yampe);
    const empPension = rate * empBase;
    const sePension = 2 * rate * (allBase - empBase);
    const empPension2 = rate2 * empTop;
    const sePension2 = 2 * rate2 * (allTop - empTop);
    pension = empPension + sePension;
    pension2 = empPension2 + sePension2;
    selfEmployedPension = sePension + sePension2;
  }

  const ei = qc ? Math.min(employment, EI_MIE) * EI_QC_RATE : Math.min(employment, EI_MIE) * EI_RATE;
  const qpip = qc ? Math.min(employment, QPIP_MIE) * QPIP_RATE : 0;
  return { pensionLabel, pension, pension2, ei, qpip, total: pension + pension2 + ei + qpip, selfEmployedPension };
}

/* ------------------------------------------------------------------ */
/* Annual estimate                                                     */
/* ------------------------------------------------------------------ */

export interface ResolvedTaxInput {
  province: Prov;
  employment: number;
  selfEmployment: number;
  otherIncome: number;
  otherHasDividendsOrGains: boolean;
  rrsp: number;
  fhsa: number;
  dues: number;
  age: number;
  payFrequency: PayFrequency;
  td1Federal: number | null;
  td1Provincial: number | null;
}

export function resolve(i: TaxInput): ResolvedTaxInput {
  const n = (v: number | null) => (v === null || !Number.isFinite(v) ? 0 : Math.max(0, v));
  return {
    ...i,
    employment: n(i.employment),
    selfEmployment: n(i.selfEmployment),
    otherIncome: n(i.otherIncome),
    rrsp: n(i.rrsp),
    fhsa: n(i.fhsa),
    dues: n(i.dues),
    age: i.age ?? DEFAULT_INPUT.age!,
  };
}

export interface Core {
  gross: number;
  deductions: number;
  taxable: number;
  tax: IncomeTax;
  payroll: Payroll;
  takeHome: number;
}

/** The engine: gross to taxable, income tax, payroll, take-home. */
export function core(r: ResolvedTaxInput): Core {
  const gross = r.employment + r.selfEmployment + r.otherIncome;
  const deductions = Math.min(gross, r.rrsp + r.fhsa + r.dues);
  const taxable = gross - deductions;
  const tax = incomeTax(taxable, r.province);
  const pay = payroll(r.employment, r.selfEmployment, r.province, r.age);
  return { gross, deductions, taxable, tax, payroll: pay, takeHome: gross - tax.total - pay.total };
}

export interface ProvinceRow {
  province: Prov;
  incomeTax: number;
  takeHome: number;
}

export type TaxWarning =
  | "rrsp_over_cap"
  | "fhsa_over_annual"
  | "dividends_gains"
  | "under_18"
  | "quebec"
  | "bpa_phase_down"
  | "self_employed"
  | "oas_recovery"
  | "ontario_health_premium";

export interface TaxResult {
  input: ResolvedTaxInput;
  core: Core;
  averageRate: number;
  marginalRate: number;
  /** Take-home from the next $1,000 of the main income type. */
  keepPer1000: number;
  /** Income tax + payroll as a share of gross. */
  effectiveRate: number;
  /** Tax saved by $5,000 more RRSP. */
  rrspWhatIf: number;
  /** Extra take-home from $10,000 more income of the main type. */
  incomeWhatIf: number;
  provinces: ProvinceRow[];
  /** 65+: estimated OAS recovery tax exposure on net income above the threshold. */
  oasRecovery: number;
  warnings: TaxWarning[];
}

export const RRSP_WHAT_IF = 5_000;
export const INCOME_WHAT_IF = 10_000;

/** Where an extra dollar of income lands: employment first, then self-employment, then other. */
function withMore(r: ResolvedTaxInput, extra: number): ResolvedTaxInput {
  if (r.employment > 0 || (r.selfEmployment === 0 && r.otherIncome === 0)) return { ...r, employment: r.employment + extra };
  if (r.selfEmployment > 0) return { ...r, selfEmployment: r.selfEmployment + extra };
  return { ...r, otherIncome: r.otherIncome + extra };
}

export function estimate(i: TaxInput): TaxResult {
  const r = resolve(i);
  const c = core(r);
  const gross = c.gross;
  const warnings: TaxWarning[] = [];
  if (r.rrsp > RRSP_CAP) warnings.push("rrsp_over_cap");
  if (r.fhsa > FHSA_ANNUAL) warnings.push("fhsa_over_annual");
  if (r.otherHasDividendsOrGains && r.otherIncome > 0) warnings.push("dividends_gains");
  if (r.age < CPP_MIN_AGE && r.employment + r.selfEmployment > 0) warnings.push("under_18");
  if (r.province === "QC") warnings.push("quebec");
  if (inBpaPhaseDown(c.taxable)) warnings.push("bpa_phase_down");
  if (r.selfEmployment > 0) warnings.push("self_employed");
  const oasRecovery = r.age >= SENIOR_AGE ? Math.max(0, c.taxable - OAS_THRESHOLD) * OAS_RATE : 0;
  if (oasRecovery > 0) warnings.push("oas_recovery");
  if (r.province === "ON" && c.taxable > 0) warnings.push("ontario_health_premium");

  const withRrsp = core({ ...r, rrsp: r.rrsp + RRSP_WHAT_IF });
  return {
    input: r,
    core: c,
    averageRate: gross > 0 ? c.tax.total / gross : 0,
    marginalRate: marginalRate(c.taxable, r.province),
    keepPer1000: core(withMore(r, 1_000)).takeHome - c.takeHome,
    effectiveRate: gross > 0 ? (c.tax.total + c.payroll.total) / gross : 0,
    rrspWhatIf: c.tax.total - withRrsp.tax.total,
    incomeWhatIf: core(withMore(r, INCOME_WHAT_IF)).takeHome - c.takeHome,
    provinces: PROVINCES.map(({ code }) => {
      const pc = core({ ...r, province: code });
      return { province: code, incomeTax: pc.tax.total, takeHome: pc.takeHome };
    }),
    oasRecovery,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Paycheque mode                                                      */
/* ------------------------------------------------------------------ */

export interface PayLine {
  /** Pay number, 1-based. */
  pay: number;
  gross: number;
  pension: number;
  pension2: number;
  ei: number;
  qpip: number;
  federal: number;
  provincial: number;
  net: number;
}

export interface PaychequeResult {
  periods: number;
  frequency: PayFrequency;
  /** Gross pay each period (employment income / periods). */
  gross: number;
  td1Federal: number;
  td1Provincial: number;
  /** Federal and provincial tax withheld each pay (constant under steady pay). */
  federalPerPay: number;
  provincialPerPay: number;
  first: PayLine;
  last: PayLine;
  /** Pay number on which pension (CPP/QPP base), EI, QPIP stop; null if they never max out. */
  pensionMaxedAt: number | null;
  eiMaxedAt: number | null;
  qpipMaxedAt: number | null;
  /** Pay number on which CPP2/QPP2 starts; null if earnings never pass the first ceiling. */
  pension2StartsAt: number | null;
  pensionLabel: "CPP" | "QPP";
  yearNet: number;
  yearWithheld: number;
}

/**
 * Steady pay all year, no other income, contributions start in January.
 * Each pay: base pension = rate x (pay - exemption / periods), capped at the
 * yearly maximum; CPP2/QPP2 only on cumulative earnings between the two
 * ceilings; EI and QPIP at their rates up to the yearly maximum. Tax
 * withheld annualizes the first pay after CPP/EI/QPIP, runs it through the
 * bands, takes off the TD1 claims as credits, then divides by the periods.
 */
export function paycheque(i: TaxInput): PaychequeResult {
  const r = resolve(i);
  const prov = r.province;
  const qc = prov === "QC";
  const periods = PAY_PERIODS[r.payFrequency];
  const gross = r.employment / periods;
  const ympe = qc ? QPP_MPE : CPP_YMPE;
  const yampe = qc ? QPP_YAMPE : CPP_YAMPE;
  const ybe = qc ? QPP_YBE : CPP_YBE;
  const rate = qc ? QPP_RATE : CPP_RATE;
  const max = qc ? QPP_MAX : CPP_MAX;
  const rate2 = qc ? QPP2_RATE : CPP2_RATE;
  const max2 = qc ? QPP2_MAX : CPP2_MAX;
  const eiRate = qc ? EI_QC_RATE : EI_RATE;
  const eiMax = qc ? EI_QC_MAX : EI_MAX;
  const contributes = r.age >= CPP_MIN_AGE;

  const td1Federal = r.td1Federal ?? FEDERAL_BPA_MAX;
  const td1Provincial = r.td1Provincial ?? PROVINCIAL_BPA[prov];

  const lines: PayLine[] = [];
  let ytdP = 0;
  let ytdP2 = 0;
  let ytdEi = 0;
  let ytdQ = 0;
  let pensionMaxedAt: number | null = null;
  let eiMaxedAt: number | null = null;
  let qpipMaxedAt: number | null = null;
  let pension2StartsAt: number | null = null;
  let federalPerPay = 0;
  let provincialPerPay = 0;

  for (let k = 1; k <= periods; k++) {
    const before = gross * (k - 1);
    const after = gross * k;
    const pension = contributes ? Math.min(Math.max(0, rate * (gross - ybe / periods)), max - ytdP) : 0;
    const band2 = Math.max(0, Math.min(after, yampe) - Math.max(before, ympe));
    const pension2 = contributes ? Math.min(rate2 * band2, max2 - ytdP2) : 0;
    const ei = Math.min(eiRate * gross, eiMax - ytdEi);
    const qpip = qc ? Math.min(QPIP_RATE * gross, QPIP_MAX - ytdQ) : 0;
    ytdP += pension;
    ytdP2 += pension2;
    ytdEi += ei;
    ytdQ += qpip;
    if (pensionMaxedAt === null && contributes && max - ytdP < 0.005) pensionMaxedAt = k;
    if (eiMaxedAt === null && eiMax - ytdEi < 0.005) eiMaxedAt = k;
    if (qc && qpipMaxedAt === null && QPIP_MAX - ytdQ < 0.005) qpipMaxedAt = k;
    if (pension2StartsAt === null && pension2 > 0) pension2StartsAt = k;
    if (k === 1) {
      const annualized = Math.max(0, (gross - pension - pension2 - ei - qpip) * periods);
      federalPerPay = federalTax(annualized, prov, td1Federal).net / periods;
      provincialPerPay = provincialTax(annualized, prov, td1Provincial).net / periods;
    }
    const net = gross - pension - pension2 - ei - qpip - federalPerPay - provincialPerPay;
    lines.push({ pay: k, gross, pension, pension2, ei, qpip, federal: federalPerPay, provincial: provincialPerPay, net });
  }
  return {
    periods,
    frequency: r.payFrequency,
    gross,
    td1Federal,
    td1Provincial,
    federalPerPay,
    provincialPerPay,
    first: lines[0],
    last: lines[lines.length - 1],
    pensionMaxedAt,
    eiMaxedAt,
    qpipMaxedAt,
    pension2StartsAt,
    pensionLabel: qc ? "QPP" : "CPP",
    yearNet: lines.reduce((s, l) => s + l.net, 0),
    yearWithheld: (federalPerPay + provincialPerPay) * periods,
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type Field = "employment" | "selfEmployment" | "otherIncome" | "rrsp" | "fhsa" | "dues" | "age" | "td1Federal" | "td1Provincial";

export function validate(i: TaxInput): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  const money: [Field, number | null, string][] = [
    ["employment", i.employment, "employment income"],
    ["selfEmployment", i.selfEmployment, "self-employment income"],
    ["otherIncome", i.otherIncome, "other income"],
    ["rrsp", i.rrsp, "RRSP amount"],
    ["fhsa", i.fhsa, "FHSA amount"],
    ["dues", i.dues, "dues amount"],
    ["td1Federal", i.td1Federal, "federal TD1 claim"],
    ["td1Provincial", i.td1Provincial, "provincial TD1 claim"],
  ];
  for (const [field, v, label] of money) {
    if (v === null) continue; // blank counts as $0 (TD1: the basic personal amount)
    if (!Number.isFinite(v) || v < 0) errors[field] = `Enter a ${label} of $0 or more.`;
    else if (v > AMOUNT_MAX) errors[field] = `That ${label} is over $50 million. Try a smaller number.`;
  }
  const a = i.age;
  if (a === null || !Number.isInteger(a) || a < AGE_MIN || a > AGE_MAX) errors.age = `Enter an age from ${AGE_MIN} to ${AGE_MAX}.`;
  return errors;
}
