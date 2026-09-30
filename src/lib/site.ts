import sitemap from "../data/sitemap.json";

export interface SitemapPage {
  slug: string;
  page_type: string;
  title: string;
  meta_description: string;
  hub: string | null;
  cluster: string;
  related: string[];
  wave: number;
  review_cadence: string;
}

export interface Hub {
  section: string;
  slug: string;
  title: string;
}

export const pages: SitemapPage[] = (sitemap as { pages: SitemapPage[] }).pages;
export const hubs: Hub[] = (sitemap as { hubs: Hub[] }).hubs;

export const pageBySlug = new Map(pages.map((p) => [p.slug, p]));

export const SITE_URL = (
  process.env.SITE_URL ||
  process.env.CF_PAGES_URL ||
  "https://loonielogic.ca"
).replace(/\/$/, "");

export function canonicalUrl(slug: string): string {
  return `${SITE_URL}${slug === "/" ? "" : slug}`;
}

export function sectionPages(hubSlug: string): SitemapPage[] {
  return pages.filter((p) => p.hub === hubSlug);
}
