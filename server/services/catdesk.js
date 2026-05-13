const { execSync } = require('child_process');

function runCatdesk(args, options = {}) {
  try {
    const result = execSync(`catdesk ${args}`, {
      encoding: 'utf-8',
      timeout: options.timeout || 10000,
      cwd: options.cwd || process.env.HOME,
    });
    try {
      return JSON.parse(result);
    } catch {
      return result.trim();
    }
  } catch (err) {
    throw new Error(`catdesk 命令执行失败: ${err.message}`);
  }
}

module.exports = {
  getSessions() {
    return runCatdesk('session list');
  },

  getCurrentSession() {
    return runCatdesk('session current');
  },

  getMessages(conversationId) {
    return runCatdesk(`query messages -c ${conversationId}`);
  },

  getStatus(conversationId) {
    return runCatdesk(`query status -c ${conversationId}`);
  },

  getSettings() {
    return runCatdesk('settings list');
  },

  getSetting(key) {
    return runCatdesk(`settings get -k ${key}`);
  },

  setSetting(key, value) {
    return runCatdesk(`settings set -k ${key} --value "${value}"`);
  },
};
