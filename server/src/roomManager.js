import { randomBytes } from 'crypto';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  /**
   * Generate a random room code (8 hex characters = 4.3 billion combinations)
   */
  generateRoomCode() {
    return randomBytes(4).toString('hex').toUpperCase();
  }

  /**
   * Create a new room
   */
  createRoom(roomId = null, hostName = 'Host', community = null) {
    let id = roomId;

    if (!id) {
      // Retry up to 5 times if generated code collides
      for (let i = 0; i < 5; i++) {
        const candidate = this.generateRoomCode();
        if (!this.rooms.has(candidate)) {
          id = candidate;
          break;
        }
      }
      if (!id) {
        throw new Error('Failed to generate unique room code');
      }
    } else if (this.rooms.has(id)) {
      throw new Error('Room already exists');
    }

    const room = {
      id,
      hostId: null, // Set when first user joins
      hostName,
      community: community || null,
      coHosts: [], // User IDs with co-host privileges
      users: [],
      queue: [],
      playbackState: {
        trackId: null,
        position: 0,
        playing: false,
        timestamp: Date.now()
      },
      reactions: {},
      createdAt: Date.now()
    };

    this.rooms.set(id, room);
    console.log(`Room created: ${id}`);
    return room;
  }

  /**
   * Get room by ID
   */
  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  /**
   * Get total room count
   */
  getRoomCount() {
    return this.rooms.size;
  }

  /**
   * List all active rooms (public summary, no sensitive data)
   */
  listRooms() {
    return Array.from(this.rooms.values()).map(room => ({
      id: room.id,
      hostName: room.hostName,
      community: room.community,
      userCount: room.users.length,
      currentTrack: room.playbackState.trackId ? {
        title: room.queue.find(t => t.id === room.playbackState.trackId)?.title || null,
        artist: room.queue.find(t => t.id === room.playbackState.trackId)?.artist || null,
        playing: room.playbackState.playing
      } : null,
      createdAt: room.createdAt
    }));
  }

  /**
   * Add user to room (or update if already exists)
   */
  addUser(roomId, user) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    // Check if user already exists in the room
    const existingUserIndex = room.users.findIndex(u => u.id === user.id);

    if (existingUserIndex !== -1) {
      // User already exists - update their entry (e.g., new socketId from reconnect/refresh)
      room.users[existingUserIndex] = {
        ...room.users[existingUserIndex],
        ...user,
        position: room.users[existingUserIndex].position, // Keep their position
        lastHeartbeat: Date.now()
      };
      console.log(`Updated existing user in room ${roomId}: ${user.username}`);
      return user;
    }

    // First user becomes host
    if (room.users.length === 0) {
      room.hostId = user.id;
    }

    // New user - add to room
    room.users.push({
      ...user,
      position: 0,
      lastHeartbeat: Date.now()
    });

    return user;
  }

  /**
   * Remove user from room
   */
  removeUser(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const wasHost = room.hostId === userId;
    room.users = room.users.filter(u => u.id !== userId);
    // Remove from co-hosts if they were one
    room.coHosts = room.coHosts.filter(id => id !== userId);

    // If room is empty, delete it
    if (room.users.length === 0) {
      this.rooms.delete(roomId);
      return;
    }

    // If host left, promote first user to host
    if (wasHost && room.users.length > 0) {
      room.hostId = room.users[0].id;
      console.log(`New host for room ${roomId}: ${room.users[0].username}`);
    }
  }

  /**
   * Check if a user can control playback (host or co-host)
   */
  canControl(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.hostId === userId || room.coHosts.includes(userId);
  }

  /**
   * Add a co-host to a room (host only)
   */
  addCoHost(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (!room.coHosts.includes(userId)) {
      room.coHosts.push(userId);
    }
    return room;
  }

  /**
   * Remove a co-host from a room (host only)
   */
  removeCoHost(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    room.coHosts = room.coHosts.filter(id => id !== userId);
    return room;
  }

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

  /**
   * Remove a user's reaction from a track
   */
  removeReaction(roomId, trackId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    if (room.reactions[trackId]) {
      const previous = room.reactions[trackId][userId] || null;
      delete room.reactions[trackId][userId];

      if (Object.keys(room.reactions[trackId]).length === 0) {
        delete room.reactions[trackId];
      }

      return { previous, current: null };
    }
    return { previous: null, current: null };
  }

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

  /**
   * Update playback state
   */
  updatePlaybackState(roomId, updates) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    room.playbackState = {
      ...room.playbackState,
      ...updates
    };

    return room.playbackState;
  }

  /**
   * Update queue
   */
  updateQueue(roomId, queue) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    room.queue = queue;
    return room.queue;
  }

  /**
   * Update user's position for presence tracking
   */
  updateUserPosition(roomId, userId, position) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const user = room.users.find(u => u.id === userId);
    if (user) {
      user.position = position;
      user.lastHeartbeat = Date.now();
    }
  }

  /**
   * Clean up stale rooms (no heartbeat for 5 minutes)
   */
  cleanupStaleRooms() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [roomId, room] of this.rooms.entries()) {
      const staleUsers = room.users.filter(
        u => now - u.lastHeartbeat > timeout
      );

      if (staleUsers.length === room.users.length) {
        // All users are stale, delete room
        this.rooms.delete(roomId);
        console.log(`Cleaned up stale room: ${roomId}`);
      } else if (staleUsers.length > 0) {
        // Remove stale users
        staleUsers.forEach(u => this.removeUser(roomId, u.id));
      }
    }
  }
}
