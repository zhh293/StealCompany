const ClaudeCodeSession = require('../services/claudeCode');

const activeSessions = new Map();

module.exports = function (nsp) {
  nsp.on('connection', (socket) => {
    console.log(`[Chat] 客户端连接: ${socket.id}`);

    socket.on('chat:send', ({ prompt, sessionId, workDir }) => {
      if (!prompt || !prompt.trim()) {
        socket.emit('chat:error', { message: '消息不能为空' });
        return;
      }

      // 如果有正在运行的进程，先停止
      const existing = activeSessions.get(socket.id);
      if (existing) {
        existing.stop();
        activeSessions.delete(socket.id);
      }

      const session = new ClaudeCodeSession({
        sessionId: sessionId || null,
        workDir: workDir || process.env.HOME,
      });
      activeSessions.set(socket.id, session);

      session.on('init', (data) => socket.emit('chat:init', data));
      session.on('thinking', (data) => socket.emit('chat:thinking', data));
      session.on('text', (data) => socket.emit('chat:text', data));
      session.on('tool_use', (data) => socket.emit('chat:tool', data));
      session.on('tool_result', (data) => socket.emit('chat:tool_result', data));

      session.on('result', (data) => {
        socket.emit('chat:done', data);
        activeSessions.delete(socket.id);
      });

      session.on('error', (data) => {
        socket.emit('chat:error', data);
      });

      session.on('close', ({ code }) => {
        if (code !== 0) {
          socket.emit('chat:error', { message: `进程异常退出 (code: ${code})` });
        }
        activeSessions.delete(socket.id);
      });

      session.send(prompt);
    });

    socket.on('chat:stop', () => {
      const session = activeSessions.get(socket.id);
      if (session) {
        session.stop();
        activeSessions.delete(socket.id);
        socket.emit('chat:stopped', {});
      }
    });

    socket.on('disconnect', () => {
      const session = activeSessions.get(socket.id);
      if (session) {
        session.stop();
        activeSessions.delete(socket.id);
      }
      console.log(`[Chat] 客户端断开: ${socket.id}`);
    });
  });
};
