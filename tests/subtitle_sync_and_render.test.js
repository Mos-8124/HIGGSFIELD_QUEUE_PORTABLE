/**
 * TDD — Fix trước release:
 *  (1) Phụ đề đồng bộ TỪNG CHỮ theo giọng đọc (buildWordRevealDrawtext)
 *  (2) Giới hạn render tối đa N video đồng thời, phần còn lại xếp hàng (runWithConcurrency)
 *
 * Test hành vi (behavior), không test implementation. Chạy: npm test
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { buildWordRevealDrawtext, runWithConcurrency } from '../byteplus/video_studio/assembler.js';
import { fitVoiceToWords } from '../byteplus/video_studio/timeline_generator.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export async function runSubtitleSyncAndRenderTests(reporter) {
    // ─────────────────────────────────────────────────────────────
    //  NHÓM 1 — Phụ đề word-by-word (buildWordRevealDrawtext)
    // ─────────────────────────────────────────────────────────────
    const WORDS = [
        { t: 'Dừng', off: 0.10, dur: 0.20 },
        { t: 'lại', off: 0.40, dur: 0.20 },
        { t: 'ngay', off: 0.80, dur: 0.20 }
    ];

    await reporter.test('Subtitle Word-Sync — Phase A', 'Tier 1: sinh đúng 1 reveal cho mỗi từ', () => {
        const reveals = buildWordRevealDrawtext(WORDS, { tempo: 1, adelay: 0.1, lead: 0.15 });
        assert.strictEqual(reveals.length, WORDS.length, 'phải có n reveal cho n từ');
    });

    await reporter.test('Subtitle Word-Sync — Phase A', 'Tier 1: text hiện dồn (cumulative) — reveal k chứa k+1 từ', () => {
        const reveals = buildWordRevealDrawtext(WORDS, { tempo: 1, adelay: 0.1, lead: 0.15 });
        assert.strictEqual(reveals[0].text.trim().split(/\s+/).length, 1);
        assert.strictEqual(reveals[1].text.trim().split(/\s+/).length, 2);
        assert.strictEqual(reveals[2].text.trim().split(/\s+/).length, 3);
        // reveal cuối phải chứa toàn bộ từ cuối cùng
        assert.ok(reveals[2].text.includes('ngay'), 'reveal cuối phải có từ cuối');
    });

    await reporter.test('Subtitle Word-Sync — Phase A', 'Tier 1: thời điểm hiện tăng dần (monotonic)', () => {
        const reveals = buildWordRevealDrawtext(WORDS, { tempo: 1, adelay: 0.1, lead: 0.15 });
        for (let i = 1; i < reveals.length; i++) {
            assert.ok(reveals[i].start >= reveals[i - 1].start, `start[${i}] phải >= start[${i - 1}]`);
        }
    });

    await reporter.test('Subtitle Word-Sync — Phase A', 'Tier 1: text hiện TRƯỚC voice đúng bằng lead (0.1–0.2s)', () => {
        const lead = 0.15, adelay = 0.1, tempo = 1;
        const reveals = buildWordRevealDrawtext(WORDS, { tempo, adelay, lead });
        // Từ thứ 2 (off=0.40): voice nói tại localStart = adelay + off/tempo = 0.5
        const localStart2 = adelay + WORDS[1].off / tempo;
        assert.ok(Math.abs((localStart2 - reveals[1].start) - lead) < 1e-6,
            `text từ #2 phải hiện trước voice đúng ${lead}s (localStart=${localStart2}, start=${reveals[1].start})`);
    });

    await reporter.test('Subtitle Word-Sync — Phase A', 'Tier 2: lead bị kẹp vào [0.1, 0.2]', () => {
        // lead quá lớn → kẹp 0.2
        const big = buildWordRevealDrawtext(WORDS, { tempo: 1, adelay: 0.1, lead: 0.9 });
        const localStart2 = 0.1 + WORDS[1].off;
        assert.ok(Math.abs((localStart2 - big[1].start) - 0.2) < 1e-6, 'lead=0.9 phải bị kẹp thành 0.2');
        // lead quá nhỏ → kẹp 0.1
        const small = buildWordRevealDrawtext(WORDS, { tempo: 1, adelay: 0.1, lead: 0 });
        assert.ok(Math.abs((localStart2 - small[1].start) - 0.1) < 1e-6, 'lead=0 phải bị kẹp thành 0.1');
    });

    await reporter.test('Subtitle Word-Sync — Phase A', 'Tier 2: tempo>1 nén mốc thời gian theo off/tempo', () => {
        const tempo = 2, adelay = 0.1, lead = 0.1;
        const reveals = buildWordRevealDrawtext(WORDS, { tempo, adelay, lead });
        const expectStart2 = Math.max(0, adelay + WORDS[1].off / tempo - lead);
        assert.ok(Math.abs(reveals[1].start - expectStart2) < 1e-6,
            `tempo=2 phải dùng off/tempo (mong đợi ${expectStart2}, nhận ${reveals[1].start})`);
    });

    await reporter.test('Subtitle Word-Sync — Phase A', 'Tier 2: start không bao giờ âm', () => {
        const reveals = buildWordRevealDrawtext(
            [{ t: 'A', off: 0.0, dur: 0.1 }], { tempo: 1, adelay: 0, lead: 0.2 });
        assert.ok(reveals[0].start >= 0, 'start phải >= 0 (không âm)');
    });

    await reporter.test('Subtitle Word-Sync — Phase A', 'Tier 2: không có từ → mảng rỗng (caller fallback tĩnh)', () => {
        assert.deepStrictEqual(buildWordRevealDrawtext([], {}), []);
        assert.deepStrictEqual(buildWordRevealDrawtext(null, {}), []);
    });

    await reporter.test('Subtitle Word-Sync — Phase A', 'Tier 2: mỗi reveal có end > start để enable between hợp lệ', () => {
        const reveals = buildWordRevealDrawtext(WORDS, { tempo: 1, adelay: 0.1, lead: 0.15, segEnd: 5 });
        for (const r of reveals) {
            assert.ok(r.end > r.start, `end (${r.end}) phải > start (${r.start})`);
        }
        // reveal cuối kéo đến hết segment
        assert.ok(reveals[reveals.length - 1].end >= 4.9, 'reveal cuối kéo tới segEnd');
    });

    // ── Rolling window: cụm trước BIẾN MẤT nhường cụm sau (chống "tường chữ") ──
    const LONG = Array.from({ length: 10 }, (_, i) => ({ t: `từ${i}`, off: i * 0.5, dur: 0.3 }));

    await reporter.test('Subtitle Word-Sync — Phase A', 'Tier 1: rolling — không reveal nào vượt quá chunkWords từ (chống tường chữ)', () => {
        const reveals = buildWordRevealDrawtext(LONG, { tempo: 1, adelay: 0.1, lead: 0.15, chunkWords: 4 });
        for (const r of reveals) {
            const wc = r.text.trim().split(/\s+/).length;
            assert.ok(wc <= 4, `reveal chỉ được tối đa 4 từ (rolling), nhưng có ${wc}: "${r.text}"`);
        }
    });

    await reporter.test('Subtitle Word-Sync — Phase A', 'Tier 1: rolling — sang chunk mới thì RESET (text câu trước mất đi)', () => {
        const reveals = buildWordRevealDrawtext(LONG, { tempo: 1, adelay: 0.1, lead: 0.15, chunkWords: 4 });
        // từ thứ 5 (index 4) bắt đầu chunk 2 → chỉ còn 1 từ, không phải 5
        assert.strictEqual(reveals[4].text.trim().split(/\s+/).length, 1, 'đầu chunk mới phải reset về 1 từ');
        assert.ok(reveals[4].text.includes('từ4'), 'reveal[4] phải là từ mở đầu chunk mới');
        assert.ok(!reveals[4].text.includes('từ0'), 'reveal[4] KHÔNG còn chứa từ của chunk cũ');
    });

    await reporter.test('Subtitle Word-Sync — Phase A', 'Tier 2: chunk ngắt tại dấu câu (kết câu → cụm mới)', () => {
        const w = [
            { t: 'Mua', off: 0.0, dur: 0.2 }, { t: 'ngay.', off: 0.3, dur: 0.2 },
            { t: 'Giá', off: 0.7, dur: 0.2 }, { t: 'rẻ', off: 1.0, dur: 0.2 }
        ];
        const reveals = buildWordRevealDrawtext(w, { tempo: 1, adelay: 0.1, lead: 0.15, chunkWords: 10 });
        // sau "ngay." phải sang cụm mới dù chưa đạt chunkWords
        assert.strictEqual(reveals[2].text.trim().split(/\s+/).length, 1, 'sau dấu chấm phải bắt đầu cụm mới');
        assert.ok(reveals[2].text.includes('Giá') && !reveals[2].text.includes('Mua'), 'cụm mới không chứa câu trước');
    });

    // ─────────────────────────────────────────────────────────────
    //  NHÓM 2 — Giới hạn concurrency (runWithConcurrency)
    // ─────────────────────────────────────────────────────────────
    await reporter.test('Render Concurrency — Phase B', 'Tier 1: KHÔNG bao giờ vượt limit đồng thời (max 10)', async () => {
        const LIMIT = 10;
        const items = Array.from({ length: 100 }, (_, i) => i); // 100 video output
        let active = 0, maxActive = 0;
        await runWithConcurrency(items, LIMIT, async () => {
            active++; maxActive = Math.max(maxActive, active);
            await new Promise(r => setTimeout(r, 3));
            active--;
        });
        assert.ok(maxActive <= LIMIT, `max đồng thời quan sát = ${maxActive}, phải <= ${LIMIT}`);
        assert.ok(maxActive >= LIMIT - 1, `phải thực sự chạy song song tới gần limit (đo ${maxActive})`);
    });

    await reporter.test('Render Concurrency — Phase B', 'Tier 1: xử lý HẾT tất cả item (phần dư xếp hàng)', async () => {
        const items = Array.from({ length: 25 }, (_, i) => i);
        const done = [];
        await runWithConcurrency(items, 10, async (x) => { done.push(x); });
        assert.strictEqual(done.length, 25, 'phải xử lý đủ 25 item dù limit=10');
    });

    await reporter.test('Render Concurrency — Phase B', 'Tier 1: kết quả giữ đúng thứ tự index', async () => {
        const items = [5, 6, 7, 8];
        const results = await runWithConcurrency(items, 2, async (x) => x * 10);
        assert.deepStrictEqual(results, [50, 60, 70, 80], 'results[i] phải khớp fn(items[i])');
    });

    await reporter.test('Render Concurrency — Phase B', 'Tier 2: 1 item lỗi không phá cap & item khác vẫn xong', async () => {
        const items = [0, 1, 2, 3, 4];
        let active = 0, maxActive = 0, completed = 0;
        await runWithConcurrency(items, 2, async (x) => {
            active++; maxActive = Math.max(maxActive, active);
            await new Promise(r => setTimeout(r, 2));
            active--;
            if (x === 2) throw new Error('lỗi giả lập');
            completed++;
        });
        assert.ok(maxActive <= 2, `cap phải giữ dù có lỗi (đo ${maxActive})`);
        assert.strictEqual(completed, 4, '4 item không lỗi vẫn phải hoàn tất');
    });

    await reporter.test('Render Concurrency — Phase B', 'Tier 2: limit lớn hơn số item → không tạo thừa worker', async () => {
        const items = [1, 2];
        let maxActive = 0, active = 0;
        await runWithConcurrency(items, 10, async () => {
            active++; maxActive = Math.max(maxActive, active);
            await new Promise(r => setTimeout(r, 2)); active--;
        });
        assert.ok(maxActive <= 2, `chỉ có 2 item nên tối đa 2 chạy (đo ${maxActive})`);
    });

    // ─────────────────────────────────────────────────────────────
    //  NHÓM 3 — Wiring (source-regression) đảm bảo fix không bị lùi
    // ─────────────────────────────────────────────────────────────
    const assembler = fs.readFileSync(path.join(ROOT, 'byteplus/video_studio/assembler.js'), 'utf-8');
    const studioIndex = fs.readFileSync(path.join(ROOT, 'byteplus/video_studio/index.js'), 'utf-8');
    const v2vJs = fs.readFileSync(path.join(ROOT, 'public/studio/video-to-video.js'), 'utf-8');

    await reporter.test('Render Wiring — Phase C', 'Tier 1: assembler dùng buildWordRevealDrawtext cho phụ đề', () => {
        assert.ok(assembler.includes('buildWordRevealDrawtext('), 'phải gọi builder word-reveal');
        assert.ok(assembler.includes("enable='between(t,"), 'drawtext phải có enable between theo thời gian');
        assert.ok(assembler.includes('generateVoiceWithTiming'), 'phải lấy word-timing khi sinh voice');
    });

    await reporter.test('Render Wiring — Phase C', 'Tier 1: batchAssemble dùng runWithConcurrency (cap+queue)', () => {
        assert.ok(assembler.includes('return runWithConcurrency('), 'batchAssemble phải dùng runWithConcurrency');
    });

    await reporter.test('Render Wiring — Phase C', 'Tier 1: render đồng thời mặc định = 10', () => {
        assert.ok(/concurrency\s*=\s*Number\(process\.env\.V2V_RENDER_CONCURRENCY\)\s*\|\|\s*10/.test(assembler),
            'default concurrency của batchAssemble phải là 10');
        assert.ok(/V2V_RENDER_CONCURRENCY\)\s*\|\|\s*10/.test(studioIndex),
            'call-site assemble phải truyền concurrency 10 (không còn 3)');
        assert.ok(!/concurrency:\s*3\b/.test(studioIndex), 'không còn hardcode concurrency: 3');
    });

    await reporter.test('Render Wiring — Phase C', 'Tier 2: poll() tự hiện panel & tạo card thiếu (fix xem tiến độ từng item)', () => {
        assert.ok(v2vJs.includes('function streamCardHTML('), 'phải có helper streamCardHTML');
        assert.ok(/panelEl\.hidden\s*=\s*false/.test(v2vJs), 'poll phải tự hiện panel render');
        assert.ok(v2vJs.includes("grid.insertAdjacentHTML('beforeend', streamCardHTML("),
            'poll phải tạo card động khi grid thiếu');
    });

    // ─────────────────────────────────────────────────────────────
    //  NHÓM 4 — Cắt voice theo CÂU trọn vẹn cho vừa thời lượng phân cảnh
    // ─────────────────────────────────────────────────────────────
    await reporter.test('Voice Fit — Phase D', 'Tier 1: text ngắn hơn budget → giữ nguyên nội dung', () => {
        const out = fitVoiceToWords('Mua ngay hôm nay', 10);
        assert.ok(out.includes('Mua ngay hôm nay'), 'không được cắt khi còn trong budget');
    });

    await reporter.test('Voice Fit — Phase D', 'Tier 1: vượt budget → giữ CÂU trọn vẹn, không cắt giữa câu', () => {
        // 2 câu; budget 6 từ; câu 1 = 5 từ
        const out = fitVoiceToWords('Đặt máy lên van túi. Rồi bấm nút hút chân không mạnh mẽ.', 6);
        assert.ok(/[.!?]$/.test(out.trim()), `phải kết thúc bằng dấu câu, nhận: "${out}"`);
        assert.ok(out.includes('Đặt máy lên van túi'), 'giữ câu đầu trọn vẹn');
        assert.ok(!out.includes('bấm nút'), 'bỏ câu 2 vì vượt budget');
    });

    await reporter.test('Voice Fit — Phase D', 'Tier 1: KHÔNG kết thúc bằng từ nối cụt (mỗi, trong, và...)', () => {
        const out = fitVoiceToWords('Đây chính xác là thứ bạn cần mang theo mỗi khi đi du lịch xa nhà', 8);
        const lastWord = out.trim().replace(/[.!?]+$/, '').trim().split(/\s+/).pop().toLowerCase();
        assert.ok(!['mỗi', 'trong', 'và', 'của', 'với', 'khi', 'để', 'là', 'cần'].includes(lastWord),
            `không được kết thúc bằng từ nối cụt "${lastWord}" — voice: "${out}"`);
    });

    await reporter.test('Voice Fit — Phase D', 'Tier 2: 1 câu dài quá budget → cắt tại mệnh đề (dấu phẩy) rồi thêm dấu chấm', () => {
        const out = fitVoiceToWords('Chỉ cần đặt máy hút mini lên van, sau đó bấm nút và chờ vài giây là xong', 7);
        assert.ok(/[.!?]$/.test(out.trim()), 'phải có dấu kết câu');
        const wc = out.trim().replace(/[.!?]+$/, '').split(/\s+/).length;
        assert.ok(wc <= 7, `phải <= budget 7 từ, nhận ${wc}`);
    });

    await reporter.test('Voice Fit — Phase D', 'Tier 2: rỗng/không hợp lệ → trả chuỗi rỗng an toàn', () => {
        assert.strictEqual(fitVoiceToWords('', 5), '');
        assert.strictEqual(fitVoiceToWords(null, 5), '');
    });
}

export default { runSubtitleSyncAndRenderTests };
