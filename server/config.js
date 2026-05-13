require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'default-dev-secret-change-in-production',
  jwtExpiresIn: '24h',
  auth: {
    username: process.env.AUTH_USERNAME || 'admin',
    passwordHash: process.env.AUTH_PASSWORD_HASH || '',
  },
  allowedDirs: (process.env.ALLOWED_DIRS || process.env.HOME).split(',').map(d => d.trim()),
  defaultWorkspace: process.env.DEFAULT_WORKSPACE || process.env.HOME,
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',
  rateLimit: {
    windowMs: 60 * 1000,
    max: 100,
  },
  loginRateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 5,
  },
  terminal: {
    maxTerminals: 5,
    idleTimeout: 30 * 60 * 1000,
  },
};
