# HANDOFF SNAPSHOT 005 — 2026-09-18

Task: `task-hang-doi-da-nguoi-dung` (V2 Video-to-Video) — GÓI TỐI THIỂU của backlog hàng đợi.

## User Request (verbatim)
> a bỏ sung thêm task này sửa lại ở step 3 này cũng phải xếp hàng đi em 10 kịch bản một lượt thôi
> vì step 5 hiện tại mình cx chỉ cho dựng cùng lúc 10 video một lượt thôi mà.
> Thực hiện gói hàng đợi đi ko làm gói phân quyền nhé.
> ko xoá project e tạo, ko commit. làm theo yêu cầu đi e
> (chốt cơ chế) cứ project nào yêu cầu trc thì thực hiện của project đó trc

## Đã làm

### 1. Module hàng đợi mới — `byteplus/video_studio/job_queue.js`
- `FifoQueue` — hàng đợi FIFO khoá theo key (key = projectId):
  `enqueue(key, fn, meta)`, `position(key)` (0 = đang chạy, ≥1 = số project chờ trước, -1 = không có),
  `has(key)`, `snapshot()`, `size`.
- `Gate` — semaphore đếm số việc đồng thời, `run(fn)`.
- `runWithLimit(items, limit, fn)` — chạy có trần, GIỮ NGUYÊN thứ tự kết quả.
- Singleton: `renderQueue` (concurrency **1**, env `V2V_PROJECT_CONCURRENCY`),
  `scriptGate` (limit **10**, env `V2V_LLM_CONCURRENCY`).
- **Bẫy đã tránh:** nhả khoá TRƯỚC khi resolve/reject. Nếu dọn trong `.finally` thì người gọi
  `await` xong vẫn thấy `has() === true` (dọn rơi vào microtask sau) ⇒ chặn bấm trùng sai.
  Test "has() ... xong rồi phải nhả ra" bắt đúng lỗi này ở lượt RED đầu tiên.

### 2. Step 5 — dựng video xếp hàng theo project (`index.js`)
- Route `POST /projects/:id/assemble` bọc phần dựng trong `renderQueue.enqueue(p.id, ...)`.
- **Mỗi lúc chỉ 1 project** ⇒ trần `runWithConcurrency(timelines, 10)` sẵn có trong `batchAssemble`
  TỰ ĐỘNG thành trần toàn hệ thống. Không phải sửa `assembler.js` dòng nào.
- Phần khởi tạo `_renderProgress` để NGOÀI hàng đợi (nhãn `Đang xếp hàng...`) để panel hiện ngay
  cả khi project còn đang chờ.

### 3. Chặn bấm trùng — 409
- `renderQueue.has(p.id)` ⇒ trả **409 `ALREADY_QUEUED`** kèm `queuePosition` + `queueTotal`,
  KHÔNG đẩy lượt thứ hai (trước đây bấm 2 lần = 2 lượt render ghi đè cùng thư mục output).

### 4. Step 3 — sinh kịch bản trần 10 TOÀN CỤC (`timeline_generator.js`)
- `generateBatchTimelines`: bỏ `Promise.all(promises)` (bắn hết cùng lúc) →
  `runWithLimit(anglesToUse, scriptGate.limit, ...)` + `scriptGate.run(...)`.
- 3 người bấm cùng lúc: trước = 30 request LLM đồng thời, nay tối đa **10**.
- Chữ ký hàm KHÔNG đổi.

### 5. API mới + mở rộng
- `GET /api/video-studio/queue` → `{ success, queue: { running[], waiting[], total, concurrency,
  meta[], items: [{projectId, name, state, position, videos}] } }`.
- `GET /projects/:id/render-progress` thêm `queuePosition`, `queueTotal`.

### 6. Giao diện (theo đúng bố cục user chốt)
- `public/studio/video-to-video.html`: bọc `#v2v-library` + `#v2v-queue-card` trong
  `div.v2v-library-row`; thêm badge `#v2v-queue-badge` cạnh status pill.
- `public/studio/video-to-video.css`: `.v2v-library-row` grid **70% / phần còn lại**,
  `.v2v-queue-list` `max-height:420px; overflow-y:auto`, dưới 1100px xếp dọc.
- `public/studio/video-to-video.js`: `renderQueuePanel()` + `pollQueue()` 3s + `startQueuePolling()`
  gọi lúc DOMContentLoaded; badge bấm → cuộn tới card; card step 5 hiện
  **"Đang chờ — trước bạn còn N project"**.
- Icon `list` KHÔNG có trong `icons.js` ⇒ dùng `clipboard-list` (test icons bắt được).

## RUNTIME VERIFIED
- `GET /queue` khi rỗng: `{running:[],waiting:[],total:0,concurrency:1}`.
- Bắn assemble project A → bấm LẠI A: **HTTP 409** `ALREADY_QUEUED`, `queuePosition:0`, `queueTotal:1`.
- Bắn thêm project B: `/queue` → `đang dựng: 1 | đang chờ: 1 | trần: 1`,
  `[▶] E2E_TEST_CLAUDE — running | 10 video`, `[1] hihi — waiting | 10 video`.
- `render-progress` của B: `queuePosition: 1, queueTotal: 2`.
- Bố cục đo bằng DOM ở 1600x900: thư viện **70%**, hàng đợi **29%**, cùng hàng,
  hàng đợi nằm bên phải, `overflow-y: auto`, `max-height: 420px`.
- Badge: `Hàng đợi: 1 đang dựng · 0 chờ`, chấm xanh; card hiện `▶ E2E_TEST_CLAUDE · 10 video Đang dựng`.
- **Đã DỪNG render test trước khi project "hihi" bắt đầu** ⇒ output của user KHÔNG bị ghi đè.

`npm test` **397/397** (thêm 18 test mới trong `tests/job_queue.test.js`).

## Files
MỚI: `byteplus/video_studio/job_queue.js`, `tests/job_queue.test.js`.
SỬA: `byteplus/video_studio/index.js`, `byteplus/video_studio/timeline_generator.js`,
`public/studio/video-to-video.{html,css,js}`, `tests/runner.js`.

## Backup
`docs/BACKUPS/2026-09-18/task-hang-doi-da-nguoi-dung/` (6 file trước khi sửa).
Mốc trước đó: `docs/BACKUPS/2026-09-18/MOC-OK-video-dat-yeu-cau/` + `full-changes.patch`.

## Việc còn treo
- **CHƯA COMMIT** (user: "ko commit").
- Project `E2E_TEST_CLAUDE` (`gtf_mu6fdqp8_7731e7`) GIỮ NGUYÊN theo yêu cầu ("ko xoá project e tạo").
  Output của nó đang dở dang do em dừng render giữa chừng khi verify.
- **Gói phân quyền CHƯA LÀM** (user: "ko làm gói phân quyền nhé") ⇒ card hàng đợi hiện tên PROJECT,
  chưa hiện tên nhân viên.
- Hàng đợi nằm trong RAM ⇒ **restart server là mất**. Project đang chờ sẽ không tự chạy lại.
- Chưa chạy lại full 10 video để xác nhận bản vá TTS cho 10/10 (đo riêng 8/8 ở snapshot 004).
