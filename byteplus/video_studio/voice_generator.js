import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import url from 'url';
import util from 'util';
import { config } from '../config.js';

const execFileAsync = util.promisify(execFile);

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Python trong venv của video-analyzer (đã có edge-tts) để chạy tts_timing.py lấy word-timing.
const PY_BIN = process.env.EDGE_TTS_PYTHON
    || (process.platform === 'win32'
        ? path.join(process.env.VIDEO_ANALYZER_ROOT || path.join(config.root, 'video-analyzer-pipeline', 'video-analyzer-standalone'), '.venv', 'Scripts', 'python.exe')
        : path.join(process.env.VIDEO_ANALYZER_ROOT || path.join(config.root, 'video-analyzer-pipeline', 'video-analyzer-standalone'), '.venv', 'bin', 'python'));

const TTS_TIMING_SCRIPT = path.join(__dirname, 'tts_timing.py');

const ANALYZER_ROOT = process.env.VIDEO_ANALYZER_ROOT
    || path.join(config.root, 'video-analyzer-pipeline', 'video-analyzer-standalone');

const EDGE_TTS_BIN = process.env.EDGE_TTS_BIN
    || (process.platform === 'win32'
        ? path.join(ANALYZER_ROOT, '.venv', 'Scripts', 'edge-tts.exe')
        : path.join(ANALYZER_ROOT, '.venv', 'bin', 'edge-tts'));

/**
 * Edge TTS hỏng NGẪU NHIÊN (`NoAudioReceived`) ~10-20%, nhất là khi nhiều luồng render gọi cùng lúc.
 * Đo thật 2026-09-18: 1-2/10 request hỏng hẳn + 2/10 mất word-timing. Trước đây code chỉ `console.warn`
 * rồi trả voice rỗng ⇒ video CÂM và phụ đề rơi về chế độ hiện sạch cả cụm.
 */
// Đo thật 2026-09-18: CÙNG một câu lúc chạy lúc không (~50% hỏng khi bị throttle), edge-tts đã là
// bản mới nhất 7.2.8 ⇒ lỗi từ phía dịch vụ. 6 lần thử + backoff luỹ thừa đưa xác suất hỏng hẳn
// xuống ~1.5%; hạ song song xuống 2 để đỡ bị siết.
export const TTS_MAX_ATTEMPTS = Math.max(1, Number(process.env.V2V_TTS_ATTEMPTS) || 6);
export const TTS_CONCURRENCY = Math.max(1, Number(process.env.V2V_TTS_CONCURRENCY) || 2);

/**
 * Thử lại `fn` tới `attempts` lần, backoff luỹ thừa + jitter (tránh 10 luồng render cùng thử lại
 * một nhịp). Hết lượt vẫn hỏng thì NÉM LỖI — không trả về voice rỗng để rồi xuất video câm.
 */
export async function runWithRetry(fn, { attempts = TTS_MAX_ATTEMPTS, delayMs = 800, maxDelayMs = 8000 } = {}) {
    let lastErr;
    const n = Math.max(1, attempts);
    for (let i = 0; i < n; i++) {
        try {
            return await fn(i);
        } catch (err) {
            lastErr = err;
            if (i < n - 1) {
                const wait = Math.min(maxDelayMs, delayMs * Math.pow(2, i)) * (0.7 + Math.random() * 0.6);
                await new Promise(r => setTimeout(r, wait));
            }
        }
    }
    throw lastErr;
}

// Cổng giới hạn số TTS chạy song song — 10 luồng render × TTS đồng thời làm Edge TTS rớt request.
let _ttsActive = 0;
const _ttsQueue = [];
async function _ttsGate(fn) {
    if (_ttsActive >= TTS_CONCURRENCY) await new Promise(res => _ttsQueue.push(res));
    _ttsActive++;
    try {
        return await fn();
    } finally {
        _ttsActive--;
        const next = _ttsQueue.shift();
        if (next) next();
    }
}

export const AVAILABLE_VOICES = [
    // Giọng tiếng Việt (Edge TTS) — mặc định cho kịch bản tiếng Việt.
    { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My (VI Nữ - Truyền cảm)', gender: 'Female' },
    { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh (VI Nam - Trầm ấm)', gender: 'Male' },
    // Giọng tiếng Anh (Edge TTS).
    { id: 'en-US-AriaNeural',    name: 'Aria (US Female — Confident, Upbeat)', gender: 'Female' },
    { id: 'en-US-GuyNeural',     name: 'Guy (US Male — Warm, Persuasive)', gender: 'Male' },
    { id: 'en-US-JennyNeural',   name: 'Jenny (US Female — Friendly, Casual)', gender: 'Female' },
    { id: 'en-US-EricNeural',    name: 'Eric (US Male — Bold, Energetic)', gender: 'Male' },
    { id: 'en-GB-SoniaNeural',   name: 'Sonia (UK Female — Elegant)', gender: 'Female' }
];

/**
 * Sinh file giọng nói tiếng Việt bằng Edge TTS (SRS §10 bước 7).
 * Hoàn toàn miễn phí, chất lượng cao từ Microsoft Speech.
 */
export async function generateVoice(text, { voice = 'vi-VN-HoaiMyNeural', rate = '+0%', pitch = '+0Hz', outPath = null } = {}) {
    if (!text || !String(text).trim()) return null;

    const trimmed = String(text).trim();
    const targetPath = outPath || path.join(os.tmpdir(), `v2v_voice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mp3`);

    const exe = fs.existsSync(EDGE_TTS_BIN) ? EDGE_TTS_BIN : 'edge-tts';

    const args = [
        '--voice', voice,
        '--text', trimmed,
        '--rate', rate,
        '--pitch', pitch,
        '--write-media', targetPath
    ];

    try {
        await execFileAsync(exe, args, { timeout: 30000 });
        if (fs.existsSync(targetPath)) return targetPath;
        return null;
    } catch (err) {
        console.warn('Cảnh báo: Không thể sinh voice bằng Edge TTS:', (err && err.message) || err);
        return null;
    }
}

/**
 * Sinh giọng đọc + WORD-TIMING từng chữ (dùng cho phụ đề hiện dồn đồng bộ với voice).
 * Chạy tts_timing.py (edge-tts boundary='WordBoundary') — MIỄN PHÍ, local.
 * Trả về { path, words:[{ t, off, dur }] } (off/dur giây, tốc độ 1.0x).
 * Nếu thất bại (thiếu python/venv/script) → fallback generateVoice() và words=[] để caller
 * quay về phụ đề tĩnh (không làm hỏng pipeline).
 */
export async function generateVoiceWithTiming(text, { voice = 'vi-VN-HoaiMyNeural', rate = '+0%', pitch = '+0Hz', outPath = null } = {}) {
    if (!text || !String(text).trim()) return { path: null, words: [] };

    const trimmed = String(text).trim();
    const targetPath = outPath || path.join(os.tmpdir(), `v2v_voice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mp3`);

    // Nếu không có python venv hoặc script → fallback giọng đọc thường, không có timing.
    if (!fs.existsSync(PY_BIN) || !fs.existsSync(TTS_TIMING_SCRIPT)) {
        const p = await generateVoice(trimmed, { voice, rate, pitch, outPath: targetPath });
        return { path: p, words: [] };
    }

    const hasAudio = (f) => { try { return !!f && fs.existsSync(f) && fs.statSync(f).size > 0; } catch (_) { return false; } };

    // Edge TTS rớt ngẫu nhiên ⇒ PHẢI thử lại. Bỏ qua sẽ ra video câm + phụ đề hiện sạch cả cụm.
    return runWithRetry(async (attempt) => _ttsGate(async () => {
        try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath); } catch (_) {}

        // Đường chính: lấy audio + word-timing. Script lỗi thì KHÔNG được ném ra ngay —
        // còn đường dự phòng (edge-tts CLI) bên dưới, thực tế nó vẫn chạy khi đường này rớt.
        let parsed = null;
        try {
            const { stdout } = await execFileAsync(PY_BIN, [
                TTS_TIMING_SCRIPT,
                '--voice', voice,
                '--rate', rate,
                '--pitch', pitch,
                '--text', trimmed,
                '--out', targetPath
            ], { timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
            try { parsed = JSON.parse(String(stdout).trim().split(/\r?\n/).pop()); } catch (_) { parsed = null; }
        } catch (_) {
            parsed = null;
        }

        if (parsed && parsed.ok && Array.isArray(parsed.words) && parsed.words.length > 0 && hasAudio(targetPath)) {
            return { path: targetPath, words: parsed.words };
        }

        // Có audio nhưng MẤT word-timing → thử lại vài lượt, hết lượt mới chịu (assembler sẽ tự
        // ước lượng nhịp chữ từ độ dài audio, phụ đề vẫn chạy cuốn chiếu).
        if (hasAudio(targetPath)) {
            if (attempt < TTS_MAX_ATTEMPTS - 2) throw new Error('TTS thiếu word-timing, thử lại');
            return { path: targetPath, words: [] };
        }

        // Không có audio → đường dự phòng: gọi thẳng edge-tts CLI (thực nghiệm: thường vẫn ra tiếng
        // ngay cả lúc đường word-timing bị từ chối).
        let p = null;
        try { p = await generateVoice(trimmed, { voice, rate, pitch, outPath: targetPath }); } catch (_) { p = null; }
        if (hasAudio(p)) return { path: p, words: [] };

        throw new Error('Edge TTS không trả về audio (NoAudioReceived)');
    }));
}

/**
 * Ước lượng nhịp hiện từng chữ khi Edge TTS trả audio nhưng KHÔNG kèm word-timing.
 * Chia thời lượng audio theo độ dài từng từ (từ dài đọc lâu hơn) ⇒ phụ đề vẫn chạy cuốn chiếu
 * thay vì đổ sạch cả cụm ra màn hình.
 * @returns {Array<{t:string, off:number, dur:number}>} off/dur tính bằng GIÂY.
 */
export function estimateWordTimings(text, audioDurationSec) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const total = Number(audioDurationSec) || 0;
    if (words.length === 0 || total <= 0) return [];

    const weights = words.map(w => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, '').length));
    const sum = weights.reduce((a, b) => a + b, 0);

    let cursor = 0;
    return words.map((w, i) => {
        const dur = Math.round((total * (weights[i] / sum)) * 1000) / 1000;
        const off = Math.round(cursor * 1000) / 1000;
        cursor += dur;
        return { t: w, off, dur };
    });
}

export default { generateVoice, generateVoiceWithTiming, AVAILABLE_VOICES };
