import fs from 'fs';
import path from 'path';

const API = 'http://localhost:20140/api/video-studio';
const REF_VIDEO = 'C:\\Users\\gifft\\Downloads\\Hero.mp4';

async function main() {
    console.log('=== BẮT ĐẦU TEST TOÀN TRÌNH VIDEO TO VIDEO STUDIO VỚI HERO.MP4 ===');

    if (!fs.existsSync(REF_VIDEO)) {
        throw new Error('Không tìm thấy file ' + REF_VIDEO);
    }

    // 1. Tạo project & Upload video đối thủ Hero.mp4
    console.log('\n[1/6] Đang upload video đối thủ Hero.mp4 và tạo project...');
    const fileBuffer = fs.readFileSync(REF_VIDEO);
    const blob = new Blob([fileBuffer], { type: 'video/mp4' });
    const fd = new FormData();
    fd.append('name', 'Test Đối Thủ Hero - Remix Kho');
    fd.append('video', blob, 'Hero.mp4');

    const res1 = await fetch(API + '/projects', { method: 'POST', body: fd });
    const data1 = await res1.json();
    if (!res1.ok || !data1.project) {
        throw new Error('Tạo project thất bại: ' + JSON.stringify(data1));
    }
    const projectId = data1.project.id;
    console.log(`✓ Project đã tạo: ${projectId} - "${data1.project.name}"`);
    console.log(`  Reference file: ${data1.project.referenceVideoName}`);

    // 2. Phân tích AI video đối thủ (SRS §6)
    console.log('\n[2/6] Đang chạy phân tích AI video đối thủ qua 9Router (Gemini Vision + Whisper)...');
    const t0 = Date.now();
    const res2 = await fetch(`${API}/projects/${projectId}/analyze-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    const data2 = await res2.json();
    if (!res2.ok || !data2.project) {
        throw new Error('Phân tích đối thủ thất bại: ' + JSON.stringify(data2));
    }
    const refAnalysis = data2.project.referenceAnalysis;
    console.log(`✓ Phân tích đối thủ xong trong ${((Date.now() - t0) / 1000).toFixed(1)}s!`);
    console.log('  Tóm tắt cấu trúc đối thủ:', refAnalysis.summary || refAnalysis.conclusion || 'Đã bóc tách cấu trúc');
    const refEvents = refAnalysis.visual_events || [];
    console.log(`  Số mốc phân cảnh bóc tách được: ${refEvents.length}`);
    refEvents.forEach((ev, i) => {
        console.log(`    #${i+1} [${ev.start}s - ${ev.end || ev.start}s] (${ev.scene || 'Scene'}): ${ev.description || ev.action}`);
    });

    // 3. Sinh Production Timeline kịch bản dựng từ kho clip (SRS §7)
    console.log('\n[3/6] Đang gọi 9Router LLM sinh Production Timeline từ kho clip...');
    const t1 = Date.now();
    const res3 = await fetch(`${API}/projects/${projectId}/generate-timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    const data3 = await res3.json();
    if (!res3.ok || !data3.project) {
        throw new Error('Sinh kịch bản thất bại: ' + JSON.stringify(data3));
    }
    const timeline = data3.project.productionTimeline || [];
    console.log(`✓ Sinh kịch bản xong trong ${((Date.now() - t1) / 1000).toFixed(1)}s!`);
    console.log(`  Tổng số phân đoạn kịch bản dựng: ${timeline.length}`);
    console.log('\n  --- CHI TIẾT CÁC PHÂN CẢNH XÀO NẤU TỪ TRONG KHO ---');
    timeline.forEach(seg => {
        const dur = (seg.sourceOut - seg.sourceIn).toFixed(1);
        console.log(`  Phân đoạn #${seg.order}:`);
        console.log(`    - Clip nguồn trong kho: ${seg.sourceAssetId}`);
        console.log(`    - Cắt từ: ${seg.sourceIn}s đến ${seg.sourceOut}s (thời lượng: ${dur}s)`);
        console.log(`    - Chữ hiển thị (Text Overlay): "${seg.text || ''}"`);
        console.log(`    - Lời thoại AI (Voice): "${seg.voice || ''}"`);
        console.log(`    - Chuyển cảnh: ${seg.transition || 'cut'}`);
    });

    // 4. Duyệt kịch bản (SRS §8)
    console.log('\n[4/6] Đang duyệt kịch bản (Approve script)...');
    const res4 = await fetch(`${API}/projects/${projectId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' })
    });
    const data4 = await res4.json();
    console.log(`✓ Trạng thái sau duyệt: ${data4.project.status}`);

    // 5. Validate & Dựng video FFmpeg + Edge TTS (SRS §9, §10, §11)
    console.log('\n[5/6] Đang validate và lắp ráp video hoàn chỉnh bằng FFmpeg + Edge TTS...');
    const res5Val = await fetch(`${API}/projects/${projectId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    const data5Val = await res5Val.json();
    if (!res5Val.ok) {
        throw new Error('Validate timeline thất bại: ' + JSON.stringify(data5Val));
    }
    console.log('✓ Validation OK! Bắt đầu render FFmpeg...');

    const t2 = Date.now();
    const res5 = await fetch(`${API}/projects/${projectId}/assemble`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: 'vi-VN-HoaiMyNeural' })
    });
    const data5 = await res5.json();
    if (!res5.ok || !data5.project) {
        throw new Error('Dựng video thất bại: ' + JSON.stringify(data5));
    }
    console.log(`✓ Dựng video hoàn tất trong ${((Date.now() - t2) / 1000).toFixed(1)}s!`);
    console.log(`  File kết quả: ${data5.project.finalVideoPath}`);

    // 6. Duyệt cuối & Kiểm tra thành phẩm (SRS §12, §13)
    console.log('\n[6/6] Đang duyệt cuối và xuất gói thành phẩm...');
    const res6 = await fetch(`${API}/projects/${projectId}/final-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' })
    });
    const data6 = await res6.json();
    console.log(`✓ Trạng thái cuối: ${data6.project.status}`);

    // Kiểm tra các file thành phẩm trên đĩa
    const outDir = path.join(process.cwd(), 'video_studio_outputs', projectId);
    console.log(`\nThư mục thành phẩm: ${outDir}`);
    const files = fs.readdirSync(outDir);
    console.log('Các file xuất bản:', files.join(', '));

    const finalPath = path.join(outDir, 'final.mp4');
    if (fs.existsSync(finalPath)) {
        const stat = fs.statSync(finalPath);
        console.log(`\n🎉 THÀNH CÔNG RỰC RỠ! Final MP4 tồn tại: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
    } else {
        throw new Error('Không tìm thấy final.mp4 trong thư mục output!');
    }

    return { projectId, outDir, timeline };
}

main().catch(err => {
    console.error('\n❌ TEST THẤT BẠI:', err);
    process.exit(1);
});
