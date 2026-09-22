# HANDOFF SNAPSHOT — 2026-09-17 — task-v2v-footage-driven-timeline-and-voice-duration-constraint

**Thời điểm:** 2026-09-17T15:40:00+07:00  
**Tác vụ:** Hoàn thiện Footage-Driven Timeline & Khóa Độ Dài Lời Bình Thoại (Strict Voice Duration Constraint) theo TDD Workflow:

### 1. User Request
- Diễn giải quy trình từ Step 1 đến Step 6 theo luồng Asset-First.
- Yêu cầu lời bình sinh ra cho mỗi phân cảnh phải bằng hoặc ít hơn độ dài của phân cảnh đó, tuyệt đối không được dài hơn.
- Thực hiện test live hệ thống từ Step 1 đến sau khi xong Step 5 với 2 video chỉ định:
  - Video đối thủ: `C:\Users\gifft\Downloads\reference-video.mp4`
  - Video hook: `C:\Users\gifft\Downloads\final_2.mp4`
- Xử lý các lỗi phát hiện từ video output thực tế:
  1. Text và voice không đồng bộ thoại: Phải đồng bộ 100% từng chữ thoại, thoại của từng phân cảnh phải đúng với phân cảnh đó, thời lượng thoại <= thời lượng phân cảnh.
  2. Phụ đề tiếng Việt đè lên phụ đề tiếng Anh cũ trong footage: Đồng nhất ngôn ngữ theo Voice ID được chọn và che sạch phụ đề cũ trong footage.

### 2. Scope
- `byteplus/video_studio/timeline_generator.js`: Phân loại kho `clusterLibraryFootage`, chọn sequence trước khi viết kịch bản `selectFootageSequence`, cắt ngắn thoại vượt ngân sách `enforceVoiceDurationConstraint`, đồng nhất ngôn ngữ `detectLanguageFromVoice` & `ensureLanguageTimeline`.
- `byteplus/video_studio/assembler.js`: Khóa thời lượng clip gốc (không dãn timeline/slow-motion), điều chỉnh tốc độ voice nhẹ `atempo` & cắt đuôi `atrim`, dải banner `drawbox` màu đen mờ 92% che phụ đề cũ.
- `public/studio/video-to-video.js`: Đồng bộ 1:1 giữa ô Voice và Text trên bảng Step 4.
- `tests/footage_driven_timeline.test.js`: Bộ test suite TDD kiểm tra các ràng buộc trên.

### 3. Changes Made
1. **Footage-Driven Sequencing**:
   - `clusterLibraryFootage(assets)`: Gom các clip kho đã mô tả thành 4 nhóm visual: `problem`, `feature`, `result`, `cta`.
   - `selectFootageSequence(assets, { targetCount })`: Chọn danh sách clip cụ thể với thời lượng thực tế $T = \text{sourceOut} - \text{sourceIn}$ và ngân sách số từ tối đa $\text{maxWords} = \lfloor T \times 2.8 \rfloor$.
2. **Khóa Độ Dài Lời Bình**:
   - `enforceVoiceDurationConstraint(timeline)`: Kiểm tra từng phân cảnh, nếu số từ của `voice` vượt quá `maxWords` thì tự động cắt tỉa câu thoại giữ trọn vẹn ngữ nghĩa mà không lấn thời lượng clip.
   - `applyCombinatorialPlanning()`: Chuẩn hóa lại lời bình sau khi random cắt đầu clip.
3. **Đồng Bộ Thoại 1:1 Giữa Subtitle và Voiceover**:
   - `seg.text` được trích xuất trực tiếp từ `seg.voice` dạng chữ IN HOA: `seg.text = seg.voice.replace(/[.!?]+$/, '').trim().toUpperCase()`.
   - Trên bảng chỉnh sửa Step 4, khi user gõ sửa câu thoại `voice`, ô phụ đề `text` tự động cập nhật ngay lập tức.
4. **Nhận Diện & Đồng Nhất Ngôn Ngữ**:
   - `detectLanguageFromVoice(voiceId)`: Phát hiện chuẩn xác ngôn ngữ (`vi-VN-*` -> `vi`, `en-US-*` / `en-GB-*` -> `en`).
   - `ensureLanguageTimeline()`: Tự động dịch chuyển ngữ kịch bản nếu người dùng chọn voice tiếng Anh hoặc tiếng Việt.
5. **Dải Che Phụ Đề Chuyên Dụng (Drawbox Banner)**:
   - Trong `assembler.js`: Thêm bộ lọc `drawbox=x=40:y=ih*0.72-105:w=iw-80:h=210:color=black@0.92:t=fill` kết hợp `drawtext`.
   - Dải banner đen mờ 92% phủ toàn bộ vùng phụ đề dưới, che sạch 100% phụ đề tiếng Anh cũ trong footage gốc.
6. **Khóa Thời Lượng Clip Assembler**:
   - Assembler giữ nguyên thời lượng clip gốc `segmentDurations[i] = origDur`.
   - Áp dụng bộ lọc tăng tốc nhẹ `atempo` và cắt chính xác `atrim=0:${duration}` nếu voiceover thực tế hơi dài hơn clip.

### 4. Files Changed
- `byteplus/video_studio/timeline_generator.js`
- `byteplus/video_studio/assembler.js`
- `public/studio/video-to-video.js`
- `tests/footage_driven_timeline.test.js`

### 5. Verification & Runtime Evidence
- `node tests/runner.js`: Đạt **291/291 PASS (100%)**.
- Live E2E test tạo project ID `gtf_mu58pw3x_6ededb` ("Test TDD Footage & Voice Duration"):
  - Upload `reference-video.mp4` và `final_2.mp4` thành công.
  - Phân tích AI bóc tách visual events & Whisper.
  - Sinh 5 kịch bản biến thể tuân thủ 100% ràng buộc độ dài lời bình.
  - Render hoàn tất 5 video thành phẩm: `final_1.mp4` (34.6s), `final_2.mp4` (34.4s), `final_3.mp4` (32.3s), `final_4.mp4` (33.0s), `final_5.mp4` (33.1s).
  - Trích xuất frame kiểm tra thực tế: Chữ phụ đề và giọng đọc khớp 1:1, dải đen che sạch chữ tiếng Anh cũ.
