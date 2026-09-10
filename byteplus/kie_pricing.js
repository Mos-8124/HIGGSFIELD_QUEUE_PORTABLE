export const KIE_CREDIT_USD_RATE = 0.005;

export const SEEDANCE_RATES = {
    '480p': { withVideo: 17, withoutVideo: 28 },
    '720p': { withVideo: 38, withoutVideo: 63 },
    '1080p': { withVideo: 68.5, withoutVideo: 114 }
};

export function calculateKieQuote({ resolution, outputDuration, inputVideoDuration = 0 }) {
    let res = resolution;
    if (!res || !SEEDANCE_RATES[res]) res = '720p'; // default fallback
    
    const outDur = Number(outputDuration) || 4;
    const inDur = Math.max(0, Number(inputVideoDuration) || 0);
    const hasVideo = inDur > 0;
    const rates = SEEDANCE_RATES[res];
    const rate = hasVideo ? rates.withVideo : rates.withoutVideo;
    
    const inputVideoCost = Number((rate * inDur).toFixed(2));
    const outputCost = Number((rate * outDur).toFixed(2));
    const totalCredits = Number((inputVideoCost + outputCost).toFixed(2));
    const usdEquivalent = Number((totalCredits * KIE_CREDIT_USD_RATE).toFixed(4));
    
    return {
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
