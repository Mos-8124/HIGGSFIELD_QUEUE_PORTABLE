/**
 * byteplus/assets/mock_las_provider.js
 * Mô phỏng LAS Asset Library — nơi đăng ký nhân vật (KOL) để dùng lại nhiều lần.
 * Trả về asset ID dạng asset://... giống hợp đồng thật.
 */
import crypto from 'crypto';
import fs from 'fs';

export class MockLasAssetProvider {
    constructor() { this.name = 'mock-las'; }

    isConfigured() { return true; }

    /** Đăng ký một KOL, trả về assetId ổn định. */
    async registerAsset({ displayName, files = [] } = {}) {
        for (const f of files) {
            if (f && !fs.existsSync(f)) {
                const err = new Error(`Không tìm thấy file tài sản KOL: ${f}`);
                err.code = 'ASSET_FILE_MISSING';
                throw err;
            }
        }
        await new Promise(r => setTimeout(r, 15));
        const id = 'mock_asset_' + crypto.randomBytes(6).toString('hex');
        return {
            assetProvider: this.name,
            assetId: id,
            assetUri: `asset://${id}`,
            displayName: displayName || 'KOL',
            registeredAt: new Date().toISOString()
        };
    }

    /** Kiểm tra asset còn dùng được không (pre-flight). */
    async resolveAsset(assetId) {
        if (!assetId || !/^mock_asset_[0-9a-f]+$/.test(assetId)) {
            const err = new Error(`Asset KOL không hợp lệ hoặc không còn tồn tại: ${assetId}`);
            err.code = 'ASSET_UNAVAILABLE';
            throw err;
        }
        return { assetId, assetUri: `asset://${assetId}`, available: true };
    }
}

export default MockLasAssetProvider;
