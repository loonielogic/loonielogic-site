/**
 * Tests for the first-paycheque playbook (item 65): it ships as a draft,
 * off the sitemap and unlinked until publish, with every figure traced to
 * the registry, the worked paystub math recomputed from registry values,
 * and the copy rules holding in body and FAQs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { explainerSchema } from "../../schemas/page-manifest";
import sitemap from "../../data/sitemap.json";

const SLUG = "/learn/first-paycheque-playbook";
const EM_DASH = String.fromCharCode(0x2014);
const raw = readFileSync(join(import.meta.dirname, "first-paycheque-playbook.mdx"), "utf8");
const [, fmText, body] = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)!;
const fm = explainerSchema.parse(yaml.load(fmText));
const entry = sitemap.pages.find((p) => p.slug === SLUG) as unknown as {
  status: string;
  title: string;
  meta_description: string;
  faq_pages: string[];
  faq: { q: string; a: string }[];
};

type RegEntry = { key: string; value: unknown; status: string; source: string };
const FIGURES_DIR = join(import.meta.dirname, "..", "..", "data", "figures");
const registry = new Map<string, RegEntry>();
for (const name of readdirSync(FIGURES_DIR)) {
  for (const e of JSON.parse(readFileSync(join(FIGURES_DIR, name), "utf8")).entries as RegEntry[]) registry.set(e.key, e);
}
const reg = <T>(key: string) => registry.get(key)!.value as T;
type Bracket = { rate: number; upper: number | null };

const cad = (n: number) =>
  "$" + n.toLocaleString("en-CA", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
const cents = (n: number) => "$" + n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (r: number) => `${+(r * 100).toFixed(2)}%`;
const round2 = (n: number) => Math.round(n * 100 + Number.EPSILON) / 100;

function copyRules(where: string, text: string) {
  assert.ok(!text.includes(EM_DASH), `${where}: em dash`);
  assert.ok(!/you should/i.test(text), `${where}: "you should"`);
}

test("front matter: draft, no publish date, title and meta verbatim", () => {
  assert.equal(fm.slug, SLUG);
  assert.equal(fm.status, "draft");
  assert.equal(fm.publish_date, null);
  assert.equal(fm.wave, 3);
  assert.equal(fm.cluster, "tax");
  assert.equal(fm.hub, "/learn/");
  assert.deepEqual(fm.related, [
    "/calculators/income-tax-calculator",
    "/learn/first-time-tax-filing",
    "/learn/federal-tax-brackets-2026",
  ]);
  assert.equal(fm.title, "First paycheque, decoded: CPP, EI, tax, and the first $1,000");
  assert.equal(
    fm.meta_description,
    "Your first paycheque is smaller than hours times rate. CPP at 5.95%, EI at 1.63%, and income tax decoded line by line, plus where the first $1,000 should go.",
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
    "bpa.federal.max.2026",
    "bpa.provincial.2026",
    "cpp.cpp2_employee_max.2026",
    "cpp.cpp2_rate.2026",
    "cpp.employee_max.2026",
    "cpp.employee_rate.2026",
    "cpp.yampe.2026",
    "cpp.ybe.2026",
    "cpp.ympe.2026",
    "credits.canada_employment_amount.2026",
    "credits.ohp_threshold.2026",
    "credits.ohp_tier1_rate.2026",
    "credits.ontario_lift_max.2026",
    "credits.ontario_lift_rate.2026",
    "credits.ontario_tax_reduction_basic.2026",
    "ei.employee_max.2026",
    "ei.employee_rate.2026",
    "ei.mie.2026",
    "ei.qc_employee_max.2026",
    "ei.qc_employee_rate.2026",
    "federal.brackets.2026",
    "provincial.brackets.2026",
  ]);
  for (const f of fm.figures) {
    const r = registry.get(f.key)!;
    assert.equal(r.status, "verified", f.key);
    assert.equal(f.source, r.source, `${f.key} source`);
    assert.equal(f.expires, "2027-01-01", `${f.key} expires`);
  }
});

test("body figures match the registry", () => {
  const expected = [
    cad(reg<number>("cpp.ympe.2026")),
    cad(reg<number>("cpp.ybe.2026")),
    pct(reg<number>("cpp.employee_rate.2026")),
    cad(reg<number>("cpp.employee_max.2026")),
    cad(reg<number>("cpp.yampe.2026")),
    `CPP2 contribution of ${pct(reg<number>("cpp.cpp2_rate.2026"))} (maximum ${cad(reg<number>("cpp.cpp2_employee_max.2026"))})`,
    cad(reg<number>("ei.mie.2026")),
    pct(reg<number>("ei.employee_rate.2026")),
    cad(reg<number>("ei.employee_max.2026")),
    `${(reg<number>("ei.qc_employee_rate.2026") * 100).toFixed(2)}% (maximum ${cents(reg<number>("ei.qc_employee_max.2026"))})`,
    cad(reg<number>("bpa.federal.max.2026")),
    `Ontario's is ${cad(reg<Record<string, number>>("bpa.provincial.2026").ON)}`,
    `first federal bracket is ${pct(reg<Bracket[]>("federal.brackets.2026")[0].rate)}`,
    `${pct(reg<Bracket[]>("provincial.brackets.2026").ON[0].rate)} to`,
    `${cad(reg<number>("credits.canada_employment_amount.2026"))} Canada employment amount`,
    cents(120),
    "Ontario tax reduction",
    "LIFT",
  ];
  for (const s of expected) assert.ok(body.includes(s), `missing ${s}`);
});

test("worked paystub math recomputes from registry values (full-credit model)", () => {
  const ybe = reg<number>("cpp.ybe.2026");
  const cppRate = reg<number>("cpp.employee_rate.2026");
  const eiRate = reg<number>("ei.employee_rate.2026");
  const fedBpa = reg<number>("bpa.federal.max.2026");
  const onBpa = reg<Record<string, number>>("bpa.provincial.2026").ON;
  const fedRate = reg<Bracket[]>("federal.brackets.2026")[0].rate;
  const onRate = reg<Bracket[]>("provincial.brackets.2026").ON[0].rate;
  const cea = reg<number>("credits.canada_employment_amount.2026");
  const onTrBasic = reg<number>("credits.ontario_tax_reduction_basic.2026");
  const liftMax = reg<number>("credits.ontario_lift_max.2026");
  const liftRate = reg<number>("credits.ontario_lift_rate.2026");
  const ohpThreshold = reg<number>("credits.ohp_threshold.2026");
  const ohpTier1Rate = reg<number>("credits.ohp_tier1_rate.2026");
  const cases = [
    { gross: 15_000, total: 928.75, takeHome: 14071.25 },
    { gross: 22_000, total: 1941.62, takeHome: 20058.38 },
  ];
  for (const { gross, total, takeHome } of cases) {
    const cpp = round2((gross - ybe) * cppRate);
    const ei = round2(gross * eiRate);
    const fedNet = round2(Math.max(0, gross * fedRate - (fedBpa + cpp + ei + cea) * fedRate));
    const onNet1 = round2(Math.max(0, gross * onRate - (onBpa + cpp + ei) * onRate));
    const onNet2 = round2(Math.max(0, onNet1 - Math.max(0, 2 * onTrBasic - onNet1)));
    const onNet3 = round2(Math.max(0, onNet2 - Math.min(liftMax, liftRate * gross)));
    const ohp = gross <= ohpThreshold ? 0 : round2(ohpTier1Rate * (gross - ohpThreshold));
    const lines = [cpp, ei, fedNet, round2(onNet3 + ohp)];
    for (const l of lines) assert.ok(body.includes(`| ${cents(l)} |`), `${gross}: missing line ${cents(l)}`);
    const sum = round2(lines.reduce((a, b) => a + b, 0));
    assert.equal(sum, total, `${gross} total`);
    assert.equal(round2(gross - sum), takeHome, `${gross} take-home`);
    assert.ok(body.includes(`**${cents(total)}**`) && body.includes(`**${cents(takeHome)}**`), `${gross} totals in body`);
  }
});

test("body keeps the paystub lines, six traps, and closing disclaimer", () => {
  for (const n of [1, 2, 3, 4, 5, 6]) assert.ok(body.includes(`**${n}. `), `missing numbered item ${n}`);
  for (const h of [
    "## The 30-second version",
    "## The paystub, decoded",
    "## The worked math: two part-time paycheques",
    "## The TD1: the most skipped form in the building",
    "## Where the first $1,000 goes",
    "## The expensive mistakes",
    "## How to act",
    "## Sources",
  ]) {
    assert.ok(body.includes(h), `missing ${h}`);
  }
  assert.ok(body.includes("**only one**"), "TD1 two-job rule");
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

test("page stays unlinked until publish", () => {
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
    if (f.endsWith("first-paycheque-playbook.mdx")) continue;
    assert.ok(!readFileSync(f, "utf8").includes(SLUG), `${f} links ${SLUG}`);
  }
});
