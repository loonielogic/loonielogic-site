# Calculator spec: house affordability
Compiled 2026-09-27 (hourly grind worker). Design spec for the house affordability calculator (one of the site's planned interactive tools in the "try" layer of the learn → try → do funnel). Its job: answer "what's the most house my income can carry?" using the actual lender qualification rules — GDS/TDS at the stress-test rate, tiered minimum down payments, and the Dec 2024 federal mortgage reforms — while teaching why the qualifying rate is not the paying rate.
All tax/insurance figures below were re-verified against sources dated 2026 (research: hidden_files/house-affordability-research.md); dated sources listed under Constants.

## 1. What it does
The user enters:
- gross annual household income,
- expected contract mortgage rate (editable default; label "what you'd actually pay"),
- other monthly debt payments (car loan, cards, student loans, LOCs — with a helper note on the 3% / 0.65% conventions for revolving balances),
- estimated annual property tax (editable default: 1.0% of purchase price),
- estimated monthly heating (editable default: greater of $100/mo or $0.75 per livable sq ft — lender convention),
- condo fees if applicable (50% counts in GDS/TDS),
- available down payment cash,
- first-time buyer? (yes/no), newly constructed home? (yes/no) — drives 30-year amortization eligibility,
- province (for LTT + PST-on-premium closing costs; Ontario rates fully specced, others as lookup rows),
- city of Toronto? (yes/no — adds municipal LTT).

The tool outputs the maximum purchase price from the tighter of three constraints: GDS cap, TDS cap, and the down payment minimum (plus the cash-at-closing check: LTT + legal + premium-PST must be payable on top of the down payment). It shows the full breakdown, the qualifying-rate payment vs the actual payment, and the worked 39%/44% explanation. It is an estimate, not a pre-approval — state that on screen.

## 2. Core math

### 2.1 Payment convention
Canadian fixed rates are quoted as nominal annual, compounded semi-annually. Monthly payment on loan L at quoted rate i, amortized over n months:
- monthly rate r = (1 + i/2)^(2/12) − 1
- payment = r / (1 − (1+r)^−n) × L

### 2.2 The qualifying rate (stress test)
qualifying rate = max(contract rate + 2%, 5.25%). The GDS/TDS tests use the payment computed at this rate; the "your real payment" figure uses the contract rate. The tool must visually separate these two numbers — users constantly confuse them.

### 2.3 Constraint 1: GDS (39% insured ceiling)
monthly housing ≤ 39% × (gross annual income / 12), where monthly housing =
  P&I at qualifying rate on (mortgage amount + capitalized CMHC premium)
  + property tax/12 + heating + 0.5 × condo fees
Maximize the purchase price P such that monthly housing = the cap, with the mortgage amount derived per 2.6–2.7.

### 2.4 Constraint 2: TDS (44% insured ceiling)
monthly housing + other monthly debt ≤ 44% × (gross annual income / 12). This is the binding constraint for most buyers carrying car/LOC debt. For revolving balances where the user only knows the balance, offer the lender conventions: use max(actual minimum, 3% of balance) for unsecured revolving, 0.65% of balance for secured.

### 2.5 Constraint 3: down payment minimums
- 5% on first $500,000 + 10% on the portion from $500,000 to $1,500,000.
- Above $1,500,000: insurance unavailable → 20% down on the entire price (hard cliff: $1,500,001 needs $300,000). Tool should warn before the user steps over it.
- Show the effective down-payment percentage (e.g. $900k → $65,000 = 7.2%), because the "5% of the price" mental model is the #1 budgeting failure.

### 2.6 Amortization eligibility (Dec 15, 2024 federal reforms)
- Default max insured amortization: 25 years.
- 30 years allowed if first-time buyer (any home) OR the home is newly constructed (any buyer).
- 30-year choice adds a 0.20% surcharge to the CMHC premium rate at every tier, but lowers the qualifying payment ~9%, raising the GDS/TDS-capped price. Tool should let the user toggle 25 vs 30 (when eligible) and show the trade-off: lower payment now vs more total interest.

### 2.7 CMHC premium capitalization
Premium tiers (2026), on the mortgage amount (price − down):
- 5–9.99% down: 4.00% (4.20% at 30-yr) | 10–14.99%: 3.10% (3.30%) | 15–19.99%: 2.80% (3.00%).
- Premium is added to the mortgage balance; the GDS/TDS qualifying payment is computed on the capitalized total (loan + premium), NOT the bare loan.
- PST on the premium is due in CASH at closing in Ontario (8%), Quebec (9.975%), Manitoba (7%), Saskatchewan (6%).

### 2.8 Cash-at-closing check
Land transfer tax (Ontario scale: 0.5%/1.0%/1.5%/2.0%/2.5% slices; Toronto adds identical municipal LTT) + lawyer/fees (~$2,000 editable) must be payable in cash, on top of the down payment. First-time buyer rebates (ON up to $4,000 provincial; Toronto up to $4,475 municipal) applied as credits. If cash available < down + closing, flag: "your limiting factor is savings, not income."

## 3. Worked example (shown in the tool's help; verified by calculation 2026-09-27)
Household: $140,000 gross income, no debt, 4.5% contract rate, 25-year amort, Ontario (not Toronto), $600k-area purchase.
- Qualifying rate = max(6.5%, 5.25%) = 6.5%. Payment per $1,000 of loan at 6.5%/25yr = $6.70/mo.
- GDS cap = 39% × $140,000/12 = $4,550/mo. Housing = P&I + $500/mo property tax (1% of ~$600k) + $100/mo heating.
- Solving P&I = $3,950/mo → max capitalized loan $589,707. With 5% down (tier: $600k home → $30k) and 4.00% CMHC premium capitalized, the GDS-max price is ~$597,000 (down ~$29,800, premium ~$22,700, capitalized loan $589,700; GDS exactly 39.0%).
- Actual payment at the 4.5% contract rate: ~$3,264/mo — $686/mo LESS than the qualifying payment. This gap is the point of the tool.
- Closing: Ontario LTT ~$8,412 − $4,000 first-time rebate = $4,412 cash + $1,810 PST on the premium (8% of $22,700) + legal.
- TDS-binding variant: same household with $700/mo in car/LOC payments → TDS cap 44% binds first, dropping the max price to ~$579,000. Teaching point: a $700/mo car payment costs ~$18,000 of house.

## 4. Edge cases and warnings (specced inputs)
1. Rates below the floor: contract 3% → qualifies at 5.25%, not 5%. Say it plainly.
2. Variable-rate mortgages: qualify at max(benchmark, contract+2%) same formula — same code path.
3. $1.5M cliff warning before crossing (see 2.5).
4. Condo: 50% of fees in GDS/TDS — tool must label which half counts and why.
5. Non-20%-down without insurance above $1.5M: lender-set ratios (no CMHC ceiling) — tool falls back to 39/44 as a reference and says "your lender decides."
6. Uninsured (20%+ down): B-20 still requires the stress test; ratios are lender-set — same fallback note as #5.
7. Down payment source validation checklist (savings, FHSA, HBP up to $60,000/person, gifts, sale proceeds; borrowed funds generally rejected for insured).
8. Stale-rule traps: the 2020-era 35%/42% CMHC ratios and pre-Dec-2024 $1M insured cap still circulate online — the tool's "rules used" footer must date-stamp the 39/44 + $1.5M cap + 30-yr reforms so users can spot stale advice.
9. Lender-internal tightening: many banks run ~32/40 — note that 39/44 is the insured ceiling, and a pre-approval is the only real number.
10. Property tax/heating defaults are provincially crude — flag as estimates and let the user override.

## 5. Constants (re-verified 2026-09-27; re-check at build)
- GDS 39% / TDS 44% insured (beacon ≥ 680); stress test max(contract+2%, 5.25%).
- Down: 5%/$500k + 10% to $1.5M; 20% entire price above $1.5M.
- 30-yr insured amort: first-time buyers (any home) or new builds; +0.20% premium surcharge.
- CMHC premiums: 4.00/3.10/2.80 (+0.20 at 30-yr). Capitalized; PST on premium cash at closing (ON 8%, QC 9.975%, MB 7%, SK 6%).
- Ontario LTT scale 0.5/1.0/1.5/2.0/2.5%; Toronto doubles with municipal LTT; first-time rebates up to $4,000 (ON) / $4,475 (Toronto MLTT), stackable.

## 6. Output screen spec
Top line: "Your maximum purchase price: $X" (the tightest of the three constraints, named). Below: three constraint cards showing each constraint's max and which one binds; qualifying payment vs actual payment side-by-side; breakdown table (income, caps, P&I, tax, heat, debts, premium, PST, LTT, rebates); down payment required + effective %; 25-vs-30-year toggle with total-interest comparison; "next step: pre-approval" CTA placeholder (affiliate slot). Disclaimer: estimates only, lender decides, rules dated 2026-09-27.
