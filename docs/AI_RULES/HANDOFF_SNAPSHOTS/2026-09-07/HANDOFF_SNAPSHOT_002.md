# HANDOFF SNAPSHOT 002

Date: 2026-09-07

Phiên làm việc: 12:30 → 13:55 (+07)

---

## Report 2 — Khắc phục lỗi sinh video ra Mockup và kích hoạt Live Provider

### User Request

> "A vừa test thử một prompt nhưng sao nó tạo video trả có gì giống hết video mockup vậy"
> (kèm theo các yêu cầu quản lý tiến trình daemon server trên cổng 20140)

### Scope

1. Điều tra tại sao người dùng đã nhập API Key vào file `.env` nhưng khi tạo video trên UI Studio V2 (`http://localhost:20140/byteplus`), video đầu ra vẫn là video mẫu 3D mockup.
2. Sửa luồng nạp cấu hình và khởi tạo provider để hệ thống tự động nhận diện chế độ Live từ `.env` mà không cần tham số CLI đặc biệt.
3. Hỗ trợ truyền ảnh cục bộ (Image-to-Video) cho BytePlus ModelArk bằng Base64 Data URL.
4. Đảm bảo toàn bộ 90 bài test tự động không bị phá vỡ và server chạy Live ổn định trên cổng 20140.

### Investigation

1. **Nguyên nhân gốc (Root Cause):**
   - Node.js (v24 / ESM) mặc định không tự động nạp các biến từ file `.env` nếu không dùng flag `--env-file` hoặc thư viện nạp `dotenv`.
   - Tiến trình server trước đó khởi động mà không đọc `.env`, dẫn đến `process.env.GTF_VIDEO_PROVIDER` bị `undefined`, hệ thống rơi về mặc định `mock` (`MockSeedanceProvider`).
   - Task của người dùng trong `byteplus_queue_db.json` ghi nhận `provider: "mock"`, sau 2 giây đã sao chép file fixture có sẵn `byteplus/fixtures/mock_output.mp4` (video khối 3D) trả về client.
2. **Khảo sát đặc thù API BytePlus ModelArk:**
   - Đã kiểm tra trực tiếp Endpoint ModelArk với API Key của người dùng: API Key hợp lệ 100% (`GET /api/v3/contents/generations/tasks/test` trả về HTTP 200 `ResourceNotFound`).
   - Endpoint ID: ModelArk cho phép gửi trực tiếp model ID `seedance-1-5-pro-251215` vào trường `model` trong request body mà không bắt buộc người dùng phải tự tạo Custom Endpoint `ep-xxx`.
   - Xử lý ảnh: ModelArk nhận diện trực tiếp Base64 Data URL định dạng `data:image/png;base64,...` hoặc `data:image/jpeg;base64,...`. Yêu cầu ảnh tối thiểu từ 300x300px trở lên.
3. **Giới hạn model Seedance 1.5 Pro:**
   - Không hỗ trợ video reference (`BYTEPLUS_SEEDANCE_1_5_VIDEO_REFERENCE_UNSUPPORTED`).
   - Không hỗ trợ thư viện KOL/LAS khi tài khoản chưa cấu hình LAS Key (`BYTEPLUS_KOL_LAS_UNSUPPORTED`).

### Changes Made

1. **`byteplus/config.js`:**
   - Bổ sung hàm `loadDotenv()` tự động phân tích và nạp biến môi trường từ file `.env` tại thư mục gốc vào `process.env`.
   - Thêm điều kiện cô lập: tự động bỏ qua việc nạp `.env` nếu đang chạy bộ test (`NODE_ENV === 'test'` hoặc `npm test`) để tránh việc API key môi trường làm ảnh hưởng đến các mock test suite.
   - Cập nhật `providerStatus()` để nhận diện `modelId` làm fallback khi `endpointId` để trống, hiển thị đúng trạng thái `configured: true` trên UI Settings.
2. **`byteplus/providers/byteplus_generation_provider.js`:**
   - Thêm hàm `toBase64DataUrl(filePath)` và `isAccessibleImageUrl(urlStr, localPath)` để tự động chuyển đổi file ảnh upload cục bộ thành Data URL Base64 khi gửi payload lên ModelArk.
   - Thêm fallback cho `endpointId`: nếu người dùng không truyền `endpointId`, hệ thống tự động dùng `config.generation.endpointId || this.modelId` (`seedance-1-5-pro-251215`).
   - Giữ nguyên ràng buộc kiểm tra: nếu `endpointId: ''` được truyền tường minh vào constructor thì `isConfigured()` trả về `false` và `validatePreflight` quăng lỗi `BYTEPLUS_ENDPOINT_ID_MISSING` theo đúng hợp đồng của unit test.
   - Sửa logic kiểm tra cờ an toàn `_getFetch`: tôn trọng giá trị `allowLiveTests: false` khi được truyền tường minh.

### Files Changed

- `byteplus/config.js`
- `byteplus/providers/byteplus_generation_provider.js`

### Backup / Rollback

- **Backup path:** `docs/BACKUPS/2026-09-07/task-byteplus-live-fix/`
- **Cơ chế rollback:** Sao chép các file từ thư mục backup trên đè ngược lại thư mục dự án gốc.

### Verification

1. **Kiểm thử tự động:**
   ```text
   npm.cmd test
   -> 90/90 Tests Passed (100% SUCCESS)
   - Tier 1: 35/35 Passed
   - Tier 2: 23/23 Passed
   - Tier 3: 18/18 Passed
   - Tier 4: 14/14 Passed
   Execution Time: 2.71s
   ```
2. **Kiểm tra API cấu hình Settings:**
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
       "endpointId": "(mặc định: seedance-1-5-pro-251215)",
       "configured": true,
       "model": "seedance-1-5-pro-251215",
       "active": "BytePlusGenerationProvider"
     }
   }
   ```
3. **Bảo toàn hệ thống Higgsfield V1:**
   - Toàn bộ route `/higgsfield`, pipeline `video_generate.js`, database `queue_db.json` không bị đụng chạm.

### Runtime Evidence

- Server đang chạy tiến trình `node server.js` ổn định trên cổng 20140.
- Cổng `20129` và `20130` không bị chiếm dụng hay ảnh hưởng.
- Không có bất kỳ lệnh gọi sinh video tốn phí nào được Agent tự ý kích hoạt mà không có sự đồng ý của người dùng.

### Problems / Failures

- Ban đầu khi nạp `.env` vô điều kiện, một số mock test trong `tests/byteplus.test.js` bị ảnh hưởng do biến `BYTEPLUS_MODELARK_API_KEY` có thật trong môi trường. Đã xử lý triệt để bằng cách cô lập môi trường test (`loadDotenv` bỏ qua khi chạy test).

### Important Decisions

- Cho phép dùng trực tiếp model ID `seedance-1-5-pro-251215` của BytePlus ModelArk làm giá trị mặc định cho `endpointId`, giúp người dùng không cần phải tạo Endpoint ID thủ công trên console BytePlus mà vẫn chạy được.
- Chuyển ảnh cục bộ thành Base64 Data URL thay vì bắt buộc người dùng cấu hình tài khoản BytePlus TOS, giảm thiểu chi phí và độ phức tạp cho người dùng.

### Remaining Risks

- Model Seedance 1.5 Pro của ModelArk chưa hỗ trợ tham chiếu video và chưa hỗ trợ LAS KOL Library cho tài khoản hiện tại. Nếu người dùng chọn KOL hoặc đính kèm video, task sẽ bị từ chối ở bước preflight.
- Ảnh upload làm tham chiếu bắt buộc phải đạt độ phân giải tối thiểu 300x300px theo quy định của ModelArk.

### Next Steps

- Hướng dẫn người dùng tạo video test trực tiếp trên UI Studio (`http://localhost:20140/byteplus`) bằng prompt Text-to-Video hoặc Text + Image (không chọn KOL).
