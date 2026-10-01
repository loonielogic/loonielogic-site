# Tools wave 3: finish the calculator library + Tools nav dropdown

You are building on the LoonieLogic site repo (loonielogic/loonielogic-site).
You are ALREADY on branch `preview/tools-wave-3`. Do NOT create or switch branches.

## Context

Two calculators shipped last session (Wealth Over Time at
`src/pages/calculators/compound-growth.astro`, Goal Planner at
`src/pages/calculators/goal-planner.astro`). Five calculator manifests exist
but have NO built pages yet. The founder wants the full library built out now:
no more "coming next" placeholders for tools.

## Task 1: build the 5 missing calculators

Routes (from `src/data/calculator-manifests.json`, read it for titles/metas/related):
- `/calculators/income-tax-calculator` — spec `_briefs/income-tax-estimator-calculator-spec.md` + research file
- `/calculators/tfsa-vs-rrsp` — spec `_briefs/tfsa-vs-rrsp-calculator-spec.md` + `_briefs/tfsa-vs-rrsp-quiz-spec.md`
- `/calculators/rrsp-room` — spec `_briefs/rrsp-room-tracker-calculator-spec.md`
- `/calculators/house-affordability` — spec `_briefs/house-affordability-calculator-spec.md` + research file
- `/calculators/rent-vs-buy` — spec `_briefs/rent-vs-buy-calculator-spec.md` + research file

Follow the EXACT pattern of the two shipped calculators:
- `src/lib/calculators/<name>.ts` — pure math + types, with a `.test.ts` (vitest) proving the worked examples in the spec
- `src/lib/calculators/<name>-render.ts` — results HTML
- `src/components/calculators/<Name>.astro` — the interactive island
- `src/pages/calculators/<name>.astro` — page shell (hero, breadcrumbs, RelatedCards, draft chip)
- Wire into `src/data/calculator-manifests.json` ONLY if a manifest entry is missing fields the page needs; do NOT change any manifest `status` (all stay "draft"), slugs, titles, or metas.

Tax-sensitive tools (income tax, rrsp-room, tfsa-vs-rrsp): use ONLY figures from
the spec/research files. If a figure is marked unverified in the research, the
page must label it "Not yet verified" rather than presenting it as fact.

## Task 2: Tools dropdown in the top nav

`src/layouts/BaseLayout.astro` has `navItems` (Learn / Tools / Compare / About).
The founder could not find the tools: hovering "Tools" must open a dropdown
listing all 10 calculators (name + short descriptor from the manifests), each
linking to its page. Requirements:
- Opens on hover AND on keyboard focus; closes on Escape / focus-out
- Works on mobile (tap toggles; the existing mobile nav must include the same list)
- Follows the site's visual design (dark green + gold, check existing styles)
- Accessible: aria-expanded, aria-haspopup, proper list markup
- The "Tools" label itself still links to `/calculators/`

## Task 3: hub cleanup

`src/pages/calculators/index.astro` + `src/components/HubPage.astro` currently
show a "Coming next" section because tools were unbuilt. Now that all 10
calculators exist as pages, remove "coming next" entries for tools that are
built. Update the hub intro/CTA copy so the page reads as a complete library
in draft review, not a construction site. Keep every manifest status "draft":
noindex, off sitemap.xml, off the hub-linking logic stays as-is.

## Hard rules

- NO em dashes anywhere in user-facing copy. Never write "you should".
  Canadian spelling.
- Every calculator page states its key assumptions and limits honestly
  (like the "How this works" / "How the math works" sections on the two
  shipped calculators). No promises, no "guaranteed", projections are
  illustrations not forecasts.
- Do NOT read anything outside the repo. Do NOT touch credentials, secrets,
  or CI config. Do NOT change robots.txt, sitemap generation, or analytics.
- Run `npm test` and `npm run build`; fix every failure. The build must end
  with 0 errors.

## When done

1. Delete the `_briefs/` directory (scratch, must not be committed).
2. Commit everything on `preview/tools-wave-3`.
3. Open a pull request against `main` titled "Tools wave 3: complete calculator library + Tools nav dropdown".
4. In the PR body: list the 5 new pages with routes, describe the nav
   dropdown, note the hub changes, test/build counts, and flag anything you
   were unsure about (figures, copy calls) for the reviewer.
