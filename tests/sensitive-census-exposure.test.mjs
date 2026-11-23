/**
 * Sensitive participant data must not ship inside the advisor panel or
 * alongside it in this repository.
 *
 * These tests fail while employer census rows (name, date of birth, wage),
 * prefilled owner age, and prefilled owner compensation are embedded in the
 * panel, and while census workbooks sit in the tree. They pass once that
 * data is gone: scenario identities are the existing synthetic demos or
 * obviously fictional labels, owner age and W-2 start empty, census pay is
 * rounded to thousands, and no workbook still carries a participant census.
 *
 * Run: node --test tests/sensitive-census-exposure.test.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = 'PlanForge_Advisor_Panel_V3_MASTER.html';
const PANEL_PATH = path.join(ROOT, PANEL);

const DOB_IN_RECORD = /\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/;
const SOURCE_DOB_WAGE = /\\t\d{1,2}\/\d{1,2}\/\d{4}\\t\d|\\t\d{4}-\d{2}-\d{2}\\t\d/;
const SOURCE_CENTED_WAGE = /\\t\d+\.\d{2}/;

const FAKE_MARK = /\b(example|sample|test|demo|placeholder|fake|fictional)\b/i;
const SYNTHETIC_EMPLOYEE = /^(NHCE-Q\d+-\d+|HCE-\d+|Employee \d+|Excluded \d+)$/i;

/** Identities already used by the panel's non-census demo scenarios. */
const DEMO_LABELS = new Set([
  'solo s-corp',
  'llc + k-1 cap',
  'llc k-1',
  'young owner',
  'young owner (age test)',
  'multi-owner',
  'year 1',
  'year 1 (full credit)',
  'year 5',
  'year 5 (25% credit)',
  'smith consulting',
  'main street dentistry llc',
  'young tech inc',
  'abc partners',
  'fresh start inc',
  'mature plan corp',
  'john smith',
  'jane doe',
  'john doe',
  'sarah chen',
  'alex young',
  'alice adams',
  'bob baker',
  'carol cox',
  'david lee',
  'emma reeves',
]);

const BIRTH_HEADERS = new Set(['birth date', 'date of birth', 'dob']);
const NAME_HEADERS = new Set(['first name', 'last name', 'employee name', 'name']);
const SSN_HEADERS = new Set(['ssn', 'social security', 'social security number']);
const ADDRESS_HEADERS = new Set(['address', 'address 1', 'street address']);

function isObviouslyFake(value) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  if (SYNTHETIC_EMPLOYEE.test(text)) return true;
  if (FAKE_MARK.test(text)) return true;
  return DEMO_LABELS.has(text.toLowerCase());
}

function isRoundedThousand(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n % 1000 === 0;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'tests') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function sharedStrings(file) {
  let xml;
  try {
    xml = execFileSync('unzip', ['-p', file, 'xl/sharedStrings.xml'], { encoding: 'utf8' });
  } catch {
    return [];
  }
  const values = [];
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
    values.push(parts.join(''));
  }
  return values;
}

function workbookHasDataRow(file) {
  let listing;
  try {
    listing = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
  } catch {
    return false;
  }
  const sheets = [...listing.matchAll(/xl\/worksheets\/sheet\d+\.xml/g)].map((m) => m[0]);
  for (const sheet of sheets) {
    const xml = execFileSync('unzip', ['-p', file, sheet], { encoding: 'utf8' });
    if (/<row\b[^>]*\br="(?:[2-9]|\d{2,})"/.test(xml) || /<c\b[^>]*\br="[A-Z]+(?:[2-9]|\d{2,})"/.test(xml)) {
      return true;
    }
  }
  return false;
}

function inputTag(html, id) {
  const match = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`, 'i'));
  return match ? match[0] : '';
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return match ? match[1] : '';
}

test('advisor panel source does not embed a participant census or prefilled owner pay', () => {
  const html = fs.readFileSync(PANEL_PATH, 'utf8');
  assert.equal(
    SOURCE_DOB_WAGE.test(html),
    false,
    `${PANEL} still contains a name/date-of-birth/wage census row`,
  );
  assert.equal(
    SOURCE_CENTED_WAGE.test(html),
    false,
    `${PANEL} still contains a census wage with cents`,
  );

  for (const id of ['ownerAge', 'ownerSalary']) {
    const tag = inputTag(html, id);
    assert.ok(tag, `${PANEL} is missing #${id}`);
    assert.equal(attr(tag, 'value'), '', `#${id} is prefilled in the shipped HTML`);
  }

  for (const id of ['bizName', 'firstName', 'lastName']) {
    const tag = inputTag(html, id);
    assert.ok(tag, `${PANEL} is missing #${id}`);
    const placeholder = attr(tag, 'placeholder');
    assert.ok(
      placeholder === '' || /^e\.g\./i.test(placeholder) || isObviouslyFake(placeholder),
      `#${id} placeholder identifies a real client`,
    );
  }

  const labels = [...html.matchAll(/\b(?:name|chip|bizName)\s*:\s*'([^']*)'/g)].map((match) => match[1]);
  const owners = [...html.matchAll(/firstName\s*:\s*'([^']*)'\s*,\s*lastName\s*:\s*'([^']*)'/g)]
    .map((match) => [match[1], match[2]].filter(Boolean).join(' '));
  const leaked = [...labels, ...owners].filter((value) => !isObviouslyFake(value));
  assert.equal(leaked.length, 0, `${PANEL} scenario source still names ${leaked.length} real client identities`);
});

test('no other text file in the repo embeds a date-of-birth census row', () => {
  const offenders = [];
  for (const file of walk(ROOT)) {
    if (!/\.(html|js|json|csv|txt|md)$/i.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (SOURCE_DOB_WAGE.test(text) || /[A-Za-z][^\n]{0,80}\d{1,2}\/\d{1,2}\/\d{4}[^\n]{0,40}\d{3,}/.test(text)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, [], `participant census rows remain in: ${offenders.join(', ')}`);
});

test('workbooks do not ship a participant census', () => {
  const offenders = [];
  for (const file of walk(ROOT)) {
    if (!/\.xlsx$/i.test(file)) continue;
    const strings = sharedStrings(file).map((s) => s.trim().toLowerCase());
    const hasName = strings.some((s) => NAME_HEADERS.has(s));
    const hasSensitiveColumn = strings.some((s) => (
      BIRTH_HEADERS.has(s) || SSN_HEADERS.has(s) || ADDRESS_HEADERS.has(s)
    ));
    if (hasName && hasSensitiveColumn && workbookHasDataRow(file)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, [], `census workbooks remain in: ${offenders.join(', ')}`);
});

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== `/${PANEL}`) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      fs.createReadStream(PANEL_PATH).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function startChrome(port, url) {
  const userData = fs.mkdtempSync(path.join('/tmp', 'pf-census-'));
  const proc = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userData}`,
      url,
    ],
    { stdio: 'ignore' },
  );
  return { proc, userData };
}

async function waitForJson(port) {
  let lastError;
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const pages = await response.json();
        const page = pages.find((entry) => entry.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Chrome DevTools did not come up (${lastError ? lastError.message : 'no page'})`);
}

function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('DevTools socket failed')));
  });
  ws.addEventListener('message', async (event) => {
    const raw = typeof event.data === 'string' ? event.data : await event.data.text();
    const message = JSON.parse(raw);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || 'cdp error'));
      else resolve(message.result);
    }
  });
  return {
    opened,
    send(method, params = {}, timeoutMs = 20000) {
      const id = ++nextId;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`timeout waiting for ${method}`));
        }, timeoutMs);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
      });
    },
    close() {
      ws.close();
    },
  };
}

const PAGE_PROBE = `(async () => {
  const demo = new Set(${JSON.stringify([...DEMO_LABELS])});
  const fakeMark = /\\b(example|sample|test|demo|placeholder|fake|fictional)\\b/i;
  const syntheticEmployee = /^(NHCE-Q\\d+-\\d+|HCE-\\d+|Employee \\d+|Excluded \\d+)$/i;
  const dob = /\\d{1,2}\\/\\d{1,2}\\/\\d{4}|\\d{4}-\\d{2}-\\d{2}/;
  function fake(value) {
    const text = String(value ?? '').trim();
    if (!text) return true;
    if (syntheticEmployee.test(text)) return true;
    if (fakeMark.test(text)) return true;
    return demo.has(text.toLowerCase());
  }
  function rounded(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n % 1000 === 0;
  }
  function censusOk(text) {
    if (!text || !text.trim()) return true;
    if (dob.test(text)) return false;
    const rows = text.trim().split(/\\r?\\n/).filter(Boolean);
    for (const row of rows) {
      const parts = row.split(/\\t|,/).map((part) => part.trim());
      const name = parts.find((part) => /[A-Za-z]/.test(part) && !/^\\d/.test(part)) || '';
      if (name && !fake(name)) return false;
      const numbers = parts
        .map((part) => Number(part.replace(/[$,]/g, '')))
        .filter((n) => Number.isFinite(n));
      const wages = numbers.filter((n) => n >= 1000);
      if (wages.length === 0 || wages.some((n) => n % 1000 !== 0)) return false;
    }
    return true;
  }
  function tableNamesOk() {
    const rows = [...document.querySelectorAll('#departureTableWrap tbody tr')];
    return rows.every((row) => {
      const name = row.querySelectorAll('td')[1]?.textContent || '';
      return fake(name);
    });
  }
  function ownersOk() {
    const people = [...document.querySelectorAll('[id^="ao_name_"]')];
    for (const input of people) {
      if (!fake(input.value)) return false;
      const salary = document.getElementById(input.id.replace('name', 'salary'));
      if (salary && !rounded(salary.value)) return false;
    }
    const combined = [document.getElementById('firstName').value, document.getElementById('lastName').value]
      .filter(Boolean).join(' ');
    return fake(combined) && fake(document.getElementById('bizName').value)
      && rounded(document.getElementById('ownerSalary').value);
  }
  const problems = [];
  if (document.getElementById('ownerAge').value !== '') problems.push('initial owner age is prefilled');
  if (document.getElementById('ownerSalary').value !== '') problems.push('initial owner salary is prefilled');
  for (const id of ['bizName', 'firstName', 'lastName']) {
    const placeholder = document.getElementById(id).getAttribute('placeholder') || '';
    if (placeholder && !/^e\\.g\\./i.test(placeholder) && !fake(placeholder)) {
      problems.push('#' + id + ' placeholder identifies a client');
    }
  }
  const chips = [...document.querySelectorAll('.scenario-chip')];
  if (chips.length === 0) problems.push('scenario chips did not render');
  chips.forEach((chip, index) => {
    if (!fake(chip.textContent)) problems.push('scenario chip ' + index + ' is a client label');
  });
  URL.createObjectURL = (blob) => {
    window.__exports = window.__exports || [];
    window.__exports.push(blob.text());
    return 'blob:about';
  };
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) return;
  };
  window.html2pdf = () => ({
    set() { return this; },
    from(element) {
      window.__illustration = element.innerText || '';
      return this;
    },
    save() { return Promise.resolve(); },
  });
  for (let index = 0; index < chips.length; index += 1) {
    const label = 'scenario ' + index;
    chips[index].click();
    if (!censusOk(document.getElementById('censusPaste').value)) {
      problems.push(label + ' copied a participant census into the panel');
    }
    if (!tableNamesOk()) problems.push(label + ' listed a real participant in the departure table');
    if (!ownersOk()) problems.push(label + ' filled the owner form with a real client');
    window.__illustration = '';
    try { generateIllustrationPDF(); } catch (error) {
      problems.push(label + ' illustration failed to build');
    }
    if (window.__illustration && dob.test(window.__illustration)) {
      problems.push(label + ' illustration contains a date of birth');
    }
    const illustratedOwner = (window.__illustration.match(/Owner:\\s*([^\\n(]+)/) || [, ''])[1].trim();
    if (illustratedOwner && !fake(illustratedOwner)) {
      problems.push(label + ' illustration names a real owner');
    }
    const exportCount = (window.__exports || []).length;
    try { exportJSON(); } catch (error) {
      problems.push(label + ' export failed');
    }
    const pending = (window.__exports || [])[exportCount];
    if (pending) {
      let payload = {};
      try { payload = JSON.parse(await pending); } catch (error) {
        problems.push(label + ' export was not valid JSON');
      }
      if (!censusOk(payload.censusText || '')) problems.push(label + ' export included a participant census');
      const exportedOwner = [payload.firstName, payload.lastName].filter(Boolean).join(' ');
      if (!fake(exportedOwner)) problems.push(label + ' export named a real owner');
      if (payload.bizName && !fake(payload.bizName)) problems.push(label + ' export named a real business');
      if (!rounded(payload.ownerSalary)) problems.push(label + ' export included unrounded owner compensation');
      for (const extra of payload.additionalOwners || []) {
        if (extra.name && !fake(extra.name)) problems.push(label + ' export named a real additional owner');
        if (!rounded(extra.salary)) problems.push(label + ' export included unrounded additional compensation');
      }
    }
  }
  return problems;
})()`;

test('opening the panel with no login discloses no census, and scenario chips do not load one', { timeout: 120000 }, async () => {
  const server = await startStaticServer();
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/${PANEL}`;
  const unauthenticated = await fetch(url, { headers: {} });
  const body = await unauthenticated.text();
  const exposure = [];
  if (unauthenticated.status !== 200) exposure.push(`panel HTTP status ${unauthenticated.status}`);
  if (unauthenticated.headers.get('www-authenticate')) exposure.push('panel challenged for credentials');
  if (!body.includes('id="scenarioChips"')) exposure.push('panel response has no scenario chips');
  if (SOURCE_DOB_WAGE.test(body)) exposure.push('unauthenticated response contains a census');
  if (attr(inputTag(body, 'ownerAge'), 'value') !== '') exposure.push('unauthenticated response prefills owner age');
  if (attr(inputTag(body, 'ownerSalary'), 'value') !== '') exposure.push('unauthenticated response prefills owner salary');

  const debugPort = 9400 + (process.pid % 200);
  const chrome = startChrome(debugPort, url);
  let cdp;
  try {
    const wsUrl = await waitForJson(debugPort);
    cdp = connectCdp(wsUrl);
    await cdp.opened;
    await cdp.send('Runtime.enable');
    let ready = false;
    for (let i = 0; i < 50; i += 1) {
      const state = await cdp.send('Runtime.evaluate', {
        expression: 'document.readyState + ":" + (document.getElementById("scenarioChips")?.childElementCount || 0)',
        returnByValue: true,
      });
      const value = state.result?.value || '';
      if (value.startsWith('complete') && !value.endsWith(':0')) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(ready, true, 'advisor panel did not finish loading');
    const probed = await cdp.send('Runtime.evaluate', {
      expression: PAGE_PROBE,
      awaitPromise: true,
      returnByValue: true,
    }, 60000);
    if (probed.exceptionDetails) {
      throw new Error(probed.exceptionDetails.text || 'page probe threw');
    }
    const problems = probed.result?.value;
    assert.ok(Array.isArray(problems), 'page probe did not return a result');
    exposure.push(...problems);
    assert.deepEqual(exposure, []);
  } finally {
    try { cdp?.close(); } catch { /* socket may already be gone */ }
    chrome.proc.kill('SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      fs.rmSync(chrome.userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* Chrome can still be releasing its profile after the probe has finished. */
    }
    await new Promise((resolve) => server.close(resolve));
  }
});
