/**
 * rrsp-room-render.ts: turns a RoomResult into the results HTML for the RRSP
 * contribution room calculator. Used at build time (the page shows the
 * spec's worked example with JS off) and in the browser on every input
 * change. Only numbers and fixed copy are rendered; no user-typed text
 * reaches the markup.
 *
 * Copy rules: an estimate from the user's records, never CRA's figure; the
 * staleness note and the disclaimer appear on every results screen; no em
 * dashes; never "you should"; next year's dollar limit is labelled
 * "Not yet verified".
 */

import { $, NOT_VERIFIED, alerts, card, flag, longDate, row, table, type Alert } from "./calc-kit";
import {
  BUFFER,
  CAP_BINDS_AT,
  CLOSED_AGE,
  DEADLINE,
  DOLLAR_LIMIT,
  NEXT_DOLLAR_LIMIT_UNVERIFIED,
  NEXT_YEAR,
  RATE,
  TAX_YEAR,
  type RoomFlag,
  type RoomResult,
} from "./rrsp-room";

export const MY_ACCOUNT_URL =
  "https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-individuals/account-individuals.html";
export const STALENESS_NOTE =
  "CRA's number is a snapshot; your own contribution records are the real-time truth. This tool is only as accurate as what you've told it.";
export const DISCLAIMER = `An estimate from your own records, not financial advice or CRA's figure. Limits change annually; figures are ${TAX_YEAR}.`;

export interface RenderOptions {
  /** Display date for "as of". */
  asOf: string;
  /** Build-time onboarding: label the output as the spec's worked example. */
  example?: boolean;
}

function exampleIntro(): string {
  return `<div class="ck-example"><p><strong>Worked example.</strong> Nadia's ${TAX_YEAR - 1} Notice of Assessment shows an RRSP deduction limit of $22,200 and $2,000 of unused RRSP contributions (made in ${TAX_YEAR - 1}, never deducted). Since then she contributed $3,500, including $1,000 through her group RRSP. Room now = $22,200 &minus; $2,000 &minus; $3,500 = $16,700.</p><p>Rebuilding it: unused room $10,000, plus 18% of $90,000 earned income ($16,200, below the ${$(DOLLAR_LIMIT)} cap) minus a $4,000 pension adjustment, gives $22,200. That matches her notice. Enter your own numbers to see yours.</p></div>`;
}

function headline(r: RoomResult, o: RenderOptions): string {
  const guess = r.input.bestGuess ? ` ${flag("best guess")}` : "";
  const kicker = `<p class="ck-kicker">Estimate as of ${o.asOf}${guess}</p>`;
  if (r.outcome === "closed") {
    return `<div class="ck-headline"><p class="ck-kicker">Age ${CLOSED_AGE} or older</p><p class="ck-big">Contribution room is closed</p><p class="ck-lead">${`An RRSP must be converted to a RRIF or an annuity by December 31 of the year you turn ${CLOSED_AGE}, and no new contributions can go in after that year. Your room now turns into RRIF and withdrawal planning.`}</p><p class="ck-verdict"><span class="ck-verdict-dot" aria-hidden="true"></span>In the year you turn ${CLOSED_AGE}, a last contribution against that year's room is still possible until December 31. This tool does not work that case out.</p></div>`;
  }
  if (r.outcome === "over") {
    return `<div class="ck-headline ck-tone-warn">${kicker}<p class="ck-big">Over by ${$(r.excess)}</p><p class="ck-lead">Your contributions are above your deduction limit. ${r.bufferApplies ? `The first ${$(BUFFER)} of excess is a one-time lifetime cushion with no penalty (and no deduction).` : `The ${$(BUFFER)} cushion does not apply under 18, so every dollar of excess counts.`} ${r.taxableExcess > 0 ? `The remaining ${$(r.taxableExcess)} is taxed at 1% a month, about ${$(r.monthlyTax)} a month, until it is removed or new room absorbs it.` : "Nothing is taxed yet, but there is no room left for new contributions."}</p><p class="ck-verdict"><span class="ck-verdict-dot" aria-hidden="true"></span>Stop contributing for now. The fix path is below.</p></div>`;
  }
  const big = r.outcome === "full" ? "$0" : $(r.roomNow);
  const lead = r.outcome === "full"
    ? "You have used all of your room. Anything more goes into the lifetime cushion, then the 1% a month tax."
    : `That is how much more you can put in your RRSP without going over, reconciled from the ${r.input.mode === "rebuild" ? "limit you rebuilt" : "deduction limit on your Notice of Assessment"} and the contributions you entered.`;
  return `<div class="ck-headline ck-tone-good">${kicker}<p class="ck-big">${big} <small>room now</small></p><p class="ck-lead">${lead}</p><p class="ck-subline">An estimate from your answers, not CRA's figure.</p></div>`;
}

function rebuildCard(r: RoomResult): string {
  const b = r.breakdown;
  if (!b) return "";
  const rows = [
    row("A. Unused deduction room carried forward", $(b.a)),
    row(`18% of ${TAX_YEAR - 1} earned income`, $(b.eighteen), "ck-sub"),
    row(`Lesser of that and the ${TAX_YEAR} dollar limit (${$(DOLLAR_LIMIT)})`, $(b.newRoomBeforePa), "ck-sub"),
    row(`Less ${TAX_YEAR - 1} pension adjustment (T4 box 52)`, `&minus;${$(b.pa)}`, "ck-sub"),
    row("B. New room for this year", $(b.b)),
    row("R. Pension adjustment reversal (T10)", $(b.r)),
    row("C. Net past service pension adjustment", `&minus;${$(b.c)}`),
    row(`${TAX_YEAR} RRSP deduction limit (A + B + R &minus; C)`, `${$(b.limit)}${b.floored ? ` ${NOT_VERIFIED}` : ""}`, "ck-total"),
  ];
  const cap = b.capBinds ? `<p class="ck-note">18% = ${$(b.eighteen)}, but the ${$(DOLLAR_LIMIT)} dollar cap binds (it is reached at about ${$(CAP_BINDS_AT)} of earned income).</p>` : "";
  const floor = b.floored ? `<p class="ck-note">The formula came out below zero (${$(b.raw)}), so the limit is shown as $0. How CRA rounds and floors this case is ${NOT_VERIFIED}.</p>` : "";
  return card("Your deduction limit, rebuilt", `${table(rows)}${cap}${floor}<p class="ck-note">Compare this with your Notice of Assessment. If they differ, the notice wins: it includes adjustments this tool cannot see.</p>`);
}

function reconciliation(r: RoomResult): string {
  const i = r.input;
  const rows = [
    row(r.breakdown ? "RRSP deduction limit (rebuilt above)" : "RRSP deduction limit (from your notice)", $(r.limit)),
    row("Less unused contributions already reported", `&minus;${$(i.unusedContributions)}`, "ck-sub"),
    row("Less contributions since the statement", `&minus;${$(i.contribSince)}`, "ck-sub"),
  ];
  if (i.contribFirst60 > 0 && i.first60ClaimYear === "this") rows.push(row(`Less first-60-days contributions claimed for ${TAX_YEAR}`, `&minus;${$(i.contribFirst60)}`, "ck-sub"));
  if (i.contribUndated > 0) rows.push(row(`Less undated contributions ${flag("date these")}`, `&minus;${$(i.contribUndated)}`, "ck-sub"));
  rows.push(row("Contribution room now", r.roomNow < 0 ? `&minus;${$(-r.roomNow)}` : $(r.roomNow), "ck-total"));
  const defs = `<dl class="ck-facts">
<div><dt>Deduction limit</dt><dd>CRA's maximum you can deduct: ${$(r.limit)}</dd></div>
<div><dt>Unused contributions</dt><dd>Already inside the plan, not yet deducted: ${$(i.unusedContributions)}</dd></div>
<div class="ck-binding"><dt>Contribution room now</dt><dd>What you can still put in: ${$(Math.max(0, r.roomNow))}</dd></div>
</dl>`;
  return card("The checkbook math", `${table(rows)}<p class="ck-note">The deduction limit is not the same as contribution room. The over-contribution check runs on room now.</p>${defs}`);
}

function first60(r: RoomResult): string {
  const i = r.input;
  const amount = i.contribFirst60;
  const status = amount > 0
    ? `You entered ${$(amount)} for that window, counted against ${i.first60ClaimYear === "this" ? `${TAX_YEAR} room` : `${NEXT_YEAR} room (not subtracted here)`}.`
    : "You have not entered any contributions for that window.";
  return card(
    "The first 60 days",
    `<p>Contributions from January 1 to <strong>${longDate(DEADLINE)}</strong> can be deducted on your ${TAX_YEAR} return or carried to ${NEXT_YEAR}, but never both. CRA splits your receipts into March to December and January to March for a reason.</p><p>${status}</p><p class="ck-note">You do not have to claim a contribution in the year you make it: unclaimed contributions carry forward on Schedule 7.</p>`,
  );
}

function overFix(r: RoomResult): string {
  if (r.outcome !== "over") return "";
  return card(
    "How to fix an over-contribution",
    `<ol>
<li><strong>Withdraw the excess.</strong> Ask your bank for form T3012A first so no tax is withheld on the withdrawal, then claim the matching deduction for withdrawn unused contributions with form T746.</li>
<li><strong>File a T1-OVP return</strong> within 90 days after the end of the year (generally March 31) and pay the 1% a month tax on excess above the cushion. Late filing adds 5% of the balance owing plus 1% a month, up to 12 months.</li>
<li><strong>Ask CRA to waive the tax</strong> with form RC2503 if the excess was a reasonable error and you are taking steps to remove it.</li>
<li><strong>Or let new room absorb it.</strong> New room arrives each January 1 and can soak up part of the excess; the 1% a month runs until it does.</li>
</ol>
<p class="ck-note">These are the steps CRA describes. A tax professional can confirm the right path for your situation.</p>`,
  );
}

function forecast(r: RoomResult): string {
  if (r.nextYearNewRoom === null) return "";
  const cap = NEXT_DOLLAR_LIMIT_UNVERIFIED;
  return card(
    `New room for ${NEXT_YEAR}`,
    `<p>18% of this year's earned income${cap !== null ? `, up to the ${NEXT_YEAR} dollar limit of ${$(cap)} ${NOT_VERIFIED}` : `, up to the ${NEXT_YEAR} dollar limit (announced later this year)`}: about <strong>${$(r.nextYearNewRoom)}</strong>, less any pension adjustment on your ${TAX_YEAR} T4.</p><p class="ck-note">CRA confirms next year's dollar limit; the ${NEXT_YEAR} figure has been reported but is not yet confirmed on canada.ca.</p>`,
  );
}

function flagCopy(f: RoomFlag, r: RoomResult): Alert | null {
  switch (f) {
    case "cap_binds":
      return null; // shown inside the rebuild card
    case "pa_over_limit":
      return { tone: "warn", html: `<strong>That pension adjustment is above the ${$(DOLLAR_LIMIT)} dollar limit.</strong> A pension adjustment cannot exceed the year's limit, so this is likely a data-entry slip. Check box 52 on your T4.` };
    case "non_resident":
      return { tone: "warn", html: `<strong>Non-resident:</strong> employment income earned outside Canada generally creates no new RRSP room${r.breakdown ? ", so earned income is set to $0 here" : ""}. Existing room can still be used, but a deduction is worth little without Canadian tax to offset.` };
    case "under_18":
      return { tone: "warn", html: `<strong>Under 18:</strong> there is no minimum age, and room builds from earned income once you file a return. But the ${$(BUFFER)} over-contribution cushion does not apply, so any excess is taxed at 1% a month right away.` };
    case "withdrawals":
      return { tone: "info", html: `<strong>Withdrawals do not give room back.</strong> Unlike a TFSA, money taken out of an RRSP loses that room for good (Home Buyers' Plan and Lifelong Learning Plan withdrawals follow their own repayment rules). Your ${$(r.input.withdrawals)} is not added back.` };
    case "undated":
      return { tone: "info", html: `<strong>Date your contributions.</strong> Undated amounts are counted against ${TAX_YEAR} room to be safe. If some fell in the first 60 days of ${NEXT_YEAR}, move them to that line.` };
    case "first60_next_year":
      return { tone: "info", html: `<strong>${$(r.countedNextYear)} is set aside for ${NEXT_YEAR}.</strong> It does not reduce ${TAX_YEAR} room here, and it will count against your ${NEXT_YEAR} room.` };
    case "absurd":
      return { tone: "warn", html: "<strong>Double-check those amounts:</strong> they are far above typical figures." };
    case "floored_unverified":
      return null; // shown inside the rebuild card
    case "best_guess":
      return { tone: "info", html: `<strong>Best-guess mode:</strong> some of these numbers are guesses. Your Notice of Assessment or CRA My Account is the source of truth; the deduction limit sits in the "RRSP deduction limit statement" section.` };
  }
}

export function renderResults(r: RoomResult, o: RenderOptions): string {
  const notes = alerts(r.flags.map((f) => flagCopy(f, r)).filter((a): a is Alert => a !== null));
  const links = `<ul class="ck-links">
<li><a href="${MY_ACCOUNT_URL}" rel="noopener">Your official limit in CRA My Account</a></li>
<li><a href="/calculators/tfsa-vs-rrsp">TFSA or RRSP for your next dollar?</a></li>
<li><a href="/compare/tfsa-vs-rrsp">TFSA vs RRSP, explained</a></li>
</ul>`;
  const staleness = `<p class="ck-note"><strong>${STALENESS_NOTE}</strong></p>`;
  if (r.outcome === "closed") return `${headline(r, o)}${staleness}${links}<p class="ck-disclaimer">${DISCLAIMER}</p>`;
  const body = `${rebuildCard(r)}${reconciliation(r)}${overFix(r)}${first60(r)}${forecast(r)}${notes ? card("Notes that apply to you", notes) : ""}`;
  return `${o.example ? exampleIntro() : ""}${headline(r, o)}${body}${staleness}${links}<p class="ck-disclaimer">${DISCLAIMER}</p>`;
}

/** Plain-language rate line for the form, e.g. "18% of earned income, up to $33,810". */
export const RATE_LINE = `${RATE * 100}% of earned income, up to ${$(DOLLAR_LIMIT)}`;
