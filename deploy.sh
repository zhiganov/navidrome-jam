#!/bin/bash

# Deployment script for Navidrome Jam
# Run this on your VPS after initial setup

set -e  # Exit on error

echo "🚀 Starting Navidrome Jam deployment..."

# Configuration
INSTALL_DIR="/opt/navidrome-jam"
SUBDOMAIN="jam.zhgnv.com"  # Change this to your subdomain

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on server
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}Error: $INSTALL_DIR not found. Please clone the repository first.${NC}"
    echo "Run: sudo git clone https://github.com/zhiganov/navidrome-jam.git $INSTALL_DIR"
    exit 1
fi

cd $INSTALL_DIR

# Pull latest changes
echo -e "${YELLOW}Pulling latest changes...${NC}"
git pull origin main

# Update server
echo -e "${YELLOW}Updating server dependencies...${NC}"
cd server
npm install --production

# Update client
echo -e "${YELLOW}Updating client dependencies...${NC}"
cd ../client
npm install

# Build client for production
echo -e "${YELLOW}Building client for production...${NC}"
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}Error: Client build failed. dist/ directory not found.${NC}"
    exit 1
fi

echo -e "${GREEN}Client built successfully!${NC}"

# Restart PM2 server
echo -e "${YELLOW}Restarting server...${NC}"
pm2 restart jam-server || echo -e "${YELLOW}Server not running, start it with: pm2 start ecosystem.config.cjs${NC}"

# Check server status
echo -e "${YELLOW}Checking server status...${NC}"
pm2 status

# Test nginx configuration
echo -e "${YELLOW}Testing nginx configuration...${NC}"
sudo nginx -t

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Nginx configuration valid!${NC}"

    # Reload nginx
    echo -e "${YELLOW}Reloading nginx...${NC}"
    sudo systemctl reload nginx
    echo -e "${GREEN}Nginx reloaded!${NC}"
else
    echo -e "${RED}Nginx configuration invalid. Please check the configuration.${NC}"
    exit 1
fi

# Display deployment info
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "🌐 Your site should be live at: https://$SUBDOMAIN"
echo "📊 Check server logs: pm2 logs jam-server"
echo "🔍 Check nginx logs: sudo tail -f /var/log/nginx/navidrome-jam-error.log"
echo ""
echo -e "${YELLOW}Note: If this is your first deployment, make sure to:${NC}"
echo "1. Configure DNS A record for $SUBDOMAIN"
echo "2. Run: sudo certbot --nginx -d $SUBDOMAIN"
echo "3. Configure server/.env and client/.env"
echo ""
