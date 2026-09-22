# HANDOFF SNAPSHOT 004 — 2026-09-18

Task: `task-e2e-verify-and-tts-hardening` (V2 Video-to-Video)

## User Request (verbatim)
> Em tự test hệ thống từ step1 đến xong step 5 xem nó có thật sự đạt output như nãy h a muốn ko.
> Xong step 5 thì e tự kiểm tra lại nhé chưa đúng output của a thì tiếp tục sửa.
> Phải kiểm tra thật xem nó call qua API ko nhé
> Kiểm tra output là kiểm tra video output ấy xem nó text, voice nó đã đúng và khớp với phân cảnh
> chưa, có tồn tại những lỗi trước đó gặp phải ko.
> (trước đó) nó bốc phét rồi e ơi nó ko call API mà nhảy step 3 luôn

## 1. "Không call API mà nhảy step 3" — nguyên nhân
`video-analyzer-pipeline/.../video_analyzer/pipeline.py:58` — cache hit là **return ngay, không gọi
API**. Đây KHÔNG phải bịa dữ liệu (kết quả cache là của lần phân tích thật trước đó), nhưng nhìn từ
phía user thì giống hệt "xong tức thì". Cách phân biệt: phân tích thật mất **50-90 giây/video**.

## 2. E2E THẬT — chạy step 1 → step 5 (project `gtf_mu6fdqp8_7731e7`, tên E2E_TEST_CLAUDE)
Trước khi chạy: **xoá sạch cache** (2 → 0 file) để ép gọi API.

| Bước | Kết quả | Bằng chứng gọi API thật |
|---|---|---|
| 2 — phân tích đối thủ | 200 OK | **56s**, sinh 1 file cache MỚI, nội dung cụ thể: VacEase / VCBIRD / STARGOLD, 10 visual_events |
| 2 — phân tích hook | 200 OK | **83s**, sinh file cache thứ 2, 17 visual_events, status lên `reference_analyzed` |
| 3 — preflight | canProceed, relevance 100%, 280/281 clip khớp | |
| 3 — sinh kịch bản | **56s**, 10/10 hợp lệ, mỗi bản 54-60s | 10 request LLM song song |
| 5 — dựng video | 9/10 thành công, #7 hỏng TTS | |

## 3. SOI OUTPUT (script `verify_output.mjs`, đo bằng ffmpeg/ffprobe — không nhìn bằng mắt)
| idx | dài | im lặng | im dài nhất | câm >1.5s | phụ đề khác nhau |
|---|---|---|---|---|---|
| 1 | 51.7s | 15% | 1.20s | không | 4/4 |
| 2 | 50.0s | 18% | 1.10s | không | 4/4 |
| 3 | 52.5s | 17% | 1.05s | không | 4/4 |
| 4 | 51.0s | 16% | 1.09s | không | 4/4 |
| 5 | 47.8s | 17% | 1.09s | không | 4/4 |
| 6 | 50.5s | 17% | 1.08s | không | 4/4 |
| 8 | 54.9s | 19% | 1.19s | không | 4/4 |
| 9 | 50.3s | 18% | 1.10s | không | 4/4 |
| 10 | 46.7s | 17% | 1.09s | không | 4/4 |

**KẾT LUẬN: 9/9 video ĐẠT.** So với trước: project "hihi" có video im **38-39.5 giây liền**.
Trích frame t=2s/t=9s xác nhận phụ đề cuốn chiếu (2 cụm khác nhau), nền mờ, chữ hạ thấp.

## 4. Lỗi CÒN LẠI đã sửa: Edge TTS rớt làm hỏng cả video
- Đo tỉ lệ hỏng: **8/12 hỏng khi chạy TUẦN TỰ** (67%), đo lại sau 5 phút vẫn **5/8 hỏng** (62%)
  ⇒ KHÔNG phải do chạy song song, cũng không phải nhất thời.
- Không có đường thay thế: router API của user (21 model) **không có model TTS**;
  Windows SAPI chỉ có giọng **en-US** (David/Zira), không có tiếng Việt.
- **Fix:** `tts_timing.py` retry NGAY TRONG tiến trình Python (`_once` + `_run`), mỗi lượt mở
  WebSocket mới, backoff luỹ thừa + jitter, mặc định **8 lượt** (`V2V_TTS_PY_ATTEMPTS`).
  Tiết kiệm ~1s khởi động interpreter cho mỗi lượt so với retry ở tầng Node.
  `_once` coi `audio_bytes == 0` là lỗi ⇒ bắt được cả ca "chạy xong nhưng rỗng".
- **Đo lại: 8/8 THÀNH CÔNG**, số lượt cần: 5, 1, 3, 1, 2, 5, 6, 6.
- Tầng Node vẫn giữ `runWithRetry` (6 lượt) + `_ttsGate` (2 luồng) ⇒ tổng ~48 lượt hiệu dụng.

## Files
byteplus/video_studio/tts_timing.py (retry trong Python). Các file khác giữ nguyên từ snapshot 003.
`npm test` **379/379**.

## Backup
`docs/BACKUPS/2026-09-18/MOC-OK-video-dat-yeu-cau/` — **MỐC USER XÁC NHẬN OK**
("a thấy video ok rồi á"): 13 file nguồn + `full-changes.patch` (362KB) + README hướng dẫn rollback:
`git apply -R docs/BACKUPS/2026-09-18/MOC-OK-video-dat-yeu-cau/full-changes.patch`
Thêm `docs/BACKUPS/2026-09-18/task-tts-hardening/` (bản trước khi vá tts_timing.py).

## Trạng thái bàn giao
- Server **ĐÃ TẮT** theo yêu cầu user, cache phân tích **đã xoá sạch (0 file)**, ffmpeg 0 tiến trình.
- User tự khởi động lại bằng `CHAY_TAT_CA_1_CLICK.bat` → chạy cổng **3100**
  (`http://localhost:3100/byteplus/video-to-video`), KHÔNG phải 20140 như lúc test.
  File .bat mở trình duyệt trước khi server lên ⇒ phải F5 lại lần đầu.

## Việc còn treo
- **CHƯA COMMIT** — user chưa duyệt. Toàn bộ thay đổi còn ở working tree.
- Bản vá TTS (mục 4) mới đo riêng 8/8, **chưa render lại full 10 video** để xác nhận 10/10.
- Project rác `E2E_TEST_CLAUDE` (`gtf_mu6fdqp8_7731e7`) còn trong danh sách — chờ user cho phép xoá.
