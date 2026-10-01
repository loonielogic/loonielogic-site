# Calculator spec: Canadian income tax estimator (flagship tool)

Status: spec v1, drafted 2026-09-27. Figures verified vs official sources same day (see hidden_files/income-tax-estimator-research.md). Registered-account cluster complete; this is the flagship traffic tool that anchors the "learn → try" funnel (tax explainers → this tool).

## 1. Purpose and funnel position
- One-line promise: "Enter your income, province, and deductions — get your 2026 federal + provincial tax, take-home pay, and marginal tax rate in seconds."
- Position: top-traffic page candidate; gateway to explainers (TFSA/RRSP/FHSA basics), the TFSA-vs-RRSP decision tool, and affiliate comparison pages (e.g. "got a bonus? park it here" links).
- Two user modes in one tool: **Annual mode** (plan the year) and **Paycheque mode** (what hits my bank account each period). Annual mode ships first; paycheque mode is a second output view on the same engine, not a separate tool.

## 2. Inputs (all client-side, no accounts)
| Input | Type | Default | Notes |
|---|---|---|---|
| Province of residence (Dec 31) | select, 13 jurisdictions | Ontario | Drives provincial table + BPA + EI/QPIP + QC branch |
| Employment income | $ | 0 | T4-type |
| Self-employment net income | $ | 0 | Triggers self-employed branch (CPP/QPP ×2, no EI) |
| Other income (pension, rental, dividends, interest, capital gains) | $ + subtype flags | 0 | Dividends/capital gains get flagged as v1.5 — show warning "estimate uses ordinary-income rates; dividend gross-up not yet modelled" |
| RRSP contributions (planned/deductible) | $ | 0 | Line 20800; reduces taxable income. Links to RRSP room tracker spec |
| FHSA contributions | $ | 0 | Reduces taxable income; links to FHSA explainer |
| Union dues / professional dues | $ | 0 | Common, safe deduction |
| Age | number | 25 | Unlocks age amount (65+) and OAS clawback note (65+) |
| Pay frequency | select (weekly/biweekly/semi-monthly/monthly) | biweekly | Paycheque mode |
| TD1 claim amounts (federal + provincial) | $ prefill = BPA | BPA default | Paycheque-mode withholding accuracy; advanced toggle |
| CPP/QPP already contributed this year (YTD) | $ | 0 | Paycheque-mode cap tracking |
| EI/QPIP already paid YTD | $ | 0 | Same |

## 3. Calculation engine — Annual mode
### 3a. Taxable income
taxable = gross_income − rrsp − fhsa − union_dues (v1 scope; v1.5 adds pension splitting, capital gains inclusion rate, dividend gross-up)

### 3b. Federal tax (2026)
- Bracket walk on the 5 federal bands (14/20.5/26/29/33; thresholds 58,523 / 117,045 / 181,440 / 258,482).
- Credits v1: federal BPA $16,452 × 14% (= $2,303.28) when taxable ≤ $181,440; linear phase-down to $14,829 × 14% (= $2,076.06) at $258,482+ (linear interpolation between endpoints; verify against CRA TD1-WS during build).
- Quebec branch: federal tax computed, then × (1 − 0.165) abatement; QC taxable may differ from federal — v1 uses same taxable base and shows a note "QC return may differ slightly."

### 3c. Provincial tax (2026) — all 13 tables in research file
- Bracket walk on the selected province's bands (NL has 8 bands; note NS brackets indexed from 2026, MB frozen → bracket creep).
- Credits v1: provincial BPA × province's lowest rate (table in research file).
- Ontario: apply surtax — prov_tax × 1.20 on the portion above $5,818; × 1.56 total surtax on the portion above $7,446. Show surtax as its own line item (users hate mystery math). Health premium: add $0–$900 per Ontario table (income > $20,000; v1 uses the published income-to-premium table, exact lookup).
- NS: note enhanced-BPA treatment; v1 may use base amount with a flag.

### 3d. Payroll deductions (take-home view)
- Employee CPP: min(5.95% × max(0, min(income, 74,600) − 3,500), $4,230.45); CPP2: 4% × max(0, min(income, 85,000) − 74,600), cap $416. Self-employed: double (11.9% / 8%, caps $8,460.90 / $832) and no EI.
- QC: QPP 6.30% on $3,500–$74,600 (cap $4,479.30); QPP2 4% to $85,000 (cap $416).
- EI: outside QC 1.63% × min(income, 68,900), cap $1,123.07. QC: 1.30% (cap $895.70) + QPIP 0.430% × min(income, 103,000), cap $442.90. (Use the official canada.ca figures, not aggregator numbers — paystubpro's 0.455% is wrong.)
- v1 shows employee-side only; employer-cost toggle is v1.5.

### 3e. Outputs
- Federal tax, provincial tax (+ surtax line), total income tax, CPP/QPP, CPP2/QPP2, EI/QPIP, total deductions, take-home pay, average tax rate, marginal tax rate (next-dollar combined fed+prov), effective rate on take-home.
- "Your marginal tax rate is X%" callout with plain-language meaning ("your next $1,000 of income keeps $Y").
- What-if sliders: "Add $5k RRSP" and "Add $10k income" — recompute live; this is the funnel hook into the RRSP explainer and affiliate CTAs.
- 65+ users: OAS clawback note (15% above $95,323) when applicable.

## 4. Calculation engine — Paycheque mode
Per pay period (N periods/year), given gross pay P and YTD amounts:
1. cpp_due = min(max(0, 0.0595 × (ytd_gross + P − 3500 × periods_worked/N)), 4230.45) − cpp_ytd → floor at 0. CPP2/QPP2 analogous on the $74,600–$85,000 band. EI: min(0.0163 × P, 1123.07 − ei_ytd). QC variants per §3d.
2. Taxable annualized = (P − cpp − ei − qpip) × N − td1_federal_claims; run through federal bands; divide by N. Repeat provincially with provincial TD1.
3. Net pay = P − cpp − cpp2 − ei − qpip − fed_withheld − prov_withheld.
- State assumptions on screen: assumes steady pay all year, no other income, TD1 defaults; "verify against CRA PDOC — this is an estimate, not payroll advice." QC: note Revenu Québec source-deduction formulas are the authority.
- Edge: under-18 employees — CPP/QPP not deductible (flag input when age < 18); self-employed — no withholding, show estimated quarterly installment note.

## 5. Validation rules
- Income ≥ 0; province required; age 0–120; pay frequency required for paycheque mode.
- RRSP > 2026 room (default ceiling $33,810 or tracked-room value) → warning, not error ("exceeds this year's dollar limit — check your NOA").
- FHSA > $8,000 annual → hard warning (spec references FHSA spec).
- QC selected → swap every payroll constant to QC branch and show abatement note.
- Multiple income types → v1 sums; capital-gains/dividends show the v1.5 warning.

## 6. Results-screen spec
- Hero number: take-home pay (annual mode) or net per pay (paycheque mode).
- Breakdown bar: stacked horizontal (federal tax / provincial tax / CPP / EI / take-home) with $ and % labels.
- Table: line-by-line from gross to net, matching how a T1/pay stub reads — this builds trust.
- Marginal-rate ladder: "your next dollar is taxed at X%" plus province comparison teaser ("what if you lived in Alberta?" → cross-province toggle, cheap to compute, high engagement).
- CTA row: "Understand your rate" (marginal-vs-average explainer) · "Lower it with RRSP" (RRSP explainer + room tracker) · "Bonus coming?" (FHSA explainer).
- Disclaimer (always visible, small): estimate for education only; based on 2026 published rates; not tax advice; verify with CRA PDOC or an accountant. Legal/compliance spec (queue item 17) will finalize wording.

## 7. Data table maintenance
- All 2026 constants live in one versioned data file (tax-tables-2026.json), keyed by year + jurisdiction, with source URLs per table (research file §sources). New year = new file, not edits.
- Annual refresh task: re-verify every table against KPMG + TaxTips + CRA each December (flag for the recurring queue).

## 8. Known limits (state on page, don't hide)
- v1 taxes all income at ordinary rates — dividends/capital gains need gross-up/inclusion-rate modelling (v1.5).
- Non-residents, part-year residents, and multi-province workers get an approximation flag (v2).
- Federal BPA phase-down uses linear interpolation — verify against TD1-WS at build.
- QC taxable income may differ from federal base — flagged.

## 9. Test cases (must pass before ship)
- Ontario $100k employment: fed tax ≈ $17,992 (bracket walk on 58,523/117,045) − BPA credit $2,303.28; prov tax bracket walk on 53,891/107,785 + surtax; verify against a known calculator within $1.
- Alberta $200k: 6-band walk; BPA $22,769 × 8%.
- QC $75k: QPP $4,479.30 + QPP2 $29.60... wait: 4% × (75,000−74,600) = $16.00; EI 1.30% = $975 → cap fine; QPIP 0.430% × 75,000 = $322.50; federal abatement 16.5% applied.
- $60k biweekly ON: CPP per pay = 0.0595 × (2307.69 − 134.62) ≈ $129.29 until cap; EI ≈ $37.61 until $1,123.07.
- $300k ON: federal BPA at floor $14,829; marginal rate 53.53% (33% + 20.53% incl. surtax).

Research: hidden_files/income-tax-estimator-research.md (all figures + official sources, verified 2026-09-27).
