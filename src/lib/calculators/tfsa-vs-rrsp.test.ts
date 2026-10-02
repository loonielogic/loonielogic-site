/**
 * Tests for the TFSA vs RRSP decision math and results copy.
 * Run: npm test (node --test via tsx). Checks the spec's anchor fact (equal
 * rates give equal results), the dollar gap (rate gap x amount x growth),
 * each edge case in spec section 5 that flips or annotates the verdict, and
 * the copy rules on every outcome.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { marginalRate } from "./income-tax";
import {
  DEFAULT_INPUT,
  LOWEST_BAND_TOP,
  REPLACEMENT_RATIO,
  RRSP_CAP,
  TFSA_ANNUAL,
  decide,
  mathVerdict,
  rates,
  validate,
  values,
  type DecisionInput,
} from "./tfsa-vs-rrsp";
import { DISCLAIMER, EXAMPLE_INPUT, HELP, NO_ROOM_MESSAGE, renderExample, renderNextSteps, renderResults } from "./tfsa-vs-rrsp-render";
import { $, pct } from "./calc-kit";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const close = (actual: number, expected: number, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
const input = (o: Partial<DecisionInput> = {}): DecisionInput => ({ ...DEFAULT_INPUT, ...o });

describe("core math", () => {
  test("equal rates give identical after-tax results (the anchor fact)", () => {
    const r = { now: 0.3, thenTax: 0.3, oas: 0, then: 0.3 };
    const v = values(10_000, 25, 0.06, r);
    close(v.rrsp, v.tfsa, 1e-6);
    close(v.difference, 0, 1e-6);
  });

  test("the gap is (M_now - M_then) x amount x growth", () => {
    const r = { now: 0.4341, thenTax: 0.2965, oas: 0, then: 0.2965 };
    const v = values(5_000, 20, 0.05, r);
    close(v.difference, (0.4341 - 0.2965) * 5_000 * Math.pow(1.05, 20), 1e-6);
  });

  test("the return never changes the winner", () => {
    const r = { now: 0.31, thenTax: 0.2, oas: 0, then: 0.2 };
    for (const ret of [0, 0.03, 0.08, 0.15]) assert.ok(values(1_000, 10, ret, r).difference > 0);
  });

  test("OAS recovery tax adds 15 points above $95,323 of retirement income", () => {
    const below = rates(150_000, 95_000, "ON");
    const above = rates(150_000, 96_000, "ON");
    assert.equal(below.oas, 0);
    assert.equal(above.oas, 0.15);
    close(above.then, marginalRate(96_000, "ON") + 0.15, 1e-9);
  });

  test("tie band: within 3 points is a tie", () => {
    assert.equal(mathVerdict({ now: 0.3, thenTax: 0.28, oas: 0, then: 0.28 }), "tie");
    assert.equal(mathVerdict({ now: 0.3, thenTax: 0.27, oas: 0, then: 0.27 }), "tie");
    assert.equal(mathVerdict({ now: 0.3, thenTax: 0.26, oas: 0, then: 0.26 }), "rrsp");
    assert.equal(mathVerdict({ now: 0.2, thenTax: 0.24, oas: 0, then: 0.24 }), "tfsa");
  });
});

describe("verdicts (spec section 5)", () => {
  test("5.4 high income now, lower later: RRSP, with the dollar saving", () => {
    const d = decide(input());
    assert.equal(d.account, "rrsp");
    assert.equal(d.reason, "peak_earning");
    assert.ok(d.values.difference > 0);
    assert.ok(d.quiz.find((q) => q.id === "peak")!.decided);
  });

  test("5.3 lowest federal bracket today: TFSA", () => {
    const d = decide(input({ income: LOWEST_BAND_TOP - 1_000, retirementIncome: 10_000 }));
    assert.equal(d.account, "tfsa");
    assert.equal(d.reason, "low_bracket");
  });

  test("5.5 the tie goes to the TFSA", () => {
    const d = decide(input({ income: 95_000, retirementIncome: 90_000 }));
    assert.equal(d.mathAccount, "tie");
    assert.equal(d.account, "tfsa");
    assert.equal(d.reason, "tie");
  });

  test("5.6 OAS clawback flips a near-tie to the TFSA", () => {
    const d = decide(input({ income: 120_000, retirementIncome: 100_000 }));
    assert.equal(d.rates.oas, 0.15);
    assert.equal(d.account, "tfsa");
  });

  test("5.14 / quiz: money needed early, or a 0-year horizon: TFSA", () => {
    assert.equal(decide(input({ mayNeedEarly: true })).reason, "need_early");
    assert.equal(decide(input({ years: 0 })).reason, "need_early");
  });

  test("5.7 GIS-dependent retiree: TFSA", () => {
    assert.equal(decide(input({ expectGis: true })).reason, "gis");
  });

  test("5.1 employer match: match first, then the rate answer", () => {
    const d = decide(input({ employerMatch: true }));
    assert.ok(d.matchFirst);
    assert.equal(d.account, "rrsp");
    assert.ok(renderResults(d).includes("Match first, then RRSP"));
  });

  test("5.2 first home: FHSA first", () => {
    const d = decide(input({ homeSoon: true }));
    assert.ok(d.homeFirst);
    assert.ok(renderResults(d).includes("Look at the FHSA first"));
  });

  test("5.9 no room in the recommended account blocks the plan", () => {
    const d = decide(input({ rrspRoom: 0 }));
    assert.ok(d.noRoom);
    const html = renderResults(d);
    assert.ok(html.includes(NO_ROOM_MESSAGE));
    assert.ok(!html.includes("Put it in your"));
  });

  test("5.10 over 71: RRSP closed, routed to the TFSA", () => {
    const d = decide(input({ age: 72 }));
    assert.equal(d.reason, "rrsp_closed");
    assert.equal(d.account, "tfsa");
    assert.ok(decide(input({ age: 71 })).flags.includes("last_rrsp_year"));
  });

  test("5.8 spousal RRSP note only on an RRSP verdict", () => {
    assert.ok(decide(input({ spouseEarnsLess: true })).flags.includes("spousal"));
    assert.ok(!decide(input({ spouseEarnsLess: true, mayNeedEarly: true })).flags.includes("spousal"));
  });

  test("estimate-for-me uses the 65% replacement ratio", () => {
    const d = decide(input({ estimateRetirement: true, income: 100_000 }));
    assert.equal(d.input.retirementIncome, 100_000 * REPLACEMENT_RATIO);
    assert.ok(d.flags.includes("estimated_retirement"));
  });

  test("amount above combined new room is flagged", () => {
    assert.ok(decide(input({ amount: TFSA_ANNUAL + RRSP_CAP + 1 })).flags.includes("over_combined_room"));
  });

  test("what would flip this: a retirement income where the answer changes", () => {
    const d = decide(input());
    assert.ok(d.flips.length > 0);
    for (const f of d.flips) assert.notEqual(f.to, d.mathAccount);
  });
});

describe("validation", () => {
  test("defaults are valid; bad inputs are blocked", () => {
    assert.deepEqual(validate(input()), {});
    const e = validate(input({ income: -1, amount: 0, years: 51, age: null, tfsaRoom: -5, expectedReturn: 0.2 }));
    assert.ok(e.income && e.amount && e.years && e.age && e.tfsaRoom && e.expectedReturn);
  });
});

describe("results copy rules", () => {
  const cases = [
    input(),
    input({ income: 40_000 }),
    input({ income: 95_000, retirementIncome: 90_000 }),
    input({ employerMatch: true, homeSoon: true, spouseEarnsLess: true, selfEmployed: true, leavingCanada: true }),
    input({ age: 72 }),
    input({ rrspRoom: 0 }),
    input({ age: 16, estimateRetirement: true, amount: 50_000 }),
  ];

  test("no em dashes, no 'you should', never 'guarantee', disclaimer always", () => {
    for (const c of cases) {
      const html = renderResults(decide(c));
      assert.ok(!html.includes("—"), "em dash found");
      assert.ok(!/you should/i.test(html), "'you should' found");
      assert.ok(!/guarantee/i.test(html), "'guarantee' found");
      assert.ok(html.includes(DISCLAIMER));
    }
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

  test("every form field has one helper line, 140 characters or fewer (radio groups once)", () => {
    const form = readFileSync(join(SRC, "components/calculators/TfsaVsRrsp.astro"), "utf8").split("\n<script>")[0];
    const fields = new Set([...form.matchAll(/<(?:input|select)\b[^>]*\bname="([A-Za-z0-9]+)"/g)].map((m) => m[1]));
    assert.deepEqual([...fields].sort(), Object.keys(HELP).sort());
    for (const [field, line] of Object.entries(HELP)) {
      assert.ok(line.length > 0 && line.length <= 140, `${field}: ${line.length} characters`);
      houseRules(line, `help for ${field}`);
    }
  });

  test("next steps: room sources and deadline dates from the registry", () => {
    const html = renderNextSteps();
    assert.match(html, /^<section class="ck-next[^"]*" aria-labelledby="tvr-h-next"><h2 id="tvr-h-next">What to do with this number<\/h2>/);
    const steps = html.match(/<li>/g)?.length ?? 0;
    assert.ok(steps >= 3 && steps <= 4, `${steps} steps`);
    assert.ok(html.includes("CRA My Account"));
    for (const s of ["March 1, 2027", "January 1, 2027", $(RRSP_CAP), $(TFSA_ANNUAL)]) assert.ok(html.includes(s), s);
    houseRules(html, "next steps");
    internalLinksExist(html);
  });

  test("worked example: $82,000 today, every figure straight from decide()", () => {
    const html = renderExample();
    const d = decide(EXAMPLE_INPUT);
    assert.equal(EXAMPLE_INPUT.income, 82_000);
    assert.match(html, /^<section class="ck-example[^"]*" aria-labelledby="tvr-h-example"><h2 id="tvr-h-example">A worked example<\/h2>/);
    assert.ok(html.includes("$82,000"));
    for (const v of [d.account.toUpperCase(), pct(d.rates.now, 1), pct(d.rates.then, 1), $(d.values.rrsp), $(d.values.tfsa), $(Math.abs(d.values.difference))]) {
      assert.ok(html.includes(v), `missing engine value ${v}`);
    }
    const outputs = html.match(/<dd>/g)?.length ?? 0;
    assert.ok(outputs >= 3 && outputs <= 6, `${outputs} outputs`);
    houseRules(html, "worked example");
  });
});
