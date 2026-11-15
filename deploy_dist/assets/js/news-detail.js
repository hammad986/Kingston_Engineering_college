/**
 * Kingston Engineering College — News Detail Page
 * Loads single news item by ID and handles meta tags for SEO
 */

const KEC_NewsDetail = (() => {

    async function init() {
        const params = new URLSearchParams(window.location.search);
        const newsId = parseInt(params.get('id')) || null;

        if (!newsId) {
            document.body.innerHTML = '<div class="container" style="text-align:center;padding:60px 20px;"><h1 style="color:#666;">News not found</h1><p><a href="blog.html">Back to News</a></p></div>';
            return;
        }

        try {
            const res = await fetch('data/news.json');
            const allNews = await res.json();
            const item = allNews.find(n => n.id === newsId);

            if (!item) {
                document.body.innerHTML = '<div class="container" style="text-align:center;padding:60px 20px;"><h1 style="color:#666;">News not found</h1><p><a href="blog.html">Back to News</a></p></div>';
                return;
            }

            // Update meta tags for SEO
            setMeta(item);
            // Render the detail page
            renderDetail(item);

        } catch (e) {
            console.error('[KEC News Detail]', e);
            document.body.innerHTML = '<div class="container" style="text-align:center;padding:60px 20px;"><h1 style="color:#666;">Error loading news</h1></div>';
        }
    }

    function setMeta(item) {
        // Title
        document.title = `${item.title} — Kingston Engineering College`;

        // Meta description
        let meta = document.querySelector('meta[name="description"]');
        if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
        meta.content = item.summary.slice(0, 155);

        // OG tags
        const ogTags = {
            'og:title': item.title,
            'og:description': item.summary.slice(0, 155),
            'og:image': item.fallback_image || '',
            'og:type': 'article',
            'og:url': window.location.href
        };

        for (const [prop, content] of Object.entries(ogTags)) {
            let el = document.querySelector(`meta[property="${prop}"]`);
            if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
            el.content = content;
        }
    }

    function renderDetail(item) {
        const mainEl = document.querySelector('main');
        if (!mainEl) return;

        mainEl.innerHTML = `
            <div class="news-detail-hero" style="background:linear-gradient(135deg,#003366 0%,#0072ce 100%);padding:60px 0;color:#fff;">
                <div class="container">
                    <p style="margin:0 0 12px;opacity:0.8;"><a href="blog.html" style="color:#fff;text-decoration:none;">← Back to News</a></p>
                    <h1 style="font-size:2.2rem;font-weight:800;margin:0 0 16px;line-height:1.3;">${item.title}</h1>
                    <p style="font-size:0.95rem;margin:0;opacity:0.9;display:flex;align-items:center;gap:12px;">
                        <i class="fa-regular fa-calendar"></i>
                        <span>${new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        <span style="opacity:0.6;">•</span>
                        <span style="background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:20px;font-size:0.85rem;font-weight:700;">${item.category}</span>
                    </p>
                </div>
            </div>

            <article class="news-detail-body">
                <div class="container" style="max-width:800px;">
                    <div class="news-detail-img" style="margin:40px 0;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.12);">
                        <img src="${item.fallback_image || ''}" alt="${item.title}" style="width:100%;height:auto;display:block;">
                    </div>

                    <div class="news-detail-content" style="font-size:1.02rem;line-height:1.8;color:#333;margin:30px 0;">
                        <p>${item.summary}</p>
                        ${item.tags && item.tags.length ? `
                            <div style="margin:30px 0;padding-top:30px;border-top:1px solid #e0e0e0;">
                                <p style="color:#666;font-size:0.9rem;margin-bottom:12px;font-weight:600;">Tags:</p>
                                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                                    ${item.tags.map(t => `<span style="background:#f0f4fb;color:#003366;padding:5px 12px;border-radius:20px;font-size:0.9rem;border:1px solid #d5e0f5;">${t}</span>`).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </article>

            <section style="background:#f4f7fb;padding:50px 0;margin-top:40px;">
                <div class="container" style="max-width:800px;">
                    <h3 style="color:#003366;margin-bottom:24px;font-size:1.4rem;">More News</h3>
                    <div style="display:grid;grid-template-columns:1fr;gap:16px;max-height:200px;overflow-y:auto;">
                        <p style="color:#888;text-align:center;"><a href="blog.html" style="color:#003366;font-weight:700;text-decoration:none;">View all news →</a></p>
                    </div>
                </div>
            </section>
        `;
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => { KEC_NewsDetail.init(); });
