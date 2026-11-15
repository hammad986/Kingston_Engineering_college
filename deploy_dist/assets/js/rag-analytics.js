/**
 * rag-analytics.js
 * =================
 * Kingston Engineering College — RAG Chatbot Analytics & Monitoring
 *
 * Non-intrusive usage tracking for the 30-day post-deployment monitoring period.
 * Does NOT modify chatbot behavior — only observes and records.
 *
 * Metrics Tracked (10):
 *   1. Total Queries
 *   2. Top Asked Questions
 *   3. Failed Queries
 *   4. Fallback Trigger Count
 *   5. Most Requested Missing Information
 *   6. Department-wise Query Distribution
 *   7. Admission-related Query Volume
 *   8. Placement-related Query Volume
 *   9. Average Response Time
 *   10. Client-side Errors
 *
 * Privacy:
 *   - No personally identifiable information (PII) collected
 *   - No IP addresses, no cookies, no user IDs
 *   - All data stored locally in browser localStorage
 *   - No data sent to external servers
 *   - Queries are stored as-is (users may type PII — admin should review and redact)
 *
 * Storage:
 *   - localStorage with daily rollup aggregation
 *   - ~10-50 KB per month of typical usage
 *   - Auto-purging of entries > 60 days old
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'kec_rag_analytics_v1';
    const MAX_TOP_QUERIES = 100;
    const MAX_FAILED_QUERIES = 50;
    const MAX_MISSING_INFO = 50;
    const MAX_RESPONSE_TIME_SAMPLES = 1000;
    const MAX_CLIENT_ERRORS = 50;
    const RETENTION_DAYS = 60;

    class RAGAnalytics {
        constructor() {
            this._data = null;
            this._load();
            this._startTime = Date.now();

            // Auto-capture uncaught errors (client-side errors)
            this._captureErrors();
        }

        // ── Internal Storage ──────────────────────────────────────

        _load() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    this._data = JSON.parse(raw);
                    // Validate structure
                    if (!this._data || typeof this._data !== 'object') {
                        throw new Error('Invalid data');
                    }
                    if (!this._data.version) this._data.version = 1;
                    if (!this._data.daily) this._data.daily = {};
                    if (!this._data.topQueries) this._data.topQueries = {};
                    if (!this._data.failedQueries) this._data.failedQueries = [];
                    if (!this._data.missingInfo) this._data.missingInfo = [];
                    if (!this._data.departments) this._data.departments = {};
                    if (!this._data.responseTimes) this._data.responseTimes = [];
                    if (!this._data.clientErrors) this._data.clientErrors = {};
                    if (!this._data.totalQueries === undefined) this._data.totalQueries = 0;
                    if (!this._data.totalFallbacks === undefined) this._data.totalFallbacks = 0;
                    if (!this._data.totalErrors === undefined) this._data.totalErrors = 0;
                    if (!this._data.admissionQueries === undefined) this._data.admissionQueries = 0;
                    if (!this._data.placementQueries === undefined) this._data.placementQueries = 0;
                    if (!this._data.lastResetDate === undefined) this._data.lastResetDate = new Date().toISOString().split('T')[0];
                } else {
                    this._initFresh();
                }
            } catch (e) {
                console.warn('[RAG Analytics] Corrupted data, reinitializing:', e);
                this._initFresh();
            }
        }

        _initFresh() {
            this._data = {
                version: 1,
                created: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                lastResetDate: new Date().toISOString().split('T')[0],
                totalQueries: 0,
                totalFallbacks: 0,
                totalErrors: 0,
                admissionQueries: 0,
                placementQueries: 0,
                daily: {},
                topQueries: {},
                failedQueries: [],
                missingInfo: [],
                departments: {},
                responseTimes: [],
                clientErrors: {},
            };
            this._save();
        }

        _save() {
            try {
                this._data.lastUpdated = new Date().toISOString();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
            } catch (e) {
                // localStorage full — prune response times to free space
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    this._pruneStorage();
                }
            }
        }

        _pruneStorage() {
            // Prune oldest entries
            if (this._data.responseTimes.length > 100) {
                this._data.responseTimes = this._data.responseTimes.slice(-100);
            }
            if (this._data.failedQueries.length > 10) {
                this._data.failedQueries = this._data.failedQueries.slice(-10);
            }
            if (this._data.missingInfo.length > 10) {
                this._data.missingInfo = this._data.missingInfo.slice(-10);
            }
            // Prune old daily entries
            const dates = Object.keys(this._data.daily).sort();
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
            for (const d of dates) {
                if (new Date(d) < cutoff) {
                    delete this._data.daily[d];
                }
            }
            this._save();
        }

        _getTodayKey() {
            return new Date().toISOString().split('T')[0];
        }

        _getOrCreateDaily(dateKey) {
            if (!this._data.daily[dateKey]) {
                this._data.daily[dateKey] = {
                    queries: 0,
                    fallbacks: 0,
                    errors: 0,
                    admission: 0,
                    placement: 0,
                    departments: {},
                    avgResponseTime: 0,
                    responseTimeSamples: 0,
                };
            }
            return this._data.daily[dateKey];
        }

        // ── Auto-capture Client Errors ───────────────────────────

        _captureErrors() {
            // Capture unhandled errors
            window.addEventListener('error', (e) => {
                this.trackClientError(e.message || 'Unknown error');
            });

            // Capture unhandled promise rejections
            window.addEventListener('unhandledrejection', (e) => {
                const msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled Promise rejection';
                this.trackClientError(msg);
            });
        }

        // ── Core Tracking Methods ─────────────────────────────────

        /**
         * Track a user query.
         * @param {string} query - The user's query text
         * @param {string} category - The detected category (admission, placement, etc.)
         * @param {string} confidence - The confidence level (HIGH, MEDIUM, LOW, VERY LOW, MISSING, NONE)
         * @param {number} responseTime - Time in ms to generate response
         * @param {boolean} isFallback - Whether the response was a fallback
         * @param {boolean} isError - Whether the query resulted in an error
         */
        trackQuery(query, category, confidence, responseTime, isFallback, isError) {
            const today = this._getTodayKey();
            const daily = this._getOrCreateDaily(today);

            // Global counts
            this._data.totalQueries++;
            daily.queries++;

            // Track fallback triggers
            if (isFallback) {
                this._data.totalFallbacks++;
                daily.fallbacks++;
            }

            // Track errors
            if (isError) {
                this._data.totalErrors++;
                daily.errors++;
            }

            // Track response time
            if (typeof responseTime === 'number' && responseTime > 0) {
                this._data.responseTimes.push(responseTime);
                if (this._data.responseTimes.length > MAX_RESPONSE_TIME_SAMPLES) {
                    this._data.responseTimes = this._data.responseTimes.slice(-MAX_RESPONSE_TIME_SAMPLES);
                }
                // Daily average
                const prevTotal = daily.avgResponseTime * daily.responseTimeSamples;
                daily.responseTimeSamples++;
                daily.avgResponseTime = (prevTotal + responseTime) / daily.responseTimeSamples;
            }

            // Track top queries (case-insensitive, trimmed)
            const normalizedQuery = query.trim().substring(0, 200);
            if (normalizedQuery) {
                this._data.topQueries[normalizedQuery] = (this._data.topQueries[normalizedQuery] || 0) + 1;
            }

            // Prune top queries if too many
            const topKeys = Object.keys(this._data.topQueries);
            if (topKeys.length > MAX_TOP_QUERIES) {
                // Keep only the most frequent
                const sorted = topKeys.sort((a, b) => this._data.topQueries[b] - this._data.topQueries[a]);
                const newTop = {};
                for (let i = 0; i < MAX_TOP_QUERIES; i++) {
                    if (sorted[i]) newTop[sorted[i]] = this._data.topQueries[sorted[i]];
                }
                this._data.topQueries = newTop;
            }

            // Track category-specific volumes
            const cat = (category || 'general').toLowerCase();
            this._data.departments[cat] = (this._data.departments[cat] || 0) + 1;
            daily.departments[cat] = (daily.departments[cat] || 0) + 1;

            if (cat === 'admission') {
                this._data.admissionQueries++;
                daily.admission++;
            }
            if (cat === 'placement') {
                this._data.placementQueries++;
                daily.placement++;
            }

            // Track missing info requests (when confidence is MISSING or query triggered fallback)
            if (isFallback && confidence === 'MISSING') {
                this._data.missingInfo.push({
                    query: normalizedQuery,
                    timestamp: Date.now(),
                    confidence: confidence,
                });
                if (this._data.missingInfo.length > MAX_MISSING_INFO) {
                    this._data.missingInfo = this._data.missingInfo.slice(-MAX_MISSING_INFO);
                }
            }

            // Track failed queries
            if (isError) {
                this._data.failedQueries.push({
                    query: normalizedQuery,
                    timestamp: Date.now(),
                    error: isError === true ? 'Unknown error' : String(isError),
                });
                if (this._data.failedQueries.length > MAX_FAILED_QUERIES) {
                    this._data.failedQueries = this._data.failedQueries.slice(-MAX_FAILED_QUERIES);
                }
            }

            this._save();
        }

        /**
         * Track a client-side error (uncaught exceptions, network failures).
         * @param {string} message - Error message
         */
        trackClientError(message) {
            if (!message) return;
            const key = message.substring(0, 500);
            if (!this._data.clientErrors[key]) {
                this._data.clientErrors[key] = {
                    count: 0,
                    firstSeen: Date.now(),
                    lastSeen: Date.now(),
                };
            }
            this._data.clientErrors[key].count++;
            this._data.clientErrors[key].lastSeen = Date.now();

            // Prune if too many unique errors
            const errorKeys = Object.keys(this._data.clientErrors);
            if (errorKeys.length > MAX_CLIENT_ERRORS) {
                const sorted = errorKeys.sort((a, b) => this._data.clientErrors[b].count - this._data.clientErrors[a].count);
                const newErrors = {};
                for (let i = 0; i < MAX_CLIENT_ERRORS; i++) {
                    if (sorted[i]) newErrors[sorted[i]] = this._data.clientErrors[sorted[i]];
                }
                this._data.clientErrors = newErrors;
            }

            this._save();
        }

        // ── Query Methods ─────────────────────────────────────────

        /** Get total queries across all time */
        getTotalQueries() {
            return this._data.totalQueries || 0;
        }

        /** Get top N most asked questions */
        getTopQueries(n) {
            n = n || 20;
            const sorted = Object.entries(this._data.topQueries)
                .sort((a, b) => b[1] - a[1])
                .slice(0, n)
                .map(([query, count]) => ({ query, count }));
            return sorted;
        }

        /** Get failed queries */
        getFailedQueries() {
            return this._data.failedQueries || [];
        }

        /** Get total fallback triggers */
        getFallbackCount() {
            return this._data.totalFallbacks || 0;
        }

        /** Get most requested missing information */
        getMissingInfoRequests() {
            // Aggregate by query
            const agg = {};
            for (const entry of (this._data.missingInfo || [])) {
                const q = entry.query;
                if (!agg[q]) {
                    agg[q] = { query: q, count: 0, lastTimestamp: 0 };
                }
                agg[q].count++;
                agg[q].lastTimestamp = Math.max(agg[q].lastTimestamp, entry.timestamp);
            }
            return Object.values(agg).sort((a, b) => b.count - a.count);
        }

        /** Get department-wise query distribution */
        getDepartmentDistribution() {
            return { ...(this._data.departments || {}) };
        }

        /** Get admission-related query volume */
        getAdmissionVolume() {
            return this._data.admissionQueries || 0;
        }

        /** Get placement-related query volume */
        getPlacementVolume() {
            return this._data.placementQueries || 0;
        }

        /** Get average response time in ms */
        getAverageResponseTime() {
            const times = this._data.responseTimes;
            if (!times.length) return 0;
            return times.reduce((a, b) => a + b, 0) / times.length;
        }

        /** Get response time percentile */
        getResponseTimePercentile(pct) {
            const times = this._data.responseTimes;
            if (!times.length) return 0;
            const sorted = [...times].sort((a, b) => a - b);
            const idx = Math.ceil((pct / 100) * sorted.length) - 1;
            return sorted[Math.max(0, idx)];
        }

        /** Get client errors */
        getClientErrors() {
            return { ...(this._data.clientErrors || {}) };
        }

        /** Get daily stats for the last N days */
        getDailyStats(days) {
            days = days || 30;
            const today = new Date();
            const result = [];
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const key = d.toISOString().split('T')[0];
                const dayData = this._data.daily[key];
                result.push({
                    date: key,
                    queries: dayData ? dayData.queries : 0,
                    fallbacks: dayData ? dayData.fallbacks : 0,
                    errors: dayData ? dayData.errors : 0,
                    admission: dayData ? dayData.admission : 0,
                    placement: dayData ? dayData.placement : 0,
                    avgResponseTime: dayData ? dayData.avgResponseTime : 0,
                });
            }
            return result;
        }

        /** Get all raw data for export */
        getExportData() {
            return {
                exportedAt: new Date().toISOString(),
                retentionDays: RETENTION_DAYS,
                summary: {
                    totalQueries: this.getTotalQueries(),
                    totalFallbacks: this.getFallbackCount(),
                    totalErrors: this._data.totalErrors || 0,
                    admissionVolume: this.getAdmissionVolume(),
                    placementVolume: this.getPlacementVolume(),
                    avgResponseTime: Math.round(this.getAverageResponseTime()),
                    p95ResponseTime: Math.round(this.getResponseTimePercentile(95)),
                    uniqueQueries: Object.keys(this._data.topQueries).length,
                    uniqueErrors: Object.keys(this._data.clientErrors).length,
                },
                topQueries: this.getTopQueries(20),
                failedQueries: this.getFailedQueries().slice(-20),
                missingInfo: this.getMissingInfoRequests(),
                departmentDistribution: this.getDepartmentDistribution(),
                clientErrors: this.getClientErrors(),
                dailyStats: this.getDailyStats(30),
            };
        }

        /** Reset all analytics data */
        reset() {
            const created = this._data.created;
            this._initFresh();
            this._data.created = created;
            this._save();
        }

        /** Get a summary string for display */
        getSummary() {
            const total = this.getTotalQueries();
            return {
                totalQueries: total,
                topQueries: this.getTopQueries(5),
                fallbackRate: total > 0 ? ((this.getFallbackCount() / total) * 100).toFixed(1) + '%' : '0%',
                errorRate: total > 0 ? (((this._data.totalErrors || 0) / total) * 100).toFixed(1) + '%' : '0%',
                avgResponseTime: Math.round(this.getAverageResponseTime()) + 'ms',
                p95ResponseTime: Math.round(this.getResponseTimePercentile(95)) + 'ms',
                topDepartment: Object.entries(this.getDepartmentDistribution())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([dept, count]) => dept + ': ' + count),
                admissionVolume: this.getAdmissionVolume(),
                placementVolume: this.getPlacementVolume(),
                missingInfoCount: this.getMissingInfoRequests().length,
            };
        }
    }

    // Export globally
    window.RAGAnalytics = RAGAnalytics;

    // Always initialize — lightweight class, no DOM dependency in constructor
    window.ragAnalytics = new RAGAnalytics();
})();
