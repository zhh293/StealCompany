// 权限模式持久化管理
const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS_FILE = path.join(os.homedir(), '.catdesk-permission-settings.json');

const DEFAULTS = {
  permissionMode: 'auto', // 'auto' | 'manual'
};

function load() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      return { ...DEFAULTS, ...data };
    }
  } catch (e) {}
  return { ...DEFAULTS };
}

function save(settings) {
  try {
    const current = load();
    const merged = { ...current, ...settings };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  } catch (e) {
    return load();
  }
}

function getPermissionMode() {
  return load().permissionMode;
}

function setPermissionMode(mode) {
  if (!['auto', 'manual'].includes(mode)) {
    throw new Error('permissionMode 必须是 "auto" 或 "manual"');
  }
  return save({ permissionMode: mode });
}

module.exports = { load, save, getPermissionMode, setPermissionMode };
