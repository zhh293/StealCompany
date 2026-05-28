# CatDesk Remote Console

远程 AI 开发工作站 — 在浏览器中管理项目、对话 Claude、操作终端和文件。配合内网穿透可从任何地方访问。

## 功能

- **AI 对话** — 调用 Claude Code CLI 进行流式对话，支持 Markdown + LaTeX 数学公式渲染（KaTeX）
- **远程终端** — 基于 xterm.js + node-pty 的完整终端模拟器，支持多 Tab、自动 resize
- **文件浏览** — 远程浏览和预览服务端文件，代码文件自动语法高亮，面包屑导航
- **工作区切换** — 快速切换项目目录，支持多盘符（Windows D:\ E:\ 等）
- **会话管理** — 同步 Claude 历史对话，支持多会话切换
- **状态面板** — 实时查看系统资源（CPU/内存/运行时间）和会话列表

## 技术栈

后端：Node.js + Express 5 + Socket.IO + node-pty + JWT 认证

前端：原生 JS（无构建步骤）+ xterm.js + marked + highlight.js + DOMPurify + KaTeX

## 快速开始

### 前置要求

- **Node.js** >= 18
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`

### 安装

```bash
# 克隆仓库
git clone https://github.com/zhh293/StealCompany.git
cd StealCompany

# 一键配置（自动安装依赖、生成 .env 配置）
# macOS / Linux:
npm run setup

# Windows:
npm run setup-win
```

### 创建用户

```bash
node scripts/create-user.js
```

按提示输入用户名和密码。密码哈希会写入 `.env`。

### 启动

```bash
npm start
# 开发模式（代码修改自动重启）:
npm run dev
```

打开浏览器访问 `http://localhost:3000`。

## 配置

所有配置通过项目根目录下的 `.env` 文件管理。运行 `npm run setup` 或 `npm run setup-win` 会自动生成。

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `JWT_SECRET` | JWT 签名密钥（自动生成） | — |
| `JWT_EXPIRES_IN` | Token 有效期 | `24h` |
| `AUTH_USERNAME` | 登录用户名 | `admin` |
| `AUTH_PASSWORD_HASH` | 密码哈希（通过 `create-user.js` 生成） | — |
| `ALLOWED_DIRS` | 工作目录白名单（逗号分隔） | 用户主目录 |
| `DEFAULT_WORKSPACE` | 默认工作目录 | 用户主目录 |
| `CLAUDE_CODE_PATH` | Claude Code CLI 路径 | `claude` |
| `RATE_LIMIT_WINDOW_MS` | 限流窗口（毫秒） | `60000` |
| `RATE_LIMIT_MAX` | 窗口内最大请求数 | `100` |
| `TERMINAL_IDLE_TIMEOUT` | 终端空闲超时（毫秒） | `600000` |

### 配置示例

**Windows:**

```ini
ALLOWED_DIRS=C:\Users\你的用户名\Desktop,C:\Users\你的用户名\Documents,D:\,E:\
DEFAULT_WORKSPACE=C:\Users\你的用户名\Desktop
CLAUDE_CODE_PATH=claude
```

**macOS / Linux:**

```ini
ALLOWED_DIRS=/home/你的用户名/Desktop,/home/你的用户名/Documents
DEFAULT_WORKSPACE=/home/你的用户名/Desktop
CLAUDE_CODE_PATH=claude
```

## 跨平台支持

本项目支持 Windows、macOS 和 Linux：

| 特性 | Windows | macOS | Linux |
|------|---------|-------|-------|
| Shell | cmd.exe | zsh | bash |
| 路径分隔符 | `\` / `;` | `/` / `:` | `/` / `:` |
| 主目录检测 | `os.homedir()` | `os.homedir()` | `os.homedir()` |
| 一键配置脚本 | `npm run setup-win` | `npm run setup` | `npm run setup` |
| 多盘符支持 | D:\ E:\ 等 | — | — |

## 项目结构

```
├── client/                 # 前端
│   ├── index.html         # 入口页面（SPA）
│   ├── login.html         # 登录页
│   ├── css/               # 样式
│   │   └── main.css       # 暗色主题 + KaTeX 数学样式
│   └── js/                # 前端模块
│       ├── app.js         # 路由与导航
│       ├── auth.js        # 前端认证
│       ├── chat.js        # AI 对话（KaTeX 数学渲染）
│       ├── terminal.js    # Web 终端
│       ├── files.js       # 文件管理（跨平台面包屑）
│       ├── workspace.js   # 工作区切换
│       ├── dashboard.js   # 状态面板
│       └── utils/storage.js # localStorage 封装
├── server/                 # 后端
│   ├── index.js           # Express + Socket.IO 入口
│   ├── config.js          # 配置读取（跨平台路径）
│   ├── middleware/        # JWT 认证、API 限流
│   │   ├── auth.js
│   │   └── rateLimiter.js
│   ├── routes/            # REST API
│   │   ├── auth.js        # 登录/刷新 token
│   │   ├── sessions.js    # 会话列表
│   │   ├── files.js       # 文件操作
│   │   ├── settings.js    # 配置接口
│   │   ├── workspace.js   # 工作区接口
│   │   ├── audit.js       # 审计日志
│   │   └── usage.js       # 用量统计
│   ├── services/          # 核心服务
│   │   ├── claudeCode.js  # Claude CLI 流式调用（跨平台 PATH）
│   │   ├── catdesk.js     # 会话管理
│   │   ├── auditLog.js    # 审计日志
│   │   └── systemInfo.js  # 系统信息采集
│   └── websocket/         # WebSocket 处理
│       ├── index.js       # 命名空间注册
│       ├── chatHandler.js # /chat 对话
│       ├── terminalHandler.js # /terminal 终端（跨平台 shell）
│       └── statusHandler.js   # /status 状态轮询
├── scripts/                # 工具脚本
│   ├── setup.js           # 通用初始化
│   ├── setup-win.js       # Windows 一键配置
│   └── create-user.js     # 用户创建
├── .env.example            # 配置模板
└── package.json
```

## 内网穿透配置（ZeroNews）

使用 ZeroNews 将本地 3000 端口暴露到公网，从而在任何设备上通过浏览器访问。

### 安装（macOS Apple 芯片）

```bash
mkdir -p /Applications/zeronews
cd /Applications/zeronews
curl -o zeronews.tmp https://download.zeronews.cc/macos/arm/zeronews
mv zeronews.tmp zeronews
chmod +x zeronews
```

Intel 芯片将下载地址中的 `arm` 替换为 `x86`。

### 认证 & 启动

```bash
cd /Applications/zeronews
./zeronews authtoken <YOUR_AUTH_TOKEN>
./zeronews add https --local_ip=127.0.0.1 --port=3000
./zeronews start -d
```

执行后会返回公网 URL，例如 `https://xxxxx.hn.takin.cc`。

### 花生壳（备选方案）

1. 在花生壳管理面板添加一条 TCP 映射
2. 内网主机填 `127.0.0.1`，内网端口填 `3000`
3. 使用花生壳分配的外网域名和端口从外部访问

## 常见问题

### Q: 提示 `spawn claude ENOENT`

Claude Code CLI 未安装或不在 PATH 中：

```bash
npm install -g @anthropic-ai/claude-code
# 或在 .env 中指定完整路径:
# CLAUDE_CODE_PATH=C:\Users\你的用户名\.local\bin\claude.exe
```

### Q: 终端无法切换到 D 盘或其他盘符

确认 `.env` 的 `ALLOWED_DIRS` 包含目标盘符：

```ini
ALLOWED_DIRS=C:\Users\你的用户名\Desktop,D:\,E:\
```

### Q: LaTeX 公式不显示

确认网络可以访问 CDN（KaTeX 通过 jsDelivr 加载）。如需离线使用，可将 KaTeX 静态资源放入 `client/lib/` 并修改 `index.html` 中的引用。

### Q: 对话报「进程异常退出」

通常为 Claude CLI 路径或版本问题。在终端手动运行 `claude --version` 确认可用，然后检查 `.env` 中 `CLAUDE_CODE_PATH` 设置是否正确。

### Q: 连接被拒绝

检查防火墙是否放行端口 `3000`，以及 `.env` 中 `HOST=0.0.0.0`。

## 安全说明

- `.env` 包含敏感信息（JWT 密钥、密码哈希），已被 `.gitignore` 排除，**不会**提交到仓库
- `.env.example` 仅含模板占位符，无真实密钥
- 密码使用 bcrypt 哈希存储，不可逆
- 文件操作限制在 `ALLOWED_DIRS` 白名单目录内
- 支持 API 限流和审计日志

## License

MIT
