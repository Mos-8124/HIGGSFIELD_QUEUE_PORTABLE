# TASK — Chuẩn hoá V2 Video-to-Video theo quy trình PPTX

**Ngày:** 2026-09-18 · **Trạng thái:** ✅ **ĐÃ LÀM XONG A + B + C** (đợt 1 trước đó đã rollback, nay làm lại theo thiết kế sản phẩm mới user chốt).
**Test:** `npm test` 445/445 · E2E thật trên project `gtf_mu6noe93_9f49a2` ("TEST ABC 2026-09-18") — **giữ lại cho user xem**.

## Phạm vi user chốt
LÀM: I.2 (7 tiêu chí + chấm điểm hook), I.5 (độ dài hook), II.1 (tốc độ đọc),
II.2 (trần thời lượng cảnh), II.3 (ép khác 4 yếu tố), II.4 (bộ lọc claim) + thiết kế kho 3 nhóm.
KHÔNG LÀM: I.1, I.3, I.4 (giữ nguyên), I.6 (module nhạc nền), gói phân quyền.

---

## ĐỢT A — Phân tích 7 tiêu chí & chấm điểm

| Việc | File | Ghi chú |
|---|---|---|
| Prompt 7 tiêu chí + thang 1-10 | `prompts/final.txt` | `criteria_scores{hook,structure,pacing,visual,audio,message,cta}`, `overall_score_1_10`, `hook_analysis{type,first_3s,score_1_10}`, `structure{problem,solution,proof,cta}`, `strengths/weaknesses/improvements` |
| Schema Pydantic | `video_analyzer/schemas.py` | `HookAnalysis`, `CriteriaScores`, `ScriptStructure` + `_clamp_score` (ngoài thang ⇒ kẹp; AI không chấm ⇒ `None`, KHÔNG bịa) |
| Chuyển tiếp điểm | `merge/synthesis.py` | gán vào `FinalAnalysisResult` |
| Cache | `jobs/cache.py` | `PIPELINE_VERSION` `2.0.0_vi` → `3.0.0_vi_scorecard` (cache cũ thiếu trường ⇒ phải miss) |
| Đọc điểm ra dạng phẳng | `library.js` | `extractAnalysisScorecard()`, `HOOK_TYPES` (9 loại), `CRITERIA_KEYS` |
| Lưu điểm lên clip kho | `index.js` `/library/describe` | `overallScore`, `criteriaScores`, `hookType`, `hookScore`, `hookFirst3s`, `strengths/weaknesses/improvements` |
| Hiện bảng điểm ở bước 2 | `video-to-video.{html,js,css}` | `#v2v-scorecard-panel`, `renderScorecard()` |

**Đo thật:** video đối thủ được chấm `overall 7` · hook 7 · structure 7 · pacing 8 · visual 8 · **audio 4** · **cta 3** — điểm phân hoá đúng, không cào bằng. Loại hook: `truoc-sau`. Điểm yếu AI chỉ ra kèm mốc thời gian ("thiếu CTA ở 21:00-22:76").

## ĐỢT B — Kho 3 nhóm & chọn ref/hook từ kho

| Việc | File |
|---|---|
| Kho đúng 3 nhóm, bỏ "chưa phân loại" | `library.js` `LIBRARY_GROUPS`, `normalizeCategory()` |
| Migrate 266 clip cũ ⇒ Nguyên liệu | `library.js` `scanLibrary` (file không đổi vẫn chuẩn hoá lại nhóm) |
| Upload chọn nhóm hook/đối thủ | `index.js` `UPLOAD_CATEGORIES` + `#v2v-upload-category` |
| Video user dùng nhập thẳng vào kho | `index.js` (đã có sẵn ở analyze-reference/analyze-hook) |
| Step 1 chọn lại ref/hook từ kho kèm ảnh bìa | `#v2v-step1-ref-picker`, `#v2v-step1-hook-picker`, `renderKhoPicker()`, API `refAssetId`/`hookAssetId` |
| AI tự chọn hook khi user không nhập | `timeline_generator.js` `pickHookFromLibrary()` |

**Đo thật:** kho `material 266 / reference 2 / hook 3`. `pickHookFromLibrary` chọn đúng clip 8 điểm loại `van-de`; chọn loại không có trong kho ⇒ rơi về điểm cao nhất; kho không có hook ⇒ `null` (không lấy bừa clip nguyên liệu).

## ĐỢT C — Nhịp video

| Việc | Trước | Sau |
|---|---|---|
| Trần video thành phẩm | 60s | **30s** (`MAX_OUTPUT_SECONDS`) |
| Hook | trọn clip (đo thật 34s) | **4-5s** (`clampHookDuration`, kẹp ở **cả 3** ngả vào budget) |
| Cảnh thân bài | 5-8s (`maxSegmentDur 7.0`) | **4-5s** (nhịp luân phiên 4.5/4.0/5.0) |
| Tốc độ ĐỌC | 3.8 từ/s | **giữ nguyên 3.8** (`VOICE_SPEAK_RATE`) |
| Ngân sách VIẾT | dùng chung 3.8 | **tách riêng 3.2** (`VOICE_WRITE_WORDS_PER_SEC`) |
| Ép 10 biến thể khác nhau | không có | `differentiators{persona,boiCanh,daoCu,bangChung}` + `checkVariantDiversity()` |
| Bộ lọc claim | không có | `DEFAULT_CLAIM_RULES` (12 luật) + `checkClaims()` + `applyClaimRules()` + `sanitizeTimelineClaims()` hậu kiểm |

### Vì sao phải TÁCH tốc độ đọc khỏi ngân sách viết
Đợt 1 dùng **một** hằng số cho cả hai ⇒ câu vừa viết xong đã chạm trần, dư 1 chữ là bị cắt cụt
("...chỉ trong vài.") — **5/15 câu bị cụt**. Nay ngân sách viết 3.2 < tốc độ đọc 3.8, nên cảnh 4.5s
chỉ nhận 14 từ ⇒ đọc hết trong 3.7s ⇒ dư ~1.1s cho hình thở, câu luôn trọn ý.
Ngưỡng CẮT (`enforceVoiceDurationConstraint`) vẫn là 3.8 — cắt theo tốc độ đọc thật.

---

## KẾT QUẢ ĐO THẬT (project `gtf_mu6noe93_9f49a2`, 3 video)

| Chỉ số | Trước | Sau |
|---|---|---|
| Thời lượng video | ~58s | **24.2 / 25.3 / 24.6s** |
| Hook | 34s | **5.0s** |
| Độ dài cảnh | 4.7-5.9s | **4.0 / 4.5 / 5.0s** |
| Voice dài hơn phân cảnh (bị cắt) | 5/15 câu | **0/18 câu** |
| Câu kết bằng từ nối (cụt ý) | có | **0/18** |
| Khoảng lặng dài nhất | 38-39.5s | **1.2s** |
| Biến thể trùng ý tưởng | không kiểm | **0 cặp vi phạm** |

## Đổi contract — 4 test cũ đã cập nhật (§30, có ghi lý do trong test)
- `video_studio.test.js` — `byCategory` theo tên thư mục ⇒ theo 3 nhóm.
- `footage_driven_timeline.test.js` — `maxWords` theo tốc độ ĐỌC ⇒ theo ngân sách VIẾT.
- `render_polish.test.js` ×2 — trần 60s ⇒ 30s; "hook dài ⇒ ít cảnh hơn" ⇒ "hook bị kẹp ⇒ thân bài KHÔNG bị ăn mòn".

## Còn lại (chưa cần làm ngay)
- 270 clip kho vẫn giữ mô tả cũ (chưa có điểm). Chỉ clip nhóm **hook** và **đối thủ** mới cần điểm;
  clip Nguyên liệu không dùng tới điểm. Muốn chấm lại toàn kho thì gọi `/library/describe` từng clip.
- Kịch bản đã lưu của project cũ KHÔNG tự cập nhật — phải bấm "Sinh lại kịch bản".

## Backup
`docs/BACKUPS/2026-09-18/task-ABC-chuan-hoa-pipeline/` (20 file + `full-changes.patch`).

## ĐỢT D — Trần đồng thời & hook chỉ 1 lần (bổ sung 2026-09-18)

### 1. Trần đồng thời — ĐÃ ĐÚNG, không sửa gì
| Bước | Trần | Cơ chế |
|---|---|---|
| Bước 5 — dựng video | **10 video / lượt** | `V2V_RENDER_CONCURRENCY` + `runWithConcurrency`, xong cái nào fill cái kế tiếp |
| Bước 3 — sinh kịch bản | **10 kịch bản / lượt, TOÀN hệ thống** | `runWithLimit(anglesToUse, scriptGate.limit)` + `Gate(10)` toàn cục |
| Bước 2 — phân tích AI | **1 video / lượt** (worker Python serial) + vision 3 request song song | `asyncio.Queue` 1 consumer; `vision_concurrency = 3` |

**Quyết định:** KHÔNG nâng bước 2 lên 10. Bước 2 vốn đã là bước nhẹ tay nhất với 9Router
(tuần tự từng video, mỗi video chỉ 3 request vision song song). Nâng lên 10 sẽ **tăng** rủi ro bị
chặn chứ không giảm — ngược hẳn với mục đích.

### 2. Hook chỉ 1 lần ở đầu video — ĐÃ SỬA
**Đo trước khi sửa** (project `gtf_mu6noe93_9f49a2`, 3/3 biến thể giống nhau):

| Cảnh | Nhóm clip | Vấn đề |
|---|---|---|
| #1 | hook | đúng |
| #2 | **reference** | lấy thẳng video ĐỐI THỦ bỏ vào quảng cáo của mình |
| #3 | hook | trùng y hệt clip ở cảnh #1 |
| #4 | hook | clip hook khác trong kho |

**Hai nguyên nhân gốc:**
1. `isHookSegment = (idx === 0 || seg.phase === 'hook')` — mọi phân cảnh model lỡ gắn nhãn hook
   đều bị ép dùng lại video hook.
2. **Hệ quả của Đợt B**: khi video ref/hook được nhập thẳng vào kho, chúng thành clip hợp lệ và
   lọt vào pool footage thân bài.

**Cách sửa:**
- `isHookSegment = (idx === 0)`; phân cảnh sau bị dọn `phase` và `HOOK_SOURCE` mồ côi.
- Pool footage thân bài (`selectFootageSequence`, `assetList` gửi cho model, `assetMap` khi
  mapping) **chỉ nhận clip nhóm `material`**. Kho hết clip Nguyên liệu thì trả rỗng — thà không
  sinh còn hơn nhét video đối thủ vào quảng cáo của mình.
- Prompt thêm luật 2b (cả EN & VI): HOOK_SOURCE chỉ ở phân cảnh #1, không phân cảnh nào sau đó
  được mang phase hook hay dùng lại footage hook.

**Đo sau khi sửa:** 3/3 biến thể → `1:HOOK_SRC 2..6:material`, **hook = 1, đối thủ = 0**.
Render lại: 25.1 / 25.3 / 24.9 giây, khoảng lặng dài nhất 1.15s.

**Test:** `npm test` **453/453** (thêm 8 test nhóm Đợt D).

## ĐỢT E — Text/voice bám đúng khung hình (bổ sung 2026-09-18)

User báo: *"hình một kiểu text, voice mô tả chả liên quan gì"* và yêu cầu sửa system prompt.
**Sửa prompt KHÔNG đủ** — nguyên nhân chính nằm ở code.

### Ba nguyên nhân (đo trên project `gtf_mu6noe93_9f49a2`, 5/5 phân cảnh đều lệch)
1. **HEAD RANDOMIZER** (`applyCombinatorialPlanning`): `Math.random() * min(15, clipDur - segDur)`
   **ghi đè** mốc cắt mà model đã chọn. Model đọc mô tả đoạn 0-4.5s rồi viết lời cho đoạn đó,
   hệ thống lại cắt ở 10.3-14.8s — đoạn model CHƯA TỪNG thấy mô tả.
2. **Model chỉ được xem 3 đoạn/clip** (`slice(0, 3)`) trong khi clip 61.8s có tới **32 đoạn**.
3. **`visualAction` chỉ mang mô tả của 1 đoạn**, mà cảnh 4-5s thường trải qua **2 đoạn**
   (đoạn mô tả chỉ dài 1.5-3.5s) ⇒ nửa sau của cảnh không ai tả.

### Cách sửa
| | Trước | Sau |
|---|---|---|
| Chọn mốc cắt | `Math.random()` | `resolveSegmentWindow()` — cửa sổ bám đoạn đã mô tả |
| Mốc model chọn | bị ghi đè | **tôn trọng** nếu nằm trong đoạn có mô tả |
| Đa dạng 10 biến thể | random offset | xoay theo `variantSeed` — mỗi biến thể một khoảnh khắc khác, có chủ đích |
| Số đoạn gửi cho model | 3 | **10** (`ASSET_EVENTS_IN_PROMPT`) |
| `visualAction` | 1 đoạn | **gộp mọi đoạn** chạm cửa sổ + `visualBeats` kèm mốc thời gian từng nhịp |
| Prompt | "bám sát visualAction" | luật **3 / 3a / 3b / 3c** (EN+VI): cấm đổi sourceIn/sourceOut, phải tả trọn cả 2 nhịp, cấm nói chung chung, đổi clip phải dùng đúng mốc event của clip đó |

**Bẫy đã dính khi sửa:** `Number(null) === 0` ⇒ `requestedIn` mặc định `null` bị hiểu là
"model xin mốc 0" ⇒ MỌI cửa sổ kẹt về giây 0. Phải loại `null`/`undefined`/rỗng TRƯỚC khi ép kiểu.

### Đo thật sau khi sửa (15 phân cảnh / 3 biến thể)
- Khe hở lớn nhất trong cửa sổ cắt: **0.50s** — đúng bằng bước lấy mẫu khung hình của analyzer
  (ranh giới làm tròn, không phải vùng chưa xem). **0/15** cảnh vượt 0.6s.
- Lời bình khớp **cả hai nhịp hình**. Ví dụ hình "đè tay bất lực" → "gắn máy hút mini vào van",
  voice *"Không cần bơm tay tốn sức, máy tự động hút xẹp lép, đặt vừa in vào vali."*
- Render: **26.3 / 25.5 / 24.6 giây**.

**Test:** `npm test` **465/465** (thêm 12 test nhóm Đợt E).

**Đổi tiêu chí test (§30, có lý do):** ban đầu em đòi cửa sổ nằm trọn trong MỘT đoạn mô tả.
Đo thật cho thấy đoạn mô tả chỉ 1.5-3.5s còn cảnh 4-5s, nên cảnh đúng-đắn vẫn trải 2 đoạn.
Thước đo đúng là **khe hở lớn nhất ≤ 0.6s**, không phải % phủ.

## ĐỢT F — Xoá clip khỏi kho & tải lên nhóm Nguyên liệu (bổ sung 2026-09-18)

### 1. Vì sao bấm "Xoá" mà clip không mất — HAI lỗi cùng lúc

**Lỗi A — clip sống lại.** `deleteAsset` chỉ bỏ **bản ghi**, không xoá file. File vẫn nằm
trong `kho/` nên `scanLibrary` lần sau index lại với **asset_id MỚI** ⇒ clip quay về.
Bằng chứng đo được: `bp_1789717774756_ea3c0131_hook.mp4` đổi từ `VID_72ad56e4eb`
sang `VID_37c63d5274` giữa hai lần kiểm tra. Giao diện còn hứa sai: *"không xoá file gốc trên đĩa"*.

**Lỗi B — bản ghi mồ côi.** `scanLibrary` **chưa bao giờ** dọn bản ghi có file đã mất.
Xoá file bằng tay thì bản ghi nằm lại vĩnh viễn, giao diện hiện một clip không tài nào bỏ đi.
Đúng trạng thái 2 clip user báo: `kho/hook/` chỉ còn `hook1.mp4` + `hook2.mp4`, còn
`Hero.mp4` và `ea3c0131_hook.mp4` đã mất file nhưng bản ghi vẫn còn.

*Không xác định được user dính lỗi nào (không có log HTTP), nên sửa cả hai.*

### 2. Cách sửa
| | Trước | Sau |
|---|---|---|
| Xoá clip trong kho | chỉ bỏ bản ghi | `planAssetDeletion()` → xoá **cả file** + thumbnail |
| Xoá clip ngoài kho | bỏ bản ghi | giữ nguyên hành vi (file thuộc thư mục dự án) |
| Clip đang được project dùng | xoá bừa | **chặn 409 `ASSET_IN_USE`**, kể tên project |
| Không rõ thư mục kho | — | fail-closed: **không** xoá file |
| Quét kho | không dọn | dọn bản ghi mồ côi trong kho, trả `result.removed` |
| Câu xác nhận | "không xoá file gốc" (sai) | nói rõ sẽ xoá file, không hoàn lại |

### 3. Tải lên nhóm Nguyên liệu
`UPLOAD_CATEGORIES` chuyển từ `['reference','hook']` sang **`['material','reference','hook']`**
(dọn khai báo trùng trong `index.js`, nay dùng chung từ `library.js`), mặc định **`material`**
— nhóm user nạp nhiều nhất. Giao diện thêm `<option value="material" selected>Nguyên liệu</option>`.
File tải lên được xếp vào `kho/<nhóm>/`.

### 4. Đo thật trên hệ thống
- Xoá clip trong kho: `{"success":true,"fileDeleted":true,"scope":"IN_LIBRARY"}` — file mất khỏi
  `kho/hook/`, quét lại `added: 0` ⇒ **không sống lại**.
- Upload `category=material`: `added: 1`, file vào `kho/material/`, kho ghi nhận `material: 1`.
- Xoá file bằng tay rồi quét: `removed: 1` ⇒ bản ghi mồ côi được dọn.

**Test:** `npm test` **477/477** (thêm 12 test nhóm Đợt F).

## ĐỢT G — Phân tích kho chạy 5 luồng thật (bổ sung 2026-09-18)

### Vấn đề: "5 con AI mà sao lâu thế"
Giao diện báo `concurrency = 5` nhưng **chỉ 1 clip thật sự chạy**. Đo lúc user nạp 237 clip:

| Slot | Trạng thái | Đã đợi |
|---|---|---|
| VID_75a2… | `analyzing_audio` 50% | đang chạy |
| VID_1484… | `starting` **0%** | 60s |
| VID_e7f4… | `starting` **0%** | 102s |
| VID_2930… | `starting` **0%** | 161s |
| VID_566b… | `starting` **0%** | 206s |

**Nguyên nhân** (chính chú thích của code đã nói): `worker.py` chỉ tạo **đúng một** task tiêu thụ
hàng đợi — `"""Worker task processing video jobs sequentially."""`. Tầng Node bắn 5 việc sang,
Python xử lý tuần tự. Thông lượng đo được: **1 clip / 43-60 giây**.

### Sửa
- `config.py`: thêm `worker_concurrency` (mặc định **5**, user chốt).
- `worker.py`: `self._worker_task` (1 task) → `self._worker_tasks` (N task), huỷ cả danh sách khi tắt.

**Vì sao an toàn cho GPU:** Whisper dùng một model singleton có sẵn `asyncio.Lock()`, nên khâu
nhận dạng tiếng vẫn tự xếp hàng. Phần chồng lấn thật là **vision + synthesis** (gọi mạng).

### Đo thật sau khi sửa
- `Started 5 analysis worker task(s)` — và **5/5 slot đều tiến triển** (trước: 1/5).
- Thông lượng: **14 clip / 180 giây = 12.9 giây/clip**, so với **52 giây/clip** ⇒ **nhanh 4.0 lần**.
- 190 clip còn lại: từ ~2 giờ 45 phút xuống **~41 phút**.
- **0 lỗi 9Router, 0 lỗi phân tích.** (grep bắt "429" 5 lần nhưng đều là mili-giây trong mốc
  thời gian `11:06:58,429`, không phải HTTP 429 — đã kiểm từng dòng.)

Không đạt 5.0 lần vì khâu Whisper vẫn tuần tự do khoá GPU — đúng như đã lường trước.

**Test:** `npm test` **479/479** (thêm 2 test Đợt G).
