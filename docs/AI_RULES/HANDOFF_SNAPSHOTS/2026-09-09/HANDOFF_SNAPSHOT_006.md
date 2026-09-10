# HANDOFF SNAPSHOT 006

Date: 2026-09-09
Task: `task-deeplove-kol-fixes`

---

## 1. USER REQUEST & SCOPE

1. Đổi route cổng sang `http://localhost:20140/deeplove` (hỗ trợ cả `/Deeplove` và fallback `/byteplus`). Cập nhật gateway.
2. Fix triệt để lỗi 🔴 Hỏng Thật:
   - Sửa lỗi Form Duration gửi `"4s"` / `"5s"` / `""` khiến backend `Number("4s") = NaN` (HTTP 422: "Thoi luong phai tu 4 den 30 giay").
   - Gỡ bỏ nút "Đồng bộ video" (`#btn-sync-videos`) gọi route 404 `/api/byteplus/queue/sync-videos`.
3. Bổ sung mục "👤 Nhân Vật KOL Ảo" vào giữa mục Ảnh tham chiếu và Video tham chiếu (3 mục: Ảnh, KOL, Video), có dropdown chọn KOL, modal tạo nhanh, preview card và lưu DB `byteplus_kol_library.json`.
4. Khôi phục nút `▶️ Xem` và `⬇️ Tải` trên UI cho video hoàn thành.
5. Kết nối Socket.IO `byteplus:task-updated` để hiển thị % tiến độ thời gian thực cho từng task.
6. Dọn dẹp payload và API V1 thừa (`unlimited`, `creditMode`, `cliModel`, `model`, polling cdp/cli).
7. Giải đáp chi tiết vị trí lưu video, cơ chế import hàng loạt, lịch sử và monitor box.

---

## 2. CHANGES IMPLEMENTED

| File | Nội dung thay đổi |
|---|---|
| `server.js` | Mount `app.get(['/deeplove', '/Deeplove', '/byteplus'], ...)` phục vụ `public/studio/index.html`. |
| `public/gateway.html` | Đổi link và label sang `/deeplove`, dọn dẹp text BytePlus. |
| `byteplus/task_factory.js` | Phòng thủ chiều sâu: ép kiểu duration tự động gọt đuôi `s` (`replace(/s$/i, '')`), fix default 16s. |
| `byteplus/routes.js` | Nhận `body.kolId`, tra cứu `kolLibrary.get(kolId)` và thêm tham chiếu `{ type: 'kol', kolId }` vào task. |
| `byteplus/queue_manager.js` | Gán `task.videoUrl = task.outputWebPath` khi task completed để tương thích giao diện. |
| `public/studio/index.html` | - Thêm section "👤 Nhân Vật KOL Ảo" kèm dropdown, nút thêm mới, preview card giữa Ảnh và Video.<br>- Đổi toàn bộ option duration thành số nguyên `4`–`30`, default `value="16"`.<br>- Dọn dẹp nhãn 720p (HD).<br>- Gỡ bỏ `#btn-sync-videos`. |
| `public/studio/studio.js` | - Khôi phục hiển thị nút `▶️ Xem` và `⬇️ Tải`: đọc `task.outputWebPath \|\| task.videoUrl \|\| task.outputUrl`.<br>- Lắng nghe `byteplus:task-updated` cập nhật tiến độ realtime và bảng hàng chờ.<br>- Gỡ bỏ 4 listener V1 chết và các cuộc gọi thăm dò `/api/cli/models`, `/api/cdp/status`.<br>- Dọn payload submit: bỏ `unlimited`, `creditMode`, `cliModel`, `model`.<br>- Viết controller thư viện KOL: tải danh sách, modal tạo KOL, preview thumbnail/mô tả. |

---

## 3. VERIFICATION & RUNTIME EVIDENCE

1. **Unit & Integration Suite**:
   - Chạy: `node tests/runner.js`
   - Kết quả: **164/164 PASS** (100%), **0 live paid calls**.
2. **Runtime Endpoints**:
   - `GET http://localhost:20140/deeplove` → **HTTP 200**
   - `GET http://localhost:20140/Deeplove` → **HTTP 200**
   - `GET http://localhost:20140/byteplus` → **HTTP 200** (fallback tương thích ngược)
3. **Browser Verification**:
   - Headless Chrome truy cập `http://localhost:20140/deeplove`: **0 console errors, 0 network errors**.
   - Mục "👤 Nhân Vật KOL Ảo" hiển thị chuẩn vị trí (dưới Ảnh, trên Video).
   - Nút `▶️ Xem` và `⬇️ Tải` hiển thị đầy đủ trên mọi task completed.
   - Chụp màn hình artifact xác nhận: `deeplove_rendered.png`.
4. **Backup Filesystem**:
   - Lưu tại: `docs/BACKUPS/2026-09-09/task-deeplove-kol-fixes/`.
   - Giữ nguyên vẹn relative paths.
