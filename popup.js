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
