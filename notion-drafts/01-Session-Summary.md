# PlanForge Advisor Panel V3 — Full Session Summary

*Last updated: March 4, 2026*

---

## Phase 1: Performance & Foundation (Early Feb 2026)

### Advisor Panel Performance
- Debounced recalculation engine and added census caching to eliminate UI lag
- Optimized binary search convergence for cross-testing and added CSS containment for smoother rendering
- Improved questionnaire and illustration builder correctness

### Core Engine Fixes
- Fixed SECURE 2.0 credit employer size phase-down (50–100 employee edge case)
- Fixed forfeiture vesting, age validation, error display, and questionnaire submission
- Fixed cross-testing additional owner rates and added §416 top-heavy test
- Fixed FICA comment, SECURE credit count, §404 deduction limit, and questionnaire bugs
- Fixed calculator crash from `deductionLimit404` being used before definition

---

## Phase 2: Real Client Scenarios & Plan Design Modes (Mid Feb 2026)

### Real Client Scenarios
- Added AlphaGraphics and Team North Texas as built-in presets with real census data
- Fixed vesting: AlphaGraphics $0 forfeitures, Team North Texas $9,000
- Plan-specific forfeitures: standard vs optimized comparison with correct vesting schedules

### Plan Design Modes
- **Maximize mode:** Auto-finds lowest NHCE rate that maximizes owner allocation; decoupled standard rate from optimized NHCE rate
- **Gateway mode:** Added Std Rate control synced across all tabs; fixed custom mode gateway to run actual cross-testing instead of assuming 3×
- **Custom mode:** Fixed AlphaGraphics to use custom mode to prevent maximize from overriding 5% rate
- Fixed allocation mismatch by adding per-owner `allocRate` for cross-testing
- Fixed cross-test ABT bug, rate locking, and owner display

### Census & Forfeiture Engine
- Added census date parsing, safe harbor forfeiture rules, and dual forfeiture display (estimated + real)
- Fixed safe harbor vesting: apply 3% floor to Typical plan only, not PlanForge plans
- Used individual employee data for ALL calculations when census exists (replaced synthetic averages)
- Fixed SECURE 2.0 tax credit calculation to use individual employee salaries

---

## Phase 3: Participant View & Integrations (Late Feb 2026)

### Participant View
- Built interactive participant-facing view with clickable what-if rate scenarios
- Added forfeiture display (estimated + real) to participant view
- Moved Copy Embed HTML button into the participant view page itself
- Fixed script tag leak and added client scenario tickers

### Embed & Distribution
- Added Copy Embed HTML button for embedding illustrations on webpages
- Show each owner's individual compensation in illustrations
- Show cross-tested rate on optimized Total Profit Share label

### External Integrations
- Google Sheets integration for questionnaire results (Apps Script deployment)
- Added Advisor Panel JSON column to Google Sheets integration
- Connected Zapier webhook and fixed Cal.com company prefill / booking URLs

### Visual Polish
- Modernized questionnaire with visual refresh and cross-platform fonts
- Polished input fields and panels for a modern, rounded look
- SECURE net benefit warning and questionnaire UX improvements

### Automated Testing
- Built 25-scenario (later 29-scenario) automated test suite with cross-testing validation
- Added .gitignore and package files for test runner

---

## Phase 4: Forfeiture Flow-Through & Safe Harbor Fixes (Feb 28, 2026)

### Forfeiture Engine — Flow-Through Fix
**Problem:** What-if scenarios zeroed out `departedIndices`, making forfeitures vanish from every scenario except the default.
**Fix:** Removed `departedIndices: []` overrides so departed employee data flows through to all scenarios.

### Safe Harbor Rate Floor — Display Fix
**Problem:** "Typical Strategy" labels showed raw `stdRate` (e.g., 2%) even though IRS minimum is 3%.
**Fix:** Applied `Math.max(3, ...)` floor to all display labels in the illustration PDF and participant view.

### "Same Rate as Safe Harbor" — Misleading Text
**Fix:** Removed comparison phrase from both the illustration PDF and participant view rendering paths.

---

## Phase 5: Per-Employee Controls & UX Refinements (Mar 2026)

### Per-Employee Exclusion Controls
- Added per-employee exclusion checkboxes to census/departure table (replaced blind first-N exclusion)
- Upgraded to **independent Std/Opt exclusion columns** — full control over which employees are in each plan
- Engine now tracks `excludedEmployeeIndices` and `stdExcludedEmployeeIndices` separately
- Forfeitures respect per-plan exclusions: departed employees only generate forfeitures for plans they're actually in
- AlphaGraphics preset updated with correct exclusion sets for both plans

### 7-Bug Fix Batch
- Standard plan now includes non-owner HCE compensation in total PS, employee PS, and net cost (was understating standard plan cost)
- §280C compliance check now correctly applies §404(a)(3) deduction cap
- Typical baseline includes HCE comp and applies deduction cap to tax savings
- Departure checkbox selector fixed (wrong class and data attribute)
- Cross-test EBAR `.toFixed()` optional chaining gap fixed
- SECURE credit alert shows `totalEmployeesForSize` for employer size test
- Collapsed identical LLC/S-Corp FICA branches

### Rate Input Improvements
- Finer percentage granularity: 0.01% step for all rate inputs
- 0.25% step increments for standard rate benchmark
- Up/down stepper arrows on Std Rate inputs across all three plan design tabs
- What-if scenarios show rates at 1% increments centered on current stdRate

### Verification Suite Fix
- Cross-verification failures (panel vs independent engine mismatches) now display as visible FAIL rows in the main verification list
- Fixed `verifyIndependent()` not checking `!emp.stdExcluded` for forfeiture computation

### Participant View Fixes
- Fixed Copy Embed HTML button using 3-tier clipboard approach (clipboard API → execCommand → new tab fallback)
- Fixed rendering bug: escaped newline in template literal was breaking generated JavaScript, leaving all card data empty

---

## Test Results
**29 passed | 0 failed** across all scenarios

## Branch
All pushed to `claude/improve-advisor-panel-performance-WcOwA`
Total: **57 commits** on this branch
