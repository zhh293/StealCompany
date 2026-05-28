#!/usr/bin/env node
/**
 * Windows 一键配置脚本
 * 运行: node scripts/setup-win.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const home = os.homedir();

console.log('');
console.log('  ╔══════════════════════════════════════════╗');
console.log('  ║   CatDesk Remote Console - Windows 配置  ║');
console.log('  ╚══════════════════════════════════════════╝');
console.log('');

// ─── 1. 检查 Node.js ───
console.log('[1/6] 检查 Node.js...');
try {
  const nodeVer = execSync('node --version', { encoding: 'utf-8' }).trim();
  console.log(`  ✓ Node.js ${nodeVer}`);
} catch {
  console.error('  ✗ 未找到 Node.js，请先安装: https://nodejs.org/');
  process.exit(1);
}

// ─── 2. 检查 Claude CLI ───
console.log('[2/6] 检查 Claude Code CLI...');
let claudePath = 'claude';
try {
  const claudeVer = execSync('claude --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  console.log(`  ✓ Claude CLI: ${claudeVer.split('\n')[0]}`);
} catch {
  const candidates = [
    path.join(home, '.local', 'bin', 'claude.exe'),
    path.join(home, '.local', 'bin', 'claude'),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (found) {
    claudePath = found;
    console.log(`  ✓ Claude CLI 找到: ${found}`);
  } else {
    console.warn('  ⚠ 未找到 claude 命令，请确保已安装 Claude Code CLI');
    console.warn('    安装: npm install -g @anthropic-ai/claude-code');
  }
}

// ─── 3. 生成 .env ───
console.log('[3/6] 生成 .env 配置...');
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  console.log('  → .env 已存在，跳过');
} else {
  const secret = crypto.randomBytes(32).toString('hex');
  const desktop = path.join(home, 'Desktop');
  const documents = path.join(home, 'Documents');
  const dirs = [desktop, documents].filter(d => {
    try { return fs.statSync(d).isDirectory(); } catch { return false; }
  });
  if (dirs.length === 0) dirs.push(home);

  const envContent = `# CatDesk Remote Console 配置（由 setup-win.js 自动生成）
PORT=3000
HOST=0.0.0.0
JWT_SECRET=${secret}
JWT_EXPIRES_IN=24h
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=

# 工作目录白名单
ALLOWED_DIRS=${dirs.join(',')}
DEFAULT_WORKSPACE=${dirs[0]}

# Claude Code CLI 路径
CLAUDE_CODE_PATH=${claudePath}

# 安全配置
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
TERMINAL_IDLE_TIMEOUT=600000
`;
  fs.writeFileSync(envPath, envContent);
  console.log(`  ✓ .env 已生成`);
  console.log(`    工作目录: ${dirs.join(', ')}`);
}

// ─── 4. 安装依赖 ───
console.log('[4/6] 安装 npm 依赖...');
if (fs.existsSync(path.join(ROOT, 'node_modules'))) {
  console.log('  → node_modules 已存在，跳过');
} else {
  try {
    execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
    console.log('  ✓ 依赖安装完成');
  } catch {
    console.error('  ✗ npm install 失败，请手动运行: npm install');
  }
}

// ─── 5. 创建日志目录 ───
console.log('[5/6] 创建日志目录...');
const logsDir = path.join(ROOT, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log('  ✓ logs/ 目录已创建');
} else {
  console.log('  → logs/ 已存在');
}

// ─── 6. 创建用户 ───
console.log('[6/6] 创建登录用户...');
const envContent = fs.readFileSync(envPath, 'utf-8');
const hashLine = envContent.split('\n').find(l => l.startsWith('AUTH_PASSWORD_HASH='));
if (hashLine && hashLine.replace('AUTH_PASSWORD_HASH=', '').trim() === '') {
  console.log('  → 尚未设置密码，请运行: node scripts/create-user.js');
} else {
  console.log('  → 用户已配置');
}

console.log('');
console.log('  ══════════════════════════════════════════');
console.log('  配置完成！接下来:');
console.log('');
console.log('  1. 如未创建用户:  node scripts/create-user.js');
console.log('  2. 启动服务:      npm start');
console.log('  3. 打开浏览器:    http://localhost:3000');
console.log('  ══════════════════════════════════════════');
console.log('');
