# HANDOFF SNAPSHOT — 2026-09-17 — task-v2v-step5-render-progress-and-concurrency-fix

**Thời điểm:** 2026-09-17T16:20:00+07:00  
**Tác vụ:** Hoàn thiện Thanh Tiến Độ Dựng Video Step 5, Combo 9Router "aa", Lấp Đầy Thời Lượng Thoại & Sửa Lỗi Double-Play Gallery:

### 1. User Request
1. Làm thêm thanh tiến độ lúc dựng video ở Step 5 cho user dễ nhìn.
2. Cấu hình combo `aa` đang dùng trên 9Router vào `.env` để pipeline AI sử dụng.
3. Text và voice trong phân cảnh quá ít: Thời lượng phân cảnh còn rất nhiều mà voice và text đã hết $\rightarrow$ Yêu cầu AI sinh thoại và text có thời lượng bằng / lấp đầy thời lượng của phân cảnh đó.
4. Xử lý lỗi logic sau khi render ở Step 5 / Step 6: Khi click chọn video trong phần *"Toàn bộ video thành phẩm trong đợt sản xuất"* để map lên player chính, video được chọn phát đồng thời cả ở card nhỏ bên dưới lẫn trên player chính $\rightarrow$ Sửa lại chỉ phát ở player chính.

### 2. Scope
- `public/studio/video-to-video.html`: Bổ sung `#v2v-render-overall-card` cùng `#v2v-render-overall-fill` và `#v2v-render-overall-pct`.
- `public/studio/video-to-video.css`: Định nghĩa bộ class `.v2v-render-overall-*` chuẩn token và shadow elevation.
- `public/studio/video-to-video.js`: Tính toán tổng % tiến độ của 10 luồng render song song, reset khi vào Step 5, pause toàn bộ video gallery trong `playInMainPlayer`, và chặn sự kiện `play`/`click` trên video card nhỏ.
- `video-analyzer-pipeline/video-analyzer-standalone/.env`: Cấu hình `VISION_MODEL=aa`, `TEXT_MODEL=aa`, `NINE_ROUTER_TIMELINE_MODEL=aa`.
- `byteplus/video_studio/timeline_generator.js`: Hàm `readNineRouterModel()` đọc từ `.env` và fallback về `'aa'`, bổ sung `minWords` ($\lfloor T \times 2.3 \rfloor$) và `targetWords` ($\lfloor T \times 2.6 \rfloor$) trong `selectFootageSequence`, giữ đúng thời lượng thực tế clip hook, và cập nhật prompt yêu cầu câu thoại lấp đầy thời lượng phân cảnh.
- `tests/footage_driven_timeline.test.js`: Thêm 4 bài test unit cho 4 yêu cầu trên.

### 3. Changes Made
1. **Thanh Tiến Độ Tổng Thể Step 5**:
   - Thêm component `#v2v-render-overall-card` hiển thị thanh fill, phần trăm (`#v2v-render-overall-pct`), text trạng thái chi tiết, và bộ đếm số video (`X/Y video hoàn thành`).
   - `startRenderProgressPolling()` tính trung bình cộng tiến độ từ tất cả các items render và cập nhật liên tục theo thời gian thực.
2. **Cấu Hình 9Router Combo "aa"**:
   - Cập nhật `.env`:
     ```ini
     VISION_MODEL=aa
     TEXT_MODEL=aa
     NINE_ROUTER_TIMELINE_MODEL=aa
     ```
   - `timeline_generator.js`: Thay thế toàn bộ hardcode `'ag/gemini-3.8-flash-high'` bằng `readNineRouterModel() || 'aa'`.
3. **Thoại & Subtitle Lấp Đầy Thời Lượng Phân Cảnh**:
   - Trong `selectFootageSequence`: Bổ sung `minWords` và `targetWords` bên cạnh `maxWords`.
   - Trong `candidateFootage`: Phân cảnh Hook (Segment 1) sử dụng đúng thời lượng thực tế của clip hook (ví dụ clip hook 23s $\rightarrow$ ngân sách ~52 đến 60 từ) thay vì bị gò ép về 3.5s.
   - Prompt LLM: Chỉ thị nghiêm ngặt rằng lời bình phải liền mạch, lấp đầy thời lượng của phân cảnh, số từ nằm trong khoảng `[minVoiceWords, maxVoiceWords]`, xấp xỉ `targetVoiceWords`. Cấm tuyệt đối viết câu cụt ngủn 3-4 từ cho clip dài.
4. **Sửa Lỗi Double-Play Gallery & Player Chính**:
   - `playInMainPlayer(videoUrl, title)`: Duyệt qua toàn bộ `#v2v-batch-gallery video` và gọi `v.pause(); v.currentTime = 0;`.
   - Gắn sự kiện `play` và `click` trên video card nhỏ: Lập tức `preventDefault()`, tạm dừng video nhỏ và chuyển quyền phát độc quyền lên player chính (`#v2v-video-player`).

### 4. Files Changed
- `public/studio/video-to-video.html`
- `public/studio/video-to-video.css`
- `public/studio/video-to-video.js`
- `video-analyzer-pipeline/video-analyzer-standalone/.env`
- `byteplus/video_studio/timeline_generator.js`
- `tests/footage_driven_timeline.test.js`

### 5. Verification & Runtime Evidence
- `node tests/runner.js`: Đạt **298/298 PASS (100%)** trên cả 4 Tiers.
- Server daemon khởi động lại thành công trên port `20140` với module code mới nhất.
- API `/api/video-studio/projects` phản hồi bình thường với 10 video thành phẩm độc lập của dự án hiện tại.
