import fs from 'fs';

const FILE = 'video_studio_library.json';
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

let fixedCount = 0;

data.assets.forEach(asset => {
    const events = asset.descriptionIndex || asset.description_index || [];
    if (!events.length) return;

    events.forEach(ev => {
        let changed = false;

        // 1. Clean brackets in people array
        if (Array.isArray(ev.people) && ev.people.length) {
            const cleaned = ev.people.map(p => {
                let s = String(p).trim();
                s = s.replace(/\[['"]+/g, '').replace(/['"]+\]/g, '').replace(/\s+/g, ' ');
                return s.trim();
            }).filter(Boolean);

            if (JSON.stringify(cleaned) !== JSON.stringify(ev.people)) {
                ev.people = cleaned;
                changed = true;
            }
        }

        // 2. If description is empty or duplicates scene, use rich people/actions
        const sceneName = String(ev.scene || '').trim();
        const descName = String(ev.description || '').trim();

        if (!descName || descName.toLowerCase() === sceneName.toLowerCase() || descName === 'Visual event observed') {
            const parts = [];
            if (Array.isArray(ev.people) && ev.people.length) {
                parts.push(ev.people.join(' · '));
            } else if (Array.isArray(ev.actions) && ev.actions.length) {
                parts.push(ev.actions.join(', '));
            }

            if (parts.length > 0) {
                ev.description = parts.join(' | ');
                changed = true;
            }
        }

        if (changed) fixedCount++;
    });

    asset.descriptionIndex = events;
    asset.description_index = events;
});

fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
console.log(`Cleaned and enriched ${fixedCount} events in ${FILE}`);
