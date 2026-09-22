# HANDOFF SNAPSHOT 006 — 2026-09-14 — `task-google-flow-queue`

> Flowq: copy luồng Google Flow CDP từ Canvas-AI vào GTF, cổng CDP **9334**,
> trang `/byteplus/Flowqueue` + button 🎬 FLOWQ. Trạng thái cuối snapshot:
> **BUILT + WIRED + RUNTIME VERIFIED (routes/UI/CDP probe/194 tests)** —
> **CHƯA sinh video thật** (chặn ở bước user đăng nhập Google, xem mục 6).

---

## 1. USER REQUEST (nguyên văn)

> "ok giờ copy luồng đó vào GTF đi, đổi cổng sang 9334 nhớ tuân thủ rule và viết
> handoff sau khi xong đấy. Cần e test thật khi sửa xem. yêu cầu thực hiện thay
> đổi trên cổng http://localhost:20140/byteplus nhé. Yêu cầu tạo một button bên
> cạnh button LAN bên góc phải màn hình, khi user bấm vào button đấy thì sẽ hiển
> thị trang giao diện của path mới có tên là [Flowq](http://localhost:20140/byteplus)/Flowqueue.
> Hãy sử dụng luồng CDP có sẵn từ repo "D:\Tinh\Work\Canvas-AI" đã audit trước đó.
> Hãy test thật xem luồng có hoạt động đúng và ra đc kết quả ko ? nếu chưa đc
> tiếp tục sửa. Chỉ dừng lại khi ko thể tự sửa nữa và báo cáo"

Giữa chừng user ra lệnh tiếp: *"Viết handoff đi"* → snapshot này được viết tại
điểm chặn đăng nhập (mục 6), phần test sinh thật sẽ tiếp tục sau khi user login.

---

## 2. FILES

### Tạo mới
| File | Vai trò |
|---|---|
| `byteplus/google_flow/runner.mjs` | Copy **NGUYÊN VĂN** `Canvas-AI/services/google-flow-runner.mjs` (605 dòng). Khác gốc DUY NHẤT 1 chuỗi: message lỗi connectOverCDP nhắc 9222 → nhắc cdpUrl thật + tên file bat 9334. Toàn bộ logic/selector/timing giữ 100%, kể cả khối chết `if (false) {...}` (giữ để diff với gốc tối thiểu, §45). |
| `byteplus/google_flow/queue.js` | FlowQueue: hàng chờ **tuần tự 1 job/lần**, persist `flow_outputs/flow_queue_db.json` qua `JsonStore` (ghi nguyên tử), recovery §17, guard CDP loopback, upload media 2 bước, xử lý kết quả ZIP/1-file (fflate `unzipSync`) đúng logic `vite.config.ts` của Canvas. |
| `byteplus/google_flow/index.js` | Router `/api/google-flow/*`: `GET /status` (kèm probe CDP `/json/version`), `GET /jobs`, `POST /media` (multipart qua `byteplusMultipart`), `POST /jobs`, `POST /jobs/:id/retry`, `DELETE /jobs/:id`, `POST /worker/start\|pause`, `POST /settings` (workspaceUrl), static `/files` → `flow_outputs/`. |
| `public/studio/flow-queue.{html,css,js}` | UI Flowq: theme dark cố định (§6 HANDOFF), form tạo job (mode/model/prompt/ratio/duration/variants/inputMode/ảnh khung hình), card Kết nối (CDP status, workspace URL, ▶/⏸), danh sách job (log tail, preview video/ảnh, tải, chạy lại, xóa), polling thích ứng 2.5s/8s. |
| `MO_CHROME_GOOGLE_FLOW_9334.bat` | Mở Chrome `--remote-debugging-port=9334` + profile riêng `%LOCALAPPDATA%\GTF\GoogleFlowChrome` (CRLF). Né 9222 (yêu cầu user) và 9333 (V1 Higgsfield). |
| `tests/google_flow.test.js` | 8 test hàm thuần (buildFlowJob, flowWorkspaceUrl, isZipDownload, assignFlowFrameRoles, recoverJobsOnBoot, DEFAULT_CDP_URL) — 0 network, 0 paid call. |

### Sửa (backup tại `docs/BACKUPS/2026-09-14/task-google-flow-queue/`)
| File | Thay đổi |
|---|---|
| `server.js` | +3 khối additive: import router; mount `/api/google-flow` (sau mount video-studio, TRƯỚC express.static); route trang `['/byteplus/Flowqueue','/byteplus/flowqueue']` → `flow-queue.html`. |
| `public/studio/index.html` | Chèn button `#flowq-pill` (thẻ `<a>` class `status-pill flowq-pill`, accent #7567ef) NGAY TRƯỚC badge LAN — thuần additive, không đổi ID/selector cũ (§21). |
| `tests/runner.js` | Đăng ký suite: import + `await runGoogleFlowTests(reporter)`. |
| `package.json` | +2 dependency: `playwright-core` (CDP client, không tải browser), `fflate` (unzip kết quả nhiều variant). Qua `npm install`. |
| `.gitignore` | + `/flow_outputs/`. |
| `.env.example` | + block `GOOGLE_FLOW_CDP_URL=http://127.0.0.1:9334`, `GOOGLE_FLOW_PROJECT_URL=` kèm chú thích. |
| `.env` | **Append 2 khóa như trên (không secret).** KHÔNG backup file này theo §14 (chứa KIE_API_KEY). Revert = xóa block `# Flowq —` → hết file. |

---

## 3. QUYẾT ĐỊNH THIẾT KẾ

1. **Copy, không refactor** (§5/§45): runner giữ nguyên văn để mọi khác biệt hành
   vi so với Canvas-AI đều truy được về 1 chuỗi message duy nhất.
2. **Flow KHÔNG có providerTaskId** → không thể resume như Kie. Chống trùng §17
   bằng: (a) sau restart, job `running` → `failed` với lý do rõ, KHÔNG BAO GIỜ tự
   chạy lại; (b) `submitCount` tăng ngay TRƯỚC khi bấm Create — là bằng chứng
   kiểm chứng được; (c) worker sau boot luôn `enabled=false`, chỉ nổ máy khi user
   chủ động (submit mới / ▶ Chạy hàng chờ / 🔁 Chạy lại) — chống tiêu quota Google
   ngoài ý muốn (§12).
3. **Concurrency = 1 cứng**: 1 cửa sổ Chrome = 1 job. Không đụng
   `BYTEPLUS_MAX_CONCURRENCY=10` của luồng Kie (2 hàng chờ độc lập).
4. **CDP chỉ loopback**: `assertLoopback()` chặn mọi host ≠ 127.0.0.1/localhost
   ở cả probe lẫn runJob (theo cảnh báo bảo mật trong docs Canvas-AI).
5. **Upload 2 bước** (`POST /media` → mediaIds → `POST /jobs`) thay vì multipart
   1 phát: tái dùng `byteplusMultipart` sẵn có, file đổi tên `fm_<hex><ext>` —
   tên unique giúp bước search media trong dialog Flow của runner khớp chính xác.
6. **Không đụng**: V1 (`video_generate.js`, `public/index.html/app.js`,
   `queue_db.json`, CDP 9333), luồng Kie, video_studio. `server.js` chỉ +3 khối.

---

## 4. RUNTIME EVIDENCE (RUNTIME CONFIRMED)

```text
npm test                     194/194 PASS (186 cũ + 8 Google Flow Queue, 0 regression)
node --check                 server.js / tests/runner.js / 3 file google_flow / flow-queue.js OK
GET /byteplus/Flowqueue      200 (title "Flowq — Google Flow Queue"); /byteplus/flowqueue 200
GET /studio/flow-queue.css   200 ; /studio/flow-queue.js 200
GET /api/google-flow/status  {"enabled":false,"active":false,...,"cdp":{"connected":true,
                              "url":"http://127.0.0.1:9334","browser":"Chrome/152.0.7977.83"}}
GET /api/google-flow/jobs    {"jobs":[], counts all 0}
Button FLOWQ                 hiện cạnh badge LAN trên /byteplus (grep flowq-pill = 1);
                             click điều hướng đúng sang /byteplus/Flowqueue (verify trình duyệt thật)
Console trang Flowq          0 lỗi
Chrome CDP 9334              bat mở Chrome 152 thành công, /json/version trả về bình thường,
                             badge CDP trên UI Flowq chuyển XANH (probe qua server)
Regression                   /higgsfield 200, /api/queue 200, /api/lan-info 200, /byteplus 200,
                             /byteplus/video-to-video 200
```

Lưu ý vận hành: server trên cổng 20140 hiện là tiến trình `npm start` do agent
khởi động lại (PID cũ 20004 đã kill để nạp code mới). Muốn tự quản lý thì kill
port 20140 rồi chạy lại launcher quen dùng.

---

## 5. PHÁT HIỆN QUAN TRỌNG (RUNTIME CONFIRMED 2026-09-14)

**Google Flow đã đổi domain.** Điều hướng `https://labs.google/fx/vi/tools/flow`
(profile chưa đăng nhập) bị redirect sang **`https://flow.google.com/about`**
(title "Google Flow - AI Creative Studio…", có nút Đăng nhập, 0 promptBox).
Hệ quả có thể phải xử lý SAU khi đăng nhập, dựa bằng chứng thật (§1):
- `flowWorkspaceUrl()` trong `runner.mjs` hiện chỉ chấp nhận
  `https://labs.google/fx/vi/tools/flow[/project/<uuid>]` → nếu URL project mới
  nằm trên `flow.google.com` thì phải NỚI regex (giữ nhận cả 2 dạng).
- XPath cứng `//*[@id="__next"]/...` + các selector text của Canvas-AI có thể
  lệch trên UI domain mới → vá theo lỗi thực tế từng bước (log tail của job ghi
  đủ diagnostic dump của runner).

---

## 6. CHƯA LÀM ĐƯỢC & VÌ SAO (mock ≠ real, §13)

**Chưa chạy job sinh video/ảnh thật.** Chặn ở bước **đăng nhập Google** trong
profile mới `%LOCALAPPDATA%\GTF\GoogleFlowChrome` — agent không được phép nhập
credential hộ user (giới hạn an toàn tuyệt đối). Cửa sổ Chrome "GTF Google Flow
(CDP 9334)" đang mở sẵn trên máy chờ user login 1 lần.

**Các bước còn lại sau khi user đăng nhập (thứ tự cho agent tiếp theo):**
1. Điều hướng tới Flow, xác nhận URL workspace/project THẬT sau login
   (labs.google còn sống hay đã sang flow.google.com).
2. Nếu domain mới: nới `flowWorkspaceUrl()` (chấp nhận cả 2 domain), cập nhật
   test tương ứng; các selector vá theo bằng chứng lỗi thật, từng cái một.
3. Tạo/lấy 1 project Flow, dán URL vào ô "URL project Flow" trên trang Flowq
   (hoặc `GOOGLE_FLOW_PROJECT_URL` trong .env).
4. Chạy 1 job test qua đúng UI: video · Omni Flash · 4s · x1 · 16:9, prompt ngắn
   (tiêu quota tối thiểu — user ĐÃ ra lệnh test thật, §12 coi như được phép).
5. Sửa-chạy-lặp đến khi job `succeeded` + file mp4 nằm ở
   `flow_outputs/outputs/<jobId>/` và preview được trên UI; ffprobe kiểm codec.
6. Viết snapshot 007 + cập nhật HANDOFF §4/§10/§12 (đóng risk 9-10 nếu xong).

---

## 7. RỦI RO CÒN LẠI

1. Selector/XPath Flow giòn — Google đổi UI là gãy; đã có diagnostic dump trong
   log tail từng job để vá nhanh.
2. Mỗi job tiêu quota tài khoản Google đăng nhập trong Chrome CDP (§12) — UI đã
   cảnh báo ngay dưới nút submit; worker không bao giờ tự chạy sau restart.
3. Trang Flowq (như toàn dashboard) chưa có xác thực — LAN mở là ai cũng bấm
   được (trùng risk §12.4 của HANDOFF).
4. `flow-pool`/session của Canvas không được copy — Flowq lưu registry riêng
   `flow_outputs/flow_queue_db.json`; đừng trộn với `byteplus_queue_db.json`.

---

## 8. ROLLBACK

```text
docs/BACKUPS/2026-09-14/task-google-flow-queue/
├── server.js  package.json  .gitignore  .env.example  HANDOFF.md
├── public/studio/index.html
└── tests/runner.js
```
Copy đè theo relative path là về trạng thái trước task. File MỚI (byteplus/google_flow/,
public/studio/flow-queue.*, bat, tests/google_flow.test.js) xóa là sạch.
`.env`: xóa block append `# Flowq — Google Flow Queue…` đến hết file (không có
backup .env theo §14). `npm uninstall playwright-core fflate` nếu muốn gỡ dep.
