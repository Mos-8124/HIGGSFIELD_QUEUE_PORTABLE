# HANDOFF SNAPSHOT 001

Date: 2026-09-07

Phiên làm việc: 08:20 → 09:15 (+07)

---

## Report 1 — Tiếp nhận bộ rule của dự án

### User Request

> "docs\AI_RULES\CRAWLER_POD_AGENT_RULES.md đọc rule của dự án đi em"
>
> (sau đó) "em ơi đọc lại rule a vừa sửa và áp dụng từ h đến sau này nhé"

### Scope

Chỉ đọc và áp dụng. Không sửa code.

### Investigation

Thư mục `docs/` xuất hiện lúc 08:45, chưa tồn tại khi audit ngày 06/09.

**Bản đầu (20.589 bytes)** viết cho một dự án khác — `crawler-POD` tại
`D:\Tinh\Toolstartup\crawler-POD`. Đối chiếu:

```text
Rule/HANDOFF nói                        Thực tế repo này
src/scheduler, src/channels, ...        không tồn tại
data/collector.db, 616 items            không tồn tại
263 unit test                           76
§15.1 runtime localhost:20129           dự án này dùng 3100
Apify, ProxyPool, CloakBrowser          không có
```

Đây cũng là lời giải cho biến `PORT=20129`: đó là cổng runtime của crawler-POD.

Người dùng tự sửa lại. **Bản mới (25.699 bytes)** là bộ **universal 50 điều**,
không còn path/port của dự án khác, thêm `§0 PROJECT CONFIGURATION`.

### Changes Made

Không sửa file nào.

### Files Changed

Không có. (Người dùng tự xoá `HANDOFF.md` và snapshot cũ của crawler-POD.)

### Backup / Rollback

Không cần — không sửa file nào trong report này.

### Verification

Đã đọc trọn 50 điều bản mới + đối chiếu với cấu trúc thật của repo.

### Runtime Evidence

Không áp dụng.

### Problems / Failures

**Tự sửa nhãn của chính mình.** Trước đó tôi hạ trạng thái V2 xuống
`PARTIALLY COMPLETED` một phần vì chưa gọi được BytePlus thật. **§44 nói ngược lại:**

> "Nếu external provider chưa có credential: `Mock E2E: COMPLETED` /
> `Real Provider: UNVERIFIED`. Không để thiếu external credential làm lý do phủ
> nhận phần Mock đã hoàn chỉnh."

Nhãn đúng: `Mock E2E: COMPLETED` + `Real Provider: UNVERIFIED`.

### Important Decisions

Áp dụng bộ rule mới từ đây trở đi: format báo cáo §48, acceptance criteria đo được
trước khi code §43, trace flow §3, backup filesystem vào `BACKUP_ROOT` §9,
tách Mock/Real §13, chỉ dừng ở blocker thật `NEED_HUMAN*` §49.

### Remaining Risks

`§0 PROJECT CONFIGURATION` chưa có nơi khai báo vì `HANDOFF.md` vừa bị xoá.

### Next Steps

Chốt `RUNTIME_URL` và chính sách backup với người dùng, rồi viết `HANDOFF.md`.

---

## Report 2 — `task-port-20130`: đổi cổng runtime toàn hệ thống

### User Request

> "A nghĩ là đổi hết hệ thống hiện tại sang cổng 20130 cho a đi vì a có tool khác
> cũng chạy cổng 20129 rồi. À mà e viết bổ sung handoff của dự án đi nhé.
> backup filesystem vào docs/BACKUPS/YYYY-MM-DD/<task-id>/ ở đây nhé"

### Scope

Mọi nơi khai báo cổng của ứng dụng → 20130. Không đụng logic V1/V2.

### Investigation

Dự án có **ba khai báo cổng mâu thuẫn**:

```text
3100    4 script launcher, HUONG_DAN_SU_DUNG.md/html, HUONG_DAN_CHUYEN_MAY.md,
        fallback trong server.js, placeholder LAN trong public/index.html
3000    Dockerfile (EXPOSE, ENV, healthcheck), docker-compose.yml
20129   cổng thật đang chạy — chỉ do biến PORT cấp User Windows
```

`3_CHAY_DASHBOARD.bat` mở trình duyệt vào `localhost:3100` rồi chạy `node server.js`
bind 20129 → người dùng luôn mở trúng trang chết.

**Điểm mấu chốt:** chỉ đổi số `3100 → 20130` là chưa đủ. `process.env.PORT` thắng
mọi giá trị mặc định trong code, nên `npm start` vẫn sẽ bind 20129 — đúng cổng
người dùng muốn tránh.

### Changes Made

Đổi dự án sang đọc biến riêng, **không đọc `PORT`** nữa:

```js
// trước:  const PORT = process.env.PORT || 3100;
const PORT = parseInt(process.env.HQ_PORT || '20130', 10);
```

Launcher `set/export HQ_PORT=20130` trước khi gọi `node server.js`.
Docker chuyển sang `ENV HQ_PORT=20130`, `EXPOSE 20130`, `ports 20130:20130`.
Tài liệu và test cập nhật theo.

### Files Changed

```text
server.js                     khai báo cổng (1 → 3 dòng, có comment lý do)
3_CHAY_DASHBOARD.bat/.sh      URL + set/export HQ_PORT
CHAY_TAT_CA_1_CLICK.bat/.sh   URL + set/export HQ_PORT
Dockerfile                    EXPOSE · ENV · healthcheck
docker-compose.yml            ports · env
.env.example                  PORT → HQ_PORT
tests/docker_config.test.js   7 assertion
public/index.html             placeholder LAN (chỉ chuỗi hiển thị)
HUONG_DAN_SU_DUNG.md          8 chỗ
HUONG_DAN_SU_DUNG.html        6 chỗ
HUONG_DAN_CHUYEN_MAY.md       3 chỗ
```

### Backup / Rollback

```text
BACKUP CREATED: docs/BACKUPS/2026-09-07/task-port-20130/   (12 file, giữ relative path)
ROLLBACK:       copy ngược thư mục trên đè lên project root
```

Backup tạo **trước** khi sửa file đầu tiên.

### Verification

Acceptance criteria (§43) chốt trước khi code, 7/7 đạt:

```text
[x] npm start bind 20130 dù PORT=20129 vẫn tồn tại
[x] launcher mở đúng cổng server bind
[x] Dockerfile + docker-compose nhất quán 20130
[x] tài liệu không còn 3100
[x] 3 route trả 200 tại 20130
[x] không đụng cổng 20129 của tool khác
[x] 76/76 test PASS
```

Sửa 7 assertion trong `tests/docker_config.test.js` theo §30 — contract đổi có chủ đích:

```text
OLD CONTRACT: Docker chạy cổng 3000, biến PORT
NEW CONTRACT: Docker chạy cổng 20130, biến HQ_PORT
WHY OLD IS INVALID: cổng và tên biến đã đổi theo yêu cầu người dùng
NEW VERIFICATION: assertion mới khớp Dockerfile/compose thật, 76/76 PASS
```

### Runtime Evidence

```text
$ echo $PORT        → 20129        (biến của máy vẫn còn nguyên)
$ echo $HQ_PORT     → <không set>
$ npm start
  🚀 running on: http://localhost:20130      ← đúng mục tiêu

/  /higgsfield  /byteplus  /api/byteplus/status  /api/queue  /api/lan-info   đều 200
/api/lan-info → {"port":20130,"lanUrl":"http://172.16.0.2:20130"}
npm test → 76/76 PASS
```

### Problems / Failures

**1. Ba regex trong test không thay được** do shell nuốt backslash (`\s` → `s`).
Phát hiện qua log "MISS" mà tôi in ra chủ động. Sửa bằng thay theo dòng.
Bài học: script sửa file có regex phải in ra kết quả từng phép thay, không
giả định thành công.

**2. Script kiểm tra secret của tôi báo false positive.** Mẫu `[^\s]` bị nuốt
backslash thành `[^s]`, rồi `sk-` khớp vào chữ "ta**sk-**port-20130". Kiểm lại
đúng cách: không có secret trong HANDOFF.

**3. Phát hiện tiến trình cũ chiếm cổng.** PID 29492 (`npm start` lúc 08:29 của
người dùng) vẫn giữ 20129 bằng code cũ — chính là cổng tool khác cần. Không tự
tắt vì là tiến trình trong terminal của người dùng; đã báo để họ Ctrl+C.

### Important Decisions

**Dự án không còn đọc biến `PORT`.** Đây là thay đổi shared component có chủ đích
(§7): tên `PORT` quá chung, bị tool khác trên cùng máy chiếm, làm dashboard bind
sai một cách âm thầm. Đổi lại, cấu hình thuộc về dự án chứ không phụ thuộc máy —
đúng §39, và quan trọng với một dự án tên là PORTABLE.

Consumer duy nhất của `PORT` cũ là Dockerfile + docker-compose, cả hai đã cập nhật.
Biến `PORT=20129` của người dùng không bị đụng tới.

Phụ: `/api/lan-info` trả `port` kiểu số thay vì chuỗi. `public/app.js` chỉ nội suy
vào template string nên không đổi hành vi.

### Remaining Risks

`HUONG_DAN_CAI_DAT_VA_SU_DUNG_MAY_MOI.docx` vẫn ghi cổng cũ — file nhị phân,
chưa cập nhật.

### Next Steps

Người dùng tắt PID 29492 để trả cổng 20129 cho tool kia.

---

## Report 3 — `task-handoff-init`: khởi tạo hệ thống handoff cho dự án

### User Request

> "À mà e viết bổ sung handoff của dự án đi nhé."
>
> (sau đó) "a kiểm tra handoff chưa có đầy đủ báo cáo về những gì em đã làm
> từ đầu dự án"

### Scope

Tạo `HANDOFF.md` (trạng thái) và `HANDOFF_SNAPSHOTS/` (lịch sử).
Không sửa code.

### Investigation

Người dùng đã xoá `HANDOFF.md` và snapshot của crawler-POD, nên dự án không còn
nơi khai báo `§0 PROJECT CONFIGURATION`.

Phản hồi lần hai chỉ ra đúng chỗ thiếu: `HANDOFF.md` là tài liệu **trạng thái**
(§34 cấm log dump), còn lịch sử chi tiết từng phiên thuộc về **snapshot**
(§35 + §37) — phần này ban đầu tôi bỏ sót.

Mốc thời gian lấy từ bằng chứng filesystem thật, không suy đoán:

```text
logs/2026-09-06.log                      06/09 19:01 → 21:38
byteplus/config.js .. tests/byteplus.test.js   06/09 21:09 → 21:31
logs/2026-09-07.log                      07/09 08:25 → 09:06
docs/BACKUPS/2026-09-07/task-port-20130/ 07/09
server.js (sửa cổng)                     07/09 09:05
```

### Changes Made

```text
docs/AI_RULES/HANDOFF.md                                   MỚI  367 dòng
docs/AI_RULES/HANDOFF_SNAPSHOTS/2026-09-06/SNAPSHOT_001    MỚI  3 report
docs/AI_RULES/HANDOFF_SNAPSHOTS/2026-09-07/SNAPSHOT_001    MỚI  3 report
```

`HANDOFF.md` gồm: khối `§0 PROJECT CONFIGURATION`, 14 mục theo §34, sơ đồ ranh
giới V1/V2, cảnh báo chi phí BytePlus, điều kiện kích hoạt Seedance 2.5
(số dư > 30 USD), và danh sách "ranh giới không được vượt" cho agent sau.

### Files Changed

Chỉ thêm file mới trong `docs/AI_RULES/`. Không chạm source.

### Backup / Rollback

Không cần backup — toàn file mới, không ghi đè gì.
Rollback: xoá 3 file vừa tạo.

### Verification

```text
[x] HANDOFF.md khai báo đủ 7 giá trị §0
[x] không có secret trong HANDOFF/snapshot (kiểm bằng 5 mẫu regex)
[x] snapshot đặt đúng cấu trúc YYYY-MM-DD/HANDOFF_SNAPSHOT_001.md
[x] không overwrite snapshot cũ
[x] mỗi report đủ 12 mục theo §37
[x] mốc thời gian khớp bằng chứng filesystem
```

### Runtime Evidence

Không áp dụng — tài liệu.

### Problems / Failures

**Bỏ sót ở lần giao đầu tiên.** Tôi viết `HANDOFF.md` nhưng không tạo snapshot,
nên lịch sử công việc từ đầu dự án không được ghi lại ở đâu cả. Người dùng phải
chỉ ra mới bổ sung.

Bài học: §36 liệt kê khi nào phải update handoff, nhưng §35 (snapshot lịch sử)
là một nghĩa vụ **riêng biệt** — hoàn thành §34 không có nghĩa đã xong §35.

### Important Decisions

Tách vai trò rõ ràng:

```text
HANDOFF.md       trạng thái HIỆN TẠI — agent đọc để biết đang đứng ở đâu
SNAPSHOT/        lịch sử TỪNG PHIÊN — agent đọc để truy vết vì sao ra nông nỗi này
```

`HANDOFF.md §10 Latest Meaningful Changes` chỉ tóm tắt và trỏ sang snapshot,
không lặp lại nội dung.

### Remaining Risks

Không có rủi ro kỹ thuật. Rủi ro quy trình: snapshot chỉ hữu ích nếu được cập
nhật đều — agent sau phải theo §36.

### Next Steps

```text
1. Người dùng đọc lại HANDOFF.md + 2 snapshot, sửa chỗ ghi chưa đúng ý.
2. Chốt với lead hình thức nạp 10 USD (số dư / savings plan / resource pack).
3. Chốt tài khoản BytePlus cá nhân hay doanh nghiệp → BYTEPLUS_MAX_CONCURRENCY.
4. Quyết định có cần mật khẩu cho /byteplus trước khi bật live không.
```

---

## Report 4 — `task-studio-redesign`: làm lại giao diện GTF Studio

### User Request

> "A thấy giao diện nó hơi xấu e thực hiện sửa lại giao diện theo prompt sau nhé:
> GTF VIDEO AI STUDIO — VISUAL REDESIGN PASS ... DO NOT redesign the application
> architecture ... This task is specifically a visual/UI polish pass ...
> Dark Graphite Creative Studio ... Do NOT change the layout ... Fixed dark theme ...
> Remove excessive gradients ... KOL portraits 4:5 ... Remove emoji UI language"

### Scope

Chỉ trình bày (§21). Không đụng backend, queue semantics, API schema, state
transition hay hệ Higgsfield cũ.

### Investigation

Giao diện cũ trông giống template AI SaaS chung chung vì: gradient tím dùng
khắp nơi, đổ bóng ở mọi thẻ, một giá trị bo góc cho tất cả, emoji làm icon,
và `prefers-color-scheme` khiến máy này máy kia hiển thị khác nhau.

Kiểm kê emoji: 15 chỗ trong `studio.js` (thumbnail dự phòng, nút hành động,
nhãn trạng thái, toast) và ~10 chỗ trong `index.html`.

Ràng buộc bắt buộc giữ: 60 id mà `studio.js` tham chiếu qua `$('...')`.

### Changes Made

`studio.css` viết lại hoàn toàn (525 → 560 dòng):

```text
Theme co dinh    bo prefers-color-scheme + [data-theme], them color-scheme:dark
Token            bg #0d0f12 · surface 1/2/3 · accent #7567ef · mot accent duy nhat
Gradient         bo het o button, progress, card, nav, logo — dung mau dac
The               border-radius 14px, vien mo, KHONG do bong mac dinh
Bo goc           container 14 · control 10 · thumb 10 · tag 6 · pill 999
Do bong          chi con o modal va toast
Font             system stack thay Google Fonts (bo phu thuoc ngoai, §38)
Mono             chi cho @Image/@Video va id ky thuat
Sidebar          muc dang mo: nen accent rat nhat + vach 2.5px, khong to kin
Input            cao 42px, nen toi, focus vien accent + ring mo
Prompt           nen sang hon metadata de noi bat vung sang tao
Reference        thumbnail 60px co preview that + tay cam keo tha
KOL              chan dung 4:5 thay vi vuong 1:1
Rail             4 o metric gon xep doc thay 4 the nang
Progress         4px, track toi, fill accent dac
```

`index.html`: bộ 20 inline SVG line icon (1.8px stroke, currentColor) thay toàn
bộ emoji; empty state chuyên nghiệp; ô metric đảo thứ tự nhãn/giá trị.

`studio.js`: **chỉ thay chuỗi trình bày** — thêm helper `ico()`, 15 emoji → SVG,
2 lớp bọc layout (`.meta` cho thẻ KOL, `.txt` cho picker), và sửa `row()` ở
trang Cài đặt để màu mang nghĩa thay vì trang trí (§19). Không đổi logic nào.

`gateway.html`: viết lại cùng ngôn ngữ thị giác, giữ nguyên cấu trúc 2 lựa chọn.

### Files Changed

```text
public/studio/studio.css    viet lai (525 -> 560 dong)
public/studio/index.html    319 dong, them bo icon SVG, bo emoji
public/studio/studio.js     22 thay doi thuan trinh bay
public/gateway.html         174 dong, viet lai
```

Không chạm: `server.js`, `byteplus/**`, `public/index.html`, `public/app.js`,
`public/styles.css`, `queue_db.json`.

### Backup / Rollback

```text
BACKUP CREATED: docs/BACKUPS/2026-09-07/task-studio-redesign/
                public/gateway.html
                public/studio/{index.html,studio.css,studio.js}
ROLLBACK:       copy nguoc 4 file tren de len public/
```

Backup tạo trước khi sửa file đầu tiên.

### Verification

```text
[x] 60/60 id studio.js tham chieu van ton tai trong index.html
[x] 9/9 icon studio.js goi deu co trong bo defs
[x] npm test 76/76 PASS
[x] khong con emoji trong studio.js
[x] khong con prefers-color-scheme trong studio.css
[x] he Higgsfield cu chi doi 1 dong, va la tu task doi cong truoc do
```

### Runtime Evidence

Kiểm tra trực tiếp trên trình duyệt tại `http://localhost:20130`:

```text
/                Gateway: nen graphite, the moi vien accent, icon line, chip MOCK amber
/byteplus        Create: card phang, input 42px, prompt noi bat
KOL Library      chan dung 4:5, anh phu kin khung, metadata khong canh tranh
KOL modal        be mat noi, backdrop mo, bong manh — dung cho duy nhat duoc do bong
Queue (cho)      the trung tinh, huy hieu "Dang doi" xam, khong thanh tien do
Queue (chay)     10/10 active, huy hieu accent, stage "Queued" 20%, bar 4px accent
Rail             "DANG CHAY 10" nhan accent, 3 metric con lai trung tinh
History          3 the hoan thanh, nut Xem/Tai ve/Xoa deu co icon SVG
Settings         5 hang, MOCK amber, so job trung tinh, provider chua cau hinh xam
Responsive       1000px: rail an, sidebar giu, khong tran ngang
```

**Mock E2E lại sau redesign, đi trọn đường UI:**

```text
Upload anh + video qua input that -> @Image 1, @Video 1
Chon KOL "Linh" qua modal        -> 3 tham chieu
Them vao hang cho                -> Dang chay -> Generating -> Hoan thanh
Ket qua                          -> the History co nut Xem / Tai ve
```

### Problems / Failures

**1. Lỗi tôi tự gây ra: quy tắc `input[type=file]{display:flex}` ghi đè thuộc
tính `hidden`.** Ba input file ẩn hiện thành nút "Choose File" giữa thanh công cụ
tham chiếu. Phát hiện khi chụp màn hình ở bề rộng 1000px. Sửa bằng
`[hidden]{display:none!important}`. Bài học: khi đặt `display` cho một selector
theo kiểu phần tử, phải cân nhắc các phần tử cùng loại đang bị ẩn.

**2. Task hoàn thành bị "tô xanh cả thẻ"** — thanh tiến độ 100% màu xanh chạy hết
chiều ngang, đúng thứ §17 cấm. Sửa bằng `.task:has(.status.completed) .bar{display:none}`.

**3. Trang Cài đặt tô xanh cho số job song song** — màu trang trí, vi phạm §19.
Sửa `row()` nhận biến thể ngữ nghĩa thay vì boolean.

**4. Sót một `<input id="imageFileInputStudio">` không ai dùng** khi viết lại
markup. Đã xoá.

**5. Ba lần click bằng toạ độ bị trượt** do pane trình duyệt scale. Không phải
lỗi ứng dụng — xác minh lại bằng `element.click()` thì nav đổi view đúng.

**6. Heredoc lại bị cắt** khi ghi `gateway.html` một lần. Chia đôi thì được.

### Important Decisions

1. **Theme dark cố định.** Bỏ hẳn `prefers-color-scheme` và `[data-theme]`.
   Lý do: nhân viên dùng nhiều máy, giao diện phải giống nhau.
2. **System font stack thay Google Fonts.** Bỏ một phụ thuộc mạng ngoài (§38),
   và loại luôn nguy cơ font khác nhau giữa các máy.
3. **Chỉ một accent.** Xanh/đỏ/amber chỉ dùng theo nghĩa: xong / lỗi / mock.
4. **Chạm `studio.js` là có chủ đích.** §25 cho phép thay đổi trình bày rất nhỏ;
   không có cách nào bỏ emoji khỏi markup do JS sinh mà không sửa file đó.
   Mọi thay đổi đều là thay chuỗi hoặc thêm lớp bọc — không đổi luồng.

### Remaining Risks

`.task:has(...)` cần trình duyệt hỗ trợ `:has()`. Chrome/Edge/Safari hiện đại
đều có; trình duyệt rất cũ sẽ thấy lại thanh xanh — suy giảm nhẹ, không vỡ.

### Next Steps

Người dùng xem lại giao diện, góp ý chỗ nào chưa ưng.

---

## Report 5 — `task-pixazo-rollback`: hoàn tác toàn bộ thay đổi của task Pixazo

### User Request

> "ROLLBACK TASK — REMOVE ONLY PIXAZO CHANGES. Dừng implementation Pixazo hiện tại.
> Tôi đã có thẻ để kích hoạt BytePlus và sẽ lấy API key BytePlus thật... Một số lệnh
> vừa rồi FAILED giữa chừng. Không được giả định tất cả thay đổi Pixazo đã được ghi
> thành công."

### Scope

Chỉ hoàn tác phần Pixazo. Giữ nguyên toàn bộ V2 đã hoàn thiện trước đó và hệ Higgsfield cũ.

### Investigation

Không giả định — kiểm tra cây làm việc thật trước:

```text
File MOI do Pixazo tao   byteplus/providers/pixazo_ltx_provider.js  (372 dong)
                         byteplus/providers/registry.js             (54 dong)
File BI SUA              byteplus/config.js · byteplus/queue_manager.js
File KHONG bi sua        byteplus/index.js   <- lenh sua bi tu choi giua chung
                         .env.example · package.json
                         tests/runner.js · public/studio/studio.js
```

Điểm mấu chốt: `index.js` **chưa bao giờ được sửa**, nên registry chưa từng được nối
vào hệ thống đang chạy — luồng thật vẫn là `isMock() ? Mock : BytePlus`. Cũng vì thế
`.env.example` chưa có biến `PIXAZO_*` nào và chưa có test Pixazo nào.

Đối chiếu diff 2 file bị sửa với backup đầu task: **100% là phần thêm của Pixazo**,
không dòng V2 nào bị sửa ngoài 2 dòng bị thay (`get maxConcurrency()` và lời gọi
`provider.download(...)`) mà backup giữ nguyên bản gốc. Backup đúng đời: có
`resumeRecovered`/`providerTaskId`/`reorder`, không có `_capabilityPreflight`/`pixazo`.

### Changes Made

```text
KHOI PHUC   byteplus/config.js         <- docs/BACKUPS/2026-09-07/task-pixazo-provider/
KHOI PHUC   byteplus/queue_manager.js  <- nt
GO BO       byteplus/providers/pixazo_ltx_provider.js
GO BO       byteplus/providers/registry.js
```

Hoàn tác theo diff thực tế, từng file một, để không làm mất công việc V2 chưa commit.
Cố tình không dùng cơ chế hoàn tác toàn cục của git.

### Files Changed

4 file (2 khôi phục, 2 gỡ bỏ). Không chạm file nào khác.

### Backup / Rollback

Bản trước Pixazo vẫn nguyên trong `docs/BACKUPS/2026-09-07/task-pixazo-provider/`.
Code Pixazo đã được gỡ theo yêu cầu — muốn dựng lại thì viết mới.

### Verification

```text
[x] khong con tham chieu PIXAZO / videoProvider / GTF_VIDEO_PROVIDER
    / capabilitiesOf / concurrencyCapOf / registry.js nao trong cay lam viec
[x] byteplus/providers/ chi con mock_generation_provider.js + byteplus_generation_provider.js
[x] config.pixazo va config.videoProvider khong con ton tai
[x] .env.example: 0 dong PIXAZO
[x] npm test 76/76 PASS
```

### Runtime Evidence

```text
subsystem      provider = mock · queue tran = 10  (da tro lai binh thuong)
Settings API   khong con chu "pixazo"; MockSeedanceProvider / MockTos / MockLas
Route          / · /higgsfield · /byteplus · /api/byteplus/status
               /api/byteplus/settings · /api/queue · /api/cdp/status  — deu 200
Mock E2E       task voi KOL "Maya" -> completed, submitCount 1, MP4 co tren dia
BytePlus stub  van ton tai; submit() khi chua co key -> NOT_CONFIGURED
```

### Problems / Failures

Không có sự cố khi hoàn tác. Bài học từ chính task Pixazo: lệnh sửa `index.js` bị từ
chối giữa chừng nên hệ thống rơi vào trạng thái **nửa vời** — provider và registry đã
tồn tại nhưng chưa được nối. Nếu tin vào "đã làm xong" thay vì kiểm tra cây làm việc,
việc hoàn tác đã có thể gỡ nhầm hoặc bỏ sót.

### Important Decisions

Không gọi API ngoài nào trong suốt quá trình. Không bắt đầu tích hợp BytePlus thật
trong cùng task này — theo đúng yêu cầu: hoàn tác sạch, xác minh baseline, rồi dừng.

### Remaining Risks

Không có. Trạng thái hệ thống bằng đúng thời điểm ngay sau `task-studio-redesign`.

### Next Steps

Người dùng cung cấp `BYTEPLUS_ARK_API_KEY` thật. Khi đó mới bắt đầu task tích hợp
BytePlus Seedance 2.5 — xem cảnh báo chi phí và điều kiện kích hoạt ở `HANDOFF.md` mục 7.

---

## Report 6 — `task-port-20140`: chuyển cổng runtime sang 20140

### User Request

> "Em ơi a có dự án tool khác đang chiến 20129 và 20130 rồi. Em cho hệ thống của
> tool của mình chuyển sang 20140 nhé"

### Scope

Chỉ đổi cổng. Không chạm logic V1/V2, không chạm giao diện.

### Investigation

Khảo sát trước: 56 chỗ chứa `20130` trong 13 file, cộng 10 chỗ trong `HANDOFF.md`.

`HANDOFF.md` là trường hợp cần tách bạch — có cả hai loại nội dung:

```text
TRANG THAI HIEN TAI  RUNTIME_URL, khoi §0, so do kien truc, muc Runtime,
(phai doi)           canh bao chi phi, huong dan verify        -> 6 dong
LICH SU              ten task `task-port-20130`, ly do doi cong luc do,
(phai giu)           duong dan backup cua task do              -> 4 dong
```

Sửa hàng loạt sẽ viết lại lịch sử, nên phần này thay theo từng dòng.

### Changes Made

```text
56 cho / 13 file    20130 -> 20140
  server.js                   mac dinh HQ_PORT
  3_CHAY_DASHBOARD.bat/.sh    URL + set/export HQ_PORT + doan giai phong cong
  CHAY_TAT_CA_1_CLICK.bat/.sh nt
  Dockerfile                  EXPOSE · ENV · healthcheck
  docker-compose.yml          ports · env
  .env.example                HQ_PORT
  tests/docker_config.test.js 10 cho (assertion + ten test)
  HUONG_DAN_SU_DUNG.md/.html  8 + 6 cho
  HUONG_DAN_CHUYEN_MAY.md     3 cho
  public/index.html           placeholder LAN

6 dong / HANDOFF.md   chi phan trang thai hien tai
```

Cơ chế `HQ_PORT` đặt ra ở `task-port-20130` giữ nguyên — vẫn không đọc biến `PORT`
chung, nên lần đổi này chỉ là thay con số mặc định.

### Files Changed

13 file mã/script/tài liệu + `docs/AI_RULES/HANDOFF.md`.

### Backup / Rollback

```text
BACKUP CREATED: docs/BACKUPS/2026-09-07/task-port-20140/   (14 file)
ROLLBACK:       copy nguoc thu muc tren de len project root
```

Backup tạo trước khi sửa file đầu tiên.

### Verification

```text
[x] npm test 76/76 PASS
[x] npm start bind 20140
[x] /  /higgsfield  /byteplus  /studio/studio.css  /studio/studio.js
    /api/byteplus/status  /api/queue  /api/lan-info   deu 200
[x] /api/lan-info tra {"port":20140, "lanUrl":"http://172.16.0.2:20140"}
[x] khong con 20130 trong ma nguon/script/tai lieu
[x] HANDOFF.md giu nguyen 4 dong lich su nhac `task-port-20130`
```

### Runtime Evidence

Xác minh hai cổng cũ đúng là của tool khác, không phải instance sót lại:

```text
cong 20129   title "Apify Collector — Product Intelligence"   (du an crawler-POD)
             /api/byteplus/status -> 404
cong 20130   khong co title, tra 401 (co lop xac thuc)
             /api/byteplus/status -> 401
cong 20140   dashboard cua chung ta, day du route
```

### Problems / Failures

Không có sự cố. Điểm cần chú ý đã xử lý đúng: nếu thay hàng loạt trong `HANDOFF.md`
thì tên task lịch sử `task-port-20130` và đường dẫn backup của nó sẽ bị viết lại
thành 20140 — sai sự thật và làm hỏng khả năng truy vết.

### Important Decisions

Tài liệu trạng thái và tài liệu lịch sử phải được đối xử khác nhau. Snapshot ngày
06/09 và các report trước trong file này **không bị sửa** — chúng ghi lại đúng điều
đã xảy ra tại thời điểm đó.

### Remaining Risks

`HUONG_DAN_CAI_DAT_VA_SU_DUNG_MAY_MOI.docx` vẫn ghi cổng cũ (file nhị phân, chưa
cập nhật từ `task-port-20130`). Đã ghi ở `HANDOFF.md` mục 9.

### Next Steps

Người dùng cung cấp `BYTEPLUS_ARK_API_KEY` để bắt đầu tích hợp BytePlus Seedance 2.5.
