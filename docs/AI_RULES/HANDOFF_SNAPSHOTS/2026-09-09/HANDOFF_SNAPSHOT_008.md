# HANDOFF SNAPSHOT 008

Date: 2026-09-09
Task: `task-deeplove-fullscreen-concurrency`

---

## 1. USER REQUEST & SCOPE

1. **Xử lý 8 lỗi tồn đọng trên hệ thống Deeplove Studio V2**:
   - Lỗi 1: "Câm nín" (Silent Failure) trên UI khi Task lỗi (không hiển thị `task.error`).
   - Lỗi 2: Mismatch tên trường `currentStep` vs `pipelineStage`.
   - Lỗi 3: `/tasks/bulk` chưa fallback sang `queue.bulkAdd`.
   - Lỗi 4: `currentTaskId` bị hardcode / nhầm lẫn.
   - Lỗi 5: Thiếu HTTP 206 Partial Content Streaming cho video playback.
   - Lỗi 6: Rò rỉ file tạm multipart khi request bị hủy hoặc lỗi mạng.
   - Lỗi 7: Thiếu kênh đẩy log realtime trực tiếp qua Socket.io.
   - Lỗi 8: Nâng cấp trực quan thẻ chi tiết lỗi và nút Retry.
2. **Thêm nút Tiếp Tục hàng chờ (`▶️ Tiếp Tục` / Resume)** khi hàng chờ ở trạng thái `isPaused`.
3. **Dọn dẹp lịch sử task test rác và reset dữ liệu sử dụng `byteplus_usage.json`**.
4. **Audit logic hàng chờ & concurrency của KIE API**:
   - Xác nhận cơ chế Queue FIFO và luồng Import hàng loạt.
   - Kiểm tra tài liệu chính thức Kie.ai: hỗ trợ **100+ concurrent running tasks** và tốc độ **20 requests / 10s**.
5. **Sửa lỗi chiều rộng web bị to / tràn ngang (overflow-x) & đưa về Full Màn Hình 100%**:
   - Loại bỏ hoàn toàn thanh cuộn ngang của trình duyệt trên mọi độ phân giải màn hình.
   - Trải đều giao diện 100% viewport width, tối ưu hóa các thẻ thống kê và mở rộng terminal logs.
6. **Nâng số luồng xử lý đồng thời lên 10 video cùng lúc**:
   - Cấu hình `KIE_MAX_CONCURRENCY=10` trong `.env` và `.env.example`.

---

## 2. ROOT CAUSE & IMPLEMENTATION

### 2.1 8 Lỗi Tồn Đọng & Nút Resume Hàng Chờ
- **Root cause 1 (Silent Failure):** UI `studio.js` chỉ render trạng thái FAILED mà không đọc `task.error`, khiến người dùng không biết lý do lỗi (ví dụ: thiếu API Key).
  - *Fix:* Thêm `task.error.code` và thẻ cảnh báo đỏ `task-err-detail` hiển thị trọn vẹn `task.error.message`.
- **Root cause 2 (Mismatch pipelineStage):** Backend lưu `task.pipelineStage` nhưng UI đọc `task.currentStep`.
  - *Fix:* Hàm `getStageLabel(task)` chuẩn hóa đọc ưu tiên `task.pipelineStage` rồi mới fallback `task.currentStep`.
- **Root cause 3 (Bulk Add Fallback):** Route `/tasks/bulk` khi không có provider thì fail thay vì dùng `queue.bulkAdd()`.
  - *Fix:* Đồng bộ fallback qua `queue.bulkAdd()`.
- **Root cause 4 (currentTaskId):** Biến quản lý task đang chạy bị gán cứng.
  - *Fix:* Đọc động từ danh sách active tasks của `queue_manager`.
- **Root cause 5 (HTTP 206 Streaming):** Route output video chỉ trả HTTP 200 toàn bộ file khiến trình duyệt không tua (seek) được video MP4.
  - *Fix:* Hỗ trợ header `Range` với mã HTTP `206 Partial Content` và `Content-Range`.
- **Root cause 6 (Multipart Leak):** File upload tạm không được dọn dẹp nếu stream bị abort giữa chừng.
  - *Fix:* Thêm listener `req.on('aborted')` và khối `finally` tự động xóa file tạm.
- **Root cause 7 (Socket Terminal Logs):** Logs server chỉ ghi ra console mà không emit ra client.
  - *Fix:* Queue manager emit sự kiện `byteplus:log` tới namespace `/byteplus`.
- **Nút Resume hàng chờ:**
  - Nút `#btn-pause` trong `studio.js` và `index.html` được chuyển thành nút toggle hai chiều:
    - Khi đang chạy: hiển thị `⏸ Tạm Dừng`.
    - Khi tạm dừng (`isPaused: true`): chuyển thành `▶️ Tiếp Tục` (màu xanh dương) để người dùng tiếp tục xử lý hàng chờ mà không phải bấm Dừng rồi Bắt Đầu lại từ đầu.

### 2.2 Lỗi Tràn Chiều Rộng Web (Overflow-x) & Full Màn Hình
- **Root cause:**
  - Trong `studio.css`, `.main-layout` đặt `grid-template-columns: 440px 1fr;`. Theo CSS Grid spec, `1fr` có kích thước tối thiểu mặc định là `minmax(auto, 1fr)`.
  - Bảng `.data-table` trong `.panel-right` có nội dung rộng (chuỗi prompt, thông báo lỗi, các nút thao tác). Do thiếu `min-width: 0`, cột bên phải bị phình to ra tới **1602px**.
  - Tổng chiều rộng của trang bị đẩy lên tới **2090px - 2246px**, gây ra thanh cuộn ngang trình duyệt.
  - Ngoài ra, `.app-container` bị gán cứng `max-width: 1560px` khiến trên màn hình lớn bị thừa khoảng trống hai bên.
- **Implementation:**
  1. `public/studio/studio.css`:
     - Khóa tràn ngang cấp root: `html, body { max-width: 100%; overflow-x: hidden; }`.
     - Chuyển `.app-container` thành `width: 100%; max-width: 100%; margin: 0 auto;`.
     - Cập nhật grid: `.main-layout { display: grid; grid-template-columns: 460px minmax(0, 1fr); gap: 24px; width: 100%; }`.
     - Thêm `min-width: 0; max-width: 100%;` cho `.panel-left`, `.panel-right`, và `.card`.
     - Tối ưu bảng: `.table-container { width: 100%; max-width: 100%; overflow-x: auto; }` và `.task-err-detail { word-break: break-word; max-width: 340px; }`.
     - Dàn đều `.stats-bar`: `grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));`.
     - Mở rộng Live Logs: `.monitor-grid { grid-template-columns: 1fr; }` để màn hình terminal phủ kín toàn bộ thẻ monitor.

### 2.3 Nâng Cấp Concurrency KIE AI (10 Video Cùng Lúc)
- **Investigation từ docs.kie.ai**:
  - KIE AI hỗ trợ **hơn 100 tác vụ song song (100+ concurrent running tasks)**.
  - Rate limit endpoint tạo task: **20 requests mới mỗi 10 giây**.
- **Implementation:**
  - Cập nhật `.env`: `KIE_MAX_CONCURRENCY=10`.
  - Cập nhật `.env.example`: `KIE_MAX_CONCURRENCY=10`.
  - Khởi động lại daemon server (`task-3649`).
  - Xác nhận `config.maxConcurrency === 10`. Hàng chờ tự động lấy tối đa 10 task cùng lúc để dispatch sang Kie.

---

## 3. VERIFICATION & RUNTIME EVIDENCE

1. **Test Suite**:
   - `node tests/runner.js` → **164/164 PASS** (100%), **0 live paid calls**.
2. **Kiểm tra độ rộng màn hình thực tế (Puppeteer)**:
   - `1920x1080 (Full HD)`: `docScrollWidth: 1920px` (win: 1920px) → **✅ VỪA KHÍT (0 cuộn ngang)**.
   - `1600x900`: `docScrollWidth: 1600px` (win: 1600px) → **✅ VỪA KHÍT (0 cuộn ngang)**.
   - `1440x900 (MacBook)`: `docScrollWidth: 1440px` (win: 1440px) → **✅ VỪA KHÍT (0 cuộn ngang)**.
   - `1366x768 (Laptop)`: `docScrollWidth: 1366px` (win: 1366px) → **✅ VỪA KHÍT (0 cuộn ngang)**.
   - `1280x800`: `docScrollWidth: 1280px` (win: 1280px) → **✅ VỪA KHÍT (0 cuộn ngang)**.
   - Cả 3 tab (Task Đơn Lẻ, Import Hàng Loạt, Quản lý Tín dụng) đều kiểm tra thành công với `docScrollWidth === window.innerWidth`.
3. **Ảnh chụp màn hình Artifacts**:
   - `deeplove_final_1920.png`: Giao diện Full HD 1920x1080 full màn hình.
   - `deeplove_final_1366.png`: Giao diện Laptop 1366x768 vừa vặn không thanh cuộn ngang.
   - `control_card_paused_resume.png`: Nút toggle `▶️ Tiếp Tục` khi queue tạm dừng.
4. **Backup**:
   - Lưu tại: `docs/BACKUPS/2026-09-09/task-deeplove-fullscreen-concurrency/`.
