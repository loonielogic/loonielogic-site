/**
 * tools-nav.ts: the calculator list behind the "Tools" dropdown in the top
 * nav (BaseLayout). Short names live here; each descriptor is the page's
 * short card text (`card_dek`) from src/data/sitemap.json, so the nav and
 * the hub cards say the same thing. Every calculator manifest must appear
 * here (tools-nav.test.ts enforces it).
 */

import { pageBySlug } from "./site";

export interface ToolLink {
  slug: string;
  name: string;
  descriptor: string;
}

export interface ToolGroup {
  label: string;
  tools: ToolLink[];
}

const GROUPS: { label: string; tools: [string, string][] }[] = [
  {
    label: "Tax and retirement",
    tools: [
      ["/calculators/income-tax-calculator", "Income Tax Calculator"],
      ["/calculators/tfsa-vs-rrsp", "TFSA vs RRSP"],
      ["/calculators/rrsp-room", "RRSP Room Calculator"],
      ["/calculators/tfsa-room-checker", "TFSA Room Checker"],
      ["/calculators/cpp-timing", "CPP Timing"],
    ],
  },
  {
    label: "Home buying",
    tools: [
      ["/calculators/house-affordability", "House Affordability"],
      ["/calculators/down-payment-planner", "Down Payment Planner"],
      ["/calculators/rent-vs-buy", "Rent vs Buy"],
    ],
  },
  {
    label: "Saving and investing",
    tools: [
      ["/calculators/compound-growth", "Wealth Over Time"],
      ["/calculators/goal-planner", "Goal Planner"],
    ],
  },
];

export const TOOL_GROUPS: ToolGroup[] = GROUPS.map((g) => ({
  label: g.label,
  tools: g.tools.map(([slug, name]) => {
    const page = pageBySlug.get(slug);
    if (!page) throw new Error(`tools nav: ${slug} is not in sitemap.json`);
    return { slug, name, descriptor: page.card_dek ?? page.meta_description };
  }),
}));

export const TOOLS: ToolLink[] = TOOL_GROUPS.flatMap((g) => g.tools);
