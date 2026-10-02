/**
 * Tests for the FHSA Dec-31 campaign page (item 64): it ships as a draft,
 * off the sitemap and unlinked until the November push, with every figure
 * traced to the registry and the copy rules holding in body and FAQs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { explainerSchema } from "../../schemas/page-manifest";
import sitemap from "../../data/sitemap.json";
import figures from "../../data/figures/fhsa-hbp-2026.json";

const SLUG = "/learn/fhsa-open-before-dec-31";
const EM_DASH = String.fromCharCode(0x2014);
const raw = readFileSync(join(import.meta.dirname, "fhsa-open-before-dec-31.mdx"), "utf8");
const [, fmText, body] = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)!;
const fm = explainerSchema.parse(yaml.load(fmText));
const entry = sitemap.pages.find((p) => p.slug === SLUG) as unknown as {
  status: string;
  title: string;
  meta_description: string;
  faq_pages: string[];
  faq: { q: string; a: string }[];
};

function copyRules(where: string, text: string) {
  assert.ok(!text.includes(EM_DASH), `${where}: em dash`);
  assert.ok(!/you should/i.test(text), `${where}: "you should"`);
}

test("front matter: draft, no publish date, title and meta verbatim", () => {
  assert.equal(fm.slug, SLUG);
  assert.equal(fm.status, "draft");
  assert.equal(fm.publish_date, null);
  assert.equal(fm.wave, 2);
  assert.equal(fm.title, "Open your FHSA before Dec 31: why 2026 room is lost forever");
  assert.equal(
    fm.meta_description,
    "FHSA room starts when you open the account. Open in December 2026 to bank $8,000 of room for 2027; wait until January and it is gone. Here is the checklist.",
  );
  assert.equal(fm.title, entry.title);
  assert.equal(fm.meta_description, entry.meta_description);
  assert.equal(entry.status, "draft");
  assert.equal(fm.affiliate_disclosure, false);
  assert.deepEqual(fm.affiliate_links, []);
});

test("every figure is a verified registry key cited at its registry source", () => {
  const keys = fm.figures.map((f) => f.key).sort();
  assert.deepEqual(keys, [
    "fhsa.annual_limit",
    "fhsa.carry_forward",
    "fhsa.excess_tax",
    "fhsa.lifespan",
    "fhsa.lifetime_limit",
  ]);
  for (const f of fm.figures) {
    const reg = figures.entries.find((e) => e.key === f.key)!;
    assert.equal(reg.status, "verified", f.key);
    assert.equal(f.source, reg.source, `${f.key} source`);
    assert.equal(f.expires, "2027-01-01", `${f.key} expires`);
  }
});

test("body keeps the room math and all six checklist steps", () => {
  for (const n of [1, 2, 3, 4, 5, 6]) assert.ok(body.includes(`**Step ${n}.`), `missing step ${n}`);
  for (const s of ["$8,000", "$16,000", "$40,000", "$80,000", "Schedule 15", "RC728", "1% per month"]) {
    assert.ok(body.includes(s), `missing ${s}`);
  }
  for (const h of ["## The 30-second version", "## The numbers that matter in 2026", "## Sources"]) {
    assert.ok(body.includes(h), `missing ${h}`);
  }
  assert.ok(body.trimEnd().endsWith("*"), "closing disclaimer line");
  assert.ok(body.includes("*Not financial advice"));
});

test("body follows the copy rules: no em dashes, no 'you should', no first-person voice", () => {
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

test("page stays unlinked until the November push", () => {
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
    if (f.endsWith("fhsa-open-before-dec-31.mdx")) continue;
    assert.ok(!readFileSync(f, "utf8").includes(SLUG), `${f} links ${SLUG}`);
  }
});
