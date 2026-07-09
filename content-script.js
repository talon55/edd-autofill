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
