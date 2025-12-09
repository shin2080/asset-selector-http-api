/**
 * Utility Functions
 * 공통 유틸리티 함수 모음
 */

const Utils = {
    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Format date
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Get file extension
     */
    getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    },

    /**
     * Get file type from mime type
     */
    getFileType(mimeType) {
        if (!mimeType) return 'unknown';
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType.includes('pdf')) return 'pdf';
        if (mimeType.includes('document') || mimeType.includes('word')) return 'document';
        if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
        if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
        return 'file';
    },

    /**
     * Get icon for file type
     */
    getFileIcon(type) {
        const icons = {
            'image': '🖼️',
            'video': '🎬',
            'audio': '🎵',
            'pdf': '📄',
            'document': '📝',
            'spreadsheet': '📊',
            'presentation': '📑',
            'file': '📁',
            'folder': '📂',
            'unknown': '❓'
        };
        return icons[type] || icons.unknown;
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Generate unique ID
     */
    generateId() {
        return 'id_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Parse JSON safely
     */
    parseJson(str, defaultValue = null) {
        try {
            return JSON.parse(str);
        } catch (e) {
            return defaultValue;
        }
    },

    /**
     * Format JSON for display
     */
    formatJson(obj) {
        return JSON.stringify(obj, null, 2);
    },

    /**
     * Syntax highlight JSON
     */
    syntaxHighlight(json) {
        if (typeof json !== 'string') {
            json = JSON.stringify(json, null, 2);
        }
        json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function(match) {
            let cls = 'number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'key';
                } else {
                    cls = 'string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'boolean';
            } else if (/null/.test(match)) {
                cls = 'null';
            }
            return '<span class="json-' + cls + '">' + match + '</span>';
        });
    },

    /**
     * Copy text to clipboard
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                return true;
            } catch (e) {
                return false;
            } finally {
                document.body.removeChild(textarea);
            }
        }
    },

    /**
     * Download file
     */
    downloadFile(content, filename, contentType = 'application/octet-stream') {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Download from URL
     */
    async downloadFromUrl(url, filename) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
            return true;
        } catch (e) {
            console.error('Download failed:', e);
            return false;
        }
    },

    /**
     * Read file as data URL
     */
    readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    /**
     * Read file as text
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    /**
     * Validate URL
     */
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    },

    /**
     * Extract path from URL
     */
    extractPath(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname;
        } catch (_) {
            return url;
        }
    },

    /**
     * Join paths
     */
    joinPaths(...paths) {
        return paths
            .map((path, i) => {
                if (i === 0) {
                    return path.replace(/\/+$/, '');
                }
                return path.replace(/^\/+|\/+$/g, '');
            })
            .filter(Boolean)
            .join('/');
    },

    /**
     * Query string parser
     */
    parseQueryString(queryString) {
        const params = new URLSearchParams(queryString);
        const result = {};
        for (const [key, value] of params.entries()) {
            result[key] = value;
        }
        return result;
    },

    /**
     * Build query string
     */
    buildQueryString(params) {
        return new URLSearchParams(params).toString();
    },

    /**
     * Wait for condition
     */
    waitFor(condition, timeout = 5000, interval = 100) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const check = () => {
                if (condition()) {
                    resolve();
                } else if (Date.now() - startTime >= timeout) {
                    reject(new Error('Timeout waiting for condition'));
                } else {
                    setTimeout(check, interval);
                }
            };
            check();
        });
    },

    /**
     * Sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

/**
 * Toast Notification Manager
 */
const Toast = {
    container: null,

    init() {
        this.container = document.getElementById('toast-container');
    },

    show(message, type = 'info', duration = 3000) {
        if (!this.container) this.init();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-message">${Utils.escapeHtml(message)}</span>
            <button class="toast-close">&times;</button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.onclick = () => this.remove(toast);

        this.container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => this.remove(toast), duration);
        }

        return toast;
    },

    remove(toast) {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    },

    success(message, duration) {
        return this.show(message, 'success', duration);
    },

    error(message, duration) {
        return this.show(message, 'error', duration);
    },

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    },

    info(message, duration) {
        return this.show(message, 'info', duration);
    }
};

/**
 * Modal Manager
 */
const Modal = {
    element: null,
    titleEl: null,
    bodyEl: null,
    footerEl: null,

    init() {
        this.element = document.getElementById('modal');
        this.titleEl = document.getElementById('modal-title');
        this.bodyEl = document.getElementById('modal-body');
        this.footerEl = document.getElementById('modal-footer');

        const closeBtn = document.getElementById('modal-close');
        closeBtn.onclick = () => this.close();

        this.element.onclick = (e) => {
            if (e.target === this.element) {
                this.close();
            }
        };

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.element.classList.contains('show')) {
                this.close();
            }
        });
    },

    open(options = {}) {
        if (!this.element) this.init();

        this.titleEl.textContent = options.title || '';
        this.bodyEl.innerHTML = options.body || '';
        this.footerEl.innerHTML = '';

        if (options.buttons) {
            options.buttons.forEach(btn => {
                const button = document.createElement('button');
                button.className = `btn ${btn.class || 'btn-secondary'}`;
                button.textContent = btn.text;
                button.onclick = () => {
                    if (btn.onClick) btn.onClick();
                    if (btn.closeOnClick !== false) this.close();
                };
                this.footerEl.appendChild(button);
            });
        }

        this.element.classList.add('show');
        document.body.style.overflow = 'hidden';
    },

    close() {
        if (this.element) {
            this.element.classList.remove('show');
            document.body.style.overflow = '';
        }
    },

    confirm(message, onConfirm, onCancel) {
        this.open({
            title: 'Confirm',
            body: `<p>${Utils.escapeHtml(message)}</p>`,
            buttons: [
                {
                    text: 'Cancel',
                    class: 'btn-secondary',
                    onClick: onCancel
                },
                {
                    text: 'Confirm',
                    class: 'btn-primary',
                    onClick: onConfirm
                }
            ]
        });
    },

    alert(message, title = 'Alert') {
        this.open({
            title,
            body: `<p>${Utils.escapeHtml(message)}</p>`,
            buttons: [
                {
                    text: 'OK',
                    class: 'btn-primary'
                }
            ]
        });
    }
};

// Add JSON syntax highlighting CSS
const jsonHighlightStyle = document.createElement('style');
jsonHighlightStyle.textContent = `
    .json-key { color: #9cdcfe; }
    .json-string { color: #ce9178; }
    .json-number { color: #b5cea8; }
    .json-boolean { color: #569cd6; }
    .json-null { color: #569cd6; }
`;
document.head.appendChild(jsonHighlightStyle);

// Export utilities
window.Utils = Utils;
window.Toast = Toast;
window.Modal = Modal;
