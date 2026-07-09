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
