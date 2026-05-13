// 认证模块
const Auth = {
  getToken() {
    return Storage.getToken();
  },

  isAuthenticated() {
    const token = this.getToken();
    if (!token) return false;
    // 简单检查 JWT 是否过期
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  },

  logout() {
    Storage.clearAuth();
    window.location.href = '/login.html';
  },

  // API 请求封装
  async fetch(url, options = {}) {
    const token = this.getToken();
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (res.status === 401) {
      this.logout();
      throw new Error('认证已过期');
    }

    return res;
  },
};

// 启动时检查认证
if (!Auth.isAuthenticated()) {
  window.location.href = '/login.html';
}
