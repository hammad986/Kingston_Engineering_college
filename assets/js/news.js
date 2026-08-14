/**
 * Kingston Engineering College — News System
 * Loads news from data/news.json and renders:
 *  - Homepage Swiper slider (#news-wrapper)
 *  - Blog page filterable grid (#blog-news-grid)
 */

const KEC_NEWS = (() => {

    const JSON_URL = 'data/news.json';

    const CATEGORY_COLORS = {
        'Research':       '#6c3483',
        'Achievement':    '#1a5276',
        'Event':          '#1e8449',
        'Placement':      '#1f618d',
        'Sports':         '#b7950b',
        'Infrastructure': '#784212',
        'Academic':       '#0e6655',
        'Alumni':         '#922b21',
        'Admission':      '#c0392b',
    };

    function catColor(cat) {
        return CATEGORY_COLORS[cat] || '#003366';
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function imgSrc(item) {
        // Always use fallback_image directly to avoid 404 requests
        return item.fallback_image || 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&q=80';
    }

    /* ── Fetch ─────────────────────────────────────────────── */
    async function fetchNews() {
        const res = await fetch(JSON_URL);
        if (!res.ok) throw new Error('Failed to load news');
        return res.json();
    }

    /* ── Homepage slider ───────────────────────────────────── */
    async function initSlider() {
        const wrapper = document.getElementById('news-wrapper');
        if (!wrapper) return;

        let news;
        try { news = await fetchNews(); }
        catch (e) { console.warn('[KEC News]', e); return; }

        wrapper.innerHTML = news.map(item => `
            <div class="swiper-slide">
                <div class="news-card">
                    <div class="news-card-img-wrap" style="position:relative;overflow:hidden;height:180px;">
                        <img src="${imgSrc(item)}"
                             class="news-card-img" alt="${item.title}"
                             style="width:100%;height:100%;object-fit:cover;">
                        <span class="news-cat-badge" style="background:${catColor(item.category)}">${item.category}</span>
                    </div>
                    <div class="news-card-body">
                        <span class="news-date"><i class="fa-regular fa-calendar"></i> ${formatDate(item.date)}</span>
                        <h3 class="news-card-title">${item.title}</h3>
                        <p class="news-card-excerpt">${item.summary.slice(0, 100)}…</p>
                        <a href="news-detail.html?id=${item.id}" class="news-read-more">Read More <i class="fa-solid fa-arrow-right text-xs"></i></a>
                    </div>
                </div>
            </div>`).join('');

        new Swiper('#news-slider', {
            slidesPerView: 1,
            spaceBetween: 20,
            navigation: { nextEl: '.news-next', prevEl: '.news-prev' },
            breakpoints: {
                768:  { slidesPerView: 2 },
                1024: { slidesPerView: 3 }
            }
        });
    }

    /* ── Blog page full grid ───────────────────────────────── */
    async function initBlogPage() {
        const grid = document.getElementById('blog-news-grid');
        if (!grid) return;

        let allNews;
        try { allNews = await fetchNews(); }
        catch (e) {
            grid.innerHTML = '<p style="text-align:center;color:#666;padding:40px;">Unable to load news. Please refresh.</p>';
            return;
        }

        let filtered = [...allNews];
        let activeCategory = 'All';
        let searchQuery = '';

        // Build category list
        const cats = ['All', ...new Set(allNews.map(n => n.category))];
        const filterBar = document.getElementById('blog-filter-bar');
        if (filterBar) {
            filterBar.innerHTML = cats.map(cat => `
                <button class="news-filter-btn${cat === 'All' ? ' active' : ''}" data-cat="${cat}">${cat}</button>
            `).join('');

            filterBar.addEventListener('click', e => {
                const btn = e.target.closest('.news-filter-btn');
                if (!btn) return;
                filterBar.querySelectorAll('.news-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeCategory = btn.dataset.cat;
                render();
            });
        }

        // Search
        const searchInput = document.getElementById('blog-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                searchQuery = searchInput.value.trim().toLowerCase();
                render();
            });
        }

        function render() {
            filtered = allNews.filter(item => {
                const matchCat = activeCategory === 'All' || item.category === activeCategory;
                const q = searchQuery;
                const matchSearch = !q ||
                    item.title.toLowerCase().includes(q) ||
                    item.summary.toLowerCase().includes(q) ||
                    (item.tags || []).some(t => t.toLowerCase().includes(q));
                return matchCat && matchSearch;
            });

            if (!filtered.length) {
                grid.innerHTML = `<p class="blog-no-results">No news found for your search. <button onclick="document.getElementById('blog-search').value=''; window.KECNewsReset && window.KECNewsReset();">Clear filters</button></p>`;
                return;
            }

            grid.innerHTML = filtered.map((item, idx) => `
                <article class="blog-news-card${item.featured ? ' featured' : ''}" data-aos="fade-up" data-aos-delay="${(idx % 3) * 80}">
                    <a href="news-detail.html?id=${item.id}" class="blog-news-img-link">
                        <div class="blog-news-img-wrap">
                            <img src="${imgSrc(item)}"
                                 alt="${item.title}" loading="lazy">
                            <span class="news-cat-badge" style="background:${catColor(item.category)}">${item.category}</span>
                            ${item.featured ? '<span class="news-featured-badge">Featured</span>' : ''}
                        </div>
                    </a>
                    <div class="blog-news-body">
                        <span class="news-date"><i class="fa-regular fa-calendar"></i> ${formatDate(item.date)}</span>
                        <h2 class="blog-news-title">
                            <a href="news-detail.html?id=${item.id}">${item.title}</a>
                        </h2>
                        <p class="blog-news-excerpt">${item.summary}</p>
                        <div class="blog-news-footer">
                            <div class="news-tags">
                                ${(item.tags || []).slice(0,3).map(t => `<span class="news-tag">${t}</span>`).join('')}
                            </div>
                            <a href="news-detail.html?id=${item.id}" class="news-read-more">Read More <i class="fa-solid fa-arrow-right text-xs"></i></a>
                        </div>
                    </div>
                </article>`).join('');

            if (typeof AOS !== 'undefined') AOS.refresh();
        }

        window.KECNewsReset = () => {
            activeCategory = 'All';
            searchQuery = '';
            if (filterBar) filterBar.querySelectorAll('.news-filter-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
            if (searchInput) searchInput.value = '';
            render();
        };

        render();
    }

    return { initSlider, initBlogPage };
})();

document.addEventListener('DOMContentLoaded', () => {
    KEC_NEWS.initSlider();
    KEC_NEWS.initBlogPage();
});
