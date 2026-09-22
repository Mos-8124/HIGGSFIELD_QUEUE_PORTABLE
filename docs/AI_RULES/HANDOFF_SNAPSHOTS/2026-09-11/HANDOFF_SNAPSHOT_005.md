# HANDOFF SNAPSHOT 005

Date: 2026-09-11
Task: task-video-to-video-voice-tts-integration

## Hoàn thiện tích hợp Kịch bản Lời thoại & Giọng đọc thuyết minh Edge TTS (SRS §7, §10, §11)

### 1. Kết quả đạt được:
1. **Lên kịch bản lời thoại (AI Scripting)**:
   - `byteplus/video_studio/timeline_generator.js`: Prompt LLM yêu cầu sinh thuộc tính `voice` (lời thoại tiếng Việt) kèm theo mỗi phân đoạn video trong Production Timeline.
2. **Sinh giọng đọc Edge TTS (Microsoft Speech)**:
   - `byteplus/video_studio/voice_generator.js`: Tích hợp trực tiếp Python `edge-tts` với các giọng đọc chất lượng cao tiếng Việt:
     * `vi-VN-HoaiMyNeural` (Nữ - Truyền cảm, Tự nhiên)
     * `vi-VN-NamMinhNeural` (Nam - Trầm ấm, Quyết đoán)
   - Hoàn toàn miễn phí, tốc độ cao (~1 giây / câu thoại), không yêu cầu API key hay quota trả phí.
3. **Lắp ráp & Phối âm thanh FFmpeg (Audio Mixing & Ducking)**:
   - `byteplus/video_studio/assembler.js`: Tự động sinh giọng đọc cho từng phân đoạn có kịch bản `voice`, đưa vào đồ thị filter complex của FFmpeg:
     * Trộn âm nền của video với âm thuyết minh bằng `amix=inputs=2:duration=first`.
     * Tự động giảm âm lượng video gốc xuống 25% (audio ducking) khi có giọng đọc thuyết minh để lời nói rõ ràng.
     * Tự động bổ sung `anullsrc` (silence) nếu clip gốc câm hoặc không có audio stream.
     * Dọn dẹp an toàn toàn bộ file tạm MP3 và filter script trong khối `finally`.
4. **API Endpoints**:
   - `GET /api/video-studio/voices`: Trả về danh sách giọng đọc hỗ trợ.
   - `POST /api/video-studio/projects/:id/assemble`: Tiếp nhận tham số `voice` để chọn diễn viên lồng tiếng khi dựng video.
   - `exportProjectPackage`: Ghi nhận `voice` đã chọn vào `episode_manifest.json` và bảng `storyboard.html`.
5. **Frontend UI**:
   - `public/studio/video-to-video.html`: Thêm bộ chọn giọng đọc `🎙️ Giọng đọc:` và cột `Voice / Lời thoại AI` trong bảng kịch bản Production Timeline.
   - `public/studio/video-to-video.js`: Cho phép xem và chỉnh sửa trực tiếp lời thoại của từng phân đoạn trước khi dựng; truyền đúng tùy chọn giọng đọc khi submit dựng video.
   - `public/studio/video-to-video.css`: Căn chỉnh giao diện voice picker đẹp mắt, chuẩn dark theme.

### 2. Kiểm thử tự động (Test Verification):
- Đã thêm kiểm thử Tier 1 cho cấu hình Edge TTS (`AVAILABLE_VOICES`, `generateVoice` validation).
- Đã thêm kiểm thử bảo vệ cho `assembleVideo` (`NO_SEGMENTS` safeguard).
- Toàn bộ test suite: **186/186 tests PASS (100%)** với thời gian chạy ~5.9s.
- Server chạy ổn định trên cổng 20140 (`http://localhost:20140/byteplus/video-to-video`).
