/**
 * PM2 process file for Court Files API on EC2.
 * Usage: pm2 startOrReload ecosystem.config.cjs --env production
 */
module.exports = {
  apps: [
    {
      name: 'court-files-api',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5500,
        // Public URLs (not secrets) — PM2 injects these; dotenv will not override them.
        CORS_ORIGIN: 'https://clerkdiary.com,https://www.clerkdiary.com',
        FRONTEND_URL: 'https://clerkdiary.com',
        API_PUBLIC_URL: 'https://api.clerkdiary.com',
      },
      max_memory_restart: '512M',
      time: true,
      error_file: '/var/log/court-files-api/error.log',
      out_file: '/var/log/court-files-api/out.log',
      merge_logs: true,
    },
  ],
};
