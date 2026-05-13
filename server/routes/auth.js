const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { loginLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: '请提供用户名和密码' } });
    }

    if (username !== config.auth.username) {
      return res.status(401).json({ error: { code: 'AUTH_FAILED', message: '用户名或密码错误' } });
    }

    if (!config.auth.passwordHash) {
      return res.status(500).json({ error: { code: 'NOT_CONFIGURED', message: '请先运行 npm run create-user 配置密码' } });
    }

    const valid = await bcrypt.compare(password, config.auth.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: { code: 'AUTH_FAILED', message: '用户名或密码错误' } });
    }

    const token = jwt.sign({ sub: username, iat: Math.floor(Date.now() / 1000) }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.json({
      data: {
        token,
        expiresIn: config.jwtExpiresIn,
        username,
      },
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } });
  }
});

router.post('/refresh', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未提供令牌' } });
  }

  const oldToken = authHeader.slice(7);
  try {
    const decoded = jwt.verify(oldToken, config.jwtSecret, { ignoreExpiration: true });
    // 只允许过期不超过 7 天的 token 刷新
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && now - decoded.exp > 7 * 24 * 3600) {
      return res.status(401).json({ error: { code: 'TOKEN_EXPIRED', message: '令牌已过期太久，请重新登录' } });
    }

    const token = jwt.sign({ sub: decoded.sub, iat: now }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.json({ data: { token, expiresIn: config.jwtExpiresIn } });
  } catch (err) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: '令牌无效' } });
  }
});

module.exports = router;
