# Design: Room Settings — Kick User + Password Protection

## Context

Rooms currently have no moderation or access control. Anyone who knows the 8-char room code can join, and hosts can't remove disruptive users. Adding kick and password protection gives hosts basic room management.

## Files to Modify

| File | Changes |
|------|---------|
| `server/src/roomManager.js` | Add `kickUser()`, `password` field on room, `validatePassword()`, `setPassword()`, update `createRoom()` and `listRooms()` |
| `server/src/index.js` | Add `kick-user` and `set-password` socket handlers, password validation in `join-room`, update `serializeRoom()` to exclude password, update `POST /api/rooms` and `GET /api/rooms/:roomId`, add `MAX_ROOM_PASSWORD_LENGTH` constant |
| `client/src/services/jamClient.js` | Add `kickUser()`, `setPassword()` methods, update `createRoom()`/`joinRoom()` signatures, add `kicked`/`user-kicked`/`password-updated` event listeners |
| `client/src/App.jsx` | Kick button in user list (desktop + mobile), password field on room creation, password prompt dialog for joining, lock icon on room list, host password toggle |
| `client/src/App.css` | Kick button, password dialog overlay, lock icon, create room row styles |

## Implementation Steps

### 1. Kick User — Server

**roomManager.js**: Add `kickUser(roomId, userId)` — removes user from `users`, `coHosts`, `catSelections`, `pawHolders`. Returns kicked user info (needed for socket lookup). Separate from `removeUser` because kick doesn't trigger host succession or grace period (host is always still present).

**index.js**: Add `kick-user` socket event (host-only, `room.hostId !== socket.data.userId`). Finds kicked user's socket via `io.sockets.sockets.get(kickedUser.socketId)`, emits `kicked` to them directly, makes their socket leave the room and clears `socket.data`. Emits `user-kicked` to remaining users with updated room state.

### 2. Kick User — Client

**jamClient.js**: Add `kickUser(userId)` method and `kicked`/`user-kicked` event listeners.

**App.jsx**: On `kicked` event — reset all room state, return to room selection, show kick message. Kick button (X) next to each user in user list, visible only to host, not on self. `confirm()` dialog before kicking. Two locations: desktop sidebar + mobile users panel.

### 3. Password Protection — Server

**roomManager.js**:
- Add `password` param to `createRoom()` (default `null`)
- Add `hasPassword: !!room.password` to `listRooms()` output
- Add `validatePassword(roomId, password)` and `setPassword(roomId, password)` methods

**index.js**:
- Add `MAX_ROOM_PASSWORD_LENGTH = 64` constant
- Update `serializeRoom()`: destructure out `password`, add `hasPassword: !!password` — password never sent to clients
- Update `POST /api/rooms`: accept optional `password`, pass to `createRoom()`
- Update `GET /api/rooms/:roomId`: exclude password, include `hasPassword`
- Update `join-room` handler: if room has password and user is not reconnecting (`!room.users.some(u => u.id === userId)`), validate password. Emit error "Incorrect room password" on mismatch.
- Add `set-password` socket event (host-only): validates, calls `roomManager.setPassword()`, emits `password-updated` to host only

Password is automatically included in room state snapshots (it's a regular property on the room object, spread operator picks it up).

### 4. Password Protection — Client

**jamClient.js**: Update `createRoom(roomId, hostName, community, password)` and `joinRoom(roomId, username, password)` signatures. Add `setPassword(password)` method and `password-updated` listener.

**App.jsx**:
- Room creation: add optional password input inline next to Create button
- Joining from room list: if `room.hasPassword`, show password prompt dialog instead of joining directly
- Joining by code: `GET /api/rooms/:code` first to check `hasPassword`, show prompt if needed
- Lock icon next to room code in active rooms list for protected rooms
- Host password toggle button in room header: click to set (prompt) or remove password
- Password prompt: Win98-styled overlay dialog with password input, Join button, Cancel button

### 5. Verification

1. `cd server && node --check src/index.js && node --check src/roomManager.js` — syntax OK
2. `cd client && npx eslint src/` — 0 errors
3. `cd client && npm run build` — builds clean
4. Manual: Create room, join from second browser, kick user from first — verify kicked user returns to room select with message
5. Manual: Create room with password, try joining without password (should fail), join with correct password (should work)
6. Manual: Host sets/removes password mid-session, verify lock icon updates on room list
7. Manual: Disconnect and reconnect to password-protected room — should rejoin without re-entering password

## Key Design Decisions

- **Kick vs ban**: Kick only removes the user — they can rejoin. No persistent ban list (that's a separate task #18).
- **`kickUser` vs `removeUser`**: Separate method because kick doesn't trigger host succession or empty-room grace period (the host is always still present when kicking).
- **Password never sent to clients**: `serializeRoom()` strips `password` and adds `hasPassword` boolean. The actual password only lives server-side.
- **Reconnect bypass**: Users already in the room (by userId) skip password check on reconnect, so LTE drops don't require re-entering the password.
- **Co-hosts can't kick**: Only the host can kick — matches the promote/demote pattern where co-hosts have playback control but not user management.
