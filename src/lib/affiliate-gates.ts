/**
 * affiliate-gates.ts: post-build checks on rendered HTML for the affiliate
 * link rules in hidden_files/affiliate-link-implementation-spec.md §7.
 * Run from `validate-content -- --dist` (the last step of `npm run build`),
 * so a violation blocks the deploy rather than relying on an editor to
 * remember.
 *
 *   - every /go/ anchor carries rel="sponsored noopener" and a visible
 *     "(affiliate link)" marker inside the link
 *   - the commission disclosure renders before the first /go/ anchor
 *   - no placeholder tokens (__SUBID__, example-track, INSERT_) leak
 *   - no invented UTM parameters on any href
 *   - /go/ paths never appear in sitemap.xml
 */

export const LEAK_TOKENS = ["__SUBID__", "example-track", "INSERT_"];

/** Marker the commission disclosure bar renders; see ComparisonDisclosure. */
export const DISCLOSURE_MARKER = 'data-affiliate-disclosure="commission"';

const ANCHOR_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? m[1] : null;
}

export function checkAffiliateHtml(route: string, html: string): string[] {
  const errors: string[] = [];
  const where = route || "/";

  let firstGo = -1;
  for (const m of html.matchAll(ANCHOR_RE)) {
    const href = attr(m[1], "href") ?? "";
    if (/utm_[a-z]+=/i.test(href)) {
      errors.push(`${where}: href carries a UTM parameter (${href}); attribution runs through src/pos only`);
    }
    if (!/^\/go\//.test(href)) continue;
    if (firstGo < 0) firstGo = m.index ?? 0;
    const rel = (attr(m[1], "rel") ?? "").split(/\s+/);
    if (!rel.includes("sponsored") || !rel.includes("noopener")) {
      errors.push(`${where}: ${href} is missing rel="sponsored noopener"`);
    }
    if (!/\(affiliate link\)/i.test(m[2])) {
      errors.push(`${where}: ${href} has no visible "(affiliate link)" marker`);
    }
  }

  if (firstGo >= 0) {
    const disclosureAt = html.indexOf(DISCLOSURE_MARKER);
    if (disclosureAt < 0 || disclosureAt > firstGo) {
      errors.push(`${where}: affiliate link appears before (or without) the commission disclosure`);
    }
  }

  for (const t of LEAK_TOKENS) {
    if (html.includes(t)) errors.push(`${where}: placeholder token "${t}" leaked into rendered HTML`);
  }
  return errors;
}

export function checkSitemapHasNoGo(xml: string): string[] {
  return /<loc>[^<]*\/go\//.test(xml) ? ["sitemap.xml lists a /go/ redirect path"] : [];
}
