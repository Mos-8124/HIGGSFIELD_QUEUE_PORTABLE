/* Video to Video Studio — Client (SRS §3 - §14).
   Độc lập hoàn toàn với studio.js của luồng Kie. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const API = '/api/video-studio';

    let loadedAssets = [];
    let loadedProjects = [];
    let activeProject = null;
    // Kịch bản biến thể đang được nạp lên bảng sửa ở step 4. Bấm card nào -> đổi số này.
    let activeVariantIndex = 0;
    let _variantProjectId = null;
    let currentLibraryPage = 1;
    let libraryPageSize = 10;
    let librarySearchQuery = '';
    let libraryCategoryFilter = '';
    let libraryStatusFilter = 'all';

    // ── KHO 3 NHÓM (chốt 2026-09-18) — gương của LIBRARY_GROUPS trong byteplus/video_studio/library.js.
    // Bỏ hẳn khái niệm "chưa phân loại": clip nào không phải đối thủ/hook thì đều là Nguyên liệu.
    const LIBRARY_GROUPS = [
        { id: 'material', label: 'Nguyên liệu' },
        { id: 'reference', label: 'Video đối thủ' },
        { id: 'hook', label: 'Video hook' }
    ];
    const _REF_ALIASES = ['reference', 'ref', 'refs', 'doi-thu', 'doithu', 'doi_thu', 'competitor'];
    const _HOOK_ALIASES = ['hook', 'hooks', 'hook-video', 'hook_video'];

    function normalizeCat(raw) {
        const v = String(raw == null ? '' : raw).trim().toLowerCase().replace(/^\(|\)$/g, '');
        if (_HOOK_ALIASES.includes(v)) return 'hook';
        if (_REF_ALIASES.includes(v)) return 'reference';
        return 'material';
    }
    function catLabel(raw) {
        const g = LIBRARY_GROUPS.find(x => x.id === normalizeCat(raw));
        return g ? g.label : 'Nguyên liệu';
    }

    const CRITERIA_LABELS = {
        hook: 'Hook 3 giây đầu', structure: 'Cấu trúc kịch bản', pacing: 'Nhịp dựng',
        visual: 'Hình ảnh', audio: 'Âm thanh & giọng', message: 'Thông điệp', cta: 'Kêu gọi hành động'
    };
    const HOOK_TYPE_LABELS = {
        'cau-hoi': 'Câu hỏi', 'gay-soc': 'Gây sốc', 'van-de': 'Nêu vấn đề',
        'truoc-sau': 'Trước / Sau', 'so-sanh': 'So sánh', 'demo': 'Demo sản phẩm',
        'loi-chung': 'Lời chứng thực', 'con-so': 'Con số', 'khac': 'Khác'
    };

    async function api(pathname, opts) {
        const res = await fetch(API + pathname, opts);
        let data = null;
        try { data = await res.json(); } catch (_) {}
        if (!res.ok) throw new Error((data && (data.error || data.code)) || ('HTTP ' + res.status));
        return data;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    /** Rut gon ten clip de hien trong dong tien do: bo tien to bp_<ts>_<hash>_ va cat bot. */
    function shortAssetName(name, max = 26) {
        let n = String(name || '').replace(/^bp_\d+_[0-9a-f]+_/i, '').replace(/\.[a-z0-9]+$/i, '');
        if (n.length > max) n = n.slice(0, max - 1) + '…';
        return n;
    }
    function fmtDur(sec) {
        sec = Number(sec) || 0;
        const m = Math.floor(sec / 60), s = Math.round(sec % 60);
        return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`;
    }
    function fmtSize(bytes) {
        bytes = Number(bytes) || 0;
        if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
        if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
        if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + ' KB';
        return bytes + ' B';
    }

    const STATUS_MAP = {
        library_ready: { label: 'Kho sẵn sàng', step: 1 },
        library_described: { label: 'Kho đã mô tả AI', step: 1 },
        reference_imported: { label: 'Đã nạp video', step: 2 },
        reference_analyzed: { label: 'Đã phân tích AI', step: 3 },
        timeline_generated: { label: 'Đã sinh kịch bản', step: 3 },
        awaiting_script_review: { label: 'Chờ duyệt kịch bản', step: 4 },
        script_approved: { label: 'Kịch bản đã duyệt', step: 4 },
        assembling: { label: 'Đang dựng FFmpeg...', step: 5 },
        video_ready: { label: 'Video đã dựng xong', step: 5 },
        awaiting_final_review: { label: 'Chờ duyệt video cuối', step: 6 },
        final_approved: { label: 'Đã hoàn tất & duyệt', step: 6 },
        validation_failed: { label: 'Lỗi kiểm tra kịch bản', step: 4 },
        failed: { label: 'Thất bại', step: 1 }
    };

    function showAlert(msg, type = 'error') {
        const box = $('v2v-alert-box');
        if (!box) return;
        if (!msg) { box.hidden = true; box.innerHTML = ''; return; }
        box.className = `v2v-alert-box ${type}`;
        box.innerHTML = msg;
        box.hidden = false;
    }

    // ── Thư viện nguồn (SRS §3 & §4) ─────────────────────────────────
    function renderStats(stats) {
        if (!stats) return;
        const pill = $('v2v-stat-text');
        if (pill) pill.textContent = `Thư viện: ${stats.total} clip · ${fmtDur(stats.totalDurationSeconds)} · ${fmtSize(stats.totalSizeBytes)}`;
        const box = $('v2v-stats');
        if (box) {
            const cats = Object.entries(stats.byCategory || {})
                .map(([k, v]) => {
                    const catVal = (k === '(root)' || k === 'root') ? '__root__' : k;
                    const isSelected = (libraryCategoryFilter === catVal || (catVal === '__root__' && (libraryCategoryFilter === '__root__' || libraryCategoryFilter === '(root)')));
                    const label = (k === '(root)' || k === 'root') ? 'Kho gốc' : k;
                    return `<button type="button" class="v2v-chip v2v-chip-clickable ${isSelected ? 'strong' : ''}" data-cat="${esc(catVal)}" title="Nhấp để lọc danh mục ${esc(label)}">${esc(label)}: ${v}</button>`;
                }).join('');
            box.innerHTML = stats.total
                ? `<span class="v2v-chip strong">${stats.total} clip</span>` +
                  `<span class="v2v-chip">${fmtDur(stats.totalDurationSeconds)}</span>` +
                  `<span class="v2v-chip">${fmtSize(stats.totalSizeBytes)}</span>` +
                  `<span class="v2v-chip">Đã mô tả AI: ${stats.described || 0}/${stats.total}</span>` + cats
                : '';

            // Gắn sự kiện click cho các chip danh mục để lọc nhanh
            box.querySelectorAll('.v2v-chip-clickable').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const cat = normalizeCat(btn.dataset.cat);
                    const sel = $('v2v-library-category-filter');
                    if (libraryCategoryFilter === cat) {
                        // Toggle: nếu bấm lại vào chip đang chọn thì chuyển về Tất cả
                        libraryCategoryFilter = '';
                        if (sel) sel.value = '';
                    } else {
                        libraryCategoryFilter = cat;
                        if (sel) sel.value = cat;
                    }
                    currentLibraryPage = 1;
                    syncFilterButtonLabels();
                    renderFilteredAssets();
                    renderStats(stats);
                });
            });
        }
    }

    function getFilteredAssets() {
        let list = loadedAssets || [];
        const q = (librarySearchQuery || '').trim().toLowerCase();
        if (q) {
            list = list.filter(a => {
                const id = String(a.asset_id || '').toLowerCase();
                const fn = String(a.filename || '').toLowerCase();
                const cat = String(a.category || '').toLowerCase();
                const desc = String(a.aiDescription || '').toLowerCase();
                return id.includes(q) || fn.includes(q) || cat.includes(q) || desc.includes(q);
            });
        }
        if (libraryCategoryFilter) {
            const targetCat = normalizeCat(libraryCategoryFilter);
            list = list.filter(a => normalizeCat(a.category) === targetCat);
        }
        if (libraryStatusFilter === 'described') {
            list = list.filter(a => !!a.described);
        } else if (libraryStatusFilter === 'undescribed') {
            list = list.filter(a => !a.described);
        }
        return list;
    }

    function updateCategoryFilterOptions() {
        const sel = $('v2v-library-category-filter');
        if (!sel) return;
        const hasFilter = !!libraryCategoryFilter;
        const currentVal = hasFilter ? normalizeCat(libraryCategoryFilter) : '';

        const counts = { material: 0, reference: 0, hook: 0 };
        (loadedAssets || []).forEach(a => { counts[normalizeCat(a.category)]++; });

        const total = (loadedAssets || []).length;
        let html = `<option value=""${hasFilter ? '' : ' selected'}>Tất cả nhóm (${total})</option>`;
        LIBRARY_GROUPS.forEach(g => {
            const isSel = hasFilter && (g.id === currentVal);
            html += `<option value="${g.id}"${isSel ? ' selected' : ''}>${esc(g.label)} (${counts[g.id]})</option>`;
        });

        sel.innerHTML = html;
        sel.value = currentVal;
        syncFilterButtonLabels();
    }

    // ══════════════════════════════════════════════════════════════════════
    // POPOVER CHO BỘ LỌC — vỏ ngoài của <select>, KHÔNG thay thế nó.
    // Panel dựng item TỪ CHÍNH options của select, nên khi updateCategoryFilterOptions()
    // dựng lại danh sách kèm số đếm thì panel tự đúng theo, không phải chép logic lần hai.
    // ══════════════════════════════════════════════════════════════════════
    function syncFilterButtonLabels() {
        for (const pair of [['v2v-filter-cat-btn', 'v2v-library-category-filter'],
                            ['v2v-filter-status-btn', 'v2v-library-status-filter']]) {
            const btn = $(pair[0]), sel = $(pair[1]);
            if (!btn || !sel) continue;
            const opt = sel.options[sel.selectedIndex] || sel.options[0];
            const label = btn.querySelector('.v2v-filter-btn-label');
            if (label && opt) label.textContent = opt.textContent;
            // Đánh dấu khi đang lọc để user thấy ngay là danh sách không đầy đủ.
            btn.classList.toggle('is-active', sel.value !== '' && sel.value !== 'all');
        }
    }

    function wireSelectPopover(btnId, menuId, selId) {
        const btn = $(btnId), menu = $(menuId), sel = $(selId);
        if (!btn || !menu || !sel) return;

        const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
        const open = () => {
            // Dựng lại item mỗi lần mở -> luôn khớp options hiện tại của select.
            menu.innerHTML = Array.from(sel.options).map(o =>
                `<button type="button" role="menuitem" class="v2v-upload-opt v2v-filter-opt${o.value === sel.value ? ' is-current' : ''}" data-val="${esc(o.value)}"><span class="v2v-upload-opt-txt"><b>${esc(o.textContent)}</b></span></button>`).join('');
            menu.querySelectorAll('.v2v-filter-opt').forEach(item => {
                item.addEventListener('click', () => {
                    sel.value = item.dataset.val;
                    sel.dispatchEvent(new Event('change'));   // chạy đúng listener lọc sẵn có
                    syncFilterButtonLabels();
                    close();
                    btn.focus();
                });
            });
            menu.hidden = false;
            btn.setAttribute('aria-expanded', 'true');
            const first = menu.querySelector('.v2v-filter-opt');
            if (first) first.focus();
        };

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menu.hidden) open(); else close();
        });
        document.addEventListener('click', (e) => {
            if (menu.hidden) return;
            if (!menu.contains(e.target) && !btn.contains(e.target)) close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); }
        });
    }

    function renderFilteredAssets() {
        const grid = $('v2v-asset-grid');
        const paginationBar = $('v2v-library-pagination');
        const pageInfo = $('v2v-page-info');
        const pageNumbers = $('v2v-page-numbers');
        const pageFirst = $('v2v-page-first');
        const pagePrev = $('v2v-page-prev');
        const pageNext = $('v2v-page-next');
        const pageLast = $('v2v-page-last');
        const jumpInput = $('v2v-page-jump-input');

        if (!grid) return;

        const filtered = getFilteredAssets();
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / libraryPageSize));

        if (currentLibraryPage > totalPages) currentLibraryPage = totalPages;
        if (currentLibraryPage < 1) currentLibraryPage = 1;

        const startIndex = (currentLibraryPage - 1) * libraryPageSize;
        const endIndex = Math.min(startIndex + libraryPageSize, total);
        const pagedItems = filtered.slice(startIndex, endIndex);

        if (!loadedAssets.length) {
            grid.innerHTML = '<div class="v2v-empty">Chưa có clip nào trong kho. Bấm "Tải video vào kho" để thêm.</div>';
            if (paginationBar) paginationBar.style.display = 'none';
            return;
        }

        if (!filtered.length) {
            grid.innerHTML = '<div class="v2v-empty">Không tìm thấy clip nào phù hợp với bộ lọc tìm kiếm.</div>';
            if (paginationBar) paginationBar.style.display = 'none';
            return;
        }

        grid.innerHTML = pagedItems.map(a => {
            const hasDesc = !!a.described;
            const descText = a.aiDescription || '';
            const events = a.descriptionIndex || a.description_index || [];
            return `
            <div class="v2v-asset" data-id="${esc(a.asset_id)}" title="Bấm để xem video và toàn bộ mô tả chi tiết">
                <div class="v2v-thumb">
                    <img src="${API}/library/thumb/${encodeURIComponent(a.asset_id)}" alt="${esc(a.filename)}"
                        onerror="this.classList.add('v2v-thumb-fail');this.removeAttribute('src');" />
                </div>
                <div class="v2v-asset-top">
                    <span class="v2v-asset-id">${esc(a.asset_id)}</span>
                    ${a.category ? `<span class="v2v-chip">${esc(a.category)}</span>` : ''}
                </div>
                <div class="v2v-asset-name">${esc(a.filename)}</div>
                <div class="v2v-asset-meta">
                    ${fmtDur(a.duration)} · ${a.width}×${a.height} · ${a.fps}fps · ${esc(a.codec || '?')} · ${fmtSize(a.file_size)}
                </div>
                ${hasDesc && descText ? `
                    <div class="v2v-ai-desc" title="Mô tả AI tổng quan"><span data-icon="lightbulb" aria-hidden="true"></span> ${esc(descText)}</div>
                ` : ''}
                <div class="v2v-asset-foot">
                    <span class="${hasDesc ? 'v2v-ok' : 'v2v-muted'}">${hasDesc ? `✓ ${events.length ? events.length + ' mốc giây' : 'Đã có mô tả'}` : '• chưa mô tả'}</span>
                    <button class="v2v-btn sm primary" data-open="${esc(a.asset_id)}"><span data-icon="search" aria-hidden="true"></span> AI Mô tả</button>
                    <button class="v2v-link-btn" data-del="${esc(a.asset_id)}">Xoá</button>
                </div>
            </div>`;
        }).join('');

        // Bấm vào card hoặc nút "🔍 AI Mô tả" đều mở modal chi tiết video
        grid.querySelectorAll('.v2v-asset').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('[data-del]')) return;
                openAssetModal(card.dataset.id);
            });
        });

        // Wire delete buttons
        grid.querySelectorAll('[data-del]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                // Clip trong kho bị xoá CẢ FILE — nếu chỉ bỏ bản ghi thì lần quét kho sau nó sống lại.
                if (!confirm('Xoá clip này khỏi kho?\n\nClip nằm trong thư mục kho sẽ bị xoá luôn file trên đĩa (không hoàn lại được).')) return;
                try { await api('/library/assets/' + encodeURIComponent(btn.dataset.del), { method: 'DELETE' }); await loadAssets(); }
                catch (err) { alert('Lỗi: ' + err.message); }
            });
        });

        // Cập nhật thanh phân trang
        if (paginationBar) {
            paginationBar.style.display = 'flex';
            if (pageInfo) {
                pageInfo.textContent = `Hiển thị ${startIndex + 1} - ${endIndex} / ${total} clip (Trang ${currentLibraryPage}/${totalPages})`;
            }
            if (pageFirst) pageFirst.disabled = (currentLibraryPage <= 1);
            if (pagePrev) pagePrev.disabled = (currentLibraryPage <= 1);
            if (pageNext) pageNext.disabled = (currentLibraryPage >= totalPages);
            if (pageLast) pageLast.disabled = (currentLibraryPage >= totalPages);

            if (pageNumbers) {
                let pagesToShow = [];
                if (totalPages <= 7) {
                    for (let p = 1; p <= totalPages; p++) pagesToShow.push(p);
                } else {
                    pagesToShow.push(1);
                    if (currentLibraryPage > 3) pagesToShow.push('...');
                    const s = Math.max(2, currentLibraryPage - 1);
                    const e = Math.min(totalPages - 1, currentLibraryPage + 1);
                    for (let p = s; p <= e; p++) pagesToShow.push(p);
                    if (currentLibraryPage < totalPages - 2) pagesToShow.push('...');
                    pagesToShow.push(totalPages);
                }
                pageNumbers.innerHTML = pagesToShow.map(p => {
                    if (p === '...') return `<span class="pagination-ellipsis" style="color:var(--text-muted);padding:0 4px;">…</span>`;
                    const activeClass = p === currentLibraryPage ? 'active' : '';
                    return `<button type="button" class="pagination-btn sm ${activeClass}" data-page="${p}">${p}</button>`;
                }).join('');

                pageNumbers.querySelectorAll('[data-page]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        currentLibraryPage = Number(btn.dataset.page);
                        renderFilteredAssets();
                    });
                });
            }

            if (jumpInput) {
                jumpInput.value = currentLibraryPage;
                jumpInput.max = totalPages;
            }
        }
    }

    function renderAssets(assets) {
        loadedAssets = (assets || []).slice().sort((a, b) => {
            const tA = a.mtime || (a.createdAt ? new Date(a.createdAt).getTime() : 0) || (a.file_hash ? Number(a.file_hash.split(':')[0]) : 0) || 0;
            const tB = b.mtime || (b.createdAt ? new Date(b.createdAt).getTime() : 0) || (b.file_hash ? Number(b.file_hash.split(':')[0]) : 0) || 0;
            return tB - tA;
        });
        updateCategoryFilterOptions();
        renderFilteredAssets();
    }

    function initLibraryPaginationEvents() {
        const searchInput = $('v2v-library-search');
        const searchClear = $('v2v-library-search-clear');
        const catFilter = $('v2v-library-category-filter');
        const statusFilter = $('v2v-library-status-filter');
        wireSelectPopover('v2v-filter-cat-btn', 'v2v-filter-cat-menu', 'v2v-library-category-filter');
        wireSelectPopover('v2v-filter-status-btn', 'v2v-filter-status-menu', 'v2v-library-status-filter');
        syncFilterButtonLabels();
        const pageSizeSelect = $('v2v-library-pagesize');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                librarySearchQuery = searchInput.value.trim();
                if (searchClear) searchClear.style.display = librarySearchQuery ? 'block' : 'none';
                currentLibraryPage = 1;
                renderFilteredAssets();
            });
        }
        if (searchClear) {
            searchClear.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                librarySearchQuery = '';
                searchClear.style.display = 'none';
                currentLibraryPage = 1;
                renderFilteredAssets();
            });
        }
        if (catFilter) {
            catFilter.addEventListener('change', () => {
                libraryCategoryFilter = catFilter.value;
                currentLibraryPage = 1;
                renderFilteredAssets();
            });
        }
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                libraryStatusFilter = statusFilter.value;
                currentLibraryPage = 1;
                renderFilteredAssets();
            });
        }
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', () => {
                libraryPageSize = parseInt(pageSizeSelect.value, 10) || 10;
                currentLibraryPage = 1;
                renderFilteredAssets();
            });
        }

        const pageFirst = $('v2v-page-first');
        const pagePrev = $('v2v-page-prev');
        const pageNext = $('v2v-page-next');
        const pageLast = $('v2v-page-last');
        const jumpInput = $('v2v-page-jump-input');
        const jumpBtn = $('v2v-page-jump-btn');

        if (pageFirst) {
            pageFirst.addEventListener('click', () => {
                currentLibraryPage = 1;
                renderFilteredAssets();
            });
        }
        if (pagePrev) {
            pagePrev.addEventListener('click', () => {
                currentLibraryPage = Math.max(1, currentLibraryPage - 1);
                renderFilteredAssets();
            });
        }
        if (pageNext) {
            pageNext.addEventListener('click', () => {
                currentLibraryPage++;
                renderFilteredAssets();
            });
        }
        if (pageLast) {
            pageLast.addEventListener('click', () => {
                const total = getFilteredAssets().length;
                currentLibraryPage = Math.max(1, Math.ceil(total / libraryPageSize));
                renderFilteredAssets();
            });
        }
        const doJump = () => {
            if (!jumpInput) return;
            const p = parseInt(jumpInput.value, 10);
            const total = getFilteredAssets().length;
            const maxP = Math.max(1, Math.ceil(total / libraryPageSize));
            if (!isNaN(p) && p >= 1 && p <= maxP) {
                currentLibraryPage = p;
                renderFilteredAssets();
            } else if (p > maxP) {
                currentLibraryPage = maxP;
                renderFilteredAssets();
            } else {
                jumpInput.value = currentLibraryPage;
            }
        };
        if (jumpBtn) jumpBtn.addEventListener('click', doJump);
        if (jumpInput) {
            jumpInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    doJump();
                }
            });
        }
    }


    async function loadAssets() {
        try {
            const data = await api('/library/assets');
            renderAssets(data.assets);
            renderStats(data.stats);
        } catch (_) {}
    }

    async function scan(silent) {
        const btn = $('v2v-scan-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Đang quét…'; }
        try {
            const data = await api('/library/scan', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            renderStats(data.stats);
            await loadAssets();
            if (!silent) {
                const r = data.result || {};
                let msg = `Xong: +${r.added} mới, ${r.updated} cập nhật, ${r.unchanged} giữ nguyên.`;
                if (r.errors && r.errors.length) msg += ` ⚠️ ${r.errors.length} file lỗi ffprobe.`;
                alert(msg);
            }
            // Tự refresh khi AI describe nền hoàn tất
            const undesc = loadedAssets.filter(a => !a.described);
            if (undesc.length > 0) pollUntilAllDescribed(90);
        } catch (e) {
            if (!silent) alert('Quét thất bại: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Quét lại kho'; }
        }
    }

    async function uploadFiles() {
        const input = $('v2v-upload-input');
        const files = input && input.files ? Array.from(input.files) : [];
        if (!files.length) return;
        const btn = $('v2v-upload-btn');
        btn.disabled = true;

        let successCount = 0;
        let failCount = 0;
        const errors = [];
        let lastStats = null;

        try {
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                btn.textContent = `Đang tải (${i + 1}/${files.length}): ${f.name.slice(0, 18)}…`;
                try {
                    const fd = new FormData();
                    fd.append('videos', f);
                    // Nhóm user chọn ở bộ "Tải lên vào" — mặc định là video đối thủ.
                    const catSel = $('v2v-upload-category');
                    fd.append('category', (catSel && catSel.value) || 'material');
                    const res = await fetch(API + '/library/upload', { method: 'POST', body: fd });
                    let data = null;
                    try { data = await res.json(); } catch (_) {}
                    if (!res.ok) {
                        throw new Error((data && (data.error || data.code)) || ('HTTP ' + res.status));
                    }
                    successCount += (data.uploaded || 1);
                    if (data.stats) lastStats = data.stats;
                } catch (fileErr) {
                    failCount++;
                    errors.push(`${f.name}: ${fileErr.message}`);
                }
            }

            if (lastStats) renderStats(lastStats);
            await loadAssets();

            if (failCount > 0) {
                alert(`Đã tải xong: ${successCount}/${files.length} video thành công qua mạng LAN.\nCó ${failCount} video lỗi:\n` + errors.join('\n'));
            } else {
                alert(`Đã tải thành công toàn bộ ${successCount} video vào kho qua mạng LAN. AI đang phân tích tự động ở nền…`);
            }

            // Polling: tự refresh mỗi 3s trong tối đa 90s để bắt kết quả AI describe nền
            pollUntilAllDescribed(90);
        } catch (e) {
            alert('Quá trình tải lên gặp sự cố: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Tải video vào kho';
            input.value = '';
        }
    }

    let _pollTimer = null;
    function updateLibraryAiProgressBar(progData, undescribedCount, totalAssets) {
        const wrap = $('v2v-library-ai-progress');
        if (!wrap) return;

        const statusEl = $('v2v-lib-ai-status');
        const pctEl = $('v2v-lib-ai-percent');
        const barEl = $('v2v-lib-ai-bar');
        const detailsEl = $('v2v-lib-ai-details');

        const active = progData && (progData.active || (progData.count && progData.count > 0));
        const analyzingCount = (progData && progData.count) || 0;
        const total = (progData && progData.total) || (undescribedCount + (progData?.done || 0)) || totalAssets || 1;
        const done = (progData && progData.done) || Math.max(0, total - undescribedCount);
        // Kẹp cả phần CHỮ, không chỉ phần trăm. Trước đây phần trăm có Math.min(100, ...)
        // nên hiện 100% tử tế, còn chữ thì phơi ra "193/181".
        const doneShown = Math.min(done, total);

        // Chỉ căn cứ vào trạng thái CHẠY THẬT. Bản cũ còn xét thêm "vẫn còn clip chưa mô tả":
        // clip nào lỗi giữa chừng thì không bao giờ được mô tả lại, điều kiện đó đúng vĩnh viễn
        // nên thanh "đang phân tích… 100%" đứng im mãi dù chẳng có luồng nào chạy.
        const running = !!(active || analyzingCount > 0);

        if (running) {
            wrap.style.display = 'block';
            const pct = Math.min(100, Math.max(0, Math.round((doneShown / Math.max(1, total)) * 100)));
            if (statusEl) {
                statusEl.innerHTML = `<span data-icon="bot" aria-hidden="true"></span> 5 AI đang phân tích kho video (${doneShown}/${total} clip)...`;
            }
            if (pctEl) pctEl.textContent = `${pct}%`;
            if (barEl) barEl.style.width = `${pct}%`;

            if (detailsEl && progData && progData.tasks) {
                const currentFiles = Object.values(progData.tasks).map(t => t.filename || t.stage || 'video').filter(Boolean);
                // Ten that dai ~85 ky tu (bp_<timestamp>_<hash>_<ten goc>.mp4). Voi 5 luong
                // chay song song, ghep 3 ten la dong nay dai ~260 ky tu va keo vo khung tran ra.
                // Array.map truyen ca CHI SO lam tham so thu 2, nen neu dua thang ham vao map
                // thi max bi nhan gia tri 0 roi 1 -> ten dau chi mat 1 ky tu, ten sau con moi dau ba cham.
                // Phai goi tuong minh moi giu duoc mac dinh 26 ky tu.
                const shown = currentFiles.slice(0, 2).map(n => shortAssetName(n));
                const more = currentFiles.length - shown.length;
                detailsEl.textContent = currentFiles.length
                    ? `Đang xử lý song song ${currentFiles.length} clip: ${shown.join(', ')}${more > 0 ? ` (+${more})` : ''}`
                    : '';
            }
        } else if (undescribedCount === 0 && wrap.style.display !== 'none') {
            if (statusEl) {
                statusEl.innerHTML = `✓ Đã hoàn tất phân tích toàn bộ ${totalAssets} video trong kho!`;
            }
            if (pctEl) pctEl.textContent = '100%';
            if (barEl) barEl.style.width = '100%';
            if (detailsEl) detailsEl.textContent = 'Tất cả clip đã sẵn sàng làm nguyên liệu sinh kịch bản.';
            setTimeout(() => {
                if (wrap && (!progData || !progData.active)) wrap.style.display = 'none';
            }, 4000);
        } else if (undescribedCount > 0 && wrap.style.display !== 'none') {
            // Hết luồng mà vẫn còn clip chưa mô tả ⇒ lượt vừa rồi ĐÃ DỪNG (clip lỗi giữa chừng,
            // hoặc server khởi động lại). Nói đúng như thế, đừng để thanh chạy giả.
            const donePct = Math.round(((totalAssets - undescribedCount) / Math.max(1, totalAssets)) * 100);
            if (statusEl) {
                statusEl.innerHTML = `<span data-icon="bot" aria-hidden="true"></span> Đã dừng — còn ${undescribedCount} clip chưa mô tả`;
            }
            if (pctEl) pctEl.textContent = `${donePct}%`;
            if (barEl) barEl.style.width = `${donePct}%`;
            if (detailsEl) detailsEl.textContent = 'Bấm "Quét lại kho" để AI chạy tiếp những clip còn lại.';
        } else {
            wrap.style.display = 'none';
        }
    }

    function pollUntilAllDescribed(maxSeconds = 120) {
        if (_pollTimer) clearInterval(_pollTimer);
        let elapsed = 0;
        const pill = $('v2v-stat-text');
        const poll = async () => {
            elapsed += 2;
            try {
                const progRes = await fetch(API + '/analyze-progress');
                const progData = await progRes.json();

                // Đánh dấu card nào đang được AI phân tích
                document.querySelectorAll('.v2v-asset').forEach(card => {
                    const id = card.getAttribute('data-id');
                    if (progData.tasks && progData.tasks[id]) {
                        card.classList.add('v2v-asset-analyzing');
                    } else {
                        card.classList.remove('v2v-asset-analyzing');
                    }
                });

                await loadAssets();
                const undescribed = loadedAssets.filter(a => !a.described);
                const analyzingCount = progData.count || 0;

                updateLibraryAiProgressBar(progData, undescribed.length, loadedAssets.length);

                if (pill) {
                    if (analyzingCount > 0) {
                        const stages = Object.values(progData.tasks || {});
                        const avgPct = stages.length ? Math.round(stages.reduce((s, t) => s + (t.progress || 0), 0) / stages.length * 100) : 0;
                        pill.textContent = `⏳ 5 AI đang phân tích ${analyzingCount} video… (${avgPct}%)`;
                    } else if (undescribed.length > 0) {
                        pill.textContent = `⏳ Chờ 5 AI phân tích ${undescribed.length} video…`;
                    } else {
                        pill.textContent = `✓ Tất cả ${loadedAssets.length} clip đã có mô tả AI`;
                    }
                }

                if ((undescribed.length === 0 && analyzingCount === 0 && !progData.active) || elapsed >= maxSeconds) {
                    clearInterval(_pollTimer);
                    _pollTimer = null;
                    document.querySelectorAll('.v2v-asset-analyzing').forEach(c => c.classList.remove('v2v-asset-analyzing'));
                    updateLibraryAiProgressBar(progData, 0, loadedAssets.length);
                    renderStats(null);
                    await loadAssets();
                }
            } catch (_) {}
        };
        poll();
        _pollTimer = setInterval(poll, 2000);
    }

    // ── Asset Detail & AI Description Modal (SRS §4) ──────────────────
    let currentModalAssetId = null;

    async function openAssetModal(assetId) {
        currentModalAssetId = assetId;
        const modal = $('v2v-asset-modal');
        if (!modal) return;

        let a = loadedAssets.find(x => x.asset_id === assetId);
        if (!a) {
            try {
                const res = await api(`/library/assets/${encodeURIComponent(assetId)}`);
                a = res.asset;
            } catch (_) {}
        }
        if (!a) {
            alert('Không tìm thấy video này trong kho.');
            return;
        }

        // Header info
        $('v2v-modal-title').textContent = a.filename;
        $('v2v-modal-id').textContent = '#' + a.asset_id;
        const catEl = $('v2v-modal-category');
        if (catEl) {
            catEl.textContent = a.category || 'Mặc định';
            catEl.hidden = !a.category;
        }

        // Metadata
        $('v2v-modal-meta').innerHTML = `
            <span><span data-icon="clock" aria-hidden="true"></span> Thời lượng: <strong>${fmtDur(a.duration)}</strong></span>
            <span><span data-icon="ruler" aria-hidden="true"></span> Độ phân giải: <strong>${a.width || '?'}×${a.height || '?'}</strong></span>
            <span><span data-icon="film" aria-hidden="true"></span> FPS: <strong>${a.fps || '?'}</strong></span>
            <span><span data-icon="save" aria-hidden="true"></span> Kích thước: <strong>${fmtSize(a.file_size)}</strong></span>
            <span><span data-icon="tag" aria-hidden="true"></span> Codec: <strong>${esc(a.codec || '?')}</strong></span>
        `;

        // Video Player (hỗ trợ HTTP 206 streaming)
        const video = $('v2v-modal-video');
        if (video) {
            video.src = `${API}/library/video/${encodeURIComponent(a.asset_id)}`;
            video.load();
        }

        // Render AI Description
        renderModalDescription(a);

        // Hiển thị modal
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeAssetModal() {
        const modal = $('v2v-asset-modal');
        if (!modal) return;
        const video = $('v2v-modal-video');
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
        }
        modal.hidden = true;
        document.body.style.overflow = '';
        currentModalAssetId = null;
    }

    function renderModalDescription(a) {
        const statusBox = $('v2v-modal-status');
        const summaryBox = $('v2v-modal-summary');
        const tbody = $('v2v-modal-events-tbody');
        const analyzeBtn = $('v2v-modal-analyze-btn');

        if (statusBox) statusBox.hidden = true;
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = a.described
                ? '<span data-icon="refresh-cw" aria-hidden="true"></span> Phân tích lại bằng AI'
                : '<span data-icon="bot" aria-hidden="true"></span> AI Phân tích mô tả video này';
        }

        const events = a.descriptionIndex || a.description_index || [];
        const summary = a.aiDescription || a.summary || '';

        // Hiển thị tóm tắt
        if (summaryBox) {
            if (summary) {
                summaryBox.innerHTML = `<p>${esc(summary)}</p>`;
            } else if (events.length > 0) {
                summaryBox.innerHTML = `<p><em>Đã trích xuất ${events.length} mốc thời gian hành động từ video.</em></p>`;
            } else {
                summaryBox.innerHTML = `<span style="color:var(--text-muted);">Chưa có mô tả AI. Nhấn nút "AI Phân tích mô tả video này" ở trên để AI phân tích chi tiết.</span>`;
            }
        }

        // Hiển thị bảng events
        if (tbody) {
            if (events && events.length > 0) {
                tbody.innerHTML = events.map(ev => {
                    const start = Number(ev.start !== undefined ? ev.start : (ev.timestamp || 0)).toFixed(1);
                    const end = ev.end !== undefined ? Number(ev.end).toFixed(1) : null;
                    const timeLabel = end !== null ? `${start}s - ${end}s` : `${start}s`;
                    const scene = ev.scene || ev.shot || ev.role || '—';

                    // Trích xuất và làm sạch chuỗi hành động / con người
                    let descParts = [];
                    if (Array.isArray(ev.people) && ev.people.length) {
                        const cleanedPeople = ev.people.map(p => {
                            let s = String(p).trim();
                            s = s.replace(/\[['"]+/g, '').replace(/['"]+\]/g, '').replace(/\s+/g, ' ');
                            return s.trim();
                        }).filter(Boolean);
                        if (cleanedPeople.length) descParts.push(cleanedPeople.join(' · '));
                    } else if (Array.isArray(ev.actions) && ev.actions.length) {
                        descParts.push(ev.actions.join(', '));
                    }

                    // Thêm mô tả nếu khác scene và chưa nằm trong descParts
                    if (ev.description && ev.description !== ev.scene && !descParts.some(p => p.includes(ev.description))) {
                        descParts.unshift(ev.description);
                    }

                    if (!descParts.length) {
                        descParts.push(ev.description || ev.action || ev.visual || ev.scene || '—');
                    }

                    const descHtml = descParts.join('<div style="margin-bottom:3px;"></div>');

                    const tagList = [];
                    if (Array.isArray(ev.objects) && ev.objects.length) tagList.push(...ev.objects);
                    if (Array.isArray(ev.text) && ev.text.length) tagList.push(...ev.text);
                    if (Array.isArray(ev.ocr) && ev.ocr.length) tagList.push(...ev.ocr);
                    const tags = tagList.length ? tagList.join(', ') : '—';

                    return `<tr>
                        <td>
                            <a href="javascript:void(0)" class="v2v-time-link" onclick="window.__v2v_seek(${start})"><span data-icon="play" aria-hidden="true"></span> ${timeLabel}</a>
                        </td>
                        <td><span class="v2v-chip strong">${esc(scene)}</span></td>
                        <td style="line-height:1.5;">${descHtml}</td>
                        <td><span class="v2v-tag">${esc(String(tags))}</span></td>
                    </tr>`;
                }).join('');
            } else {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">Chưa có dữ liệu phân tích từng giây. Nhấn "AI Phân tích mô tả video này" để hệ thống tự động bóc tách.</td></tr>`;
            }
        }
    }

    const STAGE_LABELS = {
        starting: '🚀 Khởi động phân tích…',
        extracting_frames: '🎞️ Trích xuất khung hình…',
        analyzing_visual: '👁️ Phân tích hình ảnh bằng AI…',
        analyzing_audio: '🎧 Phân tích âm thanh (Whisper)…',
        merging: '🔗 Tổng hợp kết quả…',
        saving: '💾 Lưu mô tả…',
        audio_extraction: '🎵 Trích xuất âm thanh…',
        whisper_transcription: '🗣️ Nhận dạng giọng nói…',
        visual_analysis: '👁️ Phân tích hình ảnh bằng AI…',
        final_analysis: '📝 Tổng hợp phân tích cuối…'
    };

    async function doAnalyzeModalAsset(assetId) {
        const analyzeBtn = $('v2v-modal-analyze-btn');
        const statusBox = $('v2v-modal-status');
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.textContent = '⏳ Đang phân tích…';
        }
        if (statusBox) {
            statusBox.className = 'v2v-alert-box info';
            statusBox.hidden = false;
            statusBox.innerHTML = `
                <div style="margin-bottom:6px;">AI đang phân tích video… Vui lòng đợi.</div>
                <div class="v2v-progress-wrap">
                    <div class="v2v-progress-bar" id="v2v-modal-progress-bar" style="width:2%"></div>
                </div>
                <div id="v2v-modal-progress-label" style="margin-top:4px;font-size:12px;color:var(--text-secondary);">🚀 Khởi động…</div>
            `;
        }

        // Polling tiến trình từ backend mỗi 1.5s
        let progressPoll = setInterval(async () => {
            try {
                const r = await fetch(API + '/analyze-progress/' + encodeURIComponent(assetId));
                const p = await r.json();
                if (p.active) {
                    const pct = Math.round((p.progress || 0) * 100);
                    const bar = document.getElementById('v2v-modal-progress-bar');
                    const lbl = document.getElementById('v2v-modal-progress-label');
                    if (bar) bar.style.width = Math.max(pct, 2) + '%';
                    if (lbl) lbl.textContent = STAGE_LABELS[p.stage] || `⚙️ ${p.stage} (${pct}%)`;
                }
            } catch (_) {}
        }, 1500);

        try {
            const res = await api('/library/describe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetId })
            });

            clearInterval(progressPoll);
            if (statusBox) {
                statusBox.className = 'v2v-alert-box success';
                statusBox.innerHTML = `
                    <div>✓ Phân tích video thành công!</div>
                    <div class="v2v-progress-wrap"><div class="v2v-progress-bar" style="width:100%"></div></div>
                `;
            }

            await loadAssets();
            const updated = loadedAssets.find(x => x.asset_id === assetId) || res.asset;
            if (updated) {
                renderModalDescription(updated);
            }
        } catch (e) {
            clearInterval(progressPoll);
            if (statusBox) {
                statusBox.className = 'v2v-alert-box error';
                statusBox.textContent = 'Lỗi phân tích: ' + e.message;
            }
        } finally {
            clearInterval(progressPoll);
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.innerHTML = '<span data-icon="refresh-cw" aria-hidden="true"></span> Phân tích lại bằng AI';
            }
        }
    }

    window.__v2v_seek = function(sec) {
        const video = $('v2v-modal-video');
        if (video) {
            video.currentTime = Number(sec) || 0;
            video.play().catch(() => {});
        }
    };

    // ── Quản lý Projects & Kịch bản (SRS §5 - §14) ────────────────────
    async function loadProjects(preferredId = null) {
        try {
            const res = await api('/projects');
            loadedProjects = res.projects || [];
            renderProjectSelect(false, preferredId);
        } catch (_) {}
    }

    let projectSearchQuery = '';

    function renderProjectOptions() {
        const listEl = $('v2v-project-options-list');
        if (!listEl) return;
        const q = (projectSearchQuery || '').trim().toLowerCase();
        let filtered = loadedProjects;
        if (q) {
            filtered = loadedProjects.filter(p => {
                const name = String(p.name || '').toLowerCase();
                const id = String(p.id || '').toLowerCase();
                return name.includes(q) || id.includes(q);
            });
        }

        if (!filtered.length && q) {
            listEl.innerHTML = `<div class="v2v-custom-option" style="color:var(--text-muted);cursor:default;justify-content:center;padding:12px;">Không tìm thấy dự án nào</div>`;
            return;
        }

        const currentSelId = activeProject ? activeProject.id : ($('v2v-project-select') ? $('v2v-project-select').value : '');
        let html = `
            <div class="v2v-custom-option ${!currentSelId ? 'selected' : ''}" data-id="" style="color:var(--text-secondary);">
                <div class="v2v-opt-left">
                    <span class="v2v-opt-name">-- Không chọn dự án nào (Màn hình chờ) --</span>
                </div>
            </div>
        `;

        html += filtered.map(p => {
            const info = STATUS_MAP[p.status] || { label: p.status };
            const isSel = p.id === currentSelId;
            return `
                <div class="v2v-custom-option ${isSel ? 'selected' : ''}" data-id="${esc(p.id)}">
                    <div class="v2v-opt-left">
                        <span class="v2v-opt-name" title="${esc(p.name)}">${esc(p.name)}</span>
                        <span class="v2v-opt-status">${esc(info.label)}</span>
                    </div>
                    <button class="v2v-opt-del" data-del-id="${esc(p.id)}" title="Xoá dự án này">✕</button>
                </div>
            `;
        }).join('');

        listEl.innerHTML = html;
    }

    function initProjectSearchEvents() {
        const searchInput = $('v2v-project-search-input');
        const searchClear = $('v2v-project-search-clear');
        if (!searchInput) return;

        searchInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        searchInput.addEventListener('input', () => {
            projectSearchQuery = searchInput.value;
            if (searchClear) searchClear.style.display = projectSearchQuery ? 'block' : 'none';
            renderProjectOptions();
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const firstOpt = $('v2v-project-options-list') ? $('v2v-project-options-list').querySelector('.v2v-custom-option[data-id]') : null;
                if (firstOpt && firstOpt.dataset.id !== undefined) {
                    selectProject(firstOpt.dataset.id);
                    const customSelect = $('v2v-custom-project-select');
                    if (customSelect) customSelect.classList.remove('open');
                }
            }
        });
        if (searchClear) {
            searchClear.addEventListener('click', (e) => {
                e.stopPropagation();
                projectSearchQuery = '';
                searchInput.value = '';
                searchClear.style.display = 'none';
                renderProjectOptions();
                searchInput.focus();
            });
        }
    }

    function renderProjectSelect(allowAutoSelect = false, preferredId = null) {
        const sel = $('v2v-project-select');
        const triggerLabel = $('v2v-project-select-label');
        const listEl = $('v2v-project-options-list');

        if (!loadedProjects.length) {
            if (sel) sel.innerHTML = '<option value="">-- Chưa có dự án nào --</option>';
            if (triggerLabel) triggerLabel.textContent = '-- Chưa có dự án nào --';
            if (listEl) listEl.innerHTML = '<div class="v2v-custom-option" style="color:var(--text-muted);cursor:default;justify-content:center;">-- Chưa có dự án nào --</div>';
            $('v2v-active-workspace').hidden = true;
            $('v2v-no-project').hidden = false;
            const layout = document.querySelector('.v2v-workspace-layout');
            if (layout) layout.classList.add('layout-single-column');
            activeProject = null;
            return;
        }

        const prevVal = sel ? sel.value : '';
        let targetId = '';
        if (preferredId && loadedProjects.some(p => p.id === preferredId)) {
            targetId = preferredId;
        } else if (activeProject && loadedProjects.some(p => p.id === activeProject.id)) {
            targetId = activeProject.id;
        } else if (allowAutoSelect && prevVal && loadedProjects.some(p => p.id === prevVal)) {
            targetId = prevVal;
        } else if (allowAutoSelect && loadedProjects.length > 0) {
            targetId = loadedProjects[0].id;
        }

        if (sel) {
            sel.innerHTML = '<option value="">-- Chọn dự án để làm việc --</option>' +
                loadedProjects.map(p => {
                    const info = STATUS_MAP[p.status] || { label: p.status };
                    return `<option value="${esc(p.id)}">${esc(p.name)} [${esc(info.label)}]</option>`;
                }).join('');
            sel.value = targetId;
        }

        renderProjectOptions();

        if (targetId) {
            selectProject(targetId);
        } else {
            if (sel) sel.value = '';
            $('v2v-active-workspace').hidden = true;
            $('v2v-no-project').hidden = false;
            $('v2v-reference')?.classList.add('is-standby');
            const layout = document.querySelector('.v2v-workspace-layout');
            if (layout) layout.classList.add('layout-single-column');
            if (triggerLabel) triggerLabel.textContent = '-- Chọn dự án để làm việc --';
        }
    }

    async function selectProject(projectId, preferredStep = null) {
        const triggerLabel = $('v2v-project-select-label');
        const sel = $('v2v-project-select');
        if (sel && sel.value !== projectId) sel.value = projectId || '';

        const listEl = $('v2v-project-options-list');
        if (listEl) {
            listEl.querySelectorAll('.v2v-custom-option').forEach(opt => {
                if (opt.dataset.id === projectId) {
                    opt.classList.add('selected');
                } else {
                    opt.classList.remove('selected');
                }
            });
        }

        if (!projectId) {
            activeProject = null;
            if (triggerLabel) triggerLabel.textContent = loadedProjects.length ? '-- Chọn dự án để làm việc --' : '-- Chưa có dự án nào --';
            $('v2v-active-workspace').hidden = true;
            $('v2v-no-project').hidden = false;
            $('v2v-reference')?.classList.add('is-standby');
            const layout = document.querySelector('.v2v-workspace-layout');
            if (layout) layout.classList.add('layout-single-column');
            renderFinalReviewPanel(null);
            return;
        }

        try {
            const data = await api(`/projects/${encodeURIComponent(projectId)}`);
            activeProject = data.project;
            if (triggerLabel && activeProject) {
                const info = STATUS_MAP[activeProject.status] || { label: activeProject.status };
                triggerLabel.innerHTML = `<span style="font-weight:600;">${esc(activeProject.name)}</span> <span class="v2v-opt-status">${esc(info.label)}</span>`;
            }
            renderWorkspace(activeProject, preferredStep);
        } catch (e) {
            showAlert('Không thể tải chi tiết dự án: ' + e.message);
        }
    }

    async function createProject() {
        const nameInput = $('v2v-project-name');
        const name = (nameInput.value || '').trim();
        if (!name) {
            alert('Vui lòng nhập tên dự án.');
            nameInput.focus();
            return;
        }
        const refInput = $('v2v-ref-file');
        const refFile = refInput && refInput.files && refInput.files[0];
        const hookInput = $('v2v-hook-file');
        const hookFile = hookInput && hookInput.files && hookInput.files[0];

        const btn = $('v2v-create-project');
        btn.disabled = true; btn.textContent = 'Đang tạo…';
        try {
            const fd = new FormData();
            fd.append('name', name);
            const reqOutputs = $('v2v-requested-outputs') ? $('v2v-requested-outputs').value : '10';
            fd.append('requestedOutputs', reqOutputs);
            if (refFile) fd.append('refVideo', refFile);
            if (hookFile) fd.append('hookVideo', hookFile);
            const res = await fetch(API + '/projects', { method: 'POST', body: fd });
            let data = null; try { data = await res.json(); } catch (_) {}
            if (!res.ok) throw new Error((data && (data.error || data.code)) || ('HTTP ' + res.status));
            nameInput.value = '';
            if (refInput) refInput.value = '';
            if (hookInput) hookInput.value = '';
            // Reset dropzone: xoá preview + thu hồi object URL
            document.querySelectorAll('.v2v-dropzone').forEach(dz => {
                const inp = dz.querySelector('input[type="file"]');
                if (inp) updateDropzoneState(dz, inp);
            });
            if (data.project) {
                activeProject = data.project;
                await loadProjects(data.project.id);
                const initialStep = (data.project.referenceVideoPath ? 2 : 1);
                await selectProject(data.project.id, initialStep);
            } else {
                await loadProjects();
            }
        } catch (e) { alert('Lỗi tạo project: ' + e.message); }
        finally { btn.disabled = false; btn.textContent = 'Tạo project'; }
    }

    // Đồng bộ giao diện dropzone theo file đang chọn: preview video + tên + thông số.
    // Dùng chung cho picker, kéo thả, nút gỡ ✕ và lúc reset sau khi tạo project.
    function updateDropzoneState(dz, input) {
        const fnEl = dz.querySelector('.v2v-dropzone-filename');
        const metaEl = dz.querySelector('.v2v-dropzone-meta');
        const previewEl = dz.querySelector('.v2v-dropzone-preview');
        const file = input.files && input.files[0];

        // Thu hồi object URL của file trước để không rò bộ nhớ
        if (dz._v2vPreviewUrl) {
            try { URL.revokeObjectURL(dz._v2vPreviewUrl); } catch (_) {}
            dz._v2vPreviewUrl = null;
        }

        if (file) {
            dz.classList.add('v2v-has-file');
            dz._v2vFileSize = file.size;
            if (fnEl) fnEl.textContent = '✓ ' + file.name;
            if (metaEl) metaEl.textContent = fmtSize(file.size);
            if (previewEl) {
                const url = URL.createObjectURL(file);
                dz._v2vPreviewUrl = url;
                previewEl.src = url;
                previewEl.load();
            }
        } else {
            dz.classList.remove('v2v-has-file');
            dz._v2vFileSize = 0;
            if (fnEl) fnEl.textContent = '';
            if (metaEl) metaEl.textContent = '';
            if (previewEl) {
                previewEl.pause();
                previewEl.removeAttribute('src');
                previewEl.load();
            }
        }
    }

    function updateStepper(stepNumber) {
        const steps = document.querySelectorAll('#v2v-stepper .v2v-step');
        steps.forEach(st => {
            const num = Number(st.dataset.step);
            st.classList.remove('active', 'completed');
            if (num < stepNumber) st.classList.add('completed');
            else if (num === stepNumber) st.classList.add('active');
        });
    }

    // ── Step-based panel visibility ──
    // Mỗi step chỉ hiện panel tương ứng, các panel khác ẩn.
    let _activeViewStep = 0; // step đang hiển thị (do user click hoặc auto)

    const STEP_PANELS = {
        1: ['v2v-input-panel'],                                                                   // Video Input — hiện video đối thủ user tải lên
        2: ['v2v-scorecard-panel', 'v2v-ref-analysis-panel', 'v2v-hook-analysis-panel'],                                 // Phân tích AI đối thủ & hook
        3: ['v2v-preflight-panel'],                                                               // Đánh giá độ khớp kho Pre-flight Fast Gate
        4: ['v2v-batch-matrix-panel', 'v2v-timeline-panel'],                                      // Duyệt ma trận kịch bản biến thể & timeline
        5: ['v2v-batch-render-panel'],                                                            // Dựng đồng thời 10 luồng FFmpeg
        6: ['v2v-timeline-panel']                                                                 // Duyệt & Xuất trọn bộ (kịch bản bên trái, player & gallery bên phải)
    };
    const ALL_STEP_PANELS = [
        'v2v-input-panel', 'v2v-scorecard-panel', 'v2v-ref-analysis-panel', 'v2v-hook-analysis-panel', 'v2v-preflight-panel',
        'v2v-batch-matrix-panel', 'v2v-timeline-panel',
        'v2v-batch-render-panel'
    ];

    function showStepPanels(step) {
        _activeViewStep = step;
        const toShow = STEP_PANELS[step] || [];
        ALL_STEP_PANELS.forEach(id => {
            const el = $(id);
            if (!el) return;
            if (toShow.includes(id) && el.dataset.hasData === '1') {
                el.hidden = false;
            } else {
                el.hidden = true;
            }
        });
        // Highlight step đang xem trong stepper
        document.querySelectorAll('#v2v-stepper .v2v-step').forEach(st => {
            st.classList.remove('viewing');
            if (Number(st.dataset.step) === step) st.classList.add('viewing');
        });

        // Bố cục hiển thị theo đúng step mà user chọn xem:
        // - Step 1 đến Step 5: Luôn áp dụng layout 1 cột full-width (ẩn cột phải) để hiển thị đầy đủ chi tiết của từng bước
        // - Step 6: Khôi phục bố cục 2 cột (35%/65%) để hiển thị Video thành phẩm & Batch Gallery ở cột phải
        const layoutEl = document.querySelector('.v2v-workspace-layout');
        if (layoutEl) {
            if (step < 6) {
                layoutEl.classList.add('layout-single-column', 'layout-single-col');
            } else {
                layoutEl.classList.remove('layout-single-column', 'layout-single-col');
            }
        }
    }

    // Step 1: Thay đổi video input trước khi AI phân tích ở Bước 2
    let step1PendingRefFile = null;
    let step1PendingHookFile = null;
    let step1PendingRemoveHook = false;
    let step1RefPreviewUrl = null;
    let step1HookPreviewUrl = null;

    function cleanupStep1Urls() {
        if (step1RefPreviewUrl) {
            try { URL.revokeObjectURL(step1RefPreviewUrl); } catch (_) {}
            step1RefPreviewUrl = null;
        }
        if (step1HookPreviewUrl) {
            try { URL.revokeObjectURL(step1HookPreviewUrl); } catch (_) {}
            step1HookPreviewUrl = null;
        }
    }

    function checkStep1Dirty() {
        const isDirty = !!(step1PendingRefFile || step1PendingHookFile || step1PendingRemoveHook);
        const saveBtn = $('v2v-step1-save-btn');
        const cancelBtn = $('v2v-step1-cancel-btn');
        const statusEl = $('v2v-step1-save-status');
        if (saveBtn) saveBtn.disabled = !isDirty;
        if (cancelBtn) cancelBtn.style.display = isDirty ? 'inline-block' : 'none';
        if (statusEl) statusEl.textContent = isDirty ? '⚠️ Có thay đổi chưa lưu' : '';
    }

    function setStep1RefFile(file) {
        step1PendingRefFile = file;
        const dz = $('v2v-step1-ref-dropzone');
        const filenameEl = $('v2v-step1-ref-dz-filename');
        const labelEl = $('v2v-step1-ref-dz-label');
        const clearBtn = $('v2v-step1-ref-clear');
        const player = $('v2v-input-player');
        const emptyEl = $('v2v-input-ref-empty');
        const stateText = $('v2v-step1-ref-state-text');

        if (step1RefPreviewUrl) {
            try { URL.revokeObjectURL(step1RefPreviewUrl); } catch (_) {}
            step1RefPreviewUrl = null;
        }

        if (file) {
            if (dz) dz.classList.add('has-new-file');
            if (filenameEl) { filenameEl.textContent = '✓ Mới: ' + file.name + ' (' + fmtSize(file.size) + ')'; filenameEl.style.display = 'inline-block'; }
            if (labelEl) labelEl.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'flex';
            if (stateText) stateText.textContent = '🔄 Đã chọn file mới';
            step1RefPreviewUrl = URL.createObjectURL(file);
            if (player) {
                player.src = step1RefPreviewUrl;
                player.style.display = 'block';
                player.load();
            }
            if (emptyEl) emptyEl.style.display = 'none';
        } else {
            if (dz) dz.classList.remove('has-new-file');
            if (filenameEl) { filenameEl.textContent = ''; filenameEl.style.display = 'none'; }
            if (labelEl) labelEl.style.display = 'inline-block';
            if (clearBtn) clearBtn.style.display = 'none';
            if (activeProject && activeProject.referenceVideoPath) {
                if (player) {
                    player.src = `${API}/projects/${encodeURIComponent(activeProject.id)}/reference-video`;
                    player.style.display = 'block';
                    player.load();
                }
                if (emptyEl) emptyEl.style.display = 'none';
                if (stateText) stateText.textContent = '✓ Đã có video';
            } else {
                if (player) {
                    player.pause();
                    player.removeAttribute('src');
                    player.style.display = 'none';
                }
                if (emptyEl) emptyEl.style.display = 'flex';
                if (stateText) stateText.textContent = '⚠️ Chưa có video';
            }
        }
        checkStep1Dirty();
    }

    function setStep1HookFile(file) {
        step1PendingHookFile = file;
        step1PendingRemoveHook = false;
        const dz = $('v2v-step1-hook-dropzone');
        const filenameEl = $('v2v-step1-hook-dz-filename');
        const labelEl = $('v2v-step1-hook-dz-label');
        const clearBtn = $('v2v-step1-hook-clear');
        const player = $('v2v-input-hook-player');
        const emptyEl = $('v2v-input-hook-empty');
        const stateText = $('v2v-step1-hook-state-text');
        const removeBtn = $('v2v-step1-hook-remove-btn');

        if (step1HookPreviewUrl) {
            try { URL.revokeObjectURL(step1HookPreviewUrl); } catch (_) {}
            step1HookPreviewUrl = null;
        }

        if (file) {
            if (dz) dz.classList.add('has-new-file');
            if (filenameEl) { filenameEl.textContent = '✓ Mới: ' + file.name + ' (' + fmtSize(file.size) + ')'; filenameEl.style.display = 'inline-block'; }
            if (labelEl) labelEl.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'flex';
            if (stateText) stateText.textContent = '🔄 Đã chọn file mới';
            if (removeBtn) removeBtn.style.display = 'none';
            step1HookPreviewUrl = URL.createObjectURL(file);
            if (player) {
                player.src = step1HookPreviewUrl;
                player.style.display = 'block';
                player.load();
            }
            if (emptyEl) emptyEl.style.display = 'none';
        } else {
            if (dz) dz.classList.remove('has-new-file');
            if (filenameEl) { filenameEl.textContent = ''; filenameEl.style.display = 'none'; }
            if (labelEl) labelEl.style.display = 'inline-block';
            if (clearBtn) clearBtn.style.display = 'none';
            if (activeProject && activeProject.hookVideoPath && !step1PendingRemoveHook) {
                if (player) {
                    player.src = `${API}/projects/${encodeURIComponent(activeProject.id)}/hook-video`;
                    player.style.display = 'block';
                    player.load();
                }
                if (emptyEl) emptyEl.style.display = 'none';
                if (stateText) stateText.textContent = '✓ Đã có video hook';
                if (removeBtn) removeBtn.style.display = 'inline-block';
            } else {
                if (player) {
                    player.pause();
                    player.removeAttribute('src');
                    player.style.display = 'none';
                }
                if (emptyEl) emptyEl.style.display = 'flex';
                if (stateText) stateText.textContent = step1PendingRemoveHook ? '⚠️ Đã đánh dấu gỡ bỏ' : 'Chưa có';
                if (removeBtn) removeBtn.style.display = 'none';
            }
        }
        checkStep1Dirty();
    }

    // Step 1: hiện video đối thủ + video hook (nếu có) & cho phép thay đổi khi chưa phân tích AI ở bước 2
    function renderInputPanel(p) {
        const panel = $('v2v-input-panel');
        if (!panel) return;
        panel.dataset.hasData = '1';

        cleanupStep1Urls();
        step1PendingRefFile = null;
        step1PendingHookFile = null;
        step1PendingRemoveHook = false;

        const isAnalyzed = !p || (!['library_ready', 'reference_imported'].includes(p.status) || !!p.referenceAnalysis);

        const badge = $('v2v-step1-state-badge');
        const notice = $('v2v-step1-notice');
        const refDzBox = $('v2v-step1-ref-dz-box');
        const hookDzBox = $('v2v-step1-hook-dz-box');
        const actionsBar = $('v2v-step1-actions-bar');
        const saveBtn = $('v2v-step1-save-btn');
        const cancelBtn = $('v2v-step1-cancel-btn');
        const saveStatus = $('v2v-step1-save-status');

        if (saveBtn) saveBtn.disabled = true;
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (saveStatus) saveStatus.textContent = '';

        if (isAnalyzed) {
            if (badge) {
                badge.className = 'v2v-step1-state-badge locked';
                badge.innerHTML = '<span data-icon="lock" aria-hidden="true"></span> Đã phân tích AI (Khóa)';
            }
            if (notice) {
                notice.className = 'v2v-step1-notice warning';
                notice.textContent = '🔒 Video input đã được AI phân tích ở Bước 2. Cấu trúc kịch bản đã sinh dựa trên video này nên không thể thay đổi input.';
                notice.style.display = 'block';
            }
            if (refDzBox) refDzBox.style.display = 'none';
            if (hookDzBox) hookDzBox.style.display = 'none';
            if (actionsBar) actionsBar.style.display = 'none';
        } else {
            if (badge) {
                badge.className = 'v2v-step1-state-badge';
                badge.innerHTML = '<span data-icon="pen-line" aria-hidden="true"></span> Có thể thay đổi';
            }
            if (notice) {
                notice.className = 'v2v-step1-notice info';
                notice.textContent = '💡 Bạn có thể thay đổi hoặc tải lên video đối thủ và video hook trước khi AI phân tích ở Bước 2. Chọn file và bấm "Lưu thay đổi Video Input" để cập nhật.';
                notice.style.display = 'block';
            }
            if (refDzBox) refDzBox.style.display = 'block';
            if (hookDzBox) hookDzBox.style.display = 'block';
            if (actionsBar) actionsBar.style.display = 'flex';
        }

        // Slot 1: Video đối thủ
        const player = $('v2v-input-player');
        const emptyRef = $('v2v-input-ref-empty');
        const refName = $('v2v-input-ref-name');
        const refStateText = $('v2v-step1-ref-state-text');
        const refDz = $('v2v-step1-ref-dropzone');
        const refDzFilename = $('v2v-step1-ref-dz-filename');
        const refDzLabel = $('v2v-step1-ref-dz-label');
        const refClear = $('v2v-step1-ref-clear');
        const refFileInp = $('v2v-step1-ref-file');

        if (refFileInp) refFileInp.value = '';
        if (refDz) refDz.classList.remove('has-new-file');
        if (refDzFilename) { refDzFilename.textContent = ''; refDzFilename.style.display = 'none'; }
        if (refDzLabel) refDzLabel.style.display = 'inline-block';
        if (refClear) refClear.style.display = 'none';

        if (p && p.referenceVideoPath) {
            const src = `${API}/projects/${encodeURIComponent(p.id)}/reference-video`;
            if (player) {
                if (player.getAttribute('src') !== src) player.src = src;
                player.style.display = 'block';
            }
            if (emptyRef) emptyRef.style.display = 'none';
            if (refName) refName.textContent = p.referenceVideoName || '';
            if (refStateText) refStateText.textContent = '✓ Đã có video';
            if (refDzLabel) refDzLabel.textContent = 'Bấm hoặc kéo thả để đổi Video đối thủ';
        } else {
            if (player) {
                player.pause();
                player.removeAttribute('src');
                player.style.display = 'none';
            }
            if (emptyRef) emptyRef.style.display = 'flex';
            if (refName) refName.textContent = 'Chưa có video đối thủ';
            if (refStateText) refStateText.textContent = '⚠️ Chưa có video';
            if (refDzLabel) refDzLabel.textContent = 'Bấm hoặc kéo thả để tải lên Video đối thủ';
        }

        // Slot 2: Video hook
        const hookSlot = $('v2v-input-hook-slot');
        const hookPlayer = $('v2v-input-hook-player');
        const emptyHook = $('v2v-input-hook-empty');
        const hookName = $('v2v-input-hook-name');
        const hookStateText = $('v2v-step1-hook-state-text');
        const hookDz = $('v2v-step1-hook-dropzone');
        const hookDzFilename = $('v2v-step1-hook-dz-filename');
        const hookDzLabel = $('v2v-step1-hook-dz-label');
        const hookClear = $('v2v-step1-hook-clear');
        const hookRemoveBtn = $('v2v-step1-hook-remove-btn');
        const hookFileInp = $('v2v-step1-hook-file');

        if (hookFileInp) hookFileInp.value = '';
        if (hookDz) hookDz.classList.remove('has-new-file');
        if (hookDzFilename) { hookDzFilename.textContent = ''; hookDzFilename.style.display = 'none'; }
        if (hookDzLabel) hookDzLabel.style.display = 'inline-block';
        if (hookClear) hookClear.style.display = 'none';

        if (p && p.hookVideoPath) {
            const hookSrc = `${API}/projects/${encodeURIComponent(p.id)}/hook-video`;
            if (hookPlayer) {
                if (hookPlayer.getAttribute('src') !== hookSrc) hookPlayer.src = hookSrc;
                hookPlayer.style.display = 'block';
            }
            if (emptyHook) emptyHook.style.display = 'none';
            if (hookName) hookName.textContent = p.hookVideoName || '';
            if (hookStateText) hookStateText.textContent = '✓ Đã có video hook';
            if (hookDzLabel) hookDzLabel.textContent = 'Bấm hoặc kéo thả để đổi Video Hook';
            if (hookRemoveBtn) hookRemoveBtn.style.display = isAnalyzed ? 'none' : 'inline-block';
            if (hookSlot) hookSlot.hidden = false;
        } else {
            if (hookPlayer) {
                hookPlayer.pause();
                hookPlayer.removeAttribute('src');
                hookPlayer.style.display = 'none';
            }
            if (emptyHook) emptyHook.style.display = 'flex';
            if (hookName) hookName.textContent = 'Chưa có video hook (Tùy chọn)';
            if (hookStateText) hookStateText.textContent = 'Chưa có';
            if (hookDzLabel) hookDzLabel.textContent = 'Bấm hoặc kéo thả để thêm Video Hook';
            if (hookRemoveBtn) hookRemoveBtn.style.display = 'none';
            if (hookSlot) hookSlot.hidden = isAnalyzed;
        }
    }

    function renderWorkspace(p, preferredStep = null) {
        if (!p) return;
        $('v2v-active-workspace').hidden = false;
        $('v2v-no-project').hidden = true;
        $('v2v-reference')?.classList.remove('is-standby');
        showAlert(null); // clear alert

        // ── Reset: Ẩn TẤT CẢ panel + clear data flags ──
        ALL_STEP_PANELS.forEach(id => {
            const el = $(id);
            if (el) { el.hidden = true; el.dataset.hasData = '0'; }
        });
        // Clear nội dung summary box cũ
        const sumBox = $('v2v-ref-summary-box');
        if (sumBox) { sumBox.innerHTML = ''; }
        const hookSumBox = $('v2v-hook-summary-box');
        if (hookSumBox) { hookSumBox.innerHTML = ''; }
        const tlTbody = $('v2v-timeline-tbody');
        if (tlTbody) { tlTbody.innerHTML = ''; }

        $('v2v-current-title').textContent = p.name;
        $('v2v-current-id').textContent = '#' + p.id;
        const statusMeta = STATUS_MAP[p.status] || { label: p.status, step: 1 };
        $('v2v-current-status').textContent = statusMeta.label;
        const refBadges = [];
        if (p.referenceVideoName) refBadges.push(`🎯 Đối thủ: ${p.referenceVideoName}`);
        if (p.hookVideoName) refBadges.push(`🎣 Hook: ${p.hookVideoName}`);
        $('v2v-current-ref').textContent = refBadges.length ? refBadges.join(' · ') : 'Chưa có video input';

        const targetStep = (typeof preferredStep === 'number' && preferredStep >= 1) ? preferredStep : (statusMeta.step || 1);
        updateStepper(statusMeta.step);
        renderActionBar(p);

        // Render TẤT CẢ panel data (chỉ populate DOM + set hasData flag, KHÔNG tự hiện)
        renderInputPanel(p);
        renderRefAnalysis(p);
        renderScorecard(p.referenceAnalysis);
        renderKhoPicker('reference');
        renderKhoPicker('hook');
        renderHookAnalysis(p);
        renderPreflight(p);
        renderBatchMatrix(p);
        renderTimelinePanel(p);
        renderBatchRenderPanel(p);
        renderFinalReviewPanel(p);

        // Sau khi render xong → toggle visibility theo step hiện tại
        showStepPanels(targetStep);
    }

    // Menu loại Hook cho người dùng chọn (khớp HOOK TYPE MENU trong system prompt).
    // 'auto' = để model tự chọn hook phù hợp nhất với kịch bản.
    const HOOK_TYPE_OPTIONS = [
        { v: 'auto', label: '🎯 Auto (model tự chọn hook phù hợp)', desc: 'AI tự động phân tích góc độ sản phẩm & kịch bản đối thủ để chọn loại hook tối ưu nhất.' },
        { v: 'problem/pain', label: 'Problem / Pain', desc: 'Đánh thẳng vào nỗi đau / sự cố bực bội nhất của khách hàng để tạo sự đồng cảm tức thì.' },
        { v: 'shocking-stat', label: 'Shocking Stat', desc: 'Đưa ra con số thống kê hoặc dữ liệu gây sốc làm đảo lộn suy nghĩ thông thường.' },
        { v: 'bold-claim', label: 'Bold Claim', desc: 'Tuyên bố một khẳng định mạnh mẽ, táo bạo kích thích người xem dừng lướt để kiểm chứng.' },
        { v: 'negative/warning', label: 'Negative / Warning', desc: 'Cảnh báo sai lầm hoặc rủi ro nguy hiểm nếu người xem không biết mẹo này.' },
        { v: 'curiosity-gap', label: 'Curiosity Gap', desc: 'Tạo khoảng trống tò mò không thể cưỡng lại, buộc người xem phải xem tiếp để biết bí mật.' },
        { v: 'direct-question', label: 'Direct Question', desc: 'Đặt câu hỏi trực diện vào tình huống thực tế của người xem khiến họ phải gật đầu.' },
        { v: 'POV/relatable', label: 'POV / Relatable', desc: 'Góc nhìn người trong cuộc tái hiện cảnh đời thường quen thuộc, chân thực và gần gũi.' },
        { v: 'before-after-reveal', label: 'Before-After Reveal', desc: 'Tương phản ngoạn mục giữa đống bừa bộn ban đầu và thành quả gọn gàng hoàn hảo.' },
        { v: 'pattern-interrupt', label: 'Pattern Interrupt', desc: 'Hành động hoặc hình ảnh bất ngờ phá vỡ thói quen lướt newfeed của người dùng.' },
        { v: 'social-proof', label: 'Social Proof', desc: 'Hiệu ứng đám đông: nhấn mạnh hàng ngàn người đang phát cuồng hoặc tin dùng.' },
        { v: 'contrarian/myth-vs-fact', label: 'Contrarian / Myth vs Fact', desc: 'Lật tẩy quan niệm sai lầm phổ biến và chỉ ra sự thật bất ngờ.' },
        { v: 'demonstration', label: 'Demonstration', desc: 'Bắt đầu ngay bằng hành động thực chiến cho thấy sản phẩm phát huy công dụng.' },
        { v: 'story-cold-open', label: 'Story Cold-Open', desc: 'Nhảy thẳng vào nút thắt của câu chuyện gay cấn mà không dạo đầu rườm rà.' },
        { v: 'mistake', label: 'Mistake', desc: 'Tiết lộ sai lầm tai hại khiến tốn nhiều tiền bạc/thời gian trước khi tìm ra giải pháp.' },
        { v: 'price-shock', label: 'Price Shock', desc: 'So sánh mức phạt hoặc chi phí đắt đỏ với giải pháp tiết kiệm siêu rẻ này.' },
        { v: 'scarcity', label: 'Scarcity', desc: 'Tạo cảm giác khan hiếm, giới hạn số lượng hoặc thời gian thúc đẩy xem ngay.' },
        { v: 'discovery', label: 'Discovery ("I found this")', desc: 'Chia sẻ tâm thế vừa phát hiện ra món đồ bí mật cực hời muốn mách cho bạn bè.' },
        { v: 'comment-reply', label: 'Comment Reply', desc: 'Trả lời thắc mắc hoặc hoài nghi của người xem trong các video trước.' },
        { v: 'numbered-breakdown', label: 'Numbered Breakdown', desc: 'Công bố danh sách các lý do hoặc bước thực hiện nhanh, dễ nhớ.' }
    ];
    let selectedHookType = 'auto'; // giữ lựa chọn qua các lần re-render action bar

    function buildHookTypePicker() {
        const wrap = document.createElement('div');
        wrap.className = 'v2v-voice-picker';
        const label = document.createElement('label');
        label.setAttribute('for', 'v2v-hook-type-select');
        label.innerHTML = '<span data-icon="anchor" aria-hidden="true"></span> Loại Hook:';
        const sel = document.createElement('select');
        sel.id = 'v2v-hook-type-select';
        sel.className = 'v2v-select sm';
        sel.title = 'Chọn loại hook cho 3 giây đầu. Auto = model tự chọn hook phù hợp nhất với kịch bản.';
        for (const opt of HOOK_TYPE_OPTIONS) {
            const o = document.createElement('option');
            o.value = opt.v;
            o.textContent = opt.label;
            if (opt.v === selectedHookType) o.selected = true;
            sel.appendChild(o);
        }

        const descHint = document.createElement('div');
        descHint.className = 'v2v-hook-desc-hint';
        descHint.id = 'v2v-hook-desc-hint';
        const currentOpt = HOOK_TYPE_OPTIONS.find(x => x.v === selectedHookType) || HOOK_TYPE_OPTIONS[0];
        descHint.textContent = currentOpt ? currentOpt.desc : '';

        sel.addEventListener('change', () => { 
            selectedHookType = sel.value; 
            const found = HOOK_TYPE_OPTIONS.find(x => x.v === selectedHookType);
            if (descHint && found) {
                descHint.textContent = found.desc;
            }
        });

        wrap.appendChild(label);
        wrap.appendChild(sel);
        wrap.appendChild(descHint);
        return wrap;
    }

    function renderActionBar(p) {
        const bar = $('v2v-action-bar');
        if (!bar) return;
        bar.innerHTML = '';

        const st = p.status;

        if (st === 'library_ready') {
            const note = document.createElement('div');
            note.className = 'v2v-action-note';
            note.style.cssText = 'color: #94a3b8; font-size: 0.82rem; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(255,255,255,0.04); border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);';
            note.innerHTML = '<span>ℹ️ Dự án chưa có Video đối thủ. Hãy tải lên Video đối thủ ở <strong>Bước 1 (Video Input)</strong> phía dưới để bắt đầu phân tích AI.</span>';
            bar.appendChild(note);
        } else if (st === 'reference_imported') {
            const b = document.createElement('button');
            b.className = 'v2v-btn primary';
            if (p.hookVideoPath) {
                b.innerHTML = '<span data-icon="bot" aria-hidden="true"></span> Phân tích cả 2 video (đối thủ + hook)';
                b.onclick = () => doAnalyzeBoth(p.id, b);
            } else {
                b.innerHTML = '<span data-icon="bot" aria-hidden="true"></span> Phân tích video đối thủ (§6)';
                b.onclick = () => doAnalyzeReference(p.id, b);
            }
            bar.appendChild(b);
        } else if (st === 'reference_analyzed') {
            bar.appendChild(buildHookTypePicker());
            const b = document.createElement('button');
            b.className = 'v2v-btn primary';
            const count = p.requestedOutputs || 10;
            b.innerHTML = `<span data-icon="sparkles" aria-hidden="true"></span> Sinh đồng thời ${count} kịch bản biến thể (§7) (Chống trùng lặp đa tầng)`;
            b.onclick = () => doGenerateTimeline(p.id, b);
            bar.appendChild(b);
        } else if (st === 'timeline_generated' || st === 'awaiting_script_review') {
            const bApprove = document.createElement('button');
            bApprove.className = 'v2v-btn success';
            bApprove.innerHTML = '<span data-icon="rocket" aria-hidden="true"></span> Phê duyệt trọn bộ 10 kịch bản & Render song song FFmpeg (§8-11)';
            bApprove.onclick = () => doBatchApproveAndAssemble(p.id, bApprove);
            bar.appendChild(bApprove);

            bar.appendChild(buildHookTypePicker());
            const bRegen = document.createElement('button');
            bRegen.className = 'v2v-btn';
            bRegen.innerHTML = '<span data-icon="refresh-cw" aria-hidden="true"></span> Sinh lại 10 kịch bản biến thể';
            bRegen.onclick = () => doGenerateTimeline(p.id, bRegen);
            bar.appendChild(bRegen);
        } else if (st === 'script_approved') {
            const bAssemble = document.createElement('button');
            bAssemble.className = 'v2v-btn primary';
            bAssemble.innerHTML = '<span data-icon="zap" aria-hidden="true"></span> Dựng song song 10 video FFmpeg (Full tải) (§10-11)';
            bAssemble.onclick = () => doAssemble(p.id, bAssemble);
            bar.appendChild(bAssemble);
        } else if (st === 'assembling') {
            const b = document.createElement('button');
            b.className = 'v2v-btn';
            b.disabled = true;
            b.textContent = '⚡ Đang render các luồng FFmpeg trên CPU...';
            bar.appendChild(b);

            const bRetry = document.createElement('button');
            bRetry.className = 'v2v-btn warning';
            bRetry.innerHTML = '<span data-icon="refresh-cw" aria-hidden="true"></span> Dựng lại (Nếu bị gián đoạn)';
            bRetry.onclick = () => doAssemble(p.id, bRetry);
            bar.appendChild(bRetry);
        } else if (st === 'video_ready' || st === 'awaiting_final_review') {
            const bFinalApprove = document.createElement('button');
            bFinalApprove.className = 'v2v-btn success';
            bFinalApprove.textContent = '🎉 Phê duyệt Final (Duyệt xuất bản) (§12)';
            bFinalApprove.onclick = () => doFinalReview(p.id, 'approve', bFinalApprove);
            bar.appendChild(bFinalApprove);

            const bReject = document.createElement('button');
            bReject.className = 'v2v-btn danger';
            bReject.innerHTML = '<span data-icon="corner-up-left" aria-hidden="true"></span> Yêu cầu sửa kịch bản';
            bReject.onclick = () => doFinalReview(p.id, 'reject', bReject);
            bar.appendChild(bReject);
        } else if (st === 'final_approved') {
            const bDone = document.createElement('button');
            bDone.className = 'v2v-btn success';
            bDone.disabled = true;
            bDone.textContent = '✓ Dự án đã duyệt hoàn tất';
            bar.appendChild(bDone);

            const bEditAgain = document.createElement('button');
            bEditAgain.className = 'v2v-btn sm';
            bEditAgain.innerHTML = '<span data-icon="corner-up-left" aria-hidden="true"></span> Tạo bản sửa đổi kịch bản';
            bEditAgain.onclick = () => doFinalReview(p.id, 'reject', bEditAgain);
            bar.appendChild(bEditAgain);
        } else if (st === 'validation_failed') {
            showAlert('Kiểm tra kịch bản thất bại. Hãy kiểm tra lại clip nguồn và thời lượng trước khi dựng.', 'error');
            const bEdit = document.createElement('button');
            bEdit.className = 'v2v-btn primary';
            bEdit.textContent = 'Sửa kịch bản & Validate lại';
            bEdit.onclick = () => doApproveAndAssemble(p.id, bEdit);
            bar.appendChild(bEdit);
        }
    }

    async function doAnalyzeReference(projectId, btn) {
        btn.disabled = true; btn.textContent = 'Đang phân tích đối thủ bằng AI…';
        showAlert('⏳ AI đang bóc tách video tham chiếu qua Video Analyzer Pipeline...', 'info');
        try {
            const data = await api(`/projects/${encodeURIComponent(projectId)}/analyze-reference`, { method: 'POST' });
            activeProject = data.project;
            renderWorkspace(activeProject);
            showAlert('✓ Đã bóc tách cấu trúc video đối thủ thành công.', 'success');
        } catch (e) {
            showAlert('Lỗi phân tích video đối thủ: ' + e.message, 'error');
        } finally {
            btn.disabled = false; btn.innerHTML = '<span data-icon="bot" aria-hidden="true"></span> Phân tích video đối thủ (§6)';
        }
    }

    async function doAnalyzeBoth(projectId, btn) {
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang phân tích 2 video song song…'; }
        try {
            await Promise.all([
                api(`/projects/${encodeURIComponent(projectId)}/analyze-reference`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
                }),
                api(`/projects/${encodeURIComponent(projectId)}/analyze-hook`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
                })
            ]);
            const data = await api(`/projects/${encodeURIComponent(projectId)}`);
            activeProject = data.project;
            renderWorkspace(activeProject);
            showAlert('✓ Đã phân tích thành công cả 2 video!', 'success');
        } catch (e) {
            // Dù có cảnh báo, vẫn nạp lại dữ liệu mới nhất từ server
            try {
                const data = await api(`/projects/${encodeURIComponent(projectId)}`);
                if (data && data.project) {
                    activeProject = data.project;
                    renderWorkspace(activeProject);
                }
            } catch (_) {}
            if (activeProject && activeProject.status === 'reference_analyzed') {
                showAlert('✓ Phân tích hoàn tất!', 'success');
            } else {
                showAlert('Lỗi phân tích: ' + e.message, 'error');
            }
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<span data-icon="bot" aria-hidden="true"></span> Phân tích cả 2 video'; }
        }
    }

    async function doGenerateTimeline(projectId, btn) {
        btn.disabled = true; btn.textContent = 'Đang sinh Production Timeline…';
        showAlert('⏳ LLM đang đọc Reference Analysis + Media Description Index để sinh kịch bản dựng phim...', 'info');
        try {
            const hookType = ($('v2v-hook-type-select') && $('v2v-hook-type-select').value) || 'auto';
            const selectedVoice = ($('v2v-voice-select') && $('v2v-voice-select').value) || 'vi-VN-HoaiMyNeural';
            const data = await api(`/projects/${encodeURIComponent(projectId)}/generate-timeline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hookType, voice: selectedVoice })
            });
            activeProject = data.project;
            renderWorkspace(activeProject);
            showAlert('✓ Đã tạo kịch bản Production Timeline thành công. Hãy xem xét và chỉnh sửa nếu cần.', 'success');
        } catch (e) {
            showAlert('Lỗi sinh kịch bản: ' + e.message, 'error');
        } finally {
            btn.disabled = false; btn.innerHTML = '<span data-icon="sparkles" aria-hidden="true"></span> Sinh kịch bản Production Timeline (§7)';
        }
    }

    async function doApproveAndAssemble(projectId, btn) {
        btn.disabled = true; btn.textContent = 'Đang lưu & validate…';
        showAlert('⏳ Đang lưu kịch bản và chạy kiểm tra tính hợp lệ của footage...', 'info');
        try {
            // 1. Lưu timeline từ bảng
            const timeline = collectTimelineFromTable();
            await api(`/projects/${encodeURIComponent(projectId)}/timeline`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timeline })
            });

            // 2. Chuyển sang review approve
            await api(`/projects/${encodeURIComponent(projectId)}/review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'approve' })
            });

            // 3. Validate
            const valRes = await api(`/projects/${encodeURIComponent(projectId)}/validate`, { method: 'POST' });
            if (!valRes.valid) throw new Error('Dữ liệu kịch bản không hợp lệ.');

            // 4. Assemble
            showAlert('✓ Kịch bản hợp lệ! Đang bắt đầu ghép video bằng FFmpeg và sinh giọng nói Edge TTS...', 'info');
            const selectedVoice = ($('v2v-voice-select') && $('v2v-voice-select').value) || 'vi-VN-HoaiMyNeural';
            const assRes = await api(`/projects/${encodeURIComponent(projectId)}/assemble`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voice: selectedVoice })
            });
            activeProject = assRes.project;
            renderWorkspace(activeProject);
            showAlert('🎉 Dựng video hoàn tất! Hãy xem trước và duyệt video cuối.', 'success');
        } catch (e) {
            showAlert('Lỗi quy trình dựng: ' + e.message, 'error');
            await selectProject(projectId);
        } finally {
            btn.disabled = false; btn.textContent = '✅ Phê duyệt kịch bản & Validate (§8-9)';
        }
    }

    async function doBatchApproveAndAssemble(projectId, btn) {
        if (btn) { btn.disabled = true; btn.textContent = 'Đang duyệt & validate…'; }
        showAlert('⏳ Đang phê duyệt toàn bộ 10 kịch bản biến thể...', 'info');
        try {
            // 1. Duyệt tất cả kịch bản biến thể
            await api(`/projects/${encodeURIComponent(projectId)}/batch-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'approve_all' })
            });

            // 2. Validate
            const valRes = await api(`/projects/${encodeURIComponent(projectId)}/validate`, { method: 'POST' });
            if (!valRes.valid) throw new Error('Dữ liệu kịch bản không hợp lệ.');

            // 3. Assemble full tải 10 video FFmpeg cùng lúc
            showAlert('⚡ Đang khởi động 10 luồng FFmpeg render song song full tải...', 'info');
            const selectedVoice = ($('v2v-voice-select') && $('v2v-voice-select').value) || 'vi-VN-HoaiMyNeural';
            
            // Chuyển sang step 5 để user thấy 10 progress stream cards
            showStepPanels(5);
            startRenderProgressPolling(projectId);

            const assRes = await api(`/projects/${encodeURIComponent(projectId)}/assemble`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voice: selectedVoice })
            });
            stopRenderProgressPolling();
            activeProject = assRes.project;
            renderWorkspace(activeProject);
            showAlert('🎉 Dựng xong toàn bộ 10 video hoàn chỉnh! Mời xem gallery và tải trọn bộ ZIP.', 'success');
        } catch (e) {
            stopRenderProgressPolling();
            showAlert('Lỗi quy trình dựng: ' + e.message, 'error');
            await selectProject(projectId);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<span data-icon="rocket" aria-hidden="true"></span> Phê duyệt trọn bộ 10 kịch bản & Render song song FFmpeg (§8-11)'; }
        }
    }

    async function doAssemble(projectId, btn) {
        btn.disabled = true; btn.textContent = 'Đang dựng FFmpeg tối ưu…';
        showAlert('⚡ Đang điều phối các luồng FFmpeg render (cắt ghép, phụ đề tiếng Việt, khử trùng pHash)...', 'info');
        try {
            showStepPanels(5);
            startRenderProgressPolling(projectId);
            const selectedVoice = ($('v2v-voice-select') && $('v2v-voice-select').value) || 'vi-VN-HoaiMyNeural';
            const assRes = await api(`/projects/${encodeURIComponent(projectId)}/assemble`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voice: selectedVoice })
            });
            stopRenderProgressPolling();
            activeProject = assRes.project;
            renderWorkspace(activeProject);
            showAlert('🎉 Dựng xong 10 video hoàn tất! Mời duyệt và tải trọn bộ.', 'success');
        } catch (e) {
            stopRenderProgressPolling();
            showAlert('Lỗi khi dựng video: ' + e.message, 'error');
        } finally {
            btn.disabled = false; btn.innerHTML = '<span data-icon="zap" aria-hidden="true"></span> Dựng song song 10 video FFmpeg (Full tải) (§10-11)';
        }
    }

    async function doFinalReview(projectId, action, btn) {
        btn.disabled = true;
        try {
            const res = await api(`/projects/${encodeURIComponent(projectId)}/final-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            activeProject = res.project;
            
            if (action === 'approve') {
                // Auto-download ZIP khi duyệt hoàn tất
                window.location.href = API + '/projects/' + encodeURIComponent(projectId) + '/download-zip';
                showAlert('🎉 Dự án đã được duyệt xuất bản thành công! Đang tải ZIP…', 'success');
                // Ẩn workspace, reset về trạng thái tạo project mới
                setTimeout(() => {
                    activeProject = null;
                    const sel = $('v2v-project-select');
                    if (sel) sel.value = '';
                    const selectLabel = $('v2v-project-select-label');
                    if (selectLabel) selectLabel.textContent = '-- Chọn dự án để xem lại --';
                    $('v2v-active-workspace').hidden = true;
                    $('v2v-no-project').hidden = false;
                    loadProjects(false);
                }, 1500);
            } else {
                renderWorkspace(activeProject);
                showAlert('Đã đưa dự án về trạng thái chỉnh sửa kịch bản.', 'success');
            }
        } catch (e) {
            showAlert('Lỗi: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
        }
    }

    // ── Render Subpanels ──────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    // BƯỚC 1 — CHỌN LẠI VIDEO ĐỐI THỦ / HOOK TỪ KHO (đợt B)
    // Hiện lưới ảnh bìa các clip thuộc nhóm tương ứng; bấm 1 clip là gán cho project.
    // ══════════════════════════════════════════════════════════════════════
    let khoPickerBusy = false;

    function renderKhoPicker(kind) {
        const box = $(kind === 'hook' ? 'v2v-step1-hook-picker' : 'v2v-step1-ref-picker');
        if (!box) return;

        const p = activeProject;
        const currentId = p ? (kind === 'hook' ? p.hookAssetId : p.referenceAssetId) : null;
        const currentPath = p ? (kind === 'hook' ? p.hookVideoPath : p.referenceVideoPath) : null;

        const list = (loadedAssets || []).filter(a => normalizeCat(a.category) === kind);
        if (list.length === 0) {
            box.innerHTML = `<p class="v2v-kho-picker-empty">Kho chưa có clip nào thuộc nhóm này. Hãy tải video lên và chọn đúng nhóm ở phần Thư viện nguồn.</p>`;
            return;
        }

        // Clip hook: xếp theo điểm đánh giá giảm dần để clip tốt nhất nằm đầu.
        if (kind === 'hook') {
            list.sort((a, b) => (Number(b.hookScore) || 0) - (Number(a.hookScore) || 0));
        }

        box.innerHTML = list.slice(0, 60).map(a => {
            const isActive = (currentId && a.asset_id === currentId) || (currentPath && a.path === currentPath);
            const score = Number(a.hookScore) || Number(a.overallScore) || 0;
            const badge = (kind === 'hook' && score) ? `<span class="v2v-kho-badge">${score}/10${a.hookType ? " · " + esc(HOOK_TYPE_LABELS[a.hookType] || a.hookType) : ""}</span>` : '';
            return `<button type="button" class="v2v-kho-card${isActive ? ' is-active' : ''}" data-pick-asset="${esc(a.asset_id)}" title="${esc(a.filename || '')}">
                <img loading="lazy" src="${API}/library/thumb/${encodeURIComponent(a.asset_id)}" alt="" />
                <span class="v2v-kho-card-name">${esc(a.filename || a.asset_id)}</span>
                <span class="v2v-kho-card-meta">${fmtDur(a.duration)}${badge}</span>
            </button>`;
        }).join('');

        box.querySelectorAll('[data-pick-asset]').forEach(card => {
            card.addEventListener('click', () => pickKhoAsset(kind, card.dataset.pickAsset));
        });
    }

    async function pickKhoAsset(kind, assetId) {
        if (!activeProject || khoPickerBusy) return;
        const status = $('v2v-step1-save-status');
        khoPickerBusy = true;
        try {
            if (status) status.textContent = 'Đang gán clip từ kho…';
            const fd = new FormData();
            fd.append(kind === 'hook' ? 'hookAssetId' : 'refAssetId', assetId);
            const res = await fetch(API + '/projects/' + encodeURIComponent(activeProject.id) + '/inputs',
                { method: 'POST', body: fd });
            let data = null;
            try { data = await res.json(); } catch (_) {}
            if (!res.ok) throw new Error((data && (data.error || data.code)) || ('HTTP ' + res.status));
            activeProject = data.project;
            if (status) status.textContent = 'Đã gán clip từ kho.';
            renderStep1Inputs(activeProject);
            renderKhoPicker('reference');
            renderKhoPicker('hook');
        } catch (e) {
            if (status) status.textContent = 'Lỗi: ' + e.message;
        } finally {
            khoPickerBusy = false;
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // BƯỚC 2 — BẢNG CHẤM ĐIỂM 7 TIÊU CHÍ (đợt A)
    // ══════════════════════════════════════════════════════════════════════
    function scoreColor(n) {
        if (n >= 8) return '#22c55e';
        if (n >= 6) return '#eab308';
        if (n >= 4) return '#f97316';
        return '#ef4444';
    }

    function renderScorecard(analysis) {
        const panel = $('v2v-scorecard-panel');
        const box = $('v2v-scorecard');
        if (!panel || !box) return;

        const ana = analysis || {};
        const criteriaScores = ana.criteria_scores || ana.criteriaScores || {};
        const hookAna = ana.hook_analysis || {};
        const overall = Number(ana.overall_score_1_10) || null;
        const keys = Object.keys(CRITERIA_LABELS).filter(k => Number(criteriaScores[k]) > 0);

        if (!overall && keys.length === 0) {
            panel.hidden = true;
            delete panel.dataset.hasData;
            return;
        }
        panel.dataset.hasData = '1';

        let html = `<div class="v2v-score-head">
            ${overall ? '<div class="v2v-score-overall" style="--sc:' + scoreColor(overall) + '"><b>' + overall + '</b><span>/10</span><small>Điểm tổng</small></div>' : ''}
            ${hookAna.type ? '<div class="v2v-score-hooktype"><small>Loại hook</small><b>' + esc(HOOK_TYPE_LABELS[hookAna.type] || hookAna.type) + '</b></div>' : ''}
            ${hookAna.first_3s ? '<div class="v2v-score-first3s"><small>3 giây đầu</small><p>' + esc(hookAna.first_3s) + '</p></div>' : ''}
        </div>`;
        html += keys.map(k => { const v = Number(criteriaScores[k]); return `<div class="v2v-score-row">
                <span class="v2v-score-label">${esc(CRITERIA_LABELS[k])}</span>
                <span class="v2v-score-track"><i style="width:${v * 10}%;background:${scoreColor(v)}"></i></span>
                <span class="v2v-score-num" style="color:${scoreColor(v)}">${v}</span>
            </div>`; }).join('');
        html += [['strengths','Điểm mạnh','#22c55e'],['weaknesses','Điểm yếu','#ef4444'],['improvements','Nên sửa','#38bdf8']].map(([key, title, color]) => { const arr = Array.isArray(ana[key]) ? ana[key] : []; if (!arr.length) return ''; return `<div class="v2v-score-list"><h5 style="color:${color}">${title}</h5><ul>${arr.map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div>`; }).join('');
        box.innerHTML = html;
    }

    function renderRefAnalysis(p) {
        const panel = $('v2v-ref-analysis-panel');
        const tbody = panel ? panel.querySelector('tbody') : null;
        if (!panel || !tbody) return;

        const ana = p.referenceAnalysis;
        if (!ana) { panel.hidden = true; return; }

        panel.dataset.hasData = '1'; // Mark panel has data; visibility controlled by showStepPanels

        // Render Summary & Concept Header Box
        let sumBox = $('v2v-ref-summary-box');
        if (!sumBox) {
            sumBox = document.createElement('div');
            sumBox.id = 'v2v-ref-summary-box';
            sumBox.className = 'v2v-ref-summary-box';
            sumBox.style.cssText = 'margin-bottom:14px;padding:12px 16px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.25);border-radius:8px;font-size:13px;line-height:1.6;color:var(--text-primary, #cbd5e1);';
            const head = panel.querySelector('.v2v-subpanel-head');
            if (head && head.nextSibling) {
                panel.insertBefore(sumBox, head.nextSibling);
            }
        }

        if (sumBox) {
            let sumHtml = '';
            if (ana.purpose || ana.summary) {
                sumHtml += `<div style="margin-bottom:6px;"><strong style="color:var(--color-purple-light);"><span data-icon="target" aria-hidden="true"></span> Mục đích & Ý đồ:</strong> ${esc(ana.purpose || ana.summary)}</div>`;
            }
            if (ana.conclusion) {
                sumHtml += `<div><strong style="color:var(--accent-sky);"><span data-icon="lightbulb" aria-hidden="true"></span> Đánh giá cấu trúc & nhịp điệu:</strong> ${esc(ana.conclusion)}</div>`;
            }
            sumBox.innerHTML = sumHtml;
            sumBox.hidden = !sumHtml;
        }

        let rowsHtml = '';

        if (Array.isArray(ana.segments) && ana.segments.length) {
            rowsHtml = ana.segments.map(s => `<tr>
                <td><b>${esc(s.timeline || s.time || `${s.start || 0}s-${s.end || 0}s`)}</b></td>
                <td><span class="v2v-chip strong">${esc(s.role || s.type || 'Phân đoạn')}</span></td>
                <td>${esc(s.content || s.description || '')}</td>
            </tr>`).join('');
        } else if (Array.isArray(ana.visual_events) && ana.visual_events.length) {
            const total = ana.visual_events.length;
            rowsHtml = ana.visual_events.map((e, idx) => {
                const start = (e.start || 0).toFixed(1);
                const end = (e.end || 0).toFixed(1);

                // Suy luận vai trò kịch bản
                let roleLabel = 'Chi tiết';
                let roleColor = '';
                if (idx === 0) {
                    roleLabel = 'Mở đầu (Hook / Before)';
                    roleColor = 'strong';
                } else if (idx === total - 1) {
                    roleLabel = 'Thành phẩm (Reveal / After)';
                    roleColor = 'strong';
                } else {
                    roleLabel = 'Chuyển cảnh (Transition)';
                }

                // Bóc tách chi tiết hành động thực chất
                let descParts = [];

                if (Array.isArray(e.people) && e.people.length) {
                    const cleanedPeople = e.people.map(person => {
                        let s = String(person).trim();
                        s = s.replace(/\[['"]+/g, '').replace(/['"]+\]/g, '').replace(/\s+/g, ' ');
                        return s.trim();
                    }).filter(Boolean);
                    if (cleanedPeople.length) descParts.push(cleanedPeople.join(' · '));
                } else if (Array.isArray(e.actions) && e.actions.length) {
                    descParts.push(e.actions.join(', '));
                }

                if (e.description && e.description !== e.scene && !descParts.some(p => p.includes(e.description))) {
                    descParts.unshift(e.description);
                }

                if (!descParts.length) {
                    descParts.push(e.scene || 'Phân cảnh quan sát');
                }

                if (Array.isArray(e.objects) && e.objects.length) {
                    descParts.push(`<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;"><span data-icon="search" aria-hidden="true"></span> <em>Đồ vật:</em> ${esc(e.objects.join(', '))}</div>`);
                }

                if (Array.isArray(e.visible_text) && e.visible_text.length) {
                    descParts.push(`<div style="font-size:12px;color:var(--color-indigo-light);margin-top:2px;"><span data-icon="type" aria-hidden="true"></span> <em>Chữ trên video:</em> "${esc(e.visible_text.join(', '))}"</div>`);
                }

                const finalContent = descParts.join('<div style="margin-bottom:4px;"></div>');

                return `<tr>
                    <td style="white-space:nowrap;"><b>${start}s - ${end}s</b></td>
                    <td>
                        <span class="v2v-chip ${roleColor}">${esc(roleLabel)}</span>
                        ${e.scene ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${esc(e.scene)}</div>` : ''}
                    </td>
                    <td style="line-height:1.5;">${finalContent}</td>
                </tr>`;
            }).join('');
        } else if (ana.summary) {
            rowsHtml = `<tr>
                <td><b>Toàn bộ clip</b></td>
                <td><span class="v2v-chip strong">Tổng quan</span></td>
                <td>${esc(ana.summary)}</td>
            </tr>`;
        } else {
            rowsHtml = `<tr><td colspan="3">${esc(JSON.stringify(ana))}</td></tr>`;
        }
        tbody.innerHTML = rowsHtml;
    }

    function renderHookAnalysis(p) {
        const panel = $('v2v-hook-analysis-panel');
        if (!panel) return;
        const ana = p.hookAnalysis;
        if (!ana) { panel.hidden = true; return; }
        panel.dataset.hasData = '1'; // Mark panel has data; visibility controlled by showStepPanels

        let sumBox = $('v2v-hook-summary-box');
        if (sumBox) {
            let sumHtml = '';
            if (ana.purpose || ana.summary) {
                sumHtml += `<div style="margin-bottom:6px;"><strong style="color:var(--color-warning);"><span data-icon="fish" aria-hidden="true"></span> Chiến lược Hook:</strong> ${esc(ana.purpose || ana.summary)}</div>`;
            }
            if (ana.conclusion) {
                sumHtml += `<div><strong style="color:var(--accent-sky);"><span data-icon="lightbulb" aria-hidden="true"></span> Nhịp điệu hook:</strong> ${esc(ana.conclusion)}</div>`;
            }
            sumBox.innerHTML = sumHtml || '<em style="color:var(--text-muted);">Không có tóm tắt.</em>';
            sumBox.style.cssText = 'margin-bottom:14px;padding:12px 16px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;font-size:13px;line-height:1.6;color:var(--text-primary, #cbd5e1);';
        }

        const tbody = panel.querySelector('tbody');
        if (!tbody) return;
        const events = ana.visual_events || ana.events || ana.segments || [];
        if (events.length) {
            tbody.innerHTML = events.map(ev => {
                const start = Number(ev.start ?? ev.timestamp ?? 0);
                const end = Number(ev.end ?? (start + 1));
                const timeLabel = `${start.toFixed(1)}s - ${end.toFixed(1)}s`;
                const scene = ev.scene || ev.label || '—';
                const desc = ev.description || ev.action || ev.visual || '—';
                return `<tr>
                    <td>${esc(timeLabel)}</td>
                    <td><span class="v2v-chip strong">${esc(scene)}</span></td>
                    <td style="line-height:1.5;">${esc(desc)}</td>
                </tr>`;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px;">Chưa có dữ liệu phân tích hook.</td></tr>`;
        }
    }

    function renderTimelinePanel(p) {
        const panel = $('v2v-timeline-panel');
        const tbody = $('v2v-timeline-tbody');
        const summaryEl = $('v2v-timeline-summary');
        if (!panel || !tbody) return;

        // Đổi project thì quay về biến thể đầu, đừng giữ chỉ số của project trước.
        if (p.id !== _variantProjectId) {
            _variantProjectId = p.id;
            activeVariantIndex = 0;
        }

        const batches = Array.isArray(p.batchTimelines) ? p.batchTimelines : [];
        if (batches.length > 0 && (activeVariantIndex < 0 || activeVariantIndex >= batches.length)) {
            activeVariantIndex = 0;
        }

        const variantEl = $('v2v-timeline-variant');
        if (variantEl) {
            if (batches.length > 0) {
                const cur = batches[activeVariantIndex] || {};
                const vNum = cur.index || (activeVariantIndex + 1);
                const ang = (cur.angle && typeof cur.angle === 'object')
                    ? (cur.angle.name || cur.angle.title || cur.angle.id || '')
                    : (cur.angle || '');
                variantEl.textContent = `Đang sửa: Video #${vNum}${ang ? ' — ' + ang : ''} (${batches.length} biến thể)`;
            } else {
                variantEl.textContent = '';
            }
        }

        // Có biến thể thì bảng sửa LUÔN là biến thể đang chọn; chưa có thì dùng đường cũ.
        const tl = batches.length > 0
            ? ((batches[activeVariantIndex] && batches[activeVariantIndex].segments) || [])
            : p.productionTimeline;
        if (!tl || !Array.isArray(tl) || !tl.length) {
            // Nếu chưa có timeline nhưng đã phân tích đối thủ, ẩn panel
            panel.hidden = true;
            return;
        }

        panel.dataset.hasData = '1'; // Mark panel has data; visibility controlled by showStepPanels
        const totalDur = tl.reduce((sum, s) => sum + Math.max(0, (Number(s.sourceOut) || 0) - (Number(s.sourceIn) || 0)), 0);
        if (summaryEl) summaryEl.textContent = `${tl.length} phân đoạn · Tổng thời lượng dự kiến: ${totalDur.toFixed(1)}s`;

        const voiceSelect = $('v2v-voice-select');
        if (voiceSelect && p.voice) voiceSelect.value = p.voice;

        tbody.innerHTML = tl.map((seg, idx) => {
            const inSec = Number(seg.sourceIn) || 0;
            const outSec = Number(seg.sourceOut) || (inSec + 3);
            const dur = Math.max(0, outSec - inSec).toFixed(1);

            return `
            <tr data-order="${idx + 1}">
                <td><strong>#${seg.order || (idx + 1)}</strong></td>
                <td>
                    <select class="v2v-cell-select v2v-tl-asset">
                        ${loadedAssets.map(a => `<option value="${esc(a.asset_id)}" ${a.asset_id === seg.sourceAssetId ? 'selected' : ''}>${esc(a.filename)} (${fmtDur(a.duration)})</option>`).join('')}
                    </select>
                </td>
                <td>
                    <input type="number" step="0.1" min="0" class="v2v-cell-input v2v-tl-in" value="${inSec}" onchange="this.closest('tr').querySelector('.v2v-tl-dur').textContent = (Math.max(0, this.closest('tr').querySelector('.v2v-tl-out').value - this.value)).toFixed(1) + 's'" />
                </td>
                <td>
                    <input type="number" step="0.1" min="0" class="v2v-cell-input v2v-tl-out" value="${outSec}" onchange="this.closest('tr').querySelector('.v2v-tl-dur').textContent = (Math.max(0, this.value - this.closest('tr').querySelector('.v2v-tl-in').value)).toFixed(1) + 's'" />
                </td>
                <td><span class="v2v-tl-dur">${dur}s</span></td>
                <td>
                    <input type="text" class="v2v-cell-input v2v-tl-text" value="${esc(seg.text || '')}" placeholder="Chữ hiển thị trên video..." />
                </td>
                <td>
                    <input type="text" class="v2v-cell-input v2v-tl-voice" value="${esc(seg.voice || '')}" placeholder="Lời thoại thuyết minh AI..." />
                </td>
                <td>
                    <input type="text" class="v2v-cell-input v2v-tl-trans" value="${esc(seg.transition || 'cut')}" placeholder="cut / fade" />
                </td>
                <td>
                    <button class="v2v-link-btn" onclick="this.closest('tr').remove();" title="Xoá phân đoạn này">✕</button>
                </td>
            </tr>`;
        }).join('');

        if (!tbody.dataset.syncBound) {
            tbody.dataset.syncBound = '1';
            tbody.addEventListener('input', (e) => {
                if (e.target.classList.contains('v2v-tl-voice')) {
                    const tr = e.target.closest('tr');
                    const textInput = tr ? tr.querySelector('.v2v-tl-text') : null;
                    if (textInput) {
                        textInput.value = e.target.value.replace(/[.!?]+$/, '').trim().toUpperCase();
                    }
                }
            });
        }
    }

    function collectTimelineFromTable() {
        const rows = document.querySelectorAll('#v2v-timeline-tbody tr');
        const list = [];
        rows.forEach((r, idx) => {
            const assetSelect = r.querySelector('.v2v-tl-asset');
            const inInput = r.querySelector('.v2v-tl-in');
            const outInput = r.querySelector('.v2v-tl-out');
            const textInput = r.querySelector('.v2v-tl-text');
            const voiceInput = r.querySelector('.v2v-tl-voice');
            const transInput = r.querySelector('.v2v-tl-trans');

            const voiceVal = voiceInput ? voiceInput.value.trim() : '';
            const textVal = (textInput && textInput.value.trim()) ? textInput.value.trim() : (voiceVal ? voiceVal.replace(/[.!?]+$/, '').trim().toUpperCase() : '');

            list.push({
                order: idx + 1,
                sourceAssetId: assetSelect ? assetSelect.value : '',
                sourceIn: inInput ? Number(inInput.value) : 0,
                sourceOut: outInput ? Number(outInput.value) : 0,
                text: textVal,
                voice: voiceVal,
                transition: transInput ? transInput.value : 'cut'
            });
        });
        return list;
    }

    function renderPreflight(p) {
        const panel = $('v2v-preflight-panel');
        const container = $('v2v-preflight-content');
        if (!panel || !container) return;

        const pf = p.preflightStatus;
        if (!pf) {
            panel.hidden = true;
            return;
        }

        panel.dataset.hasData = '1';
        const isPass = !!pf.canProceed;
        const overlap = Math.round(Number(pf.overlapScore || 0) * 100);
        const matched = pf.matchedAssetsCount || 0;
        const total = pf.totalAssetsCount || loadedAssets.length || 0;
        const keywords = Array.isArray(pf.matchedKeywords) ? pf.matchedKeywords : [];

        container.innerHTML = `
            <div class="v2v-preflight-box">
                <div class="v2v-preflight-header">
                    <div>
                        <strong style="color:var(--text-primary);font-size:0.95rem;">Độ tương thích với kho tài nguyên</strong>
                        <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;">
                            ${isPass ? 'Kho video đáp ứng yêu cầu sinh kịch bản biến thể tổ hợp.' : esc(pf.reason || 'Kho không đủ footage tương thích.')}
                        </div>
                    </div>
                    <span class="v2v-gate-badge ${isPass ? 'pass' : 'fail'}">${isPass ? '✓ Đạt chuẩn Fast Gate' : '⚠️ Cảnh báo thiếu footage'}</span>
                </div>
                <div class="v2v-preflight-metrics">
                    <div class="v2v-metric-card">
                        <div class="v2v-metric-label">Độ tương thích ngữ nghĩa</div>
                        <div class="v2v-metric-val" style="color:${overlap >= 50 ? 'var(--color-success-light)' : 'var(--color-danger-light)'};">${overlap}%</div>
                    </div>
                    <div class="v2v-metric-card">
                        <div class="v2v-metric-label">Clip khớp trong kho</div>
                        <div class="v2v-metric-val">${matched} / ${total}</div>
                    </div>
                    <div class="v2v-metric-card">
                        <div class="v2v-metric-label">Số kịch bản dự kiến</div>
                        <div class="v2v-metric-val" style="color:var(--color-purple-light);">${p.requestedOutputs || 10} video</div>
                    </div>
                </div>
                ${keywords.length ? `
                    <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:6px;">
                        <strong>Từ khoá ngữ nghĩa nhận diện:</strong>
                        <div class="v2v-keyword-chips">
                            ${keywords.map(kw => `<span class="v2v-chip strong">${esc(kw)}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    function renderBatchMatrix(p) {
        const panel = $('v2v-batch-matrix-panel');
        const summaryBox = $('v2v-batch-summary-box');
        const grid = $('v2v-batch-matrix-grid');
        if (!panel || !grid) return;

        const batches = p.batchTimelines;
        if (!batches || !Array.isArray(batches) || !batches.length) {
            panel.hidden = true;
            return;
        }

        // Đổi project / số biến thể ít hơn chỉ số đang giữ -> đưa về biến thể đầu NGAY Ở ĐÂY.
        // renderBatchMatrix chạy TRƯỚC renderTimelinePanel, nếu chỉ kẹp ở panel thì lượt render
        // này không card nào được đánh dấu "đang sửa".
        if (p.id !== _variantProjectId || activeVariantIndex < 0 || activeVariantIndex >= batches.length) {
            activeVariantIndex = 0;
        }

        panel.dataset.hasData = '1';
        const validCount = batches.filter(b => b.isValid !== false).length;
        const totalCount = batches.length;

        if (summaryBox) {
            summaryBox.innerHTML = `
                <div style="padding:10px 14px;background:var(--overlay-blue-10);border:1px solid var(--overlay-blue-25);border-radius:8px;font-size:13px;color:var(--text-tertiary);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <strong style="color:var(--color-blue-light);"><span data-icon="bar-chart-3" aria-hidden="true"></span> Ma Trận Đa Dạng Hoá:</strong> Đã lập kế hoạch <strong>${totalCount} biến thể</strong> độc lập (${validCount} đạt chuẩn phủ kho &ge;70%).
                    </div>
                    <div>
                        <span class="v2v-chip strong">Chống trùng lặp pHash & Entropy tối đa</span>
                    </div>
                </div>
            `;
        }

        const approveBtn = $('v2v-batch-approve-btn');
        if (approveBtn) {
            approveBtn.onclick = () => doBatchApproveAndAssemble(p.id, approveBtn);
        }

        grid.innerHTML = batches.map((tl, idx) => {
            const vNum = tl.index || (idx + 1);
            const isValid = tl.isValid !== false;
            const covRate = Math.round(Number(tl.coverageRate || 0));
            const angleName = typeof tl.angle === 'object' && tl.angle ? (tl.angle.name || tl.angle.title || tl.angle.id) : (tl.angle || `Biến thể #${vNum}`);
            const angleFocus = typeof tl.angle === 'object' && tl.angle && tl.angle.focus ? tl.angle.focus : '';
            const note = tl.directorNote || {};
            const hookStrategy = note.hookAngle || note.hook_strategy || '';
            const bridge = note.hookToBodyBridge || note.bridge_to_body || '';
            const rationale = note.assetRationale || note.rationale || '';
            const segs = tl.segments || [];
            const dur = segs.reduce((s, seg) => s + Math.max(0, (Number(seg.sourceOut) || 0) - (Number(seg.sourceIn) || 0)), 0);

            const editing = (idx === activeVariantIndex);

            return `
            <div class="v2v-batch-card ${isValid ? '' : 'invalid'}${editing ? ' is-editing' : ''}"
                 data-variant-idx="${idx}" role="button" tabindex="0"
                 aria-pressed="${editing ? 'true' : 'false'}"
                 title="Bấm để nạp kịch bản này lên bảng sửa phía trên">
                <div class="v2v-batch-card-header">
                    <div>
                        <span class="v2v-batch-title">Video #${vNum}</span>
                        <div class="v2v-batch-angle"><span data-icon="target" aria-hidden="true"></span> ${esc(angleName)}</div>
                        ${angleFocus ? `<div style="font-size:0.72rem;color:var(--text-secondary);margin-top:2px;">${esc(angleFocus)}</div>` : ''}
                    </div>
                    <span class="v2v-chip ${isValid ? 'strong' : ''}" style="border-color:${isValid ? 'var(--color-green)' : 'var(--color-danger-light)'};color:${isValid ? 'var(--color-success-light)' : 'var(--color-danger-light)'};">
                        ${isValid ? `✓ Khớp kho ${covRate}%` : `⚠️ Khớp ${covRate}% (<70%)`}
                    </span>
                </div>

                ${(hookStrategy || bridge || rationale) ? `
                    <div class="v2v-director-note">
                        ${hookStrategy ? `<div><strong><span data-icon="fish" aria-hidden="true"></span> Hook:</strong> ${esc(hookStrategy)}</div>` : ''}
                        ${bridge ? `<div><strong><span data-icon="flag" aria-hidden="true"></span> Thân bài:</strong> ${esc(bridge)}</div>` : ''}
                        ${rationale ? `<div style="font-size:0.72rem;color:var(--color-purple-light);margin-top:2px;"><em><span data-icon="lightbulb" aria-hidden="true"></span> ${esc(rationale)}</em></div>` : ''}
                    </div>
                ` : ''}

                <div style="display:flex;justify-content:space-between;font-size:0.74rem;color:var(--text-secondary);">
                    <span>${segs.length} phân đoạn</span>
                    <span>Thời lượng dự kiến: ~${dur.toFixed(1)}s</span>
                </div>

                <div class="v2v-batch-seg-list">
                    ${segs.map((seg, sIdx) => {
                        const asset = loadedAssets.find(a => a.asset_id === seg.sourceAssetId);
                        const assetName = asset ? asset.filename : (seg.sourceAssetId || 'Clip');
                        const segDur = Math.max(0, (Number(seg.sourceOut) || 0) - (Number(seg.sourceIn) || 0)).toFixed(1);
                        return `
                            <div class="v2v-batch-seg-item" title="${esc(seg.text || seg.voice || '')}">
                                <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">
                                    <span style="font-weight:600;color:var(--color-blue-light);">#${sIdx + 1}</span>
                                    <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${esc(assetName)}</span>
                                </div>
                                <span class="v2v-chip" style="font-size:0.7rem;padding:1px 6px;">${segDur}s</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            `;
        }).join('');

        // Bấm (hoặc Enter/Space) vào card -> nạp kịch bản đó lên bảng sửa.
        // Gắn một lần trên grid, không gắn từng card, để render lại không nhân listener.
        if (!grid.dataset.pickBound) {
            grid.dataset.pickBound = '1';

            const pick = (el) => {
                const idx = Number(el && el.dataset ? el.dataset.variantIdx : NaN);
                if (!Number.isInteger(idx)) return;
                activeVariantIndex = idx;
                if (activeProject) {
                    renderTimelinePanel(activeProject);
                    renderBatchMatrix(activeProject);   // cập nhật dấu card đang sửa
                }
                const panel = $('v2v-timeline-panel');
                if (panel && !panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            };

            grid.addEventListener('click', (e) => {
                const card = e.target.closest('.v2v-batch-card[data-variant-idx]');
                if (card) pick(card);
            });
            grid.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const card = e.target.closest('.v2v-batch-card[data-variant-idx]');
                if (!card) return;
                e.preventDefault();   // Space không được cuộn trang
                pick(card);
            });
        }
    }

    let _renderProgressTimer = null;

    // Template 1 card tiến độ render (dùng chung cho dựng sẵn lẫn tạo động khi thiếu).
    function streamCardHTML(vNum, angle) {
        // angle có thể là object {id,name,focus} → lấy tên hiển thị, tránh in "[object Object]".
        if (angle && typeof angle === 'object') angle = angle.name || angle.focus || angle.id || '';
        return `
            <div class="v2v-stream-card" data-video-num="${vNum}">
                <div class="v2v-stream-head">
                    <span style="color:var(--text-primary);font-weight:600;"><span data-icon="film" aria-hidden="true"></span> Video #${vNum}</span>
                    <span class="v2v-stream-status" style="color:var(--accent-sky);font-size:0.75rem;"><span data-icon="zap" aria-hidden="true"></span> Khởi tạo...</span>
                </div>
                <div style="font-size:0.76rem;color:var(--color-purple-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${esc(angle || ('Luồng render #' + vNum))}
                </div>
                <div class="v2v-stream-progress-bar">
                    <div class="v2v-stream-progress-fill" style="width: 5%;"></div>
                </div>
                <div class="v2v-stream-stage">
                    Đang chuẩn bị hàng đợi...
                </div>
                <div class="v2v-stream-steps">
                    <span class="v2v-chip" style="font-size:0.68rem;padding:1px 6px;">1. Strip raw audio</span>
                    <span class="v2v-chip" style="font-size:0.68rem;padding:1px 6px;">2. Triple mix 3 luồng</span>
                    <span class="v2v-chip" style="font-size:0.68rem;padding:1px 6px;">3. Head Randomizer pHash</span>
                </div>
            </div>`;
    }

    // Card trạng thái SAU KHI dựng xong — để user quay lại step 5 vẫn xem được kết quả từng luồng.
    function streamCardDoneHTML(vNum, angle, rv) {
        if (angle && typeof angle === 'object') angle = angle.name || angle.focus || angle.id || '';
        const ok = !!(rv && rv.success);
        const color = ok ? 'var(--accent-emerald, #34d399)' : 'var(--accent-rose, #fb7185)';
        const label = ok ? 'Hoàn tất' : 'Lỗi dựng';
        const stage = ok
            ? (rv.fileName || `final_${vNum}.mp4`)
            : (rv && rv.error ? String(rv.error).slice(0, 120) : 'Không dựng được video này');
        return `
            <div class="v2v-stream-card" data-video-num="${vNum}">
                <div class="v2v-stream-head">
                    <span style="color:var(--text-primary);font-weight:600;"><span data-icon="film" aria-hidden="true"></span> Video #${vNum}</span>
                    <span class="v2v-stream-status" style="color:${color};font-size:0.75rem;">
                        <span data-icon="${ok ? 'check' : 'alert-triangle'}" aria-hidden="true"></span> ${label}
                    </span>
                </div>
                <div style="font-size:0.76rem;color:var(--color-purple-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${esc(angle || ('Luồng render #' + vNum))}
                </div>
                <div class="v2v-stream-progress-bar">
                    <div class="v2v-stream-progress-fill" style="width:100%;background:${color};"></div>
                </div>
                <div class="v2v-stream-stage" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${esc(stage)}
                </div>
            </div>`;
    }

    function stopRenderProgressPolling() {
        if (_renderProgressTimer) {
            clearInterval(_renderProgressTimer);
            _renderProgressTimer = null;
        }
    }

    function startRenderProgressPolling(projectId) {
        stopRenderProgressPolling();
        if (!projectId) return;

        const poll = async () => {
            try {
                const res = await fetch(`${API}/projects/${encodeURIComponent(projectId)}/render-progress`);
                if (!res.ok) return;
                const data = await res.json();
                if (!data || !data.success) return;

                const grid = $('v2v-render-stream-grid');
                if (!grid) return;

                if (data.progress && data.progress.items) {
                    const items = data.progress.items;
                    const itemArr = Object.values(items);
                    let totalPercent = 0;
                    let completedCount = 0;

                    // Đảm bảo panel hiện dù render được kích hoạt từ entry point không dựng grid trước
                    // (fix: trước đây hasData chưa set → panel bị ẩn hoàn toàn, không thấy tiến độ từng item).
                    const panelEl = $('v2v-batch-render-panel');
                    if (panelEl) { panelEl.hidden = false; panelEl.dataset.hasData = '1'; }

                    itemArr.forEach(item => {
                        const vNum = item.index;
                        let card = grid.querySelector(`[data-video-num="${vNum}"]`);
                        const pct = Math.min(100, Math.max(0, item.percent || 0));
                        totalPercent += pct;
                        if (item.status === 'completed' || pct >= 100) completedCount++;

                        // Tạo card động nếu chưa có (grid rỗng vì chưa qua renderBatchRenderPanel).
                        if (!card) {
                            grid.insertAdjacentHTML('beforeend', streamCardHTML(vNum, item.angle || item.title));
                            card = grid.querySelector(`[data-video-num="${vNum}"]`);
                            if (card && window.GTFIcons && typeof window.GTFIcons.hydrate === 'function') {
                                try { window.GTFIcons.hydrate(card); } catch (_) {}
                            }
                        }

                        if (card) {
                            const statusEl = card.querySelector('.v2v-stream-status');
                            const fillEl = card.querySelector('.v2v-stream-progress-fill');
                            const stageEl = card.querySelector('.v2v-stream-stage');

                            if (fillEl) fillEl.style.width = pct + '%';
                            if (stageEl) stageEl.textContent = item.stage || '';

                            if (statusEl) {
                                if (item.status === 'completed') {
                                    statusEl.innerHTML = '<span style="color:var(--accent-green);font-weight:600;"><span data-icon="check" aria-hidden="true"></span> Hoàn tất (100%)</span>';
                                    if (fillEl) {
                                        fillEl.style.width = '100%';
                                        fillEl.style.backgroundColor = 'var(--accent-green)';
                                    }
                                } else if (item.status === 'failed') {
                                    statusEl.innerHTML = '<span style="color:var(--accent-red);font-weight:600;"><span data-icon="alert-circle" aria-hidden="true"></span> Thất bại</span>';
                                } else if (item.status === 'queued') {
                                    // data.queuePosition: 0 = project này đang được dựng, >=1 = còn N project phía trước
                                    const qp = Number(data.queuePosition);
                                    const waitLabel = (Number.isFinite(qp) && qp >= 1)
                                        ? `Đang chờ — trước bạn còn ${qp} project`
                                        : 'Chờ lượt';
                                    statusEl.innerHTML = `<span style="color:var(--text-muted);"><span data-icon="clock" aria-hidden="true"></span> ${waitLabel}</span>`;
                                } else {
                                    statusEl.innerHTML = `<span style="color:var(--accent-sky);font-weight:600;"><span data-icon="zap" aria-hidden="true"></span> ${item.percent || 0}%</span>`;
                                }
                            }
                        }
                    });

                    // Cập nhật thanh tiến độ tổng thể (overall progress bar)
                    const count = itemArr.length || 1;
                    const overallPct = Math.min(100, Math.round(totalPercent / count));
                    const overallFill = $('v2v-render-overall-fill');
                    const overallPctEl = $('v2v-render-overall-pct');
                    const overallTextEl = $('v2v-render-overall-text');
                    const overallCountEl = $('v2v-render-overall-count');

                    if (overallFill) {
                        overallFill.style.width = overallPct + '%';
                        if (overallPct >= 100) {
                            overallFill.style.backgroundColor = 'var(--accent-green)';
                        }
                    }
                    if (overallPctEl) overallPctEl.textContent = overallPct + '%';
                    if (overallCountEl) overallCountEl.textContent = `${completedCount}/${count} video`;
                    if (overallTextEl) {
                        if (overallPct >= 100) {
                            overallTextEl.textContent = 'Đã dựng xong toàn bộ video! Đang chuyển sang Bước 6...';
                        } else {
                            overallTextEl.textContent = `Đang render song song (${completedCount}/${count} video hoàn tất)...`;
                        }
                    }
                }

                // Nếu server báo đã hoàn tất hoặc trạng thái chuyển tiếp, nạp lại dự án
                if (data.status === 'awaiting_final_review' || data.status === 'video_ready' || (data.active === false && data.status !== 'assembling')) {
                    stopRenderProgressPolling();
                    await selectProject(projectId);
                }
            } catch (_) {}
        };

        _renderProgressTimer = setInterval(poll, 1500);
        poll();
    }

    // ── HÀNG ĐỢI DỰNG VIDEO TOÀN HỆ THỐNG ────────────────────────────────────
    // Nhiều nhân viên dùng chung: mỗi lúc chỉ 1 project được dựng, FIFO theo thứ tự bấm.
    let _queueTimer = null;

    function renderQueuePanel(queue) {
        const listEl = $('v2v-queue-list');
        const sumEl = $('v2v-queue-summary');
        const badge = $('v2v-queue-badge');
        const badgeText = $('v2v-queue-badge-text');
        const badgeDot = $('v2v-queue-badge-dot');

        const items = (queue && queue.items) || [];
        const runningCount = items.filter(i => i.state === 'running').length;
        const waitingCount = items.filter(i => i.state === 'waiting').length;

        if (badge && badgeText) {
            if (items.length === 0) {
                badge.hidden = true;
            } else {
                badge.hidden = false;
                badgeText.textContent = `Hàng đợi: ${runningCount} đang dựng · ${waitingCount} chờ`;
                if (badgeDot) badgeDot.className = 'status-dot ' + (runningCount > 0 ? 'green' : 'gray');
            }
        }

        if (sumEl) {
            sumEl.textContent = items.length === 0
                ? 'Không có project nào đang dựng.'
                : `${runningCount} project đang dựng · ${waitingCount} project đang chờ.`;
        }

        if (!listEl) return;
        if (items.length === 0) {
            listEl.innerHTML = '<div class="v2v-queue-empty">Hàng đợi trống — bấm dựng là chạy ngay.</div>';
            return;
        }
        listEl.innerHTML = items.map(it => {
            const running = it.state === 'running';
            const pos = running ? '▶' : String(it.position);
            const videos = it.videos ? ` · ${it.videos} video` : '';
            return `
                <div class="v2v-queue-item ${running ? 'is-running' : ''}">
                    <div class="v2v-queue-pos">${esc(pos)}</div>
                    <div class="v2v-queue-name" title="${esc(it.name)}">${esc(it.name)}${esc(videos)}</div>
                    <div class="v2v-queue-state">${running ? 'Đang dựng' : 'Đang chờ'}</div>
                </div>`;
        }).join('');
        if (window.GTFIcons && window.GTFIcons.hydrate) window.GTFIcons.hydrate(listEl);
    }

    async function pollQueue() {
        try {
            const res = await fetch(API + '/queue');
            const data = await res.json();
            if (data && data.success) renderQueuePanel(data.queue);
        } catch (_) {}
    }

    function startQueuePolling() {
        if (_queueTimer) return;
        _queueTimer = setInterval(pollQueue, 3000);
        pollQueue();
    }

    function renderBatchRenderPanel(p) {
        const panel = $('v2v-batch-render-panel');
        const grid = $('v2v-render-stream-grid');
        if (!panel || !grid) return;

        const isAssembling = p.status === 'assembling';
        const rendered = Array.isArray(p.renderedVideos) ? p.renderedVideos : [];
        // Dựng xong rồi vẫn PHẢI giữ dữ liệu panel: trước đây return sớm ⇒ hasData='0' ⇒ bấm sang
        // step khác rồi quay lại step 5 chỉ thấy trống.
        const hasRenderData = isAssembling || rendered.length > 0;

        if (!hasRenderData) {
            panel.hidden = true;
            panel.dataset.hasData = '0';
            stopRenderProgressPolling();
            return;
        }

        panel.hidden = false;
        panel.dataset.hasData = '1';
        const batches = p.batchTimelines || [];

        const overallFill = $('v2v-render-overall-fill');
        const overallPctEl = $('v2v-render-overall-pct');
        const overallTextEl = $('v2v-render-overall-text');
        const overallCountEl = $('v2v-render-overall-count');

        if (!isAssembling) {
            // ── Snapshot sau khi dựng xong: xem lại kết quả từng luồng, KHÔNG poll nữa ──
            stopRenderProgressPolling();
            const okCount = rendered.filter(r => r.success).length;
            const total = rendered.length;
            if (overallFill) { overallFill.style.width = '100%'; overallFill.style.backgroundColor = ''; }
            if (overallPctEl) overallPctEl.textContent = '100%';
            if (overallTextEl) overallTextEl.textContent = okCount === total
                ? 'Đã dựng xong toàn bộ video.'
                : `Đã dựng xong (${total - okCount} luồng lỗi).`;
            if (overallCountEl) overallCountEl.textContent = `${okCount}/${total} hoàn thành`;

            grid.innerHTML = rendered.map((rv, idx) => {
                const vNum = rv.index || (idx + 1);
                const tl = batches[vNum - 1] || {};
                return streamCardDoneHTML(vNum, tl.angle || tl.title, rv);
            }).join('');
            if (window.GTFIcons && window.GTFIcons.hydrate) window.GTFIcons.hydrate(grid);
            return;
        }

        const count = batches.length || p.requestedOutputs || 10;
        if (overallFill) { overallFill.style.width = '0%'; overallFill.style.backgroundColor = ''; }
        if (overallPctEl) overallPctEl.textContent = '0%';
        if (overallTextEl) overallTextEl.textContent = 'Đang khởi động các luồng FFmpeg...';
        if (overallCountEl) overallCountEl.textContent = `0/${count} hoàn thành`;

        grid.innerHTML = Array.from({ length: count }, (_, idx) => {
            const vNum = idx + 1;
            const tl = batches[idx] || {};
            return streamCardHTML(vNum, tl.angle);
        }).join('');

        startRenderProgressPolling(p.id);
    }

    function renderFinalReviewPanel(p) {
        const panel = $('v2v-final-review-panel');
        if (!panel) return;

        const activeBox = $('v2v-final-active-box');
        const placeholder = $('v2v-final-placeholder');

        panel.hidden = false;

        if (!p || !p.finalVideoPath) {
            if (activeBox) activeBox.style.display = 'none';
            if (placeholder) placeholder.style.display = 'flex';
            return;
        }

        if (placeholder) placeholder.style.display = 'none';
        if (activeBox) activeBox.style.display = 'block';

        panel.dataset.hasData = '1';
        const player = $('v2v-video-player');
        if (player) {
            player.src = `${API}/projects/${encodeURIComponent(p.id)}/video`;
        }

        $('v2v-download-mp4').href = `${API}/projects/${encodeURIComponent(p.id)}/output`;
        const zipBtn = $('v2v-download-all-zip');
        if (zipBtn) {
            zipBtn.href = `${API}/projects/${encodeURIComponent(p.id)}/download-zip`;
        }
        $('v2v-open-storyboard').href = `${API}/projects/${encodeURIComponent(p.id)}/storyboard`;
        $('v2v-download-timeline').href = `${API}/projects/${encodeURIComponent(p.id)}/timeline-json`;
        $('v2v-download-manifest').href = `${API}/projects/${encodeURIComponent(p.id)}/manifest`;

        // Render toàn bộ video thành phẩm trong đợt sản xuất
        const gallery = $('v2v-batch-gallery');
        if (gallery && Array.isArray(p.renderedVideos) && p.renderedVideos.length > 0) {
            gallery.innerHTML = p.renderedVideos.map((vid, idx) => {
                const vNum = vid.index || (idx + 1);
                const tl = (p.batchTimelines && p.batchTimelines[idx]) || {};
                const angle = (typeof tl.angle === 'object' && tl.angle !== null)
                    ? (tl.angle.name || tl.angle.title || tl.angle.label || tl.angle.hook || `Biến thể #${vNum}`)
                    : (tl.angle || `Video #${vNum}`);
                const videoUrl = `${API}/projects/${encodeURIComponent(p.id)}/video?index=${vNum}`;
                const downloadUrl = `${API}/projects/${encodeURIComponent(p.id)}/output?index=${vNum}`;

                return `
                <div class="v2v-gallery-card" data-video-url="${videoUrl}" data-index="${vNum}" data-title="#${vNum} · ${esc(angle)}" style="cursor: pointer;" title="Bấm để xem video này ở khung phát chính">
                    <video controls playsinline class="v2v-player" src="${videoUrl}" preload="metadata"></video>
                    <div class="v2v-gallery-info">
                        <div class="v2v-gallery-title">#${vNum} · ${esc(angle)}</div>
                        <div class="v2v-gallery-meta">Độc lập pHash · Trộn âm 3 luồng</div>
                        <div style="margin-top:4px;display:flex;gap:6px;align-items:center;">
                            <a class="v2v-btn sm primary" href="${downloadUrl}" download="final_${vNum}.mp4" onclick="event.stopPropagation();"><span data-icon="download" aria-hidden="true"></span> Tải video #${vNum}</a>
                            <button type="button" class="v2v-btn sm" onclick="event.stopPropagation(); window.playInMainPlayer && window.playInMainPlayer('${videoUrl}', '#${vNum} · ${esc(angle)}');" title="Xem ở khung chính"><span data-icon="play" aria-hidden="true"></span> Xem</button>
                        </div>
                    </div>
                </div>
                `;
            }).join('');

            // Click vào bất kỳ thẻ card gallery nào cũng chuyển lên khung phát chính
            gallery.querySelectorAll('.v2v-gallery-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('a') || e.target.closest('button')) return;
                    const url = card.dataset.videoUrl;
                    const title = card.dataset.title;
                    if (url) {
                        playInMainPlayer(url, title);
                        gallery.querySelectorAll('.v2v-gallery-card').forEach(c => c.classList.remove('active-playing'));
                        card.classList.add('active-playing');
                    }
                });

                // Ngăn video trong card phát cục bộ, lập tức chuyển lên player chính
                const cardVid = card.querySelector('video');
                if (cardVid) {
                    const handleRedirect = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try { cardVid.pause(); cardVid.currentTime = 0; } catch (_) {}
                        const url = card.dataset.videoUrl;
                        const title = card.dataset.title;
                        if (url) {
                            playInMainPlayer(url, title);
                            gallery.querySelectorAll('.v2v-gallery-card').forEach(c => c.classList.remove('active-playing'));
                            card.classList.add('active-playing');
                        }
                    };
                    cardVid.addEventListener('play', handleRedirect);
                    cardVid.addEventListener('click', handleRedirect);
                }
            });
        } else if (gallery) {
            gallery.innerHTML = '';
        }
    }

    function playInMainPlayer(videoUrl, title) {
        // Tạm dừng toàn bộ video trong gallery để không phát đồng thời
        const gallery = $('v2v-batch-gallery');
        if (gallery) {
            gallery.querySelectorAll('video').forEach(v => {
                try {
                    v.pause();
                    v.currentTime = 0;
                } catch (_) {}
            });
        }

        const player = $('v2v-video-player');
        if (player) {
            player.src = videoUrl;
            player.load();
            player.play().catch(() => {});
            player.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    window.playInMainPlayer = playInMainPlayer;

    // ── DOM Initializer ───────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async () => {
        // Hàng đợi dựng video dùng chung — bật theo dõi ngay khi mở trang
        startQueuePolling();
        const queueBadge = $('v2v-queue-badge');
        if (queueBadge) {
            queueBadge.addEventListener('click', () => {
                const card = $('v2v-queue-card');
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }

        // Media Library buttons
        const scanBtn = $('v2v-scan-btn');
        if (scanBtn) scanBtn.addEventListener('click', () => scan(false));
        // Bấm "Tải video vào kho" -> hiện panel chọn nhóm ngay dưới nút, chọn xong mới mở hộp file.
        const uploadBtn = $('v2v-upload-btn');
        const uploadMenu = $('v2v-upload-menu');

        const closeUploadMenu = () => {
            if (!uploadMenu) return;
            uploadMenu.hidden = true;
            if (uploadBtn) uploadBtn.setAttribute('aria-expanded', 'false');
        };
        const openUploadMenu = () => {
            if (!uploadMenu) return;
            uploadMenu.hidden = false;
            if (uploadBtn) uploadBtn.setAttribute('aria-expanded', 'true');
            const first = uploadMenu.querySelector('.v2v-upload-opt');
            if (first) first.focus();
        };

        if (uploadBtn) {
            uploadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!uploadMenu) { $('v2v-upload-input').click(); return; }
                if (uploadMenu.hidden) openUploadMenu(); else closeUploadMenu();
            });
        }

        if (uploadMenu) {
            uploadMenu.querySelectorAll('.v2v-upload-opt').forEach(opt => {
                opt.addEventListener('click', () => {
                    const cat = opt.dataset.cat || 'material';
                    const sel = $('v2v-upload-category');
                    if (sel) sel.value = cat;          // select ẩn vẫn là nguồn sự thật cho uploadFiles()
                    closeUploadMenu();
                    $('v2v-upload-input').click();
                });
            });
            // Bấm ra ngoài hoặc Esc thì đóng panel.
            document.addEventListener('click', (e) => {
                if (uploadMenu.hidden) return;
                if (!uploadMenu.contains(e.target) && e.target !== uploadBtn) closeUploadMenu();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !uploadMenu.hidden) { closeUploadMenu(); if (uploadBtn) uploadBtn.focus(); }
            });
        }
        const uploadInput = $('v2v-upload-input');
        if (uploadInput) uploadInput.addEventListener('change', uploadFiles);

        // Modal Video & Description listeners
        const modalCloseBtn = $('v2v-modal-close-btn');
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeAssetModal);
        const modalBackdrop = $('v2v-modal-close-backdrop');
        if (modalBackdrop) modalBackdrop.addEventListener('click', closeAssetModal);
        const modalAnalyzeBtn = $('v2v-modal-analyze-btn');
        if (modalAnalyzeBtn) {
            modalAnalyzeBtn.addEventListener('click', () => {
                if (currentModalAssetId) doAnalyzeModalAsset(currentModalAssetId);
            });
        }
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAssetModal();
        });

        // Project actions
        const createProjBtn = $('v2v-create-project');
        if (createProjBtn) createProjBtn.addEventListener('click', createProject);

        const projectSelect = $('v2v-project-select');
        if (projectSelect) projectSelect.addEventListener('change', (e) => selectProject(e.target.value));

        // Custom Project Dropdown actions
        const customSelect = $('v2v-custom-project-select');
        const selectTrigger = $('v2v-project-select-trigger');
        const selectMenu = $('v2v-project-select-menu');

        if (selectTrigger && customSelect) {
            selectTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                customSelect.classList.toggle('open');
                if (customSelect.classList.contains('open')) {
                    const searchInput = $('v2v-project-search-input');
                    if (searchInput) {
                        setTimeout(() => searchInput.focus(), 50);
                    }
                }
            });
        }

        if (selectMenu) {
            selectMenu.addEventListener('click', async (e) => {
                const delBtn = e.target.closest('.v2v-opt-del');
                if (delBtn) {
                    e.stopPropagation();
                    e.preventDefault();
                    const delId = delBtn.dataset.delId;
                    const proj = loadedProjects.find(x => x.id === delId);
                    const projName = proj ? proj.name : delId;
                    if (!confirm(`Bạn có chắc chắn muốn xoá vĩnh viễn dự án "${projName}"?\nThao tác này sẽ xoá toàn bộ kịch bản và video đầu ra liên quan.`)) return;
                    try {
                        await api('/projects/' + encodeURIComponent(delId), { method: 'DELETE' });
                        showAlert(`✓ Đã xoá dự án "${projName}" thành công!`, 'success');
                        if (activeProject && activeProject.id === delId) {
                            activeProject = null;
                        }
                        await loadProjects();
                    } catch (err) {
                        showAlert('Lỗi xoá dự án: ' + err.message, 'error');
                    }
                    return;
                }

                const opt = e.target.closest('.v2v-custom-option');
                if (opt && opt.dataset.id !== undefined) {
                    selectProject(opt.dataset.id);
                    if (customSelect) customSelect.classList.remove('open');
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (customSelect && !e.target.closest('#v2v-custom-project-select')) {
                customSelect.classList.remove('open');
            }
        });

        // Timeline actions
        $('v2v-save-timeline-btn').addEventListener('click', async () => {
            if (!activeProject) return;
            const timeline = collectTimelineFromTable();
            const hasBatch = Array.isArray(activeProject.batchTimelines) && activeProject.batchTimelines.length > 0;
            try {
                const res = await api(`/projects/${encodeURIComponent(activeProject.id)}/timeline`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    // variantIndex: server ghi vào ĐÚNG biến thể này. Thiếu nó thì bản sửa
                    // rơi vào productionTimeline và bị bỏ lúc dựng.
                    body: JSON.stringify({ timeline, variantIndex: activeVariantIndex })
                });
                activeProject = res.project;
                const vNum = hasBatch ? ((activeProject.batchTimelines[activeVariantIndex] || {}).index || (activeVariantIndex + 1)) : null;
                showAlert(vNum ? `✓ Đã lưu kịch bản Video #${vNum}!` : '✓ Đã lưu kịch bản thành công!', 'success');
                renderTimelinePanel(activeProject);
                renderBatchMatrix(activeProject);   // card phải cập nhật số phân đoạn/thời lượng mới
            } catch (e) {
                showAlert('Lỗi lưu kịch bản: ' + e.message, 'error');
            }
        });

        $('v2v-add-segment-btn').addEventListener('click', () => {
            const tbody = $('v2v-timeline-tbody');
            if (!tbody) return;
            const newOrder = tbody.querySelectorAll('tr').length + 1;
            const defaultAsset = loadedAssets.length > 0 ? loadedAssets[0] : { asset_id: '', duration: 5 };

            const tr = document.createElement('tr');
            tr.dataset.order = newOrder;
            tr.innerHTML = `
                <td><strong>#${newOrder}</strong></td>
                <td>
                    <select class="v2v-cell-select v2v-tl-asset">
                        ${loadedAssets.map(a => `<option value="${esc(a.asset_id)}">${esc(a.filename)} (${fmtDur(a.duration)})</option>`).join('')}
                    </select>
                </td>
                <td>
                    <input type="number" step="0.1" min="0" class="v2v-cell-input v2v-tl-in" value="0" onchange="this.closest('tr').querySelector('.v2v-tl-dur').textContent = (Math.max(0, this.closest('tr').querySelector('.v2v-tl-out').value - this.value)).toFixed(1) + 's'" />
                </td>
                <td>
                    <input type="number" step="0.1" min="0" class="v2v-cell-input v2v-tl-out" value="3" onchange="this.closest('tr').querySelector('.v2v-tl-dur').textContent = (Math.max(0, this.value - this.closest('tr').querySelector('.v2v-tl-in').value)).toFixed(1) + 's'" />
                </td>
                <td><span class="v2v-tl-dur">3.0s</span></td>
                <td>
                    <input type="text" class="v2v-cell-input v2v-tl-text" value="" placeholder="Chữ hiển thị trên video..." />
                </td>
                <td>
                    <input type="text" class="v2v-cell-input v2v-tl-voice" value="" placeholder="Lời thoại thuyết minh AI..." />
                </td>
                <td>
                    <input type="text" class="v2v-cell-input v2v-tl-trans" value="cut" placeholder="cut / fade" />
                </td>
                <td>
                    <button class="v2v-link-btn" onclick="this.closest('tr').remove();" title="Xoá phân đoạn này">✕</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // ── Stepper: click để chuyển xem nội dung từng bước ──
        document.querySelectorAll('#v2v-stepper .v2v-step').forEach(stepEl => {
            stepEl.style.cursor = 'pointer';
            stepEl.addEventListener('click', () => {
                if (!activeProject) return;
                const clickedStep = Number(stepEl.dataset.step);
                // Chỉ cho phép xem step đã hoàn thành hoặc step hiện tại
                const statusMeta = STATUS_MAP[activeProject.status] || { step: 1 };
                if (clickedStep > statusMeta.step) return; // chưa tới step này
                showStepPanels(clickedStep);
            });
        });

        // ── Dropzone: kéo thả + click cho video input ──
        document.querySelectorAll('.v2v-dropzone').forEach(dz => {
            const fileInput = dz.querySelector('input[type="file"]');
            if (!fileInput) return;

            const previewEl = dz.querySelector('.v2v-dropzone-preview');
            const clearBtn = dz.querySelector('.v2v-dropzone-clear');

            // Click vào dropzone → mở file picker.
            // Trừ khi bấm vào chính video preview (để xem/tua) hoặc nút gỡ.
            dz.addEventListener('click', (e) => {
                if (e.target === fileInput) return; // tránh loop
                if (previewEl && (e.target === previewEl || previewEl.contains(e.target))) return;
                if (clearBtn && (e.target === clearBtn || clearBtn.contains(e.target))) return;
                fileInput.click();
            });

            // Nút ✕ gỡ video đã chọn
            if (clearBtn) {
                clearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    fileInput.value = '';
                    updateDropzoneState(dz, fileInput);
                });
            }

            // Có metadata → hiện thời lượng · độ phân giải · dung lượng
            if (previewEl) {
                previewEl.addEventListener('loadedmetadata', () => {
                    const metaEl = dz.querySelector('.v2v-dropzone-meta');
                    if (!metaEl) return;
                    const dur = isFinite(previewEl.duration) ? fmtDur(previewEl.duration) : '—';
                    metaEl.textContent = `${dur} · ${previewEl.videoWidth}×${previewEl.videoHeight} · ${fmtSize(dz._v2vFileSize || 0)}`;
                });
            }

            // Khi user chọn file qua picker
            fileInput.addEventListener('change', () => {
                updateDropzoneState(dz, fileInput);
            });

            // Drag & Drop
            dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('v2v-dragover'); });
            dz.addEventListener('dragleave', () => { dz.classList.remove('v2v-dragover'); });
            dz.addEventListener('drop', (e) => {
                e.preventDefault();
                dz.classList.remove('v2v-dragover');
                const file = e.dataTransfer.files && e.dataTransfer.files[0];
                if (file && file.type.startsWith('video/')) {
                    // Gán file vào input bằng DataTransfer
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    fileInput.files = dt.files;
                    updateDropzoneState(dz, fileInput);
                }
            });
        });

        // updateDropzoneState() nằm ở scope ngoài để createProject() dùng chung.

        function initStep1InputEvents() {
            const refDz = $('v2v-step1-ref-dropzone');
            const refFileInp = $('v2v-step1-ref-file');
            const refClearBtn = $('v2v-step1-ref-clear');

            if (refDz && refFileInp) {
                refDz.addEventListener('click', (e) => {
                    if (e.target === refFileInp) return;
                    if (refClearBtn && (e.target === refClearBtn || refClearBtn.contains(e.target))) return;
                    refFileInp.click();
                });
                refFileInp.addEventListener('change', () => {
                    const file = refFileInp.files && refFileInp.files[0];
                    setStep1RefFile(file || null);
                });
                refDz.addEventListener('dragover', (e) => { e.preventDefault(); refDz.classList.add('v2v-dragover'); });
                refDz.addEventListener('dragleave', () => { refDz.classList.remove('v2v-dragover'); });
                refDz.addEventListener('drop', (e) => {
                    e.preventDefault();
                    refDz.classList.remove('v2v-dragover');
                    const file = e.dataTransfer.files && e.dataTransfer.files[0];
                    if (file && file.type.startsWith('video/')) {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        refFileInp.files = dt.files;
                        setStep1RefFile(file);
                    }
                });
            }
            if (refClearBtn && refFileInp) {
                refClearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    refFileInp.value = '';
                    setStep1RefFile(null);
                });
            }

            const hookDz = $('v2v-step1-hook-dropzone');
            const hookFileInp = $('v2v-step1-hook-file');
            const hookClearBtn = $('v2v-step1-hook-clear');
            const removeHookBtn = $('v2v-step1-hook-remove-btn');

            if (hookDz && hookFileInp) {
                hookDz.addEventListener('click', (e) => {
                    if (e.target === hookFileInp) return;
                    if (hookClearBtn && (e.target === hookClearBtn || hookClearBtn.contains(e.target))) return;
                    hookFileInp.click();
                });
                hookFileInp.addEventListener('change', () => {
                    const file = hookFileInp.files && hookFileInp.files[0];
                    setStep1HookFile(file || null);
                });
                hookDz.addEventListener('dragover', (e) => { e.preventDefault(); hookDz.classList.add('v2v-dragover'); });
                hookDz.addEventListener('dragleave', () => { hookDz.classList.remove('v2v-dragover'); });
                hookDz.addEventListener('drop', (e) => {
                    e.preventDefault();
                    hookDz.classList.remove('v2v-dragover');
                    const file = e.dataTransfer.files && e.dataTransfer.files[0];
                    if (file && file.type.startsWith('video/')) {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        hookFileInp.files = dt.files;
                        setStep1HookFile(file);
                    }
                });
            }
            if (hookClearBtn && hookFileInp) {
                hookClearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hookFileInp.value = '';
                    setStep1HookFile(null);
                });
            }
            if (removeHookBtn) {
                removeHookBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!confirm('Bạn có chắc chắn muốn gỡ bỏ Video Hook của dự án này?')) return;
                    step1PendingRemoveHook = true;
                    if (hookFileInp) hookFileInp.value = '';
                    setStep1HookFile(null);
                });
            }

            const saveBtn = $('v2v-step1-save-btn');
            const cancelBtn = $('v2v-step1-cancel-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    if (refFileInp) refFileInp.value = '';
                    if (hookFileInp) hookFileInp.value = '';
                    cleanupStep1Urls();
                    renderInputPanel(activeProject);
                });
            }
            if (saveBtn) {
                saveBtn.addEventListener('click', async () => {
                    if (!activeProject) return;
                    const hasExistingRef = !!activeProject.referenceVideoPath;
                    if (!hasExistingRef && !step1PendingRefFile) {
                        alert('Dự án cần có Video đối thủ. Vui lòng chọn file Video đối thủ trước khi lưu.');
                        return;
                    }
                    saveBtn.disabled = true;
                    saveBtn.textContent = 'Đang lưu video input…';
                    const statusEl = $('v2v-step1-save-status');
                    if (statusEl) statusEl.textContent = '⏳ Đang upload & cập nhật...';

                    try {
                        const fd = new FormData();
                        if (step1PendingRefFile) fd.append('refVideo', step1PendingRefFile);
                        if (step1PendingHookFile) fd.append('hookVideo', step1PendingHookFile);
                        if (step1PendingRemoveHook) fd.append('removeHook', 'true');

                        const res = await fetch(`${API}/projects/${encodeURIComponent(activeProject.id)}/inputs`, {
                            method: 'POST',
                            body: fd
                        });
                        let data = null;
                        try { data = await res.json(); } catch (_) {}
                        if (!res.ok) throw new Error((data && (data.error || data.code)) || ('HTTP ' + res.status));

                        cleanupStep1Urls();
                        if (refFileInp) refFileInp.value = '';
                        if (hookFileInp) hookFileInp.value = '';

                        activeProject = data.project;
                        await loadProjects(data.project.id);
                        await selectProject(data.project.id, 1);
                        showAlert('✓ Đã cập nhật Video Input thành công!', 'success');
                    } catch (err) {
                        showAlert('Lỗi cập nhật video input: ' + err.message, 'error');
                        if (statusEl) statusEl.textContent = '❌ Lỗi: ' + err.message;
                    } finally {
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = '<span data-icon="save" aria-hidden="true"></span> Lưu thay đổi Video Input';
                    }
                });
            }
        }

        // Đồng bộ chiều cao cột phải bằng đúng chiều cao cột trái và giữ scroll bên trong
        function syncWorkspaceColumnsHeight() {
            const leftCol = document.querySelector('.v2v-workspace-left');
            const rightCard = document.querySelector('#v2v-final-review-card');
            if (!leftCol || !rightCard) return;
            if (window.innerWidth <= 1100) {
                rightCard.style.height = '';
                rightCard.style.maxHeight = '';
                return;
            }
            const h = leftCol.offsetHeight;
            if (h > 0) {
                rightCard.style.height = h + 'px';
                rightCard.style.maxHeight = h + 'px';
            }
        }

        if (window.ResizeObserver) {
            const leftColEl = document.querySelector('.v2v-workspace-left');
            if (leftColEl) {
                const ro = new ResizeObserver(() => syncWorkspaceColumnsHeight());
                ro.observe(leftColEl);
            }
        }
        window.addEventListener('resize', syncWorkspaceColumnsHeight);

        // Tự động load dữ liệu khi khởi tạo
        initLibraryPaginationEvents();
        initProjectSearchEvents();
        initStep1InputEvents();
        await scan(true);
        await loadProjects();
        syncWorkspaceColumnsHeight();
    });
})();

