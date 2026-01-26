# Navidrome Jam

Synchronized music playback for listening to the same music with friends in real-time. Built as an extension to [Navidrome](https://www.navidrome.org/).

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
- [x] Host controls (room creator has full control)
- [x] Low-latency sync (<500ms drift tolerance)
- [x] Support for FLAC and all formats Navidrome supports
- [x] Music search integrated with Navidrome library
- [x] User presence tracking with heartbeat system

### User Experience
- [x] Volume control with persistent preferences
- [x] Leave room functionality
- [x] Loading states for all async operations
- [x] Error boundary for graceful error handling
- [x] Session validation and auto-recovery

### Security & Reliability
- [x] Input validation and sanitization (XSS prevention)
- [x] Rate limiting on room creation (5 per minute per IP)
- [x] Authentication token validation
- [x] Automatic stale room cleanup
- [x] Duplicate user prevention on reconnect

## Tech Stack

- **Navidrome**: Go-based music server (existing)
- **Sync Server**: Node.js + Express + Socket.io
- **Client**: React + Vite
- **Protocol**: WebSocket for real-time communication, Subsonic API for music streaming

## Deployment

Choose your deployment method:

### 🚀 Option 1: Vercel + Railway (Recommended)

**Fastest deployment, ~$0-5/month**

1. **Deploy Server**: [Railway.app](https://railway.app) → Deploy from GitHub
2. **Deploy Client**: [Vercel.com](https://vercel.com) → Import project
3. **Custom Domain**: Add `jam.zhgnv.com` in Vercel settings

📖 [5-Minute Quickstart Guide](./VERCEL_QUICKSTART.md)
📖 [Full Vercel Deployment Guide](./VERCEL_DEPLOYMENT.md)

### 🖥️ Option 2: VPS (Self-Hosted)

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

### Phase 4: Future Enhancements
- [ ] Mobile-responsive improvements
- [ ] Persistent rooms (database storage)
- [ ] Advanced queue features (drag-to-reorder, remove)
- [ ] Album/artist browsing UI
- [ ] Voice chat integration?
- [ ] Discord bot for queue control
- [ ] Docker deployment
- [ ] Automated tests (Jest, Vitest)
- [ ] Admin dashboard

## Contributing

Contributions welcome! Open an issue or PR.

## License

MIT

## Acknowledgments

- [Navidrome](https://www.navidrome.org/) - The excellent music server this builds upon
- Inspired by Spotify Jam
