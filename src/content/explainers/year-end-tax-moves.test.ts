/**
 * Tests for the year-end tax moves page (item 86): it ships as a draft,
 * off the sitemap and unlinked until the December push, with every figure
 * traced to a registry and the copy rules holding in body and FAQs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { explainerSchema } from "../../schemas/page-manifest";
import sitemap from "../../data/sitemap.json";
import tfsa from "../../data/figures/tfsa-2026.json";
import deadlines from "../../data/figures/tax-deadlines-2026.json";
import gains from "../../data/figures/capital-gains-2026.json";
import brackets from "../../data/figures/federal-brackets-2026.json";
import local from "../../data/figures/year-end-moves-2026.json";

const SLUG = "/learn/year-end-tax-moves";
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const raw = readFileSync(join(import.meta.dirname, "year-end-tax-moves.mdx"), "utf8");
const [, fmText, body] = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)!;
const fm = explainerSchema.parse(yaml.load(fmText));
const entry = sitemap.pages.find((p) => p.slug === SLUG) as unknown as {
  status: string;
  title: string;
  meta_description: string;
  faq_pages: string[];
  faq: { q: string; a: string }[];
};

const registry = [...tfsa.entries, ...deadlines.entries, ...gains.entries, ...brackets.entries, ...local.entries] as {
  key: string;
  source: string;
  status: string;
}[];

const LOCAL_KEYS = [
  "year_end.capital_loss.carry.2026",
  "year_end.donation.carryforward_5y.2026",
  "year_end.donation.income_cap_75.2026",
  "year_end.superficial_loss.rule.2026",
];

function copyRules(where: string, text: string) {
  assert.ok(!text.includes(EM_DASH), `${where}: em dash`);
  assert.ok(!text.includes(EN_DASH), `${where}: en dash`);
  assert.ok(!/you should/i.test(text), `${where}: "you should"`);
}

test("front matter: draft, no publish date, title and meta verbatim", () => {
  assert.equal(fm.slug, SLUG);
  assert.equal(fm.status, "draft");
  assert.equal(fm.publish_date, null);
  assert.equal(fm.wave, 2);
  assert.equal(fm.title, "Year-End Tax Moves Canada: 3 Moves Before December 31");
  assert.equal(
    fm.meta_description,
    "Three tax moves to make before December 31, 2026: the TFSA January room reset, the donation credit deadline, and tax-loss selling by December 29.",
  );
  assert.equal(fm.title, entry.title);
  assert.equal(fm.meta_description, entry.meta_description);
  assert.equal(entry.status, "draft");
  assert.equal(fm.affiliate_disclosure, false);
  assert.deepEqual(fm.affiliate_links, []);
  assert.equal(fm.newsletter_placement, "none");
});

test("every figure is a verified registry key cited at its registry source", () => {
  const keys = fm.figures.map((f) => f.key).sort();
  assert.deepEqual(
    keys,
    [
      "capital_gains.inclusion_rate.2026",
      "charitable.2026",
      "federal.donation_credit.2026",
      "rrsp.deadline.2026_tax_year",
      "tax_loss.2026",
      "tax_loss.settlement_cutoff.2026",
      "tfsa.excess_tax",
      "tfsa.room_reset",
      "tfsa.withdrawal_restore",
      ...LOCAL_KEYS,
    ].sort(),
  );
  for (const f of fm.figures) {
    const reg = registry.find((e) => e.key === f.key)!;
    assert.ok(reg, `${f.key} not in a registry`);
    assert.equal(reg.status, "verified", f.key);
    assert.equal(f.source, reg.source, `${f.key} source`);
  }
  for (const k of LOCAL_KEYS) {
    const f = fm.figures.find((x) => x.key === k)!;
    assert.equal(f.expires, "2027-01-01", `${k} expires`);
  }
});

test("body keeps the three moves, the key dates and the checklist", () => {
  for (const h of [
    "## The 30-second version",
    "## Move 1",
    "## Move 2",
    "## Move 3",
    "## What does NOT expire on December 31",
    "## The December checklist",
    "## Sources",
  ]) {
    assert.ok(body.includes(h), `missing ${h}`);
  }
  for (const s of [
    "December 29, 2026",
    "January 1 of the next calendar year",
    "14% on the first $200",
    "29% on everything above $200",
    "75% of net income",
    "5 years",
    "T+1",
    "61-day window",
    "March 1, 2027",
    "Schedule 4",
  ]) {
    assert.ok(body.includes(s), `missing ${s}`);
  }
  assert.ok(body.trimEnd().endsWith("*"), "closing disclaimer line");
  assert.ok(body.includes("*Not financial advice"));
});

test("unbuilt assets are not promoted or linked", () => {
  assert.ok(!body.includes("Where the worksheet fits"));
  assert.ok(!/worksheet|lead magnet/i.test(body), "worksheet promoted");
  assert.ok(body.includes("promo-expiry calendar"), "calendar named");
  assert.ok(!/\]\(/.test(body), "no markdown links in body");
  assert.ok(!body.includes("/go/"), "no /go/ links");
  assert.ok(!body.includes("hidden_files"), "no hidden_files reference");
  assert.ok(!body.includes("citationMarker"), "no tracking parameter");
});

test("body follows the copy rules: no dashes, no 'you should', no first-person voice", () => {
  copyRules("body", body);
  copyRules("front matter", fmText);
  // URLs are excluded: the Income Tax Act link contains "I-3.3"
  assert.deepEqual(body.replace(/https?:\/\/\S+/g, "").match(/\b(I|we|our|us|my)\b/g), null);
});

test("sitemap FAQs pass the manifest gates and cover the four angles", () => {
  assert.deepEqual(entry.faq_pages, ["FAQPage"]);
  assert.equal(entry.faq.length, 4);
  for (const { q, a } of entry.faq) {
    assert.ok(q.length >= 20 && q.length <= 300, `q length ${q.length}: ${q}`);
    assert.ok(a.length >= 40 && a.length <= 1200, `a length ${a.length}: ${q}`);
    copyRules(q, q + " " + a);
    assert.deepEqual(a.match(/\b(I|we|our|us|my)\b/g), null, `first person in answer: ${q}`);
  }
  const all = entry.faq.map((f) => f.q + " " + f.a).join(" ");
  for (const s of ["January 1", "14%", "December 29, 2026", "T+1", "61-day window", "30 days"]) {
    assert.ok(all.includes(s), `FAQs miss ${s}`);
  }
});

test("page stays unlinked until the December push", () => {
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
    if (f.endsWith("year-end-tax-moves.mdx")) continue;
    assert.ok(!readFileSync(f, "utf8").includes(SLUG), `${f} links ${SLUG}`);
  }
});
