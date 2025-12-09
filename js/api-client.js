/**
 * AEM Asset HTTP API Client
 * AEM Cloud Asset HTTP API 클라이언트
 */

class AEMAssetAPI {
    constructor(config = {}) {
        this.config = configManager.getConfig();
        this.baseUrl = config.host || this.config.server.host;
        this.deliveryUrl = config.deliveryUrl || this.config.server.deliveryUrl;
        this.timeout = config.timeout || this.config.api.timeout;
    }

    /**
     * Get headers for API requests
     */
    getHeaders(additionalHeaders = {}) {
        const config = configManager.getConfig();
        return {
            'Authorization': `Bearer ${config.auth.accessToken}`,
            'x-api-key': config.auth.apiKey,
            'x-gw-ims-org-id': config.auth.imsOrg,
            'Content-Type': 'application/json',
            ...additionalHeaders
        };
    }

    /**
     * Make API request
     */
    async request(endpoint, options = {}) {
        const config = configManager.getConfig();
        const url = `${config.server.host}${endpoint}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                ...options,
                headers: this.getHeaders(options.headers),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text();
                throw new APIError(
                    `API request failed: ${response.status} ${response.statusText}`,
                    response.status,
                    errorBody
                );
            }

            const contentType = response.headers.get('content-type');
            // Parse JSON for any JSON-like content types (application/json, application/vnd.siren+json, etc.)
            if (contentType && (contentType.includes('json') || contentType.includes('javascript'))) {
                return await response.json();
            }
            return await response.text();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new APIError('Request timeout', 408);
            }
            throw error;
        }
    }

    /**
     * Convert DAM path to API path
     * /content/dam/folder -> /folder
     */
    convertToApiPath(path) {
        if (!path) return '';
        // Remove /content/dam prefix if present
        return path.replace(/^\/content\/dam\/?/, '/').replace(/^\/+/, '/');
    }

    /**
     * List assets in a folder
     * @param {string} path - Folder path (e.g., /content/dam/my-folder or /my-folder)
     * @param {object} options - Query options
     */
    async listAssets(path, options = {}) {
        const config = configManager.getConfig();
        const {
            limit = 20,
            offset = 0,
            orderBy = 'name',
            orderDirection = 'asc'
        } = options;

        // Convert path: /content/dam/folder -> /folder
        const apiPath = this.convertToApiPath(path);

        // AEM Assets HTTP API endpoint for listing
        const queryParams = new URLSearchParams({
            limit: limit.toString(),
            offset: offset.toString(),
            orderby: orderBy,
            'orderby.sort': orderDirection
        });

        const endpoint = `/api/assets${apiPath}.json?${queryParams}`;

        try {
            const result = await this.request(endpoint, { method: 'GET' });
            return this.normalizeListResponse(result);
        } catch (error) {
            // Demo mode: return mock data
            if (this.isDemoMode()) {
                return this.getMockAssets(path, limit);
            }
            throw error;
        }
    }

    /**
     * Normalize list response to consistent format
     */
    normalizeListResponse(response) {
        console.log('normalizeListResponse input:', response);

        // Handle Siren format (entities array)
        if (response.entities && Array.isArray(response.entities)) {
            console.log('Found entities:', response.entities.length);
            const assets = response.entities.map(entity => {
                const normalized = this.normalizeAsset(entity);
                console.log('Normalized asset:', normalized);
                return normalized;
            });
            return {
                assets: assets,
                properties: response.properties,
                total: response.properties?.['srn:paging']?.total || response.entities.length,
                raw: response
            };
        }

        // Handle direct children format (children array)
        if (response.children && Array.isArray(response.children)) {
            return {
                assets: response.children.map(child => ({
                    id: child.id || child.name,
                    name: child.name,
                    path: child.path || `/content/dam/${child.name}`,
                    title: child.title || child.name,
                    mimeType: child.mimeType,
                    size: child.size || 0,
                    metadata: child
                })),
                properties: response.properties || {},
                total: response.children.length,
                raw: response
            };
        }

        // Handle flat properties format (AEM default JSON)
        if (response['jcr:primaryType']) {
            const assets = [];
            for (const key in response) {
                if (response[key] && typeof response[key] === 'object' && response[key]['jcr:primaryType']) {
                    assets.push({
                        id: key,
                        name: key,
                        path: `/content/dam/${key}`,
                        title: response[key]['jcr:title'] || key,
                        mimeType: response[key]['jcr:mimeType'],
                        metadata: response[key]
                    });
                }
            }
            return {
                assets,
                properties: { 'jcr:primaryType': response['jcr:primaryType'] },
                total: assets.length,
                raw: response
            };
        }

        // Return raw response if format unknown
        return {
            assets: [],
            properties: {},
            total: 0,
            raw: response
        };
    }

    /**
     * Normalize asset object from Siren entity format
     */
    normalizeAsset(entity) {
        const props = entity.properties || {};
        const metadata = props.metadata || {};
        const links = entity.links || [];

        // Extract path from self link (e.g., /api/assets/folder/file.jpg.json -> /content/dam/folder/file.jpg)
        const selfLink = links.find(l => l.rel?.includes('self'))?.href || '';
        const contentLink = links.find(l => l.rel?.includes('content'))?.href || '';

        // Parse path from API URL
        let path = '';
        if (selfLink) {
            // Extract path from URL like https://host/api/assets/folder/file.jpg.json
            const match = selfLink.match(/\/api\/assets(\/[^?]+)\.json/);
            if (match) {
                path = '/content/dam' + decodeURIComponent(match[1]);
            }
        }

        return {
            id: props.fmUuid || props.name,
            name: props.name || '',
            path: path,
            title: metadata['dc:title'] || props.name || '',
            description: metadata['dc:description'] || '',
            mimeType: metadata['dc:format'] || '',
            size: metadata['dam:size'] || props.size || 0,
            created: props['jcr:created'],
            modified: props['jcr:lastModified'],
            thumbnail: links.find(l => l.rel?.includes('thumbnail'))?.href,
            contentUrl: contentLink,
            metadata: props
        };
    }

    /**
     * Get asset metadata
     * @param {string} path - Asset path
     */
    async getMetadata(path) {
        const apiPath = this.convertToApiPath(path);
        const endpoint = `/api/assets${apiPath}.json`;

        try {
            const result = await this.request(endpoint, { method: 'GET' });
            return this.normalizeMetadataResponse(result);
        } catch (error) {
            if (this.isDemoMode()) {
                return this.getMockMetadata(path);
            }
            throw error;
        }
    }

    /**
     * Get full metadata schema from /jcr:content/metadata
     * Returns ALL metadata properties including dc:description, Iptc4xmpExt:LocationShown, etc.
     * @param {string} path - Asset path (e.g., /content/dam/folder/image.jpg)
     */
    async getMetadataSchema(path) {
        const config = configManager.getConfig();

        // Build the path to jcr:content/metadata with infinity depth
        let damPath = path;
        if (!damPath.startsWith('/content/dam')) {
            damPath = `/content/dam${damPath.startsWith('/') ? '' : '/'}${damPath}`;
        }

        // Use infinity.json to get ALL metadata properties
        const endpoint = `${damPath}/jcr:content/metadata.infinity.json`;
        const url = `${config.server.host}${endpoint}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (!response.ok) {
                throw new APIError(`Failed to get metadata schema: ${response.status}`, response.status);
            }

            const result = await response.json();
            return this.normalizeMetadataSchema(result);
        } catch (error) {
            if (this.isDemoMode()) {
                return this.getMockMetadataSchema(path);
            }
            throw error;
        }
    }

    /**
     * Normalize metadata schema response
     * Extracts all metadata properties and organizes them by namespace
     */
    normalizeMetadataSchema(response) {
        const schema = {
            raw: response,
            properties: {},
            namespaces: {}
        };

        // Extract all properties
        for (const [key, value] of Object.entries(response)) {
            // Skip internal JCR properties that are not metadata
            if (key.startsWith('jcr:') && key !== 'jcr:title' && key !== 'jcr:description') {
                if (key === 'jcr:primaryType' || key === 'jcr:mixinTypes') {
                    schema.properties[key] = value;
                }
                continue;
            }

            schema.properties[key] = value;

            // Organize by namespace (e.g., dc:, dam:, xmp:, tiff:, etc.)
            const colonIndex = key.indexOf(':');
            if (colonIndex > 0) {
                const namespace = key.substring(0, colonIndex);
                if (!schema.namespaces[namespace]) {
                    schema.namespaces[namespace] = {};
                }
                schema.namespaces[namespace][key] = value;
            } else {
                // Properties without namespace
                if (!schema.namespaces['_default']) {
                    schema.namespaces['_default'] = {};
                }
                schema.namespaces['_default'][key] = value;
            }
        }

        return schema;
    }

    /**
     * Mock metadata schema for demo mode
     */
    getMockMetadataSchema(path) {
        return {
            raw: {},
            properties: {
                'jcr:primaryType': 'nt:unstructured',
                'dc:title': 'Sample Asset',
                'dc:description': 'Sample description',
                'dc:format': 'image/jpeg',
                'dc:creator': 'Demo User',
                'dam:assetState': 'processed',
                'tiff:imageWidth': 1920,
                'tiff:imageHeight': 1080
            },
            namespaces: {
                'dc': {
                    'dc:title': 'Sample Asset',
                    'dc:description': 'Sample description',
                    'dc:format': 'image/jpeg',
                    'dc:creator': 'Demo User'
                },
                'dam': {
                    'dam:assetState': 'processed'
                },
                'tiff': {
                    'tiff:imageWidth': 1920,
                    'tiff:imageHeight': 1080
                }
            }
        };
    }

    /**
     * Normalize metadata response
     */
    normalizeMetadataResponse(response) {
        const properties = response.properties || response;
        return {
            'jcr:primaryType': properties['jcr:primaryType'],
            'jcr:uuid': properties['jcr:uuid'],
            'dc:title': properties['dc:title'],
            'dc:description': properties['dc:description'],
            'dc:format': properties['dc:format'],
            'dc:creator': properties['dc:creator'],
            'dc:modified': properties['dc:modified'],
            'dam:assetState': properties['dam:assetState'],
            'dam:size': properties['dam:size'],
            'tiff:imageWidth': properties['tiff:imageWidth'],
            'tiff:imageHeight': properties['tiff:imageHeight'],
            'xmp:CreatorTool': properties['xmp:CreatorTool'],
            ...properties
        };
    }

    /**
     * Update asset metadata
     * @param {string} path - Asset path
     * @param {object} metadata - Metadata to update
     */
    async updateMetadata(path, metadata) {
        const apiPath = this.convertToApiPath(path);
        const endpoint = `/api/assets${apiPath}`;

        // Build multipart form data for metadata update
        const formData = new FormData();

        // Add metadata properties
        Object.entries(metadata).forEach(([key, value]) => {
            formData.append(key, value);
        });

        try {
            const result = await this.request(endpoint, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    class: 'asset',
                    properties: metadata
                })
            });
            return result;
        } catch (error) {
            if (this.isDemoMode()) {
                return { success: true, message: 'Metadata updated (demo mode)' };
            }
            throw error;
        }
    }

    /**
     * Upload asset
     * @param {File} file - File to upload
     * @param {string} destinationPath - Destination folder path
     * @param {function} onProgress - Progress callback
     */
    /**
     * Upload asset using PUT method with binary data
     * Uses local proxy to bypass CORS restrictions
     * PUT /api/assets/{folder}/{filename}
     */
    async uploadAsset(file, destinationPath, onProgress = null) {
        const config = configManager.getConfig();

        // Demo mode simulation
        if (this.isDemoMode()) {
            return new Promise((resolve) => {
                setTimeout(() => {
                    if (onProgress) onProgress(100);
                    resolve({
                        success: true,
                        path: `${destinationPath}/${file.name}`,
                        message: 'Upload simulated (demo mode)'
                    });
                }, 1000);
            });
        }

        const apiPath = this.convertToApiPath(destinationPath);
        const endpoint = `/api/assets${apiPath}/${encodeURIComponent(file.name)}`;
        const targetUrl = `${config.server.host}${endpoint}`;

        // Use proxy for upload to bypass CORS
        const proxyUrl = '/proxy/aem/upload';

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    const progress = Math.round((e.loaded / e.total) * 100);
                    onProgress(progress);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    console.log('[Upload] Success:', xhr.status);
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve({
                            success: true,
                            path: `${destinationPath}/${file.name}`,
                            response: response
                        });
                    } catch {
                        resolve({
                            success: true,
                            path: `${destinationPath}/${file.name}`
                        });
                    }
                } else {
                    console.error('[Upload] Failed:', xhr.status, xhr.responseText);
                    reject(new APIError(`Upload failed: ${xhr.status}`, xhr.status, xhr.responseText));
                }
            });

            xhr.addEventListener('error', () => {
                console.error('[Upload] Network error');
                reject(new APIError('Upload failed: Network error', 0));
            });

            xhr.addEventListener('abort', () => {
                reject(new APIError('Upload cancelled', 0));
            });

            xhr.open('PUT', proxyUrl);

            // Set proxy headers
            xhr.setRequestHeader('X-Target-URL', targetUrl);
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

            // Set auth headers
            const headers = this.getHeaders();
            if (headers['Authorization']) {
                xhr.setRequestHeader('Authorization', headers['Authorization']);
            }
            if (headers['x-api-key']) {
                xhr.setRequestHeader('x-api-key', headers['x-api-key']);
            }

            // Send binary data
            xhr.send(file);
        });
    }

    /**
     * Download asset
     * @param {string} path - Asset path
     * @param {string} rendition - Rendition type (original, web, thumbnail)
     */
    async downloadAsset(path, rendition = 'original') {
        const config = configManager.getConfig();
        const apiPath = this.convertToApiPath(path);
        let endpoint;

        switch (rendition) {
            case 'thumbnail':
                endpoint = `/api/assets${apiPath}/renditions/cq5dam.thumbnail.140.100.png`;
                break;
            case 'web':
                endpoint = `/api/assets${apiPath}/renditions/cq5dam.web.1280.1280.jpeg`;
                break;
            default:
                endpoint = `/api/assets${apiPath}/renditions/original`;
        }

        const url = `${config.server.host}${endpoint}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (!response.ok) {
                throw new APIError(`Download failed: ${response.status}`, response.status);
            }

            return await response.blob();
        } catch (error) {
            if (this.isDemoMode()) {
                // Return a placeholder blob in demo mode
                return new Blob(['Demo file content'], { type: 'text/plain' });
            }
            throw error;
        }
    }

    /**
     * Download asset to server
     * Saves the file directly to the server's download directory
     * @param {string} assetPath - Asset path in AEM
     * @param {string} rendition - Rendition type (original, web, thumbnail)
     * @returns {Promise<object>} - Download result with file path and size
     */
    async downloadToServer(assetPath, rendition = 'original') {
        const config = configManager.getConfig();

        const requestBody = {
            assetPath: assetPath,
            downloadPath: config.paths.downloadPath,
            aemHost: config.server.host,
            authorization: `Bearer ${config.auth.accessToken}`,
            apiKey: config.auth.apiKey,
            rendition: rendition
        };

        try {
            const response = await fetch('/api/download-to-server', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new APIError(result.error || 'Download to server failed', response.status);
            }

            return result;
        } catch (error) {
            if (error instanceof APIError) {
                throw error;
            }
            throw new APIError('Download to server failed: ' + error.message, 0);
        }
    }

    /**
     * Delete asset
     * @param {string} path - Asset path
     */
    async deleteAsset(path) {
        const apiPath = this.convertToApiPath(path);
        const endpoint = `/api/assets${apiPath}`;

        try {
            await this.request(endpoint, { method: 'DELETE' });
            return { success: true };
        } catch (error) {
            if (this.isDemoMode()) {
                return { success: true, message: 'Delete simulated (demo mode)' };
            }
            throw error;
        }
    }

    /**
     * Copy asset
     * @param {string} sourcePath - Source asset path
     * @param {string} destinationPath - Destination path
     */
    async copyAsset(sourcePath, destinationPath) {
        const apiPath = this.convertToApiPath(sourcePath);
        const endpoint = `/api/assets${apiPath}`;

        try {
            const result = await this.request(endpoint, {
                method: 'COPY',
                headers: {
                    'X-Destination': destinationPath
                }
            });
            return result;
        } catch (error) {
            if (this.isDemoMode()) {
                return { success: true, message: 'Copy simulated (demo mode)' };
            }
            throw error;
        }
    }

    /**
     * Move asset
     * @param {string} sourcePath - Source asset path
     * @param {string} destinationPath - Destination path
     */
    async moveAsset(sourcePath, destinationPath) {
        const apiPath = this.convertToApiPath(sourcePath);
        const endpoint = `/api/assets${apiPath}`;

        try {
            const result = await this.request(endpoint, {
                method: 'MOVE',
                headers: {
                    'X-Destination': destinationPath
                }
            });
            return result;
        } catch (error) {
            if (this.isDemoMode()) {
                return { success: true, message: 'Move simulated (demo mode)' };
            }
            throw error;
        }
    }

    /**
     * Create folder
     * @param {string} path - Folder path to create
     * @param {string} title - Folder title
     */
    async createFolder(path, title) {
        const apiPath = this.convertToApiPath(path);
        const endpoint = `/api/assets${apiPath}`;

        try {
            const result = await this.request(endpoint, {
                method: 'POST',
                body: JSON.stringify({
                    class: 'folder',
                    properties: {
                        'jcr:title': title,
                        name: path.split('/').pop()
                    }
                })
            });
            return result;
        } catch (error) {
            if (this.isDemoMode()) {
                return { success: true, message: 'Folder created (demo mode)' };
            }
            throw error;
        }
    }

    /**
     * Search assets
     * @param {object} query - Search query
     */
    async searchAssets(query) {
        const config = configManager.getConfig();
        const queryParams = new URLSearchParams();

        if (query.text) queryParams.append('fulltext', query.text);
        if (query.path) queryParams.append('path', query.path);
        if (query.type) queryParams.append('type', query.type);
        if (query.mimeType) queryParams.append('p.guessTotal', 'true');

        const endpoint = `/api/assets.json?${queryParams}`;

        try {
            const result = await this.request(endpoint, { method: 'GET' });
            return this.normalizeListResponse(result);
        } catch (error) {
            if (this.isDemoMode()) {
                return this.getMockAssets(query.path || '/content/dam', 10);
            }
            throw error;
        }
    }

    /**
     * Test connection
     */
    async testConnection() {
        try {
            const result = await this.listAssets('/content/dam', { limit: 1 });
            return { success: true, message: 'Connection successful' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Check if in demo mode (no valid config)
     */
    isDemoMode() {
        const config = configManager.getConfig();
        return !config.server.host || !config.auth.accessToken;
    }

    /**
     * Get mock assets for demo mode
     */
    getMockAssets(path, limit) {
        const mockAssets = [];
        const types = ['image', 'video', 'document', 'audio'];
        const extensions = {
            image: ['jpg', 'png', 'gif', 'webp'],
            video: ['mp4', 'mov', 'avi'],
            document: ['pdf', 'doc', 'xlsx'],
            audio: ['mp3', 'wav']
        };

        for (let i = 1; i <= limit; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            const ext = extensions[type][Math.floor(Math.random() * extensions[type].length)];
            mockAssets.push({
                id: `mock-asset-${i}`,
                name: `sample-${i}.${ext}`,
                path: `${path}/sample-${i}.${ext}`,
                title: `Sample Asset ${i}`,
                description: `This is a sample ${type} asset for demonstration`,
                mimeType: `${type}/${ext}`,
                size: Math.floor(Math.random() * 10000000),
                created: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
                modified: new Date().toISOString(),
                thumbnail: type === 'image' ? `https://picsum.photos/seed/${i}/200/150` : null,
                metadata: {
                    'dc:title': `Sample Asset ${i}`,
                    'dc:format': `${type}/${ext}`,
                    'dam:assetState': 'processed'
                }
            });
        }

        return {
            assets: mockAssets,
            total: mockAssets.length,
            properties: { path }
        };
    }

    /**
     * Get mock metadata for demo mode
     */
    getMockMetadata(path) {
        return {
            'jcr:primaryType': 'dam:Asset',
            'jcr:uuid': Utils.generateId(),
            'dc:title': path.split('/').pop(),
            'dc:description': 'Sample asset description',
            'dc:format': 'image/jpeg',
            'dc:creator': 'Demo User',
            'dc:modified': new Date().toISOString(),
            'dam:assetState': 'processed',
            'dam:size': 1234567,
            'tiff:imageWidth': 1920,
            'tiff:imageHeight': 1080,
            'xmp:CreatorTool': 'Adobe Photoshop'
        };
    }
}

/**
 * Custom API Error
 */
class APIError extends Error {
    constructor(message, status, body = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.body = body;
    }
}

// Export
window.AEMAssetAPI = AEMAssetAPI;
window.APIError = APIError;
