# HANDOFF SNAPSHOT 004

Date: 2026-09-07

Phiên làm việc: 17:30 → 17:45 (+07)

---

## Report 4 — Tích hợp OpenRouter Seedance 2.5 Provider cho GTF Video AI Studio V2

### User Request

> "MASTER TASK — ADD OPENROUTER SEEDANCE 2.5 PROVIDER
> GTF VIDEO AI STUDIO V2
> OBJECTIVE:
> Switch the active real video generation path from BytePlus ModelArk to OpenRouter Seedance 2.5.
> IMPORTANT:
> Do NOT delete BytePlus integration.
> The final architecture must support: mock, byteplus, openrouter
> The user will manually provide: OPENROUTER_API_KEY
> The user will manually perform the first live generation test."

### Scope

1. Xây dựng và tích hợp Provider mới: `OpenRouterSeedanceProvider` (`bytedance/seedance-2.5`) qua endpoint `POST https://openrouter.ai/api/v1/videos`.
2. Bảo toàn kiến trúc 3 provider:
   - `mock` → `MockSeedanceProvider`
   - `byteplus` → `BytePlusGenerationProvider` (Seedance 1.5 Pro via ModelArk)
   - `openrouter` → `OpenRouterSeedanceProvider` (Seedance 2.5 via OpenRouter)
3. Hỗ trợ cấu hình OpenRouter:
   - `OPENROUTER_API_KEY=`
   - `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
   - `OPENROUTER_VIDEO_MODEL=bytedance/seedance-2.5`
   - `OPENROUTER_MAX_CONCURRENCY=1`
   - `OPENROUTER_POLL_INTERVAL_MS=5000`
   - `OPENROUTER_POLL_TIMEOUT_MS=900000`
4. Bảo toàn tầng lưu trữ tham chiếu:
   - `Reference Storage`: BytePlus TOS (`BytePlusTosStorageProvider`) upload ảnh/video tham chiếu và sinh Signed HTTPS URL.
   - `Generation Layer`: OpenRouter nhận TOS URLs chuyển tiếp qua trường `input_references`.
5. Loại bỏ hoàn toàn phụ thuộc vào LAS (`BYTEPLUS_LAS_ASSET_ENABLED=false`).
6. Bảo mật khóa bí mật: Tuyệt đối không để lộ `OPENROUTER_API_KEY` ra frontend, Settings API, database, logs hay task JSON.
7. Đảm bảo toàn vẹn hàng chờ: Chống sinh trùng bằng `providerTaskId`, khôi phục sau restart (resume chỉ gọi GET), phân tách thử lại download.
8. Kiểm thử tự động: 0 cuộc gọi mạng thật ra ngoài (100% mocked HTTP qua fetchFn). Toàn bộ 120/120 tests vượt qua thành công.

### Investigation & Architecture

1. **Hợp đồng OpenRouter Video API (`POST /api/v1/videos`):**
   - Header: `Authorization: Bearer <KEY>`, `Content-Type: application/json`.
   - Body: `{ model: "bytedance/seedance-2.5", prompt: "...", duration: 4, aspect_ratio: "9:16", resolution: "480p", input_references: [...] }`.
   - Polling endpoint: `GET /api/v1/videos/:id`.
   - Trạng thái: `pending`/`queued` → `in_progress`/`running` → `completed`/`succeeded` (kèm `output_url` / `video_url`) hoặc `failed`.
2. **Khả năng tương thích hợp đồng nội bộ:**
   - `OpenRouterSeedanceProvider` kế thừa chính xác cùng chữ ký phương thức với `BytePlusGenerationProvider`:
     `submit()`, `poll()`, `waitForCompletion()`, `resume()`, `download()`.
   - Queue Manager không cần biết chi tiết bên trong của OpenRouter, cơ chế rolling concurrency và restart recovery hoạt động tự động.

### Changes Made

1. **`byteplus/providers/openrouter_seedance_provider.js` [NEW]:**
   - Triển khai lớp `OpenRouterSeedanceProvider`.
   - Preflight validation: kiểm tra `OPENROUTER_API_KEY_MISSING`, kiểm tra tính khả dụng của ảnh/video TOS (`OPENROUTER_IMAGE_REFERENCE_UNAVAILABLE`, `OPENROUTER_VIDEO_REFERENCE_UNAVAILABLE`).
   - `submit(task)`: gửi request `POST https://openrouter.ai/api/v1/videos`, map task references sang `input_references`.
   - `poll(providerTaskId)`: thăm dò `GET https://openrouter.ai/api/v1/videos/:id`.
   - `waitForCompletion()`: vòng lặp thăm dò có timeout và abort signal.
   - `resume()`: chỉ gọi GET poll, tuyệt đối không submit lại.
   - `download()`: tải file MP4 về thư mục output cục bộ.
   - Khóa an toàn: chặn kết nối ra ngoài trong môi trường test (`LIVE_TEST_DISABLED`).
2. **`byteplus/config.js`:**
   - Nâng cấp `resolveProvider()` hỗ trợ `'openrouter'`.
   - Bổ sung cấu hình `config.openrouter` phản ứng động (reactive getters) với `process.env`.
   - Bổ sung setter cho `maxConcurrency` để tương thích hoàn toàn với các cơ chế sandbox test.
   - Nâng cấp `providerStatus()` bổ sung trạng thái `openrouter` (`name`, `model`, `configured: boolean`, `maxConcurrency`, `active`) mà không để lộ API key.
3. **`byteplus/index.js`:**
   - Import `OpenRouterSeedanceProvider`.
   - Khởi tạo đúng provider dựa trên `config.provider`: `openrouter` → `OpenRouterSeedanceProvider`, `byteplus` → `BytePlusGenerationProvider`, `mock` → `MockSeedanceProvider`.
   - Giữ nguyên `tosProvider = BytePlusTosStorageProvider` khi ở chế độ live.
4. **`byteplus/task_factory.js`:**
   - Cập nhật trường `task.provider` phản ánh đúng provider đang chạy (`mock`, `byteplus`, hoặc `openrouter`).
5. **`public/studio/studio.js`:**
   - Cập nhật `loadSettings()`: hiển thị `Active Provider`, trạng thái cấu hình OpenRouter API, model và concurrency một cách rõ ràng.
6. **`.env.example` & `.env`:**
   - Cập nhật `.env.example` bổ sung khối hướng dẫn cấu hình OpenRouter Seedance 2.5.
   - Bổ sung an toàn 6 biến OpenRouter vào `.env` mà không ghi đè và không in ra các secret hiện có.
7. **`tests/openrouter.test.js` [NEW] & `tests/runner.js`:**
   - Viết trọn bộ 17 bài kiểm tra tự động bao phủ 4 tiers:
     - Tier 1: Provider selection, missing API key, image/video reference validation, request body mapping.
     - Tier 2: Submit POST format, reference payload, multi-reference payload, poll status parsing.
     - Tier 3: Polling loop with progress, resume without POST, MP4 download, HTTP error handling.
     - Tier 4: Queue Manager E2E lifecycle, duplicate submit protection, secret safety, test safety lock.
   - Đăng ký vào `tests/runner.js`.

### Test Results

- **Command**: `node tests/runner.js`
- **Total Tests**: 120 (bao gồm Pipeline cũ, API Server, BytePlus V2 Mock, BytePlus Real ModelArk, BytePlus Real TOS, và OpenRouter mới)
- **Passed**: 120/120 (100%)
- **Failed**: 0
- **Live OpenRouter calls**: 0
- **Live BytePlus calls**: 0
- **Legacy components touched**: 0
