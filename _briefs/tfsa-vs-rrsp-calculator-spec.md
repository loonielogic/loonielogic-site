# Calculator spec: TFSA vs RRSP decision tool
Compiled 2026-09-27 (hourly grind worker). Design spec for the TFSA vs RRSP
decision calculator (one of the site's planned interactive tools in the
"try" layer of the learn → try → do funnel). All tax figures below were
re-verified against official/primary sources in this project's research
(2026-09-26/27); dated sources listed under Constants.

## 1. What it does
Helps a user decide where to put a dollar of retirement savings today: TFSA
or RRSP. It does not pick investments; it answers the account-type question.

The calculator compares, for a given contribution amount:
- The after-tax value of the contribution in an RRSP at the end of the
  user's horizon (deduct now at today's marginal rate, grow tax-deferred,
  pay tax at the projected retirement marginal rate on withdrawal).
- The after-tax value of the same pre-tax dollars in a TFSA at the same
  horizon (pay tax now at today's marginal rate, grow tax-free, withdraw
  tax-free).

Then it states a recommendation with a plain-English "why", plus the
dollar difference, plus the caveats that could flip the answer.

## 2. Core math (the decision rule)
The single most important input is:
- M_now = user's marginal tax rate today (income + province + clawbacks)
- M_then = user's projected marginal tax rate at withdrawal (retirement)

If M_now == M_then (and same return, same horizon), the after-tax outcomes
are mathematically identical. This is the anchor fact the calculator must
state on the results screen.

- M_now > M_then → RRSP wins by roughly (M_now − M_then) × contribution.
- M_now < M_then → TFSA wins by roughly (M_then − M_now) × contribution.

When the margin is small (within ~3 percentage points), the answer is a
tie and the recommendation goes to TFSA on flexibility grounds
(withdraw anytime, no tax, no room lost — see 4.3).

## 3. Inputs

### Required
1. Province or territory (drives marginal rate lookup). v1: full tables for
   Ontario, BC, Alberta; federal-only fallback for the rest with a note.
2. Gross employment income this year (drives M_now).
3. Expected annual retirement income (excluding TFSA withdrawals; including
   RRSP/RRIF withdrawals, pension, CPP, OAS — drives M_then).
4. Amount to allocate ($; what the user is deciding on now).
5. Years until planned withdrawal (horizon).

### Optional (with sensible defaults + "not sure" mode)
6. Available TFSA room / RRSP room (default: assume enough room; calculator
   flags that room is required before acting).
7. Employer RRSP match (yes/no + % — see 5.1).
8. Planning to buy a first home within ~15 years (routes to 5.2).
9. Still earning at/near retirement, or expecting high retirement income
   (routes to 5.6/5.7).
10. Expected retirement age (default 65; used for RRIF/OAS flags).

If the user can't estimate retirement income, offer "estimate for me"
mode: retirement income ≈ 60–70% of current gross (replacement-ratio
default, clearly labeled as a rough assumption).

## 4. Constants (verified 2026 figures — refresh annually)
- 2026 TFSA limit: $7,000/yr; cumulative max $109,000 (eligible since 2009).
  Over-contribution: 1%/month on excess until removed. Withdrawals restore
  room Jan 1 of the following calendar year.
- 2026 RRSP limit: 18% of 2025 earned income, max $33,810. Deadline for
  2026 tax year: March 1, 2027. $2,000 lifetime buffer allowed. Penalty on
  excess: 1%/month. RRSP withholding at withdrawal: 10% on ≤$5,000, 20% on
  $5,000.01–$15,000, 30% above $15,000 (Quebec differs slightly). Withholding
  is NOT the final tax — final tax is settled on the return; calculator
  models final tax, and must say so.
- RRSP must be converted to RRIF/annuity by Dec 31 of the year the holder
  turns 71. TFSA has no age limit and no minimum withdrawals.
- 2026 federal brackets: 14% to $58,523; 20.5% to $117,045; 26% to
  $181,440; 29% to $258,482; 33% above. (2026: first full year at 14%.)
- OAS clawback (recovery tax): 15% of net world income above $95,323 (2026
  income year; applies to July 2027–June 2028 payments). Sources: CRA-linked
  secondary reporting, re-verified 2026-09-27 across 6 sources.
  If M_then is computed with retirement income above the threshold, add the
  15 pp recovery tax to the effective marginal rate.
- FHSA: $8,000/yr, $40,000 lifetime (relevant only as the HBP alternative —
  the calculator should point HBP/FHSA planners to the relevant explainer,
  not model both).

## 5. Edge cases (each must flip or annotate the recommendation)

5.1 Employer RRSP match — if a match exists, RRSP wins on the matched
dollars automatically. Rule: contribute enough to capture the FULL match
first (free money beats all math), then run the TFSA-vs-RRSP logic on the
rest. The calculator must surface this before anything else.

5.2 First-time home buyer — RRSP enables the Home Buyers' Plan
($60,000/person; 15-year repayment, 5-year grace for first withdrawals
through Dec 31, 2028). FHSA ($8,000/yr, $40,000 lifetime, tax-free on
qualifying withdrawal) is usually better for this goal. If the user picks
"planning to buy", the tool should recommend checking the FHSA explainer
and model RRSP only for the HBP scenario, with the repayment obligation
shown as a 15-year income reduction.

5.3 Low income now, higher later (students, early career) — TFSA. An RRSP
deduction wasted at a low marginal rate is the classic mistake; TFSA room
is also the emergency fund that doesn't break a plan. Rule: if M_now is in
the lowest bracket, recommend TFSA unless an employer match exists.

5.4 High income now, lower later (the classic RRSP case) — RRSP, and say
the size of the projected saving in dollars.

5.5 The tie — if |M_now − M_then| ≤ ~3 pp, call it a tie and recommend TFSA
on flexibility (withdraw anytime tax-free; room restored next Jan 1;
doesn't inflate retirement income; keeps OAS/GIS clean).

5.6 OAS clawback exposure — if projected retirement income exceeds the
clawback threshold, the effective marginal rate at withdrawal includes the
15% recovery tax. This often flips "RRSP" to "TFSA". RRSP/RRIF withdrawals
count toward net income; TFSA withdrawals do not.

5.7 GIS-dependent low-income retirees — TFSA strongly. GIS is clawed back
aggressively against income; TFSA withdrawals don't reduce GIS. Flag this
explicitly for users projecting low retirement income with OAS/GIS.

5.8 Spousal RRSP — if the recommendation is RRSP and a spouse earns
materially less, suggest spousal RRSP for income splitting (3-calendar-year
attribution rule applies; withdrawals attributed back to the contributor
if within the window).

5.9 No room — if user enters room = $0 for the recommended account, block
with: "You have no contribution room — contributing anyway triggers the
1%/month penalty. Check CRA My Account." Never output a contribution plan
that assumes room.

5.10 Age 71+ — RRSP is closed (must be converted); if user is over 71 and
answers RRSP anyway, the tool must refuse and route to TFSA + RRIF planning
explainer instead.

5.11 Lifelong Learning Plan — RRSP enables LLP withdrawals ($20,000 for
education, repayable); minor edge case, link the explainer, don't model.

5.12 Self-employed — no employer match possible; first-60-days deadline
applies (Mar 1, 2027 for 2026); note for quarterly planning.

5.13 Non-resident departure — RRSP withdrawals face 25% non-resident
withholding (treaty dependent); TFSA room stops accruing while
non-resident. Out of scope for v1 math; show as a caveat if flagged.

5.14 Re-contribution timing — a user who thinks they may need the money
soon should prefer TFSA: RRSP withdrawals are taxed immediately and
withheld at source; TFSA withdrawals are tax-free but room only returns
the next Jan 1.

## 6. Outputs (results screen)
1. Headline recommendation (e.g. "Put it in your RRSP" / "TFSA" / "Split:
   match first, then TFSA") with one-sentence plain-English reason.
2. Projected after-tax value of the $X in each account at the horizon,
   side by side, with the dollar difference.
3. The two marginal rates (today vs retirement) shown explicitly — this is
   the teachable moment.
4. "What would flip this" — 2–3 conditions that would change the answer
   (e.g. "if your retirement income is $10k lower, the TFSA wins").
5. Relevant edge-case flags from section 5 that applied.
6. Action links: CRA My Account (room check), site's TFSA/RRSP explainers,
   FHSA explainer for home buyers.
7. Disclaimer (always, short): "A planning estimate, not financial advice.
   Brackets and limits change annually — figures are 2026. Room limits
   come from CRA My Account."

## 7. Input validation
- Reject negative or absurd incomes (cap plausibility warnings at $5M).
- Contribution amount must be > 0; warn if it exceeds plausible combined
  room ($40,810 = TFSA $7,000 + RRSP $33,810) and ask for room confirmation.
- Horizon 0–50 years; horizon 0 ("I need this soon") → auto-weight toward
  TFSA (5.14).
- All money fields labeled CAD; percentages entered as numbers (e.g. 6, not
  0.06).

## 8. What NOT to build in v1
- No provincial tables beyond ON/BC/AB (federal-only fallback labeled).
- No CPP/OAS benefit estimation (user supplies retirement income or uses
  replacement-ratio default).
- No investment-return modeling inside the accounts (same assumed return
  cancels out in the comparison; keep the tool about the account type).
- No spousal joint optimization; no non-resident math; no Quebec
  Revenu-specific forms.
