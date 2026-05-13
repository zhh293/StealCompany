# CatDesk Remote Console

通过浏览器远程操控本地 CatDesk AI 助手的 Web 应用，配合花生壳内网穿透实现从任何地方访问。

## 功能

- **AI 对话** — 基于 `mc --code` CLI 的流式对话，支持 Markdown 渲染、代码高亮、思考过程展示、工具调用可视化、会话恢复
- **远程终端** — 基于 xterm.js + node-pty 的完整终端模拟器，支持多 Tab、自动 resize
- **文件浏览** — 远程浏览和预览服务端文件，代码文件自动语法高亮
- **状态面板** — 实时查看系统资源（CPU/内存/运行时间）和 CatDesk 会话列表

## 技术栈

后端：Node.js + Express 5 + Socket.IO + node-pty + JWT 认证

前端：原生 JS（无构建步骤）+ xterm.js + marked + highlight.js + DOMPurify

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 初始化配置（生成 .env 文件）
npm run setup

# 3. 创建登录用户
npm run create-user

# 4. 启动服务
npm start
```

启动后访问 `http://localhost:3000`，使用刚创建的账号登录。

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

### 认证设备

每个账户有唯一的 AuthToken，在 ZeroNews 控制台获取后执行（每台设备只需认证一次）：

```bash
cd /Applications/zeronews
./zeronews authtoken <YOUR_AUTH_TOKEN>
```

### 添加隧道

将本地 3000 端口映射为公网 HTTPS 地址：

```bash
./zeronews add https --local_ip=127.0.0.1 --port=3000
```

执行后会返回分配的公网 URL，例如 `https://xxxxx.hn.takin.cc`。

### 启动

```bash
# 前台运行（终端关闭后程序退出）
./zeronews start

# 或后台运行
./zeronews start -d
```

启动后即可通过公网 URL 访问 CatDesk Remote Console，使用创建的账号密码登录。

### 花生壳（备选方案）

如果使用花生壳而非 ZeroNews：

1. 在花生壳管理面板添加一条 TCP 映射
2. 内网主机填 `127.0.0.1`，内网端口填 `3000`
3. 使用花生壳分配的外网域名和端口从外部访问

## 项目结构

```
├── server/
│   ├── index.js              # Express + Socket.IO 入口
│   ├── config.js             # 环境变量配置
│   ├── middleware/
│   │   ├── auth.js           # JWT 认证中间件
│   │   └── rateLimiter.js    # 请求限流
│   ├── routes/
│   │   ├── auth.js           # 登录/刷新 token
│   │   ├── sessions.js       # CatDesk 会话列表
│   │   ├── files.js          # 文件浏览/读写
│   │   └── settings.js       # 配置接口
│   ├── services/
│   │   ├── claudeCode.js     # mc --code 流式调用封装
│   │   ├── catdesk.js        # catdesk CLI 封装
│   │   └── systemInfo.js     # 系统信息采集
│   └── websocket/
│       ├── index.js           # Socket.IO 命名空间注册
│       ├── chatHandler.js     # /chat 对话处理
│       ├── terminalHandler.js # /terminal 终端管理
│       └── statusHandler.js   # /status 状态轮询
├── client/
│   ├── index.html            # 主界面 SPA
│   ├── login.html            # 登录页
│   ├── css/main.css          # 暗色主题样式
│   └── js/
│       ├── utils/storage.js  # localStorage 封装
│       ├── auth.js           # 前端认证
│       ├── chat.js           # 对话模块
│       ├── terminal.js       # 终端模块
│       ├── files.js          # 文件浏览模块
│       ├── dashboard.js      # 状态面板模块
│       └── app.js            # 路由与导航
├── scripts/
│   ├── setup.js              # 初始化脚本
│   └── create-user.js        # 创建用户脚本
├── .env.example              # 环境变量模板
└── package.json
```

## 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 监听端口 | 3000 |
| HOST | 监听地址 | 0.0.0.0 |
| JWT_SECRET | JWT 签名密钥 | setup 时随机生成 |
| AUTH_USERNAME | 登录用户名 | admin |
| AUTH_PASSWORD_HASH | bcrypt 密码哈希 | create-user 生成 |
| ALLOWED_DIRS | 文件浏览白名单目录 | ~/Desktop,~/Documents |
| DEFAULT_WORKSPACE | 默认工作目录 | ~/Desktop |
| CLAUDE_CODE_PATH | mc CLI 路径 | mc |
| TERMINAL_IDLE_TIMEOUT | 终端空闲超时(ms) | 600000 |

## 安全注意事项

- 默认启用 JWT 认证，所有 API 和 WebSocket 连接都需要有效 token
- 文件操作限制在 ALLOWED_DIRS 白名单目录内
- 登录接口有独立限流（15 分钟内最多 5 次）
- 建议通过花生壳穿透时启用 HTTPS（花生壳付费版支持）
- 生产环境务必修改默认密码
