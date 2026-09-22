import fs from 'fs';

const PROJ_FILE = 'video_studio_projects.json';
const CACHE_FILE = 'data/translation_cache.json';

const proj = JSON.parse(fs.readFileSync(PROJ_FILE, 'utf8'));
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (_) {}
}

let apiKey = '';
try {
    const envPath = 'video-analyzer-pipeline/video-analyzer-standalone/.env';
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const match = content.match(/NINE_ROUTER_API_KEY=(.*)/);
        if (match) apiKey = match[1].trim();
    }
} catch (_) {}

const viRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const toTranslate = [];

proj.projects.forEach(p => {
    const tls = p.timelines || p.batchTimelines || [];
    tls.forEach(t => {
        const dn = t.directorNote;
        if (!dn) return;
        ['hookAngle', 'hookStrategy', 'hookToBodyBridge', 'bridge', 'assetRationale', 'rationale'].forEach(k => {
            const val = dn[k];
            if (typeof val === 'string' && val.trim().length > 2 && !viRegex.test(val) && !cache[val.trim()]) {
                toTranslate.push(val.trim());
            }
        });
    });
});

console.log('Director note strings to translate:', toTranslate.length);

async function run() {
    if (toTranslate.length > 0) {
        const prompt = `Translate the following video production director notes and marketing strategies into natural, professional Vietnamese.
Return a strict JSON array of translated strings with the exact same length (${toTranslate.length}):
["bản dịch 1", ...]

Input JSON array:
${JSON.stringify(toTranslate)}`;

        const res = await fetch('http://127.0.0.1:20128/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify({
                model: 'ag/gemini-3.8-flash-high',
                stream: false,
                messages: [
                    { role: 'system', content: 'You are an AI video producer and translator. Output valid JSON array only.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1
            })
        });

        const data = await res.json();
        let text = data.choices?.[0]?.message?.content || '';
        if (text.startsWith('```json')) text = text.slice(7);
        if (text.startsWith('```')) text = text.slice(3);
        if (text.endsWith('```')) text = text.slice(0, -3);
        const parsed = JSON.parse(text.trim());
        if (Array.isArray(parsed) && parsed.length === toTranslate.length) {
            toTranslate.forEach((orig, idx) => {
                cache[orig] = parsed[idx];
            });
            fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
            console.log('Cached translations successfully!');
        }
    }

    // Apply translations
    function t(str) {
        if (!str || typeof str !== 'string') return str;
        return cache[str.trim()] || str;
    }

    proj.projects.forEach(p => {
        const tls = p.timelines || p.batchTimelines || [];
        tls.forEach(item => {
            const dn = item.directorNote;
            if (!dn) return;
            ['hookAngle', 'hookStrategy', 'hookToBodyBridge', 'bridge', 'assetRationale', 'rationale'].forEach(k => {
                if (dn[k]) dn[k] = t(dn[k]);
            });
        });
    });

    fs.writeFileSync(PROJ_FILE, JSON.stringify(proj, null, 2), 'utf8');
    console.log('Updated projects timelines directorNotes to Vietnamese!');
}

run();
