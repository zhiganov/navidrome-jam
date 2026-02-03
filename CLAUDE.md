# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Navidrome Jam** is an open-source synchronized music playback system that enables real-time listening sessions with friends. It's built as an extension to Navidrome music server, inspired by Spotify Jam but supporting personal music libraries including FLAC files.

## Architecture

The system consists of three independent components:

1. **Navidrome** (external dependency) - Music server providing Subsonic API for streaming
2. **Sync Server** (`server/`) - Node.js WebSocket server managing room state and synchronization
3. **Web Client** (`client/`) - React SPA handling UI, Navidrome auth, and audio playback

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

### Subsonic API Integration

**IMPORTANT**: This project uses Navidrome's **Subsonic API** (not the Native API). The Subsonic API is stable and documented, while the Native API is intentionally unstable. See `docs/navidrome-api-research.md` for detailed rationale.

**Authentication**: Token-based auth using MD5(password + salt) per Subsonic spec. Implementation in `client/src/services/navidrome.js`.

**Key endpoints used**:
- `ping.view` - Server health check
- `search3.view` - Music search
- `getAlbum.view`, `getArtist.view`, `getSong.view` - Metadata
- `stream.view` - Audio streaming URL (clients use this directly)
- `scrobble.view` - Mark songs as played

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
- `NAVIDROME_URL` - Navidrome instance URL (optional, for future features)

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
- REST endpoints: `/health`, `/api/rooms` (create room)
- WebSocket events: `join-room`, `play`, `pause`, `seek`, `update-queue`, `heartbeat`
- Authorization: Only room host can send playback commands
- Auto host transfer when host disconnects

**`roomManager.js`** - In-memory state management:
- `RoomManager` class managing Map of rooms
- Room structure: `{ id, hostId, users[], queue[], playbackState, createdAt }`
- Playback state: `{ trackId, position, playing, timestamp }` - timestamp critical for drift correction
- Host assignment: First user to join becomes host, auto-promotes on host leave
- Cleanup: `cleanupStaleRooms()` removes inactive rooms (5min timeout)

**Key design pattern**: All state is ephemeral in-memory. Rooms disappear when empty. For persistence, future work would add Redis/database layer.

### Web Client (`client/src/`)

**`App.jsx`** - Main component with three screens:
1. Login screen - Navidrome authentication
2. Room selection - Create/join rooms
3. Jam session - Player, search, queue, users

State management via React hooks (no Redux/Zustand). Client instances provided via React Context (`NavidromeContext`, `JamContext`) for proper hot-reload cleanup.

**`contexts/NavidromeContext.jsx`** and **`contexts/JamContext.jsx`** - React Context providers:
- Create client instances on mount, cleanup on unmount
- Prevents duplicate listeners during hot-reload
- Use `useNavidrome()` and `useJam()` hooks to access clients

**`services/navidrome.js`** - Navidrome Subsonic API client:
- Token-based authentication with MD5 hashing (CryptoJS)
- Session persistence via localStorage with **async validation on restore** (ping check)
- URL building with auth params: `?u=user&t=token&s=salt&v=1.16.1&c=navidrome-jam&f=json`
- Methods: `authenticate()`, `restoreSession()`, `search()`, `getStreamUrl()`, `getCoverArtUrl()`

**`services/jamClient.js`** - WebSocket client wrapper:
- Socket.io connection management
- Event emitter pattern for React integration
- User ID generation and persistence (localStorage)
- Methods: `connect()`, `joinRoom()`, `play()`, `pause()`, `seek()`, `updateQueue()`, `sendHeartbeat()`

**`components/SyncedAudioPlayer.jsx`** - Core sync logic:
- HTML5 Audio element wrapped in React
- Volume control with localStorage persistence
- Seek bar (host-only) with sync event emission
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
- Audio streams directly from Navidrome via `getStreamUrl()`

**`components/ErrorBoundary.jsx`** - React error boundary:
- Catches component errors and displays fallback UI
- "Try Again" and "Reload Page" recovery options
- Development mode shows error details

### Synchronization Protocol

**Server-authoritative model**:
1. Host emits action (play/pause/seek) → Server validates host permission
2. Server updates room state, adds timestamp
3. Server broadcasts `sync` event with `{ trackId, position, playing, timestamp }`
4. All clients (including host) adjust local playback based on timestamp + latency
5. Clients continuously send heartbeats with current position

**Why timestamps matter**: Network latency varies. Each client calculates expected position using `position + (now - timestamp) / 1000` for playing state, enabling smooth sync despite variable network delays.

## Deployment

This project supports multiple deployment strategies:

### Vercel + Railway (Recommended for Production)
- Client: Vercel (static hosting, global CDN)
- Server: Railway (WebSocket support, auto-deploy)
- Config files: `vercel.json`, `railway.json`
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

### Development
- Server: `http://localhost:3001`
- Client: `http://localhost:5173`
- Navidrome: User provides their own instance

### Production
- Set `CLIENT_URL` on server to match client domain (CORS)
- Set `VITE_JAM_SERVER_URL` to actual deployed server URL
- SSL/HTTPS required for production (auto via Vercel/Railway or certbot on VPS)

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

**Host Transfer**:
- [ ] Host disconnect promotes next user
- [ ] New host can control playback

**Edge Cases**:
- [ ] Multiple rapid play/pause commands
- [ ] Seeking during playback
- [ ] Network interruption and reconnect
- [ ] Last user leaving deletes room

## Security Features

The project includes several security measures (see `SECURITY.md` for details):

- **Input validation**: Room IDs, usernames, and all user input are validated and sanitized
- **Rate limiting**: Room creation limited to 5 per minute per IP (`express-rate-limit`)
- **XSS prevention**: HTML tags and special characters stripped from user input
- **Session validation**: Restored sessions are validated with Navidrome ping before use
- **Token-based auth**: Credentials stored as MD5 tokens, not plaintext passwords

