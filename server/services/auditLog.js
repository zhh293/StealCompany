// 操作审计日志服务
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
const AUDIT_FILE = path.join(LOG_DIR, 'audit.jsonl');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * 记录审计日志
 * @param {Object} entry
 * @param {string} entry.user - 用户名
 * @param {string} entry.action - 操作类型：terminal_cmd | chat_send | file_read | file_write | login | logout
 * @param {string} entry.detail - 操作详情
 * @param {string} [entry.ip] - IP 地址
 * @param {string} [entry.result] - success | blocked | error
 */
function log(entry) {
  const record = {
    timestamp: new Date().toISOString(),
    user: entry.user || 'unknown',
    action: entry.action,
    detail: entry.detail || '',
    ip: entry.ip || '',
    result: entry.result || 'success',
  };

  const line = JSON.stringify(record) + '\n';

  // 异步追加写入，不阻塞请求
  fs.appendFile(AUDIT_FILE, line, (err) => {
    if (err) console.error('[Audit] Write failed:', err.message);
  });
}

/**
 * 读取最近的审计日志
 * @param {number} limit - 返回条数
 * @returns {Array}
 */
function getRecent(limit = 100) {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const content = fs.readFileSync(AUDIT_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = { log, getRecent };
