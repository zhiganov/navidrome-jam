# Quick Start Guide

Get Navidrome Jam running in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- A Navidrome instance (optional for testing sync server)

## 1. Install Dependencies

```bash
cd server
npm install
```

## 2. Configure Environment

```bash
cp .env.example .env
```

The default settings work for local testing:
- Server runs on port `3001`
- CORS allows all origins

## 3. Start the Sync Server

```bash
npm run dev
```

You should see:
```
Navidrome Jam sync server running on port 3001
```

## 4. Test with the HTML Client

Open `server/test-client.html` in **two different browser windows/tabs**:

```bash
# On Windows
start server/test-client.html

# On macOS
open server/test-client.html

# On Linux
xdg-open server/test-client.html
```

Or manually open: `file:///path/to/navidrome-jam/server/test-client.html`

## 5. Create a Jam Session

### In Browser Window 1 (Host):

1. Click **Connect**
2. Click **Create New Room** (note the Room ID, e.g., "A3F2E1")
3. Click **Join Room**
4. Click **Play** to start playback

### In Browser Window 2 (Guest):

1. Click **Connect**
2. Enter the **Room ID** from Window 1
3. Click **Join Room**
4. Watch as the playback state syncs!

## What to Test

- **Play/Pause** - Only the host can control, but everyone sees the sync
- **Seek** - Change the position and see it sync
- **User List** - See all connected users
- **Host Transfer** - Close Window 1, Window 2 becomes the new host
- **Heartbeat** - Watch the "Position" update for each user

## Troubleshooting

### "Connection failed"
- Make sure the server is running (`npm run dev`)
- Check the server URL is `http://localhost:3001`

### "Room not found"
- Create a room first using the REST API or "Create New Room" button
- Make sure the Room ID is correct (case-sensitive)

### "Unauthorized: Only host can control playback"
- Only the first user to join becomes the host
- Check if you're marked as "(Host)" in the user list

## Next Steps

Once you've verified the sync works:

1. **Connect to Navidrome** - Integrate authentication and streaming
2. **Build Web Client** - Create a proper UI for production use
3. **Test with FLAC files** - Stream real music from your Navidrome instance

---

## API Testing with curl

### Health Check
```bash
curl http://localhost:3001/health
```

### Create Room
```bash
curl -X POST http://localhost:3001/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"hostName": "MyName"}'
```

### Get Room Info
```bash
curl http://localhost:3001/api/rooms/YOUR_ROOM_ID
```

---

Ready to build the production client? See `server/README.md` for full API documentation.
