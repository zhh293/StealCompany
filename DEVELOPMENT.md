# CatDesk Remote Console — 详细开发文档

## 一、项目概述

### 1.1 是什么

CatDesk Remote Console 是一个部署在本地的 Web 应用，通过花生壳内网穿透暴露到公网，让你在外地通过浏览器远程操控本机的 CatDesk / Claude Code 环境。它不是一个简单的"查看面板"，而是一个具备完整交互能力的远程 AI 开发工作站。

### 1.2 核心能力

- **AI 对话**：通过 Web 界面与 Claude Code 实时对话，支持流式打字机输出
- **会话管理**：查看所有历史会话，恢复任意会话继续对话
- **远程终端**：完整的 Web Terminal，等同于 SSH 到本机
- **文件浏览**：远程浏览/查看/编辑项目文件
- **系统状态**：实时展示 CatDesk 运行状态、会话状态

### 1.3 技术架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                       外地浏览器                              │
│   ┌──────────┬──────────┬──────────┬──────────────────┐     │
│   │  AI Chat │ Terminal │  Files   │  Sessions/Status │     │
│   └──────────┴──────────┴──────────┴──────────────────┘     │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS (WebSocket)
                    ┌────────┴────────┐
                    │    花生壳穿透     │
                    └────────┬────────┘
                             │ localhost:3000
┌────────────────────────────┴────────────────────────────────┐
│                    本地 Web Server                            │
│                  (Express + Socket.IO)                        │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │ mc --code   │  │ catdesk CLI  │  │ node-pty (shell) │    │
│  │ (AI 对话)    │  │ (会话/设置)   │  │ (远程终端)        │    │
│  └─────────────┘  └──────────────┘  └─────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、技术选型

| 层级 | 技术 | 选择理由 |
|------|------|----------|
| 运行时 | Node.js 24.x | 本机已安装，与 CatDesk 生态一致 |
| 后端框架 | Express 5 | 成熟稳定，中间件丰富 |
| 实时通信 | Socket.IO 4.x | WebSocket + 自动降级，房间/命名空间支持好 |
| 终端模拟 | node-pty + xterm.js | 业界标准的 Web Terminal 方案 |
| 前端 | 原生 HTML/JS + Tailwind CSS | 零构建依赖，打开即用 |
| Markdown渲染 | marked.js + highlight.js | AI 回答中的代码高亮 |
| 认证 | JWT + bcrypt | 无状态认证，安全可靠 |
| 进程管理 | PM2 | 守护进程，崩溃自动重启 |

---

## 三、详细功能模块设计

### 3.1 认证模块

#### 3.1.1 登录流程

```
[浏览器] → POST /api/auth/login { username, password }
         ← { token, expiresIn }
         
后续请求: Authorization: Bearer <token>
WebSocket: { auth: { token } }
```

#### 3.1.2 安全策略

- 密码使用 bcrypt 存储（salt rounds = 12）
- JWT 有效期 24 小时，支持刷新
- 连续 5 次登录失败锁定 15 分钟（基于 IP）
- 所有 API 和 WebSocket 连接均需认证
- 可选：TOTP 二次验证（推荐开启）

#### 3.1.3 配置方式

用户信息存储在 `.env` 文件中：

```env
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=$2b$12$xxxxx   # bcrypt hash
JWT_SECRET=your-random-secret-at-least-32-chars
```

首次运行时提供一个 CLI 工具生成密码 hash：

```bash
node scripts/create-user.js
# 交互式输入用户名和密码，输出 hash
```

---

### 3.2 AI 对话模块（核心）

#### 3.2.1 底层能力

经过实测验证，`mc --code` 支持以下关键模式：

```bash
# 单次问答（JSON 输出）
mc --code -p "你的问题" --output-format json
# 返回: { type: "result", result: "回答内容", session_id: "...", ... }

# 流式输出（需要 --verbose）
mc --code -p "你的问题" --output-format stream-json --verbose
# 逐行返回 JSON，包含 thinking、text、result 等事件

# 恢复会话继续对话
mc --code -p "继续的问题" --resume <session-id> --output-format json

# 指定工作目录（控制 AI 操作哪个项目）
cd /path/to/project && mc --code -p "..."
```

#### 3.2.2 流式输出数据格式

经实测，stream-json 输出的事件序列为：

```jsonc
// 1. 初始化事件
{ "type": "system", "subtype": "init", "session_id": "...", "tools": [...], "model": "..." }

// 2. AI 思考过程（如果模型支持）
{ "type": "assistant", "message": { "content": [{ "type": "thinking", "thinking": "..." }] } }

// 3. AI 文本输出
{ "type": "assistant", "message": { "content": [{ "type": "text", "text": "回答内容" }] } }

// 4. 工具调用（如果 AI 需要读写文件等）
{ "type": "assistant", "message": { "content": [{ "type": "tool_use", "name": "Read", "input": {...} }] } }

// 5. 完成事件
{ "type": "result", "subtype": "success", "result": "最终回答", "session_id": "...", "total_cost_usd": 0.xx }
```

#### 3.2.3 前端交互设计

**对话界面布局**：

```
┌─────────────────────────────────────────┐
│ ☰  CatDesk Remote    [会话名称]  [设置] │  ← 顶栏
├────────────┬────────────────────────────┤
│            │                            │
│  会话列表   │     消息流区域              │
│            │                            │
│  ● 当前会话 │  [User] 帮我写个排序       │
│  ○ 历史1   │                            │
│  ○ 历史2   │  [AI] 好的，我来写一个      │
│  ○ 历史3   │  快速排序的实现：           │
│            │  ```python                 │
│            │  def quicksort(arr):       │
│            │      ...                   │
│            │  ```                       │
│            │                            │
│  [新建会话] │  [思考中... ◼ 停止]         │
│            │                            │
├────────────┴────────────────────────────┤
│  📎 [输入你的问题...]           [发送 ⏎] │  ← 输入区
│  工作目录: ~/Desktop/project  [切换 ▾]  │
└─────────────────────────────────────────┘
```

**交互细节**：

- 消息流式渲染：收到 `text` 事件后逐步追加到当前气泡，模拟打字机效果
- 思考折叠：AI 的 thinking 内容默认折叠，点击展开查看推理过程
- 工具调用展示：当 AI 调用 Read/Write/Bash 等工具时，展示一个可展开的卡片，显示工具名称和参数
- 代码块语法高亮：使用 highlight.js，支持复制按钮
- 停止生成：点击停止按钮时 kill 后端的 mc 子进程
- 历史会话恢复：点击左侧会话列表中的历史项，使用 `--resume` 恢复

**输入增强**：

- 支持 Shift+Enter 换行，Enter 发送
- 支持拖拽文件到输入框（上传到服务器后以路径形式嵌入 prompt）
- 工作目录选择器：AI 操作的上下文目录，影响文件读写的根路径
- 支持 `/` 斜杠命令（如 `/compact` 压缩上下文）

#### 3.2.4 后端 API 设计

```
WebSocket namespace: /chat

Events (Client → Server):
  chat:new        { workDir: string }                    → 创建新会话
  chat:send       { prompt: string, sessionId?: string, workDir: string }  → 发送消息
  chat:stop       { sessionId: string }                  → 停止生成
  chat:list       {}                                     → 列出所有历史会话

Events (Server → Client):
  chat:init       { sessionId, model, tools }            → 会话初始化信息
  chat:thinking   { text }                               → AI 思考过程
  chat:text       { text }                               → AI 文本输出（增量）
  chat:tool       { name, input, result }                → 工具调用信息
  chat:done       { result, cost, duration }             → 生成完成
  chat:error      { message, code }                      → 错误信息
  chat:sessions   [{ id, title, time, status }]          → 会话列表
```

---

### 3.3 远程终端模块

#### 3.3.1 技术实现

使用 `node-pty` 在后端创建伪终端进程，通过 WebSocket 双向透传数据到前端的 `xterm.js` 终端模拟器。

#### 3.3.2 前端交互设计

```
┌─────────────────────────────────────────┐
│ Terminal  [+新建]  [Tab1] [Tab2]  [×]   │  ← 标签栏，支持多终端
├─────────────────────────────────────────┤
│ zhanghonghao@MBP ~ %                   │
│ $ cd ~/Desktop/project                  │
│ $ git status                            │
│ On branch main                          │
│ Changes not staged for commit:          │
│   modified:   src/app.js                │
│                                         │
│ $ mc --code -p "review this change"     │
│ ...                                     │
│                                         │
│ █                                       │  ← 光标闪烁
└─────────────────────────────────────────┘
```

**交互特性**：

- 多标签页：支持同时开多个终端会话
- 终端尺寸自适应：跟随浏览器窗口 resize，自动同步 pty 的 rows/cols
- 主题切换：暗色/亮色终端主题
- 快捷键透传：Ctrl+C、Ctrl+D 等信号正确传递
- 复制粘贴：选中自动复制，右键/Ctrl+V 粘贴
- 搜索：Ctrl+F 在终端输出中搜索
- 会话保持：断线重连后恢复终端内容（利用 xterm 的 scrollback buffer）

#### 3.3.3 后端 API 设计

```
WebSocket namespace: /terminal

Events (Client → Server):
  terminal:create   { cols, rows, cwd? }     → 创建新终端
  terminal:input    { id, data }             → 键盘输入
  terminal:resize   { id, cols, rows }       → 窗口尺寸变化
  terminal:close    { id }                   → 关闭终端

Events (Server → Client):
  terminal:output   { id, data }             → 终端输出
  terminal:exit     { id, code }             → 进程退出
  terminal:created  { id }                   → 终端创建成功
```

#### 3.3.4 安全限制

- 最大同时终端数：5（防止资源耗尽）
- 空闲超时：30 分钟无操作自动关闭
- 可配置禁止命令列表（如 `rm -rf /`）

---

### 3.4 文件浏览模块

#### 3.4.1 前端交互设计

```
┌─────────────────────────────────────────────────────┐
│ Files    路径: ~/Desktop/project/src  [↑上级] [刷新] │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│  📁 components/      │  // app.js                   │
│  📁 utils/           │  import React from 'react';  │
│  📄 app.js      ←    │  import { Router } from ...  │
│  📄 index.js         │                              │
│  📄 style.css        │  function App() {            │
│                      │    return (                   │
│                      │      <div>...</div>           │
│                      │    );                         │
│                      │  }                            │
│                      │                              │
│                      │  [编辑] [下载] [在终端打开]    │
└──────────────────────┴──────────────────────────────┘
```

**交互特性**：

- 左侧文件树 + 右侧预览/编辑
- 代码文件：语法高亮预览，支持简单编辑（Monaco Editor 或 CodeMirror）
- 图片文件：直接预览
- 大文件：只加载前 1000 行，支持分页加载
- 面包屑导航：点击路径中的任意层级快速跳转
- 右键菜单：新建文件/文件夹、重命名、删除（带确认）
- 拖拽上传：将本地文件拖入浏览器上传到远程目录

#### 3.4.2 REST API 设计

```
GET    /api/files/list?path=<dir>              → 列出目录内容
GET    /api/files/read?path=<file>&offset=0&limit=1000  → 读取文件内容
PUT    /api/files/write                        → 写入文件 { path, content }
POST   /api/files/mkdir                        → 创建目录 { path }
DELETE /api/files/delete                       → 删除文件 { path }（单个文件）
POST   /api/files/upload                       → multipart 文件上传
GET    /api/files/download?path=<file>         → 文件下载
```

#### 3.4.3 安全限制

- 根目录白名单：只允许访问指定的目录列表（如 `~/Desktop`、`~/Documents`）
- 敏感文件过滤：隐藏 `.env`、密钥文件等（可配置）
- 文件大小限制：上传最大 50MB，读取最大 10MB
- 写操作确认：前端需二次确认

---

### 3.5 会话/状态面板

#### 3.5.1 前端交互设计

```
┌─────────────────────────────────────────────────────┐
│ Dashboard                              [刷新] [设置] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ 系统状态 ─────────────────────────────────────┐ │
│  │ CatDesk: ● 运行中    Node: v24.14.1            │ │
│  │ 活跃会话: 2          内存: 1.2GB / 16GB        │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ 活跃会话 ─────────────────────────────────────┐ │
│  │                                                 │ │
│  │  ● Java后端技术日报自动化抓取方案    running     │ │
│  │    项目: ~/Desktop/newproject                   │ │
│  │    时间: 2026-05-13 10:33                      │ │
│  │    [打开对话] [在终端恢复]                       │ │
│  │                                                 │ │
│  │  ● 新对话                            running    │ │
│  │    项目: ~/Desktop/花生壳远程操控CatDesk         │ │
│  │    时间: 2026-05-13 16:31                      │ │
│  │    [打开对话] [在终端恢复]                       │ │
│  │                                                 │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ 历史会话 ─────────────────────────────────────┐ │
│  │  ✓ Java后端技术日报...     success   05-12     │ │
│  │  ✓ Hotring详解...          success   05-01     │ │
│  │  ✗ 空标题                  error     04-27     │ │
│  │  ...                       [查看全部 →]         │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

#### 3.5.2 数据来源

```bash
# 会话列表
catdesk session list
# → JSON 数组，包含 sessionId, conversationId, title, status, projectPath, timestamp

# 当前会话
catdesk session current
# → 当前活跃会话信息

# 查询消息历史
catdesk query messages -c <conversationId>
# → 对话消息列表

# 查询状态
catdesk query status -c <conversationId>
# → 会话运行状态
```

#### 3.5.3 实时更新机制

后端每 5 秒轮询 `catdesk session list`，对比上次结果，有变化时通过 WebSocket 推送：

```
WebSocket namespace: /status

Events (Server → Client):
  status:sessions   [{ ... }]       → 会话列表更新
  status:system     { cpu, mem, ... } → 系统资源信息
```

---

## 四、前端整体布局与导航

### 4.1 布局结构

采用左侧导航 + 右侧内容区的经典布局：

```
┌──┬──────────────────────────────────────────┐
│  │                                          │
│💬│          当前模块内容区                    │
│  │                                          │
│🖥│                                          │
│  │                                          │
│📁│                                          │
│  │                                          │
│📊│                                          │
│  │                                          │
│⚙│                                          │
│  │                                          │
└──┴──────────────────────────────────────────┘

图标说明：
💬 AI Chat（对话）
🖥 Terminal（终端）
📁 Files（文件）
📊 Dashboard（状态面板）
⚙ Settings（设置）
```

### 4.2 响应式设计

- **桌面端 (>1024px)**：左侧导航栏 + 右侧内容区并排
- **平板端 (768-1024px)**：导航栏收缩为图标，内容区占满
- **手机端 (<768px)**：底部 Tab 导航，内容区全屏（终端模块在手机上提供虚拟键盘辅助键）

### 4.3 主题

- 支持暗色/亮色切换
- 默认跟随系统 `prefers-color-scheme`
- 暗色主题色调参考 VS Code Dark+

---

## 五、项目文件结构

```
花生壳远程操控CatDesk/
│
├── server/                          # 后端
│   ├── index.js                     # 入口：Express + Socket.IO 初始化
│   ├── config.js                    # 配置加载（读取 .env）
│   │
│   ├── middleware/
│   │   ├── auth.js                  # JWT 认证中间件
│   │   └── rateLimiter.js           # 请求限流
│   │
│   ├── routes/
│   │   ├── auth.js                  # POST /api/auth/login, /api/auth/refresh
│   │   ├── files.js                 # 文件浏览 CRUD API
│   │   ├── sessions.js              # GET /api/sessions
│   │   └── settings.js              # GET/PUT /api/settings
│   │
│   ├── services/
│   │   ├── catdesk.js               # catdesk CLI 调用封装
│   │   ├── claudeCode.js            # mc --code 调用封装（核心）
│   │   └── systemInfo.js            # 系统信息采集
│   │
│   └── websocket/
│       ├── index.js                 # Socket.IO 命名空间注册
│       ├── chatHandler.js           # /chat 命名空间处理
│       ├── terminalHandler.js       # /terminal 命名空间处理
│       └── statusHandler.js         # /status 命名空间处理
│
├── client/                          # 前端（纯静态文件）
│   ├── index.html                   # SPA 入口
│   ├── login.html                   # 登录页
│   │
│   ├── css/
│   │   ├── main.css                 # 主样式
│   │   └── themes/
│   │       ├── dark.css             # 暗色主题变量
│   │       └── light.css            # 亮色主题变量
│   │
│   ├── js/
│   │   ├── app.js                   # 应用入口、路由、状态管理
│   │   ├── auth.js                  # 登录/token 管理
│   │   ├── chat.js                  # AI 对话模块
│   │   ├── terminal.js              # 远程终端模块
│   │   ├── files.js                 # 文件浏览模块
│   │   ├── dashboard.js             # 状态面板模块
│   │   ├── settings.js              # 设置模块
│   │   └── utils/
│   │       ├── markdown.js          # Markdown 渲染
│   │       ├── socket.js            # Socket.IO 客户端封装
│   │       └── storage.js           # localStorage 封装
│   │
│   └── vendor/                      # 第三方库（CDN 备份）
│       ├── socket.io.min.js
│       ├── marked.min.js
│       ├── highlight.min.js
│       └── xterm/
│           ├── xterm.min.js
│           ├── xterm.css
│           └── xterm-addon-fit.min.js
│
├── scripts/
│   ├── create-user.js               # 创建用户/生成密码 hash
│   └── setup.js                     # 首次运行初始化脚本
│
├── package.json
├── .env.example                     # 环境变量模板
├── .gitignore
├── ecosystem.config.js              # PM2 配置
└── DEVELOPMENT.md                   # 本文件
```

---

## 六、核心代码实现指南

### 6.1 后端入口 (server/index.js)

```javascript
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const config = require('./config');
const authMiddleware = require('./middleware/auth');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },  // 花生壳穿透后域名可能不同
  maxHttpBufferSize: 1e7,  // 10MB，支持大文件传输
});

// 静态文件服务
app.use(express.static(path.join(__dirname, '../client')));
app.use(express.json({ limit: '10mb' }));

// API 路由（需认证）
app.use('/api/auth', require('./routes/auth'));
app.use('/api', authMiddleware, require('./routes/files'));
app.use('/api', authMiddleware, require('./routes/sessions'));
app.use('/api', authMiddleware, require('./routes/settings'));

// WebSocket 认证
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  // 验证 JWT...
  next();
});

// 注册 WebSocket 命名空间
require('./websocket')(io);

httpServer.listen(config.port, '0.0.0.0', () => {
  console.log(`CatDesk Remote Console running on port ${config.port}`);
});
```

### 6.2 Claude Code 服务封装 (server/services/claudeCode.js)

```javascript
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class ClaudeCodeSession extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sessionId = options.sessionId || null;
    this.workDir = options.workDir || process.env.HOME;
    this.process = null;
  }

  /**
   * 发送消息并流式接收回答
   */
  send(prompt) {
    const args = ['--code', '-p', prompt, '--output-format', 'stream-json', '--verbose'];

    if (this.sessionId) {
      args.push('--resume', this.sessionId);
    }

    this.process = spawn('mc', args, {
      cwd: this.workDir,
      env: { ...process.env },
    });

    let buffer = '';

    this.process.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      // 按行分割，逐行解析 JSON
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留最后一个不完整行

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          this._handleEvent(event);
        } catch (e) {
          // 非 JSON 行，忽略
        }
      }
    });

    this.process.stderr.on('data', (chunk) => {
      this.emit('error', { message: chunk.toString() });
    });

    this.process.on('close', (code) => {
      // 处理 buffer 中剩余内容
      if (buffer.trim()) {
        try {
          this._handleEvent(JSON.parse(buffer));
        } catch (e) {}
      }
      this.emit('close', { code });
    });
  }

  /**
   * 解析并转发事件
   */
  _handleEvent(event) {
    switch (event.type) {
      case 'system':
        if (event.subtype === 'init') {
          this.sessionId = event.session_id;
          this.emit('init', {
            sessionId: event.session_id,
            model: event.model,
            tools: event.tools,
          });
        }
        break;

      case 'assistant':
        if (event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'thinking') {
              this.emit('thinking', { text: block.thinking });
            } else if (block.type === 'text') {
              this.emit('text', { text: block.text });
            } else if (block.type === 'tool_use') {
              this.emit('tool_use', { name: block.name, input: block.input });
            }
          }
        }
        break;

      case 'result':
        this.emit('result', {
          success: event.subtype === 'success',
          result: event.result,
          cost: event.total_cost_usd,
          duration: event.duration_ms,
          sessionId: event.session_id,
        });
        break;
    }
  }

  /**
   * 停止当前生成
   */
  stop() {
    if (this.process) {
      this.process.kill('SIGINT');
    }
  }
}

module.exports = ClaudeCodeSession;
```

### 6.3 Chat WebSocket 处理 (server/websocket/chatHandler.js)

```javascript
const ClaudeCodeSession = require('../services/claudeCode');

// 存储每个用户的活跃 AI 会话
const activeSessions = new Map();

module.exports = function (io) {
  const chatNsp = io.of('/chat');

  chatNsp.on('connection', (socket) => {

    // 发送消息
    socket.on('chat:send', ({ prompt, sessionId, workDir }) => {
      // 如果有正在运行的进程，先停止
      const existing = activeSessions.get(socket.id);
      if (existing) existing.stop();

      const session = new ClaudeCodeSession({ sessionId, workDir });
      activeSessions.set(socket.id, session);

      session.on('init', (data) => socket.emit('chat:init', data));
      session.on('thinking', (data) => socket.emit('chat:thinking', data));
      session.on('text', (data) => socket.emit('chat:text', data));
      session.on('tool_use', (data) => socket.emit('chat:tool', data));
      session.on('result', (data) => {
        socket.emit('chat:done', data);
        activeSessions.delete(socket.id);
      });
      session.on('error', (data) => socket.emit('chat:error', data));

      session.send(prompt);
    });

    // 停止生成
    socket.on('chat:stop', () => {
      const session = activeSessions.get(socket.id);
      if (session) {
        session.stop();
        activeSessions.delete(socket.id);
      }
    });

    // 断开连接时清理
    socket.on('disconnect', () => {
      const session = activeSessions.get(socket.id);
      if (session) {
        session.stop();
        activeSessions.delete(socket.id);
      }
    });
  });
};
```

### 6.4 终端 WebSocket 处理 (server/websocket/terminalHandler.js)

```javascript
const pty = require('node-pty');

const MAX_TERMINALS = 5;

module.exports = function (io) {
  const termNsp = io.of('/terminal');

  termNsp.on('connection', (socket) => {
    const terminals = new Map();

    socket.on('terminal:create', ({ cols, rows, cwd }) => {
      if (terminals.size >= MAX_TERMINALS) {
        socket.emit('terminal:error', { message: '终端数量已达上限' });
        return;
      }

      const id = Date.now().toString(36);
      const shell = pty.spawn('/bin/zsh', [], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: cwd || process.env.HOME,
        env: process.env,
      });

      terminals.set(id, shell);

      shell.onData((data) => {
        socket.emit('terminal:output', { id, data });
      });

      shell.onExit(({ exitCode }) => {
        socket.emit('terminal:exit', { id, code: exitCode });
        terminals.delete(id);
      });

      socket.emit('terminal:created', { id });
    });

    socket.on('terminal:input', ({ id, data }) => {
      const shell = terminals.get(id);
      if (shell) shell.write(data);
    });

    socket.on('terminal:resize', ({ id, cols, rows }) => {
      const shell = terminals.get(id);
      if (shell) shell.resize(cols, rows);
    });

    socket.on('terminal:close', ({ id }) => {
      const shell = terminals.get(id);
      if (shell) {
        shell.kill();
        terminals.delete(id);
      }
    });

    socket.on('disconnect', () => {
      // 清理所有终端
      for (const [, shell] of terminals) {
        shell.kill();
      }
      terminals.clear();
    });
  });
};
```

---

## 七、前端关键实现

### 7.1 AI 对话模块 (client/js/chat.js) 核心逻辑

```javascript
class ChatModule {
  constructor() {
    this.socket = io('/chat', { auth: { token: Auth.getToken() } });
    this.currentSessionId = null;
    this.messageContainer = document.getElementById('messages');
    this.currentBubble = null;

    this._bindEvents();
  }

  _bindEvents() {
    // 流式文本 —— 逐步追加到当前气泡
    this.socket.on('chat:text', ({ text }) => {
      if (!this.currentBubble) {
        this.currentBubble = this._createBubble('assistant');
      }
      this.currentBubble.appendText(text);
      this._scrollToBottom();
    });

    // 思考过程 —— 折叠展示
    this.socket.on('chat:thinking', ({ text }) => {
      if (!this.currentBubble) {
        this.currentBubble = this._createBubble('assistant');
      }
      this.currentBubble.setThinking(text);
    });

    // 工具调用 —— 卡片展示
    this.socket.on('chat:tool', ({ name, input }) => {
      if (!this.currentBubble) {
        this.currentBubble = this._createBubble('assistant');
      }
      this.currentBubble.addToolCall(name, input);
    });

    // 完成
    this.socket.on('chat:done', ({ result, cost, duration, sessionId }) => {
      this.currentSessionId = sessionId;
      this.currentBubble.finalize(cost, duration);
      this.currentBubble = null;
      this._setInputEnabled(true);
    });

    // 初始化
    this.socket.on('chat:init', ({ sessionId, model }) => {
      this.currentSessionId = sessionId;
      this._showStatus(`模型: ${model}`);
    });

    // 错误
    this.socket.on('chat:error', ({ message }) => {
      this._showError(message);
      this._setInputEnabled(true);
    });
  }

  send(prompt) {
    // 显示用户消息气泡
    this._createBubble('user').setText(prompt);
    this._setInputEnabled(false);
    this._showGenerating();

    this.socket.emit('chat:send', {
      prompt,
      sessionId: this.currentSessionId,
      workDir: this._getWorkDir(),
    });
  }

  stop() {
    this.socket.emit('chat:stop');
    this._setInputEnabled(true);
  }

  resume(sessionId) {
    this.currentSessionId = sessionId;
    // UI 提示已恢复会话
  }
}
```

### 7.2 消息气泡渲染

```javascript
class MessageBubble {
  constructor(role) {
    this.role = role;
    this.element = document.createElement('div');
    this.element.className = `message message-${role}`;
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'message-content';
    this.element.appendChild(this.contentEl);
    this.rawText = '';
  }

  appendText(text) {
    this.rawText += text;
    // 使用 marked.js 渲染 Markdown，highlight.js 高亮代码
    this.contentEl.innerHTML = marked.parse(this.rawText);
    // 对新出现的代码块应用高亮
    this.contentEl.querySelectorAll('pre code:not(.hljs)').forEach(block => {
      hljs.highlightElement(block);
    });
  }

  setThinking(text) {
    let thinkingEl = this.element.querySelector('.thinking-block');
    if (!thinkingEl) {
      thinkingEl = document.createElement('details');
      thinkingEl.className = 'thinking-block';
      thinkingEl.innerHTML = '<summary>💭 思考过程</summary><pre class="thinking-content"></pre>';
      this.element.insertBefore(thinkingEl, this.contentEl);
    }
    thinkingEl.querySelector('.thinking-content').textContent = text;
  }

  addToolCall(name, input) {
    const toolEl = document.createElement('div');
    toolEl.className = 'tool-call';
    toolEl.innerHTML = `
      <details>
        <summary>🔧 ${name}</summary>
        <pre>${JSON.stringify(input, null, 2)}</pre>
      </details>
    `;
    this.contentEl.appendChild(toolEl);
  }

  finalize(cost, duration) {
    const metaEl = document.createElement('div');
    metaEl.className = 'message-meta';
    metaEl.textContent = `⏱ ${(duration / 1000).toFixed(1)}s · 💰 $${cost.toFixed(4)}`;
    this.element.appendChild(metaEl);
  }
}
```

### 7.3 终端模块 (client/js/terminal.js) 核心逻辑

```javascript
class TerminalModule {
  constructor() {
    this.socket = io('/terminal', { auth: { token: Auth.getToken() } });
    this.terminals = new Map(); // id → { term, fitAddon }
    this._bindEvents();
  }

  createTerminal(containerId, cwd) {
    const container = document.getElementById(containerId);
    const term = new Terminal({
      theme: this._getTheme(),
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      cursorBlink: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    const { cols, rows } = term;
    this.socket.emit('terminal:create', { cols, rows, cwd });

    this.socket.once('terminal:created', ({ id }) => {
      this.terminals.set(id, { term, fitAddon });

      // 键盘输入 → 后端
      term.onData((data) => {
        this.socket.emit('terminal:input', { id, data });
      });

      // 窗口 resize
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        this.socket.emit('terminal:resize', { id, cols: term.cols, rows: term.rows });
      });
      resizeObserver.observe(container);
    });
  }

  _bindEvents() {
    // 后端输出 → 终端
    this.socket.on('terminal:output', ({ id, data }) => {
      const entry = this.terminals.get(id);
      if (entry) entry.term.write(data);
    });

    // 进程退出
    this.socket.on('terminal:exit', ({ id, code }) => {
      const entry = this.terminals.get(id);
      if (entry) {
        entry.term.writeln(`\r\n[Process exited with code ${code}]`);
      }
    });
  }
}
```

---

## 八、交互体验优化细节

### 8.1 流式渲染的平滑感

AI 回答的流式渲染不要每收到一个 token 就重新渲染整个 Markdown，而是：

1. 累积原始文本到 `rawText`
2. 使用 `requestAnimationFrame` 节流渲染（每 50ms 最多渲染一次）
3. 代码块只有在"关闭"（检测到 ` ``` ` 结束标记）后才做语法高亮
4. 滚动行为：新内容到达时，只在用户没有手动上滚的情况下自动滚到底部

```javascript
// 节流渲染示例
let renderScheduled = false;
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    doRender();
    renderScheduled = false;
  });
}
```

### 8.2 断线重连

WebSocket 断线后的处理策略：

- Socket.IO 自带重连机制（指数退避，最大延迟 5s）
- 重连成功后自动重新认证
- 终端模块：重连后如果后端 pty 进程仍在，恢复连接；如果已断，提示用户重新创建
- 对话模块：重连后恢复 sessionId，下次发消息自动用 `--resume` 续接

### 8.3 移动端适配

- 终端模块在移动端提供辅助键栏（Tab、Ctrl、Esc、方向键）
- 对话输入框固定在底部，软键盘弹出时不遮挡
- 文件浏览器在移动端用全屏抽屉式导航替代左右分栏

### 8.4 通知/提醒

- AI 生成完成时，如果浏览器标签不在焦点，发送 Notification API 通知
- 长时间生成显示进度条（基于 token 消耗估算）
- 错误/断线用 toast 提示，不阻断操作

### 8.5 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+Enter | 发送消息（对话模块） |
| Ctrl+K | 新建对话 |
| Ctrl+` | 切换到终端 |
| Ctrl+B | 切换侧边栏 |
| Ctrl+P | 快速跳转文件 |
| Esc | 停止 AI 生成 |

---

## 九、安全加固清单

| 项目 | 措施 |
|------|------|
| 传输加密 | 花生壳开启 HTTPS |
| 认证 | JWT + 登录限流 + 可选 TOTP |
| 输入校验 | 所有 API 参数做类型和范围检查 |
| 路径穿越防护 | 文件 API 使用 `path.resolve` 后校验是否在白名单目录内 |
| 命令注入防护 | 不拼接用户输入为 shell 命令，使用 spawn 的数组参数形式 |
| XSS 防护 | Markdown 渲染使用 DOMPurify 消毒 |
| 资源限制 | 终端数量、文件大小、请求频率均设上限 |
| 日志审计 | 记录所有操作到本地日志文件 |

---

## 十、依赖清单 (package.json)

```json
{
  "name": "catdesk-remote-console",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node server/index.js",
    "dev": "nodemon server/index.js",
    "setup": "node scripts/setup.js",
    "create-user": "node scripts/create-user.js"
  },
  "dependencies": {
    "express": "^5.0.0",
    "socket.io": "^4.8.0",
    "node-pty": "^1.0.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "dotenv": "^16.4.0",
    "helmet": "^8.0.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.4.0",
    "multer": "^1.4.5-lts.1"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```

前端第三方库通过 CDN 引入（vendor/ 目录下保留离线备份）：

- socket.io-client 4.x
- xterm.js 5.x + fit-addon
- marked.js 15.x
- highlight.js 11.x
- DOMPurify 3.x
- Tailwind CSS (CDN play 模式，或预编译)

---

## 十一、部署与运行

### 11.1 首次安装

```bash
cd ~/Desktop/花生壳远程操控CatDesk
npm install
npm run setup        # 交互式配置（端口、密码等）
npm run create-user  # 创建登录账号
```

### 11.2 开发模式

```bash
npm run dev
# 自动重启，访问 http://localhost:3000
```

### 11.3 生产模式 (PM2)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 开机自启
```

`ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'catdesk-remote',
    script: 'server/index.js',
    env: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '500M',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
  }],
};
```

### 11.4 花生壳配置

1. 在花生壳客户端添加映射：内网地址 `127.0.0.1:3000`，协议选 HTTPS
2. 获取分配的公网域名（如 `xxxxx.oicp.net`）
3. 在 `.env` 中设置 `PUBLIC_URL=https://xxxxx.oicp.net`
4. 外网访问该域名即可打开控制台

---

## 十二、开发路线图

### Phase 1 — MVP（预计 2-3 天）

- [x] 项目骨架搭建
- [ ] 认证系统（登录页 + JWT）
- [ ] AI 对话核心功能（发消息 + 流式回答）
- [ ] 基础 UI 框架（导航 + 对话界面）

### Phase 2 — 完善交互（预计 2-3 天）

- [ ] 远程终端（xterm.js + node-pty）
- [ ] 会话列表 + 恢复历史会话
- [ ] 工具调用展示
- [ ] 思考过程折叠
- [ ] 暗色/亮色主题

### Phase 3 — 文件管理（预计 1-2 天）

- [ ] 文件浏览器（目录树 + 文件预览）
- [ ] 代码编辑（CodeMirror 轻量编辑器）
- [ ] 文件上传/下载

### Phase 4 — 打磨体验（预计 1-2 天）

- [ ] 移动端适配
- [ ] 通知系统
- [ ] 快捷键支持
- [ ] 断线重连优化
- [ ] 安全加固（TOTP、日志审计）

---

## 十三、注意事项与已知限制

1. **mc --code 的 stream-json 模式需要 --verbose 标志**，否则会报错。
2. **会话恢复使用 session_id**（`mc --code` 返回的 `session_id`），而非 CatDesk 的 `conversationId`。两者是不同的系统。
3. **node-pty 需要编译原生模块**，安装时需要 Xcode Command Line Tools（`xcode-select --install`）。
4. **花生壳免费版有带宽限制**（通常 1Mbps），终端和对话文本流量很小没问题，但文件传输可能较慢。
5. **mc 命令需要事先登录**（`mc` 首次运行会要求登录），Web Server 启动后使用同一用户的登录状态。
6. **并发对话**：`mc --code -p` 支持同时运行多个实例，但要注意同时操作同一个项目文件可能冲突。
