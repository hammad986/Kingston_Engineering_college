const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

function getHtmlFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
        if (file === 'node_modules' || file === '.git' || file === '.vscode' || file === 'cloud_links_work') continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getHtmlFiles(fullPath));
        } else if (file.endsWith('.html')) {
            results.push(fullPath);
        }
    }
    return results;
}

const allHtml = getHtmlFiles(ROOT_DIR);
console.log('Total HTML files found in REAL website:', allHtml.length);

let navMatches = [];
for (const filePath of allHtml) {
    const rel = path.relative(ROOT_DIR, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const hasNav = content.includes('nav-links') || content.includes('main-nav');
    const hasAcademics = /href=["'][^"']*academics\.html["']/i.test(content);
    const hasRegulations = content.includes('regulations.html');

    if (hasAcademics) {
        navMatches.push({ rel, hasNav, hasRegulations });
    }
}

console.log('Files with academics link:', navMatches.length);
console.log('Files already mentioning regulations.html:', navMatches.filter(f => f.hasRegulations).length);
console.log('Files needing update:', navMatches.filter(f => !f.hasRegulations).length);
