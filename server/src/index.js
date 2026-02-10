import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { RoomManager } from './roomManager.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
});

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

const roomManager = new RoomManager();

// Invite code tracking (single-use, in-memory)
const validInviteCodes = new Set(
  (process.env.INVITE_CODES || '').split(',').map(c => c.trim()).filter(Boolean)
);
const usedInviteCodes = new Set();

// Validation helpers
function validateRoomId(roomId) {
  if (!roomId) return { valid: true }; // null/undefined is ok (will be generated)

  if (typeof roomId !== 'string') {
    return { valid: false, error: 'roomId must be a string' };
  }

  if (roomId.length > 6) {
    return { valid: false, error: 'roomId must be at most 6 characters' };
  }

  if (!/^[a-zA-Z0-9]+$/.test(roomId)) {
    return { valid: false, error: 'roomId must be alphanumeric' };
  }

  return { valid: true };
}

function sanitizeString(str, maxLength = 50) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  // Strip HTML tags and limit length
  return str
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>\"']/g, '') // Remove potentially dangerous characters
    .trim()
    .substring(0, maxLength);
}

function validateRegistration({ username, password, inviteCode }) {
  if (!username || typeof username !== 'string' || username.trim().length < 3 || username.length > 50) {
    return { valid: false, error: 'Username must be 3-50 characters' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, error: 'Username must be alphanumeric (hyphens and underscores allowed)' };
  }
  if (!password || typeof password !== 'string' || password.length < 6 || password.length > 128) {
    return { valid: false, error: 'Password must be 6-128 characters' };
  }
  if (!inviteCode || typeof inviteCode !== 'string') {
    return { valid: false, error: 'Invite code is required' };
  }
  return { valid: true };
}

// Rate limiting for room creation (max 5 rooms per IP per minute)
const createRoomLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many room creation attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: roomManager.getRoomCount(),
    connections: io.sockets.sockets.size
  });
});

// REST endpoints for room management
app.post('/api/rooms', createRoomLimiter, (req, res) => {
  try {
    const { roomId, hostName } = req.body;

    // Validate roomId
    const roomIdValidation = validateRoomId(roomId);
    if (!roomIdValidation.valid) {
      return res.status(400).json({ error: roomIdValidation.error });
    }

    // Sanitize hostName to prevent XSS
    const sanitizedHostName = sanitizeString(hostName, 50) || 'Host';

    // Create room
    const room = roomManager.createRoom(roomId || null, sanitizedHostName);

    res.status(201).json({ room });
  } catch (error) {
    console.error('Error creating room:', error);

    if (error.message === 'Room already exists') {
      return res.status(409).json({ error: 'Room already exists' });
    }

    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.get('/api/rooms/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;

    // Validate roomId format
    const roomIdValidation = validateRoomId(roomId);
    if (!roomIdValidation.valid) {
      return res.status(400).json({ error: roomIdValidation.error });
    }

    const room = roomManager.getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ room });
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

// User registration via invite code
app.post('/api/register', registerLimiter, async (req, res) => {
  try {
    const { username, password, inviteCode } = req.body;

    const validation = validateRegistration({ username, password, inviteCode });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const adminUser = process.env.NAVIDROME_ADMIN_USER;
    const adminPass = process.env.NAVIDROME_ADMIN_PASS;
    const navidromeUrl = process.env.NAVIDROME_URL;

    if (!adminUser || !adminPass || !navidromeUrl) {
      console.error('Registration endpoint called but admin credentials not configured');
      return res.status(503).json({ error: 'Registration is not available' });
    }

    const trimmedCode = inviteCode.trim();
    if (!validInviteCodes.has(trimmedCode)) {
      return res.status(403).json({ error: 'Invalid invite code' });
    }
    if (usedInviteCodes.has(trimmedCode)) {
      return res.status(403).json({ error: 'This invite code has already been used' });
    }

    // Step 1: Authenticate as admin via Navidrome native API
    const loginResponse = await fetch(`${navidromeUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUser, password: adminPass })
    });

    if (!loginResponse.ok) {
      console.error('Admin login failed:', loginResponse.status);
      return res.status(502).json({ error: 'Failed to authenticate with Navidrome' });
    }

    const loginData = await loginResponse.json();
    const adminToken = loginData.token;

    if (!adminToken) {
      console.error('No token in admin login response');
      return res.status(502).json({ error: 'Failed to authenticate with Navidrome' });
    }

    // Step 2: Create user via Navidrome native API
    const createResponse = await fetch(`${navidromeUrl}/api/user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nd-authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userName: username.trim(),
        password: password,
        isAdmin: false
      })
    });

    const createText = await createResponse.text();
    console.log('Navidrome createUser response:', createResponse.status, createText.substring(0, 500));

    if (!createResponse.ok) {
      let errMsg = 'Failed to create user';
      try {
        const errData = JSON.parse(createText);
        errMsg = errData.error || errData.message || errMsg;
      } catch {}
      if (errMsg.toLowerCase().includes('already exists') || createResponse.status === 409) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      return res.status(400).json({ error: errMsg });
    }

    // Mark invite code as used only after successful creation
    usedInviteCodes.add(trimmedCode);

    console.log(`User registered: ${username.trim()} (invite code used)`);
    res.status(201).json({ message: 'Account created successfully. You can now log in.' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  let currentRoomId = null;
  let currentUserId = null;

  // Join a room
  socket.on('join-room', ({ roomId, userId, username }) => {
    try {
      // Validate roomId
      const roomIdValidation = validateRoomId(roomId);
      if (!roomIdValidation.valid) {
        socket.emit('error', { message: roomIdValidation.error });
        return;
      }

      // Validate userId (alphanumeric with hyphens, max 50 chars)
      if (!userId || typeof userId !== 'string' || userId.length > 50 || !/^[a-zA-Z0-9-]+$/.test(userId)) {
        socket.emit('error', { message: 'Invalid user ID' });
        return;
      }

      // Sanitize username
      const sanitizedUsername = sanitizeString(username, 50) || 'Anonymous';

      const room = roomManager.getRoom(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Leave previous room if any
      if (currentRoomId) {
        socket.leave(currentRoomId);
        roomManager.removeUser(currentRoomId, currentUserId);
      }

      // Join new room
      socket.join(roomId);
      currentRoomId = roomId;
      currentUserId = userId;

      const user = roomManager.addUser(roomId, {
        id: userId,
        socketId: socket.id,
        username: sanitizedUsername,
        joinedAt: Date.now()
      });

      // Send current room state to the joining user
      socket.emit('room-state', { room: roomManager.getRoom(roomId) });

      // Notify others in the room
      socket.to(roomId).emit('user-joined', {
        user,
        room: roomManager.getRoom(roomId)
      });

      console.log(`User ${username} (${userId}) joined room ${roomId}`);
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Play command (host or co-host)
  socket.on('play', ({ roomId, trackId, position = 0 }) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room || !roomManager.canControl(roomId, currentUserId)) {
        socket.emit('error', { message: 'Unauthorized: Only host or co-hosts can control playback' });
        return;
      }

      const state = roomManager.updatePlaybackState(roomId, {
        trackId,
        position,
        playing: true,
        timestamp: Date.now()
      });

      io.to(roomId).emit('sync', state);
      console.log(`Room ${roomId}: Playing track ${trackId} at ${position}s`);
    } catch (error) {
      console.error('Error playing track:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Pause command (host or co-host)
  socket.on('pause', ({ roomId, position }) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room || !roomManager.canControl(roomId, currentUserId)) {
        socket.emit('error', { message: 'Unauthorized: Only host or co-hosts can control playback' });
        return;
      }

      const state = roomManager.updatePlaybackState(roomId, {
        position,
        playing: false,
        timestamp: Date.now()
      });

      io.to(roomId).emit('sync', state);
      console.log(`Room ${roomId}: Paused at ${position}s`);
    } catch (error) {
      console.error('Error pausing:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Seek command (host or co-host)
  socket.on('seek', ({ roomId, position }) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room || !roomManager.canControl(roomId, currentUserId)) {
        socket.emit('error', { message: 'Unauthorized: Only host or co-hosts can control playback' });
        return;
      }

      const state = roomManager.updatePlaybackState(roomId, {
        position,
        timestamp: Date.now()
      });

      io.to(roomId).emit('sync', state);
      console.log(`Room ${roomId}: Seeked to ${position}s`);
    } catch (error) {
      console.error('Error seeking:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Queue management (host or co-host)
  socket.on('update-queue', ({ roomId, queue }) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room || !roomManager.canControl(roomId, currentUserId)) {
        socket.emit('error', { message: 'Unauthorized: Only host or co-hosts can update queue' });
        return;
      }

      // Validate and sanitize queue
      if (!Array.isArray(queue)) {
        socket.emit('error', { message: 'Invalid queue format' });
        return;
      }

      // Limit queue size to prevent abuse
      if (queue.length > 100) {
        socket.emit('error', { message: 'Queue too large (max 100 items)' });
        return;
      }

      // Sanitize each queue item
      const sanitizedQueue = queue.map(item => ({
        id: typeof item.id === 'string' ? item.id.substring(0, 100) : '',
        title: sanitizeString(item.title, 200),
        artist: sanitizeString(item.artist, 100),
        album: sanitizeString(item.album, 200)
      })).filter(item => item.id); // Remove items without valid ID

      roomManager.updateQueue(roomId, sanitizedQueue);
      io.to(roomId).emit('queue-updated', { queue: sanitizedQueue });
      console.log(`Room ${roomId}: Queue updated`);
    } catch (error) {
      console.error('Error updating queue:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Promote user to co-host (host only)
  socket.on('promote-cohost', ({ roomId, userId }) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room || room.hostId !== currentUserId) {
        socket.emit('error', { message: 'Unauthorized: Only host can promote co-hosts' });
        return;
      }

      if (!userId || typeof userId !== 'string' || userId.length > 50) {
        socket.emit('error', { message: 'Invalid user ID' });
        return;
      }

      // Can't promote yourself or someone not in the room
      if (userId === currentUserId) return;
      if (!room.users.find(u => u.id === userId)) {
        socket.emit('error', { message: 'User not found in room' });
        return;
      }

      roomManager.addCoHost(roomId, userId);
      io.to(roomId).emit('cohost-updated', { room: roomManager.getRoom(roomId) });
      console.log(`Room ${roomId}: ${userId} promoted to co-host`);
    } catch (error) {
      console.error('Error promoting co-host:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Demote co-host (host only)
  socket.on('demote-cohost', ({ roomId, userId }) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room || room.hostId !== currentUserId) {
        socket.emit('error', { message: 'Unauthorized: Only host can demote co-hosts' });
        return;
      }

      if (!userId || typeof userId !== 'string') return;

      roomManager.removeCoHost(roomId, userId);
      io.to(roomId).emit('cohost-updated', { room: roomManager.getRoom(roomId) });
      console.log(`Room ${roomId}: ${userId} demoted from co-host`);
    } catch (error) {
      console.error('Error demoting co-host:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Leave room explicitly (without disconnecting)
  socket.on('leave-room', () => {
    if (currentRoomId && currentUserId) {
      try {
        const room = roomManager.getRoom(currentRoomId);
        const wasHost = room?.hostId === currentUserId;

        socket.leave(currentRoomId);
        roomManager.removeUser(currentRoomId, currentUserId);

        const updatedRoom = roomManager.getRoom(currentRoomId);

        if (updatedRoom) {
          // Notify others in the room
          io.to(currentRoomId).emit('user-left', {
            userId: currentUserId,
            room: updatedRoom,
            newHost: wasHost ? updatedRoom.hostId : null
          });
        } else {
          console.log(`Room ${currentRoomId} deleted (empty)`);
        }

        console.log(`User ${currentUserId} left room ${currentRoomId}`);
        currentRoomId = null;
        currentUserId = null;
      } catch (error) {
        console.error('Error leaving room:', error);
      }
    }
  });

  // Heartbeat for presence tracking
  socket.on('heartbeat', ({ roomId, position }) => {
    try {
      roomManager.updateUserPosition(roomId, currentUserId, position);
    } catch (error) {
      // Silent fail - heartbeats are not critical
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    if (currentRoomId && currentUserId) {
      try {
        const room = roomManager.getRoom(currentRoomId);
        const wasHost = room?.hostId === currentUserId;

        roomManager.removeUser(currentRoomId, currentUserId);

        const updatedRoom = roomManager.getRoom(currentRoomId);

        if (updatedRoom) {
          // Notify others in the room
          io.to(currentRoomId).emit('user-left', {
            userId: currentUserId,
            room: updatedRoom,
            newHost: wasHost ? updatedRoom.hostId : null
          });
        } else {
          // Room was deleted (no users left)
          console.log(`Room ${currentRoomId} deleted (empty)`);
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Navidrome Jam sync server running on port ${PORT}`);
});

// Schedule periodic cleanup of stale rooms (every 60 seconds)
// Removes rooms where all users have been inactive for 5+ minutes
setInterval(() => {
  roomManager.cleanupStaleRooms();
}, 60000);
