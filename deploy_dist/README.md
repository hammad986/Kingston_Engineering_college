# Kingston Engineering College — Official Website

Production website for **Kingston Engineering College, Vellore** — a static, fast, AI-powered institutional website.

- **Production domain:** https://engineering.kingston.ac.in
- **Platform:** Cloudflare Pages + Pages Functions
- **Deployment:** `git push` → Cloudflare Pages (or `wrangler pages deploy`)

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Tech Stack](#tech-stack)
5. [Project Structure](#project-structure)
6. [Getting Started (Local)](#getting-started-local)
7. [Environment Variables](#environment-variables)
8. [Deployment — Cloudflare Pages](#deployment--cloudflare-pages)
9. [RAG + R2 Setup (AI Assistant)](#rag--r2-setup-ai-assistant)
10. [AI Assistant / OpenRouter](#ai-assistant--openrouter)
11. [SEO, Sitemap & Robots](#seo-sitemap--robots)
12. [Security](#security)
13. [Python Tooling & Scripts](#python-tooling--scripts)
14. [Content & Data Files](#content--data-files)
15. [Troubleshooting](#troubleshooting)
16. [License & Disclaimer](#license--disclaimer)

---

## Overview

This repository contains the complete static website for Kingston Engineering College. It includes:

- **~490 HTML pages** — home, about, admissions, academics, all departments, facilities, placements, IQAC, NAAC, UGC Mandatory Disclosure, alumni, galleries, and more.
- **Client-side RAG AI Assistant** (`ai-assistant.html`) — answers institutional questions using a local embedding model (all-MiniLM-L6-v2, ONNX/WASM) and a 19,117-chunk vector corpus, grounded in the college knowledge base.
- **Search** — client-side full-text search over `data/search-index.json`.
- **News, Events, Testimonials** — JSON-driven dynamic sections.

---

## Features

| Feature | Where |
|---------|-------|
| RAG AI Assistant (grounded Q&A) | `ai-assistant.html` |
| Client-side full-text search | global search overlay |
| News & Announcements with detail pages | `news.html`, `news-detail.html?id=N` |
| Events, Testimonials, Galleries | JSON-driven |
| Public Self-Disclosure / Mandatory Disclosure | header PSD menu |
| NAAC / IQAC / UGC document sections | `naac/`, `iqac/`, `ugc/` |
| Shared header/footer via component loader | `components/`, `include-components.js` |
| Mobile-first responsive layout | `assets/css/responsive.css` |
| SEO: per-page canonical, OG, JSON-LD | all public pages |
| Security headers | `_headers` |

---

## Architecture

```text
GitHub repository
        │
        ▼
Cloudflare Pages (static site + Pages Functions)
        │
        ├── Static assets (HTML / CSS / JS / images / PDFs)
        │
        └── /api/chat  (Pages Function → OpenRouter → LLM)
                 │
                 ▼
        OpenRouter (server-side API key only — never exposed to browser)

Cloudflare R2 (optional production data tier)
        │
        ├── vectors.bin
        └── chunks.json
        │
        └── RAG runtime data fetched by the AI Assistant

Local runtime model
        │
        └── all-MiniLM-L6-v2 (ONNX + WASM, in-browser embedding)
```

### Data flow — AI Assistant

1. User asks a question in `ai-assistant.html`.
2. The browser embeds the query locally with **all-MiniLM-L6-v2** (ONNX Runtime Web + Transformers.js).
3. Top-k similar chunks are retrieved from `vectors.bin` / `chunks.json`.
4. The retrieved context is sent to `/api/chat` (Cloudflare Pages Function).
5. The Function calls **OpenRouter** with the grounded context.
6. The answer is rendered with source attribution (when sources are present).

---

## Tech Stack

- **HTML5 / CSS3 / Vanilla JS** — no build step required
- **Cloudflare Pages + Pages Functions** — hosting + `/api/chat` proxy
- **OpenRouter** — LLM API (server-side)
- **Transformers.js / ONNX Runtime Web** — in-browser embeddings
- **all-MiniLM-L6-v2** — local embedding model (~22 MB, `assets/models/`)
- **AOS, Swiper, Font Awesome, Google Fonts** — via CDN
- **Python 3** — data/validation scripts (development only)

---

## Project Structure

```text
.
├── index.html                  # Homepage
├── about.html                  # About the college
├── admission.html              # Admissions
├── academics.html              # Academics
├── departments.html            # Departments landing
├── placements.html             # Placements landing
├── alumni.html                 # Alumni landing
├── news.html                   # News & Announcements
├── news-detail.html            # News detail (query-driven: ?id=N)
├── events.html                 # Events
├── testimonials.html           # Alumni testimonials
├── campus_tour.html            # Virtual campus tour
├── campus_gallery.html         # Campus photo gallery
├── ai-assistant.html           # RAG AI Assistant
├── contact.html                # Contact / enquiry
├── 404.html                    # Custom 404
├── sitemap.xml                 # XML sitemap (search engines)
├── robots.txt                  # Crawler rules
├── _headers                    # Cloudflare security headers
├── _redirects                  # Cloudflare redirects
├── wrangler.toml               # Cloudflare Pages config
│
├── assets/
│   ├── css/                    # Stylesheets
│   ├── js/                     # Site JS (script.js, search.js, ai-assistant.js, …)
│   ├── images/                 # Images
│   ├── videos/                 # Hero video etc.
│   ├── pdfs/                   # Referenced PDF documents
│   ├── models/all-MiniLM-L6-v2/  # Local embedding model (ONNX)
│   └── vendor/transformers/    # Transformers.js runtime
│
├── components/
│   ├── header.html             # Shared header + navbar
│   └── footer.html             # Shared footer
│
├── data/
│   ├── chunks.json             # RAG text chunks (R2 in production)
│   ├── vectors.bin             # RAG embeddings (R2 in production)
│   ├── search-index.json       # Client search index
│   ├── news.json               # News data
│   ├── events.json             # Events data
│   ├── testimonials.json       # Testimonials data
│   └── …                       # Other JSON data files
│
├── functions/
│   └── api/chat.js             # Cloudflare Pages Function → OpenRouter
│
├── about/  departments/  facilities/  placements/
├── iqac/   naac/         ugc/         alumni/
├── scripts/                          # Python tooling (dev only)
└── cloud_links_work/                 # Working notes / helper scripts
```

---

## Getting Started (Local)

No build step is required — the site is plain static files.

```bash
# Option A: Python (comes with most systems)
python -m http.server 8000

# Option B: Wrangler (full Pages emulation incl. /api/chat + _headers)
npm install -g wrangler
wrangler pages dev . --port 8788
```

Open `http://localhost:8000` (or the wrangler URL). Pages Functions are only active under `wrangler pages dev`.

---

## Environment Variables

Set these in the **Cloudflare Pages dashboard** (Settings → Environment variables). Never commit secrets.

| Variable | Required | Scope | Purpose |
|----------|----------|-------|---------|
| `OPENROUTER_API_KEY` | ✅ | Production + Preview | OpenRouter API key (secret). Used only by `functions/api/chat.js`. |
| `OPENROUTER_MODEL` | ❌ | Production | Model name, defaults to `deepseek/deepseek-v3` if unset. |
| `ALLOWED_ORIGINS` | ❌ | Production | Comma-separated exact origins allowed to call `/api/chat`. Defaults to `https://engineering.kingston.ac.in`. |

> **Security:** the API key is read server-side (`env.OPENROUTER_API_KEY`) and is **never** shipped to the browser.

---

## Deployment — Cloudflare Pages

### Option 1 — Git integration (recommended)

1. Push this repository to GitHub.
2. In Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Choose the repo, set **Build command** to empty (static) and **Build output directory** to `/` (root).
4. Add the environment variables above.
5. Deploy.

### Option 2 — Direct upload

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name=kingston-engineering-college
```

### Custom domain

Attach `engineering.kingston.ac.in` in the Cloudflare Pages dashboard and update DNS accordingly.

---

## RAG + R2 Setup (AI Assistant)

### Runtime data

The AI Assistant needs two data files at runtime:

- `data/vectors.bin` (~28 MB)
- `data/chunks.json` (~size varies)

Both are **git-ignored** (see `.gitignore`) because they are too large to ship as normal Pages assets and are intentionally served from **Cloudflare R2**.

### R2 upload (owner step — not automated here)

1. Create an R2 bucket (e.g. `kec-rag-data`).
2. Upload `vectors.bin` and `chunks.json` into a `data/` prefix in the bucket.
3. Connect a **custom domain** to the bucket (e.g. `https://rag.engineering.kingston.ac.in`). Do **not** use the `r2.dev` development endpoint for production.
4. Configure **CORS** on the bucket:
   - Allowed origin: `https://engineering.kingston.ac.in`
   - Allowed method: `GET`
   - (No wildcard `*` unless you have a verified reason.)

### Configuration point

Open `ai-assistant.html` and find:

```js
// window.KEC_RAG_DATA_BASE = 'https://your-r2-public-url/data';
```

Replace the placeholder with your real R2 custom-domain data URL and uncomment:

```js
window.KEC_RAG_DATA_BASE = 'https://rag.engineering.kingston.ac.in/data';
```

The runtime reader lives in `assets/js/ai-assistant.js` (`const base = window.KEC_RAG_DATA_BASE || …`) — it strips trailing slashes and falls back to the local `data/` path for local development.

> `data/vector-index.json` is **not** required at runtime. It is kept for rebuild/verification workflows.

---

## AI Assistant / OpenRouter

- **Endpoint:** `POST /api/chat` → `functions/api/chat.js`
- The Function validates the request origin against `ALLOWED_ORIGINS`, forwards the grounded context to OpenRouter with grounding instructions, and returns the LLM response.
- If the LLM/provider errors, the Function returns a structured error and the client falls back to a retrieval-only (RAG-only) answer so the assistant stays usable.
- RAG data is loaded from R2 (or local `data/` in development).

### Local testing

```bash
# Start the emulator, then POST a test payload
wrangler pages dev . --port 8788
curl -X POST http://localhost:8788/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"What are the admissions requirements?"}'
```

---

## SEO, Sitemap & Robots

- **Canonical:** every public page carries `<link rel="canonical" href="https://engineering.kingston.ac.in/…">`.
- **Open Graph / Twitter:** main landing pages include `og:*` and `twitter:*` metadata.
- **Structured data:** JSON-LD for the educational institution on key pages.
- **`sitemap.xml`:** lists all real public pages under the production hostname (query-param pages like news details are intentionally excluded).
- **`robots.txt`:** allows crawling, declares the sitemap, blocks nothing essential.
- **`rag-monitor.html` and `404.html`** are dev/error pages and are intentionally excluded from canonical/indexing.

---

## Security

- **Security headers** via `_headers`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation disabled).
- **API hardening** in `functions/api/chat.js`:
  - Origin allowlist (no wildcard CORS).
  - Request size / message length limits.
  - Error messages sanitized (no internal details leaked).
- **No secrets in client code** — the OpenRouter key lives only in the Pages Function environment.
- **External `target="_blank"` links** use `rel="noopener noreferrer"`.
- **`.gitignore`** excludes `backups/`, `.env`, `data/*.bin`, `data/chunks.json`, `data/vector-index.json`, `_archive/`, `reports/`.

> CSP: a strict Content-Security-Policy is intentionally **not** forced because the site legally loads vendor code from public CDNs (Swiper, AOS, Font Awesome, Google Fonts). If you want to introduce CSP, start with a report-only policy in `_headers` and validate all third-party origins.

---

## Python Tooling & Scripts

Development/validation scripts live in `scripts/`. They are **not** part of the deployed site.

| Script | Purpose |
|--------|---------|
| `check_links.py` | Crawls all pages and reports broken internal references. |
| `production_audit.py` | Site-wide production audit (links, assets, data integrity). |
| `rebuild_kb.py` | Regenerates the RAG knowledge base (`chunks.json`, vectors) from source PDFs. |
| `prepare_vectors.py` | Builds `vectors.bin` from chunks. |
| `validate_kb.py` | Validates chunk/vector alignment and counts. |
| `knowledge_coverage_audit.py` | Measures RAG corpus coverage against key topics. |
| `test_rag_chatbot.py` | Runs the 300-query RAG evaluation suite. |
| `test_chat_proxy.py`, `openrouter_comparison_test.py` | API/proxy tests. |
| `test_cors_allowlist.mjs` | CORS allowlist verification. |
| `missing_info_guardrail_test.py` | Guardrail tests for unknown-query fallback. |
| `add_sri.py` | Helper for adding Subresource Integrity hashes. |

> RAG data is **protected**: do not regenerate or modify `data/vectors.bin` / `data/chunks.json` without a deliberate rebuild workflow.

---

## Content & Data Files

| File | Purpose | Maintained by |
|------|---------|---------------|
| `data/news.json` | News articles (24 items) | Content editor |
| `data/events.json` | Campus events | Content editor |
| `data/testimonials.json` | Alumni testimonials (23) | Content editor |
| `data/search-index.json` | Client search index | Rebuild on content change |
| `data/faculty.json`, `data/recruiters.json`, `data/placement-stats.json` | Faculty / recruiters / placement data | Content editor |

---

## Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| AI Assistant shows “model failed to load” | Verify `assets/models/all-MiniLM-L6-v2/` exists and is served with the correct MIME types (`_headers`). |
| AI Assistant can’t retrieve context | `vectors.bin` / `chunks.json` not reachable — check the R2 custom domain + CORS, or that `window.KEC_RAG_DATA_BASE` is set. |
| `/api/chat` returns 403 | Origin not in `ALLOWED_ORIGINS` — update the environment variable. |
| `/api/chat` returns 500 | `OPENROUTER_API_KEY` missing/invalid, or OpenRouter provider error. |
| Broken images/PDFs | Run `python scripts/check_links.py`; ensure referenced files exist and use forward-slash paths. |
| Search returns nothing | `data/search-index.json` missing or stale — regenerate. |

---

## License & Disclaimer

- © Kingston Engineering College, Vellore. All rights reserved.
- All institutional content, logos, and documents belong to Kingston Engineering College.
- This repository is provided for the college’s official web deployment. Reuse outside the institution requires permission.

---

_Generated for the production deployment of engineering.kingston.ac.in on Cloudflare Pages + R2._

---

Developed By  Muhammed Hammad S Owner Of [Aetherion-labs](https://aetherionlabs.qzz.io/)
