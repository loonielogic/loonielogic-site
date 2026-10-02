/**
 * tfsa-vs-rrsp-render.ts: turns a Decision into the results HTML for the
 * TFSA vs RRSP tool. Used at build time (the page shows the default example
 * with JS off) and in the browser on every input change. Only numbers and
 * fixed copy are rendered; no user-typed text reaches the markup.
 *
 * Copy rules: a planning estimate, not advice; never "you should"; no em
 * dashes; the projection is an illustration at a return the user picks.
 */

import { $, alerts, card, longDate, nextSteps, pct, workedExample, type Alert } from "./calc-kit";
import { figure, type FigureLog } from "./figures";
import { OAS_THRESHOLD, provinceName } from "./income-tax";
import {
  DEFAULT_INPUT,
  decide,
  type DecisionInput,
  FHSA_ANNUAL,
  FHSA_LIFETIME,
  HBP_LIMIT,
  HBP_REPAY_YEARS,
  LOWEST_BAND_TOP,
  REPLACEMENT_RATIO,
  RRSP_BUFFER,
  RRSP_CAP,
  RRSP_DEADLINE,
  RRSP_LAST_AGE,
  TFSA_ANNUAL,
  TIE_BAND,
  type Decision,
  type Flag,
} from "./tfsa-vs-rrsp";

export const MY_ACCOUNT_URL =
  "https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-individuals/account-individuals.html";
export const DISCLAIMER =
  "A planning estimate, not financial advice. Brackets and limits change annually; figures are 2026. Room limits come from CRA My Account.";
export const NO_ROOM_MESSAGE =
  "You have no contribution room: contributing anyway triggers the 1%/month penalty. Check CRA My Account.";

const NAME = { tfsa: "TFSA", rrsp: "RRSP" } as const;
const pts = (n: number) => `${Number((Math.abs(n) * 100).toFixed(1))} points`;

function reasonLine(d: Decision): string {
  const r = d.rates;
  switch (d.reason) {
    case "rrsp_closed":
      return `An RRSP has to be converted to a RRIF or annuity by December 31 of the year you turn ${RRSP_LAST_AGE}, so new RRSP contributions are closed. A TFSA has no age limit and no minimum withdrawals.`;
    case "need_early":
      return d.input.years === 0
        ? "You need this money soon. A TFSA withdrawal is tax-free and the room comes back next January 1; an RRSP withdrawal is taxed right away, with tax held back at source, and that room is gone for good."
        : "You might need this money before retirement. A TFSA withdrawal is tax-free and the room comes back next January 1; an RRSP withdrawal is taxed right away, with tax held back at source, and that room is gone for good.";
    case "gis":
      return "You expect a low retirement income that may qualify for the Guaranteed Income Supplement. RRSP and RRIF withdrawals count as income and reduce GIS; TFSA withdrawals do not.";
    case "low_bracket":
      return `Your income is in the lowest federal bracket (up to ${$(LOWEST_BAND_TOP)}), where an RRSP deduction is worth the least. TFSA room also doubles as an emergency fund that does not break a plan.`;
    case "peak_earning":
      return `Your marginal rate today (${pct(r.now, 1)}) is ${pts(r.now - r.then)} higher than the rate expected on withdrawal (${pct(r.then, 1)}). The RRSP deduction saves tax at the higher rate and you repay it at the lower one.`;
    case "higher_later":
      return `The rate expected on withdrawal (${pct(r.then, 1)}) is ${pts(r.then - r.now)} higher than your rate today (${pct(r.now, 1)}). Paying tax now at the lower rate and withdrawing tax-free from a TFSA comes out ahead.`;
    case "oas":
      return `Retirement income above ${$(OAS_THRESHOLD)} triggers the 15% OAS recovery tax on top of income tax, which takes the rate on RRSP withdrawals to ${pct(r.then, 1)}. TFSA withdrawals do not count toward that income.`;
    case "tie":
      return `Your two rates are within ${pts(TIE_BAND)} of each other (${pct(r.now, 1)} today, ${pct(r.then, 1)} in retirement), so the after-tax results are close. When the math is a tie, flexibility wins: a TFSA lets you withdraw anytime, tax-free, and the room comes back next January 1.`;
  }
}

function headline(d: Decision): string {
  const acct = NAME[d.account];
  if (d.noRoom) {
    return `<div class="ck-headline ck-tone-warn"><p class="ck-kicker">Room check</p><p class="ck-big">No ${acct} room</p><p class="ck-lead">${NO_ROOM_MESSAGE}</p><p class="ck-verdict"><span class="ck-verdict-dot" aria-hidden="true"></span>The math below still shows which account fits your rates. Act on it only once you have room.</p></div>`;
  }
  let kicker = "Our read of your numbers";
  let big = `Put it in your ${acct}`;
  if (d.reason === "rrsp_closed") {
    kicker = "RRSP closed";
    big = "Use your TFSA";
  } else if (d.homeFirst) {
    kicker = "First home within ~15 years";
    big = "Look at the FHSA first";
  } else if (d.matchFirst) {
    kicker = "Split it";
    big = `Match first, then ${acct}`;
  }
  const lead = d.homeFirst
    ? `For a first home, the FHSA usually beats both accounts: ${$(FHSA_ANNUAL)} a year (${$(FHSA_LIFETIME)} lifetime), deductible going in and tax-free coming out for a qualifying purchase. For money beyond your FHSA room, the numbers point to your ${acct}.`
    : d.matchFirst
      ? `Contribute enough to your group RRSP to get the full employer match first: matched dollars are free money and beat any rate math. For the rest, the numbers point to your ${acct}.`
      : reasonLine(d);
  const verdict = d.homeFirst || d.matchFirst ? reasonLine(d) : `Same pre-tax dollars, after tax in ${d.input.years} ${d.input.years === 1 ? "year" : "years"}: RRSP ${$(d.values.rrsp)}, TFSA ${$(d.values.tfsa)}.`;
  const tone = d.account === "rrsp" ? "" : " ck-tone-good";
  return `<div class="ck-headline${tone}"><p class="ck-kicker">${kicker}</p><p class="ck-big">${big}</p><p class="ck-lead">${lead}</p><p class="ck-verdict"><span class="ck-verdict-dot" aria-hidden="true"></span>${verdict}</p></div>`;
}

function ratesCard(d: Decision): string {
  const r = d.rates;
  const i = d.input;
  const est = d.flags.includes("estimated_retirement") ? ` (estimated at ${pct(REPLACEMENT_RATIO, 0)} of today's income)` : "";
  return card(
    "Your two tax rates",
    `<div class="ck-duo">
<div${r.now > r.then ? ` class="ck-win"` : ""}><p class="ck-duo-label">Today, on ${$(i.income)}</p><p class="ck-duo-value">${pct(r.now, 1)}</p><p class="ck-duo-foot">What an RRSP deduction saves on each dollar</p></div>
<div${r.then > r.now ? ` class="ck-win"` : ""}><p class="ck-duo-label">In retirement, on ${$(i.retirementIncome)}${est}</p><p class="ck-duo-value">${pct(r.then, 1)}</p><p class="ck-duo-foot">${r.oas > 0 ? `Income tax ${pct(r.thenTax, 1)} plus the 15% OAS recovery tax` : "What each RRSP withdrawal costs in tax"}</p></div>
</div>
<p class="ck-note"><strong>The anchor fact:</strong> if these two rates are equal, the RRSP and the TFSA leave exactly the same amount after tax. The account with the better rate wins, and the gap between the rates sets the size of the win. Rates are for ${provinceName(i.province)}, 2026 brackets, on the next dollar.</p>`,
  );
}

function valuesCard(d: Decision): string {
  const v = d.values;
  const i = d.input;
  const winner = v.difference > 0.5 ? "rrsp" : v.difference < -0.5 ? "tfsa" : null;
  const yrs = `${i.years} ${i.years === 1 ? "year" : "years"}`;
  const diffLine = winner
    ? `The ${NAME[winner]} leaves about <strong>${$(Math.abs(v.difference))} more</strong> after tax, roughly the gap in rates times the amount.`
    : "Both leave the same amount after tax.";
  return card(
    `${$(i.amount)} of pre-tax income, after tax in ${yrs}`,
    `<div class="ck-duo">
<div${winner === "rrsp" ? ` class="ck-win"` : ""}><p class="ck-duo-label">RRSP</p><p class="ck-duo-value">${$(v.rrsp)}</p><p class="ck-duo-foot">All ${$(i.amount)} goes in (the refund covers the tax), grows to ${$(i.amount * v.growth)}, then is taxed at ${pct(d.rates.then, 1)} on the way out.</p></div>
<div${winner === "tfsa" ? ` class="ck-win"` : ""}><p class="ck-duo-label">TFSA</p><p class="ck-duo-value">${$(v.tfsa)}</p><p class="ck-duo-foot">Tax at ${pct(d.rates.now, 1)} comes off first, so ${$(i.amount * (1 - d.rates.now))} goes in, then grows and comes out tax-free.</p></div>
</div>
<p>${diffLine}</p>
<p class="ck-note">Both use the same ${pct(i.expectedReturn, 1)} yearly return, an illustration you can change, not a forecast. Because the return is the same in both accounts, it changes the dollar amounts but never which account wins. The RRSP side assumes the tax refund is reinvested; spending the refund shrinks the RRSP result.</p>`,
  );
}

function quizCard(d: Decision): string {
  const items = d.quiz
    .map((q) => {
      const src = q.from === "numbers" ? " <small>(from your numbers)</small>" : "";
      const mark = q.decided ? ` <span class="ck-flag">settled it</span>` : "";
      return `<li><strong>${q.question}</strong> ${q.answer === "yes" ? "Yes" : "No"}${src}${mark}</li>`;
    })
    .join("");
  const none = d.quiz.every((q) => !q.decided) && d.reason === "tie"
    ? `<p class="ck-note">None of the questions settled it, so the default applies: when the math is a tie, flexibility wins and the TFSA comes first.</p>`
    : "";
  return card("The six questions", `<ol>${items}</ol>${none}<p class="ck-note">Worked top to bottom; the first that applies ends the quiz. A match is captured first, and a first home points to the FHSA, whatever the rest says.</p>`);
}

function flipCard(d: Decision): string {
  const lines: string[] = [];
  const i = d.input;
  for (const f of d.flips) {
    const dir = f.retirementIncome > i.retirementIncome ? "rose to about" : "fell to about";
    const to = f.to === "tie" ? "the rates would tie, and the TFSA would win on flexibility" : `the ${NAME[f.to]} would come out ahead on the rates`;
    lines.push(`If your retirement income ${dir} <strong>${$(f.retirementIncome)}</strong>, ${to}.`);
  }
  if (d.rates.oas === 0 && i.retirementIncome < OAS_THRESHOLD) {
    lines.push(`Retirement income above ${$(OAS_THRESHOLD)} adds the 15% OAS recovery tax to every RRSP or RRIF dollar withdrawn, which often flips an RRSP answer to the TFSA.`);
  }
  if (d.reason !== "need_early") lines.push("Needing the money before retirement flips the answer to the TFSA.");
  if (!d.matchFirst) lines.push("An employer match puts the matched dollars in the RRSP first, whatever the rates say.");
  return card("What would flip this", `<ul>${lines.slice(0, 4).map((l) => `<li>${l}</li>`).join("")}</ul>`);
}

function flagCopy(f: Flag, d: Decision): Alert | null {
  const i = d.input;
  switch (f) {
    case "match_first":
      return { tone: "info", html: `<strong>Employer match:</strong> find out the match rate and the most your employer will match, then contribute at least that much through payroll. The comparison above applies to dollars beyond the match.` };
    case "home_fhsa":
      return { tone: "info", html: `<strong>Buying a first home:</strong> the RRSP's Home Buyers' Plan lets you withdraw up to ${$(HBP_LIMIT)} for a first home, but it must be repaid over ${HBP_REPAY_YEARS} years, about ${$(HBP_LIMIT / HBP_REPAY_YEARS)} a year for a full withdrawal, or the shortfall is added to your income. The <a href="/calculators/down-payment-planner">down payment planner</a> stacks the FHSA and HBP.` };
    case "spousal":
      return { tone: "info", html: `<strong>Spouse earns less?</strong> A spousal RRSP can split retirement income. Withdrawals within 3 calendar years of a contribution are taxed back to the contributor.` };
    case "self_employed":
      return { tone: "info", html: `<strong>Self-employed:</strong> no employer match is possible. To deduct on your 2026 return, contribute by ${longDate(RRSP_DEADLINE)}.` };
    case "leaving_canada":
      return { tone: "warn", html: `<strong>Leaving Canada?</strong> RRSP withdrawals by non-residents face non-resident withholding (often 25%, depending on the tax treaty), and TFSA room stops growing while you are a non-resident. This tool does not model either.` };
    case "last_rrsp_year":
      return { tone: "warn", html: `<strong>Age ${RRSP_LAST_AGE}:</strong> this is the last year to contribute to your RRSP. It must be converted by December 31, and the usual March deadline does not apply.` };
    case "under_18":
      return { tone: "info", html: `<strong>Under 18:</strong> TFSA room starts the year you turn 18. An RRSP has no minimum age if you have earned income and file a return.` };
    case "over_combined_room":
      return { tone: "warn", html: `<strong>That amount is more than this year's new room in both accounts combined</strong> (${$(TFSA_ANNUAL)} TFSA plus up to ${$(RRSP_CAP)} RRSP). You may have room carried forward; confirm it in CRA My Account before contributing.` };
    case "over_tfsa_room":
      return { tone: "warn", html: `<strong>The amount is more than the TFSA room you entered (${$(i.tfsaRoom ?? 0)}).</strong> Anything over your room is taxed at 1% a month until it is removed.` };
    case "over_rrsp_room":
      return { tone: "warn", html: `<strong>The amount is more than the RRSP room you entered (${$(i.rrspRoom ?? 0)}).</strong> Beyond a ${$(RRSP_BUFFER)} lifetime buffer, the excess is taxed at 1% a month.` };
    case "implausible_income":
      return { tone: "warn", html: "<strong>Double-check that income:</strong> it is above $5 million." };
    case "estimated_retirement":
      return { tone: "info", html: `<strong>Retirement income is a rough assumption:</strong> ${pct(REPLACEMENT_RATIO, 0)} of today's income. Include RRSP or RRIF withdrawals, pensions, CPP and OAS; leave out TFSA withdrawals.` };
  }
}

export function renderResults(d: Decision): string {
  const notes = alerts(d.flags.map((f) => flagCopy(f, d)).filter((a): a is Alert => a !== null));
  const links = `<ul class="ck-links">
<li><a href="${MY_ACCOUNT_URL}" rel="noopener">Check your room in CRA My Account</a></li>
<li><a href="/calculators/tfsa-room-checker">TFSA room checker</a></li>
<li><a href="/calculators/rrsp-room">RRSP room calculator</a></li>
<li><a href="/compare/tfsa-vs-rrsp">TFSA vs RRSP, explained</a></li>
</ul>`;
  const closed = d.reason === "rrsp_closed";
  return `${headline(d)}${ratesCard(d)}${closed ? "" : valuesCard(d)}${quizCard(d)}${closed ? "" : flipCard(d)}${notes ? card("Notes that apply to you", notes) : ""}${links}<p class="ck-disclaimer">${DISCLAIMER}</p>`;
}

/* ------------------------------------------------------------------ */
/* Below the tool: field help, next steps, worked example              */
/* ------------------------------------------------------------------ */

/** Registry figures the next steps cite beyond the decision's own. */
export const tvrNextFigures: FigureLog = new Map();
const ROOM_RESET = figure<string>("tax-deadlines-2026.json", "tfsa.room_reset", tvrNextFigures);

/** One line per form field: why the tool needs it (140 characters max). */
export const HELP = {
  employerMatch: "A match only flows into an RRSP and is an instant return, so it is captured before anything else.",
  homeSoon: "A first home soon points to the FHSA, which gives a deduction now and a tax-free withdrawal for the home.",
  mayNeedEarly: "TFSA withdrawals are tax-free and the room comes back; RRSP withdrawals are taxed and the room is gone.",
  province: "Your province sets the tax brackets behind both marginal rates.",
  income: "Today's income sets the tax rate an RRSP deduction saves you.",
  retirementIncome: "Retirement income sets the tax rate on RRSP withdrawals later.",
  estimateRetirement: `With no figure, the tool assumes ${pct(REPLACEMENT_RATIO, 0)} of today's income, a rough stand-in.`,
  age: `Age flags the last RRSP year (${RRSP_LAST_AGE}) and the under-18 rules.`,
  amount: "The amount sizes the dollar comparison; it never changes which account wins.",
  years: "Years until withdrawal set how long the money grows in the illustration.",
  expectedReturn: "The return sizes the illustration only; both accounts get the same rate.",
  tfsaRoom: "Room caps what can go in, so the tool flags an amount above it.",
  rrspRoom: "RRSP room caps the deduction, so the tool flags an amount above it.",
  expectGis: "RRSP withdrawals can reduce the Guaranteed Income Supplement; TFSA withdrawals do not.",
  spouseEarnsLess: "A lower-earning spouse opens the spousal RRSP option for splitting retirement income.",
  selfEmployed: "Self-employed savers have no employer match, so the tool adjusts its notes.",
  leavingCanada: "Leaving Canada changes how both accounts are taxed, so the tool adds a warning.",
} as const;

export function renderNextSteps(): string {
  return nextSteps("tvr-h-next", [
    `<strong>Confirm your room before contributing.</strong> <a href="${MY_ACCOUNT_URL}" rel="noopener">CRA My Account</a> shows your TFSA room and your RRSP deduction limit, which is also on your latest Notice of Assessment. The <a href="/calculators/tfsa-room-checker">TFSA room checker</a> and <a href="/calculators/rrsp-room">RRSP room calculator</a> help when the CRA figure lags.`,
    `<strong>RRSP deadline:</strong> contributions made by ${longDate(RRSP_DEADLINE)} can be deducted on your 2026 return. New RRSP room for 2026 tops out at ${$(RRSP_CAP)}.`,
    `<strong>TFSA timing:</strong> the 2026 limit is ${$(TFSA_ANNUAL)}. Next year's room, and anything withdrawn this year, arrives on ${longDate(ROOM_RESET)}.`,
    `<strong>Rerun it when your numbers move.</strong> A raise, a new pension or a change in retirement plans can flip the answer. The <a href="/compare/tfsa-vs-rrsp">TFSA vs RRSP guide</a> explains each case.`,
  ]);
}

/** The worked example's inputs: an $82,000 Ontario earner saving for retirement. */
export const EXAMPLE_INPUT: Readonly<DecisionInput> = { ...DEFAULT_INPUT, income: 82_000, retirementIncome: 50_000, amount: 5_000, years: 25, age: 40 };

export function renderExample(): string {
  const d = decide(EXAMPLE_INPUT);
  const i = d.input;
  return workedExample(
    "tvr-h-example",
    `A 40-year-old in ${provinceName(i.province)} earns <strong>${$(i.income)}</strong> today, expects ${$(i.retirementIncome)} a year in retirement, and is deciding where to put ${$(i.amount)} for ${i.years} years at ${pct(i.expectedReturn, 1)} a year. No employer match, no home purchase planned. Run through this tool, that gives:`,
    [
      ["Account that fits these numbers", NAME[d.account]],
      ["Marginal rate today", pct(d.rates.now, 1)],
      ["Marginal rate at withdrawal", pct(d.rates.then, 1)],
      [`RRSP after tax in ${i.years} years`, $(d.values.rrsp)],
      [`TFSA after tax in ${i.years} years`, $(d.values.tfsa)],
      ["Difference", `${$(Math.abs(d.values.difference))} more in the ${d.values.difference >= 0 ? "RRSP" : "TFSA"}`],
    ],
    "Computed by the same engine as the tool above when this page was built. The dollar values illustrate one return; the rate comparison decides the answer.",
  );
}
