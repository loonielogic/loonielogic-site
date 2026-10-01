/**
 * og.ts: per-page Open Graph share cards (1200 x 630).
 *
 * The PNGs are rendered ahead of the Astro build by
 * `npm run og` (src/scripts/build-og-images.ts), which drives headless
 * Chromium and writes public/og/<name>.png plus the registry in
 * src/data/og-images.json. BaseLayout reads the registry by slug; a page
 * with no entry falls back to DEFAULT_OG_IMAGE. og-images.test.ts fails
 * the build if the registry drifts from the page titles/meta it was
 * rendered from, so a title change means re-running `npm run og`.
 */

import registry from "../data/og-images.json";

/** Domain line printed on every card. Placeholder until the real domain is bought: one edit at launch. */
export const OG_DOMAIN = "loonielogic.ca";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Brand brief: card titles are hard-capped at 60 characters. */
export const OG_TITLE_MAX = 60;
/** Second line (verdict or meta description) cap, sized to fit two lines on the card. */
export const OG_LINE_MAX = 110;

export type OgKind = "home" | "hub" | "explainer" | "comparison" | "calculator" | "legal" | "glossary" | "kids-lesson" | "wordmark";

export interface OgEntry {
  slug: string;
  kind: OgKind;
  /** File name under public/og/, without extension. */
  name: string;
  eyebrow: string;
  title: string;
  /** Verdict (comparisons) or truncated meta description. Empty for the wordmark card. */
  line: string;
  isVerdict: boolean;
  alt: string;
}

export interface OgRegistryEntry {
  image: string;
  alt: string;
  title: string;
  line: string;
}

/**
 * Fit `s` into `max` characters. Prefers ending on a full sentence, then on a
 * clause (comma, colon, semicolon) past the halfway mark, then on a word;
 * anything short of a full sentence gets an ellipsis.
 */
export function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const sentence = cut.lastIndexOf(". ");
  if (sentence >= max * 0.5) return cut.slice(0, sentence + 1);
  const clause = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf(": "), cut.lastIndexOf("; "));
  const wordEnd = clean[cut.length] === " " ? cut.length : cut.lastIndexOf(" ");
  const end = clause >= max * 0.5 ? clause : wordEnd;
  const trimmed = cut.slice(0, end > 0 ? end : cut.length).replace(/[\s,;:.\-(&+]+$/, "");
  return `${trimmed}…`;
}

/** Card title: drop the " | LoonieLogic" suffix (the card carries the brand), then cap. */
export function ogTitle(pageTitle: string): string {
  return truncate(pageTitle.replace(/\s*\|\s*LoonieLogic\s*$/, ""), OG_TITLE_MAX);
}

/** "/compare/tfsa-vs-rrsp" -> "compare-tfsa-vs-rrsp"; "/" -> "home". */
export function ogName(slug: string): string {
  const s = slug.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
  return s || "home";
}

const OG_REGISTRY = registry as Record<string, OgRegistryEntry>;

/** Registry entry for a page slug, or undefined if the page has no card. */
export function ogImageFor(slug: string): OgRegistryEntry | undefined {
  return OG_REGISTRY[slug];
}
