# Navidrome Jam Client

React web client for synchronized music listening with friends.

## Features

- **Navidrome Authentication** - Login with your Navidrome credentials
- **Room Management** - Create or join jam rooms with unique codes
- **Synchronized Playback** - Real-time sync across all participants
- **Host Controls** - Room host controls playback for everyone
- **Music Search** - Search your Navidrome library
- **Queue Management** - Build a shared playlist
- **User Presence** - See who's in the room

## Prerequisites

- Node.js 18+
- Running Navidrome instance
- Running Jam sync server (`../server`)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
```

Edit `.env` to point to your servers:
```env
VITE_NAVIDROME_URL=http://localhost:4533
VITE_JAM_SERVER_URL=http://localhost:3001
```

## Development

Start the development server:
```bash
npm run dev
```

Open http://localhost:5173 in your browser.

## Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

Preview the production build:
```bash
npm run preview
```

## Usage

### 1. Login
- Enter your Navidrome username and password
- Credentials are cached in localStorage for convenience

### 2. Create or Join a Room
- **Create New Room** - Generates a random 6-character code
- **Join Room** - Enter a friend's room code

### 3. Listen Together
- **Host**: Search for songs and click "Play" to start playback
- **Guests**: Playback syncs automatically
- All users can see the queue and who's in the room

### 4. Controls (Host Only)
- Play/Pause button
- Seek bar
- Queue management
- Add songs to queue

## Architecture

### Components

- `App.jsx` - Main app with routing and state management
- `SyncedAudioPlayer.jsx` - Audio player with drift correction

### Services

- `navidrome.js` - Navidrome Subsonic API client
  - Authentication with token-based auth
  - Song search, metadata, streaming URLs
  - Session persistence
- `jamClient.js` - WebSocket client for sync server
  - Room management
  - Playback commands (play/pause/seek)
  - Real-time event handling

### Sync Protocol

1. Client streams audio directly from Navidrome
2. WebSocket connection to Jam server for commands
3. Drift correction adjusts playback if >500ms off
4. Heartbeat every 2s for presence tracking

## Troubleshooting

### "Cannot connect to Navidrome"
- Check `VITE_NAVIDROME_URL` in `.env`
- Ensure Navidrome is running
- Check for CORS issues (Navidrome allows all origins by default)

### "Cannot connect to Jam server"
- Check `VITE_JAM_SERVER_URL` in `.env`
- Ensure the sync server is running (`cd ../server && npm run dev`)
- Check console for WebSocket errors

### Audio not syncing
- Check browser console for sync messages
- Verify both users are in the same room
- Refresh the page to reset state

### Playback drift
- Normal for high-latency networks
- Drift >500ms triggers automatic correction
- Check network quality

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Requires:
- Web Audio API
- WebSocket support
- LocalStorage

## License

Apache-2.0
