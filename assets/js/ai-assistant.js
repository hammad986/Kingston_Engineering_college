/**
 * Kingston Engineering College – AI Assistant v3
 * Features: weighted scoring, context memory, search fallback,
 * typing indicator, Hindi/Hinglish support, follow-up suggestions,
 * improved fallback cards, chat persistence (localStorage)
 */

class AIAssistant {
    constructor() {
        this.knowledgeBase = null;
        this.searchIndex = null;
        this.intentMemory = [];
        this.MAX_MEMORY = 3;
        this.STORAGE_KEY_FP = 'kec_chat_fullpage';
        this.STORAGE_KEY_WG = 'kec_chat_widget';
        this.MAX_STORED = 60; // max message objects in localStorage

        /* ── Conversational responses (natural, non-scripted) ── */
        this.CONVERSATION_TYPES = {
            greeting: {
                patterns: ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening',
                           'namaste', 'vanakkam', 'namaskar', 'hii', 'helo', 'heyy', 'heya', 'howdy',
                           'assalamu alaikum', 'salam', 'wa alaikum', 'assalamualaikum'],
                responses: [
                    "Hello! 👋 I'm the Kingston Engineering College AI Assistant. How can I help you today?",
                    "Hi there! Welcome to Kingston Engineering College. What would you like to know?",
                    "Hello! Welcome to Kingston. I'm here to help with admissions, academics, placements, and more. What can I assist you with?",
                    "Hey! 👋 Great to see you. I'm your Kingston College assistant. Ask me anything about the college!"
                ]
            },
            thanks: {
                patterns: ['thanks', 'thank you', 'thank u', 'ty', 'thankyou', 'thanks a lot', 'thank you so much', 'thanks bro', 'thnks', 'thx'],
                responses: [
                    "You're welcome! 😊 If you have any more questions, feel free to ask anytime.",
                    "Happy to help! Let me know if you need anything else about Kingston.",
                    "My pleasure! Don't hesitate to ask if you have more questions about admissions, placements, or anything else."
                ]
            },
            goodbye: {
                patterns: ['bye', 'goodbye', 'see you', 'see ya', 'cya', 'talk later', 'gotta go', 'bye bye', 'good night', 'take care'],
                responses: [
                    "Goodbye! Have a wonderful day. If you need any help later, I'll be here. 😊",
                    "See you later! Best of luck with your college journey. Feel free to come back anytime!",
                    "Take care! If you think of any more questions about Kingston, just drop by."
                ]
            },
            who_are_you: {
                patterns: ['who are you', 'what are you', 'your name', 'tell me about yourself', 'introduce yourself',
                           'who r u', 'what is your name', 'who is this', 'what can you do', 'help', 'what do you do'],
                responses: [
                    "I'm the Kingston Engineering College AI Assistant! 🤖 I can help you with admissions, academics, departments, placements, fees, scholarships, hostel facilities, campus life, and much more. Just ask me anything about the college!",
                    "I'm your virtual college guide for Kingston Engineering College. Think of me as a friendly 24/7 help desk that knows everything about admissions, programs, placements, facilities, and more. What would you like to explore?"
                ]
            },
            how_are_you: {
                patterns: ['how are you', 'how are you doing', 'how r u', 'how are things', 'whats up', 'what\'s up', 'sup', 'how is it going', 'how you doing', 'you good'],
                responses: [
                    "I'm doing great, thanks for asking! 😊 Ready to help you with anything about Kingston Engineering College. What can I assist you with today?",
                    "I'm fantastic! It's a great day to help you learn about Kingston. What would you like to know?"
                ]
            }
        };

        /* ── Per-intent follow-up suggestions ────────────────── */
        this.followUps = {
            greeting:        [{ text: '📋 Admissions', q: 'Tell me about admissions' }, { text: '💰 Fees', q: 'What is the fee structure?' }, { text: '📊 Placements', q: 'Tell me about placements' }],
            admission:       [{ text: '💰 Fee Structure', q: 'What is the fee structure?' }, { text: '🏆 Scholarships', q: 'Tell me about scholarships' }, { text: '📞 Contact Admission', q: 'How to contact Kingston?' }],
            fees:            [{ text: '🏆 Scholarships', q: 'Tell me about scholarships' }, { text: '📋 Admission Process', q: 'Tell me about admissions' }, { text: '💳 Pay Online', q: '' }],
            placement:       [{ text: '💼 Internships', q: 'Tell me about internships' }, { text: '🏭 Industry Connect', q: 'Tell me about industry connect' }, { text: '🎓 Higher Education', q: 'Tell me about higher education' }],
            contact:         [{ text: '📋 Admissions', q: 'Tell me about admissions' }, { text: '🗺️ Campus Tour', q: 'Tell me about campus tour' }],
            departments:     [{ text: '💻 CSE Details', q: 'Tell me about CSE department' }, { text: '📋 Admissions', q: 'Tell me about admissions' }, { text: '📊 Placements', q: 'Tell me about placements' }],
            hostel:          [{ text: '🚌 Transport', q: 'Tell me about transport and bus routes' }, { text: '🏫 Facilities', q: 'What facilities are available?' }, { text: '💰 Hostel Fees', q: 'What is the fee structure?' }],
            scholarship:     [{ text: '📋 Admission Process', q: 'Tell me about admissions' }, { text: '💰 Fee Structure', q: 'What is the fee structure?' }],
            naac:            [{ text: '🏛️ About Kingston', q: 'Tell me about Kingston Engineering College' }, { text: '⭐ IQAC', q: 'Tell me about IQAC' }],
            facilities:      [{ text: '📚 Library', q: 'Tell me about library' }, { text: '⚽ Sports', q: 'Tell me about sports' }, { text: '🏠 Hostel', q: 'Tell me about hostel facilities' }],
            library:         [{ text: '🏫 Other Facilities', q: 'What facilities are available?' }, { text: '🔬 Research', q: 'Tell me about research at Kingston' }],
            sports:          [{ text: '🎭 Clubs', q: 'Tell me about clubs and activities' }, { text: '🏠 Hostel', q: 'Tell me about hostel facilities' }],
            transport:       [{ text: '📞 Contact Us', q: 'How to contact Kingston?' }, { text: '🏠 Hostel', q: 'Tell me about hostel facilities' }],
            clubs:           [{ text: '🔬 Research', q: 'Tell me about research at Kingston' }, { text: '📊 Placements', q: 'Tell me about placements' }],
            research:        [{ text: '🏛️ Departments', q: 'What departments are available?' }, { text: '🎓 Higher Education', q: 'Tell me about higher education' }],
            cse:             [{ text: '📊 CSE Placements', q: 'Tell me about CSE placements' }, { text: '👥 CSE Faculty', q: 'Tell me about CSE faculty' }, { text: '📋 Admission', q: 'Tell me about admissions' }],
            alumni:          [{ text: '📊 Placements', q: 'Tell me about placements' }, { text: '🏛️ About Kingston', q: 'Tell me about Kingston Engineering College' }],
            higher_education:[{ text: '📋 Admissions', q: 'Tell me about admissions' }, { text: '📊 Placements', q: 'Tell me about placements' }],
            internship:      [{ text: '📊 Placements', q: 'Tell me about placements' }, { text: '💼 Industry Connect', q: 'Tell me about industry connect' }],
            iqac:            [{ text: '🏅 NAAC', q: 'Tell me about NAAC accreditation' }, { text: '🏛️ About Kingston', q: 'Tell me about Kingston Engineering College' }],
            about:           [{ text: '🏛️ Departments', q: 'What departments are available?' }, { text: '🗺️ Campus Tour', q: 'Tell me about campus tour' }, { text: '📋 Admissions', q: 'Tell me about admissions' }],
            thanks:          [{ text: '📋 Admissions', q: 'Tell me about admissions' }, { text: '📊 Placements', q: 'Tell me about placements' }],
            goodbye:         [],
        };

        this.init();
    }

    /* ── Bootstrap ───────────────────────────────────────────── */
    async init() {
        try {
            await Promise.all([
                this.loadKnowledgeBase(),
                this.loadSearchIndex()
            ]);
            this.attachEventListeners();
            this.bindGlobalButtons(); // Bind chatbot buttons on all pages
            this.restoreOrWelcome();
            this.autoFocusInput();

            /* ── RAG Integration (PART 5+6+7 of master prompt) ──────────
               Lazy-load the vector-search worker in the background and
               consult it from `renderSearchFallback()` when the curated
               knowledge base produces no intent match. The RAG pipeline
               is unchanged (same worker, same scoring, same data files);
               only the orchestration is new.
               Loads deferred / low-priority so the chat opens instantly. */
            this._initRAGDeferred();
        } catch (e) {
            console.error('[KingstonAI] Init error:', e);
        }
    }

    /* ── RAG orchestration ──────────────────────────────────── */
    _initRAGDeferred() {
        // Don't block UI — defer RAG warmup until the page is idle.
        const start = () => this._initRAG();
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(start, { timeout: 4000 });
        } else {
            setTimeout(start, 1500);
        }
    }

    async _initRAG() {
        try {
            // Do not re-initialize if something already wired a worker in.
            if (this._ragWorker) return;

            this._ragReady = false;
            this._ragChunks = [];
            this._ragError = null;           // surfaced for diagnostics / monitor

            // ── Local embedding model (NO Hugging Face runtime dependency) ──
            // The all-MiniLM-L6-v2 q8 weights + tokenizer are bundled under
            // assets/models/all-MiniLM-L6-v2/. We configure transformers.js
            // to resolve from there and DISABLE remote model fetches so a
            // CDN outage (or an offline/air-gapped deploy) can never silently
            // break RAG. Model id is prefixed with the local dir so the
            // feature-extraction pipeline resolves to our bundled files.
            this._ragPipelinePromise = import('/assets/vendor/transformers/transformers.min.js')
                .then(m => {
                    const env = m.env || (m.default && m.default.env);
                    if (env) {
                        env.allowLocalModels = true;
                        env.allowRemoteModels = false;                 // strict: local only
                        env.localModelPath = '/assets/models/';        // served model root
                        // Serve the ONNX Runtime Web WASM binaries locally too — by
                        // default v2.17.1 pulls them from cdn.jsdelivr.net, which would
                        // still be a runtime CDN dependency. Pin to our vendored copies.
                        if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
                            env.backends.onnx.wasm.wasmPaths = '/assets/vendor/transformers/';
                            env.backends.onnx.wasm.numThreads = 1;      // predictable, no COOP/COEP need
                        }
                    }
                    const pipe = m.pipeline || (m.default && m.default.pipeline);
                    // models local dir + id → /assets/models/all-MiniLM-L6-v2/
                    return pipe('feature-extraction', 'all-MiniLM-L6-v2', { quantized: true });
                });

            // Spawn the worker. Uses the same URL pattern as the isolated RAG page.
            const base = (typeof window !== 'undefined' && window.KEC_RAG_DATA_BASE)
                ? String(window.KEC_RAG_DATA_BASE).replace(/\/+$/, '')
                : '/data';
            this._ragVecUrl = base + '/vectors.bin';
            this._ragChunksUrl = base + '/chunks.json';

            // Track worker readiness separately from model readiness so the
            // final _ragReady flag means BOTH are up.
            this._ragWorkerReady = false;

            this._ragWorker = new Worker('/assets/js/rag-worker.js');
            this._ragWorker.onmessage = (e) => {
                const msg = e.data;
                if (msg.type === 'ready') {
                    this._ragWorkerReady = true;
                    this._updateRagReady();
                    console.info(`[KingstonAI RAG] worker ready: count=${msg.count}, dim=${msg.dim}, chunks=${msg.chunksCount}`);
                } else if (msg.type === 'error') {
                    console.warn('[KingstonAI RAG] worker error:', msg.message);
                    this._ragError = 'worker: ' + msg.message;
                }
            };
            this._ragWorker.postMessage({
                type: 'init',
                vectorsUrl: this._ragVecUrl,
                chunksUrl: this._ragChunksUrl,
            });

            // Fetch chunks.json for context preview rendering (small overhead).
            fetch(this._ragChunksUrl)
                .then(r => r.ok ? r.json() : null)
                .then(chunks => { if (Array.isArray(chunks)) this._ragChunks = chunks; })
                .catch(() => {});

            // Wait for the embedding pipeline so we can embed queries.
            this._ragExtractor = await this._ragPipelinePromise;
            if (!this._ragExtractor) throw new Error('feature-extraction pipeline returned null');
            this._updateRagReady();
            console.info('[KingstonAI RAG] embedding pipeline (local all-MiniLM-L6-v2, q8) loaded.');
        } catch (err) {
            console.warn('[KingstonAI] RAG init failed — falling back to curated search only.', err);
            this._ragError = String((err && err.message) || err);
            this._ragWorker = null;
            this._ragExtractor = null;
            this._ragWorkerReady = false;
            this._ragReady = false;
        }
    }

    /* ── _ragReady is TRUE only when BOTH the embedding model and the
       vector worker are live. Exposed for the RAG monitor / diagnostics. ── */
    _updateRagReady() {
        this._ragReady = !!(this._ragWorker && this._ragWorkerReady && this._ragExtractor);
        try { window.KEC_RAG_READY = this._ragReady; } catch (e) {}
        return this._ragReady;
    }

    async _ragQuery(text, topK = 5) {
        if (!this._ragReady || !this._ragWorker || !this._ragExtractor) return null;
        try {
            const out = await this._ragExtractor(text, { pooling: 'mean', normalize: true });
            const vec = Array.from(out.data || out.tolist() || []);
            if (!vec.length) return null;

            return await new Promise((resolve) => {
                const handler = (e) => {
                    if (e.data && e.data.type === 'results') {
                        this._ragWorker.removeEventListener('message', handler);
                        resolve(e.data.results || []);
                    }
                };
                this._ragWorker.addEventListener('message', handler);
                this._ragWorker.postMessage({ type: 'search', queryVector: vec, queryText: text, topK });
                setTimeout(() => {
                    this._ragWorker.removeEventListener('message', handler);
                    resolve(null); // Safety timeout
                }, 8000);
            });
        } catch (err) {
            console.warn('[KingstonAI RAG] query error:', err);
            return null;
        }
    }

    /**
     * Optional LLM enhancement — server-side via Cloudflare Pages Function.
     * The endpoint /api/chat expects { query, retrievedContext } and returns
     * an OpenRouter-shaped payload. No secret is in the browser.
     *
     * Disabled by default. To enable, set:
     *   window.KEC_ENABLE_LLM = true
     * before ai-assistant.js loads.
     *
     * The function must exist and OPENROUTER_API_KEY / OPENROUTER_MODEL must
     * be configured as Cloudflare Pages secrets. If disabled or unavailable,
     * the assistant silently falls back to the curated+RAG-only response.
     */
    async _llmEnhance(query, ragResults) {
        if (typeof window === 'undefined' || !window.KEC_ENABLE_LLM) return null;
        if (!ragResults || !ragResults.length) return null;
        try {
            // Concatenate the top 2 chunk texts as retrieval context.
            const ctx = ragResults.slice(0, 2)
                .map(r => (r.text || '').trim())
                .filter(Boolean)
                .join('\n\n---\n\n');
            if (!ctx) return null;

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, retrievedContext: ctx }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            const answer = data && data.choices && data.choices[0] && data.choices[0].message
                ? String(data.choices[0].message.content || '').trim()
                : null;
            return answer || null;
        } catch (err) {
            console.warn('[KingstonAI] LLM enhance error:', err);
            return null;
        }
    }

    _renderRAGAnswer(userQuery, results, type) {
        // Filter to confident hits only (thresholds validated against the RAG test suite)
        const CONF_MED = 0.35;
        const strong = (results || []).filter(r => (r.finalScore !== undefined ? r.finalScore : r.weightedScore) >= CONF_MED
                                                  && (r.availabilityPass !== false));
        if (!strong.length) return false;

        const top = strong[0];
        const text = (top.text || '').trim();
        const title = (top.title || 'Kingston Engineering College');

        // Pick 2–4 key sentences as the answer body (curated from retrieval, not LLM-paraphrased —
        // this is what protects against hallucination when the LLM is off).
        const sentences = text
            .replace(/([.!?])\s*/g, '$1|')
            .split('|')
            .map(s => s.trim())
            .filter(s => s.length > 30)
            .slice(0, 4);

        let bodyHtml = '';
        if (sentences.length) {
            bodyHtml = '<ul style="margin:6px 0 0 18px;">'
                + sentences.map(s => `<li>${this._escapeHTML(s)}</li>`).join('')
                + '</ul>';
        } else if (text) {
            bodyHtml = `<p>${this._escapeHTML(text.substring(0, 320))}${text.length > 320 ? '…' : ''}</p>`;
        } else {
            return false;
        }

        // Source links (unique) — rendered only when a source is present.
        const seen = new Set();
        const sourcesHtml = strong.slice(0, 3)
            .filter(r => r.source && !seen.has(r.source) && seen.add(r.source))
            .map(r => `<a href="${this._escapeHTML(r.source)}" class="ai-rag-src" target="_blank" rel="noopener">${this._escapeHTML(r.source)}</a>`)
            .join('');
        const sourcesRow = sourcesHtml
            ? `<div class="ai-rag-sources"><span>Source${sourcesHtml.includes('</a><a') ? 's' : ''}:</span> ${sourcesHtml}</div>`
            : '';

        // Optional: asynchronously enhance with server-side LLM. If unavailable/disabled, the
        // curated body above is the primary answer (already rendered below). The LLM-enhanced
        // prose is appended afterwards so the user always sees the grounded answer first.
        this._llmEnhance(userQuery, strong).then(llmText => {
            if (!llmText) return;
            const container = (type === 'fullpage')
                ? document.getElementById('fullpage-messages')
                : document.getElementById('ai-messages');
            if (!container) return;
            const div = document.createElement('div');
            div.className = 'ai-message bot ai-llm-enhanced';
            div.innerHTML = `<div class="ai-bubble"><em style="color:#4a6b94;font-size:0.75rem;">✨ More readable summary:</em><br>${this._escapeHTML(llmText)}</div>`;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        }).catch(() => {});

        const html = `
            <div class="ai-rag-block">
                <div class="ai-rag-title">📌 <strong>From Kingston's knowledge base:</strong> <em>${this._escapeHTML(title)}</em></div>
                ${bodyHtml}
                ${sourcesRow}
                <div class="ai-rag-disclaimer" style="font-size:0.72rem;color:#8a8a8a;margin-top:8px;">
                    Answer grounded in the official knowledge base. If anything looks off, please verify with the college directly.
                </div>
            </div>`;

        this.displayMessage(html, 'bot', true, type);
        return true;
    }

    _escapeHTML(s) {
        if (!s) return '';
        return String(s).replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        })[c]);
    }


    /* ── Global Button Binding (for all pages) ──────────────────── */
    bindGlobalButtons() {
        try {
            // Bind AI toggle buttons (primary selector is ai-widget-toggle class)
            const toggleBtns = document.querySelectorAll('.ai-widget-toggle');
            console.log('[KingstonAI] Found', toggleBtns.length, 'toggle buttons');
            toggleBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[KingstonAI] Button clicked!');
                    const widget = document.getElementById('ai-widget-container');
                    if (widget) {
                        widget.classList.toggle('active');
                        console.log('[KingstonAI] Widget toggled. Active:', widget.classList.contains('active'));
                    } else {
                        console.error('[KingstonAI] Widget container not found!');
                    }
                });
            });
        } catch (e) {
            console.warn('[KingstonAI] Button binding error:', e);
        }
    }

    async loadKnowledgeBase() {
        try {
            // Root-absolute so the KB loads identically from the root page and
            // every nested page (this widget is included site-wide).
            const res = await fetch('/data/knowledge-base.json');
            this.knowledgeBase = await res.json();
        } catch (e) {
            console.warn('[KingstonAI] Failed to load knowledge base.', e);
        }
    }

    async loadSearchIndex() {
        try {
            const res = await fetch('/data/search-index.json');
            this.searchIndex = await res.json();
        } catch (e) {
            console.warn('[KingstonAI] Failed to load search index.', e);
        }
    }

    /* ── Event listeners ─────────────────────────────────────── */
    attachEventListeners() {
        const sendBtns = [
            document.getElementById('fullpage-send'),
            document.getElementById('ai-send-btn')
        ];
        const inputs = [
            document.getElementById('fullpage-input'),
            document.getElementById('ai-input')
        ];

        sendBtns.forEach(btn => {
            if (!btn) return;
            btn.addEventListener('click', () => {
                const type = btn.id.includes('fullpage') ? 'fullpage' : 'widget';
                this.handleSendMessage(type);
            });
        });

        inputs.forEach(input => {
            if (!input) return;
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const type = input.id.includes('fullpage') ? 'fullpage' : 'widget';
                    this.handleSendMessage(type);
                }
            });
        });

        // Quick action buttons (static)
        document.querySelectorAll('.ai-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const query = btn.getAttribute('data-query');
                if (query) {
                    this.setInput(query);
                    this.handleSendMessage('fullpage');
                }
            });
        });

        // Close button handler (toggle binding is handled by bindGlobalButtons)
        const widget = document.getElementById('ai-widget-container');
        const close = document.getElementById('ai-widget-close');

        if (close && widget) {
            close.addEventListener('click', () => widget.classList.remove('active'));
        }

        // Auto-focus input when widget opens
        if (widget) {
            widget.addEventListener('click', (e) => {
                if (widget.classList.contains('active') && e.target.id === 'ai-input') {
                    e.target.focus();
                }
            });
        }

        // Clear chat button (fullpage only)
        const clearBtn = document.getElementById('ai-clear-chat');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearChat('fullpage'));
        }
    }

    autoFocusInput() {
        setTimeout(() => {
            const input = document.getElementById('fullpage-input') || document.getElementById('ai-input');
            if (input) input.focus();
        }, 500);
    }

    setInput(text) {
        const input = document.getElementById('fullpage-input') || document.getElementById('ai-input');
        if (input) { input.value = text; input.focus(); }
    }

    /* ── Chat Persistence ────────────────────────────────────── */
    storageKey(type) {
        return type === 'fullpage' ? this.STORAGE_KEY_FP : this.STORAGE_KEY_WG;
    }

    saveMessage(html, sender, type) {
        try {
            const key = this.storageKey(type);
            const history = JSON.parse(localStorage.getItem(key) || '[]');
            history.push({ html, sender, ts: Date.now() });
            // Keep only the last MAX_STORED messages
            if (history.length > this.MAX_STORED) history.splice(0, history.length - this.MAX_STORED);
            localStorage.setItem(key, JSON.stringify(history));
        } catch (e) { /* storage full or private mode */ }
    }

    restoreHistory(type) {
        try {
            const key = this.storageKey(type);
            const history = JSON.parse(localStorage.getItem(key) || '[]');
            if (!history.length) return false;

            history.forEach(({ html, sender }) => {
                this.displayMessage(html, sender, false, type, false); // no save again
            });
            return true;
        } catch (e) { return false; }
    }

    clearChat(type) {
        try { localStorage.removeItem(this.storageKey(type)); } catch (e) {}
        const containerId = type === 'fullpage' ? 'fullpage-messages' : 'ai-messages';
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';
        // Use natural conversational greeting instead of bullet-list format
        var greetingType = this.CONVERSATION_TYPES.greeting;
        var response = greetingType.responses[Math.floor(Math.random() * greetingType.responses.length)];
        this.displayMessage(response, 'bot', false, type);
        var chips = this.followUps.greeting;
        if (chips && chips.length > 0) {
            this.renderSuggestionChips(chips, type, false);
        }
    }

    restoreOrWelcome() {
        // Chat persistence disabled — always start fresh on refresh.
        try {
            localStorage.removeItem(this.STORAGE_KEY_FP);
            localStorage.removeItem(this.STORAGE_KEY_WG);
        } catch (e) { /* ignore */ }

        // Use natural conversational greeting instead of bullet-list format
        var greetingType = this.CONVERSATION_TYPES.greeting;
        var response = greetingType.responses[Math.floor(Math.random() * greetingType.responses.length)];
        this.displayMessage(response, 'bot', false, 'fullpage');
        this.displayMessage(response, 'bot', false, 'widget');
        var chips = this.followUps.greeting;
        if (chips && chips.length > 0) {
            this.renderSuggestionChips(chips, 'fullpage', false);
            this.renderSuggestionChips(chips, 'widget', false);
        }
    }

    /* ── Message flow ────────────────────────────────────────── */
    handleSendMessage(type = 'fullpage') {
        const inputId = type === 'fullpage' ? 'fullpage-input' : 'ai-input';
        const input = document.getElementById(inputId);
        if (!input) return;

        const userMessage = input.value.trim();
        if (!userMessage) return;

        input.value = '';
        this._lastUserMessage = userMessage; // captured for RAG grounding
        this.displayMessage(userMessage, 'user', true, type);
        this.showTypingIndicator(type);

        setTimeout(() => {
            this.hideTypingIndicator(type);
            this.processUserMessage(userMessage, type);
        }, 350 + Math.random() * 200);
    }

    /* ── Detect conversational message type ──────────────────── */
    detectConversation(message) {
        const msg = message.toLowerCase().trim();
        
        for (const [type, config] of Object.entries(this.CONVERSATION_TYPES)) {
            for (const pattern of config.patterns) {
                if (msg === pattern || msg.startsWith(pattern + ' ') || msg.startsWith(pattern + '!') || msg.startsWith(pattern + '.')) {
                    const response = config.responses[Math.floor(Math.random() * config.responses.length)];
                    return { type, response };
                }
            }
        }
        
        return null;
    }

    processUserMessage(message, type) {
        const normalized = this.normalize(message);

        // Step 1: Check for casual conversation first
        const conversation = this.detectConversation(message);
        if (conversation) {
            this.displayMessage(conversation.response, 'bot', true, type);
            
            // For greetings, also show suggestion chips
            if (conversation.type === 'greeting' || conversation.type === 'who_are_you') {
                const chips = this.followUps.greeting;
                if (chips && chips.length > 0) {
                    setTimeout(() => this.renderSuggestionChips(chips, type, true), 300);
                }
            }
            return;
        }

        // Step 2: Check contextual follow-up (yes/ok/sure after a previous response)
        const contextResponse = this.handleContextualFollowUp(normalized);
        if (contextResponse) {
            this.recordMemory(contextResponse.id);
            this.renderResponse(contextResponse, true, type);
            return;
        }

        // Step 3: Standard intent detection from knowledge base
        const intent = this.detectIntent(normalized);
        if (intent) {
            this.recordMemory(intent.id);
            this.renderResponse(intent, true, type);
        } else {
            this.renderSearchFallback(normalized, type);
        }
    }

    /* ── Normalise input ─────────────────────────────────────── */
    normalize(text) {
        return text
            .toLowerCase()
            // Hinglish / mixed-language common patterns → English equivalents
            .replace(/\bkya hai\b/g, 'what is')
            .replace(/\bkaise\b/g, 'how')
            .replace(/\bkahan\b/g, 'where')
            .replace(/\bkitna\b/g, 'how much')
            .replace(/\bpadhna\b|\bpadvna\b/g, 'study')
            .replace(/\bpadhai\b/g, 'education')
            .replace(/\bbatao\b|\bbataiye\b/g, 'tell me')
            .replace(/\bchahiye\b|\bchahie\b/g, 'need')
            .replace(/\bkaro\b|\bkarna\b/g, 'do')
            .replace(/\bhaan\b|\bha\b/g, 'yes')
            .replace(/\bnahi\b|\bnahin\b/g, 'no')
            .replace(/\btheek hai\b|\bthik hai\b/g, 'ok')
            .replace(/\baplly\b/g, 'apply')   // common typo
            .replace(/\bplacment\b/g, 'placement') // typo
            .replace(/\bfaculity\b/g, 'faculty')   // typo
            .replace(/[?!,।]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /* ── Weighted Intent Detection ───────────────────────────── */
    detectIntent(message) {
        if (!this.knowledgeBase?.intents) return null;

        const scores = this.knowledgeBase.intents.map(intent => ({
            intent,
            score: this.scoreIntent(intent, message)
        }));

        // Sort by score (descending)
        scores.sort((a, b) => b.score - a.score);

        // Only return if score > 0
        if (scores[0].score === 0) {
            return this.getIntentById('not_found') || null;
        }
        
        return scores[0].intent;
    }

    scoreIntent(intent, message) {
        try {
            let total = 0;
            if (!intent || typeof intent !== 'object') return 0;
            
            const keywords = Array.isArray(intent.keywords) ? intent.keywords : [];
            if (keywords.length === 0) return 0;

            for (const kw of keywords) {
                if (typeof kw !== 'string') continue;
                
                const k = kw.toLowerCase();
                const msgWords = message.split(/\s+/).filter(Boolean);
                const kwWords = k.split(/\s+/).filter(Boolean);

                if (!k || !message) continue;

                // Exact full match
                if (message === k) {
                    total += 100;
                    continue;
                }

                // Full keyword appears as substring
                if (message.includes(k)) {
                    total += 60 + (k.length * 2);
                    continue;
                }

                // All words in keyword appear in message
                if (kwWords.length > 0 && kwWords.every(w => message.includes(w))) {
                    total += 50;
                    continue;
                }

                // Individual keyword word matches
                for (const kwWord of kwWords) {
                    if (kwWord && msgWords.includes(kwWord)) {
                        total += 30;
                    }
                }

                // Partial match (80% of keyword)
                if (k.length >= 4) {
                    const partial = k.slice(0, Math.ceil(k.length * 0.8));
                    if (message.includes(partial)) {
                        total += 15;
                    }
                }
            }

            return Math.max(0, total);
        } catch (e) {
            console.warn('[KingstonAI] scoreIntent error:', e);
            return 0;
        }
    }

    /* ── Context memory ──────────────────────────────────────── */
    recordMemory(intentId) {
        this.intentMemory.push(intentId);
        if (this.intentMemory.length > this.MAX_MEMORY) this.intentMemory.shift();
    }

    handleContextualFollowUp(message) {
        const acks = ['yes', 'ok', 'okay', 'sure', 'go ahead', 'please', 'haan', 'theek hai', 'ha', 'tell me more'];
        if (!acks.includes(message)) return null;

        const last = this.intentMemory[this.intentMemory.length - 1];
        if (!last) return null;

        const followUp = {
            'admission': 'fees', 'fees': 'scholarship', 'placement': 'internship',
            'departments': 'cse', 'cse': 'placement', 'hostel': 'transport',
            'about': 'facilities'
        };
        const nextId = followUp[last];
        return nextId ? this.getIntentById(nextId) : null;
    }

    /* ── Search Fallback ─────────────────────────────────────── */
    renderSearchFallback(query, type) {
        // PART 7 — Probe RAG in parallel; if it returns a confident answer
        // we render it FIRST (grounded), then keep this curated fallback as
        // the "see also" section. If RAG is unavailable or unconfident,
        // behavior is unchanged (curated fallback only).
        const userQuery = (this._lastUserMessage || query || '').trim();
        const tryRAG = (userQuery.length >= 3 && this._ragReady) ? this._ragQuery(userQuery, 5) : Promise.resolve(null);

        tryRAG.then(ragResults => {
            const ragShown = ragResults && this._renderRAGAnswer(userQuery, ragResults, type);
            // If RAG produced a grounded answer, the curated fallback is
            // demoted to a small "related pages" footnote (quiet, no big copy).
            this._renderCuratedFallback(query, type, /* demoted = */ !!ragShown);
        }).catch(() => this._renderCuratedFallback(query, type, false));
    }

    _renderCuratedFallback(query, type, demoted) {
        const fallback = this.knowledgeBase?.fallback;
        const results = this.searchPages(query, 4);

        let html = '';
        if (!demoted) {
            const fallbackMessages = [
                "Hmm, I couldn't find an exact match — but here are some relevant pages:",
                "Good question! I'm still learning, but these pages might have what you need:",
                "Let me help you find the right information:",
                "I may not have a direct answer, but here's what might help:"
            ];
            const msg = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];
            html += `<p style="margin:0 0 10px 0;">${msg}</p>`;
        } else {
            html += `<p style="margin:14px 0 8px 0;font-size:0.85rem;color:#666;"><strong>Related pages</strong> you might also want to visit:</p>`;
        }

        if (results.length > 0) {
            html += `<div class="ai-result-cards">`;
            results.forEach(r => {
                const cat = r.category || 'General';
                html += `
                <a href="${r.url}" class="ai-result-card">
                    <div class="ai-result-card-inner">
                        <div class="ai-result-card-title">${r.title}</div>
                        <div class="ai-result-card-desc">${r.description}</div>
                    </div>
                    <div class="ai-result-card-cat">${cat}</div>
                </a>`;
            });
            html += `</div>`;
        }

        if (fallback?.suggestions && !demoted) {
            html += `<div class="ai-actions" style="margin-top:12px;">`;
            fallback.suggestions.forEach(sug => {
                html += `<button class="ai-btn outline" onclick="window.KingstonAI.setInput('${sug.query}'); window.KingstonAI.handleSendMessage('${type}');">${sug.text}</button>`;
            });
            html += `</div>`;
        }

        this.displayMessage(html, 'bot', true, type);
    }

    searchPages(query, limit = 4) {
        if (!this.searchIndex) return [];
        const q = query.toLowerCase();
        const words = q.split(/\s+/).filter(Boolean);

        const scored = this.searchIndex.map(entry => {
            let score = 0;
            const title = (entry.title || '').toLowerCase();
            const desc = (entry.description || '').toLowerCase();
            const kws = (entry.keywords || []).join(' ').toLowerCase();

            if (title.includes(q)) score += 60;
            if (kws.includes(q)) score += 40;
            if (desc.includes(q)) score += 20;
            words.forEach(w => {
                if (title.includes(w)) score += 10;
                if (kws.includes(w)) score += 7;
                if (desc.includes(w)) score += 3;
            });
            return { entry, score };
        }).filter(r => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(r => r.entry);

        return scored;
    }

    /* ── Render helpers ──────────────────────────────────────── */
    renderResponse(intent, animated, type = 'fullpage') {
        let html = `<strong>${intent.title}</strong>`;
        html += `<ul class="ai-points">`;
        (intent.content_points || []).forEach(point => {
            html += `<li>${point}</li>`;
        });
        html += `</ul>`;

        if (intent.actions?.length) {
            html += `<div class="ai-actions">`;
            intent.actions.forEach(action => {
                if (action.url) {
                    html += `<a href="${action.url}" class="ai-btn primary">${action.text}</a>`;
                } else if (action.query) {
                    html += `<button class="ai-btn secondary" onclick="window.KingstonAI.setInput('${action.query}'); window.KingstonAI.handleSendMessage('${type}');">${action.text}</button>`;
                }
            });
            html += `</div>`;
        }

        this.displayMessage(html, 'bot', animated, type);

        // Append smart follow-up suggestion chips after the bubble
        const chips = this.followUps[intent.id];
        if (chips && chips.length > 0) {
            this.renderSuggestionChips(chips, type, animated);
        }
    }

    getIntentById(id) {
        return this.knowledgeBase?.intents?.find(i => i.id === id) || null;
    }

    /* ── Follow-up suggestion chips ──────────────────────────── */
    renderSuggestionChips(chips, type, animated) {
        const containerId = type === 'fullpage' ? 'fullpage-messages' : 'ai-messages';
        const container = document.getElementById(containerId);
        if (!container) return;

        const row = document.createElement('div');
        row.className = `ai-suggestions-row${animated ? ' animate' : ''}`;

        chips.forEach(chip => {
            const btn = document.createElement('button');
            btn.className = 'ai-suggestion-chip';
            btn.textContent = chip.text;

            if (chip.url) {
                btn.addEventListener('click', () => { window.location.href = chip.url; });
            } else if (chip.q) {
                btn.addEventListener('click', () => {
                    // Remove this chip row once clicked for clean UX
                    row.remove();
                    this.setInput(chip.q);
                    this.handleSendMessage(type);
                });
            }
            row.appendChild(btn);
        });

        container.appendChild(row);
        this.scrollToLatest(container);

        // Save chips row html to localStorage too
        this.saveMessage(row.innerHTML, '__chips__', type);
    }

    /* ── Typing indicator ────────────────────────────────────── */
    showTypingIndicator(type) {
        const containerId = type === 'fullpage' ? 'fullpage-messages' : 'ai-messages';
        const container = document.getElementById(containerId);
        if (!container) return;

        const el = document.createElement('div');
        el.className = 'ai-message-group bot ai-typing-group';
        el.id = `typing-${type}`;
        el.innerHTML = `
            <div class="ai-bot-avatar"><i class="fa-solid fa-robot"></i></div>
            <div class="ai-message-bubble ai-typing-bubble">
                <span class="ai-typing-dot"></span>
                <span class="ai-typing-dot"></span>
                <span class="ai-typing-dot"></span>
            </div>`;
        container.appendChild(el);
        this.scrollToLatest(container);
    }

    hideTypingIndicator(type) {
        const el = document.getElementById(`typing-${type}`);
        if (el) el.remove();
    }

    /* ── Display message ─────────────────────────────────────── */
    displayMessage(content, sender, animated = true, type = 'fullpage', persist = true) {
        const containerId = type === 'fullpage' ? 'fullpage-messages' : 'ai-messages';
        const container = document.getElementById(containerId);
        if (!container) return;

        // Handle restored chip rows specially
        if (sender === '__chips__') {
            const row = document.createElement('div');
            row.className = 'ai-suggestions-row';
            row.innerHTML = content;
            // Re-attach click handlers on restored chips
            row.querySelectorAll('.ai-suggestion-chip').forEach(btn => {
                const text = btn.textContent;
                // Find matching chip query from followUps
                let foundQ = null;
                for (const chips of Object.values(this.followUps)) {
                    const match = chips.find(c => c.text === text);
                    if (match) { foundQ = match.q; break; }
                }
                if (foundQ) {
                    btn.addEventListener('click', () => {
                        row.remove();
                        this.setInput(foundQ);
                        this.handleSendMessage(type);
                    });
                }
            });
            container.appendChild(row);
            this.scrollToLatest(container);
            return;
        }

        const group = document.createElement('div');
        group.className = `ai-message-group ${sender}${animated ? ' animate' : ''}`;

        const bubble = document.createElement('div');
        bubble.className = 'ai-message-bubble';
        // SECURITY (XSS hardening): raw user input is echoed to the chat as
        // text — never as HTML — so a pasted payload like <img onerror=…>
        // cannot execute. Bot/assistant content goes through the existing
        // HTML pipeline with per-field _escapeHTML already applied upstream.
        if (sender === 'user') {
            bubble.textContent = String(content);
        } else {
            bubble.innerHTML = content;
        }

        if (sender === 'bot') {
            const avatar = document.createElement('div');
            avatar.className = 'ai-bot-avatar';
            avatar.innerHTML = '<i class="fa-solid fa-robot"></i>';
            group.appendChild(avatar);
        }

        group.appendChild(bubble);
        container.appendChild(group);
        this.scrollToLatest(container);

        if (persist) this.saveMessage(content, sender, type);
    }

    scrollToLatest(container) {
        if (!container) return;
        setTimeout(() => { container.scrollTop = container.scrollHeight; }, 60);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.KingstonAI = new AIAssistant();
});
