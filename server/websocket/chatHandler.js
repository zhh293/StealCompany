const ClaudeCodeSession = require('../services/claudeCode');
const auditLog = require('../services/auditLog');
const os = require('os');
const { recordUsage } = require('../routes/usage');
const { getPermissionMode } = require('../services/permissionSettings');

const activeSessions = new Map();

module.exports = function (nsp) {
  nsp.on('connection', (socket) => {
    const user = socket.user?.username || 'unknown';
    console.log(`[Chat] 客户端连接: ${socket.id} (${user})`);

    socket.on('chat:send', ({ prompt, sessionId, workDir, model }) => {
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

      const permissionMode = getPermissionMode();
      auditLog.log({ user, action: 'chat_send', detail: `model=${model || 'default'} mode=${permissionMode} prompt=${prompt.slice(0, 100)}` });

      const session = new ClaudeCodeSession({
        sessionId: sessionId || null,
        workDir: workDir || os.homedir(),
        model: model || null,
        permissionMode,
      });
      activeSessions.set(socket.id, session);

      session.on('init', (data) => socket.emit('chat:init', data));
      session.on('thinking_delta', (data) => socket.emit('chat:thinking_delta', data));
      session.on('text_delta', (data) => socket.emit('chat:text_delta', data));
      session.on('tool_use', (data) => socket.emit('chat:tool', data));
      session.on('tool_result', (data) => socket.emit('chat:tool_result', data));

      // 权限请求转发到前端
      session.on('permission_request', (data) => {
        socket.emit('chat:permission_request', data);
        auditLog.log({ user, action: 'permission_request', detail: `tool=${data.tool} desc=${(data.description || '').slice(0, 100)}` });
      });

      session.on('permission_timeout', (data) => {
        socket.emit('chat:permission_timeout', data);
        auditLog.log({ user, action: 'permission_timeout', detail: `id=${data.id}` });
      });

      session.on('result', (data) => {
        socket.emit('chat:done', data);
        activeSessions.delete(socket.id);

        try {
          recordUsage({
            model: model || 'default',
            cost: data.cost || 0,
            tokens: data.tokens || 0,
            duration: data.duration || 0,
          });
        } catch (err) {}
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

    // 前端发送权限确认响应
    socket.on('chat:permission_response', ({ requestId, allow }) => {
      const session = activeSessions.get(socket.id);
      if (session) {
        session.respondToPermission(requestId, allow);
        auditLog.log({ user, action: 'permission_response', detail: `id=${requestId} allow=${allow}` });
      }
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
