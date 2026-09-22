# HANDOFF SNAPSHOT 003

Date: 2026-09-14
Task: task-v2v-hook-stepper-redesign (Video to Video Pipeline Enhancements & UI/UX Stepper Redesign)

## Report 003 — Cải tiến toàn diện Video to Video: Diversity, Tách Audio, Progress Bar, Video Hook, Tự động tải ZIP, Dropzone & Stepper Tab Navigation

### User Request
1. **Đa dạng phân cảnh (Diversity)**: AI phải lấy phân đoạn từ nhiều video khác nhau trong kho (tối thiểu 3 video), không được chỉ lấy 1 video duy nhất.
2. **Lọc âm thanh gốc**: Khi dựng video (Bước 5), AI tự động loại bỏ hoàn toàn âm thanh gốc từ các video clip trong kho, chỉ dùng giọng đọc AI (Edge TTS voice) hoặc im lặng.
3. **Thanh tiến trình (Progress Bar)**: Hiển thị thanh tiến trình trực quan kèm nhãn từng bước (trích xuất khung hình, phân tích visual, mô tả AI...) khi LLM phân tích video. Tự động poll sau khi upload / scan kho.
4. **Sửa lỗi dữ liệu cũ (Stale Data)**: Ẩn và xoá sạch nội dung các panel khi chọn hoặc tạo dự án mới, không để dữ liệu từ dự án trước tràn sang.
5. **Video Hook & Tự động tải ZIP**:
   - Bước 1 (Video Input): Thêm ô tải Video Hook câu view (tuỳ chọn) bên cạnh video đối thủ.
   - Bước 2 (Phân tích AI): Phân tích song song 2 video tham chiếu nếu có hook.
   - Bước 3 (Sinh kịch bản): Ưu tiên phong cách hook cho segment mở đầu (#1), các segment sau theo cấu trúc đối thủ.
   - Bước 6 (Duyệt & Xuất): Sau khi bấm duyệt dự án hoàn tất, tự động tải xuống file ZIP gồm inal.mp4, storyboard.html, production_timeline.json, episode_manifest.json.
6. **Cải tiến UI Form Tạo Dự Án**: Rút ngắn ô tên dự án; chuyển đổi 2 ô chọn file thành 2 dropzone kéo thả video trực quan kèm nhãn rõ ràng (🎯 Video đối thủ, 🎣 Video Hook).
7. **Điều hướng Stepper dạng Tab Navigation**: Bấm vào step nào chỉ hiển thị panel của step đó bên dưới; sau khi duyệt bước 6 thì ẩn workspace để tạo dự án mới; khi muốn xem lại dự án cũ thì chọn từ dropdown.

---

### Scope
- **Backend**: yteplus/video_studio/index.js, 	imeline_generator.js, ssembler.js, nalyzer_bridge.js.
- **Frontend**: public/studio/video-to-video.html, ideo-to-video.js, ideo-to-video.css.
- **Phạm vi bảo vệ**: Không can thiệp vào V1 (Higgsfield Classic) và luồng Kie V2 (Deeplove).

---

### Investigation
1. **Diversity Prompt**: Prompt cũ thiếu ràng buộc số lượng video tối thiểu nên LLM xu hướng chỉ chọn 1 video duy nhất. Đã nâng cấp 7 quy tắc diversity + nâng temperature từ 0.2 lên 0.5.
2. **Lỗi Encoding Charmap trên Windows**: nalyzer_bridge.js khi spawn tiến trình Python trên Windows bị crash nếu phụ đề/mô tả video chứa ký tự emoji do mặc định Windows dùng codec charmap. Khắc phục: set PYTHONIOENCODING: utf-8.
3. **Âm thanh gốc trong kho**: ssembler.js trước đây trộn audio clip gốc với giọng đọc AI. Đã sửa FFmpeg filter để bỏ toàn bộ luồng audio gốc (-an), chỉ mix voice AI hoặc sinh silent audio.
4. **Bug CSS [hidden] bị ghi đè**: .v2v-subpanel có khai báo display: flex. Do độ ưu tiên CSS class selector (0, 1, 0) cao hơn thuộc tính mặc định của trình duyệt [hidden] (0, 0, 0), các panel luôn hiển thị display: flex dù JavaScript đã gán el.hidden = true. Cần thêm quy tắc [hidden] { display: none !important; }.
5. **Auto-select gây tái hiện workspace**: 
enderProjectSelect ban đầu luôn tự động chọn loadedProjects[0] khi không có dự án active, khiến workspace bị bật lại sau khi đã ẩn. Cần cờ llowAutoSelect = false.

---

### Changes Made

#### 1. Backend (yteplus/video_studio/)
- nalyzer_bridge.js: Thêm PYTHONIOENCODING: 'utf-8' vào spawn env.
- 	imeline_generator.js:
  - Mở rộng signature: generateTimeline(referenceAnalysis, libraryAssets, hookAnalysis = null).
  - Tích hợp 7 quy tắc diversity (tối thiểu 3 video khác nhau, tối thiểu 4 phân đoạn, cấm 2 phân đoạn liên tiếp cùng sourceAssetId).
  - Nâng temperature lên 0.5.
  - Bổ sung khối chỉ dẫn ưu tiên Video Hook cho segment #1 khi có hookAnalysis.
- ssembler.js: Lọc bỏ triệt để âm thanh gốc từ video clip thư viện; chỉ phát âm thanh voice AI (Edge TTS) hoặc tạo audio im lặng.
- index.js:
  - Mở rộng createProject nhận hookVideoPath, hookVideoName, khởi tạo hookAnalysis: null.
  - Cập nhật POST /projects multipart: phân tách 
efVideo và hookVideo theo form field name .field.
  - Bổ sung POST /projects/:id/analyze-hook: gọi analyzer cho hook video, chỉ chuyển trạng thái 
eference_analyzed khi cả 2 phân tích đều sẵn sàng.
  - Cập nhật POST /projects/:id/analyze-reference: chuyển trạng thái có điều kiện (nếu có hook thì chờ hook hoàn tất).
  - Cập nhật POST /projects/:id/generate-timeline: truyền p.hookAnalysis vào generateTimeline.
  - Thêm endpoint GET /projects/:id/download-zip: tạo file ZIP chứa 4 tệp đầu ra thông qua PowerShell Compress-Archive và trả về dạng file download.
  - Thêm Map _analyzeProgress và các endpoint GET /analyze-progress/:id, GET /analyze-progress phục vụ thanh tiến trình.

#### 2. Frontend (public/studio/)
- ideo-to-video.html:
  - Tái cấu trúc form tạo dự án: input tên dự án rút gọn, thêm 2 dropzone kéo thả video (#v2v-ref-dropzone, #v2v-hook-dropzone).
  - Bổ sung panel #v2v-hook-analysis-panel cho kết quả phân tích Video Hook.
- ideo-to-video.css:
  - Sửa lỗi cốt lõi: Bổ sung [hidden] { display: none !important; } giải quyết triệt để vấn đề display: flex đè hidden.
  - Định nghĩa style .v2v-dropzone, .v2v-dropzone:hover, .v2v-dragover, .v2v-has-file.
  - Định nghĩa style .v2v-step.viewing (viền sáng tím + badge tím) thể hiện rõ step đang xem.
- ideo-to-video.js:
  - Tích hợp kéo thả Drag & Drop và click mở file picker trên 2 dropzone, hiển thị tên file và viền xanh khi chọn.
  - Hỗ trợ phân tích song song 2 video (doAnalyzeBoth).
  - Thêm hàm 
enderHookAnalysis(p) render bảng phân tích hook.
  - Cơ chế Tab Navigation cho Stepper: showStepPanels(step) chỉ bật panel thuộc step đang chọn, ẩn tất cả các panel khác. Click vào step nào trong Stepper sẽ nhảy xem step đó.
  - Tự động dọn dẹp workspace sau khi hoàn tất bước 6: tự động tải ZIP, sau 1.5s ẩn workspace và gọi loadProjects(false) để tránh auto-select.
  - Chọn lại dự án qua dropdown: hiển thị lại toàn bộ dữ liệu dự án và mở đúng step hiện tại.

---

### Files Changed
- yteplus/video_studio/index.js
- yteplus/video_studio/timeline_generator.js
- yteplus/video_studio/assembler.js
- yteplus/video_studio/analyzer_bridge.js
- public/studio/video-to-video.html
- public/studio/video-to-video.js
- public/studio/video-to-video.css

---

### Backup / Rollback
- Bản sao lưu đầy đủ: docs/BACKUPS/2026-09-14/task-v2v-hook-stepper-redesign/ (giữ nguyên relative path).

---

### Verification
- Automated Tests: Chạy 
ode tests/runner.js -> 186/186 PASS (100%).
  - Tier 1: 62/62 Passed
  - Tier 2: 49/49 Passed
  - Tier 3: 48/48 Passed
  - Tier 4: 27/27 Passed

---

### Runtime Evidence (Chrome DevTools)
1. Kiểm tra ẩn/hiện Step 6:
   - 2v-final-review-panel: display: flex, hidden: false.
   - 2v-ref-analysis-panel, 2v-hook-analysis-panel, 2v-timeline-panel: display: none, hidden: true.
2. Kiểm tra click Step 2 (Phân tích AI):
   - 2v-ref-analysis-panel: display: flex, hidden: false.
   - Các panel khác: display: none, hidden: true.
3. Kiểm tra click Step 4 (Duyệt kịch bản):
   - 2v-timeline-panel: display: flex, hidden: false.
   - Các panel khác: display: none, hidden: true.
4. Kiểm tra click Step 1 (Video Input):
   - Toàn bộ subpanel: display: none, hidden: true.
5. Kiểm tra đổi dự án qua Custom Dropdown:
   - Chuyển đổi giữa các dự án thành công, cập nhật stepper, load đầy đủ nội dung theo từng step.

---

### Important Decisions
1. CSS [hidden] { display: none !important; }: Là chuẩn bắt buộc để đảm bảo bất kỳ element nào dùng thuộc tính hidden của HTML không bị các class layout (display: flex / grid / block) vô hiệu hoá.
2. Flag llowAutoSelect: Cho phép reset giao diện về trạng thái trống sau khi hoàn thành quy trình sản xuất một video, giúp người dùng không bị nhầm lẫn giữa dự án cũ và dự án mới.
3. Không xoá file tham chiếu hook nếu có lỗi: Giữ nguyên nguyên tắc idempotency và recovery cho cả 2 nguồn video tham chiếu.

---

### Remaining Risks
1. Python Whisper chạy trên CPU có thể chậm đối với các video dài (> 1 phút).
2. Khi người dùng không tải Video Hook, hệ thống fallback 100% về luồng cũ chỉ dùng video đối thủ.

---

### Next Steps
1. Tiếp tục theo dõi trải nghiệm người dùng trên các video hook thực tế.
2. Nếu thư viện video tiếp tục mở rộng, cân nhắc bổ sung tìm kiếm theo tag hoặc ngữ nghĩa (semantic embedding).
