# Successes in Coding

A running log of wins, breakthroughs, and things that shipped.

---

## PlanForge Advisor Panel V3
**Date:** February 2026
**Status:** Shipped

Built a full-featured 401(k) plan design and illustration tool — entirely in a single HTML file — that:

- **Cross-tests profit sharing allocations** in real time, finding the maximum owner allocation that passes IRS §401(a)(4) nondiscrimination testing
- **Computes SECURE 2.0 tax credits** (years 1-5 sliding scale) with proper eligibility rules
- **Models forfeitures** from actual departed employees AND estimated future turnover, with 3-year cliff vesting
- **Generates print-ready PDF illustrations** with owner/employee breakdowns, net cost analysis, and compliance footnotes
- **Runs a participant-facing view** with scenario sliders so prospects can see savings at different contribution rates
- **Passes a 29-test automated suite** covering edge cases like single-employee plans, gateway vs. cross-tested allocations, and mixed HCE/NHCE groups

The whole thing runs client-side with zero dependencies. No server, no framework, no build step. Just open the HTML file.

### Key Fixes (Feb 28, 2026)
- Fixed forfeiture engine not flowing departed employee data into what-if scenarios
- Fixed safe harbor rate labels showing below-minimum rates (2% when IRS min is 3%)
- Cleaned up misleading "same rate as safe harbor" copy in two separate rendering paths
- Full audit confirmed no remaining display or computation inconsistencies

---

*Add new entries above this line.*
