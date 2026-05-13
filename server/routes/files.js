const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const router = express.Router();

// 路径安全校验：确保路径在白名单目录内
function isPathAllowed(targetPath) {
  const resolved = path.resolve(targetPath);
  return config.allowedDirs.some(dir => resolved.startsWith(path.resolve(dir)));
}

router.get('/files/list', (req, res) => {
  const dirPath = req.query.path || config.defaultWorkspace;

  if (!isPathAllowed(dirPath)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权访问该路径' } });
  }

  try {
    const resolved = path.resolve(dirPath);
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
        path: path.join(resolved, e.name),
        size: e.isFile() ? fs.statSync(path.join(resolved, e.name)).size : undefined,
        modified: fs.statSync(path.join(resolved, e.name)).mtime.toISOString(),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    res.json({ data: { path: resolved, items } });
  } catch (err) {
    res.status(500).json({ error: { code: 'FS_ERROR', message: err.message } });
  }
});

router.get('/files/read', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: '请提供文件路径' } });
  }

  if (!isPathAllowed(filePath)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权访问该路径' } });
  }

  try {
    const resolved = path.resolve(filePath);
    const stat = fs.statSync(resolved);

    if (stat.size > 10 * 1024 * 1024) {
      return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: '文件超过 10MB 限制' } });
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    const ext = path.extname(resolved).slice(1);

    res.json({ data: { path: resolved, content, extension: ext, size: stat.size } });
  } catch (err) {
    res.status(500).json({ error: { code: 'FS_ERROR', message: err.message } });
  }
});

router.put('/files/write', (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: '请提供文件路径和内容' } });
  }

  if (!isPathAllowed(filePath)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权访问该路径' } });
  }

  try {
    const resolved = path.resolve(filePath);
    fs.writeFileSync(resolved, content, 'utf-8');
    res.json({ data: { path: resolved, success: true } });
  } catch (err) {
    res.status(500).json({ error: { code: 'FS_ERROR', message: err.message } });
  }
});

module.exports = router;
