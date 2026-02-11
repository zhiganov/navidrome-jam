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
const usedInviteCodes = new Map(); // code → username

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

    console.log(`User registered: ${username.trim()} (invite code used)`);
    res.status(201).json({ message: 'Account created successfully. You can now log in.' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
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

  const codes = [...validInviteCodes].map(code => ({
    code,
    status: usedInviteCodes.has(code) ? 'used' : 'available',
    usedBy: usedInviteCodes.get(code) || null
  }));

  res.json({ codes, total: codes.length, available: codes.filter(c => c.status === 'available').length });
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
  res.json({ deleted: code, total: validInviteCodes.size });
});

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
    justify-content: center;
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
      <div class="stat-box"><div class="num red" id="stat-used">-</div><div class="label">Used</div></div>
    </div>

    <div class="toolbar">
      <label>Generate</label>
      <input type="number" id="gen-count" value="5" min="1" max="20">
      <button class="btn btn-primary" id="btn-generate" onclick="generateCodes()">Generate Codes</button>
      <span style="flex:1"></span>
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
  document.getElementById('stat-used').textContent = data.total - data.available;

  // Sort: available first, then used
  const sorted = [...data.codes].sort((a, b) => {
    if (a.status === b.status) return a.code.localeCompare(b.code);
    return a.status === 'available' ? -1 : 1;
  });

  let html = '<table><tr><th>Code</th><th>Status</th><th>Used By</th><th></th></tr>';
  for (const c of sorted) {
    const badge = c.status === 'used'
      ? '<span class="badge badge-used">USED</span>'
      : '<span class="badge badge-available">AVAILABLE</span>';
    html += '<tr>'
      + '<td style="font-weight:bold">' + esc(c.code) + '</td>'
      + '<td>' + badge + '</td>'
      + '<td>' + (c.usedBy ? esc(c.usedBy) : '—') + '</td>'
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

fetchCodes();
</script>
</body>
</html>`;
}

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
      const currentRoom = roomManager.getRoom(roomId);
      socket.emit('room-state', { room: currentRoom });

      // If there's an active track, send sync so the player starts playback
      if (currentRoom.playbackState.trackId) {
        socket.emit('sync', currentRoom.playbackState);
      }

      // Notify others in the room
      socket.to(roomId).emit('user-joined', {
        user,
        room: currentRoom
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
