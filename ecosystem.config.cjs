// PM2 Ecosystem configuration for Navidrome Jam
// Usage:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup (follow instructions)

module.exports = {
  apps: [
    {
      name: 'jam-server',
      cwd: '/opt/navidrome-jam/server',  // Change this if installed elsewhere
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      error_file: '/opt/navidrome-jam/logs/err.log',
      out_file: '/opt/navidrome-jam/logs/out.log',
      log_file: '/opt/navidrome-jam/logs/combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
