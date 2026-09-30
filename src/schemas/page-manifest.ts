/**
 * page-manifest.ts — Zod schemas for the LoonieLogic content manifest.
 *
 * The manifest is the front matter every page carries (frontend-build-spec.md §6).
 * Astro Content Collections validate it at build; src/scripts/validate-content.ts
 * runs the referential-integrity gates (slug allowlist, figure keys, affiliate
 * merchants, review dates) that Zod alone cannot do.
 *
 * Written against Astro v6 (Content Layer API) + Zod v4. Verify both at kickoff
 * before locking — a 5-minute check, per the build spec §1.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// js-yaml parses unquoted YYYY-MM-DD values into JS Date objects, so the
// schema coerces Dates back to date strings before the regex runs. This keeps
// the documented front-matter template (unquoted dates) working in both the
// Astro content layer and the standalone validator.
const dateString = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z
    .string()
    .regex(DATE, "must be YYYY-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(d)), "must be a real date"),
);

const slugPath = z
  .string()
  .regex(/^\/[a-z0-9\-\/]*$/, "slug must be a lowercase path like /learn/tfsa");

export const PageType = z.enum([
  "home",
  "hub", // generated from sitemap.json — not an author-facing collection
  "calculator",
  "explainer",
  "comparison",
  "legal",
  "glossary",
]);

export const Cluster = z.enum([
  "tax",
  "retirement",
  "housing",
  "banking",
  "investing",
  "utility",
]);

export const Status = z.enum(["draft", "review", "live"]);

export const ReviewCadence = z.enum(["annual", "quarterly", "promo-watch"]);

export const NewsletterPlacement = z.enum(["none", "inline", "soft-link"]);
// Newsletter spec: NO forms on calculator result screens or quiz outcomes
// (soft link to /newsletter only); popups/slide-ins banned everywhere.

export const figureEntrySchema = z.object({
  key: z.string().min(1), // dot-namespaced key into src/data/figures/*.json
  source: z.string().min(1), // human-readable source label, e.g. "canada.ca — RC243"
  verified: dateString, // date the figure was last verified against the source
  expires: dateString.nullable(), // null for rules that never expire; a date for promos/quarterly figures
});

export const faqEntrySchema = z.object({
  q: z.string().min(20).max(300),
  a: z.string().min(40).max(1200),
});

export const affiliateLinkSchema = z.object({
  merchant: z.string().min(1), // key of src/data/affiliates/<merchant>.json
  position: z.string().min(1), // CTA position, e.g. "hero", "inline-2", "verdict"
  label: z.string().min(1), // exact CTA label — what the build renders
});

/* ------------------------------------------------------------------ */
/* Base manifest — every page carries these fields                     */
/* ------------------------------------------------------------------ */

export const pageManifestBase = z.object({
  /* identity */
  slug: slugPath,
  page_type: PageType,

  // 48-60 chars for content pages; home gets 48-80 for the brand title.
  // (The build FAILS on out-of-range titles — fix the copy, not the gate.)
  title: z.string().min(48).max(60),
  meta_description: z.string().min(140).max(160),

  /* publishing */
  wave: z.number().int().min(0).max(4), // 0 = foundation/home; 1-3 = sitemap waves
  status: Status,
  publish_date: dateString.nullable(),
  last_reviewed: dateString,

  /* figure provenance — feeds the Q4 rollover watch */
  figures: z.array(figureEntrySchema),

  /* navigation — hub-and-spoke from sitemap v1.2 */
  hub: slugPath.nullable(), // parent hub page (/learn/, /calculators/, /compare/)
  cluster: Cluster,
  related: z.array(slugPath).max(8),

  /* page-type extras */
  schema_primary: z
    .enum(["Article", "WebApplication", "CollectionPage", "Organization"])
    .optional(), // defaults by page_type per seo-technical-spec.md
  faq_pages: z.array(z.enum(["FAQPage", "ItemList"])).default([]),
  faq: z.array(faqEntrySchema).default([]),
  affiliate_disclosure: z.boolean().default(false),
  affiliate_links: z.array(affiliateLinkSchema).default([]),
  calculator_spec: z.string().nullable().default(null), // hidden_files/*-calculator-spec.md
  quiz_spec: z.string().nullable().default(null), // hidden_files/*-quiz-spec.md

  /* newsletter placement per newsletter-email-capture-spec.md */
  newsletter_placement: NewsletterPlacement.default("inline"),

  /* freshness contract */
  review_cadence: ReviewCadence,
  next_review_due: dateString,
});

/* ------------------------------------------------------------------ */
/* Per-type schemas                                                    */
/* ------------------------------------------------------------------ */

/** Explainers: /learn/* — Article schema, no affiliate links. */
export const explainerSchema = pageManifestBase.extend({
  page_type: z.literal("explainer"),
  affiliate_links: z
    .array(affiliateLinkSchema)
    .max(0, "explainers carry no affiliate links")
    .default([]),
});

/** Glossary: utility page — no newsletter form, no affiliate links, no CTAs. */
export const glossarySchema = pageManifestBase.extend({
  page_type: z.literal("glossary"),
  newsletter_placement: z.enum(["none", "soft-link"]),
  affiliate_links: z
    .array(affiliateLinkSchema)
    .max(0, "glossary carries no affiliate links")
    .default([]),
  terms_count: z.number().int().positive(),
});

/** Comparisons: /compare/* — affiliate disclosure mandatory, quiz required. */
export const comparisonSchema = pageManifestBase.extend({
  page_type: z.literal("comparison"),
  affiliate_disclosure: z.literal(true, {
    message: "comparisons must set affiliate_disclosure: true",
  }),
  quiz_spec: z.string().min(1, "comparisons ship a decision quiz"),
  // One-line verdict printed on the page's share card (src/lib/og.ts).
  // Optional: without it the card uses the meta description.
  og_verdict: z.string().min(20).max(120).optional(),
});

/** Calculators: manifests live in src/data/calculator-manifests.json (one per
 *  tool); the .astro shells read them via getEntry. Newsletter forms banned. */
export const calculatorManifestSchema = pageManifestBase.extend({
  page_type: z.literal("calculator"),
  calculator_spec: z.string().min(1, "calculators need a spec path"),
  newsletter_placement: z.enum(["none", "soft-link"], {
    message: "calculator pages may not carry inline newsletter forms",
  }),
  // Calculator FAQs ship as FAQPage only when the tool has ≥3 (seo-technical-spec).
});

/** Legal: About / Privacy / Affiliate disclosure / Terms. Annual review. */
export const legalSchema = pageManifestBase.extend({
  page_type: z.literal("legal"),
  affiliate_links: z
    .array(affiliateLinkSchema)
    .max(0, "legal pages carry no affiliate links")
    .default([]),
  figures: z.array(figureEntrySchema).default([]),
  review_cadence: z.literal("annual"),
});

/** Home: the one page allowed a longer brand title. */
export const homeSchema = pageManifestBase.extend({
  page_type: z.literal("home"),
  title: z.string().min(48).max(80),
});

export type PageManifest = z.infer<typeof pageManifestBase>;
export type CalculatorManifest = z.infer<typeof calculatorManifestSchema>;
