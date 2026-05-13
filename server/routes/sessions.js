const express = require('express');
const catdesk = require('../services/catdesk');

const router = express.Router();

router.get('/sessions', (req, res) => {
  try {
    const sessions = catdesk.getSessions();
    res.json({ data: sessions });
  } catch (err) {
    res.status(500).json({ error: { code: 'CATDESK_ERROR', message: err.message } });
  }
});

router.get('/sessions/current', (req, res) => {
  try {
    const current = catdesk.getCurrentSession();
    res.json({ data: current });
  } catch (err) {
    res.status(500).json({ error: { code: 'CATDESK_ERROR', message: err.message } });
  }
});

router.get('/sessions/:conversationId/messages', (req, res) => {
  try {
    const messages = catdesk.getMessages(req.params.conversationId);
    res.json({ data: messages });
  } catch (err) {
    res.status(500).json({ error: { code: 'CATDESK_ERROR', message: err.message } });
  }
});

module.exports = router;
