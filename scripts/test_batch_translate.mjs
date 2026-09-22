import fs from 'fs';
import path from 'path';

let apiKey = '';
try {
    const envPath = 'video-analyzer-pipeline/video-analyzer-standalone/.env';
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const match = content.match(/NINE_ROUTER_API_KEY=(.*)/);
        if (match) apiKey = match[1].trim();
    }
} catch (_) {}

const sampleBatch = [
    "Two people displaying their hands",
    "Indoor setting",
    "Gold rings",
    "Extending hands flat to display matching heart-themed manicures in light pink and deep red",
    "To showcase matching Valentine-themed nail art between two friends for social media inspiration.",
    "Curling fingers side-by-side to showcase the matching nail sets from another angle",
    "To promote and advertise custom personalized press-on nail sets from Elva Nails",
    "The video is a lifestyle-oriented direct-response advertisement for Elva Nails."
];

async function testBatch() {
    const t0 = Date.now();
    const prompt = `Translate the following English video descriptions/labels into natural, fluent, professional Vietnamese for an e-commerce video studio.
Return a strict JSON array of translated strings with the exact same length and order as input:
["bản dịch 1", "bản dịch 2", ...]

Input JSON array:
${JSON.stringify(sampleBatch)}`;

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
                { role: 'system', content: 'You are an AI video description translator. Respond ONLY with a valid JSON array of translated Vietnamese strings.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.2
        })
    });

    const data = await res.json();
    let text = data.choices?.[0]?.message?.content || '';
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    const parsed = JSON.parse(text.trim());
    console.log(`Took ${Date.now() - t0}ms, received ${parsed.length}/${sampleBatch.length} translations:`);
    console.log(parsed);
}

testBatch();
