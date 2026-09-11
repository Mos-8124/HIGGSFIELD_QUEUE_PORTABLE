/**
 * byteplus/kie_models.js
 *
 * NGUON CHAN LY DUY NHAT cho cac model Seedance chay qua Kie.ai.
 * Them model moi chi can them 1 entry o day — provider, pricing, validate, UI
 * deu doc tu registry nay.
 *
 * Tat ca dung chung mot KIE_API_KEY (cung tai khoan Kie.ai), chi khac model id.
 *
 * Gioi han schema xac minh tu docs.kie.ai + kie.ai playground (2026-09-11):
 *   seedance-2-5   : anh<=30, video<=10, duration 4-30s, 480p/720p/1080p, co output_format
 *   seedance-2-mini: anh<=9,  video<=3,  duration 4-15s, 480p/720p,       KHONG output_format
 *   seedance-2-fast: anh<=9,  video<=3,  duration 4-15s, 480p/720p,       KHONG output_format
 */

export const KIE_MODELS = {
    'Seedance 2.5': {
        key: 'Seedance 2.5',
        id: 'bytedance/seedance-2-5',
        label: 'Seedance 2.5',
        maxDuration: 30,
        minDuration: 4,
        resolutions: ['480p', '720p', '1080p'],
        maxImages: 30,
        maxVideos: 10,
        sendOutputFormat: true
    },
    'Seedance 2.0 Mini': {
        key: 'Seedance 2.0 Mini',
        id: 'bytedance/seedance-2-mini',
        label: 'Seedance 2.0 Mini',
        maxDuration: 15,
        minDuration: 4,
        resolutions: ['480p', '720p'],
        maxImages: 9,
        maxVideos: 3,
        sendOutputFormat: false
    },
    'Seedance 2.0 Fast': {
        key: 'Seedance 2.0 Fast',
        id: 'bytedance/seedance-2-fast',
        label: 'Seedance 2.0 Fast',
        maxDuration: 15,
        minDuration: 4,
        resolutions: ['480p', '720p'],
        maxImages: 9,
        maxVideos: 3,
        sendOutputFormat: false
    }
};

export const DEFAULT_MODEL_KEY = 'Seedance 2.5';

// Cho phep tra cuu bang: ten hien thi ('Seedance 2.0'), kie id ('bytedance/seedance-2'),
// hoac vai bi danh thuong gap.
const ALIASES = {
    'bytedance/seedance-2-5': 'Seedance 2.5',
    'seedance-2-5': 'Seedance 2.5',
    'seedance 2.5': 'Seedance 2.5',
    'bytedance/seedance-2-mini': 'Seedance 2.0 Mini',
    'seedance-2-mini': 'Seedance 2.0 Mini',
    'seedance 2.0 mini': 'Seedance 2.0 Mini',
    'bytedance/seedance-2-fast': 'Seedance 2.0 Fast',
    'seedance-2-fast': 'Seedance 2.0 Fast',
    'seedance 2.0 fast': 'Seedance 2.0 Fast'
};

/**
 * Phan giai bat ky dinh danh model nao ve mot entry trong registry.
 * Khong khop -> tra ve model mac dinh (Seedance 2.5) de khong bao gio vo luong.
 */
export function resolveKieModel(nameOrId) {
    if (nameOrId && typeof nameOrId === 'object' && nameOrId.id) return nameOrId;
    const raw = String(nameOrId || '').trim();
    if (KIE_MODELS[raw]) return KIE_MODELS[raw];
    const alias = ALIASES[raw.toLowerCase()];
    if (alias && KIE_MODELS[alias]) return KIE_MODELS[alias];
    return KIE_MODELS[DEFAULT_MODEL_KEY];
}

/** Danh sach cho UI/settings. */
export function listKieModels() {
    return Object.values(KIE_MODELS);
}

export default KIE_MODELS;
