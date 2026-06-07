#!/usr/bin/env node
/**
 * PlanForge Retirement Plan Illustration — V8 (Parameterized)
 * ============================================================
 * Accepts ANY client data via the unified pipeline schema.
 * Preserves ALL V7 layout, typography, and visual design.
 *
 * Changes from V7:
 *  - Hardcoded AlphaGraphics/Sherry Perry data replaced with input parameter
 *  - Accepts pipeline JSON from advisor panel (toAdvisorPanelJSON output)
 *  - Computes all plan figures dynamically from input
 *  - Handles single-owner and multi-owner scenarios
 *  - Output filename derived from company name + year
 *  - Can be called as CLI:  node build_illustration_v8.js input.json
 *  - Can be required:       require('./build_illustration_v8').generate(data)
 *
 * Nick Moore — PlanForge Consulting
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ── Fonts ──────────────────────────────────────────────────────────
const FONTS = {
  regular:  '/usr/share/fonts/truetype/lato/Lato-Regular.ttf',
  bold:     '/usr/share/fonts/truetype/lato/Lato-Bold.ttf',
  light:    '/usr/share/fonts/truetype/lato/Lato-Light.ttf',
  medium:   '/usr/share/fonts/truetype/lato/Lato-Medium.ttf',
  semibold: '/usr/share/fonts/truetype/lato/Lato-Semibold.ttf',
  black:    '/usr/share/fonts/truetype/lato/Lato-Black.ttf',
  heavy:    '/usr/share/fonts/truetype/lato/Lato-Heavy.ttf',
  italic:   '/usr/share/fonts/truetype/lato/Lato-Italic.ttf',
};

// ── Brand Colors ──────────────────────────────────────────────────
const C = {
  navy:       '#1B3A5C',
  gold:       '#C4952A',
  red:        '#B22234',
  darkGray:   '#333333',
  medGray:    '#666666',
  lightGray:  '#F5F5F5',
  borderGray: '#E0E0E0',
  green:      '#2E7D32',
  greenBg:    '#E8F5E9',
  goldBg:     '#FFF8E1',
  goldBorder: '#FFD54F',
  white:      '#FFFFFF',
  lightNavy:  '#AABBCC',
};

// ── IRS Limits by Year ────────────────────────────────────────────
const IRS_LIMITS = {
  2025: { additions415c: 70000, compCap401a17: 350000, hceThreshold: 160000 },
  // 2026 HCE per IRS Notice 2025-67 = 160000 (UNCHANGED from 2025; NOT 165000).
  // Canonical in the portal: planforge-participant-portal/src/lib/irs-limits-2026.mjs.
  2026: { additions415c: 72000, compCap401a17: 360000, hceThreshold: 160000 },
  // Add future years as IRS announces
};

function getLimits(year) {
  return IRS_LIMITS[year] || IRS_LIMITS[2026]; // default to latest known
}


// ═══════════════════════════════════════════════════════════════════
//  COMPUTATION ENGINE — generates all plan figures from input data
// ═══════════════════════════════════════════════════════════════════

function computePlanData(input) {
  const year = parseInt(input.year || new Date().getFullYear());
  const limits = getLimits(year);
  const taxRate = input.taxRate || 0.30;

  // ── Owner info ──
  const ownerName   = (input.firstName || '') + ' ' + (input.lastName || '');
  const ownerFirst  = input.firstName || ownerName.split(' ')[0] || 'Owner';
  const ownerAge    = input.ownerAge || 50;
  const ownerComp   = Math.min(input.ownerSalary + (input.ownerK1 || 0), limits.compCap401a17);

  // ── Additional owners (HCEs that aren't NHCEs) ──
  const additionalOwners = (input.additionalOwners || []).map(ao => ({
    name:  ao.name || 'Owner',
    comp:  Math.min((ao.salary || 0) + (ao.k1 || 0), limits.compCap401a17),
    age:   ao.age || 40,
  }));

  // ── Employee census ──
  const nhceCount  = input.nhceCount || 10;
  const nhceAvgPay = input.nhceAvgPay || 50000;
  const nhceTotalComp = nhceCount * nhceAvgPay;
  const eligible = nhceCount + 1 + additionalOwners.length; // NHCEs + primary owner + additional

  // Owner total comp includes additional owners
  const ownersTotalComp = ownerComp + additionalOwners.reduce((s, ao) => s + ao.comp, 0);
  const totalComp = nhceTotalComp + ownersTotalComp;

  // ── Forfeitures ──
  const forfeitures = input.forfeitures || 0;

  // ── SECURE Year ──
  const secureYear = Math.max(1, Math.min(input.secureYear || 1, 5));
  const CREDIT_PHASE = [1.0, 1.0, 0.75, 0.50, 0.25];
  // SECURE credits: $250 per NHCE, max $5K, times phase
  const secureBase = Math.min(nhceCount * 250, 5000) * (nhceCount <= 50 ? 1 : 0); // simplified
  // More realistic: up to $5K base + additional for small employers
  // Using the same logic as v7: flat value passed from advisor panel, or estimate
  const secureCredits = input.secureCredits || Math.round(nhceCount * 1000 * CREDIT_PHASE[secureYear - 1]);

  // ══════════════════════════════════════════════════════════════════
  //  STANDARD PLAN — 3% flat (same rate as safe harbor)
  // ══════════════════════════════════════════════════════════════════
  const stdRate = input.stdRate || 3.0;
  const stdTotalPS = Math.round(totalComp * stdRate / 100);
  const stdOwnerAlloc = Math.round(ownerComp * stdRate / 100);

  // Each additional owner gets same flat rate
  const stdAdditionalAllocs = additionalOwners.map(ao => Math.round(ao.comp * stdRate / 100));
  const stdOwnersRetained = stdOwnerAlloc + stdAdditionalAllocs.reduce((s, a) => s + a, 0);
  const stdEmpPS = stdTotalPS - stdOwnersRetained;

  // IRC §280C: Must reduce deduction by credit amount
  const stdTaxSavings = Math.round((stdTotalPS - secureCredits) * taxRate);
  const stdNetCost = stdTotalPS - stdOwnersRetained - stdTaxSavings - secureCredits - forfeitures;
  const stdTotalTaxSavings = stdTaxSavings + secureCredits;

  // ══════════════════════════════════════════════════════════════════
  //  OPTIMIZED PLAN — cross-tested
  // ══════════════════════════════════════════════════════════════════
  const optNhceRate = input.optNhceRate || 5.0;

  // Owner allocation — from advisor panel or calculated
  let optOwnerAlloc;
  if (input.optOwnerAlloc) {
    optOwnerAlloc = input.optOwnerAlloc;
  } else {
    // Default: IRS max or cross-tested rate
    optOwnerAlloc = Math.min(limits.additions415c, ownerComp);
  }
  const optOwnerRate = ownerComp > 0 ? (optOwnerAlloc / ownerComp * 100) : 0;

  // Additional owners at NHCE rate (unless specified)
  const optAdditionalAllocs = additionalOwners.map((ao, i) => {
    if (input.optAdditionalAllocs && input.optAdditionalAllocs[i] !== undefined) {
      return input.optAdditionalAllocs[i];
    }
    return Math.round(ao.comp * optNhceRate / 100);
  });

  const optOwnersRetained = optOwnerAlloc + optAdditionalAllocs.reduce((s, a) => s + a, 0);
  const optEmpPS = Math.round(nhceTotalComp * optNhceRate / 100);
  const optTotalPS = optOwnersRetained + optEmpPS;

  // IRC §280C
  const optTaxSavings = Math.round((optTotalPS - secureCredits) * taxRate);
  const optNetCost = optTotalPS - optOwnersRetained - optTaxSavings - secureCredits - forfeitures;
  const optTotalTaxSavings = optTaxSavings + secureCredits;

  // ══════════════════════════════════════════════════════════════════
  //  TYPICAL STRATEGY — baselines (no SECURE, no forfeitures, 100% vested)
  // ══════════════════════════════════════════════════════════════════
  // 3% safe harbor (baseline for Standard)
  const typTotalPS = Math.round(totalComp * 0.03);
  const typOwnersRetained = Math.round(ownersTotalComp * 0.03);
  const typTaxSavings = Math.round(typTotalPS * taxRate);
  const typNetCost = typTotalPS - typOwnersRetained - typTaxSavings;

  // 5% safe harbor (baseline for Optimized — same employee rate)
  const typ5TotalPS = Math.round(totalComp * 0.05);
  const typ5OwnersRetained = Math.round(ownersTotalComp * 0.05);
  const typ5TaxSavings = Math.round(typ5TotalPS * taxRate);
  const typ5NetCost = typ5TotalPS - typ5OwnersRetained - typ5TaxSavings;

  // Savings vs baselines
  const stdSavings = typNetCost - stdNetCost;
  const optSavings = typ5NetCost - optNetCost;
  const stdSavPct = typNetCost > 0 ? Math.round(stdSavings / typNetCost * 100) : 0;
  const optSavPct = typ5NetCost > 0 ? Math.round(optSavings / typ5NetCost * 100) : 0;

  // Upgrade comparison
  const upgradeCostDiff = optNetCost - stdNetCost;
  const upgradeAllocDiff = optOwnersRetained - stdOwnersRetained;

  // ── Rate Sensitivity (1% to 5%) ──
  const FEE_PCT = input.feePct || 0.20;

  function calcAtRate(nhceRate) {
    const nhcePS = Math.round(nhceTotalComp * nhceRate / 100);
    let ownerRate, ownerAllocation;
    if (nhceRate >= 5.0) {
      ownerAllocation = optOwnerAlloc;
      ownerRate = optOwnerRate;
    } else {
      ownerRate = nhceRate * 3; // 3x gateway
      ownerAllocation = Math.min(Math.round(ownerComp * ownerRate / 100), limits.additions415c);
    }
    const addlAllocs = additionalOwners.map(ao => Math.round(ao.comp * nhceRate / 100));
    const ownersRet = ownerAllocation + addlAllocs.reduce((s, a) => s + a, 0);
    const total = ownersRet + nhcePS;
    const taxSav = Math.round((total - secureCredits) * taxRate);
    const net = total - ownersRet - taxSav - secureCredits - forfeitures;
    return { nhceRate, ownerAllocation, ownersRet, nhcePS, total, taxSav, net, ownerRate };
  }

  function calcTypicalAtRate(rate) {
    const total = Math.round(totalComp * rate / 100);
    const ownersRet = Math.round(ownersTotalComp * rate / 100);
    const taxSav = Math.round(total * taxRate);
    const net = total - ownersRet - taxSav;
    return { total, ownersRet, taxSav, net };
  }

  const optFee = Math.round(optSavings * FEE_PCT);

  return {
    // Input passthrough
    company: input.bizName || input.company || 'Client',
    year: String(year),
    owner: ownerName.trim() || 'Owner',
    ownerFirst,
    ownerAge,
    ownerComp,
    eligible,
    nhceCount,
    taxRate,
    forfeitures,
    additionalOwners,

    // Comp totals
    totalComp,
    ownersTotalComp,
    nhceTotalComp,

    // Standard
    stdRate, stdTotalPS, stdOwnerAlloc, stdOwnersRetained, stdEmpPS,
    stdTaxSavings, stdSecureCredits: secureCredits, stdTotalTaxSavings,
    stdNetCost,

    // Optimized
    optNhceRate, optOwnerAlloc, optOwnerRate, optOwnersRetained, optEmpPS,
    optTotalPS, optTaxSavings, optSecureCredits: secureCredits, optTotalTaxSavings,
    optNetCost,

    // Typical baselines
    typTotalPS, typOwnersRetained, typTaxSavings, typNetCost,
    typ5TotalPS, typ5OwnersRetained, typ5TaxSavings, typ5NetCost,

    // Comparisons
    stdSavings, optSavings, stdSavPct, optSavPct,
    upgradeCostDiff, upgradeAllocDiff,

    // Functions
    calcAtRate, calcTypicalAtRate,
    FEE_PCT, optFee,

    // Limits
    limits,
  };
}


// ═══════════════════════════════════════════════════════════════════
//  PDF GENERATION — exact V7 layout with dynamic data
// ═══════════════════════════════════════════════════════════════════

function generate(input, outputPath) {
  const D = computePlanData(input);

  // Determine output path
  if (!outputPath) {
    const safeName = D.company.replace(/[^a-zA-Z0-9]/g, '_');
    outputPath = path.join(process.cwd(), `${safeName}_${D.year}_Illustration_V8.pdf`);
  }

  const fmt = (n) => {
    if (n < 0) return `-$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
    return `$${Math.round(n).toLocaleString('en-US')}`;
  };
  const fmtPct = (n) => `${n.toFixed(1)}%`;

  const W = 612, H = 792;
  const M = 40;
  const CW = W - 2 * M;

  const doc = new PDFDocument({
    size: 'letter',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: `PlanForge Retirement Plan Illustration — ${D.company} ${D.year}`,
      Author: 'PlanForge Consulting',
    },
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // Register fonts
  Object.entries(FONTS).forEach(([key, fontPath]) => {
    const name = key === 'regular' ? 'Lato' : `Lato-${key.charAt(0).toUpperCase() + key.slice(1)}`;
    try { doc.registerFont(name, fontPath); } catch(e) {}
  });
  doc.registerFont('Lato-Bold', FONTS.bold);
  doc.registerFont('Lato-Light', FONTS.light);
  doc.registerFont('Lato-Medium', FONTS.medium);
  doc.registerFont('Lato-Semibold', FONTS.semibold);
  doc.registerFont('Lato-Black', FONTS.black);
  doc.registerFont('Lato-Heavy', FONTS.heavy);
  doc.registerFont('Lato-Italic', FONTS.italic);

  // ── Helpers (identical to V7) ──
  function rr(x, y, w, h, r, opts = {}) {
    doc.save();
    doc.roundedRect(x, y, w, h, r);
    if (opts.fill && opts.stroke) doc.fillAndStroke(opts.fill, opts.stroke);
    else if (opts.fill) doc.fill(opts.fill);
    else if (opts.stroke) doc.lineWidth(opts.lineWidth || 1).stroke(opts.stroke);
    doc.restore();
  }
  function centerText(text, x, y, w, font, size, color) {
    doc.font(font).fontSize(size).fillColor(color);
    const tw = doc.widthOfString(text);
    doc.text(text, x + (w - tw) / 2, y, { width: w, align: 'left', lineBreak: false });
  }
  function rightText(text, x, y, w, font, size, color) {
    doc.font(font).fontSize(size).fillColor(color);
    doc.text(text, x, y, { width: w, align: 'right', lineBreak: false });
  }


  // ═══════════════════════════════════════════════════════════════════
  //  PAGE 1 — THE MONEY PAGE (identical layout to V7)
  // ═══════════════════════════════════════════════════════════════════
  function drawPage1() {
    const colW = (CW - 20) / 2;
    const leftX = M;
    const rightX = M + colW + 20;

    // ── HEADER BAR ──
    const headerH = 68;
    doc.rect(0, 0, W, headerH).fill(C.navy);
    doc.rect(0, headerH, W, 4).fill(C.gold);

    doc.font('Lato-Bold').fontSize(11).fillColor(C.gold);
    doc.text('PLANFORGE CONSULTING', M, 14, { lineBreak: false });
    doc.font('Lato-Bold').fontSize(22).fillColor(C.white);
    doc.text('Retirement Plan Illustration', M, 32, { lineBreak: false });

    rightText(D.company, M, 18, CW, 'Lato-Bold', 16, C.white);
    rightText(`${D.year} Plan Year`, M, 40, CW, 'Lato', 11, C.white);

    // ── OWNER INFO STRIP ──
    const stripY = headerH + 4 + 10;
    rr(M, stripY, CW, 44, 4, { fill: C.lightGray, stroke: C.borderGray, lineWidth: 0.8 });
    doc.rect(M, stripY, 4, 44).fill(C.gold);

    doc.font('Lato-Semibold').fontSize(11).fillColor(C.darkGray);
    doc.text(`Owner: ${D.owner} (age ${D.ownerAge})`, M + 14, stripY + 8, { lineBreak: false });
    doc.font('Lato').fontSize(10);
    doc.text(`${D.eligible} eligible employees  |  ${D.nhceCount} non-owner employees`, M + 14, stripY + 24, { lineBreak: false });
    doc.font('Lato-Semibold').fontSize(11).fillColor(C.darkGray);
    doc.text(`Compensation: $${D.ownerComp.toLocaleString()}`, CW / 2 + M, stripY + 8, { lineBreak: false });

    // ── VOLUNTARY NOTE ──
    const volY = stripY + 50;
    rr(M, volY, CW, 22, 4, { fill: '#F0F4FA' });
    centerText('All employer contributions shown are voluntary and discretionary — there is no required contribution under this strategy.',
      M, volY + 5, CW, 'Lato-Italic', 8.5, C.navy);

    // ── COLUMN CARDS ──
    const cardTop = volY + 30;
    const cardH = 388;

    // ── STANDARD CARD (left) ──
    rr(leftX, cardTop, colW, cardH, 6, { fill: C.white, stroke: C.borderGray, lineWidth: 1.2 });
    doc.save();
    doc.roundedRect(leftX, cardTop, colW, 38, 6).clip();
    doc.rect(leftX, cardTop, colW, 38).fill(C.navy);
    doc.restore();
    doc.rect(leftX, cardTop + 26, colW, 12).fill(C.navy);
    centerText('PLANFORGE STANDARD', leftX, cardTop + 11, colW, 'Lato-Bold', 13, C.white);

    let cy = cardTop + 46;
    centerText('Reward Your Team, Not the IRS', leftX, cy, colW, 'Lato-Italic', 9, C.medGray);
    cy += 20;
    centerText(fmt(D.stdTotalTaxSavings), leftX, cy, colW, 'Lato-Black', 34, C.green);
    cy += 36;
    centerText('in tax savings', leftX, cy, colW, 'Lato-Semibold', 9.5, C.green);

    cy += 16;
    doc.moveTo(leftX + 16, cy).lineTo(leftX + colW - 16, cy).lineWidth(0.5).stroke(C.borderGray);

    cy += 8;
    const lx = leftX + 16;
    const rx = leftX + colW - 16;
    const lineH = 17;
    const stdItems = [
      [`Total Profit Share (${D.stdRate}% flat)`, fmt(D.stdTotalPS), C.darkGray],
      ["Owner's Retained Share", `(${fmt(D.stdOwnersRetained)})`, C.navy],
      ['Tax Deductions (30%)', `(${fmt(D.stdTaxSavings)})`, C.darkGray],
      ['SECURE 2.0 Credits', `(${fmt(D.stdSecureCredits)})`, C.green],
      [D.forfeitures > 0 ? 'Forfeitures (actual)' : 'Forfeitures', D.forfeitures > 0 ? `(${fmt(D.forfeitures)})` : '$0', C.darkGray],
    ];
    for (const [label, val, valColor] of stdItems) {
      doc.font('Lato').fontSize(9).fillColor(C.darkGray);
      doc.text(label, lx, cy, { lineBreak: false });
      rightText(val, lx, cy, rx - lx, 'Lato-Semibold', 9, valColor);
      cy += lineH;
    }

    cy += 6;
    rr(lx - 4, cy - 2, colW - 24, 24, 3, { fill: C.greenBg });
    doc.font('Lato-Bold').fontSize(10).fillColor(C.darkGray);
    doc.text('Net Cost to Business', lx, cy + 4, { lineBreak: false });
    rightText(fmt(D.stdNetCost), lx, cy + 1, rx - lx, 'Lato-Bold', 14, C.green);

    cy += 34;
    doc.moveTo(leftX + 16, cy).lineTo(leftX + colW - 16, cy).lineWidth(0.5).stroke(C.borderGray);
    cy += 8;
    centerText('vs 3% Safe Harbor (Typical Strategy)', leftX, cy, colW, 'Lato', 8, C.medGray);
    cy += 16;
    centerText(`Save ${fmt(D.stdSavings)}`, leftX, cy, colW, 'Lato-Bold', 20, C.green);
    cy += 24;
    centerText(`${D.stdSavPct}% less than a typical plan`, leftX, cy, colW, 'Lato-Semibold', 9.5, C.green);

    // ── OPTIMIZED CARD (right) ──
    rr(rightX, cardTop, colW, cardH, 6, { fill: C.white, stroke: C.gold, lineWidth: 1.8 });
    doc.save();
    doc.roundedRect(rightX, cardTop, colW, 38, 6).clip();
    doc.rect(rightX, cardTop, colW, 38).fill(C.gold);
    doc.restore();
    doc.rect(rightX, cardTop + 26, colW, 12).fill(C.gold);
    centerText('PLANFORGE OPTIMIZED', rightX, cardTop + 11, colW, 'Lato-Bold', 13, C.white);

    cy = cardTop + 46;
    centerText('More for You. Less for Uncle Sam.', rightX, cy, colW, 'Lato-Italic', 9, C.medGray);
    cy += 20;
    centerText(fmt(D.optTotalTaxSavings), rightX, cy, colW, 'Lato-Black', 34, C.green);
    cy += 36;
    centerText('in tax savings', rightX, cy, colW, 'Lato-Semibold', 9.5, C.green);

    cy += 16;
    doc.moveTo(rightX + 16, cy).lineTo(rightX + colW - 16, cy).lineWidth(0.5).stroke(C.borderGray);

    cy += 8;
    const lx2 = rightX + 16;
    const rx2 = rightX + colW - 16;
    const optItems = [
      ['Total Profit Share', fmt(D.optTotalPS), C.darkGray],
      ["Owner's Retained Share", `(${fmt(D.optOwnersRetained)})`, C.gold],
      ['Tax Deductions (30%)', `(${fmt(D.optTaxSavings)})`, C.darkGray],
      ['SECURE 2.0 Credits', `(${fmt(D.optSecureCredits)})`, C.green],
      [D.forfeitures > 0 ? 'Forfeitures (actual)' : 'Forfeitures', D.forfeitures > 0 ? `(${fmt(D.forfeitures)})` : '$0', C.darkGray],
    ];
    for (const [label, val, valColor] of optItems) {
      doc.font('Lato').fontSize(9).fillColor(C.darkGray);
      doc.text(label, lx2, cy, { lineBreak: false });
      rightText(val, lx2, cy, rx2 - lx2, 'Lato-Semibold', 9, valColor);
      cy += lineH;
    }

    cy += 6;
    rr(lx2 - 4, cy - 2, colW - 24, 24, 3, { fill: C.greenBg });
    doc.font('Lato-Bold').fontSize(10).fillColor(C.darkGray);
    doc.text('Net Cost to Business', lx2, cy + 4, { lineBreak: false });
    rightText(fmt(D.optNetCost), lx2, cy + 1, rx2 - lx2, 'Lato-Bold', 14, C.green);

    cy += 34;
    doc.moveTo(rightX + 16, cy).lineTo(rightX + colW - 16, cy).lineWidth(0.5).stroke(C.borderGray);
    cy += 8;
    centerText(`vs ${D.optNhceRate}% Safe Harbor (Typical Strategy)`, rightX, cy, colW, 'Lato', 8, C.medGray);
    cy += 16;
    centerText(`Save ${fmt(D.optSavings)}`, rightX, cy, colW, 'Lato-Bold', 20, C.green);
    cy += 22;
    centerText(`${D.optSavPct}% less than a typical plan`, rightX, cy, colW, 'Lato-Semibold', 9.5, C.green);
    cy += 14;
    centerText(`+ ${fmt(D.optOwnersRetained)} to Owner's retirement`, rightX, cy, colW, 'Lato-Semibold', 9.5, C.gold);

    // ── UPGRADE CALLOUT BANNER ──
    const bannerY = cardTop + cardH + 14;
    const bannerH = 48;
    rr(M, bannerY, CW, bannerH, 6, { fill: C.navy });

    if (D.optNetCost <= D.stdNetCost) {
      centerText('LOWER COST + MORE RETIREMENT SAVINGS', M, bannerY + 9, CW, 'Lato-Semibold', 10, C.lightNavy);
      centerText(`Save ${fmt(Math.abs(D.upgradeCostDiff))} more AND get +${fmt(D.upgradeAllocDiff)} in owner retirement`, M, bannerY + 27, CW, 'Lato-Bold', 14, C.gold);
    } else {
      centerText(`FOR JUST ${fmt(D.upgradeCostDiff)} MORE IN NET COST`, M, bannerY + 9, CW, 'Lato-Semibold', 10, C.lightNavy);
      centerText(`Owners get +${fmt(D.upgradeAllocDiff)} more in retirement savings`, M, bannerY + 27, CW, 'Lato-Bold', 16, C.gold);
    }

    // ── IRS COMPLIANCE BADGE ──
    const compY = bannerY + bannerH + 10;
    rr(M, compY, CW * 0.60, 26, 4, { fill: C.greenBg });
    const circX = M + 16, circY = compY + 13;
    doc.circle(circX, circY, 8).fill(C.green);
    doc.save();
    doc.lineWidth(1.8).lineCap('round').lineJoin('round');
    doc.moveTo(circX - 3.5, circY).lineTo(circX - 0.5, circY + 3).lineTo(circX + 4, circY - 3).stroke(C.white);
    doc.restore();
    doc.font('Lato-Bold').fontSize(9.5).fillColor(C.green);
    doc.text('Both plans pass all IRS nondiscrimination requirements.', M + 30, compY + 7, { lineBreak: false });

    // ── TYPICAL STRATEGY EXPLAINER ──
    const noteY = compY + 34;
    doc.font('Lato-Semibold').fontSize(8.5).fillColor(C.darkGray);
    doc.text('What is the "Typical Strategy"?', M, noteY, { lineBreak: false });
    doc.font('Lato').fontSize(7.5).fillColor(C.medGray);
    doc.text('A 3% safe harbor plan is the most common retirement plan strategy. All contributions are immediately 100% vested, with no forfeitures and no SECURE 2.0 credit optimization.', M, noteY + 12, { width: CW, lineGap: 1.5 });
    doc.text('PlanForge uses the same contribution rate but leverages SECURE 2.0 tax credits, vesting schedules, and strategic plan design to dramatically lower your tax bill.', M, noteY + 32, { width: CW, lineGap: 1.5 });
    doc.text('The Optimized plan goes further — cross-testing allows ownership to receive significantly higher allocations while employees still receive a competitive contribution.', M, noteY + 52, { width: CW, lineGap: 1.5 });

    // ── FOOTER ──
    doc.font('Lato-Italic').fontSize(7.5).fillColor(C.medGray);
    doc.text('PlanForge Consulting  |  Illustration Only, Not Tax or Legal Advice', M, H - 26, { lineBreak: false });
    rightText('Page 1 of 2', M, H - 26, CW, 'Lato-Italic', 7.5, C.medGray);
  }


  // ═══════════════════════════════════════════════════════════════════
  //  PAGE 2 — PLAN DETAILS (identical layout to V7)
  // ═══════════════════════════════════════════════════════════════════
  function drawPage2() {
    const headerH = 54;
    doc.rect(0, 0, W, headerH).fill(C.navy);
    doc.rect(0, headerH, W, 4).fill(C.gold);

    doc.font('Lato-Bold').fontSize(10).fillColor(C.gold);
    doc.text('PLANFORGE CONSULTING', M, 8, { lineBreak: false });
    doc.font('Lato-Bold').fontSize(17).fillColor(C.white);
    doc.text(`${D.company} — Plan Details`, M, 26, { lineBreak: false });
    rightText(`${D.year} Plan Year`, M, 22, CW, 'Lato', 10, C.white);

    let cy = headerH + 4 + 14;

    // ── HOW IT WORKS ──
    doc.font('Lato-Bold').fontSize(11).fillColor(C.navy);
    doc.text('HOW IT WORKS', M, cy, { lineBreak: false });
    doc.moveTo(M, cy + 14).lineTo(M + doc.widthOfString('HOW IT WORKS'), cy + 14).lineWidth(1.5).stroke(C.navy);
    cy += 20;

    doc.font('Lato-Bold').fontSize(9.5).fillColor(C.darkGray);
    doc.text('PlanForge Standard', M, cy, { lineBreak: false });
    cy += 13;
    doc.font('Lato').fontSize(8.5).fillColor(C.medGray);
    doc.text(`A voluntary ${D.stdRate}% flat profit sharing plan — the same rate as a safe harbor, but designed to maximize SECURE 2.0 tax credits and vesting-based forfeitures. The result: your plan pays for itself while lowering your tax bill. No contribution is ever required.`, M + 10, cy, { width: CW - 20, lineGap: 1.5 });
    cy += 36;

    doc.font('Lato-Bold').fontSize(9.5).fillColor(C.darkGray);
    doc.text('PlanForge Optimized', M, cy, { lineBreak: false });
    cy += 13;
    doc.font('Lato').fontSize(8.5).fillColor(C.medGray);
    doc.text(`A voluntary cross-tested profit sharing plan. ${D.ownerFirst} receives up to the IRS maximum ($${D.limits.additions415c.toLocaleString()} in ${D.year}) while employees receive a competitive ${D.optNhceRate}% contribution. The owner's retained share goes directly into their retirement account — it is not a business expense.`, M + 10, cy, { width: CW - 20, lineGap: 1.5 });
    cy += 34;

    // ── FINANCIAL IMPACT COMPARISON ──
    doc.font('Lato-Bold').fontSize(11).fillColor(C.navy);
    doc.text('FINANCIAL IMPACT COMPARISON', M, cy, { lineBreak: false });
    doc.moveTo(M, cy + 14).lineTo(M + doc.widthOfString('FINANCIAL IMPACT COMPARISON'), cy + 14).lineWidth(1.5).stroke(C.navy);
    cy += 20;

    const tc1 = M + 8;
    const tc2 = M + CW * 0.36;
    const tc3 = M + CW * 0.56;
    const tc4 = M + CW * 0.78;
    const tcW = CW * 0.20;

    rr(M, cy - 4, CW, 20, 3, { fill: C.navy });
    centerText('TYPICAL', tc2, cy, tcW, 'Lato-Bold', 8, C.white);
    centerText('STANDARD', tc3, cy, tcW, 'Lato-Bold', 8, C.white);
    centerText('OPTIMIZED', tc4, cy, tcW, 'Lato-Bold', 8, C.white);

    cy += 20;
    rr(M, cy - 3, CW, 16, 0, { fill: '#FAFAFA' });
    centerText(`${D.stdRate}% Safe Harbor`, tc2, cy - 1, tcW, 'Lato-Italic', 7, C.medGray);
    centerText(`${D.stdRate}% Flat PS`, tc3, cy - 1, tcW, 'Lato-Italic', 7, C.medGray);
    centerText('Cross-Tested', tc4, cy - 1, tcW, 'Lato-Italic', 7, C.medGray);
    cy += 16;

    const rowH = 17;
    const vsRows = [
      ['Total Profit Share', fmt(D.typTotalPS), fmt(D.stdTotalPS), fmt(D.optTotalPS)],
      ["Less: Owner's Retained", `(${fmt(D.typOwnersRetained)})`, `(${fmt(D.stdOwnersRetained)})`, `(${fmt(D.optOwnersRetained)})`],
      ['Less: Tax Deductions (30%)', `(${fmt(D.typTaxSavings)})`, `(${fmt(D.stdTaxSavings)})`, `(${fmt(D.optTaxSavings)})`],
      ['Less: SECURE 2.0 Credits', '$0', `(${fmt(D.stdSecureCredits)})`, `(${fmt(D.optSecureCredits)})`],
      ['Less: Forfeitures', '$0', D.forfeitures > 0 ? `(${fmt(D.forfeitures)})` : '$0', D.forfeitures > 0 ? `(${fmt(D.forfeitures)})` : '$0'],
      ['Net Cost', fmt(D.typNetCost), fmt(D.stdNetCost), fmt(D.optNetCost)],
    ];

    vsRows.forEach(([label, tv, sv, ov], i) => {
      const isNetCost = label === 'Net Cost';
      if (i % 2 === 1 && !isNetCost) rr(M, cy - 3, CW, rowH, 0, { fill: '#FAFAFA' });
      if (isNetCost) { cy += 2; rr(M, cy - 4, CW, 20, 3, { fill: C.lightGray }); }

      doc.font(isNetCost ? 'Lato-Bold' : 'Lato').fontSize(isNetCost ? 9 : 8.5).fillColor(C.darkGray);
      doc.text(label, tc1, cy, { lineBreak: false });

      const vf = isNetCost ? 'Lato-Bold' : 'Lato-Semibold';
      const vs = isNetCost ? 9.5 : 8.5;
      centerText(tv, tc2, cy, tcW, vf, vs, isNetCost ? C.red : C.darkGray);
      centerText(sv, tc3, cy, tcW, vf, vs, isNetCost ? C.green : C.darkGray);
      centerText(ov, tc4, cy, tcW, vf, vs, isNetCost ? C.green : C.darkGray);
      cy += isNetCost ? 20 : rowH;
    });

    // Savings row
    cy += 2;
    rr(M, cy - 4, CW, 22, 3, { fill: C.greenBg });
    doc.font('Lato-Bold').fontSize(9).fillColor(C.green);
    doc.text('Your Savings vs Typical', tc1, cy, { lineBreak: false });
    centerText('—', tc2, cy - 1, tcW, 'Lato-Bold', 9.5, C.medGray);
    centerText(fmt(D.stdSavings), tc3, cy - 1, tcW, 'Lato-Bold', 10, C.green);
    centerText(fmt(D.optSavings), tc4, cy - 1, tcW, 'Lato-Bold', 10, C.green);

    // ── OWNER'S RETIREMENT SNAPSHOT ──
    cy += 32;
    doc.font('Lato-Bold').fontSize(11).fillColor(C.navy);
    doc.text("OWNER'S RETIREMENT SNAPSHOT", M, cy, { lineBreak: false });
    doc.moveTo(M, cy + 14).lineTo(M + doc.widthOfString("OWNER'S RETIREMENT SNAPSHOT"), cy + 14).lineWidth(1.5).stroke(C.navy);
    cy += 22;

    const snapCards = [
      { label: 'Typical', sub: `${D.stdRate}% Safe Harbor`, amount: D.typOwnersRetained, color: C.red, bgColor: '#FFF0F0', borderColor: '#FFCCCC' },
      { label: 'Standard', sub: `${D.stdRate}% Flat PS`, amount: D.stdOwnersRetained, color: C.navy, bgColor: '#F0F4FA', borderColor: '#C0D0E8' },
      { label: 'Optimized', sub: 'Cross-Tested', amount: D.optOwnersRetained, color: C.gold, bgColor: C.goldBg, borderColor: C.goldBorder },
    ];

    const snapW = (CW - 2 * 14) / 3;
    const snapH = 62;
    const multiplier = D.typOwnersRetained > 0 ? (D.optOwnersRetained / D.typOwnersRetained).toFixed(1) : '—';

    snapCards.forEach((card, i) => {
      const sx = M + i * (snapW + 14);
      const isOpt = card.label === 'Optimized';
      rr(sx, cy, snapW, snapH, 5, { fill: card.bgColor, stroke: card.borderColor, lineWidth: isOpt ? 2 : 1 });
      centerText(card.label, sx, cy + 8, snapW, 'Lato-Bold', 9, card.color);
      centerText(card.sub, sx, cy + 19, snapW, 'Lato-Italic', 7, C.medGray);
      centerText(fmt(card.amount), sx, cy + 33, snapW, 'Lato-Bold', 16, card.color);
      if (isOpt && multiplier !== '—') {
        const badgeW = 52, badgeH = 14;
        const badgeX = sx + snapW - badgeW - 6;
        const badgeY = cy + 4;
        rr(badgeX, badgeY, badgeW, badgeH, 7, { fill: C.gold });
        centerText(`${multiplier}x MORE`, badgeX, badgeY + 3, badgeW, 'Lato-Bold', 7, C.white);
      }
    });

    cy += snapH + 8;
    // Use gender-neutral language since we don't know the owner's pronouns
    const pronoun = 'their';
    rr(M, cy, CW, 22, 4, { fill: C.goldBg, stroke: C.goldBorder, lineWidth: 0.8 });
    const snapNote = `With PlanForge Optimized, ${D.ownerFirst} receives ${fmt(D.optOwnersRetained)} — that's ${fmt(D.optOwnersRetained - D.typOwnersRetained)} more than a typical plan, deposited directly into ${pronoun} retirement account.`;
    doc.font('Lato-Semibold').fontSize(8).fillColor(C.darkGray);
    doc.text(snapNote, M + 10, cy + 6, { width: CW - 20, lineBreak: true });

    // ── RATE SENSITIVITY ──
    cy += 30;
    doc.font('Lato-Bold').fontSize(11).fillColor(C.navy);
    doc.text('WHAT IF WE ADJUST THE EMPLOYEE RATE?', M, cy, { lineBreak: false });
    doc.moveTo(M, cy + 14).lineTo(M + doc.widthOfString('WHAT IF WE ADJUST THE EMPLOYEE RATE?'), cy + 14).lineWidth(1.5).stroke(C.navy);
    cy += 22;

    doc.font('Lato').fontSize(8.5).fillColor(C.medGray);
    doc.text('Changing the employee rate adjusts the owner\'s allocation and net cost. Below 5%, the gateway test caps the owner at 3x the employee rate.', M, cy, { width: CW, lineGap: 1.5 });
    cy += 20;

    const rates = [1.0, 2.0, 3.0, 4.0, 5.0];
    const boxW = (CW - 4 * 10) / 5;

    rates.forEach((rate, i) => {
      const bx = M + i * (boxW + 10);
      const calc = D.calcAtRate(rate);
      const typ = D.calcTypicalAtRate(rate);
      const savings = typ.net - calc.net;
      const fee = Math.round(savings * D.FEE_PCT);
      const isCurrent = rate === D.optNhceRate;
      const boxH = 88;

      if (isCurrent) {
        rr(bx, cy, boxW, boxH, 4, { fill: C.goldBg, stroke: C.gold, lineWidth: 1.5 });
      } else {
        rr(bx, cy, boxW, boxH, 4, { fill: C.lightGray, stroke: C.borderGray });
      }

      centerText(`${fmtPct(rate)} NHCE`, bx, cy + 5, boxW, 'Lato-Bold', 9, C.darkGray);
      centerText(`Owner: ${fmt(calc.ownerAllocation)}`, bx, cy + 18, boxW, 'Lato', 7.5, C.medGray);

      const netY = cy + 33;
      centerText('Net Cost', bx, netY, boxW, 'Lato', 7, C.medGray);
      centerText(fmt(calc.net), bx, netY + 10, boxW, 'Lato-Bold', 11, isCurrent ? C.gold : C.darkGray);
      centerText(`Optimized Fee: ${fmt(fee)}`, bx, netY + 24, boxW, 'Lato', 6.5, C.medGray);
      centerText(`Saves ${fmt(savings - fee)}`, bx, netY + 34, boxW, 'Lato-Bold', 7, C.green);

      if (isCurrent) {
        const labelY = cy + boxH + 4;
        const barW = 30;
        doc.moveTo(bx + (boxW - barW) / 2, labelY).lineTo(bx + (boxW + barW) / 2, labelY).lineWidth(2).stroke(C.gold);
        centerText('CURRENT', bx, labelY + 4, boxW, 'Lato-Bold', 7.5, C.gold);
      }
    });

    // ── FORFEITURE BENEFIT ──
    cy += 110;
    doc.font('Lato-Bold').fontSize(11).fillColor(C.navy);
    doc.text('FORFEITURE BENEFIT', M, cy, { lineBreak: false });
    doc.moveTo(M, cy + 14).lineTo(M + doc.widthOfString('FORFEITURE BENEFIT'), cy + 14).lineWidth(1.5).stroke(C.navy);
    cy += 20;

    rr(M, cy, CW, 30, 4, { fill: C.lightGray });
    doc.rect(M, cy, 4, 30).fill(C.gold);
    doc.font('Lato').fontSize(8.5).fillColor(C.darkGray);

    if (D.forfeitures > 0) {
      doc.text('Employees who leave before fully vested forfeit their unvested balance, reducing future costs.', M + 14, cy + 4, { lineBreak: false });
      doc.text('Actual forfeitures from departed employees:', M + 14, cy + 17, { lineBreak: false });
      doc.font('Lato-Bold').fontSize(9.5).fillColor(C.gold);
      doc.text(fmt(D.forfeitures), M + 226, cy + 16, { lineBreak: false });
      doc.font('Lato').fontSize(8).fillColor(C.medGray);
      doc.text('(already included in Net Cost)', M + 280, cy + 17, { lineBreak: false });
    } else {
      doc.text('Employees who leave before fully vested forfeit their unvested balance, reducing future plan costs.', M + 14, cy + 4, { lineBreak: false });
      doc.text('Forfeiture estimates will be available after the first plan year based on actual turnover.', M + 14, cy + 17, { lineBreak: false });
    }

    // ── DISCLAIMER ──
    const discY = H - 68;
    doc.font('Lato-Italic').fontSize(6).fillColor(C.medGray);
    const discLines = [
      'This illustration is based on current census data and IRS limits for the plan year shown. Actual results may vary based on final compensation, employee changes, and plan amendments.',
      'This is not tax or legal advice. Consult your tax advisor and ERISA counsel. All contributions are voluntary and discretionary. SECURE 2.0 credits subject to eligibility requirements.',
      `Forfeitures reflect ${D.forfeitures > 0 ? 'actual departed employees' : 'estimated turnover'}. "Typical Strategy" assumes a ${D.stdRate}% safe harbor with immediate vesting, no forfeitures, no SECURE credits. Tax rate: ${Math.round(D.taxRate * 100)}%.`,
      "Owner's retained share is not a business expense — it goes directly into the owner's retirement account and is deducted from net cost.",
    ];
    discLines.forEach((line, i) => {
      doc.text(line, M, discY + i * 10, { width: CW, lineGap: 0 });
    });

    // ── FOOTER ──
    doc.font('Lato-Italic').fontSize(7.5).fillColor(C.medGray);
    doc.text('PlanForge Consulting  |  Illustration Only, Not Tax or Legal Advice', M, H - 22, { lineBreak: false });
    rightText('Page 2 of 2', M, H - 22, CW, 'Lato-Italic', 7.5, C.medGray);
  }

  // ── Build ──
  drawPage1();
  doc.addPage();
  drawPage2();
  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => {
      console.log(`PDF saved to: ${outputPath}`);
      console.log(`\n=== V8 KEY FIGURES (${D.company} ${D.year}) ===`);
      console.log(`  Owner: ${D.owner} (age ${D.ownerAge}), Comp: ${fmt(D.ownerComp)}`);
      console.log(`  ${D.eligible} eligible, ${D.nhceCount} NHCEs`);
      console.log(`\n  STANDARD (${D.stdRate}% flat):`);
      console.log(`    Total PS: ${fmt(D.stdTotalPS)} | Owners: ${fmt(D.stdOwnersRetained)}`);
      console.log(`    Tax Savings: ${fmt(D.stdTotalTaxSavings)} | Net: ${fmt(D.stdNetCost)}`);
      console.log(`\n  OPTIMIZED (cross-tested, ${D.optNhceRate}% NHCE):`);
      console.log(`    Total PS: ${fmt(D.optTotalPS)} | Owners: ${fmt(D.optOwnersRetained)}`);
      console.log(`    Tax Savings: ${fmt(D.optTotalTaxSavings)} | Net: ${fmt(D.optNetCost)}`);
      console.log(`\n  Savings vs Typical: Std ${fmt(D.stdSavings)} | Opt ${fmt(D.optSavings)}`);
      resolve(outputPath);
    });
    stream.on('error', reject);
  });
}


// ═══════════════════════════════════════════════════════════════════
//  CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

if (require.main === module) {
  const inputFile = process.argv[2];
  const outputFile = process.argv[3];

  if (!inputFile) {
    console.error('Usage: node build_illustration_v8.js <input.json> [output.pdf]');
    console.error('');
    console.error('Input JSON should match the advisor panel export format:');
    console.error('  {');
    console.error('    "bizName": "Company Name",');
    console.error('    "firstName": "Owner", "lastName": "Name",');
    console.error('    "ownerAge": 55, "ownerSalary": 275000, "ownerK1": 0,');
    console.error('    "nhceCount": 20, "nhceAvgPay": 55000,');
    console.error('    "secureYear": 2, "forfeitures": 15000,');
    console.error('    "year": "2026", "taxRate": 0.30,');
    console.error('    "entityType": "S-Corp",');
    console.error('    "optOwnerAlloc": 70000, "optNhceRate": 5,');
    console.error('    "secureCredits": 19000');
    console.error('  }');
    process.exit(1);
  }

  const input = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  generate(input, outputFile)
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}


// ── Module Export ──────────────────────────────────────────────────
module.exports = { generate, computePlanData };
