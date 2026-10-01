/**
 * Tests for the Wealth Over Time (compound growth) math and results copy.
 * Run: npm test (node --test via tsx). Expected values were worked out by
 * hand from the closed form (or a plain month-by-month loop), independently
 * of the code; if the math drifts, these fail.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_INPUT,
  DELAY_YEARS,
  calculate,
  contributed,
  futureValue,
  project,
  validate,
  yearlySeries,
  type GrowthInput,
} from "./compound-growth";
import { DISCLAIMER, RETURN_NOTE, renderResults } from "./compound-growth-render";

const close = (actual: number, expected: number, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

function input(overrides: Partial<GrowthInput> = {}): GrowthInput {
  return { ...DEFAULT_INPUT, ...overrides };
}

/** Plain month-by-month loop: growth first, then the deposit. */
function loop(p: number, c: number, rate: number, months: number): number {
  let b = p;
  for (let m = 0; m < months; m++) b = b * (1 + rate / 12) + c;
  return b;
}

describe("futureValue", () => {
  test("lump sum only: $10,000 for 12 months at 12% is $11,268.25", () => {
    close(futureValue(10_000, 0, 0.12, 12), 11_268.25);
  });

  test("monthly only: $100 a month for 12 months at 12% is $1,268.25", () => {
    close(futureValue(0, 100, 0.12, 12), 1_268.25);
  });

  test("0% return: just the money put in", () => {
    assert.equal(futureValue(1_000, 200, 0, 360), 73_000);
  });

  test("0 months: the starting amount, untouched", () => {
    assert.equal(futureValue(5_000, 300, 0.07, 0), 5_000);
  });

  test("default example ($1,000 + $200/month, 30 years, 7%) is about $252,111", () => {
    close(futureValue(1_000, 200, 0.07, 360), 252_110.70, 0.01);
  });

  test("matches a month-by-month loop across many inputs", () => {
    for (const [p, c, r, y] of [
      [0, 50, 0.05, 1],
      [2_500, 0, 0.09, 17],
      [10_000, 1_000, 0.03, 40],
      [123, 456, 0.071, 50],
    ]) {
      close(futureValue(p, c, r, y * 12), loop(p, c, r, y * 12), 1e-6 * Math.max(1, loop(p, c, r, y * 12)));
    }
  });

  test("a higher return never gives a smaller balance", () => {
    let prev = -Infinity;
    for (let r = 0; r <= 0.3; r += 0.01) {
      const v = futureValue(1_000, 100, r, 240);
      assert.ok(v >= prev);
      prev = v;
    }
  });
});

describe("contributions vs growth", () => {
  test("contributions are the starting amount plus every monthly deposit", () => {
    assert.equal(contributed(1_000, 200, 360), 73_000);
  });

  test("project() splits the balance into contributions plus growth", () => {
    const p = project(1_000, 200, 0.07, 30);
    assert.equal(p.contributed, 73_000);
    close(p.contributed + p.growth, p.futureValue, 1e-6);
    close(p.growth, 179_110.70, 0.01);
    assert.ok(p.growthShare > 0.7 && p.growthShare < 0.72);
  });

  test("yearly series runs from year 0 to the final year", () => {
    const s = yearlySeries(1_000, 200, 0.07, 30);
    assert.equal(s.length, 31);
    assert.deepEqual(s[0], { year: 0, balance: 1_000, contributed: 1_000, growth: 0 });
    close(s[30].balance, futureValue(1_000, 200, 0.07, 360), 1e-6);
    for (let k = 1; k < s.length; k++) assert.ok(s[k].balance > s[k - 1].balance);
  });
});

describe("start now vs start 10 years later", () => {
  test("default example: waiting 10 years costs about $143,887", () => {
    const r = calculate(input());
    assert.equal(DELAY_YEARS, 10);
    assert.equal(r.laterYears, 20);
    close(r.later.futureValue, futureValue(1_000, 200, 0.07, 240), 1e-6);
    close(r.later.futureValue, 108_224.07, 0.01);
    close(r.costOfWaiting, 143_886.63, 0.01);
    assert.equal(r.extraContributed, 24_000);
  });

  test("10 years or fewer: the late starter gets no time at all", () => {
    const r = calculate(input({ years: 8 }));
    assert.equal(r.laterYears, 0);
    assert.equal(r.later.futureValue, 1_000);
    assert.equal(r.later.series.length, 1);
  });

  test("blank amounts count as $0", () => {
    const r = calculate(input({ startingAmount: null, monthlyContribution: null }));
    assert.equal(r.now.futureValue, 0);
    assert.equal(r.costOfWaiting, 0);
  });
});

describe("validate", () => {
  test("the default input is valid", () => {
    assert.deepEqual(validate(input()), {});
  });

  test("negative amounts, out-of-range years and returns are blocked", () => {
    const e = validate(input({ startingAmount: -1, monthlyContribution: NaN, years: 51, annualReturn: 0.31 }));
    assert.ok(e.startingAmount && e.monthlyContribution && e.years && e.annualReturn);
    assert.ok(validate(input({ years: 0 })).years);
    assert.ok(validate(input({ years: 2.5 })).years);
    assert.ok(validate(input({ annualReturn: -0.01 })).annualReturn);
    assert.ok(validate(input({ startingAmount: 200_000_000 })).startingAmount);
  });

  test("0% return is allowed", () => {
    assert.deepEqual(validate(input({ annualReturn: 0 })), {});
  });
});

describe("results copy rules", () => {
  const html = renderResults(calculate(input()));
  const texts = [html, DISCLAIMER, RETURN_NOTE];

  test("no em dashes, no 'you should', never 'guaranteed'", () => {
    for (const t of texts) {
      assert.ok(!t.includes("\u2014"), "em dash found");
      assert.ok(!/you should/i.test(t), "'you should' found");
      assert.ok(!/guarantee/i.test(t), "'guarantee' found");
    }
  });

  test("states that history is not a promise and the result is an illustration", () => {
    assert.match(RETURN_NOTE, /7% is roughly the long-run historical average for diversified stocks after inflation\. History is not a promise\./);
    assert.match(html, /illustrat/i);
    assert.ok(html.includes(DISCLAIMER));
  });

  test("shows both the start-now and start-later totals", () => {
    assert.ok(html.includes("$252,111"));
    assert.ok(html.includes("$108,224"));
  });

  test("renders an accessible inline SVG chart", () => {
    assert.match(html, /<svg[^>]+role="img"/);
    assert.match(html, /<title id="cg-chart-title">/);
  });
});
