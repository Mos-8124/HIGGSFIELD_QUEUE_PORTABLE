# HANDOFF SNAPSHOT 007 — 2026-09-14 — `task-flowq-google-flow-domain-and-first-gen`

> Flowq: Hoàn tất chuyển đổi thích ứng domain mới `flow.google.com`, vá selector và **CHẠY SINH VIDEO THẬT THÀNH CÔNG 100% (LIVE E2E PASS)** qua Chrome CDP 9334.

---

## 1. USER REQUEST
User cho phép sử dụng Google Flow để sinh thử nghiệm 1 video, đã đăng nhập Google trên Chrome CDP 9334 và yêu cầu tự động tạo project + thực hiện test luồng hoàn chỉnh trên cổng http://localhost:20140/byteplus và /byteplus/Flowqueue.

---

## 2. NHỮNG THAY ĐỔI & TINH CHỈNH (SOURCE & RUNTIME CONFIRMED)

### 2.1 Domain & Workspace URL
* Google đã chuyển hoàn toàn sang domain `flow.google.com`. URL project thật: `https://flow.google.com/project/<uuid>`.
* Sửa `flowWorkspaceUrl()` trong `byteplus/google_flow/runner.mjs`: Nới lỏng regex để chấp nhận cả `labs.google/fx/vi/tools/flow` lẫn `flow.google.com`.
* Cập nhật `tests/google_flow.test.js` kiểm thử URL mới (194/194 tests PASS).

### 2.2 Model Selection
* Google Flow cập nhật tên model: `Omni 1.1 Flash` thay cho `Omni Flash`.
* Cập nhật `VIDEO_MODELS` và `MODEL_ALIASES` trong `runner.mjs` để ánh xạ mượt mà từ `Omni Flash` sang `Omni 1.1 Flash`.
* Sửa logic kiểm tra model hiện tại trong `configureFlowControls`: kiểm tra `.includes()` và `.endsWith()` để xử lý việc icon `arrow_drop_down` nằm trong `innerText` của nút chọn model.

### 2.3 Settings Trigger Button
* Trên giao diện mới của Google Flow, nút tóm tắt cài đặt không có thuộc tính `aria-expanded` (thuộc tính này là `null`).
* Sửa `openFlowSettings` và `closeFlowSettings`: Kiểm tra trạng thái đóng/mở dựa trên sự hiển thị của các radio button bên trong (`button[role="radio"]:has-text("Video")`); bắt trigger qua selector `button.settings-trigger-button` / `button[aria-label="Settings trigger"]`.

### 2.4 Nút Kích Hoạt Sinh Video (Generate Button)
* XPath cũ `//*[@id="__next"]/...` không còn tồn tại trên domain mới. Nút trên UI hiện tại có `aria-label="Start generation"` và text `arrow_forward`.
* Bổ sung selector `button[aria-label*="generation" i]` và `button:has-text("arrow_forward")` vào danh sách ưu tiên của `waitForFirst`.

---

## 3. KẾT QUẢ KIỂM THỬ THỰC TẾ (RUNTIME CONFIRMED)

* **Job ID:** `flow_mu12j1bm_25d01d`
* **Prompt:** "A playful golden retriever puppy running on grass, sunlit cinematic 4k"
* **Model:** `Omni 1.1 Flash`, thời lượng 4s, tỉ lệ 16:9, 1 variant.
* **Thời gian hoàn thành:** 10:00:27 UTC (17:00:27 local).
* **Kết quả bắt luồng (Network Capture):** Bắt trực tiếp gói phản hồi MP4 qua CDP network response (3.119.897 bytes).
* **File lưu trên đĩa:** `flow_outputs/outputs/flow_mu12j1bm_25d01d/flow_mu12j1bm_25d01d-1.mp4`.
* **Thông số ffprobe:**
  * Video: `H.264`, `1280x720`, `4.00s`.
  * Audio: `AAC`, `4.01s`.
* **Giao diện:** Hiển thị trọn vẹn trên bảng danh sách của `/byteplus/Flowqueue`, phát video 200 OK, tải video 200 OK.
* **Unit/Integration Tests:** 194/194 PASS (100%).

---

## 4. RỦI RO ĐÃ ĐÓNG & CÒN LẠI

* **ĐÃ ĐÓNG Risk §12.9:** Domain mới `flow.google.com` đã được tích hợp và xác thực hoàn tất.
* **ĐÃ ĐÓNG Risk §12.10:** Đã đăng nhập và thực hiện sinh video thật thành công 100%.
* **Rủi ro còn lại:**
  * Giao diện Google Flow phụ thuộc DOM web, có thể thay đổi bất ngờ nếu Google cập nhật.
  * Mỗi lần sinh video tiêu quota tài khoản Google đang đăng nhập trong Chrome CDP 9334 (đã bảo vệ an toàn: worker không tự động chạy sau khi khởi động lại).

---

## 5. BACKUP
Backup lưu tại: `docs/BACKUPS/2026-09-14/task-flowq-google-flow-domain-and-first-gen/`
* `byteplus/google_flow/runner.mjs`
* `tests/google_flow.test.js`
