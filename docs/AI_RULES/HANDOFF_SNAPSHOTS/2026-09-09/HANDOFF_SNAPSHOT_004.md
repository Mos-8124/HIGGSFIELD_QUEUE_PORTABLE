# HANDOFF SNAPSHOT 004

Date: 2026-09-09
Task: `task-studio-ui-cleanup-and-branding`

---

## GTF STUDIO UI ASSET RESOLUTION, CLEANUP & BRANDING

### User Request (tóm tắt)
> 1. Fix GTF Studio CSS/JS assets not loading at http://localhost:20140/byteplus.
> 2. UI Cleanups (remove legacy/incompatible elements):
>    - Remove livestream preview box
>    - Remove CLI logs tab
>    - Hide button sync videos
>    - Remove unlimited mode row
>    - Remove single & bulk CLI credit toggles
>    - Remove Higgsfield Standard model option
>    - Strictly modify ONLY the new system flow (public/studio/), keep legacy system untouched.
> 3. Branding & Header:
>    - Rename header logo to "GTF Video AI Studio".
>    - Hide the CDP status indicator badge (#cdp-status).

---

### Key Architectural & Implementation Details

1. **Asset Path Resolution (`public/studio/index.html`)**:
   - Replaced relative `studio.css` and `studio.js` with absolute `/studio/studio.css` and `/studio/studio.js`.
   - Verified HTTP 200 on all static asset requests when accessing `/byteplus`.

2. **UI Cleanup of Legacy Elements (`public/studio/index.html`, `public/studio/studio.css`)**:
   - Removed livestream preview box `.preview-box`. Adjusted `.monitor-grid` to 1fr so terminal log expands cleanly.
   - Removed `#tab-log-cli` and `#cli-logs-container`.
   - Hidden `#btn-sync-videos` via `style="display: none;"`.
   - Removed `#unlimited-row`.
   - Removed `#single-form/div[8]` (CLI credit options row) and `#bulk-tab/div[4]`.
   - Removed `Higgsfield Standard` option from `#model` and `#bulk-model`, retaining only `Seedance 2.5`.

3. **Branding & CDP Badge Visibility (`public/studio/index.html`)**:
   - Renamed header title `<h1>` to `GTF Video AI Studio`.
   - Updated document `<title>` to `GTF Video AI Studio`.
   - Hidden `#cdp-status` using `style="display: none !important;"`, keeping DOM element safe for cached references.

4. **Strict Isolation**:
   - Legacy files (`public/index.html`, `public/styles.css`, `public/app.js`, legacy routes) completely untouched.

---

### Test Verification
```text
Total Tests:    164
Passed:         164 (100%)
Failed:         0
Live API Calls: 0
```

Backup reference: `docs/BACKUPS/2026-09-09/task-studio-ui-cleanup-and-branding/`
