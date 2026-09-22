/**
 * tests/render_polish.test.js
 *
 * TDD cho 3 vấn đề hoàn thiện trước release (yêu cầu user 2026-09-18):
 *  1. Step 5 (Dựng video) — bấm sang step khác rồi quay lại vẫn XEM ĐƯỢC tiến độ/kết quả.
 *  2. Phụ đề trong video — BỎ nền đen (nhìn xấu), chữ hạ xuống thấp hơn.
 *  3. Voice/Text KHÔNG bị cắt cụt tiêu cực — nới thời lượng phân cảnh cho vừa lời bình,
 *     chỉ cắt khi thật sự hết chỗ (clip quá ngắn).
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
    fitSegmentDurationToVoice,
    enforceVoiceDurationConstraint,
    fitVoiceToWords,
    planOutputBudget,
    selectFootageSequence,
    extractProductKeywords,
    scoreAssetRelevance,
    VOICE_WORDS_PER_SEC
} from '../byteplus/video_studio/timeline_generator.js';
import { SUBTITLE_STYLE, SUBTITLE_Y_RATIO, SUBTITLE_BACKDROP, resolveSegmentDuration } from '../byteplus/video_studio/assembler.js';
import { runWithRetry, estimateWordTimings } from '../byteplus/video_studio/voice_generator.js';

const S1 = 'Step 5 Revisit — Xem lại tiến độ/kết quả dựng';
const S2 = 'Subtitle Style — Bỏ nền đen & hạ chữ xuống thấp';
const S3 = 'Scene Fits Voice — Không cắt cụt lời bình';
const S4 = 'Output Budget — Trần 1 phút, thân bài & kết bài dài hơn';
const S5 = 'Voice Reliability — Hết câm tiếng & chết tiếng cuối cảnh';

export async function runRenderPolishTests(reporter) {
    const v2vJs = fs.readFileSync(path.resolve('public/studio/video-to-video.js'), 'utf8');
    const assembler = fs.readFileSync(path.resolve('byteplus/video_studio/assembler.js'), 'utf8');
    const timelineGen = fs.readFileSync(path.resolve('byteplus/video_studio/timeline_generator.js'), 'utf8');

    // ─────────────────────────────────────────────────────────────
    //  NHÓM 1 — Step 5 xem lại được sau khi bấm sang step khác
    // ─────────────────────────────────────────────────────────────
    await reporter.test(S1, 'Tier 1: renderBatchRenderPanel KHÔNG return sớm làm mất hasData', () => {
        // Bug cũ: status !== 'assembling' → panel.hidden = true; return; TRƯỚC khi set hasData='1'
        // ⇒ showStepPanels(5) luôn ẩn panel ⇒ bấm lại step 5 thấy trống.
        const fnStart = v2vJs.indexOf('function renderBatchRenderPanel(');
        assert.ok(fnStart > 0, 'phải có hàm renderBatchRenderPanel');
        const fnBody = v2vJs.slice(fnStart, fnStart + 2600);
        assert.ok(
            !/status\s*!==\s*'assembling'\)\s*\{\s*\n\s*panel\.hidden\s*=\s*true;\s*\n\s*stopRenderProgressPolling\(\);\s*\n\s*return;/.test(fnBody),
            'không được return sớm khi status !== assembling (mất hasData ⇒ không xem lại được step 5)'
        );
    });

    await reporter.test(S1, 'Tier 1: render xong vẫn dựng snapshot kết quả (hasData=1, không poll)', () => {
        const fnStart = v2vJs.indexOf('function renderBatchRenderPanel(');
        const fnBody = v2vJs.slice(fnStart, fnStart + 2600);
        assert.ok(/hasRenderData|renderSnapshot|isAssembling/.test(fnBody),
            'phải phân nhánh trạng thái (đang dựng vs đã dựng xong) thay vì return sớm');
        assert.ok(/stopRenderProgressPolling\(\)/.test(fnBody),
            'khi không còn dựng phải dừng polling');
    });

    await reporter.test(S1, 'Tier 2: step 5 vẫn nằm trong STEP_PANELS và stepper cho bấm lại', () => {
        assert.ok(/5:\s*\['v2v-batch-render-panel'\]/.test(v2vJs), 'STEP_PANELS[5] phải trỏ panel dựng');
        assert.ok(v2vJs.includes('if (clickedStep > statusMeta.step) return;'),
            'chỉ chặn step CHƯA tới, không chặn step đã hoàn thành');
    });

    // ─────────────────────────────────────────────────────────────
    //  NHÓM 2 — Phụ đề: bỏ nền đen, hạ xuống thấp
    // ─────────────────────────────────────────────────────────────
    // User chốt lại: GIỮ nền đen (còn nhiệm vụ che phụ đề cháy sẵn trong clip kho) nhưng GIẢM CƯỜNG ĐỘ.
    await reporter.test(S2, 'Tier 1: vẫn có dải nền che phụ đề cũ, nhưng KHÔNG còn đen đặc', () => {
        assert.ok(/^drawbox=/.test(SUBTITLE_BACKDROP), 'phải có dải drawbox che phụ đề cũ');
        const m = SUBTITLE_BACKDROP.match(/color=black@([0-9.]+)/);
        assert.ok(m, `drawbox phải là nền đen có độ trong, nhận "${SUBTITLE_BACKDROP}"`);
        const alpha = Number(m[1]);
        assert.ok(alpha < 0.8, `phải nhẹ hơn mức đen đặc cũ 0.92, nhận ${alpha}`);
        assert.ok(alpha >= 0.3, `vẫn phải đủ đậm để che phụ đề cũ, nhận ${alpha}`);
    });

    await reporter.test(S2, 'Tier 1: dải nền bám đúng vị trí chữ đã hạ xuống', () => {
        assert.ok(SUBTITLE_BACKDROP.includes(`y=ih*${SUBTITLE_Y_RATIO}-`),
            `dải nền phải căn theo SUBTITLE_Y_RATIO=${SUBTITLE_Y_RATIO}, nhận "${SUBTITLE_BACKDROP}"`);
        assert.ok(assembler.includes('vFilters.push(SUBTITLE_BACKDROP)'),
            'assembler phải chèn dải nền khi có phụ đề');
    });

    await reporter.test(S2, 'Tier 2: cường độ nền chỉnh được qua V2V_SUBTITLE_BG_ALPHA', () => {
        assert.ok(/V2V_SUBTITLE_BG_ALPHA/.test(assembler), 'phải đọc env V2V_SUBTITLE_BG_ALPHA');
    });

    await reporter.test(S2, 'Tier 1: drawtext KHÔNG dùng box đen (box=1/boxcolor)', () => {
        assert.ok(!/box=1/.test(SUBTITLE_STYLE), 'không được bật hộp nền đen nữa');
        assert.ok(!/boxcolor/.test(SUBTITLE_STYLE), 'không còn boxcolor');
        assert.ok(!/box=1:boxcolor=black/.test(assembler), 'không còn drawtext nền đen sót lại');
    });

    await reporter.test(S2, 'Tier 1: chữ vẫn đọc rõ nhờ viền + đổ bóng', () => {
        assert.ok(/borderw=\d/.test(SUBTITLE_STYLE), 'phải có borderw (viền chữ) thay cho nền đen');
        assert.ok(/bordercolor=black/.test(SUBTITLE_STYLE), 'viền màu đen để nổi trên nền sáng');
        assert.ok(/shadowcolor=black/.test(SUBTITLE_STYLE) && /shadowx=/.test(SUBTITLE_STYLE),
            'phải có đổ bóng (shadow) tăng độ tương phản');
    });

    await reporter.test(S2, 'Tier 2: phụ đề hạ xuống thấp hơn (y >= h*0.78)', () => {
        assert.ok(SUBTITLE_Y_RATIO >= 0.78, `phụ đề phải hạ thấp hơn (>=0.78), nhận ${SUBTITLE_Y_RATIO}`);
        const m = SUBTITLE_STYLE.match(/y=h\*([0-9.]+)-text_h\/2/);
        assert.ok(m, `style phải đặt y theo tỉ lệ chiều cao, nhận "${SUBTITLE_STYLE}"`);
        assert.ok(Number(m[1]) >= 0.78, `y phải >= 0.78, nhận ${m[1]}`);
    });

    await reporter.test(S2, 'Tier 2: cả 2 nhánh phụ đề (word-reveal + tĩnh) dùng chung 1 style', () => {
        const uses = (assembler.match(/drawtext=\$\{fontFilterParam\}textfile='\$\{escapedTxtPath\}':\$\{SUBTITLE_STYLE\}/g) || []).length;
        assert.strictEqual(uses, 2, `cả 2 chỗ drawtext phải dùng SUBTITLE_STYLE, nhận ${uses}`);
    });

    // ─────────────────────────────────────────────────────────────
    //  NHÓM 3 — Nới phân cảnh cho vừa voice thay vì cắt cụt
    // ─────────────────────────────────────────────────────────────
    await reporter.test(S3, 'Tier 1: voice dài hơn phân cảnh + clip còn dư → NỚI thời lượng', () => {
        // 15 từ ≈ 15/3.8 + 0.35 ≈ 4.3s (tốc độ đọc ĐO THẬT), phân cảnh mới 3s, clip dài 12s → phải nới
        const seg = {
            sourceIn: 0, sourceOut: 3, clipDuration: 12,
            voice: 'Chiếc máy hút chân không mini này giúp vali của bạn gọn gàng hơn nhiều'
        };
        const dur = fitSegmentDurationToVoice(seg);
        assert.ok(dur > 3, `phải nới dài hơn 3s, nhận ${dur}`);
        const need = 15 / VOICE_WORDS_PER_SEC;
        assert.ok(dur >= need, `phải đủ chỗ cho 15 từ (>=${need.toFixed(2)}s), nhận ${dur}`);
    });

    await reporter.test(S3, 'Tier 1: không nới vượt quá độ dài clip thật', () => {
        const seg = {
            sourceIn: 1, sourceOut: 3, clipDuration: 4, // chỉ còn 3s kể từ sourceIn
            voice: 'Chiếc máy hút chân không mini này giúp vali của bạn gọn gàng hơn nhiều'
        };
        const dur = fitSegmentDurationToVoice(seg);
        assert.ok(dur <= 3.001, `không được vượt phần clip còn lại (3s), nhận ${dur}`);
    });

    await reporter.test(S3, 'Tier 1: voice đã vừa → giữ nguyên thời lượng', () => {
        const seg = { sourceIn: 0, sourceOut: 4, clipDuration: 10, voice: 'Gọn gàng tức thì.' };
        assert.strictEqual(fitSegmentDurationToVoice(seg), 4);
    });

    await reporter.test(S3, 'Tier 2: enforce — nới phân cảnh thì GIỮ TRỌN lời bình (không cắt)', () => {
        const voice = 'Chiếc máy hút chân không mini này giúp vali của bạn gọn gàng hơn nhiều';
        const tl = { segments: [{ sourceIn: 0, sourceOut: 3, clipDuration: 12, voice }] };
        const out = enforceVoiceDurationConstraint(tl);
        const seg = out.segments[0];
        assert.strictEqual(seg.voice.trim(), voice.trim(), 'lời bình phải được giữ nguyên, không bị cắt');
        assert.ok(seg.sourceOut > 3, `sourceOut phải được nới, nhận ${seg.sourceOut}`);
    });

    await reporter.test(S3, 'Tier 2: enforce — clip quá ngắn thì vẫn cắt theo CÂU (fallback an toàn)', () => {
        const tl = {
            segments: [{
                sourceIn: 0, sourceOut: 2, clipDuration: 2,
                voice: 'Chiếc máy hút chân không mini này. Giúp vali của bạn gọn gàng hơn rất nhiều lần.'
            }]
        };
        const seg = enforceVoiceDurationConstraint(tl).segments[0];
        const wc = seg.voice.trim().replace(/[.!?]+$/, '').split(/\s+/).length;
        assert.ok(wc <= Math.floor(2 * VOICE_WORDS_PER_SEC), `phải cắt về <= budget, nhận ${wc} từ`);
        assert.ok(/[.!?…]$/.test(seg.voice.trim()), 'vẫn kết thúc bằng dấu câu trọn vẹn');
    });

    await reporter.test(S3, 'Tier 2: cắt bắt buộc KHÔNG được để lại từ loại/thời gian cụt ("hôm", "chiếc")', () => {
        // Ca thật gặp khi render: "Bấm vào giỏ hàng góc trái đặt mua ngay hôm nay" cắt còn "...ngay hôm."
        const out = fitVoiceToWords('Bấm vào giỏ hàng góc trái đặt mua ngay hôm nay', 10);
        const last = out.trim().replace(/[.!?…]+$/, '').trim().split(/\s+/).pop().toLowerCase();
        assert.ok(!['hôm', 'chiếc', 'cái', 'chuyến', 'đợt', 'lần', 'bộ', 'loại', 'kiểu', 'tầm'].includes(last),
            `không được kết thúc bằng từ cụt "${last}" — voice: "${out}"`);
        assert.ok(/[.!?…]$/.test(out.trim()), 'vẫn phải kết thúc bằng dấu câu');
    });

    await reporter.test(S3, 'Tier 2: mapping thư viện ghi lại clipDuration để biết còn bao nhiêu chỗ', () => {
        assert.ok(/seg\.clipDuration\s*=\s*clipDur/.test(timelineGen),
            'bước map timeline → kho phải lưu seg.clipDuration');
    });

    await reporter.test(S3, 'Tier 2: prompt buộc model viết voice ĐỦ Ý trong maxVoiceWords', () => {
        assert.ok(/KHÔNG ĐƯỢC VƯỢT|MUST NOT EXCEED/.test(timelineGen),
            'prompt phải cấm vượt maxVoiceWords (tránh bị cắt cụt về sau)');
        assert.ok(/trọn ý|trọn vẹn|complete thought/i.test(timelineGen),
            'prompt phải yêu cầu câu trọn ý trong ngân sách từ');
    });

    // ─────────────────────────────────────────────────────────────
    //  NHÓM 4 — Ngân sách thời lượng output: trần 60s, thân/kết dài hơn
    // ─────────────────────────────────────────────────────────────
    // ĐỔI CONTRACT 2026-09-18 (user chốt): trần video thành phẩm 60s → 20-30s
    // ("độ dài video output ... linh hoạt khoảng 20-30s"), nhịp cảnh 5.1s → 4-5s.
    // Vì vậy "tiến sát 60s / >=10 cảnh" KHÔNG còn là hành vi đúng nữa.
    await reporter.test(S4, 'Tier 1: hook ngắn → lấp đầy quỹ 30s bằng các cảnh 4-5s', () => {
        const b = planOutputBudget({ hookDuration: 4, libraryCount: 60, variantCount: 10 });
        assert.ok(b.bodyCount >= 5, `hook 4s phải có >=5 phân cảnh thân/kết, nhận ${b.bodyCount}`);
        assert.ok(b.estimatedTotal >= 20, `tổng thời lượng phải đạt >=20s, nhận ${b.estimatedTotal}`);
        assert.ok(b.estimatedTotal <= 30, `KHÔNG được vượt trần 30s, nhận ${b.estimatedTotal}`);
    });

    // ĐỔI CONTRACT 2026-09-18 (user chốt): hook nay bị KẸP về 4-5s ngay trong planOutputBudget.
    // Luật cũ "hook dài ⇒ ít cảnh thân hơn" chính là TRIỆU CHỨNG của lỗi đã sửa: hook thật 34s
    // ăn hết quỹ làm video chỉ còn 6 cảnh. Nay kiểm ngược lại — hook nguồn dài KHÔNG được
    // làm giảm số cảnh thân bài, vì chỉ 4-5s của nó được dùng.
    await reporter.test(S4, 'Tier 1: hook nguồn dài bị kẹp 4-5s ⇒ thân bài KHÔNG bị ăn mòn', () => {
        const b = planOutputBudget({ hookDuration: 25, libraryCount: 60, variantCount: 10 });
        const short = planOutputBudget({ hookDuration: 4, libraryCount: 60, variantCount: 10 });
        assert.ok(b.estimatedTotal <= 30, `tổng phải <= 30s, nhận ${b.estimatedTotal}`);
        assert.ok(b.bodyCount >= 4, `vẫn phải đủ thân bài tối thiểu 4 phân cảnh, nhận ${b.bodyCount}`);
        assert.strictEqual(b.bodyCount, short.bodyCount,
            'hook đã bị kẹp thì số cảnh thân phải bằng trường hợp hook ngắn');
    });

    await reporter.test(S4, 'Tier 2: kho nhỏ → nới hạn dùng lại clip thay vì hỏng coverage', () => {
        const b = planOutputBudget({ hookDuration: 4, libraryCount: 6, variantCount: 10 });
        assert.ok(b.bodyCount >= 4, 'vẫn giữ tối thiểu 4 phân cảnh thân');
        assert.ok(b.maxUsagePerAsset > 3,
            `kho 6 clip / 10 biến thể phải cho dùng lại > 3 lần, nhận ${b.maxUsagePerAsset}`);
    });

    await reporter.test(S4, 'Tier 2: kho lớn → giữ hạn dùng lại mặc định 3', () => {
        const b = planOutputBudget({ hookDuration: 4, libraryCount: 200, variantCount: 10 });
        assert.strictEqual(b.maxUsagePerAsset, 3, 'kho lớn không cần nới hạn dùng lại');
    });

    await reporter.test(S4, 'Tier 2: trần 60s cấu hình được qua V2V_MAX_OUTPUT_SECONDS', () => {
        const b = planOutputBudget({ hookDuration: 4, libraryCount: 60, maxOutputSeconds: 30 });
        assert.ok(b.estimatedTotal <= 30, `phải tôn trọng trần tuỳ chỉnh 30s, nhận ${b.estimatedTotal}`);
        assert.ok(/V2V_MAX_OUTPUT_SECONDS/.test(timelineGen), 'phải đọc env V2V_MAX_OUTPUT_SECONDS');
    });

    await reporter.test(S4, 'Tier 1: thêm phân cảnh vẫn ĐÚNG mạch — mở bằng problem, CTA chỉ ở cuối', () => {
        const lib = Array.from({ length: 20 }, (_, i) => ({
            asset_id: 'a' + i, path: `/kho/${i}.mp4`, filename: `${i}.mp4`, duration: 6, described: true,
            aiDescription: i % 3 === 0 ? 'cảnh vali lộn xộn bừa bộn khó chịu' : 'thao tác hút chân không gọn gàng'
        }));
        const seq = selectFootageSequence(lib, { targetCount: 12 });
        assert.strictEqual(seq.length, 12, 'phải sinh đủ số phân cảnh yêu cầu');
        assert.strictEqual(seq[0].phase, 'problem', 'mở đầu thân bài phải là vấn đề');
        assert.strictEqual(seq[seq.length - 1].phase, 'cta', 'chốt đơn phải nằm ở phân cảnh cuối');
        assert.strictEqual(seq.filter(s => s.phase === 'cta').length, 1,
            'CTA chỉ được xuất hiện 1 lần (không rải giữa video)');
    });

    await reporter.test(S4, 'Tier 1: giữ nguyên mạch 4 phân cảnh cũ (problem→feature→result→cta)', () => {
        const lib = Array.from({ length: 8 }, (_, i) => ({
            asset_id: 'b' + i, path: `/kho/b${i}.mp4`, filename: `b${i}.mp4`, duration: 5, described: true,
            aiDescription: 'thao tác sản phẩm'
        }));
        assert.deepStrictEqual(
            selectFootageSequence(lib, { targetCount: 4 }).map(s => s.phase),
            ['problem', 'feature', 'result', 'cta']
        );
    });

    await reporter.test(S4, 'Tier 1: rút từ khoá sản phẩm từ phân tích video đối thủ (bỏ stopword)', () => {
        const kw = extractProductKeywords({
            summary: 'Video giới thiệu máy hút chân không mini cho vali khi đi du lịch',
            purpose: 'Bán máy hút chân không',
            entities: ['VacEase']
        });
        assert.ok(kw.has('hút'), 'phải giữ từ khoá sản phẩm');
        assert.ok(kw.has('vali'), 'phải giữ danh từ chính');
        assert.ok(!kw.has('cho') && !kw.has('khi'), 'phải loại stopword tiếng Việt');
    });

    await reporter.test(S4, 'Tier 1: clip đúng chủ đề phải ăn điểm cao hơn clip lạc đề', () => {
        const kw = extractProductKeywords({ summary: 'máy hút chân không mini cho vali du lịch' });
        const good = scoreAssetRelevance({ aiDescription: 'Máy hút chân không mini ép gọn quần áo trong vali' }, kw);
        const bad = scoreAssetRelevance({ aiDescription: 'Bộ móng tay tráng gương đỏ vàng cực sang chảnh' }, kw);
        assert.ok(good > bad, `clip đúng chủ đề (${good}) phải > clip lạc đề (${bad})`);
        assert.strictEqual(bad, 0, 'clip hoàn toàn lạc đề phải 0 điểm');
    });

    await reporter.test(S4, 'Tier 2: kho trộn nhiều sản phẩm → chỉ chọn clip đúng chủ đề', () => {
        const kw = extractProductKeywords({ summary: 'máy hút chân không mini cho vali du lịch' });
        const mixed = [
            ...Array.from({ length: 10 }, (_, i) => ({
                asset_id: 'nail' + i, path: `/n${i}.mp4`, filename: `n${i}.mp4`, duration: 5, described: true,
                aiDescription: 'Bộ móng tay tráng gương vẽ hoa anh đào'
            })),
            ...Array.from({ length: 6 }, (_, i) => ({
                asset_id: 'vac' + i, path: `/v${i}.mp4`, filename: `v${i}.mp4`, duration: 5, described: true,
                aiDescription: 'Máy hút chân không mini ép gọn quần áo trong vali du lịch'
            }))
        ];
        const seq = selectFootageSequence(mixed, { targetCount: 5, keywords: kw });
        const offTopic = seq.filter(s => String(s.sourceAssetId).startsWith('nail'));
        assert.strictEqual(offTopic.length, 0,
            `không được chọn clip lạc đề khi còn clip đúng đề, nhận ${offTopic.length}`);
    });

    await reporter.test(S4, 'Tier 2: không đủ clip đúng đề → vẫn bù cho đủ số phân cảnh', () => {
        const kw = extractProductKeywords({ summary: 'máy hút chân không mini cho vali du lịch' });
        const mixed = [
            { asset_id: 'vac0', path: '/v0.mp4', filename: 'v0.mp4', duration: 5, described: true, aiDescription: 'Máy hút chân không mini cho vali' },
            ...Array.from({ length: 8 }, (_, i) => ({
                asset_id: 'nail' + i, path: `/n${i}.mp4`, filename: `n${i}.mp4`, duration: 5, described: true,
                aiDescription: 'Bộ móng tay tráng gương'
            }))
        ];
        const seq = selectFootageSequence(mixed, { targetCount: 6, keywords: kw });
        assert.strictEqual(seq.length, 6, 'thiếu clip đúng đề thì vẫn phải bù đủ số phân cảnh');
        assert.strictEqual(seq[0].sourceAssetId, 'vac0', 'clip đúng đề phải được ưu tiên trước');
    });

    await reporter.test(S4, 'Tier 1: nới phân cảnh KHÔNG được đẩy tổng thời lượng vượt trần', () => {
        const voice = 'Chiếc máy hút chân không mini này giúp vali của bạn gọn gàng hơn rất nhiều lần khi đi du lịch';
        const segments = Array.from({ length: 10 }, () => ({ sourceIn: 0, sourceOut: 4, clipDuration: 12, voice }));
        const out = enforceVoiceDurationConstraint({ segments }, { maxTotalSeconds: 45 });
        const total = out.segments.reduce((s, x) => s + (x.sourceOut - x.sourceIn), 0);
        assert.ok(total <= 45.01, `tổng thời lượng phải <= 45s, nhận ${total}`);
        assert.ok(total >= 40, `vẫn phải dùng hết quỹ cho phép, nhận ${total}`);
    });

    await reporter.test(S4, 'Tier 2: prompt nêu rõ tổng thời lượng mục tiêu & số phân cảnh động', () => {
        assert.ok(!/Hãy tạo Production Timeline với 4 - 6 segment/.test(timelineGen),
            'không được hardcode 4-6 segment nữa');
        assert.ok(/budget\.bodyCount|minSegments|maxSegments/.test(timelineGen),
            'prompt phải dùng số phân cảnh tính động theo ngân sách thời lượng');
        assert.ok(/TỔNG THỜI LƯỢNG|TOTAL DURATION/i.test(timelineGen),
            'prompt phải nêu tổng thời lượng mục tiêu cho model');
    });

    // ─────────────────────────────────────────────────────────────
    //  NHÓM 5 — Voice tin cậy + hết "chết tiếng" cuối phân cảnh
    //  (đo từ output thật project "hihi": im lặng 38s/58s; Edge TTS lỗi NoAudioReceived ~10-20%)
    // ─────────────────────────────────────────────────────────────
    await reporter.test(S5, 'Tier 1: TTS hỏng tạm thời phải RETRY chứ không bỏ câm', async () => {
        let calls = 0;
        const val = await runWithRetry(async () => {
            calls++;
            if (calls < 3) throw new Error('NoAudioReceived');
            return 'ok';
        }, { attempts: 4, delayMs: 1 });
        assert.strictEqual(val, 'ok');
        assert.strictEqual(calls, 3, `phải thử lại tới khi thành công, nhận ${calls} lần`);
    });

    await reporter.test(S1 && S5, 'Tier 1: retry hết lượt vẫn hỏng → NÉM LỖI (không trả voice câm)', async () => {
        let calls = 0;
        await assert.rejects(
            () => runWithRetry(async () => { calls++; throw new Error('NoAudioReceived'); }, { attempts: 3, delayMs: 1 }),
            /NoAudioReceived/
        );
        assert.strictEqual(calls, 3, `phải thử đủ 3 lần, nhận ${calls}`);
    });

    await reporter.test(S5, 'Tier 1: voice_generator thực sự dùng retry + giới hạn luồng TTS', () => {
        const vg = fs.readFileSync(path.resolve('byteplus/video_studio/voice_generator.js'), 'utf8');
        assert.ok(/runWithRetry\(/.test(vg), 'generateVoiceWithTiming phải bọc trong runWithRetry');
        assert.ok(/TTS_CONCURRENCY|ttsSemaphore|_ttsGate/.test(vg),
            'phải giới hạn số TTS chạy song song (10 render cùng lúc làm Edge TTS rớt)');
    });

    await reporter.test(S5, 'Tier 1: phân cảnh co về đúng độ dài voice THẬT (hết chết tiếng)', () => {
        // Đo thật: 13 từ ≈ 3.4s voice, nhưng phân cảnh đang để 5.9s ⇒ dư 2.2s im lặng.
        const d = resolveSegmentDuration({ nominal: 5.9, voiceDuration: 3.4, minDur: 1.5 });
        assert.ok(d < 5.9, `phải co ngắn lại, nhận ${d}`);
        assert.ok(d >= 3.8 && d <= 4.1, `phải vừa voice + đệm đầu/cuối (~3.85s), nhận ${d}`);
    });

    await reporter.test(S5, 'Tier 1: voice dài hơn phân cảnh → KHÔNG co (giữ nguyên, để atempo lo)', () => {
        assert.strictEqual(resolveSegmentDuration({ nominal: 5.9, voiceDuration: 6.5, minDur: 1.5 }), 5.9);
    });

    await reporter.test(S5, 'Tier 2: phân cảnh không có voice → giữ nguyên thời lượng gốc', () => {
        assert.strictEqual(resolveSegmentDuration({ nominal: 4.2, voiceDuration: 0, minDur: 1.5 }), 4.2);
    });

    await reporter.test(S5, 'Tier 2: voice cực ngắn vẫn phải giữ sàn tối thiểu', () => {
        assert.strictEqual(resolveSegmentDuration({ nominal: 5, voiceDuration: 0.4, minDur: 1.5 }), 1.5);
    });

    await reporter.test(S5, 'Tier 1: mất word-timing → ƯỚC LƯỢNG nhịp chữ, không đổ sạch text', () => {
        const words = estimateWordTimings('Máy hút chân không mini cực gọn', 4);
        assert.strictEqual(words.length, 7, `phải có nhịp cho từng từ, nhận ${words.length}`);
        for (let i = 1; i < words.length; i++) {
            assert.ok(words[i].off >= words[i - 1].off, 'mốc thời gian phải tăng dần');
        }
        const end = words[words.length - 1].off + words[words.length - 1].dur;
        assert.ok(Math.abs(end - 4) < 0.05, `chữ cuối phải kết thúc đúng lúc voice hết (4s), nhận ${end}`);
    });

    await reporter.test(S5, 'Tier 2: từ dài được chia nhiều thời gian hơn từ ngắn', () => {
        const w = estimateWordTimings('a nghiêng', 2);
        assert.ok(w[1].dur > w[0].dur, 'từ dài hơn phải đọc lâu hơn');
    });

    await reporter.test(S5, 'Tier 2: không có audio/text → trả mảng rỗng an toàn', () => {
        assert.deepStrictEqual(estimateWordTimings('', 5), []);
        assert.deepStrictEqual(estimateWordTimings('abc', 0), []);
    });

    await reporter.test(S5, 'Tier 1: assembler tự ước lượng nhịp chữ khi TTS thiếu timing', () => {
        assert.ok(assembler.includes('estimateWordTimings(segments[i].voice, voiceDurations[i])'),
            'assembler phải ước lượng word-timing khi voiceWords rỗng');
    });

    await reporter.test(S5, 'Tier 1: tốc độ đọc dùng số ĐO THẬT (~3.8 từ/s) thay vì 2.6', () => {
        assert.ok(VOICE_WORDS_PER_SEC >= 3.5 && VOICE_WORDS_PER_SEC <= 4.1,
            `tốc độ đọc Edge TTS tiếng Việt đo được 3.82 từ/s, nhận ${VOICE_WORDS_PER_SEC}`);
        // 13 từ ⇒ ~3.4s + đệm, KHÔNG phải 5.5s như hằng số 2.6 cũ
        const seg = { sourceIn: 0, sourceOut: 2, clipDuration: 12, voice: Array.from({ length: 13 }, () => 'từ').join(' ') };
        const d = fitSegmentDurationToVoice(seg);
        assert.ok(d <= 4.2, `13 từ chỉ cần <= 4.2s, nhận ${d}`);
    });

    await reporter.test(S5, 'Tier 2: ngân sách từ của kịch bản cũng theo tốc độ đọc thật', () => {
        const lib = Array.from({ length: 6 }, (_, i) => ({
            asset_id: 'c' + i, path: `/c${i}.mp4`, filename: `c${i}.mp4`, duration: 5, described: true,
            aiDescription: 'thao tác sản phẩm'
        }));
        const seq = selectFootageSequence(lib, { targetCount: 4 });
        seq.forEach(s => {
            assert.ok(s.maxWords >= Math.floor(s.duration * 3.2),
                `phân cảnh ${s.duration}s phải cho >= ${Math.floor(s.duration * 3.2)} từ, nhận ${s.maxWords}`);
        });
    });
}

export default { runRenderPolishTests };
