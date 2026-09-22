# HANDOFF SNAPSHOT 004

Date: 2026-09-14
Task: task-v2v-dropzone-video-preview (Hiển thị preview video input ngay trên dropzone tạo dự án)

## Report 004 — Dropzone tạo dự án hiển thị video preview thay vì chỉ tên file

### User Request
"fix cho a cái này. Làm nó hiển thị video input cho user dễ kiểm soát"
(kèm ảnh chụp form tạo dự án: 2 ô dropzone sau khi chọn file chỉ hiện `✓ doithu.mp4` / `✓ hook.mp4`,
người dùng không xác nhận được mình vừa chọn đúng clip hay chưa.)

### Scope
- Frontend thuần: `public/studio/video-to-video.{html,css,js}`.
- KHÔNG đụng backend, KHÔNG đổi hợp đồng API, KHÔNG đụng V1 Higgsfield và luồng Kie V2 (Deeplove).

### Investigation
- `updateDropzoneState()` (cũ, nằm trong callback `DOMContentLoaded`) chỉ gán `textContent = '✓ ' + file.name`
  và bật class `v2v-has-file`. Không có bất kỳ phần tử media nào trong dropzone để xem lại clip.
- `createProject()` ở scope IIFE tự lặp lại logic dọn dẹp (gỡ class + xoá filename) vì không gọi được
  `updateDropzoneState()` — hàm này bị kẹt trong scope con. Đây là lý do phải nâng hàm lên scope IIFE
  thay vì viết thêm hàm dọn dẹp thứ hai.
- Helper `fmtDur()` / `fmtSize()` đã có sẵn ở scope IIFE (dòng 24 & 29) → tái dùng, không viết mới.

### Changes Made

#### 1. `public/studio/video-to-video.html`
Trong mỗi dropzone (`#v2v-ref-dropzone`, `#v2v-hook-dropzone`) thêm 3 phần tử MỚI,
giữ nguyên 100% ID/class cũ (§21):
- `<button class="v2v-dropzone-clear" id="v2v-{ref,hook}-clear">✕</button>` — gỡ video đã chọn.
- `<video class="v2v-dropzone-preview" id="v2v-{ref,hook}-preview" controls muted playsinline preload="metadata">`.
- `<span class="v2v-dropzone-meta" id="v2v-{ref,hook}-meta">` — thời lượng · độ phân giải · dung lượng.

#### 2. `public/studio/video-to-video.css`
Thêm mới (không sửa/xoá rule cũ): `.v2v-dropzone-preview` (width 100%, height 140px,
`object-fit: contain`, nền đen — video dọc lẫn ngang đều hiện trọn khung), `.v2v-dropzone-meta`,
`.v2v-dropzone-clear` (nút tròn góc phải trên), và 4 rule hiện/ẩn theo `.v2v-has-file`
(hiện preview/meta/nút gỡ, ẩn icon để tiết kiệm chiều cao).

#### 3. `public/studio/video-to-video.js`
- Nâng `updateDropzoneState(dz, input)` từ scope `DOMContentLoaded` lên scope IIFE (chữ ký giữ nguyên).
  Bản mới: tạo `URL.createObjectURL(file)` gán vào `<video>`, ghi filename + `fmtSize()`,
  và **`URL.revokeObjectURL()` object URL của file trước** mỗi lần đổi/gỡ file để không rò bộ nhớ.
- Listener `loadedmetadata` trên `<video>`: ghi `fmtDur(duration) · videoWidth×videoHeight · fmtSize(size)`.
- Nút `✕`: `stopPropagation()` → `input.value = ''` → `updateDropzoneState()`.
- Handler click của dropzone bỏ qua click rơi vào `<video>` (để xem/tua được) và vào nút `✕`;
  click vào vùng còn lại vẫn mở file picker nên vẫn thay được file như cũ.
- `createProject()` reset dropzone bằng cách gọi `updateDropzoneState()` thay vì tự gỡ class
  (trước đây bỏ sót việc thu hồi object URL vì chưa có preview).

### Files Changed
```text
public/studio/video-to-video.html   (+6 phần tử trong 2 dropzone)
public/studio/video-to-video.css    (+27 dòng, chỉ thêm mới)
public/studio/video-to-video.js     (updateDropzoneState nâng scope + preview/clear/meta)
```

### Backup / Rollback
```text
BACKUP CREATED: docs/BACKUPS/2026-09-14/task-v2v-dropzone-video-preview/public/studio/
                {video-to-video.html, video-to-video.js, video-to-video.css}
ROLLBACK:       copy 3 file trên đè ngược lại public/studio/ — không cần restart server
                (đều là static asset), chỉ cần hard-reload trình duyệt.
```

### Verification

```text
TEST:     node --check public/studio/video-to-video.js
EXPECTED: không lỗi cú pháp
OBSERVED: JS SYNTAX OK
RESULT:   PASS

TEST:     npm test (regression toàn hệ)
EXPECTED: >= 186/186 như trước khi sửa
OBSERVED: Tier1 62/62 · Tier2 49/49 · Tier3 48/48 · Tier4 27/27 = 186/186, 0 failed, 6.42s
RESULT:   PASS — không regression

TEST:     RUNTIME — nạp file thật vào cả 2 dropzone trên http://localhost:20140
INPUT:    2 clip thật trong kho (VID_fcc80dc178 576x1024 7.3s · VID_1fa6604835 576x1024 12.5s)
          nạp qua DataTransfer + dispatch 'change' (đúng code path của file picker)
EXPECTED: preview hiện, src là blob:, metadata đọc được, meta text đúng
OBSERVED: hasFileClass=true · previewDisplay="block" · srcIsBlob=true · videoWidth/Height=576/1024
          refMeta="7s · 576×1024 · 865 KB" · hookMeta="13s · 576×1024 · 2.5 MB" · nút ✕ hiện
RESULT:   PASS

TEST:     FAILURE/EDGE — click vào video có mở nhầm file picker không
EXPECTED: click video = 0 lần mở picker; click nhãn = vẫn mở picker (thay file được)
OBSERVED: pickerOpenedByVideoClick=0 · pickerOpenedByLabelClick=1
RESULT:   PASS

TEST:     FAILURE/EDGE — nút ✕ gỡ video
EXPECTED: về trạng thái rỗng hoàn toàn, không ảnh hưởng ô còn lại
OBSERVED: hasFileClass=false · previewDisplay="none" · src=null · filename="" · meta=""
          · input.files.length=0 · hint hiện lại · dropzone Hook vẫn giữ nguyên file
RESULT:   PASS

TEST:     Console trình duyệt
EXPECTED: 0 lỗi
OBSERVED: No console logs (onlyErrors)
RESULT:   PASS
```

### Runtime Evidence
Ảnh chụp màn hình runtime (1400x900, http://localhost:20140/studio/video-to-video.html):
hai ô dropzone viền xanh hiện player video phát được, nhãn slot, tên file và dòng thông số;
sau khi bấm ✕ ở ô "Video đối thủ", ô này trở về viền đứt nét với icon 🎯 + "Kéo thả hoặc bấm chọn",
trong khi ô "Video Hook" vẫn giữ nguyên preview.

### Problems / Failures
Không có. Không phát sinh hướng làm nào thất bại.

### Important Decisions
1. `object-fit: contain` + nền đen thay vì `cover`: video dọc (định dạng chính của kho) phải thấy
   **trọn khung hình** để kiểm tra đúng clip, chấp nhận có viền đen hai bên.
2. Nâng `updateDropzoneState()` lên scope IIFE thay vì viết hàm dọn dẹp thứ hai trong `createProject()` —
   tránh hai đường dọn dẹp lệch nhau (bản cũ trong `createProject()` đã bỏ sót revoke object URL).
3. Giữ hành vi cũ "click dropzone = mở file picker" để vẫn thay file nhanh; chỉ loại trừ vùng
   `<video>` và nút `✕`.

### Remaining Risks
- `DataTransfer` (dùng cho kéo–thả) không hỗ trợ trên trình duyệt rất cũ — đây là hành vi có từ trước,
  không phải rủi ro mới phát sinh.
- Preview dựa vào codec trình duyệt giải mã được. Clip mã hoá lạ (ví dụ HEVC trên Chrome không hỗ trợ)
  sẽ hiện khung đen, nhưng tên file + dung lượng vẫn hiển thị và việc upload không bị ảnh hưởng.

### Next Steps
Không có hạng mục bắt buộc tiếp theo. Trạng thái các phần khác giữ nguyên như HANDOFF §4.
