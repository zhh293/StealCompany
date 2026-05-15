const express = require('express');
const config = require('../config');
const fs = require('fs');
const path = require('path');
const permissionSettings = require('../services/permissionSettings');

const router = express.Router();

router.get('/settings', (req, res) => {
  try {
    const permSettings = permissionSettings.load();
    res.json({
      data: {
        allowedDirs: config.allowedDirs,
        defaultWorkspace: config.defaultWorkspace,
        permissionMode: permSettings.permissionMode,
      },
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'SETTINGS_ERROR', message: err.message } });
  }
});

// GET /api/settings/permission-mode — 获取当前权限模式
router.get('/settings/permission-mode', (req, res) => {
  try {
    const mode = permissionSettings.getPermissionMode();
    res.json({ data: { permissionMode: mode } });
  } catch (err) {
    res.status(500).json({ error: { code: 'SETTINGS_ERROR', message: err.message } });
  }
});

// POST /api/settings/permission-mode — 设置权限模式
router.post('/settings/permission-mode', (req, res) => {
  try {
    const { mode } = req.body;
    if (!mode) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: '请提供 mode 参数' } });
    }
    const result = permissionSettings.setPermissionMode(mode);
    res.json({ data: { permissionMode: result.permissionMode } });
  } catch (err) {
    res.status(400).json({ error: { code: 'INVALID_MODE', message: err.message } });
  }
});

router.get('/settings/workspace-dirs', (req, res) => {
  const dirs = new Set(config.allowedDirs);

  const claudeProjectsDir = path.join(process.env.HOME || '', '.claude', 'projects');
  try {
    if (fs.existsSync(claudeProjectsDir)) {
      const projectDirs = fs.readdirSync(claudeProjectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const dir of projectDirs) {
        const dirPath = path.join(claudeProjectsDir, dir.name);
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));

        if (files.length > 0) {
          const filePath = path.join(dirPath, files[0]);
          const fd = fs.openSync(filePath, 'r');
          const buf = Buffer.alloc(2048);
          const bytesRead = fs.readSync(fd, buf, 0, 2048, 0);
          fs.closeSync(fd);
          const text = buf.toString('utf-8', 0, bytesRead);
          const lines = text.split('\n');

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line);
              if (obj.cwd) {
                if (fs.existsSync(obj.cwd) && fs.statSync(obj.cwd).isDirectory()) {
                  dirs.add(obj.cwd);
                }
                break;
              }
            } catch (e) { /* skip */ }
          }
        }
      }
    }
  } catch (e) {}

  const sortedDirs = [...dirs].sort();

  res.json({
    data: {
      allowedDirs: sortedDirs,
      defaultWorkspace: config.defaultWorkspace,
    },
  });
});

module.exports = router;
