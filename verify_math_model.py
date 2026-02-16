#!/usr/bin/env python3
"""
Financial Calculator Math Model Verification
Test inputs: 25 employees, $100K avg salary, $300K owner salary,
             age=50+, cross-testing=ON, age-test=ON, turnover=33%
"""
import math

# ─── Test Inputs ──────────────────────────────────────────────────────────
EMPLOYEES       = 25
AVG_SALARY      = 100_000
OWNER_SALARY    = 300_000
TURNOVER_PCT    = 0.33
AGE_50_PLUS     = True
CROSS_TESTING   = True
AGE_TEST        = True

# ─── Constants ────────────────────────────────────────────────────────────
CREDIT_PHASE     = [1.0, 1.0, 0.75, 0.50, 0.25]
STD_EMP_CONTRIB  = [1000, 1000, 1000, 1000, 1000]
OPT_EMP_CONTRIB  = [1000, 1000, 1333, 2000, 4000]
TREASURY_GROWTH  = 0.04
TAX_RATE         = 0.30
IRS_CAP          = 69_000
ADMIN_CREDIT_AMT = 5_500       # per year, years 1-3 only, for <=50 emps
ADMIN_CREDIT_YRS = 3
CREDIT_PER_EMP   = 1_000       # base; for >50 emps reduced by 2%/emp over 50

# ─── Derived constants ───────────────────────────────────────────────────
BASE_PCT = CREDIT_PER_EMP / AVG_SALARY          # 1%
STD_OWNER_RATE = 3 * BASE_PCT                    # 3%  (standard + cross-testing: 3x)
OPT_OWNER_RATE_CALC = 5 * BASE_PCT               # 5%  (optimized: 5x basePct)
OPT_OWNER_RATE = max(OPT_OWNER_RATE_CALC, 0.20)  # max(5%, 20%) = 20% for 50+

STD_OWNER_ANNUAL = OWNER_SALARY * STD_OWNER_RATE  # $9,000
OPT_OWNER_ANNUAL_RAW = OWNER_SALARY * OPT_OWNER_RATE  # $60,000

# IRS cap check
IRS_LIMIT = min(IRS_CAP, 0.25 * OWNER_SALARY)     # min($69K, $75K) = $69K
OPT_OWNER_ANNUAL = min(OPT_OWNER_ANNUAL_RAW, IRS_LIMIT)  # $60K < $69K => $60K

TYPICAL_EMP_RATE = 0.03
TYPICAL_OWN_RATE = 0.03

print("=" * 80)
print("FINANCIAL CALCULATOR MATH MODEL VERIFICATION")
print("=" * 80)
print()
print(f"Inputs: {EMPLOYEES} employees, ${AVG_SALARY:,} avg salary, "
      f"${OWNER_SALARY:,} owner salary")
print(f"        age=50+, cross-testing=ON, age-test=ON, turnover={TURNOVER_PCT:.0%}")
print()
print("─── Derived Constants ───")
print(f"  basePct           = {BASE_PCT:.2%}")
print(f"  STD owner rate    = 3 × {BASE_PCT:.2%} = {STD_OWNER_RATE:.2%}  =>  ${STD_OWNER_ANNUAL:,.0f}/yr")
print(f"  OPT owner rate    = max(5×{BASE_PCT:.2%}, 20%) = {OPT_OWNER_RATE:.2%}  =>  ${OPT_OWNER_ANNUAL_RAW:,.0f}/yr")
print(f"  IRS limit         = min(${IRS_CAP:,}, 25%×${OWNER_SALARY:,}) = ${IRS_LIMIT:,}")
print(f"  OPT owner annual  = min(${OPT_OWNER_ANNUAL_RAW:,.0f}, ${IRS_LIMIT:,}) = ${OPT_OWNER_ANNUAL:,.0f}")
print()


# ═══════════════════════════════════════════════════════════════════════════
# HELPER: per-year calculations
# ═══════════════════════════════════════════════════════════════════════════
def calc_credits_per_year(yr):
    """Return (admin_credit, contribution_credit) for year yr (0-indexed)."""
    admin = ADMIN_CREDIT_AMT if yr < ADMIN_CREDIT_YRS else 0
    contrib = CREDIT_PER_EMP * CREDIT_PHASE[yr] * EMPLOYEES
    return admin, contrib

def calc_uncredited_emp(yr, emp_contrib_schedule):
    """Employee cost that was NOT covered by credit (deductible portion)."""
    total_emp_cost = EMPLOYEES * emp_contrib_schedule[yr]
    credited = EMPLOYEES * CREDIT_PER_EMP * CREDIT_PHASE[yr]
    return max(0, total_emp_cost - credited)


# ═══════════════════════════════════════════════════════════════════════════
# TYPICAL STRATEGY (Change 12)
# ═══════════════════════════════════════════════════════════════════════════
def calc_typical():
    annual = {}
    cumulative = {y: {} for y in [1, 3, 5]}

    for yr in range(5):
        emp_cost  = EMPLOYEES * AVG_SALARY * TYPICAL_EMP_RATE
        own_cost  = OWNER_SALARY * TYPICAL_OWN_RATE
        expense   = emp_cost + own_cost
        owner_ret = own_cost
        credits   = 0
        deductible = expense    # full expense is deductible, no credits
        tax_ded   = deductible * TAX_RATE
        # Net = expense - owner_retained - credits - tax_savings_from_deductions
        net       = expense - owner_ret - credits - tax_ded

        annual[yr] = {
            'emp_cost': emp_cost,
            'own_cost': own_cost,
            'expense': expense,
            'owner_ret': owner_ret,
            'credits': credits,
            'deductible': deductible,
            'tax_ded': tax_ded,
            'net': net,
        }

    # Accumulate for 1yr, 3yr, 5yr
    for period in [1, 3, 5]:
        c = cumulative[period]
        c['emp_cost']   = sum(annual[y]['emp_cost'] for y in range(period))
        c['own_cost']   = sum(annual[y]['own_cost'] for y in range(period))
        c['expense']    = sum(annual[y]['expense'] for y in range(period))
        c['owner_ret']  = sum(annual[y]['owner_ret'] for y in range(period))
        c['credits']    = sum(annual[y]['credits'] for y in range(period))
        c['deductible'] = sum(annual[y]['deductible'] for y in range(period))
        c['tax_ded']    = c['deductible'] * TAX_RATE
        # Combined "Tax Savings" = credits + deduction savings
        c['tax_savings_combined'] = c['credits'] + c['tax_ded']
        c['net']        = c['expense'] - c['owner_ret'] - c['tax_savings_combined']

    return annual, cumulative


# ═══════════════════════════════════════════════════════════════════════════
# PF STANDARD
# ═══════════════════════════════════════════════════════════════════════════
def calc_pf_standard():
    annual = {}
    for yr in range(5):
        emp_cost  = EMPLOYEES * STD_EMP_CONTRIB[yr]
        own_cost  = STD_OWNER_ANNUAL
        expense   = emp_cost + own_cost
        owner_ret = own_cost

        admin_cr, contrib_cr = calc_credits_per_year(yr)
        credits = admin_cr + contrib_cr

        uncredited = calc_uncredited_emp(yr, STD_EMP_CONTRIB)
        deductible = own_cost + uncredited
        tax_ded    = deductible * TAX_RATE

        net = expense - owner_ret - credits - tax_ded

        annual[yr] = {
            'emp_cost': emp_cost,
            'own_cost': own_cost,
            'expense': expense,
            'owner_ret': owner_ret,
            'admin_cr': admin_cr,
            'contrib_cr': contrib_cr,
            'credits': credits,
            'uncredited': uncredited,
            'deductible': deductible,
            'tax_ded': tax_ded,
            'net': net,
        }

    cumulative = {}
    for period in [1, 3, 5]:
        c = {}
        c['emp_cost']   = sum(annual[y]['emp_cost'] for y in range(period))
        c['own_cost']   = sum(annual[y]['own_cost'] for y in range(period))
        c['expense']    = sum(annual[y]['expense'] for y in range(period))
        c['owner_ret']  = sum(annual[y]['owner_ret'] for y in range(period))
        c['credits']    = sum(annual[y]['credits'] for y in range(period))
        c['deductible'] = sum(annual[y]['deductible'] for y in range(period))
        c['tax_ded']    = c['deductible'] * TAX_RATE
        c['tax_savings_combined'] = c['credits'] + c['tax_ded']
        c['net']        = c['expense'] - c['owner_ret'] - c['tax_savings_combined']
        cumulative[period] = c

    return annual, cumulative


# ═══════════════════════════════════════════════════════════════════════════
# PF OPTIMIZED
# ═══════════════════════════════════════════════════════════════════════════
def calc_pf_optimized():
    annual = {}
    for yr in range(5):
        emp_cost  = EMPLOYEES * OPT_EMP_CONTRIB[yr]
        own_cost  = OPT_OWNER_ANNUAL
        expense   = emp_cost + own_cost
        owner_ret = own_cost

        admin_cr, contrib_cr = calc_credits_per_year(yr)
        credits = admin_cr + contrib_cr

        uncredited = calc_uncredited_emp(yr, OPT_EMP_CONTRIB)
        deductible = own_cost + uncredited
        tax_ded    = deductible * TAX_RATE

        net = expense - owner_ret - credits - tax_ded

        annual[yr] = {
            'emp_cost': emp_cost,
            'own_cost': own_cost,
            'expense': expense,
            'owner_ret': owner_ret,
            'admin_cr': admin_cr,
            'contrib_cr': contrib_cr,
            'credits': credits,
            'uncredited': uncredited,
            'deductible': deductible,
            'tax_ded': tax_ded,
            'net': net,
        }

    cumulative = {}
    for period in [1, 3, 5]:
        c = {}
        c['emp_cost']   = sum(annual[y]['emp_cost'] for y in range(period))
        c['own_cost']   = sum(annual[y]['own_cost'] for y in range(period))
        c['expense']    = sum(annual[y]['expense'] for y in range(period))
        c['owner_ret']  = sum(annual[y]['owner_ret'] for y in range(period))
        c['credits']    = sum(annual[y]['credits'] for y in range(period))
        c['deductible'] = sum(annual[y]['deductible'] for y in range(period))
        c['tax_ded']    = c['deductible'] * TAX_RATE
        c['tax_savings_combined'] = c['credits'] + c['tax_ded']
        c['net']        = c['expense'] - c['owner_ret'] - c['tax_savings_combined']
        cumulative[period] = c

    return annual, cumulative


# ═══════════════════════════════════════════════════════════════════════════
# FORFEITURES (Change 16)
# ═══════════════════════════════════════════════════════════════════════════
def calc_forfeitures(employees, turnover_pct, contrib_schedule):
    results = []
    for yr in range(5):
        if yr == 0:
            per_emp = contrib_schedule[0]
        elif yr == 1:
            per_emp = (contrib_schedule[0] + contrib_schedule[1]) * 0.75
        else:
            one_yr_leaver = contrib_schedule[yr]
            two_yr_leaver = contrib_schedule[yr] + contrib_schedule[yr - 1]
            per_emp = (one_yr_leaver + two_yr_leaver) / 2
        per_emp *= (1 + TREASURY_GROWTH) ** max(0, yr * 0.5)
        results.append(round(turnover_pct * employees * per_emp))
    return results


# ═══════════════════════════════════════════════════════════════════════════
# RUN CALCULATIONS
# ═══════════════════════════════════════════════════════════════════════════
typ_ann, typ_cum = calc_typical()
std_ann, std_cum = calc_pf_standard()
opt_ann, opt_cum = calc_pf_optimized()

std_forfeit = calc_forfeitures(EMPLOYEES, TURNOVER_PCT, STD_EMP_CONTRIB)
opt_forfeit = calc_forfeitures(EMPLOYEES, TURNOVER_PCT, OPT_EMP_CONTRIB)


# ═══════════════════════════════════════════════════════════════════════════
# DISPLAY & VERIFY
# ═══════════════════════════════════════════════════════════════════════════
def fmt(v):
    """Format a dollar value with sign."""
    if v < 0:
        return f"(${abs(v):,.0f})"
    return f"${v:,.0f}"

def verify(label, computed, expected, tolerance=1):
    """Check computed vs expected within tolerance."""
    ok = abs(computed - expected) <= tolerance
    mark = "PASS" if ok else "*** FAIL ***"
    return f"  {label:30s}  Computed: {fmt(computed):>15s}  Expected: {fmt(expected):>15s}  [{mark}]"

all_pass = True
results_log = []

def check(label, computed, expected, tolerance=1):
    global all_pass
    ok = abs(computed - expected) <= tolerance
    if not ok:
        all_pass = False
    line = verify(label, computed, expected, tolerance)
    results_log.append(line)
    return line


# ─── ANNUAL (Year 1) ─────────────────────────────────────────────────────
print("=" * 80)
print("ANNUAL (YEAR 1) COMPARISON")
print("=" * 80)

# Expected values from spec
exp_annual = {
    'typical': {
        'emp_cost': 75_000, 'own_cost': 9_000, 'expense': 84_000,
        'owner_ret': 9_000, 'credits': 0, 'tax_ded': 25_200, 'net': 49_800
    },
    'standard': {
        'emp_cost': 25_000, 'own_cost': 9_000, 'expense': 34_000,
        'owner_ret': 9_000, 'credits': 30_500, 'tax_ded': 2_700, 'net': -8_200
    },
    'optimized': {
        'emp_cost': 25_000, 'own_cost': 60_000, 'expense': 85_000,
        'owner_ret': 60_000, 'credits': 30_500, 'tax_ded': 18_000, 'net': -23_500
    }
}

for name, ann, exp in [
    ("TYPICAL",   typ_ann[0], exp_annual['typical']),
    ("PF STANDARD", std_ann[0], exp_annual['standard']),
    ("PF OPTIMIZED", opt_ann[0], exp_annual['optimized']),
]:
    print(f"\n  --- {name} ---")
    print(check(f"{name} Emp Cost",     ann['emp_cost'],  exp['emp_cost']))
    print(check(f"{name} Owner Cost",   ann['own_cost'],  exp['own_cost']))
    print(check(f"{name} Expense",      ann['expense'],   exp['expense']))
    print(check(f"{name} Owner Retained", ann['owner_ret'], exp['owner_ret']))
    print(check(f"{name} Credits",      ann['credits'],   exp['credits']))
    print(check(f"{name} Tax Savings",  ann['tax_ded'],   exp['tax_ded']))
    print(check(f"{name} Net Cost",     ann['net'],       exp['net']))


# ─── 5-YEAR CUMULATIVE ───────────────────────────────────────────────────
print()
print("=" * 80)
print("5-YEAR CUMULATIVE COMPARISON")
print("=" * 80)

exp_5yr = {
    'typical': {
        'emp_cost': 375_000, 'own_cost': 45_000, 'expense': 420_000,
        'credits': 0, 'deductible': 420_000,
        'tax_savings_combined': 126_000, 'net': 249_000
    },
    'standard': {
        'emp_cost': 125_000, 'own_cost': 45_000, 'expense': 170_000,
        'credits': 104_000, 'deductible': 82_500,
        'tax_savings_combined': 128_750, 'net': -3_750
    },
    'optimized': {
        'emp_cost': 233_325, 'own_cost': 300_000, 'expense': 533_325,
        'credits': 104_000, 'deductible': 445_825,
        'tax_savings_combined': 237_748, 'net': -4_423
    }
}

for name, cum, exp in [
    ("TYPICAL",     typ_cum[5], exp_5yr['typical']),
    ("PF STANDARD", std_cum[5], exp_5yr['standard']),
    ("PF OPTIMIZED", opt_cum[5], exp_5yr['optimized']),
]:
    print(f"\n  --- {name} ---")
    print(check(f"{name} 5yr Emp Cost",     cum['emp_cost'],  exp['emp_cost']))
    print(check(f"{name} 5yr Owner Cost",   cum['own_cost'],  exp['own_cost']))
    print(check(f"{name} 5yr Expense",      cum['expense'],   exp['expense']))
    print(check(f"{name} 5yr Credits",      cum['credits'],   exp['credits']))
    print(check(f"{name} 5yr Deductible",   cum['deductible'], exp['deductible']))
    print(check(f"{name} 5yr TaxSav(comb)", cum['tax_savings_combined'], exp['tax_savings_combined'], tolerance=2))
    print(check(f"{name} 5yr Net Cost",     cum['net'],       exp['net'], tolerance=2))


# ─── 3-YEAR CUMULATIVE ───────────────────────────────────────────────────
print()
print("=" * 80)
print("3-YEAR CUMULATIVE (CALCULATED, NO EXPECTED FROM SPEC)")
print("=" * 80)

for name, cum in [("TYPICAL", typ_cum[3]), ("PF STANDARD", std_cum[3]), ("PF OPTIMIZED", opt_cum[3])]:
    print(f"\n  --- {name} ---")
    print(f"    Emp Cost:     {fmt(cum['emp_cost']):>15s}")
    print(f"    Owner Cost:   {fmt(cum['own_cost']):>15s}")
    print(f"    Expense:      {fmt(cum['expense']):>15s}")
    print(f"    Owner Ret:    {fmt(cum['owner_ret']):>15s}")
    print(f"    Credits:      {fmt(cum['credits']):>15s}")
    print(f"    Deductible:   {fmt(cum['deductible']):>15s}")
    print(f"    Tax Ded:      {fmt(cum['tax_ded']):>15s}")
    print(f"    TaxSav(comb): {fmt(cum['tax_savings_combined']):>15s}")
    print(f"    Net Cost:     {fmt(cum['net']):>15s}")


# ─── YEAR-BY-YEAR DETAIL ─────────────────────────────────────────────────
print()
print("=" * 80)
print("YEAR-BY-YEAR BREAKDOWN")
print("=" * 80)

for strategy_name, ann_data, contrib_sched in [
    ("TYPICAL",       typ_ann, None),
    ("PF STANDARD",   std_ann, STD_EMP_CONTRIB),
    ("PF OPTIMIZED",  opt_ann, OPT_EMP_CONTRIB),
]:
    print(f"\n  ═══ {strategy_name} ═══")
    header = f"  {'Yr':>2s}  {'EmpCost':>10s}  {'OwnCost':>10s}  {'Expense':>10s}  {'OwnRet':>10s}  {'Credits':>10s}  {'Deductible':>10s}  {'TaxDed':>10s}  {'Net':>10s}"
    print(header)
    print("  " + "─" * (len(header) - 2))
    for yr in range(5):
        a = ann_data[yr]
        ded = a.get('deductible', a['expense'])  # typical: full expense
        print(f"  {yr+1:>2d}  {fmt(a['emp_cost']):>10s}  {fmt(a['own_cost']):>10s}  "
              f"{fmt(a['expense']):>10s}  {fmt(a['owner_ret']):>10s}  "
              f"{fmt(a['credits']):>10s}  {fmt(ded):>10s}  "
              f"{fmt(a['tax_ded']):>10s}  {fmt(a['net']):>10s}")
    if contrib_sched:
        print(f"\n  Credit detail per year:")
        for yr in range(5):
            a = ann_data[yr]
            print(f"    Y{yr+1}: admin=${a['admin_cr']:,}  contrib=${a['contrib_cr']:,.0f}  "
                  f"total=${a['credits']:,.0f}  uncredited_emp=${a['uncredited']:,.0f}  "
                  f"deductible=${a['deductible']:,.0f}")


# ─── FORFEITURES ──────────────────────────────────────────────────────────
print()
print("=" * 80)
print("FORFEITURES (Change 16)")
print("=" * 80)

print(f"\n  Standard forfeitures by year: {std_forfeit}")
print(f"  Optimized forfeitures by year: {opt_forfeit}")
print(f"  Standard 5yr total: ${sum(std_forfeit):,}")
print(f"  Optimized 5yr total: ${sum(opt_forfeit):,}")

# Show forfeiture calc detail
print("\n  --- Forfeiture Calculation Detail ---")
for sname, sched, results in [("Standard", STD_EMP_CONTRIB, std_forfeit),
                               ("Optimized", OPT_EMP_CONTRIB, opt_forfeit)]:
    print(f"\n  [{sname}]  contrib_schedule = {sched}")
    for yr in range(5):
        if yr == 0:
            per_emp = sched[0]
            method = f"contrib[0] = {sched[0]}"
        elif yr == 1:
            per_emp = (sched[0] + sched[1]) * 0.75
            method = f"(contrib[0]+contrib[1])*0.75 = ({sched[0]}+{sched[1]})*0.75 = {per_emp:.2f}"
        else:
            one = sched[yr]
            two = sched[yr] + sched[yr - 1]
            per_emp = (one + two) / 2
            method = f"avg(1yr={one}, 2yr={two}) = {per_emp:.2f}"
        growth = (1 + TREASURY_GROWTH) ** max(0, yr * 0.5)
        adjusted = per_emp * growth
        total = round(TURNOVER_PCT * EMPLOYEES * adjusted)
        print(f"    Y{yr+1}: {method}  x growth({growth:.4f}) = {adjusted:.2f}  "
              f"x {TURNOVER_PCT}x{EMPLOYEES} = {total}")


# ─── TOTAL OWNERSHIP BENEFIT ─────────────────────────────────────────────
print()
print("=" * 80)
print("TOTAL OWNERSHIP BENEFIT (5-YEAR)")
print("=" * 80)

# Total Ownership Benefit = Owner Retained + Credits + Tax Savings from Deductions + Forfeitures
# Or equivalently = Owner Retained + Tax Savings (combined) + Forfeitures
# From net cost perspective: TOB = -(Net Cost - Expense)  ... let me think
# Net Cost = Expense - Owner Retained - Credits - Tax from Deductions
# So Owner Retained + Credits + Tax from Ded = Expense - Net
# TOB = Owner Retained + Credits + Tax from Ded + Forfeitures = (Expense - Net) + Forfeitures

for name, cum, forfeit_list in [
    ("TYPICAL",      typ_cum[5], [0]*5),
    ("PF STANDARD",  std_cum[5], std_forfeit),
    ("PF OPTIMIZED", opt_cum[5], opt_forfeit),
]:
    forfeit_total = sum(forfeit_list)
    owner_ret = cum['owner_ret']
    credits = cum['credits']
    tax_ded = cum['tax_ded']
    tob = owner_ret + credits + tax_ded + forfeit_total
    print(f"\n  --- {name} ---")
    print(f"    Owner Retained:         {fmt(owner_ret):>15s}")
    print(f"    Credits:                {fmt(credits):>15s}")
    print(f"    Tax Savings (deduct):   {fmt(tax_ded):>15s}")
    print(f"    Forfeitures:            {fmt(forfeit_total):>15s}")
    print(f"    ─────────────────────────────────────")
    print(f"    Total Ownership Benefit:{fmt(tob):>15s}")
    print(f"    vs Expense:             {fmt(cum['expense']):>15s}")
    print(f"    Net Cost (Exp - TOB + forf): {fmt(cum['expense'] - tob + forfeit_total):>15s}")
    print(f"    Net Cost (from calc):   {fmt(cum['net']):>15s}")


# ─── WATERFALL (Annual Y1) ───────────────────────────────────────────────
print()
print("=" * 80)
print("ANNUAL Y1 WATERFALL")
print("=" * 80)

for name, ann in [("TYPICAL", typ_ann[0]), ("PF STANDARD", std_ann[0]), ("PF OPTIMIZED", opt_ann[0])]:
    print(f"\n  --- {name} ---")
    print(f"    Expense:          {fmt(ann['expense']):>12s}")
    print(f"    - Owner Retained: {fmt(-ann['owner_ret']):>12s}")
    print(f"    - Credits:        {fmt(-ann['credits']):>12s}")
    print(f"    - Tax Savings:    {fmt(-ann['tax_ded']):>12s}")
    print(f"    ─────────────────────────────────")
    print(f"    = Net Cost:       {fmt(ann['net']):>12s}")
    running = ann['expense'] - ann['owner_ret'] - ann['credits'] - ann['tax_ded']
    print(f"    (verify sum:      {fmt(running):>12s})")


# ─── FINAL SUMMARY ───────────────────────────────────────────────────────
print()
print("=" * 80)
print("VERIFICATION SUMMARY")
print("=" * 80)
for line in results_log:
    print(line)

print()
if all_pass:
    print("*** ALL CHECKS PASSED ***")
else:
    fail_count = sum(1 for l in results_log if "FAIL" in l)
    pass_count = sum(1 for l in results_log if "PASS" in l)
    print(f"*** {fail_count} FAILED, {pass_count} PASSED ***")

print()
print("=" * 80)
print("DONE")
print("=" * 80)
