const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('../config');
const auditLog = require('../services/auditLog');

const router = express.Router();

// 当前会话工作区（全局状态，多用户场景下可改为 per-session）
let currentWorkspace = config.defaultWorkspace;

// 历史工作区记录文件
const HISTORY_FILE = path.join(os.homedir(), '.catdesk-workspace-history.json');

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  } catch (e) {}
}

function addToHistory(dirPath) {
  let history = loadHistory();
  // 移除已有记录（去重）
  history = history.filter(h => h.path !== dirPath);
  // 添加到最前面
  history.unshift({ path: dirPath, timestamp: new Date().toISOString() });
  // 最多保留 20 条
  history = history.slice(0, 20);
  saveHistory(history);
  return history;
}

// GET /api/workspace — 获取当前工作区信息
router.get('/workspace', (req, res) => {
  res.json({
    data: {
      current: currentWorkspace,
      history: loadHistory(),
    },
  });
});

// POST /api/workspace/set — 切换工作区
router.post('/workspace/set', (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: '请提供工作区路径' } });
  }

  const resolved = path.resolve(dirPath);

  // 验证路径是否存在且是目录
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: { code: 'NOT_A_DIRECTORY', message: '路径不是一个目录' } });
    }
  } catch (err) {
    return res.status(400).json({ error: { code: 'PATH_NOT_FOUND', message: '目录不存在' } });
  }

  // 动态添加到 allowedDirs（运行时）
  if (!config.allowedDirs.includes(resolved)) {
    config.allowedDirs.push(resolved);
  }

  currentWorkspace = resolved;
  const history = addToHistory(resolved);

  auditLog.log({ user: req.user?.username, action: 'workspace_switch', detail: resolved });

  res.json({
    data: {
      current: resolved,
      history,
    },
  });
});

// GET /api/workspace/browse — 浏览目录结构（用于目录选择器）
router.get('/workspace/browse', (req, res) => {
  const dirPath = req.query.path || os.homedir();
  const resolved = path.resolve(dirPath);

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: { code: 'NOT_A_DIRECTORY', message: '不是目录' } });
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        path: path.join(resolved, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 计算父目录
    const parentPath = path.dirname(resolved);
    const isRoot = resolved === parentPath;

    res.json({
      data: {
        current: resolved,
        parent: isRoot ? null : parentPath,
        directories: dirs,
      },
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'FS_ERROR', message: err.message } });
  }
});

// DELETE /api/workspace/history — 删除历史记录中的某条
router.delete('/workspace/history', (req, res) => {
  const { path: dirPath } = req.body;
  let history = loadHistory();
  history = history.filter(h => h.path !== dirPath);
  saveHistory(history);
  res.json({ data: { history } });
});

// POST /api/workspace/pin — 置顶某个工作区
router.post('/workspace/pin', (req, res) => {
  const { path: dirPath } = req.body;
  let history = loadHistory();
  const idx = history.findIndex(h => h.path === dirPath);
  if (idx > 0) {
    const [item] = history.splice(idx, 1);
    item.pinned = true;
    history.unshift(item);
    saveHistory(history);
  }
  res.json({ data: { history } });
});

// GET /api/workspace/tree — 获取当前工作区的文件树（懒加载）
router.get('/workspace/tree', (req, res) => {
  const dirPath = req.query.path || currentWorkspace;
  const resolved = path.resolve(dirPath);

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: { code: 'NOT_A_DIRECTORY', message: '不是目录' } });
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => {
        const fullPath = path.join(resolved, e.name);
        const isDir = e.isDirectory();
        const info = { name: e.name, path: fullPath, type: isDir ? 'directory' : 'file' };
        if (!isDir) {
          try {
            info.size = fs.statSync(fullPath).size;
          } catch (err) {}
          info.extension = path.extname(e.name).slice(1);
        }
        return info;
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

module.exports = router;
