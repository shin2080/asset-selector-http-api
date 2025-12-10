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
const ENV_FILE_PATH = path.join(ROOT_DIR, '.env');

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

    console.log(`[Request] ${req.method} ${urlPath}`);

    // ENV file API
    if (urlPath === '/api/env') {
        handleEnvApi(req, res);
        return;
    }

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

    // AEM Download to server (saves file to server's download directory)
    if (urlPath === '/api/download-to-server') {
        handleDownloadToServer(req, res);
        return;
    }

    // AEM Thumbnail proxy (for displaying thumbnails in asset list)
    if (urlPath === '/api/thumbnail') {
        handleThumbnailProxy(req, res, parsedUrl.query);
        return;
    }

    // AEM Update Metadata proxy
    if (urlPath === '/api/update-metadata') {
        handleUpdateMetadata(req, res);
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
 * Handle AEM API proxy for requests
 * Supports both header-based (GET) and body-based (POST with method override) requests
 */
function handleAEMApiProxy(req, res) {
    // Check if this is a body-based request (POST with JSON body)
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const params = JSON.parse(body);
                const { aemHost, endpoint, method, authorization, apiKey, contentType, body: requestBody } = params;

                if (!aemHost || !endpoint) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Missing aemHost or endpoint' }));
                    return;
                }

                const targetUrl = `${aemHost}${endpoint}`;
                console.log(`[AEM API Proxy] ${method || 'GET'} ${targetUrl}`);

                const parsedTarget = new URL(targetUrl);

                const options = {
                    hostname: parsedTarget.hostname,
                    port: 443,
                    path: parsedTarget.pathname + parsedTarget.search,
                    method: method || 'GET',
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
                if (contentType) {
                    options.headers['Content-Type'] = contentType;
                }
                if (requestBody) {
                    options.headers['Content-Length'] = Buffer.byteLength(requestBody);
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

                if (requestBody) {
                    proxyReq.write(requestBody);
                }
                proxyReq.end();

            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid JSON: ' + e.message }));
            }
        });
        return;
    }

    // Header-based request (legacy GET support)
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

/**
 * Handle download to server (saves file to server's download directory)
 */
function handleDownloadToServer(req, res) {
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
        try {
            const { assetPath, downloadPath, aemHost, authorization, apiKey, rendition } = JSON.parse(body);

            if (!assetPath || !aemHost) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Missing required parameters: assetPath, aemHost' }));
                return;
            }

            // Build download URL based on rendition type
            let downloadUrl;
            const assetApiPath = assetPath.replace('/content/dam', '');

            if (rendition === 'web') {
                downloadUrl = `${aemHost}/api/assets${assetApiPath}/renditions/cq5dam.web.1280.1280.jpeg`;
            } else if (rendition === 'thumbnail') {
                downloadUrl = `${aemHost}/api/assets${assetApiPath}/renditions/cq5dam.thumbnail.319.319.png`;
            } else {
                // Original - use content path directly for binary download
                downloadUrl = `${aemHost}${assetPath}/jcr:content/renditions/original`;
            }

            console.log(`[Download to Server] Downloading from: ${downloadUrl}`);

            const parsedUrl = new URL(downloadUrl);
            const filename = assetPath.split('/').pop();

            // Determine save directory (use provided path or default)
            const saveDir = downloadPath || path.join(ROOT_DIR, 'downloads');

            // Create directory if it doesn't exist
            if (!fs.existsSync(saveDir)) {
                fs.mkdirSync(saveDir, { recursive: true });
            }

            const savePath = path.join(saveDir, filename);

            const options = {
                hostname: parsedUrl.hostname,
                port: 443,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {}
            };

            if (authorization) {
                options.headers['Authorization'] = authorization;
            }
            if (apiKey) {
                options.headers['x-api-key'] = apiKey;
            }

            const downloadReq = https.request(options, (downloadRes) => {
                console.log(`[Download to Server] Response status: ${downloadRes.statusCode}`);

                // Handle redirect
                if (downloadRes.statusCode >= 300 && downloadRes.statusCode < 400 && downloadRes.headers.location) {
                    console.log(`[Download to Server] Redirecting to: ${downloadRes.headers.location}`);
                    // Follow redirect
                    const redirectUrl = new URL(downloadRes.headers.location);
                    options.hostname = redirectUrl.hostname;
                    options.path = redirectUrl.pathname + redirectUrl.search;

                    const redirectReq = https.request(options, (redirectRes) => {
                        handleDownloadResponse(redirectRes, savePath, filename, res);
                    });
                    redirectReq.on('error', (err) => {
                        console.error('[Download to Server Error]', err.message);
                        res.writeHead(502);
                        res.end(JSON.stringify({ error: 'Download error: ' + err.message }));
                    });
                    redirectReq.end();
                    return;
                }

                handleDownloadResponse(downloadRes, savePath, filename, res);
            });

            downloadReq.on('error', (err) => {
                console.error('[Download to Server Error]', err.message);
                res.writeHead(502);
                res.end(JSON.stringify({ error: 'Download error: ' + err.message }));
            });

            downloadReq.end();

        } catch (e) {
            console.error('[Download to Server Error]', e.message);
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid request: ' + e.message }));
        }
    });
}

/**
 * Handle download response and save to file
 */
function handleDownloadResponse(downloadRes, savePath, filename, res) {
    if (downloadRes.statusCode !== 200) {
        res.writeHead(downloadRes.statusCode);
        res.end(JSON.stringify({
            error: `Download failed with status ${downloadRes.statusCode}`,
            statusCode: downloadRes.statusCode
        }));
        return;
    }

    const fileStream = fs.createWriteStream(savePath);
    let downloadedSize = 0;

    downloadRes.on('data', chunk => {
        downloadedSize += chunk.length;
    });

    downloadRes.pipe(fileStream);

    fileStream.on('finish', () => {
        fileStream.close();
        console.log(`[Download to Server] Saved: ${savePath} (${downloadedSize} bytes)`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            filename: filename,
            path: savePath,
            size: downloadedSize,
            contentType: downloadRes.headers['content-type']
        }));
    });

    fileStream.on('error', (err) => {
        console.error('[Download to Server Error]', err.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to save file: ' + err.message }));
    });
}

/**
 * Handle thumbnail proxy (proxy AEM thumbnails to avoid CORS)
 */
function handleThumbnailProxy(req, res, query) {
    const assetPath = query.path;

    if (!assetPath) {
        res.writeHead(400);
        res.end('Missing path parameter');
        return;
    }

    // Load config from .env
    let envConfig = {};
    try {
        if (fs.existsSync(ENV_FILE_PATH)) {
            const envContent = fs.readFileSync(ENV_FILE_PATH, 'utf8');
            envConfig = parseEnvFile(envContent);
        }
    } catch (e) {
        console.error('[Thumbnail Proxy] Failed to load .env:', e.message);
    }

    const aemHost = envConfig.AEM_HOST;
    const accessToken = envConfig.ACCESS_TOKEN;
    const apiKey = envConfig.API_KEY;

    if (!aemHost) {
        res.writeHead(500);
        res.end('AEM_HOST not configured');
        return;
    }

    // Build thumbnail URL
    const assetApiPath = assetPath.replace('/content/dam', '');
    const thumbnailUrl = `${aemHost}/api/assets${assetApiPath}/renditions/cq5dam.thumbnail.140.100.png`;

    console.log(`[Thumbnail Proxy] Fetching: ${thumbnailUrl}`);

    const parsedUrl = new URL(thumbnailUrl);

    const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname,
        method: 'GET',
        headers: {}
    };

    if (accessToken) {
        options.headers['Authorization'] = `Bearer ${accessToken}`;
    }
    if (apiKey) {
        options.headers['x-api-key'] = apiKey;
    }

    const proxyReq = https.request(options, (proxyRes) => {
        // Set CORS and cache headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=3600');

        if (proxyRes.statusCode !== 200) {
            // Return a placeholder or 404
            res.writeHead(404);
            res.end();
            return;
        }

        res.writeHead(200, {
            'Content-Type': proxyRes.headers['content-type'] || 'image/png'
        });

        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('[Thumbnail Proxy Error]', err.message);
        res.writeHead(502);
        res.end('Proxy error');
    });

    proxyReq.end();
}

/**
 * Handle Update Metadata proxy
 * PUT /api/assets/{path} with {"class":"asset", "properties":{...}}
 *
 * Response codes:
 * 200 - OK - Asset updated successfully
 * 404 - NOT FOUND - Asset not found
 * 412 - PRECONDITION FAILED - Root collection not found
 * 500 - INTERNAL SERVER ERROR
 */
function handleUpdateMetadata(req, res) {
    if (req.method !== 'PUT') {
        res.writeHead(405);
        res.end(JSON.stringify({ error: 'Method not allowed. Use PUT.' }));
        return;
    }

    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        try {
            const { aemHost, assetPath, authorization, apiKey, metadata } = JSON.parse(body);

            if (!aemHost || !assetPath || !metadata) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Missing required fields: aemHost, assetPath, metadata' }));
                return;
            }

            const parsedHostUrl = new URL(aemHost);

            // Step 1: Get CSRF token first
            console.log(`[Update Metadata] Getting CSRF token from ${aemHost}`);

            const csrfOptions = {
                hostname: parsedHostUrl.hostname,
                port: 443,
                path: '/libs/granite/csrf/token.json',
                method: 'GET',
                headers: {}
            };

            if (authorization) {
                csrfOptions.headers['Authorization'] = authorization;
            }
            if (apiKey) {
                csrfOptions.headers['x-api-key'] = apiKey;
            }

            const csrfReq = https.request(csrfOptions, (csrfRes) => {
                let csrfBody = '';
                csrfRes.on('data', chunk => {
                    csrfBody += chunk.toString();
                });

                csrfRes.on('end', () => {
                    let csrfToken = '';

                    if (csrfRes.statusCode === 200) {
                        try {
                            const csrfData = JSON.parse(csrfBody);
                            csrfToken = csrfData.token;
                            console.log(`[Update Metadata] Got CSRF token: ${csrfToken.substring(0, 20)}...`);
                        } catch (e) {
                            console.log(`[Update Metadata] Failed to parse CSRF token, continuing without it`);
                        }
                    } else {
                        console.log(`[Update Metadata] CSRF token request returned ${csrfRes.statusCode}, continuing without it`);
                    }

                    // Step 2: Now update the metadata
                    updateAssetMetadata(aemHost, assetPath, authorization, apiKey, metadata, csrfToken, res);
                });
            });

            csrfReq.on('error', (err) => {
                console.error('[Update Metadata] CSRF token error:', err.message);
                // Continue without CSRF token
                updateAssetMetadata(aemHost, assetPath, authorization, apiKey, metadata, '', res);
            });

            csrfReq.end();

        } catch (e) {
            console.error('[Update Metadata Error]', e.message);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid request: ' + e.message }));
        }
    });
}

/**
 * Update asset metadata with optional CSRF token
 */
function updateAssetMetadata(aemHost, assetPath, authorization, apiKey, metadata, csrfToken, res) {
    const aemUrl = `${aemHost}/api/assets${assetPath}`;
    console.log(`[Update Metadata] PUT ${aemUrl}`);

    const parsedUrl = new URL(aemUrl);

    // Request body as per AEM API spec
    const requestBody = JSON.stringify({
        class: 'asset',
        properties: metadata
    });

    const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname,
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody)
        }
    };

    if (authorization) {
        options.headers['Authorization'] = authorization;
    }
    if (apiKey) {
        options.headers['x-api-key'] = apiKey;
    }
    if (csrfToken) {
        options.headers['CSRF-Token'] = csrfToken;
    }

    console.log(`[Update Metadata] Request body: ${requestBody}`);
    console.log(`[Update Metadata] Headers: ${JSON.stringify(Object.keys(options.headers))}`);

    const proxyReq = https.request(options, (proxyRes) => {
        let responseBody = [];
        proxyRes.on('data', chunk => {
            responseBody.push(chunk);
        });

        proxyRes.on('end', () => {
            const responseData = Buffer.concat(responseBody).toString();
            console.log(`[Update Metadata] Response: ${proxyRes.statusCode}`);
            console.log(`[Update Metadata] Response body: ${responseData}`);

            // Handle response based on status code
            if (proxyRes.statusCode === 200) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                let parsedData = null;
                try {
                    parsedData = responseData ? JSON.parse(responseData) : null;
                } catch (e) {}
                res.end(JSON.stringify({
                    success: true,
                    message: 'Metadata updated successfully',
                    data: parsedData
                }));
            } else if (proxyRes.statusCode === 404) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: 'Asset not found at the provided path',
                    statusCode: 404
                }));
            } else if (proxyRes.statusCode === 412) {
                res.writeHead(412, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: 'Root collection cannot be found or accessed',
                    statusCode: 412
                }));
            } else {
                res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: `Update failed with status ${proxyRes.statusCode}`,
                    statusCode: proxyRes.statusCode,
                    response: responseData
                }));
            }
        });
    });

    proxyReq.on('error', (err) => {
        console.error('[Update Metadata Error]', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
    });

    proxyReq.write(requestBody);
    proxyReq.end();
}

/**
 * Handle ENV file API (read/write .env file)
 */
function handleEnvApi(req, res) {
    if (req.method === 'GET') {
        // Read .env file
        fs.readFile(ENV_FILE_PATH, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    // File doesn't exist, return empty config
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ exists: false, config: {} }));
                } else {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: 'Failed to read .env file' }));
                }
                return;
            }

            // Parse .env file
            const config = parseEnvFile(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ exists: true, config }));
        });
    } else if (req.method === 'POST') {
        // Write .env file
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const config = JSON.parse(body);
                const envContent = generateEnvFile(config);

                fs.writeFile(ENV_FILE_PATH, envContent, 'utf8', (err) => {
                    if (err) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: 'Failed to write .env file' }));
                        return;
                    }

                    console.log('[ENV API] .env file saved');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                });
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    } else {
        res.writeHead(405);
        res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
}

/**
 * Parse .env file content to object
 * Supports multiline values (lines starting with whitespace are continuations)
 */
function parseEnvFile(content) {
    const config = {};
    const lines = content.split('\n');
    let currentKey = null;
    let currentValue = '';

    for (const line of lines) {
        // Check if this is a continuation line (starts with whitespace and we have a current key)
        if (currentKey && line.match(/^\s+\S/)) {
            // This is a continuation of the previous value
            currentValue += line.trim();
            continue;
        }

        // Save previous key-value if exists
        if (currentKey) {
            config[currentKey] = currentValue;
            currentKey = null;
            currentValue = '';
        }

        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) continue;

        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
            currentKey = trimmed.substring(0, equalIndex).trim();
            currentValue = trimmed.substring(equalIndex + 1).trim();

            // Remove quotes if present
            if ((currentValue.startsWith('"') && currentValue.endsWith('"')) ||
                (currentValue.startsWith("'") && currentValue.endsWith("'"))) {
                currentValue = currentValue.slice(1, -1);
            }
        }
    }

    // Save last key-value if exists
    if (currentKey) {
        config[currentKey] = currentValue;
    }

    return config;
}

/**
 * Generate .env file content from object
 */
function generateEnvFile(config) {
    const lines = [
        '# AEM Cloud Configuration',
        '# Auto-generated by AEM Asset Demo',
        '',
        '# Server Configuration',
        `AEM_HOST=${config.AEM_HOST || ''}`,
        `AEM_DELIVERY_URL=${config.AEM_DELIVERY_URL || ''}`,
        `AEM_REPOSITORY_ID=${config.AEM_REPOSITORY_ID || ''}`,
        '',
        '# Authentication',
        `IMS_ORG=${config.IMS_ORG || ''}`,
        `API_KEY=${config.API_KEY || ''}`,
        `CLIENT_SECRET=${config.CLIENT_SECRET || ''}`,
        `TECHNICAL_ACCOUNT_ID=${config.TECHNICAL_ACCOUNT_ID || ''}`,
        `TECHNICAL_ACCOUNT_EMAIL=${config.TECHNICAL_ACCOUNT_EMAIL || ''}`,
        `IMS_ENDPOINT=${config.IMS_ENDPOINT || 'ims-na1.adobelogin.com'}`,
        `METASCOPES=${config.METASCOPES || 'ent_aem_cloud_api'}`,
        '',
        '# Access Token (for local testing)',
        `ACCESS_TOKEN=${config.ACCESS_TOKEN || ''}`,
        '',
        '# Paths',
        `BROWSE_PATH=${config.BROWSE_PATH || '/content/dam'}`,
        `UPLOAD_PATH=${config.UPLOAD_PATH || '/content/dam/uploads'}`,
        `DOWNLOAD_PATH=${config.DOWNLOAD_PATH || '/var/downloads'}`,
        `SAVE_PATH=${config.SAVE_PATH || '/content/dam/selected'}`,
        ''
    ];

    return lines.join('\n');
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
