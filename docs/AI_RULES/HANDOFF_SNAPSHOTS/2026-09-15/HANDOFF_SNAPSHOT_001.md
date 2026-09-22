# HANDOFF SNAPSHOT 001

Date: 2026-09-15
Task: task-optimize-timeline-prompt (research + rewrite + evaluate, multi-agent)

## User Request
> Prompt sinh kịch bản chưa đạt chuẩn biến đổi content. Phái sub-agent (model hợp lý)
> tổng hợp kiến thức viết kịch bản QC trên mạng + lưu lại; tối ưu prompt cho biến đổi;
> prompt VIẾT BẰNG TIẾNG ANH + quy định OUTPUT kịch bản tiếng Anh; xong giả lập gửi prompt
> tới 1 sub-agent ĐÁNH GIÁ (không viết, chỉ chấm); báo cáo prompt chỉnh gì + kiến thức lưu đâu.

## Đã làm (multi-agent)
1. **Research sub-agent (sonnet, có web):** tổng hợp playbook viết kịch bản ad short-form →
   lưu `byteplus/video_studio/knowledge/ad_script_playbook.md` (373 dòng): 8 framework
   (AIDA/PAS/BAB/PASTOR/FAB/4Ps/Star-Story-Solution/Hook-Retain-Reward), 19 hook type, 12 angle,
   ma trận biến đổi, quy tắc caption/voice, 42 nguồn.
2. **Tối ưu prompt** `byteplus/video_studio/timeline_generator.js` (systemPrompt): viết lại HOÀN TOÀN
   bằng TIẾNG ANH, bắt buộc output (text+voice) tiếng Anh; thêm STEP0 chọn framework, STEP1 chọn hook
   từ menu 19, VARIATION MANDATE, giữ nguyên schema JSON (title/directorNote/segments) + biến ${selectedAngle}.
   Model 9Router giữ `ag/gemini-3.8-flash-high`, stream:false. Backup: docs/BACKUPS/2026-09-15/task-optimize-timeline-prompt/.
3. **Evaluator sub-agent (sonnet, KHÔNG viết):** chấm prompt → verdict **APPROVE-WITH-CHANGES**.
   Điểm: English 9/10, Structure 8/10, Variation enforcement 4/10, Anti-repetition 3/10, Schema safety 5/10.
   Gap chính: biến đổi chưa được ÉP (thiếu cross-generation memory/randomize), thiếu menu CTA,
   hook/framework chưa có định nghĩa, schema chưa có ví dụ JSON + type + enum transition.

## Chưa làm / đề xuất v2 (theo evaluator, chờ user duyệt)
- Bơm state "framework/hook/CTA đã dùng N lần gần nhất" (cần sửa harness) hoặc chọn theo hash(angle) để ép đa dạng thật.
- Thêm menu CTA enumerated song song menu hook. Thêm định nghĩa 1 dòng cho mỗi hook/framework.
- Nới/tiered word-count để pacing biến đổi được. Chống lặp clip xuyên generation. Siết output contract (ví dụ JSON + type + cấm markdown fence).

## Lưu ý vận hành
- Output kịch bản giờ là TIẾNG ANH → giọng Edge TTS đang là vi-VN (HoaiMy/NamMinh) sẽ đọc tiếng Anh nghe sai ngữ điệu.
  Nếu chạy tiếng Anh nên bổ sung giọng en-US cho voice_generator + voice picker (chưa làm).
- Restart server để nạp prompt mới.
- npm test: xem kết quả cuối lệnh (không có test riêng cho nội dung prompt; node --check pass).
