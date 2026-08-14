/**
 * Kingston Engineering College — Events System
 * Loads events from data/events.json and renders:
 *  - Homepage Swiper slider  (#events-wrapper) - highlights nearest upcoming
 *  - Events page tabs + grid (#events-grid) - badges nearest with "Next Event"
 */

const KEC_EVENTS = (() => {

    const JSON_URL = 'data/events.json';
    const TODAY    = new Date();
    TODAY.setHours(0, 0, 0, 0);

    /* ── Category colours ──────────────────────────────────── */
    const CAT_COLORS = {
        'Technical': '#1a5276',
        'Cultural':  '#6c3483',
        'Sports':    '#1e8449',
    };

    function catColor(cat) {
        return CAT_COLORS[cat] || '#003366';
    }

    /* ── Status helpers ────────────────────────────────────── */
    function isUpcoming(item) {
        const refDate = item.date_end ? new Date(item.date_end) : new Date(item.date);
        refDate.setHours(23, 59, 59, 0);
        return refDate >= TODAY;
    }

    /* ── Date formatting ───────────────────────────────────── */
    function formatDate(dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function formatDateRange(item) {
        if (item.date_end && item.date_end !== item.date) {
            const start = new Date(item.date);
            const end   = new Date(item.date_end);

            // Same month & year → "10–12 Apr 2026"
            if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
                return `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`;
            }
            // Different months → "28 Mar – 2 Apr 2026"
            return `${formatDate(item.date)} – ${formatDate(item.date_end)}`;
        }
        return formatDate(item.date);
    }

    /* ── Image source ──────────────────────────────────────── */
    function imgSrc(item) {
        return item.fallback_image || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&q=80';
    }

    /* ── Find nearest upcoming event ────────────────────────── */
    function findNearestUpcoming(allEvents) {
        const upcoming = allEvents
            .filter(e => isUpcoming(e))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        return upcoming.length > 0 ? upcoming[0] : null;
    }

    /* ── Fetch ─────────────────────────────────────────────── */
    async function fetchEvents() {
        const res = await fetch(JSON_URL);
        if (!res.ok) throw new Error('Failed to load events');
        return res.json();
    }

    /* ── Homepage Slider ───────────────────────────────────── */
    async function initSlider() {
        const wrapper = document.getElementById('events-wrapper');
        if (!wrapper) return;

        let allEvents;
        try { allEvents = await fetchEvents(); }
        catch (e) { console.warn('[KEC Events]', e); return; }

        // Show featured upcoming events first, then any upcoming to reach 4 total
        const upcoming = allEvents.filter(e => isUpcoming(e)).sort((a, b) => new Date(a.date) - new Date(b.date));
        const featured = upcoming.filter(e => e.featured);
        const toShow = featured.length >= 4
            ? featured.slice(0, 4)
            : [...featured, ...upcoming.filter(e => !e.featured)].slice(0, 4);

        if (!toShow.length) {
            wrapper.closest('.events-section') && (wrapper.closest('.events-section').style.display = 'none');
            return;
        }

        // Find nearest event to highlight on homepage
        const nearestUpcoming = findNearestUpcoming(allEvents);
        const nearestId = nearestUpcoming ? nearestUpcoming.id : null;

        wrapper.innerHTML = toShow.map((item, idx) => {
            const isNearest = item.id === nearestId;
            const isNearest_style = isNearest ? 'border:3px solid #ff9800;box-shadow:0 0 20px rgba(255,152,0,0.3);transform:scale(1.02);' : '';
            return `
            <div class="swiper-slide">
                <div class="news-card event-card" style="${isNearest_style}transition:all 0.3s;">
                    <div class="news-card-img-wrap" style="position:relative;overflow:hidden;height:180px;">
                        <img src="${imgSrc(item)}"
                             alt="${item.title}"
                             style="width:100%;height:100%;object-fit:cover;">
                        <span class="news-cat-badge" style="background:${catColor(item.category)}">${item.category}</span>
                        ${isNearest ? '<span style="position:absolute;top:10px;right:10px;background:#ff9800;color:#fff;font-size:0.68rem;font-weight:800;padding:4px 10px;border-radius:20px;letter-spacing:0.4px;text-transform:uppercase;z-index:2;">Next Event</span>' : ''}
                        ${item.registrations_open ? '<span class="event-reg-badge">Registration Open</span>' : ''}
                    </div>
                    <div class="news-card-body">
                        <span class="news-date"><i class="fa-regular fa-calendar"></i> ${formatDateRange(item)}</span>
                        <h3 class="news-card-title">${item.title}</h3>
                        <p class="news-card-excerpt" style="font-size:0.8rem;">
                            <i class="fa-solid fa-location-dot" style="color:#c0392b;margin-right:4px;"></i>${item.location}
                        </p>
                        <a href="event-detail.html?slug=${item.slug}" class="news-read-more">
                            ${item.registrations_open ? 'Register Now' : 'View Details'}
                            <i class="fa-solid fa-arrow-right text-xs"></i>
                        </a>
                    </div>
                </div>
            </div>`;
        }).join('');

        new Swiper('#events-slider', {
            slidesPerView: 1,
            spaceBetween: 20,
            navigation: { nextEl: '.events-next', prevEl: '.events-prev' },
            breakpoints: {
                768:  { slidesPerView: 2 },
                1024: { slidesPerView: 3 }
            }
        });
    }

    /* ── Events Page ───────────────────────────────────────── */
    async function initEventsPage() {
        const grid = document.getElementById('events-grid');
        if (!grid) return;

        let allEvents;
        try { allEvents = await fetchEvents(); }
        catch (e) {
            grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#666;padding:60px 0;">Unable to load events. Please refresh the page.</p>';
            return;
        }

        // Sort upcoming asc, past desc
        const upcoming = allEvents.filter(e => isUpcoming(e)).sort((a, b) => new Date(a.date) - new Date(b.date));
        const past     = allEvents.filter(e => !isUpcoming(e)).sort((a, b) => new Date(b.date) - new Date(a.date));

        // Find nearest upcoming event
        const nearestUpcoming = upcoming.length > 0 ? upcoming[0] : null;
        const nearestId = nearestUpcoming ? nearestUpcoming.id : null;

        let activeTab     = 'upcoming';
        let activeCategory = 'All';

        /* ── Tab buttons ── */
        const tabUpcoming = document.getElementById('tab-upcoming');
        const tabPast     = document.getElementById('tab-past');
        if (tabUpcoming) {
            tabUpcoming.addEventListener('click', () => { activeTab = 'upcoming'; activeCategory = 'All'; resetCatFilter(); renderAll(); setTabActive('upcoming'); });
        }
        if (tabPast) {
            tabPast.addEventListener('click', () => { activeTab = 'past'; activeCategory = 'All'; resetCatFilter(); renderAll(); setTabActive('past'); });
        }

        /* ── Category filter buttons ── */
        const filterBar = document.getElementById('events-filter-bar');
        if (filterBar) {
            const cats = ['All', 'Technical', 'Cultural', 'Sports'];
            filterBar.innerHTML = cats.map(cat => `
                <button class="news-filter-btn${cat === 'All' ? ' active' : ''}" data-cat="${cat}">${cat}</button>
            `).join('');

            filterBar.addEventListener('click', e => {
                const btn = e.target.closest('.news-filter-btn');
                if (!btn) return;
                filterBar.querySelectorAll('.news-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeCategory = btn.dataset.cat;
                renderAll();
            });
        }

        function resetCatFilter() {
            if (filterBar) {
                filterBar.querySelectorAll('.news-filter-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
            }
            activeCategory = 'All';
        }

        function setTabActive(tab) {
            if (tabUpcoming) tabUpcoming.classList.toggle('events-tab-active', tab === 'upcoming');
            if (tabPast)     tabPast.classList.toggle('events-tab-active', tab === 'past');
        }

        /* ── Counter badges ── */
        function updateCounts() {
            const upEl = document.getElementById('upcoming-count');
            const paEl = document.getElementById('past-count');
            if (upEl) upEl.textContent = upcoming.length;
            if (paEl) paEl.textContent = past.length;
        }

        /* ── Render grid ── */
        function renderAll() {
            const pool    = activeTab === 'upcoming' ? upcoming : past;
            const filtered = activeCategory === 'All' ? pool : pool.filter(e => e.category === activeCategory);

            if (!filtered.length) {
                grid.innerHTML = `
                    <div style="grid-column:1/-1;text-align:center;padding:70px 20px;color:#888;">
                        <i class="fa-solid fa-calendar-xmark fa-3x" style="opacity:0.3;margin-bottom:16px;display:block;"></i>
                        <p style="font-size:1.05rem;">No ${activeCategory !== 'All' ? activeCategory.toLowerCase() + ' ' : ''}${activeTab} events found.</p>
                    </div>`;
                if (typeof AOS !== 'undefined') AOS.refresh();
                return;
            }

            grid.innerHTML = filtered.map((item, idx) => {
                const upcoming = isUpcoming(item);
                const ctaLabel = upcoming && item.registrations_open ? 'Register Now'
                               : upcoming ? 'View Details'
                               : 'View Details';
                const isNearest = activeTab === 'upcoming' && item.id === nearestId;
                const nearestBadge = isNearest ? '<span style="position:absolute;top:12px;right:12px;background:#ff9800;color:#fff;font-size:0.68rem;font-weight:800;padding:4px 10px;border-radius:20px;letter-spacing:0.4px;text-transform:uppercase;z-index:3;">Next Event</span>' : '';

                return `
                <article class="blog-news-card event-page-card${item.featured ? ' featured' : ''}${isNearest ? ' nearest-event' : ''}" data-aos="fade-up" data-aos-delay="${(idx % 3) * 80}" style="${isNearest ? 'border:2px solid #ff9800;' : ''}">
                    <a href="event-detail.html?slug=${item.slug}" class="blog-news-img-link">
                        <div class="blog-news-img-wrap" style="position:relative;">
                            <img src="${imgSrc(item)}" alt="${item.title}" loading="lazy">
                            <span class="news-cat-badge" style="background:${catColor(item.category)}">${item.category}</span>
                            ${item.featured ? '<span class="news-featured-badge">Featured</span>' : ''}
                            ${nearestBadge}
                            ${upcoming && item.registrations_open ? '<span class="event-reg-badge event-reg-badge--card">Registration Open</span>' : ''}
                        </div>
                    </a>
                    <div class="blog-news-body">
                        <span class="news-date">
                            <i class="fa-regular fa-calendar"></i> ${formatDateRange(item)}
                        </span>
                        <h2 class="blog-news-title">
                            <a href="event-detail.html?slug=${item.slug}">${item.title}</a>
                        </h2>
                        <p class="blog-news-excerpt" style="font-size:0.88rem;color:#666;margin-bottom:6px;">
                            <i class="fa-solid fa-location-dot" style="color:#c0392b;margin-right:5px;"></i>${item.location}
                        </p>
                        <p class="blog-news-excerpt">${item.summary}</p>
                        <div class="blog-news-footer">
                            <div class="news-tags">
                                ${(item.tags || []).slice(0, 3).map(t => `<span class="news-tag">${t}</span>`).join('')}
                            </div>
                            <a href="event-detail.html?slug=${item.slug}" class="news-read-more${upcoming && item.registrations_open ? ' event-reg-cta' : ''}">
                                <i class="fa-solid ${upcoming && item.registrations_open ? 'fa-circle-check' : 'fa-arrow-right'} text-xs"></i> ${ctaLabel}
                            </a>
                        </div>
                    </div>
                </article>`;
            }).join('');

            if (typeof AOS !== 'undefined') AOS.refresh();
        }

        updateCounts();
        renderAll();
    }

    return { initSlider, initEventsPage };
})();

document.addEventListener('DOMContentLoaded', () => {
    KEC_EVENTS.initSlider();
    KEC_EVENTS.initEventsPage();
});
