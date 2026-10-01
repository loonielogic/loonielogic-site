/**
 * goal-planner-render.ts: turns a GoalPlan into the results HTML for the
 * Goal Planner. Used at build time (the page shows the default goal with JS
 * off) and in the browser on every input change.
 *
 * The goal name is the only user-typed text on any calculator results
 * screen, so it always goes through escapeHtml().
 *
 * Copy rules: the required return is arithmetic, not advice, and never a
 * claim that any return is achievable; no em dashes; never "you should".
 */

import { VERDICT_COPY, type GoalPlan, type Milestone, type MonthStamp } from "./goal-planner";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const $ = (n: number) => (Number.isFinite(n) ? money.format(Math.round(n)) : "n/a");
/** 0.0528 -> "5.3%"; whole numbers drop the decimal. */
export const pct = (n: number) => `${Number((n * 100).toFixed(1))}%`;
export const monthLabel = (d: MonthStamp) => `${MONTHS[d.month - 1]} ${d.year}`;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const DISCLAIMER =
  "The required return is arithmetic, not advice. It shows what growth the numbers need, not what any account or investment will earn. Returns go up and down, and fees and taxes are left out.";

const yrs = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;

function renderHeadline(p: GoalPlan, name: string): string {
  const r = p.required;
  let big: string;
  let lead: string;
  switch (r.kind) {
    case "already_there":
      big = "0%";
      lead = `Your savings today already cover ${name}. No growth needed.`;
      break;
    case "no_growth_needed":
      big = "0%";
      lead = `Saving ${$(p.goal.monthlyContribution)} a month adds up to ${$(p.savedByDeadline)} by ${monthLabel(p.targetDate)}, which covers ${name} with no growth at all.`;
      break;
    case "solved":
      big = pct(r.rate);
      lead = `To reach ${$(p.goal.target)} for ${name} by ${monthLabel(p.targetDate)}, your savings would need to grow about ${pct(r.rate)} a year on average.`;
      break;
    case "out_of_reach":
      big = "Over 30%";
      lead = `Even growing 30% a year, the plan for ${name} falls ${$(r.shortfallAtMax)} short by ${monthLabel(p.targetDate)}. The numbers need a bigger monthly amount or more time.`;
      break;
  }
  return `<div class="gp-headline gp-band-${p.band}"><p class="gp-kicker">Return needed each year</p>
<p class="gp-big">${big}</p>
<p class="gp-lead">${lead}</p>
<p class="gp-verdict"><span class="gp-verdict-dot" aria-hidden="true"></span>${VERDICT_COPY[p.band]}</p></div>`;
}

function renderPath(p: GoalPlan): string {
  const gap = p.goal.target - p.savedByDeadline;
  return `<section class="gp-card"><h2>The path in plain numbers</h2>
<dl class="gp-facts">
<div><dt>Goal</dt><dd>${$(p.goal.target)} by ${monthLabel(p.targetDate)}</dd></div>
<div><dt>Saved today</dt><dd>${$(p.goal.currentSavings)}</dd></div>
<div><dt>Saving alone, no growth</dt><dd>${$(p.savedByDeadline)}</dd></div>
<div><dt>${gap > 0 ? "Gap growth would need to fill" : "Left over without growth"}</dt><dd>${$(Math.abs(gap))}</dd></div>
</dl>
<p class="gp-note">"Return" means how much your money grows in a year, as a percentage. A savings account pays a little; investments like index funds have grown more over long stretches, with ups and downs along the way.</p></section>`;
}

function renderInverse(p: GoalPlan): string {
  const r = pct(p.expectedReturn);
  const need = p.monthlyNeeded;
  const now = p.goal.monthlyContribution;
  const line = need <= 0
    ? `If your money grows ${r} a year, your savings today reach the goal on their own. No monthly amount needed.`
    : `If your money grows ${r} a year, saving about <strong>${$(need)} a month</strong> reaches ${$(p.goal.target)} by ${monthLabel(p.targetDate)}.`;
  const diff = need - now;
  const compare = need <= 0
    ? ""
    : Math.abs(diff) < 1
      ? `<p class="gp-note">That is about what you save now.</p>`
      : diff > 0
        ? `<p class="gp-note">That is ${$(diff)} more a month than the ${$(now)} you save now.</p>`
        : `<p class="gp-note">That is ${$(-diff)} less a month than the ${$(now)} you save now, so there is some room to spare at this return.</p>`;
  return `<section class="gp-card"><h2>Pick your own return</h2>
<p class="gp-inverse">${line}</p>${compare}
<p class="gp-note">At ${r} a year and ${$(now)} a month, the projection lands at ${$(p.projectedAtDeadline)} by ${monthLabel(p.targetDate)}. Change your return guess in step 4 to see how the monthly amount moves.</p></section>`;
}

function milestoneWhen(m: Milestone): string {
  if (m.reached) return "Already there";
  if (m.date === null) return "Not within 100 years at this pace";
  return monthLabel(m.date);
}

function renderMilestones(p: GoalPlan): string {
  const items = p.milestones
    .map((m) => {
      const label = m.share === 1 ? "Goal" : `${m.share * 100}%`;
      const state = m.reached ? "done" : m.onTime ? "on-time" : "late";
      const flag = m.reached ? "" : m.onTime ? "" : `<span class="gp-flag">after your target date</span>`;
      return `<li class="gp-ms gp-ms-${state}"><span class="gp-ms-mark" aria-hidden="true">${label}</span><span class="gp-ms-body"><strong>${$(m.amount)}</strong><span>${milestoneWhen(m)}${flag}</span></span></li>`;
    })
    .join("");
  return `<section class="gp-card"><h2>Milestones on the way</h2>
<p class="gp-note gp-ms-lead">When your balance first passes each marker, at ${$(p.goal.monthlyContribution)} a month and ${pct(p.expectedReturn)} a year. Projected, not promised.</p>
<ol class="gp-milestones">${items}</ol></section>`;
}

export function renderResults(p: GoalPlan): string {
  const name = `<strong class="gp-name">${escapeHtml(p.goal.name)}</strong>`;
  return `${renderHeadline(p, name)}${renderPath(p)}${renderInverse(p)}${renderMilestones(p)}<p class="gp-disclaimer">${DISCLAIMER}</p>`;
}
