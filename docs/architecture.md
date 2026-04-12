# Navidrome Jam Architecture Reference

Read this file when working on internals. Not loaded every session.

## Communication Flow

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

## Navidrome API Integration

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
- `star.view` / `unstar.view` - Add/remove from Navidrome favorites (persistent likes)
- `getStarred2.view` - Get all starred content (Favorites browse mode)
- `getPlaylists.view` / `getPlaylist.view` - Playlist browsing and queuing

**Server-side registration** (Native API): The server authenticates as admin via `POST /auth/login` (JWT), then creates users via `POST /api/user` with `x-nd-authorization: Bearer <token>` header. This enables invite-code-based self-service registration without exposing admin credentials to the client.

**Important**: Navidrome does NOT implement the Subsonic `createUser.view` endpoint. User creation must use the native REST API. The auth header is `x-nd-authorization` (not `Authorization`).

See also: `docs/navidrome-api-research.md` for full endpoint documentation.

## Synchronization Protocol

Server-authoritative model in `SyncedAudioPlayer.jsx`:

1. Host/co-host emits action → Server validates via `canControl()`, adds timestamp, broadcasts `sync` event
2. All clients compute expected position: `position + (Date.now() - timestamp) / 1000`
3. If drift > 0.5s (`DRIFT_THRESHOLD`), client seeks to expected position
4. Heartbeats sent every 2s for presence tracking

**Race condition**: Sync events can arrive before the audio element mounts. `pendingSyncRef` stores these and applies them on `loadedmetadata`. Track changes detected in `handleSyncInApp` which triggers `loadTrack` in App.jsx.

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

Add to `client/src/services/navidrome.js`:

```javascript
async getPlaylists() {
  return this.fetch('getPlaylists.view');
}
```

All Subsonic responses are wrapped in `{ "subsonic-response": { status, ...data } }`.

## User Uploads

Design doc: `docs/plans/2026-02-11-user-uploads-design.md`. Implementation in `server/src/sftpUploader.js`.

Registered users upload audio files through the web client. Files stream through the Jam server to PikaPods via SFTP (no temp files on Railway), where Navidrome auto-indexes them.
- **Multi-file**: Client supports selecting/dropping multiple files at once; uploads run sequentially via a queue with per-file progress tracking
- **Stream-through**: Upload pipes directly from HTTP to SFTP via `sftpUploader.js`
- **Rate limit**: 50 uploads per user per hour (server-side)
- **Cleanup**: Non-permanent files auto-deleted after 30 days; liked files are protected
- **Permanent flag**: Users can mark up to 50 uploads as permanent; admin can override
- **File limits**: 200MB max per file, allowed formats: mp3, flac, ogg, opus, m4a, wav, aac
- **Storage path**: `/music/jam-uploads/<username>/` on PikaPods
- **Metadata**: `.uploads-meta.json` on PikaPods tracks upload dates and permanent flags

## Persistence (Railway Volume)

Three JSON files on `DATA_DIR` (Railway volume at `/data`):
- `invite-codes.json` — valid codes, used codes (code→username), sent codes (code→{email,name}), deleted codes
- `waitlist.json` — name, email, message, joinedAt timestamp
- `rooms-snapshot.json` — periodic room state snapshot (every 30s + SIGTERM), auto-deleted after restore
