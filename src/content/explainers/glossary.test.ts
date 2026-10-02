/**
 * Tests for the glossary page (item 76): 49 A-Z terms, every crosslink-map
 * anchor resolves to a generated heading ID, figures traced to the registry,
 * copy rules holding. Ships as draft/noindex/off-sitemap until the merge
 * decision; the /learn/ hub already pins its card at the end.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { glossarySchema } from "../../schemas/page-manifest";
import sitemap from "../../data/sitemap.json";

const SLUG = "/learn/glossary";
const EM_DASH = String.fromCharCode(0x2014);
const raw = readFileSync(join(import.meta.dirname, "glossary.mdx"), "utf8");
const [, fmText, body] = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)!;
const fm = glossarySchema.parse(yaml.load(fmText));
const entry = sitemap.pages.find((p) => p.slug === SLUG) as unknown as {
  title: string;
  meta_description: string;
};

/** github-slugger semantics: lowercase, strip punctuation, spaces -> hyphens. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

const h3s = [...body.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
const h3Anchors = new Set(h3s.map(slugify));

/**
 * Every anchor the 10 explainers (plus comparisons and calculators) link to
 * as /learn/glossary#<anchor> — from hidden_files/glossary-crosslink-map.md.
 * Anchors are the lowercase-hyphen slug of the H3 heading.
 */
const EXPECTED_ANCHORS = [
  "amortization-period",
  "average-effective-tax-rate",
  "basic-personal-amount-bpa",
  "beneficiary",
  "capital-gain-and-the-inclusion-rate",
  "carry-forward",
  "cmhc-insurance-mortgage-default-insurance",
  "compound-growth",
  "contribution-room",
  "cpp-canada-pension-plan",
  "credit-score",
  "credit-utilization",
  "deduction-vs-tax-credit",
  "defined-benefit-vs-defined-contribution-pension",
  "dividend-tax-credit",
  "down-payment",
  "emergency-fund",
  "employer-match-group-rrsp-pension",
  "fhsa-first-home-savings-account",
  "fixed-vs-variable-mortgage-rate",
  "gds-and-tds-ratios",
  "gic-guaranteed-investment-certificate",
  "gis-guaranteed-income-supplement",
  "hard-inquiry-vs-soft-inquiry",
  "hbp-home-buyers-plan",
  "hisa-high-interest-savings-account",
  "inflation",
  "land-transfer-tax",
  "liquidity",
  "marginal-tax-rate",
  "mer-management-expense-ratio",
  "mortgage-renewal",
  "mortgage-stress-test",
  "netfile",
  "noa-notice-of-assessment",
  "non-registered-account",
  "oas-old-age-security",
  "over-contribution",
  "pension-adjustment-pa",
  "pension-income-splitting",
  "principal-residence-exemption",
  "rebalancing",
  "resp-registered-education-savings-plan",
  "rrif-registered-retirement-income-fund",
  "rrsp-registered-retirement-savings-plan",
  "spousal-rrsp",
  "tfsa-tax-free-savings-account",
  "vesting",
  "withholding-tax-on-withdrawals",
];

/** Terms that carry no outbound links in the v1 draft (everything else must). */
const NO_LINK_TERMS = new Set([
  "liquidity",
  "mortgage-renewal",
  "principal-residence-exemption",
  "rebalancing",
  "vesting",
]);

function copyRules(where: string, text: string) {
  assert.ok(!text.includes(EM_DASH), `${where}: em dash`);
  assert.ok(!/you should/i.test(text), `${where}: "you should"`);
}

test("front matter: glossary draft, title and meta verbatim from sitemap", () => {
  assert.equal(fm.slug, SLUG);
  assert.equal(fm.page_type, "glossary");
  assert.equal(fm.status, "draft");
  assert.equal(fm.publish_date, null);
  assert.equal(fm.wave, 3);
  assert.equal(fm.terms_count, 49);
  assert.equal(fm.title, "Canadian Finance Glossary: 49 Terms in Plain English");
  // NB: the canonical sitemap doc carried a 139-char meta (below the 140
  // minimum); per the fix-at-page-build rule the page ships a 147-char
  // version and the repo sitemap entry was synced to match.
  assert.equal(
    fm.meta_description,
    "Every Canadian money term, decoded: TFSA, RRSP, FHSA, marginal rates, CMHC, OAS clawback and 43 more. Plain English, verified 2026 figures, A to Z.",
  );
  assert.equal(fm.title, entry.title);
  assert.equal(fm.meta_description, entry.meta_description);
  assert.equal(fm.newsletter_placement, "none");
  assert.deepEqual(fm.affiliate_links, []);
  assert.equal(fm.affiliate_disclosure, false);
  assert.equal(fm.hub, "/learn/");
  assert.equal(fm.cluster, "utility");
});

test("49 H3 terms under 19 A-Z letter sections", () => {
  assert.equal(h3s.length, 49);
  assert.equal(new Set(h3s).size, 49);
  const h2s = [...body.matchAll(/^## ([A-Z])$/gm)].map((m) => m[1]);
  assert.deepEqual(h2s, ["A", "B", "C", "D", "E", "F", "G", "H", "I", "L", "M", "N", "O", "P", "R", "S", "T", "V", "W"]);
  assert.ok(body.includes("## Sources"), "missing Sources section");
  assert.ok(body.trimEnd().endsWith("*"), "closing disclaimer line");
  assert.ok(body.includes("*Not financial advice"));
});

test("every crosslink-map anchor resolves to a generated heading ID", () => {
  assert.equal(EXPECTED_ANCHORS.length, 49);
  assert.deepEqual([...h3Anchors].sort(), [...EXPECTED_ANCHORS].sort());
});

test("every term links out except the five link-less draft terms", () => {
  for (const name of h3s) {
    const anchor = slugify(name);
    const section = body.split(`### ${name}\n`)[1].split(/^#{2,3} /m)[0];
    if (NO_LINK_TERMS.has(anchor)) {
      assert.ok(!section.includes("→ Learn more:"), `${name} should stay link-less`);
    } else {
      assert.ok(section.includes("→ Learn more:"), `${name} missing Learn more links`);
      assert.ok(!section.includes("/calculators/tfsa-room)"), `${name} links the retired tfsa-room slug`);
    }
  }
});

test("every figure is a verified registry key", () => {
  const registry = new Map<string, { status: string }>();
  const dir = join(import.meta.dirname, "..", "..", "data", "figures");
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const data = JSON.parse(readFileSync(join(dir, f), "utf8") as string) as {
      entries: { key: string; status: string }[];
    };
    for (const e of data.entries) registry.set(e.key, e);
  }
  assert.ok(fm.figures.length > 0, "glossary should carry figure provenance");
  for (const fig of fm.figures) {
    const reg = registry.get(fig.key);
    assert.ok(reg, `figure key not in registry: ${fig.key}`);
    assert.equal(reg!.status, "verified", fig.key);
  }
});

test("body follows the copy rules: no em dashes, no 'you should', no first-person voice", () => {
  copyRules("body", body);
  copyRules("front matter", fmText);
  // the ## I letter heading is not a pronoun
  const checkable = body.replace(/^## I$/gm, "");
  assert.deepEqual(checkable.match(/\b(I|we|our|us|my)\b/g), null);
});
