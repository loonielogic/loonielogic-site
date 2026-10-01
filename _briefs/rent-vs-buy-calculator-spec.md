# Calculator spec: rent vs buy comparison
Compiled 2026-09-27 (hourly grind worker). Design spec for the rent-vs-buy calculator — the "try" layer tool that answers "should I buy, or keep renting and invest the difference?" Research + verified constants: hidden_files/rent-vs-buy-research.md. Import paths from sibling tools: the affordability calculator's payment math, the down-payment planner's closing-costs module (province LTT tiers, Toronto MLTT Apr-2026 schedule, FTB rebates), the income-tax estimator's marginal rates (only if the build ever models rental income — out of scope v1).
Design stance (from the FHSA-vs-HBP comparison brief): be the only one that RECOMMENDS with honest math. The net-wealth method lets the tool say "keep renting" in Toronto-type markets — that honesty is the competitive edge; gap analysis found no Canadian competitor running this comparison transparently.

## 1. What it does
Two verdict outputs, computed monthly over the user's planned horizon (default 10 years, editable 1–30):
- **Net-wealth comparison**: buy-path net wealth vs rent-path net wealth at years 5 / 10 / horizon. Net wealth, not monthly payment — this is what makes the verdict defensible.
- **Breakeven year**: the first year buy-path wealth ≥ rent-path wealth (may be "never" — display that plainly, not as an error).
Plus: price-to-rent diagnostic, monthly cash-flow comparison, sensitivity grid, and the "monthly stretch" affordability warning.

## 2. Inputs
- Current monthly rent; expected annual rent growth (defaults: Ontario 2.1%, BC 2.3%, other provinces user-set; if unit first occupied after Nov 15, 2018 in Ontario → warn "your unit is guideline-exempt — enter your landlord's realistic increase").
- Target home price; down payment ($ or %); condo? (drives condo-fee input); city/province (property tax rate lookup; closing-costs module).
- Mortgage contract rate (prefill link to current best-fixed table; editable), amortization (25 default; 30 for FTB/new builds), fixed vs variable (variable → add renewal-rate shock input).
- Property tax rate (city lookup default, editable), home insurance $/mo, maintenance %/yr (default 1%), condo fees $/mo.
- Expected home appreciation %/yr (default 3%; flagged "assumption, not forecast"), renter's investment return %/yr after-tax (default 5%).
- Planned tenure in the home (years); likelihood of moving earlier (the "5-year rule of thumb" is transaction-cost math — the tool shows it, not asserts it).
- Selling commission % (default 4.5%; Ontario note: 5% common, flat-fee eroding), moving costs.

## 3. Core math (MANDATORY method — net wealth, monthly steps)
**Canadian compounding:** i_monthly = (1 + r/2)^(2/12) − 1, NOT r/12. (At 4.09% on $720k this changes the payment by ~$14/mo — real money; the US-formula shortcut is a correctness bug in a Canadian tool.)
Standard amortizing payment P from i_monthly; stop the payment when the balance hits zero (amortization end); balance floor at 0.

**Buy path, net wealth at year Y:** sell_value = price × (1+appreciation)^Y; sell_costs = sell_value × commission% + legal + moving; mortgage_balance(Y); buy_wealth(Y) = sell_value − sell_costs − balance.

**Rent path, net wealth at year Y:** upfront_invested = down_payment + closing_costs + moving; grows at investment return. Each month t: rent_t = rent_0 × (1+rent_growth)^(t/12); own_cost_t = payment_t + property_tax_t + insurance_t + maintenance_t + condo_t (tax/insurance/maintenance grow with home value/CPI — NOT flat); monthly_saving_t = own_cost_t − rent_t (can be negative — owning can be cheaper per month than rent in low price-to-rent markets; the renter then "un-saves"); invest each month's saving at the investment return.
rent_wealth(Y) = upfront×(1+r_inv)^months + Σ monthly_savings compounded.

**Breakeven:** first year Y where buy_wealth ≥ rent_wealth, checked yearly 1–30. If never → display "Buying never catches up under these assumptions" + which assumption would flip it (run the sensitivity grid and name the nearest flip).

**Price-to-rent diagnostic:** annual price ÷ annual rent. Bands (Canadian-adapted): <15 buy-favoured, 15–20 toss-up, >20 rent-favoured — but the tool presents the band as a cross-check against the computed breakeven, never overriding it.

**Monthly cash-flow card:** month-1 owning cost vs rent, and the payment at the STRESS-TEST rate (max(contract+2%, 5.25%)) vs rent — shows the qualification burden vs the actual burden. If stress-test payment > 44% of income (user income input, optional) → "you may not qualify at this price" warning linking to the affordability calculator.

## 4. Verdict logic (the recommendation)
1. If breakeven year > planned tenure (or never) → verdict: RENT, with the wealth gap at the planned tenure stated in dollars ("renting leaves you ~$X richer after 10 years under these assumptions").
2. If breakeven ≤ planned tenure → verdict: BUY, with breakeven year and the wealth gap.
3. Sensitivity grid (3×3): appreciation {1%, 3%, 5%} × investment return {3%, 5%, 7%} → verdict in each cell. The cell pattern is the honest headline: if 7 of 9 cells say rent, say so.
4. Monthly-stretch warning independent of verdict: if month-1 owning cost > 1.4× rent → flag cash-flow shock even when buying wins long-term ("you'll be house-rich and cash-poor for N years").

## 5. Worked examples (Python-verified 2026-09-27; illustrative — build must use Canadian compounding)
**Toronto base:** $800k price, $2,600 rent, 10% down, 4.09%, 25-yr, tax 0.767311%, $150/mo insurance, 1% maintenance, 3% appreciation, 2.1% rent growth, 5% investment return, 2% closing, 4.5% selling commission. Price-to-rent 25.6. Rent wins: yr10 buy $509k vs rent $654k; breakeven never. Sensitivity: appreciation 5% + returns 4% → buy breaks even year 4.
**Calgary:** $500k price, $2,200 rent, 10% down, 4.09%, tax 0.665%, 1% closing (Alberta: no LTT), otherwise same. Price-to-rent 18.9. Buy breaks even year 5 (yr5: $159.0k vs $158.5k; yr10: $317.5k vs $290.3k).

## 6. Edge cases
- Condo: condo fees grow ~2–3%/yr AND special assessments (one-time shock input; tool notes the average assessment frequency); maintenance % lower (0.5%) since exterior is covered.
- Rent-controlled vs exempt unit (ON post-2018): exempt rent growth default should be higher than the guideline — prompt the user.
- Moving earlier than planned: transaction costs (buying closing + selling 4.5%+) are ~7% round-trip on an $800k home ≈ $56k — the tool shows "cost of being wrong by N years."
- Variable rate: payment fixed for term but interest share moves; add renewal-rate assumption input with default = contract rate; warn if user enters a rate below today's best variable (3.30%).
- Employer relocation / job mobility: qualitative nudge — "if your probability of moving in <5 years is high, renting wins mechanically" (link the transaction-cost math).
- Down payment <20%: CMHC premium added to the mortgage (tiered premiums from the affordability spec) — the tool must include it; skipping it flatters buying.
- HBP/FHSA: the buy path assumes the down payment is already funded (sourced via the down-payment planner); do NOT re-model FHSA/HBP tax effects here — link out.

## 7. Validation rules
- Rent growth 0–10%; appreciation −5% to +10% (negative allowed — bear case is legitimate); investment return 0–10%.
- Down payment ≥ minimum tiered (5%/$500k + 10% to $1.5M — from affordability spec).
- Horizon 1–30 years; planned tenure ≤ horizon.
- If price-to-rent < 8 → sanity flag ("check your rent input — this ratio is unusually low for Canada").
- All assumption defaults shown WITH their edit affordance — never buried.

## 8. Outputs / screen spec
Verdict card (RENT/BUY + one-line reason + wealth gap $), net-wealth chart (two curves, breakeven marker or "never" annotation), price-to-rent badge, monthly cash-flow card (actual + stress-test payment vs rent), sensitivity 3×3 grid, assumption panel (all six editable assumptions with sources), "cost of being wrong" moving-early card, CTA links: affordability calculator, down-payment planner, FHSA-vs-HBP comparison.

## 9. Re-verify flags (at page build)
BoC rate + best-fixed/variable tables (weekly moves); ON/BC rent guidelines (2027 already known: ON 1.9%, BC 2.2%); city property-tax rates; commission norms; CMHC premium tiers (shared with affordability spec).
