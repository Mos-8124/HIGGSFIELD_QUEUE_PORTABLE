# HANDOFF SNAPSHOT 003 — 2026-09-18

Task: `task-voice-reliability-deadair` (V2 Video-to-Video) — điều tra từ output THẬT project "hihi".

## User Request (verbatim)
> sao video output nó cái thì bị hiện sạch text ra. Cái thì chả có voice, cái thì có voice đc mỗi
> một đoạn là sao e? Đã vậy nhiều phân cảnh còn nhiều thời lượng mà voice, text của phân cảnh đó
> đã hết rồi? Sửa lại cho a đi
> Trước khi sửa thì e tự xem lại video output đi xem có thêm lỗi gì để sửa lại luôn cho a

## Đo đạc trên output thật (gtf_mu6e2qso_2dd683)
- `silencedetect -50dB`: final_1 im **38.0s liên tục**/58s; final_2 im **39.5s ĐẦU video** (hook câm hẳn);
  final_10 im 27.7s. 10/10 video đều có khoảng chết lớn.
- Đo tốc độ Edge TTS vi-VN thật: **97 từ → 25.42s = 3.82 từ/giây**.
- Đo độ tin cậy Edge TTS: CÙNG một câu lúc chạy lúc hỏng (`NoAudioReceived`), ~50% khi bị siết.
  `edge-tts` đã là bản mới nhất **7.2.8** ⇒ lỗi phía dịch vụ Microsoft, không phải bug thư viện.

## Nguyên nhân gốc → Fix
1. **Không retry, nuốt lỗi** (`assembler.js` cũ: `console.warn` rồi `voiceFiles[i]=null`)
   ⇒ phân cảnh CÂM + phụ đề rơi về chế độ tĩnh (hiện sạch cả cụm).
   - `voice_generator.js`: `runWithRetry` (6 lần, backoff luỹ thừa + jitter), cổng `_ttsGate`
     giới hạn `TTS_CONCURRENCY=2`.
   - **BUG trong bản vá đầu:** `execFileAsync` ném lỗi làm nhánh dự phòng không chạy → đã bọc
     try/catch, nay hỏng đường word-timing vẫn rơi sang `generateVoice` (edge-tts CLI).
   - `assembler.js`: hết retry vẫn không có audio ⇒ **ném `TTS_FAILED`** (không xuất video câm, §13).
2. **Mất word-timing ⇒ hiện sạch text**: thêm `estimateWordTimings(text, audioDur)` — chia thời lượng
   audio theo độ dài từng từ; assembler tự dùng khi `voiceWords` rỗng ⇒ phụ đề LUÔN cuốn chiếu.
3. **Chết tiếng cuối cảnh**: `resolveSegmentDuration({nominal, voiceDuration})` — CO phân cảnh về
   `0.1 + voice + 0.35`s theo số ĐO THẬT; voice dài hơn khung thì giữ nguyên (không dãn, như cũ).
4. **Hằng số sai**: `VOICE_WORDS_PER_SEC = 3.8` (env `V2V_WORDS_PER_SEC`) thay cho 2.6/2.8 rải rác
   trong `timeline_generator.js` ⇒ ngân sách từ & thời lượng phân cảnh khớp giọng đọc thật.

## RUNTIME VERIFIED (render lại chính kịch bản của "hihi")
| | Trước | Sau |
|---|---|---|
| Biến thể #1 | 58.3s, im **38.0s** liền | 38.3s, đoạn im dài nhất **1.2s** |
| Biến thể #2 | 61s, im **39.5s đầu** (hook câm) | 46.4s, đoạn im dài nhất **1.19s**, render OK |
Phụ đề trích frame t=3s / t=19s ⇒ 2 cụm khác nhau (cuốn chiếu, không đổ sạch).

## Files
byteplus/video_studio/voice_generator.js, byteplus/video_studio/assembler.js,
byteplus/video_studio/timeline_generator.js, tests/render_polish.test.js (+13),
tests/footage_driven_timeline.test.js (đổi contract 2.8→VOICE_WORDS_PER_SEC, ghi rõ lý do §30).
`npm test` **379/379**.

## Backup
`docs/BACKUPS/2026-09-18/task-voice-reliability-deadair/` (3 file trước khi sửa).

## Lưu ý còn lại
- Kịch bản CŨ ít chữ hơn khung hình ⇒ sau khi co, video ngắn lại (38-46s). Kịch bản MỚI dùng
  3.8 từ/s nên sẽ lấp đủ ~60s. Muốn video cũ dài đúng ⇒ "Sinh lại kịch bản".
- Hook dài mà lời bình ngắn thì hook bị CẮT theo lời bình (thà cắt còn hơn 17s im lặng).
- Edge TTS vẫn có thể hỏng cả 6 lượt khi Microsoft siết mạnh ⇒ video đó báo lỗi TTS_FAILED rõ ràng
  thay vì xuất bản câm. Chỉnh `V2V_TTS_ATTEMPTS` / `V2V_TTS_CONCURRENCY` nếu cần.
