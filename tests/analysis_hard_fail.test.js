/**
 * TDD — Phân tích video (Step 2) PHẢI lỗi ngay nếu "AI" (LLM vision) không gọi được API,
 * KHÔNG cho phép hoàn tất step 2 với kết quả rỗng/bịa (rule §13 mock≠real, §41 không nuốt lỗi).
 *
 * Test hàm thuần `isReferenceAnalysisUsable(result)` (export từ video_studio/index.js) — quyết định
 * kết quả analyzer có "dùng được" (AI thật sự đã phân tích) hay không.
 */
import assert from 'assert';
import { isReferenceAnalysisUsable } from '../byteplus/video_studio/index.js';

const goodEvents = [{ start: 0, end: 2, scene: 'phòng khách', description: 'người cầm máy hút bụi' }];

export async function runAnalysisHardFailTests(reporter) {
    await reporter.test('Analysis Hard-Fail — Step 2 Guard', 'Tier 1: kết quả AI đầy đủ → dùng được', () => {
        const r = isReferenceAnalysisUsable({
            status: 'success', visual_status: 'success', visual_events: goodEvents, summary: 'Video quảng cáo máy hút bụi'
        });
        assert.strictEqual(r.ok, true, 'analysis đầy đủ phải ok');
    });

    await reporter.test('Analysis Hard-Fail — Step 2 Guard', 'Tier 1: partial nhưng có visual_events + summary thật → vẫn dùng được', () => {
        const r = isReferenceAnalysisUsable({
            status: 'partial', visual_status: 'partial', visual_events: goodEvents,
            summary: 'Video quảng cáo máy hút bụi cầm tay', purpose: 'Quảng cáo sản phẩm'
        });
        assert.strictEqual(r.ok, true, 'AI chạy được một phần vẫn chấp nhận');
    });

    await reporter.test('Analysis Hard-Fail — Step 2 Guard', 'Tier 1: summary GENERIC mặc định + purpose rỗng → KHÔNG dùng được (bịa)', () => {
        const r = isReferenceAnalysisUsable({
            status: 'success', visual_status: 'success', visual_events: goodEvents,
            summary: 'Video multimodal analysis completed.', purpose: ''
        });
        assert.strictEqual(r.ok, false, 'summary generic + purpose rỗng phải bị coi là AI bịa/không phân tích');
    });

    await reporter.test('Analysis Hard-Fail — Step 2 Guard', 'Tier 2: summary rỗng + purpose rỗng → KHÔNG dùng được', () => {
        const r = isReferenceAnalysisUsable({
            status: 'success', visual_status: 'success', visual_events: goodEvents, summary: '', purpose: ''
        });
        assert.strictEqual(r.ok, false);
    });

    await reporter.test('Analysis Hard-Fail — Step 2 Guard', 'Tier 2: summary generic NHƯNG có purpose thật → vẫn dùng được', () => {
        const r = isReferenceAnalysisUsable({
            status: 'success', visual_status: 'success', visual_events: goodEvents,
            summary: 'Video analysis completed.', purpose: 'Quảng cáo máy hút bụi nhắm mẹ bỉm sữa'
        });
        assert.strictEqual(r.ok, true, 'có purpose thật thì chấp nhận dù summary generic');
    });

    await reporter.test('Analysis Hard-Fail — Step 2 Guard', 'Tier 1: null/undefined → KHÔNG dùng được', () => {
        assert.strictEqual(isReferenceAnalysisUsable(null).ok, false);
        assert.strictEqual(isReferenceAnalysisUsable(undefined).ok, false);
    });

    await reporter.test('Analysis Hard-Fail — Step 2 Guard', 'Tier 1: status=failed → KHÔNG dùng được (AI không call được API)', () => {
        const r = isReferenceAnalysisUsable({ status: 'failed', visual_status: 'failed', visual_events: [] });
        assert.strictEqual(r.ok, false);
        assert.ok(r.reason && r.reason.length > 0, 'phải nêu lý do lỗi rõ ràng');
    });

    await reporter.test('Analysis Hard-Fail — Step 2 Guard', 'Tier 1: visual_status=failed → KHÔNG dùng được', () => {
        const r = isReferenceAnalysisUsable({ status: 'partial', visual_status: 'failed', visual_events: [] });
        assert.strictEqual(r.ok, false, 'vision AI fail thì không được done step 2');
    });

    await reporter.test('Analysis Hard-Fail — Step 2 Guard', 'Tier 2: visual_events RỖNG (AI không sinh gì) → KHÔNG dùng được', () => {
        const r = isReferenceAnalysisUsable({ status: 'success', visual_status: 'success', visual_events: [] });
        assert.strictEqual(r.ok, false, 'không có visual event nghĩa là AI vision không thật sự phân tích');
    });

    await reporter.test('Analysis Hard-Fail — Step 2 Guard', 'Tier 2: thiếu field visual_events → KHÔNG dùng được', () => {
        const r = isReferenceAnalysisUsable({ status: 'success', summary: 'abc' });
        assert.strictEqual(r.ok, false);
    });

    await reporter.test('Analysis Hard-Fail — Step 2 Guard', 'Tier 2: mọi trường hợp fail đều kèm reason chuỗi', () => {
        for (const bad of [null, { status: 'failed' }, { visual_status: 'failed' }, { visual_events: [] }]) {
            const r = isReferenceAnalysisUsable(bad);
            assert.strictEqual(r.ok, false);
            assert.ok(typeof r.reason === 'string' && r.reason.length > 0, 'reason phải là chuỗi mô tả');
        }
    });
}

export default { runAnalysisHardFailTests };
