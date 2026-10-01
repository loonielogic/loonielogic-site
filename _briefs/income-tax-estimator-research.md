# Income tax estimator — research notes (2026-09-27)

Flagship calculator spec research. Every figure below re-verified 2026-09-27 against official or near-official sources. Prior work this project already verified: 2026 federal brackets (hidden_files/federal-tax-brackets-2026-research.md) and 2026 RRSP/FHSA/TFSA limits.

## Federal (2026) — verified vs CRA/KPMG June-30-2026 tables
- Brackets: 14% ≤ $58,523 · 20.5% ≤ $117,045 · 26% ≤ $181,440 · 29% ≤ $258,482 · 33% above. (14% first full year; 2025 was a 14.5% blend.)
- Basic personal amount: $16,452 max (net income ≤ $181,440), phases to $14,829 floor at $258,482+. Credit value = BPA × 14%.
- Donation credit: 14% on first $200; 29% (33% if income > $258,482) above.
- OAS recovery tax: 15% on income above $95,323 (from this project's item-10 research, verified across 6 sources).
- Indexation factor 2026: 2.0% (federal).

## Provincial brackets 2026 (all 13) — verified vs KPMG "Federal and Provincial/Territorial Income Tax Rates and Brackets for 2026" (current as of June 30, 2026)
- BC: 5.60% ≤ $50,363 · 7.70% ≤ $100,728 · 10.50% ≤ $115,648 · 12.29% ≤ $140,430 · 14.70% ≤ $190,405 · 16.80% ≤ $265,545 · 20.50% above. (2026 budget raised lowest rate from 5.06%.)
- AB: 8.00% ≤ $61,200 · 10.00% ≤ $154,259 · 12.00% ≤ $185,111 · 13.00% ≤ $246,813 · 14.00% ≤ $370,220 · 15.00% above. (Indexation capped at 2.0%.)
- SK: 10.50% ≤ $54,532 · 12.50% ≤ $155,805 · 14.50% above.
- MB: 10.80% ≤ $47,000 · 12.75% ≤ $100,000 · 17.40% above. (Brackets paused — no indexation since 2025; bracket creep active.)
- ON: 5.05% ≤ $53,891 · 9.15% ≤ $107,785 · 11.16% ≤ $150,000 · 12.16% ≤ $220,000 · 13.16% above. Surtax: +20% on provincial tax above $5,818; total 56% surtax on provincial tax above $7,446 (effective top provincial rate 20.53%). Health premium up to $900/yr for income > $20,000.
- QC: 14.00% ≤ $54,345 · 19.00% ≤ $108,680 · 24.00% ≤ $132,245 · 25.75% above. 16.5% federal tax abatement for QC residents; separate return; indexation 2.05%.
- NB: 9.40% ≤ $52,333 · 14.00% ≤ $104,666 · 16.00% ≤ $193,861 · 19.50% above.
- NS: 8.79% ≤ $30,995 · 14.95% ≤ $61,991 · 16.67% ≤ $97,417 · 17.50% ≤ $157,124 · 21.00% above. (Indexation began 2026, 1.6%.)
- PE: 9.50% ≤ $33,928 · 13.47% ≤ $65,820 · 16.60% ≤ $106,890 · 17.62% ≤ $142,250 · 19.00% ≤ $200,000 · 20.00% above. (No indexation; new 20% top bracket from Jan 1, 2026.)
- NL: 8.70% ≤ $44,678 · 14.50% ≤ $89,354 · 15.80% ≤ $159,528 · 17.80% ≤ $223,340 · 19.80% ≤ $285,319 · 20.80% ≤ $570,638 · 21.30% ≤ $1,141,275 · 21.80% above. (8 brackets; indexation 1.1%.)
- YT: 6.40% ≤ $58,523 · 9.00% ≤ $117,045 · 10.90% ≤ $181,440 · 12.80% ≤ $500,000 · 15.00% above.
- NT: 5.90% ≤ $53,003 · 8.60% ≤ $106,009 · 12.20% ≤ $172,346 · 14.05% above.
- NU: 4.00% ≤ $55,801 · 7.00% ≤ $111,602 · 9.00% ≤ $181,439 · 11.50% above.

## Provincial basic personal amounts 2026 — verified vs TaxTips.ca 2026 non-refundable credit table + TTI 2026 tax facts (both agree; CFIB/Wealthsimple corroborate AB/BC/ON)
| Prov | BPA 2026 |
|---|---|
| AB | $22,769 |
| BC | $13,216 |
| MB | $15,780 |
| NB | $13,664 |
| NL | $11,188 |
| NS | $11,932 |
| NT | $18,198 |
| NU | $19,659 |
| ON | $12,989 |
| PE | $15,000 |
| QC | $18,952 |
| SK | $20,381 |
| YT | $14,829 |
Credit value = BPA × province's lowest bracket rate. NS has an enhanced-BPA analogue; QC uses its own formula.

## CPP / QPP / EI / QPIP 2026 — verified vs official
- CPP (canada.ca official table): YMPE $74,600 · exemption $3,500 · rate 5.95% · max employee/employer $4,230.45 · self-employed 11.9% / $8,460.90.
- CPP2 (canada.ca): YAMPE $85,000 · 4% on $74,600–$85,000 · max $416 each · self-employed 8% / $832.
- QPP (Revenu Québec official): rate 6.30% (5.3% base + 1.0% additional) · MPE $74,600 · exemption $3,500 · max employee/employer $4,479.30 · self-employed 12.6% / $8,958.60. QPP2: 4% on $74,600–$85,000, max $416. (Note: some aggregators misreport $3,768.30 — that is only the base-plan 5.3% slice; the true rate is 6.30%.)
- EI (canada.ca T4032 2026): MIE $68,900 · outside-QC rate 1.63% / max $1,123.07 · QC rate 1.30% / max $895.70. Employer = 1.4× employee rate.
- QPIP (canada.ca T4032QC 2026 — authoritative; overrides third-party aggregators): MIE $103,000 · employee 0.430% / max $442.90 · employer 0.602% / max $620.06. (paystubpro.ca's 0.455%/$468.65 contradicts the official table — do NOT use.)
- QC health contribution: Quebec residents pay the Health Services Fund contribution via Revenu Québec (payroll-level; employer-side mostly — flag in spec as Quebec payroll nuance).

## Withholding mechanics (for spec's paycheque mode)
- CRA payroll withholding (T4127 Formulas for calculating deductions; T4032 payroll deduction tables; T4001 guide): employers withhold per pay period using annualized estimates and the employee's TD1/TD1AB (federal + provincial personal credit claims). Per-pay CPP/EI use YTD cap tracking. Federal/provincial income-tax withholding is computed on (annualized gross − CPP/QPP − EI/QPIP deductions), reduced by claimed TD1 credits, run through the rate tables, then divided by pay periods. QC uses Revenu Québec source-deduction formulas instead.
- CRA's Payroll Deductions Online Calculator (PDOC) is the public reference implementation of these rules.

## Sources (checked 2026-09-27)
- KPMG "Federal and Provincial/Territorial Income Tax Rates and Brackets for 2026" (current June 30, 2026) — https://assets.kpmg.com/content/dam/kpmgsites/ca/pdf/services/tax/personal-tables/ca-federal-and-provincial-territorial-income-tax-rates-and-brackets-for-2026.pdf.coredownload.inline.pdf
- TaxTips.ca 2026 non-refundable personal tax credit amounts — http://www.taxtips.ca/nrcredits/tax-credits-2026.htm
- Tax Templates Inc. 2026 tax facts workbook — https://files.ttiworksheets.ca/2026-Tax-Facts-and-Tables-provided-by-TTI.pdf
- canada.ca CPP contribution rates, maximums and exemptions — https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html
- canada.ca 2026 payroll deductions tables (QC EI/QPIP) — https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032qc-jan/t4032qc-january-general-information.html
- Revenu Québec QPP MPE and contribution rate 2026 — https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/calculating-source-deductions-and-contributions/qpp-contributions/maximum-pensionable-earnings-and-contribution-rate/
- RRQ 2026 QPP figures — http://www.rrq.gouv.qc.ca/en/programmes/regime_rentes/regime_chiffres/Pages/regime_chiffres.aspx
- Investment Executive "Essential tax numbers: Updated for 2026" — https://www.investmentexecutive.com/industry-news/essential-tax-numbers-updated-for-2026/
- CFIB payroll deduction tables 2026 (QPP rate and QC BPA corroboration) — https://www.cfib-fcei.ca/en/tools-resources/payroll-deduction-tables
- Investment Executive CRA CPP 2026 announcement — https://www.investmentexecutive.com/news/cra-announces-cpp-maximum-pensionable-earnings-for-2026/
- Wealthsimple ON + BC 2026 tax pages (ON BPA $12,989; BC BPA $13,216) — https://www.wealthsimple.com/en-ca/learn/ontario-tax-brackets · https://www.wealthsimple.com/en-ca/learn/bc-tax-brackets
