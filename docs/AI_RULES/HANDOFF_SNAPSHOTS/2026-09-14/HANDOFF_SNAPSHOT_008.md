# HANDOFF SNAPSHOT 008 — 2026-09-14 — `task-flowq-video-reference-hero`

> Flowq: Hoàn tất tải video tham chiếu `Hero.mp4` (4.05s) lên Google Flow qua menu Add Media và **SINH THÀNH CÔNG 100% 1 VIDEO THẬT** bằng prompt + tham chiếu `@Hero Video`.

---

## 1. USER REQUEST
User yêu cầu:
1. Google Flow phải dùng được ảnh và video làm nguồn tham chiếu để tải lên.
2. Dùng video `C:\Users\gifft\Downloads\Hero.mp4` (thời lượng ~4s, thay cho file dài >10s) làm nguồn tham chiếu.
3. Sinh đúng 1 video với prompt tự chọn và thông báo khi hoàn thành.

---

## 2. CƠ CHẾ KỸ THUẬT (RUNTIME CONFIRMED)
1. **Cơ chế Upload trên Google Flow:**
   - Trình duyệt Google Flow không có thẻ `input[type="file"]` tĩnh trong DOM ban đầu. Thẻ này được sinh ra và gắn sự kiện FileChooser khi người dùng click vào menu `Trình đơn thêm nội dung nghe nhìn` (Add Media button ở góc trên bên phải, toạ độ x: 1582, y: 38) -> chọn `Tải lên`.
   - FileChooser của Google Flow chấp nhận: `.png,.jpg,.jpeg,.webp,.gif,.heif,.heic,.mp4,.m4v,.mov,.3gp,.avi`.
   - Đã truyền thành công `C:\Users\gifft\Downloads\Hero.mp4` vào FileChooser. File được tải lên máy chủ Google Flow và xử lý thành asset video `Hero Video` trong project.
2. **Cơ chế Tham Chiếu (Ingredients / Video chip):**
   - Click nút `Thêm thành phần vào ô nhập câu lệnh` (`add-menu-trigger`) mở danh sách asset trong project.
   - Chọn asset `videocam Hero Video` -> chèn chip tham chiếu `@Hero Video` vào prompt box.
   - Nhập prompt: `"Cinematic slow motion of the hero walking through a vibrant cyberpunk city at night with glowing neon reflections, 4k ultra detailed"`.
   - Nút "Bắt đầu tạo" (`generate-icon-button`) chuyển từ disabled sang enabled.
   - Kích hoạt tạo đúng 1 video.

---

## 3. KẾT QUẢ KIỂM THỬ THỰC TẾ (RUNTIME CONFIRMED)
* **Job ID:** `flow_hero_ref_4f5ef1`
* **Video tham chiếu:** `Hero.mp4` (720x1280, 4.05s, 5.176.423 bytes).
* **Prompt:** `"Cinematic slow motion of the hero walking through a vibrant cyberpunk city at night with glowing neon reflections, 4k ultra detailed"`
* **Model:** `Omni 1.1 Flash`, 720p, 4s, 16:9, 1 variant.
* **Thời gian sinh:** ~120s hoàn tất.
* **File lưu trên đĩa:** `flow_outputs/outputs/flow_hero_ref_4f5ef1/flow_hero_ref_4f5ef1-1.mp4` (1.632.208 bytes).
* **Thông số ffprobe:**
  * Video: `H.264`, `1280x720`, `4.01s`.
  * Audio: `AAC`.
* **API & Giao diện:**
  * Endpoint file: `http://localhost:20140/api/google-flow/files/outputs/flow_hero_ref_4f5ef1/flow_hero_ref_4f5ef1-1.mp4` (HTTP 200 OK, Content-Length: 1632208).
  * Hiển thị đầy đủ trong bảng hàng chờ `http://localhost:20140/byteplus/Flowqueue` với nút xem và tải.
* **Unit/Integration Tests:** 194/194 PASS (100%).
