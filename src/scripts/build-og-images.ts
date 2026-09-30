/**
 * build-og-images.ts (`npm run og`): renders the per-page share cards and
 * the PNG app icons with headless Chromium.
 *
 * Writes:
 *   public/og/<name>.png         1200 x 630 share card per page
 *   public/og/wordmark.png       plain wordmark card for pages without art
 *   public/favicon-32.png, icon-192.png, icon-512.png   transparent mark
 *   public/apple-touch-icon.png  180, opaque Deep Pine ground
 *   public/icon-maskable-512.png 512, mark inside the maskable safe zone
 *   src/data/og-images.json      slug -> image registry read by BaseLayout
 *
 * Run it after changing any page title, meta description, or og_verdict;
 * og-images.test.ts fails `npm run build` until you do. Not part of the
 * Cloudflare build itself, which has no Chromium: the PNGs are committed.
 * Needs network access to fetch the Google Fonts webfonts (inlined into the
 * page, see og/fonts.ts); fails loudly if they did not load rather than
 * shipping cards in a fallback face.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Browser } from "./og/chromium";
import { collectOgEntries } from "./og/collect";
import { inlineWebfontCss } from "./og/fonts";
import { cardHtml, wordmarkHtml, iconHtml, ICON_BACKGROUND } from "./og/template";
import { OG_WIDTH, OG_HEIGHT, type OgEntry, type OgRegistryEntry } from "../lib/og";

const ROOT = join(import.meta.dirname, "..", "..");
const PUBLIC = join(ROOT, "public");
const OG_DIR = join(PUBLIC, "og");
const REGISTRY = join(ROOT, "src", "data", "og-images.json");

interface FitInfo {
  fraunces: boolean;
  instrument: boolean;
  size: number;
  lines: number;
  overflow: boolean;
}

// Shrinks the title (70px down to 46px) until it sits on at most three lines
// and the text column fits above the footer band, then reports font status.
const FIT = `(() => {
  const loaded = (n) => [...document.fonts].some((f) => f.family.replace(/["']/g, "") === n && f.status === "loaded");
  const t = document.querySelector(".title");
  const col = document.querySelector(".col");
  const main = document.querySelector(".main");
  const lines = () => Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight));
  let size = 70;
  if (t) {
    while (size > 46 && (lines() > 3 || col.getBoundingClientRect().height > main.clientHeight - 64)) {
      size -= 2;
      t.style.fontSize = size + "px";
    }
  }
  return {
    fraunces: loaded("Fraunces"),
    instrument: loaded("Instrument Sans"),
    size,
    lines: t ? lines() : 0,
    overflow: col ? col.getBoundingClientRect().height > main.clientHeight - 32 : false,
  };
})()`;

const ICONS: Array<{ file: string; size: number; scale: number; background?: string }> = [
  { file: "favicon-32.png", size: 32, scale: 1 },
  { file: "icon-192.png", size: 192, scale: 1 },
  { file: "icon-512.png", size: 512, scale: 1 },
  { file: "apple-touch-icon.png", size: 180, scale: 0.8, background: ICON_BACKGROUND },
  // Maskable safe zone is the centre circle of radius 40%; the coin fits at 72%.
  { file: "icon-maskable-512.png", size: 512, scale: 0.72, background: ICON_BACKGROUND },
];

async function main(): Promise<void> {
  const entries = collectOgEntries();
  const byName = new Map<string, OgEntry>();
  for (const e of entries) if (!byName.has(e.name)) byName.set(e.name, e);

  mkdirSync(OG_DIR, { recursive: true });
  const fontCss = await inlineWebfontCss();
  const browser = await Browser.launch();
  try {
    for (const [name, e] of byName) {
      const html = e.kind === "wordmark" ? wordmarkHtml(fontCss) : cardHtml(e, fontCss);
      const { png, info } = await browser.screenshot<FitInfo>(html, OG_WIDTH, OG_HEIGHT, { beforeCapture: FIT });
      if (!info?.fraunces || !info.instrument) {
        throw new Error(`${name}: webfonts did not load (Fraunces ${info?.fraunces}, Instrument Sans ${info?.instrument})`);
      }
      if (info.overflow) throw new Error(`${name}: text overflows the card; shorten the title or line`);
      writeFileSync(join(OG_DIR, `${name}.png`), png);
      const fit = e.kind === "wordmark" ? "" : ` (title ${info.size}px, ${info.lines} line${info.lines === 1 ? "" : "s"})`;
      console.log(`og/${name}.png${fit}`);
    }

    for (const icon of ICONS) {
      const { png } = await browser.screenshot(iconHtml(icon.size, icon.scale, icon.background), icon.size, icon.size, {
        transparent: !icon.background,
      });
      writeFileSync(join(PUBLIC, icon.file), png);
      console.log(icon.file);
    }
  } finally {
    await browser.close();
  }

  // Drop cards for pages that no longer exist.
  for (const f of readdirSync(OG_DIR)) {
    if (f.endsWith(".png") && !byName.has(f.slice(0, -4))) {
      rmSync(join(OG_DIR, f));
      console.log(`removed stale og/${f}`);
    }
  }

  const registry: Record<string, OgRegistryEntry> = {};
  for (const e of [...entries].sort((a, b) => a.slug.localeCompare(b.slug))) {
    registry[e.slug] = { image: `/og/${e.name}.png`, alt: e.alt, title: e.title, line: e.line };
  }
  writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");
  console.log(`wrote ${byName.size} cards for ${entries.length} pages, registry at src/data/og-images.json`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
