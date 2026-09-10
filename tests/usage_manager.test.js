/**
 * tests/usage_manager.test.js
 *
 * Automated tests for Kie Usage Accounting:
 * - Completely removed fake 50,000 balance
 * - Real Kie balance integration
 * - 13 columns table data structure
 * - Strict rule: NEVER fabricate actual usage
 * - Zero live paid calls
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { UsageManager } from '../byteplus/usage_manager.js';
import { KieSeedanceProvider } from '../byteplus/providers/kie_seedance_provider.js';

export async function runUsageManagerTests(reporter) {
    const suiteName = 'Kie.ai — Usage Accounting & Balance';

    const tmpUsageFile = () => path.join(os.tmpdir(), 'kie-usage-test-' + Math.random().toString(36).slice(2) + '.json');

    // ==========================================
    // TIER 1: REAL BALANCE & REMOVAL OF FAKE 50K
    // ==========================================

    await reporter.test(suiteName, 'Tier 1: Fake 50000 balance is completely removed', () => {
        const filePath = tmpUsageFile();
        const manager = new UsageManager(filePath);
        assert.strictEqual(manager.balance, undefined, 'manager.balance must not be defined or initialized to 50000');
        const summary = manager.getSummary();
        assert.strictEqual(summary.realBalance, null, 'realBalance should be null when not provided from Kie API');
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    await reporter.test(suiteName, 'Tier 1: Real Kie balance is received and reflected from backend', () => {
        const filePath = tmpUsageFile();
        const manager = new UsageManager(filePath);
        const summary = manager.getSummary({ realBalance: 1250.75 });
        assert.strictEqual(summary.realBalance, 1250.75);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    await reporter.test(suiteName, 'Tier 1: KieSeedanceProvider.getRemainingCredits reads from GET /api/v1/chat/credit', async () => {
        const mockFetch = async (url, opts) => {
            assert.ok(url.endsWith('/api/v1/chat/credit'));
            assert.strictEqual(opts.method, 'GET');
            assert.strictEqual(opts.headers.Authorization, 'Bearer test-kie-key');
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    code: 200,
                    msg: 'success',
                    data: 4280.50
                })
            };
        };

        const provider = new KieSeedanceProvider({ apiKey: 'test-kie-key' });
        const balance = await provider.getRemainingCredits({ fetchFn: mockFetch });
        assert.strictEqual(balance, 4280.50, 'Must return exact balance from Kie API data');
    });

    // ==========================================
    // TIER 2: 13-FIELD USAGE RECORD STRUCTURE
    // ==========================================

    await reporter.test(suiteName, 'Tier 2: recordTask tracks all 13 required fields', () => {
        const filePath = tmpUsageFile();
        const manager = new UsageManager(filePath);

        const task = {
            id: 'task_kie_test_101',
            creator: 'Alice Designer',
            taskName: 'Summer Video Shoot 1',
            model: 'bytedance/seedance-2-5',
            resolution: '720p',
            duration: 5,
            inputVideoDuration: 2,
            quote: {
                resolution: '720p',
                outputDuration: 5,
                inputVideoDuration: 2,
                credits: 525,
                usd: 2.625
            },
            billing: {
                creditsConsumed: 525
            },
            status: 'completed'
        };

        const rec = manager.recordTask(task);
        assert.ok(rec, 'Record must be returned');

        // Verify all 13 fields
        assert.ok(rec.time, '1. Time must exist');
        assert.strictEqual(rec.creator, 'Alice Designer', '2. Creator');
        assert.strictEqual(rec.taskName, 'Summer Video Shoot 1', '3. Task Name');
        assert.strictEqual(rec.taskId, 'task_kie_test_101', '4. Task ID');
        assert.strictEqual(rec.model, 'bytedance/seedance-2-5', '5. Model');
        assert.strictEqual(rec.resolution, '720p', '6. Resolution');
        assert.strictEqual(rec.outputDuration, 5, '7. Output Duration');
        assert.strictEqual(rec.inputVideoDuration, 2, '8. Input Video Duration');
        assert.strictEqual(rec.estimatedCredits, 525, '9. Estimated Credits');
        assert.strictEqual(rec.actualCredits, 525, '10. Actual Credits');
        assert.strictEqual(rec.estimatedUsd, 2.625, '11. Estimated USD');
        assert.strictEqual(rec.actualUsd, 2.625, '12. Actual USD');
        assert.strictEqual(rec.status, 'completed', '13. Status');

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    // ==========================================
    // TIER 3: NEVER FABRICATE ACTUAL USAGE
    // ==========================================

    await reporter.test(suiteName, 'Tier 3: actualCredits is strictly NULL when Kie creditsConsumed is not available', () => {
        const filePath = tmpUsageFile();
        const manager = new UsageManager(filePath);

        // Task has quote (estimated 315 credits) but pending/failed without billing
        const pendingTask = {
            id: 'task_kie_pending_1',
            creator: 'Bob',
            taskName: 'Preview Shot',
            resolution: '720p',
            duration: 5,
            quote: {
                credits: 315
            },
            status: 'running'
        };

        const rec = manager.recordTask(pendingTask);
        assert.strictEqual(rec.estimatedCredits, 315, 'Estimated credits should be 315');
        assert.strictEqual(rec.actualCredits, null, 'actualCredits MUST be null, never fabricated from estimate');
        assert.strictEqual(rec.actualUsd, null, 'actualUsd MUST be null');

        // Total consumed summary must NOT count null actualCredits
        const summary = manager.getSummary();
        assert.strictEqual(summary.totalConsumed, 0, 'totalConsumed must only sum actual credits');

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    await reporter.test(suiteName, 'Tier 3: File persistence and atomic reload of usage records', () => {
        const filePath = tmpUsageFile();
        const m1 = new UsageManager(filePath);
        m1.recordTask({
            id: 'task_persisted_1',
            creator: 'User 1',
            status: 'completed',
            billing: { creditsConsumed: 100 }
        });

        // Load with a new instance
        const m2 = new UsageManager(filePath);
        const sum = m2.getSummary();
        assert.strictEqual(sum.records.length, 1);
        assert.strictEqual(sum.records[0].taskId, 'task_persisted_1');
        assert.strictEqual(sum.records[0].actualCredits, 100);
        assert.strictEqual(sum.totalConsumed, 100);

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
}
