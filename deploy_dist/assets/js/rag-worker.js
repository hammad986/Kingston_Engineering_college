/**
 * rag-worker.js
 * ==============
 * Web Worker for semantic vector search.
 * Loads binary vector index and performs cosine similarity searches
 * with source priority weighting.
 *
 * Messages:
 *   { type: 'init', vectorsUrl: '/data/vectors.bin', chunksUrl: '/data/chunks.json' }
 *   { type: 'search', queryVector: number[], queryText: string, topK: number }
 *
 * Responses:
 *   { type: 'ready' }
 *   { type: 'progress', loaded: number, total: number }
 *   { type: 'error', message: string }
 *   { type: 'results', results: Array<{chunkIndex, score, weightedScore, finalScore, ...meta}> }
 *
 * Scoring: Phase 3B Hybrid Ranking
 *   Final Score = (Vector Similarity x Priority Multiplier)
 *               + Category Match Bonus (0.08)
 *               + Official Page Bonus (0.06)
 *               + Keyword Overlap Bonus (up to 0.04)
 *               + Specific Keyword Bonus (up to 0.12)
 */

let vectors = null;       // Float32Array of all vectors
let chunks = [];          // Metadata for each chunk
let count = 0;            // Number of vectors
let dim = 0;              // Vector dimension
let ready = false;

// Priority multipliers (must match Python definition)
const PRIORITY_MULT = {
    high: 1.20,
    medium: 1.00,
    low: 0.85,
};

self.onmessage = function (e) {
    const msg = e.data;

    switch (msg.type) {
        case 'init':
            initWorker(msg.vectorsUrl, msg.chunksUrl);
            break;
        case 'search':
            if (!ready) {
                self.postMessage({ type: 'error', message: 'Worker not ready yet' });
                return;
            }
            const results = hybridSearch(msg.queryVector, msg.queryText || '', msg.topK || 10);
            self.postMessage({ type: 'results', results });
            break;
        default:
            self.postMessage({ type: 'error', message: 'Unknown message type: ' + msg.type });
    }
};

/**
 * Initialize worker: load binary vectors and chunk metadata.
 */
async function initWorker(vectorsUrl, chunksUrl) {
    try {
        // --- Load binary vectors ---
        self.postMessage({ type: 'progress', loaded: 0, total: 2, message: 'Downloading vector index...' });

        const vecResponse = await fetch(vectorsUrl);
        if (!vecResponse.ok) {
            throw new Error('Failed to fetch vectors: ' + vecResponse.statusText);
        }
        const buffer = await vecResponse.arrayBuffer();

        // Parse header: first 8 bytes = count (uint32) + dimension (uint32)
        const headerView = new DataView(buffer, 0, 8);
        count = headerView.getUint32(0, true);   // little-endian
        dim = headerView.getUint32(4, true);

        if (count === 0 || dim === 0) {
            throw new Error('Invalid vector header: count=' + count + ', dim=' + dim);
        }

        // Create Float32Array view over the rest of the buffer
        vectors = new Float32Array(buffer, 8, count * dim);

        self.postMessage({ type: 'progress', loaded: 1, total: 2, message: 'Loading chunks metadata...' });

        // --- Load chunks metadata ---
        const chunkResponse = await fetch(chunksUrl);
        if (!chunkResponse.ok) {
            throw new Error('Failed to fetch chunks: ' + chunkResponse.statusText);
        }
        chunks = await chunkResponse.json();

        if (chunks.length !== count) {
            console.warn('[RAG Worker] Chunk count mismatch: vectors=' + count + ', chunks=' + chunks.length);
        }

        ready = true;
        self.postMessage({ type: 'ready', count, dim, chunksCount: chunks.length });
        self.postMessage({ type: 'progress', loaded: 2, total: 2, message: 'Ready' });

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
    }
}

// ── Query Category Classifier ──────────────────────────────────────────
const QUERY_CLASSIFIER = {
    'contact': ['email', 'phone', 'contact', 'call', 'address', 'reach', 'postal', 'office hours', 'location map', 'telephone', 'mobile'],
    'fees': ['fee', 'fees', 'tuition', 'payment', 'installment', 'cost', 'total cost', 'application fee', 'fee structure', 'fee waiver'],
    'library': ['library', 'book', 'journal', 'digital resource', 'online journal', 'library timing', 'library hour'],
    'transport': ['bus', 'transport', 'route', 'shuttle', 'bus route', 'city transport', 'college transport'],
    'admission': ['admission', 'admit', 'eligibility', 'apply', 'entrance exam', 'tnea', 'counselling', 'cutoff', 'management quota', 'nri'],
    'hostel': ['hostel', 'accommodation', 'mess', 'boys hostel', 'girls hostel', 'day scholar', 'room capacity'],
    'placement': ['placement', 'recruit', 'company', 'package', 'job', 'campus', 'internship', 'training cell'],
    'scholarship': ['scholarship', 'financial aid', 'fee waiver', 'sc/st', 'merit', 'tuition fee waiver'],
    'sports': ['sport', 'playground', 'gym', 'gymnasium', 'indoor', 'outdoor', 'competition', 'team'],
    'naac': ['naac', 'accreditation', 'nba', 'grade', 'score', 'quality initiative'],
    'department': ['department', 'cse', 'ece', 'mech', 'mechanical', 'it', 'aids', 'csbs', 'mba', 'arch', 'architecture', 'faculty', 'professor'],
    'facility': ['facility', 'infrastructure', 'canteen', 'auditorium', 'medical', 'wifi', 'lab', 'welfare measure'],
    'policy': ['policy', 'anti-ragging', 'grievance', 'complaint', 'equal opportunity', 'posh'],
    'about': ['established', 'founded', 'year', 'vision', 'mission', 'principal', 'co-educational', 'affiliated', 'ranking'],
};

// Bonus values (must match Python test suite)
const CATEGORY_MATCH_BONUS = 0.08;
const OFFICIAL_PAGE_BONUS = 0.06;
const KEYWORD_OVERLAP_MAX = 0.04;
const SPECIFIC_KW_BONUS = 0.02;
const SPECIFIC_MAX = 0.12;

function classifyQuery(queryText) {
    var q = queryText.toLowerCase();
    var scores = {};
    for (var cat in QUERY_CLASSIFIER) {
        if (!QUERY_CLASSIFIER.hasOwnProperty(cat)) continue;
        var keywords = QUERY_CLASSIFIER[cat];
        var score = 0;
        for (var k = 0; k < keywords.length; k++) {
            if (q.indexOf(keywords[k]) !== -1) {
                score++;
            }
        }
        if (score > 0) {
            scores[cat] = score;
        }
    }
    // Sort categories by score descending, return top 3
    var sorted = Object.keys(scores).sort(function (a, b) { return scores[b] - scores[a]; });
    return sorted.slice(0, 3);
}

function hasEmail(text) {
    return /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text);
}

function hasPhone(text) {
    return /\+?\d[\d\s\-().]{7,}\d/.test(text);
}

// ── Expanded Stop Words for Key Term Extraction ────────────────────
// Includes common business words that appear in many chunks and are not
// discriminative for specific content detection.
var STOP_WORDS = new Set([
    'what', 'how', 'why', 'when', 'where', 'who', 'which', 'the', 'a', 'an',
    'is', 'are', 'was', 'were', 'do', 'does', 'did', 'can', 'could', 'will',
    'would', 'should', 'may', 'might', 'has', 'have', 'had', 'been', 'being',
    'get', 'got', 'tell', 'show', 'list', 'name', 'please', 'about', 'me',
    'i', 'you', 'we', 'they', 'he', 'she', 'it', 'of', 'for', 'in', 'on',
    'at', 'to', 'from', 'by', 'with', 'without', 'and', 'or', 'not', 'no',
    'but', 'if', 'so', 'than', 'that', 'this', 'these', 'those', 'there',
    'all', 'any', 'each', 'every', 'some', 'more', 'most', 'many', 'much',
    'very', 'just', 'also', 'too', 'only', 'now', 'then', 'here', 'there',
    'does', 'going', 'want', 'need', 'like', 'know', 'see', 'use', 'used',
    'using', 'make', 'made', 'take', 'taken', 'give', 'given', 'college',
    'available', 'provide', 'need',
    // High-frequency business words that appear in many chunks
    'bank', 'campus', 'student', 'facility', 'facilities', 'service',
    'services', 'information', 'school', 'center', 'centre', 'building',
    'office', 'room', 'area', 'system', 'number', 'address', 'email',
    'phone', 'website', 'page', 'link', 'detail', 'type', 'form', 'date',
    'time', 'year', 'department', 'faculty', 'staff', 'member', 'group',
    'team', 'work', 'support', 'development', 'management', 'financial',
    'academic', 'technical', 'general', 'program', 'programs', 'course',
    'courses', 'training', 'learning', 'education', 'result', 'results',
    'report', 'reports', 'document', 'documents', 'data', 'status',
    'online', 'digital', 'national', 'international', 'global', 'local',
    'public', 'private', 'social', 'cultural', 'various', 'including',
    'related', 'based', 'required', 'special', 'specific', 'process',
    'system', 'policy', 'policies', 'activity', 'activities'
]);

/**
 * Phase 4.5 — Answer Availability Check (v2)
 * =============================================
 * Two-phase verification:
 *
 * Phase 1 — Multi-word phrase match:
 *   Extract 2+ word phrases from query (e.g., "bus route", "bank branch").
 *   If any phrase appears verbatim in any top chunk → content is available.
 *
 * Phase 2 — Discriminative term coverage + raw similarity:
 *   For each top chunk, check if discriminative (non-common) query terms
 *   appear in the text. Require BOTH:
 *   - At least 40% term coverage
 *   - Raw similarity >= 0.25
 *   OR
 *   - At least 25% term coverage
 *   - Raw similarity >= 0.45
 *   - HTML source
 *
 * This prevents false positives where common words ("bank", "campus")
 * inflate the coverage score for irrelevant chunks.
 */

var AVAILABILITY_THRESHOLD = 0.50;
var RAW_SIM_MINIMUM = 0.25;

function extractKeyTerms(queryText) {
    var lower = queryText.toLowerCase();
    lower = lower.replace(/[^\w\s]/g, ' ');
    var words = lower.split(/\s+/).filter(function (w) {
        return w.length > 2 && !STOP_WORDS.has(w);
    });
    return words;
}

function extractPhrases(queryText) {
    var lower = queryText.toLowerCase();
    lower = lower.replace(/[^\w\s]/g, ' ');
    var words = lower.split(/\s+/).filter(function (w) { return w.length > 0; });
    var phrases = [];
    for (var i = 0; i < words.length - 1; i++) {
        // Both words must be > 2 chars AND neither can be a stop word
        if (words[i].length > 2 && words[i + 1].length > 2
            && !STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
            phrases.push(words[i] + ' ' + words[i + 1]);
        }
    }
    return phrases;
}

/**
 * Proximity-based coverage scoring.
 * Terms appearing close together in the text is a much stronger signal
 * of topical relevance than simple term presence.
 */
function proximityScore(terms, text, maxGap) {
    maxGap = maxGap || 200;
    var positions = [];
    for (var t = 0; t < terms.length; t++) {
        var term = terms[t];
        var idx = text.indexOf(term);
        if (idx === -1) {
            // Try stemmed version
            var stem = stemWord(term);
            if (stem !== term) idx = text.indexOf(stem);
        }
        if (idx !== -1) {
            positions.push(idx);
        }
    }

    if (positions.length === 0) return 0.0;

    var coverage = positions.length / terms.length;

    if (positions.length <= 1) {
        return coverage * 0.5;  // Single term: penalize
    }

    // Proximity: how close are the terms?
    var minPos = Math.min.apply(null, positions);
    var maxPos = Math.max.apply(null, positions);
    var span = maxPos - minPos;
    var proximity = Math.max(0.0, 1.0 - (span / maxGap));

    return coverage * 0.6 + proximity * 0.4;
}

function stemWord(word) {
    var result = word;
    if (result.length > 4 && result.indexOf('es') === result.length - 2) result = result.slice(0, -2);
    else if (result.length > 4 && result.indexOf('ed') === result.length - 2) result = result.slice(0, -2);
    else if (result.length > 5 && result.indexOf('ing') === result.length - 3) result = result.slice(0, -3);
    else if (result.length > 3 && result.charAt(result.length - 1) === 's' && result.charAt(result.length - 2) !== 's') result = result.slice(0, -1);
    return result;
}

function checkAnswerAvailability(queryText, topResults) {
    var terms = extractKeyTerms(queryText);
    var phrases = extractPhrases(queryText);

    if (terms.length === 0) {
        return { available: true, bestScore: 1.0, terms: [], phrases: phrases };
    }

    for (var r = 0; r < topResults.length; r++) {
        var result = topResults[r];
        var text = (result.text || '') + ' ' + (result.title || '');
        text = text.toLowerCase();

        // Phase 1: Multi-word phrase match (immediate pass)
        var phraseMatch = false;
        for (var p = 0; p < phrases.length; p++) {
            if (text.indexOf(phrases[p]) !== -1) {
                phraseMatch = true;
                break;
            }
        }
        if (phraseMatch) {
            return { available: true, bestScore: 1.0, terms: terms, phrases: phrases, reason: 'phrase_match' };
        }

        // Phase 2: Proximity and similarity
        var proxScore = proximityScore(terms, text);
        var rawSim = result.score || 0;
        var isHtml = (result.sourceType === 'html');

        // Decision tree:
        // 1. High similarity → strongly confident
        if (rawSim >= 0.55) {
            return { available: true, bestScore: rawSim, terms: terms, reason: 'high_sim' };
        }

        // 2. HTML + moderate sim + decent proximity → likely available
        if (rawSim >= 0.45 && proxScore >= 0.40 && isHtml) {
            return { available: true, bestScore: rawSim + proxScore, terms: terms, reason: 'html_sim_prox' };
        }

        // 3. Strong proximity + moderate sim → content likely present
        if (rawSim >= 0.40 && proxScore >= 0.70) {
            return { available: true, bestScore: rawSim + proxScore, terms: terms, reason: 'strong_prox' };
        }

        // 4. HTML + decent sim + decent proximity → fallback check
        if (rawSim >= 0.35 && proxScore >= 0.50 && isHtml) {
            return { available: true, bestScore: rawSim + proxScore, terms: terms, reason: 'html_fallback' };
        }
    }

    return { available: false, bestScore: 0.0, terms: terms, reason: 'no_match' };
}

/**
 * Phase 3B/4.5 Hybrid Search + Answer Availability
 * ===================================================
 * Hybrid ranking with post-hoc content verification.
 */
function hybridSearch(queryVector, queryText, topK) {
    if (!vectors || !chunks.length) {
        return [];
    }

    if (queryVector.length !== dim) {
        self.postMessage({ type: 'error', message: 'Query vector dimension mismatch' });
        return [];
    }

    // Classify the query once
    var queryCats = classifyQuery(queryText);
    var queryLower = queryText.toLowerCase();
    var queryWords = queryLower.split(/\s+/).filter(function (w) { return w.length > 2; });
    var isContactQuery = queryCats.indexOf('contact') !== -1;

    var query = new Float32Array(queryVector);
    var totalVectors = count;
    var scored = [];

    for (var i = 0; i < totalVectors; i++) {
        var offset = i * dim;
        var dot = 0;
        var normA = 0;
        var normB = 0;

        for (var j = 0; j < dim; j++) {
            var aVal = vectors[offset + j];
            var bVal = query[j];
            dot += aVal * bVal;
            normA += aVal * aVal;
            normB += bVal * bVal;
        }

        var norm = Math.sqrt(normA) * Math.sqrt(normB);
        var sim = norm === 0 ? 0 : dot / norm;

        if (sim < 0.05) continue;

        var chunk = chunks[i] || {};
        var priority = chunk.priority || 'medium';
        var multiplier = PRIORITY_MULT[priority] || 1.0;

        // 1. Base: Vector Similarity x Priority Multiplier
        var baseScore = sim * multiplier;

        // 2. Category Match Bonus: +0.08 if chunk category matches query category
        var chunkCat = chunk.category || 'general';
        var catBonus = queryCats.indexOf(chunkCat) !== -1 ? CATEGORY_MATCH_BONUS : 0;

        // 3. Official Page Bonus: +0.06 for HTML pages
        var sourceType = chunk.source_type || '';
        var officialBonus = sourceType === 'html' ? OFFICIAL_PAGE_BONUS : 0;

        // 4. Keyword Overlap Bonus: up to 0.04 for query words in title
        var titleLower = (chunk.title || '').toLowerCase();
        var overlap = 0;
        for (var w = 0; w < queryWords.length; w++) {
            if (titleLower.indexOf(queryWords[w]) !== -1) {
                overlap++;
            }
        }
        var keywordBonus = Math.min(KEYWORD_OVERLAP_MAX, overlap * 0.01);

        // 5. Category-Specific Keyword Bonus
        var specificBonus = 0;
        for (var c = 0; c < queryCats.length; c++) {
            var catKey = queryCats[c];
            var patterns = QUERY_CLASSIFIER[catKey] || [];
            for (var p = 0; p < patterns.length; p++) {
                if (titleLower.indexOf(patterns[p]) !== -1) {
                    specificBonus += SPECIFIC_KW_BONUS;
                    break;
                }
            }
        }

        // 6. Contact-specific: email/phone in text
        if (isContactQuery) {
            var chunkText = chunk.text || '';
            if (hasEmail(chunkText)) specificBonus += 0.04;
            if (hasPhone(chunkText)) specificBonus += 0.03;
        }

        specificBonus = Math.min(SPECIFIC_MAX, specificBonus);

        var finalScore = baseScore + catBonus + officialBonus + keywordBonus + specificBonus;

        scored.push({
            chunkIndex: i,
            score: sim,
            weightedScore: baseScore,
            finalScore: finalScore,
            priority: priority,
            category: chunkCat,
            source: chunk.source || '',
            sourceType: sourceType,
            title: chunk.title || '',
            fallbackUrl: chunk.fallback_url || 'index.html',
            multiplier: multiplier,
            text: chunk.text || '',
        });
    }

    // Sort by final score descending
    scored.sort(function (a, b) { return b.finalScore - a.finalScore; });

    var topKResults = scored.slice(0, topK);

    // Phase 4.5: Run Answer Availability Check on top results
    var availability = checkAnswerAvailability(queryText, topKResults);

    // Attach availability info to results
    for (var ri = 0; ri < topKResults.length; ri++) {
        topKResults[ri].availabilityScore = availability.bestScore;
        topKResults[ri].availabilityPass = availability.available;
    }

    return topKResults;
}
