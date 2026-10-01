/**
 * content.config.ts — Astro Content Layer collections for LoonieLogic.
 *
 * Collections: explainers (/learn/*, incl. /learn/kids/*), comparisons (/compare/*), legal
 * (/about, /privacy, /affiliate-disclosure, /terms). Calculators are data
 * manifests in src/data/calculator-manifests.json (their pages are .astro
 * shells + islands per frontend-build-spec.md); hubs are generated from
 * src/data/sitemap.json and are not an author-facing collection.
 *
 * Astro v6 Content Layer API + Zod v4. Verify both at kickoff.
 */

import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import {
  explainerSchema,
  comparisonSchema,
  legalSchema,
  glossarySchema,
  kidsLessonSchema,
} from "./schemas/page-manifest";

export const collections = {
  explainers: defineCollection({
    loader: glob({ pattern: "**/*.mdx", base: "./src/content/explainers" }),
    // The glossary lives in src/content/explainers/ with page_type: glossary —
    // the union keeps one directory while enforcing the stricter glossary rules.
    // Kids lessons (page_type: kids-lesson) live in the kids/ subdirectory.
    schema: explainerSchema.or(glossarySchema).or(kidsLessonSchema),
  }),

  comparisons: defineCollection({
    loader: glob({ pattern: "**/*.mdx", base: "./src/content/comparisons" }),
    schema: comparisonSchema,
  }),

  legal: defineCollection({
    loader: glob({ pattern: "**/*.mdx", base: "./src/content/legal" }),
    schema: legalSchema,
  }),
};
