# HANDOFF SNAPSHOT 001 — 2026-09-18

Task: `task-gemini-progress-subtitle-voicefit` (V2 Video-to-Video)

## User Request (verbatim)
> 1. Đổi synthesis sang gemini-3.8-flash cho nhanh
> 2. Nó vẫn ko hiện thanh tiến độ ren video nè em
> 3. ...đoạn text của câu trước phải mất đi để nhường chỗ cho text của câu sau. ...text và voice
>    ...ko khớp với thời lượng phân cảnh, đang bị dài quá... gắn voice vào đúng thời gian bắt đầu
>    từng phân cảnh và thời lượng voice/text vừa đủ thời lượng phân cảnh... mapping chính xác.
> 4. Giải quyết các vấn đề này cho a

## Changes + Verify
1. **Synthesis → gemini-3.8-flash** (`.env` TEXT_MODEL). Nhanh ~10x Claude; đúng nhờ prompt đã
   khóa key (snapshot 2026-09-17/005). VISION_MODEL giữ `aa`.
2. **Thanh tiến độ render (Step 5) — 2 nguyên nhân, đã fix:**
   - (a) `_renderProgress` chỉ set NGAY TRƯỚC batchAssemble (sau vòng prep) → khoảng chết. Fix:
     `index.js` route assemble set `_renderProgress` SỚM (ngay khi vào assembling, items='queued').
   - (b) `express.static(public)` (dòng 251) phục vụ `/studio/*` TRƯỚC handler `/studio` → header
     cache mặc định → browser giữ JS cũ. Fix: `server.js` đặt handler `/studio` (Cache-Control:
     no-store) LÊN TRƯỚC static public.
   - (c) `streamCardHTML` in `[object Object]` vì `angle` là object {id,name,focus}. Fix: lấy .name.
   - **RUNTIME VERIFIED (browser):** fire assemble → sau 1.5s `/render-progress` trả 10 items; chọn
     project → panel hiện (`hidden:false`), **10 card** render, trạng thái "Chờ lượt"/"Đang chuẩn bị".
3. **Phụ đề cuộn (rolling) — hết "tường chữ":** `buildWordRevealDrawtext` thêm `chunkWords=7`; hiện
   dồn TRONG cụm ≤7 từ (hoặc tới dấu câu), sang cụm mới → cụm cũ BIẾN MẤT.
   - **RUNTIME VERIFIED:** render câu dài → t=1.5s "BẠN CÓ BIẾT CẢM GIÁC VALI NHÉT" (cụm 1),
     t=8s "TẠI QUẦY" (cụm cuối, từ đầu đã mất). Kích thước frame không tăng dồn (37k→37k→19k).
4. **Voice khớp phân cảnh (không cắt cụt giữa câu):** thêm `fitVoiceToWords(text,maxWords)` — giữ CÂU
   trọn vẹn (ưu tiên số câu trọn vẹn ≤ budget; câu đầu quá dài → cắt tại mệnh đề/phẩy; bỏ từ nối cụt
   cuối; luôn kết dấu câu). `enforceVoiceDurationConstraint` dùng nó thay cho cắt-từ-cứng cũ.
   - **Lưu ý:** chỉ áp cho SCRIPT SINH MỚI (generate). Project cũ đã lưu voice cũ (đã cắt cụt) → phải
     "Sinh lại kịch bản" mới thấy cải thiện. Voice map đầu phân cảnh: assembler đã làm sẵn (adelay
     100ms/segment + atrim theo segment) — voice[i] bắt đầu tại scene[i].

## Files
.env, byteplus/video_studio/index.js, server.js, byteplus/video_studio/assembler.js,
byteplus/video_studio/timeline_generator.js, public/studio/video-to-video.js,
tests/subtitle_sync_and_render.test.js (+9 test). `npm test` **335/335**.

## Backup
`docs/BACKUPS/2026-09-17/task-analysis-hard-fail-on-ai-error/` (đợt trước) + git.

## Next
- User reload trang (Ctrl+Shift+R) — no-store đảm bảo JS mới.
- Muốn voice/text ngắn gọn hợp phân cảnh cho project cũ → bấm "Sinh lại kịch bản".
- (Tùy chọn) hạ chunkWords nếu muốn phụ đề còn ngắn hơn.
- Commit khi user duyệt.
