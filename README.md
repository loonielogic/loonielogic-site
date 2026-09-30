# LoonieLogic — Astro site scaffold

Static Astro site for the LoonieLogic Canadian finance education project.
**Static SSG only** (`output: "static"`), no SSR, no serverless. Deploy the
`dist/` folder to any static host (Cloudflare Pages preferred).

## Quick start

```bash
cd site
npm install
npm run build        # validate-content gate + astro build → dist/
npm run dev          # local dev server
```

`npm run build` runs the content gate first: the build fails if any manifest
is invalid. Do not bypass the gate.

## What's real in this build

| Route | Status |
|---|---|
| `/` | Real — homepage with Learn/Try/Do cards and guided paths |
| `/learn/`, `/calculators/`, `/compare/` | Real hubs; only built pages render as cards (using `card_dek` from `src/data/sitemap.json`), the rest collapse into one "Coming next" list |
| `/learn/tfsa` | Real explainer (adapted from `files/tfsa-basics-explainer-v1.md`) |
| `/compare/tfsa-vs-rrsp` | Real comparison, no affiliate links, explicit non-affiliate disclosure line |
| `/about`, `/privacy`, `/affiliate-disclosure`, `/terms` | Real v1 legal stubs (honest, minimal; review before monetization) |
| `/go/<merchant>/` (×5) | Placeholder "not active yet" pages, `noindex, nofollow` — all merchants still `pending` |
| `/robots.txt`, `/sitemap.xml` | Generated at build; sitemap lists **only routes that exist** |
| `dist/content-manifest.json` | Machine feed for the rollover watch (14 pages) |
| `dist/_redirects` | Comment-only; zero live merchant redirects until a record flips to `live` |

Content pages ship **zero executable JavaScript** (JSON-LD structured data only).
No affiliate URLs or tokens exist anywhere in `dist/`.

## Ingesting the next draft (hourly-grind workflow)

1. Take the next draft from `files/` (see `WORK_QUEUE.md` in the goal folder).
2. Convert it to MDX with front matter matching the README template in
   `src/schemas/README.md` — or copy `src/content/explainers/tfsa.mdx` /
   `src/content/comparisons/tfsa-vs-rrsp.mdx` as a starting shape.
3. Front-matter rules that bite:
   - Dates may be unquoted (`last_reviewed: 2026-09-29`) — the schema coerces
     js-yaml `Date` objects back to strings. Quoted works too.
   - `status` is `draft` | `review` | `live` (NOT "published").
   - `status: live` requires `publish_date`.
   - Every page needs `hub` (nullable) and `cluster` (`tax|retirement|housing|banking|investing|utility`).
   - Explainers/glossary/legal carry **no** `affiliate_links` (build-enforced).
   - Comparisons require `affiliate_disclosure: true` and a `quiz_spec` path
     to a real file under `hidden_files/`.
   - Titles 48–60 chars, meta descriptions 140–160 chars — the build fails
     otherwise. Fix the copy, not the gate.
   - `related` slugs must exist on the canonical sitemap table.
   - Every `figures[].key` must exist in `src/data/figures/`.
4. Run `npm run validate-content` — fix every `FAIL` (warnings are the known
   sitemap-table self-check; see below).
5. Run `npm run build`, then re-run the dist checks in this README's spirit:
   no dead internal links, no executable scripts on content pages, `/go/*`
   still noindex, sitemap.xml only lists built routes.

As each page ships, its hub card, homepage guided path, footer, related cards,
and sitemap.xml light up automatically — no manual wiring.

## Known warnings (not errors)

`npm run validate-content` reports 22 warnings by design:

- The canonical `src/data/sitemap.json` table carries title/meta-length
  violations on planned pages — the gate proves the skeleton's claims wrong
  rather than silently accepting them. Each page's **rendered** metadata is
  fixed at ingestion (see the TFSA and TFSA-vs-RRSP front matter).
- The four legal pages warn as "orphans" (the 2-click check only counts
  `home.related`); they are linked from the site footer, which is correct.

## Skeleton bugs fixed in this build

(kept here so future spec updates don't reintroduce them)

- `dateString` now coerces js-yaml `Date` → `YYYY-MM-DD` via `z.preprocess`
  (unquoted dates in front matter crashed both the validator and Astro).
- `.extend()` was dropping the base schema's `.default([])` on
  `affiliate_links` for explainer/glossary/legal — restored (checks before
  `.default()`, which Zod v4 requires).
- Validator's `SCHEMAS` map was missing `calculator` → calculator manifests
  failed with "unknown page_type".
- Content-manifest integration imported `astro:content` at config time and
  crashed — now reads front matter from the filesystem with js-yaml.
- `@astrojs/mdx` pinned to `^8.0.0` for Astro 7 (`^2.5.0` doesn't exist).
- Dynamic routes use Astro 7's standalone `render(entry)`, not `entry.render()`.
- `src/data/calculator-manifests.json`: fixed 4 title/meta length violations
  and removed `FAQPage` from the income-tax entry (only 1 FAQ written; the
  page shell can restore it at ≥3 FAQs). Same fixes applied to the
  `hidden_files/` originals.

## Open design issues (need a decision before monetization)

- **Redirect sub-ID interpolation**: the affiliate spec wants `__SUBID__` →
  `src-pos` expansion, but static `_redirects` can't interpolate query params.
  Redesign to per-position static paths (e.g. `/go/wealthsimple/hero/`) before
  any merchant flips to `live`.
- **sitemap `lastmod`**: currently the build date for every URL. Implement the
  material-change rule (git diff of content + figure keys) before launch so
  `lastmod` means something.
- **robots.txt preview rule** assumes the production branch is `main`
  (`CF_PAGES_BRANCH`); confirm when the Pages project exists. Crawling is
  also opt-in: set `ALLOW_INDEXING=true` in the Pages production env at
  launch. Until then every build serves a full disallow.
- **Site origin** is pinned to `https://loonielogic-site.pages.dev` in both
  `astro.config.mjs` and `src/lib/site.ts` (canonicals, sitemap, JSON-LD,
  og:image). It is never derived from `CF_PAGES_URL`. Change both together
  if a custom domain is ever bought.
