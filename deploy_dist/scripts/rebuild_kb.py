#!/usr/bin/env python3
"""
Kingston Engineering College – Knowledge Base Builder
=====================================================
Phases 1 & 2: HTML/PDF Ingestion → Chunking → Embeddings → Vector Index
              + Source Priority Classification

Usage:
    python scripts/rebuild_kb.py

Output:
    data/chunks.json         — All text chunks with metadata (incl. category & priority)
    data/vector-index.json   — 384-dim float32 embeddings for each chunk

This does NOT modify any existing HTML, PDF, or chatbot files.
The old chatbot remains the active assistant until Phase 3 is approved.
"""

import os
import re
import json
import hashlib
import logging
import sys
import time
from pathlib import Path

# ── Logging ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/kb_build.log", mode="w", encoding="utf-8"),
    ],
)
log = logging.getLogger("rebuild_kb")

# ── Configuration ────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXCLUDE_DIRS = {"tmp", ".git", "node_modules", "my_env", "graphify", "__pycache__"}
EXCLUDE_PREFIXES = {".", "_"}  # hidden dirs

HTML_GLOB = "**/*.html"
PDF_GLOB = "**/*.pdf"

CHUNK_SIZE = 384      # target characters per chunk
CHUNK_OVERLAP = 64    # overlap between consecutive chunks

OUTPUT_CHUNKS = PROJECT_ROOT / "data" / "chunks.json"
OUTPUT_INDEX = PROJECT_ROOT / "data" / "vector-index.json"

# ── Boilerplate selectors (content to REMOVE from HTML) ─────────────────
BOILERPLATE_SELECTORS = [
    "script", "style", "nav", "footer",
    ".main-header", ".main-footer", ".top-bar", ".logo-bar",
    ".notice-bar", ".main-nav", ".nav-links", ".dropdown",
    ".floating-side-buttons", ".floating-circle-buttons",
    ".mobile-sticky-cta", ".ai-widget", "#ai-widget-container",
    ".back-to-top-btn", ".breadcrumb", ".ph-breadcrumb",
    ".premium-hero", ".ph-wave",
]

# ── Source Priority Classification ─────────────────────────────────────
# Priority multipliers applied to similarity scores during retrieval
PRIORITY_MULTIPLIERS = {
    "high": 1.20,
    "medium": 1.00,
    "low": 0.85,
}

# Category → fallback URL mapping for "For more information, visit:"
CATEGORY_URLS = {
    "admission":    "admission.html",
    "department":   "departments.html",
    "placement":    "placements/placement_pat.html",
    "hostel":       "facilities.html",
    "transport":    "facilities.html",
    "fees":         "admission.html",
    "scholarship":  "admission.html",
    "contact":      "contact.html",
    "faculty":      "departments.html",
    "about":        "about.html",
    "facility":     "facilities.html",
    "academics":    "academics.html",
    "library":      "facilities/facilities_library.html",
    "sports":       "facilities/facilities_infrastructure.html",
    "naac":         "naac/naac_ssr.html",
    "iqac":         "iqac/iqac_about.html",
    "ugc":          "ugc/ugc_mandatory_committee.html",
    "policy":       "policies.html",
    "research":     "about/about_mou.html",
    "project":      "departments.html",
    "patent":       "about/about_mou.html",
    "report":       "about.html",
    "alumni":       "alumni.html",
    "event":        "facilities/facilities_event_gallery.html",
    "news":         "news.html",
    "blog":         "blog.html",
    "faq":          "faq.html",
    "achievement":  "achievements.html",
    "career":       "careers.html",
    "grievance":    "grievance_helpdesk.html",
    "general":      "index.html",
    "disclosure":   "public_self_disclosure.html",
    "portal":       "index.html",
    "testimonial":  "testimonials.html",
    "campus":       "campus_tour.html",
    "committee":    "ugc/ugc_mandatory_committee.html",
    "chatbot":      "ai-assistant.html",
    "coe":          "coe.html",
}

# Default for any unknown category
CATEGORY_URLS["_default"] = "index.html"

# ── Statistics ───────────────────────────────────────────────────────────
stats = {
    "html_scanned": 0,
    "html_processed": 0,
    "html_skipped": 0,
    "pdf_scanned": 0,
    "pdf_processed": 0,
    "pdf_skipped": 0,
    "extraction_failures": [],
    "total_chunks": 0,
    "chunks_from_html": 0,
    "chunks_from_pdf": 0,
    "start_time": None,
    "end_time": None,
}


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE CLASSIFICATION
# ══════════════════════════════════════════════════════════════════════════

def classify_html_source(rel_path: str):
    """
    Classify an HTML file by its relative path.
    Returns (category, priority_level).
    """
    path = rel_path.replace("\\", "/")
    fname = path.split("/")[-1].lower()
    dirs = path.split("/")

    # ── Root-level pages ────────────────────────────────────────
    # Admission
    if fname == "admission.html":
        return "admission", "high"
    if fname == "admission_enquiry.html":
        return "admission", "medium"

    # Department pages
    if fname.startswith("dept_") or fname.startswith("dept-"):
        return "department", "high"
    if len(dirs) >= 2 and dirs[0] == "departments":
        return "department", "high"

    # Placement pages
    if len(dirs) >= 2 and dirs[0] == "placements":
        return "placement", "high"

    # Contact
    if fname == "contact.html":
        return "contact", "high"

    # Facilities
    if fname == "facilities.html":
        return "facility", "high"
    if len(dirs) >= 2 and dirs[0] == "facilities":
        return "facility", "high"

    # Academics
    if fname == "academics.html":
        return "academics", "high"
    if fname == "coe.html":
        return "coe", "medium"

    # About pages
    if fname == "about.html":
        return "about", "high"
    if len(dirs) >= 2 and dirs[0] == "about":
        return "about", "high"

    # ── Medium priority ─────────────────────────────────────────
    if fname == "policies.html":
        return "policy", "medium"
    if fname == "faq.html":
        return "faq", "medium"
    if fname == "careers.html":
        return "career", "medium"
    if fname == "public_self_disclosure.html":
        return "disclosure", "medium"
    if fname == "grievance_helpdesk.html":
        return "grievance", "medium"
    if fname == "staff-login.html" or fname == "student-login.html":
        return "portal", "medium"
    if fname == "alumni.html":
        return "alumni", "medium"
    if len(dirs) >= 2 and dirs[0] == "alumni":
        return "alumni", "medium"

    # NAAC / IQAC / UGC
    if len(dirs) >= 2 and dirs[0] == "naac":
        return "naac", "medium"
    if len(dirs) >= 2 and dirs[0] == "iqac":
        return "iqac", "medium"
    if len(dirs) >= 2 and dirs[0] == "ugc":
        return "ugc", "medium"

    # ── Low priority ────────────────────────────────────────────
    if fname == "index.html":
        return "general", "medium"
    if fname.startswith("achievement"):
        return "achievement", "low"
    if fname == "news.html":
        return "news", "low"
    if fname == "blog.html":
        return "blog", "low"
    if fname == "facilities/facilities_event_gallery.html" or fname == "event-detail.html":
        return "event", "low"
    if fname == "testimonials.html":
        return "testimonial", "low"
    if "campus" in fname:
        return "campus", "low"
    if fname == "sitemap.html" or fname == "404.html":
        return "general", "low"
    if fname == "ai-assistant.html":
        return "chatbot", "low"
    if fname == "privacy_policy.html":
        return "policy", "low"
    if fname == "faculty-profile.html":
        return "faculty", "low"

    # Default fallback
    return "general", "medium"


def classify_pdf_source(rel_path: str):
    """
    Classify a PDF file by its relative path.
    Returns (category, priority_level).
    """
    path = rel_path.replace("\\", "/")
    fname = path.split("/")[-1].lower()
    dirs = path.split("/")

    # Determine subdirectory under assets/pdfs/ or wherever the PDF lives
    subdir = ""
    for i, d in enumerate(dirs):
        if d == "pdfs" and i + 1 < len(dirs):
            subdir = dirs[i + 1].lower()
            break
        if d == "assets" and i + 2 < len(dirs):
            subdir = dirs[i + 2].lower()
            break

    fname_lower = fname.lower()

    # ── FILENAME CONTENT HEURISTICS (checked FIRST, override folder) ──
    # These override the folder-based classification because the filename
    # is a more specific signal of what the document actually contains.
    # E.g. a "SCHOLARSHIP POLICY.pdf" in a naac folder is still about scholarships.
    if "scholarship" in fname_lower:
        return "scholarship", "high"
    if "hostel" in fname_lower:
        return "hostel", "high"
    if "library" in fname_lower:
        return "library", "medium"
    if "syllabus" in fname_lower or "curriculum" in fname_lower:
        return "academics", "medium"
    if "bus" in fname_lower or "transport" in fname_lower:
        return "transport", "high"

    # ── SUBDIRECTORY-BASED CLASSIFICATION ───────────────────────
    # High priority folders
    if subdir == "departments" or subdir == "department":
        return "department", "high"
    if subdir == "admission":
        return "admission", "high"
    if subdir == "placement" or subdir == "placement-reports":
        return "placement", "high"
    if subdir == "facilities":
        return "facility", "high"

    # Medium priority folders
    if subdir == "policies":
        return "policy", "medium"
    if subdir == "naac":
        return "naac", "medium"
    if subdir == "iqac":
        return "iqac", "medium"
    if subdir == "academics-pdf" or subdir == "academics":
        return "academics", "medium"
    if "ugc" in subdir and subdir not in ("ugc_mc", "ugc_undertaking"):
        return "ugc", "medium"
    if subdir == "research-initiatives":
        return "research", "medium"

    # Low priority folders
    if subdir == "research":
        return "research", "low"
    if subdir == "sports":
        return "sports", "low"
    if subdir == "committees":
        return "committee", "low"
    if subdir == "faculty":
        return "faculty", "low"
    if subdir == "alumni":
        return "alumni", "low"
    if subdir == "ugc_mc" or subdir == "ugc_undertaking":
        return "ugc", "low"

    # ── FALLBACK: filename heuristics (after folder check) ──────────
    if "admission" in fname_lower or "fee" in fname_lower:
        return "admission", "medium"
    if "placement" in fname_lower:
        return "placement", "medium"
    if "naac" in fname_lower:
        return "naac", "medium"
    if "report" in fname_lower:
        return "report", "low"
    if "research" in fname_lower or "journal" in fname_lower or "paper" in fname_lower:
        return "research", "low"
    if "patent" in fname_lower:
        return "patent", "low"
    if "project" in fname_lower or "mini" in fname_lower:
        return "project", "low"
    if "policy" in fname_lower:
        return "policy", "medium"
    if "sport" in fname_lower:
        return "sports", "low"
    if "facult" in fname_lower or "staff" in fname_lower:
        return "faculty", "medium"

    return "general", "low"


def get_fallback_url(category: str) -> str:
    """Get the recommended fallback URL for a category."""
    return CATEGORY_URLS.get(category, CATEGORY_URLS["_default"])


# ══════════════════════════════════════════════════════════════════════════
#  HTML INGESTION
# ══════════════════════════════════════════════════════════════════════════

def is_excluded(path: Path) -> bool:
    """Check if path is excluded (inside tmp/, .git/, hidden dirs, etc.)"""
    parts = path.relative_to(PROJECT_ROOT).parts
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
        if part.startswith("."):
            return True
    return False


def extract_html_content(filepath: Path) -> str:
    """Extract meaningful text from an HTML file, stripping boilerplate."""
    try:
        from bs4 import BeautifulSoup

        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            html = f.read()

        soup = BeautifulSoup(html, "lxml")

        # Remove boilerplate elements
        for selector in BOILERPLATE_SELECTORS:
            for tag in soup.select(selector):
                tag.decompose()

        # Remove comments
        for comment in soup.find_all(string=lambda s: isinstance(s, str) and "<!--" in s):
            comment.extract()

        # Try to get meaningful content containers first
        content = None
        for container in [
            "main", "article", ".content", ".main-content",
            ".page-content", ".container", ".section",
        ]:
            el = soup.select_one(container)
            if el:
                content = el.get_text(separator=" ", strip=True)
                break

        # Fallback to body
        if not content and soup.body:
            content = soup.body.get_text(separator=" ", strip=True)

        if not content:
            return ""

        # Clean whitespace
        content = re.sub(r"\s+", " ", content).strip()
        return content

    except Exception as e:
        log.warning(f"  \u26a0 Failed to extract HTML content: {e}")
        return ""


def scan_html_files():
    """Walk all HTML files, extract content, collect metadata."""
    log.info("=" * 60)
    log.info("PHASE 1a: Scanning HTML files")
    log.info("=" * 60)

    html_files = []
    for f in PROJECT_ROOT.glob(HTML_GLOB):
        if not is_excluded(f):
            html_files.append(f)

    stats["html_scanned"] = len(html_files)
    log.info(f"Found {len(html_files)} HTML files to process")

    skip_patterns = [
        "sitemap.xml", "sitemap.html", "404.html",
        "robots.txt",
    ]

    results = []
    for i, fp in enumerate(html_files):
        rel = fp.relative_to(PROJECT_ROOT)
        url = str(rel).replace("\\", "/")

        if url in skip_patterns:
            stats["html_skipped"] += 1
            continue

        # Determine page title from filename
        stem = fp.stem
        title = stem.replace("_", " ").replace("-", " ").title()

        # Classify source
        category, priority = classify_html_source(str(rel))

        if i % 50 == 0:
            log.info(f"  [{i}/{len(html_files)}] Processing...")

        text = extract_html_content(fp)

        if len(text) < 20:
            stats["html_skipped"] += 1
            continue

        # Create hash for dedup
        content_hash = hashlib.md5(text.encode()).hexdigest()

        results.append({
            "source": url,
            "source_type": "html",
            "title": title,
            "category": category,
            "priority": priority,
            "fallback_url": get_fallback_url(category),
            "text": text,
            "hash": content_hash,
        })
        stats["html_processed"] += 1

    log.info(f"HTML processing complete: {stats['html_processed']} pages extracted")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  PDF INGESTION
# ══════════════════════════════════════════════════════════════════════════

def extract_pdf_text(filepath: Path) -> str:
    """Extract text from a PDF file using PyMuPDF."""
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(filepath)
        text_parts = []
        for page in doc:
            page_text = page.get_text()
            if page_text.strip():
                text_parts.append(page_text)
        doc.close()

        full_text = "\n".join(text_parts)
        full_text = re.sub(r"\s+", " ", full_text).strip()
        return full_text

    except Exception as e:
        stats["extraction_failures"].append({
            "file": str(filepath.relative_to(PROJECT_ROOT)),
            "error": str(e),
        })
        return ""


def scan_pdf_files():
    """Walk all PDF files, extract text, collect metadata."""
    log.info("=" * 60)
    log.info("PHASE 1b: Scanning PDF files")
    log.info("=" * 60)

    pdf_files = []
    for f in PROJECT_ROOT.glob(PDF_GLOB):
        if not is_excluded(f):
            pdf_files.append(f)

    stats["pdf_scanned"] = len(pdf_files)
    log.info(f"Found {len(pdf_files)} PDF files to process")

    MAX_PDF_SIZE = 50 * 1024 * 1024

    results = []
    for i, fp in enumerate(pdf_files):
        rel = fp.relative_to(PROJECT_ROOT)
        size = fp.stat().st_size

        if size > MAX_PDF_SIZE:
            log.warning(f"  \u26a0 Skipping large PDF ({size//1024//1024}MB): {rel}")
            stats["pdf_skipped"] += 1
            continue

        if size < 100:
            stats["pdf_skipped"] += 1
            continue

        stem = fp.stem
        title = stem.replace("_", " ").replace("-", " ").title()

        # Classify source
        category, priority = classify_pdf_source(str(rel))
        url = str(rel).replace("\\", "/")

        if i % 100 == 0:
            log.info(f"  [{i}/{len(pdf_files)}] Processing...")

        text = extract_pdf_text(fp)

        if len(text) < 20:
            log.warning(f"  \u26a0 PDF yielded <20 chars (likely scanned/image): {rel}")
            stats["extraction_failures"].append({
                "file": str(rel),
                "error": "Extracted <20 chars - likely scanned/image PDF"
            })
            stats["pdf_skipped"] += 1
            continue

        content_hash = hashlib.md5(text.encode()).hexdigest()

        results.append({
            "source": url,
            "source_type": "pdf",
            "title": title,
            "category": category,
            "priority": priority,
            "fallback_url": get_fallback_url(category),
            "text": text,
            "hash": content_hash,
        })
        stats["pdf_processed"] += 1

    log.info(f"PDF processing complete: {stats['pdf_processed']} files extracted")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  CHUNKING
# ══════════════════════════════════════════════════════════════════════════

def chunk_text(text: str, source: str, title: str, category: str,
               priority: str, source_type: str, fallback_url: str) -> list:
    """
    Split text into overlapping chunks of ~CHUNK_SIZE characters.
    Tries to break at paragraph or sentence boundaries.
    """
    if not text:
        return []

    # Try to split by paragraphs first (double newline or similar)
    paragraphs = re.split(r"\n\s*\n", text)

    # If no paragraph breaks, split by sentences
    if len(paragraphs) <= 1:
        paragraphs = re.split(r"(?<=[.!?])\s+", text)

    # If still too few, split by fixed chunks
    if len(paragraphs) <= 1:
        return _fixed_chunk(text, source, title, category, priority,
                           source_type, fallback_url)

    chunks = []
    current_chunk = ""
    chunk_index = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if len(current_chunk) + len(para) < CHUNK_SIZE:
            current_chunk += (" " + para if current_chunk else para)
        else:
            if current_chunk:
                chunks.append(_make_chunk(
                    current_chunk, source, title, category, priority,
                    source_type, fallback_url, chunk_index
                ))
                chunk_index += 1
                overlap = _get_overlap_tail(current_chunk, CHUNK_OVERLAP) \
                    if len(current_chunk) > CHUNK_OVERLAP else ""
                current_chunk = overlap + " " + para if overlap else para

    if current_chunk:
        chunks.append(_make_chunk(
            current_chunk, source, title, category, priority,
            source_type, fallback_url, chunk_index
        ))

    return chunks


def _make_chunk(text, source, title, category, priority,
                source_type, fallback_url, chunk_index):
    """Create a chunk dict with all metadata fields."""
    return {
        "text": text,
        "source": source,
        "source_type": source_type,
        "title": title,
        "category": category,
        "priority": priority,
        "priority_multiplier": PRIORITY_MULTIPLIERS.get(priority, 1.0),
        "fallback_url": fallback_url,
        "chunk_index": chunk_index,
    }


def _fixed_chunk(text: str, source: str, title: str, category: str,
                 priority: str, source_type: str, fallback_url: str) -> list:
    """Fallback: split text into fixed-size chunks."""
    chunks = []
    for i in range(0, len(text), CHUNK_SIZE - CHUNK_OVERLAP):
        chunk_text = text[i:i + CHUNK_SIZE]
        if len(chunk_text) < 20:
            continue
        chunks.append(_make_chunk(
            chunk_text, source, title, category, priority,
            source_type, fallback_url, len(chunks)
        ))
    return chunks


def _get_overlap_tail(text: str, overlap_chars: int) -> str:
    """Get the last ~overlap_chars characters, breaking at word boundary."""
    if len(text) <= overlap_chars:
        return text
    tail = text[-overlap_chars:]
    midpoint = len(tail) // 2
    space_pos = tail.find(" ", midpoint)
    if space_pos != -1:
        return tail[space_pos + 1:]
    return tail


# ══════════════════════════════════════════════════════════════════════════
#  EMBEDDING
# ══════════════════════════════════════════════════════════════════════════

def generate_embeddings(chunks: list):
    """
    Phase 2: Generate embeddings for all chunks using sentence-transformers.
    """
    log.info("=" * 60)
    log.info("PHASE 2: Generating embeddings")
    log.info("=" * 60)

    try:
        from sentence_transformers import SentenceTransformer
        import numpy as np

        log.info("Loading model: all-MiniLM-L6-v2...")
        model = SentenceTransformer("all-MiniLM-L6-v2")
        log.info("Model loaded successfully.")

        texts = [chunk["text"] for chunk in chunks]
        log.info(f"Embedding {len(texts)} chunks...")

        batch_size = 64
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            embeddings = model.encode(batch, show_progress_bar=False)
            all_embeddings.extend(embeddings.tolist())

            if (i + batch_size) % 256 == 0 or i + batch_size >= len(texts):
                log.info(f"  Embedded {min(i + batch_size, len(texts))}/{len(texts)} chunks")

        log.info(f"Embedding complete: {len(all_embeddings)} vectors generated")

        log.info("Saving vector index...")

        vector_data = {
            "model": "all-MiniLM-L6-v2",
            "dimension": 384,
            "count": len(all_embeddings),
            "embeddings": all_embeddings,
        }

        return vector_data

    except Exception as e:
        log.error(f"Embedding generation failed: {e}")
        import traceback
        traceback.print_exc()
        return None


# ══════════════════════════════════════════════════════════════════════════
#  MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════════

def main():
    stats["start_time"] = time.time()
    log.info("=" * 60)
    log.info("Kingston Engineering College \u2014 Knowledge Base Builder")
    log.info("(with Source Priority Classification)")
    log.info("=" * 60)
    log.info(f"Project root: {PROJECT_ROOT}")
    log.info(f"Excluding: {', '.join(sorted(EXCLUDE_DIRS))}")
    log.info("")

    # ── Step 1: Scan HTML ────────────────────────────────────────────
    html_pages = scan_html_files()

    # ── Step 2: Scan PDFs ────────────────────────────────────────────
    pdf_pages = scan_pdf_files()

    # ── Step 3: Chunk ────────────────────────────────────────────────
    log.info("=" * 60)
    log.info("PHASE 1c: Chunking content")
    log.info("=" * 60)

    all_chunks = []

    for page in html_pages:
        chunks = chunk_text(
            page["text"], page["source"], page["title"],
            page["category"], page["priority"],
            page["source_type"], page["fallback_url"]
        )
        all_chunks.extend(chunks)
        stats["chunks_from_html"] += len(chunks)

    for page in pdf_pages:
        chunks = chunk_text(
            page["text"], page["source"], page["title"],
            page["category"], page["priority"],
            page["source_type"], page["fallback_url"]
        )
        all_chunks.extend(chunks)
        stats["chunks_from_pdf"] += len(chunks)

    stats["total_chunks"] = len(all_chunks)
    log.info(f"Total chunks created: {stats['total_chunks']}")
    log.info(f"  From HTML: {stats['chunks_from_html']}")
    log.info(f"  From PDFs: {stats['chunks_from_pdf']}")

    # Deduplicate by hash
    seen_hashes = set()
    unique_chunks = []
    for chunk in all_chunks:
        h = hashlib.md5(chunk["text"].encode()).hexdigest()
        if h not in seen_hashes:
            seen_hashes.add(h)
            unique_chunks.append(chunk)
    all_chunks = unique_chunks
    log.info(f"After dedup: {len(all_chunks)} unique chunks")

    # Log priority distribution
    priority_counts = {}
    for c in all_chunks:
        p = c.get("priority", "medium")
        priority_counts[p] = priority_counts.get(p, 0) + 1
    log.info(f"Priority distribution: {priority_counts}")

    # ── Step 4: Save chunks.json ─────────────────────────────────────
    log.info("=" * 60)
    log.info("Saving chunks.json...")

    OUTPUT_CHUNKS.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_CHUNKS, "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, ensure_ascii=False, indent=1)

    file_size_mb = os.path.getsize(OUTPUT_CHUNKS) / (1024 * 1024)
    log.info(f"Saved: {OUTPUT_CHUNKS} ({file_size_mb:.1f} MB)")

    # ── Step 5: Generate embeddings ──────────────────────────────────
    vector_data = generate_embeddings(all_chunks)

    if vector_data:
        with open(OUTPUT_INDEX, "w", encoding="utf-8") as f:
            json.dump(vector_data, f, ensure_ascii=False)

        index_size_mb = os.path.getsize(OUTPUT_INDEX) / (1024 * 1024)
        log.info(f"Saved: {OUTPUT_INDEX} ({index_size_mb:.1f} MB)")
        stats["vector_index_size_mb"] = round(index_size_mb, 2)
    else:
        log.warning("Embedding generation failed. Only chunks.json was created.")
        log.warning("Run 'pip install sentence-transformers torch' and try again.")

    # ── Final Stats ──────────────────────────────────────────────────
    stats["end_time"] = time.time()
    duration = stats["end_time"] - stats["start_time"]

    log.info("=" * 60)
    log.info("BUILD COMPLETE")
    log.info("=" * 60)
    log.info(f"Duration: {duration:.1f} seconds")
    log.info(f"HTML files scanned: {stats['html_scanned']}")
    log.info(f"HTML files processed: {stats['html_processed']}")
    log.info(f"HTML files skipped (low content): {stats['html_skipped']}")
    log.info(f"PDF files scanned: {stats['pdf_scanned']}")
    log.info(f"PDF files processed: {stats['pdf_processed']}")
    log.info(f"PDF files skipped: {stats['pdf_skipped']}")
    log.info(f"Total chunks created: {stats['total_chunks']}")
    log.info(f"  From HTML: {stats['chunks_from_html']}")
    log.info(f"  From PDFs: {stats['chunks_from_pdf']}")

    if stats["extraction_failures"]:
        log.warning(f"Extraction failures: {len(stats['extraction_failures'])}")
        for fail in stats["extraction_failures"][:10]:
            log.warning(f"  - {fail['file']}: {fail['error']}")

    if vector_data:
        log.info(f"Vector index: {vector_data['count']} vectors of dimension {vector_data['dimension']}")

    # Save stats for validation report
    stats_path = PROJECT_ROOT / "logs" / "kb_build_stats.json"
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2, default=str)
    log.info(f"Stats saved: {stats_path}")

    log.info("")
    log.info("Next steps:")
    log.info("  1. Run python scripts/validate_kb.py for retrieval quality check")
    log.info("  2. Target 95%+ retrieval accuracy before Phase 3")
    log.info("")
    log.info("The old chatbot is still active. No files were modified.")


if __name__ == "__main__":
    main()
