# EDD Autofill

A simple tool to automatically fill in the California EDD UI job search certification form with information from a google sheet.

## Website Analysis

URL: https://uio.edd.ca.gov/UIO/Pages/ExternalUser/Certification/FormCCA4581RegularDUAWorkSearchRecord.aspx

```js
const FIELD_MAP = {
  "Date of Contact":  '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtDateOfContact_ctl00_txtDatePicker',
  "Type of Work": '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtTypeOfWork_ctl00_txtValue',
  "Employer/Agency Name": '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtEmployerAgencyName_ctl00_txtValue',
  "Contact Type":  '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtContactType_ctl00_ddlValue',
  "Outcome":  '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtOutcomeWorkInquiry_ctl00_ddlValue',
  "Name of Person": '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtWorkSearchPersonContacted_ctl00_txtValue',
  "URL/Email": '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtWebSiteURLEmailContact_ctl00_txtValue',
  "Phone Number": '#contentMain_contentMain_ucRegularDUA4581WorkSearchRecordV3_frmFormWorkSearchInformation_prtPhoneFaxNumber_ctl00_txtValue',
};
```
