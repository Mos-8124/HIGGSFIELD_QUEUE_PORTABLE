/**
 * tests/ui_consistency.test.js
 *
 * TDD Phase 2 (ui-ux-pro-max) — Gom giá trị VISUAL hardcode trong inline-style
 * về token/utility class dùng chung, để hết cảnh "mỗi trang một kiểu".
 *
 * Nguyên tắc AN TOÀN: chỉ ép MÀU (và pattern lặp) ra khỏi inline;
 * GIỮ nguyên inline mang tính state/động/layout-một-lần (display:none, width động, flex).
 * => Contract: KHÔNG còn màu literal (hex / rgb() / rgba() / hsl()) trong bất kỳ
 *    thuộc tính style="" nào của trang. Màu phải đến từ var(--token) hoặc class.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.join(__dirname, '..', 'public', 'studio');
const S = 'UI/UX Consistency — Phase 2 (inline-style → tokens)';

function read(rel) { return fs.readFileSync(path.join(STUDIO, rel), 'utf-8'); }

// Lấy toàn bộ giá trị của thuộc tính style="" trong HTML tĩnh.
function inlineStyles(html) {
    return [...html.matchAll(/\sstyle="([^"]*)"/g)].map(m => m[1]);
}

// Màu literal: #hex, rgb(), rgba(), hsl(), hsla().
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;

function assertNoInlineColor(rel) {
    const styles = inlineStyles(read(rel));
    const offenders = styles.filter(s => COLOR_LITERAL.test(s));
    assert.strictEqual(offenders.length, 0,
        `${rel}: còn ${offenders.length} inline-style chứa màu hardcode (phải dùng var(--token)/class):\n  - ` +
        offenders.slice(0, 8).join('\n  - '));
}

// Block inline được phép lặp (state/động — KHÔNG mang tính "style/look"):
// display toggles do JS điều khiển qua .style.display.
const ALLOWED_REPEAT = /^display\s*:\s*(none|block|flex|inline-block|inline-flex|grid)\s*;?$/i;

// Không block style visual/layout nào được lặp >=2 lần (lặp => phải gom vào class).
function assertNoRepeatedInline(rel) {
    const styles = inlineStyles(read(rel)).map(s => s.trim()).filter(Boolean);
    const seen = new Map();
    for (const s of styles) {
        if (ALLOWED_REPEAT.test(s)) continue;
        seen.set(s, (seen.get(s) || 0) + 1);
    }
    const repeated = [...seen.entries()].filter(([, n]) => n >= 2);
    assert.strictEqual(repeated.length, 0,
        `${rel}: có ${repeated.length} block inline-style bị lặp (phải gom vào class dùng chung):\n  - ` +
        repeated.map(([s, n]) => `(${n}×) ${s}`).slice(0, 8).join('\n  - '));
}

export async function runUiConsistencyTests(reporter) {
    // PILOT: video-to-video (làm trước, verify pixel, rồi nhân ra).
    await reporter.test(S, 'Tier 2: [Consistency] video-to-video.html — không màu hardcode trong inline-style', async () => {
        assertNoInlineColor('video-to-video.html');
    });
    await reporter.test(S, 'Tier 2: [Consistency] video-to-video.html — không lặp block inline (gom vào class)', async () => {
        assertNoRepeatedInline('video-to-video.html');
    });

    // Rollout: index + flow-queue (bật sau khi pilot xanh & verify render).
    await reporter.test(S, 'Tier 2: [Consistency] index.html — không màu hardcode trong inline-style', async () => {
        assertNoInlineColor('index.html');
    });
    await reporter.test(S, 'Tier 2: [Consistency] index.html — không lặp block inline (gom vào class)', async () => {
        assertNoRepeatedInline('index.html');
    });
    await reporter.test(S, 'Tier 2: [Consistency] flow-queue.html — không màu hardcode trong inline-style', async () => {
        assertNoInlineColor('flow-queue.html');
    });
    await reporter.test(S, 'Tier 2: [Consistency] flow-queue.html — không lặp block inline (gom vào class)', async () => {
        assertNoRepeatedInline('flow-queue.html');
    });

    // JS template inline-style: màu phải là var(--token), không hardcode.
    // Giữ nguyên giá trị ĐỘNG (${...}) — chỉ bắt màu literal.
    for (const f of ['video-to-video.js', 'studio.js', 'flow-queue.js']) {
        await reporter.test(S, `Tier 2: [Consistency] ${f} — inline-style trong JS không màu hardcode`, async () => {
            assertNoInlineColorJs(f);
        });
    }
}

// Lấy giá trị style="" và style=`` trong template literal JS.
function jsInlineStyles(js) {
    const out = [];
    for (const m of js.matchAll(/style="([^"]*)"/g)) out.push(m[1]);
    for (const m of js.matchAll(/style=`([^`]*)`/g)) out.push(m[1]);
    return out;
}

function assertNoInlineColorJs(rel) {
    const styles = jsInlineStyles(read(rel));
    const offenders = styles.filter(s => COLOR_LITERAL.test(s));
    assert.strictEqual(offenders.length, 0,
        `${rel}: còn ${offenders.length} inline-style (JS) chứa màu hardcode (dùng var(--token)):\n  - ` +
        offenders.slice(0, 8).join('\n  - '));
}

export default { runUiConsistencyTests };
