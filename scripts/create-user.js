#!/usr/bin/env node
// 创建用户脚本
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('\n=== CatDesk Remote - 创建用户 ===\n');

  const username = await ask('用户名: ');
  const password = await ask('密码: ');

  if (!username || !password) {
    console.error('用户名和密码不能为空');
    process.exit(1);
  }

  const salt = await bcrypt.genSalt(12);
  const hash = await bcrypt.hash(password, salt);

  // 读取 .env 文件
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  // 更新或添加 AUTH_USERNAME 和 AUTH_PASSWORD_HASH
  const updateEnv = (content, key, value) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      return content.replace(regex, `${key}=${value}`);
    }
    return content + `\n${key}=${value}`;
  };

  envContent = updateEnv(envContent, 'AUTH_USERNAME', username);
  envContent = updateEnv(envContent, 'AUTH_PASSWORD_HASH', hash);

  fs.writeFileSync(envPath, envContent.trim() + '\n');

  console.log(`\n[OK] 用户 "${username}" 已创建`);
  console.log(`密码哈希已写入 .env 文件`);
  console.log(`\n你可以用以下凭据登录：`);
  console.log(`  用户名: ${username}`);
  console.log(`  密码: (你刚输入的密码)\n`);

  rl.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
