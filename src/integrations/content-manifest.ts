/**
 * content-manifest.ts — Astro integration that emits content-manifest.json.
 *
 * The machine-readable feed for the Q4 figure rollover watch
 * (hidden_files/q4-figure-rollover-watch-2026-10.md) and the competitor
 * change-detection process (hidden_files/competitor-change-detection-process.md):
 * per page, the figure keys it cites, when each was verified, when each
 * expires, and when the page itself is next due for review.
 *
 * Content front matter is read from the file system (not "astro:content"):
 * integrations load before the content layer is wired, so importing the
 * virtual module at config time crashes the build. Front matter is parsed
 * with js-yaml — the same parser the content validator uses — so the two
 * paths can never disagree. Date objects js-yaml produces are normalized
 * back to YYYY-MM-DD strings, mirroring the Zod schema's coercion.
 */

import type { AstroIntegration } from "astro";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

interface ManifestFigure {
  key: string;
  verified: string;
  expires: string | null;
}

interface ManifestPage {
  slug: string;
  page_type: string;
  title: string;
  status: string;
  wave: number;
  review_cadence: string;
  next_review_due: string;
  figures: ManifestFigure[];
  affiliate_merchants: string[];
}

function toDateString(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "");
}

function readCollection(
  srcDir: string,
  coll: string,
  pages: ManifestPage[],
): void {
  let files: string[] = [];
  try {
    files = readdirSync(join(srcDir, "content", coll)).filter((f) =>
      f.endsWith(".mdx"),
    );
  } catch {
    return;
  }
  for (const file of files) {
    const raw = readFileSync(join(srcDir, "content", coll, file), "utf8");
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    const fm = (match ? (yaml.load(match[1]) as Record<string, unknown>) : {}) as Record<string, unknown>;
    const figures = (fm.figures as Array<Record<string, unknown>> | undefined) ?? [];
    const links = (fm.affiliate_links as Array<Record<string, unknown>> | undefined) ?? [];
    pages.push({
      slug: String(fm.slug ?? ""),
      page_type: String(fm.page_type ?? ""),
      title: String(fm.title ?? ""),
      status: String(fm.status ?? ""),
      wave: Number(fm.wave ?? 0),
      review_cadence: String(fm.review_cadence ?? ""),
      next_review_due: toDateString(fm.next_review_due),
      figures: figures.map((f) => ({
        key: String(f.key ?? ""),
        verified: toDateString(f.verified),
        expires: f.expires == null ? null : toDateString(f.expires),
      })),
      affiliate_merchants: links.map((l) => String(l.merchant ?? "")),
    });
  }
}

export function contentManifestIntegration(): AstroIntegration {
  return {
    name: "loonie-logic-content-manifest",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");
        const pages: ManifestPage[] = [];
        for (const coll of ["explainers", "comparisons", "legal"]) {
          readCollection(srcDir, coll, pages);
        }

        // Calculator manifests live in src/data/, not in a content collection.
        try {
          const calcData = JSON.parse(
            readFileSync(
              join(srcDir, "data", "calculator-manifests.json"),
              "utf8",
            ),
          );
          const manifests = Array.isArray(calcData.manifests) ? calcData.manifests : [];
          for (const m of manifests) {
            pages.push({
              slug: String(m.slug ?? ""),
              page_type: String(m.page_type ?? ""),
              title: String(m.title ?? ""),
              status: String(m.status ?? ""),
              wave: Number(m.wave ?? 0),
              review_cadence: String(m.review_cadence ?? ""),
              next_review_due: toDateString(m.next_review_due),
              figures: (m.figures ?? []).map((f: Record<string, unknown>) => ({
                key: String(f.key ?? ""),
                verified: toDateString(f.verified),
                expires: f.expires == null ? null : toDateString(f.expires),
              })),
              affiliate_merchants: (m.affiliate_links ?? []).map(
                (l: { merchant: string }) => String(l.merchant ?? ""),
              ),
            });
          }
        } catch {
          // No calculator manifests yet — fine, the pages just don't appear.
        }

        const manifest = {
          generated: new Date().toISOString(),
          pages: pages.sort((a, b) => a.slug.localeCompare(b.slug)),
        };
        const outDir = fileURLToPath(dir);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(
          join(outDir, "content-manifest.json"),
          JSON.stringify(manifest, null, 2),
        );
        logger.info(
          `emitted content-manifest.json with ${pages.length} pages`,
        );
      },
    },
  };
}

export type { ManifestPage };
