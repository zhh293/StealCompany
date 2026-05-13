const express = require('express');
const catdesk = require('../services/catdesk');
const config = require('../config');

const router = express.Router();

router.get('/settings', (req, res) => {
  try {
    const settings = catdesk.getSettings();
    res.json({ data: settings });
  } catch (err) {
    res.status(500).json({ error: { code: 'CATDESK_ERROR', message: err.message } });
  }
});

router.get('/settings/workspace-dirs', (req, res) => {
  res.json({ data: { allowedDirs: config.allowedDirs, defaultWorkspace: config.defaultWorkspace } });
});

module.exports = router;
