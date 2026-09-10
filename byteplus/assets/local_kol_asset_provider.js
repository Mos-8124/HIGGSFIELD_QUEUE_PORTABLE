/**
 * byteplus/assets/local_kol_asset_provider.js
 *
 * Asset Provider cho KOL khi chạy với Kie.ai — KHÔNG dùng BytePlus LAS.
 *
 * Triết lý: file gốc cục bộ của KOL là NGUỒN SỰ THẬT.
 * Không đăng ký asset lên bất kỳ dịch vụ nào, không sinh asset://,
 * không gọi mạng. Lúc chạy task, ReferenceManager sẽ tải file gốc của KOL
 * lên Kie File Upload API để lấy URL tạm.
 *
 * Nhờ vậy thư viện KOL hoạt động đầy đủ mà không cần BYTEPLUS_LAS_API_KEY.
 */
import crypto from 'crypto';
import fs from 'fs';

export class LocalKolAssetProvider {
    constructor() {
        this.name = 'local';
        // ReferenceManager đọc cờ này để biết phải upload file gốc của KOL
        // thay vì phân giải asset:// qua LAS.
        this.usesLocalSource = true;
    }

    isConfigured() { return true; }

    /**
     * "Đăng ký" KOL = chỉ xác nhận file gốc tồn tại và cấp một id cục bộ ổn định.
     * Id này bất biến, nên đổi tên KOL về sau không làm hỏng task lịch sử.
     */
    async registerAsset({ displayName, files = [] } = {}) {
        for (const f of files) {
            if (f && !fs.existsSync(f)) {
                const err = new Error(`ASSET_FILE_MISSING: Không tìm thấy file tài sản KOL: ${f}`);
                err.code = 'ASSET_FILE_MISSING';
                throw err;
            }
        }
        return {
            assetProvider: this.name,
            assetId: 'local_asset_' + crypto.randomBytes(6).toString('hex'),
            assetUri: null,
            displayName: displayName || 'KOL',
            registeredAt: new Date().toISOString()
        };
    }

    /**
     * Không có dịch vụ từ xa để hỏi — chỉ xác nhận id hợp lệ.
     * File gốc được ReferenceManager kiểm tra riêng ở bước preflight.
     */
    async resolveAsset(assetId) {
        if (!assetId || typeof assetId !== 'string') {
            const err = new Error(`ASSET_UNAVAILABLE: Asset KOL không hợp lệ: ${assetId}`);
            err.code = 'ASSET_UNAVAILABLE';
            throw err;
        }
        return { assetId, assetUri: null, available: true, local: true };
    }
}

export default LocalKolAssetProvider;
