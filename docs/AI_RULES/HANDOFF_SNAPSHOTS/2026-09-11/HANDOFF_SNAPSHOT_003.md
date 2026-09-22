# HANDOFF SNAPSHOT 003

Date: 2026-09-11
Task: `task-video-to-video-tool`

## Report 3 — Tool độc lập "Video to Video" (GTF Video Studio Phase 1 trong HIGGSFIELD)

### User Request
> Tạo các phần còn thiếu của SRS + tạo luồng mới trong hệ tool mới: nút "Video to Video",
> cùng cổng nhưng path khác, tool độc lập; biến logo AI STUDIO thành button để chuyển
> qua lại 2 giao diện (Video to Video ↔ AI STUDIO). Đọc rule + viết handoff sau khi xong.

### Scope
- Thêm MỚI trong HIGGSFIELD (Node), KHÔNG đụng luồng Kie (`/byteplus` studio cũ), KHÔNG đụng V1.
- Chỉ làm phần KHÔNG vướng 2 quyết định còn treo (model xem video? FFmpeg vs Kie?):
  điều hướng + Local Media Library (SRS §3) + khung GTF Project.

### Changes Made
- Nav: `public/studio/index.html` — logo AI STUDIO thành `<a>` button + thêm nút "VIDEO TO VIDEO";
  CSS `.studio-switch/.switch-alt` thêm vào `public/studio/studio.css`. Giữ nguyên mọi ID/selector cũ.
- Route: `server.js` — mount `/api/video-studio` (router mới) + serve trang
  `/byteplus/video-to-video` (+ alias `/studio/video-to-video`, `/video-to-video`).
- Backend mới `byteplus/video_studio/`:
  - `library.js` — scanner ffprobe (SRS §3): metadata + fingerprint + category + incremental; inject probeFn cho test.
  - `index.js` — `VideoStudioStore` (JSON: `video_studio_library.json`, `video_studio_projects.json`)
    + `createVideoStudioRouter()`: `/status`, `/library/scan|assets|assets/:id|stats`, `/projects`.
    FSM 13 state (SRS §14). flush() cho shutdown.
- UI mới: `public/studio/video-to-video.html` + `.js` + `.css` — panel Thư viện (quét/hiện clip/stats),
  Project + video đối thủ, và khu "các bước tiếp theo" (placeholder có nhắc §4/§6/§7/§8/§9-11/§12).

### Files Changed
server.js, public/studio/index.html, public/studio/studio.css (+ mới: byteplus/video_studio/library.js,
byteplus/video_studio/index.js, public/studio/video-to-video.{html,js,css}, tests/video_studio.test.js), tests/runner.js, .gitignore.
Backup: docs/BACKUPS/2026-09-11/task-video-to-video-tool/ (server.js, index.html).

### Verification
- npm test: 181/181 PASS (173 cũ + 8 mới video_studio). 0 live call.
- Boot 20140 OK; `/api/video-studio/status` trả stats; `/byteplus/video-to-video` HTTP 200; `/byteplus` (studio cũ) HTTP 200 (không regression).
- Live browser: nút AI STUDIO ↔ VIDEO TO VIDEO chuyển đúng 2 path; quét thư viện thật (fixture mp4)
  → 2 clip, đúng category people/b-roll, ffprobe đọc duration/size; UI render grid + chips.

### Runtime Evidence
- POST /api/video-studio/library/scan {folder} -> {added:2, byCategory:{people:1,'b-roll':1}, totalDurationSeconds:8}.
- Demo data đã dọn sau test; video_studio_*.json đã gitignore.

### Problems / Failures
- Test persistence fail 1 lần do JsonStore.save() ghi bất đồng bộ -> đã thêm VideoStudioStore.flush() và await trong test. Giờ pass.

### Important Decisions
- Tool độc lập theo PATH (2 trang riêng) thay vì SPA view — blast radius thấp, không entangle studio.js cũ (§21).
- API tách namespace `/api/video-studio`, state file riêng — không dùng chung DB với luồng Kie.
- KHÔNG bịa bước AI: các chặng cần vision/LLM để placeholder cho tới khi chốt thiết kế.

### Remaining Risks / CHƯA LÀM (nhắc user theo SRS)
- §4 Media Description Index (mô tả kho theo giây) — CẦN model xem được video/ảnh.
- §5-6 Reference import thật + Reference Analysis (phân tích video đối thủ).
- §7 Production Timeline (sinh kịch bản) + §8 cổng duyệt + §9 validate.
- §10-11 Assembly: FFmpeg cắt kho HAY đẩy Kie sinh mới — CHƯA CHỐT.
- §12 Final review + xuất final.mp4/production_timeline.json/storyboard.html.
- §13 No auto publish (chưa tới bước này).

### Next Steps
- Chốt 2 điểm: (a) model 9Router có xem video/ảnh không (nếu không -> FFmpeg trích frame gửi ảnh); (b) chặng cuối FFmpeg vs Kie.
- Sau đó làm §4 (mô tả kho) trước vì là nền cho §7.

---

## Bổ sung: KHO cố định + Upload (2026-09-11)

User yêu cầu kho phải là thư mục cố định trong dự án, upload video qua UI thì lưu thẳng về kho.
- Library root cố định: `<project>/kho` (mặc định), override qua env `VIDEO_STUDIO_LIBRARY_DIR`.
  Hàm `resolveLibraryDir()` trong `byteplus/video_studio/index.js`.
- Route mới `POST /api/video-studio/library/upload` — dùng lại `byteplusMultipart(KHO)` (0 dependency),
  lưu file video thẳng vào kho, loại file không phải video, rồi tự `scanLibrary(KHO)` để index.
- `/library/scan` mặc định quét KHO khi không truyền folder. `/status` trả `libraryDir`.
- UI đổi: bỏ ô gõ đường dẫn -> hiện đường dẫn kho cố định + nút "Tải video vào kho" (upload) +
  "Quét lại kho"; lần đầu mở trang tự quét kho để index file có sẵn.
- gitignore: `/kho/*` (giữ `.gitkeep`) — không commit file media.

Verify live: kho `D:\Tinh\Work\HIGGSFIELD_QUEUE_PORTABLE\kho` có 24 file user bỏ sẵn ->
scan added 24, tổng 230.81s (~3m51s), 28MB, 0 lỗi ffprobe; UI tự hiện 24 clip + đường dẫn kho.
npm test vẫn 181/181.

---

## Bổ sung: Video đối thủ = UPLOAD từ máy user (không gắn link) (2026-09-11)

- Video đối thủ (reference) tách RIÊNG khỏi kho nguồn: lưu ở `video_studio_references/`
  (override env `VIDEO_STUDIO_REFERENCES_DIR`), gitignored.
- `POST /api/video-studio/projects` đổi sang nhận multipart (byteplusMultipart(REF_DIR)):
  field `name` + file video đối thủ user chọn từ máy (field bất kỳ, lọc lấy video).
  File non-video bị xoá. Project lưu referenceVideoPath (trong REF_DIR) + referenceVideoName.
- UI: ô "đường dẫn video đối thủ" -> input type=file (accept video), chọn từ máy user.
- Verify: tạo project + upload -> status reference_imported, file vào video_studio_references/,
  kho KHÔNG bị lẫn. npm test 181/181.

---

## Bổ sung: Đảo thứ tự UI + Thumbnail (2026-09-11)

- UI đảo thứ tự: mục "Project + Video tham chiếu (đối thủ)" nằm TRÊN, "Thư viện nguồn (kho)" nằm DƯỚI.
- Mỗi clip kho hiện ẢNH thumbnail: `generateThumbnail()` (ffmpeg lấy 1 khung, scale 400px, JPEG) trong library.js;
  route `GET /api/video-studio/library/thumb/:id` sinh on-demand + cache vào `video_studio_thumbs/` (gitignored).
  Chống sinh trùng (1 ffmpeg/asset) + warmThumbs() làm ấm cache TUẦN TỰ sau scan/upload (tránh 24 ffmpeg song song).
  Bỏ loading=lazy để ảnh hiện ngay (grid nhỏ, đã cache).
- Verify: scan 24 clip -> warm đủ 24 thumbnail; UI load 24/24 ảnh; thứ tự reference-trên/library-dưới đúng. npm test 181/181.
