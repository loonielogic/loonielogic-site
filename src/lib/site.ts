import sitemap from "../data/sitemap.json";

export interface SitemapPage {
  slug: string;
  page_type: string;
  title: string;
  meta_description: string;
  hub: string | null;
  card_dek?: string; // short card text; hubs and related cards fall back to meta_description
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

// Production origin, pinned on purpose: canonicals, sitemap.xml, and JSON-LD
// must never pick up a per-deployment preview URL (CF_PAGES_URL). Keep in sync
// with `site` in astro.config.mjs.
export const SITE_URL = "https://loonielogic-site.pages.dev";

// Default share image (the loon avatar) for og:image / twitter:image.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/loonielogic-og.png`;

// The site webfont stack (Fraunces + Instrument Sans). BaseLayout links it;
// the share-card renderer loads the same sheet so cards match the pages.
export const WEBFONT_CSS =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600&family=Instrument+Sans:wght@400..700&display=swap";

export function canonicalUrl(slug: string): string {
  return `${SITE_URL}${slug === "/" ? "" : slug}`;
}

export function sectionPages(hubSlug: string): SitemapPage[] {
  return pages.filter((p) => p.hub === hubSlug);
}
