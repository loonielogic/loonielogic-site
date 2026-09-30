/**
 * Tests for the newsletter config: placeholder detection, the configured /
 * unconfigured form state, and the copy registry pinned against the
 * newsletter spec's §8 copy deck.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DOUBLE_OPT_IN,
  ESP_FORM_ACTION_PLACEHOLDER,
  ESP_FORM_ACTION_URL,
  NEWSLETTER_COPY,
  NEWSLETTER_PLACEMENTS,
  SPEC_COPY_KEYS,
  espUrlState,
  formState,
  isNewsletterConfigured,
  leadMagnetDeliveryLine,
} from "./newsletter.ts";

const REAL = "https://example-esp.com/forms/abc123/subscribe";
// Built from code points so no dash character sits in this file.
const DASH = String.fromCharCode(0x2014);
const ANY_DASH = new RegExp(`[${String.fromCharCode(0x2013)}${DASH}]`);

describe("ESP URL config", () => {
  it("the shipped value is the placeholder or an https URL, nothing else", () => {
    assert.notEqual(espUrlState(ESP_FORM_ACTION_URL), "invalid");
  });

  it("detects the placeholder", () => {
    assert.equal(ESP_FORM_ACTION_PLACEHOLDER, "REPLACE_WITH_ESP_FORM_ACTION_URL");
    assert.equal(espUrlState(ESP_FORM_ACTION_PLACEHOLDER), "placeholder");
    assert.equal(isNewsletterConfigured(ESP_FORM_ACTION_PLACEHOLDER), false);
  });

  it("is configured only for a real https URL", () => {
    assert.equal(espUrlState(REAL), "configured");
    assert.equal(isNewsletterConfigured(REAL), true);
  });

  it("rejects http, relative, empty, and look-alike placeholder values", () => {
    for (const bad of ["http://example-esp.com/f", "/subscribe", "", "not a url", "REPLACE_WITH_SOMETHING_ELSE", "https://localhost/f", "javascript:alert(1)"]) {
      assert.equal(isNewsletterConfigured(bad), false, bad);
      assert.equal(espUrlState(bad), "invalid", bad);
    }
  });
});

describe("form state (what the components render)", () => {
  it("unconfigured: submit disabled, no action URL, honest status line", () => {
    const s = formState(ESP_FORM_ACTION_PLACEHOLDER);
    assert.equal(s.configured, false);
    assert.equal(s.submitDisabled, true);
    assert.equal(s.action, undefined);
    assert.equal(s.statusLine, "Email signup opens at launch. Check back soon.");
  });

  it("configured: submit enabled, posts to the provider, no status line", () => {
    const s = formState(REAL);
    assert.equal(s.configured, true);
    assert.equal(s.submitDisabled, false);
    assert.equal(s.action, REAL);
    assert.equal(s.statusLine, null);
  });

  it("an invalid URL is treated as unconfigured, never posted to", () => {
    const s = formState("http://example-esp.com/f");
    assert.equal(s.submitDisabled, true);
    assert.equal(s.action, undefined);
  });
});

/* The spec's §8 copy deck as written (dashes escaped so none sit in this file). */
const SPEC_S8: Record<(typeof SPEC_COPY_KEYS)[number], string> = {
  heading: "Get the LoonieLogic newsletter",
  purpose: `New guides, tool updates, and Canadian money deadlines ${DASH} about twice a month. You can unsubscribe anytime.`,
  emailPlaceholder: "you@example.ca",
  submit: "Subscribe",
  confirmationScreen: `Check your inbox. Click the confirm link to finish subscribing ${DASH} it expires in 48 hours.`,
  doubleOptInSubject: "Confirm your LoonieLogic subscription",
  doubleOptInBody: `You're one click from the LoonieLogic newsletter (new guides, tool updates, and Canadian money deadlines, ~2x/month). [Confirm subscription] ${DASH} link expires in 48 hours. Didn't sign up? Ignore this email. LoonieLogic · [mailing address] · [contact]`,
  welcomeSubject: `Welcome to LoonieLogic ${DASH} start here`,
  leadMagnetDelivery: "We'll email the TFSA room worksheet to this address.",
  leadMagnetOptIn: `Also send me the LoonieLogic newsletter (new guides, tool updates, money deadlines ${DASH} unsubscribe anytime).`,
  cemFooter: `LoonieLogic · [mailing address] · You're receiving this because you subscribed at loonielogic.ca. [Unsubscribe] ${DASH} processed same-day.`,
};

/** The registry's house-style rendering of each §8 string (dash → punctuation). */
const EXPECTED: Record<(typeof SPEC_COPY_KEYS)[number], string> = {
  heading: "Get the LoonieLogic newsletter",
  purpose: "New guides, tool updates, and Canadian money deadlines, about twice a month. You can unsubscribe anytime.",
  emailPlaceholder: "you@example.ca",
  submit: "Subscribe",
  confirmationScreen: "Check your inbox. Click the confirm link to finish subscribing. It expires in 48 hours.",
  doubleOptInSubject: "Confirm your LoonieLogic subscription",
  doubleOptInBody:
    "You're one click from the LoonieLogic newsletter (new guides, tool updates, and Canadian money deadlines, ~2x/month). [Confirm subscription]. Link expires in 48 hours. Didn't sign up? Ignore this email. LoonieLogic · [mailing address] · [contact]",
  welcomeSubject: "Welcome to LoonieLogic: start here",
  leadMagnetDelivery: "We'll email the TFSA room worksheet to this address.",
  leadMagnetOptIn: "Also send me the LoonieLogic newsletter (new guides, tool updates, money deadlines; unsubscribe anytime).",
  cemFooter:
    "LoonieLogic · [mailing address] · You're receiving this because you subscribed at loonielogic.ca. [Unsubscribe] (processed same-day).",
};

/** Words only: proves a rendering changed punctuation and case, never wording. */
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9~']+/).filter(Boolean);

function registryValue(key: (typeof SPEC_COPY_KEYS)[number]): string {
  return key === "leadMagnetDelivery" ? leadMagnetDeliveryLine("TFSA room worksheet") : NEWSLETTER_COPY[key];
}

describe("copy registry vs spec §8", () => {
  it("covers every §8 string", () => {
    assert.deepEqual([...SPEC_COPY_KEYS].sort(), Object.keys(SPEC_S8).sort());
  });

  for (const key of SPEC_COPY_KEYS) {
    it(`${key}: pinned rendering`, () => {
      assert.equal(registryValue(key), EXPECTED[key]);
    });
    it(`${key}: same words as the spec, only punctuation differs`, () => {
      assert.deepEqual(words(registryValue(key)), words(SPEC_S8[key]));
    });
  }

  it("no dashes and no 'you should' anywhere in the registry", () => {
    for (const [k, v] of Object.entries(NEWSLETTER_COPY)) {
      assert.ok(!ANY_DASH.test(v), `${k} contains a dash`);
      assert.ok(!/you should/i.test(v), `${k} says "you should"`);
    }
  });

  it("the unconfigured line never claims an email was sent", () => {
    assert.ok(!/inbox|check your email|confirm/i.test(NEWSLETTER_COPY.unconfigured));
  });
});

describe("double opt-in constants", () => {
  it("48-hour window with zero reminder nudges", () => {
    assert.equal(DOUBLE_OPT_IN.confirmWindowHours, 48);
    assert.equal(DOUBLE_OPT_IN.reminderNudges, 0);
  });

  it("the confirm-window copy matches the constant", () => {
    const h = `${DOUBLE_OPT_IN.confirmWindowHours} hours`;
    assert.ok(NEWSLETTER_COPY.confirmationScreen.includes(h));
    assert.ok(NEWSLETTER_COPY.doubleOptInBody.includes(h));
  });
});

describe("placement tokens", () => {
  it("are unique", () => {
    assert.equal(new Set(NEWSLETTER_PLACEMENTS).size, NEWSLETTER_PLACEMENTS.length);
  });
});
