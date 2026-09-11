/**
 * tests/kie_models.test.js
 *
 * Kiem thu luong da model Seedance qua Kie.ai: 2.5 / 2.0 / 2.0 Fast.
 * Khong goi mang that (chi kiem tra mapping, pricing, validate, build body).
 */
import assert from 'assert';
import { resolveKieModel, KIE_MODELS } from '../byteplus/kie_models.js';
import { calculateKieQuote, MODEL_RATES } from '../byteplus/kie_pricing.js';
import { KieSeedanceProvider } from '../byteplus/providers/kie_seedance_provider.js';
import { createTask } from '../byteplus/task_factory.js';

const S = 'Kie.ai — Multi-Model (2.5 / 2.0 / 2.0 Fast)';

export async function runKieModelsTests(reporter) {

    await reporter.test(S, 'Tier 1: resolveKieModel map dung id cho ca 3 model + alias + default', async () => {
        assert.strictEqual(resolveKieModel('Seedance 2.5').id, 'bytedance/seedance-2-5');
        assert.strictEqual(resolveKieModel('Seedance 2.0 Mini').id, 'bytedance/seedance-2-mini');
        assert.strictEqual(resolveKieModel('Seedance 2.0 Fast').id, 'bytedance/seedance-2-fast');
        // alias theo kie id
        assert.strictEqual(resolveKieModel('bytedance/seedance-2-fast').key, 'Seedance 2.0 Fast');
        // khong khop -> default 2.5
        assert.strictEqual(resolveKieModel('khong-ton-tai').key, 'Seedance 2.5');
        assert.strictEqual(resolveKieModel(undefined).key, 'Seedance 2.5');
    });

    await reporter.test(S, 'Tier 1: gioi han schema tung model dung tai lieu Kie', async () => {
        assert.strictEqual(KIE_MODELS['Seedance 2.5'].maxDuration, 30);
        assert.strictEqual(KIE_MODELS['Seedance 2.0 Mini'].maxDuration, 15);
        assert.strictEqual(KIE_MODELS['Seedance 2.0 Fast'].maxDuration, 15);
        assert.deepStrictEqual(KIE_MODELS['Seedance 2.0 Fast'].resolutions, ['480p', '720p']);
        assert.ok(KIE_MODELS['Seedance 2.5'].resolutions.includes('1080p'));
        assert.strictEqual(KIE_MODELS['Seedance 2.5'].sendOutputFormat, true);
        assert.strictEqual(KIE_MODELS['Seedance 2.0 Mini'].sendOutputFormat, false);
        assert.strictEqual(KIE_MODELS['Seedance 2.0 Fast'].sendOutputFormat, false);
    });

    await reporter.test(S, 'Tier 2: pricing theo tung model — rate khac nhau, cong thuc giong nhau', async () => {
        // Cong thuc: no-video = rate_no x output
        const q25 = calculateKieQuote({ model: 'Seedance 2.5', resolution: '720p', outputDuration: 5, inputVideoDuration: 0 });
        assert.strictEqual(q25.rate, 63);
        assert.strictEqual(q25.totalCredits, 315); // 63 x 5

        const qMini = calculateKieQuote({ model: 'Seedance 2.0 Mini', resolution: '720p', outputDuration: 5, inputVideoDuration: 0 });
        assert.strictEqual(qMini.rate, 8.2);
        assert.strictEqual(qMini.totalCredits, 41); // 8.2 x 5

        const qf = calculateKieQuote({ model: 'Seedance 2.0 Fast', resolution: '720p', outputDuration: 5, inputVideoDuration: 0 });
        assert.strictEqual(qf.rate, 24.8);
        assert.strictEqual(qf.totalCredits, 124); // 24.8 x 5
    });

    await reporter.test(S, 'Tier 2: cong thuc co video input = rate_withVideo x (input + output) — dung chuan Kie', async () => {
        // Fast 480p with video: rate 6.8, input 4 + output 4 = 8 -> 54.4
        const qf = calculateKieQuote({ model: 'Seedance 2.0 Fast', resolution: '480p', outputDuration: 4, inputVideoDuration: 4 });
        assert.strictEqual(qf.rate, 6.8);
        assert.strictEqual(qf.hasVideo, true);
        assert.strictEqual(qf.totalCredits, Number((6.8 * (4 + 4)).toFixed(2))); // 54.4
    });

    await reporter.test(S, 'Tier 2: 2.0 Fast chon 1080p -> tu lui ve do phan giai ho tro (khong vo gia)', async () => {
        const q = calculateKieQuote({ model: 'Seedance 2.0 Fast', resolution: '1080p', outputDuration: 4 });
        assert.strictEqual(q.resolution, '720p');
        assert.ok(!MODEL_RATES['Seedance 2.0 Fast']['1080p']);
    });

    await reporter.test(S, 'Tier 3: buildRequestBody gui dung model id; 2.0/2.0Fast KHONG co output_format', async () => {
        const p = new KieSeedanceProvider({ apiKey: 'k' });
        const b25 = p.buildRequestBody({ prompt: 'x', duration: 10, resolution: '720p', kieModel: 'bytedance/seedance-2-5', references: [] });
        assert.strictEqual(b25.model, 'bytedance/seedance-2-5');
        assert.strictEqual(b25.input.output_format, 'mp4');

        const bMini = p.buildRequestBody({ prompt: 'x', duration: 10, resolution: '720p', kieModel: 'bytedance/seedance-2-mini', references: [] });
        assert.strictEqual(bMini.model, 'bytedance/seedance-2-mini');
        assert.strictEqual(bMini.input.output_format, undefined);

        const bf = p.buildRequestBody({ prompt: 'x', duration: 10, resolution: '720p', kieModel: 'bytedance/seedance-2-fast', references: [] });
        assert.strictEqual(bf.model, 'bytedance/seedance-2-fast');
        assert.strictEqual(bf.input.output_format, undefined);
    });

    await reporter.test(S, 'Tier 3: buildRequestBody clamp thoi luong theo model (2.0 Fast toi da 15s)', async () => {
        const p = new KieSeedanceProvider({ apiKey: 'k' });
        const bf = p.buildRequestBody({ prompt: 'x', duration: 30, resolution: '720p', kieModel: 'bytedance/seedance-2-fast', references: [] });
        assert.strictEqual(bf.input.duration, 15);
        const b25 = p.buildRequestBody({ prompt: 'x', duration: 30, resolution: '720p', kieModel: 'bytedance/seedance-2-5', references: [] });
        assert.strictEqual(b25.input.duration, 30);
    });

    await reporter.test(S, 'Tier 3: validate — 2.0 Fast reject 1080p va reject duration > 15', async () => {
        assert.throws(() => createTask({ creator: 'a', taskName: 't', prompt: 'p', model: 'Seedance 2.0 Fast', duration: 5, resolution: '1080p' }),
            e => Array.isArray(e.errors) && e.errors.some(m => m.includes('1080p')));
        assert.throws(() => createTask({ creator: 'a', taskName: 't', prompt: 'p', model: 'Seedance 2.0 Fast', duration: 25, resolution: '720p' }),
            e => Array.isArray(e.errors) && e.errors.some(m => m.includes('thoi luong')));
    });

    await reporter.test(S, 'Tier 3: createTask luu model + kieModel len task', async () => {
        const t = createTask({ creator: 'a', taskName: 't', prompt: 'p', model: 'Seedance 2.0 Mini', duration: 10, resolution: '720p' });
        assert.strictEqual(t.model, 'Seedance 2.0 Mini');
        assert.strictEqual(t.kieModel, 'bytedance/seedance-2-mini');
        // mac dinh khong truyen model -> 2.5
        const d = createTask({ creator: 'a', taskName: 't', prompt: 'p', duration: 10, resolution: '720p' });
        assert.strictEqual(d.model, 'Seedance 2.5');
        assert.strictEqual(d.kieModel, 'bytedance/seedance-2-5');
    });
}

export default runKieModelsTests;
