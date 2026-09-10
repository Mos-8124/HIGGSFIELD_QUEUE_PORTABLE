/**
 * byteplus/kol_library.js
 *
 * Thu vien KOL (nhan vat ao dung lai nhieu lan).
 *
 * Nguyen tac quan trong: doi ten KOL CHI doi metadata hien thi cua GTF.
 * assetId ben duoi khong doi, nen lich su task cu van doc duoc binh thuong.
 */
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { JsonStore } from './store.js';
import { config } from './config.js';

export class KolLibrary extends EventEmitter {
    constructor({ assetProvider, dbPath = config.kolDbPath }) {
        super();
        this.assets = assetProvider;
        this.store = new JsonStore(dbPath, { kols: [] });
        this.store.load();
        if (!Array.isArray(this.store.data.kols)) this.store.data.kols = [];
    }

    get all() { return this.store.data.kols; }

    get(id) { return this.all.find(k => k.id === id) || null; }

    list({ q = '', tag = '' } = {}) {
        const needle = String(q).trim().toLowerCase();
        const tg = String(tag).trim().toLowerCase();
        return this.all.filter(k => {
            if (tg && !(k.tags || []).map(t => t.toLowerCase()).includes(tg)) return false;
            if (!needle) return true;
            const hay = [k.displayName, k.description, (k.tags || []).join(' ')].join(' ').toLowerCase();
            return hay.includes(needle);
        });
    }

    /** Them KOL moi — dang ky asset qua LAS provider (mock hoac that). */
    async create({ displayName, description = '', tags = [], files = [], thumbnailPath = null }) {
        const name = String(displayName || '').trim();
        if (!name) {
            const err = new Error('KOL phai co ten hien thi.');
            err.code = 'VALIDATION_FAILED';
            throw err;
        }
        const registered = await this.assets.registerAsset({ displayName: name, files });
        const now = new Date().toISOString();

        const kol = {
            id: 'kol_' + crypto.randomBytes(5).toString('hex'),
            displayName: name,
            description: String(description || ''),
            tags: (Array.isArray(tags) ? tags : String(tags).split(',')).map(t => String(t).trim()).filter(Boolean),
            thumbnailPath,
            thumbnailUrl: null,
            files: files || [],
            assetProvider: registered.assetProvider,
            assetId: registered.assetId,
            assetUri: registered.assetUri,
            usageCount: 0,
            createdAt: now,
            updatedAt: now,
            lastUsedAt: null
        };
        this.all.push(kol);
        this.store.save();
        this.emit('kol-updated', { action: 'created', kol });
        return kol;
    }

    /**
     * Cap nhat metadata hien thi. KHONG dang ky lai asset, KHONG doi assetId.
     * Doi ten Maya -> "Maya Casual Bedroom" chi la doi nhan.
     */
    update(id, patch = {}) {
        const kol = this.get(id);
        if (!kol) return null;
        if (patch.displayName !== undefined) {
            const n = String(patch.displayName).trim();
            if (n) kol.displayName = n;
        }
        if (patch.description !== undefined) kol.description = String(patch.description);
        if (patch.tags !== undefined) {
            kol.tags = (Array.isArray(patch.tags) ? patch.tags : String(patch.tags).split(','))
                .map(t => String(t).trim()).filter(Boolean);
        }
        if (patch.thumbnailPath !== undefined) kol.thumbnailPath = patch.thumbnailPath;
        kol.updatedAt = new Date().toISOString();
        this.store.save();
        this.emit('kol-updated', { action: 'updated', kol });
        return kol;
    }

    markUsed(id) {
        const kol = this.get(id);
        if (!kol) return null;
        kol.usageCount = (kol.usageCount || 0) + 1;
        kol.lastUsedAt = new Date().toISOString();
        this.store.saveDebounced();
        this.emit('kol-updated', { action: 'used', kol });
        return kol;
    }

    /**
     * Xoa KOL khoi thu vien. Task cu VAN giu ban sao metadata trong
     * task.references nen lich su khong bi hong.
     */
    remove(id) {
        const i = this.all.findIndex(k => k.id === id);
        if (i === -1) return false;
        const [kol] = this.all.splice(i, 1);
        this.store.save();
        this.emit('kol-updated', { action: 'deleted', kol });
        return true;
    }

    async flush() { await this.store.flush(); }
}

export default KolLibrary;
