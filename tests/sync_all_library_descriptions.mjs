import fs from 'fs';
import path from 'path';

const LIB_FILE = 'video_studio_library.json';
const JOBS_DIR = 'video-analyzer-pipeline/video-analyzer-standalone/data/jobs';

const libData = JSON.parse(fs.readFileSync(LIB_FILE, 'utf8'));

// Build index of all finished jobs in data/jobs
const jobIndex = new Map(); // filename -> jobData
fs.readdirSync(JOBS_DIR).forEach(jobId => {
    const finalPath = path.join(JOBS_DIR, jobId, 'analysis', 'final.json');
    const visualPath = path.join(JOBS_DIR, jobId, 'analysis', 'visual.json');
    if (fs.existsSync(finalPath)) {
        try {
            const fj = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
            let events = fj.visual_events || fj.events || [];
            if ((!events || !events.length) && fs.existsSync(visualPath)) {
                try {
                    const vj = JSON.parse(fs.readFileSync(visualPath, 'utf8'));
                    events = vj.events || [];
                } catch (_) {}
            }
            const videoPath = fj.video?.path || '';
            const filename = path.basename(videoPath);
            if (filename) {
                jobIndex.set(filename, {
                    summary: fj.summary || fj.purpose || fj.conclusion || '',
                    events: events || []
                });
            }
        } catch (_) {}
    }
});

console.log(`Found ${jobIndex.size} indexed analysis jobs in data/jobs`);

let updatedCount = 0;

libData.assets.forEach(asset => {
    const job = jobIndex.get(asset.filename);
    let events = asset.descriptionIndex || asset.description_index || [];
    let summary = asset.aiDescription || '';

    if ((!events.length || !summary) && job) {
        if (!summary && job.summary) summary = job.summary;
        if (!events.length && job.events.length) events = job.events;
    }

    // Clean and normalize all events
    if (events.length > 0) {
        events.forEach(ev => {
            if (Array.isArray(ev.people) && ev.people.length) {
                ev.people = ev.people.map(p => {
                    let s = String(p).trim();
                    s = s.replace(/\[['"]+/g, '').replace(/['"]+\]/g, '').replace(/\s+/g, ' ');
                    return s.trim();
                }).filter(Boolean);
            }

            const sceneName = String(ev.scene || '').trim();
            const descName = String(ev.description || '').trim();

            if (!descName || descName.toLowerCase() === sceneName.toLowerCase() || descName === 'Visual event observed') {
                const parts = [];
                if (Array.isArray(ev.people) && ev.people.length) parts.push(ev.people.join(' · '));
                else if (Array.isArray(ev.actions) && ev.actions.length) parts.push(ev.actions.join(', '));

                if (parts.length > 0) {
                    ev.description = parts.join(' | ');
                }
            }
        });

        asset.described = true;
        asset.aiDescription = summary;
        asset.descriptionIndex = events;
        asset.description_index = events;
        updatedCount++;
    }
});

fs.writeFileSync(LIB_FILE, JSON.stringify(libData, null, 2), 'utf8');
console.log(`Library updated! Total described assets now: ${libData.assets.filter(a => a.described && a.description_index?.length).length} / ${libData.assets.length}`);
