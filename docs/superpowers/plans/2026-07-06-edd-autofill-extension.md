# EDD Autofill Edge Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Microsoft Edge extension that fills the California EDD job search certification form with the next unprocessed row from a Google Sheet.

**Architecture:** Plain-JS MV3 extension with no build step. A background service worker owns all auth and Sheets API logic; a content script fills the form on the EDD page; a popup provides the trigger and status feedback. Pure business logic lives in `src/logic.js` so it can be tested with Node.js.

**Tech Stack:** Chrome Extension API (MV3), Google Sheets API v4, Web Crypto API (PKCE SHA-256), `chrome.identity.launchWebAuthFlow`, Node.js (tests only — no test framework required)

## Global Constraints

- Target browser: Microsoft Edge (Chromium MV3)
- Extension API: `chrome.*` namespace throughout — never `browser.*`
- No build step — plain JS files, no bundler, no transpilation
- User-visible credentials (`sheetId`, `clientId`) stored only in `chrome.storage.local` — never in source files
- OAuth tokens and refresh tokens stored in `chrome.storage.local` by the auth module — never in source files
- No service account keys — OAuth 2.0 with PKCE is the auth approach
- The extension must never submit the EDD form
- The extension must never store or handle login credentials for Google or the EDD website
- Node.js: any current LTS (used for unit tests only)

---

### Task 1: Extension scaffold and manifest

**Files:**
- Create: `manifest.json`
- Create: `background.js`
- Create: `content-script.js`
- Create: `options.html`
- Create: `options.js`
- Create: `popup.html`
- Create: `popup.js`
- Create: `src/logic.js`

**Interfaces:**
- Produces: loadable extension in Edge with correct permissions declared

- [ ] **Step 1: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "EDD Autofill",
  "version": "0.1.0",
  "description": "Fills EDD job search certification form from a Google Sheet",
  "action": {
    "default_popup": "popup.html",
    "default_title": "EDD Autofill"
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["*://unemployment.edd.ca.gov/*"],
      "js": ["content-script.js"]
    }
  ],
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "permissions": ["activeTab", "storage", "tabs", "identity"],
  "host_permissions": [
    "*://unemployment.edd.ca.gov/*",
    "https://sheets.googleapis.com/*",
    "https://oauth2.googleapis.com/*"
  ]
}
```

Note: `*://unemployment.edd.ca.gov/*` is a placeholder URL pattern. It is confirmed and corrected in Task 9.

Note: A `"key"` field should be added to `manifest.json` to stabilize the extension ID (required so the OAuth redirect URI stays constant). Generate it after first loading the extension: `edge://extensions` → "Pack extension" → get `.pem` file → run `openssl rsa -in key.pem -pubout -outform DER | openssl base64 -A` → paste result as `"key": "<value>"`. Do this before registering the OAuth redirect URI in Google Cloud Console.

- [ ] **Step 2: Create stub files**

`background.js`:
```js
importScripts('src/logic.js');
```

`content-script.js`:
```js
// EDD Autofill - content script (implemented in Task 8)
```

`src/logic.js`:
```js
// EDD Autofill - pure logic (implemented in Task 3)
```

`options.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>EDD Autofill Options</title></head>
<body><script src="options.js"></script></body>
</html>
```

`options.js`:
```js
// EDD Autofill - options page (implemented in Task 2)
```

`popup.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>EDD Autofill</title></head>
<body><script src="popup.js"></script></body>
</html>
```

`popup.js`:
```js
// EDD Autofill - popup (implemented in Task 7)
```

- [ ] **Step 3: Load in Edge and verify it loads cleanly**

1. Navigate to `edge://extensions`
2. Enable "Developer mode" (toggle, bottom-left)
3. Click "Load unpacked" → select the project folder
4. Confirm: extension appears in the list with no errors
5. Click the toolbar icon — a blank popup opens with no console errors

- [ ] **Step 4: Commit**

```bash
git add manifest.json background.js content-script.js options.html options.js popup.html popup.js src/logic.js
git commit -m "feat: extension scaffold and manifest"
```

---

### Task 2: Options page

**Files:**
- Modify: `options.html`
- Modify: `options.js`

**Interfaces:**
- Produces: `chrome.storage.local` keys `sheetId` (string) and `clientId` (string)

- [ ] **Step 1: Create an OAuth 2.0 Client ID in Google Cloud Console**

This is a one-time setup. You'll need a Google account with access to Google Cloud Console.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project (or select an existing one)
2. In the search bar, search for "Google Sheets API" → Enable it
3. Go to **APIs & Services → OAuth consent screen**
   - Choose "External" user type → click Create
   - Fill in App name (e.g. `EDD Autofill`), your email for support and developer contact → Save and Continue
   - Skip Scopes → Save and Continue
   - Skip Test users → Save and Continue
4. Go to **APIs & Services → Credentials** → click **Create Credentials → OAuth client ID**
   - Application type: **Chrome Extension**
   - Item ID: load the extension in Edge (`edge://extensions`), copy the extension ID shown there, paste it here
   - Click Create — copy the **Client ID** (looks like `123456789012-abc....apps.googleusercontent.com`)

Note: The OAuth redirect URI is derived automatically from the extension ID via `chrome.identity.getRedirectURL()`. To keep it stable across reinstalls, add a `"key"` field to `manifest.json` before registering the Client ID (see Task 1 note).

- [ ] **Step 2: Write `options.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>EDD Autofill Options</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
    label { display: block; margin-top: 1rem; font-weight: bold; }
    input { width: 100%; box-sizing: border-box; margin-top: 0.25rem; padding: 0.4rem; }
    button { margin-top: 1rem; padding: 0.5rem 1.5rem; }
    #status { margin-top: 0.75rem; }
    .error { color: #c00; }
    .ok { color: #080; }
  </style>
</head>
<body>
  <h1>EDD Autofill Settings</h1>
  <label for="sheetId">Google Sheet ID
    <input type="text" id="sheetId" placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
  </label>
  <label for="clientId">OAuth 2.0 Client ID
    <input type="text" id="clientId" placeholder="123456789012-abc....apps.googleusercontent.com" />
  </label>
  <button id="save">Save</button>
  <div id="status"></div>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write `options.js`**

```js
document.addEventListener('DOMContentLoaded', async () => {
  const { sheetId, clientId } = await chrome.storage.local.get(['sheetId', 'clientId']);
  if (sheetId)  document.getElementById('sheetId').value  = sheetId;
  if (clientId) document.getElementById('clientId').value = clientId;
});

document.getElementById('save').addEventListener('click', async () => {
  const sheetId  = document.getElementById('sheetId').value.trim();
  const clientId = document.getElementById('clientId').value.trim();
  const statusEl = document.getElementById('status');

  if (!sheetId || !clientId) {
    statusEl.className   = 'error';
    statusEl.textContent = 'Both fields are required.';
    return;
  }

  await chrome.storage.local.set({ sheetId, clientId });
  statusEl.className   = 'ok';
  statusEl.textContent = 'Saved.';
});
```

- [ ] **Step 4: Enter your real credentials and verify**

1. Reload the extension
2. Right-click the toolbar icon → "Extension options" (or open it from `edge://extensions`)
3. Paste the **Google Sheet ID** from the sheet URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`
4. Paste the **OAuth 2.0 Client ID** you created in Step 1
5. Click Save → should show "Saved."
6. Reload the options page — both values must still be present

- [ ] **Step 5: Commit**

```bash
git add options.html options.js
git commit -m "feat: options page saves sheet ID and OAuth client ID"
```

---

### Task 3: Pure data logic with Node.js tests

**Files:**
- Modify: `src/logic.js`
- Create: `test/test-logic.js`

**Interfaces:**
- Produces (all exported via `module.exports` for Node, declared as globals for the service worker):
  - `REQUIRED_COLUMNS: string[]` — column names that must be non-empty before the extension fills the form
  - `findFirstUnprocessedRow(rows: string[][], headers: string[]): { row: string[], rowIndex: number } | null`
    - `rows[0]` is the header row; data rows start at index 1
    - Returns the first row where the Status column is blank/whitespace
    - `rowIndex` is the 0-based index into `rows`; sheet row number = `rowIndex + 1`
    - Returns `null` if all Status cells are non-empty
  - `checkRequiredFields(row: string[], headers: string[]): string | null`
    - Returns the name of the first required column that is blank/whitespace, or `null` if all are present
  - `rowToObject(row: string[], headers: string[]): Record<string, string>`
    - Converts a row array to an object keyed by column header name

- [ ] **Step 1: Write failing tests in `test/test-logic.js`**

```js
const assert = require('assert');
const { REQUIRED_COLUMNS, findFirstUnprocessedRow, checkRequiredFields, rowToObject } = require('../src/logic.js');

const HEADERS = [
  'Date of Contact', 'Status', 'Type of Work', 'Employer/Agency Name',
  'Contact Type', 'Outcome', 'Name of Person', 'URL/Email', 'Phone Number',
];

// findFirstUnprocessedRow: skips rows with a non-empty Status
{
  const rows = [
    HEADERS,
    ['2026-07-01', 'Entered',   'Full-time', 'Acme Corp', 'Email', 'Applied', 'Jane', 'hr@acme.com', ''],
    ['2026-07-02', '',          'Full-time', 'Big Corp',  'Phone', 'Applied', 'John', '',             '555-1234'],
  ];
  const result = findFirstUnprocessedRow(rows, HEADERS);
  assert.strictEqual(result.rowIndex, 2,          'should skip Entered rows');
  assert.strictEqual(result.row[3],   'Big Corp',  'should return correct row data');
  console.log('PASS: findFirstUnprocessedRow skips Entered rows');
}

// findFirstUnprocessedRow: returns null when all rows have a Status
{
  const rows = [
    HEADERS,
    ['2026-07-01', 'Entered',   'Full-time', 'Acme Corp', 'Email', 'Applied', 'Jane', 'hr@acme.com', ''],
    ['2026-07-02', 'Submitted', 'Full-time', 'Big Corp',  'Phone', 'Applied', 'John', '',             ''],
  ];
  assert.strictEqual(findFirstUnprocessedRow(rows, HEADERS), null, 'should return null when all processed');
  console.log('PASS: findFirstUnprocessedRow returns null when all rows processed');
}

// findFirstUnprocessedRow: returns null for a sheet with only the header row
{
  assert.strictEqual(findFirstUnprocessedRow([HEADERS], HEADERS), null, 'should return null for header-only sheet');
  console.log('PASS: findFirstUnprocessedRow returns null for header-only sheet');
}

// checkRequiredFields: returns null when all required fields are present
{
  const row = ['2026-07-01', '', 'Full-time', 'Acme Corp', 'Email', 'Applied', '', '', ''];
  assert.strictEqual(checkRequiredFields(row, HEADERS), null, 'should return null when all required fields present');
  console.log('PASS: checkRequiredFields returns null when all required fields present');
}

// checkRequiredFields: returns the name of the first missing required field
{
  const row = ['2026-07-01', '', '', 'Acme Corp', 'Email', 'Applied', '', '', ''];
  assert.strictEqual(checkRequiredFields(row, HEADERS), 'Type of Work', 'should return missing field name');
  console.log('PASS: checkRequiredFields returns name of first missing required field');
}

// checkRequiredFields: treats whitespace-only values as missing
{
  const row = ['2026-07-01', '', 'Full-time', '   ', 'Email', 'Applied', '', '', ''];
  assert.strictEqual(checkRequiredFields(row, HEADERS), 'Employer/Agency Name', 'should treat whitespace as missing');
  console.log('PASS: checkRequiredFields treats whitespace-only as missing');
}

// rowToObject: converts row array to an object keyed by header name
{
  const row = ['2026-07-01', '', 'Full-time', 'Acme Corp', 'Email', 'Applied', 'Jane', 'hr@acme.com', '555-1234'];
  const obj = rowToObject(row, HEADERS);
  assert.strictEqual(obj['Date of Contact'],       '2026-07-01');
  assert.strictEqual(obj['Employer/Agency Name'],  'Acme Corp');
  assert.strictEqual(obj['Phone Number'],          '555-1234');
  assert.strictEqual(obj['Status'],                '');
  console.log('PASS: rowToObject converts row array to object keyed by header');
}

console.log('\nAll tests passed!');
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
node test/test-logic.js
```

Expected: `Error: Cannot find module '../src/logic.js'` (or similar)

- [ ] **Step 3: Implement `src/logic.js`**

```js
const REQUIRED_COLUMNS = [
  'Date of Contact',
  'Type of Work',
  'Employer/Agency Name',
  'Contact Type',
];

function findFirstUnprocessedRow(rows, headers) {
  const statusIdx = headers.indexOf('Status');
  for (let i = 1; i < rows.length; i++) {
    if (!(rows[i][statusIdx] || '').trim()) return { row: rows[i], rowIndex: i };
  }
  return null;
}

function checkRequiredFields(row, headers) {
  for (const colName of REQUIRED_COLUMNS) {
    const idx = headers.indexOf(colName);
    if (idx === -1 || !(row[idx] || '').trim()) return colName;
  }
  return null;
}

function rowToObject(row, headers) {
  return Object.fromEntries(headers.map((h, i) => [h, row[i] || '']));
}

if (typeof module !== 'undefined') {
  module.exports = { REQUIRED_COLUMNS, findFirstUnprocessedRow, checkRequiredFields, rowToObject };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
node test/test-logic.js
```

Expected:
```
PASS: findFirstUnprocessedRow skips Entered rows
PASS: findFirstUnprocessedRow returns null when all rows processed
PASS: findFirstUnprocessedRow returns null for header-only sheet
PASS: checkRequiredFields returns null when all required fields present
PASS: checkRequiredFields returns name of first missing required field
PASS: checkRequiredFields treats whitespace-only as missing
PASS: rowToObject converts row array to object keyed by header

All tests passed!
```

- [ ] **Step 5: Commit**

```bash
git add src/logic.js test/test-logic.js
git commit -m "feat: pure data logic with Node.js unit tests"
```

---

### Task 4: Google auth — OAuth 2.0 PKCE via launchWebAuthFlow

**Files:**
- Modify: `background.js`

**Interfaces:**
- Produces: `getAccessToken(): Promise<string>` — resolves with a valid Bearer token (cached, refreshed, or newly authorized)

- [ ] **Step 1: Replace `background.js` with the auth implementation**

```js
importScripts('src/logic.js');

// ── Auth ──────────────────────────────────────────────────────────────────────

function base64urlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function generatePKCE() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64urlEncode(verifierBytes);
  const challengeBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64urlEncode(challengeBuffer);
  return { verifier, challenge };
}

async function cacheTokens(tokenData) {
  const update = {
    accessToken:  tokenData.access_token,
    tokenExpiry:  Date.now() + (tokenData.expires_in - 60) * 1000,
  };
  if (tokenData.refresh_token) update.refreshToken = tokenData.refresh_token;
  await chrome.storage.local.set(update);
}

async function refreshAccessToken(clientId, refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     clientId,
      grant_type:    'refresh_token',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }
  const tokenData = await res.json();
  await cacheTokens(tokenData);
  return tokenData.access_token;
}

async function getAccessToken() {
  const { accessToken, tokenExpiry, refreshToken, clientId } =
    await chrome.storage.local.get(['accessToken', 'tokenExpiry', 'refreshToken', 'clientId']);

  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  if (!clientId) throw new Error('Client ID not configured');

  if (refreshToken) {
    try {
      return await refreshAccessToken(clientId, refreshToken);
    } catch {
      // fall through to full auth flow
    }
  }

  const { verifier, challenge } = await generatePKCE();
  const redirectUri = chrome.identity.getRedirectURL();

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id',             clientId);
  authUrl.searchParams.set('redirect_uri',          redirectUri);
  authUrl.searchParams.set('response_type',         'code');
  authUrl.searchParams.set('scope',                 'https://www.googleapis.com/auth/spreadsheets');
  authUrl.searchParams.set('code_challenge',        challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('access_type',           'offline');
  authUrl.searchParams.set('prompt',                'consent');

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      url => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(url);
      }
    );
  });

  const code = new URL(responseUrl).searchParams.get('code');
  if (!code) throw new Error('No authorization code in response');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Token exchange failed (${tokenRes.status}): ${body}`);
  }

  const tokenData = await tokenRes.json();
  await cacheTokens(tokenData);
  return tokenData.access_token;
}
```

- [ ] **Step 2: Verify auth manually via the background DevTools console**

1. Ensure you have already saved a valid Client ID in Options (Task 2)
2. Reload the extension
3. Open `edge://extensions` → find EDD Autofill → click "Inspect views: service worker"
4. In the console:
```js
const token = await getAccessToken();
console.log(token.substring(0, 20) + '…');
```
Expected: Google's consent screen opens in a popup on first run. After granting access, the console logs a token string (100+ characters).

On subsequent runs the console logs the token immediately (no popup) because the cached token or refresh token is used.

If you see an error about the redirect URI not matching: ensure the Client ID in Google Cloud Console was created as type "Chrome Extension" with the correct extension ID, and that the `"key"` field in `manifest.json` is set (so the extension ID is stable).

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "feat: OAuth 2.0 PKCE auth via launchWebAuthFlow with token caching"
```

---

### Task 5: Sheets API — fetch and update

**Files:**
- Modify: `background.js`

**Interfaces:**
- Consumes: `getAccessToken` from Task 4
- Produces:
  - `SHEET_TAB_NAME: string` — hard-coded constant (fill in before testing this task)
  - `SHEET_RANGE: string` — `"<tab>!A:I"`
  - `fetchSheetValues(token: string, sheetId: string, range: string): Promise<string[][]>`
  - `updateSheetValues(token: string, sheetId: string, range: string, values: string[][]): Promise<void>`

- [ ] **Step 1: Add Sheets config and helpers to `background.js`**

Add after the `getAccessToken` function:

```js
// ── Config ────────────────────────────────────────────────────────────────────

// TODO: replace 'Sheet1' with your actual sheet tab name (visible at the bottom of the spreadsheet)
const SHEET_TAB_NAME = 'Sheet1';
const SHEET_RANGE    = `${SHEET_TAB_NAME}!A:I`;

// ── Sheets API ────────────────────────────────────────────────────────────────

async function fetchSheetValues(token, sheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheet fetch failed (${res.status})`);
  return (await res.json()).values || [];
}

async function updateSheetValues(token, sheetId, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
  if (!res.ok) throw new Error(`Sheet update failed (${res.status})`);
}
```

- [ ] **Step 2: Update `SHEET_TAB_NAME`**

Open your Google Sheet. The tab name is the label at the bottom of the page. Replace `'Sheet1'` with the exact tab name.

- [ ] **Step 3: Verify read manually**

In the background DevTools console:
```js
const { sheetId } = await chrome.storage.local.get(['sheetId']);
const token = await getAccessToken();
const rows  = await fetchSheetValues(token, sheetId, SHEET_RANGE);
console.log('Headers:', rows[0]);
console.log('Row 2:', rows[1]);
```
Expected: `rows[0]` is your column header array; `rows[1]` is your first data row.

- [ ] **Step 4: Verify write manually**

Pick a test row you don't mind temporarily modifying (e.g., row 2 = `rows[1]`):
```js
await updateSheetValues(token, sheetId, `${SHEET_TAB_NAME}!B2`, [['TEST']]);
```
Expected: Status cell in row 2 changes to `TEST`. Manually revert it in the sheet.

- [ ] **Step 5: Commit**

```bash
git add background.js
git commit -m "feat: Sheets API fetch and update helpers"
```

---

### Task 6: Background message handler

**Files:**
- Modify: `background.js`

**Interfaces:**
- Consumes: `getAccessToken()` from Task 4, all other functions from Tasks 3–5; `chrome.tabs.sendMessage` to content script
- Produces: `chrome.runtime.onMessage` listener — handles `{ type: 'fill' }`, responds `{ success: boolean, message: string }`

- [ ] **Step 1: Add the message handler to `background.js`**

Add at the end of `background.js`:

```js
// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'fill') {
    handleFill()
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, message: err.message }));
    return true; // keep message channel open for async response
  }
});

async function handleFill() {
  const { sheetId, clientId } = await chrome.storage.local.get(['sheetId', 'clientId']);
  if (!sheetId || !clientId) {
    return { success: false, message: 'Please complete setup in Options before using.' };
  }

  let token;
  try {
    token = await getAccessToken();
  } catch {
    return { success: false, message: 'Could not authenticate with Google. Check your Client ID in Options.' };
  }

  const rows    = await fetchSheetValues(token, sheetId, SHEET_RANGE);
  const headers = rows[0];

  const found = findFirstUnprocessedRow(rows, headers);
  if (!found) {
    return { success: false, message: 'No blank rows found — nothing to fill.' };
  }

  const missingField = checkRequiredFields(found.row, headers);
  if (missingField) {
    return { success: false, message: `Required field missing in row ${found.rowIndex + 1}: ${missingField}` };
  }

  const fieldValues = rowToObject(found.row, headers);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let contentResult;
  try {
    contentResult = await chrome.tabs.sendMessage(tab.id, { type: 'fillForm', fieldValues });
  } catch {
    return { success: false, message: 'Could not reach the content script. Navigate to the EDD certification form first.' };
  }

  if (!contentResult.success) {
    return { success: false, message: `Could not find field: ${contentResult.field}. The form may have changed.` };
  }

  // rowIndex is 0-based in rows[]; rows[0] is the header = sheet row 1.
  // So the sheet row number for a data row at index i is i + 1.
  // Status is column B (index 1 in headers).
  const sheetRowNumber = found.rowIndex + 1;
  try {
    await updateSheetValues(token, sheetId, `${SHEET_TAB_NAME}!B${sheetRowNumber}`, [['Entered']]);
  } catch {
    return { success: true, message: 'Form filled, but failed to mark row as Entered. Check sheet permissions.' };
  }

  return { success: true, message: `Form filled. Row ${sheetRowNumber} marked as Entered.` };
}
```

- [ ] **Step 2: Smoke-test the handler**

1. Reload the extension
2. Open the background DevTools console
3. Run:
```js
chrome.runtime.sendMessage({ type: 'fill' }, r => console.log(r));
```
Expected (if Options not yet filled in): `{ success: false, message: 'Please complete setup in Options before using.' }`
Expected (if Options are filled but not on the EDD page): `{ success: false, message: 'Could not reach the content script. Navigate to the EDD certification form first.' }`

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "feat: background message handler wires full fill flow"
```

---

### Task 7: Popup UI

**Files:**
- Modify: `popup.html`
- Modify: `popup.js`

**Interfaces:**
- Consumes: `chrome.runtime.sendMessage({ type: 'fill' })` → `{ success: boolean, message: string }`
- Produces: visible popup with a Fill Form button and a status message area

- [ ] **Step 1: Write `popup.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body    { font-family: sans-serif; width: 280px; padding: 1rem; margin: 0; }
    button  { width: 100%; padding: 0.6rem; font-size: 1rem; cursor: pointer; }
    #status { margin-top: 0.75rem; font-size: 0.85rem; line-height: 1.4; }
    .error   { color: #c00; }
    .success { color: #080; }
    .working { color: #555; }
  </style>
</head>
<body>
  <button id="fill">Fill Form</button>
  <div id="status"></div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `popup.js`**

```js
// Confirmed and updated in Task 9 after reverse-engineering the EDD form URL.
const EDD_URL_PATTERN = 'unemployment.edd.ca.gov';

const btn    = document.getElementById('fill');
const status = document.getElementById('status');

function setStatus(text, cls) {
  status.textContent = text;
  status.className   = cls;
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  setStatus('Working…', 'working');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url || !tab.url.includes(EDD_URL_PATTERN)) {
    setStatus('Navigate to the EDD certification form first.', 'error');
    btn.disabled = false;
    return;
  }

  const result = await chrome.runtime.sendMessage({ type: 'fill' });
  setStatus(result.message, result.success ? 'success' : 'error');
  btn.disabled = false;
});
```

- [ ] **Step 3: Verify the popup renders and responds**

1. Reload the extension
2. Click the toolbar icon — popup opens with the "Fill Form" button
3. While on any non-EDD page, click the button → "Navigate to the EDD certification form first."
4. No JS errors in popup DevTools

- [ ] **Step 4: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: popup UI with fill trigger and status display"
```

---

### Task 8: Content script and dummy form test

**Files:**
- Modify: `content-script.js`
- Create: `dummy-form/index.html`

**Interfaces:**
- Consumes: `{ type: 'fillForm', fieldValues: Record<string, string> }` via `chrome.runtime.onMessage`
- Produces: `sendResponse({ success: true })` or `sendResponse({ success: false, field: string })`

Note: All `FIELD_MAP` selectors are `null` at this stage. The dummy form test uses a temporarily modified copy of `FIELD_MAP` to validate the filling mechanism before the real selectors are known (Task 9).

- [ ] **Step 1: Write `content-script.js`**

```js
// Selectors filled in during Task 9. Keys must match sheet column headers exactly.
const FIELD_MAP = {
  'Date of Contact':      null,
  'Type of Work':         null,
  'Employer/Agency Name': null,
  'Contact Type':         null,
  'Outcome':              null,
  'Name of Person':       null,
  'URL/Email':            null,
  'Phone Number':         null,
};

function fillForm(fieldValues) {
  for (const [colName, selector] of Object.entries(FIELD_MAP)) {
    if (!selector) continue;
    const el = document.querySelector(selector);
    if (!el) return { success: false, field: colName };
    el.value = fieldValues[colName] || '';
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return { success: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'fillForm') {
    sendResponse(fillForm(message.fieldValues));
  }
  return true;
});
```

- [ ] **Step 2: Create `dummy-form/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>EDD Autofill — Dummy Form</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
    label { display: block; margin-top: 1rem; }
    input { width: 100%; margin-top: 0.25rem; padding: 0.3rem; box-sizing: border-box; }
  </style>
</head>
<body>
  <h1>EDD Autofill — Test Form</h1>
  <p><em>Serve with <code>python3 -m http.server 8765</code> from the project root, then open <code>http://localhost:8765/dummy-form/</code>.</em></p>
  <form>
    <label>Date of Contact      <input type="text" name="dateOfContact" /></label>
    <label>Type of Work         <input type="text" name="typeOfWork" /></label>
    <label>Employer/Agency Name <input type="text" name="employerName" /></label>
    <label>Contact Type         <input type="text" name="contactType" /></label>
    <label>Outcome              <input type="text" name="outcome" /></label>
    <label>Name of Person       <input type="text" name="contactPerson" /></label>
    <label>URL/Email            <input type="text" name="urlEmail" /></label>
    <label>Phone Number         <input type="text" name="phoneNumber" /></label>
  </form>
</body>
</html>
```

- [ ] **Step 3: Temporarily add `http://localhost:8765/*` to manifest for dummy form testing**

In `manifest.json`, update `content_scripts.matches` and `host_permissions`:

```json
"content_scripts": [
  {
    "matches": ["*://unemployment.edd.ca.gov/*", "http://localhost:8765/*"],
    "js": ["content-script.js"]
  }
],
...
"host_permissions": [
  "*://unemployment.edd.ca.gov/*",
  "http://localhost:8765/*",
  "https://sheets.googleapis.com/*",
  "https://oauth2.googleapis.com/*"
]
```

And temporarily update `FIELD_MAP` in `content-script.js` with dummy selectors:

```js
const FIELD_MAP = {
  'Date of Contact':      'input[name="dateOfContact"]',
  'Type of Work':         'input[name="typeOfWork"]',
  'Employer/Agency Name': 'input[name="employerName"]',
  'Contact Type':         'input[name="contactType"]',
  'Outcome':              'input[name="outcome"]',
  'Name of Person':       'input[name="contactPerson"]',
  'URL/Email':            'input[name="urlEmail"]',
  'Phone Number':         'input[name="phoneNumber"]',
};
```

Also temporarily update `EDD_URL_PATTERN` in `popup.js`:
```js
const EDD_URL_PATTERN = 'localhost:8765';
```

- [ ] **Step 4: Serve the dummy form and test filling**

```bash
python3 -m http.server 8765
```

1. Open `http://localhost:8765/dummy-form/` in Edge
2. Reload the extension
3. Click the EDD Autofill toolbar button → "Fill Form"
4. Expected: all eight form fields populate with values from your sheet's first blank-Status row
5. Expected popup message: "Form filled. Row N marked as Entered."
6. Verify: the Status cell for that row now reads "Entered" in your Google Sheet

If any field doesn't populate: open DevTools on the dummy form page and call `fillForm({...})` directly in the console (switch context to the content script in the Sources panel) to isolate whether the issue is in filling vs. messaging.

- [ ] **Step 5: Revert temporary changes**

Reset `content-script.js` FIELD_MAP to all `null` selectors, revert `manifest.json` to remove `localhost`, and revert `popup.js` `EDD_URL_PATTERN` back to `'unemployment.edd.ca.gov'`.

- [ ] **Step 6: Commit**

```bash
git add content-script.js dummy-form/index.html manifest.json popup.js
git commit -m "feat: content script form filler with dummy form test"
```

---

### Task 9: Reverse-engineer EDD form selectors (manual)

**Files:**
- Modify: `content-script.js` — fill in all `FIELD_MAP` selectors
- Modify: `manifest.json` — confirm/correct EDD URL pattern
- Modify: `popup.js` — confirm/correct `EDD_URL_PATTERN`

**Interfaces:**
- Produces: complete `FIELD_MAP` with real CSS selectors; correct URL pattern in manifest and popup

- [ ] **Step 1: Navigate to the EDD job search activity entry form**

Log in to your EDD account and navigate to the specific page where you enter individual job contact records (not the certification summary — the per-entry form).

- [ ] **Step 2: Inspect each field with Edge DevTools (F12 → Elements)**

For each of the eight columns, right-click the form field → "Inspect element." Record:
- `id` attribute → prefer `#id` selectors (most stable, e.g. `#dateOfContact`)
- If no `id`, use `[name="..."]` (e.g. `input[name="employerName"]`)
- If it's a `<select>` dropdown, note that — `.value = 'x'` only works if `'x'` exactly matches an `<option value>` in the dropdown

Record selectors for: Date of Contact, Type of Work, Employer/Agency Name, Contact Type, Outcome, Name of Person, URL/Email, Phone Number.

- [ ] **Step 3: Note the full page URL**

Look at the browser address bar. The `EDD_URL_PATTERN` should be a substring that uniquely identifies this domain/path without being overly specific (e.g. `ui.edd.ca.gov` or `unemployment.edd.ca.gov`).

- [ ] **Step 4: Fill in `FIELD_MAP` in `content-script.js`**

Replace each `null` with the selector you found:

```js
const FIELD_MAP = {
  'Date of Contact':      '#<selector>',
  'Type of Work':         '#<selector>',
  'Employer/Agency Name': '#<selector>',
  'Contact Type':         '#<selector>',
  'Outcome':              '#<selector>',
  'Name of Person':       '#<selector>',
  'URL/Email':            '#<selector>',
  'Phone Number':         '#<selector>',
};
```

Note on `<select>` elements: after setting `.value`, dispatch a `change` event (already done in `fillForm`). Verify the option value strings in DevTools by expanding the `<select>` element and checking `<option value="...">` attributes — these must match what your sheet contains.

- [ ] **Step 5: Update URL pattern in `manifest.json` and `popup.js`**

In `manifest.json` — update both `content_scripts.matches` and the matching `host_permissions` entry:
```json
"matches": ["*://<real-domain>/<real-path>/*"]
```

In `popup.js`:
```js
const EDD_URL_PATTERN = '<real-domain>';
```

- [ ] **Step 6: Verify the content script loads on the EDD page**

1. Reload the extension
2. Navigate to the EDD form
3. Open DevTools → Sources → Content Scripts — confirm `content-script.js` is listed
4. No errors in the Console tab

- [ ] **Step 7: Commit**

```bash
git add content-script.js manifest.json popup.js
git commit -m "feat: fill in EDD form selectors and confirm URL pattern"
```

---

### Task 10: End-to-end test (manual)

**Files:** None — verification only

- [ ] **Step 1: Prepare the sheet**

Ensure at least one row has a blank Status cell and all four required fields filled in: Date of Contact, Type of Work, Employer/Agency Name, Contact Type.

- [ ] **Step 2: Happy path**

1. Log in to EDD and navigate to the job search activity entry form
2. Click the EDD Autofill toolbar button → "Fill Form"
3. Expected popup: "Form filled. Row N marked as Entered."
4. Verify: all eight form fields contain the correct values from the sheet row
5. Verify: the Status cell for that row reads "Entered" in your Google Sheet

- [ ] **Step 3: Error path coverage**

| Scenario | How to trigger | Expected popup message |
|---|---|---|
| Not configured | Clear settings via Options (blank both fields), click Fill Form | "Please complete setup in Options before using." |
| Wrong page | Click Fill Form on any non-EDD page | "Navigate to the EDD certification form first." |
| No unprocessed rows | Mark all Status cells non-empty, click Fill Form | "No blank rows found — nothing to fill." |
| Required field missing | Leave Type of Work blank in the next unprocessed row, click Fill Form | "Required field missing in row N: Type of Work" |
| Field selector broken | Temporarily change one FIELD_MAP selector to `'input[name="zzz"]'`, reload, click Fill Form | "Could not find field: [that column name]. The form may have changed." |

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: edd autofill extension v1 complete"
```
