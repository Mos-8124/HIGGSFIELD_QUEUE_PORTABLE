# HANDOFF SNAPSHOT 010 (2026-09-14 18:08)

## 1. Kết Quả Xác Thực Thực Tế (E2E Hoàn Toàn Tự Động)
Hệ thống Flowq (/byteplus/Flowqueue, backend port 20140, Chrome CDP 9334) đã vận hành tự động 100% không cần can thiệp thủ công:
1. **Job 1 (Hero cyberpunk):** flow_mu14d1yd_a2c26b — 720x1280 (9:16), 1.88 MB.
2. **Job 2 (Chú cún cyberpunk áo choàng):** flow_mu14wrtb_4183c8 — 720x1280 (9:16), 2.48 MB.
   - Tham chiếu: flow_mu12j1bm_25d01d-1.mp4 (video chú cún gốc).
   - Prompt: Cinematic slow motion of the golden retriever puppy wearing a sleek cyberpunk glowing cape and high-tech visor, walking forward through a vibrant neon-lit cyberpunk city at night, rain reflections on the wet asphalt, holographic billboards, 4k ultra realistic, atmospheric lighting.
   - Kết quả: File MP4 flow_mu14wrtb_4183c8-1.mp4 tại flow_outputs/outputs/flow_mu14wrtb_4183c8/.
   - Web UI endpoint: /api/google-flow/files/outputs/flow_mu14wrtb_4183c8/flow_mu14wrtb_4183c8-1.mp4 (HTTP 200 OK, 2481840 bytes).

## 2. Các Cải Tiến / Sửa Lỗi Cốt Lõi Đã Triển Khai
1. **Khắc phục triệt để timeout do backdrop menu cài đặt (runner.mjs):**
   - Thay vì tìm button[aria-label*="cài đặt" i] (ăn nhầm vào nút Display Settings góc trên gây backdrop overlay), dùng button.settings-trigger-button ở thanh prompt.
   - Khóa các tab/radio lựa chọn vào phạm vi .cdk-overlay-pane.
2. **Trích xuất video thành phẩm trực tiếp từ Canvas player (runner.mjs):**
   - Google Flow không có nút bấm "Download" hiển thị sẵn ở màn hình chính sau khi sinh video.
   - Thay vì chờ nút Download rồi ném Timeout, code tự động quét thẻ <video> mới xuất hiện trên canvas và tải file trực tiếp qua page.request.get(src) siêu nhanh.
3. **Bảo vệ tiến trình Server chống Crash (server.js & runner.mjs):**
   - Đặt process.on('unhandledRejection') và process.on('uncaughtException') tại server.js để ngăn server bị tắt đột ngột do unhandled promises từ background listeners.
   - Bọc toàn bộ onResponse trong try...catch an toàn khi có request bị abort giữa chừng.

## 3. Trạng Thái Hiện Tại
- Port 20140: LISTEN (PID chạy ngầm ổn định).
- Chrome CDP Port 9334: Kết nối tốt (connected: true).
- Toàn bộ test suite: 196/196 tests PASS (100%).
- Hàng chờ Flow: enabled: true, counts: { succeeded: 3, queued: 0, running: 0, failed: 0 }.
