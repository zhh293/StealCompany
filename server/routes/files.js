const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const auditLog = require('../services/auditLog');

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
      .map(e => {
        const fullPath = path.join(resolved, e.name);
        try {
          const stat = fs.statSync(fullPath);
          return {
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
            path: fullPath,
            size: e.isFile() ? stat.size : undefined,
            modified: stat.mtime.toISOString(),
          };
        } catch {
          return {
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
            path: fullPath,
          };
        }
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    res.json({ data: { path: resolved, items } });
  } catch (err) {
    res.status(500).json({ error: { code: 'FS_ERROR', message: err.message } });
  }
});

// 读取文件 — 支持分页
router.get('/files/read', (req, res) => {
  const filePath = req.query.path;
  const page = parseInt(req.query.page || '1');
  const pageSize = parseInt(req.query.pageSize || '500'); // 每页行数

  if (!filePath) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: '请提供文件路径' } });
  }

  if (!isPathAllowed(filePath)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权访问该路径' } });
  }

  try {
    const resolved = path.resolve(filePath);
    const stat = fs.statSync(resolved);

    if (stat.size > 50 * 1024 * 1024) {
      return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: '文件超过 50MB 限制' } });
    }

    const ext = path.extname(resolved).slice(1);
    const content = fs.readFileSync(resolved, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;
    const totalPages = Math.ceil(totalLines / pageSize);

    // 如果文件不大（< 5000 行），直接返回全部
    if (totalLines <= 5000 || !req.query.page) {
      auditLog.log({ user: req.user?.username, action: 'file_read', detail: resolved });
      return res.json({
        data: {
          path: resolved,
          content,
          extension: ext,
          size: stat.size,
          totalLines,
          totalPages: 1,
          currentPage: 1,
          paginated: false,
        },
      });
    }

    // 大文件分页
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, totalLines);
    const pageContent = lines.slice(start, end).join('\n');

    auditLog.log({ user: req.user?.username, action: 'file_read', detail: `${resolved} [page ${page}/${totalPages}]` });

    res.json({
      data: {
        path: resolved,
        content: pageContent,
        extension: ext,
        size: stat.size,
        totalLines,
        totalPages,
        currentPage: page,
        startLine: start + 1,
        endLine: end,
        paginated: true,
      },
    });
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
    auditLog.log({ user: req.user?.username, action: 'file_write', detail: resolved });
    res.json({ data: { path: resolved, success: true } });
  } catch (err) {
    res.status(500).json({ error: { code: 'FS_ERROR', message: err.message } });
  }
});

module.exports = router;
