/**
 * byteplus/storage/tos_provider.js
 *
 * Real Storage Provider cho BytePlus Torch Object Storage (TOS).
 * Hỗ trợ:
 *   - Upload file cục bộ lên private bucket
 *   - Sinh signed/presigned HTTPS URL theo chuẩn TOS4-HMAC-SHA256
 *   - Tái sử dụng object đã có và gia hạn signed URL khi hết hạn mà không cần upload lại
 *   - Chuẩn hoá object key an toàn: gtf-video-ai/YYYY/MM/DD/<taskId>/<referenceId>-<safeFilename>
 *   - Chặn tuyệt đối cuộc gọi mạng ra ngoài khi chưa cấu hình hoặc trong môi trường test (bảo vệ credit)
 *
 * Zero external dependencies — sử dụng chuẩn crypto của Node.js.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';

/**
 * Tính HMAC-SHA256
 */
export function hmac(key, data, encoding) {
    const h = crypto.createHmac('sha256', key).update(data);
    return encoding ? h.digest(encoding) : h.digest();
}

/**
 * Tính SHA256 hex digest
 */
export function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Sinh SigningKey theo chuẩn phân cấp của BytePlus TOS:
 * kSecret = SecretKey
 * kDate = HMAC-SHA256(kSecret, "YYYYMMDD")
 * kRegion = HMAC-SHA256(kDate, region)
 * kService = HMAC-SHA256(kRegion, "tos")
 * kSigning = HMAC-SHA256(kService, "request")
 */
export function getSigningKey(secretKey, dateStr, region, service = 'tos') {
    const kDate = hmac(secretKey, dateStr);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'request');
    return kSigning;
}

/**
 * Lấy MIME Type theo phần mở rộng file
 */
export function getMimeType(ext) {
    const e = (ext || '').toLowerCase();
    switch (e) {
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.webp': return 'image/webp';
        case '.gif': return 'image/gif';
        case '.mp4': return 'video/mp4';
        case '.mov': return 'video/quicktime';
        case '.webm': return 'video/webm';
        case '.avi': return 'video/x-msvideo';
        default: return 'application/octet-stream';
    }
}

/**
 * Sinh Object Key an toàn, ngăn path traversal, bảo vệ đường dẫn máy thật
 * Format: <keyPrefix>/YYYY/MM/DD/<taskId>/<referenceId>-<safeFilename>
 */
export function buildObjectKey({
    taskId = 'task',
    referenceId = 'ref',
    localPath = '',
    originalName = '',
    keyPrefix = 'gtf-video-ai',
    date = new Date()
} = {}) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');

    const rawName = originalName || (localPath ? path.win32.basename(localPath) : 'file');
    // Bóc tách extension sạch
    const rawExt = path.extname(rawName).toLowerCase();
    const cleanExt = rawExt.replace(/[^a-z0-9.]/g, '') || (localPath ? path.extname(localPath).toLowerCase() : '.bin');

    // Làm sạch tên file: bỏ path traversal (.., \, /), chỉ giữ ký tự an toàn
    const baseWithoutExt = path.basename(rawName, rawExt);
    let cleanName = baseWithoutExt
        .replace(/\\/g, '_')
        .replace(/\//g, '_')
        .replace(/\.\./g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!cleanName) cleanName = 'upload';

    const cleanTaskId = String(taskId || 'task')
        .replace(/\\/g, '_')
        .replace(/\//g, '_')
        .replace(/\.\./g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '_');

    const cleanRefId = String(referenceId || 'ref')
        .replace(/\\/g, '_')
        .replace(/\//g, '_')
        .replace(/\.\./g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '_');

    const cleanPrefix = String(keyPrefix || 'gtf-video-ai')
        .replace(/\\/g, '_')
        .replace(/\.\./g, '_')
        .replace(/^\/+|\/+$/g, '');

    return `${cleanPrefix}/${yyyy}/${mm}/${dd}/${cleanTaskId}/${cleanRefId}-${cleanName}${cleanExt}`;
}

/**
 * Sinh Presigned URL theo chuẩn TOS4-HMAC-SHA256
 */
export function generatePresignedUrl({
    accessKey,
    secretKey,
    bucket,
    region,
    endpoint,
    objectKey,
    method = 'GET',
    ttlSeconds = 3600,
    timestamp = new Date()
}) {
    if (!accessKey || !secretKey || !bucket || !region) {
        const err = new Error('BYTEPLUS_TOS_NOT_CONFIGURED: Thiếu accessKey, secretKey, bucket hoặc region để sinh Presigned URL.');
        err.code = 'BYTEPLUS_TOS_NOT_CONFIGURED';
        throw err;
    }

    if (!objectKey) {
        const err = new Error('BYTEPLUS_TOS_INVALID_REFERENCE: Thiếu objectKey để sinh URL.');
        err.code = 'BYTEPLUS_TOS_INVALID_REFERENCE';
        throw err;
    }

    try {
        const isoDate = timestamp.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHmmssZ
        const dateStr = isoDate.slice(0, 8); // YYYYMMDD

        let ep = (endpoint || `https://tos-${region}.bytepluses.com`).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        const bucketHost = ep.toLowerCase().startsWith(bucket.toLowerCase() + '.') ? ep : `${bucket}.${ep}`;
        const protocol = (endpoint && endpoint.startsWith('http://')) ? 'http:' : 'https:';

        const cleanKey = objectKey.replace(/^\/+/, '');
        const canonicalUri = '/' + cleanKey.split('/').map(seg => encodeURIComponent(seg)).join('/');

        const credentialScope = `${accessKey}/${dateStr}/${region}/tos/request`;

        const queryParams = {
            'X-Tos-Algorithm': 'TOS4-HMAC-SHA256',
            'X-Tos-Credential': credentialScope,
            'X-Tos-Date': isoDate,
            'X-Tos-Expires': String(ttlSeconds),
            'X-Tos-SignedHeaders': 'host'
        };

        const sortedKeys = Object.keys(queryParams).sort();
        const canonicalQueryString = sortedKeys
            .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
            .join('&');

        const canonicalHeaders = `host:${bucketHost.toLowerCase()}\n`;
        const signedHeaders = 'host';
        const hashedPayload = 'UNSIGNED-PAYLOAD';

        const canonicalRequest = [
            method.toUpperCase(),
            canonicalUri,
            canonicalQueryString,
            canonicalHeaders,
            signedHeaders,
            hashedPayload
        ].join('\n');

        const stringToSign = [
            'TOS4-HMAC-SHA256',
            isoDate,
            `${dateStr}/${region}/tos/request`,
            sha256(canonicalRequest)
        ].join('\n');

        const signingKey = getSigningKey(secretKey, dateStr, region, 'tos');
        const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

        const finalQuery = `${canonicalQueryString}&X-Tos-Signature=${signature}`;
        return `${protocol}//${bucketHost}${canonicalUri}?${finalQuery}`;
    } catch (signErr) {
        if (signErr.code === 'BYTEPLUS_TOS_NOT_CONFIGURED') throw signErr;
        const err = new Error(`BYTEPLUS_TOS_SIGN_URL_FAILED: Không thể ký URL (${signErr.message})`);
        err.code = 'BYTEPLUS_TOS_SIGN_URL_FAILED';
        err.cause = signErr;
        throw err;
    }
}

export class BytePlusTosStorageProvider {
    constructor({
        accessKey,
        secretKey,
        bucket,
        region,
        endpoint,
        signedUrlTtlSeconds,
        fetchFn,
        allowLiveTests
    } = {}) {
        this.name = 'tos';
        this.accessKey = accessKey !== undefined ? accessKey : config.tos.accessKey;
        this.secretKey = secretKey !== undefined ? secretKey : config.tos.secretKey;
        this.bucket = bucket !== undefined ? bucket : (config.tos.bucket || 'gtf-video-reference');
        this.region = region !== undefined ? region : (config.tos.region || 'ap-southeast-1');
        this.endpoint = endpoint !== undefined ? endpoint : (config.tos.endpoint || `https://tos-${this.region}.bytepluses.com`);
        this.signedUrlTtlSeconds = signedUrlTtlSeconds !== undefined ? Number(signedUrlTtlSeconds) : (config.tos.signedUrlTtlSeconds || 3600);
        this.fetchFn = fetchFn || null;
        this.allowLiveTests = allowLiveTests !== undefined ? allowLiveTests : config.generation.allowLiveTests;
    }

    isConfigured() {
        return Boolean(this.accessKey && this.secretKey && this.bucket && this.region);
    }

    getBucketHost() {
        let ep = (this.endpoint || `https://tos-${this.region}.bytepluses.com`).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        if (ep.toLowerCase().startsWith(this.bucket.toLowerCase() + '.')) {
            return ep;
        }
        return `${this.bucket}.${ep}`;
    }

    getBucketBaseUrl() {
        const protocol = (this.endpoint && this.endpoint.startsWith('http://')) ? 'http:' : 'https:';
        return `${protocol}//${this.getBucketHost()}`;
    }

    buildObjectKey(opts) {
        return buildObjectKey(opts);
    }

    getSignedUrl(objectKey, { ttlSeconds = this.signedUrlTtlSeconds, method = 'GET', timestamp = new Date() } = {}) {
        return generatePresignedUrl({
            accessKey: this.accessKey,
            secretKey: this.secretKey,
            bucket: this.bucket,
            region: this.region,
            endpoint: this.endpoint,
            objectKey,
            method,
            ttlSeconds,
            timestamp
        });
    }

    getPresignedUrl(objectKey, opts = {}) {
        return this.getSignedUrl(objectKey, opts);
    }

    _getFetch(opts) {
        const fn = (opts && opts.fetchFn) || this.fetchFn;
        if (fn) return fn;
        const liveAllowed = (opts && opts.allowLiveTests !== undefined)
            ? opts.allowLiveTests
            : (this.allowLiveTests !== undefined ? this.allowLiveTests : config.generation.allowLiveTests);
        if (!liveAllowed) {
            const err = new Error('LIVE_TEST_DISABLED: ALLOW_LIVE_BYTEPLUS_TESTS đang là false. Chặn cuộc gọi TOS thật ra ngoài để bảo vệ dữ liệu và chi phí.');
            err.code = 'LIVE_TEST_DISABLED';
            throw err;
        }
        return globalThis.fetch;
    }

    /**
     * Tải file cục bộ lên private TOS bucket.
     * @returns {Promise<{storageProvider, remoteObjectKey, remoteUrl, expiresAt, bytes, etag, localPath}>}
     */
    async upload(localPath, {
        taskId,
        referenceId,
        originalName,
        keyPrefix = 'gtf-video-ai',
        signal,
        fetchFn,
        ttlSeconds
    } = {}) {
        if (signal && signal.aborted) throw new Error('Cancelled');

        if (!this.isConfigured()) {
            const err = new Error('BYTEPLUS_TOS_NOT_CONFIGURED: Chưa cấu hình BytePlus TOS (thiếu access key, secret key, bucket hoặc region).');
            err.code = 'BYTEPLUS_TOS_NOT_CONFIGURED';
            throw err;
        }

        if (!localPath || !fs.existsSync(localPath)) {
            const err = new Error(`BYTEPLUS_TOS_FILE_NOT_FOUND: Không tìm thấy file cục bộ để tải lên TOS: ${path.basename(String(localPath || ''))}`);
            err.code = 'BYTEPLUS_TOS_FILE_NOT_FOUND';
            throw err;
        }

        const stat = fs.statSync(localPath);
        const objectKey = this.buildObjectKey({ taskId, referenceId, localPath, originalName, keyPrefix });

        const ttl = ttlSeconds || this.signedUrlTtlSeconds;
        const putUrl = this.getPresignedUrl(objectKey, { method: 'PUT', ttlSeconds: Math.max(900, ttl) });
        const fetcher = this._getFetch({ fetchFn });

        const ext = path.extname(localPath).toLowerCase();
        const contentType = getMimeType(ext);
        const fileBuf = fs.readFileSync(localPath);
        const localEtag = crypto.createHash('md5').update(fileBuf).digest('hex');

        let res;
        try {
            res = await fetcher(putUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': contentType
                },
                body: fileBuf,
                signal
            });
        } catch (fetchErr) {
            if (fetchErr.code === 'LIVE_TEST_DISABLED') throw fetchErr;
            const err = new Error(`BYTEPLUS_TOS_UPLOAD_FAILED: Lỗi kết nối khi tải file lên TOS (${fetchErr.message})`);
            err.code = 'BYTEPLUS_TOS_UPLOAD_FAILED';
            err.cause = fetchErr;
            throw err;
        }

        if (!res || !res.ok) {
            const status = res ? res.status : 0;
            const statusText = res ? (res.statusText || '') : 'No Response';
            const err = new Error(`BYTEPLUS_TOS_UPLOAD_FAILED: BytePlus TOS trả về HTTP ${status}: ${statusText}`);
            err.code = 'BYTEPLUS_TOS_UPLOAD_FAILED';
            err.status = status;
            throw err;
        }

        // Sinh fresh signed GET URL cho ModelArk đọc
        const remoteUrl = this.getSignedUrl(objectKey, { ttlSeconds: ttl });
        const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

        return {
            storageProvider: this.name,
            remoteObjectKey: objectKey,
            remoteUrl,
            expiresAt,
            bytes: stat.size,
            etag: res.headers?.get?.('etag')?.replace(/"/g, '') || localEtag,
            localPath
        };
    }

    /**
     * Gia hạn signed URL cho một tham chiếu đã có remoteObjectKey (không upload lại).
     */
    refreshSignedUrl(reference, { ttlSeconds } = {}) {
        if (!reference || !reference.remoteObjectKey) {
            const err = new Error('BYTEPLUS_TOS_INVALID_REFERENCE: Tham chiếu không có remoteObjectKey hợp lệ để làm mới signed URL.');
            err.code = 'BYTEPLUS_TOS_INVALID_REFERENCE';
            throw err;
        }

        const ttl = ttlSeconds || this.signedUrlTtlSeconds;
        const freshUrl = this.getSignedUrl(reference.remoteObjectKey, { ttlSeconds: ttl });
        const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

        reference.remoteUrl = freshUrl;
        reference.expiresAt = expiresAt;
        return reference;
    }
}

// Giữ tên TosStorageProvider để tương thích ngược với import hiện có
export const TosStorageProvider = BytePlusTosStorageProvider;
export default BytePlusTosStorageProvider;
