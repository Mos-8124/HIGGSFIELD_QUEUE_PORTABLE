/**
 * byteplus/providers/kie_seedance_provider.js
 *
 * Real Generation Provider cho ByteDance Seedance 2.5 qua Kie.ai Jobs API.
 *
 * Endpoint (xác minh từ tài liệu chính thức docs.kie.ai):
 *   POST {baseUrl}/api/v1/jobs/createTask
 *   GET  {baseUrl}/api/v1/jobs/recordInfo?taskId=<id>
 *   GET  {baseUrl}/api/v1/chat/credit              (số dư credit — chỉ dùng ở backend)
 *
 * Model: bytedance/seedance-2-5
 *
 * Hợp đồng giống hệt BytePlusGenerationProvider / OpenRouterSeedanceProvider / MockSeedanceProvider:
 *   submit()            -> { providerTaskId, providerStatus: 'submitted' }
 *   poll()              -> { providerStatus, stage, progress, outputUrl, error }
 *   waitForCompletion() -> lặp poll cho đến khi hoàn thành hoặc ném lỗi
 *   resume()            -> chỉ poll job cũ bằng GET, TUYỆT ĐỐI không submit lại
 *   download()          -> tải MP4 về ổ đĩa cục bộ
 *
 * An toàn & bảo vệ credit:
 *  - Không bao giờ gọi mạng khi chưa có KIE_API_KEY.
 *  - Không bao giờ để lộ KIE_API_KEY trong log, error message hay task JSON.
 *  - Chặn cứng request ra ngoài khi đang chạy trong test tự động.
 *  - Chống sinh trùng: task đã có providerTaskId thì chỉ resume/poll, không submit lại.
 *  - Không tự động retry sinh video sau khi bị từ chối nội dung (retry là hành động thủ công).
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { ensureDir } from '../store.js';
import { isExpired, normalizeKieHttpError } from './kie_file_provider.js';
import { resolveKieModel } from '../kie_models.js';

/** Kiểm tra URL có phải HTTPS công khai (chặn localhost / LAN / file://). */
export function isPublicHttpsUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
        const u = new URL(urlStr);
        if (u.protocol !== 'https:') return false;
        const host = u.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return false;
        if (host.endsWith('.local') || host.endsWith('.internal')) return false;
        if (/^10\./.test(host)) return false;
        if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
        if (/^192\.168\./.test(host)) return false;
        if (/^169\.254\./.test(host)) return false;
        return true;
    } catch {
        return false;
    }
}

/** Tham chiếu dùng được: hoặc là asset:// của Kie, hoặc là HTTPS công khai. */
export function isUsableReferenceUrl(urlStr) {
    if (typeof urlStr === 'string' && urlStr.startsWith('asset://')) return true;
    return isPublicHttpsUrl(urlStr);
}

/**
 * Chuẩn hoá trạng thái thất bại do Kie trả về trong recordInfo.
 * Nội dung bị kiểm duyệt -> KIE_CONTENT_REJECTED (KHÔNG tự động retry, tránh mất credit).
 */
export function normalizeKieFailure(failCode, failMsg) {
    const raw = `${failCode || ''} ${failMsg || ''}`.toLowerCase();
    const message = failMsg || failCode || 'Kie.ai sinh video thất bại.';

    if (/sensitive|moderat|nsfw|policy|privacy|reject|violat|prohibit|real person/.test(raw)) {
        return { code: 'KIE_CONTENT_REJECTED', message: `KIE_CONTENT_REJECTED: ${message}` };
    }
    if (/credit|balance|insufficient|quota/.test(raw)) {
        return { code: 'KIE_INSUFFICIENT_CREDITS', message: `KIE_INSUFFICIENT_CREDITS: ${message}` };
    }
    if (/timeout|timed out/.test(raw)) {
        return { code: 'KIE_POLL_TIMEOUT', message: `KIE_POLL_TIMEOUT: ${message}` };
    }
    return { code: 'KIE_PROVIDER_FAILED', message: `KIE_PROVIDER_FAILED: ${message}` };
}

export class KieSeedanceProvider {
    constructor({
        apiKey,
        baseUrl,
        model = config.kie?.model,
        pollIntervalMs = config.kie?.pollIntervalMs,
        pollTimeoutMs = config.kie?.pollTimeoutMs,
        callbackUrl = config.kie?.callbackUrl,
        fetchFn
    } = {}) {
        this.name = 'kie';
        this._explicitApiKey = apiKey;
        this._explicitBaseUrl = baseUrl;
        this.model = model || 'bytedance/seedance-2-5';
        this.pollIntervalMs = Number.isFinite(pollIntervalMs) ? pollIntervalMs : 5000;
        this.pollTimeoutMs = Number.isFinite(pollTimeoutMs) ? pollTimeoutMs : 900000;
        this.callbackUrl = callbackUrl || '';
        this.fetchFn = fetchFn;
    }

    get apiKey() {
        return this._explicitApiKey !== undefined ? this._explicitApiKey : (config.kie?.apiKey || process.env.KIE_API_KEY || '');
    }

    set apiKey(val) {
        this._explicitApiKey = val;
    }

    get baseUrl() {
        return (this._explicitBaseUrl !== undefined ? this._explicitBaseUrl : (config.kie?.baseUrl || process.env.KIE_BASE_URL || 'https://api.kie.ai')).replace(/\/+$/, '');
    }

    set baseUrl(val) {
        this._explicitBaseUrl = val;
    }

    isConfigured() {
        return Boolean(this.apiKey && this.apiKey.trim().length > 0);
    }

    /**
     * Chặn cứng cuộc gọi mạng thật trong test tự động.
     * Ngoài test: dùng fetch mặc định — chỉ cần KIE_API_KEY, không cần cờ nào khác.
     */
    _getFetch(opts) {
        const fn = (opts && opts.fetchFn) || this.fetchFn;
        if (fn) return fn;

        const isTest = process.env.NODE_ENV === 'test' ||
                       process.env.npm_lifecycle_event === 'test' ||
                       process.argv.some(a => a.includes('test'));
        if (isTest) {
            const err = new Error('LIVE_TEST_DISABLED: Hệ thống chặn request ra mạng thật đến Kie.ai trong môi trường test để bảo vệ credit.');
            err.code = 'LIVE_TEST_DISABLED';
            throw err;
        }
        return globalThis.fetch;
    }

    _requireApiKey() {
        if (!this.apiKey || !this.apiKey.trim()) {
            const err = new Error('KIE_API_KEY_MISSING: Chưa cấu hình KIE_API_KEY trong file .env.');
            err.code = 'KIE_API_KEY_MISSING';
            throw err;
        }
    }

    /**
     * Kiểm tra điều kiện tiên quyết TRƯỚC khi tiêu credit:
     *  1. Có KIE_API_KEY.
     *  2. Mọi tham chiếu (ảnh / video / KOL) đều có URL Kie hợp lệ và chưa hết hạn.
     */
    validatePreflight(task) {
        this._requireApiKey();

        const refs = Array.isArray(task && task.references) ? task.references : [];
        for (const ref of refs) {
            if (ref.type !== 'image' && ref.type !== 'video' && ref.type !== 'audio' && ref.type !== 'kol') continue;

            const url = ref.remoteUrl || ref.assetUri || ref.url;
            const label = ref.displayName || ref.originalName || ref.alias || ref.id;

            if (!url || !isUsableReferenceUrl(url)) {
                const err = new Error(`KIE_REFERENCE_UNAVAILABLE: Tham chiếu "${label}" chưa có URL Kie.ai hợp lệ.`);
                err.code = 'KIE_REFERENCE_UNAVAILABLE';
                throw err;
            }
            if (isExpired(ref.expiresAt)) {
                const err = new Error(`KIE_REFERENCE_EXPIRED: URL tạm của tham chiếu "${label}" đã hết hạn, cần tải lên lại.`);
                err.code = 'KIE_REFERENCE_EXPIRED';
                throw err;
            }
        }
    }

    /**
     * Map task nội bộ sang request của Kie Seedance 2.5.
     *
     * THỨ TỰ THAM CHIẾU LÀ HỢP ĐỒNG: mảng reference_image_urls giữ đúng thứ tự
     * hiển thị trên UI, nên "Image 1" trong prompt luôn là ảnh thứ nhất gửi đi.
     */
    buildRequestBody(task) {
        const refs = Array.isArray(task && task.references) ? task.references.slice() : [];
        // Giữ đúng thứ tự người dùng sắp xếp; ref không có order thì bám thứ tự mảng.
        const original = new Map(refs.map((r, i) => [r, i]));
        refs.sort((a, b) => {
            const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : original.get(a);
            const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : original.get(b);
            return ao - bo;
        });

        const imageUrls = [];
        const videoUrls = [];
        const audioUrls = [];

        for (const ref of refs) {
            const url = ref.remoteUrl || ref.assetUri || ref.url;
            if (!url) continue;
            // KOL là ảnh nhân vật -> đi chung mảng ảnh, đúng vị trí người dùng đặt.
            if (ref.type === 'image' || ref.type === 'kol') imageUrls.push(url);
            else if (ref.type === 'video') videoUrls.push(url);
            else if (ref.type === 'audio') audioUrls.push(url);
        }

        // Model theo tung task (2.5 / 2.0 / 2.0 Fast); fallback ve model mac dinh cua provider.
        const modelEntry = resolveKieModel((task && (task.kieModel || task.model)) || this.model);

        const input = {
            prompt: (task && task.prompt ? String(task.prompt) : '').trim()
        };
        // output_format chi Seedance 2.5 nhan; 2.0/2.0 Fast khong co truong nay.
        if (modelEntry.sendOutputFormat) input.output_format = 'mp4';

        if (Number.isFinite(Number(task && task.duration))) {
            // Clamp thoi luong vao khoang model ho tro (2.0/2.0 Fast toi da 15s).
            let dur = Number(task.duration);
            dur = Math.max(modelEntry.minDuration, Math.min(modelEntry.maxDuration, dur));
            input.duration = dur;
        }
        if (task && task.resolution) input.resolution = task.resolution;
        if (task && task.aspectRatio) input.aspect_ratio = task.aspectRatio;
        if (task && task.generateAudio !== undefined) input.generate_audio = task.generateAudio !== false;

        if (imageUrls.length) input.reference_image_urls = imageUrls;
        if (videoUrls.length) input.reference_video_urls = videoUrls;
        if (audioUrls.length) input.reference_audio_urls = audioUrls;

        const body = { model: modelEntry.id, input };
        if (this.callbackUrl) body.callBackUrl = this.callbackUrl;
        return body;
    }

    /** Đọc JSON an toàn, ném lỗi có mã khi response không phải JSON. */
    async _readJson(res, fallbackCode) {
        try {
            return await res.json();
        } catch (_) {
            const err = new Error(`${fallbackCode}: Kie.ai trả về dữ liệu không phải JSON (HTTP ${res.status}).`);
            err.code = fallbackCode;
            throw err;
        }
    }

    /** POST /api/v1/jobs/createTask — điểm DUY NHẤT tiêu credit. */
    async submit(task, { signal, fetchFn } = {}) {
        if (signal && signal.aborted) throw new Error('Cancelled');

        this.validatePreflight(task);

        const fetcher = this._getFetch({ fetchFn });
        const endpoint = `${this.baseUrl}/api/v1/jobs/createTask`;
        const body = this.buildRequestBody(task);

        let res;
        try {
            res = await fetcher(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(body),
                signal
            });
        } catch (err) {
            if (err && err.name === 'AbortError') throw new Error('Cancelled');
            if (err && err.code === 'LIVE_TEST_DISABLED') throw err;
            const e = new Error(`KIE_PROVIDER_FAILED: Lỗi kết nối tới Kie.ai: ${err.message}`);
            e.code = 'KIE_PROVIDER_FAILED';
            e.cause = err;
            throw e;
        }

        const data = await this._readJson(res, 'KIE_PROVIDER_FAILED');
        const apiCode = data && typeof data.code === 'number' ? data.code : res.status;

        if (!res.ok || apiCode !== 200) {
            const norm = normalizeKieHttpError(apiCode, data, 'KIE_PROVIDER_FAILED');
            const e = new Error(norm.message);
            e.code = norm.code;
            e.status = apiCode;
            throw e;
        }

        const providerTaskId = data && data.data && (data.data.taskId || data.data.task_id);
        if (!providerTaskId) {
            const e = new Error('KIE_PROVIDER_FAILED: Response createTask của Kie.ai không chứa taskId.');
            e.code = 'KIE_PROVIDER_FAILED';
            throw e;
        }

        return {
            providerTaskId: String(providerTaskId),
            providerStatus: 'submitted',
            raw: data
        };
    }

    /** GET /api/v1/jobs/recordInfo — chỉ đọc, không tiêu credit. */
    async poll(providerTaskId, { signal, fetchFn } = {}) {
        if (signal && signal.aborted) throw new Error('Cancelled');

        if (!providerTaskId) {
            const err = new Error('PROVIDER_TASK_NOT_FOUND: Thiếu providerTaskId để poll.');
            err.code = 'PROVIDER_TASK_NOT_FOUND';
            throw err;
        }
        this._requireApiKey();

        const fetcher = this._getFetch({ fetchFn });
        const endpoint = `${this.baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(providerTaskId)}`;

        let res;
        try {
            res = await fetcher(endpoint, {
                method: 'GET',
                headers: { Authorization: `Bearer ${this.apiKey}` },
                signal
            });
        } catch (err) {
            if (err && err.name === 'AbortError') throw new Error('Cancelled');
            if (err && err.code === 'LIVE_TEST_DISABLED') throw err;
            const e = new Error(`KIE_PROVIDER_FAILED: Lỗi kết nối khi kiểm tra task Kie.ai: ${err.message}`);
            e.code = 'KIE_PROVIDER_FAILED';
            throw e;
        }

        const payload = await this._readJson(res, 'KIE_PROVIDER_FAILED');
        const apiCode = payload && typeof payload.code === 'number' ? payload.code : res.status;

        if (!res.ok || apiCode !== 200) {
            const norm = normalizeKieHttpError(apiCode, payload, 'KIE_PROVIDER_FAILED');
            const e = new Error(norm.message);
            e.code = norm.code;
            e.status = apiCode;
            throw e;
        }

        const data = (payload && payload.data) || {};
        const state = String(data.state || '').toLowerCase();
        const billing = {
            creditsConsumed: Number.isFinite(Number(data.creditsConsumed)) ? Number(data.creditsConsumed) : null,
            costTimeMs: Number.isFinite(Number(data.costTime)) ? Number(data.costTime) : null
        };

        if (state === 'waiting' || state === 'queuing') {
            return { providerStatus: 'queued', stage: 'Queued', progress: 25, billing, raw: payload };
        }

        if (state === 'generating') {
            const p = Number(data.progress);
            return {
                providerStatus: 'running',
                stage: 'Generating',
                progress: Number.isFinite(p) && p > 0 && p <= 100 ? p : 60,
                billing,
                raw: payload
            };
        }

        if (state === 'success') {
            const outputUrl = this.extractResultUrl(data);
            if (!outputUrl) {
                const e = new Error('KIE_RESULT_MISSING: Kie.ai báo thành công nhưng không trả về URL video kết quả.');
                e.code = 'KIE_RESULT_MISSING';
                throw e;
            }
            return { providerStatus: 'succeeded', stage: 'Downloading', progress: 95, outputUrl, billing, raw: payload };
        }

        if (state === 'fail') {
            const norm = normalizeKieFailure(data.failCode, data.failMsg);
            return { providerStatus: 'failed', stage: 'Generating', progress: 0, error: norm, billing, raw: payload };
        }

        return { providerStatus: state || 'unknown', stage: 'Processing', progress: 30, billing, raw: payload };
    }

    /** resultJson là CHUỖI JSON: {"resultUrls":["https://..."]}. */
    extractResultUrl(data) {
        if (!data) return null;
        let parsed = data.resultJson;
        if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch (_) { parsed = null; }
        }
        const urls = (parsed && (parsed.resultUrls || parsed.result_urls)) || data.resultUrls;
        if (Array.isArray(urls) && urls.length) return urls[0];
        if (parsed && typeof parsed.resultUrl === 'string') return parsed.resultUrl;
        return null;
    }

    /** Chờ hoàn thành có timeout và huỷ an toàn. */
    async waitForCompletion(providerTaskId, {
        signal,
        pollIntervalMs = this.pollIntervalMs,
        timeoutMs = this.pollTimeoutMs,
        onProgress,
        fetchFn
    } = {}) {
        if (signal && signal.aborted) throw new Error('Cancelled');
        const startTime = Date.now();

        while (true) {
            if (signal && signal.aborted) throw new Error('Cancelled');

            if (Date.now() - startTime > timeoutMs) {
                const e = new Error(`KIE_POLL_TIMEOUT: Quá thời gian chờ (${Math.round(timeoutMs / 1000)}s) cho task ${providerTaskId} trên Kie.ai.`);
                e.code = 'KIE_POLL_TIMEOUT';
                throw e;
            }

            const res = await this.poll(providerTaskId, { signal, fetchFn });
            if (typeof onProgress === 'function') onProgress(res);

            if (res.providerStatus === 'succeeded') return res;

            if (res.providerStatus === 'failed') {
                const e = new Error(res.error?.message || 'Kie.ai sinh video thất bại.');
                e.code = res.error?.code || 'KIE_PROVIDER_FAILED';
                e.providerStatus = 'failed';
                throw e;
            }

            await new Promise((resolve, reject) => {
                const timer = setTimeout(resolve, pollIntervalMs);
                if (signal) {
                    signal.addEventListener('abort', () => {
                        clearTimeout(timer);
                        reject(new Error('Cancelled'));
                    }, { once: true });
                }
            });
        }
    }

    /** Nối lại job cũ sau restart — CHỈ poll bằng GET, KHÔNG BAO GIỜ submit lại. */
    async resume(providerTaskId, opts = {}) {
        return this.waitForCompletion(providerTaskId, opts);
    }

    /** Tải MP4 kết quả về đĩa. Thất bại ở đây KHÔNG làm mất providerTaskId. */
    async download(providerTaskIdOrUrl, destPath, { outputUrl, fetchFn, signal } = {}) {
        if (signal && signal.aborted) throw new Error('Cancelled');

        let targetUrl = outputUrl;
        if (!targetUrl) {
            if (typeof providerTaskIdOrUrl === 'string' && /^https?:\/\//.test(providerTaskIdOrUrl)) {
                targetUrl = providerTaskIdOrUrl;
            } else if (providerTaskIdOrUrl) {
                const pollRes = await this.poll(providerTaskIdOrUrl, { signal, fetchFn });
                targetUrl = pollRes.outputUrl;
            }
        }

        if (!targetUrl) {
            const e = new Error(`KIE_RESULT_MISSING: Không tìm thấy URL video kết quả cho task ${providerTaskIdOrUrl}.`);
            e.code = 'KIE_RESULT_MISSING';
            throw e;
        }

        ensureDir(path.dirname(destPath));

        const fetcher = this._getFetch({ fetchFn });
        let res;
        try {
            res = await fetcher(targetUrl, { signal });
        } catch (err) {
            if (err && err.name === 'AbortError') throw new Error('Cancelled');
            const e = new Error(`KIE_DOWNLOAD_FAILED: Lỗi kết nối khi tải video kết quả: ${err.message}`);
            e.code = 'KIE_DOWNLOAD_FAILED';
            throw e;
        }

        if (!res.ok) {
            const e = new Error(`KIE_DOWNLOAD_FAILED: Tải video thất bại (HTTP ${res.status}).`);
            e.code = 'KIE_DOWNLOAD_FAILED';
            e.status = res.status;
            throw e;
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length === 0) {
            const e = new Error('KIE_DOWNLOAD_FAILED: File video tải về rỗng (0 bytes).');
            e.code = 'KIE_DOWNLOAD_FAILED';
            throw e;
        }

        fs.writeFileSync(destPath, buffer);
        return { localPath: destPath, bytes: buffer.length };
    }

    /**
     * GET /api/v1/chat/credit — số dư credit còn lại.
     * CHỈ dùng ở backend; không bao giờ trả API key ra ngoài.
     */
    async getRemainingCredits({ fetchFn, signal } = {}) {
        this._requireApiKey();
        const fetcher = this._getFetch({ fetchFn });

        let res;
        try {
            res = await fetcher(`${this.baseUrl}/api/v1/chat/credit`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${this.apiKey}` },
                signal
            });
        } catch (err) {
            if (err && err.code === 'LIVE_TEST_DISABLED') throw err;
            const e = new Error(`KIE_PROVIDER_FAILED: Không đọc được số dư credit: ${err.message}`);
            e.code = 'KIE_PROVIDER_FAILED';
            throw e;
        }

        const payload = await this._readJson(res, 'KIE_PROVIDER_FAILED');
        const apiCode = payload && typeof payload.code === 'number' ? payload.code : res.status;
        if (!res.ok || apiCode !== 200) {
            const norm = normalizeKieHttpError(apiCode, payload, 'KIE_PROVIDER_FAILED');
            const e = new Error(norm.message);
            e.code = norm.code;
            throw e;
        }
        return Number(payload.data);
    }
}

export default KieSeedanceProvider;
