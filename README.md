# Internet Usage Tracker - Firefox Extension

A Firefox browser extension that tracks your internet usage and syncs data to a Supabase backend.

## Features

- ⏱️ **Continuous Tracking** - Tracks time spent on each tab/website
- 📊 **Dashboard Popup** - View today's stats and all-time usage
- 🔍 **Search & Sort** - Find sites by name, sort by time or alphabetically
- 🔄 **Auto Sync** - Syncs to Supabase every 3 hours (configurable)
- 📱 **Device Profiles** - Track across multiple devices with unique IDs
- 💾 **Local Archive** - 30-day local backup with auto-cleanup
- ⚙️ **Configurable** - Idle detection, sync interval, and more

## Installation

### 1. Set Up Supabase Backend

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to **SQL Editor** and run the contents of `supabase-setup.sql`
4. Go to **Settings > API** and copy:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - `anon` public key

### 2. Load the Extension in Firefox

#### Option A: Temporary Installation (for development)

1. Open Firefox and go to `about:debugging`
2. Click **"This Firefox"** in the left sidebar
3. Click **"Load Temporary Add-on..."**
4. Navigate to the extension folder and select `manifest.json`

#### Option B: Permanent Installation (signed)

1. Package the extension: `zip -r internet-tracker.xpi *`
2. Submit to [Firefox Add-ons](https://addons.mozilla.org) for signing
3. Or use [web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) for development signing

### 3. Configure the Extension

1. Click the extension icon in Firefox toolbar
2. Click **⚙️ Settings**
3. Enter your Supabase Project URL and API Key
4. Set your User ID (e.g., your email)
5. Choose your device type and name
6. Click **Save Settings**

## Project Structure

```
internet-tracker/
├── manifest.json          # Extension manifest
├── background.js          # Main tracking logic
├── sync.js               # Sync orchestration
├── utils.js              # Utility functions
├── popup/
│   ├── popup.html        # Dashboard UI
│   └── popup.js          # Dashboard logic
├── options/
│   ├── options.html      # Settings page UI
│   └── options.js        # Settings logic
├── icons/
│   ├── icon.svg          # Source icon
│   └── icon-*.png        # Generated icons
└── supabase-setup.sql    # Database setup script
```

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| Sync Interval | 180 min | How often to sync to Supabase |
| Idle Detection | Off | Pause tracking when inactive |
| Idle Threshold | 5 min | Minutes before considered idle |
| Archive Retention | 30 days | How long to keep local archive |

## Data Privacy

- All data is stored locally until synced
- You control your Supabase instance
- No third-party tracking or analytics
- Exclude internal browser pages automatically

## Development

### Testing Locally

1. Load as temporary add-on (see above)
2. Open Browser Console (`Ctrl+Shift+J`) to see logs
3. Messages prefixed with `[Tracker]` and `[Sync]`

### Using web-ext

```bash
# Install web-ext
npm install -g web-ext

# Run with auto-reload
web-ext run --source-dir=.

# Build for distribution
web-ext build --source-dir=.
```

### Debugging

- Background script logs: `about:debugging` > This Firefox > Inspect
- Popup console: Right-click popup > Inspect
- Storage: `about:debugging` > Inspect > Storage tab

## API Payload Format

```json
{
  "device_id": "uuid-v4",
  "device_profile": {
    "type": "laptop",
    "name": "Work Laptop",
    "browser": "Firefox",
    "os": "Linux"
  },
  "user_id": "user@example.com",
  "sessions": [
    {
      "url": "https://example.com/page",
      "domain": "example.com",
      "title": "Page Title",
      "start_timestamp": 1234567890,
      "end_timestamp": 1234567900,
      "duration_seconds": 10,
      "tab_id": 123
    }
  ],
  "sync_timestamp": 1234567900
}
```

## Useful Supabase Queries

```sql
-- Today's usage
SELECT * FROM daily_summary 
WHERE user_id = 'your@email.com' AND date = CURRENT_DATE;

-- Top 10 domains
SELECT * FROM domain_totals 
WHERE user_id = 'your@email.com' LIMIT 10;

-- Last 7 days
SELECT date, SUM(total_minutes) as minutes 
FROM daily_summary 
WHERE user_id = 'your@email.com' 
  AND date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY date ORDER BY date;
```

## License

MIT License - feel free to modify and use as you wish.
