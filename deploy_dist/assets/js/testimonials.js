/**
 * testimonials.js  (v2 — Enhanced Interactivity)
 * Modular script for testimonials.html
 * Features: JSON fetch, card rendering, department filtering,
 *           empty state, live count badge, animated stat counters,
 *           smooth fade-swap transitions, keyboard navigation.
 */
(function () {
    'use strict';

    /* ── Constants ─────────────────────────────────────── */
    var DATA_URL       = 'data/testimonials.json';
    var CLG_LOGO       = 'assets/images/testimonials/clg-logo.png';
    var FALLBACK_PHOTO = 'assets/images/testimonials/noname.jpeg';
    var FALLBACK_LOGO  = 'assets/images/icons/logo.png';

    /* ── State ─────────────────────────────────────────── */
    var allTestimonials = [];
    var activeFilter    = 'all';
    var isRendering     = false;

    /* ── DOM refs ────────────────────────────────────────── */
    var grid, loadingEl, emptyEl, countBadge, filterBtns;

    /* ─────────────────────────────────────────────────────
       ANIMATED STAT COUNTERS
       Fires once when the hero section enters the viewport.
    ───────────────────────────────────────────────────── */
    function animateCounter(el, target, duration) {
        var startTs = null;
        var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (prefersReduced) { el.textContent = target; return; }

        function step(ts) {
            if (!startTs) startTs = ts;
            var progress = Math.min((ts - startTs) / duration, 1);
            var eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            el.textContent = Math.round(eased * target);
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function initCounters(totalCount) {
        var counters = [
            { id: 'stat-total',     val: totalCount },
            { id: 'stat-depts',     val: 6  },
            { id: 'stat-companies', val: 20 },
            { id: 'stat-countries', val: 3  }
        ];

        var hero = document.querySelector('.testi-page-hero');
        if (!hero) return;

        var fired = false;
        var obs = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting && !fired) {
                fired = true;
                counters.forEach(function (c) {
                    var el = document.getElementById(c.id);
                    if (el) animateCounter(el, c.val, 1200);
                });
                obs.disconnect();
            }
        }, { threshold: 0.3 });

        obs.observe(hero);
    }

    /* ─────────────────────────────────────────────────────
       CARD BUILDER
    ───────────────────────────────────────────────────── */
    function buildCard(t, delay) {
        var el = document.createElement('article');
        el.className = 'testi-page-card';
        el.setAttribute('role', 'listitem');
        el.setAttribute('data-dept', t.department);
        el.setAttribute('data-aos', 'fade-up');
        el.setAttribute('data-aos-delay', delay || 0);
        el.setAttribute('tabindex', '0');

        var nameSafe  = escHtml(t.name);
        var compSafe  = escHtml(t.company);
        var deptSafe  = escHtml(t.department);
        var deptFull  = escHtml(t.department_full);
        var desgSafe  = escHtml(t.designation);
        var quoteSafe = escHtml(t.quote);

        el.innerHTML =
            '<div class="testi-page-logos-row">' +
                '<img src="' + CLG_LOGO + '" class="testi-page-clg-logo" ' +
                     'alt="Kingston Engineering College Logo" loading="lazy" ' +
                     'onerror="this.style.visibility=\'hidden\'">' +
                '<img src="' + escAttr(t.company_logo_path) + '" class="testi-page-comp-logo" ' +
                     'alt="' + compSafe + ' Logo" loading="lazy" ' +
                     'onerror="this.src=\'' + FALLBACK_LOGO + '\'">' +
            '</div>' +
            '<div class="testi-page-photo-wrap">' +
                '<img src="' + escAttr(t.photo_path) + '" alt="Photo of ' + nameSafe + '" loading="lazy" ' +
                     'onerror="this.src=\'' + FALLBACK_PHOTO + '\'">' +
            '</div>' +
            '<div class="testi-page-name">' + nameSafe + '</div>' +
            '<div class="testi-page-designation">' + desgSafe + '</div>' +
            '<div class="testi-page-meta">' + deptFull + ' &bull; ' + compSafe + '</div>' +
            '<span class="testi-page-dept-badge" aria-label="Department: ' + deptSafe + '">' + deptSafe + '</span>' +
            '<div class="testi-page-divider" aria-hidden="true"></div>' +
            '<p class="testi-page-quote">' + quoteSafe + '</p>';

        return el;
    }

    /* ─────────────────────────────────────────────────────
       RENDER — with smooth fade-out → swap transition
    ───────────────────────────────────────────────────── */
    function render(dept) {
        if (isRendering) return;
        isRendering = true;

        var existing = grid.querySelectorAll('.testi-page-card');

        if (existing.length > 0) {
            existing.forEach(function (c) {
                c.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                c.style.opacity    = '0';
                c.style.transform  = 'translateY(6px)';
            });
            setTimeout(function () { swapCards(dept); }, 220);
        } else {
            swapCards(dept);
        }
    }

    function swapCards(dept) {
        grid.querySelectorAll('.testi-page-card').forEach(function (c) { c.remove(); });

        var filtered = dept === 'all'
            ? allTestimonials
            : allTestimonials.filter(function (t) { return t.department === dept; });

        countBadge.textContent = filtered.length + ' result' + (filtered.length !== 1 ? 's' : '');

        if (filtered.length === 0) {
            emptyEl.classList.add('visible');
        } else {
            emptyEl.classList.remove('visible');
            var frag = document.createDocumentFragment();
            filtered.forEach(function (t, i) {
                frag.appendChild(buildCard(t, Math.min(i * 55, 360)));
            });
            grid.insertBefore(frag, emptyEl);
            if (window.AOS) window.AOS.refresh();
        }

        isRendering = false;
    }

    /* ─────────────────────────────────────────────────────
       FILTER BUTTONS
    ───────────────────────────────────────────────────── */
    function activateFilter(dept) {
        if (dept === activeFilter) return;
        activeFilter = dept;
        filterBtns.forEach(function (btn) {
            var isActive = btn.getAttribute('data-dept') === dept;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        render(dept);
    }

    /* ─────────────────────────────────────────────────────
       INIT
    ───────────────────────────────────────────────────── */
    function init() {
        grid       = document.getElementById('testi-grid');
        loadingEl  = document.getElementById('testi-loading');
        countBadge = document.getElementById('testi-count-badge');
        filterBtns = document.querySelectorAll('.filter-btn');

        if (!grid) return;

        // Empty state element
        emptyEl = document.createElement('div');
        emptyEl.className = 'testi-empty-state';
        emptyEl.setAttribute('role', 'status');
        emptyEl.innerHTML =
            '<div class="testi-empty-icon" aria-hidden="true">' +
            '<i class="fa-solid fa-users-slash"></i></div>' +
            '<h3>No testimonials found</h3>' +
            '<p>No alumni from this department have shared their stories yet. Check back soon!</p>';
        grid.appendChild(emptyEl);

        // Wire filter buttons — click + keyboard
        filterBtns.forEach(function (btn) {
            var dept = btn.getAttribute('data-dept');
            btn.setAttribute('aria-pressed', dept === 'all' ? 'true' : 'false');

            btn.addEventListener('click', function () { activateFilter(dept); });

            btn.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activateFilter(dept);
                }
            });
        });

        // Fetch testimonials
        fetch(DATA_URL)
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                allTestimonials = data;
                if (loadingEl) loadingEl.remove();
                initCounters(data.length);
                render('all');
            })
            .catch(function (err) {
                console.error('[testimonials.js] fetch error:', err);
                if (loadingEl) {
                    loadingEl.innerHTML =
                        '<i class="fa-solid fa-triangle-exclamation" ' +
                        'style="font-size:2rem;color:#c0392b;display:block;margin-bottom:12px;"></i>' +
                        'Unable to load testimonials. Please refresh the page.';
                }
            });
    }

    /* ── Helpers ─────────────────────────────────────────── */
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function escAttr(str) {
        return String(str).replace(/'/g, "\\'");
    }

    /* Boot */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
