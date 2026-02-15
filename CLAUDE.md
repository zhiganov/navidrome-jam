# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Navidrome Jam** is an open-source synchronized music playback system that enables real-time listening sessions with friends. It's built as an extension to Navidrome music server, inspired by Spotify Jam but supporting personal music libraries including FLAC files.

## Architecture

The system consists of three independent components:

1. **Navidrome** (external dependency) - Music server providing Subsonic API for streaming
2. **Sync Server** (`server/`) - Node.js + Express 4 + Socket.io 4 WebSocket server managing room state and synchronization
3. **Web Client** (`client/`) - React 19 + Vite 7 SPA handling UI, Navidrome auth, and audio playback

### Key Dependencies

**Server**: express ^4.18.2, socket.io ^4.7.2, express-rate-limit ^8.2.1, cors ^2.8.5, dotenv ^16.4.5 (ES modules, no TypeScript)

**Client**: react ^19.2.0, socket.io-client ^4.8.3, crypto-js ^4.2.0 (MD5 hashing for Subsonic auth), vite ^7.2.4, eslint ^9.39.1

**Critical architectural decision**: Clients stream audio directly from Navidrome, NOT through the sync server. The sync server only broadcasts playback commands (play/pause/seek/timestamp). This design keeps the sync server lightweight and allows Navidrome to handle all media delivery.

### Communication Flow

```
Client 1 ──┐
           ├──> Sync Server (WebSocket) ──> Broadcast sync commands
Client 2 ──┘                                   │
                                               │
                                               ▼
                                          All Clients adjust local playback
                                               │
                                               ▼
                                          Stream audio from Navidrome (HTTP)
```

### Navidrome API Integration

The client uses Navidrome's **Subsonic API** for music playback (stable, documented). The server uses Navidrome's **Native REST API** for user registration (the Subsonic `createUser.view` endpoint is not implemented in Navidrome).

**Client authentication** (Subsonic API): Token-based auth using MD5(password + salt) per Subsonic spec. Implementation in `client/src/services/navidrome.js`.

**Key Subsonic endpoints used**:
- `ping.view` - Server health check and session validation
- `search3.view` - Music search
- `getArtists.view` - All artists (alphabetically indexed)
- `getAlbumList2.view` - Album lists by type (alphabeticalByName, newest, random, etc.)
- `getAlbum.view`, `getArtist.view`, `getSong.view` - Metadata
- `stream.view` - Audio streaming URL (clients use this directly)
- `scrobble.view` - Mark songs as played
- `star.view` / `unstar.view` - Add/remove from Navidrome favorites (persistent likes)
- `getStarred2.view` - Get all starred content (Favorites browse mode)
- `getPlaylists.view` / `getPlaylist.view` - Playlist browsing and queuing

**Server-side registration** (Native API): The server authenticates as admin via `POST /auth/login` (JWT), then creates users via `POST /api/user` with `x-nd-authorization: Bearer <token>` header. This enables invite-code-based self-service registration without exposing admin credentials to the client.

**Important**: Navidrome does NOT implement the Subsonic `createUser.view` endpoint. User creation must use the native REST API. The auth header is `x-nd-authorization` (not `Authorization`).

## Development Commands

### Server (WebSocket Sync Server)

```bash
cd server
npm install              # Install dependencies
npm run dev              # Start with hot-reload (node --watch)
npm start                # Production mode
```

**Environment**: Copy `.env.example` to `.env` and configure. See `.env.example` for all variables.

### Client (React Web App)

```bash
cd client
npm install              # Install dependencies
npm run dev              # Vite dev server (http://localhost:5173)
npm run build            # Production build to dist/
npm run preview          # Preview production build
```

**Environment**: Copy `.env.example` to `.env` — needs `VITE_NAVIDROME_URL` and `VITE_JAM_SERVER_URL`.

### Testing Sync Functionality

**HTML Test Client** (no Navidrome required):
```bash
cd server
npm run dev
# Open server/test-client.html in 2+ browser windows
# Test room creation, joining, and sync commands
```

**Full Stack Test** (requires Navidrome):
```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev

# Open http://localhost:5173 in 2+ browsers/tabs
# Login with Navidrome credentials, create room, test music playback
```

## Code Architecture

### Sync Server (`server/src/`)

Three files: `index.js` (Express + Socket.io server, REST endpoints, WebSocket event handlers, admin panel), `roomManager.js` (room state management with grace periods), and `sftpUploader.js` (SFTP upload pipeline to PikaPods for user uploads).

**Key design decisions**:
- Room state snapshots to Railway volume every 30s and on `SIGTERM` — sessions survive server restarts/redeploys (snapshots >10min old are discarded)
- Empty rooms get a 5-minute grace period before deletion (handles LTE handoffs, brief disconnects)
- Invite codes, waitlist, and deleted codes persist to JSON files on Railway volume (`DATA_DIR`)
- Authorization via `canControl(roomId, userId)` — host OR co-host can send playback/queue commands; only host can promote/demote
- `trust proxy` enabled for Railway reverse proxy (rate limiting needs real IPs)
- Join-in-progress: Server sends `sync` event after `room-state` so new joiners start at the right position
- Cleanup: `cleanupStaleRooms()` runs every 60s, removes users with no heartbeat for 5min
- Named constants at top of each server file — all magic numbers extracted to descriptive constants

### Web Client (`client/src/`)

Single-page app with three screens in `App.jsx`: Login → Room Selection → Jam Session.

**Service layer** (non-obvious patterns):
- `services/navidrome.js` — Subsonic API client with MD5 token auth (CryptoJS). Session restored from sessionStorage with async ping validation. Auth params appended to every URL: `?u=user&t=token&s=salt&v=1.16.1&c=navidrome-jam&f=json`
- `services/jamClient.js` — Socket.io wrapper with custom event emitter (manual `listeners` map, not Node EventEmitter). Room creation and registration use REST; everything else uses WebSocket.
- `contexts/NavidromeContext.jsx` and `JamContext.jsx` — React Context providers that create/destroy client instances on mount/unmount. Required to prevent duplicate listeners during Vite hot-reload.

**Visual theme**: Windows 98 / GeoCities aesthetic. Theme colors are CSS variables (`--win-bg`, `--win-light`, `--win-dark`, `--titlebar-*`, etc.). Transport icons (prev/play/pause/next) use CSS borders for triangles and bars. Repeat, like, and dislike icons use SVG via CSS `mask-image` data URIs — monochrome by default (`background-color: var(--text-dark)`), colored when active. Like/dislike paths are from Bootstrap Icons (`hand-thumbs-up-fill`); repeat is Lucide-style arrows.

### Synchronization Protocol

Server-authoritative model in `SyncedAudioPlayer.jsx`:

1. Host/co-host emits action → Server validates via `canControl()`, adds timestamp, broadcasts `sync` event
2. All clients compute expected position: `position + (Date.now() - timestamp) / 1000`
3. If drift > 0.5s (`DRIFT_THRESHOLD`), client seeks to expected position
4. Heartbeats sent every 2s for presence tracking

**Race condition**: Sync events can arrive before the audio element mounts. `pendingSyncRef` stores these and applies them on `loadedmetadata`. Track changes detected in `handleSyncInApp` which triggers `loadTrack` in App.jsx.

## Deployment

### Vercel + Railway (Current Production)
- **Client**: Vercel (personal account, auto-deploys on push to main) — https://jam.zhgnv.com
  - Build: `cd client && npm install && npm run build` → outputs to `client/dist/`
  - SPA rewrites: all routes → `/index.html` (configured in `vercel.json`)
  - Asset caching: `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`
  - GitHub integration: `zhiganov/navidrome-jam` → deploys automatically, no CLI needed
- **Server**: Railway — https://navidrome-jam-production.up.railway.app
  - GitHub integration: `zhiganov/navidrome-jam` → auto-deploys on push to main (root: `/server`, watch: `server/**`)
  - Nixpacks builder: `cd server && npm install` (install), `cd server && node src/index.js` (start)
  - Restart policy: ON_FAILURE with max 10 retries (configured in `railway.json`)
  - Railway project: `b4f46e75-3c65-4606-a8ee-2b7ded7b7109`
- **Navidrome**: PikaPods — https://airborne-unicorn.pikapod.net
- See: `VERCEL_QUICKSTART.md` for setup, `DEPLOYMENT.md` for VPS alternative

Both client and server auto-deploy on push to `main`. Just `git push`.

**Critical for WebSocket**: The sync server requires persistent connections. Vercel Functions don't support this, hence Railway for server hosting.

**CORS**: Socket.io uses a function-based origin check that accepts `CLIENT_URL` origins plus any `*.vercel.app` domain (for preview deployments).

**Environment**: See `.env.example` files in `server/` and `client/` for all variables. Key note: if `NAVIDROME_ADMIN_USER`/`NAVIDROME_ADMIN_PASS`/`NAVIDROME_URL` are not set, registration is disabled gracefully — login still works.

## Common Development Patterns

### Adding New WebSocket Events

1. **Server** (`server/src/index.js`):
   ```javascript
   socket.on('new-event', ({ roomId, data }) => {
     const room = roomManager.getRoom(roomId);
     // Validate permissions if needed
     // Update room state
     io.to(roomId).emit('event-response', { ... });
   });
   ```

2. **Client** (`client/src/services/jamClient.js`):
   ```javascript
   // In setupEventListeners()
   this.socket.on('event-response', (data) => {
     this.emit('event-response', data);
   });

   // Public method
   newAction(data) {
     this.socket.emit('new-event', { roomId: this.currentRoomId, ...data });
   }
   ```

3. **React** (`client/src/App.jsx`):
   ```javascript
   useEffect(() => {
     jamClient.on('event-response', (data) => {
       // Update state
     });
   }, []);
   ```

### Adding Navidrome API Endpoints

See `docs/navidrome-api-research.md` for available endpoints. Add to `client/src/services/navidrome.js`:

```javascript
async getPlaylists() {
  return this.fetch('getPlaylists.view');
}
```

All Subsonic responses are wrapped in `{ "subsonic-response": { status, ...data } }`.

## Linting & Testing

```bash
cd client && npx eslint src/       # Lint client code
cd server && node --check src/index.js && node --check src/roomManager.js  # Syntax check server
cd client && npm run build         # Verify production build
```

No automated tests yet — manual testing with `server/test-client.html` (sync only, no Navidrome) or full stack (two browser windows).

## User Uploads

Design doc: `docs/plans/2026-02-11-user-uploads-design.md`. Implementation in `server/src/sftpUploader.js`.

Registered users upload audio files through the web client. Files stream through the Jam server to PikaPods via SFTP (no temp files on Railway), where Navidrome auto-indexes them.
- **Stream-through**: Upload pipes directly from HTTP to SFTP via `sftpUploader.js`
- **Cleanup**: Non-permanent files auto-deleted after 30 days; liked files are protected
- **Permanent flag**: Users can mark up to 50 uploads as permanent; admin can override
- **File limits**: 200MB max, allowed formats: mp3, flac, ogg, opus, m4a, wav, aac
- **Storage path**: `/music/jam-uploads/<username>/` on PikaPods
- **Metadata**: `.uploads-meta.json` on PikaPods tracks upload dates and permanent flags

## Admin Panel

Server-rendered Win98-styled HTML at `/admin?key=NAVIDROME_ADMIN_PASS`. Features:
- Invite code management (view status, generate, delete, purge unused)
- Waitlist management (view entries, send invite codes, delete)
- Upload stats and file management
- Server stats (rooms, users, uptime)

## Waitlist + Telegram Notifications

Users without invite codes can join a waitlist (`POST /api/waitlist`). Admin receives Telegram notification via scenius-bot with an inline "Send Code" button — one-click to email an invite code and remove from waitlist. Uses one-time action tokens (GET endpoints, no webhook needed — avoids conflict with scenius-digest polling on the same bot token).

## Persistence (Railway Volume)

Three JSON files on `DATA_DIR` (Railway volume at `/data`):
- `invite-codes.json` — valid codes, used codes (code→username), sent codes (code→{email,name}), deleted codes
- `waitlist.json` — name, email, message, joinedAt timestamp
- `rooms-snapshot.json` — periodic room state snapshot (every 30s + SIGTERM), auto-deleted after restore

## Design Docs

Feature design docs live in `docs/plans/`. Check here before planning new features — a design doc may already exist:
- `2026-02-15-room-settings-design.md` — Kick user + password protection (ready to implement)
- `2026-02-15-queue-dnd-design.md` — Queue drag-and-drop reordering (ready to implement)
- `2026-02-15-room-history-design.md` — Room history / session logs (designed, low priority)
- `2026-02-15-strategic-bets.md` — Federation vs Bandcamp strategy evaluation

## Branches

- `main` — production (auto-deploys)
- `feature/jam-with-boo` — Valentine's edition at [boo.zhgnv.com](https://boo.zhgnv.com) with kawaii avatars and synchronized paw hold. Separate domain, OG images, favicon. Server `CLIENT_URL` supports comma-separated origins for multi-domain CORS.

