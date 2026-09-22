# HANDOFF SNAPSHOT 002 — 2026-09-16

## Task: `task-css-sync-elevation-shadow`

### User Request
Đồng bộ CSS hệ thống `/byteplus` — áp dụng elevation shadow (pattern từ pipeline guide cards) cho tất cả card và button. flow-queue.css được tokenize toàn bộ (var(--token) thay hex hardcoded). Xóa Google Fonts khỏi index.html.

### Changes

#### 1. `public/studio/flow-queue.css` — Tokenize + Fix Bug + Light Theme + Elevation

**Tokenize (sub-agent):**
- Thay thế toàn bộ hex colors bằng `var(--token, fallback)` pattern từ studio.css :root
- Mapping: `#0b1120` → `var(--bg-primary)`, `#131a2c` → `var(--bg-card)`, `#7567ef` → `var(--accent-purple)`, v.v.
- File grew 423 → 587 dòng do light theme mở rộng

**Bug fix critical:**
- Dòng 328 thiếu `}` đóng `@media (prefers-reduced-motion: reduce)` → light theme bị kẹt trong media query, không bao giờ apply. Đã fix.

**Xóa base styles redundants:**
- Bỏ `* { box-sizing: border-box }` (đã có trong studio.css)
- Bỏ `body { background, color, font-family, min-height }` (đã có trong studio.css)
- Bỏ hardcoded `font-family` trên body

**Light theme mở rộng (~240 dòng):**
- Thêm `:root[data-theme="light"]` overrides cho toàn bộ component `.fq-*`: header, card, input, btn, job, frame-slot, thumb, badge, msg, log, disabled states

**Elevation shadow:**
- `.fq-card`: `border: 1.5px solid rgba(255,255,255,0.16); box-shadow: 0 12px 32px -4px rgba(0,0,0,0.7), 0 0 0 1px rgba(117,103,239,0.18);`
- `.fq-job`: light theme update để match elevation pattern

#### 2. `public/studio/index.html` — Xóa Google Fonts
- Bỏ 3 link tag Google Fonts (preconnect + CSS JetBrains Mono/Plus Jakarta Sans)
- HANDOFF §6: system font stack, không Google Fonts

#### 3. `public/studio/studio.css` — Elevation Shadow cho Card + Stat-card

**`.card`:**
- `border: 1.5px solid rgba(255,255,255,0.16)` (was `1px solid var(--border-color)`)
- `box-shadow: 0 12px 32px -4px rgba(0,0,0,0.7), 0 0 0 1px rgba(117,103,239,0.18)` (was `var(--shadow-card)`)

**`.stat-card`:**
- Thêm elevation shadow + border pattern giống `.card`
- Thêm `box-shadow` vào transition

**Light theme overrides:**
- `.card`, `.stat-card`: `border: 1.5px solid #d0c7e2; box-shadow: 0 12px 32px -4px rgba(45,30,80,0.12), 0 2px 8px rgba(45,30,80,0.06)`
- `#cost-breakdown-card`: cập nhật shadow match elevation pattern

### Elevation Pattern (Shared — từ pipeline guide cards)

**Dark theme:**
```css
border: 1.5px solid rgba(255, 255, 255, 0.16);
box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(117, 103, 239, 0.18);
```

**Light theme:**
```css
border: 1.5px solid #d0c7e2;
box-shadow: 0 12px 32px -4px rgba(45, 30, 80, 0.12), 0 2px 8px rgba(45, 30, 80, 0.06);
```

### Verification
- `node tests/runner.js`: **273/273 PASS (100%)**
- Không đụng V1
- Không thêm dependency

### Files Modified
- `public/studio/flow-queue.css` (tokenize + fix bug + light theme + elevation)
- `public/studio/index.html` (xóa Google Fonts)
- `public/studio/studio.css` (elevation shadow cho .card, .stat-card + light overrides)
