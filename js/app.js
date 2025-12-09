/**
 * Main Application
 * AEM Asset Selector & HTTP API Demo Application
 */

(function() {
    'use strict';

    // Application state
    const app = {
        currentPage: 'api',
        assetSelector: null,
        api: null,
        uploadFiles: [],
        tokenGenerator: null
    };

    /**
     * Initialize the application
     */
    function init() {
        // Initialize utilities
        Toast.init();
        Modal.init();

        // Initialize API client
        app.api = new AEMAssetAPI();

        // Initialize Token Generator
        app.tokenGenerator = new AdobeTokenGenerator();

        // Initialize Asset Selector (only if available)
        if (typeof AEMAssetSelector !== 'undefined') {
            app.assetSelector = new AEMAssetSelector();
            app.assetSelector.init();
        }

        // Setup navigation
        setupNavigation();

        // Setup page handlers
        setupSelectorPage();
        setupApiPage();
        setupSettingsPage();

        // Load saved settings
        loadSettings();

        console.log('AEM Asset Demo initialized');
    }

    /**
     * Setup navigation
     */
    function setupNavigation() {
        const navButtons = document.querySelectorAll('.nav-btn');

        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                navigateTo(page);
            });
        });
    }

    /**
     * Navigate to a page
     */
    function navigateTo(pageName) {
        // Update navigation buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === pageName);
        });

        // Update pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.toggle('active', page.id === `page-${pageName}`);
        });

        app.currentPage = pageName;
    }

    /**
     * Setup Asset Selector page
     */
    function setupSelectorPage() {
        // Adobe Asset Selector (PureJSSelectors API)
        setupAdobeAssetSelector();

        // Legacy search functionality (if elements exist)
        const searchInput = document.getElementById('asset-search');
        const searchBtn = document.getElementById('search-btn');

        if (searchBtn && searchInput) {
            searchBtn.addEventListener('click', () => {
                app.assetSelector.search(searchInput.value);
            });

            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    app.assetSelector.search(searchInput.value);
                }
            });
        }

        // Legacy Open Asset Selector button (if exists)
        const legacyOpenBtn = document.getElementById('open-selector-btn');
        if (legacyOpenBtn) {
            legacyOpenBtn.addEventListener('click', () => {
                openAssetSelector();
            });
        }

        // Filter panel (if elements exist)
        if (document.getElementById('apply-filters')) {
            setupFilters();
        }

        // Selection actions (if elements exist)
        const saveSelectedBtn = document.getElementById('save-selected');
        const clearSelectionBtn = document.getElementById('clear-selection');

        if (saveSelectedBtn) {
            saveSelectedBtn.addEventListener('click', () => {
                saveSelectedAssets();
            });
        }

        if (clearSelectionBtn) {
            clearSelectionBtn.addEventListener('click', () => {
                app.assetSelector.clearSelection();
            });
        }

        // Code tabs
        setupCodeTabs();
    }

    /**
     * Setup Adobe Asset Selector (PureJSSelectors API)
     */
    function setupAdobeAssetSelector() {
        // Open Modal button
        const openModalBtn = document.getElementById('open-asset-selector-btn');
        if (openModalBtn) {
            openModalBtn.addEventListener('click', () => {
                if (window.assetSelector) {
                    window.assetSelector.openModal();
                } else {
                    Toast.error('Asset Selector not initialized');
                }
            });
        }

        // Render Rail View button
        const renderRailBtn = document.getElementById('render-rail-selector-btn');
        if (renderRailBtn) {
            renderRailBtn.addEventListener('click', () => {
                const container = document.getElementById('asset-selector-container');
                if (window.assetSelector && container) {
                    window.assetSelector.renderRail(container);
                } else {
                    Toast.error('Asset Selector not initialized');
                }
            });
        }

        // Use Selected Assets button
        const useSelectedBtn = document.getElementById('use-selected-assets');
        if (useSelectedBtn) {
            useSelectedBtn.addEventListener('click', () => {
                if (window.assetSelector) {
                    const assets = window.assetSelector.getSelectedAssets();
                    if (assets.length === 0) {
                        Toast.warning('No assets selected');
                        return;
                    }
                    // Show selected assets in a modal or process them
                    Modal.open({
                        title: 'Selected Assets',
                        body: `<pre style="max-height: 400px; overflow: auto;"><code>${Utils.syntaxHighlight(assets)}</code></pre>`,
                        buttons: [
                            {
                                text: 'Copy JSON',
                                class: 'btn-primary',
                                onClick: () => {
                                    Utils.copyToClipboard(JSON.stringify(assets, null, 2));
                                    Toast.success('Copied to clipboard');
                                },
                                closeOnClick: false
                            },
                            { text: 'Close', class: 'btn-secondary' }
                        ]
                    });
                }
            });
        }

        // Clear Selected Assets button
        const clearSelectedBtn = document.getElementById('clear-selected-assets');
        if (clearSelectedBtn) {
            clearSelectedBtn.addEventListener('click', () => {
                if (window.assetSelector) {
                    window.assetSelector.clearSelection();
                    Toast.info('Selection cleared');
                }
            });
        }

        // Color scheme change handler
        const colorSchemeSelect = document.getElementById('selector-color-scheme');
        if (colorSchemeSelect) {
            colorSchemeSelect.addEventListener('change', (e) => {
                const wrapper = document.querySelector('.asset-selector-wrapper');
                if (wrapper) {
                    wrapper.dataset.theme = e.target.value;
                }
            });
        }
    }

    /**
     * Open Asset Selector
     */
    async function openAssetSelector() {
        await app.assetSelector.open({
            onSelect: (assets) => {
                console.log('Selected assets:', assets);
                Toast.success(`${assets.length} assets selected`);
            },
            onClose: () => {
                console.log('Asset selector closed');
            },
            onAssetClick: (asset) => {
                showAssetDetails(asset);
            }
        });
    }

    /**
     * Setup filter panel
     */
    function setupFilters() {
        // Apply filters button
        document.getElementById('apply-filters').addEventListener('click', () => {
            collectFilters();
            app.assetSelector.applyFilters();
        });

        // Reset filters button
        document.getElementById('reset-filters').addEventListener('click', () => {
            app.assetSelector.resetFilters();
        });
    }

    /**
     * Collect filter values
     */
    function collectFilters() {
        const filters = {};

        // Asset type
        const typeValue = document.getElementById('filter-type').value;
        if (typeValue) {
            filters.assetType = typeValue;
        }

        // Format (checkboxes)
        const formatChecks = document.querySelectorAll('#filter-format input:checked');
        if (formatChecks.length > 0) {
            filters.format = Array.from(formatChecks).map(cb => cb.value);
        }

        // Size range
        const sizeMin = document.getElementById('filter-size-min').value;
        const sizeMax = document.getElementById('filter-size-max').value;
        if (sizeMin) filters.sizeMin = parseInt(sizeMin);
        if (sizeMax) filters.sizeMax = parseInt(sizeMax);

        // Date range
        const dateFrom = document.getElementById('filter-date-from').value;
        const dateTo = document.getElementById('filter-date-to').value;
        if (dateFrom) filters.dateFrom = dateFrom;
        if (dateTo) filters.dateTo = dateTo;

        // Path
        const path = document.getElementById('filter-path').value;
        if (path) filters.path = path;

        app.assetSelector.setFilters(filters);
    }

    /**
     * Save selected assets
     */
    async function saveSelectedAssets() {
        const config = configManager.getConfig();
        const savePath = config.paths.savePath;

        if (!savePath) {
            Toast.warning('Please configure save path in Settings');
            return;
        }

        const result = await app.assetSelector.saveSelectedAssets(savePath);

        if (result.success) {
            // Display result in metadata viewer
            const viewer = document.getElementById('metadata-viewer');
            viewer.innerHTML = `<pre><code>${Utils.syntaxHighlight(result.results)}</code></pre>`;
        }
    }

    /**
     * Show asset details modal
     */
    async function showAssetDetails(asset) {
        try {
            const metadata = await app.api.getMetadata(asset.path);

            Modal.open({
                title: asset.name,
                body: `
                    <div class="asset-detail">
                        <div class="asset-detail-preview">
                            ${asset.thumbnail ?
                                `<img src="${asset.thumbnail}" alt="${asset.name}">` :
                                `<span class="asset-icon-large">${Utils.getFileIcon(Utils.getFileType(asset.mimeType))}</span>`
                            }
                        </div>
                        <div class="asset-detail-info">
                            <h4>Metadata</h4>
                            <pre><code>${Utils.syntaxHighlight(metadata)}</code></pre>
                        </div>
                    </div>
                `,
                buttons: [
                    {
                        text: 'Download',
                        class: 'btn-primary',
                        onClick: () => downloadAsset(asset.path),
                        closeOnClick: false
                    },
                    {
                        text: 'Close',
                        class: 'btn-secondary'
                    }
                ]
            });
        } catch (error) {
            Toast.error('Failed to load asset details');
        }
    }

    /**
     * Setup code tabs
     */
    function setupCodeTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;

                // Update tab buttons
                document.querySelectorAll('.tab-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.tab === tabId);
                });

                // Update tab content
                document.querySelectorAll('.code-tab').forEach(tab => {
                    tab.classList.toggle('active', tab.id === `tab-${tabId}`);
                });
            });
        });
    }

    /**
     * Setup HTTP API page
     */
    function setupApiPage() {
        // List Assets
        document.getElementById('list-assets-btn').addEventListener('click', () => {
            listAssets();
        });

        // Upload
        const uploadFile = document.getElementById('upload-file');
        uploadFile.addEventListener('change', (e) => {
            handleFileSelect(e.target.files);
        });

        document.getElementById('upload-btn').addEventListener('click', () => {
            uploadAssets();
        });

        // Download
        document.getElementById('download-btn').addEventListener('click', () => {
            downloadAsset();
        });

        // Download destination change handler
        const downloadDestination = document.getElementById('download-destination');
        if (downloadDestination) {
            downloadDestination.addEventListener('change', (e) => {
                const hint = document.getElementById('download-path-hint');
                const pathSpan = document.getElementById('server-download-path');
                if (e.target.value === 'server') {
                    const config = configManager.getConfig();
                    pathSpan.textContent = config.paths.downloadPath || '/var/downloads';
                    hint.style.display = 'block';
                } else {
                    hint.style.display = 'none';
                }
            });
        }

        // Get Metadata
        document.getElementById('get-meta-btn').addEventListener('click', () => {
            getMetadata();
        });

        // Update Metadata
        document.getElementById('update-meta-btn').addEventListener('click', () => {
            updateMetadata();
        });
    }

    /**
     * List assets API call
     */
    async function listAssets() {
        const path = document.getElementById('list-path').value || '/content/dam';
        const limit = parseInt(document.getElementById('list-limit').value) || 20;
        const resultEl = document.getElementById('list-result');

        try {
            resultEl.classList.add('show');
            resultEl.innerHTML = '<div class="loading-spinner">Loading...</div>';

            const result = await app.api.listAssets(path, { limit });
            console.log('List result:', result);
            console.log('Assets:', result.assets);

            // Render asset cards instead of JSON
            resultEl.innerHTML = renderAssetList(result.assets, path);
            Toast.success(`Loaded ${result.assets.length} assets`);
        } catch (error) {
            resultEl.innerHTML = `<div class="error-message">${error.message}</div>`;
            Toast.error('Failed to list assets');
        }
    }

    /**
     * Render asset list as cards
     */
    function renderAssetList(assets, basePath) {
        if (!assets || assets.length === 0) {
            return '<div class="empty-message">No assets found</div>';
        }

        const cards = assets.map(asset => {
            const fileType = Utils.getFileType(asset.mimeType);
            const icon = Utils.getFileIcon(fileType);
            const isImage = fileType === 'image';
            const config = configManager.getConfig();
            const thumbUrl = isImage ? `${config.server.host}/api/assets${asset.path.replace('/content/dam', '')}/renditions/cq5dam.thumbnail.140.100.png` : '';

            return `
                <div class="asset-list-card" data-path="${Utils.escapeHtml(asset.path)}">
                    <div class="asset-list-thumb">
                        ${isImage && thumbUrl ?
                            `<img src="${thumbUrl}" alt="${Utils.escapeHtml(asset.name)}" onerror="this.parentElement.innerHTML='<span class=\\'asset-icon\\'>${icon}</span>'">` :
                            `<span class="asset-icon">${icon}</span>`
                        }
                    </div>
                    <div class="asset-list-info">
                        <div class="asset-list-name" title="${Utils.escapeHtml(asset.name)}">${Utils.escapeHtml(asset.name)}</div>
                        <div class="asset-list-meta">
                            ${asset.mimeType || 'Unknown type'}
                            ${asset.size ? ' • ' + Utils.formatFileSize(asset.size) : ''}
                        </div>
                    </div>
                    <div class="asset-list-actions">
                        <button class="btn-sm btn-secondary" onclick="viewAssetMetadata('${Utils.escapeHtml(asset.path)}')">Metadata</button>
                        <button class="btn-sm btn-primary" onclick="downloadAssetFromList('${Utils.escapeHtml(asset.path)}')">Download</button>
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="asset-list-container">${cards}</div>`;
    }

    // Global functions for button clicks
    window.viewAssetMetadata = async function(path) {
        try {
            const metadata = await app.api.getMetadata(path);
            Modal.open({
                title: 'Asset Metadata',
                body: `<pre style="max-height: 400px; overflow: auto;"><code>${Utils.syntaxHighlight(metadata)}</code></pre>`,
                buttons: [{ text: 'Close', class: 'btn-secondary' }]
            });
        } catch (error) {
            Toast.error('Failed to load metadata');
        }
    };

    window.downloadAssetFromList = async function(path) {
        try {
            const blob = await app.api.downloadAsset(path, 'original');
            const filename = path.split('/').pop();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            Toast.success(`Downloaded: ${filename}`);
        } catch (error) {
            Toast.error('Failed to download');
        }
    };

    /**
     * Handle file selection for upload
     */
    function handleFileSelect(files) {
        app.uploadFiles = Array.from(files);
        const preview = document.getElementById('upload-preview');
        preview.innerHTML = '';

        app.uploadFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'upload-preview-item';
            item.innerHTML = `
                <span>${Utils.escapeHtml(file.name)} (${Utils.formatFileSize(file.size)})</span>
                <span class="remove" data-index="${index}">&times;</span>
            `;

            item.querySelector('.remove').addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                app.uploadFiles.splice(idx, 1);
                handleFileSelect(app.uploadFiles);
            });

            preview.appendChild(item);
        });
    }

    /**
     * Upload assets
     */
    async function uploadAssets() {
        if (app.uploadFiles.length === 0) {
            Toast.warning('Please select files to upload');
            return;
        }

        const path = document.getElementById('upload-path').value ||
            configManager.get('paths.uploadPath') ||
            '/content/dam/uploads';
        const progressBar = document.getElementById('upload-progress');
        const progressFill = progressBar.querySelector('.progress-fill');
        const progressText = progressBar.querySelector('.progress-text');
        const resultEl = document.getElementById('upload-result');

        progressBar.style.display = 'block';
        resultEl.classList.add('show');
        resultEl.innerHTML = '<pre>Uploading...</pre>';

        const results = [];
        let completedCount = 0;

        for (const file of app.uploadFiles) {
            try {
                const result = await app.api.uploadAsset(file, path, (progress) => {
                    const totalProgress = ((completedCount + progress / 100) / app.uploadFiles.length) * 100;
                    progressFill.style.width = `${totalProgress}%`;
                    progressText.textContent = `${Math.round(totalProgress)}%`;
                });

                results.push({
                    file: file.name,
                    success: true,
                    result
                });
                completedCount++;
            } catch (error) {
                results.push({
                    file: file.name,
                    success: false,
                    error: error.message
                });
                completedCount++;
            }
        }

        progressFill.style.width = '100%';
        progressText.textContent = '100%';

        resultEl.innerHTML = `<pre>${Utils.syntaxHighlight(results)}</pre>`;

        const successCount = results.filter(r => r.success).length;
        if (successCount === results.length) {
            Toast.success(`${successCount} files uploaded successfully`);
        } else {
            Toast.warning(`${successCount}/${results.length} files uploaded`);
        }

        // Clear upload files
        app.uploadFiles = [];
        document.getElementById('upload-preview').innerHTML = '';
        document.getElementById('upload-file').value = '';

        setTimeout(() => {
            progressBar.style.display = 'none';
        }, 2000);
    }

    /**
     * Download asset
     */
    async function downloadAsset(path) {
        const assetPath = path || document.getElementById('download-path').value;
        const rendition = document.getElementById('download-rendition')?.value || 'original';
        const destination = document.getElementById('download-destination')?.value || 'browser';
        const resultEl = document.getElementById('download-result');

        if (!assetPath) {
            Toast.warning('Please enter asset path');
            return;
        }

        try {
            if (resultEl) {
                resultEl.classList.add('show');
                resultEl.innerHTML = '<pre>Downloading...</pre>';
            }

            if (destination === 'server') {
                // Download to server
                const result = await app.api.downloadToServer(assetPath, rendition);

                if (resultEl) {
                    resultEl.innerHTML = `<pre>${Utils.syntaxHighlight({
                        success: true,
                        filename: result.filename,
                        path: result.path,
                        size: Utils.formatFileSize(result.size),
                        contentType: result.contentType
                    })}</pre>`;
                }

                Toast.success(`Saved to server: ${result.path}`);
            } else {
                // Download to browser
                const blob = await app.api.downloadAsset(assetPath, rendition);
                const filename = assetPath.split('/').pop();

                // Trigger browser download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                if (resultEl) {
                    resultEl.innerHTML = `<pre>${Utils.syntaxHighlight({
                        success: true,
                        filename,
                        size: Utils.formatFileSize(blob.size),
                        type: blob.type
                    })}</pre>`;
                }

                Toast.success(`Downloaded: ${filename}`);
            }
        } catch (error) {
            if (resultEl) {
                resultEl.innerHTML = `<pre class="error">${error.message}</pre>`;
            }
            Toast.error('Failed to download asset');
        }
    }

    /**
     * Get metadata schema from /jcr:content/metadata
     */
    async function getMetadata() {
        const path = document.getElementById('meta-get-path').value;
        const resultEl = document.getElementById('meta-get-result');

        if (!path) {
            Toast.warning('Please enter asset path');
            return;
        }

        try {
            resultEl.classList.add('show');
            resultEl.innerHTML = '<pre>Loading...</pre>';

            // Use getMetadataSchema to get all metadata from /jcr:content/metadata
            const schema = await app.api.getMetadataSchema(path);

            // Render organized by namespace
            resultEl.innerHTML = renderMetadataSchema(schema);
            Toast.success('Metadata schema loaded');
        } catch (error) {
            resultEl.innerHTML = `<pre class="error">${error.message}</pre>`;
            Toast.error('Failed to get metadata schema');
        }
    }

    /**
     * Render metadata schema organized by namespace
     */
    function renderMetadataSchema(schema) {
        const namespaces = Object.keys(schema.namespaces).sort();

        if (namespaces.length === 0) {
            return '<pre>No metadata found</pre>';
        }

        let html = '<div class="metadata-schema">';

        // Summary
        html += `<div class="metadata-summary">
            <strong>Total Properties:</strong> ${Object.keys(schema.properties).length}
            <strong style="margin-left: 20px;">Namespaces:</strong> ${namespaces.filter(n => n !== '_default').join(', ')}
        </div>`;

        // By namespace
        for (const ns of namespaces) {
            const props = schema.namespaces[ns];
            const nsLabel = ns === '_default' ? 'Other' : ns;
            const propCount = Object.keys(props).length;

            html += `<div class="metadata-namespace">
                <div class="namespace-header">${nsLabel} (${propCount})</div>
                <div class="namespace-props">`;

            for (const [key, value] of Object.entries(props)) {
                const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;
                html += `<div class="metadata-prop">
                    <span class="prop-key">${Utils.escapeHtml(key)}</span>
                    <span class="prop-value">${Utils.escapeHtml(String(displayValue))}</span>
                </div>`;
            }

            html += '</div></div>';
        }

        // Raw JSON toggle
        html += `<details class="raw-json-details">
            <summary>View Raw JSON</summary>
            <pre>${Utils.syntaxHighlight(schema.raw)}</pre>
        </details>`;

        html += '</div>';
        return html;
    }

    /**
     * Update metadata
     */
    async function updateMetadata() {
        const path = document.getElementById('meta-update-path').value;
        const jsonInput = document.getElementById('meta-update-json').value;
        const resultEl = document.getElementById('meta-update-result');

        if (!path) {
            Toast.warning('Please enter asset path');
            return;
        }

        let metadata;
        try {
            metadata = JSON.parse(jsonInput);
        } catch (e) {
            Toast.error('Invalid JSON format');
            return;
        }

        try {
            resultEl.classList.add('show');
            resultEl.innerHTML = '<pre>Updating...</pre>';

            const result = await app.api.updateMetadata(path, metadata);

            resultEl.innerHTML = `<pre>${Utils.syntaxHighlight(result)}</pre>`;
            Toast.success('Metadata updated');
        } catch (error) {
            resultEl.innerHTML = `<pre class="error">${error.message}</pre>`;
            Toast.error('Failed to update metadata');
        }
    }

    /**
     * Setup Settings page
     */
    function setupSettingsPage() {
        // Save settings
        document.getElementById('save-settings').addEventListener('click', () => {
            saveSettings();
        });

        // Reset settings
        document.getElementById('reset-settings').addEventListener('click', () => {
            Modal.confirm('Reset all settings to defaults?', () => {
                configManager.resetConfig();
                loadSettings();
                Toast.success('Settings reset to defaults');
            });
        });

        // Test connection
        document.getElementById('test-connection').addEventListener('click', async () => {
            await testConnection();
        });

        // Export config
        document.getElementById('export-settings').addEventListener('click', () => {
            exportConfig();
        });

        // Import config
        document.getElementById('import-settings').addEventListener('click', () => {
            document.getElementById('import-config-file').click();
        });

        document.getElementById('import-config-file').addEventListener('change', (e) => {
            importConfig(e.target.files[0]);
        });

        // Generate Token
        document.getElementById('generate-token-btn').addEventListener('click', () => {
            generateAccessToken();
        });
    }

    /**
     * Load settings from .env file via server API
     */
    async function loadSettings() {
        try {
            const response = await fetch('/api/env');
            const data = await response.json();

            if (data.exists && data.config) {
                const env = data.config;
                console.log('[loadSettings] Loaded from .env:', env);

                // Server Configuration
                document.getElementById('settings-host').value = env.AEM_HOST || '';
                document.getElementById('settings-delivery').value = env.AEM_DELIVERY_URL || '';
                document.getElementById('settings-repo-id').value = env.AEM_REPOSITORY_ID || '';

                // Authentication
                document.getElementById('settings-ims-org').value = env.IMS_ORG || '';
                document.getElementById('settings-api-key').value = env.API_KEY || '';
                document.getElementById('settings-client-secret').value = env.CLIENT_SECRET || '';
                document.getElementById('settings-tech-account').value = env.TECHNICAL_ACCOUNT_ID || '';
                document.getElementById('settings-tech-email').value = env.TECHNICAL_ACCOUNT_EMAIL || '';
                console.log('[loadSettings] CLIENT_SECRET:', env.CLIENT_SECRET);
                console.log('[loadSettings] TECHNICAL_ACCOUNT_ID:', env.TECHNICAL_ACCOUNT_ID);
                document.getElementById('settings-ims-endpoint').value = env.IMS_ENDPOINT || 'ims-na1.adobelogin.com';
                document.getElementById('settings-metascopes').value = env.METASCOPES || 'ent_aem_cloud_api';

                // Private Key - not stored in .env, leave empty for manual input
                document.getElementById('settings-private-key').value = '';

                // Paths
                document.getElementById('settings-browse-path').value = env.BROWSE_PATH || '/content/dam';
                document.getElementById('settings-upload-path').value = env.UPLOAD_PATH || '/content/dam/uploads';
                document.getElementById('settings-download-path').value = env.DOWNLOAD_PATH || '/var/downloads';
                document.getElementById('settings-save-path').value = env.SAVE_PATH || '/content/dam/selected';

                // Access Token
                document.getElementById('settings-token').value = env.ACCESS_TOKEN || '';
                updateTokenExpiryDisplay(env.ACCESS_TOKEN);

                // Also update configManager for runtime use
                updateConfigManagerFromEnv(env);

                console.log('.env file loaded successfully', env);
            } else {
                // Fallback to localStorage config
                loadSettingsFromLocalStorage();
            }
        } catch (error) {
            console.warn('Failed to load .env file, falling back to localStorage:', error);
            loadSettingsFromLocalStorage();
        }

        // Load non-.env settings from localStorage (UI preferences)
        loadUISettings();
    }

    /**
     * Load settings from localStorage (fallback)
     */
    function loadSettingsFromLocalStorage() {
        const config = configManager.getConfig();

        // Server Configuration
        document.getElementById('settings-host').value = config.server.host || '';
        document.getElementById('settings-delivery').value = config.server.deliveryUrl || '';
        document.getElementById('settings-repo-id').value = config.server.repositoryId || '';

        // Authentication
        document.getElementById('settings-ims-org').value = config.auth.imsOrg || '';
        document.getElementById('settings-api-key').value = config.auth.apiKey || '';
        document.getElementById('settings-client-secret').value = config.auth.clientSecret || '';
        document.getElementById('settings-tech-account').value = config.auth.technicalAccountId || '';
        document.getElementById('settings-tech-email').value = config.auth.technicalAccountEmail || '';
        document.getElementById('settings-private-key').value = config.auth.privateKey || '';
        document.getElementById('settings-ims-endpoint').value = config.auth.imsEndpoint || 'ims-na1.adobelogin.com';
        document.getElementById('settings-metascopes').value = config.auth.metascopes || 'ent_aem_cloud_api';

        // Paths
        document.getElementById('settings-browse-path').value = config.paths.browsePath || '';
        document.getElementById('settings-upload-path').value = config.paths.uploadPath || '';
        document.getElementById('settings-download-path').value = config.paths.downloadPath || '';
        document.getElementById('settings-save-path').value = config.paths.savePath || '';
    }

    /**
     * Load UI settings from localStorage (non-sensitive settings)
     * Note: Does NOT overwrite values already loaded from .env
     */
    function loadUISettings() {
        const config = configManager.getConfig();

        // Access Token - only set if not already populated from .env
        const tokenEl = document.getElementById('settings-token');
        if (!tokenEl.value) {
            tokenEl.value = config.auth.accessToken || '';
            updateTokenExpiryDisplay(config.auth.accessToken);
        }

        // Asset Selector Options
        document.getElementById('settings-env').value = config.selector.env || 'PROD';
        document.getElementById('settings-selection-mode').value = config.selector.selectionMode || 'multiple';
        document.getElementById('settings-view').value = config.selector.defaultView || 'grid';
        document.getElementById('settings-show-metadata').checked = config.selector.showMetadata !== false;
        document.getElementById('settings-show-filters').checked = config.selector.showFilters !== false;

        // API Options
        document.getElementById('settings-timeout').value = config.api.timeout || 30000;
        document.getElementById('settings-max-upload').value = (config.api.maxUploadSize || 104857600) / 1048576;
        document.getElementById('settings-auto-refresh').checked = config.api.autoRefreshToken !== false;
    }

    /**
     * Update configManager from .env values
     */
    function updateConfigManagerFromEnv(env) {
        const config = configManager.getConfig();

        config.server.host = env.AEM_HOST || '';
        config.server.deliveryUrl = env.AEM_DELIVERY_URL || '';
        config.server.repositoryId = env.AEM_REPOSITORY_ID || '';

        config.auth.imsOrg = env.IMS_ORG || '';
        config.auth.apiKey = env.API_KEY || '';
        config.auth.clientSecret = env.CLIENT_SECRET || '';
        config.auth.technicalAccountId = env.TECHNICAL_ACCOUNT_ID || '';
        config.auth.technicalAccountEmail = env.TECHNICAL_ACCOUNT_EMAIL || '';
        config.auth.imsEndpoint = env.IMS_ENDPOINT || 'ims-na1.adobelogin.com';
        config.auth.metascopes = env.METASCOPES || 'ent_aem_cloud_api';
        config.auth.accessToken = env.ACCESS_TOKEN || '';
        // Private Key is not stored in .env, keep empty
        config.auth.privateKey = '';

        config.paths.browsePath = env.BROWSE_PATH || '/content/dam';
        config.paths.uploadPath = env.UPLOAD_PATH || '/content/dam/uploads';
        config.paths.downloadPath = env.DOWNLOAD_PATH || '/var/downloads';
        config.paths.savePath = env.SAVE_PATH || '/content/dam/selected';

        configManager.saveConfig(config);
    }

    /**
     * Update token expiry display
     */
    function updateTokenExpiryDisplay(token) {
        const expiryEl = document.getElementById('token-expiry');
        if (!token) {
            expiryEl.textContent = '';
            expiryEl.className = 'token-expiry';
            return;
        }

        try {
            const expiration = app.tokenGenerator.getTokenExpiration(token);
            if (expiration) {
                const isExpired = app.tokenGenerator.isTokenExpired(token);
                const expiryText = `(Expires: ${expiration.toLocaleString()})`;
                expiryEl.textContent = expiryText;
                expiryEl.className = `token-expiry ${isExpired ? 'expired' : 'valid'}`;
            }
        } catch (e) {
            expiryEl.textContent = '';
            expiryEl.className = 'token-expiry';
        }
    }

    /**
     * Save settings to .env file and localStorage
     */
    async function saveSettings() {
        // Prepare .env data (sensitive credentials)
        const privateKey = document.getElementById('settings-private-key').value.trim();
        const envData = {
            // Server Configuration
            AEM_HOST: document.getElementById('settings-host').value.trim(),
            AEM_DELIVERY_URL: document.getElementById('settings-delivery').value.trim(),
            AEM_REPOSITORY_ID: document.getElementById('settings-repo-id').value.trim(),

            // Authentication
            IMS_ORG: document.getElementById('settings-ims-org').value.trim(),
            API_KEY: document.getElementById('settings-api-key').value.trim(),
            CLIENT_SECRET: document.getElementById('settings-client-secret').value.trim(),
            TECHNICAL_ACCOUNT_ID: document.getElementById('settings-tech-account').value.trim(),
            TECHNICAL_ACCOUNT_EMAIL: document.getElementById('settings-tech-email').value.trim(),
            IMS_ENDPOINT: document.getElementById('settings-ims-endpoint').value.trim() || 'ims-na1.adobelogin.com',
            METASCOPES: document.getElementById('settings-metascopes').value.trim() || 'ent_aem_cloud_api',

            // Access Token
            ACCESS_TOKEN: document.getElementById('settings-token').value.trim(),

            // Paths
            BROWSE_PATH: document.getElementById('settings-browse-path').value.trim() || '/content/dam',
            UPLOAD_PATH: document.getElementById('settings-upload-path').value.trim(),
            DOWNLOAD_PATH: document.getElementById('settings-download-path').value.trim(),
            SAVE_PATH: document.getElementById('settings-save-path').value.trim()
        };

        // Save to .env file via server API
        try {
            const response = await fetch('/api/env', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(envData)
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to save .env file');
            }

            console.log('.env file saved successfully');
        } catch (error) {
            console.error('Failed to save .env file:', error);
            Toast.warning('Failed to save to .env file. Settings saved to browser only.');
        }

        // Also save to localStorage (for runtime use and UI preferences)
        const config = {
            server: {
                host: envData.AEM_HOST,
                deliveryUrl: envData.AEM_DELIVERY_URL,
                repositoryId: envData.AEM_REPOSITORY_ID
            },
            auth: {
                imsOrg: envData.IMS_ORG,
                apiKey: envData.API_KEY,
                clientSecret: envData.CLIENT_SECRET,
                technicalAccountId: envData.TECHNICAL_ACCOUNT_ID,
                technicalAccountEmail: envData.TECHNICAL_ACCOUNT_EMAIL,
                privateKey: privateKey,
                imsEndpoint: envData.IMS_ENDPOINT,
                metascopes: envData.METASCOPES,
                accessToken: document.getElementById('settings-token').value.trim()
            },
            paths: {
                browsePath: envData.BROWSE_PATH,
                uploadPath: envData.UPLOAD_PATH,
                downloadPath: envData.DOWNLOAD_PATH,
                savePath: envData.SAVE_PATH
            },
            selector: {
                env: document.getElementById('settings-env').value,
                selectionMode: document.getElementById('settings-selection-mode').value,
                defaultView: document.getElementById('settings-view').value,
                showMetadata: document.getElementById('settings-show-metadata').checked,
                showFilters: document.getElementById('settings-show-filters').checked
            },
            api: {
                timeout: parseInt(document.getElementById('settings-timeout').value) || 30000,
                maxUploadSize: (parseInt(document.getElementById('settings-max-upload').value) || 100) * 1048576,
                autoRefreshToken: document.getElementById('settings-auto-refresh').checked
            }
        };

        if (configManager.saveConfig(config)) {
            Toast.success('Settings saved successfully');
            // Reinitialize API client with new settings
            app.api = new AEMAssetAPI();
            app.assetSelector = new AEMAssetSelector();
        } else {
            Toast.error('Failed to save settings');
        }
    }

    /**
     * Generate Access Token
     */
    async function generateAccessToken() {
        const statusEl = document.getElementById('token-status');
        const tokenEl = document.getElementById('settings-token');

        // Get credentials from form
        const clientId = document.getElementById('settings-api-key').value.trim();
        const clientSecret = document.getElementById('settings-client-secret').value.trim();
        const technicalAccountId = document.getElementById('settings-tech-account').value.trim();
        const imsOrg = document.getElementById('settings-ims-org').value.trim();
        const privateKey = document.getElementById('settings-private-key').value.trim();
        const imsEndpoint = document.getElementById('settings-ims-endpoint').value.trim() || 'ims-na1.adobelogin.com';
        const metascopes = document.getElementById('settings-metascopes').value.trim() || 'ent_aem_cloud_api';

        // Validate required fields
        if (!clientId || !clientSecret || !technicalAccountId || !imsOrg || !privateKey) {
            Toast.error('Please fill in all authentication fields');
            statusEl.textContent = 'Missing required fields';
            statusEl.className = 'token-status error';
            return;
        }

        try {
            statusEl.textContent = 'Generating JWT...';
            statusEl.className = 'token-status loading';

            // Step 1: Generate JWT
            const jwt = await app.tokenGenerator.generateJWT({
                clientId,
                technicalAccountId,
                imsOrg,
                privateKey,
                metascopes,
                imsEndpoint
            });

            statusEl.textContent = 'JWT generated. Exchanging for Access Token...';

            // Step 2: Exchange JWT for Access Token
            try {
                const tokenResponse = await app.tokenGenerator.exchangeJWTForToken({
                    clientId,
                    clientSecret,
                    jwt,
                    imsEndpoint
                });

                // Update token field
                tokenEl.value = tokenResponse.accessToken;
                updateTokenExpiryDisplay(tokenResponse.accessToken);

                statusEl.textContent = `Token generated successfully! Expires in ${Math.round(tokenResponse.expiresIn / 3600)} hours`;
                statusEl.className = 'token-status success';

                Toast.success('Access Token generated successfully');

            } catch (exchangeError) {
                // If exchange fails due to CORS, show JWT and instructions
                statusEl.innerHTML = `
                    <span class="error">CORS blocked direct exchange.</span><br>
                    <small>JWT generated successfully. Use curl or a proxy server to exchange:</small>
                `;
                statusEl.className = 'token-status';

                // Show the JWT in a modal with curl command
                showJWTExchangeModal(jwt, clientId, clientSecret, imsEndpoint);
            }

        } catch (error) {
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.className = 'token-status error';
            Toast.error('Failed to generate token: ' + error.message);
        }
    }

    /**
     * Show JWT Exchange Modal (for CORS workaround)
     */
    function showJWTExchangeModal(jwt, clientId, clientSecret, imsEndpoint) {
        const curlCommand = `curl -X POST "https://${imsEndpoint}/ims/exchange/jwt" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "client_id=${clientId}" \\
  -d "client_secret=${clientSecret}" \\
  -d "jwt_token=${jwt}"`;

        Modal.open({
            title: 'JWT Token Exchange',
            body: `
                <p>JWT was generated successfully, but browser CORS policy prevents direct exchange with Adobe IMS.</p>
                <p><strong>Option 1:</strong> Run this curl command in terminal:</p>
                <div class="code-viewer" style="margin: 16px 0;">
                    <pre><code id="curl-command">${Utils.escapeHtml(curlCommand)}</code></pre>
                </div>
                <p><strong>Option 2:</strong> Copy the JWT token and use a proxy server or Postman.</p>
                <div class="form-group">
                    <label>Generated JWT Token:</label>
                    <textarea id="jwt-token-display" rows="4" style="font-family: monospace; font-size: 11px;">${jwt}</textarea>
                </div>
            `,
            buttons: [
                {
                    text: 'Copy Curl Command',
                    class: 'btn-primary',
                    onClick: () => {
                        Utils.copyToClipboard(curlCommand);
                        Toast.success('Curl command copied to clipboard');
                    },
                    closeOnClick: false
                },
                {
                    text: 'Copy JWT',
                    class: 'btn-secondary',
                    onClick: () => {
                        Utils.copyToClipboard(jwt);
                        Toast.success('JWT copied to clipboard');
                    },
                    closeOnClick: false
                },
                {
                    text: 'Close',
                    class: 'btn-secondary'
                }
            ]
        });
    }

    /**
     * Test connection
     */
    async function testConnection() {
        Toast.info('Testing connection...');

        try {
            const result = await app.api.testConnection();
            if (result.success) {
                Toast.success('Connection successful!');
            } else {
                Toast.error(`Connection failed: ${result.message}`);
            }
        } catch (error) {
            Toast.error(`Connection failed: ${error.message}`);
        }
    }

    /**
     * Export configuration
     */
    function exportConfig() {
        const configJson = configManager.exportConfig();
        Utils.downloadFile(configJson, 'aem-config.json', 'application/json');
        Toast.success('Configuration exported');
    }

    /**
     * Import configuration
     */
    async function importConfig(file) {
        if (!file) return;

        try {
            const content = await Utils.readFileAsText(file);
            if (configManager.importConfig(content)) {
                loadSettings();
                Toast.success('Configuration imported successfully');
            } else {
                Toast.error('Failed to import configuration');
            }
        } catch (error) {
            Toast.error('Failed to read configuration file');
        }
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export app for debugging
    window.app = app;

})();
