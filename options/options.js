/**
 * Options page script for Internet Usage Tracker
 */

// DOM Elements
const elements = {
  deviceId: document.getElementById('deviceId'),
  deviceType: document.getElementById('deviceType'),
  deviceName: document.getElementById('deviceName'),
  userId: document.getElementById('userId'),
  userValidation: document.getElementById('userValidation'),
  apiEndpoint: document.getElementById('apiEndpoint'),
  apiKey: document.getElementById('apiKey'),
  syncInterval: document.getElementById('syncInterval'),
  idleDetection: document.getElementById('idleDetection'),
  idleOptions: document.getElementById('idleOptions'),
  idleThreshold: document.getElementById('idleThreshold'),
  archiveRetention: document.getElementById('archiveRetention'),
  syncNowBtn: document.getElementById('syncNowBtn'),
  exportBtn: document.getElementById('exportBtn'),
  clearDataBtn: document.getElementById('clearDataBtn'),
  saveBtn: document.getElementById('saveBtn'),
  syncStatus: document.getElementById('syncStatus'),
  toast: document.getElementById('toast')
};

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 3000);
}

/**
 * Validate user ID against the server
 */
async function validateUser() {
  const userId = elements.userId.value.trim();
  const apiEndpoint = elements.apiEndpoint.value.trim();
  const apiKey = elements.apiKey.value.trim();
  
  if (!userId || !apiEndpoint || !apiKey) {
    elements.userValidation.classList.add('hidden');
    return;
  }
  
  elements.userValidation.classList.remove('hidden', 'valid', 'invalid');
  elements.userValidation.classList.add('checking');
  elements.userValidation.textContent = '⏳ Checking user...';
  
  try {
    const response = await browser.runtime.sendMessage({ 
      action: 'validateUser',
      userId,
      config: { apiEndpoint, apiKey }
    });
    
    if (response.valid) {
      elements.userValidation.classList.remove('checking');
      elements.userValidation.classList.add('valid');
      elements.userValidation.textContent = '✅ User validated successfully!';
    } else {
      elements.userValidation.classList.remove('checking');
      elements.userValidation.classList.add('invalid');
      elements.userValidation.textContent = `❌ ${response.error || 'User not authorized'}`;
    }
  } catch (error) {
    elements.userValidation.classList.remove('checking');
    elements.userValidation.classList.add('invalid');
    elements.userValidation.textContent = `❌ Validation error: ${error.message}`;
  }
}

// Debounce user validation
let validateTimeout = null;
function debouncedValidateUser() {
  if (validateTimeout) clearTimeout(validateTimeout);
  validateTimeout = setTimeout(validateUser, 500);
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getConfig' });
    
    if (response.deviceId) {
      elements.deviceId.textContent = response.deviceId;
    }
    
    if (response.config) {
      const config = response.config;
      
      elements.deviceType.value = config.deviceProfile?.type || 'laptop';
      elements.deviceName.value = config.deviceProfile?.name || '';
      elements.userId.value = config.userId || '';
      elements.apiEndpoint.value = config.apiEndpoint || '';
      elements.apiKey.value = config.apiKey || '';
      elements.syncInterval.value = config.syncIntervalMinutes || 180;
      elements.idleDetection.checked = config.idleDetectionEnabled || false;
      elements.idleThreshold.value = config.idleThresholdMinutes || 5;
      elements.archiveRetention.value = config.archiveRetentionDays || 30;
      
      // Show/hide idle options
      toggleIdleOptions();
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    showToast('Failed to load settings', 'error');
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  const config = {
    deviceProfile: {
      type: elements.deviceType.value,
      name: elements.deviceName.value,
      browser: 'Firefox',
      os: navigator.platform
    },
    userId: elements.userId.value,
    apiEndpoint: elements.apiEndpoint.value.replace(/\/$/, ''), // Remove trailing slash
    apiKey: elements.apiKey.value,
    syncIntervalMinutes: Math.max(5, parseInt(elements.syncInterval.value) || 180),
    idleDetectionEnabled: elements.idleDetection.checked,
    idleThresholdMinutes: Math.max(1, parseInt(elements.idleThreshold.value) || 5),
    archiveRetentionDays: Math.max(1, parseInt(elements.archiveRetention.value) || 30)
  };
  
  try {
    const response = await browser.runtime.sendMessage({ 
      action: 'saveConfig', 
      config 
    });
    
    if (response.success) {
      showToast('Settings saved successfully!', 'success');
    } else {
      throw new Error(response.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    showToast('Failed to save settings', 'error');
  }
}

/**
 * Toggle idle options visibility
 */
function toggleIdleOptions() {
  if (elements.idleDetection.checked) {
    elements.idleOptions.classList.remove('hidden');
  } else {
    elements.idleOptions.classList.add('hidden');
  }
}

/**
 * Trigger manual sync
 */
async function syncNow() {
  elements.syncNowBtn.disabled = true;
  elements.syncNowBtn.textContent = '⏳ Syncing...';
  
  elements.syncStatus.classList.remove('hidden', 'error');
  elements.syncStatus.classList.add('info');
  elements.syncStatus.textContent = 'Syncing data...';
  
  try {
    const response = await browser.runtime.sendMessage({ action: 'syncNow' });
    
    if (response.success) {
      elements.syncStatus.classList.remove('info');
      elements.syncStatus.classList.add('success');
      elements.syncStatus.textContent = `✅ Sync complete! ${response.synced || 0} sessions synced.`;
      showToast('Sync completed!', 'success');
    } else {
      throw new Error(response.error || 'Sync failed');
    }
  } catch (error) {
    console.error('Sync failed:', error);
    elements.syncStatus.classList.remove('info');
    elements.syncStatus.classList.add('error');
    elements.syncStatus.textContent = `❌ Sync failed: ${error.message}`;
    showToast('Sync failed', 'error');
  } finally {
    elements.syncNowBtn.disabled = false;
    elements.syncNowBtn.textContent = '🔄 Sync Now';
  }
}

/**
 * Export data as JSON file
 */
async function exportData() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'exportData' });
    
    const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `internet-tracker-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Data exported successfully!', 'success');
  } catch (error) {
    console.error('Export failed:', error);
    showToast('Export failed', 'error');
  }
}

/**
 * Clear all tracking data
 */
async function clearData() {
  if (!confirm('Are you sure you want to delete all tracking data? This cannot be undone.')) {
    return;
  }
  
  try {
    const response = await browser.runtime.sendMessage({ action: 'clearData' });
    
    if (response.success) {
      showToast('All data cleared!', 'success');
    } else {
      throw new Error(response.error || 'Failed to clear data');
    }
  } catch (error) {
    console.error('Clear failed:', error);
    showToast('Failed to clear data', 'error');
  }
}

// Event Listeners
elements.saveBtn.addEventListener('click', saveSettings);
elements.syncNowBtn.addEventListener('click', syncNow);
elements.exportBtn.addEventListener('click', exportData);
elements.clearDataBtn.addEventListener('click', clearData);
elements.idleDetection.addEventListener('change', toggleIdleOptions);

// Validate user when relevant fields change
elements.userId.addEventListener('input', debouncedValidateUser);
elements.apiEndpoint.addEventListener('input', debouncedValidateUser);
elements.apiKey.addEventListener('input', debouncedValidateUser);

// Load settings on page load
document.addEventListener('DOMContentLoaded', loadSettings);
