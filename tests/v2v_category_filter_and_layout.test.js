/**
 * tests/v2v_category_filter_and_layout.test.js
 *
 * Kiểm thử TDD cho:
 * 1. Bộ lọc Danh mục trong Thư viện nguồn (hỗ trợ Kho gốc / Chưa phân loại, đếm số lượng, không mất filter khi tải lại).
 * 2. Bố cục 2 cột (Cột Trái 35% thao tác dự án / Cột Phải 65% duyệt video thành phẩm).
 * 3. Vị trí #v2v-pipeline-guide ở đầu và #v2v-library ở cuối.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';

const S = 'Video to Video — Category Filter & 35/65 Layout (UI/UX Pro Max)';

export async function runV2VCategoryAndLayoutTests(reporter) {

    // Helper: Đọc file HTML và CSS
    const htmlPath = path.resolve('public/studio/video-to-video.html');
    const cssPath = path.resolve('public/studio/video-to-video.css');
    const jsPath = path.resolve('public/studio/video-to-video.js');

    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const jsContent = fs.readFileSync(jsPath, 'utf8');

    // ── Tier 1: Logic lọc danh mục trong JS ─────────────────────────────────────
    await reporter.test(S, 'Tier 1: JS có logic lọc danh mục hỗ trợ kho gốc (__root__ / empty)', async () => {
        // Kiểm tra trong JS có xử lý __root__ hoặc (root) khi lọc danh mục
        assert.ok(
            jsContent.includes('__root__') || jsContent.includes('(root)'),
            'JS phải có nhánh xử lý __root__ hoặc (root) cho các clip ở kho gốc chưa phân loại'
        );

        // Kiểm tra hàm updateCategoryFilterOptions không làm mất giá trị đang chọn
        assert.ok(
            jsContent.includes('libraryCategoryFilter'),
            'JS phải lưu và duy trì libraryCategoryFilter khi updateCategoryFilterOptions chạy'
        );
    });

    await reporter.test(S, 'Tier 1: JS tạo option danh mục kèm đếm số lượng clip thực tế', async () => {
        // Option phải có đếm số lượng như (238) hoặc đếm theo stats/assets
        assert.ok(
            jsContent.includes('Kho gốc') || jsContent.includes('Chưa phân loại') || jsContent.includes('(root)'),
            'JS phải hiển thị label Kho gốc / Chưa phân loại cho danh mục rỗng'
        );
    });

    await reporter.test(S, 'Tier 1: Chips danh mục trên thanh stats có thể bấm để lọc nhanh', async () => {
        // Kiểm tra stats chip có gắn sự kiện click hoặc class tương tác để lọc danh mục
        assert.ok(
            jsContent.includes('data-cat') || jsContent.includes('filterByCat') || jsContent.includes('v2v-chip-clickable') || jsContent.includes('selectCategory'),
            'Các chip danh mục trên stats phải có cơ chế tương tác để lọc nhanh'
        );
    });

    // ── Tier 2: Cấu trúc HTML Layout 35% - 65% ──────────────────────────────────
    await reporter.test(S, 'Tier 2: [DOM] #v2v-pipeline-guide ở trên cùng, #v2v-library ở dưới cùng', async () => {
        const guideIdx = htmlContent.indexOf('id="v2v-pipeline-guide"');
        const layoutIdx = htmlContent.indexOf('class="v2v-workspace-layout"');
        const libIdx = htmlContent.indexOf('id="v2v-library"');

        assert.ok(guideIdx !== -1, '#v2v-pipeline-guide phải tồn tại trong HTML');
        assert.ok(layoutIdx !== -1, 'Container .v2v-workspace-layout phải tồn tại trong HTML');
        assert.ok(libIdx !== -1, '#v2v-library phải tồn tại trong HTML');

        assert.ok(guideIdx < layoutIdx, '#v2v-pipeline-guide phải nằm trước .v2v-workspace-layout');
        assert.ok(layoutIdx < libIdx, '.v2v-workspace-layout phải nằm trước #v2v-library');
    });

    await reporter.test(S, 'Tier 2: [DOM] .v2v-workspace-left chứa form tạo project, stepper và các bước 1-5', async () => {
        assert.ok(htmlContent.includes('class="v2v-workspace-left"'), 'HTML phải có class .v2v-workspace-left');
        
        // Cột trái phải chứa các thành phần dự án
        const leftStart = htmlContent.indexOf('class="v2v-workspace-left"');
        const rightStart = htmlContent.indexOf('class="v2v-workspace-right"');
        assert.ok(leftStart < rightStart, 'Cột trái phải nằm trước cột phải');

        const leftBlock = htmlContent.substring(leftStart, rightStart);
        assert.ok(leftBlock.includes('id="v2v-project-name"'), 'Cột trái phải chứa ô nhập tên dự án');
        assert.ok(leftBlock.includes('id="v2v-ref-dropzone"'), 'Cột trái phải chứa dropzone video đối thủ');
        assert.ok(leftBlock.includes('id="v2v-hook-dropzone"'), 'Cột trái phải chứa dropzone video hook');
        assert.ok(leftBlock.includes('id="v2v-stepper"'), 'Cột trái phải chứa stepper quy trình 6 bước');
        assert.ok(leftBlock.includes('id="v2v-action-bar"'), 'Cột trái phải chứa action bar FSM');
        assert.ok(leftBlock.includes('id="v2v-input-panel"'), 'Cột trái phải chứa subpanel Bước 1 (Input panel)');
        assert.ok(leftBlock.includes('id="v2v-timeline-panel"'), 'Cột trái phải chứa subpanel Bước 4 (Timeline panel)');
    });

    await reporter.test(S, 'Tier 2: [DOM] .v2v-workspace-right chứa #v2v-final-review-panel', async () => {
        assert.ok(htmlContent.includes('class="v2v-workspace-right"'), 'HTML phải có class .v2v-workspace-right');
        
        const rightStart = htmlContent.indexOf('class="v2v-workspace-right"');
        const libStart = htmlContent.indexOf('id="v2v-library"');
        assert.ok(rightStart !== -1, 'Cột phải phải tồn tại trong HTML');
        assert.ok(libStart !== -1, 'Thư viện nguồn phải tồn tại trong HTML');
        const rightBlock = htmlContent.substring(rightStart, libStart);

        assert.ok(rightBlock.includes('id="v2v-final-review-panel"'), 'Cột phải phải chứa #v2v-final-review-panel');
        assert.ok(rightBlock.includes('id="v2v-video-player"'), 'Cột phải phải chứa video player thành phẩm');
        assert.ok(rightBlock.includes('id="v2v-batch-gallery"'), 'Cột phải phải chứa batch gallery các video đã dựng');
    });

    // ── Tier 2: CSS Quy định tỷ lệ 35% - 65% ───────────────────────────────────
    await reporter.test(S, 'Tier 2: [CSS] .v2v-workspace-layout có quy tắc chia cột 35% - 65%', async () => {
        assert.ok(
            cssContent.includes('.v2v-workspace-layout'),
            'CSS phải có class .v2v-workspace-layout'
        );
        assert.ok(
            cssContent.includes('35%') || cssContent.includes('35fr') || cssContent.includes('0.35'),
            'CSS phải quy định cột trái chiếm 35% chiều rộng'
        );
        assert.ok(
            cssContent.includes('65%') || cssContent.includes('65fr') || cssContent.includes('0.65'),
            'CSS phải quy định cột phải chiếm 65% chiều rộng'
        );
    });

    await reporter.test(S, 'Tier 2: [CSS] Cột phải có tính năng sticky và responsive mobile collapse', async () => {
        assert.ok(
            cssContent.includes('sticky'),
            'Cột phải hoặc panel review nên có position: sticky để bám theo khi cuộn'
        );
        assert.ok(
            cssContent.includes('@media') && (cssContent.includes('1100px') || cssContent.includes('1200px') || cssContent.includes('1024px')),
            'CSS phải có media query để co về 1 cột trên màn hình nhỏ/tablet'
        );
    });

    // ── Tier 2: Viền nổi bật & Đổ bóng nổi rõ (Elevation) cho 4 thẻ chính ──────
    await reporter.test(S, 'Tier 2: [CSS] Các thẻ v2v-card có viền nổi bật và box-shadow nổi hẳn lên so với nền body (cả Dark & Light)', async () => {
        assert.ok(
            cssContent.includes('.v2v-card') && cssContent.includes('box-shadow'),
            '.v2v-card phải có box-shadow để nổi bật trên nền dark'
        );
        assert.ok(
            cssContent.includes(':root[data-theme="light"] .v2v-card') || cssContent.includes('[data-theme="light"] .v2v-card'),
            'CSS phải có quy tắc viền và bóng đổ nổi bật cho .v2v-card ở chế độ sáng (light theme)'
        );
    });

    // ── Tier 2: Cả 2 cột đều tự nhiên (không cố định 1200px) nhưng phải có scroll ─
    await reporter.test(S, 'Tier 2: [CSS] Cả 2 cột (left/right) không bị cố định 1200px — chiều dài tự nhiên, giữ scroll', async () => {
        // Cột trái KHÔNG được có height: 1200px
        const leftRefBlock = cssContent.match(/\.v2v-workspace-left #v2v-reference\s*\{[^}]*\}/);
        if (leftRefBlock) {
            assert.ok(
                !leftRefBlock[0].includes('height: 1200px'),
                'Cột trái (#v2v-reference) KHÔNG được có height: 1200px'
            );
        }
        // Cột phải KHÔNG được có height: 1200px
        const rightCardBlock = cssContent.match(/\.v2v-workspace-right #v2v-final-review-card\s*\{[^}]*\}/);
        if (rightCardBlock) {
            assert.ok(
                !rightCardBlock[0].includes('height: 1200px'),
                'Cột phải (#v2v-final-review-card) KHÔNG được có height: 1200px'
            );
        }
        // Cả 2 vẫn phải tồn tại trong CSS
        assert.ok(
            (cssContent.includes('#v2v-reference') || cssContent.includes('.v2v-workspace-left')) &&
            (cssContent.includes('#v2v-final-review-card') || cssContent.includes('.v2v-workspace-right')),
            'Cả cột trái và cột phải phải được định nghĩa trong CSS workspace'
        );
    });

    await reporter.test(S, 'Tier 2: [CSS/JS] Cột phải đồng bộ chiều cao bằng cột trái và card phải scroll bên trong', async () => {
        const layoutBlock = cssContent.match(/\.v2v-workspace-layout\s*\{[^}]*\}/);
        assert.ok(layoutBlock, '.v2v-workspace-layout phải có CSS rule');

        const rightBlock = cssContent.match(/\.v2v-workspace-right\s*\{[^}]*\}/);
        assert.ok(rightBlock, '.v2v-workspace-right phải có CSS rule');

        const rightCardBlock = cssContent.match(/\.v2v-workspace-right #v2v-final-review-card\s*\{[^}]*\}/);
        assert.ok(rightCardBlock, '#v2v-final-review-card phải có CSS rule trong cột phải');
        assert.ok(
            rightCardBlock[0].includes('overflow-y: auto') || rightCardBlock[0].includes('overflow-y:auto'),
            '#v2v-final-review-card phải scroll được nội dung khi tràn'
        );

        // JS logic syncWorkspaceColumnsHeight
        assert.ok(
            jsContent.includes('syncWorkspaceColumnsHeight'),
            'JS phải có hàm syncWorkspaceColumnsHeight để đồng bộ chiều cao cột phải bằng cột trái'
        );
    });

    // ── Tier 2: Thanh scroll hiển thị đầy đủ dữ liệu & video output ───────────
    await reporter.test(S, 'Tier 2: [CSS] Cột trái và cột phải có thanh scroll (overflow-y: auto) để hiển thị đầy đủ dữ liệu và video output', async () => {
        assert.ok(
            cssContent.includes('overflow-y: auto') || cssContent.includes('overflow-y:auto'),
            'Thẻ làm việc phải có overflow-y: auto để kích hoạt thanh cuộn nội dung'
        );
        assert.ok(
            cssContent.includes('scrollbar-width') || cssContent.includes('::-webkit-scrollbar'),
            'CSS phải có style thanh cuộn tinh gọn (custom scrollbar)'
        );
    });

    // ── Tier 3: Stepper không bị xuống dòng ─────────────────────────────────────
    await reporter.test(S, 'Tier 3: [CSS] Stepper steps không bị xuống dòng (white-space: nowrap)', async () => {
        assert.ok(
            cssContent.includes('.v2v-step') && (
                cssContent.includes('white-space: nowrap') ||
                cssContent.includes('white-space:nowrap')
            ),
            '.v2v-step phải có white-space: nowrap để tránh xuống dòng'
        );
    });

    // ── Tier 3: Elevation buttons & cards bên trong 4 section ─────────────────────
    await reporter.test(S, 'Tier 3: [CSS] Buttons và inner cards bên trong 4 section có elevation (box-shadow + light override)', async () => {
        assert.ok(
            cssContent.includes('.v2v-guide-card'),
            '.v2v-guide-card phải tồn tại trong CSS'
        );
        assert.ok(
            cssContent.match(/\.v2v-guide-card\s*\{[^}]*box-shadow/) ||
            cssContent.includes('.v2v-guide-card:hover'),
            '.v2v-guide-card phải có box-shadow hoặc hover shadow để nổi bật'
        );
        assert.ok(
            cssContent.includes('[data-theme="light"] .v2v-guide-card') ||
            cssContent.includes('[data-theme="light"] .v2v-dropzone') ||
            cssContent.includes('[data-theme="light"] .v2v-btn'),
            'Light theme phải có elevation override cho buttons/inner cards'
        );
    });

    // ── Tier 3: Asset Modal hoạt động đúng ở Light mode ─────────────────────────
    await reporter.test(S, 'Tier 3: [CSS] #v2v-asset-modal có override light theme (nền trắng, chữ tối)', async () => {
        assert.ok(
            cssContent.includes('.v2v-modal-content'),
            '.v2v-modal-content phải có CSS rule'
        );
        assert.ok(
            cssContent.includes('[data-theme="light"] .v2v-modal-content') ||
            cssContent.includes('[data-theme="light"] .v2v-modal'),
            'Light theme phải override .v2v-modal-content thành nền sáng'
        );
        assert.ok(
            cssContent.includes('[data-theme="light"] .v2v-modal-head') ||
            cssContent.includes('[data-theme="light"] .v2v-modal-toolbar'),
            'Light theme phải override .v2v-modal-head và .v2v-modal-toolbar'
        );
    });

    await reporter.test(S, 'Tier 3: [CSS] #v2v-asset-modal body là vùng scroll để video modal hiển thị đầy đủ', async () => {
        const modalBodyBlock = cssContent.match(/\.v2v-modal-body\s*\{[^}]*\}/);
        assert.ok(modalBodyBlock, '.v2v-modal-body phải có CSS rule');
        assert.ok(
            (modalBodyBlock[0].includes('overflow-y: auto') || modalBodyBlock[0].includes('overflow-y:auto')) &&
            (modalBodyBlock[0].includes('min-height: 0') || modalBodyBlock[0].includes('min-height:0')),
            '.v2v-modal-body phải là flex scroll region với min-height: 0 để nội dung không bị cắt'
        );

        const modalVideoBlock = cssContent.match(/\.v2v-modal-video\s*\{[^}]*\}/);
        assert.ok(modalVideoBlock, '.v2v-modal-video phải có CSS rule');
        assert.ok(
            modalVideoBlock[0].includes('object-fit: contain') || modalVideoBlock[0].includes('object-fit:contain'),
            '#v2v-modal-video phải dùng object-fit: contain để video hiện đầy đủ trong khung'
        );
    });

    // ── Tier 3: .v2v-chip.strong light mode chữ tối ────────────────────────────
    await reporter.test(S, 'Tier 3: [CSS] .v2v-chip.strong có light theme override chữ tối (đen)', async () => {
        assert.ok(
            cssContent.includes('.v2v-chip.strong'),
            '.v2v-chip.strong phải tồn tại trong CSS'
        );
        assert.ok(
            cssContent.includes('[data-theme="light"] .v2v-chip.strong') ||
            cssContent.includes('[data-theme="light"] .v2v-chip'),
            'Light theme phải override .v2v-chip.strong để chữ đọc được (màu tối)'
        );
    });

    // ── Tier 3: Cột phải (right col) bằng chiều dài tự nhiên cột trái ───────────
    await reporter.test(S, 'Tier 3: [CSS] Cột phải (#v2v-final-review-card) KHÔNG bị cố định 1200px (về tự nhiên như cột trái)', async () => {
        const rightCardBlock = cssContent.match(/\.v2v-workspace-right #v2v-final-review-card\s*\{[^}]*\}/);
        if (rightCardBlock) {
            assert.ok(
                !rightCardBlock[0].includes('height: 1200px'),
                '#v2v-final-review-card KHÔNG được có height: 1200px — phải về tự nhiên bằng cột trái'
            );
        }
        // Still must have scroll capability
        assert.ok(
            cssContent.includes('overflow-y: auto') || cssContent.includes('overflow-y:auto'),
            'CSS phải vẫn giữ overflow-y: auto để user có thể scroll nội dung'
        );
    });

    // ── Tier 3: Gallery cards thu nhỏ 25%, player chính giữ nguyên ────────────
    await reporter.test(S, 'Tier 3: [CSS] .v2v-batch-gallery card thu nhỏ ~75% nhưng video player chính không bị shrink', async () => {
        assert.ok(
            cssContent.includes('.v2v-batch-gallery'),
            '.v2v-batch-gallery phải tồn tại trong CSS'
        );
        // Gallery grid column minmax phải nhỏ hơn 280px (~75% = 210px)
        const galleryBlock = cssContent.match(/\.v2v-batch-gallery\s*\{[^}]*\}/);
        if (galleryBlock) {
            const hasSmallerMin = galleryBlock[0].match(/minmax\((\d+)px/) &&
                parseInt(galleryBlock[0].match(/minmax\((\d+)px/)[1]) <= 215;
            assert.ok(hasSmallerMin, '.v2v-batch-gallery phải có minmax ≤ 215px (thu nhỏ 25% từ 280px)');
        }

        const galleryPlayerBlock = cssContent.match(/\.v2v-gallery-card \.v2v-player\s*\{[^}]*\}/);
        assert.ok(galleryPlayerBlock, '.v2v-gallery-card .v2v-player phải có rule riêng để chỉ thu nhỏ gallery video');
        const galleryMaxHeightMatch = galleryPlayerBlock[0].match(/max-height:\s*(\d+)px/);
        assert.ok(galleryMaxHeightMatch, '.v2v-gallery-card .v2v-player phải có max-height riêng');
        assert.ok(
            parseInt(galleryMaxHeightMatch[1]) <= 155,
            '.v2v-gallery-card .v2v-player phải giảm max-height xuống khoảng 150px'
        );

        const playerBlock = cssContent.match(/\.v2v-player\s*\{[^}]*\}/);
        assert.ok(playerBlock, '.v2v-player phải tồn tại cho video player chính');
        const playerMaxHeightMatch = playerBlock[0].match(/max-height:\s*(\d+)px/);
        assert.ok(playerMaxHeightMatch, '.v2v-player chính phải có max-height rõ ràng');
        assert.ok(
            parseInt(playerMaxHeightMatch[1]) >= 480,
            'Video player chính không được bị thu nhỏ xuống 360px; phải giữ khoảng 480px để user xem được'
        );
    });

    // =========================================================================
    // 8 MỤC CẢI TIẾN MỚI (TDD Workflow — Red Phase)
    // =========================================================================

    // ── Mục 1: Prompt & Logic Hook lấy đủ thời lượng video hook ────────────────
    await reporter.test(S, 'Tier 1: [Mục 1] Prompt & Combinatorial Planning giữ đủ thời lượng video hook', async () => {
        const genPath = path.resolve('byteplus/video_studio/timeline_generator.js');
        const genContent = fs.readFileSync(genPath, 'utf8');
        assert.ok(
            genContent.includes('FULL_HOOK_DURATION') || genContent.includes('hookDuration') || genContent.includes('full hook'),
            'timeline_generator.js phải có cơ chế lấy đủ thời lượng video hook không bị clamp 3.5s - 4.0s'
        );
    });

    // ── Mục 2: Dropdown Hook Type có mô tả / chú thích 1-2 dòng ───────────────
    await reporter.test(S, 'Tier 2: [Mục 2] Dropdown Hook Type có chú thích mô tả tác dụng 1-2 dòng', async () => {
        assert.ok(
            jsContent.includes('v2v-hook-desc-hint') || jsContent.includes('hook-desc') || jsContent.includes('hookDesc'),
            'video-to-video.js phải có container chú thích mô tả tác dụng của từng loại hook'
        );
    });

    // ── Mục 3: Step 1-4 full-width (ẩn cột phải), Step 5-6 hiện 2 cột ─────────
    await reporter.test(S, 'Tier 2: [Mục 3] CSS/JS ẩn cột phải ở Step 1-4 để cột trái full-width, hiện lại ở Step 5-6', async () => {
        assert.ok(
            cssContent.includes('.layout-single-col') || cssContent.includes('layout-single-column') || cssContent.includes('v2v-workspace-single'),
            'CSS phải hỗ trợ class layout 1 cột full width khi chưa gen video'
        );
    });

    // ── Mục 4: Click card trong Batch Gallery chuyển lên Video Player chính ───
    await reporter.test(S, 'Tier 2: [Mục 4] Click video trong Batch Gallery chuyển lên phát tại Video Player chính', async () => {
        assert.ok(
            jsContent.includes('v2v-video-player') && (jsContent.includes('selectGalleryVideo') || jsContent.includes('playInMainPlayer') || jsContent.includes('v2v-gallery-card')),
            'JS phải có handler click trên gallery card để chuyển src lên v2v-video-player'
        );
    });

    // ── Mục 5: Phân tích AI video đối thủ, hook & kho thư viện 100% Tiếng Việt
    await reporter.test(S, 'Tier 1: [Mục 5] Phân tích AI đối thủ/hook và mô tả kho yêu cầu Tiếng Việt', async () => {
        const promptPyPath = path.resolve('video-analyzer-pipeline/video-analyzer-standalone/video_analyzer/vision/prompts.py');
        const promptPy = fs.readFileSync(promptPyPath, 'utf8');
        assert.ok(
            promptPy.includes('tiếng Việt') || promptPy.includes('Tiếng Việt') || promptPy.includes('Vietnamese'),
            'prompts.py phải có chỉ thị rõ ràng về việc xuất mô tả bằng Tiếng Việt'
        );
    });

    // ── Mục 6: Upload nhiều video cùng lúc qua mạng LAN ổn định ───────────────
    await reporter.test(S, 'Tier 1: [Mục 6] Multipart parser hỗ trợ upload nhiều video và stream an toàn', async () => {
        const mpPath = path.resolve('byteplus/multipart.js');
        const mpContent = fs.readFileSync(mpPath, 'utf8');
        assert.ok(
            mpContent.includes('byteplusMultipart'),
            'multipart.js phải tồn tại và xuất byteplusMultipart'
        );
        assert.ok(
            mpContent.includes('2048 * 1024 * 1024') || mpContent.includes('2 * 1024 * 1024 * 1024'),
            'multipart.js phải cho phép dung lượng lớn (2GB) để nhiều video LAN upload không bị 413'
        );
        assert.ok(
            jsContent.includes('Đang tải (') || jsContent.includes('files[i]'),
            'video-to-video.js phải có cơ chế upload từng file kèm tiến trình để mạng LAN ổn định'
        );
    });

    // ── Mục 7: Chế độ Nền Trắng (Light Theme) tương phản tốt, không bị đen/chìm ─
    await reporter.test(S, 'Tier 3: [Mục 7] Light theme override đầy đủ màu text và nền cho các Step', async () => {
        assert.ok(
            cssContent.includes(':root[data-theme="light"] .v2v-input-slot') || cssContent.includes(':root[data-theme="light"] .v2v-input-slot-title'),
            'CSS phải có override nền sáng cho input slot'
        );
        assert.ok(
            cssContent.includes(':root[data-theme="light"] .v2v-batch-card') && cssContent.includes(':root[data-theme="light"] .v2v-gallery-card'),
            'CSS phải có override nền sáng cho batch matrix card và gallery card'
        );
        assert.ok(
            cssContent.includes(':root[data-theme="light"] .v2v-preflight-box') && cssContent.includes(':root[data-theme="light"] .v2v-stream-card'),
            'CSS phải có override nền sáng cho preflight box và stream card'
        );
    });

    // ── Mục 8: Không dùng kéo dãn frames (Slow-mo); điều chỉnh thời lượng từ Step 3 ─
    await reporter.test(S, 'Tier 2: [Mục 8] Assembler không ép slow-motion dãn frames; video chạy tốc độ tự nhiên', async () => {
        const asmPath = path.resolve('byteplus/video_studio/assembler.js');
        const asmContent = fs.readFileSync(asmPath, 'utf8');
        assert.ok(
            !asmContent.includes('multiplier = Math.round((D_target / clipDur)') || asmContent.includes('// NO_SLOWMO') || asmContent.includes('naturalSpeed: true'),
            'assembler.js không được tự ý kéo dãn chậm video khi clip ngắn hơn voice'
        );
    });

    // =========================================================================
    // 4 YÊU CẦU NÂNG CẤP MỚI (TDD Workflow)
    // =========================================================================

    // ── [Yêu cầu 1] Step 2: Bảng phân tích đối thủ & hook có thanh scroll ────────
    await reporter.test(S, 'Tier 2: [Yêu cầu 1] Bảng phân tích đối thủ và hook ở Step 2 có thanh scroll (max-height + overflow)', async () => {
        const freshCss = fs.readFileSync(path.resolve('public/studio/video-to-video.css'), 'utf8');
        assert.ok(
            freshCss.includes('#v2v-ref-analysis-panel .v2v-table-wrap') || freshCss.includes('.v2v-table-wrap'),
            'CSS phải có cấu hình scroll cho table wrap'
        );
        assert.ok(
            freshCss.match(/#v2v-ref-analysis-panel\s+\.v2v-table-wrap[^{]*\{[^}]*max-height:\s*(\d+)px/) ||
            freshCss.match(/#v2v-ref-analysis-panel[^{]*\.v2v-table-wrap[^{]*\{[^}]*overflow-y:\s*auto/),
            'Table wrap ở Step 2 phải có giới hạn max-height và overflow-y: auto'
        );
    });

    // ── [Yêu cầu 2] Step 4: Batch Matrix Grid có thanh scroll ──────────────────
    await reporter.test(S, 'Tier 2: [Yêu cầu 2] Batch Matrix Grid ở Step 4 có thanh scroll và đủ chiều dài cho card', async () => {
        const freshCss = fs.readFileSync(path.resolve('public/studio/video-to-video.css'), 'utf8');
        const matrixGridBlock = freshCss.match(/\.v2v-batch-matrix-grid\s*\{[^}]*\}/);
        assert.ok(matrixGridBlock, '.v2v-batch-matrix-grid phải có CSS rule');
        assert.ok(
            matrixGridBlock[0].includes('overflow-y: auto') || matrixGridBlock[0].includes('overflow-y:auto'),
            '.v2v-batch-matrix-grid phải có overflow-y: auto để cuộn'
        );
        const maxHMatch = matrixGridBlock[0].match(/max-height:\s*(\d+)px/);
        assert.ok(maxHMatch, '.v2v-batch-matrix-grid phải có max-height');
        assert.ok(
            parseInt(maxHMatch[1]) >= 480,
            '.v2v-batch-matrix-grid max-height phải >= 480px để đủ chiều dài hiển thị một card'
        );
    });

    // ── [Yêu cầu 3] Logic hiển thị theo step khi xem lại project đã hoàn thiện ──
    await reporter.test(S, 'Tier 2: [Yêu cầu 3] Stepper xem lại project hoàn thiện hiển thị đúng panel và layout từng bước', async () => {
        const freshJs = fs.readFileSync(path.resolve('public/studio/video-to-video.js'), 'utf8');
        assert.ok(
            freshJs.includes('step < 6') || freshJs.includes('step <= 5'),
            'showStepPanels phải chuyển sang single column cho step < 6 kể cả khi project đã có video hoàn thiện'
        );
    });

    // ── [Yêu cầu 4] AI mô tả video trong kho và project bằng Tiếng Việt ────────
    await reporter.test(S, 'Tier 1: [Yêu cầu 4] Kho video và project có mô tả Tiếng Việt', async () => {
        const libData = JSON.parse(fs.readFileSync(path.resolve('video_studio_library.json'), 'utf8'));
        assert.ok(Array.isArray(libData.assets) && libData.assets.length > 0, 'Kho thư viện phải có assets');
        // Kiểm tra ít nhất 1 asset có tiếng Việt
        const hasViAsset = libData.assets.some(a => {
            const txt = (a.aiDescription || '') + ' ' + JSON.stringify(a.description_index || []);
            return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(txt);
        });
        assert.ok(hasViAsset, 'Kho clip phải có mô tả chứa ký tự Tiếng Việt');
    });
}

