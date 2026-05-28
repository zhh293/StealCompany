const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const { authMiddleware } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimiter');
const auditLog = require('./services/auditLog');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e7,
  // Socket 消息压缩
  perMessageDeflate: {
    threshold: 1024, // 仅压缩超过 1KB 的消息
    zlibDeflateOptions: { chunkSize: 16 * 1024 },
    zlibInflateOptions: { chunkSize: 16 * 1024 },
  },
  // 心跳保活
  pingInterval: 10000,
  pingTimeout: 5000,
});

// 安全头部（允许 CDN 加载）
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());

// 静态文件服务
app.use(express.static(path.join(__dirname, '../client')));
app.use(express.json({ limit: '10mb' }));

// API 限流
app.use('/api', apiLimiter);

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api', authMiddleware, require('./routes/sessions'));
app.use('/api', authMiddleware, require('./routes/files'));
app.use('/api', authMiddleware, require('./routes/settings'));
app.use('/api', authMiddleware, require('./routes/workspace'));

// 审计日志路由
app.use('/api', authMiddleware, require('./routes/audit'));

// 用量统计路由
app.use('/api', authMiddleware, require('./routes/usage'));

// SPA fallback (Express 5 需要命名通配符)
app.get('{*path}', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: '接口不存在' } });
  }
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// WebSocket
require('./websocket')(io);

// 启动
httpServer.listen(config.port, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║         CatDesk Remote Console v1.0.0           ║');
  console.log('  ╠══════════════════════════════════════════════════╣');
  console.log(`  ║  Local:  http://localhost:${config.port}                  ║`);
  console.log(`  ║  Public: ${config.publicUrl.padEnd(39)}║`);
  console.log(`  ║  CLI:    ${(process.env.CLAUDE_CODE_PATH || 'claude').padEnd(39)}║`);
  console.log(`  ║  Dirs:   ${config.allowedDirs.length.toString().padEnd(39)}║`);
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
});
