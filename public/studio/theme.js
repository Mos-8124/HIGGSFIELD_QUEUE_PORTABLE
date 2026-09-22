/**
 * public/studio/theme.js
 *
 * Phase 3 — Runtime theme sáng/tối cho 3 trang studio tĩnh (V2 GTF).
 * Classic browser script (KHÔNG phải ES module) — nạp bằng
 * <script src="/studio/theme.js"></script>, càng sớm càng tốt trong <head>
 * để tránh flash sai theme.
 *
 * Cơ chế:
 *  - Đọc localStorage['gtf-theme'] ('light' | 'dark'). Nếu có, set
 *    document.documentElement[data-theme] = giá trị đó (người dùng đã chọn
 *    tường minh, thắng OS/system setting).
 *  - Nếu không có gì lưu trước, KHÔNG set data-theme — CSS tự quyết theo
 *    prefers-color-scheme (xem studio.css :root[data-theme] + @media block).
 *  - window.GTFTheme.toggle() đổi theme hiện tại, persist vào localStorage,
 *    và cập nhật mọi nút [data-theme-toggle] trên trang.
 *
 * try/catch toàn bộ — không bao giờ throw ra ngoài (an toàn nếu localStorage
 * bị chặn, ví dụ private mode/browser policy).
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'gtf-theme';

    function getStoredTheme() {
        try {
            var v = window.localStorage.getItem(STORAGE_KEY);
            if (v === 'light' || v === 'dark') return v;
        } catch (err) {
            try { console.warn('[theme.js] localStorage read failed', err); } catch (e2) { /* noop */ }
        }
        return null;
    }

    function setStoredTheme(value) {
        try {
            window.localStorage.setItem(STORAGE_KEY, value);
        } catch (err) {
            try { console.warn('[theme.js] localStorage write failed', err); } catch (e2) { /* noop */ }
        }
    }

    function getEffectiveTheme() {
        try {
            var explicit = document.documentElement.getAttribute('data-theme');
            if (explicit === 'light' || explicit === 'dark') return explicit;
        } catch (err) { /* noop */ }
        try {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
        } catch (err) { /* noop */ }
        return 'light';
    }

    function applyStoredThemeOnLoad() {
        try {
            var stored = getStoredTheme();
            if (stored) {
                document.documentElement.setAttribute('data-theme', stored);
            }
            // Không set gì nếu absent — để CSS tự quyết theo prefers-color-scheme.
        } catch (err) {
            try { console.warn('[theme.js] applyStoredThemeOnLoad failed', err); } catch (e2) { /* noop */ }
        }
    }

    function updateToggleButton(btn, effective) {
        try {
            var isDark = effective === 'dark';
            // Icon: khi đang dark, hiện 'sun' (bấm để chuyển sang sáng); khi đang light, hiện 'moon'.
            var iconName = isDark ? 'sun' : 'moon';
            var iconSpan = btn.querySelector('[data-icon]');
            if (iconSpan) {
                if (iconSpan.getAttribute('data-icon') !== iconName) {
                    iconSpan.setAttribute('data-icon', iconName);
                    iconSpan.removeAttribute('data-icon-done');
                    if (window.GTFIcons && typeof window.GTFIcons.hydrate === 'function') {
                        window.GTFIcons.hydrate(iconSpan.parentNode || document);
                    }
                }
            }
            var textNode = btn.querySelector('[data-theme-toggle-label]');
            var label = isDark ? 'Sáng' : 'Tối';
            if (textNode) {
                textNode.textContent = label;
            }
            btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        } catch (err) {
            try { console.warn('[theme.js] updateToggleButton failed', err); } catch (e2) { /* noop */ }
        }
    }

    function refreshToggleButtons() {
        try {
            var effective = getEffectiveTheme();
            var buttons = document.querySelectorAll('[data-theme-toggle]');
            for (var i = 0; i < buttons.length; i++) {
                updateToggleButton(buttons[i], effective);
            }
        } catch (err) {
            try { console.warn('[theme.js] refreshToggleButtons failed', err); } catch (e2) { /* noop */ }
        }
    }

    function toggle() {
        try {
            var current = getEffectiveTheme();
            var next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            setStoredTheme(next);
            refreshToggleButtons();
            return next;
        } catch (err) {
            try { console.warn('[theme.js] toggle failed', err); } catch (e2) { /* noop */ }
            return null;
        }
    }

    function wireToggleButtons() {
        try {
            var buttons = document.querySelectorAll('[data-theme-toggle]');
            for (var i = 0; i < buttons.length; i++) {
                (function (btn) {
                    try {
                        btn.addEventListener('click', function (ev) {
                            try { ev.preventDefault(); } catch (e3) { /* noop */ }
                            toggle();
                        });
                    } catch (err) { /* noop */ }
                })(buttons[i]);
            }
            refreshToggleButtons();
        } catch (err) {
            try { console.warn('[theme.js] wireToggleButtons failed', err); } catch (e2) { /* noop */ }
        }
    }

    try {
        applyStoredThemeOnLoad();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', wireToggleButtons);
        } else {
            wireToggleButtons();
        }
    } catch (err) {
        try { console.warn('[theme.js] setup failed', err); } catch (e2) { /* noop */ }
    }

    window.GTFTheme = { toggle: toggle, getEffectiveTheme: getEffectiveTheme, refreshToggleButtons: refreshToggleButtons };
})();
