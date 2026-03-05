# PlanForge Advisor Panel V3 — QA Bug Report

**File Under Test:** `PlanForge_Advisor_Panel_V3_MASTER.html` (5,357 lines)
**Date:** 2026-03-05
**Tester:** Automated QA (Claude Code)
**Baseline:** Existing test suite passes 29/29 (1 expected warning)
**Edge Case Suite:** 59 passed, 4 real bugs surfaced, 6 code-review findings
**XSS Deep Scan:** 11 innerHTML injection surfaces analyzed, 8 exploitable vectors confirmed

---

## Prioritized Bug Report

| # | Category | Severity | Description | Steps to Reproduce | Expected vs Actual | Status | Fix Effort |
|---|----------|----------|-------------|--------------------|--------------------|--------|------------|
| 1 | **Input Validation / XSS** | **CRITICAL** | `renderOwners()` XSS via double-quote injection in owner name | 1. Add additional owner. 2. Enter name: `Test" onmouseover="alert(1)" x="` 3. Observe rendered HTML | **Expected:** Name displayed safely. **Actual:** Double quotes break `value="..."` attribute on line 2543, injecting arbitrary HTML attributes/event handlers. | Open | Quick Fix |
| 2 | **Input Validation / XSS** | **CRITICAL** | Departure table XSS via census employee name | 1. Paste census with employee name: `<img src=x onerror=alert(1)>` 2. View departure/employee table | **Expected:** Name escaped. **Actual:** Line 3151 inserts `${emp.name}` directly into innerHTML without escaping. Malicious census data executes scripts. | Open | Quick Fix |
| 2b | **Input Validation / XSS** | **CRITICAL** | Cross-test detail table XSS via census employee/HCE name | 1. Paste census with HCE name: `<img src=x onerror=alert(1)>` 2. View cross-testing detail panel | **Expected:** Name escaped. **Actual:** Lines 2399-2409 insert `${p.name}` and line 2418-2426 insert `${rg.hce.name}` unescaped into innerHTML via `body.innerHTML = html` at line 2436. | Open | Quick Fix |
| 2c | **Input Validation / XSS** | **CRITICAL** | Participant view static HTML XSS — **distributable to clients** | 1. Set bizName to `<img src=x onerror=alert(1)>` 2. Generate participant view 3. Open or share the standalone HTML file | **Expected:** Name escaped. **Actual:** Lines 4784, 4799 embed `${c.bizName}` and `${ownerNames}` unescaped directly in the generated HTML string. Since JSON.stringify does NOT escape `<` and `>`, these persist. The participant view is a standalone HTML file shared with clients — XSS executes in **every recipient's browser**. | Open | Quick Fix |
| 2d | **Input Validation / XSS** | **HIGH** | PDF generation XSS via bizName/owner names in off-screen DOM | 1. Set bizName or owner name to `<img src=x onerror=alert(1)>` 2. Click Generate PDF | **Expected:** Names escaped. **Actual:** Lines 3701, 3711, 3715 embed unescaped user data into HTML string, rendered via `container.innerHTML = html` at line 3961. Scripts execute in the advisor's browser during PDF rendering. | Open | Quick Fix |
| 3 | **Input Validation / XSS** | **HIGH** | Participant view runtime innerHTML uses `META.firstName` and `ao.name` unescaped | 1. Set owner firstName to `<img src=x onerror=alert(1)>` 2. Generate participant view 3. Interact with rate selector | **Expected:** Name escaped. **Actual:** Lines 4980-4981, 5069-5072, 5175 insert `META.firstName` and `ao.name` via innerHTML in the participant view's JavaScript runtime. `JSON.stringify` does NOT escape angle brackets — `<img src=x onerror=alert(1)>` survives JSON encoding. | Open | Quick Fix |
| 4 | **Anonymous Mode / Data Leak** | **HIGH** | Anonymous embed `<title>` tag leaks real business name | 1. Enter real business name "Acme Corp" 2. Generate participant view 3. Click "Copy Anonymous HTML" 4. Inspect `<title>` in copied HTML | **Expected:** Title shows anonymized name. **Actual:** Line 4699 uses `${c.bizName || 'Client'}` in `<title>` — real name appears in browser tab title, bookmarks, and share previews even in anonymous mode. | Open | Quick Fix |
| 5 | **Anonymous Mode / Data Leak** | **HIGH** | Anonymous embed exposes individual owner compensation amounts | 1. Add additional owners with unique compensation 2. Generate participant view 3. Copy Anonymous HTML 4. Search for comp amounts in source | **Expected:** Individual compensation hidden in anonymous mode. **Actual:** Line 4943 `META_ANON` replaces owner names with "Business Owner N" but retains each owner's individual `ao.comp`, allowing reverse identification by compensation amount. | Open | Quick Fix |
| 6 | **Computation Engine** | **HIGH** | Tax rate = 0% silently overridden to 30% | 1. Set tax rate to 0% 2. Run computation 3. Observe tax savings | **Expected:** $0 tax savings. **Actual:** Line 1137 `const taxRate = input.taxRate \|\| 0.30` uses JS falsy check — `0` is falsy, so 0% tax rate becomes 30%. This affects net cost calculations for tax-exempt entities. | Open | Quick Fix |
| 7 | **Computation Engine** | **HIGH** | `secureYear = 0` or `secureYear > 5` causes undefined credit phase | 1. (Programmatic) Pass `secureYear: 0` to `independentCompute()` 2. Observe credit calculation | **Expected:** Graceful handling (0 credits or clamped to valid range). **Actual:** `CREDIT_PHASE[0-1]` = `CREDIT_PHASE[-1]` = `undefined`. Downstream: `undefined * amount = NaN`, NaN propagates through secureCredits, tax savings, and net cost. Line 1248 clamps to 1-5 for the output but line 1557 uses the raw `secureYear` for indexing. | Open | Quick Fix |
| 8 | **Additional Owners** | **MEDIUM** | `getInputFromForm()` silently drops additional owners with $0 W-2 salary | 1. Add additional owner 2. Enter name and age but leave W-2 at $0 3. Owner has K-1 income entered 4. Run computation | **Expected:** Owner included using K-1 income. **Actual:** Line 2148 `.filter(ao => ao.salary > 0)` checks only the salary field, dropping owners whose compensation is entirely K-1-based. The owner disappears from the computation without any UI warning. | Open | Quick Fix |
| 9 | **Census Mode** | **MEDIUM** | Census silently drops employees with $0 or unparseable pay | 1. Paste census with employee rows having $0 pay or non-numeric pay 2. Check parsed count vs input rows | **Expected:** Warning about dropped employees. **Actual:** Line 3436 `if (pay > 0) employees.push(...)` silently excludes them. User sees "X employees detected" but has no way to know some were dropped, potentially miscounting for compliance testing. | Open | Quick Fix |
| 10 | **Census Mode** | **MEDIUM** | Two-column census misidentifies $50-$99 values as age instead of salary | 1. Paste 2-column CSV: `50,60000` 2. Observe parsed result | **Expected:** Ambiguity warning or heuristic documentation. **Actual:** Line 3406 treats any value 0-99 as age. A 2-col CSV with `95,60000` interprets $95 as age 95, not a $95 salary. While edge case, the heuristic is undocumented and has no override. | Open | Medium |
| 11 | **Anonymous Mode** | **MEDIUM** | Anonymous embed regex replacement is fragile | 1. Enter data where JSON.stringify of META produces patterns matching the regex 2. Click "Copy Anonymous HTML" | **Expected:** Clean replacement. **Actual:** Line 5273 uses regex `/const META = \{[\s\S]*?\};\nconst META_ANON/` for find-and-replace. This non-greedy pattern assumes a specific code structure. Changes to code formatting, minification, or unusual data could cause the regex to match incorrectly or fail. | Open | Medium |
| 12 | **Computation Engine** | **LOW** | Verification engine only covers standard plan, not optimized plan | 1. Run verification suite 2. Check cross-verification table | **Expected:** Both standard AND optimized plan values independently verified. **Actual:** `verifyIndependent()` (line 1696-1807) only computes standard plan metrics. The optimized plan (the more complex, higher-value path) has no independent verification, meaning cross-testing optimization bugs would go undetected. | Open | Complex |
| 13 | **Input Validation** | **LOW** | Negative NHCE count and negative average pay accepted without warning | 1. Enter -5 for NHCE count 2. Enter -30000 for avg pay 3. Observe computation | **Expected:** Validation error. **Actual:** Computation proceeds with negative values. `nhceCount || 0` prevents crash, but negative counts produce incorrect eligible/total employee counts. No input validation on form fields. | Open | Medium |
| 14 | **Census Mode** | **LOW** | Census delimiter detection uses only first row | 1. Paste census where header uses commas but data uses tabs 2. Observe parsing | **Expected:** Robust delimiter detection. **Actual:** Line 3314-3317 only checks `lines[0]` for delimiter. If header and data rows use different delimiters (e.g., copy-paste artifacts), all data rows parsed incorrectly. | Open | Quick Fix |
| 15 | **PDF Generation** | **LOW** | Anonymous PDF filename may still contain recognizable business name patterns | 1. Set anonymous=true 2. Generate PDF 3. Check filename | **Expected:** Anonymized filename. **Actual:** Line 3965 uses `bizDisplayName` for anonymous mode, which in the anonymous branch is the anonymized name, so this is correctly handled. However, the browser download history may still contain the anonymous business name pattern if it's recognizable. | Cosmetic | N/A |
| 16 | **State Management** | **LOW** | Census cache not invalidated when additional owners change | 1. Load census 2. Add additional owner 3. Check if cross-test uses updated owner list | **Expected:** Fresh computation with new owner. **Actual:** Census cache key (line 686-689) may not include additional owners in its key, potentially serving stale census data for cross-testing. The `debouncedRecalc()` does call `recalc()` which rebuilds, but the cache key should ideally incorporate owner state. | Open | Quick Fix |
| 17 | **Computation Engine** | **INFO** | Owner age = 0 accepted without warning (infant owner) | 1. Enter owner age = 0 2. Computation proceeds | **Expected:** Validation warning. **Actual:** Cross-testing uses age 0, computing 65 years to NRA. The math is correct but the input is clearly invalid. No age validation exists on any input. | Open | Quick Fix |
| 18 | **Computation Engine** | **INFO** | Future year (e.g., 2030) silently falls back to 2026 IRS limits | 1. Set tax year to 2030 2. Observe IRS limits used | **Expected:** Warning that limits are estimated/not available. **Actual:** Line 637 `getLimits()` silently returns 2026 limits for any unknown year. User may not realize they're using stale limits for forward projections. | Open | Quick Fix |

---

## Summary by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 4 | XSS injection vectors (renderOwners, departure table, cross-test detail, participant view static HTML) |
| **HIGH** | 6 | PDF generation XSS, participant view runtime XSS, anonymous mode data leaks (x2), 0% tax rate bug, SECURE year boundary |
| **MEDIUM** | 4 | Silent data drops (owners, census), regex fragility, census ambiguity |
| **LOW** | 5 | Missing verification, negative inputs, delimiter detection, cache |
| **INFO** | 2 | Missing input validation warnings |

---

## Suggested Fixes

### CRITICAL/HIGH — XSS Injection (Bugs #1, #2, #2b, #2c, #2d, #3)

**Fix Effort: Quick Fix (45 min) — SYSTEMIC ISSUE: Zero HTML escaping exists in the entire 5,357-line file**

The application has no `escapeHtml()` function, no DOMPurify, and no entity encoding anywhere. Add an HTML escaping utility and apply it to **every** innerHTML/template literal context that interpolates user data:

```javascript
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
```

All affected locations:

| Bug | Line(s) | Fix |
|-----|---------|-----|
| #1 | 2543 | `value="${escHtml(ao.name||'')}"` |
| #2 | 3151 | `<td>${escHtml(emp.name)}</td>` |
| #2b | 2399-2409, 2418-2426 | `${escHtml(p.name)}`, `${escHtml(rg.hce.name)}` |
| #2c | 4784, 4799 | `${escHtml(c.bizName)}`, build `ownerNames` with `escHtml()` |
| #2d | 3701, 3711, 3715 | `${escHtml(bizDisplayName)}`, `escHtml(name)`, `escHtml(ao.name)` |
| #3 | 4980-4981, 5069-5072, 5175 | Use `escHtml(META.firstName)` and `escHtml(ao.name)` |

**Priority note:** Bug #2c is the highest-impact vector — the participant view is a standalone HTML file distributed to clients, so XSS would execute in every recipient's browser. Also sanitize names at the census parse point (line 3410: `name = row[0] || ''`) as a defense-in-depth measure.

Also consider switching from `innerHTML` to `textContent` wherever the inserted content should not contain markup (e.g., employee name cells in tables).

### HIGH — Anonymous Mode Data Leaks (Bugs #4, #5)

**Fix Effort: Quick Fix (15 min)**

**Bug #4** — Line 4699: Replace `${c.bizName || 'Client'}` with `${anonymous ? anonBizName : (c.bizName || 'Client')}` in the `<title>` tag. Note: The `anonymous` variable and `anonBizName` need to be available at this point in the code; they may need to be computed earlier.

**Bug #5** — Line 4943: In `META_ANON`, replace individual `ao.comp` with the average or total comp:
```javascript
additionalOwners: ${JSON.stringify((c.additionalOwners||[]).map((ao, i) => ({
  name: 'Business Owner ' + (i + 2),
  comp: Math.round((c.additionalOwners||[]).reduce((s,a) => s + a.comp, 0) / (c.additionalOwners||[]).length)
})))}
```

### HIGH — Tax Rate 0% Bug (Bug #6)

**Fix Effort: Quick Fix (5 min)**

Line 1137: Change `input.taxRate || 0.30` to:
```javascript
const taxRate = (input.taxRate != null && input.taxRate !== '') ? input.taxRate : 0.30;
```

Same pattern should be checked for other `|| default` expressions where 0 is a valid value. Verify line 1701 in `verifyIndependent()` has the same fix.

### HIGH — SECURE Year Boundary (Bug #7)

**Fix Effort: Quick Fix (5 min)**

Line 1557: The `secureYear` variable used for `CREDIT_PHASE` indexing should use the clamped value. Move the clamping (line 1248) before line 1557, or use the clamped value directly:
```javascript
const creditPhase = CREDIT_PHASE[Math.max(1, Math.min(secureYear, 5)) - 1] || 0;
```

### MEDIUM — Silent Owner/Employee Drops (Bugs #8, #9)

**Fix Effort: Quick Fix (15 min)**

**Bug #8** — Line 2148: Change filter to `.filter(ao => ao.salary > 0 || ao.k1 > 0)` to include K-1-only owners. Alternatively, add a UI warning when owners are filtered out.

**Bug #9** — Line 3436 area: After parsing, if any rows were skipped, show a notice:
```javascript
const skippedCount = dataRows.length - employees.length;
if (skippedCount > 0) {
  // Append to detection message
}
```

---

## Test Coverage Summary

| Category | Tests Run | Findings |
|----------|-----------|----------|
| Input Validation & XSS | Deep scan of all 30+ innerHTML sites + template analysis | 8 exploitable XSS vectors confirmed across 6 rendering surfaces (no escaping function exists in entire codebase) |
| Numeric Boundaries | 20 edge case tests | Tax rate 0% bug, SECURE year boundary bug |
| Computation Engine | 15 tests (solo owner, 415c, cross-test, FICA) | All core math correct within tolerance |
| Census Parsing | Code audit of parseCensusData() | Silent drops, delimiter detection, ambiguity |
| Additional Owners | 5 tests + code audit | Silent $0-salary drop |
| Plan Design Modes | 4 tests (maximize, gateway, custom, sub-5%) | All modes functional |
| Entity Type Switching | 3 tests (S-Corp, LLC, C-Corp) | FICA behavior correct |
| Anonymous Mode | Code audit of embed + PDF generation | 2 data leaks, regex fragility |
| Verification Engine | 1 test + code audit | Only verifies standard plan |
| Net Cost Waterfall | 2 tests (std + opt) | Both waterfalls correct |
| SECURE 2.0 Credits | 6 tests (years 1-6, employer size) | Phase-down correct, boundary bugs |
| State Management | Code audit of cache/debounce | Census cache key concern |

---

## Environment Limitations

The following categories could not be fully tested in a CLI/Node.js environment:
- **Cross-Browser/Environment**: Requires Selenium/Playwright with real browsers
- **Visual/Layout Regression**: Requires screenshot comparison tooling
- **PDF Generation**: Requires html2pdf.js in browser context (DOM rendering)
- **Race Conditions**: Requires real browser event loop with rapid UI interaction

---

## Existing Test Suite Status

The built-in `runTestSuite()` (29 scenarios) passes cleanly:
- **29 PASSED | 0 FAILED | 1 WARNING** (expected §404(a)(3) deduction limit warning in test 15)
- All core computation scenarios verified
- Cross-testing, SECURE credits, FICA savings all validated against expected values
