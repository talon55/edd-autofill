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
