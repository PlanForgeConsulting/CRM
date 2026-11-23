/**
 * Spec for unescaped upload filenames in planforge-questionnaire.html.
 *
 * These tests fail while renderUploadedFiles writes file.name with innerHTML.
 * They pass once each uploaded name is inserted as text (textContent or
 * equivalent encoding) so a name that contains an element and an event
 * handler cannot run in the questionnaire page.
 *
 * Entry points covered, all of which reach that render:
 *   - drop on #fileDropZone (ondrop -> handleFileDrop -> handleFileSelect)
 *   - #fileInput change (onchange -> handleFileSelect)
 *   - removeUploadedFile, which renders the remaining names again
 *
 * Not covered: buildReview interpolates fields the prospect types (business
 * name, contact, notes, current provider, other plan goals). The file sender
 * cannot supply those. autoRestore assigns the saved draft with element.value,
 * not HTML. The review summary prints the upload count, not the file name.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const questionnaire = readFileSync(join(root, 'planforge-questionnaire.html'));
const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';

// Placeholders the page itself uses as examples. The payload only reads them
// inside this page; it does not send them anywhere.
const entered = {
  ownerSalary: '275000',
  ownerK1: '300000',
  email: 'owner@example.com',
  phone: '555-0100',
  bizName: 'Example Bakery LLC',
  firstName: 'Pat',
  lastName: 'Example',
  notes: 'placeholder notes',
};

// Minified so it can sit inside a double-quoted event-handler attribute.
// Single quotes only, no network calls. Sets window.__stolen when it runs.
const readPage = [
  'window.__stolen={',
  "ownerSalary:document.getElementById('ownerSalary').value,",
  "ownerK1:document.getElementById('ownerK1').value,",
  "email:document.getElementById('email').value,",
  "phone:document.getElementById('phone').value,",
  "bizName:document.getElementById('bizName').value,",
  "firstName:document.getElementById('firstName').value,",
  "lastName:document.getElementById('lastName').value,",
  "notes:document.getElementById('notes').value,",
  "draft:localStorage.getItem('pf_questionnaire_draft')",
  '}',
].join('');

function handlerName(tag) {
  if (tag === 'svg') return `<svg onload="${readPage}"></svg>`;
  if (tag === 'breakout') return `</span><img src="x" onerror="${readPage}"><span>`;
  return `<img src="x" onerror="${readPage}">`;
}

let server;
let baseUrl;
let browser;

async function startServer() {
  server = createServer((req, res) => {
    const path = (req.url || '/').split('?')[0];
    if (path === '/' || path === '/planforge-questionnaire.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(questionnaire);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}/planforge-questionnaire.html`;
}

test.before(async () => {
  await startServer();
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
});

test.after(async () => {
  await browser?.close();
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function openQuestionnaire() {
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate((values) => {
    for (const [id, value] of Object.entries(values)) {
      const el = document.getElementById(id);
      if (!el) throw new Error(`missing #${id}`);
      el.value = value;
    }
    autoSave();
  }, entered);
  const draft = await page.evaluate(() => localStorage.getItem('pf_questionnaire_draft'));
  assert.ok(draft && draft.includes(entered.ownerSalary), 'autoSave did not store the compensation field');
  assert.ok(draft.includes(entered.email), 'autoSave did not store the contact field');
  return page;
}

async function dropFiles(page, names) {
  const reached = await page.evaluate((fileNames) => {
    window.__calls = [];
    const origDrop = handleFileDrop;
    const origSelect = handleFileSelect;
    // Wrap only to record that the page's own functions ran. The originals
    // still render the list.
    window.handleFileDrop = function (event) {
      window.__calls.push('handleFileDrop');
      return origDrop.call(this, event);
    };
    window.handleFileSelect = function (files) {
      window.__calls.push('handleFileSelect');
      return origSelect.call(this, files);
    };
    const zone = document.getElementById('fileDropZone');
    const transfer = new DataTransfer();
    for (const name of fileNames) {
      transfer.items.add(new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: 'application/pdf' }));
    }
    const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer });
    const handled = zone.dispatchEvent(event);
    return { calls: window.__calls.slice(), handled, count: uploadedFilesList.length };
  }, names);
  assert.deepEqual(reached.calls, ['handleFileDrop', 'handleFileSelect'], 'drop did not run the page upload handlers');
  assert.equal(reached.count, names.length, 'drop did not keep every file');
  await settle(page);
}

async function chooseFiles(page, names) {
  const reached = await page.evaluate((fileNames) => {
    window.__calls = [];
    const origSelect = handleFileSelect;
    window.handleFileSelect = function (files) {
      window.__calls.push('handleFileSelect');
      return origSelect.call(this, files);
    };
    const input = document.getElementById('fileInput');
    const transfer = new DataTransfer();
    for (const name of fileNames) {
      transfer.items.add(new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: 'application/pdf' }));
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { calls: window.__calls.slice(), count: uploadedFilesList.length };
  }, names);
  assert.deepEqual(reached.calls, ['handleFileSelect'], 'file input change did not run handleFileSelect');
  assert.equal(reached.count, names.length, 'file input did not keep every file');
  await settle(page);
}

async function settle(page) {
  // img onerror waits on the failed image request, and svg onload runs on a
  // later turn. Both completed within this window when the page's own
  // handlers rendered the name in Chrome.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
}

async function listState(page) {
  return page.evaluate(() => {
    const root = document.getElementById('uploadedFiles');
    const elements = [...root.querySelectorAll('*')].map((el) => ({
      tag: el.tagName,
      handlers: [...el.attributes]
        .filter((attr) => attr.name.toLowerCase().startsWith('on'))
        .map((attr) => ({ name: attr.name.toLowerCase(), value: attr.value })),
    }));
    return {
      stolen: window.__stolen === undefined ? null : window.__stolen,
      text: root.textContent,
      count: uploadedFilesList.length,
      elements,
    };
  });
}

function assertNamesAreText(state, names) {
  if (state.stolen !== null) {
    assert.fail(
      'uploaded filename ran in the questionnaire page and read compensation, contact details, and the saved draft: '
      + JSON.stringify(state.stolen),
    );
  }
  for (const el of state.elements) {
    assert.ok(el.tag === 'DIV' || el.tag === 'SPAN', `filename created a <${el.tag}> element`);
    for (const handler of el.handlers) {
      assert.match(
        handler.value,
        /^removeUploadedFile\(\d+\)$/,
        `filename installed ${handler.name}="${handler.value}"`,
      );
    }
  }
  for (const name of names) {
    assert.ok(
      state.text.includes(name),
      `file list does not show the file name as text: ${JSON.stringify(state.text)}`,
    );
  }
}

test('a normal payroll filename is listed and does not run script', async () => {
  const page = await openQuestionnaire();
  const name = 'q1-census.pdf';
  await dropFiles(page, [name]);
  const state = await listState(page);
  assert.equal(state.stolen, null);
  assert.ok(state.text.includes(name));
  assert.equal(state.count, 1);
  await page.close();
});

test('dropping a payroll file whose name contains an element handler reads the questionnaire', async () => {
  const page = await openQuestionnaire();
  const name = `${handlerName('img')}census.pdf`;
  await dropFiles(page, [name]);
  assertNamesAreText(await listState(page), [name]);
  await page.close();
});

test('a file-input change with the same kind of name reads the questionnaire', async () => {
  const page = await openQuestionnaire();
  const name = `${handlerName('img')}w2.pdf`;
  await chooseFiles(page, [name]);
  assertNamesAreText(await listState(page), [name]);
  await page.close();
});

test('an svg onload in the file name reads the questionnaire on drop', async () => {
  const page = await openQuestionnaire();
  const name = `${handlerName('svg')}payroll.csv`;
  await dropFiles(page, [name]);
  assertNamesAreText(await listState(page), [name]);
  await page.close();
});

test('a name that closes the surrounding span still cannot run a handler', async () => {
  const page = await openQuestionnaire();
  const name = `${handlerName('breakout')}paystub.pdf`;
  await dropFiles(page, [name]);
  assertNamesAreText(await listState(page), [name]);
  await page.close();
});

test('a safe file dropped beside a crafted name does not make the crafted name safe', async () => {
  const page = await openQuestionnaire();
  const benign = 'employees.xlsx';
  const crafted = `${handlerName('img')}census.pdf`;
  await dropFiles(page, [benign, crafted]);
  assertNamesAreText(await listState(page), [benign, crafted]);
  await page.close();
});

test('removing one upload renders the remaining crafted name as text', async () => {
  const page = await openQuestionnaire();
  const benign = 'employees.xlsx';
  const crafted = `${handlerName('img')}census.pdf`;
  await dropFiles(page, [benign, crafted]);
  const afterRemove = await page.evaluate(() => {
    window.__stolen = undefined;
    removeUploadedFile(0);
    return uploadedFilesList.map((file) => file.name);
  });
  assert.deepEqual(afterRemove, [crafted]);
  await settle(page);
  assertNamesAreText(await listState(page), [crafted]);
  await page.close();
});
