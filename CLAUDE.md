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
- `getAlbum.view`, `getArtist.view`, `getSong.view` - Metadata
- `stream.view` - Audio streaming URL (clients use this directly)
- `scrobble.view` - Mark songs as played

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

**Environment**: Copy `.env.example` to `.env` and configure:
- `PORT` - Server port (default: 3001)
- `CLIENT_URL` - CORS origin for web client
- `NAVIDROME_URL` - Navidrome instance URL (required for registration)
- `NAVIDROME_ADMIN_USER` - Admin username for user registration proxy
- `NAVIDROME_ADMIN_PASS` - Admin password for user registration proxy
- `INVITE_CODES` - Comma-separated single-use invite codes (e.g., `CODE1,CODE2,CODE3`)

### Client (React Web App)

```bash
cd client
npm install              # Install dependencies
npm run dev              # Vite dev server (http://localhost:5173)
npm run build            # Production build to dist/
npm run preview          # Preview production build
```

**Environment**: Copy `.env.example` to `.env` and configure:
- `VITE_NAVIDROME_URL` - Navidrome instance URL (e.g., http://localhost:4533)
- `VITE_JAM_SERVER_URL` - Sync server URL (e.g., http://localhost:3001)

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

**`index.js`** - Express + Socket.io server with event handlers:
- REST endpoints:
  - `/health` — health check
  - `GET /api/rooms` — list active rooms (public summary)
  - `POST /api/rooms` — create room (rate-limited 5/min/IP)
  - `GET /api/rooms/:roomId` — get room details
  - `POST /api/register` — invite-code registration (rate-limited 3/min/IP)
  - `GET /api/admin/codes` — list all invite codes with status (admin auth)
  - `POST /api/admin/generate-codes` — generate new invite codes (admin auth)
  - `DELETE /api/admin/codes/:code` — delete an invite code (admin auth)
  - `GET /admin` — server-rendered Win98-styled admin dashboard HTML page
- Admin auth: `checkAdminAuth(req, res)` helper — validates `Authorization: Bearer <NAVIDROME_ADMIN_PASS>` header or `?key=` query param
- WebSocket events: `join-room`, `play`, `pause`, `seek`, `update-queue`, `heartbeat`, `promote-cohost`, `demote-cohost`
- Authorization: Host and co-hosts can send playback/queue commands; only host can promote/demote co-hosts
- Auto host transfer when host disconnects
- Join-in-progress sync: Server sends `sync` event after `room-state` when joining a room with active playback
- Invite-code registration: validates codes, authenticates as admin via Navidrome native API, creates user
- `trust proxy` enabled for Railway reverse proxy (rate limiting)

**`roomManager.js`** - In-memory state management:
- `RoomManager` class managing Map of rooms
- Room code generation: `randomBytes(3).toString('hex').toUpperCase()` — 6 hex chars (e.g., `A3F1B2`)
- Room structure: `{ id, hostId, hostName, coHosts[], users[], queue[], playbackState, createdAt }`
- Playback state: `{ trackId, position, playing, timestamp }` - timestamp critical for drift correction
- User structure: `{ id, socketId, username, joinedAt, position, lastHeartbeat }`
- Host assignment: First user to join becomes host, auto-promotes next user on host leave
- Co-host system: `canControl(roomId, userId)` checks host OR co-host status; `addCoHost()` / `removeCoHost()` manage the list; co-hosts are cleaned up when users leave
- Duplicate user handling: Reconnecting users update their socketId without creating duplicate entries
- Cleanup: `cleanupStaleRooms()` runs every 60s, removes users with no heartbeat for 5min, deletes empty rooms

**`listRooms()`** method on `RoomManager` returns public room summaries: `{ id, hostName, userCount, currentTrack: { title, artist, playing } | null, createdAt }`.

**Invite code lifecycle**: Codes loaded from `INVITE_CODES` env var into a `Set`. A separate `usedInviteCodes` Map tracks consumed codes (`code → username`). Codes are marked used only after successful Navidrome user creation. Both are in-memory — server restart resets used codes (acceptable for casual use). Admin endpoints expose code status and allow generation/deletion.

**Key design pattern**: All state is ephemeral in-memory. Rooms disappear when empty. For persistence, future work would add Redis/database layer.

### Web Client (`client/src/`)

**`App.jsx`** - Main component with three screens:
1. Login screen - Navidrome authentication with Login/Sign Up tabs (invite-code registration)
2. Room selection - Create/join rooms + active rooms list (polled every 10s)
3. Jam session - Player with Winamp-style transport controls, Browse/Search tabs, queue with reordering, users panel with co-host promote/demote (3-panel layout with status bar)

Key features in App.jsx:
- **Active rooms**: `fetchActiveRooms()` polls `GET /api/rooms` every 10s on room selection screen
- **Album auto-queue**: `handlePlayTrack(song, albumSongs)` accepts optional album context — queues remaining tracks when playing from browse view
- **Repeat mode**: `repeatMode` state with localStorage persistence (`jam_repeat`). When enabled, `handleTrackEnded` re-appends current track to queue tail (empty queue = single-track loop)
- **Sync race condition handling**: `pendingSyncRef` stores sync events arriving before `SyncedAudioPlayer` mounts; applied on `loadedmetadata`
- **Track change detection**: `handleSyncInApp` listener detects `trackId` changes in sync events and triggers `loadTrack`

**Visual theme**: Windows 98 / GeoCities aesthetic — VT323 monospace font, beveled borders, blue gradient titlebars, starfield background, Win98 scrollbars, visitor counter, marquee.

State management via React hooks (no Redux/Zustand). Client instances provided via React Context (`NavidromeContext`, `JamContext`) for proper hot-reload cleanup.

**`contexts/NavidromeContext.jsx`** and **`contexts/JamContext.jsx`** - React Context providers:
- Create client instances on mount, cleanup on unmount
- Prevents duplicate listeners during hot-reload
- Use `useNavidrome()` and `useJam()` hooks to access clients

**`services/navidrome.js`** - Navidrome Subsonic API client:
- Token-based authentication with MD5 hashing (CryptoJS): `token = MD5(password + salt)`, random salt per request
- Session persistence via localStorage (`nd_username`, `nd_token`, `nd_salt`) with **async validation on restore** (ping check)
- URL building with auth params: `?u=user&t=token&s=salt&v=1.16.1&c=navidrome-jam&f=json`
- Methods: `authenticate()`, `restoreSession()`, `search()`, `getArtists()`, `getArtist()`, `getAlbum()`, `getSong()`, `getStreamUrl()`, `getCoverArtUrl()`
- No plaintext passwords stored — only MD5 tokens (per Subsonic spec)

**`services/jamClient.js`** - WebSocket client wrapper:
- Socket.io connection management (default transport: WebSocket with polling fallback)
- Custom event emitter pattern for React integration (not Node EventEmitter — manual `listeners` map)
- User ID generation: `'user-' + Math.random().toString(36).substring(2, 18)`, persisted in localStorage as `jam_user_id`
- Room creation via REST (`POST /api/rooms`), registration via REST (`POST /api/register`), all other operations via WebSocket
- Methods: `connect()`, `disconnect()`, `createRoom()`, `joinRoom()`, `leaveRoom()`, `play()`, `pause()`, `seek()`, `updateQueue()`, `promoteCoHost()`, `demoteCoHost()`, `sendHeartbeat()`, `register()`, `listRooms()`
- Events emitted: `room-state`, `sync`, `user-joined`, `user-left`, `cohost-updated`, `queue-updated`, `error`, `disconnected`

**`components/SyncedAudioPlayer.jsx`** - Core sync logic:
- HTML5 Audio element wrapped in React
- Volume control with localStorage persistence
- Seek bar (host/co-host only) with sync event emission
- `onPlaybackUpdate` callback reports `(currentTime, paused)` to parent for reactive UI updates
- **Drift correction algorithm** (critical):
  ```javascript
  const latency = Date.now() - state.timestamp;
  const expectedPosition = state.position + (state.playing ? latency / 1000 : 0);
  const drift = Math.abs(audio.currentTime - expectedPosition);
  if (drift > DRIFT_THRESHOLD) {  // 0.5 seconds
    audio.currentTime = expectedPosition;
  }
  ```
- Heartbeat system: Sends position every 2s for presence tracking (restarts on reconnect via `isConnected` prop)
- `pendingSyncRef` prop: Applies deferred sync state on mount (handles race condition when sync arrives before audio element is ready)
- Audio streams directly from Navidrome via `getStreamUrl()`

**`components/ErrorBoundary.jsx`** - React error boundary:
- Catches component errors and displays fallback UI
- "Try Again" and "Reload Page" recovery options
- Development mode shows error details

### Synchronization Protocol

**Server-authoritative model**:
1. Host or co-host emits action (play/pause/seek) → Server validates permission via `canControl()`
2. Server updates room state, adds timestamp
3. Server broadcasts `sync` event with `{ trackId, position, playing, timestamp }`
4. All clients (including host) adjust local playback based on timestamp + latency
5. Clients continuously send heartbeats with current position

**Why timestamps matter**: Network latency varies. Each client calculates expected position using `position + (now - timestamp) / 1000` for playing state, enabling smooth sync despite variable network delays.

### WebSocket Events Reference

| Event | Direction | Payload | Auth |
|-------|-----------|---------|------|
| `join-room` | Client → Server | `{ roomId, userId, username }` | Any |
| `leave-room` | Client → Server | (none) | Any |
| `play` | Client → Server | `{ roomId, trackId, position }` | Host / Co-host |
| `pause` | Client → Server | `{ roomId, position }` | Host / Co-host |
| `seek` | Client → Server | `{ roomId, position }` | Host / Co-host |
| `update-queue` | Client → Server | `{ roomId, queue[] }` | Host / Co-host |
| `promote-cohost` | Client → Server | `{ roomId, userId }` | Host only |
| `demote-cohost` | Client → Server | `{ roomId, userId }` | Host only |
| `heartbeat` | Client → Server | `{ roomId, position }` | Any |
| `room-state` | Server → Client | `{ room }` | — |
| `sync` | Server → Client | `{ trackId, position, playing, timestamp }` | — |
| `user-joined` | Server → Client | `{ user, room }` | — |
| `user-left` | Server → Client | `{ userId, room, newHost }` | — |
| `cohost-updated` | Server → Client | `{ room }` | — |
| `queue-updated` | Server → Client | `{ queue[] }` | — |
| `error` | Server → Client | `{ message }` | — |

## Deployment

This project supports multiple deployment strategies:

### Vercel + Railway (Current Production Setup)
- **Client**: Vercel — https://jam.zhgnv.com
  - Build: `cd client && npm install && npm run build` → outputs to `client/dist/`
  - SPA rewrites: all routes → `/index.html` (configured in `vercel.json`)
  - Asset caching: `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`
- **Server**: Railway — https://navidrome-jam-production.up.railway.app
  - Nixpacks builder: `cd server && npm install` (install), `cd server && node src/index.js` (start)
  - Restart policy: ON_FAILURE with max 10 retries (configured in `railway.json`)
  - Railway project: `b4f46e75-3c65-4606-a8ee-2b7ded7b7109`
- **Navidrome**: PikaPods — https://airborne-unicorn.pikapod.net
- See: `VERCEL_QUICKSTART.md`

### VPS (Traditional Deployment)
- nginx reverse proxy config: `nginx.conf`
- PM2 process manager: `ecosystem.config.cjs`
- Automated installer: `install.sh`
- Update script: `deploy.sh`
- See: `DEPLOYMENT.md`

### Alternative Platforms
- Render: `render.yaml` (free tier with cold starts)
- Fly.io: `Procfile` (global low-latency)

**Critical for WebSocket**: The sync server requires persistent connections. Vercel Functions don't support this, hence Railway/Render/VPS for server hosting.

## Environment Configuration

| Variable | Where | Required | Default | Description |
|----------|-------|----------|---------|-------------|
| `PORT` | Server | No | `3001` | Server listen port |
| `CLIENT_URL` | Server | No | `*` | CORS origin (set to client URL in production) |
| `NAVIDROME_URL` | Server | For registration | — | Navidrome instance URL |
| `NAVIDROME_ADMIN_USER` | Server | For registration | — | Admin username for user creation |
| `NAVIDROME_ADMIN_PASS` | Server | For registration | — | Admin password for user creation |
| `INVITE_CODES` | Server | For registration | — | Comma-separated single-use codes |
| `VITE_NAVIDROME_URL` | Client | Yes | — | Navidrome instance URL |
| `VITE_JAM_SERVER_URL` | Client | Yes | — | Sync server URL |

**Note**: If `NAVIDROME_ADMIN_USER`, `NAVIDROME_ADMIN_PASS`, or `NAVIDROME_URL` are not set, the `/api/register` endpoint returns 503 gracefully — login still works, only registration is disabled.

### Development
- Server: `http://localhost:3001`
- Client: `http://localhost:5173`
- Navidrome: User provides their own instance

### Production (Current)
- **Client** (Vercel): `VITE_NAVIDROME_URL=https://airborne-unicorn.pikapod.net`, `VITE_JAM_SERVER_URL=https://navidrome-jam-production.up.railway.app`
- **Server** (Railway): `CLIENT_URL=https://jam.zhgnv.com`, `NAVIDROME_URL=https://airborne-unicorn.pikapod.net`, plus admin credentials and invite codes
- Navidrome hosted on PikaPods

**Gotcha**: When adding env vars on Railway/Vercel, watch for leading spaces in variable names — both platforms silently accept them, causing cryptic build failures like `"empty key"` errors in Docker.

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

### Registration Flow (Server-Side)

```
Client → POST /api/register { username, password, inviteCode }
  ↓ validate input + check invite code
Server → POST navidrome/auth/login { username: admin, password: adminPass }
  ↓ get JWT token
Server → POST navidrome/api/user { userName, password, isAdmin: false }
         (header: x-nd-authorization: Bearer <jwt>)
  ↓ success → mark invite code as used
Server → 201 { message: "Account created successfully" }
```

### Client localStorage Keys

| Key | Purpose |
|-----|---------|
| `jam_user_id` | Persistent user ID (`user-<random>`) for WebSocket identity |
| `navidrome_username` | Navidrome username for session restore |
| `navidrome_token` | MD5(password + salt) for Subsonic auth |
| `navidrome_salt` | Random salt used in token generation |
| `audio_volume` | Last-used volume level (0.0–1.0) |
| `jam_repeat` | Repeat mode (`on` / `off`) |

## Testing Strategy

Currently manual testing only. Test checklist:

**Room Management**:
- [ ] Create room generates unique 6-char code
- [ ] Join room with valid code works
- [ ] Join room with invalid code shows error
- [ ] First user becomes host (crown icon)

**Playback Sync**:
- [ ] Host play command starts playback on all clients
- [ ] Host pause command pauses all clients
- [ ] Host seek updates position on all clients
- [ ] Clients stay within 500ms of each other (check console logs)
- [ ] Audio streams from Navidrome (check Network tab)

**Host Transfer & Co-Hosts**:
- [ ] Host disconnect promotes next user
- [ ] New host can control playback
- [ ] Host can promote user to co-host (+ button in users panel)
- [ ] Co-host can play/pause/seek/queue
- [ ] Host can demote co-host (- button)
- [ ] Co-host status cleared when user leaves room

**Library Browser**:
- [ ] Browse tab shows all artists from Navidrome
- [ ] Clicking artist shows their albums
- [ ] Clicking album shows track list with Queue All button
- [ ] Breadcrumb navigation works (Library > Artist > Album)

**Active Rooms & Repeat**:
- [ ] Room selection screen shows active rooms list
- [ ] Active rooms list updates every 10 seconds
- [ ] Clicking "Join" on active room enters the room
- [ ] Repeat button toggles on/off with visual state change
- [ ] With repeat on, finished track re-appends to queue
- [ ] With repeat on and empty queue, single track loops
- [ ] Playing from album browse view queues remaining album tracks

**Admin Dashboard**:
- [ ] `/admin?key=<pass>` loads Win98-styled admin page
- [ ] Shows all invite codes with used/available status
- [ ] Generate new codes button works
- [ ] Delete code button works

**Edge Cases**:
- [ ] Multiple rapid play/pause commands
- [ ] Seeking during playback
- [ ] Network interruption and reconnect
- [ ] Last user leaving deletes room

## Security Features

The project includes several security measures (see `SECURITY.md` for details):

- **Input validation**: Room IDs, usernames, and all user input are validated and sanitized
- **Rate limiting**: Room creation (5/min/IP), registration (3/min/IP) via `express-rate-limit`
- **XSS prevention**: HTML tags and special characters stripped from user input
- **Session validation**: Restored sessions are validated with Navidrome ping before use
- **Token-based auth**: Client credentials stored as MD5 tokens, not plaintext passwords
- **Invite-code registration**: Single-use codes, admin credentials never exposed to client
- **Trust proxy**: Enabled for accurate IP detection behind Railway reverse proxy

