# Deployment Guide

Deploy Navidrome Jam to your own server with HTTPS.

## Prerequisites

- A VPS/server (Ubuntu 20.04+ recommended)
- Domain name with DNS access (e.g., jam.zhgnv.com)
- Navidrome instance already running
- SSH access to your server

## Deployment Options

### Option 1: VPS Deployment (Recommended)

This guide assumes you have a VPS (DigitalOcean, Linode, Hetzner, etc.) running Ubuntu.

### Option 2: Docker Deployment

See [docker/README.md](./docker/README.md) for Docker deployment.

---

## VPS Deployment Steps

### 1. Server Setup

SSH into your server:
```bash
ssh user@your-server-ip
```

Install Node.js 18+:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Install nginx and certbot:
```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Install PM2 (process manager):
```bash
sudo npm install -g pm2
```

### 2. Clone Repository

```bash
cd /opt
sudo git clone https://github.com/zhiganov/navidrome-jam.git
sudo chown -R $USER:$USER navidrome-jam
cd navidrome-jam
```

### 3. Configure Environment

Server configuration:
```bash
cd server
npm install
cp .env.example .env
nano .env
```

Edit `.env`:
```env
PORT=3001
CLIENT_URL=https://jam.zhgnv.com
NAVIDROME_URL=http://localhost:4533  # Or your Navidrome URL
```

Client configuration:
```bash
cd ../client
npm install
cp .env.example .env
nano .env
```

Edit `.env`:
```env
VITE_NAVIDROME_URL=https://your-navidrome-url.com
VITE_JAM_SERVER_URL=https://jam.zhgnv.com
```

### 4. Build Client for Production

```bash
cd /opt/navidrome-jam/client
npm run build
```

This creates a `dist/` folder with optimized static files.

### 5. Configure PM2 (Process Manager)

Create PM2 ecosystem file:
```bash
cd /opt/navidrome-jam
nano ecosystem.config.cjs
```

Use the provided ecosystem.config.cjs file in the repo.

Start the server:
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Follow the instructions to enable auto-start
```

Check status:
```bash
pm2 status
pm2 logs jam-server
```

### 6. Configure Nginx

Create nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/navidrome-jam
```

Use the provided nginx configuration (see below).

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/navidrome-jam /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

### 7. Configure DNS

Add an A record for your subdomain:
```
Type: A
Name: jam (or your preferred subdomain)
Value: YOUR_SERVER_IP
TTL: 300
```

Wait for DNS propagation (can take up to 24 hours, usually <5 minutes).

### 8. Setup SSL with Let's Encrypt

```bash
sudo certbot --nginx -d jam.zhgnv.com
```

Follow the prompts. Certbot will automatically configure SSL and set up auto-renewal.

### 9. Test Deployment

Visit https://jam.zhgnv.com in your browser!

---

## Nginx Configuration

Create `/etc/nginx/sites-available/navidrome-jam`:

```nginx
# HTTP - Redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name jam.zhgnv.com;

    # Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS - Main site
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name jam.zhgnv.com;

    # SSL Configuration (Certbot will modify this)
    ssl_certificate /etc/letsencrypt/live/jam.zhgnv.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jam.zhgnv.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Client (React app) - Serve static files
    root /opt/navidrome-jam/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API - Proxy to Node.js server
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3001/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # WebSocket - Socket.io
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 86400;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;
}
```

---

## PM2 Ecosystem Configuration

Create `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: 'jam-server',
      cwd: '/opt/navidrome-jam/server',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: '/opt/navidrome-jam/logs/err.log',
      out_file: '/opt/navidrome-jam/logs/out.log',
      log_file: '/opt/navidrome-jam/logs/combined.log',
      time: true
    }
  ]
};
```

---

## Updating Deployment

When you push updates to the repo:

```bash
cd /opt/navidrome-jam
git pull

# Update server
cd server
npm install
pm2 restart jam-server

# Update client
cd ../client
npm install
npm run build
```

No nginx restart needed (static files are updated).

---

## Monitoring

### Check server status
```bash
pm2 status
pm2 logs jam-server
```

### Check nginx logs
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Check SSL certificate renewal
```bash
sudo certbot certificates
sudo certbot renew --dry-run  # Test renewal
```

---

## Troubleshooting

### "502 Bad Gateway"
- Check if PM2 server is running: `pm2 status`
- Check server logs: `pm2 logs jam-server`
- Ensure port 3001 is available: `sudo lsof -i :3001`

### WebSocket connection failed
- Check nginx WebSocket configuration
- Verify CORS settings in server `.env`
- Check browser console for errors

### SSL certificate issues
- Ensure DNS is properly configured
- Check firewall allows ports 80 and 443
- Run certbot with verbose: `sudo certbot --nginx -d jam.zhgnv.com -v`

### Client can't connect to Navidrome
- Verify `VITE_NAVIDROME_URL` in client `.env`
- Check CORS settings on Navidrome
- Ensure Navidrome is accessible from the internet

---

## Security Considerations

1. **Firewall**: Only open necessary ports (80, 443, 22)
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

2. **Rate Limiting**: Add to nginx config:
   ```nginx
   limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
   limit_req_zone $binary_remote_addr zone=socket:10m rate=30r/m;
   ```

3. **Keep Updated**:
   ```bash
   sudo apt-get update && sudo apt-get upgrade
   pm2 update
   ```

4. **Backup**: Regular backups of server configuration and logs

---

## Cost Estimate

- **VPS**: $5-10/month (DigitalOcean, Linode, Hetzner)
- **Domain**: Already owned (zhgnv.com)
- **SSL**: Free (Let's Encrypt)
- **Total**: ~$5-10/month

---

## Alternative: Deploy to Vercel (Client Only)

If you only want to host the client on Vercel and run the server elsewhere:

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Deploy client:
   ```bash
   cd client
   vercel --prod
   ```

3. Set environment variables in Vercel dashboard:
   - `VITE_NAVIDROME_URL`
   - `VITE_JAM_SERVER_URL`

Note: You still need to host the sync server on a VPS.

---

## Questions?

Open an issue on GitHub or check the [README.md](./README.md) for more info.
