#!/usr/bin/env python3
"""
fix_broken_links.py
===================
Targeted, deterministic repair of three confirmed broken-link classes found by
scripts/check_links.py. Each fix is verified safe before any file is touched:

  A. Department sidebars link to "<dept>_facilities/facilities_event_gallery.html"
     but no per-department facilities subdirectory exists. The shared events
     gallery DOES exist at facilities/facilities_event_gallery.html
     (root-relative "/facilities/facilities_event_gallery.html").
     Fix:  "<dept>_facilities/facilities_event_gallery.html"
        -> "/facilities/facilities_event_gallery.html"

  B. iqac/*.html pages link to "../iqac.html" (resolves to /iqac.html) but no
     root iqac.html exists; the IQAC landing page is iqac/iqac_about.html.
     Fix:  href="../iqac.html" -> href="iqac_about.html"   (same directory)

  C. alumni/*.html load the shared component injector via the relative path
     "assets/js/include-components.js", which 404s from /alumni/, so the
     site-wide header/footer never render on those pages. Other subdirectories
     (e.g. iqac/*) correctly use "../assets/...".
     Fix:  src="assets/js/include-components.js" -> src="../assets/js/include-components.js"
           within alumni/*.html only.

Usage:
    python scripts/fix_broken_links.py            # dry-run (default): prints plan
    python scripts/fix_broken_links.py --apply    # perform the edits in place

No new files are created, nothing is deleted, and only the exact href/src
values above are rewritten. Re-running is safe (idempotent).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

SHARED_GALLERY = PROJECT_ROOT / "facilities" / "facilities_event_gallery.html"


def iter_html(root: Path):
    for p in root.rglob("*.html"):
        parts = set(p.parts)
        if {"node_modules", "_archive", ".git", "chrome-devtools-mcp"} & parts:
            continue
        yield p


def fix_event_gallery(apply: bool):
    """Class A — department sidebar event-gallery links."""
    changed = 0
    files = 0
    if not SHARED_GALLERY.exists():
        print("  ABORT A: shared gallery not found at", SHARED_GALLERY)
        return 0, 0
    for p in iter_html(PROJECT_ROOT):
        text = p.read_text(encoding="utf-8", errors="replace")
        if "facilities_event_gallery.html" not in text:
            continue
        # dept pages link one of two botched ways:
        #   departments/<dept>/*.html : "<dept>_facilities/facilities_event_gallery.html"
        #   dept_*.html (root)        : "departments/<dept>/<dept>_facilities/facilities_event_gallery.html"
        # In both cases the dept-specific facilities dir does not exist, but the
        # shared gallery does (verified above) -> repoint to its root-relative URL.
        import re
        pattern = re.compile(
            r'href="(?:departments/[a-z]+/)?[a-z]+_facilities/facilities_event_gallery\.html"')
        n = 0
        def repl(m):
            nonlocal n
            inner = m.group(0)[len('href="'):-1]
            rel = p.parent / inner
            if rel.exists():
                return m.group(0)          # genuinely valid target; leave it
            n += 1
            return 'href="/facilities/facilities_event_gallery.html"'
        new_text = pattern.sub(repl, text)
        if new_text != text:
            files += 1
            changed += n
            if apply:
                p.write_text(new_text, encoding="utf-8")
    return files, changed


def fix_iqac_root(apply: bool):
    """Class B — iqac/*.html linking to ../iqac.html (nonexistent root page)."""
    changed = 0
    files = 0
    iqac_dir = PROJECT_ROOT / "iqac"
    landing = iqac_dir / "iqac_about.html"
    if not landing.exists():
        print("  ABORT B: iqac landing page not found at", landing)
        return 0, 0
    if (PROJECT_ROOT / "iqac.html").exists():
        # A real /iqac.html exists after all -> links aren't broken; skip.
        return 0, 0
    for p in iqac_dir.glob("*.html"):
        text = p.read_text(encoding="utf-8", errors="replace")
        if 'href="../iqac.html"' not in text:
            continue
        new_text = text.replace('href="../iqac.html"', 'href="iqac_about.html"')
        files += 1
        changed += text.count('href="../iqac.html"')
        if apply:
            p.write_text(new_text, encoding="utf-8")
    return files, changed


def fix_alumni_component_path(apply: bool):
    """Class C — alumni/*.html relative include-components.js path."""
    changed = 0
    files = 0
    alumni_dir = PROJECT_ROOT / "alumni"
    correct = alumni_dir.parent / "assets" / "js" / "include-components.js"
    if not correct.exists():
        print("  ABORT C: assets/js/include-components.js not found")
        return 0, 0
    # Only fix when the broken relative target truly does not exist.
    if (alumni_dir / "assets" / "js" / "include-components.js").exists():
        return 0, 0
    for p in alumni_dir.glob("*.html"):
        text = p.read_text(encoding="utf-8", errors="replace")
        if 'src="assets/js/include-components.js"' not in text:
            continue
        new_text = text.replace(
            'src="assets/js/include-components.js"',
            'src="../assets/js/include-components.js"',
        )
        files += 1
        changed += text.count('src="assets/js/include-components.js"')
        if apply:
            p.write_text(new_text, encoding="utf-8")
    return files, changed


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="apply edits in place (default is dry-run)")
    args = ap.parse_args()

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"fix_broken_links.py [{mode}]")

    fa, ca = fix_event_gallery(args.apply)
    print(f"  A. dept event-gallery -> /facilities/... : {ca} links in {fa} files")

    fb, cb = fix_iqac_root(args.apply)
    print(f"  B. ../iqac.html -> iqac_about.html       : {cb} links in {fb} files")

    fc, cc = fix_alumni_component_path(args.apply)
    print(f"  C. alumni include-components relative fix: {cc} refs in {fc} files")

    total = ca + cb + cc
    if not args.apply and total:
        print("\nDry-run only. Re-run with --apply to make these edits.")
    elif args.apply:
        print(f"\nApplied {total} link fixes across {fa + fb + fc} files.")
    else:
        print("\nNothing to fix.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
