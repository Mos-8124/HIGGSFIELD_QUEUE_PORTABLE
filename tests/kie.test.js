/**
 * tests/kie.test.js
 *
 * Bo kiem thu cho luong active Kie.ai (Seedance 2.5).
 *
 * KHONG BAO GIO goi mang that:
 *  - Moi request HTTP deu di qua fetchFn gia lap.
 *  - Neu quen truyen fetchFn, provider tu nem LIVE_TEST_DISABLED trong moi truong test.
 *  => Live Kie calls: 0. Live BytePlus calls: 0. Live OpenRouter calls: 0.
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { config, providerStatus } from '../byteplus/config.js';
import { KieFileStorageProvider, isExpired, normalizeKieHttpError } from '../byteplus/providers/kie_file_provider.js';
import { KieSeedanceProvider, normalizeKieFailure } from '../byteplus/providers/kie_seedance_provider.js';
import { LocalKolAssetProvider } from '../byteplus/assets/local_kol_asset_provider.js';
import { ReferenceManager } from '../byteplus/reference_manager.js';
import { ByteplusQueueManager } from '../byteplus/queue_manager.js';
import { KolLibrary } from '../byteplus/kol_library.js';

const S_CFG = 'Kie.ai — Cau hinh & Bao mat';
const S_UP = 'Kie.ai — File Upload API';
const S_GEN = 'Kie.ai — Seedance 2.5 Generation';
const S_QUEUE = 'Kie.ai — Queue, Recovery & Chi phi';

const API_KEY = 'kie-test-key-DO-NOT-LEAK-123456';
const FUTURE = new Date(Date.now() + 86400000).toISOString();
const PAST = new Date(Date.now() - 1000).toISOString();

// ── tien ich ────────────────────────────────────────────────────────────────

function tmpDir(tag) {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'kie-test-' + tag + '-'));
}

function writeFile(dir, name, content = 'x') {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content);
    return p;
}

function jsonResponse(body, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function binaryResponse(buf, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    };
}

const MP4 = Buffer.from('00000018667479706d70343200000000', 'hex');

function uploadOk(fileName, url, extra = {}) {
    return jsonResponse({
        success: true,
        code: 200,
        msg: 'File uploaded successfully',
        data: {
            fileName,
            filePath: 'gtf-video-ai/images/' + fileName,
            downloadUrl: url,
            fileSize: 1234,
            mimeType: 'image/png',
            uploadedAt: new Date().toISOString(),
            ...extra
        }
    });
}

function recordInfo(state, extra = {}) {
    return jsonResponse({
        code: 200,
        msg: 'success',
        data: { taskId: 'task_kie_1', model: 'bytedance/seedance-2-5', state, ...extra }
    });
}

const SUCCESS_RECORD = () => recordInfo('success', {
    resultJson: JSON.stringify({ resultUrls: ['https://cdn.kie.example/out.mp4'] }),
    creditsConsumed: 50,
    costTime: 15000
});

/** fetch gia lap co ghi lai lich su goi. */
function makeFetch(handler) {
    const calls = [];
    const fn = async (url, opts = {}) => {
        calls.push({ url: String(url), method: (opts.method || 'GET').toUpperCase(), body: opts.body, headers: opts.headers });
        return handler(String(url), opts, calls);
    };
    fn.calls = calls;
    fn.countPost = (frag) => calls.filter(c => c.method === 'POST' && c.url.includes(frag)).length;
    return fn;
}

function baseTask(overrides = {}) {
    return {
        id: 'bp_test_1',
        creator: 'Tinh',
        taskName: 'Hero',
        prompt: 'a hero standing on a mountain',
        duration: 4,
        resolution: '720p',
        aspectRatio: '9:16',
        generateAudio: true,
        references: [],
        ...overrides
    };
}

// ── bo test ─────────────────────────────────────────────────────────────────

export async function runKieTests(reporter) {

    // ============ 1. Cau hinh & bao mat ============

    await reporter.test(S_CFG, 'Tier 1: Chon provider — GTF_VIDEO_PROVIDER=kie kich hoat KieSeedanceProvider', async () => {
        const saved = { provider: config.provider, key: process.env.KIE_API_KEY };
        try {
            config.provider = 'kie';
            process.env.KIE_API_KEY = API_KEY;
            const st = providerStatus();
            assert.strictEqual(st.provider, 'kie');
            assert.strictEqual(st.activeProviderClass, 'KieSeedanceProvider');
            assert.strictEqual(st.activeProviderName, 'KIE');
            assert.strictEqual(st.referenceStorage, 'KIE upload');
            assert.strictEqual(st.tos, 'not used');
            assert.strictEqual(st.las, 'not used');
            assert.strictEqual(st.storage.name, 'KIE upload');
            assert.strictEqual(st.kie.active, 'KieSeedanceProvider');
            assert.strictEqual(st.kie.model, 'bytedance/seedance-2-5');
        } finally {
            config.provider = saved.provider;
            if (saved.key === undefined) delete process.env.KIE_API_KEY; else process.env.KIE_API_KEY = saved.key;
        }
    });

    await reporter.test(S_CFG, 'Tier 1: Thieu KIE_API_KEY — submit nem KIE_API_KEY_MISSING truoc khi cham mang', async () => {
        const p = new KieSeedanceProvider({ apiKey: '' });
        await assert.rejects(() => p.submit(baseTask()), err => err.code === 'KIE_API_KEY_MISSING');

        const store = new KieFileStorageProvider({ apiKey: '' });
        assert.strictEqual(store.isConfigured(), false);
        await assert.rejects(
            () => store.uploadLocalFile('whatever.png'),
            err => err.code === 'KIE_UPLOAD_NOT_CONFIGURED'
        );
    });

    await reporter.test(S_CFG, 'Tier 1: Bao ve bi mat — KIE_API_KEY khong bao gio xuat hien trong Settings', async () => {
        const saved = { provider: config.provider, key: process.env.KIE_API_KEY };
        try {
            config.provider = 'kie';
            process.env.KIE_API_KEY = API_KEY;
            const dump = JSON.stringify(providerStatus());
            assert.ok(!dump.includes(API_KEY), 'Settings KHONG duoc chua API key');
            assert.ok(dump.includes('"configured":true'), 'Settings chi duoc bao configured true/false');
        } finally {
            config.provider = saved.provider;
            if (saved.key === undefined) delete process.env.KIE_API_KEY; else process.env.KIE_API_KEY = saved.key;
        }
    });

    await reporter.test(S_CFG, 'Tier 1: Khoa an toan — khong truyen fetchFn trong test thi chan cuoc goi mang that', async () => {
        const p = new KieSeedanceProvider({ apiKey: API_KEY });
        await assert.rejects(
            () => p.submit(baseTask()),
            err => err.code === 'LIVE_TEST_DISABLED'
        );
        const store = new KieFileStorageProvider({ apiKey: API_KEY });
        const dir = tmpDir('guard');
        const img = writeFile(dir, 'a.png');
        await assert.rejects(
            () => store.uploadLocalFile(img),
            err => err.code === 'LIVE_TEST_DISABLED'
        );
    });

    await reporter.test(S_CFG, 'Tier 1: Chuan hoa ma loi HTTP cua Kie (401/402/422/451)', async () => {
        assert.strictEqual(normalizeKieHttpError(401, { msg: 'unauthorized' }).code, 'KIE_AUTH_FAILED');
        assert.strictEqual(normalizeKieHttpError(402, { msg: 'no credit' }).code, 'KIE_INSUFFICIENT_CREDITS');
        assert.strictEqual(normalizeKieHttpError(422, { msg: 'bad param' }).code, 'KIE_INVALID_REQUEST');
        assert.strictEqual(normalizeKieHttpError(451, { msg: 'blocked' }).code, 'KIE_CONTENT_REJECTED');
        assert.strictEqual(normalizeKieHttpError(500, { msg: 'oops' }, 'KIE_PROVIDER_FAILED').code, 'KIE_PROVIDER_FAILED');
    });

    await reporter.test(S_CFG, 'Tier 4: Che do kie KHONG khoi tao BytePlus ModelArk / TOS / LAS', async () => {
        const saved = {
            provider: config.provider,
            queueDbPath: config.queueDbPath,
            kolDbPath: config.kolDbPath,
            uploadsDir: config.uploadsDir,
            outputsDir: config.outputsDir,
            key: process.env.KIE_API_KEY
        };
        const dir = tmpDir('subsystem');
        try {
            config.provider = 'kie';
            process.env.KIE_API_KEY = API_KEY;
            config.queueDbPath = path.join(dir, 'q.json');
            config.kolDbPath = path.join(dir, 'k.json');
            config.uploadsDir = path.join(dir, 'up');
            config.outputsDir = path.join(dir, 'out');

            const { createByteplusSubsystem } = await import('../byteplus/index.js');
            const sub = createByteplusSubsystem();

            assert.strictEqual(sub.provider.constructor.name, 'KieSeedanceProvider');
            assert.strictEqual(sub.tosProvider.constructor.name, 'KieFileStorageProvider');
            assert.strictEqual(sub.assetProvider.constructor.name, 'LocalKolAssetProvider');

            // Khong duoc dinh dang gi den BytePlus
            assert.notStrictEqual(sub.tosProvider.constructor.name, 'BytePlusTosStorageProvider');
            assert.notStrictEqual(sub.assetProvider.constructor.name, 'LasAssetLibraryProvider');
            assert.notStrictEqual(sub.provider.constructor.name, 'BytePlusGenerationProvider');
        } finally {
            Object.assign(config, {
                provider: saved.provider,
                queueDbPath: saved.queueDbPath,
                kolDbPath: saved.kolDbPath,
                uploadsDir: saved.uploadsDir,
                outputsDir: saved.outputsDir
            });
            if (saved.key === undefined) delete process.env.KIE_API_KEY; else process.env.KIE_API_KEY = saved.key;
        }
    });

    await reporter.test(S_CFG, 'Tier 4: Regression — provider BytePlus / OpenRouter van nap duoc lam fallback', async () => {
        const bp = await import('../byteplus/providers/byteplus_generation_provider.js');
        const or = await import('../byteplus/providers/openrouter_seedance_provider.js');
        const tos = await import('../byteplus/storage/tos_provider.js');
        const las = await import('../byteplus/assets/las_asset_provider.js');
        assert.strictEqual(typeof bp.BytePlusGenerationProvider, 'function');
        assert.strictEqual(typeof or.OpenRouterSeedanceProvider, 'function');
        assert.strictEqual(typeof tos.BytePlusTosStorageProvider, 'function');
        assert.strictEqual(typeof las.LasAssetLibraryProvider, 'function');
    });

    // ============ 2. File Upload API ============

    await reporter.test(S_UP, 'Tier 2: Upload anh — dung endpoint file-stream-upload, multipart co file/uploadPath/fileName', async () => {
        const dir = tmpDir('img');
        const img = writeFile(dir, 'maya.png', 'PNGDATA');
        let seen = null;
        const fetchFn = makeFetch(async (url, opts) => {
            seen = { url, form: opts.body, auth: opts.headers.Authorization };
            return uploadOk('maya.png', 'https://tempfile.kie.example/maya.png');
        });

        const store = new KieFileStorageProvider({ apiKey: API_KEY, fetchFn });
        const up = await store.uploadImage(img);

        assert.ok(seen.url.endsWith('/api/file-stream-upload'), 'Sai endpoint: ' + seen.url);
        assert.strictEqual(seen.auth, `Bearer ${API_KEY}`);
        assert.ok(seen.form instanceof FormData);
        assert.strictEqual(seen.form.get('uploadPath'), 'gtf-video-ai/images');
        assert.strictEqual(seen.form.get('fileName'), 'maya.png');
        assert.ok(seen.form.get('file'), 'Thieu truong file trong multipart');

        assert.strictEqual(up.provider, 'kie');
        assert.strictEqual(up.remoteUrl, 'https://tempfile.kie.example/maya.png');
        assert.strictEqual(up.mimeType, 'image/png');
        assert.ok(up.expiresAt, 'Phai co expiresAt de biet khi nao can upload lai');
    });

    await reporter.test(S_UP, 'Tier 2: Upload video — uploadPath tach rieng, tra ve URL tam', async () => {
        const dir = tmpDir('vid');
        const vid = writeFile(dir, 'ref.mp4', 'MP4DATA');
        let uploadPath = null;
        const fetchFn = makeFetch(async (url, opts) => {
            uploadPath = opts.body.get('uploadPath');
            return uploadOk('ref.mp4', 'https://tempfile.kie.example/ref.mp4', { mimeType: 'video/mp4' });
        });
        const store = new KieFileStorageProvider({ apiKey: API_KEY, fetchFn });
        const up = await store.uploadVideo(vid);
        assert.strictEqual(uploadPath, 'gtf-video-ai/videos');
        assert.strictEqual(up.remoteUrl, 'https://tempfile.kie.example/ref.mp4');
        assert.strictEqual(up.mimeType, 'video/mp4');
    });

    await reporter.test(S_UP, 'Tier 2: Upload that bai — HTTP 402 tra ve KIE_INSUFFICIENT_CREDITS', async () => {
        const dir = tmpDir('fail');
        const img = writeFile(dir, 'a.png');
        const fetchFn = makeFetch(async () => jsonResponse({ code: 402, msg: 'Insufficient credits' }, 402));
        const store = new KieFileStorageProvider({ apiKey: API_KEY, fetchFn });
        await assert.rejects(() => store.uploadImage(img), err => err.code === 'KIE_INSUFFICIENT_CREDITS');
    });

    await reporter.test(S_UP, 'Tier 2: Ham isExpired phan biet dung URL con han va het han', async () => {
        assert.strictEqual(isExpired(FUTURE), false);
        assert.strictEqual(isExpired(PAST), true);
        assert.strictEqual(isExpired(null), false, 'Khong co TTL thi khong coi la het han');
    });

    // ============ 3. Sinh video Seedance 2.5 ============

    await reporter.test(S_GEN, 'Tier 3: Prompt-only — request dung model va endpoint createTask, khong co mang tham chieu', async () => {
        let body = null;
        const fetchFn = makeFetch(async (url, opts) => {
            if (url.includes('/jobs/createTask')) {
                body = JSON.parse(opts.body);
                return jsonResponse({ code: 200, msg: 'success', data: { taskId: 'task_kie_1' } });
            }
            throw new Error('URL khong mong doi: ' + url);
        });
        const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn });
        const res = await p.submit(baseTask());

        assert.strictEqual(fetchFn.calls[0].url, 'https://api.kie.ai/api/v1/jobs/createTask');
        assert.strictEqual(body.model, 'bytedance/seedance-2-5');
        assert.strictEqual(body.input.prompt, 'a hero standing on a mountain');
        assert.strictEqual(body.input.duration, 4);
        assert.strictEqual(body.input.resolution, '720p');
        assert.strictEqual(body.input.aspect_ratio, '9:16');
        assert.strictEqual(body.input.reference_image_urls, undefined);
        assert.strictEqual(body.input.reference_video_urls, undefined);
        assert.strictEqual(res.providerTaskId, 'task_kie_1');
        assert.strictEqual(res.providerStatus, 'submitted');
    });

    await reporter.test(S_GEN, 'Tier 3: Anh tham chieu — map vao reference_image_urls', async () => {
        let body = null;
        const fetchFn = makeFetch(async (url, opts) => {
            body = JSON.parse(opts.body);
            return jsonResponse({ code: 200, msg: 'success', data: { taskId: 'task_kie_1' } });
        });
        const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn });
        await p.submit(baseTask({
            references: [{ type: 'image', order: 0, remoteUrl: 'https://tempfile.kie.example/1.png', expiresAt: FUTURE }]
        }));
        assert.deepStrictEqual(body.input.reference_image_urls, ['https://tempfile.kie.example/1.png']);
    });

    await reporter.test(S_GEN, 'Tier 3: Video tham chieu — map vao reference_video_urls', async () => {
        let body = null;
        const fetchFn = makeFetch(async (url, opts) => {
            body = JSON.parse(opts.body);
            return jsonResponse({ code: 200, msg: 'success', data: { taskId: 'task_kie_1' } });
        });
        const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn });
        await p.submit(baseTask({
            references: [{ type: 'video', order: 0, remoteUrl: 'https://tempfile.kie.example/a.mp4', expiresAt: FUTURE }]
        }));
        assert.deepStrictEqual(body.input.reference_video_urls, ['https://tempfile.kie.example/a.mp4']);
        assert.strictEqual(body.input.reference_image_urls, undefined);
    });

    await reporter.test(S_GEN, 'Tier 3: Anh + video + prompt cung luc (multimodal)', async () => {
        let body = null;
        const fetchFn = makeFetch(async (url, opts) => {
            body = JSON.parse(opts.body);
            return jsonResponse({ code: 200, msg: 'success', data: { taskId: 'task_kie_1' } });
        });
        const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn });
        await p.submit(baseTask({
            references: [
                { type: 'image', order: 0, remoteUrl: 'https://tempfile.kie.example/i1.png', expiresAt: FUTURE },
                { type: 'video', order: 1, remoteUrl: 'https://tempfile.kie.example/v1.mp4', expiresAt: FUTURE },
                { type: 'image', order: 2, remoteUrl: 'https://tempfile.kie.example/i2.png', expiresAt: FUTURE }
            ]
        }));
        assert.deepStrictEqual(body.input.reference_image_urls,
            ['https://tempfile.kie.example/i1.png', 'https://tempfile.kie.example/i2.png']);
        assert.deepStrictEqual(body.input.reference_video_urls, ['https://tempfile.kie.example/v1.mp4']);
        assert.ok(body.input.prompt.length > 0);
    });

    await reporter.test(S_GEN, 'Tier 3: Thu tu nhieu anh duoc GIU NGUYEN (Image 1 = nhan vat, Image 2 = boi canh, Image 3 = trang phuc)', async () => {
        let body = null;
        const fetchFn = makeFetch(async (url, opts) => {
            body = JSON.parse(opts.body);
            return jsonResponse({ code: 200, msg: 'success', data: { taskId: 'task_kie_1' } });
        });
        const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn });
        // Co tinh dao lon mang dau vao — order moi la hop dong.
        await p.submit(baseTask({
            references: [
                { type: 'image', order: 2, remoteUrl: 'https://tempfile.kie.example/outfit.png', expiresAt: FUTURE },
                { type: 'image', order: 0, remoteUrl: 'https://tempfile.kie.example/character.png', expiresAt: FUTURE },
                { type: 'image', order: 1, remoteUrl: 'https://tempfile.kie.example/environment.png', expiresAt: FUTURE }
            ]
        }));
        assert.deepStrictEqual(body.input.reference_image_urls, [
            'https://tempfile.kie.example/character.png',
            'https://tempfile.kie.example/environment.png',
            'https://tempfile.kie.example/outfit.png'
        ]);
    });

    await reporter.test(S_GEN, 'Tier 3: Poll — waiting/queuing/generating duoc chuan hoa dung', async () => {
        const states = ['waiting', 'queuing', 'generating'];
        for (const st of states) {
            const fetchFn = makeFetch(async () => recordInfo(st, { progress: 45 }));
            const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn });
            const r = await p.poll('task_kie_1');
            if (st === 'generating') {
                assert.strictEqual(r.providerStatus, 'running');
                assert.strictEqual(r.progress, 45);
            } else {
                assert.strictEqual(r.providerStatus, 'queued');
            }
            assert.ok(fetchFn.calls[0].url.includes('/api/v1/jobs/recordInfo?taskId=task_kie_1'));
            assert.strictEqual(fetchFn.calls[0].method, 'GET');
        }
    });

    await reporter.test(S_GEN, 'Tier 3: Ket qua hoan thanh — doc resultUrls tu chuoi resultJson', async () => {
        const fetchFn = makeFetch(async () => SUCCESS_RECORD());
        const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn });
        const r = await p.poll('task_kie_1');
        assert.strictEqual(r.providerStatus, 'succeeded');
        assert.strictEqual(r.outputUrl, 'https://cdn.kie.example/out.mp4');
        assert.strictEqual(r.billing.creditsConsumed, 50);
        assert.strictEqual(r.billing.costTimeMs, 15000);
    });

    await reporter.test(S_GEN, 'Tier 3: Provider bao fail — chuan hoa thanh KIE_PROVIDER_FAILED', async () => {
        const fetchFn = makeFetch(async () => recordInfo('fail', { failCode: '501', failMsg: 'generation failed internally' }));
        const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn });
        const r = await p.poll('task_kie_1');
        assert.strictEqual(r.providerStatus, 'failed');
        assert.strictEqual(r.error.code, 'KIE_PROVIDER_FAILED');

        await assert.rejects(
            () => p.waitForCompletion('task_kie_1', { pollIntervalMs: 1 }),
            err => err.code === 'KIE_PROVIDER_FAILED'
        );
    });

    await reporter.test(S_GEN, 'Tier 3: Kiem duyet noi dung — chuan hoa thanh KIE_CONTENT_REJECTED, khong tu dong sinh lai', async () => {
        assert.strictEqual(
            normalizeKieFailure('InputImageSensitiveContentDetected.PrivacyInformation', 'may contain real person').code,
            'KIE_CONTENT_REJECTED'
        );
        const fetchFn = makeFetch(async () => recordInfo('fail', {
            failCode: 'InputImageSensitiveContentDetected.PrivacyInformation',
            failMsg: 'The request failed because the input image may contain real person.'
        }));
        const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn });
        await assert.rejects(
            () => p.waitForCompletion('task_kie_1', { pollIntervalMs: 1 }),
            err => err.code === 'KIE_CONTENT_REJECTED'
        );
        // Chi co GET, khong he co POST sinh lai.
        assert.strictEqual(fetchFn.countPost('createTask'), 0);
    });

    await reporter.test(S_GEN, 'Tier 3: Het credit luc submit — HTTP 402 thanh KIE_INSUFFICIENT_CREDITS', async () => {
        const fetchFn = makeFetch(async () => jsonResponse({ code: 402, msg: 'Insufficient credits' }, 402));
        const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn });
        await assert.rejects(() => p.submit(baseTask()), err => err.code === 'KIE_INSUFFICIENT_CREDITS');
    });

    await reporter.test(S_GEN, 'Tier 3: So du credit doc duoc tu /api/v1/chat/credit, khong lo API key', async () => {
        const fetchFn = makeFetch(async (url) => {
            assert.ok(url.endsWith('/api/v1/chat/credit'));
            return jsonResponse({ code: 200, msg: 'success', data: 1234 });
        });
        const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn });
        assert.strictEqual(await p.getRemainingCredits(), 1234);
    });

    await reporter.test(S_GEN, 'Tier 3: Download luu dung buffer MP4 ve duong dan cuc bo', async () => {
        const dir = tmpDir('dl');
        const dest = path.join(dir, 'out.mp4');
        const fetchFn = makeFetch(async () => binaryResponse(MP4));
        const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn });
        const r = await p.download('task_kie_1', dest, { outputUrl: 'https://cdn.kie.example/out.mp4' });
        assert.strictEqual(r.bytes, MP4.length);
        assert.ok(fs.existsSync(dest));
        assert.strictEqual(fs.readFileSync(dest).toString('hex'), MP4.toString('hex'));
    });

    // ============ 4. Tham chieu, KOL, queue, recovery ============

    await reporter.test(S_QUEUE, 'Tier 3: Tham chieu KOL dung file goc cuc bo — KHONG can LAS, khong can asset://', async () => {
        const dir = tmpDir('kol');
        const face = writeFile(dir, 'maya.png', 'FACE');
        const fetchFn = makeFetch(async () => uploadOk('maya.png', 'https://tempfile.kie.example/maya.png'));

        const rm = new ReferenceManager({
            tosProvider: new KieFileStorageProvider({ apiKey: API_KEY, fetchFn }),
            assetProvider: new LocalKolAssetProvider(),
            kolLibrary: { get: () => ({ id: 'kol_1', displayName: 'Maya', files: [face] }) }
        });

        const task = baseTask({
            references: [{ id: 'ref_kol_1', type: 'kol', kolId: 'kol_1', displayName: 'Maya', assetId: 'local_asset_abc' }]
        });
        await rm.preflight(task);
        const prepared = await rm.prepare(task);

        assert.strictEqual(prepared[0].remoteUrl, 'https://tempfile.kie.example/maya.png');
        assert.strictEqual(prepared[0].kolSourcePath, face);
        assert.strictEqual(prepared[0].assetUri, null, 'KOL khong duoc phu thuoc asset:// cua LAS');
        assert.strictEqual(prepared[0].storageProvider, 'kie');
    });

    await reporter.test(S_QUEUE, 'Tier 3: URL Kie con han thi TAI SU DUNG, het han thi TU DONG UPLOAD LAI', async () => {
        const dir = tmpDir('expiry');
        const img = writeFile(dir, 'a.png', 'A');
        let uploads = 0;
        const fetchFn = makeFetch(async () => {
            uploads++;
            return uploadOk('a.png', 'https://tempfile.kie.example/fresh.png');
        });
        const rm = new ReferenceManager({
            tosProvider: new KieFileStorageProvider({ apiKey: API_KEY, fetchFn }),
            assetProvider: new LocalKolAssetProvider()
        });

        // Con han -> khong upload lai
        const alive = await rm.prepare(baseTask({
            references: [{
                id: 'r1', type: 'image', localPath: img, originalName: 'a.png',
                storageProvider: 'kie', remoteObjectKey: 'k1',
                remoteUrl: 'https://tempfile.kie.example/old.png', expiresAt: FUTURE
            }]
        }));
        assert.strictEqual(uploads, 0, 'URL con han thi khong duoc upload lai');
        assert.strictEqual(alive[0].remoteUrl, 'https://tempfile.kie.example/old.png');

        // Het han -> upload lai tu file goc
        const expired = await rm.prepare(baseTask({
            references: [{
                id: 'r1', type: 'image', localPath: img, originalName: 'a.png',
                storageProvider: 'kie', remoteObjectKey: 'k1',
                remoteUrl: 'https://tempfile.kie.example/old.png', expiresAt: PAST
            }]
        }));
        assert.strictEqual(uploads, 1, 'URL het han thi phai upload lai dung 1 lan');
        assert.strictEqual(expired[0].remoteUrl, 'https://tempfile.kie.example/fresh.png');
    });

    await reporter.test(S_QUEUE, 'Tier 3: Preflight chan tham chieu het han bang KIE_REFERENCE_EXPIRED', async () => {
        const p = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn: makeFetch(async () => jsonResponse({})) });
        await assert.rejects(
            () => p.submit(baseTask({
                references: [{ type: 'image', order: 0, remoteUrl: 'https://tempfile.kie.example/a.png', expiresAt: PAST }]
            })),
            err => err.code === 'KIE_REFERENCE_EXPIRED'
        );
        await assert.rejects(
            () => p.submit(baseTask({
                references: [{ type: 'image', order: 0, localPath: 'C:/local/a.png' }]
            })),
            err => err.code === 'KIE_REFERENCE_UNAVAILABLE'
        );
    });

    await reporter.test(S_QUEUE, 'Tier 4: E2E queue — tao task, submit, poll, download, luu billing that tu provider', async () => {
        const dir = tmpDir('e2e');
        const savedOut = config.outputsDir;
        const savedConc = config.maxConcurrency;
        try {
            config.outputsDir = path.join(dir, 'out');
            config.maxConcurrency = 2;

            const fetchFn = makeFetch(async (url) => {
                if (url.includes('/jobs/createTask')) return jsonResponse({ code: 200, msg: 'success', data: { taskId: 'task_kie_1' } });
                if (url.includes('/jobs/recordInfo')) return SUCCESS_RECORD();
                return binaryResponse(MP4);
            });

            const provider = new KieSeedanceProvider({ apiKey: API_KEY, fetchFn, pollIntervalMs: 1 });
            const assetProvider = new LocalKolAssetProvider();
            const kols = new KolLibrary({ assetProvider, dbPath: path.join(dir, 'k.json') });
            const queue = new ByteplusQueueManager({
                provider,
                tosProvider: new KieFileStorageProvider({ apiKey: API_KEY, fetchFn }),
                assetProvider,
                kolLibrary: kols,
                dbPath: path.join(dir, 'q.json')
            });

            const task = queue.add({ creator: 'Tinh', taskName: 'Hero', prompt: 'hero on a mountain', duration: 4, resolution: '720p' });
            await new Promise(r => setTimeout(r, 400));

            const done = queue.find(task.id);
            assert.strictEqual(done.status, 'completed', 'Task phai hoan thanh, loi: ' + JSON.stringify(done.error));
            assert.strictEqual(done.providerTaskId, 'task_kie_1');
            assert.strictEqual(done.submitCount, 1);
            assert.ok(fs.existsSync(done.localOutputPath));
            assert.strictEqual(done.billing.creditsConsumed, 50);
            assert.strictEqual(done.billing.provider, 'kie');
            assert.ok(!JSON.stringify(done).includes(API_KEY), 'Task JSON KHONG duoc chua API key');
        } finally {
            config.outputsDir = savedOut;
            config.maxConcurrency = savedConc;
        }
    });

    await reporter.test(S_QUEUE, 'Tier 4: providerTaskId duoc luu ngay — restart chi resume, KHONG BAO GIO submit lai', async () => {
        const dir = tmpDir('recover');
        const dbPath = path.join(dir, 'q.json');
        const savedOut = config.outputsDir;
        try {
            config.outputsDir = path.join(dir, 'out');

            // Mo phong DB sau khi server chet giua luc render.
            fs.writeFileSync(dbPath, JSON.stringify({
                tasks: [{
                    id: 'bp_restart_1', creator: 'Tinh', taskName: 'Hero', prompt: 'x',
                    references: [], duration: 4, resolution: '720p', aspectRatio: '9:16',
                    status: 'running', pipelineStage: 'Generating', progress: 60,
                    provider: 'kie', providerTaskId: 'task_kie_1', providerStatus: 'running',
                    submitCount: 1, attempts: 1, maxRetries: 2,
                    outputUrl: null, localOutputPath: null, outputWebPath: null, error: null,
                    createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), completedAt: null
                }],
                control: { running: true, paused: false }
            }));

            const fetchFn = makeFetch(async (url) => {
                if (url.includes('/jobs/recordInfo')) return SUCCESS_RECORD();
                if (url.includes('/jobs/createTask')) throw new Error('KHONG DUOC PHEP submit lai!');
                return binaryResponse(MP4);
            });

            const assetProvider = new LocalKolAssetProvider();
            const queue = new ByteplusQueueManager({
                provider: new KieSeedanceProvider({ apiKey: API_KEY, fetchFn, pollIntervalMs: 1 }),
                tosProvider: new KieFileStorageProvider({ apiKey: API_KEY, fetchFn }),
                assetProvider,
                kolLibrary: new KolLibrary({ assetProvider, dbPath: path.join(dir, 'k.json') }),
                dbPath
            });

            const notes = queue.recover();
            assert.strictEqual(notes[0].action, 'resume');
            assert.strictEqual(notes[0].providerTaskId, 'task_kie_1');

            queue.resumeRecovered();
            await new Promise(r => setTimeout(r, 300));

            const t = queue.find('bp_restart_1');
            assert.strictEqual(t.status, 'completed');
            assert.strictEqual(t.submitCount, 1, 'submitCount phai giu nguyen 1 — khong sinh trung');
            assert.strictEqual(fetchFn.countPost('createTask'), 0, 'Tuyet doi khong POST createTask khi resume');
        } finally {
            config.outputsDir = savedOut;
        }
    });

    await reporter.test(S_QUEUE, 'Tier 4: Retry sau khi download loi — chi tai lai MP4, KHONG sinh lai video', async () => {
        const dir = tmpDir('dlretry');
        const savedOut = config.outputsDir;
        try {
            config.outputsDir = path.join(dir, 'out');

            let failDownload = true;
            const fetchFn = makeFetch(async (url) => {
                if (url.includes('/jobs/createTask')) return jsonResponse({ code: 200, msg: 'success', data: { taskId: 'task_kie_1' } });
                if (url.includes('/jobs/recordInfo')) return SUCCESS_RECORD();
                if (failDownload) return binaryResponse(Buffer.alloc(0), 500);
                return binaryResponse(MP4);
            });

            const assetProvider = new LocalKolAssetProvider();
            const queue = new ByteplusQueueManager({
                provider: new KieSeedanceProvider({ apiKey: API_KEY, fetchFn, pollIntervalMs: 1 }),
                tosProvider: new KieFileStorageProvider({ apiKey: API_KEY, fetchFn }),
                assetProvider,
                kolLibrary: new KolLibrary({ assetProvider, dbPath: path.join(dir, 'k.json') }),
                dbPath: path.join(dir, 'q.json')
            });

            const task = queue.add({ creator: 'Tinh', taskName: 'Hero', prompt: 'hero', duration: 4, resolution: '720p' });
            await new Promise(r => setTimeout(r, 300));

            let t = queue.find(task.id);
            assert.strictEqual(t.status, 'failed');
            assert.strictEqual(t.error.code, 'KIE_DOWNLOAD_FAILED');
            assert.strictEqual(t.providerTaskId, 'task_kie_1', 'Phai GIU providerTaskId de retry khong ton tien');
            assert.strictEqual(t.outputUrl, 'https://cdn.kie.example/out.mp4', 'Phai GIU outputUrl');

            const submitsBefore = fetchFn.countPost('createTask');
            failDownload = false;
            queue.retry(task.id);
            await new Promise(r => setTimeout(r, 300));

            t = queue.find(task.id);
            assert.strictEqual(t.status, 'completed');
            assert.strictEqual(t.submitCount, 1, 'Retry download KHONG duoc lam tang submitCount');
            assert.strictEqual(fetchFn.countPost('createTask'), submitsBefore, 'Retry download KHONG duoc POST createTask lan nua');
            assert.ok(fs.existsSync(t.localOutputPath));
        } finally {
            config.outputsDir = savedOut;
        }
    });

    await reporter.test(S_QUEUE, 'Tier 4: Regression — provider=kie, all BYTEPLUS_TOS_* & BYTEPLUS_LAS_* empty, task with image reference completes without BYTEPLUS_TOS_NOT_CONFIGURED', async () => {
        const savedEnv = { ...process.env };
        const savedCfg = {
            provider: config.provider,
            queueDbPath: config.queueDbPath,
            kolDbPath: config.kolDbPath,
            uploadsDir: config.uploadsDir,
            outputsDir: config.outputsDir
        };
        const dir = tmpDir('reg-kie-only');
        try {
            // Xoa sach cac bien moi truong BytePlus TOS va LAS
            for (const key of Object.keys(process.env)) {
                if (key.startsWith('BYTEPLUS_TOS_') || key.startsWith('BYTEPLUS_LAS_') || key.startsWith('BYTEPLUS_')) {
                    delete process.env[key];
                }
            }
            process.env.GTF_VIDEO_PROVIDER = 'kie';
            process.env.KIE_API_KEY = API_KEY;
            config.provider = 'kie';
            config.queueDbPath = path.join(dir, 'q.json');
            config.kolDbPath = path.join(dir, 'k.json');
            config.uploadsDir = path.join(dir, 'up');
            config.outputsDir = path.join(dir, 'out');

            const testImg = writeFile(dir, 'ref_test.png', 'DUMMY_IMAGE_DATA');

            let uploadCalled = false;
            let createTaskPayload = null;
            const fetchFn = makeFetch(async (url, opts) => {
                if (url.includes('file-stream-upload')) {
                    uploadCalled = true;
                    return uploadOk('ref_test.png', 'https://tempfile.kie.example/ref_test.png');
                }
                if (url.includes('/jobs/createTask')) {
                    createTaskPayload = JSON.parse(opts.body);
                    return jsonResponse({ code: 200, msg: 'success', data: { taskId: 'task_kie_reg_99' } });
                }
                if (url.includes('/jobs/recordInfo')) return SUCCESS_RECORD();
                return binaryResponse(MP4);
            });

            const { createByteplusSubsystem } = await import('../byteplus/index.js');
            const sub = createByteplusSubsystem({
                provider: new KieSeedanceProvider({ apiKey: API_KEY, fetchFn, pollIntervalMs: 1 }),
                tosProvider: new KieFileStorageProvider({ apiKey: API_KEY, fetchFn }),
                assetProvider: new LocalKolAssetProvider()
            });

            // Verify subsystem: khong khoi tao bat ky BytePlus provider nao
            assert.strictEqual(sub.provider.constructor.name, 'KieSeedanceProvider');
            assert.strictEqual(sub.tosProvider.constructor.name, 'KieFileStorageProvider');
            assert.strictEqual(sub.assetProvider.constructor.name, 'LocalKolAssetProvider');

            const task = sub.queue.add({
                creator: 'Tinh',
                taskName: 'KIE Only Flow Test',
                prompt: 'a scenic landscape',
                duration: 4,
                resolution: '720p',
                references: [{
                    type: 'image',
                    localPath: testImg,
                    originalName: 'ref_test.png'
                }]
            });

            // Doi hang cho xu ly xong
            await new Promise(r => setTimeout(r, 350));

            const finished = sub.queue.find(task.id);
            assert.strictEqual(finished.status, 'completed', 'Task phai hoan thanh thanh cong o che do KIE-only');
            assert.strictEqual(finished.error, null);
            assert.strictEqual(uploadCalled, true, 'File anh phai duoc upload qua Kie File Storage Provider');
            assert.ok(createTaskPayload, 'createTask phai duoc goi voi payload');
            assert.deepStrictEqual(createTaskPayload.input.reference_image_urls, ['https://tempfile.kie.example/ref_test.png']);

            // Verify neu storage chua cau hinh (KIE_API_KEY rong):
            // ReferenceManager phai nem KIE_UPLOAD_NOT_CONFIGURED chu KHONG BAO GIO nem BYTEPLUS_TOS_NOT_CONFIGURED.
            const unconfiguredRefMgr = new ReferenceManager({
                tosProvider: new KieFileStorageProvider({ apiKey: '' }),
                assetProvider: new LocalKolAssetProvider()
            });
            await assert.rejects(
                () => unconfiguredRefMgr.preflight(task),
                err => {
                    assert.strictEqual(err.code, 'KIE_UPLOAD_NOT_CONFIGURED');
                    assert.notStrictEqual(err.code, 'BYTEPLUS_TOS_NOT_CONFIGURED');
                    return true;
                }
            );
        } finally {
            Object.assign(config, savedCfg);
            process.env = savedEnv;
        }
    });
}

export default runKieTests;
