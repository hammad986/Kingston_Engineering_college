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
console.log(`Starting bulk update on ${allHtml.length} HTML files in REAL website...`);

const NAV_TARGET = /<li>\s*<a href="\/academics\.html">Academics<\/a>\s*<\/li>/;

const NAV_REPLACEMENT = `<li class="has-dropdown">
                    <a href="/academics.html">Academics</a>
                    <ul class="dropdown js-exclude-dropdown">
                        <li><a href="/academics.html">Academic Overview</a></li>
                        <li><a href="/regulations.html">Regulations</a></li>
                    </ul>
                </li>`;

const FOOTER_TARGET = /(<li>\s*<a href="\/academics\.html">Academics<\/a>\s*<\/li>)/;

let updatedCount = 0;
let navUpdates = 0;
let footerUpdates = 0;

for (const filePath of allHtml) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // 1. Update <nav> if needed
    const navMatch = content.match(/<nav[\s\S]*?<\/nav>/i);
    if (navMatch) {
        const originalNav = navMatch[0];
        if (!originalNav.includes('/regulations.html') && NAV_TARGET.test(originalNav)) {
            const updatedNav = originalNav.replace(NAV_TARGET, NAV_REPLACEMENT);
            content = content.replace(originalNav, updatedNav);
            changed = true;
            navUpdates++;
        }
    }

    // 2. Update <footer> if needed
    const footerMatch = content.match(/<footer[\s\S]*?<\/footer>/i);
    if (footerMatch) {
        const originalFooter = footerMatch[0];
        if (!originalFooter.includes('/regulations.html') && FOOTER_TARGET.test(originalFooter)) {
            const updatedFooter = originalFooter.replace(
                FOOTER_TARGET,
                '$1\n                <li><a href="/regulations.html">Regulations</a></li>'
            );
            content = content.replace(originalFooter, updatedFooter);
            changed = true;
            footerUpdates++;
        }
    }

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        updatedCount++;
    }
}

console.log('==============================================');
console.log('✅ REAL WEBSITE BULK UPDATE COMPLETED SUCCESSFULLY!');
console.log(`Total HTML files updated: ${updatedCount}`);
console.log(`Navigation menus (<nav>) updated: ${navUpdates}`);
console.log(`Footer Quick Links (<footer>) updated: ${footerUpdates}`);
console.log('==============================================');
