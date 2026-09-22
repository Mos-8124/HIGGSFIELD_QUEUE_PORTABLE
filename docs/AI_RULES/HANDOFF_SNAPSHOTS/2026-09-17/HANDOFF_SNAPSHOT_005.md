# HANDOFF SNAPSHOT 005 — 2026-09-17

Task: `task-analysis-hard-fail-on-ai-error`

## User Request (verbatim)
> Wtf sao con AI của hệ thống ko hoạt động để phân tích video ? e kiểm tra lại xem nó có thật sự
> đang gọi qua API key của a cấp ko vậy ? a đâu có giới hạn chi phí đâu? mà e sửa lại luôn cho a đi
> nếu AI ko call đc API key thì phải lỗi ngay ko cho phép done step 2 nh

## Scope
V2 GTF/Video-to-Video — luồng phân tích video (Step 2) qua Video Analyzer Pipeline + LLM 9Router.
KHÔNG đụng V1.

## Investigation (SOURCE + RUNTIME CONFIRMED)
- Proxy `http://127.0.0.1:20128/v1` SỐNG; `NINE_ROUTER_API_KEY` cấu hình (len=35). Test thật model
  `aa` → resolve `gemini-3.8-flash`, trả "OK". => **API key HOẠT ĐỘNG**, không phải lỗi key.
- Nguyên nhân "AI không hoạt động / vẫn done step 2" = **nuốt lỗi** ở 3 tầng, biến AI-fail thành
  kết quả rỗng/bịa "success":
  1. `video_analyzer/vision/analyzer.py:analyze_single_batch` except → trả batch rỗng (error).
  2. `video_analyzer/merge/synthesis.py:run_final_synthesis` except → **bịa** summary
     "Video documentation" / "Tài liệu giới thiệu video".
  3. `video_analyzer/pipeline.py` gather return_exceptions → hạ cấp visual thành status=failed nhưng
     vẫn tiếp tục & trả về.
  4. Node `analyze-reference`/`analyze-hook` KHÔNG kiểm `status`/`visual_status` → luôn lưu +
     transition `reference_analyzed`.

## Changes Made
- `byteplus/video_studio/index.js`: export `isReferenceAnalysisUsable(result)` (fail nếu !result |
  status='failed' | visual_status='failed' | visual_events rỗng). Chèn guard vào 2 route
  `analyze-reference` + `analyze-hook`: không usable → HTTP 502 `AI_ANALYSIS_FAILED`, KHÔNG lưu,
  KHÔNG transition.
- `video_analyzer/vision/analyzer.py`: `run_visual_pipeline` raise RuntimeError khi TẤT CẢ batch fail.
- `video_analyzer/pipeline.py`: re-raise visual exception (bỏ tạo VisualAnalysisResult status=failed).
- `video_analyzer/merge/synthesis.py`: bỏ fallback bịa summary → raise RuntimeError khi text-LLM fail.
- NEW `tests/analysis_hard_fail.test.js` (8 test guard) + đăng ký `runner.js`.

## Files Changed
byteplus/video_studio/index.js, video_analyzer/vision/analyzer.py, video_analyzer/pipeline.py,
video_analyzer/merge/synthesis.py, tests/analysis_hard_fail.test.js, tests/runner.js, HANDOFF.md

## Backup / Rollback
`docs/BACKUPS/2026-09-17/task-analysis-hard-fail-on-ai-error/` (index.js, vision/analyzer.py,
pipeline.py, merge/synthesis.py). Rollback: copy đè + git.

## Verification
- `npm test` **324/324 PASS**.
- RUNTIME: model sai (VISION/TEXT_MODEL bogus) → `analyze_video` RAISED RuntimeError (không fake
  success) → worker ok:false → route 502 → step 2 bị chặn.
- RUNTIME: model đúng → status=success, visual_status=success, visual_events=1 → guard PASS.
- Server restart cổng 20140, `/byteplus/video-to-video` HTTP 200.

## Remaining Risks
- Cache analyzer chỉ lưu status==success; entry cũ vẫn tồn tại → muốn ép gọi API mới thật sự phải
  xoá cache (chưa xoá — chờ user quyết vì là xoá dữ liệu dẫn xuất).
- Hard-fail áp cho cả auto-describe kho (mỗi asset đã có try/catch riêng ở index.js → không sập batch).
- `ensureVietnameseAnalysis` (dịch phụ) vẫn dùng `res.json()` trên model 'gemini-2.5-flash'; nếu proxy
  stream có thể parse hỏng nhưng chỉ ảnh hưởng bản dịch, không chặn step (đã có visual_events).

## Cập nhật (đợt 2 — user báo "vẫn bịa"):
- **Cache là thủ phạm chính:** `.../data/cache/*.json` (8 file) lưu kết quả cũ generic
  (`summary="Video multimodal analysis completed.", purpose=""`), "Cache HIT" trả lại bản đó →
  vẫn bịa dù code đã sửa. → Đã **backup + xoá** 8 file cache.
- **Chặn "bịa" ở tầng generic:** `synthesis.py` raise nếu summary rỗng/generic + purpose rỗng;
  Node guard `isReferenceAnalysisUsable` cũng reject case này. RUNTIME: fresh analysis giờ
  **RAISED RuntimeError** thay vì trả generic. `npm test` **327/327**.
- **Bytecode cũ (.pyc)** từng khiến check chưa chạy → đã xoá `__pycache__` + restart server.
- **Phát hiện lớn (chưa fix — cần user quyết):** model `aa` (gemini-3.8-flash) **hoạt động tốt**
  với prompt gọn (trả summary VI 232 ký tự + purpose 202). Nhưng trong **pipeline synthesis đầy đủ**
  (prompt timeline lớn) model trả generic/thiếu summary → step 2 giờ HARD-FAIL. Vision cũng chỉ ra
  1 event/fresh (cache cũ 13). => Bước vision+synthesis under-perform với prompt lớn / reasoning model.
  Cần task riêng: tăng max_tokens / rút gọn prompt synthesis / tách call summary-purpose / hoặc đổi model.

## Cập nhật (đợt 3 — ĐÃ FIX cho AI phân tích THẬT):
**Root cause thật của "bịa/generic":** prompt bắt "Return JSON in Vietnamese" → model (nhất là
Claude) **dịch luôn KEY JSON** (`muc_dich_tong_the` thay vì `purpose`, `start_timestamp` thay vì
`start`) → Pydantic schema (key tiếng Anh) không map được → field rỗng → điền default generic.
Chứng minh bằng trace: Claude trả 5185 ký tự nội dung phong phú nhưng key tiếng Việt → parse ra rỗng.

**Fix:**
1. **Khóa KEY tiếng Anh trong prompt** (`prompts/visual.txt`, `prompts/final.txt`): liệt kê CHÍNH XÁC
   tên field tiếng Anh (start,end,scene,description,people,objects,products,actions,visible_text /
   summary,purpose,conclusion,timeline,visual_summary,audio_summary,...), "ONLY VALUES in Vietnamese,
   KEYS stay English, no markdown fences". Đây là fix bản chất, đúng với MỌI model.
2. **Đổi TEXT_MODEL → `ag/claude-sonnet-4-6`** (`.env`) cho synthesis tiếng Việt phong phú/ổn định
   (sweep: Claude 611 ký tự > gemini). VISION_MODEL giữ `aa` (Claude trả 0 event cho ảnh).
   Cập nhật test `footage_driven_timeline.test.js` theo contract mới (§30, ghi rõ WHY).

**RUNTIME VERIFIED (call API thật, cache đã xoá):**
- Hero.mp4 (trước generic) → PURPOSE + SUMMARY tiếng Việt chi tiết thật ("người đàn ông đứng đỉnh
  mỏm đá, áo choàng đỏ, đỉnh núi phủ tuyết, biển mây...").
- kho/1M4O.mp4 → "quảng cáo túi nén hút chân không du lịch + máy hút mini cầm tay..." (đúng sản phẩm).
- `npm test` **327/327**. Server restart nạp .env + prompt mới.

**Model sweep (tham khảo):** synthesis với timeline tốt: aa ok(383), gemini-3.8-flash ok(439),
claude-sonnet ok(611), gpt-oss ok(489); vision: aa/gemini ra event, claude=0 event.

## Next Steps
- User test lại trên UI (cache đã trống → sẽ gọi API tươi).
- (Tùy chọn) chỉnh VISION concurrency/frame_interval nếu muốn nhiều event hơn cho video dài.
- Commit khi user duyệt.
