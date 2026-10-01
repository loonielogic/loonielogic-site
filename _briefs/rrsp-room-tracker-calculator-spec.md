# Calculator spec: RRSP contribution room tracker
Compiled 2026-09-27 (hourly grind worker). Design spec for the RRSP
contribution room tracker (one of the site's planned interactive tools in
the "try" layer of the learn → try → do funnel). Its job: give a user a
trustworthy "how much can I still put in this year" number from their CRA
figures plus the contributions they've made since, while teaching the
traps that create RRSP over-contributions — which are more expensive and
more confusing to fix than TFSA ones.
All tax figures below were re-verified against official/primary sources in
this project's research (2026-09-26/27); dated sources listed under
Constants. Completes the registered-account calculator cluster alongside
the TFSA vs RRSP decision tool and the TFSA room tracker.

## 1. What it does
Answers one question: "How much can I contribute to my RRSP right now
without going over?" Unlike the TFSA tracker, the RRSP tracker does NOT
rebuild room from birth-year tables — CRA computes your limit and prints
it on your Notice of Assessment / RRSP Deduction Limit Statement / CRA My
Account. The tool's job is the forward-tracking: take that CRA number,
reconcile it against what's actually happened since (contributions, unused
deductions, pension adjustments, PARs), and give the live number. It runs
in two modes:

- Mode A (default, "I have my CRA number"): user enters the RRSP
  deduction limit and unused RRSP contributions from their most recent
  NOA/Deduction Limit Statement, plus contributions made since. Fastest
  path, fewest traps.
- Mode B ("Rebuild my limit from scratch"): user enters the pieces CRA
  uses — unused deduction room, prior-year earned income, pension
  adjustment, PAR, PSPA — and the tool applies the official formula. For
  people validating a NOA or estimating next year's room.

It is an estimate: the CRA number is stale the moment you contribute
(section 5.7), and the tool never presents its figure as CRA's figure.

## 2. Core math

### 2.1 The official deduction-limit formula (CRA, IT124R6)
For 2026:
  RRSP deduction limit = A + B + R − C
where:
- A = unused RRSP deduction room carried forward from 2025 (from your
  2025 NOA). Unused room carries forward indefinitely — this is usually
  the biggest line on a young person's NOA.
- B = the lesser of [18% of 2025 earned income] and [the 2026 dollar
  limit $33,810], MINUS the 2025 pension adjustment (T4 box 52). B can be
  zero or negative only in edge cases (PA can exceed new room in theory;
  CRA floors the limit at zero — confirm rounding/flooring at build).
- R = pension adjustment reversal (PAR), if any (T10 slip — restores room
  in the year you leave an RPP/DPSP).
- C = net past service pension adjustment (PSPA), if any.

### 2.2 Available contribution room RIGHT NOW
  Room now = (most recent RRSP deduction limit)
             − (unused RRSP contributions previously reported and
                available to deduct — i.e. contributions you already made
                but never claimed, from your NOA)
             − (contributions made after that NOA/Deduction Limit
                Statement date, incl. employer group-RRSP contributions
                made on your behalf)

This is the checkbook math: the CRA limit is the opening balance; every
contribution since the statement is a withdrawal from it. The deduction
limit is NOT the same as contribution room — confusing the two is trap 5.1.

### 2.3 What counts as "earned income" (CRA definition)
Earned while resident in Canada, and includes: employment earnings,
self-employment earnings, net rental income, taxable support payments
received, CPP/QPP disability benefits, qualifying performance income
(amateur athlete), royalty income on your own work/invention — minus
employment expenses, union/professional dues, business or rental losses,
and deductible support payments. NOT earned income: pensions (incl.
CPP/QPP/OAS), retiring allowances, RRSP/RRIF receipts, death benefits,
investment income (interest, dividends, capital gains).

### 2.4 Worked example (shown in the tool's help/onboarding)
Mode A: Nadia's 2025 NOA shows an RRSP deduction limit of $22,200 and
$2,000 of unused RRSP contributions (made in 2025, never deducted). Since
the NOA she contributed $3,500 to her RRSP (incl. $1,000 from her group
RRSP). Room now = $22,200 − $2,000 − $3,500 = $16,700.

Mode B: Nadia's pieces — unused room A = $10,000; 2025 earned income
$90,000 × 18% = $16,200 (below the $33,810 cap); 2025 PA $4,000 → B =
$12,200; no PAR, no PSPA. 2026 deduction limit = $10,000 + $12,200 =
$22,200. (Matches her NOA — that agreement is the tool's trust moment.)

## 3. Inputs (wizard-style, one question per screen)

### Mode A (default)
1. RRSP deduction limit from your most recent NOA / Deduction Limit
   Statement / CRA My Account ($). Help text: where to find it on each.
2. Unused RRSP contributions previously reported and available to deduct
   ($, from the same statement — NOT zero by default; most people forget
   this line exists). "Contributions you made but never claimed as a
   deduction."
3. Contributions made since that statement ($, all RRSPs incl. spousal
   RRSP you contribute to, group RRSP, individual RRSP). Direct RRSP-to-
   RRSP transfers excluded (see 5.5).
4. If contributions in the first 60 days of this year exist: how much fell
   in the Jan–Mar window, and whether claimed for last year or this year
   (Schedule 7 split — the tool must not double-count a first-60-days
   contribution as both).

### Mode B (rebuild)
1. Unused deduction room carried forward (A).
2. Prior-year earned income → tool shows 18% and the dollar cap, takes
   the lesser.
3. Pension adjustment (T4 box 52 for the prior year).
4. PAR (T10 slip), if any. PSPA, if any.
5. Then Mode A questions 2–4 to get to room now.

### Both modes
- "Not sure" path: the tool explains the NOA/My Account figure is the
  source of truth, shows exactly where on the NOA it sits, and offers a
  "best guess" mode clearly labeled as a guess. Never compute silently
  from guesses.

## 4. Constants (verified 2026 figures — refresh annually)
- 2026 RRSP dollar limit: $33,810; 18% of 2025 earned income, lesser of
  the two (Fidelity; Wealthsimple RRSP FAQs, 2026-09-26). History:
  2024 $31,560; 2025 $32,490; 2026 $33,810 (Moneysense). Cap binds at
  $187,833 earned income. 2027 dollar limit: announced by CRA later in
  2026 — refresh when announced, never pre-invent it.
- Pension adjustment: reduces next year's room; T4 box 52 (CRA).
- PAR: restores room in the year pension/DPSP membership ends; reported
  on a T10 slip; you do not apply for it (CRA "Reporting a pension
  adjustment reversal", 2026-09-27).
- Unused room carries forward indefinitely (CRA; SavvyNewCanadians).
- $2,000 lifetime over-contribution buffer (no deduction on it); beyond
  it: 1%/month tax on the excess until removed or absorbed by new room
  (CRA Part X.1; Fidelity; Wealthsimple, 2026-09-26). Buffer does NOT
  apply to anyone under 18 — 1%/month on ANY excess (MoneySense/Broadridge
  RRSP myths FAQ).
- T1-OVP (Individual Tax Return for RRSP excess contributions): filed
  within 90 days after the end of the year — generally March 31 (March 30
  in a leap year). Late filing: 5% of balance owing + 1%/month up to 12
  months (MoneySense; Mawer; maqcpa; RBC WM).
- 2026 contribution deadline for a 2026-tax-year deduction: March 1, 2027
  (first 60 days; CRA line 20800; Moneysense, 2026-09-26).
- Age 71: last contribution year is the year you turn 71; RRSP must be
  converted/closed by Dec 31 of that year (Wealthsimple; Longview primer).
- Deduction can be deferred: contributions need not be claimed in the
  year made — carry forward via Schedule 7 (Wealthsimple deadline page).

## 5. Edge cases (each must flip, warn, or annotate the output)

5.1 Deduction limit ≠ contribution room (the #1 confusion) — the tool's
results screen must show both numbers separately with one-line
definitions: "Deduction limit (CRA's max for deductions)" vs "Unused
contributions (already inside the plan, not yet deducted)" vs
"Contribution room now (what you can still put in)". The over-
contribution check runs on room now, not the deduction limit.

5.2 Negative room (already over-contributed) — if room now computes below
$0, STOP the "you can contribute" output. Show: excess amount, the
$2,000 buffer applied (or not — under-18), 1%/month tax on the excess
over buffer, and the fix path: withdraw excess (T3012A to avoid
withholding; T746 to deduct the withdrawn unused contributions), file
T1-OVP within 90 days of year-end (generally March 31), RC2503 waiver
request if reasonable error + steps taken to eliminate. New room next
Jan 1 can absorb part of the excess — show both paths.

5.3 First-60-days double-count trap — contributions Jan 1–Mar 1, 2027 can
be claimed for 2026 OR 2027. The tracker must tag each contribution with
its period and deduction-claim year so a January contribution isn't
subtracted from both years' room. Help text: "CRA splits your receipts
Mar–Dec vs Jan–Mar for a reason."

5.4 Spousal + group RRSPs count against the CONTRIBUTOR's room — employer
contributions to a group RRSP and your contributions to a spouse's RRSP
both eat YOUR deduction limit. Ask explicitly ("include employer/group
RRSP and spousal RRSP contributions"). Direct RRSP-to-RRSP transfers
between your own accounts do NOT count.

5.5 Withdrawals permanently destroy room — unlike a TFSA, there is no
Jan-1 restoration: money taken out of an RRSP loses that room forever
(Mawer). If the user reports withdrawals, annotate (don't add back).

5.6 Under-18 contributors — no minimum age; a minor with earned income
who files a return accrues room (Wealthsimple; MoneySense). But: the
$2,000 buffer does NOT apply under 18 — flag any excess immediately.

5.7 NOA/My Account staleness — the CRA figure predates every contribution
since filing, and PAs/PARs/PSPAs can lag a year. Every results screen
carries: "CRA's number is a snapshot; your own contribution records are
the real-time truth. This tool is only as accurate as what you've told
it." This is the honest-money detail that makes the tool trustworthy.

5.8 Non-residents — employment income earned abroad generally creates NO
new RRSP room (MoneySense); existing room can still be used (contribution
allowed, but the deduction is worthless without Canadian tax to offset).
One-line branch: if user selects non-resident, zero the earned-income
line and warn.

5.9 Age 71+ — no new contributions after the year you turn 71. If age ≥ 71
selected, the tool shows "contribution room is closed; room converts to
RRIF/withdrawal planning" and routes to the explainer. (MoneySense trick
note for the build doc: Dec-of-71 contribution against that year's
earned income is the documented edge — v1 just routes, doesn't compute.)

5.10 Earned-income misconceptions — if the user enters "total income"
including dividends/pension/CPP, the tool must break it down (2.3):
"RRSP room runs on earned income, not total income." Offer the quick
checklist: salary/self-employment/rental/alimony-in vs pension/CPP/
investment income. A retiree living off investments may have $0 new room
despite high total income.

5.11 Saskatchewan Pension Plan — SPP contributions count against RRSP
room. One-line note (not a full branch).

## 6. Outputs (results screen)
1. Headline number: contribution room available NOW (CAD), with the
   as-of date and the statement it was reconciled from.
2. The three-line reconciliation: CRA deduction limit − unused
   contributions − contributions since statement = room now (Mode B adds
   the A + B + R − C breakdown that produced the limit).
3. First-60-days panel: window dates, how much of this year's
   contributions fall in it, claimed-vs-deferred status, and the
   deadline (March 1, 2027 for the 2026 tax year).
4. New-room forecast (optional, Mode B): estimated 2027 new room from
   this year's earned income, with "capped at the 2027 dollar limit —
   announced later this year" caveat.
5. Edge-case warnings that fired (5.1–5.10), plain-English, no jargon.
6. The staleness note (5.7).
7. Action links: CRA My Account (official limit), site's RRSP basics
   explainer, TFSA vs RRSP decision tool, fixing-over-contributions
   explainer.
8. Disclaimer (always): "An estimate from your own records, not financial
   advice or CRA's figure. Limits change annually — figures are 2026."

## 7. Input validation
- Money fields ≥ 0, CAD; absurd inputs (> $50M earned income, > $5M room)
  get a "double-check that" warning, not a hard block.
- Unused contributions cannot exceed (deduction limit + $2,000 buffer)
  without triggering the over-contribution branch — if entered above
  that, reroute to 5.2 rather than erroring.
- Prior-year earned income > $187,833 → show the cap line: "18% = $X,
  but the $33,810 dollar cap binds."
- PA > $33,810 (2026 PA) → warn: PA can't exceed the year's dollar
  limit; likely a data-entry error (T4 box 52 misread).
- Age ≥ 71 → route to 5.9, don't compute room.
- Contributions-since-statement that exceed deduction limit → 5.2
  branch, never a negative "room" presented as spendable.
- Period tagging: every contribution gets a date → Mar–Dec 2026 bucket or
  Jan–Mar 1, 2027 bucket; undated contributions go in a third "unsorted"
  bucket with a nudge to date them.

## 8. What NOT to build in v1
- No connection to CRA / My Account (no credential handling — never ask
  for CRA login).
- No withholding-on-withdrawal math (that's the tax estimator's job);
  no RRIF conversion planning.
- No HBP/LLP withdrawal tracking beyond the "permanently destroys room"
  note and links (those programs get their own explainers; the HBP draft
  is done, LLP pending).
- No spousal attribution-period (3-year) tax math — only the
  "counts against the contributor" rule.
- No US/foreign-pension or treaty logic for non-residents beyond 5.8.
- No automatic yearly rollover / persistent ledger (v2 can persist a
  running contribution log).

## 9. Cross-links inside the cluster
- TFSA vs RRSP decision tool (hidden_files/tfsa-vs-rrsp-calculator-spec.md)
  — this tracker answers "how much"; that tool answers "where".
- TFSA room tracker (hidden_files/tfsa-room-tracker-calculator-spec.md)
  — sibling UX, same honest-money staleness note, but opposite
  withdrawal semantics (restored Jan 1 vs destroyed forever).
- RRSP basics explainer (files/rrsp-basics-explainer-v1.md) — the
  learn-layer page this tool sits under.
