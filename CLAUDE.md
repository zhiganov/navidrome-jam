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

**Client**: react ^19.2.0, socket.io-client ^4.8.3, crypto-js ^4.2.0 (MD5 hashing for Subsonic auth), react-kawaii ^1.6.0 (avatar illustrations), vite ^7.2.4, eslint ^9.39.1

**Critical architectural decision**: Clients stream audio directly from Navidrome, NOT through the sync server. The sync server only broadcasts playback commands (play/pause/seek/timestamp). This design keeps the sync server lightweight and allows Navidrome to handle all media delivery.

**Third-party assets**: Avatar illustrations use [react-kawaii](https://github.com/elizabetdev/react-kawaii) (MIT). 9 characters (Cat, Ghost, Planet, IceCream, Mug, Backpack, SpeechBubble, Chocolate, Browser) with different colors and moods. React-kawaii renders as inline SVG React components. The paw icon (`getPawSvg()` in `catData.js`) is a hand-drawn SVG rendered via `dangerouslySetInnerHTML` in `PawButton.jsx`.

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
- `star.view`, `unstar.view` - Like/unlike tracks (syncs to Navidrome favorites)

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
- `CLIENT_URL` - CORS origin(s) for web client (supports comma-separated values for multi-origin, e.g., `https://jam.zhgnv.com,http://localhost:5173`)
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

Two files: `index.js` (Express + Socket.io server, REST endpoints, WebSocket event handlers) and `roomManager.js` (in-memory room state management).

**Key design decisions**:
- All state is ephemeral in-memory — rooms disappear when empty, invite code usage resets on server restart
- Authorization via `canControl(roomId, userId)` — host OR co-host can send playback/queue commands; only host can promote/demote
- `trust proxy` enabled for Railway reverse proxy (rate limiting needs real IPs)
- Join-in-progress: Server sends `sync` event after `room-state` so new joiners start at the right position
- Cleanup: `cleanupStaleRooms()` runs every 60s, removes users with no heartbeat for 5min

### Web Client (`client/src/`)

Single-page app with three screens in `App.jsx`: Login → Room Selection → Jam Session.

**Service layer** (non-obvious patterns):
- `services/navidrome.js` — Subsonic API client with MD5 token auth (CryptoJS). Session restored from localStorage with async ping validation. Auth params appended to every URL: `?u=user&t=token&s=salt&v=1.16.1&c=navidrome-jam&f=json`
- `services/jamClient.js` — Socket.io wrapper with custom event emitter (manual `listeners` map, not Node EventEmitter). Room creation and registration use REST; everything else uses WebSocket.
- `contexts/NavidromeContext.jsx` and `JamContext.jsx` — React Context providers that create/destroy client instances on mount/unmount. Required to prevent duplicate listeners during Vite hot-reload.

**Visual theme**: Windows 98 / GeoCities aesthetic with Valentine overlay. Base theme colors are CSS variables (`--win-bg`, `--win-light`, `--win-dark`, `--titlebar-*`, etc.). Valentine accents use `--valentine-pink`, `--valentine-rose`, `--valentine-hot`, `--valentine-accent`. Transport icons (prev/play/pause/next) use CSS borders for triangles and bars. Repeat, like, and dislike icons use SVG via CSS `mask-image` data URIs — monochrome by default (`background-color: var(--text-dark)`), colored when active. Like/dislike paths are from Bootstrap Icons (`hand-thumbs-up-fill`); repeat is Lucide-style arrows.

**Jam With Boo** (Valentine's Day feature): Avatar selection and synchronized dance strip. Components in `client/src/components/`:
- `catData.js` — 9 named avatars using react-kawaii components. Exports `CATS` array (each entry has `component`, `color`, `mood`) and `getPawSvg(size)`.
- `AvatarIcon.jsx` — Renders the correct react-kawaii character: `<AvatarIcon avatar={cat} size={40} uniqueId="ctx-id" />`. Pass unique `uniqueId` per render context to avoid SVG ID collisions.
- `CatPicker.jsx` — Avatar selection overlay (48px). Emits `select-cat` to server.
- `CatDanceFloor.jsx` — Strip of dancing avatars above the now-playing bar. Receives `catSelections`, `isPlaying`, `pawMagicLevel`, `holdProgress`, `pawClimax`. Avatars converge as hold progress increases; climax triggers heart burst and flash.
- `PawButton.jsx` — Hold-to-activate button (36x32px, matching transport buttons). 8-second hold timer with `requestAnimationFrame`. Reports progress via `onHoldProgress` callback (lifted to App.jsx). Climax is derived state in App.jsx: `pawClimax = holdProgress >= 1 && pawHolders.length >= 2` — persistent as long as 2+ users hold at full progress, no timer-based reset.

### Synchronization Protocol

Server-authoritative model in `SyncedAudioPlayer.jsx`:

1. Host/co-host emits action → Server validates via `canControl()`, adds timestamp, broadcasts `sync` event
2. All clients compute expected position: `position + (Date.now() - timestamp) / 1000`
3. If drift > 0.5s (`DRIFT_THRESHOLD`), client seeks to expected position
4. Heartbeats sent every 2s for presence tracking

**Race condition**: Sync events can arrive before the audio element mounts. `pendingSyncRef` stores these and applies them on `loadedmetadata`. Track changes detected in `handleSyncInApp` which triggers `loadTrack` in App.jsx.

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
| `like-track` | Client → Server | `{ roomId, trackId }` | Any room member |
| `dislike-track` | Client → Server | `{ roomId, trackId }` | Any room member |
| `remove-reaction` | Client → Server | `{ roomId, trackId }` | Any room member |
| `select-cat` | Client → Server | `{ roomId, catId }` | Any room member |
| `paw-hold` | Client → Server | `{ roomId }` | Any room member |
| `paw-release` | Client → Server | `{ roomId }` | Any room member |
| `room-state` | Server → Client | `{ room }` | — |
| `sync` | Server → Client | `{ trackId, position, playing, timestamp }` | — |
| `user-joined` | Server → Client | `{ user, room }` | — |
| `user-left` | Server → Client | `{ userId, room, newHost }` | — |
| `cohost-updated` | Server → Client | `{ room }` | — |
| `queue-updated` | Server → Client | `{ queue[] }` | — |
| `track-reactions` | Server → Client | `{ trackId, likes, dislikes, reactions }` | — |
| `cat-updated` | Server → Client | `{ catSelections }` | — |
| `paw-state` | Server → Client | `{ pawHolders }` | — |
| `error` | Server → Client | `{ message }` | — |

## Branch Strategy

| Branch | Domain | Purpose |
|--------|--------|---------|
| `main` | `jam.zhgnv.com` | Original Navidrome Jam |
| `feature/jam-with-boo` | `boo.zhgnv.com` | Valentine's Day edition ("Jam With Boo") — react-kawaii avatars, paw hold climax, Valentine theme |

**Do NOT merge `feature/jam-with-boo` into `main`** — they are separate products with different OG metadata, favicons, and features. Vercel deploys each branch to its own domain via branch domain configuration.

## Deployment

This project supports multiple deployment strategies:

### Vercel + Railway (Current Production Setup)
- **Client**: Vercel (personal account) — auto-deploys on push
  - `main` → `jam.zhgnv.com`
  - `feature/jam-with-boo` → `boo.zhgnv.com` (configured via Vercel dashboard → Domains → Git Branch)
  - Build: `cd client && npm install && npm run build` → outputs to `client/dist/`
  - SPA rewrites: all routes → `/index.html` (configured in `vercel.json`)
  - Asset caching: `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`
  - GitHub integration: `zhiganov/navidrome-jam` → deploys automatically, no CLI needed
  - OG images must be PNG (not SVG) for Facebook/Twitter/Telegram compatibility. Convert with `@resvg/resvg-js`
- **Server**: Railway — https://navidrome-jam-production.up.railway.app
  - GitHub integration: `zhiganov/navidrome-jam` → auto-deploys on push to main (root: `/server`, watch: `server/**`)
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

### Deploy Commands

Both client and server auto-deploy on push:
- **Client** → Vercel (GitHub integration, deploys all branches with matching domain config)
- **Server** → Railway (GitHub integration, watches `server/**`, deploys from `main`)

```bash
# Push main — deploys both client (jam.zhgnv.com) and server
git push

# Push feature branch — deploys client only (boo.zhgnv.com)
git push origin feature/jam-with-boo
```

## Environment Configuration

| Variable | Where | Required | Default | Description |
|----------|-------|----------|---------|-------------|
| `PORT` | Server | No | `3001` | Server listen port |
| `CLIENT_URL` | Server | No | `*` | CORS origin(s), comma-separated for multiple (e.g., `https://jam.zhgnv.com,http://localhost:5173`) |
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
- **Server** (Railway): `CLIENT_URL=https://jam.zhgnv.com,https://boo.zhgnv.com`, `NAVIDROME_URL=https://airborne-unicorn.pikapod.net`, plus admin credentials and invite codes
- Navidrome hosted on PikaPods

**Gotcha**: When adding env vars on Railway/Vercel, watch for leading spaces in variable names — both platforms silently accept them, causing cryptic build failures like `"empty key"` errors in Docker.

## React 19 Gotchas

- **Stale closures in `requestAnimationFrame` loops**: `useCallback` captures state values at creation time. Long-running rAF loops (e.g., PawButton's 8-second hold timer) will see stale values. Fix: store mutable values in `useRef` and update via `useEffect`.
- **No `ref.current` assignment during render**: React 19 strict mode forbids `myRef.current = value` in the render path. Move to `useEffect`.
- **Inline `transform` vs CSS `@keyframes` conflict**: If a CSS animation sets `transform` and you also set inline `transform` on the same element, only one wins. Fix: apply positional transforms (e.g., `translateX`) on a wrapper, animations on an inner element.

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

### Client Storage Keys

**sessionStorage** (cleared on tab close):

| Key | Purpose |
|-----|---------|
| `navidrome_username` | Navidrome username for session restore |
| `navidrome_token` | MD5(password + salt) for Subsonic auth |
| `navidrome_salt` | Random salt used in token generation |

**localStorage** (persistent preferences):

| Key | Purpose |
|-----|---------|
| `jam_user_id` | Persistent user ID (`user-<random>`) for WebSocket identity |
| `audio_volume` | Last-used volume level (0.0–1.0) |
| `jam_repeat` | Repeat mode (`on` / `off`) |
| `jam_community` | Last-used community name for room creation |

## Linting

**ESLint 9 flat config** (`client/eslint.config.js`): Uses `defineConfig` from `eslint/config` (not legacy `.eslintrc`). Includes `react-hooks` and `react-refresh` plugins. Custom rule: `no-unused-vars` ignores uppercase/underscore-prefixed variables (`varsIgnorePattern: '^[A-Z_]'`).

```bash
cd client && npx eslint src/      # Lint all client source
```

## Testing

No automated tests yet. Manual testing with the HTML test client (`server/test-client.html`) or full stack (two browser windows). `cat-preview.html` in project root previews all 9 cat avatars at multiple sizes. See `SECURITY.md` for security measures.

## Planned Features

Design docs in `docs/plans/`:

### User Uploads (`2026-02-11-user-uploads-design.md`)

Registered users will be able to upload audio files through the web client. Files stream through the Jam server to PikaPods via SFTP, where Navidrome indexes them. Key design decisions:
- **Stream-through**: Upload pipes directly from HTTP to SFTP (no temp files on Railway)
- **Cleanup**: Non-permanent files auto-deleted after 30 days
- **Permanent flag**: Users can mark up to 50 uploads as permanent; admin can override
- **File limits**: 200MB max, allowed formats: mp3, flac, ogg, opus, m4a, wav, aac
- **Storage path**: `/music/jam-uploads/<username>/` on PikaPods
- **Metadata**: `.uploads-meta.json` on PikaPods tracks upload dates and permanent flags

### Likes/Dislikes → Navidrome Favorites (`2026-02-14-likes-dislikes-design.md`, `2026-02-14-likes-dislikes-impl.md`)

Track reactions sync to Navidrome's native favorites via `star.view`/`unstar.view` Subsonic API. Uploads with net positive likes become exempt from 30-day auto-cleanup.

