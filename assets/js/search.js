/**
 * Kingston Engineering College – Site-Wide Search
 * Pure frontend fuzzy search using data/search-index.json
 * Features: fuzzy matching, weighted ranking, debounce, keyboard nav
 */

(function () {
    'use strict';

    /* ── Depth-aware asset prefix ───────────────────────────────
       search.js is loaded by the shared header on pages at any depth
       (root, /about/, /departments/, /naac/, /iqac/, /ugc/, …).
       Use a root-absolute base derived from the page path so the index,
       the stylesheet and every result link resolve identically from the
       root page AND from any nested page — fixing the broken-nested-page bug.
       Basedir: the site is served from the repo root, so the leading '/' is
       correct on the deployed static host. */
    const ROOT_PREFIX = (function () {
        // e.g. '/about/about_chairman.html' → '/'
        // This site is deployed at domain root, so '/' is always correct.
        return '/';
    })();
    const INDEX_URL = ROOT_PREFIX + 'data/search-index.json';
    const SEARCH_CSS = ROOT_PREFIX + 'assets/css/search.css';
    const MAX_RESULTS = 7;
    const DEBOUNCE_MS = 300;

    const CATEGORY_ICONS = {
        'General':         { icon: 'fa-solid fa-house',             cls: 'ks-icon-general' },
        'About':           { icon: 'fa-solid fa-building-columns',  cls: 'ks-icon-about' },
        'Departments':     { icon: 'fa-solid fa-graduation-cap',    cls: 'ks-icon-departments' },
        'Academics':       { icon: 'fa-solid fa-book-open',         cls: 'ks-icon-academics' },
        'Admission':       { icon: 'fa-solid fa-file-pen',          cls: 'ks-icon-admission' },
        'Facilities':      { icon: 'fa-solid fa-building',          cls: 'ks-icon-facilities' },
        'Placements':      { icon: 'fa-solid fa-briefcase',         cls: 'ks-icon-placements' },
        'IQAC':            { icon: 'fa-solid fa-star',              cls: 'ks-icon-iqac' },
        'NAAC':            { icon: 'fa-solid fa-award',             cls: 'ks-icon-naac' },
        'Alumni':          { icon: 'fa-solid fa-user-group',        cls: 'ks-icon-alumni' },
        'Policies':        { icon: 'fa-solid fa-scale-balanced',    cls: 'ks-icon-policies' },
        'Examinations':    { icon: 'fa-solid fa-file-lines',        cls: 'ks-icon-examinations' },
        'UGC / Compliance':{ icon: 'fa-solid fa-landmark',         cls: 'ks-icon-ugc' },
        'CSE Department':  { icon: 'fa-solid fa-laptop-code',       cls: 'ks-icon-cse' },
    };

    /* ── State ──────────────────────────────────────────────── */
    let searchIndex = null;
    let debounceTimer = null;
    let focusedIndex = -1;
    let currentResults = [];

    /* ── Inject CSS ─────────────────────────────────────────── */
    function injectCSS() {
        if (document.querySelector('link[data-ks-search]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = SEARCH_CSS;
        link.setAttribute('data-ks-search', '1');
        document.head.appendChild(link);
    }

    /* ── Load index ─────────────────────────────────────────── */
    async function loadIndex() {
        try {
            const res = await fetch(INDEX_URL);
            searchIndex = await res.json();
            // Normalise every entry URL to root-relative so result links work
            // from any page depth. Stored values are bare ('about/foo.html');
            // leading-slash makes them absolute-from-root.
            if (Array.isArray(searchIndex)) {
                searchIndex.forEach(e => {
                    if (e && typeof e.url === 'string' && e.url && !e.url.startsWith('/') && !/^https?:/i.test(e.url)) {
                        e.url = ROOT_PREFIX + e.url;
                    }
                    // SECURITY (SEC-007): strip non-link schemes (javascript: etc.)
                    // — the index is build-time generated from trusted repo content,
                    // but defence-in-depth: no path may ever carry an active scheme.
                    if (e && typeof e.url === 'string' && /^(javascript|data|vbscript):/i.test(e.url)) {
                        e.url = '#';
                    }
                });
            }
        } catch (e) {
            console.warn('[KS Search] Could not load search index.', e);
        }
    }

    /* ── Build DOM ──────────────────────────────────────────── */
    function buildUI() {
        /* Idempotency guard: if the overlay already exists (e.g. this script
           was loaded more than once), never inject a second copy — duplicate
           IDs break getElementById and event binding. */
        if (document.getElementById('ks-search-overlay')) return;

        /* Overlay */
        const overlay = document.createElement('div');
        overlay.id = 'ks-search-overlay';
        overlay.className = 'ks-search-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Site Search');

        overlay.innerHTML = `
            <div class="ks-search-box" role="search">
                <div class="ks-search-input-row">
                    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                    <input
                        id="ks-search-input"
                        type="text"
                        placeholder="Search pages, departments, courses…"
                        autocomplete="off"
                        spellcheck="false"
                        aria-autocomplete="list"
                        aria-label="Search"
                    />
                    <button class="ks-search-close" id="ks-search-close" aria-label="Close search">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="ks-search-results" id="ks-search-results" role="listbox">
                    <div class="ks-search-hint">Start typing to search across all pages…</div>
                </div>
                <div class="ks-search-footer">
                    <span class="ks-kbd"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                    <span class="ks-kbd"><kbd>Enter</kbd> open</span>
                    <span class="ks-kbd"><kbd>Esc</kbd> close</span>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        /* Wire up existing trigger button from header.html */
        const existingTrigger = document.getElementById('ks-search-trigger');
        if (existingTrigger) {
            existingTrigger.addEventListener('click', openSearch);
        }

        /* Events */
        document.getElementById('ks-search-close').addEventListener('click', closeSearch);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSearch(); });

        const input = document.getElementById('ks-search-input');
        input.addEventListener('input', onInput);
        input.addEventListener('keydown', onKeydown);

        document.addEventListener('keydown', (e) => {
            if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && !isSearchOpen()) {
                e.preventDefault();
                openSearch();
            }
            if (e.key === 'Escape' && isSearchOpen()) {
                closeSearch();
            }
        });
    }

    /* ── Open / Close ───────────────────────────────────────── */
    function isSearchOpen() {
        const overlay = document.getElementById('ks-search-overlay');
        return overlay && overlay.classList.contains('ks-active');
    }

    function openSearch() {
        const overlay = document.getElementById('ks-search-overlay');
        if (!overlay) return;
        overlay.classList.add('ks-active');
        setTimeout(() => {
            const input = document.getElementById('ks-search-input');
            if (input) { input.focus(); input.select(); }
        }, 80);
        document.body.style.overflow = 'hidden';
    }

    function closeSearch() {
        const overlay = document.getElementById('ks-search-overlay');
        if (!overlay) return;
        overlay.classList.remove('ks-active');
        document.body.style.overflow = '';
        focusedIndex = -1;
        currentResults = [];
    }

    /* ── Debounced input ────────────────────────────────────── */
    function onInput(e) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runSearch(e.target.value.trim()), DEBOUNCE_MS);
    }

    /* ── Keyboard navigation ────────────────────────────────── */
    function onKeydown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveFocus(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveFocus(-1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const items = document.querySelectorAll('.ks-result-item');
            if (focusedIndex >= 0 && items[focusedIndex]) {
                items[focusedIndex].click();
            }
        }
    }

    function moveFocus(dir) {
        const items = document.querySelectorAll('.ks-result-item');
        if (!items.length) return;
        items.forEach(el => el.classList.remove('ks-focused'));
        focusedIndex = Math.max(0, Math.min(items.length - 1, focusedIndex + dir));
        if (items[focusedIndex]) {
            items[focusedIndex].classList.add('ks-focused');
            items[focusedIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    /* ── Fuzzy / Weighted Search ────────────────────────────── */

    /**
     * Fuzzy match: checks if all characters of `needle` appear in order in `haystack`.
     * Returns a score: 0 = no match, higher = better.
     */
    function fuzzyScore(needle, haystack) {
        if (!needle || !haystack) return 0;
        const n = needle.toLowerCase();
        const h = haystack.toLowerCase();

        // Exact substring – highest base score
        if (h.includes(n)) {
            // Bonus if it starts the field
            return h.startsWith(n) ? 100 : 60;
        }

        // Word boundary match: all needle words appear as substrings
        const needleWords = n.split(/\s+/).filter(Boolean);
        if (needleWords.length > 1) {
            const allWordMatch = needleWords.every(w => h.includes(w));
            if (allWordMatch) return 40;
        }

        // Character-sequence fuzzy match
        let ni = 0;
        let score = 0;
        let consecutive = 0;
        for (let hi = 0; hi < h.length && ni < n.length; hi++) {
            if (h[hi] === n[ni]) {
                ni++;
                consecutive++;
                score += consecutive; // reward consecutive chars
            } else {
                consecutive = 0;
            }
        }
        if (ni < n.length) return 0; // all chars must appear
        return Math.min(score, 30); // cap fuzzy bonus
    }

    function scoreEntry(entry, query) {
        const q = query.toLowerCase();
        let total = 0;

        const titleScore = fuzzyScore(q, entry.title);
        total += titleScore * 3; // title weight ×3

        const keywordScore = Math.max(...(entry.keywords || []).map(k => fuzzyScore(q, k)));
        total += keywordScore * 2; // keyword weight ×2

        const descScore = fuzzyScore(q, entry.description);
        total += descScore * 1; // description weight ×1

        return total;
    }

    function runSearch(query) {
        const resultsEl = document.getElementById('ks-search-results');
        if (!resultsEl) return;

        focusedIndex = -1;
        currentResults = [];

        if (!query) {
            resultsEl.innerHTML = '<div class="ks-search-hint">Start typing to search across all pages…</div>';
            return;
        }

        if (!searchIndex) {
            resultsEl.innerHTML = '<div class="ks-search-hint">Loading index…</div>';
            return;
        }

        // Score all entries
        const scored = searchIndex
            .map(entry => ({ entry, score: scoreEntry(entry, query) }))
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_RESULTS);

        if (!scored.length) {
            resultsEl.innerHTML = `
                <div class="ks-no-results">
                    <strong>No results for "${escapeHtml(query)}"</strong>
                    Try different keywords or check spelling
                </div>`;
            return;
        }

        currentResults = scored.map(r => r.entry);
        renderResults(scored, query);
    }

    /* ── Highlight matched text ─────────────────────────────── */
    function highlight(text, query) {
        if (!query) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const words = query.split(/\s+/).filter(Boolean).map(w => escapeRegex(w));
        if (!words.length) return escaped;
        const pattern = new RegExp(`(${words.join('|')})`, 'gi');
        return escaped.replace(pattern, '<mark>$1</mark>');
    }

    /* ── Render ─────────────────────────────────────────────── */
    function renderResults(scored, query) {
        const resultsEl = document.getElementById('ks-search-results');

        // Group by category
        const groups = {};
        scored.forEach(({ entry }) => {
            const cat = entry.category || 'General';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(entry);
        });

        let html = '';
        for (const [cat, entries] of Object.entries(groups)) {
            html += `<div class="ks-result-category">${escapeHtml(cat)}</div>`;
            entries.forEach(entry => {
                const iconData = CATEGORY_ICONS[cat] || CATEGORY_ICONS['General'];
                // SECURITY (SEC-007): escape the URL and enforce a safe scheme — a
                // build-time index entry must not become a javascript: or attribute
                // injection vector when rendered into href.
                const safeUrl = escapeHtml(safeHref(entry.url));
                html += `
                    <a href="${safeUrl}" class="ks-result-item" role="option">
                        <div class="ks-result-icon">
                            <i class="${iconData.icon} ${iconData.cls}"></i>
                        </div>
                        <div class="ks-result-text">
                            <div class="ks-result-title">${highlight(entry.title, query)}</div>
                            <div class="ks-result-desc">${escapeHtml(entry.description)}</div>
                        </div>
                        <div class="ks-result-arrow"><i class="fa-solid fa-arrow-right"></i></div>
                    </a>`;
            });
        }

        resultsEl.innerHTML = html;
    }

    /* ── Utilities ──────────────────────────────────────────── */
    // Sanitize a URL for use in href: only allow root-relative or http(s).
    // Prevents javascript:/data:/vbscript: or attribute-injection via the index.
    function safeHref(u) {
        if (!u || typeof u !== 'string') return '#';
        if (!/^(\/|https?:)/i.test(u)) return '#';
        return u;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /* ── Bootstrap ──────────────────────────────────────────── */
    async function init() {
        injectCSS();
        await loadIndex();
        buildUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
