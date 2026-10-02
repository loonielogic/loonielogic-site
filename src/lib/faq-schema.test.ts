/**
 * FAQPage JSON-LD emitter (item 67): the node rendered into each page's
 * <head> is exactly the manifest's questions/answers, verbatim, and no
 * page without FAQ blocks gets a node.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { faqForSlug, faqPageNode, faqSlugs } from "./faq-schema.ts";
import sitemap from "../data/sitemap.json";

// House-style checks, inlined rather than imported: the checkContentText
// export lives on the unmerged item-66 branch, so this branch carries its
// own copy to stay independent. DASH is built from its code point so no
// dash character sits in this file.
const DASH = String.fromCharCode(0x2014);
function houseStyleProblems(text: string): string[] {
  const out: string[] = [];
  if (text.includes(DASH)) out.push("contains an em dash (house rule: none, ever)");
  if (/\byou should\b/i.test(text)) out.push('contains "you should" (house rule)');
  return out;
}

// The 15 explainer pages whose manifest entries carry FAQ blocks
// (items 34 + 40 + 64 + 65: the two draft pages from the item-80 merge
// batch carry FAQ blocks too; item 82 adds three draft Reddit-gap pages).
// If this set changes intentionally, update it here.
const EXPECTED_FAQ_SLUGS = [
  "/learn/cpp-oas",
  "/learn/credit-score",
  "/learn/federal-tax-brackets-2026",
  "/learn/fhsa",
  "/learn/fhsa-open-before-dec-31",
  "/learn/first-paycheque-playbook",
  "/learn/first-time-tax-filing",
  "/learn/fraud-scams-basics",
  "/learn/gifted-down-payment-tax-rules",
  "/learn/home-buyers-plan",
  "/learn/newcomer-credit-cards",
  "/learn/resp",
  "/learn/rrsp",
  "/learn/tfsa",
  "/learn/tfsa-overcontribution-fix",
].sort();

const manifestPages = (sitemap as { pages: { slug: string; faq?: { q: string; a: string }[] }[] }).pages;
const manifestBySlug = new Map(manifestPages.map((p) => [p.slug, p.faq ?? []]));

describe("faq-schema", () => {
  it("FAQ-carrying slug set is exactly the 15 FAQ explainers", () => {
    assert.deepEqual(faqSlugs(), EXPECTED_FAQ_SLUGS);
  });

  for (const slug of EXPECTED_FAQ_SLUGS) {
    it(`${slug}: node renders exactly the manifest entries, verbatim`, () => {
      const manifest = manifestBySlug.get(slug)!;
      assert.ok(manifest.length > 0, "manifest has no faq entries");
      const node = faqPageNode(slug) as Record<string, unknown>;
      assert.ok(node, "expected an FAQPage node");
      assert.equal(node["@type"], "FAQPage");
      const items = node.mainEntity as Record<string, unknown>[];
      assert.equal(items.length, manifest.length);
      items.forEach((item, i) => {
        assert.equal(item["@type"], "Question");
        assert.equal(item.name, manifest[i].q);
        const ans = item.acceptedAnswer as Record<string, unknown>;
        assert.equal(ans["@type"], "Answer");
        assert.equal(ans.text, manifest[i].a);
      });
    });

    it(`${slug}: entries pass the manifest FAQ gates`, () => {
      for (const e of faqForSlug(slug)) {
        assert.ok(e.q.length >= 20 && e.q.length <= 300, `q length ${e.q.length}`);
        assert.ok(e.a.length >= 40 && e.a.length <= 1200, `a length ${e.a.length}`);
        const problems = houseStyleProblems(`${e.q} ${e.a}`);
        assert.deepEqual(problems, [], problems.join("; "));
      }
    });
  }

  it("pages without FAQ blocks get no node", () => {
    for (const slug of [
      "/",
      "/learn/",
      "/calculators/",
      "/calculators/income-tax-calculator",
      "/calculators/tfsa-room-checker",
      "/learn/kids/needs-vs-wants",
      "/about",
      "/no/such/page",
    ]) {
      assert.equal(faqPageNode(slug), undefined, slug);
    }
  });

  it("tfsa-overcontribution-fix keeps its 5th (January-angle) FAQ", () => {
    assert.equal(faqForSlug("/learn/tfsa-overcontribution-fix").length, 5);
  });
});
