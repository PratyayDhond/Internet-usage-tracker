/**
 * Background script for Internet Usage Tracker
 * Handles tab tracking, session management, and sync scheduling
 */

// ============================================================================
// State Management
// ============================================================================

const TrackerState = {
  // Current active session
  currentSession: null,
  
  // Device and config info (loaded from storage)
  deviceId: null,
  config: null,
  
  // Idle state tracking
  isIdle: false,
  idleThresholdSeconds: 300, // 5 minutes default
  
  // Pending sessions to be saved
  pendingSessions: [],
  
  // Initialization flag
  initialized: false
};

// Default configuration
const DEFAULT_CONFIG = {
  apiEndpoint: '',
  apiKey: '',
  syncIntervalMinutes: 180, // 3 hours
  userId: '',
  deviceProfile: {
    type: 'laptop',
    name: '',
    browser: 'Firefox',
    os: Utils.detectOS()
  },
  idleDetectionEnabled: false, // Default: always track active tab
  idleThresholdMinutes: 5,
  archiveRetentionDays: 30
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the extension on startup
 */
async function initialize() {
  if (TrackerState.initialized) return;
  
  console.log('[Tracker] Initializing...');
  
  try {
    // Load or generate device ID
    await initializeDeviceId();
    
    // Load configuration
    await loadConfig();
    
    // Load any pending sessions from storage
    await loadPendingSessions();
    
    // Set up alarm for periodic sync
    await setupSyncAlarm();
    
    // Set up idle detection if enabled
    setupIdleDetection();
    
    // Start tracking the current active tab
    await startTrackingActiveTab();
    
    TrackerState.initialized = true;
    console.log('[Tracker] Initialized successfully');
    console.log('[Tracker] Device ID:', TrackerState.deviceId);
  } catch (error) {
    console.error('[Tracker] Initialization error:', error);
  }
}

/**
 * Initialize or load device ID
 */
async function initializeDeviceId() {
  const stored = await browser.storage.local.get('deviceId');
  
  if (stored.deviceId) {
    TrackerState.deviceId = stored.deviceId;
  } else {
    TrackerState.deviceId = Utils.generateUUID();
    await browser.storage.local.set({ deviceId: TrackerState.deviceId });
    console.log('[Tracker] Generated new device ID:', TrackerState.deviceId);
  }
}

/**
 * Load configuration from storage
 */
async function loadConfig() {
  const stored = await browser.storage.local.get('config');
  TrackerState.config = { ...DEFAULT_CONFIG, ...stored.config };
  
  // Update idle threshold
  TrackerState.idleThresholdSeconds = TrackerState.config.idleThresholdMinutes * 60;
}

/**
 * Load pending sessions from storage
 */
async function loadPendingSessions() {
  const stored = await browser.storage.local.get('pendingSessions');
  TrackerState.pendingSessions = stored.pendingSessions || [];
  console.log(`[Tracker] Loaded ${TrackerState.pendingSessions.length} pending sessions`);
}

/**
 * Save pending sessions to storage
 */
async function savePendingSessions() {
  await browser.storage.local.set({ pendingSessions: TrackerState.pendingSessions });
}

// ============================================================================
// Tab Tracking
// ============================================================================

/**
 * Start tracking the currently active tab
 */
async function startTrackingActiveTab() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      const tab = tabs[0];
      if (Utils.isTrackableUrl(tab.url)) {
        startSession(tab);
      }
    }
  } catch (error) {
    console.error('[Tracker] Error starting active tab tracking:', error);
  }
}

/**
 * Start a new tracking session for a tab
 * @param {object} tab - Tab object
 */
function startSession(tab) {
  // End any existing session first
  endCurrentSession();
  
  // Don't track if idle detection is enabled and user is idle
  if (TrackerState.config.idleDetectionEnabled && TrackerState.isIdle) {
    console.log('[Tracker] User is idle, not starting new session');
    return;
  }
  
  if (!Utils.isTrackableUrl(tab.url)) {
    console.log('[Tracker] Non-trackable URL, skipping:', tab.url);
    return;
  }
  
  TrackerState.currentSession = {
    url: tab.url,
    domain: Utils.extractDomain(tab.url),
    title: tab.title || 'Untitled',
    startTimestamp: Utils.getCurrentTimestamp(),
    endTimestamp: null,
    durationSeconds: 0,
    tabId: tab.id,
    incognito: tab.incognito || false
  };
  
  console.log('[Tracker] Started session:', TrackerState.currentSession.domain, tab.incognito ? '(private)' : '');
}

/**
 * End the current tracking session and save it
 */
function endCurrentSession() {
  if (!TrackerState.currentSession) return;
  
  const now = Utils.getCurrentTimestamp();
  TrackerState.currentSession.endTimestamp = now;
  TrackerState.currentSession.durationSeconds = 
    now - TrackerState.currentSession.startTimestamp;
  
  // Only save if duration is at least 1 second
  if (TrackerState.currentSession.durationSeconds >= 1) {
    TrackerState.pendingSessions.push({ ...TrackerState.currentSession });
    savePendingSessions();
    console.log('[Tracker] Ended session:', 
      TrackerState.currentSession.domain, 
      `(${TrackerState.currentSession.durationSeconds}s)`
    );
  }
  
  TrackerState.currentSession = null;
}

/**
 * Update current session with new tab info (e.g., URL change within same tab)
 * @param {object} tab - Tab object
 */
function updateCurrentSession(tab) {
  if (!TrackerState.currentSession) {
    startSession(tab);
    return;
  }
  
  // If URL changed significantly, end current and start new
  if (TrackerState.currentSession.url !== tab.url) {
    endCurrentSession();
    startSession(tab);
  } else if (tab.title && TrackerState.currentSession.title !== tab.title) {
    // Just update the title
    TrackerState.currentSession.title = tab.title;
  }
}

// ============================================================================
// Event Listeners
// ============================================================================

// Tab activated (switched to)
browser.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await browser.tabs.get(activeInfo.tabId);
    console.log('[Tracker] Tab activated:', tab.url);
    
    if (Utils.isTrackableUrl(tab.url)) {
      endCurrentSession();
      startSession(tab);
    } else {
      endCurrentSession();
    }
  } catch (error) {
    console.error('[Tracker] Error on tab activated:', error);
  }
});

// Tab updated (URL or title changed)
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only care about the active tab
  if (!tab.active) return;
  
  // Only care about URL or title changes
  if (!changeInfo.url && !changeInfo.title) return;
  
  console.log('[Tracker] Tab updated:', changeInfo);
  
  if (changeInfo.url) {
    if (Utils.isTrackableUrl(tab.url)) {
      updateCurrentSession(tab);
    } else {
      endCurrentSession();
    }
  } else if (changeInfo.title && TrackerState.currentSession) {
    TrackerState.currentSession.title = tab.title;
  }
});

// Tab closed
browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (TrackerState.currentSession && TrackerState.currentSession.tabId === tabId) {
    console.log('[Tracker] Active tab closed');
    endCurrentSession();
  }
});

// Window focus changed
browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) {
    // Browser lost focus - end current session
    console.log('[Tracker] Browser lost focus');
    endCurrentSession();
  } else {
    // Browser gained focus - start tracking active tab
    console.log('[Tracker] Browser gained focus');
    await startTrackingActiveTab();
  }
});

// ============================================================================
// Idle Detection
// ============================================================================

/**
 * Set up idle detection based on config
 */
function setupIdleDetection() {
  if (TrackerState.config.idleDetectionEnabled) {
    browser.idle.setDetectionInterval(TrackerState.idleThresholdSeconds);
    console.log('[Tracker] Idle detection enabled, threshold:', TrackerState.idleThresholdSeconds, 'seconds');
  }
}

// Idle state changed
browser.idle.onStateChanged.addListener((state) => {
  if (!TrackerState.config.idleDetectionEnabled) return;
  
  console.log('[Tracker] Idle state changed:', state);
  
  if (state === 'idle' || state === 'locked') {
    TrackerState.isIdle = true;
    endCurrentSession();
  } else if (state === 'active') {
    TrackerState.isIdle = false;
    startTrackingActiveTab();
  }
});

// ============================================================================
// Sync Scheduling
// ============================================================================

const SYNC_ALARM_NAME = 'periodic-sync';

/**
 * Set up alarm for periodic sync
 */
async function setupSyncAlarm() {
  // Clear existing alarm
  await browser.alarms.clear(SYNC_ALARM_NAME);
  
  // Create new alarm
  const intervalMinutes = TrackerState.config.syncIntervalMinutes || 180;
  browser.alarms.create(SYNC_ALARM_NAME, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes
  });
  
  console.log('[Tracker] Sync alarm set for every', intervalMinutes, 'minutes');
}

// Alarm listener
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    console.log('[Tracker] Sync alarm triggered');
    await performSync();
  }
});

// Online event listener for retry
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    console.log('[Tracker] Network online, checking for pending syncs');
    const failedSyncs = await browser.storage.local.get('failedSyncs');
    if (failedSyncs.failedSyncs && failedSyncs.failedSyncs.length > 0) {
      await performSync();
    }
  });
}

// ============================================================================
// Sync Execution
// ============================================================================

/**
 * Perform sync to remote API
 */
async function performSync() {
  // End current session temporarily to include in sync
  const hadActiveSession = TrackerState.currentSession !== null;
  let activeTabInfo = null;
  
  if (hadActiveSession) {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) activeTabInfo = tabs[0];
    } catch (e) {}
    endCurrentSession();
  }
  
  // Perform the sync
  const result = await SyncManager.sync(
    TrackerState.pendingSessions,
    TrackerState.deviceId,
    TrackerState.config
  );
  
  if (result.success) {
    // Clear synced sessions
    TrackerState.pendingSessions = [];
    await savePendingSessions();
  }
  
  // Restart session if there was an active one
  if (hadActiveSession && activeTabInfo && Utils.isTrackableUrl(activeTabInfo.url)) {
    startSession(activeTabInfo);
  }
  
  return result;
}

// ============================================================================
// Message Handling (for popup and options page)
// ============================================================================

browser.runtime.onMessage.addListener(async (message, sender) => {
  console.log('[Tracker] Received message:', message.action);
  
  switch (message.action) {
    case 'getStats':
      return getStats();
    
    case 'getCurrentSession':
      return getCurrentSessionInfo();
    
    case 'syncNow':
      return performSync();
    
    case 'validateUser':
      return SyncManager.validateUser(message.userId, message.config);
    
    case 'getConfig':
      return { config: TrackerState.config, deviceId: TrackerState.deviceId };
    
    case 'saveConfig':
      TrackerState.config = { ...TrackerState.config, ...message.config };
      await browser.storage.local.set({ config: TrackerState.config });
      await setupSyncAlarm();
      setupIdleDetection();
      return { success: true };
    
    case 'clearData':
      TrackerState.pendingSessions = [];
      await savePendingSessions();
      await browser.storage.local.remove(['archive', 'failedSyncs']);
      return { success: true };
    
    case 'exportData':
      return exportData();
    
    default:
      console.warn('[Tracker] Unknown message action:', message.action);
      return { error: 'Unknown action' };
  }
});

/**
 * Get current session info including live duration
 */
function getCurrentSessionInfo() {
  if (!TrackerState.currentSession) {
    return { session: null };
  }
  
  const now = Utils.getCurrentTimestamp();
  return {
    session: {
      ...TrackerState.currentSession,
      durationSeconds: now - TrackerState.currentSession.startTimestamp
    }
  };
}

/**
 * Get statistics for popup display
 */
async function getStats() {
  const todayStart = Utils.getStartOfToday();
  const archive = await browser.storage.local.get('archive');
  const archivedSessions = archive.archive || [];
  
  // Combine pending and archived sessions
  const allSessions = [...TrackerState.pendingSessions, ...archivedSessions];
  
  // Add current session if exists
  if (TrackerState.currentSession) {
    const now = Utils.getCurrentTimestamp();
    allSessions.push({
      ...TrackerState.currentSession,
      endTimestamp: now,
      durationSeconds: now - TrackerState.currentSession.startTimestamp
    });
  }
  
  // Calculate today's stats
  const todaySessions = allSessions.filter(s => s.startTimestamp >= todayStart);
  const todayTotal = todaySessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  
  // Calculate all-time stats
  const allTimeTotal = allSessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  
  // Group by domain
  const domainStats = {};
  allSessions.forEach(session => {
    if (!domainStats[session.domain]) {
      domainStats[session.domain] = {
        domain: session.domain,
        totalSeconds: 0,
        todaySeconds: 0,
        sessions: 0,
        lastTitle: session.title
      };
    }
    domainStats[session.domain].totalSeconds += session.durationSeconds;
    domainStats[session.domain].sessions++;
    domainStats[session.domain].lastTitle = session.title;
    
    if (session.startTimestamp >= todayStart) {
      domainStats[session.domain].todaySeconds += session.durationSeconds;
    }
  });
  
  // Convert to array and sort by total time
  const sites = Object.values(domainStats).sort((a, b) => b.totalSeconds - a.totalSeconds);
  
  return {
    todayTotal,
    allTimeTotal,
    sites,
    pendingCount: TrackerState.pendingSessions.length,
    currentSession: TrackerState.currentSession ? {
      domain: TrackerState.currentSession.domain,
      durationSeconds: Utils.getCurrentTimestamp() - TrackerState.currentSession.startTimestamp
    } : null
  };
}

/**
 * Export all data as JSON
 */
async function exportData() {
  const archive = await browser.storage.local.get('archive');
  const allSessions = [...TrackerState.pendingSessions, ...(archive.archive || [])];
  
  return {
    deviceId: TrackerState.deviceId,
    config: TrackerState.config,
    sessions: allSessions,
    exportedAt: new Date().toISOString()
  };
}

// ============================================================================
// Startup
// ============================================================================

// Initialize on load
initialize();

// Also initialize on install/update
browser.runtime.onInstalled.addListener((details) => {
  console.log('[Tracker] Extension installed/updated:', details.reason);
  initialize();
});
