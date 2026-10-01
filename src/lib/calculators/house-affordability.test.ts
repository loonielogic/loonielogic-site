/**
 * Tests for the house affordability math and results copy.
 * Run: npm test (node --test via tsx). Pins the spec's section 3 worked
 * example: $140,000 income, 4.5% contract rate, 25 years, Ontario, first-time
 * buyer. Note: the spec example assumes 5% down at ~$597,000, but its own
 * tier rule (section 2.5) asks 10% above $500,000, so the GDS check below
 * feeds the example's cash directly and the down payment limit is tested
 * against the tier rule.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { minimumDownPayment, mortgagePayment } from "./down-payment-planner";
import {
  DEFAULT_INPUT,
  GDS,
  TDS,
  afford,
  monthlyDebt,
  resolve,
  scenario,
  validate,
  type AffordInput,
} from "./house-affordability";
import { DISCLAIMER, renderResults } from "./house-affordability-render";

const close = (actual: number, expected: number, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
const input = (o: Partial<AffordInput> = {}): AffordInput => ({ ...DEFAULT_INPUT, ...o });

/** Cash that leaves exactly 5% down at $597,000 after closing (the spec example's assumption). */
const EXAMPLE_CASH = (() => {
  const r = resolve(input({ cash: 0 }));
  let cash = 29_850;
  for (let k = 0; k < 5; k++) cash = 29_850 + scenario({ ...r, cash }, 597_000).closing;
  return cash;
})();

describe("constants and payment math", () => {
  test("GDS 39% and TDS 44%", () => {
    assert.equal(GDS, 0.39);
    assert.equal(TDS, 0.44);
  });

  test("$6.70 a month per $1,000 at 6.5% over 25 years (semi-annual compounding)", () => {
    close(mortgagePayment(1_000, 0.065, 25), 6.7, 0.005);
  });

  test("down payment tiers: 5% to $500k, 10% above, 20% of all above $1.5M", () => {
    assert.equal(minimumDownPayment(400_000), 20_000);
    assert.equal(minimumDownPayment(900_000), 65_000);
    assert.equal(minimumDownPayment(1_500_000), 125_000);
    assert.equal(minimumDownPayment(1_500_001), 300_000.2);
  });

  test("TDS debt conventions: 3% of unsecured, 0.65% of secured balances", () => {
    close(monthlyDebt({ debtPayments: 400, unsecuredBalance: 10_000, securedBalance: 20_000 }), 400 + 300 + 130);
  });
});

describe("spec section 3 worked example", () => {
  test("GDS-max price is about $597,000 with 5% down and a capitalized 4% premium", () => {
    const a = afford(input({ cash: EXAMPLE_CASH }));
    close(a.limits.gds, 597_000, 1_000);
    const s = scenario(a.input, 597_000);
    close(s.down, 29_850, 2);
    close(s.premiumRate, 0.04, 1e-9);
    close(s.premium, 22_686, 5);
    close(s.mortgage, 589_836, 5);
    close(s.gdsRatio, 0.39, 0.001);
    // Actual payment at 4.5%: about $3,264, $686 less than the qualifying payment.
    close(s.actualPayment, 3_264, 3);
    close(s.qualifyingPayment - s.actualPayment, 686, 3);
    // Closing: Ontario LTT about $8,412 less the $4,000 first-time rebate; 8% PST on the premium.
    close(s.transferTaxNet, 4_415, 5);
    close(s.pstOnPremium, 1_815, 2);
  });

  test("the tier rule makes cash the limit at that price", () => {
    const a = afford(input({ cash: EXAMPLE_CASH }));
    assert.equal(a.binding, "down");
    assert.ok(a.savingsLimited);
    assert.ok(renderResults(a).includes("savings, not income"));
  });

  test("TDS variant: $700 a month of car/LOC payments makes TDS bind near $579,000", () => {
    const a = afford(input({ cash: 1_000_000, debtPayments: 700, wantThirty: false }));
    const noCashLimit = afford(input({ cash: EXAMPLE_CASH, debtPayments: 700 }));
    assert.ok(noCashLimit.limits.tds < noCashLimit.limits.gds);
    close(noCashLimit.limits.tds, 579_000, 5_000);
    assert.ok(a.debtCost > 0);
  });
});

describe("rules", () => {
  test("stress test floor: a 3% contract rate qualifies at 5.25%", () => {
    const a = afford(input({ contractRate: 0.03 }));
    assert.ok(a.onFloor);
    close(a.at.qualifyingRate, 0.0525, 1e-12);
  });

  test("30 years only for first-time buyers or new builds, and it raises the maximum", () => {
    assert.equal(resolve(input({ firstTimeBuyer: false, newBuild: false, wantThirty: true })).amortYears, 25);
    assert.equal(resolve(input({ firstTimeBuyer: false, newBuild: true, wantThirty: true })).amortYears, 30);
    const a = afford(input({ cash: 1_000_000 }));
    assert.ok(a.amortCompare);
    assert.ok(a.amortCompare!.years30.payment < a.amortCompare!.years25.payment);
    assert.ok(a.amortCompare!.years30.totalInterest > a.amortCompare!.years25.totalInterest);
    assert.equal(afford(input({ firstTimeBuyer: false })).amortCompare, null);
  });

  test("half of condo fees count", () => {
    const r = resolve(input({ condoFees: 600 }));
    assert.equal(scenario(r, 500_000).condoCounted, 300);
  });

  test("20% or more down: no premium", () => {
    const s = scenario(resolve(input({ cash: 200_000 })), 600_000);
    assert.equal(s.insured, false);
    assert.equal(s.premium, 0);
  });

  test("near and above the $1.5M cap are flagged", () => {
    const big = afford(input({ income: 600_000, cash: 2_000_000 }));
    assert.ok(big.aboveCap);
    assert.ok(renderResults(big).includes("not available"));
  });

  test("Toronto MLTT carries the Not yet verified label", () => {
    const html = renderResults(afford(input({ toronto: true })));
    assert.ok(html.includes("Not yet verified"));
  });
});

describe("validation", () => {
  test("defaults are valid; bad inputs are blocked", () => {
    assert.deepEqual(validate(input()), {});
    const e = validate(input({ income: 0, contractRate: 0.25, taxRate: -0.01, cash: -1 }));
    assert.ok(e.income && e.contractRate && e.taxRate && e.cash);
  });
});

describe("results copy rules", () => {
  const cases = [
    input(),
    input({ cash: 5_000 }),
    input({ debtPayments: 2_000, condoFees: 500, province: "BC" }),
    input({ province: "AB", firstTimeBuyer: false }),
    input({ income: 600_000, cash: 2_000_000, toronto: true }),
    input({ income: 20_000, debtPayments: 5_000 }),
  ];

  test("no em dashes, no 'you should', never 'guarantee', disclaimer always", () => {
    for (const c of cases) {
      const html = renderResults(afford(c));
      assert.ok(!html.includes("—"), "em dash found");
      assert.ok(!/you should/i.test(html), "'you should' found");
      assert.ok(!/guarantee/i.test(html), "'guarantee' found");
      assert.ok(html.includes(DISCLAIMER));
    }
  });
});
