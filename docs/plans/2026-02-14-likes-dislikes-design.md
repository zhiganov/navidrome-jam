# Likes & Dislikes for Navidrome Jam

**Date:** 2026-02-14
**Status:** Design complete, ready for implementation

## Problem

Navidrome Jam has no way for listeners to express opinions about tracks playing in a room. The upcoming user uploads feature includes a 30-day auto-cleanup, but there's no signal for which uploaded tracks the community actually wants to keep.

## Design Decisions

- **Scope:** Currently playing track only (not queue or browse views)
- **UX:** Show like/dislike counts next to the track title in the now-playing bar
- **Navidrome integration:** Like calls `star.view` to add the track to the user's Navidrome Favourites
- **Storage:** Per-room reactions (ephemeral) + aggregate counts in upload metadata (persistent)
- **No global persistence:** Per-room reactions and upload metadata counts cover all use cases at this scale
- **Cleanup integration:** Uploaded files where `likeCount > dislikeCount` are exempt from 30-day auto-cleanup

## Reaction Flow

```
User clicks Like on currently playing track
  -> Client emits 'like-track' via WebSocket
  -> Client calls star.view on Navidrome (adds to Favourites)
  -> Server validates, records reaction in room state
  -> Server broadcasts 'track-reactions' to all room members
  -> If track is an upload: server increments likeCount in .uploads-meta.json

User clicks Dislike
  -> Client emits 'dislike-track' via WebSocket
  -> Server validates, records reaction in room state
  -> Server broadcasts 'track-reactions' to all room members
  -> If track is an upload: server increments dislikeCount in .uploads-meta.json
```

## Reaction Rules

- One reaction per user per track per room session
- Clicking the same button again removes the reaction (toggle)
- Switching from like to dislike (or vice versa) replaces the previous reaction
- Reactions are per-room and ephemeral — cleared when the room is destroyed
- Navidrome star/unstar is independent: starring persists in the user's Favourites even after the room ends

## Server-Side Changes

### Room state addition

New `reactions` map in room state (managed by `roomManager.js`):

```javascript
room.reactions = {
  // trackId -> { userId -> 'like' | 'dislike' }
  "track-abc-123": {
    "user-1": "like",
    "user-2": "dislike"
  }
}
```

### New roomManager methods

- `setReaction(roomId, trackId, userId, type)` — set 'like' or 'dislike'
- `removeReaction(roomId, trackId, userId)` — remove reaction (toggle off)
- `getReactions(roomId, trackId)` — returns `{ likes: number, dislikes: number, userReaction: string | null }`

### New WebSocket events

| Event | Direction | Payload | Auth |
|-------|-----------|---------|------|
| `like-track` | Client → Server | `{ roomId, trackId }` | Any room member |
| `dislike-track` | Client → Server | `{ roomId, trackId }` | Any room member |
| `remove-reaction` | Client → Server | `{ roomId, trackId }` | Any room member |
| `track-reactions` | Server → Client | `{ trackId, likes, dislikes, reactions }` | — |

The `track-reactions` broadcast includes the full reactions map for the track so each client can determine their own reaction state.

### Upload metadata updates

When a reaction is set on a track that lives under `/music/jam-uploads/`, the server updates `.uploads-meta.json` via SFTP:

```json
{
  "alex/song.flac": {
    "uploadedAt": "2026-02-11T...",
    "permanent": false,
    "likeCount": 5,
    "dislikeCount": 1
  }
}
```

Metadata updates are **debounced** (5-second window) to avoid excessive SFTP writes during rapid voting.

### Cleanup job change

In the existing cleanup job (from the uploads feature), add a check: skip files where `likeCount > dislikeCount`, treating them as community-endorsed. These files are still deletable by admin.

### Identifying uploaded tracks

The server needs to determine if a track is a user upload to update metadata. Approach: check if the track's path (from Subsonic `getSong.view` metadata, if available in the sync payload) starts with `jam-uploads/`. Alternatively, the client can include an `isUpload` flag when emitting reactions — simpler but less trustworthy. We'll use a server-side path check when metadata is available, falling back to always attempting the metadata update (which is a no-op if the track key doesn't exist in `.uploads-meta.json`).

## Client-Side Changes

### navidrome.js additions

```javascript
async starTrack(id) {
  return this.fetch('star.view', { id });
}

async unstarTrack(id) {
  return this.fetch('unstar.view', { id });
}
```

### jamClient.js additions

```javascript
likeTrack(trackId) {
  this.socket.emit('like-track', { roomId: this.currentRoomId, trackId });
}

dislikeTrack(trackId) {
  this.socket.emit('dislike-track', { roomId: this.currentRoomId, trackId });
}

removeReaction(trackId) {
  this.socket.emit('remove-reaction', { roomId: this.currentRoomId, trackId });
}
```

New event listener in `setupEventListeners()`:
```javascript
this.socket.on('track-reactions', (data) => {
  this.emit('track-reactions', data);
});
```

### UI: Now-playing bar

Add like/dislike buttons to the now-playing bar, next to the track title:

```
[ ▶ ⏸ ⏮ ⏭ ] | 🎵 Song Title - Artist  👍 3  👎 1 | [ volume ]
```

Win98-style buttons using CSS pixel art (matching existing transport controls). Active state highlighted when the current user has reacted.

Counts displayed as simple numbers next to each button. If both are 0, still show `0 0` for discoverability.

### React state

In `App.jsx`, track reactions state:

```javascript
const [trackReactions, setTrackReactions] = useState({ likes: 0, dislikes: 0 });
const [userReaction, setUserReaction] = useState(null); // 'like' | 'dislike' | null
```

Listen for `track-reactions` events and update. On track change, reset to 0/0/null until server sends fresh data.

### Like button behavior

1. Click Like (no current reaction): emit `like-track`, call `star.view`
2. Click Like (already liked): emit `remove-reaction`, call `unstar.view`
3. Click Like (currently disliked): emit `like-track`, call `star.view`
4. Click Dislike (no current reaction): emit `dislike-track`
5. Click Dislike (already disliked): emit `remove-reaction`
6. Click Dislike (currently liked): emit `dislike-track`, call `unstar.view`

Note: Only the Like button triggers Navidrome star/unstar. Dislike has no Navidrome equivalent.

## Implementation Order

1. Server: roomManager reaction methods
2. Server: WebSocket event handlers for like/dislike/remove
3. Server: broadcast track-reactions on join (existing tracks) and on reaction change
4. Client: navidrome.js star/unstar methods
5. Client: jamClient.js reaction methods and event listener
6. Client: UI buttons in now-playing bar (invoke `frontend-design` skill)
7. Server: upload metadata integration (after uploads feature is built)
8. Server: cleanup job exemption logic (after uploads feature is built)

Steps 7-8 depend on the uploads feature being implemented first. Steps 1-6 can be built independently.

## Out of Scope (Future)

- Reaction history / analytics
- Reactions on queued (not currently playing) tracks
- Dislike-to-skip voting (auto-skip if majority dislikes)
- Global reaction persistence beyond Navidrome stars
