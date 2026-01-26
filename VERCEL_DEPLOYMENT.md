# Vercel Deployment Guide

Deploy Navidrome Jam with Vercel (client) + Railway/Render (server).

## Why This Approach?

- ✅ **Vercel**: Perfect for React client (free, fast CDN, automatic HTTPS)
- ✅ **Railway/Render**: Supports long-lived WebSocket connections for sync server
- ❌ **Vercel Functions**: Don't support persistent WebSocket connections

## Architecture

```
┌──────────────────┐
│   Vercel (CDN)   │  ← React client at jam.zhgnv.com
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│   Navidrome      │  ← Your music server
└──────────────────┘

         ↓
┌──────────────────┐
│ Railway/Render   │  ← Sync server (WebSocket)
└──────────────────┘
```

---

## Option 1: Vercel + Railway (Recommended)

Railway has the best DX and generous free tier ($5/month credit).

### Step 1: Deploy Server to Railway

1. Go to [Railway.app](https://railway.app)
2. Sign in with GitHub
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Select `zhiganov/navidrome-jam`
5. Railway will auto-detect the configuration

**Configure Environment Variables:**
- `PORT`: `3001` (Railway auto-sets this)
- `CLIENT_URL`: `https://jam.zhgnv.com` (your Vercel domain)
- `NAVIDROME_URL`: Your Navidrome URL

6. Click **Deploy**
7. Copy your Railway URL (e.g., `navidrome-jam-production.up.railway.app`)

### Step 2: Deploy Client to Vercel

1. Go to [Vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click **"Add New"** → **"Project"**
4. Import `zhiganov/navidrome-jam`
5. **Configure:**
   - **Root Directory**: Leave blank (vercel.json handles this)
   - **Framework Preset**: Vite
   - **Build Command**: `cd client && npm install && npm run build`
   - **Output Directory**: `client/dist`

6. **Environment Variables:**
   - `VITE_NAVIDROME_URL`: Your Navidrome URL
   - `VITE_JAM_SERVER_URL`: Your Railway URL (e.g., `https://navidrome-jam-production.up.railway.app`)

7. Click **Deploy**

### Step 3: Custom Domain on Vercel

1. In Vercel project settings → **Domains**
2. Add: `jam.zhgnv.com`
3. Follow DNS instructions (add CNAME record)
4. Wait for SSL to provision (automatic)

### Step 4: Update Railway CORS

Go back to Railway → Environment Variables:
- Update `CLIENT_URL` to `https://jam.zhgnv.com`

**Done!** Visit https://jam.zhgnv.com

---

## Option 2: Vercel + Render

Render has a generous free tier but cold starts can be slow.

### Step 1: Deploy Server to Render

1. Go to [Render.com](https://render.com)
2. Sign in with GitHub
3. Click **"New"** → **"Web Service"**
4. Connect `zhiganov/navidrome-jam` repository
5. **Configure:**
   - **Name**: `navidrome-jam-server`
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/index.js`
   - **Plan**: Free

6. **Environment Variables:**
   - `NODE_ENV`: `production`
   - `PORT`: `3001`
   - `CLIENT_URL`: `https://jam.zhgnv.com`
   - `NAVIDROME_URL`: Your Navidrome URL

7. Click **Create Web Service**
8. Copy your Render URL (e.g., `navidrome-jam-server.onrender.com`)

### Step 2: Deploy Client to Vercel

Same as Option 1, but use your Render URL for `VITE_JAM_SERVER_URL`.

**Note:** Render free tier has cold starts (service sleeps after 15min inactivity). Consider upgrading to paid plan ($7/month) for production use.

---

## Option 3: Vercel + Fly.io

Fly.io is great for global low-latency but requires credit card.

### Step 1: Deploy Server to Fly.io

1. Install flyctl:
   ```bash
   # macOS/Linux
   curl -L https://fly.io/install.sh | sh

   # Windows
   pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. Login:
   ```bash
   flyctl auth login
   ```

3. Create Fly app:
   ```bash
   cd server
   flyctl launch
   ```

   Answer prompts:
   - **App name**: `navidrome-jam` (or your choice)
   - **Region**: Choose closest to you
   - **Database**: No
   - **Deploy**: Yes

4. Set environment variables:
   ```bash
   flyctl secrets set CLIENT_URL=https://jam.zhgnv.com
   flyctl secrets set NAVIDROME_URL=https://your-navidrome-url.com
   ```

5. Copy your Fly URL (e.g., `navidrome-jam.fly.dev`)

### Step 2: Deploy Client to Vercel

Same as Option 1, use Fly URL for `VITE_JAM_SERVER_URL`.

---

## Cost Comparison

| Option | Client | Server | Total/month |
|--------|--------|--------|-------------|
| **Vercel + Railway** | Free | $0-5 (free tier) | **$0-5** |
| **Vercel + Render** | Free | $0 (free with cold starts) | **$0** |
| **Vercel + Render Paid** | Free | $7 (no cold starts) | **$7** |
| **Vercel + Fly.io** | Free | $0-3 (auto-scale) | **$0-3** |
| **VPS (from before)** | - | $5-10 | **$5-10** |

---

## Updating Your Deployment

### Update Client (Vercel)
Push to GitHub → Vercel auto-deploys

### Update Server (Railway)
Push to GitHub → Railway auto-deploys

### Update Server (Render)
Push to GitHub → Render auto-deploys

### Update Server (Fly.io)
```bash
cd server
flyctl deploy
```

---

## Custom Domain Setup (zhgnv.com)

### For Vercel (Client)

In your DNS provider:
```
Type: CNAME
Name: jam
Value: cname.vercel-dns.com
TTL: 300
```

Then in Vercel dashboard:
1. Project → Settings → Domains
2. Add `jam.zhgnv.com`
3. Verify DNS and wait for SSL

### For Railway (Optional custom domain on server)

Railway supports custom domains on paid plan ($5/month):
1. Project → Settings → Domains
2. Add custom domain
3. Update DNS as instructed

**Note:** You don't need custom domain on server - you can use Railway's provided URL.

---

## Testing Your Deployment

1. Visit `https://jam.zhgnv.com`
2. Login with Navidrome credentials
3. Create a room
4. Open another browser/incognito window
5. Join the room with the code
6. Play music and verify sync!

---

## Troubleshooting

### "Cannot connect to sync server"

**Check Railway logs:**
```bash
# Install Railway CLI
npm i -g @railway/cli
railway login
railway logs
```

**Check Render logs:**
- Dashboard → Your service → Logs

**Check Fly.io logs:**
```bash
flyctl logs
```

### WebSocket connection failed

Verify:
1. Server is running (check platform logs)
2. `VITE_JAM_SERVER_URL` in Vercel matches your server URL
3. `CLIENT_URL` on server matches Vercel domain

### Cold starts on Render free tier

Render free tier sleeps after 15min inactivity. Solutions:
1. Upgrade to paid plan ($7/month)
2. Use Railway instead (no cold starts on free tier)
3. Use a service like UptimeRobot to ping every 10min

---

## Recommended Setup for Production

**Best: Vercel + Railway**
- ✅ No cold starts
- ✅ Auto-scaling
- ✅ Great DX
- ✅ $0-5/month
- ✅ Easy to manage

**Budget: Vercel + Render (Free)**
- ⚠️ Cold starts (15-30 second delay)
- ✅ Completely free
- ✅ Good for personal use

**Global: Vercel + Fly.io**
- ✅ Multi-region
- ✅ Low latency worldwide
- ✅ $0-3/month
- ⚠️ Requires credit card

---

## Next Steps

1. Choose your server platform (Railway recommended)
2. Deploy server first, get the URL
3. Deploy client to Vercel with server URL
4. Configure custom domain on Vercel
5. Test with friends!

---

## Questions?

Check the main [README.md](./README.md) or open an issue on GitHub.
