/**
 * Tests for the fraud and scam basics page (item 82): it ships as a draft,
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
import figures from "../../data/figures/fraud-scams-2026.json";

const SLUG = "/learn/fraud-scams-basics";
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const raw = readFileSync(join(import.meta.dirname, "fraud-scams-basics.mdx"), "utf8");
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
  assert.equal(fm.title, "Fraud and Scam Basics Canada 2026: Spot and Stop Them");
  assert.equal(
    fm.meta_description,
    "Fraud cost Canadians $638 million in 2024. The scams to watch for, the red flags that give them away, and exactly what to do in the first 24 hours after one.",
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
    "fraud.bureau_fraud_lines",
    "fraud.cafc_avg_individual_loss_2024",
    "fraud.cafc_cyber_enabled_share_2024",
    "fraud.cafc_loss_by_category_2024",
    "fraud.cafc_phone",
    "fraud.cafc_reported_incidents_2024",
    "fraud.cafc_reported_victims_2024",
    "fraud.cafc_reporting_rate",
    "fraud.cafc_total_loss_2024",
    "fraud.cra_verify_phone",
    "fraud.credit_card_liability_cap",
    "fraud.etransfer_loss_growth_2024",
    "fraud.sms_report_code",
  ]);
  for (const f of fm.figures) {
    const reg = figures.entries.find((e) => e.key === f.key)!;
    assert.ok(reg, `${f.key} not in registry`);
    // The bureau fraud lines come from police pamphlets, not the bureaus'
    // own sites; the registry flags them for re-verification.
    assert.equal(reg.status, f.key === "fraud.bureau_fraud_lines" ? "needs_reverification" : "verified", f.key);
    assert.equal(f.source, reg.source, `${f.key} source`);
    assert.equal(f.verified, reg.verified_date, `${f.key} verified`);
    assert.equal(f.expires, "2027-01-01", `${f.key} expires`);
  }
});

test("body keeps the CAFC numbers, contact lines, and the 24-hour checklist", () => {
  for (const s of [
    "$638 million",
    "108,878",
    "34,621",
    "$15,028",
    "$18,428",
    "$1.74 million",
    "26.1%",
    "1-888-495-8501",
    "1-800-959-8281",
    "1-800-465-7166",
    "1-800-663-9980",
    "7726",
    "**$50**",
  ]) {
    assert.ok(body.includes(s), `missing ${s}`);
  }
  for (const h of [
    "## The one-paragraph version",
    "## The 8 red flags",
    "## What to do in the first 24 hours if you got scammed",
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
    if (f.endsWith("fraud-scams-basics.mdx")) continue;
    assert.ok(!readFileSync(f, "utf8").includes(SLUG), `${f} links ${SLUG}`);
  }
});
