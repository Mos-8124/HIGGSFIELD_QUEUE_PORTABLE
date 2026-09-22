# HANDOFF SNAPSHOT 007 — Đợt A + B + C: chuẩn hoá pipeline V2

**Ngày:** 2026-09-18 · **Nhánh:** `feat/kie-multimodel-seedance-2.0` · **Chưa commit.**
**Test:** `npm test` → **445/445 PASS**.
**Project E2E để user xem:** `gtf_mu6noe93_9f49a2` — "TEST ABC 2026-09-18" (3 video, **KHÔNG được xoá**).
**Backup:** `docs/BACKUPS/2026-09-18/task-ABC-chuan-hoa-pipeline/` (20 file + `full-changes.patch`).
**Chi tiết đầy đủ:** `docs/BACKLOG/2026-09-18_TASK-CHUAN-HOA-THEO-PPTX.md`.

## Đã làm
- **A — Phân tích 7 tiêu chí**: prompt + schema Pydantic + `PIPELINE_VERSION 3.0.0_vi_scorecard`;
  `extractAnalysisScorecard()`; lưu điểm lên clip kho; bảng điểm ở bước 2.
- **B — Kho 3 nhóm**: `material / reference / hook`, bỏ "chưa phân loại"; upload chọn nhóm;
  step 1 chọn lại ref/hook từ kho kèm ảnh bìa; `pickHookFromLibrary()` tự chọn hook khi user không nhập.
- **C — Nhịp video**: trần 30s; hook 4-5s; cảnh 4-5s; **tách** tốc độ ĐỌC (3.8) khỏi ngân sách VIẾT (3.2);
  `checkVariantDiversity()`; `DEFAULT_CLAIM_RULES` + `applyClaimRules()` hậu kiểm.

## Số đo thật (3 video render)
24.2 / 25.3 / 24.6 giây · hook 5.0s · cảnh 4.0-5.0s · **0/18 câu bị cắt** · khoảng lặng dài nhất **1.2s** · 0 cặp biến thể trùng.

## BẪY ĐÃ BỊT — đọc trước khi sửa tiếp
1. **Hook thô phải kẹp ở MỌI ngả vào budget.** Đợt 1 sót 1 chỗ ⇒ hook 34s lọt vào `planOutputBudget`
   ⇒ chỉ còn 6 cảnh. Nay `planOutputBudget` TỰ kẹp bên trong, không tin nơi gọi.
2. **KHÔNG dùng chung một hằng số cho "viết" và "cắt".** Dùng chung ⇒ cụt 5/15 câu.
   `VOICE_SPEAK_RATE` = đo & cắt. `VOICE_WRITE_WORDS_PER_SEC` = giao chỉ tiêu viết.
3. **`scanLibrary` bỏ qua file không đổi** ⇒ đổi quy tắc category mà không migrate thì 266 clip cũ
   không bao giờ được gán nhóm. Nhánh `unchanged` nay có chuẩn hoá lại nhóm.
4. **Đổi schema phân tích PHẢI bump `PIPELINE_VERSION`**, nếu không cache cũ (thiếu trường điểm) sẽ được dùng lại.

## Còn lại
- 270 clip kho vẫn mang mô tả cũ (chưa có điểm). Chỉ nhóm **hook** và **đối thủ** cần điểm.
- Kịch bản đã lưu của project cũ không tự cập nhật — phải bấm "Sinh lại kịch bản".
