document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get([
    'authMode', 'sheetId', 'ceClientId', 'waClientId', 'waClientSecret',
    'clientId', // legacy — migrate to ceClientId on first load
  ]);

  const authMode = stored.authMode || 'chrome-extension';
  document.querySelector(`input[name="authMode"][value="${authMode}"]`).checked = true;
  toggleSections(authMode);

  if (stored.sheetId) document.getElementById('sheetId').value = stored.sheetId;
  // Migrate old single clientId to ceClientId
  const ceClientId = stored.ceClientId || stored.clientId || '';
  if (ceClientId)          document.getElementById('ceClientId').value    = ceClientId;
  if (stored.waClientId)   document.getElementById('waClientId').value    = stored.waClientId;
  if (stored.waClientSecret) document.getElementById('waClientSecret').value = stored.waClientSecret;
});

function toggleSections(mode) {
  document.getElementById('ceSection').style.display = mode === 'chrome-extension' ? '' : 'none';
  document.getElementById('waSection').style.display = mode === 'web-application'  ? '' : 'none';
}

document.querySelectorAll('input[name="authMode"]').forEach(radio => {
  radio.addEventListener('change', e => toggleSections(e.target.value));
});

document.getElementById('save').addEventListener('click', async () => {
  const authMode       = document.querySelector('input[name="authMode"]:checked').value;
  const sheetId        = document.getElementById('sheetId').value.trim();
  const ceClientId     = document.getElementById('ceClientId').value.trim();
  const waClientId     = document.getElementById('waClientId').value.trim();
  const waClientSecret = document.getElementById('waClientSecret').value.trim();
  const statusEl       = document.getElementById('status');

  const activeClientId = authMode === 'web-application' ? waClientId : ceClientId;
  if (!sheetId || !activeClientId || (authMode === 'web-application' && !waClientSecret)) {
    statusEl.className   = 'error';
    statusEl.textContent = 'Please fill in all required fields for the selected auth mode.';
    return;
  }

  // Clear cached tokens so the next fill re-authenticates with the current mode
  await chrome.storage.local.remove(['accessToken', 'tokenExpiry', 'refreshToken']);
  await chrome.storage.local.set({ authMode, sheetId, ceClientId, waClientId, waClientSecret });
  statusEl.className   = 'ok';
  statusEl.textContent = 'Saved.';
});
