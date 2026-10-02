/**
 * Tests for the rent vs buy math and results copy.
 * Run: npm test (node --test via tsx). Pins the spec's section 5 verdicts:
 * Toronto ($800k, $2,600 rent) never breaks even, its bull case (5%
 * appreciation, 4% returns) breaks even in year 4, and Calgary ($500k,
 * $2,200 rent, 1% closing) breaks even in year 5. The spec's own dollar
 * figures for the rent path came from a script we could not reproduce; the
 * verdicts and price-to-rent ratios match.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mortgagePayment } from "./down-payment-planner";
import {
  CALGARY_TAX,
  DEFAULT_INPUT,
  ON_GUIDELINE,
  TORONTO_TAX,
  compare,
  resolve,
  simulate,
  validate,
  type RvbInput,
} from "./rent-vs-buy";
import { DISCLAIMER, EXAMPLE_INPUT, HELP, renderExample, renderNextSteps, renderResults } from "./rent-vs-buy-render";
import { $ } from "./calc-kit";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const close = (actual: number, expected: number, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
const input = (o: Partial<RvbInput> = {}): RvbInput => ({ ...DEFAULT_INPUT, ...o });
const calgary = (o: Partial<RvbInput> = {}) => input({ price: 500_000, rent: 2_200, taxRate: CALGARY_TAX, closingPct: 0.01, ...o });

describe("figures", () => {
  test("defaults come from the registry", () => {
    assert.equal(ON_GUIDELINE, 0.021);
    assert.equal(TORONTO_TAX, 0.00767311);
    assert.equal(CALGARY_TAX, 0.00665);
  });
});

describe("spec section 5 worked examples", () => {
  test("Toronto base: price-to-rent 25.6, renting wins, never breaks even", () => {
    const x = compare(input());
    close(x.priceToRent, 25.64, 0.01);
    assert.equal(x.ptrBand, "rent");
    assert.equal(x.verdict, "rent");
    assert.equal(x.sim.breakeven, null);
    assert.ok(x.gapAtTenure < 0);
  });

  test("Toronto bull case (5% appreciation, 4% returns): buy breaks even in year 4", () => {
    assert.equal(compare(input({ appreciation: 0.05, investReturn: 0.04 })).sim.breakeven, 4);
  });

  test("Calgary: price-to-rent 18.9, buy breaks even in year 5", () => {
    const x = compare(calgary());
    close(x.priceToRent, 18.94, 0.01);
    assert.equal(x.ptrBand, "tossup");
    assert.equal(x.sim.breakeven, 5);
    assert.equal(x.verdict, "buy");
    // over a 4-year stay the same home loses
    assert.equal(compare(calgary({ years: 4 })).verdict, "rent");
  });
});

describe("mechanics", () => {
  test("Canadian compounding and a capitalized CMHC premium under 20% down", () => {
    const s = simulate(resolve(input()));
    close(s.premiumRate, 0.031, 1e-12);
    close(s.mortgage, 720_000 * 1.031, 1e-6);
    close(s.payment, mortgagePayment(720_000 * 1.031, 0.0409, 25), 1e-9);
    // semi-annual compounding is not rate / 12
    const naive = (742_320 * (0.0409 / 12)) / (1 - Math.pow(1 + 0.0409 / 12, -300));
    assert.ok(Math.abs(s.payment - naive) > 5);
  });

  test("the mortgage is paid off at the end of the amortization", () => {
    const s = simulate(resolve(input()), 30);
    assert.ok(s.rows[23].balance > 0);
    assert.equal(s.rows[24].balance, 0);
  });

  test("20% down: no premium", () => {
    assert.equal(simulate(resolve(input({ downPct: 0.2 }))).premium, 0);
  });

  test("sensitivity grid: 9 cells, base case outlined, more growth helps buying", () => {
    const x = compare(input());
    assert.equal(x.grid.length, 9);
    assert.equal(x.grid.filter((g) => g.base).length, 1);
    const at = (a: number, r: number) => x.grid.find((g) => g.appreciation === a && g.investReturn === r)!;
    assert.equal(at(0.05, 0.03).verdict, "buy");
    assert.equal(at(0.01, 0.07).verdict, "rent");
  });

  test("monthly stretch and qualification warnings", () => {
    const x = compare(input({ income: 100_000 }));
    assert.ok(x.stretch);
    assert.ok(x.mayNotQualify);
    assert.ok(!compare(input({ income: 400_000 })).mayNotQualify);
  });

  test("round-trip transaction costs", () => {
    const x = compare(input());
    close(x.roundTrip, 800_000 * 0.02 + 800_000 * 0.045 + 2_000 + 2 * 2_000, 1e-6);
  });
});

describe("validation", () => {
  test("defaults are valid; bad inputs are blocked", () => {
    assert.deepEqual(validate(input()), {});
    const e = validate(input({ rent: 0, rentGrowth: 0.2, appreciation: -0.1, investReturn: 0.11, years: 31, downPct: 0.01 }));
    assert.ok(e.rent && e.rentGrowth && e.appreciation && e.investReturn && e.years && e.downPct);
  });

  test("down payment below the tiered minimum is blocked", () => {
    assert.ok(validate(input({ price: 900_000, downPct: 0.06 })).downPct);
    assert.equal(validate(input({ price: 900_000, downPct: 0.073 })).downPct, undefined);
  });

  test("negative appreciation is allowed (a bear case is legitimate)", () => {
    assert.equal(validate(input({ appreciation: -0.02 })).appreciation, undefined);
  });
});

describe("results copy rules", () => {
  const cases = [
    input(),
    calgary(),
    input({ condo: true, condoFees: 600, guidelineExempt: true, income: 90_000 }),
    input({ years: 1 }),
    input({ years: 30, appreciation: -0.05 }),
    input({ rent: 9_000 }),
  ];

  test("no em dashes, no 'you should', never 'guarantee', disclaimer always", () => {
    for (const c of cases) {
      const html = renderResults(compare(c));
      assert.ok(!html.includes("—"), "em dash found");
      assert.ok(!/you should/i.test(html), "'you should' found");
      assert.ok(!/guarantee/i.test(html), "'guarantee' found");
      assert.ok(html.includes(DISCLAIMER));
    }
  });

  test("'never' is stated plainly", () => {
    assert.ok(renderResults(compare(input())).includes("never catches up"));
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
    const form = readFileSync(join(SRC, "components/calculators/RentVsBuy.astro"), "utf8").split("\n<script>")[0];
    const fields = new Set([...form.matchAll(/<(?:input|select)\b[^>]*\bname="([A-Za-z0-9]+)"/g)].map((m) => m[1]));
    assert.deepEqual([...fields].sort(), Object.keys(HELP).sort());
    for (const [field, line] of Object.entries(HELP)) {
      assert.ok(line.length > 0 && line.length <= 140, `${field}: ${line.length} characters`);
      houseRules(line, `help for ${field}`);
    }
  });

  test("next steps: pre-approval, rate hold, closing-cost buffer; no sales links", () => {
    const html = renderNextSteps();
    assert.match(html, /^<section class="ck-next[^"]*" aria-labelledby="rvb-h-next"><h2 id="rvb-h-next">What to do with this number<\/h2>/);
    const steps = html.match(/<li>/g)?.length ?? 0;
    assert.ok(steps >= 3 && steps <= 4, `${steps} steps`);
    for (const s of ["pre-approval", "rate hold", "closing-cost buffer"]) assert.ok(html.includes(s), s);
    assert.ok(!/href="https?:/.test(html), "no outbound links");
    houseRules(html, "next steps");
    internalLinksExist(html);
  });

  test("worked example: every figure straight from compare()", () => {
    const html = renderExample();
    const x = compare(EXAMPLE_INPUT);
    assert.match(html, /^<section class="ck-example[^"]*" aria-labelledby="rvb-h-example"><h2 id="rvb-h-example">A worked example<\/h2>/);
    const be = x.sim.breakeven === null ? "Never within 30 years" : `Year ${x.sim.breakeven}`;
    for (const v of [x.verdict === "buy" ? "Buying" : "Renting", $(Math.abs(x.gapAtTenure)), be, $(x.sim.upfront), $(x.sim.ownMonth1), $(x.roundTrip)]) {
      assert.ok(html.includes(v), `missing engine value ${v}`);
    }
    const outputs = html.match(/<dd>/g)?.length ?? 0;
    assert.ok(outputs >= 3 && outputs <= 6, `${outputs} outputs`);
    houseRules(html, "worked example");
  });
});
