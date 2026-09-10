/**
 * byteplus/routes.js
 * Toan bo API cua he thong moi, nam duoi tien to /api/byteplus.
 * Khong dung chung route nao voi he thong Higgsfield cu.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { config, providerStatus, loadDotenv } from './config.js';
import { byteplusMultipart, classify } from './multipart.js';
import { newReferenceId } from './reference_manager.js';
import { ValidationError } from './task_factory.js';
import { calculateKieQuote, KIE_CREDIT_USD_RATE } from './kie_pricing.js';
import { usageManager } from './usage_manager.js';
import { KieSeedanceProvider } from './providers/kie_seedance_provider.js';

function fail(res, err, fallbackStatus = 400) {
    const status = err instanceof ValidationError ? 422 : fallbackStatus;
    res.status(status).json({
        error: err.message || 'Loi khong xac dinh',
        code: err.code || 'ERROR',
        errors: err.errors || undefined
    });
}

export function createByteplusRouter({ queue, kols }) {
    const router = express.Router();
    router.use(express.json({ limit: '25mb' }));
    router.use(byteplusMultipart(config.uploadsDir));

    router.get('/account/credits', async (req, res) => {
        try {
            loadDotenv();
            let balance = null;
            let error = null;

            // Fetch real Kie credit balance ONLY from Kie API through backend
            const provider = (queue && queue.provider && typeof queue.provider.getRemainingCredits === 'function')
                ? queue.provider
                : (config.kie && config.kie.apiKey ? new KieSeedanceProvider({ apiKey: config.kie.apiKey, baseUrl: config.kie.baseUrl }) : null);

            if (!config.kie || !config.kie.apiKey) {
                error = 'KIE_API_KEY_MISSING: Chưa cấu hình KIE_API_KEY trong file .env';
            } else if (provider) {
                try {
                    balance = await provider.getRemainingCredits();
                } catch (err) {
                    error = err.message || 'KIE_PROVIDER_FAILED';
                }
            }

            const summary = usageManager.getSummary({ realBalance: balance });
            res.json({
                success: balance !== null,
                configured: Boolean(config.kie && config.kie.apiKey),
                credits: balance,
                balance,
                usd: balance !== null ? Number((balance * KIE_CREDIT_USD_RATE).toFixed(4)) : null,
                error,
                usageSummary: summary
            });
        } catch (err) {
            fail(res, err);
        }
    });

    // -- Live Cost Estimator Endpoint --
    router.post('/pricing/quote', (req, res) => {
        try {
            const { resolution, outputDuration, inputVideoDuration } = req.body;
            const quote = calculateKieQuote({
                resolution,
                outputDuration: Number(outputDuration) || 4,
                inputVideoDuration: Number(inputVideoDuration) || 0
            });
            res.json({ success: true, quote });
        } catch (err) {
            fail(res, err);
        }
    });

    // ── trang thai & cau hinh ──────────────────────────────────────────────
    router.get('/status', (req, res) => {
        loadDotenv();
        const isKie = config.provider === 'kie';
        const isTosConfigured = Boolean(config.tos.accessKey && config.tos.secretKey && config.tos.bucket && config.tos.region);
        res.json({
            mode: config.mode,
            provider: config.provider,
            activeProviderName: isKie ? 'KIE' : (config.provider === 'openrouter' ? 'OpenRouter Seedance 2.5' : (config.provider === 'byteplus' ? 'BytePlus ModelArk' : 'Mock Seedance')),
            referenceStorage: isKie ? 'KIE upload' : (config.provider === 'byteplus' ? 'BytePlus TOS' : 'Mock TOS'),
            tos: isKie ? 'not used' : (isTosConfigured ? 'Configured' : 'Not configured'),
            las: isKie ? 'not used' : (config.las.enabled ? 'Enabled' : 'Not configured'),
            stats: queue.stats(),
            control: queue.control
        });
    });

    router.get('/settings', (req, res) => {
        res.json(providerStatus());
    });

    // ── tai file tham chieu ────────────────────────────────────────────────
    router.post('/upload', (req, res) => {
        const files = req.files || [];
        if (!files.length) return res.status(400).json({ error: 'Khong co file nao duoc tai len.' });
        const refs = [];
        for (const f of files) {
            const kind = f.kind || classify(f.originalName);
            if (!kind) {
                try { fs.unlinkSync(f.localPath); } catch (_) {}
                return res.status(415).json({ error: 'Dinh dang khong ho tro: ' + f.originalName });
            }
            refs.push({
                id: newReferenceId(kind),
                type: kind,
                source: 'upload',
                localPath: f.localPath,
                originalName: f.originalName,
                bytes: f.bytes,
                previewUrl: '/api/byteplus/upload-preview/' + encodeURIComponent(f.filename)
            });
        }
        res.json({ success: true, references: refs });
    });

    router.get('/upload-preview/:filename', (req, res) => {
        const name = path.basename(req.params.filename);
        const file = path.join(config.uploadsDir, name);
        if (!file.startsWith(path.resolve(config.uploadsDir))) return res.status(400).end();
        if (!fs.existsSync(file)) return res.status(404).json({ error: 'Khong tim thay file.' });
        res.sendFile(file);
    });

    // ── hang cho ───────────────────────────────────────────────────────────
    router.get('/queue', (req, res) => {
        const snap = queue.snapshot();
        const runningTask = queue.tasks.find(t => t.status === 'running') || null;
        const enrichedTasks = (snap.tasks || []).map(t => {
            if (!Array.isArray(t.references)) return t;
            const enrichedRefs = t.references.map(r => {
                if (r && r.type === 'kol' && (!r.previewUrl || !r.thumbnailUrl) && r.kolId && kols) {
                    const kol = kols.get(r.kolId);
                    if (kol && kol.thumbnailUrl) {
                        return { ...r, previewUrl: r.previewUrl || kol.thumbnailUrl, thumbnailUrl: r.thumbnailUrl || kol.thumbnailUrl };
                    }
                }
                return r;
            });
            return { ...t, references: enrichedRefs };
        });
        res.json({
            isRunning: snap.control.running,
            isPaused: snap.control.paused,
            currentTaskId: runningTask ? runningTask.id : null,
            currentTask: runningTask,
            queue: enrichedTasks,
            tasks: enrichedTasks
        });
    });

    router.post('/tasks', (req, res) => {
        try {
            const body = req.body || {};
            let references = typeof body.references === 'string'
                ? JSON.parse(body.references) : (body.references || []);
            if (!Array.isArray(references)) references = [];

            if (req.files && req.files.length > 0) {
                for (const f of req.files) {
                    const kind = f.kind || classify(f.originalName);
                    if (kind) {
                        references.push({
                            id: newReferenceId(kind),
                            type: kind,
                            source: 'upload',
                            localPath: f.localPath,
                            originalName: f.originalName,
                            bytes: f.bytes,
                            previewUrl: '/api/byteplus/upload-preview/' + encodeURIComponent(f.filename)
                        });
                    }
                }
            }

            let inputVideoDuration = Number(body.inputVideoDuration) || 0;
            if (inputVideoDuration <= 0 && references.some(r => r.type === 'video')) {
                inputVideoDuration = 4;
            }
            const quote = calculateKieQuote({
                resolution: body.resolution || '720p',
                outputDuration: Number(body.duration) || 16,
                inputVideoDuration
            });
            const task = queue.add({ ...body, references, quote });
            res.status(201).json({ success: true, task });
        } catch (err) { fail(res, err); }
    });

    // Alias for Legacy UI compatibility
    router.post('/queue/add', (req, res) => {
        try {
            const body = req.body || {};
            const references = [];
            
            // Neu user chon KOL ao tu thu vien KOL
            if (body.kolId) {
                const kol = kols.get(body.kolId);
                if (kol) {
                    const src = (kol.files && kol.files[0]) || kol.thumbnailPath;
                    references.push({
                        id: newReferenceId('kol'),
                        type: 'kol',
                        source: 'kol_library',
                        kolId: kol.id,
                        displayName: kol.displayName,
                        kolSourcePath: src,
                        assetProvider: kol.assetProvider,
                        assetId: kol.assetId,
                        assetUri: kol.assetUri,
                        localPath: src,
                        originalName: kol.displayName,
                        previewUrl: kol.thumbnailUrl
                    });
                }
            }
            
            // Handle files uploaded directly in the request (legacy UI behavior)
            if (req.files && req.files.length > 0) {
                for (const f of req.files) {
                    const kind = f.kind || classify(f.originalName);
                    if (kind) {
                        references.push({
                            id: newReferenceId(kind),
                            type: kind,
                            source: 'upload',
                            localPath: f.localPath,
                            originalName: f.originalName,
                            bytes: f.bytes,
                            previewUrl: '/api/byteplus/upload-preview/' + encodeURIComponent(f.filename)
                        });
                    }
                }
            }
            
            let inputVideoDuration = Number(body.inputVideoDuration) || 0;
            if (inputVideoDuration <= 0 && references.some(r => r.type === 'video')) {
                inputVideoDuration = 4;
            }
            const quote = calculateKieQuote({
                resolution: body.resolution || '480p',
                outputDuration: Number(body.duration) || 4,
                inputVideoDuration
            });
            const task = queue.add({ ...body, references, quote });
            res.json({ success: true, task });
        } catch (err) { fail(res, err); }
    });

    router.post('/tasks/bulk', (req, res) => {
        try {
            const body = req.body || {};
            const items = Array.isArray(body.tasks) ? body.tasks : [];
            if (!items.length) return res.status(400).json({ error: 'Danh sach task rong.' });
            const shared = body.shared || {};
            const inputs = items.map(it => {
                const combined = { ...shared, ...it };
                const quote = combined.quote || calculateKieQuote({
                    resolution: combined.resolution || '720p',
                    outputDuration: Number(combined.duration) || 16,
                    inputVideoDuration: Number(combined.inputVideoDuration) || 0
                });
                return { ...combined, quote };
            });
            const result = queue.addMany(inputs);
            res.json({ success: true, created: result.created.length, failed: result.failed, tasks: result.created });
        } catch (err) { fail(res, err); }
    });

    // Alias for bulk add
    router.post('/queue/bulk-add', (req, res) => {
        try {
            const body = req.body || {};
            const prompts = body.prompts || [];
            if (!prompts.length) return res.status(400).json({ error: 'Danh sach task rong.' });
            const shared = body.options || {};
            const creator = String(shared.creator || '').trim() || 'Người dùng';
            const baseTaskName = String(shared.taskName || '').trim() || 'Bulk Task';
            const inputs = prompts.map((p, i) => {
                const promptText = typeof p === 'string' ? p : (p?.prompt || '');
                const taskName = prompts.length > 1 ? `${baseTaskName} #${i + 1}` : baseTaskName;
                const combined = {
                    duration: 16,
                    aspectRatio: '16:9',
                    resolution: '720p',
                    ...shared,
                    ...(typeof p === 'object' ? p : {}),
                    creator,
                    taskName,
                    prompt: promptText
                };
                const quote = combined.quote || calculateKieQuote({
                    resolution: combined.resolution || '720p',
                    outputDuration: Number(combined.duration) || 16,
                    inputVideoDuration: Number(combined.inputVideoDuration) || 0
                });
                return { ...combined, quote };
            });
            const result = queue.addMany(inputs);
            if (result.created.length === 0 && result.failed.length > 0) {
                const firstErr = result.failed[0].errors ? result.failed[0].errors.join('; ') : 'Dữ liệu không hợp lệ';
                return res.status(400).json({ error: `Không tạo được task nào: ${firstErr}`, failed: result.failed });
            }
            res.json({ success: true, created: result.created.length, failed: result.failed, tasks: result.created });
        } catch (err) { fail(res, err); }
    });

    router.delete('/tasks/:id', (req, res) => {
        const ok = queue.remove(req.params.id);
        if (!ok) return res.status(404).json({ error: 'Khong tim thay task.' });
        res.json({ success: true });
    });
    // Alias
    router.delete('/queue/task/:id', (req, res) => {
        const ok = queue.remove(req.params.id);
        if (!ok) return res.status(404).json({ error: 'Khong tim thay task.' });
        res.json({ success: true });
    });

    router.post('/tasks/:id/retry', (req, res) => {
        const t = queue.retry(req.params.id);
        if (!t) return res.status(409).json({ error: 'Khong the thu lai task nay (khong ton tai hoac dang chay).' });
        res.json({ success: true, task: t });
    });
    // Alias
    router.post('/queue/task/:id/retry', (req, res) => {
        const t = queue.retry(req.params.id);
        if (!t) return res.status(409).json({ error: 'Khong the thu lai.' });
        res.json({ success: true, task: t });
    });

    router.post('/tasks/:id/move-top',  (req, res) => res.json({ success: queue.moveTop(req.params.id) }));
    router.post('/tasks/:id/move-up',   (req, res) => res.json({ success: queue.moveUp(req.params.id) }));
    router.post('/tasks/:id/move-down', (req, res) => res.json({ success: queue.moveDown(req.params.id) }));
    router.post('/tasks/:id/complete',  (req, res) => {
        const t = queue.find(req.params.id);
        if (!t) return res.status(404).json({ error: 'Khong tim thay task' });
        t.status = 'completed';
        t.progress = 100;
        t.completedAt = new Date().toISOString();
        queue.store.save();
        queue.emit('task-updated', t);
        queue.emit('queue-updated');
        res.json({ success: true, task: t });
    });

    router.post('/queue/reorder', (req, res) => {
        const ids = (req.body && (req.body.orderedIds || req.body.taskIds)) || [];
        if (!Array.isArray(ids)) return res.status(400).json({ error: 'orderedIds hoặc taskIds phải là mảng.' });
        queue.reorder(ids);
        res.json({ success: true });
    });

    router.post('/queue/start',  (req, res) => res.json({ success: true, control: queue.start() }));
    router.post('/queue/pause',  (req, res) => res.json({ success: true, control: queue.pause() }));
    router.post('/queue/resume', (req, res) => res.json({ success: true, control: queue.resume() }));
    router.post('/queue/stop',   (req, res) => res.json({ success: true, control: queue.stop() }));

    // Alias
    router.post('/queue/control', (req, res) => {
        const action = req.body.action;
        if (action === 'start') queue.start();
        else if (action === 'pause') queue.pause();
        else if (action === 'resume') queue.resume();
        else if (action === 'stop') queue.stop();
        else if (action === 'clearCompleted' || action === 'clear' || action === 'clear_completed') {
            const removed = queue.clearCompleted();
            return res.json({ success: true, removed });
        }
        res.json({ success: true });
    });

    router.delete('/queue/completed', (req, res) => {
        res.json({ success: true, removed: queue.clearCompleted() });
    });

    router.post('/queue/clear-completed', (req, res) => {
        res.json({ success: true, removed: queue.clearCompleted() });
    });

    // ── ket qua ────────────────────────────────────────────────────────────
    router.get('/output/:id', (req, res) => {
        const task = queue.find(req.params.id);
        if (!task || !task.localOutputPath) return res.status(404).json({ error: 'Task chua co ket qua.' });
        if (!fs.existsSync(task.localOutputPath)) return res.status(410).json({ error: 'File ket qua khong con tren dia.' });
        const dl = req.query.download === '1';
        const nice = (task.taskName || task.id).replace(/[^\w.\- ]+/g, '_') + '.mp4';
        const absPath = path.resolve(task.localOutputPath);
        if (dl) {
            return res.download(absPath, nice);
        }
        res.sendFile(absPath, {
            headers: {
                'Content-Type': 'video/mp4'
            },
            acceptRanges: true
        });
    });

    // CDN gia lap — chi ton tai o che do mock.
    router.get('/mock-cdn/:file', (req, res) => {
        const id = path.basename(req.params.file, '.mp4');
        const task = queue.tasks.find(t => t.providerTaskId === id);
        if (task && task.localOutputPath && fs.existsSync(task.localOutputPath)) {
            res.setHeader('Content-Type', 'video/mp4');
            return fs.createReadStream(task.localOutputPath).pipe(res);
        }
        const fixture = path.join(config.fixturesDir, 'mock_output.mp4');
        if (!fs.existsSync(fixture)) return res.status(404).json({ error: 'Khong co ket qua.' });
        res.setHeader('Content-Type', 'video/mp4');
        fs.createReadStream(fixture).pipe(res);
    });

    // ── lich su ────────────────────────────────────────────────────────────
    router.get('/history', (req, res) => {
        const { status, creator, q, from, to } = req.query;
        let list = queue.tasks.slice();
        if (status && status !== 'all') list = list.filter(t => t.status === status);
        if (creator) list = list.filter(t => (t.creator || '').toLowerCase() === String(creator).toLowerCase());
        if (from) list = list.filter(t => t.createdAt >= from);
        if (to) list = list.filter(t => t.createdAt <= to);
        if (q) {
            const n = String(q).toLowerCase();
            list = list.filter(t =>
                (t.taskName || '').toLowerCase().includes(n) ||
                (t.prompt || '').toLowerCase().includes(n) ||
                (t.creator || '').toLowerCase().includes(n) ||
                (t.id || '').toLowerCase().includes(n));
        }
        list = list.slice().reverse();
        const creators = [...new Set(queue.tasks.map(t => t.creator).filter(Boolean))].sort();
        res.json({ tasks: list, total: list.length, creators });
    });

    router.get('/tasks/:id', (req, res) => {
        const t = queue.find(req.params.id);
        if (!t) return res.status(404).json({ error: 'Khong tim thay task.' });
        res.json({ task: t });
    });

    // ── thu vien KOL ───────────────────────────────────────────────────────
    router.get('/kols', (req, res) => {
        res.json({ kols: kols.list({ q: req.query.q, tag: req.query.tag }), total: kols.all.length });
    });

    router.post('/kols', async (req, res) => {
        try {
            const body = req.body || {};
            const files = (req.files || []).map(f => f.localPath);
            const thumb = (req.files || []).find(f => f.kind === 'image');
            const kol = await kols.create({
                displayName: body.displayName,
                description: body.description,
                tags: body.tags,
                files,
                thumbnailPath: thumb ? thumb.localPath : null
            });
            if (thumb) {
                kol.thumbnailUrl = '/api/byteplus/upload-preview/' + encodeURIComponent(path.basename(thumb.localPath));
                kols.store.save();
            }
            res.json({ success: true, kol });
        } catch (err) { fail(res, err); }
    });

    router.patch('/kols/:id', (req, res) => {
        const kol = kols.update(req.params.id, req.body || {});
        if (!kol) return res.status(404).json({ error: 'Khong tim thay KOL.' });
        res.json({ success: true, kol });
    });

    router.delete('/kols/:id', (req, res) => {
        const ok = kols.remove(req.params.id);
        if (!ok) return res.status(404).json({ error: 'Khong tim thay KOL.' });
        res.json({ success: true });
    });

    return router;
}

export default createByteplusRouter;
