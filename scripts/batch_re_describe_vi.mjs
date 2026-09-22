import fs from 'fs';
import path from 'path';

const libPath = 'video_studio_library.json';
const projPath = 'video_studio_projects.json';

const lib = JSON.parse(fs.readFileSync(libPath, 'utf8'));
const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));

const textSet = new Set();

function addText(t) {
    if (typeof t === 'string' && t.trim().length > 1) {
        // If already Vietnamese, skip
        const viRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
        if (!viRegex.test(t)) {
            textSet.add(t.trim());
        }
    }
}

// 1. Projects
proj.projects.forEach(p => {
    ['referenceAnalysis', 'hookAnalysis'].forEach(key => {
        const ana = p[key];
        if (!ana) return;
        addText(ana.summary);
        addText(ana.purpose);
        addText(ana.conclusion);
        if (Array.isArray(ana.visual_events)) {
            ana.visual_events.forEach(ev => {
                addText(ev.description);
                addText(ev.scene);
                if (Array.isArray(ev.actions)) ev.actions.forEach(a => addText(a));
                if (Array.isArray(ev.objects)) ev.objects.forEach(o => addText(o));
            });
        }
    });
});

// 2. Library
lib.assets.forEach(a => {
    addText(a.aiDescription);
    const events = a.description_index || a.descriptionIndex || [];
    events.forEach(ev => {
        addText(ev.description);
        addText(ev.scene);
        if (Array.isArray(ev.actions)) ev.actions.forEach(act => addText(act));
        if (Array.isArray(ev.objects)) ev.objects.forEach(o => addText(o));
    });
});

console.log('Total unique English strings to translate:', textSet.size);
