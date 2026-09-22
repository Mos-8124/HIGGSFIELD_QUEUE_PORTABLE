# HANDOFF SNAPSHOT 012 (2026-09-14 18:35)

## 1. Tóm Tắt Sự Cố & Quá Trình Giám Sát Thực Tế
Sau khi người dùng chạy lại tác vụ sinh video chú cún cyberpunk (`flow_mu155v0n_9672be`), hệ thống ghi nhận hai vấn đề liên tiếp khi giám sát trực tiếp luồng chạy:
1. **Lần submit 2 (18:26)**: Gặp lỗi `locator.click: Timeout 30000ms exceeded. <div class="cdk-overlay-backdrop ..."> intercepts pointer events`. Nút Tạo bị một lớp phủ tối màu của Angular Material chặn lại.
2. **Lần submit 3 (18:29)**: Nút Tạo đã được bấm thành công, nhưng sau 13s code lại bốc nhầm một video cũ (`d5eb0352-1cce-4c47...`) từ một ô tile trước đó trên canvas vì cơ chế lazy-load của Google Flow gắn thẻ `<video>` cho các tile cũ sau khi canvas tái cấu trúc.
3. **Kết quả thực tế từ Google Flow**: Sau khi submit 3 hoàn tất ở phía Google Flow (~45s sau khi bấm Tạo), video mới thực sự của chú cún cyberpunk đã được sinh hoàn tất tại **Tile index 0**:
   - UUID: `41d5542b-bfb1-473e-aef1-dd7d18794a5e`
   - Kích thước: `720x1280` (chuẩn 9:16 dọc)
   - Dung lượng: `3,224,310 bytes` (~3.22 MB)
   - Thời lượng: `4.01s`
   - Đã được cập nhật chuẩn xác vào: `flow_outputs/outputs/flow_mu155v0n_9672be/flow_mu155v0n_9672be-1.mp4`.

---

## 2. Phân Tích Kỹ Thuật & Hai Nguyên Nhân Gốc Rễ

### 2.1. Lỗi Lớp Phủ Tối Màu Intercept Pointer Events
- **Nguyên nhân**: Khi thực hiện `uploadMediaToFlow` hoặc `attachUploadedMediaToFlowPrompt`, Google Flow mở dialog chọn file và menu thêm thành phần (`.cdk-overlay-pane`). Sau khi chọn xong file, lớp phủ tối màu (`.cdk-overlay-dark-backdrop`) vẫn còn hiển thị. Khi Playwright cố gắng bấm nút Tạo (`flowCreateButton`), cơ chế kiểm tra pointer events của Playwright phát hiện backdrop che khuất nút và chờ 30 giây rồi ném lỗi Timeout.
- **Giải pháp**:
  - Viết hàm `dismissFlowOverlays(page)` gửi phím `Escape` cho đến khi toàn bộ `.cdk-overlay-backdrop` biến mất.
  - Gọi `dismissFlowOverlays(page)` ở cuối các bước upload, attach và ngay trước khi click nút Tạo.
  - Thêm cờ `{ force: true }` khi click nút Tạo để tránh bị chặn bởi bất kỳ hiệu ứng animation chuyển cảnh nào.

### 2.2. Lỗi Bốc Nhầm Video Cũ Do Lazy-Loading Trong Canvas Grid
- **Cơ chế DOM của Google Flow**:
  - Google Flow luôn chèn các video vừa tạo vào **đầu lưới (Tile index 0)**.
  - Các tile cũ trong project (từ index 1 trở đi) mặc định chỉ nạp ảnh thumbnail `<img class="thumbnail">`. Khi trang cuộn hoặc khi tile mới được chèn vào đầu lưới, một số tile cũ mới bắt đầu lazy-load thẻ `<video>` vào DOM.
  - Hàm `captureRenderedFlowVideos` cũ quét toàn bộ `flow-video-tile video, video` trên toàn trang. Khi thấy một thẻ `<video>` cũ bất ngờ xuất hiện mà chưa kịp có trong `preExistingKeys`, code liền tưởng nhầm đó là video mới tạo!
- **Giải pháp**:
  - **Giới hạn phạm vi quét (Target Scoping)**: Hàm `captureRenderedFlowVideos(page, preExistingKeys, requestedVariants)` giờ đây **chỉ quét duy nhất các tile mới ở đầu lưới (`tiles.nth(i)` với `i < requestedVariants`)**, tuyệt đối không bao giờ quét các tile cũ ở phía sau.
  - Quét trước toàn bộ URL cả `video` lẫn `img` (thumbnail) vào `preExistingVideoKeys` trước khi bấm Tạo.
  - Code sẽ kiên nhẫn đợi ở Tile 0 cho đến khi Tile 0 thực sự render xong thẻ `<video>` với `duration > 0` và dung lượng $> 50\text{ KB}$.

---

## 3. Trạng Thái Hệ Thống & Xác Thực Nghiệm Thu
- **Server Port 20140**: Hoạt động ổn định (`http://localhost:20140/byteplus/Flowqueue`).
- **File video chú cún**: Đã được lưu đè chính xác bằng file video thật `3,224,310 bytes` (720x1280), hiển thị đầy đủ trên giao diện quản lý Flowq.
- **Chrome CDP Port 9334**: Kết nối tốt.
- **Toàn bộ Test Suite**: **196/196 tests PASS (100%)**.
