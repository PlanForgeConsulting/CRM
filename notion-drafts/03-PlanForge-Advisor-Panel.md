# PlanForge Advisor Panel V3

## What It Is

A single-file, zero-dependency 401(k) plan design engine that lets retirement plan advisors show business owners — in real time — exactly how much money they're leaving on the table with a typical safe harbor plan.

You open one HTML file. You paste in a census. You get a full illustration with IRS-compliant nondiscrimination testing, SECURE 2.0 credit modeling, forfeiture projections, and a print-ready PDF. No server. No login. No build step.

## Why It's Impressive

### It does real actuarial math in the browser
This isn't a calculator with a few formulas. It runs iterative §401(a)(4) cross-testing — the same general-test methodology that TPAs use — to find the maximum owner allocation that passes nondiscrimination. It handles gateway determinations, rate group testing, average benefits percentage checks, and the 70% coverage ratio. All in JavaScript, all instant.

### It models the full economic picture
- **Gross cost** (what you contribute)
- **Tax deductions** (federal + state, with proper marginal rate handling)
- **SECURE 2.0 credits** (5-year sliding scale with headcount eligibility)
- **FICA savings** (employer-side payroll tax reduction on deferrals)
- **Forfeitures** — both from actual departed employees (by name, with vesting schedules) and projected future turnover at configurable rates
- **Net cost** — what the plan actually costs after everything

Most advisors can only show gross cost. This shows the full picture, which is how plans end up "paying for themselves."

### The what-if engine is genuinely useful
Advisors can slide between 1-5% NHCE rates and instantly see how net cost, owner retirement, and savings change. The participant view gives prospects the same power. Every scenario runs the full computation — there's no interpolation or approximation.

### It's one file
~5,000 lines of HTML/CSS/JS. No React. No Webpack. No npm install. It works on any machine, offline, forever. You can email it as an attachment. You can open it on a plane. It prints to PDF natively.

### It handles the edge cases
- Single-employee S-corps (no NHCE = no discrimination test needed)
- Gateway plans with flat dollar amounts
- Mixed owner/non-owner HCE groups
- Plans where the "optimized" allocation would actually cost more (it warns you)
- 29 automated tests covering all of the above

## The Business Impact

A typical advisor meeting goes like this: "Here's what a safe harbor costs. Here's what we recommend." It's a flat number, no context, no comparison.

With PlanForge, the conversation becomes: "Here's what you're currently paying with a typical plan. Here's what you'd pay with our design. Here's the difference — and here's exactly where the savings come from." The advisor looks like a genius. The business owner sees real numbers. The plan sells itself.

That's what this tool does. It turns a commodity product into a consultative sale with hard dollar proof.
