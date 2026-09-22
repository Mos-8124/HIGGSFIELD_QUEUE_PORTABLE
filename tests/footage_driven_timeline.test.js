/**
 * tests/footage_driven_timeline.test.js
 *
 * TDD Suite for Footage-Driven Timeline & Strict Voice Duration Constraint:
 * 1. clusterLibraryFootage: Nhóm clip theo hành động hình ảnh thực tế (problem, feature/operation, result/transformation, cta)
 * 2. selectFootageSequence: Chọn footage trước khi viết kịch bản (Asset-First / Visual-First)
 * 3. enforceVoiceDurationConstraint: Đảm bảo thời lượng lời bình (voice) <= thời lượng phân cảnh clip (sourceOut - sourceIn)
 * 4. applyCombinatorialPlanning: Đảm bảo số từ voiceover không vượt ngưỡng word budget = floor(duration * VOICE_WORDS_PER_SEC)
 * ĐỔI CONTRACT 2026-09-18: hằng số 2.8 từ/giây là ƯỚC LƯỢNG SAI. Đo thật Edge TTS vi-VN:
 * 97 từ → 25.42s = 3.82 từ/giây. Giữ 2.8 khiến phân cảnh dài hơn voice ~32% ⇒ video chết tiếng.
 * 5. Assembler duration constraint: Assembler không làm giãn độ dài clip khi voice dài hơn clip
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';

import {
    clusterLibraryFootage,
    selectFootageSequence,
    enforceVoiceDurationConstraint,
    applyCombinatorialPlanning,
    detectLanguageFromVoice,
    VOICE_WORDS_PER_SEC,
    VOICE_WRITE_WORDS_PER_SEC
} from '../byteplus/video_studio/timeline_generator.js';

const S = 'Video Studio — Footage-Driven Timeline & Voice Duration Constraint';

export async function runFootageDrivenTimelineTests(reporter) {

    const mockAssets = [
        {
            asset_id: 'VID_001',
            duration: 8.0,
            described: true,
            aiDescription: 'Cảnh vali kẹt khoá, quần áo phồng to bừa bộn không đóng được nắp',
            descriptionIndex: [{ start: 0, end: 4.0, description: 'Quần áo cồng kềnh nhét vali quá tải' }]
        },
        {
            asset_id: 'VID_002',
            duration: 6.0,
            described: true,
            aiDescription: 'Cận cảnh máy bơm mini cắm sạc type-C và bấm nút khởi động hút khí',
            descriptionIndex: [{ start: 0, end: 3.5, description: 'Cắm máy bơm vào van túi nén' }]
        },
        {
            asset_id: 'VID_003',
            duration: 7.0,
            described: true,
            aiDescription: 'Túi nén xẹp nhanh chóng trong mười giây, biến đống đồ to thành phẳng lì',
            descriptionIndex: [{ start: 0, end: 4.0, description: 'Túi hút xẹp phẳng như cuốn sách' }]
        },
        {
            asset_id: 'VID_004',
            duration: 5.0,
            described: true,
            aiDescription: 'Đóng nắp vali nhẹ nhàng, còn dư nửa vali để xếp thêm đồ mua sắm',
            descriptionIndex: [{ start: 0, end: 3.5, description: 'Vali đóng khít và kéo khoá dễ dàng' }]
        },
        {
            asset_id: 'VID_005',
            duration: 4.5,
            described: true,
            aiDescription: 'Cầm máy trên tay giơ lên màn hình kèm ưu đãi mua 1 tặng 1 trong giỏ hàng',
            descriptionIndex: [{ start: 0, end: 3.0, description: 'Kêu gọi mua hàng giỏ hàng góc trái' }]
        }
    ];

    await reporter.test(S, 'Tier 1: clusterLibraryFootage phân loại clip theo hành động hình ảnh', async () => {
        assert.strictEqual(typeof clusterLibraryFootage, 'function', 'clusterLibraryFootage phải là function');
        const clusters = clusterLibraryFootage(mockAssets);
        assert.ok(clusters, 'clusters phải tồn tại');
        assert.ok(Array.isArray(clusters.problem), 'Phải có nhóm problem');
        assert.ok(Array.isArray(clusters.feature), 'Phải có nhóm feature');
        assert.ok(Array.isArray(clusters.result), 'Phải có nhóm result');
        assert.ok(Array.isArray(clusters.cta), 'Phải có nhóm cta');

        assert.ok(clusters.problem.some(a => a.asset_id === 'VID_001'), 'VID_001 thuộc nhóm problem/pain');
        assert.ok(clusters.feature.some(a => a.asset_id === 'VID_002'), 'VID_002 thuộc nhóm feature/operation');
        assert.ok(clusters.result.some(a => a.asset_id === 'VID_003'), 'VID_003 thuộc nhóm result/transformation');
    });

    await reporter.test(S, 'Tier 1: selectFootageSequence chọn chuỗi clip kho trước khi viết lời bình', async () => {
        assert.strictEqual(typeof selectFootageSequence, 'function', 'selectFootageSequence phải là function');
        const sequence = selectFootageSequence(mockAssets, { targetCount: 4 });
        assert.ok(Array.isArray(sequence), 'sequence phải là mảng');
        assert.strictEqual(sequence.length, 4, 'Phải chọn đúng 4 clip theo yêu cầu');

        // Mỗi clip trong chuỗi phải có sourceIn, sourceOut, duration hợp lệ
        for (const item of sequence) {
            assert.ok(item.sourceAssetId, 'Item phải có sourceAssetId');
            assert.ok(item.sourceOut > item.sourceIn, 'sourceOut phải lớn hơn sourceIn');
            const dur = item.sourceOut - item.sourceIn;
            assert.ok(dur >= 1.5 && dur <= 6.0, 'Độ dài clip được chọn phải nằm trong khoảng 1.5s - 6.0s');
            assert.ok(item.maxWords > 0, 'Phải tính trước ngân sách số từ tối đa (maxWords)');
            // ĐỔI CONTRACT 2026-09-18 (user chốt): ngân sách GIAO CHO AI VIẾT nay dùng
            // VOICE_WRITE_WORDS_PER_SEC (3.2) chứ không phải tốc độ ĐỌC thật VOICE_SPEAK_RATE (3.8).
            // Lý do: giao chỉ tiêu viết đúng bằng tốc độ đọc thì câu vừa viết xong đã chạm trần,
            // dư 1 chữ là bị cắt cụt giữa câu (đợt thử trước cụt 5/15 câu). Ngưỡng CẮT vẫn là 3.8.
            assert.strictEqual(item.maxWords, Math.max(4, Math.floor(dur * VOICE_WRITE_WORDS_PER_SEC)),
                'maxWords phải = floor(dur * VOICE_WRITE_WORDS_PER_SEC)');
            assert.ok(item.maxWords / VOICE_WORDS_PER_SEC < dur,
                'đọc hết ngân sách từ phải xong TRƯỚC khi cảnh kết thúc');
        }
    });

    await reporter.test(S, 'Tier 1: enforceVoiceDurationConstraint cắt ngắn lời bình nếu vượt quá độ dài clip', async () => {
        assert.strictEqual(typeof enforceVoiceDurationConstraint, 'function', 'enforceVoiceDurationConstraint phải là function');

        const timeline = {
            title: 'Test Timeline',
            segments: [
                {
                    order: 1,
                    sourceIn: 0,
                    sourceOut: 2.5, // 2.5s -> maxWords = floor(2.5 * 3.8) = 9 từ
                    voice: 'Đi sân bay bị phạt tiền triệu vì vali quá khổ quá cân rất mệt mỏi phiền phức', // 16 từ!
                    text: 'VALI QUÁ CÂN BỊ PHẠT'
                },
                {
                    order: 2,
                    sourceIn: 1.0,
                    sourceOut: 4.5, // 3.5s -> maxWords = floor(3.5 * 3.8) = 13 từ
                    voice: 'Chiếc máy mini này cứu nguy cho chuyến đi', // 8 từ -> Hợp lệ, giữ nguyên!
                    text: 'MÁY MINI CỨU NGUY'
                }
            ]
        };

        const constrained = enforceVoiceDurationConstraint(timeline);
        const seg1 = constrained.segments[0];
        const seg1Dur = seg1.sourceOut - seg1.sourceIn;
        const seg1Words = seg1.voice.trim().split(/\s+/).filter(Boolean).length;
        const maxWords1 = Math.floor(seg1Dur * VOICE_WORDS_PER_SEC);

        assert.ok(seg1Words <= maxWords1, `Seg 1: Số từ (${seg1Words}) phải <= maxWords (${maxWords1})`);

        const seg2 = constrained.segments[1];
        assert.strictEqual(seg2.voice, 'Chiếc máy mini này cứu nguy cho chuyến đi', 'Seg 2 không vượt quá thời lượng nên được giữ nguyên');
    });

    await reporter.test(S, 'Tier 2: applyCombinatorialPlanning tự động áp dụng ràng buộc độ dài lời bình', async () => {
        const rawTimeline = {
            title: 'Kịch bản Test',
            segments: [
                {
                    order: 1,
                    phase: 'body',
                    sourceAssetId: 'VID_001',
                    sourceIn: 0,
                    sourceOut: 2.0, // 2.0s -> maxWords = 5 từ
                    voice: 'Chiếc máy nén mini này là giải pháp cứu nguy tuyệt vời nhất', // 11 từ!
                    text: 'GIẢI PHÁP CỨU NGUY'
                }
            ]
        };

        const planned = applyCombinatorialPlanning(rawTimeline, mockAssets, {}, 3, {});
        const s = planned.segments[0];
        const dur = s.sourceOut - s.sourceIn;
        const words = s.voice.trim().split(/\s+/).filter(Boolean).length;
        const maxAllowed = Math.floor(dur * VOICE_WORDS_PER_SEC);

        assert.ok(words <= maxAllowed, `Số từ lời bình (${words}) phải <= maxAllowed (${maxAllowed}) cho clip ${dur}s`);
    });

    // ĐỔI CONTRACT 2026-09-18: yêu cầu "không DÃN theo voice" giữ nguyên, nhưng nay assembler được
    // phép CO phân cảnh về đúng độ dài voice đo được (resolveSegmentDuration) — đo từ output thật
    // project "hihi": phân cảnh 5.9s chỉ có 3.4s tiếng ⇒ 2.2s hình chạy mà đã hết tiếng + hết chữ.
    await reporter.test(S, 'Tier 2: Assembler KHÔNG dãn theo voice, chỉ được CO cho khớp voice thật', async () => {
        const assemblerCode = fs.readFileSync(path.resolve('byteplus/video_studio/assembler.js'), 'utf8');
        const { resolveSegmentDuration } = await import('../byteplus/video_studio/assembler.js');

        assert.ok(
            !assemblerCode.includes('segmentDurations[i] = Math.max(origDur, Math.round((vDur + 0.60) * 100) / 100);'),
            'Assembler KHÔNG được dãn segmentDurations theo độ dài vDur'
        );
        assert.ok(assemblerCode.includes('segmentDurations[i] = resolveSegmentDuration({'),
            'Assembler phải tính thời lượng phân cảnh qua resolveSegmentDuration');
        // Bất biến: voice dài hơn khung ⇒ TUYỆT ĐỐI không kéo dài phân cảnh.
        assert.strictEqual(resolveSegmentDuration({ nominal: 4, voiceDuration: 99 }), 4,
            'voice dài hơn thì vẫn phải giữ nguyên khung gốc');
    });

    await reporter.test(S, 'Tier 1: enforceVoiceDurationConstraint đồng bộ 100% thoại giữa text và voice', async () => {
        const testTimeline = {
            title: 'Test Timeline Sync',
            segments: [
                {
                    order: 1,
                    sourceIn: 0,
                    sourceOut: 5.0, // 5.0s -> maxWords = floor(5.0 * 3.8) = 19 từ (chứa trọn 11 từ)
                    voice: 'Đi sân bay sợ nhất bị phạt tiền vì vali quá cân.',
                    text: 'SLOGAN KHÁC BIỆT HOÀN TOÀN'
                }
            ]
        };

        const synced = enforceVoiceDurationConstraint(testTimeline);
        const seg = synced.segments[0];
        assert.strictEqual(
            seg.text,
            'ĐI SÂN BAY SỢ NHẤT BỊ PHẠT TIỀN VÌ VALI QUÁ CÂN',
            'Text phụ đề phải đồng bộ 1:1 từng chữ với voice thoại'
        );
    });

    await reporter.test(S, 'Tier 1: detectLanguageFromVoice nhận diện chuẩn xác ngôn ngữ theo Voice ID', async () => {
        assert.strictEqual(detectLanguageFromVoice('en-US-AriaNeural'), 'en');
        assert.strictEqual(detectLanguageFromVoice('en-GB-SoniaNeural'), 'en');
        assert.strictEqual(detectLanguageFromVoice('en-US-GuyNeural'), 'en');
        assert.strictEqual(detectLanguageFromVoice('vi-VN-HoaiMyNeural'), 'vi');
        assert.strictEqual(detectLanguageFromVoice('vi-VN-NamMinhNeural'), 'vi');
        assert.strictEqual(detectLanguageFromVoice(null), 'vi');
    });

    // ĐỔI CONTRACT (2026-09-18) — trước đây bắt buộc đen ĐẶC (boxcolor=black@0.95 + boxborderw>=16).
    // User: "nhìn xấu quá" → "làm lại cái nền đen đi nhưng giảm cường độ xuống chút".
    // Yêu cầu mới: GIỮ dải nền che phụ đề cháy sẵn trong footage nhưng MỜ HƠN (drawbox black@0.6),
    // BỎ hộp đen bám sát từng chữ (box=1) vì nó nhảy kích thước theo mỗi từ; chữ nổi nhờ viền + bóng.
    await reporter.test(S, 'Tier 2: Assembler che phụ đề cũ bằng dải nền MỜ + viền chữ (không hộp đen đặc)', async () => {
        const assemblerCode = fs.readFileSync(path.resolve('byteplus/video_studio/assembler.js'), 'utf8');
        assert.ok(!assemblerCode.includes('boxcolor=black'), 'không dùng lại hộp đen bám từng chữ');
        assert.ok(!assemblerCode.includes('boxborderw='), 'không còn padding của hộp nền đen');
        const { SUBTITLE_BACKDROP } = await import('../byteplus/video_studio/assembler.js');
        const alpha = Number((SUBTITLE_BACKDROP.match(/color=black@([0-9.]+)/) || [])[1]);
        assert.ok(alpha > 0 && alpha < 0.8, `dải nền phải mờ hơn 0.8, nhận ${alpha}`);
        assert.ok(
            assemblerCode.includes('borderw=4') && assemblerCode.includes('bordercolor=black'),
            'phải có viền chữ đủ dày để đọc rõ trên nền sáng'
        );
    });

    await reporter.test(S, 'Tier 1: Cấu hình .env và timeline_generator sử dụng combo "aa" từ 9Router', async () => {
        const envPath = path.resolve('video-analyzer-pipeline/video-analyzer-standalone/.env');
        const envContent = fs.readFileSync(envPath, 'utf8');
        assert.ok(envContent.includes('VISION_MODEL=aa'), '.env phải cấu hình VISION_MODEL=aa (gemini cho vision — Claude trả 0 event ảnh)');
        // Contract change 2026-09-17 (task-analysis-hard-fail): TEXT_MODEL đổi từ 'aa' sang model
        // 9Router mạnh hơn cho synthesis (mặc định ag/claude-sonnet-4-6) vì reasoning model 'aa'
        // đôi lúc dịch cả KEY JSON → parse hỏng. Chỉ cần là model 9Router hợp lệ đang cấu hình.
        assert.ok(/TEXT_MODEL=(aa|ag\/)/.test(envContent), '.env phải cấu hình TEXT_MODEL = model 9Router hợp lệ (aa hoặc ag/...)');

        const tlGenCode = fs.readFileSync(path.resolve('byteplus/video_studio/timeline_generator.js'), 'utf8');
        assert.ok(tlGenCode.includes("'aa'"), 'timeline_generator.js phải hỗ trợ fallback combo aa');
    });

    await reporter.test(S, 'Tier 1: selectFootageSequence cung cấp ngân sách số từ mục tiêu (targetWords, minWords) để lời bình lấp đầy thời lượng clip', async () => {
        const seq = selectFootageSequence(mockAssets, { targetCount: 4 });
        assert.ok(seq.length > 0, 'Phải sinh ra sequence clips');
        for (const item of seq) {
            assert.ok(typeof item.targetWords === 'number' && item.targetWords > 0, 'Phải có targetWords > 0');
            assert.ok(typeof item.minWords === 'number' && item.minWords > 0, 'Phải có minWords > 0');
            assert.ok(item.minWords <= item.targetWords && item.targetWords <= item.maxWords, 'minWords <= targetWords <= maxWords');
        }
    });

    await reporter.test(S, 'Tier 2: Giao diện Step 5 có thanh tiến độ tổng thể (overall progress bar) trực quan khi render video', async () => {
        const htmlCode = fs.readFileSync(path.resolve('public/studio/video-to-video.html'), 'utf8');
        assert.ok(htmlCode.includes('v2v-render-overall-fill'), 'HTML phải có element v2v-render-overall-fill để biểu thị thanh tiến độ');
        assert.ok(htmlCode.includes('v2v-render-overall-pct'), 'HTML phải có element v2v-render-overall-pct hiển thị phần trăm tổng thể');

        const jsCode = fs.readFileSync(path.resolve('public/studio/video-to-video.js'), 'utf8');
        assert.ok(jsCode.includes('v2v-render-overall-fill'), 'JS phải cập nhật thanh tiến độ overall khi polling');
    });

    await reporter.test(S, 'Tier 2: playInMainPlayer tạm dừng toàn bộ video trong gallery để không phát đồng thời', async () => {
        const jsCode = fs.readFileSync(path.resolve('public/studio/video-to-video.js'), 'utf8');
        const fnMatch = jsCode.match(/function playInMainPlayer[\s\S]*?\{([\s\S]*?)\n\s*\}/);
        assert.ok(fnMatch, 'Phải tìm thấy function playInMainPlayer');
        assert.ok(
            fnMatch[1].includes('pause()'),
            'playInMainPlayer phải gọi pause() trên các video gallery'
        );
    });
}


