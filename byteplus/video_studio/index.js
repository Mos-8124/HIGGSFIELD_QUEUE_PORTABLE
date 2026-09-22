/**
 * byteplus/video_studio/index.js
 *
 * Tool "Video to Video" (GTF Video Studio theo SRS) — lắp ráp store + router.
 * Độc lập hoàn toàn với luồng tạo video Kie hiện có; chỉ chia sẻ server + cổng.
 *
 * ĐÃ LÀM (Phase 1 trong HIGGSFIELD):
 *  - Local Media Library: quét folder video local (ffprobe) + CRUD + stats (SRS §3).
 *  - GTF Project entity: giữ video đối thủ + trạng thái FSM (khung cho các bước sau).
 *
 * CHƯA LÀM (chờ chốt thiết kế — xem HANDOFF):
 *  - §4 Media Description Index (cần model xem được video/ảnh).
 *  - §6-7 Reference Analysis + Production Timeline (sinh kịch bản).
 *  - §9 Asset Validation, §10-11 Assembly (FFmpeg cắt kho) HAY đẩy Kie sinh mới.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { JsonStore, ensureDir } from '../store.js';
import { renderQueue } from './job_queue.js';
import { config } from '../config.js';
import { byteplusMultipart, classify } from '../multipart.js';
import { scanLibrary, generateThumbnail, probeVideo, fileFingerprint, extractAnalysisScorecard, normalizeCategory, LIBRARY_GROUPS, UPLOAD_CATEGORIES, planAssetDeletion } from './library.js';
import { analyzerWorker } from './analyzer_bridge.js';
import { generateTimeline, generateBatchTimelines, checkSemanticPreflight, readNineRouterApiKey, detectLanguageFromVoice, ensureLanguageTimeline, enforceVoiceDurationConstraint, pickHookFromLibrary, clampHookDuration, checkVariantDiversity } from './timeline_generator.js';
import { assembleVideo, batchAssemble } from './assembler.js';

/**
 * Đảm bảo kết quả phân tích AI (Mục đích, Đánh giá cấu trúc, Mô tả chi tiết) luôn là tiếng Việt 100%.
 * Nếu phát hiện kết quả trả về bằng tiếng Anh, tự động dịch sang tiếng Việt qua 9Router LLM.
 */
async function ensureVietnameseAnalysis(ana) {
    if (!ana || typeof ana !== 'object') return ana;
    const testText = [ana.purpose, ana.summary, ana.conclusion].filter(Boolean).join(' ');
    const hasViAccents = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/.test(testText);
    const hasEnglishWords = /\b(the|is|and|to|of|in|for|with|this|video|scene|demonstrating|features|promoting|vacuum|holding|living room|bedroom)\b/i.test(testText);

    if (testText.length > 8 && (!hasViAccents || hasEnglishWords)) {
        try {
            const apiKey = readNineRouterApiKey();
            if (apiKey) {
                const prompt = `Dịch toàn bộ nội dung JSON phân tích video sau sang tiếng Việt chuẩn xác, hấp dẫn và tự nhiên nhất. Giữ nguyên toàn bộ cấu trúc JSON, mốc thời gian start/end, chỉ dịch các trường text (purpose, summary, conclusion, scene, description, actions, objects, visible_text). BẮT BUỘC TRẢ VỀ JSON THUẦN TÚY KHÔNG KÈM TEXT NÀO KHÁC:\n${JSON.stringify({
                    purpose: ana.purpose || ana.summary || '',
                    summary: ana.summary || ana.purpose || '',
                    conclusion: ana.conclusion || '',
                    visual_events: (ana.visual_events || []).map(e => ({
                        start: e.start,
                        end: e.end,
                        scene: e.scene || '',
                        description: e.description || '',
                        actions: e.actions || [],
                        objects: e.objects || []
                    }))
                })}`;
                const resp = await fetch('http://127.0.0.1:20128/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: 'gemini-2.5-flash',
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.2
                    }),
                    signal: AbortSignal.timeout(12000)
                });
                if (resp.ok) {
                    const data = await resp.json();
                    const content = data.choices?.[0]?.message?.content || '';
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed.purpose) ana.purpose = parsed.purpose;
                        if (parsed.summary) ana.summary = parsed.summary;
                        if (parsed.conclusion) ana.conclusion = parsed.conclusion;
                        if (Array.isArray(parsed.visual_events) && parsed.visual_events.length && Array.isArray(ana.visual_events)) {
                            parsed.visual_events.forEach((pe, idx) => {
                                if (ana.visual_events[idx]) {
                                    if (pe.scene) ana.visual_events[idx].scene = pe.scene;
                                    if (pe.description) ana.visual_events[idx].description = pe.description;
                                    if (pe.actions) ana.visual_events[idx].actions = pe.actions;
                                    if (pe.objects) ana.visual_events[idx].objects = pe.objects;
                                }
                            });
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[VideoStudio] Lỗi dịch tiếng Việt dự phòng:', err.message);
        }
    }
    return ana;
}
import { AVAILABLE_VOICES } from './voice_generator.js';

/**
 * Guard: kết quả phân tích video của "AI" (LLM vision qua 9Router) có DÙNG ĐƯỢC không?
 * Trả {ok, reason}. Dùng để CHẶN hoàn tất Step 2 khi AI không gọi được API (rule §13 mock≠real,
 * §41 không nuốt lỗi): KHÔNG lưu, KHÔNG transition reference_analyzed nếu AI không thật sự phân tích.
 */
export function isReferenceAnalysisUsable(result) {
    if (!result || typeof result !== 'object') {
        return { ok: false, reason: 'AI phân tích không trả về kết quả (analyzer không phản hồi).' };
    }
    if (result.status === 'failed') {
        return { ok: false, reason: 'AI phân tích thất bại (status=failed) — kiểm tra API key/model 9Router (cổng 20128).' };
    }
    if (result.visual_status === 'failed') {
        return { ok: false, reason: 'AI thị giác (vision LLM) không gọi được API — không phân tích được hình ảnh video.' };
    }
    const events = Array.isArray(result.visual_events) ? result.visual_events : [];
    if (events.length === 0) {
        return { ok: false, reason: 'AI vision không sinh được sự kiện hình ảnh nào (khả năng API key/model không hoạt động).' };
    }
    // Chặn "bịa": summary rỗng/generic mặc định + purpose rỗng nghĩa là AI tổng hợp không ra nội dung thật.
    const summary = (result.summary || '').trim().toLowerCase();
    const purpose = (result.purpose || '').trim();
    const generic = new Set(['video multimodal analysis completed.', 'video analysis completed.']);
    if ((!summary || generic.has(summary)) && !purpose) {
        return { ok: false, reason: 'AI tổng hợp trả về rỗng/generic — không phân tích thật nội dung video (kiểm tra model/prompt).' };
    }
    return { ok: true, reason: '' };
}

/** Thư mục KHO video nguồn — cố định trong dự án. Override qua VIDEO_STUDIO_LIBRARY_DIR. */
export function resolveLibraryDir() {
    return process.env.VIDEO_STUDIO_LIBRARY_DIR
        ? path.resolve(process.env.VIDEO_STUDIO_LIBRARY_DIR)
        : path.join(config.root, 'kho');
}

// FSM trạng thái GTF Video Studio (khớp SRS §14).
export const GTF_STATES = [
    'library_ready', 'library_described', 'reference_imported', 'reference_analyzed',
    'timeline_generated', 'awaiting_script_review', 'script_approved', 'assembling',
    'video_ready', 'awaiting_final_review', 'final_approved', 'validation_failed', 'failed'
];

// Bảng chuyển trạng thái hợp lệ (SRS §14 + nhánh sửa). Tham khảo nightmare-studio/gtf_domain.py.
export const GTF_TRANSITIONS = {
    library_ready:          new Set(['library_described', 'reference_imported', 'failed']),
    library_described:      new Set(['reference_imported', 'failed']),
    reference_imported:     new Set(['reference_analyzed', 'failed']),
    reference_analyzed:     new Set(['timeline_generated', 'awaiting_script_review', 'failed']),
    timeline_generated:     new Set(['awaiting_script_review', 'failed']),
    awaiting_script_review: new Set(['script_approved', 'timeline_generated', 'awaiting_script_review', 'failed']),
    script_approved:        new Set(['assembling', 'timeline_generated', 'awaiting_script_review', 'validation_failed', 'failed']),
    assembling:             new Set(['video_ready', 'failed', 'script_approved', 'assembling']),
    video_ready:            new Set(['awaiting_final_review', 'assembling', 'script_approved', 'failed']),
    awaiting_final_review:  new Set(['final_approved', 'timeline_generated', 'assembling', 'script_approved', 'failed']),
    final_approved:         new Set(['timeline_generated', 'reference_analyzed', 'assembling']),
    validation_failed:      new Set(['script_approved', 'timeline_generated', 'failed']),
    failed:                 new Set(['library_ready', 'timeline_generated', 'reference_imported', 'reference_analyzed']),
};

/** Kiểm tra chuyển trạng thái có hợp lệ không. */
export function canTransition(current, target) {
    if (current === target) return true;
    const allowed = GTF_TRANSITIONS[current];
    return allowed ? allowed.has(target) : false;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * SỐ LIỆU TIẾN TRÌNH MÔ TẢ AI GỬI CHO UI.
 *
 * Lỗi user gặp: thanh tiến độ hiện "(193/181 clip)". Một vòng chạy đơn lẻ không thể
 * vượt tổng vì nó lặp trên mảng cố định — con số đó chứng minh có HAI vòng cùng tăng
 * chung một bộ đếm.
 *
 * Hàm này kẹp `done` lại cho UI khỏi hiện số vô lý, NHƯNG trả kèm cờ `overflow`:
 * kẹp im lặng là che lỗi, còn cờ thì vẫn thấy được mà truy.
 * ─────────────────────────────────────────────────────────────────────────
 */
/**
 * ─────────────────────────────────────────────────────────────────────────
 * CHỌN ĐÍCH KHI LƯU BẢNG SỬA KỊCH BẢN (step 4).
 *
 * Lỗi phát hiện khi làm tính năng này: bảng sửa ĐANG VÔ TÁC DỤNG.
 * `PUT /projects/:id/timeline` chỉ ghi `productionTimeline`, còn `/assemble` lại dựng
 * từ `batchTimelines` — hễ project có biến thể là `productionTimeline` bị bỏ qua hoàn
 * toàn. Nghĩa là user sửa clip/lời thoại, bấm Lưu, rồi render vẫn ra kịch bản cũ.
 *
 * Luật:
 *  - Có biến thể → luôn ghi vào MỘT biến thể cụ thể (mặc định biến thể đầu nếu client
 *    không gửi `variantIndex`, vì đó đúng là kịch bản bảng sửa đang hiện).
 *  - Chưa có biến thể → giữ đường cũ, ghi `productionTimeline`.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function resolveTimelineEditTarget(project, variantIndex) {
    const batches = (project && Array.isArray(project.batchTimelines)) ? project.batchTimelines : [];
    if (batches.length === 0) return { scope: 'single', index: -1, total: 0 };

    const n = Number(variantIndex);
    const usable = Number.isInteger(n) && n >= 0 && n < batches.length;
    return { scope: 'variant', index: usable ? n : 0, total: batches.length };
}

export function describeProgressView(stats) {
    const src = stats || {};
    const total = Math.max(0, Math.floor(Number(src.total)) || 0);
    const doneRaw = Math.max(0, Math.floor(Number(src.done)) || 0);
    return { total, done: Math.min(doneRaw, total), overflow: doneRaw > total };
}

export class VideoStudioStore {
    constructor({ root = config.root } = {}) {
        this.root = root;
        this.libraryStore = new JsonStore(path.join(root, 'video_studio_library.json'), { assets: [] });
        this.projectStore = new JsonStore(path.join(root, 'video_studio_projects.json'), { projects: [] });
        this.libraryStore.load();
        this.projectStore.load();
        if (!Array.isArray(this.libraryStore.data.assets)) this.libraryStore.data.assets = [];
        if (!Array.isArray(this.projectStore.data.projects)) this.projectStore.data.projects = [];

        // Tự động gán asset_id cho các video thiếu (video hook/đối thủ nạp tự động)
        let modified = false;
        for (const a of this.libraryStore.data.assets) {
            if (!a.asset_id) {
                a.asset_id = 'VID_' + crypto.randomBytes(5).toString('hex');
                modified = true;
            }
        }
        if (modified) {
            this.libraryStore.save();
        }

        // Tự động hồi phục các project bị treo ở trạng thái assembling khi server khởi động lại
        let projectModified = false;
        for (const p of this.projectStore.data.projects) {
            if (p.status === 'assembling') {
                const finalPath = path.join(this.root, 'video_studio_outputs', p.id, 'final.mp4');
                if (fs.existsSync(finalPath)) {
                    p.status = 'awaiting_final_review';
                    p.finalVideoPath = finalPath;
                } else {
                    p.status = 'script_approved';
                }
                projectModified = true;
            }
        }
        if (projectModified) {
            this.projectStore.save();
        }
    }

    // ── Library assets ──────────────────────────────────────────────
    listAssets(category) {
        const all = this.libraryStore.data.assets;
        const want = category ? normalizeCategory(category) : null;
        const list = !want ? all.slice() : all.filter(a => normalizeCategory(a.category) === want);
        return list.sort((a, b) => {
            const tA = a.mtime || (a.createdAt ? new Date(a.createdAt).getTime() : 0) || (a.file_hash ? Number(a.file_hash.split(':')[0]) : 0) || 0;
            const tB = b.mtime || (b.createdAt ? new Date(b.createdAt).getTime() : 0) || (b.file_hash ? Number(b.file_hash.split(':')[0]) : 0) || 0;
            return tB - tA;
        });
    }

    getAsset(assetId) {
        return this.libraryStore.data.assets.find(a => a.asset_id === assetId) || null;
    }

    upsertAsset(data) {
        const arr = this.libraryStore.data.assets;
        const i = arr.findIndex(a => a.path === data.path);
        const asset_id = data.asset_id || (i !== -1 ? arr[i].asset_id : null) || ('VID_' + crypto.randomBytes(5).toString('hex'));
        const fullData = { ...data, asset_id };
        if (i === -1) arr.push(fullData);
        else arr[i] = { ...arr[i], ...fullData };
        this.libraryStore.save();
        return arr[i === -1 ? arr.length - 1 : i];
    }

    deleteAsset(assetId) {
        const arr = this.libraryStore.data.assets;
        const i = arr.findIndex(a => a.asset_id === assetId);
        if (i === -1) return false;
        arr.splice(i, 1);
        this.libraryStore.save();
        return true;
    }

    libraryStats() {
        const assets = this.libraryStore.data.assets;
        const byCategory = {};
        let totalDuration = 0;
        let totalSize = 0;
        for (const a of assets) {
            totalDuration += Number(a.duration) || 0;
            totalSize += Number(a.file_size) || 0;
            const c = normalizeCategory(a.category);
            byCategory[c] = (byCategory[c] || 0) + 1;
        }
        return {
            total: assets.length,
            described: assets.filter(a => a.described).length,
            totalDurationSeconds: Math.round(totalDuration * 100) / 100,
            totalSizeBytes: totalSize,
            byCategory
        };
    }

    // ── GTF projects (khung cho cac buoc sau) ───────────────────────
    listProjects() { return this.projectStore.data.projects.slice().reverse(); }
    getProject(id) { return this.projectStore.data.projects.find(p => p.id === id) || null; }

    reloadStores() {
        this.libraryStore.load();
        this.projectStore.load();
    }

    createProject({ name, referenceVideoPath = null, referenceVideoName = null, hookVideoPath = null, hookVideoName = null, requestedOutputs = 10 } = {}) {
        const now = new Date().toISOString();
        const project = {
            id: 'gtf_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex'),
            name: String(name || 'GTF Project').trim(),
            status: referenceVideoPath ? 'reference_imported' : 'library_ready',
            referenceVideoPath,
            referenceVideoName,
            hookVideoPath,
            hookVideoName,
            requestedOutputs: parseInt(requestedOutputs, 10) || 10,
            hookAnalysis: null,
            referenceAnalysis: null,
            preflightStatus: null,
            productionTimeline: null,
            batchTimelines: [],
            renderedVideos: [],
            finalVideoPath: null,
            createdAt: now,
            updatedAt: now
        };
        this.projectStore.data.projects.push(project);
        this.projectStore.save();
        return project;
    }

    updateProject(id, patch = {}) {
        const p = this.getProject(id);
        if (!p) return null;
        Object.assign(p, patch, { updatedAt: new Date().toISOString() });
        this.projectStore.save();
        return p;
    }

    transitionProject(id, target) {
        const p = this.getProject(id);
        if (!p) throw Object.assign(new Error('Không tìm thấy project.'), { code: 'PROJECT_NOT_FOUND' });
        if (p.status === target) return p; // Idempotent: nếu đã ở trạng thái đích rồi thì bỏ qua, không ném lỗi
        if (!canTransition(p.status, target)) {
            throw Object.assign(new Error(`Chuyển trạng thái không hợp lệ: ${p.status} -> ${target}`), { code: 'INVALID_TRANSITION' });
        }
        p.status = target;
        p.updatedAt = new Date().toISOString();
        this.projectStore.save();
        return p;
    }

    deleteProject(id) {
        const arr = this.projectStore.data.projects;
        const i = arr.findIndex(p => p.id === id);
        if (i === -1) return false;
        arr.splice(i, 1);
        this.projectStore.save();
        try {
            const outDir = path.join(this.root, 'video_studio_outputs', id);
            if (fs.existsSync(outDir)) {
                fs.rmSync(outDir, { recursive: true, force: true });
            }
        } catch (_) {}
        return true;
    }

    /** Đảm bảo mọi ghi đang chờ đã nằm trên đĩa (dùng khi shutdown / test). */
    async flush() {
        await Promise.all([this.libraryStore.flush(), this.projectStore.flush()]);
    }
}

/** Router cho tool Video to Video, mount tai /api/video-studio. */
export function createVideoStudioRouter({ store, libraryDir } = {}) {
    const s = store || new VideoStudioStore();
    const KHO = libraryDir || resolveLibraryDir();
    // Video đối thủ (reference) lưu RIÊNG, KHÔNG nằm trong kho nguồn.
    const REF_DIR = process.env.VIDEO_STUDIO_REFERENCES_DIR
        ? path.resolve(process.env.VIDEO_STUDIO_REFERENCES_DIR)
        : path.join(config.root, 'video_studio_references');
    ensureDir(KHO);
    ensureDir(REF_DIR);
    const router = express.Router();

    const fail = (res, err, code = 400) => res.status(err.code === 'LIBRARY_FOLDER_NOT_FOUND' ? 404 : code)
        .json({ error: err.message || String(err), code: err.code || 'ERROR' });

    // ── trạng thái tool ──
    router.get('/status', (req, res) => {
        res.json({ tool: 'video-to-video', libraryDir: KHO, stats: s.libraryStats(), projects: s.listProjects().length });
    });

    // ── Theo dõi tiến trình phân tích AI (poll từ frontend) ──
    const _analyzeProgress = new Map(); // assetId -> { filename, stage, progress, startedAt }
    let _describeStats = { active: false, total: 0, done: 0, concurrency: 5 };

    router.get('/analyze-progress/:id', (req, res) => {
        const p = _analyzeProgress.get(req.params.id);
        if (!p) return res.json({ active: false });
        res.json({ active: true, filename: p.filename, stage: p.stage, progress: p.progress, startedAt: p.startedAt });
    });
    let _overflowWarned = false;
    router.get('/analyze-progress', (req, res) => {
        const tasks = {};
        for (const [id, p] of _analyzeProgress) tasks[id] = p;
        const view = describeProgressView(_describeStats);
        if (view.overflow && !_overflowWarned) {
            _overflowWarned = true;   // kêu đúng MỘT lần, UI poll 3s/lần nên đừng spam log
            console.warn('[VideoStudio] Bộ đếm mô tả AI vượt tổng (' + _describeStats.done +
                '/' + _describeStats.total + ') — dấu hiệu có hai vòng mô tả cùng chạy.');
        }
        res.json({
            active: _analyzeProgress.size > 0 || _describeStats.active,
            tasks,
            count: _analyzeProgress.size,
            total: view.total,
            done: view.done,
            overflow: view.overflow,
            concurrency: _describeStats.concurrency || 5
        });
    });

    // ── Upload video vào KHO (lưu thẳng về thư mục dự án) rồi tự index ──
    // Đăng ký TRƯỚC express.json để middleware multipart xử lý body.
    router.post('/library/upload', byteplusMultipart(KHO, { maxBytes: 2048 * 1024 * 1024 }), async (req, res) => {
        try {
            const files = req.files || [];
            if (!files.length) return res.status(400).json({ error: 'Không có file nào được tải lên.', code: 'NO_FILE' });
            // Chỉ nhận video; file khác thì xoá khỏi kho.
            const kept = [];
            for (const f of files) {
                if (classify(f.originalName) === 'video') kept.push(f);
                else { try { fs.unlinkSync(f.localPath); } catch (_) {} }
            }
            if (!kept.length) return res.status(415).json({ error: 'Chỉ hỗ trợ file video.', code: 'NOT_VIDEO' });

            // ĐỢT B: user chọn nhóm khi tải lên — chỉ 'hook' hoặc 'reference'.
            // Không chọn ⇒ 'reference' (user chốt: "nếu user đã tải video lên thì nó sẽ đc nhập thẳng vào ref luôn").
            const wanted = String((req.body && req.body.category) || '').trim().toLowerCase();
            // Mặc định 'material': nhóm user nạp nhiều nhất (footage dựng thân bài).
            const uploadCategory = UPLOAD_CATEGORIES.includes(wanted) ? wanted : 'material';
            const destDir = path.join(KHO, uploadCategory);
            fs.mkdirSync(destDir, { recursive: true });
            for (const f of kept) {
                const target = path.join(destDir, path.basename(f.localPath));
                if (path.resolve(target) === path.resolve(f.localPath)) continue;
                try {
                    fs.renameSync(f.localPath, target);
                    f.localPath = target;
                } catch (mvErr) {
                    console.warn('[VideoStudio] Khong chuyen duoc file vao nhom', uploadCategory, mvErr.message);
                }
            }

            // Index lại kho để cập nhật danh mục.
            const result = await scanLibrary(KHO, s);
            warmThumbs(); // làm ấm thumbnail nền, không chặn response
            queueBackgroundDescribe(); // tự động phân tích AI nền cho các clip chưa mô tả
            res.json({ success: true, uploaded: kept.length, category: uploadCategory, libraryDir: KHO, result, stats: s.libraryStats() });
        } catch (err) { fail(res, err); }
    });

    router.use(express.json({ limit: '5mb' }));

    // ── Local Media Library (SRS §3) — mặc định quét KHO của dự án ──
    router.post('/library/scan', async (req, res) => {
        try {
            const folder = (req.body && req.body.folder) || KHO;
            const result = await scanLibrary(folder, s);
            warmThumbs(); // làm ấm thumbnail nền, không chặn response
            queueBackgroundDescribe(); // tự động phân tích AI nền cho các clip chưa mô tả
            res.json({ success: true, folder: path.resolve(folder), result, stats: s.libraryStats() });
        } catch (err) { fail(res, err); }
    });

    router.get('/library/assets', (req, res) => {
        res.json({ assets: s.listAssets(req.query.category), stats: s.libraryStats() });
    });

    router.get('/library/assets/:id', (req, res) => {
        const a = s.getAsset(req.params.id);
        if (!a) return res.status(404).json({ error: 'Không tìm thấy asset.', code: 'ASSET_NOT_FOUND' });
        res.json({ asset: a });
    });

    router.delete('/library/assets/:id', (req, res) => {
        const a = s.getAsset(req.params.id);
        if (!a) return res.status(404).json({ error: 'Không tìm thấy asset.', code: 'ASSET_NOT_FOUND' });

        // Clip nằm TRONG kho thì phải xoá cả file, nếu không lần quét kho sau nó tự sống lại
        // với asset_id mới (đúng lỗi user gặp: bấm Xoá mà clip không mất).
        const plan = planAssetDeletion(a, { libraryRoot: KHO, projects: s.listProjects() });

        if (plan.code === 'ASSET_IN_USE') {
            const names = plan.usedBy.map(u => '"' + u.name + '" (' + u.label + ')').join(', ');
            return res.status(409).json({
                error: 'Clip đang được dùng bởi ' + names + '. Hãy đổi video của dự án đó trước khi xoá.',
                code: 'ASSET_IN_USE',
                usedBy: plan.usedBy
            });
        }

        let fileDeleted = false;
        if (plan.removeFile && a.path) {
            try {
                if (fs.existsSync(a.path)) { fs.unlinkSync(a.path); fileDeleted = true; }
            } catch (err) {
                return res.status(500).json({
                    error: 'Không xoá được file trên đĩa (' + err.message + '). Chưa xoá bản ghi để tránh clip sống lại khi quét kho.',
                    code: 'FILE_DELETE_FAILED'
                });
            }
        }

        // Dọn thumbnail đã cache để không còn ảnh mồ côi.
        try {
            const t = path.join(THUMB_DIR, a.asset_id + '.jpg');
            if (fs.existsSync(t)) fs.unlinkSync(t);
        } catch (_) {}

        s.deleteAsset(a.asset_id);
        res.json({ success: true, fileDeleted, scope: plan.code });
    });

    router.get('/library/stats', (req, res) => res.json(s.libraryStats()));

    // ── Thumbnail (ảnh khung hình) của 1 clip — sinh bằng ffmpeg, cache lại ──
    const THUMB_DIR = path.join(config.root, 'video_studio_thumbs');
    const _thumbInFlight = new Map(); // chống sinh trùng: 1 ffmpeg / asset tại một thời điểm

    function ensureThumb(a) {
        const out = path.join(THUMB_DIR, `${a.asset_id}.jpg`);
        if (fs.existsSync(out)) return Promise.resolve(out);
        if (_thumbInFlight.has(a.asset_id)) return _thumbInFlight.get(a.asset_id);
        if (!fs.existsSync(a.path)) return Promise.reject(Object.assign(new Error('SOURCE_MISSING'), { code: 'SOURCE_MISSING' }));
        const p = generateThumbnail(a.path, out).finally(() => _thumbInFlight.delete(a.asset_id));
        _thumbInFlight.set(a.asset_id, p);
        return p;
    }

    // Làm ấm cache TUẦN TỰ (tránh 24 ffmpeg song song khi UI mở lần đầu).
    let _warming = false;
    async function warmThumbs() {
        if (_warming) return;
        _warming = true;
        try {
            for (const a of s.listAssets()) {
                try { await ensureThumb(a); } catch (_) {}
            }
        } finally { _warming = false; }
    }
    warmThumbs(); // Làm ấm thumbnail khi khởi động router

    // ══════════════════════════════════════════════════════════════════════
    // MÔ TẢ AI CHO KHO — MỘT CHỖ DUY NHẤT.
    //
    // Trước đây có HAI vòng riêng (vòng nền sau upload/quét, và nhánh batch của
    // POST /library/describe). Chúng cùng ghi vào một object `_describeStats`, mà chỉ
    // vòng nền có khoá, nên chạy chồng lên nhau ⇒ UI hiện "193/181", clip bị phân tích
    // hai lần (đốt 9Router) và có lúc 10 clip chạy song song thay vì 5.
    //
    // Chép hai lần còn sinh ra lệch tính năng thật: vòng nền QUÊN lưu bảng điểm 7 tiêu
    // chí và quên ensureVietnameseAnalysis — đo trên kho của user: 44/191 clip đã mô tả
    // mà không có điểm. Gộp lại thì hết đường lệch.
    // ══════════════════════════════════════════════════════════════════════
    let _describing = false;

    async function describeAssets(list) {
        const CONCURRENCY = 5;
        _describeStats = { active: true, total: list.length, done: 0, concurrency: CONCURRENCY };
        let cursor = 0;
        let count = 0;
        let lastAsset = null;

        const worker = async () => {
            while (cursor < list.length) {
                const a = list[cursor++];
                if (!a) break;
                try {
                    _analyzeProgress.set(a.asset_id, {
                        filename: a.filename, stage: 'starting', progress: 0, startedAt: Date.now()
                    });
                    let result = await analyzerWorker.analyze(a.path, {
                        language: 'vi',
                        onProgress: (stage, progress) => {
                            _analyzeProgress.set(a.asset_id, {
                                filename: a.filename,
                                stage,
                                progress: progress || 0,
                                startedAt: _analyzeProgress.get(a.asset_id)?.startedAt || Date.now()
                            });
                        }
                    });
                    result = await ensureVietnameseAnalysis(result);

                    let events = result.visual_events || result.events || [];
                    if ((!events || !events.length) && result.artifacts?.visual && fs.existsSync(result.artifacts.visual)) {
                        try {
                            const visData = JSON.parse(fs.readFileSync(result.artifacts.visual, 'utf-8'));
                            events = visData.events || [];
                        } catch (_) {}
                    }
                    const summary = result.summary || result.conclusion || result.purpose || '';

                    // ĐỢT A: bảng điểm 7 tiêu chí + loại hook. Vòng nền cũ bỏ qua khối này.
                    const sc = extractAnalysisScorecard(result);
                    s.upsertAsset({
                        path: a.path,
                        descriptionIndex: events,
                        description_index: events,
                        aiDescription: summary,
                        described: true,
                        overallScore: sc.overallScore,
                        criteriaScores: sc.criteriaScores,
                        hookType: sc.hookType,
                        hookScore: sc.hookScore,
                        hookFirst3s: sc.hookFirst3s,
                        strengths: sc.strengths,
                        weaknesses: sc.weaknesses,
                        improvements: sc.improvements
                    });
                    count++;
                    _describeStats.done++;
                    lastAsset = s.getAsset(a.asset_id);
                } catch (e) {
                    console.error('[VideoStudio] Lỗi khi describe asset:', a.asset_id, e.message);
                } finally {
                    _analyzeProgress.delete(a.asset_id);
                }
            }
        };

        const pool = [];
        for (let i = 0; i < Math.min(CONCURRENCY, list.length); i++) pool.push(worker());

        // allSettled, KHÔNG dùng dạng dừng-ngay-khi-lỗi: dạng kia nhả khoá ngay lúc một
        // luồng ném lỗi trong khi bốn luồng kia còn sống, vòng sau vào được và lại ghi đè
        // bộ đếm — đúng kiểu sinh ra "193/181".
        await Promise.allSettled(pool);
        _describeStats.active = false;
        return { count, lastAsset };
    }

    /** Mô tả nền toàn bộ clip chưa có mô tả (gọi sau upload / quét kho). */
    async function queueBackgroundDescribe() {
        if (_describing) return;
        _describing = true;
        try {
            const undescribed = s.listAssets().filter(a => !a.described && fs.existsSync(a.path));
            if (!undescribed.length) return;
            await describeAssets(undescribed);
        } finally {
            _describing = false;
            _describeStats.active = false;
        }
    }

    router.get('/library/thumb/:id', async (req, res) => {
        const a = s.getAsset(req.params.id);
        if (!a) return res.status(404).end();
        try {
            const out = await ensureThumb(a);
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            fs.createReadStream(out).pipe(res);
        } catch (err) {
            res.status(err.code === 'SOURCE_MISSING' ? 410 : 500).end();
        }
    });

    // Phát video từ kho local (hỗ trợ HTTP 206 partial streaming)
    router.get('/library/video/:id', (req, res) => {
        const a = s.getAsset(req.params.id);
        if (!a) return res.status(404).json({ error: 'Không tìm thấy asset.', code: 'ASSET_NOT_FOUND' });
        if (!fs.existsSync(a.path)) return res.status(404).json({ error: 'File video không tồn tại trên đĩa.', code: 'FILE_NOT_FOUND' });
        
        const stat = fs.statSync(a.path);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(a.path, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(200, head);
            fs.createReadStream(a.path).pipe(res);
        }
    });

    // ── GTF projects (khung) ──
    router.get('/projects', (req, res) => res.json({ projects: s.listProjects() }));
    router.post('/projects', byteplusMultipart(REF_DIR, { maxBytes: 2048 * 1024 * 1024 }), (req, res) => {
        try {
            const body = req.body || {};
            if (!body.name || !String(body.name).trim()) return res.status(422).json({ error: 'Thiếu tên project.', code: 'NAME_REQUIRED' });
            const files = req.files || [];
            const vid = files.find(f => f.field === 'refVideo' && classify(f.originalName) === 'video') || files.find(f => classify(f.originalName) === 'video' && f.field !== 'hookVideo');
            const hookVid = files.find(f => f.field === 'hookVideo' && classify(f.originalName) === 'video');
            // File không phải video thì xoá, tránh rác trong thư mục reference.
            for (const f of files) { if (f !== vid && f !== hookVid) { try { fs.unlinkSync(f.localPath); } catch (_) {} } }
            const project = s.createProject({
                name: body.name,
                referenceVideoPath: vid ? vid.localPath : null,
                referenceVideoName: vid ? vid.originalName : null,
                hookVideoPath: hookVid ? hookVid.localPath : null,
                hookVideoName: hookVid ? hookVid.originalName : null,
                requestedOutputs: body.requestedOutputs
            });
            res.status(201).json({ success: true, project });
        } catch (err) { fail(res, err); }
    });
    router.get('/projects/:id', (req, res) => {
        const p = s.getProject(req.params.id);
        if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
        res.json({ project: p });
    });
    router.delete('/projects/:id', (req, res) => {
        const deleted = s.deleteProject(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
        res.json({ success: true, deletedId: req.params.id });
    });
    router.post('/projects/:id/inputs', byteplusMultipart(REF_DIR, { maxBytes: 2048 * 1024 * 1024 }), (req, res) => {
        try {
            const p = s.getProject(req.params.id);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });

            const uneditableStatuses = ['reference_analyzed', 'timeline_generated', 'awaiting_script_review', 'script_approved', 'assembling', 'video_ready', 'awaiting_final_review', 'final_approved'];
            if (uneditableStatuses.includes(p.status) || p.referenceAnalysis) {
                return res.status(400).json({ error: 'Dự án đã được AI phân tích ở bước 2, không thể thay đổi video input.', code: 'ALREADY_ANALYZED' });
            }

            const files = req.files || [];
            const vid = files.find(f => f.field === 'refVideo' && classify(f.originalName) === 'video') || files.find(f => classify(f.originalName) === 'video' && f.field !== 'hookVideo');
            const hookVid = files.find(f => f.field === 'hookVideo' && classify(f.originalName) === 'video');

            for (const f of files) {
                if (f !== vid && f !== hookVid) {
                    try { fs.unlinkSync(f.localPath); } catch (_) {}
                }
            }

            const patch = {};
            // Clip đang dùng nằm TRONG KHO thì tuyệt đối không xoá khi user đổi video khác.
            const inKho = (fp) => { try { return !!fp && path.resolve(fp).startsWith(path.resolve(KHO)); } catch (_) { return false; } };

            if (vid) {
                if (p.referenceVideoPath && p.referenceVideoPath !== vid.localPath
                    && !inKho(p.referenceVideoPath) && fs.existsSync(p.referenceVideoPath)) {
                    try { fs.unlinkSync(p.referenceVideoPath); } catch (_) {}
                }
                patch.referenceVideoPath = vid.localPath;
                patch.referenceVideoName = vid.originalName;
                patch.referenceAnalysis = null;
            }

            if (hookVid) {
                if (p.hookVideoPath && p.hookVideoPath !== hookVid.localPath
                    && !inKho(p.hookVideoPath) && fs.existsSync(p.hookVideoPath)) {
                    try { fs.unlinkSync(p.hookVideoPath); } catch (_) {}
                }
                patch.hookVideoPath = hookVid.localPath;
                patch.hookVideoName = hookVid.originalName;
                patch.hookAnalysis = null;
            }

            const body = req.body || {};

            // ĐỢT B: user chọn lại video đối thủ / hook từ KHO ở bước 1 (thay vì phải tải lên lại).
            // Dùng thẳng đường dẫn clip trong kho — KHÔNG copy, KHÔNG xoá file kho khi đổi.
            if (!vid && body.refAssetId) {
                const a = s.getAsset(String(body.refAssetId));
                if (!a || !fs.existsSync(a.path)) {
                    return res.status(404).json({ error: 'Không tìm thấy clip đối thủ trong kho.', code: 'ASSET_NOT_FOUND' });
                }
                patch.referenceVideoPath = a.path;
                patch.referenceVideoName = a.filename || path.basename(a.path);
                patch.referenceAssetId = a.asset_id;
                patch.referenceAnalysis = null;
            }
            if (!hookVid && body.hookAssetId) {
                const a = s.getAsset(String(body.hookAssetId));
                if (!a || !fs.existsSync(a.path)) {
                    return res.status(404).json({ error: 'Không tìm thấy clip hook trong kho.', code: 'ASSET_NOT_FOUND' });
                }
                patch.hookVideoPath = a.path;
                patch.hookVideoName = a.filename || path.basename(a.path);
                patch.hookAssetId = a.asset_id;
                patch.hookAnalysis = null;
            }

            if (body.removeHook === 'true' || body.removeHook === true) {
                if (p.hookVideoPath && !inKho(p.hookVideoPath) && fs.existsSync(p.hookVideoPath)) {
                    try { fs.unlinkSync(p.hookVideoPath); } catch (_) {}
                }
                patch.hookVideoPath = null;
                patch.hookVideoName = null;
                patch.hookAnalysis = null;
            }

            const finalRefPath = patch.referenceVideoPath || p.referenceVideoPath;
            if (finalRefPath && (p.status === 'library_ready' || p.status === 'failed')) {
                patch.status = 'reference_imported';
            }

            const updated = s.updateProject(p.id, patch);
            res.json({ success: true, project: updated });
        } catch (err) { fail(res, err); }
    });

    router.post('/library/describe', async (req, res) => {
        try {
            const { assetId } = req.body || {};
            let toDescribe = [];
            if (assetId) {
                const a = s.getAsset(assetId);
                if (!a) return res.status(404).json({ error: 'Không tìm thấy asset.', code: 'ASSET_NOT_FOUND' });
                toDescribe.push(a);
            } else {
                toDescribe = s.listAssets().filter(a => !a.described);
            }

            let count = 0;
            let lastAsset = null;

            if (assetId) {
                const a = toDescribe[0];
                _analyzeProgress.set(a.asset_id, { filename: a.filename, stage: 'starting', progress: 0, startedAt: Date.now() });
                try {
                    let result = await analyzerWorker.analyze(a.path, {
                        language: 'vi',
                        onProgress: (stage, progress) => {
                            _analyzeProgress.set(a.asset_id, { filename: a.filename, stage, progress: progress || 0, startedAt: _analyzeProgress.get(a.asset_id)?.startedAt || Date.now() });
                        }
                    });
                    result = await ensureVietnameseAnalysis(result);
                    let events = result.visual_events || result.events || [];
                    if ((!events || !events.length) && result.artifacts?.visual && fs.existsSync(result.artifacts.visual)) {
                        try {
                            const visData = JSON.parse(fs.readFileSync(result.artifacts.visual, 'utf-8'));
                            events = visData.events || [];
                        } catch (_) {}
                    }
                    const summary = result.summary || result.conclusion || result.purpose || '';
                    // ĐỢT A: lưu luôn bảng điểm 7 tiêu chí + loại hook do AI tự gán (user sửa được sau).
                    const sc = extractAnalysisScorecard(result);
                    s.upsertAsset({
                        path: a.path,
                        descriptionIndex: events,
                        description_index: events,
                        aiDescription: summary,
                        described: true,
                        overallScore: sc.overallScore,
                        criteriaScores: sc.criteriaScores,
                        hookType: sc.hookType,
                        hookScore: sc.hookScore,
                        hookFirst3s: sc.hookFirst3s,
                        strengths: sc.strengths,
                        weaknesses: sc.weaknesses,
                        improvements: sc.improvements
                    });
                    count = 1;
                    lastAsset = s.getAsset(a.asset_id);
                } finally {
                    _analyzeProgress.delete(a.asset_id);
                }
            } else {
                // Vòng nền đang chạy thì TỪ CHỐI, đừng mở vòng thứ hai: hai vòng cùng tăng
                // một bộ đếm là nguồn gốc của "193/181".
                if (_describing) {
                    return res.status(409).json({
                        error: 'AI đang mô tả kho ở nền. Đợi lượt này xong rồi chạy lại.',
                        code: 'DESCRIBE_IN_PROGRESS',
                        progress: describeProgressView(_describeStats)
                    });
                }
                _describing = true;
                try {
                    // Lọc file đã mất: bản ghi mồ côi thì lần nào cũng lỗi, tính vào tổng chỉ làm
                    // thanh tiến độ không bao giờ chạm 100%.
                    const r = await describeAssets(toDescribe.filter(a => a.path && fs.existsSync(a.path)));
                    count = r.count;
                    lastAsset = r.lastAsset;
                } finally {
                    _describing = false;
                    _describeStats.active = false;
                }
            }

            res.json({ success: true, described: count, asset: lastAsset });
        } catch (err) { fail(res, err); }
    });

    router.post('/projects/:id/analyze-reference', async (req, res) => {
        try {
            const p = s.getProject(req.params.id);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
            if (!p.referenceVideoPath) return res.status(400).json({ error: 'Project không có video đối thủ.', code: 'NO_REFERENCE' });
            
            let result = await analyzerWorker.analyze(p.referenceVideoPath, { language: 'vi' });

            // HARD-FAIL: nếu "AI" (vision LLM) không gọi được API → KHÔNG lưu, KHÔNG cho done step 2.
            const usable = isReferenceAnalysisUsable(result);
            if (!usable.ok) {
                console.error('[VideoStudio] Phân tích reference thất bại (AI):', usable.reason);
                return res.status(502).json({ error: usable.reason, code: 'AI_ANALYSIS_FAILED' });
            }

            result = await ensureVietnameseAnalysis(result);

            s.updateProject(p.id, { referenceAnalysis: result });

            // Tự động lưu video đối thủ vào kho thư viện (§3-§4)
            try {
                const events = result.visual_events || result.events || [];
                const summary = result.summary || result.purpose || result.conclusion || '';
                const probeMeta = await probeVideo(p.referenceVideoPath);
                const refAsset = s.upsertAsset({
                    path: p.referenceVideoPath,
                    filename: p.referenceVideoName || path.basename(p.referenceVideoPath),
                    category: 'reference',
                    duration: probeMeta.duration,
                    width: probeMeta.width,
                    height: probeMeta.height,
                    fps: probeMeta.fps,
                    codec: probeMeta.codec,
                    file_size: probeMeta.file_size,
                    file_hash: fileFingerprint(p.referenceVideoPath),
                    described: true,
                    descriptionIndex: events,
                    description_index: events,
                    aiDescription: summary
                });
                ensureThumb(refAsset).catch(() => {});
            } catch (libErr) {
                console.warn('Lỗi tự động nạp video đối thủ vào kho:', libErr.message);
            }

            // Only transition when all analyses are complete
            const updated = s.getProject(p.id);
            if (!updated.hookVideoPath || updated.hookAnalysis) {
                s.transitionProject(p.id, 'reference_analyzed');
            }
            
            res.json({ success: true, project: s.getProject(p.id) });
        } catch (err) { fail(res, err); }
    });

    router.post('/projects/:id/analyze-hook', async (req, res) => {
        try {
            const p = s.getProject(req.params.id);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
            if (!p.hookVideoPath) return res.status(400).json({ error: 'Project không có video hook.', code: 'NO_HOOK' });
            
            let result = await analyzerWorker.analyze(p.hookVideoPath, { language: 'vi' });

            // HARD-FAIL: nếu "AI" (vision LLM) không gọi được API → KHÔNG lưu, KHÔNG cho done step 2.
            const usable = isReferenceAnalysisUsable(result);
            if (!usable.ok) {
                console.error('[VideoStudio] Phân tích hook thất bại (AI):', usable.reason);
                return res.status(502).json({ error: usable.reason, code: 'AI_ANALYSIS_FAILED' });
            }

            result = await ensureVietnameseAnalysis(result);

            s.updateProject(p.id, { hookAnalysis: result });

            // Tự động lưu video hook vào kho thư viện (§3-§4)
            try {
                const events = result.visual_events || result.events || [];
                const summary = result.summary || result.purpose || result.conclusion || '';
                const probeMeta = await probeVideo(p.hookVideoPath);
                const hookAsset = s.upsertAsset({
                    path: p.hookVideoPath,
                    filename: p.hookVideoName || path.basename(p.hookVideoPath),
                    category: 'hook',
                    duration: probeMeta.duration,
                    width: probeMeta.width,
                    height: probeMeta.height,
                    fps: probeMeta.fps,
                    codec: probeMeta.codec,
                    file_size: probeMeta.file_size,
                    file_hash: fileFingerprint(p.hookVideoPath),
                    described: true,
                    descriptionIndex: events,
                    description_index: events,
                    aiDescription: summary
                });
                ensureThumb(hookAsset).catch(() => {});
            } catch (libErr) {
                console.warn('Lỗi tự động nạp video hook vào kho:', libErr.message);
            }

            // Check if both analyses are done — only transition if reference is also analyzed
            const updated = s.getProject(p.id);
            if (updated.referenceAnalysis && updated.hookAnalysis) {
                s.transitionProject(p.id, 'reference_analyzed');
            }
            
            res.json({ success: true, project: s.getProject(p.id) });
        } catch (err) { fail(res, err); }
    });

    // ── Pre-flight Semantic Gate (§6.1) ──
    router.post('/projects/:id/preflight-check', (req, res) => {
        try {
            const p = s.getProject(req.params.id);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
            if (!p.referenceAnalysis) return res.status(400).json({ error: 'Chưa có phân tích video đối thủ.', code: 'NO_ANALYSIS' });

            const check = checkSemanticPreflight(p.referenceAnalysis, s.listAssets());
            s.updateProject(p.id, { preflightStatus: check });
            res.json({ success: true, preflight: check, project: s.getProject(p.id) });
        } catch (err) { fail(res, err); }
    });

    // ── Sinh Production Timeline (hỗ trợ Batch N kịch bản & chống trùng lặp đa tầng) (§7) ──
    router.post('/projects/:id/generate-timeline', async (req, res) => {
        try {
            const p = s.getProject(req.params.id);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
            
            const describedAssets = s.listAssets().filter(a => a.described);
            if (describedAssets.length === 0) {
                return res.status(400).json({ error: 'Kho chưa có video nào được mô tả AI.', code: 'NO_DESCRIBED_ASSETS' });
            }

            // Pre-flight check trước khi sinh
            const preflight = checkSemanticPreflight(p.referenceAnalysis, s.listAssets());
            s.updateProject(p.id, { preflightStatus: preflight });
            if (!preflight.canProceed) {
                return res.status(422).json({
                    error: preflight.reason || 'Kho không đủ source phù hợp với video đối thủ.',
                    code: 'PREFLIGHT_MISMATCH',
                    preflight
                });
            }

            const count = parseInt(req.body?.count, 10) || p.requestedOutputs || 10;
            let batchTimelines = [];

            const voice = req.body?.voice || p.voice || 'vi-VN-HoaiMyNeural';
            const requestedHookType = req.body?.hookType || 'auto';

            // ĐỢT B — user chốt: "ko chọn hook mà chuyển sang step 2 thì AI sẽ tự chọn video hook
            // trong kho phù hợp với option loại hook mà user chọn (nếu có), còn ko chọn loại hook
            // thì AI sẽ tự lấy video hook trong kho đạt điểm đánh giá cao nhất".
            let hookVideoPath = p.hookVideoPath || null;
            let hookVideoName = p.hookVideoName || null;
            let hookAnalysis = p.hookAnalysis || null;
            let autoHookAsset = null;

            if (!hookVideoPath) {
                autoHookAsset = pickHookFromLibrary(s.listAssets(), { hookType: requestedHookType });
                if (autoHookAsset && fs.existsSync(autoHookAsset.path)) {
                    hookVideoPath = autoHookAsset.path;
                    hookVideoName = autoHookAsset.filename || path.basename(autoHookAsset.path);
                    // Clip kho đã được describe nên có sẵn mô tả + sự kiện hình ảnh để viết lời hook.
                    hookAnalysis = {
                        summary: autoHookAsset.aiDescription || '',
                        duration: Number(autoHookAsset.duration) || 0,
                        visual_events: autoHookAsset.descriptionIndex || [],
                        hook_analysis: {
                            type: autoHookAsset.hookType || '',
                            first_3s: autoHookAsset.hookFirst3s || '',
                            score_1_10: autoHookAsset.hookScore || null
                        }
                    };
                    s.updateProject(p.id, {
                        autoHookAssetId: autoHookAsset.asset_id,
                        autoHookName: hookVideoName,
                        autoHookType: autoHookAsset.hookType || null,
                        autoHookScore: autoHookAsset.hookScore || null
                    });
                }
            }

            // ĐO clip hook thật. Bản cũ chỉ dựa vào `hookAnalysis.duration`, mà trường đó
            // THỰC TẾ không tồn tại (đo trên project gtf_mu7s6owa_88814c: undefined) nên
            // hàm kẹp trả về mặc định 4s cho clip chỉ 3.27s ⇒ cửa sổ dài hơn clip ⇒ video
            // output mất sạch phân cảnh sau cảnh 1.
            let hookSourceDuration = 0;
            if (hookVideoPath && fs.existsSync(hookVideoPath)) {
                try {
                    const hp = await probeVideo(hookVideoPath);
                    hookSourceDuration = Number(hp && hp.duration) || 0;
                } catch (err) {
                    console.warn('[VideoStudio] Không đo được độ dài clip hook:', err.message);
                }
            }

            const hookContext = {
                hookVideoPath,
                hookVideoName,
                hookAnalysis,
                hookSourceDuration,
                hookDuration: clampHookDuration(hookAnalysis && hookAnalysis.duration, {
                    sourceDuration: hookSourceDuration
                }),
                // Loại hook do user chọn ở frontend; 'auto' (hoặc thiếu) = để model tự chọn theo độ phù hợp.
                hookType: requestedHookType,
                voice
            };

            if (count > 1) {
                batchTimelines = await generateBatchTimelines(p.referenceAnalysis, describedAssets, hookAnalysis, count, hookContext);
            } else {
                const single = await generateTimeline(p.referenceAnalysis, describedAssets, hookAnalysis, hookContext);
                batchTimelines = [{ index: 1, ...single, isValid: true, coverageRate: 100 }];
            }

            // ĐỢT C — hậu kiểm 10 biến thể có thật sự khác nhau không (persona/bối cảnh/đạo cụ/bằng chứng).
            // Không chặn việc sinh, nhưng báo rõ để user biết biến thể nào bị trùng ý tưởng.
            const diversity = checkVariantDiversity(batchTimelines);
            if (!diversity.ok) {
                console.warn('[VideoStudio] Bien the trung yeu to:',
                    diversity.violations.map(v => `#${v.a + 1}~#${v.b + 1} (${v.same.join(',')})`).join(' · '));
            }

            const validOne = batchTimelines.find(t => t.isValid) || batchTimelines[0];
            s.updateProject(p.id, {
                batchTimelines,
                productionTimeline: validOne ? validOne.segments : [],
                variantDiversity: diversity,
                voice
            });

            s.transitionProject(p.id, 'timeline_generated');
            s.transitionProject(p.id, 'awaiting_script_review');
            
            res.json({ success: true, project: s.getProject(p.id), batchTimelines });
        } catch (err) { fail(res, err); }
    });

    router.post('/projects/:id/review', (req, res) => {
        try {
            const p = s.getProject(req.params.id);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
            
            const { action, notes } = req.body || {};
            if (action === 'approve') {
                s.transitionProject(p.id, 'script_approved');
            } else if (action === 'reject') {
                s.transitionProject(p.id, 'timeline_generated'); // cho sửa lại
                if (notes) s.updateProject(p.id, { reviewNotes: notes });
            } else {
                return res.status(400).json({ error: 'Hành động không hợp lệ.', code: 'INVALID_ACTION' });
            }
            
            res.json({ success: true, project: s.getProject(p.id) });
        } catch (err) { fail(res, err); }
    });

    router.post('/projects/:id/batch-review', (req, res) => {
        try {
            const p = s.getProject(req.params.id);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
            
            const { action, approvedIndices } = req.body || {};
            if (action === 'approve' || action === 'approve_all') {
                s.transitionProject(p.id, 'script_approved');
                if (Array.isArray(approvedIndices)) {
                    s.updateProject(p.id, { approvedBatchIndices: approvedIndices });
                }
            } else if (action === 'reject') {
                s.transitionProject(p.id, 'timeline_generated');
            } else {
                return res.status(400).json({ error: 'Hành động không hợp lệ.', code: 'INVALID_ACTION' });
            }
            
            res.json({ success: true, project: s.getProject(p.id) });
        } catch (err) { fail(res, err); }
    });

    router.post('/projects/:id/validate', (req, res) => {
        try {
            const p = s.getProject(req.params.id);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
            if (!p.productionTimeline && (!p.batchTimelines || !p.batchTimelines.length)) {
                return res.status(400).json({ error: 'Project chưa có timeline.', code: 'NO_TIMELINE' });
            }

            s.transitionProject(p.id, 'assembling');
            res.json({ success: true, valid: true, project: s.getProject(p.id) });
        } catch (err) { fail(res, err); }
    });

    // ── Theo dõi tiến trình render FFmpeg batch (poll từ frontend) ──
    const _renderProgress = new Map(); // projectId -> { startedAt, total, completed, failed, items: {} }

    router.get('/projects/:id/render-progress', (req, res) => {
        try {
            const p = s.getProject(req.params.id);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });

            // Vị trí trong hàng đợi dựng toàn hệ thống: 0 = đang dựng, >=1 = còn N project phía trước.
            const queuePosition = renderQueue.position(p.id);
            const queueTotal = renderQueue.size;

            const active = _renderProgress.get(p.id);
            if (active) {
                return res.json({
                    success: true,
                    active: true,
                    status: p.status,
                    queuePosition,
                    queueTotal,
                    progress: active
                });
            }

            return res.json({
                success: true,
                active: false,
                status: p.status,
                queuePosition,
                queueTotal,
                renderedCount: (p.renderedVideos || []).length,
                renderedVideos: p.renderedVideos || []
            });
        } catch (err) { fail(res, err); }
    });

    // Hàng đợi dựng video TOÀN HỆ THỐNG (nhiều nhân viên dùng chung) — FIFO theo thứ tự bấm.
    router.get('/queue', (req, res) => {
        try {
            const snap = renderQueue.snapshot();
            const named = snap.meta.map(item => {
                const proj = s.getProject(item.key);
                return {
                    projectId: item.key,
                    name: (proj && proj.name) || item.key,
                    state: item.state,
                    position: item.position,
                    videos: (proj && Array.isArray(proj.batchTimelines)) ? proj.batchTimelines.length : null
                };
            });
            res.json({ success: true, queue: { ...snap, items: named } });
        } catch (err) { fail(res, err); }
    });

    router.get('/voices', (req, res) => {
        res.json({ voices: AVAILABLE_VOICES });
    });

    router.post('/projects/:id/assemble', async (req, res) => {
        const projectId = req.params.id;
        try {
            const p = s.getProject(projectId);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
            
            // Cho phép tự chuyển từ script_approved, video_ready, awaiting_final_review sang assembling nếu cần
            if (['script_approved', 'video_ready', 'awaiting_final_review', 'final_approved'].includes(p.status)) {
                s.transitionProject(p.id, 'assembling');
            } else if (p.status !== 'assembling') {
                return res.status(400).json({ error: 'Project chưa ở trạng thái assembling hoặc script_approved.', code: 'INVALID_STATE' });
            }

            // CHẶN BẤM TRÙNG: project đã nằm trong hàng đợi hoặc đang dựng thì KHÔNG chạy lượt thứ hai
            // (trước đây bấm 2 lần là 2 lượt render ghi đè cùng thư mục output).
            if (renderQueue.has(p.id)) {
                return res.status(409).json({
                    error: 'Project này đã ở trong hàng đợi dựng, không cần bấm lại.',
                    code: 'ALREADY_QUEUED',
                    queuePosition: renderQueue.position(p.id),
                    queueTotal: renderQueue.size
                });
            }
            
            const OUTPUT_DIR = path.join(config.root, 'video_studio_outputs', p.id);
            ensureDir(OUTPUT_DIR);
            const voice = (req.body && req.body.voice) || p.voice || 'vi-VN-HoaiMyNeural';
            const targetLang = detectLanguageFromVoice(voice);

            // Set tiến độ SỚM NGAY khi vào assembling (trước cả bước chuẩn bị ngôn ngữ) để frontend
            // poll thấy items ngay → panel + card render hiện tức thì, không có "khoảng chết" (fix panel không hiện).
            if (Array.isArray(p.batchTimelines) && p.batchTimelines.length > 0) {
                const initItems = {};
                p.batchTimelines
                    .filter(t => t.isValid !== false)
                    .forEach((tl, idx) => {
                        const vi = tl.index || (idx + 1);
                        initItems[vi] = { index: vi, title: tl.title, angle: tl.angle, status: 'queued', percent: 0, stage: 'Đang xếp hàng...' };
                    });
                _renderProgress.set(p.id, {
                    startedAt: Date.now(),
                    total: Object.keys(initItems).length,
                    completed: 0, failed: 0, items: initItems
                });
            }

            // XẾP HÀNG TOÀN HỆ THỐNG: mỗi lúc chỉ 1 project được dựng, FIFO theo thứ tự bấm
            // ("project nào yêu cầu trước thì làm trước"). Nhờ vậy trần 10 luồng FFmpeg trong
            // batchAssemble trở thành trần của CẢ hệ thống, không còn 3 người bấm = 30 tiến trình.
            await renderQueue.enqueue(p.id, async () => {

            // Đảm bảo toàn bộ kịch bản khớp với ngôn ngữ của giọng đọc đã chọn (Voice-Language Consistency)
            if (Array.isArray(p.batchTimelines) && p.batchTimelines.length > 0) {
                for (const tl of p.batchTimelines) {
                    await ensureLanguageTimeline(tl, targetLang);
                    enforceVoiceDurationConstraint(tl);
                }
            }
            if (Array.isArray(p.productionTimeline) && p.productionTimeline.length > 0) {
                const dummyTl = { title: p.name, segments: p.productionTimeline };
                await ensureLanguageTimeline(dummyTl, targetLang);
                enforceVoiceDurationConstraint(dummyTl);
                p.productionTimeline = dummyTl.segments;
            }

            // Nếu có Batch Kịch Bản: Dựng với worker pool và cập nhật tiến độ real-time
            if (Array.isArray(p.batchTimelines) && p.batchTimelines.length > 0) {
                const validTimelines = p.batchTimelines.filter(t => t.isValid !== false);
                const toRender = validTimelines.length > 0 ? validTimelines : p.batchTimelines;

                const prepared = toRender.map((tl, idx) => ({
                    ...tl,
                    index: tl.index || (idx + 1),
                    segments: (tl.segments || []).map(seg => {
                        const a = s.getAsset(seg.sourceAssetId);
                        return { ...seg, path: a ? a.path : (seg.assetPath || '') };
                    })
                }));

                const progressObj = {
                    startedAt: Date.now(),
                    total: prepared.length,
                    completed: 0,
                    failed: 0,
                    items: {}
                };
                prepared.forEach(tl => {
                    progressObj.items[tl.index] = {
                        index: tl.index,
                        title: tl.title,
                        angle: tl.angle,
                        status: 'queued',
                        percent: 0,
                        stage: 'Đang chờ hàng đợi...'
                    };
                });
                _renderProgress.set(p.id, progressObj);

                const results = await batchAssemble(prepared, OUTPUT_DIR, {
                    voice,
                    // Tối đa 10 video render ĐỒNG THỜI, phần còn lại xếp hàng đợi (env override được).
                    concurrency: Number(process.env.V2V_RENDER_CONCURRENCY) || 10,
                    onProgress: (vIdx, stage, pct, desc) => {
                        if (!progressObj.items[vIdx]) progressObj.items[vIdx] = {};
                        progressObj.items[vIdx].status = stage;
                        progressObj.items[vIdx].percent = Math.round((pct || 0) * 100);
                        progressObj.items[vIdx].stage = desc || stage;
                        progressObj.completed = Object.values(progressObj.items).filter(x => x.status === 'completed').length;
                        progressObj.failed = Object.values(progressObj.items).filter(x => x.status === 'failed').length;
                    }
                });

                _renderProgress.delete(p.id);

                const finalPath = path.join(OUTPUT_DIR, 'final.mp4');
                const firstSuccess = results.find(r => r.success);
                if (firstSuccess && firstSuccess.outputPath && fs.existsSync(firstSuccess.outputPath)) {
                    try { fs.copyFileSync(firstSuccess.outputPath, finalPath); } catch (_) {}
                }

                s.updateProject(p.id, { renderedVideos: results, finalVideoPath: finalPath, voice });
            } else {
                const finalPath = path.join(OUTPUT_DIR, 'final.mp4');
                const segments = (p.productionTimeline || []).map(seg => {
                    const a = s.getAsset(seg.sourceAssetId);
                    return { ...seg, path: a ? a.path : (seg.assetPath || '') };
                });
                await assembleVideo(segments, finalPath, { voice });
                s.updateProject(p.id, { finalVideoPath: finalPath, voice, renderedVideos: [{ index: 1, success: true, outputPath: finalPath, fileName: 'final.mp4' }] });
            }
            
            s.transitionProject(p.id, 'video_ready');
            s.transitionProject(p.id, 'awaiting_final_review');
            exportProjectPackage(s.getProject(p.id), s);

            }, { name: p.name, videos: (p.batchTimelines || []).length });

            res.json({ success: true, project: s.getProject(p.id) });
        } catch (err) {
            _renderProgress.delete(projectId);
            fail(res, err);
        }
    });

    router.put('/projects/:id/timeline', (req, res) => {
        try {
            const p = s.getProject(req.params.id);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
            const { timeline } = req.body || {};
            if (!Array.isArray(timeline)) {
                return res.status(400).json({ error: 'Timeline phải là một mảng các segment.', code: 'INVALID_TIMELINE' });
            }

            // Ghi vào ĐÚNG biến thể user đang sửa. Bản cũ chỉ ghi productionTimeline trong khi
            // /assemble dựng từ batchTimelines ⇒ mọi chỉnh sửa bị bỏ lúc render.
            const target = resolveTimelineEditTarget(p, req.body && req.body.variantIndex);
            if (target.scope === 'variant') {
                const batchTimelines = p.batchTimelines.map((t, i) => (
                    i === target.index ? { ...t, segments: timeline } : t
                ));
                // productionTimeline giữ bản vừa sửa để đường dựng đơn (không có biến thể) khớp theo.
                s.updateProject(p.id, { batchTimelines, productionTimeline: timeline });
            } else {
                s.updateProject(p.id, { productionTimeline: timeline });
            }

            exportProjectPackage(s.getProject(p.id), s);
            res.json({ success: true, project: s.getProject(p.id), edited: target });
        } catch (err) { fail(res, err); }
    });

    router.post('/projects/:id/final-review', (req, res) => {
        try {
            const p = s.getProject(req.params.id);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
            
            const { action } = req.body || {};
            if (action === 'approve') {
                s.transitionProject(p.id, 'final_approved');
                exportProjectPackage(s.getProject(p.id), s);
            } else if (action === 'reject') {
                s.transitionProject(p.id, 'timeline_generated');
            } else {
                return res.status(400).json({ error: 'Hành động không hợp lệ.', code: 'INVALID_ACTION' });
            }
            
            res.json({ success: true, project: s.getProject(p.id) });
        } catch (err) { fail(res, err); }
    });

    // Stream VIDEO ĐỐI THỦ (input của user) với HTTP 206 Range — cho step 1 xem lại.
    router.get('/projects/:id/reference-video', (req, res) => {
        const p = s.getProject(req.params.id);
        if (!p || !p.referenceVideoPath || !fs.existsSync(p.referenceVideoPath)) {
            return res.status(404).json({ error: 'Không có video đối thủ.', code: 'NO_REFERENCE' });
        }
        const filePath = p.referenceVideoPath;
        const fileSize = fs.statSync(filePath).size;
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': (end - start) + 1,
                'Content-Type': 'video/mp4'
            });
            fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
            fs.createReadStream(filePath).pipe(res);
        }
    });

    // Stream video Hook câu view user tải lên (206 Range) — song song với /reference-video
    router.get('/projects/:id/hook-video', (req, res) => {
        const p = s.getProject(req.params.id);
        if (!p || !p.hookVideoPath || !fs.existsSync(p.hookVideoPath)) {
            return res.status(404).json({ error: 'Không có video hook.', code: 'NO_HOOK' });
        }
        const filePath = p.hookVideoPath;
        const fileSize = fs.statSync(filePath).size;
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': (end - start) + 1,
                'Content-Type': 'video/mp4'
            });
            fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
            fs.createReadStream(filePath).pipe(res);
        }
    });

    // Stream video với HTTP 206 Range cho thẻ <video> (hỗ trợ index batch: ?index=N)
    router.get('/projects/:id/video', (req, res) => {
        const p = s.getProject(req.params.id);
        if (!p) return res.status(404).end();
        let targetPath = p.finalVideoPath;
        const idx = parseInt(req.query.index, 10);
        if (idx && Array.isArray(p.renderedVideos)) {
            const found = p.renderedVideos.find(v => v.index === idx);
            if (found && found.outputPath && fs.existsSync(found.outputPath)) {
                targetPath = found.outputPath;
            }
        }
        if (!targetPath || !fs.existsSync(targetPath)) {
            return res.status(404).end();
        }
        const stat = fs.statSync(targetPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(targetPath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(200, head);
            fs.createReadStream(targetPath).pipe(res);
        }
    });

    router.get('/projects/:id/output', (req, res) => {
        const p = s.getProject(req.params.id);
        if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
        let targetPath = p.finalVideoPath;
        let fileName = 'final.mp4';
        const idx = parseInt(req.query.index, 10);
        if (idx && Array.isArray(p.renderedVideos)) {
            const found = p.renderedVideos.find(v => v.index === idx);
            if (found && found.outputPath && fs.existsSync(found.outputPath)) {
                targetPath = found.outputPath;
                fileName = found.fileName || `final_${idx}.mp4`;
            }
        }
        if (!targetPath || !fs.existsSync(targetPath)) {
            return res.status(404).json({ error: 'Chưa có file video hoàn chỉnh.', code: 'NO_VIDEO' });
        }
        res.download(targetPath, fileName);
    });

    router.get('/projects/:id/storyboard', (req, res) => {
        const p = s.getProject(req.params.id);
        if (!p) return res.status(404).send('Project not found');
        const outDir = path.join(config.root, 'video_studio_outputs', p.id);
        const sbPath = path.join(outDir, 'storyboard.html');
        if (!fs.existsSync(sbPath)) exportProjectPackage(p, s);
        if (!fs.existsSync(sbPath)) return res.status(404).send('Storyboard not generated');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        fs.createReadStream(sbPath).pipe(res);
    });

    router.get('/projects/:id/manifest', (req, res) => {
        const p = s.getProject(req.params.id);
        if (!p) return res.status(404).json({ error: 'Không tìm thấy project.' });
        const outDir = path.join(config.root, 'video_studio_outputs', p.id);
        const mfPath = path.join(outDir, 'episode_manifest.json');
        if (!fs.existsSync(mfPath)) exportProjectPackage(p, s);
        if (!fs.existsSync(mfPath)) return res.status(404).json({ error: 'Manifest chưa được tạo.' });
        res.download(mfPath, 'episode_manifest.json');
    });

    router.get('/projects/:id/timeline-json', (req, res) => {
        const p = s.getProject(req.params.id);
        if (!p) return res.status(404).json({ error: 'Không tìm thấy project.' });
        const outDir = path.join(config.root, 'video_studio_outputs', p.id);
        const tlPath = path.join(outDir, 'production_timeline.json');
        if (!fs.existsSync(tlPath)) exportProjectPackage(p, s);
        if (!fs.existsSync(tlPath)) return res.status(404).json({ error: 'Timeline JSON chưa được tạo.' });
        res.download(tlPath, 'production_timeline.json');
    });

    router.get('/projects/:id/download-zip', async (req, res) => {
        try {
            const p = s.getProject(req.params.id);
            if (!p) return res.status(404).json({ error: 'Không tìm thấy project.', code: 'PROJECT_NOT_FOUND' });
            
            const outDir = path.join(config.root, 'video_studio_outputs', p.id);
            exportProjectPackage(p, s);
            
            // Collect files to zip
            const filesToZip = [];
            if (Array.isArray(p.renderedVideos) && p.renderedVideos.length > 0) {
                for (const rv of p.renderedVideos) {
                    if (rv.success && rv.outputPath && fs.existsSync(rv.outputPath)) {
                        filesToZip.push({ path: rv.outputPath, name: rv.fileName || `final_${rv.index}.mp4` });
                    }
                }
            } else {
                const finalMp4 = p.finalVideoPath;
                if (finalMp4 && fs.existsSync(finalMp4)) filesToZip.push({ path: finalMp4, name: 'final.mp4' });
            }
            const sbPath = path.join(outDir, 'storyboard.html');
            if (fs.existsSync(sbPath)) filesToZip.push({ path: sbPath, name: 'storyboard.html' });
            const tlPath = path.join(outDir, 'production_timeline.json');
            if (fs.existsSync(tlPath)) filesToZip.push({ path: tlPath, name: 'production_timeline.json' });
            const mfPath = path.join(outDir, 'episode_manifest.json');
            if (fs.existsSync(mfPath)) filesToZip.push({ path: mfPath, name: 'episode_manifest.json' });
            
            if (!filesToZip.length) return res.status(404).json({ error: 'Không có file để tải.' });
            
            // Use PowerShell to create zip (Windows)
            const zipPath = path.join(outDir, `${p.name.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF]/g, '_')}.zip`);
            // Copy all files to a temp staging dir, then zip
            const stageDir = path.join(outDir, '_zip_stage');
            if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
            fs.mkdirSync(stageDir, { recursive: true });
            for (const f of filesToZip) {
                fs.copyFileSync(f.path, path.join(stageDir, f.name));
            }
            
            const { execFileSync } = await import('child_process');
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            execFileSync('powershell', [
                '-NoProfile', '-Command',
                `Compress-Archive -Path '${stageDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`
            ], { timeout: 30000 });
            
            // Cleanup staging dir
            fs.rmSync(stageDir, { recursive: true, force: true });
            
            const safeName = p.name.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF]/g, '_') + '.zip';
            res.download(zipPath, safeName);
        } catch (err) { fail(res, err); }
    });

    return router;
}

export default createVideoStudioRouter;

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/**
 * Xuất gói dữ liệu dự án (SRS §13):
 * - final.mp4 (đã tạo bởi assembler)
 * - production_timeline.json
 * - episode_manifest.json
 * - storyboard.html
 */
export function exportProjectPackage(project, store, { outDir = null } = {}) {
    if (!project || !project.id) return;
    const baseDir = outDir || (store && store.root ? store.root : config.root);
    const targetDir = outDir || path.join(baseDir, 'video_studio_outputs', project.id);
    ensureDir(targetDir);

    const tl = project.productionTimeline || [];
    // 1. production_timeline.json
    try {
        fs.writeFileSync(path.join(targetDir, 'production_timeline.json'), JSON.stringify(tl, null, 2), 'utf-8');
    } catch (_) {}

    // 2. episode_manifest.json
    try {
        const manifest = {
            id: project.id,
            name: project.name,
            status: project.status,
            referenceVideoName: project.referenceVideoName,
            voice: project.voice || 'vi-VN-HoaiMyNeural',
            totalSegments: tl.length,
            totalDuration: tl.reduce((sum, s) => sum + Math.max(0, (Number(s.sourceOut) || 0) - (Number(s.sourceIn) || 0)), 0),
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            finalVideoPath: project.finalVideoPath || null
        };
        fs.writeFileSync(path.join(targetDir, 'episode_manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (_) {}

    // 3. storyboard.html
    try {
        const rows = tl.map((seg, idx) => {
            const asset = store ? store.getAsset(seg.sourceAssetId) : null;
            const assetName = asset ? asset.filename : (seg.sourceAssetId || 'Clip ?');
            const dur = Math.max(0, (Number(seg.sourceOut) || 0) - (Number(seg.sourceIn) || 0)).toFixed(1);
            return `<tr>
                <td><strong>#${seg.order || (idx + 1)}</strong></td>
                <td><code>${escapeHtml(assetName)}</code></td>
                <td>${seg.sourceIn}s → ${seg.sourceOut}s (${dur}s)</td>
                <td>${escapeHtml(seg.text || '—')}</td>
                <td>${escapeHtml(seg.voice || '—')}</td>
                <td>${escapeHtml(seg.transition || 'cut')}</td>
            </tr>`;
        }).join('');

        const html = `<!doctype html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <title>Storyboard — ${escapeHtml(project.name)}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f1117; color: #e2e8f0; padding: 2rem; margin: 0; }
        h1 { color: #a78bfa; margin-bottom: 0.5rem; }
        .meta { color: #94a3b8; font-size: 0.95rem; margin-bottom: 1.5rem; }
        table { border-collapse: collapse; width: 100%; margin-top: 1rem; background: #1a1d27; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
        th, td { border: 1px solid #2d3348; padding: 10px 14px; text-align: left; }
        th { background: #232736; color: #c4b5fd; font-weight: 600; }
        code { background: #2d3348; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>🎬 Storyboard: ${escapeHtml(project.name)}</h1>
    <div class="meta">Mã dự án: <code>${escapeHtml(project.id)}</code> · Số phân đoạn: ${tl.length} · Thời gian: ${new Date().toLocaleString('vi-VN')}</div>
    <table>
        <thead>
            <tr>
                <th>Phân đoạn</th>
                <th>Clip nguồn</th>
                <th>Thời điểm cắt</th>
                <th>Text Overlay</th>
                <th>Voice / Lời thoại</th>
                <th>Chuyển cảnh</th>
            </tr>
        </thead>
        <tbody>
            ${rows || '<tr><td colspan="6" style="text-align:center;color:#64748b;">Chưa có phân đoạn nào.</td></tr>'}
        </tbody>
    </table>
</body>
</html>`;
        fs.writeFileSync(path.join(targetDir, 'storyboard.html'), html, 'utf-8');
    } catch (_) {}
}
