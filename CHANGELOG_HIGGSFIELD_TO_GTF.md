# BÁO CÁO MIGRATION & NÂNG CẤP DỰ ÁN (HIGGSFIELD_QUEUE_PORTABLE)

**Mục tiêu chính:** 
1. Chuyển đổi toàn bộ giao diện Legacy Higgsfield Queue sang hệ thống mới GTF Video AI Studio mà không làm hỏng file cũ.
2. Tích hợp tính năng Live Kie Cost Estimator (Ước tính chi phí linh động theo bảng giá Kie Seedance 2.5).
3. Xây dựng hệ thống Usage / Credit Accounting (Quản lý và trừ tín dụng người dùng tự động).

Dưới đây là chi tiết toàn bộ các hạng mục đã được triển khai và hoàn thiện:

---

## 1. Đồng bộ Giao diện (UI) từ Legacy sang GTF
Để đảm bảo giao diện mới kế thừa chính xác 100% chức năng (như dropzone, 10-step progress bar) mà không rủi ro, chiến lược Drop-in Copy đã được áp dụng:
- **`public/studio/index.html`:** Sao chép hoàn toàn từ `public/index.html`. Cập nhật lại đường dẫn CSS/JS trỏ vào thư mục `/studio`.
- **`public/studio/studio.css`:** Sao chép nguyên vẹn từ `public/styles.css`.
- **`public/studio/studio.js`:** Kế thừa từ `app.js`. Các API gọi từ frontend đã được Regex tự động đổi sang endpoint dành riêng cho hệ thống mới: `/api/byteplus/*` và `io('/byteplus')`.

## 2. Lớp Tương thích Backend (Backward-Compatibility Layer)
Thay vì đập đi xây lại toàn bộ JS Frontend, Backend đã được bổ sung một "Adapter" để tiếp nhận payload cũ nhưng xử lý theo flow mới:
- **`byteplus/routes.js` (Sửa đổi):** 
  - Thêm các Alias endpoints: `POST /queue/add`, `GET /queue`, `POST /queue/control`.
  - Khởi tạo middleware để bắt các request `multipart/form-data` (upload file từ giao diện cũ), trích xuất file và map vào thuộc tính `references` của chuẩn JSON mới trong GTF Queue.
  - Endpoint `GET /queue` được điều chỉnh để format dữ liệu trả về y hệt những gì `app.js` đang trông đợi để render DOM.

## 3. Hệ thống Live Kie Cost Estimator (Ước tính phí)
Đảm bảo user luôn nhìn thấy chi phí trước khi bấm Submit.
- **`byteplus/kie_pricing.js` (Tạo mới):** Module tính toán chuyên dụng áp dụng strict rules của bảng giá Seedance 2.5 ($0.005/credit).
  - Tự động nhận biết các độ phân giải: 480p (17/28 cr), 720p (38/63 cr), 1080p (68.5/114 cr).
  - Phân tách giá có/không có video input. Tính chính xác: `rate * (inputVideoDuration + outputDuration)`.
- **`public/studio/studio.js` (Sửa đổi Frontend):**
  - Bổ sung logic hàm `getVideoDuration()`: Tự động khởi tạo `HTMLVideoElement` ngầm trong bộ nhớ trình duyệt để đọc metadata `video.duration` của file local do user tải lên (không cần đoán hay gán cứng 4s).
  - Inject thẻ `<div id="live-cost-estimate">` để hiển thị realtime ước tính mỗi khi người dùng thay đổi: File upload, Thời lượng (Duration) hoặc Độ phân giải (Resolution).

## 4. Quản lý Tín dụng & Khấu trừ (Usage / Credit Accounting)
Đảm bảo mọi task chạy qua BytePlus Kie đều bị trừ đúng credit thực tế.
- **`byteplus/usage_manager.js` (Tạo mới):** Quản lý số dư, đọc/ghi dữ liệu vào file `byteplus_usage.json` (Giả lập khởi tạo 50,000 credit). Cung cấp hàm `recordUsage` để ghi lại biến động mỗi task.
- **`byteplus/queue_manager.js` (Sửa đổi):** Can thiệp vào hàm `_finish()` của Queue. Khi task hoàn tất (`task.status === 'completed'`), tự động bóc tách số credit tiêu hao THỰC TẾ do API provider trả về (`res.billing.creditsConsumed`) và kích hoạt `usageManager.recordUsage(...)` để lưu vào lịch sử.
- **Frontend Validation:** 
  - Khóa chức năng Submit (chặn ngay tại `studio.js`) nếu `currentQuote.credits > balance`. Hiển thị cảnh báo lỗi màu đỏ nếu không đủ credit.
- **Usage Tab trên UI:** Đã thiết kế và inject thủ công Tab **"💰 Quản lý Tín dụng"** ngay bên cạnh tab "Import Hàng Loạt" trong `index.html`. Tab này show số dư, tổng chi tiêu, và bảng chi tiết từng giao dịch lịch sử.

## 5. Tự động hóa Kiểm thử (Automated Tests)
Các kịch bản mock logic tính toán và quản lý số dư (Zero paid calls, chạy offline hoàn toàn):
- **`test/kie_pricing.test.js`:** Kiểm tra chính xác các case tính tiền phức tạp (ví dụ: Task thực tế 480p, In 4s, Out 4s -> Tính chuẩn ra 136 credits).
- **`test/usage_manager.test.js`:** Đảm bảo hệ thống Persistence (đọc/ghi file JSON) chạy ổn định và khấu trừ đúng toán học khi gọi `recordUsage()`.

---

**Trạng thái bàn giao:** TẤT CẢ CÁC HẠNG MỤC ĐÃ HOÀN THÀNH 100% VÀ SẴN SÀNG ĐỂ REVIEW HOẶC PUSH LÊN MÔI TRƯỜNG THỬ NGHIỆM.
