/**
 * Tests for the income tax calculator math and results copy.
 * Run: npm test (node --test via tsx). The spec's section 9 cases are worked
 * by hand below from the research figures (brackets, BPAs, surtax, payroll),
 * so a registry change that moves a number fails here first.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  BPA_PHASE_FROM,
  BPA_PHASE_TO,
  DEFAULT_INPUT,
  FEDERAL_BPA_BASE,
  FEDERAL_BPA_MAX,
  PROVINCES,
  bracketTax,
  estimate,
  federalBpa,
  federalTax,
  incomeTax,
  marginalRate,
  ontarioSurtax,
  paycheque,
  payroll,
  provincialTax,
  taxFigures,
  validate,
  type TaxInput,
} from "./income-tax";
import { DISCLAIMER, renderAnnual, renderPaycheque } from "./income-tax-render";

const close = (actual: number, expected: number, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
const input = (o: Partial<TaxInput> = {}): TaxInput => ({ ...DEFAULT_INPUT, ...o });

describe("figures match the research file", () => {
  test("federal brackets, BPA, CPP/EI/QPP/QPIP constants", () => {
    assert.equal(bracketTax(58_523, [{ rate: 0.14, upper: 58_523 }, { rate: 0.205, upper: null }]), 58_523 * 0.14);
    assert.equal(FEDERAL_BPA_MAX, 16_452);
    assert.equal(FEDERAL_BPA_BASE, 14_829);
    assert.equal(BPA_PHASE_FROM, 181_440);
    assert.equal(BPA_PHASE_TO, 258_482);
    assert.equal(PROVINCES.length, 13);
    // every key read is a registry entry that is not rejected
    for (const f of taxFigures.values()) assert.notEqual(f.status, "rejected");
  });
});

describe("income tax: spec section 9 cases", () => {
  test("Ontario $100,000 employment: bracket walk, BPA credit, surtax", () => {
    const fedBasic = 58_523 * 0.14 + (100_000 - 58_523) * 0.205;
    const f = federalTax(100_000, "ON");
    close(f.basic, fedBasic);
    close(f.credit, 2_303.28);
    close(f.net, fedBasic - 2_303.28);
    const onBasic = 53_891 * 0.0505 + (100_000 - 53_891) * 0.0915;
    const onAfter = onBasic - 12_989 * 0.0505;
    const p = provincialTax(100_000, "ON");
    close(p.basic, onBasic);
    close(p.surtax, 0.2 * (onAfter - 5_818));
    close(p.net, onAfter + 0.2 * (onAfter - 5_818));
    close(marginalRate(100_000, "ON"), 0.205 + 0.0915 * 1.2, 1e-6);
  });

  test("Alberta $200,000: six-band walk, BPA $22,769 x 8%", () => {
    const abBasic = 61_200 * 0.08 + (154_259 - 61_200) * 0.1 + (185_111 - 154_259) * 0.12 + (200_000 - 185_111) * 0.13;
    const p = provincialTax(200_000, "AB");
    close(p.basic, abBasic);
    close(p.credit, 22_769 * 0.08);
    assert.equal(p.surtax, 0);
    close(p.net, abBasic - 1_821.52);
  });

  test("Quebec $75,000: QPP $4,479.30, QPP2 $16, EI capped, QPIP $322.50, abatement", () => {
    const pay = payroll(75_000, 0, "QC", 30);
    assert.equal(pay.pensionLabel, "QPP");
    close(pay.pension, 4_479.3);
    close(pay.pension2, 16);
    // 1.30% x 75,000 = $975, but EI stops at the $68,900 maximum insurable earnings.
    close(pay.ei, 895.7);
    close(pay.qpip, 322.5);
    const f = federalTax(75_000, "QC");
    close(f.abatement, (f.basic - f.credit) * 0.165);
    close(f.net, (f.basic - f.credit) * 0.835);
  });

  test("$60,000 biweekly in Ontario: CPP $129.30 and EI $37.62 a pay", () => {
    const p = paycheque(input({ employment: 60_000, payFrequency: "biweekly" }));
    close(p.first.pension, 0.0595 * (60_000 / 26 - 3_500 / 26));
    close(p.first.pension, 129.3, 0.01);
    close(p.first.ei, 37.62, 0.01);
    assert.equal(p.pensionMaxedAt, null);
    assert.equal(p.eiMaxedAt, null);
  });

  test("$300,000 Ontario: BPA at the floor, marginal rate 53.53%", () => {
    assert.equal(federalBpa(300_000), 14_829);
    close(marginalRate(300_000, "ON"), 0.5353, 1e-4);
  });
});

describe("pieces", () => {
  test("federal BPA phase-down is a straight line between the endpoints", () => {
    assert.equal(federalBpa(BPA_PHASE_FROM), 16_452);
    assert.equal(federalBpa(BPA_PHASE_TO), 14_829);
    close(federalBpa((BPA_PHASE_FROM + BPA_PHASE_TO) / 2), (16_452 + 14_829) / 2);
  });

  test("Ontario surtax: 20% above $5,818 plus 36% more above $7,446", () => {
    assert.equal(ontarioSurtax(5_000), 0);
    close(ontarioSurtax(7_000), 0.2 * 1_182);
    close(ontarioSurtax(10_000), 0.2 * 4_182 + 0.36 * 2_554);
  });

  test("credits never make tax negative", () => {
    for (const { code } of PROVINCES) {
      assert.equal(incomeTax(5_000, code).total, 0);
    }
  });

  test("CPP: employee max at the ceilings; self-employed pays both halves, no EI", () => {
    const emp = payroll(120_000, 0, "ON", 40);
    close(emp.pension, 4_230.45);
    close(emp.pension2, 416);
    close(emp.ei, 1_123.07);
    const se = payroll(0, 120_000, "ON", 40);
    close(se.pension, 8_460.9);
    close(se.pension2, 832);
    assert.equal(se.ei, 0);
    // employment uses the room first; self-employment pays double on the rest
    const mixed = payroll(40_000, 20_000, "ON", 40);
    close(mixed.pension, 0.0595 * (40_000 - 3_500) + 2 * 0.0595 * 20_000);
  });

  test("under 18: no CPP", () => {
    const pay = payroll(30_000, 0, "ON", 17);
    assert.equal(pay.pension, 0);
    assert.ok(pay.ei > 0);
  });

  test("$100,000 biweekly: CPP2 starts, CPP and EI max out during the year", () => {
    const p = paycheque(input({ employment: 100_000, payFrequency: "biweekly" }));
    assert.ok(p.pension2StartsAt !== null && p.pensionMaxedAt !== null && p.eiMaxedAt !== null);
    assert.ok(p.last.net > p.first.net);
  });
});

describe("estimate", () => {
  test("take-home is gross minus income tax minus payroll", () => {
    const r = estimate(input({ employment: 85_000, rrsp: 5_000 }));
    close(r.core.taxable, 80_000);
    close(r.core.takeHome, 85_000 - r.core.tax.total - r.core.payroll.total);
    assert.ok(r.rrspWhatIf > 0 && r.rrspWhatIf < 5_000);
    assert.ok(r.incomeWhatIf > 0 && r.incomeWhatIf < 10_000);
    assert.equal(r.provinces.length, 13);
  });

  test("warnings fire for the spec's validation rules", () => {
    assert.ok(estimate(input({ rrsp: 40_000 })).warnings.includes("rrsp_over_cap"));
    assert.ok(estimate(input({ fhsa: 9_000 })).warnings.includes("fhsa_over_annual"));
    assert.ok(estimate(input({ otherIncome: 1_000, otherHasDividendsOrGains: true })).warnings.includes("dividends_gains"));
    assert.ok(estimate(input({ province: "QC" })).warnings.includes("quebec"));
    assert.ok(estimate(input({ employment: 200_000 })).warnings.includes("bpa_phase_down"));
    assert.ok(estimate(input({ age: 70, employment: 120_000 })).warnings.includes("oas_recovery"));
    assert.ok(!estimate(input({ age: 40, employment: 120_000 })).warnings.includes("oas_recovery"));
  });

  test("validation blocks bad inputs; blanks count as $0", () => {
    assert.deepEqual(validate(input()), {});
    assert.deepEqual(validate(input({ selfEmployment: null, rrsp: null })), {});
    const e = validate(input({ employment: -1, age: 121, fhsa: NaN }));
    assert.ok(e.employment && e.age && e.fhsa);
  });
});

describe("results copy rules", () => {
  const cases = [
    input(),
    input({ employment: 0, selfEmployment: 0 }),
    input({ province: "QC", employment: 75_000 }),
    input({ employment: 250_000, age: 70, otherIncome: 5_000, otherHasDividendsOrGains: true }),
    input({ employment: 0, selfEmployment: 90_000, rrsp: 40_000, fhsa: 9_000, age: 16 }),
  ];

  test("no em dashes, no 'you should', never 'guarantee', disclaimer on every screen", () => {
    for (const c of cases) {
      const r = estimate(c);
      for (const html of [renderAnnual(r), renderPaycheque(paycheque(c), r)]) {
        assert.ok(!html.includes("—"), "em dash found");
        assert.ok(!/you should/i.test(html), "'you should' found");
        assert.ok(!/guarantee/i.test(html), "'guarantee' found");
        assert.ok(html.includes(DISCLAIMER));
      }
    }
  });

  test("the BPA phase-down is labelled Not yet verified", () => {
    assert.ok(renderAnnual(estimate(input({ employment: 200_000 }))).includes("Not yet verified"));
  });
});
