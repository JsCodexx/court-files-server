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
      },
      max_memory_restart: '512M',
      time: true,
      error_file: '/var/log/court-files-api/error.log',
      out_file: '/var/log/court-files-api/out.log',
      merge_logs: true,
    },
  ],
};
