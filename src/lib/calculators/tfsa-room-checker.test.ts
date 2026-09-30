/**
 * Tests for the TFSA Over-Contribution Risk Checker math and results copy.
 * Run: npm test (node --test via tsx). Encodes the spec's section 2.3
 * lookup table and 2.4 worked example (Josie), plus edge cases 5.1 to 5.8.
 * Expected values were worked out independently of the code; if the math
 * or the registry drifts, these fail.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isSafeValue } from "../analytics";
import {
  ANNUAL_LIMIT,
  CUMULATIVE_MAX,
  NOT_ELIGIBLE_MESSAGE,
  annualLimit,
  check,
  cumulativeRoom,
  eligibilityStart,
  excessTax,
  excessTaxPerMonth,
  josieExample,
  tfsaFigures,
  validate,
  type CheckerInput,
} from "./tfsa-room-checker";
import { DISCLAIMER, STALENESS_NOTE, renderResults, type RenderOptions } from "./tfsa-room-checker-render";

const OPTS: RenderOptions = { fixGuideHref: "/fix-guide-test", asOf: "September 30, 2026" };

function input(overrides: Partial<CheckerInput> = {}): CheckerInput {
  return {
    birthYear: 1990,
    residentLater: false,
    residencyYear: null,
    nonResidentYears: [],
    lifetimeContributions: 0,
    priorWithdrawals: 0,
    thisYearWithdrawals: 0,
    plannedDeposit: null,
    bestGuess: false,
    ...overrides,
  };
}

/** Spec 2.3: eligibility-start year -> cumulative room as of Jan 1, 2026. */
const SPEC_TABLE: Record<number, number> = {
  2009: 109_000, 2010: 104_000, 2011: 99_000, 2012: 94_000, 2013: 89_000, 2014: 83_500,
  2015: 78_000, 2016: 68_000, 2017: 62_500, 2018: 57_000, 2019: 51_500, 2020: 45_500,
  2021: 39_500, 2022: 33_500, 2023: 27_500, 2024: 21_000, 2025: 14_000, 2026: 7_000,
};

describe("registry constants and the section 2.3 lookup table", () => {
  test("2026 limit is $7,000 and the 2009 to 2026 max is $109,000", () => {
    assert.equal(ANNUAL_LIMIT, 7_000);
    assert.equal(CUMULATIVE_MAX, 109_000);
  });

  test("annual limits by band", () => {
    assert.equal(annualLimit(2009), 5_000);
    assert.equal(annualLimit(2014), 5_500);
    assert.equal(annualLimit(2015), 10_000);
    assert.equal(annualLimit(2018), 5_500);
    assert.equal(annualLimit(2022), 6_000);
    assert.equal(annualLimit(2023), 6_500);
    assert.equal(annualLimit(2024), 7_000);
    assert.equal(annualLimit(2008), 0);
  });

  for (const [year, room] of Object.entries(SPEC_TABLE)) {
    test(`eligible from ${year}: ${room.toLocaleString("en-CA")}`, () => {
      assert.equal(cumulativeRoom(Number(year)), room);
    });
  }

  test("reads exactly the nine registry figures the brief allows", () => {
    assert.deepEqual([...tfsaFigures.keys()].sort(), [
      "tfsa.annual_limit.2026",
      "tfsa.bands.history",
      "tfsa.cumulative_max.2026",
      "tfsa.eligibility",
      "tfsa.excess_tax",
      "tfsa.formal_transfer",
      "tfsa.my_account_lag",
      "tfsa.rc243_deadline",
      "tfsa.withdrawal_restore",
    ]);
    for (const f of tfsaFigures.values()) assert.equal(f.status, "verified", f.key);
  });
});

describe("eligibility start", () => {
  test("birth year + 18", () => assert.equal(eligibilityStart(2002, null), 2020));
  test("never before 2009", () => assert.equal(eligibilityStart(1960, null), 2009));
  test("newcomer: the later of turning 18 and becoming resident", () => {
    assert.equal(eligibilityStart(1980, 2024), 2024);
    assert.equal(eligibilityStart(2004, 2015), 2022);
  });
  test("newcomer since 2024 has $21,000 of room", () => {
    const r = check(input({ birthYear: 1980, residentLater: true, residencyYear: 2024 }));
    assert.equal(r.startYear, 2024);
    assert.equal(r.startReason, "residency");
    assert.equal(r.roomNow, 21_000);
  });
});

describe("spec 2.4 worked example: Josie", () => {
  const r = check(josieExample());

  test("eligible from 2020 with $45,500 cumulative room", () => {
    assert.equal(r.startYear, 2020);
    assert.equal(r.cumulative, 45_500);
  });

  test("room now = $45,500 - $30,000 + $5,000 = $20,500", () => {
    assert.equal(r.roomNow, 20_500);
    assert.equal(r.outcome, "room_available");
    assert.equal(r.excess, 0);
  });

  test("the $2,000 withdrawn in 2026 returns Jan 1, 2027 and is not in room now", () => {
    assert.equal(r.returningJan1, 2_000);
    assert.equal(check({ ...josieExample(), thisYearWithdrawals: 0 }).roomNow, 20_500);
  });

  test("results screen: room now vs room returning Jan 1, 2027", () => {
    const html = renderResults(r, OPTS);
    assert.match(html, /Room now<\/span><strong>\$20,500<\/strong>/);
    assert.match(html, /Room returning January 1, 2027<\/span><strong>\+\$2,000<\/strong>/);
    assert.match(html, /not CRA's figure/);
  });
});

describe("5.1 same-year recontribution warning", () => {
  // Fires when this-year withdrawals > 0 and planned >= room now - this-year withdrawals.
  // Josie: 20,500 - 2,000 = 18,500.
  const josie = (planned: number | null, withdrawn = 2_000) =>
    check({ ...josieExample(), plannedDeposit: planned, thisYearWithdrawals: withdrawn });

  test("fires at the threshold and above", () => {
    assert.equal(josie(18_500).recontributionWarning, true);
    assert.equal(josie(22_500).recontributionWarning, true);
  });

  test("does not fire below the threshold, with no planned deposit, or with no 2026 withdrawals", () => {
    assert.equal(josie(18_499).recontributionWarning, false);
    assert.equal(josie(null).recontributionWarning, false);
    assert.equal(josie(20_000, 0).recontributionWarning, false);
  });

  test("headline warning copy names the amount and the Jan 1 return", () => {
    const html = renderResults(josie(20_000), OPTS);
    assert.match(html, /Withdrawn \$2,000 this year\? That \$2,000 is not room yet\. It comes back January 1, 2027\. Depositing it now may be an over-contribution\./);
    assert.match(html, /href="\/fix-guide-test"/);
  });

  test("a planned deposit past room now shows the excess and its monthly tax", () => {
    const r = josie(22_500);
    assert.equal(r.plannedExcess, 2_000);
    const html = renderResults(r, OPTS);
    assert.match(html, /Would go over estimated room by<\/th><td>\$2,000/);
    assert.match(html, /\$20 a month/);
  });
});

describe("5.2 negative room (already over-contributed)", () => {
  // Eligible from 2024 ($21,000), deposited $25,000: $4,000 over.
  const r = check(input({ birthYear: 2006, lifetimeContributions: 25_000 }));

  test("excess and 1%/month tax", () => {
    assert.equal(r.roomNow, -4_000);
    assert.equal(r.outcome, "over_contributed");
    assert.equal(r.excess, 4_000);
    assert.equal(r.excessTaxMonthly, 40);
    assert.equal(excessTax(4_000, 3), 120);
    assert.equal(excessTax(4_000, 6), 240);
  });

  test("matches the registry's CRA example: $2,000 over June to September = $80", () => {
    assert.equal(excessTaxPerMonth(2_000), 20);
    assert.equal(excessTax(2_000, 4), 80);
    assert.equal(excessTax(2_000, 3.1), 80, "a part month counts as a whole month");
  });

  test("routes to the fix guide and RC243; never shows a 'room now' or 'can go in' number", () => {
    const html = renderResults(r, OPTS);
    assert.match(html, /over-contribution of about <strong>\$4,000<\/strong>/);
    assert.match(html, /RC243/);
    assert.match(html, /RC243-SCH-A/);
    assert.match(html, /June 30, 2027/);
    assert.match(html, /href="\/fix-guide-test"/);
    assert.doesNotMatch(html, /Room now</);
    assert.doesNotMatch(html, /Estimated room now/);
    assert.doesNotMatch(html, /can go in/);
  });
});

describe("5.3 turned 18 this year", () => {
  const r = check(input({ birthYear: 2008 }));
  test("only the 2026 limit counts", () => {
    assert.equal(r.startYear, 2026);
    assert.equal(r.roomNow, 7_000);
    assert.equal(r.turned18ThisYear, true);
  });
  test("flags the birthday wait", () => {
    assert.match(renderResults(r, OPTS), /wait until the birthday/);
  });
});

describe("5.4 full-year non-resident years", () => {
  test("subtracts each year's own band limit (2015: $10,000; 2020: $6,000)", () => {
    const r = check(input({ birthYear: 1997, nonResidentYears: [2020, 2015] }));
    assert.equal(r.startYear, 2015);
    assert.equal(r.cumulative, 78_000);
    assert.equal(r.nonResidentDeduction, 16_000);
    assert.equal(r.roomNow, 62_000);
    assert.deepEqual(r.nonResidentYears, [2015, 2020]);
  });

  test("ignores years before eligibility starts", () => {
    const r = check(input({ birthYear: 2002, nonResidentYears: [2012, 2019, 2021] }));
    assert.deepEqual(r.nonResidentYears, [2021]);
    assert.equal(r.roomNow, 45_500 - 6_000);
  });

  test("every year non-resident zeroes the room", () => {
    const years = Array.from({ length: 7 }, (_, k) => 2020 + k);
    const r = check(input({ birthYear: 2002, nonResidentYears: years }));
    assert.equal(r.cumulativeAfterNonResidency, 0);
    assert.equal(r.allYearsNonResident, true);
  });

  test("results show the deduction and the non-resident deposit tax note", () => {
    const html = renderResults(check(input({ birthYear: 1997, nonResidentYears: [2015] })), OPTS);
    assert.match(html, /Full years as a non-resident \(2015\)<\/th><td>&minus;\$10,000/);
    assert.match(html, /taxed at 1% a month/);
  });
});

describe("5.8 growth and losses don't move room", () => {
  test("$50k deposited that grew to $80k still counts $50k contributed", () => {
    const r = check(input({ birthYear: 1985, lifetimeContributions: 50_000 }));
    assert.equal(r.roomNow, 109_000 - 50_000);
  });
  test("withdrawing the grown $80k restores the full $80k", () => {
    const r = check(input({ birthYear: 1985, lifetimeContributions: 50_000, priorWithdrawals: 80_000 }));
    assert.equal(r.roomNow, 109_000 - 50_000 + 80_000);
  });
});

describe("section 7 validation", () => {
  test("not eligible yet: blocked with the spec message", () => {
    assert.equal(validate(input({ birthYear: 2009 })).errors.birthYear, NOT_ELIGIBLE_MESSAGE);
    const r = check(input({ birthYear: 2009 }));
    assert.equal(r.eligible, false);
    assert.equal(r.outcome, "not_eligible");
  });
  test("birth year range 1900 to 2026", () => {
    assert.ok(validate(input({ birthYear: 1899 })).errors.birthYear);
    assert.ok(validate(input({ birthYear: 2027 })).errors.birthYear);
    assert.equal(validate(input({ birthYear: 1900 })).errors.birthYear, undefined);
  });
  test("money fields: required, not negative; over $10M warns but does not block", () => {
    assert.ok(validate(input({ lifetimeContributions: null })).errors.lifetimeContributions);
    assert.ok(validate(input({ priorWithdrawals: -1 })).errors.priorWithdrawals);
    const v = validate(input({ lifetimeContributions: 10_000_001 }));
    assert.equal(v.errors.lifetimeContributions, undefined);
    assert.ok(v.warnings.lifetimeContributions);
    assert.equal(validate(input({ plannedDeposit: null })).errors.plannedDeposit, undefined);
  });
  test("withdrawals may exceed contributions (growth), no error", () => {
    const v = validate(input({ lifetimeContributions: 10_000, priorWithdrawals: 15_000, thisYearWithdrawals: 3_000 }));
    assert.deepEqual(v.errors, {});
  });
  test("residency year required when 'became resident later' is chosen", () => {
    assert.ok(validate(input({ residentLater: true, residencyYear: null })).errors.residencyYear);
  });
});

describe("every results screen: staleness note, disclaimer, copy rules", () => {
  const scenarios: [string, CheckerInput][] = [
    ["josie", josieExample()],
    ["josie + 5.1", { ...josieExample(), plannedDeposit: 20_000 }],
    ["over-contributed", input({ birthYear: 2006, lifetimeContributions: 25_000 })],
    ["zero room", input({ birthYear: 2006, lifetimeContributions: 21_000 })],
    ["turned 18", input({ birthYear: 2008 })],
    ["newcomer 2026", input({ birthYear: 1980, residentLater: true, residencyYear: 2026 })],
    ["non-resident", input({ birthYear: 1997, nonResidentYears: [2015, 2016] })],
    ["best guess, huge", input({ bestGuess: true, lifetimeContributions: 20_000_000 })],
    ["not eligible", input({ birthYear: 2010 })],
  ];
  for (const [name, i] of scenarios) {
    test(name, () => {
      const html = renderResults(check(i), OPTS) + renderResults(check(i), { ...OPTS, example: true });
      assert.ok(html.includes(STALENESS_NOTE), "staleness note (5.5)");
      assert.ok(html.includes(DISCLAIMER), "disclaimer");
      assert.doesNotMatch(html, /—/, "no em dashes");
      assert.doesNotMatch(html, /you should/i, "no advice language");
      assert.doesNotMatch(html, /hidden_files|tfsa-task/, "no internal paths");
    });
  }
});

describe("analytics tokens", () => {
  test("outcome, calculator, and input tokens are safe class values", () => {
    for (const v of ["tfsa_room_checker", "resident_later_yes", "resident_later_no", "best_guess_on",
      "not_eligible", "room_available", "no_room", "over_contributed"]) {
      assert.ok(isSafeValue(v), v);
    }
  });
});
