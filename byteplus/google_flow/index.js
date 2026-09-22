/**
 * byteplus/google_flow/index.js
 *
 * Router HTTP cho Flow Queue (Google Flow qua Chrome CDP — cổng 9334).
 * Mount tại /api/google-flow trong server.js. UI: /byteplus/Flowqueue.
 *
 * Luồng điều khiển Flow copy từ Canvas-AI (runner.mjs); hàng chờ ở queue.js.
 * Độc lập hoàn toàn với V1 Higgsfield (CDP 9333) và luồng Kie hiện có.
 */
import express from 'express';
import { byteplusMultipart } from '../multipart.js';
import { FlowQueue, FLOW_ROOT, UPLOADS_DIR } from './queue.js';

function fail(res, err, code = 400) {
    res.status(code).json({ error: String((err && err.message) || err) });
}

export function createGoogleFlowRouter({ log } = {}) {
    const queue = new FlowQueue({ log: log || (() => {}) });
    const router = express.Router();

    // File tĩnh: outputs (video/ảnh thành phẩm) + uploads (ảnh khung hình).
    router.use('/files', express.static(FLOW_ROOT));

    // Trạng thái worker + kết nối CDP thật (probe /json/version).
    router.get('/status', async (req, res) => {
        const cdp = await queue.cdpProbe();
        res.json({ ...queue.status(), cdp });
    });

    router.get('/jobs', (req, res) => {
        res.json({ ...queue.status(), jobs: queue.listJobs() });
    });

    // Upload ảnh khung hình (multipart, field bất kỳ) → trả media id gắn vào job.
    router.post('/media', byteplusMultipart(UPLOADS_DIR), (req, res) => {
        try {
            const files = req.files || [];
            if (!files.length) return fail(res, 'Không có file nào được tải lên.');
            const added = queue.registerMedia(files);
            if (!added.length) return fail(res, 'Chỉ hỗ trợ file ảnh hoặc video.', 415);
            res.json({
                success: true,
                media: added.map(m => ({
                    id: m.id,
                    originalName: m.originalName,
                    kind: m.kind,
                    url: `/api/google-flow/files/uploads/${m.storedName}`,
                })),
            });
        } catch (err) { fail(res, err, 500); }
    });

    // Tạo job mới. Submit từ UI = user đồng ý chạy → worker tự nổ máy.
    router.post('/jobs', (req, res) => {
        try { res.status(201).json({ success: true, job: queue.createJob(req.body || {}) }); }
        catch (err) { fail(res, err); }
    });

    router.post('/jobs/:id/retry', (req, res) => {
        try { res.json({ success: true, job: queue.retryJob(req.params.id) }); }
        catch (err) { fail(res, err); }
    });

    router.delete('/jobs/:id', (req, res) => {
        try { queue.removeJob(req.params.id); res.json({ success: true }); }
        catch (err) { fail(res, err); }
    });

    // Worker: sau restart luôn đứng im (§12/§17) — user bấm ▶ mới chạy tiếp.
    router.post('/worker/start', (req, res) => { queue.startWorker(); res.json({ success: true, ...queue.status() }); });
    router.post('/worker/pause', (req, res) => { queue.pauseWorker(); res.json({ success: true, ...queue.status() }); });

    // Lưu URL project Flow (labs.google/fx/vi/tools/flow/project/<uuid>).
    router.post('/settings', (req, res) => {
        try { res.json({ success: true, workspaceUrl: queue.setWorkspaceUrl((req.body || {}).workspaceUrl) }); }
        catch (err) { fail(res, err); }
    });

    return router;
}
