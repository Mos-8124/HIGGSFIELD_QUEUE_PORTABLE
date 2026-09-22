import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { runWithLimit, scriptGate } from './job_queue.js';
import { normalizeCategory, HOOK_TYPES } from './library.js';

export const DIVERSE_ANGLES = [
    { id: 'angle_pain_point', name: 'Nỗi đau quá cân & Phạt tiền', focus: 'Đánh thẳng vào nỗi sợ bị phạt tiền hành lý quá cước tại sân bay và vali chật chội' },
    { id: 'angle_capacity_3x', name: 'Gấp 3 lần sức chứa', focus: 'Nhấn mạnh khả năng nén xẹp đồ đạc, nhét trọn cả tủ quần áo vào 1 vali xách tay' },
    { id: 'angle_speed_ease', name: 'Hút chân không siêu tốc 10s', focus: 'Trình diễn tốc độ hút cực nhanh của máy bơm điện mini, chỉ 10 giây là xong' },
    { id: 'angle_before_after', name: 'So sánh Trước vs Sau', focus: 'Tương phản trực quan giữa đống quần áo bừa bộn phồng to và túi nén phẳng lì' },
    { id: 'angle_travel_hack', name: 'Mẹo đóng gói du lịch', focus: 'Bí kíp du lịch thông minh, đi chơi dài ngày không cần mang vác vali cồng kềnh' },
    { id: 'angle_compact_device', name: 'Thiết bị mini bỏ túi', focus: 'Tập trung vào kích thước máy bơm nhỏ gọn trong lòng bàn tay, cổng sạc Type-C tiện lợi' },
    { id: 'angle_airtight_valve', name: 'Khóa van 2 chiều kín khí', focus: 'Độ bền của túi dẻo dai và công nghệ van khóa một chiều chống rò rỉ khí tuyệt đối' },
    { id: 'angle_home_storage', name: 'Tiết kiệm 80% tủ quần áo', focus: 'Ứng dụng bảo quản chăn màn, quần áo mùa đông tại nhà sạch sẽ chống ẩm mốc' },
    { id: 'angle_house_moving', name: 'Chuyển nhà gọn nhẹ', focus: 'Giải pháp cho sinh viên và gia đình dọn nhà, chuyển trọ không còn nỗi lo đồ đạc quá tải' },
    { id: 'angle_smart_savings', name: 'Tiết kiệm chi phí hành lý', focus: 'Tính toán kinh tế: tiết kiệm tiền triệu mua thêm cân hành lý mỗi chuyến bay' },
    { id: 'angle_student_dorm', name: 'Dọn phòng trọ sinh viên', focus: 'Tối ưu phòng trọ chật hẹp, cất chăn gối ga đệm ngăn nắp không chiếm chỗ' },
    { id: 'angle_seasonal_wardrobe', name: 'Đổi mùa cất áo ấm', focus: 'Cất áo phao, áo len cồng kềnh mùa đông gọn gàng, chống ẩm mốc bụi bẩn' },
    { id: 'angle_gift_shopping', name: 'Du lịch tha hồ mua quà', focus: 'Đi chơi thoải mái mua sắm bánh kẹo quà tặng mang về vì vali còn dư nửa chỗ' },
    { id: 'angle_waterproof_protect', name: 'Chống nước & Bụi bẩn', focus: 'Bảo vệ quần áo tối đa khỏi ẩm mốc mùa mưa, côn trùng, và mùi hôi phòng trọ' },
    { id: 'angle_flight_crew_hack', name: 'Mẹo tiếp viên hàng không', focus: 'Bí quyết sắp xếp vali chuyên nghiệp của tiếp viên bay liên tục mỗi tuần' },
    { id: 'angle_backpack_hiking', name: 'Phượt thủ & Trekking', focus: 'Thu gọn ba lô leo núi dã ngoại nhẹ tênh, nhét thêm được túi ngủ và áo khoác' },
    { id: 'angle_emergency_laundry', name: 'Phân loại đồ sạch và dơ', focus: 'Cách ly đồ đã mặc sạch sẽ kín khí khi đi công tác dài ngày' },
    { id: 'angle_heavy_blanket', name: 'Nén chăn bông đại hàn', focus: 'Xử lý chiếc chăn bông to như núi nén ép lại chỉ còn mỏng như quyển sách' },
    { id: 'angle_family_vacation', name: 'Cả nhà du lịch chung 1 vali', focus: 'Gia đình 4 người đi biển chỉ cần 1 vali duy nhất, bố mẹ thảnh thơi dắt con' },
    { id: 'angle_durability_reuse', name: 'Bền bỉ tái sử dụng nhiều năm', focus: 'Chất liệu PA+PE dẻo dai chống rách xước, dùng bền bỉ quanh năm không xì hơi' }
];

export function readNineRouterApiKey() {
    try {
        const envPath = path.join(config.root, 'video-analyzer-pipeline', 'video-analyzer-standalone', '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const match = content.match(/NINE_ROUTER_API_KEY=(.*)/);
            if (match) return match[1].trim();
        }
    } catch (_) {}
    return process.env.NINE_ROUTER_API_KEY || '';
}

export function readNineRouterModel() {
    try {
        const envPath = path.join(config.root, 'video-analyzer-pipeline', 'video-analyzer-standalone', '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const match = content.match(/(?:NINE_ROUTER_TIMELINE_MODEL|TEXT_MODEL)=(.*)/);
            if (match && match[1].trim()) return match[1].trim();
        }
    } catch (_) {}
    return process.env.NINE_ROUTER_TIMELINE_MODEL || process.env.TEXT_MODEL || 'aa';
}

/**
 * Pre-flight Semantic Gate: So sánh nhanh từ khóa và ngữ nghĩa của Video Đối thủ
 * với toàn bộ Text mô tả của các clip trong kho.
 * Chạy trong 10-50ms (không tốn token LLM, không quét video).
 */
export function checkSemanticPreflight(referenceAnalysis, libraryAssets) {
    if (!referenceAnalysis) {
        return { canProceed: false, relevanceScore: 0, reason: 'Chưa có dữ liệu phân tích video đối thủ.' };
    }
    const described = (libraryAssets || []).filter(a => a.described && a.descriptionIndex && a.descriptionIndex.length);
    if (described.length === 0) {
        return { canProceed: false, relevanceScore: 0, reason: 'Kho chưa có clip nào được phân tích mô tả nội dung.' };
    }

    // Gom toàn bộ từ vựng phân tích của Reference
    const refTextParts = [
        referenceAnalysis.summary || '',
        referenceAnalysis.purpose || '',
        referenceAnalysis.conclusion || ''
    ];
    if (Array.isArray(referenceAnalysis.visual_events)) {
        for (const ev of referenceAnalysis.visual_events) {
            refTextParts.push(ev.description || '', (ev.objects || []).join(' '), (ev.actions || []).join(' '));
        }
    }
    const refRaw = refTextParts.join(' ').toLowerCase();

    // Tách từ khóa quan trọng (> 3 ký tự)
    const refWords = new Set(refRaw.match(/[\p{L}\p{N}]{3,}/gu) || []);
    if (refWords.size === 0) {
        return { canProceed: true, relevanceScore: 100, reason: 'Đạt chuẩn' };
    }

    // Đếm số clip trong kho có chứa ít nhất 1-2 từ khóa ngữ nghĩa tương đồng
    let matchCount = 0;
    for (const a of described) {
        const assetDesc = [
            a.aiDescription || '',
            JSON.stringify(a.descriptionIndex || [])
        ].join(' ').toLowerCase();

        let hits = 0;
        for (const w of refWords) {
            if (assetDesc.includes(w)) hits++;
        }
        if (hits >= 2) matchCount++;
    }

    const relevanceScore = Math.round((matchCount / described.length) * 100);

    // Nếu độ khớp dưới 5% hoặc số clip khớp < 3 thì coi như lệch chủ đề hoàn toàn
    if (relevanceScore < 5 && matchCount < 3) {
        return {
            canProceed: false,
            relevanceScore,
            matchedClips: matchCount,
            totalClips: described.length,
            reason: `Kho hiện tại (${described.length} clip) chỉ có ${matchCount} clip liên quan đến sản phẩm đối thủ (${relevanceScore}% khớp). Vui lòng nạp thêm clip phù hợp vào kho.`
        };
    }

    return {
        canProceed: true,
        relevanceScore: Math.max(relevanceScore, 70), // Đã có clip khớp chủ đề
        matchedClips: matchCount,
        totalClips: described.length,
        reason: 'Kho đạt chuẩn ngữ nghĩa, sẵn sàng sản xuất.'
    };
}

/**
 * Phân cụm kho footage theo hành động hình ảnh thực tế (Visual Clustering).
 */
export function clusterLibraryFootage(libraryAssets) {
    const assets = (libraryAssets || []).filter(a => a && a.described !== false);
    const clusters = {
        problem: [],
        feature: [],
        result: [],
        cta: []
    };

    const PROBLEM_REGEX = /(kẹt|hỏng|quá cân|phạt|nỗi đau|chật|bừa bộn|phồng|cồng kềnh|khổ|sợ|lo|quá tải|rách|nặng|rơi|vỡ|mất|đau|mệt|bực|phiền|problem|pain|mess|stuck|burst|dirty)/i;
    const FEATURE_REGEX = /(máy|bơm|cắm|nút|bật|khởi động|van|type-c|sạc|cầm|thiết bị|hút|thao tác|nhỏ gọn|mini|dây|bộ|lắp|công nghệ|feature|pump|device|plug|start|press)/i;
    const RESULT_REGEX = /(xẹp|phẳng|gọn|mỏng|ngăn nắp|đóng|xong|biến|nhanh|10s|10 giây|thần kỳ|kỳ diệu|thênh thang|rộng|gấp 3|tiết kiệm|result|flat|shrink|vacuumed|space|pack|fit)/i;
    const CTA_REGEX = /(mua|giỏ hàng|deal|combo|ưu đãi|săn|đặt|hàng|bấm|nhanh tay|quà|bảo hành|hoàn tiền|cta|shop|offer|discount|cart)/i;

    for (const a of assets) {
        const descText = [
            a.aiDescription || '',
            ...(Array.isArray(a.descriptionIndex) ? a.descriptionIndex.map(e => e.description || e.action || '') : []),
            ...(Array.isArray(a.description_index) ? a.description_index.map(e => e.description || e.action || '') : []),
            a.filename || ''
        ].join(' ');

        let matched = false;
        if (PROBLEM_REGEX.test(descText)) {
            clusters.problem.push(a);
            matched = true;
        }
        if (FEATURE_REGEX.test(descText)) {
            clusters.feature.push(a);
            matched = true;
        }
        if (RESULT_REGEX.test(descText)) {
            clusters.result.push(a);
            matched = true;
        }
        if (CTA_REGEX.test(descText)) {
            clusters.cta.push(a);
            matched = true;
        }

        if (!matched) {
            if (clusters.feature.length <= clusters.result.length) {
                clusters.feature.push(a);
            } else {
                clusters.result.push(a);
            }
        }
    }

    return clusters;
}

/**
 * TỐC ĐỘ ĐỌC THẬT của Edge TTS tiếng Việt (vi-VN-HoaiMyNeural), ĐO trực tiếp 2026-09-18:
 * 97 từ → 25.42s ⇒ 3.82 từ/giây. Trước đây hệ thống giả định 2.6 từ/giây nên phân cảnh bị tính
 * dài hơn voice ~32% ⇒ video có đoạn hình chạy mà đã hết tiếng và hết chữ.
 */
export const VOICE_SPEAK_RATE = Number(process.env.V2V_WORDS_PER_SEC) || 3.8;

/**
 * TỐC ĐỘ ĐỌC (VOICE_SPEAK_RATE) vs NGÂN SÁCH VIẾT (VOICE_WRITE_WORDS_PER_SEC) — tách đôi
 * từ 2026-09-18 và đây là điểm mấu chốt của cả đợt sửa này:
 *
 *  - VOICE_SPEAK_RATE = 3.8 từ/s là tốc độ Edge TTS ĐỌC THẬT (đo: 97 từ → 25.42s).
 *    Dùng để ƯỚC LƯỢNG thời lượng voice và làm NGƯỠNG CẮT khi câu lỡ dài.
 *  - VOICE_WRITE_WORDS_PER_SEC = 3.2 từ/s là ngân sách GIAO CHO AI KHI VIẾT.
 *
 * Vì sao phải khác nhau: nếu giao chỉ tiêu viết đúng bằng tốc độ đọc thì câu vừa viết xong
 * đã chạm trần, chỉ cần AI viết dư 1 chữ là bị cắt cụt giữa câu ("...chỉ trong vài.").
 * Đợt thử trước dùng chung một hằng số đã làm cụt 5/15 câu. Hạ ngân sách viết xuống 3.2
 * để cảnh 4.5s chỉ nhận 14 từ ⇒ đọc hết trong 3.7s ⇒ còn ~0.8s cho hình thở, câu trọn vẹn.
 *
 * User chốt: GIỮ NGUYÊN tốc độ đọc (không làm giọng chậm lại), chỉ sinh text vừa phân cảnh.
 */
export const VOICE_WRITE_WORDS_PER_SEC = Number(process.env.V2V_WRITE_WORDS_PER_SEC) || 3.2;

/** Giữ tên cũ cho các module đang import — chính là tốc độ ĐỌC. */
export const VOICE_WORDS_PER_SEC = VOICE_SPEAK_RATE;

/** Trần thời lượng video thành phẩm. User chốt 2026-09-18: 20-30s (trước là 60s). */
export const MAX_OUTPUT_SECONDS = Number(process.env.V2V_MAX_OUTPUT_SECONDS) || 30;

/**
 * Hook dài 1-5s (user chốt 2026-09-19: "độ dài mỗi phân cảnh a cho phép 1 - 5s").
 * Sàn cũ 4s làm khung cắt dài hơn clip hook thật (3.27s) ⇒ mốc xfade trượt quá cuối
 * luồng hình và video output mất sạch phân cảnh sau cảnh 1.
 * HOOK_DEFAULT_DUR chỉ dùng khi KHÔNG biết độ dài — không hạ xuống sàn 1s,
 * vì hook 1s thì chưa kịp giữ chân người xem.
 */
export const HOOK_MIN_DUR = 1.0;
export const HOOK_MAX_DUR = 5.0;
export const HOOK_DEFAULT_DUR = 4.0;

/** Mỗi phân cảnh thân bài 1-5s (user chốt 2026-09-19); trần 5s để không lê thê. */
export const SEGMENT_MIN_DUR = 1.0;
export const SEGMENT_MAX_DUR = 5.0;

/** Nhịp luân phiên 4.5 / 4.0 / 5.0 — tránh mọi cảnh dài y hệt nhau nghe như máy đếm nhịp. */
const _SEGMENT_RHYTHM = [4.5, 4.0, 5.0];

/**
 * Kẹp thời lượng hook về 1-5s VÀ không bao giờ vượt clip hook có thật.
 *
 * Video hook người dùng nạp có thể dài 15-34s; lấy trọn sẽ ăn hết quỹ 30s và làm
 * thân bài chỉ còn vài cảnh. Luôn gọi hàm này TRƯỚC KHI đưa hook vào bất kỳ phép tính nào.
 *
 * `sourceDuration` là chốt QUAN TRỌNG NHẤT: đo trên project thật, `hookAnalysis.duration`
 * là `undefined` (bộ phân tích không ghi trường đó), nên hàm này trả về mặc định 4s cho
 * một clip chỉ dài 3.27s ⇒ cửa sổ cắt dài hơn clip ⇒ mốc xfade trượt ⇒ video output mất
 * sạch phân cảnh sau cảnh 1. Truyền độ dài clip đo được vào đây là chặn từ gốc.
 */
export function clampHookDuration(raw, opts = {}) {
    const n = Number(raw);
    const base = (!Number.isFinite(n) || n <= 0) ? HOOK_DEFAULT_DUR : n;
    let d = Math.max(HOOK_MIN_DUR, Math.min(HOOK_MAX_DUR, Math.round(base * 100) / 100));

    // Không đo được clip thì giữ hành vi cũ — thà để assembler kẹp còn hơn tự đoán.
    const src = Number(opts.sourceDuration);
    if (Number.isFinite(src) && src > 0) {
        d = Math.max(HOOK_MIN_DUR, Math.min(d, Math.round(src * 100) / 100));
    }
    return d;
}

// Stopword tiếng Việt/Anh + từ chung của mô tả video — không mang thông tin sản phẩm.
const _STOPWORDS = new Set([
    'và', 'của', 'là', 'có', 'cho', 'với', 'các', 'những', 'một', 'này', 'đó', 'khi', 'để', 'trong',
    'ra', 'vào', 'lên', 'xuống', 'người', 'bạn', 'rất', 'được', 'thì', 'mà', 'ở', 'như', 'sẽ', 'đã',
    'đang', 'cũng', 'nhưng', 'nếu', 'hay', 'hoặc', 'trên', 'dưới', 'qua', 'lại', 'nó', 'họ', 'ta',
    'video', 'clip', 'cảnh', 'hình', 'ảnh', 'quay', 'nền', 'sản', 'phẩm', 'giới', 'thiệu', 'chiếc',
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'are', 'was', 'has', 'have', 'you', 'your'
]);

/**
 * Rút từ khoá SẢN PHẨM từ phân tích video đối thủ để lọc clip đúng chủ đề.
 * Kho dùng chung có thể trộn nhiều ngành hàng — nếu không lọc, AI sẽ ghép nhầm clip lạc đề.
 */
export function extractProductKeywords(referenceAnalysis, extraText = '') {
    const a = referenceAnalysis || {};
    const parts = [
        a.summary, a.purpose, a.conclusion, a.visual_summary, a.audio_summary, extraText,
        ...(Array.isArray(a.entities) ? a.entities.map(e => (typeof e === 'string' ? e : (e && (e.name || e.value)) || '')) : []),
        ...(Array.isArray(a.calls_to_action) ? a.calls_to_action : []),
        ...(Array.isArray(a.key_moments) ? a.key_moments.map(k => (typeof k === 'string' ? k : (k && (k.description || k.moment)) || '')) : [])
    ];
    const text = parts.filter(Boolean).join(' ').toLowerCase();
    const tokens = text.split(/[^a-zA-ZÀ-ỹ0-9]+/).filter(Boolean);
    const keywords = new Set();
    for (const t of tokens) {
        if (t.length < 2) continue;
        if (_STOPWORDS.has(t)) continue;
        if (/^\d+$/.test(t)) continue;
        keywords.add(t);
    }
    return keywords;
}

/**
 * Điểm liên quan của 1 clip với bộ từ khoá sản phẩm = số từ khoá KHÁC NHAU xuất hiện trong mô tả AI.
 */
export function scoreAssetRelevance(asset, keywords) {
    if (!asset || !keywords || keywords.size === 0) return 0;
    const text = [
        asset.aiDescription || '',
        asset.filename || '',
        ...(Array.isArray(asset.descriptionIndex) ? asset.descriptionIndex.slice(0, 5).map(e => e.description || e.action || '') : [])
    ].join(' ').toLowerCase();
    if (!text.trim()) return 0;
    const words = new Set(text.split(/[^a-zA-ZÀ-ỹ0-9]+/).filter(Boolean));
    let score = 0;
    for (const k of keywords) if (words.has(k)) score++;
    return score;
}

/**
 * Xếp kho theo độ liên quan: clip đúng chủ đề lên trước; nếu không đủ `minKeep` thì bù phần còn lại
 * (thà dùng clip chung chung còn hơn thiếu phân cảnh).
 */
export function rankAssetsByRelevance(assets, keywords, { minKeep = 0 } = {}) {
    const list = (assets || []).filter(Boolean);
    if (!keywords || keywords.size === 0) return list;
    const scored = list.map((a, i) => ({ a, i, s: scoreAssetRelevance(a, keywords) }));
    const relevant = scored.filter(x => x.s > 0).sort((x, y) => (y.s - x.s) || (x.i - y.i));
    if (relevant.length >= Math.max(1, minKeep)) return relevant.map(x => x.a);
    const rest = scored.filter(x => x.s === 0).map(x => x.a);
    return [...relevant.map(x => x.a), ...rest];
}

/**
 * Mạch kể cho N phân cảnh thân bài: LUÔN mở bằng `problem` và chốt bằng ĐÚNG MỘT `cta` ở cuối.
 * Video dài hơn (trần 60s) cần nhiều phân cảnh hơn — nếu cứ lặp chu kỳ 4 giai đoạn thì CTA sẽ
 * rải rác giữa video (sai mạch quảng cáo). Phần giữa luân phiên feature/result và thỉnh thoảng
 * quay lại problem để "xoáy" thêm nỗi đau trước khi chốt.
 */
export function buildStagePlan(count) {
    const n = Math.max(1, Number(count) || 1);
    if (n === 1) return ['cta'];
    if (n === 2) return ['problem', 'cta'];

    const middleCycle = ['feature', 'result', 'feature', 'problem', 'result'];
    const plan = ['problem'];
    for (let i = 0; i < n - 2; i++) plan.push(middleCycle[i % middleCycle.length]);
    plan.push('cta');
    return plan;
}

/**
 * Chọn chuỗi footage cụ thể từ kho trước khi viết lời bình (Asset-First / Footage-Driven).
 */
/** Số đoạn mô tả gửi kèm mỗi clip trong prompt. Clip 60s có tới 32 đoạn — gửi 3 là quá ít. */
export const ASSET_EVENTS_IN_PROMPT = 10;

/**
 * ─────────────────────────────────────────────────────────────────────────
 * CHỌN CỬA SỔ CẮT BÁM ĐÚNG KHUNG HÌNH (đợt E) — trái tim của việc "lời bình tả đúng hình".
 *
 * Trước đây chỗ này là HEAD RANDOMIZER: `Math.random() * min(15, clipDur - segDur)`.
 * Hậu quả đo thật: model đọc mô tả đoạn 0-4.5s rồi viết lời cho đoạn đó, nhưng hệ thống
 * lại cắt ở 10.3-14.8s — đoạn model CHƯA TỪNG thấy. Lời bình nói "nhét không vừa khung đo"
 * trong khi hình chiếu "nhấc chiếc túi đã ép phẳng". 5/5 phân cảnh đều lệch như vậy.
 *
 * Luật mới: cửa sổ cắt PHẢI nằm trọn trong một đoạn đã được AI mô tả, và trả về đúng
 * mô tả của đoạn đó để lời bình bám vào.
 *  - `requestedIn` rơi vào một đoạn có mô tả  → TÔN TRỌNG (lời bình đã viết cho mốc ấy).
 *  - Không có/không hợp lệ → xoay theo `variantSeed` để mỗi biến thể lấy một khoảnh khắc
 *    khác nhau của cùng clip (giữ sự đa dạng mà randomizer từng mang lại, nhưng có chủ đích).
 *  - Clip chưa có mô tả theo đoạn → lấy từ giây 0 kèm mô tả tổng quan, KHÔNG bịa mốc.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function resolveSegmentWindow(asset, segDur, opts = {}) {
    const { requestedIn = null, variantSeed = 0 } = opts;
    const a = asset || {};
    const clipDur = Number(a.duration) || 0;
    const want = Math.max(0.5, Number(segDur) || SEGMENT_MIN_DUR);
    const dur = clipDur > 0 ? Math.min(want, clipDur) : want;
    const r2 = (n) => Math.round(n * 100) / 100;

    const events = (a.descriptionIndex || a.description_index || [])
        .map(e => ({
            start: Number(e && e.start),
            end: Number(e && e.end),
            description: String((e && (e.description || e.action)) || '').trim()
        }))
        .filter(e => Number.isFinite(e.start) && Number.isFinite(e.end) && e.end > e.start && e.description);

    // Gộp mô tả của MỌI đoạn chạm vào cửa sổ. Cảnh dài 4-5s còn đoạn mô tả chỉ 1.5-3.5s,
    // nên một cảnh thường trải qua 2 đoạn. Trước đây chỉ đưa mô tả của 1 đoạn ⇒ AI viết lời
    // cho nửa đầu, nửa sau của cảnh không ai tả ⇒ vẫn lệch hình.
    const describeWindow = (start, end) => {
        const hit = events
            .filter(e => e.end > start + 0.01 && e.start < end - 0.01)
            .sort((x, y) => x.start - y.start);
        const beats = hit.map(e => ({
            at: `${r2(Math.max(0, e.start - start))}-${r2(Math.min(end, e.end) - start)}s`,
            action: e.description
        }));
        return { description: hit.map(e => e.description).join(' → '), beats };
    };

    if (events.length === 0) {
        return { start: 0, end: r2(dur), description: String(a.aiDescription || '').trim(), beats: [] };
    }

    const maxStart = Math.max(0, r2(clipDur - dur));

    // (1) Model đã chọn mốc và mốc đó nằm trong một đoạn có mô tả → giữ nguyên.
    // CHÚ Ý: Number(null) === 0, nên phải loại null/undefined/'' TRƯỚC khi ép kiểu —
    // nếu không mọi phân cảnh đều tưởng là "model xin mốc 0" và kẹt hết về giây 0.
    const hasReq = requestedIn !== null && requestedIn !== undefined && requestedIn !== ''
        && Number.isFinite(Number(requestedIn));
    const req = hasReq ? Number(requestedIn) : NaN;
    if (hasReq && req >= 0 && req <= maxStart + 0.01) {
        const covering = events.find(e => e.start <= req + 0.01 && e.end >= req + Math.min(1, dur) - 0.01);
        if (covering) {
            const win = { start: r2(req), end: r2(req + dur) };
            return { ...win, ...describeWindow(win.start, win.end) };
        }
    }

    // (2) Xoay theo biến thể, ưu tiên đoạn đủ dài để chứa trọn cửa sổ.
    // Bắt đầu cảnh ở ngay đầu một đoạn (mở cảnh đúng lúc hành động bắt đầu), và chỉ lấy
    // những đoạn mà cửa sổ 4-5s sau đó vẫn còn nằm trong phần clip đã được mô tả.
    const lastDescribed = Math.max(...events.map(e => e.end));
    const startable = events.filter(e => e.start <= maxStart + 0.01 && (e.start + dur) <= lastDescribed + 0.01);
    const pool = startable.length > 0 ? startable : events.filter(e => e.start <= maxStart + 0.01);
    if (pool.length === 0) {
        const end0 = r2(Math.min(dur, clipDur || dur));
        return { start: 0, end: end0, ...describeWindow(0, end0) };
    }
    const ev = pool[Math.abs(Number(variantSeed) || 0) % pool.length];
    const start = Math.max(0, Math.min(maxStart, r2(ev.start)));
    const end = r2(start + dur);
    return { start, end, ...describeWindow(start, end) };
}

export function selectFootageSequence(libraryAssets, opts = {}) {
    const {
        targetCount = 4,
        angle = null,
        globalUsage = {},
        keywords = null,
        variantSeed = 0
    } = opts;

    // CHỈ dùng clip nhóm Nguyên liệu làm footage thân bài.
    // Từ đợt B, video đối thủ và video hook được nhập thẳng vào kho ⇒ chúng trở thành clip hợp lệ
    // và bị bốc nhầm vào thân bài: đo thật thấy cảnh #2 lấy nguyên video ĐỐI THỦ, cảnh #3-#4 lấy
    // lại đúng clip hook. Thà thiếu footage còn hơn nhét video đối thủ vào quảng cáo của mình.
    let validAssets = (libraryAssets || [])
        .filter(a => a && a.described !== false && normalizeCategory(a.category) === 'material');
    if (validAssets.length === 0) return [];

    // Kho dùng chung có thể trộn nhiều ngành hàng → chỉ lấy clip ĐÚNG CHỦ ĐỀ, thiếu mới bù.
    validAssets = rankAssetsByRelevance(validAssets, keywords, { minKeep: targetCount });

    const clusters = clusterLibraryFootage(validAssets);
    const sequence = [];
    const usedIds = new Set();

    const stagePlan = buildStagePlan(targetCount);

    for (let i = 0; i < targetCount; i++) {
        const stageName = stagePlan[i];
        const pool = (clusters[stageName] && clusters[stageName].length > 0)
            ? clusters[stageName]
            : validAssets;

        const candidates = pool.filter(a => !usedIds.has(a.asset_id));
        const finalPool = candidates.length > 0 ? candidates : pool;

        // Ưu tiên clip ĐÚNG CHỦ ĐỀ trước, rồi mới tới clip ít dùng nhất.
        finalPool.sort((a, b) =>
            (scoreAssetRelevance(b, keywords) - scoreAssetRelevance(a, keywords)) ||
            ((globalUsage[a.asset_id] || 0) - (globalUsage[b.asset_id] || 0))
        );
        const selected = finalPool[0] || validAssets[i % validAssets.length];
        usedIds.add(selected.asset_id);

        const clipDur = Number(selected.duration) || SEGMENT_MAX_DUR;
        // Cảnh 4-5s theo nhịp luân phiên; clip gốc ngắn hơn thì lấy trọn clip, KHÔNG bịa thêm hình.
        const segDur = Math.round(Math.min(clipDur, _SEGMENT_RHYTHM[i % _SEGMENT_RHYTHM.length]) * 100) / 100;
        // Ngân sách từ tính theo tốc độ VIẾT (3.2) chứ không phải tốc độ ĐỌC (3.8),
        // để voice đọc xong trước khi cảnh kết thúc thay vì bị cắt cụt giữa câu.
        const maxWords = Math.max(4, Math.floor(segDur * VOICE_WRITE_WORDS_PER_SEC));
        const targetWords = Math.max(3, Math.floor(segDur * VOICE_WRITE_WORDS_PER_SEC * 0.92));
        const minWords = Math.max(3, Math.floor(segDur * VOICE_WRITE_WORDS_PER_SEC * 0.82));

        // Cửa sổ cắt bám đúng một đoạn ĐÃ được AI mô tả; visualAction là mô tả của CHÍNH đoạn đó,
        // nhờ vậy lời bình AI viết ra tả đúng thứ người xem sẽ nhìn thấy.
        const win = resolveSegmentWindow(selected, segDur, { variantSeed: variantSeed + i });
        const visualDesc = win.description || selected.aiDescription || 'Thao tác sản phẩm thực tế';
        const visualBeats = win.beats || [];

        sequence.push({
            order: i + 1,
            phase: stageName,
            sourceAssetId: selected.asset_id,
            assetPath: selected.path,
            assetFilename: selected.filename,
            sourceIn: win.start,
            sourceOut: win.end,
            duration: Math.round((win.end - win.start) * 100) / 100,
            targetWords,
            minWords,
            maxWords,
            visualAction: visualDesc,
            visualBeats
        });
    }

    return sequence;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * AI TỰ CHỌN HOOK TỪ KHO (đợt B) — dùng khi user KHÔNG nạp video hook.
 *
 * Luật user chốt 2026-09-18:
 *  - User chọn loại hook  → lấy clip hook ĐÚNG loại đó, trong đó điểm cao nhất.
 *  - Không chọn loại hook → lấy clip hook điểm đánh giá CAO NHẤT trong kho.
 *  - Kho không có clip hook nào → trả null (KHÔNG lấy bừa clip nguyên liệu).
 * ─────────────────────────────────────────────────────────────────────────
 */
/**
 * Chọn ĐIỂM BẮT ĐẦU của cửa sổ hook 4-5s trong 1 clip hook dài hơn.
 * Ưu tiên bám vào key_moment có điểm cao nhất (khoảnh khắc đắt giá nhất mà AI đã chấm);
 * không có key_moment thì lấy từ giây 0 — 3 giây đầu vốn đã là phần quyết định của hook.
 */
export function pickHookWindowStart(sourceDuration, windowDur, hookAnalysis = null, hookEvents = []) {
    const srcDur = Number(sourceDuration) || 0;
    const win = Number(windowDur) || HOOK_DEFAULT_DUR;
    const maxStart = Math.max(0, Math.round((srcDur - win) * 100) / 100);
    if (maxStart <= 0) return 0;

    const moments = (hookAnalysis && Array.isArray(hookAnalysis.key_moments)) ? hookAnalysis.key_moments : [];
    let best = null;
    for (const m of moments) {
        const t = Number(m && (m.start ?? m.timestamp ?? m.time));
        if (!Number.isFinite(t) || t < 0 || t > srcDur) continue;
        const score = Number(m.score ?? m.importance ?? m.confidence ?? 0) || 0;
        if (!best || score > best.score) best = { t, score };
    }
    if (best) {
        // Đặt khoảnh khắc đắt giá vào khoảng 1/3 đầu cửa sổ để người xem kịp bắt nhịp.
        const start = best.t - win / 3;
        return Math.max(0, Math.min(maxStart, Math.round(start * 100) / 100));
    }

    const ev = (Array.isArray(hookEvents) ? hookEvents : [])
        .map(e => Number(e && e.start)).filter(Number.isFinite).sort((a, b) => a - b);
    if (ev.length > 0) return Math.max(0, Math.min(maxStart, ev[0]));

    return 0;
}

export function pickHookFromLibrary(libraryAssets, opts = {}) {
    const pool = (Array.isArray(libraryAssets) ? libraryAssets : [])
        .filter(a => a && normalizeCategory(a.category) === 'hook');
    if (pool.length === 0) return null;

    // Điểm cao trước; cùng điểm thì ưu tiên clip có độ dài sát nhịp hook 4-5s; cuối cùng ổn định theo id.
    const mid = (HOOK_DEFAULT_DUR + HOOK_MAX_DUR) / 2;
    const rank = (a, b) =>
        ((Number(b.hookScore) || 0) - (Number(a.hookScore) || 0)) ||
        (Math.abs((Number(a.duration) || 0) - mid) - Math.abs((Number(b.duration) || 0) - mid)) ||
        String(a.asset_id || '').localeCompare(String(b.asset_id || ''));

    const wanted = (opts.hookType && opts.hookType !== 'auto')
        ? String(opts.hookType).trim().toLowerCase() : null;

    if (wanted) {
        const exact = pool.filter(a => String(a.hookType || '').trim().toLowerCase() === wanted);
        if (exact.length > 0) return exact.sort(rank)[0];
        // Loại hook user muốn không có trong kho → không ép, rơi về clip hook tốt nhất.
    }
    return pool.slice().sort(rank)[0];
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * ÉP 10 BIẾN THỂ PHẢI KHÁC NHAU (đợt C) — 4 yếu tố bắt buộc khai báo:
 *   persona (chân dung người xem) · boiCanh (bối cảnh) · daoCu (đạo cụ) · bangChung (bằng chứng)
 *
 * Hai biến thể trùng > maxSame yếu tố bị coi là KHÔNG hợp lệ (mặc định: trùng ≥3/4).
 * Không khai báo gì cũng là vi phạm — không khai thì không chứng minh được là đã khác nhau.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const DIFFERENTIATOR_FIELDS = ['persona', 'boiCanh', 'daoCu', 'bangChung'];

export function checkVariantDiversity(variants, opts = {}) {
    const maxSame = Number.isFinite(opts.maxSame) ? opts.maxSame : 2;
    const list = Array.isArray(variants) ? variants : [];

    const rowOf = (v) => {
        const d = (v && v.directorNote && v.directorNote.differentiators) || {};
        return DIFFERENTIATOR_FIELDS.map(f => String(d[f] == null ? '' : d[f]).trim().toLowerCase());
    };
    const rows = list.map(rowOf);

    const violations = [];
    for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
            const same = DIFFERENTIATOR_FIELDS.filter((_, k) => rows[i][k] === rows[j][k]);
            if (same.length > maxSame) {
                violations.push({ a: i, b: j, sameCount: same.length, same });
            }
        }
    }
    return { ok: violations.length === 0, violations };
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * BỘ LỌC CLAIM (đợt C) — chặn lời quảng cáo phạm luật trước khi lên video.
 *
 * Luật để ở danh sách cấu hình (không rải rác trong code) để đổi theo ngành hàng:
 *   { pattern: 'cụm bị cấm', reason: 'vì sao cấm', suggest: 'nói lại thế nào cho an toàn' }
 * ─────────────────────────────────────────────────────────────────────────
 */
export const DEFAULT_CLAIM_RULES = [
    { pattern: 'giảm cân', reason: 'claim giảm béo — cần công bố y tế', suggest: 'gọn gàng hơn' },
    { pattern: 'chữa', reason: 'claim chữa bệnh', suggest: 'hỗ trợ' },
    { pattern: 'điều trị', reason: 'claim y tế', suggest: 'hỗ trợ' },
    { pattern: 'khỏi bệnh', reason: 'claim y tế', suggest: 'dễ chịu hơn' },
    { pattern: 'không tác dụng phụ', reason: 'claim an toàn y tế', suggest: 'dùng được hằng ngày' },
    { pattern: 'thần dược', reason: 'thổi phồng công dụng', suggest: 'sản phẩm' },
    { pattern: '100%', reason: 'tuyệt đối hoá hiệu quả', suggest: 'rõ rệt' },
    { pattern: 'tuyệt đối', reason: 'tuyệt đối hoá hiệu quả', suggest: 'rất' },
    { pattern: 'số 1', reason: 'so sánh nhất — cần bằng chứng', suggest: 'được nhiều người chọn' },
    { pattern: 'tốt nhất', reason: 'so sánh nhất — cần bằng chứng', suggest: 'rất tốt' },
    { pattern: 'duy nhất', reason: 'so sánh nhất — cần bằng chứng', suggest: 'hiếm có' },
    { pattern: 'cam kết', reason: 'cam kết kết quả', suggest: 'mong muốn' }
];

function _claimRegex(pattern) {
    const esc = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Biên "từ" cho tiếng Việt: không dính vào chữ cái/chữ số liền trước hoặc liền sau,
    // để cụm bị cấm không khớp nhầm phần giữa của một từ dài hơn.
    return new RegExp(`(?<![\\p{L}\\d])${esc}(?![\\p{L}\\d])`, 'giu');
}

/** Trả về danh sách cụm vi phạm: [{term, reason, suggest}]. Rỗng = sạch. */
export function checkClaims(text, rules = DEFAULT_CLAIM_RULES) {
    const str = String(text == null ? '' : text);
    if (!str.trim()) return [];
    const hits = [];
    for (const r of (Array.isArray(rules) ? rules : [])) {
        if (!r || !r.pattern) continue;
        if (_claimRegex(r.pattern).test(str)) {
            hits.push({ term: r.pattern, reason: r.reason || 'claim không được phép', suggest: r.suggest || '' });
        }
    }
    return hits;
}

/** Thay mọi cụm cấm bằng cách nói an toàn. Dùng làm HẬU KIỂM sau khi AI viết kịch bản. */
export function applyClaimRules(text, rules = DEFAULT_CLAIM_RULES) {
    let out = String(text == null ? '' : text);
    if (!out.trim()) return out;
    for (const r of (Array.isArray(rules) ? rules : [])) {
        if (!r || !r.pattern) continue;
        out = out.replace(_claimRegex(r.pattern), r.suggest || '');
    }
    // Dọn khoảng trắng / dấu câu thừa do việc thay cụm để lại.
    return out.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim();
}

/** Áp bộ lọc claim lên toàn bộ voice + text của 1 timeline (sửa tại chỗ, trả về chính nó). */
export function sanitizeTimelineClaims(timeline, rules = DEFAULT_CLAIM_RULES) {
    if (!timeline || !Array.isArray(timeline.segments)) return timeline;
    for (const seg of timeline.segments) {
        if (seg && typeof seg.voice === 'string') {
            const cleaned = applyClaimRules(seg.voice, rules);
            if (cleaned !== seg.voice) {
                seg.voice = cleaned;
                seg.text = cleaned.replace(/[.!?]+$/, '').trim().toUpperCase();
            }
        }
    }
    return timeline;
}

/**
 * Nhận diện ngôn ngữ mục tiêu ('en' hoặc 'vi') từ mã giọng đọc Edge TTS.
 */
export function detectLanguageFromVoice(voice) {
    if (!voice || typeof voice !== 'string') return 'vi';
    const lower = voice.toLowerCase();
    if (lower.startsWith('en-') || lower.includes('english') || lower.includes('aria') || lower.includes('guy') || lower.includes('jenny') || lower.includes('eric') || lower.includes('sonia')) {
        return 'en';
    }
    return 'vi';
}

/**
 * Ràng buộc nghiêm ngặt độ dài lời bình (Voice Duration Constraint):
 * Lời bình (voice) của mỗi phân cảnh PHẢI BẰNG HOẶC NGẮN HƠN thời lượng phân cảnh (sourceOut - sourceIn).
 * Tốc độ nói ĐO THẬT (Edge TTS vi-VN): ~3.8 từ/giây. Số từ tối đa = floor(T_segment * 3.8).
 * ĐỒNG BỘ THOẠI 1:1: Phụ đề hiển thị (text) và lời thoại (voice) PHẢI LÀ MỘT (đồng bộ từng chữ thoại).
 */
// Từ KHÔNG BAO GIỜ đứng cuối câu: (a) từ nối, (b) danh từ loại thể / chỉ thời gian luôn cần bổ ngữ
// ("hôm" trong "hôm nay", "chiếc" trong "chiếc máy"). Cắt cứng để lại các từ này ⇒ câu cụt lủn.
const _CONNECTOR_TAIL = /\s+(và|hoặc|nhưng|rồi|khi|vì|để|cùng|với|tại|thì|mà|là|của|cho|ở|chỉ|này|kia|được|lại|ngay|luôn|bị|thôi|qua|vào|ra|lên|xuống|hãy|nên|cần|hôm|bữa|chuyến|đợt|lần|kỳ|chiếc|cái|con|bộ|món|phần|loại|kiểu|mức|tầm|khoảng|số|giờ|phút|giây|and|or|but|then|when|because|so|to|with|at|that|is|for|in|of)$/i;

/**
 * Cắt lời thoại (voice) cho vừa ngân sách `maxWords` NHƯNG giữ CÂU trọn vẹn — không cắt giữa câu.
 * Ưu tiên: (1) giữ tối đa số câu trọn vẹn ≤ budget; (2) nếu câu đầu đã vượt budget → cắt tại mệnh đề
 * (dấu phẩy) trong phạm vi budget; (3) fallback cắt từ + bỏ từ nối cụt cuối. Luôn kết bằng dấu câu.
 * Giúp voice + phụ đề khớp thời lượng phân cảnh mà vẫn đọc tự nhiên (không cụt lủn).
 */
export function fitVoiceToWords(text, maxWords) {
    if (!text || typeof text !== 'string') return '';
    const clean = text.trim();
    if (!clean) return '';
    const cap = Math.max(1, Number(maxWords) || 1);
    const totalWords = clean.split(/\s+/).filter(Boolean).length;
    if (totalWords <= cap) {
        return clean; // trong budget → giữ nguyên, không đụng
    }

    // Tách theo câu (. ! ? …) và giữ tối đa số câu trọn vẹn nằm trong budget.
    const sentences = (clean.match(/[^.!?…]+[.!?…]*/g) || [clean]).map(s => s.trim()).filter(Boolean);
    const kept = [];
    let count = 0;
    for (const s of sentences) {
        const w = s.split(/\s+/).filter(Boolean).length;
        if (count + w <= cap) { kept.push(s); count += w; } else break;
    }
    if (kept.length > 0) {
        let out = kept.join(' ').trim();
        if (!/[.!?…]$/.test(out)) out += '.';
        return out;
    }

    // Câu đầu đã vượt budget → cắt tại mệnh đề (dấu phẩy/;/:) trong phạm vi budget, else cắt từ.
    const words = sentences[0].split(/\s+/).filter(Boolean).slice(0, cap);
    let sub = words.join(' ');
    const clause = sub.match(/^(.*[,;:–—-])\s*\S*$/);
    if (clause && clause[1].trim().split(/\s+/).length >= Math.ceil(cap / 2)) {
        sub = clause[1];
    }
    let trimmed = sub.replace(/[.!?]+$/, '').trim();
    let prev = '';
    while (prev !== trimmed) {
        prev = trimmed;
        trimmed = trimmed.replace(/[,;:–—\-\s]+$/, '').trim();
        trimmed = trimmed.replace(_CONNECTOR_TAIL, '').trim();
    }
    if (trimmed && !/[.!?…]$/.test(trimmed)) trimmed += '.';
    return trimmed;
}

/**
 * NGÂN SÁCH THỜI LƯỢNG OUTPUT — trần mặc định 60 giây (1 phút).
 *
 * Trước đây phần thân chỉ cố định 4 clip (~17s tổng) nên video quá ngắn, nhất là khi hook dài.
 * Hàm này tính số phân cảnh THÂN + KẾT để lấp đầy quỹ thời gian còn lại sau hook, đồng thời
 * trả về hạn dùng lại clip (`maxUsagePerAsset`) đủ lớn để kho nhỏ không bị tụt coverage.
 *
 * @returns {{maxOutputSeconds:number, bodyCount:number, estimatedTotal:number, maxUsagePerAsset:number}}
 */
export function planOutputBudget({
    hookDuration = 0,
    libraryCount = 0,
    variantCount = 10,
    maxOutputSeconds = MAX_OUTPUT_SECONDS,
    // 4.5s = thời lượng trung bình 1 phân cảnh thân bài theo nhịp 4-5s đã chốt.
    avgSegmentSeconds = 4.5,
    minBodySegments = 4,
    maxBodySegments = 16,
    baseMaxUsagePerAsset = 3
} = {}) {
    const cap = Math.max(10, Number(maxOutputSeconds) || MAX_OUTPUT_SECONDS);
    // TỰ kẹp hook ngay tại đây: bẫy đã gặp thật là hook thô 34s lọt vào ngân sách,
    // ăn hết quỹ và chỉ còn vài cảnh thân bài. Kẹp ở mọi ngả vào, không tin nơi gọi.
    const hook = (Number(hookDuration) > 0) ? clampHookDuration(hookDuration) : 0;
    const avgSeg = Math.max(1.5, Number(avgSegmentSeconds) || 4.5);

    // Quỹ thời gian cho thân + kết (luôn giữ tối thiểu minBodySegments để còn chỗ chốt đơn).
    const bodyBudget = Math.max(avgSeg * minBodySegments, cap - hook);
    let bodyCount = Math.floor(bodyBudget / avgSeg);
    bodyCount = Math.max(minBodySegments, Math.min(maxBodySegments, bodyCount));
    // Ưu tiên không lặp clip trong CÙNG một video khi kho đủ nhỏ.
    if (libraryCount > 0) bodyCount = Math.min(bodyCount, Math.max(minBodySegments, libraryCount));

    const slots = Math.max(1, variantCount) * bodyCount;
    const maxUsagePerAsset = libraryCount > 0
        ? Math.max(baseMaxUsagePerAsset, Math.ceil(slots / libraryCount))
        : baseMaxUsagePerAsset;

    return {
        maxOutputSeconds: cap,
        bodyCount,
        estimatedTotal: Math.round((hook + bodyCount * avgSeg) * 10) / 10,
        maxUsagePerAsset
    };
}

/**
 * SCENE FITS VOICE — Nới thời lượng phân cảnh cho VỪA lời bình thay vì cắt cụt chữ.
 *
 * Trả về thời lượng (giây) nên dùng cho phân cảnh:
 *  - Lời bình đã vừa → giữ nguyên (hàm KHÔNG BAO GIỜ rút ngắn phân cảnh).
 *  - Lời bình dài hơn → nới tới mức đủ đọc tự nhiên (wordsPerSec + đệm), nhưng chặn trên bởi:
 *      (a) phần clip gốc còn lại kể từ sourceIn (`clipDuration`) — không bịa thêm hình,
 *      (b) `maxExtendRatio` (không để 1 phân cảnh phình quá dài so với nhịp dựng),
 *      (c) `maxSegmentDur` (trần tuyệt đối).
 *  - KHÔNG biết `clipDuration` → không nới (an toàn: tránh audio dài hơn video gây lệch tiếng).
 */
export function fitSegmentDurationToVoice(seg, opts = {}) {
    // Nới theo tốc độ ĐỌC thật (3.8) vì đây là đo xem voice cần bao lâu; trần nới = 5s (nhịp 4-5s).
    const { wordsPerSec = VOICE_SPEAK_RATE, pad = 0.35, maxExtendRatio = 2.0, maxSegmentDur = SEGMENT_MAX_DUR } = opts;
    if (!seg) return 0;

    const start = Math.max(0, Number(seg.sourceIn) || 0);
    const end = Math.max(start + 1.0, Number(seg.sourceOut) || (start + 3.0));
    const curDur = Math.round(Math.max(1.0, end - start) * 100) / 100;

    const words = (typeof seg.voice === 'string') ? seg.voice.trim().split(/\s+/).filter(Boolean).length : 0;
    if (words === 0) return curDur;

    const needed = words / wordsPerSec + pad;
    if (needed <= curDur) return curDur;

    const clipDur = Number(seg.clipDuration) || Number(seg.assetDuration) || 0;
    if (clipDur <= 0) return curDur; // không rõ độ dài clip → không nới
    const room = Math.max(1.0, clipDur - start);

    const target = Math.min(needed, curDur * maxExtendRatio, maxSegmentDur, room);
    return Math.max(curDur, Math.round(target * 100) / 100);
}

export function enforceVoiceDurationConstraint(timeline, opts = {}) {
    if (!timeline || !Array.isArray(timeline.segments)) return timeline;

    // Trần tổng thời lượng video thành phẩm (mặc định 60s) — nới phân cảnh KHÔNG được vượt trần.
    const maxTotal = Math.max(10, Number(opts.maxTotalSeconds) || MAX_OUTPUT_SECONDS);
    const segDurOf = (sg) => {
        const st = Math.max(0, Number(sg.sourceIn) || 0);
        return Math.max(1.0, Math.max(st + 1.0, Number(sg.sourceOut) || (st + 3.0)) - st);
    };
    let totalDur = timeline.segments.reduce((sum, sg) => sum + segDurOf(sg), 0);

    for (const seg of timeline.segments) {
        const start = Math.max(0, Number(seg.sourceIn) || 0);
        const end = Math.max(start + 1.0, Number(seg.sourceOut) || (start + 3.0));
        let dur = Math.max(1.0, end - start);

        // Bước 1 — ƯU TIÊN nới phân cảnh cho vừa lời bình (giữ trọn chữ), chỉ cắt khi hết chỗ.
        // Chỉ nới trong phần quỹ thời lượng còn lại (nới một phần vẫn hơn không nới).
        const fittedDur = fitSegmentDurationToVoice(seg);
        const roomLeft = Math.max(0, maxTotal - totalDur);
        const allowedDur = Math.min(fittedDur, dur + roomLeft);
        if (allowedDur > dur) {
            totalDur += (allowedDur - dur);
            dur = Math.round(allowedDur * 100) / 100;
            seg.sourceOut = Math.round((start + dur) * 100) / 100;
            if (typeof seg.duration === 'number') seg.duration = dur;
        }

        // Bước 2 — hết chỗ nới thì mới cắt, và cắt theo CÂU trọn vẹn.
        const maxWords = Math.max(3, Math.floor(dur * VOICE_WORDS_PER_SEC));

        if (seg.voice && typeof seg.voice === 'string') {
            seg.voice = fitVoiceToWords(seg.voice, maxWords);
        }

        // BẮT BUỘC: Text overlay và Voice thoại PHẢI ĐỒNG BỘ 100% (Phụ đề bám sát từng chữ nói)
        // Subtitle text chính là phụ đề của câu thoại voice
        if (seg.voice && typeof seg.voice === 'string') {
            const cleanVoiceText = seg.voice.replace(/[.!?]+$/, '').trim();
            seg.text = cleanVoiceText.toUpperCase();
        }
    }

    return timeline;
}

/**
 * Sinh 1 Production Timeline đơn lẻ theo 1 góc tiếp cận cụ thể.
 */
export async function generateTimeline(referenceAnalysis, libraryAssets, hookAnalysis = null, opts = {}) {
    const {
        angle = null,
        apiKey: explicitKey = null,
        temperature = 0.6,
        angleIndex = 0,
        hookVideoPath = null,
        hookVideoName = null,
        hookType = 'auto',   // 'auto' = model tự chọn hook phù hợp; hoặc user chỉ định 1 hook cụ thể
        voice = null,
        language = null
    } = opts;

    const apiKey = explicitKey || readNineRouterApiKey();
    const selectedVoice = voice || (opts.hookContext && opts.hookContext.voice) || 'vi-VN-HoaiMyNeural';
    const targetLang = language || detectLanguageFromVoice(selectedVoice);
    const isEnglish = (targetLang === 'en');

    const describedAssets = (libraryAssets || []).filter(a => a.described);
    // Model chỉ được nhìn thấy clip Nguyên liệu — không cho nó cơ hội bốc clip đối thủ/hook.
    const bodyAssets = describedAssets.filter(a => normalizeCategory(a.category) === 'material');
    const selectedAngle = angle || DIVERSE_ANGLES[0];
    const candidateFootage = [];
    let hookDur = (opts.hookContext && opts.hookContext.hookDuration) || (hookAnalysis && hookAnalysis.duration) || 0;
    if (!hookDur && hookAnalysis && Array.isArray(hookAnalysis.visual_events) && hookAnalysis.visual_events.length > 0) {
        hookDur = Math.max(...hookAnalysis.visual_events.map(e => e.end || 0));
    }
    if (hookVideoPath || hookAnalysis) {
        // Hook 1-5s: video hook user nạp có thể dài 15-34s nhưng chỉ lấy đoạn đắt giá nhất,
        // và tuyệt đối không dài hơn chính clip đó.
        const hDur = clampHookDuration(hookDur, {
            sourceDuration: (opts.hookContext && opts.hookContext.hookSourceDuration) || 0
        });
        candidateFootage.push({
            order: 1,
            phase: 'hook',
            sourceAssetId: 'HOOK_SOURCE',
            duration: hDur,
            targetWords: Math.max(6, Math.floor(hDur * VOICE_WRITE_WORDS_PER_SEC * 0.92)),
            minWords: Math.max(5, Math.floor(hDur * VOICE_WRITE_WORDS_PER_SEC * 0.82)),
            maxWords: Math.max(7, Math.floor(hDur * VOICE_WRITE_WORDS_PER_SEC)),
            visualAction: (hookAnalysis && (hookAnalysis.summary || hookAnalysis.purpose)) || 'Khoảnh khắc kịch tính cao trào từ video Hook'
        });
    }

    // Ngân sách thời lượng: lấp đầy tới trần (mặc định 60s) thay vì cố định 4 clip thân bài.
    const budget = planOutputBudget({
        hookDuration: (hookVideoPath || hookAnalysis) ? clampHookDuration(hookDur) : 0,
        libraryCount: bodyAssets.length,
        variantCount: Number(opts.variantCount) || 10
    });
    // Từ khoá sản phẩm (từ phân tích đối thủ + hook) để loại clip lạc đề trong kho dùng chung.
    const productKeywords = extractProductKeywords(
        referenceAnalysis,
        [hookAnalysis && (hookAnalysis.summary || hookAnalysis.purpose), selectedAngle.name, selectedAngle.focus]
            .filter(Boolean).join(' ')
    );
    const bodyClips = selectFootageSequence(bodyAssets, {
        targetCount: budget.bodyCount,
        angle: selectedAngle,
        keywords: productKeywords,
        // Mỗi biến thể lấy một khoảnh khắc khác nhau của cùng clip — đa dạng nhưng vẫn đúng hình.
        variantSeed: Number(angleIndex) || 0
    });

    // Chỉ đưa cho model kho ĐÚNG CHỦ ĐỀ (xếp theo độ liên quan, trần 80 clip) — tránh model
    // bốc nhầm clip ngành hàng khác và giữ prompt gọn.
    const assetList = rankAssetsByRelevance(bodyAssets, productKeywords, { minKeep: budget.bodyCount + 4 })
        .slice(0, 80)
        .map(a => ({
            id: a.asset_id,
            duration: a.duration,
            description: a.aiDescription || '',
            events: (a.descriptionIndex || []).slice(0, ASSET_EVENTS_IN_PROMPT).map(e => ({
                start: e.start,
                end: e.end,
                action: e.description || e.action || ''
            }))
        }));
    const hookSegments = (hookVideoPath || hookAnalysis) ? 1 : 0;
    const minSegments = budget.bodyCount + hookSegments;
    const maxSegments = minSegments + 1; // biên hẹp: mỗi phân cảnh dư ≈ +5s ⇒ dễ vượt trần 60s
    bodyClips.forEach((c) => {
        candidateFootage.push({
            ...c,
            order: candidateFootage.length + 1
        });
    });

    // Chỉ thị hook: user chọn cụ thể -> khoá; 'auto' -> để model tự chọn theo độ PHÙ HỢP.
    const hookDirective = (hookType && hookType !== 'auto')
        ? ('HOOK SELECTION (USER-LOCKED): The user has FIXED the hook type to "' + hookType + '". Segment 1 MUST execute exactly this hook type; still justify how you execute it in directorNote.hookType.')
        : 'HOOK SELECTION (AUTO): Analyze the angle, the product and the reference video, then CHOOSE the ONE hook type from the menu that BEST FITS this specific script (best match to audience, product and reference pacing). Justify the fit in directorNote.hookType. Do not pick randomly and do not default to the same hook every time.';

    const langRule = isEnglish ? `LANGUAGE REQUIREMENT (CRITICAL): THE ENTIRE SCRIPT MUST BE WRITTEN IN 100% NATURAL, HIGH-CONVERTING ENGLISH.
- All fields "title", "text" (on-screen subtitle caption), "voice" (voiceover narration), and "directorNote" (hookAngle, hookToBodyBridge, assetRationale) MUST BE 100% IN ENGLISH.
- DO NOT use Vietnamese. Pacing, tone and vocabulary must match high-converting TikTok/Reels ads in English.` : `NGÔN NGỮ BẮT BUỘC (QUAN TRỌNG NHẤT): TOÀN BỘ KỊCH BẢN PHẢI VIẾT BẰNG 100% TIẾNG VIỆT HOÀN TOÀN TỰ NHIÊN, TRUYỀN CẢM.
- Mọi trường "title", "text" (chữ phụ đề trên màn hình), "voice" (lời bình thuyết minh voiceover) và "directorNote" (hookAngle, hookToBodyBridge, assetRationale) BẮT BUỘC PHẢI BẰNG TIẾNG VIỆT 100%.
- Tuyệt đối KHÔNG viết bằng tiếng Anh. Toàn bộ ngôn từ phải mang đậm phong cách chốt đơn, giật gân, cuốn hút của TikTok/Reels Việt Nam.`;

    const systemPrompt = `You are an elite Direct-Response Short-Form Video Ad Director (TikTok / Reels / YouTube Shorts). Generate ONE complete Production Timeline that assembles clips from an EXISTING stock library into a high-converting short ad whose pacing mirrors a competitor reference video.

${langRule}

CREATIVE ANGLE (this drives the whole script — never fall back to a generic template):
- Angle: "${selectedAngle.name}"
- Direction: ${selectedAngle.focus}

=====================================================================
STEP 0 — CHOOSE A COPYWRITING FRAMEWORK that best fits THIS angle, then follow its beat-by-beat logic:
- AIDA — Attention -> Interest -> Desire -> Action. Best for broad awareness / cold traffic.
- PAS — Problem -> Agitate -> Solve. Best for pain-point angles; twist the knife before the fix.
- BAB — Before -> After -> Bridge. Best for visual transformation / before-after angles.
- PASTOR — Problem -> Amplify -> Story -> Transformation -> Offer -> Response. Best for story-led, higher-consideration.
- FAB — Feature -> Advantage -> Benefit. Best for spec/feature-heavy demo angles.
- 4Ps — Promise -> Picture -> Proof -> Push. Best when you have a bold claim to back with proof.
- Star-Story-Solution — hero moment -> relatable story -> product as resolution. Best for POV/relatable angles.
- Hook-Retain-Reward — open loop -> keep paying it off -> deliver payoff at CTA. Best for curiosity / retention plays.
Record the chosen framework in directorNote.framework.

=====================================================================
STEP 1 — ${hookDirective}
HOOK TYPE MENU (the first 1-3 seconds decide the whole ad):
- problem/pain — open on the viewer's exact frustration.
- shocking-stat — lead with a hard number that stops the scroll.
- bold-claim — a big, confident promise stated flatly.
- negative/warning — "Stop doing X" / "Never buy Y until...".
- curiosity-gap — tease an answer you only reveal later.
- direct-question — ask the viewer a yes-question they nod to.
- POV/relatable — "POV: you're..." lived-in first-person moment.
- before-after-reveal — show the messy before, promise the after.
- pattern-interrupt — an unexpected visual/verbal jolt that breaks the feed.
- social-proof — "Everyone's switching to..." / crowd validation.
- contrarian/myth-vs-fact — bust a belief the audience holds.
- demonstration — start mid-action showing the product working.
- story-cold-open — drop into a mini-story already in motion.
- mistake — "I wasted $X until I learned this".
- price-shock — contrast a painful cost with your cheap fix.
- scarcity — limited stock / limited time urgency up front.
- discovery — "I found this and can't stop using it".
- comment-reply — answer a (real or implied) viewer comment.
- numbered-breakdown — "3 reasons this bag never overweighs".
Record the chosen hook type in directorNote.hookType and justify the fit.

=====================================================================
MANDATORY 4-PHASE STRUCTURE:
1. HOOK (1-5 seconds, HARD LIMIT): Execute the chosen hook type. IF A HOOK VIDEO EXISTS, segment 1 MUST use its footage (sourceAssetId: "HOOK_SOURCE") and MUST last 1-5 seconds — pick the single most arresting window of that clip, never the whole clip, and NEVER a window longer than the clip itself. Aim for 4-5s when the clip allows it; a hook longer than 5s burns the budget and the viewer scrolls away before the payoff. If no hook video exists, the hook phase is a 1-5s library clip.
2. BRIDGE: ONE smooth transition line pivoting from the hook's tension to the product as the solution.
3. BODY: Demonstrate features / usage / results following the reference video's rhythm, using DIFFERENT library clips per segment.
4. CTA: Close with ONE call to action chosen from the CTA MENU below.

NOTE ON DURATION: Do not enforce an artificial short total duration cap. Focus on a high-retention hook and compelling body/CTA narrative. Script segments will dictate total video length naturally.

CTA MENU (Vietnamese calls to action - choose the CTA style that best fits the framework + angle):
- urgency — "Bấm giỏ hàng ngay kẻo lỡ đợt giảm giá duy nhất hôm nay."
- value/offer — "Bấm ngay giỏ hàng bên dưới để săn combo giá hời."
- social-proof — "Hơn mười nghìn người đã mua và hoàn toàn hài lòng."
- curiosity — "Khám phá ngay lý do vì sao sản phẩm này đang gây bão mạng."
- risk-reversal — "Dùng thử miễn phí, hoàn tiền ngay nếu không ưng ý."
- identity — "Món đồ không thể thiếu cho những tín đồ xê dịch thông minh."
- command/direct — "Bấm vào giỏ hàng góc trái đặt mua ngay hôm nay."
Record the chosen CTA style in directorNote.ctaStyle.

=====================================================================
FOOTAGE-DRIVEN & ĐỒNG BỘ THOẠI 1:1 TUYỆT ĐỐI GIỮA TEXT VÀ VOICE:
1. CHỌN FOOTAGE TRƯỚC - VIẾT LỜI BÌNH SAU (Asset-First / Footage-Driven):
   Mỗi phân cảnh phải bám sát hành động cụ thể đang diễn ra trên video đã chọn từ kho. Lời thoại PHẢI diễn tả đúng và ăn khớp hoàn toàn với hành động visualAction trong clip đó!
2. RÀNG BUỘC THỜI LƯỢNG LỜI BÌNH (BẮT BUỘC - LẤP ĐẦY PHÂN CẢNH, KHÔNG ĐƯỢC QUÁ NGẮN):
   - Lời bình ("voice") PHẢI VỪA VẶN VỚI THỜI LƯỢNG PHÂN CẢNH (sourceOut - sourceIn), TUYỆT ĐỐI KHÔNG để câu quá ngắn làm video bị chết lặng trong thời gian còn lại!
   - Tốc độ nói chuẩn (đo thật): ~3.8 từ/giây.
   - Số từ của "voice" BẮT BUỘC PHẢI NẰM TRONG KHOẢNG [minVoiceWords, maxVoiceWords] và xấp xỉ targetVoiceWords:
     + Phân cảnh 1.0s: Viết 2 - 3 từ (một cụm bật lên, ví dụ "Gọn hết!").
     + Phân cảnh 2.0s: Viết câu 4 - 5 từ.
     + Phân cảnh 3.0s: Viết câu 6 - 8 từ.
     + Phân cảnh 4.0s: Viết câu 9 - 11 từ.
     + Phân cảnh 5.0s: Viết câu 11 - 14 từ. ĐÂY LÀ TRẦN CỨNG — không phân cảnh nào, KỂ CẢ HOOK, được dài quá 5 giây.
   - KHÔNG viết câu 3-4 từ cho phân cảnh từ 3 giây trở lên (sẽ để lộ khoảng chết); ngược lại phân cảnh 1-2 giây thì BẮT BUỘC phải ngắn đúng như trên.
   - Phân cảnh hook cũng chỉ 1-5 giây nên áp đúng bảng trên, KHÔNG viết lời dẫn dài cho hook.
3. ĐỒNG BỘ THOẠI 1:1 TUYỆT ĐỐI GIỮA PHỤ ĐỀ ("text") VÀ LỜI NÓI ("voice"):
   Chữ phụ đề hiển thị ("text") và Lời thoại thuyết minh ("voice") BẮT BUỘC PHẢI NÓI CÙNG MỘT CÂU (đồng bộ 100% từng chữ thoại)!
   "text" chính là phụ đề từng chữ của câu nói "voice", viết hoa toàn bộ (UPPERCASE) để làm caption chuẩn TikTok.
   TUYỆT ĐỐI KHÔNG ĐƯỢC để "text" là một khẩu hiệu khác với những gì "voice" đang nói!

LIBRARY CLIP SELECTION (body segments):
- Read each clip's description/events carefully and pick the clip that TRULY matches the action of each segment.
- Every body segment MUST use a different sourceAssetId. Never use the same clip for two adjacent segments.
- Respect 0 <= sourceIn < sourceOut <= the clip's real duration.

VARIATION MANDATE (critical): Across different generations for the same product/angle, deliberately vary the framework, the hook type, the emotional tone, the pacing, and the CTA style so no two scripts feel formulaic or identical. Do NOT pick these to avoid a "recently used" list — pick each one because it genuinely FITS this angle, product and reference pacing best. Let the ANGLE lead every creative choice.

=====================================================================
OUTPUT CONTRACT — return a SINGLE valid JSON object. Field types are strict:
{
  "title":        string,            // Tiêu đề video theo góc tiếp cận
  "directorNote": {
    "framework":        string,      // một tên framework từ STEP 0
    "hookType":         string,      // một hook type từ menu STEP 1
    "differentiators": {             // BẮT BUỘC — 4 yếu tố làm biến thể này khác các biến thể khác
      "persona":   string,           // nhân vật trên hình / nói với ai
      "boiCanh":   string,           // bối cảnh quay
      "daoCu":     string,           // đạo cụ chủ đạo
      "bangChung": string            // cách chứng minh
    },
    "ctaStyle":         string,      // một CTA style từ CTA MENU
    "hookAngle":        string,      // chiến lược hook 3s đầu
    "hookToBodyBridge": string,      // ý tưởng chuyển đoạn từ hook sang giải pháp
    "assetRationale":   string       // lý do chọn các clip kho
  },
  "segments": [                      // mảng ${minSegments}-${maxSegments} phân cảnh
    {
      "order":         number,       // số thứ tự 1-based
      "phase":         string,       // "hook" | "bridge" | "body" | "cta"
      "sourceAssetId": string,       // "HOOK_SOURCE" cho phân cảnh hook, hoặc id clip kho
      "sourceIn":      number,       // giây bắt đầu >= 0
      "sourceOut":     number,       // giây kết thúc > sourceIn, <= thời lượng clip
      "voice":         string,       // câu thoại voiceover hoàn chỉnh, mô tả đúng visualAction của clip, số từ <= ngân sách clip
      "text":          string,       // phụ đề hiển thị đồng bộ 100% từng chữ với voice, VIẾT HOA TOÀN BỘ (UPPERCASE)
      "transition":    string        // "cut" | "fade" | "zoom" | "slide"
    }
  ]
}

WORKED EXAMPLE (cấu trúc tham khảo — KHÔNG copy nguyên văn; hãy sáng tạo nội dung mới theo góc tiếp cận):
{
  "title": "Sai lầm vali quá cân tốn tiền triệu khi đi máy bay",
  "directorNote": {
    "framework": "PAS",
    "hookType": "price-shock",
    "ctaStyle": "urgency",
    "hookAngle": "Mở màn bằng cú sốc tiền phạt vali quá cước tại sân bay",
    "hookToBodyBridge": "Chuyển từ sự cố vali kẹt sang giải pháp túi nén hút chân không mini",
    "assetRationale": "Clip hook quay cảnh cân hành lý; các clip thân bài diễn tả nén đồ và xếp vali gọn gàng"
  },
  "segments": [
    { "order": 1, "phase": "hook",   "sourceAssetId": "HOOK_SOURCE", "sourceIn": 0,   "sourceOut": 3.5, "voice": "Đi sân bay sợ nhất bị phạt tiền vì vali quá cân.", "text": "ĐI SÂN BAY SỢ NHẤT BỊ PHẠT TIỀN VÌ VALI QUÁ CÂN", "transition": "cut" },
    { "order": 2, "phase": "bridge", "sourceAssetId": "vid_pump_01",  "sourceIn": 1.0, "sourceOut": 4.0, "voice": "Chiếc máy nén mini này cứu nguy cho cả chuyến đi.", "text": "CHIẾC MÁY NÉN MINI NÀY CỨU NGUY CHO CẢ CHUYẾN ĐI", "transition": "fade" },
    { "order": 3, "phase": "body",   "sourceAssetId": "vid_flat_02",  "sourceIn": 0.5, "sourceOut": 3.5, "voice": "Chỉ mười giây là ép xẹp toàn bộ đồ đạc.", "text": "CHỈ MƯỜI GIÂY LÀ ÉP XẸP TOÀN BỘ ĐỒ ĐẠC", "transition": "cut" },
    { "order": 4, "phase": "body",   "sourceAssetId": "vid_case_03",  "sourceIn": 2.0, "sourceOut": 5.0, "voice": "Vali rộng thênh thang tha hồ mang thêm đồ.", "text": "VALI RỘNG THÊNH THANG THA HỒ MANG THÊM ĐỒ", "transition": "zoom" },
    { "order": 5, "phase": "cta",    "sourceAssetId": "vid_cta_04",   "sourceIn": 0,   "sourceOut": 3.0, "voice": "Bấm giỏ hàng săn ưu đãi hôm nay nhé.", "text": "BẤM GIỎ HÀNG SĂN ƯU ĐÃI HÔM NAY NHÉ", "transition": "cut" }
  ]
}
RETURN VALID JSON ONLY. NO EXPLANATION OUTSIDE THE JSON.`;

    const userPrompt = `Phân tích Video Đối Thủ:
${JSON.stringify({
    summary: referenceAnalysis?.summary || '',
    purpose: referenceAnalysis?.purpose || '',
    visual_events: (referenceAnalysis?.visual_events || []).slice(0, 6)
})}

${hookAnalysis ? `Phân tích Video Hook (Cung cấp các khoảnh khắc giật gân để làm Phân cảnh 1):
${JSON.stringify({
    summary: hookAnalysis.summary || hookAnalysis.purpose || '',
    events: (hookAnalysis.visual_events || hookAnalysis.events || []).slice(0, 4)
})}` : ''}

Chuỗi clip đề xuất từ kho (Footage-Driven & Word Budget):
${JSON.stringify(candidateFootage.map(f => ({
    order: f.order,
    phase: f.phase,
    clipId: f.sourceAssetId,
    sourceIn: f.sourceIn,
    sourceOut: f.sourceOut,
    durationSeconds: f.duration,
    minVoiceWords: f.minWords,
    targetVoiceWords: f.targetWords,
    maxVoiceWords: f.maxWords,
    visualAction: f.visualAction,
    visualBeats: f.visualBeats || []
})))}

Kho clip có sẵn (${assetList.length} clip). Mỗi clip kèm danh sách đoạn đã được AI xem và mô tả — \"events\" là các mốc (start -> end) DUY NHẤT được phép dùng làm sourceIn/sourceOut nếu bạn đổi clip:
${JSON.stringify(assetList)}

Hãy tạo Production Timeline với ${minSegments} - ${maxSegments} segment theo góc tiếp cận "${selectedAngle.name}".
${isEnglish ? `MANDATORY:
1. All fields ("title", "directorNote", "voice", "text") MUST BE 100% IN NATURAL ENGLISH.
2. Segment #1 uses footage from Hook Video (sourceAssetId: "HOOK_SOURCE") and lasts 1-5 seconds (HARD LIMIT, aim 4-5s when the clip is long enough) — the most arresting window of that clip.
2b. HOOK IS USED EXACTLY ONCE: "HOOK_SOURCE" may appear in segment #1 and NOWHERE ELSE. No later segment may carry phase "hook" or reuse the hook footage. Every segment from #2 on MUST use a DIFFERENT library clip id.
3. FRAME-ACCURATE NARRATION (the single most important rule): every candidate segment already carries an exact cut window (sourceIn -> sourceOut) and a 'visualAction' describing WHAT IS ON SCREEN during exactly that window. The 'voice' line MUST name what is literally visible there — the object being held, the action being performed, the result appearing. You MUST NOT change the given sourceIn / sourceOut: that window is what the viewer actually sees, and shifting it makes the narration describe footage that never appears on screen. If the line you want to write does not match the visualAction, pick a DIFFERENT clip whose listed events do match — never write the line anyway. Keep the word count within [minVoiceWords, maxVoiceWords] (aim for targetVoiceWords); each line is ONE COMPLETE THOUGHT that ends naturally and MUST NOT EXCEED maxVoiceWords.\n3a. THE WINDOW USUALLY CONTAINS TWO BEATS: 'visualBeats' lists, with timestamps relative to the start of the segment, every action that happens inside the cut window. Your line must cover the WHOLE window — normally by naming the first beat and then its result in the second beat (e.g. \"presses the pump onto the valve, and the bag flattens instantly\"). Do not describe only the first beat and leave the rest of the shot unaccounted for.\n3b. NO GENERIC NARRATION: a line like \"this product is so convenient\" that would fit any clip is rejected. Someone reading ONLY the visualAction must be able to tell it matches your voice line. Name the concrete thing on screen, not an abstract benefit.\n3c. SWAPPING CLIPS: if you use a clip from the library list instead of the suggested one, you MUST set sourceIn / sourceOut to one of that clip's listed event windows (start -> end) and write the voice for THAT event's action. Never invent a timestamp that is not covered by a listed event.
4. STRICT 1:1 DIALOGUE SYNC: 'text' and 'voice' MUST BE THE EXACT SAME WORDS! 'text' is the ALL-CAPS subtitle caption of what is spoken in 'voice'.
5. TOTAL DURATION: the finished ad targets ~${budget.estimatedTotal}s and MUST NOT exceed ${budget.maxOutputSeconds}s. Do not stop right after the hook — develop a full BODY (proof, demo, objection handling) and a closing CTA so the runtime is actually used.
6. SCENE LENGTH (HARD LIMIT): every body segment lasts 1-5 seconds, and NEVER longer than the source clip can supply (sourceOut MUST NOT exceed the clip duration listed for that asset). Aim for 4-5s; go shorter only when the clip is shorter. Never exceed 5s. Write the voice line to be SPOKEN COMFORTABLY inside that window with room to breathe — it is better to finish half a second early than to run over.
7. VARIANT DIFFERENTIATION: fill directorNote.differentiators with FOUR concrete choices — "persona" (who is on screen / who is spoken to), "boiCanh" (setting), "daoCu" (hero prop or object), "bangChung" (form of proof used). Each of the 10 variants MUST differ from every other on at least TWO of these four. Vague values like "general audience" or "home" count as identical and will be rejected.
8. CLAIM COMPLIANCE (forbidden language): NEVER promise medical or weight-loss outcomes ("cures", "treats", "lose weight", "no side effects"), NEVER use absolutes ("100%", "absolutely", "guaranteed"), and NEVER use superlatives you cannot prove ("the best", "number 1", "the only"). State observable, specific benefits instead ("fits a whole wardrobe into one carry-on").` : `BẮT BUỘC:
1. Toàn bộ kịch bản, tiêu đề (title), chữ phụ đề (text), lời thoại thuyết minh (voice), và ghi chú đạo diễn (directorNote) PHẢI LÀ 100% TIẾNG VIỆT tự nhiên, truyền cảm. Tuyệt đối không để tiếng Anh.
2. Phân cảnh #1 dùng footage từ Video Hook (sourceAssetId: "HOOK_SOURCE") và DÀI 1-5 GIÂY (nhắm 4-5 giây nếu clip đủ dài) — chọn đúng khoảnh khắc đắt giá nhất, không lấy trọn clip, và KHÔNG BAO GIỜ lấy cửa sổ dài hơn chính clip đó.
2b. HOOK CHỈ DÙNG ĐÚNG MỘT LẦN: "HOOK_SOURCE" chỉ được xuất hiện ở phân cảnh #1, TUYỆT ĐỐI không xuất hiện lại. Từ phân cảnh #2 trở đi không phân cảnh nào được mang phase "hook" hay dùng lại footage hook — mỗi phân cảnh phải là MỘT clip kho KHÁC.
3. LỜI BÌNH BÁM ĐÚNG KHUNG HÌNH (luật quan trọng nhất): mỗi phân cảnh đề xuất đã kèm sẵn mốc cắt chính xác (sourceIn -> sourceOut) và 'visualAction' mô tả ĐÚNG những gì hiện trên màn hình trong đúng khoảng đó. Lời bình (voice) PHẢI gọi tên thứ đang nhìn thấy: vật đang được cầm, thao tác đang làm, kết quả đang hiện ra. TUYỆT ĐỐI KHÔNG ĐƯỢC tự đổi sourceIn / sourceOut đã giao — đổi mốc là người xem nhìn một đằng còn lời bình nói một nẻo. Nếu câu bạn định viết KHÔNG khớp visualAction thì hãy CHỌN CLIP KHÁC có đoạn khớp, tuyệt đối đừng viết bừa. Số từ nằm trong [minVoiceWords, maxVoiceWords] (nhắm targetVoiceWords); mỗi câu TRỌN Ý, kết thúc tự nhiên và KHÔNG ĐƯỢC VƯỢT maxVoiceWords.\n3a. MỘT CẢNH THƯỜNG CÓ HAI NHỊP HÌNH: 'visualBeats' liệt kê theo mốc thời gian (tính từ đầu phân cảnh) mọi hành động xảy ra trong cửa sổ cắt. Lời bình PHẢI bao trọn cả cửa sổ — thường là gọi tên nhịp đầu rồi tới kết quả ở nhịp sau (ví dụ: \"ấn máy lên van, túi xẹp phẳng ngay\"). Không được chỉ tả nhịp đầu rồi bỏ mặc phần còn lại của cảnh.\n3b. CẤM NÓI CHUNG CHUNG: những câu kiểu \"sản phẩm này tiện lợi lắm\" — gắn vào clip nào cũng được — đều bị loại. Người chỉ đọc visualAction phải nhận ra ngay câu đó đang tả đúng cảnh ấy. Hãy gọi tên thứ cụ thể trên màn hình, đừng nói lợi ích trừu tượng.\n3c. NẾU ĐỔI CLIP: khi bạn dùng clip khác trong danh sách kho thay vì clip đề xuất, BẮT BUỘC đặt sourceIn / sourceOut trùng một đoạn đã liệt kê của clip đó (start -> end) và viết lời bình cho ĐÚNG hành động của đoạn ấy. Không được bịa mốc thời gian không nằm trong đoạn nào đã liệt kê.
4. ĐỒNG BỘ THOẠI 1:1 TUYỆT ĐỐI: Chữ phụ đề ('text') và Lời thoại thuyết minh ('voice') PHẢI ĐỒNG NHẤT TỪNG CHỮ (text là phụ đề viết hoa của voice).
5. TỔNG THỜI LƯỢNG: video thành phẩm nhắm ~${budget.estimatedTotal} giây và KHÔNG ĐƯỢC VƯỢT ${budget.maxOutputSeconds} giây. Không được kết thúc ngay sau hook — phải khai triển đầy đủ THÂN BÀI (chứng minh, demo, xử lý phản đối) và KẾT BÀI chốt đơn (CTA) để dùng hết quỹ thời lượng.
6. ĐỘ DÀI PHÂN CẢNH (TRẦN CỨNG): mỗi phân cảnh thân bài dài 1-5 giây và KHÔNG BAO GIỜ dài hơn số giây clip gốc có (sourceOut KHÔNG được vượt độ dài clip ghi kèm asset đó). Nhắm 4-5 giây; chỉ ngắn hơn khi clip ngắn hơn. Không quá 5 giây. Viết lời bình sao cho ĐỌC THONG THẢ VẪN VỪA trong khoảng đó và còn chỗ thở — thà hết chữ sớm nửa giây còn hơn để câu bị cắt ngang.
7. ÉP KHÁC BIỆT GIỮA CÁC BIẾN THỂ: điền directorNote.differentiators với BỐN lựa chọn cụ thể — "persona" (nhân vật trên hình / nói với ai), "boiCanh" (bối cảnh quay), "daoCu" (đạo cụ chủ đạo), "bangChung" (cách chứng minh). Mỗi biến thể trong 10 biến thể PHẢI khác mọi biến thể còn lại ở ÍT NHẤT HAI trong bốn yếu tố. Ghi chung chung kiểu "người dùng phổ thông" hay "tại nhà" bị tính là TRÙNG và sẽ bị loại.
8. LUẬT CẤM CLAIM (bắt buộc tuân thủ): TUYỆT ĐỐI KHÔNG hứa hẹn y tế hay giảm béo ("chữa", "điều trị", "giảm cân", "không tác dụng phụ"); KHÔNG dùng từ tuyệt đối ("100%", "tuyệt đối", "cam kết"); KHÔNG dùng so sánh nhất không chứng minh được ("tốt nhất", "số 1", "duy nhất"). Thay bằng lợi ích quan sát được, cụ thể ("nhét trọn cả tủ quần áo vào một vali xách tay").`}`;

    let response;
    try {
        response = await fetch('http://127.0.0.1:20128/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: readNineRouterModel() || process.env.NINE_ROUTER_TIMELINE_MODEL || 'aa',
                stream: false,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature
            })
        });
    } catch (fetchErr) {
        console.warn('Lỗi gọi 9Router LLM, sử dụng kịch bản dự phòng:', fetchErr.message);
    }

    let parsed = null;
    if (response && response.ok) {
        const data = await response.json();
        let rawText = (data.choices && data.choices[0]?.message?.content) ? data.choices[0].message.content.trim() : '';
        if (rawText.startsWith('```json')) {
            rawText = rawText.substring(7);
            if (rawText.endsWith('```')) rawText = rawText.substring(0, rawText.length - 3);
        } else if (rawText.startsWith('```')) {
            rawText = rawText.substring(3);
            if (rawText.endsWith('```')) rawText = rawText.substring(0, rawText.length - 3);
        }
        try { parsed = JSON.parse(rawText.trim()); } catch (_) {}
    }

    // Fallback thông minh nếu LLM lỗi mạng hoặc parse thất bại
    if (!parsed) {
        const sampleAssets = describedAssets.slice(0, 5);
        parsed = {
            title: selectedAngle.name,
            directorNote: {
                hookAngle: selectedAngle.focus,
                hookToBodyBridge: 'Chuyển từ sự cố vali kẹt sang giải pháp túi nén',
                assetRationale: 'Dùng footage hook thật mở màn, kết hợp clip tính năng trong kho'
            },
            segments: [
                {
                    order: 1,
                    phase: 'hook',
                    sourceAssetId: hookVideoPath ? 'HOOK_SOURCE' : (sampleAssets[0]?.asset_id || 'VID_HOOK'),
                    sourceIn: 0,
                    sourceOut: 3.5,
                    text: 'BỊ PHẠT TIỀN VÌ VALI QUÁ CÂN?',
                    voice: 'Đi sân bay bị phạt tiền triệu vì vali quá khổ quá cân?',
                    transition: 'cut'
                },
                ...sampleAssets.slice(1).map((a, idx) => ({
                    order: idx + 2,
                    phase: idx === sampleAssets.length - 2 ? 'cta' : (idx === 0 ? 'bridge' : 'body'),
                    sourceAssetId: a.asset_id,
                    sourceIn: 0,
                    sourceOut: Math.min(3.5, a.duration || 3.5),
                    text: idx === 0 ? 'GIẢI PHÁP THU GỌN VALI GẤP 3' : (idx === sampleAssets.length - 2 ? 'SĂN DEAL HÔM NAY' : `BƯỚC ${idx}: THAO TÁC CỰC NHANH`),
                    voice: idx === 0 ? 'Đừng lo, giải pháp thu gọn vali gấp ba lần chính là đây!' : (idx === sampleAssets.length - 2 ? 'Bấm giỏ hàng săn deal combo du lịch ngay!' : 'Chỉ cần một thao tác là túi phẳng lì ngăn nắp.'),
                    transition: 'fade'
                }))
            ]
        };
    }

    let segments = [];
    let directorNote = {
        hookAngle: selectedAngle.focus,
        hookToBodyBridge: 'Chuyển từ nỗi đau sang giải pháp',
        assetRationale: 'Bốc clip kho theo phân cảnh hành động'
    };
    let title = selectedAngle.name;

    if (Array.isArray(parsed)) {
        segments = parsed;
    } else if (parsed && Array.isArray(parsed.segments)) {
        segments = parsed.segments;
        directorNote = parsed.directorNote || directorNote;
        title = parsed.title || title;
    }

    const result = {
        title,
        angle: selectedAngle,
        directorNote,
        segments
    };

    const langTimeline = await ensureLanguageTimeline(result, targetLang, apiKey);
    // HẬU KIỂM CLAIM: prompt đã cấm, nhưng model vẫn có thể lỡ — lọc lại trước khi lên video.
    return sanitizeTimelineClaims(enforceVoiceDurationConstraint(langTimeline));
}

/**
 * Đảm bảo toàn bộ kịch bản khớp với ngôn ngữ mục tiêu ('vi' hoặc 'en'), tự động dịch và đồng bộ 100% voice và text.
 */
export async function ensureLanguageTimeline(timeline, targetLang = 'vi', apiKey = null) {
    if (!timeline || !Array.isArray(timeline.segments) || timeline.segments.length === 0) {
        return timeline;
    }

    const VIETNAMESE_PATTERN = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
    const ENGLISH_PATTERN = /\b(the|and|for|with|you|your|this|that|from|have|what|when|make|save|deal|grab|shop|check|overweight|bag|trip|fined|clothes|minutes|seconds|fast|tiny|mini|fits|pack|suitcase|wardrobe|airport|mistake|every|traveler|problem|stops|swapping|obsessed|crowd|everyone|here|today|now)\b/i;

    const isEn = (targetLang === 'en');
    let needsTranslation = false;

    if (isEn) {
        // Cần tiếng Anh, nhưng phát hiện tiếng Việt
        if (timeline.title && VIETNAMESE_PATTERN.test(timeline.title)) needsTranslation = true;
        for (const seg of timeline.segments) {
            if ((seg.text && VIETNAMESE_PATTERN.test(seg.text)) || (seg.voice && VIETNAMESE_PATTERN.test(seg.voice))) {
                needsTranslation = true;
                break;
            }
        }
    } else {
        // Cần tiếng Việt, nhưng phát hiện tiếng Anh
        if (timeline.title && ENGLISH_PATTERN.test(timeline.title)) needsTranslation = true;
        for (const seg of timeline.segments) {
            if ((seg.text && ENGLISH_PATTERN.test(seg.text)) || (seg.voice && ENGLISH_PATTERN.test(seg.voice))) {
                needsTranslation = true;
                break;
            }
        }
    }

    if (!needsTranslation) {
        // Đảm bảo phụ đề và voice đồng bộ 100%
        for (const seg of timeline.segments) {
            if (seg.voice) {
                seg.text = seg.voice.replace(/[.!?]+$/, '').trim().toUpperCase();
            }
        }
        return timeline;
    }

    const key = apiKey || readNineRouterApiKey();
    if (!key) return timeline;

    try {
        const transPrompt = isEn ? `You are an elite short-form video ad director (TikTok / Reels / Shorts).
Translate and localize this complete video script into 100% NATURAL, PUNCHY ENGLISH direct-response ad copy:
- title: punchy ad title in English
- directorNote: translate hookAngle, hookToBodyBridge, assetRationale to English
- segments: keep order, phase, sourceAssetId, sourceIn, sourceOut, transition:
  + voice: natural, high-converting English voiceover dialogue (fit word budget: ~2.5 words/second)
  + text: EXACT SAME WORDS AS VOICE, formatted in ALL-CAPS (UPPERCASE) for on-screen subtitle synchronization!

Script data:
${JSON.stringify({
    title: timeline.title,
    directorNote: timeline.directorNote,
    segments: timeline.segments.map(s => ({
        order: s.order,
        phase: s.phase,
        sourceAssetId: s.sourceAssetId,
        sourceIn: s.sourceIn,
        sourceOut: s.sourceOut,
        text: s.text,
        voice: s.voice,
        transition: s.transition
    }))
}, null, 2)}

RETURN ONLY VALID JSON. NO EXPLANATION OUTSIDE THE JSON.`
        : `Bạn là đạo diễn kịch bản video ngắn TikTok/Reels/Shorts tại Việt Nam.
Kịch bản sau đang có nội dung hoặc lời thoại tiếng Anh. Hãy dịch và bản địa hóa TOÀN BỘ sang 100% TIẾNG VIỆT tự nhiên, cuốn hút, chuẩn phong cách Direct-Response:
- title: Tiêu đề video bằng tiếng Việt hấp dẫn
- directorNote: dịch hookAngle, hookToBodyBridge, assetRationale sang tiếng Việt
- segments: giữ nguyên các trường order, phase, sourceAssetId, sourceIn, sourceOut, transition:
  + voice: Lời thoại voiceover tiếng Việt tự nhiên, truyền cảm
  + text: ĐỒNG BỘ 100% TỪNG CHỮ VỚI VOICE, VIẾT HOA TOÀN BỘ (UPPERCASE) để làm phụ đề trên màn hình

Dữ liệu kịch bản:
${JSON.stringify({
    title: timeline.title,
    directorNote: timeline.directorNote,
    segments: timeline.segments.map(s => ({
        order: s.order,
        phase: s.phase,
        sourceAssetId: s.sourceAssetId,
        sourceIn: s.sourceIn,
        sourceOut: s.sourceOut,
        text: s.text,
        voice: s.voice,
        transition: s.transition
    }))
}, null, 2)}

CHỈ TRẢ VỀ DUY NHẤT MÃ JSON HỢP LỆ THEO CẤU TRÚC TRÊN. KHÔNG VIẾT BẤT KỲ LỜI GIẢI THÍCH NÀO NGOÀI JSON.`;

        const resp = await fetch('http://127.0.0.1:20128/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: readNineRouterModel() || process.env.NINE_ROUTER_TIMELINE_MODEL || 'aa',
                stream: false,
                messages: [
                    { role: 'system', content: isEn ? 'You are an expert video script translator. Return ONLY valid JSON.' : 'You are an expert Vietnamese video script translator. Return ONLY valid JSON.' },
                    { role: 'user', content: transPrompt }
                ],
                temperature: 0.2
            })
        });

        if (resp && resp.ok) {
            const data = await resp.json();
            let rawText = (data.choices && data.choices[0]?.message?.content) ? data.choices[0].message.content.trim() : '';
            if (rawText.startsWith('```json')) {
                rawText = rawText.substring(7);
                if (rawText.endsWith('```')) rawText = rawText.substring(0, rawText.length - 3);
            } else if (rawText.startsWith('```')) {
                rawText = rawText.substring(3);
                if (rawText.endsWith('```')) rawText = rawText.substring(0, rawText.length - 3);
            }
            const translated = JSON.parse(rawText.trim());
            if (translated) {
                if (translated.title) timeline.title = translated.title;
                if (translated.directorNote) {
                    timeline.directorNote = { ...timeline.directorNote, ...translated.directorNote };
                }
                if (Array.isArray(translated.segments)) {
                    for (let i = 0; i < timeline.segments.length; i++) {
                        const tSeg = translated.segments.find(s => s.order === timeline.segments[i].order) || translated.segments[i];
                        if (tSeg) {
                            if (tSeg.voice) timeline.segments[i].voice = tSeg.voice;
                            timeline.segments[i].text = (tSeg.voice || tSeg.text || '').replace(/[.!?]+$/, '').trim().toUpperCase();
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[ensureLanguageTimeline] Lỗi dịch kịch bản:', e.message);
    }

    return timeline;
}

/**
 * Tương thích ngược: đảm bảo kịch bản tiếng Việt.
 */
export async function ensureVietnameseTimeline(timeline, apiKey = null) {
    return ensureLanguageTimeline(timeline, 'vi', apiKey);
}

/**
 * Thuật toán Quy hoạch Biến thể Tổ hợp (Combinatorial Variant Planning Engine):
 * 1. Hook Segment: Cắt trực tiếp phân cảnh cao trào từ Video Hook
 * 2. Greedy Least-Used Selection cho các clip thân bài
 * 3. Max Usage per Variant (U <= 3) - ÉP CỨNG LOẠI BỎ CLIP VƯỢT NGƯỠNG
 * 4. Anti-Adjacent Enforce (|index_i - index_j| >= 2)
 * 5. Head Randomizer (0-15s) cho clip kho
 * 6. 70% Inventory Coverage Gate
 */
export function applyCombinatorialPlanning(rawTimeline, libraryAssets, globalUsage = {}, maxUsageU = 3, hookContext = {}) {
    // Thân bài chỉ được dùng clip Nguyên liệu (xem lý do ở selectFootageSequence).
    const validAssets = (libraryAssets || [])
        .filter(a => a.described && normalizeCategory(a.category) === 'material');
    const assetMap = new Map(validAssets.map(a => [a.asset_id, a]));
    const segments = (rawTimeline.segments || []).slice();

    let matchedValidCount = 0;
    const missingSegments = [];

    const hookVideoPath = hookContext.hookVideoPath || null;
    const hookVideoName = hookContext.hookVideoName || (hookVideoPath ? path.basename(hookVideoPath) : null);
    const hookAnalysis = hookContext.hookAnalysis || null;
    const hookEvents = (hookAnalysis && (hookAnalysis.visual_events || hookAnalysis.events)) || [];
    const variantIndex = (rawTimeline.index || rawTimeline.angleIndex || 1) - 1;

    // Tìm các candidate clips theo semantic text
    for (let idx = 0; idx < segments.length; idx++) {
        const seg = segments[idx];
        // HOOK CHỈ 1 LẦN, ĐÚNG Ở PHÂN CẢNH ĐẦU (user chốt 2026-09-18).
        // Trước đây `idx === 0 || seg.phase === 'hook'` khiến mọi phân cảnh mà model lỡ gắn nhãn
        // hook đều bị ép dùng lại video hook ⇒ đo thật: hook xuất hiện 3 lần trong 1 video.
        const isHookSegment = (idx === 0);
        if (!isHookSegment) {
            // Dọn mọi dấu vết hook ở phân cảnh sau: nhãn phase và con trỏ HOOK_SOURCE mồ côi.
            if (seg.phase === 'hook') seg.phase = 'body';
            if (seg.sourceAssetId === 'HOOK_SOURCE') seg.sourceAssetId = null;
        }

        // NẾU LÀ PHÂN CẢNH 1 VÀ CÓ VIDEO HOOK: BẮT BUỘC CẮT TỪ VIDEO HOOK
        if (isHookSegment && hookVideoPath && fs.existsSync(hookVideoPath)) {
            seg.phase = 'hook';
            seg.sourceAssetId = 'HOOK_SOURCE';
            seg.assetPath = hookVideoPath;
            seg.assetFilename = hookVideoName || path.basename(hookVideoPath);

            // HOOK 4-5s: không lấy trọn clip nữa. Video hook thật của user chỉ ~4-5s; clip dài hơn
            // thì cắt đúng cửa sổ 4-5s đắt giá nhất (ưu tiên đoạn có key_moment điểm cao).
            let hookSrcDuration = hookContext.hookDuration || 0;
            if (!hookSrcDuration && hookAnalysis && hookAnalysis.duration) {
                hookSrcDuration = hookAnalysis.duration;
            }
            const hookWindow = clampHookDuration(hookSrcDuration);

            let hookStart = 0;
            let hookEnd = hookWindow;

            if (hookSrcDuration > 0) {
                hookStart = pickHookWindowStart(hookSrcDuration, hookWindow, hookAnalysis, hookEvents);
                hookEnd = Math.round((hookStart + hookWindow) * 100) / 100;
            } else if (hookEvents.length > 0) {
                // Nếu chưa có hookDuration cụ thể, lấy max end của hook events
                const maxEvEnd = Math.max(...hookEvents.map(e => e.end || 0));
                if (maxEvEnd > 0) {
                    hookEnd = maxEvEnd;
                }
            } else if (typeof seg.sourceIn === 'number' && typeof seg.sourceOut === 'number' && seg.sourceOut > seg.sourceIn) {
                hookStart = seg.sourceIn;
                hookEnd = seg.sourceOut;
            }

            seg.sourceIn = Math.max(0, hookStart);
            seg.sourceOut = Math.max(seg.sourceIn + 1.5, hookEnd);
            matchedValidCount++;
            continue;
        }

        // CÁC PHÂN CẢNH THÂN BÀI TỪ KHO
        let targetAsset = assetMap.get(seg.sourceAssetId);

        // KHÓA CỨNG U <= 3: Nếu targetAsset đã dùng >= maxUsageU lần, BẮT BUỘC tráo clip khác!
        const curUsage = targetAsset ? (globalUsage[targetAsset.asset_id] || 0) : 0;
        if (targetAsset && curUsage < maxUsageU) {
            matchedValidCount++;
        } else {
            const candidates = validAssets.filter(a => {
                const u = globalUsage[a.asset_id] || 0;
                return u < maxUsageU;
            });

            if (candidates.length > 0) {
                // Sắp xếp chọn clip ít dùng nhất (Greedy Least-Used Selection)
                candidates.sort((a, b) => (globalUsage[a.asset_id] || 0) - (globalUsage[b.asset_id] || 0));
                const minU = globalUsage[candidates[0].asset_id] || 0;
                const bestPool = candidates.filter(a => (globalUsage[a.asset_id] || 0) === minU);
                targetAsset = bestPool[Math.floor(Math.random() * bestPool.length)];
                seg.sourceAssetId = targetAsset.asset_id;
                matchedValidCount++;
            } else {
                missingSegments.push(`Phân cảnh #${idx + 1} (${seg.phase || 'body'})`);
            }
        }

        if (targetAsset) {
            const clipDur = Number(targetAsset.duration) || 5;
            // Ước lượng độ dài voice để lấy thời lượng clip phù hợp (ĐO THẬT ~3.8 từ/giây + 0.45s đệm)
            let estimatedVoiceDur = 3.0;
            if (seg.voice && typeof seg.voice === 'string') {
                const words = seg.voice.trim().split(/\s+/).filter(Boolean).length;
                if (words > 0) {
                    estimatedVoiceDur = Math.round((words / VOICE_WORDS_PER_SEC + 0.45) * 10) / 10;
                }
            }
            // SCENE FITS VOICE: lấy khoảng ĐỦ cho lời bình (max của khoảng model đề xuất và
            // thời lượng đọc thực tế), chặn trên bởi độ dài clip thật — thay vì ép cắt chữ sau này.
            const reqIn = Number(seg.sourceIn);
            const reqOut = Number(seg.sourceOut);
            const requestedDur = (Number.isFinite(reqIn) && Number.isFinite(reqOut) && reqOut > reqIn)
                ? (reqOut - reqIn)
                : 0;
            // Trần cứng 5s: trước đây Math.max(requestedDur, estimatedVoiceDur) phá trần khiến cảnh dài 5.9s.
            const segDur = Math.max(1.5, Math.min(clipDur, SEGMENT_MAX_DUR, Math.max(requestedDur, estimatedVoiceDur)));

            // BÁM KHUNG HÌNH: cắt đúng đoạn mà lời bình được viết cho, KHÔNG cắt ngẫu nhiên nữa.
            // Randomizer cũ (Math.random()*min(15, clipDur-segDur)) là nguyên nhân chính khiến
            // hình một kiểu còn text/voice một kiểu.
            const win = resolveSegmentWindow(targetAsset, segDur, {
                requestedIn: Number.isFinite(reqIn) ? reqIn : null,
                variantSeed: variantIndex + idx
            });
            seg.sourceIn = win.start;
            seg.sourceOut = Math.min(clipDur, win.end);
            seg.visualAction = win.description;
            seg.visualBeats = win.beats || [];
            seg.clipDuration = clipDur; // để enforceVoiceDurationConstraint biết còn bao nhiêu chỗ nới
            seg.assetPath = targetAsset.path;
            seg.assetFilename = targetAsset.filename;
            globalUsage[targetAsset.asset_id] = (globalUsage[targetAsset.asset_id] || 0) + 1;
        }
    }

    // Anti-Adjacent Check: Đảm bảo không có 2 phân cảnh liền kề dùng cùng 1 asset
    for (let i = 0; i < segments.length - 1; i++) {
        if (segments[i].sourceAssetId && segments[i].sourceAssetId === segments[i + 1].sourceAssetId) {
            const altCandidates = validAssets.filter(a => 
                a.asset_id !== segments[i].sourceAssetId && 
                (globalUsage[a.asset_id] || 0) < maxUsageU
            );
            if (altCandidates.length > 0) {
                const alt = altCandidates[Math.floor(Math.random() * altCandidates.length)];
                segments[i + 1].sourceAssetId = alt.asset_id;
                segments[i + 1].sourceIn = 0;
                segments[i + 1].sourceOut = Math.min(3.5, alt.duration);
                segments[i + 1].assetPath = alt.path;
                segments[i + 1].assetFilename = alt.filename;
                globalUsage[alt.asset_id] = (globalUsage[alt.asset_id] || 0) + 1;
            }
        }
    }

    const coverageRate = segments.length > 0 ? Math.round((matchedValidCount / segments.length) * 100) : 0;
    const isValid = coverageRate >= 70;

    const plannedTimeline = {
        title: rawTimeline.title || 'Video Biến Thể',
        angle: rawTimeline.angle,
        directorNote: rawTimeline.directorNote,
        segments,
        coverageRate,
        isValid,
        validationError: isValid ? null : `Kho chỉ đáp ứng ${coverageRate}% (thiếu: ${missingSegments.join(', ')})`
    };

    return sanitizeTimelineClaims(enforceVoiceDurationConstraint(plannedTimeline));
}

/**
 * Sinh đồng thời 10 kịch bản song song (Batch LLM Generation).
 */
export async function generateBatchTimelines(referenceAnalysis, libraryAssets, hookAnalysis = null, requestedCount = 10, hookContext = {}) {
    const count = Math.max(1, Math.min(requestedCount, 20));
    const apiKey = readNineRouterApiKey();

    const anglesToUse = DIVERSE_ANGLES.slice(0, count);
    while (anglesToUse.length < count) {
        anglesToUse.push({
            id: `angle_extra_${anglesToUse.length + 1}`,
            name: `Biến thể tiếp cận #${anglesToUse.length + 1}`,
            focus: 'Góc tiếp cận bổ sung độc lập'
        });
    }

    const batchUsage = {};
    for (const a of libraryAssets) {
        if (a.usage_count) batchUsage[a.asset_id] = a.usage_count;
    }

    // Video dài hơn (trần 60s) ⇒ nhiều phân cảnh hơn ⇒ kho nhỏ phải được dùng lại nhiều hơn,
    // nếu không coverage tụt < 70% và kịch bản bị đánh dấu không hợp lệ.
    let batchHookDur = (hookContext && hookContext.hookDuration) || (hookAnalysis && hookAnalysis.duration) || 0;
    if (!batchHookDur && hookAnalysis && Array.isArray(hookAnalysis.visual_events) && hookAnalysis.visual_events.length > 0) {
        batchHookDur = Math.max(...hookAnalysis.visual_events.map(e => e.end || 0));
    }
    const batchBudget = planOutputBudget({
        hookDuration: (hookContext.hookVideoPath || hookAnalysis) ? clampHookDuration(batchHookDur) : 0,
        libraryCount: libraryAssets.length,
        variantCount: count
    });

    // XẾP HÀNG BƯỚC 3: tối đa 10 kịch bản một lượt trên TOÀN hệ thống (khớp trần 10 video của
    // bước dựng). Trước đây `Promise.all` bắn hết cùng lúc ⇒ 3 người bấm = 30 request LLM đồng thời.
    const rawResults = await runWithLimit(anglesToUse, scriptGate.limit, (angle, idx) =>
        scriptGate.run(() =>
            generateTimeline(referenceAnalysis, libraryAssets, hookAnalysis, {
                angle,
                apiKey,
                temperature: 0.5 + (idx * 0.04),
                angleIndex: idx,
                hookVideoPath: hookContext.hookVideoPath || null,
                hookVideoName: hookContext.hookVideoName || null,
                hookType: hookContext.hookType || 'auto',
                voice: hookContext.voice || 'vi-VN-HoaiMyNeural',
                variantCount: count
            })
        ).catch(err => {
            console.error(`[BatchTimeline] Lỗi sinh kịch bản #${idx + 1}:`, err);
            return null;
        })
    );

    const finalizedTimelines = [];
    for (let i = 0; i < rawResults.length; i++) {
        const raw = rawResults[i];
        if (!raw || !raw.segments || raw.segments.length === 0) {
            finalizedTimelines.push({
                index: i + 1,
                title: anglesToUse[i].name,
                angle: anglesToUse[i],
                isValid: false,
                coverageRate: 0,
                validationError: 'Không thể sinh kịch bản từ LLM',
                segments: []
            });
            continue;
        }

        const planned = applyCombinatorialPlanning(
            { index: i + 1, angleIndex: i, ...raw },
            libraryAssets,
            batchUsage,
            batchBudget.maxUsagePerAsset,
            hookContext
        );
        finalizedTimelines.push({
            index: i + 1,
            ...planned
        });
    }

    return finalizedTimelines;
}
