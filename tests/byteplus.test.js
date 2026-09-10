/**
 * tests/byteplus.test.js
 * Bo kiem thu cho GTF Video AI Automation V2 (che do mock).
 * Khong cham vao he thong Higgsfield cu.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Chay nhanh de test khong lau.
process.env.BYTEPLUS_MODE = 'mock';
process.env.BYTEPLUS_MOCK_STAGE_MS = process.env.BYTEPLUS_MOCK_STAGE_MS || '12';
process.env.BYTEPLUS_MOCK_POLL_MS = process.env.BYTEPLUS_MOCK_POLL_MS || '6';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Cho toi khi dieu kien dung, hoac het gio. */
async function waitFor(fn, { timeout = 12000, interval = 15, label = 'dieu kien' } = {}) {
    const t0 = Date.now();
    for (;;) {
        if (await fn()) return true;
        if (Date.now() - t0 > timeout) throw new Error('Qua thoi gian cho: ' + label);
        await sleep(interval);
    }
}

/** Tao mot sandbox rieng cho moi test de khong dung dung du lieu that. */
async function makeSandbox(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtfv2_' + name + '_'));
    const { config } = await import('../byteplus/config.js');
    const saved = {
        queueDbPath: config.queueDbPath, kolDbPath: config.kolDbPath,
        mockJobsPath: config.mockJobsPath, uploadsDir: config.uploadsDir,
        outputsDir: config.outputsDir, maxConcurrency: config.maxConcurrency,
        mockStageMs: config.mockStageMs, mockPollMs: config.mockPollMs
    };
    config.queueDbPath = path.join(dir, 'queue.json');
    config.kolDbPath = path.join(dir, 'kols.json');
    config.mockJobsPath = path.join(dir, 'jobs.json');
    config.uploadsDir = path.join(dir, 'uploads');
    config.outputsDir = path.join(dir, 'outputs');
    config.mockStageMs = 12;
    config.mockPollMs = 6;
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    fs.mkdirSync(config.outputsDir, { recursive: true });
    return {
        dir, config,
        restore() { Object.assign(config, saved); },
        cleanup() { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
    };
}

/** Dung mot he thong moi tinh, dung cac duong dan trong sandbox. */
async function buildSystem(sb) {
    const { MockSeedanceProvider } = await import('../byteplus/providers/mock_generation_provider.js');
    const { MockTosProvider } = await import('../byteplus/storage/mock_tos_provider.js');
    const { MockLasAssetProvider } = await import('../byteplus/assets/mock_las_provider.js');
    const { KolLibrary } = await import('../byteplus/kol_library.js');
    const { ByteplusQueueManager } = await import('../byteplus/queue_manager.js');

    const provider = new MockSeedanceProvider({ storePath: sb.config.mockJobsPath, stageMs: 12 });
    const tosProvider = new MockTosProvider();
    const assetProvider = new MockLasAssetProvider();
    const kols = new KolLibrary({ assetProvider, dbPath: sb.config.kolDbPath });
    const queue = new ByteplusQueueManager({
        provider, tosProvider, assetProvider, kolLibrary: kols, dbPath: sb.config.queueDbPath
    });
    return { provider, tosProvider, assetProvider, kols, queue };
}

/** Tao file gia lam tham chieu. */
function fakeFile(sb, name, size = 512) {
    const p = path.join(sb.config.uploadsDir, name);
    fs.writeFileSync(p, Buffer.alloc(size, 7));
    return p;
}

function baseTask(over = {}) {
    return {
        creator: 'Vy Anh', taskName: 'S1.0906', prompt: 'Can canh san pham xoay cham.',
        duration: 4, aspectRatio: '9:16', resolution: '480p', references: [], ...over
    };
}

export async function runByteplusTests(reporter) {
    const S = 'GTF Video AI Automation V2 (Mock)';

    // ── Tier 1: don vi ─────────────────────────────────────────────────
    await reporter.test(S, 'Tier 1: Bi danh tham chieu duoc danh so lai khi doi thu tu', async () => {
        const { assignAliases } = await import('../byteplus/reference_manager.js');
        const refs = [
            { id: 'a', type: 'image' }, { id: 'b', type: 'video' },
            { id: 'c', type: 'image' }, { id: 'd', type: 'kol', displayName: 'Maya' }
        ];
        let out = assignAliases(refs);
        assert.deepStrictEqual(out.map(r => r.alias), ['@Image 1', '@Video 1', '@Image 2', 'Maya']);

        const moved = [refs[2], refs[0], refs[1], refs[3]];
        out = assignAliases(moved);
        assert.deepStrictEqual(out.map(r => r.alias), ['@Image 1', '@Image 2', '@Video 1', 'Maya']);
        assert.strictEqual(out[0].id, 'c', 'id on dinh khong doi khi doi cho');
    });

    await reporter.test(S, 'Tier 1: Kiem tra dau vao chan task thieu truong bat buoc', async () => {
        const { validateTaskInput } = await import('../byteplus/task_factory.js');
        assert.ok(validateTaskInput({}).length >= 3);
        assert.strictEqual(validateTaskInput(baseTask()).length, 0);
        assert.ok(validateTaskInput(baseTask({ duration: 2 })).length > 0, 'duration 2s phai bi tu choi');
        assert.ok(validateTaskInput(baseTask({ resolution: '8k' })).length > 0);
    });

    await reporter.test(S, 'Tier 1: safeSegment chan path traversal', async () => {
        const { safeSegment, safeJoin } = await import('../byteplus/store.js');
        assert.ok(!safeSegment('../../etc/passwd').includes('/'));
        const BS = String.fromCharCode(92);
        assert.ok(!safeSegment(BS + BS + 'win').includes(BS), 'khong duoc con dau gach nguoc');
        const base = path.join(ROOT, 'byteplus_outputs');
        const joined = safeJoin(base, '../../escape', 'x');
        assert.ok(joined.startsWith(path.resolve(base)), 'khong duoc thoat ra ngoai thu muc goc');
    });

    await reporter.test(S, 'Tier 1: Provider that bao NOT_CONFIGURED thay vi goi mang', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        const { TosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        const { LasAssetLibraryProvider } = await import('../byteplus/assets/las_asset_provider.js');
        for (const P of [BytePlusGenerationProvider, TosStorageProvider, LasAssetLibraryProvider]) {
            const p = new P();
            assert.strictEqual(p.isConfigured(), false);
            await assert.rejects(async () => {
                if (p.submit) await p.submit(); else if (p.upload) await p.upload(); else await p.registerAsset();
            }, err => err.code === 'NOT_CONFIGURED' || err.code === 'BYTEPLUS_API_KEY_MISSING' || err.code === 'BYTEPLUS_TOS_NOT_CONFIGURED');
        }
    });

    await reporter.test(S, 'Tier 1: Fixture MP4 ton tai va hop le', async () => {
        const f = path.join(ROOT, 'byteplus', 'fixtures', 'mock_output.mp4');
        assert.ok(fs.existsSync(f), 'thieu fixture');
        const buf = fs.readFileSync(f);
        assert.ok(buf.length > 1000, 'fixture qua nho');
        assert.strictEqual(buf.slice(4, 8).toString('latin1'), 'ftyp', 'khong phai container MP4 hop le');
    });

    // ── Tier 2: ma tran dau vao E2E ────────────────────────────────────
    await reporter.test(S, 'Tier 2: E2E ma tran 8 to hop dau vao deu chay xong', async () => {
        const sb = await makeSandbox('matrix');
        try {
            const { queue, kols } = await buildSystem(sb);
            const maya = await kols.create({ displayName: 'Maya', description: 'Nu UGC', tags: ['female'] });
            const img1 = fakeFile(sb, 'a.png'), img2 = fakeFile(sb, 'b.png');
            const vid1 = fakeFile(sb, 'a.mp4'), vid2 = fakeFile(sb, 'b.mp4');
            const I = p => ({ type: 'image', localPath: p, originalName: path.basename(p) });
            const V = p => ({ type: 'video', localPath: p, originalName: path.basename(p) });
            const K = { type: 'kol', kolId: maya.id, displayName: 'Maya' };

            const cases = [
                ['Prompt only', []],
                ['Image + Prompt', [I(img1)]],
                ['Video + Prompt', [V(vid1)]],
                ['Image + Video + Prompt', [I(img1), V(vid1)]],
                ['KOL + Prompt', [K]],
                ['KOL + Image + Video + Prompt', [K, I(img1), V(vid1)]],
                ['Multiple Images', [I(img1), I(img2)]],
                ['Multiple Videos', [V(vid1), V(vid2)]]
            ];
            const ids = cases.map(([name, refs]) =>
                queue.add(baseTask({ taskName: name, references: refs })).id);

            await waitFor(() => ids.every(id => {
                const t = queue.find(id);
                return t && (t.status === 'completed' || t.status === 'failed');
            }), { label: 'ma tran 8 to hop', timeout: 20000 });

            for (let i = 0; i < ids.length; i++) {
                const t = queue.find(ids[i]);
                assert.strictEqual(t.status, 'completed',
                    'to hop "' + cases[i][0] + '" phai completed, nhan duoc ' + t.status +
                    (t.error ? ' (' + t.error.message + ')' : ''));
                assert.ok(t.providerTaskId && t.providerTaskId.startsWith('mock_seedance_'));
                assert.ok(fs.existsSync(t.localOutputPath), 'thieu file MP4 ket qua');
                assert.ok(fs.statSync(t.localOutputPath).size > 1000);
            }
        } finally { sb.restore(); sb.cleanup(); }
    });

    await reporter.test(S, 'Tier 2: Luong nghiem thu chinh KOL + Anh + Video + Prompt', async () => {
        const sb = await makeSandbox('primary');
        try {
            const { queue, kols } = await buildSystem(sb);
            const maya = await kols.create({ displayName: 'Maya', description: 'Nu UGC', tags: ['ugc'] });
            const t0 = queue.add(baseTask({
                taskName: 'Nghiem thu chinh',
                references: [
                    { type: 'kol', kolId: maya.id, displayName: 'Maya' },
                    { type: 'image', localPath: fakeFile(sb, 'ref.png'), originalName: 'ref.png' },
                    { type: 'video', localPath: fakeFile(sb, 'ref.mp4'), originalName: 'ref.mp4' }
                ]
            }));
            await waitFor(() => queue.find(t0.id).status === 'completed', { label: 'luong chinh' });
            const t = queue.find(t0.id);

            assert.strictEqual(t.pipelineStage, 'Completed');
            assert.strictEqual(t.progress, 100);
            const kolRef = t.references.find(r => r.type === 'kol');
            assert.ok(kolRef.assetUri.startsWith('asset://'), 'KOL phai qua Mock LAS');
            const vidRef = t.references.find(r => r.type === 'video');
            assert.ok(vidRef.remoteUrl, 'video phai qua Mock TOS va co URL');
            assert.ok(vidRef.expiresAt, 'phai luu han dung cua URL');
            assert.strictEqual(vidRef.storageProvider, 'mock-tos');
            assert.ok(fs.existsSync(t.localOutputPath));
            assert.strictEqual(kols.get(maya.id).usageCount, 1, 'usageCount phai tang');
        } finally { sb.restore(); sb.cleanup(); }
    });

    // ── Tier 3: dieu phoi ──────────────────────────────────────────────
    await reporter.test(S, 'Tier 3: Rolling concurrency = 10, task 11 doi va vao ngay khi co slot', async () => {
        const sb = await makeSandbox('conc');
        try {
            sb.config.maxConcurrency = 10;
            sb.config.mockStageMs = 60;
            const { queue } = await buildSystem(sb);
            const ids = [];
            for (let i = 1; i <= 11; i++) ids.push(queue.add(baseTask({ taskName: 'T' + i })).id);

            await waitFor(() => queue.activeCount === 10, { label: '10 task active' });
            assert.strictEqual(queue.activeCount, 10);
            const t11 = queue.find(ids[10]);
            assert.strictEqual(t11.status, 'pending', 'task 11 phai con doi khi da du 10 slot');

            let maxSeen = 0;
            const watch = setInterval(() => { maxSeen = Math.max(maxSeen, queue.activeCount); }, 5);

            await waitFor(() => queue.find(ids[10]).status !== 'pending',
                { label: 'task 11 duoc nap', timeout: 15000 });
            const doneCount = ids.slice(0, 10).filter(id => queue.find(id).status === 'completed').length;
            assert.ok(doneCount < 10, 'task 11 phai chay truoc khi ca 10 task dau xong (rolling, khong theo lo)');

            await waitFor(() => ids.every(id => queue.find(id).status === 'completed'),
                { label: 'tat ca xong', timeout: 25000 });
            clearInterval(watch);
            assert.ok(maxSeen <= 10, 'so job chay dong thoi khong duoc vuot 10, da thay ' + maxSeen);
        } finally { sb.restore(); sb.cleanup(); }
    });

    await reporter.test(S, 'Tier 3: Hang cho lon 40 task khong bao gio vuot tran dong thoi', async () => {
        const sb = await makeSandbox('bulk40');
        try {
            sb.config.maxConcurrency = 10;
            const { queue } = await buildSystem(sb);
            const inputs = [];
            for (let i = 1; i <= 40; i++) inputs.push(baseTask({ taskName: 'B' + i }));
            const res = queue.addMany(inputs);
            assert.strictEqual(res.created.length, 40);
            assert.strictEqual(res.failed.length, 0);

            let maxSeen = 0;
            const watch = setInterval(() => { maxSeen = Math.max(maxSeen, queue.activeCount); }, 4);
            await waitFor(() => queue.stats().completed === 40, { label: '40 task xong', timeout: 40000 });
            clearInterval(watch);
            assert.ok(maxSeen <= 10, 'dinh dong thoi = ' + maxSeen + ' (phai <= 10)');
            assert.ok(maxSeen >= 8, 'phai thuc su chay song song, dinh chi dat ' + maxSeen);
        } finally { sb.restore(); sb.cleanup(); }
    });

    await reporter.test(S, 'Tier 3: Pause khong giet job dang chay va khong nap them', async () => {
        const sb = await makeSandbox('pause');
        try {
            sb.config.maxConcurrency = 3;
            sb.config.mockStageMs = 90;
            const { queue } = await buildSystem(sb);
            const ids = [];
            for (let i = 1; i <= 8; i++) ids.push(queue.add(baseTask({ taskName: 'P' + i })).id);

            await waitFor(() => queue.activeCount === 3, { label: '3 task active' });
            queue.pause();
            const activeAtPause = [...queue.active.keys()];
            assert.strictEqual(activeAtPause.length, 3, 'pause khong duoc huy job dang chay');

            await waitFor(() => activeAtPause.every(id => queue.find(id).status === 'completed'),
                { label: 'job dang chay van hoan tat', timeout: 15000 });
            await sleep(120);
            assert.strictEqual(queue.activeCount, 0, 'khi tam dung, slot trong khong duoc nap them');
            assert.strictEqual(queue.stats().completed, 3);
            assert.strictEqual(queue.stats().pending, 5);

            queue.resume();
            await waitFor(() => queue.activeCount === 3, { label: 'resume lap day slot' });
            await waitFor(() => queue.stats().completed === 8, { label: 'tat ca xong sau resume', timeout: 25000 });
        } finally { sb.restore(); sb.cleanup(); }
    });

    await reporter.test(S, 'Tier 3: Loi -> tra slot, giu ly do, Retry chay lai thanh cong', async () => {
        const sb = await makeSandbox('fail');
        try {
            sb.config.maxConcurrency = 2;
            const { queue } = await buildSystem(sb);
            const bad = queue.add(baseTask({ taskName: 'Se loi', mockFailure: 'generation' }));
            const ok1 = queue.add(baseTask({ taskName: 'OK 1' }));
            const ok2 = queue.add(baseTask({ taskName: 'OK 2' }));

            await waitFor(() => queue.find(bad.id).status === 'failed', { label: 'task loi' });
            const f = queue.find(bad.id);
            assert.ok(f.error && f.error.code === 'GENERATION_FAILED', 'phai luu ma loi');
            assert.ok(f.error.message.length > 0, 'phai luu thong bao loi');
            assert.strictEqual(f.attempts, 1);
            assert.ok(!queue.active.has(bad.id), 'slot phai duoc tra lai');

            await waitFor(() => queue.find(ok2.id).status === 'completed',
                { label: 'task dang doi van duoc nap', timeout: 15000 });
            assert.strictEqual(queue.find(ok1.id).status, 'completed');

            // Retry: bo co mock failure roi chay lai
            delete queue.find(bad.id).mockFailure;
            queue.retry(bad.id);
            assert.strictEqual(queue.find(bad.id).status !== 'failed', true);
            await waitFor(() => queue.find(bad.id).status === 'completed', { label: 'retry thanh cong' });
            assert.strictEqual(queue.find(bad.id).attempts, 2, 'phai dem so lan thu');
            assert.strictEqual(queue.find(bad.id).error, null);
        } finally { sb.restore(); sb.cleanup(); }
    });

    await reporter.test(S, 'Tier 3: Loi upload va loi submit deu duoc bat rieng', async () => {
        const sb = await makeSandbox('fail2');
        try {
            sb.config.maxConcurrency = 4;
            const { queue } = await buildSystem(sb);
            const a = queue.add(baseTask({ taskName: 'Loi upload', mockFailure: 'upload',
                references: [{ type: 'image', localPath: fakeFile(sb, 'u.png'), originalName: 'u.png' }] }));
            const b = queue.add(baseTask({ taskName: 'Loi submit', mockFailure: 'provider' }));

            await waitFor(() => queue.find(a.id).status === 'failed' && queue.find(b.id).status === 'failed',
                { label: 'hai loai loi' });
            assert.strictEqual(queue.find(a.id).error.code, 'REFERENCE_UPLOAD_FAILED');
            assert.strictEqual(queue.find(a.id).providerTaskId, null, 'loi upload thi khong duoc gui job');
            assert.strictEqual(queue.find(b.id).error.code, 'PROVIDER_SUBMIT_FAILED');
        } finally { sb.restore(); sb.cleanup(); }
    });

    await reporter.test(S, 'Tier 3: Pre-flight chan task co file tham chieu da bien mat', async () => {
        const sb = await makeSandbox('preflight');
        try {
            const { queue } = await buildSystem(sb);
            const missing = path.join(sb.config.uploadsDir, 'khong-ton-tai.png');
            const t = queue.add(baseTask({ taskName: 'Thieu file',
                references: [{ type: 'image', localPath: missing, originalName: 'khong-ton-tai.png' }] }));
            await waitFor(() => queue.find(t.id).status === 'failed', { label: 'preflight chan' });
            assert.strictEqual(queue.find(t.id).error.code, 'REFERENCE_FILE_MISSING');
            assert.strictEqual(queue.find(t.id).providerTaskId, null, 'khong duoc ton slot generation');
        } finally { sb.restore(); sb.cleanup(); }
    });

    await reporter.test(S, 'Tier 3: Sap xep lai — moveTop/Up/Down va reorder duoc ton trong', async () => {
        const sb = await makeSandbox('order');
        try {
            sb.config.maxConcurrency = 1;
            sb.config.mockStageMs = 200;
            const { queue } = await buildSystem(sb);
            queue.pause();
            const ids = [];
            for (let i = 1; i <= 5; i++) ids.push(queue.add(baseTask({ taskName: 'O' + i })).id);

            queue.moveTop(ids[4]);
            assert.strictEqual(queue.tasks[0].id, ids[4]);
            queue.moveDown(ids[4]);
            assert.strictEqual(queue.tasks[1].id, ids[4]);
            queue.moveUp(ids[4]);
            assert.strictEqual(queue.tasks[0].id, ids[4]);

            const wanted = [ids[2], ids[0], ids[4], ids[1], ids[3]];
            queue.reorder(wanted);
            assert.deepStrictEqual(queue.tasks.map(t => t.id), wanted);

            queue.resume();
            await waitFor(() => queue.find(wanted[0]).status === 'running', { label: 'chay dung thu tu moi' });
            assert.strictEqual(queue.find(wanted[1]).status, 'pending');
        } finally { sb.restore(); sb.cleanup(); }
    });

    // ── Tier 4: khoi phuc, KOL, realtime ───────────────────────────────
    await reporter.test(S, 'Tier 4: Restart — task chua gui (providerTaskId=null) tro ve pending an toan', async () => {
        const sb = await makeSandbox('recA');
        try {
            sb.config.maxConcurrency = 5;
            const s1 = await buildSystem(sb);
            s1.queue.pause();
            const t = s1.queue.add(baseTask({ taskName: 'Chua gui' }));
            // Gia lap chet giua chung: dang running nhung chua co providerTaskId
            t.status = 'running';
            t.providerTaskId = null;
            await s1.queue.store.save();

            const s2 = await buildSystem(sb);           // "khoi dong lai"
            const notes = s2.queue.recover();
            assert.strictEqual(notes.length, 1);
            assert.strictEqual(notes[0].action, 'requeued');
            assert.strictEqual(s2.queue.find(t.id).status, 'pending');

            s2.queue.start();
            await waitFor(() => s2.queue.find(t.id).status === 'completed', { label: 'chay lai sau restart' });
            assert.strictEqual(s2.queue.find(t.id).submitCount, 1);
        } finally { sb.restore(); sb.cleanup(); }
    });

    await reporter.test(S, 'Tier 4: Restart — task DA gui khong bao gio bi gui lai (chong trung provider)', async () => {
        const sb = await makeSandbox('recB');
        try {
            sb.config.maxConcurrency = 5;
            sb.config.mockStageMs = 300;         // du lau de bat duoc luc dang chay
            const s1 = await buildSystem(sb);
            const t = s1.queue.add(baseTask({ taskName: 'Dang render' }));

            await waitFor(() => {
                const x = s1.queue.find(t.id);
                return x.providerTaskId && x.status === 'running';
            }, { label: 'job da duoc gui len provider' });

            const originalProviderId = s1.queue.find(t.id).providerTaskId;
            const jobsBefore = s1.provider.jobCount();
            assert.strictEqual(jobsBefore, 1);

            // "Server chet": bo ca AbortController, giu nguyen file DB tren dia.
            for (const [, c] of s1.queue.active) c.abort();
            s1.queue.active.clear();
            s1.queue.find(t.id).status = 'running';   // dia van ghi running
            await s1.queue.store.save();

            // Khoi dong lai
            const s2 = await buildSystem(sb);
            const notes = s2.queue.recover();
            assert.strictEqual(notes[0].action, 'resume', 'phai resume chu khong requeue');
            assert.strictEqual(s2.queue.find(t.id).providerTaskId, originalProviderId);

            s2.queue.resumeRecovered();
            await waitFor(() => s2.queue.find(t.id).status === 'completed',
                { label: 'noi lai job cu den khi xong', timeout: 15000 });

            const after = s2.queue.find(t.id);
            assert.strictEqual(after.providerTaskId, originalProviderId, 'providerTaskId KHONG duoc thay doi');
            assert.strictEqual(after.submitCount, 1, 'chi duoc submit dung 1 lan');
            assert.strictEqual(s2.provider.jobCount(), 1, 'KHONG duoc tao job thu hai tren provider');
            assert.ok(fs.existsSync(after.localOutputPath), 'van phai ra file ket qua');
        } finally { sb.restore(); sb.cleanup(); }
    });

    await reporter.test(S, 'Tier 4: Du lieu song sot qua restart (pending/completed/failed/KOL)', async () => {
        const sb = await makeSandbox('persist');
        try {
            sb.config.maxConcurrency = 2;
            const s1 = await buildSystem(sb);
            await s1.kols.create({ displayName: 'Nia', tags: ['female'] });
            const done = s1.queue.add(baseTask({ taskName: 'Xong' }));
            const bad = s1.queue.add(baseTask({ taskName: 'Loi', mockFailure: 'provider' }));
            s1.queue.pause();
            const wait = s1.queue.add(baseTask({ taskName: 'Con doi' }));

            await waitFor(() => s1.queue.find(done.id).status === 'completed' &&
                                s1.queue.find(bad.id).status === 'failed', { label: 'trang thai on dinh' });
            await s1.queue.flush();
            await s1.kols.flush();

            const s2 = await buildSystem(sb);
            assert.strictEqual(s2.queue.find(done.id).status, 'completed');
            assert.strictEqual(s2.queue.find(bad.id).status, 'failed');
            assert.ok(s2.queue.find(bad.id).error.code, 'ly do loi phai con');
            assert.strictEqual(s2.queue.find(wait.id).status, 'pending');
            assert.strictEqual(s2.kols.all.length, 1);
            assert.strictEqual(s2.kols.all[0].displayName, 'Nia');
            assert.strictEqual(s2.queue.control.paused, true, 'trang thai dieu khien cung phai song sot');
        } finally { sb.restore(); sb.cleanup(); }
    });

    await reporter.test(S, 'Tier 4: KOL E2E — them, doi ten, sua the, tim, dung lai, dem luot dung', async () => {
        const sb = await makeSandbox('kol');
        try {
            const { queue, kols } = await buildSystem(sb);
            const maya = await kols.create({ displayName: 'Maya', description: 'Nu UGC', tags: ['female', 'ugc'] });
            await kols.create({ displayName: 'David', description: 'Nam', tags: ['male'] });
            assert.ok(maya.assetId.startsWith('mock_asset_'), 'phai dang ky qua Mock LAS');
            const originalAsset = maya.assetId;

            assert.strictEqual(kols.list({ q: 'maya' }).length, 1);
            assert.strictEqual(kols.list({ q: 'ugc' }).length, 1);
            assert.strictEqual(kols.list({ tag: 'male' }).length, 1);
            assert.strictEqual(kols.list({ q: 'khongcoai' }).length, 0);

            // Doi ten CHI doi nhan — assetId giu nguyen
            kols.update(maya.id, { displayName: 'Maya Casual Bedroom', tags: 'female, ugc, bedroom' });
            assert.strictEqual(kols.get(maya.id).displayName, 'Maya Casual Bedroom');
            assert.strictEqual(kols.get(maya.id).assetId, originalAsset, 'doi ten khong duoc sinh asset moi');
            assert.strictEqual(kols.get(maya.id).tags.length, 3);

            const t1 = queue.add(baseTask({ taskName: 'Dung KOL 1',
                references: [{ type: 'kol', kolId: maya.id }] }));
            const t2 = queue.add(baseTask({ taskName: 'Dung KOL 2',
                references: [{ type: 'kol', kolId: maya.id }] }));
            await waitFor(() => queue.find(t1.id).status === 'completed' && queue.find(t2.id).status === 'completed',
                { label: 'hai task dung chung KOL' });
            assert.strictEqual(kols.get(maya.id).usageCount, 2, 'usageCount phai la 2');
            assert.ok(kols.get(maya.id).lastUsedAt);

            // Xoa KOL khong duoc lam hong lich su task cu
            kols.remove(maya.id);
            assert.strictEqual(kols.get(maya.id), null);
            const hist = queue.find(t1.id);
            assert.strictEqual(hist.references[0].displayName, 'Maya Casual Bedroom',
                'task cu van giu ban sao ten KOL');
            assert.strictEqual(hist.references[0].assetId, originalAsset);
            assert.strictEqual(hist.status, 'completed');
        } finally { sb.restore(); sb.cleanup(); }
    });

    await reporter.test(S, 'Tier 4: Su kien realtime toi nhieu client cung luc', async () => {
        const sb = await makeSandbox('rt');
        try {
            const { queue, kols } = await buildSystem(sb);
            const clientA = [], clientB = [];
            queue.on('queue-updated', () => { clientA.push('queue'); clientB.push('queue'); });
            queue.on('task-created', t => { clientA.push('created:' + t.id); clientB.push('created:' + t.id); });
            queue.on('task-completed', t => { clientA.push('done:' + t.id); clientB.push('done:' + t.id); });
            kols.on('kol-updated', p => { clientA.push('kol:' + p.action); clientB.push('kol:' + p.action); });

            const t = queue.add(baseTask({ taskName: 'Realtime' }));
            assert.ok(clientA.includes('created:' + t.id), 'client A phai nhan su kien tao task');
            assert.ok(clientB.includes('created:' + t.id), 'client B phai nhan su kien tao task');

            const before = clientA.length;
            queue.moveTop(t.id);
            assert.ok(clientA.length > before, 'doi thu tu phai phat su kien toi client con lai');

            await kols.create({ displayName: 'RT KOL' });
            assert.ok(clientB.some(e => e === 'kol:created'), 'thay doi KOL phai toi client khac');

            await waitFor(() => queue.find(t.id).status === 'completed', { label: 'task xong' });
            assert.ok(clientA.some(e => e.startsWith('done:')), 'phai phat su kien hoan thanh');
            assert.deepStrictEqual(clientA, clientB, 'moi client phai nhan cung mot chuoi su kien');
        } finally { sb.restore(); sb.cleanup(); }
    });

    await reporter.test(S, 'Tier 4: He thong cu khong bi anh huong — DB va route van nguyen', async () => {
        const legacyDb = path.join(ROOT, 'queue_db.json');
        assert.ok(fs.existsSync(legacyDb), 'queue_db.json cu phai con');
        const legacy = JSON.parse(fs.readFileSync(legacyDb, 'utf-8'));
        assert.ok(Array.isArray(legacy.queue), 'cau truc DB cu phai giu nguyen');
        assert.ok(legacy.queue.length > 0, 'du lieu cu phai con');
        assert.ok(legacy.queue[0].id.startsWith('task_'), 'schema task cu khong duoc doi');

        const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf-8');
        for (const route of ['/api/queue/add', '/api/queue/control', '/api/cdp/status', '/api/lan-info']) {
            assert.ok(srv.includes(route), 'route cu bi mat: ' + route);
        }
        assert.ok(srv.includes('processQueueLoop'), 'vong lap queue cu phai con');
        assert.ok(srv.includes('video_generate'), 'pipeline CDP cu phai con');
        assert.ok(fs.existsSync(path.join(ROOT, 'public', 'index.html')), 'UI cu phai con');
        assert.ok(fs.existsSync(path.join(ROOT, 'public', 'app.js')), 'JS cu phai con');

        // He moi khong duoc ghi vao DB cu
        const bpFiles = ['byteplus_queue_db.json', 'byteplus_kol_library.json'];
        for (const f of bpFiles) {
            const p = path.join(ROOT, f);
            if (fs.existsSync(p)) {
                const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
                assert.ok(!d.queue, 'DB moi khong duoc dung schema cu');
            }
        }
    });

    // ── Suite: Real BytePlus Provider (Mocked HTTP / Zero Live Calls) ─────────
    const S_REAL = 'GTF Video AI Automation V2 (BytePlus Real Provider)';

    await reporter.test(S_REAL, 'Tier 1: BytePlusProvider preflight nem BYTEPLUS_API_KEY_MISSING khi thieu API key', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        const provider = new BytePlusGenerationProvider({ apiKey: '', endpointId: 'ep-test-123' });
        assert.strictEqual(provider.isConfigured(), false);
        await assert.rejects(async () => {
            await provider.submit({ prompt: 'Test video prompt' });
        }, err => err.code === 'BYTEPLUS_API_KEY_MISSING');
    });

    await reporter.test(S_REAL, 'Tier 1: BytePlusProvider preflight nem BYTEPLUS_ENDPOINT_ID_MISSING khi thieu Endpoint ID', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        const provider = new BytePlusGenerationProvider({ apiKey: 'ark-test-key', endpointId: '' });
        assert.strictEqual(provider.isConfigured(), false);
        await assert.rejects(async () => {
            await provider.submit({ prompt: 'Test video prompt' });
        }, err => err.code === 'BYTEPLUS_ENDPOINT_ID_MISSING');
    });

    await reporter.test(S_REAL, 'Tier 1: BytePlusProvider preflight chan anh tham chieu local/noi bo voi BYTEPLUS_IMAGE_REQUIRES_ACCESSIBLE_URL', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        const provider = new BytePlusGenerationProvider({ apiKey: 'ark-key', endpointId: 'ep-test' });
        const invalidCases = [
            '/path/to/local/image.png',
            'http://localhost:20140/preview.png',
            'http://127.0.0.1:8080/image.jpg',
            'https://192.168.1.50/pic.jpg',
            'https://10.0.0.5/pic.png',
            'file:///C:/test.png'
        ];
        for (const invalidUrl of invalidCases) {
            await assert.rejects(async () => {
                await provider.submit({
                    prompt: 'Test prompt',
                    references: [{ type: 'image', remoteUrl: invalidUrl }]
                });
            }, err => err.code === 'BYTEPLUS_IMAGE_REQUIRES_ACCESSIBLE_URL', 'Phai chan URL: ' + invalidUrl);
        }
    });

    await reporter.test(S_REAL, 'Tier 1: BytePlusProvider preflight chan video tham chieu voi BYTEPLUS_SEEDANCE_1_5_VIDEO_REFERENCE_UNSUPPORTED', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        const provider = new BytePlusGenerationProvider({ apiKey: 'ark-key', endpointId: 'ep-test' });
        await assert.rejects(async () => {
            await provider.submit({
                prompt: 'Test prompt',
                references: [{ type: 'video', remoteUrl: 'https://example.com/video.mp4' }]
            });
        }, err => err.code === 'BYTEPLUS_SEEDANCE_1_5_VIDEO_REFERENCE_UNSUPPORTED');
    });

    await reporter.test(S_REAL, 'Tier 1: BytePlusProvider preflight chan KOL khi LAS chua bat voi BYTEPLUS_KOL_LAS_UNSUPPORTED', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        const { config } = await import('../byteplus/config.js');
        const provider = new BytePlusGenerationProvider({ apiKey: 'ark-key', endpointId: 'ep-test' });
        const savedEnabled = config.las.enabled;
        config.las.enabled = false;
        try {
            await assert.rejects(async () => {
                await provider.submit({
                    prompt: 'Test prompt',
                    references: [{ type: 'kol', kolId: 'kol_123' }]
                });
            }, err => err.code === 'BYTEPLUS_KOL_LAS_UNSUPPORTED');
        } finally {
            config.las.enabled = savedEnabled;
        }
    });

    await reporter.test(S_REAL, 'Tier 1: Chuan hoa prompt duration va camerafixed khong bao gio trung lap', async () => {
        const { formatPromptText } = await import('../byteplus/providers/byteplus_generation_provider.js');
        assert.strictEqual(formatPromptText({ prompt: 'A cat walking' }), 'A cat walking --duration 4 --camerafixed false');
        assert.strictEqual(formatPromptText({ prompt: 'A cat --duration 8', duration: 8 }), 'A cat --duration 8 --camerafixed false');
        assert.strictEqual(formatPromptText({ prompt: 'A cat --camerafixed true' }), 'A cat --camerafixed true --duration 4');
        assert.strictEqual(formatPromptText({ prompt: 'A cat --duration 5 --camerafixed true' }), 'A cat --duration 5 --camerafixed true');
        assert.strictEqual(formatPromptText({ prompt: 'Prompt', duration: 10 }), 'Prompt --duration 10 --camerafixed false');
    });

    await reporter.test(S_REAL, 'Tier 2: Dinh dang request submit POST (endpoint, headers, body structure)', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        let capturedReq = null;
        const mockFetch = async (url, opts) => {
            capturedReq = { url, ...opts };
            return {
                ok: true,
                status: 200,
                json: async () => ({ id: 'cgt-submit-123', status: 'queued' })
            };
        };
        const provider = new BytePlusGenerationProvider({
            apiKey: 'secret-ark-key',
            endpointId: 'ep-seedance-pro',
            baseUrl: 'https://ark.ap-southeast.bytepluses.com',
            fetchFn: mockFetch
        });
        const res = await provider.submit({
            prompt: 'Cinematic video of sunset',
            duration: 6,
            references: [{ type: 'image', remoteUrl: 'https://cdn.example.com/assets/sun.jpg' }]
        });
        assert.strictEqual(res.providerTaskId, 'cgt-submit-123');
        assert.strictEqual(res.providerStatus, 'submitted');
        assert.strictEqual(capturedReq.url, 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks');
        assert.strictEqual(capturedReq.method, 'POST');
        assert.strictEqual(capturedReq.headers['Authorization'], 'Bearer secret-ark-key');
        assert.strictEqual(capturedReq.headers['Content-Type'], 'application/json');

        const parsedBody = JSON.parse(capturedReq.body);
        assert.strictEqual(parsedBody.model, 'ep-seedance-pro');
        assert.strictEqual(parsedBody.content.length, 2);
        assert.strictEqual(parsedBody.content[0].type, 'text');
        assert.strictEqual(parsedBody.content[0].text, 'Cinematic video of sunset --duration 6 --camerafixed false');
        assert.strictEqual(parsedBody.content[1].type, 'image_url');
        assert.strictEqual(parsedBody.content[1].image_url.url, 'https://cdn.example.com/assets/sun.jpg');
    });

    await reporter.test(S_REAL, 'Tier 2: Dinh dang request query GET (endpoint, headers)', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        let capturedGet = null;
        const mockFetch = async (url, opts) => {
            capturedGet = { url, ...opts };
            return {
                ok: true,
                status: 200,
                json: async () => ({ id: 'cgt-task-999', status: 'running' })
            };
        };
        const provider = new BytePlusGenerationProvider({
            apiKey: 'test-ark-key',
            endpointId: 'ep-test',
            baseUrl: 'https://ark.ap-southeast.bytepluses.com',
            fetchFn: mockFetch
        });
        const pollRes = await provider.poll('cgt-task-999');
        assert.strictEqual(capturedGet.url, 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-task-999');
        assert.strictEqual(capturedGet.method, 'GET');
        assert.strictEqual(capturedGet.headers['Authorization'], 'Bearer test-ark-key');
        assert.strictEqual(pollRes.providerStatus, 'running');
        assert.strictEqual(pollRes.stage, 'Generating');
    });

    await reporter.test(S_REAL, 'Tier 2: Xu ly cac trang thai poll (queued, running, succeeded, failed)', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        const makeProvider = statusResponse => new BytePlusGenerationProvider({
            apiKey: 'test-key',
            endpointId: 'ep-test',
            fetchFn: async () => ({ ok: true, status: 200, json: async () => statusResponse })
        });

        // Queued
        let p = makeProvider({ id: '1', status: 'queued' });
        let r = await p.poll('1');
        assert.strictEqual(r.providerStatus, 'queued');
        assert.strictEqual(r.stage, 'Queued');

        // Running
        p = makeProvider({ id: '2', status: 'processing' });
        r = await p.poll('2');
        assert.strictEqual(r.providerStatus, 'running');
        assert.strictEqual(r.stage, 'Generating');

        // Succeeded
        p = makeProvider({ id: '3', status: 'succeeded', content: { video_url: 'https://cdn.example.com/out.mp4' } });
        r = await p.poll('3');
        assert.strictEqual(r.providerStatus, 'succeeded');
        assert.strictEqual(r.outputUrl, 'https://cdn.example.com/out.mp4');

        // Failed
        p = makeProvider({ id: '4', status: 'failed', error: { code: 'PROMPT_POLICY_VIOLATION', message: 'Sensitive content' } });
        r = await p.poll('4');
        assert.strictEqual(r.providerStatus, 'failed');
        assert.strictEqual(r.error.code, 'PROMPT_POLICY_VIOLATION');
        assert.strictEqual(r.error.message, 'Sensitive content');
    });

    await reporter.test(S_REAL, 'Tier 2: waitForCompletion lap poll, phat tien do qua onProgress va tra ket qua', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        let pollStep = 0;
        const mockFetch = async () => {
            pollStep++;
            if (pollStep === 1) return { ok: true, json: async () => ({ id: 'cgt-flow', status: 'queued' }) };
            if (pollStep === 2) return { ok: true, json: async () => ({ id: 'cgt-flow', status: 'running' }) };
            return { ok: true, json: async () => ({ id: 'cgt-flow', status: 'succeeded', content: { video_url: 'https://cdn.example.com/res.mp4' } }) };
        };
        const provider = new BytePlusGenerationProvider({
            apiKey: 'test-key',
            endpointId: 'ep-test',
            pollIntervalMs: 5,
            pollTimeoutMs: 2000,
            fetchFn: mockFetch
        });
        const progressEvents = [];
        const result = await provider.waitForCompletion('cgt-flow', {
            onProgress: p => progressEvents.push(p.providerStatus)
        });
        assert.strictEqual(result.providerStatus, 'succeeded');
        assert.strictEqual(result.outputUrl, 'https://cdn.example.com/res.mp4');
        assert.deepStrictEqual(progressEvents, ['queued', 'running', 'succeeded']);
    });

    await reporter.test(S_REAL, 'Tier 3: resume chi noi lai job bang GET, KHONG BAO GIO goi POST', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        let postCalled = false;
        let getCalled = false;
        const mockFetch = async (url, opts) => {
            if (opts.method === 'POST') postCalled = true;
            if (opts.method === 'GET') getCalled = true;
            return {
                ok: true,
                status: 200,
                json: async () => ({ id: 'cgt-resumed', status: 'succeeded', content: { video_url: 'https://cdn.example.com/done.mp4' } })
            };
        };
        const provider = new BytePlusGenerationProvider({
            apiKey: 'test-key',
            endpointId: 'ep-test',
            pollIntervalMs: 5,
            fetchFn: mockFetch
        });
        const resumed = await provider.resume('cgt-resumed');
        assert.strictEqual(resumed.providerStatus, 'succeeded');
        assert.strictEqual(postCalled, false, 'resume KHONG duoc goi POST');
        assert.strictEqual(getCalled, true, 'resume phai goi GET de poll');
    });

    await reporter.test(S_REAL, 'Tier 3: download tai video tu outputUrl ve dia cuc bo thanh cong', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        const sb = await makeSandbox('bp_dl');
        try {
            const fakeMp4 = Buffer.from('....ftypisom....fake-mp4-data');
            const mockFetch = async url => {
                if (url === 'https://cdn.example.com/final.mp4') {
                    return {
                        ok: true,
                        status: 200,
                        arrayBuffer: async () => fakeMp4.buffer.slice(fakeMp4.byteOffset, fakeMp4.byteOffset + fakeMp4.byteLength)
                    };
                }
                return { ok: false, status: 404 };
            };
            const provider = new BytePlusGenerationProvider({
                apiKey: 'test-key',
                endpointId: 'ep-test',
                fetchFn: mockFetch
            });
            const dest = path.join(sb.config.outputsDir, 'test_output.mp4');
            const dlResult = await provider.download('cgt-dl', dest, { outputUrl: 'https://cdn.example.com/final.mp4' });
            assert.strictEqual(dlResult.localPath, dest);
            assert.strictEqual(fs.existsSync(dest), true);
            assert.strictEqual(fs.statSync(dest).size, fakeMp4.length);
        } finally {
            sb.restore();
            sb.cleanup();
        }
    });

    await reporter.test(S_REAL, 'Tier 4: Queue Manager va BytePlusProvider — download loi giu providerTaskId va outputUrl, retry khong sinh trung', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        const sb = await makeSandbox('bp_qm_nodup');
        try {
            const { ByteplusQueueManager } = await import('../byteplus/queue_manager.js');
            const { MockTosProvider } = await import('../byteplus/storage/mock_tos_provider.js');
            const { MockLasAssetProvider } = await import('../byteplus/assets/mock_las_provider.js');
            const { KolLibrary } = await import('../byteplus/kol_library.js');

            let submitCallCount = 0;
            let shouldFailDownload = true;

            const fakeMp4 = Buffer.from('....ftypisom....video-data');

            const mockFetch = async (url, opts) => {
                const method = opts?.method || 'GET';
                if (method === 'POST') {
                    submitCallCount++;
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ id: 'cgt-unique-id-1', status: 'queued' })
                    };
                }
                if (url.includes('/contents/generations/tasks/')) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            id: 'cgt-unique-id-1',
                            status: 'succeeded',
                            content: { video_url: 'https://cdn.example.com/video1.mp4' }
                        })
                    };
                }
                if (url === 'https://cdn.example.com/video1.mp4') {
                    if (shouldFailDownload) {
                        return { ok: false, status: 500 };
                    }
                    return {
                        ok: true,
                        status: 200,
                        arrayBuffer: async () => fakeMp4.buffer.slice(fakeMp4.byteOffset, fakeMp4.byteOffset + fakeMp4.byteLength)
                    };
                }
                return { ok: false, status: 404 };
            };

            const bpProvider = new BytePlusGenerationProvider({
                apiKey: 'real-key',
                endpointId: 'ep-test',
                pollIntervalMs: 5,
                fetchFn: mockFetch
            });

            const tosProvider = new MockTosProvider();
            const assetProvider = new MockLasAssetProvider();
            const kols = new KolLibrary({ assetProvider, dbPath: sb.config.kolDbPath });
            const queue = new ByteplusQueueManager({
                provider: bpProvider,
                tosProvider,
                assetProvider,
                kolLibrary: kols,
                dbPath: sb.config.queueDbPath
            });

            const task = queue.add({
                creator: 'Tester',
                taskName: 'DownloadRetryTest',
                prompt: 'A car driving through rain',
                duration: 4
            });

            // Lần 1: Submit thành công, Poll thành công (succeeded), nhưng Download thất bại (HTTP 500)
            await waitFor(() => queue.find(task.id).status === 'failed', { label: 'task fail tai download' });

            const failedTask = queue.find(task.id);
            assert.strictEqual(failedTask.status, 'failed');
            assert.strictEqual(failedTask.error.code, 'PROVIDER_DOWNLOAD_FAILED');
            assert.strictEqual(failedTask.providerTaskId, 'cgt-unique-id-1', 'providerTaskId phai duoc giu nguyen');
            assert.strictEqual(failedTask.outputUrl, 'https://cdn.example.com/video1.mp4', 'outputUrl phai duoc giu nguyen');
            assert.strictEqual(submitCallCount, 1, 'submit chi goi dung 1 lan');

            // Khắc phục lỗi mạng phía CDN
            shouldFailDownload = false;

            // Retry task: chỉ tải lại file, KHÔNG gọi submit lại
            queue.retry(task.id);

            await waitFor(() => queue.find(task.id).status === 'completed', { label: 'retry download thanh cong' });

            const retriedTask = queue.find(task.id);
            assert.strictEqual(retriedTask.status, 'completed');
            assert.strictEqual(retriedTask.providerTaskId, 'cgt-unique-id-1', 'providerTaskId van la job cu');
            assert.strictEqual(submitCallCount, 1, 'submitCallCount TUYET DOI phai la 1, khong sinh trung!');
            assert.strictEqual(fs.existsSync(retriedTask.localOutputPath), true);
            assert.strictEqual(fs.statSync(retriedTask.localOutputPath).size, fakeMp4.length);

        } finally {
            sb.restore();
            sb.cleanup();
        }
    });

    await reporter.test(S_REAL, 'Tier 4: Khoa an toan ALLOW_LIVE_BYTEPLUS_TESTS chan goi mang that khi chua bat', async () => {
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        const provider = new BytePlusGenerationProvider({
            apiKey: 'test-api-key',
            endpointId: 'ep-test-endpoint',
            allowLiveTests: false,
            fetchFn: null
        });
        await assert.rejects(async () => {
            await provider.submit({ prompt: 'Live call check' });
        }, err => err.code === 'LIVE_TEST_DISABLED');
    });

    // =========================================================================
    // SUITE 3: GTF Video AI Automation V2 (BytePlus Real TOS Provider)
    // Toàn bộ kiểm thử dùng mock / fake transport — TUYỆT ĐỐI KHÔNG GỌI MẠNG THẬT
    // =========================================================================
    const S_TOS = 'GTF Video AI Automation V2 (BytePlus Real TOS Provider)';

    await reporter.test(S_TOS, 'Tier 1: BytePlusTosStorageProvider nem BYTEPLUS_TOS_NOT_CONFIGURED khi thieu credentials', async () => {
        const { BytePlusTosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        const provider = new BytePlusTosStorageProvider({
            accessKey: '',
            secretKey: '',
            bucket: '',
            region: ''
        });
        assert.strictEqual(provider.isConfigured(), false);
        await assert.rejects(async () => {
            await provider.upload('some-file.png');
        }, err => err.code === 'BYTEPLUS_TOS_NOT_CONFIGURED');
    });

    await reporter.test(S_TOS, 'Tier 1: BytePlusTosStorageProvider nem BYTEPLUS_TOS_FILE_NOT_FOUND khi file khong ton tai', async () => {
        const { BytePlusTosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        const provider = new BytePlusTosStorageProvider({
            accessKey: 'test-ak',
            secretKey: 'test-sk',
            bucket: 'gtf-video-reference',
            region: 'ap-southeast-1'
        });
        assert.strictEqual(provider.isConfigured(), true);
        await assert.rejects(async () => {
            await provider.upload('path/to/nonexistent/image.png');
        }, err => err.code === 'BYTEPLUS_TOS_FILE_NOT_FOUND');
    });

    await reporter.test(S_TOS, 'Tier 1: buildObjectKey lam sach duong dan, chan path traversal va bao ve may cuc bo', async () => {
        const { buildObjectKey } = await import('../byteplus/storage/tos_provider.js');
        const d = new Date('2026-09-07T12:00:00Z');

        const key1 = buildObjectKey({
            taskId: 'task_123',
            referenceId: 'ref_456',
            localPath: 'C:\\Users\\admin\\Secret\\cute cat.png',
            date: d
        });
        assert.strictEqual(key1, 'gtf-video-ai/2026/09/07/task_123/ref_456-cute_cat.png');
        assert.ok(!key1.includes('C:'));
        assert.ok(!key1.includes('admin'));

        const key2 = buildObjectKey({
            taskId: '../../escape_task',
            referenceId: '../../escape_ref',
            originalName: '../../etc/passwd',
            date: d
        });
        assert.ok(!key2.includes('..'));
        assert.strictEqual(key2.startsWith('gtf-video-ai/2026/09/07/'), true);
    });

    await reporter.test(S_TOS, 'Tier 2: getSignedUrl sinh HTTPS URL voi TOS4-HMAC-SHA256 hop le', async () => {
        const { BytePlusTosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        const provider = new BytePlusTosStorageProvider({
            accessKey: 'AKLTtest123',
            secretKey: 'SKtest456',
            bucket: 'gtf-video-reference',
            region: 'ap-southeast-1'
        });
        const fixedDate = new Date('2026-09-07T10:00:00Z');
        const url = provider.getSignedUrl('gtf-video-ai/2026/09/07/task_1/ref_1-cat.png', {
            ttlSeconds: 3600,
            timestamp: fixedDate
        });
        assert.ok(url.startsWith('https://gtf-video-reference.tos-ap-southeast-1.bytepluses.com/gtf-video-ai/2026/09/07/task_1/ref_1-cat.png?'));
        assert.ok(url.includes('X-Tos-Algorithm=TOS4-HMAC-SHA256'));
        assert.ok(url.includes('X-Tos-Credential=AKLTtest123%2F20260907%2Fap-southeast-1%2Ftos%2Frequest'));
        assert.ok(url.includes('X-Tos-Expires=3600'));
        assert.ok(url.includes('X-Tos-SignedHeaders=host'));
        assert.ok(url.includes('X-Tos-Signature='));
    });

    await reporter.test(S_TOS, 'Tier 2: Upload anh voi mocked fetchFn -> luu remoteObjectKey va signed URL', async () => {
        const { BytePlusTosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        let capturedPut = null;
        const mockFetch = async (url, opts) => {
            capturedPut = { url, method: opts.method, headers: opts.headers, body: opts.body };
            return {
                ok: true,
                status: 200,
                headers: new Headers({ etag: '"etag-photo-123"' })
            };
        };

        const tmpFile = path.join(os.tmpdir(), `test_img_${Date.now()}.png`);
        fs.writeFileSync(tmpFile, Buffer.from('fake-png-content'));

        try {
            const provider = new BytePlusTosStorageProvider({
                accessKey: 'AK_TEST',
                secretKey: 'SK_TEST',
                bucket: 'gtf-video-reference',
                region: 'ap-southeast-1',
                fetchFn: mockFetch
            });

            const res = await provider.upload(tmpFile, {
                taskId: 't_img_1',
                referenceId: 'ref_img_1',
                originalName: 'photo.png'
            });

            assert.strictEqual(res.storageProvider, 'tos');
            assert.ok(res.remoteObjectKey.includes('t_img_1/ref_img_1-photo.png'));
            assert.ok(res.remoteUrl.startsWith('https://gtf-video-reference.tos-ap-southeast-1.bytepluses.com/'));
            assert.strictEqual(res.etag, 'etag-photo-123');
            assert.strictEqual(capturedPut.method, 'PUT');
            assert.strictEqual(capturedPut.headers['Content-Type'], 'image/png');
        } finally {
            try { fs.unlinkSync(tmpFile); } catch (_) {}
        }
    });

    await reporter.test(S_TOS, 'Tier 2: Upload video voi mocked fetchFn -> luu remoteObjectKey va signed URL', async () => {
        const { BytePlusTosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        let capturedPut = null;
        const mockFetch = async (url, opts) => {
            capturedPut = { url, method: opts.method, headers: opts.headers };
            return { ok: true, status: 200, headers: new Headers({ etag: '"etag-video-456"' }) };
        };

        const tmpFile = path.join(os.tmpdir(), `test_vid_${Date.now()}.mp4`);
        fs.writeFileSync(tmpFile, Buffer.from('fake-mp4-video-data'));

        try {
            const provider = new BytePlusTosStorageProvider({
                accessKey: 'AK_TEST',
                secretKey: 'SK_TEST',
                bucket: 'gtf-video-reference',
                region: 'ap-southeast-1',
                fetchFn: mockFetch
            });

            const res = await provider.upload(tmpFile, {
                taskId: 't_vid_1',
                referenceId: 'ref_vid_1',
                originalName: 'sample.mp4'
            });

            assert.strictEqual(res.storageProvider, 'tos');
            assert.ok(res.remoteObjectKey.includes('t_vid_1/ref_vid_1-sample.mp4'));
            assert.strictEqual(capturedPut.method, 'PUT');
            assert.strictEqual(capturedPut.headers['Content-Type'], 'video/mp4');
        } finally {
            try { fs.unlinkSync(tmpFile); } catch (_) {}
        }
    });

    await reporter.test(S_TOS, 'Tier 3: URL het han -> refreshSignedUrl tao URL moi ma khong goi upload lai', async () => {
        const { BytePlusTosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        let uploadCount = 0;
        const mockFetch = async () => {
            uploadCount++;
            return { ok: true, status: 200 };
        };

        const provider = new BytePlusTosStorageProvider({
            accessKey: 'AK_TEST',
            secretKey: 'SK_TEST',
            bucket: 'gtf-video-reference',
            region: 'ap-southeast-1',
            fetchFn: mockFetch
        });

        const ref = {
            id: 'ref_1',
            remoteObjectKey: 'gtf-video-ai/2026/09/07/task_1/ref_1-cat.png',
            remoteUrl: 'https://gtf-video-reference.tos-ap-southeast-1.bytepluses.com/old_signed_url'
        };

        const refreshed = provider.refreshSignedUrl(ref, { ttlSeconds: 7200 });
        assert.ok(refreshed.remoteUrl !== 'https://gtf-video-reference.tos-ap-southeast-1.bytepluses.com/old_signed_url');
        assert.ok(refreshed.remoteUrl.includes('X-Tos-Expires=7200'));
        assert.strictEqual(uploadCount, 0, 'refreshSignedUrl khong duoc goi PUT upload');
    });

    await reporter.test(S_TOS, 'Tier 3: ReferenceManager preflight chan anh cuc bo khi TOS chua cau hinh voi BYTEPLUS_TOS_NOT_CONFIGURED', async () => {
        const { ReferenceManager } = await import('../byteplus/reference_manager.js');
        const { BytePlusTosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        const { MockLasAssetProvider } = await import('../byteplus/assets/mock_las_provider.js');

        const unconfiguredTos = new BytePlusTosStorageProvider({
            accessKey: '',
            secretKey: '',
            bucket: '',
            region: ''
        });

        const tmpFile = path.join(os.tmpdir(), `test_ref_${Date.now()}.png`);
        fs.writeFileSync(tmpFile, 'png-data');

        try {
            const rm = new ReferenceManager({
                tosProvider: unconfiguredTos,
                assetProvider: new MockLasAssetProvider()
            });

            const task = {
                id: 'task_with_img',
                prompt: 'Cute kitten',
                references: [
                    { type: 'image', id: 'ref_img', localPath: tmpFile }
                ]
            };

            await assert.rejects(async () => {
                await rm.preflight(task);
            }, err => err.code === 'BYTEPLUS_TOS_NOT_CONFIGURED');
        } finally {
            try { fs.unlinkSync(tmpFile); } catch (_) {}
        }
    });

    await reporter.test(S_TOS, 'Tier 3: Task chi co Prompt khong can TOS -> chay thanh cong khi TOS chua cau hinh', async () => {
        const { ReferenceManager } = await import('../byteplus/reference_manager.js');
        const { BytePlusTosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        const { MockLasAssetProvider } = await import('../byteplus/assets/mock_las_provider.js');

        const unconfiguredTos = new BytePlusTosStorageProvider({ accessKey: '', secretKey: '' });
        const rm = new ReferenceManager({
            tosProvider: unconfiguredTos,
            assetProvider: new MockLasAssetProvider()
        });

        const promptOnlyTask = {
            id: 'task_prompt_only',
            prompt: 'A car driving through futuristic city',
            references: []
        };

        const preflightOk = await rm.preflight(promptOnlyTask);
        assert.strictEqual(preflightOk, true);

        const prepared = await rm.prepare(promptOnlyTask);
        assert.deepStrictEqual(prepared, []);
    });

    await reporter.test(S_TOS, 'Tier 3: TOS upload that bai -> Task fail, ModelArk submit count = 0', async () => {
        const { BytePlusTosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        const { BytePlusGenerationProvider } = await import('../byteplus/providers/byteplus_generation_provider.js');
        const { ByteplusQueueManager } = await import('../byteplus/queue_manager.js');
        const { MockLasAssetProvider } = await import('../byteplus/assets/mock_las_provider.js');
        const { KolLibrary } = await import('../byteplus/kol_library.js');

        const sb = await makeSandbox('bp_tos_fail');
        let modelArkSubmitCount = 0;

        try {
            const mockTosFetch = async () => {
                return { ok: false, status: 500, statusText: 'Internal Server Error' };
            };
            const mockArkFetch = async () => {
                modelArkSubmitCount++;
                return { ok: true, status: 200, json: async () => ({ id: 'cgt-123' }) };
            };

            const tosProvider = new BytePlusTosStorageProvider({
                accessKey: 'AK',
                secretKey: 'SK',
                bucket: 'gtf-video-reference',
                region: 'ap-southeast-1',
                fetchFn: mockTosFetch
            });

            const genProvider = new BytePlusGenerationProvider({
                apiKey: 'ark-key',
                endpointId: 'ep-test',
                fetchFn: mockArkFetch
            });

            const tmpFile = path.join(sb.config.uploadsDir, 'fail_img.png');
            fs.writeFileSync(tmpFile, 'image-data');

            const queue = new ByteplusQueueManager({
                provider: genProvider,
                tosProvider,
                assetProvider: new MockLasAssetProvider(),
                kolLibrary: new KolLibrary({ assetProvider: new MockLasAssetProvider(), dbPath: sb.config.kolDbPath }),
                dbPath: sb.config.queueDbPath
            });

            const task = queue.add({
                creator: 'Tester',
                taskName: 'TosFailTest',
                prompt: 'A dog on grass',
                duration: 4,
                references: [{ type: 'image', localPath: tmpFile, originalName: 'fail_img.png' }]
            });

            await waitFor(() => queue.find(task.id).status === 'failed', { label: 'task fail khi TOS upload 500' });

            const failedTask = queue.find(task.id);
            assert.strictEqual(failedTask.status, 'failed');
            assert.strictEqual(failedTask.error.code, 'BYTEPLUS_TOS_UPLOAD_FAILED');
            assert.strictEqual(modelArkSubmitCount, 0, 'ModelArk submit count TUYET DOI phai bang 0!');
        } finally {
            sb.restore();
            sb.cleanup();
        }
    });

    await reporter.test(S_TOS, 'Tier 4: Restart & Recovery — object da co tren TOS duoc tai su dung, khong duplicate upload', async () => {
        const { ReferenceManager } = await import('../byteplus/reference_manager.js');
        const { BytePlusTosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        const { MockLasAssetProvider } = await import('../byteplus/assets/mock_las_provider.js');

        let uploadCallCount = 0;
        const mockFetch = async () => {
            uploadCallCount++;
            return { ok: true, status: 200 };
        };

        const tos = new BytePlusTosStorageProvider({
            accessKey: 'AK',
            secretKey: 'SK',
            bucket: 'gtf-video-reference',
            region: 'ap-southeast-1',
            fetchFn: mockFetch
        });

        const rm = new ReferenceManager({
            tosProvider: tos,
            assetProvider: new MockLasAssetProvider()
        });

        const tmpFile = path.join(os.tmpdir(), `existing_ref_${Date.now()}.png`);
        fs.writeFileSync(tmpFile, 'png-bytes');

        try {
            const task = {
                id: 'task_recovered',
                prompt: 'Recovered prompt',
                references: [
                    {
                        type: 'image',
                        id: 'ref_already_uploaded',
                        localPath: tmpFile,
                        storageProvider: 'tos',
                        remoteObjectKey: 'gtf-video-ai/2026/09/07/task_recovered/ref_already_uploaded-photo.png',
                        remoteUrl: 'https://gtf-video-reference.tos-ap-southeast-1.bytepluses.com/expired-url'
                    }
                ]
            };

            const prepared = await rm.prepare(task);
            assert.strictEqual(prepared.length, 1);
            assert.strictEqual(prepared[0].remoteObjectKey, 'gtf-video-ai/2026/09/07/task_recovered/ref_already_uploaded-photo.png');
            assert.ok(prepared[0].remoteUrl !== 'https://gtf-video-reference.tos-ap-southeast-1.bytepluses.com/expired-url');
            assert.ok(prepared[0].remoteUrl.startsWith('https://gtf-video-reference.tos-ap-southeast-1.bytepluses.com/'));
            assert.strictEqual(uploadCallCount, 0, 'Object da co tren TOS khong duoc upload lai khi recover!');
        } finally {
            try { fs.unlinkSync(tmpFile); } catch (_) {}
        }
    });

    await reporter.test(S_TOS, 'Tier 4: Bao ve Secret — Access Key va Secret Key khong bao gio xuat hien trong Settings, task JSON hay logs', async () => {
        const { providerStatus, config } = await import('../byteplus/config.js');
        const status = providerStatus();

        // Kiểm tra kết quả trả về của Settings
        const statusStr = JSON.stringify(status);
        assert.ok(!statusStr.includes('accessKey'));
        assert.ok(!statusStr.includes('secretKey'));
        assert.ok(!statusStr.includes(config.tos.accessKey || 'nonexistent_ak'));
        assert.ok(!statusStr.includes(config.tos.secretKey || 'nonexistent_sk'));

        // Kiểm tra đối tượng tham chiếu trả về từ TOS provider
        const { BytePlusTosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        const provider = new BytePlusTosStorageProvider({
            accessKey: 'SECRET_ACCESS_KEY_VALUE_123',
            secretKey: 'SECRET_SECRET_KEY_VALUE_456',
            bucket: 'gtf-video-reference',
            region: 'ap-southeast-1'
        });

        const tmpFile = path.join(os.tmpdir(), `secret_test_${Date.now()}.png`);
        fs.writeFileSync(tmpFile, 'data');

        try {
            const mockFetch = async () => ({ ok: true, status: 200 });
            const uploadRes = await provider.upload(tmpFile, { fetchFn: mockFetch });
            const resStr = JSON.stringify(uploadRes);

            // Kiểm tra provider không trả về thuộc tính credentials trong object
            assert.strictEqual(uploadRes.accessKey, undefined);
            assert.strictEqual(uploadRes.secretKey, undefined);
            assert.strictEqual(uploadRes.credentials, undefined);

            // Secret Key tuyệt đối không xuất hiện trong payload hay URL
            assert.ok(!resStr.includes('SECRET_SECRET_KEY_VALUE_456'), 'Secret Key tuyet doi khong duoc xuat hien');
        } finally {
            try { fs.unlinkSync(tmpFile); } catch (_) {}
        }
    });

    await reporter.test(S_TOS, 'Tier 4: Khoa an toan ALLOW_LIVE_BYTEPLUS_TESTS chan upload TOS that khi chua bat', async () => {
        const { BytePlusTosStorageProvider } = await import('../byteplus/storage/tos_provider.js');
        const tmpFile = path.join(os.tmpdir(), `live_guard_${Date.now()}.png`);
        fs.writeFileSync(tmpFile, 'data');

        try {
            const provider = new BytePlusTosStorageProvider({
                accessKey: 'ak-live',
                secretKey: 'sk-live',
                bucket: 'gtf-video-reference',
                region: 'ap-southeast-1',
                allowLiveTests: false,
                fetchFn: null
            });

            await assert.rejects(async () => {
                await provider.upload(tmpFile);
            }, err => err.code === 'LIVE_TEST_DISABLED');
        } finally {
            try { fs.unlinkSync(tmpFile); } catch (_) {}
        }
    });
}

export default runByteplusTests;
