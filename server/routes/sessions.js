const express = require('express');
const catdesk = require('../services/catdesk');

const router = express.Router();

// 获取会话列表（可选 ?workDir= 过滤）
router.get('/sessions', (req, res) => {
  try {
    const workDir = req.query.workDir || null;
    const sessions = catdesk.getSessions(workDir);
    res.json({ data: sessions });
  } catch (err) {
    res.status(500).json({ error: { code: 'SESSION_ERROR', message: err.message } });
  }
});

// 获取指定会话的消息记录
router.get('/sessions/:sessionId/messages', (req, res) => {
  try {
    const messages = catdesk.getMessages(req.params.sessionId);
    res.json({ data: messages });
  } catch (err) {
    res.status(500).json({ error: { code: 'SESSION_ERROR', message: err.message } });
  }
});

module.exports = router;
