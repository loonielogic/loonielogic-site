/**
 * newsletter.ts: the single config module for the LoonieLogic newsletter.
 *
 * - Forms POST straight to the email provider (ESP). This site never sees,
 *   stores, or logs an address; the provider runs double opt-in.
 * - Until a provider is chosen, ESP_FORM_ACTION_URL stays a placeholder and
 *   every form renders with its submit button disabled plus an honest
 *   "opens at launch" line. No consent is collected into the void.
 * - Every visitor-facing newsletter string lives in NEWSLETTER_COPY. The
 *   components render from it and the build gate checks rendered pages
 *   against it, so a copy change is one reviewed edit here.
 */

/** Placeholder until the provider account exists. Valid values: this exact
 *  constant, or the provider's https:// form action URL. */
export const ESP_FORM_ACTION_PLACEHOLDER = "REPLACE_WITH_ESP_FORM_ACTION_URL";
export const ESP_FORM_ACTION_URL: string = ESP_FORM_ACTION_PLACEHOLDER;

/**
 * Field names the provider's form endpoint expects. Set at provider setup.
 * `source` and `consentVersion` are optional hidden fields for the consent
 * record (placement token and copy version); null means not sent.
 */
export const ESP_FIELDS: {
  email: string;
  firstName: string;
  newsletterOptIn: string;
  source: string | null;
  consentVersion: string | null;
} = {
  email: "email",
  firstName: "first_name",
  newsletterOptIn: "newsletter_opt_in",
  source: null,
  consentVersion: null,
};

/** Double opt-in contract: 48h confirm window, zero reminder nudges. */
export const DOUBLE_OPT_IN = {
  confirmWindowHours: 48,
  reminderNudges: 0,
} as const;

/** Bump whenever consent wording changes, so records show which text was seen. */
export const COPY_VERSION = "v1_2026_09_30";

export type EspUrlState = "placeholder" | "configured" | "invalid";

/** Classify a form action URL: the placeholder, a real https URL, or neither. */
export function espUrlState(url: string = ESP_FORM_ACTION_URL): EspUrlState {
  if (url === ESP_FORM_ACTION_PLACEHOLDER) return "placeholder";
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.includes(".") ? "configured" : "invalid";
  } catch {
    return "invalid";
  }
}

/** True only when the action URL is a real https URL. */
export function isNewsletterConfigured(url: string = ESP_FORM_ACTION_URL): boolean {
  return espUrlState(url) === "configured";
}

/**
 * Analytics placement tokens (class tokens only, never page text). Every
 * form or return page passes one of these; the analytics sanitizer
 * accepts them as-is.
 */
export const NEWSLETTER_PLACEMENTS = [
  "home_inline",
  "home_footer",
  "learn_end",
  "compare_end",
  "learn_hub",
  "calculators_hub",
  "compare_hub",
  "newsletter_landing",
  "email_return",
] as const;
export type NewsletterPlacementToken = (typeof NEWSLETTER_PLACEMENTS)[number];

/**
 * Copy registry. Keys marked "§8" are the spec's copy deck, rendered
 * verbatim except that dashes are written as plain punctuation (house
 * style: no dashes in copy). Test coverage pins every §8 string.
 */
export const NEWSLETTER_COPY = {
  /* §8: on-site form */
  heading: "Get the LoonieLogic newsletter",
  purpose:
    "New guides, tool updates, and Canadian money deadlines, about twice a month. You can unsubscribe anytime.",
  emailPlaceholder: "you@example.ca",
  submit: "Subscribe",
  /* §8: shown by the provider after submit (configured at provider setup) */
  confirmationScreen:
    "Check your inbox. Click the confirm link to finish subscribing. It expires in 48 hours.",
  /* §8: double opt-in email (configured at provider setup) */
  doubleOptInSubject: "Confirm your LoonieLogic subscription",
  doubleOptInBody:
    "You're one click from the LoonieLogic newsletter (new guides, tool updates, and Canadian money deadlines, ~2x/month). [Confirm subscription]. Link expires in 48 hours. Didn't sign up? Ignore this email. LoonieLogic · [mailing address] · [contact]",
  welcomeSubject: "Welcome to LoonieLogic: start here",
  /* §8: lead-magnet form variant. {asset} is replaced with the asset name. */
  leadMagnetDelivery: "We'll email the {asset} to this address.",
  leadMagnetOptIn:
    "Also send me the LoonieLogic newsletter (new guides, tool updates, money deadlines; unsubscribe anytime).",
  /* §8: footer on every email */
  cemFooter:
    "LoonieLogic · [mailing address] · You're receiving this because you subscribed at loonielogic.ca. [Unsubscribe] (processed same-day).",

  /* Site UI strings (not in §8, still registry-controlled) */
  emailLabel: "Email address",
  firstNameLabel: "First name (optional)",
  privacyNotice: "We use your email only to send the newsletter. It is never sold or shared.",
  privacyLinkLabel: "Read the privacy policy",
  unconfigured: "Email signup opens at launch. Check back soon.",
  softLink: "Get calculator updates by email",
  contextExplainer: "New guides like this monthly. Join the newsletter.",
  contextCompare: "Comparison updates when promos change. Join the newsletter.",
} as const;

export type NewsletterCopyKey = keyof typeof NEWSLETTER_COPY;

/** The copy-deck (§8) keys pinned verbatim by tests. */
export const SPEC_COPY_KEYS = [
  "heading",
  "purpose",
  "emailPlaceholder",
  "submit",
  "confirmationScreen",
  "doubleOptInSubject",
  "doubleOptInBody",
  "welcomeSubject",
  "leadMagnetDelivery",
  "leadMagnetOptIn",
  "cemFooter",
] as const satisfies readonly NewsletterCopyKey[];

export const PRIVACY_HREF = "/privacy";
export const NEWSLETTER_HREF = "/newsletter";

/** "We'll email the TFSA room worksheet to this address." */
export function leadMagnetDeliveryLine(assetName: string): string {
  return NEWSLETTER_COPY.leadMagnetDelivery.replace("{asset}", assetName);
}

/** What a form renders, derived from config. Pure, so tests cover both states. */
export interface FormState {
  configured: boolean;
  /** Form action; undefined while unconfigured (no placeholder in public HTML). */
  action: string | undefined;
  submitDisabled: boolean;
  /** Honest status line shown while unconfigured; null once live. */
  statusLine: string | null;
}

export function formState(url: string = ESP_FORM_ACTION_URL): FormState {
  const configured = isNewsletterConfigured(url);
  return {
    configured,
    action: configured ? url : undefined,
    submitDisabled: !configured,
    statusLine: configured ? null : NEWSLETTER_COPY.unconfigured,
  };
}
