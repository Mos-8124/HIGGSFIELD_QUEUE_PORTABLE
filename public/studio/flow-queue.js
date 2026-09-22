/**
 * public/studio/flow-queue.js — UI Flowq (Google Flow Queue qua Chrome CDP 9334).
 * Gọi API /api/google-flow/* (đường dẫn tương đối — chạy được cả qua LAN IP).
 * Vanilla JS, không phụ thuộc thư viện, không đụng Socket.IO.
 */
(function () {
    'use strict';

    var renderIcon = function (name) { return '<span data-icon="' + name + '" aria-hidden="true"></span>'; };
    var API = '/api/google-flow';

    var VIDEO_MODELS = ['Omni 1.1 Flash', 'Veo 3.1 - Lite', 'Veo 3.1 - Fast', 'Veo 3.1 - Quality', 'Veo 3.1 - Lite [Lower Priority]'];
    var IMAGE_MODELS = ['Nano Banana 2', 'Nano Banana Pro', 'Nano Banana 2 Lite'];
    var VIDEO_RATIOS = ['16:9', '9:16'];
    var IMAGE_RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16'];

    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    };

    async function api(path, opts) {
        var resp = await fetch(API + path, opts);
        var body = null;
        try { body = await resp.json(); } catch (_) {}
        if (!resp.ok) throw new Error((body && body.error) || ('HTTP ' + resp.status));
        return body;
    }

    function showMsg(el, text, ok) {
        el.textContent = text;
        el.className = 'fq-msg ' + (ok ? 'ok' : 'err');
        el.hidden = false;
        clearTimeout(el._t);
        el._t = setTimeout(function () { el.hidden = true; }, 6000);
    }

    // ── Form: mode & model dynamic controls ─────────────────────────────────
    function fillSelect(sel, values, keep) {
        var current = keep ? sel.value : null;
        sel.innerHTML = '';
        values.forEach(function (v) {
            var o = document.createElement('option');
            o.value = v; o.textContent = v;
            sel.appendChild(o);
        });
        if (current && values.indexOf(current) !== -1) sel.value = current;
    }

    var selectedImages = [];
    var selectedVideo = null;

    function isVeoModel(m) {
        return /^Veo\b/i.test(String(m || '').trim());
    }

    function renderImagesPreview() {
        var badge = $('fq-images-badge');
        var placeholder = $('fq-images-placeholder');
        var thumbsEl = $('fq-images-thumbs');
        var clearBtn = $('fq-images-clear');
        var slot = $('fq-slot-images');

        if (badge) badge.textContent = '(' + selectedImages.length + '/3)';
        if (!selectedImages.length) {
            if (placeholder) placeholder.style.display = '';
            if (thumbsEl) { thumbsEl.style.display = 'none'; thumbsEl.innerHTML = ''; }
            if (clearBtn) clearBtn.style.display = 'none';
            if (slot) slot.classList.remove('has-file');
            return;
        }

        if (placeholder) placeholder.style.display = 'none';
        if (thumbsEl) {
            thumbsEl.style.display = 'flex';
            thumbsEl.innerHTML = '';
            selectedImages.forEach(function (f, idx) {
                var item = document.createElement('div');
                item.className = 'fq-thumb-item';
                var img = document.createElement('img');
                img.src = URL.createObjectURL(f);
                img.alt = f.name;
                var rmBtn = document.createElement('button');
                rmBtn.type = 'button';
                rmBtn.className = 'fq-thumb-remove';
                rmBtn.title = 'Xóa ảnh này';
                rmBtn.textContent = '✕';
                rmBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    selectedImages.splice(idx, 1);
                    renderImagesPreview();
                });
                item.appendChild(img);
                item.appendChild(rmBtn);
                thumbsEl.appendChild(item);
            });
        }
        if (clearBtn) clearBtn.style.display = '';
        if (slot) slot.classList.add('has-file');
    }

    function renderVideoPreview() {
        var placeholder = $('fq-video-placeholder');
        var videoEl = $('fq-video-preview-el');
        var clearBtn = $('fq-video-clear');
        var slot = $('fq-slot-video');
        var badge = $('fq-video-badge');
        var mode = $('fq-mode').value;
        var isVeo = isVeoModel($('fq-model').value);

        if (selectedVideo) {
            if (placeholder) placeholder.style.display = 'none';
            if (videoEl) {
                videoEl.style.display = 'block';
                videoEl.src = URL.createObjectURL(selectedVideo);
            }
            if (clearBtn) clearBtn.style.display = '';
            if (slot) slot.classList.add('has-file');
            if (badge) badge.textContent = '(1/1)';
        } else {
            if (videoEl) {
                if (videoEl.src) { URL.revokeObjectURL(videoEl.src); videoEl.removeAttribute('src'); }
                videoEl.style.display = 'none';
            }
            if (placeholder) placeholder.style.display = '';
            if (clearBtn) clearBtn.style.display = 'none';
            if (slot) slot.classList.remove('has-file');
            if (badge) {
                if (mode === 'image') badge.textContent = '(Không nhận video)';
                else if (isVeo) badge.textContent = '(Veo không nhận)';
                else badge.textContent = '(Tối đa 1)';
            }
        }
    }

    function clearSelectedVideo() {
        selectedVideo = null;
        var inp = $('fq-input-video');
        if (inp) inp.value = '';
        renderVideoPreview();
    }

    function updateModelAndInputRules() {
        var mode = $('fq-mode').value;
        var model = $('fq-model').value;
        var inputMode = $('fq-inputmode').value;
        var resWrap = $('fq-resolution-wrap');
        var modelHint = $('fq-model-hint');
        var ingSection = $('fq-ingredients-section');
        var framesSection = $('fq-frames-section');
        var videoSlot = $('fq-slot-video');
        var videoBadge = $('fq-video-badge');
        var videoPlaceholder = $('fq-video-placeholder');
        var videoHint = $('fq-video-hint');

        if (mode === 'video') {
            // Resolution: chỉ Omni 1.1 Flash mới có tùy chọn 360p/720p
            if (model === 'Omni 1.1 Flash' || !isVeoModel(model)) {
                resWrap.style.display = '';
            } else {
                resWrap.style.display = 'none';
            }

            // Input Mode: Frames vs Ingredients
            if (inputMode === 'frames') {
                ingSection.style.display = 'none';
                framesSection.style.display = '';
                modelHint.style.display = '';
                modelHint.textContent = 'ℹ️ Chế độ Khung hình: nhận tối đa 2 ảnh (khung đầu & khung cuối). Tuyệt đối không nhận video.';
            } else {
                ingSection.style.display = '';
                framesSection.style.display = 'none';
                if (isVeoModel(model)) {
                    // Veo: chặn video tham chiếu
                    if (videoSlot) videoSlot.classList.add('is-disabled');
                    if (videoBadge) videoBadge.textContent = '(Veo không hỗ trợ)';
                    if (videoPlaceholder) videoPlaceholder.innerHTML = '<span data-icon="lock" aria-hidden="true"></span> Model Veo không nhận video<br><small style="color:var(--text-muted)">Chỉ Omni 1.1 Flash hỗ trợ</small>';
                    if (videoHint) videoHint.textContent = '⚠️ Model Veo chỉ nhận ảnh. Chọn Omni 1.1 Flash để dùng video tham chiếu.';
                    if (selectedVideo) clearSelectedVideo();
                    modelHint.style.display = '';
                    modelHint.textContent = 'ℹ️ Model ' + model + ': Chất lượng mặc định của Flow. Chỉ nhận ảnh tham chiếu, không nhận video.';
                } else {
                    // Omni 1.1 Flash: cho phép video tham chiếu
                    if (videoSlot) videoSlot.classList.remove('is-disabled');
                    if (videoBadge) videoBadge.textContent = selectedVideo ? '(1/1)' : '(Tối đa 1)';
                    if (videoPlaceholder) videoPlaceholder.innerHTML = 'Bấm để tải video tham chiếu<br><small style="color:var(--text-muted)">(≤ 10s · Chỉ Omni Flash)</small>';
                    if (videoHint) videoHint.textContent = 'Tối đa 1 video (.mp4 ≤ 10s). Chỉ Omni 1.1 Flash hỗ trợ.';
                    modelHint.style.display = 'none';
                }
            }
        } else {
            // Mode Image
            resWrap.style.display = 'none';
            ingSection.style.display = '';
            framesSection.style.display = 'none';
            if (videoSlot) videoSlot.classList.add('is-disabled');
            if (videoBadge) videoBadge.textContent = '(Không nhận video)';
            if (videoPlaceholder) videoPlaceholder.innerHTML = '<span data-icon="lock" aria-hidden="true"></span> Chế độ tạo ảnh không nhận video<br><small style="color:var(--text-muted)">Chỉ nhận ảnh tham chiếu</small>';
            if (videoHint) videoHint.textContent = 'Chế độ tạo ảnh chỉ sử dụng ảnh tham chiếu.';
            if (selectedVideo) clearSelectedVideo();
            modelHint.style.display = 'none';
        }
    }

    function applyMode() {
        var mode = $('fq-mode').value;
        if (mode === 'video') {
            fillSelect($('fq-model'), VIDEO_MODELS, true);
            fillSelect($('fq-ratio'), VIDEO_RATIOS, true);
            $('fq-duration-wrap').style.display = '';
            $('fq-inputmode-wrap').style.display = '';
        } else {
            fillSelect($('fq-model'), IMAGE_MODELS, true);
            fillSelect($('fq-ratio'), IMAGE_RATIOS, true);
            $('fq-duration-wrap').style.display = 'none';
            $('fq-inputmode-wrap').style.display = 'none';
        }
        updateModelAndInputRules();
    }

    // ── Ingredients Slots (Ảnh & Video tham chiếu) ──────────────────────────
    function setupIngredientsSlots() {
        var imgPreview = $('fq-images-preview');
        var imgInput = $('fq-input-images');
        var imgClear = $('fq-images-clear');

        if (imgPreview && imgInput) {
            imgPreview.addEventListener('click', function (e) {
                if (e.target.closest('.fq-thumb-remove')) return;
                imgInput.click();
            });
            imgInput.addEventListener('change', function () {
                var files = Array.from(imgInput.files || []);
                if (!files.length) return;
                var validImgs = files.filter(function (f) {
                    return f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name);
                });
                if (validImgs.length < files.length) {
                    alert('Chỉ chấp nhận file ảnh (.jpg, .png, .webp). Các file không hợp lệ đã bị bỏ qua.');
                }
                var spaceLeft = 3 - selectedImages.length;
                if (validImgs.length > spaceLeft) {
                    alert('Hệ thống chỉ cho phép tối đa 3 ảnh tham chiếu. Chỉ thêm ' + spaceLeft + ' ảnh.');
                }
                validImgs.slice(0, spaceLeft).forEach(function (f) {
                    selectedImages.push(f);
                });
                imgInput.value = '';
                renderImagesPreview();
            });
        }
        if (imgClear) {
            imgClear.addEventListener('click', function (e) {
                e.stopPropagation();
                selectedImages = [];
                if (imgInput) imgInput.value = '';
                renderImagesPreview();
            });
        }

        var vidSlot = $('fq-slot-video');
        var vidPreview = $('fq-video-preview');
        var vidInput = $('fq-input-video');
        var vidClear = $('fq-video-clear');

        if (vidPreview && vidInput) {
            vidPreview.addEventListener('click', function (e) {
                if (vidSlot && vidSlot.classList.contains('is-disabled')) return;
                if (e.target.tagName === 'VIDEO') return;
                vidInput.click();
            });
            vidInput.addEventListener('change', function () {
                var file = vidInput.files && vidInput.files[0];
                if (!file) return;
                var isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|avi)$/i.test(file.name);
                if (!isVideo) {
                    alert('Vui lòng chọn file video hợp lệ (.mp4, .mov, .webm).');
                    vidInput.value = '';
                    return;
                }
                selectedVideo = file;
                renderVideoPreview();
            });
        }
        if (vidClear) {
            vidClear.addEventListener('click', function (e) {
                e.stopPropagation();
                clearSelectedVideo();
            });
        }
    }

    // ── Frames Slots Interactive Logic ──────────────────────────────────────
    function setupFrameSlot(slotId, fileInputId, previewId, clearBtnId) {
        var slot = $(slotId);
        var input = $(fileInputId);
        var preview = $(previewId);
        var clear = $(clearBtnId);

        preview.addEventListener('click', function () { input.click(); });
        input.addEventListener('change', function () {
            if (input.files && input.files[0]) {
                var file = input.files[0];
                if (!file.type.startsWith('image/')) {
                    alert('Chế độ Khung hình chỉ chấp nhận file ảnh (.png, .jpg, .webp).');
                    input.value = '';
                    return;
                }
                var reader = new FileReader();
                reader.onload = function (e) {
                    preview.innerHTML = '<img src="' + esc(e.target.result) + '" alt="' + esc(file.name) + '">';
                    slot.classList.add('has-file');
                    clear.style.display = '';
                };
                reader.readAsDataURL(file);
            }
        });
        clear.addEventListener('click', function (e) {
            e.stopPropagation();
            input.value = '';
            slot.classList.remove('has-file');
            preview.innerHTML = '<span class="placeholder">Bấm để chọn ảnh</span>';
            clear.style.display = 'none';
        });
    }

    // ── Submit job ──────────────────────────────────────────────────────────
    async function submitJob() {
        var btn = $('fq-submit');
        var msg = $('fq-form-msg');
        btn.disabled = true;
        btn.textContent = '⏳ Đang gửi…';
        try {
            var mode = $('fq-mode').value;
            var model = $('fq-model').value;
            var isVeo = isVeoModel(model);
            var inputMode = (mode === 'video') ? $('fq-inputmode').value : undefined;
            var mediaIds = [];

            if (mode === 'video' && inputMode === 'frames') {
                var firstFile = $('fq-first-file').files[0];
                var lastFile = $('fq-last-file').files[0];
                if (!firstFile && !lastFile) {
                    throw new Error('Chế độ Khung hình yêu cầu ít nhất 1 ảnh Khung hình đầu.');
                }
                var frameFiles = [];
                if (firstFile) frameFiles.push(firstFile);
                if (lastFile) frameFiles.push(lastFile);

                var fd = new FormData();
                frameFiles.forEach(function (f) { fd.append('files', f); });
                var up = await api('/media', { method: 'POST', body: fd });
                mediaIds = (up.media || []).map(function (m) { return m.id; });
            } else {
                if (selectedImages.length > 3) {
                    throw new Error('Hệ thống chỉ cho phép tối đa 3 ảnh tham chiếu.');
                }
                if (selectedVideo) {
                    if (mode === 'image') {
                        throw new Error('Chế độ tạo ảnh chỉ nhận ảnh tham chiếu, không nhận video.');
                    }
                    if (isVeo) {
                        throw new Error('Model ' + model + ' chỉ hỗ trợ ảnh tham chiếu, không hỗ trợ video tham chiếu. Vui lòng chọn Omni 1.1 Flash nếu muốn dùng video tham chiếu.');
                    }
                }
                var filesToUpload = selectedImages.slice();
                if (selectedVideo && mode === 'video' && !isVeo) {
                    filesToUpload.push(selectedVideo);
                }
                if (filesToUpload.length) {
                    var fd = new FormData();
                    filesToUpload.forEach(function (f) { fd.append('files', f); });
                    var up = await api('/media', { method: 'POST', body: fd });
                    mediaIds = (up.media || []).map(function (m) { return m.id; });
                }
            }

            var payload = {
                mode: mode,
                prompt: $('fq-prompt').value,
                aspectRatio: $('fq-ratio').value,
                model: model,
                variants: Number($('fq-variants').value),
                mediaIds: mediaIds,
            };
            if (mode === 'video') {
                payload.duration = Number($('fq-duration').value);
                payload.videoInputMode = inputMode;
                if (model === 'Omni 1.1 Flash' || !isVeo) {
                    payload.resolution = $('fq-resolution').value;
                }
            }
            await api('/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            showMsg(msg, '✅ Đã thêm job vào hàng chờ — worker bắt đầu chạy.', true);
            $('fq-prompt').value = '';
            selectedImages = [];
            renderImagesPreview();
            clearSelectedVideo();
            if ($('fq-first-clear')) $('fq-first-clear').click();
            if ($('fq-last-clear')) $('fq-last-clear').click();
            await refreshJobs();
        } catch (err) {
            showMsg(msg, '❌ ' + err.message, false);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span data-icon="rocket" aria-hidden="true"></span> Thêm vào hàng chờ & chạy';
        }
    }

    // ── Render jobs ─────────────────────────────────────────────────────────
    var STATUS_VI = { queued: 'Chờ', running: 'Đang chạy', succeeded: 'Xong', failed: 'Lỗi' };

    function fmtTime(iso) {
        if (!iso) return '';
        try { return new Date(iso).toLocaleTimeString('vi-VN'); } catch (_) { return iso; }
    }

    function renderOutput(o) {
        var isVideo = /\.(mp4|webm|mov)$/i.test(o.filename);
        var mediaHtml = isVideo
            ? '<video src="' + esc(o.url) + '" controls muted playsinline preload="metadata"></video>'
            : '<img src="' + esc(o.url) + '" alt="' + esc(o.filename) + '">';
        var size = o.size ? (o.size > 1048576 ? (o.size / 1048576).toFixed(1) + ' MB' : Math.round(o.size / 1024) + ' KB') : '';
        return '<div class="fq-output">' + mediaHtml +
            '<div class="fq-output-name"><span>' + esc(o.filename) + (size ? ' · ' + size : '') + '</span>' +
            '<a href="' + esc(o.url) + '" download="' + esc(o.filename) + '"><span data-icon="download" aria-hidden="true"></span> Tải</a></div></div>';
    }

    function renderJob(j) {
        var html = '<div class="fq-job" data-id="' + esc(j.id) + '">';
        html += '<div class="fq-job-head">';
        html += '<span class="fq-status ' + esc(j.status) + '">' + (STATUS_VI[j.status] || j.status) + '</span>';
        html += '<span class="fq-job-meta">' + (j.mode === 'image' ? '<span data-icon="image" aria-hidden="true"></span> ' : '<span data-icon="film" aria-hidden="true"></span> ') +
            esc(j.mode === 'image' ? j.model : j.model + ' · ' + (j.duration || '?') + 's') + ' · ' + esc(j.aspectRatio) + ' · x' + esc(j.variants) + '</span>';
        if (j.mediaNames && j.mediaNames.length) html += '<span class="fq-job-meta"><span data-icon="paperclip" aria-hidden="true"></span> ' + esc(j.mediaNames.join(', ')) + '</span>';
        html += '<span class="fq-job-id">' + esc(j.id) + ' · ' + fmtTime(j.createdAt) + '</span>';
        html += '</div>';
        html += '<p class="fq-job-prompt">' + esc(j.prompt.length > 220 ? j.prompt.slice(0, 220) + '…' : j.prompt) + '</p>';
        if (j.status === 'running' && j.logTail && j.logTail.length) {
            html += '<p class="fq-job-live">⏳ ' + esc(j.logTail[j.logTail.length - 1]) + '</p>';
        }
        if (j.error) html += '<div class="fq-job-error">❌ ' + esc(j.error) + '</div>';
        if (j.outputs && j.outputs.length) {
            html += '<div class="fq-job-outputs">' + j.outputs.map(renderOutput).join('') + '</div>';
        }
        if (j.logTail && j.logTail.length) {
            html += '<details><summary>Log (' + j.logTail.length + ' dòng)</summary><pre class="fq-log">' +
                esc(j.logTail.join('\n')) + '</pre></details>';
        }
        html += '<div class="fq-job-actions">';
        if (j.status === 'failed' || j.status === 'succeeded') {
            html += '<button class="fq-btn fq-btn-sm" data-act="retry"><span data-icon="refresh-cw" aria-hidden="true"></span> Chạy lại</button>';
        }
        if (j.status !== 'running') {
            html += '<button class="fq-btn fq-btn-sm fq-btn-danger" data-act="delete"><span data-icon="trash" aria-hidden="true"></span> Xóa</button>';
        }
        html += '</div></div>';
        return html;
    }

    var lastJobsJson = '';
    function renderJobs(jobs) {
        var serialized = JSON.stringify(jobs);
        if (serialized === lastJobsJson) return; // tránh vẽ lại làm giật video đang phát
        lastJobsJson = serialized;
        $('fq-count').textContent = jobs.length;
        var wrap = $('fq-jobs');
        if (!jobs.length) {
            wrap.innerHTML = '<p class="fq-empty" id="fq-empty">Chưa có job nào. Tạo job đầu tiên ở form bên trái.</p>';
            return;
        }
        wrap.innerHTML = jobs.map(renderJob).join('');
    }

    // ── Status / polling ────────────────────────────────────────────────────
    var pollBusy = false;

    function renderStatus(st) {
        var cdp = st.cdp || {};
        var cdpDot = $('fq-cdp-dot');
        if (cdp.connected) {
            cdpDot.className = 'fq-dot ok';
            $('fq-cdp-text').textContent = 'CDP 9334: ' + (cdp.browser || 'đã kết nối');
        } else {
            cdpDot.className = 'fq-dot bad';
            $('fq-cdp-text').textContent = 'CDP 9334: chưa kết nối';
        }
        if (cdp.url) $('fq-cdp-url').textContent = cdp.url;
        var wDot = $('fq-worker-dot');
        if (st.active) { wDot.className = 'fq-dot busy'; $('fq-worker-text').textContent = 'Worker: đang chạy ' + (st.currentJobId || ''); }
        else if (st.enabled) { wDot.className = 'fq-dot ok'; $('fq-worker-text').textContent = 'Worker: sẵn sàng'; }
        else { wDot.className = 'fq-dot'; $('fq-worker-text').textContent = 'Worker: tạm dừng'; }
        var ws = $('fq-workspace');
        if (document.activeElement !== ws && !ws.value && st.workspaceUrl) ws.value = st.workspaceUrl;
    }

    async function refreshJobs() {
        var data = await api('/jobs');
        renderJobs(data.jobs || []);
        return data;
    }

    async function poll() {
        if (pollBusy) return;
        pollBusy = true;
        try {
            var data = await refreshJobs();
            var busy = data.active || (data.counts && data.counts.queued > 0);
            clearTimeout(poll._t);
            poll._t = setTimeout(poll, busy ? 2500 : 8000);
        } catch (_) {
            clearTimeout(poll._t);
            poll._t = setTimeout(poll, 8000);
        } finally {
            pollBusy = false;
        }
    }

    async function pollStatus() {
        try { renderStatus(await api('/status')); } catch (_) {}
        clearTimeout(pollStatus._t);
        pollStatus._t = setTimeout(pollStatus, 8000);
    }

    // ── Events ──────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        applyMode();
        setupIngredientsSlots();
        setupFrameSlot('fq-slot-first', 'fq-first-file', 'fq-first-preview', 'fq-first-clear');
        setupFrameSlot('fq-slot-last', 'fq-last-file', 'fq-last-preview', 'fq-last-clear');
        $('fq-mode').addEventListener('change', function () { applyMode(); });
        $('fq-model').addEventListener('change', function () { updateModelAndInputRules(); });
        $('fq-inputmode').addEventListener('change', function () { updateModelAndInputRules(); });
        $('fq-submit').addEventListener('click', submitJob);

        $('fq-save-workspace').addEventListener('click', async function () {
            try {
                var out = await api('/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workspaceUrl: $('fq-workspace').value }),
                });
                showMsg($('fq-setting-msg'), '✅ Đã lưu URL project Flow.', true);
                $('fq-workspace').value = out.workspaceUrl || '';
            } catch (err) { showMsg($('fq-setting-msg'), '❌ ' + err.message, false); }
        });

        $('fq-start').addEventListener('click', async function () {
            try { await api('/worker/start', { method: 'POST' }); await pollStatus(); poll(); }
            catch (err) { showMsg($('fq-setting-msg'), '❌ ' + err.message, false); }
        });
        $('fq-pause').addEventListener('click', async function () {
            try { await api('/worker/pause', { method: 'POST' }); await pollStatus(); }
            catch (err) { showMsg($('fq-setting-msg'), '❌ ' + err.message, false); }
        });

        $('fq-jobs').addEventListener('click', async function (ev) {
            var btn = ev.target.closest('button[data-act]');
            if (!btn) return;
            var jobEl = btn.closest('.fq-job');
            var id = jobEl && jobEl.getAttribute('data-id');
            if (!id) return;
            try {
                if (btn.getAttribute('data-act') === 'retry') {
                    await api('/jobs/' + encodeURIComponent(id) + '/retry', { method: 'POST' });
                } else if (btn.getAttribute('data-act') === 'delete') {
                    if (!confirm('Xóa job ' + id + ' (kèm file output)?')) return;
                    await api('/jobs/' + encodeURIComponent(id), { method: 'DELETE' });
                }
                lastJobsJson = '';
                await refreshJobs();
            } catch (err) { alert('Lỗi: ' + err.message); }
        });

        pollStatus();
        poll();
    });
})();
