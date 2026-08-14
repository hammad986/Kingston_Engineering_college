import re, glob, os

sri = {
    'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css': 'sha384-gAPqlBuTCdtVcYt9ocMOYWrnBZ4XSL6q+4eXqwNycOr4iFczhNKtnYhF3NEXJM51',
    'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js': 'sha384-2UI1PfnXFjVMQ7/ZDEF70CR943oH3v6uZrFQGGqJYlvhh4g6z6uVktxYbOlAczav',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css': 'sha384-/o6I2CkkWC//PSjvWC/eYN7l3xM3tJm8ZzVkCOfp//W05QcE3mlGskpoHB6XqI+B',
    'https://unpkg.com/aos@2.3.1/dist/aos.css': 'sha384-/rJKQnzOkEo+daG0jMjU1IwwY9unxt1NBw3Ef2fmOJ3PW/TfAg2KXVoWwMZQZtw9',
    'https://unpkg.com/aos@2.3.1/dist/aos.js': 'sha384-wziAfh6b/qT+3LrqebF9WeK4+J5sehS6FA10J1t3a866kJ/fvU5UwofWnQyzLtwu',
}

class SRIAdder:
    def __init__(self):
        self.changed = False
    
    def repl_css(self, m, hash_val):
        if 'integrity' not in m.group(1):
            self.changed = True
            return m.group(1) + ' integrity="' + hash_val + '" crossorigin="anonymous" />'
        return m.group(0)
    
    def repl_js(self, m, hash_val):
        if 'integrity' not in m.group(1):
            self.changed = True
            return m.group(1) + ' integrity="' + hash_val + '" crossorigin="anonymous"></script>'
        return m.group(0)

for f in glob.glob('**/*.html', recursive=True):
    if 'node_modules' in f or '.playwright' in f or f.startswith('_archive') or f.startswith('backups'):
        continue
    try:
        text = open(f, encoding='utf-8', errors='ignore').read()
    except:
        continue
    
    adder = SRIAdder()
    
    for url, hash_val in sri.items():
        pattern = rf'(<link[^>]*href\s*=\s*["\']{re.escape(url)}["\'][^>]*)/?>'
        text = re.sub(pattern, lambda m: adder.repl_css(m, hash_val), text)
        
        pattern = rf'(<script[^>]*src\s*=\s*["\']{re.escape(url)}["\'][^>]*)></script>'
        text = re.sub(pattern, lambda m: adder.repl_js(m, hash_val), text)
    
    if adder.changed:
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(text)
        print(f'Updated: {f}')

print('Done')