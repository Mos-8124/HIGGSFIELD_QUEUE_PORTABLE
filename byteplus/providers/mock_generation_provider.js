/**
 * byteplus/providers/mock_generation_provider.js
 *
 * Mo phong Seedance cua BytePlus theo dung hinh dang hop dong that:
 *   submit()   -> providerTaskId
 *   poll()     -> trang thai + tien do
 *   download() -> tai ket qua ve may
 *
 * Tien do tinh tu MOC THOI GIAN THAT luu trong registry, nen mot job van tiep
 * tuc dung sau khi server khoi dong lai — day chinh la co che cho phep resume
 * ma khong phai gui lai (khong sinh providerTaskId thu hai).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { JsonStore, ensureDir } from '../store.js';
import { config } from '../config.js';
import { calculateKieQuote } from '../kie_pricing.js';

const STAGES = [
    { at: 0.00, stage: 'Submitting',  providerStatus: 'submitted', progress: 5 },
    { at: 0.12, stage: 'Queued',      providerStatus: 'queued',    progress: 20 },
    { at: 0.30, stage: 'Generating',  providerStatus: 'running',   progress: 35 },
    { at: 0.50, stage: 'Generating',  providerStatus: 'running',   progress: 55 },
    { at: 0.72, stage: 'Generating',  providerStatus: 'running',   progress: 80 },
    { at: 0.90, stage: 'Downloading', providerStatus: 'running',   progress: 95 }
];

export class MockSeedanceProvider {
    constructor({ storePath = config.mockJobsPath, stageMs = config.mockStageMs } = {}) {
        this.name = 'mock';
        this.stageMs = stageMs;
        this.store = new JsonStore(storePath, { jobs: {} });
        this.store.load();
    }

    isConfigured() { return true; }

    _jobs() { return this.store.data.jobs; }

    async submit(task, { signal } = {}) {
        if (signal && signal.aborted) throw new Error('Cancelled');

        if (task && task.mockFailure === 'provider') {
            const err = new Error('Mock provider tu choi job (mo phong loi submit).');
            err.code = 'PROVIDER_SUBMIT_FAILED';
            throw err;
        }

        const providerTaskId = 'mock_seedance_' + crypto.randomBytes(6).toString('hex');
        const totalMs = Math.max(this.stageMs * STAGES.length, 60);

        this._jobs()[providerTaskId] = {
            providerTaskId,
            taskId: task.id,
            createdAt: Date.now(),
            totalMs,
            failMode: (task && task.mockFailure === 'generation') ? 'generation' : null,
            model: config.generation.model,
            request: {
                duration: task.duration,
                ratio: task.aspectRatio,
                resolution: task.resolution,
                referenceCount: Array.isArray(task.references) ? task.references.length : 0
            }
        };
        await this.store.save();

        return { providerTaskId, providerStatus: 'submitted' };
    }

    async poll(providerTaskId) {
        const job = this._jobs()[providerTaskId];
        if (!job) {
            const err = new Error('Khong tim thay job tren provider: ' + providerTaskId);
            err.code = 'PROVIDER_TASK_NOT_FOUND';
            throw err;
        }
        const elapsed = Date.now() - job.createdAt;
        const ratio = Math.min(elapsed / job.totalMs, 1);

        if (job.failMode === 'generation' && ratio >= 0.5) {
            return {
                providerStatus: 'failed',
                stage: 'Generating',
                progress: 55,
                error: {
                    code: 'GENERATION_FAILED',
                    message: 'Mock Seedance: sinh video that bai (mo phong loi generation).'
                }
            };
        }

        if (ratio >= 1) {
            const req = job.request || {};
            const duration = Number(req.duration) || 4;
            const resolution = req.resolution || '720p';
            const quote = calculateKieQuote({
                resolution,
                outputDuration: duration,
                inputVideoDuration: 0
            });
            return {
                providerStatus: 'succeeded',
                stage: 'Downloading',
                progress: 95,
                outputUrl: '/api/byteplus/mock-cdn/' + providerTaskId + '.mp4',
                billing: {
                    provider: 'mock',
                    model: 'bytedance/seedance-2-5',
                    duration,
                    resolution,
                    creditsConsumed: quote.credits,
                    costTimeMs: job.totalMs
                }
            };
        }

        let cur = STAGES[0];
        for (const s of STAGES) if (ratio >= s.at) cur = s;
        return { providerStatus: cur.providerStatus, stage: cur.stage, progress: cur.progress };
    }

    async waitForCompletion(providerTaskId, { onProgress, signal } = {}) {
        const emit = onProgress || function () {};
        for (;;) {
            if (signal && signal.aborted) throw new Error('Cancelled');
            const res = await this.poll(providerTaskId);
            emit(res);

            if (res.providerStatus === 'succeeded') return res;
            if (res.providerStatus === 'failed') {
                const err = new Error((res.error && res.error.message) || 'Job that bai tren provider');
                err.code = (res.error && res.error.code) || 'PROVIDER_FAILED';
                throw err;
            }
            await new Promise(r => setTimeout(r, config.mockPollMs));
        }
    }

    async resume(providerTaskId, opts) {
        return this.waitForCompletion(providerTaskId, opts || {});
    }

    async download(providerTaskId, destPath) {
        const job = this._jobs()[providerTaskId];
        if (!job) {
            const err = new Error('Khong tim thay job de tai: ' + providerTaskId);
            err.code = 'PROVIDER_TASK_NOT_FOUND';
            throw err;
        }
        const fixture = path.join(config.fixturesDir, 'mock_output.mp4');
        if (!fs.existsSync(fixture)) {
            const err = new Error('Thieu fixture MP4: byteplus/fixtures/mock_output.mp4');
            err.code = 'FIXTURE_MISSING';
            throw err;
        }
        ensureDir(path.dirname(destPath));
        fs.copyFileSync(fixture, destPath);
        return { localPath: destPath, bytes: fs.statSync(destPath).size };
    }

    hasJob(providerTaskId) { return Boolean(this._jobs()[providerTaskId]); }
    jobCount() { return Object.keys(this._jobs()).length; }
    getJob(providerTaskId) { return this._jobs()[providerTaskId] || null; }
}

export default MockSeedanceProvider;
