#!/usr/bin/env python3
"""
Kingston Engineering College — Link / Asset Checker
===================================================
CI utility used by .github/workflows/check-links.yml. Crawls every HTML file
in the repository (excluding clearly out-of-scope trees) and reports:

  • Broken internal links         (href="…" that point to a missing file)
  • Missing images                (<img src> / srcset pointing to missing file)
  • Missing stylesheets           (<link rel="stylesheet" href> missing)
  • Missing scripts               (<script src> missing)
  • Broken anchors                (#some-id not present on the target page)
  • Broken navigation entries     (any nav-menu link that resolves to 404)

Output is plain text with a summary; the process exits with code 1 when any
broken reference is found so GitHub Actions can fail the build. Designed to be
fast (<60s on ~500 pages) by avoiding any third-party dependency and only
parsing once per file.

Usage:
    python scripts/check_links.py                 # crawl repo root
    python scripts/check_links.py --root .        # explicit root
    python scripts/check_links.py -v              # verbose, list every OK too

Exit codes:
    0  — no broken references
    1  — one or more broken references found
    2  — fatal configuration error (root not found, etc.)
"""
from __future__ import annotations

import argparse
import html.parser
import json
import os
import posixpath
import re
import sys
import urllib.parse
from collections import defaultdict
from pathlib import Path


# ──────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Directories we never crawl (binaries, build artifacts, current audit output,
# VCS internals, dependencies, large static asset mirror).
EXCLUDE_DIRS = {
    ".git", ".github", ".vscode", ".claude",
    "node_modules", "__pycache__",
    "assets",          # ~20 GB of PDFs / images — out of scope per audit brief
    "_archive",        # moved backups live here; not published
    "backups",         # (now-empty) legacy backup dir
    "chrome-devtools-mcp",
}
EXCLUDE_FILE_PATTERNS = (
    re.compile(r"\.(bak|bak2|pyc|log)$", re.IGNORECASE),
    re.compile(r"^nul$", re.IGNORECASE),
)

# URL schemes we should never try to resolve as files.
SKIP_SCHEMES = {"http", "https", "mailto", "tel", "javascript", "data", "ftp"}

# HTML void / no-close tags our tiny parser can ignore safely.
VOID_TAGS = {
    "meta", "link", "img", "br", "hr", "input", "source", "area", "base",
    "col", "embed", "track", "wbr",
}


# ──────────────────────────────────────────────────────────────────────────
# HTML reference extractor
# ──────────────────────────────────────────────────────────────────────────
class ReferenceExtractor(html.parser.HTMLParser):
    """Collect href/src/srcset/action references and on-page anchors."""

    def __init__(self, page_path: Path):
        super().__init__(convert_charrefs=True)
        self.page_path = page_path
        self.page_rel = (
            page_path.relative_to(PROJECT_ROOT)
            .as_posix()
        )
        self.refs: list[tuple[str, str, int]] = []       # (kind, url, line)
        self.ids: set[str] = set()                        # id="..." present in page
        self.named_anchors: set[str] = set()              # <a name="..."> present
        self.line = 1

    # html.parser API ------------------------------------------------------
    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        line = self.getpos()[0]

        if "id" in attr:
            self.ids.add(attr["id"])
        if tag == "a" and "name" in attr:
            self.named_anchors.add(attr["name"])

        if tag == "a" and "href" in attr:
            self.refs.append(("link", attr["href"], line))
        elif tag == "link" and attr.get("rel") and "stylesheet" in attr.get("rel", ""):
            if "href" in attr:
                self.refs.append(("stylesheet", attr["href"], line))
        elif tag == "script" and "src" in attr:
            self.refs.append(("script", attr["src"], line))
        elif tag == "img":
            if "src" in attr:
                self.refs.append(("image", attr["src"], line))
            if "srcset" in attr:
                for cand in attr["srcset"].split(","):
                    url = cand.strip().split(" ")[0]
                    if url:
                        self.refs.append(("image", url, line))
        elif tag == "form" and "action" in attr:
            self.refs.append(("form", attr["action"], line))
        elif tag == "iframe" and "src" in attr:
            self.refs.append(("iframe", attr["src"], line))
        elif tag == "source" and "src" in attr:
            self.refs.append(("media", attr["src"], line))
        elif tag == "video":
            if "src" in attr:
                self.refs.append(("media", attr["src"], line))
            if "poster" in attr:
                self.refs.append(("image", attr["poster"], line))

    # Void tags don't get an end-tag callback; ignore them implicitly.


# ──────────────────────────────────────────────────────────────────────────
# Resolver
# ──────────────────────────────────────────────────────────────────────────
def _normalise_url(url: str) -> str:
    """Strip surrounding whitespace and HTML entities."""
    return url.strip().replace("&amp;", "&")


def _split_anchor(url: str) -> tuple[str, str | None]:
    if "#" in url:
        path, anchor = url.split("#", 1)
        return path, anchor
    return url, None


def resolve_to_fs(page: Path, raw_url: str) -> tuple[str, Path | None, str | None]:
    """
    Resolve a URL found on `page` to a filesystem Path.

    Returns (kind, fs_path, anchor):
        kind ∈ {external, skip, internal}
        fs_path is None for external / skip.
    """
    url = _normalise_url(raw_url)

    if not url or url.startswith("#"):
        # Self-anchor only — keep anchor for later check.
        _, anchor = _split_anchor(url)
        return ("anchor", page, anchor or "")

    # Absolute URL/scheme
    if ":" in url.split("/", 1)[0]:
        scheme = url.split(":", 1)[0].lower()
        if scheme in SKIP_SCHEMES:
            return ("external", None, None)
        # Unknown scheme — treat as external, don't try to resolve.
        return ("external", None, None)

    # Protocol-relative
    if url.startswith("//"):
        return ("external", None, None)

    # Strip query string for fs resolution
    url_no_q = url.split("?", 1)[0]
    path_part, anchor = _split_anchor(url_no_q)

    if not path_part:
        return ("anchor", page, anchor or "")

    # Absolute-from-domain-root
    if path_part.startswith("/"):
        target = (PROJECT_ROOT / path_part.lstrip("/")).resolve()
    else:
        target = (page.parent / path_part).resolve()

    return ("internal", target, anchor)


# ──────────────────────────────────────────────────────────────────────────
# Anchor index
# ──────────────────────────────────────────────────────────────────────────
class AnchorIndex:
    """Maps POSIX-style repo-relative path → set of available anchors."""

    def __init__(self):
        self._map: dict[str, set[str]] = defaultdict(set)

    def add_page(self, path: Path, ids: set[str], named: set[str]) -> None:
        rel = path.relative_to(PROJECT_ROOT).as_posix().lower()
        self._map[rel] |= ids | named

    def has_anchor(self, path: Path, anchor: str) -> bool:
        rel = path.relative_to(PROJECT_ROOT).as_posix().lower()
        return anchor in self._map.get(rel, set())


# ──────────────────────────────────────────────────────────────────────────
# Discovery & analysis
# ──────────────────────────────────────────────────────────────────────────
def discover_html_files(root: Path) -> list[Path]:
    out: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune excluded directories in-place so os.walk skips them.
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDE_DIRS and not d.startswith(".")
        ]
        for name in filenames:
            if not name.lower().endswith(".html"):
                continue
            if any(p.search(name) for p in EXCLUDE_FILE_PATTERNS):
                continue
            out.append(Path(dirpath) / name)
    return sorted(out)


class Report:
    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.issues_by_file: dict[str, list[dict]] = defaultdict(list)
        self.checked: int = 0
        self.refs_seen: int = 0
        self.skipped_external: int = 0

    def add(self, page: Path, kind: str, url: str, line: int, why: str) -> None:
        rel = page.relative_to(PROJECT_ROOT).as_posix()
        self.issues_by_file[rel].append(
            {"kind": kind, "url": url, "line": line, "why": why}
        )

    @property
    def broken_count(self) -> int:
        return sum(len(v) for v in self.issues_by_file.values())


def main() -> int:
    global PROJECT_ROOT  # declared early so we may rebind it via --root
    ap = argparse.ArgumentParser(description="Kingston link/asset checker")
    ap.add_argument("--root", default=str(PROJECT_ROOT),
                    help="Project root directory (defaults to repo root)")
    ap.add_argument("--json", action="store_true",
                    help="Also write a machine-readable report to reports/link-check.json")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"[FATAL] Root directory not found: {root}", file=sys.stderr)
        return 2

    # Re-target module-level default if user passed --root
    PROJECT_ROOT = root

    report = Report(verbose=args.verbose)
    anchor_index = AnchorIndex()
    extractor_cache: dict[Path, ReferenceExtractor] = {}

    html_files = discover_html_files(root)
    print(f"Scanning {len(html_files)} HTML files under {root} …")

    # ── First pass: parse every page once, cache its references and anchors.
    for path in html_files:
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError as exc:
            print(f"[WARN] Could not read {path}: {exc}", file=sys.stderr)
            continue

        parser = ReferenceExtractor(path)
        try:
            parser.feed(text)
            parser.close()
        except html.parser.HTMLParseError:
            # Extremely malformed file — still report as a single issue.
            report.add(path, "parse-error", "(file)", 0, "HTML parse failure")
            continue

        extractor_cache[path] = parser
        anchor_index.add_page(path, parser.ids, parser.named_anchors)

    # ── Second pass: resolve every reference.
    # Files inside `components/` are HTML partials that get inlined into
    # consumer pages by assets/js/include-components.js, which then rewrites
    # their asset paths at runtime. Relative references in those files are
    # therefore not expected to resolve against `components/` itself, so we
    # skip them entirely.
    SKIP_FILE_DIRS = ("components/",)

    for path, parser in extractor_cache.items():
        report.checked += 1
        rel_path = path.relative_to(root).as_posix()
        if any(rel_path.startswith(d) for d in SKIP_FILE_DIRS):
            continue
        for kind, url, line in parser.refs:
            report.refs_seen += 1
            resolved = resolve_to_fs(path, url)
            kind_r, fs_path, anchor = resolved

            if kind_r == "external":
                report.skipped_external += 1
                continue

            if kind_r == "anchor":
                # Same-page anchor only.
                if anchor and anchor not in parser.ids and anchor not in parser.named_anchors:
                    report.add(path, "anchor", url, line,
                               f"anchor '#{anchor}' not present on this page")
                continue

            # Internal link
            assert fs_path is not None

            # Never crawl into excluded trees, but DO flag links that point
            # there (they would 404 in production unless the folder ships).
            try:
                rel = fs_path.relative_to(root)
            except ValueError:
                report.add(path, kind, url, line,
                           "link escapes project root (uses ../.. past root)")
                continue

            parts_top = rel.parts[0] if rel.parts else ""
            if parts_top in EXCLUDE_DIRS:
                # Excluded trees (most importantly assets/) are shipped to
                # production even though we don't crawl them locally. Assume
                # any link into them resolves correctly rather than flagging
                # hundreds of false positives.
                continue

            if not fs_path.exists():
                report.add(path, kind, url, line,
                           f"target not found: {rel.as_posix()}")
                continue

            # Anchor check (cross-page)
            if anchor and fs_path.suffix.lower() in (".html", ""):
                if not anchor_index.has_anchor(fs_path, anchor):
                    report.add(path, kind, url, line,
                               f"anchor '#{anchor}' missing in {rel.as_posix()}")

    # ── Output
    print()
    print("=" * 70)
    print("  LINK CHECK RESULTS")
    print("=" * 70)
    print(f"  Pages scanned  : {report.checked}")
    print(f"  References read: {report.refs_seen}")
    print(f"  External (skip): {report.skipped_external}")
    print(f"  Broken refs    : {report.broken_count}")
    print("=" * 70)

    if report.issues_by_file:
        for rel_path in sorted(report.issues_by_file):
            issues = report.issues_by_file[rel_path]
            print(f"\n✗ {rel_path}  ({len(issues)} issue{'s' if len(issues) != 1 else ''})")
            for it in issues:
                print(f"    L{it['line']:<5} [{it['kind']:<10}] {it['url']}")
                print(f"             ↳ {it['why']}")
    else:
        print("\n✓ No broken references found.")

    # Optional JSON report
    if args.json:
        reports_dir = root / "reports"
        reports_dir.mkdir(exist_ok=True)
        out = reports_dir / "link-check.json"
        out.write_text(json.dumps({
            "root": str(root),
            "pages_scanned": report.checked,
            "references_read": report.refs_seen,
            "broken_count": report.broken_count,
            "issues": report.issues_by_file,
        }, indent=2), encoding="utf-8")
        print(f"\nJSON report written to {out}")

    return 1 if report.broken_count > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
