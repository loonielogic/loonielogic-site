import type { APIRoute } from "astro";
import { SITE_URL } from "../lib/site";

export const prerender = true;

// robots.txt is generated per environment (SEO spec §2): preview/staging
// hosts must never be crawled. Cloudflare Pages sets CF_PAGES_BRANCH on every
// build — anything that isn't the production branch gets a full disallow.
// A SITE_URL override to a non-production host is treated the same way.
const branch = import.meta.env.CF_PAGES_BRANCH as string | undefined;
const isProd =
  SITE_URL === "https://loonielogic.ca" &&
  (!branch || branch === "main");

export const GET: APIRoute = () => {
  const body = isProd
    ? `User-agent: *\nAllow: /\n\nDisallow: /go/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
