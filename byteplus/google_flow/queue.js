/**
 * byteplus/google_flow/queue.js
 *
 * Flow Queue — hàng chờ tuần tự cho Google Flow (labs.google) qua Chrome CDP.
 * Luồng điều khiển trình duyệt nằm trong `runner.mjs` — copy NGUYÊN VĂN từ
 * Canvas-AI (`services/google-flow-runner.mjs`); file này chỉ bọc hàng chờ +
 * persistence + xử lý kết quả (ZIP/1 file), không sửa logic điều khiển Flow.
 *
 * Ràng buộc quan trọng:
 *  - CONCURRENCY = 1: một cửa sổ Chrome chỉ chạy được một job Flow một lúc.
 *  - §17 chống chạy trùng: job Flow KHÔNG có providerTaskId. Sau restart, job
 *    đang 'running' bị đánh dấu failed và KHÔNG BAO GIỜ tự chạy lại; job
 *    'queued' giữ nguyên nhưng worker chỉ nổ máy khi user chủ động
 *    (submit mới / ▶ Chạy hàng chờ / Chạy lại).
 *  - §12: mỗi lần chạy tiêu quota của tài khoản Google đang đăng nhập trong
 *    Chrome CDP — worker không bao giờ tự khởi động sau boot.
 *  - CDP bắt buộc loopback (127.0.0.1) — không được mở cổng debug ra LAN.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { unzipSync, gunzipSync } from 'fflate';
import { JsonStore, ensureDir, safeSegment } from '../store.js';
import { config } from '../config.js';
import { classify } from '../multipart.js';
import {
    runGoogleFlowJob, buildFlowJob, flowWorkspaceUrl,
    isZipDownload, isGzipDownload, selectAllFlowArchiveMedia, isFlowMediaFilename,
    FLOW_TASK_QUEUE_DELAY_MS, wait, setLastFlowJobFinishedAt,
    VEO_MODELS, VIDEO_RESOLUTIONS,
} from './runner.mjs';

export const FLOW_ROOT = path.join(config.root, 'flow_outputs');
export const UPLOADS_DIR = path.join(FLOW_ROOT, 'uploads');
export const OUTPUTS_DIR = path.join(FLOW_ROOT, 'outputs');
const DB_FILE = path.join(FLOW_ROOT, 'flow_queue_db.json');

export const DEFAULT_CDP_URL = 'http://127.0.0.1:9334';

/**
 * Phục hồi sau restart (§17): job 'running' → 'failed' (không tự chạy lại vì
 * không có providerTaskId để resume); job 'queued' giữ nguyên chờ user.
 * Hàm thuần để test được.
 */
export function recoverJobsOnBoot(jobs, now = new Date().toISOString()) {
    let changed = 0;
    for (const job of jobs || []) {
        if (job.status === 'running') {
            job.status = 'failed';
            job.error = 'Server restart giữa lúc job đang chạy — không tự chạy lại để tránh tiêu quota trùng (§17). Bấm "Chạy lại" nếu muốn thử lại.';
            job.finishedAt = now;
            changed++;
        }
    }
    return changed;
}

export class FlowQueue {
    constructor({ log = () => {}, flowRoot = null, store = null } = {}) {
        this.log = log;
        this.flowRoot = flowRoot || FLOW_ROOT;
        this.uploadsDir = path.join(this.flowRoot, 'uploads');
        this.outputsDir = path.join(this.flowRoot, 'outputs');
        const dbFile = path.join(this.flowRoot, 'flow_queue_db.json');
        this.store = store || new JsonStore(dbFile, { jobs: [], media: [], settings: {} });
        this.store.load();
        ensureDir(this.uploadsDir);
        ensureDir(this.outputsDir);
        const recovered = recoverJobsOnBoot(this.store.data.jobs);
        if (recovered) {
            this.store.save();
            this.log('warn', `${recovered} job đang chạy dở bị đánh dấu failed sau restart (§17)`);
        }
        this.enabled = false;     // worker chỉ chạy khi user chủ động
        this.active = false;      // đang có job chạy trong Chrome
        this.currentJobId = null;
    }

    // ── Cấu hình ────────────────────────────────────────────────────────────
    get cdpUrl() {
        return (process.env.GOOGLE_FLOW_CDP_URL || DEFAULT_CDP_URL).trim();
    }

    get workspaceUrl() {
        const fromSettings = String(this.store.data.settings.workspaceUrl || '').trim();
        const fromEnv = String(process.env.GOOGLE_FLOW_PROJECT_URL || '').trim();
        return fromSettings || fromEnv || undefined;
    }

    setWorkspaceUrl(url) {
        const trimmed = String(url || '').trim();
        if (trimmed) flowWorkspaceUrl(trimmed); // ném lỗi nếu không phải URL Flow hợp lệ
        this.store.data.settings.workspaceUrl = trimmed;
        this.store.save();
        return this.workspaceUrl || '';
    }

    /** CDP chỉ được phép loopback — theo cảnh báo bảo mật của Canvas-AI. */
    assertLoopback(url) {
        const hostname = new URL(url).hostname;
        if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)) {
            throw new Error('GOOGLE_FLOW_CDP_URL phải trỏ 127.0.0.1 — tuyệt đối không mở cổng CDP ra LAN/Internet.');
        }
    }

    async cdpProbe() {
        const cdpUrl = this.cdpUrl;
        try {
            this.assertLoopback(cdpUrl);
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 2500);
            const resp = await fetch(new URL('/json/version', cdpUrl), { signal: ctrl.signal });
            clearTimeout(timer);
            if (!resp.ok) return { connected: false, url: cdpUrl, error: `HTTP ${resp.status}` };
            const info = await resp.json();
            return { connected: true, url: cdpUrl, browser: info.Browser || '' };
        } catch (err) {
            return { connected: false, url: cdpUrl, error: String((err && err.message) || err) };
        }
    }

    // ── Media upload (ảnh khung hình) ───────────────────────────────────────
    /** files từ byteplusMultipart(UPLOADS_DIR): [{ originalName, localPath }] */
    registerMedia(files) {
        const added = [];
        for (const f of files || []) {
            const kind = classify(f.originalName);
            if (!kind) {
                try { fs.unlinkSync(f.localPath); } catch (_) {}
                continue;
            }
            const id = 'fm_' + crypto.randomBytes(5).toString('hex');
            const ext = path.extname(f.originalName).toLowerCase();
            const storedName = id + ext;
            fs.renameSync(f.localPath, path.join(this.uploadsDir, storedName));
            const rec = { id, storedName, originalName: f.originalName, kind, createdAt: new Date().toISOString() };
            this.store.data.media.push(rec);
            added.push(rec);
        }
        this.store.save();
        return added;
    }

    // ── Job lifecycle ───────────────────────────────────────────────────────
    listJobs() {
        return this.store.data.jobs;
    }

    status() {
        const counts = { queued: 0, running: 0, succeeded: 0, failed: 0 };
        for (const j of this.store.data.jobs) if (counts[j.status] !== undefined) counts[j.status]++;
        return {
            enabled: this.enabled,
            active: this.active,
            currentJobId: this.currentJobId,
            cdpUrl: this.cdpUrl,
            workspaceUrl: this.workspaceUrl || '',
            counts,
        };
    }

    createJob(payload) {
        // buildFlowJob validate toàn bộ (mode/prompt/ratio/duration/model/variants).
        const job = buildFlowJob({
            mode: payload.mode,
            prompt: payload.prompt,
            aspectRatio: payload.aspectRatio,
            duration: payload.duration,
            model: payload.model,
            variants: payload.variants,
            videoInputMode: payload.videoInputMode,
            resolution: payload.resolution,
        });
        const mediaIds = Array.isArray(payload.mediaIds) ? payload.mediaIds : [];
        const media = mediaIds.map(id => {
            const found = this.store.data.media.find(m => m.id === id);
            if (!found) throw new Error(`Media ${id} không tồn tại — hãy upload lại.`);
            return found;
        });
        const imageMedia = media.filter(m => m.kind === 'image');
        const videoMedia = media.filter(m => m.kind === 'video');

        if (imageMedia.length > 3) {
            throw new Error('Hệ thống chỉ cho phép tối đa 3 ảnh tham chiếu.');
        }
        if (videoMedia.length > 1) {
            throw new Error('Google Flow chỉ hỗ trợ tối đa 1 video làm tham chiếu.');
        }
        if (job.mode === 'video' && VEO_MODELS.has(job.model) && videoMedia.length > 0) {
            throw new Error(`Google Flow model "${job.model}" chỉ hỗ trợ ảnh tham chiếu, không hỗ trợ video tham chiếu. Chỉ Omni 1.1 Flash hỗ trợ video tham chiếu.`);
        }
        if (job.mode === 'image' && videoMedia.length > 0) {
            throw new Error('Chế độ tạo ảnh chỉ nhận ảnh tham chiếu, không nhận video.');
        }

        if (job.mode === 'video' && job.videoInputMode === 'frames') {
            if (media.length > 2) throw new Error('Chế độ Frames chỉ nhận tối đa 2 ảnh (khung đầu + khung cuối).');
            if (media.some(m => m.kind !== 'image')) throw new Error('Chế độ Frames chỉ nhận ảnh.');
        }
        const record = {
            id: 'flow_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex'),
            status: 'queued',
            ...job,
            mediaIds: media.map(m => m.id),
            mediaNames: media.map(m => m.originalName),
            outputs: [],
            error: null,
            logTail: [],
            submitCount: 0,
            createdAt: new Date().toISOString(),
            startedAt: null,
            finishedAt: null,
        };
        this.store.data.jobs.unshift(record);
        this.store.save();
        // User vừa bấm submit = đồng ý chạy (§12) → nổ máy worker.
        this.enabled = true;
        this.kick();
        return record;
    }

    retryJob(id) {
        const job = this.store.data.jobs.find(j => j.id === id);
        if (!job) throw new Error('Job không tồn tại.');
        if (job.status === 'running') throw new Error('Job đang chạy.');
        if (job.status === 'queued') throw new Error('Job đang chờ sẵn rồi.');
        job.status = 'queued';
        job.error = null;
        job.outputs = [];
        job.startedAt = null;
        job.finishedAt = null;
        this.store.save();
        this.enabled = true;
        this.kick();
        return job;
    }

    removeJob(id) {
        const idx = this.store.data.jobs.findIndex(j => j.id === id);
        if (idx === -1) throw new Error('Job không tồn tại.');
        if (this.store.data.jobs[idx].status === 'running') throw new Error('Không xóa được job đang chạy.');
        this.store.data.jobs.splice(idx, 1);
        this.store.save();
        const jobDir = path.join(this.outputsDir, safeSegment(id));
        try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch (_) {}
    }

    startWorker() { this.enabled = true; this.kick(); }
    pauseWorker() { this.enabled = false; } // job đang chạy vẫn hoàn tất (ngữ nghĩa PAUSE §42)

    // FIFO: unshift khi tạo → phần tử CUỐI mảng là job cũ nhất.
    nextQueued() {
        for (let i = this.store.data.jobs.length - 1; i >= 0; i--) {
            if (this.store.data.jobs[i].status === 'queued') return this.store.data.jobs[i];
        }
        return null;
    }

    kick() {
        if (this.active || !this.enabled) return;
        this.active = true;
        (async () => {
            try {
                while (this.enabled) {
                    const job = this.nextQueued();
                    if (!job) break;
                    await this.runJob(job);
                    // Sau khi lượt chạy trước tải xong và đẩy về backend:
                    // Nếu còn task xếp hàng sau, đợi 10s mới được tiếp tục (F5) task tiếp theo
                    if (this.enabled && this.nextQueued()) {
                        const nextJob = this.nextQueued();
                        const delayMs = typeof this.queueDelayMs === 'number' ? this.queueDelayMs : FLOW_TASK_QUEUE_DELAY_MS;
                        this.appendLog(job, `Còn task xếp hàng [${nextJob.id}]: đợi ${delayMs / 1000}s sau khi tải xong trước khi F5 làm task tiếp theo...`);
                        await wait(delayMs);
                    }
                }
            } finally {
                this.active = false;
                this.currentJobId = null;
            }
        })().catch(err => this.log('error', 'Flow worker crash: ' + ((err && err.message) || err)));
    }

    appendLog(job, line) {
        const entry = new Date().toISOString().slice(11, 19) + ' ' + line;
        job.logTail.push(entry);
        if (job.logTail.length > 40) job.logTail.splice(0, job.logTail.length - 40);
        this.store.saveDebounced();
        this.log('info', `[${job.id}] ${line}`);
    }

    async runJob(job) {
        this.currentJobId = job.id;
        job.status = 'running';
        job.startedAt = new Date().toISOString();
        job.error = null;
        job.submitCount = (job.submitCount || 0) + 1; // bằng chứng kiểm chứng được (§17)
        this.store.save();
        const jobDir = path.join(this.outputsDir, safeSegment(job.id));
        ensureDir(jobDir);
        const outputPath = path.join(jobDir, `${job.id}.download`);
        try {
            this.assertLoopback(this.cdpUrl);
            const mediaPaths = (job.mediaIds || []).map(id => {
                const m = this.store.data.media.find(x => x.id === id);
                if (!m) throw new Error(`Media ${id} đã bị xóa khỏi registry.`);
                const p = path.join(this.uploadsDir, safeSegment(m.storedName));
                if (!fs.existsSync(p)) throw new Error(`File media ${m.originalName} không còn trên đĩa.`);
                return p;
            });
            const builtJob = buildFlowJob(job); // rebuild để chắc chắn schema sạch
            this.appendLog(job, `bắt đầu (submit lần ${job.submitCount}) — ${builtJob.mode}/${builtJob.model}, media=${mediaPaths.length}`);
            // Nạp runner động với timestamp để hot-reload logic CDP mà không bị dính ESM module cache
            let runner = runGoogleFlowJob;
            try {
                const dynamicRunner = await import(`./runner.mjs?update=${Date.now()}`);
                if (dynamicRunner && dynamicRunner.runGoogleFlowJob) runner = dynamicRunner.runGoogleFlowJob;
            } catch (_) {}
            const generated = await runner({
                cdpUrl: this.cdpUrl,
                workspaceUrl: this.workspaceUrl,
                job: builtJob,
                mediaPaths,
                outputPath,
                queueDelayMs: typeof this.queueDelayMs === 'number' ? this.queueDelayMs : FLOW_TASK_QUEUE_DELAY_MS,
                log: line => this.appendLog(job, line),
            });
            // Xử lý kết quả — giữ đúng logic gốc trong vite.config.ts của Canvas-AI.
            const fallbackExtension = builtJob.mode === 'image' ? '.png' : '.mp4';
            let mediaFiles;
            let targetFilePath = null;
            if (generated.renderedMedia) {
                mediaFiles = generated.renderedMedia.map(m => ({
                    filename: m.suggestedFilename || `flow-output${fallbackExtension}`,
                    bytes: m.bytes,
                }));
            } else {
                targetFilePath = (generated?.outputPath && fs.existsSync(generated.outputPath)) ? generated.outputPath : outputPath;
                let rawBytes = fs.readFileSync(targetFilePath);
                let suggestedFilename = generated.suggestedFilename || path.basename(targetFilePath) || '';

                // Hỗ trợ giải nén mọi định dạng nén (GZIP, ZIP, v.v.) theo yêu cầu
                if (isGzipDownload(rawBytes, suggestedFilename)) {
                    try {
                        rawBytes = gunzipSync(new Uint8Array(rawBytes));
                        suggestedFilename = suggestedFilename.replace(/\.gz(?:ip)?$/i, '');
                    } catch {
                        throw new Error('Flow trả về file nén GZIP không đọc được.');
                    }
                }

                if (isZipDownload(rawBytes, suggestedFilename)) {
                    let archive;
                    try { archive = unzipSync(new Uint8Array(rawBytes)); }
                    catch { throw new Error('Flow trả về file ZIP không đọc được.'); }
                    mediaFiles = selectAllFlowArchiveMedia(archive, builtJob.mode, builtJob.variants);
                } else {
                    if (!isFlowMediaFilename(suggestedFilename, builtJob.mode)) {
                        // Nhận diện qua magic bytes nếu file tải về không có phần mở rộng
                        if (builtJob.mode === 'video' && rawBytes.length >= 8 &&
                            ((rawBytes[4] === 0x66 && rawBytes[5] === 0x74 && rawBytes[6] === 0x79 && rawBytes[7] === 0x70) ||
                             (rawBytes[0] === 0x1a && rawBytes[1] === 0x45 && rawBytes[2] === 0xdf && rawBytes[3] === 0xa3))) {
                            suggestedFilename = `${job.id}${rawBytes[0] === 0x1a ? '.webm' : '.mp4'}`;
                        } else if (builtJob.mode === 'image' && rawBytes.length >= 4 &&
                            ((rawBytes[0] === 0x89 && rawBytes[1] === 0x50 && rawBytes[2] === 0x4e && rawBytes[3] === 0x47) ||
                             (rawBytes[0] === 0xff && rawBytes[1] === 0xd8 && rawBytes[2] === 0xff))) {
                            suggestedFilename = `${job.id}${rawBytes[0] === 0x89 ? '.png' : '.jpg'}`;
                        } else {
                            throw new Error(`Flow trả về file không phải ${builtJob.mode}; từ chối lưu.`);
                        }
                    }
                    if (builtJob.variants > 1) throw new Error(`Flow trả về 1 file nhưng yêu cầu ${builtJob.variants} variant.`);
                    mediaFiles = [{ filename: suggestedFilename || `flow-output${fallbackExtension}`, bytes: new Uint8Array(rawBytes) }];
                }
            }
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            if (targetFilePath && fs.existsSync(targetFilePath)) fs.unlinkSync(targetFilePath);
            job.outputs = mediaFiles.map((m, i) => {
                const ext = path.extname(m.filename) || fallbackExtension;
                const filename = `${job.id}-${i + 1}${ext}`;
                fs.writeFileSync(path.join(jobDir, filename), m.bytes);
                return {
                    filename,
                    size: m.bytes.length,
                    url: `/api/google-flow/files/outputs/${safeSegment(job.id)}/${filename}`,
                };
            });
            job.status = 'succeeded';
            job.finishedAt = new Date().toISOString();
            setLastFlowJobFinishedAt(Date.now());
            this.appendLog(job, `HOÀN THÀNH — ${job.outputs.length} file: ${job.outputs.map(o => `${o.filename} (${o.size}B)`).join(', ')}`);
        } catch (err) {
            job.status = 'failed';
            job.error = String((err && err.message) || err);
            job.finishedAt = new Date().toISOString();
            setLastFlowJobFinishedAt(Date.now());
            this.appendLog(job, 'LỖI: ' + job.error);
        } finally {
            this.store.save();
            this.currentJobId = null;
        }
    }
}
