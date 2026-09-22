/**
 * tests/google_flow.test.js
 *
 * Kiem thu Flow Queue (Google Flow qua Chrome CDP 9334).
 * CHI ham thuan — 0 network, 0 paid call, khong dung Chrome/Playwright.
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { zipSync, unzipSync, gzipSync, gunzipSync } from 'fflate';
import {
    buildFlowJob, flowWorkspaceUrl, isZipDownload, isGzipDownload, assignFlowFrameRoles,
    FLOW_BATCH_DOWNLOAD_BUTTON_XPATH, FLOW_POST_GENERATION_WAIT_MS,
    FLOW_TASK_QUEUE_DELAY_MS, checkNewlyRenderedFlowElement,
    selectAllFlowArchiveMedia, isFlowMediaFilename,
} from '../byteplus/google_flow/runner.mjs';
import { recoverJobsOnBoot, DEFAULT_CDP_URL, FlowQueue } from '../byteplus/google_flow/queue.js';

const S = 'Google Flow Queue (CDP 9334)';

function tmpFlowRoot(tag) {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'flow-test-' + tag + '-'));
}

export async function runGoogleFlowTests(reporter) {

    await reporter.test(S, 'Tier 1: buildFlowJob video chuan hoa duration "8s"->8 va alias model', async () => {
        const job = buildFlowJob({ mode: 'video', prompt: ' xin chao ', duration: '8s', model: 'Veo 3.1 Fast', aspectRatio: '9:16' });
        assert.strictEqual(job.duration, 8);
        assert.strictEqual(job.model, 'Veo 3.1 - Fast');
        assert.strictEqual(job.prompt, 'xin chao');
        assert.strictEqual(job.aspectRatio, '9:16');
        assert.strictEqual(job.videoInputMode, 'frames'); // mac dinh
        assert.strictEqual(job.variants, 1);
    });

    await reporter.test(S, 'Tier 1: buildFlowJob chan duration/ratio/variants/inputMode sai', async () => {
        assert.throws(() => buildFlowJob({ mode: 'video', prompt: 'x', duration: 5, model: 'Omni Flash' }), /duration/i);
        assert.throws(() => buildFlowJob({ mode: 'video', prompt: 'x', duration: 4, aspectRatio: '4:3', model: 'Omni Flash' }), /aspect ratio/i);
        assert.throws(() => buildFlowJob({ mode: 'video', prompt: 'x', duration: 4, variants: 5, model: 'Omni Flash' }), /variants/i);
        assert.throws(() => buildFlowJob({ mode: 'video', prompt: 'x', duration: 4, videoInputMode: 'sai', model: 'Omni Flash' }), /input mode/i);
        assert.throws(() => buildFlowJob({ mode: 'khac', prompt: 'x' }), /mode/i);
        assert.throws(() => buildFlowJob({ mode: 'video', prompt: '', duration: 4, model: 'Omni Flash' }), /prompt/i);
    });

    await reporter.test(S, 'Tier 1: buildFlowJob image mac dinh Nano Banana 2, nhan ratio 3:4, bo duration', async () => {
        const job = buildFlowJob({ mode: 'image', prompt: 'anh meo', aspectRatio: '3:4' });
        assert.strictEqual(job.model, 'Nano Banana 2');
        assert.strictEqual(job.duration, undefined);
        assert.strictEqual(job.videoInputMode, undefined);
    });

    await reporter.test(S, 'Tier 1: flowWorkspaceUrl chi nhan workspace/project Flow hop le', async () => {
        assert.strictEqual(flowWorkspaceUrl(), 'https://labs.google/fx/vi/tools/flow');
        const project = 'https://labs.google/fx/vi/tools/flow/project/12345678-1234-1234-1234-123456789abc';
        assert.strictEqual(flowWorkspaceUrl(project + '/'), project);
        const flowProj = 'https://flow.google.com/project/12345678-1234-1234-1234-123456789abc';
        assert.strictEqual(flowWorkspaceUrl(flowProj + '/'), flowProj);
        assert.strictEqual(flowWorkspaceUrl('https://flow.google.com/'), 'https://flow.google.com');
        assert.throws(() => flowWorkspaceUrl('http://labs.google/fx/vi/tools/flow'), /Flow URL/);
        assert.throws(() => flowWorkspaceUrl('https://evil.example.com/fx/vi/tools/flow'), /Flow URL/);
    });

    await reporter.test(S, 'Tier 1: isZipDownload nhan dien magic PK va duoi .zip', async () => {
        assert.strictEqual(isZipDownload(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), true);
        assert.strictEqual(isZipDownload(new Uint8Array([0x00, 0x01]), 'ket-qua.ZIP'), true);
        assert.strictEqual(isZipDownload(new Uint8Array([0x00, 0x00, 0x00, 0x18]), 'video.mp4'), false);
    });

    await reporter.test(S, 'Tier 1: assignFlowFrameRoles gan first/last frame dung thu tu', async () => {
        const one = assignFlowFrameRoles([{ mimeType: 'image/png' }]);
        assert.strictEqual(one[0].role, 'first_frame');
        const two = assignFlowFrameRoles([{ mimeType: 'image/png' }, { mimeType: 'image/jpeg' }]);
        assert.strictEqual(two[1].role, 'last_frame');
        assert.throws(() => assignFlowFrameRoles([{ mimeType: 'video/mp4' }]), /images only/i);
        assert.throws(() => assignFlowFrameRoles([{}, {}, {}]), /one or two/i);
    });

    await reporter.test(S, 'Tier 2: recoverJobsOnBoot — running->failed (khong tu chay lai, §17), queued giu nguyen', async () => {
        const jobs = [
            { id: 'a', status: 'running' },
            { id: 'b', status: 'queued' },
            { id: 'c', status: 'succeeded' },
            { id: 'd', status: 'failed', error: 'x' },
        ];
        const changed = recoverJobsOnBoot(jobs, '2026-09-14T00:00:00.000Z');
        assert.strictEqual(changed, 1);
        assert.strictEqual(jobs[0].status, 'failed');
        assert.match(jobs[0].error, /§17/);
        assert.strictEqual(jobs[0].finishedAt, '2026-09-14T00:00:00.000Z');
        assert.strictEqual(jobs[1].status, 'queued');
        assert.strictEqual(jobs[2].status, 'succeeded');
        assert.strictEqual(jobs[3].error, 'x');
    });

    await reporter.test(S, 'Tier 2: cong CDP mac dinh la 9334 loopback (ne 9222 va 9333 cua V1)', async () => {
        assert.strictEqual(DEFAULT_CDP_URL, 'http://127.0.0.1:9334');
        assert.ok(!DEFAULT_CDP_URL.includes('9222'));
        assert.ok(!DEFAULT_CDP_URL.includes('9333'));
    });

    await reporter.test(S, 'Tier 1: buildFlowJob nhan duration 10s', async () => {
        const job = buildFlowJob({ mode: 'video', prompt: 'test 10s', duration: '10s', model: 'Omni Flash', aspectRatio: '16:9' });
        assert.strictEqual(job.duration, 10);
    });

    await reporter.test(S, 'Tier 2: FlowQueue chan >3 anh hoac >1 video hoac video trong frames mode', async () => {
        const q = new FlowQueue({ flowRoot: tmpFlowRoot('limits') });
        q.store.data.media = [
            { id: 'm1', kind: 'image', originalName: '1.jpg' },
            { id: 'm2', kind: 'image', originalName: '2.jpg' },
            { id: 'm3', kind: 'image', originalName: '3.jpg' },
            { id: 'm4', kind: 'image', originalName: '4.jpg' },
            { id: 'v1', kind: 'video', originalName: '1.mp4' },
            { id: 'v2', kind: 'video', originalName: '2.mp4' },
        ];
        // Chan > 3 anh
        assert.throws(() => q.createJob({
            mode: 'video', prompt: 'test', duration: 4, model: 'Omni Flash', aspectRatio: '16:9', videoInputMode: 'ingredients',
            mediaIds: ['m1', 'm2', 'm3', 'm4']
        }), /tối đa 3 ảnh/i);

        // Chan > 1 video
        assert.throws(() => q.createJob({
            mode: 'video', prompt: 'test', duration: 4, model: 'Omni Flash', aspectRatio: '16:9', videoInputMode: 'ingredients',
            mediaIds: ['v1', 'v2']
        }), /tối đa 1 video/i);

        // Chan video trong frames mode
        assert.throws(() => q.createJob({
            mode: 'video', prompt: 'test', duration: 4, model: 'Omni Flash', aspectRatio: '16:9', videoInputMode: 'frames',
            mediaIds: ['v1']
        }), /chỉ nhận ảnh/i);
    });

    await reporter.test(S, 'Tier 1: FLOW_BATCH_DOWNLOAD_BUTTON_XPATH va timing delay duoc dinh nghia dung yeu cau', async () => {
        assert.strictEqual(FLOW_BATCH_DOWNLOAD_BUTTON_XPATH, '//*[@id="main-content"]/flow-project-shell/flow-project-page/div/flow-project-sidenav-container/mat-sidenav-container/mat-sidenav-content/div/div/cdk-virtual-scroll-viewport/div[1]/div[1]/div[1]/flow-batch-info/div[1]/button[1]');
        assert.strictEqual(FLOW_POST_GENERATION_WAIT_MS, 3000);
        assert.strictEqual(FLOW_TASK_QUEUE_DELAY_MS, 10000);
    });

    await reporter.test(S, 'Tier 2: checkNewlyRenderedFlowElement phan biet video moi tao voi src hop le va aria-label', async () => {
        const mockPage = {
            locator(sel) {
                if (sel === 'video') {
                    const elements = [
                        {
                            getAttribute: async attr => attr === 'src' ? 'https://flow-content.google/video/old-123' : '',
                            evaluate: async () => 'https://flow-content.google/video/old-123',
                        },
                        {
                            getAttribute: async attr => attr === 'src' ? 'https://flow-content.google/video/c20345f0-31ce-48cb-bfbd-fa8f06716bbb?Expires=1789407389&KeyName=labs-flow-prod-cdn-key&Signature=BNhWfCftnbWmm5wlRLAXo-BIqdg' : (attr === 'aria-label' ? 'Video được tạo' : ''),
                            evaluate: async () => 'https://flow-content.google/video/c20345f0-31ce-48cb-bfbd-fa8f06716bbb?Expires=1789407389&KeyName=labs-flow-prod-cdn-key&Signature=BNhWfCftnbWmm5wlRLAXo-BIqdg',
                        }
                    ];
                    return {
                        count: async () => elements.length,
                        nth: i => elements[i],
                    };
                }
                return { count: async () => 0 };
            }
        };
        const preExisting = new Set(['https://flow-content.google/video/old-123']);
        const res = await checkNewlyRenderedFlowElement(mockPage, 'video', preExisting, new Set(), 1);
        assert.strictEqual(res.ready, true);
        assert.strictEqual(res.count, 1);
        assert.ok(res.items[0].src.includes('c20345f0-31ce-48cb-bfbd-fa8f06716bbb'));
        assert.strictEqual(res.items[0].ariaLabel, 'Video được tạo');
    });

    await reporter.test(S, 'Tier 2: checkNewlyRenderedFlowElement tra ve false neu chua co video moi hoac bi trung src cu', async () => {
        const mockPage = {
            locator(sel) {
                if (sel === 'video') {
                    const elements = [
                        {
                            getAttribute: async attr => attr === 'src' ? 'https://flow-content.google/video/old-123' : '',
                            evaluate: async () => 'https://flow-content.google/video/old-123',
                        },
                    ];
                    return {
                        count: async () => elements.length,
                        nth: i => elements[i],
                    };
                }
                return { count: async () => 0 };
            }
        };
        const resOldOnly = await checkNewlyRenderedFlowElement(mockPage, 'video', new Set(['https://flow-content.google/video/old-123']), new Set(), 1);
        assert.strictEqual(resOldOnly.ready, false);
        assert.strictEqual(resOldOnly.count, 0);
    });

    await reporter.test(S, 'Tier 2: checkNewlyRenderedFlowElement phat hien anh moi trong mode image', async () => {
        const mockImagePage = {
            locator() {
                const imgs = [
                    {
                        getAttribute: async () => 'https://flow-content.google/image/generated-photo.png',
                        evaluate: async () => 'https://flow-content.google/image/generated-photo.png',
                        isVisible: async () => true,
                        boundingBox: async () => ({ width: 512, height: 512 }),
                    }
                ];
                return {
                    count: async () => imgs.length,
                    nth: i => imgs[i],
                };
            }
        };
        const resImg = await checkNewlyRenderedFlowElement(mockImagePage, 'image', new Set(), new Set(), 1);
        assert.strictEqual(resImg.ready, true);
        assert.strictEqual(resImg.count, 1);
    });

    await reporter.test(S, 'Tier 3: Giai nen file ZIP va trich xuat video day ve backend dung chuan fflate', async () => {
        const mockVideoData = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]); // ftyp
        const zipData = zipSync({
            'Flow_Batch_001.mp4': mockVideoData,
            'metadata.json': new Uint8Array([1, 2, 3]),
        });
        assert.strictEqual(isZipDownload(zipData, 'batch.zip'), true);
        const unzipped = unzipSync(zipData);
        const media = selectAllFlowArchiveMedia(unzipped, 'video', 1);
        assert.strictEqual(media.length, 1);
        assert.strictEqual(media[0].filename, 'Flow_Batch_001.mp4');
        assert.strictEqual(media[0].bytes.length, mockVideoData.length);
    });

    await reporter.test(S, 'Tier 3: Nhan dien file video truc tiep qua extension hoac query params', async () => {
        const mp4Bytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
        assert.strictEqual(isZipDownload(mp4Bytes, 'video.mp4'), false);
        assert.strictEqual(isFlowMediaFilename('video.mp4', 'video'), true);
        assert.strictEqual(isFlowMediaFilename('video.mp4?Expires=1789407389&Signature=xyz', 'video'), true);
        assert.strictEqual(isFlowMediaFilename('photo.png?Expires=1789407389', 'image'), true);
    });

    await reporter.test(S, 'Tier 4: FlowQueue tuan tu doi delay giua cac task trong hang cho truoc khi sang task tiep', async () => {
        const q = new FlowQueue({ flowRoot: tmpFlowRoot('delay') });
        q.queueDelayMs = 15; // mock 15ms for unit test speed
        const executed = [];
        q.runJob = async job => {
            executed.push({ id: job.id, at: Date.now() });
            job.status = 'succeeded';
        };
        q.store.data.jobs = [
            { id: 'job_2', status: 'queued', logTail: [] },
            { id: 'job_1', status: 'queued', logTail: [] },
        ];
        q.enabled = true;
        q.kick();
        while (q.active) {
            await new Promise(r => setTimeout(r, 5));
        }
        assert.strictEqual(executed.length, 2);
        assert.strictEqual(executed[0].id, 'job_1');
        assert.strictEqual(executed[1].id, 'job_2');
        assert.ok(executed[1].at - executed[0].at >= 10, 'Khoảng cách giữa 2 task phải có delay');
    });

    await reporter.test(S, 'Tier 1: isGzipDownload nhan dien magic gzip va duoi .gz', async () => {
        const gzMagic = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]);
        assert.strictEqual(isGzipDownload(gzMagic), true);
        assert.strictEqual(isGzipDownload(new Uint8Array([1, 2, 3]), 'video.mp4.gz'), true);
        assert.strictEqual(isGzipDownload(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'file.zip'), false);
    });

    await reporter.test(S, 'Tier 2: selectAllFlowArchiveMedia loai bo __MACOSX va file rac ._*', async () => {
        const mockVideoData = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);
        const mockAppleDouble = new Uint8Array([0x00, 0x05, 0x16, 0x07]);
        const files = {
            '__MACOSX/._Flow_001.mp4': mockAppleDouble,
            'folder/._Flow_001.mp4': mockAppleDouble,
            'Flow_001.mp4': mockVideoData,
        };
        const media = selectAllFlowArchiveMedia(files, 'video', 1);
        assert.strictEqual(media.length, 1);
        assert.strictEqual(media[0].filename, 'Flow_001.mp4');
        assert.strictEqual(media[0].bytes, mockVideoData);
    });

    await reporter.test(S, 'Tier 2: checkNewlyRenderedFlowElement chan video co aria-label khong phai do Flow tao', async () => {
        const mockPage = {
            locator(sel) {
                if (sel === 'video') {
                    const elements = [
                        {
                            getAttribute: async attr => attr === 'src' ? 'https://flow-content.google/video/unrelated' : (attr === 'aria-label' ? 'Quang cao san pham' : ''),
                            evaluate: async () => 'https://flow-content.google/video/unrelated',
                        }
                    ];
                    return { count: async () => elements.length, nth: i => elements[i] };
                }
                return { count: async () => 0 };
            }
        };
        const res = await checkNewlyRenderedFlowElement(mockPage, 'video', new Set(), new Set(), 1);
        assert.strictEqual(res.ready, false);
        assert.strictEqual(res.count, 0);
    });

    await reporter.test(S, 'Tier 3: Giai nen GZIP va trich xuat video thanh cong', async () => {
        const rawVideo = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
        const gzipped = gzipSync(rawVideo);
        assert.strictEqual(isGzipDownload(gzipped), true);
        const decompressed = gunzipSync(gzipped);
        assert.deepStrictEqual(decompressed, rawVideo);
    });

    await reporter.test(S, 'Tier 1: buildFlowJob ho tro day du model anh moi, model video Veo, va resolution 360p/720p', async () => {
        const imgJob = buildFlowJob({ mode: 'image', prompt: 'cute cat', model: 'Nano Banana 2 Lite', aspectRatio: '1:1' });
        assert.strictEqual(imgJob.model, 'Nano Banana 2 Lite');
        assert.strictEqual(imgJob.resolution, undefined);

        const omniJob = buildFlowJob({ mode: 'video', prompt: 'city view', model: 'Omni 1.1 Flash', resolution: '720p', duration: 4, aspectRatio: '16:9' });
        assert.strictEqual(omniJob.model, 'Omni 1.1 Flash');
        assert.strictEqual(omniJob.resolution, '720p');

        const veoJob = buildFlowJob({ mode: 'video', prompt: 'drone fly', model: 'Veo 3.1 - Quality', duration: 6, aspectRatio: '9:16' });
        assert.strictEqual(veoJob.model, 'Veo 3.1 - Quality');
        assert.strictEqual(veoJob.resolution, undefined); // Veo khong dung resolution

        assert.throws(() => buildFlowJob({ mode: 'video', prompt: 'test', duration: 4, resolution: '1080p', model: 'Omni Flash' }), /resolution/i);
    });

    await reporter.test(S, 'Tier 2: FlowQueue chan video tham chieu tren model Veo va mode anh, cho phep video tren Omni 1.1 Flash', async () => {
        const q = new FlowQueue({ flowRoot: tmpFlowRoot('models') });
        q.store.data.media = [
            { id: 'img1', kind: 'image', originalName: '1.jpg' },
            { id: 'vid1', kind: 'video', originalName: '1.mp4' },
        ];

        // Veo model chan video tham chieu
        assert.throws(() => q.createJob({
            mode: 'video', prompt: 'veo prompt', duration: 4, model: 'Veo 3.1 - Fast', aspectRatio: '16:9', videoInputMode: 'ingredients',
            mediaIds: ['vid1']
        }), /chỉ hỗ trợ ảnh tham chiếu, không hỗ trợ video/i);

        // Image mode chan video tham chieu
        assert.throws(() => q.createJob({
            mode: 'image', prompt: 'image prompt', model: 'Nano Banana 2', aspectRatio: '1:1',
            mediaIds: ['vid1']
        }), /chỉ nhận ảnh tham chiếu, không nhận video/i);

        // Omni 1.1 Flash cho phep video tham chieu
        const validJob = q.createJob({
            mode: 'video', prompt: 'omni prompt', duration: 4, model: 'Omni 1.1 Flash', aspectRatio: '16:9', videoInputMode: 'ingredients',
            mediaIds: ['vid1']
        });
        assert.strictEqual(validJob.model, 'Omni 1.1 Flash');
        assert.strictEqual(validJob.mediaIds.length, 1);
    });

    await reporter.test(S, 'Tier 2: [UI/UX] Flow Queue danh sách jobs (#fq-jobs) có max-height vừa đủ 2 card và scroll', async () => {
        const cssPath = path.resolve('public/studio/flow-queue.css');
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        const jobsBlock = cssContent.match(/\.fq-jobs\s*\{[^}]*\}/);
        assert.ok(jobsBlock, '.fq-jobs phải có CSS block');
        assert.ok(
            jobsBlock[0].includes('overflow-y: auto') || jobsBlock[0].includes('overflow-y:auto'),
            '.fq-jobs phải có overflow-y: auto để cuộn'
        );
        const maxHMatch = jobsBlock[0].match(/max-height:\s*(\d+)px/);
        assert.ok(maxHMatch, '.fq-jobs phải có max-height');
        const maxH = parseInt(maxHMatch[1]);
        assert.ok(
            maxH >= 700 && maxH <= 780,
            '.fq-jobs max-height phải từ 700px - 780px để hiển thị vừa đủ 2 card'
        );
    });
}
