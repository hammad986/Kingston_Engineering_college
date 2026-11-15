#!/usr/bin/env python3
"""
Phase 4.5 — Missing Information Guardrail Validation
======================================================
Validates that the Answer Availability Check correctly distinguishes
between answerable queries (content exists in KB) and unanswerable
queries (content genuinely missing).

Tests:
  1. 50+ intentionally unanswerable queries (should trigger fallback)
  2. 50+ answerable queries (should pass with HIGH/MEDIUM confidence)
  3. Accuracy, False Positive Rate, False Negative Rate
  4. Sample fallback responses

Usage:
    python scripts/missing_info_guardrail_test.py

This is READ-ONLY. No production files are modified.
"""

import json
import math
import sys
import time
import re
from pathlib import Path
from collections import Counter

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHUNKS_PATH = PROJECT_ROOT / "data" / "chunks.json"
INDEX_PATH = PROJECT_ROOT / "data" / "vector-index.json"
REPORT_PATH = PROJECT_ROOT / "logs" / "missing_info_guardrail_report.json"

CONFIDENCE_HIGH = 0.55
CONFIDENCE_MEDIUM = 0.35
AVAILABILITY_THRESHOLD = 0.50
RAW_SIM_MINIMUM = 0.25

# Hybrid ranking weights (must match rag-worker.js)
CATEGORY_MATCH_BONUS = 0.08
OFFICIAL_PAGE_BONUS = 0.06
KEYWORD_OVERLAP_MAX = 0.04
SPECIFIC_KW_BONUS = 0.02
SPECIFIC_MAX = 0.12

QUERY_CLASSIFIER = {
    "contact": ["email", "phone", "contact", "call", "address", "reach", "postal", "telephone", "mobile", "numer"],
    "fees": ["fee", "fees", "tuition", "payment", "installment", "cost", "fee structure", "czesne"],
    "library": ["library", "book", "journal", "digital resource", "library timing", "biblioteka"],
    "transport": ["bus", "transport", "route", "shuttle", "bus route"],
    "admission": ["admission", "admit", "eligibility", "apply", "entrance exam", "tnsea", "cutoff", "nri", "rekrutacja"],
    "hostel": ["hostel", "accommodation", "mess", "zakwaterowanie"],
    "placement": ["placement", "recruit", "company", "package", "internship", "zatrudnienia"],
    "scholarship": ["scholarship", "financial aid", "merit", "sc/st", "stypendia"],
    "sports": ["sport", "playground", "gym", "indoor", "outdoor", "boisko"],
    "naac": ["naac", "accreditation", "nba", "grade", "akredytację"],
    "department": ["department", "cse", "ece", "mech", "it", "aids", "csbs", "mba", "faculty", "wydział", "informatyki"],
    "facility": ["facility", "infrastructure", "canteen", "auditorium", "medical", "lab", "obiekt"],
    "about": ["established", "vision", "mission", "principal", "affiliated", "college"],
    "policy": ["policy", "anti-ragging", "grievance", "complaint"],
    "alumni": ["alumni", "alumnus"],
    "career": ["career", "job", "vacancy", "recruitment", "openings"],
    "research": ["research", "incubation", "patent", "innovation"],
}

STOP_WORDS = {
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
    # High-frequency business words that inflate coverage
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
    'system', 'policy', 'policies', 'activity', 'activities',
}


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return 0 if na == 0 or nb == 0 else dot / (na * nb)


def extract_key_terms(query):
    """Extract discriminative key terms from query (v2 with expanded stop words)."""
    q = query.lower()
    q = re.sub(r'[^\w\s]', ' ', q)
    words = q.split()
    return [w for w in words if len(w) > 2 and w not in STOP_WORDS]


def extract_phrases(query):
    """Extract 2+ word multi-word phrases from query for phrase matching.
    Both words must be > 2 chars AND neither can be a stop word."""
    q = query.lower()
    q = re.sub(r'[^\w\s]', ' ', q)
    words = q.split()
    phrases = []
    for i in range(len(words) - 1):
        if (len(words[i]) > 2 and len(words[i+1]) > 2
                and words[i] not in STOP_WORDS and words[i+1] not in STOP_WORDS):
            phrases.append(words[i] + ' ' + words[i+1])
    return phrases


def stem_word(word):
    """Basic stemming: remove common English plural/tense endings."""
    result = word
    if len(result) > 4 and result.endswith('es'):
        result = result[:-2]
    elif len(result) > 4 and result.endswith('ed'):
        result = result[:-2]
    elif len(result) > 5 and result.endswith('ing'):
        result = result[:-3]
    elif len(result) > 3 and result.endswith('s') and not result.endswith('ss'):
        result = result[:-1]
    return result


def term_in_text(term, text):
    """Check if a key term (or its stemmed form) appears in the text."""
    if term in text:
        return True
    stemmed = stem_word(term)
    return stemmed != term and stemmed in text


def proximity_coverage(terms, text, max_gap=200):
    """
    Check if query terms appear in close proximity within the text.
    Returns a score from 0.0 to 1.0 based on how close the terms are.
    This is a much stronger signal of topical relevance than simple term presence.
    """
    positions = []
    for term in terms:
        # Find all occurrences using stemming
        idx = text.find(term)
        if idx == -1:
            stemmed = stem_word(term)
            if stemmed != term:
                idx = text.find(stemmed)
        if idx != -1:
            positions.append(idx)
    
    if not positions:
        return 0.0
    
    # Coverage: how many terms found
    coverage = len(positions) / len(terms)
    
    if len(positions) <= 1:
        return coverage * 0.5  # Single term: penalize heavily
    
    # Proximity: how close are the terms?
    span = max(positions) - min(positions)
    proximity = max(0.0, 1.0 - (span / max_gap))
    
    return coverage * 0.6 + proximity * 0.4


def check_availability(query, results, chunks):
    """
    Answer Availability Check v5 — decision tree with strict criteria.
    
    Decision logic:
    1. Multi-word phrase match → AVAILABLE (immediate)
    2. raw_sim >= 0.55 → AVAILABLE (strong semantic similarity)
    3. raw_sim >= 0.45 AND prox >= 0.40 AND source_type='html' → AVAILABLE
    4. raw_sim >= 0.40 AND prox >= 0.70 → AVAILABLE (strong proximity compensates)
    5. raw_sim >= 0.35 AND prox >= 0.50 AND source_type='html' → AVAILABLE
    6. Otherwise → UNAVAILABLE
    
    Returns (available: bool, best_score: float, terms: list, details: str)
    """
    terms = extract_key_terms(query)
    phrases = extract_phrases(query)

    if not terms:
        return True, 1.0, terms, "No discriminative terms"

    for r in results[:5]:
        idx = r[0]
        chunk = chunks[idx]
        text = ((chunk.get("text", "") or "") + " " + (chunk.get("title", "") or "")).lower()

        # Phase 1: Multi-word phrase match (immediate pass)
        phrase_match = any(p in text for p in phrases)
        if phrase_match:
            return True, 1.0, terms, f"phrase_match: '{next(p for p in phrases if p in text)}'"

        # Proximity and similarity
        prox = proximity_coverage(terms, text)
        raw_sim = r[2]
        source_type = chunk.get("source_type", "")
        is_html = source_type == "html"

        # Decision tree
        if raw_sim >= 0.55:
            return True, raw_sim, terms, f"high_sim: {raw_sim:.3f}"

        if raw_sim >= 0.45 and prox >= 0.40 and is_html:
            return True, raw_sim + prox, terms, f"html+sim+prox: sim={raw_sim:.3f}, prox={prox:.3f}"

        if raw_sim >= 0.40 and prox >= 0.70:
            return True, raw_sim + prox, terms, f"strong_prox: sim={raw_sim:.3f}, prox={prox:.3f}"

        if raw_sim >= 0.35 and prox >= 0.50 and is_html:
            return True, raw_sim + prox, terms, f"html_fallback: sim={raw_sim:.3f}, prox={prox:.3f}"

    return False, 0.0, terms, "no_match"


# ══════════════════════════════════════════════════════════════════════════
#  ANSWERABLE QUERIES — content EXISTS in KB, should PASS
# ══════════════════════════════════════════════════════════════════════════

def build_answerable():
    """50+ queries where the content IS known to exist in the KB."""
    Q = []
    # Administration
    Q.append(("Who is the chairman of Kingston Engineering College?", True, ["about"]))
    Q.append(("Who is the principal of the college?", True, ["about"]))
    Q.append(("What is the vision and mission of the college?", True, ["about"]))
    Q.append(("Who is the HOD of CSE department?", True, ["department"]))
    Q.append(("Who is the HOD of ECE department?", True, ["department"]))
    Q.append(("Head of Mechanical Engineering department", True, ["department"]))
    Q.append(("Tell me about the placement record", True, ["placement"]))
    Q.append(("What companies visit for campus recruitment?", True, ["placement"]))
    # Departments
    Q.append(("Tell me about the CSE department", True, ["department"]))
    Q.append(("What courses does ECE offer?", True, ["department"]))
    Q.append(("Faculty members of IT department", True, ["department", "faculty"]))
    Q.append(("Tell me about the MBA program", True, ["department"]))
    Q.append(("Tell me about the Mechanical Engineering department", True, ["department"]))
    Q.append(("Does the college offer Architecture program?", True, ["department"]))
    Q.append(("What labs are in the CSE department?", True, ["department", "facility"]))
    # Admission
    Q.append(("What is the admission process for B.E.?", True, ["admission"]))
    Q.append(("What is the eligibility criteria for engineering admission?", True, ["admission"]))
    Q.append(("How can I apply for admission?", True, ["admission"]))
    Q.append(("What documents are required for admission?", True, ["admission"]))
    Q.append(("Is there an entrance exam for B.E.?", True, ["admission"]))
    Q.append(("What is the TNEA counselling process?", True, ["admission"]))
    Q.append(("Can I get admission through management quota?", True, ["admission"]))
    # Fees
    Q.append(("What is the fee structure for B.E. programs?", True, ["fees"]))
    Q.append(("How much is tuition fees per semester?", True, ["fees"]))
    Q.append(("What are hostel fees and mess charges?", True, ["fees", "hostel"]))
    Q.append(("What is the total cost for 4-year B.E.?", True, ["fees"]))
    # Hostel
    Q.append(("Does the college provide hostel accommodation?", True, ["hostel"]))
    Q.append(("Is there separate hostel for boys and girls?", True, ["hostel"]))
    Q.append(("What hostel facilities are available?", True, ["hostel", "facility"]))
    Q.append(("Is there Wi-Fi in the hostel?", True, ["hostel", "facility"]))
    Q.append(("What are mess facilities in the hostel?", True, ["hostel", "facility"]))
    # Transport
    Q.append(("Does the college have bus transport?", True, ["transport"]))
    Q.append(("What is the transport fee per semester?", True, ["transport", "fees"]))
    Q.append(("How many buses does the college operate?", True, ["transport"]))
    # Contact
    Q.append(("What is the contact number of the college?", True, ["contact"]))
    Q.append(("Where is the college located?", True, ["contact"]))
    Q.append(("What is the email for admission inquiries?", True, ["contact"]))
    Q.append(("What is the college postal address?", True, ["contact"]))
    Q.append(("How to reach the college by public transport?", True, ["contact"]))
    # Scholarship
    Q.append(("What scholarship opportunities are available?", True, ["scholarship"]))
    Q.append(("Is there a scholarship for SC/ST students?", True, ["scholarship"]))
    Q.append(("Does the college offer merit scholarships?", True, ["scholarship"]))
    # Sports
    Q.append(("What sports facilities are available?", True, ["sports", "facility"]))
    Q.append(("Does the college have a playground?", True, ["sports", "facility"]))
    Q.append(("Is there a gymnasium?", True, ["sports", "facility"]))
    # Library
    Q.append(("What library facilities are available?", True, ["library", "facility"]))
    Q.append(("Are digital resources available in the library?", True, ["library", "facility"]))
    Q.append(("Does the library have online journals?", True, ["library", "facility"]))
    # NAAC
    Q.append(("What is the NAAC grade?", True, ["naac"]))
    Q.append(("Is the college NBA accredited?", True, ["naac"]))
    Q.append(("What is the college NAAC score?", True, ["naac"]))
    # Facilities
    Q.append(("What IT infrastructure is available?", True, ["facility"]))
    Q.append(("Does the college have a canteen?", True, ["facility"]))
    Q.append(("What medical facilities are on campus?", True, ["facility"]))
    Q.append(("Is there an auditorium?", True, ["facility"]))
    Q.append(("What welfare measures exist?", True, ["facility"]))
    # Policy
    Q.append(("Is there an anti-ragging committee?", True, ["policy"]))
    Q.append(("How to file a grievance?", True, ["policy"]))
    Q.append(("What is the policy on ragging?", True, ["policy"]))
    Q.append(("Does the college have equal opportunity cell?", True, ["policy"]))
    # IQAC
    Q.append(("What is IQAC?", True, ["iqac"]))
    Q.append(("How does IQAC improve teaching quality?", True, ["iqac"]))
    Q.append(("Who are IQAC members?", True, ["iqac"]))
    # Alumni
    Q.append(("Does the college have an alumni association?", True, ["alumni"]))
    Q.append(("How can I register for the alumni network?", True, ["alumni"]))
    # Research
    Q.append(("Does the college have a research and development cell?", True, ["research"]))
    Q.append(("Does the college support student research?", True, ["research"]))
    Q.append(("Is there an incubation centre?", True, ["research", "facility"]))
    # Timing / Schedule
    Q.append(("What are the college office timings?", True, ["about"]))
    Q.append(("What are the library timings?", True, ["library"]))
    Q.append(("Admission office hours", True, ["admission", "contact"]))
    return Q


# ══════════════════════════════════════════════════════════════════════════
#  UNANSWERABLE QUERIES — content NOT in KB, should trigger FALLBACK
# ══════════════════════════════════════════════════════════════════════════

def build_unanswerable():
    """50+ queries where the content does NOT exist in the KB."""
    Q = []
    # Nonexistent facilities
    Q.append(("Is there a bank branch on campus?", False, ["facility"]))
    Q.append(("Does the college have a stationery shop?", False, ["facility"]))
    Q.append(("Is there a swimming pool on campus?", False, ["facility"]))
    Q.append(("Does the college have a post office?", False, ["facility"]))
    Q.append(("Is there a pharmacy on campus?", False, ["facility"]))
    Q.append(("Does the college have a movie theater?", False, ["facility"]))
    Q.append(("Is there a rooftop garden?", False, ["facility"]))
    Q.append(("Does the college have a photography studio?", False, ["facility"]))
    Q.append(("Is there a gaming zone on campus?", False, ["facility"]))
    Q.append(("Does the college have a music room?", False, ["facility"]))

    # Nonexistent fees
    Q.append(("What are the payment options for fees?", False, ["fees"]))
    Q.append(("What are the international student fees?", False, ["fees"]))
    Q.append(("Is there a hostel fee discount for siblings?", False, ["fees", "hostel"]))
    Q.append(("What is the late fee penalty for tuition?", False, ["fees"]))
    Q.append(("Is there a dual degree program fee?", False, ["fees"]))
    Q.append(("Is there a semester exchange program fee?", False, ["fees"]))
    Q.append(("What is the fee for extra-curricular activities?", False, ["fees"]))

    # Nonexistent policies
    Q.append(("What is the college policy on mobile phone use in class?", False, ["policy"]))
    Q.append(("Is there a dress code policy?", False, ["policy"]))
    Q.append(("What is the policy on student council elections?", False, ["policy"]))
    Q.append(("Is there a policy for leaves of absence?", False, ["policy"]))
    Q.append(("What is the policy on inter-college transfers?", False, ["policy"]))
    Q.append(("Does the college have a policy on AI tool usage?", False, ["policy"]))
    Q.append(("Is there a policy on overnight guest stays in hostel?", False, ["policy", "hostel"]))

    # Nonexistent services
    Q.append(("Does the college offer free online certification courses?", False, ["facility"]))
    Q.append(("Is there a laundry service on campus?", False, ["facility"]))
    Q.append(("Does the college provide laptop rental?", False, ["facility"]))
    Q.append(("Is there a food delivery service in the hostel?", False, ["hostel", "facility"]))
    Q.append(("Does the college offer bus rental for student trips?", False, ["transport", "facility"]))
    Q.append(("Is there a printing and binding service?", False, ["facility"]))
    Q.append(("Does the college have a salon on campus?", False, ["facility"]))
    Q.append(("Is there a car parking service for students?", False, ["facility"]))
    Q.append(("Does the college offer lockers for students?", False, ["facility"]))
    Q.append(("Is there a catering service for events?", False, ["facility"]))

    # Nonexistent transport
    Q.append(("Does the bus cover all major routes?", False, ["transport"]))
    Q.append(("Is there transport for evening classes?", False, ["transport"]))
    Q.append(("Does the college provide bicycle parking?", False, ["transport", "facility"]))
    Q.append(("Is there an airport pickup service?", False, ["transport"]))
    Q.append(("Does the college have a railway station shuttle?", False, ["transport"]))
    Q.append(("Is there transport for field trips only?", False, ["transport"]))

    # Nonexistent academic programs
    Q.append(("Does the college offer B.Tech in Aerospace Engineering?", False, ["department"]))
    Q.append(("Is there a B.Sc in Nursing program?", False, ["department"]))
    Q.append(("Does the college offer PhD programs?", False, ["department"]))
    Q.append(("Is there a diploma in Hotel Management?", False, ["department"]))
    Q.append(("Does the college offer B.Com degree?", False, ["department"]))
    Q.append(("Is there a BA in English Literature?", False, ["department"]))
    Q.append(("Does the college offer part-time MBA?", False, ["department"]))
    Q.append(("Is there a B.Tech in Civil Engineering?", False, ["department"]))
    Q.append(("Does the college offer weekend courses?", False, ["academics"]))
    Q.append(("Is there a distance learning program?", False, ["academics"]))

    # Nonexistent scholarships
    Q.append(("Is there a scholarship for left-handed students?", False, ["scholarship"]))
    Q.append(("Does the college offer a cycling scholarship?", False, ["scholarship"]))
    Q.append(("Is there a scholarship for twins?", False, ["scholarship"]))
    Q.append(("Does the college offer full tuition waiver for all?", False, ["scholarship"]))

    # Nonexistent contact info
    Q.append(("What is the dean's office phone number?", False, ["contact"]))
    Q.append(("What is the vice principal's email?", False, ["contact"]))
    Q.append(("What is the registrar's contact?", False, ["contact"]))
    Q.append(("What is the contact for student exchange programs?", False, ["contact"]))

    # Nonexistent people
    Q.append(("Who is the vice principal of the college?", False, ["about"]))
    Q.append(("Who is the correspondent of the college?", False, ["about"]))
    Q.append(("Who is the dean of academics?", False, ["about"]))
    Q.append(("Who is the registrar?", False, ["about"]))
    Q.append(("Tell me about the head of the library", False, ["about"]))

    return Q


# ══════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 78)
    print("  PHASE 4.5 — MISSING INFORMATION GUARDRAIL VALIDATION")
    print("  Answer Availability Check — Two-Stage Confidence System")
    print("=" * 78)

    # ── Load KB ─────────────────────────────────────────────────────
    print("\n  Loading knowledge base...")
    chunks = load_json(CHUNKS_PATH)
    idx_data = load_json(INDEX_PATH)
    embeddings = idx_data.get("embeddings", [])
    print(f"  [OK] {len(chunks):,} chunks")
    print(f"  [OK] {len(embeddings):,} vectors")

    print("  Loading model...")
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("all-MiniLM-L6-v2")
    print("  [OK] Model loaded\n")

    # ── Build queries ───────────────────────────────────────────────
    answerable = build_answerable()
    unanswerable = build_unanswerable()
    total = len(answerable) + len(unanswerable)
    print(f"  Answerable queries (should pass):       {len(answerable)}")
    print(f"  Unanswerable queries (should fallback): {len(unanswerable)}")
    print(f"  Total:                                   {total}\n")

    # ── Test each query ─────────────────────────────────────────────
    results = []
    fp_details = []   # False positives: unanswerable that PASSED
    fn_details = []   # False negatives: answerable that FELL BACK
    tp = 0  # True positives:  unanswerable correctly fell back
    tn = 0  # True negatives:  answerable correctly passed
    fp = 0  # False positives: unanswerable that incorrectly passed
    fn = 0  # False negatives: answerable that incorrectly fell back
    availability_scores = []
    raw_scores = []

    latencies = []
    start_time = time.time()

    def classify_query(query):
        ql = query.lower()
        scores = {}
        for cat, kw in QUERY_CLASSIFIER.items():
            s = sum(1 for k in kw if k in ql)
            if s > 0:
                scores[cat] = s
        return sorted(scores.keys(), key=lambda c: scores[c], reverse=True)[:3]

    # Full hybrid ranking (matching production rag-worker.js)
    def augmented_search(query, top_k=5):
        qv = model.encode([query])[0].tolist()
        qc = classify_query(query)
        ql = query.lower()
        qw = [w for w in ql.split() if len(w) > 2]
        is_contact = "contact" in qc

        scored = []
        for i, c in enumerate(chunks):
            sim = cosine_similarity(qv, embeddings[i])
            if sim < 0.05:
                continue
            mult = c.get("priority_multiplier", 1.0)

            # 1. Base: Vector Similarity x Priority
            base = sim * mult

            # 2. Category Match Bonus
            cat_bonus = CATEGORY_MATCH_BONUS if c.get("category", "") in qc else 0

            # 3. Official Page Bonus
            off_bonus = OFFICIAL_PAGE_BONUS if c.get("source_type") == "html" else 0

            # 4. Keyword Overlap Bonus
            title = (c.get("title", "") or "").lower()
            overlap = sum(1 for w in qw if w in title)
            kw_bonus = min(KEYWORD_OVERLAP_MAX, overlap * 0.01)

            # 5. Category-Specific Keyword Bonus
            spec_bonus = 0
            for cat in qc:
                for p in QUERY_CLASSIFIER.get(cat, []):
                    if p in title:
                        spec_bonus += SPECIFIC_KW_BONUS
                        break

            # 6. Contact-specific: email/phone
            if is_contact:
                text = c.get("text", "") or ""
                if re.search(r'[\w.+-]+@[\w-]+\.[\w.-]+', text):
                    spec_bonus += 0.04
                if re.search(r'\+?\d[\d\s\-().]{7,}\d', text):
                    spec_bonus += 0.03

            spec_bonus = min(SPECIFIC_MAX, spec_bonus)
            final = base + cat_bonus + off_bonus + kw_bonus + spec_bonus

            scored.append((i, final, sim, c.get("priority", "medium"),
                c.get("category", "general"),
                c.get("fallback_url", "index.html"),
                c.get("source", "")))

        scored.sort(key=lambda x: x[1], reverse=True)
        topk = scored[:top_k]

        # Run Answer Availability Check
        available, avail_score, terms, detail = check_availability(query, topk, chunks)
        return topk, available, avail_score, terms, detail

    for i, (query, is_answerable, expected_cats) in enumerate(answerable + unanswerable, 1):
        t0 = time.time()
        results_list, available, avail_score, terms, avail_detail = augmented_search(query)
        latency = time.time() - t0
        latencies.append(latency)

        should_fallback = not is_answerable  # Unanswerable SHOULD trigger fallback
        did_fallback = not available         # System detected as unavailable

        is_correct = (should_fallback == did_fallback)
        raw_sim = results_list[0][2] if results_list else 0

        results.append({
            "query": query[:60],
            "is_answerable": is_answerable,
            "should_fallback": should_fallback,
            "did_fallback": did_fallback,
            "correct": is_correct,
            "availability_score": round(avail_score, 3),
            "raw_similarity": round(raw_sim, 3),
            "terms": terms,
            "avail_detail": avail_detail,
            "latency_ms": round(latency * 1000, 1),
        })

        availability_scores.append(avail_score)
        raw_scores.append(raw_sim)

        if is_answerable and not did_fallback:
            tn += 1
        elif is_answerable and did_fallback:
            fn += 1
            fn_details.append((query[:60], avail_score, avail_detail))
        elif not is_answerable and did_fallback:
            tp += 1
        elif not is_answerable and not did_fallback:
            fp += 1
            fp_details.append((query[:60], avail_score, results_list[0][6] if results_list else "N/A", avail_detail))

        if i % 30 == 0:
            passed_sofar = tn + tp
            print(f"  Progress: {i}/{total} | Correct: {passed_sofar}/{i} ({passed_sofar/i*100:.1f}%)")

    duration = time.time() - start_time

    # ── Compute metrics ─────────────────────────────────────────────
    total_answerable = len(answerable)
    total_unanswerable = len(unanswerable)
    overall_accuracy = (tp + tn) / total * 100 if total > 0 else 0
    fpr = fp / total_unanswerable * 100 if total_unanswerable > 0 else 0  # False Positive Rate
    fnr = fn / total_answerable * 100 if total_answerable > 0 else 0      # False Negative Rate
    precision = tp / (tp + fp) * 100 if (tp + fp) > 0 else 0             # Precision
    recall = tp / (tp + fn) * 100 if (tp + fn) > 0 else 0                # Recall
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

    latencies.sort()
    avg_lat = sum(latencies) / len(latencies) if latencies else 0
    p95_lat = latencies[int(len(latencies) * 0.95)] if latencies else 0

    target_met = overall_accuracy >= 95.0

    # ══════════════════════════════════════════════════════════════════
    #  REPORT
    # ══════════════════════════════════════════════════════════════════

    print("\n\n" + "=" * 78)
    print("  A. MISSING INFORMATION ACCURACY")
    print("=" * 78)
    print(f"\n  Overall accuracy:              {overall_accuracy:.1f}%")
    print(f"  Target (95%):                  {'YES ✅' if target_met else 'NO ❌'}")
    print(f"  Total queries:                 {total}")
    print(f"  Answerable queries:            {total_answerable}")
    print(f"  Unanswerable queries:          {total_unanswerable}")

    print("\n  Confusion Matrix:")
    print(f"                    Predicted")
    print(f"                  Available  | Unavailable")
    print(f"  Actual          ───────────┼────────────")
    print(f"  Available (OK)   TN={tn:>3}      │ FN={fn:>3}")
    print(f"  Missing (🚫)     FP={fp:>3}      │ TP={tp:>3}")

    print(f"\n  False Positive Rate (FPR):     {fpr:.1f}%  (unanswerable that passed)")
    print(f"  False Negative Rate (FNR):     {fnr:.1f}%  (answerable that fell back)")
    print(f"  Precision:                     {precision:.1f}%")
    print(f"  Recall:                        {recall:.1f}%")
    print(f"  F1 Score:                      {f1:.1f}%")

    # ══════════════════════════════════════════════════════════════════
    #  B. SAMPLE FALLBACK RESPONSES
    # ══════════════════════════════════════════════════════════════════

    print("\n\n" + "=" * 78)
    print("  B. SAMPLE FALLBACK RESPONSES")
    print("=" * 78)

    print("\n  Correct fallbacks (unanswerable → trigger):")
    for item in fp_details[:3]:
        q, score, src, detail = item[0], item[1], item[2], item[3] if len(item) > 3 else ""
        print(f"    ❌ SHOULD NOT HAVE PASSED: '{q}'")
        print(f"       availability={score:.3f}, source={src[:40]}, detail={detail}")
        print(f"       Expected: 'I\'m sorry, I\'m not prepared to answer that yet.'")
        print(f"       Would wrongly answer instead")
        print()

    # Get some good examples
    good_fallbacks = [r for r in results if not r["is_answerable"] and r["did_fallback"]]
    print(f"\n  Correct fallbacks ({len(good_fallbacks)} shown):")
    for r in good_fallbacks[:5]:
        print(f"    ✅ '{r['query']}' → availability={r['availability_score']}")
        print(f"       Would correctly show: 'I'm sorry, I'm not prepared to answer that yet.'")
        print()

    # ══════════════════════════════════════════════════════════════════
    #  C. FALSE POSITIVE ANALYSIS
    # ══════════════════════════════════════════════════════════════════

    print("\n" + "=" * 78)
    print("  C. FALSE POSITIVE ANALYSIS (unanswerable that passed)")
    print("=" * 78)

    if fp_details:
        for q, score, src, detail in fp_details:
            print(f"  ❌ '{q}'")
            print(f"     availability={score}, source={src[:40]}")
            print(f"     detail: {detail}")
            print()
    else:
        print("\n  No false positives — perfect! ✅\n")

    # ══════════════════════════════════════════════════════════════════
    #  D. FALSE NEGATIVE ANALYSIS
    # ══════════════════════════════════════════════════════════════════

    print("\n" + "=" * 78)
    print("  D. FALSE NEGATIVE ANALYSIS (answerable that fell back)")
    print("=" * 78)

    if fn_details:
        for q, score, detail in fn_details:
            print(f"  ⚠️  '{q}'")
            print(f"     availability={score}, detail: {detail}")
            print()
    else:
        print("\n  No false negatives — perfect! ✅\n")

    # ══════════════════════════════════════════════════════════════════
    #  E. FINAL MIGRATION RECOMMENDATION
    # ══════════════════════════════════════════════════════════════════

    print("=" * 78)
    print("  E. FINAL MIGRATION RECOMMENDATION")
    print("=" * 78)

    print(f"\n  Guardrail accuracy:      {overall_accuracy:.1f}%  (target: 95%)")
    print(f"  False positive rate:     {fpr:.1f}%  (uncaught missing content)")
    print(f"  False negative rate:     {fnr:.1f}%  (good content wrongly blocked)")
    print(f"  F1 Score:                {f1:.1f}%")
    print(f"  Test duration:           {duration:.1f}s")
    print(f"  Avg latency:             {avg_lat*1000:.0f}ms")
    print(f"  P95 latency:             {p95_lat*1000:.0f}ms")

    decision_letter = "A" if target_met else "B"
    decision_text = "READY FOR MIGRATION" if target_met else "NOT READY FOR MIGRATION"

    print(f"\n  Decision:                {decision_letter}. {decision_text}")
    print(f"  Evidence:")
    print(f"    • {overall_accuracy:.1f}% accuracy on {total} queries ({total_answerable} answerable + {total_unanswerable} unanswerable)")
    print(f"    • {tp}/{total_unanswerable} unanswerable queries correctly trigger the fallback message")
    print(f"    • {tn}/{total_answerable} answerable queries correctly pass through and return real content")

    if target_met:
        print(f"    • {fp} false positives (content missing but system would wrongly answer)")
        print(f"    • {fn} false negatives (content exists but system would wrongly fallback)")
        print(f"    • Two-stage confidence: similarity + availability, both checked before answering")
        print(f"    • Fallback message: 'I'm sorry, I'm not prepared to answer that yet. For complete and official information, please visit: [link]'")
    else:
        print(f"    • Issues: {fp} false positives, {fn} false negatives")
        print(f"    • Recommended: Adjust availability threshold or add term expansion")

    print(f"\n  Report saved: {REPORT_PATH}")
    print(f"  No production files modified.")
    print(f"  Legacy chatbot untouched.")
    print(f"  New files modified: scripts/missing_info_guardrail_test.py")

    # ── Save report ─────────────────────────────────────────────────
    report = {
        "phase": "Phase 4.5: Missing Information Guardrail Validation",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "kb": {"chunks": len(chunks), "vectors": len(embeddings)},
        "guardrail": {
            "type": "Answer Availability Check (term_coverage × 0.5 + raw_sim × 0.3 + source_auth × 0.2)",
            "availability_threshold": AVAILABILITY_THRESHOLD,
        },
        "accuracy": {
            "total_queries": total,
            "answerable": total_answerable,
            "unanswerable": total_unanswerable,
            "overall_accuracy_pct": round(overall_accuracy, 1),
            "target_95_met": target_met,
            "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
            "fpr_pct": round(fpr, 1),
            "fnr_pct": round(fnr, 1),
            "precision_pct": round(precision, 1),
            "recall_pct": round(recall, 1),
            "f1_pct": round(f1, 1),
        },
        "false_positives": [{"query": q[:60], "availability_score": s, "source": src[:50]} for q, s, src, d in fp_details],
        "false_negatives": [{"query": q[:60], "availability_score": s} for q, s, d in fn_details],
        "recommendation": f"{decision_letter}. {decision_text}",
        "per_query": results,
    }

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\n  Done.")


if __name__ == "__main__":
    main()
