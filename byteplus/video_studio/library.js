/**
 * byteplus/video_studio/library.js
 *
 * Local Media Library scanner cho tool "Video to Video" (GTF Video Studio, SRS §3).
 * Quét 1 folder video local, dùng ffprobe đọc metadata, lưu vào JSON store.
 *
 * Nguyên tắc (SRS §3, FR1/FR2/FR4):
 *  - Ghi nhận: asset_id, filename, path, duration, resolution, fps, codec, size,
 *    fingerprint (mtime:size) va category (theo thu muc con dau tien).
 *  - Incremental: file khong doi (fingerprint trung) thi bo qua, khong quet lai.
 *  - Fail-closed: ffprobe loi thi ghi vao errors, khong doan bua metadata.
 *
 * Zero dependency ngoai Node core + ffprobe co san tren PATH.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']);

export function isVideoFile(filePath) {
    return VIDEO_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

/** Fingerprint nhanh de phat hien file thay doi (khong hash toan bo noi dung). */
export function fileFingerprint(filePath) {
    const st = fs.statSync(filePath);
    return `${Math.round(st.mtimeMs)}:${st.size}`;
}

/** Suy ra category tu thu muc con dau tien duoi library root. VD people/clip.mp4 -> "people". */
export function inferCategory(filePath, libraryRoot) {
    const rel = path.relative(libraryRoot, filePath);
    if (rel.startsWith('..')) return '';
    const parts = rel.split(path.sep);
    return parts.length > 1 ? parts[0] : '';
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * PHÂN NHÓM KHO — chốt 2026-09-18: kho chỉ còn ĐÚNG 3 nhóm, bỏ "chưa phân loại".
 *   material  : nguyên liệu quay sẵn của mình (mặc định cho mọi clip không rõ nhóm)
 *   reference : video đối thủ dùng để phân tích
 *   hook      : clip hook 4-5s để mở đầu video thành phẩm
 * ─────────────────────────────────────────────────────────────────────────
 */
export const LIBRARY_GROUPS = [
    { id: 'material', label: 'Nguyên liệu', hint: 'Clip quay sẵn để dựng thân bài' },
    { id: 'reference', label: 'Video đối thủ', hint: 'Video mẫu để AI phân tích & học' },
    { id: 'hook', label: 'Video hook', hint: 'Clip 4-5s mở đầu, quyết định người xem có dừng lại' }
];

const _REFERENCE_ALIASES = new Set(['reference', 'ref', 'refs', 'doi-thu', 'doithu', 'doi_thu', 'competitor']);
const _HOOK_ALIASES = new Set(['hook', 'hooks', 'hook-video', 'hook_video']);

/**
 * Quy MỌI category thô (tên thư mục con, dữ liệu cũ, rỗng) về đúng 1 trong 3 nhóm.
 * Mặc định là 'material' — clip đã nằm trong kho thì luôn dùng được làm nguyên liệu,
 * không còn khái niệm "chưa phân loại".
 */
export function normalizeCategory(raw) {
    const v = String(raw == null ? '' : raw).trim().toLowerCase().replace(/^\(|\)$/g, '');
    if (_HOOK_ALIASES.has(v)) return 'hook';
    if (_REFERENCE_ALIASES.has(v)) return 'reference';
    return 'material';
}

/** Nhãn tiếng Việt của 1 nhóm kho. */
export function categoryLabel(id) {
    const g = LIBRARY_GROUPS.find(x => x.id === normalizeCategory(id));
    return g ? g.label : 'Nguyên liệu';
}

/**
 * Nhóm hợp lệ khi user tải video vào kho — cả 3 nhóm.
 * Mặc định là 'material' vì đây là nhóm user nạp nhiều nhất (footage dựng thân bài).
 */
export const UPLOAD_CATEGORIES = ['material', 'reference', 'hook'];

/**
 * ─────────────────────────────────────────────────────────────────────────
 * KẾ HOẠCH XOÁ 1 CLIP KHỎI KHO (đợt F).
 *
 * Lỗi user gặp: bấm "Xoá" mà clip không chịu mất. Nguyên nhân: xoá chỉ bỏ BẢN GHI,
 * còn file vẫn nằm trong kho/ nên `scanLibrary` lần sau index lại với asset_id MỚI
 * ⇒ clip sống lại. Đo được thật: bp_1789717774756_ea3c0131_hook.mp4 đổi từ
 * VID_72ad56e4eb sang VID_37c63d5274.
 *
 * Luật:
 *  - File nằm TRONG kho  → xoá cả bản ghi lẫn file (cách duy nhất để nó đứng yên).
 *  - File NGOÀI kho      → chỉ bỏ bản ghi. File đó thuộc thư mục dự án, xoá là phá
 *                          project; mà quét kho cũng không index lại nên không sống lại.
 *  - Đang được project dùng làm ref/hook → CHẶN hẳn, kể tên project để user biết vì sao.
 *  - Không rõ thư mục kho → tuyệt đối KHÔNG xoá file (fail-closed).
 * ─────────────────────────────────────────────────────────────────────────
 */
export function planAssetDeletion(asset, opts = {}) {
    const { libraryRoot = null, projects = [] } = opts;
    if (!asset || !asset.asset_id) {
        return { removeRecord: false, removeFile: false, code: 'ASSET_NOT_FOUND', usedBy: [] };
    }

    const filePath = String(asset.path || '');

    // Project nào đang dùng clip này làm video đối thủ / video hook?
    const usedBy = [];
    if (filePath) {
        const target = path.resolve(filePath).toLowerCase();
        for (const pr of (Array.isArray(projects) ? projects : [])) {
            if (!pr) continue;
            for (const [field, label] of [['referenceVideoPath', 'video đối thủ'], ['hookVideoPath', 'video hook']]) {
                const v = pr[field];
                if (v && path.resolve(String(v)).toLowerCase() === target) {
                    usedBy.push({ id: pr.id, name: pr.name || pr.id, field, label });
                }
            }
        }
    }
    if (usedBy.length > 0) {
        return { removeRecord: false, removeFile: false, code: 'ASSET_IN_USE', usedBy };
    }

    // Fail-closed: không biết kho ở đâu thì không dám xoá file.
    let insideLibrary = false;
    if (libraryRoot && filePath) {
        try {
            const root = path.resolve(String(libraryRoot));
            insideLibrary = path.resolve(filePath).startsWith(root + path.sep);
        } catch (_) { insideLibrary = false; }
    }

    return {
        removeRecord: true,
        removeFile: insideLibrary,
        code: insideLibrary ? 'IN_LIBRARY' : 'OUTSIDE_LIBRARY',
        usedBy: []
    };
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * BẢNG ĐIỂM 7 TIÊU CHÍ (đợt A) — đọc kết quả phân tích của AI ra dạng phẳng.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const HOOK_TYPES = [
    'cau-hoi', 'gay-soc', 'van-de', 'truoc-sau', 'so-sanh',
    'demo', 'loi-chung', 'con-so', 'khac'
];

/** Nhãn tiếng Việt của từng loại hook (dùng cho UI). */
export const HOOK_TYPE_LABELS = {
    'cau-hoi': 'Câu hỏi', 'gay-soc': 'Gây sốc', 'van-de': 'Nêu vấn đề',
    'truoc-sau': 'Trước / Sau', 'so-sanh': 'So sánh', 'demo': 'Demo sản phẩm',
    'loi-chung': 'Lời chứng thực', 'con-so': 'Con số', 'khac': 'Khác'
};

export const CRITERIA_KEYS = ['hook', 'structure', 'pacing', 'visual', 'audio', 'message', 'cta'];

export const CRITERIA_LABELS = {
    hook: 'Hook 3 giây đầu', structure: 'Cấu trúc kịch bản', pacing: 'Nhịp dựng',
    visual: 'Hình ảnh', audio: 'Âm thanh & giọng', message: 'Thông điệp', cta: 'Kêu gọi hành động'
};

/** Kẹp về thang 1-10. Trả null khi AI KHÔNG chấm — tuyệt đối không bịa điểm mặc định (§13). */
function _clampScore(v) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(1, Math.min(10, Math.round(n)));
}

function _strList(v) {
    if (!Array.isArray(v)) return [];
    return v.map(x => (typeof x === 'string' ? x : (x && typeof x === 'object' ? Object.values(x).filter(Boolean).join(' ') : String(x == null ? '' : x))))
        .map(x => x.trim()).filter(Boolean);
}

/**
 * Rút bảng điểm từ kết quả phân tích AI thành đối tượng phẳng để lưu lên asset/project.
 * An toàn với mọi input rác (null, thiếu trường, điểm ngoài thang).
 */
export function extractAnalysisScorecard(analysis) {
    const a = (analysis && typeof analysis === 'object') ? analysis : {};
    const cs = (a.criteria_scores && typeof a.criteria_scores === 'object') ? a.criteria_scores : {};
    const ha = (a.hook_analysis && typeof a.hook_analysis === 'object') ? a.hook_analysis : {};
    const st = (a.structure && typeof a.structure === 'object') ? a.structure : {};

    const criteriaScores = {};
    for (const k of CRITERIA_KEYS) criteriaScores[k] = _clampScore(cs[k]);

    const rawType = String(ha.type || ha.hook_type || '').trim().toLowerCase();
    const hookType = rawType ? (HOOK_TYPES.includes(rawType) ? rawType : 'khac') : null;

    return {
        overallScore: _clampScore(a.overall_score_1_10 ?? a.overall_score),
        criteriaScores,
        hookType,
        hookScore: _clampScore(ha.score_1_10 ?? ha.score),
        hookFirst3s: String(ha.first_3s || '').trim(),
        structure: {
            problem: String(st.problem || '').trim(),
            solution: String(st.solution || '').trim(),
            proof: String(st.proof || '').trim(),
            cta: String(st.cta || '').trim()
        },
        strengths: _strList(a.strengths),
        weaknesses: _strList(a.weaknesses),
        improvements: _strList(a.improvements)
    };
}

/**
 * Chay ffprobe tren 1 file, tra ve metadata chuan hoa.
 * Nem loi neu ffprobe that bai (fail-closed).
 */
export async function probeVideo(filePath, { ffprobePath = process.env.FFPROBE_PATH || 'ffprobe', timeoutMs = 60000 } = {}) {
    const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', String(filePath)];
    let stdout;
    try {
        ({ stdout } = await execFileAsync(ffprobePath, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }));
    } catch (err) {
        const e = new Error(`FFPROBE_FAILED: ffprobe khong đọc được ${path.basename(filePath)}: ${(err && err.message) || err}`);
        e.code = 'FFPROBE_FAILED';
        throw e;
    }

    let data;
    try {
        data = JSON.parse(stdout);
    } catch (_) {
        const e = new Error(`FFPROBE_FAILED: ffprobe trả về dữ liệu không phải JSON cho ${path.basename(filePath)}`);
        e.code = 'FFPROBE_FAILED';
        throw e;
    }

    const videoStream = (data.streams || []).find(s => s.codec_type === 'video') || {};
    const fmt = data.format || {};

    let fps = 0;
    const rate = String(videoStream.r_frame_rate || '0/1');
    if (rate.includes('/')) {
        const [num, den] = rate.split('/').map(Number);
        fps = den ? Math.round((num / den) * 100) / 100 : 0;
    } else {
        fps = Number(rate) || 0;
    }

    return {
        duration: Math.round((Number(fmt.duration) || 0) * 1000) / 1000,
        width: Number(videoStream.width) || 0,
        height: Number(videoStream.height) || 0,
        fps,
        codec: String(videoStream.codec_name || ''),
        file_size: Number(fmt.size) || 0
    };
}

/**
 * Sinh 1 ảnh thumbnail (poster frame) từ video bằng ffmpeg.
 * Trả về outPath khi xong; ném lỗi có code THUMB_FAILED nếu ffmpeg fail.
 */
export async function generateThumbnail(videoPath, outPath, { ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg', atSeconds = 1, width = 400, timeoutMs = 60000 } = {}) {
    const dir = path.dirname(outPath);
    fs.mkdirSync(dir, { recursive: true });
    // -ss trước -i để seek nhanh; scale giữ tỉ lệ; -frames:v 1 lấy đúng 1 khung.
    const args = ['-y', '-ss', String(atSeconds), '-i', String(videoPath),
        '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '4', String(outPath)];
    try {
        await execFileAsync(ffmpegPath, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    } catch (err) {
        // Video ngắn hơn atSeconds -> thử lại lấy khung đầu (giây 0).
        try {
            await execFileAsync(ffmpegPath, ['-y', '-i', String(videoPath), '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '4', String(outPath)], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
        } catch (err2) {
            const e = new Error(`THUMB_FAILED: ffmpeg không tạo được thumbnail cho ${path.basename(videoPath)}: ${(err2 && err2.message) || err2}`);
            e.code = 'THUMB_FAILED';
            throw e;
        }
    }
    if (!fs.existsSync(outPath)) {
        const e = new Error('THUMB_FAILED: ffmpeg chạy xong nhưng không có file thumbnail.');
        e.code = 'THUMB_FAILED';
        throw e;
    }
    return outPath;
}

/**
 * Quét folder đệ quy, probe từng video, upsert vào store.
 * store phải có: listAssets(), upsertAsset(data).
 * Tra ve { added, updated, unchanged, errors: [{file, error}] }.
 */
export async function scanLibrary(folder, store, opts = {}) {
    const root = path.resolve(String(folder || ''));
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        const e = new Error(`LIBRARY_FOLDER_NOT_FOUND: Thư mục thư viện không tồn tại: ${root}`);
        e.code = 'LIBRARY_FOLDER_NOT_FOUND';
        throw e;
    }

    const result = { added: 0, updated: 0, unchanged: 0, removed: 0, errors: [] };

    const videoFiles = [];
    const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            let st;
            try { st = fs.statSync(full); } catch { continue; }
            if (st.isDirectory()) walk(full);
            else if (st.isFile() && isVideoFile(full)) videoFiles.push(full);
        }
    };
    walk(root);
    videoFiles.sort((a, b) => {
        let tA = 0, tB = 0;
        try { tA = fs.statSync(a).mtimeMs; } catch (_) {}
        try { tB = fs.statSync(b).mtimeMs; } catch (_) {}
        return tB - tA;
    });

    const existingByPath = new Map();
    for (const a of store.listAssets()) existingByPath.set(a.path, a);

    // DỌN BẢN GHI MỒ CÔI: file đã bị xoá khỏi kho nhưng bản ghi còn lại thì giao diện
    // cứ hiện một clip không tài nào bỏ đi được (đúng lỗi user gặp với 2 clip trong kho/hook/).
    // CHỈ dọn clip nằm trong kho — clip ngoài kho thuộc thư mục dự án, hàm này không quản.
    if (typeof store.deleteAsset === 'function') {
        for (const a of store.listAssets()) {
            const fp = String((a && a.path) || '');
            if (!fp) continue;
            let inside = false;
            try { inside = path.resolve(fp).startsWith(root + path.sep); } catch (_) { inside = false; }
            if (!inside) continue;
            if (!fs.existsSync(fp)) {
                if (store.deleteAsset(a.asset_id)) {
                    existingByPath.delete(a.path);
                    result.removed += 1;
                }
            }
        }
    }

    // Cho phép inject probe (test không cần ffprobe thật).
    const probe = (opts && opts.probeFn) || probeVideo;

    for (const file of videoFiles) {
        const fingerprint = fileFingerprint(file);
        const existing = existingByPath.get(file);
        if (existing && existing.file_hash === fingerprint) {
            // File khong doi nhung NHOM co the da cu (truoc 2026-09-18 category = ten thu muc con).
            // Chuan hoa lai tai cho, neu khong 266 clip cu se khong bao gio duoc gan nhom.
            const wantCat = normalizeCategory(inferCategory(file, root));
            if ((existing.category || '') !== wantCat) {
                store.upsertAsset({ path: file, category: wantCat });
                result.updated += 1;
            } else {
                result.unchanged += 1;
            }
            continue;
        }

        let meta;
        try {
            meta = await probe(file, opts);
        } catch (err) {
            result.errors.push({ file, error: (err && err.message) || String(err) });
            continue;
        }

        let fileMtime = 0;
        try { fileMtime = fs.statSync(file).mtimeMs; } catch (_) {}

        store.upsertAsset({
            asset_id: existing ? existing.asset_id : 'VID_' + crypto.randomBytes(5).toString('hex'),
            filename: path.basename(file),
            path: file,
            category: normalizeCategory(inferCategory(file, root)),
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            fps: meta.fps,
            codec: meta.codec,
            file_size: meta.file_size,
            file_hash: fingerprint,
            mtime: existing?.mtime || fileMtime || Date.now(),
            createdAt: existing?.createdAt || new Date(fileMtime || Date.now()).toISOString(),
            // Field cho buoc sau (SRS §4) — chua phan tich thi de rong.
            described: existing ? Boolean(existing.described) : false,
            description_index: existing ? (existing.description_index || null) : null,
            descriptionIndex: existing ? (existing.descriptionIndex || existing.description_index || null) : null,
            aiDescription: existing ? (existing.aiDescription || null) : null
        });

        if (existing) result.updated += 1;
        else result.added += 1;
    }

    return result;
}

export default {
    scanLibrary, probeVideo, inferCategory, fileFingerprint, isVideoFile, VIDEO_EXTENSIONS,
    LIBRARY_GROUPS, normalizeCategory, categoryLabel, HOOK_TYPES, HOOK_TYPE_LABELS,
    UPLOAD_CATEGORIES, planAssetDeletion,
    CRITERIA_KEYS, CRITERIA_LABELS, extractAnalysisScorecard
};
