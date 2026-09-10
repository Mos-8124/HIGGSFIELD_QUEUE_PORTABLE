/**
 * byteplus/providers/openrouter_seedance_provider.js
 *
 * Real Generation Provider cho ByteDance Seedance 2.5 qua OpenRouter API.
 * Endpoint: POST https://openrouter.ai/api/v1/videos
 * Model: bytedance/seedance-2.5
 *
 * Hợp đồng giống hệt BytePlusGenerationProvider và MockSeedanceProvider:
 *   submit()            -> { providerTaskId, providerStatus: 'submitted' }
 *   poll()              -> { providerStatus, stage, progress, outputUrl, error }
 *   waitForCompletion() -> lặp poll cho đến khi hoàn thành hoặc ném lỗi
 *   resume()            -> chỉ poll job cũ bằng GET, TUYỆT ĐỐI không submit lại
 *   download()          -> tải MP4 về ổ đĩa cục bộ
 *
 * An toàn & Bảo vệ Credit:
 *  - Không bao giờ gọi mạng khi chưa có API Key.
 *  - Không bao giờ để lộ OPENROUTER_API_KEY trong logs hay error messages.
 *  - Chặn request ra ngoài nếu đang chạy trong môi trường test (trừ khi có mock fetchFn).
 *  - Chống sinh trùng: nếu task đã có providerTaskId, chỉ resume/poll, không bao giờ submit lại.
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { ensureDir } from '../store.js';

/**
 * Kiểm tra xem URL có phải là HTTPS công khai hợp lệ từ internet hay không.
 * Chặn localhost, 127.0.0.1, LAN IP (10.*, 172.16-31.*, 192.168.*), file://, v.v.
 */
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

export class OpenRouterSeedanceProvider {
    constructor({
        apiKey = config.openrouter?.apiKey,
        baseUrl = config.openrouter?.baseUrl,
        model = config.openrouter?.model,
        pollIntervalMs = config.openrouter?.pollIntervalMs,
        pollTimeoutMs = config.openrouter?.pollTimeoutMs,
        allowLiveTests = config.openrouter?.allowLiveTests,
        fetchFn
    } = {}) {
        this.name = 'openrouter';
        this.apiKey = apiKey || '';
        this.baseUrl = (baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
        this.model = model || 'bytedance/seedance-2.5';
        this.pollIntervalMs = Number.isFinite(pollIntervalMs) ? pollIntervalMs : 5000;
        this.pollTimeoutMs = Number.isFinite(pollTimeoutMs) ? pollTimeoutMs : 900000;
        this.allowLiveTests = allowLiveTests;
        this.fetchFn = fetchFn;
    }

    isConfigured() {
        return Boolean(this.apiKey && this.apiKey.trim().length > 0);
    }

    /**
     * Kiểm tra điều kiện tiên quyết trước khi submit:
     * 1. Phải có OPENROUTER_API_KEY.
     * 2. Nếu có ảnh tham chiếu: phải có URL HTTPS hợp lệ từ TOS.
     * 3. Nếu có video tham chiếu: phải có URL HTTPS hợp lệ từ TOS.
     */
    validatePreflight(task) {
        if (!this.apiKey || !this.apiKey.trim()) {
            const err = new Error('OPENROUTER_API_KEY_MISSING: Chưa cấu hình OPENROUTER_API_KEY trong file .env.');
            err.code = 'OPENROUTER_API_KEY_MISSING';
            throw err;
        }

        const refs = Array.isArray(task && task.references) ? task.references : [];

        for (const ref of refs) {
            if (ref.type === 'image') {
                const imgUrl = ref.remoteUrl || ref.url;
                if (!imgUrl || !isPublicHttpsUrl(imgUrl)) {
                    const err = new Error(`OPENROUTER_IMAGE_REFERENCE_UNAVAILABLE: Ảnh tham chiếu "${ref.originalName || ref.id}" không có URL HTTPS công khai hợp lệ từ TOS.`);
                    err.code = 'OPENROUTER_IMAGE_REFERENCE_UNAVAILABLE';
                    throw err;
                }
            }
            if (ref.type === 'video') {
                const vidUrl = ref.remoteUrl || ref.url;
                if (!vidUrl || !isPublicHttpsUrl(vidUrl)) {
                    const err = new Error(`OPENROUTER_VIDEO_REFERENCE_UNAVAILABLE: Video tham chiếu "${ref.originalName || ref.id}" không có URL HTTPS công khai hợp lệ từ TOS.`);
                    err.code = 'OPENROUTER_VIDEO_REFERENCE_UNAVAILABLE';
                    throw err;
                }
            }
        }
    }

    /**
     * Map dữ liệu task nội bộ sang cấu trúc request JSON của OpenRouter Video API
     */
    buildRequestBody(task) {
        const body = {
            model: this.model,
            prompt: (task && task.prompt ? String(task.prompt) : '').trim()
        };

        if (task && Number.isFinite(Number(task.duration))) {
            body.duration = Number(task.duration);
        }
        if (task && task.aspectRatio) {
            body.aspect_ratio = task.aspectRatio;
        }
        if (task && task.resolution) {
            body.resolution = task.resolution;
        }

        const refs = Array.isArray(task && task.references) ? task.references : [];
        const inputReferences = [];

        for (const ref of refs) {
            if (ref.type === 'image') {
                const url = ref.remoteUrl || ref.url;
                if (!url) {
                    const err = new Error('OPENROUTER_IMAGE_REFERENCE_UNAVAILABLE: Ảnh tham chiếu thiếu URL từ TOS.');
                    err.code = 'OPENROUTER_IMAGE_REFERENCE_UNAVAILABLE';
                    throw err;
                }
                inputReferences.push({
                    type: 'image_url',
                    image_url: { url }
                });
            } else if (ref.type === 'video') {
                const url = ref.remoteUrl || ref.url;
                if (!url) {
                    const err = new Error('OPENROUTER_VIDEO_REFERENCE_UNAVAILABLE: Video tham chiếu thiếu URL từ TOS.');
                    err.code = 'OPENROUTER_VIDEO_REFERENCE_UNAVAILABLE';
                    throw err;
                }
                inputReferences.push({
                    type: 'video_url',
                    video_url: { url }
                });
            }
        }

        if (inputReferences.length > 0) {
            body.input_references = inputReferences;
        }

        return body;
    }

    _getFetch(opts) {
        const fn = (opts && opts.fetchFn) || this.fetchFn;
        if (fn) return fn;

        const isTest = process.env.NODE_ENV === 'test' ||
                       process.env.npm_lifecycle_event === 'test' ||
                       process.argv.some(a => a.includes('test'));

        const liveAllowed = (opts && opts.allowLiveTests !== undefined)
            ? opts.allowLiveTests
            : (this.allowLiveTests !== undefined ? this.allowLiveTests : (config.openrouter?.allowLiveTests ?? !isTest));

        if (!liveAllowed || isTest) {
            const err = new Error('LIVE_TEST_DISABLED: Hệ thống chặn request ra mạng thật đến OpenRouter trong môi trường test để bảo vệ credit.');
            err.code = 'LIVE_TEST_DISABLED';
            throw err;
        }

        return globalThis.fetch;
    }

    /**
     * Gửi task tạo video lên OpenRouter (POST https://openrouter.ai/api/v1/videos)
     */
    async submit(task, { signal, fetchFn } = {}) {
        if (signal && signal.aborted) throw new Error('Cancelled');

        this.validatePreflight(task);

        const fetcher = this._getFetch({ fetchFn });
        const endpoint = `${this.baseUrl}/videos`;
        const body = this.buildRequestBody(task);

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
        };

        let res;
        try {
            res = await fetcher(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal
            });
        } catch (err) {
            if (err && err.name === 'AbortError') throw new Error('Cancelled');
            if (err && err.code === 'LIVE_TEST_DISABLED') throw err;
            const submitErr = new Error('PROVIDER_SUBMIT_FAILED: Lỗi kết nối tới OpenRouter: ' + err.message);
            submitErr.code = 'PROVIDER_SUBMIT_FAILED';
            submitErr.cause = err;
            throw submitErr;
        }

        let resData;
        try {
            resData = await res.json();
        } catch (_) {
            const submitErr = new Error(`PROVIDER_SUBMIT_FAILED: OpenRouter trả về dữ liệu không phải JSON (HTTP ${res.status})`);
            submitErr.code = 'PROVIDER_SUBMIT_FAILED';
            throw submitErr;
        }

        if (!res.ok) {
            const msg = (resData && (resData.error?.message || resData.message)) || `HTTP ${res.status}`;
            const code = (resData && (resData.error?.code || resData.code)) || 'PROVIDER_SUBMIT_FAILED';
            const submitErr = new Error(`PROVIDER_SUBMIT_FAILED: ${msg}`);
            submitErr.code = code;
            submitErr.status = res.status;
            submitErr.response = resData;
            throw submitErr;
        }

        const providerTaskId = resData.id || (resData.data && resData.data.id) || resData.job_id || resData.task_id;
        if (!providerTaskId) {
            const submitErr = new Error('PROVIDER_SUBMIT_FAILED: Response từ OpenRouter không chứa task id: ' + JSON.stringify(resData));
            submitErr.code = 'PROVIDER_SUBMIT_FAILED';
            throw submitErr;
        }

        return {
            providerTaskId: String(providerTaskId),
            providerStatus: 'submitted',
            raw: resData
        };
    }

    /**
     * Thăm dò trạng thái task trên OpenRouter (GET https://openrouter.ai/api/v1/videos/:id)
     */
    async poll(providerTaskId, { signal, fetchFn } = {}) {
        if (signal && signal.aborted) throw new Error('Cancelled');

        if (!providerTaskId) {
            const err = new Error('PROVIDER_TASK_NOT_FOUND: Thiếu providerTaskId để poll.');
            err.code = 'PROVIDER_TASK_NOT_FOUND';
            throw err;
        }

        if (!this.apiKey || !this.apiKey.trim()) {
            const err = new Error('OPENROUTER_API_KEY_MISSING: Chưa cấu hình OPENROUTER_API_KEY.');
            err.code = 'OPENROUTER_API_KEY_MISSING';
            throw err;
        }

        const fetcher = this._getFetch({ fetchFn });
        const endpoint = `${this.baseUrl}/videos/${encodeURIComponent(providerTaskId)}`;

        const headers = {
            'Authorization': `Bearer ${this.apiKey}`
        };

        let res;
        try {
            res = await fetcher(endpoint, {
                method: 'GET',
                headers,
                signal
            });
        } catch (err) {
            if (err && err.name === 'AbortError') throw new Error('Cancelled');
            if (err && err.code === 'LIVE_TEST_DISABLED') throw err;
            const pollErr = new Error('PROVIDER_POLL_FAILED: Lỗi kết nối khi kiểm tra task OpenRouter: ' + err.message);
            pollErr.code = 'PROVIDER_POLL_FAILED';
            throw pollErr;
        }

        let resData;
        try {
            resData = await res.json();
        } catch (_) {
            const pollErr = new Error(`PROVIDER_POLL_FAILED: Dữ liệu poll OpenRouter không phải JSON (HTTP ${res.status})`);
            pollErr.code = 'PROVIDER_POLL_FAILED';
            throw pollErr;
        }

        if (!res.ok) {
            const msg = (resData && (resData.error?.message || resData.message)) || `HTTP ${res.status}`;
            const code = (resData && (resData.error?.code || resData.code)) || 'PROVIDER_POLL_FAILED';
            const pollErr = new Error(`PROVIDER_POLL_FAILED: ${msg}`);
            pollErr.code = code;
            pollErr.status = res.status;
            throw pollErr;
        }

        const data = resData.data || resData;
        const rawStatus = String(data.status || resData.status || '').toLowerCase();

        if (rawStatus === 'queued' || rawStatus === 'pending') {
            return {
                providerStatus: 'queued',
                stage: 'Queued',
                progress: 25,
                raw: resData
            };
        }

        if (rawStatus === 'running' || rawStatus === 'in_progress' || rawStatus === 'processing' || rawStatus === 'generating') {
            return {
                providerStatus: 'running',
                stage: 'Generating',
                progress: typeof data.progress === 'number' ? data.progress : 60,
                raw: resData
            };
        }

        if (rawStatus === 'succeeded' || rawStatus === 'completed' || rawStatus === 'done') {
            const outputUrl =
                data.output_url ||
                data.video_url ||
                (Array.isArray(data.unsigned_urls) && data.unsigned_urls[0]) ||
                (Array.isArray(data.video_urls) && data.video_urls[0]) ||
                data.result?.video_url ||
                data.content?.video_url ||
                data.video?.url ||
                (Array.isArray(data.artifacts) && data.artifacts[0]?.url) ||
                data.url ||
                null;

            return {
                providerStatus: 'succeeded',
                stage: 'Downloading',
                progress: 95,
                outputUrl,
                raw: resData
            };
        }

        if (rawStatus === 'failed' || rawStatus === 'error' || rawStatus === 'cancelled' || rawStatus === 'expired') {
            const errObj = data.error || resData.error || {};
            const code = errObj.code || data.code || 'GENERATION_FAILED';
            const message = errObj.message || data.message || resData.message || 'Job sinh video thất bại trên OpenRouter';
            return {
                providerStatus: 'failed',
                stage: 'Generating',
                progress: 0,
                error: { code, message },
                raw: resData
            };
        }

        return {
            providerStatus: rawStatus || 'unknown',
            stage: 'Processing',
            progress: 30,
            raw: resData
        };
    }

    /**
     * Chờ task hoàn thành qua cơ chế polling có timeout và hủy an toàn
     */
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
                const timeoutErr = new Error(`PROVIDER_TIMEOUT: Quá thời gian chờ (${Math.round(timeoutMs / 1000)}s) cho task ${providerTaskId} trên OpenRouter.`);
                timeoutErr.code = 'PROVIDER_TIMEOUT';
                throw timeoutErr;
            }

            const res = await this.poll(providerTaskId, { signal, fetchFn });

            if (typeof onProgress === 'function') {
                onProgress(res);
            }

            if (res.providerStatus === 'succeeded') {
                return res;
            }

            if (res.providerStatus === 'failed') {
                const err = new Error(res.error?.message || 'OpenRouter sinh video thất bại.');
                err.code = res.error?.code || 'GENERATION_FAILED';
                err.providerStatus = 'failed';
                throw err;
            }

            // Chờ một khoảng pollIntervalMs trước khi poll tiếp
            await new Promise((resolve, reject) => {
                const timer = setTimeout(resolve, pollIntervalMs);
                if (signal) {
                    const onAbort = () => {
                        clearTimeout(timer);
                        reject(new Error('Cancelled'));
                    };
                    signal.addEventListener('abort', onAbort, { once: true });
                }
            });
        }
    }

    /**
     * Nối lại job cũ sau restart — CHỈ poll bằng GET, KHÔNG BAO GIỜ submit lại
     */
    async resume(providerTaskId, opts = {}) {
        return this.waitForCompletion(providerTaskId, opts);
    }

    /**
     * Tải kết quả video MP4 về ổ đĩa cục bộ
     */
    async download(providerTaskIdOrUrl, destPath, { outputUrl, fetchFn, signal } = {}) {
        if (signal && signal.aborted) throw new Error('Cancelled');

        let targetUrl = outputUrl;
        if (!targetUrl) {
            if (typeof providerTaskIdOrUrl === 'string' && (providerTaskIdOrUrl.startsWith('http://') || providerTaskIdOrUrl.startsWith('https://'))) {
                targetUrl = providerTaskIdOrUrl;
            } else if (providerTaskIdOrUrl) {
                const pollRes = await this.poll(providerTaskIdOrUrl, { signal, fetchFn });
                targetUrl = pollRes.outputUrl;
            }
        }

        if (!targetUrl) {
            const err = new Error(`PROVIDER_DOWNLOAD_FAILED: Không tìm thấy outputUrl cho task ${providerTaskIdOrUrl}.`);
            err.code = 'PROVIDER_DOWNLOAD_FAILED';
            throw err;
        }

        ensureDir(path.dirname(destPath));

        const fetcher = this._getFetch({ fetchFn, allowLiveTests: true });
        let res;
        try {
            res = await fetcher(targetUrl, { signal });
        } catch (err) {
            if (err && err.name === 'AbortError') throw new Error('Cancelled');
            const dlErr = new Error(`PROVIDER_DOWNLOAD_FAILED: Lỗi kết nối khi tải video từ ${targetUrl}: ${err.message}`);
            dlErr.code = 'PROVIDER_DOWNLOAD_FAILED';
            throw dlErr;
        }

        if (!res.ok) {
            const dlErr = new Error(`PROVIDER_DOWNLOAD_FAILED: Tải video thất bại (HTTP ${res.status}) từ ${targetUrl}`);
            dlErr.code = 'PROVIDER_DOWNLOAD_FAILED';
            dlErr.status = res.status;
            throw dlErr;
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length === 0) {
            const dlErr = new Error('PROVIDER_DOWNLOAD_FAILED: File video tải về rỗng (0 bytes).');
            dlErr.code = 'PROVIDER_DOWNLOAD_FAILED';
            throw dlErr;
        }

        fs.writeFileSync(destPath, buffer);

        return {
            localPath: destPath,
            bytes: buffer.length
        };
    }
}

export default OpenRouterSeedanceProvider;
