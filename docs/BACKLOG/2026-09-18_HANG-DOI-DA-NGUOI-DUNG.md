# BACKLOG — Hàng đợi đa người dùng cho V2 Video-to-Video

**Trạng thái:** ✅ **GÓI TỐI THIỂU ĐÃ LÀM XONG** (2026-09-18) — xem HANDOFF_SNAPSHOT_005.
**Gói phân quyền:** vẫn CHƯA LÀM (user chốt "ko làm gói phân quyền nhé").
**Ngày ghi:** 2026-09-18 · **Bối cảnh:** hệ thống sẽ cho **nhân viên trong công ty dùng chung**.
**Trang liên quan:** `/byteplus/video-to-video` (V2). KHÔNG đụng V1 Higgsfield.

---

## Hiện trạng (đã audit code 2026-09-18)

### Đã có hàng đợi toàn cục ✅
| Chỗ | Cơ chế | File |
|---|---|---|
| Phân tích AI (step 2) | `asyncio.Queue` + đúng 1 worker task, singleton toàn hệ thống | `video-analyzer-pipeline/.../video_analyzer/worker.py:49,181` |
| Giọng đọc TTS | `_ttsGate` cap `TTS_CONCURRENCY=2`, biến cấp module ⇒ dùng chung cả tiến trình | `byteplus/video_studio/voice_generator.js` |
| Ghi dữ liệu | `JsonStore` ghi nguyên tử + nối tiếp qua `_writing` promise chain | `byteplus/store.js:48` |

### Chưa có ❌
1. **Không có trần render TOÀN CỤC.** `batchAssemble` tạo `runWithConcurrency(timelines, 10)`
   **mới cho mỗi lần bấm** (`byteplus/video_studio/assembler.js:507,524`). Cap 10 chỉ có tác dụng
   trong MỘT lần bấm. ⇒ 3 nhân viên cùng render = **30 tiến trình FFmpeg** ⇒ treo máy.
2. **Không chặn bấm trùng.** Route `POST /projects/:id/assemble`
   (`byteplus/video_studio/index.js:1038`): nếu project ĐANG `assembling` thì
   `else if (p.status !== 'assembling')` không chặn ⇒ rơi xuống chạy tiếp ⇒ **2 lượt render ghi đè
   cùng thư mục output**.
3. **Không có trần LLM toàn cục** khi sinh kịch bản. `generateBatchTimelines` dùng `Promise.all`
   bắn hết N kịch bản cùng lúc ⇒ 3 người × 10 = 30 request đồng thời ⇒ 9Router dễ chặn.
4. **Không có khái niệm người dùng.** Không đăng nhập, không chủ sở hữu project. Ai cũng xem/sửa
   được project của người khác, không biết ai đang chạy gì.
5. Không có semaphore/khoá toàn cục nào trong `byteplus/video_studio/*.js` (đã grep, trống).

---

## GÓI TỐI THIỂU (làm trước — đủ an toàn cho nội bộ)

Nguyên tắc: không đổi giao diện lớn, không đụng V1, giữ TDD + backup như các lượt trước.

### QUYẾT ĐỊNH CỦA USER (2026-09-18, sau khi thảo luận)
- **Đơn vị xếp hàng = PROJECT** (trọn cả lô video của project đó), KHÔNG xếp hàng theo từng video.
- **Thứ tự = FIFO thuần theo thời điểm bấm render.** Nguyên văn: *"cứ project nào yêu cầu trước
  thì thực hiện của project đó trước"*. KHÔNG luân phiên theo người, KHÔNG chia slot theo project.
- **Giữ trần 20 video/project** (đang có sẵn: ô N `max=20` + `Math.min(count, 20)`).
- Phương án chia 5/10 slot mà agent đề xuất ban đầu **ĐÃ BỊ BÁC** — lý do: trần 20 làm thời gian chờ
  có giới hạn cứng (~7 phút/project), và chạy trọn từng project thì nhân viên nhận đủ bộ một lượt.

**Hệ quả giúp code đơn giản đi nhiều:** vì mỗi lúc chỉ 1 project được render, trần
`runWithConcurrency(timelines, 10)` sẵn có trong `batchAssemble` **tự động trở thành trần toàn hệ
thống** — không cần đếm slot toàn cục, không cần sửa `assembler.js`.

**Ước lượng thời gian chờ** (đo từ E2E 2026-09-18): 1 project 20 video ≈ **7 phút**
(TTS ~5 phút là nút thắt chính: 120 lượt ÷ 2 luồng × ~5s; FFmpeg ~2 phút).

### A. Hàng đợi render cấp PROJECT (FIFO)
- Hàng đợi cấp tiến trình (module-level): `[{projectId, requestedAt}]`, **chỉ 1 project chạy**.
- Route `assemble` không render ngay mà **đẩy vào hàng đợi** rồi trả về vị trí; worker rút lần lượt.
- Trạng thái mới cho project đang chờ (ví dụ `queued`) — phân biệt với `assembling`.
- API `render-progress` trả thêm: `queuePosition`, `queueTotal`, `etaSeconds` (ước lượng theo số
  project đứng trước × thời lượng trung bình).
- Test: đẩy 3 project liên tiếp ⇒ chạy đúng thứ tự bấm, **không lúc nào có 2 project render cùng lúc**.
- Test: project đứng thứ 3 phải báo `queuePosition = 2`.

### B. Khoá chống bấm trùng theo project
- Project đã ở trong hàng đợi hoặc đang render ⇒ route `assemble` trả **409 `ALREADY_QUEUED`**
  kèm vị trí hiện tại, KHÔNG đẩy thêm lượt thứ hai.
- Nhả khoá ở `finally` (kể cả khi lỗi) để không kẹt vĩnh viễn.
- Test: gọi assemble 2 lần liên tiếp ⇒ lần 2 nhận 409, hàng đợi chỉ có 1 mục.

### C. Trần LLM toàn cục cho sinh kịch bản (step 3)
- Bước sinh kịch bản KHÔNG nằm trong hàng đợi render ⇒ vẫn có thể 3 người bấm cùng lúc
  (3 × 10 = 30 request LLM). Thay `Promise.all` bằng `runWithConcurrency`, trần toàn cục đề xuất 8,
  đọc từ `V2V_LLM_CONCURRENCY`.
- Test: 30 request giả ⇒ đồng thời không vượt trần.

### D. Giao diện hàng đợi — ĐÃ CHỐT (làm sau, cùng đợt)
User chốt bố cục:
- `#v2v-library` thu còn **70% chiều rộng**; thêm **card hàng đợi 30%** bên cạnh, **có thanh cuộn**,
  liệt kê các project đang chờ theo thứ tự.
- **Badge luôn thấy** ở `#v2v-stat-pill` trên đầu trang: *"Hàng đợi: đang chạy X · chờ Y"*,
  bấm vào cuộn xuống card hàng đợi (vì `#v2v-library` nằm cuối trang).
- **Card render ở step 5** hiện *"Đang chờ — trước bạn còn N project"* thay vì chỉ "Chờ lượt".
- Lưu ý: chưa có đăng nhập ⇒ card hàng đợi bản đầu chỉ hiện **tên project**, chưa hiện tên nhân viên.

## GÓI PHÂN QUYỀN (làm sau, lớn hơn)
- Đăng nhập nội bộ (tối thiểu: tên nhân viên + mã phòng ban).
- Gắn `ownerId` vào project; danh sách project lọc theo người dùng, có chế độ "xem tất cả".
- Nhật ký: ai tạo/sửa/render project nào, lúc nào.
- Cân nhắc quota mỗi người (số video/ngày) nếu chi phí API cần kiểm soát.

---

## Lưu ý khi làm
- `_renderProgress` hiện là `Map` **trong bộ nhớ của router instance** ⇒ restart server là mất tiến độ.
  Nếu muốn hàng đợi sống qua restart thì phải ghi xuống đĩa (cân nhắc, không bắt buộc cho gói tối thiểu).
- Giữ nguyên hành vi đã chốt: render hỏng TTS phải **báo lỗi rõ**, không xuất video câm (§13).
