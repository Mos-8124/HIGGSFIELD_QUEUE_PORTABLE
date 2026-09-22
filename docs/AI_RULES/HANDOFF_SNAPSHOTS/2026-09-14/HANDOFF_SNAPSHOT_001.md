# HANDOFF SNAPSHOT 001

Date: 2026-09-14
Task: task-v2v-library-modal-and-auto-describe

## Hoàn thiện Giao diện Chi tiết Video Modal & Tự động Phân tích Mô tả AI (SRS §4)

### 1. Bối cảnh & Yêu cầu từ User:
1. Gỡ bỏ hoàn toàn nút quét hàng loạt dư thừa trên thanh công cụ thư viện: *"🤖 AI Mô tả toàn bộ kho (§4)"*.
2. Khi người dùng bấm vào một video bất kỳ trong kho hoặc bấm nút *"🔍 AI Mô tả"*, hệ thống phải mở một trang giao diện riêng (Modal):
   - Phía trên: Trình phát video phát trực tiếp video từ kho local.
   - Phía dưới video: Hiển thị đầy đủ thông tin mô tả AI của video đó gồm Tóm tắt nội dung (AI Summary) và Bảng chỉ mục mô tả chi tiết theo từng giây (Media Description Index theo SRS §4) với các mốc thời gian tua nhanh, phân cảnh, hành động chi tiết và đối tượng xuất hiện.
3. Khi nạp video vào kho (upload hoặc scan thư mục local), toàn bộ video phải được AI phân tích tự động và hiển thị kết quả trên giao diện thay vì để trống.

---

### 2. Các thay đổi kỹ thuật chi tiết:

#### A. Backend (`byteplus/video_studio/`)
1. **HTTP 206 Partial Streaming (`index.js`)**:
   - Thêm route `GET /api/video-studio/library/video/:id` phục vụ streaming video MP4 hỗ trợ header `Range` và `Accept-Ranges: bytes` để thẻ `<video>` có thể play, tua tiến/lùi mượt mà.
2. **API Phân tích theo yêu cầu (`POST /api/video-studio/library/describe`)**:
   - Nhận `{ assetId }` để phân tích ngay lập tức 1 clip chỉ định, lưu cả `descriptionIndex` và `description_index`, `aiDescription`, và trả về `{ success: true, asset }`.
3. **Hàng đợi phân tích nền tự động (`queueBackgroundDescribe`)**:
   - Tích hợp vào sau các thao tác `/library/upload` và `/library/scan`.
   - Chạy nền tuần tự qua `analyzerWorker` (Gemini Vision + Whisper qua 9Router) cho các clip chưa có mô tả (`!a.described`) mà không làm nghẽn luồng xử lý chính.
4. **Bảo toàn dữ liệu mô tả khi quét lại kho (`library.js`)**:
   - Trong `scanLibrary()`, cập nhật logic cập nhật asset để giữ nguyên `descriptionIndex` và `aiDescription` của các video đã phân tích trước đó, tránh bị ghi đè thành null khi quét lại thư mục.

#### B. Frontend UI & Interaction (`public/studio/`)
1. **Dọn dẹp nút dư thừa (`video-to-video.html`, `video-to-video.js`)**:
   - Gỡ bỏ hoàn toàn nút `#v2v-describe-all-btn` và hộp thông báo `#v2v-describe-status`.
   - Gỡ bỏ event listener tương ứng trong `DOMContentLoaded` để tránh lỗi `TypeError: null addEventListener`.
2. **Modal Giao diện Chi tiết Video (`video-to-video.html`, `video-to-video.css`)**:
   - Khung modal `#v2v-asset-modal` với nền mờ backdrop blur.
   - Video player `<video id="v2v-modal-video">` chiếm vị trí trung tâm phía trên.
   - Thanh toolbar hiển thị metadata kỹ thuật (độ phân giải, fps, codec, dung lượng) cùng nút hành động `🤖 AI Phân tích mô tả video này` / `🔄 Phân tích lại bằng AI`.
   - Hộp tóm tắt nội dung AI (`#v2v-modal-summary`).
   - Bảng chỉ mục chi tiết theo từng giây (`#v2v-modal-events-table`) với các liên kết mốc thời gian `window.__v2v_seek(sec)` cho phép người dùng click để tua phát ngay phân đoạn đó.
3. **Xử lý sự kiện Modal (`video-to-video.js`)**:
   - Viết các hàm: `openAssetModal(assetId)`, `closeAssetModal()`, `renderModalDescription(a)`, `doAnalyzeModalAsset(assetId)`, và `window.__v2v_seek(sec)`.
   - Gắn sự kiện click trên toàn bộ card `.v2v-asset` và nút `data-open` để mở modal.
   - Gắn sự kiện đóng modal qua nút ✕, click backdrop ra ngoài, hoặc bấm phím `Escape`.

---

### 3. Kết quả Kiểm thử & Trạng thái:
- **Tự động**: Chạy `node tests/runner.js` đạt **186/186 tests PASS (100%)**.
- **Kiểm chứng giao diện (Visual Verification)**: Dùng Puppeteer chụp ảnh màn hình xác nhận:
  * Kho video sạch sẽ, không còn nút bulk describe cũ (`verify_library_scrolled.png`).
  * Modal mở hoàn chỉnh, video phát nét, bảng mô tả từng giây và AI summary hiển thị đầy đủ (`verify_modal_detail.png`).
- **Runtime**: Server chạy nền tại `http://localhost:20140`.
