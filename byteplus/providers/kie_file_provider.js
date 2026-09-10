/**
 * byteplus/providers/kie_file_provider.js
 *
 * Storage Provider cho Kie.ai File Upload API.
 * Thay thế hoàn toàn BytePlus TOS trong luồng active khi GTF_VIDEO_PROVIDER=kie.
 *
 * Endpoint (xác minh từ tài liệu chính thức docs.kie.ai/file-upload-api):
 *   POST {uploadBaseUrl}/api/file-stream-upload    multipart: file, uploadPath, fileName
 *
 * Response:
 *   { success, code, msg, data: { fileName, filePath, downloadUrl, fileSize, mimeType, uploadedAt } }
 *
 * KHÁC BIỆT QUAN TRỌNG SO VỚI TOS:
 *   TOS  — object nằm vĩnh viễn trên bucket, URL ký lại được bất cứ lúc nào (canResign = true).
 *   Kie  — file là TẠM THỜI, tự xoá sau TTL, KHÔNG ký lại được (canResign = false).
 *          Hết hạn thì phải upload lại từ file gốc cục bộ.
 *          Vì vậy file cục bộ luôn là nguồn sự thật, URL Kie chỉ là transport.
 *
 * Hợp đồng giữ nguyên như TosStorageProvider để ReferenceManager dùng lại không sửa:
 *   isConfigured()
 *   upload(localPath, opts) -> { storageProvider, remoteObjectKey, remoteUrl, expiresAt, bytes, mimeType }
 *
 * Bổ sung theo yêu cầu nghiệp vụ:
 *   uploadLocalFile / uploadImage / uploadVideo / uploadAudio -> metadata chuẩn hoá
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'];
const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];

/** Suy ra MIME type từ phần mở rộng file. */
export function guessMimeType(filePath) {
    const ext = path.extname(String(filePath || '')).toLowerCase();
    switch (ext) {
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.webp': return 'image/webp';
        case '.gif': return 'image/gif';
        case '.bmp': return 'image/bmp';
        case '.mp4': return 'video/mp4';
        case '.mov': return 'video/quicktime';
        case '.webm': return 'video/webm';
        case '.mkv': return 'video/x-matroska';
        case '.avi': return 'video/x-msvideo';
        case '.m4v': return 'video/x-m4v';
        case '.mp3': return 'audio/mpeg';
        case '.wav': return 'audio/wav';
        case '.m4a': return 'audio/mp4';
        case '.aac': return 'audio/aac';
        case '.ogg': return 'audio/ogg';
        case '.flac': return 'audio/flac';
        default: return 'application/octet-stream';
    }
}

/** Phân loại file thành image | video | audio để chọn uploadPath. */
export function classifyKind(filePath) {
    const ext = path.extname(String(filePath || '')).toLowerCase();
    if (IMAGE_EXT.includes(ext)) return 'image';
    if (VIDEO_EXT.includes(ext)) return 'video';
    if (AUDIO_EXT.includes(ext)) return 'audio';
    return 'file';
}

/**
 * URL tham chiếu đã hết hạn chưa.
 * Không có expiresAt thì coi như KHÔNG hết hạn (provider không khai báo TTL).
 */
export function isExpired(expiresAt, now = Date.now()) {
    if (!expiresAt) return false;
    const t = new Date(expiresAt).getTime();
    if (!Number.isFinite(t)) return false;
    return t <= now;
}

/** Chuẩn hoá lỗi HTTP của Kie thành mã lỗi nội bộ có nghĩa. */
export function normalizeKieHttpError(status, body, fallbackCode) {
    const msg = (body && (body.msg || body.message || body.error)) || `HTTP ${status}`;
    switch (Number(status)) {
        case 401:
            return { code: 'KIE_AUTH_FAILED', message: `KIE_AUTH_FAILED: KIE_API_KEY không hợp lệ hoặc đã bị thu hồi (${msg}).` };
        case 402:
            return { code: 'KIE_INSUFFICIENT_CREDITS', message: `KIE_INSUFFICIENT_CREDITS: Tài khoản Kie.ai không đủ credit (${msg}).` };
        case 422:
            return { code: 'KIE_INVALID_REQUEST', message: `KIE_INVALID_REQUEST: Tham số gửi lên Kie.ai không hợp lệ (${msg}).` };
        case 429:
            return { code: 'KIE_RATE_LIMITED', message: `KIE_RATE_LIMITED: Vượt giới hạn tần suất gọi Kie.ai (${msg}).` };
        case 451:
            return { code: 'KIE_CONTENT_REJECTED', message: `KIE_CONTENT_REJECTED: Nội dung bị Kie.ai từ chối (${msg}).` };
        default:
            return { code: fallbackCode || 'KIE_PROVIDER_FAILED', message: `${fallbackCode || 'KIE_PROVIDER_FAILED'}: ${msg}` };
    }
}

export class KieFileStorageProvider {
    constructor({
        apiKey,
        uploadBaseUrl,
        uploadPath = config.kie?.uploadPath,
        fileTtlHours = config.kie?.fileTtlHours,
        fetchFn
    } = {}) {
        this.name = 'kie';
        this._explicitApiKey = apiKey;
        this._explicitUploadBaseUrl = uploadBaseUrl;
        this.uploadPath = uploadPath || 'gtf-video-ai';
        this.fileTtlHours = Number.isFinite(fileTtlHours) ? fileTtlHours : 24;
        this.fetchFn = fetchFn;

        // ReferenceManager đọc các cờ này để biết cách tái sử dụng tham chiếu.
        this.canResign = false;            // Không ký lại được URL — hết hạn phải upload lại.
        this.usesTemporaryUrls = true;
        this.notConfiguredCode = 'KIE_UPLOAD_NOT_CONFIGURED';
        this.notConfiguredMessage =
            'KIE_UPLOAD_NOT_CONFIGURED: Chưa cấu hình KIE_API_KEY trong file .env nên không thể tải ảnh/video tham chiếu lên Kie.ai.';
    }

    get apiKey() {
        return this._explicitApiKey !== undefined ? this._explicitApiKey : (config.kie?.apiKey || process.env.KIE_API_KEY || '');
    }

    set apiKey(val) {
        this._explicitApiKey = val;
    }

    get uploadBaseUrl() {
        return (this._explicitUploadBaseUrl !== undefined ? this._explicitUploadBaseUrl : (config.kie?.uploadBaseUrl || 'https://kieai.redpandaai.co')).replace(/\/+$/, '');
    }

    set uploadBaseUrl(val) {
        this._explicitUploadBaseUrl = val;
    }

    isConfigured() {
        return Boolean(this.apiKey && this.apiKey.trim().length > 0);
    }

    /**
     * Chặn tuyệt đối cuộc gọi mạng thật trong môi trường test tự động.
     * Ngoài test: dùng fetch mặc định — người dùng CHỈ cần điền KIE_API_KEY,
     * không cần bật thêm bất kỳ cờ môi trường nào.
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

    _requireConfigured() {
        if (!this.isConfigured()) {
            const err = new Error(this.notConfiguredMessage);
            err.code = this.notConfiguredCode;
            throw err;
        }
    }

    /** Đường thư mục logic trên Kie theo loại file, ví dụ gtf-video-ai/images. */
    buildUploadPath(kind) {
        const folder = kind === 'image' ? 'images'
            : kind === 'video' ? 'videos'
            : kind === 'audio' ? 'audios'
            : 'files';
        return `${this.uploadPath}/${folder}`;
    }

    /**
     * Tải một file cục bộ lên Kie File Upload API.
     * Trả về metadata chuẩn hoá theo yêu cầu nghiệp vụ.
     */
    async uploadLocalFile(localPath, { kind, originalName, uploadPath, signal, fetchFn } = {}) {
        this._requireConfigured();

        if (!localPath || !fs.existsSync(localPath)) {
            const err = new Error(`KIE_UPLOAD_FAILED: Không tìm thấy file cục bộ để tải lên: ${localPath}`);
            err.code = 'KIE_UPLOAD_FAILED';
            throw err;
        }
        if (signal && signal.aborted) throw new Error('Cancelled');

        const resolvedKind = kind || classifyKind(localPath);
        const fileName = originalName || path.basename(localPath);
        const mimeType = guessMimeType(fileName);
        const buffer = fs.readFileSync(localPath);

        const form = new FormData();
        form.append('file', new Blob([buffer], { type: mimeType }), fileName);
        form.append('uploadPath', uploadPath || this.buildUploadPath(resolvedKind));
        form.append('fileName', fileName);

        const fetcher = this._getFetch({ fetchFn });
        const endpoint = `${this.uploadBaseUrl}/api/file-stream-upload`;

        let res;
        try {
            res = await fetcher(endpoint, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.apiKey}` },
                body: form,
                signal
            });
        } catch (err) {
            if (err && err.name === 'AbortError') throw new Error('Cancelled');
            if (err && err.code === 'LIVE_TEST_DISABLED') throw err;
            const upErr = new Error(`KIE_UPLOAD_FAILED: Lỗi kết nối khi tải file lên Kie.ai: ${err.message}`);
            upErr.code = 'KIE_UPLOAD_FAILED';
            upErr.cause = err;
            throw upErr;
        }

        let body;
        try {
            body = await res.json();
        } catch (_) {
            const upErr = new Error(`KIE_UPLOAD_FAILED: Kie.ai trả về dữ liệu không phải JSON (HTTP ${res.status}).`);
            upErr.code = 'KIE_UPLOAD_FAILED';
            throw upErr;
        }

        const apiCode = body && typeof body.code === 'number' ? body.code : res.status;
        if (!res.ok || apiCode !== 200 || body.success === false) {
            const norm = normalizeKieHttpError(apiCode, body, 'KIE_UPLOAD_FAILED');
            const upErr = new Error(norm.message);
            upErr.code = norm.code;
            upErr.status = apiCode;
            throw upErr;
        }

        const data = (body && body.data) || {};
        const remoteUrl = data.downloadUrl || data.fileUrl || data.url || null;
        if (!remoteUrl) {
            const upErr = new Error('KIE_UPLOAD_FAILED: Response upload của Kie.ai không chứa downloadUrl.');
            upErr.code = 'KIE_UPLOAD_FAILED';
            throw upErr;
        }

        const uploadedAt = data.uploadedAt || new Date().toISOString();
        const expiresAt = data.expiresAt || data.expireTime ||
            new Date(new Date(uploadedAt).getTime() + this.fileTtlHours * 3600 * 1000).toISOString();

        return {
            provider: 'kie',
            fileId: data.filePath || data.fileId || remoteUrl,
            remoteUrl,
            expiresAt,
            mimeType: data.mimeType || mimeType,
            originalName: data.fileName || fileName,
            bytes: Number.isFinite(Number(data.fileSize)) ? Number(data.fileSize) : buffer.length,
            uploadedAt,
            kind: resolvedKind
        };
    }

    async uploadImage(localPath, opts = {}) {
        return this.uploadLocalFile(localPath, { ...opts, kind: 'image' });
    }

    async uploadVideo(localPath, opts = {}) {
        return this.uploadLocalFile(localPath, { ...opts, kind: 'video' });
    }

    async uploadAudio(localPath, opts = {}) {
        return this.uploadLocalFile(localPath, { ...opts, kind: 'audio' });
    }

    /**
     * Hợp đồng tương thích với TosStorageProvider để ReferenceManager
     * dùng chung một đường code cho cả TOS lẫn Kie.
     */
    async upload(localPath, { originalName, kind, signal, fetchFn } = {}) {
        const up = await this.uploadLocalFile(localPath, { originalName, kind, signal, fetchFn });
        return {
            storageProvider: this.name,
            remoteObjectKey: up.fileId,
            remoteUrl: up.remoteUrl,
            expiresAt: up.expiresAt,
            bytes: up.bytes,
            mimeType: up.mimeType,
            etag: null
        };
    }

    /** Kiểm tra một tham chiếu đã upload còn dùng lại được không. */
    isReferenceUsable(ref, now = Date.now()) {
        if (!ref || !ref.remoteUrl) return false;
        if (ref.storageProvider && ref.storageProvider !== this.name) return false;
        return !isExpired(ref.expiresAt, now);
    }
}

export default KieFileStorageProvider;
