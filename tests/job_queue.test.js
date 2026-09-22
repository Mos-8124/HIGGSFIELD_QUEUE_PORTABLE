/**
 * tests/job_queue.test.js
 *
 * TDD cho HÀNG ĐỢI ĐA NGƯỜI DÙNG (backlog 2026-09-18).
 * Quyết định của user: xếp hàng theo PROJECT, FIFO thuần theo thứ tự bấm
 * ("cứ project nào yêu cầu trước thì thực hiện của project đó trước"),
 * mỗi lúc chỉ 1 project render; step 3 sinh kịch bản cũng chặn ở 10 luồng.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { FifoQueue, renderQueue, scriptGate, runWithLimit } from '../byteplus/video_studio/job_queue.js';

const S = 'Job Queue — Hàng đợi đa người dùng';
const tick = (ms) => new Promise(r => setTimeout(r, ms));

export async function runJobQueueTests(reporter) {
    const studioIndex = fs.readFileSync(path.resolve('byteplus/video_studio/index.js'), 'utf8');
    const timelineGen = fs.readFileSync(path.resolve('byteplus/video_studio/timeline_generator.js'), 'utf8');
    const v2vJs = fs.readFileSync(path.resolve('public/studio/video-to-video.js'), 'utf8');
    const v2vHtml = fs.readFileSync(path.resolve('public/studio/video-to-video.html'), 'utf8');
    const v2vCss = fs.readFileSync(path.resolve('public/studio/video-to-video.css'), 'utf8');

    // ── A. Thứ tự FIFO & chỉ 1 project chạy ────────────────────────────────
    await reporter.test(S, 'Tier 1: chạy ĐÚNG thứ tự bấm (FIFO)', async () => {
        const q = new FifoQueue({ concurrency: 1 });
        const order = [];
        await Promise.all([
            q.enqueue('p1', async () => { await tick(30); order.push('p1'); }),
            q.enqueue('p2', async () => { await tick(5); order.push('p2'); }),
            q.enqueue('p3', async () => { order.push('p3'); })
        ]);
        assert.deepStrictEqual(order, ['p1', 'p2', 'p3'], 'phải chạy theo thứ tự vào hàng');
    });

    await reporter.test(S, 'Tier 1: KHÔNG bao giờ có 2 project chạy cùng lúc', async () => {
        const q = new FifoQueue({ concurrency: 1 });
        let running = 0, peak = 0;
        await Promise.all(['a', 'b', 'c', 'd'].map(k => q.enqueue(k, async () => {
            running++; peak = Math.max(peak, running);
            await tick(15);
            running--;
        })));
        assert.strictEqual(peak, 1, `tối đa 1 project chạy cùng lúc, nhận ${peak}`);
    });

    await reporter.test(S, 'Tier 1: vị trí trong hàng đợi đúng (0 = đang chạy)', async () => {
        const q = new FifoQueue({ concurrency: 1 });
        const p1 = q.enqueue('p1', async () => { await tick(40); });
        const p2 = q.enqueue('p2', async () => {});
        const p3 = q.enqueue('p3', async () => {});
        await tick(5);
        assert.strictEqual(q.position('p1'), 0, 'p1 đang chạy → vị trí 0');
        assert.strictEqual(q.position('p2'), 1, 'p2 chờ đầu tiên → vị trí 1');
        assert.strictEqual(q.position('p3'), 2, 'p3 chờ thứ hai → vị trí 2');
        assert.strictEqual(q.position('khong-co'), -1, 'project lạ → -1');
        await Promise.all([p1, p2, p3]);
    });

    // ── B. Chống bấm trùng ─────────────────────────────────────────────────
    await reporter.test(S, 'Tier 1: has() nhận biết project đang chờ HOẶC đang chạy', async () => {
        const q = new FifoQueue({ concurrency: 1 });
        const job = q.enqueue('px', async () => { await tick(25); });
        assert.strictEqual(q.has('px'), true, 'đang chạy phải báo có');
        await job;
        assert.strictEqual(q.has('px'), false, 'xong rồi phải nhả ra');
    });

    await reporter.test(S, 'Tier 1: job LỖI vẫn nhả khoá, hàng đợi chạy tiếp', async () => {
        const q = new FifoQueue({ concurrency: 1 });
        const done = [];
        const bad = q.enqueue('bad', async () => { throw new Error('no'); }).catch(e => done.push('bad:' + e.message));
        const good = q.enqueue('good', async () => { done.push('good'); });
        await Promise.all([bad, good]);
        assert.ok(done.includes('bad:no'), 'lỗi phải ném ra cho người gọi');
        assert.ok(done.includes('good'), 'job sau vẫn phải chạy');
        assert.strictEqual(q.has('bad'), false, 'job lỗi không được kẹt khoá vĩnh viễn');
    });

    // ── C. Ảnh chụp hàng đợi cho UI ────────────────────────────────────────
    await reporter.test(S, 'Tier 2: snapshot() trả đang chạy + đang chờ theo thứ tự', async () => {
        const q = new FifoQueue({ concurrency: 1 });
        const jobs = [
            q.enqueue('r1', async () => { await tick(40); }),
            q.enqueue('w1', async () => {}),
            q.enqueue('w2', async () => {})
        ];
        await tick(5);
        const snap = q.snapshot();
        assert.deepStrictEqual(snap.running, ['r1'], 'phải liệt kê project đang chạy');
        assert.deepStrictEqual(snap.waiting, ['w1', 'w2'], 'phải liệt kê project đang chờ đúng thứ tự');
        assert.strictEqual(snap.total, 3);
        await Promise.all(jobs);
    });

    await reporter.test(S, 'Tier 2: renderQueue dung chung, moi luc 1 project', () => {
        assert.ok(renderQueue instanceof FifoQueue, 'phải export sẵn hàng đợi render dùng chung');
        assert.strictEqual(renderQueue.concurrency, 1, 'mỗi lúc chỉ dựng 1 project');
    });

    // ── D. Trần sinh kịch bản step 3 = 10 ──────────────────────────────────
    await reporter.test(S, 'Tier 1: runWithLimit không vượt trần đồng thời', async () => {
        let running = 0, peak = 0;
        await runWithLimit(Array.from({ length: 25 }, (_, i) => i), 10, async () => {
            running++; peak = Math.max(peak, running);
            await tick(8);
            running--;
        });
        assert.ok(peak <= 10, `tối đa 10 luồng, nhận ${peak}`);
        assert.ok(peak >= 9, `phải dùng gần hết trần cho nhanh, nhận ${peak}`);
    });

    await reporter.test(S, 'Tier 1: scriptGate chặn 10 luồng TOÀN CỤC (nhiều user cộng lại)', async () => {
        let running = 0, peak = 0;
        const work = async () => scriptGate.run(async () => {
            running++; peak = Math.max(peak, running);
            await tick(10);
            running--;
        });
        await Promise.all(Array.from({ length: 30 }, work));
        assert.ok(peak <= 10, `toàn hệ thống tối đa 10 kịch bản một lượt, nhận ${peak}`);
    });

    await reporter.test(S, 'Tier 2: step 3 KHÔNG còn Promise.all bắn hết cùng lúc', () => {
        assert.ok(/scriptGate|runWithLimit/.test(timelineGen),
            'generateBatchTimelines phải đi qua cổng giới hạn');
        assert.ok(!/const rawResults = await Promise\.all\(promises\)/.test(timelineGen),
            'không được bắn toàn bộ request LLM cùng lúc nữa');
    });

    // ── E. Nối vào route ───────────────────────────────────────────────────
    await reporter.test(S, 'Tier 1: route assemble đi qua hàng đợi', () => {
        assert.ok(/renderQueue\.enqueue\(/.test(studioIndex), 'assemble phải enqueue thay vì chạy thẳng');
    });

    await reporter.test(S, 'Tier 1: bấm trùng → 409 ALREADY_QUEUED', () => {
        assert.ok(/ALREADY_QUEUED/.test(studioIndex), 'phải có mã lỗi ALREADY_QUEUED');
        assert.ok(/status\(409\)/.test(studioIndex), 'phải trả HTTP 409 khi project đã trong hàng đợi');
    });

    await reporter.test(S, 'Tier 2: có API xem hàng đợi toàn hệ thống', () => {
        assert.ok(/router\.get\('\/queue'/.test(studioIndex), 'phải có GET /queue');
    });

    await reporter.test(S, 'Tier 2: render-progress trả vị trí hàng đợi', () => {
        assert.ok(/queuePosition/.test(studioIndex), 'render-progress phải kèm queuePosition');
    });

    // ── F. Giao diện ───────────────────────────────────────────────────────
    await reporter.test(S, 'Tier 2: có card hàng đợi cạnh thư viện, thư viện 70%', () => {
        assert.ok(/id="v2v-queue-card"/.test(v2vHtml), 'phải có card hàng đợi');
        assert.ok(/v2v-library-row/.test(v2vHtml), 'thư viện + hàng đợi phải nằm chung 1 hàng');
        assert.ok(/v2v-library-row/.test(v2vCss), 'CSS phải định nghĩa bố cục hàng này');
        assert.ok(/70%|0\.7|7fr/.test(v2vCss), 'thư viện chiếm ~70% chiều rộng');
    });

    await reporter.test(S, 'Tier 2: danh sách hàng đợi có thanh cuộn', () => {
        assert.ok(/v2v-queue-list[\s\S]{0,300}overflow-y\s*:\s*auto/.test(v2vCss),
            'danh sách hàng đợi phải cuộn được');
    });

    await reporter.test(S, 'Tier 2: badge hàng đợi luôn thấy trên đầu trang', () => {
        assert.ok(/v2v-queue-badge/.test(v2vHtml) && /v2v-queue-badge/.test(v2vJs),
            'phải có badge hàng đợi ở khu status pill và JS cập nhật nó');
    });

    await reporter.test(S, 'Tier 2: card step 5 hiện "trước bạn còn N"', () => {
        assert.ok(/trước bạn/i.test(v2vJs), 'card render phải hiện vị trí chờ cho dễ hiểu');
    });
}

export default { runJobQueueTests };
