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

- [ ] Create/join jam rooms with room codes
- [ ] Synchronized play/pause/seek across all participants
- [ ] Shared queue management
- [ ] Host controls (room creator can promote others)
- [ ] Low-latency sync (<500ms drift tolerance)
- [ ] Support for FLAC and other formats Navidrome supports

## Tech Stack

- **Navidrome**: Go-based music server (existing)
- **Sync Server**: Node.js + Socket.io or Go + WebSocket
- **Client**: React (Navidrome's existing UI framework)
- **Protocol**: WebSocket for real-time communication

## Installation

> Coming soon

## Development

### Prerequisites

- Navidrome instance running
- Node.js 18+ or Go 1.21+
- Your music library accessible to Navidrome

### Running Locally

```bash
# Clone the repo
git clone https://github.com/zhiganov/navidrome-jam.git
cd navidrome-jam

# Install dependencies (TBD)
npm install

# Start the sync server
npm run dev

# Build the client extension
cd client && npm run build
```

## Roadmap

### Phase 1: Proof of Concept
- [x] Create repository
- [ ] Research Navidrome API/architecture
- [ ] Build minimal sync server
- [ ] Create basic test client

### Phase 2: Core Features
- [ ] Room creation/joining
- [ ] Playback synchronization
- [ ] Queue management
- [ ] User presence

### Phase 3: Polish
- [ ] UI integration with Navidrome
- [ ] Mobile support
- [ ] Voice chat integration?
- [ ] Discord bot for queue control

## Contributing

Contributions welcome! Open an issue or PR.

## License

MIT

## Acknowledgments

- [Navidrome](https://www.navidrome.org/) - The excellent music server this builds upon
- Inspired by Spotify Jam
