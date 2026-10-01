/**
 * faq-schema.ts — FAQPage JSON-LD emitter (item 67).
 *
 * Item 34 authored the FAQ blocks into src/data/sitemap.json (faq[] +
 * faq_pages: ["FAQPage"]) for the 10 explainer pages; BaseLayout calls
 * faqPageNode(slug) and drops the returned node into the page's JSON-LD
 * @graph. The markup is always exactly the manifest's questions and
 * answers — never a parallel copy that can drift.
 *
 * SEO technical spec §1: FAQPage rides alongside the Article (or
 * Comparison/Calculator) node in the same @graph. Pages with no FAQ
 * blocks (calculators, hubs, kids lessons, legal) get no node.
 */
import sitemap from "../data/sitemap.json";

export interface FaqEntry {
  q: string;
  a: string;
}

interface ManifestPage {
  slug?: string;
  faq?: FaqEntry[];
}

const pages = (sitemap as { pages?: ManifestPage[] }).pages ?? [];
const faqBySlug = new Map<string, FaqEntry[]>();
for (const p of pages) {
  if (typeof p.slug === "string") faqBySlug.set(p.slug, p.faq ?? []);
}

/** Manifest FAQ blocks for a slug; [] when the page carries none. */
export function faqForSlug(slug: string): FaqEntry[] {
  return faqBySlug.get(slug) ?? [];
}

/** Slugs that carry FAQ blocks in the manifest (sorted, for tests). */
export function faqSlugs(): string[] {
  return [...faqBySlug.entries()]
    .filter(([, faq]) => faq.length > 0)
    .map(([slug]) => slug)
    .sort();
}

/**
 * FAQPage JSON-LD node for the page <head>, or undefined when the
 * manifest carries no FAQ blocks for this slug. Copy is passed through
 * verbatim; the manifest gates (q 20-300ch, a 40-1200ch, zero em
 * dashes, no "you should") are enforced by validate-content.
 */
export function faqPageNode(slug: string): Record<string, unknown> | undefined {
  const entries = faqForSlug(slug);
  if (entries.length === 0) return undefined;
  return {
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({
      "@type": "Question",
      name: e.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: e.a,
      },
    })),
  };
}
