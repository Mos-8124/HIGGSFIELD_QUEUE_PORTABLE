# HANDOFF SNAPSHOT 002

Date: 2026-09-11
Task: `task-kie-mini-replace-standard`

## Report 2 — Sua 2 model them thanh Seedance 2.0 Mini + 2.0 Fast (theo format §37)

### User Request
> "A nham day khong phai 2.0 dau ma la 2.0 Mini va 2.0 Fast em a, e sua lai nhe,
> xong kiem tra dung bang gia, cach tinh cost, thoi luong KIE ho tro. Dam bao a gan
> API key vao user co the call dung model va gui rq len KIE dung model duoc chon."

### Scope
- Thay model 'Seedance 2.0' (standard) -> 'Seedance 2.0 Mini' o registry/pricing/UI/test.
- Giu 'Seedance 2.5' va 'Seedance 2.0 Fast'.
- KHONG dung V1 Higgsfield, khong dung provider byteplus/openrouter (chi la fallback).

### Investigation
- Xac minh truc tiep tren kie.ai + playground (browser):
  - Mini: model id `bytedance/seedance-2-mini`; input duration min=-1 max=15 (4-15s);
    resolution 480p/720p (khong 1080p); gia 480p 2.4/3.8 · 720p 5.0/8.2 (withVideo/withoutVideo).
  - Fast: `bytedance/seedance-2-fast`; 4-15s; 480p/720p; gia 480p 6.8/11.7 · 720p 15/24.8.
  - 2.5: `bytedance/seedance-2-5`; 4-30s; 480p/720p/1080p; gia 17/28, 38/63, 68.5/114 (khop he thong).
- Cong thuc gia chuan Kie (ghi ro tren trang): no-video = rate x output;
  co-video = rate x (input + output). Trung dung logic calculateKieQuote hien co.

### Changes Made
- `byteplus/kie_models.js`: entry 'Seedance 2.0 Mini' (id seedance-2-mini, 480p/720p, 4-15s,
  maxImages 9, maxVideos 3, sendOutputFormat false) + alias; bo entry standard 2.0.
- `byteplus/kie_pricing.js`: MODEL_RATES['Seedance 2.0 Mini'] = {480p 2.4/3.8, 720p 5.0/8.2}
  (CONFIRMED), bo bang standard 2.0.
- `public/studio/index.html`: doi option 2 dropdown -> "Seedance 2.0 Mini".
- `public/studio/studio.js`: gate 1080p cho ca Mini + Fast; MODEL_MAX_DURATION Mini=15.
- `tests/kie_models.test.js`: cap nhat id/gia/schema Mini.

### Files Changed
byteplus/kie_models.js, byteplus/kie_pricing.js, public/studio/index.html,
public/studio/studio.js, tests/kie_models.test.js, docs/AI_RULES/HANDOFF.md (§4 + §10).

### Backup / Rollback
- docs/BACKUPS/2026-09-11/task-kie-mini-replace-standard/ (kie_models, kie_pricing, index.html, studio.js, test)
- docs/BACKUPS/2026-09-11/task-duration-gate/ (studio.js truoc khi gate duration)
- docs/BACKUPS/2026-09-11/task-seedance-2.0-models/ (bo goc truoc toan bo task multi-model)

### Verification
- `npm test`: 173/173 PASS (Tier1 58, Tier2 41, Tier3 47, Tier4 27). 0 live call.
- Server-side `/api/byteplus/pricing/quote` (720p 5s no-video):
  2.5=315cr(rate63), Mini=41cr(rate8.2), Fast=124cr(rate24.8).

### Runtime Evidence
- End-to-end mock fetch bat POST that su gui len Kie:
  UI chon 2.5   -> body.model=bytedance/seedance-2-5 (res 1080p, output_format mp4)
  UI chon Mini  -> body.model=bytedance/seedance-2-mini (720p, khong output_format)
  UI chon Fast  -> body.model=bytedance/seedance-2-fast (720p, khong output_format)
- Live browser cong 20140: dropdown 3 model; Mini 8.2cr/s -> 123cr (720p 15s);
  1080p bi an va tu lui 720p; duration 30 tu ve 15 khi chon Mini/Fast.

### Problems / Failures
- Ban dau lam nham thanh 'Seedance 2.0' standard (snapshot 001) — da thay bang Mini.
- Gia standard 2.0 truoc do la uoc tinh; nay bo hoan toan, ca 3 model deu la rate CONFIRMED tu Kie.

### Important Decisions
- 1 nguon chan ly `kie_models.js`; them model chi sua 1 file.
- Model per-task (task.model + task.kieModel), fallback default 2.5.
- Backend clamp duration + validate theo model; UI gate them de tranh gui sai.
- So tru THUC TE luon lay tu recordInfo.creditsConsumed (bang gia chi la uoc tinh truoc gui).

### Remaining Risks
- `.env` KIE_API_KEY dang trong (user tu gan). Chua co live submit that voi Mini/Fast
  (moi verify bang mock + pricing route; luong 2.5 da chay live thuc te truoc do).

### Next Steps
- User gan KIE_API_KEY -> call duoc ca 3 model ngay.
- Neu Kie doi gia (dang 'beta, may be adjusted'), sua MODEL_RATES.
