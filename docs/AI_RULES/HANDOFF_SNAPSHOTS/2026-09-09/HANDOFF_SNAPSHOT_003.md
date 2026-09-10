# HANDOFF SNAPSHOT 003

Date: 2026-09-09
Task: `task-kie-real-balance-usage`

---

## REAL KIE BALANCE, LIVE COST ESTIMATOR & USAGE ACCOUNTING

### User Request (tóm tắt)
> 1. REMOVE the fake/demo 50000-credit balance completely.
>    Current Kie balance must come ONLY from GET https://api.kie.ai/api/v1/chat/credit through backend using KIE_API_KEY.
> 2. Usage page must show REAL Kie balance, not local wallet balance.
> 3. Beside Submit, show a full cost breakdown (8 fields):
>    resolution, output duration, total input video duration, rate, input-video cost, output cost, total credits, USD equivalent.
> 4. Usage table must include (13 fields):
>    Time, Creator, Task Name, Task ID, Model, Resolution, Output Duration, Input Video Duration, Estimated Credits, Actual Credits, Estimated USD, Actual USD, Status.
> 5. Actual usage must come from Kie creditsConsumed. Never fabricate actual usage.
> 6. Run the COMPLETE project regression suite after all fixes (0 live paid calls).

---

### Key Architectural Changes

1. **Backend Real Balance & Pricing (`byteplus/routes.js`, `byteplus/providers/kie_seedance_provider.js`)**:
   - Implemented `GET /api/byteplus/account/credits` proxying `GET https://api.kie.ai/api/v1/chat/credit` with `Authorization: Bearer <KIE_API_KEY>`.
   - Never exposes `KIE_API_KEY` to frontend or logs.
   - Removed all hardcoded 50,000 credit demo balances.
   - Implemented live pricing calculation based on official Kie Seedance 2.5 rates:
     - 480p: 28 cr/s (without video), 17 cr/s (with input video)
     - 720p: 63 cr/s (without video), 38 cr/s (with input video)
     - 1080p: 114 cr/s (without video), 68.5 cr/s (with input video)
     - USD conversion: `credits / 200` ($0.005 / credit).

2. **Live Cost Estimation Card (`public/studio/studio.js`, `public/studio/index.html`)**:
   - Added live 8-field cost breakdown container beside/above task submission.
   - Updates dynamically on input change (model, resolution, output duration, uploaded input videos duration).
   - Breakdown fields: Resolution, Rate (cr/s), Output Duration, Output Cost, Input Video Duration, Input Video Cost, Total Credits, USD Equivalent.

3. **Usage Accounting Manager (`byteplus/usage_manager.js`)**:
   - Persisted atomic ledger in `byteplus_usage.json`.
   - Records all completed/failed tasks with 13 required columns:
     `timestamp`, `creator`, `taskName`, `taskId`, `model`, `resolution`, `outputDuration`, `inputVideoDuration`, `estimatedCredits`, `actualCredits`, `estimatedUsd`, `actualUsd`, `status`.
   - `actualCredits` is strictly obtained from Kie's `recordInfo.creditsConsumed`; strictly `null` if not reported (never fabricated).
   - Rendered in `#usage-tab` table in Studio UI.

4. **Testing & Verification (`tests/kie_pricing.test.js`, `tests/usage_manager.test.js`)**:
   - Added 14 new automated tests covering pricing edge cases and usage persistence.
   - Suite total increased from 150 to 164 tests.

---

### Test Verification
```text
Total Tests:    164
Passed:         164 (100%)
Failed:         0
Live API Calls: 0
```
- Tier 1: 56/56 PASS
- Tier 2: 38/38 PASS
- Tier 3: 43/43 PASS
- Tier 4: 27/27 PASS

Backup reference: `docs/BACKUPS/2026-09-09/task-kie-real-balance-usage/`
