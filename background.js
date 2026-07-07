importScripts('src/logic.js');

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getAccessToken(serviceAccountJson) {
  const sa  = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  };

  const b64url = obj =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  const pemContents = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signingInput}.${sigB64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }

  return (await res.json()).access_token;
}

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
  const { sheetId, serviceAccountJson } = await chrome.storage.local.get(['sheetId', 'serviceAccountJson']);
  if (!sheetId || !serviceAccountJson) {
    return { success: false, message: 'Please complete setup in Options before using.' };
  }

  let token;
  try {
    token = await getAccessToken(serviceAccountJson);
  } catch {
    return { success: false, message: 'Could not authenticate with Google. Check your service account JSON.' };
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
