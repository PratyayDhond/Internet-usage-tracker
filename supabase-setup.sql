-- ============================================================================
-- Supabase Setup Script for Internet Usage Tracker
-- ============================================================================
-- 
-- HOW TO USE:
-- 1. Create a new project at https://supabase.com
-- 2. Go to SQL Editor in your Supabase dashboard
-- 3. Paste this entire script and click "Run"
-- 4. Go to Settings > API and copy:
--    - Project URL (e.g., https://xxxxx.supabase.co)
--    - anon/public key
-- 5. Paste these into the extension's options page
--
-- TO REQUEST ACCESS:
-- Email dhondpratyay@gmail.com with your desired username to be added.
--
-- ============================================================================

-- ============================================================================
-- Users Table (Allowlist)
-- ============================================================================
-- Only users in this table can use the extension.
-- To add a new user, run: INSERT INTO users (username) VALUES ('user@example.com');

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Index for fast username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow anyone to check if a username exists (for validation)
CREATE POLICY "Allow username validation" ON users
  FOR SELECT
  TO anon
  USING (true);

-- Only service_role can insert/update/delete users (admin only)
-- This means users can only be added via Supabase Dashboard or service key

-- ============================================================================
-- Create the sessions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  
  -- Device identification
  device_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  
  -- Session data
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT,
  
  -- Timestamps (stored as Unix timestamps in seconds)
  start_timestamp BIGINT NOT NULL,
  end_timestamp BIGINT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  
  -- Browser tab ID (for debugging)
  tab_id INTEGER,
  
  -- Private browsing flag
  incognito BOOLEAN DEFAULT FALSE,
  
  -- Device metadata (stored as JSONB for flexibility)
  device_profile JSONB DEFAULT '{}',
  
  -- Sync metadata
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for common queries
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_domain ON sessions(domain);
CREATE INDEX IF NOT EXISTS idx_sessions_start_timestamp ON sessions(start_timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_synced_at ON sessions(synced_at);

-- Composite index for user+time queries
CREATE INDEX IF NOT EXISTS idx_sessions_user_time ON sessions(user_id, start_timestamp DESC);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
-- Enable RLS for security (optional but recommended)

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow insert ONLY if user_id exists in users table
CREATE POLICY "Allow inserts for valid users only" ON sessions
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE username = user_id AND is_active = TRUE
    )
  );

-- Policy: Allow users to read their own data (if you add auth later)
CREATE POLICY "Users can read own data" ON sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.jwt() ->> 'email');

-- Policy: Allow anon to read only their own data (must be valid user)
CREATE POLICY "Allow reads for valid users only" ON sessions
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE username = user_id AND is_active = TRUE
    )
  );

-- ============================================================================
-- Useful Views
-- ============================================================================

-- Daily summary view
CREATE OR REPLACE VIEW daily_summary AS
SELECT 
  user_id,
  device_id,
  domain,
  DATE(TO_TIMESTAMP(start_timestamp)) as date,
  COUNT(*) as session_count,
  SUM(duration_seconds) as total_seconds,
  ROUND(SUM(duration_seconds) / 60.0, 1) as total_minutes,
  ROUND(SUM(duration_seconds) / 3600.0, 2) as total_hours
FROM sessions
GROUP BY user_id, device_id, domain, DATE(TO_TIMESTAMP(start_timestamp))
ORDER BY date DESC, total_seconds DESC;

-- Domain totals view
CREATE OR REPLACE VIEW domain_totals AS
SELECT 
  user_id,
  domain,
  COUNT(*) as total_sessions,
  SUM(duration_seconds) as total_seconds,
  ROUND(SUM(duration_seconds) / 3600.0, 2) as total_hours,
  MIN(TO_TIMESTAMP(start_timestamp)) as first_visit,
  MAX(TO_TIMESTAMP(end_timestamp)) as last_visit,
  COUNT(DISTINCT device_id) as device_count
FROM sessions
GROUP BY user_id, domain
ORDER BY total_seconds DESC;

-- Device summary view
CREATE OR REPLACE VIEW device_summary AS
SELECT 
  device_id,
  user_id,
  device_profile->>'type' as device_type,
  device_profile->>'name' as device_name,
  device_profile->>'os' as os,
  COUNT(*) as total_sessions,
  SUM(duration_seconds) as total_seconds,
  ROUND(SUM(duration_seconds) / 3600.0, 2) as total_hours,
  MIN(synced_at) as first_sync,
  MAX(synced_at) as last_sync
FROM sessions
GROUP BY device_id, user_id, device_profile->>'type', device_profile->>'name', device_profile->>'os'
ORDER BY last_sync DESC;

-- ============================================================================
-- Sample Queries (for reference)
-- ============================================================================

-- Get today's usage for a user:
-- SELECT * FROM daily_summary WHERE user_id = 'your@email.com' AND date = CURRENT_DATE;

-- Get top 10 domains for a user:
-- SELECT * FROM domain_totals WHERE user_id = 'your@email.com' LIMIT 10;

-- Get usage for last 7 days:
-- SELECT date, SUM(total_minutes) as minutes 
-- FROM daily_summary 
-- WHERE user_id = 'your@email.com' AND date >= CURRENT_DATE - INTERVAL '7 days'
-- GROUP BY date ORDER BY date;

-- Get hourly breakdown for today:
-- SELECT 
--   EXTRACT(HOUR FROM TO_TIMESTAMP(start_timestamp)) as hour,
--   SUM(duration_seconds) / 60 as minutes
-- FROM sessions
-- WHERE user_id = 'your@email.com' 
--   AND DATE(TO_TIMESTAMP(start_timestamp)) = CURRENT_DATE
-- GROUP BY hour ORDER BY hour;

-- ============================================================================
-- Cleanup Function (optional)
-- ============================================================================

-- Function to delete old data (call periodically if needed)
CREATE OR REPLACE FUNCTION cleanup_old_sessions(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sessions 
  WHERE synced_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- To clean up data older than 90 days, run:
-- SELECT cleanup_old_sessions(90);

-- ============================================================================
-- Function to validate user
-- ============================================================================
-- Call this from the extension to check if user is allowed

CREATE OR REPLACE FUNCTION is_valid_user(check_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE username = check_username AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Admin Helpers
-- ============================================================================

-- Add a new user (run in SQL Editor):
-- INSERT INTO users (username, display_name) VALUES ('user@example.com', 'John Doe');

-- Deactivate a user (keeps their data but blocks new syncs):
-- UPDATE users SET is_active = FALSE WHERE username = 'user@example.com';

-- List all users:
-- SELECT * FROM users ORDER BY created_at DESC;

-- ============================================================================
-- Done!
-- ============================================================================
-- Your Supabase backend is now ready. 
-- Copy your Project URL and anon key from Settings > API


-- Adding users to the allowlist is done by inserting into the users table. For example:
-- INSERT INTO users (username, display_name) 
-- VALUES ('dhondpratyay@gmail.com', 'Pratyay Dhond');