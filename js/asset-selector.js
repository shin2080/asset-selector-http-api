/**
 * Adobe Asset Selector Integration
 * Using PureJSSelectors API from Adobe Experience Manager
 *
 * Documentation:
 * - https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/manage/asset-selector/asset-selector-integration/integrate-asset-selector-non-adobe-app
 * - https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/manage/asset-selector/asset-selector-properties
 */

class AdobeAssetSelector {
    constructor() {
        this.authService = null;
        this.selectedAssets = [];
        this.isInitialized = false;
        this.imsToken = null;
        this.callbacks = {
            onSelectionChange: null,
            onClose: null
        };
    }

    /**
     * Initialize IMS authentication service
     * Must be called before rendering the Asset Selector
     */
    initializeIMS() {
        const config = configManager.getConfig();

        if (!window.PureJSSelectors) {
            console.error('PureJSSelectors not loaded. Please include the Asset Selector script.');
            return false;
        }

        const imsProps = {
            imsClientId: config.auth.apiKey,
            imsScope: 'openid,AdobeID,read_organizations,additional_info.projectedProductContext',
            redirectUrl: window.location.href,
            modalMode: true,
            imsOrg: config.auth.imsOrg,
            onImsServiceInitialized: (service) => {
                console.log('[Asset Selector] IMS service initialized');
                this.authService = service;
            },
            onAccessTokenReceived: (token) => {
                console.log('[Asset Selector] Access token received');
                this.imsToken = token;
            },
            onAccessTokenExpired: () => {
                console.log('[Asset Selector] Access token expired');
                this.imsToken = null;
            },
            onErrorReceived: (type, message) => {
                console.error('[Asset Selector] IMS Error:', type, message);
                Toast.error(`Authentication error: ${message}`);
            }
        };

        try {
            this.authService = PureJSSelectors.registerAssetsSelectorsAuthService(imsProps);
            this.isInitialized = true;
            console.log('[Asset Selector] IMS registration complete');
            return true;
        } catch (error) {
            console.error('[Asset Selector] IMS initialization failed:', error);
            return false;
        }
    }

    /**
     * Get common Asset Selector properties
     */
    getCommonProps(options = {}) {
        const config = configManager.getConfig();
        const selectionType = document.getElementById('selector-selection-type')?.value || 'multiple';
        const colorScheme = document.getElementById('selector-color-scheme')?.value || 'light';
        const mimeFilter = document.getElementById('selector-mime-filter')?.value || '';

        const props = {
            imsOrg: config.auth.imsOrg,
            repositoryId: config.server.repositoryId || this.getRepositoryId(config.server.host),
            apiKey: config.auth.apiKey,
            colorScheme: colorScheme,
            selectionType: selectionType,
            hideTreeNav: false,

            // Callbacks
            onClose: () => {
                console.log('[Asset Selector] Closed');
                if (this.callbacks.onClose) {
                    this.callbacks.onClose();
                }
            },

            handleSelection: (assets) => {
                console.log('[Asset Selector] Selection confirmed:', assets);
                this.handleAssetSelection(assets);
            },

            handleAssetSelection: (asset) => {
                console.log('[Asset Selector] Asset selection changed:', asset);
                // This is called on each individual selection/deselection
            },

            // Filter configuration
            filterFormProps: mimeFilter ? {
                filterByMimeType: [mimeFilter]
            } : undefined,

            ...options
        };

        // Add filter schema if needed
        if (options.includeFilters !== false) {
            props.filterSchema = this.getFilterSchema();
        }

        return props;
    }

    /**
     * Extract repository ID from AEM host URL
     * e.g., https://author-p99503-e1699404.adobeaemcloud.com -> delivery-p99503-e1699404.adobeaemcloud.com
     */
    getRepositoryId(hostUrl) {
        try {
            const url = new URL(hostUrl);
            const hostname = url.hostname;
            // Convert author-pXXXXX-eXXXXXX to delivery-pXXXXX-eXXXXXX
            return hostname.replace('author-', 'delivery-');
        } catch (e) {
            console.warn('[Asset Selector] Could not parse repository ID from host URL');
            return '';
        }
    }

    /**
     * Open Asset Selector in Modal (Dialog) view
     */
    openModal(options = {}) {
        if (!this.checkInitialization()) return;

        const props = this.getCommonProps({
            ...options,
            rail: false  // Modal view
        });

        console.log('[Asset Selector] Opening modal with props:', props);

        try {
            PureJSSelectors.renderAssetSelectorWithAuthFlow(
                document.body,
                props,
                () => {
                    console.log('[Asset Selector] Modal rendered');
                }
            );
        } catch (error) {
            console.error('[Asset Selector] Failed to open modal:', error);
            Toast.error('Failed to open Asset Selector');
        }
    }

    /**
     * Render Asset Selector in Rail (Embedded) view
     */
    renderRail(container, options = {}) {
        if (!this.checkInitialization()) return;

        if (!container) {
            console.error('[Asset Selector] Container element is required for rail view');
            return;
        }

        // Clear container
        container.innerHTML = '';

        const props = this.getCommonProps({
            ...options,
            rail: true,  // Rail view
            noWrap: true,
            acvConfig: {
                selectionType: document.getElementById('selector-selection-type')?.value || 'multiple'
            }
        });

        console.log('[Asset Selector] Rendering rail view with props:', props);

        try {
            PureJSSelectors.renderAssetSelectorWithAuthFlow(
                container,
                props,
                () => {
                    console.log('[Asset Selector] Rail view rendered');
                }
            );
        } catch (error) {
            console.error('[Asset Selector] Failed to render rail view:', error);
            Toast.error('Failed to render Asset Selector');
        }
    }

    /**
     * Check if IMS is initialized
     */
    checkInitialization() {
        if (!window.PureJSSelectors) {
            Toast.error('Asset Selector script not loaded');
            return false;
        }

        if (!this.isInitialized) {
            console.log('[Asset Selector] Not initialized, initializing now...');
            return this.initializeIMS();
        }

        return true;
    }

    /**
     * Handle asset selection
     */
    handleAssetSelection(assets) {
        this.selectedAssets = assets.map(asset => this.normalizeAsset(asset));
        this.updateSelectedAssetsUI();

        if (this.callbacks.onSelectionChange) {
            this.callbacks.onSelectionChange(this.selectedAssets);
        }
    }

    /**
     * Normalize asset object from Adobe selector format
     */
    normalizeAsset(asset) {
        return {
            id: asset.id || asset['repo:assetId'],
            name: asset.name || asset['repo:name'],
            path: asset['repo:path'] || asset.path,
            mimeType: asset['dc:format'] || asset.mimeType,
            size: asset['dam:size'] || asset.size || 0,
            width: asset['tiff:imageWidth'],
            height: asset['tiff:imageHeight'],
            title: asset['dc:title'] || asset.name,
            description: asset['dc:description'],
            thumbnail: asset.thumbnail || asset['aem:thumbnail'],
            deliveryUrl: asset.url || asset['repo:url'],
            raw: asset
        };
    }

    /**
     * Update the selected assets UI
     */
    updateSelectedAssetsUI() {
        const listContainer = document.getElementById('selected-assets-list');
        const countBadge = document.getElementById('selected-count-badge');
        const actionsContainer = document.getElementById('selected-actions');

        if (!listContainer) return;

        countBadge.textContent = this.selectedAssets.length;

        if (this.selectedAssets.length === 0) {
            listContainer.innerHTML = '<p class="no-selection">No assets selected</p>';
            actionsContainer.style.display = 'none';
            return;
        }

        actionsContainer.style.display = 'flex';

        const html = this.selectedAssets.map(asset => `
            <div class="selected-asset-item" data-asset-id="${Utils.escapeHtml(asset.id)}">
                <div class="selected-asset-thumb">
                    ${asset.thumbnail ?
                        `<img src="${Utils.escapeHtml(asset.thumbnail)}" alt="${Utils.escapeHtml(asset.name)}">` :
                        `<span class="asset-icon">${Utils.getFileIcon(Utils.getFileType(asset.mimeType))}</span>`
                    }
                </div>
                <div class="selected-asset-info">
                    <div class="selected-asset-name">${Utils.escapeHtml(asset.name)}</div>
                    <div class="selected-asset-meta">
                        ${asset.mimeType || 'Unknown'}
                        ${asset.size ? '• ' + Utils.formatFileSize(asset.size) : ''}
                        ${asset.width && asset.height ? `• ${asset.width}x${asset.height}` : ''}
                    </div>
                </div>
                <button class="btn-remove-asset" onclick="assetSelector.removeAsset('${Utils.escapeHtml(asset.id)}')" title="Remove">×</button>
            </div>
        `).join('');

        listContainer.innerHTML = html;
    }

    /**
     * Remove an asset from selection
     */
    removeAsset(assetId) {
        this.selectedAssets = this.selectedAssets.filter(a => a.id !== assetId);
        this.updateSelectedAssetsUI();
    }

    /**
     * Clear all selected assets
     */
    clearSelection() {
        this.selectedAssets = [];
        this.updateSelectedAssetsUI();
    }

    /**
     * Get selected assets
     */
    getSelectedAssets() {
        return [...this.selectedAssets];
    }

    /**
     * Set callback for selection changes
     */
    onSelectionChange(callback) {
        this.callbacks.onSelectionChange = callback;
    }

    /**
     * Set callback for close event
     */
    onClose(callback) {
        this.callbacks.onClose = callback;
    }

    /**
     * Get filter schema for Asset Selector
     */
    getFilterSchema() {
        return [
            {
                header: 'File Type',
                groupKey: 'FileTypeGroup',
                fields: [
                    {
                        element: 'checkbox',
                        name: 'type',
                        options: [
                            { label: 'Images', value: 'image/*' },
                            { label: 'Videos', value: 'video/*' },
                            { label: 'Documents', value: 'application/pdf' },
                            { label: 'Audio', value: 'audio/*' }
                        ]
                    }
                ]
            },
            {
                header: 'Image Format',
                groupKey: 'ImageFormatGroup',
                fields: [
                    {
                        element: 'checkbox',
                        name: 'imageFormat',
                        options: [
                            { label: 'JPEG', value: 'image/jpeg' },
                            { label: 'PNG', value: 'image/png' },
                            { label: 'GIF', value: 'image/gif' },
                            { label: 'WebP', value: 'image/webp' },
                            { label: 'SVG', value: 'image/svg+xml' }
                        ]
                    }
                ]
            }
        ];
    }
}

// Create global instance
const assetSelector = new AdobeAssetSelector();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Try to initialize IMS when page loads
    setTimeout(() => {
        if (window.PureJSSelectors) {
            assetSelector.initializeIMS();
        }
    }, 1000);
});

// Export
window.AdobeAssetSelector = AdobeAssetSelector;
window.assetSelector = assetSelector;
