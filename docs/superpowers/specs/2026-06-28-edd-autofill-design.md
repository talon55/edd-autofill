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
- Multiple sheets or tabs

**Permanent non-goals (never in any version):**
- Service account keys — Google discourages them for user-facing access; OAuth is the correct approach
- Storing or handling login credentials for Google or the EDD website — the extension assumes the user is already signed in to both
- Submitting the EDD form on the user's behalf (though a future version could detect submission and offer to update the sheet)

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
| `clientId` | OAuth 2.0 Client ID from Google Cloud Console |

Everything else — sheet tab name, column names, form selectors, Status values — is hard-coded in the extension. OAuth tokens and refresh tokens are also stored in `chrome.storage.local` automatically by the auth module (not user-visible).

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

Access is granted by the user authorizing the extension via Google's OAuth consent screen. No sheet sharing or service account setup is needed.

---

## Authentication

The extension uses **OAuth 2.0 via `chrome.identity.launchWebAuthFlow`** with PKCE. The user authorizes the extension once via Google's consent screen; subsequent fills use a cached access token or silently refresh it with a stored refresh token.

Flow on first use:
1. Background reads `clientId` from storage — if missing, return "not configured" error
2. Generate a PKCE code verifier and SHA-256 challenge
3. Call `chrome.identity.launchWebAuthFlow` to open Google's consent screen
4. Extract the authorization code from the redirect URL
5. Exchange code + verifier for access token + refresh token at `https://oauth2.googleapis.com/token`
6. Cache access token and expiry in `chrome.storage.local`; store refresh token persistently

Flow on subsequent fills (token still valid):
- Read cached access token; use directly if not expired

Flow on subsequent fills (token expired):
- Use stored refresh token to obtain a new access token silently (no consent screen)
- Update cached token and expiry

The redirect URI is obtained via `chrome.identity.getRedirectURL()` — this produces `https://<extension-id>.chromiumapp.org/`, which must be registered in Google Cloud Console as an authorized redirect URI. The extension ID must be stable (see Known Unknowns).

---

## Data Flow

1. User clicks the toolbar button on the EDD form page
2. Popup sends a `"fill"` message to `background.js`
3. Background reads `sheetId` and `clientId` from `chrome.storage.local`
   - If either is missing → return error: "Please complete setup in Options"
4. Background calls `getAccessToken()` — returns cached token, silently refreshes, or launches consent screen as needed
   - If this fails → return error: "Could not authenticate with Google"
5. Background fetches all rows from the configured sheet range via Sheets API
6. Background scans the Status column for the first blank row
   - If none found → return error: "No unprocessed rows found"
6a. Background checks that all required columns in that row are non-empty
   - If any required column is blank → return error: "Required field missing: [column name]"
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
  //                              selector (filled after reverse-engineering)   required?
  "Date of Contact":      { selector: null, required: true  },
  "Type of Work":         { selector: null, required: true  },
  "Employer/Agency Name": { selector: null, required: true  },
  "Contact Type":         { selector: null, required: true  },
  "Outcome":              { selector: null, required: false },
  "Name of Person":       { selector: null, required: false },
  "URL/Email":            { selector: null, required: false },
  "Phone Number":         { selector: null, required: false },
};
```

Keys match sheet column headers exactly. The `required` flags reflect what the EDD form itself requires — adjust after reverse-engineering if the form enforces different fields. The Status column is not in `FIELD_MAP` — it is handled separately by `background.js`.

Adding new columns in future versions means adding one entry to `FIELD_MAP` and ensuring the corresponding column exists in the sheet.

---

## Popup States

The popup shows one message at a time:

| Condition | Message |
|---|---|
| Not configured | "Please complete setup in Options before using." |
| Not on EDD form page | "Navigate to the EDD certification form first." |
| Auth failed | "Could not authenticate with Google. Check your Client ID in Options." |
| No unprocessed rows | "No blank rows found — nothing to fill." |
| Required column blank | "Required field missing in row [N]: [column name]." |
| Field not found | "Could not find field: [field name]. The form may have changed." |
| Sheet write failed | "Form filled, but failed to mark row as Entered. Check sheet permissions." |
| Success | "Form filled. Row [N] marked as Entered." |

The "sheet write failed" case reports partial success — the form is already filled so the user can mark the row manually and continue.

---

## Testing Plan

1. **Options page** — enter a real Sheet ID and OAuth Client ID; verify it saves and reloads on re-open
2. **Auth + sheet read** — click Fill Form, complete the Google consent screen on first use, verify the extension authenticates and identifies the correct first-blank-Status row
3. **Content script against a dummy form** — build a local HTML page with matching field `name` attributes; verify all fields populate and events fire correctly
4. **Full end-to-end on the live EDD form** — verify fills work after selectors are confirmed
5. **Sheet write-back** — confirm the Status cell updates to "Entered" after a successful fill
6. **Error paths** — manually trigger each error state and confirm the popup message is correct

---

## Known Unknowns (Resolved During Reverse-Engineering)

Three values are hard-coded or registered externally but not yet known:

| Unknown | Where it's used | How to find it |
|---|---|---|
| EDD form URL pattern | `manifest.json` `content_scripts.matches`, popup page-check | Look at the URL on the live EDD certification form page |
| Sheet tab name | `background.js` range string (e.g. `SheetName!A:I`) | Check the tab name in the Google Sheet |
| Extension ID | OAuth redirect URI registered in Google Cloud Console | Load the extension in Edge; the ID appears on `edge://extensions`. Add a `"key"` field to `manifest.json` to make it stable across reinstalls — see Key Implementation Notes. |

The popup "not on EDD form page" check compares the active tab URL against the EDD URL pattern using `chrome.tabs.query`. If the URL doesn't match, the popup shows the error immediately without contacting the background script.

---

## Key Implementation Notes

- **OAuth PKCE flow** uses `chrome.identity.launchWebAuthFlow` with a SHA-256 code challenge. Generate a random 32-byte verifier, hash it with `crypto.subtle.digest('SHA-256', ...)`, and base64url-encode both. The redirect URI comes from `chrome.identity.getRedirectURL()`. No client secret is needed (PKCE replaces it).
- **Stable extension ID:** To keep the OAuth redirect URI constant across reinstalls, add a `"key"` field to `manifest.json`. Pack the extension once via `edge://extensions` → "Pack extension" to get a `.pem` file, then extract the public key with `openssl rsa -in key.pem -pubout -outform DER | openssl base64 -A` and paste it as the `"key"` value.
- **Token caching** is built into the auth module: access token + expiry in `chrome.storage.local`; refresh token stored persistently. The consent screen only appears on first use or after the user revokes access.
- **`input`/`change` events** must be dispatched after setting field values, as the EDD form likely uses a JS framework that doesn't detect direct `.value` assignments without them.
- **Form reverse-engineering** is a prerequisite before the content script can be completed. Use Edge DevTools on the live EDD page to identify each field's selector and record the page URL pattern.
- The **sheet tab name** is hard-coded in `background.js`. Determine it during setup and update accordingly.

---

## Future Iterations

The v1 design is intentionally minimal. These are the planned directions for future versions, roughly in priority order:

| Iteration | Notes |
|---|---|
| **Cache access token** | ✅ Built into v1 — access token cached with expiry, refresh token stored persistently. |
| **Additional form columns** | Add new entries to `FIELD_MAP`. No architectural change needed — the structure already supports arbitrary column additions. |
| **Support for multiple form types** | Extract `FIELD_MAP` into a named config (e.g. `FORMS.jobSearch`, `FORMS.pay`) and select the right one based on the current page URL. Each form type gets its own map and sheet range. |
| **Fill multiple entries at once** | Instead of stopping at the first blank row, collect N consecutive blank rows and fill the form N times (requires navigating through multi-entry form pages or repeating per-entry). |
| **Default values for other form pages** | Some EDD certification pages have common answers that don't come from the sheet (e.g. confirmation checkboxes). These could be hard-coded per page type. |
| **Detect form submission + offer sheet update** | Listen for form submit events on the EDD page; offer to update the row Status to `"Submitted"` automatically rather than requiring manual update. |
| **Narrow OAuth scope to a single sheet** | Currently requests `auth/spreadsheets`, which grants access to all of the user's Sheets. Switching to `auth/drive.file` would scope access to just the target sheet, but requires integrating the Google Picker API (API key, hosted picker UI) so the user can explicitly grant the file — nontrivial under MV3's CSP restrictions on remote scripts. Deferred since v1 is single-user and unpublished. |
