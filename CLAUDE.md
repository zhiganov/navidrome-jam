# CLAUDE.md

**Navidrome Jam** — synchronized music playback for personal music libraries. Extension to Navidrome music server (Spotify Jam for FLAC).

**Critical:** Clients stream audio directly from Navidrome, NOT through the sync server. The sync server only broadcasts playback commands.

## Key Dependencies

**Server**: express, socket.io, express-rate-limit, cors, dotenv, busboy, ssh2-sftp-client, resend (ES modules, no TypeScript)

**Client**: react 19, socket.io-client, crypto-js (MD5 for Subsonic auth), vite 7, eslint

## Commands

### Server
```bash
cd server
npm install && npm run dev    # Dev with hot-reload (node --watch)
npm start                      # Production
```

Environment: Copy `.env.example` to `.env`. Note: `.env.example` is incomplete — see deployment section for all vars.

### Client
```bash
cd client
npm install && npm run dev    # Vite dev server (http://localhost:5173)
npm run build                  # Production build → dist/
npm run preview                # Preview production build
```

Environment: Copy `.env.example` to `.env` — needs `VITE_NAVIDROME_URL` and `VITE_JAM_SERVER_URL`.

### Testing
```bash
# Sync only (no Navidrome required):
cd server && npm run dev
# Open server/test-client.html in 2+ browser windows

# Full stack (requires Navidrome):
# Terminal 1: cd server && npm run dev
# Terminal 2: cd client && npm run dev
# Open http://localhost:5173 in 2+ browsers
```

### Linting
```bash
cd client && npm run lint                    # ESLint client
cd server && node --check src/index.js && node --check src/roomManager.js && node --check src/sftpUploader.js
cd client && npm run build                   # Verify production build
```

No automated tests — manual testing with test-client.html or full stack.

## Code Architecture

### Server (`server/src/`)
Three files: `index.js` (Express + Socket.io, REST endpoints, WebSocket handlers, admin panel), `roomManager.js` (room state with grace periods), `sftpUploader.js` (SFTP upload pipeline to PikaPods).

Key design: room state snapshots to Railway volume every 30s + SIGTERM, 5-min grace period for empty rooms, invite codes/waitlist/deleted codes persist to JSON on volume, `canControl()` authorization (host OR co-host), `trust proxy` for Railway.

### Client (`client/src/`)
Three screens in `App.jsx`: Login → Room Selection → Jam Session.

Service layer: `navidrome.js` (Subsonic API + MD5 auth), `jamClient.js` (Socket.io wrapper with custom event emitter), `NavidromeContext.jsx`/`JamContext.jsx` (create/destroy on mount/unmount — prevents duplicate listeners during Vite HMR).

**Visual theme**: Windows 98 / GeoCities. CSS variables (`--win-bg`, `--win-light`, `--win-dark`, `--titlebar-*`). Transport icons via CSS borders; repeat/like via SVG `mask-image` data URIs.

## Deployment

- **Client**: Vercel (auto-deploys on push to main) — https://jam.zhgnv.com
- **Server**: Railway (auto-deploys on push to main, root: `/server`) — https://navidrome-jam-production.up.railway.app
- **Navidrome**: PikaPods — https://airborne-unicorn.pikapod.net
- See: `VERCEL_QUICKSTART.md`, `DEPLOYMENT.md`

**Critical for WebSocket**: Sync server needs persistent connections → Railway, not Vercel Functions.

**CORS**: Socket.io accepts `CLIENT_URL` origins + any `*.vercel.app` (preview deploys).

### Environment Variables

Server `.env.example` is incomplete. Full list of production vars:
- `CLIENT_URL` — deployed client URL (CORS)
- `NAVIDROME_URL`, `NAVIDROME_ADMIN_USER`, `NAVIDROME_ADMIN_PASS` — for registration (if unset, registration disabled gracefully)
- `DATA_DIR` — Railway volume mount (`/data`)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — invite code emails
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` — waitlist notifications
- `RAILWAY_PUBLIC_DOMAIN` — action token URLs in Telegram messages
- `PIKAPODS_SFTP_HOST`, `PIKAPODS_SFTP_PORT`, `PIKAPODS_SFTP_USER`, `PIKAPODS_SFTP_PASS`, `PIKAPODS_MUSIC_PATH` — user uploads

## Admin Panel

Server-rendered Win98 HTML at `/admin?key=NAVIDROME_ADMIN_PASS`. Invite codes, waitlist, upload stats, server stats.

## Waitlist + Telegram Notifications

Users without invite codes join a waitlist. Admin gets Telegram notification with inline "Send Code" button — one-click to email invite and remove from waitlist. Uses one-time action tokens (GET endpoints, no webhook needed).

## Design Docs

Check `docs/plans/` before planning new features:
- `2026-02-15-room-settings-design.md` — Kick user + password protection
- `2026-02-15-queue-dnd-design.md` — Queue drag-and-drop reordering
- `2026-02-15-room-history-design.md` — Room history / session logs
- `2026-02-15-strategic-bets.md` — Federation vs Bandcamp strategy

## Branches

- `main` — production (auto-deploys)
- `feature/jam-with-boo` — Valentine's edition at boo.zhgnv.com (separate domain, kawaii avatars, comma-separated `CLIENT_URL` for multi-domain CORS)

## Reference

Read when working on internals: [Architecture](docs/architecture.md) — Navidrome API endpoints, sync protocol, WebSocket/API patterns, user uploads, persistence.
