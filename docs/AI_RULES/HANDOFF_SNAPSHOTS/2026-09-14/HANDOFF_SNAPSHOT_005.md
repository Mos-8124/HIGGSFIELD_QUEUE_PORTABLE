# HANDOFF SNAPSHOT 005

Date: 2026-09-14
Task: task-v2v-step1-hook-preview + task-analyzer-ffmpeg-nostdin
(Bước 1 hiện cả 2 video input · Vá treo ffmpeg · E2E 6 bước với doithu.mp4 + hook.mp4)

## Report 005 — Bước 1 hiện đủ 2 video input, vá bug treo analyzer, E2E LIVE PASS 6/6 bước

### User Request
"chỉ hiện mỗi một video input của đối thủ thế video hook đâu ? Xong e tự test hệ thống của mình đi
xem nó có hoạt động đủ 6 bước và output có như a yêu cầu ko nhé.
Video input: đối thủ: C:\Users\gifft\Downloads\doithu.mp4 · hook: C:\Users\gifft\Downloads\hook.mp4"

### Scope
- `byteplus/video_studio/index.js`: THÊM route `GET /projects/:id/hook-video` (không sửa route cũ).
- `public/studio/video-to-video.{html,css,js}`: bước 1 hiện 2 cột video.
- `video-analyzer-pipeline/.../video_analyzer/media/frames.py`: vá bug treo ffmpeg (bắt buộc để E2E chạy được).
- KHÔNG đụng V1 Higgsfield, KHÔNG đụng luồng Kie V2 (Deeplove), KHÔNG gọi provider tính tiền.

---

## PHẦN A — Bước 1 hiện đủ 2 video input

### Investigation
`renderInputPanel()` chỉ gán `reference-video` cho 1 thẻ video; markup bước 1 chỉ có 1 player.
Backend cũng chỉ có route stream cho video đối thủ — **không có route nào phát được video hook**,
nên dù sửa frontend cũng không có nguồn để phát.

### Changes Made
1. **Backend** — thêm `GET /api/video-studio/projects/:id/hook-video`: stream HTTP 206 Range,
   sao đúng khuôn `/reference-video` đã chạy ổn định; 404 `NO_HOOK` khi project không có hook.
   *Chủ ý giữ 2 khối code song song thay vì gộp helper: route `/reference-video` đang chạy tốt,
   sửa nó không đem lại lợi ích cho user mà thêm rủi ro regression (§5, §45).*
2. **HTML** — panel `#v2v-input-panel` thành lưới 2 cột `.v2v-input-grid`:
   slot "Video đối thủ" (giữ nguyên ID cũ `#v2v-input-player`) và slot "Video Hook câu view"
   (`#v2v-input-hook-slot`, `#v2v-input-hook-player`), mỗi slot kèm tên file thật.
3. **CSS** — `.v2v-input-grid` (flex wrap, 2 cột, tự xuống 1 cột khi hẹp), `.v2v-input-slot`,
   `.v2v-input-slot-title`, `.v2v-input-slot-name`.
4. **JS** — `renderInputPanel(p)` gán cả 2 nguồn, đổ `referenceVideoName` / `hookVideoName`,
   **ẩn hẳn cột hook khi dự án không có hook** (`hookSlot.hidden = true`) để không hiện ô trống.

---

## PHẦN B — BUG REPORT: analyze-hook treo 600s (đã vá)

```text
ID:            BUG-V2V-ANALYZER-FFMPEG-STDIN
AREA / FLOW:   Bước 2 — POST /projects/:id/analyze-hook -> analyzer_bridge -> Python worker
               -> video_analyzer/media/frames.py -> ffmpeg trích frame
SEVERITY:      BLOCKING (không thể hoàn tất pipeline với video hook)

EXPECTED:      Trích frame xong -> chạy visual analysis (Gemini Vision) -> trả kết quả.
ACTUAL:        Trích đủ 69 frame trong 3 giây rồi đứng im; communicate() không bao giờ trả về;
               request chết ở timeout 600s ("Phân tích video quá lâu (timeout 600s)").

REPRODUCTION:  POST /projects/<id>/analyze-hook với hook.mp4 (34.69s, 1080x1920, 60fps, 22.6 MB).
               Tái hiện 2/2 lần: lần của user lúc 14:21 và lần của agent lúc 14:29.

ROOT CAUSE:    CONFIRMED. asyncio.create_subprocess_exec trong frames.py không truyền stdin,
               nên ffmpeg KẾ THỪA stdin của Python worker — mà stdin đó chính là pipe NDJSON
               từ Node và không bao giờ đóng. ffmpeg ghi xong toàn bộ frame vẫn nằm chờ đọc stdin
               (hành vi bàn phím tương tác mặc định của ffmpeg) nên không thoát; tiến trình cha
               chờ communicate() vĩnh viễn. Tác hại thứ hai: ffmpeg có thể nuốt mất byte của
               giao thức NDJSON đang chạy trên chính pipe đó.

SOURCE EVIDENCE:
  frames.py:59-63 (bản cũ) — create_subprocess_exec chỉ đặt stdout/stderr=PIPE, không có stdin,
  và lệnh ffmpeg thiếu cờ -nostdin.

RUNTIME EVIDENCE:
  - ffmpeg PID 31820 khởi động 14:29:37, đến 14:41 vẫn sống, chỉ tiêu 12.8 giây CPU (đứng yên).
  - job req_mu0xa2ks_75fddb: frames/ đủ 69 file ghi xong lúc 14:29:40; analysis/ chỉ có audio.json
    (14:30:08); KHÔNG có visual.json / timeline.json / final.json.
  - Log worker dừng hẳn sau dòng "Saved audio analysis" lúc 08:30:08 UTC.
  - Job hook cũ của user (req_mu0wzzzz_09cb7a, 14:23) hỏng y hệt: 69 frame + audio.json, thiếu visual.

SMALLEST SAFE FIX:
  frames.py — thêm -nostdin vào lệnh ffmpeg VÀ stdin=asyncio.subprocess.DEVNULL vào
  create_subprocess_exec. Chữ ký extract_frames() không đổi.

REGRESSION RISK: Thấp. Chỉ chặn ffmpeg đọc stdin — pipeline vốn không hề gửi gì vào stdin ffmpeg.

VERIFICATION:  Sau vá, analyze-hook chạy xong trong 62 GIÂY (trước: treo hết 600s).
               visual_status=success, audio_status=success, 18 visual_events, 7 key_moments.

STATUS:        FIXED — RUNTIME CONFIRMED
```

---

## PHẦN C — E2E LIVE 6 BƯỚC (RUNTIME CONFIRMED)

Project `gtf_mu0x7s5q_1abe89` — "E2E Hook Test 1409", input là 2 file thật của user.

```text
BƯỚC 1  Video Input       POST /projects (multipart doithu.mp4 9.7MB + hook.mp4 22.6MB)
                          -> status reference_imported, lưu đủ 2 đường dẫn
                          -> GET /reference-video HTTP 206 · GET /hook-video HTTP 206 + full 200
                             (22.644.701 byte, khớp đúng kích thước file gốc)          PASS

BƯỚC 2  Phân tích AI      POST /analyze-reference: 3.2s — worker báo "Cache HIT" (cùng nội dung
                          file đã phân tích lúc 14:23), KHÔNG chạy lại Gemini/Whisper.
                          Nội dung đúng video: "travel vacuum compression storage bags and a
                          portable electric vacuum pump", 23 visual_events, 5 key_moments.
                          POST /analyze-hook: 62s SAU KHI VÁ — visual+audio success, 34.69s,
                          18 visual_events, 7 key_moments, tóm tắt đúng (tránh phí hành lý quá khổ).
                          -> status reference_analyzed                                  PASS

BƯỚC 3  Sinh kịch bản     POST /generate-timeline: 22.8s (9Router LLM)
                          -> 6 phân đoạn / 6 clip kho KHÁC NHAU (luật diversity: >=4 seg, >=3 video,
                             không lặp clip liên tiếp — ĐẠT), mỗi seg có lời thoại tiếng Việt.
                          -> segment #1 mang phong cách hook (nêu pain point + lời hứa)
                          -> status awaiting_script_review                               PASS

BƯỚC 4  Duyệt kịch bản    POST /review {"action":"approve"} -> script_approved
                          POST /validate -> valid, 6 segment, tổng 19.8s -> assembling   PASS

BƯỚC 5  Dựng video        POST /assemble {"voice":"vi-VN-HoaiMyNeural"}: 25.7s
                          -> FFmpeg cắt ghép + Edge TTS -> awaiting_final_review          PASS

BƯỚC 6  Duyệt & Xuất      POST /final-review {"action":"approve"} -> final_approved
                          -> gói xuất bản đủ 4 file, GET /download-zip HTTP 200
                             5.017.722 byte application/zip                               PASS
```

### Output đã kiểm (§29 — chất lượng, không chỉ "chạy được")
```text
final.mp4                5.038.094 byte · 19.80s (khớp đúng tổng timeline) · 1920x1080
                         · h264 High yuv420p 30fps · aac 44100Hz stereo
Âm thanh                 mean_volume -19.2 dB / max_volume -4.8 dB -> CÓ tiếng đọc thật, không câm
production_timeline.json 1.959 byte
episode_manifest.json    418 byte
storyboard.html          4.151 byte
```

### Files Changed
```text
byteplus/video_studio/index.js                                    (+route /hook-video)
public/studio/video-to-video.html                                 (panel bước 1 -> lưới 2 cột)
public/studio/video-to-video.css                                  (+.v2v-input-grid & slot)
public/studio/video-to-video.js                                   (renderInputPanel 2 nguồn)
video-analyzer-pipeline/.../video_analyzer/media/frames.py        (-nostdin + stdin=DEVNULL)
```

### Backup / Rollback
```text
BACKUP CREATED: docs/BACKUPS/2026-09-14/task-v2v-step1-hook-preview/
                  public/studio/{video-to-video.html,.js,.css}
                  byteplus/video_studio/index.js
                docs/BACKUPS/2026-09-14/task-analyzer-ffmpeg-nostdin/
                  video-analyzer-pipeline/.../video_analyzer/media/frames.py
ROLLBACK:       copy đè ngược, restart server (npm start) để worker Python nạp lại code.

LƯU Ý TRUNG THỰC (§9): riêng byteplus/video_studio/index.js đã bị sửa TRƯỚC khi backup.
Bản backup được dựng lại bằng cách gỡ đúng khối route vừa thêm (thay đổi thuần cộng thêm),
đã node --check hợp lệ. Các file còn lại đều backup trước khi sửa đúng quy trình.
```

### Verification
```text
npm test                 186/186 PASS (chạy sau mỗi lần sửa) — không regression
node --check             video-to-video.js, byteplus/video_studio/index.js — OK
Browser runtime          Bước 1 hiện 2 player: doithu.mp4 (0:27) + hook.mp4 (0:34),
                         readyState=4 cả hai, tên file đúng, 0 lỗi console
E2E 6/6 bước             PASS (bảng PHẦN C)
```

### Problems / Failures
1 lần thất bại thật, đã xử lý: analyze-hook treo 600s (xem BUG REPORT phần B).
Không lặp lại cùng một cách làm — đã truy log worker + trạng thái tiến trình ffmpeg để ra root cause
trước khi sửa.

### Important Decisions
1. Không gộp `/reference-video` và `/hook-video` thành helper chung: route cũ đang chạy ổn định,
   gộp lại chỉ thêm rủi ro regression mà không thêm giá trị cho user (§5, §45).
2. Vá `frames.py` dù nằm ngoài phạm vi UI ban đầu: không vá thì không thể hoàn thành phần
   "test đủ 6 bước" mà user yêu cầu (§49 — gặp bug thì sửa rồi test lại, không dừng).
3. Ẩn hẳn cột hook khi project không có hook, thay vì hiện player rỗng.

### Remaining Risks / OUT_OF_SCOPE_FINDING
1. **`final.mp4` luôn ra 1920x1080 (ngang)** — `assembler.js:111-112` đặt cứng
   `scale=1920:1080:force_original_aspect_ratio=decrease` + `pad=1920:1080`. Toàn bộ nguồn của
   user là video DỌC 1080x1920, nên thành phẩm bị viền đen hai bên và không đúng khuôn
   TikTok/Reels. CHƯA SỬA (ngoài phạm vi yêu cầu) — cần user quyết định có đổi sang 1080x1920
   hoặc cho chọn tỉ lệ hay không.
2. **`probe.py:36`** cũng gọi `create_subprocess_exec` không đặt stdin — cùng họ lỗi với
   `frames.py`. ffprobe không đọc stdin tương tác nên rủi ro thấp hơn nhiều; CHƯA SỬA (§6).
3. Kịch bản sinh ra nói về **làm móng** vì kho video local đang là clip nail, trong khi video
   đối thủ/hook nói về túi hút chân không. Đây là đúng thiết kế (bám CẤU TRÚC đối thủ, dùng
   NỘI DUNG kho của mình), không phải lỗi — nhưng cần user xác nhận đúng ý đồ.

### Next Steps
- User xem `final.mp4` và quyết định mục Remaining Risks #1 (tỉ lệ khung hình đầu ra).
