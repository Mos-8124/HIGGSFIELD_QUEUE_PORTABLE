# HANDOFF SNAPSHOT 001

Date: 2026-09-09
Task: `task-kie-seedance-provider`

---

## MIGRATE GTF VIDEO AI STUDIO V2: BYTEPLUS -> KIE.AI

### User Request (tóm tắt)

> MASTER TASK — MIGRATE GTF VIDEO AI STUDIO V2 FROM BYTEPLUS TO KIE.AI.
> Replace the current active BytePlus-based generation flow with Kie.ai.
> The user must only need to fill KIE_API_KEY= and restart the server.
> Do NOT break existing system. Keep BytePlus providers as inactive fallback.
> Zero live calls in automated tests.

### Kiến trúc active sau task

```text
GTF Studio V2 UI (không đổi)
  -> ByteplusQueueManager (không đổi)
  -> ReferenceManager
       -> KieFileStorageProvider  (POST kieai.redpandaai.co/api/file-stream-upload -> URL tạm ~24h)
       -> LocalKolAssetProvider   (KOL = file gốc cục bộ, KHÔNG cần LAS/asset://)
  -> KieSeedanceProvider
       POST https://api.kie.ai/api/v1/jobs/createTask   model: bytedance/seedance-2-5
       GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=   (waiting|queuing|generating|success|fail)
       GET  https://api.kie.ai/api/v1/chat/credit       (backend-only)
  -> download MP4 -> byteplus_outputs/ -> History
KHÔNG ACTIVE: BytePlus ModelArk, BytePlus TOS, LAS, OpenRouter (code giữ nguyên làm fallback).
```

### API contract đã xác minh từ docs.kie.ai (2026-09-09)

- createTask body: `{ model, callBackUrl?, input: { prompt, reference_image_urls[≤30], reference_video_urls[≤10], reference_audio_urls, duration 4-30, resolution 480p|720p|1080p, aspect_ratio, generate_audio, output_format } }` -> `{ code:200, data:{ taskId } }`
- recordInfo: `data.state`, `data.resultJson` là CHUỖI JSON `{"resultUrls":[...]}`, kèm `creditsConsumed`, `costTime`, `failCode`, `failMsg`
- File upload: multipart `file, uploadPath, fileName` -> `data.downloadUrl`, file TẠM THỜI (TTL ~24h)
- Lỗi: 401 KIE_AUTH_FAILED · 402 KIE_INSUFFICIENT_CREDITS · 422 KIE_INVALID_REQUEST · 429 KIE_RATE_LIMITED · 451 KIE_CONTENT_REJECTED

### Files

| Loại | File |
|---|---|
| Mới | `byteplus/providers/kie_seedance_provider.js`, `byteplus/providers/kie_file_provider.js`, `byteplus/assets/local_kol_asset_provider.js`, `tests/kie.test.js` |
| Sửa | `byteplus/config.js`, `byteplus/index.js`, `byteplus/reference_manager.js`, `byteplus/queue_manager.js`, `public/studio/studio.js`, `.env.example`, `.env` (append-only), `tests/runner.js`, `docs/AI_RULES/HANDOFF.md` |
| Không đụng | server.js, video_generate.js, cli_generate.js, public/index.html, app.js, queue_db.json, toàn bộ provider BytePlus/OpenRouter/TOS/LAS cũ |

### Quyết định quan trọng

1. **URL Kie là tạm thời, không ký lại được** — khác TOS. Storage provider khai báo `canResign=false`;
   ReferenceManager tái dùng URL còn hạn (`expiresAt`), hết hạn thì upload lại từ file gốc cục bộ.
   File cục bộ luôn là nguồn sự thật.
2. **KOL không qua LAS**: LocalKolAssetProvider giữ assetId cục bộ bất biến; lúc chạy task,
   ReferenceManager tra `kolLibrary.get(kolId).files[0]` (fallback thumbnail) và upload lên Kie.
   Ref lưu thêm `kolSourcePath`.
3. **Thứ tự tham chiếu là hợp đồng**: sort theo `ref.order`; KOL đi vào `reference_image_urls`
   đúng vị trí người dùng đặt (Image 1 = nhân vật, Image 2 = bối cảnh...).
4. **Chỉ cần KIE_API_KEY**: guard mạng chỉ chặn trong test env (không cần cờ ALLOW_LIVE_* như OpenRouter
   — tránh lặp lại sự cố LIVE_TEST_DISABLED của snapshot 2026-09-07/005).
5. **Kie mode không khởi tạo bất kỳ thành phần BytePlus nào** (index.js chọn đúng bộ 3 provider theo mode);
   lỗi thiếu cấu hình storage lấy code/message từ chính provider (KIE_UPLOAD_NOT_CONFIGURED
   thay vì BYTEPLUS_TOS_NOT_CONFIGURED).
6. **Billing thật, không ước lượng**: chỉ lưu `creditsConsumed`/`costTime` do recordInfo trả về
   vào `task.billing`.
7. **KIE_CONTENT_REJECTED không auto-retry** — retry là hành động thủ công, đúng chính sách chống mất credit.

### Verification

```text
npm test                    149/149 PASS (120 cũ + 29 Kie) — 0 live call (Kie/BytePlus/OpenRouter đều 0)
Smoke boot (cổng 20199)     GTF_VIDEO_PROVIDER=kie + duy nhất KIE_API_KEY, KHÔNG có biến BytePlus nào:
                            settings trả provider=kie, storage=Kie Temporary Upload,
                            byteplus={modelark,tos,las}="Not used" — boot sạch, không preflight error
Duplicate protection        E2E test: restart chỉ resume (0 POST createTask), submitCount giữ 1
Download retry              E2E test: retry sau lỗi download không sinh lại video
```

### Việc còn lại cho NGƯỜI DÙNG (manual live test — agent không tự chạy)

1. Điền `KIE_API_KEY=` trong `.env` (dòng đã có sẵn ở cuối file)
2. Đổi `GTF_VIDEO_PROVIDER=kie` (hiện vẫn là `openrouter` — chưa đổi để không tự ý chuyển hệ đang chạy)
3. Restart server, mở http://localhost:20140/byteplus -> kiểm tra Settings
4. Test A prompt-only 4s 720p -> B ảnh+prompt -> C video+prompt -> D KOL + Mount Fuji + Hero prompt

Backup: `docs/BACKUPS/2026-09-09/task-kie-seedance-provider/`
