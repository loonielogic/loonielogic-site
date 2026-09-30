import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { contentManifestIntegration } from "./src/integrations/content-manifest";
import { affiliateRedirectsIntegration } from "./src/integrations/affiliate-redirects";

// Production origin, pinned (never read from CF_PAGES_URL): preview
// deployments must not become canonical. Keep in sync with src/lib/site.ts.
const SITE_URL = "https://loonielogic-site.pages.dev";

export default defineConfig({
  site: SITE_URL,
  output: "static",
  trailingSlash: "never",
  integrations: [mdx(), contentManifestIntegration(), affiliateRedirectsIntegration()],
});
