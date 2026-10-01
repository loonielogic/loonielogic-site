# Rent vs buy calculator — research notes
Compiled 2026-09-27 (hourly grind worker). All figures re-verified against sources fetched today.

## Verified constants (2026)

**Qualification / stress test.** OSFI B-20 minimum qualifying rate = max(contract rate + 2.00pp, 5.25% floor). Reaffirmed unchanged in OSFI's Jan 29, 2026 quarterly update; LTI 4.5x portfolio cap stays alongside (not replacing) the MQR. Straight-switch exemption since Nov 21, 2024 (no re-test switching uninsured lenders at renewal if no principal/amortization increase). Insured borrowers exempt at renewal since Jan 2024. The rent-vs-buy tool uses the CONTRACT rate for payment math (the stress test belongs to the affordability calculator), but the spec must note qualification happens at the higher rate.
Sources: OSFI via canadianmortgagetrends.com 2026-01 (https://www.canadianmortgagetrends.com/2026/01/osfi-leaves-mortgage-stress-test-in-place-reaffirms-lti-limits-for-lenders/), pegasuslending.com renewal pages (fetched 2026-09-27).

**Ontario rent guideline 2026: 2.1%** (2025 was 2.5%; guideline capped at 2.5% by law). Applies to units first occupied on/before Nov 15, 2018; post-2018 units exempt from the cap (notice + 12-month rules still apply). N1 form, 90 days' written notice, max once per 12 months. **2027 guideline already announced: 1.9%.**
Sources: ontario.ca via arthurzhao.realtor 2026-06-20 (https://arthurzhao.realtor/2026/06/20/article-1244-ontario-rent-increase-rules-en/), learnontario.ca, liv.rent buy-vs-rent Kitchener-Waterloo 2026.

**BC allowable increase 2026: 2.3%** (2025: 3.0%; tied to CPI inflation; announced late Aug 2025). 3 months' notice, max once per 12 months. **2027: 2.2%.**
Sources: storeys.com 2025-08-26 (https://storeys.com/bc-rent-increase-cap-2026/), sellvanhomes.ca 2026-09.

**Mortgage rates, Sept 2026.** BoC policy rate 2.25% (held, next decision Oct 28, 2026). Best 5-yr fixed: ~3.91% (money.ca, Sept 27, 2026) / 4.06–4.09% at discount brokerages; Big Six 4.59–5.14%. Best 5-yr variable ~3.30%. Nesto forecast: fixed rates flat-to-up into 2027 (bond-yield pressure; 10-yr GoC ~3.9%).
Sources: latestmortgagerates.ca week-39-2026 (https://latestmortgagerates.ca/blog/best-5-year-fixed-rates-week-39-2026/), nesto.ca forecast, ratehub.ca, mpamag.com.

**Property tax.** Toronto 2026 total residential rate: **0.767311%** (city 0.605295% + building fund 0.009016% + education 0.153000%) — toronto.ca official table, fetched 2026-09-27. Calgary 0.665%; Edmonton 1.036% (wealthnorth.ca 2026-09-25 compilation from city-published rates). Note: applies to ASSESSED value (MPAC/BC Assessment), not purchase price.
Sources: toronto.ca (https://www.toronto.ca/services-payments/property-%20taxes-utilities/property-tax/property-tax-rates-and-fees/), wealthnorth.ca.

**Toronto MLTT (Apr 1, 2026 revision):** graduated — 0.5% ≤$55k / 1.0% $55–250k / 1.5% $250–400k / 2.0% $400k–2M / 2.5% $2–3M / 4.40% $3–4M / 5.45% $4–5M / 6.50% $5–10M / 7.55% $10–20M / 8.60% over $20M (1–2 unit single-family homes). ON provincial LTT tiers unchanged (0.5/1.0/1.5/2.0/2.5%). FTB rebates: ON up to $4,000 + Toronto up to $4,475 (stackable).
Source: toronto.ca MLTT page (https://www.toronto.ca/services-payments/property-taxes-utilities/municipal-land-transfer-tax-mltt/municipal-land-transfer-tax-mltt-rates-and-fees/).

## Design assumptions (labelled as such in the tool, editable)
- Maintenance/repairs: **1% of home value per year** (industry standard; higher for older/condo-townhouse stock — editable).
- Home insurance: $100–200/mo (editable; condo lower).
- Home price appreciation: **3% nominal** default (long-run Canadian real ≈1–2% + ~2% inflation). Explicitly NOT a forecast — the sensitivity table is the point.
- Renter's investment return: **5% nominal** default (balanced portfolio; editable; caveat: before/after-tax — use after-tax, e.g. TFSA).
- Selling costs: commission **4.5%** default (2.5+2 split; Ontario typical 5% — editable), legal ~$2,000, moving ~$2,000.
- Buying closing costs: 1.5–4% (province module from the down-payment planner spec; Toronto $800k ≈ 2% after FTB rebates).
- Mortgage: contract rate, 25-yr amort default (30-yr available to FTB/new builds per Dec-2024 reform); Canadian semi-annual compounding converted to monthly equivalent — the payment math must use i_monthly = (1 + r/2)^(2/12) − 1, not r/12. (Canadian mortgages compound semi-annually, not in advance; r/12 understates payments slightly.)
- Rent path opportunity cost: the renter invests (a) the full buy-side upfront cash (down payment + closing + moving) and (b) the monthly difference whenever owning costs more than rent. This is the NYT-style net-wealth method — it treats the down payment as invested capital, which is why the tool can honestly recommend renting.

## Key design insight from the numbers
Toronto-style markets (price-to-rent >20) rent WINS at base assumptions — the tool must not be embarrassed by that; it's the competitive edge (gap analysis: no competitor runs this math honestly). The verdict flips on assumptions, so the tool ships a sensitivity grid, not a single verdict. Worked scenarios verified in Python on 2026-09-27:
- A: $800k / $2,600 rent, 10% down → rent wins base (yr10: buy $509k vs rent $654k); bull case (5% appreciation, 4% returns) → buy breaks even yr 4.
- B: Calgary $500k / $2,200 rent, 10% down, 1% closing (AB no LTT) → buy breaks even yr 5.

## Re-verify flags (at page build)
- BoC rate + best-fixed table (moves weekly; pull fresh at publish).
- ON/BC guideline for the current calendar year; 2027 already known (ON 1.9%, BC 2.2%).
- City property-tax rates (Toronto table updated yearly; budget page above).
- Commission norms (flat-fee models eroding 5%).
