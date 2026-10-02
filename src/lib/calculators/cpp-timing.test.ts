/**
 * Tests for the CPP timing calculator math and results copy.
 * Run: npm test (node --test via tsx). Encodes the spec's section 3.1 factor
 * table, 3.3 breakeven ages, 3.4 worked examples (2026 max and average),
 * 3.5 invest-the-difference illustration, and edge cases 1 to 12.
 * Expected values were worked out independently in Python (2026-09-30); if
 * the math or the registry drifts, these fail.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isSafeValue } from "../analytics";
import {
  ASSUMPTION_FIELDS,
  AVERAGE_AT_65,
  BREAKEVENS,
  CAPPED_MESSAGE,
  FACTORS,
  HORIZON_BLOCK_MESSAGE,
  HORIZON_CLAMP_MESSAGE,
  MAX_AT_65,
  NO_ESTIMATE_MESSAGE,
  OAS_THRESHOLD,
  OPTIMISTIC_MESSAGE,
  PRB_MAX,
  QPP_FACTORS_STATUS,
  SPECULATIVE_MESSAGE,
  SURVIVOR_MAX_65,
  WORKED_EXAMPLES,
  WORKED_INVEST,
  annualAt,
  breakevenAge,
  chartCsv,
  chartSeries,
  compute,
  cppFigures,
  defaultInput,
  inputToken,
  investedPot,
  lifetimeTo,
  monthlyAt,
  outcomeToken,
  startAges,
  timingFactor,
  validate,
  type CppInput,
} from "./cpp-timing";
import {
  $,
  $c,
  ACCURACY_BANNER,
  AS_OF,
  CRIC_URL,
  DISCLAIMER,
  EXAMPLE_INPUT,
  HELP,
  MSCA_URL,
  renderBlocked,
  renderExample,
  renderNextSteps,
  renderResults,
  type RenderOptions,
} from "./cpp-timing-render";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OPTS: RenderOptions = { basicsHref: null, taxToolHref: null };
const input = (o: Partial<CppInput> = {}): CppInput => ({ ...defaultInput(), ...o });
const cents = (n: number) => Math.round(n * 100) / 100;

describe("registry constants", () => {
  test("2026 maximum and average at 65", () => {
    assert.equal(MAX_AT_65, 1507.65);
    assert.equal(AVERAGE_AT_65, 877.01);
    assert.equal(PRB_MAX, 54.69);
    assert.equal(SURVIVOR_MAX_65, 904.59);
    assert.equal(OAS_THRESHOLD, 95_323);
  });

  test("reads exactly the spec section 9 figure keys (plus the OAS rate), all verified", () => {
    assert.deepEqual([...cppFigures.keys()].sort(), [
      "cpp.average_new_benefit",
      "cpp.child_rearing_provision",
      "cpp.dropout.base_years",
      "cpp.dropout.enhanced_best_years",
      "cpp.early_reduction",
      "cpp.late_boost",
      "cpp.max_benefit_65",
      "cpp.post_retirement_max",
      "cpp.prb.stop_age",
      "cpp.survivor.combined_cap_rule",
      "cpp.survivor.max_65_plus",
      "cpp.timing.no_benefit_past_70",
      "oas.deferral.q3_2026",
      "oas.recovery_tax.rate",
      "oas.recovery_tax.threshold.2026",
    ]);
    for (const f of cppFigures.values()) assert.equal(f.status, "verified", f.key);
  });

  test("QPP factors are flagged, never silently verified (edge 9)", () => {
    assert.equal(QPP_FACTORS_STATUS, "needs_reverification");
  });
});

describe("spec 3.1: timing factors", () => {
  const SPEC: Record<number, number> = {
    60: 0.64, 61: 0.712, 62: 0.784, 63: 0.856, 64: 0.928, 65: 1.0,
    66: 1.084, 67: 1.168, 68: 1.252, 69: 1.336, 70: 1.42,
  };
  for (const [age, f] of Object.entries(SPEC)) {
    test(`start at ${age}: x ${f}`, () => assert.equal(timingFactor(Number(age)), f));
  }
  test("the table has exactly the 11 whole start ages", () => {
    assert.deepEqual(FACTORS, SPEC);
  });
  test("v1 rejects fractional ages and ages outside 60 to 70", () => {
    assert.throws(() => timingFactor(59));
    assert.throws(() => timingFactor(71));
    assert.throws(() => timingFactor(62.5));
  });
});

describe("spec 3.3: breakeven ages", () => {
  test("65 beats 60 past 73.9 (0.64t = t - 5)", () => {
    assert.equal(breakevenAge(60, 65).toFixed(1), "73.9");
    assert.ok(Math.abs(breakevenAge(60, 65) - (60 + 5 / 0.36)) < 1e-9);
  });
  test("70 beats 65 past 81.9", () => assert.equal(breakevenAge(65, 70).toFixed(1), "81.9"));
  test("70 beats 60 past 78.2", () => assert.equal(breakevenAge(60, 70).toFixed(1), "78.2"));
  test("rounded reference points are 74, 82, 78", () => {
    assert.deepEqual(BREAKEVENS.map((b) => Math.round(b.age)), [74, 82, 78]);
  });
  test("independent of the estimate: lifetime totals tie at the breakeven for any amount", () => {
    for (const est of [100, 877.01, 1507.65]) {
      const x = breakevenAge(60, 65);
      assert.ok(Math.abs(lifetimeTo(est, 60, x) - lifetimeTo(est, 65, x)) < 1e-6);
    }
  });
});

describe("spec 3.4: worked examples (nominal, to 90)", () => {
  const [max, avg] = WORKED_EXAMPLES;

  test("2026 max: 60 -> $964.90/mo ($11,578.75/yr); 70 -> $2,140.86/mo ($25,690.36/yr)", () => {
    assert.equal(cents(max.rows[0].monthly), 964.9);
    assert.equal(cents(max.rows[0].annual), 11_578.75);
    assert.equal(cents(max.rows[2].monthly), 2_140.86);
    assert.equal(cents(max.rows[2].annual), 25_690.36);
  });
  test("2026 max lifetime to 90: $347,363 / $452,295 / $513,807", () => {
    assert.deepEqual(max.rows.map((r) => Math.round(r.lifetime)), [347_363, 452_295, 513_807]);
  });
  test("2026 average: 60 -> $561.29/mo ($6,735.44/yr); 70 -> $1,245.35/mo ($14,944.25/yr)", () => {
    assert.equal(cents(avg.rows[0].monthly), 561.29);
    assert.equal(cents(avg.rows[0].annual), 6_735.44);
    assert.equal(cents(avg.rows[2].monthly), 1_245.35);
    assert.equal(cents(avg.rows[2].annual), 14_944.25);
  });
  test("2026 average lifetime to 90: $202,063 / $263,103 / $298,885", () => {
    assert.deepEqual(avg.rows.map((r) => Math.round(r.lifetime)), [202_063, 263_103, 298_885]);
  });
  test("the calculator reproduces the worked example from inputs", () => {
    const r = compute(input({ est65: 877.01, horizon: 90, currentAge: 55 }));
    assert.deepEqual(r.columns.map((c) => Math.round(c.lifetime)), [202_063, 263_103, 298_885]);
    assert.equal(r.winner, 70);
  });
  test("monthly and annual helpers agree", () => {
    assert.equal(cents(monthlyAt(1507.65, 70)), 2_140.86);
    assert.equal(cents(annualAt(1507.65, 65)), 18_091.8);
  });
});

describe("spec 3.5: invest the difference", () => {
  test("average CPP at 60 invested at 5% until 65 -> $38,063 pot", () => {
    assert.equal(Math.round(WORKED_INVEST.pot), 38_063);
    assert.equal(WORKED_INVEST.months, 60);
  });
  test("covers the $315.72/mo 65-vs-60 gap for about 10 years", () => {
    assert.equal(cents(WORKED_INVEST.gap), 315.72);
    assert.equal(Math.round(WORKED_INVEST.yearsCovered), 10);
  });
  test("0% return is just the sum of the cheques", () => {
    assert.equal(investedPot(100, 0, 60), 6_000);
  });
  test("toggle defaults off; on, the result carries the pot", () => {
    assert.equal(defaultInput().invest, false);
    assert.equal(compute(input()).invest, null);
    const r = compute(input({ est65: 877.01, invest: true, investReturn: 0.05 }));
    assert.equal(Math.round(r.invest!.pot), 38_063);
  });
  test("edge 12: return above 8% warns softly, above 10% blocks", () => {
    assert.equal(validate(input({ invest: true, investReturn: 0.09 })).warnings.investReturn, OPTIMISTIC_MESSAGE);
    assert.ok(validate(input({ invest: true, investReturn: 0.11 })).errors.investReturn);
    assert.equal(compute(input({ invest: true, investReturn: 0.09 })).optimisticReturn, true);
    assert.equal(validate(input({ invest: true, investReturn: 0.08 })).warnings.investReturn, undefined);
  });
  test("no pot to build when the earliest start is 65 or later", () => {
    const r = compute(input({ currentAge: 66, invest: true }));
    assert.equal(r.invest, null);
    assert.equal(r.investUnavailable, true);
  });
});

describe("edge cases 1 to 5", () => {
  test("1: estimate of $0 blocks politely", () => {
    const v = validate(input({ est65: 0 }));
    assert.equal(v.errors.est65, NO_ESTIMATE_MESSAGE);
    assert.match(NO_ESTIMATE_MESSAGE, /no timing decision/);
  });
  test("2: estimate above the 2026 maximum is capped with a note", () => {
    const v = validate(input({ est65: 1508 }));
    assert.equal(v.errors.est65, undefined);
    assert.equal(v.warnings.est65, CAPPED_MESSAGE);
    const r = compute(input({ est65: 5000 }));
    assert.equal(r.est65, MAX_AT_65);
    assert.equal(r.capped, true);
    assert.equal(cents(r.columns[0].monthly), 964.9);
  });
  test("3: age 60 or over relabels the earliest column 'start now'; breakevens unchanged", () => {
    const r = compute(input({ currentAge: 63 }));
    assert.equal(r.startNow, true);
    assert.deepEqual(r.columns.map((c) => c.startAge), [63, 65, 70]);
    assert.equal(r.columns[0].startNow, true);
    assert.equal(r.columns[0].factor, 0.856);
    assert.deepEqual(BREAKEVENS.map((b) => b.age.toFixed(1)), ["73.9", "81.9", "78.2"]);
    const html = renderResults(r, OPTS);
    assert.match(html, /Start now \(63\)/);
    assert.match(html, /65 beats 60 if you live past about 74/);
  });
  test("3: at 60 exactly, the 60 column is 'start now'", () => {
    const r = compute(input({ currentAge: 60 }));
    assert.deepEqual(r.columns.map((c) => c.startAge), [60, 65, 70]);
    assert.equal(r.columns[0].startNow, true);
  });
  test("3: past 65 the 65 column drops; at 70 only 'start now' is left", () => {
    assert.deepEqual(startAges(67), [67, 70]);
    assert.deepEqual(startAges(70), [70]);
    assert.deepEqual(startAges(50), [60, 65, 70]);
    const html = renderResults(compute(input({ currentAge: 70 })), OPTS);
    assert.match(html, /no later start age to compare/);
  });
  test("4: horizon at or before a start age blocks", () => {
    assert.equal(validate(input({ horizon: 70 })).errors.horizon, HORIZON_BLOCK_MESSAGE);
    assert.equal(validate(input({ horizon: 65 })).errors.horizon, HORIZON_BLOCK_MESSAGE);
    assert.match(HORIZON_BLOCK_MESSAGE, /after you start collecting/);
    assert.ok(validate(input({ horizon: 72 })).errors.horizon);
    assert.equal(validate(input({ horizon: 75 })).errors.horizon, undefined);
  });
  test("5: horizon over 100 is clamped with a note", () => {
    assert.equal(validate(input({ horizon: 110 })).warnings.horizon, HORIZON_CLAMP_MESSAGE);
    const r = compute(input({ horizon: 110 }));
    assert.equal(r.horizon, 100);
    assert.equal(r.horizonClamped, true);
  });
});

describe("edge cases 6 to 11 and inputs", () => {
  test("under 45: soft speculative note, still runs; over 70 blocks", () => {
    assert.equal(validate(input({ currentAge: 30 })).warnings.currentAge, SPECULATIVE_MESSAGE);
    assert.equal(validate(input({ currentAge: 30 })).errors.currentAge, undefined);
    assert.ok(validate(input({ currentAge: 71 })).errors.currentAge);
  });
  test("6: child-rearing years show the provision note, math unchanged", () => {
    const base = compute(input());
    const kids = compute(input({ childRearingYears: 4 }));
    assert.deepEqual(kids.columns.map((c) => c.lifetime), base.columns.map((c) => c.lifetime));
    const html = renderResults(kids, OPTS);
    assert.match(html, /raising kids under 7 may be excluded/);
    assert.match(html, /does not adjust for it/);
    assert.doesNotMatch(renderResults(base, OPTS), /raising kids under 7/);
    assert.ok(validate(input({ childRearingYears: 16 })).errors.childRearingYears);
  });
  test("7: PRB line shows for yes and unsure, hidden for no", () => {
    for (const w of ["yes", "unsure"] as const) {
      const html = renderResults(compute(input({ stillWorking: w })), OPTS);
      assert.match(html, /\$54\.69 a month/);
      assert.match(html, /not wasted/);
    }
    assert.doesNotMatch(renderResults(compute(input({ stillWorking: "no" })), OPTS), /\$54\.69/);
  });
  test("8: survivor flag states the combined cap and links the official page, no survivor dollars computed", () => {
    const html = renderResults(compute(input({ survivor: true })), OPTS);
    assert.match(html, /capped at the maximum CPP retirement pension/);
    assert.match(html, /\$904\.59/);
    assert.match(html, /does not compute survivor dollars/);
    assert.match(html, /cpp-survivor-pension\.html/);
  });
  test("9: Quebec shows the needs-re-verification note", () => {
    const html = renderResults(compute(input({ quebec: true })), OPTS);
    assert.match(html, /have not been verified/);
    assert.match(html, /needs re-verification/);
    assert.doesNotMatch(renderResults(compute(input()), OPTS), /needs re-verification/);
  });
  test("10: separation shows the credit-splitting note", () => {
    assert.match(renderResults(compute(input({ separation: true })), OPTS), /does not compute credit splitting/);
  });
  test("11: OAS flag fires only above $95,323, per column, without recovery-tax dollars", () => {
    // Max CPP: $11,578.75 / $18,091.80 / $25,690.36 a year; + $75,000 crosses only at 70.
    const r = compute(input({ est65: 1507.65, otherIncome: 75_000, currentAge: 55 }));
    assert.deepEqual(r.columns.map((c) => c.overOasThreshold), [false, false, true]);
    const html = renderResults(r, OPTS);
    assert.match(html, /15% OAS recovery tax starts biting/);
    assert.match(html, /does not compute the recovery-tax dollars/);
    assert.equal(compute(input({ otherIncome: 50_000 })).anyOverOasThreshold, false);
    assert.ok(validate(input({ otherIncome: -1 })).errors.otherIncome);
  });
});

describe("chart data", () => {
  const r = compute(input({ est65: 877.01, currentAge: 55 }));
  test("three lines from 60 to 100", () => {
    const s = chartSeries(r);
    assert.equal(s.length, 3);
    for (const line of s) {
      assert.equal(line.points[0].age, 60);
      assert.equal(line.points[line.points.length - 1].age, 100);
    }
    assert.equal(Math.round(s[2].points[30].total), 298_885); // start 70, age 90
  });
  test("crossings sit at the breakeven ages", () => {
    assert.deepEqual(r.crossings.map((c) => c.age.toFixed(1)).sort(), ["73.9", "78.2", "81.9"]);
  });
  test("CSV has a header and 41 rows", () => {
    const lines = chartCsv(r).trim().split("\r\n");
    assert.equal(lines.length, 42);
    assert.match(lines[0], /^Age,/);
    assert.equal(lines[31], "90,202063,263103,298885");
  });
  test("results carry the chart, a CSV link, and a table view", () => {
    const html = renderResults(r, OPTS);
    assert.match(html, /<svg class="cpt-chart"/);
    assert.match(html, /download="cpp-timing-lifetime-totals-2026\.csv"/);
    assert.match(html, /Table view/);
  });
});

describe("horizon drives the winner", () => {
  test("the winner flips at the 70-vs-65 breakeven (81.9)", () => {
    assert.equal(compute(input({ horizon: 75 })).winner, 65);
    assert.equal(compute(input({ horizon: 81 })).winner, 65);
    assert.equal(compute(input({ horizon: 82 })).winner, 70);
    assert.equal(compute(input({ horizon: 90 })).winner, 70);
    assert.deepEqual(compute(input({ horizon: 80 })).ranking, [65, 70, 60]);
  });
  test("starting now at 63 beats 65 and 70 to a planning age of 75", () => {
    assert.equal(compute(input({ currentAge: 63, horizon: 75 })).winner, 63);
  });
});

describe("results copy", () => {
  const html = renderResults(compute(input()), OPTS);
  const all = [html, renderBlocked([NO_ESTIMATE_MESSAGE], OPTS), renderResults(compute(input({
    invest: true, survivor: true, quebec: true, separation: true, disability: true, childRearingYears: 3, otherIncome: 90_000, stillWorking: "yes",
  })), OPTS), ACCURACY_BANNER, DISCLAIMER];

  const EM_DASH = String.fromCharCode(0x2014);
  const ADVICE = new RegExp(["you", "should"].join(" "), "i");

  test("no em dashes and no advice phrasing anywhere", () => {
    for (const h of all) {
      assert.ok(!h.includes(EM_DASH));
      assert.doesNotMatch(h, ADVICE);
      assert.doesNotMatch(h, new RegExp(["hidden", "files"].join("_")));
    }
  });
  test("every panel carries the as-of line", () => {
    assert.match(AS_OF, /CPP figures: 2026; max at 65: Jan 2026 \$1,507\.65/);
    const panels = html.split('<section class="cpt-card').slice(1);
    const withFigures = panels.filter((p) => !/cpt-h-(flip|worked|next)"/.test(p));
    for (const p of withFigures) assert.ok(p.includes(AS_OF), p.slice(0, 80));
    assert.match(html, /cpt-kicker">CPP figures: 2026/);
    assert.match(html, /verified 2026-09-30/);
  });
  test("breakeven strip and derivation expander are present", () => {
    assert.match(html, /65 beats 60 if you live past about 74/);
    assert.match(html, /70 beats 65 if you live past about 82/);
    assert.match(html, /How we computed this/);
    assert.match(html, /0\.64t = t &minus; 5/);
  });
  test("worked examples are baked in with the exact numbers", () => {
    for (const n of ["$964.90", "$2,140.86", "$347,363", "$452,295", "$513,807", "$561.29", "$1,245.35", "$202,063", "$263,103", "$298,885", "$38,063", "$315.72"]) {
      assert.ok(html.includes(n), n);
    }
  });
  test("flippers panel argues both directions and never picks an age", () => {
    assert.match(html, /Taking it at 60 can win when/);
    assert.match(html, /Waiting to 70 can win when/);
    assert.match(html, /does not pick an age/);
    assert.doesNotMatch(html, /we recommend|best age for you|you ought/i);
  });
  test("next steps link the official canada.ca MSCA and CRIC pages, no affiliate links", () => {
    assert.ok(html.includes(MSCA_URL) && html.includes(CRIC_URL));
    assert.ok(MSCA_URL.startsWith("https://www.canada.ca/") && CRIC_URL.startsWith("https://www.canada.ca/"));
    assert.doesNotMatch(html, /href="\/go\//);
    assert.match(html, /Learn: CPP \+ OAS basics/);
  });
  test("built pages are linked when they exist", () => {
    const linked = renderResults(compute(input()), { basicsHref: "/learn/cpp-oas", taxToolHref: "/calculators/income-tax-calculator" });
    assert.match(linked, /href="\/learn\/cpp-oas"/);
    assert.match(linked, /href="\/calculators\/income-tax-calculator"/);
  });
});

describe("analytics tokens", () => {
  test("every token the island sends passes the class-token check", () => {
    const tokens = [
      outcomeToken(compute(input())),
      outcomeToken(compute(input({ currentAge: 63, horizon: 75 }))),
      ...(["yes", "no", "unsure"] as const).map(inputToken.stillWorking),
      ...(["invest", "quebec", "survivor", "separation", "disability"] as const).flatMap((n) => [inputToken.toggle(n, true), inputToken.toggle(n, false)]),
      ...Object.values(ASSUMPTION_FIELDS),
      "cpp_timing",
    ];
    for (const t of tokens) assert.equal(isSafeValue(t), true, t);
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
    const form = readFileSync(join(SRC, "components/calculators/CppTiming.astro"), "utf8").split("\n<script>")[0];
    const fields = new Set([...form.matchAll(/<(?:input|select)\b[^>]*\bname="([A-Za-z0-9]+)"/g)].map((m) => m[1]));
    assert.deepEqual([...fields].sort(), Object.keys(HELP).sort());
    for (const [field, line] of Object.entries(HELP)) {
      assert.ok(line.length > 0 && line.length <= 140, `${field}: ${line.length} characters`);
      houseRules(line, `help for ${field}`);
    }
  });

  test("next steps: Service Canada estimate and the OAS clawback check", () => {
    for (const o of [{ basicsHref: null, taxToolHref: null }, { basicsHref: null, taxToolHref: "/calculators/income-tax-calculator" }]) {
      const html = renderNextSteps(o);
      assert.match(html, /^<section class="ck-next[^"]*" aria-labelledby="cpt-h-next-steps"><h2 id="cpt-h-next-steps">What to do with this number<\/h2>/);
      const steps = html.match(/<li>/g)?.length ?? 0;
      assert.ok(steps >= 3 && steps <= 4, `${steps} steps`);
      assert.ok(html.includes(MSCA_URL));
      assert.ok(html.includes($(OAS_THRESHOLD)));
      assert.equal(html.includes("/calculators/income-tax-calculator"), o.taxToolHref !== null);
      houseRules(html, "next steps");
      internalLinksExist(html);
    }
  });

  test("worked example: every figure straight from compute()", () => {
    const html = renderExample();
    const r = compute({ ...EXAMPLE_INPUT });
    assert.match(html, /^<section class="ck-example[^"]*" aria-labelledby="cpt-h-example"><h2 id="cpt-h-example">A worked example<\/h2>/);
    for (const c of r.columns) {
      assert.ok(html.includes(`${$c(c.monthly)} a month, ${$(c.lifetime)} to ${r.horizon}`), `start at ${c.startAge}`);
    }
    assert.ok(html.includes(`Start at ${r.winner}`));
    const outputs = html.match(/<dd>/g)?.length ?? 0;
    assert.ok(outputs >= 3 && outputs <= 6, `${outputs} outputs`);
    houseRules(html, "worked example");
  });
});
