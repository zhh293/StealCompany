const { spawn, execSync } = require('child_process');
const config = require('../config');
const path = require('path');
const fs = require('fs');
const auditLog = require('../services/auditLog');
const commandGuard = require('../services/commandGuard');

// 基于命令执行的终端模拟
module.exports = function (nsp) {
  nsp.on('connection', (socket) => {
    const terminals = new Map(); // id -> { cwd, proc, history, inputBuffer }
    const user = socket.user?.username || 'unknown';
    console.log(`[Terminal] 客户端连接: ${socket.id} (${user})`);

    socket.on('terminal:create', ({ cols, rows, cwd }) => {
      if (terminals.size >= config.terminal.maxTerminals) {
        socket.emit('terminal:error', { message: `终端数量已达上限 (${config.terminal.maxTerminals})` });
        return;
      }

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const workDir = cwd || config.defaultWorkspace;

      terminals.set(id, { cwd: workDir, proc: null, inputBuffer: '', history: [], lastActivity: Date.now() });
      socket.emit('terminal:created', { id });

      // 发送初始提示符
      const prompt = `\x1b[1;36m${workDir.replace(process.env.HOME, '~')}\x1b[0m \x1b[1;33m$\x1b[0m `;
      socket.emit('terminal:output', { id, data: prompt });

      auditLog.log({ user, action: 'terminal_create', detail: `创建终端 cwd=${workDir}` });
    });

    socket.on('terminal:input', ({ id, data }) => {
      const entry = terminals.get(id);
      if (!entry) return;
      entry.lastActivity = Date.now();

      // 如果有正在运行的进程，把输入传给它
      if (entry.proc && entry.proc.stdin && entry.proc.stdin.writable) {
        entry.proc.stdin.write(data);
        return;
      }

      // 处理键盘输入（逐字符）
      for (const char of data) {
        if (char === '\r' || char === '\n') {
          // 回车 - 执行命令
          socket.emit('terminal:output', { id, data: '\r\n' });
          const cmd = entry.inputBuffer.trim();
          entry.inputBuffer = '';

          if (cmd) {
            // 命令安全检查
            const guard = commandGuard.check(cmd);
            if (guard.blocked) {
              socket.emit('terminal:output', { id, data: `\x1b[1;31m⛔ ${guard.reason}\x1b[0m\r\n` });
              auditLog.log({ user, action: 'terminal_cmd', detail: cmd, result: 'blocked' });
              sendPrompt(socket, id, entry);
            } else {
              if (guard.warning) {
                socket.emit('terminal:output', { id, data: `\x1b[1;33m⚠️  ${guard.reason}\x1b[0m\r\n` });
              }
              auditLog.log({ user, action: 'terminal_cmd', detail: cmd, result: guard.warning ? 'warning' : 'success' });
              entry.history.push(cmd);
              executeCommand(socket, id, entry, cmd);
            }
          } else {
            sendPrompt(socket, id, entry);
          }
        } else if (char === '\x7f' || char === '\b') {
          // 退格
          if (entry.inputBuffer.length > 0) {
            entry.inputBuffer = entry.inputBuffer.slice(0, -1);
            socket.emit('terminal:output', { id, data: '\b \b' });
          }
        } else if (char === '\x03') {
          // Ctrl+C
          if (entry.proc) {
            entry.proc.kill('SIGINT');
            entry.proc = null;
          }
          entry.inputBuffer = '';
          socket.emit('terminal:output', { id, data: '^C\r\n' });
          sendPrompt(socket, id, entry);
        } else if (char === '\x04') {
          // Ctrl+D
          if (entry.inputBuffer.length === 0) {
            socket.emit('terminal:exit', { id, code: 0 });
            terminals.delete(id);
          }
        } else if (char === '\t') {
          // Tab 补全
          handleTabCompletion(socket, id, entry);
        } else if (char.charCodeAt(0) >= 32) {
          // 可打印字符
          entry.inputBuffer += char;
          socket.emit('terminal:output', { id, data: char });
        }
      }
    });

    socket.on('terminal:resize', ({ id, cols, rows }) => {
      // 记录尺寸，无实际 pty 不需操作
    });

    socket.on('terminal:close', ({ id }) => {
      const entry = terminals.get(id);
      if (entry && entry.proc) {
        entry.proc.kill('SIGTERM');
      }
      terminals.delete(id);
    });

    // 空闲检测
    const idleCheck = setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of terminals) {
        if (entry.lastActivity && now - entry.lastActivity > config.terminal.idleTimeout) {
          if (entry.proc) entry.proc.kill('SIGTERM');
          terminals.delete(id);
          socket.emit('terminal:exit', { id, code: -1, reason: 'idle_timeout' });
        }
      }
    }, 60 * 1000);

    socket.on('disconnect', () => {
      clearInterval(idleCheck);
      for (const [, entry] of terminals) {
        if (entry.proc) entry.proc.kill('SIGTERM');
      }
      terminals.clear();
      console.log(`[Terminal] 客户端断开: ${socket.id}`);
    });
  });
};

function sendPrompt(socket, id, entry) {
  const short = entry.cwd.replace(process.env.HOME, '~');
  const prompt = `\x1b[1;36m${short}\x1b[0m \x1b[1;33m$\x1b[0m `;
  socket.emit('terminal:output', { id, data: prompt });
}

function handleTabCompletion(socket, id, entry) {
  const input = entry.inputBuffer;
  if (!input) return;

  // 获取最后一个 token 作为补全目标
  const parts = input.split(/\s+/);
  const partial = parts[parts.length - 1] || '';

  if (!partial) return;

  try {
    // 解析路径
    const expandedPartial = partial.replace(/^~/, process.env.HOME);
    const dir = path.dirname(path.resolve(entry.cwd, expandedPartial));
    const basename = path.basename(expandedPartial);

    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir);
    const matches = entries.filter(e => e.startsWith(basename));

    if (matches.length === 0) {
      // 无匹配，响铃
      socket.emit('terminal:output', { id, data: '\x07' });
    } else if (matches.length === 1) {
      // 唯一匹配 - 自动补全
      const completion = matches[0].slice(basename.length);
      const fullPath = path.join(dir, matches[0]);
      const suffix = fs.statSync(fullPath).isDirectory() ? '/' : ' ';
      const append = completion + suffix;
      entry.inputBuffer += append;
      socket.emit('terminal:output', { id, data: append });
    } else {
      // 多个匹配 - 显示选项
      const commonPrefix = getCommonPrefix(matches);
      if (commonPrefix.length > basename.length) {
        // 补全公共前缀
        const append = commonPrefix.slice(basename.length);
        entry.inputBuffer += append;
        socket.emit('terminal:output', { id, data: append });
      } else {
        // 显示所有候选
        const display = matches.map(m => {
          const fullPath = path.join(dir, m);
          try {
            return fs.statSync(fullPath).isDirectory() ? `\x1b[1;34m${m}/\x1b[0m` : m;
          } catch { return m; }
        }).join('  ');
        socket.emit('terminal:output', { id, data: `\r\n${display}\r\n` });
        // 重新显示当前输入
        const short = entry.cwd.replace(process.env.HOME, '~');
        const prompt = `\x1b[1;36m${short}\x1b[0m \x1b[1;33m$\x1b[0m ${entry.inputBuffer}`;
        socket.emit('terminal:output', { id, data: prompt });
      }
    }
  } catch (err) {
    // 补全失败静默处理
  }
}

function getCommonPrefix(strings) {
  if (strings.length === 0) return '';
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function executeCommand(socket, id, entry, cmd) {
  // 处理 cd 命令
  if (cmd.startsWith('cd ')) {
    const target = cmd.slice(3).trim().replace(/^~/, process.env.HOME);
    const newDir = path.resolve(entry.cwd, target);
    if (fs.existsSync(newDir) && fs.statSync(newDir).isDirectory()) {
      entry.cwd = newDir;
    } else {
      socket.emit('terminal:output', { id, data: `cd: no such directory: ${target}\r\n` });
    }
    sendPrompt(socket, id, entry);
    socket.emit('terminal:cmd_done', { id, cmd });
    return;
  }

  if (cmd === 'cd') {
    entry.cwd = process.env.HOME;
    sendPrompt(socket, id, entry);
    socket.emit('terminal:cmd_done', { id, cmd });
    return;
  }

  // 处理 clear
  if (cmd === 'clear') {
    socket.emit('terminal:output', { id, data: '\x1b[2J\x1b[H' });
    sendPrompt(socket, id, entry);
    return;
  }

  // 执行其他命令
  const proc = spawn('/bin/zsh', ['-c', cmd], {
    cwd: entry.cwd,
    env: { ...process.env, TERM: 'xterm-256color', PATH: ['/usr/local/bin', '/opt/homebrew/bin', process.env.PATH].join(':') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  entry.proc = proc;

  proc.stdout.on('data', (data) => {
    // 将 \n 转换为 \r\n 以便 xterm 正确显示
    const text = data.toString().replace(/\n/g, '\r\n');
    socket.emit('terminal:output', { id, data: text });
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString().replace(/\n/g, '\r\n');
    socket.emit('terminal:output', { id, data: `\x1b[31m${text}\x1b[0m` });
  });

  proc.on('exit', (code) => {
    entry.proc = null;
    if (code !== 0 && code !== null) {
      socket.emit('terminal:output', { id, data: `\x1b[2m[exit: ${code}]\x1b[0m\r\n` });
    }
    sendPrompt(socket, id, entry);
    // 通知前端命令执行完毕（用于操作连贯性：文件刷新提示）
    socket.emit('terminal:cmd_done', { id, cmd });
  });

  proc.on('error', (err) => {
    entry.proc = null;
    socket.emit('terminal:output', { id, data: `\x1b[31mError: ${err.message}\x1b[0m\r\n` });
    sendPrompt(socket, id, entry);
  });
}
