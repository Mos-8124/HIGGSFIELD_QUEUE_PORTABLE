# HANDOFF SNAPSHOT 003

Date: 2026-09-07

Phiên làm việc: 16:15 → 16:35 (+07)

---

## Report 3 — Tích hợp Real BytePlus TOS (Torch Object Storage) Provider

### User Request

> "MASTER TASK — PREPARE REAL BYTEPLUS TOS INTEGRATION
> GTF VIDEO AI STUDIO V2
> SETUP ONLY — USER WILL ENTER CREDENTIALS AND TEST MANUALLY"

### Scope

1. Xây dựng và tích hợp Real `BytePlusTosStorageProvider` cho GTF Video AI Studio V2.
2. Hỗ trợ cấu hình:
   - `BYTEPLUS_TOS_ACCESS_KEY`
   - `BYTEPLUS_TOS_SECRET_KEY`
   - `BYTEPLUS_TOS_BUCKET=gtf-video-reference`
   - `BYTEPLUS_TOS_REGION=ap-southeast-1`
   - `BYTEPLUS_TOS_ENDPOINT=https://tos-ap-southeast-1.bytepluses.com`
   - `BYTEPLUS_TOS_SIGNED_URL_TTL_SECONDS=3600`
3. Hỗ trợ đầy đủ luồng upload private bucket, tạo Signed HTTPS URL theo chuẩn `TOS4-HMAC-SHA256`, cơ chế tái sử dụng object đã có và gia hạn Signed URL khi khởi động lại / retry mà không upload lại.
4. Đảm bảo phân tách năng lực: TOS hỗ trợ lưu trữ cả video lẫn ảnh tham chiếu; kiểm duyệt model Seedance 1.5 Pro vẫn giữ nguyên.
5. Cập nhật Settings API & UI hiển thị trạng thái TOS mà tuyệt đối không lộ Access Key hay Secret Key.
6. Tuyệt đối KHÔNG thực hiện cuộc gọi mạng TOS thật ra ngoài. Mọi kiểm thử đều qua mock transport.
7. Cập nhật tài liệu cấu hình `.env.example`, tài liệu `HANDOFF.md` và tạo snapshot bàn giao.

### Investigation

1. **Chuẩn ký BytePlus TOS:**
   - BytePlus TOS hỗ trợ cơ chế ký `TOS4-HMAC-SHA256` tương đương với chuẩn AWS Signature V4 với service name là `tos`.
   - Chuỗi ký Signed URL: sử dụng query parameters `X-Tos-Algorithm`, `X-Tos-Credential`, `X-Tos-Date`, `X-Tos-Expires`, `X-Tos-SignedHeaders`, `X-Tos-Signature`.
   - Phân cấp khóa ký: `kDate = HMAC(SecretKey, dateStr)` → `kRegion = HMAC(kDate, region)` → `kService = HMAC(kRegion, 'tos')` → `kSigning = HMAC(kService, 'request')`.
2. **Khả năng tương thích Runtime:**
   - Triển khai bằng chuẩn thư viện `crypto` có sẵn của Node.js mà không cần cài thêm package bên ngoài (`@volcengine/tos-sdk` kéo theo 29 packages và postinstall scripts). Giữ mã nguồn 100% portable, nhẹ, độc lập và chạy tốt trên mọi môi trường Node 20/24 / Docker.

### Changes Made

1. **`byteplus/storage/tos_provider.js`:**
   - Xây dựng lớp `BytePlusTosStorageProvider` (đồng thời xuất bí danh `TosStorageProvider` cho tương thích ngược).
   - Hiện thực hóa hàm `upload(localPath, opts)`:
     - Kiểm tra preflight credentials (`BYTEPLUS_TOS_NOT_CONFIGURED`), file tồn tại (`BYTEPLUS_TOS_FILE_NOT_FOUND`).
     - Sinh object key an toàn: `gtf-video-ai/YYYY/MM/DD/<taskId>/<referenceId>-<safeFilename>`.
     - Tải lên bucket bằng presigned PUT URL thông qua fetcher nội bộ hoặc mock transport.
     - Sinh signed GET HTTPS URL có thời hạn (mặc định 3600s) cho ModelArk đọc.
   - Hiện thực hóa hàm `getSignedUrl(objectKey, opts)` / `getPresignedUrl`: sinh HTTPS URL ký bằng `TOS4-HMAC-SHA256`.
   - Hiện thực hóa hàm `refreshSignedUrl(reference, opts)`: gia hạn signed URL cho object đã có mà không cần upload lại.
   - Khóa an toàn: tự động chặn kết nối ra ngoài khi `ALLOW_LIVE_BYTEPLUS_TESTS=false` và không có mock transport (`LIVE_TEST_DISABLED`).
2. **`byteplus/config.js`:**
   - Cập nhật `config.tos` bổ sung `endpoint` và `signedUrlTtlSeconds`.
   - Cập nhật `providerStatus()` hiển thị chi tiết: `bucket`, `bucketConfigured`, `region`, `signedUrl: 'Enabled'`, `active: 'BytePlusTosStorageProvider'`.
3. **`byteplus/reference_manager.js`:**
   - Cập nhật `preflight(task)`: nếu task chứa ảnh/video cục bộ cần upload mà TOS chưa được cấu hình, báo lỗi rõ ràng `BYTEPLUS_TOS_NOT_CONFIGURED` trước khi chiếm slot.
   - Cập nhật `prepare(task)`: nếu tham chiếu đã có `remoteObjectKey` trên TOS từ trước (sau reboot hoặc retry), tự động gia hạn signed URL mới mà không upload lại.
4. **`public/studio/studio.js`:**
   - Cập nhật hiển thị trạng thái TOS: hiển thị Bucket, Vùng, Signed URL mà không để lộ khóa bí mật.
5. **`.env.example`:**
   - Bổ sung hướng dẫn chi tiết và giá trị mặc định cho `BYTEPLUS_TOS_BUCKET`, `BYTEPLUS_TOS_REGION`, `BYTEPLUS_TOS_ENDPOINT`, `BYTEPLUS_TOS_SIGNED_URL_TTL_SECONDS`.
6. **`tests/byteplus.test.js`:**
   - Bổ sung Suite `GTF Video AI Automation V2 (BytePlus Real TOS Provider)` với 13 bài test bao phủ đầy đủ các trường hợp A → P (toàn bộ dùng mock/fake transport).

### Files Changed

- `byteplus/storage/tos_provider.js`
- `byteplus/config.js`
- `byteplus/index.js`
- `byteplus/reference_manager.js`
- `public/studio/studio.js`
- `.env.example`
- `tests/byteplus.test.js`

### Backup / Rollback

- **Backup path:** `docs/BACKUPS/2026-09-07/task-byteplus-tos-provider/`
- **Rollback:** Sao chép các file từ thư mục backup đè ngược lại thư mục dự án gốc.

### Verification

1. **Bộ kiểm thử tự động (103/103 Tests Passed — 100% SUCCESS):**
   ```text
   npm.cmd test
   -> Total Tests: 103
   -> Passed: 103 (0 Failed)
   - Tier 1: 38/38 Passed
   - Tier 2: 26/26 Passed
   - Tier 3: 22/22 Passed
   - Tier 4: 17/17 Passed
   Execution Time: 2.75s
   ```
2. **Kiểm tra API Settings thực tế:**
   ```text
   curl http://127.0.0.1:20140/api/byteplus/settings
   Output:
   {
     "mode": "live",
     "provider": "byteplus",
     "maxConcurrency": 1,
     "generation": {
       "name": "ByteDance Seedance 1.5 Pro",
       "modelId": "seedance-1-5-pro-251215",
       "endpointIdConfigured": true,
       "configured": true,
       "model": "ep-20260907162704-q6gdt",
       "active": "BytePlusGenerationProvider"
     },
     "storage": {
       "name": "BytePlus TOS",
       "configured": false,
       "bucket": "gtf-video-reference",
       "bucketConfigured": true,
       "region": "ap-southeast-1",
       "signedUrl": "Enabled",
       "active": "BytePlusTosStorageProvider"
     }
   }
   ```
3. **Bảo toàn hệ thống Higgsfield V1:**
   - Toàn bộ route `/higgsfield`, `video_generate.js`, `queue_db.json` không bị đụng tới.

### Runtime Evidence

- Server `node server.js` đang chạy ổn định trên cổng `20140`.
- Không có bất kỳ request TOS hoặc ModelArk thật nào được gửi ra ngoài (LIVE CALLS = 0).

### Problems / Failures

- Không có lỗi tồn đọng. Mọi assertion đều kiểm tra đúng logic nghiệp vụ.

### Important Decisions

- Sử dụng cơ chế ký native Node.js crypto cho TOS4-HMAC-SHA256: vừa nhẹ, không tốn dung lượng, không vướng postinstall scripts, vừa dễ mock và kiểm thử cô lập.
- Khi tham chiếu đã có `remoteObjectKey` (ví dụ sau server restart hoặc retry), hệ thống chỉ gia hạn signed URL mới chứ không upload lại, bảo vệ băng thông và tránh lặp object trên TOS.

### Remaining Risks

- Khi người dùng nhập `BYTEPLUS_TOS_ACCESS_KEY` và `BYTEPLUS_TOS_SECRET_KEY` vào file `.env`, cần đảm bảo tài khoản IAM tương ứng có đủ quyền `tos:PutObject` và `tos:GetObject` trên bucket `gtf-video-reference`.

### Next Steps

- Người dùng mở file `.env`, điền Access Key và Secret Key của tài khoản TOS.
- Khởi động lại server để bắt đầu nghiệm thu live test đầu tiên từ UI.
