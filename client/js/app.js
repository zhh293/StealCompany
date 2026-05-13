// 主应用 - 路由与导航
const App = {
  currentView: 'chat',
  modules: {},

  init() {
    // 初始化各模块
    this.modules.chat = new ChatModule();
    this.modules.terminal = new TerminalModule();
    this.modules.files = new FilesModule();
    this.modules.dashboard = new DashboardModule();

    // 启动模块
    this.modules.chat.init();
    this.modules.terminal.init();
    this.modules.files.init();
    this.modules.dashboard.init();

    // 绑定导航
    this._bindNavigation();

    // 绑定顶部功能
    this._bindTopBar();

    // 默认视图
    this.switchView('chat');

    console.log('[App] CatDesk Remote Console initialized');
  },

  _bindNavigation() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchView(btn.dataset.view);
      });
    });
  },

  _bindTopBar() {
    // 退出登录
    document.getElementById('btnLogout').addEventListener('click', () => {
      Auth.logout();
    });
  },

  switchView(viewName) {
    this.currentView = viewName;

    // 更新导航高亮
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // 切换面板（HTML 中的 class 是 .view）
    document.querySelectorAll('.view').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });

    // 触发模块 onShow
    switch (viewName) {
      case 'terminal':
        this.modules.terminal.onShow();
        break;
      case 'files':
        this.modules.files.onShow();
        break;
      case 'dashboard':
        this.modules.dashboard.onShow();
        break;
    }
  },

  // 全局 Toast 通知
  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer') || this._createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  _createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
    return container;
  },
};

// 页面加载完毕后启动
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
