/**
 * AEM Asset Selector & HTTP API Configuration
 * 설정 관리 모듈
 */

const CONFIG_STORAGE_KEY = 'aem-asset-config';

// 기본 설정값
const DEFAULT_CONFIG = {
    // Server Configuration
    server: {
        host: '',
        deliveryUrl: '',
        repositoryId: ''
    },

    // Authentication
    auth: {
        imsOrg: '',
        apiKey: '',
        clientSecret: '',
        technicalAccountId: '',
        technicalAccountEmail: '',
        privateKey: '',
        imsEndpoint: 'ims-na1.adobelogin.com',
        metascopes: 'ent_aem_cloud_api',
        accessToken: ''
    },

    // Paths
    paths: {
        browsePath: '/content/dam',
        uploadPath: '/content/dam/uploads',
        downloadPath: '/var/downloads',
        savePath: '/content/dam/selected'
    },

    // Asset Selector Options
    selector: {
        env: 'PROD',
        selectionMode: 'multiple',
        defaultView: 'grid',
        showMetadata: true,
        showFilters: true
    },

    // API Options
    api: {
        timeout: 30000,
        maxUploadSize: 104857600, // 100MB
        autoRefreshToken: true
    }
};

/**
 * Configuration Manager
 */
class ConfigManager {
    constructor() {
        this.config = this.loadConfig();
    }

    /**
     * Load configuration from localStorage
     */
    loadConfig() {
        try {
            const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
            if (stored) {
                return this.mergeConfig(DEFAULT_CONFIG, JSON.parse(stored));
            }
        } catch (e) {
            console.error('Failed to load config:', e);
        }
        return { ...DEFAULT_CONFIG };
    }

    /**
     * Deep merge configurations
     */
    mergeConfig(defaults, stored) {
        const result = { ...defaults };
        for (const key in stored) {
            if (stored.hasOwnProperty(key)) {
                if (typeof stored[key] === 'object' && !Array.isArray(stored[key])) {
                    result[key] = { ...defaults[key], ...stored[key] };
                } else {
                    result[key] = stored[key];
                }
            }
        }
        return result;
    }

    /**
     * Save configuration to localStorage
     */
    saveConfig(config) {
        try {
            this.config = this.mergeConfig(DEFAULT_CONFIG, config);
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(this.config));
            return true;
        } catch (e) {
            console.error('Failed to save config:', e);
            return false;
        }
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Get specific config value
     */
    get(path) {
        const keys = path.split('.');
        let value = this.config;
        for (const key of keys) {
            if (value && typeof value === 'object') {
                value = value[key];
            } else {
                return undefined;
            }
        }
        return value;
    }

    /**
     * Set specific config value
     */
    set(path, value) {
        const keys = path.split('.');
        let obj = this.config;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]]) {
                obj[keys[i]] = {};
            }
            obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        this.saveConfig(this.config);
    }

    /**
     * Reset to default configuration
     */
    resetConfig() {
        this.config = { ...DEFAULT_CONFIG };
        localStorage.removeItem(CONFIG_STORAGE_KEY);
        return this.config;
    }

    /**
     * Export configuration as JSON
     */
    exportConfig() {
        const exportData = { ...this.config };
        // Remove sensitive data for export
        delete exportData.auth.accessToken;
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Import configuration from JSON
     */
    importConfig(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            return this.saveConfig(imported);
        } catch (e) {
            console.error('Failed to import config:', e);
            return false;
        }
    }

    /**
     * Validate configuration
     */
    validate() {
        const errors = [];

        if (!this.config.server.host) {
            errors.push('AEM Host URL is required');
        }

        if (!this.config.auth.accessToken) {
            errors.push('Access Token is required');
        }

        if (!this.config.auth.apiKey) {
            errors.push('API Key is required');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Get API headers
     */
    getApiHeaders() {
        return {
            'Authorization': `Bearer ${this.config.auth.accessToken}`,
            'x-api-key': this.config.auth.apiKey,
            'x-gw-ims-org-id': this.config.auth.imsOrg
        };
    }

    /**
     * Get Asset Selector configuration
     */
    getSelectorConfig() {
        return {
            imsOrg: this.config.auth.imsOrg,
            imsToken: this.config.auth.accessToken,
            apiKey: this.config.auth.apiKey,
            repositoryId: this.config.server.repositoryId,
            env: this.config.selector.env,
            rootPath: this.config.paths.browsePath,
            selectionMode: this.config.selector.selectionMode
        };
    }
}

// Global config instance
window.configManager = new ConfigManager();
