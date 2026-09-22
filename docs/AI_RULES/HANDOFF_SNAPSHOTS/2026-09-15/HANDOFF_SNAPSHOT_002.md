# HANDOFF SNAPSHOT 002 — 2026-09-15

**Task:** `task-prompt-v2-english-hook`
**Model:** Claude Opus 4.8
**Scope:** Video to Video Studio (V2 GTF) — prompt v2, giọng English, cho user chọn Hook.

---

## 1. Yêu cầu gốc (verbatim)

> "đổi sang giọng tiếng anh . rồi thêm 1 cái nữa ép đa dạng không phải bơm vào dùng gần đây mà để model tự chọn dựa trên sự phù hợp với kịch bản . có thể liên quan phần backend và frontend là cho người dùng chọn loại hook , nếu không chọn thì tự động thêm menu CTA , định nghĩa hook , frame work, ví dụ JSON + kiểu dữ liệu"

Giải mã 4 ý:
1. Đổi giọng TTS sang tiếng Anh.
2. Ép đa dạng KHÔNG bằng cách bơm danh sách "recently-used" mà để model **tự chọn theo độ phù hợp** với kịch bản.
3. Backend + frontend: cho user **chọn loại hook**; nếu không chọn → **auto** (model tự chọn).
4. Thêm **menu CTA**, **định nghĩa hook**, **định nghĩa framework**, **ví dụ JSON + kiểu dữ liệu** vào prompt.

---

## 2. Thay đổi theo file

### `byteplus/video_studio/voice_generator.js`
- `AVAILABLE_VOICES`: thêm 5 giọng en-US/en-GB (Aria, Guy, Jenny, Eric, Sonia) đứng trước; giữ 2 giọng vi-VN.
- `generateVoice(...)` default `voice = 'en-US-AriaNeural'`.

### `byteplus/video_studio/timeline_generator.js`
- `generateTimeline(opts)`: thêm `hookType = 'auto'`.
- `hookDirective`:
  - user chọn hook → **HOOK SELECTION (USER-LOCKED)**: segment 1 bám đúng loại hook đó.
  - `auto` → **HOOK SELECTION (AUTO)**: model phân tích angle/product/reference rồi **chọn 1 hook phù hợp nhất** (justify ở `directorNote.hookType`), không random, không lặp cùng 1 hook.
- **systemPrompt v2** (thay toàn bộ): thêm
  - **STEP 0** — định nghĩa 8 framework (AIDA, PAS, BAB, PASTOR, FAB, 4Ps, Star-Story-Solution, Hook-Retain-Reward) kèm "best for".
  - **STEP 1** — `${hookDirective}` + **HOOK TYPE MENU 19 loại có định nghĩa**.
  - **CTA MENU 7 loại** (urgency, value/offer, social-proof, curiosity, risk-reversal, identity, command) + `directorNote.ctaStyle`.
  - **OUTPUT CONTRACT** ghi rõ **kiểu dữ liệu từng field** (string/number/array) + **WORKED EXAMPLE JSON** (chỉ tham chiếu cấu trúc, cấm copy chữ).
  - VARIATION MANDATE nêu rõ: chọn theo **FIT**, không né "recently used".
- `generateBatchTimelines`: forward `hookType: hookContext.hookType || 'auto'` xuống mỗi `generateTimeline`.

### `byteplus/video_studio/index.js`
- Route `POST /projects/:id/generate-timeline`: `hookContext` thêm `hookType: req.body?.hookType || 'auto'`. Backward compatible.

### `public/studio/video-to-video.js`
- `HOOK_TYPE_OPTIONS` (Auto + 19 hook) + `selectedHookType` (giữ lựa chọn qua re-render) + `buildHookTypePicker()` (render `<select id="v2v-hook-type-select">`).
- Chèn picker vào action bar ở state `reference_analyzed` và nhánh regen (`timeline_generated`/`awaiting_script_review`).
- `doGenerateTimeline`: đọc `hookType` từ select, POST `{hookType}` kèm header `Content-Type: application/json`.
- 3 default fallback voice: `vi-VN-HoaiMyNeural` → `en-US-AriaNeural`.

### `public/studio/video-to-video.html`
- Voice picker: `<optgroup>` English (default, 5 giọng) + Tiếng Việt (2 giọng).

---

## 3. Verify (runtime)

- `node --check` cả 3 file JS: OK.
- **npm test: 209/209 pass** (Tier1 72, Tier2 58, Tier3 51, Tier4 28), 0 regression.
- Restart server: kill PID cũ (24628, đang chạy code cũ chỉ có vi-VN), start lại `node server.js`.
- `GET /api/video-studio/voices` → 7 giọng, English đứng trước. ✅
- `GET /byteplus/video-to-video` → HTTP 200; bundle JS chứa `v2v-hook-type-select`. ✅

## 4. Chưa kiểm chứng (mock≠real §13)
- Chưa E2E sinh 1 kịch bản thật với `hookType` cụ thể để xác nhận LLM tôn trọng USER-LOCKED (cần 1 project có reference đã phân tích + kho clip). Logic đã thông tuyến; chờ chạy thật khi có project.

## 5. Backup
`docs/BACKUPS/2026-09-15/task-prompt-v2-english-hook/` (5 file: voice_generator.js, timeline_generator.js, index.js, video-to-video.js, video-to-video.html).

## 6. Kiến thức tham chiếu
`byteplus/video_studio/knowledge/ad_script_playbook.md` (8 framework, 19 hook, 12 angle, 42 nguồn) — nguồn để soạn định nghĩa trong prompt v2.
