const fs = require('fs');
const content = fs.readFileSync('C:/Users/KE0529-CSE/.gemini/antigravity/brain/26c9c636-c97d-456c-819a-c1122133d139/.system_generated/steps/296/content.md', 'utf8');

// Extract main or body content
const bodyMatch = content.match(/<main[\s\S]*?<\/main>/i) || content.match(/<article[\s\S]*?<\/article>/i) || content.match(/<div class="[^"]*content[^"]*"[\s\S]*?<\/footer>/i);

// Let's find all headings (h1, h2, h3, h4) and tables and links in the body
const headings = content.match(/<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>/gi) || [];
console.log('--- HEADINGS IN RMKEC COE PAGE ---');
for (const h of headings) {
    console.log(h.replace(/<[^>]+>/g, '').trim());
}

// Let's find tabs / nav links inside the COE section
const coeNav = content.match(/<ul[^>]*class="[^"]*(?:nav|tab|menu)[^"]*"[\s\S]*?<\/ul>/gi) || [];
console.log('\n--- TABS / MENUS IN RMKEC COE ---');
for (const n of coeNav) {
    console.log(n.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

// Let's look for sections or blocks
const blocks = content.match(/<section[\s\S]*?<\/section>/gi) || [];
console.log('\n--- SECTION COUNT ---', blocks.length);
