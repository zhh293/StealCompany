const fs = require('fs');
const path = require('path');

// Claude Code 会话文件存储在 ~/.claude/projects/ 下
const CLAUDE_DIR = path.join(process.env.HOME || '', '.claude', 'projects');

/**
 * 扫描项目目录下的 .jsonl 会话文件，返回会话列表
 * @param {string} [workDir] - 可选，按工作目录过滤。不传则返回所有会话
 */
function getSessions(workDir) {
  const sessions = [];

  if (!fs.existsSync(CLAUDE_DIR)) return sessions;

  const projectDirs = fs.readdirSync(CLAUDE_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const dir of projectDirs) {
    const dirPath = path.join(CLAUDE_DIR, dir.name);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const sessionId = path.basename(file, '.jsonl');

      try {
        const stat = fs.statSync(filePath);
        const firstLines = readFirstLines(filePath, 10);
        let title = '未命名会话';
        let cwd = '';

        for (const line of firstLines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            // 提取标题
            if (!title || title === '未命名会话') {
              if (obj.type === 'queue-operation' && obj.operation === 'enqueue' && obj.content) {
                title = obj.content.slice(0, 50);
              } else if (obj.type === 'user' && obj.message?.content) {
                const content = typeof obj.message.content === 'string'
                  ? obj.message.content : '';
                if (content) title = content.slice(0, 50);
              }
            }
            // 提取 cwd
            if (!cwd && obj.cwd) {
              cwd = obj.cwd;
            }
            // 两者都找到了就退出
            if (title !== '未命名会话' && cwd) break;
          } catch (e) { /* skip parse errors */ }
        }

        // 如果指定了 workDir 过滤，只返回匹配的会话
        if (workDir && cwd && cwd !== workDir) {
          continue;
        }

        sessions.push({
          sessionId,
          title,
          cwd: cwd || '未知',
          projectDir: dir.name,
          timestamp: stat.mtimeMs,
          size: stat.size,
        });
      } catch (e) {
        // skip unreadable files
      }
    }
  }

  // 按修改时间倒序
  sessions.sort((a, b) => b.timestamp - a.timestamp);
  return sessions;
}

/**
 * 读取指定会话的消息记录
 */
function getMessages(sessionId) {
  const filePath = findSessionFile(sessionId);
  if (!filePath) {
    throw new Error(`会话 ${sessionId} 不存在`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const messages = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);

      if (obj.type === 'user' && obj.message) {
        const text = typeof obj.message.content === 'string'
          ? obj.message.content
          : extractTextFromContent(obj.message.content);
        messages.push({
          role: 'user',
          content: text,
          timestamp: obj.timestamp,
        });
      } else if (obj.type === 'assistant' && obj.message) {
        const blocks = obj.message.content || [];
        let text = '';
        const tools = [];

        for (const block of blocks) {
          if (block.type === 'text') {
            text += block.text;
          } else if (block.type === 'tool_use') {
            tools.push({ name: block.name, input: block.input });
          }
        }

        if (text || tools.length > 0) {
          messages.push({
            role: 'assistant',
            content: text,
            tools,
            timestamp: obj.timestamp,
          });
        }
      } else if (obj.type === 'result') {
        messages.push({
          role: 'system',
          type: 'result',
          cost: obj.total_cost_usd || 0,
          duration: obj.duration_ms || 0,
          timestamp: obj.timestamp,
        });
      }
    } catch (e) {
      // skip unparseable lines
    }
  }

  return messages;
}

/**
 * 在所有项目目录中查找会话文件
 */
function findSessionFile(sessionId) {
  if (!fs.existsSync(CLAUDE_DIR)) return null;

  const projectDirs = fs.readdirSync(CLAUDE_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const dir of projectDirs) {
    const filePath = path.join(CLAUDE_DIR, dir.name, `${sessionId}.jsonl`);
    if (fs.existsSync(filePath)) return filePath;
  }

  return null;
}

/**
 * 读取文件前 N 行
 */
function readFirstLines(filePath, n) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(4096);
  const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
  fs.closeSync(fd);
  const text = buf.toString('utf-8', 0, bytesRead);
  return text.split('\n').slice(0, n);
}

/**
 * 从 content 数组中提取文本
 */
function extractTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
  }
  return '';
}

module.exports = {
  getSessions,
  getMessages,
  findSessionFile,
};
