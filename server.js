const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DEFAULT_PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.pdf': 'application/pdf',
    '.wasm': 'application/wasm',
    '.bin': 'application/octet-stream',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
};

function serveFile(res, filePath, statusCode = 200) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error');
            return;
        }
        res.writeHead(statusCode, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(data);
    });
}

function serve404(res) {
    const notFoundPath = path.join(ROOT_DIR, '404.html');
    if (fs.existsSync(notFoundPath)) {
        serveFile(res, notFoundPath, 404);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
}

const server = http.createServer((req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        });
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Prevent directory traversal
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    let targetPath = path.join(ROOT_DIR, safePath);

    fs.stat(targetPath, (err, stats) => {
        if (!err) {
            if (stats.isDirectory()) {
                const indexHtml = path.join(targetPath, 'index.html');
                if (fs.existsSync(indexHtml)) {
                    serveFile(res, indexHtml);
                    return;
                }
            } else if (stats.isFile()) {
                serveFile(res, targetPath);
                return;
            }
        }

        // Try appending .html (e.g. /about -> /about.html)
        const htmlPath = targetPath + '.html';
        if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
            serveFile(res, htmlPath);
            return;
        }

        // 404 fallback
        serve404(res);
    });
});

function startServer(port) {
    server.listen(port, () => {
        console.log(`====================================================`);
        console.log(`🚀 Kingston Engineering College (REAL) Server Running!`);
        console.log(`🌐 Local URL: http://localhost:${port}`);
        console.log(`📁 Serving directory: ${ROOT_DIR}`);
        console.log(`====================================================`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is in use, trying port ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('Server error:', err);
        }
    });
}

startServer(Number(DEFAULT_PORT));
