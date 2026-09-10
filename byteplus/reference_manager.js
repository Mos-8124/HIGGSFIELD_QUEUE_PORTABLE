/**
 * byteplus/reference_manager.js
 *
 * Chuan hoa va chuan bi tai san tham chieu cho mot task.
 *
 * Moi tham chieu co MOT id on dinh khong doi khi nguoi dung keo tha doi thu tu.
 * Bi danh hien thi (@Image 1, @Video 2, ten KOL) duoc TINH LAI tu thu tu hien
 * tai, nen doi cho khong lam hong lien ket ben duoi.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from './config.js';

export const REFERENCE_TYPES = ['image', 'video', 'kol'];

export function newReferenceId(type) {
    return 'ref_' + type + '_' + crypto.randomBytes(5).toString('hex');
}

/**
 * Gan lai bi danh theo thu tu hien tai cua mang.
 * Anh dem rieng, video dem rieng; KOL dung ten hien thi.
 */
export function assignAliases(references) {
    let img = 0;
    let vid = 0;
    return (references || []).map((ref, i) => {
        let alias;
        if (ref.type === 'image') alias = '@Image ' + (++img);
        else if (ref.type === 'video') alias = '@Video ' + (++vid);
        else alias = ref.displayName || 'KOL';
        return { ...ref, order: i, index: ref.type === 'image' ? img : (ref.type === 'video' ? vid : null), alias };
    });
}

/** Dung mot tham chieu tu du lieu tho gui len tu UI. */
export function buildReference(raw) {
    const type = String(raw.type || '').toLowerCase();
    if (!REFERENCE_TYPES.includes(type)) {
        throw new Error('Loai tham chieu khong hop le: ' + raw.type);
    }
    const base = {
        id: raw.id || newReferenceId(type),
        type,
        source: raw.source || (type === 'kol' ? 'library' : 'upload'),
        addedAt: raw.addedAt || new Date().toISOString()
    };
    if (type === 'kol') {
        return {
            ...base,
            kolId: raw.kolId,
            displayName: raw.displayName || 'KOL',
            previewUrl: raw.previewUrl || raw.thumbnailUrl || null,
            thumbnailUrl: raw.thumbnailUrl || raw.previewUrl || null,
            localPath: raw.localPath || raw.kolSourcePath || null,
            assetProvider: raw.assetProvider || null,
            assetId: raw.assetId || null
        };
    }
    return {
        ...base,
        localPath: raw.localPath || null,
        originalName: raw.originalName || (raw.localPath ? path.basename(raw.localPath) : null),
        previewUrl: raw.previewUrl || null,
        bytes: raw.bytes || null,
        // Cac truong transport — mock dien vao, provider that sau nay dung lai y nguyen
        storageProvider: null,
        remoteObjectKey: null,
        remoteUrl: null,
        expiresAt: null
    };
}

export class ReferenceManager {
    constructor({ tosProvider, assetProvider, kolLibrary = null }) {
        this.tos = tosProvider;
        this.assets = assetProvider;
        this.kols = kolLibrary;
    }

    /**
     * Kho luu tham chieu chua cau hinh -> nem loi cua CHINH provider dang chay.
     * TOS bao BYTEPLUS_TOS_NOT_CONFIGURED, Kie bao KIE_UPLOAD_NOT_CONFIGURED.
     * Khi o che do KIE: TUYET DOI khong bao gio nem BYTEPLUS_TOS_NOT_CONFIGURED.
     */
    _requireStorageConfigured() {
        const isKie = config.provider === 'kie' || (this.tos && this.tos.name === 'kie');
        if (!this.tos) {
            if (isKie) {
                const err = new Error('KIE_UPLOAD_NOT_CONFIGURED: Chưa khởi tạo hoặc chưa cấu hình Kie File Storage Provider (thiếu KIE_API_KEY).');
                err.code = 'KIE_UPLOAD_NOT_CONFIGURED';
                throw err;
            }
            const err = new Error('BYTEPLUS_TOS_NOT_CONFIGURED: BytePlus TOS chưa được cấu hình.');
            err.code = 'BYTEPLUS_TOS_NOT_CONFIGURED';
            throw err;
        }
        if (typeof this.tos.isConfigured === 'function' && !this.tos.isConfigured()) {
            const fallbackCode = isKie ? 'KIE_UPLOAD_NOT_CONFIGURED' : 'BYTEPLUS_TOS_NOT_CONFIGURED';
            const fallbackMsg = isKie
                ? 'KIE_UPLOAD_NOT_CONFIGURED: Chưa cấu hình KIE_API_KEY trong file .env nên không thể tải ảnh/video tham chiếu lên Kie.ai.'
                : 'BYTEPLUS_TOS_NOT_CONFIGURED: BytePlus TOS chưa được cấu hình (thiếu BYTEPLUS_TOS_ACCESS_KEY, BYTEPLUS_TOS_SECRET_KEY, BYTEPLUS_TOS_BUCKET). Vui lòng cấu hình TOS trong file .env để dùng ảnh/video tham chiếu.';
            const message = this.tos.notConfiguredMessage || fallbackMsg;
            const err = new Error(message);
            err.code = this.tos.notConfiguredCode || fallbackCode;
            throw err;
        }
    }


    /**
     * Tim file goc cua mot KOL. File cuc bo la NGUON SU THAT:
     * ban chup trong task truoc -> thu vien KOL -> thumbnail.
     */
    _kolSourcePath(ref) {
        const candidates = [];
        if (ref.kolSourcePath) candidates.push(ref.kolSourcePath);
        const kol = this.kols && ref.kolId && typeof this.kols.get === 'function' ? this.kols.get(ref.kolId) : null;
        if (kol) {
            if (Array.isArray(kol.files)) candidates.push(...kol.files);
            if (kol.thumbnailPath) candidates.push(kol.thumbnailPath);
        }
        if (ref.thumbnailPath) candidates.push(ref.thumbnailPath);
        for (const c of candidates) {
            if (c && fs.existsSync(c)) return c;
        }
        return null;
    }

    /**
     * Tai tai san len kho luu tru, tai su dung toi da de khong ton bang thong:
     *  - Provider ky lai duoc (TOS): object nam vinh vien, chi sinh signed URL moi.
     *  - Provider URL tam thoi (Kie): con han thi dung lai, het han thi upload lai tu file goc.
     */
    async _uploadOrReuse(ref, task, kind, signal) {
        const canResign = !this.tos || this.tos.canResign !== false;

        if (!canResign) {
            const usable = typeof this.tos.isReferenceUsable === 'function'
                ? this.tos.isReferenceUsable(ref)
                : false;
            if (usable) {
                return {
                    storageProvider: ref.storageProvider,
                    remoteObjectKey: ref.remoteObjectKey,
                    remoteUrl: ref.remoteUrl,
                    expiresAt: ref.expiresAt,
                    bytes: ref.bytes,
                    mimeType: ref.mimeType,
                    etag: ref.etag,
                    reused: true
                };
            }
            return this.tos.upload(ref.localPath, {
                taskId: task.id,
                referenceId: ref.id,
                originalName: ref.originalName,
                kind,
                signal
            });
        }

        // Da co object tren TOS -> tai su dung va gia han signed URL moi.
        if (ref.remoteObjectKey && typeof this.tos.getSignedUrl === 'function') {
            let freshUrl;
            try {
                freshUrl = this.tos.getSignedUrl(ref.remoteObjectKey);
            } catch (signErr) {
                const err = new Error(`BYTEPLUS_TOS_SIGN_URL_FAILED: Không thể tạo signed URL cho tham chiếu (${signErr.message})`);
                err.code = 'BYTEPLUS_TOS_SIGN_URL_FAILED';
                err.cause = signErr;
                throw err;
            }
            const ttl = this.tos.signedUrlTtlSeconds || 3600;
            return {
                storageProvider: ref.storageProvider || this.tos.name,
                remoteObjectKey: ref.remoteObjectKey,
                remoteUrl: freshUrl,
                expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
                bytes: ref.bytes,
                etag: ref.etag,
                localPath: ref.localPath,
                reused: true
            };
        }

        return this.tos.upload(ref.localPath, {
            taskId: task.id,
            referenceId: ref.id,
            originalName: ref.originalName,
            keyPrefix: kind === 'image' ? 'gtf-video-ai/images' : 'gtf-video-ai/videos',
            signal
        });
    }

    /**
     * Kiem tra truoc khi chiem slot: file con ton tai, KOL con dung duoc,
     * va TOS da duoc cau hinh neu co anh/video cuc bo can upload.
     * Nem loi co code de goi y nguyen nhan cho nguoi dung.
     */
    async preflight(task) {
        const refs = task.references || [];
        for (const ref of refs) {
            if (ref.type === 'kol') {
                if (!ref.assetId) {
                    const err = new Error('KOL "' + (ref.displayName || '?') + '" chua co asset hop le.');
                    err.code = 'KOL_ASSET_MISSING';
                    throw err;
                }
                await this.assets.resolveAsset(ref.assetId);

                // Provider khong dung kho asset tu xa (Kie): KOL phai con file goc de upload.
                if (this.assets && this.assets.usesLocalSource) {
                    if (!this._kolSourcePath(ref)) {
                        const err = new Error('KOL_SOURCE_FILE_MISSING: Khong tim thay file goc cua KOL "' + (ref.displayName || ref.kolId || '?') + '".');
                        err.code = 'KOL_SOURCE_FILE_MISSING';
                        throw err;
                    }
                    this._requireStorageConfigured();
                }
            } else {
                if (!ref.localPath || !fs.existsSync(ref.localPath)) {
                    const err = new Error('File tham chieu khong con ton tai: ' + (ref.originalName || ref.id));
                    err.code = 'REFERENCE_FILE_MISSING';
                    throw err;
                }
                // File cuc bo can upload len kho luu tru nhung kho chua duoc cau hinh
                // -> bao dung ma loi cua provider dang chay (TOS hoac Kie).
                this._requireStorageConfigured();
            }
        }
        return true;
    }

    /**
     * Dua tai san len "TOS" / phan giai asset KOL.
     * Neu tham chieu da co remoteObjectKey tren TOS (vi du sau reboot hoac retry),
     * tai su dung object va chi sinh signed URL moi chu khong upload lai.
     * Tra ve mang tham chieu da duoc bo sung remoteUrl / assetUri.
     */
    async prepare(task, { onStage, signal } = {}) {
        const emit = onStage || function () {};
        const refs = assignAliases(task.references || []);

        emit('Preparing References', 8);
        if (task.mockFailure === 'upload') {
            const err = new Error('Mock TOS: upload tai san that bai (mo phong loi upload).');
            err.code = 'REFERENCE_UPLOAD_FAILED';
            throw err;
        }

        const prepared = [];
        for (let i = 0; i < refs.length; i++) {
            if (signal && signal.aborted) throw new Error('Cancelled');
            const ref = refs[i];
            const pct = 8 + Math.round(((i + 1) / Math.max(refs.length, 1)) * 10);
            emit('Uploading References', pct);

            if (ref.type === 'kol') {
                const resolved = await this.assets.resolveAsset(ref.assetId);

                // Kho asset tu xa (LAS): dung asset:// nhu cu.
                if (!this.assets || !this.assets.usesLocalSource) {
                    prepared.push({ ...ref, assetUri: resolved.assetUri, preparedAt: new Date().toISOString() });
                    continue;
                }

                // Khong co LAS: upload chinh file goc cua KOL len kho luu tru.
                // assetId khong doi nen lich su task cu khong bi hong.
                const src = this._kolSourcePath(ref);
                if (!src) {
                    const err = new Error('KOL_SOURCE_FILE_MISSING: Khong tim thay file goc cua KOL "' + (ref.displayName || ref.kolId || '?') + '".');
                    err.code = 'KOL_SOURCE_FILE_MISSING';
                    throw err;
                }
                const kolRef = { ...ref, localPath: src, originalName: ref.originalName || path.basename(src) };
                const up = await this._uploadOrReuse(kolRef, task, 'image', signal);
                prepared.push({
                    ...ref,
                    kolSourcePath: src,
                    assetUri: resolved.assetUri || null,
                    storageProvider: up.storageProvider,
                    remoteObjectKey: up.remoteObjectKey,
                    remoteUrl: up.remoteUrl,
                    expiresAt: up.expiresAt,
                    bytes: up.bytes,
                    mimeType: up.mimeType,
                    preparedAt: new Date().toISOString()
                });
            } else {
                const up = await this._uploadOrReuse(ref, task, ref.type, signal);
                prepared.push({
                    ...ref,
                    storageProvider: up.storageProvider,
                    remoteObjectKey: up.remoteObjectKey,
                    remoteUrl: up.remoteUrl,
                    expiresAt: up.expiresAt,
                    bytes: up.bytes,
                    mimeType: up.mimeType !== undefined ? up.mimeType : ref.mimeType,
                    etag: up.etag,
                    preparedAt: new Date().toISOString()
                });
            }
        }
        return prepared;
    }

    /**
     * Dung doan prompt kem bi danh de nguoi dung thay ro model se nhan gi.
     * Vi du: "@Image 1, @Video 1, Maya"
     */
    static describe(references) {
        return assignAliases(references || []).map(r => r.alias).join(', ');
    }
}

export default ReferenceManager;
