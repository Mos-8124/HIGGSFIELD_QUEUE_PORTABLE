# HANDOFF SNAPSHOT 007

Date: 2026-09-09
Task: `task-usage-credit-per-task`

---

## 1. USER REQUEST & SCOPE

User: "Ko cần đâu cứu giữ đi nhưng a muốn trong cái bảng tiêu hao đấy cần phải có số credit tiêu hao của từng task nữa cơ"
1. Giữ nguyên lịch sử task và số dư (không reset).
2. Hiển thị rõ ràng số credit tiêu hao của từng task trong bảng tiêu hao (tab "Quản Lý Tín Dụng") và bảng hàng chờ ("Danh Sách Task Hàng Chờ").

---

## 2. ROOT CAUSE & IMPLEMENTATION

### Root Cause
1. Trước đây, `byteplus/usage_manager.js` chỉ ghi `estimatedCredits` khi `task.quote` được truyền tường minh. Các task bulk hoặc task không truyền quote bị gán `estimatedCredits: null` và `actualCredits: null`.
2. Trong UI `public/studio/studio.js`, nếu 2 trường này là null thì hiển thị `-` (gạch ngang), khiến bảng lịch sử tiêu hao bị trống số credit.
3. Hơn nữa, cột `Actual Credits` và `Estimated Credits` trước đây bị xếp ở vị trí cột thứ 9 và 10, trong khi giao diện panel trái chỉ rộng 440px, nên bị che khuất ra ngoài nếu không cuộn ngang.

### Implementation
1. **`byteplus/usage_manager.js`**:
   - Tự động tính `quote` qua `calculateKieQuote` nếu `task.quote` bị thiếu.
   - Đảm bảo mọi task mới ghi vào `byteplus_usage.json` luôn có đầy đủ `estimatedCredits` và `estimatedUsd`.
2. **`byteplus/routes.js`**:
   - Gắn tự động `quote` cho từng task khi thêm hàng loạt qua `/tasks/bulk` và `/queue/bulk-add`.
3. **`byteplus/providers/mock_generation_provider.js`**:
   - Khi task mock hoàn thành, trả về `billing: { creditsConsumed: quote.credits }` để mô phỏng chính xác mức tiêu hao trong môi trường test/mock.
4. **Backfill `byteplus_usage.json`**:
   - Đã cập nhật 1.035 bản ghi cũ: tự động tính `estimatedCredits` và `estimatedUsd` theo chuẩn giá Kie Seedance 2.5 (480p: 28cr/s, 720p: 63cr/s, 1080p: 114cr/s).
   - Bảo toàn nguyên vẹn 31 bản ghi test có `actualCredits: 50` thật.
5. **`public/studio/index.html` & `public/studio/studio.js`**:
   - Đưa cột **Actual Credits** và **Estimated Credits** lên ngay sau `Task Name` (vị trí 3 & 4) để người dùng mở tab là nhìn thấy ngay lập tức số credit tiêu hao mà không cần cuộn ngang.
   - Định dạng hiển thị trực quan:
     - Task hoàn thành có billing: `-${actualCredits} cr` (đỏ đậm).
     - Task hoàn thành mock: `-${estCredits} cr (ước tính)`.
     - Task đang chạy: `~${estCredits} cr (đang chạy)`.
     - Task chờ xử lý: `~${estCredits} cr (dự kiến)`.
     - Task lỗi: `0 cr (lỗi)`.
   - Cập nhật thẻ USD sang định dạng `$X.XX USD` (tránh hiểu nhầm `7.000` thành 7 nghìn).
   - Bổ sung huy hiệu tín dụng `🪙 ${taskCredits} cr` vào cột **Cấu Hình** trên Bảng Hàng Chờ (Main Queue Table).

---

## 3. VERIFICATION & RUNTIME EVIDENCE

1. **Test Suite**:
   - `node tests/runner.js` → **164/164 PASS** (100%), **0 live paid calls**.
2. **Browser Verification (Puppeteer)**:
   - Chụp ảnh `usage_table_focused.png` xác nhận cột Actual Credits và Estimated Credits hiển thị rõ ràng từng dòng:
     - `KIE Only Flow Test` → `-50 cr | 252 cr`
     - `Hero` → `-50 cr | 252 cr`
     - `Retry Paid Protection` → `-112 cr (ước tính) | 112 cr`
     - `TosFailTest` → `0 cr (lỗi) | 112 cr`
   - Bảng hàng chờ chính hiển thị huy hiệu `🪙 112 cr` / `🪙 252 cr` trên từng task.
3. **Backup**:
   - Lưu tại: `docs/BACKUPS/2026-09-09/task-usage-credit-per-task/`.
