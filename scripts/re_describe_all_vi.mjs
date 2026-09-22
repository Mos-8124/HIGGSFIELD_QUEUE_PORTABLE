import fs from 'fs';
import path from 'path';

const CACHE_FILE = 'data/translation_cache.json';
const LIB_FILE = 'video_studio_library.json';
const PROJ_FILE = 'video_studio_projects.json';

// Ensure data directory exists
if (!fs.existsSync('data')) {
    fs.mkdirSync('data', { recursive: true });
}

// Read API Key
let apiKey = '';
try {
    const envPath = 'video-analyzer-pipeline/video-analyzer-standalone/.env';
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const match = content.match(/NINE_ROUTER_API_KEY=(.*)/);
        if (match) apiKey = match[1].trim();
    }
} catch (_) {}
if (!apiKey) apiKey = process.env.NINE_ROUTER_API_KEY || '';

// Load Cache
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
    try {
        cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (_) {
        cache = {};
    }
}

function saveCache() {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

const viRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

function needsTranslation(str) {
    if (typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (trimmed.length < 2) return false;
    // If it already has Vietnamese accents, skip
    if (viRegex.test(trimmed)) return false;
    // If it is just a number, timestamp, or punctuation, skip
    if (/^[\d\s:.,\-_/\\#]+$/.test(trimmed)) return false;
    return true;
}

// 1. Gather all unique strings to translate
const toTranslateSet = new Set();

const libData = JSON.parse(fs.readFileSync(LIB_FILE, 'utf8'));
const projData = JSON.parse(fs.readFileSync(PROJ_FILE, 'utf8'));

function collect(str) {
    if (needsTranslation(str) && !cache[str.trim()]) {
        toTranslateSet.add(str.trim());
    }
}

// Collect from projects
projData.projects.forEach(p => {
    ['referenceAnalysis', 'hookAnalysis'].forEach(key => {
        const ana = p[key];
        if (!ana) return;
        collect(ana.summary);
        collect(ana.purpose);
        collect(ana.conclusion);
        if (Array.isArray(ana.visual_events)) {
            ana.visual_events.forEach(ev => {
                collect(ev.description);
                collect(ev.scene);
                if (Array.isArray(ev.actions)) ev.actions.forEach(collect);
                if (Array.isArray(ev.objects)) ev.objects.forEach(collect);
                if (Array.isArray(ev.people)) ev.people.forEach(collect);
            });
        }
        if (Array.isArray(ana.segments)) {
            ana.segments.forEach(s => {
                collect(s.role);
                collect(s.content);
                collect(s.description);
            });
        }
    });
});

// Collect from library
libData.assets.forEach(a => {
    collect(a.aiDescription);
    const events = a.description_index || a.descriptionIndex || [];
    events.forEach(ev => {
        collect(ev.description);
        collect(ev.scene);
        if (Array.isArray(ev.actions)) ev.actions.forEach(collect);
        if (Array.isArray(ev.objects)) ev.objects.forEach(collect);
        if (Array.isArray(ev.people)) ev.people.forEach(collect);
    });
});

const uncachedList = Array.from(toTranslateSet);
console.log(`Total uncached strings to translate via AI: ${uncachedList.length}`);
console.log(`Already in cache: ${Object.keys(cache).length}`);

// 2. Translate in batches using 9Router
async function translateBatch(batch) {
    const prompt = `Translate the following English video descriptions/labels into natural, professional Vietnamese for an e-commerce video studio.
Return a strict JSON array of translated strings with the EXACT same number of elements (${batch.length}) in the exact same order:
["bản dịch 1", "bản dịch 2", ...]

Input array:
${JSON.stringify(batch)}`;

    try {
        const res = await fetch('http://127.0.0.1:20128/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'ag/gemini-3.8-flash-high',
                stream: false,
                messages: [
                    { role: 'system', content: 'You are an AI video description translator. Respond ONLY with a valid JSON array of translated Vietnamese strings.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1
            })
        });

        if (!res.ok) {
            console.error(`Fetch failed with status ${res.status}`);
            return null;
        }

        const data = await res.json();
        let text = data.choices?.[0]?.message?.content || '';
        if (text.startsWith('```json')) text = text.slice(7);
        if (text.startsWith('```')) text = text.slice(3);
        if (text.endsWith('```')) text = text.slice(0, -3);
        const parsed = JSON.parse(text.trim());
        if (Array.isArray(parsed) && parsed.length === batch.length) {
            return parsed;
        } else {
            console.warn(`Batch length mismatch: expected ${batch.length}, got ${parsed?.length}`);
            return null;
        }
    } catch (err) {
        console.error('Batch error:', err.message);
        return null;
    }
}

// Concurrency runner
const BATCH_SIZE = 35;
const CONCURRENCY = 4;

const batches = [];
for (let i = 0; i < uncachedList.length; i += BATCH_SIZE) {
    batches.push(uncachedList.slice(i, i + BATCH_SIZE));
}

console.log(`Split into ${batches.length} batches of max ${BATCH_SIZE} items.`);

async function processAll() {
    let completedBatches = 0;

    for (let i = 0; i < batches.length; i += CONCURRENCY) {
        const chunk = batches.slice(i, i + CONCURRENCY);
        const promises = chunk.map(async (batch, idx) => {
            const batchIdx = i + idx;
            let result = await translateBatch(batch);
            if (!result) {
                // Retry once with smaller slice or fallback
                console.log(`Retrying batch ${batchIdx}...`);
                result = await translateBatch(batch);
            }
            if (result) {
                batch.forEach((orig, bIdx) => {
                    cache[orig] = result[bIdx];
                });
            } else {
                console.error(`Failed batch ${batchIdx}`);
            }
            completedBatches++;
            process.stdout.write(`\r[${completedBatches}/${batches.length}] batches completed (${Math.round(completedBatches / batches.length * 100)}%)`);
        });

        await Promise.all(promises);
        saveCache();
    }

    console.log('\nAll batches finished. Updating library and projects with translations...');

    function t(str) {
        if (!str || typeof str !== 'string') return str;
        const key = str.trim();
        return cache[key] || str;
    }

    // Update Projects
    projData.projects.forEach(p => {
        ['referenceAnalysis', 'hookAnalysis'].forEach(key => {
            const ana = p[key];
            if (!ana) return;
            if (ana.summary) ana.summary = t(ana.summary);
            if (ana.purpose) ana.purpose = t(ana.purpose);
            if (ana.conclusion) ana.conclusion = t(ana.conclusion);
            if (Array.isArray(ana.visual_events)) {
                ana.visual_events.forEach(ev => {
                    if (ev.description) ev.description = t(ev.description);
                    if (ev.scene) ev.scene = t(ev.scene);
                    if (Array.isArray(ev.actions)) ev.actions = ev.actions.map(t);
                    if (Array.isArray(ev.objects)) ev.objects = ev.objects.map(t);
                    if (Array.isArray(ev.people)) ev.people = ev.people.map(t);
                });
            }
            if (Array.isArray(ana.segments)) {
                ana.segments.forEach(s => {
                    if (s.role) s.role = t(s.role);
                    if (s.content) s.content = t(s.content);
                    if (s.description) s.description = t(s.description);
                });
            }
        });
    });

    // Update Library
    libData.assets.forEach(a => {
        if (a.aiDescription) a.aiDescription = t(a.aiDescription);
        const events = a.description_index || a.descriptionIndex || [];
        events.forEach(ev => {
            if (ev.description) ev.description = t(ev.description);
            if (ev.scene) ev.scene = t(ev.scene);
            if (Array.isArray(ev.actions)) ev.actions = ev.actions.map(t);
            if (Array.isArray(ev.objects)) ev.objects = ev.objects.map(t);
            if (Array.isArray(ev.people)) ev.people = ev.people.map(t);
        });
        a.description_index = events;
        a.descriptionIndex = events;
    });

    // Write back
    fs.writeFileSync(PROJ_FILE, JSON.stringify(projData, null, 2), 'utf8');
    fs.writeFileSync(LIB_FILE, JSON.stringify(libData, null, 2), 'utf8');

    console.log('Saved updated video_studio_projects.json and video_studio_library.json!');
}

processAll();
