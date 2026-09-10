/**
 * byteplus/storage/mock_tos_provider.js
 * Mô phỏng BytePlus TOS: nhận file cục bộ, trả về "URL công khai".
 * Không gọi mạng. Sinh đúng các trường mà transport thật sẽ cần.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class MockTosProvider {
    constructor({ publicBase = '/api/byteplus/mock-tos', ttlMs = 24 * 3600 * 1000 } = {}) {
        this.name = 'mock-tos';
        this.publicBase = publicBase;
        this.ttlMs = ttlMs;
    }

    isConfigured() { return true; }

    /**
     * "Upload" một file cục bộ.
     * @returns {{storageProvider,remoteObjectKey,remoteUrl,expiresAt,bytes,etag}}
     */
    async upload(localPath, { keyPrefix = 'refs', signal } = {}) {
        if (signal?.aborted) throw new Error('Cancelled');
        if (!localPath || !fs.existsSync(localPath)) {
            const err = new Error(`Không tìm thấy file để upload: ${path.basename(String(localPath))}`);
            err.code = 'REFERENCE_FILE_MISSING';
            throw err;
        }
        const stat = fs.statSync(localPath);
        const buf = fs.readFileSync(localPath);
        const etag = crypto.createHash('md5').update(buf).digest('hex');
        const ext = path.extname(localPath) || '.bin';
        const objectKey = `${keyPrefix}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;

        // Mô phỏng độ trễ mạng theo kích thước file, có trần để test chạy nhanh.
        await new Promise(r => setTimeout(r, Math.min(40, Math.ceil(stat.size / 200000))));

        return {
            storageProvider: this.name,
            remoteObjectKey: objectKey,
            remoteUrl: `${this.publicBase}/${encodeURI(objectKey)}`,
            expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
            bytes: stat.size,
            etag,
            localPath
        };
    }
}

export default MockTosProvider;
