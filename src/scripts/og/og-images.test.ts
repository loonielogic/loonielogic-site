/**
 * Share cards and app icons: the committed PNGs and src/data/og-images.json
 * must match the page data they were rendered from. A failure here after a
 * title, meta description, or og_verdict edit means: run `npm run og`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { collectOgEntries } from "./collect";
import { truncate, ogTitle, ogName, OG_TITLE_MAX, OG_LINE_MAX, OG_WIDTH, OG_HEIGHT } from "../../lib/og";
import registry from "../../data/og-images.json";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const PUBLIC = join(ROOT, "public");

function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  assert.equal(buf.subarray(1, 4).toString("ascii"), "PNG", `${file} is not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const entries = collectOgEntries();

test("og registry is in sync with page titles and meta (else run `npm run og`)", () => {
  const expected = Object.fromEntries(
    entries.map((e) => [e.slug, { image: `/og/${e.name}.png`, alt: e.alt, title: e.title, line: e.line }]),
  );
  assert.deepEqual(registry, expected);
});

test("every share card exists and is 1200x630", () => {
  for (const { image } of Object.values(registry as Record<string, { image: string }>)) {
    const file = join(PUBLIC, image);
    assert.ok(existsSync(file), `missing ${image}`);
    assert.deepEqual(pngSize(file), { width: OG_WIDTH, height: OG_HEIGHT }, image);
  }
});

test("app icons exist at their declared sizes", () => {
  const icons: Array<[string, number]> = [
    ["favicon-32.png", 32],
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
  ];
  for (const [file, size] of icons) {
    assert.ok(existsSync(join(PUBLIC, file)), `missing ${file}`);
    assert.deepEqual(pngSize(join(PUBLIC, file)), { width: size, height: size }, file);
  }
  const manifest = JSON.parse(readFileSync(join(PUBLIC, "site.webmanifest"), "utf8"));
  for (const icon of manifest.icons) assert.ok(existsSync(join(PUBLIC, icon.src)), `manifest icon ${icon.src}`);
});

test("card text stays inside the caps and uses no em dashes", () => {
  for (const e of entries) {
    assert.ok(e.title.length <= OG_TITLE_MAX, `${e.slug}: title over ${OG_TITLE_MAX}`);
    assert.ok(e.line.length <= OG_LINE_MAX, `${e.slug}: line over ${OG_LINE_MAX}`);
    for (const s of [e.eyebrow, e.title, e.line, e.alt]) assert.ok(!s.includes("—"), `${e.slug}: em dash in "${s}"`);
  }
  for (const f of ["template.ts", "collect.ts"]) {
    assert.ok(!readFileSync(join(import.meta.dirname, f), "utf8").includes("—"), `em dash in ${f}`);
  }
});

test("home and hub shells still render the sitemap.json titles the cards use", () => {
  const shells: Record<string, string> = {
    "/": "src/pages/index.astro",
    "/learn/": "src/pages/learn/index.astro",
    "/calculators/": "src/pages/calculators/index.astro",
    "/compare/": "src/pages/compare/index.astro",
  };
  const sitemap = JSON.parse(readFileSync(join(ROOT, "src/data/sitemap.json"), "utf8"));
  for (const [slug, file] of Object.entries(shells)) {
    const page = sitemap.pages.find((p: { slug: string }) => p.slug === slug);
    assert.ok(readFileSync(join(ROOT, file), "utf8").includes(page.title), `${file} title differs from sitemap.json`);
  }
});

test("truncate prefers sentence, then clause, then word boundaries", () => {
  assert.equal(truncate("Short enough.", 40), "Short enough.");
  assert.equal(truncate("First sentence is here. Second one runs on and on.", 40), "First sentence is here.");
  assert.equal(truncate("Plan it month by month: timeline mode, closing costs, and more", 45), "Plan it month by month: timeline mode…");
  assert.equal(truncate("abc defghij klmnopqrstuvwxyz", 12), "abc defghij…");
  assert.ok(truncate("x ".repeat(100), 30).length <= 30);
});

test("ogTitle drops the brand suffix; ogName flattens slugs", () => {
  assert.equal(ogTitle("Learn Canadian Money: Explainers 2026 | LoonieLogic"), "Learn Canadian Money: Explainers 2026");
  assert.equal(ogName("/"), "home");
  assert.equal(ogName("/learn/"), "learn");
  assert.equal(ogName("/compare/tfsa-vs-rrsp"), "compare-tfsa-vs-rrsp");
});
