/**
 * tests/ui_a11y.test.js
 *
 * TDD cho bản quét UI/UX (ui-ux-pro-max audit) — chỉ V2 studio, KHÔNG đụng V1.
 * Test tĩnh trên nội dung file CSS/HTML (không mở trình duyệt):
 *   T1 Focus ring nhìn thấy được (bỏ outline:none không thay thế)  [Priority 1, CRITICAL]
 *   T2 Hỗ trợ prefers-reduced-motion                                [Priority 7, HIGH]
 *   T3 Emoji trang trí trong HTML tĩnh đều aria-hidden="true"       [Priority 4/A11y]
 *
 * Nguồn rule: .claude/skills/ui-ux-pro-max (ux/Focus States, ux/Reduced Motion,
 * Pre-Delivery Checklist "No emojis as icons").
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.join(__dirname, '..', 'public', 'studio');

const S = 'UI/UX Accessibility Pass (ui-ux-pro-max audit)';

function read(rel) {
    return fs.readFileSync(path.join(STUDIO, rel), 'utf-8');
}

// Emoji trang trí: Extended_Pictographic + có thể kèm VS16/ZWJ/skin-tone.
const EMOJI = /\p{Extended_Pictographic}(?:[\u{1F3FB}-\u{1F3FF}️‍\p{Extended_Pictographic}]*)/u;
const EMOJI_G = new RegExp(EMOJI, 'gu');

function countEmoji(html) {
    return (html.match(EMOJI_G) || []).length;
}

// Loại bỏ mọi emoji đứng NGAY sau `aria-hidden="true">` (cho phép khoảng trắng).
// Sau khi loại, nếu còn emoji => vẫn còn emoji "trần" chưa được ẩn với screen reader.
function stripAriaHiddenEmoji(html) {
    const re = new RegExp('aria-hidden\\s*=\\s*"true"\\s*>\\s*' + EMOJI.source, 'gu');
    return html.replace(re, '');
}

// CSS focus: có :focus và bên trong set box-shadow hoặc outline dạng solid/px (không phải none/0).
const FOCUS_VISIBLE = /:focus(?:-visible)?[^{}]*\{[^}]*(?:box-shadow|outline\s*:\s*[^;}]*(?:solid|px))/i;
const BARE_OUTLINE_NONE = /outline\s*:\s*(?:none|0)\b/i;

export async function runUiA11yTests(reporter) {

    // ── T1: Focus ring ──────────────────────────────────────────────
    for (const f of ['video-to-video.css', 'flow-queue.css']) {
        await reporter.test(S, `Tier 2: [A11y] ${f} không còn outline:none trần`, async () => {
            const css = read(f);
            assert.ok(!BARE_OUTLINE_NONE.test(css),
                `${f}: vẫn còn "outline:none/0" — phải thay bằng focus ring nhìn thấy được`);
        });
        await reporter.test(S, `Tier 2: [A11y] ${f} có focus ring nhìn thấy được`, async () => {
            const css = read(f);
            assert.ok(FOCUS_VISIBLE.test(css),
                `${f}: thiếu :focus với box-shadow/outline solid — thêm ring giống studio.css`);
        });
    }

    // ── T2: prefers-reduced-motion ─────────────────────────────────
    for (const f of ['studio.css', 'video-to-video.css', 'flow-queue.css']) {
        await reporter.test(S, `Tier 2: [Motion] ${f} tôn trọng prefers-reduced-motion`, async () => {
            const css = read(f);
            assert.ok(/prefers-reduced-motion/i.test(css),
                `${f}: thiếu @media (prefers-reduced-motion: reduce)`);
        });
    }

    // ── T3: Emoji trang trí trong HTML tĩnh phải aria-hidden ───────
    for (const f of ['video-to-video.html', 'index.html', 'flow-queue.html']) {
        await reporter.test(S, `Tier 2: [A11y] ${f} — emoji trang trí đều aria-hidden`, async () => {
            const html = read(f);
            const before = countEmoji(html);
            if (before === 0) return; // không có emoji thì đạt
            const leftover = countEmoji(stripAriaHiddenEmoji(html));
            assert.strictEqual(leftover, 0,
                `${f}: còn ${leftover}/${before} emoji chưa bọc aria-hidden="true" (screen reader sẽ đọc emoji)`);
        });
    }

    // ════════════════════════════════════════════════════════════════
    // PHASE 1a — Emoji-icon (HTML tĩnh) -> SVG qua runtime icons.js
    // ════════════════════════════════════════════════════════════════
    await runIconSystemTests(reporter);

    // ════════════════════════════════════════════════════════════════
    // PHASE 1b — Icon do JS render + vá a11y nút icon-only
    // ════════════════════════════════════════════════════════════════
    await runIconPhase1bTests(reporter);
}

const SB = 'UI/UX Icon System — Phase 1b (ui-ux-pro-max)';

async function runIconPhase1bTests(reporter) {
    const htmlFiles = ['video-to-video.html', 'index.html', 'flow-queue.html'];

    // 1) aria-hidden KHÔNG được đặt trực tiếp trên <button> (ẩn cả nút khỏi screen reader).
    for (const f of htmlFiles) {
        await reporter.test(SB, `Tier 2: [A11y] ${f} — không <button> nào bị aria-hidden`, async () => {
            const html = read(f);
            const bad = [...html.matchAll(/<button\b[^>]*aria-hidden\s*=\s*"true"/gi)];
            assert.strictEqual(bad.length, 0,
                `${f}: có ${bad.length} <button aria-hidden="true"> — phải để aria-hidden trên <span data-icon> bên trong, còn nút cần aria-label`);
        });
    }

    // 2) Nút icon-only (dropzone-clear) phải có aria-label để screen reader đọc được.
    for (const f of ['video-to-video.html']) {
        await reporter.test(SB, `Tier 2: [A11y] ${f} — nút icon-only có aria-label`, async () => {
            const html = read(f);
            const clears = [...html.matchAll(/<button\b[^>]*class="[^"]*dropzone-clear[^"]*"[^>]*>/gi)].map(m => m[0]);
            assert.ok(clears.length > 0, `${f}: không tìm thấy nút dropzone-clear`);
            const noLabel = clears.filter(b => !/aria-label\s*=/.test(b));
            assert.strictEqual(noLabel.length, 0,
                `${f}: ${noLabel.length} nút icon-only thiếu aria-label`);
        });
    }

    // 3) Icon do JS render đã chuyển sang data-icon (runtime tự hydrate).
    for (const f of ['video-to-video.js', 'studio.js', 'flow-queue.js']) {
        await reporter.test(SB, `Tier 2: [Icons] ${f} dùng data-icon cho icon động`, async () => {
            const js = read(f);
            const n = (js.match(/data-icon="/g) || []).length;
            assert.ok(n >= 1, `${f}: chưa có data-icon nào — icon động vẫn là emoji`);
        });
    }
}

// Bộ glyph emoji dùng làm ICON trong 3 HTML tĩnh (từ kiểm kê thật).
// Bao gồm cả dingbat/symbol không thuộc Extended_Pictographic (✕ ✓ ➕ ✍ ⚙ ⚠ ⚡).
const HTML_ICON_GLYPHS = [
    '🎬','✕','✨','📁','🎯','📋','🔍','🎣','💾','🚀','📦','👤','➕','⚙','💡','📊',
    '📥','🌐','📷','🖼','✍','📝','🎙','⚡','📄','✓','🤖','🪙','🎮','💰','🌃','💧',
    '💳','🔄','📉','📡','💻','📭','📹','🏁','⚠'
];

const SI = 'UI/UX Icon System — Phase 1a (ui-ux-pro-max)';
const ICONS_JS = 'icons.js';

async function runIconSystemTests(reporter) {
    const htmlFiles = ['video-to-video.html', 'index.html', 'flow-queue.html'];

    // 1) Runtime icons.js tồn tại: có hydration + mọi icon là <svg>.
    await reporter.test(SI, 'Tier 2: [Icons] icons.js có runtime hydration + toàn SVG', async () => {
        const js = read(ICONS_JS);
        assert.ok(/MutationObserver/.test(js) || /DOMContentLoaded/.test(js),
            'icons.js: thiếu cơ chế hydrate ([data-icon] -> SVG khi load & khi DOM đổi)');
        assert.ok(/data-icon/.test(js), 'icons.js: không tham chiếu thuộc tính data-icon');
        // Mỗi giá trị icon phải là markup <svg ...>
        const svgCount = (js.match(/<svg\b/gi) || []).length;
        assert.ok(svgCount >= 10, `icons.js: chỉ thấy ${svgCount} <svg> — bộ icon quá ít`);
        // SVG phải ẩn với screen reader.
        assert.ok(/aria-hidden/.test(js), 'icons.js: <svg> cần aria-hidden="true"');
    });

    // 2) Mỗi HTML nạp icons.js.
    for (const f of htmlFiles) {
        await reporter.test(SI, `Tier 2: [Icons] ${f} nạp icons.js`, async () => {
            const html = read(f);
            assert.ok(/<script[^>]+src="[^"]*\/studio\/icons\.js"/.test(html),
                `${f}: thiếu <script src="/studio/icons.js">`);
        });
    }

    // 3) Không còn glyph emoji-icon nào trong HTML (đã chuyển hết sang data-icon).
    for (const f of htmlFiles) {
        await reporter.test(SI, `Tier 2: [Icons] ${f} không còn emoji-icon (đã thay SVG)`, async () => {
            const html = read(f);
            const remaining = HTML_ICON_GLYPHS.filter(g => html.includes(g));
            assert.strictEqual(remaining.length, 0,
                `${f}: còn ${remaining.length} emoji-icon chưa thay SVG: ${remaining.join(' ')}`);
        });
    }

    // 4) Mọi data-icon="X" trong HTML đều có định nghĩa trong icons.js (không icon rỗng).
    for (const f of htmlFiles) {
        await reporter.test(SI, `Tier 2: [Icons] ${f} — data-icon đều có định nghĩa trong icons.js`, async () => {
            const html = read(f);
            const js = read(ICONS_JS);
            const names = [...html.matchAll(/data-icon="([^"]+)"/g)].map(m => m[1]);
            if (names.length === 0) {
                assert.fail(`${f}: chưa dùng data-icon nào (chưa thay icon?)`);
            }
            const missing = [...new Set(names)].filter(n => {
                const re = new RegExp('["\'\\.]' + n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '["\'\\s:]');
                return !re.test(js);
            });
            assert.strictEqual(missing.length, 0,
                `${f}: data-icon thiếu định nghĩa trong icons.js: ${missing.join(', ')}`);
        });
    }
}

export default { runUiA11yTests };
