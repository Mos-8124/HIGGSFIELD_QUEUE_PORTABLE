# HANDOFF SNAPSHOT 013 (2026-09-14 19:25) — task-flowq-batch-download-xpath-and-queue-delay

## 1. Yêu Cầu Người Dùng & Mục Tiêu
1. Nhận diện phần tử video sinh xong trên Google Flow: `<video aria-label="Video được tạo" src="https://flow-content.google/video/...">` (hoặc `<img>` nếu là luồng tạo ảnh).
2. Khi phần tử xuất hiện: Đợi đúng 3 giây.
3. Sau đó bấm vào XPath nút tải về hàng loạt (Batch Download) do người dùng chỉ định:
   `//*[@id="main-content"]/flow-project-shell/flow-project-page/div/flow-project-sidenav-container/mat-sidenav-container/mat-sidenav-content/div/div/cdk-virtual-scroll-viewport/div[1]/div[1]/div[1]/flow-batch-info/div[1]/button[1]`
4. Tải file về qua Chrome CDP: Nếu file ở bất kỳ định dạng nén nào (ZIP, GZIP), giải nén và đẩy video nguyên bản về backend hệ thống (`flow_outputs/outputs/<job_id>/<job_id>-1.mp4`).
5. Nếu có các task xếp hàng sau: Lượt chạy trước phải tải xong hoàn tất -> đợi 10 giây mới được bấm F5 làm mới trang để tiếp tục làm task tiếp theo.
6. Giám sát tự động, không thao tác tay gây nhiễu, không tự ý tắt server.

---

## 2. Các Thay Đổi Kỹ Thuật Chi Tiết

### 2.1. `byteplus/google_flow/runner.mjs`
- **Hằng số mới**:
  - `FLOW_POST_GENERATION_WAIT_MS = 3_000` (đợi 3s sau khi phần tử tạo xong xuất hiện).
  - `FLOW_TASK_QUEUE_DELAY_MS = 10_000` (đợi 10s giữa các task xếp hàng).
  - `FLOW_BATCH_DOWNLOAD_BUTTON_XPATH = '//*[@id="main-content"]/flow-project-shell/flow-project-page/div/flow-project-sidenav-container/mat-sidenav-container/mat-sidenav-content/div/div/cdk-virtual-scroll-viewport/div[1]/div[1]/div[1]/flow-batch-info/div[1]/button[1]'`.
- **Nhận diện phần tử video/image sinh xong (`checkNewlyRenderedFlowElement`)**:
  - Quét trong phạm vi Batch 0 (`cdk-virtual-scroll-viewport div.cdk-virtual-scroll-content-wrapper > div > div:first-child`).
  - Tự động hover vào `flow-video-tile` đầu tiên để Flow kích hoạt nạp thẻ `<video>` thay vì chỉ giữ thumbnail `<img>`.
  - Kiểm tra điều kiện thẻ `<video>`: `aria-label="Video được tạo"`, `src` bắt đầu bằng `https://flow-content.google/video/`, không thuộc tập `preExistingVideoKeys`.
  - Trong mode ảnh: kiểm tra thẻ `<img>` với `aria-label` / `alt` chứa "ảnh", `src` dạng `https://flow-content.google/image/`.
- **Kích hoạt tải về qua XPath & Bắt file**:
  - Khi `detection.ready = true`: Chờ đúng 3 giây (`wait(FLOW_POST_GENERATION_WAIT_MS)`).
  - Cấu hình CDP session `Browser.setDownloadBehavior` (`eventsEnabled: true`, `downloadPath: targetDir`) và `Page.setDownloadBehavior`.
  - Bấm nút download theo XPath chỉ định.
  - Xử lý tải về từ Chrome: Nếu Chrome lưu trực tiếp file `tải xuống.zip` vào thư mục job, nhận diện ngay và trả về đường dẫn thực tế trên đĩa.
  - Cơ chế fallback: Nếu không bắt được sự kiện download, tự động fallback sang trích xuất network / canvas player.

### 2.2. `byteplus/google_flow/queue.js`
- **Xử lý giải nén và lưu file backend**:
  - Đọc đúng `targetFilePath` (file ZIP/GZIP tải về từ Chrome hoặc `outputPath`).
  - Hỗ trợ giải nén GZIP qua `gunzipSync` và ZIP qua `unzipSync` (`fflate`), lọc bỏ file rác `__MACOSX/` và `._*`.
  - Ghi file MP4 sạch vào `flow_outputs/outputs/<job_id>/<job_id>-1.mp4`.
  - Dọn dẹp sạch sẽ các file tạm `outputPath` và `targetFilePath`.
- **Hàng chờ tuần tự với độ trễ 10s**:
  - Trong `FlowQueue.kick()`: Sau khi hoàn thành 1 job và tải xong về backend, nếu còn job tiếp theo trong queue (`this.nextQueued()`), ghi log:
    `"Còn task xếp hàng [nextJob.id]: đợi 10s sau khi tải xong trước khi F5 làm task tiếp theo..."`
    và chờ đúng `10_000ms` trước khi bước vào vòng lặp chạy task tiếp theo.

---

## 3. Kết Quả Xác Thực & Nghiệm Thu Thực Tế
- **Task kiểm thử chạy thật**: `flow_mu17jrb3_3dc779`
  - Mode: `video`, Model: `Omni 1.1 Flash`, Duration: `4s`, Ratio: `9:16`.
  - Tham chiếu: `flow_mu12j1bm_25d01d-1.mp4` (chú cún).
  - Prompt: Chú cún mặc áo choàng cyberpunk và kính công nghệ cao bước đi trong thành phố đêm neon.
  - **Quá trình diễn ra đúng 100% kịch bản**:
    - `12:20:14`: Đã bấm Tạo, chờ Google Flow khởi tạo tác vụ.
    - `12:20:58`: Phát hiện element video đã tạo xong (1 element), đợi 3s trước khi ấn nút tải về.
    - `12:21:01` (đúng 3s sau): Tìm và bấm nút tải về của batch theo XPath chỉ định.
    - `12:21:09`: Chrome tải trực tiếp file `tải xuống.zip` (2,938,910 bytes).
    - `12:21:09`: Hệ thống tự động giải nén ZIP -> tạo file `flow_mu17jrb3_3dc779-1.mp4` (2,938,718 bytes).
    - Trạng thái job chuyển thành `succeeded`.
- **Xác thực video**:
  - `ffprobe`: `format_name=mov,mp4,m4a,3gp,3g2,mj2`, `duration=4.01s`, `size=2938718`.
  - HTTP Endpoint: `GET /api/google-flow/files/outputs/flow_mu17jrb3_3dc779/flow_mu17jrb3_3dc779-1.mp4` trả về **HTTP 200 OK**, `Content-Length: 2938718`.
- **Test Suite**: **207/207 tests PASS (100%)** trên cả 4 Tiers.
