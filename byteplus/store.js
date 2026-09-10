/**
 * byteplus/store.js
 * Lưu trữ JSON nguyên tử (write temp -> fsync -> rename) cho các DB của hệ thống mới.
 * KHÔNG đụng tới cơ chế ghi của queue_db.json cũ.
 */
import fs from 'fs';
import path from 'path';

/** Làm sạch một đoạn tên thư mục/file do người dùng nhập. Chặn path traversal. */
export function safeSegment(name, fallback = 'unknown') {
    if (name === null || name === undefined) return fallback;
    let s = String(name)
        .normalize('NFC')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/[<>:"/|?*]/g, '_')
        .split(String.fromCharCode(92)).join('_')   // dau gach nguoc — chan traversal tren Windows
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+/, '')
        .replace(/\.+$/, '')
        .slice(0, 60)
        .trim();
    // Tên bị Windows cấm
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(s)) s = '_' + s;
    return s || fallback;
}

/** Ghép đường dẫn và đảm bảo kết quả vẫn nằm trong baseDir. */
export function safeJoin(baseDir, ...segments) {
    const clean = segments.map(s => safeSegment(s));
    const full = path.resolve(baseDir, ...clean);
    const base = path.resolve(baseDir);
    if (full !== base && !full.startsWith(base + path.sep)) {
        throw new Error('Đường dẫn không hợp lệ (path traversal)');
    }
    return full;
}

export function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/**
 * JsonStore — đọc/ghi một file JSON an toàn.
 * Ghi được nối tiếp (queue) để hai lần save chồng nhau không làm hỏng file.
 */
export class JsonStore {
    constructor(filePath, defaultValue) {
        this.filePath = filePath;
        this.defaultValue = defaultValue;
        this.data = null;
        this._writing = Promise.resolve();
        this._dirty = false;
        this._timer = null;
    }

    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                if (raw.trim()) {
                    this.data = JSON.parse(raw);
                    return this.data;
                }
            }
        } catch (err) {
            // JSON hỏng: giữ lại bản lỗi để điều tra, rồi khởi tạo mới.
            try {
                const bak = this.filePath + '.corrupt-' + Date.now();
                fs.copyFileSync(this.filePath, bak);
                console.warn(`⚠️ [BytePlus] ${path.basename(this.filePath)} hỏng, đã sao lưu sang ${path.basename(bak)}`);
            } catch (_) {}
        }
        this.data = structuredClone(this.defaultValue);
        return this.data;
    }

    /** Ghi ngay lập tức, nguyên tử. Trả về Promise. */
    save() {
        const snapshot = JSON.stringify(this.data, null, 2);
        this._writing = this._writing.then(() => this._atomicWrite(snapshot)).catch(err => {
            console.error('❌ [BytePlus] Lỗi ghi', path.basename(this.filePath), err.message);
        });
        return this._writing;
    }

    /** Gộp nhiều lần ghi liên tiếp trong `ms` thành một lần — dùng cho cập nhật tiến độ. */
    saveDebounced(ms = 250) {
        this._dirty = true;
        if (this._timer) return;
        this._timer = setTimeout(() => {
            this._timer = null;
            if (this._dirty) {
                this._dirty = false;
                this.save();
            }
        }, ms);
        if (this._timer.unref) this._timer.unref();
    }

    /** Đảm bảo mọi thay đổi đang chờ đã nằm trên đĩa. */
    async flush() {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        if (this._dirty) {
            this._dirty = false;
            this.save();
        }
        await this._writing;
    }

    async _atomicWrite(contents) {
        ensureDir(path.dirname(this.filePath));
        const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
        const fd = fs.openSync(tmp, 'w');
        try {
            fs.writeFileSync(fd, contents, 'utf-8');
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
        fs.renameSync(tmp, this.filePath);
    }
}

export default JsonStore;
