/**
 * newsletter-gates.ts: build-gate rules for newsletter capture, shared by
 * src/scripts/validate-content.ts and its tests. Pure functions: each
 * returns error strings (build fails) or warnings (build continues).
 *
 * Source pass (before astro build):
 *   - ESP form action URL: placeholder WARNS, anything that is neither the
 *     placeholder nor an https URL FAILS
 *   - no hard-coded newsletter copy outside the registry (copy drift)
 *   - newsletter components contain no popup/timer/scroll machinery
 *
 * Rendered pass (after astro build, over dist/):
 *   - every capture form carries the purpose line and a privacy-policy link
 *   - every data-nl-copy element matches the registry verbatim
 *   - no forms on legal pages, 404, /go/, glossary, calculator tools,
 *     or the confirmation page
 *   - while unconfigured: submit disabled, no action URL, honest status
 *     line, and never the "check your inbox" confirmation
 *   - lead-magnet opt-in checkbox is never pre-ticked
 *   - newsletter pages are noindex and absent from sitemap.xml while draft
 */

import {
  ESP_FORM_ACTION_PLACEHOLDER,
  NEWSLETTER_COPY,
  PRIVACY_HREF,
  espUrlState,
  type NewsletterCopyKey,
} from "../config/newsletter.ts";

type Copy = Record<NewsletterCopyKey, string>;

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

export function checkEspConfig(url: string): { errors: string[]; warnings: string[] } {
  const state = espUrlState(url);
  if (state === "placeholder") {
    return {
      errors: [],
      warnings: ["newsletter form action is still the placeholder: forms render disabled until the provider URL is set"],
    };
  }
  if (state === "invalid") {
    return { errors: [`newsletter form action must be an https:// URL or the placeholder, got "${url}"`], warnings: [] };
  }
  return { errors: [], warnings: [] };
}

/* ------------------------------------------------------------------ */
/* Source pass                                                         */
/* ------------------------------------------------------------------ */

/** Registry strings distinctive enough that a literal copy elsewhere is drift. */
const DRIFT_KEYS: NewsletterCopyKey[] = [
  "heading",
  "purpose",
  "privacyNotice",
  "confirmationScreen",
  "leadMagnetOptIn",
  "unconfigured",
  "softLink",
  "contextExplainer",
  "contextCompare",
];

/** Popup, timer, and scroll-trigger patterns banned by the newsletter spec. */
const BANNED_BEHAVIOUR: [RegExp, string][] = [
  [/\bsetTimeout\b|\bsetInterval\b/, "timer"],
  [/\bmouseleave\b|\bmouseout\b|exit[-_ ]?intent/i, "exit-intent trigger"],
  [/\bIntersectionObserver\b|addEventListener\(\s*["']scroll["']/, "scroll trigger"],
  [/<dialog\b|showModal\(/, "modal"],
  [/position:\s*(fixed|sticky)/, "fixed/slide-in positioning"],
];

/**
 * Check one source file. `path` is repo-relative. Only .astro/.ts files
 * under src/components, src/pages, and src/layouts are page copy; the
 * registry itself and test files are exempt.
 */
export function checkSourceFile(path: string, text: string, copy: Copy = NEWSLETTER_COPY): string[] {
  const errors: string[] = [];
  if (!/^src\/(components|pages|layouts)\/.*\.(astro|ts)$/.test(path) || path.endsWith(".test.ts")) return errors;

  // Loose match: collapse whitespace and ignore dash/punctuation variants, so
  // a pasted spec string with a dash is caught as well as an exact copy.
  const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const looseText = loose(text);
  for (const key of DRIFT_KEYS) {
    if (looseText.includes(loose(copy[key]))) {
      errors.push(`${path}: hard-coded newsletter copy "${key}"; render NEWSLETTER_COPY.${key} instead`);
    }
  }

  if (/\/Newsletter[A-Za-z]*\.astro$/.test(path)) {
    for (const [re, label] of BANNED_BEHAVIOUR) {
      if (re.test(text)) errors.push(`${path}: ${label} found; popups, slide-ins, and timed capture are banned`);
    }
  }
  return errors;
}

/* ------------------------------------------------------------------ */
/* Rendered pass                                                       */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Visible text of an HTML fragment: tags stripped, entities decoded, whitespace collapsed. */
export function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** "dist/learn/tfsa/index.html" relative path → "/learn/tfsa". */
export function routeOf(relPath: string): string {
  const r = relPath.replace(/\\/g, "/").replace(/(^|\/)index\.html$/, "").replace(/\.html$/, "");
  return "/" + r.replace(/^\/+|\/+$/g, "");
}

/** Routes that may never carry a newsletter form. */
export function isFormBanned(route: string, legalRoutes: Set<string>): boolean {
  return (
    legalRoutes.has(route) ||
    route === "/404" ||
    route.startsWith("/go/") ||
    route === "/learn/glossary" ||
    /^\/calculators\/.+/.test(route) ||
    route === "/newsletter/confirmed"
  );
}

interface FormBlock {
  kind: string;
  openTag: string;
  html: string;
}

function formsIn(html: string): FormBlock[] {
  const out: FormBlock[] = [];
  const re = /<form\b[^>]*>[\s\S]*?<\/form>/g;
  for (const m of html.matchAll(re)) {
    const openTag = m[0].slice(0, m[0].indexOf(">") + 1);
    const kind = openTag.match(/\sdata-newsletter-form="([^"]+)"/)?.[1];
    if (kind) out.push({ kind, openTag, html: m[0] });
  }
  return out;
}

function hasCopy(html: string, key: NewsletterCopyKey): boolean {
  return new RegExp(`\\sdata-nl-copy="${key}"`).test(html);
}

export interface RenderedPageInput {
  route: string;
  html: string;
  configured: boolean;
  legalRoutes: Set<string>;
  copy?: Copy;
}

export function checkRenderedPage({ route, html, configured, legalRoutes, copy = NEWSLETTER_COPY }: RenderedPageInput): string[] {
  const errors: string[] = [];
  const where = route;
  const forms = formsIn(html);

  if (forms.length > 0 && isFormBanned(route, legalRoutes)) {
    errors.push(`${where}: newsletter form on a page type that may not carry one`);
  }

  for (const f of forms) {
    const privacyLink = new RegExp(`<a\\b[^>]*href="${PRIVACY_HREF}"`).test(f.html);
    if (!privacyLink) errors.push(`${where}: newsletter form without a privacy-policy link`);
    if (!hasCopy(f.html, "privacyNotice")) errors.push(`${where}: newsletter form without the privacy notice`);

    if (f.kind === "capture" && !hasCopy(f.html, "purpose")) {
      errors.push(`${where}: newsletter form without the purpose line`);
    }
    if (f.kind === "lead_magnet") {
      if (!hasCopy(f.html, "leadMagnetOptIn")) errors.push(`${where}: lead-magnet form without the newsletter opt-in line`);
      for (const box of f.html.match(/<input\b[^>]*type="checkbox"[^>]*>/g) ?? []) {
        if (/\schecked(\s|=|>|\/)/.test(box)) errors.push(`${where}: newsletter opt-in checkbox is pre-ticked`);
      }
    }

    for (const input of f.html.match(/<input\b[^>]*type="email"[^>]*>/g) ?? []) {
      const ph = input.match(/\splaceholder="([^"]*)"/)?.[1];
      if (ph === undefined || decodeEntities(ph) !== copy.emailPlaceholder) {
        errors.push(`${where}: email placeholder does not match the registry`);
      }
      if (!/\srequired(\s|=|>|\/)/.test(input)) errors.push(`${where}: email field is not required`);
    }

    if (!configured) {
      const submit = f.html.match(/<button\b[^>]*type="submit"[^>]*>/)?.[0] ?? "";
      if (!/\sdisabled(\s|=|>|\/)/.test(submit)) errors.push(`${where}: submit must be disabled while the provider is unconfigured`);
      if (/\saction="/.test(f.openTag)) errors.push(`${where}: form has an action URL while the provider is unconfigured`);
      if (!hasCopy(f.html, "unconfigured")) errors.push(`${where}: unconfigured form without the "opens at launch" line`);
    }
  }

  // Registry drift: every tagged element must render its registry string.
  for (const m of html.matchAll(/<([a-z0-9]+)\b[^>]*\sdata-nl-copy="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    const key = m[2] as NewsletterCopyKey;
    const text = textOf(m[3]);
    if (!(key in copy)) {
      errors.push(`${where}: unknown newsletter copy key "${key}"`);
      continue;
    }
    const expected = copy[key];
    const ok =
      key === "leadMagnetDelivery"
        ? new RegExp(`^${escapeRe(expected).replace("\\{asset\\}", ".+")}$`).test(text)
        : text === expected;
    if (!ok) errors.push(`${where}: newsletter copy "${key}" drifted from the registry: "${text}"`);
  }

  // The "check your inbox" screen belongs to the provider, after a real send.
  if (!configured && textOf(html).includes(copy.confirmationScreen)) {
    errors.push(`${where}: shows the "check your inbox" confirmation while no email can be sent`);
  }

  if (route.startsWith("/newsletter") && !configured && !/<meta name="robots" content="noindex/.test(html)) {
    errors.push(`${where}: draft newsletter page must be noindex`);
  }

  if (html.includes(ESP_FORM_ACTION_PLACEHOLDER) || html.includes("REPLACE_WITH_")) {
    errors.push(`${where}: placeholder config value leaked into page HTML`);
  }
  return errors;
}

export function checkSitemapXml(xml: string, configured: boolean): string[] {
  if (configured) return [];
  return /<loc>[^<]*\/newsletter(\/[^<]*)?<\/loc>/.test(xml)
    ? ["sitemap.xml: lists a draft newsletter page"]
    : [];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
