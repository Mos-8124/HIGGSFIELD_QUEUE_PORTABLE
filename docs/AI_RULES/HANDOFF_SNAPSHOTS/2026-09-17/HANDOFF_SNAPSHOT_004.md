# HANDOFF SNAPSHOT 004 — 2026-09-17

Task: `task-subtitle-sync-render-concurrency`

## User Request (verbatim)
> 1. E xem thử video output ... text hiện luôn một lượt chứ ko hiện theo voice, e hãy điều chỉnh
> lại để voice nói đến đâu text hiện từng chữ đến đó, chỉ cho phép text hiện trc voice 0.1-0.2s thôi.
> 2. Agent trước nói là đã cập nhật thanh tiến độ khi ren video ở bước 5 nhưng a ko bấm vào được
> để xem tiến độ của từng item trong đó. và E kiểm tra thử xem là có thật nó ren một lúc 10 video
> cùng lúc ko nhé. ... user yêu cầu 100 vd output thì cũng chỉ cho ren tối đa 10 video cùng lúc
> thôi, còn lại phải xếp hàng đợi.

## Scope
V2 "Video to Video Studio" (`/byteplus/video-to-video`). KHÔNG đụng V1 Higgsfield.

## Investigation (SOURCE CONFIRMED)
- **Subtitle:** `assembler.js` block phụ đề vẽ CẢ CÂU bằng 1 `drawtext textfile` đứng yên suốt
  segment (comment cũ ghi "đồng bộ 100%" là sai). Không có word-timing.
- **Concurrency:** `index.js` call-site hardcode `concurrency: 3` (không phải 10). Worker-pool
  trong `batchAssemble` đã ĐÚNG cơ chế cap+queue (`nextIndex++`), chỉ sai con số.
- **Progress per-item:** grid card chỉ dựng bởi `renderBatchRenderPanel` (chạy lúc reload project).
  Entry render live (`doAssemble`, `doBatchApproveAndAssemble`) gọi `showStepPanels(5)` khi
  `dataset.hasData` chưa = '1' (chỉ set trong renderBatchRenderPanel) → panel BỊ ẨN hoàn toàn,
  `poll()` update trên grid rỗng → không thấy tiến độ từng item.
- **edge-tts:** CLI `--write-subtitles` gộp cả câu (không word-level). Python API
  `Communicate(..., boundary='WordBoundary')` (edge-tts 7.2.8) cho timing từng từ → dùng cách này.

## Changes Made
- NEW `byteplus/video_studio/tts_timing.py`: synth 1 lần, ghi media + in JSON `{ok,words:[{t,off,dur}]}`.
- `voice_generator.js`: `generateVoiceWithTiming()` (spawn python venv), fallback `generateVoice`.
- `assembler.js`: export `buildWordRevealDrawtext()` (reveal dồn từng từ, lead kẹp 0.1–0.2s, khớp
  tempo+adelay) và `runWithConcurrency()` (cap+queue); wire word-reveal vào drawtext (per-word
  `enable='between(t,a,b)'`, giữ drawbox mask, fallback tĩnh); `batchAssemble` dùng runWithConcurrency,
  default concurrency `V2V_RENDER_CONCURRENCY||10`.
- `video_studio/index.js`: call-site concurrency `3` → `env||10`.
- `video-to-video.js`: helper `streamCardHTML()`; `poll()` tự hiện panel + tạo card thiếu từ
  server items; `renderBatchRenderPanel` dùng helper.
- Tests: NEW `tests/subtitle_sync_and_render.test.js` (Phase A word-reveal, Phase B concurrency,
  Phase C wiring source-regression); đăng ký trong `runner.js`.

## Files Changed
tts_timing.py (new), voice_generator.js, assembler.js, video_studio/index.js,
public/studio/video-to-video.js, tests/subtitle_sync_and_render.test.js, tests/runner.js, HANDOFF.md

## Backup / Rollback
`docs/BACKUPS/2026-09-17/task-subtitle-sync-render-concurrency/` (assembler.js, voice_generator.js,
video_studio/index.js, public/studio/video-to-video.js). Rollback: copy đè lại từ backup + git.

## Verification
- `npm test` → **316/316 PASS** (từ 254).
- **Subtitle RUNTIME CONFIRMED:** render clip test 6s (13 từ) → t=1s: 5 từ, t=5s: đủ 13 từ (dồn dần),
  ffmpeg 0 lỗi, tiếng Việt chuẩn.
- **Concurrency RUNTIME CONFIRMED (§18):** unit 100 item → max đồng thời ≤ 10, xử lý đủ 100.
- **Progress:** SOURCE CONFIRMED + smoke (trang load 0 lỗi console). Live-grid full E2E = PARTIAL.

## Runtime Evidence
Frame t=1s "DỪNG LẠI NGAY ĐIỀU NÀY"; t=5s full "...SẼ THAY ĐỔI TẤT CẢ MỌI THỨ BẠN TỪNG BIẾT".
Console `/byteplus/video-to-video`: no errors; `#v2v-batch-render-panel` + `#v2v-render-stream-grid` present.

## Remaining Risks
- Live-grid per-item khi render 100 video thật CHƯA E2E (PARTIAL) — cần kho asset đã mô tả.
- 10 ffmpeg đồng thời có thể nặng CPU máy yếu → chỉnh `V2V_RENDER_CONCURRENCY` để hạ nếu cần.
- Phụ đề dồn nhiều dòng (>3) có thể tràn drawbox mask cao 210px (giữ nguyên hành vi cũ).

## Next Steps
- (Tùy chọn) E2E render thật 1 batch để xác nhận per-item card + subtitle trên footage thật.
- Commit khi user duyệt.
