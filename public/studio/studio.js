/**
 * GTF Video AI Studio - Frontend Client
 * Real-Time Socket.io & REST API UI Controller
 */

// Initialize Socket.io
const socket = io('/byteplus');

// Application State
// Clean up any legacy cleared states from localStorage
try {
    localStorage.removeItem('hg_cleared_task_ids');
    localStorage.removeItem('hg_cleared_usage_time');
    localStorage.removeItem('hg_cleared_completed_ui');
    localStorage.removeItem('hg_cleared_usage_ui');
} catch (e) {}

let appState = {
    isRunning: false,
    isPaused: false,
    currentTaskId: null,
    currentTask: null,
    tasks: [],
    stats: { total: 0, pending: 0, running: 0, completed: 0, failed: 0 },
    activeFilter: 'all',
    searchQuery: '',
    selectedImageData: null,
    selectedImageName: null,
    autoScrollLogs: true,
    currentPage: 1,
    pageSize: 15
};

// =========================================================================
// DOM ELEMENTS CACHE
// =========================================================================
const el = {
    // Header & Queue Status
    queueStatusPill: document.getElementById('queue-status-pill'),
    queueDot: document.getElementById('queue-dot'),
    queueStatusText: document.getElementById('queue-status-text'),

    // Stats
    statTotal: document.getElementById('stat-total'),
    statPending: document.getElementById('stat-pending'),
    statRunning: document.getElementById('stat-running'),
    statCompleted: document.getElementById('stat-completed'),
    statFailed: document.getElementById('stat-failed'),
    statEta: document.getElementById('stat-eta'),

    // Controls
    btnStart: document.getElementById('btn-start'),
    btnPause: document.getElementById('btn-pause'),
    btnStop: document.getElementById('btn-stop'),

    // Forms & Inputs
    singleForm: document.getElementById('single-form'),
    creator: document.getElementById('creator'),
    taskName: document.getElementById('task-name'),
    prompt: document.getElementById('prompt'),
    promptCharCount: document.getElementById('prompt-char-count'),
    imageDropzone: document.getElementById('image-dropzone'),
    imageFileInput: document.getElementById('imageFileInput'),
    dropzoneContent: document.getElementById('dropzone-content'),
    imagePreviewList: document.getElementById('image-preview-list'),
    imageCounterBadge: document.getElementById('image-counter-badge'),
    imagePath: document.getElementById('imagePath'),
    videoDropzone: document.getElementById('video-dropzone'),
    videoFileInput: document.getElementById('videoFileInput'),
    videoDropzoneContent: document.getElementById('video-dropzone-content'),
    videoPreviewList: document.getElementById('video-preview-list'),
    videoCounterBadge: document.getElementById('video-counter-badge'),
    videoPath: document.getElementById('videoPath'),
    model: document.getElementById('model'),
    duration: document.getElementById('duration'),
    aspectRatio: document.getElementById('aspectRatio'),
    resolution: document.getElementById('resolution'),
    unlimited: document.getElementById('unlimited'),

    // Bulk Import
    bulkText: document.getElementById('bulk-text'),
    bulkCreator: document.getElementById('bulk-creator'),
    bulkTaskName: document.getElementById('bulk-task-name'),
    bulkModel: document.getElementById('bulk-model'),
    bulkDuration: document.getElementById('bulk-duration'),
    bulkAspectRatio: document.getElementById('bulk-aspectRatio'),
    bulkResolution: document.getElementById('bulk-resolution'),
    bulkPreviewBox: document.getElementById('bulk-preview-box'),
    bulkDetectedCount: document.getElementById('bulk-detected-count'),
    bulkPreviewList: document.getElementById('bulk-preview-list'),
    btnBulkImport: document.getElementById('btn-bulk-import'),

    // Monitor
    activeTaskId: document.getElementById('active-task-id'),
    activeTaskBadge: document.getElementById('active-task-badge'),
    currentStepTitle: document.getElementById('current-step-title'),
    progressPercent: document.getElementById('progress-percent'),
    progressFill: document.getElementById('progress-fill'),
    milestonesTrack: document.getElementById('milestones-track'),
    liveScreenshot: document.getElementById('live-screenshot'),
    logsContainer: document.getElementById('logs-container'),
    cliLogsContainer: document.getElementById('cli-logs-container'),
    autoscrollToggle: document.getElementById('autoscroll-toggle'),
    btnClearLogs: document.getElementById('btn-clear-logs'),

    // Table
    queueCount: document.getElementById('queue-count'),
    tableSearch: document.getElementById('table-search'),
    queueTableBody: document.getElementById('queue-table-body'),
    tablePagination: document.getElementById('table-pagination'),
    filterChips: document.querySelectorAll('.filter-chip'),

    // Credits & Actions
    creditBalanceVal: document.getElementById('credit-balance-val'),
    submitBtn: document.getElementById('submit-btn'),
    statCredits: document.getElementById('stat-credits'),
};

// =========================================================================
// TAB SWITCHING
// =========================================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.dataset.tab;
        let target = document.getElementById(tabId);
        if (!target && (tabId === 'single-tab' || tabId === 'single-form')) {
            target = document.getElementById('single-form') || document.getElementById('single-tab');
        }
        if (target) target.classList.add('active');
    });
});

// =========================================================================
// CREDIT MODE — KHỞI TẠO, TOGGLE, POPULATE MODELS, BALANCE POLLING
// =========================================================================

const appCreditState = { balance: null };

async function refreshCreditBalance() {
    try {
        const res = await fetch('/api/byteplus/account/credits');
        const data = await res.json();
        appCreditState.balance = data.credits;
        const formatted = typeof data.credits === 'number' ? data.credits.toLocaleString('vi-VN') : '?';
        if (el.statCredits) el.statCredits.textContent = formatted;
        if (el.creditBalanceVal) el.creditBalanceVal.textContent = `${formatted} credits`;
    } catch (e) {}
}

refreshCreditBalance();
setInterval(refreshCreditBalance, 30000);

// =========================================================================
// SOCKET.IO EVENT LISTENERS
// =========================================================================
socket.on('connect', () => {
    appendLog({
        timestamp: new Date().toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        level: 'success',
        message: '🟢 Đã kết nối Socket.io với máy chủ Backend.'
    });
});

socket.on('disconnect', () => {
    appendLog({
        timestamp: new Date().toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        level: 'warning',
        message: '🔴 Mất kết nối Socket.io với máy chủ Backend. Đang thử kết nối lại...'
    });
});

socket.on('byteplus:task-updated', (task) => {
    if (!task) return;
    const tIndex = appState.tasks.findIndex(t => t.id === task.id);
    if (tIndex >= 0) {
        appState.tasks[tIndex] = { ...appState.tasks[tIndex], ...task };
    } else {
        appState.tasks.unshift(task);
    }
    
    // Cập nhật live monitor nếu task đang chạy
    if (task.status === 'running') {
        const shortId = task.id ? task.id.slice(-4) : '...';
        if (el.activeTaskId) el.activeTaskId.textContent = '#' + shortId + ' (' + (task.taskName || 'Video') + ')';
        if (el.activeTaskBadge) {
            el.activeTaskBadge.textContent = 'Đang Chạy';
            el.activeTaskBadge.className = 'task-badge running';
        }
        if (el.currentStepTitle) {
            el.currentStepTitle.textContent = '[#' + shortId + '] ' + (task.pipelineStage || 'Đang xử lý...') + ': ' + (task.progress || 0) + '%';
        }
        if (el.progressPercent) {
            el.progressPercent.textContent = (task.progress || 0) + '%';
        }
        if (el.progressFill) {
            el.progressFill.style.width = (task.progress || 0) + '%';
        }
    } else if (task.status === 'completed' || task.status === 'failed') {
        if (el.progressPercent) el.progressPercent.textContent = (task.progress || 100) + '%';
        if (el.progressFill) el.progressFill.style.width = (task.progress || 100) + '%';
        loadUsageSummary();
        refreshCreditBalance();
    }
    renderQueueTable();
});

socket.on('byteplus:task-completed', () => {
    loadUsageSummary();
    refreshCreditBalance();
});

socket.on('byteplus:task-created', () => {
    loadUsageSummary();
});

socket.on('byteplus:queue-updated', (data) => {
    if (!data) return;
    appState.isRunning = data.control.running;
    appState.isPaused = data.control.paused || false;
    appState.currentTaskId = data.currentTaskId;
    appState.currentTask = data.currentTask || (data.tasks ? data.tasks.find(t => t.id === data.currentTaskId) : null);
    appState.tasks = data.tasks || data.tasks || [];
    if (data.stats) {
        appState.stats = data.stats;
    } else {
        appState.stats = calculateStats(appState.tasks);
    }
    updateUI();
});

socket.on('task_progress', (data) => {
    if (!data) return;
    const { taskId, step, totalSteps, progress, message } = data;
    const shortId = taskId ? taskId.slice(-4) : '...';
    
    if (el.currentStepTitle) {
        el.currentStepTitle.textContent = `[Task #${shortId}] Bước ${step || 0}/${totalSteps || 10}: ${message || ''}`;
    }
    if (el.progressPercent) {
        el.progressPercent.textContent = `${progress || 0}%`;
    }
    if (el.progressFill) {
        el.progressFill.style.width = `${progress || 0}%`;
    }

    updateMilestones(step || 0);

    // Cập nhật dòng task trong bảng nếu đang hiển thị
    const task = appState.tasks.find(t => t.id === taskId);
    if (task) {
        task.progress = progress;
        task.currentStep = message;
        renderQueueTable();
    }
});

socket.on('live_preview', (data) => {
    const screenshot = data.screenshot || data.image;
    if (screenshot && el.liveScreenshot) {
        el.liveScreenshot.src = screenshot;
    }
});

socket.on('byteplus:log', (logItem) => {
    appendLog(logItem);
});

// =========================================================================

// =====================================
// KIE COST ESTIMATOR
// =====================================
async function getVideoDuration(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        let resolved = false;
        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                window.URL.revokeObjectURL(video.src);
                resolve(0);
            }
        }, 3000);
        video.onloadedmetadata = function() {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                window.URL.revokeObjectURL(video.src);
                resolve(Number(video.duration) || 0);
            }
        };
        video.onerror = function() {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                window.URL.revokeObjectURL(video.src);
                resolve(0);
            }
        };
        video.src = URL.createObjectURL(file);
    });
}

async function updateKieCostEstimate() {
    const isBulkActive = document.getElementById('bulk-tab')?.classList.contains('active');
    const resEl = isBulkActive
        ? (document.getElementById('bulk-resolution') || document.getElementById('resolution'))
        : (document.getElementById('resolution') || document.getElementById('bulk-resolution'));
    const durEl = isBulkActive
        ? (document.getElementById('bulk-duration') || document.getElementById('duration'))
        : (document.getElementById('duration') || document.getElementById('bulk-duration'));
    
    if (!resEl || !durEl) return;
    
    const resolution = resEl.value || '720p';
    let outputDuration = parseInt(durEl.value, 10);
    if (isNaN(outputDuration)) outputDuration = 16;

    let totalInputVideoDuration = 0;
    if (!isBulkActive && appState.selectedVideoFiles && appState.selectedVideoFiles.length > 0) {
        for (const f of appState.selectedVideoFiles) {
            try {
                const dur = await getVideoDuration(f);
                if (dur && !isNaN(dur)) totalInputVideoDuration += dur;
            } catch (e) {
                console.warn('Cannot read video duration:', e);
            }
        }
    }
    totalInputVideoDuration = Number(totalInputVideoDuration.toFixed(2));
    appState.totalInputVideoDuration = totalInputVideoDuration;
    
    try {
        const res = await fetch('/api/byteplus/pricing/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resolution, outputDuration, inputVideoDuration: totalInputVideoDuration })
        });
        const data = await res.json();
        if (data.success && data.quote) {
            const q = data.quote;
            appState.currentQuote = q;

            // Populate all 8 fields of the cost breakdown card
            const cbRes = document.getElementById('cb-resolution');
            const cbRate = document.getElementById('cb-rate');
            const cbOutDur = document.getElementById('cb-output-duration');
            const cbOutCost = document.getElementById('cb-output-cost');
            const cbInDur = document.getElementById('cb-input-duration');
            const cbInCost = document.getElementById('cb-input-cost');
            const cbTotalCredits = document.getElementById('cb-total-credits');
            const cbUsd = document.getElementById('cb-usd-equivalent');
            
            if (cbRes) cbRes.textContent = q.resolution;
            if (cbRate) cbRate.textContent = `${q.rate} cr/s`;
            if (cbOutDur) cbOutDur.textContent = `${q.outputDuration}s`;
            if (cbOutCost) cbOutCost.textContent = `${q.outputCost} cr`;
            if (cbInDur) cbInDur.textContent = `${q.totalInputVideoDuration || 0}s`;
            if (cbInCost) cbInCost.textContent = `${q.inputVideoCost || 0} cr`;
            if (cbTotalCredits) cbTotalCredits.textContent = `${q.totalCredits} cr`;
            if (cbUsd) cbUsd.textContent = `$${Number(q.usdEquivalent || 0).toFixed(3)}`;

            // Legacy inline estimate span (if present)
            const estSpan = document.getElementById('live-cost-estimate');
            if (estSpan) {
                estSpan.innerHTML = `💰 Ước tính: ${q.totalCredits} cr ($${Number(q.usdEquivalent || 0).toFixed(3)})`;
            }
        }
    } catch(err) {
        console.error('Lỗi tính phí Kie:', err);
    }
}
setTimeout(updateKieCostEstimate, 300);
document.getElementById('resolution')?.addEventListener('change', updateKieCostEstimate);
document.getElementById('bulk-resolution')?.addEventListener('change', updateKieCostEstimate);
document.getElementById('duration')?.addEventListener('change', updateKieCostEstimate);
document.getElementById('bulk-duration')?.addEventListener('change', updateKieCostEstimate);
document.getElementById('duration')?.addEventListener('input', updateKieCostEstimate);
document.getElementById('bulk-duration')?.addEventListener('input', updateKieCostEstimate);
document.getElementById('videoFileInput')?.addEventListener('change', () => setTimeout(updateKieCostEstimate, 300));
document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => setTimeout(updateKieCostEstimate, 150)));

// UI UPDATERS
// =========================================================================
function updateUI() {
    updateHeaderBadges();
    updateStatsDisplay();
    updateControlButtons();
    updateActiveTaskDisplay();
    renderQueueTable();
}

function calculateStats(tasks) {
    return {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        running: tasks.filter(t => t.status === 'running').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length
    };
}

function updateHeaderBadges() {
    // Queue Status
    if (appState.isRunning) {
        el.queueDot.className = 'status-dot green';
        el.queueStatusText.textContent = 'Hàng Chờ: RUNNING';
    } else if (appState.isPaused) {
        el.queueDot.className = 'status-dot yellow';
        el.queueStatusText.textContent = 'Hàng Chờ: PAUSED';
    } else {
        el.queueDot.className = 'status-dot gray';
        el.queueStatusText.textContent = 'Hàng Chờ: IDLE';
    }
}

function updateStatsDisplay() {
    const s = appState.stats || calculateStats(appState.tasks);
    if (el.statTotal) el.statTotal.textContent = s.total || 0;
    if (el.statPending) el.statPending.textContent = s.pending || 0;
    if (el.statRunning) el.statRunning.textContent = s.running || 0;
    if (el.statCompleted) el.statCompleted.textContent = s.completed || 0;
    if (el.statFailed) el.statFailed.textContent = s.failed || 0;
    if (el.queueCount) el.queueCount.textContent = s.total || 0;

    // Tính toán ETA: Mỗi video ước tính ~2 phút
    const remainingTasks = (s.pending || 0) + (s.running || 0);
    const activeMins = remainingTasks * 2;
    if (el.statEta) {
        if (activeMins === 0) {
            el.statEta.textContent = '0 phút';
        } else if (activeMins < 60) {
            el.statEta.textContent = `~${activeMins} phút`;
        } else {
            const h = Math.floor(activeMins / 60);
            const m = activeMins % 60;
            el.statEta.textContent = `~${h}h${m > 0 ? ' ' + m + 'm' : ''}`;
        }
    }
}

function getStageLabel(task) {
    if (!task) return 'Sẵn sàng';
    if (task.status === 'failed') {
        return task.error?.message || 'Thất bại';
    }
    if (task.status === 'completed') {
        return 'Hoàn thành';
    }
    const stage = task.pipelineStage || task.currentStep;
    if (!stage) {
        return task.status === 'pending' ? 'Chờ trong hàng' : 'Sẵn sàng';
    }
    const map = {
        'Preparing References': 'Chuẩn bị dữ liệu',
        'Uploading References': 'Tải lên tài nguyên',
        'Submitting': 'Gửi yêu cầu khởi tạo',
        'Queued': 'Đang xếp hàng tại Kie',
        'Generating': 'Đang tạo video',
        'Downloading': 'Đang tải video về máy',
        'Completed': 'Hoàn thành'
    };
    return map[stage] || stage;
}

function updateControlButtons() {
    const isRunning = appState.isRunning;
    const isPaused = appState.isPaused;
    const hasRunningTask = !!appState.currentTaskId || appState.tasks.some(t => t.status === 'running');

    if (isPaused) {
        if (el.btnStart) {
            el.btnStart.disabled = true;
            el.btnStart.innerHTML = '<span class="icon">▶</span> Bắt Đầu';
            el.btnStart.title = 'Hàng chờ đang tạm dừng';
        }
        if (el.btnPause) {
            el.btnPause.disabled = false;
            el.btnPause.innerHTML = '<span class="icon">▶️</span> Tiếp Tục';
            el.btnPause.className = 'btn btn-primary';
            el.btnPause.title = 'Tiếp tục chạy hàng chờ';
        }
        if (el.btnStop) el.btnStop.disabled = false;
    } else if (isRunning) {
        if (el.btnStart) {
            el.btnStart.disabled = true;
            el.btnStart.innerHTML = '<span class="icon">▶</span> Bắt Đầu';
            el.btnStart.title = 'Hàng chờ đang chạy';
        }
        if (el.btnPause) {
            el.btnPause.disabled = false;
            el.btnPause.innerHTML = '<span class="icon">⏸</span> Tạm Dừng';
            el.btnPause.className = 'btn btn-warning';
            el.btnPause.title = 'Tạm dừng hàng chờ';
        }
        if (el.btnStop) el.btnStop.disabled = false;
    } else {
        if (el.btnStart) {
            el.btnStart.disabled = false;
            el.btnStart.innerHTML = '<span class="icon">▶</span> Bắt Đầu';
            el.btnStart.title = 'Khởi động xử lý hàng chờ';
        }
        if (el.btnPause) {
            el.btnPause.disabled = true;
            el.btnPause.innerHTML = '<span class="icon">⏸</span> Tạm Dừng';
            el.btnPause.className = 'btn btn-warning';
            el.btnPause.title = 'Tạm dừng hàng chờ';
        }
        if (el.btnStop) el.btnStop.disabled = !hasRunningTask;
    }
}

function updateActiveTaskDisplay() {
    const runningTask = (appState.currentTaskId && appState.tasks.find(t => t.id === appState.currentTaskId))
        || appState.tasks.find(t => t.status === 'running');

    if (runningTask) {
        const shortId = runningTask.id ? runningTask.id.slice(-6) : '...';
        const name = runningTask.taskName ? ` (${runningTask.taskName})` : '';
        if (el.activeTaskId) el.activeTaskId.textContent = `Task #${shortId}${name}`;
        if (el.activeTaskBadge) {
            el.activeTaskBadge.textContent = 'Running';
            el.activeTaskBadge.className = 'task-badge running';
        }
        if (el.progressFill) el.progressFill.style.width = `${runningTask.progress || 0}%`;
        if (el.progressPercent) el.progressPercent.textContent = `${runningTask.progress || 0}%`;
        if (el.currentStepTitle) {
            el.currentStepTitle.textContent = `[Task #${shortId}] ${getStageLabel(runningTask)}: ${runningTask.progress || 0}%`;
        }
    } else if (appState.isPaused) {
        if (el.activeTaskId) el.activeTaskId.textContent = 'Tạm dừng';
        if (el.activeTaskBadge) {
            el.activeTaskBadge.textContent = 'Paused';
            el.activeTaskBadge.className = 'task-badge idle';
        }
    } else {
        if (el.activeTaskId) el.activeTaskId.textContent = 'Chưa có task';
        if (el.activeTaskBadge) {
            el.activeTaskBadge.textContent = 'Idle';
            el.activeTaskBadge.className = 'task-badge idle';
        }

        if (el.progressFill) el.progressFill.style.width = '0%';
        if (el.progressPercent) el.progressPercent.textContent = '0%';
        if (el.currentStepTitle) el.currentStepTitle.textContent = 'Sẵn sàng chờ lệnh...';
        resetMilestones();
    }
}

function updateMilestones(activeStep) {
    if (!el.milestonesTrack) return;
    const stepElements = el.milestonesTrack.querySelectorAll('.milestone-step');
    stepElements.forEach(stepEl => {
        const stepNum = parseInt(stepEl.dataset.step, 10);
        stepEl.classList.remove('active', 'passed');
        if (stepNum < activeStep) {
            stepEl.classList.add('passed');
        } else if (stepNum === activeStep) {
            stepEl.classList.add('active');
        }
    });
}

function resetMilestones() {
    if (!el.milestonesTrack) return;
    el.milestonesTrack.querySelectorAll('.milestone-step').forEach(s => s.classList.remove('active', 'passed'));
}

// =========================================================================
// TABLE RENDERING & FILTERING
// =========================================================================

// IntersectionObserver instance — reused across renders
let _mediaObserver = null;

function _ensureMediaObserver() {
    if (_mediaObserver) return;
    _mediaObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const wrap = entry.target;
            const url = wrap.dataset.lazySrc;
            const type = wrap.dataset.lazyType;
            if (!url) return;

            // Remove skeleton, inject real element
            wrap.innerHTML = '';
            if (type === 'image') {
                const img = document.createElement('img');
                img.className = 'ref-thumb-img';
                img.alt = wrap.dataset.lazyAlt || '';
                img.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:5px;display:block;';
                img.onerror = () => { wrap.textContent = '🖼️'; };
                img.src = url;
                wrap.appendChild(img);
            } else {
                // Video: use a static poster placeholder icon by default;
                // only create the real <video> element on hover.
                const icon = document.createElement('span');
                icon.textContent = '🎬';
                icon.style.cssText = 'font-size:1.4rem;cursor:pointer;';
                wrap.appendChild(icon);

                // On hover, replace icon with actual video element
                const activateVideo = () => {
                    if (wrap.querySelector('video')) return;
                    wrap.innerHTML = '';
                    const vid = document.createElement('video');
                    vid.src = url + '#t=0.001';
                    vid.muted = true;
                    vid.playsInline = true;
                    vid.preload = 'metadata';
                    vid.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:5px;display:block;cursor:pointer;';
                    vid.onerror = () => { wrap.textContent = '🎬'; };
                    wrap.appendChild(vid);
                    // Auto-play brief preview on hover
                    wrap.addEventListener('mouseenter', () => vid.play().catch(() => {}), { passive: true });
                    wrap.addEventListener('mouseleave', () => { vid.pause(); vid.currentTime = 0; }, { passive: true });
                    vid.play().catch(() => {});
                };
                wrap.addEventListener('mouseenter', activateVideo, { once: true, passive: true });
            }

            _mediaObserver.unobserve(wrap);
        });
    }, { rootMargin: '100px', threshold: 0 });
}

function renderQueueTable() {
    if (!el.queueTableBody) return;

    let filtered = [...appState.tasks];

    // Filter theo Status
    if (appState.activeFilter !== 'all') {
        filtered = filtered.filter(t => t.status === appState.activeFilter);
    }

    // Filter theo Search Query
    if (appState.searchQuery.trim()) {
        const q = appState.searchQuery.toLowerCase().trim();
        filtered = filtered.filter(t =>
            (t.prompt && t.prompt.toLowerCase().includes(q)) ||
            (t.id && t.id.toLowerCase().includes(q)) ||
            (t.model && t.model.toLowerCase().includes(q)) ||
            (t.creator && t.creator.toLowerCase().includes(q))
        );
    }

    // Sắp xếp thứ tự ưu tiên hiển thị trong bảng:
    // 1. Task đang chạy (running) trên cùng để theo dõi tiến độ
    // 2. Hàng chờ đang đợi (pending) hiển thị ngay tiếp theo theo đúng thứ tự hàng chờ thực tế (để kéo thả / ưu tiên)
    // 3. Task thất bại (failed) để người dùng bấm Retry
    // 4. Task đã hoàn tất (completed) hiển thị ở nhóm lịch sử, mới hoàn thành nhất lên đầu
    filtered.sort((a, b) => {
        // 1. Task đang chạy (running) ưu tiên hiển thị ở trên cùng
        if (a.status === 'running' && b.status !== 'running') return -1;
        if (b.status === 'running' && a.status !== 'running') return 1;

        // 2. Task đang chờ (pending) hiển thị tiếp theo để người dùng quản lý / kéo thả
        if (a.status === 'pending' && b.status !== 'pending') {
            if (b.status === 'running') return 1;
            return -1;
        }
        if (b.status === 'pending' && a.status !== 'pending') {
            if (a.status === 'running') return -1;
            return 1;
        }

        // Nếu cả hai đều là pending: Giữ đúng thứ tự hàng chờ tuần tự (đã ưu tiên / kéo thả)
        if (a.status === 'pending' && b.status === 'pending') {
            const idxA = appState.tasks.indexOf(a);
            const idxB = appState.tasks.indexOf(b);
            return idxA - idxB;
        }

        // 3. Task thất bại (failed) trước completed
        if (a.status === 'failed' && b.status === 'completed') return -1;
        if (b.status === 'failed' && a.status === 'completed') return 1;
        if (a.status === 'failed' && b.status === 'failed') {
            const timeA = new Date(a.completedAt || a.startedAt || a.createdAt || 0).getTime();
            const timeB = new Date(b.completedAt || b.startedAt || b.createdAt || 0).getTime();
            return timeB - timeA;
        }

        // 4. Task đã hoàn tất (completed): Mới hoàn thành nhất lên đầu
        if (a.status === 'completed' && b.status === 'completed') {
            const timeA = new Date(a.completedAt || a.createdAt || 0).getTime();
            const timeB = new Date(b.completedAt || b.createdAt || 0).getTime();
            return timeB - timeA;
        }

        return 0;
    });

    if (filtered.length === 0) {
        el.queueTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center empty-msg">
                    <div class="empty-state">
                        <span class="empty-icon">📭</span>
                        <p>${appState.tasks.length === 0 ? 'Chưa có task nào trong hàng chờ.' : 'Không tìm thấy task phù hợp với bộ lọc.'}</p>
                        <small>Tạo task mới từ biểu mẫu bên trái để bắt đầu tạo video.</small>
                    </div>
                </td>
            </tr>
        `;
        if (el.tablePagination) el.tablePagination.style.display = 'none';
        return;
    }

    // -----------------------------------------------------------------------
    // PAGINATION — clamp currentPage
    // -----------------------------------------------------------------------
    const PAGE_SIZE = appState.pageSize;
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (appState.currentPage > totalPages) appState.currentPage = totalPages;
    if (appState.currentPage < 1) appState.currentPage = 1;
    const pageStart = (appState.currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

    // -----------------------------------------------------------------------
    // FORMAT HELPER
    // -----------------------------------------------------------------------
    const formatTime24 = (dStr) => {
        if (!dStr) return null;
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return null;
        const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        return `${date} ${time}`;
    };

    const getMediaUrl = (p) => {
        if (!p) return '';
        if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:') || p.startsWith('/api/')) return p;
        const fileName = p.split(/[\\/]/).pop();
        if (p.includes('byteplus_uploads')) {
            return `/api/byteplus/upload-preview/${encodeURIComponent(fileName)}`;
        }
        return `/uploads/${encodeURIComponent(fileName)}`;
    };

    // -----------------------------------------------------------------------
    // BUILD ROW HTML (thumbnail wraps use skeleton — real media via Observer)
    // -----------------------------------------------------------------------
    const buildThumbWrap = (url, type, alt) => `
        <div class="ref-thumb-wrap ref-lazy-wrap" data-lazy-src="${escapeHtml(url)}" data-lazy-type="${type}" data-lazy-alt="${escapeHtml(alt)}">
            <div class="ref-thumb-skeleton"></div>
        </div>
    `;

    el.queueTableBody.innerHTML = pageItems.map((task, idx) => {
        const globalIdx = pageStart + idx;
        const createdDate = formatTime24(task.createdAt) || '--:--';
        const completedDate = formatTime24(task.completedAt);

        // Trích xuất toàn bộ nguồn tham chiếu từ task.references (chuẩn V2 Deeplove/BytePlus)
        // và fallback sang task.imagePaths / task.videoPaths (chuẩn V1)
        const rawRefs = Array.isArray(task.references) ? task.references : [];

        // 1. Ảnh tham chiếu (từ task.references hoặc task.imagePaths)
        let refImages = rawRefs.filter(r => r && (r.type === 'image' || (!r.type && (r.previewUrl || r.localPath))));
        if (refImages.length === 0) {
            const legacyImgs = (Array.isArray(task.imagePaths) && task.imagePaths.length > 0)
                ? task.imagePaths
                : (task.imagePath ? [task.imagePath] : []);
            refImages = legacyImgs.map((p, i) => ({
                id: `legacy_img_${i}`,
                type: 'image',
                localPath: p,
                originalName: p.split(/[\\/]/).pop(),
                alias: `@Image ${i + 1}`,
                previewUrl: getMediaUrl(p)
            }));
        }

        const imgTagsHtml = refImages.map((ref, i) => {
            const fullUrl = ref.previewUrl || (ref.localPath ? getMediaUrl(ref.localPath) : '') || ref.remoteUrl || '';
            const fileName = ref.originalName || (ref.localPath ? ref.localPath.split(/[\\/]/).pop() : `Ảnh #${i + 1}`);
            const aliasName = ref.alias || `@Image ${i + 1}`;
            return `
                <div class="ref-media-item is-image" onclick="window.openMediaModal('${escapeHtml(fullUrl)}', 'image', 'Ảnh Tham Chiếu (${escapeHtml(aliasName)}): ${escapeHtml(fileName)}')" title="Bấm để phóng to [${escapeHtml(aliasName)}]: ${escapeHtml(fileName)}">
                    ${fullUrl ? buildThumbWrap(fullUrl, 'image', fileName) : '<div class="ref-thumb-wrap"><span>🖼️</span></div>'}
                    <div class="ref-media-info">
                        <span class="ref-media-badge img-badge">📷 ${escapeHtml(aliasName)}</span>
                        <span class="ref-media-name">${escapeHtml(fileName)}</span>
                    </div>
                </div>
            `;
        }).join('');

        // 2. Video tham chiếu (từ task.references hoặc task.videoPaths)
        let refVideos = rawRefs.filter(r => r && r.type === 'video');
        if (refVideos.length === 0) {
            const legacyVids = (Array.isArray(task.videoPaths) && task.videoPaths.length > 0)
                ? task.videoPaths
                : (task.videoPath ? [task.videoPath] : []);
            refVideos = legacyVids.map((p, i) => ({
                id: `legacy_vid_${i}`,
                type: 'video',
                localPath: p,
                originalName: p.split(/[\\/]/).pop(),
                alias: `@Video ${i + 1}`,
                previewUrl: getMediaUrl(p)
            }));
        }

        const videoTagHtml = refVideos.map((ref, i) => {
            const fullUrl = ref.previewUrl || (ref.localPath ? getMediaUrl(ref.localPath) : '') || ref.remoteUrl || '';
            const fileName = ref.originalName || (ref.localPath ? ref.localPath.split(/[\\/]/).pop() : `Video #${i + 1}`);
            const aliasName = ref.alias || `@Video ${i + 1}`;
            return `
                <div class="ref-media-item is-video" onclick="window.openMediaModal('${escapeHtml(fullUrl)}', 'video', 'Video Tham Chiếu (${escapeHtml(aliasName)}): ${escapeHtml(fileName)}')" title="Bấm để xem [${escapeHtml(aliasName)}]: ${escapeHtml(fileName)}">
                    ${fullUrl ? buildThumbWrap(fullUrl, 'video', fileName) : '<div class="ref-thumb-wrap"><span>🎬</span></div>'}
                    <div class="ref-media-info">
                        <span class="ref-media-badge video-badge">🎬 ${escapeHtml(aliasName)}</span>
                        <span class="ref-media-name">${escapeHtml(fileName)}</span>
                    </div>
                </div>
            `;
        }).join('');

        // 3. Nhân vật KOL ảo (từ task.references)
        const refKols = rawRefs.filter(r => r && r.type === 'kol');
        const kolTagHtml = refKols.map((ref) => {
            const kolInLib = Array.isArray(cachedKols) ? cachedKols.find(k => k.id === ref.kolId) : null;
            const kolName = ref.displayName || (kolInLib && kolInLib.displayName) || ref.alias || 'KOL ảo';
            const kolThumb = ref.previewUrl || ref.thumbnailUrl || (kolInLib && kolInLib.thumbnailUrl) || (ref.localPath ? getMediaUrl(ref.localPath) : '');
            const clickAction = kolThumb
                ? `onclick="window.openMediaModal('${escapeHtml(kolThumb)}', 'image', 'KOL Ảo: ${escapeHtml(kolName)}')"`
                : '';
            return `
                <div class="ref-media-item is-kol" ${clickAction} title="${kolThumb ? 'Bấm để phóng to chân dung KOL: ' + escapeHtml(kolName) : 'KOL Ảo: ' + escapeHtml(kolName)}">
                    ${kolThumb ? buildThumbWrap(kolThumb, 'image', kolName) : '<div class="ref-thumb-wrap ref-kol-avatar"><span>👤</span></div>'}
                    <div class="ref-media-info">
                        <span class="ref-media-badge kol-badge">👤 KOL</span>
                        <span class="ref-media-name" style="color: #c084fc;">${escapeHtml(kolName)}</span>
                    </div>
                </div>
            `;
        }).join('');

        // 4. Video kết quả (khi render xong)
        const videoResultUrl = task.outputWebPath || task.videoUrl || task.outputUrl;
        const videoResultHtml = videoResultUrl ? `
            <div class="ref-media-item is-result" onclick="window.openMediaModal('${escapeHtml(videoResultUrl)}', 'video', 'Video Kết Quả')" title="Bấm để xem video kết quả">
                ${buildThumbWrap(videoResultUrl, 'video', 'video-result.mp4')}
                <div class="ref-media-info">
                    <span class="ref-media-badge result-badge">🎬 Kết Quả</span>
                    <span class="ref-media-name" style="color: #34d399;">Xem Video</span>
                </div>
            </div>
        ` : '';

        const pendingIndex = appState.tasks.filter(t => t.status === 'pending' || t.status === 'running').findIndex(t => t.id === task.id);
        const taskEtaMins = pendingIndex >= 0 ? (pendingIndex + 1) * 30 : null;
        const etaText = (task.status === 'pending' && taskEtaMins) ? `<br><small class="text-purple" title="Thời gian xử lý ước tính (~30 phút/video)">⏱ ~${taskEtaMins < 60 ? taskEtaMins + 'm' : Math.floor(taskEtaMins/60) + 'h' + (taskEtaMins%60 ? taskEtaMins%60 + 'm' : '')}</small>` : '';

        let timeColHtml = `<div style="color: var(--text-secondary); font-size: 0.8rem;" title="Thời gian tạo">Tạo: ${createdDate}</div>`;
        if (task.status === 'completed' && completedDate) {
            const execBadge = task.executionTime ? `<div class="execution-time-badge" title="Thời gian render thực tế: ${task.executionTime}">⏱️ ${task.executionTime}</div>` : '';
            timeColHtml = `
                <div style="color: #10b981; font-weight: 600; font-size: 0.82rem;" title="Hoàn thành lúc ${completedDate}">✅ Xong: ${completedDate}</div>
                ${execBadge}
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Tạo: ${createdDate}</div>
            `;
        } else if (task.status === 'running') {
            const startedDate = formatTime24(task.startedAt) || createdDate;
            timeColHtml = `
                <div style="color: #f59e0b; font-weight: 600; font-size: 0.82rem;" title="Bắt đầu chạy lúc ${startedDate}">⚡ Chạy: ${startedDate}</div>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Tạo: ${createdDate}</div>
            `;
        } else if (task.status === 'failed') {
            const execBadge = task.executionTime ? `<div class="execution-time-badge" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; border-color: rgba(239, 68, 68, 0.3);" title="Thời gian chạy trước khi lỗi: ${task.executionTime}">⏱️ ${task.executionTime}</div>` : '';
            timeColHtml = `
                <div style="color: #f87171; font-weight: 600; font-size: 0.82rem;">❌ Thất bại</div>
                ${execBadge}
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Tạo: ${createdDate}</div>
            `;
        }

        const creatorHtml = task.creator ? `<div class="creator-tag" title="Người tạo: ${escapeHtml(task.creator)}">👤 ${escapeHtml(task.creator)}</div>` : '';
        const isLongPrompt = task.prompt && (task.prompt.length > 90 || task.prompt.includes('\n'));

        // Credit cost badge for task
        const taskDur = Number(task.duration) || 16;
        const taskRes = task.resolution || '720p';
        const taskHasVid = (Array.isArray(refVideos) && refVideos.length > 0) || (Array.isArray(task.videoPaths) && task.videoPaths.length > 0) || Boolean(task.videoPath);
        let taskRate = 63;
        if (taskRes === '480p') taskRate = taskHasVid ? 17 : 28;
        else if (taskRes === '720p') taskRate = taskHasVid ? 38 : 63;
        else if (taskRes === '1080p') taskRate = taskHasVid ? 68.5 : 114;
        const taskInDur = Number(task.inputVideoDuration || (task.quote && (task.quote.totalInputVideoDuration || task.quote.inputVideoDuration)) || 0);
        const taskCredits = (task.quote && task.quote.credits)
            || (task.billing && task.billing.creditsConsumed)
            || (taskHasVid ? Number((taskRate * (taskDur + taskInDur)).toFixed(2)) : (taskRate * taskDur));

        const creditBadgeHtml = `<span class="credit-mode-badge" style="display:inline-block; margin-top:4px; font-weight:600; font-size:11px; color:#fbbf24; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); border-radius:4px; padding:1px 6px;" title="Chi phí tiêu hao của task">🪙 ${taskCredits} cr</span>`;

        // Nút đổi lượt tạo cho các task pending (Karaoke style)
        let reorderButtonsHtml = '';
        const isDraggable = task.status === 'pending';
        const dragHandleHtml = isDraggable ? `<span class="drag-handle" title="Kéo thả để sắp xếp vị trí hàng chờ">⠿</span> ` : '';

        if (task.status === 'pending') {
            reorderButtonsHtml = `
                <button type="button" class="action-btn-sm priority" onclick="window.moveTaskTop('${task.id}')" title="⭐ Cho lên đầu hàng chờ (Ưu tiên chạy ngay lượt tiếp theo)">⭐ Lên đầu</button>
                <button type="button" class="action-btn-sm move" onclick="window.moveTaskUp('${task.id}')" title="Đẩy lên trước 1 lượt">⬆️</button>
                <button type="button" class="action-btn-sm move" onclick="window.moveTaskDown('${task.id}')" title="Đẩy lùi sau 1 lượt">⬇️</button>
            `;
        }

        return `
            <tr data-task-id="${task.id}" data-status="${task.status}" ${isDraggable ? 'draggable="true" class="draggable-row"' : ''}>
                <td style="white-space: nowrap;">${dragHandleHtml}<strong>${globalIdx + 1}</strong></td>
                <td class="prompt-cell">
                    ${creatorHtml}
                    <div class="prompt-text-wrapper">
                        <span class="prompt-text ${isLongPrompt ? 'collapsed' : ''}" id="prompt-txt-${task.id}" title="${escapeHtml(task.prompt)}">${escapeHtml(task.prompt)}</span>
                        ${isLongPrompt ? `<button type="button" class="btn-toggle-prompt" onclick="window.togglePrompt('${task.id}')">Xem thêm ▾</button>` : ''}
                    </div>
                    <div class="ref-media-container">
                        ${imgTagsHtml}
                        ${videoTagHtml}
                        ${kolTagHtml}
                        ${videoResultHtml}
                    </div>
                </td>
                <td>
                    <div class="config-badge">
                        <span><strong>${task.model || 'Seedance 2.5'}</strong></span>
                        <small>${task.aspectRatio || '16:9'} • ${task.resolution || '720p'}${task.duration ? ' • ' + task.duration : ''}</small>
                    </div>
                    ${creditBadgeHtml}
                </td>
                <td>
                    <span class="task-badge ${task.status}">${task.status.toUpperCase()}</span>
                    ${task.status === 'failed' && task.error?.code ? `<div style="color: #f87171; font-size: 10px; font-weight: 600; margin-top: 3px;" title="${escapeHtml(task.error.message || '')}">[${escapeHtml(task.error.code)}]</div>` : ''}
                </td>
                <td>
                    <small><strong style="${task.status === 'failed' ? 'color:#f87171;' : ''}">${task.progress || 0}%</strong> - ${escapeHtml(getStageLabel(task))}</small>
                    ${task.status === 'running' ? `<div class="progress-bar-bg" style="height: 4px; margin-top: 4px;"><div class="progress-bar-fill" style="width: ${task.progress || 0}%"></div></div>` : ''}
                    ${task.status === 'failed' && task.error?.message ? `
                        <div class="task-err-detail" style="color: #fca5a5; font-size: 11px; margin-top: 3px; line-height: 1.3; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); border-radius: 4px; padding: 2px 5px;" title="${escapeHtml(task.error.message)}">
                            ⚠️ ${escapeHtml(task.error.message)}
                        </div>
                    ` : ''}
                </td>
                <td>
                    ${timeColHtml}
                    ${etaText}
                </td>
                <td class="text-center" style="white-space: nowrap;">
                    ${reorderButtonsHtml}
                    ${(task.outputWebPath || task.videoUrl || task.outputUrl) ? `<a href="${escapeHtml(task.outputWebPath || task.videoUrl || task.outputUrl)}" target="_blank" rel="noreferrer" class="action-btn-sm" style="background-color: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); text-decoration: none; display: inline-block;" title="Xem video">▶️ Xem</a>` : ''}
                    ${(task.outputWebPath || task.videoUrl || task.outputUrl) ? `<a href="${escapeHtml((task.outputWebPath || task.videoUrl || task.outputUrl) + (task.outputWebPath ? '?download=1' : ''))}" download target="_blank" class="action-btn-sm" style="background-color: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); text-decoration: none; display: inline-block; margin-left: 2px;" title="Tải file MP4">⬇️ Tải</a>` : ''}
                    ${(task.status === 'failed' || task.status === 'completed') ? `<button type="button" class="action-btn-sm retry" onclick="window.retryTask('${task.id}')" title="Thử lại task này">↺ Retry</button>` : ''}
                    <button type="button" class="action-btn-sm delete" onclick="window.deleteTask('${task.id}')" title="Xóa task">✕ Xóa</button>
                </td>
            </tr>
        `;
    }).join('');

    // -----------------------------------------------------------------------
    // ACTIVATE IntersectionObserver for all lazy wrappers in this render
    // -----------------------------------------------------------------------
    _ensureMediaObserver();
    el.queueTableBody.querySelectorAll('.ref-lazy-wrap').forEach(wrap => {
        _mediaObserver.observe(wrap);
    });

    // -----------------------------------------------------------------------
    // RENDER PAGINATION BAR
    // -----------------------------------------------------------------------
    if (el.tablePagination) {
        if (totalPages <= 1) {
            el.tablePagination.style.display = 'none';
        } else {
            el.tablePagination.style.display = 'flex';
            const cur = appState.currentPage;
            let html = `<span class="pagination-info">Hiển thị ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filtered.length)} / ${filtered.length} task</span>`;

            // Prev button
            html += `<button class="pagination-btn" ${cur === 1 ? 'disabled' : ''} onclick="window.goToPage(${cur - 1})">‹ Trước</button>`;

            // Page number buttons (show max 7 at a time)
            const maxBtns = 7;
            let startPg = Math.max(1, cur - Math.floor(maxBtns / 2));
            let endPg = Math.min(totalPages, startPg + maxBtns - 1);
            if (endPg - startPg < maxBtns - 1) startPg = Math.max(1, endPg - maxBtns + 1);

            if (startPg > 1) html += `<button class="pagination-btn" onclick="window.goToPage(1)">1</button>${startPg > 2 ? '<span style="color:var(--text-muted);padding:0 4px;">…</span>' : ''}`;
            for (let p = startPg; p <= endPg; p++) {
                html += `<button class="pagination-btn ${p === cur ? 'active' : ''}" onclick="window.goToPage(${p})">${p}</button>`;
            }
            if (endPg < totalPages) html += `${endPg < totalPages - 1 ? '<span style="color:var(--text-muted);padding:0 4px;">…</span>' : ''}<button class="pagination-btn" onclick="window.goToPage(${totalPages})">${totalPages}</button>`;

            // Next button
            html += `<button class="pagination-btn" ${cur === totalPages ? 'disabled' : ''} onclick="window.goToPage(${cur + 1})">Tiếp ›</button>`;

            el.tablePagination.innerHTML = html;
        }
    }

    initTableDragAndDrop();
}

window.goToPage = (page) => {
    appState.currentPage = page;
    renderQueueTable();
    // Scroll bảng lên đầu khi chuyển trang
    el.queueTableBody && el.queueTableBody.closest('.table-container') && el.queueTableBody.closest('.table-container').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

// Khởi tạo tính năng Kéo & Thả (Drag & Drop) sắp xếp hàng chờ
function initTableDragAndDrop() {
    const tbody = el.queueTableBody;
    if (!tbody) return;

    let draggedRow = null;
    let draggedTaskId = null;

    tbody.querySelectorAll('tr.draggable-row').forEach(row => {
        row.addEventListener('dragstart', (e) => {
            // Không kích hoạt kéo khi người dùng click vào nút, link, input hoặc preview media
            if (e.target.closest('button, a, input, select, textarea, .ref-media-item')) {
                e.preventDefault();
                return;
            }
            draggedRow = row;
            draggedTaskId = row.dataset.taskId;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedTaskId);
            row.classList.add('dragging');
        });

        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            tbody.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(r => {
                r.classList.remove('drag-over-top', 'drag-over-bottom');
            });
            draggedRow = null;
            draggedTaskId = null;
        });

        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggedRow || draggedRow === row) return;
            e.dataTransfer.dropEffect = 'move';

            const rect = row.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const isTop = relY < (rect.height / 2);

            tbody.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(r => {
                if (r !== row) r.classList.remove('drag-over-top', 'drag-over-bottom');
            });

            if (isTop) {
                row.classList.add('drag-over-top');
                row.classList.remove('drag-over-bottom');
            } else {
                row.classList.add('drag-over-bottom');
                row.classList.remove('drag-over-top');
            }
        });

        row.addEventListener('dragleave', (e) => {
            if (row.contains(e.relatedTarget)) return;
            row.classList.remove('drag-over-top', 'drag-over-bottom');
        });

        row.addEventListener('drop', async (e) => {
            e.preventDefault();
            row.classList.remove('drag-over-top', 'drag-over-bottom');
            if (!draggedTaskId || draggedTaskId === row.dataset.taskId) return;

            const targetTaskId = row.dataset.taskId;
            const rect = row.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const insertBefore = relY < (rect.height / 2);

            // Tính toán thứ tự mới của các pending tasks
            const pendingTasks = appState.tasks.filter(t => t.status === 'pending');
            const draggedIdx = pendingTasks.findIndex(t => t.id === draggedTaskId);
            const targetIdx = pendingTasks.findIndex(t => t.id === targetTaskId);

            if (draggedIdx === -1 || targetIdx === -1) return;

            const [movedItem] = pendingTasks.splice(draggedIdx, 1);
            let newPos = pendingTasks.findIndex(t => t.id === targetTaskId);
            if (!insertBefore) newPos += 1;
            pendingTasks.splice(newPos, 0, movedItem);

            // Cập nhật appState.tasks tại chỗ (Optimistic UI)
            let pIdx = 0;
            appState.tasks = appState.tasks.map(t => t.status === 'pending' ? pendingTasks[pIdx++] : t);
            renderQueueTable();

            const taskTitle = movedItem.taskName || movedItem.prompt || movedItem.id;
            appendLog({
                level: 'info',
                message: `🔀 Đã đổi thứ tự ưu tiên task "${taskTitle.length > 35 ? taskTitle.slice(0, 35) + '...' : taskTitle}".`
            });

            // Gửi thứ tự mới lên backend
            const allReorderedIds = appState.tasks.map(t => t.id);
            try {
                await fetch('/api/byteplus/queue/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderedIds: allReorderedIds, taskIds: allReorderedIds })
                });
            } catch (err) {
                console.error('Lỗi lưu thứ tự kéo thả:', err);
                appendLog({ level: 'error', message: '❌ Lỗi khi lưu thứ tự ưu tiên task lên server.' });
            }
        });
    });
}

window.togglePrompt = (taskId) => {
    const elPrompt = document.getElementById(`prompt-txt-${taskId}`);
    if (!elPrompt) return;
    const btn = elPrompt.parentElement.querySelector('.btn-toggle-prompt');
    if (elPrompt.classList.contains('expanded')) {
        elPrompt.classList.remove('expanded');
        elPrompt.classList.add('collapsed');
        if (btn) btn.textContent = 'Xem thêm ▾';
    } else {
        elPrompt.classList.remove('collapsed');
        elPrompt.classList.add('expanded');
        if (btn) btn.textContent = 'Thu gọn ▴';
    }
};

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// =========================================================================
// LOGS HANDLING
// =========================================================================
function appendLog(logItem) {
    const timestamp = logItem.timestamp || new Date().toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const msg = logItem.message || '';
    const level = logItem.level || 'info';

    if (el.logsContainer) {
        const div = document.createElement('div');
        div.className = `log-line ${level}`;
        div.textContent = `[${timestamp}] ${msg}`;
        el.logsContainer.appendChild(div);

        if (el.logsContainer.children.length > 500) {
            el.logsContainer.removeChild(el.logsContainer.firstChild);
        }

        if (appState.autoScrollLogs && !el.logsContainer.classList.contains('hidden')) {
            el.logsContainer.scrollTop = el.logsContainer.scrollHeight;
        }
    }
}

if (el.autoscrollToggle) {
    el.autoscrollToggle.addEventListener('change', (e) => {
        appState.autoScrollLogs = e.target.checked;
    });
}

if (el.btnClearLogs) {
    el.btnClearLogs.addEventListener('click', () => {
        if (el.logsContainer) {
            el.logsContainer.innerHTML = '';
        }
    });
}

// =========================================================================
// SINGLE TASK FORM & IMAGE UPLOAD
// =========================================================================
if (el.prompt) {
    el.prompt.addEventListener('input', () => {
        if (el.promptCharCount) {
            el.promptCharCount.textContent = `${el.prompt.value.length} ký tự`;
        }
    });
}

// Quick prompt suggestions
document.querySelectorAll('.quick-prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        const text = chip.dataset.prompt;
        if (text && el.prompt) {
            el.prompt.value = text;
            if (el.promptCharCount) el.promptCharCount.textContent = `${text.length} ký tự`;
            el.prompt.focus();
        }
    });
});

// Application State cho files (Mảng lưu tuần tự theo các lượt tải lên)
appState.selectedImageFiles = [];
appState.selectedVideoFiles = [];

const MAX_MEDIA_LIMIT = 20;

// State cho kéo thả sắp xếp thứ tự media
let mediaDragState = {
    type: null,
    fromIndex: null
};

window.onMediaDragStart = (e, type, index) => {
    mediaDragState.type = type;
    mediaDragState.fromIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${type}:${index}`);
    const item = e.currentTarget.closest('.media-preview-item');
    if (item) item.classList.add('is-dragging');
};

window.onMediaDragOver = (e, type, index) => {
    if (mediaDragState.type !== type) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.currentTarget.closest('.media-preview-item');
    if (!item) return;
    const rect = item.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
        item.classList.add('drag-over-top');
        item.classList.remove('drag-over-bottom');
    } else {
        item.classList.add('drag-over-bottom');
        item.classList.remove('drag-over-top');
    }
};

window.onMediaDragLeave = (e) => {
    const item = e.currentTarget.closest('.media-preview-item');
    if (item) {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
    }
};

window.onMediaDrop = (e, type, targetIndex) => {
    e.preventDefault();
    const item = e.currentTarget.closest('.media-preview-item');
    if (item) {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
    }
    if (mediaDragState.type !== type || mediaDragState.fromIndex === null) return;
    
    const fromIndex = mediaDragState.fromIndex;
    reorderMediaList(type, fromIndex, targetIndex);
    mediaDragState = { type: null, fromIndex: null };
};

window.onMediaDragEnd = (e) => {
    document.querySelectorAll('.media-preview-item').forEach(el => {
        el.classList.remove('is-dragging', 'drag-over-top', 'drag-over-bottom');
    });
    mediaDragState = { type: null, fromIndex: null };
};

window.moveMediaItem = (type, index, direction) => {
    const arr = type === 'image' ? appState.selectedImageFiles : appState.selectedVideoFiles;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= arr.length) return;
    reorderMediaList(type, index, targetIndex);
};

function reorderMediaList(type, fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const arr = type === 'image' ? appState.selectedImageFiles : appState.selectedVideoFiles;
    if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return;
    
    const [movedItem] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, movedItem);
    
    if (type === 'image') {
        renderImageList();
    } else {
        renderVideoList();
    }
}

// =========================================================================
// RENDER DANH SÁCH ẢNH THAM CHIẾU (HỖ TRỢ KÉO THẢ SẮP XẾP THỨ TỰ)
// =========================================================================
function renderImageList() {
    if (!el.imagePreviewList) return;
    const files = appState.selectedImageFiles;

    if (el.imageCounterBadge) {
        if (files.length > 0) {
            el.imageCounterBadge.style.display = 'inline-block';
            el.imageCounterBadge.textContent = `${files.length}/${MAX_MEDIA_LIMIT} ảnh`;
        } else {
            el.imageCounterBadge.style.display = 'none';
        }
    }

    if (files.length === 0) {
        el.imagePreviewList.style.display = 'none';
        el.imagePreviewList.innerHTML = '';
        return;
    }

    el.imagePreviewList.style.display = 'flex';
    let html = `
        <div class="media-list-header">
            <span>📷 ${files.length}/${MAX_MEDIA_LIMIT} ảnh (Kéo thả thẻ để sắp xếp thứ tự 1 ➔ ${files.length})</span>
            <button type="button" class="btn-clear-all-media" onclick="window.clearAllImages()">✕ Xóa tất cả ảnh</button>
        </div>
    `;

    files.forEach((file, idx) => {
        const url = URL.createObjectURL(file);
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        const isFirst = idx === 0;
        const isLast = idx === files.length - 1;
        html += `
            <div class="media-preview-item" 
                 draggable="true" 
                 ondragstart="window.onMediaDragStart(event, 'image', ${idx})"
                 ondragover="window.onMediaDragOver(event, 'image', ${idx})"
                 ondragleave="window.onMediaDragLeave(event)"
                 ondrop="window.onMediaDrop(event, 'image', ${idx})"
                 ondragend="window.onMediaDragEnd(event)">
                <span class="media-drag-handle" title="Kéo thả để đổi thứ tự tải lên">⋮⋮</span>
                <span class="media-order-badge" title="Thứ tự gán tham chiếu: #${idx + 1}">#${idx + 1}</span>
                <img src="${url}" class="media-preview-thumb" alt="thumb">
                <div class="media-preview-details">
                    <span class="media-preview-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                    <span class="media-preview-meta">${sizeMb} MB • Thứ tự #${idx + 1}</span>
                </div>
                <div class="media-reorder-actions">
                    <button type="button" class="btn-move-media" onclick="window.moveMediaItem('image', ${idx}, -1)" ${isFirst ? 'disabled' : ''} title="Đưa lên trên">▲</button>
                    <button type="button" class="btn-move-media" onclick="window.moveMediaItem('image', ${idx}, 1)" ${isLast ? 'disabled' : ''} title="Đưa xuống dưới">▼</button>
                </div>
                <button type="button" class="btn-remove-single-file" onclick="window.removeSingleImage(${idx})" title="Gỡ ảnh này">✕</button>
            </div>
        `;
    });

    el.imagePreviewList.innerHTML = html;
}

window.removeSingleImage = (index) => {
    if (index >= 0 && index < appState.selectedImageFiles.length) {
        appState.selectedImageFiles.splice(index, 1);
        renderImageList();
    }
};

window.clearAllImages = () => {
    appState.selectedImageFiles = [];
    if (el.imageFileInput) el.imageFileInput.value = '';
    renderImageList();
};

function handleSelectedImageFiles(files) {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const validImageFiles = fileList.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name));
    
    if (validImageFiles.length === 0) {
        alert("Vui lòng chọn các file định dạng hình ảnh hợp lệ (PNG, JPG, WEBP)");
        return;
    }

    const currentCount = appState.selectedImageFiles.length;
    const remainingSlots = MAX_MEDIA_LIMIT - currentCount;

    if (remainingSlots <= 0) {
        alert(`Bạn đã đạt giới hạn tối đa ${MAX_MEDIA_LIMIT} ảnh tham chiếu.`);
        if (el.imageFileInput) el.imageFileInput.value = '';
        return;
    }

    const filesToAdd = validImageFiles.slice(0, remainingSlots);
    if (validImageFiles.length > remainingSlots) {
        alert(`Đã nhận ${filesToAdd.length} ảnh (Tối đa ${MAX_MEDIA_LIMIT} ảnh). ${validImageFiles.length - remainingSlots} ảnh vượt quá đã được bỏ qua.`);
    }

    // TÍCH LŨY THÊM TẤT CẢ ẢNH THEO THỨ TỰ CHỌN
    appState.selectedImageFiles.push(...filesToAdd);
    if (el.imageFileInput) el.imageFileInput.value = '';
    renderImageList();
}

// Dropzone Ảnh Tham Chiếu (Hỗ trợ nạp 1 hoặc nhiều ảnh, nhiều lượt)
if (el.imageDropzone && el.imageFileInput) {
    el.imageDropzone.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-clear-all-media') && !e.target.closest('.btn-remove-single-file') && !e.target.closest('.btn-move-media') && !e.target.closest('.media-drag-handle')) {
            if (appState.selectedImageFiles.length >= MAX_MEDIA_LIMIT) {
                alert(`Bạn đã chọn đủ tối đa ${MAX_MEDIA_LIMIT} ảnh.`);
                return;
            }
            el.imageFileInput.click();
        }
    });

    el.imageDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.imageDropzone.classList.add('dragover');
    });

    el.imageDropzone.addEventListener('dragleave', () => {
        el.imageDropzone.classList.remove('dragover');
    });

    el.imageDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        el.imageDropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleSelectedImageFiles(Array.from(e.dataTransfer.files));
        }
    });

    el.imageFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleSelectedImageFiles(Array.from(e.target.files));
        }
    });
}

// =========================================================================
// RENDER DANH SÁCH VIDEO THAM CHIẾU (HỖ TRỢ KÉO THẢ SẮP XẾP THỨ TỰ)
// =========================================================================
function renderVideoList() {
    if (!el.videoPreviewList) return;
    const files = appState.selectedVideoFiles;

    if (el.videoCounterBadge) {
        if (files.length > 0) {
            el.videoCounterBadge.style.display = 'inline-block';
            el.videoCounterBadge.textContent = `${files.length}/${MAX_MEDIA_LIMIT} video`;
        } else {
            el.videoCounterBadge.style.display = 'none';
        }
    }

    if (files.length === 0) {
        el.videoPreviewList.style.display = 'none';
        el.videoPreviewList.innerHTML = '';
        return;
    }

    el.videoPreviewList.style.display = 'flex';
    let html = `
        <div class="media-list-header">
            <span>🎬 ${files.length}/${MAX_MEDIA_LIMIT} video (Kéo thả sắp xếp thứ tự • Luôn gán sau toàn bộ ảnh)</span>
            <button type="button" class="btn-clear-all-media" onclick="window.clearAllVideos()">✕ Xóa tất cả video</button>
        </div>
    `;

    files.forEach((file, idx) => {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        const isFirst = idx === 0;
        const isLast = idx === files.length - 1;
        html += `
            <div class="media-preview-item" 
                 draggable="true" 
                 ondragstart="window.onMediaDragStart(event, 'video', ${idx})"
                 ondragover="window.onMediaDragOver(event, 'video', ${idx})"
                 ondragleave="window.onMediaDragLeave(event)"
                 ondrop="window.onMediaDrop(event, 'video', ${idx})"
                 ondragend="window.onMediaDragEnd(event)">
                <span class="media-drag-handle" title="Kéo thả để đổi thứ tự video tải lên">⋮⋮</span>
                <span class="media-order-badge video-badge" title="Thứ tự video: #${idx + 1} (gán sau ảnh)">#${idx + 1}</span>
                <div class="media-preview-thumb-icon">🎬</div>
                <div class="media-preview-details">
                    <span class="media-preview-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                    <span class="media-preview-meta">${sizeMb} MB • Video #${idx + 1}</span>
                </div>
                <div class="media-reorder-actions">
                    <button type="button" class="btn-move-media" onclick="window.moveMediaItem('video', ${idx}, -1)" ${isFirst ? 'disabled' : ''} title="Đưa lên trên">▲</button>
                    <button type="button" class="btn-move-media" onclick="window.moveMediaItem('video', ${idx}, 1)" ${isLast ? 'disabled' : ''} title="Đưa xuống dưới">▼</button>
                </div>
                <button type="button" class="btn-remove-single-file" onclick="window.removeSingleVideo(${idx})" title="Gỡ video này">✕</button>
            </div>
        `;
    });

    el.videoPreviewList.innerHTML = html;
}

window.removeSingleVideo = (index) => {
    if (index >= 0 && index < appState.selectedVideoFiles.length) {
        appState.selectedVideoFiles.splice(index, 1);
        renderVideoList();
        updateKieCostEstimate();
    }
};

window.clearAllVideos = () => {
    appState.selectedVideoFiles = [];
    if (el.videoFileInput) el.videoFileInput.value = '';
    renderVideoList();
    updateKieCostEstimate();
};

function handleSelectedVideoFiles(files) {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const validVideoFiles = fileList.filter(f => f.type.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(f.name));
    
    if (validVideoFiles.length === 0) {
        alert("Vui lòng chọn file video hợp lệ (MP4, WEBM, MOV, AVI)");
        return;
    }

    const currentCount = appState.selectedVideoFiles.length;
    const remainingSlots = MAX_MEDIA_LIMIT - currentCount;

    if (remainingSlots <= 0) {
        alert(`Bạn đã đạt giới hạn tối đa ${MAX_MEDIA_LIMIT} video tham chiếu.`);
        if (el.videoFileInput) el.videoFileInput.value = '';
        return;
    }

    const filesToAdd = validVideoFiles.slice(0, remainingSlots);
    if (validVideoFiles.length > remainingSlots) {
        alert(`Đã nhận ${filesToAdd.length} video (Tối đa ${MAX_MEDIA_LIMIT} video). ${validVideoFiles.length - remainingSlots} video vượt quá đã được bỏ qua.`);
    }

    // TÍCH LŨY THÊM TẤT CẢ VIDEO THEO THỨ TỰ CHỌN
    appState.selectedVideoFiles.push(...filesToAdd);
    if (el.videoFileInput) el.videoFileInput.value = '';
    renderVideoList();
    updateKieCostEstimate();
}

// Dropzone Video Tham Chiếu (Hỗ trợ nạp 1 hoặc nhiều video, nhiều lượt)
if (el.videoDropzone && el.videoFileInput) {
    el.videoDropzone.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-clear-all-media') && !e.target.closest('.btn-remove-single-file') && !e.target.closest('.btn-move-media') && !e.target.closest('.media-drag-handle')) {
            if (appState.selectedVideoFiles.length >= MAX_MEDIA_LIMIT) {
                alert(`Bạn đã chọn đủ tối đa ${MAX_MEDIA_LIMIT} video.`);
                return;
            }
            el.videoFileInput.click();
        }
    });

    el.videoDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.videoDropzone.classList.add('dragover');
    });

    el.videoDropzone.addEventListener('dragleave', () => {
        el.videoDropzone.classList.remove('dragover');
    });

    el.videoDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        el.videoDropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleSelectedVideoFiles(Array.from(e.dataTransfer.files));
        }
    });

    el.videoFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleSelectedVideoFiles(Array.from(e.target.files));
        }
    });
}

// =========================================================================
// SUBMIT FORM TẠO TASK (ĐẢM BẢO THỨ TỰ ẢNH TRƯỚC - VIDEO CUỐI CÙNG)
// =========================================================================
if (el.singleForm) {
    el.singleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const promptVal = sanitizePrompt(el.prompt.value);
        if (!promptVal) {
            alert("Vui lòng nhập nội dung Prompt mô tả video");
            return;
        }

        const creatorVal = el.creator ? el.creator.value.trim() : '';
        const taskNameVal = el.taskName ? el.taskName.value.trim() : '';
        if (creatorVal) {
            try { localStorage.setItem('hg_creator_name', creatorVal); } catch (e) {}
        }

        const formData = new FormData();
        formData.append('prompt', promptVal);
        if (creatorVal) formData.append('creator', creatorVal);
        if (taskNameVal) formData.append('taskName', taskNameVal);
        formData.append('model', 'Seedance 2.5');
        const durParsed = el.duration ? (parseInt(el.duration.value, 10) || 16) : 16;
        formData.append('duration', durParsed);
        formData.append('aspectRatio', el.aspectRatio ? el.aspectRatio.value : '16:9');
        formData.append('resolution', el.resolution ? el.resolution.value : '720p');

        // Attach selected KOL if any
        const kolSelect = document.getElementById('kol-select');
        if (kolSelect && kolSelect.value) {
            formData.append('kolId', kolSelect.value);
        }

        if (el.imagePath && el.imagePath.value.trim()) {
            formData.append('imagePath', el.imagePath.value.trim());
        }
        if (el.videoPath && el.videoPath.value.trim()) {
            formData.append('videoPath', el.videoPath.value.trim());
        }

        // 1. Đính kèm toàn bộ ẢNH theo ĐÚNG THỨ TỰ FIFO đã tải lên
        if (appState.selectedImageFiles && appState.selectedImageFiles.length > 0) {
            appState.selectedImageFiles.forEach(file => {
                formData.append('images', file);
            });
        }

        // 2. Đính kèm toàn bộ VIDEO theo ĐÚNG THỨ TỰ FIFO đã tải lên (LUÔN GỬI SAU ẢNH)
        if (appState.selectedVideoFiles && appState.selectedVideoFiles.length > 0) {
            appState.selectedVideoFiles.forEach(file => {
                formData.append('videos', file);
            });
        }

        // Gửi tổng thời lượng video đầu vào để backend tính đúng quote 2 chiều
        formData.append('inputVideoDuration', appState.totalInputVideoDuration || 0);

        try {
            const res = await fetch('/api/byteplus/queue/add', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                // Reset Form (giữ lại creator name cho lần sau)
                el.prompt.value = '';
                if (el.imagePath) el.imagePath.value = '';
                if (el.videoPath) el.videoPath.value = '';
                if (el.promptCharCount) el.promptCharCount.textContent = '0 ký tự';
                
                // Dọn sạch danh sách file đã chọn
                appState.selectedImageFiles = [];
                appState.selectedVideoFiles = [];
                appState.totalInputVideoDuration = 0;
                renderImageList();
                renderVideoList();
                updateKieCostEstimate();
            } else {
                const err = await res.json();
                alert(`Lỗi thêm task: ${err.error || 'Không xác định'}`);
            }
        } catch (err) {
            alert(`Lỗi kết nối tới server: ${err.message}`);
        }
    });
}

// =========================================================================
// BULK TASK IMPORT
// =========================================================================
// PROMPT SANITIZATION & BULK TASK IMPORT
// =========================================================================
function sanitizePrompt(text) {
    if (!text || typeof text !== 'string') return '';
    // Mặc kệ xuống dòng (chuyển \r, \n thành khoảng trắng để prompt dài không bị ngắt quãng)
    let cleaned = text.replace(/[\r\n]+/g, ' ');
    // Tự động bỏ ký tự đặc biệt TRỪ các ký tự: ( ) , @ " .
    cleaned = cleaned.replace(/[^\p{L}\p{N}\s(),@".]/gu, '');
    // Chuẩn hóa khoảng trắng liên tiếp
    return cleaned.replace(/\s+/g, ' ').trim();
}

if (el.bulkText) {
    el.bulkText.addEventListener('input', () => {
        updateBulkPreview();
    });
}

function parseBulkText(rawText) {
    if (!rawText || !rawText.trim()) return [];
    const text = rawText.trim();

    // 1. Thử parse JSON Array
    if (text.startsWith('[') && text.endsWith(']')) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                return parsed.map(item => {
                    const rawP = typeof item === 'string' ? item : (item && item.prompt ? item.prompt : '');
                    const cleanP = sanitizePrompt(rawP);
                    if (!cleanP) return null;
                    if (typeof item === 'object') {
                        return { ...item, prompt: cleanP };
                    }
                    return { prompt: cleanP };
                }).filter(Boolean);
            }
        } catch (e) {}
    }

    // 2. Phân tách theo dấu phân cách rõ ràng: '---' hoặc '==='
    if (/^---+$/m.test(text) || /^===+$/m.test(text)) {
        const blocks = text.split(/\n\s*[-=]{3,}\s*\n/);
        const results = [];
        for (const b of blocks) {
            const cleanP = sanitizePrompt(b);
            if (cleanP) results.push({ prompt: cleanP });
        }
        if (results.length > 0) return results;
    }

    // 3. Phân tách theo tiền tố đánh số (Prompt 1:, Task 1:, #1:, 1., ...)
    if (/(?:^|\n)(?:Prompt\s*\d+:|Task\s*\d+:|#\d+:|\d+[\.\)])\s+/i.test(text)) {
        const blocks = text.split(/(?:^|\n)(?:Prompt\s*\d+:|Task\s*\d+:|#\d+:|\d+[\.\)])\s+/i).filter(Boolean);
        const results = [];
        for (const b of blocks) {
            const cleanP = sanitizePrompt(b);
            if (cleanP) results.push({ prompt: cleanP });
        }
        if (results.length > 0) return results;
    }

    // 4. Phân tách theo 2 dấu xuống dòng liên tiếp (đoạn văn bản trống ngăn cách giữa các prompt)
    if (/\n\s*\n+/.test(text)) {
        const paragraphs = text.split(/\n\s*\n+/);
        const results = [];
        for (const p of paragraphs) {
            const cleanP = sanitizePrompt(p);
            if (cleanP) results.push({ prompt: cleanP });
        }
        if (results.length > 0) return results;
    }

    // 5. Nếu chỉ có các dòng đơn lẻ hoặc 1 prompt dài nhiều dòng: gộp lại thành 1 prompt chuẩn
    const cleanSingle = sanitizePrompt(text);
    return cleanSingle ? [{ prompt: cleanSingle }] : [];
}

function updateBulkPreview() {
    if (!el.bulkText || !el.bulkPreviewBox || !el.bulkDetectedCount || !el.bulkPreviewList) return;
    const parsed = parseBulkText(el.bulkText.value);

    if (parsed.length === 0) {
        el.bulkPreviewBox.style.display = 'none';
        return;
    }

    el.bulkPreviewBox.style.display = 'block';
    el.bulkDetectedCount.textContent = parsed.length;

    el.bulkPreviewList.innerHTML = parsed.slice(0, 5).map((p, i) => `
        <div class="preview-item">
            #${i + 1}: ${escapeHtml(p.prompt.slice(0, 70))}${p.prompt.length > 70 ? '...' : ''}
        </div>
    `).join('') + (parsed.length > 5 ? `<small class="text-muted">... và ${parsed.length - 5} task khác</small>` : '');
}

if (el.btnBulkImport) {
    el.btnBulkImport.addEventListener('click', async () => {
        const parsedPrompts = parseBulkText(el.bulkText ? el.bulkText.value : '');
        if (parsedPrompts.length === 0) {
            alert("Vui lòng nhập danh sách Prompt hợp lệ");
            return;
        }

        const savedCreator = (typeof localStorage !== 'undefined' && localStorage.getItem('hg_creator_name')) || '';
        const bulkCreatorVal = (el.bulkCreator ? el.bulkCreator.value.trim() : '')
            || (el.creator ? el.creator.value.trim() : '')
            || savedCreator
            || 'Người dùng';
        const bulkTaskNameVal = (el.bulkTaskName ? el.bulkTaskName.value.trim() : '')
            || (el.taskName ? el.taskName.value.trim() : '')
            || 'Bulk Task';

        if (bulkCreatorVal) {
            try { localStorage.setItem('hg_creator_name', bulkCreatorVal); } catch (e) {}
        }

        const options = {
            creator: bulkCreatorVal,
            taskName: bulkTaskNameVal,
            model: 'Seedance 2.5',
            duration: el.bulkDuration ? (parseInt(el.bulkDuration.value, 10) || 16) : 16,
            aspectRatio: el.bulkAspectRatio ? el.bulkAspectRatio.value : '16:9',
            resolution: el.bulkResolution ? el.bulkResolution.value : '720p'
        };

        try {
            const res = await fetch('/api/byteplus/queue/bulk-add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompts: parsedPrompts, options })
            });

            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                if (data.created === 0 && data.failed && data.failed.length > 0) {
                    alert(`Không tạo được task nào: ${data.failed[0]?.reason || 'Lỗi không xác định'}`);
                    return;
                }
                if (el.bulkText) el.bulkText.value = '';
                updateBulkPreview();
                // Chuyển sang xem danh sách queue
                const firstTabBtn = document.getElementById('tab-btn-single');
                if (firstTabBtn) firstTabBtn.click();
            } else {
                alert(`Lỗi import: ${data.error || 'Không xác định'}`);
            }
        } catch (err) {
            alert(`Lỗi kết nối tới server: ${err.message}`);
        }
    });
}

// =========================================================================
// QUEUE CONTROL BUTTONS
// =========================================================================
if (el.btnStart) el.btnStart.addEventListener('click', () => {
    if (appState.isPaused) {
        sendControl('resume');
    } else {
        sendControl('start');
    }
});

if (el.btnPause) el.btnPause.addEventListener('click', () => {
    if (appState.isPaused) {
        sendControl('resume');
    } else {
        sendControl('pause');
    }
});

if (el.btnStop) el.btnStop.addEventListener('click', () => sendControl('stop'));

async function sendControl(action) {
    try {
        await fetch('/api/byteplus/queue/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
    } catch (err) {
        console.error('Lỗi gửi lệnh điều khiển queue:', err);
    }
}

// Global action callbacks cho bảng
window.deleteTask = async (id) => {
    try {
        await fetch(`/api/byteplus/tasks/${id}`, { method: 'DELETE' });
        // Optimistic UI
        appState.tasks = appState.tasks.filter(t => t.id !== id);
        appState.stats = calculateStats(appState.tasks);
        updateUI();
    } catch (err) {
        console.error('Lỗi xóa task:', err);
    }
};

window.retryTask = async (id) => {
    try {
        await fetch(`/api/byteplus/tasks/${id}/retry`, { method: 'POST' });
    } catch (err) {
        console.error('Lỗi retry task:', err);
    }
};

// Đổi lượt tạo: Cho lên đầu danh sách chờ
window.moveTaskTop = async (id) => {
    const pendingTasks = appState.tasks.filter(t => t.status === 'pending');
    const idx = pendingTasks.findIndex(t => t.id === id);
    if (idx > 0) {
        const [item] = pendingTasks.splice(idx, 1);
        pendingTasks.unshift(item);
        let pIdx = 0;
        appState.tasks = appState.tasks.map(t => t.status === 'pending' ? pendingTasks[pIdx++] : t);
        renderQueueTable();
        const taskTitle = item.taskName || item.prompt || id;
        appendLog({
            level: 'info',
            message: `⭐ Đã ưu tiên task "${taskTitle.length > 35 ? taskTitle.slice(0, 35) + '...' : taskTitle}" lên đầu hàng chờ.`
        });
    }
    try {
        await fetch(`/api/byteplus/tasks/${id}/move-top`, { method: 'POST' });
    } catch (err) {
        console.error('Lỗi ưu tiên task lên đầu:', err);
    }
};

// Đổi lượt tạo: Đẩy lên trước 1 bậc
window.moveTaskUp = async (id) => {
    const pendingTasks = appState.tasks.filter(t => t.status === 'pending');
    const idx = pendingTasks.findIndex(t => t.id === id);
    if (idx > 0) {
        const [item] = pendingTasks.splice(idx, 1);
        pendingTasks.splice(idx - 1, 0, item);
        let pIdx = 0;
        appState.tasks = appState.tasks.map(t => t.status === 'pending' ? pendingTasks[pIdx++] : t);
        renderQueueTable();
    }
    try {
        await fetch(`/api/byteplus/tasks/${id}/move-up`, { method: 'POST' });
    } catch (err) {
        console.error('Lỗi đẩy task lên:', err);
    }
};

// Đổi lượt tạo: Đẩy lùi sau 1 bậc
window.moveTaskDown = async (id) => {
    const pendingTasks = appState.tasks.filter(t => t.status === 'pending');
    const idx = pendingTasks.findIndex(t => t.id === id);
    if (idx !== -1 && idx < pendingTasks.length - 1) {
        const [item] = pendingTasks.splice(idx, 1);
        pendingTasks.splice(idx + 1, 0, item);
        let pIdx = 0;
        appState.tasks = appState.tasks.map(t => t.status === 'pending' ? pendingTasks[pIdx++] : t);
        renderQueueTable();
    }
    try {
        await fetch(`/api/byteplus/tasks/${id}/move-down`, { method: 'POST' });
    } catch (err) {
        console.error('Lỗi đẩy task xuống:', err);
    }
};

// =========================================================================
// MEDIA LIGHTBOX / PREVIEW MODAL
// =========================================================================
window.openMediaModal = (url, type, title) => {
    const modal = document.getElementById('media-preview-modal');
    const modalTitle = document.getElementById('media-modal-title');
    const modalBody = document.getElementById('media-modal-body');
    if (!modal || !modalBody) return;

    if (modalTitle) modalTitle.textContent = title || 'Xem trước file';

    if (type === 'video') {
        modalBody.innerHTML = `
            <video src="${escapeHtml(url)}" controls autoplay playsinline style="max-width: 80vw; max-height: 75vh; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                Trình duyệt của bạn không hỗ trợ phát video.
            </video>
        `;
    } else {
        modalBody.innerHTML = `
            <img src="${escapeHtml(url)}" alt="Xem trước" style="max-width: 80vw; max-height: 75vh; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        `;
    }

    modal.classList.add('active');
};

window.closeMediaModal = (e) => {
    if (e && e.target && e.target.closest('.media-modal-content')) return;
    const modal = document.getElementById('media-preview-modal');
    const modalBody = document.getElementById('media-modal-body');
    if (modal) modal.classList.remove('active');
    if (modalBody) {
        const vid = modalBody.querySelector('video');
        if (vid) vid.pause();
        modalBody.innerHTML = '';
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeMediaModal();
    }
});

// =========================================================================
// SEARCH & FILTER
// =========================================================================
if (el.tableSearch) {
    el.tableSearch.addEventListener('input', (e) => {
        appState.searchQuery = e.target.value;
        appState.currentPage = 1;
        renderQueueTable();
    });
}

el.filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
        el.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        appState.activeFilter = chip.dataset.filter || 'all';
        appState.currentPage = 1;
        renderQueueTable();
    });
});

// Khôi phục tên người tạo đã lưu gần nhất
try {
    const savedCreator = localStorage.getItem('hg_creator_name');
    if (savedCreator) {
        if (el.creator) el.creator.value = savedCreator;
        if (el.bulkCreator) el.bulkCreator.value = savedCreator;
    }
} catch (e) {}

// =========================================================================
// INITIAL DATA FETCH & HEALTHCHECK
// =========================================================================
async function fetchInitialQueue() {
    try {
        const res = await fetch('/api/byteplus/queue');
        if (res.ok) {
            const data = await res.json();
            appState.isRunning = data.isRunning !== undefined ? data.isRunning : (data.control && data.control.running);
            appState.isPaused = data.isPaused !== undefined ? data.isPaused : (data.control && data.control.paused);
            appState.currentTaskId = data.currentTaskId;
            appState.currentTask = data.currentTask || null;
            appState.tasks = data.queue || data.tasks || [];
            appState.stats = calculateStats(appState.tasks);
            updateUI();
        }
    } catch (e) {
        console.warn("Không thể tải trạng thái queue ban đầu:", e.message);
    }
}

async function fetchLanInfo() {
    try {
        const res = await fetch('/api/lan-info');
        if (res.ok) {
            const data = await res.json();
            const lanPill = document.getElementById('lan-pill');
            const lanText = document.getElementById('lan-text');
            if (lanText && data.lanUrl) {
                lanText.textContent = '🌐 LAN: ' + data.primaryLanIP + ':' + data.port + ' (Click Copy)';
                if (lanPill) {
                    const studioUrl = data.lanUrl + '/0013';
                    lanPill.title = 'Nhấp để copy link truy cập LAN: ' + studioUrl;
                    lanPill.onclick = () => {
                        navigator.clipboard.writeText(studioUrl).then(() => {
                            const original = lanText.textContent;
                            lanText.textContent = '✅ Đã copy link: ' + studioUrl;
                            setTimeout(() => { lanText.textContent = original; }, 2500);
                        }).catch(() => {
                            prompt("Sao chép đường dẫn mạng LAN:", studioUrl);
                        });
                    };
                }
            }
        }
    } catch (e) {}
}

// Khởi tạo chạy ngay khi load trang
fetchInitialQueue();
fetchLanInfo();
loadKolsList();


// =====================================
// USAGE ACCOUNTING (REAL KIE BALANCE & USAGE)
// =====================================
async function loadUsageSummary() {
    try {
        const res = await fetch('/api/byteplus/account/credits');
        const data = await res.json();
        
        // 1. Update Real Kie Balance (NEVER fabricated)
        const balanceEl = document.getElementById('usage-balance');
        const balanceUsdEl = document.getElementById('usage-balance-usd');
        const cliBalanceEl = document.getElementById('credit-balance-val');
        
        const balNum = Number(data.balance ?? data.credits);
        if (data.configured === false || data.isConfigured === false) {
            if (balanceEl) balanceEl.textContent = 'Chưa cấu hình KIE_API_KEY';
            if (balanceUsdEl) balanceUsdEl.textContent = '-- USD';
            if (cliBalanceEl) cliBalanceEl.textContent = 'No Key';
            if (el.statCredits) el.statCredits.textContent = 'No Key';
        } else if (Number.isFinite(balNum)) {
            const balStr = `${balNum.toLocaleString('vi-VN')} cr`;
            const balUsd = Number(data.usd ?? (balNum * 0.005).toFixed(2));
            const balUsdStr = `$${balUsd.toFixed(2)} USD`;
            if (balanceEl) balanceEl.textContent = balStr;
            if (balanceUsdEl) balanceUsdEl.textContent = balUsdStr;
            if (cliBalanceEl) cliBalanceEl.textContent = `${balNum.toLocaleString('vi-VN')} credits`;
            if (el.statCredits) el.statCredits.textContent = balNum.toLocaleString('vi-VN');
            appCreditState.balance = balNum;
        } else {
            if (balanceEl) balanceEl.textContent = 'Không lấy được số dư';
            if (balanceUsdEl) balanceUsdEl.textContent = '-- USD';
            if (cliBalanceEl) cliBalanceEl.textContent = 'N/A';
        }

        // 2. Update Total Actual Consumed
        if (data.usageSummary) {
            const sum = data.usageSummary;
            const consumedEl = document.getElementById('usage-total-consumed');
            const consumedUsdEl = document.getElementById('usage-total-consumed-usd');
            
            // Tính tổng tiêu hao từ danh sách bản ghi
            let totalActualCredits = 0;
            let totalEstCompletedCredits = 0;
            if (Array.isArray(sum.records)) {
                for (const r of sum.records) {
                    if (r.actualCredits !== null && r.actualCredits !== undefined && Number.isFinite(Number(r.actualCredits))) {
                        totalActualCredits += Number(r.actualCredits);
                    }
                    if (r.status === 'completed') {
                        const est = (r.estimatedCredits != null && Number.isFinite(Number(r.estimatedCredits)))
                            ? Number(r.estimatedCredits)
                            : 0;
                        totalEstCompletedCredits += (r.actualCredits !== null && Number.isFinite(Number(r.actualCredits)))
                            ? Number(r.actualCredits)
                            : est;
                    }
                }
            }

            const finalConsumed = (sum.totalConsumed && sum.totalConsumed > 0)
                ? sum.totalConsumed
                : (totalActualCredits > 0 ? totalActualCredits : totalEstCompletedCredits);
            const isEst = (!sum.totalConsumed || sum.totalConsumed === 0) && totalActualCredits === 0 && totalEstCompletedCredits > 0;
            const finalUsd = (sum.totalUsd && sum.totalUsd > 0 && !isEst)
                ? sum.totalUsd
                : Number((finalConsumed * 0.005).toFixed(2));

            if (consumedEl) consumedEl.textContent = `${finalConsumed.toLocaleString('vi-VN')} cr`;
            if (consumedUsdEl) consumedUsdEl.textContent = `$${Number(finalUsd).toFixed(2)} USD${isEst ? ' (ước tính)' : ''}`;
            
            // 3. Render 13 Columns Table
            const tbody = document.getElementById('usage-table-body');
            if (tbody) {
                tbody.innerHTML = '';
                if (!sum.records || sum.records.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="13" class="text-center" style="padding: 24px; color: #94a3b8; text-align: center;">Chưa có dữ liệu usage.</td></tr>';
                } else {
                    for (const r of sum.records) {
                        const tr = document.createElement('tr');
                        
                        // Time formatting
                        let timeStr = '-';
                        if (r.time) {
                            try {
                                const d = new Date(r.time);
                                timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
                            } catch(e) {
                                timeStr = r.time;
                            }
                        }
                        
                        // Status badge class
                        const statusClass = r.status === 'completed' ? 'success' : (r.status === 'failed' ? 'failed' : 'pending');

                        // Rate calculation fallback
                        const outDur = Number(r.outputDuration) || 4;
                        const inDur = Number(r.inputVideoDuration) || 0;
                        const res = r.resolution || '720p';
                        let defaultRate = 63;
                        if (res === '480p') defaultRate = inDur > 0 ? 17 : 28;
                        else if (res === '720p') defaultRate = inDur > 0 ? 38 : 63;
                        else if (res === '1080p') defaultRate = inDur > 0 ? 68.5 : 114;
                        const calcCredits = Number(((inDur * defaultRate) + (outDur * defaultRate)).toFixed(2));
                        const calcUsd = Number((calcCredits * 0.005).toFixed(4));

                        const estCredits = (r.estimatedCredits != null && Number.isFinite(Number(r.estimatedCredits)))
                            ? Number(r.estimatedCredits)
                            : calcCredits;
                            
                        const estUsd = (r.estimatedUsd != null && Number.isFinite(Number(r.estimatedUsd)))
                            ? Number(r.estimatedUsd)
                            : calcUsd;

                        // Tiêu hao thực tế (Actual Credits) cho từng task
                        let actualCreditsStr = '';
                        let actualUsdStr = '';

                        if (r.actualCredits !== null && r.actualCredits !== undefined && Number.isFinite(Number(r.actualCredits))) {
                            const actCr = Number(r.actualCredits);
                            const actU = (r.actualUsd !== null && r.actualUsd !== undefined && Number.isFinite(Number(r.actualUsd)))
                                ? Number(r.actualUsd)
                                : Number((actCr * 0.005).toFixed(4));
                            actualCreditsStr = `<span style="color: #f87171; font-weight: 700;">-${actCr.toLocaleString('vi-VN')} cr</span>`;
                            actualUsdStr = `<span style="color: #f87171; font-weight: 500;">-$${actU.toFixed(3)}</span>`;
                        } else if (r.status === 'completed') {
                            // Task completed nhưng chưa có Kie billing trực tiếp -> hiển thị theo định mức tiêu hao
                            actualCreditsStr = `<span style="color: #f87171; font-weight: 700;">-${estCredits.toLocaleString('vi-VN')} cr</span> <small style="color: #94a3b8; font-size: 10px;">(ước tính)</small>`;
                            actualUsdStr = `<span style="color: #f87171; font-weight: 500;">-$${estUsd.toFixed(3)}</span>`;
                        } else if (r.status === 'running') {
                            actualCreditsStr = `<span style="color: #38bdf8; font-weight: 600;">~${estCredits.toLocaleString('vi-VN')} cr</span> <small style="color: #38bdf8; font-size: 10px;">(đang chạy)</small>`;
                            actualUsdStr = `<span style="color: #38bdf8;">~$${estUsd.toFixed(3)}</span>`;
                        } else if (r.status === 'pending') {
                            actualCreditsStr = `<span style="color: #fbbf24; font-weight: 500;">~${estCredits.toLocaleString('vi-VN')} cr</span> <small style="color: #fbbf24; font-size: 10px;">(dự kiến)</small>`;
                            actualUsdStr = `<span style="color: #fbbf24;">~$${estUsd.toFixed(3)}</span>`;
                        } else {
                            actualCreditsStr = `<span style="color: #64748b;">0 cr</span> <small style="color: #64748b; font-size: 10px;">(lỗi)</small>`;
                            actualUsdStr = `<span style="color: #64748b;">$0.000</span>`;
                        }

                        const estCreditsStr = `<span style="color: #fbbf24; font-weight: 600;">${estCredits.toLocaleString('vi-VN')} cr</span>`;
                        const estUsdStr = `<span style="color: #34d399;">$${estUsd.toFixed(3)}</span>`;

                        tr.innerHTML = `
                            <td style="color: #94a3b8; font-size: 11px;">${timeStr}</td>
                            <td><strong>${escapeHtml(r.taskName || '-')}</strong></td>
                            <td>${actualCreditsStr}</td>
                            <td>${estCreditsStr}</td>
                            <td>${actualUsdStr}</td>
                            <td>${estUsdStr}</td>
                            <td>${escapeHtml(r.creator || '-')}</td>
                            <td>${r.resolution || '-'}</td>
                            <td>${r.outputDuration != null ? r.outputDuration + 's' : '-'}</td>
                            <td>${r.inputVideoDuration != null ? r.inputVideoDuration + 's' : '0s'}</td>
                            <td>${r.model || 'Seedance 2.5'}</td>
                            <td><code>${r.taskId || '-'}</code></td>
                            <td><span class="task-badge ${statusClass}" style="font-size: 10px; padding: 2px 6px;">${r.status || 'unknown'}</span></td>
                        `;
                        tbody.appendChild(tr);
                    }
                }
            }
        }
    } catch(err) {
        console.error('Lỗi tải usage:', err);
    }
}

// Tab được ẩn/hiện bằng class .tab-content.active qua handler .tab-btn chung ở trên.
// KHÔNG dùng inline style.display ở đây — inline style đè lên class và từng
// gây lỗi trắng UI khi quay lại tab Task Đơn Lẻ / Import Hàng Loạt.
document.getElementById('tab-btn-usage')?.addEventListener('click', () => {
    loadUsageSummary();
});

// Refresh button with visual spin animation
document.getElementById('btn-refresh-usage')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-usage');
    if (btn) {
        btn.style.transition = 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        btn.style.transform = 'rotate(360deg)';
    }
    await Promise.all([loadUsageSummary(), refreshCreditBalance()]);
    setTimeout(() => {
        if (btn) {
            btn.style.transition = 'none';
            btn.style.transform = 'none';
        }
    }, 600);
});

// Initial load
setTimeout(loadUsageSummary, 300);


// =========================================================================
// THƯ VIỆN KOL ẢO (LOAD, TẠO MỚI, CHỌN NHÂN VẬT)
// =========================================================================
let cachedKols = [];

async function loadKolsList() {
    try {
        const res = await fetch('/api/byteplus/kols');
        if (res.ok) {
            const data = await res.json();
            cachedKols = data.kols || [];
            // Re-render table nếu đã có tasks để KOL hiển thị avatar/thumbnail ngay
            if (appState && appState.tasks && appState.tasks.length > 0) {
                renderQueueTable();
            }
        }
    } catch (e) {
        console.warn('Không thể tải danh sách KOL:', e);
    }
    const kolSelect = document.getElementById('kol-select');
    if (kolSelect) {
        kolSelect.innerHTML = '<option value="">-- Không chọn nhân vật KOL --</option>' +
            cachedKols.map(k => '<option value="' + escapeHtml(k.id) + '">' + escapeHtml(k.displayName) + (k.description ? ' (' + escapeHtml(k.description) + ')' : '') + '</option>').join('');
    }
}

function initKolControls() {
    const btnAddKol = document.getElementById('btn-add-new-kol');
    const btnCloseKol = document.getElementById('btn-close-new-kol');
    const newKolForm = document.getElementById('new-kol-form');
    const btnSaveKol = document.getElementById('btn-save-kol');
    const kolSelect = document.getElementById('kol-select');
    const kolThumbPreview = document.getElementById('kol-thumb-preview');
    const kolThumbImg = document.getElementById('kol-thumb-img');

    if (btnAddKol && newKolForm) {
        btnAddKol.addEventListener('click', () => {
            newKolForm.style.display = newKolForm.style.display === 'none' ? 'block' : 'none';
        });
    }

    if (btnCloseKol && newKolForm) {
        btnCloseKol.addEventListener('click', () => {
            newKolForm.style.display = 'none';
        });
    }

    if (kolSelect && kolThumbPreview && kolThumbImg) {
        kolSelect.addEventListener('change', () => {
            const selected = cachedKols.find(k => k.id === kolSelect.value);
            if (selected && selected.thumbnailUrl) {
                kolThumbImg.src = selected.thumbnailUrl;
                kolThumbPreview.style.display = 'block';
            } else {
                kolThumbPreview.style.display = 'none';
            }
        });
    }

    if (btnSaveKol) {
        btnSaveKol.addEventListener('click', async () => {
            const nameInput = document.getElementById('new-kol-name');
            const descInput = document.getElementById('new-kol-desc');
            const fileInput = document.getElementById('new-kol-file');

            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) {
                alert('Vui lòng nhập tên cho nhân vật KOL');
                return;
            }

            const formData = new FormData();
            formData.append('displayName', name);
            if (descInput && descInput.value.trim()) formData.append('description', descInput.value.trim());
            if (fileInput && fileInput.files && fileInput.files[0]) {
                formData.append('file', fileInput.files[0]);
            }

            btnSaveKol.disabled = true;
            btnSaveKol.textContent = '⏳ Đang lưu...';

            try {
                const res = await fetch('/api/byteplus/kols', {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    const data = await res.json();
                    alert('Đã lưu nhân vật KOL "' + name + '" vào thư viện!');
                    if (nameInput) nameInput.value = '';
                    if (descInput) descInput.value = '';
                    if (fileInput) fileInput.value = '';
                    if (newKolForm) newKolForm.style.display = 'none';
                    await loadKolsList();
                    if (kolSelect && data.kol) {
                        kolSelect.value = data.kol.id;
                        kolSelect.dispatchEvent(new Event('change'));
                    }
                } else {
                    const err = await res.json();
                    alert('Lỗi tạo KOL: ' + (err.error || 'Không xác định'));
                }
            } catch (err) {
                alert('Lỗi kết nối tới server: ' + err.message);
            } finally {
                btnSaveKol.disabled = false;
                btnSaveKol.textContent = '💾 Lưu Vào Thư Viện KOL';
            }
        });
    }

    loadKolsList();
}

// Gọi khi document sẵn sàng
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKolControls);
} else {
    initKolControls();
}
