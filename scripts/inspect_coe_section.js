const fs = require('fs');
const content = fs.readFileSync('C:/Users/KE0529-CSE/.gemini/antigravity/brain/26c9c636-c97d-456c-819a-c1122133d139/.system_generated/steps/296/content.md', 'utf8');

const idx = content.indexOf('Controller of Examinations');
if (idx !== -1) {
    console.log(content.substring(idx, idx + 8000));
}
