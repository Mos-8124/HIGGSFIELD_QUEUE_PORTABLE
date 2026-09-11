import { resolveKieModel, DEFAULT_MODEL_KEY } from './kie_models.js';

export const KIE_CREDIT_USD_RATE = 0.005;

/**
 * Bang gia credit/giay theo TUNG model va do phan giai.
 * Cach tinh (giong nhau moi model, dung chuan Kie):
 *   Khong video input  -> credits = rate_no_video  x outputDuration
 *   Co video input     -> credits = rate_with_video x (inputVideoDuration + outputDuration)
 *
 * Nguon rate (xac minh truc tiep tren kie.ai 2026-09-11) — tat ca CONFIRMED:
 * - Seedance 2.5:      kie.ai/seedance-2-5   (khop he thong tu truoc).
 * - Seedance 2.0 Mini: kie.ai/seedance-2-0-mini (model bytedance/seedance-2-mini).
 * - Seedance 2.0 Fast: kie.ai/seedance-2-0   (model bytedance/seedance-2-fast).
 *
 * Du sao, SO TRU THUC TE luon lay tu recordInfo.creditsConsumed cua Kie;
 * bang nay chi de hien thi uoc tinh truoc khi gui.
 */
export const MODEL_RATES = {
    // key = ten hien thi trong kie_models.js. Moi o: { withVideo, withoutVideo } credits/giay.
    // CONFIRMED kie.ai/seedance-2-5 (uu dai 1080p 28% da phan anh trong so).
    'Seedance 2.5': {
        '480p':  { withVideo: 17,   withoutVideo: 28 },
        '720p':  { withVideo: 38,   withoutVideo: 63 },
        '1080p': { withVideo: 68.5, withoutVideo: 114 }
    },
    // CONFIRMED kie.ai/seedance-2-0-mini (chi 480p/720p; re nhat).
    'Seedance 2.0 Mini': {
        '480p':  { withVideo: 2.4, withoutVideo: 3.8 },
        '720p':  { withVideo: 5.0, withoutVideo: 8.2 }
    },
    // CONFIRMED kie.ai/seedance-2-0 (model bytedance/seedance-2-fast; chi 480p/720p).
    'Seedance 2.0 Fast': {
        '480p':  { withVideo: 6.8, withoutVideo: 11.7 },
        '720p':  { withVideo: 15,  withoutVideo: 24.8 }
    }
};

// Giu bien cu de tuong thich nguoc (mac dinh Seedance 2.5).
export const SEEDANCE_RATES = MODEL_RATES['Seedance 2.5'];

export function calculateKieQuote({ resolution, outputDuration, inputVideoDuration = 0, model } = {}) {
    const modelEntry = resolveKieModel(model);
    const table = MODEL_RATES[modelEntry.key] || MODEL_RATES[DEFAULT_MODEL_KEY];

    let res = resolution;
    if (!res || !table[res]) {
        // Do phan giai khong ho tro boi model nay -> lui ve 720p neu co, khong thi lay cai dau tien.
        res = table['720p'] ? '720p' : Object.keys(table)[0];
    }

    const outDur = Number(outputDuration) || 4;
    const inDur = Math.max(0, Number(inputVideoDuration) || 0);
    const hasVideo = inDur > 0;
    const rates = table[res];
    const rate = hasVideo ? rates.withVideo : rates.withoutVideo;
    
    const inputVideoCost = Number((rate * inDur).toFixed(2));
    const outputCost = Number((rate * outDur).toFixed(2));
    const totalCredits = Number((inputVideoCost + outputCost).toFixed(2));
    const usdEquivalent = Number((totalCredits * KIE_CREDIT_USD_RATE).toFixed(4));
    
    return {
        model: modelEntry.key,
        modelId: modelEntry.id,
        resolution: res,
        outputDuration: outDur,
        totalInputVideoDuration: inDur,
        inputVideoDuration: inDur,
        rate,
        rateApplied: rate,
        hasVideo,
        inputVideoCost,
        outputCost,
        totalCredits,
        credits: totalCredits,
        inputCost: inputVideoCost,
        usdEquivalent,
        usd: usdEquivalent
    };
}
