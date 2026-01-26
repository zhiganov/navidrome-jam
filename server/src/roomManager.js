import { randomBytes } from 'crypto';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  /**
   * Generate a random room code (6 characters)
   */
  generateRoomCode() {
    return randomBytes(3).toString('hex').toUpperCase();
  }

  /**
   * Create a new room
   */
  createRoom(roomId = null, hostName = 'Host') {
    const id = roomId || this.generateRoomCode();

    if (this.rooms.has(id)) {
      throw new Error('Room already exists');
    }

    const room = {
      id,
      hostId: null, // Set when first user joins
      hostName,
      users: [],
      queue: [],
      playbackState: {
        trackId: null,
        position: 0,
        playing: false,
        timestamp: Date.now()
      },
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
   * Add user to room
   */
  addUser(roomId, user) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    // First user becomes host
    if (room.users.length === 0) {
      room.hostId = user.id;
    }

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
