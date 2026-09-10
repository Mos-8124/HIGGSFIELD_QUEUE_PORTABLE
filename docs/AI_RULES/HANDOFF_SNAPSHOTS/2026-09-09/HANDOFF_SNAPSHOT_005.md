# HANDOFF SNAPSHOT 005

Date: 2026-09-09
Task: `task-usage-tab-fix-480p` & `audit-gtf-system`

---

## 1. FIX UI: TAB QUẢN LÝ TÍN DỤNG & OPTION 480P (RUNTIME CONFIRMED)

### User Request
> Sửa lỗi logic: bấm vào Quản lý tín dụng thì Import hàng loạt và Task đơn lẻ không hiện UI, phải F5.
> Và chưa có option 480p để user chọn.

### Root Cause & Fix
- **Nguyên nhân**: Tab ẩn/hiện bằng class `.tab-content.active` (CSS), nhưng 3 handler của tab usage lại gán inline `style.display='none'` lên `#single-form` và `#bulk-tab`. Inline style đè lên class CSS nên khi quay lại tab, class `active` được gán nhưng vẫn bị `display:none` che khuất.
- **Sửa**:
  - `public/studio/index.html`: Bỏ inline `style="display:none"` khỏi `#usage-tab`; bổ sung option 480p vào `#resolution` và `#bulk-resolution`.
  - `public/studio/studio.js`: Xóa 3 handler inline-style; việc chuyển tab do handler chung của `.tab-btn` và CSS class quản lý; thêm listener change cho `#bulk-resolution` để cập nhật bảng giá live.
- **Verified**:
  - Chuyển tab qua lại mọi hướng hiển thị tức thì, không cần F5.
  - 480p hiển thị đúng ở cả 2 form; bảng giá tính đúng 28 cr/s theo bảng giá Kie Seedance 2.5.
- **Backup**: `docs/BACKUPS/2026-09-09/task-usage-tab-fix-480p/`

---

## 2. AUDIT TÀN DƯ BYTEPLUS (BÁO CÁO)

| Nhóm | Tàn dư | Mức độ & Ghi chú |
|---|---|---|
| **URL/Route** | `/byteplus`, prefix `/api/byteplus/*` (14 chỗ trong UI), namespace socket `/byteplus` + event `byteplus:*` | Cần sync đồng bộ UI + backend + client bookmark khi đổi. Nên làm 1 task riêng. |
| **Tên code** | Thư mục `byteplus/`, class `ByteplusQueueManager`, `byteplusMultipart` | Cosmetic, đổi an toàn nhưng chạm nhiều import. |
| **Data files** | `byteplus_queue_db.json`, `byteplus_kol_library.json`, `byteplus_usage.json`, `byteplus_uploads/`, `byteplus_outputs/`, `byteplus_mock_jobs.json` | Cần migration path trong config khi rename. |
| **Text hiển thị** | `gateway.html:164` "MOCK — BytePlus API chưa được cấu hình" | Nhẹ, sửa 1 dòng text. |
| **Config** | `BYTEPLUS_MODE` tương thích ngược; `.env.example` còn nguyên section BytePlus/OpenRouter | Giữ làm fallback an toàn. |
| **.env** | Đã sạch 100% — toàn bộ biến `BYTEPLUS_*` đã được xóa. | Hoàn tất. |

---

## 3. AUDIT HỆ THỐNG MỚI (PHÁT HIỆN LỖI & TỒN ĐỌNG)

### 🔴 Lỗi Chặn Chính (Critical Blocker - Cần fix ngay):
1. **Submit task từ UI form hỏng 100%**:
   - Form dropdown duration gửi chuỗi `"4s"` / `"5s"` / `""` (format thừa hưởng từ V1).
   - Backend Kie yêu cầu số nguyên `4-30` → `Number("4s") = NaN` → Mọi request submit từ UI (cả single form lẫn bulk) bị trả về lỗi **HTTP 422: "Thoi luong phai tu 4 den 30 giay"**.
   - Các task chạy thành công trong ngày hôm nay là do test runner gửi trực tiếp số nguyên, form UI thực tế chưa tạo được task thành công.
2. **Nút "Đồng bộ video" (đang ẩn) gọi route 404**:
   - Gọi `/api/byteplus/queue/sync-videos` — route này không tồn tại trong backend.

### 🟡 Chức Năng Mồ Côi / Lệch Pha (Dormant & Technical Debt):
1. **KOL Library mất UI**: Backend có `/api/byteplus/kols` và `LocalKolAssetProvider` đầy đủ, nhưng UI mới không còn dropdown/selector để chọn KOL.
2. **Settings + History mất UI**: Backend có `/settings`, `/history` nhưng không màn hình nào gọi để xem trạng thái Kie hay cấu hình.
3. **Tiến độ % không realtime**: UI mới chỉ nghe socket event `byteplus:queue-updated`; bỏ qua `byteplus:task-updated` (chứa % tiến độ từng task). Ngược lại vẫn duy trì 4 listener V1 đã chết: `task_progress`, `live_preview`, `log`, `cdp_status`.
4. **Gọi API V1 rác từ UI mới**: UI mới vẫn gửi request tới `/api/cli/models` và `/api/cdp/status` (hệ Kie không cần).
5. **Tàn dư payload V1**: Form submit vẫn gửi các trường `unlimited`, `creditMode`, `cliModel`, `model`; label hiển thị "720p (HD - Hỗ trợ Unlimited)"; option "Mặc định (16s)" không gán value (gây NaN).

---

### 4. Đề Xuất Thứ Tự Xử Lý
1. **Ưu tiên 1**: Sửa bug duration của UI form submit (chuyển sang gửi số nguyên 4-30, fix option mặc định) để gỡ blocker tạo task.
2. **Ưu tiên 2**: Dọn dẹp nút sync-videos 404 và loại bỏ các cuộc gọi API V1 chết khỏi `studio.js`.
3. **Ưu tiên 3**: Lắng nghe `byteplus:task-updated` để phục hồi hiển thị % tiến độ realtime cho từng task.
4. **Ưu tiên 4**: Quyết định khôi phục giao diện hay cắt tỉa backend cho KOL / Settings / History.
