/**
 * Popup script for Internet Usage Tracker
 * Displays stats and site list with search/sort
 */

// State
let allSites = [];
let currentFilter = '';
let currentSort = 'time-desc';
let updateInterval = null;

// DOM Elements
const elements = {
  todayTime: document.getElementById('todayTime'),
  allTimeTime: document.getElementById('allTimeTime'),
  currentSession: document.getElementById('currentSession'),
  searchInput: document.getElementById('searchInput'),
  sortSelect: document.getElementById('sortSelect'),
  sitesList: document.getElementById('sitesList'),
  pendingCount: document.getElementById('pendingCount'),
  lastUpdate: document.getElementById('lastUpdate'),
  syncBtn: document.getElementById('syncBtn'),
  settingsBtn: document.getElementById('settingsBtn')
};

/**
 * Format seconds to human-readable time
 */
function formatTime(seconds) {
  if (seconds < 0) seconds = 0;
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Format time for display (shorter format)
 */
function formatTimeShort(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/**
 * Get first letter of domain for favicon placeholder
 */
function getDomainInitial(domain) {
  return domain.replace('www.', '').charAt(0).toUpperCase();
}

/**
 * Load and display stats
 */
async function loadStats() {
  try {
    const stats = await browser.runtime.sendMessage({ action: 'getStats' });
    
    // Update totals
    elements.todayTime.textContent = formatTime(stats.todayTotal);
    elements.allTimeTime.textContent = formatTime(stats.allTimeTotal);
    
    // Update current session
    if (stats.currentSession) {
      elements.currentSession.textContent = '';
      const domainSpan = document.createElement('span');
      domainSpan.className = 'current-domain';
      domainSpan.textContent = stats.currentSession.domain;
      const timeSpan = document.createElement('span');
      timeSpan.className = 'current-time';
      timeSpan.textContent = formatTimeShort(stats.currentSession.durationSeconds);
      elements.currentSession.appendChild(domainSpan);
      elements.currentSession.appendChild(timeSpan);
    } else {
      elements.currentSession.textContent = '';
      const noSessionSpan = document.createElement('span');
      noSessionSpan.className = 'no-session';
      noSessionSpan.textContent = 'No active session';
      elements.currentSession.appendChild(noSessionSpan);
    }
    
    // Update pending count
    if (stats.pendingCount > 0) {
      elements.pendingCount.textContent = '';
      const badge = document.createElement('span');
      badge.className = 'pending-badge';
      badge.textContent = stats.pendingCount;
      elements.pendingCount.appendChild(badge);
      elements.pendingCount.appendChild(document.createTextNode(' pending'));
    } else {
      elements.pendingCount.textContent = '0 pending';
    }
    
    // Store sites for filtering/sorting
    allSites = stats.sites;
    renderSitesList();
    
    // Update timestamp
    elements.lastUpdate.textContent = 'Updated just now';
    
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

/**
 * Render the sites list with current filter and sort
 */
function renderSitesList() {
  let sites = [...allSites];
  
  // Apply filter
  if (currentFilter) {
    const filter = currentFilter.toLowerCase();
    sites = sites.filter(site => 
      site.domain.toLowerCase().includes(filter) ||
      (site.lastTitle && site.lastTitle.toLowerCase().includes(filter))
    );
  }
  
  // Apply sort
  sites.sort((a, b) => {
    switch (currentSort) {
      case 'time-desc':
        return b.totalSeconds - a.totalSeconds;
      case 'time-asc':
        return a.totalSeconds - b.totalSeconds;
      case 'name-asc':
        return a.domain.localeCompare(b.domain);
      case 'name-desc':
        return b.domain.localeCompare(a.domain);
      default:
        return 0;
    }
  });
  
  // Render
  if (sites.length === 0) {
    elements.sitesList.textContent = '';
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    const iconDiv = document.createElement('div');
    iconDiv.className = 'empty-state-icon';
    const textDiv = document.createElement('div');
    if (currentFilter) {
      iconDiv.textContent = '🔍';
      textDiv.textContent = `No sites match "${currentFilter}"`;
    } else {
      iconDiv.textContent = '📊';
      textDiv.textContent = 'No data yet. Start browsing!';
    }
    emptyDiv.appendChild(iconDiv);
    emptyDiv.appendChild(textDiv);
    elements.sitesList.appendChild(emptyDiv);
    return;
  }
  
  // Clear and rebuild sites list using DOM methods
  elements.sitesList.textContent = '';
  sites.forEach(site => {
    const siteItem = document.createElement('div');
    siteItem.className = 'site-item';
    
    const favicon = document.createElement('div');
    favicon.className = 'site-favicon';
    favicon.textContent = getDomainInitial(site.domain);
    
    const siteInfo = document.createElement('div');
    siteInfo.className = 'site-info';
    
    const siteDomain = document.createElement('div');
    siteDomain.className = 'site-domain';
    siteDomain.title = site.domain;
    siteDomain.textContent = site.domain;
    
    const siteSessions = document.createElement('div');
    siteSessions.className = 'site-sessions';
    siteSessions.textContent = `${site.sessions} session${site.sessions !== 1 ? 's' : ''}`;
    
    siteInfo.appendChild(siteDomain);
    siteInfo.appendChild(siteSessions);
    
    const timeContainer = document.createElement('div');
    
    const siteTime = document.createElement('div');
    siteTime.className = 'site-time';
    siteTime.textContent = formatTimeShort(site.totalSeconds);
    timeContainer.appendChild(siteTime);
    
    if (site.todaySeconds > 0) {
      const siteToday = document.createElement('div');
      siteToday.className = 'site-today';
      siteToday.textContent = `${formatTimeShort(site.todaySeconds)} today`;
      timeContainer.appendChild(siteToday);
    }
    
    siteItem.appendChild(favicon);
    siteItem.appendChild(siteInfo);
    siteItem.appendChild(timeContainer);
    elements.sitesList.appendChild(siteItem);
  });
}

/**
 * Handle sync button click
 */
async function handleSync() {
  elements.syncBtn.disabled = true;
  elements.syncBtn.textContent = '⏳';
  
  try {
    const result = await browser.runtime.sendMessage({ action: 'syncNow' });
    
    if (result.success) {
      elements.syncBtn.textContent = '✅';
      setTimeout(() => {
        elements.syncBtn.textContent = '🔄 Sync';
        elements.syncBtn.disabled = false;
      }, 1500);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Sync failed:', error);
    elements.syncBtn.textContent = '❌';
    setTimeout(() => {
      elements.syncBtn.textContent = '🔄 Sync';
      elements.syncBtn.disabled = false;
    }, 1500);
  }
  
  // Reload stats
  await loadStats();
}

/**
 * Open settings page
 */
function openSettings() {
  browser.runtime.openOptionsPage();
  window.close();
}

// Event Listeners
elements.searchInput.addEventListener('input', (e) => {
  currentFilter = e.target.value;
  renderSitesList();
});

elements.sortSelect.addEventListener('change', (e) => {
  currentSort = e.target.value;
  renderSitesList();
});

elements.syncBtn.addEventListener('click', handleSync);
elements.settingsBtn.addEventListener('click', openSettings);

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  
  // Update every 5 seconds for live current session time
  updateInterval = setInterval(loadStats, 5000);
});

// Clean up on close
window.addEventListener('unload', () => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
});
