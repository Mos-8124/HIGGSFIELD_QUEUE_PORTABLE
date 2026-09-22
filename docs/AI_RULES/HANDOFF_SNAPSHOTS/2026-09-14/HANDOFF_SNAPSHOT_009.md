# HANDOFF SNAPSHOT 009 — HOÀN THIỆN TỰ ĐỘNG HÓA GOOGLE FLOW & GIỚI HẠN THAM CHIẾU

- **Ngày thực hiện:** 2026-09-14
- **Cổng làm việc:** http://localhost:20140/byteplus & http://localhost:20140/byteplus/Flowqueue
- **Chrome CDP:** http://127.0.0.1:9334 (Flow Workspace)
- **Kết quả kiểm thử:** 196/196 tests PASS (100%)

---

## 1. Yêu cầu đã thực hiện

1. **Ràng buộc số lượng media tham chiếu:**
   - Hệ thống giới hạn **tối đa 3 ảnh** input (.jpg, .png, .webp, v.v.).
   - Hệ thống giới hạn **tối đa 1 video** tham chiếu (.mp4 <= 10s). Flow chỉ hỗ trợ 1 video làm tham chiếu một lúc.
   - Chế độ **Frames** (videoInputMode = 'frames'): Tối đa 2 ảnh (khung đầu + khung cuối), từ chối video.
   - Đã cập nhật validate chặt chẽ ở cả Frontend (public/studio/flow-queue.js, flow-queue.html) và Backend (byteplus/google_flow/queue.js).

2. **Tự động hóa hoàn toàn quy trình sinh video trên Google Flow (runner.mjs):**
   - **Tải media:** Nhận diện và click menu Trình đơn thêm nội dung nghe nhìn (+) -> click Tải lên -> đón sự kiện filechooser của Playwright -> nạp file -> đợi upload settle.
   - **Cấu hình tham số:** Tự động mở popover cài đặt (findFlowSettingsTrigger) -> chọn radio mode (Video / Hình ảnh), video input mode (Thành phần / Khung hình), aspect ratio (16:9, 9:16), model (Omni 1.1 Flash, v.v.), duration (4 giây, 6 giây, 8 giây, 10 giây), variants (x1..x4) -> đóng popover (có fallback phím Escape).
   - **Đính kèm tham chiếu vào prompt:** Tự động click button.add-menu-trigger (Thêm thành phần vào ô nhập câu lệnh) -> tìm asset tương ứng theo tên file -> click chèn chip @... vào prompt bar.
   - **Điền prompt:** Điền nội dung câu lệnh vào ProseMirror editor của Flow.
   - **Kích hoạt sinh video:** Kiểm tra nút Tạo (flowCreateButton), xác nhận không bị disabled và bấm tạo.
   - **Tải kết quả:** Lắng nghe network response song song với cơ chế tải buffer trực tiếp bằng page.request.get(src) từ thẻ <video> trên DOM (tránh triệt để lỗi CORS của browser) -> lưu vào thư mục flow_outputs/outputs/<job_id>/.

---

## 2. Các file đã chỉnh sửa

- byteplus/google_flow/runner.mjs
- byteplus/google_flow/queue.js
- public/studio/flow-queue.html
- public/studio/flow-queue.js
- tests/google_flow.test.js
