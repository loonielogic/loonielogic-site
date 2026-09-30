import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { contentManifestIntegration } from "./src/integrations/content-manifest";
import { affiliateRedirectsIntegration } from "./src/integrations/affiliate-redirects";

// The canonical site URL comes from the environment at build time.
// Cloudflare Pages provides CF_PAGES_URL on preview builds; production
// overrides via SITE_URL once the domain is bought.
const SITE_URL = (
  process.env.SITE_URL ||
  process.env.CF_PAGES_URL ||
  "https://loonielogic.ca"
).replace(/\/$/, "");

export default defineConfig({
  site: SITE_URL,
  output: "static",
  trailingSlash: "never",
  integrations: [mdx(), contentManifestIntegration(), affiliateRedirectsIntegration()],
});
