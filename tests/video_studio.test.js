/**
 * tests/video_studio.test.js
 *
 * Kiểm thử tool "Video to Video" (GTF Video Studio Phase 1 trong HIGGSFIELD):
 * Local Media Library scanner + store + GTF project. KHÔNG gọi ffprobe/mạng thật
 * (probe được inject giả).
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { inferCategory, isVideoFile, fileFingerprint, scanLibrary } from '../byteplus/video_studio/library.js';
import { VideoStudioStore } from '../byteplus/video_studio/index.js';

const S = 'Video to Video — Library & Project (SRS §3)';

function tmpRoot(tag) {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'v2v-' + tag + '-'));
}
function touch(p, bytes = 'x') {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, bytes);
    return p;
}
function storeAt(root) {
    return new VideoStudioStore({ root });
}
// probe giả: trả metadata cố định, không đụng ffprobe.
const fakeProbe = async () => ({ duration: 10, width: 1080, height: 1920, fps: 30, codec: 'h264', file_size: 1234 });

export async function runVideoStudioTests(reporter) {

    await reporter.test(S, 'Tier 1: isVideoFile + inferCategory + fingerprint', async () => {
        assert.strictEqual(isVideoFile('a.mp4'), true);
        assert.strictEqual(isVideoFile('a.txt'), false);
        const root = tmpRoot('cat');
        const f = touch(path.join(root, 'people', 'clip.mp4'));
        assert.strictEqual(inferCategory(f, root), 'people');
        assert.strictEqual(inferCategory(touch(path.join(root, 'top.mp4')), root), '');
        assert.ok(/^\d+:\d+$/.test(fileFingerprint(f)));
    });

    await reporter.test(S, 'Tier 2: scanLibrary — quét mới, chia category, tính stats', async () => {
        const lib = tmpRoot('scan'); const dataRoot = tmpRoot('scan-db');
        touch(path.join(lib, 'people', 'a.mp4'));
        touch(path.join(lib, 'b-roll', 'b.mp4'));
        touch(path.join(lib, 'note.txt')); // không phải video -> bỏ qua
        const store = storeAt(dataRoot);
        const res = await scanLibrary(lib, store, { probeFn: fakeProbe });
        assert.strictEqual(res.added, 2);
        assert.strictEqual(res.unchanged, 0);
        assert.strictEqual(res.errors.length, 0);
        const stats = store.libraryStats();
        assert.strictEqual(stats.total, 2);
        // ĐỔI CONTRACT 2026-09-18 (user chốt): kho chỉ còn ĐÚNG 3 nhóm — Nguyên liệu / Đối thủ / Hook.
        // Trước đây category = tên thư mục con nên "people" và "b-roll" là 2 danh mục riêng; nay mọi
        // thư mục không phải ref/hook đều quy về "material" vì user bỏ khái niệm "chưa phân loại"
        // ("bỏ cái option chưa phân loại đi vì nếu user đã tải video lên thì nó sẽ đc nhập thẳng vào ref luôn").
        assert.strictEqual(stats.byCategory.material, 2, 'people + b-roll đều là nguyên liệu');
        assert.strictEqual(stats.byCategory.people, undefined, 'không còn danh mục theo tên thư mục');
        assert.strictEqual(stats.totalDurationSeconds, 20);
    });

    await reporter.test(S, 'Tier 2: scanLibrary incremental — file không đổi thì unchanged', async () => {
        const lib = tmpRoot('inc'); const dataRoot = tmpRoot('inc-db');
        touch(path.join(lib, 'a.mp4'));
        const store = storeAt(dataRoot);
        await scanLibrary(lib, store, { probeFn: fakeProbe });
        const res2 = await scanLibrary(lib, store, { probeFn: fakeProbe });
        assert.strictEqual(res2.added, 0);
        assert.strictEqual(res2.unchanged, 1);
        assert.strictEqual(store.libraryStats().total, 1); // không nhân đôi
    });

    await reporter.test(S, 'Tier 2: scanLibrary ghi lỗi khi probe fail, KHÔNG đoán metadata', async () => {
        const lib = tmpRoot('err'); const dataRoot = tmpRoot('err-db');
        touch(path.join(lib, 'bad.mp4'));
        const store = storeAt(dataRoot);
        const failProbe = async () => { const e = new Error('FFPROBE_FAILED: broken'); e.code = 'FFPROBE_FAILED'; throw e; };
        const res = await scanLibrary(lib, store, { probeFn: failProbe });
        assert.strictEqual(res.added, 0);
        assert.strictEqual(res.errors.length, 1);
        assert.strictEqual(store.libraryStats().total, 0);
    });

    await reporter.test(S, 'Tier 1: scanLibrary nem loi khi folder khong ton tai', async () => {
        const store = storeAt(tmpRoot('nf-db'));
        await assert.rejects(() => scanLibrary(path.join(os.tmpdir(), 'khong-co-thu-muc-' + Date.now()), store, { probeFn: fakeProbe }),
            err => err.code === 'LIBRARY_FOLDER_NOT_FOUND');
    });

    await reporter.test(S, 'Tier 2: store CRUD asset + delete', async () => {
        const lib = tmpRoot('crud'); const dataRoot = tmpRoot('crud-db');
        touch(path.join(lib, 'x.mp4'));
        const store = storeAt(dataRoot);
        await scanLibrary(lib, store, { probeFn: fakeProbe });
        const asset = store.listAssets()[0];
        assert.ok(asset.asset_id.startsWith('VID_'));
        assert.strictEqual(store.getAsset(asset.asset_id).filename, 'x.mp4');
        assert.strictEqual(store.deleteAsset(asset.asset_id), true);
        assert.strictEqual(store.libraryStats().total, 0);

        // Test sorting newest first (mtime descending)
        const sortStore = storeAt(tmpRoot('sort-db'));
        sortStore.upsertAsset({ asset_id: 'VID_OLD', path: 'old.mp4', mtime: 1000 });
        sortStore.upsertAsset({ asset_id: 'VID_NEW', path: 'new.mp4', mtime: 5000 });
        const sorted = sortStore.listAssets();
        assert.strictEqual(sorted[0].asset_id, 'VID_NEW');
        assert.strictEqual(sorted[1].asset_id, 'VID_OLD');
    });

    await reporter.test(S, 'Tier 2: GTF project — tạo + trạng thái FSM khởi tạo đúng', async () => {
        const store = storeAt(tmpRoot('proj-db'));
        const p1 = store.createProject({ name: 'Serum T9' });
        assert.strictEqual(p1.status, 'library_ready');
        assert.strictEqual(p1.referenceAnalysis, null);
        assert.strictEqual(p1.productionTimeline, null);
        const p2 = store.createProject({ name: 'Có ref', referenceVideoPath: 'D:/x/ref.mp4', referenceVideoName: 'ref.mp4' });
        assert.strictEqual(p2.status, 'reference_imported');
        assert.strictEqual(store.listProjects().length, 2);
        assert.strictEqual(store.listProjects()[0].id, p2.id); // mới nhất trước
    });

    await reporter.test(S, 'Tier 3: store bền vững qua restart (đọc lại từ JSON)', async () => {
        const lib = tmpRoot('persist'); const dataRoot = tmpRoot('persist-db');
        touch(path.join(lib, 'a.mp4'));
        const s1 = storeAt(dataRoot);
        await scanLibrary(lib, s1, { probeFn: fakeProbe });
        s1.createProject({ name: 'Giữ lại' });
        await s1.flush(); // ghi bất đồng bộ -> phải flush trước khi mở store khác
        const s2 = storeAt(dataRoot); // mở store mới trên cùng thư mục
        assert.strictEqual(s2.libraryStats().total, 1);
        assert.strictEqual(s2.listProjects().length, 1);
    });

    await reporter.test(S, 'Tier 2: FSM transitions — canTransition & transitionProject enforce FSM (SRS §14)', async () => {
        const { canTransition, GTF_TRANSITIONS } = await import('../byteplus/video_studio/index.js');
        assert.strictEqual(canTransition('reference_imported', 'reference_analyzed'), true);
        assert.strictEqual(canTransition('reference_analyzed', 'timeline_generated'), true);
        assert.strictEqual(canTransition('reference_analyzed', 'awaiting_script_review'), true); // FSM fix
        assert.strictEqual(canTransition('awaiting_script_review', 'awaiting_script_review'), true); // Reflexive check
        assert.strictEqual(canTransition('awaiting_script_review', 'script_approved'), true);
        assert.strictEqual(canTransition('awaiting_script_review', 'timeline_generated'), true); // nhánh sửa
        assert.strictEqual(canTransition('video_ready', 'awaiting_final_review'), true);
        assert.strictEqual(canTransition('awaiting_final_review', 'final_approved'), true);
        // Nhảy cóc bất hợp lệ
        assert.strictEqual(canTransition('library_ready', 'final_approved'), false);
        assert.strictEqual(canTransition('reference_imported', 'assembling'), false);

        const store = storeAt(tmpRoot('fsm-db'));
        const p = store.createProject({ name: 'FSM Test', referenceVideoPath: 'ref.mp4', referenceVideoName: 'ref.mp4' });
        assert.strictEqual(p.status, 'reference_imported');
        store.transitionProject(p.id, 'reference_analyzed');
        assert.strictEqual(store.getProject(p.id).status, 'reference_analyzed');
        store.transitionProject(p.id, 'awaiting_script_review');
        assert.strictEqual(store.getProject(p.id).status, 'awaiting_script_review');

        // Thử chuyển trạng thái bất hợp lệ
        assert.throws(() => store.transitionProject(p.id, 'library_ready'),
            err => err.code === 'INVALID_TRANSITION');
    });

    await reporter.test(S, 'Tier 2: exportProjectPackage — sinh đủ final package files (SRS §13)', async () => {
        const { exportProjectPackage } = await import('../byteplus/video_studio/index.js');
        const root = tmpRoot('export-pkg');
        const store = storeAt(root);
        const p = store.createProject({ name: 'Video Serum' });
        p.productionTimeline = [
            { order: 1, sourceAssetId: 'VID_001', sourceIn: 0, sourceOut: 3.5, text: 'Hook mở đầu', transition: 'cut' },
            { order: 2, sourceAssetId: 'VID_002', sourceIn: 1.2, sourceOut: 5.0, text: 'Demo sản phẩm', transition: 'fade' }
        ];

        // Export package
        exportProjectPackage(p, store);

        const outDir = path.join(root, 'video_studio_outputs', p.id);
        assert.ok(fs.existsSync(path.join(outDir, 'production_timeline.json')), 'production_timeline.json phải tồn tại');
        assert.ok(fs.existsSync(path.join(outDir, 'episode_manifest.json')), 'episode_manifest.json phải tồn tại');
        assert.ok(fs.existsSync(path.join(outDir, 'storyboard.html')), 'storyboard.html phải tồn tại');

        const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'episode_manifest.json'), 'utf-8'));
        assert.strictEqual(manifest.id, p.id);
        assert.strictEqual(manifest.totalSegments, 2);

        const html = fs.readFileSync(path.join(outDir, 'storyboard.html'), 'utf-8');
        assert.ok(html.includes('Hook mở đầu'));
        assert.ok(html.includes('Demo sản phẩm'));
    });

    await reporter.test(S, 'Tier 2: Timeline saving & validation logic (SRS §7-§9)', async () => {
        const root = tmpRoot('tl-test');
        const store = storeAt(root);
        const p = store.createProject({ name: 'Timeline Val' });
        
        // Tạo asset giả trong kho
        const assetPath = touch(path.join(root, 'clip1.mp4'));
        store.upsertAsset({ path: assetPath, duration: 10, width: 1920, height: 1080, fps: 30, file_size: 1000 });
        const asset = store.listAssets()[0];

        // 1. Cập nhật timeline
        const validTimeline = [
            { order: 1, sourceAssetId: asset.asset_id, sourceIn: 0, sourceOut: 4.5, text: 'Text 1', transition: 'cut' }
        ];
        store.updateProject(p.id, { productionTimeline: validTimeline });
        assert.strictEqual(store.getProject(p.id).productionTimeline.length, 1);

        // 2. Validate logic kiểm tra sourceIn / sourceOut
        const seg = validTimeline[0];
        assert.ok(seg.sourceIn >= 0);
        assert.ok(seg.sourceOut > seg.sourceIn);
        assert.ok(seg.sourceOut <= asset.duration);

        // Invalid: sourceIn < 0 hoặc sourceOut > duration
        const invalidSeg = { order: 2, sourceAssetId: asset.asset_id, sourceIn: -1, sourceOut: 15.0 };
        assert.ok(invalidSeg.sourceIn < 0, 'Phát hiện sourceIn < 0');
        assert.ok(invalidSeg.sourceOut > asset.duration, 'Phát hiện sourceOut vượt quá duration');
    });

    await reporter.test(S, 'Tier 1: Edge TTS voice configuration & validation', async () => {
        const { AVAILABLE_VOICES, generateVoice } = await import('../byteplus/video_studio/voice_generator.js');
        assert.ok(Array.isArray(AVAILABLE_VOICES), 'AVAILABLE_VOICES phải là mảng');
        assert.ok(AVAILABLE_VOICES.length >= 2, 'Có ít nhất 2 giọng tiếng Việt (Nữ & Nam)');
        assert.ok(AVAILABLE_VOICES.some(v => v.id === 'vi-VN-HoaiMyNeural'), 'Phải có giọng Hoài My');
        assert.ok(AVAILABLE_VOICES.some(v => v.id === 'vi-VN-NamMinhNeural'), 'Phải có giọng Nam Minh');

        // Text rỗng không gọi TTS
        const resEmpty = await generateVoice('');
        assert.strictEqual(resEmpty, null);
        const resSpace = await generateVoice('   ');
        assert.strictEqual(resSpace, null);
    });

    await reporter.test(S, 'Tier 1: assembleVideo safeguard validation', async () => {
        const { assembleVideo } = await import('../byteplus/video_studio/assembler.js');
        await assert.rejects(() => assembleVideo([], 'out.mp4'),
            err => err.code === 'NO_SEGMENTS');
    });

    await reporter.test(S, 'Tier 2: Project creation without video (optional) & input modification before Step 2 AI analysis', async () => {
        const { canTransition } = await import('../byteplus/video_studio/index.js');
        const root = tmpRoot('proj-input-update');
        const store = storeAt(root);

        // 1. Tạo project không cần video input -> trạng thái khởi tạo là library_ready
        const p = store.createProject({ name: 'Project Không Video' });
        assert.strictEqual(p.status, 'library_ready');
        assert.strictEqual(p.referenceVideoPath, null);
        assert.strictEqual(p.hookVideoPath, null);

        // 2. canTransition cho phép library_ready -> reference_imported
        assert.strictEqual(canTransition('library_ready', 'reference_imported'), true);

        // 3. Cập nhật input cho project trước khi phân tích
        store.updateProject(p.id, {
            referenceVideoPath: 'new_ref.mp4',
            referenceVideoName: 'new_ref.mp4',
            hookVideoPath: 'new_hook.mp4',
            hookVideoName: 'new_hook.mp4',
            status: 'reference_imported'
        });

        const updated = store.getProject(p.id);
        assert.strictEqual(updated.status, 'reference_imported');
        assert.strictEqual(updated.referenceVideoName, 'new_ref.mp4');
        assert.strictEqual(updated.hookVideoName, 'new_hook.mp4');

        // 4. Khi gỡ hook
        store.updateProject(p.id, {
            hookVideoPath: null,
            hookVideoName: null
        });
        const noHook = store.getProject(p.id);
        assert.strictEqual(noHook.hookVideoPath, null);
    });

    await reporter.test(S, 'Tier 2: POST /projects/:id/inputs router endpoint — cập nhật video cho project trống & khóa khi đã phân tích', async () => {
        const { createVideoStudioRouter } = await import('../byteplus/video_studio/index.js');
        const express = (await import('express')).default;
        const http = (await import('http')).default;

        const root = tmpRoot('proj-inputs-api');
        const store = storeAt(root);
        const libDir = path.join(root, 'kho');
        fs.mkdirSync(libDir, { recursive: true });

        const app = express();
        app.use('/api/video-studio', createVideoStudioRouter({ store, libraryDir: libDir }));

        const server = http.createServer(app);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const baseUrl = `http://127.0.0.1:${port}/api/video-studio`;

        try {
            // 1. Tạo project trống
            const p = store.createProject({ name: 'Empty Project Test' });
            assert.strictEqual(p.status, 'library_ready');

            // 2. Upload video đối thủ vào project trống qua /projects/:id/inputs
            const fd1 = new FormData();
            const fakeVideoBlob = new Blob(['fake video content bytes'], { type: 'video/mp4' });
            fd1.append('refVideo', fakeVideoBlob, 'ref_competitor.mp4');

            const res1 = await fetch(`${baseUrl}/projects/${p.id}/inputs`, {
                method: 'POST',
                body: fd1
            });
            assert.strictEqual(res1.status, 200);
            const data1 = await res1.json();
            assert.strictEqual(data1.success, true);
            assert.strictEqual(data1.project.status, 'reference_imported');
            assert.strictEqual(data1.project.referenceVideoName, 'ref_competitor.mp4');
            assert.ok(data1.project.referenceVideoPath);

            // 3. Upload thêm hook video
            const fd2 = new FormData();
            const fakeHookBlob = new Blob(['fake hook content'], { type: 'video/mp4' });
            fd2.append('hookVideo', fakeHookBlob, 'hook_sample.mp4');

            const res2 = await fetch(`${baseUrl}/projects/${p.id}/inputs`, {
                method: 'POST',
                body: fd2
            });
            assert.strictEqual(res2.status, 200);
            const data2 = await res2.json();
            assert.strictEqual(data2.project.hookVideoName, 'hook_sample.mp4');
            assert.ok(data2.project.hookVideoPath);

            // 4. Gỡ hook video
            const fd3 = new FormData();
            fd3.append('removeHook', 'true');
            const res3 = await fetch(`${baseUrl}/projects/${p.id}/inputs`, {
                method: 'POST',
                body: fd3
            });
            assert.strictEqual(res3.status, 200);
            const data3 = await res3.json();
            assert.strictEqual(data3.project.hookVideoPath, null);

            // 5. Khi project đã được AI phân tích -> Chặn không cho sửa input (HTTP 400 ALREADY_ANALYZED)
            store.updateProject(p.id, { referenceAnalysis: { summary: 'done' }, status: 'reference_analyzed' });
            const fd4 = new FormData();
            fd4.append('refVideo', fakeVideoBlob, 'another_ref.mp4');
            const res4 = await fetch(`${baseUrl}/projects/${p.id}/inputs`, {
                method: 'POST',
                body: fd4
            });
            assert.strictEqual(res4.status, 400);
            const data4 = await res4.json();
            assert.strictEqual(data4.code, 'ALREADY_ANALYZED');
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });
}

export default runVideoStudioTests;
