/**
 * byteplus/queue_manager.js
 *
 * Bo dieu phoi hang cho cua he thong moi.
 *
 * DIEM QUAN TRONG NHAT:
 *  - Rolling concurrency: slot vua trong la nap ngay task ke tiep.
 *  - dispatch() idempotent va CHIEM SLOT DONG BO (khong co await giua luc kiem
 *    tra va luc danh dau running), nen khong the vuot qua maxConcurrency.
 *  - Khoi phuc sau restart: task da co providerTaskId thi KHONG BAO GIO gui lai,
 *    chi noi lai bang resume().
 */
import path from 'path';
import { EventEmitter } from 'events';
import { JsonStore, ensureDir, safeJoin, safeSegment } from './store.js';
import { config } from './config.js';
import { createTask, ValidationError } from './task_factory.js';
import { ReferenceManager, assignAliases } from './reference_manager.js';
import { usageManager } from './usage_manager.js';

export class ByteplusQueueManager extends EventEmitter {
    constructor({ provider, tosProvider, assetProvider, kolLibrary, dbPath = config.queueDbPath }) {
        super();
        this.provider = provider;
        this.refs = new ReferenceManager({ tosProvider, assetProvider, kolLibrary });
        this.kols = kolLibrary;

        this.store = new JsonStore(dbPath, {
            tasks: [],
            control: { running: true, paused: false }
        });
        this.store.load();
        if (!Array.isArray(this.store.data.tasks)) this.store.data.tasks = [];
        if (!this.store.data.control) this.store.data.control = { running: true, paused: false };

        this.active = new Map();
        this._dispatching = false;
        this._recovered = [];
    }

    get tasks() { return this.store.data.tasks; }
    get control() { return this.store.data.control; }
    get maxConcurrency() { return config.maxConcurrency; }
    get activeCount() { return this.active.size; }

    find(id) { return this.tasks.find(t => t.id === id) || null; }

    stats() {
        const s = { total: this.tasks.length, pending: 0, running: 0, completed: 0, failed: 0 };
        for (const t of this.tasks) if (s[t.status] !== undefined) s[t.status]++;
        s.active = this.activeCount;
        s.maxConcurrency = this.maxConcurrency;
        s.queueRunning = this.control.running;
        s.queuePaused = this.control.paused;
        return s;
    }

    snapshot() {
        const runningTask = this.tasks.find(t => t.status === 'running') || null;
        return {
            tasks: this.tasks,
            control: this.control,
            stats: this.stats(),
            mode: config.mode,
            currentTaskId: runningTask ? runningTask.id : null,
            currentTask: runningTask
        };
    }

    recover() {
        const notes = [];
        for (const t of this.tasks) {
            if (t.status !== 'running') continue;
            if (!t.providerTaskId) {
                t.status = 'pending';
                t.progress = 0;
                t.pipelineStage = null;
                t.startedAt = null;
                notes.push({ taskId: t.id, action: 'requeued', reason: 'chua gui len provider' });
            } else {
                t.pipelineStage = t.pipelineStage || 'Generating';
                t.recoveredAt = new Date().toISOString();
                notes.push({ taskId: t.id, action: 'resume', providerTaskId: t.providerTaskId });
            }
        }
        this._recovered = notes;
        this.store.save();
        return notes;
    }

    get recoveryNotes() { return this._recovered; }

    add(input) {
        const task = createTask(input);
        this._attachKolSnapshots(task);
        this.tasks.push(task);
        usageManager.recordTask(task, { status: 'pending' });
        this.store.save();
        this.emit('task-created', task);
        this.emit('queue-updated');
        this.dispatch();
        return task;
    }

    addMany(inputs) {
        const created = [];
        const failed = [];
        for (let i = 0; i < inputs.length; i++) {
            try {
                const task = createTask(inputs[i]);
                this._attachKolSnapshots(task);
                this.tasks.push(task);
                usageManager.recordTask(task, { status: 'pending' });
                created.push(task);
            } catch (err) {
                failed.push({ index: i, errors: err instanceof ValidationError ? err.errors : [err.message] });
            }
        }
        if (created.length) {
            this.store.save();
            this.emit('queue-updated');
            this.dispatch();
        }
        return { created, failed };
    }

    _attachKolSnapshots(task) {
        for (const ref of task.references) {
            if (ref.type !== 'kol') continue;
            const kol = this.kols.get(ref.kolId);
            if (kol) {
                ref.displayName = kol.displayName;
                ref.assetProvider = kol.assetProvider;
                ref.assetId = kol.assetId;
                this.kols.markUsed(kol.id);
            }
        }
        task.references = assignAliases(task.references);
    }

    start() {
        this.control.running = true;
        this.control.paused = false;
        this.store.save();
        this.emit('queue-started');
        this.emit('queue-updated');
        this.dispatch();
        return this.control;
    }

    pause() {
        this.control.paused = true;
        this.store.save();
        this.emit('queue-paused');
        this.emit('queue-updated');
        return this.control;
    }

    resume() {
        this.control.paused = false;
        this.store.save();
        this.emit('queue-resumed');
        this.emit('queue-updated');
        this.dispatch();
        return this.control;
    }

    stop() {
        this.control.running = false;
        this.control.paused = false;
        for (const [taskId, ctrl] of this.active) {
            ctrl.abort();
            const t = this.find(taskId);
            if (t) {
                t.status = 'pending';
                t.progress = 0;
                t.pipelineStage = null;
                t.startedAt = null;
            }
        }
        this.active.clear();
        this.store.save();
        this.emit('queue-stopped');
        this.emit('queue-updated');
        return this.control;
    }

    remove(id) {
        const i = this.tasks.findIndex(t => t.id === id);
        if (i === -1) return false;
        const ctrl = this.active.get(id);
        if (ctrl) { ctrl.abort(); this.active.delete(id); }
        this.tasks.splice(i, 1);
        this.store.save();
        this.emit('queue-updated');
        this.dispatch();
        return true;
    }

    retry(id) {
        const t = this.find(id);
        if (!t || t.status === 'running') return null;
        t.status = 'pending';
        t.error = null;
        // Nếu đã sinh video thành công trên provider (đã có outputUrl)
        // và chỉ thất bại ở khâu download, GIỮ NGUYÊN providerTaskId và outputUrl để chỉ tải lại.
        if (t.outputUrl) {
            t.progress = 96;
            t.pipelineStage = 'Downloading';
        } else {
            t.progress = 0;
            t.pipelineStage = null;
            t.providerTaskId = null;
            t.providerStatus = null;
        }
        t.startedAt = null;
        t.completedAt = null;
        this.store.save();
        this.emit('task-updated', t);
        this.emit('queue-updated');
        this.dispatch();
        return t;
    }

    _move(id, fn) {
        const i = this.tasks.findIndex(t => t.id === id);
        if (i === -1) return false;
        const [t] = this.tasks.splice(i, 1);
        fn(this.tasks, t, i);
        this.store.save();
        this.emit('queue-updated');
        return true;
    }

    moveTop(id)  { return this._move(id, (arr, t) => arr.unshift(t)); }
    moveUp(id)   { return this._move(id, (arr, t, i) => arr.splice(Math.max(0, i - 1), 0, t)); }
    moveDown(id) { return this._move(id, (arr, t, i) => arr.splice(Math.min(arr.length, i + 1), 0, t)); }

    reorder(orderedIds) {
        const byId = new Map(this.tasks.map(t => [t.id, t]));
        const next = [];
        for (const id of orderedIds) {
            const t = byId.get(id);
            if (t) { next.push(t); byId.delete(id); }
        }
        for (const t of this.tasks) if (byId.has(t.id)) next.push(t);
        this.store.data.tasks = next;
        this.store.save();
        this.emit('queue-updated');
        return true;
    }

    clearCompleted() {
        // YÊU CẦU NGHIÊM NGẶT TỪ NGƯỜI DÙNG:
        // "Cái nút Dọn đã xong là chỉ dọn trên UI thôi backend thì ko nhá đừng có mà dọn cả backend đấy"
        // Backend tuyệt đối KHÔNG xóa các task completed khỏi database, bảo toàn 100% dữ liệu và video.
        const completedCount = this.tasks.filter(t => t.status === 'completed').length;
        this.emit('queue-cleared', 0);
        return completedCount;
    }

    dispatch() {
        if (this._dispatching) return;
        this._dispatching = true;
        try {
            if (!this.control.running || this.control.paused) return;
            while (this.active.size < this.maxConcurrency) {
                const next = this.tasks.find(t => t.status === 'pending' && !this.active.has(t.id));
                if (!next) break;

                const ctrl = new AbortController();
                this.active.set(next.id, ctrl);
                next.status = 'running';
                next.startedAt = next.startedAt || new Date().toISOString();
                next.attempts += 1;
                next.pipelineStage = 'Preparing References';
                next.progress = 2;

                this.emit('task-running', next);
                this._run(next, ctrl).catch(() => {});
            }
        } finally {
            this._dispatching = false;
        }
        this.store.saveDebounced();
        this.emit('queue-updated');
    }

    resumeRecovered() {
        for (const t of this.tasks) {
            if (t.status === 'running' && t.providerTaskId && !this.active.has(t.id)) {
                const ctrl = new AbortController();
                this.active.set(t.id, ctrl);
                this.emit('task-running', t);
                this._run(t, ctrl, { resuming: true }).catch(() => {});
            }
        }
    }

    _setStage(task, stage, progress) {
        task.pipelineStage = stage;
        if (typeof progress === 'number') task.progress = progress;
        this.store.saveDebounced();
        this.emit('task-updated', task);
        this.emit('task-stage', { task, stage, progress: task.progress });
    }

    async _run(task, ctrl, opts) {
        const resuming = Boolean(opts && opts.resuming);
        const signal = ctrl.signal;
        try {
            if (resuming && task.providerTaskId) {
                this._setStage(task, task.pipelineStage || 'Generating', task.progress || 35);
                const res = await this.provider.resume(task.providerTaskId, {
                    signal,
                    onProgress: p => {
                        task.providerStatus = p.providerStatus;
                        if (p.providerStatus === 'succeeded') {
                            this.active.delete(task.id);
                            this.dispatch();
                        }
                        this._setStage(task, p.stage, p.progress);
                    }
                });
                await this._finish(task, res);
                return;
            }

            // Nếu task đã có providerTaskId (từ lần chạy trước hoặc retry sau khi đã có outputUrl):
            // TUYỆT ĐỐI KHÔNG submit lại để tránh tốn credit lần 2.
            if (task.providerTaskId) {
                if (task.outputUrl) {
                    await this._finish(task, { outputUrl: task.outputUrl, providerStatus: 'succeeded' });
                    return;
                }
                this._setStage(task, task.pipelineStage || 'Generating', task.progress || 35);
                const res = await this.provider.waitForCompletion(task.providerTaskId, {
                    signal,
                    onProgress: p => {
                        task.providerStatus = p.providerStatus;
                        if (p.providerStatus === 'succeeded') {
                            this.active.delete(task.id);
                            this.dispatch();
                        }
                        this._setStage(task, p.stage, p.progress);
                    }
                });
                await this._finish(task, res);
                return;
            }

            await this.refs.preflight(task);

            const prepared = await this.refs.prepare(task, {
                signal,
                onStage: (stage, pct) => this._setStage(task, stage, pct)
            });
            task.references = prepared;

            this._setStage(task, 'Submitting', 22);
            const sub = await this.provider.submit(task, { signal });
            task.providerTaskId = sub.providerTaskId;
            task.providerStatus = sub.providerStatus;
            task.submitCount += 1;
            await this.store.save();
            this.emit('task-updated', task);

            this._setStage(task, 'Queued', 25);
            const res = await this.provider.waitForCompletion(task.providerTaskId, {
                signal,
                onProgress: p => {
                    task.providerStatus = p.providerStatus;
                    if (p.providerStatus === 'succeeded') {
                        this.active.delete(task.id);
                        this.dispatch();
                    }
                    this._setStage(task, p.stage, p.progress);
                }
            });

            await this._finish(task, res);

        } catch (err) {
            this.active.delete(task.id);
            if (err && err.message === 'Cancelled') {
                task.status = 'pending';
                task.progress = 0;
                task.pipelineStage = null;
            } else {
                task.status = 'failed';
                task.completedAt = new Date().toISOString();
                task.error = {
                    code: (err && err.code) || 'UNKNOWN',
                    message: (err && err.message) || String(err),
                    at: new Date().toISOString()
                };
                const failActual = (task.billing && Number.isFinite(task.billing.creditsConsumed)) ? task.billing.creditsConsumed : null;
                usageManager.recordTask(task, { actualCredits: failActual, status: 'failed' });
                this.emit('task-failed', task);
            }
            await this.store.save();
            this.emit('task-updated', task);
            this.emit('queue-updated');
            this.dispatch();
        }
    }

    async _finish(task, res) {
        if (this.active.delete(task.id)) this.dispatch();
        this._setStage(task, 'Downloading', 96);
        if (res && res.outputUrl) {
            task.outputUrl = res.outputUrl;
        }
        // Chi luu so lieu thanh toan do CHINH provider tra ve. Khong uoc luong.
        if (res && res.billing && (res.billing.creditsConsumed !== null || res.billing.costTimeMs !== null)) {
            task.billing = {
                provider: this.provider && this.provider.name ? this.provider.name : config.provider,
                model: this.provider && this.provider.model ? this.provider.model : null,
                duration: task.duration,
                resolution: task.resolution,
                creditsConsumed: res.billing.creditsConsumed,
                costTimeMs: res.billing.costTimeMs,
                at: new Date().toISOString()
            };
        }
        const dest = safeJoin(config.outputsDir, task.creator, task.taskName);
        ensureDir(dest);
        const file = path.join(dest, safeSegment(task.id) + '.mp4');
        await new Promise(resolve => setTimeout(resolve, 20));
        await this.provider.download(task.providerTaskId, file, { outputUrl: task.outputUrl });

        task.localOutputPath = file;
        task.outputWebPath = '/api/byteplus/output/' + encodeURIComponent(task.id);
        task.videoUrl = task.outputWebPath; // Alias for UI compatibility
        task.status = 'completed';
        task.pipelineStage = 'Completed';
        task.progress = 100;
        task.providerStatus = 'succeeded';
        task.completedAt = new Date().toISOString();
        task.error = null;

        // Luu actualCredits CHÍNH XÁC từ provider, tuyệt đối không bịa
        const actual = (res && res.billing && Number.isFinite(res.billing.creditsConsumed))
            ? res.billing.creditsConsumed
            : (task.billing && Number.isFinite(task.billing.creditsConsumed) ? task.billing.creditsConsumed : null);
        usageManager.recordTask(task, { actualCredits: actual, status: 'completed' });
        
        await this.store.save();
        this.emit('task-completed', task);
        this.emit('task-updated', task);
        this.emit('queue-updated');
    }

    async flush() { await this.store.flush(); }
}

export default ByteplusQueueManager;
