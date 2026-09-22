/**
 * tests/pipeline_abc.test.js
 *
 * TDD cho 3 đợt chuẩn hoá pipeline V2 (user chốt 2026-09-18):
 *
 *  ĐỢT A — Phân tích sâu: prompt 7 tiêu chí + chấm điểm 1-10, gán loại hook cho clip kho.
 *  ĐỢT B — Kho 3 nhóm (Nguyên liệu / Đối thủ / Hook), upload có chọn nhóm,
 *          step 1 chọn lại ref & hook từ kho, AI tự chọn hook khi user không nhập.
 *  ĐỢT C — Nhịp video: trần 20-30s, cảnh 4-5s, hook 4-5s, giữ nguyên tốc độ đọc
 *          (tách ngưỡng CẮT khỏi ngân sách VIẾT), ép 10 biến thể khác nhau, lọc claim.
 *
 * Nguồn yêu cầu: docs/BACKLOG/2026-09-18_TASK-CHUAN-HOA-THEO-PPTX.md
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';

import os from 'os';
import { scriptGate } from '../byteplus/video_studio/job_queue.js';
import { describeProgressView, resolveTimelineEditTarget } from '../byteplus/video_studio/index.js';
import { resolveEffectiveSegmentDuration } from '../byteplus/video_studio/assembler.js';
import {
    HOOK_TYPES,
    LIBRARY_GROUPS,
    normalizeCategory,
    extractAnalysisScorecard,
    planAssetDeletion,
    UPLOAD_CATEGORIES,
    scanLibrary
} from '../byteplus/video_studio/library.js';

import {
    VOICE_SPEAK_RATE,
    VOICE_WRITE_WORDS_PER_SEC,
    MAX_OUTPUT_SECONDS,
    clampHookDuration,
    planOutputBudget,
    selectFootageSequence,
    fitSegmentDurationToVoice,
    pickHookFromLibrary,
    checkVariantDiversity,
    checkClaims,
    applyClaimRules,
    DEFAULT_CLAIM_RULES,
    applyCombinatorialPlanning,
    resolveSegmentWindow,
    ASSET_EVENTS_IN_PROMPT
} from '../byteplus/video_studio/timeline_generator.js';

const A = 'Đợt A — Phân tích 7 tiêu chí & chấm điểm hook';
const B = 'Đợt B — Kho 3 nhóm & chọn ref/hook từ kho';
const C = 'Đợt C — Nhịp video 20-30s, cảnh 4-5s, biến thể & claim';
const D = 'Đợt D — Trần đồng thời & hook chỉ 1 lần ở đầu video';
const E = 'Đợt E — Text/voice bám đúng khung hình đang chiếu';
const F = 'Đợt F — Xoá clip khỏi kho & tải lên nhóm Nguyên liệu';
const G = 'Đợt G — Bộ đếm tiến trình mô tả AI không được vượt tổng';
const H = 'Đợt H — Video output phải có ĐỦ mọi phân cảnh (cảnh 1-5s)';
const I = 'Đợt I — Không nơi nào được tự sinh cửa sổ dài hơn clip';
const J = 'Đợt J — Sửa được MỌI kịch bản biến thể ở step 4';

const ANALYZER = 'video-analyzer-pipeline/video-analyzer-standalone';

export async function runPipelineAbcTests(reporter) {
    const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');

    const finalPrompt = read(`${ANALYZER}/prompts/final.txt`);
    const schemasPy = read(`${ANALYZER}/video_analyzer/schemas.py`);
    const synthesisPy = read(`${ANALYZER}/video_analyzer/merge/synthesis.py`);
    const cachePy = read(`${ANALYZER}/video_analyzer/jobs/cache.py`);
    const studioIndex = read('byteplus/video_studio/index.js');
    const timelineGen = read('byteplus/video_studio/timeline_generator.js');
    const v2vJs = read('public/studio/video-to-video.js');
    const v2vHtml = read('public/studio/video-to-video.html');
    const assemblerCode = read('byteplus/video_studio/assembler.js');

    // ═══════════════════════════════════════════════════════════════════════
    // ĐỢT A — PHÂN TÍCH 7 TIÊU CHÍ + CHẤM ĐIỂM
    // ═══════════════════════════════════════════════════════════════════════

    await reporter.test(A, 'Tier 1: prompt final.txt yêu cầu ĐỦ 7 tiêu chí chấm điểm', async () => {
        const required = ['hook', 'structure', 'pacing', 'visual', 'audio', 'message', 'cta'];
        assert.ok(finalPrompt.includes('criteria_scores'),
            'final.txt phải yêu cầu trường "criteria_scores"');
        for (const k of required) {
            assert.ok(new RegExp(`"${k}"`).test(finalPrompt),
                `criteria_scores phải có tiêu chí "${k}"`);
        }
    });

    await reporter.test(A, 'Tier 1: prompt yêu cầu chấm điểm tổng 1-10 + mạnh/yếu/đề xuất', async () => {
        for (const k of ['overall_score_1_10', 'strengths', 'weaknesses', 'improvements']) {
            assert.ok(finalPrompt.includes(k), `final.txt thiếu trường "${k}"`);
        }
        assert.ok(/1\s*(-|–|to)\s*10/i.test(finalPrompt),
            'final.txt phải nói rõ thang điểm 1-10');
    });

    await reporter.test(A, 'Tier 1: prompt yêu cầu hook_analysis {type, first_3s, score}', async () => {
        assert.ok(finalPrompt.includes('hook_analysis'), 'final.txt thiếu "hook_analysis"');
        for (const k of ['type', 'first_3s', 'score_1_10']) {
            assert.ok(finalPrompt.includes(k), `hook_analysis thiếu "${k}"`);
        }
    });

    await reporter.test(A, 'Tier 1: prompt yêu cầu structure {problem, solution, proof, cta}', async () => {
        assert.ok(finalPrompt.includes('structure'), 'final.txt thiếu "structure"');
        for (const k of ['problem', 'solution', 'proof']) {
            assert.ok(finalPrompt.includes(k), `structure thiếu "${k}"`);
        }
    });

    await reporter.test(A, 'Tier 2: schemas.py khai báo các trường chấm điểm mới', async () => {
        for (const k of ['hook_analysis', 'criteria_scores', 'overall_score_1_10', 'strengths', 'weaknesses', 'improvements']) {
            assert.ok(schemasPy.includes(k), `schemas.py chưa có trường "${k}"`);
        }
        assert.ok(/class\s+HookAnalysis\b/.test(schemasPy), 'schemas.py phải có class HookAnalysis');
        assert.ok(/class\s+CriteriaScores\b/.test(schemasPy), 'schemas.py phải có class CriteriaScores');
    });

    await reporter.test(A, 'Tier 2: synthesis.py chuyển tiếp điểm số ra FinalAnalysisResult', async () => {
        for (const k of ['hook_analysis', 'criteria_scores', 'overall_score_1_10']) {
            assert.ok(new RegExp(`${k}\\s*=\\s*llm_resp\\.${k}`).test(synthesisPy),
                `synthesis.py chưa gán ${k}=llm_resp.${k} vào FinalAnalysisResult`);
        }
    });

    await reporter.test(A, 'Tier 2: đổi schema ⇒ PIPELINE_VERSION phải tăng (cache cũ không tương thích)', async () => {
        const m = cachePy.match(/PIPELINE_VERSION\s*=\s*"([^"]+)"/);
        assert.ok(m, 'cache.py phải có PIPELINE_VERSION');
        assert.notStrictEqual(m[1], '2.0.0_vi',
            'PIPELINE_VERSION vẫn là 2.0.0_vi ⇒ cache phân tích cũ (thiếu điểm) sẽ bị dùng lại');
    });

    // ── extractAnalysisScorecard: đọc kết quả AI ra bảng điểm an toàn ──────
    await reporter.test(A, 'Tier 1: extractAnalysisScorecard đọc đủ điểm từ kết quả AI', async () => {
        const sc = extractAnalysisScorecard({
            overall_score_1_10: 8,
            criteria_scores: { hook: 9, structure: 7, pacing: 8, visual: 9, audio: 6, message: 8, cta: 7 },
            hook_analysis: { type: 'cau-hoi', first_3s: 'Hỏi thẳng nỗi đau', score_1_10: 9 },
            strengths: ['Hook mạnh'], weaknesses: ['CTA mờ'], improvements: ['Thêm CTA rõ']
        });
        assert.strictEqual(sc.overallScore, 8);
        assert.strictEqual(sc.hookScore, 9);
        assert.strictEqual(sc.hookType, 'cau-hoi');
        assert.strictEqual(sc.criteriaScores.audio, 6);
        assert.deepStrictEqual(sc.strengths, ['Hook mạnh']);
        assert.deepStrictEqual(sc.improvements, ['Thêm CTA rõ']);
    });

    await reporter.test(A, 'Tier 1: điểm ngoài thang 1-10 bị kẹp về biên', async () => {
        const sc = extractAnalysisScorecard({
            overall_score_1_10: 99,
            criteria_scores: { hook: -5, structure: 12 }
        });
        assert.strictEqual(sc.overallScore, 10, '99 phải kẹp về 10');
        assert.strictEqual(sc.criteriaScores.hook, 1, '-5 phải kẹp về 1');
        assert.strictEqual(sc.criteriaScores.structure, 10, '12 phải kẹp về 10');
    });

    await reporter.test(A, 'Tier 1: loại hook lạ được quy về "khac", input rác không làm vỡ', async () => {
        assert.strictEqual(extractAnalysisScorecard({ hook_analysis: { type: 'xyz-la-hoac' } }).hookType, 'khac');
        const empty = extractAnalysisScorecard(null);
        assert.strictEqual(empty.overallScore, null);
        assert.strictEqual(empty.hookType, null);
        assert.deepStrictEqual(empty.strengths, []);
    });

    await reporter.test(A, 'Tier 1: HOOK_TYPES là danh sách đóng, có đủ các kiểu hook chính', async () => {
        assert.ok(Array.isArray(HOOK_TYPES) && HOOK_TYPES.length >= 6, 'HOOK_TYPES phải có ≥6 loại');
        assert.ok(HOOK_TYPES.includes('khac'), 'phải có nhóm "khac" để hứng loại lạ');
        assert.ok(HOOK_TYPES.includes('cau-hoi'), 'phải có hook dạng câu hỏi');
    });

    await reporter.test(A, 'Tier 2: describe kho lưu bảng điểm + loại hook vào asset', async () => {
        assert.ok(studioIndex.includes('extractAnalysisScorecard'),
            'index.js phải dùng extractAnalysisScorecard khi describe clip kho');
        for (const f of ['hookType', 'hookScore', 'overallScore']) {
            assert.ok(studioIndex.includes(f), `index.js chưa lưu trường "${f}" lên asset`);
        }
    });

    await reporter.test(A, 'Tier 3: step 2 hiển thị bảng chấm điểm video đối thủ', async () => {
        assert.ok(v2vHtml.includes('v2v-scorecard'),
            'HTML phải có khối #v2v-scorecard ở bước phân tích AI');
        assert.ok(v2vJs.includes('renderScorecard'),
            'JS phải có renderScorecard() để vẽ bảng điểm');
        assert.ok(v2vJs.includes('criteriaScores') || v2vJs.includes('criteria_scores'),
            'JS phải đọc điểm 7 tiêu chí để hiển thị');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ĐỢT B — KHO 3 NHÓM & CHỌN REF/HOOK TỪ KHO
    // ═══════════════════════════════════════════════════════════════════════

    await reporter.test(B, 'Tier 1: kho chỉ còn ĐÚNG 3 nhóm', async () => {
        assert.deepStrictEqual(
            LIBRARY_GROUPS.map(g => g.id || g),
            ['material', 'reference', 'hook'],
            'LIBRARY_GROUPS phải là material / reference / hook'
        );
    });

    await reporter.test(B, 'Tier 1: clip chưa phân loại rơi vào nhóm "Nguyên liệu"', async () => {
        for (const raw of ['', null, undefined, '(root)', 'root', 'linh-tinh', 'people']) {
            assert.strictEqual(normalizeCategory(raw), 'material',
                `category ${JSON.stringify(raw)} phải quy về "material"`);
        }
    });

    await reporter.test(B, 'Tier 1: nhận diện nhóm đối thủ & hook (không phân biệt hoa thường)', async () => {
        for (const raw of ['ref', 'REF', 'reference', 'Reference', 'doi-thu']) {
            assert.strictEqual(normalizeCategory(raw), 'reference', `"${raw}" phải là reference`);
        }
        for (const raw of ['hook', 'HOOK', 'Hook']) {
            assert.strictEqual(normalizeCategory(raw), 'hook', `"${raw}" phải là hook`);
        }
    });

    await reporter.test(B, 'Tier 2: upload kho nhận tham số nhóm, chỉ cho hook | reference', async () => {
        assert.ok(/library\/upload/.test(studioIndex), 'vẫn phải có route /library/upload');
        assert.ok(studioIndex.includes('UPLOAD_CATEGORIES') || /uploadCategory/.test(studioIndex),
            'route upload phải đọc nhóm người dùng chọn (hook | reference)');
    });

    await reporter.test(B, 'Tier 3: nút tải lên kho hiện 2 lựa chọn hook / đối thủ', async () => {
        assert.ok(v2vHtml.includes('v2v-upload-category'),
            'HTML phải có bộ chọn #v2v-upload-category khi tải video vào kho');
        assert.ok(!/Chưa phân loại/.test(v2vJs),
            'JS không được còn nhãn "Chưa phân loại" — đã thay bằng "Nguyên liệu"');
        assert.ok(v2vJs.includes('Nguyên liệu'), 'JS phải có nhãn nhóm "Nguyên liệu"');
    });

    await reporter.test(B, 'Tier 3: step 1 có lưới chọn lại video đối thủ & hook từ kho', async () => {
        assert.ok(v2vHtml.includes('v2v-step1-ref-picker'),
            'HTML thiếu lưới chọn video đối thủ từ kho (#v2v-step1-ref-picker)');
        assert.ok(v2vHtml.includes('v2v-step1-hook-picker'),
            'HTML thiếu lưới chọn video hook từ kho (#v2v-step1-hook-picker)');
        assert.ok(v2vJs.includes('renderKhoPicker'),
            'JS phải có renderKhoPicker() vẽ lưới thumbnail chọn từ kho');
    });

    await reporter.test(B, 'Tier 2: chọn clip kho làm ref/hook qua API (assetId)', async () => {
        assert.ok(/refAssetId/.test(studioIndex) && /hookAssetId/.test(studioIndex),
            'index.js phải nhận refAssetId / hookAssetId để gán video từ kho cho project');
    });

    // ── AI tự chọn hook từ kho khi user không nhập ────────────────────────
    const khoHooks = [
        { asset_id: 'H1', category: 'hook', hookType: 'cau-hoi', hookScore: 7, duration: 4.5, described: true },
        { asset_id: 'H2', category: 'hook', hookType: 'gay-soc', hookScore: 9, duration: 4.2, described: true },
        { asset_id: 'H3', category: 'hook', hookType: 'cau-hoi', hookScore: 9, duration: 4.8, described: true },
        { asset_id: 'M1', category: 'material', hookScore: 10, duration: 4.0, described: true }
    ];

    await reporter.test(B, 'Tier 1: không chọn loại hook ⇒ lấy clip hook điểm CAO NHẤT', async () => {
        const picked = pickHookFromLibrary(khoHooks, {});
        assert.ok(picked, 'phải chọn được 1 clip hook');
        assert.strictEqual(picked.hookScore, 9, 'phải lấy clip điểm 9');
        assert.notStrictEqual(picked.asset_id, 'M1', 'KHÔNG được lấy clip nhóm Nguyên liệu');
    });

    await reporter.test(B, 'Tier 1: có chọn loại hook ⇒ ưu tiên đúng loại, rồi mới tới điểm', async () => {
        const picked = pickHookFromLibrary(khoHooks, { hookType: 'gay-soc' });
        assert.strictEqual(picked.asset_id, 'H2', 'phải lấy đúng clip loại gay-soc');
    });

    await reporter.test(B, 'Tier 1: loại hook được chọn không có trong kho ⇒ rơi về điểm cao nhất', async () => {
        const picked = pickHookFromLibrary(khoHooks, { hookType: 'con-so' });
        assert.ok(picked && picked.category === 'hook', 'vẫn phải trả về 1 clip hook');
        assert.strictEqual(picked.hookScore, 9);
    });

    await reporter.test(B, 'Tier 1: kho không có clip hook ⇒ trả null (không bịa)', async () => {
        assert.strictEqual(pickHookFromLibrary([{ asset_id: 'M1', category: 'material' }], {}), null);
        assert.strictEqual(pickHookFromLibrary([], {}), null);
        assert.strictEqual(pickHookFromLibrary(null, {}), null);
    });

    await reporter.test(B, 'Tier 2: sinh kịch bản KHÔNG có hook user ⇒ tự lấy hook từ kho', async () => {
        assert.ok(studioIndex.includes('pickHookFromLibrary'),
            'index.js phải gọi pickHookFromLibrary khi project không có hookVideoPath');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ĐỢT C — NHỊP VIDEO
    // ═══════════════════════════════════════════════════════════════════════

    await reporter.test(C, 'Tier 1: GIỮ NGUYÊN tốc độ đọc thật đã đo (3.8 từ/s)', async () => {
        assert.ok(Math.abs(VOICE_SPEAK_RATE - 3.8) < 0.01,
            `VOICE_SPEAK_RATE phải giữ 3.8 từ/s (đo thật), nhận ${VOICE_SPEAK_RATE}`);
    });

    await reporter.test(C, 'Tier 1: ngân sách VIẾT thấp hơn tốc độ ĐỌC để hình có chỗ thở', async () => {
        assert.ok(VOICE_WRITE_WORDS_PER_SEC < VOICE_SPEAK_RATE,
            'ngân sách viết phải NHỎ HƠN tốc độ đọc — nếu bằng nhau thì câu luôn bị cắt cụt');
        assert.ok(VOICE_WRITE_WORDS_PER_SEC >= 2.8,
            'quá thấp thì lời bình cụt lủn, không đủ ý');
    });

    await reporter.test(C, 'Tier 1: cảnh 4s viết theo ngân sách ⇒ voice đọc xong SỚM HƠN cảnh', async () => {
        const segDur = 4.0;
        const words = Math.floor(segDur * VOICE_WRITE_WORDS_PER_SEC);
        const speakTime = words / VOICE_SPEAK_RATE;
        assert.ok(speakTime < segDur - 0.3,
            `cảnh ${segDur}s / ${words} từ đọc hết ${speakTime.toFixed(2)}s — phải dư ≥0.3s cho hình`);
    });

    await reporter.test(C, 'Tier 1: trần video thành phẩm về 30s (user chốt 20-30s)', async () => {
        assert.strictEqual(MAX_OUTPUT_SECONDS, 30, 'trần mặc định phải là 30s');
    });

    // ĐỔI HỢP ĐỒNG 2026-09-19 (user chốt): sàn phân cảnh hạ từ 4s xuống 1s.
    // Lý do: clip hook thật của user chỉ dài 3.27s. Luật cũ ép cảnh >=4s nên khung cắt
    // dài hơn clip, mốc xfade trượt quá cuối luồng hình và CẢ VIDEO chỉ còn phân cảnh 1
    // (đo được: 10/10 biến thể có hình 4.1-4.9s trong khi tiếng 22-24s).
    // User: "độ dài mỗi phân cảnh a cho phép 1 - 5s luôn đấy".
    await reporter.test(C, 'Tier 1: hook bị kẹp về 1-5s dù video hook dài bao nhiêu', async () => {
        assert.strictEqual(clampHookDuration(34), 5, 'hook 34s phải cắt còn 5s');
        assert.strictEqual(clampHookDuration(4.5), 4.5, 'hook 4.5s giữ nguyên');
        assert.strictEqual(clampHookDuration(3.27), 3.27, 'hook 3.27s là HỢP LỆ theo luật mới 1-5s');
        assert.strictEqual(clampHookDuration(0.4), 1, 'ngắn hơn 1s thì nâng lên sàn 1s');
        assert.strictEqual(clampHookDuration(0), 4, 'không rõ độ dài ⇒ vẫn mặc định 4s cho hook');
    });

    await reporter.test(C, 'Tier 1: ngân sách với hook 5s cho ra video 20-30s', async () => {
        const b = planOutputBudget({ hookDuration: 5, libraryCount: 60, variantCount: 10 });
        assert.ok(b.estimatedTotal >= 20 && b.estimatedTotal <= 30,
            `thời lượng ước tính ${b.estimatedTotal}s phải nằm trong 20-30s`);
        assert.ok(b.bodyCount >= 4, `phải có ≥4 cảnh thân bài, nhận ${b.bodyCount}`);
    });

    await reporter.test(C, 'Tier 1: hook 34s ĐƯA THẲNG vào ngân sách vẫn không phá trần', async () => {
        // Bẫy đã gặp ở đợt 1: hook thô 34s lọt vào budget ⇒ chỉ còn 6 cảnh ⇒ video lệch nhịp.
        const b = planOutputBudget({ hookDuration: 34, libraryCount: 60, variantCount: 10 });
        assert.ok(b.estimatedTotal <= 30,
            `budget phải tự kẹp hook, nhận ${b.estimatedTotal}s`);
        assert.ok(b.bodyCount >= 4, `vẫn phải giữ ≥4 cảnh thân bài, nhận ${b.bodyCount}`);
    });

    await reporter.test(C, 'Tier 1: mỗi phân cảnh thân bài dài 1-5s', async () => {
        const assets = Array.from({ length: 8 }, (_, i) => ({
            asset_id: `V${i}`, path: `/x/${i}.mp4`, filename: `${i}.mp4`,
            duration: 12, described: true, aiDescription: 'Thao tác sản phẩm'
        }));
        const seq = selectFootageSequence(assets, { targetCount: 6 });
        assert.strictEqual(seq.length, 6);
        for (const s of seq) {
            // Sàn 1s theo luật mới; trần 5s giữ nguyên.
            assert.ok(s.duration >= 1.0 && s.duration <= 5.0,
                `phân cảnh ${s.order} dài ${s.duration}s — phải trong 1-5s`);
        }
    });

    await reporter.test(C, 'Tier 1: clip gốc ngắn hơn 4s thì không bịa thêm hình', async () => {
        const seq = selectFootageSequence(
            [{ asset_id: 'S1', path: '/x/s.mp4', duration: 2.4, described: true, aiDescription: 'ngắn' }],
            { targetCount: 1 }
        );
        assert.ok(seq[0].duration <= 2.4, `không được vượt độ dài clip gốc (2.4s), nhận ${seq[0].duration}s`);
    });

    await reporter.test(C, 'Tier 1: ngân sách từ của phân cảnh tính theo tốc độ VIẾT', async () => {
        const seq = selectFootageSequence(
            [{ asset_id: 'V1', path: '/x/1.mp4', duration: 12, described: true, aiDescription: 'a' }],
            { targetCount: 1 }
        );
        const s = seq[0];
        const speakTime = s.maxWords / VOICE_SPEAK_RATE;
        assert.ok(speakTime <= s.duration,
            `đọc hết ${s.maxWords} từ mất ${speakTime.toFixed(2)}s > cảnh ${s.duration}s ⇒ sẽ bị cắt cụt`);
    });

    await reporter.test(C, 'Tier 1: nới cảnh cho vừa lời bình KHÔNG được vượt trần 5s', async () => {
        const dur = fitSegmentDurationToVoice({
            sourceIn: 0, sourceOut: 4.0, clipDuration: 20,
            voice: 'Đây là một câu lời bình rất dài cố tình viết thừa chữ để ép hệ thống phải nới phân cảnh ra thật lâu'
        });
        assert.ok(dur <= 5.0, `nới tối đa 5s, nhận ${dur}s`);
    });

    await reporter.test(C, 'Tier 2: prompt KHÔNG còn lệnh giữ trọn thời lượng hook', async () => {
        assert.ok(!timelineGen.includes('FULL_HOOK_DURATION'),
            'timeline_generator.js vẫn còn FULL_HOOK_DURATION — hook sẽ lại dài 15-34s');
        assert.ok(!/RETAIN THE FULL HOOK/i.test(timelineGen),
            'prompt vẫn yêu cầu giữ trọn hook');
    });

    await reporter.test(C, 'Tier 2: prompt nêu rõ hook 1-5s và trần thời lượng cảnh', async () => {
        assert.ok(/hook[^\n]*1-5\s*s|1-5\s*seconds?[^\n]*hook/i.test(timelineGen),
            'prompt phải nói rõ hook trong 1-5 giây (luật mới user chốt 2026-09-19)');
        assert.ok(/HARD LIMIT|MUST NOT exceed/i.test(timelineGen),
            'prompt phải có luật trần thời lượng cảnh rõ ràng');
    });

    // ── Ép 10 biến thể khác nhau ──────────────────────────────────────────
    const mkVar = (persona, boiCanh, daoCu, bangChung) => ({
        directorNote: { differentiators: { persona, boiCanh, daoCu, bangChung } }
    });

    await reporter.test(C, 'Tier 1: 2 biến thể trùng 4/4 yếu tố ⇒ báo vi phạm', async () => {
        const r = checkVariantDiversity([
            mkVar('mẹ bỉm', 'phòng ngủ', 'vali', 'cân hành lý'),
            mkVar('mẹ bỉm', 'phòng ngủ', 'vali', 'cân hành lý')
        ]);
        assert.strictEqual(r.ok, false, 'phải báo KHÔNG hợp lệ');
        assert.strictEqual(r.violations.length, 1);
        assert.strictEqual(r.violations[0].sameCount, 4);
    });

    await reporter.test(C, 'Tier 1: trùng 3/4 yếu tố vẫn là vi phạm (theo plan đã chốt)', async () => {
        const r = checkVariantDiversity([
            mkVar('mẹ bỉm', 'phòng ngủ', 'vali', 'cân hành lý'),
            mkVar('mẹ bỉm', 'phòng ngủ', 'vali', 'video quay nhanh')
        ]);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.violations[0].sameCount, 3);
    });

    await reporter.test(C, 'Tier 1: khác ≥2/4 yếu tố thì hợp lệ', async () => {
        const r = checkVariantDiversity([
            mkVar('mẹ bỉm', 'phòng ngủ', 'vali', 'cân hành lý'),
            mkVar('dân văn phòng', 'sân bay', 'vali', 'cân hành lý')
        ]);
        assert.strictEqual(r.ok, true, `phải hợp lệ, nhận ${JSON.stringify(r.violations)}`);
    });

    await reporter.test(C, 'Tier 1: thiếu khai báo differentiators ⇒ coi là vi phạm', async () => {
        const r = checkVariantDiversity([{ directorNote: {} }, { directorNote: {} }]);
        assert.strictEqual(r.ok, false, 'không khai báo thì không thể chứng minh đã khác nhau');
    });

    await reporter.test(C, 'Tier 2: prompt bắt model khai báo 4 yếu tố khác biệt', async () => {
        assert.ok(timelineGen.includes('differentiators'),
            'prompt phải yêu cầu trường differentiators');
        for (const k of ['persona', 'boiCanh', 'daoCu', 'bangChung']) {
            assert.ok(timelineGen.includes(k), `prompt thiếu yếu tố "${k}"`);
        }
    });

    // ── Bộ lọc claim ──────────────────────────────────────────────────────
    await reporter.test(C, 'Tier 1: chặn claim y tế / tuyệt đối', async () => {
        const hits = checkClaims('Sản phẩm giúp giảm cân và chữa đau lưng, hiệu quả 100%.');
        assert.ok(hits.length >= 2, `phải bắt ≥2 claim cấm, nhận ${JSON.stringify(hits)}`);
        assert.ok(hits.every(h => h.term && h.suggest), 'mỗi vi phạm phải kèm gợi ý thay thế');
    });

    await reporter.test(C, 'Tier 1: câu nói an toàn thì không bị báo nhầm', async () => {
        assert.deepStrictEqual(
            checkClaims('Gấp gọn quần áo, tiết kiệm chỗ trong vali khi đi du lịch.'),
            []
        );
    });

    await reporter.test(C, 'Tier 1: applyClaimRules TỰ thay cụm cấm bằng cách nói an toàn', async () => {
        const out = applyClaimRules('Hiệu quả 100%, cam kết giảm cân.');
        assert.ok(!/100%/.test(out), `vẫn còn "100%": ${out}`);
        assert.ok(!/giảm cân/i.test(out), `vẫn còn "giảm cân": ${out}`);
        assert.strictEqual(checkClaims(out).length, 0, `sau khi lọc vẫn còn vi phạm: ${out}`);
    });

    await reporter.test(C, 'Tier 1: luật claim để ở cấu hình, không hardcode 1 chỗ', async () => {
        assert.ok(Array.isArray(DEFAULT_CLAIM_RULES) && DEFAULT_CLAIM_RULES.length >= 5,
            'DEFAULT_CLAIM_RULES phải là danh sách ≥5 luật');
        const custom = [{ pattern: 'siêu phẩm', reason: 'thổi phồng', suggest: 'sản phẩm' }];
        assert.strictEqual(checkClaims('Đây là siêu phẩm.', custom).length, 1);
        assert.strictEqual(checkClaims('Hiệu quả 100%.', custom).length, 0,
            'dùng luật riêng thì không áp luật mặc định');
    });

    await reporter.test(C, 'Tier 2: prompt có khối luật cấm claim + hậu kiểm', async () => {
        assert.ok(/CLAIM|COMPLIANCE/i.test(timelineGen),
            'prompt phải có khối luật claim/compliance');
        assert.ok(timelineGen.includes('checkClaims') || timelineGen.includes('applyClaimRules'),
            'kịch bản sinh ra phải đi qua bộ lọc claim (hậu kiểm)');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ĐỢT D — TRẦN ĐỒNG THỜI & HOOK CHỈ 1 LẦN
    // ═══════════════════════════════════════════════════════════════════════
    const assemblerSrc = read('byteplus/video_studio/assembler.js');

    await reporter.test(D, 'Tier 2: bước 5 dựng tối đa 10 video một lượt, còn lại xếp hàng rồi fill', async () => {
        assert.ok(/concurrency\s*=\s*Number\(process\.env\.V2V_RENDER_CONCURRENCY\)\s*\|\|\s*10/.test(assemblerSrc),
            'batchAssemble phải mặc định 10 luồng dựng (V2V_RENDER_CONCURRENCY)');
        assert.ok(/runWithConcurrency\(timelines,\s*concurrency/.test(assemblerSrc),
            'phải dùng worker pool để video xong thì fill video kế tiếp, không bắn hết cùng lúc');
    });

    await reporter.test(D, 'Tier 2: bước 3 sinh tối đa 10 kịch bản một lượt TRÊN TOÀN HỆ THỐNG', async () => {
        assert.strictEqual(scriptGate.limit, 10,
            `gate sinh kịch bản phải là 10, nhận ${scriptGate.limit}`);
        assert.ok(timelineGen.includes('runWithLimit(anglesToUse, scriptGate.limit'),
            'generateBatchTimelines phải qua runWithLimit + scriptGate, không dùng Promise.all');
        assert.ok(!/Promise\.all\(\s*anglesToUse/.test(timelineGen),
            'không được bắn toàn bộ góc tiếp cận cùng lúc — 9Router sẽ chặn');
    });

    // ── Hook chỉ 1 lần, thân bài chỉ dùng Nguyên liệu ─────────────────────
    const mkAsset = (id, category, extra = {}) => ({
        asset_id: id, path: `/kho/${id}.mp4`, filename: `${id}.mp4`, category,
        duration: 12, described: true, aiDescription: 'thao tác sản phẩm thực tế', ...extra
    });

    const mixedLib = [
        mkAsset('M1', 'material'), mkAsset('M2', 'material'), mkAsset('M3', 'material'),
        mkAsset('M4', 'material'), mkAsset('M5', 'material'), mkAsset('M6', 'material'),
        mkAsset('H1', 'hook', { hookScore: 9 }), mkAsset('H2', 'hook', { hookScore: 8 }),
        mkAsset('R1', 'reference'), mkAsset('R2', 'reference')
    ];

    await reporter.test(D, 'Tier 1: selectFootageSequence CHỈ lấy clip nhóm Nguyên liệu', async () => {
        const seq = selectFootageSequence(mixedLib, { targetCount: 5 });
        assert.strictEqual(seq.length, 5);
        for (const sg of seq) {
            assert.ok(/^M\d$/.test(sg.sourceAssetId),
                `thân bài lấy phải clip Nguyên liệu, nhận ${sg.sourceAssetId}`);
        }
    });

    await reporter.test(D, 'Tier 1: kho không còn clip Nguyên liệu ⇒ trả rỗng, KHÔNG lấy bừa hook/đối thủ', async () => {
        const seq = selectFootageSequence([mkAsset('H1', 'hook'), mkAsset('R1', 'reference')], { targetCount: 3 });
        assert.deepStrictEqual(seq, [], 'thà không sinh còn hơn nhét clip đối thủ vào quảng cáo của mình');
    });

    // Hook thật chỉ cần TỒN TẠI để applyCombinatorialPlanning chấp nhận — tạo file tạm cho test kín.
    const fakeHookPath = path.join(os.tmpdir(), 'v2v_test_hook.mp4');
    if (!fs.existsSync(fakeHookPath)) fs.writeFileSync(fakeHookPath, 'x');
    const hookCtx = {
        hookVideoPath: fakeHookPath,
        hookVideoName: 'test-hook.mp4',
        hookDuration: 20,
        hookAnalysis: { duration: 20, visual_events: [] }
    };
    const mkRaw = () => ({
        index: 1,
        segments: [
            { order: 1, phase: 'hook', sourceAssetId: 'HOOK_SOURCE', sourceIn: 0, sourceOut: 5, voice: 'Câu mở đầu gây chú ý', text: 'MỞ ĐẦU' },
            { order: 2, phase: 'body', sourceAssetId: 'M1', sourceIn: 0, sourceOut: 4.5, voice: 'Câu thân bài thứ nhất', text: 'THÂN 1' },
            // Bẫy 1: model lặp lại hook ở giữa video
            { order: 3, phase: 'hook', sourceAssetId: 'HOOK_SOURCE', sourceIn: 0, sourceOut: 4, voice: 'Câu thân bài thứ hai', text: 'THÂN 2' },
            // Bẫy 2: model bốc clip nhóm hook trong kho làm footage thân bài
            { order: 4, phase: 'body', sourceAssetId: 'H1', sourceIn: 0, sourceOut: 4.5, voice: 'Câu thân bài thứ ba', text: 'THÂN 3' },
            // Bẫy 3: model bốc thẳng video đối thủ vào quảng cáo của mình
            { order: 5, phase: 'cta', sourceAssetId: 'R1', sourceIn: 0, sourceOut: 4, voice: 'Câu chốt đơn cuối video', text: 'CHỐT' }
        ]
    });

    await reporter.test(D, 'Tier 1: HOOK_SOURCE xuất hiện ĐÚNG 1 lần và phải ở phân cảnh đầu', async () => {
        const planned = applyCombinatorialPlanning(mkRaw(), mixedLib, {}, 3, hookCtx);
        const hookSegs = planned.segments.filter(sg => sg.sourceAssetId === 'HOOK_SOURCE');
        assert.strictEqual(hookSegs.length, 1,
            `hook chỉ được dùng 1 lần, nhận ${hookSegs.length} lần`);
        assert.strictEqual(planned.segments[0].sourceAssetId, 'HOOK_SOURCE',
            'lần dùng duy nhất đó phải là phân cảnh mở đầu');
        assert.strictEqual(planned.segments[0].phase, 'hook');
    });

    await reporter.test(D, 'Tier 1: từ phân cảnh 2 trở đi KHÔNG còn phase "hook"', async () => {
        const planned = applyCombinatorialPlanning(mkRaw(), mixedLib, {}, 3, hookCtx);
        const laterHook = planned.segments.slice(1).filter(sg => sg.phase === 'hook');
        assert.strictEqual(laterHook.length, 0,
            `phân cảnh sau không được mang phase hook, nhận ${laterHook.length}`);
    });

    await reporter.test(D, 'Tier 1: từ phân cảnh 2 trở đi KHÔNG dùng clip nhóm hook hoặc đối thủ', async () => {
        const planned = applyCombinatorialPlanning(mkRaw(), mixedLib, {}, 3, hookCtx);
        const byId = new Map(mixedLib.map(a => [a.asset_id, a]));
        for (const sg of planned.segments.slice(1)) {
            const a = byId.get(sg.sourceAssetId);
            assert.ok(a, `phân cảnh ${sg.order} trỏ tới asset lạ: ${sg.sourceAssetId}`);
            assert.strictEqual(normalizeCategory(a.category), 'material',
                `phân cảnh ${sg.order} dùng clip nhóm "${a.category}" — chỉ được dùng Nguyên liệu`);
        }
    });

    await reporter.test(D, 'Tier 1: KHÔNG có video hook thì không để lại HOOK_SOURCE mồ côi', async () => {
        const planned = applyCombinatorialPlanning(mkRaw(), mixedLib, {}, 3, {});
        for (const sg of planned.segments) {
            assert.notStrictEqual(sg.sourceAssetId, 'HOOK_SOURCE',
                'không có video hook thì phải thay bằng clip Nguyên liệu');
        }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ĐỢT E — TEXT/VOICE PHẢI BÁM ĐÚNG KHUNG HÌNH
    //
    // Lỗi đo thật: clip 61.8s có 32 event nhưng model chỉ được xem 3 event đầu (0-4.5s),
    // rồi HEAD RANDOMIZER cắt ở 10.3-14.8s — đoạn model CHƯA TỪNG thấy mô tả.
    // Kết quả: voice nói "nhét không vừa khung đo" còn hình chiếu "nhấc túi đã ép phẳng".
    // ═══════════════════════════════════════════════════════════════════════
    const evClip = {
        asset_id: 'EV1', path: '/kho/EV1.mp4', filename: 'EV1.mp4', category: 'material',
        duration: 30, described: true, aiDescription: 'tổng quan clip',
        descriptionIndex: [
            { start: 0, end: 4, description: 'Mở vali đầy quần áo bừa bộn' },
            { start: 4, end: 9, description: 'Xếp quần áo vào túi nén' },
            { start: 9, end: 14, description: 'Bật máy hút chân không' },
            { start: 14, end: 20, description: 'Túi xẹp phẳng lì' },
            { start: 20, end: 26, description: 'Đóng nắp vali nhẹ nhàng' }
        ]
    };
    // ĐỔI TIÊU CHÍ 2026-09-18 (§30, có lý do): ban đầu em đòi cửa sổ phải nằm TRỌN trong MỘT đoạn.
    // Đo trên dữ liệu thật: đoạn mô tả chỉ dài 1.5-3.5s còn cảnh 4-5s, nên một cảnh đúng-đắn vẫn
    // trải qua 2 đoạn (phủ 80-100%). Đòi 1 đoạn duy nhất là đòi điều bất khả thi và sẽ ép cảnh
    // ngắn lại. Tiêu chí đúng: cửa sổ phải được các đoạn mô tả phủ gần như trọn vẹn (>=90%).
    // Thước đo ĐÚNG là KHE HỞ lớn nhất, không phải % phủ. Analyzer lấy mẫu khung hình mỗi 0.5s
    // nên giữa 2 đoạn liền kề luôn có ranh giới 0.5s (vd 3.0-5.5 rồi 6.0-9.5). Đó là làm tròn,
    // KHÔNG phải vùng chưa được xem. Đo thật trên 15 phân cảnh: khe hở lớn nhất = 0.50s, 0/15
    // cảnh vượt 0.6s. Dùng ngưỡng % phủ sẽ đánh trượt oan những cửa sổ hoàn toàn hợp lệ.
    const maxGap = (asset, start, end) => {
        const ev = (asset.descriptionIndex || []).slice().sort((a, b) => a.start - b.start);
        let gap = 0, cur = start;
        for (const e of ev) {
            if (Number(e.end) <= start || Number(e.start) >= end) continue;
            if (Number(e.start) > cur) gap = Math.max(gap, Number(e.start) - cur);
            cur = Math.max(cur, Math.min(end, Number(e.end)));
        }
        if (end > cur) gap = Math.max(gap, end - cur);
        return gap;
    };
    const inAnyEvent = (asset, start, end) => maxGap(asset, start, end) <= 0.6;

    await reporter.test(E, 'Tier 1: cửa sổ cắt luôn nằm TRỌN trong một đoạn ĐÃ có mô tả', async () => {
        for (let seed = 0; seed < 5; seed++) {
            const w = resolveSegmentWindow(evClip, 4.0, { variantSeed: seed });
            assert.ok(inAnyEvent(evClip, w.start, w.end),
                `seed ${seed}: cắt ${w.start}-${w.end}s rơi ra ngoài mọi đoạn có mô tả`);
            assert.ok(w.description && w.description.length > 0,
                `seed ${seed}: phải kèm mô tả của ĐÚNG đoạn đang cắt`);
        }
    });

    await reporter.test(E, 'Tier 1: mô tả trả về đúng của đoạn đang cắt, không phải đoạn khác', async () => {
        const w = resolveSegmentWindow(evClip, 4.0, { requestedIn: 9.5 });
        assert.ok(w.description.includes('Bật máy hút chân không'),
            `cắt từ 9.5s phải mô tả đoạn 9-14s, nhận "${w.description}"`);
    });

    await reporter.test(E, 'Tier 1: biến thể khác nhau ⇒ cắt đoạn khác nhau (vẫn giữ sự đa dạng)', async () => {
        const starts = new Set();
        for (let seed = 0; seed < 5; seed++) starts.add(resolveSegmentWindow(evClip, 4.0, { variantSeed: seed }).start);
        assert.ok(starts.size >= 3,
            `5 biến thể phải cho ít nhất 3 cửa sổ khác nhau, nhận ${starts.size}`);
    });

    await reporter.test(E, 'Tier 1: mốc model chọn nằm trong đoạn có mô tả ⇒ TÔN TRỌNG, không đổi', async () => {
        const w = resolveSegmentWindow(evClip, 4.0, { requestedIn: 4.5, variantSeed: 3 });
        assert.strictEqual(w.start, 4.5,
            `lời bình được viết cho mốc 4.5s thì phải cắt đúng 4.5s, nhận ${w.start}`);
    });

    await reporter.test(E, 'Tier 1: mốc model chọn vượt độ dài clip ⇒ nắn về đoạn hợp lệ', async () => {
        const w = resolveSegmentWindow(evClip, 4.0, { requestedIn: 99 });
        assert.ok(w.start >= 0 && w.end <= evClip.duration,
            `phải nằm trong clip, nhận ${w.start}-${w.end}`);
        assert.ok(inAnyEvent(evClip, w.start, w.end), 'và vẫn phải là đoạn có mô tả');
    });

    await reporter.test(E, 'Tier 1: clip KHÔNG có mô tả đoạn ⇒ lấy từ giây 0, không bịa mốc', async () => {
        const bare = { asset_id: 'B1', duration: 20, described: true, aiDescription: 'mô tả chung' };
        const w = resolveSegmentWindow(bare, 4.0, { variantSeed: 2 });
        assert.strictEqual(w.start, 0);
        assert.strictEqual(w.description, 'mô tả chung');
    });

    await reporter.test(E, 'Tier 1: selectFootageSequence gắn visualAction ĐÚNG đoạn nó chọn', async () => {
        const seq = selectFootageSequence([evClip], { targetCount: 1 });
        const sg = seq[0];
        assert.ok(inAnyEvent(evClip, sg.sourceIn, sg.sourceOut),
            `cắt ${sg.sourceIn}-${sg.sourceOut}s phải nằm trong đoạn có mô tả`);
        // visualAction phải gộp mô tả của MỌI đoạn chạm vào cửa sổ, không bỏ sót nhịp nào.
        const touched = evClip.descriptionIndex.filter(
            e => e.end > sg.sourceIn + 0.01 && e.start < sg.sourceOut - 0.01);
        for (const e of touched) {
            assert.ok(sg.visualAction.includes(e.description),
                `visualAction bỏ sót nhịp hình "${e.description}" — AI sẽ không tả phần đó của cảnh`);
        }
        assert.ok(Array.isArray(sg.visualBeats) && sg.visualBeats.length === touched.length,
            'phải kèm visualBeats có mốc thời gian từng nhịp để AI viết đúng thứ tự');
    });

    await reporter.test(E, 'Tier 1: mapping KHÔNG random — cùng đầu vào cho cùng cửa sổ', async () => {
        const lib = [evClip,
            { ...evClip, asset_id: 'EV2', path: '/kho/EV2.mp4', filename: 'EV2.mp4' },
            { ...evClip, asset_id: 'EV3', path: '/kho/EV3.mp4', filename: 'EV3.mp4' }];
        const raw = () => ({ index: 2, segments: [
            { order: 1, phase: 'body', sourceAssetId: 'EV1', sourceIn: 9, sourceOut: 13, voice: 'Bật máy hút chân không ngay', text: 'BẬT MÁY' },
            { order: 2, phase: 'body', sourceAssetId: 'EV2', sourceIn: 14, sourceOut: 18, voice: 'Túi xẹp phẳng lì tức thì', text: 'XẸP PHẲNG' }
        ] });
        const a = applyCombinatorialPlanning(raw(), lib, {}, 3, {});
        const b = applyCombinatorialPlanning(raw(), lib, {}, 3, {});
        assert.deepStrictEqual(
            a.segments.map(x => [x.sourceAssetId, x.sourceIn]),
            b.segments.map(x => [x.sourceAssetId, x.sourceIn]),
            'cắt ngẫu nhiên làm hình lệch hẳn khỏi lời bình — phải bỏ hoàn toàn'
        );
    });

    await reporter.test(E, 'Tier 1: mapping giữ cửa sổ mà lời bình được viết cho', async () => {
        const lib = [evClip];
        const planned = applyCombinatorialPlanning({ index: 1, segments: [
            { order: 1, phase: 'body', sourceAssetId: 'EV1', sourceIn: 9, sourceOut: 13, voice: 'Bật máy hút chân không ngay', text: 'BẬT MÁY' }
        ] }, lib, {}, 3, {});
        const sg = planned.segments[0];
        assert.ok(inAnyEvent(evClip, sg.sourceIn, sg.sourceOut),
            `cắt ${sg.sourceIn}-${sg.sourceOut}s phải nằm trong đoạn có mô tả`);
        assert.ok(Math.abs(sg.sourceIn - 9) < 0.51,
            `lời bình viết cho mốc 9s mà cắt ở ${sg.sourceIn}s ⇒ hình một kiểu, tiếng một kiểu`);
    });

    await reporter.test(E, 'Tier 2: prompt gửi kèm mốc cắt chính xác cho từng phân cảnh', async () => {
        assert.ok(/sourceIn:\s*f\.sourceIn/.test(timelineGen) && /sourceOut:\s*f\.sourceOut/.test(timelineGen),
            'payload footage phải gửi sourceIn/sourceOut để AI biết đoạn nào sẽ chiếu');
    });

    await reporter.test(E, 'Tier 2: prompt CẤM đổi mốc cắt đã giao', async () => {
        assert.ok(/MUST NOT change .{0,40}sourceIn|KHÔNG ĐƯỢC.{0,60}sourceIn/i.test(timelineGen),
            'prompt phải cấm model tự đổi sourceIn/sourceOut — đổi là lời bình lệch khỏi hình');
    });

    await reporter.test(E, 'Tier 2: kho gửi cho model phải đủ mô tả, không chỉ 3 đoạn đầu', async () => {
        assert.ok(ASSET_EVENTS_IN_PROMPT >= 8,
            `clip 60s có tới 32 đoạn — gửi ${ASSET_EVENTS_IN_PROMPT} đoạn là quá ít để AI viết đúng hình`);
        assert.ok(!/\(a\.descriptionIndex \|\| \[\]\)\.slice\(0, 3\)/.test(timelineGen),
            'không được cắt cứng 3 đoạn như trước');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ĐỢT F — XOÁ CLIP KHỎI KHO & TẢI LÊN NHÓM NGUYÊN LIỆU
    //
    // Lỗi user báo: bấm "Xoá" 2 clip trong kho nhưng chúng không chịu mất.
    // Nguyên nhân đo được: deleteAsset CHỈ bỏ bản ghi, KHÔNG xoá file. File vẫn nằm
    // trong kho/ nên scanLibrary lần sau index lại với asset_id MỚI ⇒ clip sống lại.
    // Bằng chứng: bp_1789717774756_ea3c0131_hook.mp4 từ VID_72ad56e4eb -> VID_37c63d5274.
    // ═══════════════════════════════════════════════════════════════════════
    const KHO_ROOT = path.resolve('kho');
    const inKhoAsset = {
        asset_id: 'VID_inkho', category: 'hook',
        path: path.join(KHO_ROOT, 'hook', 'clip-trong-kho.mp4'), filename: 'clip-trong-kho.mp4'
    };
    const outsideAsset = {
        asset_id: 'VID_ngoai', category: 'reference',
        path: path.resolve('video_studio_references', 'clip-ngoai-kho.mp4'), filename: 'clip-ngoai-kho.mp4'
    };

    await reporter.test(F, 'Tier 1: clip TRONG kho ⇒ xoá cả bản ghi lẫn file (nếu không sẽ sống lại)', async () => {
        const plan = planAssetDeletion(inKhoAsset, { libraryRoot: KHO_ROOT, projects: [] });
        assert.strictEqual(plan.removeRecord, true, 'phải bỏ bản ghi');
        assert.strictEqual(plan.removeFile, true,
            'phải xoá cả file — để lại file thì lần quét kho sau nó tự index lại với id mới');
    });

    await reporter.test(F, 'Tier 1: clip NGOÀI kho ⇒ chỉ bỏ bản ghi, giữ file', async () => {
        const plan = planAssetDeletion(outsideAsset, { libraryRoot: KHO_ROOT, projects: [] });
        assert.strictEqual(plan.removeRecord, true);
        assert.strictEqual(plan.removeFile, false,
            'file ngoài kho thuộc thư mục dự án — xoá là phá project, mà quét kho cũng không index lại');
    });

    await reporter.test(F, 'Tier 1: clip đang được 1 project dùng ⇒ CHẶN, nói rõ project nào', async () => {
        const plan = planAssetDeletion(inKhoAsset, {
            libraryRoot: KHO_ROOT,
            projects: [{ id: 'p1', name: 'Dự án A', hookVideoPath: inKhoAsset.path }]
        });
        assert.strictEqual(plan.removeFile, false, 'không được xoá file đang dùng');
        assert.strictEqual(plan.removeRecord, false, 'chặn hẳn, đừng xoá nửa vời rồi để nó sống lại');
        assert.strictEqual(plan.code, 'ASSET_IN_USE');
        assert.ok((plan.usedBy || []).some(u => u.name === 'Dự án A'),
            'phải kể tên project đang dùng để user biết vì sao bị chặn');
    });

    await reporter.test(F, 'Tier 1: nhận diện cả trường hợp project dùng làm video đối thủ', async () => {
        const plan = planAssetDeletion(inKhoAsset, {
            libraryRoot: KHO_ROOT,
            projects: [{ id: 'p2', name: 'Dự án B', referenceVideoPath: inKhoAsset.path }]
        });
        assert.strictEqual(plan.code, 'ASSET_IN_USE');
    });

    await reporter.test(F, 'Tier 1: input rác không làm vỡ', async () => {
        assert.strictEqual(planAssetDeletion(null, { libraryRoot: KHO_ROOT }).removeRecord, false);
        assert.strictEqual(planAssetDeletion({ asset_id: 'x' }, {}).removeFile, false,
            'không rõ thư mục kho thì tuyệt đối không xoá file');
    });

    await reporter.test(F, 'Tier 2: route DELETE dùng planAssetDeletion và xoá file thật', async () => {
        assert.ok(studioIndex.includes('planAssetDeletion'),
            'route DELETE /library/assets/:id phải đi qua planAssetDeletion');
        assert.ok(/ASSET_IN_USE/.test(studioIndex),
            'phải trả mã ASSET_IN_USE khi clip đang được project dùng');
    });

    await reporter.test(F, 'Tier 3: giao diện KHÔNG còn hứa "không xoá file gốc"', async () => {
        assert.ok(!/không xoá file gốc/i.test(v2vJs),
            'câu xác nhận cũ nói sai sự thật — clip trong kho nay bị xoá cả file');
    });

    // ── Tải lên nhóm Nguyên liệu ──────────────────────────────────────────
    await reporter.test(F, 'Tier 1: upload cho phép ĐỦ 3 nhóm, có Nguyên liệu', async () => {
        assert.deepStrictEqual(UPLOAD_CATEGORIES.slice().sort(), ['hook', 'material', 'reference'],
            'phải cho tải lên cả nhóm Nguyên liệu, không chỉ ref/hook');
    });

    await reporter.test(F, 'Tier 2: route upload dùng chung UPLOAD_CATEGORIES của library.js', async () => {
        assert.ok(/UPLOAD_CATEGORIES/.test(studioIndex), 'index.js phải dùng UPLOAD_CATEGORIES');
        assert.ok(!/const UPLOAD_CATEGORIES = \['reference', 'hook'\]/.test(studioIndex),
            'không được khai báo lại danh sách 2 nhóm trong index.js');
    });

    // ── Dọn bản ghi mồ côi khi quét kho ───────────────────────────────────
    // Hai clip user không xoá được đều ở trạng thái này: file đã mất khỏi kho/hook/
    // nhưng bản ghi vẫn nằm trong store, nên giao diện cứ hiện mãi.
    await reporter.test(F, 'Tier 1: quét kho DỌN bản ghi có file đã mất trong kho', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2v-prune-'));
        const real = path.join(tmpRoot, 'con-ton-tai.mp4');
        fs.writeFileSync(real, 'x');

        const assets = [
            { asset_id: 'A_ok', path: real, filename: 'con-ton-tai.mp4', file_hash: 'zzz', category: 'material' },
            { asset_id: 'A_mat', path: path.join(tmpRoot, 'da-bi-xoa.mp4'), filename: 'da-bi-xoa.mp4', file_hash: 'yyy', category: 'material' }
        ];
        const store = {
            listAssets: () => assets.slice(),
            upsertAsset: (d) => {
                const i = assets.findIndex(a => a.path === d.path);
                if (i === -1) assets.push({ ...d }); else assets[i] = { ...assets[i], ...d };
            },
            deleteAsset: (id) => {
                const i = assets.findIndex(a => a.asset_id === id);
                if (i === -1) return false;
                assets.splice(i, 1);
                return true;
            }
        };
        const res = await scanLibrary(tmpRoot, store, {
            probeFn: async () => ({ duration: 5, width: 720, height: 1280, fps: 30, codec: 'h264', file_size: 1 })
        });
        assert.strictEqual(res.removed, 1, `phải dọn 1 bản ghi mồ côi, nhận ${res.removed}`);
        assert.ok(!assets.some(a => a.asset_id === 'A_mat'),
            'bản ghi trỏ tới file đã mất phải bị xoá, nếu không giao diện hiện clip không thể xoá');
        assert.ok(assets.some(a => a.asset_id === 'A_ok'), 'clip còn file thì phải giữ');
    });

    await reporter.test(F, 'Tier 1: KHÔNG dọn bản ghi có file nằm NGOÀI kho', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2v-prune2-'));
        const assets = [
            { asset_id: 'A_ngoai', path: path.resolve('video_studio_references', 'khong-co-that.mp4'), filename: 'x.mp4', file_hash: 'q', category: 'reference' }
        ];
        const store = {
            listAssets: () => assets.slice(),
            upsertAsset: () => {},
            deleteAsset: (id) => { const i = assets.findIndex(a => a.asset_id === id); if (i > -1) assets.splice(i, 1); return i > -1; }
        };
        const res = await scanLibrary(tmpRoot, store, { probeFn: async () => ({}) });
        assert.strictEqual(res.removed, 0, 'quét kho không được đụng tới clip ngoài kho');
        assert.strictEqual(assets.length, 1);
    });

    // ── Worker phân tích chạy song song ───────────────────────────────────
    // Đo thật khi user nạp 237 clip: giao diện báo "5 luồng" nhưng CHỈ 1 clip chạy,
    // 4 clip còn lại đứng im ở 'starting 0%' suốt 60-206 giây. Nguyên nhân: worker.py
    // chỉ tạo ĐÚNG MỘT task tiêu thụ hàng đợi ("processing video jobs sequentially").
    // Thông lượng đo được: 1 clip / 43-60 giây.
    await reporter.test(F, 'Tier 2: worker Python chạy NHIỀU luồng, không tuần tự 1 luồng', async () => {
        const workerPy = read(`${ANALYZER}/video_analyzer/worker.py`);
        assert.ok(/worker_concurrency/.test(workerPy),
            'worker.py phải đọc số luồng từ cấu hình, không hardcode 1');
        assert.ok(/_worker_tasks/.test(workerPy),
            'phải giữ DANH SÁCH task tiêu thụ để còn huỷ khi tắt, không phải 1 task đơn');
        assert.ok(!/self\._worker_task = asyncio\.create_task\(self\._process_queue\(\)\)/.test(workerPy),
            'vẫn còn dòng tạo đúng 1 task — 4 luồng kia sẽ tiếp tục đứng im');
    });

    await reporter.test(F, 'Tier 2: số luồng cấu hình được, mặc định 5', async () => {
        const cfgPy = read(`${ANALYZER}/video_analyzer/config.py`);
        const m = cfgPy.match(/worker_concurrency:\s*int\s*=\s*Field\(\s*default=(\d+)/);
        assert.ok(m, 'config.py phải khai báo worker_concurrency');
        assert.strictEqual(Number(m[1]), 5, `user chốt 5 luồng, nhận ${m && m[1]}`);
    });

    // ── Chọn nhóm ngay tại nút Tải lên (popover) ──────────────────────────
    // User: bộ chọn nhóm nằm tít bên thanh lọc, cách nút Tải lên quá xa, nhìn xấu.
    // Chuyển thành panel nhỏ bật ra ngay dưới nút khi bấm.
    // ── Bộ lọc Nhóm & Trạng thái thành nút bấm, dời lên cùng hàng nút Tải lên ──
    // ── Thanh tiến độ AI tràn ra ngoài khung thư viện ─────────────────────
    // Đo thật: #v2v-library-ai-progress rộng 1659px trong khi #v2v-library chỉ 985px
    // -> tràn 674px. Hai nguyên nhân: (a) cột cha là flex item để min-width:auto nên
    // KHÔNG co được dưới bề rộng nội dung, (b) đổi 1->5 luồng làm dòng "Đang xử lý
    // song song" liệt kê 3 tên file dài ~85 ký tự.
    await reporter.test(F, 'Tier 3: cột trái của thanh công cụ co được (min-width:0)', async () => {
        const v2vCss = read('public/studio/video-to-video.css');
        assert.ok(/v2v-lib-toolbar-left/.test(v2vHtml),
            'cột trái phải có class riêng để CSS chỉnh được, không chỉ style inline');
        assert.ok(/\.v2v-lib-toolbar-left[^}]*min-width:\s*0/.test(v2vCss),
            'thiếu min-width:0 -> flex item phình theo nội dung và tràn khỏi khung');
    });

    await reporter.test(F, 'Tier 3: thanh tiến độ không vượt quá bề ngang cột chứa nó', async () => {
        const v2vCss = read('public/studio/video-to-video.css');
        assert.ok(/\.v2v-library-ai-progress[^}]*max-width:\s*100%/.test(v2vCss),
            'thanh tiến độ phải bị chặn max-width:100%');
        assert.ok(!/\.v2v-library-ai-progress\s*\{[^}]*min-width:\s*320px/.test(v2vCss),
            'min-width 320px cứng ngăn không cho co lại trên khung hẹp');
    });

    await reporter.test(F, 'Tier 3: tên file trong dòng tiến độ được rút gọn', async () => {
        assert.ok(/shortAssetName/.test(v2vJs),
            'phải rút gọn tên file — tên thật dài ~85 ký tự, 3 cái là tràn dòng');
        // BẪY ĐÃ DÍNH: .map(shortAssetName) truyền cả CHỈ SỐ làm tham số thứ 2 nên
        // max thành 0 rồi 1 -> tên đầu chỉ mất 1 ký tự, tên sau còn mỗi dấu "…".
        assert.ok(!/\.map\(shortAssetName\)/.test(v2vJs),
            'phải gọi tường minh (n => shortAssetName(n)), không truyền thẳng vào .map');
    });

    await reporter.test(F, 'Tier 3: bộ lọc Nhóm & Trạng thái là nút bấm có panel', async () => {
        for (const id of ['v2v-filter-cat-btn', 'v2v-filter-cat-menu',
                          'v2v-filter-status-btn', 'v2v-filter-status-menu']) {
            assert.ok(v2vHtml.includes(id), `HTML thiếu #${id}`);
        }
    });

    await reporter.test(F, 'Tier 3: 2 nút lọc nằm CÙNG HÀNG với nút Tải lên, không ở thanh lọc', async () => {
        const iCat = v2vHtml.indexOf('v2v-filter-cat-btn');
        const iStatus = v2vHtml.indexOf('v2v-filter-status-btn');
        const iFilters = v2vHtml.indexOf('v2v-lib-filters');
        assert.ok(iCat > -1 && iCat < iFilters, 'nút lọc Nhóm phải nằm TRƯỚC thanh lọc (tức cùng hàng nút Tải lên)');
        assert.ok(iStatus > -1 && iStatus < iFilters, 'nút lọc Trạng thái phải nằm TRƯỚC thanh lọc');
    });

    await reporter.test(F, 'Tier 3: hàng lọc chỉ còn ô tìm kiếm và "Mỗi trang"', async () => {
        const row = v2vHtml.slice(v2vHtml.indexOf('v2v-lib-filters'));
        const end = row.indexOf('v2v-asset-grid');
        const seg = end > -1 ? row.slice(0, end) : row;
        assert.ok(seg.includes('v2v-library-search'), 'phải giữ ô tìm kiếm');
        assert.ok(seg.includes('v2v-library-pagesize'), 'phải giữ bộ chọn Mỗi trang');
        assert.ok(!seg.includes('v2v-library-category-filter'), 'select Nhóm không được nằm lại ở hàng lọc');
        assert.ok(!seg.includes('v2v-library-status-filter'), 'select Trạng thái không được nằm lại ở hàng lọc');
    });

    await reporter.test(F, 'Tier 3: GIỮ NGUYÊN 2 select làm nơi lưu trạng thái (không mất tác dụng)', async () => {
        assert.ok(v2vHtml.includes('id="v2v-library-category-filter"'),
            'vẫn phải còn select Nhóm — updateCategoryFilterOptions() và chip lọc nhanh ghi vào đây');
        assert.ok(v2vHtml.includes('id="v2v-library-status-filter"'), 'vẫn phải còn select Trạng thái');
        for (const v of ['all', 'described', 'undescribed']) {
            assert.ok(new RegExp(`value="${v}"`).test(v2vHtml), `mất lựa chọn trạng thái "${v}"`);
        }
    });

    await reporter.test(F, 'Tier 3: JS đồng bộ nhãn nút với giá trị select đang chọn', async () => {
        assert.ok(/wireSelectPopover/.test(v2vJs), 'JS phải có wireSelectPopover dùng chung cho 2 bộ lọc');
        assert.ok(/syncFilterButtonLabels/.test(v2vJs),
            'phải có hàm đồng bộ nhãn — chip lọc nhanh đổi select thì nhãn nút cũng phải đổi theo');
    });

    await reporter.test(F, 'Tier 3: bấm Tải lên hiện panel 3 nhóm ngay tại nút', async () => {
        assert.ok(v2vHtml.includes('v2v-upload-menu'),
            'HTML phải có panel #v2v-upload-menu neo vào nút tải lên');
        for (const c of ['material', 'reference', 'hook']) {
            assert.ok(new RegExp(`data-cat="${c}"`).test(v2vHtml),
                `panel thiếu lựa chọn nhóm "${c}"`);
        }
    });

    await reporter.test(F, 'Tier 3: bộ chọn nhóm KHÔNG còn nằm ở thanh lọc', async () => {
        assert.ok(!/v2v-upload-cat-wrap/.test(v2vHtml),
            'khối "Tải lên vào:" ở thanh lọc phải bỏ đi — nó nằm quá xa nút Tải lên');
    });

    await reporter.test(F, 'Tier 3: JS mở/đóng panel và chọn nhóm rồi mới mở hộp chọn file', async () => {
        assert.ok(/v2v-upload-menu/.test(v2vJs), 'JS phải điều khiển panel #v2v-upload-menu');
        assert.ok(/data-cat|dataset\.cat/.test(v2vJs), 'JS phải đọc nhóm từ data-cat của lựa chọn');
        assert.ok(!/uploadBtn\.addEventListener\('click', \(\) => \$\('v2v-upload-input'\)\.click\(\)\)/.test(v2vJs),
            'bấm Tải lên không được mở thẳng hộp chọn file nữa — phải hỏi nhóm trước');
    });

    await reporter.test(F, 'Tier 3: giao diện có option tải lên Nguyên liệu', async () => {
        assert.ok(/<option value="material"/.test(v2vHtml),
            'bộ chọn #v2v-upload-category phải có option material');
        assert.ok(/value="material"[^>]*selected|selected[^>]*value="material"/.test(v2vHtml),
            'Nguyên liệu nên là mặc định — đây là nhóm user nạp nhiều nhất');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ĐỢT G — BỘ ĐẾM TIẾN TRÌNH MÔ TẢ AI
    //
    // Lỗi user báo (kèm ảnh): thanh tiến độ hiện "5 AI đang phân tích kho video
    // (193/181 clip)" — done VƯỢT total. Một vòng chạy đơn lẻ không thể vượt được
    // vì nó lặp trên mảng cố định, nên con số đó CHỨNG MINH có 2 vòng cùng tăng
    // chung một object `_describeStats`:
    //   - vòng nền queueBackgroundDescribe()  (có khoá `_describing`)
    //   - nhánh batch của POST /library/describe (TRƯỚC ĐÂY KHÔNG CÓ KHOÁ)
    // Hệ quả thật: một số clip bị phân tích 2 lần (đốt 9Router) và có lúc 10 clip
    // chạy song song thay vì 5.
    // ═══════════════════════════════════════════════════════════════════════

    await reporter.test(G, 'Tier 1: done vượt total thì KẸP lại, nhưng phải bật cờ overflow', async () => {
        const v = describeProgressView({ total: 181, done: 193, active: true });
        assert.strictEqual(v.total, 181);
        assert.strictEqual(v.done, 181, 'UI không được hiện 193/181');
        assert.strictEqual(v.overflow, true,
            'kẹp số cho đẹp mắt là CHE lỗi — phải để lại cờ overflow thì mới còn thấy mà sửa');
    });

    await reporter.test(G, 'Tier 1: số bình thường đi qua nguyên vẹn', async () => {
        const v = describeProgressView({ total: 181, done: 12, active: true });
        assert.strictEqual(v.done, 12);
        assert.strictEqual(v.total, 181);
        assert.strictEqual(v.overflow, false);
    });

    await reporter.test(G, 'Tier 1: input rác không làm vỡ', async () => {
        for (const bad of [null, undefined, {}, { total: 'x', done: null }, { total: -5, done: -9 }]) {
            const v = describeProgressView(bad);
            assert.ok(Number.isFinite(v.total) && v.total >= 0, 'total phải là số không âm');
            assert.ok(Number.isFinite(v.done) && v.done >= 0, 'done phải là số không âm');
            assert.ok(v.done <= v.total, 'done không bao giờ được vượt total');
        }
    });

    await reporter.test(G, 'Tier 2: nhánh batch của /library/describe phải dùng CHUNG khoá với vòng nền', async () => {
        assert.ok(/DESCRIBE_IN_PROGRESS/.test(studioIndex),
            'đang có vòng nền chạy thì route batch phải từ chối, không được mở vòng thứ hai ghi đè bộ đếm');
    });

    await reporter.test(G, 'Tier 2: chờ pool bằng allSettled, không để 1 luồng lỗi nhả khoá sớm', async () => {
        assert.ok(!/Promise\.all\(pool\)/.test(studioIndex),
            'Promise.all nhả khoá ngay khi MỘT luồng lỗi trong khi 4 luồng kia còn sống — ' +
            'vòng sau vào được và lại ghi đè bộ đếm; phải dùng allSettled');
        assert.ok(/Promise\.allSettled\(pool\)/.test(studioIndex),
            'phải đợi hết mọi luồng rồi mới nhả khoá');
    });

    await reporter.test(G, 'Tier 2: route trả số đã qua describeProgressView', async () => {
        assert.ok(/describeProgressView/.test(studioIndex),
            'GET /analyze-progress phải đi qua hàm kẹp, đừng trả thẳng _describeStats');
    });

    await reporter.test(G, 'Tier 3: giao diện cũng kẹp done theo total', async () => {
        assert.ok(/Math\.min\(done, total\)/.test(v2vJs),
            'trước đây chỉ kẹp phần trăm (Math.min 100) mà quên kẹp phần chữ nên hiện 193/181');
    });

    // ── Thanh tiến độ phải TẮT khi không còn AI nào chạy ───────────────────
    // Ảnh user gửi: "5 AI đang phân tích kho video (181/181 clip)... 100%" đứng im,
    // trong khi kho đã 235/237 và không còn luồng nào chạy. Nguyên nhân: điều kiện hiện
    // thanh có vế `undescribedCount > 0 && đang hiện` — 2 clip lỗi giữa chừng không bao
    // giờ được mô tả lại, nên vế đó đúng MÃI MÃI và thanh không bao giờ tắt.
    await reporter.test(G, 'Tier 3: chỉ hiện "đang phân tích" khi THẬT SỰ có luồng chạy', async () => {
        assert.ok(/const running = !!\(active \|\| analyzingCount > 0\)/.test(v2vJs),
            'phải quyết định bằng trạng thái chạy thật, không được lấy "còn clip chưa mô tả" làm căn cứ');
        assert.ok(!/if \(active \|\| analyzingCount > 0 \|\| \(undescribedCount > 0/.test(v2vJs),
            'vế undescribedCount > 0 làm thanh đứng im vĩnh viễn khi có clip lỗi');
    });

    await reporter.test(G, 'Tier 3: hết luồng mà còn clip chưa mô tả thì phải nói ĐÃ DỪNG', async () => {
        assert.ok(/Đã dừng/.test(v2vJs),
            'để nguyên chữ "đang phân tích… 100%" khi không có gì chạy là nói dối người dùng');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ĐỢT H — VIDEO OUTPUT PHẢI CÓ ĐỦ MỌI PHÂN CẢNH
    //
    // Lỗi user báo: "video output nó cứ dừng lại ở phân cảnh". Đo 10 file thật của
    // project gtf_mu7s6owa_88814c: luồng HÌNH chỉ 4.1-4.9s còn luồng TIẾNG 22-24s
    // ⇒ player hết hình thì giữ khung cuối rồi chạy tiếp tiếng.
    //
    // Nguyên nhân (đã TÁI HIỆN được, không phải suy diễn): mốc `xfade` tính từ thời
    // lượng DỰ KIẾN, nhưng `trim` chỉ ra được đúng số frame clip gốc CÓ. Clip hook chỉ
    // 3.27s mà cảnh 1 dự kiến 4.0s ⇒ mốc xfade đầu tiên (3.65s) nằm quá cuối luồng hình,
    // cả chuỗi sập. Dựng lại bằng đúng 6 clip đó: 4.533333s / 136 frame — trùng khít file
    // thật. Kẹp về độ dài clip có thật rồi dựng lại: 22.57s / 677 frame, đủ 6 cảnh.
    //
    // Tiếng không bị vì mỗi đoạn voice có `apad=whole_dur` đệm cho đủ — hình thì không.
    // ═══════════════════════════════════════════════════════════════════════

    await reporter.test(H, 'Tier 1: clip ngắn hơn khung dự kiến ⇒ KẸP về độ dài thật', async () => {
        const r = resolveEffectiveSegmentDuration({ planned: 4.0, sourceDuration: 3.2667, start: 0 });
        assert.strictEqual(r.duration, 3.27, 'phải lấy đúng độ dài clip hook thật (3.27s)');
        assert.strictEqual(r.clamped, true, 'phải báo là đã kẹp để còn ghi log, đừng cắt im lặng');
    });

    await reporter.test(H, 'Tier 1: lệch nhỏ 0.02s cũng phải kẹp (cảnh 4 của project thật)', async () => {
        const r = resolveEffectiveSegmentDuration({ planned: 4.06, sourceDuration: 4.0417, start: 0 });
        assert.strictEqual(r.duration, 4.04, 'dôi 0.02s cũng đủ làm trượt mốc xfade');
        assert.strictEqual(r.clamped, true);
    });

    await reporter.test(H, 'Tier 1: clip đủ dài thì giữ nguyên khung dự kiến', async () => {
        const r = resolveEffectiveSegmentDuration({ planned: 4.5, sourceDuration: 6.0417, start: 0 });
        assert.strictEqual(r.duration, 4.5);
        assert.strictEqual(r.clamped, false);
    });

    await reporter.test(H, 'Tier 1: cắt từ giữa clip thì tính phần CÒN LẠI sau điểm bắt đầu', async () => {
        const r = resolveEffectiveSegmentDuration({ planned: 4.0, sourceDuration: 10, start: 8 });
        assert.strictEqual(r.duration, 2, 'từ giây 8 của clip 10s chỉ còn 2s');
        assert.strictEqual(r.clamped, true);
    });

    await reporter.test(H, 'Tier 1: sàn 1s theo luật mới, không bao giờ về 0', async () => {
        const r = resolveEffectiveSegmentDuration({ planned: 4.0, sourceDuration: 0.4, start: 0 });
        assert.strictEqual(r.duration, 1, 'kẹp tới sàn 1s, cảnh 0s làm vỡ filtergraph');
    });

    await reporter.test(H, 'Tier 1: KHÔNG đo được clip thì giữ khung dự kiến (đừng đoán)', async () => {
        for (const bad of [0, null, undefined, NaN, -3]) {
            const r = resolveEffectiveSegmentDuration({ planned: 4.5, sourceDuration: bad, start: 0 });
            assert.strictEqual(r.duration, 4.5, 'không đo được thì không được tự ý cắt ngắn');
            assert.strictEqual(r.clamped, false);
        }
    });

    await reporter.test(H, 'Tier 1: trần 5s vẫn giữ', async () => {
        const r = resolveEffectiveSegmentDuration({ planned: 9, sourceDuration: 30, start: 0 });
        assert.ok(r.duration <= 5, `cảnh ${r.duration}s vượt trần 5s`);
    });

    await reporter.test(H, 'Tier 2: assembler phải NẠP LẠI số đã kẹp vào mốc xfade', async () => {
        assert.ok(/resolveEffectiveSegmentDuration/.test(assemblerCode),
            'assembler phải đi qua hàm kẹp');
        assert.ok(/segmentDurations\[i\] = /.test(assemblerCode),
            'số đã kẹp phải ghi trở lại segmentDurations — mốc xfade lấy từ mảng này');
    });

    await reporter.test(H, 'Tier 2: đo độ dài clip bằng luồng VIDEO, không phải luồng audio', async () => {
        assert.ok(/getVideoDuration/.test(assemblerCode),
            'trước dùng hàm đo audio cho file video: clip không có audio trả 0, tắt luôn chốt an toàn');
        assert.ok(!/const fileDur = await getAudioDuration\(videoPath/.test(assemblerCode),
            'không được đo file video bằng hàm đo audio');
    });

    await reporter.test(H, 'Tier 2: kẹp thì phải GHI LOG, không cắt im lặng', async () => {
        assert.ok(/console\.warn/.test(assemblerCode),
            'cắt ngắn phân cảnh mà không nói gì là lỗi im lặng');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ĐỢT I — DỌN HAI CHỖ CÒN TỰ SINH SỐ SAI
    //
    // Đo trên project thật gtf_mu7s6owa_88814c:
    //   hookAnalysis.duration === undefined  (bộ phân tích KHÔNG ghi trường này)
    //   => clampHookDuration(undefined) trả về mặc định 4s
    //   => sourceOut: 4 cho clip hook chỉ dài 3.27s
    // Đây CHÍNH LÀ gốc rễ lỗi mất hình, không phải AI viết sai kịch bản.
    // Assembler đã kẹp ở bước dựng, nhưng lời bình vẫn bị viết cho 4s nên giọng
    // bị đẩy nhanh ~1.2x. Phải chặn ngay từ chỗ sinh số.
    //
    // Chỗ thứ hai: prompt vừa bắt "hook 1-5s TRẦN CỨNG" vừa còn dòng cũ
    // "Phân cảnh Hook dài (ví dụ 15s - 25s): viết 52 - 60 từ" — hai luật chỏi nhau.
    // ═══════════════════════════════════════════════════════════════════════

    await reporter.test(I, 'Tier 1: biết độ dài clip thì KHÔNG cửa sổ nào vượt clip', async () => {
        assert.strictEqual(clampHookDuration(4, { sourceDuration: 3.2667 }), 3.27,
            'clip 3.27s thì cửa sổ hook tối đa 3.27s');
        assert.strictEqual(clampHookDuration(undefined, { sourceDuration: 3.2667 }), 3.27,
            'KHÔNG biết độ dài phân tích vẫn phải bám clip thật, đừng lấy mặc định 4s');
        assert.strictEqual(clampHookDuration(34, { sourceDuration: 3.2667 }), 3.27,
            'clip ngắn thì trần 5s không còn nghĩa lý');
    });

    await reporter.test(I, 'Tier 1: clip dài thì giữ nguyên luật 1-5s', async () => {
        assert.strictEqual(clampHookDuration(4.5, { sourceDuration: 30 }), 4.5);
        assert.strictEqual(clampHookDuration(34, { sourceDuration: 30 }), 5, 'vẫn kẹp trần 5s');
        assert.strictEqual(clampHookDuration(undefined, { sourceDuration: 30 }), 4,
            'clip đủ dài mà không rõ số ⇒ mặc định 4s là hợp lý');
    });

    await reporter.test(I, 'Tier 1: không biết clip thì giữ hành vi cũ', async () => {
        assert.strictEqual(clampHookDuration(4.5), 4.5);
        assert.strictEqual(clampHookDuration(undefined), 4);
        for (const bad of [0, null, NaN, -9, 'x']) {
            assert.strictEqual(clampHookDuration(4, { sourceDuration: bad }), 4,
                'không đo được clip thì không được tự ý cắt ngắn hook');
        }
    });

    await reporter.test(I, 'Tier 1: sàn 1s vẫn được tôn trọng khi clip cực ngắn', async () => {
        assert.strictEqual(clampHookDuration(4, { sourceDuration: 0.3 }), 1,
            'cửa sổ 0.3s làm vỡ filtergraph — phải về sàn 1s');
    });

    await reporter.test(I, 'Tier 2: route sinh kịch bản phải ĐO clip hook thật', async () => {
        assert.ok(/sourceDuration/.test(studioIndex),
            'hookContext.hookDuration phải truyền độ dài clip hook đo được');
        assert.ok(!/hookDuration: clampHookDuration\(hookAnalysis && hookAnalysis\.duration\),/.test(studioIndex),
            'bản cũ chỉ dựa vào hookAnalysis.duration — trường này THỰC TẾ không tồn tại');
    });

    await reporter.test(I, 'Tier 2: prompt KHÔNG còn dòng "hook dài 15-25s" chỏi luật 1-5s', async () => {
        assert.ok(!/Hook dài \(ví dụ 15s - 25s\)/.test(timelineGen),
            'dòng này bắt model viết 52-60 từ cho hook, chỏi thẳng trần cứng 5s ngay phía trên');
        assert.ok(!/52 - 60 từ/.test(timelineGen),
            'ngân sách 52-60 từ chỉ đúng cho hook 23s của thiết kế cũ');
    });

    await reporter.test(I, 'Tier 2: prompt có ngân sách từ cho cảnh ngắn 1-2s', async () => {
        assert.ok(/Phân cảnh 1\.0s/.test(timelineGen),
            'luật mới cho cảnh ngắn tới 1s thì prompt phải nói viết bao nhiêu từ');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ĐỢT J — SỬA ĐƯỢC MỌI KỊCH BẢN BIẾN THỂ (step 4)
    //
    // Yêu cầu user: bấm card kịch bản nào thì đẩy chi tiết kịch bản đó lên bảng sửa,
    // thay vì chỉ sửa được kịch bản đầu tiên.
    //
    // Khi mở code ra thì thấy chuyện nặng hơn: bảng sửa ĐANG VÔ TÁC DỤNG.
    // PUT /projects/:id/timeline chỉ ghi `productionTimeline`, còn /assemble lại dựng từ
    // `batchTimelines` — hễ có biến thể là `productionTimeline` bị bỏ qua. Nghĩa là user
    // sửa, bấm Lưu, rồi render vẫn ra kịch bản cũ. Sửa xong phải ghi vào ĐÚNG biến thể.
    // ═══════════════════════════════════════════════════════════════════════

    const _prjBatch = {
        id: 'P1',
        batchTimelines: [
            { index: 1, segments: [{ order: 1 }] },
            { index: 2, segments: [{ order: 1 }] },
            { index: 3, segments: [{ order: 1 }] }
        ]
    };

    await reporter.test(J, 'Tier 1: chỉ đúng biến thể được chọn bị ghi', async () => {
        const t = resolveTimelineEditTarget(_prjBatch, 2);
        assert.strictEqual(t.scope, 'variant');
        assert.strictEqual(t.index, 2, 'phải trỏ đúng biến thể #3 (index 2)');
        assert.strictEqual(t.total, 3);
    });

    await reporter.test(J, 'Tier 1: biến thể đầu vẫn sửa được như cũ', async () => {
        const t = resolveTimelineEditTarget(_prjBatch, 0);
        assert.strictEqual(t.scope, 'variant');
        assert.strictEqual(t.index, 0);
    });

    await reporter.test(J, 'Tier 1: client cũ KHÔNG gửi index ⇒ về biến thể đầu, KHÔNG rơi vào productionTimeline', async () => {
        for (const bad of [undefined, null, '', NaN, -1, 99, 1.5, 'x', {}]) {
            const t = resolveTimelineEditTarget(_prjBatch, bad);
            assert.strictEqual(t.scope, 'variant',
                `index ${String(bad)} phải vẫn ghi vào biến thể, nếu rơi về productionTimeline là mất dữ liệu lúc dựng`);
            assert.strictEqual(t.index, 0, 'index không dùng được thì lấy biến thể đầu — đúng cái bảng đang hiện');
        }
    });

    await reporter.test(J, 'Tier 1: project KHÔNG có biến thể ⇒ giữ đường cũ', async () => {
        for (const prj of [{ id: 'P2' }, { id: 'P3', batchTimelines: [] }, { id: 'P4', batchTimelines: null }]) {
            const t = resolveTimelineEditTarget(prj, 0);
            assert.strictEqual(t.scope, 'single', 'chưa có biến thể thì vẫn lưu vào productionTimeline');
            assert.strictEqual(t.total, 0);
        }
    });

    await reporter.test(J, 'Tier 1: input rác không làm vỡ', async () => {
        for (const prj of [null, undefined, 'x', 42]) {
            const t = resolveTimelineEditTarget(prj, 0);
            assert.strictEqual(t.scope, 'single');
        }
    });

    await reporter.test(J, 'Tier 2: route PUT timeline phải ghi vào batchTimelines', async () => {
        assert.ok(/resolveTimelineEditTarget/.test(studioIndex),
            'route phải đi qua hàm chọn đích, đừng ghi thẳng productionTimeline');
        assert.ok(/batchTimelines:/.test(studioIndex),
            'phải cập nhật batchTimelines — /assemble dựng từ mảng này');
    });

    await reporter.test(J, 'Tier 3: card kịch bản phải bấm được và có chỉ số biến thể', async () => {
        assert.ok(/data-variant-idx/.test(v2vJs),
            'mỗi card cần mang chỉ số biến thể để biết bấm vào cái nào');
        assert.ok(/is-editing/.test(v2vJs),
            'phải đánh dấu card đang được sửa, không thì user không biết mình đang sửa kịch bản nào');
    });

    await reporter.test(J, 'Tier 3: bàn phím cũng dùng được (không chỉ chuột)', async () => {
        assert.ok(/role="button"/.test(v2vJs), 'card bấm được thì phải khai báo role');
        assert.ok(/'Enter'|"Enter"/.test(v2vJs), 'phải xử lý Enter/Space cho người dùng bàn phím');
    });

    await reporter.test(J, 'Tier 3: bảng sửa nạp từ biến thể đang chọn', async () => {
        assert.ok(/activeVariantIndex/.test(v2vJs),
            'cần state ghi nhớ biến thể đang sửa');
        assert.ok(/variantIndex/.test(v2vJs),
            'lúc lưu phải gửi variantIndex lên server');
    });

    await reporter.test(J, 'Tier 3: có chỗ hiện đang sửa biến thể nào', async () => {
        assert.ok(/v2v-timeline-variant/.test(v2vHtml),
            'đầu bảng sửa phải nói rõ đang sửa Video #N');
    });
}

export default { runPipelineAbcTests };
