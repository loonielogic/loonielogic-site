/**
 * collect.ts: the list of share cards to render, built from the same data
 * each page renders its <title> and meta description from:
 *   - home + hubs: src/data/sitemap.json (og-images.test.ts checks the
 *     .astro shells still carry those titles)
 *   - /learn/* (incl. /learn/kids/*), /compare/*, legal pages: content front matter
 *   - calculators: src/data/calculator-manifests.json, for tools that have a page
 *   - noindex utility pages (404, /go/*): the plain wordmark card
 *
 * Comparisons carry a one-line `og_verdict` in front matter; every other
 * card uses the meta description, truncated.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { ogName, ogTitle, truncate, OG_LINE_MAX, type OgEntry, type OgKind } from "../../lib/og";

const SRC = join(import.meta.dirname, "..", "..");

const HUB_EYEBROW: Record<string, string> = {
  "/learn/": "Learn",
  "/calculators/": "Tools",
  "/compare/": "Compare",
};

const TYPE_EYEBROW: Record<string, string> = {
  explainer: "Learn",
  glossary: "Learn",
  "kids-lesson": "Kids money lesson",
  comparison: "Compare",
  calculator: "Tools",
  legal: "The fine print",
  home: "",
};

const TYPE_NOUN: Record<string, string> = {
  home: "home page",
  hub: "section page",
  explainer: "explainer",
  glossary: "glossary",
  "kids-lesson": "kids money lesson",
  comparison: "comparison",
  calculator: "tool",
  legal: "page",
};

interface Source {
  slug: string;
  page_type: string;
  title: string;
  meta_description: string;
  og_verdict?: string;
}

function card(src: Source): OgEntry {
  const kind = src.page_type as OgKind;
  const title = ogTitle(src.title);
  const isVerdict = kind === "comparison" && Boolean(src.og_verdict);
  const line = truncate(isVerdict ? src.og_verdict! : src.meta_description, OG_LINE_MAX);
  // /about mirrors its on-page eyebrow; the other legal pages are the fine print.
  const eyebrow =
    kind === "hub" ? (HUB_EYEBROW[src.slug] ?? "") : src.slug === "/about" ? "About" : (TYPE_EYEBROW[kind] ?? "");
  const noun = TYPE_NOUN[kind] ?? "page";
  const alt = isVerdict ? `LoonieLogic ${noun}: ${title}. Verdict: ${line}` : `LoonieLogic ${noun}: ${title}`;
  return { slug: src.slug, kind, name: ogName(src.slug), eyebrow, title, line, isVerdict, alt };
}

function wordmark(slug: string): OgEntry {
  return {
    slug,
    kind: "wordmark",
    name: "wordmark",
    eyebrow: "",
    title: "LoonieLogic",
    line: "",
    isVerdict: false,
    alt: "LoonieLogic wordmark beside the gold loon coin mark",
  };
}

function frontMatter(file: string): Record<string, unknown> {
  const raw = readFileSync(file, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  return (m ? yaml.load(m[1]) : {}) as Record<string, unknown>;
}

/** .mdx files under `dir`, subdirectories included (e.g. explainers/kids/). */
function mdxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir).sort()) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) out.push(...mdxFiles(full));
    else if (f.endsWith(".mdx")) out.push(full);
  }
  return out;
}

export function collectOgEntries(): OgEntry[] {
  const out: OgEntry[] = [];

  const sitemap = JSON.parse(readFileSync(join(SRC, "data", "sitemap.json"), "utf8")) as {
    pages: Source[];
    hubs: { slug: string }[];
  };
  const hubSlugs = new Set(sitemap.hubs.map((h) => h.slug));
  for (const p of sitemap.pages) {
    if (p.slug === "/" || hubSlugs.has(p.slug)) out.push(card(p));
  }

  for (const coll of ["explainers", "comparisons", "legal"]) {
    const dir = join(SRC, "content", coll);
    if (!existsSync(dir)) continue;
    for (const f of mdxFiles(dir)) {
      const fm = frontMatter(f);
      out.push(
        card({
          slug: String(fm.slug),
          page_type: String(fm.page_type),
          title: String(fm.title),
          meta_description: String(fm.meta_description),
          og_verdict: fm.og_verdict == null ? undefined : String(fm.og_verdict),
        }),
      );
    }
  }

  const calc = JSON.parse(readFileSync(join(SRC, "data", "calculator-manifests.json"), "utf8")) as {
    manifests: Source[];
  };
  for (const m of calc.manifests) {
    const page = join(SRC, "pages", `${m.slug.replace(/^\//, "")}.astro`);
    if (existsSync(page)) out.push(card(m));
  }

  out.push(wordmark("/404"));
  const affiliates = JSON.parse(readFileSync(join(SRC, "data", "affiliates-index.json"), "utf8"));
  for (const merchant of Object.keys(affiliates).sort()) out.push(wordmark(`/go/${merchant}/`));

  return out;
}
