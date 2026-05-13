module.exports = {
  apps: [{
    name: 'catdesk-remote',
    script: 'server/index.js',
    env: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '500M',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
  }],
};
