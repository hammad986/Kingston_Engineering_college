const fs = require('fs');
const content = fs.readFileSync('C:/Users/KE0529-CSE/.gemini/antigravity/brain/26c9c636-c97d-456c-819a-c1122133d139/.system_generated/steps/296/content.md', 'utf8');

const mainStart = content.indexOf('<main');
const mainEnd = content.indexOf('</main>');
if (mainStart !== -1 && mainEnd !== -1) {
    const mainHtml = content.substring(mainStart, mainEnd + 7);
    const paragraphs = mainHtml.match(/<(?:p|h[1-6]|li)[^>]*>[\s\S]*?<\/(?:p|h[1-6]|li)>/gi) || [];
    for (const p of paragraphs) {
        const text = p.replace(/<[^>]+>/g, '').trim();
        if (text) console.log('• ' + text);
    }
}
