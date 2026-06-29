# EDD Autofill Firefox Extension Plan

## Overview
A Firefox extension that automatically fills the California EDD job search certification form using data from a Google Sheet.

The first usable version should:
- assume the user is already logged in to the EDD website and has navigated to the certification form page
- read a Google Sheet
- find the first row that is not marked as processed
- populate the form fields with that row's values
- mark that row processed in the sheet after successful filling

## Minimum viable scope
- Target Firefox only
- Use Google Sheets API for read/write access
- Require a single configured Google Sheet and sheet/tab
- Use an explicit `Processed` marker column instead of relying on highlight color
- Expose a manual trigger via the extension action

## Extension structure

### Files
- `manifest.json`
- `background.js`
- `content-script.js`
- `options.html`
- `options.js`
- `popup.html` (optional)
- `popup.js` (optional)

### `manifest.json`
- `manifest_version: 3`
- `action` for the toolbar button
- `background.service_worker` for authentication and sheet access
- `content_scripts` for the EDD form page
- permissions:
  - `activeTab`
  - `storage`
  - `identity`
  - `https://sheets.googleapis.com/*`
- host permissions for the government site domain and the Sheets API

### `options.html` / `options.js`
User configuration UI should include:
- Google Sheet ID
- sheet name or range
- name of the `Processed` marker column
- mapping of sheet columns to form selectors
- the target EDD form page URL pattern

Save this configuration in `browser.storage.local`.

### `background.js`
Responsibilities:
- manage OAuth authentication via `browser.identity.launchWebAuthFlow`
- fetch sheet data from the Google Sheets API
- find the first unprocessed row
- send row data to the content script
- update the `Processed` marker after filling succeeds

Key helper functions:
- `fetchSheetValues(sheetId, range)`
- `updateSheetValues(sheetId, range, values)`
- `findFirstUnprocessedRow(rows, processedColumnIndex)`
- `getHeaderIndexes(headerRow)`

### `content-script.js`
Responsibilities:
- run on the EDD form page domain
- receive row data and selector mapping from the background script
- locate form fields and populate them
- dispatch `input` and `change` events when needed
- return success or failure status to the background script

## Core flow
1. User clicks the extension action on the EDD form page.
2. `background.js` loads config and obtains an OAuth token.
3. Background fetches the sheet range, including headers and data rows.
4. It identifies the first unprocessed row using the configured marker column.
5. It sends the row values and field mapping to `content-script.js`.
6. The content script fills the page form fields.
7. On success, the background updates the `Processed` marker in the sheet.

## User workflow
1. Install the extension.
2. Configure the Google Sheet ID, sheet name, mapping, and processed column in options.
3. Open the EDD certification form after login.
4. Click the extension toolbar button.
5. The extension fills the form with the next available row.
6. The sheet row is marked processed.

## Configuration recommendations
Use a Google Sheet with columns such as:
- `Name`
- `Address`
- `Job Title`
- `Date`
- `Processed`

Prefer explicit column names and explicit form selectors e.g.:
- `Name -> #fullName`
- `Date -> input[name="certDate"]`
- `WorkedHours -> input[name="hoursWorked"]`

## Error handling and feedback
Display clear messages for:
- missing configuration
- failed authentication
- no unprocessed rows found
- form selector mismatch
- sheet update failure

Possible feedback channels:
- extension popup text
- browser notifications
- return message after the toolbar action triggers

## Testing plan
- build a sample sheet with test rows and a `Processed` column
- verify the extension can read the sheet and find an unprocessed row
- verify the content script fills a dummy form page first
- verify the extension updates the `Processed` column after success
- then test against the real EDD form page if available

## Next iteration ideas
- support actual highlight/bg color detection instead of a marker column
- add a preview view for the next row
- support multiple sheet tabs or configurable row ranges
- add retry handling for expired tokens
- add support for multiple forms or sites

## Notes
- The first version should avoid brittle formatting-based highlight detection.
- A status column is much more reliable and easier to implement.
- OAuth via `browser.identity` is needed because the extension must write back to the sheet.
