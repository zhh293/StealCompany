const { socketAuthMiddleware } = require('../middleware/auth');
const chatHandler = require('./chatHandler');
const terminalHandler = require('./terminalHandler');
const statusHandler = require('./statusHandler');

module.exports = function (io) {
  // 全局 Socket.IO 认证
  const chatNsp = io.of('/chat');
  const terminalNsp = io.of('/terminal');
  const statusNsp = io.of('/status');

  // 对所有命名空间应用认证
  chatNsp.use(socketAuthMiddleware);
  terminalNsp.use(socketAuthMiddleware);
  statusNsp.use(socketAuthMiddleware);

  // 注册处理器
  chatHandler(chatNsp);
  terminalHandler(terminalNsp);
  statusHandler(statusNsp);
};
