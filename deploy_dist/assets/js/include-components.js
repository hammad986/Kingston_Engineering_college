/**
 * ============================================
 * Include Components - Single Source of Truth Loader
 * ============================================
 * 
 * This script loads header, footer, and navbar from components/
 * and injects them into the page BEFORE other scripts run.
 * 
 * CRITICAL DESIGN:
 * - Uses synchronous XMLHttpRequest (blocking) so components are
 *   available before DOMContentLoaded fires and other scripts run.
 * - If synchronous fails (file:// protocol), falls back to async fetch
 *   and dispatches a custom event for dependent scripts.
 * - Sets window.__componentsReady flag for script.js to check.
 * 
 * USAGE in migrated pages:
 *   <script src="assets/js/include-components.js"></script>
 * 
 * COMPONENT PLACEHOLDER divs (replaced by this script):
 *   <div id="include-header"></div>
 *   <div id="include-footer"></div>
 * 
 * NOTE: <div id="include-navbar"> has been REMOVED. Navbar is now merged into header.html.
 * 
 * ALTERNATIVE (SSI - Server Side Includes):
 *   If server supports SSI (Apache .htaccess), use:
 *     <!--#include virtual="/components/header.html" -->
 *     <!--#include virtual="/components/navbar.html" -->
 *     <!--#include virtual="/components/footer.html" -->
 * 
 * ALTERNATIVE (Build Tool):
 *   For production, consider a build step (Gulp/Webpack/PHP include)
 *   that inlines these at build time for zero JS dependency.
 * 
 * NOTE: Pages that still have inline header/footer/navbar (not yet
 * migrated) will not have the placeholder divs, so this script
 * simply skips them. Existing behaviour is fully preserved.
 */

(function() {
    'use strict';

    // ── Inject favicon + touch icons into <head> if not already present ──
    // Only injects if NO favicon link currently exists (to avoid duplicating on
    // pages that have a hardcoded favicon in their <head>).
    (function injectFavicon() {
        if (document.querySelector('link[rel="icon"]')) return;
        var head = document.head;
        var icons = [
            { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
            { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
            { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
            { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        ];
        icons.forEach(function(ic) {
            var link = document.createElement('link');
            link.rel = ic.rel;
            link.href = ic.href;
            if (ic.type) link.type = ic.type;
            if (ic.sizes) link.sizes = ic.sizes;
            head.appendChild(link);
        });
    })();

    // ── Inject search stylesheet ──
    (function injectSearchCSS() {
        if (document.querySelector('link[href*="search.css"]')) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/assets/css/search.css';
        document.head.appendChild(link);
    })();

    // ── Load search.js — after DOM ready ──
    (function loadSearchJS() {
        if (document.querySelector('script[src*="search.js"]')) return;
        var done = false;
        function onReady() {
            if (done) return;
            done = true;
            var s = document.createElement('script');
            s.src = '/assets/js/search.js';
            s.defer = true;
            document.head.appendChild(s);
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', onReady);
        } else {
            onReady();
        }
    })();

    // ── Note: mega-menu.css and mega-menu.js are intentionally NOT loaded here.
    // The current navigation system uses style.css for all dropdown/mega-menu styles
    // and script.js for all PSD panel switching logic.
    // The old mega-menu system had conflicting .flyout-trigger selectors that
    // interfered with the PSD two-panel mega menu.

    // Calculate path prefix for assets based on page depth
    function getAssetPrefix() {
        var path = window.location.pathname;
        var depth = path.split('/').length - 2;
        if (depth <= 0) return '';
        return '../'.repeat(depth);
    }

    var prefix = getAssetPrefix();
    var COMPONENT_BASE = prefix + 'components/';

    // Rewrite relative asset paths inside component HTML to be page-relative
    function rewriteAssetPaths(html) {
        if (prefix === '') return html; // Root page - no rewrite needed
        var p = prefix;
        // 1. Rewrite src="assets/..." to src="../assets/..." (or deeper)
        html = html.replace(/(src=|href=)(['"])assets\//gi, '$1$2' + p + 'assets/');
        // 2. Rewrite url(assets/...), url("assets/...), url('assets/...) - preserves optional quote
        html = html.replace(/url\(\s*(['"]?)assets\//gi, 'url($1' + p + 'assets/');
        return html;
    }

    // Components configuration
    // NOTE: navbar has been merged into header.html. No separate navbar component.
    var components = [
        { id: 'include-header', file: 'header.html' },
        { id: 'include-footer', file: 'footer.html' }
    ];

    var CACHE_KEY_PREFIX = 'kec_comp_v3_';
    function getCached(file) {
        try {
            return window.sessionStorage ? sessionStorage.getItem(CACHE_KEY_PREFIX + file) : null;
        } catch (e) {
            return null;
        }
    }
    function setCached(file, html) {
        try {
            if (window.sessionStorage && html) sessionStorage.setItem(CACHE_KEY_PREFIX + file, html);
        } catch (e) {}
    }

    var loaded = 0;
    var totalToLoad = 0;

    // Count how many placeholders actually exist on this page
    components.forEach(function(c) {
        if (document.getElementById(c.id)) {
            totalToLoad++;
        }
    });

    // If no placeholders found, this page has inline components (not migrated yet)
    if (totalToLoad === 0) {
        window.__componentsReady = true;
        return; // Nothing to do
    }

    // --- SYNCHRONOUS LOADING (with sessionStorage cache fast-path) ---
    function loadSync() {
        try {
            components.forEach(function(c) {
                var placeholder = document.getElementById(c.id);
                if (!placeholder) return;

                var rawHtml = getCached(c.file);
                if (!rawHtml) {
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', COMPONENT_BASE + c.file, false); // false = synchronous
                    xhr.send(null);

                    if (xhr.status === 200 || xhr.status === 0) {
                        rawHtml = xhr.responseText;
                        setCached(c.file, rawHtml);
                    } else {
                        console.warn('Kingston Components: Failed to load ' + c.file + ' (status ' + xhr.status + ')');
                        placeholder.outerHTML = '<!-- ' + c.file + ' failed to load -->';
                        loaded++;
                        return;
                    }
                }

                var componentHtml = rewriteAssetPaths(rawHtml);
                placeholder.outerHTML = componentHtml;
                loaded++;
            });

            window.__componentsReady = true;
            document.dispatchEvent(new CustomEvent('componentsLoaded'));
            return true;
        } catch (e) {
            // Synchronous XHR failed (likely file:// protocol)
            return false;
        }
    }

    // --- ASYNC LOADING (fallback) ---
    function loadAsync() {
        var asyncLoaded = 0;

        function onComponentDone() {
            asyncLoaded++;
            if (asyncLoaded === totalToLoad) {
                window.__componentsReady = true;
                document.dispatchEvent(new CustomEvent('componentsLoaded'));
            }
        }

        components.forEach(function(c) {
            var placeholder = document.getElementById(c.id);
            if (!placeholder) {
                onComponentDone();
                return;
            }

            var cached = getCached(c.file);
            if (cached) {
                placeholder.outerHTML = rewriteAssetPaths(cached);
                onComponentDone();
                return;
            }

            fetch(COMPONENT_BASE + c.file)
                .then(function(response) {
                    if (!response.ok) throw new Error('Status ' + response.status);
                    return response.text();
                })
                .then(function(html) {
                    setCached(c.file, html);
                    var rewrittenHtml = rewriteAssetPaths(html);
                    placeholder.outerHTML = rewrittenHtml;
                    onComponentDone();
                })
                .catch(function(err) {
                    console.warn('Kingston Components: ' + c.file + ' failed -', err.message);
                    placeholder.outerHTML = '<!-- ' + c.file + ' failed to load -->';
                    onComponentDone();
                });
        });
    }

    // Try synchronous first, fall back to async
    if (!loadSync()) {
        // Sync failed (file:// protocol), use async with event dispatch
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() { loadAsync(); });
        } else {
            loadAsync();
        }
    }
})();
