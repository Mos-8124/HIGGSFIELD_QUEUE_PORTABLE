/**
 * byteplus/video_studio/analyzer_bridge.js
 *
 * Bridge gọi Video Analyzer Pipeline từ Node.js qua Worker stdio NDJSON.
 * Worker Python chạy persistent: khởi động 1 lần, nhận nhiều request qua stdin/stdout.
 *
 * Protocol:
 *   → stdin:  {"type":"request","request_id":"...","action":"analyze_video","params":{...}}
 *   ← stdout: {"type":"progress","request_id":"...","stage":"...","progress":0.5}
 *   ← stdout: {"type":"response","request_id":"...","ok":true,"result":{...}}
 *
 * SRS liên quan: §4 (Media Description Index), §6 (Reference Analysis).
 */
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import path from 'path';
import { config } from '../config.js';
import crypto from 'crypto';

// Đường dẫn đến thư mục video-analyzer-standalone
const ANALYZER_ROOT = process.env.VIDEO_ANALYZER_ROOT
    || path.join(config.root, 'video-analyzer-pipeline', 'video-analyzer-standalone');

// Đường dẫn Python trong venv
const PYTHON_BIN = process.env.VIDEO_ANALYZER_PYTHON
    || (process.platform === 'win32'
        ? path.join(ANALYZER_ROOT, '.venv', 'Scripts', 'python.exe')
        : path.join(ANALYZER_ROOT, '.venv', 'bin', 'python'));

const STARTUP_TIMEOUT_MS = 120_000; // Whisper load có thể lâu
const REQUEST_TIMEOUT_MS = 600_000; // Video dài tốn thời gian

/**
 * Singleton worker — lazy spawn, tự restart nếu chết.
 */
class AnalyzerWorker {
    constructor() {
        this._proc = null;
        this._rl = null;
        this._ready = false;
        this._readyInfo = null;
        this._pending = new Map(); // request_id -> { resolve, reject, onProgress, timer }
        this._readyPromise = null;
    }

    /** Khởi động worker nếu chưa chạy, đợi ready. */
    async ensureReady() {
        if (this._ready && this._proc && !this._proc.killed) return this._readyInfo;
        if (this._readyPromise) return this._readyPromise;

        this._readyPromise = new Promise((resolve, reject) => {
            try {
                this._proc = spawn(PYTHON_BIN, ['-m', 'video_analyzer.worker'], {
                    cwd: ANALYZER_ROOT,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
                });
            } catch (err) {
                this._readyPromise = null;
                reject(new Error(`Không thể khởi động Video Analyzer: ${err.message}`));
                return;
            }

            const timer = setTimeout(() => {
                this._readyPromise = null;
                reject(new Error('Video Analyzer Worker khởi động quá lâu (timeout).'));
                this.kill();
            }, STARTUP_TIMEOUT_MS);

            // Đọc stdout line-by-line (NDJSON)
            this._rl = createInterface({ input: this._proc.stdout });
            this._rl.on('line', (line) => this._handleLine(line));

            // Stderr → log (không ảnh hưởng protocol)
            this._proc.stderr?.on('data', (chunk) => {
                const msg = chunk.toString().trim();
                if (msg) console.error('[video-analyzer]', msg);
            });

            this._proc.on('close', (code) => {
                this._ready = false;
                this._readyPromise = null;
                // Reject tất cả pending requests
                for (const [, pending] of this._pending) {
                    clearTimeout(pending.timer);
                    pending.reject(new Error(`Worker exited (code ${code}).`));
                }
                this._pending.clear();
            });

            // Chờ message "ready"
            const origHandler = this._handleLine.bind(this);
            this._handleLine = (line) => {
                try {
                    const msg = JSON.parse(line);
                    if (msg.type === 'ready') {
                        clearTimeout(timer);
                        this._ready = true;
                        this._readyInfo = msg;
                        this._handleLine = origHandler;
                        resolve(msg);
                        return;
                    }
                } catch (_) {}
                origHandler(line);
            };
        });

        return this._readyPromise;
    }

    /** Xử lý 1 dòng NDJSON từ worker stdout. */
    _handleLine(line) {
        let msg;
        try { msg = JSON.parse(line); } catch (_) { return; }

        const reqId = msg.request_id;
        if (!reqId) return;

        const pending = this._pending.get(reqId);
        if (!pending) return;

        if (msg.type === 'progress') {
            if (pending.onProgress) pending.onProgress(msg.stage, msg.progress);
            return;
        }

        if (msg.type === 'response') {
            clearTimeout(pending.timer);
            this._pending.delete(reqId);
            if (msg.ok) pending.resolve(msg.result);
            else pending.reject(new Error(msg.error?.message || 'Analyzer error'));
        }
    }

    /**
     * Gửi request phân tích video.
     * @param {string} videoPath - Đường dẫn tuyệt đối đến file video.
     * @param {object} opts
     * @param {string} [opts.language='auto'] - Ngôn ngữ: 'auto', 'vi', 'en'
     * @param {number} [opts.frameInterval=0.5] - Khoảng cách giữa các frame (giây)
     * @param {string} [opts.detail='detailed'] - Mức chi tiết: 'summary', 'normal', 'detailed'
     * @param {function} [opts.onProgress] - Callback (stage, progress)
     * @returns {Promise<object>} Kết quả phân tích (FinalAnalysisResult)
     */
    async analyze(videoPath, { language = 'auto', frameInterval = 0.5, detail = 'detailed', onProgress } = {}) {
        await this.ensureReady();

        const requestId = 'req_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pending.delete(requestId);
                reject(new Error(`Phân tích video quá lâu (timeout ${REQUEST_TIMEOUT_MS / 1000}s).`));
            }, REQUEST_TIMEOUT_MS);

            this._pending.set(requestId, { resolve, reject, onProgress, timer });

            const request = {
                type: 'request',
                request_id: requestId,
                action: 'analyze_video',
                params: {
                    video_path: videoPath,
                    language,
                    frame_interval: frameInterval,
                    detail,
                },
            };

            this._proc.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    /** Dừng worker. */
    kill() {
        if (this._proc && !this._proc.killed) {
            try { this._proc.stdin.write(JSON.stringify({ type: 'request', request_id: 'shutdown', action: 'shutdown', params: {} }) + '\n'); } catch (_) {}
            setTimeout(() => { try { this._proc?.kill(); } catch (_) {} }, 3000);
        }
        this._ready = false;
        this._readyPromise = null;
    }

    /** Kiểm tra worker đã sẵn sàng chưa (không spawn). */
    get isReady() { return this._ready && this._proc && !this._proc.killed; }

    /** Thông tin worker (model Whisper, GPU, ...). */
    get info() { return this._readyInfo; }
}

/** Singleton export — toàn hệ thống dùng chung 1 worker. */
export const analyzerWorker = new AnalyzerWorker();

export default analyzerWorker;
