/**
 * Utility functions for the Internet Usage Tracker extension
 */

const Utils = {
  /**
   * Generate a UUID v4
   * @returns {string} UUID v4 string
   */
  generateUUID() {
    if (crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  /**
   * Extract domain from URL
   * @param {string} url - Full URL
   * @returns {string} Domain name
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return url;
    }
  },

  /**
   * Check if URL should be tracked (excludes internal browser pages)
   * @param {string} url - URL to check
   * @returns {boolean} Whether to track this URL
   */
  isTrackableUrl(url) {
    if (!url) return false;
    const excludedProtocols = ['about:', 'moz-extension:', 'chrome:', 'file:', 'data:', 'javascript:'];
    return !excludedProtocols.some((protocol) => url.startsWith(protocol));
  },

  /**
   * Format duration in seconds to human-readable string
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration (e.g., "2h 30m 15s")
   */
  formatDuration(seconds) {
    if (seconds < 0) seconds = 0;
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  },

  /**
   * Get current timestamp in seconds
   * @returns {number} Unix timestamp in seconds
   */
  getCurrentTimestamp() {
    return Math.floor(Date.now() / 1000);
  },

  /**
   * Get start of today as timestamp
   * @returns {number} Unix timestamp of start of today
   */
  getStartOfToday() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor(startOfDay.getTime() / 1000);
  },

  /**
   * Detect operating system
   * @returns {string} OS name
   */
  detectOS() {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown';
  },

  /**
   * Deep clone an object
   * @param {*} obj - Object to clone
   * @returns {*} Cloned object
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Debounce function calls
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
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
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
