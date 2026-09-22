# HANDOFF SNAPSHOT 003 — 2026-09-16

## Tasks Overview:
1. `task-v2v-prompt-hook-ui-layout-and-vietnamese-workflow` (8 hạng mục cốt lõi V2V)
2. `task-v2v-step-scroll-stepper-and-library-vietnamese` (4 yêu cầu tinh chỉnh UX/UI & Tiếng Việt)
3. `task-v2v-default-unselected-and-flowq-jobs-scroll` (Màn hình chờ V2V & Giới hạn 2 card Jobs Flow Queue)

---

### 1. Chi Tiết Các Hạng Mục Đã Thực Hiện

#### A. Trọn Bộ 8 Hạng Mục Cốt Lõi Video to Video Studio
- **Mục 1 (Prompt & Combinatorial Planning):**
  - Cập nhật prompt sinh kịch bản (`byteplus/video_studio/timeline_generator.js`): Bắt buộc giữ trọn vẹn thời lượng video hook đầu vào (`exact hook duration`), không cắt ngắn hook.
  - Tự do hóa thời lượng video output tổng thể (không gò ép cứng ngắc thời lượng cuối cùng), tập trung tối đa vào cấu trúc hook và kịch bản chuyển ý sau hook (`hook-to-body bridge`).
- **Mục 2 (Chú Thích Tác Dụng Loại Hook):**
  - Cập nhật `public/studio/video-to-video.html` & `video-to-video.js`: Bổ sung chú thích 1-2 dòng dưới mỗi loại hook trong dropdown (nêu rõ tác dụng chính: giật gân, khơi gợi tò mò, đánh trúng nỗi đau, nghịch lý...).
- **Mục 3 (Logic Hiển Thị Layout Step 1-4):**
  - Cấu hình `.layout-single-column` cho Step 1 đến Step 4: Khi chưa có video render ở Step 6, cột trái tự động mở rộng 100% full-width màn hình (`max-width: 100%`), ẩn hoàn toàn cột review bên phải (`#v2v-final-review-panel`).
  - Chỉ khi chuyển sang Step 5-6 mới hiển thị layout chia cột để preview thành phẩm.
- **Mục 4 (Tương Tác Batch Gallery & Main Player):**
  - Trong Step 6, khi người dùng click vào bất kỳ video card nào trong Batch Gallery, video đó sẽ được nạp và phát ngay lập tức trên Video Player chính ở trên (`#v2v-final-active-box`).
- **Mục 5 (AI Phân Tích & Mô Tả Toàn Bộ Sang Tiếng Việt):**
  - Toàn bộ prompt phân tích đối thủ, phân tích hook, lý do chọn clip kho (`directorNote`), mục đích và kết luận chuyển dịch sang tiếng Việt chuẩn marketing.
- **Mục 6 (Multipart Parser Hỗ Trợ Upload Đa File & Stream):**
  - Nâng cấp `byteplus/multipart.js` xử lý an toàn upload nhiều file video cùng lúc, stream an toàn chống tràn bộ nhớ.
- **Mục 7 (Light Theme Toàn Diện Cho Các Step):**
  - Bổ sung override CSS cho `:root[data-theme="light"]` trong `public/studio/video-to-video.css`, đảm bảo màu chữ, màu nền, viền thẻ của tất cả 6 step đạt độ tương phản chuẩn WCAG AAA.
- **Mục 8 (Tốc Độ Video Tự Nhiên - Loại Bỏ Ép Dãn Frame):**
  - Sửa `byteplus/video_studio/assembler.js`: Không ép slow-motion làm dãn hình video; video chạy ở tốc độ 1.0x tự nhiên của clip gốc.

---

#### B. 4 Yêu Cầu Tinh Chỉnh Giao Diện & Dữ Liệu Thực Tế
1. **Step 2 — Bảng Phân Tích Sự Kiện Có Thanh Scroll:**
   - Container `#v2v-hook-analysis-table` và `#v2v-ref-analysis-table` được bọc trong `.v2v-table-wrap` với `max-height: 420px; overflow-y: auto;`.
   - Tiêu đề `thead th` cố định (`sticky`), không bị cuộn mất khi lướt xem hàng chục sự kiện.
2. **Step 4 — Batch Matrix Grid Giới Hạn Chiều Dài & Scroll:**
   - Cấu hình `.v2v-batch-matrix-grid` có `max-height: 540px; overflow-y: auto;`.
   - Chiều cao hiển thị vừa đủ 1 card biến thể (~480px + padding), hỗ trợ cuộn xem 10-20 biến thể mượt mà.
3. **Stepper Xem Lại Project Hoàn Thiện:**
   - Cập nhật `showStepPanels(step)` trong `public/studio/video-to-video.js`: Khi bấm xem lại Step 1-5 của project đã hoàn thiện, layout tự động thu về 1 cột full-width để hiển thị đúng nội dung của step đó. Chỉ bấm Step 6 mới bung 2 cột.
4. **AI Mô Tả 100% Tiếng Việt Cho Toàn Bộ Kho Clip & Project:**
   - Dùng 9Router LLM (`ag/gemini-3.8-flash-high`) dịch và viết lại toàn bộ 252 clip trong kho (`video_studio_library.json`) và toàn bộ 6 project (`video_studio_projects.json`).
   - Đã kiểm tra trực tiếp trên DOM browser: 100% tiếng Việt tự nhiên từ metadata, scene, action đến director notes.

---

#### C. Màn Hình Chờ Video to Video & Flow Queue Scroll 2 Card
1. **Mặc Định Không Chọn Project (Màn Hình Chờ V2V):**
   - Khi vào `http://localhost:20140/byteplus/video-to-video`, mặc định không chọn dự án (`selectValue: ""`).
   - Vùng làm việc ẩn, hiển thị `#v2v-no-project`, layout cột trái full-width.
   - Thêm lựa chọn `-- Không chọn dự án nào (Màn hình chờ) --` trong dropdown để người dùng chủ động quay lại màn hình chờ bất kỳ lúc nào.
2. **Flow Queue — Giới Hạn Danh Sách Jobs 2 Card & Scroll:**
   - Tại `http://localhost:20140/byteplus/Flowqueue`, khung `.fq-jobs` được gán `max-height: 735px; overflow-y: auto;`.
   - Chiều cao container `/html/body/main/section[2]/div[2]` giảm từ 3.309px xuống 803px, hiển thị vừa vặn 2 card job, có thanh cuộn mượt mà.

---

### 2. Trạng Thái Kiểm Thử (Verification Status)

- **Bộ kiểm thử tự động:** `node tests/runner.js`
- **Kết quả:** **286/286 Tests PASS (100%)**
  - Tier 1: 79/79 Passed
  - Tier 2: 120/120 Passed
  - Tier 3: 59/59 Passed
  - Tier 4: 28/28 Passed
- **Thời gian chạy:** ~9.8s
- **Runtime Server:** `http://localhost:20140` hoạt động bình thường, không lỗi.
- **Chrome CDP 9334:** Giữ nguyên vẹn PID 28028 cho Flow Queue.
