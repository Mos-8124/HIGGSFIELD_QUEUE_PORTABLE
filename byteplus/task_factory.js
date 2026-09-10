/**
 * byteplus/task_factory.js
 * Tao va kiem tra task cua he thong moi. Schema hoan toan doc lap voi task cu.
 */
import crypto from 'crypto';
import { config } from './config.js';
import { buildReference, assignAliases } from './reference_manager.js';

export const PIPELINE_STAGES = [
    'Preparing References',
    'Uploading References',
    'Submitting',
    'Queued',
    'Generating',
    'Downloading',
    'Completed'
];

export function newTaskId() {
    return 'bp_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

/** Loi kiem tra dau vao — mang theo danh sach loi de UI hien thi. */
export class ValidationError extends Error {
    constructor(errors) {
        super(errors.join(' '));
        this.name = 'ValidationError';
        this.code = 'VALIDATION_FAILED';
        this.errors = errors;
    }
}

/** Kiem tra du lieu tao task. Tra ve mang thong bao loi (rong = hop le). */
export function validateTaskInput(input) {
    const errors = [];
    const lim = config.limits;

    if (!input.creator || !String(input.creator).trim()) errors.push('Thieu ten nguoi tao.');
    if (!input.taskName || !String(input.taskName).trim()) errors.push('Thieu ten task.');
    if (!input.prompt || !String(input.prompt).trim()) errors.push('Thieu prompt mo ta video.');
    if (input.prompt && String(input.prompt).trim().length > 5000) errors.push('Prompt qua dai (toi da 5000 ky tu).');

    const rawDur = typeof input.duration === 'string' ? input.duration.replace(/s$/i, '').trim() : input.duration;
    const dur = (rawDur === undefined || rawDur === null || rawDur === '') ? 16 : Number(rawDur);
    if (!Number.isFinite(dur) || dur < lim.durationMin || dur > lim.durationMax) {
        errors.push('Thoi luong phai tu ' + lim.durationMin + ' den ' + lim.durationMax + ' giay.');
    }
    if (input.resolution && !lim.resolutions.includes(input.resolution)) {
        errors.push('Do phan giai khong ho tro: ' + input.resolution);
    }
    if (input.aspectRatio && !lim.aspectRatios.includes(input.aspectRatio)) {
        errors.push('Ti le khung hinh khong ho tro: ' + input.aspectRatio);
    }

    const refs = Array.isArray(input.references) ? input.references : [];
    const images = refs.filter(r => r.type === 'image').length;
    const videos = refs.filter(r => r.type === 'video').length;
    if (images > lim.maxImages) errors.push('Toi da ' + lim.maxImages + ' anh tham chieu.');
    if (videos > lim.maxVideos) errors.push('Toi da ' + lim.maxVideos + ' video tham chieu.');
    for (const r of refs) {
        if (!['image', 'video', 'kol'].includes(r.type)) errors.push('Loai tham chieu khong hop le: ' + r.type);
        if (r.type === 'kol' && !r.kolId) errors.push('Tham chieu KOL thieu kolId.');
        if (r.type !== 'kol' && !r.localPath) errors.push('Tham chieu ' + r.type + ' thieu file.');
    }
    return errors;
}

/** Tao mot task moi da chuan hoa. Nem ValidationError neu dau vao sai. */
export function createTask(input) {
    const errors = validateTaskInput(input);
    if (errors.length) throw new ValidationError(errors);

    const references = assignAliases((input.references || []).map(buildReference));
    const now = new Date().toISOString();

    const task = {
        id: newTaskId(),
        creator: String(input.creator).trim(),
        taskName: String(input.taskName).trim(),
        prompt: String(input.prompt).trim(),

        references,

        duration: (typeof input.duration === 'string' ? Number(input.duration.replace(/s$/i, '').trim()) : Number(input.duration)) || 16,
        aspectRatio: input.aspectRatio || '9:16',
        resolution: input.resolution || '480p',
        generateAudio: input.generateAudio !== false,

        status: 'pending',
        pipelineStage: null,
        progress: 0,

        provider: config.provider || (config.mode === 'mock' ? 'mock' : 'byteplus'),
        providerTaskId: null,
        providerStatus: null,
        submitCount: 0,

        attempts: 0,
        maxRetries: Number.isFinite(Number(input.maxRetries)) ? Number(input.maxRetries) : 2,

        outputUrl: null,
        localOutputPath: null,
        outputWebPath: null,

        error: null,

        createdAt: now,
        startedAt: null,
        completedAt: null,
        
        quote: input.quote || null,
        creditsConsumed: 0
    };

    // Chi ton tai o che do mock — dung de kiem thu cac nhanh loi.
    if (config.mode === 'mock' && input.mockFailure) {
        task.mockFailure = String(input.mockFailure);
    }
    return task;
}

/** Anh chup metadata KOL luu vao task, de doi ten KOL sau nay khong lam mat lich su. */
export function snapshotKol(kol) {
    return {
        kolId: kol.id,
        displayName: kol.displayName,
        assetProvider: kol.assetProvider,
        assetId: kol.assetId,
        snapshotAt: new Date().toISOString()
    };
}

export default { createTask, validateTaskInput, ValidationError, PIPELINE_STAGES, newTaskId, snapshotKol };
