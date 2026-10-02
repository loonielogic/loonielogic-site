/**
 * Tests for the gifted down payment tax rules page (item 82): it ships as a
 * draft, off the sitemap and unlinked until the spring 2027 housing wave,
 * with every figure traced to the registry and the copy rules holding in
 * body and FAQs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { explainerSchema } from "../../schemas/page-manifest";
import sitemap from "../../data/sitemap.json";
import figures from "../../data/figures/gifted-down-payment-2026.json";

const SLUG = "/learn/gifted-down-payment-tax-rules";
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const raw = readFileSync(join(import.meta.dirname, "gifted-down-payment-tax-rules.mdx"), "utf8");
const [, fmText, body] = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)!;
const fm = explainerSchema.parse(yaml.load(fmText));
const entry = sitemap.pages.find((p) => p.slug === SLUG) as unknown as {
  status: string;
  title: string;
  meta_description: string;
  wave: number;
  cluster: string;
  hub: string;
  related: string[];
  faq_pages: string[];
  faq: { q: string; a: string }[];
};

function copyRules(where: string, text: string) {
  assert.ok(!text.includes(EM_DASH), `${where}: em dash`);
  assert.ok(!text.includes(EN_DASH), `${where}: en dash`);
  assert.ok(!/you should/i.test(text), `${where}: "you should"`);
}

test("front matter: draft, no publish date, identity and navigation verbatim", () => {
  assert.equal(fm.slug, SLUG);
  assert.equal(fm.status, "draft");
  assert.equal(fm.publish_date, null);
  assert.equal(fm.wave, 5);
  assert.equal(fm.title, "Gifted Down Payment Tax Rules Canada 2026: The Guide");
  assert.equal(
    fm.meta_description,
    "Canada has no gift tax, so a gifted down payment is not income. But lenders want a paper trail, and selling investments to fund it can bill the giver.",
  );
  assert.equal(fm.title, entry.title);
  assert.equal(fm.meta_description, entry.meta_description);
  assert.equal(fm.wave, entry.wave);
  assert.equal(fm.cluster, entry.cluster);
  assert.equal(fm.hub, entry.hub);
  assert.deepEqual(fm.related, entry.related);
  assert.equal(entry.status, "draft");
  assert.equal(fm.affiliate_disclosure, false);
  assert.deepEqual(fm.affiliate_links, []);
  assert.equal(fm.newsletter_placement, "none");
});

test("every figure is a verified registry key cited at its registry source", () => {
  const keys = fm.figures.map((f) => f.key).sort();
  assert.deepEqual(keys, [
    "gift.donor.capital_gains_inclusion.2026",
    "gift.donor.deemed_disposition.2026",
    "gift.lender.eligible_donors.2026",
    "gift.lender.gift_letter_required.2026",
    "gift.lender.paper_trail_days.2026",
    "gift.recipient_reporting.2026",
    "gift.recipient_tax_rate.2026",
    "gift.t1135.foreign_property_threshold.2026",
  ]);
  for (const f of fm.figures) {
    const reg = figures.entries.find((e) => e.key === f.key)!;
    assert.ok(reg, `${f.key} not in registry`);
    assert.equal(reg.status, "verified", f.key);
    assert.equal(f.source, reg.source, `${f.key} source`);
    assert.equal(f.verified, reg.verified_date, `${f.key} verified`);
    assert.equal(f.expires, "2027-01-01", `${f.key} expires`);
  }
});

test("body keeps the donor worked example and the lender rules", () => {
  for (const s of [
    "$65,000",
    "$40,000",
    "$25,000",
    "$12,500",
    "29.65%",
    "$3,706.25",
    "90 days",
    "$100,000",
    "T1135",
    "s.69(1)",
    "non-repayable",
  ]) {
    assert.ok(body.includes(s), `missing ${s}`);
  }
  for (const h of [
    "## The one-paragraph version",
    "## The lender side: gift letters, eligible donors, and the paper trail",
    "## The donor side: when giving creates a tax bill",
    "## Traps to avoid",
    "## Sources",
  ]) {
    assert.ok(body.includes(h), `missing ${h}`);
  }
  assert.ok(body.trimEnd().endsWith("*"), "closing disclaimer line");
  assert.ok(body.includes("*Educational content, not financial advice."));
});

test("body follows the copy rules: no dashes, no 'you should', no first-person voice", () => {
  copyRules("body", body);
  copyRules("front matter", fmText);
  assert.deepEqual(body.match(/\b(I|we|our|us|my)\b/g), null);
});

test("sitemap FAQs pass the manifest gates", () => {
  assert.deepEqual(entry.faq_pages, ["FAQPage"]);
  assert.equal(entry.faq.length, 4);
  for (const { q, a } of entry.faq) {
    assert.ok(q.length >= 20 && q.length <= 300, `q length ${q.length}: ${q}`);
    assert.ok(a.length >= 40 && a.length <= 1200, `a length ${a.length}: ${q}`);
    copyRules(q, q + " " + a);
    assert.deepEqual(a.match(/\b(I|we|our|us|my)\b/g), null, `first person in answer: ${q}`);
  }
});

test("page stays unlinked until the housing wave", () => {
  const src = join(import.meta.dirname, "..", "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(astro|mdx?|ts)$/.test(name) && !name.endsWith(".test.ts")) files.push(full);
    }
  };
  for (const sub of ["pages", "components", "layouts", "content", "lib"]) walk(join(src, sub));
  for (const f of files) {
    if (f.endsWith("gifted-down-payment-tax-rules.mdx")) continue;
    // The first-home hub (item 83) is a draft; its card renders unlinked until this page lands.
    if (f.endsWith("first-home-savings.mdx")) continue;
    assert.ok(!readFileSync(f, "utf8").includes(SLUG), `${f} links ${SLUG}`);
  }
});
