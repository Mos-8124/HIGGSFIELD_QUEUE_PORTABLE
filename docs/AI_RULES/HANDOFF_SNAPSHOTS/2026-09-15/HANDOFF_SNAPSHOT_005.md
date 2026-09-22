# HANDOFF SNAPSHOT 005 — 2026-09-15

**Task:** `task-inline-style-phase2` (Phase 2 của "cả hai, tuần tự" → làm hết tất cả phase).
**Vai trò:** Quản lý = phiên chính (Opus 4.8). Implement = 4 sub-agent `general-purpose` model **sonnet**.
**Scope:** V2 studio (index/video-to-video/flow-queue). KHÔNG đụng V1.

---

## 1. Mục tiêu
Gốc rễ "mỗi trang một kiểu" = màu hardcode + block style ad-hoc rải rác inline (HTML + JS), lệch khỏi hệ token. Phase 2 gom về **design token (var(--…)) + utility/component class** trong CSS đã `<link>` import.

## 2. Nguyên tắc an toàn (pixel-faithful)
- CHỈ đụng: (a) màu literal trong inline-style, (b) block inline lặp ≥2×.
- GIỮ nguyên: `display:none`/toggle (JS bật/tắt qua `.style.display` — 60× trong v2v.js), width/giá trị động `${...}`, layout one-off không màu.
- Mọi token/class mang **giá trị y hệt** literal thay thế → computed-style không đổi.

## 3. Các lượt
- **2a — video-to-video.html (pilot):** màu→token (khớp exact + thêm --accent-sky/--overlay-soft/line/divider vào studio.css); block lặp→class `.v2v-col-85`, `.v2v-filter-select` (video-to-video.css). Backup: task-inline-style-phase2a.
- **2b — index.html + flow-queue.html:** màu→token (+~26 token exact vào studio.css :root); class dùng chung: `.mb-0/.mb-8/.usage-th-pad/.usage-stat-card/.usage-stat-sub-note` (studio.css, cho index), `.fq-hint-muted/.fq-hint-tight` (flow-queue.css). Backup: task-inline-style-phase2b.
- **2c — JS:** màu literal trong `style="…"`/template literal → `var(--token)`: video-to-video.js 36, studio.js 42, flow-queue.js 3; thêm 15 token exact vào studio.css. Giữ `${}` động + logic ternary (chỉ swap hex trong nhánh). Backup: task-inline-style-phase2c-js.

## 4. TDD (tests/ui_consistency.test.js, đăng ký runner.js)
Suite "UI/UX Consistency — Phase 2 (inline-style → tokens)":
- HTML (3 trang): `assertNoInlineColor` (không #hex/rgb/rgba/hsl trong style="") + `assertNoRepeatedInline` (không block inline lặp, trừ display toggle).
- JS (3 file): `assertNoInlineColorJs` (không màu literal trong `style="…"`/`style=\`…\``; `${}` động bỏ qua).
Tất cả RED→GREEN từng lượt.

## 5. Verify
- **npm test 246/246** (0 regression; +9 test consistency).
- Tĩnh: 62 token trong studio.css; **mọi `var(--token)` dùng trong 3 JS đều có định nghĩa** (script kiểm — 0 token chết → không có màu về mặc định im lặng).
- Browser thật cả 3 trang (http://localhost:20140/byteplus, /byteplus/video-to-video, /byteplus/Flowqueue):
  - Icon hydrate hết: v2v 127, index 95, flow 65; 0 unresolved.
  - Computed-style khớp giá trị gốc (vd batch-box rgba .04/.12, badge #38bdf8, .mb-8=8px, .fq-hint-muted=#64748b).
  - Screenshot render y hệt baseline; console 0 lỗi.
- Static asset served từ disk → KHÔNG cần restart.

## 6. Còn lại (sliver, đã flag — chưa làm)
- 3 chỗ `.style.cssText = '…rgba…'` trong video-to-video.js (~1385, 1689, 1805): cơ chế DOM write trực tiếp, ngoài contract test. Có thể tokenize sau (var trong cssText vẫn chạy) — quyết định của user.

## 7. Ghi chú vận hành
- Hệ token mở rộng dễ: thêm entry `:root` trong studio.css rồi dùng `var(--tên)` ở HTML/JS/CSS.
- Icon: thêm entry vào `public/studio/icons.js` (ICONS) + `data-icon="tên"` bất kỳ đâu → MutationObserver tự hydrate.
- Nhiều file bị session khác sửa trên disk trong lúc làm (index.js…) — KHÔNG revert, coi là trạng thái hiện hành.
