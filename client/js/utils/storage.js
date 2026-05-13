// localStorage 封装
const Storage = {
  get(key, defaultValue = null) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : defaultValue;
    } catch (e) {
      return localStorage.getItem(key) || defaultValue;
    }
  },

  set(key, value) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  },

  remove(key) {
    localStorage.removeItem(key);
  },

  getToken() {
    return localStorage.getItem('catdesk_token');
  },

  setToken(token) {
    localStorage.setItem('catdesk_token', token);
  },

  clearAuth() {
    localStorage.removeItem('catdesk_token');
    localStorage.removeItem('catdesk_username');
  },
};
