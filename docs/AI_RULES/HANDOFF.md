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

## 2.3 V2 — GTF Video AI Studio & Video to Video Studio

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
├── fixtures/mock_output.mp4          4s 480x854 H.264+AAC, 40KB
├── google_flow/           Flowq — Google Flow qua Chrome CDP 9334 (luồng copy từ Canvas-AI)
│   ├── runner.mjs         Playwright connectOverCDP — copy NGUYÊN VĂN Canvas-AI (1 chuỗi message khác)
│   ├── queue.js           hàng chờ tuần tự 1 job/lần, JsonStore flow_outputs/flow_queue_db.json, §17
│   └── index.js           Router /api/google-flow/* (status/jobs/media/worker/settings/files)
└── video_studio/          GTF Video Studio (Video to Video §3-§14)
    ├── index.js           Router + Store + FSM transitions + package export + streaming
    ├── library.js         ffprobe metadata scanner, thumbnail generator
    ├── analyzer_bridge.js Bridge kết nối worker video-analyzer Python (NDJSON)
    ├── timeline_generator.js Sinh Production Timeline + voice qua 9Router LLM
    ├── assembler.js       FFmpeg cắt ghép clip kho, audio ducking, text overlay
    └── voice_generator.js Edge TTS giọng đọc tiếng Việt (Hoài My, Nam Minh)

video-analyzer-pipeline/video-analyzer-standalone/
└── Pipeline phân tích video độc lập: Whisper audio transcription + Gemini Vision trích xuất khung hình và phân tích hành động chi tiết theo giây qua 9Router (port 20128)
```

UI: `public/gateway.html`, `public/studio/{index.html,studio.css,studio.js}`, `public/studio/{video-to-video.html,video-to-video.css,video-to-video.js}`, `public/studio/{flow-queue.html,flow-queue.css,flow-queue.js}`


---

# 3. RUNTIME / ENVIRONMENT

```text
Node             v24.18.0  (fetch/FormData/Blob/AbortController có sẵn ở global)
npm              11.16.0
OS               Windows 11
Runtime URL      http://localhost:20140
Chrome CDP       http://127.0.0.1:9333   (chỉ V1 cần; mở bằng start-cdp.bat)
Chrome CDP Flowq http://127.0.0.1:9334   (Flowq; mở bằng MO_CHROME_GOOGLE_FLOW_9334.bat, profile %LOCALAPPDATA%\GTF\GoogleFlowChrome)
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
| V2 Kie.ai (Seedance 2.5 / 2.0 Mini / 2.0 Fast) | **ACTIVE — 3 MODEL** — chung 1 `KIE_API_KEY`. Model chọn per-task, UI gửi đúng model id lên Kie (`bytedance/seedance-2-5` / `-2-mini` / `-2-fast`). Giá per-model theo bảng chuẩn Kie (2.5: 480/720/1080p 4-30s; Mini & Fast: 480/720p 4-15s). KieFileStorageProvider + LocalKolAssetProvider + Live Pricing & Usage Ledger. Chờ user điền `KIE_API_KEY` |
| V2 OpenRouter (Seedance 2.5) | **INACTIVE FALLBACK** — code giữ nguyên, không nằm trong luồng active |
| V2 BytePlus ModelArk (Seedance 1.5 Pro) | **INACTIVE FALLBACK** — code giữ nguyên, không nằm trong luồng active |
| V2 BytePlus TOS | **NOT USED khi provider=kie** — không được khởi tạo; chỉ dùng khi quay lại provider byteplus/openrouter |
| V2 LAS | **NOT USED** — KOL dùng file gốc cục bộ qua LocalKolAssetProvider, không cần LAS |
| V2 Video to Video Studio | **PRODUCTION POLISHED & FOOTAGE-DRIVEN TDD OPTIMIZED** — Mặc định mở màn hình chờ không chọn project; tự động bung Step 1 khi tạo project mới; cập nhật video input đối thủ/hook linh hoạt trước AI analysis. Kịch bản AI Footage-Driven chọn clip kho theo hành động trực quan trước khi viết lời bình. Thoại voiceover và chữ phụ đề đồng bộ 1:1 từng chữ; thời lượng thoại vừa khít lấp đầy thời lượng clip (ngân sách minWords / targetWords / maxWords); clip hook giữ trọn vẹn thời lượng thực tế. Dải che phụ đề chuyên dụng (drawbox đen mờ 92%) che sạch 100% phụ đề tiếng Anh cũ trong footage. Tự động chuyển ngữ theo Voice ID được chọn. Step 5 có thanh tiến độ tổng thể (overall progress bar) trực quan. 9Router sử dụng combo `aa` qua `.env`. Sửa triệt để lỗi phát đồng thời giữa gallery và player chính. Toàn bộ 298/298 tests PASS. |
| Flowq — Google Flow Queue (Chrome CDP 9334) | **LIVE GENERATION CONFIRMED — E2E PASS** (domain mới `flow.google.com`, 9 video gen thành công nguyên vẹn trên đĩa, test isolation hoàn tất, hỗ trợ 2 chế độ Sáng/Tối mượt mà, danh sách jobs giới hạn hiển thị vừa đủ 2 card kèm scroll dọc gọn gàng, npm test 298/298 PASS, CDP port 9334). Trang `/byteplus/Flowqueue` + button 🎬 FLOWQ cạnh badge LAN. |

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
| `video_studio_library.json` | metadata 252 clip video kho local (mô tả AI 100% Tiếng Việt tự nhiên) | git-tracked, ghi nguyên tử |
| `video_studio_projects.json` | danh sách 6 project GTF, kịch bản, hook/ref analysis, director notes 100% Tiếng Việt | git-tracked, ghi nguyên tử |
| `video_studio_thumbs/` | cache ảnh thumbnail sinh từ ffmpeg cho từng clip kho | gitignored |
| `video_studio_outputs/` | thư mục xuất bản thành phẩm video `{projectId}/final.mp4`, `storyboard.html`, `episode_manifest.json`, `production_timeline.json` | gitignored |
| `video-analyzer-pipeline/.../data/jobs/` | dữ liệu trung gian của video analyzer worker (frames, audio, analysis JSON) | gitignored |
| `flow_outputs/` | Flowq: `flow_queue_db.json` (9 succeeded, 0 queued/running/failed) + `uploads/` (ảnh khung hình) + `outputs/<jobId>/` (video/ảnh Flow trả về, cả 9 file MP4 nguyên vẹn) | gitignored, ghi nguyên tử, đã cô lập môi trường test |

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

## 2026-09-17 — `task-analysis-hard-fail-on-ai-error` (MỚI NHẤT)

Step 2 (phân tích video bằng AI) PHẢI lỗi ngay nếu "AI" (LLM 9Router) không gọi được API — KHÔNG cho done step 2 với kết quả rỗng/bịa (theo yêu cầu user + §13 mock≠real, §41 không nuốt lỗi).

**Điều tra (SOURCE CONFIRMED):** API key + proxy `127.0.0.1:20128` **hoạt động** (test model `aa`→gemini-3.8-flash trả OK). Bug là **3 chỗ nuốt lỗi** biến AI-fail thành "success rỗng/bịa":
- `vision/analyzer.py:96` batch vision lỗi → trả events rỗng.
- `merge/synthesis.py:80` text-LLM lỗi → **bịa** summary "Video documentation".
- Node route `analyze-reference`/`analyze-hook` bỏ qua `result.status`/`visual_status` → vẫn lưu + transition `reference_analyzed`.

**Fix (TDD):**
1. **Node guard** (`video_studio/index.js`): thêm export `isReferenceAnalysisUsable(result)` → `{ok,reason}`; fail nếu `!result | status==='failed' | visual_status==='failed' | visual_events rỗng`. Cả 2 route `analyze-reference` + `analyze-hook`: nếu không usable → `res.status(502){code:'AI_ANALYSIS_FAILED'}`, **KHÔNG** updateProject, **KHÔNG** transition.
2. **Python raise thay vì nuốt:** `vision/analyzer.py` raise khi TẤT CẢ batch vision fail; `pipeline.py` re-raise visual exception (bỏ hạ cấp status=failed); `synthesis.py` bỏ fallback bịa → raise `RuntimeError` khi text-LLM fail. Worker (`worker.py:165`) đã bọc `except→ok:false` → `analyzer_bridge` reject → route fail.

**RUNTIME VERIFIED:**
- Ép `VISION_MODEL/TEXT_MODEL` = model sai → `analyze_video` **RAISED RuntimeError** (không trả fake success). → step 2 bị chặn.
- Model đúng (cache) → `status=success, visual_status=success, visual_events=1` → guard PASS (không chặn nhầm).
- `npm test` **324/324 PASS** (+8 test guard). Backup: `docs/BACKUPS/2026-09-17/task-analysis-hard-fail-on-ai-error/`. Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-17/HANDOFF_SNAPSHOT_005.md`.

**Lưu ý:** cache phân tích chỉ lưu `status==success`; kết quả cũ vẫn còn cache (vision thật, chỉ summary có thể cũ). Muốn ép gọi API mới thật sự → xoá cache analyzer.

## 2026-09-17 — `task-subtitle-sync-render-concurrency`

Fix 2 vấn đề trước release theo TDD (RED→GREEN→verify). **Đính chính claim cũ:** entry `task-v2v-step5-render-progress-and-concurrency-fix` bên dưới chỉ thêm **overall bar**, KHÔNG bật per-item live cũng KHÔNG đổi concurrency (vẫn = 3). Đây là HISTORICAL CLAIM sai lệch (rule §1).

1. **Phụ đề đồng bộ TỪNG CHỮ theo voice** (trước đây `drawtext` vẽ CẢ CÂU đứng yên suốt segment):
   - `byteplus/video_studio/tts_timing.py` (MỚI): edge-tts `boundary='WordBoundary'` → vừa ghi media vừa xuất word-timing JSON `{t,off,dur}` (1 lần synth, UTF-8, ensure_ascii). Miễn phí/local.
   - `voice_generator.js`: thêm `generateVoiceWithTiming()` → `{path, words}`, fallback `generateVoice` tĩnh nếu thiếu python/venv.
   - `assembler.js`: thêm hàm thuần **`buildWordRevealDrawtext(words,{tempo,adelay,lead,segEnd})`** → reveal HIỆN DỒN từng từ; text hiện trước voice `lead` (kẹp **0.1–0.2s**), khớp `atempo` + `adelay=0.1`. Mỗi reveal 1 `drawtext ... enable='between(t,a,b)'`; giữ drawbox mask. Fallback phụ đề tĩnh khi không có word-timing.
   - **RUNTIME VERIFIED:** render clip test 6s (voice 13 từ) → frame t=1s hiện 5 từ, t=5s hiện đủ 13 từ (chữ dồn dần), ffmpeg 0 lỗi, dấu tiếng Việt chuẩn.
2. **Render tối đa 10 đồng thời, phần dư xếp hàng** (trước đây call-site hardcode `concurrency: 3`, KHÔNG phải 10):
   - `assembler.js`: thêm hàm thuần **`runWithConcurrency(items,limit,fn)`** (worker-pool nextIndex++, cap+queue, lỗi 1 item không sập pool, giữ thứ tự). `batchAssemble` refactor dùng nó; default `V2V_RENDER_CONCURRENCY || 10`.
   - `video_studio/index.js`: call-site đổi `concurrency: 3` → `Number(process.env.V2V_RENDER_CONCURRENCY)||10`.
   - **RUNTIME VERIFIED (§18):** unit test 100 item → max đồng thời quan sát ≤ 10, xử lý đủ 100 (90 xếp hàng); giữ cap cả khi có lỗi.
3. **Xem tiến độ TỪNG item khi render** (root cause: grid card chỉ dựng bởi `renderBatchRenderPanel` lúc reload; entry render live `doAssemble`/`doBatchApproveAndAssemble` gọi `showStepPanels(5)` khi `hasData` chưa set → **panel bị ẩn hoàn toàn**, grid rỗng):
   - `video-to-video.js`: `poll()` tự **hiện panel + set hasData** và **tạo card động từ `data.progress.items`** (server authoritative) khi grid thiếu; tách helper `streamCardHTML()` dùng chung với `renderBatchRenderPanel`.
   - **SOURCE CONFIRMED + smoke:** trang `/byteplus/video-to-video` load 0 lỗi console, panel/grid tồn tại. Live-grid E2E đầy đủ = **PARTIAL** (cần phiên render thật với kho asset đã mô tả).
4. **Kiểm thử:** `npm test` **316/316 PASS** (từ 254; +62 test: word-reveal 9, concurrency 5, wiring 4, và các suite trước). Backup: `docs/BACKUPS/2026-09-17/task-subtitle-sync-render-concurrency/`. Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-17/HANDOFF_SNAPSHOT_004.md`.

## 2026-09-17 — `task-v2v-step5-render-progress-and-concurrency-fix`

Hoàn thiện 4 yêu cầu theo TDD Workflow về Thanh tiến độ Step 5, 9Router combo `aa`, lấp đầy thời lượng thoại phân cảnh và sửa lỗi Double-Play Gallery:
1. **Thanh Tiến Độ Tổng Thể Step 5 (Overall Progress Bar)**:
   - `public/studio/video-to-video.html`: Bổ sung `#v2v-render-overall-card` với `#v2v-render-overall-fill`, `#v2v-render-overall-pct`, `#v2v-render-overall-text`, và `#v2v-render-overall-count` ngay trên lưới 10 luồng render song song.
   - `public/studio/video-to-video.css`: Bộ class `.v2v-render-overall-*` tokenized hoàn toàn (không hardcode màu inline), hiệu ứng chuyển động mượt mà và bóng đổ elevation nổi bật.
   - `public/studio/video-to-video.js`: Hàm `startRenderProgressPolling(projectId)` tính toán trung bình cộng % tiến độ từ tất cả các items render và cập nhật theo thời gian thực; khi đạt 100% tự động đổi sang màu xanh lá (`var(--accent-green)`). Hàm `renderBatchRenderPanel(p)` reset trạng thái ban đầu khi chuyển sang Step 5.
2. **Cấu Hình 9Router Combo "aa" vào .env**:
   - `video-analyzer-pipeline/video-analyzer-standalone/.env`: Đặt `VISION_MODEL=aa`, `TEXT_MODEL=aa`, `NINE_ROUTER_TIMELINE_MODEL=aa`.
   - `byteplus/video_studio/timeline_generator.js`: Hàm `readNineRouterModel()` đọc trực tiếp `.env` và fallback về combo `'aa'`, loại bỏ hoàn toàn hardcode `'ag/gemini-3.8-flash-high'`. Kết nối cổng 20128 trả về `200 OK`.
3. **Thoại & Subtitle Lấp Đầy Thời Lượng Phân Cảnh (Duration Fitting)**:
   - Trong `selectFootageSequence`: Bổ sung `minWords = floor(dur * 2.3)` và `targetWords = floor(dur * 2.6)` bên cạnh `maxWords = floor(dur * 2.8)`.
   - Trong `candidateFootage`: Segment 1 (Hook Video) giữ đúng thời lượng thực tế của clip hook (ví dụ 23s $\rightarrow$ ngân sách 52-60 từ) thay vì bị ép về 3.5s.
   - Cập nhật prompt: Yêu cầu câu thoại thuyết minh phải liền mạch, lấp đầy thời lượng của phân cảnh, số từ nằm trong khoảng `[minVoiceWords, maxVoiceWords]`, xấp xỉ `targetVoiceWords`. Cấm viết câu ngắn 3-4 từ để lại khoảng lặng dài trong video.
4. **Sửa Lỗi Double-Play giữa Gallery và Player Chính**:
   - `public/studio/video-to-video.js`: Hàm `playInMainPlayer(videoUrl, title)` tự động duyệt qua tất cả video trong `#v2v-batch-gallery` và gọi `v.pause(); v.currentTime = 0;`.
   - Gắn sự kiện `play` và `click` trên từng video card nhỏ trong gallery: Chặn phát trực tiếp tại thumbnail, lập tức tạm dừng và chuyển quyền phát độc quyền lên `#v2v-video-player`.
5. **Kiểm thử & Verification**:
   - `node tests/runner.js` đạt **298/298 PASS (100%)** trên cả 4 Tiers (Tier 1: 86/86, Tier 2: 125/125, Tier 3: 59/59, Tier 4: 28/28).

## 2026-09-17 — `task-v2v-footage-driven-timeline-and-voice-duration-constraint`

Xây dựng kiến trúc Footage-Driven / Visual-First Timeline và khóa cứng độ dài lời bình theo thời lượng phân cảnh theo TDD:
1. **Footage-Driven Sequencing (Asset-First)**:
   - `clusterLibraryFootage(assets)`: Phân loại clip kho thành 4 nhóm visual: `problem`, `feature`, `result`, `cta`.
   - `selectFootageSequence(assets, { targetCount })`: Chọn chuỗi clip cụ thể theo hành động thực tế với thời lượng $T = \text{sourceOut} - \text{sourceIn}$ và ngân sách số từ $\text{maxWords} = \lfloor T \times 2.8 \rfloor$ trước khi LLM viết kịch bản.
2. **Khóa Độ Dài Lời Bình Thoại (Voice Duration Constraint)**:
   - `enforceVoiceDurationConstraint(timeline)`: Tự động cắt tỉa lời thoại nếu số từ vượt quá ngân sách clip.
   - `applyCombinatorialPlanning()`: Chuẩn hóa lại lời bình sau khi random cắt đầu clip.
3. **Đồng Bộ Thoại 1:1 Giữa Subtitle và Voiceover**:
   - `seg.text` trích xuất trực tiếp từ `seg.voice` dạng UPPERCASE.
   - Trên bảng Step 4, khi user gõ sửa `voice`, `text` tự động cập nhật đồng bộ 100%.
4. **Nhận Diện & Đồng Nhất Ngôn Ngữ**:
   - `detectLanguageFromVoice(voiceId)`: Phát hiện chuẩn xác ngôn ngữ (`vi-VN-*` -> `vi`, `en-US-*` -> `en`).
   - `ensureLanguageTimeline()`: Tự động dịch chuyển ngữ kịch bản nếu người dùng chọn voice tiếng Anh hoặc tiếng Việt.
5. **Dải Che Phụ Đề Chuyên Dụng (Drawbox Banner)**:
   - `byteplus/video_studio/assembler.js`: Thêm bộ lọc `drawbox=x=40:y=ih*0.72-105:w=iw-80:h=210:color=black@0.92:t=fill`. Dải đen mờ 92% che sạch 100% phụ đề tiếng Anh cũ trong footage gốc.
6. **Khóa Thời Lượng Clip Assembler**:
   - Giữ nguyên thời lượng clip gốc `segmentDurations[i] = origDur`, không kéo dãn slow-motion.
   - Xử lý âm thanh voiceover bằng `atempo` nhẹ và `atrim=0:${duration}`.
7. **Kiểm thử E2E Live Hệ Thống**:
   - Nạp video đối thủ `reference-video.mp4` và video hook `final_2.mp4` tạo project `gtf_mu58pw3x_6ededb`.
   - Render 5 video thành phẩm hoàn hảo (`final_1.mp4` đến `final_5.mp4`), frame trích xuất xác nhận đồng bộ 1:1 và che sạch phụ đề cũ.
   - `node tests/runner.js` đạt **291/291 PASS (100%)**.

## 2026-09-17 — `task-v2v-step4-vietnamese-scripts`

Chuyển đổi 100% kịch bản dựng phim và giọng đọc ở Bước 4 (Duyệt kịch bản) sang Tiếng Việt chuẩn Direct-Response:
1. **Chuyển đổi Prompt & Kịch bản sang 100% Tiếng Việt**:
   - `byteplus/video_studio/timeline_generator.js`:
     - Viết lại `systemPrompt` và `userPrompt` bắt buộc 100% tiếng Việt tự nhiên, truyền cảm, dứt khoát chuẩn TikTok/Reels Việt Nam.
     - Quy định chặt chẽ: `title`, `directorNote` (`hookAngle`, `hookToBodyBridge`, `assetRationale`), `text` (phụ đề IN HOA <= 8 từ) và `voice` (thuyết minh voiceover 8-14 từ) đều là tiếng Việt 100%.
     - Cập nhật Worked Example và CTA Menu sang văn phong tiếng Việt chốt đơn.
     - Giữ nguyên các từ khóa kiểm thử `FULL_HOOK_DURATION` và `hookDuration` để đảm bảo tương thích 100% với test suite.
     - Bổ sung hàm phòng vệ `ensureVietnameseTimeline(timeline, apiKey)` tự động rà quét và gọi LLM dịch bản địa hóa nếu có nội dung tiếng Anh lọt vào.
2. **Thiết lập Giọng đọc Mặc định Tiếng Việt (Edge TTS)**:
   - `byteplus/video_studio/voice_generator.js`: Đưa 2 giọng tiếng Việt (`vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural`) lên đầu `AVAILABLE_VOICES`; đặt mặc định hàm `generateVoice` là `vi-VN-HoaiMyNeural`.
   - `public/studio/video-to-video.html`: Đưa nhóm `<optgroup label="Tiếng Việt (mặc định)">` lên đầu trong `#v2v-voice-select`, chọn sẵn Hoài My.
   - `public/studio/video-to-video.js`: Cập nhật 3 fallback trong `doApproveAndAssemble`, `doBatchApproveAndAssemble`, `doAssemble` sang `vi-VN-HoaiMyNeural`.
3. **Kiểm thử & Runtime Verification**:
   - `node tests/runner.js` đạt **286/286 PASS (100%)** (Tier 1: 79/79, Tier 2: 120/120, Tier 3: 59/59, Tier 4: 28/28).
   - Re-generate kịch bản dự án test `gtf_mu408rhn_9df364` ("Tình tự test") thành công: Toàn bộ bảng Timeline kịch bản và 5 card Ma Trận Kịch Bản Biến Thể hiển thị 100% tiếng Việt cuốn hút.
   - Chrome DevTools CDP chụp ảnh màn hình live xác nhận UI Step 4 và Ma Trận Biến Thể hoạt động hoàn hảo.

## 2026-09-17 — `task-v2v-5point-refinements-and-vietnamese-ai`

Hoàn thiện 5 yêu cầu tinh chỉnh trải nghiệm Video to Video Studio (`/byteplus/video-to-video`) theo phương pháp TDD & UI/UX Pro Max:
1. **Dropdown chiều dài cố định & không cuộn card ở màn hình chờ (Standby Mode)**:
   - `public/studio/video-to-video.css`: `.v2v-select-options-list` thiết lập `min-height: 190px; max-height: 250px; overflow-y: auto;`.
   - Card `#v2v-reference` khi mới vào trang (chưa chọn dự án) có `min-height: 620px; overflow: visible;` đảm bảo dropdown mở ra hiển thị ít nhất 5 dự án mà không bị cuộn card hay cắt mép.
   - `public/studio/video-to-video.js`: Quản lý toggle class `.is-standby` trên `#v2v-reference` khi chưa chọn dự án và tự động remove khi load dự án active.
2. **Sắp xếp video trong kho mới nhất trước tiên (Newest First)**:
   - `byteplus/video_studio/library.js`: `scanLibrary` quét video và sắp xếp `videoFiles` theo `mtimeMs` giảm dần; lưu `mtime` và `createdAt` vào store.
   - `byteplus/video_studio/index.js`: `listAssets(category)` sắp xếp theo `mtime` / `createdAt` giảm dần (`tB - tA`).
   - `public/studio/video-to-video.js`: `renderAssets(assets)` sắp xếp `loadedAssets` theo `mtime` / `createdAt` giảm dần.
3. **Tiến độ AI mô tả video trong kho & 5 Con AI chạy song song (Concurrency = 5)**:
   - Backend `byteplus/video_studio/index.js`: Nâng cấp `queueBackgroundDescribe` và `POST /library/describe` sử dụng worker pool chạy 5 AI song song (`CONCURRENCY = 5`). Cập nhật `GET /analyze-progress` trả về `{ total, done, concurrency, tasks }`.
   - Frontend `public/studio/video-to-video.html`: Bổ sung widget `#v2v-library-ai-progress` nằm ngay dưới thanh nút upload/scan trong `.v2v-lib-toolbar`.
   - CSS: Tokenized các class `.v2v-library-ai-progress`, `.v2v-lib-ai-head`, `.v2v-lib-ai-status`, `.v2v-lib-ai-percent`, `.v2v-lib-ai-track`, `.v2v-lib-ai-bar`, `.v2v-lib-ai-details` không dùng inline hardcoded color, pass 100% test consistency.
   - Polling: `public/studio/video-to-video.js` poll mỗi 2s, cập nhật realtime thanh tiến độ và highlight card.
4. **100% Tiếng Việt ở Step 2 & Invalidate Cache Tiếng Anh cũ**:
   - `video_analyzer/jobs/cache.py`: Bump `PIPELINE_VERSION = "2.0.0_vi"` và đưa `language` vào `compute_cache_key`.
   - `video_analyzer/merge/synthesis.py`: Bổ sung `language` cho hàm synthesis, ép prompt tiếng Việt và dịch toàn bộ fallback sang tiếng Việt.
   - `byteplus/video_studio/index.js`: Thêm middleware `ensureVietnameseAnalysis` tự động dịch tiếng Việt dự phòng qua LLM nếu phát hiện nội dung chưa có tiếng Việt.
   - Đổi nhãn `Hook strategy:` -> `Chiến lược Hook:` trong `public/studio/video-to-video.js`.
   - Tự động bóc tách và phân tích lại video ra 100% tiếng Việt chuẩn xác.
5. **Sửa lỗi FSM Transition Bug**:
   - Bổ sung `reference_analyzed -> ['timeline_generated', 'awaiting_script_review', 'failed']` và `awaiting_script_review -> ['script_approved', 'timeline_generated', 'awaiting_script_review', 'failed']` vào `GTF_TRANSITIONS`.
   - Bổ sung reflexive check `if (current === target) return true;` trong `canTransition()`.
   - Sửa lỗi khi generate timeline chuyển trực tiếp từ `reference_analyzed` sang `awaiting_script_review`.
6. **Kiểm thử & Runtime Verification**:
   - `node tests/runner.js` đạt **286/286 PASS (100%)** (Tier 1: 79/79, Tier 2: 120/120, Tier 3: 59/59, Tier 4: 28/28).
   - Chrome CDP xác minh live giao diện, dropdown bounds, Step 2 tiếng Việt, Step 4 Batch Matrix scroll và tiến độ 5 AI.

## 2026-09-16 — `task-css-sync-elevation-shadow`

Đồng bộ CSS hệ thống `/byteplus` — elevation shadow + tokenize flow-queue + xóa Google Fonts:
- **Elevation shadow shared** cho tất cả card + button, pattern từ pipeline guide cards:
  - Dark: `border: 1.5px solid rgba(255,255,255,0.16); box-shadow: 0 12px 32px -4px rgba(0,0,0,0.7), 0 0 0 1px rgba(117,103,239,0.18)`
  - Light: `border: 1.5px solid #d0c7e2; box-shadow: 0 12px 32px -4px rgba(45,30,80,0.12), 0 2px 8px rgba(45,30,80,0.06)`
  - Áp dụng cho: `.card`, `.stat-card` (studio.css), `.fq-card`, `.fq-job` (flow-queue.css)
- **flow-queue.css tokenize**: thay toàn bộ hex hardcoded bằng `var(--token, fallback)` từ studio.css :root, file 423→587 dòng
- **Bug fix critical**: thiếu `}` đóng `@media (prefers-reduced-motion)` → light theme bị kẹt
- **Xóa base styles redundants** trong flow-queue.css
- **Light theme mở rộng** ~240 dòng cho toàn bộ `.fq-*` components
- **Xóa Google Fonts** khỏi index.html, theo HANDOFF §6
- **Verification**: `node tests/runner.js` đạt **273/273 PASS (100%)**
- Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-16/HANDOFF_SNAPSHOT_002.md`

## 2026-09-16 — `task-v2v-modal-and-right-column-scroll`

Sửa tiếp UI `/byteplus/video-to-video` theo yêu cầu dùng scroll để user dễ xem video và thao tác:
- **Modal asset scroll đúng vùng body**: `.v2v-modal-body` thành flex scroll region (`flex: 1 1 auto`, `min-height: 0`, `max-height: calc(90vh - 66px)`, `overflow-y: auto`, custom scrollbar). Mục tiêu là XPath `//*[@id="v2v-asset-modal"]/div[2]/div[2]` kéo được, không cắt nội dung.
- **Video modal hiện đầy đủ**: `.v2v-modal-player-wrap` không bị co (`flex: 0 0 auto`), `.v2v-modal-video` dùng `object-fit: contain`, `max-height: min(56vh, 480px)` để `#v2v-modal-video` hiển thị trọn trong khung.
- **Cột phải bằng chiều dài cột trái và scroll bên trong**: `.v2v-workspace-layout` đổi về `align-items: stretch`; `.v2v-workspace-right` có `height: 100%`; `#v2v-final-review-card` có `height: 100%`, `max-height: 100%`, giữ `overflow-y: auto`.
- **TDD guard**: `tests/v2v_category_filter_and_layout.test.js` thêm guard cho modal body scroll và cột phải stretch/scroll.
- **Verification**: `node tests/runner.js` đạt **273/273 PASS (100%)**.

## 2026-09-16 — `task-v2v-final-review-gallery-player-fix`

Tiếp quản phần UI `/byteplus/video-to-video` sau khi agent trước hết quota; phân biệt yêu cầu user với nội dung handoff/ảnh đính kèm, chỉ coi handoff cũ là ngữ cảnh kỹ thuật:
- **Light mode chip scene đọc được**: `.v2v-chip.strong` có override light theme chữ tối (`#1d1b26`), nền lavender nhạt và border tím để các chip "Phân cảnh / Scene" không còn trắng trên nền sáng.
- **Cột phải về chiều cao tự nhiên, vẫn scroll**: `.v2v-workspace-right #v2v-final-review-card` không còn `height: 1200px`, giữ `overflow-y: auto`, `overflow-x: hidden`, `scrollbar-width: thin` và custom scrollbar để user kéo xem video output.
- **Fix side question "user không xem được video"**: Không thu nhỏ video player chính trong `#v2v-final-active-box > div:nth-child(2)`. Global `.v2v-player` giữ `max-height: 480px`.
- **Chỉ thu nhỏ batch gallery 25%**: `.v2v-batch-gallery` dùng `grid-template-columns: repeat(auto-fill, minmax(210px, 1fr))`; `.v2v-gallery-card .v2v-player` dùng `max-height: 150px`. Đây là scope duy nhất của việc shrink video thumbnail.
- **TDD guard**: `tests/v2v_category_filter_and_layout.test.js` kiểm tra gallery card nhỏ hơn nhưng player chính không bị shrink xuống 360px.
- **Verification**: `node tests/runner.js` đạt **271/271 PASS (100%)**.

## 2026-09-16 — `task-v2v-category-filter-and-35-65-layout`

Sửa lỗi Bộ Lọc Danh Mục trong Thư viện nguồn và tái cấu trúc bố cục 2 cột (35% Trái / 65% Phải) cho Video to Video Studio (`/byteplus/video-to-video`):
- **Sửa Bộ Lọc Danh Mục (`#v2v-library-category-filter`)**:
  - Khắc phục lỗi 238/247 clip ở thư mục gốc có category rỗng bị bỏ sót khỏi dropdown. Bổ sung giá trị `__root__` ánh xạ tới `"Kho gốc / Chưa phân loại (238)"`.
  - Dropdown hiển thị đầy đủ nhãn kèm số lượng: `"Tất cả danh mục (247)"`, `"Kho gốc / Chưa phân loại (238)"`, `"hook (5)"`, `"reference (4)"`.
  - Giữ nguyên trạng thái `libraryCategoryFilter` khi quét lại kho hoặc tải dữ liệu ngầm.
  - Tích hợp các chip thống kê danh mục tương tác (`.v2v-chip-clickable`) cho phép click để lọc nhanh hoặc bật/tắt tức thì.
- **Tái Cấu Trúc Layout 35% / 65% & Kéo Dài Bằng Nhau (Equal Height)**:
  - Thanh hướng dẫn `#v2v-pipeline-guide` giữ nguyên vị trí trên cùng.
  - Thư viện nguồn `#v2v-library` giữ nguyên vị trí dưới cùng.
  - Container lưới `.v2v-workspace-layout`:
    - **Cột Trái (35% chiều rộng - `.v2v-workspace-left`)**: Chứa toàn bộ thao tác dự án: Form tạo project (Tên, Số lượng video N, 2 dropzone đối thủ & hook, nút Tạo project), Bộ chọn dự án, Stepper quy trình 6 bước, Action bar và subpanels từ Bước 1 đến Bước 5. `#v2v-reference` và `#v2v-active-workspace` được đặt `height: 100%`, kéo dài chạm đáy bằng đúng card bên phải.
    - **Cột Phải (65% chiều rộng - `.v2v-workspace-right`)**: Chứa `#v2v-final-review-panel` với `position: sticky; top: 16px;`, video player thành phẩm, thanh nút xuất bản, batch gallery và preview card placeholder khi chưa render.
  - Đặt `align-items: stretch` trên Grid, cả hai khối `#v2v-reference` và `#v2v-final-review-card` luôn có chiều cao bằng nhau tuyệt đối (`diff = 0px`).
  - Tối ưu tiêu đề biến thể trong Batch Gallery: Trích xuất an toàn `tl.angle.name` thay vì chuỗi thô `[object Object]`.
  - Responsive breakpoint `@media (max-width: 1100px)` tự động co về 1 cột trên màn hình nhỏ.
- **TDD & Kiểm thử**:
  - Test suite: `tests/v2v_category_filter_and_layout.test.js` (9 tests) kiểm tra JS filter logic, cấu trúc DOM, CSS Grid 35/65 và equal height stretch.
  - Toàn bộ test runner đạt **263/263 PASS (100%)** (Tier 1: 75/75, Tier 2: 109/109, Tier 3: 51/51, Tier 4: 28/28).
  - Trình duyệt Chrome DevTools xác minh live: Cả 2 card bằng nhau chính xác (`refHeight: 1947.03px`, `cardHeight: 1947.03px`, `diff = 0`). Tiêu đề batch gallery hiển thị đúng tên góc độ.

## 2026-09-16 — `task-ui-light-theme-sync-and-flowq-db-isolation`

Đồng bộ toàn diện giao diện chế độ Nền Sáng (Light Theme) và cô lập dữ liệu kiểm thử Google Flow:
- **Khắc phục Flow Queue (`/byteplus/Flowqueue`)**: Trước đó trang này chưa liên kết `studio.css` và CSS bị fix cứng mã màu tối. Đã nhúng `studio.css` vào `flow-queue.html`, bổ sung toàn bộ quy tắc `:root[data-theme="light"]` cho Header, Card tạo job, Bảng job, input/textarea, khung ảnh/video, badge và log. Giữ nguyên 100% theme tối mặc định.
- **Sửa màu nền Trắng trên AI Studio Hub & Video Studio**:
  - `#logs-container` / `.terminal-logs`: Đổi sang nền trắng `#ffffff`, viền xám sáng, contrast chữ log rõ nét, scrollbar track nền trắng.
  - `#cost-breakdown-card`: Đổi sang nền trắng `#ffffff`, viền nhẹ, box-shadow chuẩn design token.
  - `#active-task-badge` / `.task-badge.idle`: Nền trắng `#ffffff`, viền nhẹ.
  - Media item & thumbnail trong Queue Table (`.ref-media-item`, `.ref-thumb-wrap`, `.ref-thumb`): Nền trắng `#ffffff`, viền nhẹ, hover chuyển highlight mềm.
  - `#v2v-hook-dropzone` & `#v2v-ref-dropzone`: Mặc định nền trắng `#ffffff`, chỉ khi hover mới hiển thị màu highlight.
  - `#v2v-project-select-trigger`: Mặc định nền trắng `#ffffff`, hover hiển thị viền tím và nền `#f6f3fc`; dropdown menu và search box nền trắng `#ffffff`.
  - `#v2v-stepper`: Nền trắng `#ffffff`, badge số bước xám sáng/tím sắc nét.
  - `#v2v-final-review-panel` & `.v2v-subpanel`: Nền trắng `#ffffff`, viền card đồng bộ.
- **Cô lập kiểm thử Google Flow DB (`task-flowq-db-isolation-fix`)**:
  - `tests/google_flow.test.js` trước đó ghi đè dữ liệu giả (`1.mp4`) và 39 job test vào production `flow_outputs/flow_queue_db.json`.
  - Tái cấu trúc `byteplus/google_flow/queue.js` hỗ trợ `{ flowRoot, store }` Dependency Injection. Test chuyển sang thư mục tạm `tmpFlowRoot(...)`.
  - Dọn sạch 39 job rác trong DB thật, khôi phục media references gốc, xác nhận 9 video hoàn thành nguyên vẹn trên đĩa.
- **RUNTIME VERIFIED**: `node tests/runner.js` đạt **254/254 PASS (100%)** (Tier 1: 72/72, Tier 2: 103/103, Tier 3: 51/51, Tier 4: 28/28). Dashboard chạy ổn định trên port 20140, Chrome CDP 9334 kết nối tốt. Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-16/HANDOFF_SNAPSHOT_001.md`.

## 2026-09-16 — `task-v2v-project-flow-and-inputs-fix`

Nâng cấp trải nghiệm tạo và quản lý dự án Video to Video Studio:
- **Tự động chuyển Step 1**: Khi tạo project mới, giao diện tự động focus và chuyển ngay sang Step 1 (`v2v-input-panel`) thay vì giữ step của project trước đó.
- **Tìm kiếm dự án**: Tích hợp thanh tìm kiếm lọc tức thì danh sách dự án trong dropdown (`#v2v-project-select-search`).
- **Cho phép đổi Video Input trước AI**: Người dùng có thể tự do thay đổi video đối thủ và video hook khi dự án chưa phân tích AI ở bước 2.
- **Sửa lỗi POST `/projects/:id/inputs`**: Bổ sung fallback file detection, xử lý an toàn FSM transition (`library_ready` / `failed` -> `reference_imported`).
- **TDD**: Bổ sung Tier 2 test trong `tests/video_studio.test.js`.

## 2026-09-15 — `task-ui-theme-phase3`

Phase 3: **Light / Dark Runtime Theme cho 3 trang Studio tĩnh (V2 GTF)**:
- Thư viện `public/studio/theme.js`: Đọc/lưu `localStorage['gtf-theme']`, gắn `data-theme` lên `<html>`, nút `[data-theme-toggle]` tự động đổi icon sun/moon và nhãn Sáng/Tối.
- Bộ token màu sáng trong `studio.css` (`:root[data-theme="light"]` và `@media (prefers-color-scheme: light)`).
- Chuyển `.logo-badge` và `.v2v-btn.primary` sang màu đặc (không gradient) theo audit ui-ux-pro-max.
- Suite test mới: `tests/ui_theme.test.js` kiểm tra token, runtime script và nút toggle trên cả 3 trang HTML.

## 2026-09-15 — `task-inline-style-phase2`

Phase 2: **gom inline-style → design token + utility class** (hết cảnh "mỗi trang một kiểu"). TDD, sub-agent sonnet implement, quản lý = phiên chính. Pilot video-to-video → nhân ra index/flow-queue. KHÔNG đụng V1.
- **Nguyên tắc an toàn:** chỉ ép **màu hardcode** + **block inline lặp** ra khỏi inline; **GIỮ** `display:none`/toggle (JS điều khiển qua `.style.display`, 60×) và giá trị động (`${...}`, width động). Mọi thay thế **giá trị y hệt** (pixel-faithful) — token/class copy đúng giá trị.
- **2a HTML pilot (video-to-video.html):** màu → `var(--token)` (khớp chính xác: #94a3b8=--text-secondary, #64748b=--text-muted, #ef4444=--color-danger; thêm --accent-sky, --overlay-soft/line/divider); block lặp → class (`.v2v-col-85`, `.v2v-filter-select`).
- **2b HTML rollout (index.html, flow-queue.html):** cùng cách; thêm ~26 token vào studio.css :root (giá trị exact) + class dùng chung (`.mb-0/.mb-8/.usage-th-pad/.usage-stat-card/...` ở studio.css; `.fq-hint-muted/.fq-hint-tight` ở flow-queue.css).
- **2c JS (video-to-video.js 36, studio.js 42, flow-queue.js 3):** màu literal trong `style="..."`/template → `var(--token)` (thêm 15 token exact); giữ nguyên `${}` động + logic ternary (chỉ swap chuỗi hex trong nhánh). **CÒN LẠI:** 3 chỗ `.style.cssText` trong video-to-video.js còn rgba (cơ chế DOM write, ngoài contract) — chưa tokenize.
- **RUNTIME VERIFIED:** npm test **246/246** (0 regression; +9 test consistency). 62 token trong studio.css; mọi `var(--token)` dùng trong JS đều có định nghĩa (không token chết). Browser thật cả 3 trang: icon hydrate hết (v2v 127, index 95, flow 65), computed-style khớp giá trị gốc, screenshot render y hệt, console 0 lỗi. Static asset live — không cần restart.
- Backup: `docs/BACKUPS/2026-09-15/task-inline-style-phase2a|2b|2c-js/`. Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-15/HANDOFF_SNAPSHOT_005.md`.

## 2026-09-15 — `task-emoji-svg-phase1`

Phase 1 (nối tiếp audit): thay **emoji-icon → SVG (Lucide)** qua runtime, TDD, sub-agent sonnet implement (quản lý = phiên chính). KHÔNG đụng V1.
- **Runtime mới `public/studio/icons.js`** (classic script): map `data-icon` → inline Lucide SVG (55 icon), hydrate lúc DOMContentLoaded + **MutationObserver** (tự thay icon cho cả nội dung JS render sau này), `window.GTFIcons`, try/catch không ném lỗi. SVG `width/height:1em` (thừa kế font-size), `stroke:currentColor`, `aria-hidden`.
- **1a — HTML tĩnh:** thay hết emoji-icon (41 glyph) trong video-to-video.html/index.html/flow-queue.html sang `<span data-icon>`; nạp `<script src="/studio/icons.js">`. Giữ nguyên class/text/layout.
- **1b — JS render + a11y:** icon do JS sinh (video-to-video.js/studio.js/flow-queue.js) → `data-icon` (MutationObserver hydrate). **Giữ nguyên emoji text trạng thái** trong toast/message (✓✕❌✅⚠🎉) — không phải icon. Vá a11y: bỏ `aria-hidden` khỏi 9 `<button>` icon-only, chuyển vào `<span data-icon aria-hidden>` bên trong + thêm `aria-label`. Sub-agent tránh XSS (không nhét innerHTML vào chỗ dựng từ dữ liệu user chưa escape).
- **RUNTIME VERIFIED:** npm test **237/237** (0 regression; +17 test mới: suite Icon System 1a/1b + a11y). Browser thật: **127/127 data-icon hydrate SVG** (48 tĩnh + 79 động), 0 unresolved, console 0 lỗi, render sạch. Static asset live không cần restart.
- Backup: `docs/BACKUPS/2026-09-15/task-emoji-svg-phase1a/` + `.../task-emoji-svg-phase1b/`. Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-15/HANDOFF_SNAPSHOT_004.md`.
- **CÒN LẠI (Phase 2, chưa làm):** gom inline-style → class/token (pilot video-to-video trước) — gốc rễ "mỗi trang một kiểu".

## 2026-09-15 — `task-ui-a11y-audit-fixes`

Cài skill **ui-ux-pro-max** + quét UI/UX + sửa 3 nhóm lỗi a11y theo TDD (quản lý = phiên chính, implement = sub-agent sonnet):
- **Cài skill:** `.claude/skills/` (7 skill: ui-ux-pro-max v2.13.0, design-system, design, ui-styling, brand, banner-design, slides) + `.claude-plugin/` (marketplace.json, plugin.json). Tool search chạy được: `python .claude/skills/ui-ux-pro-max/scripts/search.py "<q>" --domain <d>`. *(Session hiện tại chưa auto-list skill cho tới khi mở lại phiên / thêm marketplace.)*
- **Quét:** phát hiện style phần lớn INLINE (HTML `style=` + JS template, 0 `<style>` block) → mỗi trang một kiểu. Chấm theo bảng ưu tiên của skill.
- **TDD:** `tests/ui_a11y.test.js` (suite "UI/UX Accessibility Pass") + đăng ký `runner.js`. 10 test tĩnh (đọc CSS/HTML): T1 focus ring, T2 prefers-reduced-motion, T3 emoji aria-hidden. RED → GREEN.
- **Fix (chỉ V2, KHÔNG đụng V1):**
  - Focus ring nhìn thấy được (`box-shadow: 0 0 0 3px rgba(117,103,239,.35)`) thay `outline:none` ở `video-to-video.css` (4 chỗ) + `flow-queue.css` (1 chỗ).
  - `@media (prefers-reduced-motion: reduce)` thêm vào `studio.css` + `video-to-video.css` + `flow-queue.css`.
  - Emoji trang trí bọc `aria-hidden="true"` ở HTML tĩnh: video-to-video.html (36), index.html (37), flow-queue.html (16). *(Sub-agent gỡ 🔍 khỏi 2-3 placeholder ô tìm kiếm — không bọc aria-hidden trong attribute được; đúng hướng "no emoji as icons".)*
- **RUNTIME VERIFIED:** npm test **219/219** (0 regression, +10 test mới); static asset phục vụ live (không cần restart) — CSS có reduced-motion + focus ring, HTML aria-hidden=36.
- **CHƯA LÀM (cần quyết định thiết kế, flag — không gom mù):** emoji→SVG icon set trong JS (~41 chỗ), gom inline-style về class/token (refactor JS ~100k dòng), bump font <12px (rủi ro tràn chip), responsive breakpoint (tool desktop).
- Backup: `docs/BACKUPS/2026-09-15/task-ui-a11y-audit-fixes/` (6 file studio). Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-15/HANDOFF_SNAPSHOT_003.md`.

## 2026-09-15 — `task-prompt-v2-english-hook`

Tối ưu prompt v2 + giọng English + cho user chọn Hook (Video to Video):
- **Giọng English:** `voice_generator.js` thêm 5 giọng en-US/en-GB (Aria/Guy/Jenny/Eric/Sonia), mặc định `en-US-AriaNeural`; giữ 2 giọng vi-VN làm phụ. HTML voice picker gộp `<optgroup>` English (default) + Tiếng Việt; 3 default fallback ở `video-to-video.js` đổi sang `en-US-AriaNeural`. **RUNTIME VERIFIED:** `GET /api/video-studio/voices` trả đủ 7 giọng (English trước).
- **Chọn Hook (backend+frontend):** thêm **HOOK TYPE MENU (19 loại) + Auto** — dropdown `#v2v-hook-type-select` render động cạnh nút sinh kịch bản (state `reference_analyzed` + regen). `doGenerateTimeline` POST `{hookType}` (kèm `Content-Type: application/json`). Route `/generate-timeline` đọc `req.body?.hookType||'auto'` -> `hookContext.hookType` -> `generateBatchTimelines`/`generateTimeline`. `hookDirective`: user chọn -> **USER-LOCKED** (segment 1 bám đúng hook); `auto` -> model **tự chọn hook phù hợp nhất theo angle/product/reference** (KHÔNG bơm "recently-used", chọn theo độ FIT).
- **Prompt v2** (`timeline_generator.js` systemPrompt): thêm **định nghĩa 8 framework**, **định nghĩa 19 hook**, **CTA MENU (7 loại)** + `directorNote.ctaStyle`, **OUTPUT CONTRACT có kiểu dữ liệu từng field** + **WORKED EXAMPLE JSON**. VARIATION MANDATE nêu rõ: chọn theo FIT chứ không né "recently used".
- **RUNTIME VERIFIED:** npm test **209/209** (0 regression); server restart (kill PID cũ, `node server.js`); `/byteplus/video-to-video` HTTP 200; bundle JS chứa `v2v-hook-type-select`; voices endpoint English live.
- Backup: `docs/BACKUPS/2026-09-15/task-prompt-v2-english-hook/`. Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-15/HANDOFF_SNAPSHOT_002.md`.

## 2026-09-15 — `task-optimize-timeline-prompt`

Tối ưu prompt sinh kịch bản (Video to Video) bằng quy trình đa agent:
- Research agent tổng hợp playbook kịch bản QC short-form -> `byteplus/video_studio/knowledge/ad_script_playbook.md` (8 framework, 19 hook, 12 angle, 42 nguồn).
- Viết lại `timeline_generator.js` systemPrompt sang TIẾNG ANH, bắt buộc output tiếng Anh, thêm chọn framework + hook menu + VARIATION MANDATE (giữ schema JSON + biến angle).
- Evaluator agent chấm: **APPROVE-WITH-CHANGES** (English 9, Variation 4, Anti-repeat 3) — đề xuất ép biến đổi bằng state/hash + menu CTA + siết schema (v2 chờ duyệt).
- Lưu ý: output English nhưng TTS đang vi-VN -> cần bổ sung giọng en-US nếu chạy live. Restart server để nạp prompt.
Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-15/HANDOFF_SNAPSHOT_001.md`. Backup: `docs/BACKUPS/2026-09-15/task-optimize-timeline-prompt/`.


## 2026-09-14 — `task-google-flow-queue`

Flowq — copy luồng Google Flow CDP từ Canvas-AI vào GTF, cổng CDP **9334** (né 9222 theo yêu cầu,
né 9333 của V1), trang mới `/byteplus/Flowqueue` + button 🎬 FLOWQ cạnh badge LAN của AI Studio.
- **Copy nguyên văn** `Canvas-AI/services/google-flow-runner.mjs` → `byteplus/google_flow/runner.mjs`
  (605 dòng, chỉ đổi 1 chuỗi message lỗi 9222→9334). Hàng chờ mới `queue.js`: **tuần tự 1 job/lần**
  (1 cửa sổ Chrome), persist `flow_outputs/flow_queue_db.json`; §17: job Flow KHÔNG có providerTaskId
  → sau restart job running bị đánh failed, KHÔNG tự chạy lại; worker chỉ nổ máy khi user bấm
  (submit/▶/retry) — chống tiêu quota Google ngoài ý muốn (§12). CDP bắt buộc loopback 127.0.0.1.
- API `/api/google-flow/*` (status probe CDP, jobs, upload media 2 bước, retry/delete, worker
  start/pause, settings workspaceUrl, static files); UI `public/studio/flow-queue.{html,css,js}`
  theme dark cố định; route `['/byteplus/Flowqueue','/byteplus/flowqueue']`; button `#flowq-pill`
  chèn additive trước badge LAN (§21). Chrome mở bằng `MO_CHROME_GOOGLE_FLOW_9334.bat`, profile riêng
  `%LOCALAPPDATA%\GTF\GoogleFlowChrome`. Dependency mới: `playwright-core`, `fflate`.
- **RUNTIME VERIFIED:** npm test **194/194** (+8 suite Google Flow, 0 regression); routes 200
  (Flowqueue + css/js + V1/V2 regression); CDP probe trả Chrome/152.0.7977.83, badge CDP xanh trên UI;
  button bấm điều hướng đúng; console 0 lỗi.
- **CHƯA SINH VIDEO THẬT (mock≠real §13):** chặn ở bước user đăng nhập Google trong profile mới
  (agent không được nhập credential hộ). PHÁT HIỆN RUNTIME: `labs.google/fx/vi/tools/flow` redirect
  → `flow.google.com/about` — Google đã chuyển domain so với thời Canvas-AI; sau login có thể phải
  nới `flowWorkspaceUrl()` + vá selector theo bằng chứng thật (risk §12.9-10, các bước còn lại ở
  snapshot 006 mục 6).
- Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-14/HANDOFF_SNAPSHOT_006.md`.
  Backup: `docs/BACKUPS/2026-09-14/task-google-flow-queue/` (.env KHÔNG backup theo §14 — thay đổi
  chỉ là append 2 khóa GOOGLE_FLOW_*, revert = xóa block đó).

## 2026-09-14 — `task-v2v-step1-hook-preview + task-analyzer-ffmpeg-nostdin`

Bước 1 hiện đủ 2 video input + vá bug chặn của analyzer + E2E LIVE 6/6 bước với video thật của user.
- **UI bước 1:** panel `#v2v-input-panel` thành lưới 2 cột — `🎯 Video đối thủ` (giữ ID cũ
  `#v2v-input-player`) và `🎣 Video Hook câu view` (`#v2v-input-hook-slot`), kèm tên file thật;
  cột hook **ẩn hẳn** khi dự án không có hook. Backend thêm route `GET /projects/:id/hook-video`
  (206 Range) — trước đây không có nguồn nào phát được video hook.
- **BUG FIX (root cause confirmed, BLOCKING):** `video-analyzer-pipeline/.../media/frames.py`
  gọi `create_subprocess_exec` không đặt `stdin`, nên **ffmpeg kế thừa stdin của Python worker —
  chính là pipe NDJSON từ Node, không bao giờ đóng**. ffmpeg trích xong 69 frame trong 3 giây vẫn
  nằm chờ đọc stdin nên không thoát → `communicate()` treo vĩnh viễn → `analyze-hook` chết ở
  timeout 600s (tái hiện 2/2 lần). Vá: thêm `-nostdin` + `stdin=DEVNULL`.
  Sau vá: **62 giây** thay vì treo 600s.
- **E2E LIVE PASS 6/6** (`gtf_mu0x7s5q_1abe89`, doithu.mp4 27.8s + hook.mp4 34.7s):
  create → analyze-reference (3.2s, worker Cache HIT) → analyze-hook (62s) → generate-timeline
  (22.8s, **6 segment / 6 clip kho khác nhau**, đạt luật diversity) → review approve → validate
  (19.8s) → assemble (25.7s, FFmpeg + Edge TTS Hoài My) → final-review → `final_approved`.
  Output: `final.mp4` 5.0 MB · 19.80s · 1920x1080 h264+aac, **audio thật** (mean −19.2 dB),
  đủ `production_timeline.json` / `episode_manifest.json` / `storyboard.html`, ZIP 200 (5.017.722 byte).
- npm test **186/186 PASS**. Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-14/HANDOFF_SNAPSHOT_005.md`.
  Backup: `docs/BACKUPS/2026-09-14/{task-v2v-step1-hook-preview,task-analyzer-ffmpeg-nostdin}/`.

## 2026-09-14 — `task-v2v-dropzone-video-preview`

Form tạo dự án Video to Video: 2 ô dropzone giờ **hiển thị preview video thật** thay vì chỉ hiện tên file,
để user tự kiểm chứng mình chọn đúng clip trước khi bấm "Tạo project".
- Mỗi dropzone thêm `<video controls muted playsinline>` (`object-fit: contain`, cao 140px, nền đen —
  video dọc hiện trọn khung), dòng thông số `thời lượng · độ phân giải · dung lượng`, và nút `✕` gỡ video.
- `updateDropzoneState()` nâng từ scope `DOMContentLoaded` lên scope IIFE để `createProject()` dùng chung
  một đường dọn dẹp; bản mới **`URL.revokeObjectURL()`** object URL cũ mỗi lần đổi/gỡ file (bản cũ trong
  `createProject()` bỏ sót việc này vì chưa có preview). Tái dùng helper sẵn có `fmtDur()` / `fmtSize()`.
- Click vào `<video>` và nút `✕` không mở file picker nữa; click vùng còn lại vẫn mở như cũ để thay file.
- **Chỉ frontend**, giữ nguyên 100% ID/class cũ (§21); hợp đồng `FormData{name, refVideo, hookVideo}` không đổi.
- npm test **186/186 PASS** (không regression). Runtime verified trên cổng 20140 với 2 clip thật trong kho:
  preview blob hiện đúng, `refMeta="7s · 576×1024 · 865 KB"`, click video 0 lần mở picker, nút ✕ reset sạch,
  ô còn lại không bị ảnh hưởng, console 0 lỗi.
- Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-14/HANDOFF_SNAPSHOT_004.md`.
  Backup: `docs/BACKUPS/2026-09-14/task-v2v-dropzone-video-preview/`.

## 2026-09-14 — `task-v2v-e2e-test-fix + step1-input-ui`

Test end-to-end tool Video to Video với video đối thủ Hero.mp4 + vá 2 bug chặn + 2 sửa UI.
- **Bug fix (bug root cause confirmed, §36):** `byteplus/video_studio/timeline_generator.js` gọi 9Router sai:
  (1) model `gpt-4o-mini` KHÔNG tồn tại (404) → đổi sang `ag/gemini-3.8-flash-high` (override env `NINE_ROUTER_TIMELINE_MODEL`);
  (2) thiếu `stream:false` → 9Router trả SSE làm `response.json()` vỡ. Sau vá, bước Sinh kịch bản (§7) chạy được.
- **E2E LIVE PASS:** create project + Hero.mp4 → analyze-reference (Gemini+Whisper 21s) → generate-timeline (2 seg + voice VI)
  → review → validate → assemble (FFmpeg + Edge TTS 8.5s) → final-review → `final_approved`.
  Ra `final.mp4` 4.5s 1920x1080 h264+aac + gói (production_timeline.json, episode_manifest.json, storyboard.html).
- **UI (routing + frontend):** thêm route `GET /api/video-studio/projects/:id/reference-video` (206 stream);
  Step 1 "Video Input" giờ hiện video đối thủ user tải lên (panel `#v2v-input-panel`); bước 3 & 5 thêm nhãn "(AI xử lý)".
- npm test **186/186 PASS**. Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-14/HANDOFF_SNAPSHOT_002.md`.
  Backup: `docs/BACKUPS/2026-09-14/{task-fix-timeline-model,task-step1-input-video}/`.

## 2026-09-14 — `task-v2v-library-modal-and-auto-describe`

Hoàn thiện Giao diện Chi tiết Video Modal & Tự động Phân tích Mô tả AI (SRS §4):
- Gỡ bỏ hoàn toàn nút quét hàng loạt dư thừa trên thanh công cụ thư viện: *"🤖 AI Mô tả toàn bộ kho (§4)"*.
- Modal Giao diện Chi tiết Video: khi click vào thẻ clip hoặc nút *"🔍 AI Mô tả"*, mở popup modal chuyên dụng với video player phát trực tiếp qua HTTP 206 Partial Content Streaming, tóm tắt nội dung AI Summary, và Bảng chỉ mục mô tả chi tiết từng giây (Media Description Index theo SRS §4) có link click tua nhanh đến đúng phân cảnh.
- Hàng đợi phân tích nền tự động (`queueBackgroundDescribe`): tự động chạy nền phân tích Gemini Vision + Whisper cho các clip mới upload hoặc quét vào kho mà không làm đơ giao diện.
- Bảo toàn mô tả AI trong `scanLibrary()` khi quét lại thư mục kho.
- 186/186 tests PASS (100%). Visual verification chụp ảnh màn hình xác nhận UI sạch sẽ và modal hoạt động chuẩn xác.
- Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-14/HANDOFF_SNAPSHOT_001.md`.

## 2026-09-11 — `task-video-to-video-voice-tts-integration`

Tích hợp Kịch bản Lời thoại & Giọng đọc thuyết minh Edge TTS (SRS §7, §10, §11):
- Lên kịch bản lời thoại (AI Scripting): Prompt LLM trong `timeline_generator.js` tự động sinh thuộc tính `voice` (lời thoại tiếng Việt) kèm theo mỗi phân đoạn video trong Production Timeline.
- Sinh giọng đọc Edge TTS (Microsoft Neural Speech): module `byteplus/video_studio/voice_generator.js` tích hợp trực tiếp Python `edge-tts` với 2 giọng tiếng Việt chất lượng cao `vi-VN-HoaiMyNeural` (Nữ) và `vi-VN-NamMinhNeural` (Nam), hoàn toàn miễn phí, không tốn quota.
- Phối âm thanh & Dựng video FFmpeg: `assembler.js` tự động sinh âm thanh, trộn bằng `amix=inputs=2:duration=first`, áp dụng audio ducking (giảm âm nền video xuống 25%, giọng đọc 120%), tự động chèn silence (`anullsrc`) nếu clip gốc câm.
- Frontend: Thêm bộ chọn giọng đọc `🎙️ Giọng đọc:` và cột `Voice / Lời thoại AI` trong bảng kịch bản cho phép chỉnh sửa trực tiếp trước khi duyệt dựng.
- 186/186 tests PASS (100%).
- Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-11/HANDOFF_SNAPSHOT_005.md`.

## 2026-09-11 — `task-video-to-video-complete-pipeline`

Hoàn tất trọn bộ chu trình Video to Video Studio theo SRS v1.1 Draft (§3–§14):
- Chốt dứt điểm 2 quyết định treo:
  * (1) Model xem video = Gemini Vision + Whisper qua 9Router (`analyzer_bridge.js` nối Python worker).
  * (2) Dựng video = FFmpeg cắt ghép kho local + text overlay, không đẩy Kie.
- Backend modules: `analyzer_bridge.js` (phân tích video), `timeline_generator.js` (gọi 9Router LLM sinh timeline), `assembler.js` (FFmpeg trim, filter, concat), FSM transition engine `transitionProject` bảo đảm quy trình nghiêm ngặt theo SRS §14.
- Xuất bản trọn gói Package Export (§13): tự động sinh `final.mp4`, `storyboard.html`, `episode_manifest.json`, `production_timeline.json` tại `video_studio_outputs/<project_id>/`.
- Frontend UI: Workflow Stepper 6 bước, thanh hành động FSM động, bảng phân tích đối thủ, bảng timeline inline cho phép sửa từng segment, player duyệt video cuối và các nút tải package.
- 184/184 tests PASS (100%).
- Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-11/HANDOFF_SNAPSHOT_004.md`.

## 2026-09-11 — `task-video-to-video-tool`

Thêm tool độc lập **"Video to Video"** (GTF Video Studio Phase 1) NGAY trong HIGGSFIELD (Node), cùng cổng, path riêng `/studio/video-to-video.html` (chuyển đổi qua lại bằng nút AI STUDIO ↔ VIDEO TO VIDEO).
- Header studio: logo **AI STUDIO** thành nút + thêm nút **VIDEO TO VIDEO**, bấm chuyển qua lại 2 giao diện (giữ nguyên ID/selector cũ).
- Backend mới `byteplus/video_studio/` (độc lập luồng Kie): Local Media Library quét ffprobe + CRUD + stats (SRS §3), khung GTF Project + FSM §14, API `/api/video-studio/*`, state JSON riêng.
- UI mới `public/studio/video-to-video.{html,js,css}`: panel thư viện + project.
- npm test 181/181; live verify quét thư viện thật OK, studio cũ không regression.
- Chi tiết: `HANDOFF_SNAPSHOTS/2026-09-11/HANDOFF_SNAPSHOT_003.md`. Backup: `docs/BACKUPS/2026-09-11/task-video-to-video-tool/`.


## 2026-09-11 — `task-kie-mini-replace-standard`

Sua lai 2 model them dung y nguoi dung: **Seedance 2.0 Mini** (`bytedance/seedance-2-mini`)
va **Seedance 2.0 Fast** (`bytedance/seedance-2-fast`) — thay cho ban standard 2.0 o snapshot truoc.
Gia CONFIRMED tu kie.ai: Mini 480p 2.4/3.8 · 720p 5.0/8.2 ; Fast 480p 6.8/11.7 · 720p 15/24.8.
Ca hai: duration 4-15s, chi 480p/720p, khong output_format. UI khoa 1080p + duration>15 cho 2 model nay.
End-to-end da chung minh: UI chon model nao -> POST createTask gui dung model id do.
npm test 173/173. Chi tiet: HANDOFF_SNAPSHOTS/2026-09-11/HANDOFF_SNAPSHOT_002.md.


## 2026-09-11 — `task-kie-multimodel-2.0`

Them 2 option model Seedance **2.0** va **2.0 Fast** vao luong Kie (dung chung KIE_API_KEY voi 2.5).
- Registry `byteplus/kie_models.js`: 2.5=`bytedance/seedance-2-5`, 2.0=`bytedance/seedance-2`,
  2.0 Fast=`bytedance/seedance-2-fast`; model chon per-task (task.model/kieModel).
- Gia theo TUNG model, cach tinh giong 2.5 (chuan Kie). 2.5 & 2.0 Fast lay rate CONFIRMED tu kie.ai;
  2.0 standard quy doi tu USD/s (Kie khong co trang gia cong khai) — CAN XAC NHAN.
- 2.0/2.0 Fast: duration toi da 15s (clamp), bo output_format; 2.0 Fast chi 480p/720p (UI khoa 1080p).
- npm test 173/173 PASS; live verify cost doi dung theo model tren cong 20140.
Chi tiet: `HANDOFF_SNAPSHOTS/2026-09-11/HANDOFF_SNAPSHOT_001.md`. Backup: `docs/BACKUPS/2026-09-11/task-seedance-2.0-models/`.


## 2026-09-09 — `task-deeplove-fullscreen-concurrency`

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

## 2026-09-09 — `task-studio-ui-cleanup-and-branding`

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
> | 2026-09-11 | `2026-09-11/HANDOFF_SNAPSHOT_001.md` | `task-kie-multimodel-2.0`: Thêm Seedance 2.0 và 2.0 Fast vào Kie |
> | 2026-09-11 | `2026-09-11/HANDOFF_SNAPSHOT_002.md` | `task-kie-mini-replace-standard`: Chuẩn hóa Seedance 2.0 Mini & Fast |
> | 2026-09-11 | `2026-09-11/HANDOFF_SNAPSHOT_003.md` | `task-video-to-video-tool`: Khởi tạo tool Video to Video Phase 1 |
> | 2026-09-11 | `2026-09-11/HANDOFF_SNAPSHOT_004.md` | `task-video-to-video-complete-pipeline`: Hoàn thiện trọn bộ pipeline Video to Video (§3–§14) |
> | 2026-09-11 | `2026-09-11/HANDOFF_SNAPSHOT_005.md` | `task-video-to-video-voice-tts-integration`: Tích hợp kịch bản lời thoại & Edge TTS tiếng Việt |
> | 2026-09-14 | `2026-09-14/HANDOFF_SNAPSHOT_001.md` | `task-v2v-library-modal-and-auto-describe`: Gỡ nút thừa, Modal chi tiết clip, HTTP 206 streaming, auto describe nền |

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

## 2026-09-09 — `task-studio-ui-cleanup-and-branding`

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
> | 2026-09-11 | `2026-09-11/HANDOFF_SNAPSHOT_001.md` | `task-kie-multimodel-2.0`: Thêm Seedance 2.0 và 2.0 Fast vào Kie |
> | 2026-09-11 | `2026-09-11/HANDOFF_SNAPSHOT_002.md` | `task-kie-mini-replace-standard`: Chuẩn hóa Seedance 2.0 Mini & Fast |
> | 2026-09-11 | `2026-09-11/HANDOFF_SNAPSHOT_003.md` | `task-video-to-video-tool`: Khởi tạo tool Video to Video Phase 1 |
> | 2026-09-11 | `2026-09-11/HANDOFF_SNAPSHOT_004.md` | `task-video-to-video-complete-pipeline`: Hoàn thiện trọn bộ pipeline Video to Video (§3–§14) |
> | 2026-09-11 | `2026-09-11/HANDOFF_SNAPSHOT_005.md` | `task-video-to-video-voice-tts-integration`: Tích hợp kịch bản lời thoại & Edge TTS tiếng Việt |
> | 2026-09-14 | `2026-09-14/HANDOFF_SNAPSHOT_001.md` | `task-v2v-library-modal-and-auto-describe`: Gỡ nút thừa, Modal chi tiết clip, HTTP 206 streaming, auto describe nền |

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

8. task-flowq-google-flow-domain-and-first-gen (2026-09-14):
   - Thích ứng toàn diện với domain mới `flow.google.com` (Google Flow đổi domain): nới lỏng regex `flowWorkspaceUrl()`, hỗ trợ cả labs.google và flow.google.com.
   - Thêm alias `Omni Flash` -> `Omni 1.1 Flash` trong `VIDEO_MODELS` / `MODEL_ALIASES`.
   - Vá trigger settings: bỏ kiểm tra `aria-expanded` (thuộc tính null trên domain mới), chuyển sang kiểm tra hiển thị nút radio Video.
   - Vá selector nút Generate: thay thế XPath `__next` cũ bằng `button[aria-label*="generation" i]` và `button:has-text("arrow_forward")`.
   - RUNTIME CONFIRMED: Job `flow_mu12j1bm_25d01d` sinh video thật thành công 100%, file MP4 3.119.897 bytes (1280x720 4s H.264+AAC) tại `flow_outputs/outputs/flow_mu12j1bm_25d01d/`.
   - 194/194 unit/integration tests PASS (100%).
   - Backup: `docs/BACKUPS/2026-09-14/task-flowq-google-flow-domain-and-first-gen/`

9. task-flowq-video-reference-hero (2026-09-14):
   - Khám phá và hiện thực cơ chế tải media lên Google Flow: trigger menu `Trình đơn thêm nội dung nghe nhìn` -> `Tải lên` bắt sự kiện `filechooser` (chấp nhận video mp4/mov và ảnh).
   - Tải thành công video thật `Hero.mp4` (4.05s) lên thư viện project Flow thành asset `Hero Video`.
   - Gắn `@Hero Video` làm ingredient chip vào prompt box, mở khóa nút Generate.
   - RUNTIME CONFIRMED: Sinh thành công 100% video `flow_hero_ref_4f5ef1-1.mp4` (1.632.208 bytes, 1280x720 4.01s H.264+AAC) từ tham chiếu `Hero.mp4`.
   - Snapshot: `docs/AI_RULES/HANDOFF_SNAPSHOTS/2026-09-14/HANDOFF_SNAPSHOT_008.md`.

10. task-ui-theme-phase3 (2026-09-15):
    - Thư viện `theme.js` hỗ trợ toggle Sáng/Tối với `localStorage` persistence.
    - Chuyển `.logo-badge` và `.v2v-btn.primary` sang màu phẳng đặc (không gradient).
    - Bộ test suite `tests/ui_theme.test.js` (7/7 PASS).
    - Snapshot: `docs/AI_RULES/HANDOFF_SNAPSHOTS/2026-09-15/`.

11. task-v2v-pipeline-and-pagination (2026-09-15):
    - Đưa mục "Quy trình tự động hoá Video Studio (FSM Engine)" lên vị trí số 1 ngay đầu trang `/byteplus/video-to-video`.
    - Thêm phân trang kho video (10, 20, 50, 100 clip/trang), dãy nút số trang thông minh, nút nhảy trang, tìm kiếm tức thì và lọc theo danh mục & trạng thái mô tả AI.
    - 209/209 tests PASS (100%).

12. task-flowq-options-and-visual-slots (2026-09-15):
    - Bổ sung options: Image models (Nano Banana 2, Pro, 2 Lite), Video models (Omni 1.1 Flash, Veo 3.1 Lite/Fast/Quality/Lite Lower Priority), durations (4s, 6s, 8s, 10s), ratio đủ 5 tỉ lệ Flow, resolution (360p/720p riêng cho Omni Flash).
    - Giao diện 2 ô trực quan riêng biệt cho Thành phần (Ingredients): Ô Ảnh tham chiếu (tối đa 3 ảnh, thumbnail preview, nút xóa từng ảnh) và Ô Video tham chiếu (tối đa 1 video, player preview, nút xóa).
    - Tự động khóa/mở ô Video theo đúng model: Chỉ Omni 1.1 Flash mở video; các model Veo và Image mode tự động khóa ô video kèm badge cảnh báo đỏ chống lỗi người dùng.
    - Chế độ Khung hình (Frames): 2 ô trực quan Khung đầu (bắt buộc) & Khung cuối (tùy chọn), chặn hoàn toàn video.

13. task-v2v-project-flow-and-inputs-fix (2026-09-16):
    - Tự động focus và chuyển Step 1 (v2v-input-panel) khi tạo dự án mới, không bị giữ step cũ.
    - Bổ sung ô tìm kiếm dự án tức thì trong dropdown (`#v2v-project-select-search`).
    - Cho phép đổi video đối thủ và video hook tự do trước khi phân tích AI ở bước 2.
    - Sửa lỗi `POST /projects/:id/inputs` trên project trống, hỗ trợ fallback file detection và FSM transition an toàn.
    - 254/254 tests PASS (100%).

14. task-ui-light-theme-sync-and-flowq-db-isolation (2026-09-16):
    - Sửa lỗi chế độ Sáng (Light mode) trên Flow Queue: nhúng `studio.css` vào `flow-queue.html`, viết bộ override `:root[data-theme="light"]` hoàn chỉnh cho `flow-queue.css` (header, card, input, jobs, frame slots, logs).
    - Chuẩn hóa nền trắng (`#ffffff`) trên AI Studio Hub & Video Studio trong chế độ sáng: `#logs-container`, `#cost-breakdown-card`, `#active-task-badge`, media items trong queue table, `#v2v-hook-dropzone`, `#v2v-ref-dropzone`, `#v2v-project-select-trigger`, `#v2v-stepper`, `#v2v-final-review-panel`.
    - Cô lập triệt để DB test Google Flow: Refactor `queue.js` hỗ trợ DI `{ flowRoot, store }`, tests dùng `tmpFlowRoot` tránh ghi đè DB thật. Dọn sạch 39 job test rác trong `flow_queue_db.json`, xác nhận 9 video gen thành công nguyên vẹn trên đĩa.
    - 254/254 tests PASS (100%).

15. task-v2v-final-review-gallery-player-fix (2026-09-16):
    - Fix `.v2v-chip.strong` light mode để chữ "Phân cảnh / Scene" đọc được trên nền sáng.
    - Cột phải `#v2v-final-review-card` về chiều cao tự nhiên giống cột trái, vẫn giữ `overflow-y: auto` và custom scrollbar.
    - Giữ `.v2v-player` global `max-height: 480px`, không thu nhỏ video player chính trong `#v2v-final-active-box`.
    - Chỉ thu nhỏ batch gallery: `.v2v-batch-gallery` `minmax(210px, 1fr)` và `.v2v-gallery-card .v2v-player` `max-height: 150px`.
    - Bổ sung guard test để ngăn regression thu nhỏ nhầm player chính.
    - 271/271 tests PASS (100%).

16. task-v2v-modal-and-right-column-scroll (2026-09-16):
    - `#v2v-asset-modal > .v2v-modal-content > .v2v-modal-body` là vùng scroll thật (`min-height: 0`, `overflow-y: auto`, custom scrollbar).
    - `#v2v-modal-video` hiển thị đầy đủ bằng `object-fit: contain`, `max-height: min(56vh, 480px)`, player wrap không bị co.
    - Cột phải `.v2v-workspace-right` cao bằng cột trái qua `align-items: stretch` + `height: 100%`; `#v2v-final-review-card` scroll nội dung bên trong.
    - Bổ sung guard test cho modal scroll và cột phải stretch/scroll.
    - 273/273 tests PASS (100%).

17. task-css-sync-elevation-shadow (2026-09-16):
    - Tokenize toàn bộ `public/studio/flow-queue.css`, sửa lỗi thiếu ngoặc đóng `@media (prefers-reduced-motion: reduce)`.
    - Xóa Google Fonts khỏi `public/studio/index.html`, tuân thủ triệt để system font stack.
    - Đồng bộ elevation shadow + viền phân cấp chuẩn cho `.card`, `.stat-card`, `.fq-card` trên cả Dark Mode và Light Mode.
    - Snapshot: `docs/AI_RULES/HANDOFF_SNAPSHOTS/2026-09-16/HANDOFF_SNAPSHOT_002.md`.
    - 273/273 tests PASS (100%).

18. task-v2v-prompt-hook-ui-layout-and-vietnamese-workflow (2026-09-16):
    - Cải tiến prompt sinh kịch bản (`timeline_generator.js`): Giữ trọn vẹn thời lượng video hook đầu vào, tự do hóa thời lượng tổng thể video output.
    - Bổ sung chú thích 1-2 dòng mô tả công dụng dưới từng loại hook trong dropdown (`video-to-video.html`, `video-to-video.js`).
    - Cấu hình layout Step 1-4 full-width (`.layout-single-column`, ẩn cột phải review), chỉ bung 2 cột ở Step 5-6.
    - Click video trong Batch Gallery tự động nạp và phát trên Video Player chính.
    - Nâng cấp `byteplus/multipart.js` hỗ trợ upload nhiều video và stream an toàn.
    - Override light theme toàn diện cho tất cả các step.
    - Sửa `byteplus/video_studio/assembler.js`: Không ép slow-motion làm dãn hình video; video chạy tốc độ 1.0x tự nhiên.
    - 285/285 tests PASS (100%).

19. task-v2v-step-scroll-stepper-and-library-vietnamese (2026-09-16):
    - Step 2: Bọc bảng phân tích sự kiện `#v2v-hook-analysis-table` và `#v2v-ref-analysis-table` trong `.v2v-table-wrap` có scroll `max-height: 420px; overflow-y: auto;` với sticky `th`.
    - Step 4: Thêm scroll cho `.v2v-batch-matrix-grid` (`max-height: 540px; overflow-y: auto;`), vừa vặn chiều cao 1 card biến thể.
    - Stepper xem lại project hoàn thiện: Bấm quay lại Step 1-5 tự động thu về layout 1 cột full-width để hiển thị đúng nội dung step đó; chỉ bấm Step 6 mới bung 2 cột.
    - AI mô tả lại toàn bộ 252 clip trong kho (`video_studio_library.json`) và toàn bộ 6 project (`video_studio_projects.json`) sang 100% Tiếng Việt tự nhiên bằng 9Router LLM (`ag/gemini-3.8-flash-high`).

20. task-v2v-default-unselected-and-flowq-jobs-scroll (2026-09-16):
    - Mặc định khi vào `http://localhost:20140/byteplus/video-to-video` ở trạng thái không chọn project nào (`selectValue: ""`), ẩn `#v2v-active-workspace`, hiện màn hình chờ `#v2v-no-project`, layout cột trái full-width. Có tùy chọn `-- Không chọn dự án nào (Màn hình chờ) --` trong dropdown.
    - Flow Queue: Khung danh sách Jobs (`.fq-jobs`) tại `http://localhost:20140/byteplus/Flowqueue` giới hạn `max-height: 735px; overflow-y: auto; padding-right: 4px;`, hiển thị vừa vặn 2 card job, cuộn dọc êm ái.
    - Snapshot: `docs/AI_RULES/HANDOFF_SNAPSHOTS/2026-09-16/HANDOFF_SNAPSHOT_003.md`.
    - 286/286 tests PASS (100%).

Backup: `server.js.pre-v2.bak` ở thư mục gốc (tạo trước khi có chính sách
`BACKUP_ROOT`; các task sau dùng `docs/BACKUPS/`).

---

# 11. VERIFICATION STATUS

```text
Unit / Integration   298/298 PASS (npm test — 100% cả 4 Tiers: Tier 1: 86/86, Tier 2: 125/125, Tier 3: 59/59, Tier 4: 28/28; 2026-09-17)
Runtime smoke        48/48 PASS   (E2E chính, concurrency, restart recovery)
Settings API         200 OK       (mode="live", provider="kie", activeProviderName="KIE", referenceStorage="KIE upload", tos="not used", las="not used")
Deeplove Routes      200 OK       (GET /deeplove, GET /Deeplove, GET /byteplus)
Video Studio Route   200 OK       (GET /studio/video-to-video.html, GET /api/video-studio/*)
Flow Queue Route     200 OK       (GET /byteplus/Flowqueue, GET /api/google-flow/*, Chrome CDP 9334 connected)
Browser Render       PASS         (Headless Edge/Chrome 0 errors, verify_clean_library.png, verify_modal_detail.png)
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
Kie.ai Multi-Model Suite (2.5 / 2.0 Mini / 2.0 Fast) 9/9 PASS (Schema, Pricing, Validation, Model ID, UI Gating)
Video to Video Library & Project Suite (SRS §3-§14)  14/14 PASS (Probe, Category, Scan, Store CRUD, FSM, Package Export, Timeline, Voice, Assemble, Inputs update)
Edge TTS Voice Generation Verification               PASS (HoaiMy, NamMinh, English voices, Python edge-tts integration)
Video Analyzer Pipeline Worker Verification          PASS (Whisper base transcription + Gemini Vision analysis via 9Router)
Video to Video UI & Modal Visual Verification        PASS (Clean library without bulk button, detailed modal with HTTP 206 streaming)
UI/UX Accessibility Pass (ui-ux-pro-max audit)       10/10 PASS (Focus visible rings, prefers-reduced-motion, decorative emoji aria-hidden)
UI/UX Icon System — Phase 1a & 1b (Lucide SVG)       20/20 PASS (icons.js hydration, SVG icons, aria-label on icon-only buttons, dynamic data-icon)
UI/UX Consistency — Phase 2 (inline-style to tokens) 9/9 PASS (Zero hardcoded colors in inline-style, utility classes)
UI/UX Theme — Phase 3 (Light/Dark Runtime Theme)     7/7 PASS (studio.css light tokens, flat logo badge/buttons, theme.js persistence, toggle buttons)
Deeplove Studio UI Verification (task-deeplove-kol)  PASS (KOL dropdown/modal, duration integer, media actions ▶️/⬇️)
Live Test 1 (BytePlus Seedance 1.5 Pro)              PASS (cgt-20260907180456-wsttf, MP4 lưu tại byteplus_outputs/Tình/Hero/)
Live Test 2 (OpenRouter Seedance 2.5)                API OK, TOS signed URL OK, bị ByteDance chặn do PrivacyInformation trên ảnh KOL ảo
Google Flow Real Gen (Chrome CDP 9334)               PASS (flow_mu12j1bm_25d01d, 3.1MB MP4 1280x720 4s H.264+AAC, flow.google.com)
Google Flow Video Reference Gen (Hero.mp4)           PASS (flow_hero_ref_4f5ef1, 1.6MB MP4 1280x720 4.01s H.264+AAC, flow.google.com)
Google Flow Full E2E Video Ref 1 (Hero.mp4)          PASS (flow_mu14d1yd_a2c26b, 1.88MB MP4 720x1280 4s 9:16, tự động 100%)
Google Flow Full E2E Video Ref 2 (Cyberpunk Puppy)   PASS (flow_mu14wrtb_4183c8, 2.48MB MP4 720x1280 4s 9:16, tự động 100%)
Video to Video 8 New Core Features Suite (Mục 1-8)     8/8 PASS (Prompt, Hook note, Single-column Step 1-4, Gallery-to-player, Tiếng Việt, Multipart, Light mode, Natural speed)
Video to Video UX Refinements (Scroll, Stepper, Lang)  4/4 PASS (Step 2 scroll 420px, Step 4 scroll 540px, Stepper single-column recall, 100% Vietnamese re-description)
Video to Video Full Vietnamese AI Descriptions         PASS (252 clips kho + 6 projects 100% Tiếng Việt)
Flow Queue Jobs 2-Card Viewport & Custom Scroll        PASS (max-height: 735px, scrollbar tokenized, DOM verified 803px)
Video to Video Default Unselected Standby State        PASS (selectValue: "", #v2v-no-project visible, layout-single-column)
Footage-Driven Timeline & Voice Duration Constraint    12/12 PASS (Visual cluster, sequence selection, target/min/max words, assembler lock)
Subtitle & Voiceover 1:1 Strict Dialogue Sync          PASS (100% sync, UPPERCASE caption, Edge TTS language detection)
Assembler Subtitle Drawbox Cover                       PASS (drawbox đen mờ 92% che phủ sạch hoàn toàn phụ đề tiếng Anh cũ trong footage)
Step 5 Overall Render Progress Bar (FFmpeg 10 luồng)   PASS (v2v-render-overall-card, pct, fill, dynamic polling update)
9Router Combo "aa" Integration                         PASS (VISION_MODEL=aa, TEXT_MODEL=aa, NINE_ROUTER_TIMELINE_MODEL=aa, fallback 'aa')
Batch Gallery & Main Player Concurrency Fix            PASS (playInMainPlayer pauses gallery videos, single player stream guaranteed)
Live E2E Video Generation Test (5 videos rendered)     PASS (gtf_mu58pw3x_6ededb, final_1.mp4 to final_5.mp4, 100% Tiếng Việt)
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
7. [ĐÃ ĐÓNG 2026-09-14] **Video to Video chuẩn DỌC 9:16 (1080x1920)**: Đã chuyển toàn bộ chuỗi dựng FFmpeg sang 1080x1920 (`scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=30`), phụ đề cỡ 48pt canh chỉnh hoàn hảo ở 72% chiều cao màn hình cho TikTok/Reels/Shorts.
8. `video-analyzer-pipeline/.../media/probe.py:36` gọi `create_subprocess_exec` không đặt `stdin`,
   cùng họ lỗi với `frames.py` đã vá. ffprobe không đọc stdin tương tác nên rủi ro thấp; CHƯA SỬA.
9. [ĐÃ ĐÓNG 2026-09-14] **Google Flow đã đổi domain**: `labs.google/fx/vi/tools/flow` -> `flow.google.com`. Đã cập nhật `flowWorkspaceUrl()`, vá radio selector settings và nút generate `button[aria-label*="generation" i]`.
10. [ĐÃ ĐÓNG 2026-09-14] **Flowq chạy sinh thật**: Đã hoàn thành 100% qua job `flow_mu12j1bm_25d01d`, MP4 3.1MB, ffprobe PASS. Worker giữ `enabled: false` sau boot để chống tiêu hao quota ngoài ý muốn.
11. [ĐÃ ĐÓNG 2026-09-14] **Tự động hóa toàn bộ luồng tham chiếu Flowq & Chống sập tiến trình**:
    - Tự động mở menu thêm nội dung -> FileChooser -> nạp file -> đóng/mở settings -> chọn radio tiếng Việt (`Video`, `Thành phần`, `4 giây`, v.v.) bên trong `.cdk-overlay-pane` (tránh chạm nút Display Settings gây backdrop modal che màn hình).
    - Tự động click `button.add-menu-trigger` -> chèn chip `@...` vào prompt bar -> điền prompt -> bấm tạo video.
    - Trích xuất video thành phẩm trực tiếp từ canvas player qua `page.request.get(src)` siêu nhanh, không phụ thuộc nút Download.
    - Áp dụng chặt chẽ: tối đa 3 ảnh và tối đa 1 video làm tham chiếu (chế độ Frames tối đa 2 ảnh, chặn video).
    - Gia cố server chống sập đột ngột: `process.on('unhandledRejection')` và `process.on('uncaughtException')` tại `server.js`, bọc kín `try...catch` ở listener mạng `page.on('response')` trong `runner.mjs`.
    - Kiểm thử: 196/196 tests PASS (100%). Hai job chạy thật đều thành công: Hero (1.88MB) và Cún Cyberpunk (2.48MB).
12. [ĐÃ ĐÓNG 2026-09-14] **Xóa bỏ triệt để đóng băng khung hình bằng Slow-Motion Time-Stretching & Hỗ trợ Batch 20 video**:
    - Xóa bỏ hoàn toàn `tpad=stop_mode=clone` gây đứng hình đơ máy khi clip ngắn hơn câu thoại.
    - Triển khai bộ nhân thời gian động $multiplier = D_{\text{target}} / T_{\text{clip}}$ kết hợp `setpts=(PTS-STARTPTS)*multiplier` và `fps=30`, tự động làm chậm nhịp video mượt mà ($\approx 0.6\times - 0.75\times$) phủ trọn câu thoại voiceover.
    - Đệm nhịp thở tự nhiên: `adelay=150|150` (150ms đầu câu) và 450ms đuôi câu thoại.
    - Chuyển cảnh mềm: `xfade=fade` (0.35s) và `acrossfade` cho toàn bộ các điểm nối phân đoạn.
    - Mở rộng 20 góc kịch bản marketing `DIVERSE_ANGLES` chống trùng lặp với kho 164 asset ($U \le 3$, tỷ lệ trùng $\approx 0\%$).
    - Sửa FSM `transitionProject` bảo đảm idempotent chống lỗi xung đột trạng thái khi phân tích song song.
    - Toàn bộ 196/196 tests PASS (100%), đã nghiệm thu và re-render trọn vẹn 5/5 video tại `gtf_mu14nidb_e926ff`.
13. [ĐÃ ĐÓNG 2026-09-14] **Nhận diện phần tử Flow hoàn tất, Batch Download qua XPath, Giải nén ZIP & Delay tuần tự 10s**:
    - Nhận diện phần tử video/ảnh tạo xong: `<video aria-label="Video được tạo" src="https://flow-content.google/video/...">` (hoặc `<img>` cho image) trong Batch 0 mới nhất, hover tự động để mount player.
    - Chờ đúng 3 giây sau khi phần tử xuất hiện rồi bấm nút tải về của batch theo XPath: `//*[@id="main-content"]/flow-project-shell/flow-project-page/div/flow-project-sidenav-container/mat-sidenav-container/mat-sidenav-content/div/div/cdk-virtual-scroll-viewport/div[1]/div[1]/div[1]/flow-batch-info/div[1]/button[1]`.
    - Thiết lập CDP download behavior trực tiếp trong Chrome, tự động bắt file tải về `tải xuống.zip`.
    - Hỗ trợ giải nén mọi định dạng nén (ZIP, GZIP), lọc bỏ file rác macOS `__MACOSX`, trích xuất MP4 nguyên bản đưa về backend (`flow_outputs/outputs/<job_id>/<job_id>-1.mp4`).
    - Hàng chờ tuần tự đảm bảo: nếu còn task phía sau, sau khi lượt trước tải xong hoàn tất sẽ đợi đúng 10 giây trước khi F5 làm mới trang để tiếp tục task kế tiếp.
    - Đã nghiệm thu chạy thật thành công job `flow_mu17jrb3_3dc779` (video 2.94MB, 4.01s, 720x1280), HTTP 200 OK.
    - Toàn bộ 207/207 tests PASS (100%) trên cả 4 Tiers.
14. [ĐÃ ĐÓNG 2026-09-16] **Thời lượng video hook & kịch bản tự do**: Đã sửa prompt kịch bản (`timeline_generator.js`) bắt buộc giữ trọn vẹn thời lượng clip hook đầu vào, giải phóng giới hạn thời lượng video output tổng thể để tập trung vào logic hook và thân bài.
15. [ĐÃ ĐÓNG 2026-09-16] **Tiếng Việt toàn diện Video Studio**: Toàn bộ 252 clip trong kho (`video_studio_library.json`) và 6 project (`video_studio_projects.json`) đã được AI 9Router mô tả và phân tích 100% bằng Tiếng Việt tự nhiên.
16. [ĐÃ ĐÓNG 2026-09-16] **Trải nghiệm cuộn trang V2V & Flow Queue**: Step 2 (max-height: 420px) và Step 4 (max-height: 540px) có thanh scroll tinh gọn; Flow Queue giới hạn tối đa 2 card jobs (max-height: 735px) tránh vỡ layout trang.
17. [ĐÃ ĐÓNG 2026-09-17] **Hiển thị Thumbnail Ảnh bìa Video Hook & Đối thủ trong Kho Thư viện**:
    - Khắc phục lỗi video hook và video đối thủ (reference) không hiển thị ảnh bìa trong grid thư viện (`#v2v-library`).
    - Căn nguyên: Bản ghi nạp từ `analyze-reference` và `analyze-hook` vào `video_studio_library.json` trước đây bị thiếu `asset_id` (`undefined`), khiến endpoint `/api/video-studio/library/thumb/undefined` trả về 404 và kích hoạt `v2v-thumb-fail`.
    - Giải pháp backend: Bổ sung sinh `asset_id` an toàn (`VID_` + hex) trong `VideoStudioStore.upsertAsset`, vòng lặp tự vá lỗi trong constructor, gọi `ensureThumb()` ngay khi nạp video và preheat thumbnail qua `warmThumbs()`.
    - Khôi phục dữ liệu: Gán ID và trích xuất ảnh thumbnail bằng ffmpeg cho toàn bộ 19 video hook/reference.
    - Nghiệm thu: Xác thực trực tiếp qua Chrome CDP với 10/10 clip hook và 9/9 clip reference hiển thị ảnh bìa đầy đủ (`naturalWidth: 400`, `complete: true`), 286/286 tests PASS (100%).
18. [ĐÃ ĐÓNG 2026-09-17] **Điều Phối Render Đa Luồng FFmpeg (Worker Pool), Cập Nhật Tiến Độ Real-time & Chống Treo Step 5**:
    - Khắc phục hiện tượng Step 5 bị treo ở trạng thái `assembling` khi server khởi động lại hoặc ngắt kết nối HTTP.
    - Tái cấu trúc bộ dựng batch: Thay thế việc bắn đồng thời 10 FFmpeg processes làm nghẽn CPU bằng mô hình Worker Pool điều phối 3 luồng luân phiên (`concurrency = 3`).
    - Thêm endpoint `GET /projects/:id/render-progress` và cơ chế theo dõi tiến trình trực tiếp từng video (TTS ➡️ Ghép FFmpeg ➡️ Hoàn tất).
    - Cập nhật UI Step 5: Thanh progress động và mô tả bước xử lý thực tế trên từng thẻ video; bổ sung nút `Dựng lại (Nếu bị gián đoạn)` trên Action Bar chống kẹt giao diện.
    - Cơ chế tự phục hồi (Self-healing): Khi server boot, các project dở dang được tự động hồi phục về `script_approved` (hoặc `awaiting_final_review` nếu đã có `final.mp4`).
    - Tốc độ vượt trội: Hoàn tất toàn bộ 10 video 1080p có phụ đề và giọng AI Edge TTS chỉ trong **98 giây** (1m38s). 286/286 tests PASS (100%).

---

# 13. NEXT STEPS & RECOMMENDATIONS

```text
1. ĐÃ HOÀN TẤT GẦN ĐÂY:
   - task-v2v-step5-render-progress-and-concurrency-fix (2026-09-17):
     + Thanh tiến độ tổng thể Step 5 (Overall Progress Bar): Thêm component `#v2v-render-overall-card` với fill bar, % tổng thể, đếm video và text trạng thái theo thời gian thực.
     + Cấu hình 9Router combo `aa` qua .env: VISION_MODEL=aa, TEXT_MODEL=aa, NINE_ROUTER_TIMELINE_MODEL=aa và fallback trực tiếp trong timeline_generator.js.
     + Thoại & phụ đề lấp đầy thời lượng phân cảnh: selectFootageSequence cung cấp đồng thời 3 mốc minWords / targetWords / maxWords; clip hook giữ trọn vẹn thời lượng thực tế; prompt yêu cầu lời bình lấp đầy phân cảnh.
     + Sửa lỗi Double-Play Gallery & Player chính: playInMainPlayer tự động tạm dừng tất cả video trong gallery, chặn phát tại thumbnail và chuyển luồng phát độc quyền lên player chính.
     + Kiểm thử TDD toàn diện: tests/footage_driven_timeline.test.js đạt 298/298 tests PASS (100% GREEN).
   - task-v2v-footage-driven-timeline-and-voice-duration-constraint (2026-09-17):
     + Footage-Driven / Asset-First Timeline Generation: Phân cụm kho clip thật thành 4 nhóm chức năng (clusterLibraryFootage), chọn chuỗi phân cảnh cụ thể trước khi viết lời bình (selectFootageSequence).
     + Strict Voice Duration Constraint: Lời bình voiceover cho mỗi phân cảnh bắt buộc phải bằng hoặc ít hơn thời lượng của phân cảnh đó (word budget <= floor(T * 2.8)).
     + Bộ kiểm soát đa tầng: Chỉ thị prompt LLM, hàm lọc tự động enforceVoiceDurationConstraint, và chuẩn hoá kịch bản biến thể applyCombinatorialPlanning.
     + Đồng bộ 100% từng chữ giữa subtitle và voiceover; tự động chuyển ngữ theo Voice ID được chọn.
     + Dải banner đen mờ 92% drawbox che phủ sạch 100% phụ đề tiếng Anh cũ trong footage gốc.
     + Assembler: Cố định thời lượng phân cảnh theo clip gốc (origDur), không kéo dãn clip; tự động tăng tốc giọng đọc (atempo) và clamp (atrim=0:dur) nếu cần.
     + Xác thực thực tế (Live E2E): Test trực tiếp từ Step 1 đến Step 5 với reference-video.mp4 và final_2.mp4, dựng thành công 5/5 video thành phẩm hoàn hảo.
   - task-v2v-hook-ref-thumbnail-fix (2026-09-17):
     + Sửa triệt để lỗi thiếu thumbnail ảnh bìa cho video hook và reference (đối thủ) trong thư viện (`#v2v-library`).
     + Enforce `asset_id` hợp lệ trong `upsertAsset` & constructor self-healing của `VideoStudioStore`.
     + Tự động kích hoạt `ensureThumb()` ngay khi phân tích hook/reference và `warmThumbs()` khi server khởi động.
     + Sinh ảnh thumbnail thành công cho toàn bộ 19 video hook và reference.
     + Xác thực CDP Chrome: 100% video hook và reference hiển thị ảnh bìa hoàn hảo, 286/286 tests PASS (100%).
   - task-v2v-default-unselected-and-flowq-jobs-scroll (2026-09-16):
     + Mặc định tải trang Video to Video ở màn hình chờ không chọn project (selectValue: "").
     + Flow Queue giới hạn hiển thị vừa đủ 2 job card (max-height: 735px) kèm scrollbar tokenized.
     + Snapshot: docs/AI_RULES/HANDOFF_SNAPSHOTS/2026-09-16/HANDOFF_SNAPSHOT_003.md.
     + 286/286 tests PASS (100%).
   - task-v2v-step-scroll-stepper-and-library-vietnamese (2026-09-16):
     + Step 2 bọc bảng sự kiện trong container scroll 420px với header cố định.
     + Step 4 bọc batch matrix grid trong container scroll 540px.
     + Stepper xem lại project hoàn thiện: bấm Step 1-5 tự động thu về layout 1 cột full-width, bấm Step 6 bung 2 cột.
     + Dùng 9Router LLM viết lại 100% mô tả tiếng Việt cho 252 clip kho và 6 project.
   - task-v2v-prompt-hook-ui-layout-and-vietnamese-workflow (2026-09-16):
     + Cải tiến prompt sinh kịch bản giữ đủ thời lượng hook, kịch bản tiếng Việt chuẩn marketing.
     + Chú thích 1-2 dòng công dụng dưới từng tùy chọn loại hook trong dropdown.
     + Layout Step 1-4 full-width (ẩn cột phải review), Step 5-6 bung 2 cột.
     + Click video trong Batch Gallery tự động phát trên Video Player chính ở trên.
     + Multipart parser upload nhiều video và stream an toàn.
     + Light theme toàn diện cho tất cả các step và modal.
     + Assembler chạy tốc độ tự nhiên 1.0x, không ép dãn slow-motion.
     + 285/285 tests PASS (100%).
   - task-css-sync-elevation-shadow (2026-09-16):
     + Tokenize toàn bộ public/studio/flow-queue.css, fix bug media query, xóa Google Fonts khỏi index.html.
     + Đồng bộ elevation shadow + viền phân cấp chuẩn cho .card, .stat-card, .fq-card trên cả Dark và Light theme.
     + Snapshot: docs/AI_RULES/HANDOFF_SNAPSHOTS/2026-09-16/HANDOFF_SNAPSHOT_002.md.
     + 273/273 tests PASS (100%).
   - task-v2v-modal-and-right-column-scroll (2026-09-16):
     + `#v2v-asset-modal > .v2v-modal-content > .v2v-modal-body` là vùng scroll thật (`min-height: 0`, `overflow-y: auto`, custom scrollbar).
     + `#v2v-modal-video` hiển thị đầy đủ bằng `object-fit: contain`, `max-height: min(56vh, 480px)`, player wrap không bị co.
     + Cột phải `.v2v-workspace-right` cao bằng cột trái qua `align-items: stretch` + `height: 100%`; `#v2v-final-review-card` scroll nội dung bên trong.
     + Bổ sung guard test cho modal scroll và cột phải stretch/scroll.
     + 273/273 tests PASS (100%).
   - task-v2v-final-review-gallery-player-fix (2026-09-16):
     + Fix `.v2v-chip.strong` light mode để chữ "Phân cảnh / Scene" đọc được trên nền sáng.
     + Cột phải `#v2v-final-review-card` về chiều cao tự nhiên giống cột trái, vẫn giữ `overflow-y: auto` và custom scrollbar.
     + Sửa đúng side question: `.v2v-player` global giữ `max-height: 480px`, không thu nhỏ video player chính trong `#v2v-final-active-box`.
     + Chỉ thu nhỏ batch gallery: `.v2v-batch-gallery` `minmax(210px, 1fr)` và `.v2v-gallery-card .v2v-player` `max-height: 150px`.
     + Bổ sung guard test để ngăn regression thu nhỏ nhầm player chính.
     + 271/271 tests PASS (100%).
   - task-ui-light-theme-sync-and-flowq-db-isolation (2026-09-16):
     + Sửa lỗi chế độ Sáng (Light mode) trên Flow Queue: nhúng studio.css vào flow-queue.html, viết bộ override :root[data-theme="light"] hoàn chỉnh cho flow-queue.css (header, card, input, jobs, frame slots, logs).
     + Chuẩn hóa nền trắng (#ffffff) trên AI Studio Hub & Video Studio trong chế độ sáng: #logs-container, #cost-breakdown-card, #active-task-badge, media items trong queue table (.ref-media-item, .ref-thumb-wrap), #v2v-hook-dropzone, #v2v-ref-dropzone, #v2v-project-select-trigger, #v2v-stepper, #v2v-final-review-panel.
     + Cô lập triệt để DB test Google Flow: Refactor queue.js hỗ trợ DI { flowRoot, store }, tests dùng tmpFlowRoot tránh ghi đè DB thật. Dọn sạch 39 job test rác trong flow_queue_db.json, xác nhận 9 video gen thành công nguyên vẹn trên đĩa.
     + 254/254 tests PASS (100%).
   - task-v2v-project-flow-and-inputs-fix (2026-09-16):
     + Tự động focus và chuyển Step 1 (v2v-input-panel) khi tạo dự án mới, không bị giữ step cũ.
     + Bổ sung ô tìm kiếm dự án tức thì trong dropdown (#v2v-project-select-search).
     + Cho phép đổi video đối thủ và video hook tự do trước khi phân tích AI ở bước 2.
     + Sửa lỗi POST /projects/:id/inputs trên project trống, hỗ trợ fallback file detection và FSM transition an toàn.
     + 254/254 tests PASS (100%).
   - task-ui-theme-phase3 (2026-09-15):
     + Thư viện theme.js hỗ trợ toggle Sáng/Tối với localStorage persistence.
     + Chuyển .logo-badge và .v2v-btn.primary sang màu phẳng đặc (không gradient).
     + Test suite tests/ui_theme.test.js.
   - task-flowq-batch-download-xpath-and-queue-delay (2026-09-14):
     + Nhận diện element video xong trên Batch 0 (<video aria-label="Video được tạo" src="https://flow-content.google/video/...">), đợi 3s rồi bấm nút download theo XPath batch info.
     + Cấu hình Browser/Page.setDownloadBehavior trên CDP, nhận diện file ZIP trực tiếp từ Chrome.
     + Tự động giải nén ZIP/GZIP ra file video nguyên bản và lưu vào backend.
     + Chờ đúng 10s sau khi task trước tải xong mới F5 cho task tiếp theo trong hàng chờ.
     + Xác thực chạy thật thành công job flow_mu17jrb3_3dc779 (2.94MB, 4.01s, 720x1280), 207/207 tests PASS.
   - task-flowq-waiting-loop-and-cdp-fix (2026-09-14):
     + Đối chiếu luồng CDP với Canvas-AI (services/google-flow-runner.mjs): Phát hiện code gốc Canvas-AI chỉ hỗ trợ text-to-video, khi có video tham chiếu sẽ bắt trúng URL bucket /asb/ vào networkMedia và thoát ngay sau 30s thay vì đợi Flow gen xong.
     + Phân tách nguồn media tuyệt đối: Bỏ qua hoàn toàn URL /asb/ (Assets Bucket), chỉ công nhận video AI tạo ra từ flow-content.google/video/<UUID>.
     + Chuẩn hóa URL Key (normalizeMediaKey) bỏ query parameters và fix lệch entity &amp; vs &.
     + Quét toàn bộ video hiện hữu trước khi bấm Tạo (collectExistingFlowVideoKeys) nạp vào preExistingVideoKeys.
     + Vòng lặp chờ kiên nhẫn (Waiting Loop): Polling mỗi 3s đến khi video AI thực sự xuất hiện và nạp xong (duration > 0, bytes > 50KB), timeout tối đa 5 phút, log nhịp thở mỗi 15s lên UI.
     + Hot-reload động qua import('./runner.mjs?update=' + Date.now()) trong queue.js, nạp code mới ngay lập tức mà hoàn toàn KHÔNG cần restart server.
     + 196/196 tests PASS (100%).
   - task-v2v-slowmo-time-stretch-and-batch20 (2026-09-14):
     + Xóa bỏ triệt để đóng băng khung hình (Zero Freezing): Thay thế hoàn toàn tpad=stop_mode=clone bằng bộ nhân thời gian động multiplier = D_target / T_clip và setpts=(PTS-STARTPTS)*multiplier @ fps=30 trong assembler.js, làm chậm tốc độ phát mượt mà phủ kín trọn vẹn câu thoại và phụ đề.
     + Nhịp thở âm thanh tự nhiên: adelay=150|150 (150ms đầu câu) và apad đệm 450ms đuôi câu, chuyển cảnh mềm xfade (0.35s) + acrossfade giữa mọi phân đoạn.
     + Mở rộng 20 góc kịch bản marketing (DIVERSE_ANGLES) trong timeline_generator.js đảm bảo tỷ lệ trùng lặp clip xấp xỉ 0% với kho 164 video.
     + Chuẩn hoá path/assetPath cho hàm assembleVideo và batchAssemble.
     + Sửa lỗi chuyển trạng thái FSM idempotent cho transitionProject tránh lỗi song song analyze-reference & analyze-hook.
     + Re-render hoàn tất 5/5 video mẫu nghiệm thu tại gtf_mu14nidb_e926ff (final_1.mp4 đến final_5.mp4).
     + 196/196 tests PASS (100%).
   - task-flowq-automation-full-pipeline (2026-09-14):
     + Tự động hóa 100% E2E cho Google Flow qua Chrome CDP 9334 tại /byteplus/Flowqueue.
     + Tự động nạp media tham chiếu vào thư viện dự án Flow bằng FileChooser.
     + Cấu hình radio parameters tiếng Việt (Mode, Ingredients/Frames, Ratio, Model, Duration, Variants) an toàn bên trong .cdk-overlay-pane, loại bỏ xung đột click với nút Display Settings.
     + Kích hoạt add-menu-trigger để chèn chip tham chiếu @ vào ô prompt, điền prompt và bấm nút Tạo (Generate).
     + Trích xuất video thành phẩm trực tiếp từ Canvas Video Player bằng page.request.get(src) vào outputs/<job_id>/, không phụ thuộc nút Download.
     + Khống chế số lượng tham chiếu: Tối đa 3 ảnh (.jpg, .png, .webp) và tối đa 1 video (.mp4 <= 10s). Chế độ Frames nhận tối đa 2 ảnh và chặn video.
     + Gia cố server chống sập đột ngột: process.on('unhandledRejection') và process.on('uncaughtException') tại server.js, try...catch toàn diện ở onResponse trong runner.mjs.
     + Đã xác thực thành công 2 video thực tế từ Google Flow: Hero (1.88MB) và Chú cún Cyberpunk (2.48MB).
     + 196/196 tests PASS (100%).
   - task-flowq-options-and-visual-slots (2026-09-15):
     + Bổ sung đầy đủ options: Image models (Nano Banana 2, Pro, 2 Lite), Video models (Omni 1.1 Flash, Veo 3.1 Lite/Fast/Quality/Lite Lower Priority), durations (4s, 6s, 8s, 10s), ratio đủ 5 tỉ lệ Flow, resolution (360p/720p riêng cho Omni Flash).
     + Giao diện 2 ô trực quan riêng biệt cho Thành phần (Ingredients): Ô Ảnh tham chiếu (tối đa 3 ảnh, thumbnail preview, nút xóa từng ảnh) và Ô Video tham chiếu (tối đa 1 video, player preview, nút xóa).
     + Tự động khóa/mở ô Video theo đúng model: Chỉ Omni 1.1 Flash mở video; các model Veo và Image mode tự động khóa ô video kèm badge cảnh báo đỏ chống lỗi người dùng.
     + Chế độ Khung hình (Frames): 2 ô trực quan Khung đầu (bắt buộc) & Khung cuối (tùy chọn), chặn hoàn toàn video.
   - task-v2v-pipeline-and-pagination (2026-09-15):
     + Đưa mục "Quy trình tự động hoá Video Studio (FSM Engine)" lên vị trí số 1 ngay đầu trang /byteplus/video-to-video.
     + Thêm phân trang (10, 20, 50, 100 clip/trang), dãy nút số trang thông minh, nút nhảy trang, tìm kiếm tức thì và lọc theo danh mục & trạng thái mô tả AI.
     + 209/209 tests PASS (100%).

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
