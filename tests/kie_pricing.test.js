/**
 * tests/kie_pricing.test.js
 *
 * Automated tests for Kie Seedance 2.5 Pricing logic:
 * - Resolution rates (480p, 720p, 1080p with and without video)
 * - 8 required breakdown fields:
 *   resolution, output duration, total input video duration, rate,
 *   input-video cost, output cost, total credits, USD equivalent
 * - Zero live paid calls
 */
import assert from 'assert';
import { calculateKieQuote, KIE_CREDIT_USD_RATE } from '../byteplus/kie_pricing.js';

export async function runKiePricingTests(reporter) {
    const suiteName = 'Kie.ai — Pricing & Cost Breakdown';

    // ==========================================
    // TIER 1: CORE PRICING & BREAKDOWN FIELDS
    // ==========================================

    await reporter.test(suiteName, 'Tier 1: 480p without video uses rate 28 cr/s', () => {
        const quote = calculateKieQuote({ resolution: '480p', outputDuration: 5, inputVideoDuration: 0 });
        assert.strictEqual(quote.resolution, '480p');
        assert.strictEqual(quote.rate, 28);
        assert.strictEqual(quote.outputDuration, 5);
        assert.strictEqual(quote.totalInputVideoDuration, 0);
        assert.strictEqual(quote.inputVideoCost, 0);
        assert.strictEqual(quote.outputCost, 140);
        assert.strictEqual(quote.totalCredits, 140);
        assert.strictEqual(quote.usdEquivalent, 0.70);
    });

    await reporter.test(suiteName, 'Tier 1: 480p with video uses rate 17 cr/s for both input and output', () => {
        const quote = calculateKieQuote({ resolution: '480p', outputDuration: 4, inputVideoDuration: 4 });
        assert.strictEqual(quote.resolution, '480p');
        assert.strictEqual(quote.rate, 17);
        assert.strictEqual(quote.outputDuration, 4);
        assert.strictEqual(quote.totalInputVideoDuration, 4);
        assert.strictEqual(quote.inputVideoCost, 68);  // 4s * 17 cr/s
        assert.strictEqual(quote.outputCost, 68);      // 4s * 17 cr/s
        assert.strictEqual(quote.totalCredits, 136);   // 68 + 68 = 136
        assert.strictEqual(quote.usdEquivalent, 0.68); // 136 * 0.005
    });

    await reporter.test(suiteName, 'Tier 1: 720p rates (63 cr/s without video, 38 cr/s with video)', () => {
        const noVid = calculateKieQuote({ resolution: '720p', outputDuration: 5, inputVideoDuration: 0 });
        assert.strictEqual(noVid.rate, 63);
        assert.strictEqual(noVid.totalCredits, 315); // 5 * 63

        const withVid = calculateKieQuote({ resolution: '720p', outputDuration: 5, inputVideoDuration: 2 });
        assert.strictEqual(withVid.rate, 38);
        assert.strictEqual(withVid.inputVideoCost, 76);  // 2 * 38
        assert.strictEqual(withVid.outputCost, 190);     // 5 * 38
        assert.strictEqual(withVid.totalCredits, 266);   // 76 + 190
    });

    await reporter.test(suiteName, 'Tier 1: 1080p rates (114 cr/s without video, 68.5 cr/s with video)', () => {
        const noVid = calculateKieQuote({ resolution: '1080p', outputDuration: 4, inputVideoDuration: 0 });
        assert.strictEqual(noVid.rate, 114);
        assert.strictEqual(noVid.totalCredits, 456);

        const withVid = calculateKieQuote({ resolution: '1080p', outputDuration: 10, inputVideoDuration: 4 });
        assert.strictEqual(withVid.rate, 68.5);
        assert.strictEqual(withVid.inputVideoCost, 274);  // 4 * 68.5
        assert.strictEqual(withVid.outputCost, 685);      // 10 * 68.5
        assert.strictEqual(withVid.totalCredits, 959);    // 274 + 685
    });

    await reporter.test(suiteName, 'Tier 1: All 8 required breakdown fields must exist in quote', () => {
        const quote = calculateKieQuote({ resolution: '720p', outputDuration: 5, inputVideoDuration: 3 });
        const requiredKeys = [
            'resolution',
            'outputDuration',
            'totalInputVideoDuration',
            'rate',
            'inputVideoCost',
            'outputCost',
            'totalCredits',
            'usdEquivalent'
        ];
        for (const key of requiredKeys) {
            assert.ok(key in quote, 'Missing breakdown key: ' + key);
            assert.notStrictEqual(quote[key], undefined, 'Breakdown key ' + key + ' should not be undefined');
        }
    });

    // ==========================================
    // TIER 2: EDGE CASES & BACKWARD COMPATIBILITY
    // ==========================================

    await reporter.test(suiteName, 'Tier 2: Fallback to defaults when parameters missing or invalid', () => {
        const fallback = calculateKieQuote({});
        assert.strictEqual(fallback.resolution, '720p', 'Default resolution should be 720p');
        assert.strictEqual(fallback.outputDuration, 4, 'Default duration should be 4s');
        assert.strictEqual(fallback.totalInputVideoDuration, 0);
        assert.strictEqual(fallback.rate, 63);
        assert.strictEqual(fallback.totalCredits, 252); // 4 * 63
    });

    await reporter.test(suiteName, 'Tier 2: Backward compatibility aliases (credits, usd, inputCost)', () => {
        const q = calculateKieQuote({ resolution: '480p', outputDuration: 4, inputVideoDuration: 2 });
        assert.strictEqual(q.credits, q.totalCredits);
        assert.strictEqual(q.usd, q.usdEquivalent);
        assert.strictEqual(q.inputCost, q.inputVideoCost);
    });

    await reporter.test(suiteName, 'Tier 2: Fractional video duration rounds credits to 2 decimals', () => {
        const q = calculateKieQuote({ resolution: '720p', outputDuration: 5, inputVideoDuration: 2.333 });
        assert.strictEqual(q.inputVideoCost, Number((2.333 * 38).toFixed(2)));
        assert.strictEqual(q.totalCredits, Number((q.inputVideoCost + q.outputCost).toFixed(2)));
        assert.strictEqual(q.usdEquivalent, Number((q.totalCredits * KIE_CREDIT_USD_RATE).toFixed(4)));
    });
}
