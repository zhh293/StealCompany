const pty = require('node-pty');
const config = require('../config');

module.exports = function (nsp) {
  nsp.on('connection', (socket) => {
    const terminals = new Map();
    console.log(`[Terminal] 客户端连接: ${socket.id}`);

    socket.on('terminal:create', ({ cols, rows, cwd }) => {
      if (terminals.size >= config.terminal.maxTerminals) {
        socket.emit('terminal:error', { message: `终端数量已达上限 (${config.terminal.maxTerminals})` });
        return;
      }

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const shell = pty.spawn('/bin/zsh', [], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: cwd || config.defaultWorkspace,
        env: { ...process.env, TERM: 'xterm-256color' },
      });

      terminals.set(id, { shell, lastActivity: Date.now() });

      shell.onData((data) => {
        const entry = terminals.get(id);
        if (entry) entry.lastActivity = Date.now();
        socket.emit('terminal:output', { id, data });
      });

      shell.onExit(({ exitCode }) => {
        socket.emit('terminal:exit', { id, code: exitCode });
        terminals.delete(id);
      });

      socket.emit('terminal:created', { id });
    });

    socket.on('terminal:input', ({ id, data }) => {
      const entry = terminals.get(id);
      if (entry) {
        entry.shell.write(data);
        entry.lastActivity = Date.now();
      }
    });

    socket.on('terminal:resize', ({ id, cols, rows }) => {
      const entry = terminals.get(id);
      if (entry && cols > 0 && rows > 0) {
        entry.shell.resize(cols, rows);
      }
    });

    socket.on('terminal:close', ({ id }) => {
      const entry = terminals.get(id);
      if (entry) {
        entry.shell.kill();
        terminals.delete(id);
      }
    });

    // 空闲检测
    const idleCheck = setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of terminals) {
        if (now - entry.lastActivity > config.terminal.idleTimeout) {
          entry.shell.kill();
          terminals.delete(id);
          socket.emit('terminal:exit', { id, code: -1, reason: 'idle_timeout' });
        }
      }
    }, 60 * 1000);

    socket.on('disconnect', () => {
      clearInterval(idleCheck);
      for (const [, entry] of terminals) {
        entry.shell.kill();
      }
      terminals.clear();
      console.log(`[Terminal] 客户端断开: ${socket.id}`);
    });
  });
};
