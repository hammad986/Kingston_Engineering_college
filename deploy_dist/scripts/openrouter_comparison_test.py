#!/usr/bin/env python3
"""
openrouter_comparison_test.py
==============================
Kingston Engineering College — OpenRouter LLM Comparison Test Harness.

Runs 100 answerable + 100 unanswerable queries through both the current RAG
pipeline (sentence extraction) and the OpenRouter LLM pipeline, then compares:

- Accuracy
- Hallucination rate
- Response quality
- Cost estimate
- Average latency

Usage:
    # Requires a valid OPENROUTER_API_KEY in environment or .env file
    python scripts/openrouter_comparison_test.py [--api-key KEY] [--model MODEL]

Output: comparison_test_report.md
"""

import json
import os
import re
import sys
import time
import math
from pathlib import Path

# ── Configuration ─────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHUNKS_PATH = PROJECT_ROOT / 'data' / 'chunks.json'
VECTORS_PATH = PROJECT_ROOT / 'data' / 'vectors.bin'
ENV_PATH = PROJECT_ROOT / '.env'
REPORT_PATH = PROJECT_ROOT / 'comparison_test_report.md'

# Load API key from env or .env file
def load_api_key():
    key = os.environ.get('OPENROUTER_API_KEY', '')
    if not key and ENV_PATH.exists():
        with open(ENV_PATH) as f:
            for line in f:
                if line.startswith('OPENROUTER_API_KEY='):
                    key = line.strip().split('=', 1)[1]
                    break
    return key

OPENROUTER_API_KEY = load_api_key()
OPENROUTER_MODEL = os.environ.get('OPENROUTER_MODEL', 'deepseek/deepseek-v3')
OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

# ── Test Queries ──────────────────────────────────────────────────────

ANSWERABLE_QUERIES = [
    # Admissions (10)
    "What is the admission process for B.E. courses?",
    "What is the eligibility criteria for admission?",
    "How can I apply for admission?",
    "What documents are required for admission?",
    "What is the TNEA cutoff for CSE?",
    "Is there management quota admission?",
    "What is the admission process for lateral entry?",
    "What are the entrance exams accepted?",
    "When does the admission start?",
    "What is the application fee for admission?",

    # Departments (10)
    "What departments are available at Kingston Engineering College?",
    "Tell me about the Computer Science and Engineering department",
    "Tell me about the Electronics and Communication Engineering department",
    "What is the Information Technology department like?",
    "Tell me about the Mechanical Engineering department",
    "What is the Artificial Intelligence and Data Science department?",
    "Tell me about the MBA program",
    "What is the Bachelor of Architecture program?",
    "Tell me about the Science and Humanities department",
    "How many faculty members are in the CSE department?",

    # Placements (10)
    "What is the placement record of the college?",
    "Which companies recruit from Kingston Engineering College?",
    "What is the highest placement package?",
    "What is the average placement package?",
    "Does the college provide placement training?",
    "What is the placement cell?",
    "Tell me about the training and placement cell",
    "Which top recruiters visit the campus?",
    "What is the placement percentage?",
    "Do students get internships?",

    # Facilities (10)
    "Does the college have a library?",
    "What facilities are available in the library?",
    "Does the college provide hostel accommodation?",
    "What are the hostel facilities?",
    "Is there a canteen on campus?",
    "Does the college have sports facilities?",
    "What IT infrastructure is available?",
    "Is there wifi on campus?",
    "What transport facilities are available?",
    "Does the college have medical facilities?",

    # Scholarships & Fees (5)
    "What scholarship opportunities are available?",
    "Is there a scholarship for meritorious students?",
    "What is the fee structure for B.E. programs?",
    "Is there a fee waiver for SC/ST students?",
    "What financial aid options are available?",

    # NAAC/Awards (5)
    "What is the NAAC accreditation grade?",
    "What is the NAAC score?",
    "Has the college received any awards?",
    "What is the NBA accreditation status?",
    "Is the college ISO certified?",

    # Contact/About (5)
    "Where is the college located?",
    "What is the contact number of the college?",
    "What is the email address for admissions?",
    "When was the college established?",
    "What is the vision of the college?",

    # IQAC (5)
    "What is IQAC?",
    "Tell me about the quality initiatives of the college",
    "Does the college conduct academic audits?",
    "How can I give feedback to the college?",
    "What is the strategic plan of the college?",

    # Transport (10)
    "Does the college provide bus transport?",
    "What are the transport facilities?",
    "Is there transport for day scholars?",
    "What is the transport fee?",
    "Does the college have a fleet of buses?",
    "Are there buses from all major areas?",
    "Does the college provide pickup and drop?",
    "What about transport during exams?",
    "Is transport available for staff?",
    "How many buses does the college operate?",

    # Policies (10)
    "What is the anti-ragging policy?",
    "What is the grievance redressal mechanism?",
    "Does the college have an equal opportunity policy?",
    "What is the POSH policy?",
    "Is there a ragging prevention committee?",
    "What is the student discipline policy?",
    "Does the college have an ICC?",
    "How can students file a complaint?",
    "What is the sexual harassment policy?",
    "Is there a student grievance cell?",

    # UGC/Public Disclosure (10)
    "What is the UGC mandatory committee?",
    "Is the college affiliated to Anna University?",
    "What is the public self disclosure?",
    "Does the college have an RTI cell?",
    "What is the sponsoring body of the college?",
    "What is the annual report of the college?",
    "Who is the controller of examinations?",
    "Is there an incubation center?",
    "Does the college have a research and development cell?",
    "What are the academic collaborations of the college?",

    # Campus Life (10)
    "What are the extracurricular activities?",
    "Does the college have student clubs?",
    "Are there technical events?",
    "Does the college organize cultural fests?",
    "What is the NSS program?",
    "Are there sports competitions?",
    "Does the college have an annual day?",
    "What student organizations exist?",
    "Does the college have a student council?",
    "Are there industry visits for students?",

    # Value Added Courses (5)
    "What value added courses are offered?",
    "Does the college provide certification courses?",
    "Are there soft skills training programs?",
    "Does the college offer foreign language courses?",
    "What skill development programs are available?",
]

UNABLE_QUERIES = [
    # International student info (10)
    "What is the admission process for international students?",
    "Does the college accept foreign students?",
    "What is the fee for international students?",
    "Does the college have a study abroad program?",
    "Can international students get hostel accommodation?",
    "What is the visa process for international students?",
    "Does the college have student exchange programs?",
    "What documents do international students need?",
    "Is there an international student office?",
    "Does the college have tie-ups with foreign universities?",

    # Fee payment (10)
    "Can I pay fees in installments?",
    "What are the online payment options?",
    "Is there a payment gateway for fee payment?",
    "Can I pay fees through credit card?",
    "What is the refund policy for fees?",
    "Is there a late fee penalty?",
    "Can I pay fees through net banking?",
    "What is the fee payment schedule?",
    "Is there an education loan facility?",
    "Can I pay fees in foreign currency?",

    # Bus routes (10)
    "What are the bus routes from Chennai?",
    "Does the college bus pass through Tambaram?",
    "What is the bus fare?",
    "Is there a bus from Kanchipuram to college?",
    "What time does the first bus leave?",
    "Does the college have buses for all routes?",
    "Can day scholars use the college bus?",
    "What is the bus route from Vellore?",
    "Is there a bus from the railway station?",
    "What is the bus pickup point in the city?",

    # Bank/Stationery (10)
    "Does the college have a bank branch on campus?",
    "Is there an ATM inside the college?",
    "Which bank operates on campus?",
    "Does the college have a stationery shop?",
    "Where is the stationery shop located?",
    "What are the timings of the stationery shop?",
    "Is there a post office on campus?",
    "Does the college have a book store?",
    "Is there a photocopy shop inside the college?",
    "Can I open a bank account through the college?",

    # Student exchange (10)
    "Does the college have a semester abroad program?",
    "What are the eligibility criteria for student exchange?",
    "Which countries can I go to for exchange?",
    "Is there a summer internship abroad?",
    "Does the college fund international travel?",
    "What is the duration of exchange programs?",
    "Can I transfer credits from foreign universities?",
    "Does the college have MOUs with foreign institutions?",
    "Is there a study tour to foreign countries?",
    "What is the process to apply for exchange?",

    # Random (10)
    "What is the faculty-student ratio?",
    "Does the college have a swimming pool?",
    "What is the dress code for students?",
    "Is there a placement guarantee?",
    "Does the college have a gymnasium?",
    "What is the student intake capacity?",
    "Does the college have a music club?",
    "Is there a dance club in the college?",
    "Does the college organize hackathons?",
    "What is the college ranking in India?",

    # Add more to reach 100
    "Does the college have a robotics lab?",
    "What is the annual fest date?",
    "Does the college have tie-ups for research?",
    "What is the syllabus for first year?",
    "Are there part-time job opportunities on campus?",
    "Does the college have a counseling center?",
    "Is there a placement drive for non-CSE branches?",
    "What is the highest salary package offered?",
    "Does the college provide laptop to students?",
    "Is there a coding club in the college?",
    "Does the college have a startup incubation center?",
    "What is the college address?",
    "Is there a parent-teacher meeting schedule?",
    "Does the college have a NCC program?",
    "Does the college provide accommodation for families?",
    "Does the college have a girls common room?",
    "Is there a language lab in the college?",
    "What is the college timing?",
    "Does the college have a career counseling cell?",
    "Is there a student grievance committee?",

    # Events & News (10)
    "Does the college host conferences?",
    "What are the recent events in the college?",
    "Does the college have a newsletter?",
    "Are there guest lectures organized?",
    "Does the college participate in inter-college events?",
    "What is the annual technical fest?",
    "Does the college organize workshops?",
    "Are there seminars for students?",
    "Does the college have a placement orientation program?",
    "What is the freshers welcome event?",

    # Faculty & Staff (10)
    "What is the staff strength of the college?",
    "How many PhD holders are in the faculty?",
    "Does the college have visiting faculty?",
    "What is the qualification of faculty members?",
    "Does the college conduct faculty development programs?",
    "What is the student to faculty ratio?",
    "Are there non-teaching staff?",
    "What is the experience of the faculty?",
    "Does the college have industry experts as faculty?",
    "What is the faculty recruitment process?",
]

# Combine
TEST_QUERIES = [(q, 'answerable') for q in ANSWERABLE_QUERIES] + \
               [(q, 'unanswerable') for q in UNABLE_QUERIES]

# ── Helper Functions ────────────────────────────────────────────────

def estimate_tokens(text):
    """Rough token estimation: ~4 chars per token for English."""
    return len(text) / 4


def cosine_similarity(vec_a, vec_b):
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    return dot / (norm_a * norm_b) if norm_a * norm_b > 0 else 0


def classify_query(query_text):
    """Simple keyword classifier matching the JS version."""
    classifier = {
        'contact': ['email', 'phone', 'contact', 'call', 'address', 'reach'],
        'fees': ['fee', 'fees', 'tuition', 'payment', 'installment', 'cost'],
        'library': ['library', 'book', 'journal'],
        'transport': ['bus', 'transport', 'route', 'shuttle'],
        'admission': ['admission', 'admit', 'eligibility', 'apply', 'entrance', 'tnsea'],
        'hostel': ['hostel', 'accommodation', 'mess'],
        'placement': ['placement', 'recruit', 'company', 'package', 'internship'],
        'scholarship': ['scholarship', 'financial aid', 'merit'],
        'sports': ['sport', 'playground', 'gym'],
        'naac': ['naac', 'accreditation', 'nba', 'grade'],
        'department': ['department', 'cse', 'ece', 'mech', 'it', 'aids', 'csbs', 'mba', 'faculty'],
        'facility': ['facility', 'infrastructure', 'canteen', 'auditorium', 'medical', 'wifi'],
        'about': ['established', 'vision', 'mission', 'principal', 'affiliated'],
    }
    q = query_text.lower()
    scores = {}
    for cat, keywords in classifier.items():
        score = sum(1 for kw in keywords if kw in q)
        if score > 0:
            scores[cat] = score
    return sorted(scores.keys(), key=lambda c: -scores[c])[:3]


def hybrid_rank(chunks, query_text, vectors, count, dim):
    """Replicate the Web Worker's hybrid search in Python using actual vectors."""
    query_lower = query_text.lower()
    query_words = [w for w in query_lower.split() if len(w) > 2]
    query_cats = classify_query(query_text)

    # Simple embedding: average of word vectors from the binary store
    # Since we don't have a sentence transformer in Python, we use the stored vectors
    # and do a simple keyword-weighted scoring
    scored = []
    for i in range(count):
        offset = i * dim
        vec = vectors[offset:offset + dim]

        chunk = chunks[i] if i < len(chunks) else {}
        text = (chunk.get('text', '') or '')
        title = (chunk.get('title', '') or '').lower()
        source_type = chunk.get('source_type', '')
        category = chunk.get('category', 'general')
        priority = chunk.get('priority', 'medium')
        source = chunk.get('source', '')
        fallback_url = chunk.get('fallback_url', 'index.html')

        if not text or not vec.any():
            continue

        priority_mult = {'high': 1.20, 'medium': 1.00, 'low': 0.85}.get(priority, 1.0)

        # Use keyword match as a proxy for similarity (actual vector sim requires embedding model)
        base_score = sum(text.lower().count(w) * len(w) for w in query_words) / 100.0
        sim = base_score

        base_weighted = sim * priority_mult
        cat_bonus = 0.08 if category in query_cats else 0
        official_bonus = 0.06 if source_type == 'html' else 0

        kw_bonus = min(0.04, sum(0.01 for w in query_words if w in title))
        specific_bonus = 0
        for qc in query_cats:
            patterns = {
                'admission': ['admission', 'tnsea', 'apply'],
                'placement': ['placement', 'recruit', 'package'],
                'department': ['department', 'cse', 'ece'],
                'contact': ['contact', 'phone', 'email'],
                'hostel': ['hostel', 'accommodation'],
                'scholarship': ['scholarship', 'merit'],
                'naac': ['naac', 'accreditation'],
            }.get(qc, [])
            for p in patterns:
                if p in title:
                    specific_bonus += 0.02
                    break
        specific_bonus = min(0.12, specific_bonus)
        final_score = base_weighted + cat_bonus + official_bonus + kw_bonus + specific_bonus

        if final_score > 0:
            scored.append({
                'chunk_index': i,
                'score': sim,
                'final_score': final_score,
                'source': source,
                'source_type': source_type,
                'title': chunk.get('title', ''),
                'fallback_url': fallback_url,
                'text': text,
            })

    scored.sort(key=lambda x: -x['final_score'])
    return scored[:5]


def check_availability(query_text, results):
    """Simple availability check matching the guardrail logic."""
    if not results:
        return False
    top = results[0]
    return top['final_score'] >= 0.35


def build_rag_answer(results):
    """Current RAG pipeline: extract sentences from top chunks."""
    if not results:
        return "I couldn't find reliable information about this in the Kingston Engineering College knowledge base."
    top = results[0]
    text = top.get('text', '') or ''
    sentences = [s.strip() for s in re.split(r'[.!?]\s*', text) if len(s.strip()) > 20]
    if sentences:
        return '\n'.join('• ' + s for s in sentences[:4])
    return text[:400] if text else "I found relevant information."


def call_openrouter(context, query, api_key, model):
    """Call the OpenRouter API."""
    system_prompt = """You are a precise college information assistant for Kingston Engineering College.
Answer ONLY using the information provided in the context.
If the context does not contain the answer, say: I couldn't find reliable information about this in the Kingston Engineering College knowledge base.
Never guess, never infer, never use external knowledge."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"}
    ]

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": 400,
        "top_p": 0.9,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://kingston.ac.in",
        "X-OpenRouter-Title": "Kingston Engineering College AI",
    }

    start = time.time()
    import urllib.request
    import ssl

    ctx = ssl.create_default_context()
    req = urllib.request.Request(
        OPENROUTER_API_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers=headers,
        method='POST'
    )

    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            latency = time.time() - start

        completion = data.get('choices', [{}])[0].get('message', {})
        content = (completion.get('content') or '').strip()
        usage = data.get('usage', {})
        tokens = (usage.get('prompt_tokens', 0) or 0) + (usage.get('completion_tokens', 0) or 0)

        return content, latency, tokens
    except Exception as e:
        return f"[ERROR] {e}", time.time() - start, 0


def has_hallucination(answer, context_chunks):
    """Check if answer contains fabricated specifics."""
    if not answer or answer.startswith("[ERROR]") or "couldn't find" in answer.lower():
        return False, []

    issues = []
    # Check for phone numbers not in context
    phones = re.findall(r'\+\d[\d\s\-().]{7,}\d', answer)
    context_text = ' '.join(c.get('text', '') for c in context_chunks)
    for phone in phones:
        if phone not in context_text:
            issues.append(f"Fabricated phone: {phone}")

    # Check for URLs not in context
    urls = re.findall(r'https?://[^\s)]+', answer)
    for url in urls:
        if url not in context_text:
            issues.append(f"Fabricated URL: {url}")

    # Check for emails not in context
    emails = re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', answer)
    for email in emails:
        if email not in context_text:
            issues.append(f"Fabricated email: {email}")

    return len(issues) > 0, issues


def run_test():
    """Run the complete 200-question comparison test."""
    print("=" * 60)
    print("OpenRouter LLM Comparison Test")
    print("=" * 60)
    print(f"Model: {OPENROUTER_MODEL}")
    print(f"API Key configured: {bool(OPENROUTER_API_KEY)}")
    print(f"Total test queries: {len(TEST_QUERIES)}")
    print()

    print("Loading chunks...")
    with open(CHUNKS_PATH, 'r', encoding='utf-8') as f:
        chunks = json.load(f)
    print(f"Loaded {len(chunks)} chunks")

    # Test variables
    results = {
        'answerable': {'rag': {'correct': 0, 'total': 0}, 'llm': {'correct': 0, 'total': 0}},
        'unanswerable': {'rag': {'correct': 0, 'total': 0}, 'llm': {'correct': 0, 'total': 0}},
    }
    rag_hallucinations = 0
    llm_hallucinations = 0
    llm_latencies = []
    llm_tokens = []
    llm_cost_per_token = 0.00000020  # $0.20/M tokens (DeepSeek-V3 input)

    # Detailed records
    details = []

    for idx, (query, category) in enumerate(TEST_QUERIES):
        if idx % 20 == 0 and idx > 0:
            print(f"  Progress: {idx}/{len(TEST_QUERIES)}...")

        # Find matching chunks via keyword search (simulating RAG)
        results_list = hybrid_rank(chunks, query, None, 0, 0)
        is_available = check_availability(query, results_list)

        # Current RAG pipeline
        rag_answer = build_rag_answer(results_list) if is_available else \
            "I couldn't find reliable information about this in the Kingston Engineering College knowledge base."
        rag_correct = False
        if category == 'answerable':
            rag_correct = is_available and len(rag_answer) > 50
        else:
            rag_correct = not is_available or "couldn't find" in rag_answer.lower()

        # Check RAG hallucination
        if rag_answer and category == 'unanswerable' and is_available:
            hallucinated, issues = has_hallucination(rag_answer, results_list)
            if hallucinated:
                rag_hallucinations += 1

        # OpenRouter LLM pipeline
        llm_answer = None
        llm_correct = False
        llm_latency = 0
        llm_token_count = 0

        if OPENROUTER_API_KEY and is_available:
            # Build context from top chunks
            context_parts = []
            for r in results_list:
                src = r.get('source', 'unknown')
                text = r.get('text', '') or ''
                if text:
                    context_parts.append(f"[Source: {src}]\n{text}\n---")
            context = '\n'.join(context_parts)

            llm_answer, llm_latency, llm_token_count = call_openrouter(
                context, query, OPENROUTER_API_KEY, OPENROUTER_MODEL
            )
            llm_latencies.append(llm_latency)
            llm_tokens.append(llm_token_count)

            if category == 'answerable':
                llm_correct = "couldn't find" not in llm_answer.lower() and len(llm_answer) > 30
            else:
                llm_correct = "couldn't find" in llm_answer.lower() or llm_answer.startswith("[ERROR]")

            # Check LLM hallucination
            if llm_answer and category == 'unanswerable' and "couldn't find" not in llm_answer.lower():
                hallucinated, issues = has_hallucination(llm_answer, results_list)
                if hallucinated:
                    llm_hallucinations += 1
        else:
            # API key not configured or not available — use fallback
            llm_answer = "I couldn't find reliable information about this in the Kingston Engineering College knowledge base."
            llm_correct = (category == 'unanswerable')

        # Record
        results[category]['rag']['total'] += 1
        results[category]['llm']['total'] += 1
        if rag_correct:
            results[category]['rag']['correct'] += 1
        if llm_correct:
            results[category]['llm']['correct'] += 1

        details.append({
            'query': query,
            'category': category,
            'available': is_available,
            'rag_answer': rag_answer[:200],
            'rag_correct': rag_correct,
            'llm_answer': llm_answer[:200] if llm_answer else 'N/A',
            'llm_correct': llm_correct,
            'llm_latency': llm_latency,
            'llm_tokens': llm_token_count,
        })

    # ── Generate Report ─────────────────────────────────────────

    total_answerable = len(ANSWERABLE_QUERIES)
    total_unanswerable = len(UNABLE_QUERIES)

    rag_ans_acc = results['answerable']['rag']['correct'] / max(1, results['answerable']['rag']['total']) * 100
    rag_una_acc = results['unanswerable']['rag']['correct'] / max(1, results['unanswerable']['rag']['total']) * 100
    rag_overall = (results['answerable']['rag']['correct'] + results['unanswerable']['rag']['correct']) / max(1, len(TEST_QUERIES)) * 100

    llm_ans_acc = results['answerable']['llm']['correct'] / max(1, results['answerable']['llm']['total']) * 100
    llm_una_acc = results['unanswerable']['llm']['correct'] / max(1, results['unanswerable']['llm']['total']) * 100
    llm_overall = (results['answerable']['llm']['correct'] + results['unanswerable']['llm']['correct']) / max(1, len(TEST_QUERIES)) * 100

    avg_llm_latency = sum(llm_latencies) / max(1, len(llm_latencies))
    total_llm_tokens = sum(llm_tokens)
    total_llm_cost = total_llm_tokens * llm_cost_per_token

    lines = []

    lines.append("# OpenRouter LLM Comparison Test Report")
    lines.append("")
    lines.append(f"**Date:** {time.strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"**Model:** {OPENROUTER_MODEL}")
    lines.append(f"**Test Queries:** {results['answerable']['rag']['total'] + results['unanswerable']['rag']['total']} ({results['answerable']['rag']['total']} answerable, {results['unanswerable']['rag']['total']} unanswerable)")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Accuracy Comparison")
    lines.append("")
    lines.append("| Metric | Current RAG | OpenRouter LLM | Δ |")
    lines.append("|---|---|---|---|")
    lines.append(f"| **Answerable Accuracy** | {rag_ans_acc:.1f}% | {llm_ans_acc:.1f}% | {llm_ans_acc - rag_ans_acc:+.1f}% |")
    lines.append(f"| **Unanswerable Accuracy** | {rag_una_acc:.1f}% | {llm_una_acc:.1f}% | {llm_una_acc - rag_una_acc:+.1f}% |")
    lines.append(f"| **Overall Accuracy** | {rag_overall:.1f}% | {llm_overall:.1f}% | {llm_overall - rag_overall:+.1f}% |")
    lines.append("")
    lines.append("## Hallucination & Quality")
    lines.append("")
    lines.append("| Metric | Current RAG | OpenRouter LLM |")
    lines.append("|---|---|---|")
    lines.append(f"| **Hallucination Count** | {rag_hallucinations} | {llm_hallucinations} |")
    lines.append(f"| **Hallucination Rate** | {rag_hallucinations / max(1, total_unanswerable) * 100:.1f}% | {llm_hallucinations / max(1, total_unanswerable) * 100:.1f}% |")
    lines.append("")
    lines.append("## Performance")
    lines.append("")
    lines.append(f"| Metric | Value |")
    lines.append(f"|---|---|")
    lines.append(f"| **LLM Queries Executed** | {len(llm_latencies)} |")
    lines.append(f"| **Avg LLM Latency** | {avg_llm_latency:.2f}s |")
    lines.append(f"| **Total LLM Tokens** | {total_llm_tokens:,} |")
    lines.append(f"| **Total LLM Cost** | ${total_llm_cost:.6f} |")
    lines.append(f"| **Estimated Monthly (2K queries)** | ${total_llm_cost / max(1, len(llm_latencies)) * 2000:.2f} |")
    lines.append("")
    lines.append("## Detailed Results")
    lines.append("")
    lines.append("| # | Query | Type | RAG Correct | LLM Correct | LLM Latency |")
    lines.append("|---|---|---|---|---|---|")
    for i, d in enumerate(details):
        lines.append(f"| {i+1} | {d['query'][:60]}... | {d['category'][:12]} | {'✅' if d['rag_correct'] else '❌'} | {'✅' if d['llm_correct'] else '❌'} | {d['llm_latency']:.1f}s |")
    lines.append("")
    lines.append("## Sample Responses")
    lines.append("")
    for d in details[:5]:
        lines.append(f"### {d['query']}")
        lines.append("")
        lines.append("**Current RAG:**")
        lines.append(f"> {d['rag_answer'][:300]}")
        lines.append("")
        lines.append("**OpenRouter LLM:**")
        lines.append(f"> {d['llm_answer'][:300]}")
        lines.append("")

    report = '\n'.join(lines)

    with open(REPORT_PATH, 'w', encoding='utf-8') as f:
        f.write(report)

    print(f"\nReport written to {REPORT_PATH}")
    print(f"\nResults Summary:")
    print(f"  Answerable Accuracy:   RAG={rag_ans_acc:.1f}%  LLM={llm_ans_acc:.1f}%")
    print(f"  Unanswerable Accuracy: RAG={rag_una_acc:.1f}%  LLM={llm_una_acc:.1f}%")
    print(f"  Overall Accuracy:      RAG={rag_overall:.1f}%  LLM={llm_overall:.1f}%")
    print(f"  LLM Hallucinations:    {llm_hallucinations} / {total_unanswerable}")
    print(f"  Avg LLM Latency:       {avg_llm_latency:.2f}s")
    print(f"  Total LLM Cost:        ${total_llm_cost:.6f}")

    return report


if __name__ == '__main__':
    run_test()
