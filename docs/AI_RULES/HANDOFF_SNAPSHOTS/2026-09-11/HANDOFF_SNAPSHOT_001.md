# HANDOFF SNAPSHOT 001

Date: 2026-09-11
Task: `task-kie-multimodel-2.0`

## Them luong Seedance 2.0 & 2.0 Fast (dung chung luong Kie voi 2.5)

### User Request
> Setup them luong call Seedance 2.0 va 2.0 Fast, giong luong 2.5 nhung them 2 option.
> API key user tu gan. Cost tinh theo CACH giong 2.5 nhung GIA lay dung bang chuan cua Kie.

### Thiet ke
- Them `byteplus/kie_models.js` — REGISTRY 1 nguon chan ly: 3 model
  (2.5 = bytedance/seedance-2-5, 2.0 = bytedance/seedance-2, 2.0 Fast = bytedance/seedance-2-fast),
  kem gioi han schema tung model (duration, resolutions, maxImages/Videos, sendOutputFormat).
- Model chon per-task: UI -> task.model + task.kieModel -> provider gui dung model id.
- Cung 1 KIE_API_KEY cho ca 3 (cung tai khoan Kie).

### Bang gia (kie_pricing.js) — CACH TINH GIONG NHAU, GIA THEO TUNG MODEL
Cong thuc chuan Kie (xac nhan tren kie.ai): no-video = rate_no x output;
co-video = rate_withVideo x (input + output). credits/giay:
- Seedance 2.5 (CONFIRMED kie.ai/seedance-2-5):
  480p 17/28 · 720p 38/63 · 1080p 68.5/114  (withVideo/withoutVideo)
- Seedance 2.0 Fast (CONFIRMED kie.ai/seedance-2-0, model seedance-2-fast; chi 480p/720p):
  480p 6.8/11.7 · 720p 15/24.8
- Seedance 2.0 standard (Kie KHONG co trang gia cong khai -> quy doi tu USD/s, CAN XAC NHAN):
  480p 11.5/19 · 720p 25/41 · 1080p 62/102
So tru THUC TE luon lay tu recordInfo.creditsConsumed (khong dua vao bang uoc tinh nay).

### Files
- Moi: `byteplus/kie_models.js`, `tests/kie_models.test.js`.
- Sua: `byteplus/kie_pricing.js` (MODEL_RATES per-model), `byteplus/task_factory.js`
  (luu model/kieModel + validate theo model), `byteplus/providers/kie_seedance_provider.js`
  (buildRequestBody chon model id, bo output_format cho 2.0/2.0Fast, clamp duration),
  `byteplus/routes.js` (truyen model vao calculateKieQuote o /pricing/quote, /tasks, /queue/add, bulk),
  `public/studio/index.html` (them option 2 dropdown), `public/studio/studio.js`
  (bo hardcode 'Seedance 2.5', gui model, cost estimate theo model, khoa 1080p cho Fast),
  `tests/runner.js`.
- Backup: `docs/BACKUPS/2026-09-11/task-seedance-2.0-models/`.

### Verify
- npm test: 173/173 PASS (164 cu + 9 multi-model). 0 live call.
- Live browser cong 20140: dropdown 3 model, cost doi dung theo model
  (2.5=63cr/s->315cr, 2.0=41->205, 2.0Fast=24.8->124 cho 720p 5s), Fast tu khoa 1080p va lui ve 720p.

### Con lai cho USER
- Gan KIE_API_KEY vao .env (dung chung cho ca 3 model).
- Neu Kie cong bo gia chinh thuc cho Seedance 2.0 standard khac, sua bang MODEL_RATES['Seedance 2.0'].

---

## Bo sung: Gate THOI LUONG theo model (2026-09-11)

Xac minh tren playground kie.ai: duration cua Seedance 2.0 & 2.0 Fast la input
min=-1, max=15 (tuc 4-15s hoac -1 auto) — KHONG len 30s nhu 2.5.

Loi phat hien: dropdown #duration/#bulk-duration dung chung 4-30s + mac dinh 16s,
sai cho 2.0/2.0 Fast (16s > 15s -> validate reject).

Fix (public/studio/studio.js): them gateDurationByModel() — an moi option > maxDuration
cua model (2.5=30s, 2.0/2.0Fast=15s) va tu ep gia tri dang chon ve moc hop le lon nhat.
Backend da chan san (validate reject >15 + provider clamp <=15); UI gio dong bo.

Verify live cong 20140: 2.5 cho tới 30s; 2.0 & 2.0 Fast an 16-30, dang 30s doi sang thi tu ve 15s.
