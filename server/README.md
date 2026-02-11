# Navidrome Jam Sync Server

WebSocket server for synchronizing music playback across multiple clients.

## Features

- **Room Management** - Create/join rooms with unique codes
- **Host Controls** - Room creator controls playback for all participants
- **Real-time Sync** - Play/pause/seek synchronized via WebSocket
- **Queue Management** - Shared playlist for the room
- **Presence Tracking** - See who's in the room and their playback position
- **Auto Host Transfer** - When host leaves, first user becomes new host

## Installation

```bash
cd server
npm install
```

## Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` to configure:
- `PORT` - Server port (default: 3001)
- `CLIENT_URL` - CORS origin for client app
- `NAVIDROME_URL` - Your Navidrome instance URL

## Running

### Development (with auto-reload)
```bash
npm run dev
```

### Production
```bash
npm start
```

## API Reference

### REST Endpoints

#### Health Check
```http
GET /health
```

Returns server status and connection count.

#### Create Room
```http
POST /api/rooms
Content-Type: application/json

{
  "roomId": "ABC123",  // Optional - auto-generated if not provided
  "hostName": "John"   // Optional - host display name
}
```

Returns room object with ID.

#### Get Room Info
```http
GET /api/rooms/:roomId
```

Returns room state, users, queue, and playback info.

---

### WebSocket Events

#### Client → Server

##### Join Room
```javascript
socket.emit('join-room', {
  roomId: 'ABC123',
  userId: 'user-uuid',
  username: 'John Doe'
});
```

##### Play (Host Only)
```javascript
socket.emit('play', {
  roomId: 'ABC123',
  trackId: 'song-id-from-navidrome',
  position: 0  // Start position in seconds
});
```

##### Pause (Host Only)
```javascript
socket.emit('pause', {
  roomId: 'ABC123',
  position: 45.5  // Current position when paused
});
```

##### Seek (Host Only)
```javascript
socket.emit('seek', {
  roomId: 'ABC123',
  position: 120  // New position in seconds
});
```

##### Update Queue (Host Only)
```javascript
socket.emit('update-queue', {
  roomId: 'ABC123',
  queue: [
    { id: 'track-1', title: 'Song 1', artist: 'Artist 1' },
    { id: 'track-2', title: 'Song 2', artist: 'Artist 2' }
  ]
});
```

##### Heartbeat (All Users)
```javascript
// Send every 1-2 seconds
socket.emit('heartbeat', {
  roomId: 'ABC123',
  position: 67.8  // Current playback position
});
```

#### Server → Client

##### Room State (on join)
```javascript
socket.on('room-state', ({ room }) => {
  // room contains: id, hostId, users, queue, playbackState
});
```

##### Sync Command
```javascript
socket.on('sync', (state) => {
  // state: { trackId, position, playing, timestamp }
  // Adjust playback to match this state
});
```

##### User Joined
```javascript
socket.on('user-joined', ({ user, room }) => {
  // Update UI to show new user
});
```

##### User Left
```javascript
socket.on('user-left', ({ userId, room, newHost }) => {
  // Update UI, check if you're new host
});
```

##### Queue Updated
```javascript
socket.on('queue-updated', ({ queue }) => {
  // Update queue UI
});
```

##### Error
```javascript
socket.on('error', ({ message }) => {
  // Handle error (unauthorized, room not found, etc.)
});
```

---

## Architecture

### Sync Protocol

1. **Host controls everything** - Only the room host can send play/pause/seek commands
2. **Server is authoritative** - Server broadcasts sync state to all clients
3. **Clients adjust locally** - Each client streams from Navidrome and adjusts position based on sync commands
4. **Heartbeat for presence** - Clients send position updates for the "now playing" view

### Drift Compensation

Clients should implement drift correction:

```javascript
// Pseudocode for client-side sync
socket.on('sync', (state) => {
  const expectedPosition = state.position + (Date.now() - state.timestamp) / 1000;
  const drift = Math.abs(audio.currentTime - expectedPosition);

  if (drift > 0.5) {
    // Drift > 500ms, seek to correct position
    audio.currentTime = expectedPosition;
  }
});
```

### Room Lifecycle

1. **Creation** - Room created via REST API or when first user joins
2. **Active** - Users connect, host controls playback
3. **Host transfer** - If host leaves, first user promoted to host
4. **Cleanup** - Room deleted when last user leaves or after 5min of inactivity

---

## Testing

You can test with multiple browser tabs or clients:

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Test with curl
curl http://localhost:3001/health

curl -X POST http://localhost:3001/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"hostName": "Test Host"}'
```

For WebSocket testing, use the web client or tools like [Socket.io Client Tool](https://amritb.github.io/socketio-client-tool/).

---

## TODO

- [ ] Add authentication integration with Navidrome
- [ ] Rate limiting for room creation
- [ ] Persistent rooms (Redis/database)
- [ ] Voice chat support
- [ ] Statistics/analytics
- [ ] Admin API for room management

---

## License

Apache-2.0
