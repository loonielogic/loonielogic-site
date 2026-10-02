/**
 * Tests for the RRSP contribution room math and results copy.
 * Run: npm test (node --test via tsx). The spec's worked example (Nadia,
 * section 2.4) must come out at $16,700 in Mode A and $22,200 in Mode B; the
 * edge cases in section 5 each flip or annotate the output.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  BUFFER,
  CAP_BINDS_AT,
  DEADLINE,
  DOLLAR_LIMIT,
  NADIA,
  NEXT_DOLLAR_LIMIT_UNVERIFIED,
  check,
  deductionLimit,
  excessTaxPerMonth,
  validate,
  type RoomInput,
} from "./rrsp-room";
import { DISCLAIMER, EXAMPLE_INPUT, HELP, STALENESS_NOTE, renderExample, renderNextSteps, renderResults } from "./rrsp-room-render";
import { $, longDate } from "./calc-kit";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const input = (o: Partial<RoomInput> = {}): RoomInput => ({ ...NADIA, ...o });
const OPTS = { asOf: "October 1, 2026" };

describe("figures", () => {
  test("2026 constants match the spec", () => {
    assert.equal(DOLLAR_LIMIT, 33_810);
    assert.equal(BUFFER, 2_000);
    assert.equal(DEADLINE, "2027-03-01");
    assert.equal(Math.round(CAP_BINDS_AT), 187_833);
  });
});

describe("spec 2.4 worked example (Nadia)", () => {
  test("Mode A: $22,200 - $2,000 - $3,500 = $16,700", () => {
    const r = check(input());
    assert.equal(r.roomNow, 16_700);
    assert.equal(r.outcome, "room");
  });

  test("Mode B: $10,000 + ($16,200 - $4,000) = $22,200, matching her notice", () => {
    const b = deductionLimit({ unusedRoom: 10_000, earnedIncome: 90_000, pensionAdjustment: 4_000, par: 0, pspa: 0 });
    assert.equal(b.eighteen, 16_200);
    assert.equal(b.b, 12_200);
    assert.equal(b.limit, 22_200);
    assert.equal(check(input({ mode: "rebuild" })).roomNow, 16_700);
  });
});

describe("formula pieces", () => {
  test("the dollar cap binds above $187,833 of earned income", () => {
    const b = deductionLimit({ unusedRoom: 0, earnedIncome: 250_000, pensionAdjustment: 0, par: 0, pspa: 0 });
    assert.ok(b.capBinds);
    assert.equal(b.newRoomBeforePa, DOLLAR_LIMIT);
    assert.ok(check(input({ mode: "rebuild", earnedIncome: 250_000 })).flags.includes("cap_binds"));
  });

  test("PAR adds room, PSPA takes it away, floor at zero is flagged", () => {
    const b = deductionLimit({ unusedRoom: 0, earnedIncome: 50_000, pensionAdjustment: 0, par: 3_000, pspa: 1_000 });
    assert.equal(b.limit, 9_000 + 3_000 - 1_000);
    const neg = check(input({ mode: "rebuild", unusedRoom: 0, earnedIncome: 10_000, pensionAdjustment: 5_000, par: 0, pspa: 0 }));
    assert.equal(neg.limit, 0);
    assert.ok(neg.flags.includes("floored_unverified"));
    assert.ok(renderResults(neg, OPTS).includes("Not yet verified"));
  });

  test("non-resident: earned income is zeroed in Mode B (5.8)", () => {
    const r = check(input({ mode: "rebuild", nonResident: true }));
    assert.equal(r.limit, 10_000 - 4_000);
    assert.ok(r.flags.includes("non_resident"));
  });

  test("PA above the dollar limit warns (likely a T4 misread)", () => {
    assert.ok(check(input({ mode: "rebuild", pensionAdjustment: 40_000 })).flags.includes("pa_over_limit"));
  });
});

describe("room now", () => {
  test("first-60-days contributions count against one year only (5.3)", () => {
    const thisYear = check(input({ contribFirst60: 4_000, first60ClaimYear: "this" }));
    const nextYear = check(input({ contribFirst60: 4_000, first60ClaimYear: "next" }));
    assert.equal(thisYear.roomNow, 12_700);
    assert.equal(nextYear.roomNow, 16_700);
    assert.equal(nextYear.countedNextYear, 4_000);
  });

  test("undated contributions are subtracted, with a nudge", () => {
    const r = check(input({ contribUndated: 1_000 }));
    assert.equal(r.roomNow, 15_700);
    assert.ok(r.flags.includes("undated"));
  });

  test("withdrawals never add room back (5.5)", () => {
    const r = check(input({ withdrawals: 5_000 }));
    assert.equal(r.roomNow, 16_700);
    assert.ok(r.flags.includes("withdrawals"));
  });

  test("over-contribution: buffer applied at 18+, not under 18 (5.2, 5.6)", () => {
    const adult = check(input({ contribSince: 23_700 }));
    assert.equal(adult.outcome, "over");
    assert.equal(adult.excess, 3_500);
    assert.equal(adult.taxableExcess, 1_500);
    assert.equal(adult.monthlyTax, 15);
    const minor = check(input({ contribSince: 23_700, age: 17 }));
    assert.equal(minor.taxableExcess, 3_500);
    assert.equal(minor.monthlyTax, 35);
    assert.equal(excessTaxPerMonth(1_500, 30), 0);
  });

  test("exactly full is not 'over'", () => {
    assert.equal(check(input({ contribSince: 20_200 })).outcome, "full");
  });

  test("age 71+ routes out of the room math (5.9)", () => {
    const r = check(input({ age: 71 }));
    assert.equal(r.outcome, "closed");
    assert.ok(renderResults(r, OPTS).includes("Contribution room is closed"));
  });

  test("next year's forecast is capped at the unverified 2027 limit and labelled", () => {
    const r = check(input({ earnedThisYear: 300_000 }));
    assert.equal(r.nextYearNewRoom, NEXT_DOLLAR_LIMIT_UNVERIFIED);
    assert.ok(renderResults(r, OPTS).includes("Not yet verified"));
    assert.equal(check(input({ earnedThisYear: 50_000 })).nextYearNewRoom, 9_000);
  });
});

describe("validation", () => {
  test("Nadia is valid; Mode A needs the limit; negatives are blocked", () => {
    assert.deepEqual(validate(input()), {});
    assert.ok(validate(input({ deductionLimit: null })).deductionLimit);
    assert.deepEqual(validate(input({ mode: "rebuild", deductionLimit: null })), {});
    assert.ok(validate(input({ contribSince: -1 })).contribSince);
    assert.ok(validate(input({ age: 130 })).age);
  });
});

describe("results copy rules", () => {
  const cases = [
    input(),
    input({ mode: "rebuild", earnedIncome: 250_000, nonResident: true, withdrawals: 1_000, contribUndated: 500 }),
    input({ contribSince: 30_000, age: 16, bestGuess: true }),
    input({ contribSince: 20_200 }),
    input({ age: 75 }),
    input({ contribFirst60: 2_000, first60ClaimYear: "next", earnedThisYear: 80_000 }),
  ];

  test("no em dashes, no 'you should', staleness note and disclaimer on every screen", () => {
    for (const c of cases) {
      for (const example of [false, true]) {
        const html = renderResults(check(c), { ...OPTS, example });
        assert.ok(!html.includes("—"), "em dash found");
        assert.ok(!/you should/i.test(html), "'you should' found");
        assert.ok(!/guarantee/i.test(html), "'guarantee' found");
        assert.ok(html.includes(STALENESS_NOTE));
        assert.ok(html.includes(DISCLAIMER));
      }
    }
  });

  test("never presented as CRA's figure", () => {
    assert.ok(renderResults(check(input()), OPTS).includes("not CRA's figure"));
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
    const form = readFileSync(join(SRC, "components/calculators/RrspRoom.astro"), "utf8").split("\n<script>")[0];
    const fields = new Set([...form.matchAll(/<(?:input|select)\b[^>]*\bname="([A-Za-z0-9]+)"/g)].map((m) => m[1]));
    assert.deepEqual([...fields].sort(), Object.keys(HELP).sort());
    for (const [field, line] of Object.entries(HELP)) {
      assert.ok(line.length > 0 && line.length <= 140, `${field}: ${line.length} characters`);
      houseRules(line, `help for ${field}`);
    }
  });

  test("next steps: CRA My Account, the deadline and the over-contribution cushion", () => {
    const html = renderNextSteps();
    assert.match(html, /^<section class="ck-next[^"]*" aria-labelledby="rrr-h-next"><h2 id="rrr-h-next">What to do with this number<\/h2>/);
    const steps = html.match(/<li>/g)?.length ?? 0;
    assert.ok(steps >= 3 && steps <= 4, `${steps} steps`);
    for (const s of ["CRA My Account", longDate(DEADLINE), $(BUFFER)]) assert.ok(html.includes(s), s);
    houseRules(html, "next steps");
    internalLinksExist(html);
  });

  test("worked example: $82,000 of earned income, every figure straight from check()", () => {
    const html = renderExample();
    const r = check(EXAMPLE_INPUT);
    assert.equal(EXAMPLE_INPUT.earnedIncome, 82_000);
    assert.equal(r.input.mode, "rebuild");
    assert.match(html, /^<section class="ck-example[^"]*" aria-labelledby="rrr-h-example"><h2 id="rrr-h-example">A worked example<\/h2>/);
    assert.ok(html.includes("$82,000"));
    for (const v of [$(r.breakdown!.newRoomBeforePa), $(r.limit), $(r.countedThisYear), $(r.roomNow)]) {
      assert.ok(html.includes(v), `missing engine value ${v}`);
    }
    const outputs = html.match(/<dd>/g)?.length ?? 0;
    assert.ok(outputs >= 3 && outputs <= 6, `${outputs} outputs`);
    houseRules(html, "worked example");
  });
});
