#!/usr/bin/env python3
"""Fix verified re-audit issues:
1. Backslash paths -> forward slashes in src/href/poster attributes (12 files)
2. Facilities 5 blank-target links -> add rel="noopener noreferrer"
3. Add sr-only h1 to pages missing h1 (index, about, testimonials, events, library, event gallery)
4. Campus gallery: demote second h1 -> h2
5. Canonical sweep: add <link rel="canonical"> to all public pages missing it
"""
import os, re, glob

ROOT = '.'
EXCLUDE_DIRS = {'.git', '.playwright-mcp', 'components', 'cloud_links_work', 'backups', '_archive', 'reports', 'node_modules'}
EXCLUDE_FILES = {'404.html', 'rag-monitor.html'}

def relpath_html(path):
    """Path relative to project root with forward slashes, e.g. departments/aids/aids_about.html"""
    return path.replace('\\', '/').lstrip('./')

# ---------- 1. Backslash paths ----------
backslash_files = [
    'about.html', 'academics.html', 'contact.html',
    'departments/csbs/csbs_faculty_achievements.html',
    'departments/csbs/csbs_industry.html',
    'departments/csbs/csbs_newsletter.html',
    'departments/csbs/csbs_online_courses.html',
    'dept_aids.html', 'facilities.html', 'index.html',
    'iqac/iqac_about.html', 'rag-monitor.html', 'testimonials.html',
]
attr_re = re.compile(r'(src|href|poster|data-src)=("|\')([^"\']*)(\2)')

def fix_attr_backslash(m):
    attr, q1, val, q2 = m.groups()
    if '\\' in val:
        val = val.replace('\\', '/')
    return f'{attr}={q1}{val}{q2}'

fixed_backslash = 0
for f in backslash_files:
    if not os.path.exists(f):
        continue
    s = open(f, encoding='utf-8', errors='replace').read()
    s2 = attr_re.sub(fix_attr_backslash, s)
    if s2 != s:
        open(f, 'w', encoding='utf-8').write(s2)
        fixed_backslash += 1
        print(f'[1] backslash fixed: {f}')

# ---------- 2. Facilities noopener ----------
facilities = 'facilities.html'
s = open(facilities, encoding='utf-8', errors='replace').read()
targets = [
    'inter_collegiate_sports_meet_2023.pdf',
    'anna_university_zonal_champions_2023.pdf',
    'national_athletics_medal_winners.pdf',
    'state_kabaddi_championship_2023.pdf',
    'policies/sports.pdf',
]
fixed_noopener = 0
for t in targets:
    old = f'<a href="assets/pdfs/{t}" target="_blank"'
    new = f'<a href="assets/pdfs/{t}" target="_blank" rel="noopener noreferrer"'
    if old in s:
        s = s.replace(old, new)
        fixed_noopener += 1
open(facilities, 'w', encoding='utf-8').write(s)
print(f'[2] facilities noopener added: {fixed_noopener}')

# ---------- 3. sr-only h1 additions ----------
h1_map = {
    'index.html': 'Kingston Engineering College',
    'about.html': 'About Kingston Engineering College',
    'testimonials.html': 'Alumni Testimonials',
    'events.html': 'Events',
    'facilities/facilities_library.html': 'Library',
    'facilities/facilities_event_gallery.html': 'Event Gallery',
}
for f, title in h1_map.items():
    if not os.path.exists(f):
        continue
    s = open(f, encoding='utf-8', errors='replace').read()
    if '<h1' in s:
        print(f'[3] skip (has h1): {f}')
        continue
    # Insert after <main ...> if present, else after <body>
    m = re.search(r'(<main[^>]*>)', s)
    if m:
        ins_at = m.end()
    else:
        m2 = re.search(r'(<body[^>]*>)', s)
        ins_at = m2.end() if m2 else 0
    h1 = f'<h1 class="sr-only">{title}</h1>'
    s = s[:ins_at] + '\n        ' + h1 + s[ins_at:]
    open(f, 'w', encoding='utf-8').write(s)
    print(f'[3] h1 added: {f}')

# Add .sr-only CSS if not present
sr_only = '.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}'
css_path = 'assets/css/style.css'
s = open(css_path, encoding='utf-8', errors='replace').read()
if '.sr-only' not in s:
    s = s.rstrip() + '\n' + sr_only + '\n'
    open(css_path, 'w', encoding='utf-8').write(s)
    print('[3] .sr-only CSS added to style.css')

# ---------- 4. Campus gallery second h1 -> h2 ----------
cg = 'campus_gallery.html'
s = open(cg, encoding='utf-8', errors='replace').read()
if s.count('<h1') >= 2:
    # Demote the second h1 (Our Campus) to h2
    idx = s.find('<h1>Our <em>Campus</em></h1>')
    if idx != -1:
        s = s.replace('<h1>Our <em>Campus</em></h1>', '<h2>Our <em>Campus</em></h2>', 1)
        open(cg, 'w', encoding='utf-8').write(s)
        print('[4] campus_gallery second h1 -> h2')
    else:
        # fallback: replace second occurrence generically
        parts = s.split('<h1', 2)
        if len(parts) == 3:
            s = parts[0] + '<h1' + parts[1] + '<h2' + parts[2]
            open(cg, 'w', encoding='utf-8').write(s)
            print('[4] campus_gallery second h1 -> h2 (fallback)')

# ---------- 5. Canonical sweep ----------
canonical_re = re.compile(r'<link rel="canonical"[^>]*>', re.I)
added_canonical = 0
skipped = 0
for path in glob.glob('**/*.html', recursive=True):
    norm = path.replace('\\', '/')
    top = norm.split('/')[0]
    if top in EXCLUDE_DIRS:
        skipped += 1
        continue
    if norm in EXCLUDE_FILES or os.path.basename(norm) in ('404.html',):
        skipped += 1
        continue
    s = open(path, encoding='utf-8', errors='replace').read()
    if canonical_re.search(s):
        skipped += 1
        continue
    # Compute canonical URL
    if norm == 'index.html':
        url = 'https://engineering.kingston.ac.in/'
    else:
        url = 'https://engineering.kingston.ac.in/' + norm
    tag = f'<link rel="canonical" href="{url}">'
    # Insert after <title>...</title> or before </head>
    m = re.search(r'(</title>)', s, re.I)
    if m:
        ins_at = m.end()
    else:
        m2 = re.search(r'(</head>)', s, re.I)
        ins_at = m2.start() if m2 else 0
    s = s[:ins_at] + '\n    ' + tag + s[ins_at:]
    open(path, 'w', encoding='utf-8').write(s)
    added_canonical += 1

print(f'[5] canonical added: {added_canonical}, skipped: {skipped}')
print('DONE')
