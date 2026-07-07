document.addEventListener('DOMContentLoaded', async () => {
  const { sheetId, serviceAccountJson } = await chrome.storage.local.get(['sheetId', 'serviceAccountJson']);
  if (sheetId)             document.getElementById('sheetId').value             = sheetId;
  if (serviceAccountJson)  document.getElementById('serviceAccountJson').value  = serviceAccountJson;
});

document.getElementById('save').addEventListener('click', async () => {
  const sheetId            = document.getElementById('sheetId').value.trim();
  const serviceAccountJson = document.getElementById('serviceAccountJson').value.trim();
  const statusEl           = document.getElementById('status');

  if (!sheetId || !serviceAccountJson) {
    statusEl.className   = 'error';
    statusEl.textContent = 'Both fields are required.';
    return;
  }

  try {
    JSON.parse(serviceAccountJson);
  } catch {
    statusEl.className   = 'error';
    statusEl.textContent = 'Service account JSON is not valid JSON.';
    return;
  }

  await chrome.storage.local.set({ sheetId, serviceAccountJson });
  statusEl.className   = 'ok';
  statusEl.textContent = 'Saved.';
});
