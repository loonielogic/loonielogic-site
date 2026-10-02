/**
 * Tests for the first-home savings cluster hub (item 83): it ships as a
 * draft, off the sitemap and unlinked until the November wave-2 push, with
 * every figure traced to the registry, FAQs living only in the manifest, and
 * every cluster card that is not live rendered unlinked.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { explainerSchema } from "../../schemas/page-manifest";
import sitemap from "../../data/sitemap.json";

const SLUG = "/learn/first-home-savings";
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const raw = readFileSync(join(import.meta.dirname, "first-home-savings.mdx"), "utf8");
const [, fmText, body] = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)!;
const fm = explainerSchema.parse(yaml.load(fmText));
type Entry = {
  slug: string;
  status?: string;
  title: string;
  meta_description: string;
  wave: number;
  cluster: string;
  hub: string;
  related: string[];
  faq_pages: string[];
  faq: { q: string; a: string }[];
};
const pages = sitemap.pages as unknown as Entry[];
const entry = pages.find((p) => p.slug === SLUG)!;

const FIGURES_DIR = join(import.meta.dirname, "..", "..", "data", "figures");
const registry = new Map<string, { status: string; source: string; verified_date: string }>();
for (const name of readdirSync(FIGURES_DIR).filter((n) => n.endsWith(".json"))) {
  const j = JSON.parse(readFileSync(join(FIGURES_DIR, name), "utf8"));
  for (const e of j.entries ?? []) registry.set(e.key, e);
}

function copyRules(where: string, text: string) {
  assert.ok(!text.includes(EM_DASH), `${where}: em dash`);
  assert.ok(!text.includes(EN_DASH), `${where}: en dash`);
  assert.ok(!/you should/i.test(text), `${where}: "you should"`);
}

test("front matter: draft, no publish date, identity and navigation match the manifest", () => {
  assert.ok(entry, "sitemap entry missing");
  assert.equal(fm.slug, SLUG);
  assert.equal(fm.page_type, "explainer");
  assert.equal(fm.status, "draft");
  assert.equal(fm.publish_date, null);
  assert.equal(fm.last_reviewed, "2026-10-02");
  assert.equal(fm.wave, 2);
  assert.equal(fm.title, "First Home Down Payment Strategy: FHSA + HBP + TFSA 2026");
  assert.equal(
    fm.meta_description,
    "The one-page first-home down payment strategy: FHSA first ($8,000/yr), HBP second ($60,000), TFSA as overflow. Room math, costed traps, and the cluster guides.",
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
});

test("every figure is a verified registry key cited at its registry source", () => {
  const keys = fm.figures.map((f) => f.key).sort();
  assert.deepEqual(keys, [
    "down_payment.tiers.2026",
    "fhsa.annual_limit",
    "fhsa.carry_forward",
    "fhsa.excess_tax",
    "fhsa.lifespan",
    "fhsa.lifetime_limit",
    "fhsa.qualifying_withdrawal",
    "gift.donor.capital_gains_inclusion.2026",
    "gift.lender.gift_letter_required.2026",
    "gift.lender.paper_trail_days.2026",
    "gift.recipient_tax_rate.2026",
    "hbp.couple_limit",
    "hbp.fhsa_stack",
    "hbp.limit.2026",
    "hbp.repayment_period",
    "hbp.repayment_start",
    "hbp.rules",
  ]);
  for (const f of fm.figures) {
    const reg = registry.get(f.key);
    assert.ok(reg, `${f.key} not in registry`);
    assert.equal(reg.status, "verified", f.key);
    assert.equal(f.source, reg.source, `${f.key} source`);
    assert.equal(f.verified, reg.verified_date, `${f.key} verified`);
    assert.equal(f.expires, "2027-01-01", `${f.key} expires`);
  }
});

test("body keeps the verdict, the Lucas worked example, and four costed traps", () => {
  for (const h of [
    "## The verdict",
    "## The stack order",
    "## The December 31 band",
    "## Worked example: $40,000 of FHSA room on a $600,000 home",
    "## Four traps that cost real money",
    "## The cluster: every piece of the strategy",
    "## Sources",
  ]) {
    assert.ok(body.includes(h), `missing ${h}`);
  }
  for (const s of ["$35,000", "$40,000", "$16,000", "$2,372", "$11,860", "$4,000", "29.65%", "$200,000", "Schedule 7"]) {
    assert.ok(body.includes(s), `missing ${s}`);
  }
  const traps = body.match(/^\*\*\d\. .+?\*\* .*Cost: .*\$[\d,]+/gm) ?? [];
  assert.equal(traps.length, 4, "exactly 4 traps, each with a costed figure");
  for (const cost of ["$8,000 of lifetime tax-free room", "$2,965", "$2,372", "$1,186"]) {
    assert.ok(body.includes(cost), `trap cost ${cost}`);
  }
  // The 5-year HBP grace is 2022-2025 only; never the unconfirmed 2026-2028 claim.
  assert.ok(body.includes("2022-2025"));
  assert.ok(!/2026-2028/.test(body), "stale 2026-2028 grace claim");
  assert.ok(body.includes("This page carries no affiliate links"));
  assert.ok(body.trimEnd().endsWith("*"), "closing disclaimer line");
});

test("body follows the copy rules: no dashes, no 'you should', no first-person voice", () => {
  copyRules("body", body);
  copyRules("front matter", fmText);
  assert.deepEqual(body.match(/\b(I|we|our|us|my)\b/g), null);
});

test("FAQs live only in the manifest and pass the manifest gates", () => {
  assert.ok(!/^#+\s*(FAQ|Frequently asked)/im.test(body), "no in-page FAQ heading");
  assert.deepEqual(fm.faq, []);
  assert.deepEqual(entry.faq_pages, ["FAQPage"]);
  assert.equal(entry.faq.length, 4);
  for (const { q, a } of entry.faq) {
    assert.ok(q.length >= 20 && q.length <= 300, `q length ${q.length}: ${q}`);
    assert.ok(a.length >= 40 && a.length <= 1200, `a length ${a.length}: ${q}`);
    copyRules(q, q + " " + a);
    assert.deepEqual(a.match(/\b(I|we|our|us|my)\b/g), null, `first person in answer: ${q}`);
  }
});

test("cluster cards: live targets linked, everything else unlinked and marked coming soon", () => {
  const cluster = body.split("## The cluster: every piece of the strategy")[1].split("\n## ")[0];
  const cards: Record<string, string> = {
    "/learn/fhsa": "**FHSA explainer**",
    "/learn/home-buyers-plan": "**Home Buyers' Plan explainer**",
    "/compare/fhsa-vs-home-buyers-plan": "**FHSA vs Home Buyers' Plan**",
    "/calculators/down-payment-planner": "**Down payment planner**",
    "/learn/fhsa-open-before-dec-31": "**Open an FHSA before Dec 31**",
    "/learn/gifted-down-payment-tax-rules": "**Gifted down payment tax rules**",
  };
  assert.deepEqual(Object.keys(cards), fm.related);
  for (const [slug, label] of Object.entries(cards)) {
    const line = cluster.split("\n").find((l) => l.includes(label));
    assert.ok(line, `missing card ${label}`);
    const live = pages.find((p) => p.slug === slug)?.status === "live";
    if (live) assert.ok(line.includes(`](${slug})`), `${slug} is live but unlinked`);
    else {
      assert.ok(!line.includes("]("), `${slug} is not live but linked`);
      assert.ok(line.includes("(coming soon)"), `${slug} not marked coming soon`);
    }
  }
});

test("spoke pages point back up to the hub in the manifest", () => {
  for (const slug of ["/learn/fhsa", "/learn/home-buyers-plan", "/learn/fhsa-open-before-dec-31"]) {
    const spoke = pages.find((p) => p.slug === slug)!;
    assert.ok(spoke.related.includes(SLUG), `${slug} related lacks ${SLUG}`);
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
    if (f.endsWith("first-home-savings.mdx")) continue;
    assert.ok(!readFileSync(f, "utf8").includes(SLUG), `${f} links ${SLUG}`);
  }
});
