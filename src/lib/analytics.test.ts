/**
 * analytics.test.ts — unit tests for the analytics library's pure functions.
 * track()/bindClickTracking() touch window/document and are covered by the
 * privacy lint (no raw values) plus manual QA, not by these tests.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSafeValue,
  sanitizeProps,
  band,
  slugToken,
  EVENTS,
} from "./analytics.ts";

describe("isSafeValue", () => {
  it("accepts class tokens and booleans", () => {
    assert.equal(isSafeValue("income_band_80_120k"), true);
    assert.equal(isSafeValue("province_on"), true);
    assert.equal(isSafeValue("timeline"), true);
    assert.equal(isSafeValue(true), true);
    assert.equal(isSafeValue(false), true);
  });

  it("rejects raw numbers and number-like strings", () => {
    assert.equal(isSafeValue("87500"), false); // no letter
    assert.equal(isSafeValue("income_87500"), false); // 4+ digit run
    assert.equal(isSafeValue("2026"), false);
    assert.equal(isSafeValue("room_109000"), false);
  });

  it("rejects free text, mixed case, and non-strings", () => {
    assert.equal(isSafeValue("Hello World"), false); // space + uppercase
    assert.equal(isSafeValue("savingsRate"), false); // camelCase
    assert.equal(isSafeValue("tfsa-vs-rrsp"), false); // hyphens
    assert.equal(isSafeValue(""), false);
    assert.equal(isSafeValue(42), false);
    assert.equal(isSafeValue(null), false);
    assert.equal(isSafeValue(undefined), false);
  });
});

describe("sanitizeProps", () => {
  it("keeps only allowlisted keys with safe values", () => {
    const out = sanitizeProps("calc_assumption_changed", {
      calculator: "down_payment_planner",
      field: "contract_rate",
    });
    assert.deepEqual(out, {
      calculator: "down_payment_planner",
      field: "contract_rate",
    });
  });

  it("drops non-allowlisted keys and unsafe values", () => {
    const out = sanitizeProps("calc_assumption_changed", {
      calculator: "down_payment_planner",
      field: "contract_rate",
      rawValue: "4.5", // not an allowlisted key
      extra: "nope",
    } as Record<string, unknown>);
    assert.deepEqual(out, {
      calculator: "down_payment_planner",
      field: "contract_rate",
    });
  });

  it("drops a raw-number value even on an allowlisted key", () => {
    const out = sanitizeProps("calc_input_set", {
      calculator: "down_payment_planner",
      field: "province",
      value: "87500",
    });
    assert.deepEqual(out, {
      calculator: "down_payment_planner",
      field: "province",
    });
  });

  it("returns null for unknown events", () => {
    assert.equal(sanitizeProps("not_a_real_event", { a: "b" }), null);
  });
});

describe("band", () => {
  const edges = [50_000, 80_000, 120_000];
  it("bands values into class tokens", () => {
    assert.equal(band("income", 30_000, edges, { scale: 1000, suffix: "k" }), "income_under_50k");
    assert.equal(band("income", 95_000, edges, { scale: 1000, suffix: "k" }), "income_80_120k");
    assert.equal(band("income", 200_000, edges, { scale: 1000, suffix: "k" }), "income_120k_plus");
  });

  it("handles non-finite input", () => {
    assert.equal(band("income", NaN, edges), "income_unknown");
  });

  it("produced tokens pass the safety check", () => {
    for (const v of [0, 30_000, 79_999, 120_000, 5_000_000]) {
      assert.equal(isSafeValue(band("income", v, edges, { scale: 1000, suffix: "k" })), true);
    }
  });
});

describe("slugToken", () => {
  it("converts slugs to safe tokens", () => {
    assert.equal(slugToken("/learn/tfsa"), "learn_tfsa");
    assert.equal(slugToken("/compare/tfsa-vs-rrsp"), "compare_tfsa_vs_rrsp");
    assert.equal(slugToken("/learn/"), "learn");
    assert.equal(slugToken("/"), "home");
  });
});

describe("event budget (spec section 2b)", () => {
  it("every wired event can be sent within 2 props", () => {
    // The events actually fired by this build, with the props they send.
    const wired: Record<string, string[]> = {
      calc_started: ["calculator"],
      calc_result_viewed: ["calculator", "mode"],
      calc_assumption_changed: ["calculator", "field"],
      calc_input_set: ["calculator", "value"],
      hub_card_clicked: ["hub", "card"],
      guided_path_clicked: ["path", "target"],
    };
    for (const [event, props] of Object.entries(wired)) {
      assert.ok(event in EVENTS, `${event} must be in the taxonomy`);
      assert.ok(props.length <= 2, `${event} sends ${props.length} props, budget is 2`);
      for (const p of props) {
        assert.ok(
          (EVENTS as Record<string, readonly string[]>)[event].includes(p),
          `${event}: prop "${p}" must be allowlisted`,
        );
      }
    }
  });
});
