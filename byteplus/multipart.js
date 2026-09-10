/**
 * byteplus/multipart.js
 * Bo phan tich multipart/form-data doc lap cho he thong moi.
 * Ghi file vao byteplus_uploads/ — khong dung chung voi uploads/ cua he cu.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ensureDir, safeSegment } from './store.js';

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff', '.heic', '.heif'];
const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'];

export function classify(filename) {
    const ext = path.extname(String(filename || '')).toLowerCase();
    if (IMAGE_EXT.includes(ext)) return 'image';
    if (VIDEO_EXT.includes(ext)) return 'video';
    return null;
}

function splitBuffer(buf, delim) {
    const out = [];
    let cur = 0;
    while (cur < buf.length) {
        const idx = buf.indexOf(delim, cur);
        if (idx === -1) { out.push(buf.slice(cur)); break; }
        out.push(buf.slice(cur, idx));
        cur = idx + delim.length;
        if (buf.slice(cur, cur + 2).equals(Buffer.from('\r\n'))) cur += 2;
    }
    return out;
}

import { pipeline } from 'stream/promises';

async function findBoundaryPositions(filePath, boundaryBuf) {
    const fd = await fs.promises.open(filePath, 'r');
    try {
        const stat = await fd.stat();
        const fileSize = stat.size;
        const CHUNK_SIZE = 64 * 1024;
        const bLen = boundaryBuf.length;
        const positions = [];

        let fileOffset = 0;
        let overlap = Buffer.alloc(0);

        while (fileOffset < fileSize) {
            const readLen = Math.min(CHUNK_SIZE, fileSize - fileOffset);
            const chunk = Buffer.alloc(readLen);
            await fd.read(chunk, 0, readLen, fileOffset);

            const combined = overlap.length > 0 ? Buffer.concat([overlap, chunk]) : chunk;
            const baseFilePos = fileOffset - overlap.length;

            let searchPos = 0;
            while (searchPos <= combined.length - bLen) {
                const idx = combined.indexOf(boundaryBuf, searchPos);
                if (idx === -1) break;
                positions.push(baseFilePos + idx);
                searchPos = idx + bLen;
            }

            const keepOverlap = Math.min(bLen - 1, combined.length);
            overlap = combined.slice(combined.length - keepOverlap);
            fileOffset += readLen;
        }
        return positions;
    } finally {
        await fd.close();
    }
}

/** Middleware: chi xu ly multipart, cac content-type khac di tiep. */
export function byteplusMultipart(uploadDir, { maxBytes = 250 * 1024 * 1024 } = {}) {
    return function (req, res, next) {
        const ct = req.headers['content-type'] || '';
        if (!ct.includes('multipart/form-data')) return next();

        const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
        if (!m) return next();
        const boundary = m[1] || m[2];
        const boundaryBuf = Buffer.from('--' + boundary);

        ensureDir(uploadDir);
        const tmpFile = path.join(uploadDir, '.tmp_upload_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex'));
        const ws = fs.createWriteStream(tmpFile);

        let total = 0;
        let aborted = false;

        const cleanupTmp = () => {
            try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) {}
        };

        req.on('data', c => {
            total += c.length;
            if (total > maxBytes && !aborted) {
                aborted = true;
                ws.destroy();
                cleanupTmp();
                res.status(413).json({ error: 'File qua lon (toi da 250 MB moi request).' });
                req.destroy();
                return;
            }
            ws.write(c);
        });

        req.on('end', () => {
            if (aborted) return;
            ws.end(async () => {
                let fd;
                try {
                    const positions = await findBoundaryPositions(tmpFile, boundaryBuf);
                    req.body = req.body || {};
                    req.files = [];

                    if (positions.length >= 2) {
                        fd = await fs.promises.open(tmpFile, 'r');
                        for (let i = 0; i < positions.length - 1; i++) {
                            const start = positions[i] + boundaryBuf.length;
                            const nextPos = positions[i + 1];

                            const maxHeader = Math.min(4096, nextPos - start);
                            const headerBuf = Buffer.alloc(maxHeader);
                            await fd.read(headerBuf, 0, maxHeader, start);

                            const sepIdx = headerBuf.indexOf('\r\n\r\n');
                            if (sepIdx === -1) continue;

                            const headerStr = headerBuf.slice(0, sepIdx).toString('utf-8');
                            const dataStart = start + sepIdx + 4;
                            let dataEnd = nextPos;

                            if (dataEnd >= dataStart + 2) {
                                const crlfBuf = Buffer.alloc(2);
                                await fd.read(crlfBuf, 0, 2, dataEnd - 2);
                                if (crlfBuf[0] === 13 && crlfBuf[1] === 10) {
                                    dataEnd -= 2;
                                }
                            }

                            const disp = headerStr.match(/name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
                            if (!disp) continue;

                            const field = disp[1];
                            const filename = disp[2];

                            if (filename !== undefined && filename !== '') {
                                if (dataEnd <= dataStart) continue;
                                const ext = path.extname(filename).toLowerCase().slice(0, 10);
                                const safe = 'bp_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') +
                                             '_' + safeSegment(path.basename(filename, path.extname(filename)), 'file') + ext;
                                const dest = path.join(uploadDir, safe);

                                const rs = fs.createReadStream(tmpFile, { start: dataStart, end: dataEnd - 1 });
                                const destWs = fs.createWriteStream(dest);
                                await pipeline(rs, destWs);

                                req.files.push({
                                    field,
                                    originalName: filename,
                                    filename: safe,
                                    localPath: dest,
                                    bytes: dataEnd - dataStart,
                                    kind: classify(filename)
                                });
                            } else {
                                const dataLen = dataEnd - dataStart;
                                const valBuf = Buffer.alloc(dataLen);
                                await fd.read(valBuf, 0, dataLen, dataStart);
                                req.body[field] = valBuf.toString('utf-8');
                            }
                        }
                    }

                    if (fd) await fd.close();
                    cleanupTmp();
                    next();
                } catch (err) {
                    if (fd) try { await fd.close(); } catch (e) {}
                    cleanupTmp();
                    res.status(400).json({ error: 'Khong doc duoc du lieu tai len: ' + err.message });
                }
            });
        });

        req.on('error', () => {
            cleanupTmp();
            if (!aborted) res.status(400).json({ error: 'Loi truyen du lieu.' });
        });
    };
}

export default byteplusMultipart;
