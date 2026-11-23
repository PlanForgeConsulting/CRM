/**
 * Advisor-panel XSS regression tests.
 *
 * These assertions describe the safe behavior: employee names, owner names,
 * and the company name that arrive through census paste or JSON import are
 * shown as text. They fail while those strings are concatenated into HTML
 * and assigned with innerHTML.
 *
 * Run from the repository root:
 *   npm install
 *   npm run test:xss
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'PlanForge_Advisor_Panel_V3_MASTER.html');

function markup(id, flag) {
  return `<img id="${id}" src="/missing-image.png" onerror="window.${flag}=1">`;
}

function startServer() {
  const html = fs.readFileSync(htmlPath);
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${port}/PlanForge_Advisor_Panel_V3_MASTER.html`,
      });
    });
  });
}

async function openPanel(browser, url) {
  const page = await browser.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  const origin = new URL(url).origin;
  await page.route('**/*', (route) => {
    if (route.request().url().startsWith(origin)) route.continue();
    else route.abort();
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof parseCensusData === 'function' && typeof doImport === 'function');
  return page;
}

async function readSurface(page, selector, flags) {
  await page.waitForFunction(
    (names) => names.some((name) => window[name] === 1),
    flags,
    { timeout: 750 }
  ).catch(() => {});
  return page.evaluate(({ selector, flags }) => {
    const root = document.querySelector(selector);
    const probes = [...document.querySelectorAll('img[id^="pf-xss-"]')].filter((el) => {
      return root ? root.contains(el) : false;
    }).map((el) => el.id);
    return {
      present: !!root,
      text: root ? root.textContent : '',
      probes,
      flags: Object.fromEntries(flags.map((name) => [name, window[name] === 1])),
    };
  }, { selector, flags });
}

function expectText(surface, payload, flag, sink, errors) {
  const executed = surface.flags[flag] === true || surface.probes.some((id) => payload.includes(id));
  const shown = surface.present && surface.text.includes(payload);
  if (!shown && !executed) {
    errors.push(`${sink}: the imported value never reached this surface (present=${surface.present})`);
    return;
  }
  if (executed) {
    errors.push(`${sink}: the name was parsed as HTML and the event handler ran (flags=${JSON.stringify(surface.flags)}, probes=${surface.probes.join(',')})`);
  }
  if (!shown) errors.push(`${sink}: the name was not inserted as text`);
}

function finish(errors) {
  assert.equal(errors.length, 0, errors.join('\n'));
}

async function importJson(page, data, censusArea) {
  await page.locator('button', { hasText: 'Import JSON' }).click();
  await page.locator('#importArea').fill(JSON.stringify(data));
  if (censusArea != null) await page.locator('#importCensusArea').fill(censusArea);
  await page.locator('button', { hasText: 'Import & Calculate' }).click();
}

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`FAIL ${name}\n${error && error.stack ? error.stack : error}`);
  }
}

const { server, url } = await startServer();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  await test('pasted census names stay text in the departure table and the cross-test table', async () => {
    const page = await openPanel(browser, url);
    const nhce = `NHCE_MARKER${markup('pf-xss-nhce', '__pfXssNhce')}`;
    const hce = `HCE_MARKER${markup('pf-xss-hce', '__pfXssHce')}`;
    const census = `${nhce}\t35\t45000\n${hce}\t48\t180000`;
    await page.locator('#censusPaste').fill(census);
    const errors = [];
    const departure = await readSurface(page, '#departureTableWrap', ['__pfXssNhce', '__pfXssHce']);
    const cross = await readSurface(page, '#xtDetailBody', ['__pfXssNhce', '__pfXssHce']);
    expectText(departure, nhce, '__pfXssNhce', 'departure table (pasted NHCE name)', errors);
    expectText(departure, hce, '__pfXssHce', 'departure table (pasted HCE name)', errors);
    expectText(cross, nhce, '__pfXssNhce', 'cross-test table (pasted NHCE name)', errors);
    expectText(cross, hce, '__pfXssHce', 'cross-test table and rate group (pasted HCE name)', errors);
    finish(errors);
    await page.close();
  });

  await test('census embedded in advisor-panel JSON stays text after Import JSON', async () => {
    const page = await openPanel(browser, url);
    const name = `JSON_CENSUS${markup('pf-xss-json-emp', '__pfXssJsonEmp')}`;
    await importJson(page, {
      bizName: 'Plain Co',
      firstName: 'Pat',
      lastName: 'Lee',
      entityType: 'S-Corp',
      ownerAge: 55,
      ownerSalary: 200000,
      taxYear: '2026',
      taxRate: 0.3,
      censusText: `${name}\t36\t52000`,
    });
    const errors = [];
    const departure = await readSurface(page, '#departureTableWrap', ['__pfXssJsonEmp']);
    const cross = await readSurface(page, '#xtDetailBody', ['__pfXssJsonEmp']);
    expectText(departure, name, '__pfXssJsonEmp', 'departure table (JSON censusText)', errors);
    expectText(cross, name, '__pfXssJsonEmp', 'cross-test table (JSON censusText)', errors);
    finish(errors);
    await page.close();
  });

  await test('census pasted into the import panel stays text', async () => {
    const page = await openPanel(browser, url);
    const name = `IMPORT_AREA${markup('pf-xss-area-emp', '__pfXssAreaEmp')}`;
    await importJson(page, { taxYear: '2026', taxRate: 0.3, ownerAge: 55, ownerSalary: 200000 }, `${name}\t33\t47000`);
    const errors = [];
    const departure = await readSurface(page, '#departureTableWrap', ['__pfXssAreaEmp']);
    const cross = await readSurface(page, '#xtDetailBody', ['__pfXssAreaEmp']);
    expectText(departure, name, '__pfXssAreaEmp', 'departure table (import census area)', errors);
    expectText(cross, name, '__pfXssAreaEmp', 'cross-test table (import census area)', errors);
    finish(errors);
    await page.close();
  });

  await test('questionnaire census.text stays text after Import JSON', async () => {
    const page = await openPanel(browser, url);
    const name = `QUESTIONNAIRE${markup('pf-xss-q-emp', '__pfXssQEmp')}`;
    await importJson(page, {
      contact: { company: 'Plain Co', firstName: 'Pat', lastName: 'Lee' },
      business: { entityType: 'S-Corp' },
      owner: { age: 55, salary: 200000, k1: 0 },
      employees: { count: 1, avgSalary: 40000 },
      census: { text: `${name}\t29\t41000` },
    });
    const errors = [];
    const departure = await readSurface(page, '#departureTableWrap', ['__pfXssQEmp']);
    const cross = await readSurface(page, '#xtDetailBody', ['__pfXssQEmp']);
    expectText(departure, name, '__pfXssQEmp', 'departure table (questionnaire census.text)', errors);
    expectText(cross, name, '__pfXssQEmp', 'cross-test table (questionnaire census.text)', errors);
    finish(errors);
    await page.close();
  });

  await test('additional owner name stays an attribute value and cross-test text', async () => {
    const page = await openPanel(browser, url);
    const quoted = `AO_QUOTED"><img id="pf-xss-ao-attr" src="/missing-image.png" onerror="window.__pfXssAoAttr=1">`;
    // No double quotes: the value attribute must keep this string so recalc
    // copies it into the cross-test table.
    const plain = 'AO_PLAIN<img id=pf-xss-ao-plain src=/missing-image.png onerror=window.__pfXssAoPlain=1>';
    await importJson(page, {
      bizName: 'Plain Co',
      firstName: 'Pat',
      lastName: 'Lee',
      entityType: 'Partnership',
      ownerAge: 55,
      ownerSalary: 200000,
      taxYear: '2026',
      taxRate: 0.3,
      nhceCount: 1,
      nhceAvgPay: 45000,
      nhceAvgAge: 35,
      additionalOwners: [
        { name: quoted, age: 46, salary: 140000, k1: 0 },
        { name: plain, age: 44, salary: 130000, k1: 0 },
      ],
    });
    const errors = [];
    const owners = await readSurface(page, '#additionalOwners', ['__pfXssAoAttr', '__pfXssAoPlain']);
    const cross = await readSurface(page, '#xtDetailBody', ['__pfXssAoAttr', '__pfXssAoPlain']);
    const values = await page.locator('#additionalOwners input[type="text"]').evaluateAll((els) => els.map((el) => el.value));
    if (owners.flags.__pfXssAoAttr === true || owners.probes.includes('pf-xss-ao-attr')) {
      errors.push(`additional owner fields: the name broke out of the value attribute and ran a handler (flags=${JSON.stringify(owners.flags)}, probes=${owners.probes.join(',')})`);
    }
    if (!values.includes(quoted)) errors.push(`additional owner fields: the name was not kept as the input value (values=${JSON.stringify(values)})`);
    expectText(cross, plain, '__pfXssAoPlain', 'cross-test table (additional owner name)', errors);
    finish(errors);
    await page.close();
  });

  await test('owner first and last names stay text in the cross-test table', async () => {
    const page = await openPanel(browser, url);
    const first = `FIRST${markup('pf-xss-first', '__pfXssFirst')}`;
    const last = `LAST${markup('pf-xss-last', '__pfXssLast')}`;
    await importJson(page, {
      bizName: 'Plain Co',
      firstName: first,
      lastName: last,
      entityType: 'S-Corp',
      ownerAge: 55,
      ownerSalary: 200000,
      taxYear: '2026',
      taxRate: 0.3,
      nhceCount: 1,
      nhceAvgPay: 45000,
      nhceAvgAge: 35,
    });
    const errors = [];
    const cross = await readSurface(page, '#xtDetailBody', ['__pfXssFirst', '__pfXssLast']);
    expectText(cross, first, '__pfXssFirst', 'cross-test table (owner first name)', errors);
    expectText(cross, last, '__pfXssLast', 'cross-test table (owner last name)', errors);
    finish(errors);
    await page.close();
  });

  await test('illustration markup keeps company, owner first, and owner last names as text', async () => {
    const page = await openPanel(browser, url);
    const company = `BIZ${markup('pf-xss-biz', '__pfXssBiz')}`;
    const first = `FIRST${markup('pf-xss-illus-first', '__pfXssIllusFirst')}`;
    const last = `LAST${markup('pf-xss-illus-last', '__pfXssIllusLast')}`;
    await importJson(page, {
      bizName: company,
      firstName: first,
      lastName: last,
      entityType: 'S-Corp',
      ownerAge: 55,
      ownerSalary: 200000,
      taxYear: '2026',
      taxRate: 0.3,
      nhceCount: 1,
      nhceAvgPay: 45000,
      nhceAvgAge: 35,
    });
    const call = await page.evaluate(() => {
      try {
        generateIllustrationPDF();
        return 'returned';
      } catch (error) {
        return `threw:${error && error.message ? error.message : error}`;
      }
    });
    const errors = [];
    const illus = await readSurface(page, '#pf-illus', ['__pfXssBiz', '__pfXssIllusFirst', '__pfXssIllusLast']);
    if (!illus.present && illus.probes.length === 0) errors.push(`illustration sink was not reached (${call})`);
    expectText(illus, company, '__pfXssBiz', 'illustration (company name)', errors);
    expectText(illus, first, '__pfXssIllusFirst', 'illustration (owner first name)', errors);
    expectText(illus, last, '__pfXssIllusLast', 'illustration (owner last name)', errors);
    finish(errors);
    await page.close();
  });
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.log(`\n${failed.length} of ${results.length} tests failed`);
  process.exit(1);
}
console.log(`\n${results.length} tests passed`);
