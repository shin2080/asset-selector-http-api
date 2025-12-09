/**
 * Development Server with Proxy
 * Node.js를 사용한 개발 서버 + AEM API 프록시
 *
 * Usage: node server/server.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8000;
const ROOT_DIR = path.join(__dirname, '..');

// MIME types
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
};

// Create server
const server = http.createServer((req, res) => {
    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', '*');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Parse URL
    const parsedUrl = url.parse(req.url, true);
    let urlPath = parsedUrl.pathname;

    // IMS Token exchange proxy (Adobe IMS doesn't support CORS)
    if (urlPath === '/ims/exchange/jwt') {
        handleIMSProxy(req, res);
        return;
    }

    // AEM Upload proxy (AEM Cloud CORS doesn't allow PUT with custom headers)
    if (urlPath === '/proxy/aem/upload') {
        handleAEMUploadProxy(req, res);
        return;
    }

    // AEM API proxy for paths blocked by CORS
    if (urlPath === '/proxy/aem/api') {
        handleAEMApiProxy(req, res);
        return;
    }

    // Default to index.html
    if (urlPath === '/') {
        urlPath = '/index.html';
    }

    // Get file path
    const filePath = path.join(ROOT_DIR, urlPath);

    // Security check - prevent directory traversal
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // Check if file exists
    fs.stat(filePath, (err, stats) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        // If directory, try index.html
        if (stats.isDirectory()) {
            const indexPath = path.join(filePath, 'index.html');
            serveFile(indexPath, res);
        } else {
            serveFile(filePath, res);
        }
    });
});

/**
 * Handle AEM API proxy for GET requests
 * (For paths blocked by CORS like /content/dam/...)
 */
function handleAEMApiProxy(req, res) {
    // Get target URL and auth headers from request headers
    const targetUrl = req.headers['x-target-url'];
    const authorization = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'];

    if (!targetUrl) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing x-target-url header' }));
        return;
    }

    console.log(`[AEM API Proxy] ${req.method} ${targetUrl}`);

    const parsedTarget = new URL(targetUrl);

    const options = {
        hostname: parsedTarget.hostname,
        port: 443,
        path: parsedTarget.pathname + parsedTarget.search,
        method: req.method,
        headers: {
            'Accept': 'application/json'
        }
    };

    if (authorization) {
        options.headers['Authorization'] = authorization;
    }
    if (apiKey) {
        options.headers['x-api-key'] = apiKey;
    }

    const proxyReq = https.request(options, (proxyRes) => {
        let responseBody = [];
        proxyRes.on('data', chunk => {
            responseBody.push(chunk);
        });
        proxyRes.on('end', () => {
            const responseData = Buffer.concat(responseBody);
            console.log(`[AEM API Proxy] Response: ${proxyRes.statusCode}`);

            res.writeHead(proxyRes.statusCode, {
                'Content-Type': proxyRes.headers['content-type'] || 'application/json'
            });
            res.end(responseData);
        });
    });

    proxyReq.on('error', (err) => {
        console.error('[AEM API Proxy Error]', err.message);
        res.writeHead(502);
        res.end(JSON.stringify({ error: 'AEM proxy error: ' + err.message }));
    });

    proxyReq.end();
}

/**
 * Handle AEM upload proxy
 * (AEM Cloud CORS doesn't properly support PUT with custom headers)
 */
function handleAEMUploadProxy(req, res) {
    if (req.method !== 'PUT' && req.method !== 'POST') {
        res.writeHead(405);
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    // Get target URL and auth headers from request headers
    const targetUrl = req.headers['x-target-url'];
    const authorization = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'];
    const contentType = req.headers['content-type'];

    if (!targetUrl) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing x-target-url header' }));
        return;
    }

    console.log(`[AEM Upload Proxy] ${req.method} ${targetUrl}`);

    const parsedTarget = new URL(targetUrl);
    const chunks = [];

    req.on('data', chunk => {
        chunks.push(chunk);
    });

    req.on('end', () => {
        const body = Buffer.concat(chunks);

        const options = {
            hostname: parsedTarget.hostname,
            port: 443,
            path: parsedTarget.pathname + parsedTarget.search,
            method: req.method,
            headers: {
                'Content-Type': contentType || 'application/octet-stream',
                'Content-Length': body.length
            }
        };

        if (authorization) {
            options.headers['Authorization'] = authorization;
        }
        if (apiKey) {
            options.headers['x-api-key'] = apiKey;
        }

        const proxyReq = https.request(options, (proxyRes) => {
            let responseBody = [];
            proxyRes.on('data', chunk => {
                responseBody.push(chunk);
            });
            proxyRes.on('end', () => {
                const responseData = Buffer.concat(responseBody);
                console.log(`[AEM Upload Proxy] Response: ${proxyRes.statusCode}`);

                // Forward response headers
                const responseHeaders = {
                    'Content-Type': proxyRes.headers['content-type'] || 'application/json'
                };

                res.writeHead(proxyRes.statusCode, responseHeaders);
                res.end(responseData);
            });
        });

        proxyReq.on('error', (err) => {
            console.error('[AEM Upload Proxy Error]', err.message);
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'AEM proxy error: ' + err.message }));
        });

        proxyReq.write(body);
        proxyReq.end();
    });
}

/**
 * Handle IMS token exchange proxy
 * (Adobe IMS doesn't allow CORS, so we need server-side proxy)
 */
function handleIMSProxy(req, res) {
    if (req.method !== 'POST') {
        res.writeHead(405);
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        const params = new URLSearchParams(body);
        const imsEndpoint = params.get('ims_endpoint') || 'ims-na1.adobelogin.com';

        const options = {
            hostname: imsEndpoint,
            port: 443,
            path: '/ims/exchange/jwt',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        console.log(`[IMS Proxy] Token exchange request to ${imsEndpoint}`);

        const proxyReq = https.request(options, (proxyRes) => {
            let responseBody = '';
            proxyRes.on('data', chunk => {
                responseBody += chunk;
            });
            proxyRes.on('end', () => {
                res.writeHead(proxyRes.statusCode, {
                    'Content-Type': 'application/json'
                });
                res.end(responseBody);
            });
        });

        proxyReq.on('error', (err) => {
            console.error('[IMS Proxy Error]', err.message);
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'IMS proxy error: ' + err.message }));
        });

        proxyReq.write(body);
        proxyReq.end();
    });
}

// Serve file
function serveFile(filePath, res) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        // Set CORS headers for development
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

// Start server
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║  AEM Asset Selector & HTTP API Demo Server            ║
╠═══════════════════════════════════════════════════════╣
║  Server running at http://localhost:${PORT}             ║
║                                                       ║
║  Press Ctrl+C to stop                                 ║
╚═══════════════════════════════════════════════════════╝
    `);
});
