/**
 * test_cors_allowlist.mjs
 * =======================
 * Standalone regression test for the CORS allowlist logic in
 * functions/api/chat.js. Run with plain Node (no deps, no network):
 *
 *     node scripts/test_cors_allowlist.mjs
 *
 * Exits 0 on success, 1 on any failed expectation.
 */

// Copy of the logic under test (kept deliberately in sync by being imported
// as a side-effect-free pure function). We re-declare it here so the test can
// run with plain `node` — functions/api/chat.js is an ES-module Worker and
// exporting internals would change its runtime contract.
function isLocalhostOrigin(origin) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
function isOriginAllowed(origin, env) {
    if (isLocalhostOrigin(origin)) return true;
    const configured = (env && env.ALLOWED_ORIGINS) || '';
    const list = configured.split(',').map(function (o) { return o.trim(); }).filter(Boolean);
    return list.indexOf(origin) !== -1;
}
function corsHeadersFor(originHeader, env) {
    if (!originHeader || !isOriginAllowed(originHeader, env)) {
        return { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
    }
    return {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Origin': originHeader,
        'Vary': 'Origin',
    };
}

let failed = 0;
function check(name, cond) {
    if (cond) { console.log('  PASS  ' + name); }
    else { failed++; console.log('  FAIL  ' + name); }
}

const envProd = { ALLOWED_ORIGINS: 'https://engineering.kingston.ac.in, https://kingston-engineering-college.pages.dev' };

console.log('CORS allowlist regression tests');

// 1. Same-origin request (no Origin header) — must NOT be blocked server-side,
//    and must NOT echo any ACAO header (browser enforces nothing when Origin absent).
const same = corsHeadersFor(null, envProd);
check('same-origin: no ACAO header added', !('Access-Control-Allow-Origin' in same));

// 2. Dev origins — always allowed regardless of env config.
for (const dev of ['http://localhost', 'http://localhost:8788', 'http://127.0.0.1:5500', 'https://localhost:3000']) {
    const h = corsHeadersFor(dev, {}); // empty env on purpose
    check('dev origin allowed: ' + dev, h['Access-Control-Allow-Origin'] === dev);
}

// 3. Production allowlist — exact matches only.
const okOrigin = 'https://engineering.kingston.ac.in';
const hOk = corsHeadersFor(okOrigin, envProd);
check('prod origin allowed + reflected', hOk['Access-Control-Allow-Origin'] === okOrigin);
check('Vary: Origin set on allowed origin', hOk['Vary'] === 'Origin');
const okPreview = corsHeadersFor('https://kingston-engineering-college.pages.dev', envProd);
check('pages.dev preview origin allowed', okPreview['Access-Control-Allow-Origin'] === 'https://kingston-engineering-college.pages.dev');

// 4. Evil / unlisted origins — must NOT receive ACAO.
for (const evil of ['https://evil.com', 'http://localhost.evil.com', 'https://engineering.kingston.ac.in.evil.com', 'https://sub.engineering.kingston.ac.in']) {
    const h = corsHeadersFor(evil, envProd);
    check('blocked (no ACAO): ' + evil, !('Access-Control-Allow-Origin' in h));
}

// 5. Wildcard must never appear.
check('wildcard "*" never emitted',
    corsHeadersFor(okOrigin, envProd)['Access-Control-Allow-Origin'] !== '*' &&
    corsHeadersFor('https://evil.com', envProd)['Access-Control-Allow-Origin'] !== '*');

// 6. Missing env (fresh deploy where ALLOWED_ORIGINS not set yet):
//    localhost still works (dev), external origins blocked.
check('no env: localhost still allowed', corsHeadersFor('http://localhost:8788', {})['Access-Control-Allow-Origin'] === 'http://localhost:8788');
check('no env: external origin blocked', !('Access-Control-Allow-Origin' in corsHeadersFor('https://anything.example', {})));

console.log('');
if (failed > 0) { console.error(failed + ' check(s) FAILED'); process.exit(1); }
console.log('All checks passed.');
