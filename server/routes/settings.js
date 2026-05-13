const express = require('express');
const catdesk = require('../services/catdesk');
const config = require('../config');
const fs = require('fs');
const path = require('path');

const router = express.Router();

router.get('/settings', (req, res) => {
  try {
    res.json({ data: { allowedDirs: config.allowedDirs, defaultWorkspace: config.defaultWorkspace } });
  } catch (err) {
    res.status(500).json({ error: { code: 'SETTINGS_ERROR', message: err.message } });
  }
});

router.get('/settings/workspace-dirs', (req, res) => {
  // 从配置的白名单 + 历史会话文件中的 cwd 字段合并出完整的工作区列表
  const dirs = new Set(config.allowedDirs);

  // 从 ~/.claude/projects/ 下的 .jsonl 文件中提取真实 cwd 路径
  const claudeProjectsDir = path.join(process.env.HOME || '', '.claude', 'projects');
  try {
    if (fs.existsSync(claudeProjectsDir)) {
      const projectDirs = fs.readdirSync(claudeProjectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const dir of projectDirs) {
        const dirPath = path.join(claudeProjectsDir, dir.name);
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));

        // 取每个项目目录下的第一个 .jsonl 文件，读取 cwd
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
                // 验证目录存在
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
  } catch (e) {
    // 静默忽略
  }

  // 按路径排序
  const sortedDirs = [...dirs].sort();

  res.json({
    data: {
      allowedDirs: sortedDirs,
      defaultWorkspace: config.defaultWorkspace,
    }
  });
});

module.exports = router;
