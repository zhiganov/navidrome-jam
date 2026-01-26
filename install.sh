#!/bin/bash

# Quick installation script for Navidrome Jam on Ubuntu/Debian VPS
# Run with: curl -fsSL https://raw.githubusercontent.com/zhiganov/navidrome-jam/main/install.sh | bash

set -e

echo "🎵 Navidrome Jam Installation Script"
echo "===================================="
echo ""

# Configuration
SUBDOMAIN=""
NAVIDROME_URL=""
INSTALL_DIR="/opt/navidrome-jam"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if root/sudo
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Please don't run as root. Run as regular user with sudo access.${NC}"
    exit 1
fi

# Check if Ubuntu/Debian
if [ ! -f /etc/debian_version ]; then
    echo -e "${RED}This script is designed for Ubuntu/Debian. Your OS may not be supported.${NC}"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Prompt for configuration
echo -e "${YELLOW}Please provide the following information:${NC}"
echo ""
read -p "Subdomain (e.g., jam.zhgnv.com): " SUBDOMAIN
read -p "Navidrome URL (e.g., https://music.zhgnv.com): " NAVIDROME_URL

if [ -z "$SUBDOMAIN" ] || [ -z "$NAVIDROME_URL" ]; then
    echo -e "${RED}Error: Subdomain and Navidrome URL are required.${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo "  Subdomain: $SUBDOMAIN"
echo "  Navidrome: $NAVIDROME_URL"
echo "  Install location: $INSTALL_DIR"
echo ""
read -p "Proceed with installation? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation cancelled."
    exit 1
fi

# Update system
echo -e "${YELLOW}Updating system packages...${NC}"
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 18
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Installing Node.js 18...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo -e "${GREEN}Node.js already installed: $(node --version)${NC}"
fi

# Install nginx
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}Installing nginx...${NC}"
    sudo apt-get install -y nginx
else
    echo -e "${GREEN}nginx already installed${NC}"
fi

# Install certbot
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}Installing certbot...${NC}"
    sudo apt-get install -y certbot python3-certbot-nginx
else
    echo -e "${GREEN}certbot already installed${NC}"
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}Installing PM2...${NC}"
    sudo npm install -g pm2
else
    echo -e "${GREEN}PM2 already installed${NC}"
fi

# Install git
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}Installing git...${NC}"
    sudo apt-get install -y git
fi

# Clone repository
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Cloning Navidrome Jam repository...${NC}"
    sudo git clone https://github.com/zhiganov/navidrome-jam.git $INSTALL_DIR
    sudo chown -R $USER:$USER $INSTALL_DIR
else
    echo -e "${YELLOW}Repository already exists, pulling latest changes...${NC}"
    cd $INSTALL_DIR
    git pull
fi

cd $INSTALL_DIR

# Create logs directory
mkdir -p logs

# Install server dependencies
echo -e "${YELLOW}Installing server dependencies...${NC}"
cd server
npm install --production

# Configure server
if [ ! -f .env ]; then
    echo -e "${YELLOW}Configuring server...${NC}"
    cp .env.example .env
    sed -i "s|CLIENT_URL=.*|CLIENT_URL=https://$SUBDOMAIN|g" .env
    sed -i "s|NAVIDROME_URL=.*|NAVIDROME_URL=$NAVIDROME_URL|g" .env
    echo -e "${GREEN}Server configured!${NC}"
else
    echo -e "${YELLOW}Server .env already exists. Please update manually if needed.${NC}"
fi

# Install client dependencies
echo -e "${YELLOW}Installing client dependencies...${NC}"
cd ../client
npm install

# Configure client
if [ ! -f .env ]; then
    echo -e "${YELLOW}Configuring client...${NC}"
    cp .env.example .env
    sed -i "s|VITE_NAVIDROME_URL=.*|VITE_NAVIDROME_URL=$NAVIDROME_URL|g" .env
    sed -i "s|VITE_JAM_SERVER_URL=.*|VITE_JAM_SERVER_URL=https://$SUBDOMAIN|g" .env
    echo -e "${GREEN}Client configured!${NC}"
else
    echo -e "${YELLOW}Client .env already exists. Please update manually if needed.${NC}"
fi

# Build client
echo -e "${YELLOW}Building client for production...${NC}"
npm run build

# Update ecosystem config
cd ..
sed -i "s|cwd: '.*'|cwd: '$INSTALL_DIR/server'|g" ecosystem.config.cjs
sed -i "s|error_file: '.*'|error_file: '$INSTALL_DIR/logs/err.log'|g" ecosystem.config.cjs
sed -i "s|out_file: '.*'|out_file: '$INSTALL_DIR/logs/out.log'|g" ecosystem.config.cjs
sed -i "s|log_file: '.*'|log_file: '$INSTALL_DIR/logs/combined.log'|g" ecosystem.config.cjs

# Start server with PM2
echo -e "${YELLOW}Starting server with PM2...${NC}"
pm2 start ecosystem.config.cjs
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME

# Configure nginx
echo -e "${YELLOW}Configuring nginx...${NC}"
sudo cp nginx.conf /etc/nginx/sites-available/navidrome-jam
sudo sed -i "s|server_name .*;|server_name $SUBDOMAIN;|g" /etc/nginx/sites-available/navidrome-jam
sudo sed -i "s|root .*;|root $INSTALL_DIR/client/dist;|g" /etc/nginx/sites-available/navidrome-jam

# Enable site
sudo ln -sf /etc/nginx/sites-available/navidrome-jam /etc/nginx/sites-enabled/

# Test nginx config
if sudo nginx -t; then
    echo -e "${GREEN}Nginx configuration valid!${NC}"
    sudo systemctl reload nginx
else
    echo -e "${RED}Nginx configuration invalid!${NC}"
    exit 1
fi

# Configure firewall (if ufw is installed)
if command -v ufw &> /dev/null; then
    echo -e "${YELLOW}Configuring firewall...${NC}"
    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw --force enable
    echo -e "${GREEN}Firewall configured!${NC}"
fi

# Display DNS instructions
echo ""
echo -e "${GREEN}✅ Installation complete!${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: Next steps:${NC}"
echo ""
echo "1. Configure DNS:"
echo "   Add an A record:"
echo "   Type: A"
echo "   Name: jam (or your subdomain)"
echo "   Value: $(curl -s ifconfig.me)"
echo "   TTL: 300"
echo ""
echo "2. Wait for DNS propagation (up to 5 minutes)"
echo ""
echo "3. Get SSL certificate:"
echo "   sudo certbot --nginx -d $SUBDOMAIN"
echo ""
echo "4. Visit your site:"
echo "   https://$SUBDOMAIN"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  pm2 status           - Check server status"
echo "  pm2 logs jam-server  - View server logs"
echo "  pm2 restart jam-server - Restart server"
echo "  cd $INSTALL_DIR && bash deploy.sh - Deploy updates"
echo ""
