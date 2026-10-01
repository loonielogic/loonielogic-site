# Research: house affordability calculator inputs (Canada, 2026)
Compiled 2026-09-27 (hourly grind worker). All figures re-verified vs sources below today.

## 1. Qualifying ratios (GDS / TDS)
- CMHC-insured mortgages: GDS max 39%, TDS max 44% (with credit beacon >= 680). Housing costs in GDS = mortgage P&I (at qualifying rate) + property tax + heating + 50% of condo/strata fees. TDS adds all other monthly debt obligations. (Sources: CMHC via getahouse.ca 2026-07; wealthnorth.ca updated 2026-09-25; habitam.ca 2026-09-17; canooq.ca 2026-09-12.)
- Many individual lenders use tighter internal limits (~32% GDS / 40% TDS); 39/44 is the insured ceiling, not a target. (rethinkrenting.com, 2026-09-10.)
- NOTE: a stale 2020-vintage source (investmentexecutive.com, June 2020) still circulates showing CMHC 35%/42% — that was the July 2020-July 2021 COVID tightening, reverted back to 39%/44%. Do not use.
- TDS debt conventions (lender practice, CMLS broker doc): unsecured revolving credit (cards, LOC) counted at the greater of actual minimum payment or 3% of outstanding balance; secured credit at 0.65% of outstanding balance. Installment loans at the payment shown on the bureau report.

## 2. Stress test (qualifying rate)
- 2026 rule unchanged: qualify at the greater of (contract rate + 2%) or 5.25% floor, for both insured and uninsured mortgages at federally regulated lenders (OSFI B-20). Confirmed by 4 sources 2026-09: wealthnorth.ca (2026-09-25), canooq.ca (2026-09-12), habitam.ca (2026-09-17), medium.com April 2026 piece.
- Worked math: contract 4.5% -> qualifies at 6.5%; contract 2.75% -> qualifies at the 5.25% floor.
- Canadian fixed rates quoted semi-annual compounding: equivalent monthly rate = (1 + i/2)^(2/12) - 1. (Used for payment math in spec.)

## 3. Minimum down payment (tiered)
- 5% on first $500,000; 10% on the portion above $500,000, up to the insured price cap of $1,500,000. Above $1.5M: no insurance available -> 20% down on the entire price. The $1.5M cap is a hard cliff: at $1.5M min down = $125,000; at $1,500,001 = $300,000. (hassann.ca 2026-09-09; arthurzhao.realtor 2026-06-13; Dept. of Finance 2024.)
- Effective-percentage trap: $900k home needs $65k (7.2%), not 5%. Spec should show effective % to correct the "5% of the price" mental model.
- Sources of down payment must be verified: savings, FHSA, HBP, family gifts, sale proceeds. Borrowed down payments generally not allowed on insured mortgages. (kraftmortgages.ca 2026-09-26.)

## 4. Amortization rules (post Dec 15, 2024 federal reforms)
- Insured mortgages: 25 years max, EXCEPT: all first-time buyers (any home type) and anyone buying a newly constructed home may choose 30 years. Non-first-time buyers on resale = 25 years. (canadianrealestatemagazine.ca 2024-12; arthurzhao.realtor 2026-06-13; lendinghub.ca 2026-09-24.)
- 30-year surcharge: +0.20% added to the CMHC premium rate at every tier. Confirmed by CMHC's own notice (cmhc-schl.gc.ca, Aug 1 2024, 20 bps) and 3 secondary sources.
- 30-year amortization lowers the qualifying payment ~9% (Edge Realty estimate via canadianrealestatemagazine) — meaningfully raises GDS-capped purchasing power.

## 5. CMHC (mortgage default insurance) premiums, 2026
Verified consistent across 3 sources (getahouse.ca, mortgagesforless.ca, zealty.ca):
- 5-9.99% down (90.01-95% LTV): 4.00% (4.20% at 30-yr)
- 10-14.99% down (85.01-90% LTV): 3.10% (3.30%)
- 15-19.99% down (80.01-85% LTV): 2.80% (3.00%)
- Premium is added to the mortgage balance (capitalized), and the GDS/TDS qualification payment is computed on the capitalized total.
- PST on the premium is due IN CASH at closing in Ontario (8%), Quebec (9.975%), Manitoba (7%), Saskatchewan (6%). BC: no PST on premium. (wowa.ca; zealty.ca.)
- Three insurers (CMHC, Sagen, Canada Guaranty) charge identical premium rates; borrower doesn't pick the insurer.

## 6. Land transfer tax / closing costs (Ontario focus)
- Ontario LTT sliding scale (verified July 2026, ratecore.ca; mortgageinottawa.com): 0.5% first $55k, 1.0% $55-250k, 1.5% $250-400k, 2.0% $400k-$2M, 2.5% above $2M. Toronto adds an identical municipal LTT (doubling). City of Toronto luxury tiers above $2M from April 1, 2026 — out of scope.
- First-time buyer rebates: Ontario provincial up to $4,000; Toronto municipal up to $4,475; stackable (up to $8,475). (arthurzhao.realtor 2026-07; ratecore.ca; mortgagesquad.ca 2026-09-25.) Full $4k provincial covers a ~$368k purchase.
- LTT must be paid in cash at closing, cannot be financed.
- STALE WARNING: mortgagecapitalinvestment.com (Feb 2026) still shows HBP limit as $35,000 — the actual 2026 limit is $60,000/person (verified in this project's HBP research, 2026-09-27). Do not use that page for HBP figures.
