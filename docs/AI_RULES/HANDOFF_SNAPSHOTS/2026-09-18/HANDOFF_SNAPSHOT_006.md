# HANDOFF SNAPSHOT 006 — 2026-09-18

> ## ⛔ ĐÃ ROLLBACK TOÀN BỘ (cùng ngày, theo yêu cầu user: *"Rollback những thay đổi vừa rồi đi em"*)
> Code đã khôi phục về đúng trạng thái TRƯỚC đợt 1. `npm test` **397/397**.
> Giữ lại tài liệu này vì phần **kiểm chứng + số đo** vẫn còn giá trị khi làm lại sau này.
> Đã khôi phục: `timeline_generator.js`, `assembler.js`, `tests/runner.js`,
> `tests/render_polish.test.js`, `tests/footage_driven_timeline.test.js`; xoá `tests/pptx_pacing.test.js`.
> KHÔNG đụng tới: gói hàng đợi (snapshot 005) và mọi thứ trước đó.

Task: `task-chuan-hoa-pptx` — **ĐỢT 1: NHỊP VIDEO** (ĐÃ ROLLBACK).

## User Request (verbatim)
> em ơi a đang muốn sửa lại để a ren lại video theo đúng yêu cầu hơn ấy. hiểu ý a chứ ?
> Chứ ko phải là sửa lại các video đã làm
> (chốt qua câu hỏi) 11-12 từ cho cảnh 4 giây

## Kiểm chứng báo cáo agent khác: ĐÚNG 6/6 (chi tiết ở docs/BACKLOG/2026-09-18_TASK-CHUAN-HOA-THEO-PPTX.md)

## Đã sửa
| # | Trước | Sau |
|---|---|---|
| Hook | Prompt ép `FULL_HOOK_DURATION`, giữ trọn clip ⇒ **34s** | `MAX_HOOK_SECONDS = 5`, cắt lấy đoạn đắt nhất |
| Trần cảnh | `maxSegmentDur = 7.0`, map kho `Math.max(requested, estimatedVoice)` phá trần ⇒ 4.7-5.9s | `MAX_SCENE_SECONDS = 4.0`, clamp ở CẢ 3 chỗ |
| Ngân sách viết | `VOICE_WORDS_PER_SEC = 3.8` (227 từ/phút) | **2.85** ⇒ 11 từ cho cảnh 4s |
| Trần cắt | Dùng chung 3.8 rồi 2.85 | **Tách riêng** `VOICE_SPEAK_RATE = 3.8` |
| Đệm đuôi | `tailPad = 0.35` | **0.7** ⇒ hình thở ~1s có chủ đích |
| Ngân sách tổng | `avgSegmentSeconds = 5.1` | `MAX_SCENE_SECONDS` (4.0) |

### 2 lỗi TỰ BẮT ĐƯỢC khi verify (không có trong báo cáo gốc)
1. **Hook 34s vẫn ăn hết quỹ 60s.** `planOutputBudget` nhận độ dài hook GỐC (34s) thay vì độ dài
   SAU KHI CẮT (5s) ⇒ chỉ còn 6 cảnh thân bài ⇒ **video 28s**. Fix: clamp `hookDuration` bằng
   `MAX_HOOK_SECONDS` ở cả 3 chỗ tính ngân sách.
2. **Cắt oan làm câu cụt.** Dùng CÙNG một con số cho *ngân sách viết* và *trần cắt*: model viết
   nhỉnh 1-2 từ là bị cắt, để lại "...chỉ trong vài." / "...bơm tay truyền." — **5/15 câu**.
   Fix: tách `VOICE_SPEAK_RATE` (3.8, trần cắt theo audio thật) khỏi `VOICE_WORDS_PER_SEC`
   (2.85, ngân sách viết). 12 từ đọc hết 3.2s — thừa sức vừa cảnh 4s, không có lý do cắt.

## RUNTIME VERIFIED (sinh kịch bản THẬT, 3 biến thể)
| | Trước đợt 1 | Sau bước 1 | Sau bước 2 (cuối) |
|---|---|---|---|
| Số cảnh | 6 | 8 | **14-15** |
| Tổng thời lượng | 54-60s (hook 34s chiếm hơn nửa) | 28-30s | **57-58.2s** |
| Cảnh vượt trần 4s | nhiều (4.7-5.9s) | 0 | **0** |
| Câu cụt | — | 5/15 (33%) | **1/43 (2.3%)** |
| Hook | 34s | 5s | **5s** |

TL#1 mẫu: 15 cảnh × 3.8s, mỗi câu 9-10 từ, tất cả trọn ý.
`npm test` **410/410** (thêm 13 test trong `tests/pptx_pacing.test.js`).

## Contract cũ đã đổi (§30, đều ghi lý do trong test)
- `render_polish.test.js`: 5 test (nới cảnh ≤4s; enforce cắt thay vì nới; tailPad 0.7; ngân sách
  viết 2.85; trần cắt theo `VOICE_SPEAK_RATE`).
- `footage_driven_timeline.test.js`: 2 test (trần cắt dùng `VOICE_SPEAK_RATE`).

## Files
MỚI: `tests/pptx_pacing.test.js`.
SỬA: `byteplus/video_studio/timeline_generator.js` (hằng số + clamp + prompt),
`byteplus/video_studio/assembler.js` (tailPad), `tests/render_polish.test.js`,
`tests/footage_driven_timeline.test.js`, `tests/runner.js`.

## Backup
`docs/BACKUPS/2026-09-18/task-chuan-hoa-pptx/` (timeline_generator, assembler, 3 prompt, runner).

## CÒN LẠI — đợt 2 & 3 CHƯA LÀM
- **Đợt 2:** ép 10 kịch bản khác ≥4 yếu tố (persona/bối cảnh/đạo cụ/bằng chứng) + validate;
  bộ lọc claim chặn câu vi phạm chính sách quảng cáo.
- **Đợt 3:** nâng prompt phân tích lên 7 tiêu chí + chấm điểm hook 1-10.
- Chưa render video thật với nhịp mới (mới verify ở tầng kịch bản).
- CHƯA COMMIT. Project `E2E_TEST_CLAUDE` giữ nguyên theo yêu cầu.
