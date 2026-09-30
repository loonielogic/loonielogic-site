/**
 * Tests for the First Home Savings Planner math. Run: npm test
 * (node --test via tsx). Encodes the spec's section 5 worked examples as
 * corrected by the 2026-09-30 audit addenda, plus the section 6 edge cases.
 * Tolerances are tight on purpose: if the math drifts, these fail.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { figure } from "./figures";
import {
  bcFthbExemption,
  bcPtt,
  cashStack,
  cmhcPremiumRate,
  defaultInput,
  FHSA_LIFETIME,
  fhsaRoom,
  futureValue,
  hbpRepaymentSchedule,
  hbpWithdrawable,
  minimumDownPayment,
  monthsToTarget,
  mortgagePayment,
  ontarioLtt,
  plan,
  qualifyingRate,
  requiredMonthly,
  simulate,
  sourceBreakdown,
  torontoMltt,
  transferTax,
  type PlannerInput,
} from "./down-payment-planner";

const near = (actual: number, expected: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ""} expected ${expected} +/- ${tol}, got ${actual}`);

const RATE = 0.0275;

/** Spec Example A inputs: $600k Ontario (not Toronto), $10k saved, $1,500/mo, 2.75%. */
function exampleA(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    ...defaultInput(new Date(2026, 9, 1)),
    price: 600_000,
    province: "ON",
    toronto: false,
    firstTimeBuyer: true,
    fees: 2_500,
    buffer: 0,
    tfsaBalance: 10_000,
    monthly: 1_500,
    savingsRate: RATE,
    ...overrides,
  };
}

describe("Example A: $600k, $10k now, $1,500/mo, 2.75%", () => {
  test("Ontario LTT on $600k is $8,475; net $4,475 after the $4,000 rebate (addendum 1)", () => {
    assert.equal(ontarioLtt(600_000), 8_475);
    const tt = transferTax({ price: 600_000, province: "ON", firstTimeBuyer: true });
    assert.equal(tt.rebate, 4_000);
    assert.equal(tt.net, 4_475);
  });

  test("itemized cash stack: $35,000 down + $4,475 LTT + $1,808 PST on premium + $2,500 fees", () => {
    const s = cashStack({
      price: 600_000, downChoice: "minimum", province: "ON", firstTimeBuyer: true, fees: 2_500, buffer: 0,
    });
    assert.equal(s.downPayment, 35_000);
    near(s.premium, 22_600, 0.01);
    near(s.pstOnPremium, 1_808, 0.01);
    near(s.closingTotal, 8_783, 0.01, "closing total (addendum 2: about $8,800)");
    near(s.cashTarget, 43_783, 0.01);
  });

  test("ITEMIZED version: ready in about 22 months (addendum A)", () => {
    const p = plan(exampleA());
    near(p.chosen.months, 21.7, 0.15);
    assert.equal(p.chosen.monthsWhole, 22);
  });

  test("SPEC-TARGET version: $50,000 cash target gives about 26 months (addendum 2)", () => {
    const n = monthsToTarget(50_000, 10_000, 1_500, RATE);
    near(n, 25.53, 0.02);
    assert.equal(Math.ceil(n), 26);
  });

  test("timeline formula includes interest on existing savings (addendum 3)", () => {
    const n = monthsToTarget(50_000, 10_000, 1_500, RATE);
    near(futureValue(10_000, 1_500, n, RATE), 50_000, 0.01);
    // Omitting interest on S (the spec's section 2.2 version) gives a longer, wrong answer.
    const r = RATE / 12;
    const wrong = Math.log(((50_000 - 10_000) * r) / 1_500 + 1) / Math.log(1 + r);
    assert.ok(wrong - n > 0.1, "formula must credit growth on existing savings");
  });
});

describe("Example B: 20%-down tradeoff on the same $600k plan", () => {
  test("SPEC-TARGET version: 20% down ready at month 76 total, about 50 more than minimum (addenda 4, B)", () => {
    const twenty = monthsToTarget(135_000, 10_000, 1_500, RATE);
    const minimum = monthsToTarget(50_000, 10_000, 1_500, RATE);
    near(twenty, 75.3, 0.15);
    assert.equal(Math.ceil(twenty), 76);
    assert.equal(Math.ceil(twenty) - Math.ceil(minimum), 50);
  });

  test("ITEMIZED version: 20% target about $127k, ready in about 71 months (addendum B)", () => {
    const p = plan(exampleA());
    near(p.twenty.stack.cashTarget, 126_975, 0.01);
    assert.equal(p.twenty.stack.pstOnPremium, 0);
    assert.equal(p.twenty.stack.premium, 0);
    assert.equal(p.twenty.monthsWhole, 71);
    assert.equal(p.twenty.monthsWhole - p.minimum.monthsWhole, 49);
  });

  test("qualifying payments at 4.50% contract (6.50% qualifying), 25 years (addendum C, item 5)", () => {
    const p = plan(exampleA({ contractRate: 0.045 }));
    near(qualifyingRate(0.045), 0.065, 1e-12);
    near(p.minimum.stack.mortgagePrincipal, 587_600, 0.01);
    near(p.minimum.qualifyingPayment, 3_936, 1);
    near(p.twenty.qualifyingPayment, 3_215, 1);
  });

  test("Ratehub 3.91% snapshot: qualifying at 5.91% is about $3,728 / $3,045; contract about $3,062 / $2,502", () => {
    const p = plan(exampleA());
    near(p.minimum.snapshotQualifyingPayment, 3_728, 1);
    near(p.twenty.snapshotQualifyingPayment, 3_045, 1);
    near(p.minimum.snapshotPayment, 3_062, 1);
    near(p.twenty.snapshotPayment, 2_502, 1);
  });

  test("PST on the CMHC premium for a $900,000 Ontario home is about $2,672 (addendum 6)", () => {
    const s = cashStack({ price: 900_000, downChoice: "minimum", province: "ON", firstTimeBuyer: true, fees: 0, buffer: 0 });
    assert.equal(s.downPayment, 65_000);
    near(s.pstOnPremium, 2_672, 0.01);
  });
});

describe("Transfer tax pinned to registry worked examples", () => {
  test("Ontario $800k = ltt_on.worked_800k", () => {
    assert.equal(ontarioLtt(800_000), figure<number>("ltt-2026.json", "ltt_on.worked_800k"));
  });
  test("Ontario rebate covers the full tax at $368,333", () => {
    near(ontarioLtt(figure<number>("ltt-2026.json", "ltt_on.fthb_rebate_full_price")), 4_000, 0.01);
  });
  test("Toronto: $400k MLTT = rebate max; $800k first-time net = ltt_toronto.worked_800k_net_fthb", () => {
    assert.equal(torontoMltt(400_000), figure<number>("ltt-2026.json", "ltt_toronto.fthb_rebate_max"));
    const tt = transferTax({ price: 800_000, province: "ON", toronto: true, firstTimeBuyer: true });
    assert.equal(tt.net, figure<number>("ltt-2026.json", "ltt_toronto.worked_800k_net_fthb"));
    assert.equal(tt.torontoUnverified, true, "Toronto math must stay labeled unverified (addendum F)");
  });
  test("Toronto luxury tiers use ltt-2026.json (4.40% from $3M), not mortgage-2026.json (addendum 8)", () => {
    near(torontoMltt(4_000_000) - torontoMltt(3_000_000), 44_000, 0.01);
  });
  test("BC PTT ladder matches ptt_bc.worked_ladder", () => {
    const ladder: [number, number][] = [
      [500_000, 8_000], [700_000, 12_000], [800_000, 14_000], [1_000_000, 18_000],
      [1_500_000, 28_000], [2_000_000, 38_000], [4_000_000, 118_000],
    ];
    for (const [price, tax] of ladder) near(bcPtt(price), tax, 0.01, `BC ${price}`);
  });
  test("BC first-time exemption phases out $835k to $860k", () => {
    assert.equal(bcFthbExemption(800_000), 8_000);
    near(bcFthbExemption(836_000), 7_680, 0.01);
    near(bcFthbExemption(850_000), 3_200, 0.01);
    assert.equal(bcFthbExemption(860_000), 0);
  });
});

describe("Edge case: $1.5M insured cap cliff", () => {
  test("$1.5M still uses tiers ($125,000); one dollar more jumps to 20% of the whole price", () => {
    assert.equal(minimumDownPayment(1_500_000), 125_000);
    near(minimumDownPayment(1_500_001), 300_000.2, 0.001);
    assert.equal(minimumDownPayment(1_600_000), 320_000);
  });
  test("no CMHC premium above the cap", () => {
    assert.equal(cmhcPremiumRate(1_600_000, 320_000), 0);
    const s = cashStack({ price: 1_600_000, downChoice: "minimum", province: "ON", firstTimeBuyer: false, fees: 0, buffer: 0 });
    assert.equal(s.insured, false);
    assert.equal(s.aboveInsuredCap, true);
  });
  test("premium tiers and 30-year surcharge", () => {
    near(cmhcPremiumRate(600_000, 35_000), 0.04, 1e-12);
    near(cmhcPremiumRate(600_000, 35_000, true), 0.042, 1e-12);
    near(cmhcPremiumRate(600_000, 60_000), 0.031, 1e-12);
    near(cmhcPremiumRate(600_000, 90_000), 0.028, 1e-12);
    assert.equal(cmhcPremiumRate(600_000, 120_000), 0);
  });
});

describe("Edge case: FHSA room starts at the opening date", () => {
  test("no account means no room", () => {
    assert.equal(fhsaRoom({ openYear: null, year: 2026 }), 0);
  });
  test("room does not exist before the opening year (no back-dating)", () => {
    assert.equal(fhsaRoom({ openYear: 2027, year: 2026 }), 0);
    assert.equal(fhsaRoom({ openYear: 2026, year: 2026 }), 8_000);
  });
  test("carry-forward is capped at $8,000: opened 2024, unused, has $16,000 in 2026 (not $24,000)", () => {
    assert.equal(fhsaRoom({ openYear: 2024, year: 2026 }), 16_000);
  });
  test("lifetime cap: $8,000 a year from 2023 exhausts $40,000 after 2027", () => {
    const c = { 2023: 8_000, 2024: 8_000, 2025: 8_000, 2026: 8_000 };
    assert.equal(fhsaRoom({ openYear: 2023, year: 2027, contributionsByYear: c }), 8_000);
    assert.equal(fhsaRoom({ openYear: 2023, year: 2028, contributionsByYear: { ...c, 2027: 8_000 } }), 0);
  });
  test("opening year earlier than 2023 is clamped to the 2023 launch", () => {
    assert.equal(fhsaRoom({ openYear: 2020, year: 2023 }), 8_000);
  });
});

describe("Edge case: HBP 90-day rule and repayment", () => {
  test("RRSP contributions inside 90 days are not withdrawable", () => {
    assert.equal(hbpWithdrawable({ rrspBalance: 70_000, recentContributions: 15_000, people: 1 }), 55_000);
    assert.equal(hbpWithdrawable({ rrspBalance: 70_000, recentContributions: 0, people: 1 }), 60_000);
  });
  test("standard schedule starts the 2nd year; disputed extended schedule starts the 5th", () => {
    const std = hbpRepaymentSchedule(60_000, 2027, 2);
    assert.equal(std.length, 15);
    assert.equal(std[0].year, 2029);
    assert.equal(std[0].amount, 4_000);
    assert.equal(hbpRepaymentSchedule(60_000, 2027, 5)[0].year, 2032);
  });
  test("planner exposes both schedules from the registry offsets", () => {
    const p = plan(exampleA({ rrspBalance: 20_000, tfsaBalance: 0 }));
    assert.ok(p.chosen.hbpUsed > 0);
    assert.equal(p.budget.standardSchedule[0].year, p.chosen.purchaseYear + 2);
    assert.equal(p.budget.extendedSchedule[0].year, p.chosen.purchaseYear + 5);
  });
});

describe("Edge case: couples double the per-person limits", () => {
  test("HBP doubles to $120,000", () => {
    assert.equal(hbpWithdrawable({ rrspBalance: 150_000, recentContributions: 0, people: 2 }), 120_000);
  });
  test("FHSA contributions cap at 2 x $40,000; with HBP the stack is $200,000", () => {
    const sim = simulate({
      start: { fhsa: 0, rrsp: 0, tfsa: 0, taxable: 0 },
      monthly: 5_000,
      annualRate: 0,
      months: 120,
      startYear: 2026,
      startMonth: 0,
      people: 2,
      fhsaOpenYear: 2026,
      fhsaContributedTotal: 0,
      tfsaRoomNow: 0,
    });
    assert.equal(sim.contributed.fhsa, 2 * FHSA_LIFETIME);
    const stack = sim.contributed.fhsa + hbpWithdrawable({ rrspBalance: 1e6, recentContributions: 0, people: 2 });
    assert.equal(stack, figure<number>("fhsa-hbp-2026.json", "hbp.fhsa_stack"));
  });
  test("couple mode changes account room, not the savings timeline for the same totals", () => {
    const solo = plan(exampleA());
    const pair = plan(exampleA({ couple: true }));
    assert.equal(solo.chosen.monthsWhole, pair.chosen.monthsWhole);
  });
});

describe("Sequencing and consistency", () => {
  test("sources are drawn FHSA, then HBP, then TFSA, then taxable, then gifts", () => {
    const b = sourceBreakdown({
      cashTarget: 100_000,
      balances: { fhsa: 30_000, rrsp: 0, tfsa: 20_000, taxable: 40_000 },
      hbpAvailable: 25_000,
      gift: 10_000,
    });
    assert.deepEqual(
      b.lines.map((l) => [l.source, l.amount]),
      [["fhsa", 30_000], ["hbp", 25_000], ["tfsa", 20_000], ["taxable", 25_000], ["gift", 0]],
    );
    assert.equal(b.shortfall, 0);
  });
  test("deposits fill FHSA room before the TFSA", () => {
    const sim = simulate({
      start: { fhsa: 0, rrsp: 0, tfsa: 0, taxable: 0 },
      monthly: 1_500, annualRate: 0, months: 12, startYear: 2026, startMonth: 0,
      people: 1, fhsaOpenYear: 2026, fhsaContributedTotal: 0, tfsaRoomNow: 7_000,
    });
    assert.equal(sim.contributed.fhsa, 8_000);
    assert.equal(sim.contributed.tfsa, 7_000);
    assert.equal(sim.contributed.taxable, 3_000);
  });
  test("simulation total matches the closed-form future value", () => {
    const sim = simulate({
      start: { fhsa: 0, rrsp: 0, tfsa: 10_000, taxable: 0 },
      monthly: 1_500, annualRate: RATE, months: 22, startYear: 2026, startMonth: 9,
      people: 1, fhsaOpenYear: 2026, fhsaContributedTotal: 0, tfsaRoomNow: 7_000,
    });
    const total = sim.end.fhsa + sim.end.rrsp + sim.end.tfsa + sim.end.taxable;
    near(total, futureValue(10_000, 1_500, 22, RATE), 0.01);
  });
  test("Example A plan is fully funded with no shortfall", () => {
    const p = plan(exampleA());
    assert.equal(p.chosen.sources.shortfall, 0);
  });
  test("target-date mode inverts the timeline", () => {
    const d = requiredMonthly(43_783, 10_000, 22, RATE);
    near(monthsToTarget(43_783, 10_000, d, RATE), 22, 1e-9);
    const p = plan(exampleA({ mode: "target", targetMonths: 36 }));
    near(futureValue(p.chosen.savingsNow, p.chosen.monthly, 36, RATE), p.chosen.ownTarget, 0.01);
  });
  test("a gift reduces what savings must cover", () => {
    const p = plan(exampleA({ gift: 10_000 }));
    near(p.chosen.ownTarget, 33_783, 0.01);
    assert.ok(p.chosen.monthsWhole < 22);
  });
  test("already have enough means zero months", () => {
    assert.equal(monthsToTarget(40_000, 50_000, 0, RATE), 0);
  });
  test("mortgage payment uses semi-annual compounding", () => {
    near(mortgagePayment(480_000, 0.065, 25), 3_215.15, 0.01);
  });
});

describe("Assumption flags stay visible", () => {
  test("2.75% default savings rate is flagged for re-check; EQ base rate is 1.00%", () => {
    const d = defaultInput();
    assert.equal(d.savingsRate, 0.0275);
    const eq = figure<{ base_personal_account: number }>("bank-promos.json", "eq.account_rates.2026_09");
    assert.equal(eq.base_personal_account, 0.01);
  });
  test("Home Buyers' Amount is $1,400 at 14% (addendum 10)", () => {
    assert.equal(figure<number>("fthb-incentives-2026.json", "hbtc.amount_2026"), 1_400);
  });
  test("FHSA refund range reproduces from 2026 rates (addendum 10)", () => {
    const r = figure<{ min: number; max: number; min_rate: number; max_rate: number }>(
      "closing-costs-2026.json", "fhsa.refund_range_on",
    );
    assert.equal(Math.round(8_000 * r.min_rate), r.min);
    assert.equal(Math.round(8_000 * r.max_rate), r.max);
  });
});
