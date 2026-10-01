/**
 * rent-vs-buy-render.ts: turns an RvbResult into the results HTML for the
 * rent vs buy calculator. Used at build time (the page shows the spec's
 * Toronto example with JS off) and in the browser on every input change.
 * Only numbers and fixed copy are rendered.
 *
 * Copy rules: projections are illustrations under the assumptions shown,
 * never forecasts; "never" is a plain answer, not an error; no em dashes;
 * never "you should".
 */

import { $, alerts, card, pct, row, table, type Alert } from "./calc-kit";
import {
  GRID_APPRECIATION,
  GRID_RETURN,
  PTR_BUY_BELOW,
  PTR_RENT_ABOVE,
  STRETCH_MULTIPLE,
  type RvbResult,
} from "./rent-vs-buy";

export const DISCLAIMER =
  "An illustration under the assumptions shown, not a forecast or advice. Home prices, rents, rates and returns will not follow a straight line.";

const yrs = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;

function headline(x: RvbResult): string {
  const r = x.input;
  const gap = Math.abs(x.gapAtTenure);
  const be = x.sim.breakeven;
  if (x.verdict === "buy") {
    return `<div class="ck-headline ck-tone-good"><p class="ck-kicker">Over ${yrs(r.years)}, under these assumptions</p><p class="ck-big">Buying comes out ahead</p><p class="ck-lead">Buying leaves you about <strong>${$(gap)}</strong> richer after ${yrs(r.years)} than renting and investing the difference. Buying catches up in year ${be}.</p><p class="ck-verdict"><span class="ck-verdict-dot" aria-hidden="true"></span>${gridLine(x)}</p></div>`;
  }
  const catchUp = be === null ? "Buying never catches up within 30 years under these assumptions." : `Buying only catches up in year ${be}, after the ${yrs(r.years)} you plan to stay.`;
  return `<div class="ck-headline"><p class="ck-kicker">Over ${yrs(r.years)}, under these assumptions</p><p class="ck-big">Renting comes out ahead</p><p class="ck-lead">Renting and investing the difference leaves you about <strong>${$(gap)}</strong> richer after ${yrs(r.years)}. ${catchUp}</p><p class="ck-verdict"><span class="ck-verdict-dot" aria-hidden="true"></span>${gridLine(x)}</p></div>`;
}

function gridLine(x: RvbResult): string {
  const n = x.grid.length;
  const rent = x.rentCells;
  if (rent === n) return `Renting wins in all ${n} of the scenarios below.`;
  if (rent === 0) return `Buying wins in all ${n} of the scenarios below.`;
  return rent > n / 2
    ? `Renting wins in ${rent} of ${n} scenarios below; the answer depends on your assumptions.`
    : `Buying wins in ${n - rent} of ${n} scenarios below; the answer depends on your assumptions.`;
}

/** Two-line SVG chart of net wealth by year, with the breakeven marked. */
export function renderChart(x: RvbResult): string {
  const rows = x.sim.rows.slice(0, Math.max(x.input.years, Math.min(30, (x.sim.breakeven ?? 0) + 2)));
  const W = 640;
  const H = 260;
  const L = 56;
  const R = 12;
  const T = 12;
  const B = 28;
  const all = rows.flatMap((p) => [p.buy, p.rent]);
  const lo = Math.min(0, ...all);
  const hi = Math.max(...all, 1);
  const xs = (year: number) => L + ((year - 1) / Math.max(1, rows.length - 1)) * (W - L - R);
  const ys = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (k: "buy" | "rent") => rows.map((p, n) => `${n === 0 ? "M" : "L"}${xs(p.year).toFixed(1)},${ys(p[k]).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
  const fmt = (v: number) => (Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${Math.round(v / 1000)}k`);
  const grid = ticks.map((v) => `<line class="ck-gridline" x1="${L}" x2="${W - R}" y1="${ys(v).toFixed(1)}" y2="${ys(v).toFixed(1)}"/><text x="${L - 6}" y="${(ys(v) + 4).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`).join("");
  const step = rows.length > 15 ? 5 : rows.length > 8 ? 2 : 1;
  const xticks = rows.filter((p) => p.year === 1 || p.year % step === 0).map((p) => `<text x="${xs(p.year).toFixed(1)}" y="${H - 8}" text-anchor="middle">${p.year}</text>`).join("");
  const be = x.sim.breakeven;
  const marker = be !== null && be <= rows.length
    ? `<circle class="ck-marker" cx="${xs(be).toFixed(1)}" cy="${ys(rows[be - 1].buy).toFixed(1)}" r="5"/><text x="${xs(be).toFixed(1)}" y="${(ys(rows[be - 1].buy) - 10).toFixed(1)}" text-anchor="middle">breakeven</text>`
    : "";
  const summary = `Net wealth by year. Buy: ${rows.map((p) => `year ${p.year} ${$(p.buy)}`).filter((_, n) => n % step === step - 1 || n === 0).join(", ")}. Rent: ${rows.map((p) => `year ${p.year} ${$(p.rent)}`).filter((_, n) => n % step === step - 1 || n === 0).join(", ")}.`;
  return `<svg class="ck-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${summary}"><line class="ck-axis" x1="${L}" x2="${W - R}" y1="${ys(0).toFixed(1)}" y2="${ys(0).toFixed(1)}"/>${grid}<path class="ck-line-rent" d="${path("rent")}"/><path class="ck-line-buy" d="${path("buy")}"/>${marker}${xticks}</svg>
<ul class="ck-key"><li><i aria-hidden="true"></i>Buy: home value minus selling costs and mortgage</li><li><i class="ck-key-rent" aria-hidden="true"></i>Rent: invested savings</li></ul>
<p class="ck-note">Years along the bottom. ${be === null ? "The lines never cross within 30 years." : ""}</p>`;
}

function wealthCard(x: RvbResult): string {
  const picks = [5, 10, x.input.years].filter((y, n, a) => y <= x.sim.rows.length && a.indexOf(y) === n).sort((a, b) => a - b);
  const head = `<thead><tr><th scope="col">After</th><th scope="col" class="ck-num">Buy</th><th scope="col" class="ck-num">Rent and invest</th></tr></thead>`;
  const rows = picks.map((y) => {
    const p = x.sim.rows[y - 1];
    return `<tr${y === x.input.years ? ` class="ck-hl"` : ""}><th scope="row">${yrs(y)}</th><td>${$(p.buy)}</td><td>${$(p.rent)}</td></tr>`;
  });
  return card("Net wealth, buy vs rent", `${renderChart(x)}${table(rows, "", head)}<p class="ck-note">Buying: what you would walk away with if you sold (home value minus ${pct(x.input.commission, 1)} commission, legal and moving, minus the mortgage left). Renting: the down payment, closing costs and moving money invested instead, plus each month's difference between owning costs and rent.</p>`);
}

function ptrCard(x: RvbResult): string {
  const band = x.ptrBand === "buy" ? "buy-favoured" : x.ptrBand === "rent" ? "rent-favoured" : "a toss-up";
  const sanity = x.ptrSanity ? `<p><strong>Check your rent:</strong> a ratio this low is unusual for Canada.</p>` : "";
  return card(
    "Price-to-rent ratio",
    `<p><span class="ck-big-inline">${x.priceToRent.toFixed(1)}</span>: the price is ${x.priceToRent.toFixed(1)} times a year's rent, which is ${band} (under ${PTR_BUY_BELOW} leans buy, ${PTR_BUY_BELOW} to ${PTR_RENT_ABOVE} is a toss-up, over ${PTR_RENT_ABOVE} leans rent).</p>${sanity}<p class="ck-note">A rule of thumb to cross-check the full calculation above, never a replacement for it.</p>`,
  );
}

function cashFlowCard(x: RvbResult): string {
  const r = x.input;
  const s = x.sim;
  const rows = [
    row("Rent, first month", $(r.rent)),
    row("Owning, first month", $(s.ownMonth1), "ck-hl"),
    row(`Mortgage payment at ${pct(r.rate)}`, $(s.payment), "ck-sub"),
    row("Property tax", $((r.price * r.taxRate) / 12), "ck-sub"),
    row("Home insurance", $(r.insurance), "ck-sub"),
    row(`Maintenance (${pct(r.maintenance, 1)} of value a year)`, $((r.price * r.maintenance) / 12), "ck-sub"),
    ...(r.condoFees > 0 ? [row("Condo fees", $(r.condoFees), "ck-sub")] : []),
    row("Payment at the stress-test rate (to qualify)", $(x.stressPayment)),
  ];
  const premium = s.premium > 0 ? `<p class="ck-note">With ${pct(r.downPct, 1)} down, a CMHC premium of ${$(s.premium)} (${pct(s.premiumRate)}) is added to the mortgage. Leaving it out would flatter buying.</p>` : "";
  return card("Month one: owning vs renting", `${table(rows)}${premium}<p class="ck-note">Lenders qualify you at the higher payment, even though you would pay the lower one.</p>`);
}

function gridCard(x: RvbResult): string {
  const head = `<thead><tr><th scope="col">Home price growth</th>${GRID_RETURN.map((ret) => `<th scope="col">Return ${pct(ret, 0)}</th>`).join("")}</tr></thead>`;
  const rows = GRID_APPRECIATION.map((app) => {
    const cells = GRID_RETURN.map((ret) => {
      const c = x.grid.find((g) => g.appreciation === app && g.investReturn === ret)!;
      const label = c.verdict === "buy" ? `Buy (yr ${c.breakeven})` : "Rent";
      return `<td class="ck-g-${c.verdict}${c.base ? " ck-g-base" : ""}">${label}</td>`;
    }).join("");
    return `<tr><th scope="row">${pct(app, 0)} a year</th>${cells}</tr>`;
  }).join("");
  return card(
    "What if the assumptions are wrong?",
    `<div class="ck-table-wrap"><table class="ck-grid-table"><caption class="ck-note">Verdict over ${yrs(x.input.years)} for each pair of home price growth and investment return. ${x.grid.some((g) => g.base) ? "Your own assumptions are outlined." : ""}</caption>${head}<tbody>${rows}</tbody></table></div><p class="ck-note">The pattern is the honest headline: the answer turns on two numbers nobody knows in advance.</p>`,
  );
}

function wrongCard(x: RvbResult): string {
  return card(
    "The cost of moving sooner",
    `<p>Buying and then selling costs about <strong>${$(x.roundTrip)}</strong> in transaction costs (${pct(x.roundTrip / x.input.price, 1)} of the price): closing costs going in, plus commission, legal and moving on the way out. That is why short stays favour renting: the home has to grow enough to pay those costs back.</p>${
      x.sim.breakeven !== null ? `<p>Under these assumptions, selling before year ${x.sim.breakeven} leaves you behind the renter.</p>` : ""
    }`,
  );
}

function notes(x: RvbResult): string {
  const r = x.input;
  const list: Alert[] = [];
  if (x.stretch) list.push({ tone: "warn", html: `<strong>Monthly stretch:</strong> owning costs ${$(x.sim.ownMonth1)} in month one, more than ${STRETCH_MULTIPLE} times your rent. Even when buying wins over time, the first years can be house-rich and cash-poor.` });
  if (x.mayNotQualify) list.push({ tone: "warn", html: `<strong>You may not qualify at this price:</strong> the stress-test payment alone is over 44% of your monthly income. The <a href="/calculators/house-affordability">affordability calculator</a> runs the full lender test.` });
  if (x.belowMinimumDown) list.push({ tone: "warn", html: `<strong>Below the minimum down payment</strong> of ${$(x.minimumDown)} at this price.` });
  if (r.guidelineExempt) list.push({ tone: "info", html: "<strong>Your unit is guideline-exempt</strong> (first occupied after November 15, 2018), so Ontario's cap does not apply. Enter your landlord's realistic increase as rent growth." });
  if (r.condo) list.push({ tone: "info", html: "<strong>Condos:</strong> fees tend to rise each year, and special assessments can add a one-time bill this tool does not model. Maintenance defaults lower because the building covers the exterior." });
  list.push({ tone: "info", html: "<strong>Fixed rate throughout:</strong> the mortgage rate is held for the whole period. Real mortgages renew every few years at whatever rates are then." });
  return card("Notes on these numbers", alerts(list));
}

export function renderResults(x: RvbResult): string {
  const links = `<ul class="ck-links">
<li><a href="/calculators/house-affordability">How much house can you afford?</a></li>
<li><a href="/calculators/down-payment-planner">Plan the down payment</a></li>
</ul>`;
  return `${headline(x)}${wealthCard(x)}${gridCard(x)}${cashFlowCard(x)}${ptrCard(x)}${wrongCard(x)}${notes(x)}${links}<p class="ck-disclaimer">${DISCLAIMER}</p>`;
}
