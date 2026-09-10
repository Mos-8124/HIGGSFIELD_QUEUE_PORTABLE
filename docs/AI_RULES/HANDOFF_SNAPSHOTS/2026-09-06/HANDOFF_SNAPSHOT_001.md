# HANDOFF SNAPSHOT 001

Date: 2026-09-06

Phiên làm việc: 19:00 → 21:40 (+07)

---

## Report 1 — Audit toàn dự án & kế hoạch tích hợp Seedance 2.5 từ BytePlus

### User Request

> "Audit lại toàn bộ dự án này và cho tôi biết hệ thống này là gì, có tác dụng gì
> và hoạt động như thế nào. Tôi cần thực hiện task lead giao là Viết luồng call
> seedance 2.5 từ byteplus vào higgfiled-queue với mô tả công việc như sau: thêm
> giao diện mới tách biệt hẳn luồng higgfiled cũ cho người dùng đỡ dùng . đảm bảo
> call thành công ít nhất 1 lần với đầy đủ luồng dùng: video làm tham chiếu , dùng
> ảnh làm tham chiếu , dùng prompt để hướng dẫn . call test thì call 4s thôi .
> chi phí được cung cấp 10$"

### Scope

Chỉ audit + lập kế hoạch. Không sửa code.

### Investigation

Đọc `server.js` (1.578 dòng), `video_generate.js` (1.882), `cli_generate.js` (339),
`public/app.js` (1.828), `public/index.html`, `tests/`, `queue_db.json` (468 task),
`docker-compose.yml`, `Dockerfile`, tài liệu hướng dẫn.

Phát hiện kiến trúc cốt lõi: **hệ thống không gọi API model nào cả** — nó lái một
cửa sổ Chrome thật qua CDP cổng 9333 và bấm 11 bước trên UI higgsfield.ai.
Seedance 2.5 team đang dùng là bản Higgsfield bán lại, không phải bản gốc ByteDance.

Nghiên cứu tài liệu BytePlus ModelArk trực tiếp bằng trình duyệt (trang render bằng
JS, phải bung các khối `hidden until-found` mới đọc được):

```text
POST /api/v3/contents/generations/tasks     GET .../tasks/{id}     POST /api/v3/files
model dreamina-seedance-2-5-260628
role: reference_image | reference_video | reference_audio | first_frame | last_frame
duration [4,30] hoặc -1 · resolution 480p/720p/1080p
tài khoản cá nhân: 180 RPM, concurrency 3
content.video_url hết hạn sau 24h, tải tối đa 100 lần
```

### Changes Made

Không sửa code. Xuất bản một artifact báo cáo audit + kế hoạch 5 giai đoạn:
`https://claude.ai/code/artifact/adc4dbf3-1f26-41e6-8bf4-1f2d1aed4b55`

### Files Changed

Không có.

### Backup / Rollback

Không cần — read-only.

### Verification

SOURCE CONFIRMED cho toàn bộ kết luận về kiến trúc hiện tại.
SOURCE CONFIRMED (tài liệu nhà cung cấp) cho hợp đồng API BytePlus.
Không gọi API BytePlus thật lần nào.

### Runtime Evidence

Chưa có ở report này.

### Problems / Failures

Tài liệu BytePlus render bằng JS, `WebFetch` chỉ lấy được khung menu rỗng.
Bài học: với docs SPA phải dùng trình duyệt và bung DOM ẩn, không kết luận
"không có thông tin" từ một lần fetch thất bại.

### Important Decisions

1. Luồng mới phải là **engine riêng**, không sửa `video_generate.js`.
   Lý do: 1.882 dòng thao tác DOM rất dễ vỡ, và đường đi API khác hoàn toàn.
2. Repo đã có sẵn "khe cắm" engine thứ hai (`processCliQueue`) — nhân bản mẫu đó
   rẻ và an toàn hơn nhiều so với can thiệp pipeline CDP.

### Remaining Risks

1. **BytePlus chặn ảnh/video tham chiếu chứa mặt người thật.** Workload thật của
   team (đọc từ `queue_db.json`) gần như toàn UGC người thật → luồng mới không
   thay được luồng cũ.
2. Kích hoạt Seedance 2.5 yêu cầu số dư > 30 USD / savings plan 30 USD / resource
   pack. Ngân sách 10 USD có thể **không đủ để kích hoạt**.
3. Video tham chiếu bắt buộc URL công khai, không nhận base64.
4. Test 4 giây xung khắc với task type `edit` (`edit` ép `duration = -1`).

### Next Steps

Chờ lead trả lời 3 câu hỏi chặn về tài khoản/ngân sách trước khi gọi API thật.

---

## Report 2 — Khởi động và kiểm chứng hệ thống hiện có

### User Request

> "Thế bật hệ thống lên để tôi xem thử"

### Scope

Chạy hệ thống V1 hiện có, không sửa gì.

### Investigation

Kiểm tra `node_modules` (175 package, đủ 4 dependency bắt buộc), cổng trống,
git status sạch.

### Changes Made

Không sửa code. Chỉ chạy `node server.js`.

### Files Changed

Không có. Server tự tạo thư mục `logs/` (đã nằm trong `.gitignore`).

### Backup / Rollback

Không cần.

### Verification

RUNTIME CONFIRMED:

```text
HTTP /                      200, 38.225 bytes
Socket.IO                   kết nối, nạp 468 task từ DB
Bảng task                   render 15 dòng/trang, phân trang chạy
/api/lan-info               trả đúng IP LAN
queue_db.json               KHÔNG bị thay đổi (git vẫn clean)
```

### Runtime Evidence

```text
🚀 Higgsfield AI Queue Dashboard running on: http://localhost:20129
📡 Connected to Chrome CDP at http://127.0.0.1:9333
⚠️ Higgsfield CLI không sẵn sàng ('higgsfield' is not recognized)
stats: {total:468, pending:11, running:0, completed:453, failed:4}
```

### Problems / Failures

**FINDING (chưa sửa ở report này):** `npm start` bind cổng **20129** thay vì 3100
như tài liệu. Nguyên nhân: biến `PORT=20129` đặt ở cấp User Windows, ghi đè
`process.env.PORT || 3100` trong `server.js`. Không phải lỗi do phiên làm việc này
gây ra — xuất hiện ngay lần chạy đầu tiên, trước khi viết dòng code nào.

Hai cảnh báo CDP/CLI là bình thường trên máy chưa cài Chrome debug và
`@higgsfield/cli`, chỉ ảnh hưởng V1.

### Important Decisions

Không tự xoá biến môi trường cấp User — đó là thiết lập hệ thống của người dùng.

### Remaining Risks

Cổng runtime phụ thuộc biến môi trường của máy, trong khi dự án tên là PORTABLE
và có hướng dẫn chuyển máy. Sang máy khác sẽ rơi về 3100.

### Next Steps

Báo finding cho người dùng, chờ quyết định.

---

## Report 3 — `task-gtf-v2-mock`: xây GTF Video AI Automation V2 (Mock E2E)

### User Request

> "MASTER IMPLEMENTATION TASK — GTF VIDEO AI AUTOMATION V2 ... AUDIT → IMPLEMENT →
> RUN → TEST → FIX → RETEST → DELIVER ... adding a completely separate second video
> automation system on the SAME Node.js server and SAME port ... `BYTEPLUS_MODE=mock`
> ... DO NOT refactor video_generate.js / cli_generate.js ... Rolling concurrency = 10
> ... KOL Library ... providerTaskId recovery ... Do not stop after auditing."

### Scope

Thêm hệ thống thứ hai song song, chế độ mock hoàn toàn. V1 là vùng bảo vệ.

### Investigation

Xác định điểm chèn tối thiểu vào `server.js`:
- `express.static` mặc định chiếm `/` bằng `public/index.html` → phải đăng ký
  route gateway TRƯỚC nó và thêm `{ index: false }`.
- Router V2 phải mount TRƯỚC middleware multipart của V1 để không bị V1 nuốt body.
- HTML cũ dùng đường dẫn tương đối (`styles.css`, `app.js?v=4`), phục vụ tại
  `/higgsfield` vẫn phân giải đúng về `/styles.css` → **không phải sửa 1 byte HTML cũ**.
- Node 24 có sẵn `fetch`/`FormData`/`Blob`/`AbortController` → không cần dependency.

### Changes Made

Hệ thống mới ~3.560 dòng, hoàn toàn là file mới:

```text
byteplus/  index config store queue_manager task_factory reference_manager
           kol_library routes multipart
           providers/ (mock + stub thật)  storage/  assets/
           fixtures/mock_output.mp4  (sinh bằng ffmpeg, 4s 480x854 H.264+AAC)
public/    gateway.html · studio/{index.html,studio.css,studio.js}
tests/     byteplus.test.js  (20 test)
.env.example
```

`server.js` chỉ +27/−1 dòng: 2 import, 22 dòng lắp V2 + 3 route gateway,
`express.static` thêm `{ index: false }`.

### Files Changed

```text
MỚI     byteplus/** (16 file) · public/gateway.html · public/studio/** (3)
        tests/byteplus.test.js · .env.example
SỬA     server.js (+27/−1) · tests/runner.js (+2) · .gitignore (+9)
GIỮ     video_generate.js · cli_generate.js · public/index.html · app.js
        styles.css · queue_db.json · package.json  (không đụng)
```

### Backup / Rollback

`server.js.pre-v2.bak` ở thư mục gốc.

**Không đúng chuẩn** `BACKUP_ROOT/YYYY-MM-DD/<task-id>/` — thời điểm này chính sách
backup chưa được thiết lập cho dự án. Các task sau đã dùng đúng `docs/BACKUPS/`.
Rollback vẫn khả thi: copy file `.bak` đè lên `server.js` và xoá `byteplus/`,
`public/gateway.html`, `public/studio/`.

### Verification

```text
Baseline trước khi sửa      56/56 PASS
Sau khi thêm V2             76/76 PASS  (56 cũ + 20 mới)
Smoke runtime               48/48 PASS  (24 + 17 + 7)
```

### Runtime Evidence

```text
Luồng nghiệm thu chính (KOL + Ảnh + Video + Prompt):
  Uploading References → Submitting → Queued → Generating → Downloading → Completed
  providerTaskId mock_seedance_25e0087ce2bf   submitCount 1
  KOL   asset://mock_asset_256030351b48        (Mock LAS)
  Video /api/byteplus/mock-tos/videos/... + expiresAt  (Mock TOS)
  MP4   40.156 bytes, magic "ftyp", tải được qua HTTP

Ma trận 8 tổ hợp đầu vào                        8/8 completed
Concurrency  đỉnh quan sát 10/10 qua 28 lần đo; 40 task không lần nào vượt
Cuốn chiếu   task 11 vào slot 4 ms sau khi slot đầu trống,
             và 70 ms TRƯỚC khi task cuối của lô 10 kết thúc
Pause        10 job đang chạy vẫn hoàn tất, active về 0, 8 task vẫn chờ
Retry        failed → pending → completed, attempts đếm đúng
Restart      giết server giữa lúc render, khởi động lại:
             providerTaskId KHÔNG đổi · submitCount vẫn 1 · registry vẫn 1 job
Realtime     2 client Engine.IO nhận cùng chuỗi sự kiện
UI thật      tạo KOL "Maya" → chọn vào task → Generating 35% → completed
             → usageCount 1 → MP4 tải được
Hồi quy V1   9 route legacy đều 200 · queue_db.json nguyên 468 task
```

### Problems / Failures

**1. Lỗi thật: `safeSegment()` không lọc dấu gạch ngược.**
Heredoc nuốt `\` trong regex `[<>:"/\|?*]` → thành `[<>:"/\|?*]`, backslash lọt
qua → lỗ path traversal trên Windows. Test Tier 1 bắt được.
Sửa bằng `.split(String.fromCharCode(92)).join('_')`. Đã có test chặn.

**2. Tool sửa file đổi `server.js` sang CRLF** → git diff phình toàn bộ 1.578 dòng.
Đưa về LF, diff còn đúng 27 dòng.

**3. Heredoc bị cắt quanh ~5 KB / ~200 dòng.**
Hai lần ghi file thất bại im lặng ("unexpected EOF"). Bài học: file lớn phải chia
nhỏ nhiều lần `cat >>` và kiểm `wc -l` sau mỗi lần.

**4. Kiểm tra cuốn chiếu ban đầu FAIL do cách lấy mẫu**, không phải lỗi scheduler:
10 task khởi động cùng lúc nên kết thúc gần đồng thời, không có khoảnh khắc nào
bắt được. Đổi sang so mốc `startedAt`/`completedAt` mà hệ thống tự ghi — bằng
chứng không phụ thuộc tần suất lấy mẫu.

**5. Harness realtime chỉ bắt lô sự kiện đầu.** Long-polling trả về ngay sau lô
đầu rồi đóng. Sửa thành vòng poll liên tục.

**6. Một cú click vào modal chọn KOL bị trượt** do dùng toạ độ từ frame cũ →
task tạo ra không có KOL. Lỗi ở cách điều khiển test, không phải lỗi ứng dụng.
Làm lại bằng element ref thì đúng.

### Important Decisions

1. **Không thêm dependency nào.** Node 24 đủ. Viết parser multipart riêng cho V2
   thay vì dùng chung middleware của V1.
2. **`dispatch()` chiếm slot đồng bộ** — không có `await` giữa lúc kiểm tra
   `active.size` và lúc đánh dấu `running`. Đây là điều khiến vượt trần trở nên
   bất khả thi về mặt cấu trúc, không chỉ "đúng khi chạy thử".
3. **Chống submit trùng:** `providerTaskId == null` → an toàn chạy lại;
   `!= null` → chỉ resume, không bao giờ submit lại. Mock provider tính tiến độ
   từ mốc thời gian thật trong registry nên job sống sót qua restart.
4. **UI tách riêng ở `/byteplus`** thay vì thêm tab: luồng cũ miễn phí theo gói,
   luồng mới mỗi lần bấm là tiền thật — ranh giới cần là ranh giới vật lý.
5. **Socket.IO namespace riêng `/byteplus`** để client V1 không bao giờ nhận
   sự kiện của V2.

### Remaining Risks

1. Real provider (BytePlus/TOS/LAS) **UNVERIFIED** — chưa có credential.
2. `/byteplus` chưa có lớp xác thực; khi bật live, ai vào được LAN sẽ tiêu được tiền.
3. `queue_db.json` 4,3 MB ghi lại toàn bộ mỗi nhịp tiến độ — sẽ nặng dần.
4. Rào kiểm duyệt mặt người khiến V2 chưa phủ được nghiệp vụ UGC của V1.

### Next Steps

Chờ credential BytePlus. Khi có: điền `.env`, đặt `BYTEPLUS_MODE=live`,
hiện thực hoá 3 stub, chạy T1/T2/T3 ở 480p trước rồi mới 720p.
