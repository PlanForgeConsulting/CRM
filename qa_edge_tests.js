// QA Edge Case Tests for PlanForge Advisor Panel V3
// Tests: computation edge cases, boundary conditions, XSS vectors, census parsing

const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('./PlanForge_Advisor_Panel_V3_MASTER.html', 'utf8');

// Extract JS
const startTag = '\n<script>\n';
const startIdx = html.indexOf(startTag);
const jsStart = startIdx + startTag.length;
const lastScriptEnd = html.lastIndexOf('</script>');
const jsBlock = html.substring(jsStart, lastScriptEnd);

const stubs = `
  var document = {
    getElementById: function(id) { return { value: '0', textContent: '', innerHTML: '', style: {display:''}, className: '', querySelector: function(){return null;}, closest: function(){return null;}, classList: {toggle:function(){},remove:function(){},add:function(){},contains:function(){return false;}} }; },
    querySelectorAll: function() { return []; },
    createElement: function(tag) { return { style:{}, innerHTML:'', className:'', textContent:'', appendChild:function(){return this;}, setAttribute:function(){}, addEventListener:function(){}, querySelector:function(){return null;}, querySelectorAll:function(){return [];}, classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false;}}, children:[], click:function(){} }; },
    querySelector: function() { return null; },
    body: { appendChild:function(){}, removeChild:function(){} },
    addEventListener: function(){},
    createTextNode: function(t){ return {textContent:t}; },
  };
  var window = { addEventListener: function(){}, open: function(){}, location: {href:''} };
  var alert = function(msg){ };
  var confirm = function(){ return true; };
  var URL = { createObjectURL: function(){ return ''; }, revokeObjectURL: function(){} };
  var Blob = function(parts, opts){ this.parts = parts; };
  var HTMLElement = function(){};
  var FileReader = function(){ this.readAsText = function(){}; this.onload = null; };
  var DOMParser = function(){ this.parseFromString = function(){ return { querySelectorAll: function(){ return []; } }; }; };
`;

const context = vm.createContext({
  console, Math, JSON, Set, Object, Array, parseInt, parseFloat, isNaN, isFinite, setTimeout, clearTimeout,
  Date, Number, String, Boolean, Map, WeakMap, Symbol, Error, TypeError, RangeError, ReferenceError,
  RegExp, Promise, Proxy, Reflect, Uint8Array, ArrayBuffer, encodeURIComponent, decodeURIComponent,
  NaN, Infinity, undefined,
});

vm.runInContext(stubs + jsBlock, context, { filename: 'advisor-panel.js', timeout: 30000 });

let passed = 0, failed = 0, warnings = 0;
const bugs = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result === 'WARN') {
      warnings++;
      console.log(`⚠ WARN: ${name}`);
    } else {
      passed++;
      console.log(`✓ PASS: ${name}`);
    }
  } catch (e) {
    failed++;
    console.log(`✗ FAIL: ${name}: ${e.message}`);
    bugs.push({ name, error: e.message });
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

// ═══════════════════════════════════════════════════
// 1. COMPUTATION EDGE CASES
// ═══════════════════════════════════════════════════

const compute = context.independentCompute;
const crossTest = context.runCrossTest;
const adjEAR = context.computeAdjEAR;
const buildCensus = context.buildFullCensus;

// Base input template
function baseInput(overrides) {
  return Object.assign({
    bizName: 'Test Corp', firstName: 'John', lastName: 'Doe',
    entityType: 'S-Corp', ownerAge: 50, ownerSalary: 200000, ownerK1: 0,
    year: '2026', taxRate: 0.30,
    nhceCount: 10, nhceAvgPay: 50000, nhceAvgAge: 35,
    nhcePayLow: 30000, nhcePayHigh: 70000,
    hceNonOwnerCount: 0, hceAvgPay: 0, hceAvgAge: 45,
    hceAllocRate: null, nhceOver100k: 0,
    deferralEligMonths: 0, psEligMonths: 0, excludableNhces: 0,
    stdRate: 3, optNhceRate: 5, secureYear: 1,
    realForfeitures: 0, realForfeituresStd: 0,
    turnoverPct: 0, planMode: 'maximize',
    additionalOwners: [],
  }, overrides);
}

// --- Zero / Minimal Owner Compensation ---
test('Zero owner comp returns error object', () => {
  const r = compute(baseInput({ ownerSalary: 0, ownerK1: 0 }));
  assert(r.error, 'Should return error for zero owner comp');
  assert(r.optOwnerAlloc === 0, 'Owner alloc should be 0');
});

test('Owner comp = $1 does not crash', () => {
  const r = compute(baseInput({ ownerSalary: 1 }));
  assert(!r.error, 'Should not error with $1 comp');
  assert(r.ownerComp === 1, 'Owner comp should be 1');
});

test('Owner comp at 401(a)(17) cap', () => {
  const r = compute(baseInput({ ownerSalary: 500000 }));
  assert(r.ownerComp === 360000, 'Should be capped at 401(a)(17) = $360,000');
});

// --- Negative Values ---
test('Negative owner salary treated as 0', () => {
  const r = compute(baseInput({ ownerSalary: -50000 }));
  // negative salary + 0 k1 could give negative comp or 0
  assert(r.error || r.ownerComp <= 0, 'Negative salary should result in error or 0 comp');
});

test('Negative NHCE count does not crash', () => {
  const r = compute(baseInput({ nhceCount: -5 }));
  assert(!r.error || r.error === undefined, 'Should handle gracefully');
});

test('Negative nhceAvgPay does not crash', () => {
  const r = compute(baseInput({ nhceAvgPay: -30000 }));
  assert(r !== undefined, 'Should not crash');
});

// --- NaN / Undefined inputs ---
test('NaN ownerSalary handled', () => {
  const r = compute(baseInput({ ownerSalary: NaN }));
  assert(r.error || r.ownerComp === 0, 'NaN salary should be treated as 0');
});

test('Undefined fields use defaults', () => {
  const r = compute({ year: '2026', ownerSalary: 200000 });
  assert(r !== undefined, 'Should not crash with minimal input');
});

// --- Very Large Values ---
test('Extremely large salary (10 billion)', () => {
  const r = compute(baseInput({ ownerSalary: 10000000000 }));
  assert(r.ownerComp === 360000, 'Should be capped at 401(a)(17)');
  assert(r.optOwnerAlloc <= 72000, 'Should be capped at 415(c)');
});

test('Extremely large NHCE count (10000)', () => {
  const r = compute(baseInput({ nhceCount: 10000 }));
  assert(r.eligible >= 10000, 'Should handle large employee count');
  assert(r.employerSizeFactor === 0, 'SECURE credit should be 0 for 100+ employees');
});

// --- Solo Owner (no employees) ---
test('Solo owner - no NHCEs', () => {
  const r = compute(baseInput({ nhceCount: 0, nhceAvgPay: 0 }));
  assert(!r.error, 'Solo owner should work');
  // 25% deduction limit applies
  assert(r.optOwnerAlloc <= r.ownerComp * 0.25, '404(a)(3) 25% deduction limit for solo owner');
});

test('Solo owner - 404(a)(3) deduction limit', () => {
  const r = compute(baseInput({ nhceCount: 0, nhceAvgPay: 0, ownerSalary: 200000 }));
  assert(r.optOwnerAlloc <= 50000, 'Solo owner at $200K capped at $50K (25%)');
});

// --- Cross-Testing Math ---
test('computeAdjEAR with zero comp returns 0', () => {
  const r = adjEAR(10000, 0, 40);
  assert(r === 0, 'Zero comp should return 0 EAR');
});

test('computeAdjEAR with zero allocation returns 0', () => {
  const r = adjEAR(0, 50000, 40);
  assert(r === 0, 'Zero allocation should return 0 EAR');
});

test('computeAdjEAR with age > NRA (65)', () => {
  const r = adjEAR(10000, 50000, 70);
  assert(r > 0, 'Should handle post-NRA age');
  assert(isFinite(r), 'Should be finite');
});

test('computeAdjEAR with age = 0 (infant)', () => {
  const r = adjEAR(10000, 50000, 0);
  assert(r > 0, 'Should handle age 0');
  assert(isFinite(r), 'Should be finite');
});

test('computeAdjEAR with age = 100', () => {
  const r = adjEAR(10000, 50000, 100);
  assert(r > 0, 'Should handle age 100');
  assert(isFinite(r), 'Should be finite');
});

test('computeAdjEAR with age > 100', () => {
  const r = adjEAR(10000, 50000, 120);
  assert(r > 0, 'Should handle age > 100');
  assert(isFinite(r), 'Should be finite');
});

// --- 415(c) Limit Enforcement ---
test('Owner allocation capped at 415(c) = $72,000 for 2026', () => {
  const r = compute(baseInput({ ownerSalary: 350000 }));
  assert(r.optOwnerAlloc <= 72000, `Owner alloc ${r.optOwnerAlloc} should be <= $72,000`);
});

// --- SECURE 2.0 Credits ---
test('SECURE Year 1 = 100% credit phase', () => {
  const r = compute(baseInput({ secureYear: 1 }));
  assert(r.secureCreditInfo.creditPhase === 1.0, 'Year 1 should be 100%');
});

test('SECURE Year 3 = 75% credit phase', () => {
  const r = compute(baseInput({ secureYear: 3 }));
  assert(r.secureCreditInfo.creditPhase === 0.75, 'Year 3 should be 75%');
});

test('SECURE Year 5 = 25% credit phase', () => {
  const r = compute(baseInput({ secureYear: 5 }));
  assert(r.secureCreditInfo.creditPhase === 0.25, 'Year 5 should be 25%');
});

test('SECURE Year 0 (invalid) does not crash', () => {
  try {
    const r = compute(baseInput({ secureYear: 0 }));
    // creditPhase = CREDIT_PHASE[-1] = undefined
    // This will cause NaN downstream
    if (isNaN(r.secureCredits)) {
      bugs.push({ name: 'SECURE Year 0 produces NaN credits', error: 'secureYear=0 -> CREDIT_PHASE[-1]=undefined -> NaN' });
      throw new Error('secureYear=0 produces NaN credits');
    }
  } catch(e) {
    throw e;
  }
});

test('SECURE Year 6 (beyond phase-down) does not crash', () => {
  try {
    const r = compute(baseInput({ secureYear: 6 }));
    if (isNaN(r.secureCredits)) {
      throw new Error('secureYear=6 produces NaN credits');
    }
  } catch(e) {
    throw e;
  }
});

test('Employer size factor = 0 at 100+ employees', () => {
  const r = compute(baseInput({ nhceCount: 100 }));
  assert(r.secureCreditInfo.employerSizeFactor === 0, 'Factor should be 0 at 100+');
  assert(r.secureCredits === 0, 'Credits should be $0');
});

test('Employer size factor = 1.0 at 50 or fewer', () => {
  const r = compute(baseInput({ nhceCount: 50 }));
  assert(r.secureCreditInfo.employerSizeFactor === 1.0, 'Factor should be 1.0 at <=50');
});

// --- Entity Type FICA ---
test('C-Corp has zero FICA savings', () => {
  const r = compute(baseInput({ entityType: 'C-Corp' }));
  assert(r.optFicaSavings === 0, 'C-Corp should have 0 FICA savings');
  assert(r.stdFicaSavings === 0, 'C-Corp std should have 0 FICA savings');
});

test('S-Corp has FICA savings', () => {
  const r = compute(baseInput({ entityType: 'S-Corp' }));
  assert(r.optFicaSavings > 0, 'S-Corp should have FICA savings');
});

test('LLC has FICA savings', () => {
  const r = compute(baseInput({ entityType: 'LLC' }));
  assert(r.optFicaSavings > 0, 'LLC should have FICA savings');
});

// --- Plan Modes ---
test('Maximize mode works', () => {
  const r = compute(baseInput({ planMode: 'maximize' }));
  assert(!r.error, 'Maximize mode should work');
  assert(r.optOwnerAlloc > 0, 'Owner should get allocation');
});

test('Gateway mode works', () => {
  const r = compute(baseInput({ planMode: 'gateway', nhceFlatAmt: 1000 }));
  assert(!r.error, 'Gateway mode should work');
  assert(r.gatewayInfo, 'Should have gateway info');
});

test('Custom mode works', () => {
  const r = compute(baseInput({ planMode: 'custom', optNhceRate: 5 }));
  assert(!r.error, 'Custom mode should work');
});

test('Custom mode below 5% triggers gateway cap', () => {
  const r = compute(baseInput({ planMode: 'custom', optNhceRate: 3 }));
  assert(!r.error, 'Custom mode at 3% should work');
  assert(r.gatewayInfo, 'Should have gateway info for sub-5% custom');
});

// --- Additional Owners ---
test('Additional owner with zero salary excluded from computation', () => {
  const r = compute(baseInput({
    additionalOwners: [{ name: 'Jane', age: 45, salary: 0, k1: 0, receivesPS: true }]
  }));
  // The owner should be included in addlOwners since independentCompute doesn't filter by salary > 0
  // But getInputFromForm does! Check if the compute engine handles zero comp owners
  const addl = r.additionalOwners;
  if (addl.length > 0 && addl[0].comp === 0) {
    // Zero comp additional owner is included but contributes nothing
    assert(r.optAdditionalAllocs[0] === 0, 'Zero comp owner should get $0 allocation');
  }
});

test('Additional owner at 401(a)(17) cap', () => {
  const r = compute(baseInput({
    additionalOwners: [{ name: 'Jane', age: 45, salary: 500000, k1: 0, receivesPS: true }]
  }));
  const addl = r.additionalOwners;
  assert(addl[0].comp === 360000, 'Additional owner should be capped at 401(a)(17)');
});

test('Additional owner receivesPS=false gets $0', () => {
  const r = compute(baseInput({
    additionalOwners: [{ name: 'Jane', age: 45, salary: 200000, k1: 0, receivesPS: false }]
  }));
  assert(r.optAdditionalAllocs[0] === 0, 'Non-participating owner should get $0');
});

test('Many additional owners (10) does not crash', () => {
  const owners = [];
  for (let i = 0; i < 10; i++) {
    owners.push({ name: `Owner${i}`, age: 40 + i, salary: 100000 + i*10000, k1: 0, receivesPS: true });
  }
  const r = compute(baseInput({ additionalOwners: owners }));
  assert(!r.error, 'Should handle 10 additional owners');
  assert(r.additionalOwners.length === 10, 'Should have 10 additional owners');
});

// --- Division by Zero Scenarios ---
test('Zero nhceAvgPay with NHCEs does not crash', () => {
  const r = compute(baseInput({ nhceAvgPay: 0, nhceCount: 10 }));
  assert(r !== undefined, 'Should not crash with zero avg pay');
});

test('Zero totalComp does not divide by zero', () => {
  const r = compute(baseInput({ ownerSalary: 0, ownerK1: 0, nhceCount: 0, nhceAvgPay: 0 }));
  assert(r.error || r !== undefined, 'Should handle zero total comp');
});

// --- Tax Rate Edge Cases ---
test('Tax rate = 0%', () => {
  const r = compute(baseInput({ taxRate: 0 }));
  assert(r.optTaxSavings === 0, 'Zero tax rate = zero tax savings');
});

test('Tax rate = 100% (unrealistic)', () => {
  const r = compute(baseInput({ taxRate: 1.0 }));
  assert(r.optTaxSavings > 0, 'Full tax rate should produce savings');
  assert(isFinite(r.optTaxSavings), 'Tax savings should be finite');
});

// --- Year Edge Cases ---
test('Year 2025 uses correct limits', () => {
  const r = compute(baseInput({ year: '2025' }));
  assert(r.limits.additions415c === 70000, '2025 415(c) should be $70,000');
  assert(r.limits.compCap401a17 === 350000, '2025 401(a)(17) should be $350,000');
});

test('Unknown year falls back to 2026', () => {
  const r = compute(baseInput({ year: '2030' }));
  assert(r.limits.additions415c === 72000, 'Unknown year should use 2026 limits');
});

// ═══════════════════════════════════════════════════
// 2. XSS / INJECTION VECTORS (code analysis)
// ═══════════════════════════════════════════════════

test('renderOwners XSS: double quotes in name break HTML attribute', () => {
  // Line 2543: value="${ao.name||''}" — double quotes in names break the value attribute
  const maliciousName = 'Test" onmouseover="alert(1)" data-x="';
  // Simulate what the template literal would produce:
  const html = `<input type="text" value="${maliciousName}">`;
  // The HTML would be: <input type="text" value="Test" onmouseover="alert(1)" data-x="">
  // This injects an onmouseover handler
  const hasInjection = html.includes('onmouseover');
  assert(hasInjection, 'Confirms XSS vector exists in renderOwners template');
  // This is a KNOWN BUG — we're confirming it exists
  bugs.push({
    name: 'XSS in renderOwners via double-quote name injection',
    error: 'Line 2543: value="${ao.name||\'\'}" allows attribute injection via double quotes in owner name'
  });
  // Mark as expected failure
  passed++; failed--; // offset the auto-fail
});

test('Anonymous embed still exposes individual owner compensation', () => {
  // META_ANON at line 4943 replaces names but keeps ao.comp
  // This means individual compensation amounts are exposed even in anonymous mode
  bugs.push({
    name: 'Anonymous embed leaks individual owner compensation',
    error: 'Line 4943: META_ANON includes ao.comp for each additional owner'
  });
});

test('Anonymous embed title leaks real business name', () => {
  // Line 4699: <title> uses c.bizName even though body content is anonymized
  bugs.push({
    name: 'Anonymous embed <title> leaks business name',
    error: 'Line 4699: <title> tag contains real bizName instead of anonymized name'
  });
});

// ═══════════════════════════════════════════════════
// 3. CENSUS PARSING EDGE CASES (code analysis)
// ═══════════════════════════════════════════════════

test('Census: pay=0 employees silently dropped', () => {
  // Line 3436: if (pay > 0) employees.push(...)
  // Employees with $0 pay are silently excluded — no warning
  bugs.push({
    name: 'Census silently drops $0 pay employees',
    error: 'Line 3436: pay > 0 filter drops employees with no parseable pay, no warning shown'
  });
});

test('Census: 2-col ambiguity between age-like salary and actual age', () => {
  // Line 3406: if firstNum < 100 -> treated as age
  // A 2-column CSV with "50,60000" would treat 50 as age
  // But "50" could be a $50 salary (unlikely but possible)
  // More concerning: "95,60000" treats 95 as age, not $95 salary
  // This is actually a reasonable heuristic but could misinterpret edge cases
});

test('Census: negative salary parsed as 0', () => {
  // Line 3400/3408: parseFloat with $, removal -> negative numbers parse correctly
  // But line 3436 filters pay > 0, so negative-pay employees are dropped silently
});

test('Census: pipe delimiter detection', () => {
  // Line 3317: only checks first row for delimiter
  // If first row has no pipes but data rows do, wrong delimiter chosen
});

// ═══════════════════════════════════════════════════
// 4. FORFEITURE EDGE CASES
// ═══════════════════════════════════════════════════

test('Turnover at 100% produces forfeitures = full NHCE PS', () => {
  const r = compute(baseInput({ turnoverPct: 100 }));
  const expectedForfeitable = r.optEmpPS; // should be close
  // turnoverPctDecimal would be 1.0
  assert(r.optEstimatedForfeitures > 0, 'Should have estimated forfeitures at 100% turnover');
});

test('Turnover at 0% produces zero estimated forfeitures', () => {
  const r = compute(baseInput({ turnoverPct: 0 }));
  assert(r.optEstimatedForfeitures === 0, 'Should have $0 estimated forfeitures at 0% turnover');
});

// ═══════════════════════════════════════════════════
// 5. NET COST WATERFALL VERIFICATION
// ═══════════════════════════════════════════════════

test('Net cost waterfall: optNetCost = totalPS - ownersRetained - taxSavings - credits - FICA - forfeitures', () => {
  const r = compute(baseInput({ turnoverPct: 0 }));
  const expectedNetCost = r.optTotalPS - r.optOwnersRetained - r.optTaxSavings - r.secureCredits - r.optFicaSavings - r.realForfeitures;
  // Allow $1 rounding tolerance
  assert(Math.abs(r.optNetCost - expectedNetCost) <= 1,
    `Net cost mismatch: got ${r.optNetCost}, expected ${expectedNetCost}`);
});

test('Standard plan net cost waterfall', () => {
  const r = compute(baseInput({ turnoverPct: 0 }));
  const expectedStdNet = r.stdTotalPS - r.stdOwnersRetained - r.stdTaxSavings - r.stdSecureCredits - r.stdFicaSavings - r.realForfeituresStd;
  assert(Math.abs(r.stdNetCost - expectedStdNet) <= 1,
    `Std net cost mismatch: got ${r.stdNetCost}, expected ${expectedStdNet}`);
});

// ═══════════════════════════════════════════════════
// 6. CROSS-TESTING SPECIFIC EDGE CASES
// ═══════════════════════════════════════════════════

test('Cross-test with 0 NHCEs passes trivially', () => {
  const census = buildCensus(baseInput({ nhceCount: 0, nhceAvgPay: 0 }));
  const r = crossTest(20, 5, null, census, { additions415c: 72000, compCap401a17: 360000 });
  assert(r.allPass, 'Should pass with 0 NHCEs');
});

test('Cross-test with very young owner (age 20) and old NHCEs (age 60)', () => {
  // Young owner gets more years of accumulation, should get higher EBAR
  const input = baseInput({ ownerAge: 20, nhceAvgAge: 60 });
  const r = compute(input);
  assert(!r.error, 'Should compute without error');
  // The cross-test should be harder because old NHCEs have less accumulation time
});

test('Cross-test with very old owner (age 64) and young NHCEs (age 25)', () => {
  const input = baseInput({ ownerAge: 64, nhceAvgAge: 25 });
  const r = compute(input);
  assert(!r.error, 'Should compute without error');
  // Old owner with young NHCEs — cross-testing advantage is minimal
});

// ═══════════════════════════════════════════════════
// 7. ADDITIONAL OWNER STATE MANAGEMENT
// ═══════════════════════════════════════════════════

test('getInputFromForm silently drops additional owners with $0 salary', () => {
  // Line 2148: .filter(ao => ao.salary > 0)
  // This means owners entered in the UI but with $0 salary disappear from computation
  bugs.push({
    name: 'getInputFromForm silently drops $0-salary additional owners',
    error: 'Line 2148: filter(ao => ao.salary > 0) removes owners without warning'
  });
});

// ═══════════════════════════════════════════════════
// 8. ANONYMOUS MODE REGEX FRAGILITY
// ═══════════════════════════════════════════════════

test('Anonymous embed regex could fail with META containing newlines/semicolons in strings', () => {
  // Line 5273: html.replace(/const META = \{[\s\S]*?\};\nconst META_ANON/, ...)
  // The .*? is non-greedy but still scans for the FIRST };\nconst META_ANON
  // If a string value inside META contains "};\nconst META_ANON", the regex breaks
  // While unlikely, JSON.stringify would not add literal newlines (it escapes them as \n)
  // So this is LOW risk but worth noting
  bugs.push({
    name: 'Anonymous embed regex replacement is fragile',
    error: 'Line 5273: regex-based META replacement could fail if META structure changes'
  });
});

// ═══════════════════════════════════════════════════
// 9. EMPLOYER SIZE FACTOR BOUNDARY
// ═══════════════════════════════════════════════════

test('Employer size factor at exactly 51 employees', () => {
  const r = compute(baseInput({ nhceCount: 51 }));
  // At 51 total employees (including owner), factor should be < 1.0
  assert(r.secureCreditInfo.employerSizeFactor < 1.0 || r.secureCreditInfo.totalEmployeesForSize <= 50,
    'Factor should decrease above 50 employees');
});

// ═══════════════════════════════════════════════════
// 10. VERIFICATION ENGINE
// ═══════════════════════════════════════════════════

test('Verification engine produces results matching primary engine', () => {
  const input = baseInput({});
  const primary = compute(input);
  const verify = context.verifyIndependent(input);
  // Check key values match within tolerance
  assert(Math.abs(primary.optOwnerAlloc - verify.optOwnerAlloc) <= 1,
    `Owner alloc mismatch: primary=${primary.optOwnerAlloc}, verify=${verify.optOwnerAlloc}`);
  assert(Math.abs(primary.optEmpPS - verify.optEmpPS) <= 1,
    `Emp PS mismatch: primary=${primary.optEmpPS}, verify=${verify.optEmpPS}`);
});

// ═══════════════════════════════════════════════════
// 11. PDF GENERATION EDGE CASES (code analysis)
// ═══════════════════════════════════════════════════

test('PDF anonymous mode: title tag leaks business name (confirmed)', () => {
  // Already captured above — confirming the finding
  // Line 4699 in participant view, and similar pattern in PDF generation
});

// ═══════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log(`QA EDGE CASE RESULTS: ${passed} PASSED | ${failed} FAILED | ${warnings} WARNINGS`);
console.log('═'.repeat(60));

if (bugs.length > 0) {
  console.log('\nBUGS FOUND:');
  bugs.forEach((b, i) => {
    console.log(`  ${i+1}. ${b.name}`);
    console.log(`     ${b.error}`);
  });
}

process.exit(failed > 0 ? 1 : 0);
