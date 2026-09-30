import type { APIRoute } from "astro";
import { SITE_URL } from "../lib/site";

export const prerender = true;

// robots.txt is generated per environment (SEO spec §2): preview/staging
// hosts must never be crawled. Cloudflare Pages sets CF_PAGES_BRANCH on every
// build; anything that isn't the production branch gets a full disallow.
// Indexing is also opt-in (ALLOW_INDEXING=true in the Pages production env)
// so pinning SITE_URL does not silently open the site to crawlers before
// launch. Until that flag is set, every build disallows everything.
const branch = import.meta.env.CF_PAGES_BRANCH as string | undefined;
const allowIndexing = import.meta.env.ALLOW_INDEXING === "true";
const isProd = allowIndexing && (!branch || branch === "main");

export const GET: APIRoute = () => {
  const body = isProd
    ? `User-agent: *\nAllow: /\n\nDisallow: /go/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
