const http = require('http');

function checkUrl(path) {
    return new Promise((resolve) => {
        http.get('http://localhost:3000' + path, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    path,
                    status: res.statusCode,
                    length: data.length,
                    hasRegNav: data.includes('/regulations.html'),
                    hasR2021: data.includes('Regulations 2021'),
                    hasR2025: data.includes('Regulations 2025'),
                    hasR2026: data.includes('Regulations 2026'),
                    hasMainFooter: data.includes('class="main-footer"'),
                    hasNavigate: data.includes('Navigate')
                });
            });
        }).on('error', (err) => {
            resolve({ path, error: err.message });
        });
    });
}

async function run() {
    console.log('Testing Real Website Server on port 3000...');
    const urls = [
        '/index.html',
        '/regulations.html',
        '/academics.html',
        '/about.html',
        '/dept_cse.html',
        '/departments/csbs/csbs_vision_mission.html'
    ];
    for (const u of urls) {
        const result = await checkUrl(u);
        console.log(JSON.stringify(result));
    }
}

run();
