/**
 * affiliate-redirects.ts — Astro integration that emits the first-party
 * /go/<merchant>/ redirect table at build time.
 *
 * Per hidden_files/affiliate-link-implementation-spec.md §2:
 * - Only `live` affiliate records generate redirect targets. Anything else
 *   (pending/applied/paused) gets NO redirect — its /go/ path resolves to the
 *   noindex placeholder page instead of pointing somewhere wrong.
 * - Status code 307 (temporary): rotations take effect immediately, no
 *   cached-301 staleness.
 * - Cloudflare Pages format (`_redirects`, 2000-rule limit); the same
 *   generator could emit vercel.json redirects if JJ picks Vercel at launch.
 * - __SUBID__ in the program-issued URL is expanded to `src-pos` so the
 *   network sees our page/position attribution.
 *
 * src/pos attribution params pass through on the query string untouched.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface AffiliateRecord {
  merchant: string;
  display_name: string;
  status: string; // pending | applied | live | paused
  program_url_template: string | null;
  subid_param: string | null;
}

const LEAK_TOKENS = ["__SUBID__", "example-track", "INSERT_"];

export function affiliateRedirectsIntegration() {
  return {
    name: "loonie-logic-affiliate-redirects",
    hooks: {
      "astro:build:done": async ({ dir }: { dir: URL }) => {
        const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
        const affDir = join(root, "src", "data", "affiliates");
        const outDir = fileURLToPath(dir);
        mkdirSync(outDir, { recursive: true });

        const lines: string[] = [
          "# LoonieLogic first-party affiliate redirects — generated at build.",
          "# Only `live` affiliate records get a target; everything else 404s/placeholder.",
          "# Format: Cloudflare Pages _redirects. See hidden_files/affiliate-link-implementation-spec.md §2.",
        ];
        const emitted: { merchant: string; destination: string }[] = [];
        let count = 0;

        for (const file of readdirSync(affDir)) {
          if (!file.endsWith(".json")) continue;
          const rec = JSON.parse(
            readFileSync(join(affDir, file), "utf8"),
          ) as AffiliateRecord;
          if (rec.status !== "live") continue;
          if (!rec.program_url_template) {
            console.warn(
              `[affiliate-redirects] ${rec.merchant} is live but has no program_url_template — skipped`,
            );
            continue;
          }
          // Leak guard (spec §7 gate 4): no placeholder tokens in a live target.
          const leaked = LEAK_TOKENS.filter((t) =>
            rec.program_url_template!.includes(t) && t !== "__SUBID__",
          );
          if (leaked.length > 0) {
            throw new Error(
              `[affiliate-redirects] ${rec.merchant}: placeholder token leaked into program_url_template (${leaked.join(", ")})`,
            );
          }
          // NOTE (spec gap, flagged at scaffold): the affiliate spec wants the
          // sub-ID expanded per click to `src-pos`, but a static host cannot
          // substitute query params into a 307 destination. Until a program
          // goes live, this emits a static sub-ID value; src/pos still ride
          // the query string to the destination (Cloudflare passes query
          // strings through natively), so the network dashboard can read
          // page/position from the full landing URL. Resolve properly
          // (per-position redirect paths or a JS-enhanced /go/ page) before
          // any record flips to `live`.
          const destination = rec.program_url_template.replace(
            "__SUBID__",
            "loonielogic-site",
          );
          lines.push(`/go/${rec.merchant}/  ${destination}  307`);
          lines.push(`/go/${rec.merchant}  ${destination}  307`);
          emitted.push({ merchant: rec.merchant, destination });
          count += 1;
        }

        writeFileSync(join(outDir, "_redirects"), lines.join("\n") + "\n");
        writeFileSync(
          join(outDir, "go-manifest.json"),
          JSON.stringify({ generated: new Date().toISOString(), redirects: emitted }, null, 2),
        );
        console.log(
          `[affiliate-redirects] emitted _redirects with ${count} live merchant(s)`,
        );
      },
    },
  };
}
