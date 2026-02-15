# Room History Log — Design Doc

## Context

When rooms are deleted (grace period expires, all users stale, cleanup), ALL session data is lost. This feature adds an append-only log of past sessions — who hosted, what was played, when — so hosts and users can see "past jams" stats.

## Files to Modify

| File | Changes |
|------|---------|
| `server/src/roomManager.js` | Add history fields to room, recording methods, archive logic, persistence, hook into 3 deletion points |
| `server/src/index.js` | Pass `DATA_DIR` to RoomManager, hook track/user recording into socket events, REST endpoints, admin panel "Past Jams" window, snapshot backward-compat |
| `client/src/services/jamClient.js` | Add `getHistory()` method |
| `client/src/App.jsx` | "Recent Jams" section on room selection screen |
| `client/src/App.css` | Styles for Recent Jams |

## Implementation Steps

### 1. Room fields + recording methods (roomManager.js)

Add constants: `MIN_SESSION_DURATION_MS = 60_000`, `MAX_HISTORY_ENTRIES = 200`

Add to `createRoom()` room object:
- `tracksPlayed: []` — `{ id, title, artist, album, playedAt }`
- `peakListeners: 0` — high-water mark
- `allUsernames: []` — unique participants (array, not Set, for JSON serialization)

New methods:
- `recordTrackPlayed(roomId, track)` — append to `tracksPlayed`, skip if same as last entry (pause/resume dedup)
- `recordUserJoined(roomId, username)` — update `peakListeners` high-water mark, add to `allUsernames` if not present

### 2. History storage + archive logic (roomManager.js)

Add `import { readFile, writeFile, mkdir } from 'fs/promises'` and `import path from 'path'`.

Update constructor to accept `dataDir`:
```javascript
constructor(dataDir = './data') {
  this.rooms = new Map();
  this.graceTimers = new Map();
  this.history = [];
  this.dataDir = dataDir;
  this.historyPath = path.join(dataDir, 'room-history.json');
  this.loadHistory();
}
```

New methods:
- `loadHistory()` — read `room-history.json`, parse, populate `this.history`
- `saveHistory()` — write `this.history` to `room-history.json`
- `archiveRoom(roomId)` — build session summary from room object, push to `this.history`, FIFO cap at 200. Returns null if trivial (0 tracks or <60s duration)
- `getHistory(limit)` — return last N entries, newest first
- `getHistoryStats()` — aggregate: totalSessions, totalTracksPlayed, uniqueListeners

Session entry shape:
```json
{
  "roomId": "A1B2C3D4",
  "hostName": "DJ Cool",
  "community": "rock-fans",
  "createdAt": 1708000000000,
  "endedAt": 1708003600000,
  "durationMs": 3600000,
  "peakListeners": 5,
  "users": ["user1", "user2"],
  "tracksPlayed": [
    { "title": "Song", "artist": "Artist", "album": "Album", "playedAt": 1708000060000 }
  ]
}
```

### 3. Hook archive into 3 deletion points (roomManager.js)

Before every `this.rooms.delete(roomId)` call, insert:
```javascript
this.archiveRoom(roomId);
this.saveHistory().catch(err => console.error('History save error:', err));
```

Three locations:
1. **Line 172** — grace period timer callback
2. **Line 386** — `cleanupStaleRooms` fallback (empty room past grace)
3. **Line 402** — `cleanupStaleRooms` (all users stale)

### 4. Server hooks in index.js

- Update `new RoomManager()` → `new RoomManager(DATA_DIR)` (line ~104)
- In `play` socket handler: if `trackId !== room.playbackState.trackId`, look up track in queue and call `roomManager.recordTrackPlayed(roomId, trackInfo)`
- In `join-room` handler: after `addUser()`, call `roomManager.recordUserJoined(roomId, username)`
- In `loadRoomState()`: add backward-compat defaults for `tracksPlayed: []`, `peakListeners: 0`, `allUsernames: []`

### 5. REST endpoints (index.js)

**Public** `GET /api/history` — last 10 sessions, stripped for privacy:
```json
{
  "sessions": [{
    "hostName": "DJ Cool",
    "community": "rock-fans",
    "createdAt": "...", "endedAt": "...", "durationMs": "...",
    "peakListeners": 5, "trackCount": 12, "userCount": 3,
    "topTracks": [{ "title": "Song", "artist": "Artist" }]
  }]
}
```

**Admin** `GET /api/admin/history` — full history (200 entries) with stats, requires admin key.

### 6. Admin panel "Past Jams" window (index.js)

New Win98 window in `getAdminPageHTML()` after existing windows:
- Stat boxes: Sessions, Tracks Played, Unique Listeners
- Table: Date, Host, Community, Duration, Tracks (expandable `<details>`), Listeners (peak/total)
- Row hover tooltip shows participant usernames
- `fetchHistory()` called on page load alongside existing fetches

### 7. Client — jamClient.js

Add `getHistory()` method:
```javascript
async getHistory() {
  const res = await fetch(`${this.serverUrl}/api/history`);
  return (await res.json()).sessions;
}
```

### 8. Client — "Recent Jams" UI (App.jsx + App.css)

State: `const [recentJams, setRecentJams] = useState([])`

Fetch once (no polling) when room selection screen shows, alongside `fetchActiveRooms`.

JSX: Below active rooms fieldset, a "Recent Jams" `<fieldset>` with `<legend>`. Each entry shows:
- Host name (VT323, bold)
- Date, duration, track count, listener count, community (small gray meta)
- Top track titles (VT323, truncated with ellipsis)

CSS: Compact list items with dotted borders, matching existing Win98 theme patterns.

### 9. Verification

1. `cd server && node --check src/index.js && node --check src/roomManager.js` — syntax OK
2. `cd client && npx eslint src/` — 0 errors
3. `cd client && npm run build` — builds clean
4. Manual: Create room, play 2-3 tracks, leave → verify `room-history.json` has entry
5. Manual: Check admin panel "Past Jams" window shows the session
6. Manual: Room selection screen shows "Recent Jams" section
7. Manual: Room with 0 tracks played → no history entry created
8. Manual: Server restart → history persists from JSON file
