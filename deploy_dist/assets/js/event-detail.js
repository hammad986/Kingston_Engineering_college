/**
 * Kingston Engineering College — Event Detail Page
 * Loads single event by slug (preferred) or ID
 * Handles meta tags for SEO and prev/next navigation
 */

const KEC_EventDetail = (() => {

    const CAT_COLORS = {
        'Technical': '#1a5276',
        'Cultural':  '#6c3483',
        'Sports':    '#1e8449',
    };

    function catColor(cat) {
        return CAT_COLORS[cat] || '#003366';
    }

    function formatDateRange(item) {
        if (item.date_end && item.date_end !== item.date) {
            const start = new Date(item.date);
            const end   = new Date(item.date_end);
            if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
                return `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`;
            }
            return `${formatDate(item.date)} – ${formatDate(item.date_end)}`;
        }
        return formatDate(item.date);
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function isUpcoming(item) {
        const refDate = item.date_end ? new Date(item.date_end) : new Date(item.date);
        refDate.setHours(23, 59, 59, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return refDate >= today;
    }

    async function init() {
        const params = new URLSearchParams(window.location.search);
        const eventSlug = params.get('slug');
        const eventId = parseInt(params.get('id')) || null;

        if (!eventSlug && !eventId) {
            document.body.innerHTML = '<div class="container" style="text-align:center;padding:60px 20px;"><h1 style="color:#666;">Event not found</h1><p><a href="facilities/facilities_event_gallery.html">Back to Events</a></p></div>';
            return;
        }

        try {
            const res = await fetch('data/events.json');
            const allEvents = await res.json();

            let item = null;
            if (eventSlug) {
                item = allEvents.find(e => e.slug === eventSlug);
            } else if (eventId) {
                item = allEvents.find(e => e.id === eventId);
            }

            if (!item) {
                document.body.innerHTML = '<div class="container" style="text-align:center;padding:60px 20px;"><h1 style="color:#666;">Event not found</h1><p><a href="facilities/facilities_event_gallery.html">Back to Events</a></p></div>';
                return;
            }

            // Update meta tags for SEO
            setMeta(item);
            // Render the detail page
            renderDetail(item, allEvents);

        } catch (e) {
            console.error('[KEC Event Detail]', e);
            document.body.innerHTML = '<div class="container" style="text-align:center;padding:60px 20px;"><h1 style="color:#666;">Error loading event</h1></div>';
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

    function getPrevNext(item, allEvents) {
        const upcoming = allEvents.filter(e => isUpcoming(e)).sort((a, b) => new Date(a.date) - new Date(b.date));
        const pastIdx = upcoming.findIndex(e => e.id === item.id);

        const prev = pastIdx > 0 ? upcoming[pastIdx - 1] : null;
        const next = pastIdx >= 0 && pastIdx < upcoming.length - 1 ? upcoming[pastIdx + 1] : null;

        return { prev, next };
    }

    function renderDetail(item, allEvents) {
        const mainEl = document.querySelector('main');
        if (!mainEl) return;

        const { prev, next } = getPrevNext(item, allEvents);
        const upcoming = isUpcoming(item);
        const ctaText = upcoming && item.registrations_open ? 'Register Now' : upcoming ? 'Event Details' : 'Event Completed';
        const ctaStyle = upcoming && item.registrations_open ? 'background:#27ae60;color:#fff;' : 'background:#999;color:#fff;opacity:0.6;cursor:not-allowed;';

        mainEl.innerHTML = `
            <div class="event-detail-hero" style="background:linear-gradient(135deg,#1a5276 0%,#003366 100%);padding:60px 0;color:#fff;">
                <div class="container">
                    <p style="margin:0 0 12px;opacity:0.8;"><a href="facilities/facilities_event_gallery.html" style="color:#fff;text-decoration:none;">← Back to Events</a></p>
                    <h1 style="font-size:2.2rem;font-weight:800;margin:0 0 16px;line-height:1.3;">${item.title}</h1>
                    <p style="font-size:0.95rem;margin:0;opacity:0.9;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                        <i class="fa-regular fa-calendar"></i>
                        <span>${formatDateRange(item)}</span>
                        <span style="opacity:0.6;">•</span>
                        <i class="fa-solid fa-location-dot"></i>
                        <span>${item.location}</span>
                        <span style="opacity:0.6;">•</span>
                        <span style="background:${catColor(item.category)};padding:3px 10px;border-radius:20px;font-size:0.85rem;font-weight:700;text-transform:uppercase;">${item.category}</span>
                    </p>
                </div>
            </div>

            <article class="event-detail-body">
                <div class="container" style="max-width:800px;">
                    <div class="event-detail-img" style="margin:40px 0;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.12);">
                        <img src="${item.fallback_image || ''}" alt="${item.title}" style="width:100%;height:auto;display:block;">
                    </div>

                    <div class="event-detail-content" style="font-size:1.02rem;line-height:1.8;color:#333;margin:30px 0;">
                        <p>${item.summary}</p>

                        <div style="margin:30px 0;padding:20px;background:#f0f8ff;border-left:4px solid #003366;border-radius:4px;">
                            <p style="margin:0 0 12px;color:#003366;font-weight:700;"><i class="fa-solid fa-location-dot"></i> Event Location</p>
                            <p style="margin:0;color:#555;font-size:0.95rem;">${item.location}</p>
                        </div>

                        ${item.registrations_open ? `
                            <div style="margin:30px 0;padding:20px;background:#f0fff0;border-left:4px solid #27ae60;border-radius:4px;">
                                <p style="margin:0;color:#27ae60;font-weight:700;"><i class="fa-solid fa-check-circle"></i> Registration is Open</p>
                            </div>
                        ` : upcoming ? `
                            <div style="margin:30px 0;padding:20px;background:#fff8f0;border-left:4px solid #ff9800;border-radius:4px;">
                                <p style="margin:0;color:#ff9800;font-weight:700;"><i class="fa-solid fa-clock"></i> Registration Status: Not Announced Yet</p>
                            </div>
                        ` : `
                            <div style="margin:30px 0;padding:20px;background:#f5f5f5;border-left:4px solid #999;border-radius:4px;">
                                <p style="margin:0;color:#666;font-weight:700;"><i class="fa-solid fa-checkmark"></i> This event has concluded</p>
                            </div>
                        `}

                        ${item.tags && item.tags.length ? `
                            <div style="margin:30px 0;padding-top:30px;border-top:1px solid #e0e0e0;">
                                <p style="color:#666;font-size:0.9rem;margin-bottom:12px;font-weight:600;">Tags:</p>
                                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                                    ${item.tags.map(t => `<span style="background:#eef2fb;color:#003366;padding:5px 12px;border-radius:20px;font-size:0.9rem;border:1px solid #d5e0f5;">${t}</span>`).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <div style="margin:40px 0;padding:30px;background:#003366;color:#fff;border-radius:8px;text-align:center;">
                        <button style="padding:12px 32px;font-size:1rem;font-weight:700;border:none;border-radius:6px;cursor:${upcoming && item.registrations_open ? 'pointer' : 'not-allowed'};${ctaStyle}">
                            <i class="fa-solid ${upcoming && item.registrations_open ? 'fa-circle-check' : 'fa-lock'}" style="margin-right:8px;"></i>
                            ${ctaText}
                        </button>
                    </div>
                </div>
            </article>

            ${prev || next ? `
                <section style="background:#f4f7fb;padding:50px 0;margin-top:40px;">
                    <div class="container" style="max-width:800px;">
                        <h3 style="color:#003366;margin-bottom:24px;font-size:1.4rem;"><i class="fa-solid fa-arrow-right"></i> More Events</h3>
                        <div style="display:grid;grid-template-columns:${prev && next ? '1fr 1fr' : '1fr'};gap:20px;">
                            ${prev ? `<a href="event-detail.html?slug=${prev.slug}" style="background:#fff;padding:20px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.07);text-decoration:none;color:inherit;transition:transform 0.2s,box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 2px 12px rgba(0,0,0,0.07)';"><p style="margin:0 0 8px;color:#888;font-size:0.85rem;"><i class="fa-solid fa-arrow-left"></i> Previous Event</p><h4 style="margin:0;color:#003366;font-weight:700;font-size:0.95rem;">${prev.title}</h4><p style="margin:6px 0 0;color:#666;font-size:0.82rem;"><i class="fa-regular fa-calendar"></i> ${formatDateRange(prev)}</p></a>` : '<div></div>'}
                            ${next ? `<a href="event-detail.html?slug=${next.slug}" style="background:#fff;padding:20px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.07);text-decoration:none;color:inherit;transition:transform 0.2s,box-shadow 0.2s;text-align:${prev ? 'right' : 'left'};" onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 2px 12px rgba(0,0,0,0.07)';"><p style="margin:0 0 8px;color:#888;font-size:0.85rem;">Next Event <i class="fa-solid fa-arrow-right"></i></p><h4 style="margin:0;color:#003366;font-weight:700;font-size:0.95rem;">${next.title}</h4><p style="margin:6px 0 0;color:#666;font-size:0.82rem;"><i class="fa-regular fa-calendar"></i> ${formatDateRange(next)}</p></a>` : '<div></div>'}
                        </div>
                        <p style="text-align:center;margin-top:24px;"><a href="facilities/facilities_event_gallery.html" style="color:#003366;font-weight:700;text-decoration:none;"><i class="fa-solid fa-list"></i> View all events →</a></p>
                    </div>
                </section>
            ` : ''}
        `;
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => { KEC_EventDetail.init(); });
