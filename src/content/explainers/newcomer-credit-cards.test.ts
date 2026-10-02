/**
 * Tests for the newcomer credit-cards page (item 82): it ships as a draft,
 * off the sitemap and unlinked until the wave-2 push, with every figure
 * traced to the registry and the copy rules holding in body and FAQs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { explainerSchema } from "../../schemas/page-manifest";
import sitemap from "../../data/sitemap.json";
import figures from "../../data/figures/newcomer-credit-2026.json";

const SLUG = "/learn/newcomer-credit-cards";
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const raw = readFileSync(join(import.meta.dirname, "newcomer-credit-cards.mdx"), "utf8");
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
  assert.equal(fm.wave, 2);
  assert.equal(fm.title, "Credit Cards for Newcomers to Canada: 2026 Guide");
  assert.equal(
    fm.meta_description,
    "New to Canada with no credit history? Newcomer bank programs, secured cards, and a SIN can get you a first credit card that reports to Equifax and TransUnion.",
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

test("every figure is a registry key cited at its registry source", () => {
  const keys = fm.figures.map((f) => f.key).sort();
  assert.deepEqual(keys, [
    "newcomer.bmo_newstart_unsecured_limit",
    "newcomer.capone_secured_apr",
    "newcomer.capone_secured_fee",
    "newcomer.cibc_newcomer_fee_rebate",
    "newcomer.cibc_student_limit",
    "newcomer.first_score_timeline",
    "newcomer.hometrust_fee_options",
    "newcomer.hometrust_min_deposit",
    "newcomer.neo_build_membership_monthly",
    "newcomer.neo_secured_base_fee",
    "newcomer.neo_secured_min_deposit",
    "newcomer.prepaid_no_credit",
    "newcomer.rbc_newcomer_card_limit",
    "newcomer.scotiabank_startright_limit",
    "newcomer.sin_required",
    "newcomer.td_newcomer_secured_available",
    "newcomer.triangle_no_min_score",
    "newcomer.utilization_worked_example",
    "newcomer.worked_cash_advance",
    "newcomer.worked_interest_carry",
  ]);
  // Secondary-sourced figures the draft cites, flagged for re-verification
  // in the registry; everything else must be verified.
  const reverify = new Set([
    "newcomer.hometrust_fee_options",
    "newcomer.hometrust_min_deposit",
    "newcomer.triangle_no_min_score",
  ]);
  for (const f of fm.figures) {
    const reg = figures.entries.find((e) => e.key === f.key)!;
    assert.ok(reg, `${f.key} not in registry`);
    assert.equal(reg.status, reverify.has(f.key) ? "needs_reverification" : "verified", f.key);
    assert.equal(f.source, reg.source, `${f.key} source`);
    assert.equal(f.verified, reg.verified_date, `${f.key} verified`);
    assert.equal(f.expires, "2027-01-01", `${f.key} expires`);
  }
});

test("body keeps the program limits, trap costs, and worked example", () => {
  for (const s of [
    "$15,000",
    "$5,000",
    "$2,000",
    "29.9%",
    "21.9%",
    "$50 minimum deposit",
    "$171.79",
    "$10.07",
    "$9.99 a month ($119.88 a year)",
    "$60 / $500 = 12%",
    "90% utilization",
  ]) {
    assert.ok(body.includes(s), `missing ${s}`);
  }
  for (const h of [
    "## The one-paragraph version",
    "## Traps: the costed version",
    "## Your 90-day action plan",
    "## Frequently asked questions",
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

test("page stays unlinked until the wave-2 push", () => {
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
    if (f.endsWith("newcomer-credit-cards.mdx")) continue;
    assert.ok(!readFileSync(f, "utf8").includes(SLUG), `${f} links ${SLUG}`);
  }
});
