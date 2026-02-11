# User Uploads for Navidrome Jam

**Date:** 2026-02-11
**Status:** Design complete, ready for implementation

## Problem

Navidrome Jam users need a way to upload their own music to play in jam sessions. The current approach (Dropbox shared folder synced via GitHub Actions cron) is broken (expired OAuth token), limited to trusted collaborators, and doesn't scale to open participation.

## Design Decisions

- **Storage:** Upload to Navidrome on PikaPods (reuse existing Subsonic streaming, no parallel streaming path)
- **Upload path:** Browser -> Jam server (Railway) -> SFTP to PikaPods -> Navidrome indexes automatically
- **Buffering:** Stream-through (pipe HTTP upload directly to SFTP, no temp files on Railway)
- **Access:** Registered users only (existing invite code system gates registration)
- **Persistence:** Tracks persist with 30-day cleanup; users and admin can flag tracks as permanent
- **File size limit:** 200 MB
- **Allowed formats:** .mp3, .flac, .ogg, .opus, .m4a, .wav, .aac

## Upload Flow

```
User's browser
  -> multipart upload to Jam server (POST /api/upload)
  -> Jam server validates (Subsonic auth, file type, size <= 200MB)
  -> streams directly to PikaPods via SFTP
  -> file lands in /music/jam-uploads/<username>/<filename>
  -> Navidrome auto-scans and indexes the track (~1 min)
  -> track appears in search, user adds to queue
```

## Server-Side Changes

### New dependency

`ssh2-sftp-client` - SFTP client for Node.js (no native bindings, works on Railway)

### New file: `server/src/sftpUploader.js`

SFTP connection management, stream-through upload, metadata read/write, cleanup logic.

Metadata stored as `/music/jam-uploads/.uploads-meta.json` on PikaPods:

```json
{
  "alex/song.flac": { "uploadedAt": "2026-02-11T...", "permanent": true },
  "bob/track.mp3": { "uploadedAt": "2026-02-11T...", "permanent": false }
}
```

### New env vars on Railway

| Variable | Purpose |
|----------|---------|
| `PIKAPODS_SFTP_HOST` | PikaPods SFTP hostname |
| `PIKAPODS_SFTP_PORT` | SFTP port |
| `PIKAPODS_SFTP_USER` | SFTP username |
| `PIKAPODS_SFTP_PASS` | SFTP password |
| `PIKAPODS_MUSIC_PATH` | Base music directory path |

### New API endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/upload` | Subsonic token | Upload a file (rate limit: 5/hr/user) |
| `GET /api/uploads/mine` | Subsonic token | List current user's uploads |
| `POST /api/uploads/:filename/permanent` | Subsonic token | Toggle permanent flag (own files, quota: 50) |
| `GET /api/admin/uploads` | Admin | List all uploads |
| `DELETE /api/admin/uploads/:username/:filename` | Admin | Delete any file |
| `POST /api/admin/uploads/:username/:filename/permanent` | Admin | Override permanent flag |

### Cleanup job

Runs on 24-hour interval + server startup. Connects via SFTP, reads metadata, deletes files where `permanent: false` and `uploadedAt > 30 days`. Logs results.

### Validation

- Subsonic auth verified via Navidrome ping before accepting upload
- File extension whitelist
- Content-Length <= 200MB
- Rate limit: 5 uploads per user per hour
- Duplicate filenames get numeric suffix

## Client-Side Changes

### Upload tab

New third tab in the browse/search panel: `[ Browse ] [ Search ] [ Upload ]`

Contents:
- File picker button (Win98-styled)
- Drag-and-drop zone (nice-to-have)
- Accepted formats hint
- Progress bar during upload (Win98-styled, using XMLHttpRequest for progress tracking)
- Success message with indexing delay note

### My Uploads section

Below the file picker in the Upload tab:
- List of current user's uploads (from `GET /api/uploads/mine`)
- Each entry: filename, upload date, permanent toggle
- Permanent toggle: Win98 checkbox with quota display ("Keep forever (12/50 used)")

### New jamClient.js methods

- `uploadTrack(file)` - multipart upload with progress callback
- `getMyUploads()` - fetch user's upload list
- `togglePermanent(filename)` - toggle permanent flag

### Client-side validation

- File extension check before upload
- File size check (200MB) with immediate error
- Auth token attached to upload request

## Admin Dashboard

New "Uploaded Tracks" section on existing `/admin` page:
- Stats: Total files / Permanent / Expiring soon (< 7 days)
- Table: filename, uploader, upload date, size, permanent, actions
- Actions: toggle permanent, delete now
- Bulk action: "Delete all expired"

## Implementation Order

1. SFTP uploader module (`server/src/sftpUploader.js`)
2. Server endpoints (upload, management, admin)
3. Cleanup job (24h interval)
4. Admin dashboard additions
5. Client upload UI (invoke `frontend-design` skill here)
6. Deploy & configure (SFTP env vars on Railway, end-to-end test)

## What Gets Retired

`navidrome-dropbox-sync` - the upload feature fully replaces it.

## Out of Scope (Future)

- Library separation (hiding uploaded tracks from personal Navidrome view)
- Navidrome scan trigger via API
- Audio format validation / transcoding
- Duplicate detection
