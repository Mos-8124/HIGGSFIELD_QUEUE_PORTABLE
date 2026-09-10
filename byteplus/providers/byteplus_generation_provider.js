/**
 * byteplus/providers/byteplus_generation_provider.js
 *
 * Real Generation Provider cho ByteDance Seedance 1.5 Pro (ModelArk).
 * Model ID: seedance-1-5-pro-251215
 *
 * Hợp đồng giống hệt MockSeedanceProvider:
 *   submit()            -> { providerTaskId, providerStatus: 'submitted' }
 *   poll()              -> { providerStatus, stage, progress, outputUrl, error }
 *   waitForCompletion() -> trả kết quả hoàn thành hoặc ném lỗi
 *   resume()            -> chỉ poll job cũ, TUYỆT ĐỐI không gọi POST
 *   download()          -> tải MP4 về ổ đĩa cục bộ
 *
 * An toàn & Bảo vệ Credit:
 *  - Không bao giờ gọi mạng khi chưa có API Key hoặc Endpoint ID.
 *  - Chặn request ra ngoài nếu ALLOW_LIVE_BYTEPLUS_TESTS=false (trừ khi có mock fetchFn).
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
        // Dải IP nội bộ RFC 1918 & link-local
        if (/^10\./.test(host)) return false;
        if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
        if (/^192\.168\./.test(host)) return false;
        if (/^169\.254\./.test(host)) return false;
        return true;
    } catch {
        return false;
    }
}

/**
 * Chuẩn hóa prompt duration:
 * Thêm '--duration <sec>' (mặc định 4) và '--camerafixed false' nếu chưa có,
 * không bao giờ nhân bản/lặp lại cờ đã tồn tại.
 */
export function formatPromptText(task) {
    let text = (task && task.prompt ? String(task.prompt) : '').trim();
    const duration = (task && Number.isFinite(Number(task.duration))) ? Number(task.duration) : 4;

    const hasDuration = /--duration\s+\d+/i.test(text);
    if (!hasDuration) {
        text += ` --duration ${duration}`;
    }
    const hasCameraFixed = /--camerafixed\s+(true|false)/i.test(text);
    if (!hasCameraFixed) {
        text += ' --camerafixed false';
    }
    return text.trim();
}

/**
 * Tính toán URL endpoint /contents/generations/tasks
 */
export function getTasksEndpoint(baseUrl) {
    const base = (baseUrl || 'https://ark.ap-southeast.bytepluses.com').replace(/\/+$/, '');
    if (base.endsWith('/api/v3')) {
        return `${base}/contents/generations/tasks`;
    }
    return `${base}/api/v3/contents/generations/tasks`;
}

/**
 * Chuyển đổi file ảnh cục bộ thành Base64 Data URL để gửi trực tiếp lên BytePlus
 */
export function toBase64DataUrl(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
    const buf = fs.readFileSync(filePath);
    return `data:${mime};base64,${buf.toString('base64')}`;
}

export function isAccessibleImageUrl(urlStr, localPath) {
    if (localPath && fs.existsSync(localPath)) return true;
    if (!urlStr || typeof urlStr !== 'string') return false;
    if (urlStr.startsWith('data:image/')) return true;
    return isPublicHttpsUrl(urlStr);
}

export class BytePlusGenerationProvider {
    constructor({
        apiKey,
        endpointId,
        baseUrl,
        region,
        modelName,
        modelId,
        pollIntervalMs,
        pollTimeoutMs,
        allowLiveTests,
        fetchFn
    } = {}) {
        this.name = 'byteplus';
        this.apiKey = apiKey !== undefined ? apiKey : config.generation.apiKey;
        this.modelId = modelId !== undefined ? modelId : config.generation.modelId;
        this.endpointId = endpointId !== undefined ? endpointId : (config.generation.endpointId || this.modelId);
        this.baseUrl = baseUrl !== undefined ? baseUrl : config.generation.baseUrl;
        this.region = region !== undefined ? region : config.generation.region;
        this.modelName = modelName !== undefined ? modelName : config.generation.modelName;
        this.pollIntervalMs = pollIntervalMs !== undefined ? pollIntervalMs : config.generation.pollIntervalMs;
        this.pollTimeoutMs = pollTimeoutMs !== undefined ? pollTimeoutMs : config.generation.pollTimeoutMs;
        this.allowLiveTests = allowLiveTests !== undefined ? allowLiveTests : config.generation.allowLiveTests;
        this.fetchFn = fetchFn || null;
    }

    get model() {
        return this.endpointId || this.modelId;
    }

    isConfigured() {
        return Boolean(this.apiKey && this.endpointId);
    }

    /**
     * Tiền kiểm tra trước khi gửi request (không tốn lời gọi mạng nào).
     */
    validatePreflight(task) {
        if (!this.apiKey) {
            const err = new Error('BYTEPLUS_API_KEY_MISSING: Chưa cấu hình BYTEPLUS_MODELARK_API_KEY. Vui lòng cấu hình trong file .env.');
            err.code = 'BYTEPLUS_API_KEY_MISSING';
            throw err;
        }

        if (!this.endpointId) {
            const err = new Error('BYTEPLUS_ENDPOINT_ID_MISSING: Chưa cấu hình BYTEPLUS_ENDPOINT_ID (Endpoint ID dạng ep-xxx). Vui lòng tạo Endpoint trên BytePlus ModelArk Console hoặc cấu hình model.');
            err.code = 'BYTEPLUS_ENDPOINT_ID_MISSING';
            throw err;
        }

        const refs = Array.isArray(task && task.references) ? task.references : [];

        // Kiểm tra video: Seedance 1.5 Pro không hỗ trợ video tham chiếu
        for (const ref of refs) {
            if (ref.type === 'video') {
                const err = new Error('BYTEPLUS_SEEDANCE_1_5_VIDEO_REFERENCE_UNSUPPORTED: Model Seedance 1.5 Pro (seedance-1-5-pro-251215) không hỗ trợ video tham chiếu.');
                err.code = 'BYTEPLUS_SEEDANCE_1_5_VIDEO_REFERENCE_UNSUPPORTED';
                throw err;
            }
        }

        // Kiểm tra KOL: yêu cầu LAS Asset Library phải được bật
        for (const ref of refs) {
            if (ref.type === 'kol') {
                if (!config.las.enabled || !config.las.apiKey) {
                    const err = new Error('BYTEPLUS_KOL_LAS_UNSUPPORTED: Tham chiếu KOL yêu cầu LAS Asset Library nhưng chưa được bật/cấu hình (BYTEPLUS_LAS_API_KEY, BYTEPLUS_LAS_ASSET_ENABLED).');
                    err.code = 'BYTEPLUS_KOL_LAS_UNSUPPORTED';
                    throw err;
                }
            }
        }

        // Kiểm tra ảnh: bắt buộc phải có file cục bộ hoặc là HTTPS URL công khai
        for (const ref of refs) {
            if (ref.type === 'image') {
                const imgUrl = ref.remoteUrl || ref.url || ref.previewUrl;
                if (!isAccessibleImageUrl(imgUrl, ref.localPath)) {
                    const err = new Error(`BYTEPLUS_IMAGE_REQUIRES_ACCESSIBLE_URL: Seedance 1.5 Pro yêu cầu ảnh tham chiếu phải có file cục bộ hoặc là HTTPS URL công khai có thể truy cập từ internet. Nhận được: ${imgUrl || 'không có URL'}`);
                    err.code = 'BYTEPLUS_IMAGE_REQUIRES_ACCESSIBLE_URL';
                    throw err;
                }
            }
        }
    }

    _getFetch(opts) {
        const fn = (opts && opts.fetchFn) || this.fetchFn;
        if (fn) return fn;
        const liveAllowed = (opts && opts.allowLiveTests !== undefined)
            ? opts.allowLiveTests
            : (this.allowLiveTests !== undefined ? this.allowLiveTests : config.generation.allowLiveTests);
        if (!liveAllowed) {
            const err = new Error('LIVE_TEST_DISABLED: ALLOW_LIVE_BYTEPLUS_TESTS đang là false. Hệ thống chặn request ra mạng thật đến BytePlus để bảo vệ credit.');
            err.code = 'LIVE_TEST_DISABLED';
            throw err;
        }
        return globalThis.fetch;
    }

    /**
     * Gửi task tạo video lên BytePlus ModelArk
     */
    async submit(task, { signal, fetchFn } = {}) {
        if (signal && signal.aborted) throw new Error('Cancelled');

        this.validatePreflight(task);

        const fetcher = this._getFetch({ fetchFn });
        const endpoint = getTasksEndpoint(this.baseUrl);

        const formattedPrompt = formatPromptText(task);
        const content = [
            {
                type: 'text',
                text: formattedPrompt
            }
        ];

        const refs = Array.isArray(task && task.references) ? task.references : [];
        const imageRef = refs.find(r => r.type === 'image');
        if (imageRef) {
            let imgUrl = imageRef.remoteUrl || imageRef.url;
            if ((!imgUrl || !isPublicHttpsUrl(imgUrl)) && imageRef.localPath && fs.existsSync(imageRef.localPath)) {
                imgUrl = toBase64DataUrl(imageRef.localPath);
            } else if (!imgUrl && imageRef.previewUrl && isPublicHttpsUrl(imageRef.previewUrl)) {
                imgUrl = imageRef.previewUrl;
            }
            if (imgUrl) {
                content.push({
                    type: 'image_url',
                    image_url: {
                        url: imgUrl
                    }
                });
            }
        }

        const body = {
            model: this.endpointId,
            content
        };

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
            const submitErr = new Error('PROVIDER_SUBMIT_FAILED: Lỗi kết nối tới BytePlus ModelArk: ' + err.message);
            submitErr.code = 'PROVIDER_SUBMIT_FAILED';
            submitErr.cause = err;
            throw submitErr;
        }

        let resData;
        try {
            resData = await res.json();
        } catch (_) {
            const submitErr = new Error(`PROVIDER_SUBMIT_FAILED: BytePlus trả về dữ liệu không phải JSON (HTTP ${res.status})`);
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

        const providerTaskId = resData.id || (resData.data && resData.data.id) || resData.task_id;
        if (!providerTaskId) {
            const submitErr = new Error('PROVIDER_SUBMIT_FAILED: Response từ BytePlus không chứa task id: ' + JSON.stringify(resData));
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
     * Thăm dò trạng thái task trên BytePlus ModelArk
     */
    async poll(providerTaskId, { signal, fetchFn } = {}) {
        if (signal && signal.aborted) throw new Error('Cancelled');

        if (!providerTaskId) {
            const err = new Error('PROVIDER_TASK_NOT_FOUND: Thiếu providerTaskId để poll.');
            err.code = 'PROVIDER_TASK_NOT_FOUND';
            throw err;
        }

        if (!this.apiKey) {
            const err = new Error('BYTEPLUS_API_KEY_MISSING: Chưa cấu hình BYTEPLUS_MODELARK_API_KEY.');
            err.code = 'BYTEPLUS_API_KEY_MISSING';
            throw err;
        }

        const fetcher = this._getFetch({ fetchFn });
        const endpoint = `${getTasksEndpoint(this.baseUrl)}/${encodeURIComponent(providerTaskId)}`;

        const headers = {
            'Content-Type': 'application/json',
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
            const pollErr = new Error('PROVIDER_POLL_FAILED: Lỗi kết nối khi kiểm tra task: ' + err.message);
            pollErr.code = 'PROVIDER_POLL_FAILED';
            throw pollErr;
        }

        let resData;
        try {
            resData = await res.json();
        } catch (_) {
            const pollErr = new Error(`PROVIDER_POLL_FAILED: Dữ liệu poll không phải JSON (HTTP ${res.status})`);
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
        const rawStatus = String(data.status || '').toLowerCase();

        if (rawStatus === 'queued' || rawStatus === 'pending') {
            return {
                providerStatus: 'queued',
                stage: 'Queued',
                progress: 25,
                raw: resData
            };
        }

        if (rawStatus === 'running' || rawStatus === 'processing') {
            return {
                providerStatus: 'running',
                stage: 'Generating',
                progress: 60,
                raw: resData
            };
        }

        if (rawStatus === 'succeeded' || rawStatus === 'completed' || rawStatus === 'done') {
            const outputUrl =
                data.content?.video_url ||
                (Array.isArray(data.content) && data.content[0]?.video_url?.url) ||
                data.output_url ||
                data.result?.video_url ||
                data.video_url ||
                (resData.data && (resData.data.output_url || resData.data.video_url)) ||
                null;

            return {
                providerStatus: 'succeeded',
                stage: 'Downloading',
                progress: 95,
                outputUrl,
                raw: resData
            };
        }

        if (rawStatus === 'failed' || rawStatus === 'error' || rawStatus === 'cancelled') {
            const errObj = data.error || resData.error || {};
            const code = errObj.code || data.code || 'GENERATION_FAILED';
            const message = errObj.message || data.message || resData.message || 'Job sinh video thất bại trên BytePlus';
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
     * Chờ task hoàn tất bằng cách poll định kỳ
     */
    async waitForCompletion(providerTaskId, { onProgress, signal, fetchFn, pollIntervalMs, pollTimeoutMs } = {}) {
        const emit = onProgress || function () {};
        const interval = pollIntervalMs !== undefined ? pollIntervalMs : this.pollIntervalMs;
        const timeout = pollTimeoutMs !== undefined ? pollTimeoutMs : this.pollTimeoutMs;
        const start = Date.now();

        for (;;) {
            if (signal && signal.aborted) throw new Error('Cancelled');

            if (Date.now() - start > timeout) {
                const err = new Error(`PROVIDER_POLL_TIMEOUT: Quá thời gian chờ hoàn tất sinh video (${Math.round(timeout / 1000)}s).`);
                err.code = 'PROVIDER_POLL_TIMEOUT';
                throw err;
            }

            const res = await this.poll(providerTaskId, { signal, fetchFn });
            emit(res);

            if (res.providerStatus === 'succeeded') {
                return res;
            }

            if (res.providerStatus === 'failed') {
                const err = new Error((res.error && res.error.message) || 'Job thất bại trên BytePlus');
                err.code = (res.error && res.error.code) || 'PROVIDER_FAILED';
                throw err;
            }

            await new Promise((resolve, reject) => {
                const timer = setTimeout(resolve, interval);
                if (signal) {
                    const onAbort = () => {
                        clearTimeout(timer);
                        signal.removeEventListener('abort', onAbort);
                        reject(new Error('Cancelled'));
                    };
                    signal.addEventListener('abort', onAbort, { once: true });
                }
            });
        }
    }

    /**
     * Nối lại job cũ sau restart — CHỈ poll, KHÔNG submit
     */
    async resume(providerTaskId, opts = {}) {
        return this.waitForCompletion(providerTaskId, opts);
    }

    /**
     * Tải kết quả MP4 về ổ đĩa cục bộ
     */
    async download(providerTaskId, destPath, { outputUrl, fetchFn, signal } = {}) {
        if (signal && signal.aborted) throw new Error('Cancelled');

        let targetUrl = outputUrl;
        if (!targetUrl) {
            const pollRes = await this.poll(providerTaskId, { signal, fetchFn });
            targetUrl = pollRes.outputUrl;
        }

        if (!targetUrl) {
            const err = new Error(`PROVIDER_DOWNLOAD_FAILED: Không tìm thấy outputUrl cho task ${providerTaskId}.`);
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

export default BytePlusGenerationProvider;

