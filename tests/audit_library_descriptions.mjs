import fs from 'fs';

const data = JSON.parse(fs.readFileSync('video_studio_library.json', 'utf8'));

console.log(`Total assets in store: ${data.assets.length}`);

let issues = [];

data.assets.forEach((a, i) => {
    const events = a.descriptionIndex || a.description_index || [];
    const sameDescScene = events.filter(e => e.description && e.scene && e.description.toLowerCase().trim() === e.scene.toLowerCase().trim()).length;
    const hasBracketPeople = events.filter(e => Array.isArray(e.people) && e.people.some(p => p.includes("['") || p.includes("']"))).length;
    const missingAiDesc = !a.aiDescription || a.aiDescription.trim().length === 0;
    const notDescribed = !a.described || events.length === 0;

    const issueTypes = [];
    if (notDescribed) issueTypes.push('CHƯA_MÔ_TẢ');
    if (missingAiDesc) issueTypes.push('THIẾU_AI_DESC');
    if (sameDescScene > 0) issueTypes.push(`DESC_TRÙNG_SCENE(${sameDescScene}/${events.length})`);
    if (hasBracketPeople > 0) issueTypes.push(`PEOPLE_LỖI_BRACKETS(${hasBracketPeople})`);

    console.log(`#${i+1} [${a.asset_id}] ${a.filename}:`);
    console.log(`    Status: described=${a.described}, events=${events.length}, issues=${issueTypes.join(', ') || 'OK'}`);
    if (events.length > 0) {
        console.log(`    Sample event #1: scene="${events[0].scene}", desc="${events[0].description}", people=${JSON.stringify(events[0].people)}`);
    }

    if (issueTypes.length > 0) {
        issues.push({ id: a.asset_id, file: a.filename, path: a.path, issues: issueTypes });
    }
});

console.log('\n--- SUMMARY OF ISSUES ---');
console.log(`Total with issues: ${issues.length} / ${data.assets.length}`);
console.log(JSON.stringify(issues, null, 2));
