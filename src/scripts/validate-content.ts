/**
 * validate-content.ts — build-time content validation gate for LoonieLogic.
 *
 * Run:  npm run validate-content        (also wired as the Astro prebuild step)
 * Exit 1 = build must not deploy. Warnings print but do not fail.
 *
 * What Zod checks (shape, enums, title/meta char counts) vs what this script
 * checks (referential integrity across files):
 *   1. slug is on the canonical sitemap (src/data/sitemap.json)
 *   2. every `related` / `hub` slug resolves to a sitemap page
 *   3. every figures[].key exists in src/data/figures/*.json with a usable
 *      status (verified | needs_reverification | assumption; never rejected)
 *   4. every affiliate_links[].merchant exists in src/data/affiliates/*.json
 *   5. calculator_spec / quiz_spec paths exist on disk (skipped when the
 *      private authoring workspace is absent — bare-repo CI builds)
 *   6. FAQPage gates: faq_pages including FAQPage requires a non-empty faq
 *      array; calculators require >= 3 (seo-technical-spec.md)
 *   7. freshness: live pages must have publish_date; next_review_due in the
 *      past on a live page FAILS; figures with expires < today WARN
 *      (the rollover watch decides warn-vs-auto-expire per page)
 *   8. newsletter placement rules from newsletter-email-capture-spec.md
 *      (no inline forms on calculators, quiz outcomes, or the glossary)
 *   9. newsletter capture gates (src/lib/newsletter-gates.ts): provider URL
 *      (placeholder WARNS, malformed FAILS), no hard-coded newsletter copy
 *      outside the registry, no popup/timer machinery
 *  10. house-style gates on every content MDX: no em dashes, no "you should"
 *  11. kids lessons (/learn/kids/*): sitemap entry must be page_type
 *      kids-lesson, exactly 3 quiz questions, newsletter none/soft-link,
 *      no affiliate links anywhere in the file (/go/ or "sponsored")
 *
 * Post-build:  npm run validate-content -- --dist   (last step of npm run build)
 *   Checks the rendered HTML in dist/: every newsletter form carries the
 *   purpose line + privacy-policy link, registry copy renders verbatim,
 *   no forms on banned page types, honest unconfigured state, draft
 *   newsletter pages and draft kids lessons noindex and off sitemap.xml.
 *
 * Deps (dev): astro, zod, js-yaml, typescript. package.json below.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import {
  explainerSchema,
  comparisonSchema,
  legalSchema,
  glossarySchema,
  homeSchema,
  calculatorManifestSchema,
  kidsLessonSchema,
} from "../schemas/page-manifest.js";
import { ESP_FORM_ACTION_URL, isNewsletterConfigured } from "../config/newsletter.js";
import {
  checkEspConfig,
  checkRenderedPage,
  checkSitemapXml,
  checkSourceFile,
  routeOf,
} from "../lib/newsletter-gates.js";
import { checkDraftKidsPage } from "../lib/kids-lesson.js";

/* ------------------------------------------------------------------ */
/* Paths — repo root is two levels up from src/scripts/                */
/* ------------------------------------------------------------------ */

const ROOT = resolve(import.meta.dirname, "..", ".."); // skeleton root (hidden_files/)
const WORKSPACE = resolve(ROOT, ".."); // goal workspace — spec paths like
// "hidden_files/foo.md" resolve against this, matching frontend-build-spec.md §6
// Authoring specs live in the PRIVATE workspace's hidden_files/, which is
// intentionally never committed to the public repo. In a bare-repo checkout
// (e.g. Cloudflare Pages builds from GitHub) that sibling dir is absent —
// check #5 is then skipped instead of failing the build.
const FIGURES_DIR = join(ROOT, "src", "data", "figures");
const AFFILIATES_DIR = join(ROOT, "src", "data", "affiliates");
const SITEMAP_PATH = join(ROOT, "src", "data", "sitemap.json");
const CALC_MANIFESTS_PATH = join(ROOT, "src", "data", "calculator-manifests.json");
const CONTENT_BASE = join(ROOT, "src", "content");
const DIST_DIR = join(ROOT, "dist");

const QUIZ_OUTCOME_PAGES = new Set(["/compare/tfsa-vs-rrsp"]); // quiz widgets live on comparisons

const SPECS_DIR = join(WORKSPACE, "hidden_files");
const SPECS_AVAILABLE = existsSync(SPECS_DIR); // false in bare-repo CI checkouts

/* ------------------------------------------------------------------ */
/* Loaders                                                             */
/* ------------------------------------------------------------------ */

interface FigureIndexEntry {
  key: string;
  status: string;
  expires: string | null;
}

function loadFigureIndex(): Map<string, FigureIndexEntry> {
  const index = new Map<string, FigureIndexEntry>();
  for (const file of readdirSync(FIGURES_DIR)) {
    if (!file.endsWith(".json") || file === "README.md") continue;
    const data = JSON.parse(readFileSync(join(FIGURES_DIR, file), "utf8"));
    const entries = Array.isArray(data.entries) ? data.entries : [];
    for (const e of entries) {
      if (e && typeof e.key === "string") {
        index.set(e.key, {
          key: e.key,
          status: e.status ?? "unknown",
          expires: e.expires ?? null,
        });
      }
    }
  }
  return index;
}

function loadMerchants(): Set<string> {
  const merchants = new Set<string>();
  if (!existsSync(AFFILIATES_DIR)) return merchants;
  for (const file of readdirSync(AFFILIATES_DIR)) {
    if (file.endsWith(".json")) merchants.add(file.replace(/\.json$/, ""));
  }
  return merchants;
}

interface SitemapPage {
  slug: string;
  page_type: string;
  title: string;
  meta_description: string;
}

function loadSitemap(): { pages: SitemapPage[]; bySlug: Map<string, SitemapPage> } {
  const data = JSON.parse(readFileSync(SITEMAP_PATH, "utf8"));
  const pages: SitemapPage[] = data.pages ?? [];
  return { pages, bySlug: new Map(pages.map((p) => [p.slug, p])) };
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

let errors = 0;
let warnings = 0;

function fail(where: string, msg: string) {
  errors += 1;
  console.error(`FAIL  ${where}: ${msg}`);
}
function warn(where: string, msg: string) {
  warnings += 1;
  console.warn(`WARN  ${where}: ${msg}`);
}

/* ------------------------------------------------------------------ */
/* Front matter                                                        */
/* ------------------------------------------------------------------ */

function readFrontMatter(path: string): Record<string, unknown> {
  const raw = readFileSync(path, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("no front-matter block found");
  return yaml.load(match[1]) as Record<string, unknown>;
}

function listMdxFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listMdxFiles(full));
    else if (/\.(mdx?|astro)$/.test(entry)) out.push(full);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Per-page validation                                                 */
/* ------------------------------------------------------------------ */

interface ZodLike {
  safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: unknown[] } };
}

const SCHEMAS: Record<string, ZodLike> = {
  explainer: explainerSchema,
  comparison: comparisonSchema,
  legal: legalSchema,
  glossary: glossarySchema,
  home: homeSchema,
  calculator: calculatorManifestSchema,
  "kids-lesson": kidsLessonSchema,
};

function validatePage(
  where: string,
  fm: Record<string, unknown>,
  ctx: {
    bySlug: Map<string, SitemapPage>;
    figures: Map<string, FigureIndexEntry>;
    merchants: Set<string>;
  },
) {
  const pageType = fm.page_type as string;
  const schema = SCHEMAS[pageType];
  if (!schema) {
    fail(where, `unknown page_type "${pageType}"`);
    return;
  }

  const parsed = schema.safeParse(fm);
  if (!parsed.success) {
    fail(where, `schema errors: ${JSON.stringify(parsed.error?.issues)}`);
    return;
  }
  const m = parsed.data as {
    slug: string;
    status: string;
    related: string[];
    hub: string | null;
    figures: { key: string; expires: string | null }[];
    affiliate_links: { merchant: string }[];
    calculator_spec: string | null;
    quiz_spec: string | null;
    faq_pages: string[];
    faq: unknown[];
    page_type: string;
    newsletter_placement: string;
    next_review_due: string;
    publish_date: string | null;
  };

  /* 1. sitemap membership */
  const sitemapPage = ctx.bySlug.get(m.slug);
  if (!sitemapPage) {
    fail(where, `slug "${m.slug}" is not on the canonical sitemap`);
    return;
  }
  if ((m.page_type === "kids-lesson") !== (sitemapPage.page_type === "kids-lesson")) {
    fail(where, `page_type "${m.page_type}" must match sitemap "${sitemapPage.page_type}" for kids lessons`);
  } else if (sitemapPage.page_type !== m.page_type && sitemapPage.page_type !== "glossary") {
    warn(where, `page_type "${m.page_type}" differs from sitemap "${sitemapPage.page_type}"`);
  }

  /* 2. link targets resolve */
  for (const target of [...m.related, ...(m.hub ? [m.hub] : [])]) {
    if (!ctx.bySlug.has(target)) fail(where, `related/hub slug "${target}" not on sitemap`);
  }

  /* 3. figure keys exist and are usable */
  const today = new Date().toISOString().slice(0, 10);
  for (const fig of m.figures) {
    const entry = ctx.figures.get(fig.key);
    if (!entry) {
      fail(where, `figure key "${fig.key}" not found in src/data/figures/`);
      continue;
    }
    if (entry.status === "rejected") {
      fail(where, `figure key "${fig.key}" is REJECTED — do not cite it`);
    }
    const expiry = fig.expires ?? entry.expires;
    if (expiry && expiry < today) {
      warn(where, `figure "${fig.key}" expired ${expiry} — rollover watch should re-verify`);
    }
  }

  /* 4. affiliate merchants exist */
  for (const link of m.affiliate_links) {
    if (!ctx.merchants.has(link.merchant)) {
      fail(where, `affiliate merchant "${link.merchant}" has no src/data/affiliates/ record`);
    }
  }

  /* 5. spec paths exist (skipped when the private authoring workspace is
     absent, e.g. Cloudflare Pages building the bare public repo) */
  if (SPECS_AVAILABLE) {
    for (const [label, p] of [
      ["calculator_spec", m.calculator_spec],
      ["quiz_spec", m.quiz_spec],
    ] as const) {
      if (p && !existsSync(join(WORKSPACE, p))) {
        fail(where, `${label} points at missing file "${p}"`);
      }
    }
  }

  /* 6. FAQPage gates (seo-technical-spec.md) */
  if (m.faq_pages.includes("FAQPage")) {
    if (m.faq.length === 0) {
      fail(where, "faq_pages includes FAQPage but faq[] is empty — no junk markup");
    } else if (m.page_type === "calculator" && m.faq.length < 3) {
      fail(where, `calculator FAQPage needs >= 3 FAQs, has ${m.faq.length}`);
    }
  }

  /* 7. freshness contract */
  if (m.status === "live") {
    if (!m.publish_date) fail(where, "live pages must have publish_date");
    if (m.next_review_due < today) {
      fail(where, `live page is past next_review_due (${m.next_review_due})`);
    }
  }

  /* 8. newsletter placement rules (newsletter-email-capture-spec.md) */
  if (m.page_type === "calculator" && m.newsletter_placement === "inline") {
    fail(where, "calculators may not carry inline newsletter forms (soft link only)");
  }
  if (m.page_type === "glossary" && m.newsletter_placement === "inline") {
    fail(where, "glossary may not carry a newsletter form (soft link only)");
  }
  if (m.page_type === "kids-lesson" && m.newsletter_placement === "inline") {
    fail(where, "kids lessons may not carry a newsletter form (none or soft link only)");
  }

  /* 11. kids lessons: exactly 3 quiz questions (Segment A template) */
  if (m.page_type === "kids-lesson") {
    const quiz = (parsed.data as { quiz?: unknown[] }).quiz ?? [];
    if (quiz.length !== 3) fail(where, `kids lessons ship exactly 3 quiz questions, found ${quiz.length}`);
  }
}

/* ------------------------------------------------------------------ */
/* House-style text gates (whole file: front matter + body)            */
/* ------------------------------------------------------------------ */

const EM_DASH = String.fromCharCode(0x2014);

export function checkContentText(raw: string, pageType: string | undefined): string[] {
  const out: string[] = [];
  if (raw.includes(EM_DASH)) out.push("contains an em dash (house rule: none, ever)");
  if (/\byou should\b/i.test(raw)) out.push('contains "you should" (house rule)');
  if (pageType === "kids-lesson") {
    if (raw.includes("/go/")) out.push("kids lessons may not link to /go/ affiliate redirects");
    if (/sponsored/i.test(raw)) out.push('kids lessons may not carry "sponsored" links or copy');
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Newsletter gates                                                    */
/* ------------------------------------------------------------------ */

function listFiles(dir: string, match: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, match));
    else if (match.test(entry)) out.push(full);
  }
  return out;
}

function validateNewsletterSource() {
  const cfg = checkEspConfig(ESP_FORM_ACTION_URL);
  for (const e of cfg.errors) fail("src/config/newsletter.ts", e);
  for (const w of cfg.warnings) warn("src/config/newsletter.ts", w);

  for (const sub of ["components", "pages", "layouts"]) {
    for (const file of listFiles(join(ROOT, "src", sub), /\.(astro|ts)$/)) {
      const rel = file.replace(ROOT + "/", "");
      for (const e of checkSourceFile(rel, readFileSync(file, "utf8"))) fail("newsletter", e);
    }
  }
}

function validateDist() {
  if (!existsSync(DIST_DIR)) {
    fail("dist", "no build output found; run astro build first");
    return;
  }
  const configured = isNewsletterConfigured();
  const legalRoutes = new Set(
    listFiles(join(CONTENT_BASE, "legal"), /\.mdx?$/).map((f) => "/" + f.split("/").pop()!.replace(/\.mdx?$/, "")),
  );
  const pages = listFiles(DIST_DIR, /\.html$/);
  let forms = 0;
  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    forms += (html.match(/\sdata-newsletter-form="/g) ?? []).length;
    const route = routeOf(file.slice(DIST_DIR.length + 1));
    for (const e of checkRenderedPage({ route, html, configured, legalRoutes })) fail("dist", e);
  }
  const sitemap = join(DIST_DIR, "sitemap.xml");
  const sitemapXml = existsSync(sitemap) ? readFileSync(sitemap, "utf8") : null;
  if (sitemapXml !== null) {
    for (const e of checkSitemapXml(sitemapXml, configured)) fail("dist", e);
  }
  // Draft kids lessons: built noindex, off sitemap.xml.
  for (const file of listMdxFiles(join(CONTENT_BASE, "explainers"))) {
    const fm = readFrontMatter(file);
    if (fm.page_type !== "kids-lesson" || fm.status === "live") continue;
    const slug = String(fm.slug);
    const page = join(DIST_DIR, slug.replace(/^\//, ""), "index.html");
    const html = existsSync(page) ? readFileSync(page, "utf8") : null;
    for (const e of checkDraftKidsPage(slug, html, sitemapXml)) fail("dist", e);
  }
  console.log(`Checked ${pages.length} built pages, ${forms} newsletter forms (provider ${configured ? "configured" : "not configured"}).`);
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function main() {
  if (process.argv.includes("--dist")) {
    validateDist();
    console.log(`\nDone: ${errors} errors, ${warnings} warnings.`);
    if (errors > 0) process.exit(1);
    return;
  }

  const { bySlug } = loadSitemap();
  const figures = loadFigureIndex();
  const merchants = loadMerchants();
  const ctx = { bySlug, figures, merchants };

  console.log(
    `Validating content: ${bySlug.size} sitemap pages, ${figures.size} figure keys, ${merchants.size} affiliate merchants.`,
  );
  if (!SPECS_AVAILABLE) {
    console.log(
      "Note: private authoring specs (hidden_files/) not present in this checkout — skipping spec-path checks.",
    );
  }

  /* 1. MDX content collections */
  for (const file of listMdxFiles(CONTENT_BASE)) {
    const where = file.replace(ROOT + "/", "");
    try {
      const fm = readFrontMatter(file);
      validatePage(where, fm, ctx);
      for (const e of checkContentText(readFileSync(file, "utf8"), fm.page_type as string | undefined)) fail(where, e);
    } catch (e) {
      fail(where, `could not parse front matter: ${(e as Error).message}`);
    }
  }

  /* 2. Calculator manifests (src/data/calculator-manifests.json) */
  if (existsSync(CALC_MANIFESTS_PATH)) {
    const data = JSON.parse(readFileSync(CALC_MANIFESTS_PATH, "utf8"));
    const manifests = Array.isArray(data.manifests) ? data.manifests : [];
    manifests.forEach((fm: Record<string, unknown>, i: number) => {
      const where = `calculator-manifests.json[${i}]`;
      const parsed = calculatorManifestSchema.safeParse(fm);
      if (!parsed.success) {
        fail(where, `schema errors: ${JSON.stringify(parsed.error.issues)}`);
        return;
      }
      validatePage(where, fm, ctx);
    });
    console.log(`Validated ${manifests.length} calculator manifests.`);
  }

  /* 3. Sitemap self-check: char counts on the canonical table */
  const raw = JSON.parse(readFileSync(SITEMAP_PATH, "utf8"));
  for (const p of raw.pages as SitemapPage[]) {
    const tLen = p.title.length;
    const mLen = p.meta_description.length;
    const tMax = p.page_type === "home" ? 80 : 60;
    if (tLen < 48 || tLen > tMax) {
      warn(`sitemap:${p.slug}`, `title is ${tLen} chars (allowed 48-${tMax}) — fix at page build`);
    }
    if (mLen < 140 || mLen > 160) {
      warn(`sitemap:${p.slug}`, `meta is ${mLen} chars (allowed 140-160) — fix at page build`);
    }
  }

  /* 4. Orphan check: every sitemap page reachable within 2 clicks from home */
  const home = raw.pages.find((p: SitemapPage) => p.slug === "/") as SitemapPage & { related: string[] };
  if (home) {
    const bySlugRaw = new Map((raw.pages as SitemapPage[]).map((p) => [p.slug, p]));
    const reached = new Set<string>(["/"]);
    const oneHop = new Set<string>(home.related ?? []);
    for (const s of oneHop) reached.add(s);
    for (const s of oneHop) {
      const p = bySlugRaw.get(s) as (SitemapPage & { related?: string[] }) | undefined;
      for (const r of p?.related ?? []) reached.add(r);
    }
    // Hubs link every page in their section, so sections are always reachable.
    for (const p of raw.pages as SitemapPage[]) {
      if (p.hub && !reached.has(p.slug)) reached.add(p.slug);
    }
    for (const p of raw.pages as SitemapPage[]) {
      if (!reached.has(p.slug)) warn(`sitemap:${p.slug}`, "orphan: not reachable within 2 clicks from home");
    }
  }

  /* 5. Newsletter capture gates */
  validateNewsletterSource();

  console.log(`\nDone: ${errors} errors, ${warnings} warnings.`);
  if (errors > 0) process.exit(1);
}

// Run only as a script, so tests can import checkContentText.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
