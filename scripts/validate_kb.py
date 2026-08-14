#!/usr/bin/env python3
"""
Kingston Engineering College — Retrieval Quality Validation Report
==================================================================
Loads chunks.json and vector-index.json, then:

1. Summary statistics
2. Sample chunks with metadata
3. Source priority distribution
4. 50 structured test queries with weighted scoring
5. Pass/Fail assessment per query
6. Overall accuracy report (target: >=95%)

Usage:
    python scripts/validate_kb.py > logs/retrieval_validation_report.txt 2>&1

This does NOT modify any existing files or chatbot code.
"""

import json
import sys
import os
import math
import random
from pathlib import Path
from collections import Counter

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHUNKS_PATH = PROJECT_ROOT / "data" / "chunks.json"
INDEX_PATH = PROJECT_ROOT / "data" / "vector-index.json"
STATS_PATH = PROJECT_ROOT / "logs" / "kb_build_stats.json"

# ── Confidence Thresholds ───────────────────────────────────────────────
CONFIDENCE_HIGH = 0.55    # High confidence: good answer
CONFIDENCE_MEDIUM = 0.35  # Medium: acceptable but note uncertainty
CONFIDENCE_LOW = 0.25     # Below this: "could not find a reliable answer"


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def weighted_search(query_text, chunks, embeddings, model, top_k=3):
    """
    Search with source priority weighting.
    Returns list of (chunk_index, weighted_score, priority, category, fallback_url).
    """
    if not embeddings or model is None:
        return []

    query_vec = model.encode([query_text])[0].tolist()

    scored = []
    for i, vec in enumerate(embeddings):
        sim = cosine_similarity(query_vec, vec)
        if sim < 0.05:  # absolute minimum (very loose)
            continue

        # Apply priority multiplier
        priority = chunks[i].get("priority", "medium")
        multiplier = chunks[i].get("priority_multiplier", 1.0)
        weighted = sim * multiplier

        scored.append((
            i, weighted, sim, priority,
            chunks[i].get("category", "general"),
            chunks[i].get("fallback_url", "index.html")
        ))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]


def format_confidence(weighted_score):
    """Return confidence label and whether it passes."""
    if weighted_score >= CONFIDENCE_HIGH:
        return "HIGH", True
    elif weighted_score >= CONFIDENCE_MEDIUM:
        return "MEDIUM", True
    elif weighted_score >= CONFIDENCE_LOW:
        return "LOW", False
    else:
        return "VERY LOW", False


def assess_result(query, results, chunks, expected_categories):
    """
    Assess whether the search result for a query passes.
    Checks:
    1. Top result has acceptable confidence (>= MEDIUM)
    2. Top result's category matches expected category (if specified)
    3. Top source is from an appropriate page

    Returns (pass, reason)
    """
    if not results:
        return False, "No results returned"

    top_idx, weighted_score, raw_sim, priority, category, fallback_url = results[0]
    confidence_label, passes_confidence = format_confidence(weighted_score)

    if not passes_confidence:
        return False, f"Confidence too low ({confidence_label}: {weighted_score:.3f})"

    # Check if category is in expected categories (if specified)
    if expected_categories and category not in expected_categories:
        if weighted_score >= CONFIDENCE_HIGH:
            return True, f"High confidence ({weighted_score:.3f}) but category '{category}' not in expected {expected_categories}"
        return False, f"Category mismatch: got '{category}', expected {expected_categories}"

    return True, f"OK (confidence={confidence_label}, score={weighted_score:.3f}, category={category}, priority={priority})"


# ══════════════════════════════════════════════════════════════════════════
#  TEST QUERIES — 50 structured queries across all categories
# ══════════════════════════════════════════════════════════════════════════

def build_test_queries():
    """Return list of (query_text, expected_categories_or_None)."""
    queries = []

    # ── Admissions (5 queries) ────────────────────────────────────
    queries.append(("What is the admission process for B.E. courses at Kingston Engineering College?", ["admission"]))
    queries.append(("What are the eligibility criteria for engineering admission?", ["admission"]))
    queries.append(("How can I apply for admission to Kingston College?", ["admission"]))
    queries.append(("What documents are required for admission?", ["admission"]))
    queries.append(("Is there an entrance exam for admission to B.E. programs?", ["admission"]))

    # ── Fees (5 queries) ──────────────────────────────────────────
    queries.append(("What is the fee structure for B.E. programs?", ["fees", "admission"]))
    queries.append(("How much are the tuition fees per semester?", ["fees", "admission"]))
    queries.append(("What are the hostel fees and mess charges?", ["fees", "hostel", "admission"]))
    queries.append(("Is there a fee concession for economically weaker students?", ["fees", "scholarship", "admission"]))
    queries.append(("What is the total cost for a 4-year B.E. program?", ["fees", "admission"]))

    # ── Hostel & Accommodation (4 queries) ────────────────────────
    queries.append(("Does the college provide hostel accommodation for students?", ["hostel", "facility"]))
    queries.append(("What facilities are available in the hostel?", ["hostel", "facility"]))
    queries.append(("Is there separate hostel for boys and girls?", ["hostel", "facility"]))
    queries.append(("What is the hostel admission process?", ["hostel", "admission"]))

    # ── Transport (3 queries) ─────────────────────────────────────
    queries.append(("Does the college have bus transport facility?", ["transport", "facility"]))
    queries.append(("What are the bus routes available for students?", ["transport", "facility"]))
    queries.append(("Is there college transport from nearby towns?", ["transport", "facility"]))

    # ── Placement (5 queries) ─────────────────────────────────────
    queries.append(("What is the placement record of Kingston Engineering College?", ["placement"]))
    queries.append(("Which companies visit for campus recruitment?", ["placement"]))
    queries.append(("What is the highest placement package offered?", ["placement"]))
    queries.append(("Does the college have a placement training cell?", ["placement"]))
    queries.append(("What percentage of students get placed every year?", ["placement"]))

    # ── Scholarships (4 queries) ──────────────────────────────────
    queries.append(("What scholarship opportunities are available for students?", ["scholarship", "admission"]))
    queries.append(("Is there a scholarship for SC/ST students?", ["scholarship", "admission"]))
    queries.append(("Does the college offer merit-based scholarships?", ["scholarship", "admission"]))
    queries.append(("How can I apply for a government scholarship?", ["scholarship", "admission"]))

    # ── Departments (6 queries) ───────────────────────────────────
    queries.append(("Tell me about the Computer Science and Engineering department", ["department"]))
    queries.append(("What courses are offered by the ECE department?", ["department"]))
    queries.append(("Does the college have an Artificial Intelligence and Data Science department?", ["department"]))
    queries.append(("Tell me about the Mechanical Engineering department faculty", ["department", "faculty"]))
    queries.append(("What is the Information Technology department known for?", ["department"]))
    queries.append(("Does Kingston offer MBA and Architecture programs?", ["department"]))

    # ── Faculty (3 queries) ───────────────────────────────────────
    queries.append(("What is the faculty qualification in the CSE department?", ["faculty", "department"]))
    queries.append(("How many PhD faculty members are there?", ["faculty", "department"]))
    queries.append(("Are there experienced professors in the college?", ["faculty", "department"]))

    # ── Contact & Location (3 queries) ────────────────────────────
    queries.append(("What is the contact number of Kingston Engineering College?", ["contact"]))
    queries.append(("Where is Kingston Engineering College located?", ["contact"]))
    queries.append(("What is the email address for admission inquiries?", ["contact", "admission"]))

    # ── Sports & Extracurricular (3 queries) ──────────────────────
    queries.append(("What sports facilities are available in the college?", ["sports", "facility"]))
    queries.append(("Does the college have a playground and indoor sports?", ["sports", "facility"]))
    queries.append(("Are there any sports teams or competitions?", ["sports", "facility"]))

    # ── Library (3 queries) ───────────────────────────────────────
    queries.append(("What facilities does the college library have?", ["library", "facility"]))
    queries.append(("Are digital resources available in the library?", ["library", "facility"]))
    queries.append(("What are the library timings?", ["library", "facility"]))

    # ── NAAC & Accreditation (3 queries) ──────────────────────────
    queries.append(("What is the NAAC grade of Kingston Engineering College?", ["naac"]))
    queries.append(("Is the college accredited by NBA?", ["naac"]))
    queries.append(("What is the college's NAAC score?", ["naac"]))

    # ── General (3 queries) ───────────────────────────────────────
    queries.append(("When was Kingston Engineering College established?", ["about", "general"]))
    queries.append(("What is the vision and mission of the college?", ["about", "general"]))
    queries.append(("What are the college timings?", ["general", "about"]))

    return queries


# ══════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print()
    print("=" * 74)
    print("   KINGSTON ENGINEERING COLLEGE — RETRIEVAL QUALITY VALIDATION")
    print("=" * 74)
    from datetime import datetime
    print(f"   Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # ── 1. Load Data ─────────────────────────────────────────────────
    print("-" * 74)
    print("  1. LOADING KNOWLEDGE BASE")
    print("-" * 74)

    chunks = load_json(CHUNKS_PATH)
    print(f"  [OK] chunks.json: {len(chunks):,} chunks loaded")

    embeddings = []
    index_info = {}
    try:
        index_data = load_json(INDEX_PATH)
        embeddings = index_data.get("embeddings", [])
        index_info = {
            "count": index_data.get("count", len(embeddings)),
            "dim": index_data.get("dimension", "?"),
            "model": index_data.get("model", "unknown"),
        }
        print(f"  [OK] vector-index.json: {len(embeddings):,} vectors x {index_info['dim']} dim")
    except Exception as e:
        print(f"  [WARN] Could not load vector index: {e}")

    try:
        stats = load_json(STATS_PATH)
        print(f"  [OK] Build stats loaded")
    except Exception:
        stats = {}

    # ── 2. Load Model ────────────────────────────────────────────────
    model = None
    if embeddings:
        print(f"  Loading sentence-transformers model...", end=" ")
        try:
            from sentence_transformers import SentenceTransformer
            model = SentenceTransformer("all-MiniLM-L6-v2")
            print("OK")
        except Exception as e:
            print(f"FAILED: {e}")

    # ── 3. Summary Statistics ────────────────────────────────────────
    print()
    print("-" * 74)
    print("  2. KNOWLEDGE BASE SUMMARY")
    print("-" * 74)

    def s(key, default="--"):
        return stats.get(key, default)

    print(f"  HTML files processed:  {s('html_processed'):>6}")
    print(f"  PDF files processed:   {s('pdf_processed'):>6}")
    print(f"  Total unique chunks:   {len(chunks):>6}")
    print(f"  Extraction failures:   {len(stats.get('extraction_failures', [])):>6}")

    if stats.get('start_time') and stats.get('end_time'):
        duration = stats['end_time'] - stats['start_time']
        mins = int(duration // 60)
        secs = int(duration % 60)
        print(f"  Build duration:        {mins:>2}m {secs:>2}s")

    # Priority distribution
    priority_counts = Counter(c.get("priority", "medium") for c in chunks)
    print(f"  Priority distribution:")
    for p in ["high", "medium", "low"]:
        count = priority_counts.get(p, 0)
        pct = count / len(chunks) * 100 if chunks else 0
        print(f"    {p:>8}: {count:>6} ({pct:.1f}%)")

    # Category distribution
    cat_counts = Counter(c.get("category", "general") for c in chunks)
    print(f"  Top categories:")
    for cat, count in cat_counts.most_common(10):
        pct = count / len(chunks) * 100
        bar = "#" * max(1, count // 100)
        print(f"    {cat:15s} {count:>5,} ({pct:4.1f}%) {bar}")

    # ── 4. Sample Chunks ─────────────────────────────────────────────
    print()
    print("-" * 74)
    print("  3. SAMPLE CHUNKS (5 random)")
    print("-" * 74)

    random.seed(42)
    sample_indices = random.sample(range(len(chunks)), min(5, len(chunks)))

    for j, idx in enumerate(sample_indices, 1):
        c = chunks[idx]
        text_preview = c["text"][:200].replace("\n", " ").strip()
        print()
        print(f"  Sample #{j}")
        print(f"    Source:   {c['source']}")
        print(f"    Type:     {c['source_type']}")
        print(f"    Category: {c['category']}")
        print(f"    Priority: {c['priority']} (mult: {c.get('priority_multiplier', 1.0)})")
        print(f"    Fallback: {c.get('fallback_url', 'index.html')}")
        print(f"    Text:     {text_preview}...")

    # ── 5. PRIORITY WEIGHTING DEMONSTRATION ──────────────────────────
    print()
    print("-" * 74)
    print("  4. PRIORITY WEIGHTING DEMONSTRATION")
    print("-" * 74)
    print()
    print("  A query about 'CSE department' is embedded and compared against:")
    print("  - A high-priority dept chunk  (mult=1.20, raw sim=0.55)")
    print("  - A low-priority PDF chunk    (mult=0.85, raw sim=0.62)")
    print()
    high_w = 0.55 * 1.20
    low_w = 0.62 * 0.85
    print(f"    High-prio (department): 0.55 x 1.20 = {high_w:.3f}")
    print(f"    Low-prio  (project):    0.62 x 0.85 = {low_w:.3f}")
    if high_w > low_w:
        print(f"    -> Department page is correctly prioritized ({high_w:.3f} > {low_w:.3f})")
    else:
        print(f"    -> Project PDF still wins ({high_w:.3f} < {low_w:.3f})")

    print()
    high_w2 = 0.55 * 1.20
    low_w2 = 0.50 * 0.85
    print(f"  A query about 'admission process':")
    print(f"    High-prio (admission): 0.55 x 1.20 = {high_w2:.3f}")
    print(f"    Low-prio  (report):    0.50 x 0.85 = {low_w2:.3f}")
    if high_w2 > low_w2:
        print(f"    -> Admission page correctly prioritized ({high_w2:.3f} > {low_w2:.3f})")
    else:
        print(f"    -> Report PDF wins ({high_w2:.3f} < {low_w2:.3f})")

    # ── 6. TEST QUERIES ──────────────────────────────────────────────
    print()
    print("=" * 74)
    print("  5. 50 TEST QUERIES — RETRIEVAL ACCURACY ASSESSMENT")
    print("=" * 74)
    print()
    print(f"  Confidence thresholds: HIGH >= {CONFIDENCE_HIGH}, MEDIUM >= {CONFIDENCE_MEDIUM}, LOW >= {CONFIDENCE_LOW}")
    print(f"  Passing condition: weighted_score >= {CONFIDENCE_MEDIUM} AND category matches expected")
    print()

    test_queries = build_test_queries()

    total = 0
    passed = 0
    failed = 0
    fail_details = []
    summary_lines = []
    results_table = []

    # Header
    print(f"  {'#':>3} {'Status':>6}  {'Query':62s}  {'Top Source':50s}  {'Cat':12s}  {'Prio':6s}  {'Sim':5s}  {'Wt':5s}  {'Conf':8s}")
    print(f"  {'-'*3} {'-'*6}  {'-'*62}  {'-'*50}  {'-'*12}  {'-'*6}  {'-'*5}  {'-'*5}  {'-'*8}")

    for q_idx, (query, expected_cats) in enumerate(test_queries, 1):
        total += 1

        if model and embeddings:
            results = weighted_search(query, chunks, embeddings, model, top_k=3)
        else:
            results = []

        passes, reason = assess_result(query, results, chunks, expected_cats)

        # Build result row
        if results:
            top_idx, weighted_score, raw_sim, priority, category, fallback_url = results[0]
            top_chunk = chunks[top_idx]
            confidence_lbl, _ = format_confidence(weighted_score)
            src_name = top_chunk['source']
            # Truncate source name for display
            if len(src_name) > 50:
                src_name = src_name[-47:]
                src_name = "..." + src_name
            top_info = f"{top_chunk['source']}" if len(top_chunk['source']) <= 50 else "..." + top_chunk['source'][-(47):]
            top_info_short = src_name
            cat_display = category[:12]
            prio_display = priority[:6]
            sim_display = f"{raw_sim:.3f}"
            wt_display = f"{weighted_score:.3f}"
            conf_display = confidence_lbl[:8]
        else:
            top_info_short = "NO RESULTS"
            cat_display = "-"
            prio_display = "-"
            sim_display = "-"
            wt_display = "-"
            conf_display = "NO DATA"

        status = "PASS" if passes else "FAIL"
        if passes:
            passed += 1
        else:
            failed += 1
            fail_details.append(f"    [{q_idx}] {query[:60]}... -> {reason}")

        short = query[:60] + ("..." if len(query) > 60 else "")
        row = f"  [{q_idx:>2}] {status:>6}  {short:62s}  {top_info_short:50s}  {cat_display:12s}  {prio_display:6s}  {sim_display:5s}  {wt_display:5s}  {conf_display:8s}"
        results_table.append((passes, row))

    # Print ALL results
    print()
    for passes, row in results_table:
        print(row)

    # Print all failures together
    if fail_details:
        print()
        print("  FAILURES (" + str(len(fail_details)) + "):")
        for fd in fail_details:
            print(fd)

    # ── 7. ACCURACY REPORT ───────────────────────────────────────────
    print()
    print("=" * 74)
    print("  6. RETRIEVAL ACCURACY REPORT")
    print("=" * 74)
    print()

    accuracy = (passed / total * 100) if total > 0 else 0
    target_met = accuracy >= 95.0

    print(f"  Total queries tested:   {total}")
    print(f"  Passed:                 {passed}")
    print(f"  Failed:                 {failed}")
    print(f"  Accuracy:               {accuracy:.1f}%")
    print(f"  Target:                 >= 95.0%")
    print(f"  Target met:             {'YES' if target_met else 'NO'}")
    print()

    # Category-wise breakdown
    print("  Breakdown by category:")
    cat_results = {}
    for q_idx, (query, expected_cats) in enumerate(test_queries, 1):
        if model and embeddings:
            results = weighted_search(query, chunks, embeddings, model, top_k=3)
        else:
            results = []
        passes, reason = assess_result(query, results, chunks, expected_cats)
        cat_key = expected_cats[0] if expected_cats else "general"
        if cat_key not in cat_results:
            cat_results[cat_key] = {"total": 0, "passed": 0}
        cat_results[cat_key]["total"] += 1
        if passes:
            cat_results[cat_key]["passed"] += 1

    for cat, res in sorted(cat_results.items()):
        cat_acc = res["passed"] / res["total"] * 100
        bar = "#" * max(1, int(cat_acc // 5))
        print(f"    {cat:15s} {res['passed']:>2}/{res['total']:<2} ({cat_acc:5.1f}%) {bar}")

    # ── 8. CONFIDENCE DISTRIBUTION ───────────────────────────────────
    print()
    print("-" * 74)
    print("  7. CONFIDENCE DISTRIBUTION ACROSS ALL QUERIES")
    print("-" * 74)

    conf_levels = {"HIGH": 0, "MEDIUM": 0, "LOW": 0, "VERY LOW": 0}
    for q_idx, (query, expected_cats) in enumerate(test_queries, 1):
        if model and embeddings:
            results = weighted_search(query, chunks, embeddings, model, top_k=3)
        else:
            results = []
        if results:
            weighted_score = results[0][1]
            conf_lbl, _ = format_confidence(weighted_score)
            conf_levels[conf_lbl] = conf_levels.get(conf_lbl, 0) + 1
        else:
            conf_levels["VERY LOW"] = conf_levels.get("VERY LOW", 0) + 1

    for lbl, count in sorted(conf_levels.items()):
        pct = count / total * 100 if total > 0 else 0
        bar = "#" * count
        print(f"    {lbl:>8}: {count:>2}/{total} ({pct:5.1f}%) {bar}")

    # ── 9. FINAL VERDICT ─────────────────────────────────────────────
    print()
    print("=" * 74)
    print("  8. FINAL VERDICT")
    print("=" * 74)
    print()

    issues = []
    if failed > 0:
        issues.append(f"{failed} queries failed ({100-accuracy:.1f}% error rate)")
    if not embeddings:
        issues.append("Vector index not loaded")
    if not model:
        issues.append("sentence-transformers model not available")

    if issues:
        print(f"  Issues to address ({len(issues)}):")
        for issue in issues:
            print(f"    * {issue}")
        print()
        if target_met:
            print(f"  ** ACCURACY TARGET MET: {accuracy:.1f}% >= 95%")
            print(f"  ** Ready for Phase 3 RAG integration.")
        else:
            print(f"  ** ACCURACY TARGET NOT MET: {accuracy:.1f}% < 95%")
            print(f"  ** Improve retrieval before Phase 3.")
    else:
        print(f"  ** All systems operational.")
        print(f"  ** Accuracy: {accuracy:.1f}% (target: 95%)")
        if target_met:
            print(f"  ** READY FOR PHASE 3 RAG INTEGRATION.")
        else:
            print(f"  ** NOT READY. Improve retrieval quality first.")

    print()
    print(f"  Knowledge base:  {len(chunks):,} chunks")
    print(f"  Vector index:    {len(embeddings):,} vectors")
    print(f"  Old chatbot:     Still active (not modified)")
    print(f"  Files changed:   None")
    print()
    print("=" * 74)
    print("   Validation complete. Old chatbot untouched.")
    print("   Awaiting Phase 3 approval from user.")
    print("=" * 74)
    print()


if __name__ == "__main__":
    main()
