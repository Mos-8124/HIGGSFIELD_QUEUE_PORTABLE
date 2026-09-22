import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import util from 'util';
import { generateVoice, generateVoiceWithTiming, estimateWordTimings } from './voice_generator.js';

const execFileAsync = util.promisify(execFile);

/**
 * KIỂU PHỤ ĐỀ (dùng chung cho cả 2 nhánh: word-reveal và fallback tĩnh).
 * - KHÔNG nền đen (box): chữ nổi nhờ viền dày (borderw) + đổ bóng (shadow) ⇒ nhìn sạch, không che hình.
 * - y = h*0.80: hạ phụ đề xuống thấp, vẫn nằm trên vùng UI của TikTok/Reels.
 */
export const SUBTITLE_Y_RATIO = 0.80;

/**
 * DẢI NỀN SAU PHỤ ĐỀ — vẫn cần để CHE phụ đề tiếng Anh cháy sẵn trong clip kho, nhưng đã giảm
 * cường độ (0.92 đen đặc → 0.6) cho đỡ nặng hình. Chỉnh bằng env `V2V_SUBTITLE_BG_ALPHA`.
 * Khác bản cũ: không còn hộp đen bám sát từng chữ (box=1) — thứ nhảy kích thước theo mỗi từ.
 */
const SUBTITLE_BG_ALPHA = (() => {
    const v = Number(process.env.V2V_SUBTITLE_BG_ALPHA);
    return (Number.isFinite(v) && v >= 0 && v <= 1) ? v : 0.6;
})();
export const SUBTITLE_BACKDROP =
    `drawbox=x=40:y=ih*${SUBTITLE_Y_RATIO}-105:w=iw-80:h=210:color=black@${SUBTITLE_BG_ALPHA}:t=fill`;
/**
 * Thời lượng thực dùng cho 1 phân cảnh = vừa đủ chứa voice ĐO ĐƯỢC (không phải ước lượng theo số từ).
 * - Không có voice → giữ nguyên khung gốc.
 * - Voice ngắn hơn khung → CO lại (đầu 0.1s adelay + voice + 0.35s đuôi) ⇒ hết "chết tiếng".
 * - Voice dài hơn khung → giữ khung, phần dư do atempo xử lý như cũ (không kéo dài video).
 */
/**
 * ─────────────────────────────────────────────────────────────────────────
 * SÀN / TRẦN THỜI LƯỢNG 1 PHÂN CẢNH (user chốt 2026-09-19: "1 - 5s").
 * Sàn cũ là 4s; clip hook thật của user chỉ 3.27s nên luật cũ bắt buộc sinh ra
 * khung cắt dài hơn clip — chính là nguồn gốc lỗi mất hình.
 */
export const SEG_FLOOR_SEC = 1.0;
export const SEG_CEIL_SEC = 5.0;

/**
 * ─────────────────────────────────────────────────────────────────────────
 * KẸP THỜI LƯỢNG PHÂN CẢNH VỀ ĐÚNG SỐ GIÂY CLIP GỐC CÓ THẬT.
 *
 * Lỗi user gặp: "video output cứ dừng lại ở một phân cảnh". Đo 10 file thật:
 * luồng HÌNH 4.1-4.9s trong khi luồng TIẾNG 22-24s.
 *
 * Cơ chế: mốc `xfade` được tính từ thời lượng DỰ KIẾN, còn `trim` chỉ ra được
 * đúng số frame clip gốc CÓ. Clip hook 3.27s mà cảnh 1 dự kiến 4.0s ⇒ mốc xfade
 * đầu tiên (3.65s) nằm quá cuối luồng hình, cả chuỗi chuyển cảnh sập và mọi phân
 * cảnh sau bị bỏ. Tiếng thoát được nhờ `apad=whole_dur` đệm đủ — hình không ai đệm.
 *
 * Tái hiện bằng đúng 6 clip của project: 4.533333s / 136 frame, trùng khít file thật.
 * Kẹp rồi dựng lại: 22.57s / 677 frame, đủ 6 phân cảnh.
 *
 * `clamped` được trả ra để chỗ gọi GHI LOG — cắt ngắn phân cảnh mà im lặng thì
 * lần sau lại mất cả buổi đi tìm.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function resolveEffectiveSegmentDuration({ planned, sourceDuration, start = 0, floor = SEG_FLOOR_SEC, ceil = SEG_CEIL_SEC } = {}) {
    const want = Math.min(ceil, Math.max(floor, Math.round((Number(planned) || floor) * 100) / 100));
    const srcDur = Number(sourceDuration);
    const from = Math.max(0, Number(start) || 0);

    // Không đo được clip (0 / NaN / âm) thì GIỮ NGUYÊN khung dự kiến: thà để ffmpeg
    // xử như cũ còn hơn tự đoán rồi cắt ngắn video của user.
    if (!Number.isFinite(srcDur) || srcDur <= 0) {
        return { duration: want, clamped: false, available: null };
    }

    const available = Math.max(0, Math.round((srcDur - from) * 100) / 100);
    if (available >= want) return { duration: want, clamped: false, available };

    return { duration: Math.max(floor, available), clamped: true, available };
}

export function resolveSegmentDuration({ nominal, voiceDuration = 0, minDur = SEG_FLOOR_SEC, headPad = 0.1, tailPad = 0.35 } = {}) {
    const nom = Math.max(minDur, Math.round((Number(nominal) || 0) * 100) / 100);
    const vd = Number(voiceDuration) || 0;
    if (vd <= 0) return nom;
    const needed = headPad + vd + tailPad;
    if (needed >= nom) return nom;
    return Math.max(minDur, Math.round(needed * 100) / 100);
}

export const SUBTITLE_STYLE = [
    'fontsize=46',
    'fontcolor=white',
    'borderw=4',
    'bordercolor=black@0.85',
    'shadowcolor=black@0.6',
    'shadowx=2',
    'shadowy=2',
    'line_spacing=12',
    'x=(w-text_w)/2',
    `y=h*${SUBTITLE_Y_RATIO}-text_h/2`
].join(':');

/**
 * Kiểm tra file có stream âm thanh không để tránh lỗi filter ffmpeg khi concat.
 */
async function hasAudioStream(filePath, ffprobePath = process.env.FFPROBE_PATH || 'ffprobe') {
    try {
        const { stdout } = await execFileAsync(ffprobePath, [
            '-v', 'error',
            '-select_streams', 'a',
            '-show_entries', 'stream=codec_type',
            '-of', 'csv=p=0',
            filePath
        ]);
        return stdout.trim().length > 0;
    } catch (_) {
        return false;
    }
}

/**
 * Đo thời lượng thực tế của file âm thanh (giây) bằng ffprobe.
 */
async function getVideoDuration(filePath, ffprobePath = process.env.FFPROBE_PATH || 'ffprobe') {
    // Đo LUỒNG HÌNH. Trước đây chỗ này gọi hàm đo audio cho file video: clip không có
    // audio sẽ trả 0 và làm tắt luôn chốt an toàn bên dưới.
    try {
        const { stdout } = await execFileAsync(ffprobePath, [
            '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=duration', '-of', 'csv=p=0', filePath
        ]);
        const d = parseFloat(String(stdout).trim());
        if (Number.isFinite(d) && d > 0) return d;
    } catch (_) {}
    // Một số file thiếu duration ở stream ⇒ lấy duration của container.
    try {
        const { stdout } = await execFileAsync(ffprobePath, [
            '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath
        ]);
        const d = parseFloat(String(stdout).trim());
        if (Number.isFinite(d) && d > 0) return d;
    } catch (_) {}
    return 0;
}

async function getAudioDuration(filePath, ffprobePath = process.env.FFPROBE_PATH || 'ffprobe') {
    try {
        const { stdout } = await execFileAsync(ffprobePath, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'json',
            filePath
        ]);
        const data = JSON.parse(stdout);
        const dur = parseFloat(data.format?.duration);
        return isNaN(dur) ? 0 : dur;
    } catch (_) {
        return 0;
    }
}

/**
 * Tự động ngắt dòng thông minh để text overlay không bị tràn màn hình dọc 1080px.
 */
function wrapText(str, maxCharsPerLine = 22) {
    if (!str) return '';
    const words = String(str).trim().split(/\s+/);
    const lines = [];
    let currentLine = '';
    for (const w of words) {
        if (!currentLine) {
            currentLine = w;
        } else if ((currentLine + ' ' + w).length <= maxCharsPerLine) {
            currentLine += ' ' + w;
        } else {
            lines.push(currentLine);
            currentLine = w;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines.join('\n');
}

/**
 * Xây danh sách "reveal" phụ đề HIỆN DỒN TỪNG CHỮ đồng bộ theo giọng đọc.
 * Mỗi reveal = { text (cụm từ tích luỹ từ đầu đến từ k, đã ngắt dòng), start, end } tính theo
 * timeline segment-local (giây). Text hiện TRƯỚC voice đúng `lead` giây (kẹp trong [0.1, 0.2]).
 *
 * @param words  [{ t, off, dur }] — off/dur ở tốc độ 1.0x (giây), off = mốc voice bắt đầu nói từ đó.
 * @param opts   { tempo, adelay, lead, segEnd, maxCharsPerLine }
 *   - tempo  : hệ số atempo áp lên voice trong FFmpeg (voice nhanh hơn → chia off cho tempo).
 *   - adelay : độ trễ voice trong segment (giây), khớp adelay=100ms => 0.1.
 *   - lead   : text hiện sớm hơn voice bao nhiêu giây (kẹp 0.1–0.2 theo yêu cầu).
 *   - segEnd : thời điểm kết thúc segment (giây) để reveal cuối kéo tới hết.
 */
export function buildWordRevealDrawtext(words, {
    tempo = 1,
    adelay = 0.1,
    lead = 0.15,
    segEnd = null,
    maxCharsPerLine = 22,
    chunkWords = 7
} = {}) {
    if (!Array.isArray(words) || words.length === 0) return [];

    const t = (Number(tempo) > 0) ? Number(tempo) : 1;
    const d = Math.max(0, Number(adelay) || 0);
    // Kẹp lead vào [0.1, 0.2]: text chỉ được phép hiện trước voice 0.1–0.2s.
    const L = Math.min(0.2, Math.max(0.1, Number(lead)));

    // localStart[k]: mốc voice bắt đầu nói từ k trong timeline segment-local (đã tính adelay + atempo).
    const localStarts = words.map(w => d + (Math.max(0, Number(w.off) || 0)) / t);

    // appear[k]: mốc text hiện = trước voice L giây; không âm; không lùi so với từ trước (monotonic).
    const appears = [];
    for (let k = 0; k < words.length; k++) {
        let a = Math.max(0, localStarts[k] - L);
        if (k > 0 && a < appears[k - 1]) a = appears[k - 1];
        appears.push(Math.round(a * 1000) / 1000);
    }

    const lastWord = words[words.length - 1];
    const lastVoiceEnd = localStarts[localStarts.length - 1] + (Math.max(0, Number(lastWord.dur) || 0)) / t;
    const finalEnd = (Number.isFinite(segEnd) && segEnd > 0)
        ? Math.max(segEnd, lastVoiceEnd)
        : Math.round((lastVoiceEnd + 0.5) * 1000) / 1000;

    // Chia từ thành CỤM hiển thị (rolling window): cắt khi đạt chunkWords HOẶC gặp cuối câu (.!?…).
    // Mỗi từ chỉ hiện dồn TRONG cụm của nó; sang cụm mới → cụm cũ biến mất (chống "tường chữ").
    const cw = Math.max(1, Number(chunkWords) || 7);
    const chunkStartOf = new Array(words.length); // vị trí bắt đầu cụm chứa từ k
    {
        let curStart = 0, count = 0;
        for (let k = 0; k < words.length; k++) {
            if (count === 0) curStart = k;
            chunkStartOf[k] = curStart;
            count++;
            const endsSentence = /[.!?…]$/.test(String(words[k].t || '').trim());
            if ((count >= cw || endsSentence) && k < words.length - 1) {
                count = 0; // cụm kế bắt đầu ở k+1
            }
        }
    }

    const reveals = [];
    for (let k = 0; k < words.length; k++) {
        const cStart = chunkStartOf[k];
        const cumulative = [];
        for (let j = cStart; j <= k; j++) cumulative.push(String(words[j].t || '').trim());
        const text = wrapText(cumulative.join(' '), maxCharsPerLine);
        const start = appears[k];
        let end = (k < words.length - 1) ? appears[k + 1] : finalEnd;
        if (end <= start) end = Math.round((start + 0.05) * 1000) / 1000; // đảm bảo enable between hợp lệ
        reveals.push({ text, start, end });
    }
    return reveals;
}

/**
 * Chạy `fn` trên `items` với worker-pool giới hạn tối đa `limit` tác vụ ĐỒNG THỜI.
 * Phần còn lại tự động xếp hàng: mỗi worker rút index kế tiếp (nextIndex++) khi rảnh.
 * Lỗi 1 item KHÔNG làm sập pool (kết quả item đó = undefined). Kết quả giữ đúng thứ tự index.
 * Đây là bằng chứng runtime cho rule §18: max quan sát <= limit.
 */
export async function runWithConcurrency(items, limit, fn) {
    const list = Array.isArray(items) ? items : [];
    const results = new Array(list.length);
    if (list.length === 0) return results;

    const cap = Math.max(1, Math.min(Number(limit) || 1, list.length));
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < list.length) {
            const i = nextIndex++;
            try {
                results[i] = await fn(list[i], i);
            } catch (_) {
                results[i] = undefined;
            }
        }
    }

    const workers = Array.from({ length: cap }, () => worker());
    await Promise.all(workers);
    return results;
}

/**
 * Lắp ráp video hoàn chỉnh theo danh sách segment (SRS §10-11).
 * Hỗ trợ cắt giây (trim/atrim), scale/pad về chuẩn 1080p, text overlay (drawtext),
 * lồng tiếng thuyết minh AI (Edge TTS), nhịp thở voice tự nhiên (Audio-Driven Timeline),
 * và hiệu ứng chuyển cảnh mềm mượt (smooth crossfade xfade + acrossfade).
 */
export async function assembleVideo(segments, outputPath, {
    ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath = process.env.FFPROBE_PATH || 'ffprobe',
    voice = 'vi-VN-HoaiMyNeural',
    skipTts = false,
    onProgress = null
} = {}) {
    if (!segments || segments.length === 0) {
        throw Object.assign(new Error('Không có segment nào để lắp ráp.'), { code: 'NO_SEGMENTS' });
    }

    const tempFiles = [];

    try {
        if (typeof onProgress === 'function') {
            onProgress('tts', 0.15, 'Đang tạo giọng đọc AI (Edge TTS)...');
        }

        // 1. Sinh giọng đọc thuyết minh Edge TTS + WORD-TIMING cho các segment có kịch bản voice
        const voiceFiles = [];
        const voiceWords = []; // [{ t, off, dur }] từng từ để phụ đề hiện dồn đồng bộ voice
        if (!skipTts) {
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                if (seg.voice && String(seg.voice).trim()) {
                    // KHÔNG nuốt lỗi: trước đây TTS hỏng chỉ warn ⇒ xuất video CÂM mà không ai biết.
                    // generateVoiceWithTiming đã tự retry; tới đây còn lỗi là hỏng thật ⇒ báo lên.
                    const { path: vf, words } = await generateVoiceWithTiming(seg.voice, { voice });
                    if (!vf) {
                        throw Object.assign(
                            new Error(`Không sinh được giọng đọc cho phân đoạn #${i + 1} (Edge TTS không trả audio).`),
                            { code: 'TTS_FAILED' }
                        );
                    }
                    voiceFiles[i] = vf;
                    voiceWords[i] = Array.isArray(words) ? words : [];
                    tempFiles.push(vf);
                } else {
                    voiceFiles[i] = null;
                    voiceWords[i] = [];
                }
            }
        }

        // 2. Đo thời lượng thực tế của từng đoạn voice TTS
        const voiceDurations = [];
        for (let i = 0; i < segments.length; i++) {
            if (voiceFiles[i]) {
                voiceDurations[i] = await getAudioDuration(voiceFiles[i], ffprobePath);
                // Edge TTS đôi lúc trả audio mà thiếu word-timing → ước lượng nhịp chữ từ độ dài
                // audio để phụ đề vẫn chạy cuốn chiếu (thay vì đổ sạch cả cụm ra màn hình).
                if ((!voiceWords[i] || voiceWords[i].length === 0) && voiceDurations[i] > 0) {
                    voiceWords[i] = estimateWordTimings(segments[i].voice, voiceDurations[i]);
                }
            } else {
                voiceDurations[i] = 0;
            }
        }

        // 3. Tính toán thời lượng cho từng phân cảnh:
        // Lấy khung gốc rồi CO LẠI cho khớp độ dài voice ĐO ĐƯỢC — hết cảnh còn chạy dài sau khi
        // voice/phụ đề đã hết (ước lượng theo số từ luôn lệch; đây là số đo thật).
        const segmentDurations = [];
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const origStart = Math.max(0, Number(seg.sourceIn) || 0);
            const origEnd = Number(seg.sourceOut) || (origStart + 3);
            const origDur = Math.max(1.5, Math.round((origEnd - origStart) * 100) / 100);
            segmentDurations[i] = resolveSegmentDuration({
                nominal: origDur,
                voiceDuration: voiceDurations[i] || 0
            });
        }

        const inputs = [];
        // Thêm tất cả video footage làm inputs (index 0 đến segments.length - 1)
        for (let i = 0; i < segments.length; i++) {
            const videoPath = segments[i].path || segments[i].assetPath;
            if (!videoPath) {
                throw Object.assign(new Error(`Phân đoạn #${i + 1} thiếu đường dẫn video (path/assetPath).`), { code: 'INVALID_SEGMENT_PATH' });
            }
            inputs.push('-i', videoPath);
        }

        // Thêm các file voiceover làm inputs tiếp theo
        const voiceInputIdxs = [];
        let currentInputIdx = segments.length;
        for (let i = 0; i < segments.length; i++) {
            if (voiceFiles[i]) {
                voiceInputIdxs[i] = currentInputIdx++;
                inputs.push('-i', voiceFiles[i]);
            } else {
                voiceInputIdxs[i] = null;
            }
        }

        const filterParts = [];

        // Tìm font Arial trên Windows để drawtext tiếng Việt mượt mà
        const defaultFont = 'C:/Windows/Fonts/arial.ttf';
        const hasFont = fs.existsSync(defaultFont);
        const fontFilterParam = hasFont
            ? `fontfile='${defaultFont.replace(/\\/g, '/').replace(/:/g, '\\:')}':`
            : '';

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const videoPath = seg.path || seg.assetPath;
            const fileDur = await getVideoDuration(videoPath, ffprobePath);

            let start = Math.max(0, Number(seg.sourceIn) || 0);
            if (fileDur > 0) start = Math.min(start, Math.max(0, fileDur - SEG_FLOOR_SEC));

            // CÁCH A (user chốt 2026-09-19): co phân cảnh về đúng số giây clip gốc CÓ.
            // Bắt buộc NẠP LẠI vào segmentDurations vì mốc xfade phía dưới đọc từ mảng này —
            // để số dự kiến ở đó thì mốc trượt quá cuối luồng hình và mất sạch phân cảnh sau
            // (đúng lỗi user gặp: hình 4.5s / tiếng 23.3s).
            const eff = resolveEffectiveSegmentDuration({
                planned: segmentDurations[i],
                sourceDuration: fileDur,
                start
            });
            if (eff.clamped) {
                console.warn(`[VideoStudio] Phân cảnh #${i + 1} bị kẹp ${segmentDurations[i]}s -> ${eff.duration}s: ` +
                    `clip "${path.basename(videoPath)}" chỉ còn ${eff.available}s kể từ giây ${start}.`);
            }
            segmentDurations[i] = eff.duration;

            const D_target = eff.duration;
            const duration = D_target;
            // Mục 8: Bỏ hoàn toàn kéo dãn frames (Slow-motion). Video luôn chạy ở tốc độ thực 1.0x tự nhiên!
            const end = Math.round((start + D_target) * 100) / 100;

            // A. Video filter: trim + natural speed setpts=PTS-STARTPTS + scale 1080x1920 pad + fps=30 + format yuv420p
            let vFilters = [
                `trim=start=${start}:end=${end}`,
                'setpts=PTS-STARTPTS',
                'scale=1080:1920:force_original_aspect_ratio=decrease',
                'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black',
                'fps=30',
                'format=yuv420p'
            ];

            // Tempo voice (atempo) — tính TRƯỚC để phụ đề word-reveal khớp tốc độ voice thực tế.
            const _vDur = voiceDurations[i] || 0;
            const _availDur = Math.max(0.5, duration - 0.20);
            const voiceTempo = (_vDur > _availDur) ? Math.min(2.0, Math.round(((_vDur + 0.1) / _availDur) * 100) / 100) : 1.0;

            // Text overlay: phụ đề dọc 9:16 HIỆN DỒN TỪNG CHỮ đồng bộ giọng đọc
            // (voice nói đến đâu chữ hiện đến đó, hiện trước voice ~0.1–0.2s).
            let subtitleText = '';
            if (seg.voice && String(seg.voice).trim()) {
                subtitleText = String(seg.voice).replace(/[.!?]+$/, '').trim().toUpperCase();
            } else if (seg.text && String(seg.text).trim()) {
                subtitleText = String(seg.text).replace(/[.!?]+$/, '').trim().toUpperCase();
            }

            if (subtitleText) {
                // Dải nền MỜ (không còn đen đặc) che phụ đề cháy sẵn trong footage; chữ nổi thêm
                // nhờ viền + đổ bóng thay cho hộp đen bám từng chữ.
                vFilters.push(SUBTITLE_BACKDROP);

                // Có WORD-TIMING → hiện dồn từng chữ; ngược lại fallback phụ đề tĩnh cả cụm.
                const words = (voiceWords[i] || []).map(w => ({ t: String(w.t || '').toUpperCase(), off: w.off, dur: w.dur }));
                const reveals = (words.length > 0 && voiceFiles[i])
                    ? buildWordRevealDrawtext(words, { tempo: voiceTempo, adelay: 0.1, lead: 0.15, segEnd: duration, maxCharsPerLine: 22 })
                    : [];

                if (reveals.length > 0) {
                    reveals.forEach((r, ri) => {
                        const txtFile = path.join(os.tmpdir(), `v2v_txt_${Date.now()}_${i}_${ri}.txt`);
                        fs.writeFileSync(txtFile, r.text, 'utf-8');
                        tempFiles.push(txtFile);
                        const escapedTxtPath = txtFile.replace(/\\/g, '/').replace(/:/g, '\\:');
                        vFilters.push(
                            `drawtext=${fontFilterParam}textfile='${escapedTxtPath}':${SUBTITLE_STYLE}:enable='between(t,${r.start},${r.end})'`
                        );
                    });
                } else {
                    // Fallback: phụ đề tĩnh cả cụm khi không lấy được word-timing.
                    const text = wrapText(subtitleText, 22);
                    const txtFile = path.join(os.tmpdir(), `v2v_txt_${Date.now()}_${i}.txt`);
                    fs.writeFileSync(txtFile, text, 'utf-8');
                    tempFiles.push(txtFile);
                    const escapedTxtPath = txtFile.replace(/\\/g, '/').replace(/:/g, '\\:');
                    vFilters.push(
                        `drawtext=${fontFilterParam}textfile='${escapedTxtPath}':${SUBTITLE_STYLE}`
                    );
                }
            }

            filterParts.push(`[${i}:v]${vFilters.join(',')}[v${i}]`);

            // B. Audio filter: BỎ HOÀN TOÀN âm thanh gốc từ video kho, chỉ dùng voice AI
            const vIdx = voiceInputIdxs[i];
            if (vIdx !== null && vIdx !== undefined) {
                // Dùng lại voiceTempo đã tính ở trên (atempo để lời bình kết thúc trọn vẹn trong clip)
                const tempo = voiceTempo;
                const tempoFilter = tempo > 1.05 ? `,atempo=${tempo.toFixed(2)}` : '';
                filterParts.push(
                    `[${vIdx}:a]adelay=100|100,volume=1.2${tempoFilter},aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:${duration},apad=whole_dur=${duration},asetpts=PTS-STARTPTS[a${i}]`
                );
            } else {
                // Không có voice TTS: chèn silence (tĩnh lặng)
                filterParts.push(
                    `anullsrc=r=44100:cl=stereo,atrim=0:${duration},asetpts=PTS-STARTPTS[a${i}]`
                );
            }
        }

        // C. Smooth Transition (Chuyển cảnh mềm mại xfade + acrossfade)
        if (segments.length === 1) {
            filterParts.push(`[v0]null[outv]`);
            filterParts.push(`[a0]anull[outa]`);
        } else {
            const minSegDur = Math.min(...segmentDurations);
            const T = Math.min(0.35, Math.max(0.1, Math.round((minSegDur / 3) * 100) / 100));
            let runningOffset = Math.round((segmentDurations[0] - T) * 100) / 100;

            for (let k = 0; k < segments.length - 1; k++) {
                const isLast = (k === segments.length - 2);
                const inV1 = (k === 0) ? 'v0' : `vx${k}`;
                const inV2 = `v${k + 1}`;
                const outV = isLast ? 'outv' : `vx${k + 1}`;

                const inA1 = (k === 0) ? 'a0' : `ax${k}`;
                const inA2 = `a${k + 1}`;
                const outA = isLast ? 'outa' : `ax${k + 1}`;

                filterParts.push(`[${inV1}][${inV2}]xfade=transition=fade:duration=${T}:offset=${runningOffset.toFixed(2)}[${outV}]`);
                filterParts.push(`[${inA1}][${inA2}]acrossfade=d=${T}:c1=tri:c2=tri[${outA}]`);

                if (!isLast) {
                    runningOffset = Math.round((runningOffset + segmentDurations[k + 1] - T) * 100) / 100;
                }
            }
        }

        const filterScriptPath = path.join(os.tmpdir(), `v2v_filter_${Date.now()}.txt`);
        fs.writeFileSync(filterScriptPath, filterParts.join(';\n'), 'utf-8');
        tempFiles.push(filterScriptPath);

        const args = [
            '-y',
            ...inputs,
            '-filter_complex_script', filterScriptPath,
            '-map', '[outv]',
            '-map', '[outa]',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '22',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            outputPath
        ];

        if (typeof onProgress === 'function') {
            onProgress('ffmpeg', 0.55, 'Đang cắt ghép, phụ đề & lọc cảnh (FFmpeg)...');
        }

        await execFileAsync(ffmpegPath, args, { timeout: 300000 });

        if (typeof onProgress === 'function') {
            onProgress('completed', 1.0, 'Hoàn tất');
        }
        return outputPath;
    } catch (err) {
        console.error('Lỗi khi lắp ráp video FFmpeg:', err);
        const e = new Error(`Lỗi khi lắp ráp video: ${(err && err.message) || err}`);
        e.code = 'ASSEMBLY_FAILED';
        throw e;
    } finally {
        for (const f of tempFiles) {
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
        }
    }
}

/**
 * Dựng batch video đa luồng với worker pool tối ưu tài nguyên (Controlled Concurrency).
 * Giới hạn tối đa `concurrency` video render ĐỒNG THỜI, phần còn lại tự xếp hàng đợi
 * (ví dụ 100 video, concurrency=10 → chỉ 10 chạy cùng lúc, 90 chờ). Dùng runWithConcurrency
 * để đảm bảo & chứng minh được max quan sát <= limit (rule §18).
 */
export async function batchAssemble(timelines, outputDir, {
    ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath = process.env.FFPROBE_PATH || 'ffprobe',
    voice = 'vi-VN-HoaiMyNeural',
    concurrency = Number(process.env.V2V_RENDER_CONCURRENCY) || 10,
    onProgress = null
} = {}) {
    fs.mkdirSync(outputDir, { recursive: true });

    // Khởi tạo trạng thái ban đầu cho toàn bộ danh sách video (tất cả = "chờ hàng đợi")
    timelines.forEach((tl, idx) => {
        const videoIndex = tl.index || (idx + 1);
        if (typeof onProgress === 'function') {
            onProgress(videoIndex, 'queued', 0, 'Đang chờ hàng đợi...');
        }
    });

    return runWithConcurrency(timelines, concurrency, async (tl, currentIdx) => {
        const videoIndex = tl.index || (currentIdx + 1);
        const outFileName = `final_${videoIndex}.mp4`;
        const outPath = path.join(outputDir, outFileName);

        if (typeof onProgress === 'function') {
            onProgress(videoIndex, 'started', 0.1, 'Bắt đầu xử lý...');
        }

        try {
            await assembleVideo(tl.segments, outPath, {
                ffmpegPath,
                ffprobePath,
                voice,
                onProgress: (stage, pct, desc) => {
                    if (typeof onProgress === 'function') {
                        onProgress(videoIndex, stage, pct, desc);
                    }
                }
            });

            if (typeof onProgress === 'function') {
                onProgress(videoIndex, 'completed', 1.0, 'Hoàn tất');
            }

            return {
                index: videoIndex,
                title: tl.title,
                angle: tl.angle,
                directorNote: tl.directorNote,
                success: true,
                outputPath: outPath,
                fileName: outFileName
            };
        } catch (err) {
            console.error(`[BatchAssemble] Lỗi render video #${videoIndex}:`, err);
            if (typeof onProgress === 'function') {
                onProgress(videoIndex, 'failed', 0, `Lỗi: ${err.message}`);
            }
            return {
                index: videoIndex,
                title: tl.title,
                angle: tl.angle,
                success: false,
                error: err.message
            };
        }
    });
}


