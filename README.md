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

- [x] Create/join jam rooms with room codes
- [x] Synchronized play/pause/seek across all participants
- [x] Shared queue management
- [x] Host controls (room creator has full control)
- [x] Low-latency sync (<500ms drift tolerance)
- [x] Support for FLAC and all formats Navidrome supports
- [x] Music search integrated with Navidrome library
- [x] User presence tracking

## Tech Stack

- **Navidrome**: Go-based music server (existing)
- **Sync Server**: Node.js + Express + Socket.io
- **Client**: React + Vite
- **Protocol**: WebSocket for real-time communication, Subsonic API for music streaming

## Installation

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

## Development

### Project Structure

```
navidrome-jam/
├── server/           # WebSocket sync server (Node.js + Socket.io)
│   ├── src/
│   │   ├── index.js         # Main server
│   │   └── roomManager.js   # Room state management
│   └── test-client.html     # HTML test client
├── client/           # React web client
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── services/        # API clients
│   │   └── App.jsx          # Main app
│   └── public/
├── docs/             # Documentation
└── QUICKSTART.md     # Quick start guide
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

### Phase 3: Polish (In Progress)
- [ ] Mobile-responsive improvements
- [ ] Persistent rooms (database storage)
- [ ] Rate limiting and security
- [ ] Advanced queue features (reorder, remove)
- [ ] Album/artist browsing
- [ ] Voice chat integration?
- [ ] Discord bot for queue control
- [ ] Docker deployment
- [ ] Automated tests

## Contributing

Contributions welcome! Open an issue or PR.

## License

MIT

## Acknowledgments

- [Navidrome](https://www.navidrome.org/) - The excellent music server this builds upon
- Inspired by Spotify Jam
