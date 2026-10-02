/**
 * Tests for the Goal Planner math and results copy.
 * Run: npm test (node --test via tsx). The required-return solver is checked
 * by round trip (pick a rate, build the target it implies, solve back) and on
 * every edge case: already there, reachable at 0%, out of reach at 30%, and
 * the verdict band edges. Hand-worked values use the same closed form as
 * compound-growth.test.ts.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { futureValue } from "./compound-growth";
import {
  DEFAULT_EXPECTED,
  DEFAULT_GOAL,
  MARKET_MAX,
  SOLVER_MAX_RATE,
  STEADY_MAX,
  VERDICT_COPY,
  addMonths,
  milestones,
  plan,
  requiredMonthly,
  requiredReturn,
  validate,
  verdictBand,
  type Goal,
  type RequiredReturn,
} from "./goal-planner";
import {
  $,
  DISCLAIMER,
  EXAMPLE_GOAL,
  EXAMPLE_RETURN,
  EXAMPLE_START,
  HELP,
  escapeHtml,
  gpFigures,
  pct,
  renderExample,
  renderNextSteps,
  renderResults,
} from "./goal-planner-render";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const START = { year: 2026, month: 10 };
const close = (actual: number, expected: number, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
const rateOf = (r: RequiredReturn) => {
  assert.equal(r.kind, "solved");
  return r.kind === "solved" ? r.rate : NaN;
};

function goal(overrides: Partial<Goal> = {}): Goal {
  return { ...DEFAULT_GOAL, ...overrides };
}

describe("requiredReturn: solver", () => {
  test("default goal ($30,000 in 5 years from $2,000 + $400/month) needs about 5.28%", () => {
    const rate = rateOf(requiredReturn(30_000, 5, 2_000, 400));
    close(rate, 0.052795, 1e-5);
  });

  test("round trip: the solved rate grows the inputs back to the target", () => {
    for (const [r, y, p, c] of [
      [0.01, 3, 500, 100],
      [0.04, 10, 0, 250],
      [0.065, 7, 5_000, 0],
      [0.12, 25, 1_000, 50],
      [0.29, 40, 0, 10],
    ]) {
      const target = futureValue(p, c, r, y * 12);
      const solved = rateOf(requiredReturn(target, y, p, c));
      close(solved, r, 1e-5);
      close(futureValue(p, c, solved, y * 12), target, target * 1e-4);
    }
  });

  test("savings today already cover it", () => {
    assert.deepEqual(requiredReturn(10_000, 5, 10_000, 0), { kind: "already_there" });
    assert.deepEqual(requiredReturn(10_000, 5, 12_000, 100), { kind: "already_there" });
  });

  test("reachable at 0%: saving alone gets there", () => {
    // $1,000 + $200 x 60 = $13,000 >= $13,000.
    assert.deepEqual(requiredReturn(13_000, 5, 1_000, 200), { kind: "no_growth_needed", rate: 0 });
    assert.deepEqual(requiredReturn(5_000, 5, 1_000, 200), { kind: "no_growth_needed", rate: 0 });
  });

  test("unreachable even at 30%", () => {
    const r = requiredReturn(1_000_000, 5, 1_000, 100);
    assert.equal(r.kind, "out_of_reach");
    if (r.kind === "out_of_reach") close(r.shortfallAtMax, 1_000_000 - futureValue(1_000, 100, SOLVER_MAX_RATE, 60), 1e-6);
  });

  test("nothing saved and nothing saving: out of reach, not a crash", () => {
    assert.equal(requiredReturn(1_000, 5, 0, 0).kind, "out_of_reach");
  });

  test("exactly 30% is still solvable", () => {
    const target = futureValue(1_000, 100, 0.3, 120);
    close(rateOf(requiredReturn(target, 10, 1_000, 100)), 0.3, 1e-5);
  });
});

describe("verdict bands", () => {
  const solved = (rate: number): RequiredReturn => ({ kind: "solved", rate });

  test("edges: 4% is steady, just above is market; 8% is market, just above is above", () => {
    assert.equal(STEADY_MAX, 0.04);
    assert.equal(MARKET_MAX, 0.08);
    assert.equal(verdictBand(solved(0.02)), "steady");
    assert.equal(verdictBand(solved(0.04)), "steady");
    assert.equal(verdictBand(solved(0.0401)), "market");
    assert.equal(verdictBand(solved(0.08)), "market");
    assert.equal(verdictBand(solved(0.0801)), "above");
  });

  test("edge cases map to a band", () => {
    assert.equal(verdictBand({ kind: "already_there" }), "steady");
    assert.equal(verdictBand({ kind: "no_growth_needed", rate: 0 }), "steady");
    assert.equal(verdictBand({ kind: "out_of_reach", shortfallAtMax: 1 }), "above");
  });

  test("verdict copy matches the brief word for word", () => {
    assert.equal(VERDICT_COPY.steady, "Steady path: your savings alone nearly get you there.");
    assert.equal(VERDICT_COPY.market, "Needs market-like growth: investing could bridge the gap.");
    assert.equal(VERDICT_COPY.above, "Above historical averages: consider saving more each month or giving it more time.");
  });
});

describe("requiredMonthly: inverse view", () => {
  test("default goal at 5%: about $403.39 a month", () => {
    close(requiredMonthly(30_000, 5, 2_000, 0.05), 403.39);
  });

  test("at 0%: the gap split evenly over the months", () => {
    close(requiredMonthly(30_000, 5, 2_000, 0), 28_000 / 60, 1e-9);
  });

  test("$0 when savings today grow to the target alone", () => {
    assert.equal(requiredMonthly(10_000, 10, 6_000, 0.07), 0);
    assert.equal(requiredMonthly(10_000, 10, 10_000, 0), 0);
  });

  test("paying the required monthly amount lands on the target", () => {
    const m = requiredMonthly(50_000, 8, 3_000, 0.06);
    close(futureValue(3_000, m, 0.06, 96), 50_000, 1e-6);
  });
});

describe("milestones", () => {
  test("addMonths rolls over the year", () => {
    assert.deepEqual(addMonths({ year: 2026, month: 10 }, 3), { year: 2027, month: 1 });
    assert.deepEqual(addMonths({ year: 2026, month: 12 }, 0), { year: 2026, month: 12 });
    assert.deepEqual(addMonths({ year: 2026, month: 1 }, 60), { year: 2031, month: 1 });
  });

  test("0%, $0 today, $100/month toward $1,200: months 3, 6, 9, 12", () => {
    const ms = milestones({ name: "x", target: 1_200, years: 1, currentSavings: 0, monthlyContribution: 100 }, 0, START);
    assert.deepEqual(ms.map((m) => m.months), [3, 6, 9, 12]);
    assert.deepEqual(ms.map((m) => m.amount), [300, 600, 900, 1_200]);
    assert.ok(ms.every((m) => m.onTime));
    assert.deepEqual(ms[3].date, { year: 2027, month: 10 });
  });

  test("savings today already past 25% and 50%", () => {
    const ms = milestones({ name: "x", target: 1_000, years: 2, currentSavings: 600, monthlyContribution: 50 }, 0, START);
    assert.deepEqual(ms.map((m) => m.reached), [true, true, false, false]);
    assert.deepEqual(ms.map((m) => m.months), [0, 0, 3, 8]);
  });

  test("late milestones are flagged, never-reached ones are null", () => {
    const late = milestones({ name: "x", target: 2_400, years: 1, currentSavings: 0, monthlyContribution: 100 }, 0, START);
    assert.deepEqual(late.map((m) => m.onTime), [true, true, false, false]);
    const never = milestones({ name: "x", target: 1_000, years: 5, currentSavings: 0, monthlyContribution: 0 }, 0.05, START);
    assert.ok(never.every((m) => m.months === null && m.date === null && !m.onTime));
  });

  test("growth pulls milestones earlier", () => {
    const g = { name: "x", target: 100_000, years: 20, currentSavings: 0, monthlyContribution: 300 };
    const flat = milestones(g, 0, START);
    const grown = milestones(g, 0.07, START);
    for (let k = 0; k < 4; k++) assert.ok(grown[k].months! < flat[k].months!);
  });
});

describe("plan", () => {
  test("default goal ties the pieces together", () => {
    const p = plan(goal(), DEFAULT_EXPECTED, START);
    assert.equal(p.goal.name, "First home down payment");
    assert.deepEqual(p.targetDate, { year: 2031, month: 10 });
    assert.equal(p.savedByDeadline, 26_000);
    assert.equal(p.band, "market");
    close(p.monthlyNeeded, 403.39);
    close(p.projectedAtDeadline, futureValue(2_000, 400, 0.05, 60), 1e-6);
    assert.equal(p.milestones.length, 4);
  });

  test("blank name falls back; blank amounts count as $0", () => {
    const p = plan(goal({ name: "   ", currentSavings: null, monthlyContribution: null }), 0.05, START);
    assert.equal(p.goal.name, "Your goal");
    assert.equal(p.required.kind, "out_of_reach");
  });
});

describe("validate", () => {
  test("the default goal is valid", () => {
    assert.deepEqual(validate(goal(), DEFAULT_EXPECTED), {});
  });

  test("bad inputs are blocked", () => {
    const e = validate(goal({ target: 0, years: 41, currentSavings: -5, monthlyContribution: NaN, name: "x".repeat(61) }), 0.31);
    assert.ok(e.target && e.years && e.currentSavings && e.monthlyContribution && e.name && e.expectedReturn);
    assert.ok(validate(goal({ target: null }), 0.05).target);
    assert.ok(validate(goal(), null).expectedReturn);
  });
});

describe("results copy rules", () => {
  const cases = [
    plan(goal(), DEFAULT_EXPECTED, START),
    plan(goal({ target: 1_000 }), 0.05, START),
    plan(goal({ target: 20_000 }), 0.05, START),
    plan(goal({ target: 2_000_000 }), 0.07, START),
    plan(goal({ target: 45_000 }), 0, START),
  ];

  test("no em dashes, no 'you should', never 'guaranteed', in every outcome", () => {
    for (const p of cases) {
      const html = renderResults(p);
      assert.ok(!html.includes("\u2014"), "em dash found");
      assert.ok(!/you should/i.test(html), "'you should' found");
      assert.ok(!/guarantee/i.test(html), "'guarantee' found");
      assert.ok(html.includes(DISCLAIMER));
    }
    for (const t of Object.values(VERDICT_COPY)) assert.ok(!t.includes("\u2014"));
  });

  test("each outcome shows its verdict", () => {
    assert.ok(renderResults(cases[0]).includes(VERDICT_COPY.market));
    assert.ok(renderResults(cases[2]).includes(VERDICT_COPY.steady));
    assert.ok(renderResults(cases[3]).includes(VERDICT_COPY.above));
  });

  test("the goal name is escaped, never injected as markup", () => {
    const p = plan(goal({ name: `<img src=x onerror="alert(1)">` }), 0.05, START);
    const html = renderResults(p);
    assert.ok(!html.includes("<img"));
    assert.ok(html.includes("&lt;img"));
    assert.equal(escapeHtml(`a&b<c>"d'`), "a&amp;b&lt;c&gt;&quot;d&#39;");
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

  test("every form field has one helper line, 140 characters or fewer (presets once)", () => {
    const form = readFileSync(join(SRC, "components/calculators/GoalPlanner.astro"), "utf8").split("\n<script>")[0];
    const fields = new Set([...form.matchAll(/<(?:input|select)\b[^>]*\bname="([A-Za-z0-9]+)"/g)].map((m) => m[1]));
    assert.deepEqual([...fields].sort(), Object.keys(HELP).sort());
    for (const [field, line] of Object.entries(HELP)) {
      assert.ok(line.length > 0 && line.length <= 140, `${field}: ${line.length} characters`);
      houseRules(line, `help for ${field}`);
    }
  });

  test("next steps: FHSA, RRSP and TFSA priority and a re-check cadence; figures from the registry", () => {
    const html = renderNextSteps();
    assert.match(html, /^<section class="ck-next[^"]*" aria-labelledby="gp-h-next"><h2 id="gp-h-next">What to do with this number<\/h2>/);
    const steps = html.match(/<li>/g)?.length ?? 0;
    assert.ok(steps >= 3 && steps <= 4, `${steps} steps`);
    for (const s of ["FHSA", "RRSP", "TFSA", "Re-check", "March 1, 2027", "January 1, 2027"]) assert.ok(html.includes(s), s);
    for (const key of ["tfsa.annual_limit.2026", "fhsa.annual_limit", "fhsa.lifetime_limit"]) {
      assert.ok(html.includes($(gpFigures.get(key)!.value as number)), key);
    }
    houseRules(html, "next steps");
    internalLinksExist(html);
  });

  test("worked example: every figure straight from plan()", () => {
    const html = renderExample();
    const p = plan(EXAMPLE_GOAL, EXAMPLE_RETURN, EXAMPLE_START);
    assert.equal(p.required.kind, "solved");
    assert.match(html, /^<section class="ck-example[^"]*" aria-labelledby="gp-h-example"><h2 id="gp-h-example">A worked example<\/h2>/);
    for (const v of [pct((p.required as { rate: number }).rate), VERDICT_COPY[p.band], $(p.savedByDeadline), $(p.monthlyNeeded), $(p.projectedAtDeadline)]) {
      assert.ok(html.includes(v), `missing engine value ${v}`);
    }
    const outputs = html.match(/<dd>/g)?.length ?? 0;
    assert.ok(outputs >= 3 && outputs <= 6, `${outputs} outputs`);
    houseRules(html, "worked example");
  });
});
