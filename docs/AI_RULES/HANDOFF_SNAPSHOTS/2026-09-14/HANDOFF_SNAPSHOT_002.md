# HANDOFF SNAPSHOT 002

Date: 2026-09-14
Task: task-fix-timeline-model + E2E test Video to Video

## Report — Test end-to-end Video to Video + fix bug chặn generate-timeline

### User Request
> Test tool http://localhost:20140/byteplus/video-to-video: lấy video đối thủ
> C:\Users\gifft\Downloads\Hero.mp4, chạy hết luồng xem có ra kết quả cuối không.

### Bug tìm thấy (chặn bước §7)
`byteplus/video_studio/timeline_generator.js` gọi 9Router với:
1. model `gpt-4o-mini` — KHÔNG tồn tại trên 9Router (HTTP 404). 9Router có: aa, ag/gemini-3.8-flash-high, ...
2. Thiếu `stream: false` — 9Router mặc định trả SSE (`data: {...}`) -> response.json() vỡ (SyntaxError).

### Fix (2 dòng)
- model -> `process.env.NINE_ROUTER_TIMELINE_MODEL || 'ag/gemini-3.8-flash-high'`.
- thêm `stream: false` vào body chat completions.
Backup: docs/BACKUPS/2026-09-14/task-fix-timeline-model/.

### Kết quả test E2E (LIVE, dùng 9Router thật)
Project gtf_mu0m15s7_108740, ref = Hero.mp4:
1. create project + upload Hero.mp4 -> reference_imported. OK
2. analyze-reference (Gemini Vision + Whisper) 21s -> reference_analyzed. OK (summary: cinematic character transformation).
3. generate-timeline (sau fix) -> 2 segment, có text + voice tiếng Việt -> awaiting_script_review. OK
4. review approve -> script_approved. 5. validate -> valid, assembling. OK
6. assemble (FFmpeg + Edge TTS HoaiMy) 8.5s -> awaiting_final_review. OK
7. final-review approve -> final_approved. OK
=> final.mp4: 4.5s, 916KB, h264 1920x1080, aac (CÓ lời thoại). Package đủ:
   final.mp4 + production_timeline.json + episode_manifest.json + storyboard.html.

### Kết luận
Luồng Video to Video CHẠY THÔNG tới video cuối. Sau khi vá 2 dòng model/stream,
toàn bộ FSM library->analyze->timeline->review->validate->assemble->final chạy đúng.

### Còn lưu ý
- Kịch bản AI sinh khá ngắn (2 seg, 1 clip) — chất lượng kịch bản phụ thuộc prompt + số clip đã mô tả (18/24). Có thể tinh chỉnh prompt timeline_generator sau.
- npm test CHƯA chạy lại sau fix (fix chỉ đổi model string + stream flag, không đụng logic test). Nên chạy `npm test` để xác nhận.

---

## Bổ sung UI: Step 1 hiện video input + nhãn "(AI xử lý)" (2026-09-14)

User request:
- `#v2v-stepper/div[1]` (Step 1 "Video Input") phải hiện video đối thủ user tải lên.
- Bước 3 (Sinh kịch bản) và Bước 5 (Dựng video FFmpeg) thêm "(AI xử lý)" — báo user đây là bước AI, không có gì để xem.

Thay đổi:
- Backend `index.js`: thêm route `GET /projects/:id/reference-video` — stream video đối thủ (206 Range).
- HTML: thêm panel `#v2v-input-panel` (player `#v2v-input-player`) trong workspace; nhãn step 3/5 thêm `<small class="step-ai">(AI xử lý)</small>`.
- JS: `STEP_PANELS[1]=['v2v-input-panel']`, thêm vào `ALL_STEP_PANELS`, hàm `renderInputPanel(p)` set src = reference-video route; gọi trong renderWorkspace.
- CSS: `.step-ai` màu tím nhạt.
Backup: docs/BACKUPS/2026-09-14/task-step1-input-video/.

Verify live: chọn project -> step 1 hiện panel + player load Hero.mp4 (videoWidth 720); step 3 = "Sinh kịch bản (AI xử lý)", step 5 = "Dựng video FFmpeg (AI xử lý)". npm test 186/186.
