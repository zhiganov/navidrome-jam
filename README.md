# Navidrome Jam

Synchronized music playback for listening to the same music with friends in real-time. Built as an extension to [Navidrome](https://www.navidrome.org/). Features a retro Windows 98 / GeoCities aesthetic.

**Live at [jam.zhgnv.com](https://jam.zhgnv.com)**

<img width="1200" height="630" alt="og-image" src="https://github.com/user-attachments/assets/6eba935c-632b-407e-b905-6d334d6a0eab" />

## Motivation

Spotify Jam lets you listen to music together, but it requires Spotify Premium and doesn't support your own music library (FLAC files). This project enables synchronized playback of your personal music collection with friends while gaming or hanging out.

## Architecture

```
┌─────────────┐         ┌──────────────────┐
│  Navidrome  │◄────────┤  Jam Sync Server │
│   (Media)   │         │   (WebSocket)    │
└─────────────┘         └──────────────────┘
                               ▲
                               │
                    ┌──────────┴──────────┐
                    │                     │
              ┌─────▼─────┐        ┌─────▼─────┐
              │  Client 1 │        │  Client 2 │
              │  (Web UI) │        │  (Web UI) │
              └───────────┘        └───────────┘
```

### Components

1. **Navidrome** - Existing music server for hosting/streaming FLAC files
2. **Jam Sync Server** - WebSocket server for real-time playback synchronization
3. **Web Client** - Modified Navidrome web UI with jam session support

## Features

### Core Functionality
- [x] Create/join jam rooms with room codes
- [x] Synchronized play/pause/seek across all participants
- [x] Shared queue management with auto-play
- [x] Host controls with co-host delegation
- [x] Low-latency sync (<500ms drift tolerance)
- [x] Support for FLAC and all formats Navidrome supports
- [x] Music search integrated with Navidrome library
- [x] Library browser (artist/album/song navigation)
- [x] User presence tracking with heartbeat system

### User Experience
- [x] Invite-code-based self-service registration
- [x] Login / Sign Up tabs with form validation
- [x] Co-host system (host can promote/demote users)
- [x] Queue reordering (move up/down/remove)
- [x] Transport controls (prev/play-pause/next) with play history
- [x] Repeat mode — finished tracks re-append to queue for continuous playback
- [x] Album auto-queue — playing a track from album view queues remaining tracks
- [x] Active rooms list on room selection screen (auto-refreshing)
- [x] Volume control with persistent preferences
- [x] Leave room functionality
- [x] Loading states for all async operations
- [x] Error boundary for graceful error handling
- [x] Session validation and auto-recovery
- [x] OG meta tags and Twitter Cards for rich link previews
- [x] Windows 98 / GeoCities retro UI theme with custom favicon and OG image
- [x] Admin dashboard for invite code management (server-rendered at `/admin`)

### Security & Reliability
- [x] Input validation and sanitization (XSS prevention)
- [x] Rate limiting on room creation (5/min/IP) and registration (3/min/IP)
- [x] Authentication token validation
- [x] Automatic stale room cleanup
- [x] Duplicate user prevention on reconnect
- [x] Invite codes are single-use; admin credentials never exposed to client

## Tech Stack

- **Navidrome**: Go-based music server (existing)
- **Sync Server**: Node.js + Express + Socket.io
- **Client**: React + Vite
- **Protocol**: WebSocket for real-time communication, Subsonic API for music streaming

## Deployment

Choose your deployment method:

### Option 1: Vercel + Railway (Recommended)

**Fastest deployment, ~$0-5/month**

1. **Deploy Server**: [Railway.app](https://railway.app) — deploy from GitHub, set env vars (see `server/.env.example`)
2. **Deploy Client**: [Vercel.com](https://vercel.com) — import project, set `VITE_NAVIDROME_URL` and `VITE_JAM_SERVER_URL`
3. **Set invite codes**: Add `INVITE_CODES`, `NAVIDROME_ADMIN_USER`, `NAVIDROME_ADMIN_PASS` on Railway for self-service registration

See [VERCEL_QUICKSTART.md](./VERCEL_QUICKSTART.md) for details.

### Option 2: VPS (Self-Hosted)

**Full control, ~$5-10/month**

```bash
curl -fsSL https://raw.githubusercontent.com/zhiganov/navidrome-jam/main/install.sh | bash
```

📖 [VPS Deployment Guide](./DEPLOYMENT.md)

---

## Local Development

### Prerequisites

1. **Navidrome** - Install and configure Navidrome
   ```bash
   # See: https://www.navidrome.org/docs/installation/
   ```

2. **Node.js 18+** - Required for sync server and client

### Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/zhiganov/navidrome-jam.git
   cd navidrome-jam
   ```

2. Install server dependencies:
   ```bash
   cd server
   npm install
   cp .env.example .env
   # Edit .env if needed
   ```

3. Install client dependencies:
   ```bash
   cd ../client
   npm install
   cp .env.example .env
   # Edit .env to point to your Navidrome instance
   ```

4. Start the sync server:
   ```bash
   cd ../server
   npm run dev
   ```

5. In a new terminal, start the client:
   ```bash
   cd client
   npm run dev
   ```

6. Open http://localhost:5173 in your browser

See [QUICKSTART.md](./QUICKSTART.md) for detailed testing instructions.

## Security

This project implements several security measures:
- Input validation and sanitization to prevent XSS attacks
- Rate limiting to prevent abuse
- Token-based authentication with Navidrome
- Session validation on restore

For detailed security considerations, see [SECURITY.md](./SECURITY.md).

## Development

### Project Structure

```
navidrome-jam/
├── server/           # WebSocket sync server (Node.js + Socket.io)
│   ├── src/
│   │   ├── index.js         # Main server with validation & rate limiting
│   │   └── roomManager.js   # Room state management & cleanup
│   └── test-client.html     # HTML test client
├── client/           # React web client
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── SyncedAudioPlayer.jsx  # Audio player with volume control
│   │   │   └── ErrorBoundary.jsx      # Error handling wrapper
│   │   ├── contexts/        # React contexts
│   │   │   ├── NavidromeContext.jsx   # Navidrome client provider
│   │   │   └── JamContext.jsx         # Jam client provider
│   │   ├── services/        # API clients
│   │   │   ├── navidrome.js          # Navidrome Subsonic API client
│   │   │   └── jamClient.js          # WebSocket client wrapper
│   │   └── App.jsx          # Main app with loading states
│   └── public/
│       ├── favicon.svg            # Win98 music note favicon
│       ├── og-image.svg           # OG image source (Win98 scene)
│       └── og-image.png           # Rasterized OG image for social previews
├── docs/             # Documentation
├── QUICKSTART.md     # Quick start guide
└── SECURITY.md       # Security considerations
```

### Running Tests

Test the sync server with the HTML test client:
```bash
cd server
npm run dev
# Open test-client.html in two browser windows
```

Test with the full stack:
```bash
# Terminal 1: Sync server
cd server && npm run dev

# Terminal 2: Web client
cd client && npm run dev

# Open http://localhost:5173 in two browsers
```

## Roadmap

### Phase 1: Proof of Concept ✅
- [x] Create repository
- [x] Research Navidrome API/architecture
- [x] Build minimal sync server
- [x] Create basic test client

### Phase 2: Core Features ✅
- [x] Room creation/joining
- [x] Playback synchronization (WebSocket-based)
- [x] Queue management
- [x] User presence tracking
- [x] Integrate with Navidrome authentication
- [x] Build production web client UI
- [x] Music search functionality
- [x] Drift correction algorithm

### Phase 3: Polish ✅
- [x] Rate limiting and security hardening
- [x] Input validation and XSS prevention
- [x] Queue auto-play functionality
- [x] Volume control with persistence
- [x] Error boundaries and graceful error handling
- [x] Loading states for better UX
- [x] Session validation and recovery
- [x] React context refactoring (hot-reload safe)
- [x] Proper event listener cleanup
- [x] Leave room functionality

### Phase 4: Deployment & Registration ✅
- [x] Deploy server to Railway
- [x] Deploy client to Vercel (jam.zhgnv.com)
- [x] Invite-code-based user registration via Navidrome native API
- [x] Windows 98 / GeoCities UI redesign

### Phase 5: Library & Controls ✅
- [x] Album/artist browsing UI with breadcrumb navigation
- [x] Queue reordering (move up/down/remove)
- [x] Transport controls (prev/play-pause/next) with Winamp-style CSS icons
- [x] Play history for previous track navigation
- [x] Co-host system (host promotes users to share playback control)

### Phase 6: Sync, UX & Admin ✅
- [x] Fix sync: join-in-progress playback, track change detection, race condition handling
- [x] Album auto-queue (remaining tracks queued when playing from browse view)
- [x] Repeat mode with localStorage persistence
- [x] Active rooms list on room selection screen
- [x] Admin dashboard (invite code management, code generation/deletion)
- [x] GitHub repo link in client UI
- [x] OG meta tags, Twitter Cards, custom favicon and OG image
- [x] Win98-themed SVG favicon and OG image with Winamp player scene

### Phase 7: Future Enhancements
- [ ] Mobile-responsive improvements
- [ ] Persistent rooms (database storage)
- [ ] Discord bot for queue control
- [ ] Docker deployment
- [ ] Automated tests (Jest, Vitest)

## Changelog

### 2026-02-10 — Sync Fixes, Repeat, Active Rooms, Admin Dashboard

- **Sync fixes**: Fixed three interrelated bugs — no playback on join, wrong track on host change, race condition when sync arrives before audio element mounts. Server now sends sync event on join; client detects track changes and applies deferred sync via `pendingSyncRef`.
- **Repeat mode**: Toggle auto-repeat so the room plays forever. Finished tracks re-append to queue tail. Empty queue + repeat = single-track loop. State persisted in localStorage.
- **Album auto-queue**: Playing a track from album browse view now queues all remaining album tracks, so next/prev buttons work within the album.
- **Active rooms**: Room selection screen shows currently active rooms with host name, listener count, and current track. Auto-refreshes every 10 seconds.
- **Admin dashboard**: Server-rendered Win98-styled page at `/admin` for invite code management — view code status (available/used/who used it), generate new codes, delete codes. Protected by admin password.
- **Social sharing**: OG meta tags, Twitter Cards, custom Win98 favicon (SVG), and OG image with Winamp player scene for rich link previews in messengers.
- **GitHub link**: Repo link added to login and room selection screens.

### 2026-02-10 — Co-hosts, Library Browser, Transport Controls

- **Co-host system**: Host can promote/demote users to co-host. Co-hosts get full playback and queue control. Server validates with `canControl()` (host OR co-host). Co-host status cleaned up on user leave.
- **Library browser**: Browse tab with artist/album/song navigation. Breadcrumb navigation (Library > Artist > Album). "Queue All" button on album view. Win98 folder icons and album thumbnails.
- **Transport controls**: Winamp-style prev/play-pause/next buttons with CSS-drawn icons in a dark recessed panel. Play/pause updates reactively via audio element callbacks.
- **Queue reordering**: Move tracks up/down or remove them. Unicode arrow buttons.
- **Play history**: Previous track button navigates actual history (3-second threshold — restart vs go back).
- **Bug fixes**: Queue All only adding last track (stale state closure), invisible username in users list (CSS color inheritance), queue disconnected from player (auto-play on first add).

### 2026-02-09 — Initial Release

- Synchronized music playback rooms with WebSocket sync
- Navidrome Subsonic API integration (search, stream, metadata)
- Invite-code-based self-service registration
- Windows 98 / GeoCities retro UI theme
- Deployed to Vercel (client) + Railway (server)

## Contributing

Contributions welcome! Open an issue or PR.

## License

Apache-2.0

## Acknowledgments

- [Navidrome](https://www.navidrome.org/) - The excellent music server this builds upon
- Inspired by Spotify Jam
