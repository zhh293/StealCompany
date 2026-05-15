// 终端命令黑名单防护
// 危险命令列表 — 阻止可能造成不可逆损害的操作

const BLOCKED_PATTERNS = [
  // 危险的删除操作
  /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\//,  // rm -rf /xxx
  /rm\s+-[a-zA-Z]*r[a-zA-Z]*\s+-[a-zA-Z]*f[a-zA-Z]*\s+\//,          // rm -r -f /xxx
  /rm\s+(-[a-zA-Z]*)?\s*\/($|\s)/,                                    // rm / 或 rm -rf /
  // 格式化/清空磁盘
  /mkfs\./,
  /dd\s+.*of=\/dev\//,
  // fork 炸弹
  /:\(\)\{\s*:\|:&\s*\};:/,
  /\.\/bomb/,
  // 系统关机/重启
  /shutdown/,
  /reboot/,
  /init\s+[06]/,
  /halt/,
  // 覆盖系统文件
  />\s*\/etc\//,
  />\s*\/System\//,
  />\s*\/usr\//,
  // 权限滥用
  /chmod\s+(-[a-zA-Z]+\s+)?777\s+\//,
  /chown\s+.*\s+\//,
  // 网络攻击工具
  /nmap\s/,
  /hydra\s/,
  /sqlmap/,
];

// 高风险命令 — 允许执行但会标记为 warning
const WARNING_PATTERNS = [
  /sudo\s/,
  /rm\s+-[a-zA-Z]*r/,
  /kill\s+-9/,
  /killall/,
  /pkill/,
  /curl\s+.*\|\s*(ba)?sh/,  // curl | sh 管道
  /wget\s+.*\|\s*(ba)?sh/,
];

/**
 * 检查命令是否应被阻止
 * @param {string} cmd - 命令字符串
 * @returns {{ blocked: boolean, warning: boolean, reason: string }}
 */
function check(cmd) {
  const trimmed = cmd.trim();

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        blocked: true,
        warning: false,
        reason: `命令被安全策略阻止: 匹配危险模式 ${pattern.toString()}`,
      };
    }
  }

  for (const pattern of WARNING_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        blocked: false,
        warning: true,
        reason: `高风险命令: ${trimmed.slice(0, 50)}`,
      };
    }
  }

  return { blocked: false, warning: false, reason: '' };
}

module.exports = { check, BLOCKED_PATTERNS, WARNING_PATTERNS };
