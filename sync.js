/**
 * Sync Manager for Internet Usage Tracker
 * Handles syncing data to Supabase and local archive management
 */

const SyncManager = {
  /**
   * Validate if user is allowed to use the extension
   * @param {string} userId - User ID to validate
   * @param {object} config - Extension configuration
   * @returns {object} Validation result
   */
  async validateUser(userId, config) {
    if (!config.apiEndpoint || !config.apiKey) {
      return { valid: false, error: 'API not configured' };
    }
    
    if (!userId) {
      return { valid: false, error: 'User ID not set' };
    }
    
    try {
      const url = `${config.apiEndpoint}/rest/v1/rpc/is_valid_user`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.apiKey,
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({ check_username: userId })
      });
      
      if (!response.ok) {
        throw new Error(`Validation failed: ${response.status}`);
      }
      
      const isValid = await response.json();
      
      if (isValid) {
        return { valid: true };
      } else {
        return { 
          valid: false, 
          error: 'User not authorized. Email dhondpratyay@gmail.com to request access.' 
        };
      }
    } catch (error) {
      console.error('[Sync] User validation error:', error);
      return { valid: false, error: error.message };
    }
  },

  /**
   * Perform sync to remote API
   * @param {Array} sessions - Sessions to sync
   * @param {string} deviceId - Device UUID
   * @param {object} config - Extension configuration
   * @returns {object} Sync result
   */
  async sync(sessions, deviceId, config) {
    console.log('[Sync] Starting sync with', sessions.length, 'sessions');
    
    // Check if we have sessions to sync
    if (sessions.length === 0) {
      console.log('[Sync] No sessions to sync');
      return { success: true, synced: 0 };
    }
    
    // Check if API is configured
    if (!config.apiEndpoint || !config.apiKey) {
      console.log('[Sync] API not configured, archiving locally only');
      await this.archiveLocally(sessions);
      return { success: true, synced: 0, archived: sessions.length };
    }
    
    // Validate user before syncing
    const validation = await this.validateUser(config.userId, config);
    if (!validation.valid) {
      console.log('[Sync] User validation failed:', validation.error);
      await this.archiveLocally(sessions);
      return { success: false, error: validation.error, archived: sessions.length };
    }
    
    // Check network connectivity
    if (!navigator.onLine) {
      console.log('[Sync] Offline, queueing for later');
      await this.queueFailedSync(sessions);
      return { success: false, error: 'offline', queued: sessions.length };
    }
    
    // Build payload
    const payload = this.buildPayload(sessions, deviceId, config);
    
    try {
      // Send to API
      const response = await this.sendToApi(payload, config);
      
      if (response.success) {
        console.log('[Sync] Successfully synced', sessions.length, 'sessions');
        
        // Archive locally after successful sync
        await this.archiveLocally(sessions);
        
        // Clear failed sync queue
        await browser.storage.local.remove('failedSyncs');
        
        // Prune old archive entries
        await this.pruneArchive(config.archiveRetentionDays);
        
        return { success: true, synced: sessions.length };
      } else {
        throw new Error(response.error || 'Unknown error');
      }
    } catch (error) {
      console.error('[Sync] Error:', error);
      
      // Queue for retry
      await this.queueFailedSync(sessions);
      
      return { success: false, error: error.message, queued: sessions.length };
    }
  },
  
  /**
   * Build the JSON payload for API
   */
  buildPayload(sessions, deviceId, config) {
    return {
      device_id: deviceId,
      device_profile: {
        type: config.deviceProfile.type,
        name: config.deviceProfile.name,
        browser: config.deviceProfile.browser,
        os: config.deviceProfile.os
      },
      user_id: config.userId,
      sessions: sessions.map(session => ({
        url: session.url,
        domain: session.domain,
        title: session.title,
        start_timestamp: session.startTimestamp,
        end_timestamp: session.endTimestamp,
        duration_seconds: session.durationSeconds,
        tab_id: session.tabId,
        incognito: session.incognito || false
      })),
      sync_timestamp: Math.floor(Date.now() / 1000)
    };
  },
  
  /**
   * Send payload to Supabase API
   */
  async sendToApi(payload, config) {
    const url = `${config.apiEndpoint}/rest/v1/sessions`;
    
    // Transform payload for Supabase - insert each session as a row
    const rows = payload.sessions.map(session => ({
      device_id: payload.device_id,
      user_id: payload.user_id,
      url: session.url,
      domain: session.domain,
      title: session.title,
      start_timestamp: session.start_timestamp,
      end_timestamp: session.end_timestamp,
      duration_seconds: session.duration_seconds,
      tab_id: session.tab_id,
      incognito: session.incognito || false,
      device_profile: payload.device_profile,
      synced_at: new Date().toISOString()
    }));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.apiKey,
        'Authorization': `Bearer ${config.apiKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(rows)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }
    
    return { success: true };
  },
  
  /**
   * Archive sessions locally
   */
  async archiveLocally(sessions) {
    const stored = await browser.storage.local.get('archive');
    const archive = stored.archive || [];
    
    // Add sync timestamp to each session
    const archivedSessions = sessions.map(session => ({
      ...session,
      archivedAt: Math.floor(Date.now() / 1000)
    }));
    
    // Append to archive
    archive.push(...archivedSessions);
    
    await browser.storage.local.set({ archive });
    console.log('[Sync] Archived', sessions.length, 'sessions locally');
  },
  
  /**
   * Queue failed sync for retry
   */
  async queueFailedSync(sessions) {
    const stored = await browser.storage.local.get('failedSyncs');
    const failedSyncs = stored.failedSyncs || [];
    
    // Add to failed queue (avoid duplicates by checking timestamps)
    const existingTimestamps = new Set(failedSyncs.map(s => s.startTimestamp));
    const newSessions = sessions.filter(s => !existingTimestamps.has(s.startTimestamp));
    
    failedSyncs.push(...newSessions);
    
    await browser.storage.local.set({ failedSyncs });
    console.log('[Sync] Queued', newSessions.length, 'sessions for retry');
  },
  
  /**
   * Prune archive entries older than retention period
   */
  async pruneArchive(retentionDays = 30) {
    const stored = await browser.storage.local.get('archive');
    const archive = stored.archive || [];
    
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - (retentionDays * 24 * 60 * 60);
    
    const prunedArchive = archive.filter(session => 
      session.archivedAt > cutoffTimestamp || session.startTimestamp > cutoffTimestamp
    );
    
    const removed = archive.length - prunedArchive.length;
    
    if (removed > 0) {
      await browser.storage.local.set({ archive: prunedArchive });
      console.log('[Sync] Pruned', removed, 'old archive entries');
    }
  },
  
  /**
   * Get sync status for display
   */
  async getStatus() {
    const stored = await browser.storage.local.get(['failedSyncs', 'archive']);
    
    return {
      failedCount: (stored.failedSyncs || []).length,
      archivedCount: (stored.archive || []).length,
      lastSyncAttempt: null // Could track this if needed
    };
  }
};

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SyncManager;
}
