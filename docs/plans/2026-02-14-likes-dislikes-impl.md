# Likes & Dislikes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add like/dislike buttons to the now-playing bar that sync reactions across room members and star liked tracks in the user's Navidrome Favourites.

**Architecture:** Server tracks reactions in room state (ephemeral Map). Clients emit like/dislike/remove events via WebSocket. Server broadcasts aggregated counts back. Client also calls Navidrome star.view/unstar.view independently for Favourites persistence. Steps 7-8 from the design (upload metadata + cleanup) are deferred until the uploads feature exists.

**Tech Stack:** Node.js/Express/Socket.io (server), React 19/Vite (client), Subsonic API star.view/unstar.view

---

### Task 1: Add reaction methods to RoomManager

**Files:**
- Modify: `server/src/roomManager.js`

**Step 1: Add `reactions` to room creation**

In `createRoom()`, add `reactions: {}` to the room object (after the `playbackState` property):

```javascript
      playbackState: {
        trackId: null,
        position: 0,
        playing: false,
        timestamp: Date.now()
      },
      reactions: {},  // trackId -> { userId -> 'like' | 'dislike' }
      createdAt: Date.now()
```

**Step 2: Add `setReaction` method**

After `removeCoHost()` method, add:

```javascript
  /**
   * Set a reaction (like or dislike) for a user on a track
   */
  setReaction(roomId, trackId, userId, type) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (type !== 'like' && type !== 'dislike') throw new Error('Invalid reaction type');

    if (!room.reactions[trackId]) {
      room.reactions[trackId] = {};
    }

    const previous = room.reactions[trackId][userId] || null;
    room.reactions[trackId][userId] = type;

    return { previous, current: type };
  }
```

**Step 3: Add `removeReaction` method**

```javascript
  /**
   * Remove a user's reaction from a track
   */
  removeReaction(roomId, trackId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    if (room.reactions[trackId]) {
      const previous = room.reactions[trackId][userId] || null;
      delete room.reactions[trackId][userId];

      // Clean up empty track entries
      if (Object.keys(room.reactions[trackId]).length === 0) {
        delete room.reactions[trackId];
      }

      return { previous, current: null };
    }
    return { previous: null, current: null };
  }
```

**Step 4: Add `getReactionCounts` method**

```javascript
  /**
   * Get aggregated reaction counts for a track
   */
  getReactionCounts(roomId, trackId) {
    const room = this.rooms.get(roomId);
    if (!room) return { likes: 0, dislikes: 0, reactions: {} };

    const trackReactions = room.reactions[trackId] || {};
    let likes = 0;
    let dislikes = 0;

    for (const type of Object.values(trackReactions)) {
      if (type === 'like') likes++;
      else if (type === 'dislike') dislikes++;
    }

    return { likes, dislikes, reactions: trackReactions };
  }
```

**Step 5: Commit**

```bash
git add server/src/roomManager.js
git commit -m "feat: add reaction tracking to roomManager"
```

---

### Task 2: Add WebSocket event handlers for reactions

**Files:**
- Modify: `server/src/index.js`

**Step 1: Add `like-track` handler**

After the `demote-cohost` handler (around line 1031) and before the `leave-room` handler, add:

```javascript
  // Like a track (any room member)
  socket.on('like-track', ({ roomId, trackId }) => {
    try {
      if (!socket.data.roomId || socket.data.roomId !== roomId) {
        socket.emit('error', { message: 'Not in this room' });
        return;
      }
      if (!trackId || typeof trackId !== 'string' || trackId.length > 100) {
        socket.emit('error', { message: 'Invalid track ID' });
        return;
      }

      roomManager.setReaction(roomId, trackId, socket.data.userId, 'like');
      const counts = roomManager.getReactionCounts(roomId, trackId);
      io.to(roomId).emit('track-reactions', { trackId, ...counts });
    } catch (error) {
      console.error('Error liking track:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Dislike a track (any room member)
  socket.on('dislike-track', ({ roomId, trackId }) => {
    try {
      if (!socket.data.roomId || socket.data.roomId !== roomId) {
        socket.emit('error', { message: 'Not in this room' });
        return;
      }
      if (!trackId || typeof trackId !== 'string' || trackId.length > 100) {
        socket.emit('error', { message: 'Invalid track ID' });
        return;
      }

      roomManager.setReaction(roomId, trackId, socket.data.userId, 'dislike');
      const counts = roomManager.getReactionCounts(roomId, trackId);
      io.to(roomId).emit('track-reactions', { trackId, ...counts });
    } catch (error) {
      console.error('Error disliking track:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Remove reaction (any room member)
  socket.on('remove-reaction', ({ roomId, trackId }) => {
    try {
      if (!socket.data.roomId || socket.data.roomId !== roomId) {
        socket.emit('error', { message: 'Not in this room' });
        return;
      }
      if (!trackId || typeof trackId !== 'string' || trackId.length > 100) {
        socket.emit('error', { message: 'Invalid track ID' });
        return;
      }

      roomManager.removeReaction(roomId, trackId, socket.data.userId);
      const counts = roomManager.getReactionCounts(roomId, trackId);
      io.to(roomId).emit('track-reactions', { trackId, ...counts });
    } catch (error) {
      console.error('Error removing reaction:', error);
      socket.emit('error', { message: error.message });
    }
  });
```

**Step 2: Send existing reactions on room join**

In the `join-room` handler, after the sync emit block (`if (currentRoom.playbackState.trackId) { ... }`), add:

```javascript
      // If there's an active track with reactions, send them
      if (currentRoom.playbackState.trackId) {
        const counts = roomManager.getReactionCounts(roomId, currentRoom.playbackState.trackId);
        if (counts.likes > 0 || counts.dislikes > 0) {
          socket.emit('track-reactions', {
            trackId: currentRoom.playbackState.trackId,
            ...counts
          });
        }
      }
```

**Step 3: Commit**

```bash
git add server/src/index.js
git commit -m "feat: add WebSocket handlers for track reactions"
```

---

### Task 3: Add star/unstar to NavidromeClient

**Files:**
- Modify: `client/src/services/navidrome.js`

**Step 1: Add starTrack and unstarTrack methods**

After the `scrobble()` method (around line 266) and before `getPlaylists()`, add:

```javascript
  /**
   * Star a track (add to Favourites)
   */
  async starTrack(id) {
    return this.fetch('star.view', { id });
  }

  /**
   * Unstar a track (remove from Favourites)
   */
  async unstarTrack(id) {
    return this.fetch('unstar.view', { id });
  }
```

**Step 2: Commit**

```bash
git add client/src/services/navidrome.js
git commit -m "feat: add star/unstar methods to NavidromeClient"
```

---

### Task 4: Add reaction methods to JamClient

**Files:**
- Modify: `client/src/services/jamClient.js`

**Step 1: Add event listener in `setupEventListeners()`**

In the `setupEventListeners()` method, after the `cohost-updated` listener and before the `error` listener (around line 93), add:

```javascript
    this.socket.on('track-reactions', (data) => {
      console.log('Track reactions:', data);
      this.emit('track-reactions', data);
    });
```

**Step 2: Add likeTrack, dislikeTrack, removeReaction methods**

After the `sendHeartbeat()` method and before the `on()` method, add:

```javascript
  /**
   * Like the currently playing track
   */
  likeTrack(trackId) {
    if (!this.currentRoomId) {
      throw new Error('Not in a room');
    }
    this.socket.emit('like-track', {
      roomId: this.currentRoomId,
      trackId
    });
  }

  /**
   * Dislike the currently playing track
   */
  dislikeTrack(trackId) {
    if (!this.currentRoomId) {
      throw new Error('Not in a room');
    }
    this.socket.emit('dislike-track', {
      roomId: this.currentRoomId,
      trackId
    });
  }

  /**
   * Remove reaction from the currently playing track
   */
  removeReaction(trackId) {
    if (!this.currentRoomId) {
      throw new Error('Not in a room');
    }
    this.socket.emit('remove-reaction', {
      roomId: this.currentRoomId,
      trackId
    });
  }
```

**Step 3: Commit**

```bash
git add client/src/services/jamClient.js
git commit -m "feat: add reaction methods to JamClient"
```

---

### Task 5: Add reaction state and handlers to App.jsx

**Files:**
- Modify: `client/src/App.jsx`

**Step 1: Add state variables**

After the `playHistory` state declaration (around line 46), add:

```javascript
  // Reaction state
  const [trackReactions, setTrackReactions] = useState({ likes: 0, dislikes: 0 });
  const [userReaction, setUserReaction] = useState(null); // 'like' | 'dislike' | null
```

**Step 2: Add track-reactions event listener**

In the `useEffect` that sets up jamClient listeners (the one containing `handleRoomState`, starting around line 80), add a handler and register it:

```javascript
    const handleTrackReactions = ({ trackId, likes, dislikes, reactions }) => {
      // Only update if it's for the currently playing track
      setTrackReactions({ likes, dislikes });
      // Determine current user's reaction from the reactions map
      const myReaction = reactions[jamClient.userId] || null;
      setUserReaction(myReaction);
    };
```

Register it (after the `jamClient.on('disconnected', handleDisconnected)` line):

```javascript
    jamClient.on('track-reactions', handleTrackReactions);
```

And unregister in the cleanup return:

```javascript
      jamClient.off('track-reactions', handleTrackReactions);
```

**Step 3: Reset reactions on track change**

In the `handleSyncInApp` function, when a track change is detected (inside the `if (state.trackId && state.trackId !== syncedTrackId)` block), add a reset:

```javascript
        setTrackReactions({ likes: 0, dislikes: 0 });
        setUserReaction(null);
```

Also reset in `handleLeaveRoom`:

```javascript
    setTrackReactions({ likes: 0, dislikes: 0 });
    setUserReaction(null);
```

**Step 4: Add like/dislike handler functions**

After the `handlePlaybackUpdate` callback (around line 639), add:

```javascript
  const handleLike = useCallback(() => {
    if (!currentTrack) return;

    if (userReaction === 'like') {
      // Toggle off — remove reaction and unstar
      jamClient.removeReaction(currentTrack.id);
      navidrome.unstarTrack(currentTrack.id).catch(err => console.error('Unstar failed:', err));
      setUserReaction(null);
    } else {
      // Like (new or switching from dislike)
      jamClient.likeTrack(currentTrack.id);
      navidrome.starTrack(currentTrack.id).catch(err => console.error('Star failed:', err));
      setUserReaction('like');
    }
  }, [currentTrack, userReaction, jamClient, navidrome]);

  const handleDislike = useCallback(() => {
    if (!currentTrack) return;

    if (userReaction === 'dislike') {
      // Toggle off — remove reaction
      jamClient.removeReaction(currentTrack.id);
      setUserReaction(null);
    } else {
      // Dislike (new or switching from like)
      if (userReaction === 'like') {
        // Was liked — unstar from Navidrome
        navidrome.unstarTrack(currentTrack.id).catch(err => console.error('Unstar failed:', err));
      }
      jamClient.dislikeTrack(currentTrack.id);
      setUserReaction('dislike');
    }
  }, [currentTrack, userReaction, jamClient, navidrome]);
```

**Step 5: Add reaction buttons to the now-playing section**

In the JSX, inside the `{currentTrack && ( ... )}` block that shows the now-playing info (around line 987-997), add reaction buttons after the track-info div:

```jsx
                <div className="reaction-buttons">
                  <button
                    className={`reaction-btn like-btn${userReaction === 'like' ? ' active' : ''}`}
                    onClick={handleLike}
                    title={userReaction === 'like' ? 'Remove like' : 'Like this track'}
                  >
                    <span className="reaction-icon like-icon"></span>
                    <span className="reaction-count">{trackReactions.likes}</span>
                  </button>
                  <button
                    className={`reaction-btn dislike-btn${userReaction === 'dislike' ? ' active' : ''}`}
                    onClick={handleDislike}
                    title={userReaction === 'dislike' ? 'Remove dislike' : 'Dislike this track'}
                  >
                    <span className="reaction-icon dislike-icon"></span>
                    <span className="reaction-count">{trackReactions.dislikes}</span>
                  </button>
                </div>
```

The reaction buttons should appear between the track info and the SyncedAudioPlayer, so place them right after the closing `</div>` of the `now-playing` div and before `{currentTrack && ( <SyncedAudioPlayer ...`.

**Step 6: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: add reaction state and handlers to App"
```

---

### Task 6: Style the reaction buttons (invoke frontend-design)

**Files:**
- Modify: `client/src/App.css`

> **IMPORTANT:** Invoke the `frontend-design` skill before implementing this task. The reaction buttons need Win98-style pixel art CSS icons matching the existing transport controls (prev, play, pause, next, repeat buttons in `.transport-controls`). The like icon should be a simple thumbs-up shape and the dislike icon a thumbs-down, both drawn with `box-shadow` pixel art like the existing `repeat-icon`. Active state should use the same recessed/pressed style as `.repeat-active`.

**Step 1: Add CSS for reaction buttons**

Add these styles after the `.repeat-icon::after` rule block (around line 1192):

```css
/* Reaction buttons (like/dislike) */
.reaction-buttons {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin: 6px 0;
}

.reaction-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--win-bg);
  border: 2px solid;
  border-color: var(--win-light) var(--win-darkest) var(--win-darkest) var(--win-light);
  cursor: pointer;
  font-family: 'VT323', 'Tahoma', monospace;
  font-size: 14px;
}

.reaction-btn:active {
  border-color: var(--win-darkest) var(--win-light) var(--win-light) var(--win-darkest);
}

.reaction-btn.active {
  border-color: var(--win-darkest) var(--win-light) var(--win-light) var(--win-darkest);
  background: #a0a0a0;
}

.like-btn.active {
  color: #008000;
}

.dislike-btn.active {
  color: #cc0000;
}

.reaction-count {
  min-width: 12px;
  text-align: center;
}

/* Reaction icons — CSS pixel art */
.reaction-icon {
  display: inline-block;
  position: relative;
  width: 12px;
  height: 12px;
}
```

The exact pixel art for `.like-icon` and `.dislike-icon` (using `::before`/`::after` with `box-shadow`) should be designed by the `frontend-design` skill to match the aesthetic. A simple approach for now:

```css
/* Like icon: simple thumbs-up using box-shadow pixels */
.like-icon::before {
  content: '';
  position: absolute;
  width: 2px;
  height: 2px;
  background: currentColor;
  /* Thumb shape pointing up */
  box-shadow:
    0 0 0 currentColor,
    2px 0 0 currentColor,
    4px 0 0 currentColor,
    6px 0 0 currentColor,
    0 2px 0 currentColor,
    2px 2px 0 currentColor,
    4px 2px 0 currentColor,
    6px 2px 0 currentColor,
    8px 2px 0 currentColor,
    0 4px 0 currentColor,
    2px 4px 0 currentColor,
    4px 4px 0 currentColor,
    6px 4px 0 currentColor,
    8px 4px 0 currentColor,
    2px -2px 0 currentColor,
    2px -4px 0 currentColor,
    2px -6px 0 currentColor;
}

/* Dislike icon: mirror of like (thumb pointing down) */
.dislike-icon::before {
  content: '';
  position: absolute;
  width: 2px;
  height: 2px;
  background: currentColor;
  box-shadow:
    0 0 0 currentColor,
    2px 0 0 currentColor,
    4px 0 0 currentColor,
    6px 0 0 currentColor,
    0 -2px 0 currentColor,
    2px -2px 0 currentColor,
    4px -2px 0 currentColor,
    6px -2px 0 currentColor,
    8px -2px 0 currentColor,
    0 -4px 0 currentColor,
    2px -4px 0 currentColor,
    4px -4px 0 currentColor,
    6px -4px 0 currentColor,
    8px -4px 0 currentColor,
    2px 2px 0 currentColor,
    2px 4px 0 currentColor,
    2px 6px 0 currentColor;
}
```

**Step 2: Commit**

```bash
git add client/src/App.css
git commit -m "feat: add Win98-style reaction button CSS"
```

---

### Task 7: Update CLAUDE.md WebSocket events table

**Files:**
- Modify: `navidrome-jam/CLAUDE.md`

**Step 1: Add new events to the WebSocket Events Reference table**

Add these rows to the table after the `heartbeat` row:

```
| `like-track` | Client → Server | `{ roomId, trackId }` | Any room member |
| `dislike-track` | Client → Server | `{ roomId, trackId }` | Any room member |
| `remove-reaction` | Client → Server | `{ roomId, trackId }` | Any room member |
| `track-reactions` | Server → Client | `{ trackId, likes, dislikes, reactions }` | — |
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add reaction events to WebSocket reference"
```

---

### Task 8: Manual testing

**No code changes.** Verify the feature works end-to-end.

**Step 1: Start the server**

```bash
cd server && npm run dev
```

**Step 2: Start the client**

```bash
cd client && npm run dev
```

**Step 3: Test in two browser windows**

1. Open `http://localhost:5173` in two windows
2. Log in with Navidrome credentials in both
3. Create a room in window 1, join from window 2
4. Play a track from the browse/search panel
5. Verify: Both windows show like/dislike buttons with `0 0` counts
6. Click Like in window 1 → verify count updates to `1 0` in both windows
7. Click Dislike in window 2 → verify count updates to `1 1` in both windows
8. Click Like again in window 1 (toggle off) → verify `0 1` in both windows
9. Switch from Dislike to Like in window 2 → verify `1 0` in both windows
10. Verify the liked track appears in the user's Navidrome Favourites (check via Navidrome web UI)
11. Leave room and rejoin → reactions should be preserved until room is destroyed

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A && git commit -m "fix: reaction feature polish"
```

**Step 5: Push**

```bash
git push
```
