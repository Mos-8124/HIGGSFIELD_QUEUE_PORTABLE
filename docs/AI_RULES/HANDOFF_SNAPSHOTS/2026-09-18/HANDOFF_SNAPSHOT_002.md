# HANDOFF SNAPSHOT 002 — 2026-09-18

Task: `task-step5-revisit-subtitle-style-voice-fit-60s` (V2 Video-to-Video)

## User Request (verbatim)
> 1. Lỡ bấm sang step khác là ko bấm lại xem step 5 được nữa. Sửa lại logic hiển thị...
> 2. xoá nền đen của text trong video đi em nhìn xấu quá. À chuyển text xuống thấp một chút nữa.
> 3. ...text và voice đang bị ép cắt thời lượng một cách tiêu cực. Cái a cần là text đc sinh ra để
>    khớp với thời lượng phân cảnh chứ ko phải là cắt bớt text tiêu cực...
> (bổ sung giữa lượt)
> 4. Nên đặt giới hạn video output tối đa là 1 phút đi cho con AI nó sáng tạo thêm thân bài và kết bài
>    vì hiện tại thời lượng video hơi ngắn nếu hook dài... hook như hiện tại là ok rồi.
> 5. thêm phân đoạn thì phải chọn phân đoạn phù hợp nhé, độ dài output chỉ tầm 1 phút, đừng quá nhiều.

## Changes + Verify

### 1. Step 5 xem lại được (public/studio/video-to-video.js)
- **Nguyên nhân:** `renderBatchRenderPanel` `return` NGAY khi `status !== 'assembling'` — trước khi
  set `dataset.hasData='1'`. `showStepPanels()` chỉ hiện panel khi `hasData==='1'` ⇒ dựng xong là
  không xem lại được step 5.
- **Fix:** phân nhánh `isAssembling`; render xong → dựng **snapshot** từ `p.renderedVideos`
  (hàm mới `streamCardDoneHTML`), set `hasData='1'`, dừng polling. Chỉ ẩn khi CHƯA từng dựng.
- **RUNTIME VERIFIED (browser, project `gtf_mu6c94bc_0dd5d1`, status `awaiting_final_review`):**
  bấm step 6 → step 5 ⇒ `panelHidden:false`, "Đã dựng xong toàn bộ video", **10/10 hoàn thành**,
  10 card "Hoàn tất" kèm góc tiếp cận + tên file.

### 2. Phụ đề: bỏ nền đen, hạ thấp (byteplus/video_studio/assembler.js)
- Bỏ `drawbox` đen che ngang + `box=1:boxcolor=black@0.95:boxborderw=18`.
- Thêm hằng số export dùng chung `SUBTITLE_STYLE` / `SUBTITLE_Y_RATIO`:
  `borderw=4:bordercolor=black@0.85:shadowcolor=black@0.6:shadowx=2:shadowy=2`, `y=h*0.80`
  (trước `h*0.72`).
- **RUNTIME VERIFIED:** render thật 2 phân cảnh nền TRẮNG + nền TỐI → trích frame: không còn dải
  đen, chữ đọc rõ cả 2 nền, vị trí ~80% chiều cao.
- **⚠ ĐÁNH ĐỔI:** nền đen trước đây còn để CHE phụ đề tiếng Anh cháy sẵn trong clip kho. Bỏ đi thì
  clip nào có sub cháy sẵn sẽ lộ. Đã đổi contract test `footage_driven_timeline.test.js` (§30, ghi rõ lý do).

### 3. Voice/text khớp phân cảnh — không cắt cụt (byteplus/video_studio/timeline_generator.js)
- Hàm mới `fitSegmentDurationToVoice(seg, opts)`: **NỚI** thời lượng phân cảnh cho vừa lời bình
  (2.6 từ/s + 0.35s đệm), chặn trên bởi `clipDuration` (phần clip còn lại), `maxExtendRatio=2.0`,
  `maxSegmentDur=7.0`. Không biết `clipDuration` ⇒ KHÔNG nới (tránh audio dài hơn video).
- `enforceVoiceDurationConstraint(timeline, {maxTotalSeconds})`: nới trước, **chỉ cắt khi hết chỗ**;
  nới chỉ trong quỹ tổng còn lại (không đẩy video vượt trần 60s).
- Bước map kho ghi `seg.clipDuration`; `segDur = min(clipDur, max(model đề xuất, thời lượng đọc thật))`
  (sửa luôn bug `sourceIn=0` bị coi là falsy ⇒ bỏ qua khung model chọn).
- `_CONNECTOR_TAIL` bổ sung từ loại thể/thời gian (`hôm, chiếc, cái, chuyến, đợt, lần, bộ, loại...`)
  — gặp thật khi render: "...đặt mua ngay **hôm**." (mất "nay").
- Prompt: cấm vượt `maxVoiceWords`, yêu cầu câu TRỌN Ý.

### 4+5. Trần 60s, thân/kết dài hơn, chọn clip ĐÚNG CHỦ ĐỀ
- `planOutputBudget({hookDuration, libraryCount, variantCount, maxOutputSeconds})` → `bodyCount`,
  `estimatedTotal`, `maxUsagePerAsset`. Trần đọc từ `V2V_MAX_OUTPUT_SECONDS` (mặc định 60).
  `avgSegmentSeconds = 5.1` = số đo THẬT (12 từ ÷ 2.6 + 0.5s đệm) — dùng 4.0 sẽ ước thiếu ⇒ vượt trần.
- Kho nhỏ → tự nới `maxUsagePerAsset` (trước hardcode 3) để coverage không tụt < 70%.
- `buildStagePlan(n)`: mở `problem`, giữa luân phiên `feature/result/problem`, **CTA chỉ 1 lần ở cuối**
  (trước lặp chu kỳ 4 ⇒ CTA rải giữa video khi nhiều phân cảnh).
- `extractProductKeywords` / `scoreAssetRelevance` / `rankAssetsByRelevance`: lọc clip theo độ liên quan
  với phân tích đối thủ. Kho dùng chung 273 clip trộn nhiều ngành hàng ⇒ trước đây AI ghép nhầm clip
  **nail** vào quảng cáo **vali/túi hút chân không**. `assetList` gửi model cũng rank + trần 80 clip.
- **RUNTIME VERIFIED (sinh kịch bản THẬT qua 9Router):**
  - Trước fix: TOTAL 61.9s, nội dung lạc đề ("bộ móng tráng gương", "móng đôi").
  - Sau fix: TOTAL **61.5s** (hook 27.5s + 7 phân cảnh), 100% coverage, toàn bộ lời bình đúng chủ đề
    (vali/túi nén/máy hút/sân bay), **mọi phân cảnh `endOk=Y`**, số từ luôn ≤ budget.
  - PHASES = hook → bridge → body×5 → cta.

## Files
public/studio/video-to-video.js, byteplus/video_studio/assembler.js,
byteplus/video_studio/timeline_generator.js, tests/render_polish.test.js (MỚI, 29 test),
tests/footage_driven_timeline.test.js (đổi contract nền đen), tests/runner.js.
`npm test` **364/364**.

## Backup
`docs/BACKUPS/2026-09-18/task-step5-revisit-subtitle-style-voice-fit/` (assembler.js,
timeline_generator.js, video-to-video.js, subtitle_sync_and_render.test.js) + git @21d3ca0.

## Next
- Project CŨ phải bấm **"Sinh lại kịch bản"** mới hưởng voice-fit + trần 60s + lọc chủ đề.
- Muốn đổi trần: đặt `V2V_MAX_OUTPUT_SECONDS` trong .env.
- Tổng thời lượng thực tế dao động ±2s quanh trần (model chọn trong khoảng min–max phân cảnh).
- Commit khi user duyệt.
