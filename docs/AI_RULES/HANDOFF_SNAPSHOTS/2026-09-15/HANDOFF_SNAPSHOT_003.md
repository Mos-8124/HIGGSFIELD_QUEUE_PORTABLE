# HANDOFF SNAPSHOT 003 — 2026-09-15

**Task:** `task-ui-a11y-audit-fixes`
**Vai trò:** Quản lý = phiên chính (Opus 4.8). Implement = sub-agent `general-purpose` model **sonnet** (TDD GREEN).
**Scope:** V2 studio UI. KHÔNG đụng V1 Higgsfield Classic.

---

## 1. Yêu cầu (verbatim)

> "cài skill này https://github.com/nextlevelbuilder/ui-ux-pro-max-skill sau đó dùng skill này quét 1 lần UI Ux của mình"
> "tôi nhận thấy mỗi trang trong domain 1 kiểu . khả năng style không nằm trong css . còn lại nên sửa luôn /tdd spawn sub agent với model phù hợp để làm . bạn là người quản lý"

## 2. Cài skill
- Clone `nextlevelbuilder/ui-ux-pro-max-skill` → copy vào dự án:
  - `.claude/skills/` (7 skill: **ui-ux-pro-max v2.13.0**, design-system, design, ui-styling, brand, banner-design, slides)
  - `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`
- Tool search Python OK (Python 3.14.6):
  `python ".claude/skills/ui-ux-pro-max/scripts/search.py" "<query>" --domain <domain>`
- Kích hoạt auto-list trong Claude Code: mở lại phiên hoặc `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` (terminal tương tác).

## 3. Kết quả quét (một lần)
- **Phát hiện gốc:** style phần lớn INLINE — HTML `style=` (34/65/19 ở v2v/index/flow), JS sinh thêm (~59/74/34), **0 `<style>` block** → mỗi trang một kiểu, fix chỉ-CSS không đủ.
- Chấm theo bảng ưu tiên ui-ux-pro-max: #1 Focus (CRITICAL), #2 reduced-motion (HIGH), #3 emoji-as-icon (HIGH), #4 responsive (HIGH, desktop tool → hoãn), #5 font <12px (MEDIUM → hoãn), touch-target ĐẠT chuẩn web 24px.

## 4. TDD
- `tests/ui_a11y.test.js` — suite "UI/UX Accessibility Pass (ui-ux-pro-max audit)", 10 test tĩnh đọc CSS/HTML:
  - T1 (×4): `video-to-video.css`/`flow-queue.css` không còn `outline:none` trần + có focus ring (box-shadow/outline solid).
  - T2 (×3): `studio.css`/`v2v.css`/`flow-queue.css` chứa `prefers-reduced-motion`.
  - T3 (×3): emoji trang trí trong 3 HTML tĩnh đều đứng ngay sau `aria-hidden="true">`.
- Đăng ký trong `tests/runner.js` (import + gọi sau `runGoogleFlowTests`).
- RED xác nhận: 219 test, 210 pass, 9 fail → sau fix GREEN 219/219.

## 5. Fix (sub-agent, trong allowlist 6 file)
- `public/studio/video-to-video.css` — 4 `outline:none` → box-shadow ring `0 0 0 3px rgba(117,103,239,.35)`; +block reduced-motion.
- `public/studio/flow-queue.css` — 1 `outline:none` → ring; +block reduced-motion.
- `public/studio/studio.css` — +block reduced-motion (focus ring vốn đã đúng).
- `public/studio/video-to-video.html` — bọc `aria-hidden="true"` cho 36 emoji.
- `public/studio/index.html` — 37 emoji.
- `public/studio/flow-queue.html` — 16 emoji (gồm 2 `<option>`).
- **Sai lệch nhỏ đã flag:** emoji 🔍 trong 2-3 `placeholder=` (ô tìm kiếm) không thể bọc aria-hidden (attribute không chứa markup); sub-agent gỡ glyph 🔍 (giữ nguyên chữ còn lại). Đúng hướng "no emoji as icons" nhưng là thay đổi hiển thị → chờ user xác nhận giữ/khôi phục.
- Ghi chú: `placeholder="Tên dự án *"` (thêm dấu *) là do session KHÁC sửa file untracked, KHÔNG phải task này.

## 6. Verify
- **npm test 219/219** (0 regression; +10 test mới). `grep outline:none` trong 2 CSS = rỗng.
- Static asset live không cần restart: CSS served có `prefers-reduced-motion` + `box-shadow 0 0 0 3px rgba(117…`; HTML served `aria-hidden="true"` = 36.

## 7. Chưa làm (cần quyết định thiết kế — KHÔNG gom mù vì rủi ro/refactor lớn)
1. Thay emoji → SVG icon set (Lucide) trong **JS template** (~41 chỗ sinh động) → cần chọn bộ icon.
2. Gom inline-style → class/token CSS (refactor JS ~100k dòng, rủi ro layout) → gốc rễ "mỗi trang một kiểu".
3. Bump font <12px (0.65–0.68rem/11px) ≥12px → rủi ro tràn chip, cần verify layout thật.
4. Responsive breakpoint (v2v.css 0 @media) → chỉ cần nếu dùng tablet/mobile.

## 8. Backup
`docs/BACKUPS/2026-09-15/task-ui-a11y-audit-fixes/public/studio/` (6 file: video-to-video.css, flow-queue.css, studio.css, video-to-video.html, index.html, flow-queue.html).
