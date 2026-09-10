/**
 * byteplus/assets/las_asset_provider.js
 * Stub cho LAS Asset Library thật. Không gọi mạng khi chưa cấu hình.
 */
import { config } from '../config.js';

export class LasAssetLibraryProvider {
    constructor() { this.name = 'las'; }

    isConfigured() {
        return Boolean(config.las.apiKey) && config.las.enabled === true;
    }

    async registerAsset() { throw this._notConfigured(); }
    async resolveAsset()  { throw this._notConfigured(); }

    _notConfigured() {
        const err = new Error('NOT_CONFIGURED: LAS Asset Library chưa được bật/cấu hình (BYTEPLUS_LAS_API_KEY, BYTEPLUS_LAS_ASSET_ENABLED).');
        err.code = 'NOT_CONFIGURED';
        return err;
    }
}

export default LasAssetLibraryProvider;
