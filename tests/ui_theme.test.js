/**
 * tests/ui_theme.test.js
 *
 * TDD Phase 3 (ui-ux-pro-max) — Theme sáng/tối + bỏ gradient.
 *  - studio.css có bộ token LIGHT qua [data-theme="light"] + @media(prefers-color-scheme:light).
 *  - Bỏ gradient ở badge thương hiệu + nút primary (màu đặc, tránh look "AI").
 *  - Runtime theme.js + nút toggle có mặt ở cả 3 trang studio.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.join(__dirname, '..', 'public', 'studio');
const S = 'UI/UX Theme — Phase 3 (light/dark + no-gradient)';
const read = (rel) => fs.readFileSync(path.join(STUDIO, rel), 'utf-8');

export async function runUiThemeTests(reporter) {
    // 1) studio.css có bộ token light (toggle + theo OS).
    await reporter.test(S, 'Tier 2: [Theme] studio.css có bộ token light', async () => {
        const css = read('studio.css');
        assert.ok(/:root\[data-theme="light"\]/.test(css), 'thiếu :root[data-theme="light"]');
        assert.ok(/prefers-color-scheme:\s*light/.test(css), 'thiếu @media (prefers-color-scheme: light)');
        // Bên trong light phải định nghĩa lại nền/chữ (không để dark lòi ra).
        assert.ok(/--bg-primary/.test(css) && /--text-primary/.test(css), 'thiếu token nền/chữ');
    });

    // 2) Bỏ gradient ở badge + nút primary (dùng màu đặc).
    await reporter.test(S, 'Tier 2: [Theme] .logo-badge dùng màu đặc (không gradient)', async () => {
        const css = read('studio.css');
        const m = css.match(/\.logo-badge\s*\{[^}]*\}/);
        assert.ok(m, 'không tìm thấy .logo-badge');
        assert.ok(!/linear-gradient/.test(m[0]), '.logo-badge vẫn còn linear-gradient');
    });
    await reporter.test(S, 'Tier 2: [Theme] .v2v-btn.primary dùng màu đặc (không gradient)', async () => {
        const css = read('video-to-video.css');
        const m = css.match(/\.v2v-btn\.primary\s*\{[^}]*\}/);
        assert.ok(m, 'không tìm thấy .v2v-btn.primary');
        assert.ok(!/linear-gradient/.test(m[0]), '.v2v-btn.primary vẫn còn linear-gradient');
    });

    // 3) Runtime theme.js + toggle ở cả 3 trang.
    await reporter.test(S, 'Tier 2: [Theme] theme.js có persist + set data-theme', async () => {
        const js = read('theme.js');
        assert.ok(/localStorage/.test(js), 'theme.js: thiếu localStorage (nhớ lựa chọn)');
        assert.ok(/data-theme/.test(js), 'theme.js: thiếu set data-theme');
    });
    for (const f of ['index.html', 'video-to-video.html', 'flow-queue.html']) {
        await reporter.test(S, `Tier 2: [Theme] ${f} nạp theme.js + có nút toggle`, async () => {
            const html = read(f);
            assert.ok(/<script[^>]+src="[^"]*\/studio\/theme\.js"/.test(html), `${f}: thiếu <script src="/studio/theme.js">`);
            assert.ok(/data-theme-toggle/.test(html), `${f}: thiếu nút [data-theme-toggle]`);
        });
    }
}

export default { runUiThemeTests };
