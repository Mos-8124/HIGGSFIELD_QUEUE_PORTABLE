# HANDOFF SNAPSHOT 004 — 2026-09-15

**Task:** `task-emoji-svg-phase1` (Phase 1 của yêu cầu "cả hai, tuần tự": SVG icon trước → inline-style sau).
**Vai trò:** Quản lý = phiên chính (Opus 4.8). Implement = 2 sub-agent `general-purpose` model **sonnet** (1a, 1b).
**Scope:** V2 studio. KHÔNG đụng V1.

---

## 1. Mục tiêu
Thay emoji dùng làm ICON → inline SVG (Lucide) để iconography nhất quán + hết finding "emoji as icons" của bản quét ui-ux-pro-max.

## 2. Runtime `public/studio/icons.js` (MỚI)
- Classic browser script (không module). `ICONS = { name: '<svg…>' }` — 55 icon Lucide.
- SVG: `viewBox=0 0 24 24`, `stroke=currentColor`, `fill=none`, `stroke-width=2`, `width/height=1em`, `vertical-align:-0.125em`, `aria-hidden=true`, `focusable=false` → thừa kế cỡ + màu chữ.
- `hydrate(root)`: mỗi `[data-icon]` chưa xử lý → set innerHTML = ICONS[name] (unknown → warn, không ném). Guard `data-icon-done`.
- Chạy lúc `DOMContentLoaded` + `MutationObserver` toàn document → tự hydrate icon do JS chèn sau. Expose `window.GTFIcons`. Bọc try/catch.

## 3. Phase 1a — HTML tĩnh (sub-agent #1)
- Thay 41 glyph emoji-icon trong `video-to-video.html`, `index.html`, `flow-queue.html` → `<span data-icon="…" aria-hidden>`; giữ class/id/text/layout.
- Nạp `<script src="/studio/icons.js">` ở cả 3 trang.
- Xử lý 1 edit ngoài luồng (session khác thêm block Step-1 có emoji) → chuyển nốt.
- Backup: `docs/BACKUPS/2026-09-15/task-emoji-svg-phase1a/`.

## 4. Phase 1b — JS render + a11y (sub-agent #2)
- Icon do JS sinh (`video-to-video.js` ~28, `studio.js` ~20, `flow-queue.js` 8) → `data-icon` (MutationObserver hydrate).
- **GIỮ nguyên emoji TEXT trạng thái** trong toast/message (✓ ✕ ❌ ✅ ⚠ 🎉 trong câu, STAGE_LABELS, pill tiến trình, `title=` attr, `<option>` text, chỗ dựng từ dữ liệu user chưa escape — tránh XSS).
- Thêm 14 icon mới vào icons.js: clock, ruler, tag, lock, play, pause, anchor, type, corner-up-left, star, arrow-up, arrow-down, paperclip, trash.
- **Vá a11y:** 9 `<button>` icon-only từng bị `aria-hidden` (lỗi 1a) → bỏ aria-hidden khỏi nút, chuyển vào `<span data-icon aria-hidden>` con, thêm `aria-label` (từ title/context). dropzone-clear có `aria-label="Gỡ video này"`.
- Backup: `docs/BACKUPS/2026-09-15/task-emoji-svg-phase1b/`.

## 5. TDD (tests/ui_a11y.test.js)
- Suite "UI/UX Icon System — Phase 1a": icons.js có hydration + ≥10 `<svg>` + aria-hidden; 3 HTML nạp icons.js; 3 HTML hết 41 glyph emoji-icon; mọi `data-icon` có định nghĩa.
- Suite "UI/UX Icon System — Phase 1b": không `<button aria-hidden="true">`; nút dropzone-clear có aria-label; 3 JS có ≥1 `data-icon`.
- Đăng ký sẵn trong runner.js (suite ui_a11y). RED→GREEN cả hai lượt.

## 6. Verify
- **npm test 237/237** (0 regression).
- Browser thật (http://localhost:20140/byteplus/video-to-video): **127/127 `[data-icon]` hydrate SVG** (48 tĩnh + 79 động), 0 unresolved, `window.GTFIcons` có, console 0 lỗi, screenshot render sạch — icon line đơn sắc đồng bộ.
- Static asset served trực tiếp từ disk → KHÔNG cần restart.

## 7. Còn lại — Phase 2 (chưa làm)
Gom inline-style (HTML `style=` + JS template) → class/token CSS. RẤT LỚN & rủi ro layout (JS ~100k dòng) → làm **PILOT trang video-to-video** trước, verify kỹ (test + render/screenshot), rồi mới nhân rộng index/flow-queue.

## 8. Ghi chú
- `byteplus/video_studio/index.js` bị 1 session khác sửa trên disk trong lúc làm (không thuộc task này) — KHÔNG revert.
- icons.js có thể mở rộng: chỉ cần thêm entry vào ICONS + dùng `data-icon="tên"` ở bất kỳ đâu (kể cả JS render) là tự hydrate.
