# Vercel Quick Start (5 Minutes)

Deploy to Vercel + Railway in under 5 minutes.

## Prerequisites

- GitHub account
- Vercel account (free)
- Railway account (free, $5/month credit)
- Navidrome instance URL

---

## Step 1: Deploy Server to Railway (2 min)

1. Go to [railway.app](https://railway.app) → Sign in with GitHub
2. **New Project** → **Deploy from GitHub repo**
3. Select: `zhiganov/navidrome-jam`
4. Railway detects config automatically ✅
5. **Add Variables:**
   ```
   PORT = 3001
   CLIENT_URL = https://jam.zhgnv.com
   NAVIDROME_URL = https://your-navidrome-url.com
   ```
6. **Deploy** → Copy your Railway URL
   - Example: `navidrome-jam-production.up.railway.app`

---

## Step 2: Deploy Client to Vercel (2 min)

1. Go to [vercel.com](https://vercel.com) → Sign in with GitHub
2. **Add New** → **Project** → Import `zhiganov/navidrome-jam`
3. **Settings:**
   - Framework Preset: **Vite**
   - Root Directory: (leave blank)
   - Build Command: `cd client && npm install && npm run build`
   - Output Directory: `client/dist`

4. **Environment Variables:**
   ```
   VITE_NAVIDROME_URL = https://your-navidrome-url.com
   VITE_JAM_SERVER_URL = https://your-railway-url.railway.app
   ```

5. **Deploy** ✅

---

## Step 3: Custom Domain (1 min)

### In Vercel:
1. Project → **Settings** → **Domains**
2. Add: `jam.zhgnv.com`

### In your DNS provider:
```
Type: CNAME
Name: jam
Value: cname.vercel-dns.com
```

Wait 1-5 minutes for DNS propagation.

---

## Done! 🎉

Visit: **https://jam.zhgnv.com**

Login with your Navidrome credentials and start jamming!

---

## Costs

- **Vercel**: Free forever
- **Railway**: $0-5/month (free $5 credit, unlikely to exceed)
- **Total**: ~$0-5/month

---

## Update Deployment

Just push to GitHub → Auto-deploys on both platforms! ✨

---

## Troubleshooting

### Can't connect to server
- Check Railway logs: `railway logs` (install CLI: `npm i -g @railway/cli`)
- Verify `VITE_JAM_SERVER_URL` matches Railway URL

### Can't login to Navidrome
- Check `VITE_NAVIDROME_URL` is correct
- Ensure Navidrome is publicly accessible

### Custom domain not working
- Wait 5 minutes for DNS propagation
- Check CNAME record is correct
- Verify in Vercel → Domains

---

## Alternative: Use Render (Free but slower)

Replace Railway with Render for 100% free hosting:

1. [render.com](https://render.com) → **New** → **Web Service**
2. Connect `zhiganov/navidrome-jam`
3. **Settings:**
   - Root Directory: `server`
   - Build: `npm install`
   - Start: `node src/index.js`
   - Plan: **Free**

**Note:** Render free tier has cold starts (15-30s delay after inactivity).

For best experience, stick with Railway.
