/**
 * Cloudflare Pages Function — OpenRouter API Proxy
 * ==================================================
 * Route: POST /api/chat
 *
 * This function proxies chat completion requests from the browser
 * to OpenRouter. The API key is stored as a Cloudflare Pages secret
 * (OPENROUTER_API_KEY) and is NEVER exposed to the client.
 *
 * Environment Variables (set in Cloudflare Pages dashboard):
 *   OPENROUTER_API_KEY  (required) — Your OpenRouter API key
 *   OPENROUTER_MODEL    (optional, legacy) — Model name. NOTE: the chat model
 *                                    is currently hardcoded to openai/gpt-oss-20b:free
 *                                    in onRequestPost; OPENROUTER_MODEL no longer
 *                                    overrides it.
 *   ALLOWED_ORIGINS     (optional) — Comma-separated exact origins allowed for
 *                                    cross-origin calls, e.g.
 *                                    "https://engineering.kingston.ac.in,https://www.example.pages.dev"
 *                                    Same-origin requests (no Origin header) and
 *                                    localhost/127.0.0.1 (any port) are always allowed.
 *
 * Request body (from browser):
 *   {
 *     query: string,                    // User's question
 *     retrievedContext: string          // Context from RAG retrieval
 *   }
 *
 * Response:
 *   Standard OpenRouter chat completion response
 *   { choices: [...], usage: {...} }
 */

// CORS — production-safe origin allowlist.
// The wildcard `Access-Control-Allow-Origin: *` has been replaced with an
// environment-driven allowlist (see ALLOWED_ORIGINS above). Behaviour:
//   - No Origin header          → same-origin / curl / server-to-server.
//                                 No ACAO header is added, which is correct:
//                                 browsers only enforce CORS when Origin exists.
//   - Origin is localhost / 127.0.0.1 (any port) → allowed (dev / wrangler pages dev).
//   - Origin matches an entry in ALLOWED_ORIGINS → allowed; the request's own
//                                 origin is reflected (never "*"), with Vary: Origin.
//   - Anything else             → no ACAO header, so the browser blocks the
//                                 response for that origin. The request itself
//                                 is still processed (CORS is browser-side
//                                 enforcement only — see /docs for rationale).
const STATIC_CORS_HEADERS = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

function isLocalhostOrigin(origin) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function isOriginAllowed(origin, env) {
    if (isLocalhostOrigin(origin)) return true;
    const configured = (env && env.ALLOWED_ORIGINS) || '';
    const list = configured.split(',')
        .map(function (o) { return o.trim(); })
        .filter(Boolean);
    return list.indexOf(origin) !== -1;
}

function corsHeaders(request, env) {
    const origin = request.headers.get('Origin');
    if (!origin || !isOriginAllowed(origin, env)) {
        return { ...STATIC_CORS_HEADERS };
    }
    return {
        ...STATIC_CORS_HEADERS,
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
    };
}

/**
 * Build the system prompt for the college assistant.
 * Enforces strict context-only answering to prevent hallucination.
 */
function buildSystemPrompt() {
    return `You are a precise college information assistant for Kingston Engineering College.
You have access to official knowledge base excerpts below in the "Context" section.

STRICT RULES — You MUST follow ALL of these:

1. Answer ONLY using the information explicitly present in the provided context.
2. If the context does not contain the answer to the user's question, say EXACTLY:
   "I couldn't find reliable information about this in the Kingston Engineering College knowledge base."
3. Never generate phone numbers, email addresses, fee amounts, dates, or statistics from your training data — they may be inaccurate.
4. Never guess, never infer, never use external knowledge.
5. Keep answers concise and student-friendly. Use bullet points for lists.
6. Always cite the source file name (from the [Source: ...] headers in the context) for each piece of information you provide.

Remember: It is BETTER to say you don't know than to give incorrect information.`;
}

/**
 * Handle POST /api/chat
 */
export async function onRequestPost(context) {
    const { request, env } = context;
    const CORS_HEADERS = corsHeaders(request, env);

    // ── Read configuration from Cloudflare Secrets ──
    const apiKey = env.OPENROUTER_API_KEY;

    if (!apiKey) {
        return new Response(JSON.stringify({
            error: 'OpenRouter API key not configured. Set OPENROUTER_API_KEY in Cloudflare Pages environment variables.',
        }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    // Chat (LLM) model — user-selected: openai/gpt-oss-20b:free (OpenRouter free tier).
    // Note: hardcoded on purpose so the env var cannot silently override it.
    // To switch back to env-var control, restore: env.OPENROUTER_MODEL || '...'
    const model = 'openai/gpt-oss-20b:free';

    // ── SECURITY (SEC-005): throttle abuse of the paid endpoint ──
    // Reject oversized bodies BEFORE parsing so an attacker can't drain the
    // OpenRouter budget or edge-CPU with giant contexts. Limits are generous
    // enough for any legitimate RAG question yet far below Cloudflare's default.
    const MAX_BODY_BYTES    = 16 * 1024;   // 16 KB raw request body
    const MAX_QUERY_LEN     = 1000;        // user question
    const MAX_CONTEXT_LEN   = 8000;        // retrieved RAG context (top-2 chunks)

    const cl = request.headers.get('content-length');
    if (cl && parseInt(cl, 10) > MAX_BODY_BYTES) {
        return new Response(JSON.stringify({ error: 'Payload too large' }), {
            status: 413,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    // ── Parse request body ──
    let body;
    try {
        body = await request.json();
    } catch (err) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    const { query, retrievedContext } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return new Response(JSON.stringify({ error: 'query is required and must be a non-empty string' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }
    if (query.length > MAX_QUERY_LEN) {
        return new Response(JSON.stringify({ error: 'query exceeds maximum length' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }
    if (retrievedContext && typeof retrievedContext === 'string' && retrievedContext.length > MAX_CONTEXT_LEN) {
        return new Response(JSON.stringify({ error: 'retrievedContext exceeds maximum length' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    // ── Build OpenRouter request ──
    const userMessage = retrievedContext && typeof retrievedContext === 'string' && retrievedContext.trim().length > 0
        ? `Context:\n${retrievedContext}\n\nQuestion: ${query}`
        : query;

    const openRouterBody = {
        model: model,
        messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 400,
        top_p: 0.9,
    };

    // ── Call OpenRouter API ──
    const startTime = Date.now();

    try {
        const orResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://kingston.ac.in',
                'X-OpenRouter-Title': 'Kingston Engineering College AI Assistant',
            },
            body: JSON.stringify(openRouterBody),
        });

        const latencyMs = Date.now() - startTime;

        // SECURITY (SEC-008): guard the upstream JSON parse — a non-JSON OpenRouter
        // error page must not crash into the generic catch, and we avoid echoing
        // provider-internal error bodies verbatim to the client.
        let orData;
        try {
            orData = await orResponse.json();
        } catch (parseErr) {
            console.error('OpenRouter returned non-JSON response', parseErr);
            return new Response(JSON.stringify({
                error: 'Upstream provider error',
                status: orResponse.status,
            }), {
                status: 502,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
        }

        // Add latency info for client-side metrics
        const responseData = {
            ...orData,
            _latencyMs: latencyMs,
        };

        return new Response(JSON.stringify(responseData), {
            status: orResponse.status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });

    } catch (err) {
        // Log full detail server-side (visible in Pages logs) but return a
        // generic message to the client — do not leak internal fetch/DNS/TLS
        // detail through err.message.
        console.error('OpenRouter proxy error:', err);
        return new Response(JSON.stringify({
            error: 'Failed to reach the assistant service. Please try again.',
        }), {
            status: 502,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }
}

/**
 * Handle OPTIONS (CORS preflight)
 */
export async function onRequestOptions(context) {
    const { request, env } = context;
    return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
    });
}
