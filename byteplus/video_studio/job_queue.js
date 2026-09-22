/**
 * HÀNG ĐỢI DÙNG CHUNG CHO NHIỀU NGƯỜI DÙNG (V2 Video-to-Video)
 *
 * Bối cảnh: hệ thống cho nhân viên trong công ty dùng chung. Trước đây mỗi lần bấm render tạo một
 * hàng đợi RIÊNG (trần 10 video), nên 3 người bấm cùng lúc = 30 tiến trình FFmpeg ⇒ treo máy.
 *
 * Quyết định của user (2026-09-18): xếp hàng theo PROJECT, **FIFO thuần theo thứ tự bấm** —
 * "cứ project nào yêu cầu trước thì thực hiện của project đó trước". Mỗi lúc chỉ 1 project được
 * dựng, nên trần 10 luồng FFmpeg sẵn có trong `batchAssemble` tự động trở thành trần toàn hệ thống.
 *
 * Toàn bộ trạng thái nằm trong BỘ NHỚ của tiến trình Node — restart server là mất hàng đợi.
 */

/** Hàng đợi FIFO có khoá theo `key` (ở đây key = projectId). */
export class FifoQueue {
    constructor({ concurrency = 1 } = {}) {
        this.concurrency = Math.max(1, Number(concurrency) || 1);
        this._running = new Map(); // key -> meta (thứ tự chèn = thứ tự bắt đầu chạy)
        this._waiting = [];        // [{ key, fn, resolve, reject, meta }]
    }

    /**
     * Đẩy một job vào hàng đợi. Trả Promise giải quyết bằng kết quả của `fn`.
     * Job lỗi vẫn NHẢ KHOÁ và hàng đợi chạy tiếp (lỗi được ném lại cho người gọi).
     */
    enqueue(key, fn, meta = {}) {
        return new Promise((resolve, reject) => {
            this._waiting.push({ key, fn, resolve, reject, meta });
            this._drain();
        });
    }

    /**
     * Vị trí của `key`: 0 = đang chạy, >=1 = số project phải đợi phía trước, -1 = không có trong hàng.
     * Dùng cho UI ("trước bạn còn N project").
     */
    position(key) {
        if (this._running.has(key)) return 0;
        const idx = this._waiting.findIndex(j => j.key === key);
        if (idx === -1) return -1;
        return Math.max(1, this._running.size + idx);
    }

    /** Đang chờ HOẶC đang chạy → true. Dùng để chặn bấm trùng. */
    has(key) {
        return this._running.has(key) || this._waiting.some(j => j.key === key);
    }

    /** Ảnh chụp cho UI: danh sách đang chạy + đang chờ (đúng thứ tự). */
    snapshot() {
        const running = [...this._running.keys()];
        const waiting = this._waiting.map(j => j.key);
        return {
            running,
            waiting,
            total: running.length + waiting.length,
            concurrency: this.concurrency,
            meta: [
                ...running.map(k => ({ key: k, state: 'running', position: 0, ...(this._running.get(k) || {}) })),
                ...this._waiting.map((j, i) => ({
                    key: j.key,
                    state: 'waiting',
                    position: Math.max(1, this._running.size + i),
                    ...j.meta
                }))
            ]
        };
    }

    get size() {
        return this._running.size + this._waiting.length;
    }

    /** Rút job kế tiếp khi còn chỗ. Gọi lại sau mỗi job xong để chạy tiếp. */
    _drain() {
        while (this._running.size < this.concurrency && this._waiting.length > 0) {
            const job = this._waiting.shift();
            this._running.set(job.key, { ...job.meta });

            // Nhả khoá TRƯỚC khi resolve/reject: nếu dọn trong .finally thì người gọi `await` xong
            // vẫn thấy has() = true (dọn rơi vào microtask sau) ⇒ chặn bấm trùng bị sai.
            const settle = (ok, value) => {
                this._running.delete(job.key);
                this._drain();
                if (ok) job.resolve(value); else job.reject(value);
            };

            Promise.resolve()
                .then(() => job.fn())
                .then(v => settle(true, v), e => settle(false, e));
        }
    }
}

/**
 * Cổng giới hạn số việc chạy đồng thời TOÀN CỤC (semaphore).
 * Khác `FifoQueue` ở chỗ không khoá theo key — chỉ đếm số lượng.
 */
export class Gate {
    constructor(limit) {
        this.limit = Math.max(1, Number(limit) || 1);
        this._active = 0;
        this._queue = [];
    }

    async run(fn) {
        if (this._active >= this.limit) {
            await new Promise(res => this._queue.push(res));
        }
        this._active++;
        try {
            return await fn();
        } finally {
            this._active--;
            const next = this._queue.shift();
            if (next) next();
        }
    }

    get active() { return this._active; }
    get waiting() { return this._queue.length; }
}

/**
 * Chạy `fn` trên từng phần tử, tối đa `limit` việc đồng thời. Giữ NGUYÊN thứ tự kết quả.
 * Lỗi của một phần tử được ném ra (người gọi tự bắt) — dùng cho các lô cần biết lỗi.
 */
export async function runWithLimit(items, limit, fn) {
    const list = Array.from(items || []);
    const cap = Math.max(1, Number(limit) || 1);
    const results = new Array(list.length);
    let cursor = 0;

    const worker = async () => {
        while (cursor < list.length) {
            const i = cursor++;
            results[i] = await fn(list[i], i);
        }
    };

    await Promise.all(Array.from({ length: Math.min(cap, list.length) }, worker));
    return results;
}

/**
 * Hàng đợi DỰNG VIDEO dùng chung — mỗi lúc đúng 1 project (theo quyết định của user).
 * Chỉnh bằng `V2V_PROJECT_CONCURRENCY` nếu máy khoẻ và muốn chạy song song nhiều project.
 */
export const renderQueue = new FifoQueue({
    concurrency: Number(process.env.V2V_PROJECT_CONCURRENCY) || 1
});

/**
 * Cổng SINH KỊCH BẢN (step 3) — tối đa 10 kịch bản một lượt trên TOÀN hệ thống,
 * khớp với trần 10 video của bước dựng. Chỉnh bằng `V2V_LLM_CONCURRENCY`.
 */
export const scriptGate = new Gate(Number(process.env.V2V_LLM_CONCURRENCY) || 10);

export default { FifoQueue, Gate, runWithLimit, renderQueue, scriptGate };
