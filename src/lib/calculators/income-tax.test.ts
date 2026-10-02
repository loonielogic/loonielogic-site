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
  ontarioHealthPremium,
  ontarioLift,
  ontarioSurtax,
  ontarioTaxReduction,
  paycheque,
  payroll,
  provincialTax,
  taxFigures,
  validate,
  type TaxInput,
} from "./income-tax";
import { DISCLAIMER, EXAMPLE_INPUT, HELP, renderAnnual, renderExample, renderNextSteps, renderPaycheque } from "./income-tax-render";
import { $, pct } from "./calc-kit";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

describe("v2 credits", () => {
  test("federal CPP, EI and Canada employment amount credits at 14%", () => {
    const f = federalTax(75_000, "ON", undefined, { cppCreditBase: 4_230.45, eiPremiums: 1_123.07, employmentIncome: 75_000 });
    close(f.cppCredit, 592.26);
    close(f.eiCredit, 157.23);
    close(f.employmentCredit, 210.14);
    close(f.net, f.basic - 2_303.28 - 592.26 - 157.23 - 210.14, 0.02);
  });

  test("Canada employment amount is capped at employment income", () => {
    const f = federalTax(30_000, "ON", undefined, { cppCreditBase: 0, eiPremiums: 0, employmentIncome: 1_000 });
    close(f.employmentCredit, 140);
  });

  test("Ontario tax reduction: 2 x $300 less tax, floored, capped at tax", () => {
    close(ontarioTaxReduction(500), 100);
    assert.equal(ontarioTaxReduction(700), 0);
    assert.equal(ontarioTaxReduction(0), 0);
    close(ontarioTaxReduction(454.56), 145.44);
  });

  test("LIFT: $875 cap, 5% phase-out over $32,500, capped by remaining tax", () => {
    close(ontarioLift(22_000, 22_000, 2_000), 875);
    assert.equal(ontarioLift(60_000, 60_000, 5_000), 0);
    close(ontarioLift(22_000, 22_000, 500), 500);
  });

  test("Ontario Health Premium: tier 1 only, null above $25,000", () => {
    assert.equal(ontarioHealthPremium(18_000), 0);
    close(ontarioHealthPremium(22_000)!, 120);
    close(ontarioHealthPremium(25_000)!, 300);
    assert.equal(ontarioHealthPremium(26_000), null);
    assert.equal(ontarioHealthPremium(0), 0);
  });

  test("self-employed: only the employee half of base CPP is creditable", () => {
    const pay = payroll(0, 50_000, "ON", 30);
    close(pay.creditEligiblePension, 2_766.75);
    close(pay.selfEmployedPension, 5_533.5);
  });

  test("default $75,000 Ontario estimate", () => {
    const r = estimate(input());
    close(r.core.tax.federal.net, 8_308.09);
    close(r.core.tax.provincial.net, 3_997.02);
    close(r.core.tax.total, 12_305.12);
    close(r.core.takeHome, 57_325.36);
    assert.equal(r.core.tax.provincial.ohpUnmodeled, true);
    assert.ok(r.warnings.includes("ontario_health_premium"));
  });

  test("$22,000 Ontario: reduction, LIFT and tier-1 health premium", () => {
    const r = estimate(input({ employment: 22_000, age: 30, province: "ON" }));
    const p = r.core.tax.provincial;
    close(r.core.tax.federal.net, 362.27);
    close(p.taxReduction, 144.94);
    close(p.lift, 310.11);
    close(p.ohp, 120);
    close(p.net, 120);
    close(r.core.tax.total, 482.27);
    close(r.core.takeHome, 20_058.38);
    assert.ok(!r.warnings.includes("ontario_health_premium"));
  });

  test("line by line shows the new credits and drops the v1 note", () => {
    const html = renderAnnual(estimate(DEFAULT_INPUT));
    assert.ok(html.includes("Canada employment amount credit"));
    assert.ok(!html.includes("are left out in this version"));
  });
});

describe("below the tool: field help, next steps, worked example", () => {
  const SRC = join(import.meta.dirname, "..", "..");
  const DASHES = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)];
  const houseRules = (html: string, where: string) => {
    const text = html.replace(/<[^>]+>/g, " ");
    for (const d of DASHES) assert.ok(!html.includes(d), `${where}: em or en dash`);
    assert.ok(!/you should/i.test(text), `${where}: "you should"`);
    assert.ok(!/\b(we|our|us)\b/i.test(text) && !/\bI\b/.test(text), `${where}: first-person voice`);
  };
  const internalLinksExist = (html: string) => {
    for (const [, href] of html.matchAll(/href="(\/[^"]*)"/g)) {
      const [, section, slug] = href.split("/");
      const file = { calculators: `pages/calculators/${slug}.astro`, learn: `content/explainers/${slug}.mdx`, compare: `content/comparisons/${slug}.mdx` }[section];
      assert.ok(file && existsSync(join(SRC, file)), `internal link ${href} has no page`);
    }
  };

  test("every form field has one helper line, 140 characters or fewer", () => {
    const form = readFileSync(join(SRC, "components/calculators/IncomeTax.astro"), "utf8").split("\n<script>")[0];
    const fields = new Set([...form.matchAll(/<(?:input|select)\b[^>]*\bname="([A-Za-z0-9]+)"/g)].map((m) => m[1]));
    assert.deepEqual([...fields].sort(), Object.keys(HELP).sort());
    for (const [field, line] of Object.entries(HELP)) {
      assert.ok(line.length > 0 && line.length <= 140, `${field}: ${line.length} characters`);
      houseRules(line, `help for ${field}`);
    }
  });

  test("next steps: the section, the heading and 3 to 4 dated steps from the registry", () => {
    const html = renderNextSteps();
    assert.match(html, /^<section class="ck-next[^"]*" aria-labelledby="itx-h-next"><h2 id="itx-h-next">What to do with this number<\/h2>/);
    const steps = html.match(/<li>/g)?.length ?? 0;
    assert.ok(steps >= 3 && steps <= 4, `${steps} steps`);
    for (const date of ["April 30, 2027", "June 15, 2027", "March 1, 2027"]) assert.ok(html.includes(date), date);
    assert.ok(html.includes("CRA My Payment"));
    assert.ok(html.includes("6 years"));
    houseRules(html, "next steps");
    internalLinksExist(html);
  });

  test("worked example: $82,000 in Ontario, every figure straight from estimate()", () => {
    const html = renderExample();
    const r = estimate(EXAMPLE_INPUT);
    assert.equal(EXAMPLE_INPUT.employment, 82_000);
    assert.match(html, /^<section class="ck-example[^"]*" aria-labelledby="itx-h-example"><h2 id="itx-h-example">A worked example<\/h2>/);
    assert.ok(html.includes("$82,000"));
    for (const v of [$(r.core.tax.total), $(r.core.payroll.total), $(r.core.takeHome), pct(r.averageRate), pct(r.marginalRate), $(r.rrspWhatIf)]) {
      assert.ok(html.includes(v), `missing engine value ${v}`);
    }
    const outputs = html.match(/<dd>/g)?.length ?? 0;
    assert.ok(outputs >= 3 && outputs <= 6, `${outputs} outputs`);
    houseRules(html, "worked example");
  });
});
