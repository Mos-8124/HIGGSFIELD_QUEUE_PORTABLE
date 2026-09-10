/**
 * byteplus/index.js
 *
 * Diem lap rap duy nhat cua he thong GTF Video AI Automation V2.
 * server.js chi can goi createByteplusSubsystem() va gan router + socket.
 *
 * Khong import bat ky module nao cua he thong Higgsfield cu.
 */
import { config, isMock, providerStatus } from './config.js';
import { ensureDir } from './store.js';
import { MockSeedanceProvider } from './providers/mock_generation_provider.js';
import { BytePlusGenerationProvider } from './providers/byteplus_generation_provider.js';
import { OpenRouterSeedanceProvider } from './providers/openrouter_seedance_provider.js';
import { KieSeedanceProvider } from './providers/kie_seedance_provider.js';
import { KieFileStorageProvider } from './providers/kie_file_provider.js';
import { MockTosProvider } from './storage/mock_tos_provider.js';
import { BytePlusTosStorageProvider, TosStorageProvider } from './storage/tos_provider.js';
import { MockLasAssetProvider } from './assets/mock_las_provider.js';
import { LasAssetLibraryProvider } from './assets/las_asset_provider.js';
import { LocalKolAssetProvider } from './assets/local_kol_asset_provider.js';
import { KolLibrary } from './kol_library.js';
import { ByteplusQueueManager } from './queue_manager.js';
import { createByteplusRouter } from './routes.js';
import { socketToken, tokenMatches } from './auth.js';

export function createByteplusSubsystem({
    provider: customProvider,
    tosProvider: customTosProvider,
    assetProvider: customAssetProvider,
    log = () => {}
} = {}) {
    ensureDir(config.uploadsDir);
    ensureDir(config.outputsDir);

    const mock = isMock();
    const isKie = config.provider === 'kie';

    // Chi khoi tao dung bo provider cua che do dang chay.
    // O che do kie: KHONG khoi tao ModelArk, KHONG khoi tao TOS, KHONG khoi tao LAS.
    let defaultProvider;
    let defaultStorage;
    let defaultAssets;
    if (mock) {
        defaultProvider = new MockSeedanceProvider();
        defaultStorage  = new MockTosProvider();
        defaultAssets   = new MockLasAssetProvider();
    } else if (isKie) {
        defaultProvider = new KieSeedanceProvider();
        defaultStorage  = new KieFileStorageProvider();
        defaultAssets   = new LocalKolAssetProvider();
    } else if (config.provider === 'openrouter') {
        defaultProvider = new OpenRouterSeedanceProvider();
        defaultStorage  = new BytePlusTosStorageProvider();
        defaultAssets   = new LasAssetLibraryProvider();
    } else {
        defaultProvider = new BytePlusGenerationProvider();
        defaultStorage  = new BytePlusTosStorageProvider();
        defaultAssets   = new LasAssetLibraryProvider();
    }
    const provider      = customProvider || defaultProvider;
    const tosProvider   = customTosProvider || defaultStorage;
    const assetProvider = customAssetProvider || defaultAssets;

    const kols  = new KolLibrary({ assetProvider });
    const queue = new ByteplusQueueManager({ provider, tosProvider, assetProvider, kolLibrary: kols });

    const notes = queue.recover();
    for (const n of notes) {
        if (n.action === 'requeued') {
            log('info', 'Task ' + n.taskId + ' chua gui len provider -> tra ve hang cho.');
        } else {
            log('info', 'Task ' + n.taskId + ' da co providerTaskId ' + n.providerTaskId + ' -> noi lai, KHONG gui lai.');
        }
    }

    const router = createByteplusRouter({ queue, kols });

    return { queue, kols, provider, tosProvider, assetProvider, router, config, providerStatus, recoveryNotes: notes };
}

/**
 * Gan Socket.IO namespace rieng '/byteplus'.
 * Namespace rieng nen client cu cua Higgsfield khong bao gio nhan su kien nay.
 */
export function attachByteplusSockets(io, subsystem) {
    const nsp = io.of('/byteplus');
    nsp.use((socket, next) => {
        if (tokenMatches(socketToken(socket))) return next();
        const err = new Error('Unauthorized');
        err.data = { code: 'HQ_API_TOKEN_REQUIRED' };
        next(err);
    });
    const { queue, kols } = subsystem;

    const pushQueue = () => nsp.emit('byteplus:queue-updated', queue.snapshot());
    const pushStats = () => nsp.emit('byteplus:stats-updated', queue.stats());

    let pending = null;
    const throttledQueue = () => {
        if (pending) return;
        pending = setTimeout(() => { pending = null; pushQueue(); pushStats(); }, 120);
        if (pending.unref) pending.unref();
    };

    const emitLog = (level, message) => {
        const now = new Date();
        const date = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const item = { timestamp: `${date} ${time}`, level, message, source: 'byteplus' };
        nsp.emit('byteplus:log', item);
        try { io.emit('log', item); } catch (e) {}
    };

    queue.on('queue-updated', throttledQueue);
    queue.on('queue-started', () => emitLog('success', '▶️ Đã KÍCH HOẠT chạy Hàng chờ.'));
    queue.on('queue-paused', () => emitLog('warning', '⏸️ Đã TẠM DỪNG Hàng chờ.'));
    queue.on('queue-resumed', () => emitLog('info', '▶️ Hàng chờ đang tiếp tục xử lý.'));
    queue.on('queue-stopped', () => emitLog('warning', '⏹️ Đã DỪNG Hàng chờ và hủy task đang thực thi.'));
    queue.on('queue-cleared', n => emitLog('info', `🧹 Đã dọn dẹp ${n} task đã hoàn thành.`));

    queue.on('task-updated', task => nsp.emit('byteplus:task-updated', task));
    queue.on('task-created', task => {
        nsp.emit('byteplus:task-created', task);
        const name = task.taskName || (task.id ? task.id.slice(-6) : 'Task');
        emitLog('info', `📋 [Tạo Task] Task "${name}" đã được thêm vào hàng chờ.`);
    });
    queue.on('task-running', task => {
        const name = task.taskName || (task.id ? task.id.slice(-6) : 'Task');
        emitLog('info', `🚀 [Bắt đầu] Đang xử lý task "${name}" qua Kie.ai...`);
    });
    queue.on('task-stage', ({ task, stage, progress }) => {
        const name = task.taskName || (task.id ? task.id.slice(-6) : 'Task');
        emitLog('info', `⏳ [Tiến trình] Task "${name}": ${stage} (${progress}%)`);
    });
    queue.on('task-completed', task => {
        nsp.emit('byteplus:task-completed', task);
        const name = task.taskName || (task.id ? task.id.slice(-6) : 'Task');
        emitLog('success', `🎉 [Hoàn thành] Task "${name}" đã tạo xong video thành phẩm!`);
    });
    queue.on('task-failed', task => {
        nsp.emit('byteplus:task-failed', task);
        const name = task.taskName || (task.id ? task.id.slice(-6) : 'Task');
        const errMsg = task.error?.message || 'Lỗi không xác định';
        emitLog('error', `💥 [Lỗi Task] Task "${name}" thất bại: ${errMsg}`);
    });
    kols.on('kol-updated', payload => nsp.emit('byteplus:kol-updated', payload));

    nsp.on('connection', socket => {
        socket.emit('byteplus:queue-updated', queue.snapshot());
        socket.emit('byteplus:stats-updated', queue.stats());
        socket.emit('byteplus:mode', { mode: config.mode, maxConcurrency: config.maxConcurrency });
    });

    return nsp;
}

export { config, isMock, providerStatus };
export default createByteplusSubsystem;
