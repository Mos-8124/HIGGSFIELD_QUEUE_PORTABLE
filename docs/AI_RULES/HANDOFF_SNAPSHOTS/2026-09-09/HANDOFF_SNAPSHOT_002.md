# HANDOFF SNAPSHOT 002

Date: 2026-09-09
Task: `task-kie-only-mode`

---

## KIE-ONLY MODE ENFORCEMENT & REMOVAL OF BYTEPLUS/TOS/LAS DEPENDENCIES

### User Request (tóm tắt)
> We no longer want BytePlus/TOS/LAS in the active flow.
> The system must run in KIE-only mode.
> 1. When GTF_VIDEO_PROVIDER=kie:
>    - NEVER run BytePlus TOS validation
>    - NEVER require BYTEPLUS_TOS_ACCESS_KEY / SECRET_KEY / BUCKET / REGION
>    - NEVER initialize BytePlusTosStorageProvider
>    - NEVER run LAS validation
>    - NEVER initialize any BytePlus provider
>    - NEVER throw BYTEPLUS_TOS_NOT_CONFIGURED
> 2. KIE-only reference flow must be:
>    local image/video reference -> KieFileStorageProvider -> temporary KIE-accessible URL -> Kie video provider create task
> 3. Preserve legacy code for byteplus/openrouter/higgsfield, but only activate them when their provider is selected.
> 4. Audit all preflight checks, reference managers, storage providers, queue manager wiring, and route handlers to ensure no BytePlus-only dependency leaks into KIE mode.
> 5. Add regression tests:
>    provider=kie, all BYTEPLUS_TOS_* empty, all BYTEPLUS_LAS_* empty, create task with image reference, confirm no BYTEPLUS_TOS_NOT_CONFIGURED is thrown.
> 6. Update settings/status API so UI clearly displays:
>    - Active Provider: KIE
>    - Reference Storage: KIE upload
>    - TOS: not used
>    - LAS: not used
> 7. Zero live API calls in automated tests.

---

### Key Architectural Changes

1. **Reference Manager (`byteplus/reference_manager.js`)**:
   - Guarded `_requireStorageConfigured()` so that when `isKie` is true (`config.provider === 'kie'` or `tosProvider.name === 'kie'`), it checks `isConfigured()` against the Kie file storage provider.
   - Throws `KIE_UPLOAD_NOT_CONFIGURED` if Kie API key or storage is missing, NEVER `BYTEPLUS_TOS_NOT_CONFIGURED`.
   - Imported `config` safely from `./config.js`.

2. **Configuration & Status API (`byteplus/config.js` & `byteplus/routes.js`)**:
   - `providerStatus()` returns:
     - `activeProviderName: 'KIE'`
     - `referenceStorage: 'KIE upload'`
     - `storage.name: 'KIE upload'`
     - `tos: 'not used'`
     - `las: 'not used'`
     - `byteplus: { modelark: 'not used', tos: 'not used', las: 'not used' }`
   - `GET /api/byteplus/status` returns `activeProviderName: 'KIE'`, `referenceStorage: 'KIE upload'`, `tos: 'not used'`, `las: 'not used'` when in KIE mode.
   - `GET /api/byteplus/settings` exposes these status fields without exposing secrets.

3. **Studio UI Settings Card (`public/studio/studio.js`)**:
   - `loadSettings()` displays exact required rows:
     - `Active Provider: KIE`
     - `Reference Storage: KIE upload`
     - `TOS: not used`
     - `LAS: not used`

4. **Regression Testing (`tests/kie.test.js`)**:
   - Added Tier 4 regression test:
     - Deletes all `BYTEPLUS_TOS_*` and `BYTEPLUS_LAS_*` environment variables.
     - Sets `GTF_VIDEO_PROVIDER=kie`.
     - Submits task with image reference to queue.
     - Verifies task completes with `completed` status and `null` error.
     - Confirms image is uploaded via `KieFileStorageProvider` and passed in `reference_image_urls`.
     - Confirms unconfigured storage preflight throws `KIE_UPLOAD_NOT_CONFIGURED` and NEVER `BYTEPLUS_TOS_NOT_CONFIGURED`.

5. **Legacy Preservation**:
   - BytePlus ModelArk, TOS Storage Provider, and LAS Asset Library preserved intact and verified as fallbacks.
   - Higgsfield Classic V1 untouched.

---

### Test Verification
```text
Total Tests:    150
Passed:         150 (100%)
Failed:         0
Execution Time: ~4.5s
Live API Calls: 0
```
- Tier 1: 48/48 PASS
- Tier 2: 34/34 PASS
- Tier 3: 41/41 PASS
- Tier 4: 27/27 PASS

Backup reference: `docs/BACKUPS/2026-09-09/task-kie-only-mode/`
