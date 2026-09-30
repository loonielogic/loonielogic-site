/**
 * analytics.ts — the single entry point for LoonieLogic analytics (Umami
 * Cloud, cookieless). Per the analytics privacy spec (§3, §5):
 *
 * - One config: the website ID and the kill switch live here and nowhere else.
 *   BaseLayout renders the Umami snippet only while isUmamiEnabled is true
 *   (kill switch on AND a real website ID set), and track() is a no-op when
 *   it is false.
 * - Event names are snake_case and domain-prefixed (calc_, hub_, guided_path_,
 *   quiz_, newsletter_, affiliate_). Only names in EVENTS can be sent, and each
 *   event may carry only the prop keys listed for it.
 * - Props are never raw numbers or free text. Values must be booleans or short
 *   snake_case class tokens (e.g. `income_band_80_120k`, `province: "on"`);
 *   anything else is dropped before it leaves the page. Use band() to turn an
 *   amount into a token.
 *
 * Hooks not wired yet (no UI exists in this build): quiz_*, newsletter_*,
 * affiliate_link_clicked, calc_reset. When that UI ships, either call track()
 * from its script or put `data-analytics-event="<name>"` plus
 * `data-analytics-<prop>="<token>"` on the clickable element and call
 * bindClickTracking() once from the page's <script>.
 */

/** Umami Cloud website ID. Replace the placeholder with the real ID. */
export const UMAMI_WEBSITE_ID = "3bf89692-f9d7-42e0-908f-52e1f623c982";
export const UMAMI_SCRIPT_SRC = "https://cloud.umami.is/script.js";

/**
 * Cloudflare Web Analytics beacon token (from the Cloudflare dashboard).
 * Second opinion only: baseline pageviews + real-user Core Web Vitals.
 * Replace the placeholder with the real token.
 */
export const CF_BEACON_TOKEN = "REPLACE_WITH_CLOUDFLARE_BEACON_TOKEN";
export const CF_BEACON_SCRIPT_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

/** Kill switch: false removes every snippet from every page and silences track(). */
export const ANALYTICS_ENABLED = true;

const isPlaceholder = (v: string) => !v || v.startsWith("REPLACE_WITH_");

/** True only when the account is created and the real ID is in. */
export const isUmamiEnabled = ANALYTICS_ENABLED && !isPlaceholder(UMAMI_WEBSITE_ID);
/** True only when the beacon token is configured in the Cloudflare dashboard. */
export const isCfBeaconEnabled = ANALYTICS_ENABLED && !isPlaceholder(CF_BEACON_TOKEN);

/** Event taxonomy: event name → the only prop keys it may carry.
 *  Spec §2b budget rule: SEND AT MOST 2 PROPS per event (pageview counts as 1
 *  event, each custom event as 1, each stored property as 1 more against the
 *  100K/mo Hobby quota). The allowlist may name more keys than that; callers
 *  must stay within the budget. */
export const EVENTS = {
  calc_started: ["calculator"],
  calc_input_set: ["calculator", "field", "value"],
  calc_assumption_changed: ["calculator", "field"],
  calc_result_viewed: ["calculator", "mode", "province", "outcome", "timeline_band"],
  calc_reset: ["calculator"],
  calc_error_shown: ["calculator", "error_class"],
  hub_card_clicked: ["hub", "card", "position"],
  guided_path_clicked: ["path", "target"],
  quiz_started: ["quiz"],
  quiz_completed: ["quiz", "result_class"],
  newsletter_signup_submitted: ["placement"],
  affiliate_link_clicked: ["merchant", "placement", "position"],
} as const satisfies Record<string, readonly string[]>;

export type EventName = keyof typeof EVENTS;
export type PropValue = string | boolean;
export type Props = Record<string, PropValue>;

// Class tokens: lowercase snake_case, at least one letter, no run of 4+ digits
// (so raw amounts, years, and phone-like strings cannot slip through).
const TOKEN = /^[a-z0-9_]{1,50}$/;
const HAS_LETTER = /[a-z]/;
const LONG_DIGITS = /\d{4,}/;

export function isSafeValue(v: unknown): v is PropValue {
  if (typeof v === "boolean") return true;
  if (typeof v !== "string") return false;
  return TOKEN.test(v) && HAS_LETTER.test(v) && !LONG_DIGITS.test(v);
}

/**
 * Keep only allowlisted keys with safe values. Returns null for an unknown
 * event name. Dropped props are reported in dev so they get fixed at source.
 */
export function sanitizeProps(name: string, props: Record<string, unknown> = {}): Props | null {
  if (!Object.hasOwn(EVENTS, name)) {
    warn(`unknown event "${name}" dropped`);
    return null;
  }
  const allowed: readonly string[] = EVENTS[name as EventName];
  const clean: Props = {};
  for (const [k, v] of Object.entries(props)) {
    if (allowed.includes(k) && isSafeValue(v)) clean[k] = v;
    else warn(`${name}: prop "${k}" dropped (not allowlisted or not a class token)`);
  }
  return clean;
}

/**
 * Turn an amount into a band token. Edges are ascending; `scale`/`suffix`
 * shorten labels (scale 1000, suffix "k": 95000 → `income_band_80_120k`).
 * Below the first edge → `<prefix>_under_<e0>`, at or above the last →
 * `<prefix>_<eN>_plus`, non-finite → `<prefix>_unknown`.
 */
export function band(
  prefix: string,
  value: number,
  edges: number[],
  { scale = 1, suffix = "" }: { scale?: number; suffix?: string } = {},
): string {
  const f = (n: number) => `${Math.round(n / scale)}`;
  if (!Number.isFinite(value) || edges.length === 0) return `${prefix}_unknown`;
  if (value < edges[0]) return `${prefix}_under_${f(edges[0])}${suffix}`;
  for (let k = 1; k < edges.length; k++) {
    if (value < edges[k]) return `${prefix}_${f(edges[k - 1])}_${f(edges[k])}${suffix}`;
  }
  return `${prefix}_${f(edges[edges.length - 1])}${suffix}_plus`;
}

/** "/compare/tfsa-vs-rrsp" → "compare_tfsa_vs_rrsp"; "/learn/" → "learn". */
export function slugToken(slug: string): string {
  return slug.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "home";
}

/** Send one event through Umami. Safe to call before the script loads (dropped). */
export function track(name: EventName, props: Props = {}): void {
  if (!ANALYTICS_ENABLED || typeof window === "undefined") return;
  const clean = sanitizeProps(name, props);
  if (!clean) return;
  // Event-budget rule (spec §2b): Umami counts each stored property as an
  // event, so every custom event carries at most 2 properties.
  const keys = Object.keys(clean);
  if (keys.length > 2) {
    warn(`${name}: ${keys.length} props exceeds the 2-prop event budget; keeping first 2`);
    for (const k of keys.slice(2)) delete clean[k];
  }
  try {
    window.umami?.track(name, clean);
  } catch {
    // Analytics must never break the page.
  }
}

/**
 * Delegated click tracking for `[data-analytics-event]` elements. Every other
 * `data-analytics-*` attribute becomes a prop (`data-analytics-card` → `card`).
 */
export function bindClickTracking(root: Document | HTMLElement = document): void {
  root.addEventListener("click", (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>("[data-analytics-event]");
    if (!el) return;
    const props: Props = {};
    for (const [key, value] of Object.entries(el.dataset)) {
      if (key === "analyticsEvent" || !key.startsWith("analytics") || value === undefined) continue;
      const prop = key.slice("analytics".length).replace(/^[A-Z]/, (c) => c.toLowerCase())
        .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      props[prop] = value;
    }
    track(el.dataset.analyticsEvent as EventName, props);
  });
}

function warn(msg: string) {
  if (import.meta.env?.DEV) console.warn(`[analytics] ${msg}`);
}

declare global {
  interface Window {
    umami?: { track: (name: string, data?: Props) => void };
  }
}
