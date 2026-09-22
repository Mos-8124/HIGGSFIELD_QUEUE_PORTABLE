# HANDOFF SNAPSHOT — 2026-09-16 #001

## 1. TASK IDENTIFIER & SCOPE
- **Task**: `task-ui-light-theme-sync-and-flowq-db-isolation`
- **Scope**:
  - `public/studio/flow-queue.html`, `public/studio/flow-queue.css`
  - `public/studio/studio.css`, `public/studio/video-to-video.css`
  - `byteplus/google_flow/queue.js`, `tests/google_flow.test.js`
  - `byteplus/video_studio/index.js`, `public/studio/video-to-video.js`, `tests/video_studio.test.js`
  - `docs/AI_RULES/HANDOFF.md`

## 2. KEY CHANGES & IMPLEMENTATION DETAILS

### 2.1 Video to Video Studio Flow & Input Fixes (`task-v2v-project-flow-and-inputs-fix`)
- **Default Step on Project Creation**: Khi user tạo project mới, hệ thống tự động load vào Step 1 (`v2v-input-panel`) thay vì giữ nguyên active step từ session cũ (xử lý qua `loadProjects(preferredId)` và `selectProject(id, preferredStep)`).
- **Search Dự Án**: Bổ sung ô tìm kiếm tức thì vào dropdown danh sách dự án (`#v2v-project-select-search`).
- **Linh hoạt Input trước AI**: Cho phép thay đổi video đối thủ và video hook tự do khi project chưa phân tích AI ở bước 2; chuyển trạng thái FSM an toàn (`library_ready` / `failed` -> `reference_imported`).
- **Fix POST `/projects/:id/inputs`**: Bổ sung fallback file detection khi request gửi thiếu tham số, không còn báo lỗi cập nhật video rỗng.
- **TDD**: Thêm Tier 2 test cho `/projects/:id/inputs` trong `tests/video_studio.test.js`.

### 2.2 Google Flow DB Isolation & Cleanup (`task-flowq-db-isolation-fix`)
- **Nguyên nhân sự cố**: `tests/google_flow.test.js` trước đó khởi tạo trực tiếp `new FlowQueue()` mà không cô lập đường dẫn DB test, ghi đè media giả (`img1`, `vid1` -> `1.mp4`) và chèn 39 job test vào file production `flow_outputs/flow_queue_db.json`. Khi worker chạy quét disk không thấy `1.mp4` đã đánh dấu fail 39 job.
- **Khắc phục**:
  - Tái cấu trúc `byteplus/google_flow/queue.js` hỗ trợ Dependency Injection `{ flowRoot, store }`.
  - Cập nhật toàn bộ test trong `tests/google_flow.test.js` sử dụng `tmpFlowRoot(...)` ở thư mục tạm tự hủy.
  - Dọn sạch 39 job rác trong `flow_outputs/flow_queue_db.json` (đã backup `flow_queue_db.json.bak`), phục hồi các bản ghi media thật.
  - Xác nhận toàn bộ 9 video gen thành công trước đó nguyên vẹn trên ổ đĩa và phát tốt (HTTP 200).

### 2.3 UI/UX Light Theme Synchronization (`task-ui-light-theme-sync`)
- **Flow Queue (`/byteplus/Flowqueue`)**:
  - Nhúng `studio.css` vào `public/studio/flow-queue.html` để thừa hưởng toàn bộ design tokens và engine chuyển theme.
  - Bổ sung bộ quy tắc `:root[data-theme="light"]` trong `public/studio/flow-queue.css` cho toàn bộ giao diện: Header, Card, Input, Textarea, Bảng Job, Badge, Frame Slots, Thumbnails, và Log terminal.
  - Giữ nguyên 100% theme dark mặc định.
- **AI Studio Hub & Queue Table (`/byteplus`)**:
  - `#logs-container` / `.terminal-logs`: Nền trắng `#ffffff`, viền nhẹ `var(--border-color)`, chữ log info màu tối dễ đọc, scrollbar track nền trắng.
  - `#cost-breakdown-card`: Nền trắng `#ffffff`, viền nhẹ, đổ bóng thẻ card `var(--shadow-card)`.
  - `#active-task-badge` / `.task-badge.idle`: Nền trắng `#ffffff`, viền `var(--border-color)`.
  - Media thumbnails & tags trong queue table (`#queue-table-body td.prompt-cell .ref-media-item`, `.ref-thumb-wrap`, `.ref-thumb`): Nền trắng `#ffffff`, viền xám sáng, hover highlight.
- **Video to Video Studio (`/byteplus/video-to-video`)**:
  - `#v2v-hook-dropzone` & `#v2v-ref-dropzone`: Mặc định nền trắng `#ffffff`, viền nét đứt; chỉ khi user hover mới hiển thị màu highlight.
  - `#v2v-project-select-trigger`: Mặc định nền trắng `#ffffff`; hover hiển thị nền `#f6f3fc` viền tím `#7567ef`; menu dropdown và search box nền trắng `#ffffff`.
  - `#v2v-stepper`: Nền trắng `#ffffff`, badge số bước xám sáng/tím rõ nét.
  - `#v2v-final-review-panel` & `.v2v-subpanel`: Nền trắng `#ffffff`, viền card đồng bộ.

## 3. VERIFICATION & METRICS
- `node tests/runner.js`: **254/254 tests PASSED (100%)**
  - Tier 1: 72/72
  - Tier 2: 103/103
  - Tier 3: 51/51
  - Tier 4: 28/28
- Dashboard Server: HTTP 200 trên port 20140 (HQ_PORT).
- Google Flow Chrome CDP: Port 9334 kết nối ổn định (PID 28028).
