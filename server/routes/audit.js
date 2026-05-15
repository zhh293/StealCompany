const express = require('express');
const auditLog = require('../services/auditLog');

const router = express.Router();

// 获取审计日志
router.get('/audit/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100'), 500);
  const logs = auditLog.getRecent(limit);
  res.json({ data: logs });
});

module.exports = router;
