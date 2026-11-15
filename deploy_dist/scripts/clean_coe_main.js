const fs = require('fs');
const content = fs.readFileSync('C:/Users/KE0529-CSE/.gemini/antigravity/brain/26c9c636-c97d-456c-819a-c1122133d139/.system_generated/steps/296/content.md', 'utf8');

const mainStart = content.indexOf('<main');
const mainEnd = content.indexOf('</main>');
if (mainStart !== -1 && mainEnd !== -1) {
    const mainHtml = content.substring(mainStart, mainEnd + 7);
    // strip script and style tags
    const clean = mainHtml
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '');
    console.log(clean.substring(0, 5000));
    console.log('\n--- PART 2 ---\n');
    console.log(clean.substring(5000, 10000));
}
