# Successes in Coding

A running log of wins, breakthroughs, and things that shipped.

---

## PlanForge Advisor Panel V3
**Date:** February–March 2026
**Status:** Shipped (57 commits, actively refined)

Built a full-featured 401(k) plan design and illustration tool — entirely in a single HTML file — that:

- **Cross-tests profit sharing allocations** in real time, finding the maximum owner allocation that passes IRS §401(a)(4) nondiscrimination testing
- **Computes SECURE 2.0 tax credits** (years 1-5 sliding scale) with proper eligibility rules and individual salary calculations
- **Models forfeitures** from actual departed employees AND estimated future turnover, with 3-year cliff vesting and per-plan exclusion awareness
- **Generates print-ready PDF illustrations** with owner/employee breakdowns, net cost analysis, and compliance footnotes
- **Runs a participant-facing view** with clickable what-if rate scenarios so prospects can see savings at different contribution rates
- **Embeddable:** Copy Embed HTML button generates a standalone page advisors can host on their website
- **Passes a 29-test automated suite** covering edge cases like single-employee plans, gateway vs. cross-tested allocations, and mixed HCE/NHCE groups
- **Integrates with Google Sheets + Zapier** to capture questionnaire leads automatically
- **Per-employee exclusion controls** — independent Std/Opt checkboxes give full control over who is in each plan

The whole thing runs client-side with zero dependencies. No server, no framework, no build step. Just open the HTML file.

### Highlights by Phase

**Foundation (Early Feb)**
- Debounced recalc, census caching, binary search optimization for buttery-smooth UI
- Fixed SECURE 2.0 credit phase-down, §416 top-heavy test, §404 deduction limit

**Real Client Scenarios (Mid Feb)**
- AlphaGraphics and Team North Texas presets with real census data
- Three plan design modes: Maximize, Gateway, Custom — each with correct cross-testing
- Census date parsing, dual forfeiture display, individual employee calculations

**Participant View & Integrations (Late Feb)**
- Interactive participant view with what-if scenarios and forfeiture display
- Google Sheets integration (Apps Script), Zapier webhook, Cal.com booking
- Visual refresh: modern inputs, rounded panels, cross-platform fonts

**Precision Controls (Mar)**
- Per-employee Std/Opt exclusion checkboxes replacing blind first-N exclusion
- 7-bug fix: HCE comp in standard plan, §280C compliance, EBAR chaining, FICA dedup
- 0.25% stepper arrows on Std Rate, 1% what-if increments, fine percentage granularity
- Verification suite now surfaces cross-verify failures as visible FAIL rows
- Participant view clipboard fix (3-tier approach) and template literal rendering fix

---

*Add new entries above this line.*
