# HANDOFF SNAPSHOT 002

Date: 2026-09-10
Task: `task-deeplove-cost-calculator-fix`

---

## 1. USER REQUEST & SCOPE

1. **Khac phuc loi tinh chi phi & hien thi gia (Cost Calculator) tren Deeplove Studio V2**:
   - Nguoi dung phan hoi bang tinh cost trong nhu bi set san/ket gia, khong tu dong tinh toan thoi luong video input thuc te de ra gia cost chuan xac.
   - Kiem tra lai co che tinh gia khi co video input va khi khong co video input.
2. **Tao Pull Request len remote upstream**:
   - URL dich: `https://github.com/Mos-8124/HIGGSFIELD_QUEUE_PORTABLE.git`.

---

## 2. ROOT CAUSE ANALYSIS

1. **Giao dien khong re-calculate khi xoa video**:
   - Trong `public/studio/studio.js`, khi xoa video (`removeSingleVideo`), xoa tat ca (`clearAllVideos`), `updateKieCostEstimate()` khong duoc goi lai.
2. **Frontend khong gui `inputVideoDuration` len Backend khi submit task**:
   - Trong `handleSingleTaskSubmit`, `formData` khong dinh kem `inputVideoDuration`. Backend luon nhan 0 va ap dung gia khong video (28 cr/s).
3. **Mau HTML tinh ban dau chua mock cu**:
   - Cac the HTML ban dau trong `public/studio/index.html` co gia tri hardcoded (`3.75 cr/s`, `18.75 cr`).
4. **Ham do thoi luong `getVideoDuration` thieu timeout/onerror**:
   - De gay treo Promise neu file loi metadata.
5. **Tab Bulk Import doc nham DOM id**:
   - `updateKieCostEstimate()` doc `#resolution` thay vi `#bulk-resolution`.

---

## 3. IMPLEMENTATION DETAILS

### 3.1 Frontend (`public/studio/studio.js` & `public/studio/index.html`)
- `getVideoDuration(file)`: Them timeout 3s an toan va `video.onerror`.
- `updateKieCostEstimate()`:
  - Tu nhan dien tab bulk vs single de doc dung dropdown.
  - Gan vao moi su kien: upload, xoa tung video, xoa tat ca, reset form.
- Submit task: Dinh kem `formData.append('inputVideoDuration', appState.totalInputVideoDuration || 0)`.
- Fallback badge credits trong bang hang cho tinh ca `taskInDur`.
- HTML: Cap nhat defaults khop 720p, 16s, 63 cr/s, 1008 cr.

### 3.2 Backend (`byteplus/routes.js`)
- Fallback an toan: Neu task co video ma duration <= 0, tu dong gan toi thieu 4s de dung rate co video (17 cr/s).

---

## 4. VERIFICATION & RESULTS

1. **Automated Tests:** `node tests/runner.js` -> 164/164 tests PASS (100%).
2. **Puppeteer Test:**
   - Chua co video: Rate 28 cr/s, In 0s, Out 4s -> 112 cr.
   - Upload video 4s: Rate 17 cr/s, In 4s, Out 4s -> 136 cr.
   - Xoa video (x): Rate 28 cr/s, In 0s, Out 4s -> 112 cr.
