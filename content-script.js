const VALUE_MAP = {
  'Contact Type': {
    'Mail':      '6656',
    'Email':     '6658',
    'In-Person': '6659',
    'Online':    '6660',
    'Phone':     '6661',
  },
  'Outcome': {
    'Applied':           '6662',
    'No Decision':       '6663',
    'Hired':             '6664',
    'Not Hiring':        '6665',
    'Pending':           '6666',
    'Interviewed':       '6667',
    'Interview Date Set':'6668',
    'No Response':       '6669',
  },
};

const FIELD_MAP = {
  'Date of Contact':      '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtDateOfContact_ctl00_txtDatePicker',
  'Type of Work':         '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtTypeOfWork_ctl00_txtValue',
  'Employer/Agency Name': '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtEmployerAgencyName_ctl00_txtValue',
  'Contact Type':         '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtContactType_ctl00_ddlValue',
  'Outcome':              '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtOutcomeWorkInquiry_ctl00_ddlValue',
  'Name of Person':       '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtWorkSearchPersonContacted_ctl00_txtValue',
  'URL/Email':            '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtWebSiteURLEmailContact_ctl00_txtValue',
  'Phone Number':         '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtPhoneFaxNumber_ctl00_txtValue',
};

function fillForm(fieldValues) {
  for (const [colName, selector] of Object.entries(FIELD_MAP)) {
    if (!selector) continue;
    const el = document.querySelector(selector);
    if (!el) return { success: false, field: colName };
    const raw = fieldValues[colName] || '';
    el.value = (VALUE_MAP[colName] && VALUE_MAP[colName][raw]) || raw;
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
