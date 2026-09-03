document.addEventListener('DOMContentLoaded', () => {

    /* ==========================================
       1. INITIALIZE AOS (Animate On Scroll)
       ========================================== */
    if (typeof AOS !== 'undefined') {
        AOS.init({
            once: true,
            offset: 100,
            duration: 800,
            easing: 'ease-out-cubic',
            // Mobile: slide/fade entrance transforms briefly push content past the
            // viewport (create horizontal scroll + layout shift). Disable at ≤1024px.
            disable: function() { return window.innerWidth < 1024; }
        });
    }

    /* ==========================================
       2. POPULATE NAVIGATION DROPDOWNS
       ========================================== */
    /* ── Only add caret icons to nav items that actually have dropdown content ── */
    document.querySelectorAll('.nav-links > li.has-dropdown > a, .nav-links > li.flyout-trigger > a').forEach(link => {
        const nextEl = link.nextElementSibling;
        if (nextEl && (nextEl.classList.contains('dropdown') || nextEl.classList.contains('psd-mega-menu'))) {
            // Check if there are actual list items inside (not empty)
            const hasItems = nextEl.querySelector('li, a');
            if (hasItems) {
                link.innerHTML = link.innerHTML + ' <i class="fa-solid fa-caret-down text-xs ml-1"></i>';
            }
        }
    });

    // --- Hero Side Box Slider (Removed) ---

    /* ==========================================
       4. INITIALIZE SWIPER SLIDERS
       ========================================== */

    // --- Hero Background Slider (Removed) ---

    // --- News Slider — populated by assets/js/news.js ---

    // --- Testimonials Slider — loaded from data/testimonials.json ---
    const testWrapper = document.getElementById('testimonials-wrapper');
    if (testWrapper) {
        const CLG_LOGO = 'assets/images/testimonials/clg-logo.png';
        const FALLBACK_PHOTO = 'assets/images/testimonials/noname.jpeg';
        const FALLBACK_LOGO = 'assets/images/icons/logo.png';

        function buildTestiCard(t) {
            return `
            <div class="swiper-slide">
                <div class="testi-card">
                    <div class="testi-logos-row">
                        <img src="${CLG_LOGO}" class="testi-clg-logo" alt="Kingston Engineering College Logo" loading="lazy"
                             onerror="this.style.visibility='hidden'">
                        <img src="${t.company_logo_path}" class="testi-comp-logo" alt="${t.company} Logo" loading="lazy"
                             onerror="this.src='${FALLBACK_LOGO}'">
                    </div>
                    <div class="testi-photo-wrap">
                        <img src="${t.photo_path}" alt="Photo of ${t.name}" loading="lazy"
                             onerror="this.src='${FALLBACK_PHOTO}'">
                    </div>
                    <div class="testi-name">${t.name}</div>
                    <div class="testi-meta">${t.department_full} &bull; ${t.company}</div>
                    <p class="testi-quote">${t.quote}</p>
                </div>
            </div>`;
        }

        fetch('data/testimonials.json')
            .then(function(r) {
                if (!r.ok) throw new Error('Failed to load testimonials');
                return r.json();
            })
            .then(function(data) {
                testWrapper.innerHTML = data.map(buildTestiCard).join('');

                const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                if (typeof Swiper !== 'undefined') {
                    new Swiper('#testimonials-slider', {
                        slidesPerView: 1,
                        spaceBetween: 24,
                        loop: true,
                        autoHeight: false,
                        pauseOnMouseEnter: true,
                        autoplay: {
                            delay: prefersReducedMotion ? 0 : 3500,
                            disableOnInteraction: false,
                            pauseOnMouseEnter: true,
                        },
                        speed: prefersReducedMotion ? 0 : 600,
                        breakpoints: {
                            640:  { slidesPerView: 2 },
                            1024: { slidesPerView: 4 }
                        }
                    });
                }
            })
            .catch(function(e) {
                console.warn('testimonials: fetch failed', e);
                testWrapper.innerHTML = '<div class="swiper-slide"><p style="padding:20px;color:#666;">Testimonials temporarily unavailable.</p></div>';
            });
    }


    /* ==========================================
       5. MOBILE NAVBAR — Full Featured
       ========================================== */
    /* ── Viewport-mode body class (single source of truth for tap behaviour) ──
       The tap/accordion gate previously relied on `window.innerWidth <= 1024`
       scattered in the click handlers. Any handler that runs while a page is
       zoomed, or on touch laptops/2-in-1s whose viewport sits just over the
       boundary, silently skips preventDefault → the parent navigates on first
       tap, which reads as "hover / long-press" behaviour (reported for NAAC,
       which is simply the deepest menu the owner tested). We now drive a
       `ks-mobile-nav` body class from BOTH width and coarse-pointer media, and
       gate on `document.body.classList.contains('ks-mobile-nav')`. */
    function ksSyncMobileNavClass() {
        var mobile = window.matchMedia('(max-width: 1024px)').matches ||
                     window.matchMedia('(pointer: coarse)').matches;
        document.body.classList.toggle('ks-mobile-nav', mobile);
        return mobile;
    }
    ksSyncMobileNavClass();
    window.addEventListener('resize', ksSyncMobileNavClass);
    window.addEventListener('orientationchange', ksSyncMobileNavClass);

    (function initMobileNav() {
        var menuBtn = document.getElementById('mobile-menu-btn');
        var navLinks = document.getElementById('nav-links');
        if (!menuBtn || !navLinks) return;

        // Create overlay if it doesn't exist
        var overlay = document.querySelector('.nav-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'nav-overlay';
            document.body.appendChild(overlay);
        }

        var isOpen = false;

        function openMenu() {
            isOpen = true;
            navLinks.classList.add('active');
            menuBtn.classList.add('active');
            overlay.classList.add('show');
            document.body.classList.add('menu-open');
            menuBtn.setAttribute('aria-expanded', 'true');
        }

        function closeMenu() {
            isOpen = false;
            navLinks.classList.remove('active');
            menuBtn.classList.remove('active');
            overlay.classList.remove('show');
            document.body.classList.remove('menu-open');
            menuBtn.setAttribute('aria-expanded', 'false');
            // Close all open dropdowns
            navLinks.querySelectorAll('.has-dropdown.open, .flyout-trigger.open').forEach(function(el) {
                el.classList.remove('open');
            });
        }

        // Toggle button click
        menuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (isOpen) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        // Overlay click to close
        overlay.addEventListener('click', closeMenu);

        // ESC key to close
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && isOpen) {
                closeMenu();
            }
        });

        // Close when a nav link is clicked (on mobile)
        navLinks.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                if (document.body.classList.contains('ks-mobile-nav') && isOpen) {
                    // Only close if it's NOT a dropdown trigger (those toggle accordion)
                    var parent = link.parentElement;
                    if (!parent.classList.contains('has-dropdown') && !parent.classList.contains('flyout-trigger')) {
                        closeMenu();
                    }
                }
            });
        });

        // Handle resize — if going from mobile to desktop, reset menu
        window.addEventListener('resize', function() {
            if (!document.body.classList.contains('ks-mobile-nav') && isOpen) {
                closeMenu();
            }
        });

        // Set initial aria-expanded
        menuBtn.setAttribute('aria-expanded', 'false');
    })();

    /* ==========================================
       6. MOBILE DROPDOWN ACCORDIONS — Enhanced
       ==========================================
       Tap behavior (mobile ≤ 1024px):
         1st tap on a has-dropdown > a : open accordion, prevent navigation
          2nd tap on the same trigger    : navigate to the link (i.e. visit the
                                          category landing page like /about.html)
         Tap on a different trigger     : close others, open that one
         Tap on a child link            : navigate normally (no preventDefault)
       Hover is preserved on desktop ≥ 1025px (fine pointer) via CSS only.
       The gate uses the `ks-mobile-nav` body class (width OR coarse pointer),
       so touch laptops and zoomed pages behave as tap menus, not hover.
    */
    (function initMobileDropdowns() {
        // If the header is injected after this script runs (async fallback in
        // include-components.js), re-collect triggers when it signals ready.
        function arm() {
            document
                .querySelectorAll('.has-dropdown > a, .flyout-trigger > a')
                .forEach(attachTap);
        }

        function attachTap(link) {
            if (link.__ksTapArmed) return;
            link.__ksTapArmed = true;
            link.addEventListener('click', function(e) {
                if (!document.body.classList.contains('ks-mobile-nav')) return;

                var parent = link.parentElement;
                var isOpen = parent.classList.contains('open');

                // Close ALL other open dropdowns at the same level first
                var siblings = parent.parentElement;
                if (siblings) {
                    siblings
                        .querySelectorAll(':scope > .has-dropdown.open, :scope > .flyout-trigger.open')
                        .forEach(function(sib) {
                            if (sib !== parent) sib.classList.remove('open');
                        });
                }

                // 2nd tap on the SAME open trigger → allow navigation
                if (isOpen) {
                    parent.classList.remove('open');
                    return;
                }

                // 1st tap — open and swallow navigation
                e.preventDefault();
                parent.classList.add('open');
            });
        }

        arm();
        // Re-arm when components are (asynchronously) injected.
        document.addEventListener('componentsLoaded', arm);
    })();

    /* ==========================================
       7. PSD HIERARCHICAL FLYOUT & MOBILE ACCORDION
       ========================================== */
    (function initPsdMenu() {
        var psdSubs = document.querySelectorAll('.psd-dropdown-menu .psd-has-sub > a');
        psdSubs.forEach(function(link) {
            link.addEventListener('click', function(e) {
                if (window.innerWidth <= 1024) {
                    e.preventDefault();
                    e.stopPropagation();
                    var parentLi = link.parentElement;
                    var wasOpen = parentLi.classList.contains('open');

                    // Close sibling submenus
                    var siblings = parentLi.parentElement.querySelectorAll('.psd-has-sub');
                    siblings.forEach(function(s) { s.classList.remove('open'); });

                    if (!wasOpen) {
                        parentLi.classList.add('open');
                    }
                }
            });
        });
    })();

    // --- Achievements Marquee Setup ---
    const achieveMarquee = document.getElementById('achievements-marquee');
    if (achieveMarquee) {
        // Clone the content twice to ensure seamless infinite scrolling loop
        const originalContent = achieveMarquee.innerHTML;
        achieveMarquee.innerHTML = originalContent + originalContent + originalContent;
    }

    /* ==========================================
       6. NUMERICAL COUNTER ANIMATION
       ========================================== */
    const counters = document.querySelectorAll('.counter-value');
    if (counters.length > 0) {
        const observerOptions = { threshold: 0.5 };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const counter = entry.target;
                    const target = +counter.getAttribute('data-target');
                    let count = 0;
                    const speed = 100; // lower is faster
                    const inc = target / speed;

                    const updateCount = () => {
                        count += inc;
                        if (count < target) {
                            counter.innerText = Math.ceil(count);
                            requestAnimationFrame(updateCount);
                        } else {
                            counter.innerText = target;
                            /* PART 22-24 — TNEA pill persistence: lock the element
                               visible after the count finishes so nothing (AOS,
                               transitions, lazy scripts) can fade/remove it. */
                            counter.style.visibility = 'visible';
                            counter.style.opacity = '1';
                            counter.classList.add('counter-finished');
                            // Also pin the surrounding TNEA pill (.hero-tnea-box),
                            // which some transient animations could otherwise hide.
                            const pill = counter.closest('.hero-tnea-box');
                            if (pill) {
                                pill.style.visibility = 'visible';
                                pill.style.opacity = '1';
                            }
                        }
                    };
                    updateCount();
                    observer.unobserve(counter);
                }
            });
        }, observerOptions);
        counters.forEach(counter => observer.observe(counter));
    }

});

/* ── Load Site-Wide Search ───────────────────────────────────── */
/* NOTE: search.js is loaded by include-components.js (the canonical site-wide
   loader) on header-included pages, with a dedupe guard
   (`script[src*="search.js"]`). We keep this as a NO-OP fallback for pages that
   do NOT use include-components.js, so search still works there without ever
   double-loading. Root-absolute to survive any page depth. */
(function () {
    if (document.querySelector('script[src*="search.js"]')) return; // already handled
    var s = document.createElement('script');
    s.src = '/assets/js/search.js';
    s.defer = true;
    document.head.appendChild(s);
})();
