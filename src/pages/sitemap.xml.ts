import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { pages, canonicalUrl } from "../lib/site";

export const prerender = true;

// Generated at build from the canonical sitemap (SEO spec §2):
// canonical, fully-qualified, 200-status URLs only — a slug enters the XML
// only if a route actually exists for it in this build (content collection
// entry or hand-built page). /go/* excluded. lastmod draws from each page's
// last_reviewed where the collection has it; hand-built hubs use the build
// date.
// Known limitation: lastmod updates on every build until the material-change
// rule (git diff of content + figure keys) is implemented — do not treat it
// as a change signal yet.
const STATIC_ROUTES = new Set(["/", "/learn/", "/calculators/", "/compare/"]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const GET: APIRoute = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const lastmod = new Map<string, string>();
  for (const coll of ["explainers", "comparisons", "legal"] as const) {
    for (const e of await getCollection(coll)) {
      // Non-live pages are built with noindex and stay out of the XML,
      // matching the calculator shells.
      if (e.data.status !== "live") continue;
      const v = (e.data as { last_reviewed?: unknown }).last_reviewed;
      lastmod.set(e.data.slug, v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? today));
    }
  }

  const urls = pages
    .filter((p) => !p.slug.startsWith("/go/"))
    .filter((p) => STATIC_ROUTES.has(p.slug) || lastmod.has(p.slug))
    .map(
      (p) =>
        `  <url>\n    <loc>${esc(canonicalUrl(p.slug))}</loc>\n    <lastmod>${lastmod.get(p.slug) ?? today}</lastmod>\n  </url>`,
    )
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
