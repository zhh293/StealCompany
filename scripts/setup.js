#!/usr/bin/env node
// 初始设置脚本
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

function main() {
  console.log('\n=== CatDesk Remote - 初始设置 ===\n');

  // 1. 生成 .env 文件
  const envPath = path.join(ROOT, '.env');
  const envExamplePath = path.join(ROOT, '.env.example');

  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      let content = fs.readFileSync(envExamplePath, 'utf-8');
      // 生成随机 JWT_SECRET
      const secret = crypto.randomBytes(32).toString('hex');
      content = content.replace(/JWT_SECRET=.*/, `JWT_SECRET=${secret}`);
      fs.writeFileSync(envPath, content);
      console.log('[OK] .env 文件已生成（JWT密钥已随机生成）');
    } else {
      const secret = crypto.randomBytes(32).toString('hex');
      const home = os.homedir();
      const desktop = path.join(home, 'Desktop');
      const documents = path.join(home, 'Documents');
      const envContent = `# CatDesk Remote Console 配置
PORT=3000
HOST=0.0.0.0
JWT_SECRET=${secret}
JWT_EXPIRES_IN=24h
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=

# 工作目录白名单（逗号分隔）
ALLOWED_DIRS=${desktop},${documents}
DEFAULT_WORKSPACE=${desktop}

# Claude Code CLI 路径（确保 claude 命令在 PATH 中）
CLAUDE_CODE_PATH=claude

# 安全配置
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
TERMINAL_IDLE_TIMEOUT=600000
`;
      fs.writeFileSync(envPath, envContent);
      console.log('[OK] .env 文件已生成');
    }
  } else {
    console.log('[SKIP] .env 文件已存在');
  }

  // 2. 确保目录结构
  const dirs = ['logs'];
  for (const dir of dirs) {
    const dirPath = path.join(ROOT, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`[OK] 创建目录: ${dir}/`);
    }
  }

  console.log('\n设置完成！接下来请运行:');
  console.log('  node scripts/create-user.js   # 创建登录用户');
  console.log('  npm start                     # 启动服务\n');
}

main();
