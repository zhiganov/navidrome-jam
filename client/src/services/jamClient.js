import { io } from 'socket.io-client';

class JamClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.socket = null;
    this.currentRoomId = null;
    this.userId = this.getUserId();
    this.listeners = {};
  }

  /**
   * Get or create user ID
   */
  getUserId() {
    let userId = localStorage.getItem('jam_user_id');
    if (!userId) {
      userId = 'user-' + Math.random().toString(36).substring(2, 18);
      localStorage.setItem('jam_user_id', userId);
    }
    return userId;
  }

  /**
   * Connect to sync server
   */
  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl);

      this.socket.on('connect', () => {
        console.log('Connected to Jam server');
        this.setupEventListeners();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from Jam server');
        this.emit('disconnected');
      });
    });
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentRoomId = null;
    }
  }

  /**
   * Setup event listeners for server events
   */
  setupEventListeners() {
    this.socket.on('room-state', ({ room }) => {
      console.log('Received room state:', room);
      this.currentRoomId = room.id;
      this.emit('room-state', room);
    });

    this.socket.on('sync', (state) => {
      console.log('Sync command received:', state);
      this.emit('sync', state);
    });

    this.socket.on('user-joined', ({ user, room }) => {
      console.log('User joined:', user.username);
      this.emit('user-joined', { user, room });
    });

    this.socket.on('user-left', ({ userId, room, newHost }) => {
      console.log('User left:', userId);
      this.emit('user-left', { userId, room, newHost });
    });

    this.socket.on('queue-updated', ({ queue }) => {
      console.log('Queue updated:', queue.length, 'tracks');
      this.emit('queue-updated', queue);
    });

    this.socket.on('cohost-updated', ({ room }) => {
      console.log('Co-host updated:', room.coHosts);
      this.emit('cohost-updated', room);
    });

    this.socket.on('track-reactions', (data) => {
      console.log('Track reactions:', data);
      this.emit('track-reactions', data);
    });

    this.socket.on('error', ({ message }) => {
      console.error('Server error:', message);
      this.emit('error', message);
    });
  }

  /**
   * List active rooms
   */
  async listRooms() {
    const response = await fetch(`${this.serverUrl}/api/rooms`);
    if (!response.ok) {
      throw new Error('Failed to fetch rooms');
    }
    const data = await response.json();
    return data.rooms;
  }

  /**
   * Create a new room
   */
  async createRoom(roomId = null, hostName = null, community = null) {
    const response = await fetch(`${this.serverUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, hostName, community })
    });

    if (!response.ok) {
      throw new Error('Failed to create room');
    }

    const data = await response.json();
    return data.room;
  }

  /**
   * Register a new Navidrome user via invite code
   */
  async register(username, password, inviteCode) {
    const response = await fetch(`${this.serverUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, inviteCode })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    return data;
  }

  /**
   * Join a room
   */
  joinRoom(roomId, username) {
    if (!this.socket || !this.socket.connected) {
      throw new Error('Not connected to server');
    }

    this.socket.emit('join-room', {
      roomId,
      userId: this.userId,
      username
    });
  }

  /**
   * Leave current room (without disconnecting)
   */
  leaveRoom() {
    if (!this.socket || !this.socket.connected) {
      return;
    }

    this.socket.emit('leave-room');
    this.currentRoomId = null;
  }

  /**
   * Play a track (host only)
   */
  play(trackId, position = 0) {
    if (!this.currentRoomId) {
      throw new Error('Not in a room');
    }

    this.socket.emit('play', {
      roomId: this.currentRoomId,
      trackId,
      position
    });
  }

  /**
   * Pause playback (host only)
   */
  pause(position) {
    if (!this.currentRoomId) {
      throw new Error('Not in a room');
    }

    this.socket.emit('pause', {
      roomId: this.currentRoomId,
      position
    });
  }

  /**
   * Seek to position (host only)
   */
  seek(position) {
    if (!this.currentRoomId) {
      throw new Error('Not in a room');
    }

    this.socket.emit('seek', {
      roomId: this.currentRoomId,
      position
    });
  }

  /**
   * Update queue (host only)
   */
  updateQueue(queue) {
    if (!this.currentRoomId) {
      throw new Error('Not in a room');
    }

    this.socket.emit('update-queue', {
      roomId: this.currentRoomId,
      queue
    });
  }

  /**
   * Promote user to co-host (host only)
   */
  promoteCoHost(userId) {
    if (!this.currentRoomId) {
      throw new Error('Not in a room');
    }

    this.socket.emit('promote-cohost', {
      roomId: this.currentRoomId,
      userId
    });
  }

  /**
   * Demote co-host (host only)
   */
  demoteCoHost(userId) {
    if (!this.currentRoomId) {
      throw new Error('Not in a room');
    }

    this.socket.emit('demote-cohost', {
      roomId: this.currentRoomId,
      userId
    });
  }

  /**
   * Send heartbeat
   */
  sendHeartbeat(position) {
    if (!this.currentRoomId || !this.socket) {
      return;
    }

    this.socket.emit('heartbeat', {
      roomId: this.currentRoomId,
      position
    });
  }

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

  /**
   * Subscribe to events
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  /**
   * Unsubscribe from events
   */
  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => callback(data));
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.socket && this.socket.connected;
  }

  /**
   * Get current room ID
   */
  getRoomId() {
    return this.currentRoomId;
  }
}

export default JamClient;
