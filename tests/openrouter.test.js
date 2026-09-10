/**
 * tests/openrouter.test.js
 *
 * Bộ kiểm thử toàn diện cho OpenRouter Seedance 2.5 Provider (GTF Video AI Studio V2).
 * Tuyệt đối KHÔNG gọi mạng thật (100% mocked HTTP qua fetchFn).
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeSandbox(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtfv2_or_' + name + '_'));
    const uploadsDir = path.join(dir, 'uploads');
    const outputsDir = path.join(dir, 'outputs');
    const dbPath = path.join(dir, 'queue.json');
    const kolDbPath = path.join(dir, 'kols.json');
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.mkdirSync(outputsDir, { recursive: true });
    return {
        dir, uploadsDir, outputsDir, dbPath, kolDbPath,
        cleanup() {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
        }
    };
}

export async function runOpenRouterTests(reporter) {
    const S = 'GTF Video AI Automation V2 (OpenRouter Provider)';

    // ── Tier 1: Khởi tạo, Cấu hình & Preflight Validation ─────────────
    await reporter.test(S, 'Tier 1: Provider selection - config nhan openrouter khi GTF_VIDEO_PROVIDER=openrouter', async () => {
        const orig = process.env.GTF_VIDEO_PROVIDER;
        try {
            process.env.GTF_VIDEO_PROVIDER = 'openrouter';
            // dynamic import để kiểm tra hàm resolve
            const { config, providerStatus } = await import('../byteplus/config.js');
            assert.strictEqual(config.openrouter.model, 'bytedance/seedance-2.5');
            assert.strictEqual(config.openrouter.baseUrl, 'https://openrouter.ai/api/v1');
            const status = providerStatus();
            assert.strictEqual(status.openrouter.name, 'OpenRouter Seedance 2.5');
            assert.strictEqual(status.openrouter.model, 'bytedance/seedance-2.5');
        } finally {
            if (orig !== undefined) process.env.GTF_VIDEO_PROVIDER = orig;
            else delete process.env.GTF_VIDEO_PROVIDER;
        }
    });

    await reporter.test(S, 'Tier 1: Preflight nem OPENROUTER_API_KEY_MISSING khi thieu API key', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        const provider = new OpenRouterSeedanceProvider({ apiKey: '' });
        assert.strictEqual(provider.isConfigured(), false);
        assert.throws(() => {
            provider.validatePreflight({ prompt: 'Test video prompt' });
        }, err => {
            assert.strictEqual(err.code, 'OPENROUTER_API_KEY_MISSING');
            return true;
        });
    });

    await reporter.test(S, 'Tier 1: Preflight nem OPENROUTER_IMAGE_REFERENCE_UNAVAILABLE khi anh tham chieu thieu URL hop le', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        const provider = new OpenRouterSeedanceProvider({ apiKey: 'sk-or-test-key' });

        // Thiếu remoteUrl
        assert.throws(() => {
            provider.validatePreflight({
                prompt: 'Test prompt',
                references: [{ id: 'ref_1', type: 'image', originalName: 'cat.jpg', localPath: 'C:\\fake\\cat.jpg' }]
            });
        }, err => {
            assert.strictEqual(err.code, 'OPENROUTER_IMAGE_REFERENCE_UNAVAILABLE');
            return true;
        });

        // URL không phải HTTPS công khai
        assert.throws(() => {
            provider.validatePreflight({
                prompt: 'Test prompt',
                references: [{ id: 'ref_1', type: 'image', remoteUrl: 'http://localhost:3000/image.jpg' }]
            });
        }, err => {
            assert.strictEqual(err.code, 'OPENROUTER_IMAGE_REFERENCE_UNAVAILABLE');
            return true;
        });
    });

    await reporter.test(S, 'Tier 1: Preflight nem OPENROUTER_VIDEO_REFERENCE_UNAVAILABLE khi video tham chieu thieu URL hop le', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        const provider = new OpenRouterSeedanceProvider({ apiKey: 'sk-or-test-key' });

        assert.throws(() => {
            provider.validatePreflight({
                prompt: 'Test prompt',
                references: [{ id: 'ref_v1', type: 'video', originalName: 'clip.mp4' }]
            });
        }, err => {
            assert.strictEqual(err.code, 'OPENROUTER_VIDEO_REFERENCE_UNAVAILABLE');
            return true;
        });
    });

    await reporter.test(S, 'Tier 1: buildRequestBody map dung duration, aspect_ratio, resolution va prompt', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        const provider = new OpenRouterSeedanceProvider({ apiKey: 'sk-or-test-key' });

        const task = {
            prompt: 'A majestic cat standing on Mount Fuji at sunset',
            duration: 4,
            aspectRatio: '16:9',
            resolution: '720p',
            references: []
        };

        const body = provider.buildRequestBody(task);
        assert.strictEqual(body.model, 'bytedance/seedance-2.5');
        assert.strictEqual(body.prompt, 'A majestic cat standing on Mount Fuji at sunset');
        assert.strictEqual(body.duration, 4);
        assert.strictEqual(body.aspect_ratio, '16:9');
        assert.strictEqual(body.resolution, '720p');
        assert.strictEqual(body.input_references, undefined);
    });

    // ── Tier 2: Dựng Request Submit & Xử lý Polling ────────────────────
    await reporter.test(S, 'Tier 2: Submit gui POST dung endpoint, headers Authorization Bearer va body JSON', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        let captured = null;

        const mockFetch = async (url, opts) => {
            captured = { url, method: opts.method, headers: opts.headers, body: JSON.parse(opts.body) };
            return {
                ok: true,
                status: 200,
                json: async () => ({ id: 'or-task-123456', status: 'pending' })
            };
        };

        const provider = new OpenRouterSeedanceProvider({
            apiKey: 'sk-or-v1-secret-key-xyz',
            baseUrl: 'https://openrouter.ai/api/v1',
            fetchFn: mockFetch
        });

        const task = {
            id: 'bp_task_1',
            prompt: 'A cinematic drone shot over Mount Fuji',
            duration: 5,
            aspectRatio: '9:16',
            resolution: '480p'
        };

        const res = await provider.submit(task);
        assert.strictEqual(captured.url, 'https://openrouter.ai/api/v1/videos');
        assert.strictEqual(captured.method, 'POST');
        assert.strictEqual(captured.headers['Content-Type'], 'application/json');
        assert.strictEqual(captured.headers['Authorization'], 'Bearer sk-or-v1-secret-key-xyz');
        assert.strictEqual(captured.body.model, 'bytedance/seedance-2.5');
        assert.strictEqual(captured.body.prompt, 'A cinematic drone shot over Mount Fuji');
        assert.strictEqual(captured.body.duration, 5);
        assert.strictEqual(captured.body.aspect_ratio, '9:16');
        assert.strictEqual(captured.body.resolution, '480p');
        assert.strictEqual(res.providerTaskId, 'or-task-123456');
        assert.strictEqual(res.providerStatus, 'submitted');
    });

    await reporter.test(S, 'Tier 2: Submit voi anh tham chieu tu TOS chuyen thanh input_references', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        let capturedBody = null;

        const mockFetch = async (url, opts) => {
            capturedBody = JSON.parse(opts.body);
            return {
                ok: true,
                status: 200,
                json: async () => ({ id: 'or-task-img-ref', status: 'pending' })
            };
        };

        const provider = new OpenRouterSeedanceProvider({
            apiKey: 'sk-or-test-key',
            fetchFn: mockFetch
        });

        const task = {
            id: 'bp_task_2',
            prompt: 'Hero standing on cliff',
            duration: 4,
            aspectRatio: '9:16',
            resolution: '480p',
            references: [
                {
                    id: 'ref_img_1',
                    type: 'image',
                    remoteUrl: 'https://gtf-video-reference.tos-ap-southeast-1.bytepluses.com/gtf-video-ai/images/hero.jpg?X-Tos-Expires=3600'
                }
            ]
        };

        const res = await provider.submit(task);
        assert.strictEqual(res.providerTaskId, 'or-task-img-ref');
        assert.ok(Array.isArray(capturedBody.input_references));
        assert.strictEqual(capturedBody.input_references.length, 1);
        assert.strictEqual(capturedBody.input_references[0].type, 'image_url');
        assert.strictEqual(capturedBody.input_references[0].image_url.url, task.references[0].remoteUrl);
    });

    await reporter.test(S, 'Tier 2: Submit voi video tham chieu va anh tham chieu dong thoi', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        let capturedBody = null;

        const mockFetch = async (url, opts) => {
            capturedBody = JSON.parse(opts.body);
            return {
                ok: true,
                status: 200,
                json: async () => ({ id: 'or-task-multi-ref', status: 'pending' })
            };
        };

        const provider = new OpenRouterSeedanceProvider({
            apiKey: 'sk-or-test-key',
            fetchFn: mockFetch
        });

        const task = {
            id: 'bp_task_3',
            prompt: 'Multi ref scene',
            duration: 4,
            aspectRatio: '16:9',
            resolution: '720p',
            references: [
                {
                    id: 'ref_img_1',
                    type: 'image',
                    remoteUrl: 'https://gtf-video-reference.tos-ap-southeast-1.bytepluses.com/character.jpg'
                },
                {
                    id: 'ref_vid_1',
                    type: 'video',
                    remoteUrl: 'https://gtf-video-reference.tos-ap-southeast-1.bytepluses.com/action.mp4'
                }
            ]
        };

        const res = await provider.submit(task);
        assert.strictEqual(res.providerTaskId, 'or-task-multi-ref');
        assert.strictEqual(capturedBody.input_references.length, 2);
        assert.strictEqual(capturedBody.input_references[0].type, 'image_url');
        assert.strictEqual(capturedBody.input_references[1].type, 'video_url');
    });

    await reporter.test(S, 'Tier 2: Xu ly cac trang thai poll (queued, running, succeeded, failed)', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        const makeProvider = statusResponse => new OpenRouterSeedanceProvider({
            apiKey: 'sk-or-test-key',
            fetchFn: async () => ({ ok: true, status: 200, json: async () => statusResponse })
        });

        // Queued / Pending
        let p = makeProvider({ id: 'or-1', status: 'queued' });
        let r = await p.poll('or-1');
        assert.strictEqual(r.providerStatus, 'queued');
        assert.strictEqual(r.stage, 'Queued');
        assert.strictEqual(r.progress, 25);

        // Running / In progress
        p = makeProvider({ id: 'or-2', status: 'in_progress', progress: 65 });
        r = await p.poll('or-2');
        assert.strictEqual(r.providerStatus, 'running');
        assert.strictEqual(r.stage, 'Generating');
        assert.strictEqual(r.progress, 65);

        // Succeeded / Completed
        p = makeProvider({ id: 'or-3', status: 'completed', video_url: 'https://openrouter.ai/files/out.mp4' });
        r = await p.poll('or-3');
        assert.strictEqual(r.providerStatus, 'succeeded');
        assert.strictEqual(r.outputUrl, 'https://openrouter.ai/files/out.mp4');
        assert.strictEqual(r.stage, 'Downloading');
        assert.strictEqual(r.progress, 95);

        // Failed
        p = makeProvider({ id: 'or-4', status: 'failed', error: { code: 'CONTENT_FILTERED', message: 'Prompt violated safety guidelines' } });
        r = await p.poll('or-4');
        assert.strictEqual(r.providerStatus, 'failed');
        assert.strictEqual(r.error.code, 'CONTENT_FILTERED');
        assert.strictEqual(r.error.message, 'Prompt violated safety guidelines');
    });

    // ── Tier 3: Recovery, Polling Loop & Download ──────────────────────
    await reporter.test(S, 'Tier 3: waitForCompletion lap poll va phat tien do onProgress', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        let step = 0;
        const mockFetch = async () => {
            step++;
            if (step === 1) return { ok: true, json: async () => ({ id: 'or-loop', status: 'pending' }) };
            if (step === 2) return { ok: true, json: async () => ({ id: 'or-loop', status: 'in_progress', progress: 50 }) };
            return { ok: true, json: async () => ({ id: 'or-loop', status: 'completed', output_url: 'https://openrouter.ai/video_final.mp4' }) };
        };

        const provider = new OpenRouterSeedanceProvider({
            apiKey: 'sk-or-test-key',
            pollIntervalMs: 5,
            pollTimeoutMs: 2000,
            fetchFn: mockFetch
        });

        const stages = [];
        const result = await provider.waitForCompletion('or-loop', {
            onProgress: p => stages.push(p.providerStatus)
        });
        assert.strictEqual(result.providerStatus, 'succeeded');
        assert.strictEqual(result.outputUrl, 'https://openrouter.ai/video_final.mp4');
        assert.deepStrictEqual(stages, ['queued', 'running', 'succeeded']);
    });

    await reporter.test(S, 'Tier 3: resume chi noi lai job bang GET, TUYET DOI KHONG goi POST', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        let postCalled = false;
        let getCalled = false;

        const mockFetch = async (url, opts) => {
            if (opts && opts.method === 'POST') postCalled = true;
            if (opts && opts.method === 'GET') getCalled = true;
            return {
                ok: true,
                status: 200,
                json: async () => ({ id: 'or-resumed-job', status: 'completed', video_url: 'https://cdn.example.com/resumed.mp4' })
            };
        };

        const provider = new OpenRouterSeedanceProvider({
            apiKey: 'sk-or-test-key',
            pollIntervalMs: 5,
            fetchFn: mockFetch
        });

        const resumed = await provider.resume('or-resumed-job');
        assert.strictEqual(resumed.providerStatus, 'succeeded');
        assert.strictEqual(postCalled, false, 'resume khong bao gio duoc phep goi POST');
        assert.strictEqual(getCalled, true, 'resume bat buoc phai goi GET poll');
    });

    await reporter.test(S, 'Tier 3: download luu dung buffer MP4 ve duong dan cuc bo', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        const sb = makeSandbox('download_test');
        try {
            const mockFetch = async () => ({
                ok: true,
                status: 200,
                arrayBuffer: async () => Buffer.from('FAKE_MP4_VIDEO_BYTES_1234567890')
            });

            const provider = new OpenRouterSeedanceProvider({
                apiKey: 'sk-or-test-key',
                fetchFn: mockFetch
            });

            const targetFile = path.join(sb.outputsDir, 'test_output.mp4');
            const dl = await provider.download('or-job-dl', targetFile, {
                outputUrl: 'https://openrouter.ai/download/out.mp4'
            });

            assert.strictEqual(dl.localPath, targetFile);
            assert.ok(fs.existsSync(targetFile));
            const content = fs.readFileSync(targetFile, 'utf8');
            assert.strictEqual(content, 'FAKE_MP4_VIDEO_BYTES_1234567890');
        } finally {
            sb.cleanup();
        }
    });

    await reporter.test(S, 'Tier 3: Error handling - API tra ve HTTP 401 Unauthorized nem PROVIDER_SUBMIT_FAILED', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        const mockFetch = async () => ({
            ok: false,
            status: 401,
            json: async () => ({ error: { code: 'INVALID_API_KEY', message: 'User key is invalid or revoked' } })
        });

        const provider = new OpenRouterSeedanceProvider({
            apiKey: 'sk-invalid-key',
            fetchFn: mockFetch
        });

        await assert.rejects(async () => {
            await provider.submit({ prompt: 'Test video' });
        }, err => {
            assert.strictEqual(err.code, 'INVALID_API_KEY');
            assert.ok(err.message.includes('User key is invalid'));
            return true;
        });
    });

    // ── Tier 4: Queue Manager Integration, Recovery & Secret Safety ───
    await reporter.test(S, 'Tier 4: E2E Queue Manager voi OpenRouter Provider - chay thanh cong tu tao task den download', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        const { MockTosProvider } = await import('../byteplus/storage/mock_tos_provider.js');
        const { MockLasAssetProvider } = await import('../byteplus/assets/mock_las_provider.js');
        const { KolLibrary } = await import('../byteplus/kol_library.js');
        const { ByteplusQueueManager } = await import('../byteplus/queue_manager.js');

        const sb = makeSandbox('e2e_openrouter');
        try {
            let submitCalled = false;
            let pollCalled = false;
            let downloadCalled = false;

            const mockFetch = async (url, opts) => {
                if (opts && opts.method === 'POST') {
                    submitCalled = true;
                    return { ok: true, json: async () => ({ id: 'or-e2e-1', status: 'pending' }) };
                }
                if (opts && opts.method === 'GET') {
                    pollCalled = true;
                    return { ok: true, json: async () => ({ id: 'or-e2e-1', status: 'completed', output_url: 'https://openrouter.ai/e2e.mp4' }) };
                }
                // download GET
                downloadCalled = true;
                return {
                    ok: true,
                    arrayBuffer: async () => Buffer.from('FAKE_COMPLETED_VIDEO')
                };
            };

            const provider = new OpenRouterSeedanceProvider({
                apiKey: 'sk-or-e2e-key',
                pollIntervalMs: 5,
                fetchFn: mockFetch
            });
            const tosProvider = new MockTosProvider();
            const assetProvider = new MockLasAssetProvider();
            const kols = new KolLibrary({ assetProvider, dbPath: sb.kolDbPath });
            const queue = new ByteplusQueueManager({
                provider,
                tosProvider,
                assetProvider,
                kolLibrary: kols,
                dbPath: sb.dbPath
            });

            // Ghi đè thư mục xuất ra
            const { config } = await import('../byteplus/config.js');
            const origOutputs = config.outputsDir;
            config.outputsDir = sb.outputsDir;

            try {
                const task = queue.add({
                    creator: 'Tester',
                    taskName: 'OpenRouter E2E',
                    prompt: 'A majestic eagle flying across mountains',
                    duration: 4,
                    aspectRatio: '9:16',
                    resolution: '480p'
                });

                // Chờ task hoàn thành
                const t0 = Date.now();
                while (task.status !== 'completed' && task.status !== 'failed') {
                    if (Date.now() - t0 > 3000) throw new Error('Timeout cho task E2E');
                    await new Promise(r => setTimeout(r, 20));
                }

                assert.strictEqual(task.status, 'completed');
                assert.strictEqual(task.providerStatus, 'succeeded');
                assert.strictEqual(task.providerTaskId, 'or-e2e-1');
                assert.strictEqual(task.submitCount, 1);
                assert.ok(task.localOutputPath && fs.existsSync(task.localOutputPath));
                assert.strictEqual(submitCalled, true);
                assert.strictEqual(pollCalled, true);
                assert.strictEqual(downloadCalled, true);
            } finally {
                config.outputsDir = origOutputs;
            }
        } finally {
            sb.cleanup();
        }
    });

    await reporter.test(S, 'Tier 4: Chong sinh trung - Task da co providerTaskId thi retry KHONG BAO GIO goi submit lai', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        const { MockTosProvider } = await import('../byteplus/storage/mock_tos_provider.js');
        const { MockLasAssetProvider } = await import('../byteplus/assets/mock_las_provider.js');
        const { KolLibrary } = await import('../byteplus/kol_library.js');
        const { ByteplusQueueManager } = await import('../byteplus/queue_manager.js');

        const sb = makeSandbox('no_duplicate_submit');
        try {
            let submitCallCount = 0;
            const mockFetch = async (url, opts) => {
                if (opts && opts.method === 'POST') {
                    submitCallCount++;
                    return { ok: true, json: async () => ({ id: 'or-paid-task-999', status: 'pending' }) };
                }
                return {
                    ok: true,
                    json: async () => ({ id: 'or-paid-task-999', status: 'completed', output_url: 'https://openrouter.ai/paid.mp4' }),
                    arrayBuffer: async () => Buffer.from('VIDEO_BYTES')
                };
            };

            const provider = new OpenRouterSeedanceProvider({
                apiKey: 'sk-or-paid-key',
                pollIntervalMs: 5,
                fetchFn: mockFetch
            });
            const queue = new ByteplusQueueManager({
                provider,
                tosProvider: new MockTosProvider(),
                assetProvider: new MockLasAssetProvider(),
                kolLibrary: new KolLibrary({ assetProvider: new MockLasAssetProvider(), dbPath: sb.kolDbPath }),
                dbPath: sb.dbPath
            });

            // Tạm dừng queue để gán providerTaskId trước khi dispatch
            queue.pause();
            const task = queue.add({
                creator: 'Tester',
                taskName: 'Retry Paid Protection',
                prompt: 'Prompt for paid test',
                duration: 4
            });
            task.providerTaskId = 'or-paid-task-999';
            task.outputUrl = 'https://openrouter.ai/paid.mp4';
            task.status = 'failed';
            queue.store.save();
            queue.resume();

            // Gọi retry: chỉ tải lại outputUrl, tuyệt đối không gọi submit lại
            queue.retry(task.id);

            const t0 = Date.now();
            while (task.status !== 'completed' && task.status !== 'failed') {
                if (Date.now() - t0 > 3000) throw new Error('Timeout retry');
                await new Promise(r => setTimeout(r, 20));
            }

            assert.strictEqual(task.status, 'completed');
            assert.strictEqual(submitCallCount, 0, 'Tuyệt đối không được gọi submit lại khi task đã có providerTaskId');
            assert.strictEqual(task.providerTaskId, 'or-paid-task-999');
        } finally {
            sb.cleanup();
        }
    });

    await reporter.test(S, 'Tier 4: Bao ve bi mat - OPENROUTER_API_KEY khong bao gio xuat hien trong Settings, task JSON hay logs', async () => {
        const { providerStatus } = await import('../byteplus/config.js');
        const { createTask } = await import('../byteplus/task_factory.js');

        const secret = 'sk-or-v1-my-ultra-secret-key-do-not-leak';
        const origKey = process.env.OPENROUTER_API_KEY;
        try {
            process.env.OPENROUTER_API_KEY = secret;
            const status = providerStatus();

            // Settings JSON không chứa secret
            const statusJson = JSON.stringify(status);
            assert.strictEqual(statusJson.includes(secret), false, 'Settings JSON không được chứa API Key');
            assert.strictEqual(status.openrouter.configured, true);

            // Task JSON không chứa secret
            const task = createTask({ creator: 'Alice', taskName: 'SecretTest', prompt: 'Secret prompt', duration: 4 });
            const taskJson = JSON.stringify(task);
            assert.strictEqual(taskJson.includes(secret), false, 'Task JSON không được chứa API Key');
        } finally {
            if (origKey !== undefined) process.env.OPENROUTER_API_KEY = origKey;
            else delete process.env.OPENROUTER_API_KEY;
        }
    });

    await reporter.test(S, 'Tier 4: Khoa an toan chan cuoc goi mang that khi chay trong test', async () => {
        const { OpenRouterSeedanceProvider } = await import('../byteplus/providers/openrouter_seedance_provider.js');
        // Không truyền fetchFn, không cho phép live calls trong test
        const provider = new OpenRouterSeedanceProvider({
            apiKey: 'sk-test-key'
            // fetchFn: undefined
        });

        await assert.rejects(async () => {
            await provider.submit({ prompt: 'A cat dancing' });
        }, err => {
            assert.strictEqual(err.code, 'LIVE_TEST_DISABLED');
            return true;
        });
    });
}

export default runOpenRouterTests;
