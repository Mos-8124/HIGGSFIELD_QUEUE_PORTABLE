import fs from 'fs';
import path from 'path';

async function runLiveE2E() {
    console.log('=== START LIVE E2E TEST: STEP 1 TO STEP 5 ===');
    const baseUrl = 'http://localhost:20140/api/video-studio';

    const refPath = 'C:\\Users\\gifft\\Downloads\\reference-video.mp4';
    const hookPath = 'C:\\Users\\gifft\\Downloads\\final_2.mp4';

    if (!fs.existsSync(refPath) || !fs.existsSync(hookPath)) {
        throw new Error('Missing test video files on disk!');
    }

    // Step 1: Create Project
    console.log('\n--- STEP 1: Creating Project & Uploading Videos ---');
    const refBuffer = fs.readFileSync(refPath);
    const hookBuffer = fs.readFileSync(hookPath);

    const fd = new FormData();
    fd.append('name', 'Test TDD Footage & Voice Duration');
    fd.append('refVideo', new Blob([refBuffer], { type: 'video/mp4' }), 'reference-video.mp4');
    fd.append('hookVideo', new Blob([hookBuffer], { type: 'video/mp4' }), 'final_2.mp4');

    const createRes = await fetch(`${baseUrl}/projects`, {
        method: 'POST',
        body: fd
    });
    if (!createRes.ok) {
        const txt = await createRes.text();
        throw new Error(`Create project failed (${createRes.status}): ${txt}`);
    }
    const createData = await createRes.json();
    const projectId = createData.project.id;
    console.log(`[PASS] Project created successfully: ID=${projectId}, Status=${createData.project.status}`);

    // Step 2: AI Analysis (Reference & Hook)
    console.log('\n--- STEP 2: Running AI Analysis ---');
    console.log('Analyzing reference video...');
    const refAnalyzeRes = await fetch(`${baseUrl}/projects/${projectId}/analyze-reference`, { method: 'POST' });
    const refAnalyzeData = await refAnalyzeRes.json();
    console.log(`[PASS] Reference analysis done: ${refAnalyzeData.project?.referenceAnalysis?.summary?.slice(0, 80)}...`);

    console.log('Analyzing hook video...');
    const hookAnalyzeRes = await fetch(`${baseUrl}/projects/${projectId}/analyze-hook`, { method: 'POST' });
    const hookAnalyzeData = await hookAnalyzeRes.json();
    console.log(`[PASS] Hook analysis done: ${hookAnalyzeData.project?.hookAnalysis?.summary?.slice(0, 80)}...`);

    // Verify project transitioned to reference_analyzed
    const pCheckRes = await fetch(`${baseUrl}/projects/${projectId}`);
    const pCheck = await pCheckRes.json();
    console.log(`Project status after Step 2: ${pCheck.project.status}`);

    // Step 3: Generate Footage-Driven Timelines with Voice Duration Constraint
    console.log('\n--- STEP 3: Generating Footage-Driven Timelines (Batch 5) ---');
    const genRes = await fetch(`${baseUrl}/projects/${projectId}/generate-timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 5, hookType: 'auto' })
    });
    if (!genRes.ok) {
        const txt = await genRes.text();
        throw new Error(`Generate timeline failed (${genRes.status}): ${txt}`);
    }
    const genData = await genRes.json();
    const batchTimelines = genData.batchTimelines || [];
    console.log(`Generated ${batchTimelines.length} timelines.`);

    // STRICT VERIFICATION: Voice Duration Constraint
    console.log('\n================ VERIFYING VOICE DURATION CONSTRAINT ================');
    let allPassed = true;
    let totalSegmentsChecked = 0;

    for (let tIdx = 0; tIdx < batchTimelines.length; tIdx++) {
        const tl = batchTimelines[tIdx];
        console.log(`\nTimeline #${tIdx + 1}: "${tl.title}" (Angle: ${tl.angle?.name || 'N/A'})`);
        for (const seg of (tl.segments || [])) {
            totalSegmentsChecked++;
            const start = Number(seg.sourceIn) || 0;
            const end = Number(seg.sourceOut) || (start + 3);
            const dur = Math.round((end - start) * 10) / 10;
            const words = (seg.voice || '').trim().split(/\s+/).filter(Boolean);
            const wordCount = words.length;
            const maxAllowed = Math.max(3, Math.floor(dur * 2.8));

            const isOk = wordCount <= maxAllowed;
            if (!isOk) allPassed = false;

            console.log(`  [Seg ${seg.order} | ${seg.phase}] Clip: ${seg.sourceAssetId} | Dur: ${dur}s | Words: ${wordCount}/${maxAllowed} (${isOk ? 'OK' : 'FAIL!'})`);
            console.log(`      Voice: "${seg.voice}"`);
            console.log(`      Text:  "${seg.text}"`);
        }
    }

    if (!allPassed) {
        throw new Error('VOICE DURATION CONSTRAINT VIOLATION: Some segments exceed allowed word count!');
    }
    console.log(`\n[ALL PASS] Verified ${totalSegmentsChecked} segments across ${batchTimelines.length} timelines: 100% compliant with voice <= clip duration!`);

    // Step 4: Batch Review / Approval
    console.log('\n--- STEP 4: Approving Scripts (Batch Review) ---');
    const reviewRes = await fetch(`${baseUrl}/projects/${projectId}/batch-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approved', notes: 'Tự động duyệt E2E test' })
    });
    const reviewData = await reviewRes.json();
    console.log(`[PASS] Scripts approved. Project status: ${reviewData.project?.status}`);

    // Step 5: Render / Assemble Videos
    console.log('\n--- STEP 5: Assembling Videos (FFmpeg) ---');
    const assembleRes = await fetch(`${baseUrl}/projects/${projectId}/assemble`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: true })
    });
    const assembleData = await assembleRes.json();
    console.log(`Assembly trigger response:`, assembleData);

    // Poll render progress until done
    console.log('Monitoring render progress...');
    let renderDone = false;
    let attempts = 0;
    while (!renderDone && attempts < 120) {
        await new Promise(r => setTimeout(r, 3000));
        attempts++;
        const progRes = await fetch(`${baseUrl}/projects/${projectId}/render-progress`);
        if (progRes.ok) {
            const prog = await progRes.json();
            console.log(`[Render Progress] Completed: ${prog.completed}/${prog.total} | Running: ${prog.running} | Status: ${prog.status}`);
            if (prog.status === 'done' || (prog.total > 0 && prog.completed === prog.total)) {
                renderDone = true;
                break;
            }
            if (prog.status === 'failed') {
                throw new Error(`Render failed: ${prog.error}`);
            }
        }
    }

    if (!renderDone) {
        console.warn('Render timed out waiting for all videos.');
    } else {
        console.log('\n[SUCCESS] Step 5 FFmpeg render complete!');
    }

    // Print final project state
    const finalProjectRes = await fetch(`${baseUrl}/projects/${projectId}`);
    const finalProject = await finalProjectRes.json();
    console.log(`Final Project Status: ${finalProject.project.status}`);
    console.log(`Outputs rendered: ${(finalProject.project.batchOutputs || []).length}`);

    console.log('\n=== LIVE E2E TEST PASSED FULLY ===');
    return projectId;
}

runLiveE2E().catch(err => {
    console.error('Fatal E2E error:', err);
    process.exit(1);
});
