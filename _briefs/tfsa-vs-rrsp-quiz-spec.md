# TFSA vs RRSP decision quiz — spec (v1, 2026-09-29)

Status: SPEC ONLY. The six questions below are carried verbatim from the
comparison draft (files/tfsa-vs-rrsp-comparison-v1.md, "The 60-second quiz"
section). The interactive quiz widget (queue #6, an island per the
calculator-architecture spec) is not built yet — the comparison page renders
the questions as static prose for now, which is why this file exists as the
`quiz_spec` pointer the content manifest requires.

## The 6 questions (work top to bottom; the first that applies ends the quiz)

1. **Does your employer match RRSP contributions?** Yes → contribute enough to
   capture the FULL match, then continue the quiz with whatever is left. No
   match exists → keep going.
2. **Is this money for a first home within ~15 years?** Yes → read the FHSA vs
   Home Buyers' Plan comparison first; the FHSA usually beats both accounts
   for this goal.
3. **Is your income today in your peak-earning years?** If you're earning much
   more now than you expect in retirement (roughly a 5+ point marginal-rate
   gap), lean **RRSP**.
4. **Is your income likely to be higher in retirement than today?** Students,
   early career, expecting a pension or high retirement income → lean **TFSA**.
5. **Might you need this money before retirement?** Yes → **TFSA**. RRSP
   withdrawals are taxed immediately and the room never comes back.
6. **Will your retirement income exceed ~$95,000?** Yes → lean **TFSA** — the
   15% OAS clawback turns RRSP withdrawals expensive.

No to all of the above, or genuinely unsure? Default to the **TFSA**: when the
math is a tie, flexibility wins.

## Widget notes (for the island build)

- Outcome screens link to the TFSA room tracker and RRSP room tracker
  (internal links, not affiliate) per the affiliate spec's calculator/quiz
  placement rules.
- If a quiz outcome screen ever carries a direct affiliate CTA, that screen
  must carry the short disclosure above the results (affiliate spec §4).
