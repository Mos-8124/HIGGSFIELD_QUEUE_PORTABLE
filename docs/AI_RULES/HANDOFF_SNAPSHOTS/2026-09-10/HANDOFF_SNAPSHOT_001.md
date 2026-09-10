# HANDOFF SNAPSHOT 001

Date: 2026-09-10
Task: `task-deeplove-references-display`

---

## 1. USER REQUEST & SCOPE

1. **Hiển thị đầy đủ nguồn tham chiếu (Ảnh, Video, KOL ảo) trong cột Prompt của hàng chờ**:
   - Thay vì chỉ hiển thị mỗi video kết quả (`🎬 Kết Quả / Xem Video`), khi xem trong phần prompt (và khi bấm "Xem thêm"), phải hiển thị đầy đủ toàn bộ nguồn tham chiếu đã import vào task:
     - 📷 **Ảnh tham chiếu** (`type === 'image'`): Tên file, nhãn badge `@Image X`, thumbnail thu nhỏ, click phóng to bằng modal Lightbox.
     - 🎬 **Video tham chiếu** (`type === 'video'`): Tên file, nhãn badge `@Video X`, thumbnail/icon, rê chuột phát thử, click xem bằng modal Lightbox.
     - 👤 **Nhân vật KOL ảo** (`type === 'kol'`): Tên nhân vật KOL, nhãn badge `👤 KOL`, ảnh chân dung đại diện từ thư viện KOL, click xem chân dung bằng modal Lightbox.
     - 🎬 **Video kết quả** (`is-result`): Thẻ video kết quả màu xanh ngọc bích, click phát video kết quả trong modal Lightbox.
2. **Hỗ trợ đầy đủ mở rộng / thu gọn Prompt ("Xem thêm ▾" / "Thu gọn ▴")**:
   - Khi prompt dài, bấm "Xem thêm ▾" mở rộng toàn bộ prompt, các thẻ tham chiếu luôn hiển thị ngay ngắn, không vỡ layout.
   - Khi bấm "Thu gọn ▴", prompt thu về 2 dòng, các thẻ tham chiếu vẫn nằm gọn gàng bên dưới.

---

## 2. ROOT CAUSE ANALYSIS

- **Nguyên nhân gốc rễ:**
  1. Trong `public/studio/studio.js`, logic render bảng hàng chờ đang đọc thuộc tính cũ của V1:
     ```javascript
     const allImgs = (Array.isArray(task.imagePaths) && task.imagePaths.length > 0) ? task.imagePaths : (task.imagePath ? [task.imagePath] : []);
     const allVids = (Array.isArray(task.videoPaths) && task.videoPaths.length > 0) ? task.videoPaths : (task.videoPath ? [task.videoPath] : []);
     ```
  2. Hệ thống Deeplove Studio V2 (`task_factory.js`) lưu toàn bộ tham chiếu trong mảng **`task.references`** với cấu trúc đa dạng (`type: 'image' | 'video' | 'kol'`).
  3. Do `task.imagePaths` và `task.videoPaths` không tồn tại trên task mới, `imgTagsHtml` và `videoTagHtml` luôn rỗng (`""`).
  4. Nhân vật KOL ảo (`type === 'kol'`) hoàn toàn chưa có logic bóc tách hay render trong hàm hiển thị bảng.
  5. Hàm `loadKolsList()` trong `studio.js` bị chặn bởi kiểm tra `if (!kolSelect) return;` nên danh sách `cachedKols` không được nạp nếu DOM chưa có dropdown `#kol-select`.
  6. Kết quả là giao diện chỉ hiển thị duy nhất mỗi thẻ `🎬 Kết Quả` (khi task có `outputWebPath`).

---

## 3. IMPLEMENTATION DETAILS

### 3.1 Backend (`byteplus/reference_manager.js` & `byteplus/routes.js`)
- **`byteplus/reference_manager.js`:**
  - Cập nhật `buildReference(raw)` để bảo toàn `previewUrl`, `thumbnailUrl`, và `localPath` cho các tham chiếu có `type === 'kol'`, tránh bị rơi rụng URL ảnh đại diện khi khởi tạo task.
- **`byteplus/routes.js`:**
  - Tại endpoint `GET /api/byteplus/queue`, tự động enrich các tham chiếu KOL chưa có URL bằng `thumbnailUrl` từ kho thư viện `kols.get(r.kolId)`.

### 3.2 Frontend Deeplove Studio (`public/studio/studio.js` & `public/studio/studio.css`)
- **`public/studio/studio.js`:**
  - Cập nhật `getMediaUrl(p)`: Nhận diện đường dẫn `byteplus_uploads` và map chuẩn về `/api/byteplus/upload-preview/...`.
  - Bóc tách đầy đủ từ `task.references`:
    - `refImages`: Lọc các tham chiếu ảnh (kèm fallback mảng cũ V1 `task.imagePaths`).
    - `refVideos`: Lọc các tham chiếu video (kèm fallback mảng cũ V1 `task.videoPaths`).
    - `refKols`: Lọc các tham chiếu KOL ảo từ thư viện.
  - Tạo thẻ UI tương ứng cho từng loại:
    - `imgTagsHtml`: Badge `📷 @Image X`, xem trước thumbnail, click mở `openMediaModal`.
    - `videoTagHtml`: Badge `🎬 @Video X`, xem trước icon, rê chuột preview, click mở `openMediaModal`.
    - `kolTagHtml`: Badge `👤 KOL`, hiển thị ảnh đại diện KOL từ `cachedKols`/`previewUrl` hoặc avatar `👤`, click mở `openMediaModal`.
    - `videoResultHtml`: Thẻ kết quả `🎬 Kết Quả | Xem Video`.
  - Cập nhật tính toán chi phí credit `taskHasVid` tính cả `refVideos.length > 0`.
  - Cập nhật `loadKolsList()` luôn fetch `/api/byteplus/kols` vào `cachedKols` và kích hoạt re-render bảng khi dữ liệu sẵn sàng.
  - Kích hoạt `loadKolsList()` ngay trong chuỗi khởi tạo ban đầu `fetchInitialQueue()`.
- **`public/studio/studio.css`:**
  - Thêm class `.ref-media-item.is-kol` với viền tím nhạt `rgba(168, 85, 247, 0.35)` và hover tím sáng `#c084fc`.
  - Thêm badge `.ref-media-badge.kol-badge` màu tím `#c084fc`.
  - Thêm `.ref-thumb-wrap.ref-kol-avatar` với gradient tím mềm mại khi KOL chưa có ảnh thumbnail.

---

## 4. VERIFICATION & RESULTS

1. **Automated Tests:**
   - Chạy toàn bộ test suite `node tests/runner.js`.
   - Kết quả: **164/164 tests PASS (100%)** trên cả 4 Tier.
2. **Headless Chrome E2E Verification (Puppeteer):**
   - Đã kiểm tra trực tiếp DOM và render của task thực tế `bp_mtqsxuja_f77c3415`:
     - Nhận diện đủ **4 media items**:
       1. `📷 @Image 1: 20260907-170412.jpg` (Thumbnail ảnh hiển thị chuẩn).
       2. `🎬 @Video 1: Hero.mp4` (Thẻ video tham chiếu).
       3. `👤 KOL: Hero` (Thẻ KOL ảo với chân dung đại diện).
       4. `🎬 Kết Quả: Xem Video` (Thẻ video hoàn thành).
     - Test toggle "Xem thêm ▾" / "Thu gọn ▴": Prompt mở rộng toàn bộ và thu gọn mượt mà, các thẻ tham chiếu luôn gắn kết bên dưới.
     - Test modal click: Click vào thẻ ảnh tham chiếu mở modal Lightbox hiển thị ảnh gốc độ phân giải cao thành công.
