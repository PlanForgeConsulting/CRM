# PlanForge Advisor Panel V3

*Last updated: March 4, 2026 — 57 commits shipped*

## What It Is

A single-file, zero-dependency 401(k) plan design engine that lets retirement plan advisors show business owners — in real time — exactly how much money they're leaving on the table with a typical safe harbor plan.

You open one HTML file. You paste in a census. You get a full illustration with IRS-compliant nondiscrimination testing, SECURE 2.0 credit modeling, forfeiture projections, and a print-ready PDF. No server. No login. No build step.

## Why It's Impressive

### It does real actuarial math in the browser
This isn't a calculator with a few formulas. It runs iterative §401(a)(4) cross-testing — the same general-test methodology that TPAs use — to find the maximum owner allocation that passes nondiscrimination. It handles gateway determinations, rate group testing, average benefits percentage checks, and the 70% coverage ratio. All in JavaScript, all instant.

### Three plan design modes
- **Maximize** — auto-finds the lowest NHCE rate that maximizes owner allocation
- **Gateway** — flat employer match with gateway determination
- **Custom** — full manual control with real cross-testing (not an approximation)

Each mode runs the full compliance engine. Switch between them and the numbers update instantly.

### It models the full economic picture
- **Gross cost** (what you contribute)
- **Tax deductions** (federal + state, with proper marginal rate handling and §404(a)(3) deduction cap)
- **SECURE 2.0 credits** (5-year sliding scale with headcount eligibility, calculated from individual employee salaries)
- **FICA savings** (employer-side payroll tax reduction on deferrals)
- **Forfeitures** — both from actual departed employees (by name, with vesting schedules) and projected future turnover at configurable rates. Per-plan exclusion aware: departed employees only generate forfeitures for plans they're actually in
- **Net cost** — what the plan actually costs after everything

Most advisors can only show gross cost. This shows the full picture, which is how plans end up "paying for themselves."

### Per-employee precision
When you paste in a census, every calculation uses individual employee data — compensation, age, hire date, HCE status, departure status. No more synthetic averages. You control exactly which employees are in each plan with independent Std/Opt exclusion checkboxes per row.

### The what-if engine is genuinely useful
Advisors see rate scenarios at 1% increments centered on the current standard rate, with instant recalculation of every metric. The participant view gives prospects the same power with clickable scenario cards. Every scenario runs the full computation — there's no interpolation or approximation.

### It's embeddable
Hit "Copy Embed HTML" and you get a standalone page — complete with styled cards, scenario sliders, and a "How it works" breakdown — that advisors can host on their website or email to prospects. Works on blob: URLs with a 3-tier clipboard fallback.

### It integrates with your workflow
- **Google Sheets** — questionnaire responses flow directly into a spreadsheet via Apps Script
- **Zapier** — webhook captures form submissions for CRM routing
- **Cal.com** — booking links pre-fill company name from the questionnaire
- **JSON export/import** — save and reload any scenario, including per-employee exclusions and departure data

### It's one file
~5,000+ lines of HTML/CSS/JS. No React. No Webpack. No npm install. It works on any machine, offline, forever. You can email it as an attachment. You can open it on a plane. It prints to PDF natively.

### It handles the edge cases
- Single-employee S-corps (no NHCE = no discrimination test needed)
- Gateway plans with flat dollar amounts
- Mixed owner/non-owner HCE groups
- Plans where the "optimized" allocation would actually cost more (it warns you)
- §416 top-heavy test
- §280C compliance with §404(a)(3) deduction cap
- Non-owner HCE compensation correctly included in standard plan costs
- SECURE 2.0 credit phase-down for 50–100 employee companies
- 29 automated tests covering all of the above

### Verification suite
A built-in verification panel runs an independent computation engine against the main panel's results. Any mismatch shows as a visible FAIL with exact values. Cross-verification failures are no longer hidden — they surface in the main test list.

## The Business Impact

A typical advisor meeting goes like this: "Here's what a safe harbor costs. Here's what we recommend." It's a flat number, no context, no comparison.

With PlanForge, the conversation becomes: "Here's what you're currently paying with a typical plan. Here's what you'd pay with our design. Here's the difference — and here's exactly where the savings come from." The advisor looks like a genius. The business owner sees real numbers. The plan sells itself.

That's what this tool does. It turns a commodity product into a consultative sale with hard dollar proof.

## Tech Stack
- **Runtime:** Pure client-side JavaScript (no dependencies, no build step)
- **Rendering:** Vanilla DOM manipulation + CSS containment for performance
- **PDF:** Native browser print with custom print stylesheet
- **Testing:** 29-scenario test suite with Node.js runner
- **Integrations:** Google Sheets Apps Script, Zapier webhook, Cal.com
- **Performance:** Debounced recalculation, census caching, optimized binary search convergence
