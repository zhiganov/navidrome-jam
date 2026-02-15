import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import Busboy from 'busboy';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { Resend } from 'resend';
import { RoomManager } from './roomManager.js';
import { SftpUploader } from './sftpUploader.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const clientUrl = process.env.CLIENT_URL || '*';
const corsOrigin = clientUrl === '*' ? '*' : clientUrl.split(',').map(u => u.trim());

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST']
  }
});

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

const roomManager = new RoomManager();
const sftpUploader = new SftpUploader();

// --- Navidrome admin token cache (for track path lookups) ---
let ndAdminToken = null;
let ndAdminTokenExpiry = 0;

async function getNavidromeToken() {
  if (ndAdminToken && Date.now() < ndAdminTokenExpiry) {
    return ndAdminToken;
  }

  const url = process.env.NAVIDROME_URL;
  const user = process.env.NAVIDROME_ADMIN_USER;
  const pass = process.env.NAVIDROME_ADMIN_PASS;

  if (!url || !user || !pass) return null;

  try {
    const response = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });

    if (!response.ok) return null;

    const data = await response.json();
    ndAdminToken = data.token;
    ndAdminTokenExpiry = Date.now() + 55 * 60 * 1000; // refresh every 55 min
    return ndAdminToken;
  } catch {
    return null;
  }
}

// trackId → upload metaKey cache (null = not an upload)
const trackUploadKeyCache = new Map();

async function getTrackUploadKey(trackId) {
  if (trackUploadKeyCache.has(trackId)) {
    return trackUploadKeyCache.get(trackId);
  }

  const token = await getNavidromeToken();
  if (!token) return null;

  try {
    const url = process.env.NAVIDROME_URL;
    const response = await fetch(`${url}/api/song/${encodeURIComponent(trackId)}`, {
      headers: { 'x-nd-authorization': `Bearer ${token}` }
    });

    if (!response.ok) return null;

    const song = await response.json();
    const path = song.path || '';

    const marker = 'jam-uploads/';
    const idx = path.indexOf(marker);

    let result = null;
    if (idx !== -1) {
      result = path.substring(idx + marker.length); // "username/filename.mp3"
    }

    trackUploadKeyCache.set(trackId, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget: update upload like count when a track is liked/unliked.
 * Only affects tracks stored in jam-uploads/.
 */
async function updateUploadLikes(trackId, delta) {
  if (!sftpUploader.isConfigured()) return;

  const metaKey = await getTrackUploadKey(trackId);
  if (!metaKey) return;

  const newCount = await sftpUploader.updateLikes(metaKey, delta);
  console.log(`Upload likes: ${metaKey} → ${newCount} (${delta > 0 ? '+' : ''}${delta})`);
}

// Persistent data directory (Railway volume or local ./data)
const DATA_DIR = process.env.DATA_DIR || './data';

// Invite code tracking (persisted to volume)
const CODES_PATH = path.join(DATA_DIR, 'invite-codes.json');

const envCodes = (process.env.INVITE_CODES || '').split(',').map(c => c.trim()).filter(Boolean);
const validInviteCodes = new Set(envCodes);
const usedInviteCodes = new Map(); // code → username
const sentInviteCodes = new Map(); // code → { email, name, sentAt }

// Resend email client (optional — only needed for sending invite codes)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Load persisted invite codes on startup (merges with env var codes)
async function loadInviteCodes() {
  try {
    const data = JSON.parse(await readFile(CODES_PATH, 'utf8'));
    for (const code of (data.valid || [])) validInviteCodes.add(code);
    for (const [code, user] of Object.entries(data.used || {})) {
      validInviteCodes.add(code);
      usedInviteCodes.set(code, user);
    }
    for (const [code, info] of Object.entries(data.sent || {})) {
      sentInviteCodes.set(code, info);
    }
    console.log(`Loaded ${validInviteCodes.size} invite codes (${usedInviteCodes.size} used, ${sentInviteCodes.size} sent) from disk`);
  } catch {
    // No persisted file yet — that's fine, env codes are already loaded
  }
}

async function saveInviteCodes() {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CODES_PATH, JSON.stringify({
    valid: [...validInviteCodes],
    used: Object.fromEntries(usedInviteCodes),
    sent: Object.fromEntries(sentInviteCodes),
  }, null, 2));
}

loadInviteCodes();

// Validation helpers
function validateRoomId(roomId) {
  if (!roomId) return { valid: true }; // null/undefined is ok (will be generated)

  if (typeof roomId !== 'string') {
    return { valid: false, error: 'roomId must be a string' };
  }

  if (roomId.length > 8) {
    return { valid: false, error: 'roomId must be at most 8 characters' };
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

// Waitlist persistence
const WAITLIST_PATH = path.join(DATA_DIR, 'waitlist.json');

async function readWaitlist() {
  try {
    const data = await readFile(WAITLIST_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeWaitlist(list) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(WAITLIST_PATH, JSON.stringify(list, null, 2));
}

const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Too many waitlist attempts. Please try again later.' },
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

// Proxy communities from scenius-digest (avoids CORS issues for browser clients)
let communitiesCache = { data: null, fetchedAt: 0 };
app.get('/api/communities', async (req, res) => {
  try {
    const now = Date.now();
    if (communitiesCache.data && now - communitiesCache.fetchedAt < 60 * 60 * 1000) {
      return res.json(communitiesCache.data);
    }
    const response = await fetch('https://scenius-digest.vercel.app/api/groups');
    if (!response.ok) throw new Error('Failed to fetch groups');
    const { groups } = await response.json();
    const communities = Object.entries(groups).map(([id, info]) => ({
      id,
      name: info.name || id
    }));
    communitiesCache = { data: { communities }, fetchedAt: now };
    res.json({ communities });
  } catch (error) {
    console.error('Error fetching communities:', error);
    res.json({ communities: [] });
  }
});

// REST endpoints for room management
app.get('/api/rooms', (req, res) => {
  let rooms = roomManager.listRooms();
  const { community } = req.query;
  if (community) {
    rooms = rooms.filter(r => r.community === community);
  }
  res.json({ rooms });
});

app.post('/api/rooms', createRoomLimiter, (req, res) => {
  try {
    const { roomId, hostName, community } = req.body;

    // Validate roomId
    const roomIdValidation = validateRoomId(roomId);
    if (!roomIdValidation.valid) {
      return res.status(400).json({ error: roomIdValidation.error });
    }

    // Sanitize hostName to prevent XSS
    const sanitizedHostName = sanitizeString(hostName, 50) || 'Host';
    const sanitizedCommunity = community ? sanitizeString(community, 50) : null;

    // Create room
    const room = roomManager.createRoom(roomId || null, sanitizedHostName, sanitizedCommunity);

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
    usedInviteCodes.set(trimmedCode, username.trim());
    saveInviteCodes().catch(err => console.error('Failed to persist invite codes:', err));

    console.log(`User registered: ${username.trim()} (invite code used)`);
    res.status(201).json({ message: 'Account created successfully. You can now log in.' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// --- Upload endpoints ---

const ALLOWED_EXTENSIONS = ['.mp3', '.flac', '.ogg', '.opus', '.m4a', '.wav', '.aac'];
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const PERMANENT_QUOTA = 50;

// Rate limit: 5 uploads per user per hour (keyed by Subsonic username)
const uploadRateLimitMap = new Map(); // username -> { count, resetAt }

function checkUploadRateLimit(username) {
  const now = Date.now();
  const entry = uploadRateLimitMap.get(username);

  if (!entry || now > entry.resetAt) {
    uploadRateLimitMap.set(username, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }

  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

/**
 * Verify Subsonic credentials by pinging Navidrome.
 * Returns the username on success, null on failure.
 */
async function verifySubsonicAuth(query) {
  const { u, t, s, p } = query;
  if (!u || (!t && !p)) return null;

  const navidromeUrl = process.env.NAVIDROME_URL;
  if (!navidromeUrl) return null;

  const params = new URLSearchParams({ u, v: '1.16.1', c: 'navidrome-jam', f: 'json' });
  if (t && s) {
    params.set('t', t);
    params.set('s', s);
  } else if (p) {
    params.set('p', p);
  }

  try {
    const resp = await fetch(`${navidromeUrl}/rest/ping.view?${params}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data['subsonic-response']?.status === 'ok') return u;
    return null;
  } catch {
    return null;
  }
}

// POST /api/upload — multipart file upload
app.post('/api/upload', async (req, res) => {
  if (!sftpUploader.isConfigured()) {
    return res.status(503).json({ error: 'Uploads are not configured' });
  }

  // Verify Subsonic auth from query params
  const username = await verifySubsonicAuth(req.query);
  if (!username) {
    return res.status(401).json({ error: 'Invalid Navidrome credentials' });
  }

  // Check per-user rate limit
  if (!checkUploadRateLimit(username)) {
    return res.status(429).json({ error: 'Upload limit reached (5 per hour). Try again later.' });
  }

  // Check Content-Length before parsing
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_FILE_SIZE) {
    return res.status(413).json({ error: 'File too large (max 200 MB)' });
  }

  try {
    const result = await new Promise((resolve, reject) => {
      const busboy = Busboy({
        headers: req.headers,
        limits: { fileSize: MAX_FILE_SIZE, files: 1 },
      });

      let fileProcessed = false;

      busboy.on('file', async (fieldname, fileStream, info) => {
        if (fileProcessed) {
          fileStream.resume(); // drain extra files
          return;
        }
        fileProcessed = true;

        const { filename: rawFilename } = info;
        // Sanitize filename: keep only safe chars
        const filename = rawFilename
          .replace(/[^a-zA-Z0-9._\-() ]/g, '')
          .trim()
          .substring(0, 200);

        if (!filename) {
          reject(new Error('Invalid filename'));
          fileStream.resume();
          return;
        }

        // Check extension
        const ext = '.' + filename.split('.').pop().toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          reject(new Error(`File type not allowed. Accepted: ${ALLOWED_EXTENSIONS.join(', ')}`));
          fileStream.resume();
          return;
        }

        // Track if file was truncated (exceeded size limit)
        let truncated = false;
        fileStream.on('limit', () => {
          truncated = true;
        });

        try {
          const uploadResult = await sftpUploader.upload(fileStream, username, filename);
          if (truncated) {
            // Delete the truncated file
            await sftpUploader.deleteUpload(username, uploadResult.filename);
            reject(new Error('File too large (max 200 MB)'));
          } else {
            resolve(uploadResult);
          }
        } catch (err) {
          reject(err);
        }
      });

      busboy.on('error', reject);

      busboy.on('close', () => {
        if (!fileProcessed) {
          reject(new Error('No file provided'));
        }
      });

      req.pipe(busboy);
    });

    res.status(201).json({
      message: 'Upload successful. Track will appear in search after Navidrome indexes it (~1 min).',
      filename: result.filename,
    });
  } catch (error) {
    console.error('Upload error:', error);
    const status = error.message.includes('too large') ? 413
      : error.message.includes('not allowed') ? 400
      : error.message.includes('Invalid') || error.message.includes('No file') ? 400
      : 500;
    res.status(status).json({ error: error.message });
  }
});

// GET /api/uploads/mine — list current user's uploads
app.get('/api/uploads/mine', async (req, res) => {
  if (!sftpUploader.isConfigured()) {
    return res.status(503).json({ error: 'Uploads are not configured' });
  }

  const username = await verifySubsonicAuth(req.query);
  if (!username) {
    return res.status(401).json({ error: 'Invalid Navidrome credentials' });
  }

  try {
    const uploads = await sftpUploader.listUserUploads(username);
    const permanentCount = uploads.filter(u => u.permanent).length;
    res.json({ uploads, permanentCount, permanentQuota: PERMANENT_QUOTA });
  } catch (error) {
    console.error('Error listing uploads:', error);
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

// POST /api/uploads/:filename/permanent — toggle permanent flag
app.post('/api/uploads/:filename/permanent', async (req, res) => {
  if (!sftpUploader.isConfigured()) {
    return res.status(503).json({ error: 'Uploads are not configured' });
  }

  const username = await verifySubsonicAuth(req.query);
  if (!username) {
    return res.status(401).json({ error: 'Invalid Navidrome credentials' });
  }

  const { filename } = req.params;

  try {
    // Check quota before toggling to permanent
    const currentCount = await sftpUploader.countPermanent(username);
    const uploads = await sftpUploader.listUserUploads(username);
    const targetUpload = uploads.find(u => u.filename === filename);

    if (!targetUpload) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    // If toggling ON and already at quota, reject
    if (!targetUpload.permanent && currentCount >= PERMANENT_QUOTA) {
      return res.status(400).json({
        error: `Permanent quota reached (${PERMANENT_QUOTA}). Remove permanent flag from another file first.`,
      });
    }

    const permanent = await sftpUploader.togglePermanent(username, filename);
    res.json({ filename, permanent });
  } catch (error) {
    console.error('Error toggling permanent:', error);
    if (error.message === 'Upload not found') {
      return res.status(404).json({ error: 'Upload not found' });
    }
    res.status(500).json({ error: 'Failed to update permanent flag' });
  }
});

// Admin auth helper
function checkAdminAuth(req, res) {
  const adminPass = process.env.NAVIDROME_ADMIN_PASS;
  if (!adminPass) {
    res.status(503).json({ error: 'Admin not configured' });
    return false;
  }
  const auth = req.headers.authorization;
  const queryKey = req.query.key;
  if (queryKey !== adminPass && (!auth || auth !== `Bearer ${adminPass}`)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// Admin: invite code status (JSON API)
app.get('/api/admin/codes', (req, res) => {
  if (!checkAdminAuth(req, res)) return;

  const codes = [...validInviteCodes].map(code => {
    const used = usedInviteCodes.has(code);
    const sent = sentInviteCodes.has(code);
    return {
      code,
      status: used ? 'used' : sent ? 'sent' : 'available',
      usedBy: usedInviteCodes.get(code) || null,
      sentTo: sentInviteCodes.get(code) || null,
    };
  });

  const available = codes.filter(c => c.status === 'available').length;
  const sent = codes.filter(c => c.status === 'sent').length;
  res.json({ codes, total: codes.length, available, sent });
});

// Admin: generate new invite codes
app.post('/api/admin/generate-codes', (req, res) => {
  if (!checkAdminAuth(req, res)) return;

  const count = Math.min(Math.max(parseInt(req.body.count) || 5, 1), 20);
  const newCodes = [];

  for (let i = 0; i < count; i++) {
    let code;
    do {
      code = 'JAM-' + Array.from({ length: 4 }, () =>
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 36)]
      ).join('');
    } while (validInviteCodes.has(code));

    validInviteCodes.add(code);
    newCodes.push(code);
  }

  saveInviteCodes().catch(err => console.error('Failed to persist invite codes:', err));
  console.log(`Admin generated ${count} new invite codes: ${newCodes.join(', ')}`);
  res.json({ generated: newCodes, total: validInviteCodes.size });
});

// Admin: remove a code
app.delete('/api/admin/codes/:code', (req, res) => {
  if (!checkAdminAuth(req, res)) return;

  const code = req.params.code;
  if (!validInviteCodes.has(code)) {
    return res.status(404).json({ error: 'Code not found' });
  }

  validInviteCodes.delete(code);
  usedInviteCodes.delete(code);
  saveInviteCodes().catch(err => console.error('Failed to persist invite codes:', err));
  res.json({ deleted: code, total: validInviteCodes.size });
});

// Admin: purge all unused codes (keeps used and sent for audit trail)
app.delete('/api/admin/codes', (req, res) => {
  if (!checkAdminAuth(req, res)) return;

  const before = validInviteCodes.size;
  const purged = [];
  for (const code of [...validInviteCodes]) {
    if (!usedInviteCodes.has(code) && !sentInviteCodes.has(code)) {
      validInviteCodes.delete(code);
      purged.push(code);
    }
  }

  saveInviteCodes().catch(err => console.error('Failed to persist invite codes:', err));
  res.json({ purged: purged.length, remaining: validInviteCodes.size });
});

// Waitlist: join
app.post('/api/waitlist', waitlistLimiter, async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 100) {
    return res.status(400).json({ error: 'Name is required (max 100 characters)' });
  }
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    const waitlist = await readWaitlist();
    const normalizedEmail = email.trim().toLowerCase();

    if (waitlist.some(e => e.email === normalizedEmail)) {
      return res.status(409).json({ error: 'This email is already on the waitlist' });
    }

    waitlist.push({
      name: sanitizeString(name.trim(), 100),
      email: normalizedEmail,
      message: message ? sanitizeString(message.trim(), 500) : null,
      joinedAt: new Date().toISOString(),
    });

    await writeWaitlist(waitlist);
    console.log(`Waitlist: ${normalizedEmail} joined (position ${waitlist.length})`);

    // Notify admin via Telegram
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID) {
      const text = `🎵 *Waitlist signup*\n\n*${name.trim()}* (${normalizedEmail})\nPosition: #${waitlist.length}${message ? `\n\n_"${message.trim()}"_` : ''}`;
      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID, text, parse_mode: 'Markdown' }),
      }).catch(err => console.error('Failed to send Telegram notification:', err));
    }

    res.status(201).json({ position: waitlist.length });
  } catch (err) {
    console.error('Waitlist error:', err);
    res.status(500).json({ error: 'Failed to join waitlist' });
  }
});

// Admin: view waitlist
app.get('/api/admin/waitlist', async (req, res) => {
  if (!checkAdminAuth(req, res)) return;

  const waitlist = await readWaitlist();
  res.json({ waitlist, total: waitlist.length });
});

// Admin: remove from waitlist
app.delete('/api/admin/waitlist/:email', async (req, res) => {
  if (!checkAdminAuth(req, res)) return;

  const email = req.params.email.toLowerCase();
  const waitlist = await readWaitlist();
  const filtered = waitlist.filter(e => e.email !== email);

  if (filtered.length === waitlist.length) {
    return res.status(404).json({ error: 'Email not found on waitlist' });
  }

  await writeWaitlist(filtered);
  res.json({ removed: email, remaining: filtered.length });
});

// Admin: send invite code to a waitlisted person via email
app.post('/api/admin/send-code', async (req, res) => {
  if (!checkAdminAuth(req, res)) return;

  if (!resend) {
    return res.status(503).json({ error: 'Email not configured (set RESEND_API_KEY)' });
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!fromEmail) {
    return res.status(503).json({ error: 'Sender not configured (set RESEND_FROM_EMAIL)' });
  }

  const { email, name } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Pick the first available code (not used, not sent)
  let code = null;
  for (const c of validInviteCodes) {
    if (!usedInviteCodes.has(c) && !sentInviteCodes.has(c)) {
      code = c;
      break;
    }
  }

  if (!code) {
    return res.status(409).json({ error: 'No available codes. Generate more first.' });
  }

  // Send email via Resend
  try {
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: "You're invited to Navidrome Jam!",
      html: getInviteEmailHTML(name || email.split('@')[0], code),
    });

    // Mark code as sent
    sentInviteCodes.set(code, { email, name: name || null, sentAt: new Date().toISOString() });
    saveInviteCodes().catch(err => console.error('Failed to persist sent codes:', err));

    // Remove from waitlist
    const waitlist = await readWaitlist();
    const filtered = waitlist.filter(e => e.email.toLowerCase() !== email.toLowerCase());
    await writeWaitlist(filtered);

    console.log(`Admin sent code ${code} to ${email} (${name || 'no name'})`);
    res.json({ code, email, name });
  } catch (err) {
    console.error('Failed to send invite email:', err);
    res.status(500).json({ error: err.message || 'Failed to send email' });
  }
});

function getInviteEmailHTML(name, code) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#000033;font-family:Tahoma,Verdana,sans-serif">
<div style="padding:40px 20px">
<div style="max-width:480px;margin:0 auto">
  <div style="background:#c0c0c0;border:2px solid;border-color:#fff #000 #000 #fff;box-shadow:inset 1px 1px 0 #fff,inset -1px -1px 0 #808080">
    <div style="background:linear-gradient(90deg,#000080,#1084d0);color:#fff;padding:4px 8px;font-weight:bold;font-size:13px;font-family:Tahoma,Verdana,sans-serif">
      &#9834; Navidrome Jam &mdash; You're Invited!
    </div>
    <div style="padding:20px">
      <p style="font-size:13px;color:#000;margin:0 0 12px">Hey ${name}!</p>
      <p style="font-size:12px;color:#000;margin:0 0 16px">
        Good news &mdash; you're off the waitlist! Here's your personal invite code:
      </p>

      <div style="background:#000;border:2px solid;border-color:#808080 #fff #fff #808080;padding:20px;text-align:center;margin:0 0 16px">
        <div style="font-family:'Courier New',Courier,monospace;font-size:32px;color:#00ff00;letter-spacing:6px">
          ${code}
        </div>
      </div>

      <p style="font-size:12px;color:#000;margin:0 0 4px"><strong>How to join:</strong></p>
      <ol style="font-size:12px;color:#000;margin:0 0 16px;padding-left:20px">
        <li style="margin-bottom:4px">Go to <a href="https://jam.zhgnv.com" style="color:#0000ff">jam.zhgnv.com</a></li>
        <li style="margin-bottom:4px">Click <strong>Sign Up</strong></li>
        <li>Enter the code above</li>
      </ol>

      <div style="height:2px;background:linear-gradient(90deg,transparent,#00ffff,#ff00ff,#ffff00,transparent);margin:16px 0"></div>

      <p style="font-size:10px;color:#808080;text-align:center;margin:0">
        &#42; &#42; &#42; Best viewed in Netscape Navigator 4.0 at 800&times;600 &#42; &#42; &#42;
      </p>
    </div>
  </div>
</div>
</div>
</body>
</html>`;
}

// Admin dashboard page
app.get('/admin', (req, res) => {
  const adminPass = process.env.NAVIDROME_ADMIN_PASS;
  if (!adminPass) {
    return res.status(503).send('Admin not configured');
  }
  const queryKey = req.query.key;
  if (queryKey !== adminPass) {
    return res.status(401).send(`
      <html><body style="background:#000033;color:#fff;font-family:Tahoma,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h2 style="color:#ff0000">Access Denied</h2>
          <p>Add <code>?key=YOUR_ADMIN_PASSWORD</code> to the URL</p>
        </div>
      </body></html>
    `);
  }

  res.send(getAdminPageHTML(queryKey));
});

function getAdminPageHTML(adminKey) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Navidrome Jam — Admin</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');

  * { box-sizing: border-box; }

  :root {
    --win-bg: #c0c0c0;
    --win-dark: #808080;
    --win-light: #ffffff;
    --win-darkest: #000000;
    --title-blue: #000080;
    --title-blue-light: #1084d0;
    --lime: #00ff00;
    --yellow: #ffff00;
    --cyan: #00ffff;
    --red: #ff0000;
    --bg-dark: #000033;
  }

  body {
    margin: 0;
    font-family: 'Tahoma', 'Verdana', 'MS Sans Serif', sans-serif;
    font-size: 11px;
    min-height: 100vh;
    background-color: #000022;
    background-image:
      radial-gradient(1px 1px at 10% 20%, #ffffff44, transparent),
      radial-gradient(1px 1px at 30% 60%, #ffffff33, transparent),
      radial-gradient(1px 1px at 50% 10%, #ffffff55, transparent),
      radial-gradient(1px 1px at 70% 80%, #ffffff22, transparent),
      radial-gradient(1px 1px at 90% 40%, #ffffff44, transparent),
      radial-gradient(1px 1px at 15% 85%, #ffffff33, transparent),
      radial-gradient(1px 1px at 45% 45%, #ffffff55, transparent),
      radial-gradient(1px 1px at 75% 25%, #ffffff22, transparent),
      radial-gradient(2px 2px at 60% 70%, #aaddff66, transparent),
      radial-gradient(2px 2px at 85% 15%, #aaddff44, transparent);
    background-size: 200px 200px;
    color: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    justify-content: flex-start;
    padding: 30px 10px;
  }

  .window {
    background: var(--win-bg);
    border: 2px solid;
    border-color: var(--win-light) var(--win-darkest) var(--win-darkest) var(--win-light);
    box-shadow: inset 1px 1px 0 var(--win-light), inset -1px -1px 0 var(--win-dark);
    width: 520px;
    max-width: 100%;
  }

  .title-bar {
    background: linear-gradient(90deg, var(--title-blue), var(--title-blue-light));
    color: white;
    font-weight: bold;
    font-size: 12px;
    padding: 3px 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: 'VT323', 'Tahoma', monospace;
    font-size: 15px;
    letter-spacing: 0.5px;
  }

  .title-bar-icon {
    width: 14px;
    height: 14px;
    background: var(--yellow);
    border: 1px solid #888;
    font-size: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .window-body {
    padding: 10px;
  }

  .stats {
    display: flex;
    gap: 12px;
    margin-bottom: 10px;
    font-family: 'VT323', monospace;
    font-size: 15px;
  }

  .stat-box {
    background: #fff;
    border: 2px solid;
    border-color: var(--win-dark) var(--win-light) var(--win-light) var(--win-dark);
    padding: 6px 10px;
    flex: 1;
    text-align: center;
  }

  .stat-box .num {
    font-size: 28px;
    font-weight: bold;
  }

  .stat-box .num.green { color: #008000; }
  .stat-box .num.red { color: #cc0000; }
  .stat-box .num.blue { color: var(--title-blue); }
  .stat-box .label { color: #666; font-size: 12px; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    background: #fff;
    border: 2px solid;
    border-color: var(--win-dark) var(--win-light) var(--win-light) var(--win-dark);
  }

  th {
    background: var(--win-bg);
    border-bottom: 1px solid var(--win-dark);
    padding: 4px 6px;
    text-align: left;
    font-family: 'VT323', monospace;
    font-size: 14px;
  }

  td {
    padding: 4px 6px;
    border-bottom: 1px solid #ddd;
    font-family: 'VT323', monospace;
    font-size: 14px;
  }

  tr:hover { background: #e8e8ff; }

  .badge {
    display: inline-block;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: bold;
    border-radius: 2px;
    font-family: 'Tahoma', sans-serif;
  }

  .badge-available {
    background: #c6efce;
    color: #006100;
    border: 1px solid #006100;
  }

  .badge-used {
    background: #ffc7ce;
    color: #9c0006;
    border: 1px solid #9c0006;
  }

  .badge-permanent {
    background: #c6efce;
    color: #006100;
    border: 1px solid #006100;
  }

  .badge-expiring {
    background: #fff3cd;
    color: #856404;
    border: 1px solid #856404;
  }

  .badge-sent {
    background: #cce5ff;
    color: #004085;
    border: 1px solid #004085;
  }

  .sent-to {
    font-size: 9px;
    color: #666;
    display: block;
  }

  .stat-box .num.yellow { color: #856404; }

  .btn {
    font-family: 'Tahoma', sans-serif;
    font-size: 11px;
    padding: 3px 12px;
    background: var(--win-bg);
    border: 2px solid;
    border-color: var(--win-light) var(--win-darkest) var(--win-darkest) var(--win-light);
    cursor: pointer;
    outline-offset: -1px;
  }

  .btn:active {
    border-color: var(--win-darkest) var(--win-light) var(--win-light) var(--win-darkest);
  }

  .btn:disabled {
    color: var(--win-dark);
    cursor: default;
  }

  .btn-primary {
    font-weight: bold;
    outline: 1px solid #000;
    outline-offset: -4px;
  }

  .btn-danger {
    color: #cc0000;
    font-size: 9px;
    padding: 1px 5px;
    border-width: 1px;
  }

  .toolbar {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .toolbar label {
    font-size: 11px;
  }

  .toolbar select, .toolbar input[type="number"] {
    font-family: 'Tahoma', sans-serif;
    font-size: 11px;
    padding: 2px 4px;
    border: 2px solid;
    border-color: var(--win-dark) var(--win-light) var(--win-light) var(--win-dark);
    background: #fff;
    width: 50px;
  }

  .env-box {
    margin-top: 10px;
    background: #fff;
    border: 2px solid;
    border-color: var(--win-dark) var(--win-light) var(--win-light) var(--win-dark);
    padding: 6px;
  }

  .env-box summary {
    cursor: pointer;
    font-family: 'VT323', monospace;
    font-size: 14px;
    color: var(--title-blue);
  }

  .env-box pre {
    margin: 6px 0 0;
    font-size: 11px;
    font-family: 'Courier New', monospace;
    word-break: break-all;
    white-space: pre-wrap;
    background: #ffffcc;
    padding: 4px;
    border: 1px solid #ccc;
    user-select: all;
  }

  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--title-blue);
    color: #fff;
    padding: 6px 16px;
    font-family: 'VT323', monospace;
    font-size: 16px;
    border: 2px solid;
    border-color: var(--win-light) var(--win-darkest) var(--win-darkest) var(--win-light);
    display: none;
    z-index: 999;
  }

  .toast.show { display: block; }

  .note {
    margin-top: 8px;
    padding: 4px 6px;
    background: #ffffcc;
    border: 1px solid #ccc;
    font-size: 10px;
    color: #666;
  }

  .loading {
    text-align: center;
    padding: 20px;
    font-family: 'VT323', monospace;
    font-size: 16px;
    color: #666;
  }
</style>
</head>
<body>
<div class="window">
  <div class="title-bar">
    <div class="title-bar-icon">&#9834;</div>
    Navidrome Jam — Invite Code Admin
  </div>
  <div class="window-body">
    <div class="stats">
      <div class="stat-box"><div class="num blue" id="stat-total">-</div><div class="label">Total</div></div>
      <div class="stat-box"><div class="num green" id="stat-avail">-</div><div class="label">Available</div></div>
      <div class="stat-box"><div class="num" style="color:#004085" id="stat-sent">-</div><div class="label">Sent</div></div>
      <div class="stat-box"><div class="num red" id="stat-used">-</div><div class="label">Used</div></div>
    </div>

    <div class="toolbar">
      <label>Generate</label>
      <input type="number" id="gen-count" value="5" min="1" max="20">
      <button class="btn btn-primary" id="btn-generate" onclick="generateCodes()">Generate Codes</button>
      <span style="flex:1"></span>
      <button class="btn" style="background:#c00;color:#fff;border-color:#900" onclick="purgeUnusedCodes()">Purge Unused</button>
      <button class="btn" onclick="copyEnvVar()">Copy INVITE_CODES</button>
    </div>

    <div id="codes-table">
      <div class="loading">Loading codes...</div>
    </div>

    <details class="env-box">
      <summary>INVITE_CODES env var (for Railway)</summary>
      <pre id="env-var">Loading...</pre>
      <div class="note">Copy this value and paste it into your Railway environment variables to persist codes across deploys.</div>
    </details>

    <div class="note">
      &#9888; Codes are stored in memory. Runtime-generated codes will be lost on server restart.
      Copy the INVITE_CODES env var above and update Railway to persist them.
    </div>
  </div>
</div>

<div class="window">
  <div class="title-bar">
    <div class="title-bar-icon">&#9993;</div>
    Waitlist
  </div>
  <div class="window-body">
    <div class="stats">
      <div class="stat-box"><div class="num blue" id="wl-stat-total">-</div><div class="label">Waiting</div></div>
    </div>

    <div class="toolbar">
      <button class="btn" onclick="fetchWaitlist()">Refresh</button>
      <span style="flex:1"></span>
      <span id="resend-status" style="font-size:10px;color:#666"></span>
    </div>

    <div id="waitlist-table">
      <div class="loading">Loading waitlist...</div>
    </div>
  </div>
</div>

<div class="window">
  <div class="title-bar">
    <div class="title-bar-icon">&#128190;</div>
    Uploaded Tracks
  </div>
  <div class="window-body">
    <div class="stats">
      <div class="stat-box"><div class="num blue" id="upl-stat-total">-</div><div class="label">Total</div></div>
      <div class="stat-box"><div class="num green" id="upl-stat-permanent">-</div><div class="label">Permanent</div></div>
      <div class="stat-box"><div class="num red" id="upl-stat-liked">-</div><div class="label">Liked</div></div>
      <div class="stat-box"><div class="num yellow" id="upl-stat-expiring">-</div><div class="label">Expiring &lt;7d</div></div>
    </div>

    <div class="toolbar">
      <button class="btn" onclick="fetchUploads()">Refresh</button>
      <span style="flex:1"></span>
      <button class="btn btn-danger" style="font-size:11px;padding:3px 8px" onclick="deleteAllExpired()">Delete All Expired</button>
    </div>

    <div id="uploads-table">
      <div class="loading">Loading uploads...</div>
    </div>

    <div class="note">
      &#128197; Non-permanent files are auto-deleted after 30 days unless liked. Permanent quota: 50 per user.
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const API_KEY = ${JSON.stringify(adminKey)};
const API_BASE = window.location.origin;

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

async function fetchCodes() {
  try {
    const r = await fetch(API_BASE + '/api/admin/codes?key=' + encodeURIComponent(API_KEY));
    if (!r.ok) throw new Error('Failed to fetch');
    const data = await r.json();
    renderCodes(data);
  } catch (e) {
    document.getElementById('codes-table').innerHTML = '<div class="loading" style="color:red">Error loading codes</div>';
  }
}

function renderCodes(data) {
  document.getElementById('stat-total').textContent = data.total;
  document.getElementById('stat-avail').textContent = data.available;
  document.getElementById('stat-sent').textContent = data.sent || 0;
  document.getElementById('stat-used').textContent = data.total - data.available - (data.sent || 0);

  // Sort: available first, then sent, then used
  const order = { available: 0, sent: 1, used: 2 };
  const sorted = [...data.codes].sort((a, b) => {
    if (a.status !== b.status) return (order[a.status] || 9) - (order[b.status] || 9);
    return a.code.localeCompare(b.code);
  });

  let html = '<table><tr><th>Code</th><th>Status</th><th>Details</th><th></th></tr>';
  for (const c of sorted) {
    let badge, details;
    if (c.status === 'used') {
      badge = '<span class="badge badge-used">USED</span>';
      details = c.usedBy ? esc(c.usedBy) : '—';
    } else if (c.status === 'sent') {
      badge = '<span class="badge badge-sent">SENT</span>';
      details = c.sentTo ? esc(c.sentTo.email) + (c.sentTo.name ? '<span class="sent-to">' + esc(c.sentTo.name) + '</span>' : '') : '—';
    } else {
      badge = '<span class="badge badge-available">AVAILABLE</span>';
      details = '—';
    }
    html += '<tr>'
      + '<td style="font-weight:bold">' + esc(c.code) + '</td>'
      + '<td>' + badge + '</td>'
      + '<td>' + details + '</td>'
      + '<td><button class="btn btn-danger" onclick="deleteCode(\\''+esc(c.code)+'\\')">del</button></td>'
      + '</tr>';
  }
  html += '</table>';
  document.getElementById('codes-table').innerHTML = html;

  // Update env var display
  const allCodes = data.codes.map(c => c.code).join(',');
  document.getElementById('env-var').textContent = allCodes;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function generateCodes() {
  const count = parseInt(document.getElementById('gen-count').value) || 5;
  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  btn.textContent = 'Generating...';

  try {
    const r = await fetch(API_BASE + '/api/admin/generate-codes?key=' + encodeURIComponent(API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count })
    });
    if (!r.ok) throw new Error('Failed');
    const data = await r.json();
    showToast('Generated ' + data.generated.length + ' new codes');
    fetchCodes();
  } catch (e) {
    showToast('Error generating codes');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Codes';
  }
}

async function deleteCode(code) {
  if (!confirm('Delete code ' + code + '?')) return;
  try {
    const r = await fetch(API_BASE + '/api/admin/codes/' + encodeURIComponent(code) + '?key=' + encodeURIComponent(API_KEY), {
      method: 'DELETE'
    });
    if (!r.ok) throw new Error('Failed');
    showToast('Deleted ' + code);
    fetchCodes();
  } catch (e) {
    showToast('Error deleting code');
  }
}

async function purgeUnusedCodes() {
  if (!confirm('Delete ALL unused codes? Used and sent codes will be kept. This cannot be undone.')) return;
  try {
    const r = await fetch(API_BASE + '/api/admin/codes?key=' + encodeURIComponent(API_KEY), {
      method: 'DELETE'
    });
    if (!r.ok) throw new Error('Failed');
    const data = await r.json();
    showToast('Purged ' + data.purged + ' unused codes');
    fetchCodes();
  } catch (e) {
    showToast('Error purging codes');
  }
}

async function copyEnvVar() {
  const text = document.getElementById('env-var').textContent;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  } catch {
    // Fallback: select the text
    const pre = document.getElementById('env-var');
    const range = document.createRange();
    range.selectNodeContents(pre);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    showToast('Select and copy manually');
  }
}

// --- Uploads ---

let uploadsData = [];

async function fetchUploads() {
  try {
    const r = await fetch(API_BASE + '/api/admin/uploads?key=' + encodeURIComponent(API_KEY));
    if (!r.ok) throw new Error('Failed to fetch');
    const data = await r.json();
    uploadsData = data.uploads || [];
    renderUploads(uploadsData);
  } catch (e) {
    document.getElementById('uploads-table').innerHTML = '<div class="loading" style="color:red">Error loading uploads</div>';
  }
}

function renderUploads(uploads) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  const total = uploads.length;
  const permanent = uploads.filter(u => u.permanent).length;
  const liked = uploads.filter(u => (u.likes || 0) > 0).length;
  const expiring = uploads.filter(u => {
    if (u.permanent) return false;
    if ((u.likes || 0) > 0) return false;
    const age = now - new Date(u.uploadedAt).getTime();
    return age > (thirtyDays - sevenDays);
  }).length;

  document.getElementById('upl-stat-total').textContent = total;
  document.getElementById('upl-stat-permanent').textContent = permanent;
  document.getElementById('upl-stat-liked').textContent = liked;
  document.getElementById('upl-stat-expiring').textContent = expiring;

  if (total === 0) {
    document.getElementById('uploads-table').innerHTML = '<div class="loading">No uploaded tracks yet</div>';
    return;
  }

  // Sort: expiring soon first, then liked, then permanent; within each group by date (newest first)
  function sortPriority(u) {
    if (u.permanent) return 2;
    if ((u.likes || 0) > 0) return 1;
    return 0;
  }
  const sorted = [...uploads].sort((a, b) => {
    const pa = sortPriority(a), pb = sortPriority(b);
    if (pa !== pb) return pa - pb;
    return new Date(b.uploadedAt) - new Date(a.uploadedAt);
  });

  let html = '<table><tr><th>File</th><th>User</th><th>Date</th><th>Likes</th><th>Status</th><th></th></tr>';
  for (const u of sorted) {
    const age = now - new Date(u.uploadedAt).getTime();
    const daysLeft = Math.max(0, Math.ceil((thirtyDays - age) / (24 * 60 * 60 * 1000)));
    const dateStr = new Date(u.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    let badge;
    if (u.permanent) {
      badge = '<span class="badge badge-permanent">PERMANENT</span>';
    } else if ((u.likes || 0) > 0) {
      badge = '<span class="badge badge-permanent">LIKED</span>';
    } else if (daysLeft <= 7) {
      badge = '<span class="badge badge-expiring">' + daysLeft + 'd left</span>';
    } else {
      badge = '<span class="badge badge-available">' + daysLeft + 'd left</span>';
    }

    const permBtn = u.permanent
      ? '<button class="btn btn-danger" style="font-size:9px" onclick="toggleUploadPermanent(\\'' + esc(u.username) + '\\',\\'' + esc(u.filename) + '\\', false)">unpin</button>'
      : '<button class="btn" style="font-size:9px;padding:1px 5px" onclick="toggleUploadPermanent(\\'' + esc(u.username) + '\\',\\'' + esc(u.filename) + '\\', true)">pin</button>';

    const likes = u.likes || 0;
    const likesCell = likes > 0 ? '<span style="color:#cc0000;font-weight:bold">' + likes + '</span>' : '—';

    html += '<tr>'
      + '<td title="' + esc(u.filename) + '">' + esc(u.filename.length > 25 ? u.filename.substring(0, 22) + '...' : u.filename) + '</td>'
      + '<td>' + esc(u.username) + '</td>'
      + '<td>' + dateStr + '</td>'
      + '<td style="text-align:center">' + likesCell + '</td>'
      + '<td>' + badge + '</td>'
      + '<td style="white-space:nowrap">' + permBtn + ' <button class="btn btn-danger" onclick="deleteUpload(\\'' + esc(u.username) + '\\',\\'' + esc(u.filename) + '\\')">del</button></td>'
      + '</tr>';
  }
  html += '</table>';
  document.getElementById('uploads-table').innerHTML = html;
}

async function toggleUploadPermanent(username, filename, permanent) {
  try {
    const r = await fetch(
      API_BASE + '/api/admin/uploads/' + encodeURIComponent(username) + '/' + encodeURIComponent(filename) + '/permanent?key=' + encodeURIComponent(API_KEY),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permanent }) }
    );
    if (!r.ok) throw new Error('Failed');
    showToast(permanent ? 'Pinned ' + filename : 'Unpinned ' + filename);
    fetchUploads();
  } catch (e) {
    showToast('Error updating permanent flag');
  }
}

async function deleteUpload(username, filename) {
  if (!confirm('Delete ' + username + '/' + filename + '?')) return;
  try {
    const r = await fetch(
      API_BASE + '/api/admin/uploads/' + encodeURIComponent(username) + '/' + encodeURIComponent(filename) + '?key=' + encodeURIComponent(API_KEY),
      { method: 'DELETE' }
    );
    if (!r.ok) throw new Error('Failed');
    showToast('Deleted ' + filename);
    fetchUploads();
  } catch (e) {
    showToast('Error deleting upload');
  }
}

async function deleteAllExpired() {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const expired = uploadsData.filter(u => !u.permanent && !(u.likes > 0) && (now - new Date(u.uploadedAt).getTime()) > thirtyDays);

  if (expired.length === 0) {
    showToast('No expired uploads to delete');
    return;
  }

  if (!confirm('Delete ' + expired.length + ' expired upload(s)?')) return;

  let deleted = 0;
  for (const u of expired) {
    try {
      const r = await fetch(
        API_BASE + '/api/admin/uploads/' + encodeURIComponent(u.username) + '/' + encodeURIComponent(u.filename) + '?key=' + encodeURIComponent(API_KEY),
        { method: 'DELETE' }
      );
      if (r.ok) deleted++;
    } catch {}
  }

  showToast('Deleted ' + deleted + ' expired upload(s)');
  fetchUploads();
}

// --- Waitlist ---

async function fetchWaitlist() {
  try {
    const r = await fetch(API_BASE + '/api/admin/waitlist?key=' + encodeURIComponent(API_KEY));
    if (!r.ok) throw new Error('Failed to fetch');
    const data = await r.json();
    renderWaitlist(data);
  } catch (e) {
    document.getElementById('waitlist-table').innerHTML = '<div class="loading" style="color:red">Error loading waitlist</div>';
  }
}

function renderWaitlist(data) {
  document.getElementById('wl-stat-total').textContent = data.total;

  if (data.total === 0) {
    document.getElementById('waitlist-table').innerHTML = '<div class="loading">No one on the waitlist</div>';
    return;
  }

  // Sort by date (oldest first — they've been waiting longest)
  const sorted = [...data.waitlist].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  let html = '<table><tr><th>#</th><th>Name</th><th>Email</th><th>Message</th><th>Date</th><th></th></tr>';
  sorted.forEach((entry, i) => {
    const dateStr = new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    html += '<tr>'
      + '<td>' + (i + 1) + '</td>'
      + '<td>' + esc(entry.name) + '</td>'
      + '<td>' + esc(entry.email) + '</td>'
      + '<td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(entry.message || '') + '">' + esc(entry.message || '—') + '</td>'
      + '<td>' + dateStr + '</td>'
      + '<td><button class="btn btn-primary" id="send-' + i + '" onclick="sendCode(\\'' + esc(entry.email) + '\\',\\'' + esc(entry.name) + '\\',' + i + ')">Send Code &#9993;</button></td>'
      + '</tr>';
  });
  html += '</table>';
  document.getElementById('waitlist-table').innerHTML = html;
}

async function sendCode(email, name, idx) {
  const btn = document.getElementById('send-' + idx);
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const r = await fetch(API_BASE + '/api/admin/send-code?key=' + encodeURIComponent(API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed');
    showToast('Sent ' + data.code + ' to ' + email);
    fetchWaitlist();
    fetchCodes();
  } catch (e) {
    showToast('Error: ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Send Code \\u2709';
  }
}

fetchCodes();
fetchUploads();
fetchWaitlist();

// Check if Resend email is configured (probe with empty body — 503 = not configured, 400 = ready)
fetch(API_BASE + '/api/admin/send-code?key=' + encodeURIComponent(API_KEY), { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' })
  .then(r => r.json().then(d => {
    const el = document.getElementById('resend-status');
    if (r.status === 503) {
      el.innerHTML = '<span style="color:red">&#9888; ' + esc(d.error) + '</span>';
    } else {
      el.innerHTML = '<span style="color:green">&#10003; Email ready</span>';
    }
  }))
  .catch(() => {});
</script>
</body>
</html>`;
}

// --- Admin upload endpoints ---

// GET /api/admin/uploads — list all uploads
app.get('/api/admin/uploads', async (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  if (!sftpUploader.isConfigured()) {
    return res.status(503).json({ error: 'Uploads are not configured' });
  }

  try {
    const uploads = await sftpUploader.listAllUploads();
    res.json({ uploads });
  } catch (error) {
    console.error('Error listing all uploads:', error);
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

// DELETE /api/admin/uploads/:username/:filename — delete any file
app.delete('/api/admin/uploads/:username/:filename', async (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  if (!sftpUploader.isConfigured()) {
    return res.status(503).json({ error: 'Uploads are not configured' });
  }

  const { username, filename } = req.params;

  try {
    await sftpUploader.deleteUpload(username, filename);
    res.json({ deleted: `${username}/${filename}` });
  } catch (error) {
    console.error('Error deleting upload:', error);
    res.status(500).json({ error: 'Failed to delete upload' });
  }
});

// POST /api/admin/uploads/:username/:filename/permanent — override permanent flag
app.post('/api/admin/uploads/:username/:filename/permanent', async (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  if (!sftpUploader.isConfigured()) {
    return res.status(503).json({ error: 'Uploads are not configured' });
  }

  const { username, filename } = req.params;
  const { permanent } = req.body;

  try {
    const result = await sftpUploader.setPermanent(username, filename, !!permanent);
    res.json({ username, filename, permanent: result });
  } catch (error) {
    console.error('Error setting permanent flag:', error);
    if (error.message === 'Upload not found') {
      return res.status(404).json({ error: 'Upload not found' });
    }
    res.status(500).json({ error: 'Failed to update permanent flag' });
  }
});

// Serialize room for JSON transport (converts Sets to arrays)
function serializeRoom(room) {
  if (!room) return room;
  return { ...room, pawHolders: Array.from(room.pawHolders) };
}

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.data.roomId = null;
  socket.data.userId = null;

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
      if (socket.data.roomId) {
        socket.leave(socket.data.roomId);
        roomManager.removeUser(socket.data.roomId, socket.data.userId);
      }

      // Join new room
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.userId = userId;

      const user = roomManager.addUser(roomId, {
        id: userId,
        socketId: socket.id,
        username: sanitizedUsername,
        joinedAt: Date.now()
      });

      // Send current room state to the joining user
      const currentRoom = roomManager.getRoom(roomId);
      socket.emit('room-state', { room: serializeRoom(currentRoom) });

      // If there's an active track, send sync so the player starts playback
      if (currentRoom.playbackState.trackId) {
        socket.emit('sync', currentRoom.playbackState);

        // Send existing reactions for the current track
        const counts = roomManager.getReactionCounts(roomId, currentRoom.playbackState.trackId);
        if (counts.likes > 0 || counts.dislikes > 0) {
          socket.emit('track-reactions', {
            trackId: currentRoom.playbackState.trackId,
            ...counts
          });
        }
      }

      // Notify others in the room
      socket.to(roomId).emit('user-joined', {
        user,
        room: serializeRoom(currentRoom)
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
      if (!room || !roomManager.canControl(roomId, socket.data.userId)) {
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
      if (!room || !roomManager.canControl(roomId, socket.data.userId)) {
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
      if (!room || !roomManager.canControl(roomId, socket.data.userId)) {
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
      if (!room || !roomManager.canControl(roomId, socket.data.userId)) {
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
      if (!room || room.hostId !== socket.data.userId) {
        socket.emit('error', { message: 'Unauthorized: Only host can promote co-hosts' });
        return;
      }

      if (!userId || typeof userId !== 'string' || userId.length > 50) {
        socket.emit('error', { message: 'Invalid user ID' });
        return;
      }

      // Can't promote yourself or someone not in the room
      if (userId === socket.data.userId) return;
      if (!room.users.find(u => u.id === userId)) {
        socket.emit('error', { message: 'User not found in room' });
        return;
      }

      roomManager.addCoHost(roomId, userId);
      io.to(roomId).emit('cohost-updated', { room: serializeRoom(roomManager.getRoom(roomId)) });
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
      if (!room || room.hostId !== socket.data.userId) {
        socket.emit('error', { message: 'Unauthorized: Only host can demote co-hosts' });
        return;
      }

      if (!userId || typeof userId !== 'string') return;

      roomManager.removeCoHost(roomId, userId);
      io.to(roomId).emit('cohost-updated', { room: serializeRoom(roomManager.getRoom(roomId)) });
      console.log(`Room ${roomId}: ${userId} demoted from co-host`);
    } catch (error) {
      console.error('Error demoting co-host:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Update room community (host only)
  socket.on('update-community', ({ roomId, community }) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room || room.hostId !== socket.data.userId) {
        socket.emit('error', { message: 'Unauthorized: Only host can change community' });
        return;
      }
      const sanitized = community ? sanitizeString(community, 50) : null;
      room.community = sanitized;
      io.to(roomId).emit('room-state', { room: serializeRoom(room) });
      console.log(`Room ${roomId}: community changed to ${sanitized || '(none)'}`);
    } catch (error) {
      console.error('Error updating community:', error);
      socket.emit('error', { message: error.message });
    }
  });

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

      const { previous } = roomManager.setReaction(roomId, trackId, socket.data.userId, 'like');
      const counts = roomManager.getReactionCounts(roomId, trackId);
      io.to(roomId).emit('track-reactions', { trackId, ...counts });

      // Track likes on uploaded files (fire-and-forget)
      if (previous !== 'like') {
        updateUploadLikes(trackId, 1).catch(err =>
          console.error('Error tracking upload like:', err)
        );
      }
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

      const { previous } = roomManager.setReaction(roomId, trackId, socket.data.userId, 'dislike');
      const counts = roomManager.getReactionCounts(roomId, trackId);
      io.to(roomId).emit('track-reactions', { trackId, ...counts });

      // If switching from like to dislike, decrement upload likes
      if (previous === 'like') {
        updateUploadLikes(trackId, -1).catch(err =>
          console.error('Error tracking upload unlike:', err)
        );
      }
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

      const { previous } = roomManager.removeReaction(roomId, trackId, socket.data.userId);
      const counts = roomManager.getReactionCounts(roomId, trackId);
      io.to(roomId).emit('track-reactions', { trackId, ...counts });

      // If removing a like, decrement upload likes
      if (previous === 'like') {
        updateUploadLikes(trackId, -1).catch(err =>
          console.error('Error tracking upload unlike:', err)
        );
      }
    } catch (error) {
      console.error('Error removing reaction:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Select a cat avatar
  socket.on('select-cat', ({ roomId, catId }) => {
    try {
      if (!socket.data.roomId || socket.data.roomId !== roomId) {
        socket.emit('error', { message: 'Not in this room' });
        return;
      }
      if (typeof catId !== 'number' || catId < 0 || catId > 8) {
        socket.emit('error', { message: 'Invalid cat ID' });
        return;
      }

      const selections = roomManager.selectCat(roomId, socket.data.userId, catId);
      io.to(roomId).emit('cat-updated', { catSelections: selections });
    } catch (error) {
      console.error('Error selecting cat:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Paw button hold
  socket.on('paw-hold', ({ roomId }) => {
    try {
      if (!socket.data.roomId || socket.data.roomId !== roomId) {
        socket.emit('error', { message: 'Not in this room' });
        return;
      }

      const holders = roomManager.setPawHold(roomId, socket.data.userId);
      io.to(roomId).emit('paw-state', { pawHolders: holders });
    } catch (error) {
      console.error('Error paw hold:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Paw button release
  socket.on('paw-release', ({ roomId }) => {
    try {
      if (!socket.data.roomId || socket.data.roomId !== roomId) {
        socket.emit('error', { message: 'Not in this room' });
        return;
      }

      const holders = roomManager.releasePaw(roomId, socket.data.userId);
      io.to(roomId).emit('paw-state', { pawHolders: holders });
    } catch (error) {
      console.error('Error paw release:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Leave room explicitly (without disconnecting)
  socket.on('leave-room', () => {
    if (socket.data.roomId && socket.data.userId) {
      try {
        const room = roomManager.getRoom(socket.data.roomId);
        const wasHost = room?.hostId === socket.data.userId;

        socket.leave(socket.data.roomId);
        roomManager.removeUser(socket.data.roomId, socket.data.userId);

        const updatedRoom = roomManager.getRoom(socket.data.roomId);

        if (updatedRoom) {
          // Notify others in the room
          io.to(socket.data.roomId).emit('user-left', {
            userId: socket.data.userId,
            room: serializeRoom(updatedRoom),
            newHost: wasHost ? updatedRoom.hostId : null
          });
        } else {
          console.log(`Room ${socket.data.roomId} deleted (empty)`);
        }

        console.log(`User ${socket.data.userId} left room ${socket.data.roomId}`);
        socket.data.roomId = null;
        socket.data.userId = null;
      } catch (error) {
        console.error('Error leaving room:', error);
      }
    }
  });

  // Heartbeat for presence tracking
  socket.on('heartbeat', ({ roomId, position }) => {
    try {
      roomManager.updateUserPosition(roomId, socket.data.userId, position);
    } catch (error) {
      // Silent fail - heartbeats are not critical
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    if (socket.data.roomId && socket.data.userId) {
      try {
        const room = roomManager.getRoom(socket.data.roomId);
        const wasHost = room?.hostId === socket.data.userId;

        roomManager.removeUser(socket.data.roomId, socket.data.userId);

        const updatedRoom = roomManager.getRoom(socket.data.roomId);

        if (updatedRoom) {
          // Notify others in the room
          io.to(socket.data.roomId).emit('user-left', {
            userId: socket.data.userId,
            room: serializeRoom(updatedRoom),
            newHost: wasHost ? updatedRoom.hostId : null
          });
        } else {
          // Room was deleted (no users left)
          console.log(`Room ${socket.data.roomId} deleted (empty)`);
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

// Schedule upload cleanup (every 24 hours) — delete non-permanent files older than 30 days
if (sftpUploader.isConfigured()) {
  // Run once on startup (after a short delay to let server stabilize)
  setTimeout(() => {
    sftpUploader.cleanupExpired().catch(err =>
      console.error('Upload cleanup error:', err)
    );
  }, 10000);

  // Then every 24 hours
  setInterval(() => {
    sftpUploader.cleanupExpired().catch(err =>
      console.error('Upload cleanup error:', err)
    );
  }, 24 * 60 * 60 * 1000);
}
