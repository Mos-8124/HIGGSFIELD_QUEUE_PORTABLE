/**
 * byteplus/config.js
 * Cấu hình cho hệ thống GTF Video AI Automation V2.
 * Hoàn toàn độc lập với cấu hình của hệ thống Higgsfield cũ.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let _lastEnvMtime = 0;

// Tự động nạp file .env từ thư mục gốc nếu có (trừ khi đang chạy test tự động)
export function loadDotenv(force = false) {
    if (process.env.NODE_ENV === 'test' || process.env.npm_lifecycle_event === 'test' || process.argv.some(a => a.includes('test'))) return;
    const envFile = path.join(ROOT, '.env');
    if (!fs.existsSync(envFile)) return;
    try {
        const stat = fs.statSync(envFile);
        if (!force && stat.mtimeMs === _lastEnvMtime) return;
        _lastEnvMtime = stat.mtimeMs;
        const lines = fs.readFileSync(envFile, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq === -1) continue;
            const k = trimmed.slice(0, eq).trim();
            let v = trimmed.slice(eq + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                v = v.slice(1, -1);
            }
            process.env[k] = v;
        }
    } catch (_) {}
}
loadDotenv();

function int(name, def) {
    const v = parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(v) ? v : def;
}
function bool(name, def) {
    const v = process.env[name];
    if (v === undefined || v === '') return def;
    return v === 'true' || v === '1';
}

// Xác định provider: 'mock' | 'kie' | 'byteplus' | 'openrouter'
// 'kie' là luồng active hiện tại; 'byteplus'/'openrouter' giữ lại làm fallback không hoạt động.
function resolveProvider() {
    const p = (process.env.GTF_VIDEO_PROVIDER || '').toLowerCase().trim();
    if (p === 'kie' || p === 'openrouter' || p === 'byteplus' || p === 'mock') return p;
    const mode = (process.env.BYTEPLUS_MODE || '').toLowerCase().trim();
    if (mode === 'mock') return 'mock';
    if (mode === 'live') return 'byteplus';
    if (p) return p;
    return 'mock';
}


export const config = {
    // Provider được chọn: 'mock' | 'kie' | 'byteplus' | 'openrouter'
    provider: resolveProvider(),

    // Tương thích ngược với BYTEPLUS_MODE ('mock' | 'live')
    get mode() {
        return this.provider === 'mock' ? 'mock' : 'live';
    },

    _maxConcurrency: null,
    get maxConcurrency() {
        if (this._maxConcurrency !== null && this._maxConcurrency !== undefined) {
            return this._maxConcurrency;
        }
        if (this.provider === 'kie') {
            return int('KIE_MAX_CONCURRENCY', 1);
        }
        if (this.provider === 'openrouter') {
            return int('OPENROUTER_MAX_CONCURRENCY', 1);
        }
        return int('BYTEPLUS_MAX_CONCURRENCY', 10);
    },
    set maxConcurrency(v) {
        this._maxConcurrency = v;
    },

    // Tốc độ mô phỏng: số ms cho mỗi chặng pipeline của mock provider.
    mockStageMs: int('BYTEPLUS_MOCK_STAGE_MS', 350),
    mockPollMs: int('BYTEPLUS_MOCK_POLL_MS', 120),

    // Đường dẫn dữ liệu — TÁCH HẲN khỏi queue_db.json của hệ cũ.
    root: ROOT,
    queueDbPath: path.join(ROOT, 'byteplus_queue_db.json'),
    kolDbPath: path.join(ROOT, 'byteplus_kol_library.json'),
    mockJobsPath: path.join(ROOT, 'byteplus_mock_jobs.json'),
    uploadsDir: path.join(ROOT, 'byteplus_uploads'),
    outputsDir: path.join(ROOT, 'byteplus_outputs'),
    fixturesDir: path.join(__dirname, 'fixtures'),

    // Cấu hình Kie.ai — LUỒNG ACTIVE. Bí mật duy nhất người dùng phải điền là KIE_API_KEY.
    kie: {
        get apiKey() { loadDotenv(); return process.env.KIE_API_KEY || ''; },
        get baseUrl() { loadDotenv(); return process.env.KIE_BASE_URL || 'https://api.kie.ai'; },
        get uploadBaseUrl() { loadDotenv(); return process.env.KIE_UPLOAD_BASE_URL || 'https://kieai.redpandaai.co'; },
        get model() { loadDotenv(); return process.env.KIE_VIDEO_MODEL || 'bytedance/seedance-2-5'; },
        get modelName() { return 'Kie.ai — ByteDance Seedance 2.5'; },
        get uploadPath() { loadDotenv(); return process.env.KIE_UPLOAD_PATH || 'gtf-video-ai'; },
        get fileTtlHours() { loadDotenv(); return int('KIE_FILE_TTL_HOURS', 24); },
        get maxConcurrency() { loadDotenv(); return int('KIE_MAX_CONCURRENCY', 1); },
        get pollIntervalMs() { loadDotenv(); return int('KIE_POLL_INTERVAL_MS', 5000); },
        get pollTimeoutMs() { loadDotenv(); return int('KIE_POLL_TIMEOUT_MS', 900000); },
        get callbackUrl() { loadDotenv(); return process.env.KIE_CALLBACK_URL || ''; }
    },

    // Cấu hình ModelArk / Seedance thật
    generation: {
        apiKey: process.env.BYTEPLUS_MODELARK_API_KEY || process.env.BYTEPLUS_ARK_API_KEY || '',
        endpointId: process.env.BYTEPLUS_ENDPOINT_ID || '',
        baseUrl: process.env.BYTEPLUS_BASE_URL || process.env.BYTEPLUS_ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com',
        region: process.env.BYTEPLUS_REGION || 'ap-southeast-1',
        modelName: process.env.BYTEPLUS_MODEL_NAME || 'ByteDance Seedance 1.5 Pro',
        modelId: process.env.BYTEPLUS_MODEL_ID || 'seedance-1-5-pro-251215',
        pollIntervalMs: int('BYTEPLUS_POLL_INTERVAL_MS', 5000),
        pollTimeoutMs: int('BYTEPLUS_POLL_TIMEOUT_MS', 900000),
        allowLiveTests: bool('ALLOW_LIVE_BYTEPLUS_TESTS', false),
        get model() {
            return this.endpointId || this.modelId;
        }
    },
    // Cấu hình OpenRouter Seedance 2.5
    openrouter: {
        get apiKey() { return process.env.OPENROUTER_API_KEY || ''; },
        get baseUrl() { return process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'; },
        get model() { return process.env.OPENROUTER_VIDEO_MODEL || 'bytedance/seedance-2.5'; },
        get maxConcurrency() { return int('OPENROUTER_MAX_CONCURRENCY', 1); },
        get pollIntervalMs() { return int('OPENROUTER_POLL_INTERVAL_MS', 5000); },
        get pollTimeoutMs() { return int('OPENROUTER_POLL_TIMEOUT_MS', 900000); },
        get allowLiveTests() { return bool('ALLOW_LIVE_OPENROUTER_TESTS', bool('ALLOW_LIVE_BYTEPLUS_TESTS', false)); }
    },
    tos: {
        accessKey: process.env.BYTEPLUS_TOS_ACCESS_KEY || '',
        secretKey: process.env.BYTEPLUS_TOS_SECRET_KEY || '',
        bucket: process.env.BYTEPLUS_TOS_BUCKET || 'gtf-video-reference',
        region: process.env.BYTEPLUS_TOS_REGION || 'ap-southeast-1',
        endpoint: process.env.BYTEPLUS_TOS_ENDPOINT || '',
        signedUrlTtlSeconds: int('BYTEPLUS_TOS_SIGNED_URL_TTL_SECONDS', 3600)
    },
    las: {
        apiKey: process.env.BYTEPLUS_LAS_API_KEY || '',
        enabled: bool('BYTEPLUS_LAS_ASSET_ENABLED', false)
    },

    // Giới hạn tham chiếu theo tài liệu Seedance 1.5 Pro & 2.5.
    limits: {
        maxImages: 30,
        maxVideos: 10,
        durationMin: 4,
        durationMax: 30,
        resolutions: ['480p', '720p', '1080p'],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive']
    }
};

export function isMock() {
    return config.provider === 'mock' || config.mode === 'mock';
}

/** Trạng thái cấu hình để hiển thị ở trang Settings — KHÔNG lộ giá trị bí mật. */
export function providerStatus() {
    const effectiveEndpoint = config.generation.endpointId || config.generation.modelId;
    const isModelArkConfigured = Boolean(config.generation.apiKey && effectiveEndpoint);
    const isOpenRouterConfigured = Boolean(config.openrouter.apiKey);
    const isTosConfigured = Boolean(config.tos.accessKey && config.tos.secretKey && config.tos.bucket && config.tos.region);

    const isKie = config.provider === 'kie';
    const isKieConfigured = Boolean(config.kie.apiKey);

    let activeProviderName = 'Mock Seedance';
    let activeProviderClass = 'MockSeedanceProvider';
    if (isKie) {
        activeProviderName = 'KIE';
        activeProviderClass = 'KieSeedanceProvider';
    } else if (config.provider === 'openrouter') {
        activeProviderName = 'OpenRouter Seedance 2.5';
        activeProviderClass = 'OpenRouterSeedanceProvider';
    } else if (config.provider === 'byteplus') {
        activeProviderName = 'BytePlus ModelArk (Seedance 1.5 Pro)';
        activeProviderClass = 'BytePlusGenerationProvider';
    }

    return {
        mode: config.mode,
        provider: config.provider,
        activeProviderName,
        activeProviderClass,
        referenceStorage: isKie ? 'KIE upload' : (config.provider === 'byteplus' ? 'BytePlus TOS' : 'Local / Mock'),
        tos: isKie ? 'not used' : (isTosConfigured ? 'Configured' : 'Not configured'),
        las: isKie ? 'not used' : (config.las.enabled ? 'Enabled' : 'Not configured'),
        maxConcurrency: config.maxConcurrency,
        kie: {
            name: 'Kie.ai — Seedance 2.5',
            configured: isKieConfigured,
            model: config.kie.model,
            baseUrl: config.kie.baseUrl,
            maxConcurrency: config.kie.maxConcurrency,
            referenceStorage: 'KIE upload',
            fileTtlHours: config.kie.fileTtlHours,
            active: isKie ? 'KieSeedanceProvider' : 'Inactive'
        },
        openrouter: {
            name: 'OpenRouter Seedance 2.5',
            configured: isOpenRouterConfigured,
            model: config.openrouter.model,
            maxConcurrency: config.openrouter.maxConcurrency,
            active: config.provider === 'openrouter' ? 'OpenRouterSeedanceProvider' : 'Inactive'
        },
        generation: {
            name: config.generation.modelName,
            modelId: config.generation.modelId,
            endpointIdConfigured: Boolean(config.generation.endpointId || config.generation.modelId),
            endpointId: config.generation.endpointId
                ? config.generation.endpointId.replace(/^(ep-\w{3}).*(\w{3})$/, '$1****$2')
                : `(mặc định: ${config.generation.modelId})`,
            configured: isModelArkConfigured,
            model: effectiveEndpoint,
            active: config.provider === 'byteplus' ? 'BytePlusGenerationProvider' : (isMock() ? 'MockSeedanceProvider' : 'Inactive')
        },
        // Kho lưu tham chiếu ĐANG hoạt động. Ở chế độ kie thì TOS hoàn toàn không được dùng.
        storage: isKie ? {
            name: 'KIE upload',
            configured: isKieConfigured,
            bucket: '',
            bucketConfigured: false,
            region: '-',
            signedUrl: `Temporary (TTL ${config.kie.fileTtlHours}h)`,
            active: 'KieFileStorageProvider'
        } : {
            name: 'BytePlus TOS',
            configured: isTosConfigured,
            bucket: config.tos.bucket || '',
            bucketConfigured: Boolean(config.tos.bucket),
            region: config.tos.region || 'ap-southeast-1',
            signedUrl: 'Enabled',
            active: isMock() ? 'MockTosProvider' : 'BytePlusTosStorageProvider'
        },
        assets: isKie ? {
            name: 'LAS Asset Library',
            configured: false,
            enabled: false,
            active: 'not used',
            kolSource: 'Local file (LocalKolAssetProvider)'
        } : {
            name: 'LAS Asset Library',
            configured: Boolean(config.las.apiKey) && config.las.enabled,
            enabled: config.las.enabled,
            active: isMock() ? 'MockLasAssetProvider' : 'LasAssetLibraryProvider'
        },
        // Trạng thái các thành phần BytePlus — giữ lại làm fallback, không nằm trong luồng active.
        byteplus: {
            modelark: isKie ? 'not used' : (config.provider === 'byteplus' ? 'Active' : 'Inactive'),
            tos: isKie ? 'not used' : (isTosConfigured ? 'Configured' : 'Not configured'),
            las: isKie ? 'not used' : (config.las.enabled ? 'Enabled' : 'Not configured')
        }
    };
}

export default config;
