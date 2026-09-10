# HANDOFF — HIGGSFIELD QUEUE PORTABLE

> Tài liệu trạng thái dự án dành cho AI Agent, theo `CRAWLER_POD_AGENT_RULES.md` §34.
> Đây không phải log dump. Chỉ giữ thông tin để agent sau tiếp tục đúng trạng thái.

---

# 0. PROJECT CONFIGURATION

```text
PROJECT_ROOT         = D:\Tinh\Work\HIGGSFIELD_QUEUE_PORTABLE
RULES_ROOT           = D:\Tinh\Work\HIGGSFIELD_QUEUE_PORTABLE\docs\AI_RULES
BACKUP_ROOT          = D:\Tinh\Work\HIGGSFIELD_QUEUE_PORTABLE\docs\BACKUPS
RUNTIME_URL          = http://localhost:20140
CANONICAL_HANDOFF    = D:\Tinh\Work\HIGGSFIELD_QUEUE_PORTABLE\docs\AI_RULES\HANDOFF.md
PRIMARY_TEST_COMMAND = npm test
START_COMMAND        = npm start
```

**Chính sách rollback:** backup filesystem vào `BACKUP_ROOT/YYYY-MM-DD/<task-id>/`, giữ
relative path. Git là cơ chế phụ, không thay thế backup.

**Cổng:** dự án đọc biến `HQ_PORT`, mặc định `20140`. **Không** đọc biến `PORT`
chung — trên máy hiện tại `PORT=20129` được đặt ở cấp User cho một tool khác và
sẽ chiếm mất cổng của dashboard nếu server đọc nó.

---

# 1. PROJECT OBJECTIVE

Dashboard hàng chờ nội bộ (LAN) để một team media sản xuất video AI hàng loạt.
Người dùng nhập prompt + ảnh/video tham chiếu, hệ thống xếp hàng và tự sinh video,
rồi tải MP4 về thư mục chia sẻ.

Hiện có **hai hệ thống độc lập** chạy chung một server, chung một cổng:

```text
                    http://localhost:20140
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
        /higgsfield               /deeplove (alias /byteplus)
   HIGGSFIELD CLASSIC (V1)         GTF VIDEO AI STUDIO (V2)
   production, đang dùng           active Kie luồng mới
```

`/` là gateway cho người dùng chọn hệ thống.

---

# 2. CURRENT ARCHITECTURE

## 2.1 Entry point

`server.js` (Express + Socket.IO). Đây là **shared component** duy nhất mà cả hai
hệ thống cùng chạm. Thứ tự middleware quan trọng:

```text
cors → express.json → express.urlencoded
    → /api/byteplus router (V2)
    → gateway routes  /  /higgsfield  /deeplove  /Deeplove  /byteplus
    → express.static(public, { index:false })   ← index:false là bắt buộc
    → multipart middleware của V1
    → toàn bộ route của V1
```

`index:false` giữ cho `express.static` không chiếm mất `/` bằng `public/index.html`.

## 2.2 V1 — Higgsfield Classic (LEGACY, PROTECTED)

| Thành phần | File | Cách chạy |
|---|---|---|
| Pipeline CDP | `video_generate.js` (1.882 dòng) | Puppeteer nối Chrome cổng 9333, bấm 11 bước trên UI higgsfield.ai |
| Chế độ credit | `cli_generate.js` | spawn `higgsfield` CLI, tối đa 20 job song song |
| Vòng lặp queue | `server.js` `processQueueLoop()` | tuần tự, 1 task/lần |
| DB | `queue_db.json` | 468 task |
| UI | `public/index.html`, `app.js`, `styles.css` | dark theme |
| Socket | namespace mặc định `/` | |

**Không refactor V1.** Xem §8 của rule (legacy/stable flow protection).

## 2.3 V2 — GTF Video AI Studio (MOCK)

```text
byteplus/
├── index.js               lắp ráp + Socket.IO namespace /byteplus
├── config.js              §0 config, providerStatus() không lộ secret
├── store.js               JsonStore ghi nguyên tử, safeSegment/safeJoin
├── queue_manager.js       rolling concurrency, recovery
├── task_factory.js        schema task + validation
├── reference_manager.js   chuẩn hoá tham chiếu, bí danh @Image/@Video
├── kol_library.js         CRUD KOL
├── routes.js              /api/byteplus/*
├── multipart.js           parser upload riêng
├── providers/  storage/  assets/    mock + stub provider thật
└── fixtures/mock_output.mp4          4s 480x854 H.264+AAC, 40KB
```

UI: `public/gateway.html`, `public/studio/{index.html,studio.css,studio.js}`

---

# 3. RUNTIME / ENVIRONMENT

```text
Node             v24.18.0  (fetch/FormData/Blob/AbortController có sẵn ở global)
npm              11.16.0
OS               Windows 11
Runtime URL      http://localhost:20140
Chrome CDP       http://127.0.0.1:9333   (chỉ V1 cần; mở bằng start-cdp.bat)
Higgsfield CLI   CHƯA CÀI trên máy này   (chỉ ảnh hưởng chế độ credit của V1)
```

**Cảnh báo môi trường:** biến `PORT=20129` tồn tại ở cấp User Windows, thuộc về
một tool khác của người dùng. Dự án cố tình **không** đọc biến này. Nếu thấy
dashboard bind nhầm 20129 thì đó là tiến trình cũ chạy code trước 2026-09-07.

Hai cảnh báo dưới đây là **bình thường** trên máy chưa cài Chrome CDP và CLI,
không phải lỗi ứng dụng:

```text
📡 Connected to Chrome CDP ...      ← in lạc quan lúc boot, huy hiệu UI mới là thật
⚠️ Higgsfield CLI không sẵn sàng     ← chỉ tắt chế độ credit của V1
```

---

# 4. CURRENT FUNCTIONAL STATUS

| Hệ thống | Trạng thái |
|---|---|
| V1 Higgsfield CDP | Đang dùng production. Không thay đổi trong các phiên gần đây. |
| V1 CLI credit mode | Không chạy được trên máy này (thiếu CLI). |
| V2 Mock E2E | **COMPLETED** — RUNTIME CONFIRMED |
| V2 Kie.ai (Seedance 2.5) | **IMPLEMENTED — LUỒNG ACTIVE MỚI** — KieSeedanceProvider + KieFileStorageProvider + LocalKolAssetProvider + Live Pricing & Usage Ledger. Chờ user điền `KIE_API_KEY` và đặt `GTF_VIDEO_PROVIDER=kie` rồi restart |
| V2 OpenRouter (Seedance 2.5) | **INACTIVE FALLBACK** — code giữ nguyên, không nằm trong luồng active |
| V2 BytePlus ModelArk (Seedance 1.5 Pro) | **INACTIVE FALLBACK** — code giữ nguyên, không nằm trong luồng active |
| V2 BytePlus TOS | **NOT USED khi provider=kie** — không được khởi tạo; chỉ dùng khi quay lại provider byteplus/openrouter |
| V2 LAS | **NOT USED** — KOL dùng file gốc cục bộ qua LocalKolAssetProvider, không cần LAS |

---

# 5. CURRENT DATA / PERSISTENCE STATUS

| File | Nội dung | Ghi chú |
|---|---|---|
| `queue_db.json` | 468 task V1 (453 completed / 4 failed / 11 pending) | **4,3 MB**, git-tracked, KHÔNG được migrate |
| `byteplus_queue_db.json` | task V2 | gitignored, ghi nguyên tử |
| `byteplus_usage.json` | bản ghi usage accounting 13 trường | gitignored, ghi nguyên tử |
| `byteplus_kol_library.json` | thư viện KOL | gitignored |
| `byteplus_mock_jobs.json` | registry job mock, cần cho resume sau restart | gitignored |
| `byteplus_outputs/` | `{creator}/{taskName}/{taskId}.mp4` | gitignored |
| `byteplus_uploads/` | file tham chiếu V2 | gitignored, tách khỏi `uploads/` của V1 |

Hai hệ thống **không dùng chung state nào**.

---

# 6. IMPORTANT ARCHITECTURE DECISIONS

1. **V2 là hệ thống song song, không phải bản thay thế V1.** Lý do bắt buộc:
   BytePlus **chặn ảnh/video tham chiếu chứa mặt người thật**. Workload thật của
   team hiện là UGC người thật, nên V2 không phủ được nghiệp vụ của V1.
   Lối thoát chính thức của BytePlus: digital character library, trusted model
   outputs (30 ngày), hoặc kho ảnh người thật đã cấp quyền.

2. **Cổng đọc từ `HQ_PORT`, không đọc `PORT`.** Tên `PORT` quá chung, bị tool khác
   trên cùng máy chiếm. Đây là thay đổi shared component có chủ đích (§7).

3. **Video tham chiếu phải là URL công khai.** API BytePlus nhận base64 cho ảnh
   nhưng `content.video_url.url` chỉ nhận URL hoặc `asset://`. Kiến trúc đã sẵn
   các trường `storageProvider / remoteObjectKey / remoteUrl / expiresAt` để
   transport thật cắm vào mà không đổi schema.

4. **Bí danh tham chiếu tính lại từ thứ tự hiển thị**, id tham chiếu bất biến.
   Kéo thả đổi chỗ không phá liên kết bên dưới.

5. **Đổi tên KOL chỉ đổi metadata hiển thị.** `assetId` không đổi, task lịch sử
   giữ bản sao tên tại thời điểm chạy nên không bị hỏng khi KOL bị đổi tên/xoá.

6. **Giao diện GTF Studio dùng theme dark CỐ ĐỊNH.** Không đọc `prefers-color-scheme`
   và không có công tắc sáng/tối: nhân viên dùng nhiều máy, giao diện phải giống
   nhau ở mọi nơi. Dùng system font stack, không phụ thuộc Google Fonts. Một accent
   duy nhất (#7567ef); xanh/đỏ/amber chỉ dùng theo nghĩa xong / lỗi / mock.

---

# 7. EXTERNAL PROVIDER DECISIONS

```text
GTF_VIDEO_PROVIDER = mock | kie | byteplus | openrouter (mặc định 'mock'; luồng active là 'kie')
BYTEPLUS_MODE      = mock | live     (tương thích ngược)

Seedance 2.5 (Kie.ai)       KieSeedanceProvider    +  KieFileStorageProvider      (REAL IMPLEMENTED — ACTIVE PATH)
KOL không cần LAS           LocalKolAssetProvider  —  file gốc cục bộ là nguồn sự thật
Seedance 2.5 (OpenRouter)   MockSeedanceProvider   ⇄  OpenRouterSeedanceProvider  (INACTIVE FALLBACK)
Seedance 1.5 Pro (ModelArk) MockSeedanceProvider   ⇄  BytePlusGenerationProvider  (INACTIVE FALLBACK)
TOS storage                 MockTosProvider        ⇄  BytePlusTosStorageProvider  (NOT USED khi provider=kie)
LAS asset library           MockLasAssetProvider   ⇄  LasAssetLibraryProvider     (NOT USED)
```

Thông số API Kie.ai (SOURCE CONFIRMED từ docs.kie.ai, 2026-09-09):

```text
POST  https://api.kie.ai/api/v1/jobs/createTask          body: { model: "bytedance/seedance-2-5", input: {...} }
GET   https://api.kie.ai/api/v1/jobs/recordInfo?taskId=  state: waiting|queuing|generating|success|fail
GET   https://api.kie.ai/api/v1/chat/credit              số dư credit (backend-only)
POST  https://kieai.redpandaai.co/api/file-stream-upload multipart: file, uploadPath, fileName
input: prompt, reference_image_urls[≤30], reference_video_urls[≤10], reference_audio_urls,
       duration 4-30, resolution 480p|720p|1080p, aspect_ratio, generate_audio, output_format
result: data.resultJson (CHUỖI JSON) -> {"resultUrls":["https://...mp4"]}
File upload là TẠM THỜI (TTL ~24h) — hệ thống lưu expiresAt, hết hạn tự upload lại từ file gốc.
Lỗi HTTP: 401 KIE_AUTH_FAILED · 402 KIE_INSUFFICIENT_CREDITS · 422 KIE_INVALID_REQUEST · 451 KIE_CONTENT_REJECTED
```

`OpenRouterSeedanceProvider` đã hoàn tất triển khai cho model **ByteDance Seedance 2.5** (`bytedance/seedance-2.5`).
`BytePlusGenerationProvider` đã hoàn tất triển khai cho model **ByteDance Seedance 1.5 Pro** (`seedance-1-5-pro-251215`).
Đã kiểm thử tự động 14 test case mock HTTP (100% không tốn credit, không gọi mạng).

Thông số API ModelArk Seedance 1.5 Pro (SOURCE CONFIRMED):

```text
POST  https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks
GET   https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/{id}
Body: { "model": "<ENDPOINT_ID>", "content": [{ "type": "text", "text": "prompt --duration 4 --camerafixed false" }, { "type": "image_url", "image_url": { "url": "https://..." } }] }
model seedance-1-5-pro-251215 (gửi Endpoint ID ep-xxx)
durations: [4, 30] mặc định 4s, camerafixed: true/false (mặc định false)
```

**Các chốt bảo vệ an toàn (Safety Guards):**
1. Preflight chặn ngay trước khi gửi request nếu thiếu API Key (`BYTEPLUS_API_KEY_MISSING`) hoặc Endpoint ID (`BYTEPLUS_ENDPOINT_ID_MISSING`).
2. Seedance 1.5 Pro không hỗ trợ video tham chiếu: chặn ngay với `BYTEPLUS_SEEDANCE_1_5_VIDEO_REFERENCE_UNSUPPORTED`.
3. Ảnh tham chiếu bắt buộc là HTTPS URL công khai (chặn localhost, 127.0.0.1, LAN IP) với `BYTEPLUS_IMAGE_REQUIRES_ACCESSIBLE_URL`.
4. Khóa an toàn `ALLOW_LIVE_BYTEPLUS_TESTS=false`: chặn mọi request ra mạng thật trong quá trình kiểm thử tự động.
5. Chống sinh trùng (Duplicate Generation Protection): nếu task đã có `providerTaskId`, hệ thống chỉ gọi GET query/poll, tuyệt đối không gửi lại POST. Nếu sinh video xong mà download thất bại, task giữ nguyên `providerTaskId` và `outputUrl`, khi retry chỉ tải lại file mà không trừ tiền.

---

# 8. QUEUE / WORKER / CONCURRENCY DECISIONS

| | V1 Higgsfield | V2 GTF Studio |
|---|---|---|
| Điều phối | `processQueueLoop()` | `ByteplusQueueManager.dispatch()` |
| Song song | 1 (CDP) / 20 (CLI) | **10**, cấu hình qua `BYTEPLUS_MAX_CONCURRENCY` |
| Kiểu nạp | tuần tự | **cuốn chiếu** — slot trống nạp ngay |
| Chống vượt trần | — | chiếm slot **đồng bộ**, không có `await` giữa lúc kiểm tra và lúc đánh dấu running |

Ngữ nghĩa điều khiển V2 (§42):

```text
PAUSE   ngừng nạp task mới, job đang chạy VẪN hoàn tất
RESUME  lấp đầy slot trống ngay
STOP    ngừng nạp + huỷ job đang chạy, trả chúng về pending
RETRY   xoá lỗi, providerTaskId về null, đưa lại vào hàng chờ
```

**Chống submit trùng sau restart (§17)** — quan trọng nhất khi chuyển sang provider tính tiền:

```text
providerTaskId == null   →  an toàn trả về pending, chạy lại từ đầu
providerTaskId != null   →  KHÔNG BAO GIỜ submit lại, chỉ resume job cũ
```

`submitCount` trên task là bằng chứng kiểm chứng được. Mock provider tính tiến độ
từ mốc thời gian thật lưu trong registry nên job sống sót qua restart.

---

# 9. KNOWN ISSUES

1. **`queue_db.json` 4,3 MB ghi lại toàn bộ mỗi nhịp tiến độ** (`saveDB()` trong `broadcastState()`). Sẽ nặng dần. Thuộc V1, giữ nguyên.
2. **`HUONG_DAN_CAI_DAT_VA_SU_DUNG_MAY_MOI.docx`** vẫn ghi cổng cũ (file nhị phân).
3. **Higgsfield CLI chưa cài** trên máy hiện tại (chỉ ảnh hưởng chế độ credit của V1).
4. **`docker-compose.yml`** còn hardcode đường dẫn Windows của máy cũ.
5. **UI Settings & History chuyên biệt**: Lịch sử hiện đã tích hợp trực tiếp trong Bảng Hàng Chờ và tab Quản Lý Tín Dụng; màn hình Settings nâng cao có thể bổ sung nếu người dùng yêu cầu chỉnh sửa thông số API trực tiếp trên UI.

*(Các lỗi nghiêm trọng trước đây như: duration 422 NaN, nút sync-videos 404, mất nút Tải/Xem video, thiếu mục KOL trên UI, thiếu realtime progress % đều đã được giải quyết triệt để trong `task-deeplove-kol-fixes`).*

---

# 10. LATEST MEANINGFUL CHANGES

## 2026-09-09 — `task-deeplove-fullscreen-concurrency` (MỚI NHẤT)

1. **Xử lý 8 lỗi tồn đọng hệ thống Deeplove V2**:
   - Khắc phục lỗi câm nín (silent failure) khi task fail (hiển thị thẻ lỗi đỏ `task-err-detail` chứa `task.error.message`).
   - Chuẩn hóa tên trường `task.pipelineStage` thay vì `task.currentStep`.
   - Bổ sung fallback cho `/tasks/bulk` qua `queue.bulkAdd()`.
   - Đọc động `currentTaskId` từ active tasks của queue thay vì gán cứng.
   - Hỗ trợ HTTP 206 Partial Content Streaming cho route video playback.
   - Dọn dẹp rò rỉ file tạm upload multipart khi request abort.
   - Phát log realtime qua Socket.io namespace `/byteplus`.
   - Cải tiến trực quan thẻ chi tiết lỗi và nút Retry.
2. **Nút Tiếp Tục hàng chờ (`▶️ Tiếp Tục` / Resume)**:
   - Thêm nút toggle resume hai chiều trên thẻ Bảng Điều Khiển Queue (`#btn-pause`). Khi tạm dừng, nút chuyển sang màu xanh dương `▶️ Tiếp Tục`.
3. **Dọn dẹp task test & reset dữ liệu tiêu hao**:
   - Dọn sạch 7 task test và reset `byteplus_usage.json` về trạng thái sạch sẽ.
4. **Sửa lỗi tràn ngang (overflow-x) & đưa về Full Màn Hình 100%**:
   - Khắc phục lỗi CSS Grid min-content contribution khiến `.main-layout` bị nở rộng tới 2090px-2246px.
   - Bổ sung `minmax(0, 1fr)` cho grid, `min-width: 0` cho các panel và card.
   - Đổi `.app-container` sang `width: 100%; max-width: 100%` dàn đều toàn bộ màn hình.
   - Mở rộng màn hình Terminal Logs ra toàn bộ chiều ngang card (`.monitor-grid` 1fr).
   - Tự động căn chỉnh 7 thẻ thống kê trên thanh Stats Bar.
   - Xác nhận 100% không còn thanh cuộn ngang trình duyệt trên mọi độ phân giải (1080p, 1600x900, 1440x900, 1366x768, 1280x800).
5. **Nâng Concurrency KIE AI lên 10 video cùng lúc**:
   - Cấu hình `KIE_MAX_CONCURRENCY=10` trong `.env` và `.env.example`.
   - Khởi động lại daemon server. Hệ thống tự động bốc tối đa 10 video gửi sang KIE xử lý song song.
6. **Kiểm thử & Backup**:
   - 164/164 tests PASS (0 live paid calls).
   - Backup: `docs/BACKUPS/2026-09-09/task-deeplove-fullscreen-concurrency/`.
   - Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-09/HANDOFF_SNAPSHOT_008.md`.

## 2026-09-09 — `task-deeplove-kol-fixes`

1. **Route Mapping Deeplove**:
   - Thêm mapping `app.get(['/deeplove', '/Deeplove', '/byteplus'], ...)` trong `server.js` phục vụ UI GTF Studio.
   - Cập nhật `public/gateway.html` trỏ tới `/deeplove` và làm sạch text BytePlus.
   - Giữ nguyên `/byteplus` làm bí danh fallback tương thích ngược.
2. **Sửa dứt điểm lỗi 🔴 Hỏng Thật (Duration 422 & Nút 404)**:
   - Sửa toàn bộ value của dropdown duration (`#duration`, `#bulk-duration`) thành số nguyên `4`–`30`, mặc định 16s.
   - Bổ sung phòng thủ trong `byteplus/task_factory.js`: tự động cắt đuôi `s` (`replace(/s$/i, '')`) chống triệt để `NaN`.
   - Gỡ bỏ hoàn toàn nút chết `#btn-sync-videos` (gọi route 404).
   - Dọn sạch payload V1 thừa (`unlimited`, `creditMode`, `cliModel`, `model`) và các request thăm dò `/api/cli/models`, `/api/cdp/status`.
3. **Tích hợp Nhân Vật KOL Ảo trên UI**:
   - Thêm khối "👤 Nhân Vật KOL Ảo" vào giữa mục Ảnh tham chiếu và Video tham chiếu (3 mục: Ảnh, KOL, Video).
   - Dropdown chọn KOL từ `byteplus_kol_library.json`, kèm nút "+ Tạo KOL Mới..." mở modal tạo nhanh.
   - Preview card hiển thị thumbnail, tên và prompt mô tả của KOL đang chọn.
   - Backend `byteplus/routes.js` nhận `kolId` và đính kèm tham chiếu KOL an toàn vào task.
4. **Khôi phục nút `▶️ Xem` và `⬇️ Tải` video**:
   - Cập nhật bộ render media trong `public/studio/studio.js`: đọc `task.outputWebPath || task.videoUrl || task.outputUrl`.
   - Gán `task.videoUrl = task.outputWebPath` trong `queue_manager.js` khi task completed.
   - Mọi video hoàn thành lập tức hiển thị đủ 2 nút `▶️ Xem` (mở modal phát video) và `⬇️ Tải` (tải file MP4).
5. **Tiến độ % Realtime**:
   - Lắng nghe sự kiện Socket.io `byteplus:task-updated` cập nhật trực tiếp tiến độ % và trạng thái từng hàng trong bảng.
   - Gỡ bỏ 4 listener V1 không còn hoạt động (`task_progress`, `live_preview`, `log`, `cdp_status`).
6. **Kiểm thử & Backup**:
   - 164/164 tests PASS (0 live paid calls). Headless Chrome verify 200 OK không lỗi console.
   - Backup: `docs/BACKUPS/2026-09-09/task-deeplove-kol-fixes/`.
   - Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-09/HANDOFF_SNAPSHOT_006.md`.

## 2026-09-09 — `task-usage-tab-fix-480p` & Audit Hệ Mới

1. **Fix UI tab Quản lý Tín dụng & 480p**:
   - Khắc phục lỗi inline style `display:none` đè lên CSS class `.tab-content.active` khiến UI bị trắng màn hình khi chuyển tab.
   - Bổ sung option `480p` vào dropdown resolution ở cả 2 form (Task Đơn Lẻ & Import Hàng Loạt), bảng giá tự tính đúng 28 cr/s.
2. **Audit Tàn Dư BytePlus**:
   - Phân loại tàn dư: Route/URL (`/byteplus`, `/api/byteplus/*`), Tên code (`byteplus/`, `ByteplusQueueManager`), File data (`byteplus_*.json`).
   - Xác nhận file `.env` đã được người dùng dọn sạch 100% biến `BYTEPLUS_*`.
3. **Audit Chức Năng Hệ Mới (Phát hiện lỗi & nợ kỹ thuật)**:
   - Phát hiện **Critical Blocker**: Form submit gửi chuỗi `"4s"` / `"5s"` / `""` khiến backend `Number("4s") = NaN` trả lỗi 422 cho mọi lượt submit từ UI.
   - Phát hiện route 404 cho nút "Đồng bộ video", thiếu listener realtime `byteplus:task-updated`, và các thành phần backend mồ côi (KOL Library, Settings, History).
4. Backup: `docs/BACKUPS/2026-09-09/task-usage-tab-fix-480p/`.
   Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-09/HANDOFF_SNAPSHOT_005.md`.

## 2026-09-09 — `task-studio-ui-cleanup-and-branding` (MỚI NHẤT)

Dọn dẹp các thành phần không tương thích của hệ thống cũ và chuẩn hóa branding trên giao diện GTF Studio (`public/studio/`):

1. **Sửa lỗi load Assets**: Chuyển đường dẫn tương đối (`href="studio.css"`, `src="studio.js"`) sang tuyệt đối (`/studio/studio.css`, `/studio/studio.js`) để tương thích với route `/byteplus`.
2. **Dọn dẹp 7 thành phần UI dư thừa**:
   - Bỏ stream player CDP Chrome (`.preview-box`), chuyển layout monitor sang 1fr để log terminal mở rộng 100%.
   - Bỏ tab log CLI Cloud (`#tab-log-cli`) và container log CLI (`#cli-logs-container`).
   - Ẩn button đồng bộ link video (`#btn-sync-videos`).
   - Bỏ hàng toggle Unlimited Mode (`#unlimited-row`).
   - Bỏ khối cấu hình credit CLI ở single form (`#single-form/div[8]`) và bulk tab (`#bulk-tab/div[4]`).
   - Bỏ option `Higgsfield Standard` khỏi dropdown `#model` và `#bulk-model`, chỉ giữ `Seedance 2.5`.
3. **Đổi tên Logo & Ẩn CDP Status**:
   - Đổi tiêu đề logo `<h1>` và thẻ `<title>` thành **GTF Video AI Studio**.
   - Ẩn huy hiệu kiểm tra CDP host (`#cdp-status`) bằng inline style để không ảnh hưởng Socket/DOM cache.
4. **Bảo vệ hệ thống cũ**: 100% file hệ thống cũ (`public/index.html`, `public/styles.css`, `public/app.js`) được giữ nguyên vẹn.
5. Backup: `docs/BACKUPS/2026-09-09/task-studio-ui-cleanup-and-branding/`.
   Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-09/HANDOFF_SNAPSHOT_004.md`.

## 2026-09-09 — `task-kie-real-balance-usage`

Xóa bỏ hoàn toàn số dư demo 50.000 credits giả; tích hợp số dư Kie thật, bảng tính chi phí trực tiếp và sổ cái Usage Accounting:

1. **Số dư Kie thật**: Đọc trực tiếp từ `GET https://api.kie.ai/api/v1/chat/credit` thông qua backend proxy (`GET /api/byteplus/account/credits`) với `KIE_API_KEY`. Không để lộ API key ra frontend.
2. **Live Cost Estimator (8 trường)**: Hiển thị thẻ ước tính chi phí trực tiếp cạnh nút Submit, tính toán theo công thức chuẩn của Kie Seedance 2.5 (480p: 28 cr/s hoặc 17 cr/s khi có video; 720p: 63 cr/s hoặc 38 cr/s; 1080p: 114 cr/s hoặc 68.5 cr/s; quy đổi USD: $0.005/credit).
3. **Usage Accounting (13 trường)**: Module `byteplus/usage_manager.js` ghi nhận lịch sử tiêu hao vào `byteplus_usage.json` với 13 trường dữ liệu. `actualCredits` lấy nghiêm ngặt từ `creditsConsumed` do Kie trả về (tuyệt đối không bịa số liệu).
4. **Kiểm thử**: Bổ sung `tests/kie_pricing.test.js` (8 tests) và `tests/usage_manager.test.js` (6 tests). Toàn bộ 164/164 tests PASS, 0 live paid call.
5. Backup: `docs/BACKUPS/2026-09-09/task-kie-real-balance-usage/`.
   Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-09/HANDOFF_SNAPSHOT_003.md`.

## 2026-09-09 — `task-kie-seedance-provider`

Chuyển luồng active của GTF V2 từ BytePlus/OpenRouter sang **Kie.ai Seedance 2.5**.
Người dùng chỉ cần điền `KIE_API_KEY` + đặt `GTF_VIDEO_PROVIDER=kie` rồi restart.

1. **File mới**: `byteplus/providers/kie_seedance_provider.js` (createTask/recordInfo/credit),
   `byteplus/providers/kie_file_provider.js` (Kie File Upload — URL tạm, expiry-aware),
   `byteplus/assets/local_kol_asset_provider.js` (KOL từ file gốc cục bộ, không LAS),
   `tests/kie.test.js` (29 tests mock HTTP, 0 live call).
2. **Sửa**: `config.js` (provider 'kie', khối config.kie, providerStatus có kie + byteplus "Not used"),
   `index.js` (chế độ kie KHÔNG khởi tạo ModelArk/TOS/LAS), `reference_manager.js`
   (lỗi storage theo provider, tái dùng URL tạm theo hạn, upload nguồn KOL cục bộ),
   `queue_manager.js` (truyền kolLibrary, lưu billing thật từ provider),
   `public/studio/studio.js` (Settings hiển thị Kie / TOS Not used / LAS Not used),
   `.env.example` + `.env` (append KIE_*, không ghi đè giá trị cũ).
3. **An toàn credit giữ nguyên**: providerTaskId chỉ poll không re-submit, retry download
   không sinh lại video, KIE_CONTENT_REJECTED không auto-retry, test env chặn cứng mạng thật.
4. **Kiểm thử**: 149/149 PASS (120 cũ + 29 Kie). Smoke boot cổng 20199 với duy nhất
   KIE_API_KEY (không có bất kỳ biến BytePlus nào): Settings trả provider=kie, byteplus all "Not used".
5. Backup: `docs/BACKUPS/2026-09-09/task-kie-seedance-provider/`.
   Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-09/HANDOFF_SNAPSHOT_001.md`.

> Tóm tắt. Lịch sử chi tiết từng phiên (User Request, Investigation, Problems,
> Decisions, Runtime Evidence) nằm ở `HANDOFF_SNAPSHOTS/`:
>
> | Ngày | Snapshot | Nội dung |
> |---|---|---|
> | 2026-09-06 | `2026-09-06/HANDOFF_SNAPSHOT_001.md` | Audit toàn dự án + nghiên cứu API BytePlus · Khởi động thử V1 · `task-gtf-v2-mock` |
> | 2026-09-07 | `2026-09-07/HANDOFF_SNAPSHOT_001.md` | Tiếp nhận bộ rule · `task-port-20130` · `task-handoff-init` · `task-studio-redesign` |
> | 2026-09-09 | `2026-09-09/HANDOFF_SNAPSHOT_001.md` | `task-kie-only-mode`: Chuyển sang Kie-only mode, Seedance 2.5 |
> | 2026-09-09 | `2026-09-09/HANDOFF_SNAPSHOT_002.md` | `task-retry-paid-protection`: Chống tính phí trùng khi retry |
> | 2026-09-09 | `2026-09-09/HANDOFF_SNAPSHOT_003.md` | `task-kie-real-balance-usage`: Lấy số dư Kie trực tiếp từ API |
> | 2026-09-09 | `2026-09-09/HANDOFF_SNAPSHOT_004.md` | `task-studio-ui-cleanup-and-branding`: Dọn UI cũ, chuẩn hóa Studio |
> | 2026-09-09 | `2026-09-09/HANDOFF_SNAPSHOT_005.md` | `task-usage-tab-fix-480p`: Fix tab Quản lý Tín dụng & thêm 480p |
> | 2026-09-09 | `2026-09-09/HANDOFF_SNAPSHOT_006.md` | `task-deeplove-kol-fixes`: Fix duration NaN, tích hợp KOL, xem/tải MP4 |
> | 2026-09-09 | `2026-09-09/HANDOFF_SNAPSHOT_007.md` | `task-usage-credit-per-task`: Hiển thị credit tiêu hao từng task |
> | 2026-09-09 | `2026-09-09/HANDOFF_SNAPSHOT_008.md` | `task-deeplove-fullscreen-concurrency`: 8 bugfixes, nút resume, full màn hình, KIE concurrency=10 |

## 2026-09-07 — `task-byteplus-real-provider`

Hiện thực hoá provider thật `BytePlusGenerationProvider` cho ByteDance Seedance 1.5 Pro (`seedance-1-5-pro-251215`) trên BytePlus ModelArk.

1. **Cấu hình & Bảo vệ**: Hỗ trợ `GTF_VIDEO_PROVIDER` (mock/byteplus), `BYTEPLUS_MODELARK_API_KEY`, `BYTEPLUS_ENDPOINT_ID`, `ALLOW_LIVE_BYTEPLUS_TESTS=false`. Settings UI hiển thị trạng thái đã cấu hình mà không làm lộ secret.
2. **Preflight Guards**: Chặn ngay lập tức trước khi gọi mạng nếu thiếu API key (`BYTEPLUS_API_KEY_MISSING`), thiếu Endpoint ID (`BYTEPLUS_ENDPOINT_ID_MISSING`), có video tham chiếu (`BYTEPLUS_SEEDANCE_1_5_VIDEO_REFERENCE_UNSUPPORTED`), ảnh local/nội bộ (`BYTEPLUS_IMAGE_REQUIRES_ACCESSIBLE_URL`), hoặc KOL chưa bật LAS (`BYTEPLUS_KOL_LAS_UNSUPPORTED`).
3. **Chuẩn hóa Prompt**: Bổ sung `--duration <sec>` và `--camerafixed false` không trùng lặp.
4. **Chống sinh trùng & Tiết kiệm chi phí**: Nếu task đã có `providerTaskId`, không bao giờ POST lại. Nếu sinh video xong mà download lỗi, task giữ nguyên `providerTaskId` và `outputUrl`, khi retry chỉ tải lại file MP4 mà không submit lại.
5. **Kiểm thử**: 14 test case mock HTTP bổ sung (Tests A-N), 100% không tốn credit, không gọi ra ngoài.

Backup: `docs/BACKUPS/2026-09-07/task-byteplus-real-provider/`

## 2026-09-07 — `task-port-20140`

Đổi cổng runtime 20130 → **20140**. Máy của người dùng đã có hai tool khác chiếm
20129 (Apify Collector / crawler-POD) và 20130.

56 chỗ trong 13 file: `server.js` (mặc định `HQ_PORT`), 4 script launcher,
`Dockerfile`, `docker-compose.yml`, `.env.example`, `tests/docker_config.test.js`,
3 file tài liệu, placeholder LAN trong `public/index.html`.
`HANDOFF.md` sửa có chọn lọc: 6 dòng mô tả trạng thái hiện tại đổi sang 20140,
giữ nguyên các dòng lịch sử nhắc tên `task-port-20130`.

Backup: `docs/BACKUPS/2026-09-07/task-port-20140/`

## 2026-09-07 — `task-studio-redesign`

Làm lại toàn bộ ngôn ngữ thị giác của GTF Studio và Gateway: theme dark cố định
(bỏ `prefers-color-scheme`), bỏ gradient, thang bo góc có phân cấp, thay emoji
bằng 20 inline SVG line icon, chân dung KOL 4:5, thumbnail tham chiếu 60px,
system font stack thay Google Fonts. Layout, 5 view và 60 element ID giữ nguyên.

Files: `public/studio/{studio.css,index.html,studio.js}`, `public/gateway.html`.
Backend, `server.js` và hệ Higgsfield cũ không bị chạm.

Backup: `docs/BACKUPS/2026-09-07/task-studio-redesign/`

## 2026-09-07 — `task-port-20130`

Đổi cổng runtime sang 20130 vì 20129 trùng với tool khác của người dùng.
Thay `process.env.PORT` bằng `process.env.HQ_PORT` để cấu hình thuộc về dự án,
không phụ thuộc biến môi trường của máy (§39).

Files: `server.js`, 4 script launcher, `Dockerfile`, `docker-compose.yml`,
`.env.example`, `tests/docker_config.test.js`, 3 file tài liệu, `public/index.html`.

Backup: `docs/BACKUPS/2026-09-07/task-port-20130/`

## 2026-09-06 — `task-gtf-v2-mock`

Xây toàn bộ hệ thống V2 song song với V1. ~3.560 dòng code mới.
`server.js` chỉ +27/−1 dòng; `video_generate.js`, `cli_generate.js`,
`public/app.js`, `queue_db.json`, `package.json` **không đụng tới**.
Không thêm dependency nào.

Hai lỗi thật phát hiện lúc test và đã sửa:

```text
1. safeSegment() không lọc dấu gạch ngược → lỗ path traversal trên Windows.
   Đã sửa + thêm test chặn.
2. Tool sửa file đổi server.js sang CRLF làm diff phình toàn bộ.
   Đã đưa về LF.
```

3. task-byteplus-live-fix (2026-09-07):
   - Sửa lỗi video tạo ra bị giống mockup do server chưa tự nạp .env lúc boot.
   - Thêm loadDotenv() tự động nạp .env trong byteplus/config.js (cô lập khi chạy test tự động).
   - BytePlus ModelArk hỗ trợ gọi trực tiếp model `seedance-1-5-pro-251215` mà không bắt buộc tạo Custom Endpoint ep-xxx.
   - Hỗ trợ tải ảnh cục bộ (Image-to-Video) tự chuyển thành Base64 Data URL cho BytePlus ModelArk.
   - Server đã restart và xác nhận live: mode="live", provider="byteplus", configured=true.
   - Backup: docs/BACKUPS/2026-09-07/task-byteplus-live-fix/

4. task-byteplus-tos-provider (2026-09-07):
   - Hiện thực hoá Real `BytePlusTosStorageProvider` (chuẩn TOS4-HMAC-SHA256) bằng native Node.js crypto (0 dependency).
   - Hỗ trợ upload private bucket, tạo Signed HTTPS URL có thời hạn cho ModelArk đọc.
   - Tái sử dụng object đã có và tự động làm mới Signed URL khi reboot/retry mà không upload lại.
   - ReferenceManager chặn task có ảnh/video cục bộ nếu TOS chưa cấu hình (BYTEPLUS_TOS_NOT_CONFIGURED), prompt-only vẫn hoạt động bình thường.
   - Thêm 13 tests mock bao phủ trọn vẹn yêu cầu A → P (103/103 tests PASS).
   - Settings API và UI hiển thị trạng thái TOS mà không làm lộ Access/Secret Key.
   - Backup: docs/BACKUPS/2026-09-07/task-byteplus-tos-provider/

5. task-openrouter-seedance-provider (2026-09-07):
   - Hiện thực hoá Real `OpenRouterSeedanceProvider` (Seedance 2.5 - bytedance/seedance-2.5) qua OpenRouter Video API (`POST /api/v1/videos`).
   - Cấu trúc 3 provider: `mock`, `byteplus`, `openrouter`; cấu hình chuyển đổi qua `GTF_VIDEO_PROVIDER`.
   - Kết hợp lưu trữ TOS: ảnh/video tham chiếu upload lên BytePlus TOS sinh Signed URL HTTPS và chuyển tiếp qua `input_references`.
   - Thêm 17 tests tự động mới trong `tests/openrouter.test.js`: 120/120 tests PASS (100%).
   - Cấu hình an toàn: `ALLOW_LIVE_OPENROUTER_TESTS=true` trong `.env` mở khóa gọi mạng thật trên server, chặn tuyệt đối trong test tự động.
   - Runtime Test thực tế:
     * Task `bp_mtr2qtey_53a085ac` (Hero) qua BytePlus ModelArk 1.5 Pro: Thành công, MP4 tải về đĩa, AI tự quay lưng nhân vật để né mặt.
     * Task `bp_mtr4iysf_05c2eb95` (Hero) qua OpenRouter Seedance 2.5: Đã gửi request thành công, bị từ chối bởi bộ lọc của ByteDance (`InputImageSensitiveContentDetected.PrivacyInformation`) do ảnh KOL ảo 4 góc chụp siêu thực bị nhận diện nhầm thành "may contain real person".
   - Backup: `docs/BACKUPS/2026-09-07/task-openrouter-seedance-provider/`

6. task-kie-seedance-provider (2026-09-09):
   - Di chuyển luồng sinh video active sang Kie.ai (Seedance 2.5 `bytedance/seedance-2-5`).
   - Tạo `KieSeedanceProvider`, `KieFileStorageProvider`, `LocalKolAssetProvider`.
   - Backup: `docs/BACKUPS/2026-09-09/task-kie-seedance-provider/`

7. task-kie-only-mode (2026-09-09):
   - Loại bỏ hoàn toàn BytePlus TOS và LAS khỏi luồng active khi `GTF_VIDEO_PROVIDER=kie`.
   - Luồng tham chiếu KIE-only: ảnh/video cục bộ -> `KieFileStorageProvider` -> URL tạm thời -> Kie `createTask` `reference_image_urls` / `reference_video_urls`.
   - `ReferenceManager._requireStorageConfigured()` không bao giờ đòi TOS hay ném `BYTEPLUS_TOS_NOT_CONFIGURED` khi ở chế độ Kie; ném `KIE_UPLOAD_NOT_CONFIGURED` nếu thiếu `KIE_API_KEY`.
   - Settings API và UI Studio hiển thị chính xác: `Active Provider: KIE`, `Reference Storage: KIE upload`, `TOS: not used`, `LAS: not used`.
   - Bổ sung regression test: `GTF_VIDEO_PROVIDER=kie` với toàn bộ `BYTEPLUS_TOS_*` và `BYTEPLUS_LAS_*` rỗng, tạo task kèm ảnh tham chiếu hoàn thành thành công 100% mà không gặp lỗi TOS.
   - Toàn bộ code fallback cũ (BytePlus, OpenRouter, Higgsfield) được giữ nguyên vẹn.
   - Backup: `docs/BACKUPS/2026-09-09/task-kie-only-mode/`

Backup: `server.js.pre-v2.bak` ở thư mục gốc (tạo trước khi có chính sách
`BACKUP_ROOT`; các task sau dùng `docs/BACKUPS/`).

---

# 11. VERIFICATION STATUS

```text
Unit / Integration   164/164 PASS (npm test — 120 cũ + 30 Kie + 8 pricing + 6 usage; 2026-09-09)
Runtime smoke        48/48 PASS   (E2E chính, concurrency, restart recovery)
Settings API         200 OK       (mode="live", provider="kie", activeProviderName="KIE", referenceStorage="KIE upload", tos="not used", las="not used")
Deeplove Routes      200 OK       (GET /deeplove, GET /Deeplove, GET /byteplus)
Browser Render       PASS         (Headless Chrome 0 errors, deeplove_rendered.png)
```

**V2 — RUNTIME CONFIRMED:**

```text
E2E ma trận 8 tổ hợp đầu vào                         8/8 completed
Luồng chính KOL + Ảnh + Video + Prompt               MP4 tải được, 40.156 bytes, magic "ftyp"
Concurrency                                          đỉnh quan sát 10/10, 40 task không lần nào vượt
Nạp cuốn chiếu                                       task 11 vào slot chỉ 4 ms sau khi slot đầu trống
Pause                                                job đang chạy vẫn xong, không nạp thêm
Restart giữa lúc render                              providerTaskId không đổi, submitCount = 1,
                                                      mock registry vẫn đúng 1 job
Realtime 2 client                                    cả hai nhận cùng chuỗi sự kiện
UI thật trên trình duyệt                             tạo KOL → chọn vào task → completed → usageCount = 1
BytePlus ModelArk Mock Test Suite (A-N)              14/14 PASS (Preflight, Formatting, POST/GET, Polling, Resume, DL, Retry)
BytePlus ModelArk Live Config Check                  PASS (Auth OK, Model ID OK, Base64 Data URL OK)
BytePlus TOS Mock Test Suite (A-P)                   13/13 PASS (Preflight, Sign, Upload, Expiry, Traversal, Security, Guard)
OpenRouter Seedance 2.5 Test Suite                   17/17 PASS (Preflight, Submit, Polling, Resume, DL, Security, Guard)
Kie.ai Seedance 2.5 Test Suite (incl. KIE-only)      30/30 PASS (Config, Upload, Gen, Queue/Recovery, KIE-only Regression)
Kie.ai Pricing & Cost Estimation Suite (A-H)          8/8 PASS
Kie.ai Usage Accounting & Balance Suite (A-F)         6/6 PASS
Deeplove Studio UI Verification (task-deeplove-kol)   PASS (KOL dropdown/modal, duration integer, media actions ▶️/⬇️)
Live Test 1 (BytePlus Seedance 1.5 Pro)              PASS (cgt-20260907180456-wsttf, MP4 lưu tại byteplus_outputs/Tình/Hero/)
Live Test 2 (OpenRouter Seedance 2.5)                API OK, TOS signed URL OK, bị ByteDance chặn do PrivacyInformation trên ảnh KOL ảo
```

**V1 — regression đã kiểm:** `/higgsfield`, `/app.js`, `/styles.css`, `/api/queue`,
`/api/tasks`, `/api/cdp/status`, `/api/lan-info`, `/api/cli/models`, `/api/logs`
đều 200. `queue_db.json` nguyên vẹn 468 task, schema `task_*` không đổi.
UI cũ render giống hệt trước. Không kích hoạt sinh video Higgsfield thật nào.

---

# 12. OPEN RISKS

1. **Rào kiểm duyệt khuôn mặt trên Seedance 2.5**: Ảnh KOL ảo chụp photorealistic nhiều góc (grid 2x2 turnaround) bị bộ lọc sinh trắc học của ByteDance phân loại nhầm thành "may contain real person" (`InputImageSensitiveContentDetected.PrivacyInformation`).
2. **Khác biệt hành vi giữa 1.5 Pro và 2.5**: Seedance 1.5 Pro nhận ảnh nhưng tự ý quay lưng nhân vật để né mặt người thật. Seedance 2.5 chặn cứng (Hard-fail) từ khâu kiểm duyệt trước khi sinh.
3. `queue_db.json` phình dần (mục 9.1).
4. Chưa có lớp xác thực nào cho `/deeplove` và `/byteplus`. Dashboard mở cho toàn LAN — khi bật
   chế độ live, bất kỳ ai vào được cổng 20140 sẽ tiêu được tiền thật.
5. Dự án tên là PORTABLE nhưng `docker-compose.yml` còn đường dẫn máy cũ (mục 9.4).
6. Quyền IAM của Access Key TOS cần có đủ quyền `tos:PutObject` và `tos:GetObject` trên bucket `gtf-video-reference`.

---

# 13. NEXT STEPS & RECOMMENDATIONS

```text
1. ĐÃ HOÀN TẤT GẦN ĐÂY:
   - task-deeplove-fullscreen-concurrency: Sửa 8 lỗi tồn đọng, thêm nút Tiếp Tục (Resume) cho hàng chờ, audit concurrency Kie (100 concurrent tasks / 20 req per 10s), sửa tràn ngang full screen 100% viewport, nâng KIE_MAX_CONCURRENCY=10.
   - task-deeplove-references-display: Bóc tách và hiển thị toàn diện các nguồn tham chiếu (ảnh, video, KOL ảo) trong cột prompt hàng chờ, hỗ trợ Lightbox preview modal, đồng bộ với toggle "Xem thêm ▾" / "Thu gọn ▴".
   - task-deeplove-cost-calculator-fix: Khắc phục lỗi kẹt giá cost calculator, đo thời lượng video input thực tế, tính toán 2 chiều (input + output) chuẩn xác theo bảng giá Kie.ai, gắn recalculate vào mọi sự kiện xóa/sửa/tải video, đồng bộ gửi inputVideoDuration lên backend.

2. CÁC HẠNG MỤC KHI USER SẴN SÀNG CHẠY THẬT:
   - Cung cấp KIE_API_KEY trong .env và đặt GTF_VIDEO_PROVIDER=kie rồi khởi động lại server.
   - Khi có KIE_API_KEY thật, hệ thống tự động trừ credit và lưu đầy đủ bản ghi usage 13 trường.

3. HẠNG MỤC NÂNG CAO (NẾU CÓ NHU CẦU):
   - Thêm tab Settings trực quan trên UI nếu muốn xem tình trạng API key không cần mở file .env.
   - Thêm lớp xác thực bảo vệ bảng điều khiển khi mở ra mạng LAN.
```
- GTF_VIDEO_PROVIDER=kie        (Seedance 2.5 qua Kie.ai — LUỒNG CHÍNH)
- GTF_VIDEO_PROVIDER=openrouter (Seedance 2.5 qua OpenRouter — fallback)
- GTF_VIDEO_PROVIDER=byteplus   (Seedance 1.5 Pro ModelArk — fallback)
- GTF_VIDEO_PROVIDER=mock       (Chế độ thử nghiệm 0 đồng)

---

# 14. CONTINUATION GUIDE

```text
1. Đọc docs/AI_RULES/CRAWLER_POD_AGENT_RULES.md rồi đọc file này.
   Cần truy vết quyết định cũ thì đọc HANDOFF_SNAPSHOTS/ theo ngày.
2. Xác định Task ID và scope.
3. Backup vào docs/BACKUPS/YYYY-MM-DD/<task-id>/ TRƯỚC khi sửa, giữ relative path.
4. Trace flow trước khi sửa (§3). Ranh giới V1/V2 phải giữ tuyệt đối.
5. npm test phải giữ 76/76 trở lên. Không sửa assertion để che lỗi (§30).
6. Verify runtime tại http://localhost:20140, không test nhầm tiến trình cũ.
7. Báo cáo theo §48. Mock ≠ Real (§13, §44).
8. Cập nhật file này khi có thay đổi có ý nghĩa (§36).
```

**Ranh giới không được vượt:**

```text
KHÔNG refactor video_generate.js / cli_generate.js
KHÔNG migrate queue_db.json
KHÔNG gộp task V2 vào state.queue của V1
KHÔNG tái dùng state.isRunning của V1 cho V2
KHÔNG đổi UI cũ ở public/index.html, app.js, styles.css
KHÔNG gọi BytePlus/TOS/LAS thật khi chưa được cho phép
```
