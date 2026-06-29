# EDD Autofill Edge Extension — Design Spec

**Date:** 2026-06-28
**Status:** Approved

## Overview

A Microsoft Edge extension that fills the California EDD UI job search certification form using data from a Google Sheet. The user clicks a toolbar button on the EDD form page; the extension finds the next unprocessed sheet row, fills the form fields, and marks the row as "Entered."

The goal is to eliminate manual copy-pasting of job search activity fields. This is a personal tool — simplicity is the primary constraint.

---

## Scope

**In scope (v1):**
- Read job search rows from a single configured Google Sheet
- Fill a hard-coded set of form fields on the EDD certification page
- Mark the filled row's Status column as "Entered"
- Show all feedback in the extension popup

**Out of scope (v1):**
- Configurable field-to-selector mapping
- Form submission
- OAuth user auth flow
- Multiple sheets or tabs
- Retry logic for expired tokens

---

## Target Environment

- **Browser:** Microsoft Edge (Chromium-based)
- **Extension API:** Chrome Extension API (`chrome.*`) — Edge supports this natively
- **Manifest version:** MV3
- **No build step** — plain JS files loaded directly by the browser

---

## Files

```
manifest.json       — MV3 manifest
background.js       — service worker; owns auth and Sheets API calls
content-script.js   — runs on EDD form page; fills fields
options.html        — settings page
options.js          — saves/loads settings
popup.html          — toolbar button UI
popup.js            — triggers fill, displays status
```

---

## Configuration (Options Page)

Two fields, stored in `chrome.storage.local`:

| Setting | Description |
|---|---|
| `sheetId` | The Google Sheet ID (from the URL) |
| `serviceAccountJson` | Full service account JSON key (pasted as text) |

Everything else — sheet tab name, column names, form selectors, Status values — is hard-coded in the extension.

---

## Google Sheets Setup

The extension targets this sheet structure:

| Column | Notes |
|---|---|
| Date of Contact | Maps to EDD form field |
| Status | `blank` = unprocessed, `"Entered"` = filled by extension, `"Submitted"` = manually set by user |
| Type of Work | Maps to EDD form field |
| Employer/Agency Name | Maps to EDD form field |
| Contact Type | Maps to EDD form field |
| Outcome | Maps to EDD form field |
| Name of Person | Maps to EDD form field |
| URL/Email | Maps to EDD form field |
| Phone Number | Maps to EDD form field |

**The extension only writes `"Entered"` — it never modifies `"Submitted"` rows or any other column.**

Access is granted by sharing the sheet with the service account's email address (found in the service account JSON as `client_email`).

---

## Authentication

The extension uses a **Google service account** — no OAuth user consent flow required.

Flow on each fill:
1. Parse the service account JSON from storage
2. Build a JWT signed with the private key using `crypto.subtle.sign` (RS256)
3. POST the JWT to `https://oauth2.googleapis.com/token` for a short-lived access token
4. Use the access token as a Bearer token on all Sheets API requests

The access token is not cached between sessions — a new one is fetched on each toolbar click. Token lifetime is 1 hour; for a single fill operation this is sufficient.

---

## Data Flow

1. User clicks the toolbar button on the EDD form page
2. Popup sends a `"fill"` message to `background.js`
3. Background reads `sheetId` and `serviceAccountJson` from `chrome.storage.local`
   - If either is missing → return error: "Please complete setup in Options"
4. Background signs a JWT and exchanges it for an access token
   - If this fails → return error: "Could not authenticate with Google"
5. Background fetches all rows from the configured sheet range via Sheets API
6. Background scans the Status column for the first blank row
   - If none found → return error: "No unprocessed rows found"
7. Background sends the row data to `content-script.js` via `chrome.tabs.sendMessage`
8. Content script maps column values to form fields using `FIELD_MAP` and fills each one, dispatching `input` and `change` events after each fill
9. Content script returns `{ success: true }` or `{ success: false, field: "..." }` to background
   - If a field is not found → return error: "Could not find field: [field name]"
10. On success, background writes `"Entered"` to the Status cell of the filled row
    - If write fails → return partial success: "Form filled, but failed to mark row as Entered"
11. Popup displays the final result

---

## Hard-coded Field Mapping

Selectors are filled in during the form reverse-engineering task (inspect the live EDD page with DevTools). The mapping lives in `content-script.js`:

```js
const FIELD_MAP = {
  "Date of Contact":      null, // TODO: fill in after reverse-engineering
  "Type of Work":         null,
  "Employer/Agency Name": null,
  "Contact Type":         null,
  "Outcome":              null,
  "Name of Person":       null,
  "URL/Email":            null,
  "Phone Number":         null,
};
```

Keys match sheet column headers exactly. The Status column is not in `FIELD_MAP` — it is handled separately by `background.js`.

---

## Popup States

The popup shows one message at a time:

| Condition | Message |
|---|---|
| Not configured | "Please complete setup in Options before using." |
| Not on EDD form page | "Navigate to the EDD certification form first." |
| Auth failed | "Could not authenticate with Google. Check your service account JSON." |
| No unprocessed rows | "No blank rows found — nothing to fill." |
| Field not found | "Could not find field: [field name]. The form may have changed." |
| Sheet write failed | "Form filled, but failed to mark row as Entered. Check sheet permissions." |
| Success | "Form filled. Row [N] marked as Entered." |

The "sheet write failed" case reports partial success — the form is already filled so the user can mark the row manually and continue.

---

## Testing Plan

1. **Options page** — enter a real Sheet ID and service account JSON; verify it saves and reloads on re-open
2. **Auth + sheet read** — click Fill Form, verify the extension authenticates and identifies the correct first-blank-Status row
3. **Content script against a dummy form** — build a local HTML page with matching field `name` attributes; verify all fields populate and events fire correctly
4. **Full end-to-end on the live EDD form** — verify fills work after selectors are confirmed
5. **Sheet write-back** — confirm the Status cell updates to "Entered" after a successful fill
6. **Error paths** — manually trigger each error state and confirm the popup message is correct

---

## Known Unknowns (Resolved During Reverse-Engineering)

Two values are hard-coded but not yet known — both are determined by inspecting the live EDD page and the sheet:

| Unknown | Where it's used | How to find it |
|---|---|---|
| EDD form URL pattern | `manifest.json` `content_scripts.matches`, popup page-check | Look at the URL on the live EDD certification form page |
| Sheet tab name | `background.js` range string (e.g. `SheetName!A:I`) | Check the tab name in the Google Sheet |

The popup "not on EDD form page" check compares the active tab URL against the EDD URL pattern using `chrome.tabs.query`. If the URL doesn't match, the popup shows the error immediately without contacting the background script.

---

## Key Implementation Notes

- **JWT signing** is the most complex piece: use `crypto.subtle.importKey` with the RSA private key from the service account JSON, then `crypto.subtle.sign` with the RS256 algorithm. The private key is in PKCS#8 PEM format in the JSON — it must be decoded to an `ArrayBuffer` before import.
- **`input`/`change` events** must be dispatched after setting field values, as the EDD form likely uses a JS framework that doesn't detect direct `.value` assignments without them.
- **Form reverse-engineering** is a prerequisite before the content script can be completed. Use Edge DevTools on the live EDD page to identify each field's selector and record the page URL pattern.
- The **sheet tab name** is hard-coded in `background.js`. Determine it during setup and update accordingly.
