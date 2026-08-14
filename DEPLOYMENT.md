# Kingston Engineering College — Production Deployment Guide

Target platform: **Cloudflare Pages + Pages Functions** (NOT Vercel).
Production domain: `https://engineering.kingston.ac.in`

## 1. Architecture

```
GitHub repository
        ↓ (Git integration)
Cloudflare Pages (static HTML/CSS/JS)
        +
Pages Functions  /functions/api/chat.js  →  POST /api/chat  →  OpenRouter
Cloudflare R2    data/vectors.bin + data/chunks.json  →  window.KEC_RAG_DATA_BASE
Local model      assets/models/all-MiniLM-L6-v2 (ONNX, ~23 MB, in repo)
```

## 2. Environment Variables (set in Cloudflare Pages dashboard)

| Variable | Scope | Where used | Secret | Tested |
|----------|-------|-----------|--------|--------|
| `OPENROUTER_API_KEY` | Production + Preview | `functions/api/chat.js` | ✅ yes | ❌ requires real key |
| `OPENROUTER_MODEL` | Production + Preview | `functions/api/chat.js` | no | ✅ code path verified |
| `ALLOWED_ORIGINS` | Production + Preview | `functions/api/chat.js` (CORS allowlist) | no | ✅ code path verified |

- Never put these values in source code. They are read only from the environment.
- `ALLOWED_ORIGINS` should contain `https://engineering.kingston.ac.in` (and
  `http://localhost:8788` / preview domains during testing). `chat.js` rejects
  any origin not in the list and never returns `Access-Control-Allow-Origin: *`.

## 3. R2 (required BEFORE first deploy)

`data/vectors.bin` (28 MB) exceeds the Cloudflare Pages 25 MiB per-file limit, so
it **must** be served from R2. `chunks.json` (13 MB) may stay in-repo but moving
it to R2 keeps the artifact small.

1. Create R2 bucket (e.g. `kingston-kb`) in the Cloudflare dashboard.
2. Enable public access via a **custom subdomain** (recommended: `rag.engineering.kingston.ac.in`)
   — do NOT use the `r2.dev` development URL for production.
3. Upload under a `data/` prefix:
   - `data/vectors.bin` → Content-Type `application/octet-stream`
   - `data/chunks.json` → Content-Type `application/json`
   - `data/vectors-meta.json` → Content-Type `application/json` (tiny, optional)
4. Set R2 CORS policy for browser cross-origin fetches:
   - Allowed origin: `https://engineering.kingston.ac.in` (no `*`)
   - Method: `GET` only
5. Flip the runtime switch — the exact configuration point is
   **`ai-assistant.html`**, the commented script:

   ```html
   <script>
       window.KEC_RAG_DATA_BASE = 'https://rag.engineering.kingston.ac.in/data';
   </script>
   ```

   (Search for `KEC_RAG_DATA_BASE` in `ai-assistant.html` — it is the single
   place that points the browser at the R2 base URL. When the variable is
   undefined the loader falls back to same-origin `/data/`.)
6. Verify in DevTools → Network that `/data/vectors.bin` and `/data/chunks.json`
   now load from the R2 domain.

> `.gitignore` already lists `data/vectors.bin`, `data/chunks.json`,
> `data/vector-index.json`, `data/vectors-meta.json` for the post-R2 state.
> Because they are already tracked, git keeps serving them until you run
> `git rm --cached data/vector-index.json` (and the others) once R2 is live.
> `data/vector-index.json` (153 MB) is **build-time only** — never needed by the
> runtime — and must not be deployed.

## 4. Known Deploy Blockers (must be resolved before deploy)

| Item | Size | Status |
|------|------|--------|
| `data/vectors.bin` | 28 MB (> 25 MiB) | R2 (step 3) |
| `data/vector-index.json` | 153 MB | build-time only — `git rm --cached`, keep on disk |
| PDFs > 25 MiB under `assets/pdfs/` (naac/iqac evidence docs) | up to 72 MB | owner externalizes PDFs (see R2_SETUP.md / cloud-links work) |
| `assets/videos/main.mp4` + `admin_block.mp4` | 16.7 / 14.3 MB | ✅ already compressed below 25 MiB |

## 5. Deploy Steps (manual cutover)

1. Push this repository to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → **Connect to Git**.
3. Select the repo; build command: **none** (static site); output dir: `.`
   (matches `pages_build_output_dir = "."` in `wrangler.toml`).
4. Add the three env vars (section 2).
5. Set custom domain `engineering.kingston.ac.in` on the Pages project.
6. Complete the R2 steps (section 3) BEFORE first production deploy.
7. First deploy, then verify:
   - `https://engineering.kingston.ac.in/api/chat` returns JSON (not HTML)
   - AI assistant retrieves RAG context and answers grounded questions
   - All main pages return 200 and render (desktop + mobile)

## 6. Local Testing

```bash
npx wrangler pages dev .        # serves static + /functions together
curl -X POST http://localhost:8788/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"test","retrievedContext":""}'
```

## 7. Security Notes

- `_headers` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
  `Referrer-Policy`, `Permissions-Policy`. (CSP is intentionally not enabled —
  see the comment block in `_headers`.)
- `_redirects` deliberately has no SPA catch-all (multi-page site).
- `robots.txt` allows the site and declares the sitemap.
- `sitemap.xml` is the real search-engine sitemap (124 URLs).
- Developer pages (`rag-monitor.html`) are `noindex`.
