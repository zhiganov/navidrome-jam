# Navidrome API Research

## Overview

Navidrome provides two main APIs:
1. **Subsonic API** (`/rest/*`) - Stable, well-documented, XML/JSON responses
2. **Native API** (`/api/*`) - Modern REST API with JWT auth, but **intentionally unstable and undocumented**

## Recommendation for Jam Implementation

**Use the Subsonic API** for the following reasons:
- Officially documented and stable
- Wide compatibility with existing music clients
- Proven in production by many applications
- Less likely to break with Navidrome updates

The Native API is used by Feishin but the maintainers explicitly warn it's subject to breaking changes.

---

## Subsonic API

### Base Information
- **Base URL**: `http://your-server:4533/rest/`
- **API Version**: v1.16.1 (with OpenSubsonic extensions)
- **Documentation**: https://www.navidrome.org/docs/developers/subsonic-api/

### Authentication

Two methods supported:

#### Method 1: Token Authentication (Recommended)
```
?u=username&t=token&s=salt&v=1.16.1&c=navidrome-jam&f=json
```
- `t` = MD5(password + salt)
- `s` = random salt string
- More secure than plaintext password

#### Method 2: Password Authentication
```
?u=username&p=password&v=1.16.1&c=navidrome-jam&f=json
```
- Simple but less secure
- Use for development/testing only

### Key Endpoints for Jam Feature

#### System & Auth
- `ping.view` - Check server availability
- `getLicense.view` - Get server license info

#### Browsing
- `getArtists.view` - Get all artists
- `getArtist.view?id={id}` - Get artist details + albums
- `getAlbum.view?id={id}` - Get album details + tracks
- `getSong.view?id={id}` - Get single song metadata

#### Streaming (Critical for Jam)
- `stream.view?id={songId}` - Stream/download a song
  - Supports transcoding via `format`, `maxBitRate` parameters
  - Returns raw audio data
  - Does NOT mark song as "played" automatically

#### Playback State
- `scrobble.view?id={id}&submission=true` - Mark song as played
- `getNowPlaying.view` - Get what all users are currently playing
- `getPlayQueue.view` - Get user's current queue
- `savePlayQueue.view` - Save queue state

#### Search
- `search3.view?query={text}` - Search songs, albums, artists
  - Returns max 20 songs, 20 albums, 20 artists by default
  - Use `songCount`, `albumCount`, `artistCount` to override

#### Playlists
- `getPlaylists.view` - List all playlists
- `getPlaylist.view?id={id}` - Get playlist details
- `createPlaylist.view` - Create new playlist
- `updatePlaylist.view` - Modify playlist
- `deletePlaylist.view?id={id}` - Delete playlist

### Response Format

All responses are wrapped in a standard envelope:

```json
{
  "subsonic-response": {
    "status": "ok",
    "version": "1.16.1",
    "type": "navidrome",
    "serverVersion": "0.xx.x",
    ...actual data here...
  }
}
```

Error response:
```json
{
  "subsonic-response": {
    "status": "failed",
    "version": "1.16.1",
    "error": {
      "code": 40,
      "message": "Wrong username or password"
    }
  }
}
```

### Important Notes

1. **IDs are strings** - Always MD5 hashes or UUIDs, never integers
2. **Folder browsing is simulated** - Format: `/Artist/Album/01 - Song.mp3`
3. **No video support** - Music only
4. **Scrobbling required for "played" tracking** - `stream` doesn't update play count
5. **No Lucene queries** - Simple substring search only

---

## Native API (For Reference Only)

### Authentication
```http
POST /api/authenticate
Content-Type: application/json

{
  "username": "user",
  "password": "pass"
}
```

Response:
```json
{
  "token": "eyJhbGc...",
  "subsonicSalt": "...",
  "subsonicToken": "..."
}
```

Use token in subsequent requests:
```http
X-ND-Authorization: Bearer eyJhbGc...
```

**Each API response includes a refreshed token in the `x-nd-authorization` response header.**

### JWT Token Structure
Contains:
- `sub` - username
- `uid` - user ID
- `adm` - admin status (boolean)
- `iat` - issued at
- `exp` - expiration

### Endpoints
- `GET /api/song` - List songs
- `GET /api/song/{id}` - Get song details
- `GET /api/album` - List albums
- `GET /api/artist` - List artists
- `GET /api/queue` - Get play queue
- `POST /api/queue` - Save play queue

**Warning**: These endpoints may change without notice. Refer to Feishin source code for working examples:
https://github.com/jeffvli/feishin/tree/development/src/renderer/api/navidrome

---

## Streaming Architecture for Jam

### Challenges
1. **No native sync endpoint** - Navidrome doesn't know about "jam sessions"
2. **Client-side sync required** - Must build sync layer on top
3. **Latency compensation** - Network delays will cause drift

### Proposed Architecture

```
┌─────────────────┐
│   Navidrome     │ (Existing - no modifications)
│  /rest/stream   │
└────────┬────────┘
         │
         │ HTTP streaming
         │
┌────────▼────────┐
│   Jam Server    │ (New - WebSocket sync)
│  - Room mgmt    │
│  - Sync engine  │
│  - State mgmt   │
└────────┬────────┘
         │
         │ WebSocket
         │
    ┌────┴────┐
    │         │
┌───▼──┐  ┌──▼───┐
│Client│  │Client│
│  A   │  │  B   │
└──────┘  └──────┘
```

### Sync Protocol

Each client:
1. Streams audio from Navidrome directly via `/rest/stream.view?id={songId}`
2. Maintains WebSocket connection to Jam Server
3. Reports playback position every 500ms
4. Receives sync commands from server

Server:
1. Tracks "authoritative" playback state (host controls)
2. Broadcasts sync commands to all room participants
3. Handles play/pause/seek/next/queue changes

Example WebSocket messages:
```json
// Client → Server: Position update
{
  "type": "position",
  "roomId": "abc123",
  "position": 45.23,
  "timestamp": 1706234567890
}

// Server → Clients: Sync command
{
  "type": "sync",
  "trackId": "def456",
  "position": 45.30,
  "playing": true,
  "timestamp": 1706234567900
}
```

---

## Next Steps

1. ✅ Research Navidrome API (Done)
2. Build minimal sync server (Node.js + Socket.io)
3. Create proof-of-concept web client
4. Test synchronization with 2+ clients
5. Integrate with Navidrome authentication

---

## References

- [Navidrome Subsonic API Docs](https://www.navidrome.org/docs/developers/subsonic-api/)
- [Native API Discussion (GitHub)](https://github.com/navidrome/navidrome/discussions/3765)
- [Feishin Client Implementation](https://github.com/jeffvli/feishin)
- [OpenSubsonic Spec](https://opensubsonic.netlify.app/)
